# Windows 被控端骨架

这是为后续“Mac 反控 Windows”准备的第一版 Windows 被控服务。它先跑通局域网监听、协议握手、会话协商、Windows 屏幕视频帧、输入事件接收和剪贴板接收端写入；FFmpeg 或系统截图不可用时会自动回退模拟视频帧。

## 当前内容

- Node.js WebSocket 被控服务，默认端口 `43770`。
- `hello`、`auth_request`、`session_offer`、`display_settings`、`input_event`、`input_ack`、`clipboard_text` 和 `reverse_control_request` 消息处理；未认证连接会被拒绝，同一连接内密码错误 3 次后会关闭连接。
- Windows 屏幕 `video_frame` 输出：默认在 Windows 桌面会话中用 FFmpeg gdigrab 持续采集 MJPEG/JPEG；也可显式使用 `ffmpeg-h264` 让 FFmpeg 输出 H.264 Annex B 帧，默认编码器为 `libx264`，也可用 `LAN_DUAL_WINDOWS_H264_ENCODER` 或启动/测试脚本的 `--h264Encoder` 选择 `h264_nvenc` 等 FFmpeg H.264 编码器。H.264 输出会按分辨率和刷新率自动选择 `h264Level`，避免 2K/4K 或高刷新率会话被固定 Level 4.2 限制。`ffmpeg-h264` 模式下，如果控制端明确请求 `preferredVideoCodec=mjpeg` 或 `preferredVideoEncoding=data-url`，当前会话会切回 FFmpeg MJPEG/JPEG，保证浏览器 H.264 解码不可用时仍有画面；无 FFmpeg 或采集失败时回退 PowerShell/System.Drawing 系统截图，失败时再回退模拟帧。控制端下发的 `qualityPreset` 和 `maxBandwidthKbps` 会换算为实际 `jpegQuality`，让 5/10/20/40/50 Mbps 对应不同压缩质量。若控制端声明 `preferredVideoTransport=binary-jpeg`，JPEG 帧会优先走 WebSocket 二进制帧；若 H.264 会话声明 `binary-h264`，Annex B payload 会走 WebSocket 二进制帧，减少 data URL/base64 文本重发成本；不支持时仍回退旧 JSON 文本帧。
- 音频 `audio_frame` 输出：默认发送模拟帧；显式设置 `LAN_DUAL_WINDOWS_AUDIO_MODE=wasapi` 后可用 Windows WASAPI loopback 采集默认播放设备的系统声音并发送 `pcm-f32le-base64` PCM 帧；也可设置 `LAN_DUAL_WINDOWS_AUDIO_DEVICE` 试用 FFmpeg DirectShow 指定设备。
- 屏幕采集当前是 FFmpeg gdigrab + PowerShell/System.Drawing 兜底的过渡实现；`ffmpeg-h264` 是可选流式编码模式，主要用于和 Mac client H.264 接收链路联调，不替代后续 Windows Graphics Capture。已新增 Windows Graphics Capture 支持预检和 Rust helper 项目；helper 目前可完成 WGC/D3D 初始化、读取真实 `Direct3D11CaptureFrame.Surface`、CPU readback、请求分辨率缩放，并可输出 JPEG、raw BGRA 或 NV12 给 Node host。下一步是 helper 原生硬编、资源对照和 Mac client 真连观感验收。
- WASAPI loopback 是当前推荐的系统声音采集入口；DirectShow PCM 入口保留给虚拟声卡/loopback 设备做兼容验证。
- SendInput 输入注入模块：在 Windows 上通过常驻 C# helper 调用 `SendInput` 和 `SetCursorPos` 注入鼠标、滚轮和常用键盘事件，避免每个事件重复启动 PowerShell；在非 Windows 开发环境只记录事件。
- 输入事件处理后会返回 `input_ack`，便于控制端和联调脚本确认已注入、仅记录或被拒绝。
- 文本剪贴板模块：在 Windows 上通过 PowerShell `Set-Clipboard` 写入系统剪贴板，在非 Windows 开发环境回退为内存保存。
- 文件剪贴板接收模块：接收 `clipboard_file_*` 文件清单、分块、完成消息并返回进度；接收端现在必须先收到并接受 `clipboard_file_offer`，会校验文件数量、512MB 总量上限、64KB 分块上限、`fileIndex`、`offset`、分块不越界且不重叠，并按每个文件真实覆盖区间判断完整性；在 Windows 上通过 PowerShell `Set-Clipboard -Path` 写入系统文件剪贴板，在非 Windows 开发环境保存到临时目录。
- `/discovery` 设备发现接口，供 Windows 控制端或未来 Mac 控制端扫描局域网设备列表；`/discovery` 和 `hello_ack` 会带可选 `runtime` 诊断，显示当前进程 PID、启动时间、运行时长和 build id，方便确认没有连到旧进程。
- `/discovery.capabilities.videoTransports` 会声明当前 Windows host 支持 `json`、`binary-jpeg` 和 `binary-h264`；`session_answer` / `display_settings_ack` 会回传实际 `videoTransport`，方便 Mac client 和自检脚本确认是否启用了二进制视频路径。

