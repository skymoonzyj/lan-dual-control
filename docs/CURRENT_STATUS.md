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

- Windows 控制端已有中文界面、局域网连接、连接历史、画质设置、缩放模式、认证失败剩余次数提示、诊断状态条、真实 Mac 音频 PCM 播放、文本剪贴板、远端文件托盘、桌面版远端文件写入 Windows 系统文件剪贴板和桌面壳。
- Windows 控制端可连接本机假 Mac 服务，也可用脚本探测真实 Mac 被控端；假 Mac 服务已对齐 3 次认证失败断开行为。
- Windows 被控端已有 WebSocket 骨架、认证、FFmpeg gdigrab MJPEG 视频帧、无 FFmpeg 时的 Windows 系统截图 JPEG 回退、默认模拟音频帧、显式 DirectShow PCM 音频设备采集入口、文本和文件剪贴板接收、最小 SendInput 输入注入。
- Windows 被控端新增 `scripts/windows/test-windows-host.ps1` 本机自检入口，可临时启动本机服务并验证真实 JPEG 首帧、文本剪贴板和文件剪贴板接收；`scripts/windows/observe-windows-host-video.mjs` 可观察持续视频帧并统计实际 FPS、最大间隔和采集管线；`scripts/windows/test-mac-client-browser.mjs` 可启动 Mac client 页面验证 Mac 反控 Windows 的真实 JPEG 画面、`input_ack`、文本剪贴板和文件剪贴板发送；`scripts/windows/test-auth-retry-policy.mjs` 可回归 Windows host 和假 Mac 的 3 次认证失败断开策略。
- Windows 被控端已限制同一 WebSocket 连接内最多 3 次密码认证失败，失败耗尽后返回 `LAN002` 并关闭连接。
- Windows 被控端真实屏幕采集目前默认优先 FFmpeg gdigrab 持续 MJPEG，PowerShell/System.Drawing 系统截图作为兜底，全部失败时回退模拟帧；音频默认仍为模拟帧，但可显式配置 `LAN_DUAL_WINDOWS_AUDIO_DEVICE` 试用 FFmpeg DirectShow PCM，后续仍需升级 Windows Graphics Capture 和 WASAPI loopback。
- Mac 控制 Windows 的 Web 控制端原型已新增到 `apps/mac-client`：可发现/连接 Windows host、显示 JPEG/data-url 画面、发送鼠标/键盘输入事件并显示 `input_ack`，也可手动发送文本 `clipboard_text` 并显示 `clipboard_ack`，以及选择文件后按 `clipboard_file_*` 分块发送；新增 PCM 音频播放入口，可播放 `pcm-f32le-base64` 过渡音频帧，mock 音频帧只显示状态。Windows 本机页面级自检已验证真实 `windows-ffmpeg-gdigrab-mjpeg` 画面、log 模式输入确认和文本剪贴板 `system` 确认；脚本现已可注入临时小文件并在 Windows 上默认要求文件剪贴板 `saveMode=clipboard`。

## Mac 端状态

- macOS 被控端已有 Swift WebSocket 服务、`/discovery`、认证、会话协商、真实 JPEG 屏幕帧、模拟帧回退、CGEvent 输入注入、文本剪贴板双向同步和文件剪贴板接收。
- JPEG 调试链路默认真实采集上限已改为 30 FPS，控制端会显示实收 FPS、协商帧率和请求帧率。
- 真 Mac 已用于验证真实 JPEG 首帧、文本剪贴板双向同步、文件剪贴板从 Mac 推送到控制端内存托盘。
- ScreenCaptureKit + VideoToolbox H.264 输出入口已在真 Mac 上编译、启动并通过本机 `--requireH264` 强校验，实际返回 `videoCodec=h264`、`videoEncoding=annexb-base64`、`capturePipeline=screencapturekit-h264`。
- Mac 系统声音采集第一版已接入 ScreenCaptureKit，真机验证可输出 `pcm-f32le-base64`、48kHz、双声道、20ms 的真实 `audio_frame`；Windows 控制端已可播放该 PCM 帧，并通过页面级自检验证播放计数。
- Mac 端新增 `scripts/mac/stress-mac-host.mjs` 连续连接稳定性脚本，复用 canonical 探针验证 H.264 + PCM；真机 10 次循环已通过，FD 保持 `30->30`。
- Mac 端新增 `scripts/mac/observe-mac-audio.mjs` 音频持续帧观察脚本；真机 10 秒收到 501 帧，约 50fps，最大接收间隔 22ms。
- Mac 端新增 `scripts/mac/check-input-keymap.mjs` 输入映射覆盖自检；当前 `KeyboardEvent.code` 115 项、`event.key` 113 项，常用键组全覆盖。

## 共享协议状态

- `hello/auth/session`、`video_frame`、`audio_frame`、`input_event`、`input_ack`、`display_settings`、`clipboard_text`、`clipboard_file_*` 已有基础定义和多端实现。
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
