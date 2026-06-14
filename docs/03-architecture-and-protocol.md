# 架构与通信协议草案

## 1. 基本角色

每台设备都可以拥有两个角色：

- 控制端：显示远程画面，播放远程声音，发送鼠标键盘事件，发起剪贴板同步。
- 被控端：采集本机屏幕和声音，执行远程输入事件，响应剪贴板和文件传输。

同一时刻一台设备可以只启用其中一个角色，也可以同时待命。

## 2. 连接方式

第一版保留手动 IP 连接，同时加入 HTTP 发现骨架，方便在没有真实 Mac 硬件时先联调设备列表。

示例：

```text
Mac 被控端地址：192.168.1.23
端口：43770
Windows 控制端输入：192.168.1.23:43770
```

端口暂定：

- 控制协议端口：43770
- 自动发现：第一阶段复用控制端口的 `/discovery` HTTP 接口；macOS 被控端已开始广播 Bonjour/mDNS 服务 `_lan-dual-control._tcp`
- 文件传输端口：默认复用控制连接，必要时再拆分独立端口

第一版不做公网穿透，不做云账号登录。

### 2.1 局域网发现骨架

当前 Windows 控制端的“刷新设备”会探测以下候选地址：

- 当前输入框中的地址和端口。
- `127.0.0.1:43770` 和 `127.0.0.1:43771`。
- 最近连接历史。
- 内置的本地调试示例地址。

被控端服务提供：

```text
GET http://host:port/discovery
```

响应示例：

```json
{
  "type": "lan_dual_discovery",
  "protocolVersion": 1,
  "deviceId": "mock-mac-127.0.0.1-43770",
  "deviceName": "本机假 Mac",
  "platform": "macos",
  "role": "host",
  "host": "127.0.0.1",
  "port": 43770,
  "controlPort": 43770,
  "capabilities": {
    "video": true,
    "audio": true,
    "input": true,
    "clipboardText": true,
    "clipboardFile": true,
    "reverseControl": true
  },
  "lastSeenAt": "2026-06-10T12:00:00.000Z"
}
```

说明：

- `platform` 当前使用 `macos` 或 `windows`。
- `role` 当前使用 `host`、`controller` 或 `both`。
- `controlPort` 是 WebSocket 控制协议端口。
- 浏览器页面不能直接做 UDP 广播，所以当前仍保留 HTTP 探测骨架先跑通 UI 和两端协议。
- macOS 被控端会发布 Bonjour/mDNS 服务 `_lan-dual-control._tcp`，TXT 记录包含 `protocol=1`、`role=host`、`platform=macos`、`path=/discovery`、`controlPort`、`videoMode` 和 `inputMode`。
- 真正跨设备自动发现的下一步是由 Windows/Tauri 原生层浏览 `_lan-dual-control._tcp`，再读取 TXT 记录并请求对应的 `/discovery`。

## 3. 连接状态机

```text
idle
  -> connecting
  -> authenticating
  -> negotiating
  -> streaming
  -> reconnecting
  -> disconnected
```

状态说明：

- idle：未连接。
- connecting：正在建立局域网连接。
- authenticating：正在验证密码或配对码。
- negotiating：交换屏幕尺寸、帧率、编码格式、音频能力、剪贴板能力。
- streaming：正在传输画面、声音、输入和剪贴板事件。
- reconnecting：短暂断线后尝试恢复；Windows 控制端当前最多自动重连 3 次，用户手动断开不会触发自动重连。
- disconnected：连接已结束。

## 4. 会话握手

第一版握手流程：

```text
Client -> Host: hello
Host -> Client: hello_ack
Client -> Host: auth_request
Host -> Client: auth_result
Client -> Host: session_offer
Host -> Client: session_answer
Host -> Client: video_frame loop
Host -> Client: audio_frame loop
Client -> Host: input_event loop
Both directions: clipboard_event loop
```

被控端必须记录每条连接的认证状态。除 `hello` 和 `auth_request` 外，未认证连接发来的 `session_offer`、`display_settings`、`input_event`、剪贴板、音频设置和反控消息都必须拒绝，并返回 `LAN002`。同一连接内连续认证失败次数达到上限后，被控端可以返回最后一次 `auth_result` 后主动断开连接。

## 5. 控制消息格式

第一版可以用 JSON 消息，便于调试。后续性能不足时再改为二进制消息。

### hello

```json
{
  "type": "hello",
  "clientName": "Windows-PC",
  "clientPlatform": "windows",
  "protocolVersion": 1
}
```

### auth_request