## 运行

进入目录：

```powershell
cd E:\codex\lan-dual-control\apps\windows-host
```

启动：

```powershell
node .\server.mjs
```

更推荐的日常入口是 Windows host 启动助手。它会启动被控服务，自动把当前 git short hash 作为 `LAN_DUAL_BUILD_ID`，列出 Mac 端应该填写的局域网地址，并在服务起来后自动跑一次只读端口/防火墙检查；`/discovery` 就绪后还会打印 Mac 端可直接运行的 readiness、formal checklist 命令和一行无密 Agent Link Board 摘要。如果 Mac 连不上，先看它打印的提示。

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

需要给脚本或联络板消费时，加 `--json` 输出纯机器可读 JSON；如果还要同时看 Agent Link Board 当前是否有 Mac -> Windows 呼叫，加 `--checkBoard` / `-CheckBoard` 只读读取 `/api/state.currentCall`。PowerShell 包装也可以用 `-Status -Json` 走同一条只读检查：

```powershell
node E:\codex\lan-dual-control\scripts\windows\start-windows-host.mjs --status --json
node E:\codex\lan-dual-control\scripts\windows\start-windows-host.mjs --status --json --checkBoard
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\codex\lan-dual-control\scripts\windows\start-windows-host.ps1 -Status -Json
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\codex\lan-dual-control\scripts\windows\start-windows-host.ps1 -Status -Json -CheckBoard
```

需要把当前 Windows host 在线状态同步到 Agent Link Board，或让 Mac 端直接跑真连前 readiness / formal checklist，可以用无密摘要输出。它会给出 `check-mac-client-readiness`、`check-mac-client-formal-status`、ready 后可用的 `check-mac-client-formal-status --sendCall`，以及本机 `WindowsHostMedia=check-windows-host-readiness --checkBoard --probeMedia --boardSummary` 媒体基线命令；加 `--checkBoard` / `-CheckBoard` 时，摘要还会提示 active Mac -> Windows `currentCall`，DONE call 不会当作待办。状态入口不会启动服务、不会认证、不会打印密码：

```powershell
node E:\codex\lan-dual-control\scripts\windows\start-windows-host.mjs --status --boardSummary
node E:\codex\lan-dual-control\scripts\windows\start-windows-host.mjs --status --checkBoard --boardSummary
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\codex\lan-dual-control\scripts\windows\start-windows-host.ps1 -Status -BoardSummary
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\codex\lan-dual-control\scripts\windows\start-windows-host.ps1 -Status -CheckBoard -BoardSummary
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
$env:LAN_DUAL_WINDOWS_SCREEN_MODE="ffmpeg-h264" # 强制 FFmpeg gdigrab + H.264 encoder，输出 H.264 Annex B
$env:LAN_DUAL_WINDOWS_H264_ENCODER="h264_nvenc" # 可选；默认 libx264，也可试 h264_qsv / h264_amf / h264_mf / h264_d3d12va
$env:LAN_DUAL_WINDOWS_SCREEN_MODE="system" # 强制 Windows 系统截图 JPEG
$env:LAN_DUAL_WINDOWS_SCREEN_MODE="wgc"    # 显式请求 Windows Graphics Capture helper；未配置 helper 时仍降级
$env:LAN_DUAL_WINDOWS_WGC_HELPER="C:\DevTools\lan-dual-wgc-helper.exe" # 可选；原生 WGC helper 路径
$env:LAN_DUAL_WINDOWS_WGC_HELPER_ARGS=""   # 可选；传给 helper 的额外参数，支持引号包裹含空格路径
$env:LAN_DUAL_WINDOWS_WGC_H264_BRIDGE="1"  # 可选；WGC helper JPEG 帧桥接 FFmpeg H.264 编码
$env:LAN_DUAL_WINDOWS_WGC_H264_SOURCE="nv12" # 可选；默认 jpeg，也可用 raw-bgra/nv12 跳过 helper JPEG 编码
$env:LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME="1" # 可选；WGC 静态画面下重复上一帧维持稳定 pacing
$env:LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME_MODE="full" # full | signal；H.264 桥接会内部复用上一帧
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

需要把 Windows 体检结论同步到 Agent Link Board 时，可以加 `--boardSummary`。它会输出一行无密摘要，并在 host 在线时透出 Mac 端下一步可运行的 readiness / formal checklist 命令；`--json` 也会带 `boardSummary` 和 `macClientReadinessCommands` 字段，方便自动化脚本消费。若 Mac 端已经通过通讯板发起 Windows host 验收 call，再加 `--checkBoard` 会只读读取 Agent Link Board `/api/state.currentCall`，并在 JSON / 普通输出 / boardSummary 中提示 active Mac -> Windows call；DONE call 不会当作待办：

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-host-readiness.mjs --boardSummary
node E:\codex\lan-dual-control\scripts\windows\check-windows-host-readiness.mjs --checkBoard --boardSummary
node E:\codex\lan-dual-control\scripts\windows\check-windows-host-readiness.mjs --json
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

需要把 WGC H.264 raw-bgra / NV12 源格式短对照也纳入体检时，显式加 `--probeWgcH264Sources`。它会启动本机临时 Windows host 和 WGC helper，跑一组 30Hz/10Mbps 的短对照并把结果汇总进 readiness；首次失败会换一个临时端口自动重试一次。该探针较重，所以不会被默认体检或 `--profile deep` 自动触发。

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-host-readiness.mjs --probeWgcH264Sources
```

