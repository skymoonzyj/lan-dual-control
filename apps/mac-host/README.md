# macOS 被控端

这是 macOS 被控端。它的目标是接收 Windows 控制端协议，采集 Mac 屏幕并执行远程输入事件。

## 当前内容

- Swift Package 项目结构。
- WebSocket 监听骨架，默认端口 `43770`。
- `/discovery` HTTP 发现接口。
- Bonjour/mDNS 自动发现广播，服务类型为 `_lan-dual-control._tcp`。
- `hello`、`auth_request`、`session_offer`、`display_settings`、`audio_settings_update`、`input_event`、`clipboard_text`、`clipboard_file_*` 和 `reverse_control_*` 消息处理。
- macOS 权限检查骨架：
  - 屏幕录制。
  - 辅助功能。
  - 输入监控状态探测。
- ScreenCaptureKit 资源预检。
- 多显示器枚举。
- 后台 JPEG `video_frame` 抓取；权限不足或采集失败时自动回退模拟 `video_frame`。
- ScreenCaptureKit + VideoToolbox H.264 流式输出入口；Windows 控制端支持 WebCodecs 解码后会优先请求 `h264`，启动失败时自动回退 JPEG。
- ScreenCaptureKit 系统声音采集第一版：优先发送真实 `pcm-f32le-base64` PCM `audio_frame`，启动失败时回退模拟音频帧。
- CGEvent 输入注入：支持鼠标移动、左/右/中键按下抬起、滚轮、常用键盘按键、小键盘、方向键、功能键和 macOS 快捷键修饰键。
- macOS 系统文本剪贴板读写：接收 Windows 文字后写入 `NSPasteboard`，并把 Mac 本机复制的新文字推送给 Windows。
- macOS 系统文件剪贴板接收：接收 Windows 文件块后保存到临时目录，并把文件 URL 写入 `NSPasteboard`。
- macOS 系统文件剪贴板推送：Mac 本机复制普通文件后，按 `clipboard_file_*` 分块发送给 Windows 控制端；当前控制端先以内存模式接收。

## 在 Mac 上运行

推荐日常联调用启动助手，默认使用安全 `log` 输入模式，不会真实移动鼠标或按键：

```bash
node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword
```

`--promptPassword` 会先播放两声提示音，并在终端/日志输出一行不含密码的“请看前台密码弹窗”提示，再优先打开 macOS 系统隐藏密码弹窗；如果系统弹窗打不开，才尝试原生 AppKit 前台高层级隐藏密码框作为备用。密码只保存在本次进程内，不会写入命令参数、日志或联络板。默认不会退回到终端隐藏输入，避免用户看不到输入位置；即使环境里已有 `LAN_DUAL_PASSWORD`，显式 `--promptPassword` 也会要求用户在前台弹窗里重新输入，避免悄悄复用旧密码。自动化测试可显式关闭弹窗来验证失败路径，人工正式联调不要关闭。

如果希望启动助手确认 `/discovery` 和 runtime/display 校验通过后退出、让 Mac host 继续在后台运行，可以显式加 `--background`：

```bash
node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --background
```

后台模式仍然默认使用 `inputMode=log`，仍会先等待 `/discovery` 并运行只读 runtime/display 校验；通过后会打印后台进程 PID 和日志路径，默认日志写到 `.dev-lab/mac-host/lan-dual-mac-host-43770.log`。如需指定日志文件，可加 `--logFile <path>`。密码不会写入日志，也不会作为子校验命令参数传递。

需要停止后台 Mac host 时，用安全停止入口：

```bash
node scripts/mac/start-mac-host.mjs --stop
```

`--stop` 只读取本机 `/discovery`，确认目标是 macOS host 且带有 `runtime.processId` 后才向该 PID 发送 `SIGTERM`，不会要求或读取密码，也不会认证 WebSocket。离线时会把结果视为“已经停止”；脚本自动化可加 `--json`。

如果只是本机开发快速试跑，可以先干跑查看即将使用的端口、build、局域网地址和输入模式：

