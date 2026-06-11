import Foundation
import Network

private struct HostSession {
    var width: Int
    var height: Int
    var fps: Int
    var maxBandwidthKbps: Int
    var displayId: String
    var displayName: String
    var audioEnabled: Bool
    var audioVolume: Int
    var screenFramesEnabled: Bool
    var qualityPreset: String
    var jpegQuality: Double
}

private struct FileTransferState {
    var totalBytes: Int
    var receivedBytes: Int
    var fileCount: Int
}

private final class ClientContext {
    let connection: NWConnection
    var buffer = Data()
    var isWebSocketReady = false
    var isAuthenticated = false
    var session: HostSession?
    var frameId = 0
    var audioFrameId = 0
    var videoTimer: DispatchSourceTimer?
    var audioTimer: DispatchSourceTimer?
    var fileTransfers: [String: FileTransferState] = [:]
    var reportedVideoCaptureFallback = false
    var isVideoCaptureInFlight = false
    var droppedVideoFrames = 0

    init(connection: NWConnection) {
        self.connection = connection
    }
}

final class MacHostService {
    private let configuration: HostConfiguration
    private let permissions: MacPermissionCenter
    private let screenCapture: ScreenCaptureCoordinator
    private let inputInjector: InputEventInjector
    private let logger: HostLogger
    private let videoCaptureQueue = DispatchQueue(label: "lan-dual-control.mac-host.video-capture", qos: .userInteractive)

    private var listener: NWListener?
    private var activeConnections: [ObjectIdentifier: ClientContext] = [:]

    init(
        configuration: HostConfiguration,
        permissions: MacPermissionCenter,
        screenCapture: ScreenCaptureCoordinator,
        inputInjector: InputEventInjector,
        logger: HostLogger
    ) {
        self.configuration = configuration
        self.permissions = permissions
        self.screenCapture = screenCapture
        self.inputInjector = inputInjector
        self.logger = logger
    }

    func start() async throws {
        guard let port = NWEndpoint.Port(rawValue: configuration.port) else {
            throw HostServiceError.invalidPort(configuration.port)
        }

        let listener = try NWListener(using: .tcp, on: port)
        self.listener = listener

        listener.newConnectionHandler = { [weak self] connection in
            self?.accept(connection)
        }

        listener.stateUpdateHandler = { [weak self] state in
            self?.handleListenerState(state)
        }

        listener.start(queue: .main)
        do {
            try await screenCapture.prepare()
        } catch {
            logger.warn("ScreenCaptureKit 预检失败：\(error.localizedDescription)。先继续启动 WebSocket 骨架，真实采集等权限打开后再接入。")
        }
        logger.info("等待 Windows 控制端通过 WebSocket 连接...")
        while !Task.isCancelled {
            try await Task.sleep(nanoseconds: 3_600_000_000_000)
        }
    }

    private func accept(_ connection: NWConnection) {
        let context = ClientContext(connection: connection)
        activeConnections[ObjectIdentifier(connection)] = context
        logger.info("收到连接：\(connection.endpoint.debugDescription)")

        connection.stateUpdateHandler = { [weak self, weak context] state in
            guard let context else { return }
            self?.handleConnectionState(state, context: context)
        }

        connection.start(queue: .main)
        receiveNextChunk(from: context)
    }

    private func receiveNextChunk(from context: ClientContext) {
        context.connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self, weak context] data, _, isComplete, error in
            guard let self, let context else { return }

            if let error {
                self.logger.warn("连接读取失败：\(error.localizedDescription)")
                self.close(context)
                return
            }

            if let data, !data.isEmpty {
                context.buffer.append(data)
                if context.isWebSocketReady {
                    self.handleWebSocketFrames(context)
                } else {
                    self.handleHttpRequest(context)
                }
            }

