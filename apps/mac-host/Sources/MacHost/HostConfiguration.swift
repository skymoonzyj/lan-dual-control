import Foundation

enum VideoCaptureMode: String {
    case auto
    case screen
    case mock
}

enum InputInjectionMode: String {
    case inject
    case log
}

struct HostConfiguration {
    let host: String
    let port: UInt16
    let deviceName: String
    let pairingPassword: String
    let videoMode: VideoCaptureMode
    let inputMode: InputInjectionMode
    let maxScreenFps: Int
    let jpegQualityOverride: Double?
    let bonjourEnabled: Bool
    let buildId: String

    static func fromEnvironment() -> HostConfiguration {
        let environment = ProcessInfo.processInfo.environment
        let host = environment["LAN_DUAL_HOST"] ?? "0.0.0.0"
        let portValue = UInt16(environment["LAN_DUAL_PORT"] ?? "") ?? 43770
        let deviceName = sanitizedString(environment["LAN_DUAL_DEVICE_NAME"]) ?? "macOS 被控端"
        let configuredPassword = environment["LAN_DUAL_PASSWORD"] ?? ""
        let password = configuredPassword.isEmpty ? "demo-password" : configuredPassword
        let rawVideoMode = environment["LAN_DUAL_VIDEO_MODE"]?.lowercased() ?? ""
        let videoMode = VideoCaptureMode(rawValue: rawVideoMode) ?? .auto
        let rawInputMode = environment["LAN_DUAL_INPUT_MODE"]?.lowercased() ?? ""
        let inputMode = InputInjectionMode(rawValue: rawInputMode) ?? .log
        let maxScreenFps = clampedInt(environment["LAN_DUAL_MAX_SCREEN_FPS"], defaultValue: 30, range: 1...60)
        let jpegQualityOverride = clampedDouble(environment["LAN_DUAL_JPEG_QUALITY"], range: 0.1...0.95)
        let bonjourEnabled = boolValue(environment["LAN_DUAL_BONJOUR"], defaultValue: true)
        let buildId = sanitizedString(environment["LAN_DUAL_BUILD_ID"]) ?? "dev"

        return HostConfiguration(
            host: host,
            port: portValue,
            deviceName: deviceName,
            pairingPassword: password,
            videoMode: videoMode,
            inputMode: inputMode,
            maxScreenFps: maxScreenFps,
            jpegQualityOverride: jpegQualityOverride,
            bonjourEnabled: bonjourEnabled,
            buildId: buildId
        )
    }

    private static func sanitizedString(_ rawValue: String?) -> String? {
        let value = rawValue?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return value.isEmpty ? nil : value
    }

    private static func clampedInt(_ rawValue: String?, defaultValue: Int, range: ClosedRange<Int>) -> Int {
        guard let rawValue, let parsed = Int(rawValue) else {
            return defaultValue
        }

        return min(range.upperBound, max(range.lowerBound, parsed))
    }

    private static func clampedDouble(_ rawValue: String?, range: ClosedRange<Double>) -> Double? {
        guard let rawValue, let parsed = Double(rawValue) else {
            return nil
        }

        return min(range.upperBound, max(range.lowerBound, parsed))
    }

    private static func boolValue(_ rawValue: String?, defaultValue: Bool) -> Bool {
        guard let rawValue else {
            return defaultValue
        }

        switch rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "1", "true", "yes", "y", "on":
            return true
        case "0", "false", "no", "n", "off":
            return false
        default:
            return defaultValue
        }
    }
}
