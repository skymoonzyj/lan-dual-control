# 当前开发状态

最后更新：2026-06-12

用途：这是 Windows Codex 和 Mac Codex 每次开工前的第一入口。这里只写当前事实，不写长期规划。

## 总体状态

- 项目中心仓库：`lan-dual-control`
- 当前主目标：继续把 Windows 控制 Mac 做成真实可日常试用的版本，同时保留 Mac 反控 Windows 的骨架。
- 当前优先级：真实 Mac 被控端验收、输入注入安全验证、真实 Mac 音频长时间验证、H.264 端到端解码体验和低延迟稳定性。
- 协议入口：`docs/03-architecture-and-protocol.md`
- 任务入口：`docs/04-task-board.md`
- 下一步入口：`docs/NEXT_ACTIONS.md`

## Windows 端状态

- Windows 控制端已有中文界面、局域网连接、连接历史、画质设置、缩放模式、适应窗口黑边输入防护、认证失败剩余次数提示、诊断状态条、Mac host 运行时 PID/启动时间/build 显示、Mac H.264 启动回退原因显示、真实 Mac H.264/WebCodecs 画布解码、重配置后 H.264 关键帧等待、真实 Mac 音频 PCM 播放、文本剪贴板、远端文件托盘、桌面版远端文件写入 Windows 系统文件剪贴板和桌面壳。
- Windows 控制端可连接本机假 Mac 服务，也可用脚本探测真实 Mac 被控端；`test-windows-client-browser.mjs --diagnosticsOnly --expectDiscoveryRuntimeBuildId <build-id>` 可不输入密码验证真实 `/discovery.runtime` 是否显示到设备列表和诊断条；假 Mac 服务已对齐 3 次认证失败断开行为。
- Windows 被控端已有 WebSocket 骨架、认证、FFmpeg gdigrab MJPEG 视频帧、无 FFmpeg 时的 Windows 系统截图 JPEG 回退、默认模拟音频帧、显式 WASAPI loopback 系统声音采集入口、显式 DirectShow PCM 音频设备采集入口、文本和文件剪贴板接收、常驻 C# SendInput helper 输入注入。
- Windows 被控端新增 `scripts/windows/check-windows-host-readiness.mjs` 一键体检入口，默认低风险串联 Node/FFmpeg、Windows host 语法、输入 helper 安全干跑、音频设备/WASAPI 格式和局域网/防火墙只读检查，可显式加 `--probeVideo --probeAudio` 做临时视频/音频短采集；`scripts/windows/test-windows-host.ps1` 可临时启动本机服务并验证真实 JPEG 首帧、文本剪贴板、文件剪贴板接收，也可加 `-AudioMode wasapi -RequireAudio` 强校验系统声音 PCM；`scripts/windows/check-windows-firewall.mjs` 可只读检查 Windows host 端口监听、局域网 IP 探测、当前网络配置和 TCP 入站放行规则，并给出管理员放行建议命令但不会自动改系统；`scripts/windows/measure-windows-input-helper.mjs` 可安全干跑量化常驻 input helper 的冷启动和热路径延迟；`scripts/windows/observe-windows-host-video.mjs` 可观察持续视频帧并统计实际 FPS、最大间隔、采集管线、请求码率和 `jpegQuality`，也可用 `--useDefaultMaxScreenFps --expectSessionFps 60` 验证普通启动默认上限；Windows host FFmpeg gdigrab 普通启动默认最高 60Hz，可用 `LAN_DUAL_WINDOWS_MAX_SCREEN_FPS` 降回 30 省资源；Windows host 会按既有 `qualityPreset`/`maxBandwidthKbps` 调整 FFmpeg/System.Drawing JPEG 压缩质量，未设置 `LAN_DUAL_WINDOWS_JPEG_QUALITY` 时自动计算，设置后可强制覆盖；`scripts/windows/observe-windows-host-audio.mjs` 可观察持续音频帧并统计稳态 FPS、最大间隔、payload 和电平，支持显式 `--playTone --requireLevel` 播放短测试音并强校验 WASAPI 电平；当前 WASAPI 本机 30 秒稳态 50 FPS、最大间隔 33 ms，测试音最高电平 0.222；`scripts/windows/test-mac-client-browser.mjs` 可启动 Mac client 页面验证 Mac 反控 Windows 的真实 JPEG 画面、`input_ack`、Mac `Command+C` 到 Windows `Ctrl+C` 映射、最近连接保存/回填/清空且不保存密码、文本剪贴板、Mac 本机文本剪贴板读取/监听、文件剪贴板发送、可选音频帧/PCM payload/播放计数和认证失败剩余次数提示，也可加 `--requireAudio` 临时启用 WASAPI 并强校验 `pcm-f32le-base64`；`scripts/windows/test-auth-retry-policy.mjs` 可回归 Windows host 和假 Mac 的 3 次认证失败断开策略。
- Windows 被控端新增 `scripts/windows/start-windows-host.mjs` 和 PowerShell 包装 `scripts/windows/start-windows-host.ps1`，用于日常启动 Windows host：启动后会列出 Mac 端可填写的局域网地址，等待 `/discovery` 就绪，并自动运行只读局域网/防火墙检查；可加 `--wasapi` / `-Wasapi` 显式开启系统声音采集，默认不自动改防火墙。
- Windows 被控端已限制同一 WebSocket 连接内最多 3 次密码认证失败，失败耗尽后返回 `LAN002` 并关闭连接。
- Windows 被控端真实屏幕采集目前默认优先 FFmpeg gdigrab 持续 MJPEG，PowerShell/System.Drawing 系统截图作为兜底，全部失败时回退模拟帧；音频默认仍为模拟帧，但可显式设置 `LAN_DUAL_WINDOWS_AUDIO_MODE=wasapi` 采集默认播放设备系统声音并发送 `pcm-f32le-base64`，也可配置 `LAN_DUAL_WINDOWS_AUDIO_DEVICE` 试用 FFmpeg DirectShow PCM；后续仍需升级 Windows Graphics Capture，并用 Mac client 做真实听感和延迟验收。
- Mac 控制 Windows 的 Web 控制端原型已新增到 `apps/mac-client`：可发现/连接 Windows host、显示 JPEG/data-url 画面、选择画质/分辨率/刷新率/码率并发送 `display_settings`、发送鼠标/键盘输入事件并显示 `input_ack`，页面会提示 Mac `Command` 按 Windows `Ctrl` 发送且自检已覆盖该映射，认证失败时显示剩余尝试次数并释放连接按钮，成功连接后可保存最近 host/port/时间、一键回填或清空，且不保存密码，也可手动发送文本 `clipboard_text` 并显示 `clipboard_ack`，可读取 Mac 本机文本剪贴板，用户显式开启后可监听文本变化并自动发送，以及选择文件后按 `clipboard_file_*` 分块发送；新增 PCM 音频播放入口，可播放 `pcm-f32le-base64` 过渡音频帧，mock 音频帧只显示状态。Windows 本机页面级自检已验证普通启动真实 `windows-ffmpeg-gdigrab-mjpeg` 画面、默认 1080P/60Hz/20Mbps 会话请求、2K/60Hz/40Mbps 设置更新和 Windows host 回执里的码率/JPEG 质量、log 模式输入确认、文本剪贴板 `system`、文件剪贴板 `saveMode=clipboard`，以及 `--requireAudio` 下真实 WASAPI PCM 播放计数递增。