常用预设可直接用 `--profile`：`default` 与上面的默认体检一致；`deploy` 用于 Windows host 已启动、准备让 Mac 连入前，会开启严格模式、要求配置端口可达、确认运行中 host 是当前 git build，并短时验证视频和系统声音；视频/音频短验收默认还会要求帧 `timestamp` 单调，且接收年龄不超过 1000ms；`deep` 在 `deploy` 基础上再跑 `test-windows-host.ps1` 本机自检和文件剪贴板服务级坏包回归。若 `43770` 没有服务正在监听，`deploy` / `deep` 失败是正常现象，先用启动助手或 `node .\server.mjs 43770 0.0.0.0` 启动 Windows host。

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

如果想要一行统一的媒体状态，优先用 `--probeMedia --boardSummary`。它会顺序复用 Windows 媒体聚合脚本，JSON 里保留 `Windows host media aggregate` 详情，通讯板摘要直接显示 `media=ok`、`media=partial(passed=X,failed=Y)` 或 `media=failed(passed=X,failed=Y)`，方便 Mac 端判断是视频、音频还是两者都需要复测。
普通输出模式下，视频、音频和聚合观察都会默认每 10 秒打印一次进度；长时间基线可用 `--progressIntervalMs <ms>` 调整频率，传 `0` 可关闭。`--json` 和 `--boardSummary` 会保持机器可读/一行摘要输出，不混入进度行。

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-host-readiness.mjs --probeMedia --boardSummary
```

Mac 从另一台机器连入前，如果要求 `43770` 必须正在监听且局域网可达，可以加 `--requireOpen`；这通常应在你已经手动启动 `node .\server.mjs 43770 0.0.0.0` 后运行。

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-host-readiness.mjs --host 0.0.0.0 --port 43770 --requireOpen
```

Windows 本机可直接运行自检脚本。它会在 `127.0.0.1:43772` 临时启动 Windows 被控端，验证 `/discovery`、WebSocket 认证、真实视频首帧、文本剪贴板和文件剪贴板接收，结束后自动关闭临时服务。如果 `43772` 已被其他服务占用，脚本会自动换一个临时空闲端口；需要验证已运行的 Windows host 时再显式加 `-UseExisting -HostName 127.0.0.1 -Port 43770`。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\codex\lan-dual-control\scripts\windows\test-windows-host.ps1
```

文件剪贴板接收安全边界可单独跑服务级 WebSocket 回归。脚本会在本进程启动临时 Windows host，认证后发送无 offer 分片、超大分片、重复/重叠分片、不完整完成、bytes 不一致和错误 fileIndex，并确认真实协议入口返回拒绝；它使用内存剪贴板回退，不写系统剪贴板、不发送输入事件：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-windows-host-clipboard-security.mjs
```

也可以把这项坏包回归接入一键体检：`--probeClipboardSecurity` 会在默认体检后额外跑一次服务级 WebSocket 安全回归；`--profile deep` 会自动包含它。

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-host-readiness.mjs --probeClipboardSecurity
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

如果本轮改到了视频传输、H.264、fallback 或 WebSocket binary frame，优先跑视频传输矩阵。默认会顺序启动 4 组临时 host/client/browser，并覆盖 `binary-h264`、H.264 JSON/base64 兼容路径、H.264 unsupported 后的 MJPEG/JPEG fallback，以及 `binary-jpeg`：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-mac-client-video-transports.mjs
node E:\codex\lan-dual-control\scripts\windows\test-mac-client-video-transports.mjs --h264Encoder h264_nvenc
```

矩阵默认会在单个 case 失败后自动重试 1 次，并为重试分配新的临时端口，减少浏览器或临时 host 尚未释放导致的误报；需要严格复现首次失败时可加 `--retries 0`。

真实 WGC helper + NV12 + NVENC H.264 路径需要可用的桌面捕获上下文和已构建的 helper，默认矩阵不会强制跑；需要时显式选择第五个 case，或把它加入默认四项：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-mac-client-video-transports.mjs --case wgc-nv12-h264 --timeoutMs 90000
node E:\codex\lan-dual-control\scripts\windows\test-mac-client-video-transports.mjs --includeWgcNv12 --h264Encoder h264_nvenc --timeoutMs 90000
```

本轮 `2026-06-15 13:17` 默认矩阵复验 4/4 通过：`binary-h264` 48 帧 / 907 ms / 52.9 FPS；H.264 JSON/base64 54 帧 / 913 ms / 59.1 FPS；H.264 fallback 49 帧 / 916 ms / 53.5 FPS；`binary-jpeg` 11 帧 / 1207 ms / 9.1 FPS。可选 `wgc-nv12-h264` 单项也通过：1080P 持续观察 49 帧 / 1516 ms / 32.3 FPS，切到 2K / 60 Hz / 40 Mbps 后 46 帧 / 1502 ms / 30.6 FPS，session pipeline 为 `windows-wgc-helper-nv12-ffmpeg-h264`、`h264_nvenc`、level `4.2`/`5.1`。

