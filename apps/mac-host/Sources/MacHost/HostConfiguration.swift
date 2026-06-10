import Foundation

struct HostConfiguration {
    let host: String
    let port: UInt16
    let pairingPassword: String

    static func fromEnvironment() -> HostConfiguration {
        let environment = ProcessInfo.processInfo.environment
        let host = environment["LAN_DUAL_HOST"] ?? "0.0.0.0"
        let portValue = UInt16(environment["LAN_DUAL_PORT"] ?? "") ?? 43770
        let password = environment["LAN_DUAL_PASSWORD"] ?? "demo-password"

        return HostConfiguration(host: host, port: portValue, pairingPassword: password)
    }
}