```bash
node scripts/mac/start-mac-host.mjs --dryRun
```

如果只想确认当前默认端口有没有 Mac host 在线，不启动服务、不认证 WebSocket、不要求密码，可以用：

```bash
node scripts/mac/start-mac-host.mjs --status
```

在线时它会显示 `/discovery`、runtime build/PID、权限摘要、能力摘要和 Windows 可尝试的局域网地址；如果运行中 build 落后当前 git，还会只比较 `apps/mac-host` 运行源码并提示是否有 host 行为相关改动，避免把文档或启动脚本变化误判成必须重启。离线时会返回非 0 并打印安全启动建议。脚本或联络板自动化需要稳定字段时可加 `--json`：

```bash
node scripts/mac/start-mac-host.mjs --status --json
```

JSON 模式只输出机器可读对象，包含 `online`、`runtime`、`permissions`、`capabilities`、`lanAddresses` 和 `buildDiff`，不会混入日志行。

联调前若还想把通讯板当前呼叫一起放进状态摘要，可以用：

```bash
node scripts/mac/start-mac-host.mjs --status --checkBoard --boardSummary
```

`--checkBoard` 只读 Agent Link Board `/api/state.currentCall`；active call 会提示先协调，DONE/COMPLETED/CANCELLED/RESOLVED/CLOSED 等完成态 call 会标为 inactive。`--boardSummary` 只输出一行秘密安全摘要，不回显 call command；如果只写 `--boardSummary --checkBoard` 而忘了 `--status`，启动助手也会自动走只读 status，不会误启动 Mac host。

双端恢复开工时，如果想一次看仓库、联络板、Mac host 在线状态、权限和旧 build 是否需要重启，可以先跑轻量总览：

```bash
node scripts/mac/check-mac-resume-status.mjs --checkBoard
```

该脚本只读：不会启动服务、不会认证 WebSocket、不会要求或打印密码，也不会发送输入事件。它适合在正式密码端到端验收前先判断当前 Mac host 是否在线、工作区是否干净、运行中 build 是否只是元数据落后，或是否已经有 Mac host 运行源码变化需要先重启。脚本自动化需要稳定字段时可加 `--json`；如果希望把离线 host 或未提交改动变成失败，可加 `--requireOnline` / `--requireClean`。

需要把状态同步到 Agent Link Board 时，可用短摘要模式：

```bash
node scripts/mac/check-mac-resume-status.mjs --checkBoard --boardSummary
```

`--boardSummary` 只输出一段适合直接发送到联络板的秘密安全摘要，包含 repo 状态、Mac host 地址、权限、H.264/音频、显示器、build 差异和正式验收下一步；不会输出密码、系统账号或联络板 token。

准备正式呼叫 Windows 端做端到端验收前，可再跑正式清单：

```bash
node scripts/mac/check-mac-formal-e2e-status.mjs
```

该脚本复用恢复状态总览，但会把正式验收需要的 repo、联络板、Mac host、LAN 地址、`inputMode=log`、权限、H.264、系统音频、剪贴板、显示器和 build 差异整理成 checklist。默认会读取 Agent Link Board；如果有 blocker，就不建议发起 Windows call。需要发联络板时可用：

```bash
node scripts/mac/check-mac-formal-e2e-status.mjs --boardSummary
```

正式清单同样只读：不会启动服务、不会认证 WebSocket、不会要求或打印密码、不会发送输入事件；`inject` 会明确标为跳过，只有用户明确确认正在看屏幕后才允许另行验收。

如果正式 call Windows 前想先在 Mac 本机短验收 H.264、系统 PCM 和安全 input-log，可跑本机聚合 smoke：

```bash
node scripts/mac/check-mac-formal-local-smoke.mjs --promptPassword
```

