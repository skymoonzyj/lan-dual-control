import Foundation

#if os(macOS)
import ApplicationServices
import CoreGraphics
#endif

struct MacPermissionSnapshot {
    let screenRecordingGranted: Bool
    let accessibilityGranted: Bool
    let inputMonitoringGranted: Bool

    var isReadyForControl: Bool {
        screenRecordingGranted && accessibilityGranted
    }

    var summary: String {
        [
            "屏幕录制：\(screenRecordingGranted ? "已开启" : "未开启")",
            "辅助功能：\(accessibilityGranted ? "已开启" : "未开启")",
            "输入监控：\(inputMonitoringGranted ? "待实测" : "待实测")"
        ].joined(separator: "，")
    }
}

final class MacPermissionCenter {
    func snapshot() -> MacPermissionSnapshot {
        MacPermissionSnapshot(
            screenRecordingGranted: isScreenRecordingGranted(),
            accessibilityGranted: isAccessibilityGranted(),
            inputMonitoringGranted: false
        )
    }

    func openPrivacySettingsHint() -> String {
        """
        系统设置 -> 隐私与安全性：
        1. 屏幕录制：允许 lan-dual-mac-host
        2. 辅助功能：允许 lan-dual-mac-host
        3. 输入监控：如系统提示，也允许 lan-dual-mac-host
        """
    }

    private func isScreenRecordingGranted() -> Bool {
        #if os(macOS)
        if #available(macOS 10.15, *) {
            return CGPreflightScreenCaptureAccess()
        }
        return true
        #else
        return false
        #endif
    }

    private func isAccessibilityGranted() -> Bool {
        #if os(macOS)
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: false] as CFDictionary
        return AXIsProcessTrustedWithOptions(options)
        #else
        return false
        #endif
    }
}

