# 下一步行动

最后更新：2026-06-12

用途：让两台机器上的 Codex 都知道现在最值得做什么。只放短期任务，长期计划继续放在 `docs/04-task-board.md`。

## 最高优先级

1. Mac 端继续验证真实被控服务。
   - 默认使用 `LAN_DUAL_INPUT_MODE=log` 做安全联调。
   - 在 Windows 端运行 `scripts/windows/test-mac-host.ps1 -HostName 192.168.1.x -RequireRealVideo -ExpectInputMode log -InputEvents`。
   - 验证通过后，再切到 `LAN_DUAL_INPUT_MODE=inject` 做真实输入注入。

2. Windows 端继续完善控制体验。
   - 保持诊断状态条准确显示真实视频、模拟回退、Mac host runtime、权限、输入注入和剪贴板状态。
   - 继续验证 Mac 真实 `pcm-f32le-base64` 音频帧播放稳定性，重点看静音、音量变化、长时间运行和延迟。
   - 黑边输入防护已固化到 Windows 控制端页面级自检；后续改缩放、画布或输入层时保持该回归。
   - 处理真实 Mac 连接中的中文错误提示和重连体验。

3. 继续 H.264 流式视频链路验收。
   - Mac 真机已通过 `--requireH264` 首帧强校验，Windows 控制端页面级 `--requireH264` 也已验证真实 WebCodecs 解码；下一步继续观察延迟、长时间稳定性和 JPEG 回退体验。
   - Mac host 已增加 H.264 启动 5 秒 watchdog；若启动阶段卡住会回退 `background-jpeg` 并带 `streamFallbackReason`，Windows 控制端诊断条已能显示该原因；后续需要在主 43770 单 host、动态画面和 Windows 控制端真实连接下继续确认正常 H.264 不被误回退。
   - JPEG 链路继续保留为兜底和权限调试。
   - Windows 控制端继续显示实收 FPS、协商帧率和请求帧率。

4. 共享协议只做必要变更。
   - 任何协议字段变更都必须同步 Swift、Windows 控制端、Windows 被控端、假 Mac 服务和探针脚本。
   - 协议兼容性不确定时，优先新增字段，不直接删除旧字段。

## Mac Codex 可接任务

