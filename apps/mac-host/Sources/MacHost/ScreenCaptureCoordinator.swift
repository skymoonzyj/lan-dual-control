import Foundation

#if os(macOS)
import AudioToolbox
import CoreGraphics
import CoreMedia
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers
import VideoToolbox
#endif

struct CapturedScreenFrame {
    let width: Int
    let height: Int
    let dataUrl: String

    func jsonObject(frameId: Int, timestamp: String, keyFrame: Bool) -> [String: Any] {
        [
            "type": "video_frame",
            "frameId": frameId,
            "timestamp": timestamp,
            "width": width,
            "height": height,
            "codec": "jpeg",
            "encoding": "data-url",
            "keyFrame": keyFrame,
            "source": "screen",
            "dataUrl": dataUrl,
        ]
    }
}

struct EncodedScreenFrame {
    let width: Int
    let height: Int
    let payload: String
    let keyFrame: Bool
    let timestampUs: Int64
    let durationUs: Int
    let codecString: String

    func jsonObject(frameId: Int, timestamp: String) -> [String: Any] {
        [
            "type": "video_frame",
            "frameId": frameId,
            "timestamp": timestamp,
            "width": width,
            "height": height,
            "codec": "h264",
            "codecString": codecString,
            "encoding": "annexb-base64",
            "keyFrame": keyFrame,
            "source": "screen",
            "capturePipeline": "screencapturekit-h264",
            "payload": payload,
            "timestampUs": timestampUs,
            "durationUs": durationUs,
        ]
    }
}

struct CapturedAudioFrame {
    let payload: String
    let encoding: String
    let sampleRate: Int
    let channels: Int
    let frameCount: Int
    let payloadBytes: Int
    let durationMs: Int
    let timestampUs: Int64
    let level: Double
    let bytesPerFrame: Int
    let bitsPerChannel: Int
    let layout: String

    func jsonObject(frameId: Int, volume: Int) -> [String: Any] {
        [
            "type": "audio_frame",
            "frameId": frameId,
            "codec": encoding.replacingOccurrences(of: "-base64", with: ""),
            "sampleRate": sampleRate,
            "channels": channels,
            "durationMs": durationMs,
            "level": level,
            "volume": volume,
            "latencyMs": 0,
            "encoding": encoding,
            "payload": payload,
            "payloadBytes": payloadBytes,
            "frames": frameCount,
            "timestampUs": timestampUs,
            "bytesPerFrame": bytesPerFrame,
            "bitsPerChannel": bitsPerChannel,
            "layout": layout,
            "audioMode": "system-pcm",
        ]
    }
}