需要把真实 Windows 系统声音也纳入 Mac 控制页验收时，加 `--requireAudio`；脚本会临时设置 `LAN_DUAL_WINDOWS_AUDIO_MODE=wasapi`，打开页面声音开关，并等待 `pcm-f32le-base64` 播放计数：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-mac-client-browser.mjs --requireAudio
```

需要单独验证 Mac 控制页收到 Windows host 的 WebSocket 二进制 JPEG 视频帧时，加 `--expectBinaryVideo`；脚本会启动临时 WGC JPEG helper，要求页面显示 `jpeg/binary`、诊断出现“二进制”，并继续做持续帧观察：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-mac-client-browser.mjs --expectBinaryVideo --allowClipboardFallback --skipFileClipboard --observeVideoMs 1200 --minObservedVideoFrames 5 --minObservedVideoFps 5
```

需要单独验证 H.264 Annex B payload 也走 WebSocket 二进制帧时，加 `--expectBinaryH264Video`；脚本会启动临时 `ffmpeg-h264` Windows host，要求页面显示 `h264/binary`、H.264 canvas 可见、诊断出现二进制 H.264 帧。要验证 NVENC 路径时再加 `--h264Encoder h264_nvenc`：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-mac-client-browser.mjs --expectBinaryH264Video --allowClipboardFallback --skipFileClipboard --observeVideoMs 900 --minObservedVideoFrames 4 --minObservedVideoFps 4
node E:\codex\lan-dual-control\scripts\windows\test-mac-client-browser.mjs --expectBinaryH264Video --h264Encoder h264_nvenc --allowClipboardFallback --skipFileClipboard --observeVideoMs 900 --minObservedVideoFrames 4 --minObservedVideoFps 4
```

需要把真实 WGC helper 的 NV12 H.264 bridge 也打到 Mac 控制页时，加 `--expectWgcNv12H264Video`；脚本会启动 WGC helper、启用 `LAN_DUAL_WINDOWS_WGC_H264_SOURCE=nv12` 和 `h264_nvenc`，要求页面显示 `h264/binary`，并断言 session pipeline 为 `windows-wgc-helper-nv12-ffmpeg-h264`：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-mac-client-browser.mjs --expectWgcNv12H264Video --skipFileClipboard --observeVideoMs 1200 --minObservedVideoFrames 5 --minObservedVideoFps 10 --maxInitialVideoMs 15000 --timeoutMs 45000
```

`2026-06-15` 本机页面级短验收通过：最近矩阵单项复验首帧约 1576ms，页面诊断显示 `h264` canvas，收到 `binary-h264` 诊断帧，1080P 持续观察 1516ms 收到 49 帧、约 32.3 FPS；切到 2K / 60 Hz / 40 Mbps 后继续观察 1502ms 收到 46 帧、约 30.6 FPS，最后一帧为 `2560x1440 / h264/binary-h264 / level 5.1`。本轮同时修复了 H.264 level 固定为 4.2 导致 2K@60 下 NVENC/FFmpeg 退出的问题，2K 会话会提升到合适的 level。

需要回归旧 JSON/base64 兼容路径时，可关闭页面二进制视频传输：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-mac-client-browser.mjs --screenMode ffmpeg-h264 --requireH264Video --disableBinaryVideo --allowClipboardFallback --skipFileClipboard --observeVideoMs 900 --minObservedVideoFrames 4 --minObservedVideoFps 4
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

WGC helper 接入点已经落地：当 `LAN_DUAL_WINDOWS_SCREEN_MODE=wgc`、WGC 预检通过、且 `LAN_DUAL_WINDOWS_WGC_HELPER` 指向可执行 helper 时，Windows host 会启动该 helper。普通 JPEG helper 路径继续按 `json-lines-v1` 从 stdout 接收 base64 JPEG 帧；raw-bgra/NV12 H.264 bridge 会自动请求内部 `binary-frame-v1`，helper 先输出一行 JSON 元数据，再紧跟原始像素 payload，避免 raw 像素经过 JSON/base64。helper 启动时会收到 `LAN_DUAL_WGC_HELPER_PROTOCOL`、`LAN_DUAL_WGC_WIDTH`、`LAN_DUAL_WGC_HEIGHT`、`LAN_DUAL_WGC_FPS`、`LAN_DUAL_WGC_DISPLAY_ID`、`LAN_DUAL_WGC_JPEG_QUALITY` 等环境变量；接入成功时 `/discovery.capabilities.screen.wgc.active=true`，普通 JPEG 管线为 `windows-wgc-helper-jpeg`，raw-bgra H.264 管线为 `windows-wgc-helper-raw-bgra-ffmpeg-h264`，NV12 H.264 管线为 `windows-wgc-helper-nv12-ffmpeg-h264`。