- 日常启动真实 Mac host 优先用 `node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword`；该入口默认 `inputMode=log`、打印 Windows 可连接的局域网地址、等待 `/discovery`，并跑只读 runtime/display 校验。需要真实注入时，必须有人在屏幕前确认安全后再显式加 `--inputMode inject` 或 `--injectInput`。
- Mac host 改动、重启或联调前优先跑 `node scripts/mac/check-mac-host-readiness.mjs` 做低风险体检；需要确认真机权限足够真实视频和真实输入时加 `--requireControlPermissions`，需要深度验收当前真实 host 时加 `--expectBuildId <build-id> --probeVideo --probeAudio --probeInputLog`，需要确认 fractional timestamp 和低延迟接收年龄时再加 `--maxVideoFrameAgeMs 250`，需要顺带验证启动助手临时端口路径时再加 `--probeStartHelper`。
- 继续验证真实 macOS 系统声音采集，5 分钟只读观察已稳定到 15001 帧/50.0fps/最大间隔 31ms；下一步重点看非静音系统声音、音量变化、Windows 控制端真实听感和延迟。有人确认可发声时，可运行 `node scripts/mac/observe-mac-audio.mjs --durationMs 4500 --minFrames 160 --maxGapMs 1000 --playTone --requireLevel --minLevel 0.01` 做 Mac 本机有声电平强校验。
- 继续压测 ScreenCaptureKit + VideoToolbox H.264：30 秒动态/活跃窗口曾稳定到 877 帧/约 29.2fps/最大间隔 45ms，空闲桌面 5 分钟实收约 10.6fps、60 秒复测约 10.9fps；下一步重点用动态画面、CPU 占用、端到端延迟和 Windows 控制端同时连接体验来判断真实观感，不要把静态桌面 `--minFps 25` 当硬门槛。做长观察时可给 `scripts/mac/observe-mac-video.mjs` 加 `--expectActiveDisplayId main --requireMonotonicTimestampUs` 或外接屏对应 display id，同时确认帧率、显示器来源和 H.264 媒体时间线；重启到小数秒 timestamp build 后可用 `--maxFrameAgeMs 250` 级别检查本机接收年龄，旧 host 仍需临时放宽到 `1500` 以上。
- 真实输入注入前先跑 `node scripts/mac/smoke-mac-input-log.mjs`，确认当前 host 仍是 `inputMode=log` 且鼠标/滚轮/键盘/快捷键事件都会返回 `input_ack`；切 `inject` 前需要人工在屏幕前确认安全环境。
- 扩展 CGEvent 键盘映射，重点验证中文输入法、Command 组合键和功能键；改映射前后先跑 `node scripts/mac/check-input-keymap.mjs`，它会覆盖常见 code/key、同义项和修饰键 flag fallback。
- Mac host 已有真实显示器枚举、`displayId` 回执和单屏 round-trip 自检；`check-mac-displays` 默认会要求帧级 `activeDisplayId` 诊断，若主机没重启到最新二进制会失败。下一步接外接显示器后跑 `node scripts/mac/check-mac-displays.mjs --switchDisplayId <display-id>`，再让 Windows 控制端用显示器下拉做真实双屏切换验收。
- Mac host 重启或部署后，先看 `/discovery.runtime`、Windows 控制端诊断条，或运行 `node scripts/mac/check-mac-displays.mjs --requireRuntime --expectBuildId <build-id>`，确认 `processId`、`startedAt`、`uptimeSeconds` 和 `buildId` 符合预期；刚重启时可加 `--maxRuntimeUptimeSeconds 120`，避免连到旧进程。新 build 还应确认 `/discovery.lastSeenAt`、`runtime.startedAt` 和 `video_frame.timestamp` 带小数秒，再用 `observe-mac-video --maxFrameAgeMs 250` 做低延迟接收年龄观察。Windows 侧可用 `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --host <Mac IP> --port 43770 --expectDiscoveryRuntimeBuildId <build-id>` 做无密码 UI 验收。
- 继续完善 `apps/mac-client` Mac 控制 Windows 原型：用 `test-mac-client-browser.mjs --useExistingHost --enableAudio --expectAudioPayload --expectAudioPlayback` 接真实 Windows WASAPI host 验收 PCM 播放；Windows 本机临时启动 host 验收可直接加 `--requireAudio`；视频参数控件已可请求 1080P/2K/4K、30-240 Hz 和 5-50 Mbps，Windows host 已按码率回传并应用 `jpegQuality`，后续重点看真机 Mac 控制 Windows 的 60 Hz 观感、延迟、画质和键盘映射边界。

## Windows Codex 可接任务

