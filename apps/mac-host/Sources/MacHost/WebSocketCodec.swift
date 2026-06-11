import CryptoKit
import Foundation

enum WebSocketFrame {
    case text(String)
    case close
}

enum WebSocketCodec {
    private static let guid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

    static func makeAcceptKey(_ key: String) -> String {
        let digest = Insecure.SHA1.hash(data: Data("\(key)\(guid)".utf8))
        return Data(digest).base64EncodedString()
    }

    static func encodeTextFrame(_ text: String) -> Data {
        let body = Data(text.utf8)
        var frame = Data([0x81])

        if body.count < 126 {
            frame.append(UInt8(body.count))
        } else if body.count <= 0xffff {
            frame.append(126)
            frame.append(UInt8((body.count >> 8) & 0xff))
            frame.append(UInt8(body.count & 0xff))
        } else {
            frame.append(127)
            let length = UInt64(body.count)
            for shift in stride(from: 56, through: 0, by: -8) {
                frame.append(UInt8((length >> UInt64(shift)) & 0xff))
            }
        }

        frame.append(body)
        return frame
    }

    static func decodeFrames(_ data: Data) -> (frames: [WebSocketFrame], rest: Data) {
        let bytes = [UInt8](data)
        var frames: [WebSocketFrame] = []
        var offset = 0

        while bytes.count - offset >= 2 {
            let first = bytes[offset]
            let second = bytes[offset + 1]
            let opcode = first & 0x0f
            let masked = (second & 0x80) != 0
            var length = Int(second & 0x7f)
            var headerLength = 2

            if length == 126 {
                guard bytes.count - offset >= 4 else { break }
                length = (Int(bytes[offset + 2]) << 8) | Int(bytes[offset + 3])
                headerLength = 4
            } else if length == 127 {
                guard bytes.count - offset >= 10 else { break }
                var longLength: UInt64 = 0
                for index in 0..<8 {
                    longLength = (longLength << 8) | UInt64(bytes[offset + 2 + index])
                }
                guard longLength <= UInt64(Int.max) else { break }
                length = Int(longLength)
                headerLength = 10
            }

            let maskLength = masked ? 4 : 0
            let frameLength = headerLength + maskLength + length
            guard bytes.count - offset >= frameLength else { break }

            if opcode == 0x8 {
                frames.append(.close)
                offset += frameLength
                continue
            }

            guard opcode == 0x1 else {
                offset += frameLength
                continue
            }

            let maskStart = offset + headerLength
            let payloadStart = maskStart + maskLength
            var payload = Array(bytes[payloadStart..<(payloadStart + length)])

            if masked {
                let mask = Array(bytes[maskStart..<(maskStart + 4)])
                for index in payload.indices {
                    payload[index] ^= mask[index % 4]
                }
            }

            if let text = String(data: Data(payload), encoding: .utf8) {
                frames.append(.text(text))
            }

            offset += frameLength
        }

        return (frames, Data(bytes[offset...]))
    }
}
