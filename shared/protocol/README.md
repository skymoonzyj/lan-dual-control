# 共享协议

当前协议以 JSON Lines 作为第一版调试格式：每条控制消息是一个 JSON 对象，并以换行符结束。

## 已准备的消息

- `hello`
- `hello_ack`
- `auth_request`
- `auth_result`
- `session_offer`
- `session_answer`
- `display_settings`
- `display_settings_ack`
- `video_frame`
- `input_event`
- `clipboard_text`
- `clipboard_ack`
- `clipboard_file_offer`

## 当前代码引用

- Windows 控制端示例：`apps/windows-client/app.js`
- macOS 被控端模型：`apps/mac-host/Sources/MacHost/ProtocolMessages.swift`
- Windows 被控端骨架：`apps/windows-host/server.mjs`
- 示例消息：`shared/protocol/messages.example.json`

当前假 Mac 服务会用 `video_frame` JSON 消息发送 `data-url` 模拟帧，便于 Windows 端提前验证渲染流程。
当前 Windows 被控端骨架也会发送模拟 `video_frame`，便于后续 Mac 控制端提前验证反向控制画面渲染。
文本剪贴板当前使用 `clipboard_text` + `clipboard_ack`，通过 `clipboardId` 对应一次发送和一次确认。

后续进入真实视频流后，控制消息仍可用 JSON Lines，视频帧、音频帧和文件块可以升级为二进制帧。