#if os(macOS)
extension CapturedAudioFrame {
    init?(sampleBuffer: CMSampleBuffer) {
        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer),
              let streamDescription = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription) else {
            return nil
        }

        let asbd = streamDescription.pointee
        let frameCount = max(1, CMSampleBufferGetNumSamples(sampleBuffer))
        let sampleRate = max(1, Int(asbd.mSampleRate.rounded()))
        let channels = max(1, Int(asbd.mChannelsPerFrame))
        let bitsPerChannel = Int(asbd.mBitsPerChannel)
        let bytesPerFrame = Int(asbd.mBytesPerFrame)
        let isFloat = (asbd.mFormatFlags & kAudioFormatFlagIsFloat) != 0
        let isSignedInteger = (asbd.mFormatFlags & kAudioFormatFlagIsSignedInteger) != 0
        let isNonInterleaved = (asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0
        let encoding = Self.audioEncoding(formatId: asbd.mFormatID, isFloat: isFloat, isSignedInteger: isSignedInteger, bitsPerChannel: bitsPerChannel)
        let layout = isNonInterleaved ? "planar" : "interleaved"

        var bufferListSize = 0
        var status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sampleBuffer,
            bufferListSizeNeededOut: &bufferListSize,
            bufferListOut: nil,
            bufferListSize: 0,
            blockBufferAllocator: nil,
            blockBufferMemoryAllocator: nil,
            flags: UInt32(kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment),
            blockBufferOut: nil
        )
        guard status == noErr, bufferListSize > 0 else {
            return nil
        }

        let rawBufferList = UnsafeMutableRawPointer.allocate(
            byteCount: bufferListSize,
            alignment: MemoryLayout<AudioBufferList>.alignment
        )
        defer {
            rawBufferList.deallocate()
        }

        let audioBufferList = rawBufferList.bindMemory(to: AudioBufferList.self, capacity: 1)
        var blockBuffer: CMBlockBuffer?
        status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sampleBuffer,
            bufferListSizeNeededOut: nil,
            bufferListOut: audioBufferList,
            bufferListSize: bufferListSize,
            blockBufferAllocator: nil,
            blockBufferMemoryAllocator: nil,
            flags: UInt32(kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment),
            blockBufferOut: &blockBuffer
        )
        guard status == noErr else {
            return nil
        }

        var payloadData = Data()
        var levelAccumulator = AudioLevelAccumulator()
        for buffer in UnsafeMutableAudioBufferListPointer(audioBufferList) {
            guard let data = buffer.mData, buffer.mDataByteSize > 0 else {
                continue
            }

            let byteCount = Int(buffer.mDataByteSize)
            levelAccumulator.addSamples(
                data,
                byteCount: byteCount,
                isFloat: isFloat,
                isSignedInteger: isSignedInteger,
                bitsPerChannel: bitsPerChannel
            )
            payloadData.append(data.assumingMemoryBound(to: UInt8.self), count: byteCount)
        }

        guard !payloadData.isEmpty else {
            return nil
        }

        let durationMs = Self.audioDurationMilliseconds(CMSampleBufferGetDuration(sampleBuffer), frameCount: frameCount, sampleRate: sampleRate)
        let timestampUs = Self.audioTimestampMicroseconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
        self.init(
            payload: payloadData.base64EncodedString(),
            encoding: encoding,
            sampleRate: sampleRate,
            channels: channels,
            frameCount: frameCount,
            payloadBytes: payloadData.count,
            durationMs: durationMs,
            timestampUs: timestampUs,
            level: levelAccumulator.level,
            bytesPerFrame: bytesPerFrame,
            bitsPerChannel: bitsPerChannel,
            layout: layout
        )

        _ = blockBuffer
    }

    private static func audioEncoding(formatId: AudioFormatID, isFloat: Bool, isSignedInteger: Bool, bitsPerChannel: Int) -> String {
        guard formatId == kAudioFormatLinearPCM else {
            return "audio-buffer-list-base64"
        }
        if isFloat, bitsPerChannel == 32 {
            return "pcm-f32le-base64"
        }
        if isSignedInteger, bitsPerChannel == 16 {
            return "pcm-s16le-base64"
        }
        return "pcm-base64"
    }

    private static func audioDurationMilliseconds(_ duration: CMTime, frameCount: Int, sampleRate: Int) -> Int {
        let seconds = CMTimeGetSeconds(duration)
        if seconds.isFinite, seconds > 0 {
            return max(1, Int((seconds * 1000).rounded()))
        }
        return max(1, Int((Double(frameCount) / Double(max(1, sampleRate)) * 1000).rounded()))
    }

    private static func audioTimestampMicroseconds(_ timestamp: CMTime) -> Int64 {
        let seconds = CMTimeGetSeconds(timestamp)
        if seconds.isFinite, seconds >= 0 {
            return Int64((seconds * 1_000_000).rounded())
        }
        return Int64(Date().timeIntervalSince1970 * 1_000_000)
    }
}

private struct AudioLevelAccumulator {
    private var sumSquares = 0.0
    private var sampleCount = 0

    var level: Double {
        guard sampleCount > 0 else {
            return 0
        }
        let rms = sqrt(sumSquares / Double(sampleCount))
        return min(1, max(0, rms))
    }

    mutating func addSamples(
        _ data: UnsafeMutableRawPointer,
        byteCount: Int,
        isFloat: Bool,
        isSignedInteger: Bool,
        bitsPerChannel: Int
    ) {
        if isFloat, bitsPerChannel == 32 {
            addFloat32Samples(data, byteCount: byteCount)
        } else if isSignedInteger, bitsPerChannel == 16 {
            addInt16Samples(data, byteCount: byteCount)
        }
    }

    private mutating func addFloat32Samples(_ data: UnsafeMutableRawPointer, byteCount: Int) {
        let count = byteCount / MemoryLayout<Float32>.size
        guard count > 0 else {
            return
        }

        let samples = data.assumingMemoryBound(to: Float32.self)
        let step = max(1, count / 4096)
        var index = 0
        while index < count {
            let value = max(-1, min(1, Double(samples[index])))
            sumSquares += value * value
            sampleCount += 1
            index += step
        }
    }

