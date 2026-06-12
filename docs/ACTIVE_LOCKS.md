# 当前文件占用

最后更新：2026-06-12

用途：避免 Windows Codex 和 Mac Codex 同时重写同一片代码。占用不是永久所有权，只表示“我正在处理，另一端先别碰”。

## 使用规则

- 开工前先在这里登记自己准备修改的文件或目录。
- 完成、提交、推送后，把自己的占用移到“已释放”。
- 如果占用超过 24 小时没有更新，另一端可以在 `docs/HANDOFF_LOG.md` 留言后接手。
- 共享协议、消息模型和探针脚本属于高冲突区域，修改前必须明确登记。

## 当前占用

| 端 | 文件或目录 | 原因 | 开始时间 | 状态 |
| --- | --- | --- | --- | --- |

## 高冲突区域

- `shared/protocol`
- `docs/03-architecture-and-protocol.md`
- `apps/mac-host/Sources/MacHost/ProtocolMessages.swift`
- `apps/windows-client/protocol-client.js`
- `apps/mock-mac-host/server.mjs`
- `apps/windows-host/src/websocket-codec.mjs`
- `scripts/windows/probe-mac-host.mjs`
- `scripts/windows/test-mac-host.ps1`

## 已释放

| 端 | 文件或目录 | 完成时间 | 说明 |
| --- | --- | --- | --- |
| Windows Codex | `scripts/windows/check-windows-audio-devices.mjs`、`apps/windows-host/README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 12:22 | 新增 Windows DirectShow 音频设备检查脚本；默认只列设备不采集，支持显式 `--probe` 短时 PCM 检测。本机列出 7 个设备、4 个音频设备。 |
| Windows Codex | `scripts/windows/observe-windows-host-video.mjs`、`apps/windows-host/README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 12:14 | Windows host 视频观察脚本新增 `--ffmpeg`，并自动识别 `C:\DevTools\ffmpeg\bin\ffmpeg.exe`；短时 FFmpeg 真实视频观察通过，约 9.31 FPS、掉帧 0。 |
| Mac Codex | `apps/mac-client/*`、`scripts/windows/test-mac-client-browser.mjs`、`README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md` | 2026-06-12 12:01 | Mac client 新增本机文本剪贴板读取和可选自动监听；默认关闭、只监听文本、断开连接自动停止；页面级自检已覆盖手动读取发送和监听自动发送。 |
| Mac Codex | `scripts/windows/test-mac-client-browser.mjs`、`apps/mac-client/README.md`、`README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md` | 2026-06-12 11:48 | Mac client 页面级自检新增 `--expectAuthFailure`，可断言认证失败剩余次数；错误密码模式和普通成功模式均通过。 |
| Windows Codex | `apps/windows-host/src/windows-screen-capture.mjs`、`scripts/windows/test-windows-host.ps1`、`apps/windows-host/README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 11:55 | Windows host 屏幕采集支持 `LAN_DUAL_FFMPEG` 显式路径；Windows host 自检脚本新增 `-Ffmpeg` 并自动识别 `C:\DevTools\ffmpeg\bin\ffmpeg.exe`。本机已安装 FFmpeg 并通过授权 FFmpeg 真实画面自检。 |
| Mac Codex | `apps/mac-client/app.js`、`apps/mac-client/README.md`、`README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md`、`docs/CURRENT_STATUS.md`、`docs/04-task-board.md` | 2026-06-12 11:38 | Mac client 认证失败 UX：显示剩余尝试次数，失败后关闭当前 WebSocket 并释放连接按钮；正常路径与错误密码路径均已验证。 |
| Windows Codex | `apps/windows-client/index.html`、`apps/windows-client/styles.css`、`apps/windows-client/app.js`、`apps/windows-client/README.md`、`scripts/windows/test-windows-client-browser.mjs`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 11:34 | Windows 控制端悬浮控制中心改为更接近 UU 远程的右上角菜单样式，收起态显示刷新率/码率摘要；自检脚本已增加悬浮层和摘要断言。 |
| Mac Codex | `scripts/windows/test-mac-client-browser.mjs`、`apps/mac-client/README.md`、`README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md` | 2026-06-12 11:30 | Mac client 页面级自检新增文件剪贴板自动化：CDP 注入临时小文件并等待 `clipboard_file_result`；Mac 本机 mock/回退链路通过，Windows 默认模式待系统剪贴板强校验。 |
| Windows Codex | `apps/windows-client/styles.css`、`apps/windows-client/README.md`、`scripts/windows/test-windows-client-browser.mjs`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 11:14 | Windows 控制端全屏模式改为隐藏顶部工具栏、由悬浮控制中心主导；页面级自检已覆盖悬浮全屏和窗口按钮。 |
| Windows Codex | `scripts/windows/test-windows-client-browser.mjs`、`apps/windows-client/README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 11:09 | Windows 控制端页面级自检已固化悬浮控制中心回归；验证展开、画质、缩放、声音和音量同步后再连接被控端。 |
| Windows Codex | `apps/windows-client/index.html`、`apps/windows-client/styles.css`、`apps/windows-client/app.js`、`apps/windows-client/README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 11:04 | Windows 控制端新增远控画面悬浮控制中心第一版；可在画面内快速切换显示屏、画质、缩放、声音、音量、全屏、窗口和退出远控，并同步复用现有顶部工具栏状态。 |
| Mac Codex | `apps/mac-client/*`、`README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md` | 2026-06-12 11:10 | Mac 控制端 Web 原型新增文件剪贴板发送入口，复用 `clipboard_file_*` 分块协议；本机验证 UI 和未选择文件安全路径，真实文件写入系统剪贴板待 Windows 端验收。 |
| Windows Codex | `scripts/windows/test-mac-client-browser.mjs`、`apps/windows-host/README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 10:55 | Mac client 页面级自检已覆盖文本剪贴板发送；真实 Windows host 返回 `clipboard_ack · system`，视频画面和 `input_ack · log` 同时通过。 |
| Windows Codex | `scripts/windows/test-windows-host.ps1`、`apps/windows-host/README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 10:52 | Windows host 一键自检增加临时端口冲突防护；默认 43772 被占用时自动换空闲端口，普通路径和占位服务占用场景均通过。 |
| Mac Codex | `apps/mac-client/*`、`README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md` | 2026-06-12 10:59 | Mac 控制端 Web 原型新增 PCM 音频播放入口；本机验证默认不请求音频，打开后可收到 mock 音频帧并更新状态，真实 PCM 待 Windows 端提供音频设备验收。 |
| Windows Codex | `scripts/windows/test-mac-client-browser.mjs`、`apps/windows-host/README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 10:45 | Mac client 页面级自检增加 Windows host 临时端口冲突防护；默认 43772 被占用时自动换空闲端口，正常路径和占位服务占用场景均通过。 |
| Windows Codex | `apps/windows-host/src/windows-audio-capture.mjs`、`apps/windows-host/src/windows-host-service.mjs`、`apps/windows-host/README.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 10:39 | Windows host 新增显式 FFmpeg DirectShow PCM 音频采集入口；默认仍 mock，设置 `LAN_DUAL_WINDOWS_AUDIO_DEVICE` 后可发送 `pcm-f32le-base64`，PCM 打包、协商、一键自检、认证回归和 Mac client 页面级自检通过。 |
| Mac Codex | `apps/mac-client/*`、`README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md` | 2026-06-12 10:39 | Mac 控制端 Web 原型已增加手动文本剪贴板发送入口；本机连接 Windows host 回退服务验证 `clipboard_ack · memory-only` 通过。 |
| Windows Codex | `scripts/windows/observe-windows-host-video.mjs`、`apps/windows-host/README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 10:24 | Windows host 视频观察脚本增加临时端口冲突防护；默认端口被占用时自动换空闲端口，已用占位服务验证通过。 |
| Windows Codex | `apps/windows-host/src/windows-host-service.mjs`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md`、`docs/04-task-board.md`、`docs/NEXT_ACTIONS.md` | 2026-06-12 10:19 | 优化 Windows host 视频发送调度；FFmpeg gdigrab 观察从约 23.99 FPS 提升到约 29.39 FPS，页面级自检、System.Drawing 兜底、一键自检和认证回归通过。 |
| Windows Codex | `scripts/windows/observe-windows-host-video.mjs`、`apps/windows-host/README.md`、`README.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 05:06 | 新增 Windows host 视频持续帧观察脚本；本机 FFmpeg gdigrab 路径 5 秒 120 帧、约 23.99 FPS，System.Drawing 兜底约 2.04 FPS。 |
| Windows Codex | `apps/windows-host/src/windows-screen-capture.mjs`、`apps/windows-host/src/windows-host-service.mjs`、`apps/windows-host/src/windows-clipboard-bridge.mjs`、`scripts/windows/test-windows-host.ps1`、`scripts/windows/test-mac-client-browser.mjs`、`README.md`、`apps/windows-host/README.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 04:56 | Windows host 新增 FFmpeg gdigrab MJPEG 持续采集管线；自检验证真实 `windows-ffmpeg-gdigrab-mjpeg` 首帧、文本剪贴板、文件剪贴板、Mac client 页面级连接和认证重试策略均通过。 |
| Windows Codex | `scripts/windows/test-windows-host.ps1`、`README.md`、`apps/windows-host/README.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 04:47 | Windows host 一键自检默认加入文本剪贴板验证；真实 JPEG、文本剪贴板和文件剪贴板均通过。 |
| Windows Codex | `scripts/windows/test-auth-retry-policy.mjs`、`README.md`、`apps/windows-host/README.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 04:42 | 新增认证重试策略回归脚本：同时验证 Windows host 和假 Mac 的错误密码剩余 `2/1/0`、第三次断开和新连接正确认证。 |
| Windows Codex | `scripts/windows/test-mac-client-browser.mjs`、`README.md`、`apps/windows-host/README.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 04:38 | 新增 Mac client 页面级自检：临时启动 Windows host 与 `apps/mac-client`，验证真实 `windows-gdi-jpeg` 画面和 `input_ack · log`。 |
| Windows Codex | `apps/mock-mac-host/server.mjs`、`docs/CURRENT_STATUS.md`、`docs/04-task-board.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 04:32 | 假 Mac WebSocket 服务已对齐认证失败限制：同一连接 3 次密码错误后返回 `LAN002` 并关闭，返回剩余尝试次数。 |
| Windows Codex | `apps/windows-client/app.js`、`apps/windows-client/protocol-client.js`、`apps/windows-client/README.md`、`docs/CURRENT_STATUS.md`、`docs/04-task-board.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 04:27 | Windows 控制端认证失败提示会显示剩余尝试次数；自动重连遇到 `LAN002` 会停止，避免继续消耗密码尝试次数。 |
| Mac Codex | `apps/mac-client/*`、`README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md` | 2026-06-12 04:25 | 新增 Mac 控制 Windows Web 原型；本机连接 43772 Windows-host mock，视频显示和输入 ack 通过。 |
| Mac Codex | `scripts/mac/check-input-keymap.mjs`、`apps/mac-host/README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md` | 2026-06-12 04:18 | 新增 Mac 键盘映射覆盖自检；`keyCodeByCode=115`、`keyCodeByKey=113`，常用键组全覆盖。 |
| Windows Codex | `apps/windows-host/src/windows-host-service.mjs`、`apps/windows-host/README.md`、`docs/CURRENT_STATUS.md`、`docs/04-task-board.md`、`docs/HANDOFF_LOG.md` | 2026-06-12 04:15 | Windows 被控端认证失败限制对齐 Mac：同一连接 3 次失败后返回 `LAN002` 并关闭；正常和错误路径均已验证。 |
| Mac Codex | `scripts/mac/observe-mac-audio.mjs`、`apps/mac-host/README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md` | 2026-06-12 04:09 | 新增 Mac 系统声音持续帧观察脚本；真实 43770/system-pcm 10 秒收到 501 帧，约 50fps，最大间隔 22ms。 |
| Windows Codex | `scripts/windows/test-windows-host.ps1`、`apps/windows-host/README.md`、`README.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md`、`docs/HANDOFF_LOG.md` | 2026-06-12 04:08 | 新增 Windows 被控端本机一键自检脚本；已验证真实 JPEG 首帧和文件剪贴板 `saveMode=clipboard`，默认不发输入事件。 |
| Mac Codex | `scripts/mac/stress-mac-host.mjs`、`apps/mac-host/README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md` | 2026-06-12 04:00 | 新增 Mac host H.264+PCM 连续连接稳定性脚本；真实 43770/log 连续 10 次通过，FD 30->30。 |
| Windows Codex | `apps/windows-client/app.js`、`apps/windows-client/index.html`、`apps/windows-client/README.md`、`apps/windows-desktop/src-tauri/src/main.rs`、`apps/windows-desktop/src-tauri/Cargo.toml`、`apps/windows-desktop/src-tauri/Cargo.lock`、`apps/windows-desktop/src-tauri/tauri.conf.json`、`apps/windows-desktop/README.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md`、`docs/HANDOFF_LOG.md` | 2026-06-12 03:59 | Windows 控制端桌面版远端文件写入系统文件剪贴板：接收完成后保存临时文件并调用 Windows 文件剪贴板；桌面构建通过。 |
| Windows Codex | `apps/windows-host/src/windows-screen-capture.mjs`、`apps/windows-host/src/windows-host-service.mjs`、`apps/windows-host/README.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md`、`docs/HANDOFF_LOG.md` | 2026-06-12 03:47 | Windows 被控端真实屏幕 JPEG 采集第一版：系统截图 `video_frame`，失败回退模拟帧；服务级 `--requireRealVideo` 已通过。 |
| Mac Codex | `scripts/windows/test-windows-client-browser.mjs`、`apps/windows-client/README.md`、`docs/HANDOFF_LOG.md`、`docs/ACTIVE_LOCKS.md` | 2026-06-12 | 页面级自检支持 macOS Chrome/自定义浏览器路径；已在 Mac 上连接真实 43770 并验证 JPEG 回退和 PCM 播放入口。 |
| Windows Codex | `scripts/windows/probe-mac-host.mjs`、`scripts/windows/test-mac-host.ps1`、`apps/mac-host/README.md`、`docs/04-task-board.md`、`docs/HANDOFF_LOG.md` | 2026-06-12 | 新增 `-RequireAudio` / `--requireAudio` 强校验，可确认 Mac 真实 `pcm-f32le-base64` 音频帧。 |
| Windows Codex | `apps/windows-client/app.js`、`apps/windows-client/README.md`、`scripts/windows/test-windows-client-browser.mjs`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md`、`docs/HANDOFF_LOG.md` | 2026-06-12 | Windows 控制端真实 PCM 音频播放入口：支持 `pcm-f32le-base64`、planar/interleaved 布局、音量增益和页面级自检注入。 |
| Mac Codex | `apps/mac-host/Sources/MacHost/MacHostService.swift`、`apps/mac-host/Sources/MacHost/ScreenCaptureCoordinator.swift`、`apps/mac-host/README.md`、`shared/protocol/*`、`docs/03-architecture-and-protocol.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md`、`docs/HANDOFF_LOG.md` | 2026-06-12 | Mac 真实系统声音采集第一版：ScreenCaptureKit 输出 `pcm-f32le-base64` PCM 帧，失败回退 mock；真机音频探针已通过。 |
| Mac Codex | `apps/mac-host/Sources/MacHost/MacHostService.swift`、`apps/mac-host/Sources/MacHost/ScreenCaptureCoordinator.swift`、`apps/mac-host/README.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md`、`docs/HANDOFF_LOG.md`、`docs/TEST_COORDINATION.md` | 2026-06-12 | H.264 第一版真机验证收尾：Swift 6 Sendable 警告已清理，状态文档已同步，43770/log 当前运行并通过 `--requireH264`。 |
| Windows Codex | `apps/mac-host/Sources/MacHost/HostConfiguration.swift`、`apps/mac-host/Sources/MacHost/MacHostService.swift`、`apps/windows-client/app.js`、`apps/windows-client/styles.css`、`docs/09-streaming-video-plan.md`、`shared/protocol/*` | 2026-06-12 | 已完成 JPEG 帧率协商修正、实收 FPS 显示、真实画面覆盖层修复和 H.264 流式视频计划。 |
