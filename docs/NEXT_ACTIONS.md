# 下一步行动

最后更新：2026-06-14

用途：让两台机器上的 Codex 都知道现在最值得做什么。只放短期任务，长期计划继续放在 `docs/04-task-board.md`。

## 最高优先级

1. Mac 端继续验证真实被控服务。
   - 默认使用 `LAN_DUAL_INPUT_MODE=log` 做安全联调。
   - 在 Windows 端运行 `scripts/windows/test-mac-host.ps1 -HostName 192.168.1.x -RequireRealVideo -ExpectInputMode log -InputEvents`。
   - 验证通过后，再切到 `LAN_DUAL_INPUT_MODE=inject` 做真实输入注入。

2. Windows 端继续完善控制体验。
   - 真机联调前优先用 Windows 桌面版“刷新设备”自动扫描同网段 `/discovery`；命令行可用 `node scripts/windows/discover-lan-hosts.mjs --requireFound` 快速确认当前 Mac IP。Windows 控制端刷新后会自动选中真实在线 WebSocket 设备并显示 runtime；本轮 diagnosticsOnly 发现并自动选中 `192.168.31.122:43770`，build `edcde5e`。
   - 保持诊断状态条准确显示真实视频、模拟回退、Mac host runtime、权限、输入注入和剪贴板状态。
   - 真实连接时同时观察“实收 FPS”和“帧延迟”：帧延迟来自 `video_frame.timestamp` 接收年龄，可帮助区分采集/编码/网络/解码卡顿；若显示“时钟偏差”，先校准两端系统时间再判断延迟。
   - 继续验证 Mac 真实 `pcm-f32le-base64` 音频帧播放稳定性，重点看静音、音量变化、长时间运行和延迟。
   - 黑边输入防护已固化到 Windows 控制端页面级自检；后续改缩放、画布或输入层时保持该回归。
   - 处理真实 Mac 连接中的中文错误提示和重连体验。

3. 继续 H.264 流式视频链路验收。
   - Mac 真机已通过 `--requireH264` 首帧强校验，Windows 控制端页面级 `--requireH264` 也已验证真实 WebCodecs 解码；下一步继续观察延迟、长时间稳定性和 JPEG 回退体验。
   - Mac host 已增加 H.264 启动 5 秒 watchdog；若启动阶段卡住会回退 `background-jpeg` 并带 `streamFallbackReason`，Windows 控制端诊断条已能显示该原因；后续需要在主 43770 单 host、动态画面和 Windows 控制端真实连接下继续确认正常 H.264 不被误回退。
   - JPEG 链路继续保留为兜底和权限调试。
   - Windows 控制端继续显示实收 FPS、协商帧率、请求帧率和帧延迟。

4. 共享协议只做必要变更。
   - 任何协议字段变更都必须同步 Swift、Windows 控制端、Windows 被控端、假 Mac 服务和探针脚本。
   - 协议兼容性不确定时，优先新增字段，不直接删除旧字段。

## Mac Codex 可接任务