    private mutating func addInt16Samples(_ data: UnsafeMutableRawPointer, byteCount: Int) {
        let count = byteCount / MemoryLayout<Int16>.size
        guard count > 0 else {
            return
        }

        let samples = data.assumingMemoryBound(to: Int16.self)
        let step = max(1, count / 4096)
        var index = 0
        while index < count {
            let value = Double(samples[index]) / Double(Int16.max)
            sumSquares += value * value
            sampleCount += 1
            index += step
        }
    }
}
#endif

final class ScreenCaptureCoordinator {
    private let logger: HostLogger
    #if os(macOS)
    private let videoStreamQueue = DispatchQueue(label: "lan-dual-control.mac-host.h264-stream", qos: .userInteractive)
    private let audioStreamQueue = DispatchQueue(label: "lan-dual-control.mac-host.system-audio", qos: .userInteractive)
    #endif

    init(logger: HostLogger) {
        self.logger = logger
    }

    var supportsH264Streaming: Bool {
        #if os(macOS)
        if #available(macOS 13.0, *) {
            return true
        }
        #endif
        return false
    }

    var supportsSystemAudioCapture: Bool {
        #if os(macOS)
        if #available(macOS 13.0, *) {
            return true
        }
        #endif
        return false
    }

    func prepare() async throws {
        #if os(macOS)
        if #available(macOS 12.3, *) {
            _ = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            logger.info("ScreenCaptureKit 可用，已完成采集资源预检")
        } else {
            logger.warn("当前 macOS 版本低于 ScreenCaptureKit 建议版本")
        }
        #else
        logger.warn("非 macOS 环境，跳过屏幕采集预检")
        #endif
    }

    func startH264Stream(
        displayId: String,
        maxWidth: Int,
        maxHeight: Int,
        fps: Int,
        bitrateKbps: Int,
        onFrame: @escaping (EncodedScreenFrame) -> Void
    ) async throws -> ScreenVideoStream {
        #if os(macOS)
        guard #available(macOS 13.0, *) else {
            throw ScreenCaptureError.unsupportedStreaming
        }

        let display = try await shareableDisplay(for: displayId)
        let targetSize = fittedSize(
            sourceWidth: display.width,
            sourceHeight: display.height,
            maxWidth: maxWidth,
            maxHeight: maxHeight
        )
        let encoder = try H264VideoEncoder(
            width: targetSize.width,
            height: targetSize.height,
            bitrateKbps: bitrateKbps,
            fps: fps,
            onFrame: onFrame
        )
        let output = ScreenStreamOutput(encoder: encoder)
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let configuration = SCStreamConfiguration()
        configuration.width = targetSize.width
        configuration.height = targetSize.height
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(max(1, fps)))
        configuration.queueDepth = 3
        configuration.showsCursor = true
        configuration.pixelFormat = kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange

        let stream = SCStream(filter: filter, configuration: configuration, delegate: nil)
        try stream.addStreamOutput(output, type: .screen, sampleHandlerQueue: videoStreamQueue)
        try await stream.startCapture()
        logger.info("H.264 流式采集已启动：\(targetSize.width)x\(targetSize.height) / \(fps) Hz / \(bitrateKbps / 1000) Mbps")
        return ScreenVideoStream(stream: stream, output: output, encoder: encoder, logger: logger)
        #else
        throw ScreenCaptureError.unsupportedStreaming
        #endif
    }

    func startSystemAudioStream(
        displayId: String,
        sampleRate: Int,
        channels: Int,
        onFrame: @escaping (CapturedAudioFrame) -> Void
    ) async throws -> SystemAudioStream {
        #if os(macOS)
        guard #available(macOS 13.0, *) else {
            throw ScreenCaptureError.unsupportedAudioCapture
        }

        let display = try await shareableDisplay(for: displayId)
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let configuration = SCStreamConfiguration()
        configuration.width = 2
        configuration.height = 2
        configuration.queueDepth = 3
        configuration.capturesAudio = true
        configuration.excludesCurrentProcessAudio = true
        configuration.sampleRate = max(8_000, sampleRate)
        configuration.channelCount = max(1, min(8, channels))

        let output = SystemAudioStreamOutput(onFrame: onFrame)
        let stream = SCStream(filter: filter, configuration: configuration, delegate: nil)
        try stream.addStreamOutput(output, type: .audio, sampleHandlerQueue: audioStreamQueue)
        try await stream.startCapture()
        logger.info("系统声音采集已启动：\(configuration.sampleRate) Hz / \(configuration.channelCount) ch")
        return SystemAudioStream(stream: stream, output: output, logger: logger)
        #else
        throw ScreenCaptureError.unsupportedAudioCapture
        #endif
    }

    func captureFrame(displayId: String, maxWidth: Int, maxHeight: Int, quality: Double = 0.58) -> CapturedScreenFrame? {
        #if os(macOS)
        guard let displayId = resolveDisplayId(displayId),
              let sourceImage = captureDisplayImage(displayId) else {
            return nil
        }

        let targetSize = fittedSize(
            sourceWidth: sourceImage.width,
            sourceHeight: sourceImage.height,
            maxWidth: maxWidth,
            maxHeight: maxHeight
        )
        let image = scaledImage(sourceImage, width: targetSize.width, height: targetSize.height) ?? sourceImage

        guard let jpegData = encodeJpeg(image, quality: quality) else {
            return nil
        }

        return CapturedScreenFrame(
            width: image.width,
            height: image.height,
            dataUrl: "data:image/jpeg;base64,\(jpegData.base64EncodedString())"
        )
        #else
        return nil
        #endif
    }

    func availableDisplays() -> [DisplayDescriptor] {
        #if os(macOS)
        let displays = activeDisplays()
        let mainDisplay = CGMainDisplayID()

        let descriptors = displays.enumerated().map { index, displayId in
            let isPrimary = displayId == mainDisplay || (index == 0 && !displays.contains(mainDisplay))
            return DisplayDescriptor(
                id: isPrimary ? "main" : "display-\(displayId)",
                name: isPrimary ? "主显示器" : "显示器 \(index + 1)",
                width: CGDisplayPixelsWide(displayId),
                height: CGDisplayPixelsHigh(displayId),
                primary: isPrimary
            )
        }

        if !descriptors.isEmpty {
            return descriptors
        }
        #endif

        return [
            DisplayDescriptor(id: "main", name: "主显示器", width: 1920, height: 1080, primary: true)
        ]
    }

    #if os(macOS)
    private func activeDisplays() -> [CGDirectDisplayID] {
        var count: UInt32 = 0
        CGGetActiveDisplayList(0, nil, &count)
        guard count > 0 else {
            return []
        }

        var displays = Array(repeating: CGDirectDisplayID(), count: Int(count))
        CGGetActiveDisplayList(count, &displays, &count)
        return Array(displays.prefix(Int(count)))
    }

    @available(macOS 13.0, *)
    private func shareableDisplay(for descriptorId: String) async throws -> SCDisplay {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard !content.displays.isEmpty else {
            throw ScreenCaptureError.noDisplay
        }

        if descriptorId == "main" {
            let mainDisplay = CGMainDisplayID()
            return content.displays.first(where: { $0.displayID == mainDisplay }) ?? content.displays[0]
        }

        if descriptorId.hasPrefix("display-"),
           let rawValue = UInt32(descriptorId.dropFirst("display-".count)),
           let display = content.displays.first(where: { $0.displayID == CGDirectDisplayID(rawValue) }) {
            return display
        }

        return content.displays[0]
    }

    private func resolveDisplayId(_ descriptorId: String) -> CGDirectDisplayID? {
        let displays = activeDisplays()
        guard !displays.isEmpty else {
            return nil
        }

        if descriptorId == "main" {
            let mainDisplay = CGMainDisplayID()
            return displays.contains(mainDisplay) ? mainDisplay : displays[0]
        }

        if descriptorId.hasPrefix("display-"),
           let rawValue = UInt32(descriptorId.dropFirst("display-".count)),
           displays.contains(CGDirectDisplayID(rawValue)) {
            return CGDirectDisplayID(rawValue)
        }

        return displays[0]
    }

    private func captureDisplayImage(_ displayId: CGDirectDisplayID) -> CGImage? {
        for attempt in 0..<4 {
            if let image = CGDisplayCreateImage(displayId) {
                return image
            }
            if attempt < 3 {
                Thread.sleep(forTimeInterval: 0.04)
            }
        }
        return nil
    }

    private func fittedSize(sourceWidth: Int, sourceHeight: Int, maxWidth: Int, maxHeight: Int) -> (width: Int, height: Int) {
        guard sourceWidth > 0, sourceHeight > 0, maxWidth > 0, maxHeight > 0 else {
            return (max(sourceWidth, 1), max(sourceHeight, 1))
        }

        let scale = min(
            Double(maxWidth) / Double(sourceWidth),
            Double(maxHeight) / Double(sourceHeight),
            1.0
        )

        return (
            max(1, Int((Double(sourceWidth) * scale).rounded())),
            max(1, Int((Double(sourceHeight) * scale).rounded()))
        )
    }

    private func scaledImage(_ image: CGImage, width: Int, height: Int) -> CGImage? {
        guard image.width != width || image.height != height else {
            return image
        }

        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue
        guard let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: colorSpace,
            bitmapInfo: bitmapInfo
        ) else {
            return nil
        }

        context.interpolationQuality = .medium
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return context.makeImage()
    }

    private func encodeJpeg(_ image: CGImage, quality: Double) -> Data? {
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            data,
            UTType.jpeg.identifier as CFString,
            1,
            nil
        ) else {
            return nil
        }

        let options = [
            kCGImageDestinationLossyCompressionQuality: max(0.1, min(0.95, quality))
        ] as CFDictionary
        CGImageDestinationAddImage(destination, image, options)

        guard CGImageDestinationFinalize(destination) else {
            return nil
        }

        return data as Data
    }
    #endif
}

