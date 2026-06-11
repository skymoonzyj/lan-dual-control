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
    let pairingPassword: String
    let videoMode: VideoCaptureMode
    let inputMode: InputInjectionMode

    static func fromEnvironment() -> HostConfiguration {
        let environment = ProcessInfo.processInfo.environment
        let host = environment["LAN_DUAL_HOST"] ?? "0.0.0.0"
        let portValue = UInt16(environment["LAN_DUAL_PORT"] ?? "") ?? 43770
        let configuredPassword = environment["LAN_DUAL_PASSWORD"] ?? ""
        let password = configuredPassword.isEmpty ? "demo-password" : configuredPassword
        let rawVideoMode = environment["LAN_DUAL_VIDEO_MODE"]?.lowercased() ?? ""
        let videoMode = VideoCaptureMode(rawValue: rawVideoMode) ?? .auto
        let rawInputMode = environment["LAN_DUAL_INPUT_MODE"]?.lowercased() ?? ""
        let inputMode = InputInjectionMode(rawValue: rawInputMode) ?? .inject

        return HostConfiguration(
            host: host,
            port: portValue,
            pairingPassword: password,
            videoMode: videoMode,
            inputMode: inputMode
        )
    }
}