- 日常启动真实 Mac host 前可先用 `node scripts/mac/start-mac-host.mjs --status` 只读查看当前 `/discovery`、runtime、权限、能力和 Windows 可连地址；它不会启动服务，也不会要求或打印密码。若运行中 build 落后当前 git，`--status` 会只比较 `apps/mac-host` 运行源码并提示旧 build 后是否有 host 行为相关改动，帮助判断是必须重启，还是只是 build 元数据落后；脚本或联络板自动化需要稳定字段时可加 `--json`，读取 `online`、`runtime`、`permissions`、`capabilities`、`lanAddresses` 和 `buildDiff`。需要启动时优先用 `node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword`；该入口默认 `inputMode=log`、打印 Windows 可连接的局域网地址、等待 `/discovery`，并跑只读 runtime/display 校验。需要先恢复 `/discovery`、runtime/build 和权限诊断但暂时不能共享正式密码时，可用 `--ephemeralPassword --requirePassword` 生成一次性随机密码且不打印；这只适合无密码 discovery/runtime 检查，认证联调仍需用户输入正式密码或重启到约定密码。直接 `swift run lan-dual-mac-host` 时源码默认也应保持 `log`，`check-mac-host-readiness` 默认会回归该安全默认值；需要真实注入时，必须有人在屏幕前确认安全后再显式加 `--inputMode inject`、`--injectInput` 或 `LAN_DUAL_INPUT_MODE=inject`。
- Mac host 改动、重启或联调前优先跑 `node scripts/mac/check-mac-host-readiness.mjs` 做低风险体检；默认会提示运行中 `/discovery.runtime.buildId` 是否落后当前 git short hash，但不因此失败，并会列出旧 build 后变动的 Mac host runtime 源码文件，方便判断重启必要性。部署验收可直接用 `--profile deploy`，它会要求 `/discovery` 可达、运行中 host 是当前源码 build、屏幕录制/辅助功能/输入监控权限开启，并串联 H.264、PCM、`log` 输入冒烟和 `--maxVideoFrameAgeMs 250`；更深的本机部署自测可用 `--profile deep` 额外跑启动助手临时端口路径。需要临时验收旧 build 时加 `--skipCurrentBuildCheck`，或按需单独组合 `--requireControlPermissions`、`--requireInputMonitoring`、`--requireCurrentBuildId`、`--probeVideo`、`--probeAudio`、`--probeInputLog`、`--probeStartHelper`。Mac host 最新源码会只读探测真实 Input Monitoring 状态；如果运行中的主机仍显示旧的 `inputMonitoring=off`，先确认它是否已重启到包含该修正的新 build。
- 继续验证真实 macOS 系统声音采集，5 分钟只读观察已稳定到 15001 帧/50.0fps/最大间隔 31ms；下一步重点看非静音系统声音、音量变化、Windows 控制端真实听感和延迟。有人确认可发声时，可运行 `node scripts/mac/observe-mac-audio.mjs --durationMs 4500 --minFrames 160 --maxGapMs 1000 --playTone --requireLevel --minLevel 0.01` 做 Mac 本机有声电平强校验。
- 继续压测 ScreenCaptureKit + VideoToolbox H.264：30 秒动态/活跃窗口曾稳定到 877 帧/约 29.2fps/最大间隔 45ms，空闲桌面 5 分钟实收约 10.6fps、60 秒复测约 10.9fps；下一步重点用动态画面、CPU 占用、端到端延迟和 Windows 控制端同时连接体验来判断真实观感，不要把静态桌面 `--minFps 25` 当硬门槛。做长观察时可给 `scripts/mac/observe-mac-video.mjs` 加 `--expectActiveDisplayId main --requireMonotonicTimestampUs` 或外接屏对应 display id，同时确认帧率、显示器来源和 H.264 媒体时间线；重启到小数秒 timestamp build 后可用 `--maxFrameAgeMs 250` 级别检查本机接收年龄，旧 host 仍需临时放宽到 `1500` 以上。
- 做连续建连体验回归时可运行 `node scripts/mac/stress-mac-host.mjs --iterations 20 --maxProbeMs 8000 --maxFirstFrameMs 3000 --maxH264ConfirmMs 3000 --maxAudioFrameMs 3000 --expectInputMode log`，同时观察首帧、H.264 确认、首个音频帧耗时和 RSS/FD 是否漂移。
- 真实输入注入前先跑 `node scripts/mac/smoke-mac-input-log.mjs`，确认当前 host 仍是 `inputMode=log` 且鼠标/滚轮/键盘/快捷键事件都会返回 `input_ack`；切 `inject` 前需要人工在屏幕前确认安全环境。
- 扩展 CGEvent 键盘映射，重点验证中文输入法、Command 组合键和功能键；改映射前后先跑 `node scripts/mac/check-input-keymap.mjs`，它会覆盖常见 code/key、同义项和修饰键 flag fallback。
- Mac host 已有真实显示器枚举、`displayId` 回执和单屏 round-trip 自检；`check-mac-displays` 默认会要求帧级 `activeDisplayId` 诊断，若主机没重启到最新二进制会失败。下一步接外接显示器后跑 `node scripts/mac/check-mac-displays.mjs --switchDisplayId <display-id>`，再让 Windows 控制端用显示器下拉做真实双屏切换验收。
- Mac host 重启或部署后，先看 `/discovery.runtime`、Windows 控制端诊断条，或运行 `node scripts/mac/check-mac-displays.mjs --requireRuntime --expectBuildId <build-id>`，确认 `processId`、`startedAt`、`uptimeSeconds` 和 `buildId` 符合预期；刚重启时可加 `--maxRuntimeUptimeSeconds 120`，避免连到旧进程。新 build 还应确认 `/discovery.lastSeenAt`、`runtime.startedAt` 和 `video_frame.timestamp` 带小数秒，再用 `observe-mac-video --maxFrameAgeMs 250` 做低延迟接收年龄观察。Windows 侧可用 `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --host <Mac IP> --port 43770 --expectDiscoveryRuntimeBuildId <build-id>` 做无密码 UI 验收。
- 继续完善 `apps/mac-client` Mac 控制 Windows 原型：用 `test-mac-client-browser.mjs --useExistingHost --enableAudio --expectAudioPayload --expectAudioPlayback` 接真实 Windows WASAPI host 验收 PCM 播放；Windows 本机临时启动 host 验收可直接加 `--requireAudio`，需要覆盖意外断线恢复时可加 `--expectReconnect`；Mac client 现已显示 Windows host runtime/build，真实 Windows host 从启动助手或桌面壳启动后可直接观察“远端运行”是否为当前 git build；Mac client 已具备 H.264/WebCodecs canvas 接收准备，会优先请求 `h264/annexb`，不支持或解码失败时请求 MJPEG/JPEG 兜底，Windows 端 ffmpeg-h264 推出后应优先用真实 host 验收 canvas 解码、延迟和回退；视频状态和会话诊断会在对端提供 `video_frame.timestamp` 时显示帧到达年龄或时钟偏差，真实视频验收时应同时看首帧耗时、实收 FPS 和 video frame age；音频状态和会话诊断会在对端提供 `audio_frame.timestamp` 时显示帧到达年龄或时钟偏差，真实音频验收时应同时看首帧耗时、播放计数和 audio frame age；体验验收可加 `--maxInitialVideoMs <毫秒>` 建立首帧阈值，搭配 `--expectReconnect` 时可加 `--maxReconnectRestoreMs <毫秒>` 建立断线恢复阈值；视频持续体验可加 `--observeVideoMs <毫秒> --minObservedVideoFrames <帧数> --minObservedVideoFps <FPS>` 建立持续来帧阈值；音频体验可加 `--maxAudioFrameMs <毫秒>` 建立音频首帧阈值，真实 PCM 播放路径可再加 `--maxAudioPlaybackMs <毫秒>` 建立播放计数阈值；视频参数控件已可请求 1080P/2K/4K、30-240 Hz 和 5-50 Mbps，Windows host 已按码率回传并应用 `jpegQuality`，后续重点看真机 Mac 控制 Windows 的 60 Hz 观感、延迟、画质、音画体验和键盘映射边界。