WGC H.264 桥接原型已落地：显式开启 `LAN_DUAL_WINDOWS_WGC_H264_BRIDGE=1`，并且会话请求 `h264/annexb` 时，Windows host 会把 WGC helper 输出的帧喂给 FFmpeg stdin，再输出 H.264 Annex B 帧；默认来源是 JPEG，`LAN_DUAL_WINDOWS_WGC_H264_SOURCE=raw-bgra` / `nv12` 或 `--wgcH264Source raw-bgra` / `nv12` 会要求 helper 输出 raw BGRA 或 NV12，并使用对应 `capturePipeline` 跳过 helper 侧 JPEG 编码/FFmpeg 侧 JPEG 解码。可继续用 `LAN_DUAL_WINDOWS_H264_ENCODER=h264_nvenc` 选择 NVENC。启动助手等价参数如下：

```powershell
node E:\codex\lan-dual-control\scripts\windows\start-windows-host.mjs --screenMode wgc --wgcHelper E:\codex\lan-dual-control\apps\windows-wgc-helper\target\debug\lan-dual-wgc-helper.exe --wgcH264Bridge --wgcRepeatLastFrame --wgcRepeatLastFrameMode full --h264Encoder h264_nvenc
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\codex\lan-dual-control\scripts\windows\start-windows-host.ps1 -ScreenMode wgc -WgcHelper E:\codex\lan-dual-control\apps\windows-wgc-helper\target\debug\lan-dual-wgc-helper.exe -WgcH264Bridge -WgcRepeatLastFrame -WgcRepeatLastFrameMode full -H264Encoder h264_nvenc
node E:\codex\lan-dual-control\scripts\windows\start-windows-host.mjs --screenMode wgc --wgcHelper E:\codex\lan-dual-control\apps\windows-wgc-helper\target\debug\lan-dual-wgc-helper.exe --wgcH264Bridge --wgcH264Source nv12 --wgcRepeatLastFrame --h264Encoder h264_nvenc
```

`2026-06-15` 本机真实 helper + NVENC 短观察通过：JPEG bridge 在 `1280x720`、30Hz、50Mbps、repeat full 下 3 秒收到 91 帧、约 30.29 FPS、最大间隔 59ms，pipeline 为 `windows-wgc-helper-ffmpeg-h264`；raw-bgra bridge 初版 JSON/base64 在 `1280x720` 1.8 秒复验为 44 帧、约 24.29 FPS。raw-bgra bridge 已切到 helper 内部 `binary-frame-v1`：`1280x720` 两轮 2.2 秒短测均收到 66 帧、约 29.6-30.0 FPS，`helperProtocol=binary-frame-v1`，pipeline 为 `windows-wgc-helper-raw-bgra-ffmpeg-h264`。当前 NV12 bridge 也已落地：真实 helper + `h264_nvenc` 在 `320x180` 2.2 秒收到 67 帧、约 30.12 FPS、fresh helper frame 42；`1280x720` 2.2 秒收到 67 帧、约 30.06 FPS、fresh helper frame 12、repeat full 55、最大间隔 60ms，pipeline 为 `windows-wgc-helper-nv12-ffmpeg-h264`。新增 `scripts/windows/compare-windows-wgc-h264-sources.mjs` 可同条件对照 raw-bgra 与 NV12；本机 `1280x720`、30Hz、10Mbps、repeat full、`h264_nvenc`、1.2 秒短对照显示 NV12 胜出：raw-bgra 19 帧/15.58 FPS、helper frame avg 72.086ms、convert avg 70.696ms；NV12 28 帧/23.03 FPS、helper frame avg 68.805ms、convert avg 67.741ms。NV12 把 helper 到 host 的原始像素 payload 从 BGRA 的 4 bytes/pixel 降到 1.5 bytes/pixel，但当前仍是 CPU readback + CPU 转换 + FFmpeg/NVENC 桥接；下一步应继续做 helper 原生硬编，并让 Mac client 真连做画质、延迟和资源对照。

Rust helper 项目位于 `apps/windows-wgc-helper`。当前 `cargo run -- --probe` 已能真正初始化 WGC 链路：D3D11 device、WinRT Direct3D device、主显示器 `GraphicsCaptureItem`、frame pool 和 capture session；本机 probe 识别到 `显示 1`、`2560x1440`。默认运行 helper 会等待 WGC `FrameArrived`，从 `Direct3D11CaptureFrame.Surface` 取出 D3D11 texture，复制到 CPU 可读 staging texture，按请求宽高等比缩放且不放大；默认 `--outputFormat jpeg` 会用 WIC `ImageQuality` 编码 JPEG，显式 `--outputFormat bgra` 可输出 raw BGRA，显式 `--outputFormat nv12` 会输出偶数宽高的 NV12 raw payload。`--protocol json-lines-v1` 保持旧 JSON/base64 合同；`--protocol binary-frame-v1` 会输出 JSON header + 原始 payload，当前 raw-bgra/NV12 H.264 bridge 默认使用该内部协议。`--mock --outputFormat bgra --protocol binary-frame-v1 --width 8 --height 6 --frames 2` 已验证 helper binary raw BGRA 合同 payloadBytes=192；`--mock --outputFormat nv12 --protocol binary-frame-v1 --width 8 --height 6 --frames 2` 已验证 helper binary raw NV12 合同 payloadBytes=72。`scripts/windows/test-windows-wgc-helper.mjs` 会构建 helper、跑 probe/mock、验证 binary raw BGRA/NV12 mock 合同、直接验证缩放真帧 JPEG，把构建出的 exe 以 mock mode 接入 Node host 验证合同，并额外启动临时 Windows host + 真实 helper 验证 `windows-wgc-helper-jpeg` 真帧管线。下一步是 helper 原生编码，并做 Mac client 真连观感验收。

