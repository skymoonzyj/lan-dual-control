import Foundation

let config = HostConfiguration.fromEnvironment()
let logger = HostLogger()

logger.info("局域网双端远控 macOS 被控端启动")
logger.info("监听地址：\(config.host):\(config.port)")

let permissions = MacPermissionCenter()
let snapshot = permissions.snapshot()
logger.info(snapshot.summary)

if !snapshot.isReadyForControl {
    logger.warn("权限尚未全部开启。明后天在 Mac mini 上首次运行时，需要按 README 打开系统权限。")
}

let host = MacHostService(
    configuration: config,
    permissions: permissions,
    screenCapture: ScreenCaptureCoordinator(logger: logger),
    inputInjector: InputEventInjector(logger: logger),
    logger: logger
)

do {
    try await host.start()
} catch {
    logger.error("被控端启动失败：\(error.localizedDescription)")
    Foundation.exit(1)
}
