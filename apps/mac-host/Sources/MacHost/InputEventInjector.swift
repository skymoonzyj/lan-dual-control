import Foundation

#if os(macOS)
import ApplicationServices
import CoreGraphics
#endif

struct InputInjectionTarget {
    let displayId: String
    let frameWidth: Int
    let frameHeight: Int
}

struct InputInjectionResult {
    let accepted: Bool
    let injected: Bool
    let mode: String
    let reason: String
    let code: String?

    init(accepted: Bool, injected: Bool, mode: String, reason: String, code: String? = nil) {
        self.accepted = accepted
        self.injected = injected
        self.mode = mode
        self.reason = reason
        self.code = code
    }
}

final class InputEventInjector {
    private let logger: HostLogger
    private let mode: InputInjectionMode

    init(logger: HostLogger, mode: InputInjectionMode = .inject) {
        self.logger = logger
        self.mode = mode
    }

    func inject(_ message: InputEventMessage, target: InputInjectionTarget? = nil) -> InputInjectionResult {
        if mode == .log {
            logOnly(message)
            return InputInjectionResult(
                accepted: true,
                injected: false,
                mode: "log",
                reason: "macOS 输入注入处于日志模式，已记录但未注入系统。"
            )
        }

        switch message.normalizedEvent {
        case "mouse_move":
            return injectMouseMove(message, target: target)
        case "mouse_button":
            return injectMouseButton(message, target: target)
        case "mouse_wheel":
            return injectMouseWheel(message)
        case "key":
            return injectKey(message)
        default:
            logger.warn("未知输入事件：\(message.event ?? message.action ?? "unknown")")
            return InputInjectionResult(
                accepted: false,
                injected: false,
                mode: "inject",
                reason: "未知输入事件：\(message.event ?? message.action ?? "unknown")"
            )
        }
    }

    private func logOnly(_ message: InputEventMessage) {
        switch message.normalizedEvent {
        case "mouse_move":
            logger.info("日志模式鼠标移动：x=\(message.remoteX ?? message.x ?? 0), y=\(message.remoteY ?? message.y ?? 0)")
        case "mouse_button":
            logger.info("日志模式鼠标按钮：\(message.button ?? "?") / \(message.action ?? "?")")
        case "mouse_wheel":
            logger.info("日志模式鼠标滚轮：dx=\(message.deltaX ?? 0), dy=\(message.deltaY ?? 0)")
        case "key":
            let modifiers = message.remoteModifiers ?? message.modifiers ?? []
            let modifierText = modifiers.isEmpty ? "无修饰键" : modifiers.joined(separator: "+")
            logger.info("日志模式键盘：\(message.key ?? message.code ?? "?") / \(modifierText)")
        default:
            logger.warn("日志模式未知输入事件：\(message.event ?? message.action ?? "unknown")")
        }
    }

