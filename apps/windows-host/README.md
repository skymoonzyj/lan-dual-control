# Windows 被控端骨架

这是为后续“Mac 反控 Windows”准备的第一版 Windows 被控服务。它先跑通局域网监听、协议握手、会话协商、Windows 屏幕 JPEG 帧、输入事件接收和剪贴板接收端写入；系统截图不可用时会自动回退模拟视频帧。

## 当前内容

- Node.js WebSocket 被控服务，默认端口 `43770`。
- `hello`、`auth_request`、`session_offer`、`display_settings`、`input_event`、`input_ack`、`clipboard_text` 和 `reverse_control_request` 消息处理；未认证连接会被拒绝。
- Windows 系统截图 `video_frame` 输出：在 Windows 桌面会话中用系统截图生成 JPEG data URL，失败时回退模拟帧。
- 模拟 `audio_frame` 输出，用于提前验证声音接收状态、音量设置和音频协议。
- 屏幕采集当前是 PowerShell/System.Drawing 过渡实现，后续升级 Windows Graphics Capture 以提升帧率和延迟。
- WASAPI loopback 音频采集占位模块，当前只发送模拟音频帧。
- SendInput 输入注入模块：在 Windows 上通过 PowerShell/C# 调用 `SendInput` 和 `SetCursorPos` 注入鼠标、滚轮和常用键盘事件，在非 Windows 开发环境只记录事件。
- 输入事件处理后会返回 `input_ack`，便于控制端和联调脚本确认已注入、仅记录或被拒绝。
- 文本剪贴板模块：在 Windows 上通过 PowerShell `Set-Clipboard` 写入系统剪贴板，在非 Windows 开发环境回退为内存保存。
- 文件剪贴板接收模块：接收 `clipboard_file_*` 文件清单、分块、完成消息并返回进度；在 Windows 上通过 PowerShell `Set-Clipboard -Path` 写入系统文件剪贴板，在非 Windows 开发环境保存到临时目录。
- `/discovery` 设备发现接口，供 Windows 控制端或未来 Mac 控制端扫描局域网设备列表。

## 运行

进入目录：

```powershell
cd E:\codex\lan-dual-control\apps\windows-host
```

启动：

```powershell
node .\server.mjs
```

设备发现接口：

```text
http://127.0.0.1:43770/discovery
```

可选参数：

```powershell
node .\server.mjs 43770 0.0.0.0
```

可选环境变量：

```powershell
$env:LAN_DUAL_HOST="0.0.0.0"
$env:LAN_DUAL_PORT="43770"
$env:LAN_DUAL_PASSWORD="demo-password"
node .\server.mjs
```

调试剪贴板时可选：

```powershell
$env:LAN_DUAL_WINDOWS_CLIPBOARD_MODE="auto"   # 默认，Windows 写系统剪贴板，其他平台临时/内存回退
$env:LAN_DUAL_WINDOWS_CLIPBOARD_MODE="memory" # 强制临时/内存回退
$env:LAN_DUAL_WINDOWS_CLIPBOARD_MODE="system" # 强制使用 PowerShell Set-Clipboard / Set-Clipboard -Path
```

调试输入注入时可选：

```powershell
$env:LAN_DUAL_WINDOWS_INPUT_MODE="auto"   # 默认，Windows 使用 SendInput，其他平台只记录
$env:LAN_DUAL_WINDOWS_INPUT_MODE="log"    # 强制只记录输入事件
$env:LAN_DUAL_WINDOWS_INPUT_MODE="system" # 强制使用 PowerShell/C# SendInput
```

调试屏幕采集时可选：

```powershell
$env:LAN_DUAL_WINDOWS_SCREEN_MODE="auto"   # 默认，Windows 使用系统截图 JPEG，其他平台模拟
$env:LAN_DUAL_WINDOWS_SCREEN_MODE="mock"   # 强制模拟视频帧
$env:LAN_DUAL_WINDOWS_SCREEN_MODE="system" # 强制 Windows 系统截图 JPEG
$env:LAN_DUAL_WINDOWS_JPEG_QUALITY="70"    # JPEG 质量，35-92
$env:LAN_DUAL_WINDOWS_MAX_SCREEN_FPS="4"   # 当前过渡采集上限，1-8
```

本机调试时如果 `43770` 已被假 Mac 服务占用，可以临时使用：

```powershell
node .\server.mjs 43772 127.0.0.1
```

## 一键自检

Windows 本机可直接运行自检脚本。它会在 `127.0.0.1:43772` 临时启动 Windows 被控端，验证 `/discovery`、WebSocket 认证、真实 JPEG 首帧和文件剪贴板接收，结束后自动关闭临时服务：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\codex\lan-dual-control\scripts\windows\test-windows-host.ps1
```

默认不会发送鼠标键盘事件，避免无人值守时误操作。有人看着屏幕、需要验证 SendInput 时再加：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\codex\lan-dual-control\scripts\windows\test-windows-host.ps1 -InputEvents -InputMode system
```

## 下一步

1. 使用 Mac 控制端连接 `ws://Windows-IP:43770`。
2. 把当前系统截图 JPEG 过渡层升级为 Windows Graphics Capture，提升帧率和延迟表现。
3. 把当前 PowerShell/C# SendInput 桥升级为更高性能的原生模块或常驻进程。
4. 接入 WASAPI loopback，发送真实系统声音。
5. 处理 Windows 防火墙提示和局域网放行说明。
