import Foundation

#if os(macOS)
import CoreGraphics
#endif

final class InputEventInjector {
    private let logger: HostLogger

    init(logger: HostLogger) {
        self.logger = logger
    }

    func inject(_ message: InputEventMessage) {
        switch message.event {
        case "mouse_move":
            injectMouseMove(message)
        case "mouse_button":
            injectMouseButton(message)
        case "mouse_wheel":
            injectMouseWheel(message)
        case "key":
            injectKey(message)
        default:
            logger.warn("未知输入事件：\(message.event)")
        }
    }

    private func injectMouseMove(_ message: InputEventMessage) {
        guard let x = message.x, let y = message.y else { return }
        logger.info("TODO 鼠标移动：x=\(x), y=\(y)")
    }

    private func injectMouseButton(_ message: InputEventMessage) {
        logger.info("TODO 鼠标按钮：\(message.button ?? "?") / \(message.action ?? "?")")
    }

    private func injectMouseWheel(_ message: InputEventMessage) {
        logger.info("TODO 鼠标滚轮：dx=\(message.deltaX ?? 0), dy=\(message.deltaY ?? 0)")
    }

    private func injectKey(_ message: InputEventMessage) {
        logger.info("TODO 键盘：\(message.key ?? message.code ?? "?") / \(message.action ?? "?")")
    }
}