该脚本会复用 `observe-mac-video`、`observe-mac-audio` 和 `smoke-mac-input-log`，默认要求正式密码来源为 `LAN_DUAL_PASSWORD` 或 `--promptPassword`，并拒绝空密码和 `demo-password`。`--promptPassword` 会先播放两声提示音并打印不含密码的弹窗提示，再优先打开 macOS 系统隐藏密码弹窗，系统弹窗失败时才尝试原生 AppKit 前台高层级隐藏密码框；密码只通过子进程环境变量传递，不放进命令参数；脚本不会启动 Mac host、不会切 `inject`，也不会打印密码。自动化需要机器可读结果时可加 `--json`，需要本地假服务回归时才显式加 `--allowDemoPassword`。

如果只想观察已运行 Mac host 的媒体基线，不需要 input-log 或正式 smoke，可用媒体聚合入口：

```bash
LAN_DUAL_PASSWORD=... node scripts/mac/observe-mac-media.mjs --json
node scripts/mac/observe-mac-media.mjs --videoDurationMs 30000 --audioDurationMs 30000 --maxFrameAgeMs 250 --boardSummary
node scripts/mac/observe-mac-media.mjs --resourceSample --boardSummary
```

它会顺序运行 H.264 视频观察和系统 PCM 音频观察，避免同时压两个媒体 probe；不会启动 host、不会认证之外做任何控制动作、不会发送输入事件，也不会执行 `inject`。密码只通过 `LAN_DUAL_PASSWORD` 传给子观察脚本，不放进子进程 argv；`--resourceSample` 可只读采样本机 Mac host 进程 CPU/RSS，并写入 JSON 与一行摘要，采样不可用时只标记 unavailable；`--boardSummary` 只输出一行联络板安全摘要，单路成功单路失败会标为 `Mac media baseline partial`，全部执行链路失败才保留 `failed <数量>`，`--json` 同时提供 `summary.status=ok|partial|failed` 给自动化读取；默认 `playTone=false`，需要有声电平强校验时才显式加 `--playTone --requireLevel`。

启动助手会：

- 默认绑定 `0.0.0.0:43770`，打印 Windows 端可填写的局域网地址。
- 默认设置 `LAN_DUAL_INPUT_MODE=log`，避免无人值守时真实注入输入。
- `--requirePassword` 会拒绝空密码和 `demo-password`，真机局域网联调建议始终打开。
- `--ephemeralPassword` 会为本次进程生成一次性随机 `LAN_DUAL_PASSWORD` 且不打印密码；适合先恢复 `/discovery`、runtime/build 和权限诊断通道，但不能用于另一端认证联调，因为密码不会被共享。
- `--status` 只读取 `/discovery` 并退出，不会启动 Swift host，不会读取或打印密码；运行中 build 与当前 git 不一致时，会列出旧 build 后变动过的 Mac host 运行源码文件，若没有运行源码变化则说明服务行为大概率仍是当前的，只是 build 元数据落后；加 `--json` 可让脚本稳定读取同一份状态对象。加 `--checkBoard` 会只读 Agent Link Board currentCall，`--boardSummary` 会输出一行无密摘要且不回显 call command；`--boardSummary`/`--checkBoard` 默认转入 status 路径，避免误启动服务。
- `--stop` 只停止本机 `/discovery` 对应的 macOS host 进程；它要求目标看起来是 Mac host 且提供 `runtime.processId`，不会因为端口上有 Windows host 或未知服务就误杀进程。
- 等待 `/discovery` 就绪后，默认运行 `check-mac-displays --requireRuntime --expectBuildId <build>` 做只读 runtime/display round-trip 校验；如果需要密码，会通过子进程环境变量传递，不会放进 `--password` 命令参数。
- `--background` 会在 `/discovery` 和 runtime/display 校验通过后退出启动助手，并让 Mac host 在后台继续运行；默认日志路径在 `.dev-lab/mac-host/`，该目录不会提交到仓库。
- 如需真实输入注入，必须有人在屏幕前确认安全后，再显式传 `--inputMode inject --confirmUserWatching` 或 `--injectInput --confirmUserWatching`；缺少确认标记时启动助手会拒绝切入真实注入模式。

启动助手自检：

```bash
node scripts/mac/test-mac-host-start-helper.mjs
```

