# Windows 被控端骨架

这是为后续“Mac 反控 Windows”准备的第一版 Windows 被控服务。它先跑通局域网监听、协议握手、会话协商、Windows 屏幕视频帧、输入事件接收和剪贴板接收端写入；FFmpeg 或系统截图不可用时会自动回退模拟视频帧。

## 当前内容

- Node.js WebSocket 被控服务，默认端口 `43770`。
- `hello`、`auth_request`、`session_offer`、`display_settings`、`input_event`、`input_ack`、`clipboard_text` 和 `reverse_control_request` 消息处理；未认证连接会被拒绝，同一连接内密码错误 3 次后会关闭连接。
- Windows 屏幕 `video_frame` 输出：默认在 Windows 桌面会话中用 FFmpeg gdigrab 持续采集 MJPEG/JPEG data URL；也可显式使用 `ffmpeg-h264` 让 FFmpeg/libx264 输出 H.264 Annex B base64 帧；无 FFmpeg 或采集失败时回退 PowerShell/System.Drawing 系统截图，失败时再回退模拟帧。控制端下发的 `qualityPreset` 和 `maxBandwidthKbps` 会换算为实际 `jpegQuality`，让 5/10/20/40/50 Mbps 对应不同压缩质量。
- 音频 `audio_frame` 输出：默认发送模拟帧；显式设置 `LAN_DUAL_WINDOWS_AUDIO_MODE=wasapi` 后可用 Windows WASAPI loopback 采集默认播放设备的系统声音并发送 `pcm-f32le-base64` PCM 帧；也可设置 `LAN_DUAL_WINDOWS_AUDIO_DEVICE` 试用 FFmpeg DirectShow 指定设备。
- 屏幕采集当前是 FFmpeg gdigrab + PowerShell/System.Drawing 兜底的过渡实现；`ffmpeg-h264` 是可选流式编码模式，主要用于和 Mac client H.264 接收链路联调，不替代后续 Windows Graphics Capture。已新增 Windows Graphics Capture 支持预检和 Rust helper 项目；helper 目前可完成 WGC/D3D 初始化并通过 JSON 行合同接入 Node host，下一步是读取真实 `Direct3D11CaptureFrame` 并编码 JPEG。
- WASAPI loopback 是当前推荐的系统声音采集入口；DirectShow PCM 入口保留给虚拟声卡/loopback 设备做兼容验证。
- SendInput 输入注入模块：在 Windows 上通过常驻 C# helper 调用 `SendInput` 和 `SetCursorPos` 注入鼠标、滚轮和常用键盘事件，避免每个事件重复启动 PowerShell；在非 Windows 开发环境只记录事件。
- 输入事件处理后会返回 `input_ack`，便于控制端和联调脚本确认已注入、仅记录或被拒绝。
- 文本剪贴板模块：在 Windows 上通过 PowerShell `Set-Clipboard` 写入系统剪贴板，在非 Windows 开发环境回退为内存保存。
- 文件剪贴板接收模块：接收 `clipboard_file_*` 文件清单、分块、完成消息并返回进度；在 Windows 上通过 PowerShell `Set-Clipboard -Path` 写入系统文件剪贴板，在非 Windows 开发环境保存到临时目录。
- `/discovery` 设备发现接口，供 Windows 控制端或未来 Mac 控制端扫描局域网设备列表；`/discovery` 和 `hello_ack` 会带可选 `runtime` 诊断，显示当前进程 PID、启动时间、运行时长和 build id，方便确认没有连到旧进程。

## 运行

进入目录：

```powershell
cd E:\codex\lan-dual-control\apps\windows-host
```

启动：

```powershell
node .\server.mjs
```

更推荐的日常入口是 Windows host 启动助手。它会启动被控服务，自动把当前 git short hash 作为 `LAN_DUAL_BUILD_ID`，列出 Mac 端应该填写的局域网地址，并在服务起来后自动跑一次只读端口/防火墙检查；如果 Mac 连不上，先看它打印的提示。

```powershell
node E:\codex\lan-dual-control\scripts\windows\start-windows-host.mjs
```

