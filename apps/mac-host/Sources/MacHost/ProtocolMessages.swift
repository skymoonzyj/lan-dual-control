import Foundation

enum Platform: String, Codable {
    case windows
    case macos
    case unknown
}

struct HelloMessage: Codable {
    let type: String
    let clientName: String
    let clientPlatform: Platform
    let protocolVersion: Int
}

struct AuthRequest: Codable {
    let type: String
    let method: String
    let passwordHash: String?
    let password: String?
}

struct AuthResult: Codable {
    let type: String
    let ok: Bool
    let message: String
}

struct SessionOffer: Codable {
    let type: String
    let protocolVersion: Int?
    let wantVideo: Bool
    let wantAudio: Bool
    let wantClipboardText: Bool
    let wantClipboardFile: Bool
    let maxFps: Int
    let maxBandwidthKbps: Int
    let displayMode: String
    let preferredWidth: Int
    let preferredHeight: Int
    let preferredVideoCodec: String
    let preferredAudioCodec: String
}

struct SessionAnswer: Codable {
    let type: String
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
    let event: String
    let x: Double?
    let y: Double?
    let button: String?
    let action: String?
    let deltaX: Double?
    let deltaY: Double?
    let key: String?
    let code: String?
    let modifiers: [String]?
}