该脚本会覆盖缺密码拒绝、`demo-password` 拒绝、非交互密码提示拒绝、带环境密码干跑、一次性随机密码干跑、`--status` 在线/离线检查、`--status --json` 在线/离线机器可读输出、`--status --checkBoard` active/DONE call 摘要和 `--boardSummary --checkBoard` 防误启动路径、`--stop` 离线/非本机/非 Mac 目标拒绝、临时端口真实启动后自动关闭、后台启动后仍可查询 `/discovery`、后台 host 可由 `--stop --json` 安全停止，以及 runtime/display 校验不通过 argv 传密码。

密码弹窗 helper 自检：

```bash
node scripts/mac/test-mac-password-prompt.mjs
```

该脚本使用假的 `osascript`/`swift` 验证两声提示音、不含密码的弹窗提示、默认系统隐藏密码弹窗、原生前台高层级备用弹窗、取消和失败路径，不会打开真实系统弹窗，也不会输出密码正文。

Mac host 日常一键体检：

```bash
node scripts/mac/check-mac-host-readiness.mjs
```

默认体检只做低风险检查：Node/Swift、Mac host build、直接启动输入默认值、启动助手语法和干跑、键盘映射覆盖，以及当前 `/discovery` 状态。其中直接启动默认值检查会用临时本机端口确认未设置 `LAN_DUAL_INPUT_MODE` 时是 `log`、显式 `inject` 仍可覆盖，并顺手验证启动日志和 `/discovery.permissions` 的权限诊断格式。如果当前 host 没启动，默认只给出提示，不会失败；需要强制要求端口已打开时加 `--requireOpen`。脚本会把当前 `git rev-parse --short HEAD` 和运行中 `/discovery.runtime.buildId` 对比，不一致时默认只给 warning，并在能解析旧 build commit 时列出之后变动的 Mac host runtime 源码文件；部署后需要强制确认已是最新 build 时加 `--requireCurrentBuildId`。

联调或准备正式验收前，可以把通讯板当前呼叫一起放进体检摘要：

```bash
node scripts/mac/check-mac-host-readiness.mjs --checkBoard --boardSummary
```

`--checkBoard` 只读 Agent Link Board `/api/state.currentCall`；active call 会提示先协调，DONE/COMPLETED/CANCELLED/RESOLVED/CLOSED 等完成态 call 会标为 inactive。`--boardSummary` 只输出一行秘密安全摘要，不回显 call command；需要自动化读取完整结构时用 `--json`。

查看 Mac 侧工具参数或新增脚本后，可用统一覆盖自检确认 `scripts/mac/*.mjs` 的 `--help/-h` 都只打印帮助、快速退出，不会误触发 Swift build、启动 host 或连接真实服务：

```bash
node scripts/mac/test-mac-script-help.mjs
```

恢复状态总览自测：

```bash
node scripts/mac/test-mac-resume-status.mjs
node scripts/mac/test-mac-host-readiness-board.mjs
```

部署/真机联调常用组合可以直接使用 profile，避免手写一长串参数：

```bash
node scripts/mac/check-mac-host-readiness.mjs --profile deploy
```

`deploy` 会要求 `/discovery` 可达、运行中 host 是当前 git build、屏幕录制/辅助功能/输入监控权限已开启，并串联 H.264、PCM 和安全 `log` 输入冒烟；默认还会用 `--maxVideoFrameAgeMs 250` 检查帧时间戳新鲜度。如果还要顺带覆盖启动助手临时端口实启/关闭路径和文件剪贴板接收安全回归，可用：

```bash
node scripts/mac/check-mac-host-readiness.mjs --profile deep
```

如果需要确认当前 Mac 权限足够做真实视频和真实输入注入，可加：

```bash
node scripts/mac/check-mac-host-readiness.mjs --requireControlPermissions
```