## Windows Codex 可接任务

- 优化 Windows 控制端远端文件托盘：桌面版文件剪贴板写入已升级为 1MB 原生分块并支持到 512MB，原生层已补总量保护、7 天旧临时目录清理、临时目录白名单和分块边界单测；系统剪贴板写入失败但文件已落盘时，本地日志和托盘状态会显示临时目录，桌面版可一键打开并可重试写入；清空托盘会清掉内存暂存和提示，但不会删除系统剪贴板仍可能需要的临时目录；后续重点是真实大文件/压缩包复制体验。
- Windows 被控端 FFmpeg gdigrab 过渡层普通启动已可协商 60Hz，当前本机 720p/60Hz 基线为 4 秒 230 帧、57.1 FPS、最大间隔 41 ms、帧年龄最大 1 ms；观察脚本现在也能采样本机 Windows host 资源，`--resourceSampleTree true` 下的 60Hz 对照为 4 秒 198 帧、49.49 FPS、最大间隔 43 ms、帧年龄最大 1 ms、进程树 CPU 平均/峰值 4.5/5.4%、工作集峰值约 309.3 MiB。Windows Graphics Capture 支持预检已通过，且 `LAN_DUAL_WINDOWS_SCREEN_MODE=wgc` 显式入口会输出 `screen.wgc` 与 `wgcFallbackReason`，但真实 WGC backend 尚未替换采集管线。下一步优先实现真正 WGC capture backend，并把 `screen.wgc.backendImplemented/active` 切为 true；完成后至少要用同一脚本对照帧率、延迟、带宽和资源占用。短期继续用 `node scripts/windows/observe-windows-host-media.mjs --resourceSampleTree true --json` 顺序跑视频+音频统一报告，避免并发临时 host 干扰采集。本轮 `2026-06-13 13:00` 当前桌面会话里 FFmpeg `gdigrab` 曾出现 `Failed to capture image (error 5)` 并导致视频观察回退 mock，真实视频基线需在桌面捕获稳定后复测或由 WGC 替换。
- Windows 被控端已有可选 `ffmpeg-h264` 流式模式：`LAN_DUAL_WINDOWS_SCREEN_MODE=ffmpeg-h264` 或 `observe-windows-host-video --screenMode ffmpeg-h264 --preferredVideoCodec h264` 会输出 H.264 Annex B base64 帧，并在 `session_answer`、`display_settings_ack` 和 `video_frame` 带 `codecString`。当前真实桌面权限下 720p/30Hz 短基线为 2.5 秒 73 帧、约 28.83 FPS、最大间隔 53ms；普通沙盒上下文可能因 FFmpeg `gdigrab error 5` 回退 mock。它是 Mac client H.264 接收准备的对接入口，不是 WGC 真采集替代品；Mac 端 H.264 接收落库后，Windows 端优先启动 `ffmpeg-h264` host，让 Mac client 验证 WebCodecs 解码、JPEG 回退和错误提示。可先在真实桌面权限下跑 `node scripts/windows/test-windows-h264-mode.mjs` 确认本机输出健康。
- Mac 控制 Windows 真机联调前，优先在 Windows 桌面版左侧“本机被控”面板选择低风险/部署/深度体检、预览防火墙命令，并用隐藏密码启动 Windows host；面板默认输入模式是“安全日志”，需要真实反控时再手动切到“真实控制”。命令行备用流程仍是先运行 `node scripts/windows/check-windows-host-readiness.mjs` 做低风险一键体检；它默认会做 WGC 支持预检但不强制失败，真正实装 WGC 采集后可加 `--requireWgc` 变成强校验。若不确定 Windows host 当前是否已启动，先用 `node scripts/windows/start-windows-host.mjs --status` 或 PowerShell `-Status` 只读查看 `/discovery`、runtime/build、视频/音频/输入/剪贴板能力和旧 build 源码差异；该入口离线时只给安全启动建议，不会启动、不认证、不要求密码；需要脚本消费时用 `node scripts/windows/start-windows-host.mjs --status --json` 或 PowerShell `-Status -Json` 输出纯 JSON。Windows host 启动后可用 `--profile deploy` 要求端口可达、运行中 host build 与当前 git 一致，并跑带 1000ms 帧新鲜度和 timestamp 单调性强校验的视频/音频短验收，深度本机部署验收可用 `--profile deep` 额外串联 `test-windows-host.ps1`。正式让 Mac 连入时也可用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-windows-host.ps1 -PromptPassword -RequirePassword` 启动 Windows host，它会列出 Mac 端可填的局域网地址、自动做只读防火墙/端口检查，并通过 `LAN_DUAL_BUILD_ID` 暴露 `/discovery.runtime.buildId`；需要系统声音时再加 `-Wasapi`。脚本默认只读，不会自动改系统防火墙；需要预览放行命令时加 `-DryRunFirewallRule`，确认可信局域网且以管理员 PowerShell 运行时才加 `-AddFirewallRule`。如果 readiness 发现旧 build，会尽量列出旧 build 后变动过的 Windows host 运行源码文件；需要临时验收旧进程时可加 `--skipCurrentBuildCheck` 放宽 warning，正式部署验收不要放宽。
- Windows 被控端输入注入已升级为常驻 C# SendInput helper；可用 `node scripts/windows/measure-windows-input-helper.mjs` 安全干跑量化 cold/warm/p95 延迟；后续真实 `system` 模式仍需有人看屏幕时用 `test-windows-host.ps1 -InputEvents -InputMode system` 验收手感和安全边界。
- 继续验证 Windows 被控端 WASAPI loopback：当前 30 秒本机基线为 1482 帧、49.98 FPS、最大间隔 33 ms、首帧约 395 ms、帧年龄最大 1 ms；短测试音电平强校验旧基线也已通过。观察脚本现在会在本机 host 上输出资源摘要，3.5 秒 WASAPI 短对照为 135 帧、稳态 49.72 FPS、最大间隔 32 ms、主进程工作集峰值约 62.5 MiB；媒体汇总脚本的音频顺序路径 `2026-06-13 13:02` 通过：133 帧、稳态 49.94 FPS、最大间隔 43 ms、首帧约 877 ms、帧年龄最大 13 ms。下一步重点看系统音量变化、60 秒以上长时间运行、Mac client 播放体验和无系统声音时的提示。可用 `node scripts/windows/observe-windows-host-audio.mjs --durationMs 30000 --minFrames 1200 --minFps 40 --maxGapMs 1000 --maxFrameAgeMs 1000 --requireMonotonicTimestamp` 做持续帧观察并强校验音频帧新鲜度；需要确认有声电平时加 `--playTone --requireLevel --minLevel 0.02`。
- 继续优化 Windows 控制端文件托盘和错误提示，重点看大文件复制后的粘贴可用性、失败恢复和用户可理解性。
- Windows host 或假 Mac 认证相关改动后运行 `node scripts/windows/test-auth-retry-policy.mjs`，确认错误密码剩余次数、第三次断开和新连接正确认证未退化。
- Windows 控制端视频、缩放、设备发现或输入相关改动后，先用 `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --host <Mac IP> --port 43770 --expectDiscoveryRuntimeBuildId <build-id>` 做无密码 UI 验收，确认刷新设备会自动选中真实在线 WebSocket 目标并显示 runtime；再用真实 Mac host 运行 `node scripts/windows/test-windows-client-browser.mjs --host <Mac IP> --port 43770 --password <密码> --requireH264`，确认 H.264/WebCodecs 画布解码未退回 JPEG、`H264Errors=0`，并确认黑边输入防护回归通过；同时看页面“帧延迟”和诊断条是否有 `到达 <ms>` 或“时钟偏差”提示，避免再把随机模拟数值当成真实延迟。
- Windows host 相关改动后运行 `scripts/windows/test-windows-host.ps1`，确认真实视频首帧、文本剪贴板和文件剪贴板接收未退化；涉及启动/部署路径时，再跑 `node scripts/windows/check-windows-host-readiness.mjs --requireOpen --requireCurrentBuildId` 或桌面版部署档，确认 `/discovery.runtime.buildId` 不是旧进程；涉及音频时可加 `-AudioMode wasapi -RequireAudio`；涉及 Mac 反控链路时再运行 `node scripts/windows/test-mac-client-browser.mjs`，确认 Mac client 页面可显示 Windows 画面、收到 `input_ack`，并完成 `Command+C` 到 `Ctrl+C` 映射、最近连接保存/回填/清空、文本/本机剪贴板监听/文件剪贴板发送；需要验收真实 PCM 播放时，本机临时 host 可加 `--requireAudio --maxAudioFrameMs <毫秒> --maxAudioPlaybackMs <毫秒>`，已运行 host 可加 `--useExistingHost --enableAudio --expectAudioPayload --expectAudioPlayback --maxAudioFrameMs <毫秒> --maxAudioPlaybackMs <毫秒>`；需要体验阈值时加 `--maxInitialVideoMs` 和 `--observeVideoMs --minObservedVideoFrames --minObservedVideoFps`，需要断线恢复阈值时加 `--expectReconnect --maxReconnectRestoreMs`；认证相关改动可加跑 `node scripts/windows/test-mac-client-browser.mjs --expectAuthFailure --expectedAttemptsRemaining 2 --expectedMaxAttempts 3`。
- Windows host 或 Mac client 视频参数相关改动后优先运行 `node scripts/windows/observe-windows-host-media.mjs --resourceSampleTree true --json`，顺序确认普通启动下 60 Hz 视频请求、实际 FPS、最大帧间隔、采集管线、请求码率、`jpegQuality`、帧新鲜度、WASAPI 音频帧和资源摘要；若只看视频，再运行 `node scripts/windows/observe-windows-host-video.mjs --fps 60 --useDefaultMaxScreenFps --expectSessionFps 60 --durationMs 4000 --minFrames 140 --minFps 35 --requireMonotonicTimestamp --maxFrameAgeMs 1000 --resourceSampleTree true`。可再用 `--bandwidthKbps 5000 --qualityPreset smooth --json` 与 `--bandwidthKbps 40000 --qualityPreset sharp --json` 对照低/高码率；最后运行 `node scripts/windows/test-mac-client-browser.mjs` 确认 Mac client 默认 1080P/60Hz/20Mbps 和 2K/60Hz/40Mbps 更新路径未退化。
- 继续维护本机假 Mac 服务，用于快速回归和失败场景模拟。

## 暂不优先

- 安装包。
- 公网账号系统。
- 大文件断点续传。
- H.264 硬件编码深度优化。
- UDP/mDNS 自动发现完整实现。
