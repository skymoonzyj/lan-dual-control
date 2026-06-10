# 共享协议

当前协议以 JSON Lines 作为第一版调试格式：每条控制消息是一个 JSON 对象，并以换行符结束。

## 已准备的消息

- `hello`
- `hello_ack`
- `auth_request`
- `auth_result`
- `session_offer`
- `session_answer`
- `input_event`
- `clipboard_text`
- `clipboard_file_offer`

## 当前代码引用

- Windows 控制端示例：`apps/windows-client/app.js`
- macOS 被控端模型：`apps/mac-host/Sources/MacHost/ProtocolMessages.swift`
- 示例消息：`shared/protocol/messages.example.json`

后续进入真实视频流后，控制消息仍可用 JSON Lines，视频帧、音频帧和文件块再使用二进制帧。