该检查会要求 `/discovery.permissions.screenRecording=true` 和 `accessibility=true`。`inputMonitoring` 由 macOS `IOHIDCheckAccess` 只读探测，不会弹权限请求；`inputMonitoring=false` 默认只作为 warning，因为当前 `log` 模式和既有探针不依赖它。需要单独强制要求输入监控权限时可加 `--requireInputMonitoring`；若想让任何 warning 都失败，可再加 `--strict`。

真机联调前可跑深度体检：

```bash
node scripts/mac/check-mac-host-readiness.mjs --profile deep
```

其中 `--probeVideo` 会做短 H.264 时间线观察，`--probeAudio` 会做短 PCM 音频观察且不播放声音，`--probeMedia` 会复用媒体聚合入口输出 H.264 + PCM 一体摘要，并在 `--boardSummary` 中显示 `media=ok|partial|failed`，`--probeInputLog` 会先确认 host 是 `log` 输入模式再发送安全冒烟事件，`--probeStartHelper` 会用临时端口启动/关闭一次启动助手自测，`--probeClipboardSecurity` 会运行本地文件剪贴板接收完整性回归。主机已重启到小数秒 timestamp build 后，可加 `--maxVideoFrameAgeMs 250` 强制要求 `video_frame.timestamp` 接收年龄足够新鲜；也可加 `--maxAudioFrameAgeMs 250` 强制要求 `audio_frame.timestamp` 新鲜且单调。两个参数会分别自动启用对应 probe。如果只想单跑文件剪贴板安全回归，可用 `node scripts/mac/check-mac-host-readiness.mjs --probeClipboardSecurity`；该路径不会启动 host、写系统剪贴板、要求密码或执行输入。如果临时需要验收旧 build，可用 `--skipCurrentBuildCheck` 暂时关闭“运行中 build 与当前 git 不一致”的 warning。需要机器可读结果时可加 `--json`。

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
export LAN_DUAL_DEVICE_NAME="macOS 被控端"
export LAN_DUAL_PASSWORD=demo-password
export LAN_DUAL_VIDEO_MODE=auto
export LAN_DUAL_INPUT_MODE=log
export LAN_DUAL_MAX_SCREEN_FPS=30
export LAN_DUAL_JPEG_QUALITY=0.58
export LAN_DUAL_BONJOUR=1
export LAN_DUAL_BUILD_ID=local-dev
swift run lan-dual-mac-host
```

`LAN_DUAL_VIDEO_MODE` 可选值：

- `auto`：默认值。有屏幕录制权限时发送真实 JPEG 帧，否则发送模拟帧。
- `screen`：强制尝试真实屏幕帧，失败时仍会临时回退模拟帧并打印日志。
- `mock`：只发送模拟帧，适合协议调试。

真实屏幕帧采用后台采集和 JPEG 编码队列，避免主线程被截图/编码卡住。截图短暂失败时会发送模拟保活帧；截图调用超时时会进入短暂冷却窗口，暂停继续排队真实截图，再自动尝试恢复。`LAN_DUAL_MAX_SCREEN_FPS` 可限制真实屏幕帧最高帧率，默认 `30`，范围 `1...60`；`session_answer`、`display_settings_ack` 和 `video_frame` 会同时返回 `requestedFps` 与实际 `fps`，便于 Windows 端诊断。`LAN_DUAL_JPEG_QUALITY` 可覆盖控制端画质预设计算出的 JPEG 质量，范围 `0.1...0.95`；不设置时会按 Windows 控制端的 `smooth`、`balanced`、`sharp`、`custom` 和码率自动选择。

当前 JPEG 链路仍是调试/兜底方案；低延迟方案见 `docs/09-streaming-video-plan.md`。H.264 流式入口已经在 Mac 真机上编译、启动，并通过本机 `--requireH264` 首帧强校验；后续继续做 Windows 控制端端到端解码、延迟和稳定性验收。

`LAN_DUAL_INPUT_MODE` 可选值：

- `log`：默认值。只打印输入事件，不真正移动鼠标或按键，适合联调协议时避免误操作。
- `inject`：收到 Windows 控制端的 `input_event` 后调用 macOS `CGEvent` 执行输入；只在有人看屏幕并确认安全后显式启用。通过 `scripts/mac/start-mac-host.mjs` 启动时必须额外加 `--confirmUserWatching`，避免无人值守误切真实输入。

验证 Mac 键盘注入映射覆盖：

```bash
node scripts/mac/check-input-keymap.mjs
```

该脚本会解析 `InputEventInjector.swift` 的 `KeyboardEvent.code` 和 `event.key` 映射表，确认常用字母、数字、符号、导航键、修饰键、F1-F20、小键盘、常见同义 code/key，以及 `eventFlags` 中 `meta/command`、`alt/option`、`ctrl/control`、`shift` 和布尔 fallback 都有覆盖。它只做源码静态检查，不会发送真实键盘事件。

验证 Mac host 直接启动时的安全输入默认值：

```bash
swift build --package-path apps/mac-host
node scripts/mac/test-mac-host-defaults.mjs
```

该脚本会用临时本机端口启动两次 Mac host 二进制，只读检查 `/discovery`：未设置 `LAN_DUAL_INPUT_MODE` 时必须是 `log`，显式设置 `LAN_DUAL_INPUT_MODE=inject` 时必须仍可覆盖为 `inject`。脚本不会发送输入事件。

验证 Mac 输入事件在安全日志模式下可被确认：

```bash
node scripts/mac/smoke-mac-input-log.mjs
```

该脚本会先读取 `/discovery`，只有 `inputMode=log` 时才会发送 `input_event`；如果发现不是日志模式会立即拒绝运行，避免无人值守时误移动鼠标或按键。当前真机基线：16 个鼠标/滚轮/键盘/快捷键事件全部收到 `input_ack`，且 `mode=log`、`injected=false`。

`LAN_DUAL_DEVICE_NAME` 会用于 `/discovery`、`hello_ack` 和 Bonjour/mDNS 服务名。`LAN_DUAL_BONJOUR` 默认开启；设为 `0`、`false` 或 `off` 可关闭 `_lan-dual-control._tcp` 广播。

`LAN_DUAL_BUILD_ID` 是可选运行时诊断标识，默认 `dev`。`/discovery` 和 `hello_ack` 会返回 `runtime.processId`、`runtime.startedAt`、`runtime.uptimeSeconds` 和 `runtime.buildId`，方便确认当前连到的是哪一个 Mac host 进程，避免旧二进制未重启时误判。Mac host 输出的 `lastSeenAt`、`runtime.startedAt`、WebSocket envelope `timestamp`、`video_frame.timestamp` 和回退诊断时间均使用带小数秒的 ISO-8601 UTC 时间戳，便于脚本计算接收年龄和低延迟诊断。

部署或重启后可以让显示器自检同时强制检查运行时诊断：

```bash
node scripts/mac/check-mac-displays.mjs --requireRuntime --expectBuildId "$(git rev-parse --short HEAD)"
```

如果需要确认刚刚重启的是新进程，可再加 `--maxRuntimeUptimeSeconds 120`，要求 `/discovery` 和 `hello_ack` 返回同一个 `processId` / `buildId`，且运行时间不超过指定秒数。

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
node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword
```

