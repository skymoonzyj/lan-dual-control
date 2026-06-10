import Foundation
import Network

final class MacHostService {
    private let configuration: HostConfiguration
    private let permissions: MacPermissionCenter
    private let screenCapture: ScreenCaptureCoordinator
    private let inputInjector: InputEventInjector
    private let logger: HostLogger

    private var listener: NWListener?
    private var activeConnections: [ObjectIdentifier: NWConnection] = [:]

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
        try await screenCapture.prepare()
        logger.info("等待 Windows 控制端连接...")
        RunLoop.main.run()
    }

    private func accept(_ connection: NWConnection) {
        let id = ObjectIdentifier(connection)
        activeConnections[id] = connection
        logger.info("收到连接：\(connection.endpoint.debugDescription)")

        connection.stateUpdateHandler = { [weak self] state in
            self?.handleConnectionState(state, connection: connection)
        }

        connection.start(queue: .main)
        receiveNextLine(from: connection)
    }

    private func receiveNextLine(from connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, isComplete, error in
            guard let self else { return }

            if let error {
                self.logger.warn("连接读取失败：\(error.localizedDescription)")
                self.close(connection)
                return
            }

            if let data, !data.isEmpty {
                self.handlePayload(data, connection: connection)
            }

            if isComplete {
                self.close(connection)
            } else {
                self.receiveNextLine(from: connection)
            }
        }
    }

    private func handlePayload(_ data: Data, connection: NWConnection) {
        guard let text = String(data: data, encoding: .utf8) else {
            logger.warn("收到非 UTF-8 消息，暂不处理")
            return
        }

        for line in text.split(separator: "\n") {
            handleMessageLine(String(line), connection: connection)
        }
    }

    private func handleMessageLine(_ line: String, connection: NWConnection) {
        guard let data = line.data(using: .utf8) else { return }

        if let hello = try? JSONDecoder().decode(HelloMessage.self, from: data), hello.type == "hello" {
            logger.info("hello：\(hello.clientName) / \(hello.clientPlatform.rawValue)")
            send(["type": "hello_ack", "ok": true, "message": "macOS 被控端已就绪"], to: connection)
            return
        }

        if let auth = try? JSONDecoder().decode(AuthRequest.self, from: data), auth.type == "auth_request" {
            let ok = auth.password == configuration.pairingPassword
            logger.info(ok ? "认证通过" : "认证失败")
            send(AuthResult(type: "auth_result", ok: ok, message: ok ? "验证通过" : "密码错误"), to: connection)
            return
        }

        if let offer = try? JSONDecoder().decode(SessionOffer.self, from: data), offer.type == "session_offer" {
            logger.info("会话协商：\(offer.maxFps) FPS / \(offer.maxBandwidthKbps) Kbps / \(offer.displayMode)")
            let answer = SessionAnswer(
                type: "session_answer",
                screenWidth: offer.preferredWidth == 0 ? 1920 : offer.preferredWidth,
                screenHeight: offer.preferredHeight == 0 ? 1080 : offer.preferredHeight,
                fps: min(offer.maxFps, 60),
                videoCodec: "mjpeg",
                audioEnabled: false,
                audioCodec: "none",
                clipboardTextEnabled: offer.wantClipboardText,
                clipboardFileEnabled: false
            )
            send(answer, to: connection)
            return
        }

        if let input = try? JSONDecoder().decode(InputEventMessage.self, from: data), input.type == "input_event" {
            inputInjector.inject(input)
            return
        }

        logger.warn("暂不支持的消息：\(line)")
    }

    private func send<T: Encodable>(_ message: T, to connection: NWConnection) {
        guard let data = try? JSONEncoder().encode(message) else { return }
        var payload = data
        payload.append(0x0A)
        connection.send(content: payload, completion: .contentProcessed { [weak self] error in
            if let error {
                self?.logger.warn("发送消息失败：\(error.localizedDescription)")
            }
        })
    }

    private func send(_ message: [String: Any], to connection: NWConnection) {
        guard JSONSerialization.isValidJSONObject(message),
              let data = try? JSONSerialization.data(withJSONObject: message) else {
            return
        }
        var payload = data
        payload.append(0x0A)
        connection.send(content: payload, completion: .contentProcessed { [weak self] error in
            if let error {
                self?.logger.warn("发送消息失败：\(error.localizedDescription)")
            }
        })
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

    private func handleConnectionState(_ state: NWConnection.State, connection: NWConnection) {
        switch state {
        case .ready:
            logger.info("连接已建立")
        case .failed(let error):
            logger.warn("连接失败：\(error.localizedDescription)")
            close(connection)
        case .cancelled:
            close(connection)
        default:
            break
        }
    }

    private func close(_ connection: NWConnection) {
        activeConnections.removeValue(forKey: ObjectIdentifier(connection))
        connection.cancel()
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