- 优化 Windows 控制端远端文件托盘，后续把桌面版文件剪贴板写入升级为原生分块，支持更大的文件。
- Windows 被控端 FFmpeg gdigrab 过渡层普通启动已可协商 60Hz，本机 720p/60Hz 观察约 56.9 FPS；下一步把该采集层升级为 Windows Graphics Capture 和正式编码管线，进一步提升帧率、延迟、带宽和资源占用表现。
- Mac 控制 Windows 真机联调前，优先在 Windows 桌面版左侧“本机被控”面板运行体检、预览防火墙命令，并用隐藏密码启动 Windows host；面板默认输入模式是“安全日志”，需要真实反控时再手动切到“真实控制”。命令行备用流程仍是先运行 `node scripts/windows/check-windows-host-readiness.mjs` 做一键体检；需要短时验证真实视频/系统声音时加 `--probeVideo --probeAudio`。正式让 Mac 连入时也可用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-windows-host.ps1 -PromptPassword -RequirePassword` 启动 Windows host，它会列出 Mac 端可填的局域网地址并自动做只读防火墙/端口检查；需要系统声音时再加 `-Wasapi`。脚本默认只读，不会自动改系统防火墙；需要预览放行命令时加 `-DryRunFirewallRule`，确认可信局域网且以管理员 PowerShell 运行时才加 `-AddFirewallRule`。
- Windows 被控端输入注入已升级为常驻 C# SendInput helper；可用 `node scripts/windows/measure-windows-input-helper.mjs` 安全干跑量化 cold/warm/p95 延迟；后续真实 `system` 模式仍需有人看屏幕时用 `test-windows-host.ps1 -InputEvents -InputMode system` 验收手感和安全边界。
- 继续验证 Windows 被控端 WASAPI loopback：30 秒本机长稳已通过，短测试音电平强校验已通过；下一步重点看系统音量变化、60 秒以上长时间运行、Mac client 播放体验和无系统声音时的提示。可用 `node scripts/windows/observe-windows-host-audio.mjs --durationMs 30000 --minFrames 1200 --minFps 40 --maxGapMs 1000` 做持续帧观察；需要确认有声电平时加 `--playTone --requireLevel --minLevel 0.02`。
- 优化 Windows 控制端文件托盘和错误提示。
- Windows host 或假 Mac 认证相关改动后运行 `node scripts/windows/test-auth-retry-policy.mjs`，确认错误密码剩余次数、第三次断开和新连接正确认证未退化。
- Windows 控制端视频、缩放或输入相关改动后，用真实 Mac host 运行 `node scripts/windows/test-windows-client-browser.mjs --host <Mac IP> --port 43770 --password <密码> --requireH264`，确认 H.264/WebCodecs 画布解码未退回 JPEG、`H264Errors=0`，并确认黑边输入防护回归通过。
- Windows host 相关改动后运行 `scripts/windows/test-windows-host.ps1`，确认真实视频首帧、文本剪贴板和文件剪贴板接收未退化；涉及音频时可加 `-AudioMode wasapi -RequireAudio`；涉及 Mac 反控链路时再运行 `node scripts/windows/test-mac-client-browser.mjs`，确认 Mac client 页面可显示 Windows 画面、收到 `input_ack`，并完成 `Command+C` 到 `Ctrl+C` 映射、最近连接保存/回填/清空、文本/本机剪贴板监听/文件剪贴板发送；需要验收真实 PCM 播放时，本机临时 host 可加 `--requireAudio`，已运行 host 可加 `--useExistingHost --enableAudio --expectAudioPayload --expectAudioPlayback`；认证相关改动可加跑 `node scripts/windows/test-mac-client-browser.mjs --expectAuthFailure --expectedAttemptsRemaining 2 --expectedMaxAttempts 3`。
- Windows host 或 Mac client 视频参数相关改动后运行 `node scripts/windows/observe-windows-host-video.mjs --fps 60 --useDefaultMaxScreenFps --expectSessionFps 60 --durationMs 4000 --minFrames 140 --minFps 35`，确认普通启动下 60 Hz 请求、实际 FPS、最大帧间隔、采集管线、请求码率和 `jpegQuality` 符合预期；可再用 `--bandwidthKbps 5000 --qualityPreset smooth --json` 与 `--bandwidthKbps 40000 --qualityPreset sharp --json` 对照低/高码率；最后运行 `node scripts/windows/test-mac-client-browser.mjs` 确认 Mac client 默认 1080P/60Hz/20Mbps 和 2K/60Hz/40Mbps 更新路径未退化。
- 继续维护本机假 Mac 服务，用于快速回归和失败场景模拟。

## 暂不优先

- 安装包。
- 公网账号系统。
- 大文件断点续传。
- H.264 硬件编码深度优化。
- UDP/mDNS 自动发现完整实现。