或手动启动：

```bash
LAN_DUAL_INPUT_MODE=log swift run lan-dual-mac-host
```

```powershell
scripts\windows\test-mac-host.ps1 -HostName 192.168.1.x -RequireRealVideo -ExpectInputMode log
```

验证 H.264 流式视频链路：

```powershell
scripts\windows\test-mac-host.ps1 -HostName 192.168.1.x -RequireH264 -ExpectInputMode log
```

`-RequireH264` 会检查 `codec=h264`、`encoding=annexb-base64`、`capturePipeline=screencapturekit-h264`，并解析首帧 Annex B NAL 单元确认关键帧带 SPS、PPS 和 IDR。

在 Mac 本机持续观察视频帧稳定性：

```bash
node scripts/mac/observe-mac-video.mjs --durationMs 10000 --requireH264 --minFrames 100 --minFps 20 --maxGapMs 1000 --expectActiveDisplayId main --requireMonotonicTimestampUs
```

该脚本会只读统计 `video_frame` 帧数、接收 FPS、最大帧间隔、payload 大小、codec、encoding、`capturePipeline`、source、`activeDisplayId`、`displayName`、帧 `timestamp` 接收年龄，以及 H.264 `timestampUs` / `durationUs` 媒体时间线，用于排查 H.264/JPEG 帧率不稳、回退到 mock、采集管线漂移、显示器来源漂移或编码时间线跳变。需要长时间强校验显示器来源时可加 `--requireFrameDisplayDiagnostic` 或 `--expectActiveDisplayId main`；需要校验 H.264 时间线时可加 `--requireTimestampUs --requireMonotonicTimestampUs --maxTimestampGapUs <us>`；JPEG 兜底链路可用 `--preferredVideoCodec mjpeg --requireRealVideo --expectActiveDisplayId main --requireFrameTimestamp` 观察。重启到带小数秒 timestamp 的 Mac host 后，可用 `--maxFrameAgeMs 250` 级别检查本机接收年龄；如果仍在调试旧 host，建议临时放宽到 `1500` 以上，避免把旧秒级时间戳取整误判为旧帧。