    private func injectMouseMove(_ message: InputEventMessage, target: InputInjectionTarget?) -> InputInjectionResult {
        guard let point = screenPoint(from: message, target: target) else {
            logger.warn("鼠标移动缺少坐标")
            return InputInjectionResult(
                accepted: false,
                injected: false,
                mode: "inject",
                reason: "鼠标移动缺少坐标"
            )
        }

        #if os(macOS)
        guard let event = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left) else {
            return InputInjectionResult(accepted: false, injected: false, mode: "inject", reason: "创建鼠标移动事件失败")
        }
        event.post(tap: .cghidEventTap)
        return InputInjectionResult(accepted: true, injected: true, mode: "inject", reason: "macOS 鼠标移动已注入。")
        #else
        logger.info("非 macOS 环境，跳过鼠标移动：x=\(point.x), y=\(point.y)")
        return InputInjectionResult(accepted: true, injected: false, mode: "log", reason: "非 macOS 环境，已跳过鼠标移动注入。")
        #endif
    }

    private func injectMouseButton(_ message: InputEventMessage, target: InputInjectionTarget?) -> InputInjectionResult {
        guard let point = screenPoint(from: message, target: target) else {
            logger.warn("鼠标按钮缺少坐标")
            return InputInjectionResult(
                accepted: false,
                injected: false,
                mode: "inject",
                reason: "鼠标按钮缺少坐标"
            )
        }

        #if os(macOS)
        let button = mouseButton(from: message.button ?? message.localButton.map(String.init))
        let action = message.action ?? "down"
        let type = mouseEventType(button: button, action: action)
        guard let event = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: button) else {
            return InputInjectionResult(accepted: false, injected: false, mode: "inject", reason: "创建鼠标按钮事件失败")
        }
        event.post(tap: .cghidEventTap)
        logger.info("已注入鼠标\(action == "up" ? "抬起" : "按下")：\(message.button ?? "?") / x=\(Int(point.x)), y=\(Int(point.y))")
        return InputInjectionResult(accepted: true, injected: true, mode: "inject", reason: "macOS 鼠标按钮已注入。")
        #else
        logger.info("非 macOS 环境，跳过鼠标按钮：\(message.button ?? "?") / \(message.action ?? "?")")
        return InputInjectionResult(accepted: true, injected: false, mode: "log", reason: "非 macOS 环境，已跳过鼠标按钮注入。")
        #endif
    }

    private func injectMouseWheel(_ message: InputEventMessage) -> InputInjectionResult {
        #if os(macOS)
        let wheelX = -clampedScrollDelta(message.deltaX ?? 0)
        let wheelY = -clampedScrollDelta(message.deltaY ?? 0)
        guard let event = CGEvent(
            scrollWheelEvent2Source: nil,
            units: .pixel,
            wheelCount: 2,
            wheel1: wheelY,
            wheel2: wheelX,
            wheel3: 0
        ) else {
            return InputInjectionResult(accepted: false, injected: false, mode: "inject", reason: "创建鼠标滚轮事件失败")
        }
        event.post(tap: .cghidEventTap)
        logger.info("已注入鼠标滚轮：dx=\(message.deltaX ?? 0), dy=\(message.deltaY ?? 0)")
        return InputInjectionResult(accepted: true, injected: true, mode: "inject", reason: "macOS 鼠标滚轮已注入。")
        #else
        logger.info("非 macOS 环境，跳过鼠标滚轮：dx=\(message.deltaX ?? 0), dy=\(message.deltaY ?? 0)")
        return InputInjectionResult(accepted: true, injected: false, mode: "log", reason: "非 macOS 环境，已跳过鼠标滚轮注入。")
        #endif
    }

    private func injectKey(_ message: InputEventMessage) -> InputInjectionResult {
        let modifiers = message.remoteModifiers ?? message.modifiers ?? []
        guard let keyCode = keyCode(for: message) else {
            logger.warn("暂不支持键盘注入：\(message.key ?? message.code ?? "?")")
            return InputInjectionResult(
                accepted: false,
                injected: false,
                mode: "inject",
                reason: "暂不支持键盘注入：\(message.key ?? message.code ?? "?")"
            )
        }

        #if os(macOS)
        let flags = eventFlags(from: message, modifiers: modifiers)
        let keyDownInjected = postKeyboardEvent(keyCode: keyCode, keyDown: true, flags: flags)
        let keyUpInjected = postKeyboardEvent(keyCode: keyCode, keyDown: false, flags: flags)
        let modifierText = modifiers.isEmpty ? "无修饰键" : modifiers.joined(separator: "+")
        let shortcutText = message.shortcutAction.map { " / 快捷键：\($0)" } ?? ""
        logger.info("已注入键盘：\(message.key ?? message.code ?? "?") / \(modifierText)\(shortcutText)")
        return InputInjectionResult(
            accepted: keyDownInjected && keyUpInjected,
            injected: keyDownInjected && keyUpInjected,
            mode: "inject",
            reason: keyDownInjected && keyUpInjected ? "macOS 键盘事件已注入。" : "macOS 键盘事件创建失败。"
        )
        #else
        logger.info("非 macOS 环境，跳过键盘：\(message.key ?? message.code ?? "?")")
        return InputInjectionResult(accepted: true, injected: false, mode: "log", reason: "非 macOS 环境，已跳过键盘注入。")
        #endif
    }

    private func screenPoint(from message: InputEventMessage, target: InputInjectionTarget?) -> CGPoint? {
        #if os(macOS)
        guard let bounds = displayBounds(for: target?.displayId) else {
            return nil
        }

        let normalized = normalizedPoint(from: message, target: target)
        let x = bounds.minX + (bounds.width - 1) * normalized.x
        let y = bounds.minY + (bounds.height - 1) * normalized.y
        return CGPoint(x: x, y: y)
        #else
        let normalized = normalizedPoint(from: message, target: target)
        return CGPoint(x: normalized.x, y: normalized.y)
        #endif
    }

    private func normalizedPoint(from message: InputEventMessage, target: InputInjectionTarget?) -> (x: Double, y: Double) {
        if let x = message.x, let y = message.y, x >= 0, x <= 1, y >= 0, y <= 1 {
            return (x, y)
        }

        if let remoteX = message.remoteX,
           let remoteY = message.remoteY,
           let target,
           target.frameWidth > 1,
           target.frameHeight > 1 {
            return (
                clamp(remoteX / Double(target.frameWidth - 1)),
                clamp(remoteY / Double(target.frameHeight - 1))
            )
        }

        return (0, 0)
    }

    private func clamp(_ value: Double) -> Double {
        min(1, max(0, value))
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

    private func displayBounds(for descriptorId: String?) -> CGRect? {
        let displays = activeDisplays()
        guard !displays.isEmpty else {
            return nil
        }

        let displayId: CGDirectDisplayID
        if descriptorId == "main" || descriptorId == nil {
            let mainDisplay = CGMainDisplayID()
            displayId = displays.contains(mainDisplay) ? mainDisplay : displays[0]
        } else if let descriptorId,
                  descriptorId.hasPrefix("display-"),
                  let rawValue = UInt32(descriptorId.dropFirst("display-".count)),
                  displays.contains(CGDirectDisplayID(rawValue)) {
            displayId = CGDirectDisplayID(rawValue)
        } else {
            displayId = displays[0]
        }

        return CGDisplayBounds(displayId)
    }

    private func mouseButton(from value: String?) -> CGMouseButton {
        switch value?.lowercased() {
        case "right", "2":
            return .right
        case "middle", "center", "1":
            return .center
        default:
            return .left
        }
    }

    private func mouseEventType(button: CGMouseButton, action: String) -> CGEventType {
        let isUp = action == "up"
        switch button {
        case .right:
            return isUp ? .rightMouseUp : .rightMouseDown
        case .center:
            return isUp ? .otherMouseUp : .otherMouseDown
        default:
            return isUp ? .leftMouseUp : .leftMouseDown
        }
    }

    private func clampedScrollDelta(_ value: Double) -> Int32 {
        Int32(max(-10_000, min(10_000, value.rounded())))
    }

    private func eventFlags(from message: InputEventMessage, modifiers: [String]) -> CGEventFlags {
        let normalizedModifiers = Set(modifiers.map { $0.lowercased() })
        let hasMappedModifiers = !normalizedModifiers.isEmpty
        var flags = CGEventFlags()

        if normalizedModifiers.contains("meta") || normalizedModifiers.contains("command") || (!hasMappedModifiers && message.metaKey == true) {
            flags.insert(.maskCommand)
        }
        if normalizedModifiers.contains("alt") || normalizedModifiers.contains("option") || (!hasMappedModifiers && message.altKey == true) {
            flags.insert(.maskAlternate)
        }
        if normalizedModifiers.contains("ctrl") || normalizedModifiers.contains("control") || (!hasMappedModifiers && message.ctrlKey == true) {
            flags.insert(.maskControl)
        }
        if normalizedModifiers.contains("shift") || (!hasMappedModifiers && message.shiftKey == true) {
            flags.insert(.maskShift)
        }

        return flags
    }

    private func postKeyboardEvent(keyCode: CGKeyCode, keyDown: Bool, flags: CGEventFlags) -> Bool {
        guard let event = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: keyDown) else {
            logger.warn("创建键盘事件失败：keyCode=\(keyCode)")
            return false
        }

        event.flags = flags
        event.post(tap: .cghidEventTap)
        return true
    }
    #endif

    private func keyCode(for message: InputEventMessage) -> CGKeyCode? {
        let code = message.code ?? message.localCode
        if let code, let mapped = keyCodeByCode[code] {
            return mapped
        }

        guard let key = message.key?.lowercased() ?? message.localKey?.lowercased() else {
            return nil
        }

        return keyCodeByKey[key]
    }
}