## Mac 端状态

- macOS 被控端已有 Swift WebSocket 服务、`/discovery`、认证、会话协商、真实 JPEG 屏幕帧、模拟帧回退、CGEvent 输入注入、文本剪贴板双向同步和文件剪贴板接收。
- JPEG 调试链路默认真实采集上限已改为 30 FPS，控制端会显示实收 FPS、协商帧率和请求帧率。
- 真 Mac 已用于验证真实 JPEG 首帧、文本剪贴板双向同步、文件剪贴板从 Mac 推送到控制端内存托盘。
- ScreenCaptureKit + VideoToolbox H.264 输出入口已在真 Mac 上编译、启动并通过本机 `--requireH264` 强校验，实际返回 `videoCodec=h264`、`videoEncoding=annexb-base64`、`capturePipeline=screencapturekit-h264`。
- Mac 端新增 `scripts/mac/observe-mac-video.mjs` 视频持续帧观察脚本；真机 H.264 30 秒收到 877 帧，约 29.2fps，最大接收间隔 45ms，全部为 `screencapturekit-h264`；空闲/低变化桌面下 5 分钟 H.264 收到 3168 帧、约 10.6fps，60 秒复测约 10.9fps、最大接收间隔 883ms，JPEG 60 秒对照约 16.4fps；脚本也可统计并断言 `video_frame.activeDisplayId` / `displayName`，并汇总帧 `timestamp` 接收年龄、H.264 `timestampUs` 单调性、媒体间隔和 `durationUs`。当前 43770 H.264/JPEG 短观察均确认帧级显示器为 `main`；时间线短测 H.264 3 秒 89 帧、约 29.2fps、最大接收间隔 39ms，`timestampUs` 单调，媒体间隔平均/最大 `34281/41668us`，`durationUs=33333`。Mac host 最新代码会输出带小数秒的 ISO `timestamp`，临时 43771 build 已验证 discovery/runtime 为毫秒格式且 mock `video_frame` 接收年龄 max 0ms；主 43770 需重启到该 build 后才能用更严格的 `--maxFrameAgeMs 250`。后续高 FPS 强校验需要区分静态桌面和动态画面。
- Mac 系统声音采集第一版已接入 ScreenCaptureKit，真机验证可输出 `pcm-f32le-base64`、48kHz、双声道、20ms 的真实 `audio_frame`；Windows 控制端已可播放该 PCM 帧，并通过页面级自检验证播放计数。
- Mac 端新增 `scripts/mac/stress-mac-host.mjs` 连续连接稳定性脚本，复用 canonical 探针验证 H.264 + PCM；真机 50 次循环已通过，RSS `79376->80656 KB`，FD 保持 `30->30`。
- Mac 端新增 `scripts/mac/observe-mac-audio.mjs` 音频持续帧观察脚本；真机 30 秒收到 1501 帧，约 50fps，最大接收间隔 24ms，payload 恒定 7680 bytes；5 分钟长稳收到 15001 帧，50.0fps，最大接收间隔 31ms，payload 仍恒定 7680 bytes。脚本现支持显式 `--playTone --requireLevel --minLevel` 做有声电平强校验，默认不播放声音；无人值守下已用 `--toneVolume 0` 验证测试音流程和清理逻辑。
- Mac 端新增 `scripts/mac/check-input-keymap.mjs` 输入映射覆盖自检；当前 `KeyboardEvent.code` 115 项、`event.key` 113 项，常用键组、同义 code/key 和 `meta/command`、`alt/option`、`ctrl/control`、`shift` 修饰键 flag fallback 全覆盖。
- Mac 端新增 `scripts/mac/smoke-mac-input-log.mjs` 输入事件安全冒烟脚本；脚本只允许 `/discovery` 显示 `inputMode=log` 时发送事件，真机 16 个鼠标/滚轮/键盘/快捷键事件全部收到 `input_ack`，且 `mode=log`、`injected=false`。
- Mac host 的 H.264 视频流和系统音频流已增加异步启动 generation token，切换显示器或重发显示/音频设置后，旧流迟到的启动成功、帧回调或失败回退不会覆盖新会话；`video_frame` 也会带可选 `activeDisplayId` / `displayName` 诊断字段。
- Mac host 的 `/discovery` 和 `hello_ack` 会带可选 `runtime` 诊断：`processId`、`startedAt`、`uptimeSeconds` 和 `buildId`；`LAN_DUAL_BUILD_ID` 可在启动时指定，方便识别是否连到了旧进程。`lastSeenAt`、`runtime.startedAt`、WebSocket envelope `timestamp`、`video_frame.timestamp` 和回退诊断时间统一使用带小数秒的 ISO-8601 UTC 字符串，便于低延迟观察脚本计算帧接收年龄。`check-mac-displays` 支持 `--requireRuntime`、`--expectBuildId` 和 `--maxRuntimeUptimeSeconds`，可在部署/重启后强制确认 `/discovery` 与 `hello_ack` 来自同一目标进程；Windows 控制端连接前会轻量探测 `/discovery`，并把 runtime 显示在设备列表和诊断条。
- Mac host H.264 流式启动新增 5 秒 watchdog；若启动阶段迟迟未建立 `videoStream`，会发送带 `streamFallbackReason` 的 `display_settings_ack` 并回退 `background-jpeg`。临时 `43771` 单屏显式 H.264 display 自检已复现：5 秒超时后拿到 JPEG 首帧，随后迟到启动的旧 H.264 流被 token 停止。
- Mac 端新增 `scripts/mac/check-mac-displays.mjs` 显示器枚举与 `displayId` 切换回执自检；脚本默认要求 `video_frame.activeDisplayId` 存在且匹配，避免旧 host 未重启到最新二进制时误通过；调试旧 host 可显式加 `--allowMissingFrameDisplayDiagnostic`。当前单屏真机 `43770` 最新 host 验证通过：`displays=main*:1920x1080`，`session_answer`、`display_settings_ack`、首帧和切换后帧均指向 `main`，默认 MJPEG 和显式 H.264 路径均通过。真实外接双屏切换仍待实物验收。

## 共享协议状态

- `hello/auth/session`、`video_frame`、`audio_frame`、`input_event`、`input_ack`、`display_settings`、`clipboard_text`、`clipboard_file_*` 已有基础定义和多端实现；`video_frame.activeDisplayId` / `displayName` 为向后兼容的可选诊断字段。
- 修改共享协议前，必须先更新 `docs/03-architecture-and-protocol.md`，再同步修改两端实现。
- 协议变更必须写入 `docs/HANDOFF_LOG.md`，并在 `docs/NEXT_ACTIONS.md` 留下对接项。

## 每次开工检查

1. 拉取最新代码。
2. 阅读本文件。
3. 阅读 `docs/NEXT_ACTIONS.md`。
4. 阅读 `docs/ACTIVE_LOCKS.md`，确认自己要改的文件没有被另一端占用。
5. 阅读 `docs/TEST_COORDINATION.md`，确认当前是否有人正在呼叫另一端测试。
6. 如需改共享协议，先更新协议文档，再动代码。
7. 完成后更新 `docs/HANDOFF_LOG.md` 和 `docs/04-task-board.md`。