当前真机基线：H.264 30 秒观察 877 帧、约 29.2fps、最大间隔 45ms，全部为 `h264` / `annexb-base64` / `screencapturekit-h264`；时间线增强后短测 H.264 3 秒 89 帧、约 29.2fps、最大接收间隔 39ms，`timestampUs` 单调，媒体间隔平均/最大 `34281/41668us`，`durationUs=33333`；主 `43770` 旧进程上 JPEG 2 秒 31 帧、约 15.4fps、最大接收间隔 74ms，帧 `timestamp` 均可解析。小数秒 timestamp 临时 `43771` build 已验证：`/discovery.lastSeenAt` 和 `runtime.startedAt` 为 `2026-06-12T10:05:33.915Z` 这类毫秒格式，mock 视频帧 `frameAge max=0ms`；临时第二 host 的真实采集可能因资源竞争回退 mock，主 43770 不受影响。空闲/低变化桌面下，H.264 5 分钟观察收到 3168 帧、约 10.6fps，60 秒低门槛复测收到 654 帧、约 10.9fps、最大间隔 883ms；JPEG 60 秒对照收到 983 帧、约 16.4fps。后续做长时间视频强校验时，需要区分静态桌面和动态画面，静态桌面不要直接把 `--minFps 25` 当硬门槛。

H.264 流式启动有 5 秒 watchdog：如果 ScreenCaptureKit/VideoToolbox 启动阶段迟迟没有建立 `videoStream`，Mac host 会发送带 `streamFallbackReason` 的 `display_settings_ack` 并回退 `background-jpeg`，避免控制端长时间等待黑屏；迟到启动成功的旧 H.264 流会被 generation token 停止，不会覆盖新会话。

验证显示器枚举和 `displayId` 切换回执：

```bash
node scripts/mac/check-mac-displays.mjs
```

该脚本会只读检查 `/discovery`、`session_answer.displays`、`session_answer.activeDisplayId`、`display_settings_ack.activeDisplayId`，并等待切换后的 `video_frame`。默认请求 MJPEG/JPEG 路径，适合快速确认多显示器选择不被 H.264 首帧节奏影响；需要专门检查 H.264 路径时可加 `--preferredVideoCodec h264`。脚本默认要求 `video_frame.activeDisplayId` 存在且匹配，用来发现主机还没重启到最新二进制的情况；如果只是调试旧 host，可显式加 `--allowMissingFrameDisplayDiagnostic` 放宽。当前真机单屏基线：`127.0.0.1:43770` 最新 host 通过 `main` 单屏 round-trip，首帧和切换后帧均带回 `activeDisplayId=main` / `displayName=主显示器`；显式 H.264 版本也通过；真实外接双屏切换仍需接显示器后再验收。

