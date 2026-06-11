# macOS 被控端

这是 macOS 被控端。它的目标是接收 Windows 控制端协议，采集 Mac 屏幕并执行远程输入事件。

## 当前内容

- Swift Package 项目结构。
- WebSocket 监听骨架，默认端口 `43770`。
- `/discovery` HTTP 发现接口。
- `hello`、`auth_request`、`session_offer`、`display_settings`、`audio_settings_update`、`input_event`、`clipboard_text`、`clipboard_file_*` 和 `reverse_control_*` 消息处理。
- macOS 权限检查骨架：
  - 屏幕录制。
  - 辅助功能。
  - 输入监控提示。
- ScreenCaptureKit 资源预检。
- 多显示器枚举。
- 后台 JPEG `video_frame` 抓取；权限不足或采集失败时自动回退模拟 `video_frame`。
- 模拟 `audio_frame` 发送，便于 Windows 控制端先完成声音链路联调。
- CGEvent 输入注入：支持鼠标移动、左/右/中键按下抬起、滚轮、常用键盘按键和 macOS 快捷键修饰键。
- macOS 系统文本剪贴板读写：接收 Windows 文字后写入 `NSPasteboard`，并把 Mac 本机复制的新文字推送给 Windows。
- macOS 系统文件剪贴板接收：接收 Windows 文件块后保存到临时目录，并把文件 URL 写入 `NSPasteboard`。

## 在 Mac 上运行

进入目录：

```bash
cd apps/mac-host
```

运行：

```bash
swift run lan-dual-mac-host
```

可选环境变量：

```bash
export LAN_DUAL_HOST=0.0.0.0
export LAN_DUAL_PORT=43770
export LAN_DUAL_PASSWORD=demo-password
export LAN_DUAL_VIDEO_MODE=auto
export LAN_DUAL_INPUT_MODE=inject
export LAN_DUAL_MAX_SCREEN_FPS=12
export LAN_DUAL_JPEG_QUALITY=0.58
swift run lan-dual-mac-host
```

`LAN_DUAL_VIDEO_MODE` 可选值：

- `auto`：默认值。有屏幕录制权限时发送真实 JPEG 帧，否则发送模拟帧。
- `screen`：强制尝试真实屏幕帧，失败时仍会临时回退模拟帧并打印日志。
- `mock`：只发送模拟帧，适合协议调试。

真实屏幕帧采用后台采集和 JPEG 编码队列，避免主线程被截图/编码卡住。`LAN_DUAL_MAX_SCREEN_FPS` 可限制真实屏幕帧最高帧率，默认 `12`，范围 `1...30`。`LAN_DUAL_JPEG_QUALITY` 可覆盖控制端画质预设计算出的 JPEG 质量，范围 `0.1...0.95`；不设置时会按 Windows 控制端的 `smooth`、`balanced`、`sharp`、`custom` 和码率自动选择。

`LAN_DUAL_INPUT_MODE` 可选值：

- `inject`：默认值。收到 Windows 控制端的 `input_event` 后调用 macOS `CGEvent` 执行输入。
- `log`：只打印输入事件，不真正移动鼠标或按键，适合联调协议时避免误操作。

Windows 控制端选择“WebSocket 局域网”，地址填写 Mac 的局域网 IP，端口填写 `43770`，默认密码为：

```text
demo-password
```

也可以先验证发现接口：

```bash
curl http://127.0.0.1:43770/discovery
```

真机验收建议先用安全输入模式启动，再让探针强制要求真实视频帧：

```bash
LAN_DUAL_INPUT_MODE=log swift run lan-dual-mac-host
```

```powershell
scripts\windows\test-mac-host.ps1 -HostName 192.168.1.x -RequireRealVideo -ExpectInputMode log
```

## 首次运行需要打开的 macOS 权限

进入系统设置：

```text
系统设置 -> 隐私与安全性
```

需要允许：

- 屏幕录制：`lan-dual-mac-host`
- 辅助功能：`lan-dual-mac-host`
- 输入监控：如果系统提示，也允许 `lan-dual-mac-host`

修改权限后通常需要重启程序。

## 下一步

真 Mac 优先验证：

1. `swift run lan-dual-mac-host` 能启动。
2. 权限检查结果是否正确。
3. Windows 控制端能通过 WebSocket 发送 `hello` 并收到 `hello_ack`。
4. Windows 控制端能收到 `codec: "jpeg"` 的真实 Mac 屏幕帧。
5. Windows 控制端能通过 `input_event` 控制 Mac 鼠标、滚轮和常用快捷键。
6. Windows 和 Mac 能互相同步系统文本剪贴板。
7. Windows 发送文件剪贴板后，Mac 能把文件写入系统剪贴板并可在 Finder 粘贴。
