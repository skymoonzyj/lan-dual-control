# Windows 被控端骨架

这是为后续“Mac 反控 Windows”准备的第一版 Windows 被控服务。它先跑通局域网监听、协议握手、会话协商、Windows 屏幕视频帧、输入事件接收和剪贴板接收端写入；FFmpeg 或系统截图不可用时会自动回退模拟视频帧。

## 当前内容

- Node.js WebSocket 被控服务，默认端口 `43770`。
- `hello`、`auth_request`、`session_offer`、`display_settings`、`input_event`、`input_ack`、`clipboard_text` 和 `reverse_control_request` 消息处理；未认证连接会被拒绝，同一连接内密码错误 3 次后会关闭连接。
- Windows 屏幕 `video_frame` 输出：默认在 Windows 桌面会话中用 FFmpeg gdigrab 持续采集 MJPEG/JPEG data URL；无 FFmpeg 时回退 PowerShell/System.Drawing 系统截图，失败时再回退模拟帧。控制端下发的 `qualityPreset` 和 `maxBandwidthKbps` 会换算为实际 `jpegQuality`，让 5/10/20/40/50 Mbps 对应不同压缩质量。
- 音频 `audio_frame` 输出：默认发送模拟帧；显式设置 `LAN_DUAL_WINDOWS_AUDIO_MODE=wasapi` 后可用 Windows WASAPI loopback 采集默认播放设备的系统声音并发送 `pcm-f32le-base64` PCM 帧；也可设置 `LAN_DUAL_WINDOWS_AUDIO_DEVICE` 试用 FFmpeg DirectShow 指定设备。
- 屏幕采集当前是 FFmpeg gdigrab + PowerShell/System.Drawing 兜底的过渡实现，后续升级 Windows Graphics Capture 以继续降低延迟和资源占用。
- WASAPI loopback 是当前推荐的系统声音采集入口；DirectShow PCM 入口保留给虚拟声卡/loopback 设备做兼容验证。
- SendInput 输入注入模块：在 Windows 上通过常驻 C# helper 调用 `SendInput` 和 `SetCursorPos` 注入鼠标、滚轮和常用键盘事件，避免每个事件重复启动 PowerShell；在非 Windows 开发环境只记录事件。
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
$env:LAN_DUAL_WINDOWS_INPUT_MODE="system" # 强制使用常驻 C# SendInput helper
$env:LAN_DUAL_WINDOWS_INPUT_HELPER_EXE="C:\DevTools\lan-dual-input-helper.exe" # 可选；复用已编译 helper
```

调试屏幕采集时可选：

```powershell
$env:LAN_DUAL_WINDOWS_SCREEN_MODE="auto"   # 默认，Windows 优先 FFmpeg gdigrab，失败再回退系统截图 JPEG
$env:LAN_DUAL_WINDOWS_SCREEN_MODE="mock"   # 强制模拟视频帧
$env:LAN_DUAL_WINDOWS_SCREEN_MODE="ffmpeg" # 强制 FFmpeg gdigrab MJPEG
$env:LAN_DUAL_WINDOWS_SCREEN_MODE="system" # 强制 Windows 系统截图 JPEG
$env:LAN_DUAL_FFMPEG="C:\DevTools\ffmpeg\bin\ffmpeg.exe" # 可选；PATH 不稳定时显式指定 FFmpeg
$env:LAN_DUAL_WINDOWS_JPEG_QUALITY="70"    # 强制覆盖 JPEG 质量，35-92；不设置时按 qualityPreset/maxBandwidthKbps 自动计算
$env:LAN_DUAL_WINDOWS_MAX_SCREEN_FPS="30"  # 可选：FFmpeg 默认上限 60，1-60；想省资源时可降到 30；system 模式默认 4，1-8
```

调试音频采集时可选：

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-audio-devices.mjs
$env:LAN_DUAL_WINDOWS_AUDIO_MODE="wasapi"                # 推荐：采集默认播放设备的系统声音 loopback
$env:LAN_DUAL_WINDOWS_AUDIO_MODE="dshow"                 # 显式启用 FFmpeg DirectShow PCM
$env:LAN_DUAL_WINDOWS_AUDIO_DEVICE="麦克风阵列 (网易虚拟音频设备)" # 改成上面列出的 loopback/虚拟声卡设备名
$env:LAN_DUAL_WINDOWS_AUDIO_SAMPLE_RATE="48000"
$env:LAN_DUAL_WINDOWS_AUDIO_CHANNELS="2"
$env:LAN_DUAL_WINDOWS_AUDIO_QUEUE_FRAMES="96"            # 可选；WASAPI 默认 96，DirectShow 默认 24
```