WGC 参数基准脚本位于 `scripts/windows/benchmark-windows-wgc-settings.mjs`。它会构建或复用本地 Rust helper，顺序启动临时 Windows host，并用 `observe-windows-host-video --screenMode wgc --resourceSampleTree true --json` 跑多档刷新率/码率对照。`2026-06-14 20:35` 本机 `1280x720`、每档 2.2 秒短基准已确认 30/60/120Hz 都能协商到对应会话刷新率，但当前 WGC 仍是 `FrameArrived` 事件驱动，静态桌面实收约 9-12 FPS：30Hz/10M 为 21 帧、9.25 FPS、平均约 78 KB；60Hz/20M 为 25 帧、11.11 FPS、平均约 83 KB；120Hz/40M sharp 为 27 帧、12.22 FPS、平均约 121 KB。`LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME=1` 或观察/基准脚本 `--wgcRepeatLastFrame true` / `--repeatLastFrame` 可启用重复最后一帧诊断模式，host 会在没有新 WGC 帧时复用上一帧，并在 `video_frame` 带 `repeatedFrame`、`sourceTimestamp`、`contentAgeMs`。默认 `LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME_MODE=full` 保持旧行为，会重发完整 JPEG；显式设为 `signal` 或脚本加 `--wgcRepeatLastFrameMode signal` / `--repeatLastFrameMode signal` 时，重复帧只发 `repeatPreviousFrame=true`、`payloadBytes=0` 和尺寸/时间戳诊断，不再重发 base64 图片。`2026-06-14 20:55` full repeat 短基准显示 30Hz/10M 可到 56 帧、30.45 FPS，60Hz/20M 到 62 帧、33.92 FPS，120Hz/40M sharp 到 68 帧、37.78 FPS，内容年龄最大约 80-96 ms；`2026-06-14 21:20` signal repeat 的 60Hz/20M 两轮短基准约 31-32 FPS、重复信令帧 33-35、平均图片 payload 约 17-23 KB、内容年龄最大 79-82 ms。signal 模式主要降低重复帧带宽和 JSON/base64 解析压力，不会生成更多真实源帧；后续仍应推进 WebSocket 二进制帧、H.264/硬编和 Mac client 真连观感验收。

需要快速比较 WGC H.264 raw-bgra 与 NV12 两条内部源格式时，使用 `scripts/windows/compare-windows-wgc-h264-sources.mjs`。它只是包装现有 benchmark，默认顺序跑 raw-bgra 和 NV12，并输出普通摘要、`--json` 或可发 Agent Link Board 的 `--boardSummary`；不会连接 Mac、不会认证正式密码、不会发送输入或执行 `inject`。日常收口也可以用 `check-windows-host-readiness --probeWgcH264Sources` 跑一组更短的 30Hz/10Mbps readiness 探针。