```json
{
  "type": "auth_request",
  "method": "password",
  "passwordHash": "sha256-value"
}
```

### auth_result

```json
{
  "type": "auth_result",
  "ok": true,
  "message": "验证通过",
  "attemptsRemaining": 3,
  "maxAttempts": 3
}
```

### session_offer

```json
{
  "type": "session_offer",
  "wantVideo": true,
  "wantAudio": true,
  "wantClipboardText": true,
  "wantClipboardFile": true,
  "maxFps": 60,
  "maxBandwidthKbps": 50000,
  "qualityPreset": "balanced",
  "displayMode": "windowed",
  "displayId": "main",
  "preferredWidth": 1920,
  "preferredHeight": 1080,
  "preferredVideoCodec": "h264",
  "preferredVideoEncoding": "annexb",
  "preferredVideoTransport": "binary-jpeg",
  "supportedVideoTransports": ["json", "binary-jpeg"],
  "preferredAudioCodec": "opus",
  "audioVolume": 80
}
```

### session_answer

```json
{
  "type": "session_answer",
  "ok": true,
  "videoCodec": "h264",
  "videoEncoding": "annexb",
  "videoTransport": "json",
  "audioCodec": "pcm-f32le",
  "requestedAudioCodec": "opus",
  "audioMode": "system-pcm",
  "fps": 30,
  "requestedFps": 60,
  "maxScreenFps": 30,
  "maxBandwidthKbps": 50000,
  "width": 1920,
  "height": 1080,
  "displays": [
    {
      "id": "main",
      "name": "内建显示器",
      "width": 1920,
      "height": 1080,
      "primary": true
    }
  ],
  "activeDisplayId": "main",
  "audioEnabled": true,
  "sampleRate": 48000,
  "channels": 2,
  "clipboardText": true,
  "clipboardFile": true,
  "hostMode": "mac-host-h264-stream"
}
```

`hostMode` 是可选调试字段，用于标记当前被控端是否处在骨架、模拟帧或真实采集模式。

## 6. 视频帧格式

第一版协议先定义统一的 `video_frame` 消息，便于 Windows 控制端和 Mac 被控端对接。

当前假 Mac 服务使用 JSON 文本帧发送 `data-url` 模拟画面：

```json
{
  "type": "video_frame",
  "frameId": 1,
  "timestamp": "2026-06-10T12:00:00.000Z",
  "width": 1920,
  "height": 1080,
  "codec": "mock-svg",
  "encoding": "data-url",
  "keyFrame": true,
  "capturePipeline": "mock-svg",
  "activeDisplayId": "main",
  "displayName": "内建显示器",
  "droppedFrames": 0,
  "dataUrl": "data:image/svg+xml;base64,..."
}
```

真实 Mac 端接入后建议：

- 控制消息仍用 JSON。
- 初期可以发送 `codec: "jpeg"`、`encoding: "data-url"` 或 `encoding: "base64"` 的 JPEG 帧，降低联调难度。
- macOS 被控端当前使用 `capturePipeline: "background-jpeg"` 表示截图和 JPEG 编码在后台队列执行；如果上一帧尚未完成，会丢弃调度并在后续 `video_frame.droppedFrames` 中带回数量。
- FPS 诊断字段中，`requestedFps` 表示控制端请求帧率，`fps` 表示被控端当前实际目标帧率，`maxScreenFps` 表示被控端真实屏幕采集上限，`frameIntervalMs` 表示当前定时器间隔。当前 macOS 真实屏幕 JPEG 管线默认会把实际帧率限制到 `LAN_DUAL_MAX_SCREEN_FPS`。
- `qualityPreset`、`jpegQuality` 可作为调试字段返回实际使用的画质预设和 JPEG 压缩质量。
- `activeDisplayId`、`displayName` 是可选诊断字段，用于标记当前帧来自哪个被控端显示器；旧控制端可以忽略。
- `preferredVideoTransport` / `videoTransport` 是可选传输方式字段；缺省或 `json` 表示继续用 WebSocket 文本 JSON 发送完整 `video_frame`，`binary-jpeg` 表示 JPEG 帧可用 WebSocket binary frame 发送。
- `supportedVideoTransports` 可声明控制端兼容的传输方式；旧被控端可以忽略。
- `binary-jpeg` 帧仍保留 JSON 元数据，但从文本帧中移出大体积图片数据。二进制帧 payload 结构为 ASCII magic `LDCV1\n`、4 字节大端 JSON 头长度、UTF-8 JSON 头、原始 JPEG 字节。JSON 头等价于 `video_frame` 元数据，`encoding` 为 `binary-jpeg`，不再包含 `dataUrl`，并带 `mimeType`、`payloadBytes` 或 `binaryPayloadBytes`。
- `repeatPreviousFrame=true` 这类轻量重复帧没有图片 payload，仍可继续走 JSON 文本帧。

