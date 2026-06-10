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
- 自动发现：第一阶段复用控制端口的 `/discovery` HTTP 接口；后续再补 UDP/mDNS 广播
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
- 浏览器和 Tauri 页面不能直接做 UDP 广播，所以当前用 HTTP 探测骨架先跑通 UI 和两端协议。
- 真正跨设备自动发现建议后续放到原生层实现 UDP/mDNS，然后把发现结果回传给前端。

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
  "message": "验证通过"
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
  "displayMode": "windowed",
  "displayId": "main",
  "preferredWidth": 1920,
  "preferredHeight": 1080,
  "preferredVideoCodec": "mjpeg",
  "preferredAudioCodec": "opus"
}
```

### session_answer

```json
{
  "type": "session_answer",
  "ok": true,
  "videoCodec": "mjpeg",
  "audioCodec": "opus",
  "fps": 60,
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
  "clipboardText": true,
  "clipboardFile": true,
  "hostMode": "windows-host-skeleton"
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
  "dataUrl": "data:image/svg+xml;base64,..."
}
```

真实 Mac 端接入后建议：

- 控制消息仍用 JSON。
- 初期可以发送 `codec: "jpeg"`、`encoding: "data-url"` 或 `encoding: "base64"` 的 JPEG 帧，降低联调难度。
- 性能不足时再把图像帧升级为二进制帧。
- 每帧带一个小头部：frameId、timestamp、width、height、format、payloadLength。
- payload 使用 JPEG 或 PNG，优先 JPEG。

第二版升级：

- H.264 Annex B 或 AVCC。
- 支持硬件编码。
- 支持动态码率。

## 7. 显示和性能设置

控制端可以向被控端请求显示参数。

```json
{
  "type": "display_settings",
  "displayMode": "fullscreen",
  "displayId": "main",
  "resolutionMode": "fixed",
  "scaleMode": "fit",
  "width": 1920,
  "height": 1080,
  "fps": 60,
  "maxBandwidthKbps": 30000,
  "audio": true,
  "clipboardText": true,
  "clipboardFile": true
}
```

字段说明：

- displayMode：windowed 或 fullscreen。
- displayId：目标显示器编号，由 `session_answer.displays` 提供。
- resolutionMode：native、fit_client、fixed。
- scaleMode：fit、original、stretch，控制端显示缩放模式。
- fps：目标刷新率，第一版建议支持 15、30、60。
- maxBandwidthKbps：最大带宽。
- audio：是否接收被控端声音。
- clipboardText：是否同步文本剪贴板。
- clipboardFile：是否同步文件剪贴板。

如果被控端不能满足设置，需要返回实际生效值。

```json
{
  "type": "display_settings_ack",
  "accepted": true,
  "width": 1920,
  "height": 1080,
  "fps": 60,
  "maxBandwidthKbps": 50000,
  "message": "设置已接收"
}
```

## 8. 音频通道

控制端可接收被控端声音。

第一版可以先保留开关和协议字段，第二版实现音频流：

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

音频建议：

- 编码优先 Opus。
- 默认采样率 48kHz。
- 控制端提供静音和音量调节。
- 被控端提供是否允许采集系统声音的开关。
- 音频通道不能阻塞视频和输入事件。

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
  "key": "A",
  "code": "KeyA",
  "action": "down",
  "modifiers": ["ctrl"]
}
```

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
  "timestamp": 1780000000000
}
```

接收方确认：

```json
{
  "type": "clipboard_ack",
  "accepted": true,
  "clipboardId": "clip-1780000000000-1",
  "textLength": 8
}
```

规则：

- 文本剪贴板第一版先同步纯文本，文件和压缩包走文件剪贴板通道。
- `direction` 使用 `client_to_host` 或 `host_to_client`。
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
  "files": [
    {
      "name": "archive.zip",
      "size": 1048576,
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
  "saveMode": "clipboard"
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
  "totalBytes": 1048576
}
```

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
| LAN013 | 带宽设置超出限制 |

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
