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
}

