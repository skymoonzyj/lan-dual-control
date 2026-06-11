import Foundation

final class BonjourAdvertiser: NSObject, NetServiceDelegate {
    private let configuration: HostConfiguration
    private let logger: HostLogger
    private var service: NetService?

    init(configuration: HostConfiguration, logger: HostLogger) {
        self.configuration = configuration
        self.logger = logger
    }

    func start() {
        guard configuration.bonjourEnabled else {
            logger.info("Bonjour/mDNS 自动发现广播已禁用")
            return
        }

        let service = NetService(
            domain: "local.",
            type: "_lan-dual-control._tcp.",
            name: configuration.deviceName,
            port: Int32(configuration.port)
        )
        service.delegate = self
        service.setTXTRecord(NetService.data(fromTXTRecord: txtRecord()))
        service.publish()
        self.service = service
        logger.info("Bonjour/mDNS 自动发现广播启动：\(configuration.deviceName)._lan-dual-control._tcp.local:\(configuration.port)")
    }

    func stop() {
        service?.stop()
        service = nil
    }

    func netServiceDidPublish(_ sender: NetService) {
        logger.info("Bonjour/mDNS 自动发现已发布：\(sender.name)._lan-dual-control._tcp.local")
    }

    func netService(_ sender: NetService, didNotPublish errorDict: [String: NSNumber]) {
        logger.warn("Bonjour/mDNS 自动发现发布失败：\(errorDict)")
    }

    private func txtRecord() -> [String: Data] {
        [
            "txtvers": data("1"),
            "protocol": data("1"),
            "role": data("host"),
            "platform": data("macos"),
            "path": data("/discovery"),
            "controlPort": data(String(configuration.port)),
            "videoMode": data(configuration.videoMode.rawValue),
            "inputMode": data(configuration.inputMode.rawValue),
        ]
    }

    private func data(_ value: String) -> Data {
        Data(value.utf8)
    }
}