PowerShell 入口等价，但参数更像 Windows 工具：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\codex\lan-dual-control\scripts\windows\start-windows-host.ps1
```

日常真机联调建议要求输入密码，避免服务退回 demo 密码；`-PromptPassword` 会不回显输入，`-RequirePassword` 会在没有密码时拒绝启动：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\codex\lan-dual-control\scripts\windows\start-windows-host.ps1 -PromptPassword -RequirePassword
```

需要把 Windows 系统声音也发给 Mac 控制端时，显式开启 WASAPI：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\codex\lan-dual-control\scripts\windows\start-windows-host.ps1 -PromptPassword -RequirePassword -Wasapi
```

需要先确认会用什么地址和参数、但不真正启动服务时：

```powershell
node E:\codex\lan-dual-control\scripts\windows\start-windows-host.mjs --dryRun
```

需要只读查看当前 Windows host 是否已经在线、运行的是哪个 PID/build、当前视频/音频/输入/剪贴板能力，以及运行中 build 是否落后当前 git 时，可以用状态入口。它不会启动服务、不会认证，也不会要求或打印密码；如果离线，会给出安全启动建议：

```powershell
node E:\codex\lan-dual-control\scripts\windows\start-windows-host.mjs --status
```

需要给脚本或联络板消费时，加 `--json` 输出纯机器可读 JSON；PowerShell 包装也可以用 `-Status -Json` 走同一条只读检查：

```powershell
node E:\codex\lan-dual-control\scripts\windows\start-windows-host.mjs --status --json
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\codex\lan-dual-control\scripts\windows\start-windows-host.ps1 -Status -Json
```

Node 入口同样支持：

```powershell
node E:\codex\lan-dual-control\scripts\windows\start-windows-host.mjs --promptPassword --requirePassword
```

如果用环境变量传密码，也可以搭配 `--requirePassword`，脚本不会打印密码：

```powershell
$env:LAN_DUAL_PASSWORD="<your-lan-password>"
node E:\codex\lan-dual-control\scripts\windows\start-windows-host.mjs --requirePassword
```

如果要先预览它会创建哪条防火墙规则，可以加干跑参数。它只打印命令，不改系统：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\codex\lan-dual-control\scripts\windows\start-windows-host.ps1 -PromptPassword -RequirePassword -DryRunFirewallRule
```

确认当前是可信局域网、并且以管理员 PowerShell 运行时，可以显式请求新增 Private TCP 入站规则：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\codex\lan-dual-control\scripts\windows\start-windows-host.ps1 -PromptPassword -RequirePassword -AddFirewallRule
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
$env:LAN_DUAL_BUILD_ID="my-build-id" # 可选；不设置时启动助手会用当前 git short hash
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
$env:LAN_DUAL_WINDOWS_SCREEN_MODE="ffmpeg-h264" # 强制 FFmpeg gdigrab + libx264，输出 H.264 Annex B base64
$env:LAN_DUAL_WINDOWS_SCREEN_MODE="system" # 强制 Windows 系统截图 JPEG
$env:LAN_DUAL_WINDOWS_SCREEN_MODE="wgc"    # 显式请求 Windows Graphics Capture helper；未配置 helper 时仍降级
$env:LAN_DUAL_WINDOWS_WGC_HELPER="C:\DevTools\lan-dual-wgc-helper.exe" # 可选；原生 WGC helper 路径
$env:LAN_DUAL_WINDOWS_WGC_HELPER_ARGS=""   # 可选；传给 helper 的额外参数，支持引号包裹含空格路径
$env:LAN_DUAL_FFMPEG="C:\DevTools\ffmpeg\bin\ffmpeg.exe" # 可选；PATH 不稳定时显式指定 FFmpeg
$env:LAN_DUAL_WINDOWS_H264_CODEC_STRING="avc1.42E01F" # 可选；默认会从 SPS 更新，缺失时用该 baseline codecString
$env:LAN_DUAL_WINDOWS_JPEG_QUALITY="70"    # 强制覆盖 JPEG 质量，35-92；不设置时按 qualityPreset/maxBandwidthKbps 自动计算
$env:LAN_DUAL_WINDOWS_MAX_SCREEN_FPS="30"  # 可选：FFmpeg 默认上限 60，1-60；WGC helper 1-240；system 模式默认 4，1-8
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