enum ScreenCaptureError: LocalizedError {
    case unsupportedStreaming
    case unsupportedAudioCapture
    case noDisplay
    case encoderCreation(OSStatus)
    case encoderNotReady

    var errorDescription: String? {
        switch self {
        case .unsupportedStreaming:
            return "当前系统不支持 ScreenCaptureKit H.264 流式采集"
        case .unsupportedAudioCapture:
            return "当前系统不支持 ScreenCaptureKit 系统声音采集"
        case .noDisplay:
            return "未找到可采集的显示器"
        case .encoderCreation(let status):
            return "VideoToolbox H.264 编码器创建失败：\(status)"
        case .encoderNotReady:
            return "VideoToolbox H.264 编码器未就绪"
        }
    }
}

#if os(macOS)
final class ScreenVideoStream {
    private let stream: SCStream
    private let output: ScreenStreamOutput
    private let encoder: H264VideoEncoder
    private let logger: HostLogger
    private var stopped = false

    fileprivate init(stream: SCStream, output: ScreenStreamOutput, encoder: H264VideoEncoder, logger: HostLogger) {
        self.stream = stream
        self.output = output
        self.encoder = encoder
        self.logger = logger
    }

    func stop() {
        guard !stopped else {
            return
        }
        stopped = true
        encoder.invalidate()
        Task { [stream, logger] in
            do {
                try await stream.stopCapture()
                logger.info("H.264 流式采集已停止")
            } catch {
                logger.warn("停止 H.264 流式采集失败：\(error.localizedDescription)")
            }
        }
        _ = output
    }
}

