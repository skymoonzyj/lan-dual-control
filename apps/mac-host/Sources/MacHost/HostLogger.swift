import Foundation

final class HostLogger {
    func info(_ message: String) {
        write(level: "INFO", message)
    }

    func warn(_ message: String) {
        write(level: "WARN", message)
    }

    func error(_ message: String) {
        write(level: "ERROR", message)
    }

    private func write(level: String, _ message: String) {
        let timestamp = HostTimestamp.isoString()
        print("[\(timestamp)] [\(level)] \(message)")
    }
}
