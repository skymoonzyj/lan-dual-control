import Foundation

#if os(macOS)
import CoreGraphics
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers
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

final class ScreenCaptureCoordinator {
    private let logger: HostLogger

    init(logger: HostLogger) {
        self.logger = logger
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

    func startStreaming() async throws {
        logger.info("TODO：接入真实 ScreenCaptureKit 视频帧流")
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