第二版升级：

- 使用 ScreenCaptureKit `SCStream` 做连续采集。
- 使用 VideoToolbox 输出 H.264 Annex B。
- `video_frame.codec` 使用 `h264`，`encoding` 第一版使用 `annexb-base64`，后续切到 WebSocket 二进制帧。
- 支持硬件编码、动态码率和关键帧请求。

H.264 过渡格式：

```json
{
  "type": "video_frame",
  "frameId": 101,
  "timestamp": "2026-06-12T12:00:00.000Z",
  "width": 1920,
  "height": 1080,
  "codec": "h264",
  "codecString": "avc1.42E01F",
  "encoding": "annexb-base64",
  "keyFrame": true,
  "timestampUs": 3300000,
  "durationUs": 33333,
  "capturePipeline": "screencapturekit-h264",
  "activeDisplayId": "main",
  "displayName": "内建显示器",
  "payload": "AAAA..."
}
```

## 7. 显示和性能设置

控制端可以向被控端请求显示参数。

```json
{
  "type": "display_settings",
  "qualityPreset": "balanced",
  "displayMode": "fullscreen",
  "displayId": "main",
  "resolutionMode": "fixed",
  "scaleMode": "fit",
  "width": 1920,
  "height": 1080,
  "fps": 60,
  "maxBandwidthKbps": 50000,
  "preferredVideoCodec": "h264",
  "preferredVideoEncoding": "annexb",
  "preferredVideoTransport": "binary-jpeg",
  "supportedVideoTransports": ["json", "binary-jpeg"],
  "audio": true,
  "audioVolume": 80,
  "clipboardText": true,
  "clipboardFile": true
}
```

字段说明：

- displayMode：windowed 或 fullscreen。
- qualityPreset：控制端画质预设，当前可用 `smooth`、`balanced`、`sharp`、`custom`。
- displayId：目标显示器编号，由 `session_answer.displays` 提供。
- resolutionMode：native、fit_client、fixed。
- scaleMode：fit、original、stretch，控制端显示缩放模式。
- fps：目标刷新率，当前控制端提供 30、60、120、144、240 Hz。
- maxBandwidthKbps：最大码率，单位 Kbps；当前控制端提供 5 Mbps、10 Mbps、15 Mbps、20 Mbps、40 Mbps、50 Mbps。
- audio：是否接收被控端声音。
- clipboardText：是否同步文本剪贴板。
- clipboardFile：是否同步文件剪贴板。

如果被控端不能满足设置，需要返回实际生效值。

```json
{
  "type": "display_settings_ack",
  "accepted": true,
  "videoCodec": "h264",
  "videoEncoding": "annexb",
  "videoTransport": "json",
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "requestedFps": 60,
  "maxScreenFps": 30,
  "capturePipeline": "screencapturekit-h264",
  "maxBandwidthKbps": 50000,
  "message": "设置已接收"
}
```

## 8. 音频通道

控制端可接收被控端声音。

当前已支持音频开关、音量设置和 `audio_frame` 状态回传。macOS 被控端已接入 ScreenCaptureKit 系统声音采集第一版，使用 `pcm-f32le-base64` 过渡格式发送真实 PCM 帧；控制端真实播放、Opus 压缩和 Windows WASAPI loopback 仍是后续任务。

```json
{
  "type": "audio_settings_update",
  "enabled": true,
  "codec": "opus",
  "sampleRate": 48000,
  "channels": 2,
  "volume": 80,
  "muted": false
}
```

音频帧：

```json
{
  "type": "audio_frame",
  "frameId": 1,
  "codec": "pcm-f32le",
  "sampleRate": 48000,
  "channels": 2,
  "durationMs": 20,
  "level": 0.06,
  "volume": 80,
  "latencyMs": 0,
  "encoding": "pcm-f32le-base64",
  "audioMode": "system-pcm",
  "layout": "planar",
  "frames": 960,
  "payloadBytes": 7680,
  "payload": "AAAA..."
}
```

音频设置确认：

```json
{
  "type": "audio_settings_ack",
  "enabled": true,
  "volume": 80,
  "muted": false,
  "sampleRate": 48000,
  "channels": 2
}
```

音频建议：