普通输出模式下，WGC benchmark 会在 helper 构建和每个 profile 子观察期间默认每 10 秒打印一次进度，WGC H.264 source compare 会在每个 source 子 benchmark 期间默认每 10 秒打印一次进度；可用 `--progressIntervalMs 5000` 改成 5 秒一次，传 `0` 可关闭。`--json` 和 `--boardSummary` 仍保持纯机器输出/单行摘要，不混入进度心跳，方便继续直接贴 Agent Link Board 或交给自动化解析。

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-windows-wgc-mode.mjs
node E:\codex\lan-dual-control\scripts\windows\test-windows-wgc-mode.mjs --mockHelper --durationMs 1200 --minFrames 5
node E:\codex\lan-dual-control\scripts\windows\test-windows-wgc-mode.mjs --mockHelper --h264Bridge --durationMs 3000 --minFrames 5
node E:\codex\lan-dual-control\scripts\windows\test-windows-wgc-helper.mjs
node E:\codex\lan-dual-control\scripts\windows\benchmark-windows-wgc-settings.mjs --durationMs 2200
node E:\codex\lan-dual-control\scripts\windows\benchmark-windows-wgc-settings.mjs --durationMs 1800 --repeatLastFrame
node E:\codex\lan-dual-control\scripts\windows\benchmark-windows-wgc-settings.mjs --profile 60:20000:balanced --durationMs 1600 --repeatLastFrame --repeatLastFrameMode signal --json
node E:\codex\lan-dual-control\scripts\windows\compare-windows-wgc-h264-sources.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary
```

需要验证 Windows host 的可选 H.264 流式模式时，可以使用 `ffmpeg-h264`。该模式仍使用 FFmpeg `gdigrab` 采集桌面，输出 `video_frame.codec=h264`、`capturePipeline=windows-ffmpeg-gdigrab-h264`、`codecString` 和实际 `h264Encoder`；默认兼容路径为 `encoding=annexb-base64` JSON 文本帧，双方声明支持后可升级为 `encoding=annexb-binary` / `videoTransport=binary-h264` WebSocket 二进制帧。默认编码器是 `libx264`；需要验证 NVIDIA 硬编时可传 `--h264Encoder h264_nvenc`，启动助手同样支持该参数。它用于提前联调 Mac client H.264 接收链路；真正低延迟 Windows 采集仍优先推进 WGC backend。

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-windows-h264-mode.mjs
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-video.mjs --screenMode ffmpeg-h264 --preferredVideoCodec h264 --width 1280 --height 720 --fps 30 --durationMs 2500 --minFrames 10 --minFps 5 --maxGapMs 1000 --maxFrameAgeMs 1000 --requireMonotonicTimestamp --resourceSample false --json
node E:\codex\lan-dual-control\scripts\windows\test-windows-h264-mode.mjs --h264Encoder h264_nvenc
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-video.mjs --screenMode ffmpeg-h264 --preferredVideoCodec h264 --h264Encoder h264_nvenc --width 1280 --height 720 --fps 30 --durationMs 1500 --minFrames 8 --minFps 5 --maxGapMs 1000 --maxFrameAgeMs 1000 --requireMonotonicTimestamp --resourceSample false --json
```

调 H.264 前可以先探测当前浏览器 WebCodecs 对各个 `avc1.*` 的支持，避免把浏览器启动参数问题误判成编码器问题：

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-webcodecs-h264-support.mjs --requireCodec avc1.42C02A
```

继续往 WGC + H.264/硬编推进前，建议先跑一遍 Windows 视频编码能力体检。它只读汇总 FFmpeg H.264 软件/硬件编码器、WGC 预检和浏览器 WebCodecs 解码能力，不启动 Windows host、不抓屏、不改系统设置；需要给自动化消费时可加 `--json`。本机 `2026-06-15 00:05` 强校验已通过：FFmpeg `8.1.1` 检测到 `libx264`、`h264_nvenc`、`h264_qsv`、`h264_amf`、`h264_mf`、`h264_d3d12va` 等 H.264 编码入口，WGC 预检通过，Edge WebCodecs H.264 支持通过；当前 WGC JPEG 桥接 H.264/NVENC 正确性原型已通过，下一步应改 raw BGRA/NV12 或原生硬编。

```powershell
node E:\codex\lan-dual-control\scripts\windows\check-windows-video-encoder-support.mjs
node E:\codex\lan-dual-control\scripts\windows\check-windows-video-encoder-support.mjs --requireAnyH264 --requireHardwareH264 --requireWgc --requireWebCodecsH264
node E:\codex\lan-dual-control\scripts\windows\check-windows-video-encoder-support.mjs --json
```

当前 H.264 短基线：`2026-06-13 14:18` 在真实桌面权限下运行 `test-windows-h264-mode`，本机临时 host 720p/30Hz 观察 2.5 秒收到 73 帧，平均 28.83 FPS，最大帧间隔 53 ms，timestamp 单调，管线为 `windows-ffmpeg-gdigrab-h264`，codec 为 `h264`。普通沙盒上下文仍可能遇到 FFmpeg `gdigrab error 5` / mock fallback；这属于桌面抓屏权限/会话限制，不应误判为 H.264 管线不可用。当前实现默认使用 `libx264` 软件编码，也支持显式 `h264_nvenc` 等 FFmpeg encoder，并会在 discovery/session/frame/观察脚本中带出实际 `h264Encoder`；可按客户端能力在 JSON/base64 和 `binary-h264` 二进制传输之间切换。WGC helper JPEG -> FFmpeg H.264 桥接已能验证 WGC 源接硬编的正确性，但后续仍需 raw BGRA/NV12 或原生硬编来减少 gdigrab 与 JPEG 桥接限制。

`2026-06-15 00:50` 本机 NVENC 过渡路径复验通过：`test-windows-h264-mode --h264Encoder h264_nvenc` 收到 55 帧 / 约 27.38 FPS；`observe-windows-host-video --h264Encoder h264_nvenc` 收到 40 帧 / 1508 ms / 26.52 FPS，最大帧间隔 51 ms，`h264Encoder=h264_nvenc` 出现在 discovery、session 和帧观察里；Mac client 页面级 `--expectBinaryH264Video --h264Encoder h264_nvenc` 观察 53 帧 / 911 ms / 58.2 FPS；视频传输矩阵加 `--h264Encoder h264_nvenc` 后 4/4 通过，`binary-h264` 约 57.0 FPS，旧 JSON/base64、fallback 和 `binary-jpeg` 均未退化。`libx264` 默认路径也复验通过，1.5 秒 42 帧 / 27.77 FPS。

`2026-06-14 22:55` 本机 Edge WebCodecs 探针确认 `avc1.42C02A` 的 `annexb` 和默认 AVC 配置都支持；Mac client 页面自检已移除 headless 默认 `--disable-gpu`，`--screenMode ffmpeg-h264 --requireH264Video` 通过：页面显示 `h264 · 解码 #4 · 8 ms · 到达 2 ms`，短窗口 55 帧 / 906 ms / 60.7 FPS。后续如果要故意复现旧的 H.264 不支持环境，可给页面自检加 `--forceH264Unsupported` 或 `--disableWebCodecs`，不要再依赖禁 GPU 的偶然副作用。