// The stream wrapper is only retained by the main connection context. Stop
// requests can be scheduled from callbacks, while the underlying SCStream owns
// its own async stop lifecycle.
extension ScreenVideoStream: @unchecked Sendable {}

final class SystemAudioStream {
    private let stream: SCStream
    private let output: SystemAudioStreamOutput
    private let logger: HostLogger
    private var stopped = false

    fileprivate init(stream: SCStream, output: SystemAudioStreamOutput, logger: HostLogger) {
        self.stream = stream
        self.output = output
        self.logger = logger
    }

    func stop() {
        guard !stopped else {
            return
        }
        stopped = true
        Task { [stream, logger] in
            do {
                try await stream.stopCapture()
                logger.info("系统声音采集已停止")
            } catch {
                logger.warn("停止系统声音采集失败：\(error.localizedDescription)")
            }
        }
        _ = output
    }
}

// The stream wrapper follows the same lifecycle as ScreenVideoStream: it is
// retained by the main connection context and only schedules async stop work.
extension SystemAudioStream: @unchecked Sendable {}

private final class SystemAudioStreamOutput: NSObject, SCStreamOutput {
    private let onFrame: (CapturedAudioFrame) -> Void

    init(onFrame: @escaping (CapturedAudioFrame) -> Void) {
        self.onFrame = onFrame
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
        guard outputType == .audio,
              CMSampleBufferDataIsReady(sampleBuffer),
              let frame = CapturedAudioFrame(sampleBuffer: sampleBuffer) else {
            return
        }

        onFrame(frame)
    }
}

