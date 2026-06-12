# Windows 被控端骨架

这是为后续“Mac 反控 Windows”准备的第一版 Windows 被控服务。它先跑通局域网监听、协议握手、会话协商、Windows 屏幕视频帧、输入事件接收和剪贴板接收端写入；FFmpeg 或系统截图不可用时会自动回退模拟视频帧。

## 当前内容

- Node.js WebSocket 被控服务，默认端口 `43770`。
- `hello`、`auth_request`、`session_offer`、`display_settings`、`input_event`、`input_ack`、`clipboard_text` 和 `reverse_control_request` 消息处理；未认证连接会被拒绝，同一连接内密码错误 3 次后会关闭连接。
- Windows 屏幕 `video_frame` 输出：默认在 Windows 桌面会话中用 FFmpeg gdigrab 持续采集 MJPEG/JPEG data URL；无 FFmpeg 时回退 PowerShell/System.Drawing 系统截图，失败时再回退模拟帧。
- 音频 `audio_frame` 输出：默认发送模拟帧；显式设置 `LAN_DUAL_WINDOWS_AUDIO_DEVICE` 后可试用 FFmpeg DirectShow 采集指定音频设备并发送 `pcm-f32le-base64` PCM 帧。
- 屏幕采集当前是 FFmpeg gdigrab + PowerShell/System.Drawing 兜底的过渡实现，后续升级 Windows Graphics Capture 以继续降低延迟和资源占用。
- WASAPI loopback 仍是正式系统声音采集目标；当前 DirectShow PCM 入口适合先接虚拟声卡/loopback 设备验证链路。
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
$env:LAN_DUAL_WINDOWS_SCREEN_MODE="auto"   # 默认，Windows 优先 FFmpeg gdigrab，失败再回退系统截图 JPEG
$env:LAN_DUAL_WINDOWS_SCREEN_MODE="mock"   # 强制模拟视频帧
$env:LAN_DUAL_WINDOWS_SCREEN_MODE="ffmpeg" # 强制 FFmpeg gdigrab MJPEG
$env:LAN_DUAL_WINDOWS_SCREEN_MODE="system" # 强制 Windows 系统截图 JPEG
$env:LAN_DUAL_WINDOWS_JPEG_QUALITY="70"    # JPEG 质量，35-92
$env:LAN_DUAL_WINDOWS_MAX_SCREEN_FPS="30"  # FFmpeg 默认上限 30，1-60；system 模式默认 4，1-8
```

调试音频采集时可选：

```powershell
ffmpeg -hide_banner -f dshow -list_devices true -i dummy
$env:LAN_DUAL_WINDOWS_AUDIO_MODE="dshow"                 # 显式启用 FFmpeg DirectShow PCM
$env:LAN_DUAL_WINDOWS_AUDIO_DEVICE="麦克风阵列 (网易虚拟音频设备)" # 改成上面列出的 loopback/虚拟声卡设备名
$env:LAN_DUAL_WINDOWS_AUDIO_SAMPLE_RATE="48000"
$env:LAN_DUAL_WINDOWS_AUDIO_CHANNELS="2"
```

不要把真实麦克风设备作为默认项；需要采集系统声音时，优先选择 loopback 或虚拟声卡设备。未设置设备名时，Windows host 会继续发送模拟音频帧。

本机调试时如果 `43770` 已被假 Mac 服务占用，可以临时使用：

```powershell
node .\server.mjs 43772 127.0.0.1
```

## 一键自检

Windows 本机可直接运行自检脚本。它会在 `127.0.0.1:43772` 临时启动 Windows 被控端，验证 `/discovery`、WebSocket 认证、真实视频首帧、文本剪贴板和文件剪贴板接收，结束后自动关闭临时服务：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\codex\lan-dual-control\scripts\windows\test-windows-host.ps1
```

默认不会发送鼠标键盘事件，避免无人值守时误操作。有人看着屏幕、需要验证 SendInput 时再加：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\codex\lan-dual-control\scripts\windows\test-windows-host.ps1 -InputEvents -InputMode system
```

Mac 控制 Windows 的页面级自检可在 Windows 本机启动临时 Windows host 和 `apps/mac-client`，自动打开浏览器，确认真实视频画面和 `input_ack`：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-mac-client-browser.mjs
```

默认临时使用 `127.0.0.1:43772`；如果该端口已被其他自检占用，脚本会自动换一个临时空闲端口。需要连接已运行的 Windows host 时再加 `--useExistingHost --host 127.0.0.1 --port 43770`。

视频持续帧观察脚本可统计几秒内实际收到的帧数、平均 FPS、最大帧间隔、掉帧数和采集管线：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-video.mjs
```

默认临时使用 `127.0.0.1:43772`；如果该端口已被其他自检占用，脚本会自动换一个临时空闲端口。需要连接已运行的 Windows host 时再加 `--useExisting --host 127.0.0.1 --port 43770`。

强制对照旧系统截图兜底路径：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-video.mjs --screenMode system --fps 4 --durationMs 2500 --minFrames 3 --minFps 1 --maxGapMs 2000
```

认证重试策略回归脚本会同时验证 Windows host 和假 Mac 服务：错误密码剩余 `2/1/0`、第三次断开、新连接正确密码通过。

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-auth-retry-policy.mjs
```

## 下一步

1. 使用 Mac 控制端连接 `ws://Windows-IP:43770`。
2. 把当前 FFmpeg/System.Drawing 过渡采集层升级为 Windows Graphics Capture，提升帧率和延迟表现。
3. 把当前 PowerShell/C# SendInput 桥升级为更高性能的原生模块或常驻进程。
4. 把当前 DirectShow PCM 过渡入口升级为 WASAPI loopback，默认发送真实系统声音。
5. 处理 Windows 防火墙提示和局域网放行说明。