需要先查看参数而不列设备或采集声音时，可以运行：

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-audio-devices.mjs --help
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

Windows host 真机联调前，建议先跑一键体检。默认只做低风险检查：Node/FFmpeg、Windows Graphics Capture 支持预检、Windows host 语法、输入 helper 安全干跑、音频设备/WASAPI 格式、局域网/防火墙只读检查，以及通过 `start-windows-host --status --json` 做运行中 host 状态检查；不会播放声音、不会发真实鼠标键盘输入，也不要求 `43770` 已经有服务监听。

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-host-readiness.mjs
```

需要确认所有 Windows `.mjs` 工具脚本的 `--help` / `-h` 都只打印帮助、不误启动服务或探测时，可以运行统一覆盖自检：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-windows-script-help.mjs
```

需要单独确认这台 Windows 是否具备后续 WGC 采集条件时，可以运行只读预检。它只检查系统 build、WinRT 类型、`GraphicsCaptureSession.IsSupported()` 和显卡/虚拟显示适配器信息，不会启动采集，也不会改系统设置。当前这台 Windows 11 本机预检通过：build `26200`，WGC WinRT 类型齐全，`GraphicsCaptureSession.IsSupported()` 为 `true`，检测到 2 个硬件 GPU 和 5 个虚拟显示适配器。

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-wgc-support.mjs
node E:\codex\lan-dual-control\scripts\windows\check-windows-wgc-support.mjs --json
```

默认一键体检只把 WGC 预检作为信息项；等真正实现 WGC 采集后，再用 `--requireWgc` 把它变成强校验。

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-host-readiness.mjs --requireWgc
```

常用预设可直接用 `--profile`：`default` 与上面的默认体检一致；`deploy` 用于 Windows host 已启动、准备让 Mac 连入前，会开启严格模式、要求配置端口可达、确认运行中 host 是当前 git build，并短时验证视频和系统声音；视频/音频短验收默认还会要求帧 `timestamp` 单调，且接收年龄不超过 1000ms；`deep` 在 `deploy` 基础上再跑 `test-windows-host.ps1` 本机自检。若 `43770` 没有服务正在监听，`deploy` / `deep` 失败是正常现象，先用启动助手或 `node .\server.mjs 43770 0.0.0.0` 启动 Windows host。

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-host-readiness.mjs --profile deploy
node E:\codex\lan-dual-control\scripts\windows\check-windows-host-readiness.mjs --profile deep
```

如果刚重启或部署 Windows host，可以用 runtime build 强校验确认自己连到的是新进程；默认体检会消费 `start-windows-host --status --json` 的 `runtime` / `buildDiff` / `capabilities`，只在发现旧 build 时提示 warning，`--requireCurrentBuildId` 才会让旧 build 直接失败。

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-host-readiness.mjs --requireOpen --requireCurrentBuildId
node E:\codex\lan-dual-control\scripts\windows\check-windows-host-readiness.mjs --expectBuildId <build-id>
```

需要把视频和系统声音短采集也纳入体检时，再显式加 probe。脚本会临时启动 Windows host，短时观察 FFmpeg 视频帧和 WASAPI PCM 音频帧，结束后自动关闭临时服务；默认不会播放测试音。`--maxVideoFrameAgeMs` / `--maxAudioFrameAgeMs` 默认都是 `1000`，设为 `0` 可临时跳过对应帧新鲜度阈值。

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

需要先查看参数而不探测端口或查询防火墙状态时，可以运行：

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-firewall.mjs --help
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

需要先查看参数而不创建 input helper 时，可以运行：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-windows-input-helper.mjs --help
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

视频持续帧观察脚本可统计几秒内实际收到的帧数、平均 FPS、最大帧间隔、掉帧数、采集管线、请求码率、实际 `jpegQuality` 和 `video_frame.timestamp` 接收年龄：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-video.mjs
```

需要先查看参数而不启动临时 host 时，可以运行：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-video.mjs --help
```

