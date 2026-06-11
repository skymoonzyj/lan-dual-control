import Foundation

#if os(macOS)
import ScreenCaptureKit
#endif

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

    func availableDisplays() -> [DisplayDescriptor] {
        #if os(macOS)
        var count: UInt32 = 0
        CGGetActiveDisplayList(0, nil, &count)
        var displays = Array(repeating: CGDirectDisplayID(), count: Int(count))
        CGGetActiveDisplayList(count, &displays, &count)

        let descriptors = displays.enumerated().map { index, displayId in
            DisplayDescriptor(
                id: index == 0 ? "main" : "display-\(displayId)",
                name: index == 0 ? "主显示器" : "显示器 \(index + 1)",
                width: CGDisplayPixelsWide(displayId),
                height: CGDisplayPixelsHigh(displayId),
                primary: index == 0
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
}