            if isComplete {
                self.close(context)
            } else {
                self.receiveNextChunk(from: context)
            }
        }
    }

    private func handleHttpRequest(_ context: ClientContext) {
        let marker = Data("\r\n\r\n".utf8)
        guard let headerRange = context.buffer.range(of: marker),
              let headerText = String(data: context.buffer[..<headerRange.lowerBound], encoding: .utf8) else {
            return
        }

        let headerEnd = headerRange.upperBound
        let request = parseHttpRequest(headerText)
        context.buffer.removeSubrange(..<headerEnd)

        switch request.path {
        case "/discovery":
            sendDiscoveryResponse(request: request, to: context)
        default:
            if let key = request.headers["sec-websocket-key"],
               request.headers["upgrade"]?.lowercased() == "websocket" {
                sendWebSocketUpgradeResponse(key: key, to: context)
                context.isWebSocketReady = true
                if !context.buffer.isEmpty {
                    handleWebSocketFrames(context)
                }
            } else {
                sendPlainHttpResponse(to: context)
            }
        }
    }

    private func parseHttpRequest(_ text: String) -> (path: String, headers: [String: String]) {
        let lines = text.components(separatedBy: "\r\n")
        let requestParts = lines.first?.split(separator: " ") ?? []
        let path = requestParts.count >= 2 ? String(requestParts[1]).split(separator: "?").first.map(String.init) ?? "/" : "/"
        var headers: [String: String] = [:]

        for line in lines.dropFirst() {
            guard let separator = line.firstIndex(of: ":") else { continue }
            let key = line[..<separator].trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let value = line[line.index(after: separator)...].trimmingCharacters(in: .whitespacesAndNewlines)
            headers[key] = value
        }

        return (path, headers)
    }

    private func sendDiscoveryResponse(request: (path: String, headers: [String: String]), to context: ClientContext) {
        let advertisedHost = advertisedHost(from: request.headers["host"])
        let snapshot = permissions.snapshot()
        let screenFramesEnabled = shouldUseScreenFrames(snapshot)
        let body: [String: Any] = [
            "type": "lan_dual_discovery",
            "protocolVersion": 1,
            "deviceId": "mac-host-\(advertisedHost)-\(configuration.port)",
            "deviceName": "macOS 被控端",
            "platform": "macos",
            "role": "host",
            "host": advertisedHost,
            "port": Int(configuration.port),
            "controlPort": Int(configuration.port),
            "capabilities": [
                "video": true,
                "audio": true,
                "input": true,
                "inputMode": configuration.inputMode.rawValue,
                "clipboardText": true,
                "clipboardFile": true,
                "reverseControl": true,
                "mock": !screenFramesEnabled,
                "videoMode": configuration.videoMode.rawValue,
                "screenCapture": screenFramesEnabled,
                "capturePipeline": screenFramesEnabled ? "background-jpeg" : "mock-svg",
                "maxScreenFps": configuration.maxScreenFps,
                "displays": screenCapture.availableDisplays().map { $0.jsonObject },
            ],
            "permissions": [
                "screenRecording": snapshot.screenRecordingGranted,
                "accessibility": snapshot.accessibilityGranted,
                "inputMonitoring": snapshot.inputMonitoringGranted,
            ],
            "lastSeenAt": ISO8601DateFormatter().string(from: Date()),
        ]

        sendHttpJson(body, status: "200 OK", closeAfterSend: true, to: context)
    }

    private func advertisedHost(from hostHeader: String?) -> String {
        if configuration.host != "0.0.0.0" {
            return configuration.host
        }

        guard let hostHeader, !hostHeader.isEmpty else {
            return configuration.host
        }

        return hostHeader.split(separator: ":").first.map(String.init) ?? configuration.host
    }

    private func sendWebSocketUpgradeResponse(key: String, to context: ClientContext) {
        let acceptKey = WebSocketCodec.makeAcceptKey(key)
        let response = [
            "HTTP/1.1 101 Switching Protocols",
            "Upgrade: websocket",
            "Connection: Upgrade",
            "Sec-WebSocket-Accept: \(acceptKey)",
            "\r\n",
        ].joined(separator: "\r\n")

        context.connection.send(content: Data(response.utf8), completion: .contentProcessed { [weak self] error in
            if let error {
                self?.logger.warn("WebSocket 握手响应失败：\(error.localizedDescription)")
            }
        })
        logger.info("WebSocket 握手完成")
    }

    private func sendPlainHttpResponse(to context: ClientContext) {
        let body = "LAN dual control macOS host skeleton. Use WebSocket to connect.\n"
        sendHttpText(body, status: "200 OK", closeAfterSend: true, to: context)
    }

    private func sendHttpJson(_ object: [String: Any], status: String, closeAfterSend: Bool, to context: ClientContext) {
        guard JSONSerialization.isValidJSONObject(object),
              let body = try? JSONSerialization.data(withJSONObject: object) else {
            sendHttpText("JSON encode failed\n", status: "500 Internal Server Error", closeAfterSend: true, to: context)
            return
        }

        sendHttpBody(body, status: status, contentType: "application/json; charset=utf-8", closeAfterSend: closeAfterSend, to: context)
    }

    private func sendHttpText(_ text: String, status: String, closeAfterSend: Bool, to context: ClientContext) {
        sendHttpBody(Data(text.utf8), status: status, contentType: "text/plain; charset=utf-8", closeAfterSend: closeAfterSend, to: context)
    }

    private func sendHttpBody(_ body: Data, status: String, contentType: String, closeAfterSend: Bool, to context: ClientContext) {
        let headers = [
            "HTTP/1.1 \(status)",
            "Access-Control-Allow-Origin: *",
            "Access-Control-Allow-Methods: GET, OPTIONS",
            "Access-Control-Allow-Headers: Content-Type",
            "Content-Type: \(contentType)",
            "Content-Length: \(body.count)",
            "Connection: \(closeAfterSend ? "close" : "keep-alive")",
            "\r\n",
        ].joined(separator: "\r\n")

        var response = Data(headers.utf8)
        response.append(body)
        context.connection.send(content: response, completion: .contentProcessed { [weak self, weak context] _ in
            guard closeAfterSend, let context else { return }
            self?.close(context)
        })
    }

    private func handleWebSocketFrames(_ context: ClientContext) {
        let decoded = WebSocketCodec.decodeFrames(context.buffer)
        context.buffer = decoded.rest

        for frame in decoded.frames {
            switch frame {
            case .close:
                close(context)
            case .text(let text):
                handleWebSocketMessage(text, context: context)
            }
        }
    }

    private func handleWebSocketMessage(_ text: String, context: ClientContext) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data),
              let message = json as? [String: Any],
              let type = message["type"] as? String else {
            sendError(code: "LAN003", message: "macOS 被控端无法解析消息", to: context)
            return
        }

        switch type {
        case "hello":
            handleHello(message, to: context)
            return
        case "auth_request":
            handleAuth(message, to: context)
            return
        default:
            break
        }

        guard context.isAuthenticated else {
            sendAuthRequired(for: message, type: type, to: context)
            return
        }

        switch type {
        case "session_offer":
            handleSessionOffer(data, message: message, to: context)
        case "display_settings":
            handleDisplaySettings(message, to: context)
        case "audio_settings_update":
            handleAudioSettings(message, to: context)
        case "input_event":
            handleInputEvent(data, fallback: message, context: context)
        case "clipboard_text":
            handleClipboardText(message, to: context)
        case "clipboard_file_offer":
            handleClipboardFileOffer(message, to: context)
        case "clipboard_file_chunk":
            handleClipboardFileChunk(message, to: context)
        case "clipboard_file_complete":
            handleClipboardFileComplete(message, to: context)
        case "reverse_control_request":
            handleReverseControlRequest(message, to: context)
        case "reverse_control_response":
            logger.info("收到反控确认：\(message["accepted"] ?? false)")
        default:
            sendError(code: "LAN003", message: "macOS 被控端暂不支持消息：\(type)", to: context)
        }
    }

    private func handleHello(_ message: [String: Any], to context: ClientContext) {
        logger.info("hello：\(message["clientName"] ?? "unknown") / \(message["clientPlatform"] ?? "unknown")")
        let screenFramesEnabled = shouldUseScreenFrames(permissions.snapshot())
        send([
            "type": "hello_ack",
            "protocolVersion": 1,
            "hostName": "macOS 被控端",
            "hostPlatform": "macos",
            "capabilities": [
                "screen": [
                    "mode": screenFramesEnabled ? "jpeg-frame" : "mock-frame",
                    "codec": screenFramesEnabled ? "jpeg" : "mock-svg",
                    "pipeline": screenFramesEnabled ? "background-jpeg" : "mock-svg",
                    "maxFps": screenFramesEnabled ? configuration.maxScreenFps : 8,
                ],
                "audio": ["mode": "mock-frame", "codec": "mock-opus"],
                "input": ["mode": configuration.inputMode.rawValue],
                "clipboardText": true,
                "clipboardFile": true,
            ],
        ], to: context)
    }

    private func handleAuth(_ message: [String: Any], to context: ClientContext) {
        let password = message["password"] as? String
        let ok = password == configuration.pairingPassword
        context.isAuthenticated = ok
        logger.info(ok ? "认证通过" : "认证失败")
        send([
            "type": "auth_result",
            "ok": ok,
            "code": ok ? "" : "LAN002",
            "reason": ok ? "" : "连接密码不正确",
            "message": ok ? "验证通过" : "密码错误",
        ], to: context)
    }

    private func handleSessionOffer(_ data: Data, message: [String: Any], to context: ClientContext) {
        let offer = (try? JSONDecoder().decode(SessionOffer.self, from: data))
        let displays = screenCapture.availableDisplays()
        let activeDisplay = pickDisplay(message["displayId"] as? String, from: displays)
        let width = positiveInt(message["preferredWidth"]) ?? activeDisplay.width
        let height = positiveInt(message["preferredHeight"]) ?? activeDisplay.height
        let fps = min(positiveInt(message["maxFps"]) ?? 60, 60)
        let bandwidth = positiveInt(message["maxBandwidthKbps"]) ?? 50_000
        let wantAudio = offer?.wantAudio ?? boolValue(message["wantAudio"])
        let wantClipboardText = offer?.wantClipboardText ?? boolValue(message["wantClipboardText"])
        let wantClipboardFile = offer?.wantClipboardFile ?? boolValue(message["wantClipboardFile"])
        let videoCodec = offer?.preferredVideoCodec ?? stringValue(message["preferredVideoCodec"]) ?? "mjpeg"
        let audioCodec = wantAudio ? (offer?.preferredAudioCodec ?? stringValue(message["preferredAudioCodec"]) ?? "opus") : "none"
        let audioVolume = positiveInt(message["audioVolume"]) ?? 80
        let qualityPreset = offer?.qualityPreset ?? stringValue(message["qualityPreset"]) ?? "balanced"

        let snapshot = permissions.snapshot()
        let screenFramesEnabled = shouldUseScreenFrames(snapshot)
        let jpegQuality = jpegQuality(for: qualityPreset, bandwidthKbps: bandwidth)
        context.session = HostSession(
            width: width,
            height: height,
            fps: fps,
            maxBandwidthKbps: bandwidth,
            displayId: activeDisplay.id,
            displayName: activeDisplay.name,
            audioEnabled: wantAudio,
            audioVolume: audioVolume,
            screenFramesEnabled: screenFramesEnabled,
            qualityPreset: qualityPreset,
            jpegQuality: jpegQuality
        )

        logger.info("会话协商：\(width)x\(height) / \(fps) Hz / 码率 \(bandwidth / 1000) Mbps / \(activeDisplay.name) / 视频 \(screenFramesEnabled ? "后台 JPEG" : "模拟帧") / 质量 \(String(format: "%.2f", jpegQuality))")
        send([
            "type": "session_answer",
            "ok": true,
            "videoCodec": screenFramesEnabled ? "jpeg" : videoCodec,
            "audioCodec": audioCodec,
            "fps": fps,
            "maxBandwidthKbps": bandwidth,
            "width": width,
            "height": height,
            "displays": displays.map { $0.jsonObject },
            "activeDisplayId": activeDisplay.id,
            "displayName": activeDisplay.name,
            "audioEnabled": wantAudio,
            "sampleRate": 48_000,
            "channels": 2,
            "clipboardText": wantClipboardText,
            "clipboardFile": wantClipboardFile,
            "hostMode": screenFramesEnabled ? "mac-host-background-jpeg" : "mac-host-mock-video",
            "qualityPreset": qualityPreset,
            "jpegQuality": jpegQuality,
            "capturePipeline": screenFramesEnabled ? "background-jpeg" : "mock-svg",
            "permissions": [
                "screenRecording": snapshot.screenRecordingGranted,
                "accessibility": snapshot.accessibilityGranted,
                "inputMonitoring": snapshot.inputMonitoringGranted,
            ],
        ], to: context)

        startVideoFrames(context)
        if wantAudio {
            startAudioFrames(context)
        }
    }

    private func handleDisplaySettings(_ message: [String: Any], to context: ClientContext) {
        let displays = screenCapture.availableDisplays()
        let activeDisplay = pickDisplay(message["displayId"] as? String ?? context.session?.displayId, from: displays)
        let resolutionMode = stringValue(message["resolutionMode"]) ?? "fixed"
        let width = resolutionMode == "native" ? activeDisplay.width : positiveInt(message["width"]) ?? context.session?.width ?? activeDisplay.width
        let height = resolutionMode == "native" ? activeDisplay.height : positiveInt(message["height"]) ?? context.session?.height ?? activeDisplay.height
        let fps = min(positiveInt(message["fps"]) ?? context.session?.fps ?? 60, 60)
        let audioEnabled = boolValue(message["audio"])
        let audioVolume = positiveInt(message["audioVolume"]) ?? context.session?.audioVolume ?? 80
        let bandwidth = positiveInt(message["maxBandwidthKbps"]) ?? context.session?.maxBandwidthKbps ?? 50_000
        let qualityPreset = stringValue(message["qualityPreset"]) ?? context.session?.qualityPreset ?? "balanced"
        let screenFramesEnabled = shouldUseScreenFrames(permissions.snapshot())
        let jpegQuality = jpegQuality(for: qualityPreset, bandwidthKbps: bandwidth)

        context.session = HostSession(
            width: width,
            height: height,
            fps: fps,
            maxBandwidthKbps: bandwidth,
            displayId: activeDisplay.id,
            displayName: activeDisplay.name,
            audioEnabled: audioEnabled,
            audioVolume: audioVolume,
            screenFramesEnabled: screenFramesEnabled,
            qualityPreset: qualityPreset,
            jpegQuality: jpegQuality
        )

        send([
            "type": "display_settings_ack",
            "accepted": true,
            "qualityPreset": qualityPreset,
            "jpegQuality": jpegQuality,
            "capturePipeline": screenFramesEnabled ? "background-jpeg" : "mock-svg",
        ], to: context)
        startVideoFrames(context)
        audioEnabled ? startAudioFrames(context) : stopAudioFrames(context)
    }

    private func handleAudioSettings(_ message: [String: Any], to context: ClientContext) {
        let enabled = boolValue(message["enabled"])
        let muted = boolValue(message["muted"])
        let volume = positiveInt(message["volume"]) ?? 0

        if var session = context.session {
            session.audioEnabled = enabled && !muted
            session.audioVolume = volume
            context.session = session
        }

        send([
            "type": "audio_settings_ack",
            "enabled": enabled,
            "volume": volume,
            "muted": muted,
        ], to: context)

        enabled && !muted ? startAudioFrames(context) : stopAudioFrames(context)
    }

    private func handleInputEvent(_ data: Data, fallback: [String: Any], context: ClientContext) {
        if let input = try? JSONDecoder().decode(InputEventMessage.self, from: data) {
            inputInjector.inject(input, target: inputTarget(for: context.session))
            return
        }

        logger.info("收到输入事件：\(fallback["kind"] ?? fallback["event"] ?? "unknown") \(fallback["detail"] ?? "")")
    }

    private func inputTarget(for session: HostSession?) -> InputInjectionTarget? {
        guard let session else {
            return nil
        }

        return InputInjectionTarget(
            displayId: session.displayId,
            frameWidth: session.width,
            frameHeight: session.height
        )
    }

    private func handleClipboardText(_ message: [String: Any], to context: ClientContext) {
        let textLength = positiveInt(message["textLength"]) ?? stringValue(message["text"])?.count ?? 0
        logger.info("收到文本剪贴板：\(textLength) 字")
        send([
            "type": "clipboard_ack",
            "accepted": true,
            "clipboardId": stringValue(message["clipboardId"]) ?? "",
            "textLength": textLength,
        ], to: context)
    }

    private func handleClipboardFileOffer(_ message: [String: Any], to context: ClientContext) {
        let transferId = stringValue(message["transferId"]) ?? UUID().uuidString
        let totalBytes = positiveInt(message["totalBytes"]) ?? 0
        let fileCount = positiveInt(message["fileCount"]) ?? 0
        context.fileTransfers[transferId] = FileTransferState(totalBytes: totalBytes, receivedBytes: 0, fileCount: fileCount)
        send([
            "type": "clipboard_file_response",
            "transferId": transferId,
            "accepted": true,
            "saveMode": "memory-only",
            "maxChunkBytes": positiveInt(message["maxChunkBytes"]) ?? 256 * 1024,
            "reason": "macOS 被控端已准备接收文件块。",
        ], to: context)
    }

    private func handleClipboardFileChunk(_ message: [String: Any], to context: ClientContext) {
        let transferId = stringValue(message["transferId"]) ?? ""
        var transfer = context.fileTransfers[transferId] ?? FileTransferState(totalBytes: positiveInt(message["totalBytes"]) ?? 0, receivedBytes: 0, fileCount: 0)
        let chunkBytes = positiveInt(message["bytes"]) ?? 0
        let sentBytes = positiveInt(message["sentBytes"])
        let nextReceivedBytes = transfer.receivedBytes + chunkBytes
        transfer.receivedBytes = sentBytes ?? (transfer.totalBytes > 0 ? min(transfer.totalBytes, nextReceivedBytes) : nextReceivedBytes)
        context.fileTransfers[transferId] = transfer
        send([
            "type": "clipboard_file_progress",
            "transferId": transferId,
            "receivedBytes": transfer.receivedBytes,
            "totalBytes": transfer.totalBytes,
        ], to: context)
    }

    private func handleClipboardFileComplete(_ message: [String: Any], to context: ClientContext) {
        let transferId = stringValue(message["transferId"]) ?? ""
        let transfer = context.fileTransfers[transferId]
        send([
            "type": "clipboard_file_result",
            "transferId": transferId,
            "accepted": true,
            "receivedBytes": transfer?.receivedBytes ?? positiveInt(message["totalBytes"]) ?? 0,
            "totalBytes": transfer?.totalBytes ?? positiveInt(message["totalBytes"]) ?? 0,
            "fileCount": transfer?.fileCount ?? positiveInt(message["fileCount"]) ?? 0,
            "reason": "macOS 被控端已接收文件块，系统级文件剪贴板后续接入。",
        ], to: context)
        context.fileTransfers.removeValue(forKey: transferId)
    }

    private func handleReverseControlRequest(_ message: [String: Any], to context: ClientContext) {
        send([
            "type": "reverse_control_response",
            "requestId": stringValue(message["requestId"]) ?? "",
            "accepted": false,
            "reason": "macOS 控制窗口尚未实装，暂不切换控制方向。",
        ], to: context)
    }

    private func startVideoFrames(_ context: ClientContext) {
        stopVideoFrames(context)
        context.reportedVideoCaptureFallback = false
        context.isVideoCaptureInFlight = false
        context.droppedVideoFrames = 0
        let session = context.session ?? HostSession(
            width: 1920,
            height: 1080,
            fps: 8,
            maxBandwidthKbps: 50_000,
            displayId: "main",
            displayName: "主显示器",
            audioEnabled: false,
            audioVolume: 80,
            screenFramesEnabled: false,
            qualityPreset: "balanced",
            jpegQuality: jpegQuality(for: "balanced", bandwidthKbps: 50_000)
        )
        let maxFps = session.screenFramesEnabled ? min(session.fps, configuration.maxScreenFps) : min(session.fps, 8)
        let intervalMs = max(session.screenFramesEnabled ? 80 : 120, Int((1000.0 / Double(max(1, maxFps))).rounded()))
        let timer = DispatchSource.makeTimerSource(queue: .main)
        timer.schedule(deadline: .now() + .milliseconds(intervalMs), repeating: .milliseconds(intervalMs))
        timer.setEventHandler { [weak self, weak context] in
            guard let self, let context else { return }
            let currentSession = context.session ?? session
            if currentSession.screenFramesEnabled {
                self.enqueueScreenVideoFrame(context, session: currentSession)
            } else {
                context.frameId += 1
                self.send(self.makeMockVideoFrame(context.frameId, session: currentSession), to: context)
            }
        }
        context.videoTimer = timer
        timer.resume()
    }

    private func stopVideoFrames(_ context: ClientContext) {
        context.videoTimer?.cancel()
        context.videoTimer = nil
    }

    private func startAudioFrames(_ context: ClientContext) {
        stopAudioFrames(context)
        let timer = DispatchSource.makeTimerSource(queue: .main)
        timer.schedule(deadline: .now() + .milliseconds(240), repeating: .milliseconds(240))
        timer.setEventHandler { [weak self, weak context] in
            guard let self, let context else { return }
            context.audioFrameId += 1
            let session = context.session
            let volume = max(0, min(100, session?.audioVolume ?? 80))
            let wave = (sin(Double(context.audioFrameId) / 2.8) + 1.0) / 2.0
            self.send([
                "type": "audio_frame",
                "frameId": context.audioFrameId,
                "codec": "mock-opus",
                "sampleRate": 48_000,
                "channels": 2,
                "durationMs": 20,
                "level": Double(round(wave * Double(volume)) / 100.0),
                "volume": volume,
                "latencyMs": 16 + (context.audioFrameId % 8),
                "encoding": "mock",
            ], to: context)
        }
        context.audioTimer = timer
        timer.resume()
    }

    private func stopAudioFrames(_ context: ClientContext) {
        context.audioTimer?.cancel()
        context.audioTimer = nil
    }

    private func enqueueScreenVideoFrame(_ context: ClientContext, session: HostSession) {
        guard !context.isVideoCaptureInFlight else {
            context.droppedVideoFrames += 1
            return
        }

        context.isVideoCaptureInFlight = true
        context.frameId += 1
        let frameId = context.frameId
        let sessionSnapshot = session

        videoCaptureQueue.async { [weak self, weak context] in
            guard let self else { return }
            let capturedFrame = self.screenCapture.captureFrame(
                displayId: sessionSnapshot.displayId,
                maxWidth: sessionSnapshot.width,
                maxHeight: sessionSnapshot.height,
                quality: sessionSnapshot.jpegQuality
            )

            DispatchQueue.main.async { [weak self, weak context] in
                guard let self, let context else { return }
                context.isVideoCaptureInFlight = false
                guard context.videoTimer != nil else {
                    return
                }

                if let capturedFrame {
                    var frame = capturedFrame.jsonObject(
                        frameId: frameId,
                        timestamp: ISO8601DateFormatter().string(from: Date()),
                        keyFrame: frameId == 1 || frameId % 30 == 0
                    )
                    frame["qualityPreset"] = sessionSnapshot.qualityPreset
                    frame["jpegQuality"] = sessionSnapshot.jpegQuality
                    frame["capturePipeline"] = "background-jpeg"
                    frame["droppedFrames"] = context.droppedVideoFrames
                    context.droppedVideoFrames = 0
                    self.send(frame, to: context)
                    return
                }

                if !context.reportedVideoCaptureFallback {
                    context.reportedVideoCaptureFallback = true
                    self.logger.warn("真实屏幕帧抓取失败，已临时回退到模拟视频帧。请检查屏幕录制权限或重新启动服务。")
                }

                var fallbackFrame = self.makeMockVideoFrame(frameId, session: sessionSnapshot)
                fallbackFrame["capturePipeline"] = "screen-fallback-mock"
                fallbackFrame["droppedFrames"] = context.droppedVideoFrames
                context.droppedVideoFrames = 0
                self.send(fallbackFrame, to: context)
            }
        }
    }

    private func makeMockVideoFrame(_ frameId: Int, session: HostSession) -> [String: Any] {
        let hue = (frameId * 23) % 360
        let now = Date()
        let svg = """
        <svg xmlns="http://www.w3.org/2000/svg" width="\(session.width)" height="\(session.height)" viewBox="0 0 \(session.width) \(session.height)">
          <defs>
            <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stop-color="hsl(\(hue), 42%, 24%)"/>
              <stop offset="100%" stop-color="hsl(\((hue + 90) % 360), 38%, 12%)"/>
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#bg)"/>
          <rect x="48" y="42" width="\(max(120, session.width - 96))" height="46" rx="12" fill="rgba(255,255,255,0.9)"/>
          <text x="76" y="72" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="22" fill="#1f2937">Real Mac WebSocket Host</text>
          <rect x="\(Int(Double(session.width) * 0.12))" y="\(Int(Double(session.height) * 0.18))" width="\(Int(Double(session.width) * 0.52))" height="\(Int(Double(session.height) * 0.46))" rx="18" fill="rgba(255,255,255,0.92)"/>
          <circle cx="\(Int(Double(session.width) * 0.15))" cy="\(Int(Double(session.height) * 0.22))" r="12" fill="#ef4444"/>
          <circle cx="\(Int(Double(session.width) * 0.18))" cy="\(Int(Double(session.height) * 0.22))" r="12" fill="#f59e0b"/>
          <circle cx="\(Int(Double(session.width) * 0.21))" cy="\(Int(Double(session.height) * 0.22))" r="12" fill="#22c55e"/>
          <text x="\(Int(Double(session.width) * 0.15))" y="\(Int(Double(session.height) * 0.34))" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="44" font-weight="700" fill="#111827">macOS 被控端测试帧</text>
          <text x="\(Int(Double(session.width) * 0.15))" y="\(Int(Double(session.height) * 0.42))" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="30" fill="#4b5563">\(session.displayName)</text>
          <text x="\(Int(Double(session.width) * 0.15))" y="\(Int(Double(session.height) * 0.49))" font-family="Menlo, Consolas, monospace" font-size="30" fill="#4b5563">frame #\(frameId)</text>
          <text x="\(Int(Double(session.width) * 0.15))" y="\(Int(Double(session.height) * 0.56))" font-family="Menlo, Consolas, monospace" font-size="26" fill="#4b5563">\(ISO8601DateFormatter().string(from: now))</text>
        </svg>
        """

        let dataUrl = "data:image/svg+xml;base64,\(Data(svg.utf8).base64EncodedString())"
        return [
            "type": "video_frame",
            "frameId": frameId,
            "timestamp": ISO8601DateFormatter().string(from: now),
            "width": session.width,
            "height": session.height,
            "codec": "mock-svg",
            "encoding": "data-url",
            "keyFrame": frameId == 1 || frameId % 30 == 0,
            "source": "mock",
            "dataUrl": dataUrl,
        ]
    }

    private func shouldUseScreenFrames(_ snapshot: MacPermissionSnapshot) -> Bool {
        switch configuration.videoMode {
        case .mock:
            return false
        case .screen:
            return true
        case .auto:
            return snapshot.screenRecordingGranted
        }
    }

    private func jpegQuality(for preset: String, bandwidthKbps: Int) -> Double {
        if let override = configuration.jpegQualityOverride {
            return override
        }

        let baseQuality: Double
        switch preset.lowercased() {
        case "smooth":
            baseQuality = 0.42
        case "sharp":
            baseQuality = 0.72
        case "custom":
            baseQuality = bandwidthKbps >= 40_000 ? 0.68 : 0.56
        default:
            baseQuality = 0.56
        }

        if bandwidthKbps <= 10_000 {
            return max(0.35, baseQuality - 0.12)
        }
        if bandwidthKbps >= 40_000 {
            return min(0.82, baseQuality + 0.06)
        }
        return baseQuality
    }

    private func sendAuthRequired(for message: [String: Any], type: String, to context: ClientContext) {
        let reason = "请先验证连接密码"
        switch type {
        case "session_offer":
            send(["type": "session_answer", "ok": false, "code": "LAN002", "reason": reason], to: context)
        case "display_settings":
            send(["type": "display_settings_ack", "accepted": false, "code": "LAN002", "reason": reason], to: context)
        case "audio_settings_update":
            send(["type": "audio_settings_ack", "accepted": false, "enabled": false, "code": "LAN002", "reason": reason], to: context)
        case "clipboard_text":
            send([
                "type": "clipboard_ack",
                "accepted": false,
                "clipboardId": stringValue(message["clipboardId"]) ?? "",
                "code": "LAN002",
                "reason": reason,
            ], to: context)
        case "clipboard_file_offer":
            send([
                "type": "clipboard_file_response",
                "transferId": stringValue(message["transferId"]) ?? "",
                "accepted": false,
                "code": "LAN002",
                "reason": reason,
            ], to: context)
        case "reverse_control_request":
            send([
                "type": "reverse_control_response",
                "requestId": stringValue(message["requestId"]) ?? "",
                "accepted": false,
                "code": "LAN002",
                "reason": reason,
            ], to: context)
        default:
            send(["type": "error", "code": "LAN002", "message": reason], to: context)
        }
        logger.warn("拒绝未认证消息：\(type)")
    }

    private func sendError(code: String, message: String, to context: ClientContext) {
        send(["type": "error", "code": code, "message": message], to: context)
    }

    private func send(_ message: [String: Any], to context: ClientContext) {
        var envelope = message
        let type = stringValue(message["type"]) ?? "message"
        envelope["id"] = "\(type)-\(UUID().uuidString)"
        envelope["timestamp"] = ISO8601DateFormatter().string(from: Date())

        guard JSONSerialization.isValidJSONObject(envelope),
              let data = try? JSONSerialization.data(withJSONObject: envelope),
              let text = String(data: data, encoding: .utf8) else {
            logger.warn("发送消息失败：JSON 编码失败")
            return
        }

        context.connection.send(content: WebSocketCodec.encodeTextFrame(text), completion: .contentProcessed { [weak self] error in
            if let error {
                self?.logger.warn("发送 WebSocket 消息失败：\(error.localizedDescription)")
            }
        })
    }

    private func pickDisplay(_ displayId: String?, from displays: [DisplayDescriptor]) -> DisplayDescriptor {
        if let displayId, let display = displays.first(where: { $0.id == displayId }) {
            return display
        }

        return displays.first(where: { $0.primary }) ?? displays[0]
    }

    private func boolValue(_ value: Any?) -> Bool {
        if let value = value as? Bool {
            return value
        }
        if let value = value as? NSNumber {
            return value.boolValue
        }
        if let value = value as? String {
            return value == "true" || value == "1"
        }
        return false
    }

    private func positiveInt(_ value: Any?) -> Int? {
        if let value = value as? Int, value > 0 {
            return value
        }
        if let value = value as? Double, value > 0 {
            return Int(value)
        }
        if let value = value as? NSNumber, value.intValue > 0 {
            return value.intValue
        }
        if let value = value as? String, let parsed = Int(value), parsed > 0 {
            return parsed
        }
        return nil
    }

    private func stringValue(_ value: Any?) -> String? {
        if let value = value as? String {
            return value
        }
        if let value {
            return String(describing: value)
        }
        return nil
    }

    private func handleListenerState(_ state: NWListener.State) {
        switch state {
        case .ready:
            logger.info("监听已就绪")
        case .failed(let error):
            logger.error("监听失败：\(error.localizedDescription)")
        default:
            break
        }
    }

    private func handleConnectionState(_ state: NWConnection.State, context: ClientContext) {
        switch state {
        case .ready:
            logger.info("连接已建立")
        case .failed(let error):
            logger.warn("连接失败：\(error.localizedDescription)")
            close(context)
        case .cancelled:
            close(context)
        default:
            break
        }
    }

    private func close(_ context: ClientContext) {
        stopVideoFrames(context)
        stopAudioFrames(context)
        activeConnections.removeValue(forKey: ObjectIdentifier(context.connection))
        context.connection.cancel()
        logger.info("连接已关闭")
    }
}

enum HostServiceError: LocalizedError {
    case invalidPort(UInt16)

    var errorDescription: String? {
        switch self {
        case .invalidPort(let port):
            return "无效端口：\(port)"
        }
    }
}