默认临时使用 `127.0.0.1:43772`；如果该端口已被其他自检占用，脚本会自动换一个临时空闲端口。需要连接已运行的 Windows host 时再加 `--useExisting --host 127.0.0.1 --port 43770`。脚本会自动识别 `C:\DevTools\ffmpeg\bin\ffmpeg.exe`，也可以显式传入 `--ffmpeg C:\DevTools\ffmpeg\bin\ffmpeg.exe`。在本机临时 host 或本机已运行 host 上，脚本还会默认采样 Windows host 主进程的 CPU、工作集、私有内存、句柄和线程；需要把 FFmpeg 子进程也纳入总资源对照时，加 `--resourceSampleTree true`，不需要资源采样时加 `--resourceSample false`。

如果视频回退到 mock 或系统截图兜底，观察脚本会在 JSON 的 `observation.fallbackReasons` 和文本输出里带出 `streamFallbackReason` / `lastCaptureError`。因此遇到 `windows-ffmpeg-gdigrab-fallback-mock` 时，优先看这里区分是 FFmpeg 超时、`gdigrab` 权限/桌面捕获错误，还是 System.Drawing 兜底也失败。

需要验证 WGC 切换入口时，可以先用 `--screenMode wgc --requireRealVideo false --json`。当前不会把过渡采集伪装成真正 WGC：未配置 `LAN_DUAL_WINDOWS_WGC_HELPER` 时，`/discovery.capabilities.screen.requestedMode` 会显示 `wgc`，`screen.wgc.backendImplemented=false`，`wgcFallbackReason` 会说明 WGC 预检结果以及已降级到 FFmpeg/System.Drawing/mock。

WGC helper 接入点已经落地：当 `LAN_DUAL_WINDOWS_SCREEN_MODE=wgc`、WGC 预检通过、且 `LAN_DUAL_WINDOWS_WGC_HELPER` 指向可执行 helper 时，Windows host 会启动该 helper，并按 `json-lines-v1` 协议从 stdout 接收 JPEG 帧。helper 启动时会收到 `LAN_DUAL_WGC_WIDTH`、`LAN_DUAL_WGC_HEIGHT`、`LAN_DUAL_WGC_FPS`、`LAN_DUAL_WGC_DISPLAY_ID`、`LAN_DUAL_WGC_JPEG_QUALITY` 等环境变量；每行可输出 `{"type":"hello","backend":"windows-graphics-capture","codec":"jpeg","encoding":"base64"}` 或 `{"type":"frame","frameId":1,"timestamp":"...","width":1280,"height":720,"dataBase64":"..."}`。接入成功时 `/discovery.capabilities.screen.wgc.active=true`，`capturePipeline=windows-wgc-helper-jpeg`。

Rust helper 项目位于 `apps/windows-wgc-helper`。当前 `cargo run -- --probe` 已能真正初始化 WGC 链路：D3D11 device、WinRT Direct3D device、主显示器 `GraphicsCaptureItem`、frame pool 和 capture session；本机 probe 识别到 `显示 1`、`2560x1440`。`--mock` 会输出同一 JSON 行合同的测试 JPEG 帧，`scripts/windows/test-windows-wgc-helper.mjs` 会构建 helper、跑 probe/mock，并把构建出的 exe 接入 Node host 验证 `windows-wgc-helper-jpeg` 管线。下一步是从 `Direct3D11CaptureFrame.Surface` 做真实帧 readback 和 JPEG 编码。

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-windows-wgc-mode.mjs
node E:\codex\lan-dual-control\scripts\windows\test-windows-wgc-mode.mjs --mockHelper --durationMs 1200 --minFrames 5
node E:\codex\lan-dual-control\scripts\windows\test-windows-wgc-helper.mjs
```

需要验证 Windows host 的可选 H.264 流式模式时，可以使用 `ffmpeg-h264`。该模式仍使用 FFmpeg `gdigrab` 采集桌面，但输出 `video_frame.codec=h264`、`encoding=annexb-base64`、`capturePipeline=windows-ffmpeg-gdigrab-h264`，`session_answer` / `display_settings_ack` / `video_frame` 会带 `codecString`。它用于提前联调 Mac client H.264 接收链路；真正低延迟 Windows 采集仍优先推进 WGC backend。

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-windows-h264-mode.mjs
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-video.mjs --screenMode ffmpeg-h264 --preferredVideoCodec h264 --width 1280 --height 720 --fps 30 --durationMs 2500 --minFrames 10 --minFps 5 --maxGapMs 1000 --maxFrameAgeMs 1000 --requireMonotonicTimestamp --resourceSample false --json
```

