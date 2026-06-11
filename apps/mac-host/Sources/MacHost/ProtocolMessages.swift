import Foundation

enum Platform: String, Codable {
    case windows
    case macos
    case unknown
}

struct DisplayDescriptor: Codable {
    let id: String
    let name: String
    let width: Int
    let height: Int
    let primary: Bool

    var jsonObject: [String: Any] {
        [
            "id": id,
            "name": name,
            "width": width,
            "height": height,
            "primary": primary,
        ]
    }
}

struct HelloMessage: Codable {
    let type: String
    let clientName: String
    let clientPlatform: Platform
    let protocolVersion: Int
}

struct AuthRequest: Codable {
    let type: String
    let method: String?
    let passwordHash: String?
    let password: String?
}

struct AuthResult: Codable {
    let type: String
    let ok: Bool
    let message: String
}

struct MessageEnvelope: Codable {
    let type: String
    let clipboardId: String?
    let transferId: String?
    let requestId: String?
}

struct SessionOffer: Codable {
    let type: String
    let protocolVersion: Int?
    let wantVideo: Bool?
    let wantAudio: Bool?
    let wantClipboardText: Bool?
    let wantClipboardFile: Bool?
    let maxFps: Int?
    let maxBandwidthKbps: Int?
    let qualityPreset: String?
    let displayMode: String?
    let displayId: String?
    let preferredWidth: Int?
    let preferredHeight: Int?
    let preferredVideoCodec: String?
    let preferredVideoEncoding: String?
    let preferredAudioCodec: String?
    let audioVolume: Int?
    let mockScenario: String?
}

struct SessionAnswer: Codable {
    let type: String
    let ok: Bool?
    let screenWidth: Int
    let screenHeight: Int
    let fps: Int
    let videoCodec: String
    let audioEnabled: Bool
    let audioCodec: String
    let clipboardTextEnabled: Bool
    let clipboardFileEnabled: Bool
}

struct InputEventMessage: Codable {
    let type: String
    let event: String?
    let kind: String?
    let detail: String?
    let sequence: Int?
    let pointerType: String?
    let x: Double?
    let y: Double?
    let remoteX: Double?
    let remoteY: Double?
    let button: String?
    let action: String?
    let deltaX: Double?
    let deltaY: Double?
    let key: String?
    let code: String?
    let repeatKey: Bool?
    let ctrlKey: Bool?
    let altKey: Bool?
    let shiftKey: Bool?
    let metaKey: Bool?
    let modifiers: [String]?
    let remoteModifiers: [String]?
    let keyboardMapping: [String: String]?
    let shortcutProfile: String?
    let shortcutAction: String?
    let localKey: String?
    let localCode: String?
    let localButton: Int?
    let localCtrlKey: Bool?
    let localAltKey: Bool?
    let localShiftKey: Bool?
    let localMetaKey: Bool?

    enum CodingKeys: String, CodingKey {
        case type
        case event
        case kind
        case detail
        case sequence
        case pointerType
        case x
        case y
        case remoteX
        case remoteY
        case button
        case action
        case deltaX
        case deltaY
        case key
        case code
        case repeatKey = "repeat"
        case ctrlKey
        case altKey
        case shiftKey
        case metaKey
        case modifiers
        case remoteModifiers
        case keyboardMapping
        case shortcutProfile
        case shortcutAction
        case localKey
        case localCode
        case localButton
        case localCtrlKey
        case localAltKey
        case localShiftKey
        case localMetaKey
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        type = try container.decode(String.self, forKey: .type)
        event = try container.decodeIfPresent(String.self, forKey: .event)
        kind = try container.decodeIfPresent(String.self, forKey: .kind)
        detail = try container.decodeIfPresent(String.self, forKey: .detail)
        sequence = try container.decodeIfPresent(Int.self, forKey: .sequence)
        pointerType = try container.decodeIfPresent(String.self, forKey: .pointerType)
        x = try container.decodeIfPresent(Double.self, forKey: .x)
        y = try container.decodeIfPresent(Double.self, forKey: .y)
        remoteX = try container.decodeIfPresent(Double.self, forKey: .remoteX)
        remoteY = try container.decodeIfPresent(Double.self, forKey: .remoteY)
        button = Self.decodeFlexibleString(container, forKey: .button)
        action = try container.decodeIfPresent(String.self, forKey: .action)
        deltaX = try container.decodeIfPresent(Double.self, forKey: .deltaX)
        deltaY = try container.decodeIfPresent(Double.self, forKey: .deltaY)
        key = try container.decodeIfPresent(String.self, forKey: .key)
        code = try container.decodeIfPresent(String.self, forKey: .code)
        repeatKey = try container.decodeIfPresent(Bool.self, forKey: .repeatKey)
        ctrlKey = try container.decodeIfPresent(Bool.self, forKey: .ctrlKey)
        altKey = try container.decodeIfPresent(Bool.self, forKey: .altKey)
        shiftKey = try container.decodeIfPresent(Bool.self, forKey: .shiftKey)
        metaKey = try container.decodeIfPresent(Bool.self, forKey: .metaKey)
        modifiers = try container.decodeIfPresent([String].self, forKey: .modifiers)
        remoteModifiers = try container.decodeIfPresent([String].self, forKey: .remoteModifiers)
        keyboardMapping = try container.decodeIfPresent([String: String].self, forKey: .keyboardMapping)
        shortcutProfile = try container.decodeIfPresent(String.self, forKey: .shortcutProfile)
        shortcutAction = try container.decodeIfPresent(String.self, forKey: .shortcutAction)
        localKey = try container.decodeIfPresent(String.self, forKey: .localKey)
        localCode = try container.decodeIfPresent(String.self, forKey: .localCode)
        localButton = try container.decodeIfPresent(Int.self, forKey: .localButton)
        localCtrlKey = try container.decodeIfPresent(Bool.self, forKey: .localCtrlKey)
        localAltKey = try container.decodeIfPresent(Bool.self, forKey: .localAltKey)
        localShiftKey = try container.decodeIfPresent(Bool.self, forKey: .localShiftKey)
        localMetaKey = try container.decodeIfPresent(Bool.self, forKey: .localMetaKey)
    }

    var normalizedEvent: String {
        if let event {
            return event
        }

        switch action {
        case "move":
            return "mouse_move"
        case "down", "up":
            return "mouse_button"
        case "wheel":
            return "mouse_wheel"
        case "key":
            return "key"
        default:
            break
        }

        if kind?.contains("鼠标移动") == true {
            return "mouse_move"
        }
        if kind?.contains("鼠标") == true {
            return "mouse_button"
        }
        if kind?.contains("滚轮") == true {
            return "mouse_wheel"
        }
        if kind?.contains("键盘") == true {
            return "key"
        }

        return "unknown"
    }

    private static func decodeFlexibleString(_ container: KeyedDecodingContainer<CodingKeys>, forKey key: CodingKeys) -> String? {
        if let value = try? container.decodeIfPresent(String.self, forKey: key) {
            return value
        }
        if let value = try? container.decodeIfPresent(Int.self, forKey: key) {
            return String(value)
        }
        if let value = try? container.decodeIfPresent(Double.self, forKey: key) {
            return String(value)
        }
        return nil
    }
}