private let keyCodeByCode: [String: CGKeyCode] = [
    "KeyA": 0, "KeyS": 1, "KeyD": 2, "KeyF": 3, "KeyH": 4, "KeyG": 5,
    "KeyZ": 6, "KeyX": 7, "KeyC": 8, "KeyV": 9, "KeyB": 11, "KeyQ": 12,
    "KeyW": 13, "KeyE": 14, "KeyR": 15, "KeyY": 16, "KeyT": 17,
    "Digit1": 18, "Digit2": 19, "Digit3": 20, "Digit4": 21, "Digit6": 22,
    "Digit5": 23, "Equal": 24, "Digit9": 25, "Digit7": 26, "Minus": 27,
    "Digit8": 28, "Digit0": 29, "BracketRight": 30, "KeyO": 31, "KeyU": 32,
    "BracketLeft": 33, "KeyI": 34, "KeyP": 35, "Enter": 36, "Return": 36,
    "KeyL": 37, "KeyJ": 38, "Quote": 39, "KeyK": 40, "Semicolon": 41,
    "Backslash": 42, "Comma": 43, "Slash": 44, "KeyN": 45, "KeyM": 46,
    "Period": 47, "Tab": 48, "Space": 49, "Backquote": 50, "Backspace": 51,
    "Delete": 51, "Escape": 53, "MetaLeft": 55, "OSLeft": 55, "ShiftLeft": 56,
    "CapsLock": 57, "AltLeft": 58, "ControlLeft": 59, "ShiftRight": 60,
    "AltRight": 61, "ControlRight": 62, "F1": 122, "F2": 120, "F3": 99,
    "F4": 118, "F5": 96, "F6": 97, "F7": 98, "F8": 100, "F9": 101,
    "F10": 109, "F11": 103, "F12": 111, "Home": 115, "PageUp": 116,
    "ForwardDelete": 117, "End": 119, "PageDown": 121, "ArrowLeft": 123,
    "ArrowRight": 124, "ArrowDown": 125, "ArrowUp": 126,
]