当前 H.264 短基线：`2026-06-13 14:18` 在真实桌面权限下运行 `test-windows-h264-mode`，本机临时 host 720p/30Hz 观察 2.5 秒收到 73 帧，平均 28.83 FPS，最大帧间隔 53 ms，timestamp 单调，管线为 `windows-ffmpeg-gdigrab-h264`，codec 为 `h264`。普通沙盒上下文仍可能遇到 FFmpeg `gdigrab error 5` / mock fallback；这属于桌面抓屏权限/会话限制，不应误判为 H.264 管线不可用。当前实现使用 `libx264` 软件编码和 JSON/base64 过渡传输，后续仍需 WebSocket 二进制帧、WGC 采集和硬件编码优化。

需要对照码率和 JPEG 质量时：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-video.mjs --bandwidthKbps 5000 --qualityPreset smooth --json
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-video.mjs --bandwidthKbps 40000 --qualityPreset sharp --json
```

需要确认普通启动的 FFmpeg 默认上限仍为 60 Hz 时：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-video.mjs --fps 60 --useDefaultMaxScreenFps --expectSessionFps 60 --durationMs 4000 --minFrames 140 --minFps 35 --maxGapMs 1000
```

当前 FFmpeg gdigrab 60 Hz 基线：`2026-06-13 03:00` 本机临时 host 观察 4 秒收到 230 帧，平均 57.1 FPS，最大帧间隔 41 ms，`dropped=4`，`video_frame.timestamp` 接收年龄 min/avg/max `0/0/1 ms`，timestamp 单调；请求码率 50 Mbps，`jpegQuality=0.62`，平均帧大小约 45 KB。后续 Windows Graphics Capture 采集实装后，至少要和这条基线对照帧率、最大帧间隔、帧新鲜度、码率/画质和资源占用。

当前带资源采样的 60 Hz 对照：`2026-06-13 12:30` 使用 `--resourceSampleTree true` 观察 4 秒收到 198 帧，平均 49.49 FPS，最大帧间隔 43 ms，`dropped=35`，帧年龄最大 1 ms；进程树包含 `node`、`conhost`、`ffmpeg`，CPU 平均/峰值约 `4.5/5.4%`，工作集平均/峰值约 `308.4/309.3 MiB`，私有内存平均/峰值约 `437.2/440.9 MiB`。后续 WGC 或正式编码管线实装后，建议用同一命令加 `--resourceSampleTree true --json` 做 A/B 对照。

`2026-06-13 13:09` 复测短视频观察曾恢复成功：1 秒收到 50 帧，约 49.54 FPS，最大帧间隔 38 ms，帧年龄最大 19 ms；`13:18` 同一桌面会话复测再次回退到 `windows-ffmpeg-gdigrab-fallback-mock`，新版诊断已能输出 `reason=FFmpeg did not produce a JPEG frame within 5000 ms; System.Drawing CopyFromScreen fallback failed`。这说明 `gdigrab error 5` 属于当前过渡采集层的不稳定现象，后续优先推进 WGC 采集替换。

需要把低延迟帧新鲜度纳入强校验时：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-video.mjs --durationMs 2500 --minFrames 20 --minFps 8 --maxGapMs 1000 --maxFrameAgeMs 1000 --requireMonotonicTimestamp
```

强制对照旧系统截图兜底路径：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-video.mjs --screenMode system --fps 4 --durationMs 2500 --minFrames 3 --minFps 1 --maxGapMs 2000
```