部署校验时可加 `--requireRuntime` 要求 `/discovery` 和 `hello_ack` 都返回完整 runtime；`--expectBuildId <id>` 会要求 `runtime.buildId` 匹配并自动启用 runtime 强校验；`--maxRuntimeUptimeSeconds <sec>` 可用于确认刚刚重启的是新进程。

验证真实系统声音采集和控制端播放：

```powershell
scripts\windows\test-mac-host.ps1 -HostName 192.168.1.x -RequireH264 -RequireAudio -ExpectInputMode log
```

`-RequireAudio` 会检查首个真实音频帧：`codec=pcm-f32le`、`encoding=pcm-f32le-base64`、`audioMode=system-pcm`、`sampleRate=48000`、`channels=2`、`frames=960` 和有效 PCM payload。Windows 控制端已可播放该 PCM 帧；页面级自检可加 `--injectPcmAudio` 验证播放入口。

在 Mac 本机持续观察系统声音帧稳定性：

```bash
node scripts/mac/observe-mac-audio.mjs --durationMs 10000 --minFrames 80 --maxGapMs 1000
```

该脚本会只读统计 `audio_frame` 帧数、接收间隔、payload 大小、电平范围和 `timestamp` 接收年龄，用于排查无声、间断、格式漂移或旧音频帧；默认不会播放声音、修改系统音量、输入或剪贴板。需要把音频帧新鲜度变成强校验时，可加 `--maxFrameAgeMs 250 --requireMonotonicTimestamp`。需要确认非静音系统声音时，可以在有人确认不打扰的场景下显式播放短测试音并要求电平：

```bash
node scripts/mac/observe-mac-audio.mjs --durationMs 4500 --minFrames 160 --maxGapMs 1000 --playTone --requireLevel --minLevel 0.01
```

当前真机基线：系统声音 30 秒观察 1501 帧、约 50fps、最大间隔 24ms，payload 恒定 7680 bytes；5 分钟长稳观察 15001 帧、50.0fps、最大间隔 31ms，payload 仍恒定 7680 bytes；本次无人值守测试窗口电平为 0，并已用 `--playTone --toneVolume 0 --requireLevel --minLevel 0` 覆盖静音测试音流程。真实听感、音量变化和有声电平仍需在有人确认可发声时继续验收。

在 Mac 本机做 H.264 和 PCM 音频连续重连稳定性检查：

```bash
node scripts/mac/stress-mac-host.mjs --iterations 20 --expectInputMode log
```

该脚本会复用 `scripts/windows/probe-mac-host.mjs`，默认每次都要求 H.264 首帧和真实 `pcm-f32le` 音频帧通过，并在 macOS 上采样监听进程的 RSS/FD 变化，便于排查连续建连后的资源释放问题。

需要把连续建连体验变成强校验时，可加耗时阈值：

```bash
node scripts/mac/stress-mac-host.mjs --iterations 3 --maxProbeMs 8000 --maxFirstFrameMs 3000 --maxH264ConfirmMs 3000 --maxAudioFrameMs 3000 --expectInputMode log
```

脚本会按每轮 stdout 到达时间统计完整 probe、首帧、H.264 确认和首个音频帧的 min/avg/max；阈值默认关闭，只在显式传入时失败。当前真机基线：50 次连续连接全部通过，监听进程 RSS `79376->80656 KB`，FD `30->30`；3 次轻量体验阈值回归通过，完整 probe `243/249/255ms`、首帧 `157/162/169ms`、H.264 确认 `158/163/170ms`、音频 `237/244/250ms`。

在 Mac 本机验证文本剪贴板双向同步：

```bash
node scripts/windows/probe-mac-host.mjs --host 127.0.0.1 --port 43770 --clipboardRoundTrip
```

在 Mac 本机验证文件剪贴板从 Mac 推送到控制端：

```bash
node scripts/windows/probe-mac-host.mjs --host 127.0.0.1 --port 43770 --clipboardFileHostToClient
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
8. Mac 复制普通文件后，Windows 控制端能接收并重组完整文件。