private final class ScreenStreamOutput: NSObject, SCStreamOutput {
    private let encoder: H264VideoEncoder

    init(encoder: H264VideoEncoder) {
        self.encoder = encoder
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
        guard outputType == .screen,
              CMSampleBufferDataIsReady(sampleBuffer),
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
            return
        }

        encoder.encode(
            pixelBuffer,
            presentationTimeStamp: CMSampleBufferGetPresentationTimeStamp(sampleBuffer),
            duration: CMSampleBufferGetDuration(sampleBuffer)
        )
    }
}

private final class H264VideoEncoder {
    private let width: Int
    private let height: Int
    private let fps: Int
    private let onFrame: (EncodedScreenFrame) -> Void
    private var session: VTCompressionSession?
    private var frameId = 0
    private var parameterSetData = Data()
    private var cachedCodecString = "avc1.42E01F"

    init(width: Int, height: Int, bitrateKbps: Int, fps: Int, onFrame: @escaping (EncodedScreenFrame) -> Void) throws {
        self.width = max(1, width)
        self.height = max(1, height)
        self.fps = max(1, fps)
        self.onFrame = onFrame

        var createdSession: VTCompressionSession?
        let status = VTCompressionSessionCreate(
            allocator: kCFAllocatorDefault,
            width: Int32(self.width),
            height: Int32(self.height),
            codecType: kCMVideoCodecType_H264,
            encoderSpecification: nil,
            imageBufferAttributes: nil,
            compressedDataAllocator: nil,
            outputCallback: h264CompressionOutputCallback,
            refcon: Unmanaged.passUnretained(self).toOpaque(),
            compressionSessionOut: &createdSession
        )

        guard status == noErr, let createdSession else {
            throw ScreenCaptureError.encoderCreation(status)
        }

        session = createdSession
        configure(createdSession, bitrateKbps: bitrateKbps)
        VTCompressionSessionPrepareToEncodeFrames(createdSession)
    }

    func encode(_ pixelBuffer: CVPixelBuffer, presentationTimeStamp: CMTime, duration: CMTime) {
        guard let session else {
            return
        }

        VTCompressionSessionEncodeFrame(
            session,
            imageBuffer: pixelBuffer,
            presentationTimeStamp: presentationTimeStamp,
            duration: duration,
            frameProperties: nil,
            sourceFrameRefcon: nil,
            infoFlagsOut: nil
        )
    }

    func invalidate() {
        guard let session else {
            return
        }
        VTCompressionSessionCompleteFrames(session, untilPresentationTimeStamp: .invalid)
        VTCompressionSessionInvalidate(session)
        self.session = nil
    }