音频持续帧观察脚本可统计 Windows host 的 `audio_frame` 帧数、稳态帧率、最大帧间隔、payload 大小、电平和 `audio_frame.timestamp` 接收年龄。默认临时启动 `screenMode=mock`、`audioMode=wasapi` 的 Windows host，只观察系统声音，不额外压视频；默认会丢掉前 5 帧作为预热再计算稳态 FPS；在本机临时 host 或本机已运行 host 上，也会默认采样 Windows host 主进程资源，必要时可用 `--resourceSampleTree true` 把子进程纳入总资源对照：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-audio.mjs
```

需要先查看参数而不启动临时 host 时，可以运行：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-audio.mjs --help
```

需要把音频帧新鲜度纳入强校验时：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-audio.mjs --durationMs 2500 --minFrames 80 --minFps 40 --maxGapMs 1000 --maxFrameAgeMs 1000 --requireMonotonicTimestamp
```

当前 WASAPI loopback 稳态基线：`2026-06-13 03:00` 本机临时 host 30 秒观察收到 1482 帧，稳态 49.98 FPS，最大帧间隔 33 ms，首帧约 395 ms，payload 恒定 7680 bytes，`audio_frame.timestamp` 稳态接收年龄 min/avg/max `0/0/1 ms`，timestamp 单调；本次无人值守未播放测试音，系统电平为 0。

当前带资源采样的 WASAPI 短对照：`2026-06-13 12:30` 本机临时 host 3.5 秒观察收到 135 帧，稳态 49.72 FPS，最大帧间隔 32 ms，首帧约 841 ms，payload 恒定 7680 bytes，帧年龄最大 0 ms，主进程 CPU 平均/峰值 `0/0%`，工作集平均/峰值约 `62.1/62.5 MiB`。

需要缩短观察或连接已运行的 Windows host 时：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-audio.mjs --durationMs 3000 --warmupFrames 5 --useExisting --host 127.0.0.1 --port 43770
```

需要确认默认播放设备真的有声音被 WASAPI loopback 捕获时，可显式播放短测试音并要求电平升高：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-audio.mjs --durationMs 4500 --minFrames 160 --minFps 40 --playTone --requireLevel --minLevel 0.02
```

`--playTone` 会通过系统默认播放设备播放一段短 WAV，默认关闭；无人值守长稳观察不要开启它。

需要一次顺序跑完视频和音频基线时，可以使用媒体汇总脚本。它会先跑视频观察，再跑 WASAPI 音频观察，最后输出一个 JSON 或文本汇总；默认避免同时启动两个临时 Windows host 抢屏幕/音频采集资源。视频阶段默认要求真实 FFmpeg/GDI 帧，不会把 mock 回退算作通过，并且遇到临时 FFmpeg 启动波动时会重试一次：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-media.mjs
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-media.mjs --resourceSampleTree true --json
```

如果只想看其中一条链路，可以加 `--skipVideo` 或 `--skipAudio`。本轮 `2026-06-13 13:02` 音频顺序路径通过：3.5 秒收到 133 帧，稳态 49.94 FPS，最大间隔 43 ms，首帧约 877 ms，payload 7680 bytes，帧年龄最大 13 ms。当前同机 FFmpeg gdigrab 视频短验收偶发回退到 `windows-ffmpeg-gdigrab-fallback-mock`，直接 FFmpeg `gdigrab` 也出现过 `Failed to capture image (error 5)`；因此真实视频基线应在桌面捕获恢复稳定后复测，或继续推进 WGC 采集替换。

认证重试策略回归脚本会同时验证 Windows host 和假 Mac 服务：错误密码剩余 `2/1/0`、第三次断开、新连接正确密码通过。

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-auth-retry-policy.mjs
```

需要先查看参数而不启动临时 Windows host 或假 Mac 服务时，可以运行：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-auth-retry-policy.mjs --help
```

## 下一步

1. 使用 Mac 控制端连接 `ws://Windows-IP:43770`。
2. 把当前 FFmpeg/System.Drawing 过渡采集层升级为 Windows Graphics Capture，提升帧率和延迟表现。
3. 在有人看屏幕时继续用 `-InputEvents -InputMode system` 验收真实 SendInput，并评估是否需要进一步升级为原生模块。
4. 继续验证 WASAPI loopback 更长时间稳定性、系统音量变化和 Mac client 播放体验。
5. 把防火墙只读检查进一步接入桌面端提示，形成更友好的放行引导。
