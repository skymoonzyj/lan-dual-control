import Foundation

#if os(macOS)
import AppKit
#endif

final class MacClipboardBridge {
    private let logger: HostLogger

    init(logger: HostLogger) {
        self.logger = logger
    }

    func changeCount() -> Int {
        #if os(macOS)
        return NSPasteboard.general.changeCount
        #else
        return 0
        #endif
    }

    func readText() -> String? {
        #if os(macOS)
        return NSPasteboard.general.string(forType: .string)
        #else
        return nil
        #endif
    }

    func readFileURLs() -> [URL] {
        #if os(macOS)
        let options: [NSPasteboard.ReadingOptionKey: Any] = [
            .urlReadingFileURLsOnly: true,
        ]
        let objects = NSPasteboard.general.readObjects(forClasses: [NSURL.self], options: options) ?? []
        return objects.compactMap { object in
            if let url = object as? URL {
                return url
            }
            return (object as? NSURL).map { $0 as URL }
        }
        #else
        return []
        #endif
    }

    @discardableResult
    func writeText(_ text: String) -> Bool {
        #if os(macOS)
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        let ok = pasteboard.setString(text, forType: .string)
        if !ok {
            logger.warn("写入 macOS 系统剪贴板失败")
        }
        return ok
        #else
        logger.warn("非 macOS 环境，跳过系统剪贴板写入")
        return false
        #endif
    }

    @discardableResult
    func writeFileURLs(_ urls: [URL]) -> Bool {
        #if os(macOS)
        guard !urls.isEmpty else {
            return false
        }

        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        let ok = pasteboard.writeObjects(urls as [NSURL])
        if !ok {
            logger.warn("写入 macOS 文件剪贴板失败")
        }
        return ok
        #else
        logger.warn("非 macOS 环境，跳过系统文件剪贴板写入")
        return false
        #endif
    }
}