- 编码优先 Opus。
- 默认采样率 48kHz。
- 控制端提供静音和音量调节。
- 被控端提供是否允许采集系统声音的开关。
- 音频通道不能阻塞视频和输入事件。
- `encoding: "mock"` 表示当前为联调帧，只用于验证协议和 UI 状态，不代表已播放真实系统声音。
- `encoding: "pcm-f32le-base64"` 表示当前为过渡真实音频帧，`payload` 是 base64 后的 Float32 little-endian PCM；`layout` 可能为 `planar` 或 `interleaved`，控制端播放前必须按布局重排或转换。

## 9. 输入事件格式

### 鼠标移动

```json
{
  "type": "input_event",
  "event": "mouse_move",
  "x": 0.52,
  "y": 0.37
}
```

坐标用 0 到 1 的比例值，避免不同分辨率下坐标错位。

### 鼠标点击

```json
{
  "type": "input_event",
  "event": "mouse_button",
  "button": "left",
  "action": "down"
}
```

### 鼠标滚轮

```json
{
  "type": "input_event",
  "event": "mouse_wheel",
  "deltaX": 0,
  "deltaY": -120
}
```

### 键盘事件

```json
{
  "type": "input_event",
  "event": "key",
  "key": "c",
  "code": "KeyC",
  "action": "key",
  "modifiers": ["meta"],
  "remoteModifiers": ["meta"],
  "keyboardMapping": {
    "win": "meta",
    "alt": "alt",
    "ctrl": "ctrl"
  },
  "shortcutProfile": "windows_to_macos",
  "shortcutAction": "copy",
  "ctrlKey": false,
  "altKey": false,
  "shiftKey": false,
  "metaKey": true,
  "localKey": "c",
  "localCode": "KeyC",
  "localCtrlKey": true,
  "localAltKey": false,
  "localShiftKey": false,
  "localMetaKey": false
}
```

macOS 默认按键映射：

- Windows `Win` 键 -> macOS `Command`。
- Windows `Alt` 键 -> macOS `Option`。
- Windows `Ctrl` 键 -> macOS `Control`。
- Windows 常用快捷键兼容默认开启：`Ctrl+C/V/X/A/Z/S/F/P/O/N/W/T/R` 会按 macOS `Command` 快捷键发送，`Ctrl+Y` 会转为 `Command+Shift+Z`。
- `remoteModifiers` 是按映射转换后的远端修饰键，后续 macOS 输入注入优先读取这个字段。
- `modifiers` 与 `remoteModifiers` 保持一致，用于 Swift 被控端直接解码。
- `shortcutProfile` 和 `shortcutAction` 标记 Windows 快捷键兼容层的语义，例如 `windows_to_macos` / `copy`。
- `local*Key` 保留 Windows 本地原始按键状态，用于日志和排查。

### 输入确认

```json
{
  "type": "input_ack",
  "inputId": "input_event-1780000000000-1",
  "sequence": 42,
  "event": "mouse_button",
  "accepted": true,
  "injected": true,
  "mode": "inject",
  "reason": "输入事件已注入。"
}
```

被控端处理 `input_event` 后返回 `input_ack`，用于区分事件已注入、仅记录、被权限或平台能力拒绝。`code` 可选，权限失败时可返回 `LAN005`。控制端可低频记录成功确认，必须明显提示失败确认。

## 10. 剪贴板协议

剪贴板分文本和文件两类。

### 文本剪贴板

```json
{
  "type": "clipboard_text",
  "direction": "host_to_client",
  "clipboardId": "clip-1780000000000-1",
  "textLength": 8,
  "text": "复制的文字内容",
  "mode": "system",
  "timestamp": 1780000000000
}
```

接收方确认：

```json
{
  "type": "clipboard_ack",
  "accepted": true,
  "clipboardId": "clip-1780000000000-1",
  "textLength": 8,
  "mode": "system"
}
```

规则：

- 文本剪贴板第一版先同步纯文本，文件和压缩包走文件剪贴板通道。
- `direction` 使用 `client_to_host` 或 `host_to_client`。
- `mode: "system"` 表示接收端已写入系统剪贴板；`mode: "memory-only"` 表示只在被控服务内存中记录。
- `clipboardId` 用于把发送和确认对应起来，排查重复同步或失败原因。
- 需要避免循环同步：收到远端剪贴板后，本地写入时要标记来源。
- 可以提供开关：关闭剪贴板同步。

### 文件剪贴板

文件、压缩包、图片等都按文件传输处理。