    fileprivate func handleEncodedSampleBuffer(_ sampleBuffer: CMSampleBuffer) {
        guard CMSampleBufferDataIsReady(sampleBuffer),
              let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else {
            return
        }

        let keyFrame = isKeyFrame(sampleBuffer)
        if keyFrame {
            updateParameterSets(sampleBuffer)
        }

        var frameData = keyFrame ? parameterSetData : Data()
        frameData.append(annexBData(from: blockBuffer))
        guard !frameData.isEmpty else {
            return
        }

        frameId += 1
        let durationUs = durationMicroseconds(CMSampleBufferGetDuration(sampleBuffer))
        let timestampUs = timestampMicroseconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer), fallback: Int64(frameId * durationUs))
        onFrame(
            EncodedScreenFrame(
                width: width,
                height: height,
                payload: frameData.base64EncodedString(),
                keyFrame: keyFrame,
                timestampUs: timestampUs,
                durationUs: durationUs,
                codecString: cachedCodecString
            )
        )
    }

    private func configure(_ session: VTCompressionSession, bitrateKbps: Int) {
        let bitrate = NSNumber(value: max(256, bitrateKbps) * 1000)
        let keyFrameInterval = NSNumber(value: max(1, fps * 2))
        let expectedFrameRate = NSNumber(value: fps)

        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_RealTime, value: kCFBooleanTrue)
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_AllowFrameReordering, value: kCFBooleanFalse)
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_ProfileLevel, value: kVTProfileLevel_H264_Baseline_AutoLevel)
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_AverageBitRate, value: bitrate)
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_MaxKeyFrameInterval, value: keyFrameInterval)
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_ExpectedFrameRate, value: expectedFrameRate)
    }

    private func isKeyFrame(_ sampleBuffer: CMSampleBuffer) -> Bool {
        guard let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as NSArray?,
              let attachment = attachments.firstObject as? NSDictionary else {
            return true
        }
        return !(attachment[kCMSampleAttachmentKey_NotSync] as? Bool ?? false)
    }

    private func updateParameterSets(_ sampleBuffer: CMSampleBuffer) {
        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer),
              let sps = parameterSet(formatDescription, index: 0),
              let pps = parameterSet(formatDescription, index: 1) else {
            return
        }

        var data = Data()
        data.append(contentsOf: [0x00, 0x00, 0x00, 0x01])
        data.append(sps)
        data.append(contentsOf: [0x00, 0x00, 0x00, 0x01])
        data.append(pps)
        parameterSetData = data
        cachedCodecString = codecString(from: sps)
    }

    private func parameterSet(_ formatDescription: CMFormatDescription, index: Int) -> Data? {
        var pointer: UnsafePointer<UInt8>?
        var size = 0
        var count = 0
        var nalUnitHeaderLength: Int32 = 0
        let status = CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
            formatDescription,
            parameterSetIndex: index,
            parameterSetPointerOut: &pointer,
            parameterSetSizeOut: &size,
            parameterSetCountOut: &count,
            nalUnitHeaderLengthOut: &nalUnitHeaderLength
        )

        guard status == noErr, let pointer, size > 0 else {
            return nil
        }
        return Data(bytes: pointer, count: size)
    }

    private func annexBData(from blockBuffer: CMBlockBuffer) -> Data {
        var lengthAtOffset = 0
        var totalLength = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        let status = CMBlockBufferGetDataPointer(
            blockBuffer,
            atOffset: 0,
            lengthAtOffsetOut: &lengthAtOffset,
            totalLengthOut: &totalLength,
            dataPointerOut: &dataPointer
        )

        guard status == noErr, let dataPointer, totalLength > 4 else {
            return Data()
        }

        let bytes = UnsafeRawPointer(dataPointer).assumingMemoryBound(to: UInt8.self)
        var offset = 0
        var output = Data()
        while offset + 4 <= totalLength {
            let nalLength =
                (Int(bytes[offset]) << 24) |
                (Int(bytes[offset + 1]) << 16) |
                (Int(bytes[offset + 2]) << 8) |
                Int(bytes[offset + 3])
            offset += 4

            guard nalLength > 0, offset + nalLength <= totalLength else {
                break
            }

            output.append(contentsOf: [0x00, 0x00, 0x00, 0x01])
            output.append(contentsOf: UnsafeBufferPointer(start: bytes.advanced(by: offset), count: nalLength))
            offset += nalLength
        }
        return output
    }

    private func codecString(from sps: Data) -> String {
        guard sps.count >= 4 else {
            return "avc1.42E01F"
        }

        return String(format: "avc1.%02X%02X%02X", sps[1], sps[2], sps[3])
    }

    private func durationMicroseconds(_ duration: CMTime) -> Int {
        let seconds = CMTimeGetSeconds(duration)
        if seconds.isFinite, seconds > 0 {
            return max(1, Int((seconds * 1_000_000).rounded()))
        }
        return max(1, Int((1_000_000.0 / Double(max(1, fps))).rounded()))
    }

    private func timestampMicroseconds(_ timestamp: CMTime, fallback: Int64) -> Int64 {
        let seconds = CMTimeGetSeconds(timestamp)
        if seconds.isFinite, seconds >= 0 {
            return Int64((seconds * 1_000_000).rounded())
        }
        return fallback
    }
}

private let h264CompressionOutputCallback: VTCompressionOutputCallback = { refcon, _, status, _, sampleBuffer in
    guard status == noErr,
          let refcon,
          let sampleBuffer else {
        return
    }

    let encoder = Unmanaged<H264VideoEncoder>.fromOpaque(refcon).takeUnretainedValue()
    encoder.handleEncodedSampleBuffer(sampleBuffer)
}
#endif