`2026-06-14 23:33` 本机页面级复验确认 H.264 也能走 WebSocket 二进制帧：`--expectBinaryH264Video` 显示 `h264/binary`，短窗口 55 帧 / 911 ms / 60.4 FPS，收到 23 个二进制 H.264 帧；旧 JSON/base64 兼容路径用 `--disableBinaryVideo` 通过，短窗口 54 帧 / 914 ms / 59.1 FPS；WGC JPEG 的 `binary-jpeg` 回归也通过，短窗口 11 帧 / 1213 ms / 9.1 FPS。

如果 Mac client 所在浏览器不支持当前 H.264 `codecString`，页面会发送 `display_settings` 请求 `preferredVideoCodec=mjpeg` / `preferredVideoEncoding=data-url`。Windows host 即使以 `ffmpeg-h264` 启动，也会按这次请求把当前会话改为 `windows-ffmpeg-gdigrab-mjpeg`，避免页面卡在“等待 JPEG”。可用下面的页面级自检同时覆盖“先尝试 H.264、失败后自动切 JPEG”的路径：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-mac-client-browser.mjs --expectH264Fallback --allowClipboardFallback --skipFileClipboard --observeVideoMs 900 --minObservedVideoFrames 4 --minObservedVideoFps 4
```

需要强制从一开始就走 MJPEG/JPEG fallback 时，可禁用页面 WebCodecs：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-mac-client-browser.mjs --screenMode ffmpeg-h264 --disableWebCodecs --allowClipboardFallback --skipFileClipboard --observeVideoMs 900 --minObservedVideoFrames 4 --minObservedVideoFps 4
```

`2026-06-14 22:40` 本机复验结果：动态 H.264 fallback 路径最终显示 `jpeg/binary`，短窗口 52 帧 / 907 ms / 57.3 FPS；禁用 WebCodecs 的直接 MJPEG fallback 路径 55 帧 / 915 ms / 60.1 FPS；独立 `test-windows-h264-mode` 仍能收到 H.264 42 帧 / 1.5 秒 / 27.73 FPS。

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

需要一次顺序跑完视频和音频基线时，可以使用媒体汇总脚本。它会先跑视频观察，再跑 WASAPI 音频观察，最后输出一个 JSON 或文本汇总；默认避免同时启动两个临时 Windows host 抢屏幕/音频采集资源。普通输出会默认每 10 秒打印视频/音频观察进度，长测时可用 `--progressIntervalMs 5000` 改成 5 秒一次，传 `0` 可关闭。视频阶段默认要求真实 FFmpeg/GDI 帧，不会把 mock 回退算作通过，并且遇到临时 FFmpeg 启动波动时会重试一次：

```powershell
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-media.mjs
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-media.mjs --resourceSampleTree true --json
node E:\codex\lan-dual-control\scripts\windows\observe-windows-host-media.mjs --resourceSampleTree true --boardSummary
```

`--boardSummary` 会输出一行可直接发到 Agent Link Board 的无密摘要，包含请求分辨率/Hz/Mbps、视频 FPS/最大间隔/帧年龄、音频稳态 FPS/最大间隔/帧年龄和资源采样摘要；失败时也会输出脱敏摘要，单路成功单路失败标为 `Windows media: partial`，全部执行链路失败才标为 `Windows media: failed`，`--json` 失败路径同样返回可解析报告和 `boardSummary`，并在 `summary.status` 给出机器可读的 `ok` / `partial` / `failed`。视频或音频其中一路失败时，脚本会继续尝试未跳过的另一条链路，并在报告里保留已成功的结果，方便把 FFmpeg/GDI/WASAPI 波动同步给另一端排障；不会输出密码、系统账号、输入事件或 `inject` 命令。`--json` 和 `--boardSummary` 不打印进度心跳，确保自动化和通讯板摘要可直接解析。如果只想看其中一条链路，可以加 `--skipVideo` 或 `--skipAudio`。本轮 `2026-06-13 13:02` 音频顺序路径通过：3.5 秒收到 133 帧，稳态 49.94 FPS，最大间隔 43 ms，首帧约 877 ms，payload 7680 bytes，帧年龄最大 13 ms。当前同机 FFmpeg gdigrab 视频短验收偶发回退到 `windows-ffmpeg-gdigrab-fallback-mock`，直接 FFmpeg `gdigrab` 也出现过 `Failed to capture image (error 5)`；因此真实视频基线应在桌面捕获恢复稳定后复测，或继续推进 WGC 采集替换。

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