```json
{
  "type": "clipboard_file_offer",
  "transferId": "uuid",
  "direction": "host_to_client",
  "totalBytes": 1048576,
  "fileCount": 1,
  "maxChunkBytes": 65536,
  "files": [
    {
      "index": 0,
      "name": "archive.zip",
      "size": 1048576,
      "mimeType": "application/zip",
      "lastModified": 1780000000000,
      "sha256": "hash-value"
    }
  ]
}
```

接收方确认：

```json
{
  "type": "clipboard_file_response",
  "transferId": "uuid",
  "accepted": true,
  "saveMode": "clipboard",
  "maxChunkBytes": 65536
}
```

传输块：

```json
{
  "type": "clipboard_file_chunk",
  "transferId": "uuid",
  "fileIndex": 0,
  "offset": 0,
  "bytes": 65536,
  "sentBytes": 65536,
  "encoding": "base64",
  "dataBase64": "..."
}
```

进度：

```json
{
  "type": "clipboard_file_progress",
  "transferId": "uuid",
  "receivedBytes": 65536,
  "totalBytes": 1048576
}
```

发送方完成：

```json
{
  "type": "clipboard_file_complete",
  "transferId": "uuid",
  "fileCount": 1,
  "totalBytes": 1048576
}
```

接收方最终结果：

```json
{
  "type": "clipboard_file_result",
  "transferId": "uuid",
  "accepted": true,
  "receivedBytes": 1048576,
  "totalBytes": 1048576,
  "fileCount": 1,
  "saveMode": "clipboard"
}
```

规则：

- `saveMode: "clipboard"` 表示接收端已把文件写入系统文件剪贴板；`saveMode: "memory-only"` 表示只接收和记录文件块。
- macOS 被控端会把收到的文件保存到系统临时目录，再把文件 URL 写入 `NSPasteboard`，未接收完整时不会写入系统文件剪贴板。
- macOS 被控端读取本机文件剪贴板时，第一版只发送普通文件、跳过目录，并限制总量不超过 64 MB。
- Windows 控制端收到远端文件时，第一版先在浏览器内存中重组、显示到远端文件托盘并返回 `saveMode: "memory-only"`；写入 Windows 系统文件剪贴板需要桌面原生模块继续接入。

文件剪贴板规则：

- 默认需要接收方确认，避免误传大文件。
- 必须限制最大文件大小。
- 必须校验 sha256。
- 文件通道不能阻塞输入事件、视频流和音频流。
- 大文件传输要显示进度、速度、剩余时间。
- 文件先落到安全临时目录，再写入系统剪贴板或用户选择的位置。
- 当前 Windows 控制端第一阶段通过文件选择器发送文件块；真实“复制系统文件后自动同步”需要 Tauri/原生剪贴板模块。

## 11. 一键反控协议

### 请求反控

```json
{
  "type": "reverse_control_request",
  "requestId": "uuid",
  "from": "Windows-PC",
  "message": "对方请求切换为反向控制"
}
```

### 反控确认

```json
{
  "type": "reverse_control_response",
  "requestId": "uuid",
  "accepted": true,
  "reason": ""
}
```

反控规则：

- 必须由被请求方确认。
- 未确认不能切换。
- 切换方向前要保存当前连接状态。
- 切换失败要回到原连接或干净断开。
- `requestId` 用于把请求和确认一一对应，避免重连或重复点击后串线。
- 控制端应处理超时场景，超时后方向保持不变。

## 12. 错误码

| 错误码 | 中文说明 |
|---|---|
| LAN001 | 无法连接到目标 IP |
| LAN002 | 密码错误 |
| LAN003 | 目标端拒绝连接 |
| LAN004 | 目标端缺少屏幕录制权限 |
| LAN005 | 目标端缺少输入控制权限 |
| LAN006 | 协议版本不兼容 |
| LAN007 | 视频流中断 |
| LAN008 | 一键反控被拒绝 |
| LAN009 | 音频采集失败 |
| LAN010 | 分辨率设置失败 |
| LAN011 | 剪贴板同步失败 |
| LAN012 | 文件传输失败 |
| LAN013 | 码率设置超出限制 |

## 13. 安全设计

第一版最低要求：

- 密码或配对码。
- 控制连接只监听局域网。
- 被控端有明显状态提示。
- 日志记录连接 IP。
- 文件剪贴板默认需要确认。
- 文件传输要限制路径，不能允许远端任意写入系统目录。

第二版建议：

- TLS 或 Noise Protocol。
- 首次配对生成设备密钥。
- 后续通过设备密钥快速连接。
- 可以删除已信任设备。