private let keyCodeByKey: [String: CGKeyCode] = [
    "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7,
    "c": 8, "v": 9, "b": 11, "q": 12, "w": 13, "e": 14, "r": 15,
    "y": 16, "t": 17, "1": 18, "2": 19, "3": 20, "4": 21, "6": 22,
    "5": 23, "=": 24, "+": 24, "9": 25, "7": 26, "-": 27, "_": 27,
    "8": 28, "0": 29, "]": 30, "}": 30, "o": 31, "u": 32, "[": 33,
    "{": 33, "i": 34, "p": 35, "enter": 36, "return": 36, "l": 37,
    "j": 38, "'": 39, "\"": 39, "k": 40, ";": 41, ":": 41, "\\": 42,
    "|": 42, ",": 43, "<": 43, "/": 44, "?": 44, "n": 45, "m": 46,
    ".": 47, ">": 47, "tab": 48, " ": 49, "space": 49, "`": 50, "~": 50,
    "backspace": 51, "delete": 51, "escape": 53, "esc": 53, "meta": 55,
    "command": 55, "shift": 56, "capslock": 57, "alt": 58, "option": 58,
    "control": 59, "ctrl": 59, "f1": 122, "f2": 120, "f3": 99, "f4": 118,
    "f5": 96, "f6": 97, "f7": 98, "f8": 100, "f9": 101, "f10": 109,
    "f11": 103, "f12": 111, "home": 115, "pageup": 116, "end": 119,
    "pagedown": 121, "arrowleft": 123, "left": 123, "arrowright": 124,
    "right": 124, "arrowdown": 125, "down": 125, "arrowup": 126, "up": 126,
]