默认检查脚本只列出设备和 WASAPI 格式，不采集声音。需要短时验证系统声音 loopback 能输出 PCM 时，再显式运行：

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-audio-devices.mjs --probe --wasapi
```

需要短时验证某个 DirectShow 设备能输出 PCM 时，再显式运行：

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-audio-devices.mjs --probe --device "麦克风阵列 (网易虚拟音频设备)"
```

不要把真实麦克风设备作为默认项；需要采集系统声音时，优先使用 WASAPI loopback。未显式设置 `LAN_DUAL_WINDOWS_AUDIO_MODE=wasapi` 或 DirectShow 设备名时，Windows host 会继续发送模拟音频帧。

本机调试时如果 `43770` 已被假 Mac 服务占用，可以临时使用：

```powershell
node .\server.mjs 43772 127.0.0.1
```

## 一键自检

Windows host 真机联调前，建议先跑一键体检。默认只做低风险检查：Node/FFmpeg、Windows host 语法、输入 helper 安全干跑、音频设备/WASAPI 格式，以及局域网/防火墙只读检查；不会播放声音、不会发真实鼠标键盘输入，也不要求 `43770` 已经有服务监听。

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-host-readiness.mjs
```

需要把视频和系统声音短采集也纳入体检时，再显式加 probe。脚本会临时启动 Windows host，短时观察 FFmpeg 视频帧和 WASAPI PCM 音频帧，结束后自动关闭临时服务；默认不会播放测试音。

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-host-readiness.mjs --probeVideo --probeAudio
```

Mac 从另一台机器连入前，如果要求 `43770` 必须正在监听且局域网可达，可以加 `--requireOpen`；这通常应在你已经手动启动 `node .\server.mjs 43770 0.0.0.0` 后运行。

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-host-readiness.mjs --host 0.0.0.0 --port 43770 --requireOpen
```

Windows 本机可直接运行自检脚本。它会在 `127.0.0.1:43772` 临时启动 Windows 被控端，验证 `/discovery`、WebSocket 认证、真实视频首帧、文本剪贴板和文件剪贴板接收，结束后自动关闭临时服务。如果 `43772` 已被其他服务占用，脚本会自动换一个临时空闲端口；需要验证已运行的 Windows host 时再显式加 `-UseExisting -HostName 127.0.0.1 -Port 43770`。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\codex\lan-dual-control\scripts\windows\test-windows-host.ps1
```

Mac 从另一台机器连接 Windows 前，可以先做一次局域网和防火墙只读检查。它会列出本机局域网 IP、端口监听地址、TCP 探测结果、当前网络配置和匹配的入站放行规则；默认不会修改系统防火墙。

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-firewall.mjs --host 0.0.0.0 --port 43770
```

需要把它作为强校验时，可以要求端口必须可连：

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --requireOpen
```

如果脚本提示缺少入站放行规则，它会打印一条管理员 PowerShell 建议命令，例如：

```powershell
New-NetFirewallRule -DisplayName 'LAN Dual Control Windows Host 43770' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 43770 -Profile Private
```

只在可信的家庭/工作局域网里放行；如果当前网络被 Windows 标为 Public，先确认网络安全性，再决定是否改为 Private 或为当前配置单独放行。

默认不会发送鼠标键盘事件，避免无人值守时误操作。有人看着屏幕、需要验证 SendInput 时再加：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\codex\lan-dual-control\scripts\windows\test-windows-host.ps1 -InputEvents -InputMode system
```

输入 helper 安全自检不会发送真实鼠标键盘事件；它只验证 log 模式、未知按键拒绝和常驻 C# helper 的 JSON 往返：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-windows-input-helper.mjs
```

需要量化输入 helper 冷启动和热路径耗时时，可以运行安全干跑测量。它同样只发送故意不支持的事件，不会真实移动鼠标或按键：

```powershell
node E:\codex\lan-dual-control\scripts\windows\measure-windows-input-helper.mjs
```

默认会输出 cold startup、warm avg、p50、p95 和 max。需要在回归里加阈值时可用：

```powershell
node E:\codex\lan-dual-control\scripts\windows\measure-windows-input-helper.mjs --samples 50 --warmup 5 --maxP95Ms 10
```

需要验证 Windows host 真实系统声音 PCM 时，可以临时开启 WASAPI loopback：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\codex\lan-dual-control\scripts\windows\test-windows-host.ps1 -AudioMode wasapi -RequireAudio
```

Mac 控制 Windows 的页面级自检可在 Windows 本机启动临时 Windows host 和 `apps/mac-client`，自动打开浏览器，确认真实视频画面、`input_ack` 和文本 `clipboard_ack`：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-mac-client-browser.mjs
```

需要把真实 Windows 系统声音也纳入 Mac 控制页验收时，加 `--requireAudio`；脚本会临时设置 `LAN_DUAL_WINDOWS_AUDIO_MODE=wasapi`，打开页面声音开关，并等待 `pcm-f32le-base64` 播放计数：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-mac-client-browser.mjs --requireAudio
```

默认临时使用 `127.0.0.1:43772`；如果该端口已被其他自检占用，脚本会自动换一个临时空闲端口。需要连接已运行的 Windows host 时再加 `--useExisting --host 127.0.0.1 --port 43770`。

视频持续帧观察脚本可统计几秒内实际收到的帧数、平均 FPS、最大帧间隔、掉帧数、采集管线、请求码率和实际 `jpegQuality`：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-video.mjs
```

默认临时使用 `127.0.0.1:43772`；如果该端口已被其他自检占用，脚本会自动换一个临时空闲端口。需要连接已运行的 Windows host 时再加 `--useExisting --host 127.0.0.1 --port 43770`。脚本会自动识别 `C:\DevTools\ffmpeg\bin\ffmpeg.exe`，也可以显式传入 `--ffmpeg C:\DevTools\ffmpeg\bin\ffmpeg.exe`。

需要对照码率和 JPEG 质量时：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-video.mjs --bandwidthKbps 5000 --qualityPreset smooth --json
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-video.mjs --bandwidthKbps 40000 --qualityPreset sharp --json
```

需要确认普通启动的 FFmpeg 默认上限仍为 60 Hz 时：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-video.mjs --fps 60 --useDefaultMaxScreenFps --expectSessionFps 60 --durationMs 4000 --minFrames 140 --minFps 35 --maxGapMs 1000
```

强制对照旧系统截图兜底路径：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-video.mjs --screenMode system --fps 4 --durationMs 2500 --minFrames 3 --minFps 1 --maxGapMs 2000
```

音频持续帧观察脚本可统计 Windows host 的 `audio_frame` 帧数、稳态帧率、最大帧间隔、payload 大小和电平。默认临时启动 `screenMode=mock`、`audioMode=wasapi` 的 Windows host，只观察系统声音，不额外压视频；默认会丢掉前 5 帧作为预热再计算稳态 FPS：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-audio.mjs
```

需要缩短观察或连接已运行的 Windows host 时：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-audio.mjs --durationMs 3000 --warmupFrames 5 --useExisting --host 127.0.0.1 --port 43770
```

需要确认默认播放设备真的有声音被 WASAPI loopback 捕获时，可显式播放短测试音并要求电平升高：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-audio.mjs --durationMs 4500 --minFrames 160 --minFps 40 --playTone --requireLevel --minLevel 0.02
```

`--playTone` 会通过系统默认播放设备播放一段短 WAV，默认关闭；无人值守长稳观察不要开启它。

认证重试策略回归脚本会同时验证 Windows host 和假 Mac 服务：错误密码剩余 `2/1/0`、第三次断开、新连接正确密码通过。

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-auth-retry-policy.mjs
```

## 下一步

1. 使用 Mac 控制端连接 `ws://Windows-IP:43770`。
2. 把当前 FFmpeg/System.Drawing 过渡采集层升级为 Windows Graphics Capture，提升帧率和延迟表现。
3. 在有人看屏幕时继续用 `-InputEvents -InputMode system` 验收真实 SendInput，并评估是否需要进一步升级为原生模块。
4. 继续验证 WASAPI loopback 更长时间稳定性、系统音量变化和 Mac client 播放体验。
5. 把防火墙只读检查进一步接入桌面端提示，形成更友好的放行引导。
