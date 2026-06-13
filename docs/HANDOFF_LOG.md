# 双端交接记录

用途：每个 Codex 完成一段工作后，把结果写在最上面。另一端只看最新几条，就能知道该接哪里。

## 交接模板

```text
日期：
开发端：
本轮目标：
完成内容：
修改文件：
验证方式：
遗留问题：
下一步建议：
是否改了协议：
是否需要另一端配合：
```

## 2026-06-13 Mac Codex

日期：2026-06-13 14:45
开发端：Mac Codex
本轮目标：恢复真实 Mac host 的 discovery/runtime 通道，并让启动助手支持不泄露密码的一次性临时启动。
完成内容：
- 确认本机默认 43770 起初未监听，导致 Windows 侧探测 `192.168.31.122:43770` 失败。
- 用安全 `log` 输入模式启动 Mac host 到 `0.0.0.0:43770`，当前 LAN 地址 `192.168.31.122:43770`，runtime `pid=92813`、`build=b2e3cdf`、`startedAt=2026-06-13T06:30:20.099Z`。
- 提权 `curl` 确认 `127.0.0.1:43770/discovery` 和 `192.168.31.122:43770/discovery` 均可达；普通沙盒 `curl` 的失败是本地沙盒网络权限假阴性。
- `scripts/mac/start-mac-host.mjs` 新增 `--ephemeralPassword`，会生成一次性随机 `LAN_DUAL_PASSWORD` 并只传给本次 host 进程，不打印密码；与 `--password`、`--promptPassword` 和已有 `LAN_DUAL_PASSWORD` 互斥。
- 启动助手自测覆盖一次性随机密码干跑、拒绝覆盖已有环境密码，以及用一次性随机密码启动临时端口。
- Mac host README、CURRENT_STATUS、NEXT_ACTIONS 和任务板已同步该临时 discovery/runtime 恢复方式。
修改文件：
- `scripts/mac/start-mac-host.mjs`
- `scripts/mac/test-mac-host-start-helper.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node scripts/mac/check-mac-host-readiness.mjs --requireOpen --skipCurrentBuildCheck --timeoutMs 12000`
- `curl -sS --max-time 3 http://127.0.0.1:43770/discovery`
- `curl -sS --max-time 3 http://192.168.31.122:43770/discovery`
- `node scripts/mac/test-mac-script-help.mjs`
- `node --check scripts/mac/start-mac-host.mjs`
- `node --check scripts/mac/test-mac-host-start-helper.mjs`
- `node scripts/mac/test-mac-host-start-helper.mjs --timeoutMs 45000`
验证结果：
- Mac host 低风险 readiness 9/9 通过；`/discovery` 显示 `inputMode=log`、`screenRecording/accessibility/inputMonitoring=true`、`h264Stream=true`、`audioMode=system-pcm`、build `b2e3cdf`。
- Mac 脚本帮助入口覆盖 11 个脚本、22 条 `--help/-h` 命令通过。
- 启动助手自测通过：缺密码、`demo-password`、非交互密码提示、环境密码干跑、一次性随机密码干跑、拒绝覆盖已有环境密码、环境密码临时端口实启、一次性随机密码临时端口实启均通过。
遗留问题：
- 当前运行中的 43770 使用一次性随机密码，密码不会共享；Windows 端可以做无密码 discovery/runtime/UI 检查，但不能做 WebSocket 认证联调。
- 真正端到端 H.264/PCM/输入联调需要用户醒来后输入正式密码，或按约定密码重启 Mac host。
下一步建议：
- Windows 端可先运行无密码 diagnostics/discovery 检查确认 `build=b2e3cdf`；需要认证联调时在联络板发 call，Mac 端用正式密码重启。
是否改了协议：否。
是否需要另一端配合：暂不需要；认证联调需要用户提供正式密码或重新授权启动方式。

## 2026-06-13 Windows Codex

日期：2026-06-13 14:00
开发端：Windows Codex
本轮目标：给 Windows host 增加可选 FFmpeg H.264 流式输出，用于后续 Mac client H.264 接收链路联调。
完成内容：
- Windows host 新增显式 `LAN_DUAL_WINDOWS_SCREEN_MODE=ffmpeg-h264` / `h264` 模式，使用 FFmpeg `gdigrab` 采集桌面并通过 `libx264` 输出 H.264 Annex B。
- `video_frame` 在该模式下输出 `codec=h264`、`encoding=annexb-base64`、`payload`、`payloadBytes`、`codecString`、`timestampUs`、`durationUs`、`capturePipeline=windows-ffmpeg-gdigrab-h264` 和 `hostMode=windows-host-ffmpeg-h264`。
- `session_answer` 和 `display_settings_ack` 现在会带 `codecString`，方便 WebCodecs 接收端配置。
- `observe-windows-host-video.mjs` 支持 `--preferredVideoCodec h264`，并在 `--screenMode ffmpeg-h264` / `h264` 时自动请求 H.264/Annex B。
- 新增 `scripts/windows/test-windows-h264-mode.mjs`，作为 Windows host H.264 输出回归入口，内部调用视频观察脚本并断言 codec、pipeline、hostMode、requestedMode、帧数、FPS 和 timestamp 单调；脚本默认做多次短尝试，避免把 `gdigrab` 偶发启动波动当成第一次即失败。
- Windows host README、CURRENT_STATUS、NEXT_ACTIONS 和任务板已同步可选 H.264 模式、复测命令和短基线。
修改文件：
- `apps/windows-host/src/windows-screen-capture.mjs`
- `apps/windows-host/src/windows-host-service.mjs`
- `scripts/windows/observe-windows-host-video.mjs`
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/test-windows-h264-mode.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-host/src/windows-screen-capture.mjs`
- `node --check apps/windows-host/src/windows-host-service.mjs`
- `node --check scripts/windows/observe-windows-host-video.mjs`
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check scripts/windows/test-windows-h264-mode.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script observe-windows-host-video.mjs --script start-windows-host.mjs --script test-windows-h264-mode.mjs`
- `node scripts/windows/start-windows-host.mjs --screenMode ffmpeg-h264 --password test-password --requirePassword --dryRun`
- `$env:LAN_DUAL_PASSWORD='test-password'; powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-windows-host.ps1 -ScreenMode ffmpeg-h264 -RequirePassword -DryRun`
- `node scripts/windows/observe-windows-host-video.mjs --screenMode ffmpeg-h264 --preferredVideoCodec h264 --width 1280 --height 720 --fps 30 --durationMs 2500 --minFrames 10 --minFps 5 --maxGapMs 1000 --maxFrameAgeMs 1000 --requireMonotonicTimestamp --resourceSample false --json`
- `node scripts/windows/test-windows-h264-mode.mjs --durationMs 2500 --minFrames 20 --minFps 15`，用真实桌面权限运行
验证结果：
- 普通沙盒下 720p/30Hz H.264 短观察曾通过一次：71 帧 / 2502ms，约 28.37 FPS，最大帧间隔 78ms，`frameAge max=28ms`，管线 `windows-ffmpeg-gdigrab-h264`，codec `h264`；随后普通沙盒多次复测回退 mock，直跑 FFmpeg `gdigrab` 也报 `Failed to capture image (error 5)`。
- 真实桌面权限下 `test-windows-h264-mode` 标准窗口通过：73 帧 / 2.5 秒，约 28.83 FPS，最大帧间隔 53ms，管线 `windows-ffmpeg-gdigrab-h264`，codec `h264`。
- dry-run 启动助手和 PowerShell 包装均接受 `ffmpeg-h264`。
遗留问题：
- 当前实现仍是 FFmpeg `gdigrab` + `libx264` 软件编码 + JSON/base64 过渡传输，不是 WGC 真采集，也不是硬件编码最终形态。
- 普通沙盒上下文仍可能出现 `gdigrab error 5` / mock fallback；真实桌面权限下通过，说明主要是桌面抓屏权限/会话限制。后续正式低延迟 Windows 被控仍应优先推进 WGC capture backend、WebSocket 二进制帧和硬件编码。
下一步建议：
- Mac client H.264 接收落库后，Windows 端启动 `ffmpeg-h264` host，Mac 端用真实连接验证 WebCodecs 解码、JPEG 回退、首帧耗时、实收 FPS 和 frame age。
- Windows 端后续实现 WGC backend 时，继续保留 `ffmpeg-h264` 作为编码/接收链路对照。
是否改了协议：否；复用已有 H.264 过渡字段，并补充向后兼容的 `codecString` 回执。
是否需要另一端配合：暂不需要；等 Mac client H.264 接收准备推送后，需要 Mac 端连接 Windows `ffmpeg-h264` host 做端到端验收。

## 2026-06-13 Mac Codex

日期：2026-06-13 14:15
开发端：Mac Codex
本轮目标：让 Mac 控制 Windows 的 Web 控制端提前具备 H.264 接收能力，配合 Windows host ffmpeg-h264 线后续真机验收。
完成内容：
- Mac client 在浏览器支持 WebCodecs 时，`session_offer` 和 `display_settings` 会请求 `preferredVideoCodec=h264` / `preferredVideoEncoding=annexb`。
- 收到 `codec=h264`、`encoding=annexb-base64` 的 `video_frame` 后，会用 `VideoDecoder` 解码并绘制到新增的 `#remoteCanvas`，输入坐标会基于当前可见的 `<img>` 或 `<canvas>` 计算。
- 会识别 Annex B/AVC NAL 类型，等待关键帧后再喂给解码器；连续解码失败 2 次会自动请求 MJPEG/JPEG 兜底。
- 不支持 WebCodecs 的浏览器会自动请求 `mjpeg` / `data-url`，保持旧 JPEG/mock 路径可用。
- `test-mac-client-browser.mjs` 已兼容 `<canvas>` 视频表面，并新增 `--disableWebCodecs` 分支覆盖 MJPEG 请求 fallback。
- Mac client README、CURRENT_STATUS、NEXT_ACTIONS 和任务板已同步。
修改文件：
- `apps/mac-client/index.html`
- `apps/mac-client/styles.css`
- `apps/mac-client/app.js`
- `apps/mac-client/README.md`
- `scripts/windows/test-mac-client-browser.mjs`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
验证方式：
- `node --check apps/mac-client/app.js`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --observeVideoMs 1000 --minObservedVideoFrames 5 --minObservedVideoFps 5 --skipFileClipboard`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --disableWebCodecs --observeVideoMs 800 --minObservedVideoFrames 4 --minObservedVideoFps 4 --skipFileClipboard`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 默认浏览器能力路径通过；mock 视频 59 帧 / 1002ms / 58.9fps，并断言请求字段按 WebCodecs 能力选择 H.264 或 fallback。
- 禁用 WebCodecs 路径通过；mock 视频 47 帧 / 801ms / 58.7fps，并断言请求 `mjpeg` / `data-url` fallback。
- 语法检查、空白检查和冲突标记搜索通过。
遗留问题：当前没有伪造真实可解码 H.264 码流；需要 Windows 端 ffmpeg-h264 host 推出后，用真实 `codec=h264` 帧验证 canvas 解码、延迟和失败回退。
下一步建议：Windows 端推送 ffmpeg-h264 后，Mac 端用 `test-mac-client-browser.mjs --useExistingHost --host <Windows IP> --port <端口> --observeVideoMs <毫秒> --minObservedVideoFrames <帧数>` 做真实 H.264 canvas 验收，并记录是否需要 `--requireH264` 类强校验参数。
是否改了协议：否，只使用既有 `preferredVideoCodec`、`preferredVideoEncoding` 和 H.264 `video_frame` 过渡字段。
是否需要另一端配合：暂不需要；真实 H.264 canvas 验收需要 Windows 端启动 ffmpeg-h264 host。

## 2026-06-13 Mac Codex

日期：2026-06-13 13:55
开发端：Mac Codex
本轮目标：让 Mac 控制 Windows 时的视频状态能显示真实 `video_frame.timestamp` 到达新鲜度，方便排查画面延迟或两端时钟偏差。
完成内容：
- Mac client 收到 `video_frame.timestamp` 后会估算帧到达本机时的新鲜度。
- 顶部视频状态和会话诊断“视频流”行都会显示 `到达 <ms>`；如果对端时间戳明显来自未来，会显示 `时钟偏差`。
- `test-mac-client-browser.mjs` 会从最后一条 `video_frame.timestamp` 计算 frame age，并在对端提供 timestamp 时断言视频状态和诊断行都显示到达年龄或时钟偏差。
- Mac client README 已同步该自检行为。
修改文件：
- `apps/mac-client/app.js`
- `apps/mac-client/README.md`
- `scripts/windows/test-mac-client-browser.mjs`
验证方式：
- `node --check apps/mac-client/app.js`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --observeVideoMs 1000 --minObservedVideoFrames 5 --minObservedVideoFps 5 --skipFileClipboard`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 页面级自检通过；输出包含顶部视频状态 `到达 1 ms`，诊断行 `到达 1 ms`，短窗口观察 59 帧 / 1002ms / 58.9fps。
- 语法检查、空白检查和冲突标记搜索通过。
遗留问题：真实 Windows host 的 60Hz 观感、FFmpeg/WGC 采集延迟和跨机时钟偏差仍需后续真机联调确认。
下一步建议：Windows 端启动真实 host 后，Mac 端用 `test-mac-client-browser.mjs --useExistingHost --observeVideoMs <毫秒> --minObservedVideoFrames <帧数> --minObservedVideoFps <FPS>` 继续看首帧、实收 FPS 和页面显示的 video frame age。
是否改了协议：否，只消费已有可选 `video_frame.timestamp`。
是否需要另一端配合：暂不需要；后续真实 Windows host 画面延迟验收需要 Windows 端启动 host 配合。

## 2026-06-13 Mac Codex

日期：2026-06-13 13:05
开发端：Mac Codex
本轮目标：让 Mac 控制 Windows 时的音频状态能显示真实 `audio_frame.timestamp` 到达新鲜度，方便排查音频延迟。
完成内容：
- Mac client 收到 `audio_frame.timestamp` 后会估算帧到达本机时的新鲜度。
- 顶部音频状态、音频播放状态和会话诊断音频行都会显示 `到达 <ms>`；如果对端时间戳明显来自未来，会显示 `时钟偏差`。
- `test-mac-client-browser.mjs` 会从最后一条 `audio_frame.timestamp` 计算 frame age，并断言页面音频状态、播放状态和诊断行均显示到达年龄或时钟偏差。
- Mac client README 已同步该自检行为。
修改文件：
- `apps/mac-client/app.js`
- `apps/mac-client/README.md`
- `scripts/windows/test-mac-client-browser.mjs`
验证方式：
- `node --check apps/mac-client/app.js`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --enableAudio --expectAudioFrame --observeVideoMs 1000 --minObservedVideoFrames 5 --minObservedVideoFps 5 --skipFileClipboard`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 页面级自检通过；输出包含顶部音频状态 `到达 0 ms`，播放状态 `到达 0 ms`，诊断行 `frameAge=33ms`。
- 语法检查、空白检查和冲突标记搜索通过。
遗留问题：真实 Windows WASAPI host 的听感、系统音量变化和长时间播放体验仍需后续真机联调确认。
下一步建议：Windows 端启动真实 WASAPI host 后，Mac 端用 `test-mac-client-browser.mjs --useExistingHost --enableAudio --expectAudioPayload --expectAudioPlayback` 继续看音频首帧、播放计数和页面显示的 frame age。
是否改了协议：否，只消费已有可选 `audio_frame.timestamp`。
是否需要另一端配合：暂不需要；后续真实 Windows WASAPI 听感验收需要 Windows 端启动 host 配合。

## 2026-06-13 Windows Codex

日期：2026-06-13 13:34
开发端：Windows Codex
本轮目标：给 Windows host 打通显式 WGC screenMode 入口和可验证降级诊断，为后续真实 WGC 采集 backend 接入做前置。
完成内容：
- Windows host 现在识别 `LAN_DUAL_WINDOWS_SCREEN_MODE=wgc`，并在 `/discovery.capabilities.screen.requestedMode`、`screen.wgc`、`session_answer.requestedScreenMode`、`wgcFallbackReason` 和 `video_frame.requestedScreenMode` 中暴露请求状态。
- 当前不会伪装成真正 WGC 采集：`screen.wgc.backendImplemented=false`，预检通过时也会明确说明 WGC backend 尚未实装并降级到 FFmpeg/System.Drawing/mock。
- `check-windows-wgc-support.mjs` 的 WMI OS/GPU 详情读取失败现在只作为 note，不再让 WGC WinRT 预检整体失败。
- `start-windows-host.mjs`、`start-windows-host.ps1`、`observe-windows-host-video.mjs`、`observe-windows-host-media.mjs` 已接受/记录 `wgc` 模式；视频观察脚本支持 `--minFps 0` 用于诊断-only fallback 检查。
- Windows host README、CURRENT_STATUS、NEXT_ACTIONS 和 ACTIVE_LOCKS 已同步 WGC 入口状态。
修改文件：
- `apps/windows-host/src/windows-screen-capture.mjs`
- `apps/windows-host/src/windows-host-service.mjs`
- `scripts/windows/check-windows-wgc-support.mjs`
- `scripts/windows/observe-windows-host-video.mjs`
- `scripts/windows/observe-windows-host-media.mjs`
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/test-windows-wgc-mode.mjs`
- `apps/windows-host/README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
验证方式：
- `node --check scripts/windows/check-windows-wgc-support.mjs`
- `node scripts/windows/check-windows-wgc-support.mjs --json`
- `node scripts/windows/check-windows-wgc-support.mjs --requireSupported`
- `npm.cmd run check` in `apps/windows-host`
- `node scripts/windows/test-windows-wgc-mode.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-wgc-support.mjs --script observe-windows-host-video.mjs --script observe-windows-host-media.mjs --script start-windows-host.mjs`
- `node scripts/windows/test-windows-script-help.mjs`
- `node scripts/windows/start-windows-host.mjs --screenMode wgc --password test-password --requirePassword --dryRun`
- `$env:LAN_DUAL_PASSWORD='test-password'; powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-windows-host.ps1 -ScreenMode wgc -RequirePassword -DryRun`
- `node scripts/windows/observe-windows-host-video.mjs --screenMode wgc --requireRealVideo false --durationMs 6500 --minFrames 1 --minFps 0 --maxGapMs 7000 --resourceSample false --json`
验证结果：
- 独立 WGC 预检通过，OS/GPU/WGC IsSupported 权限或服务问题以 notes 输出，不再阻塞 requiredTypes 判断。
- 新增 WGC 模式入口回归通过；全量 Windows 脚本 help 覆盖更新为 18 个脚本 / 36 条命令。
- `--screenMode wgc` 观察输出 `requestedMode=wgc`、`screen.wgc.supported=true`、`backendImplemented=false`、`wgcFallbackReason=Windows Graphics Capture backend is not implemented yet (preflight passed); using FFmpeg gdigrab fallback`。
- 当前桌面会话里的 FFmpeg/GDI 仍回退 mock，观察脚本按预期输出 `FFmpeg did not produce a JPEG frame within 5000 ms; System.Drawing CopyFromScreen fallback failed`。
遗留问题：
- 真实 WGC 帧采集 backend 尚未实装；本轮只打通显式模式入口、诊断和降级路径。
下一步建议：
- 新增真正的 WGC capture backend 时，复用现在的 `requestedMode=wgc` 和 `screen.wgc` 诊断字段，把 `backendImplemented/active` 切为 true，并用同一观察脚本对照 FFmpeg 60Hz/资源基线。
是否改了协议：否；只新增向后兼容的可选诊断字段。
是否需要另一端配合：暂不需要；后续真实 Mac 反控 Windows 体验验收时需要 Mac client 连接 Windows host。

## 2026-06-13 Windows Codex

日期：2026-06-13 13:19
开发端：Windows Codex
本轮目标：补强 Windows 视频观察脚本的 fallback 诊断，方便定位 FFmpeg gdigrab error 5、GDI 兜底失败和 mock 回退。
完成内容：
- `observe-windows-host-video.mjs` 现在会把 `video_frame.streamFallbackReason` / `fallbackReason` 以及 `/discovery.capabilities.screen.lastCaptureError` 带进真实视频失败错误信息。
- 视频观察 JSON 汇总新增 `observation.fallbackReasons`，文本输出在观察到 fallback reason 时打印 `Fallback reason`。
- fallback reason 会合并空白并压缩常见 `FFmpeg did not produce a JPEG frame` + `CopyFromScreen` 失败堆栈，避免错误信息被 PowerShell 堆栈或编码噪声淹没。
- Windows host README 已说明遇到 `windows-ffmpeg-gdigrab-fallback-mock` 时优先查看 fallback reason，并记录 13:09 曾短暂恢复、13:18 又复现 fallback 的现状。
修改文件：
- `scripts/windows/observe-windows-host-video.mjs`
- `apps/windows-host/README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/observe-windows-host-video.mjs`
- `node scripts/windows/observe-windows-host-video.mjs --screenMode mock --requireRealVideo false --durationMs 1000 --minFrames 5 --minFps 3 --maxGapMs 1000 --resourceSample false --json`
- `node scripts/windows/test-windows-script-help.mjs --script observe-windows-host-video.mjs`
- `node scripts/windows/observe-windows-host-video.mjs --fps 60 --useDefaultMaxScreenFps --expectSessionFps 60 --durationMs 1000 --minFrames 5 --minFps 3 --maxGapMs 1000 --maxFrameAgeMs 1000 --requireMonotonicTimestamp --resourceSample false`
验证结果：
- 语法和单脚本帮助覆盖通过。
- mock JSON 路径通过，输出 `observation.fallbackReasons` 数组。
- 真实 FFmpeg 60Hz 短复测在当前桌面会话再次回退到 mock，失败信息已带出清晰原因：`reason=FFmpeg did not produce a JPEG frame within 5000 ms; System.Drawing CopyFromScreen fallback failed`。
遗留问题：
- 本轮没有修复 gdigrab 本身的偶发 `error 5` / 捕获失败；只是让复现时错误更可读。WGC 替换仍是更正方向。
下一步建议：
- 若媒体汇总脚本再次遇到 mock fallback，先查看子视频观察输出里的 `reason=` 或 JSON `fallbackReasons`，再决定是复测桌面捕获、切 System.Drawing 兜底，还是推进 WGC。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-13 Windows Codex

日期：2026-06-13 13:05
开发端：Windows Codex
本轮目标：新增 Windows host 视频+音频顺序媒体基线入口，避免并发临时 host 互相影响，并为后续 WGC/正式编码管线提供统一对照报告。
完成内容：
- 新增 `scripts/windows/observe-windows-host-media.mjs`，默认先跑 720p/60Hz 视频观察，再跑 WASAPI 音频观察，最后输出统一 JSON/文本报告。
- 媒体汇总脚本复用现有 `observe-windows-host-video.mjs` 和 `observe-windows-host-audio.mjs`，默认要求真实视频帧、帧时间戳新鲜度和 timestamp 单调性；视频临时捕获失败时默认重试一次，但最终仍不会把 mock fallback 算作通过。
- 支持 `--skipVideo` / `--skipAudio` 单独跑一条链路，`--resourceSampleTree true` 可把视频和音频观察都切到进程树资源采样，`--debugCommands` 可打印子观察命令方便复现。
- Windows host README、当前状态、下一步和任务板已同步新入口、帮助覆盖数量和本轮本机现象。
修改文件：
- `scripts/windows/observe-windows-host-media.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/observe-windows-host-media.mjs`
- `node scripts/windows/observe-windows-host-media.mjs --help`
- `node scripts/windows/test-windows-script-help.mjs --script observe-windows-host-media.mjs`
- `node scripts/windows/observe-windows-host-media.mjs --skipVideo --audioDurationMs 3500 --audioMinFrames 100 --audioMinFps 35 --resourceSampleIntervalMs 500 --json`
- `node scripts/windows/observe-windows-host-media.mjs --skipAudio --videoDurationMs 1200 --videoMinFrames 10 --videoMinFps 5 --resourceSample false`
- `node scripts/windows/observe-windows-host-media.mjs --videoDurationMs 2500 --videoMinFrames 60 --videoMinFps 20 --audioDurationMs 2500 --audioMinFrames 70 --audioMinFps 35 --resourceSampleIntervalMs 500 --json`
- `C:\DevTools\ffmpeg\bin\ffmpeg.exe -hide_banner -loglevel error -f gdigrab -framerate 1 -offset_x 0 -offset_y 0 -video_size 640x360 -i desktop -frames:v 1 -f null -`
验证结果：
- 语法检查通过。
- 新脚本 `--help/-h` 纯帮助覆盖通过；全量 Windows 帮助覆盖已验证为 17 个脚本、34 条命令。
- 音频顺序路径通过：3.5 秒收到 133 帧，稳态 49.94 FPS，最大间隔 43ms，首帧约 877ms，payload 7680 bytes，帧年龄最大 13ms，timestamp 单调。
- 当前桌面会话的 FFmpeg gdigrab 视频路径不稳定：媒体汇总视频阶段和单独完整视频命令均多次回退到 `windows-ffmpeg-gdigrab-fallback-mock`；直跑 FFmpeg gdigrab 也出现 `Failed to capture image (error 5)`。较短的一次单独视频观察曾通过 64 帧/53.26 FPS/最大间隔 39ms，但随后同会话复测又回退。
遗留问题：
- 本轮没有把真实视频失败放宽为通过；当前环境需要在桌面捕获恢复稳定后复测媒体汇总完整默认路径。
- FFmpeg gdigrab `error 5` 进一步说明当前过渡采集层不够可靠，WGC 采集替换仍是高优先级。
- 资源采样短窗口样本少时 CPU 数值只能作参考；需要正式对照时保持 `--resourceSampleTree true` 和足够长的观察窗口。
下一步建议：
- 先复测 `node scripts/windows/observe-windows-host-media.mjs --resourceSampleTree true --json`，确认视频+音频完整顺序路径恢复。
- 如果 FFmpeg gdigrab 仍持续 error 5，优先推进 Windows Graphics Capture backend，而不是继续堆 FFmpeg 过渡层补丁。
- Mac 反控 Windows 真实体验时，优先使用媒体汇总脚本或 `--useExisting` 的视频/音频观察脚本记录同口径基线。
是否改了协议：否。
是否需要另一端配合：暂不需要；真实 Mac 反控 Windows 体验验收时需要 Mac 端连接 Windows host。

## 2026-06-13 Windows Codex

日期：2026-06-13 12:30
开发端：Windows Codex
本轮目标：给 Windows host 视频/音频观察脚本补本机资源采样，方便后续 WGC/正式编码管线和现有 FFmpeg/WASAPI 基线做 A/B 对照。
完成内容：
- 新增 `scripts/windows/lib/process-resource-sampler.mjs`，在 Windows 本机用只读 PowerShell 采样目标 PID 的 CPU、工作集、私有内存、句柄、线程和进程名。
- `observe-windows-host-video.mjs` 和 `observe-windows-host-audio.mjs` 现在会在收到首帧后启动资源采样；默认只采 Windows host 主进程，避免干扰采集启动，需要把 FFmpeg/PowerShell 子进程纳入总资源时显式加 `--resourceSampleTree true`。
- 两个观察脚本 JSON 输出新增 `resource` 摘要，文本输出也会显示 CPU 和内存摘要；可用 `--resourceSample false` 关闭。
- Windows host README、当前状态、下一步和任务板已同步资源采样用法和本机对照数据。
修改文件：
- `scripts/windows/lib/process-resource-sampler.mjs`
- `scripts/windows/observe-windows-host-video.mjs`
- `scripts/windows/observe-windows-host-audio.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/lib/process-resource-sampler.mjs`
- `node --check scripts/windows/observe-windows-host-video.mjs`
- `node --check scripts/windows/observe-windows-host-audio.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script observe-windows-host-video.mjs --script observe-windows-host-audio.mjs`
- `node scripts/windows/observe-windows-host-video.mjs --durationMs 2500 --minFrames 20 --minFps 8 --maxGapMs 1000 --maxFrameAgeMs 1000 --requireMonotonicTimestamp --resourceSampleIntervalMs 500 --json`
- `node scripts/windows/observe-windows-host-video.mjs --durationMs 2500 --minFrames 20 --minFps 8 --maxGapMs 1000 --maxFrameAgeMs 1000 --requireMonotonicTimestamp --resourceSampleIntervalMs 500 --resourceSampleTree true --json`
- `node scripts/windows/observe-windows-host-video.mjs --fps 60 --useDefaultMaxScreenFps --expectSessionFps 60 --durationMs 4000 --minFrames 140 --minFps 35 --maxGapMs 1000 --maxFrameAgeMs 1000 --requireMonotonicTimestamp --resourceSampleIntervalMs 500 --resourceSampleTree true --json`
- `node scripts/windows/observe-windows-host-audio.mjs --durationMs 5000 --minFrames 20 --minFps 3 --maxGapMs 2000 --requirePcm false --audioMode mock --resourceSampleIntervalMs 500 --json`
- `node scripts/windows/check-windows-audio-devices.mjs --json`
- `node scripts/windows/observe-windows-host-audio.mjs --durationMs 3500 --minFrames 80 --minFps 30 --maxGapMs 1000 --maxFrameAgeMs 1000 --requireMonotonicTimestamp --resourceSampleIntervalMs 500 --json`
验证结果：
- 语法检查和两个观察脚本帮助入口覆盖通过。
- 视频主进程资源短测通过：2.5 秒 73 帧、28.95 FPS、最大帧间隔 48ms、帧年龄最大 0ms；资源摘要 `node` 主进程 CPU 平均/峰值 0.1/0.1%，工作集峰值 58.3 MiB。
- 视频进程树短测通过：2.5 秒 73 帧、28.84 FPS、最大帧间隔 47ms、帧年龄最大 2ms；进程树包含 `node`、`conhost`、`ffmpeg`，CPU 平均/峰值 0.8/0.8%，工作集峰值 308.7 MiB。
- 60Hz 资源对照通过：4 秒 198 帧、49.49 FPS、最大帧间隔 43ms、`dropped=35`、帧年龄最大 1ms；进程树 CPU 平均/峰值 4.5/5.4%，工作集平均/峰值 308.4/309.3 MiB，私有内存平均/峰值 437.2/440.9 MiB。
- 音频 mock 资源路径通过：5 秒 21 帧、稳态 4.01 FPS，主进程工作集峰值 56 MiB。
- WASAPI 只读设备检查通过；真实 WASAPI 资源短测通过：3.5 秒 135 帧、稳态 49.72 FPS、最大间隔 32ms、首帧约 841ms、payload 7680 bytes、帧年龄最大 0ms；主进程工作集峰值 62.5 MiB。
遗留问题：
- 默认资源采样只统计 Windows host 主进程；要把 FFmpeg 子进程纳入资源总账，必须显式加 `--resourceSampleTree true`。
- 资源采样当前统计 CPU/内存/句柄/线程，没有 GPU 占用；后续 WGC 实装时如需 GPU 对照，要另接 GPU 计数器或 ETW/PresentMon 类工具。
- 并发同时启动视频/音频观察时曾出现临时采集回退/音频超时；顺序复测均通过，后续自动化最好避免多个临时 host 同时抢 43772 和桌面/音频采集。
下一步建议：
- 实装 WGC backend 前，先用 `observe-windows-host-video --fps 60 ... --resourceSampleTree true --json` 记录当前 FFmpeg 对照；WGC 完成后用同命令比较 FPS、最大间隔、帧年龄、码率/画质和 CPU/内存。
- 如果要看真实 Mac 反控 Windows 听感，Mac 端连接时 Windows 端可并行跑 `observe-windows-host-audio --useExisting --resourceSampleTree true` 记录资源和音频帧状态。
是否改了协议：否。
是否需要另一端配合：暂不需要；后续 WGC/反控体验验收需要 Mac 端配合真实连接。

## 2026-06-13 Windows Codex

日期：2026-06-13 03:20
开发端：Windows Codex
本轮目标：为后续 Windows Graphics Capture 采集升级增加只读支持预检，并接入 Windows host readiness。
完成内容：
- 新增 `scripts/windows/check-windows-wgc-support.mjs`，只读检查 Windows build、WGC WinRT 类型、`GraphicsCaptureSession.IsSupported()`、硬件 GPU 和虚拟显示适配器。
- `check-windows-host-readiness.mjs` 默认加入 “Windows Graphics Capture preflight” 步骤；默认只是信息项，`--requireWgc` 可显式强制失败。
- Windows host README、当前状态、下一步和任务板已同步，明确 WGC 目前只是预检通过，尚未替换 FFmpeg gdigrab 采集管线。
- Windows `.mjs` 帮助覆盖自检自动包含新脚本，当前覆盖提升到 16 个脚本、32 条 `--help/-h` 命令。
修改文件：
- `scripts/windows/check-windows-wgc-support.mjs`
- `scripts/windows/check-windows-host-readiness.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-wgc-support.mjs`
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node scripts/windows/check-windows-wgc-support.mjs --json`
- `node scripts/windows/check-windows-wgc-support.mjs --requireSupported`
- `node scripts/windows/check-windows-host-readiness.mjs --help`
- `node scripts/windows/check-windows-host-readiness.mjs --json`
- `node scripts/windows/check-windows-host-readiness.mjs --requireWgc --json`
- `node scripts/windows/test-windows-script-help.mjs`
- `git diff --check`
验证结果：
- 本机 WGC 预检通过：Windows 11 build `26200`，WGC WinRT 类型齐全，`GraphicsCaptureSession.IsSupported()` 为 `true`，检测到 2 个硬件 GPU 和 5 个虚拟显示适配器。
- 默认 readiness 新增 WGC preflight 后仍保持低风险通过；`--requireWgc` 在本机通过。
- 帮助覆盖自检通过，16 个脚本、32 条帮助命令全部 0 退出。
遗留问题：
- WGC 尚未实装为采集 backend，Windows host 仍默认使用 FFmpeg gdigrab MJPEG + System.Drawing 兜底。
- 后续实现 WGC/编码 helper 时，需要用当前 FFmpeg 60 Hz 基线做 A/B 对照。
下一步建议：
- 白天继续前先打开 Agent Link Board，和 Mac Codex 互通下一步。
- 下一轮可先设计 WGC 原生 helper 的最小形态：枚举显示器/启动捕获/输出帧时间戳和编码前统计，先作为显式实验模式，不替换默认 FFmpeg。
是否改了协议：否。
是否需要另一端配合：暂不需要；后续真实 Mac client 反控 Windows 体验验收需要 Mac 端配合。

## 2026-06-13 Windows Codex

日期：2026-06-13 03:00
开发端：Windows Codex
本轮目标：补一条 Windows host 现有视频/音频链路基线，给后续 Windows Graphics Capture 和音频体验优化做对照。
完成内容：
- 只读运行 Windows host 60Hz 视频观察，记录 FFmpeg gdigrab 过渡层当前表现。
- 只读运行 Windows host WASAPI 30 秒音频观察，记录系统声音采集当前稳态表现。
- Windows host README、当前状态和下一步文档已同步基线数据。
修改文件：
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node scripts/windows/observe-windows-host-video.mjs --fps 60 --useDefaultMaxScreenFps --expectSessionFps 60 --durationMs 4000 --minFrames 140 --minFps 35 --requireMonotonicTimestamp --maxFrameAgeMs 1000`
- `node scripts/windows/observe-windows-host-audio.mjs --durationMs 30000 --minFrames 1200 --minFps 40 --maxGapMs 1000 --maxFrameAgeMs 1000 --requireMonotonicTimestamp`
验证结果：
- 视频：4 秒 230 帧，57.1 FPS，最大帧间隔 41 ms，`dropped=4`，`video_frame.timestamp` 接收年龄 min/avg/max `0/0/1 ms`，timestamp 单调，pipeline=`windows-ffmpeg-gdigrab-mjpeg`。
- 音频：30 秒 1482 帧，稳态 49.98 FPS，最大帧间隔 33 ms，首帧约 395 ms，payload 恒定 7680 bytes，`audio_frame.timestamp` 接收年龄 min/avg/max `0/0/1 ms`，timestamp 单调；本次无人值守未播放测试音，系统电平为 0。
遗留问题：视频仍是 FFmpeg gdigrab + MJPEG 过渡层；后续升级 Windows Graphics Capture 时需要用同一观察脚本对比帧率、最大间隔、帧年龄、码率和资源占用。
下一步建议：做 Windows Graphics Capture 前先记录 CPU/GPU/带宽占用；实现后用同样命令做 A/B 对比，再让 Mac client 做真实反控体验验收。
是否改了协议：否。
是否需要另一端配合：否，后续真实 Mac 反控 Windows 体验验收需要 Mac 端配合。

## 2026-06-13 Windows Codex

日期：2026-06-13 02:49
开发端：Windows Codex
本轮目标：让 Windows 控制端直接显示真实视频帧到达新鲜度，辅助排查卡顿和“看起来不像 60Hz”。
完成内容：
- 顶部指标从“延迟”改为“帧延迟”，不再用随机模拟数值。
- 普通 JPEG/data-url 和 H.264 视频帧都会读取 `video_frame.timestamp`，估算远端帧到达本机时的新鲜度，并同步显示在诊断条里。
- 如果被控端暂未提供真实帧时间戳，帧延迟保持等待；如果两端系统时钟明显不一致，会显示“时钟偏差”并把诊断条标为 warning。
- `test-windows-client-browser.mjs --diagnosticsOnly` 新增页面级回归，覆盖正常帧年龄显示和未来时间戳的时钟偏差提示。
- Windows client README、当前状态、下一步和任务板已同步。
修改文件：
- `apps/windows-client/index.html`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly`
- `git diff --check`
验证结果：
- 语法检查通过。
- diagnosticsOnly 页面自检通过，新增输出 `Video frame age diagnostics: 123ms / 时钟偏差`。
- 空白检查通过。
遗留问题：真实 Mac H.264/JPEG 长时间连接下仍需继续观察实际“帧延迟”和“实收 FPS”的组合表现。
下一步建议：真实 Mac 联调时同时看实收 FPS、帧延迟、H.264 解码状态和 Mac host 自身观察脚本，定位卡顿发生在采集/编码/网络/解码哪一段。
是否改了协议：否。
是否需要另一端配合：后续真实 Mac 端配合长时间 H.264/JPEG 观察。

## 2026-06-13 Windows Codex

日期：2026-06-13 02:27
开发端：Windows Codex
本轮目标：修正旧 Windows 脚本 `-h` 短帮助被忽略的问题，并把帮助入口覆盖做成统一回归。
完成内容：
- `check-windows-host-readiness.mjs`、`start-windows-host.mjs` 和 `test-windows-host-start-helper.mjs` 现在能在解析参数时正确识别单横线 `-h`，不会继续进入体检、启动或自测路径。
- 上述三个脚本的帮助文本补充 `--help, -h` 说明。
- 新增 `scripts/windows/test-windows-script-help.mjs`，统一验证 `scripts/windows/*.mjs` 的 `--help` 和 `-h` 都能快速 0 退出并输出 Usage/Options 风格帮助。
- Windows host README、当前状态、任务板和文件占用记录已同步。
修改文件：
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `scripts/windows/test-windows-script-help.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-windows-script-help.mjs`
- `node scripts/windows/test-windows-script-help.mjs --help`
- `node scripts/windows/test-windows-script-help.mjs --script start-windows-host.mjs`
- `node scripts/windows/test-windows-script-help.mjs`
验证结果：
- 新脚本语法检查通过，帮助文本正常。
- 单脚本覆盖确认 `start-windows-host.mjs --help` 和 `-h` 均通过。
- 全量覆盖通过：15 个 Windows `.mjs` 脚本、30 条帮助命令全部 0 退出并快速返回；覆盖包含 `check-windows-host-readiness.mjs -h`、`start-windows-host.mjs -h` 和 `test-windows-host-start-helper.mjs -h`。
遗留问题：无。
下一步建议：后续新增或修改 Windows `.mjs` 工具脚本时，把 `node scripts/windows/test-windows-script-help.mjs` 纳入轻量回归，防止帮助入口退化。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-13 Windows Codex

日期：2026-06-13 02:19
开发端：Windows Codex
本轮目标：补齐 Windows 常用检查/回归脚本的 `--help/-h` 纯帮助入口，避免查参数时误触发探测或临时服务。
完成内容：
- `check-windows-audio-devices.mjs` 新增帮助文本，`--help/-h` 时不会列设备、查询 WASAPI 或采集声音。
- `check-windows-firewall.mjs` 新增帮助文本，`--help/-h` 时不会探测端口、查询防火墙或生成规则动作。
- `test-auth-retry-policy.mjs` 新增帮助文本，`--help/-h` 时不会启动临时 Windows host 或假 Mac 服务。
- `test-coordinate-mapping.mjs` 主体包成 `run()`，`--help/-h` 时只打印说明，不运行坐标断言。
- `test-windows-input-helper.mjs` 新增帮助文本，`--help/-h` 时不会创建 input injector 或启动 helper。
- Windows host/client README、当前状态和任务板已同步这些安全帮助入口。
修改文件：
- `scripts/windows/check-windows-audio-devices.mjs`
- `scripts/windows/check-windows-firewall.mjs`
- `scripts/windows/test-auth-retry-policy.mjs`
- `scripts/windows/test-coordinate-mapping.mjs`
- `scripts/windows/test-windows-input-helper.mjs`
- `apps/windows-host/README.md`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check` 五个改动脚本。
- 五个脚本分别运行 `--help` 和 `-h`。
- `node scripts/windows/test-coordinate-mapping.mjs`
- `node scripts/windows/test-windows-input-helper.mjs`
- `node scripts/windows/check-windows-firewall.mjs --skipFirewall --json`
- `node scripts/windows/check-windows-audio-devices.mjs --json`
- `node scripts/windows/test-auth-retry-policy.mjs`
验证结果：
- 语法检查全部通过。
- `--help/-h` 全部 exit code 0，且只打印帮助文本。
- 坐标映射回归通过；input helper 安全干跑通过且没有发送真实输入。
- 防火墙只读 JSON 路径通过；当前 43770 未监听只产生预期 warning。
- 音频设备 JSON 路径通过，列出 4 个音频设备，WASAPI 格式检查通过。
- 认证重试策略回归通过，Windows host 和假 Mac 都保持 3 次错误密码断开、新连接正确密码通过。
遗留问题：无。
下一步建议：如果后续新增 Windows 脚本，默认也按这个模式提供 `--help/-h`，避免查参数时误启动服务或系统动作。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-13 Windows Codex

日期：2026-06-13 02:09
开发端：Windows Codex
本轮目标：把 Windows 控制端 readiness 输出头显示固化进页面自检。
完成内容：
- `scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly` 的桌面壳面板检查现在会调用 `readinessLines`，断言输出包含 current build、视频 frame age 阈值、音频 frame age 阈值和视频观察项。
修改文件：
- `scripts/windows/test-windows-client-browser.mjs`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly`
验证结果：
- 语法检查通过。
- diagnosticsOnly 页面自检通过，新的 readiness 输出头断言已随 `Desktop-only host panel` 检查执行。
遗留问题：无。
下一步建议：后续 Windows client readiness UI 改动继续跑 diagnosticsOnly，避免输出头退化。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-13 Windows Codex

日期：2026-06-13 02:04
开发端：Windows Codex
本轮目标：让 Windows 控制端“本机被控”体检结果直接显示 readiness 帧新鲜度阈值。
完成内容：
- Windows 控制端 `readinessLines` 输出顶部新增体检档位、当前代码 build、视频帧新鲜度阈值和音频帧新鲜度阈值。
- Windows 控制端 README 已说明桌面版本机被控面板会显示体检帧新鲜度阈值。
修改文件：
- `apps/windows-client/app.js`
- `apps/windows-client/README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly`
- 临时 Edge/CDP 浏览器评估：调用 `readinessLines` 模拟 deploy 结果，确认输出包含 build、视频/音频 frame age 阈值和观察项。
验证结果：
- 语法检查通过。
- diagnosticsOnly 页面自检通过。
- 临时浏览器评估通过：输出 `体检档位：部署 | 当前代码：abc1234 | 视频帧新鲜度阈值：1000 ms | 音频帧新鲜度阈值：750 ms`。
遗留问题：
- 页面自检脚本本轮未改，因为 Mac 端正在处理 `scripts/windows/test-windows-client-browser.mjs` 的 `--help` 入口；等其落库后可再补一个正式断言。
下一步建议：
- Mac 端 help 线落库后，Windows 端可以补 `test-windows-client-browser --diagnosticsOnly` 对 readiness 输出头的固定断言。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-13 Windows Codex

日期：2026-06-13 01:55
开发端：Windows Codex
本轮目标：同步 Windows 桌面壳 README 的本机被控体检说明。
完成内容：
- `apps/windows-desktop/README.md` 现在明确说明部署档会跑带帧新鲜度和 timestamp 单调性强校验的视频/音频短观察。
修改文件：
- `apps/windows-desktop/README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `git diff --check`
- 冲突标记搜索
验证结果：
- 文档检查通过，无冲突标记。
遗留问题：无。
下一步建议：无；这是上一轮 readiness 增强的文档补齐。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-13 Windows Codex

日期：2026-06-13 01:52
开发端：Windows Codex
本轮目标：把 Windows host 视频/音频帧新鲜度强校验接入一键 readiness，减少部署前漏测卡顿或旧帧的概率。
完成内容：
- `scripts/windows/check-windows-host-readiness.mjs` 新增 `--maxVideoFrameAgeMs` / `--maxAudioFrameAgeMs`，默认都是 `1000`，设为 `0` 可临时关闭对应年龄阈值。
- readiness 的 `--probeVideo` / `--probeAudio` 现在会把 `--maxFrameAgeMs` 和 `--requireMonotonicTimestamp` 传给观察脚本；`--profile deploy` / `--profile deep` 也自动继承这套强校验。
- Windows host README、当前状态、下一步和文件占用记录已同步。
修改文件：
- `scripts/windows/check-windows-host-readiness.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node scripts/windows/check-windows-host-readiness.mjs --help`
- `node scripts/windows/check-windows-host-readiness.mjs --probeVideo --probeAudio --json`
验证结果：
- 帮助文本已显示 `--maxVideoFrameAgeMs` / `--maxAudioFrameAgeMs`。
- readiness probe 通过：9/9 checks passed；视频观察和 WASAPI 音频观察均通过；当前没有常驻 43770 host，因此端口/防火墙项只给 warning，默认低风险模式仍通过。
遗留问题：
- 尚未在桌面 UI 面板单独暴露这两个阈值；当前桌面部署档使用 readiness 默认 1000ms。
下一步建议：
- 等真实 Mac 反控 Windows 时，用桌面部署档或 `--profile deploy` 做一次常驻 host 验收，确认当前 build、端口、防火墙、视频和 WASAPI 音频都一次通过。
是否改了协议：否。
是否需要另一端配合：不阻塞；真实 Mac 反控 Windows 前可让 Mac 端配合跑一次部署档验收。

## 2026-06-13 Windows Codex

日期：2026-06-13 01:45
开发端：Windows Codex
本轮目标：补齐 Windows host 音频观察脚本的纯帮助入口，避免查看参数时误启动临时 host。
完成内容：
- `scripts/windows/observe-windows-host-audio.mjs` 新增 `--help/-h`，只打印用法并退出。
- 帮助内容覆盖连接、WASAPI/DirectShow/mock 音频、稳态帧率、帧新鲜度、测试音和电平强校验等常用参数。
- Windows host README 已补充音频观察脚本的 `--help` 查看参数命令。
修改文件：
- `scripts/windows/observe-windows-host-audio.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/observe-windows-host-audio.mjs`
- `node scripts/windows/observe-windows-host-audio.mjs --help`
- `node scripts/windows/observe-windows-host-audio.mjs --durationMs 2500 --minFrames 80 --minFps 40 --maxGapMs 1000 --maxFrameAgeMs 1000 --requireMonotonicTimestamp --json`
验证结果：
- `--help` 返回 exit code 0，只打印帮助文本，未启动临时 Windows host。
- WASAPI 短观察通过：收到 105 帧，稳态 100 帧约 49.88 FPS，最大间隔 33ms，稳态 `frameAge max=1ms`，timestamp 单调。
遗留问题：无。
下一步建议：可以继续把音频/视频观察脚本的新鲜度强校验接入 readiness deploy 档位，或做更长时间 WASAPI 长稳。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-13 Windows Codex

日期：2026-06-13
开发端：Windows Codex
本轮目标：增强 Windows host 音频观察脚本，让 Mac 反控 Windows 前能量化音频帧新鲜度和 timestamp 单调性。
完成内容：
- `scripts/windows/observe-windows-host-audio.mjs` 现在会解析每个 `audio_frame.timestamp`，统计接收年龄 min/avg/max。
- 新增 `--maxFrameAgeMs <ms>`，按稳态帧接收年龄做强校验；新增 `--requireMonotonicTimestamp`，要求音频帧 timestamp 单调。
- JSON 输出的 `observation` 和 `observation.steady` 新增 `timestampFrameCount`、`minFrameAgeMs`、`avgFrameAgeMs`、`maxFrameAgeMs`、`timestampMonotonic` 和 `timestampMonotonicViolations`。
- Windows host README、当前状态、下一步和任务板已同步。
修改文件：
- `scripts/windows/observe-windows-host-audio.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/observe-windows-host-audio.mjs`
- `node scripts/windows/observe-windows-host-audio.mjs --durationMs 2500 --minFrames 80 --minFps 40 --maxGapMs 1000 --maxFrameAgeMs 1000 --requireMonotonicTimestamp --json`
- 临时内存假 host 故意发送倒退的 `audio_frame.timestamp`，再运行 `observe-windows-host-audio --requireMonotonicTimestamp --json`。
验证结果：
- 正向 WASAPI 观察通过：临时 Windows host `127.0.0.1:43772`，收到 108 帧，稳态 103 帧约 50.01 FPS，最大间隔 32ms，稳态 `frameAge min/avg/max = 0/0/1ms`，timestamp 单调。
- 负向单调性按预期失败：临时假 host 返回 exit code 1，错误为 `timestamp monotonic violations 9`。
遗留问题：
- 当前 `audio_frame.timestamp` 是 host 发送时刻，不是 WASAPI 采集设备的硬件时间线；后续如果需要测真实端到端音频延迟，还要引入采集侧 timestamp 或播放端回声/电平对齐方案。
下一步建议：
- Windows 端做 60 秒以上 WASAPI 长稳时，加 `--maxFrameAgeMs 1000 --requireMonotonicTimestamp`；Mac client 播放体验测试时，Windows 端可同时跑该脚本记录音频帧率、电平和新鲜度。
是否改了协议：否；只消费现有 `audio_frame.timestamp` 字段。
是否需要另一端配合：不阻塞；真实 Mac client 听感验收时可配合。

## 2026-06-13 Windows Codex

日期：2026-06-13
开发端：Windows Codex
本轮目标：增强 Windows host 视频观察脚本，让 Mac 反控 Windows 前能量化帧新鲜度和时间戳单调性。
完成内容：
- `scripts/windows/observe-windows-host-video.mjs` 现在会解析每个 `video_frame.timestamp`，统计帧接收年龄 min/avg/max。
- 新增 `--maxFrameAgeMs <ms>` 可把帧新鲜度变成强校验；新增 `--requireMonotonicTimestamp` 可要求视频帧时间戳单调。
- JSON 输出的 `observation` 新增 `timestampFrameCount`、`minFrameAgeMs`、`avgFrameAgeMs`、`maxFrameAgeMs`、`timestampMonotonic` 和 `timestampMonotonicViolations`。
- Windows host README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `scripts/windows/observe-windows-host-video.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/observe-windows-host-video.mjs`
- `node scripts/windows/observe-windows-host-video.mjs --durationMs 2500 --minFrames 20 --minFps 8 --maxGapMs 1000 --maxFrameAgeMs 1000 --requireMonotonicTimestamp --json`
- `node scripts/windows/observe-windows-host-video.mjs --durationMs 1200 --minFrames 8 --minFps 5 --maxGapMs 1000 --maxFrameAgeMs 0.5 --json`
验证结果：
- 正向观察通过：临时 Windows host `127.0.0.1:43772` 使用 FFmpeg gdigrab MJPEG，720p/30Hz 收到 72 帧，约 28.66 FPS，最大帧间隔 47ms，`frameAge min/avg/max = 0/1/1ms`，时间戳单调。
- 负向阈值按预期失败：`--maxFrameAgeMs 0.5` 返回 exit code 1，错误为 `maxFrameAgeMs 1 > 0.5`。
遗留问题：
- 还没有把该强校验默认接入 `check-windows-host-readiness --profile deploy`；当前先保持手动参数，避免部署体检过于敏感。
下一步建议：
- Windows host 或 Mac client 视频参数改动后，用 `--maxFrameAgeMs 1000 --requireMonotonicTimestamp` 做低延迟回归；后续升级 Windows Graphics Capture 后把阈值收紧到更贴近日常体验的范围。
是否改了协议：否；只消费现有 `video_frame.timestamp` 字段。
是否需要另一端配合：不阻塞；Mac 反控 Windows 真机联调时可复用该脚本做 Windows 侧基线。

## 2026-06-13 Windows Codex

日期：2026-06-13
开发端：Windows Codex
本轮目标：收口 Windows 控制端远端文件托盘清理状态，避免清空托盘时误以为系统剪贴板临时目录也被删除。
完成内容：
- 远端文件托盘在存在临时目录时，清空按钮 tooltip 会提示“清空托盘（不删除系统剪贴板临时目录）”。
- 点击清空会清理内存暂存文件、临时目录入口和写入状态提示；事件日志会说明系统剪贴板临时目录仍保留给 Windows 粘贴使用。
- 页面级自检新增清空路径断言：失败落盘状态下清空后，文件列表、临时路径、打开目录按钮、清空按钮和状态行都会归零，同时保留临时目录说明日志。
- Windows client README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `apps/windows-client/app.js`
- `apps/windows-client/README.md`
- `scripts/windows/test-windows-client-browser.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly`
验证结果：
- 诊断-only 页面自检通过，文件托盘恢复检查、悬浮控制中心、桌面壳禁用态、黑边输入防护、H.264 key frame helper 和 fallback 诊断均通过。
遗留问题：
- 未做真实大文件/压缩包复制粘贴体验；仍需桌面版和真实 Mac 文件复制场景验收。
下一步建议：
- 用真实 Mac 复制 zip/大文件到 Windows 控制端，确认写入系统文件剪贴板后可粘贴，清空托盘后已写入剪贴板的临时目录仍能支撑粘贴直到原生层定期清理。
是否改了协议：否。
是否需要另一端配合：不阻塞；真实 Mac 文件复制体验后续可由 Mac 端配合。

## 2026-06-13 Mac Codex

日期：2026-06-13
开发端：Mac Codex
本轮目标：收口 Mac client 意外断线等待重连时的远端运行诊断，避免旧 Windows host PID/build 在断线期间残留。
完成内容：
- WebSocket 意外关闭后会清空远端 runtime 状态，“远端运行”回到“未提供”。
- 自动重连成功后，新的 `/discovery.runtime` 或 `hello_ack.runtime` 会重新显示当前 Windows host PID/build。
- `--expectReconnect` 页面级自检会断言等待重连阶段 runtime 已清空，并在恢复连接后断言 runtime 重新出现。
- Mac client README 和任务板已同步该行为。
修改文件：
- `apps/mac-client/app.js`
- `apps/mac-client/README.md`
- `scripts/windows/test-mac-client-browser.mjs`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/04-task-board.md`
验证方式：
- `node --check apps/mac-client/app.js`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --expectReconnect --skipFileClipboard --clientPort 5238 --debugPort 9388 --timeoutMs 60000`
验证结果：
- 自动重连页面回归通过：断线后进入 1/3 自动重连，重启临时 host 后约 4042ms 恢复；等待重连阶段 runtime 已清空，恢复后重新显示临时 host runtime。
- 最终手动断开仍输出 `Disconnect reset: 无画面 / 未就绪 / 未接收 / 未开启 / 0 次 / 未提供`。
遗留问题：
- 未连接真实 Windows host 验收该 UI 清理；临时 Windows host 已覆盖旧 runtime 清空和新 runtime 恢复。
下一步建议：
- 继续推进真实 Windows host WASAPI 到 Mac client 的听感/延迟验收，或继续做 Mac host 真实输入安全验收。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-13 Mac Codex

日期：2026-06-13
开发端：Mac Codex
本轮目标：收口 Mac client 手动断开后的远端运行诊断，避免上一段 Windows host PID/build 残留。
完成内容：
- `apps/mac-client` 手动断开时会清空远端 runtime 状态，“远端运行”回到“未提供”。
- `scripts/windows/test-mac-client-browser.mjs` 的手动断开诊断重置断言新增 `remoteRuntime === "未提供"`。
- Mac client README 和任务板已同步该行为。
修改文件：
- `apps/mac-client/app.js`
- `apps/mac-client/README.md`
- `scripts/windows/test-mac-client-browser.mjs`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/04-task-board.md`
验证方式：
- `node --check apps/mac-client/app.js`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --skipFileClipboard --clientPort 5235 --debugPort 9385 --timeoutMs 60000`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --clientPort 5236 --debugPort 9386 --timeoutMs 60000`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --expectReconnect --skipFileClipboard --clientPort 5237 --debugPort 9387 --timeoutMs 60000`
验证结果：
- 三条页面级回归均通过，断开输出均包含 `Disconnect reset: 无画面 / 未就绪 / 未接收 / 未开启 / 0 次 / 未提供`。
- 完整文件剪贴板路径和自动重连路径均未回归。
遗留问题：
- 未连接真实 Windows host 验收该 UI 清理；临时 Windows host 已覆盖 runtime 从有值到断开清空的路径。
下一步建议：
- 继续推进真实 Windows host WASAPI 到 Mac client 的听感/延迟验收，或继续做 Mac host 真实输入安全验收。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-13 Mac Codex

日期：2026-06-13
开发端：Mac Codex
本轮目标：让 Mac client 消费 Windows host 新增的可选 runtime/build 诊断，避免 Mac 反控 Windows 时误连旧进程。
完成内容：
- `apps/mac-client` 会在“会话诊断”里显示 Windows host 的可选 runtime 信息：PID、运行时长、启动时间和 build。
- `/discovery.runtime` 会在发现成功时更新诊断；`hello_ack.runtime` 或未来 `session_answer.runtime` 存在时也会刷新；字段缺失时保持向后兼容并显示“未提供”。
- `scripts/windows/test-mac-client-browser.mjs` 临时 Windows host 固定使用测试 build id `mac-client-test`，页面级自检会断言发现和连接后的 runtime 诊断都显示 PID 和 build，便于发现旧进程/旧构建。
- `apps/mac-client/README.md`、任务板和交接文档已同步。
修改文件：
- `apps/mac-client/index.html`
- `apps/mac-client/app.js`
- `apps/mac-client/README.md`
- `scripts/windows/test-mac-client-browser.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/mac-client/app.js`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --clientPort 5230 --debugPort 9380 --timeoutMs 60000`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --clientPort 5231 --debugPort 9381 --timeoutMs 60000`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --expectReconnect --skipFileClipboard --clientPort 5232 --debugPort 9382 --timeoutMs 60000`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --expectAuthFailure --expectedAttemptsRemaining 2 --expectedMaxAttempts 3 --clientPort 5233 --debugPort 9383 --timeoutMs 60000`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 完整 mock 页面自检通过，输出示例：`Remote runtime: PID 3653 / 已运行 3s / 启动 06/13 00:35 / build mac-client-test`。
- 文件超限保护、对端拒绝取消、正常文件发送和断开取消路径仍通过。
- 自动重连回归通过，临时 host 重启后页面恢复到已连接；认证失败回归仍保留 `认证失败 · 剩余 2/3 次` 并清理画面。
遗留问题：
- 还未连接真实 Windows 桌面版启动的 host 验收真实 build id；本轮已用临时 Windows host 覆盖 UI 显示和测试断言。
下一步建议：
- Windows 端用启动助手或桌面壳启动真实 Windows host 后，Mac client 连接时观察“远端运行”是否显示当前 git build；若显示旧 build，先停止旧 host 进程再重启。
- 继续用 `--useExistingHost --enableAudio --expectAudioPayload --expectAudioPlayback` 做真实 Windows WASAPI host 的听感和延迟验收。
是否改了协议：否；只消费 Windows host 已有的向后兼容可选 `runtime` 字段。
是否需要另一端配合：不阻塞；真实 Windows host build 展示可由 Windows 端后续配合验收。

## 2026-06-13 Windows Codex

日期：2026-06-13
开发端：Windows Codex
本轮目标：增强 Windows host readiness 的旧 build 提示，让部署体检更容易判断是否必须重启 Windows host。
完成内容：
- `scripts/windows/check-windows-host-readiness.mjs` 新增 Windows host runtime 源码变更摘要。
- 当运行中 `/discovery.runtime.buildId` 落后当前 git 且旧 build 可解析时，warning 会列出旧 build 后变动过的 `apps/windows-host` 运行源码文件。
- 如果旧 build 后没有 Windows host runtime 源码变更，warning 会明确提示没有这类变更，避免只因 Mac client/docs 前进而误判必须重启。
- 修正 `--skipCurrentBuildCheck` 与 `--requireCurrentBuildId` 同时使用时的边界：skip 只跳过 warning，不会让显式强校验失效。
- Windows host README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `scripts/windows/check-windows-host-readiness.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node scripts/windows/check-windows-host-readiness.mjs --help`
- 临时 Windows host stale-build 回归：用 `HEAD^` 作为运行中 build，默认 readiness warning 必须包含 Windows host runtime 变更文件。
- 临时 Windows host 强校验回归：`--requireCurrentBuildId --skipCurrentBuildCheck` 对旧 build 仍按预期失败，并在 errors 中包含变更文件摘要。
- `node scripts/windows/check-windows-host-readiness.mjs --json`
- `git diff --check`
- 冲突标记搜索
验证结果：
- stale-build 回归通过，warning/error 中均包含 `Windows host runtime changes since ...` 和 `apps/windows-host/src/windows-host-service.mjs`。
- 默认 readiness 仍保持低风险通过；当前 `43770` 未启动时 runtime 检查正常跳过。
遗留问题：
- 仍需真实 Mac client 连接 Windows host 时观察旧 build 提示是否能帮助现场判断重启时机。
下一步建议：
- 继续补 Windows host 启动/部署体验，优先把 Windows 桌面“本机被控”启动后的 runtime/build 摘要展示得更醒目，或继续推进 Windows Graphics Capture/正式编码管线。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-13 Windows Codex

日期：2026-06-13
开发端：Windows Codex
本轮目标：给 Windows host 补 runtime/build 诊断，避免 Mac 反控 Windows 时误连旧进程。
完成内容：
- Windows host 的 `/discovery` 和 `hello_ack` 新增可选 `runtime`：`processId`、`startedAt`、`uptimeSeconds`、`buildId`。
- `scripts/windows/start-windows-host.mjs` 会默认用当前 git short hash 设置 `LAN_DUAL_BUILD_ID`，并在启动计划里打印 Build ID；仍可用 `--buildId` 或环境变量覆盖。
- Windows 桌面壳启动 Windows host 时也会把 `LAN_DUAL_BUILD_ID` 设置为当前 git short hash，保证桌面入口启动的 host 可被 readiness 识别 build。
- `scripts/windows/check-windows-host-readiness.mjs` 新增运行中 host runtime 检查：默认低风险路径 host 不在线时跳过，host 在线但 build 落后当前 git 时 warning；`--expectBuildId`、`--requireCurrentBuildId` 可强校验，`--skipCurrentBuildCheck` 可临时放宽旧 build warning；`--profile deploy` 现在要求运行中 host 是当前 build。
- Windows host/desktop README、当前状态、下一步和任务板已同步。
修改文件：
- `apps/windows-host/src/windows-host-service.mjs`
- `apps/windows-host/README.md`
- `apps/windows-desktop/src-tauri/src/main.rs`
- `apps/windows-desktop/README.md`
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-host/src/windows-host-service.mjs`
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node --check scripts/windows/test-windows-host-start-helper.mjs`
- `node scripts/windows/test-windows-host-start-helper.mjs`
- `node scripts/windows/check-windows-host-readiness.mjs --help`
- `node scripts/windows/check-windows-host-readiness.mjs --json`
- 临时 Windows host runtime smoke：验证 `/discovery.runtime` 和 `hello_ack.runtime` 同 build/PID。
- 临时 Windows host + `check-windows-host-readiness --requireOpen --requireCurrentBuildId --json`：验证 runtime build 强校验通过。
- `cargo test` in `apps/windows-desktop/src-tauri`
- `npm.cmd run build` in `apps/windows-desktop`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 默认 readiness 7/7 通过；当前默认 `43770` 未启动时 runtime 检查正常跳过。
- 临时 runtime smoke 通过：`/discovery` 和 `hello_ack` 均返回 `build=runtime-test` 和同一 PID。
- 当前 build 强校验通过：临时 host 使用当时 HEAD 的 git short hash，readiness runtime step 输出的 `build=...` 与当前 git short hash 匹配。
- Rust 单测 6/6 通过；桌面 release build 通过并生成 `apps/windows-desktop/src-tauri/target/release/lan-dual-control-windows.exe`。
遗留问题：
- 还未在真实桌面 UI 中手动启动 Windows host 并让 Mac client 连入；本轮已用临时 host 覆盖 runtime 和 readiness 强校验链路。
下一步建议：
- Mac 反控 Windows 真机联调前，优先用 Windows 桌面版“本机被控”启动 host，再跑部署档体检确认 runtime build 与当前 git 一致。
- 如果 Mac client 连入后仍显示旧 build，先停止旧 Windows host 进程，再从桌面壳或启动助手重启。
是否改了协议：否；只新增向后兼容的可选 `runtime` 诊断字段。
是否需要另一端配合：不阻塞；真实 Mac client 连接 Windows host 时可观察 `/discovery.runtime.buildId` 是否显示当前 build。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：把 Windows host readiness profile 接到桌面版“本机被控”面板，减少命令行记忆成本。
完成内容：
- `apps/windows-client` 本机被控面板新增“体检档位”下拉：低风险、部署、深度。
- 前端会保存该档位，并在运行体检时把 `profile` 传给 Tauri 原生命令；浏览器预览版仍禁用本机被控面板。
- `apps/windows-desktop` 的 `run_windows_host_readiness` 命令会白名单化 `profile`，只允许 `default/deploy/deep`，并传给 `check-windows-host-readiness.mjs --profile <profile> --json`。
- Windows client/desktop README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `apps/windows-client/index.html`
- `apps/windows-client/app.js`
- `apps/windows-client/README.md`
- `apps/windows-desktop/src-tauri/src/main.rs`
- `apps/windows-desktop/README.md`
- `scripts/windows/test-windows-client-browser.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly`
- `cargo test` in `apps/windows-desktop/src-tauri`
- `npm.cmd run build` in `apps/windows-desktop`
- `git diff --check`
- 冲突标记搜索
验证结果：
- diagnosticsOnly 页面自检通过，确认浏览器预览版本机被控面板仍禁用，新 profile 下拉默认 `default`，前端 readiness 请求会带 `profile=default`。
- Rust 单测 6/6 通过；Tauri release build 通过并生成 `apps/windows-desktop/src-tauri/target/release/lan-dual-control-windows.exe`。
遗留问题：
- 尚未在真实桌面窗口中手动点击三档体检；自动化已覆盖前端请求和桌面构建链路。
下一步建议：
- 真机反控 Windows 前，桌面版先跑低风险体检；Windows host 启动后切到部署/深度档确认端口、视频、音频和本机自检。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：给 Windows host readiness 增加常用 profile 预设，方便 Mac 反控 Windows 前做部署/深度验收。
完成内容：
- `scripts/windows/check-windows-host-readiness.mjs` 新增 `--profile default|deploy|deep`。
- `default` 保持原低风险行为，不要求 Windows host 正在监听。
- `deploy` 自动开启严格模式、要求配置端口可达，并跑视频/音频短观察。
- `deep` 在 `deploy` 基础上额外跑 Windows host PowerShell 本机自检。
- Windows host README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `scripts/windows/check-windows-host-readiness.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node scripts/windows/check-windows-host-readiness.mjs --help`
- `node scripts/windows/check-windows-host-readiness.mjs --json`
- `node scripts/windows/check-windows-host-readiness.mjs --profile deploy --json`
- `node scripts/windows/check-windows-host-readiness.mjs --profile deep --json`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 默认 profile 低风险体检通过；当前未启动 `43770`，所以 `deploy` / `deep` 按预期失败在端口未监听/未放行，但 profile 参数已正确展开为 strict、requireOpen、video/audio probes，`deep` 也会跑 Windows host 本机自检。
遗留问题：
- `deploy` / `deep` 真正全绿需要先启动 Windows host，并确保可信局域网防火墙端口可达。
下一步建议：
- Windows host 启动后运行 `node scripts/windows/check-windows-host-readiness.mjs --profile deploy --json`；需要完整本机链路时再跑 `--profile deep --json`。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：让 Mac readiness 的旧 build 提示更可判断，减少只看到 hash 不匹配时的猜测。
完成内容：
- `scripts/mac/check-mac-host-readiness.mjs` 在运行中 `/discovery.runtime.buildId` 与当前 git short hash 不一致时，会尝试解析旧 build commit。
- 若旧 build commit 可解析，会用 `git diff --name-only <build>..HEAD -- apps/mac-host/Package.swift apps/mac-host/Sources` 列出 Mac host runtime 源码变更文件。
- warning 和 `--requireCurrentBuildId` 失败信息都会带该源码变更摘要；默认低风险 readiness 仍不因旧 build 失败。
- Mac host README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `scripts/mac/check-mac-host-readiness.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-host-readiness.mjs`
- `node scripts/mac/check-mac-host-readiness.mjs --timeoutMs 45000`
- `node scripts/mac/check-mac-host-readiness.mjs --timeoutMs 45000 --requireCurrentBuildId`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 默认 readiness 9/9 通过，旧 build warning 现在显示 `c2db37f` 之后 runtime 源码变更：`HostConfiguration.swift`、`MacPermissionCenter.swift`。
- `--requireCurrentBuildId` 仍按预期失败在 Mac host discovery，并带同样的源码变更摘要，方便判断需要协调重启。
遗留问题：
- 当前主 `43770` 仍是 `build=c2db37f` 且 `inputMonitoring=off`；因 runtime 源码确有变化，部署 profile 仍应要求重启到最新 build 后再全绿。
下一步建议：
- 协调窗口合适时重启真实 Mac host 到最新 build，再跑 `check-mac-host-readiness --profile deploy --timeoutMs 45000`。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：增强 Mac host 连续稳定性脚本，让首帧/音频体验退化可被阈值回归抓到。
完成内容：
- `scripts/mac/stress-mac-host.mjs` 在运行 canonical `probe-mac-host` 时流式解析 stdout，到达 `First frame`、`H.264 video confirmed`、`Audio frame confirmed` 时记录耗时。
- 每轮输出完整 probe、首帧、H.264 确认和首个音频帧耗时，结束后汇总 min/avg/max。
- 新增可选阈值 `--maxProbeMs`、`--maxFirstFrameMs`、`--maxH264ConfirmMs`、`--maxAudioFrameMs`，默认关闭，显式传入时任何一轮超时都会失败。
- Mac host README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `scripts/mac/stress-mac-host.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/stress-mac-host.mjs`
- `node scripts/mac/stress-mac-host.mjs --help`
- `node scripts/mac/stress-mac-host.mjs --iterations 3 --delayMs 100 --timeoutMs 15000 --maxProbeMs 8000 --maxFirstFrameMs 3000 --maxH264ConfirmMs 3000 --maxAudioFrameMs 3000 --expectInputMode log`
- `node scripts/mac/stress-mac-host.mjs --iterations 1 --delayMs 0 --timeoutMs 15000 --maxFirstFrameMs 1 --expectInputMode log`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 正向 3 轮真实 `43770` 通过：完整 probe min/avg/max `243/249/255ms`，首帧 `157/162/169ms`，H.264 `158/163/170ms`，音频 `237/244/250ms`；FD `29->29`。
- 负向阈值按预期失败：`--maxFirstFrameMs 1` 报 `first frame 221 ms exceeded threshold 1 ms`。
遗留问题：
- 这些耗时是 Mac 本机到 `127.0.0.1:43770` 的 stdout 到达时间，适合守本机连续建连退化；真实 Windows 控制端端到端观感仍需 Windows 页面级自检继续验收。
下一步建议：
- 之后做 Mac host 采集/编码/音频改动时，除 readiness 外加跑 `stress-mac-host --maxProbeMs 8000 --maxFirstFrameMs 3000 --maxH264ConfirmMs 3000 --maxAudioFrameMs 3000`，防止首帧或首音频耗时回退。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：给 Mac host readiness 增加部署/深度验收 profile，降低真机联调命令记忆成本。
完成内容：
- `scripts/mac/check-mac-host-readiness.mjs` 新增 `--profile default|deploy|deep`。
- 默认 profile 行为不变，仍只跑低风险检查，旧 build 和 inputMonitoring 只 warning。
- `--profile deploy` 会强制要求 `/discovery` 可达、当前 git build、控制权限、输入监控，并串联 H.264、PCM、input-log 冒烟和 `--maxVideoFrameAgeMs 250`。
- `--profile deep` 在 deploy 基础上额外跑启动助手临时端口自测。
- JSON 摘要新增 `args.profile`，Mac host README、当前状态、下一步和任务板已同步。
修改文件：
- `scripts/mac/check-mac-host-readiness.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-host-readiness.mjs`
- `node scripts/mac/check-mac-host-readiness.mjs --help`
- `node scripts/mac/check-mac-host-readiness.mjs --timeoutMs 45000`
- `node scripts/mac/check-mac-host-readiness.mjs --profile deploy --timeoutMs 45000`
- `node scripts/mac/check-mac-host-readiness.mjs --profile deep --timeoutMs 45000`
- `node scripts/mac/check-mac-host-readiness.mjs --json --timeoutMs 45000`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 默认 readiness 9/9 通过，仍只提示主 `43770` 运行中 build `c2db37f` 落后当前 git `0cc7548`、`inputMonitoring=off`。
- `--profile deploy` 和 `--profile deep` 均按预期失败在 Mac host discovery 强校验：当前主 `43770` 不是当前 build 且输入监控未开启；同时 H.264、PCM、input-log 均通过。
- `--profile deep` 额外的 start-helper self-test 通过；JSON 模式输出 `profile=default` 且 9/9 通过。
遗留问题：
- 当前主 `43770` 仍是旧 build `c2db37f`，`inputMonitoring=off`；需要重启到新 build 并授予输入监控后，`--profile deploy/deep` 才会全绿。
下一步建议：
- 协调后重启真实 Mac host 到最新 build，再跑 `node scripts/mac/check-mac-host-readiness.mjs --profile deploy --timeoutMs 45000` 做部署验收。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：增强 Windows 控制端远端文件托盘的写入状态和重试提示。
完成内容：
- `apps/windows-client/index.html` 新增远端文件托盘状态行，用于显示最近一次系统文件剪贴板写入结果。
- `apps/windows-client/styles.css` 增加成功、警告和处理中三种轻量状态样式。
- `apps/windows-client/app.js` 在手动写入和自动接收写入路径中维护 `receivedClipboardWriteStatus`：成功显示可直接粘贴，失败落盘显示可打开临时目录或重试写入，浏览器内存模式显示可下载或重试。
- 当上次写入失败且桌面版可用时，远端文件托盘的复制按钮悬停提示改为“重试写入系统文件剪贴板”。
- 页面级 `--diagnosticsOnly` 自检覆盖失败落盘状态行、重试提示、打开临时目录按钮和成功状态切换。
- Windows client README、当前状态、下一步和任务板已同步。
修改文件：
- `apps/windows-client/index.html`
- `apps/windows-client/styles.css`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
遗留问题：
- 仍未人工用真实大文件/压缩包在桌面版里验证重试后资源管理器粘贴体验。
下一步建议：
- 真实大文件体验验收后，再做更细的托盘清理交互，例如保留最近临时目录清单或按批次清理。
是否改了协议：否。
是否需要另一端配合：暂无；真实文件体验验收时需要 Mac 端复制文件触发。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：给 Windows 桌面版远端文件托盘增加一键打开临时目录。
完成内容：
- `apps/windows-client/index.html` 远端文件工具栏新增“打开临时目录”按钮。
- `apps/windows-client/app.js` 记录最近一次桌面原生文件剪贴板写入返回的 `rootDir`/`paths`；有远端文件、有临时目录且运行在桌面版时启用按钮。
- 点击按钮会调用 Tauri `open_clipboard_temp_path`，成功/失败都会写入本地事件日志；清空远端文件时同步清除临时目录状态。
- `apps/windows-desktop/src-tauri/src/main.rs` 新增 `open_clipboard_temp_path` 原生命令，使用 Windows 文件资源管理器打开目录或定位文件。
- 原生命令会 canonicalize 路径并限制只能打开本应用文件剪贴板临时根目录下的路径，避免网页层打开任意系统目录。
- 页面级 `--diagnosticsOnly` 自检新增按钮启用/禁用和原生命令调用参数断言；Rust 单测新增临时目录白名单通过/拒绝覆盖。
- Windows client/desktop README、当前状态、下一步和任务板已同步。
修改文件：
- `apps/windows-client/index.html`
- `apps/windows-client/app.js`
- `apps/windows-desktop/src-tauri/src/main.rs`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `apps/windows-desktop/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `cargo fmt`
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `cargo test`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
遗留问题：
- 尚未人工点真实桌面版按钮看资源管理器是否打开；当前已完成原生命令编译路径和白名单单测。
下一步建议：
- 真实大文件体验验收后，再补“重试写入系统文件剪贴板”和更细的托盘清理交互。
是否改了协议：否。
是否需要另一端配合：暂无；真实大文件体验验收仍需要 Mac 端复制文件触发。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：增强 Mac host readiness 权限强校验能力，给输入监控权限单独开关，方便后续真实控制验收。
完成内容：
- `scripts/mac/check-mac-host-readiness.mjs` 新增 `--requireInputMonitoring`。
- 默认 readiness 行为不变：`inputMonitoring=false` 仍只作为 warning，不影响无人值守低风险体检。
- 显式传 `--requireInputMonitoring` 时，`/discovery.permissions.inputMonitoring !== true` 会让 Mac host discovery 步骤失败。
- `--json` 摘要里新增 `requireInputMonitoring` 参数回显，方便 CI/脚本消费。
- Mac host README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `scripts/mac/check-mac-host-readiness.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-host-readiness.mjs`
- `node scripts/mac/check-mac-host-readiness.mjs --help`
- `node scripts/mac/check-mac-host-readiness.mjs --timeoutMs 45000`
- `node scripts/mac/check-mac-host-readiness.mjs --timeoutMs 45000 --requireInputMonitoring`
验证结果：
- 默认 readiness 9/9 通过；当前主 `43770` 仍是旧运行进程 `build=c2db37f`，并提示 `inputMonitoring=off` warning，不影响默认低风险体检。
- `--requireInputMonitoring` 在当前主 `43770` 上按预期失败：`Mac host readiness failed: 1 failed, 2 warnings`，因为运行中的 `/discovery.permissions.inputMonitoring=false`。
- `--help` 已显示新参数，确认 CLI 入口可发现。
遗留问题：
- 如果主 `43770` 仍是旧 build 或系统未授予输入监控，`--requireInputMonitoring` 会按预期失败；默认 readiness 不会因此失败。
下一步建议：
- 主 Mac host 重启到最新源码后，部署验收可跑 `node scripts/mac/check-mac-host-readiness.mjs --requireControlPermissions --requireInputMonitoring --requireCurrentBuildId --strict`。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：给 Mac client 页面级自检补短窗口视频持续来帧/FPS 指标，避免只验证首帧而漏掉后续画面停顿。
完成内容：
- `scripts/windows/test-mac-client-browser.mjs` 新增 `--observeVideoMs`，连接成功后在指定短窗口内统计收到的 `video_frame` 数量和实收 FPS。
- 新增 `--minObservedVideoFrames` 与 `--minObservedVideoFps`，可把短窗口持续来帧能力转成强校验。
- WebSocket 记录器新增累计 `videoFrames` / `audioFrames` 计数，不依赖只保留最近 400 条的消息数组。
- 默认行为不强制观察；只有显式传观察窗口或阈值才会执行。
- Mac client README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/test-mac-client-browser.mjs --observeVideoMs 1200 --minObservedVideoFrames 5 --minObservedVideoFps 5 --mockVideo --allowClipboardFallback --skipFileClipboard --timeoutMs 45000`
验证结果：
- 本机 mock Windows host 页面级自检通过：短窗口收到 `72` 帧，`1234ms` 内约 `58.3fps`，高于 5fps 阈值。
- 后续显示设置、log 输入、Command+C -> Ctrl+C、文本剪贴板、Mac 本机剪贴板读取/发送和监听回归继续通过。
遗留问题：
- 真实 Windows host 的持续 FPS 阈值应按实际采集管线设定；mock 58fps 只能说明脚本和页面计数链路正常。
下一步建议：
- 真机联调时可从宽阈值开始，例如 `--observeVideoMs 3000 --minObservedVideoFrames 30 --minObservedVideoFps 10`，再根据 Windows Graphics Capture/FFmpeg 实测逐步收紧。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：把 Mac client 页面级自检的音频体验指标补齐，开始量化反控音频首帧和真实播放耗时。
完成内容：
- `scripts/windows/test-mac-client-browser.mjs` 新增 `--maxAudioFrameMs`，在 `--expectAudioFrame` 路径打印首条 `audio_frame` 到达耗时，参数大于 0 时超过阈值即失败。
- 新增 `--maxAudioPlaybackMs`，在真实 PCM 播放路径 `--expectAudioPlayback` 下要求页面播放计数在阈值内出现。
- WebSocket 记录器会用页面 `performance.now()` 记录首条音频帧，避免只靠 Node 侧等待时间。
- 默认行为只增加指标输出，不改变协议、不改变页面连接流程。
- Mac client README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/test-mac-client-browser.mjs --enableAudio --expectAudioFrame --maxAudioFrameMs 8000 --mockVideo --allowClipboardFallback --skipFileClipboard --timeoutMs 45000`
- `node scripts/windows/test-mac-client-browser.mjs --requireAudio --maxAudioFrameMs 8000 --maxAudioPlaybackMs 10000 --mockVideo --allowClipboardFallback --skipFileClipboard --timeoutMs 45000`
验证结果：
- mock 音频首帧路径通过：页面收到 mock `audio_frame`，输出 `firstAudio=288ms`，低于 8s 阈值；后续显示设置、输入、快捷键、文本剪贴板和本机剪贴板监听均继续通过。
- `--requireAudio` 在当前 Mac 本机临时 Windows host 上按预期失败：临时 host 只能发送 mock 音频，脚本没有把 mock 当作真实 PCM payload/播放计数，最后显示 `played: 0` 并超时。这说明真实播放阈值需要在 Windows 真机 WASAPI host 上验收。
遗留问题：
- `--maxAudioPlaybackMs` 还需要 Windows 端真实 WASAPI host 或已运行 Windows host 配合验证，当前 Mac 环境无法产生真实 Windows 系统声音 PCM payload。
下一步建议：
- Windows 真机启动 WASAPI host 后运行 `node scripts/windows/test-mac-client-browser.mjs --requireAudio --maxAudioFrameMs 8000 --maxAudioPlaybackMs 10000 --mockVideo --allowClipboardFallback --skipFileClipboard --timeoutMs 45000` 或使用 `--useExistingHost --enableAudio --expectAudioPayload --expectAudioPlayback --maxAudioFrameMs <阈值> --maxAudioPlaybackMs <阈值>` 建立音频体验基线。
是否改了协议：否。
是否需要另一端配合：后续真实 PCM 播放耗时阈值需要 Windows 真机 WASAPI host 配合。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：把 Mac 控制 Windows 页面级自检补上首帧和重连恢复耗时指标，开始把体验验收量化。
完成内容：
- `scripts/windows/test-mac-client-browser.mjs` 新增 `--maxInitialVideoMs`，首次视频可见耗时会默认打印；参数大于 0 时超过阈值即失败。
- `--expectReconnect` 路径新增重连恢复总耗时打印；`--maxReconnectRestoreMs` 大于 0 时会强制要求意外断线到画面恢复不超过阈值。
- 默认行为只增加指标输出，不改变连接流程，不改协议。
- Mac client README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/test-mac-client-browser.mjs --expectReconnect --maxInitialVideoMs 8000 --maxReconnectRestoreMs 12000 --mockVideo --allowClipboardFallback --skipFileClipboard --timeoutMs 45000`
验证结果：
- 本机 mock Windows host 页面级自检通过：首次视频可见 `261ms`。
- 杀掉临时 Windows host 后页面进入自动重连；同端口恢复后 `session_answer=2`，总恢复耗时 `3779ms`，低于 12s 阈值。
- 重连恢复后继续通过显示设置、log 输入、Command+C -> Ctrl+C、文本剪贴板、Mac 本机剪贴板读取/发送和监听回归。
遗留问题：
- 该耗时是本机 mock host 数字；真实跨设备 Windows host 的首帧、音频和重连恢复耗时仍需后续真机验收。
下一步建议：
- 真机联调时给 `test-mac-client-browser.mjs --useExistingHost ...` 加 `--maxInitialVideoMs` 建立首帧基线；需要断线恢复体验时使用临时 host 加 `--expectReconnect --maxReconnectRestoreMs <阈值>`。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：补齐 Mac 控制 Windows Web 原型的意外断线自动重连，提升反控日常可用性。
完成内容：
- `apps/mac-client/app.js` 新增意外断线自动重连：非手动断开、非认证失败时最多重连 3 次，延迟按 1.2s 递增。
- 手动断开会清理重连计时器；认证失败继续停留在认证失败状态，不触发重连。
- 重连成功后保留现有会话流程，稳定 10 秒后重置重连计数。
- `scripts/windows/test-mac-client-browser.mjs` 新增 `--expectReconnect`，可杀掉临时 Windows host、等待页面进入自动重连、同端口重启 host，并要求第二次 `session_answer` 和视频恢复。
- Mac client README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `apps/mac-client/app.js`
- `apps/mac-client/README.md`
- `scripts/windows/test-mac-client-browser.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/mac-client/app.js`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/test-mac-client-browser.mjs --expectReconnect --mockVideo --allowClipboardFallback --skipFileClipboard --timeoutMs 45000`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 重连自检通过：首次连接成功后杀掉临时 Windows host，页面显示 `连接中断，1 秒后自动重连（1/3）`；同端口重启 host 后恢复到 `已连接`，`session_answer` 计数从 1 到 2。
- 重连恢复后继续通过 2K/60Hz/40Mbps 显示设置、log 输入、Command+C -> Ctrl+C、文本剪贴板、Mac 本机剪贴板读取/发送和监听回归。
遗留问题：
- 本轮只验证本机临时 Windows host；真实跨设备 Windows host 断线/网络抖动体验仍需后续真机联调观察。
下一步建议：
- Windows 端或人工启动真实 Windows host 后，可运行 `scripts/windows/test-mac-client-browser.mjs --useExistingHost --host <Windows IP> --port <port> --enableAudio --expectAudioPayload --expectAudioPlayback` 验收真实音频和反控体验；需要本机断线回归时加 `--expectReconnect` 且使用临时 host。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：增强 Mac host readiness 的运行中 build 新鲜度提示，避免真机仍连旧进程时被误判为最新。
完成内容：
- `scripts/mac/check-mac-host-readiness.mjs` 默认读取当前 `git rev-parse --short HEAD`，并与当前 `/discovery.runtime.buildId` 对比。
- 默认不匹配只给 warning，不影响低风险 readiness 通过；新增 `--requireCurrentBuildId` 可在部署/重启验收时强制要求运行中 host 就是当前 git build。
- 新增 `--skipCurrentBuildCheck`，允许临时验收旧 build 时关闭该 warning。
- README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `scripts/mac/check-mac-host-readiness.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-host-readiness.mjs`
- `node scripts/mac/check-mac-host-readiness.mjs --help`
- `node scripts/mac/check-mac-host-readiness.mjs --timeoutMs 45000`
- `node scripts/mac/check-mac-host-readiness.mjs --timeoutMs 45000 --requireCurrentBuildId`
- `node scripts/mac/check-mac-host-readiness.mjs --timeoutMs 45000 --skipCurrentBuildCheck`
验证结果：
- 默认 readiness 9/9 通过，并提示主 `43770` 运行中 build `c2db37f` 落后当前 git `c5f2e86`，同时保留旧进程 `inputMonitoring=off` warning。
- `--requireCurrentBuildId` 在当前旧主机上按预期失败：1 failed、2 warnings。
- `--skipCurrentBuildCheck` 通过且不再输出 build mismatch warning，只保留旧进程 inputMonitoring warning。
遗留问题：
- 主 `43770` 仍未重启；需要原密码和安全窗口时再用 `start-mac-host` 升到最新 build。
下一步建议：
- 下一次主 Mac host 重启后，运行 `node scripts/mac/check-mac-host-readiness.mjs --requireCurrentBuildId --requireControlPermissions --strict`，确认 build 和权限 warning 都已收口。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：优化 Windows 控制端远端文件托盘失败恢复提示。
完成内容：
- `apps/windows-client/app.js` 新增本地恢复提示 helper：当桌面原生层返回 `saveMode=temp` 且带 `rootDir`/`paths` 时，本地日志会显示临时目录或临时文件。
- 手动点击“写入系统文件剪贴板”失败时，如果文件已保存到临时目录，状态栏会显示“已保存在临时目录”，事件日志显示具体路径。
- 自动接收远端文件后写系统文件剪贴板失败但已落盘时，状态栏从“内存暂存”改为“已保存到临时目录”，事件日志显示临时目录。
- 发回对端的 `clipboard_file_result.reason` 仍保持原基础原因，不把 Windows 本机临时目录路径塞进协议消息。
- 页面级 `--diagnosticsOnly` 自检新增文件剪贴板恢复提示断言。
- README、当前状态、下一步和任务板已同步。
修改文件：
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
遗留问题：
- 仍未做“打开临时目录”按钮；当前先通过本地事件日志暴露路径。
下一步建议：
- 真实大文件体验验收后，再考虑在桌面版加一键打开临时目录/重试写入按钮。
是否改了协议：否。
是否需要另一端配合：暂无；真实大文件体验验收仍需要 Mac 端复制文件触发。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：收口 Windows 桌面版远端文件剪贴板分块写入的原生层可靠性。
完成内容：
- `apps/windows-desktop/src-tauri/src/main.rs` 将 begin/chunk/finish/cancel 拆到可单测的原生辅助函数。
- 原生层新增 512MB 总量上限校验，避免绕过前端直接调用 Tauri 命令时写入超限。
- 传输 ID 在时间戳后追加进程内递增序号，降低同毫秒并发创建临时目录撞名风险。
- 新建写入任务前会尽力清理 7 天以上旧临时目录；近期目录继续保留，确保系统文件剪贴板刚写入后可正常粘贴。
- 旧 `write_files_to_clipboard` 一次性兼容入口同步使用 512MB 上限，并在中途失败时清理刚创建的临时目录。
- Rust 单元测试新增覆盖：分块偏移错误、写入超出预期大小、未写完禁止 finish、取消清理临时目录、超出 512MB 拒绝。
- Windows client/desktop README、当前状态、下一步和任务板已同步。
修改文件：
- `apps/windows-desktop/src-tauri/src/main.rs`
- `apps/windows-desktop/README.md`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `cargo fmt`
- `cargo test`
验证结果：
- Rust 单测 4/4 通过。
遗留问题：
- 尚未人工用真实 100MB 以上压缩包从 Mac 复制到 Windows 控制端托盘，再写入系统文件剪贴板并在资源管理器粘贴。
下一步建议：
- 继续优化远端文件托盘失败恢复提示和真实大文件进度体验；或转入 Windows Graphics Capture/正式编码管线研究。
是否改了协议：否。
是否需要另一端配合：后续真实大文件体验验收需要 Mac 端复制文件触发 `clipboard_file_*`。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：升级 Windows 桌面版远端文件剪贴板写入，避免大文件一次性 base64 调用造成卡顿和 128MB 上限。
完成内容：
- `apps/windows-desktop/src-tauri/src/main.rs` 新增原生分块文件剪贴板命令：begin/chunk/finish/cancel。
- 原生层会为每次写入创建临时目录，校验分块偏移和最终字节数，完成后再调用 Windows 系统文件剪贴板。
- `apps/windows-client/app.js` 改为优先按 1MB 分块把远端文件写入桌面原生层，写入时显示百分比。
- 桌面版远端文件剪贴板上限从 128MB 放宽到 512MB，与当前远控文件传输上限一致。
- 保留旧 `write_files_to_clipboard` 一次性命令作为小文件兼容回退。
- 页面级自检新增浏览器预览版“本机被控”面板禁用和原生文件剪贴板上限/分块大小断言。
- README、当前状态、下一步和任务板已同步。
修改文件：
- `apps/windows-desktop/src-tauri/src/main.rs`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-desktop/README.md`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `cargo test`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- `npm.cmd run build`
- `git diff --check`
- 冲突标记搜索（apps/scripts/docs/shared）
遗留问题：
- 未人工用真实大压缩包点击桌面版“写入系统文件剪贴板”；本轮已完成原生命令编译、单元测试和浏览器页面回归。后续真机体验建议用 100MB 以上压缩包从 Mac 复制到 Windows 控制端托盘，再写入系统文件剪贴板验证资源管理器粘贴。
下一步建议：
- 继续优化远端文件托盘失败恢复、临时文件清理和大文件进度提示；或进入 Windows Graphics Capture/正式编码管线。
是否改了协议：否。
是否需要另一端配合：后续需要 Mac 端真实复制大文件到 Windows 控制端做体验验收。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：修正 Mac host 输入监控权限诊断，避免 `/discovery.permissions.inputMonitoring` 被硬编码为 `false`。
完成内容：
- `MacPermissionCenter` 新增 macOS `IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)` 只读探测，`inputMonitoringGranted` 现在反映系统真实 Input Monitoring 状态，不会弹权限请求。
- 权限摘要里的“输入监控”从固定“待实测”改为“已开启/未开启”。
- `scripts/mac/test-mac-host-defaults.mjs` 扩展为先用 Swift 读取本机真实 `IOHIDCheckAccess` 结果，再要求临时 host `/discovery.permissions.inputMonitoring` 与它一致，同时继续验证默认 `log` 和显式 `inject`。
- Mac host README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `apps/mac-host/Sources/MacHost/MacPermissionCenter.swift`
- `scripts/mac/test-mac-host-defaults.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `swift -e 'import IOKit.hid; print(IOHIDCheckAccess(kIOHIDRequestTypeListenEvent).rawValue)'`
- `node --check scripts/mac/test-mac-host-defaults.mjs`
- `swift build --package-path apps/mac-host`
- `node scripts/mac/test-mac-host-defaults.mjs --timeoutMs 20000`
- `node scripts/mac/check-mac-host-readiness.mjs --timeoutMs 45000`
验证结果：
- 本机 `IOHIDCheckAccess` 返回 granted；临时 host 默认 `log` 与显式 `inject` 两条路径均返回 `inputMonitoring=true`，确认不再硬编码为 `false`。
- 默认 readiness 9/9 通过；主 `43770` 未重启，仍是 `build=c2db37f` 旧进程，因此当前 `/discovery` 仍显示旧的 `inputMonitoring=off` warning。
遗留问题：
- 需要等下一次安全窗口重启主 `43770` 到新 build 后，Windows 端诊断条和 readiness 才会看到真实 `inputMonitoring=true`。
下一步建议：
- 下次重启主 Mac host 时，使用 `start-mac-host` 指定新 build，再跑 `check-mac-host-readiness --requireControlPermissions --strict` 确认 warning 消失。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：把 Mac host 直接启动输入默认值自测接入 readiness，避免安全默认值回归脚本被漏跑。
完成内容：
- `scripts/mac/check-mac-host-readiness.mjs` 默认低风险体检新增 `Mac host direct-start defaults` 步骤。
- 该步骤会在 `swift build` 后运行 `scripts/mac/test-mac-host-defaults.mjs`，确认直接启动未设置 `LAN_DUAL_INPUT_MODE` 时为 `log`，显式 `inject` 仍可覆盖。
- Mac host README、当前状态、下一步和文件占用已同步。
修改文件：
- `scripts/mac/check-mac-host-readiness.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-host-readiness.mjs`
- `node scripts/mac/check-mac-host-readiness.mjs --timeoutMs 45000`
验证结果：
- 默认 readiness 9/9 通过，新增步骤输出 `Mac host direct-start input defaults verified`。
- 当前主 `43770` 仍为 `build=c2db37f`、`input=log`；input monitoring 仍为 warning，不影响默认通过。
遗留问题：
- 真实 `inject` 手感和输入法仍需人工确认安全后单独验收。
下一步建议：
- Mac host 相关改动后直接跑默认 readiness，即可同时覆盖构建、直接启动安全默认值、启动助手 dry-run、keymap 和当前 `/discovery`。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：收口 Mac host 直接启动的输入安全默认值，避免未显式配置时进入真实注入模式。
完成内容：
- `HostConfiguration` 的 `LAN_DUAL_INPUT_MODE` 缺省值从 `inject` 改为 `log`。
- 显式设置 `LAN_DUAL_INPUT_MODE=inject`、启动助手 `--inputMode inject` 或 `--injectInput` 仍会启用真实 CGEvent 注入。
- 新增 `scripts/mac/test-mac-host-defaults.mjs`，用临时本机端口启动 Mac host 二进制，只读验证默认 `log` 和显式 `inject` 覆盖。
- Mac host README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `apps/mac-host/Sources/MacHost/HostConfiguration.swift`
- `scripts/mac/test-mac-host-defaults.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/test-mac-host-defaults.mjs`
- `node --check scripts/mac/start-mac-host.mjs`
- `swift build --package-path apps/mac-host`
- `node scripts/mac/test-mac-host-defaults.mjs --timeoutMs 20000`
- `node scripts/mac/test-mac-host-start-helper.mjs --timeoutMs 30000`
- `node scripts/mac/check-mac-host-readiness.mjs --timeoutMs 45000 --expectBuildId c2db37f --maxVideoFrameAgeMs 250 --probeAudio --probeInputLog --requireControlPermissions`
验证结果：
- 新默认值自测通过：未设置 `LAN_DUAL_INPUT_MODE` 时 `/discovery inputMode=log`；显式 `LAN_DUAL_INPUT_MODE=inject` 时 `/discovery inputMode=inject`。
- 启动助手自测通过，仍默认 safe log 输入模式。
- 主 `43770` 未重启，当前仍为 `build=c2db37f`、`input=log`；readiness 12/12 通过，H.264 `frameAge max=1ms`、PCM 和 input-log 通过。
遗留问题：
- 真实 `inject` 手感和输入法仍需有人在屏幕前确认安全后单独验收；本轮不发送真实输入。
下一步建议：
- 后续若要切真实注入，先跑 `node scripts/mac/check-mac-host-readiness.mjs --requireControlPermissions --strict`，再由人工明确启动 `LAN_DUAL_INPUT_MODE=inject` 或 `--injectInput`。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：增强 Mac host readiness 的视频时间戳新鲜度校验，方便一键确认运行中的真实 host 已是 fractional timestamp build。
完成内容：
- `scripts/mac/check-mac-host-readiness.mjs` 新增 `--maxVideoFrameAgeMs <ms>`。
- 该参数大于 0 时会自动启用 `--probeVideo`，并透传到 `observe-mac-video --maxFrameAgeMs <ms>`，强制要求 `video_frame.timestamp` 接收年龄不超过阈值。
- 默认 readiness 行为不变，未显式设置时不会收紧视频探针。
- 同步 Mac host README、当前状态和下一步文档，并更正当前主 `43770` 已重启到 `c2db37f` fractional timestamp build 的事实。
修改文件：
- `scripts/mac/check-mac-host-readiness.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-host-readiness.mjs`
- `node scripts/mac/check-mac-host-readiness.mjs --help`
- `node scripts/mac/check-mac-host-readiness.mjs --timeoutMs 45000 --expectBuildId c2db37f --maxVideoFrameAgeMs 250 --probeAudio --probeInputLog --requireControlPermissions`
验证结果：
- 语法检查通过，帮助输出包含 `--maxVideoFrameAgeMs`。
- 真实 `43770` readiness 12/12 通过，`/discovery.runtime.buildId=c2db37f`，`screen=on`，`accessibility=on`，`inputMonitoring=off` 仍仅 warning。
- H.264 视频探针 75 帧、约 29.6fps、最大接收间隔 37ms、`activeDisplayId=main`、`frameAge min/avg/max=0/0.2/1ms`，通过 `--maxVideoFrameAgeMs 250`。
- PCM 音频 125 帧、约 49.7fps、最大间隔 22ms；input-log 16/16 ack 且未注入。
遗留问题：
- input monitoring 仍需人工在系统设置中确认；本轮不切 `inject`，不重启主 host。
下一步建议：
- Mac host 重启或部署后，可用 `node scripts/mac/check-mac-host-readiness.mjs --expectBuildId <build-id> --maxVideoFrameAgeMs 250 --probeAudio --probeInputLog --requireControlPermissions` 一次性确认 build、权限、H.264 低延迟 timestamp、PCM 和安全输入日志。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：增强 Mac host readiness 的 macOS 权限诊断，避免真机联调时才发现屏幕录制或辅助功能权限缺失。
完成内容：
- `scripts/mac/check-mac-host-readiness.mjs` 的 `/discovery` 步骤现在会汇总 `permissions.screenRecording`、`permissions.accessibility` 和 `permissions.inputMonitoring`。
- 新增 `--requireControlPermissions`，强制要求屏幕录制和辅助功能开启；这两个权限缺失时会失败。
- `inputMonitoring=false` 仍默认只作为 warning，因为当前真机 discovery 显示该项为 off/待确认，但 `log` 模式和现有探针仍可安全工作；需要 warning 也失败时可加 `--strict`。
- Mac host README、当前状态、下一步和文件占用已同步。
修改文件：
- `scripts/mac/check-mac-host-readiness.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-host-readiness.mjs`
- `node scripts/mac/check-mac-host-readiness.mjs --timeoutMs 30000`
- `node scripts/mac/check-mac-host-readiness.mjs --timeoutMs 30000 --requireControlPermissions`
- `node scripts/mac/check-mac-host-readiness.mjs --timeoutMs 30000 --strict`
验证结果：
- 默认 readiness 通过：当前 43770 `/discovery` 显示 `screen=on accessibility=on inputMonitoring=off`，因此只给 inputMonitoring warning，不失败。
- `--requireControlPermissions` 通过，确认当前真实 Mac host 的屏幕录制和辅助功能权限足够做真实视频和输入注入前置条件。
- `--strict` 按预期失败：0 个 failed step、1 个 warning，原因是 input monitoring 仍为 off/待确认。
遗留问题：
- input monitoring 仍需有人在系统设置里确认；本轮不自动打开系统权限，也不切 `inject`。
下一步建议：
- 真机切 `inject` 前先跑 `node scripts/mac/check-mac-host-readiness.mjs --requireControlPermissions --strict`；若 strict 因 input monitoring 失败，人工确认权限后再复测。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：新增 Mac host 一键体检聚合入口，把日常环境、构建、运行时和可选真实 host 探针串起来。
完成内容：
- 新增 `scripts/mac/check-mac-host-readiness.mjs`。
- 默认低风险检查：Node.js、macOS 版本、Swift、Mac host build、Mac host 启动助手语法、启动助手 dry-run、输入键盘映射覆盖和当前 `/discovery` 状态。
- `/discovery` 默认不强制要求 host 已启动；未启动时只给 warning。需要端口必须在线时可加 `--requireOpen`。
- 支持 `--expectBuildId <id>` 强制运行中 host runtime build 匹配，并自动启用 `--probeHost`。
- 可选深度探针：`--probeHost` 跑 runtime/display round-trip，`--probeVideo` 跑短 H.264 时间线观察，`--probeAudio` 跑短 PCM 音频观察且不播放声音，`--probeInputLog` 跑安全 input log 冒烟，`--probeStartHelper` 跑启动助手临时端口自测。
- 支持 `--json` 机器可读摘要和 `--strict` warning 失败模式。
- Mac host README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `scripts/mac/check-mac-host-readiness.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-host-readiness.mjs`
- `node scripts/mac/check-mac-host-readiness.mjs --timeoutMs 30000`
- `node scripts/mac/check-mac-host-readiness.mjs --timeoutMs 30000 --json`
- `node scripts/mac/check-mac-host-readiness.mjs --timeoutMs 45000 --expectBuildId c2db37f --probeVideo --probeAudio --probeInputLog --probeStartHelper`
验证结果：
- 默认体检 8/8 通过：Node.js、macOS、Swift、Mac host build、启动助手语法/dry-run、keymap 和 `/discovery` 均正常；当前 `/discovery` 显示 PID 21491、build `c2db37f`、input `log`。
- JSON 输出通过，包含 passed/failed/warnings 和每个步骤摘要。
- 深度体检 13/13 通过：runtime/display single-display round-trip 通过；启动助手临时端口自测通过；H.264 2.5 秒 74 帧约 29.1fps、max gap 39ms、timestampUs 单调；PCM 2.5 秒 126 帧约 49.6fps、max gap 22ms；input-log 16/16 ack 且未注入。
遗留问题：
- `--probeAudio` 默认不播放声音，只验证 PCM 持续帧；非静音电平和真实听感仍需有人确认可发声时单独跑 `observe-mac-audio --playTone --requireLevel` 或让 Windows 控制端试听。
- `--probeInputLog` 只验证 `log` 安全模式；真实 `inject` 仍需人工在屏幕前确认安全环境。
下一步建议：
- Mac host 改动、重启或联调前先跑默认 readiness；真实 host 已在线时加 `--expectBuildId <build> --probeVideo --probeAudio --probeInputLog`。
- Windows 端若要验收真实 Mac host，可先让 Mac 端贴 readiness 摘要，再跑 Windows 控制端页面级 H.264 自检。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：新增 Mac host 日常安全启动助手，方便真机联调时用安全 `log` 模式启动、确认 runtime/build，并避免退回默认 demo 密码。
完成内容：
- 新增 `scripts/mac/start-mac-host.mjs`：默认绑定 `0.0.0.0:43770`、默认 `LAN_DUAL_INPUT_MODE=log`、自动设置 `LAN_DUAL_BUILD_ID` 为当前 git short hash、打印 Windows 端可填写的局域网地址、等待 `/discovery` 就绪。
- 启动助手支持 `--promptPassword` 不回显输入密码，`--requirePassword` 会拒绝空密码和 `demo-password`，避免真机局域网联调误用默认密码。
- 默认启动后运行 `check-mac-displays --requireRuntime --expectBuildId <build>` 做只读 runtime/display round-trip 校验；可用 `--skipRuntimeCheck` 跳过，可用 `--requireRuntimeCheck` 把检查失败升级为启动失败。
- 启动前会检查 `127.0.0.1:<port>/discovery`，默认拒绝覆盖已有 Mac host，避免误踢当前 `43770` 主通道。
- 新增 `scripts/mac/test-mac-host-start-helper.mjs` 自测，覆盖密码安全、非交互提示、干跑和临时端口实启关闭。
- Mac host README、当前状态、下一步和任务板已同步。
修改文件：
- `scripts/mac/start-mac-host.mjs`
- `scripts/mac/test-mac-host-start-helper.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/start-mac-host.mjs`
- `node --check scripts/mac/test-mac-host-start-helper.mjs`
- `node scripts/mac/start-mac-host.mjs --dryRun`
- `node scripts/mac/start-mac-host.mjs --requirePassword --dryRun`
- `node scripts/mac/test-mac-host-start-helper.mjs --timeoutMs 45000`
- `swift build --package-path apps/mac-host`
- 临时端口真实启动：`LAN_DUAL_PASSWORD=test-password node scripts/mac/start-mac-host.mjs --host 127.0.0.1 --port 60529 --videoMode mock --inputMode log --buildId start-helper-runtime-check --requirePassword --noBonjour --timeoutMs 15000`
- `lsof -nP -iTCP -sTCP:LISTEN | rg 'lan-dual|60529|43770'`
验证结果：
- 语法检查通过；dry-run 显示默认 `Input mode: log (safe, no injection)`、build 为当前短 hash、未设置密码时只警告不会启动。
- `--requirePassword --dryRun` 在无密码时失败且不打印堆栈。
- 自测通过：缺密码拒绝、`demo-password` 拒绝、非交互 `--promptPassword` 拒绝、环境密码干跑、临时端口真实启动后关闭。
- 临时 `60529` 带默认 runtime/display 校验真实启动通过：`/discovery` build 为 `start-helper-runtime-check`、input 为 `log`，`check-mac-displays` 单屏 round-trip 通过；随后 `SIGINT` 正常关闭。
- 监听口检查确认临时端口无残留，只剩主 `43770` PID 21491。
遗留问题：
- 本轮未重启主 `43770`；主通道仍保持当前已上线的 `c2db37f`/`log` 进程。
- 真机改成 `inject` 仍需要人工在屏幕前确认安全环境，助手不会自动切换。
下一步建议：
- 后续需要重启 Mac host 时优先用 `node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword`，再用 Windows 控制端或脚本验证 runtime build。
- 如果 Windows 端要做真实 Mac host 验收，先确认 `/discovery.runtime.buildId` 与联络板记录一致。
是否改了协议：否。
是否需要另一端配合：否；Windows 端可按 README 使用新启动入口。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：给 Windows 桌面壳增加“本机被控”入口，让 Mac 反控 Windows 前可以直接在 UI 内体检、启动和停止 Windows host。
完成内容：
- `apps/windows-desktop/src-tauri/src/main.rs` 新增 Tauri 原生命令：运行 Windows host readiness、预览防火墙放行命令、启动/停止 Windows host、读取进程状态和日志。
- 桌面壳启动 Windows host 时要求填写密码，通过环境变量传入，不在命令行打印；默认输入模式为 `log` 安全日志。
- 停止时使用 Windows 进程树停止，避免由桌面壳启动的 Node/FFmpeg 子进程残留。
- `apps/windows-client` 左侧新增“本机被控”面板：端口、密码、画面、声音、输入模式、体检、启动、停止、防火墙预览和日志输出；浏览器预览版保持禁用。
- 本机被控面板会保存端口/模式，不保存密码。
- README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `apps/windows-desktop/src-tauri/src/main.rs`
- `apps/windows-client/index.html`
- `apps/windows-client/styles.css`
- `apps/windows-client/app.js`
- `apps/windows-desktop/README.md`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `cargo check`
- `cargo fmt`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- `node scripts/windows/check-windows-host-readiness.mjs --json`
- `npm.cmd run build`
- `git diff --check`
- 冲突标记搜索（apps/scripts/docs/shared）
遗留问题：
- 未在真实桌面 UI 中手动点击“启动/停止”；本轮已完成 Tauri release 构建和 readiness 自身验证，后续 Mac 反控 Windows 前建议人工点一次桌面面板确认体验。
下一步建议：
- 用桌面面板启动 Windows host 后，让 Mac client 连入 Windows 的局域网 IP，先保持输入模式“安全日志”，确认视频、音频和 input_ack；有人看屏幕后再切“真实控制”。
是否改了协议：否。
是否需要另一端配合：后续需要 Mac 端用 `apps/mac-client` 真机连入验证。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：为 Windows host 增加显式防火墙放行助手，让 Mac 反控 Windows 真机联调少一步手工复制命令，同时保持默认只读。
完成内容：
- `scripts/windows/check-windows-firewall.mjs` 新增 `--dryRunRule` 和 `--addRule`。
- `--dryRunRule` 只打印将要创建的 `New-NetFirewallRule` 命令，不改系统。
- `--addRule` 会显式尝试新增 Private TCP 入站 allow 规则；默认仍只读，不自动改防火墙。
- `scripts/windows/start-windows-host.mjs` 新增 `--dryRunFirewallRule` / `--addFirewallRule` 并转发到底层防火墙检查。
- PowerShell 入口新增 `-DryRunFirewallRule` / `-AddFirewallRule`。
- `test-windows-host-start-helper.mjs` 的临时端口实启回归加入防火墙干跑断言。
- README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `scripts/windows/check-windows-firewall.mjs`
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-firewall.mjs`
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check scripts/windows/test-windows-host-start-helper.mjs`
- `node scripts/windows/check-windows-firewall.mjs --host 127.0.0.1 --port 43999 --dryRunRule`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 20000`
- `node scripts/windows/check-windows-host-readiness.mjs --timeoutMs 20000`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 防火墙干跑打印 `New-NetFirewallRule ... -Profile Private`，没有执行系统修改。
- 启动助手自测通过：密码安全、非交互提示拒绝、环境密码干跑、临时端口实启和防火墙干跑均通过。
- Windows host readiness 默认 6/6 通过；只提示当前默认 `43770` 未启动，这是预期提醒。
遗留问题：
- 本轮不做桌面壳图形化防火墙弹窗；仍需要用户显式加参数并在管理员 PowerShell 中执行才会添加规则。
下一步建议：
- 后续把 `-PromptPassword -RequirePassword -DryRunFirewallRule/-AddFirewallRule` 包成 Windows 桌面壳里的图形化启动向导。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：让 Mac host 输出带小数秒的 ISO timestamp，配合视频观察脚本做更可信的帧接收年龄和低延迟诊断。
完成内容：
- 新增 `HostTimestamp.isoString(from:)`，统一生成带小数秒的 ISO-8601 UTC 时间戳。
- `/discovery.lastSeenAt`、`runtime.startedAt`、H.264/JPEG/mock `video_frame.timestamp`、fallback `screenCaptureRetryAfter`、WebSocket envelope `timestamp` 和 HostLogger 日志时间戳改用统一 formatter。
- 该格式仍是 ISO-8601 字符串，属于向后兼容的精度增强，不新增必需协议字段。
- 已基于 Windows 最新 `0a745d4 Add Windows host start helper` 合并，保留 Windows 启动助手文档和 ACTIVE_LOCKS 记录。
- Mac host README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `apps/mac-host/Sources/MacHost/HostTimestamp.swift`
- `apps/mac-host/Sources/MacHost/MacHostService.swift`
- `apps/mac-host/Sources/MacHost/HostLogger.swift`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `swift build`（`apps/mac-host`）
- `rg -n "ISO8601DateFormatter" apps/mac-host/Sources/MacHost`
- 临时启动：`LAN_DUAL_HOST=127.0.0.1 LAN_DUAL_PORT=43771 LAN_DUAL_INPUT_MODE=log LAN_DUAL_BONJOUR=0 LAN_DUAL_BUILD_ID=fractional-timestamp-test .build/debug/lan-dual-mac-host`
- `node -e` fetch `http://127.0.0.1:43771/discovery` 并断言 `lastSeenAt` / `runtime.startedAt` 匹配 `.123Z` 小数秒格式、`buildId=fractional-timestamp-test`
- `node scripts/mac/check-mac-displays.mjs --host 127.0.0.1 --port 43771 --timeoutMs 12000 --requireRuntime --expectBuildId fractional-timestamp-test`
- `node scripts/mac/observe-mac-video.mjs --host 127.0.0.1 --port 43771 --durationMs 1200 --preferredVideoCodec mjpeg --minFrames 3 --maxGapMs 1000 --expectActiveDisplayId main --requireFrameTimestamp --maxFrameAgeMs 250`
验证结果：
- Swift build 通过；旧 `ISO8601DateFormatter` 直接调用只剩 `HostTimestamp.swift` 内部。
- 临时 `43771` discovery 返回 `lastSeenAt=2026-06-12T10:05:33.915Z`、`runtime.startedAt=2026-06-12T10:05:18.167Z`、`buildId=fractional-timestamp-test`。
- `check-mac-displays` runtime 强校验通过，`/discovery` 和 `hello_ack` 均显示同一 PID/build/startedAt。
- 视频观察在临时第二 host 上通过 timestamp 强校验：38 帧、约 30.9fps，`frameAge max=0ms`，证明 `video_frame.timestamp` 不再是秒级；该临时第二 host 因资源竞争走 mock fallback，主 `43770` 未重启也未受影响。
- 临时 `43771` 已关闭，主 `43770` 仍由 PID 97112 正常监听。
遗留问题：
- 主 `43770` 当前仍是旧 `db48055` 进程，需后续选择窗口重启到新 build 后，才会在真实 H.264/JPEG 帧上使用小数秒 timestamp。
下一步建议：
- 下一次重启主 Mac host 时设置新的 `LAN_DUAL_BUILD_ID`，跑 `check-mac-displays --requireRuntime --expectBuildId <id>`，再跑 `observe-mac-video --requireH264 --maxFrameAgeMs 250 --requireMonotonicTimestampUs` 确认真实 H.264 低延迟接收年龄。
是否改了协议：否；仍是既有可选/已有 ISO timestamp 字符串，只有精度提升。
是否需要另一端配合：否；Windows 端可正常消费 ISO 字符串，后续如 UI 显示时间会自动更精确。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：增强 Windows host 启动助手的密码安全，避免真机联调时无意使用 demo 密码。
完成内容：
- `scripts/windows/start-windows-host.mjs` 新增 `--promptPassword`，可在交互终端中不回显输入 `LAN_DUAL_PASSWORD`。
- 新增 `--requirePassword`，在未设置密码时拒绝启动，避免绑定到局域网时退回 demo 密码。
- PowerShell 入口 `scripts/windows/start-windows-host.ps1` 新增 `-PromptPassword` 和 `-RequirePassword`。
- 新增 `scripts/windows/test-windows-host-start-helper.mjs`，自动回归缺密码拒绝、非交互提示拒绝、环境密码干跑和临时端口真实启动。
- Windows host README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check scripts/windows/test-windows-host-start-helper.mjs`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 15000`
- `node scripts/windows/check-windows-host-readiness.mjs --timeoutMs 20000`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 启动助手自测通过：缺密码会清楚拒绝且不带堆栈；非交互 `--promptPassword` 会安全失败；环境密码干跑不会打印 demo 警告；临时端口真实启动/关闭通过。
- Windows host readiness 默认 6/6 通过；只提示当前默认 `43770` 未启动，这是预期提醒。
遗留问题：
- 本轮不改变底层 `server.mjs` 的 demo 默认值，避免破坏现有测试；真机入口通过 `-RequirePassword` 防止误用。
下一步建议：
- 真机让 Mac 控制 Windows 时，用 `scripts/windows/start-windows-host.ps1 -PromptPassword -RequirePassword`，需要系统声音再加 `-Wasapi`。
- 后续桌面壳可把密码提示和防火墙提示做成图形化向导。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：新增 Windows host 日常启动助手，把启动、局域网地址提示和防火墙只读检查串起来，方便 Mac 反控 Windows 真机联调。
完成内容：
- 新增 `scripts/windows/start-windows-host.mjs`：启动 Windows host 后列出 Mac 端可填写的局域网地址，等待 `/discovery` 就绪，并自动运行只读 LAN/firewall 检查。
- 新增 `scripts/windows/start-windows-host.ps1`：提供更像 Windows 工具的一键入口，支持 `-Wasapi`、`-LogInput`、`-SystemInput`、`-DryRun` 等参数。
- 默认不改系统防火墙；如果端口不可达或缺少入站规则，继续复用 `check-windows-firewall.mjs` 的管理员建议命令。
- README、当前状态、下一步和任务板已同步；任务板只标记“启动助手级”引导完成，完整桌面端图形提示仍保留为后续任务。
修改文件：
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/start-windows-host.mjs`
- `node scripts/windows/start-windows-host.mjs --dryRun`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-windows-host.ps1 -DryRun`
- 临时端口 `127.0.0.1:43773` 实际启动 `start-windows-host.mjs --screenMode mock --inputMode log --skipFirewallCheck`，等到 `/discovery` 就绪后自动关闭。
- `node scripts/windows/check-windows-host-readiness.mjs --timeoutMs 20000`
- `git diff --check`
验证结果：
- Node 入口和 PowerShell 入口干跑均能列出 `192.168.31.68:43770` 和 FFmpeg 路径。
- 临时端口实际启动/关闭通过，未占用默认 `43770`。
- Windows host readiness 默认 6/6 通过；只提示当前默认 `43770` 未启动，这是预期提醒。
遗留问题：
- 本轮没有做 Tauri 桌面端防火墙弹窗，也没有自动修改系统防火墙。
下一步建议：
- 真机让 Mac 控制 Windows 时，先用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-windows-host.ps1` 启动；需要声音时加 `-Wasapi`。
- 后续可把同样的检查结果接入 Windows 桌面壳，做图形化防火墙引导。
是否改了协议：否。
是否需要另一端配合：否；Mac 端后续真机联调时可直接按 README 使用该入口。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：增强 Mac 视频观察脚本的时间戳和 H.264 媒体时间线诊断，方便后续排查低延迟/卡顿来源。
完成内容：
- `scripts/mac/observe-mac-video.mjs` 新增帧 `timestamp` 解析与接收年龄统计，汇总 `frameAge min/avg/max`。
- 新增 H.264 `timestampUs` / `durationUs` 时间线统计，输出媒体时间戳范围、媒体间隔平均/最大值和 duration 分布。
- 新增可选强校验参数：`--requireFrameTimestamp`、`--maxFrameAgeMs`、`--requireTimestampUs`、`--requireMonotonicTimestampUs`、`--maxTimestampGapUs`。
- 默认行为保持兼容；未显式打开强校验时只做摘要统计，不要求旧 host 一定带 `timestampUs`。
- Mac host README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `scripts/mac/observe-mac-video.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/observe-mac-video.mjs`
- `node scripts/mac/observe-mac-video.mjs --help`
- `node scripts/mac/observe-mac-video.mjs --host 127.0.0.1 --port 43770 --durationMs 3000 --requireH264 --minFrames 20 --maxGapMs 1000 --expectActiveDisplayId main --requireFrameTimestamp --maxFrameAgeMs 1000 --requireMonotonicTimestampUs --maxTimestampGapUs 1000000`
- `node scripts/mac/observe-mac-video.mjs --host 127.0.0.1 --port 43770 --durationMs 2000 --preferredVideoCodec mjpeg --requireRealVideo --minFrames 10 --maxGapMs 1000 --expectActiveDisplayId main --requireFrameTimestamp --maxFrameAgeMs 1500`
验证结果：
- 真实 `43770` H.264 路径通过：89 帧、约 29.2fps、最大接收间隔 39ms，`activeDisplayId=main:89`，`timestampUs` 单调，媒体间隔平均/最大 `34281/41668us`，`durationUs=33333`。
- 真实 `43770` JPEG 兜底路径通过：31 帧、约 15.4fps、最大接收间隔 74ms，`activeDisplayId=main:31`，帧 `timestamp` 均可解析。
遗留问题：
- Mac host 当前 ISO `timestamp` 是秒级精度，所以 `frameAge` 会天然出现约 0-1000ms 抖动；用 `--maxFrameAgeMs` 时建议阈值设为 `1500` 以上，真正低延迟判断仍应结合 H.264 `timestampUs`、接收 gap 和端到端控制端观感。
下一步建议：
- 后续做动态画面/H.264 长稳观察时加 `--requireMonotonicTimestampUs`，必要时再加 `--maxTimestampGapUs`；Windows 控制端端到端延迟仍需要页面侧日志或 UI 指标继续补。
是否改了协议：否。
是否需要另一端配合：否；Windows 端可正常拉取，本轮不影响 Windows host/client 功能。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：消除 Windows 控制端连接真实 Mac H.264 时偶发的 WebCodecs 首帧非关键帧解码噪声。
完成内容：
- `apps/windows-client/app.js` 新增 Annex B start code 解析和 AVC 长度前缀 NAL 解析，用 IDR/SPS/PPS 判断 H.264 payload 是否关键帧。
- H.264 decoder 新建或重配置后会进入等待关键帧状态；若先收到 delta 帧，会安静跳过并等待关键帧，避免 `A key frame is required after configure() or flush()` 被记录成解码失败。
- 如果后端没有显式 `frame.keyFrame`，控制端也能从真实 `annexb-base64` payload 推断首帧为 key chunk。
- `scripts/windows/test-windows-client-browser.mjs` 的 `--diagnosticsOnly` 增加 H.264 关键帧识别 helper 回归；`--requireH264` 现在要求本次连接 `H264Errors=0`。
- Windows client README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --host 127.0.0.1 --port 43770 --password demo-password --requireH264 --timeoutMs 45000`
验证结果：
- diagnosticsOnly 通过：悬浮控制中心、黑边输入防护、stream fallback/runtime 诊断、H.264 key frame helper 均通过；helper 断言 `annexbKey=true`、`annexbDelta=false`、`avcKey=true`。
- 真实 Mac `43770` / `build=db48055` H.264 强校验通过：诊断条显示 `PID 97112` / `build db48055`，`avc1.420029:annexb` 解码到 1920×1080 canvas，实收约 30.9 FPS，`H264Errors=0`，recent logs 无 H.264 解码失败。
遗留问题：
- 这轮只修控制端解码前关键帧判断；H.264 端到端延迟、动态画面和长时间观感仍需继续验收。
下一步建议：
- 后续改 Windows 控制端视频、缩放或输入路径时，继续跑 `test-windows-client-browser --requireH264`，确保真实 H.264 画布解码和 `H264Errors=0` 同时成立。
是否改了协议：否。
是否需要另一端配合：否；Windows 端可拉取后在真实控制端复跑同一命令确认。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：新增 Windows host 一键体检入口，把真机联调前常用的环境、局域网、音频、输入和可选采集检查聚合起来，减少手动排查。
完成内容：
- 新增 `scripts/windows/check-windows-host-readiness.mjs`。
- 默认低风险检查：Node.js、FFmpeg、Windows host 语法、Windows input helper 安全干跑、音频设备/WASAPI 格式、局域网/防火墙只读检查。
- 支持 `--probeVideo` 临时启动 Windows host 做短视频帧观察，支持 `--probeAudio` 临时启动 Windows host 做 WASAPI PCM 短观察；默认不播放测试音、不发送真实输入。
- 支持 `--requireOpen`，在 Windows host 已手动监听 `0.0.0.0:43770` 后可强制要求端口可达。
- 支持 `--json` 和 `--strict`，方便后续纳入自动回归。
- Windows host README、当前状态、下一步和占用记录已同步。
修改文件：
- `scripts/windows/check-windows-host-readiness.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node scripts/windows/check-windows-host-readiness.mjs --timeoutMs 20000`
- `node scripts/windows/check-windows-host-readiness.mjs --timeoutMs 20000 --json`
- `node scripts/windows/check-windows-host-readiness.mjs --probeVideo --probeAudio --timeoutMs 25000`
验证结果：
- 默认体检 6/6 通过：Node v24.15.0、FFmpeg 8.1.1、Windows host syntax、input helper 安全干跑、WASAPI 48k/2ch/float32、LAN/firewall 只读检查。
- 默认模式报告 `43770` 未监听为 warning，不视为失败；这是预期行为，因为未手动启动 Windows host。
- 深度体检 8/8 通过，临时视频观察和 WASAPI 音频观察均完成。
遗留问题：
- `--requireOpen` 需要先手动启动 Windows host 到目标端口；当前默认检查不会自动修改防火墙。
下一步建议：
- Mac 反控 Windows 真机联调前，先跑默认一键体检；启动 Windows host 后再跑 `--requireOpen`；需要确认采集链路时加 `--probeVideo --probeAudio`。
是否改了协议：否。
是否需要另一端配合：不阻塞 Mac；这是 Windows host 侧联调前置检查入口。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：给 Windows 控制端页面级自检增加真实 `/discovery.runtime` UI 验收，方便 Mac host 重启后不用密码确认设备列表和诊断条显示的是目标 build。
完成内容：
- `scripts/windows/test-windows-client-browser.mjs` 新增 `--expectDiscoveryRuntimeBuildId <build-id>`。
- 参数启用时，脚本会打开 Windows 控制端页面、填入 `--host/--port`、执行页面“刷新设备”，并断言在线设备列表和诊断条都显示目标 build。
- 该检查可配合 `--diagnosticsOnly` 使用，不发送密码、不进入远控会话、不发送输入事件。
- Windows client README、当前状态、下一步和占用记录已同步该命令。
修改文件：
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node --check apps/windows-client/app.js`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --host 192.168.31.122 --port 43770 --expectDiscoveryRuntimeBuildId db48055 --timeoutMs 45000`
验证结果：
- 真实 Mac host 43770 无密码 discovery UI 验收通过。
- 输出确认设备列表和诊断条均显示 `PID 97112`、`build db48055`，示例诊断条：`诊断：运行：PID 97112 / 已运行 7m / 启动 06/12 17:11 / build db48055`。
遗留问题：
- 该检查只覆盖 `/discovery.runtime` 到 Windows 控制端 UI 的显示，不进入真实远控会话；H.264/WebCodecs、PCM 播放和输入仍按既有真实连接脚本验收。
下一步建议：
- 每次 Mac host 设置新 `LAN_DUAL_BUILD_ID` 并重启后，先跑该无密码 UI 检查，再跑需要密码的真实连接/H.264/PCM 验收。
是否改了协议：否。
是否需要另一端配合：不阻塞；本轮已用 Mac 43770 `buildId=db48055` 验收通过。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：把 Mac host 新增的可选 `runtime` 诊断接入 Windows 控制端，方便判断当前连接是不是旧进程或旧 build。
完成内容：
- Windows 控制端连接 WebSocket 被控端前会轻量探测同地址 `/discovery`；如果返回 `runtime`，会写入设备列表并在连接成功后的诊断条显示。
- 诊断条新增“运行”段，显示 `PID`、已运行时长、启动时间和 `build`；后续 `display_settings_ack` 如果带 `runtime` 也会更新，不带时保留已有信息。
- 设备列表在线项会显示 runtime 摘要；未连接时选择设备可预览 runtime，已连接时不会误把其他设备 runtime 覆盖到当前诊断。
- 页面级 `--diagnosticsOnly` 自检新增 runtime 显示和保持逻辑，确认 H.264 回退原因清除时不会把 runtime 清掉。
修改文件：
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
验证结果：
- 浏览器诊断自检通过：悬浮控制中心、黑边输入防护、`streamFallbackReason` 显示/清除和 runtime 显示/保持均通过。
- 自检诊断条示例：`运行：PID 12345 / 已运行 2h 2m / 启动 06/12 16:00 / build runtime-test`。
遗留问题：
- 这轮没有改高冲突的 `protocol-client.js`，因此 `hello_ack.runtime` 仍由连接前 `/discovery` 快探承担显示来源；如果未来出现只支持 WebSocket hello、不提供 `/discovery` 的 host，可再考虑把 hello_ack 暴露给页面层。
- 还需用真实 Mac host 43770 跑一次 Windows 控制端真实连接，确认主服务重启到 runtime build 后诊断条显示真实 PID/build。
下一步建议：
- Mac host 重启或设置 `LAN_DUAL_BUILD_ID` 后，在 Windows 控制端连接真实 43770，确认诊断条和设备列表能看到目标 build。
- 继续做真实 H.264 动态画面、PCM 听感和输入注入安全验收。
是否改了协议：否；只消费 Mac 已有的向后兼容可选 `runtime` 字段。
是否需要另一端配合：不阻塞；真实 43770 runtime 展示验收需要 Mac host 运行最新 build。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：补 Windows host 防火墙和局域网可达性只读自检，方便 Mac 反控 Windows 真机联调前快速判断是不是服务监听地址或 Windows 防火墙问题。
完成内容：
- 新增 `scripts/windows/check-windows-firewall.mjs`，默认只读检查本机局域网 IPv4、目标端口监听地址、loopback/LAN TCP 探测、当前网络配置、防火墙 profile 和 TCP 入站 allow 规则。
- 支持 `--host`、`--port`、`--timeoutMs`、`--requireOpen`、`--requireRule`、`--strict`、`--skipFirewall` 和 `--json`；默认不修改系统防火墙。
- 当缺少入站放行规则时，脚本会给出管理员 PowerShell 建议命令，例如 `New-NetFirewallRule ... -Profile Private`，但不会自动执行。
- Windows host README、当前状态、下一步和任务板已同步；任务板把“防火墙/局域网可达性只读检查脚本”标记完成，同时保留“桌面端防火墙友好提示和一键引导”为后续任务。
修改文件：
- `scripts/windows/check-windows-firewall.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-firewall.mjs`
- `node scripts/windows/check-windows-firewall.mjs --host 127.0.0.1 --port 43770 --timeoutMs 300`
- 临时启动 `apps/windows-host/server.mjs 43772 0.0.0.0`，再运行 `node scripts/windows/check-windows-firewall.mjs --host 0.0.0.0 --port 43772 --requireOpen --timeoutMs 700`
验证结果：
- 无 host 运行时，脚本能正常报告 `43770` 未监听，并提示启动 `node apps\windows-host\server.mjs 43770 0.0.0.0`。
- 临时 host 活体检查通过：监听 `0.0.0.0:43772`，`127.0.0.1:43772` 和本机 `192.168.31.68:43772` TCP 探测均 open。
- 本机当前网络 profile 为 Public；Windows 防火墙 profile 当前显示 disabled，因此缺少 allow rule 只作为 warning，不阻塞默认检查。
遗留问题：
- 这轮只做脚本和文档，没有把防火墙检查接入桌面 UI，也没有自动申请管理员权限添加规则。
- 真机 Mac 反控 Windows 前，仍需要在 Windows host 实际运行 `0.0.0.0:43770` 时跑一次 `--requireOpen`。
下一步建议：
- 桌面端后续可以在“启动 Windows 被控端/反控准备”页面调用该脚本或等价原生检查，把“只监听 127.0.0.1”“防火墙未放行”“当前网络是 Public”等情况转成中文提示。
是否改了协议：否。
是否需要另一端配合：否；Mac 端后续真机连接 Windows 前，可让 Windows 端先跑该脚本确认可达性。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：让 Mac display 自检可强制校验 runtime 诊断，部署/重启后确认当前连接的是目标进程和 build。
完成内容：
- `scripts/mac/check-mac-displays.mjs` 新增 `--requireRuntime`，要求 `/discovery` 和 `hello_ack` 都返回完整 `runtime`。
- 新增 `--expectBuildId <id>`，要求 `runtime.buildId` 匹配指定版本，并自动启用 runtime 强校验。
- 新增 `--maxRuntimeUptimeSeconds <sec>`，可用于确认刚重启的是新进程。
- 脚本会校验 `/discovery.runtime` 与 `hello_ack.runtime` 的 `processId` 和 `buildId` 一致。
- Mac host README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `scripts/mac/check-mac-displays.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-displays.mjs`
- `node scripts/mac/check-mac-displays.mjs --help`
- 临时启动新 host：`LAN_DUAL_HOST=127.0.0.1 LAN_DUAL_PORT=43771 LAN_DUAL_INPUT_MODE=log LAN_DUAL_BONJOUR=0 LAN_DUAL_BUILD_ID=runtime-assert-test .build/debug/lan-dual-mac-host`
- `node scripts/mac/check-mac-displays.mjs --port 43771 --timeoutMs 12000 --requireRuntime --expectBuildId runtime-assert-test`
- `node scripts/mac/check-mac-displays.mjs --port 43771 --timeoutMs 12000 --expectBuildId wrong-build` 预期失败
验证结果：
- 临时 `43771` 正向强校验通过：`/discovery` 和 `hello_ack` 均返回 `pid=79837`、`build=runtime-assert-test`、同一 `startedAt`，并完成 `main` 单屏 round-trip。
- 故意传入 `--expectBuildId wrong-build` 按预期失败：`discovery runtime buildId mismatch: runtime-assert-test !== wrong-build`。
- 主 `43770` 默认路径仍通过，输出 `runtime=missing`，说明当前主进程尚未重启到 runtime 版本，但默认兼容路径不受影响。
- 临时 `43771` 已停止，端口无残留监听。
遗留问题：
- 主 `43770` 仍未在本轮重启；runtime 强校验用于后续计划内重启/部署验证。
下一步建议：
- 重启主 `43770` 时设置 `LAN_DUAL_BUILD_ID=$(git rev-parse --short HEAD)`，再运行 `check-mac-displays --requireRuntime --expectBuildId <hash> --maxRuntimeUptimeSeconds 120`。
是否改了协议：否；只消费已有可选 runtime 诊断字段。
是否需要另一端配合：否。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：给 Mac host 增加运行时诊断，方便判断当前连接的是不是旧进程/旧二进制。
完成内容：
- `HostConfiguration` 新增可选 `LAN_DUAL_BUILD_ID`，未设置时为 `dev`。
- `/discovery` 和 `hello_ack` 新增可选 `runtime` 对象：`processId`、`startedAt`、`uptimeSeconds`、`buildId`。
- `scripts/mac/check-mac-displays.mjs` 的 discovery 输出会打印 runtime 摘要，便于常规自检时直接看到 PID/build/uptime。
- Mac host README、当前状态、下一步和文件占用已同步。
修改文件：
- `apps/mac-host/Sources/MacHost/HostConfiguration.swift`
- `apps/mac-host/Sources/MacHost/MacHostService.swift`
- `scripts/mac/check-mac-displays.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `swift build` in `apps/mac-host`
- `node --check scripts/mac/check-mac-displays.mjs`
- 临时启动新 host：`LAN_DUAL_HOST=127.0.0.1 LAN_DUAL_PORT=43771 LAN_DUAL_INPUT_MODE=log LAN_DUAL_BONJOUR=0 LAN_DUAL_BUILD_ID=runtime-test .build/debug/lan-dual-mac-host`
- `curl -sS http://127.0.0.1:43771/discovery`
- `node scripts/mac/check-mac-displays.mjs --port 43771 --timeoutMs 12000`
- 临时 WebSocket `hello` 小脚本检查 `hello_ack.runtime`
验证结果：
- 临时 `43771` discovery 返回 `runtime.processId=34539`、`buildId=runtime-test`、`startedAt=2026-06-12T08:43:22Z`、`uptimeSeconds` 正常递增。
- `check-mac-displays` 输出显示 `runtime pid=34539 build=runtime-test uptime=16s startedAt=...`，并完成 `main` 单屏 round-trip。
- `hello_ack.runtime` 也返回同一组 runtime 字段。
- 临时 `43771` 已停止，未重启主 `43770`。
遗留问题：
- 主 `43770` 仍需在合适时机重启到包含 runtime 诊断的新二进制；本轮为避免打断 Windows 侧，未重启主通道。
下一步建议：
- 之后重启/部署 Mac host 时设置 `LAN_DUAL_BUILD_ID=$(git rev-parse --short HEAD)` 或明确版本号，再用 `/discovery.runtime` 确认当前进程。
是否改了协议：否；新增向后兼容的可选诊断字段。
是否需要另一端配合：不阻塞；Windows 端可选择在诊断 UI 中展示 `runtime`。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：给 Mac 系统声音观察脚本补可选有声电平强校验，方便后续确认非静音系统声音确实进入 `audio_frame`。
完成内容：
- `scripts/mac/observe-mac-audio.mjs` 新增 `--requireLevel` 和 `--minLevel`，可要求观察窗口内最大电平达到阈值。
- 新增显式 `--playTone`，通过 macOS `afplay` 播放临时生成的短 WAV 测试音；默认关闭，不会自动发声。
- 新增 `--toneFrequency`、`--toneDurationMs`、`--toneDelayMs` 和 `--toneVolume`，并在结束时清理临时 WAV。
- README、当前状态、下一步、任务板和文件占用已同步。
修改文件：
- `scripts/mac/observe-mac-audio.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/observe-mac-audio.mjs`
- `node scripts/mac/observe-mac-audio.mjs --help`
- `node scripts/mac/observe-mac-audio.mjs --durationMs 2000 --minFrames 80 --maxGapMs 1000 --requireLevel --minLevel 0`
- `node scripts/mac/observe-mac-audio.mjs --durationMs 2200 --minFrames 80 --maxGapMs 1000 --playTone --toneVolume 0 --requireLevel --minLevel 0`
验证结果：
- 默认不发声观察路径通过：101 帧、约 49.9fps、最大间隔 22ms、payload 7680 bytes，当前电平 0。
- 静音测试音路径通过：111 帧、约 49.6fps、最大间隔 23ms，确认临时 WAV、`afplay` 调度和清理流程可跑通；由于 `toneVolume=0`，没有播放可听声音。
遗留问题：
- 真正的有声电平强校验还需要有人确认可发声后运行 `--playTone --requireLevel --minLevel 0.01`，并观察 Windows 控制端真实听感。
下一步建议：
- 有人看屏幕/可发声时，用 `node scripts/mac/observe-mac-audio.mjs --durationMs 4500 --minFrames 160 --maxGapMs 1000 --playTone --requireLevel --minLevel 0.01` 做本机有声强校验，再让 Windows 控制端连接 43770 评估听感和延迟。
是否改了协议：否。
是否需要另一端配合：不阻塞；真实听感和延迟验收需要 Windows 控制端后续配合。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：让 Mac 视频持续观察脚本也能校验帧级显示器来源，方便 H.264/JPEG 长观察同时确认没有采到错误显示器。
完成内容：
- `scripts/mac/observe-mac-video.mjs` 新增 `--displayId`，可指定 `session_offer.displayId`。
- 新增 `--requireFrameDisplayDiagnostic`，要求每个 `video_frame` 带 `activeDisplayId` 或兼容的 `displayId`。
- 新增 `--expectActiveDisplayId <id>`，自动开启帧级诊断要求，并要求每帧显示器 id 匹配。
- 视频统计摘要新增 `activeDisplayId` 和 `displayName` 分布。
- Mac host README、当前状态、下一步和文件占用已同步。
修改文件：
- `scripts/mac/observe-mac-video.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/observe-mac-video.mjs`
- `node scripts/mac/observe-mac-video.mjs --durationMs 3000 --requireH264 --minFrames 20 --maxGapMs 1000 --expectActiveDisplayId main`
- `node scripts/mac/observe-mac-video.mjs --durationMs 2000 --preferredVideoCodec mjpeg --requireRealVideo --minFrames 3 --maxGapMs 1000 --expectActiveDisplayId main`
验证结果：
- 真实 `43770` H.264 路径通过：88 帧、约 29.1fps、最大间隔 39ms，`activeDisplayId=main:88`、`displayName=主显示器:88`。
- 真实 `43770` JPEG 路径通过：33 帧、约 15.9fps、最大间隔 74ms，`activeDisplayId=main:33`、`displayName=主显示器:33`。
遗留问题：
- 当前仍是单屏真机证据；外接显示器后需要用 `--displayId <id> --expectActiveDisplayId <id>` 做多屏长观察。
下一步建议：
- 后续 H.264 长稳或动态画面观察都可以附带 `--expectActiveDisplayId main`，把帧率、pipeline 和显示器来源一起纳入验收。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：强化 Mac display 自检，避免旧 host 未重启到最新二进制时误通过。
完成内容：
- `scripts/mac/check-mac-displays.mjs` 默认要求 `video_frame.activeDisplayId` 存在且匹配当前显示器。
- 如果帧缺少 `activeDisplayId`，脚本现在默认失败，提示只有调试旧 host 时才加 `--allowMissingFrameDisplayDiagnostic` 放宽。
- 保留兼容开关 `--allowMissingFrameDisplayDiagnostic`，方便需要连接旧版本 host 时继续验证 discovery/session/display_settings ack 路径。
- README、当前状态、下一步和文件占用已同步。
修改文件：
- `scripts/mac/check-mac-displays.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-displays.mjs`
- `node scripts/mac/check-mac-displays.mjs --port 43770 --timeoutMs 12000`
- `node scripts/mac/check-mac-displays.mjs --port 43770 --timeoutMs 12000 --preferredVideoCodec h264`
验证结果：
- 最新真实 Mac host `43770` 默认 MJPEG/JPEG 路径通过，首帧和切换后帧均带 `activeDisplayId=main`。
- 显式 H.264 路径也通过，首帧和切换后帧均带 `activeDisplayId=main`。
遗留问题：
- 真实外接双屏切换仍需接显示器后再跑 `--switchDisplayId <display-id>`。
下一步建议：
- 后续重启或部署 Mac host 后先跑默认 `check-mac-displays`；如果它因缺少 `activeDisplayId` 失败，优先检查是否连到了旧进程。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：把 Mac host 新增的 H.264 启动回退原因显示到 Windows 控制端诊断条，避免用户只看到画面从 H.264 变成 JPEG 却不知道原因。
完成内容：
- `apps/windows-client/app.js` 新增 `hostDiagnostics.streamFallbackReason`，`display_settings_ack.streamFallbackReason` 会进入诊断状态并显示为“视频回退：...”，同时把诊断条标为 warning。
- 收到后续正常 `display_settings_ack` 或 H.264 视频帧时会清掉旧的 `streamFallbackReason`，避免回退原因残留。
- `scripts/windows/test-windows-client-browser.mjs` 新增 `--diagnosticsOnly`，可不连接被控端，仅打开页面检查悬浮控制中心、黑边输入防护和 stream fallback 诊断显示/清除逻辑。
- Windows 控制端 README、当前状态、下一步和任务板已同步该诊断覆盖点。
修改文件：
- `apps/windows-client/app.js`
- `apps/windows-client/README.md`
- `scripts/windows/test-windows-client-browser.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
验证结果：
- `--diagnosticsOnly` 通过：悬浮控制中心、黑边输入防护和 stream fallback 诊断均通过；诊断条示例显示“视频回退：H.264 启动超时，已回退 JPEG”。
遗留问题：
- 这轮验证的是页面诊断逻辑；还需要用真实 Mac host 43770 连接一次，确认真实 `streamFallbackReason` 文案能如期出现，并确认正常 H.264 不会误显示回退。
下一步建议：
- Mac host 重启到 77f4cfa 后，Windows 端可跑真实连接页面自检；如触发 watchdog，检查诊断条和事件日志是否同时出现回退原因。
是否改了协议：否，消费 Mac 端已新增的可选字段。
是否需要另一端配合：真实 43770 端到端回退/不误回退验收需要 Mac host 运行最新版；页面逻辑本轮不阻塞。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：给 Windows host 常驻 input helper 增加低风险延迟测量入口，方便区分输入通道延迟和视频/网络延迟。
完成内容：
- 新增 `scripts/windows/measure-windows-input-helper.mjs`：复用 `WindowsInputInjector` 的 system 模式，发送故意不支持的 dry-run 事件，测量 C# SendInput helper 的冷启动和热路径 JSON 往返耗时。
- 脚本不会发送真实鼠标键盘输入；它要求事件被 helper 明确拒绝，并确认常驻进程保持运行。
- 支持 `--samples`、`--warmup`、`--timeoutMs`、`--maxP95Ms`、`--maxAvgMs`、`--json` 和 `--verbose`，后续可直接作为回归阈值使用。
- Windows host README、当前状态、下一步和任务板已同步该测量入口。
修改文件：
- `scripts/windows/measure-windows-input-helper.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/measure-windows-input-helper.mjs`
- `node scripts/windows/measure-windows-input-helper.mjs --samples 20 --warmup 3`
- `node scripts/windows/measure-windows-input-helper.mjs`
验证结果：
- 50 样本测量和 `--maxP95Ms 10` 阈值检查通过：cold startup + dry-run round trip 约 450.20ms；warm avg 0.10ms、p50 0.09ms、p95 0.17ms、max 0.33ms；56 个请求复用同一 helper 进程。
遗留问题：
- 该脚本只测输入 helper 管道耗时，不代表真实控制手感；真实 `system` 模式点击/按键仍需有人看屏幕时验收。
- 用户感知卡顿仍可能来自视频采集/编码、浏览器事件频率、网络、坐标映射或远端权限。
下一步建议：
- 排查 Mac 反控 Windows 输入慢时，先跑该脚本确认 helper 热路径是否仍在毫秒级，再继续看视频和网络层。
- 有人看屏幕后，再运行 `test-windows-host.ps1 -InputEvents -InputMode system` 做真实输入安全验收。
是否改了协议：否。
是否需要另一端配合：否；真实 system 输入手感验收以后需要另一端或人工配合。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：降低 Mac 反控 Windows 时输入注入启动开销，让 Windows host 不再每个输入事件都临时启动 PowerShell。
完成内容：
- `apps/windows-host/src/windows-input-injector.mjs` 新增常驻 C# SendInput helper：首次 system 输入时用 PowerShell 编译临时 exe，后续通过 JSON 行协议复用该进程调用 `SendInput`/`SetCursorPos`。
- `apps/windows-host/src/windows-host-service.mjs` 的 `input_event` 处理改为等待异步注入结果再返回原有 `input_ack`，协议字段未变。
- 新增 `scripts/windows/test-windows-input-helper.mjs`：验证 log 模式、未知按键拒绝和常驻 helper JSON 往返；该脚本故意使用未知事件干跑，不发送真实鼠标键盘输入。
- Windows host README、当前状态、下一步和任务板已同步输入 helper 状态。
修改文件：
- `apps/windows-host/src/windows-input-injector.mjs`
- `apps/windows-host/src/windows-host-service.mjs`
- `scripts/windows/test-windows-input-helper.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node scripts/windows/test-windows-input-helper.mjs`
- `npm run check`（`apps/windows-host`）
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-host.ps1 -MockVideo -SkipClipboardText -SkipClipboardFile -InputEvents -InputMode log -TimeoutMs 15000`
- `node scripts/windows/test-mac-client-browser.mjs --timeoutMs 45000`
- `git diff --check`
遗留问题：
- 本轮没有发送真实 SendInput，避免无人值守误操作；真实 `system` 模式手感仍需有人看着屏幕时用 `test-windows-host.ps1 -InputEvents -InputMode system` 或 Mac client 真连验收。
- 低延迟输入还可能继续受浏览器事件频率、网络、坐标映射和 Windows 会话权限影响。
下一步建议：
- Mac 端或人工准备好安全环境后，再发联络板 call 做真实输入注入验收。
- Windows 端继续推进 Windows Graphics Capture / 正式编码管线，减少视频延迟。
是否改了协议：否。
是否需要另一端配合：真实 system 输入手感验收需要另一端或人工配合；本轮不阻塞。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：修复 H.264 启动阶段卡住时控制端长时间等首帧的问题。
完成内容：
- Mac host 新增 5 秒 H.264 启动 watchdog：如果 `SCStream` / `VTCompressionSession` 启动阶段迟迟没有建立 `videoStream`，自动回退 `background-jpeg`。
- 回退时发送 `display_settings_ack`，带 `streamFallbackReason`、`capturePipeline=background-jpeg`、实际 FPS、画质和显示器诊断字段，方便控制端显示真实状态。
- 复用上一轮 `videoStreamToken`：如果 H.264 在 watchdog 触发后才迟到启动成功，会被判定为旧流并立即停止，不会覆盖 JPEG 回退会话。
- 更新 Mac host README、当前状态、下一步和任务板，说明该回退是启动阶段兜底，不是替代 H.264 正常链路验收。
修改文件：
- `apps/mac-host/Sources/MacHost/MacHostService.swift`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `swift build` in `apps/mac-host`
- 临时启动新 Mac host：`LAN_DUAL_HOST=127.0.0.1 LAN_DUAL_PORT=43771 LAN_DUAL_INPUT_MODE=log LAN_DUAL_BONJOUR=0 .build/debug/lan-dual-mac-host`
- `node scripts/mac/check-mac-displays.mjs --port 43771 --timeoutMs 12000 --preferredVideoCodec h264`
验证结果：
- 显式 H.264 display 自检通过：脚本没有再 12 秒首帧超时，最终完成 `main` 单屏 round-trip。
- 临时 host 日志显示：先进入 `screencapturekit-h264` 会话，5 秒 watchdog 触发回退 `background-jpeg`；随后迟到的 H.264 流启动成功又立即停止，说明 token 防护生效。
遗留问题：
- 这轮验证的是“启动阶段卡住时自动回退”，不是 H.264 正常性能提升。
- 仍需在主 `43770` 单 host、动态画面和 Windows 控制端真实连接下确认正常 H.264 启动不被误回退，并继续观察端到端延迟。
下一步建议：
- Windows 控制端若看到 `streamFallbackReason`，应把它当作 H.264 启动失败/超时诊断，而不是纯网络断流。
- Mac 端后续可继续排查为什么临时第二 host 的 H.264 启动会贴近 5 秒超时，优先区分第二实例资源竞争和主链路问题。
是否改了协议：否，复用上一轮已新增的可选诊断字段，并沿用已有 `streamFallbackReason`。
是否需要另一端配合：不阻塞；需要 Windows 后续真实连接观察是否正确展示回退原因。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：补强 Mac host 显示器切换安全性，并给真实多显示器验收准备脚本。
完成内容：
- Mac host 的 H.264 视频流启动、帧回调和失败回退增加 `videoStreamToken` generation 防护；切换 `display_settings` 或断开连接后，旧异步流迟到返回不会覆盖新会话。
- Mac host 的系统音频流增加 `audioStreamToken` generation 防护；切换音频/显示设置后旧音频流迟到帧或失败回退不会重新打开旧 mock/real 音频。
- `video_frame` 增加向后兼容的可选诊断字段 `activeDisplayId` 和 `displayName`，用于确认当前帧来自哪个被控端显示器。
- 新增 `scripts/mac/check-mac-displays.mjs`，只读验证 `/discovery`、`session_answer.displays`、`session_answer.activeDisplayId`、`display_settings_ack.activeDisplayId` 和切换后的 `video_frame` display 诊断；默认请求 MJPEG/JPEG，H.264 可显式加 `--preferredVideoCodec h264`。
- 同步 Mac host README、当前状态、下一步和任务板；真实外接双屏切换仍保留为待验收项。
修改文件：
- `apps/mac-host/Sources/MacHost/MacHostService.swift`
- `scripts/mac/check-mac-displays.mjs`
- `docs/03-architecture-and-protocol.md`
- `shared/protocol/messages.example.json`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-displays.mjs`
- `swift build` in `apps/mac-host`
- 临时启动新 Mac host：`LAN_DUAL_HOST=127.0.0.1 LAN_DUAL_PORT=43771 LAN_DUAL_INPUT_MODE=log LAN_DUAL_BONJOUR=0 .build/debug/lan-dual-mac-host`
- `node scripts/mac/check-mac-displays.mjs --port 43771 --timeoutMs 12000`
验证结果：
- Swift 编译通过。
- 当前真机单屏环境识别 `displays=main*:1920x1080`。
- 默认 MJPEG/JPEG 显示器脚本通过：`session_answer` active display 为 `main`，首帧带 `activeDisplayId=main` / `displayName=主显示器`，`display_settings_ack` 和切换后帧仍为 `main`。
- 显式 H.264 版本在临时第二 host 上曾进入 `screencapturekit-h264` 会话但 12 秒内未收到首帧；本轮未把它作为显示器脚本默认门槛，后续应单独排查临时第二 host/H.264 首帧等待和动态画面触发。
遗留问题：
- 当前只有单屏真机证据，外接显示器后的真实 `main -> display-*` 采集切换仍待验收。
- H.264 首帧在临时第二 host 上的 12 秒超时需要后续独立复查；主 43770 既有 H.264 基线不因此改判。
下一步建议：
- 接上外接显示器后运行 `node scripts/mac/check-mac-displays.mjs --switchDisplayId <display-id>`，再让 Windows 控制端用显示器下拉验证真实双屏切换画面。
- 如果继续处理 H.264 首帧问题，优先用动态画面和单 host 环境复测，避免把第二实例资源竞争误判为主链路退化。
是否改了协议：是，向后兼容新增 `video_frame.activeDisplayId` / `displayName` 可选诊断字段；旧控制端可忽略。
是否需要另一端配合：不阻塞 Windows；真实双屏 UI 验收需要 Windows 控制端后续配合。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：把真实 Mac host 的 5 分钟只读长稳观察结果记录清楚，并区分 PCM 稳定性与空闲桌面视频实收 FPS。
完成内容：
- 对真实 Mac host `127.0.0.1:43770` 做 5 分钟系统声音 PCM 只读观察，确认长时间帧节奏稳定。
- 对同一 host 做 5 分钟 H.264 只读观察；连接、认证和 H.264 管线均稳定，但空闲/低变化桌面下实收 FPS 明显低于协商 30Hz。
- 追加 60 秒 H.264 低门槛复测和 60 秒 JPEG 对照，确认低实收 FPS 不是单次断链，而是当前空闲桌面下的稳定表现。
- 明确后续不要把 `--minFps 25` 当作空闲桌面长观察硬门槛；需要动态画面或 Windows 控制端真实操作时再做高 FPS 强校验。
修改文件：
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `curl -s http://127.0.0.1:43770/discovery`
- `node scripts/mac/observe-mac-audio.mjs --durationMs 300000 --minFrames 14000 --maxGapMs 1000`
- `node scripts/mac/observe-mac-video.mjs --durationMs 300000 --requireH264 --requireRealVideo --minFrames 8500 --minFps 25 --maxGapMs 1000`
- `node scripts/mac/observe-mac-video.mjs --durationMs 60000 --requireH264 --requireRealVideo --minFrames 300 --minFps 5 --maxGapMs 1000`
- `node scripts/mac/observe-mac-video.mjs --durationMs 60000 --preferredVideoCodec mjpeg --requireRealVideo --minFrames 1500 --minFps 25 --maxGapMs 1000`
验证结果：
- `/discovery` 正常：`inputMode=log`、`screenRecording=true`、`accessibility=true`、`h264Stream=true`、`audioMode=system-pcm`、主显示器 `1920x1080`。
- 音频 5 分钟通过：15001 帧，50.0fps，平均/最大间隔 20.0/31ms，payload 恒定 7680 bytes，总 payload 约 115 MB，电平 0。
- H.264 5 分钟高门槛观察未达 FPS 阈值：3168 帧，约 10.6fps，低于 `minFps 25`；这次作为空闲桌面实收 FPS 发现记录，不作为运行代码失败。
- H.264 60 秒低门槛复测通过：654 帧，约 10.9fps，平均/最大间隔 91.6/883ms，全部为 `h264` / `annexb-base64` / `screencapturekit-h264` / `screen`。
- JPEG 60 秒高门槛对照也未达 25fps：983 帧，约 16.4fps，说明当前空闲桌面下视频实收 FPS 会低于协商值，后续应继续看动态画面和端到端观感。
遗留问题：
- 需要在有持续画面变化的场景下重新跑 H.264 长观察，确认动态内容是否回到接近 30fps。
- 需要 Windows 控制端真实连接时同步观察端到端延迟、WebCodecs 渲染、音频听感和 CPU/网络占用。
- 系统音频本轮仍是静音电平 0，只能证明 PCM 帧节奏稳定，不能证明真实听感。
下一步建议：
- Mac 端继续跑动态画面 H.264 长稳和 CPU 采样；如果要用脚本强校验 FPS，应把空闲桌面和动态画面分开设阈值。
- Windows 端连接真实 Mac 时继续显示实收 FPS，不要只看协商 `fps`；遇到静态桌面低 FPS 先确认是否仍有小 gap 和真实帧，而不是直接判定断流。
是否改了协议：否。
是否需要另一端配合：动态画面、端到端延迟和真实听感验收需要 Windows 控制端配合；本轮不阻塞。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：把 Windows 控制端“实收 FPS / 协商 Hz”显示固化进页面级回归。
完成内容：
- `scripts/windows/test-windows-client-browser.mjs` 连接成功后现在会等待刷新率卡片出现数值型 `实收 FPS` 和 `协商 Hz`。
- 失败快照会额外输出最后一次 FPS 文案，方便判断是无画面、低帧率，还是 UI 文案被改坏。
- Windows 控制端 README 已同步该自检覆盖点。
修改文件：
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `git diff --check`
- 冲突标记搜索：docs/apps/scripts 范围无命中。
- 本地假 Mac 页面级回归：`node scripts/windows/test-windows-client-browser.mjs --host 127.0.0.1 --port 43773 --password demo-password --timeoutMs 45000`，输出 `FPS: 实收 7.5 FPS · 协商 60 Hz`。
遗留问题：
- 这轮只固化诊断显示；实际帧率提升仍依赖 Mac host/Windows host 视频采集和编码链路。
下一步建议：
- 用户反馈“感觉没有 60Hz”时，先看刷新率卡片里的实收 FPS，再对照协商 Hz 和请求 Hz 定位问题层。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：把 Windows host 普通启动 60Hz 验证固化进 Mac client 页面级回归。
完成内容：
- `scripts/windows/test-mac-client-browser.mjs` 现在会断言 `session_answer.fps/requestedFps/maxScreenFps` 都是 60。
- 切换高清预设后的 `display_settings_ack` 也会断言 `fps/requestedFps/maxScreenFps` 都是 60，页面状态必须显示 `60 Hz`。
修改文件：
- `scripts/windows/test-mac-client-browser.mjs`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/test-mac-client-browser.mjs --timeoutMs 45000`
遗留问题：
- 这轮只补页面级自动化断言；真实 Mac 端主观 60Hz 体验仍需真机连接 Windows host 观察。
下一步建议：
- 每次改 Windows host 视频默认值或 Mac client 视频参数控件后，都跑默认 `test-mac-client-browser.mjs`。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：让 Windows host 普通启动时也能默认响应 Mac client 的 60 Hz 请求，避免 60Hz 选项只在测试环境生效。
完成内容：
- FFmpeg gdigrab 模式的 `LAN_DUAL_WINDOWS_MAX_SCREEN_FPS` 默认值从 30 提升到 60；仍可显式设置环境变量降到 30 以节省资源。
- `scripts/windows/test-mac-client-browser.mjs` 不再给临时 Windows host 强制注入 `LAN_DUAL_WINDOWS_MAX_SCREEN_FPS=60`，页面级自检会验证真实默认配置。
- `scripts/windows/observe-windows-host-video.mjs` 新增 `--useDefaultMaxScreenFps` 和 `--expectSessionFps`，可专门防止默认上限退回 30。
- Windows host README、当前状态、下一步和任务板已同步普通启动 60Hz 验证方式。
修改文件：
- `apps/windows-host/src/windows-screen-capture.mjs`
- `apps/windows-host/README.md`
- `scripts/windows/observe-windows-host-video.mjs`
- `scripts/windows/test-mac-client-browser.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-host/src/windows-screen-capture.mjs`
- `node --check scripts/windows/observe-windows-host-video.mjs`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/observe-windows-host-video.mjs --fps 60 --useDefaultMaxScreenFps --expectSessionFps 60 --durationMs 4000 --minFrames 140 --minFps 35 --maxGapMs 1000 --json`
- `node scripts/windows/test-mac-client-browser.mjs --timeoutMs 45000`
- `node scripts/windows/test-mac-client-browser.mjs --requireAudio --timeoutMs 45000 --clientPort 5192 --debugPort 9343 --skipFileClipboard`
验证结果：
- 普通启动默认上限观察通过：会话 `fps=60`、`maxScreenFps=60`，4 秒收到 228 帧，约 56.92 FPS，最大间隔 40ms，掉帧 6。
- Mac client 页面级回归通过：临时 Windows host 普通启动，日志显示 1920x1080 / 60 Hz 和 2K / 60 Hz。
- `--requireAudio` 回归通过：WASAPI PCM 播放计数递增，视频仍协商 60 Hz。
遗留问题：
- FFmpeg gdigrab + MJPEG 仍是过渡采集层，60Hz 下会增加 CPU、网络和 JSON/base64 压力；低延迟日常体验仍应继续推进 Windows Graphics Capture + 正式编码管线。
下一步建议：
- 真机 Mac 控制 Windows 时重点对照 30/60Hz 的主观流畅度、CPU、延迟和带宽；必要时 UI 可加“省电/性能”提示。
- 以后改 Windows host 视频默认值时，加跑 `--useDefaultMaxScreenFps --expectSessionFps 60`。
是否改了协议：否。
是否需要另一端配合：暂无阻塞；真机主观 60Hz 体验需要 Mac 端连接 Windows host。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：让 Windows 被控端真正按控制端下发的码率/Mbps 调整 MJPEG/JPEG 压缩质量。
完成内容：
- Windows host 现在会把既有 `qualityPreset` 和 `maxBandwidthKbps` 换算为实际 `jpegQuality`，并用于 FFmpeg gdigrab MJPEG 的 `-q:v` 以及 System.Drawing JPEG 质量。
- 未设置 `LAN_DUAL_WINDOWS_JPEG_QUALITY` 时自动按码率计算；设置该环境变量时仍可强制覆盖质量，便于后续排查。
- `session_answer`、`display_settings_ack` 和 `video_frame` 现在会带回 `qualityPreset`、`maxBandwidthKbps` 和 `jpegQuality`，对齐既有协议诊断字段。
- `observe-windows-host-video.mjs` 输出请求码率、实际会话码率和 JPEG 质量；`test-mac-client-browser.mjs` 增加 Windows host 回执断言，确认默认 20 Mbps 和高清 40 Mbps 真正被接收。
修改文件：
- `apps/windows-host/src/windows-screen-capture.mjs`
- `apps/windows-host/src/windows-host-service.mjs`
- `apps/windows-host/README.md`
- `scripts/windows/observe-windows-host-video.mjs`
- `scripts/windows/test-mac-client-browser.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `npm.cmd run check` in `apps/windows-host`
- `node --check scripts/windows/observe-windows-host-video.mjs`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/observe-windows-host-video.mjs --fps 30 --bandwidthKbps 5000 --qualityPreset smooth --durationMs 3000 --minFrames 60 --minFps 20 --maxGapMs 1000 --json`
- `node scripts/windows/observe-windows-host-video.mjs --fps 30 --bandwidthKbps 40000 --qualityPreset sharp --durationMs 3000 --minFrames 60 --minFps 20 --maxGapMs 1000 --json`
- `node scripts/windows/test-mac-client-browser.mjs --timeoutMs 45000`
- `node scripts/windows/test-mac-client-browser.mjs --expectAuthFailure --expectedAttemptsRemaining 2 --expectedMaxAttempts 3 --timeoutMs 30000 --clientPort 5191 --debugPort 9342`
- `node scripts/windows/test-mac-client-browser.mjs --requireAudio --timeoutMs 45000 --clientPort 5192 --debugPort 9343 --skipFileClipboard`
验证结果：
- 5 Mbps / smooth 观察通过：87 帧、约 28.95 FPS、`maxBandwidthKbps=5000`、`jpegQuality=0.35`、平均帧约 43 KB。
- 40 Mbps / sharp 观察通过：87 帧、约 28.99 FPS、`maxBandwidthKbps=40000`、`jpegQuality=0.78`、平均帧约 81 KB。
- Mac client 页面级回归、认证失败回归和真实 WASAPI PCM 播放回归均通过。
遗留问题：
- 这仍是 JPEG/MJPEG 过渡管线，`maxBandwidthKbps` 现在用于压缩质量估算，不是严格恒定码率控制；正式恒定码率应放到 Windows Graphics Capture + 视频编码管线处理。
下一步建议：
- Mac 真机控制 Windows host 时对照 5/20/40 Mbps，观察画质、延迟、CPU 和网络占用。
- 后续做 Windows Graphics Capture 或 H.264/Opus 管线时，把 `maxBandwidthKbps` 映射到编码器目标码率。
是否改了协议：否；复用既有 `qualityPreset`、`maxBandwidthKbps` 和 `jpegQuality` 诊断字段。
是否需要另一端配合：暂无阻塞；真机主观画质和延迟验收需要 Mac 端连接 Windows host。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：补一个只允许 `inputMode=log` 的 Mac 输入事件冒烟脚本，为后续真实 `inject` 验收加安全护栏。
完成内容：
- 新增 `scripts/mac/smoke-mac-input-log.mjs`。
- 脚本会先读取 `/discovery`，只有发现 `inputMode=log` 时才会认证、建会话并发送输入事件；如果传入非 `log` 期望或 host 当前不是 `log`，会直接失败退出。
- 冒烟事件覆盖鼠标移动、左键按下/抬起、右键按下/抬起、滚轮、`Ctrl+A`、`Command+C`、`metaKey` fallback、`Option+ArrowLeft`、`Shift+Tab`、`Return`/`Esc`/`ForwardDelete` 同义键、`F13` 和小键盘。
- 每个事件都校验 `input_ack.inputId`、`sequence`、`event`、`accepted=true`、`mode=log`、`injected=false`。
- Mac host README、当前状态、下一步和任务板已补充脚本用途。
修改文件：
- `scripts/mac/smoke-mac-input-log.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/smoke-mac-input-log.mjs`
- `node scripts/mac/smoke-mac-input-log.mjs`
- `node scripts/mac/smoke-mac-input-log.mjs --expectInputMode inject`
验证结果：
- 真机 `127.0.0.1:43770` / `inputMode=log` 冒烟通过：16/16 个输入事件全部收到 `input_ack`，且 `mode=log`、`injected=false`。
- 非 log 期望拒绝路径通过：传 `--expectInputMode inject` 时，脚本在 discovery 后直接报错，不发送输入事件。
遗留问题：
- 这轮仍不切 `LAN_DUAL_INPUT_MODE=inject`，不会真实移动鼠标或按键；真实注入仍需人工在屏幕前确认安全环境后再做。
- 该脚本验证 ack 和日志模式护栏，不验证 macOS 实际输入效果。
下一步建议：
- 每次准备做真实输入注入前先跑 `node scripts/mac/smoke-mac-input-log.mjs`，确认协议事件和 ack 仍正常。
- 下一步可以设计人工确认式 `inject` 小步验收：单次鼠标移动到安全坐标、单键功能键、再到组合键，且每步都可立即停止。
是否改了协议：否。
是否需要另一端配合：否；后续真实 `inject` 验收建议人工或 Windows 端配合观察。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：给 Mac 控制 Windows 原型补齐视频参数控制，让反控链路也能选择分辨率、刷新率和码率。
完成内容：
- `apps/mac-client` 新增画质、分辨率、刷新率和码率控件：1080P/2K/4K，30/60/120/144/240 Hz，5/10/15/20/40/50 Mbps。
- 默认“均衡”为 1080P / 60 Hz / 20 Mbps；“高清”为 2K / 60 Hz / 40 Mbps；连接时 `session_offer` 使用当前控件值。
- 连接中修改画质/视频参数会立即发送 `display_settings`，并保持当前音频开关和音量字段，避免调视频时误关声音。
- `scripts/windows/test-mac-client-browser.mjs` 新增视频参数断言：默认会话请求 1080P/60Hz/20Mbps，切换高清后发送 2K/60Hz/40Mbps 并收到 `display_settings_ack`。
- Windows host 视频观察确认 60 Hz 请求下 FFmpeg gdigrab 过渡层可到约 56 FPS。
修改文件：
- `apps/mac-client/index.html`
- `apps/mac-client/styles.css`
- `apps/mac-client/app.js`
- `apps/mac-client/README.md`
- `scripts/windows/test-mac-client-browser.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/mac-client/app.js`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `git diff --check`
- `node scripts/windows/observe-windows-host-video.mjs --fps 30 --durationMs 4000 --minFrames 80 --minFps 20 --maxGapMs 1000 --timeoutMs 25000`
- `node scripts/windows/observe-windows-host-video.mjs --fps 60 --durationMs 4000 --minFrames 120 --minFps 35 --maxGapMs 1000 --timeoutMs 25000`
- `node scripts/windows/test-mac-client-browser.mjs --timeoutMs 45000`
- `node scripts/windows/test-mac-client-browser.mjs --expectAuthFailure --expectedAttemptsRemaining 2 --expectedMaxAttempts 3 --timeoutMs 30000 --clientPort 5191 --debugPort 9342`
- `node scripts/windows/test-mac-client-browser.mjs --requireAudio --timeoutMs 45000 --clientPort 5192 --debugPort 9343 --skipFileClipboard`
验证结果：
- Windows host 30 Hz 观察：117 帧 / 29.18 FPS / 最大间隔 48 ms。
- Windows host 60 Hz 观察：225 帧 / 56.18 FPS / 最大间隔 40 ms / 掉帧 8。
- Mac client 完整页面回归通过：默认 1080P/60Hz/20Mbps，会话成功后切换 2K/60Hz/40Mbps，输入、快捷键、文本剪贴板、本机剪贴板监听和文件剪贴板均通过。
- 认证失败路径仍通过：页面保留 `认证失败 · 剩余 2/3 次`。
- `--requireAudio` 仍通过：真实 WASAPI PCM payload 7680 bytes，页面播放计数递增。
遗留问题：
- Mac client 仍只显示 JPEG/data-url；后续可接 H.264/WebCodecs 或原生解码。
- 60 Hz 真实观感、延迟和 CPU 占用还需要 Mac 真机控制 Windows host 继续验收。
下一步建议：
- Mac 真机连接 Windows host 时优先试默认 1080P/60Hz/20Mbps，再试 2K/60Hz/40Mbps；Windows 端同步跑 `observe-windows-host-video --useExisting --fps 60` 记录实际帧率。
是否改了协议：否；复用已有 `session_offer` 和 `display_settings` 字段。
是否需要另一端配合：后续真实 Mac 操控 Windows 的观感验收需要 Mac 端配合，本轮 Windows 本机页面级回归已通过。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：对真实 Mac host 做只读长观察，确认 H.264、PCM 音频和连续重连在当前真机上更接近日常试用稳定性。
完成内容：
- 真实 Mac host `/discovery` 确认仍在 `127.0.0.1:43770`，`inputMode=log`，`screenRecording=true`，`accessibility=true`，`h264Stream=true`，`audioMode=system-pcm`，主显示器 `1920x1080`。
- 使用 `observe-mac-audio` 做 30 秒只读系统声音帧观察，验证 `pcm-f32le-base64` 节奏稳定。
- 使用 `observe-mac-video` 做 30 秒 H.264 只读视频帧观察，验证 `screencapturekit-h264` 帧节奏稳定。
- 使用 `stress-mac-host` 做 50 次连续连接回归，验证每次都能拿到 H.264 首帧和真实 PCM 音频帧，且监听进程 FD 未增长。
修改文件：
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `curl -sS http://127.0.0.1:43770/discovery`
- `node scripts/mac/observe-mac-audio.mjs --durationMs 30000 --minFrames 250 --maxGapMs 1000`
- `node scripts/mac/observe-mac-video.mjs --durationMs 30000 --requireH264 --minFrames 600 --minFps 20 --maxGapMs 1000`
- `node scripts/mac/stress-mac-host.mjs --iterations 50 --expectInputMode log --requireH264 true --requireAudio true`
验证结果：
- 音频 30 秒通过：1501 帧，约 50.0fps，平均/最大间隔 20.0/24ms，payload 恒定 7680 bytes，电平 0。
- H.264 30 秒通过：877 帧，约 29.2fps，平均/最大间隔 34.3/45ms，全部为 `h264` / `annexb-base64` / `screencapturekit-h264` / `screen`。
- 连续重连 50/50 通过：每次首帧 H.264 都包含 SPS/PPS/IDR，每次音频帧均为 `pcm-f32le-base64`、48kHz、2ch、960 frames；监听进程 RSS `79376->80656 KB`，FD `30->30`。
遗留问题：
- 本轮系统音频电平为 0，说明测试窗口内无可听系统输出或处于静音；PCM 帧节奏稳定，但真实听感、音量变化和非静音内容仍需继续验收。
- 仍未切到 `LAN_DUAL_INPUT_MODE=inject` 做真实输入注入；中文输入法、组合键时序和多显示器采集切换仍是后续重点。
下一步建议：
- Mac 端后续做 5-10 分钟 H.264/PCM 长稳观察，并补 CPU 占用记录；若 Windows 控制端同时连接，记录端到端延迟和听感。
- 真实输入注入前先准备更细的安全脚本或人工步骤，继续默认用 `inputMode=log` 联调。
是否改了协议：否。
是否需要另一端配合：暂不需要；若要验证真实听感和端到端延迟，需要 Windows 控制端配合连接。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：增强 Mac 输入映射静态自检，防止后续改键位时误删同义键或修饰键 fallback。
完成内容：
- `scripts/mac/check-input-keymap.mjs` 新增 `KeyboardEvent.code` 同义项覆盖：`Return`、`ForwardDelete`、`Help`、`OSLeft`、`OSRight`、`NumLock`。
- `event.key` 覆盖新增别名组：`return`、`esc`、`del`、`forwarddelete`、`help`、`command`、`option`、`ctrl`、`space`。
- 新增 `eventFlags` 静态检查，确认 `meta/command`、`alt/option`、`ctrl/control`、`shift` 都有对应 `CGEventFlags`，并保留无 `remoteModifiers` 时的 `metaKey/altKey/ctrlKey/shiftKey` fallback。
- JSON 输出中加入 `modifierFlags` 结果，便于后续自动化读取。
- Mac host README、当前状态、下一步和任务板已同步说明。
修改文件：
- `scripts/mac/check-input-keymap.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-input-keymap.mjs`
- `node scripts/mac/check-input-keymap.mjs`
- `node scripts/mac/check-input-keymap.mjs --json`
验证结果：
- `KeyboardEvent.code` 覆盖通过：原有字母/数字/符号/导航/修饰键/F1-F20/小键盘全通过，新增 aliases 6/6。
- `event.key` 覆盖通过：原有 text/navigation/modifiers/function/numpad 全通过，新增 aliases 9/9。
- `modifier flag coverage` 通过：command 4/4、alternate 4/4、control 4/4、shift 3/3。
遗留问题：
- 这轮不改变真实输入注入行为；中文输入法、组合键时序和真实 `inject` 模式仍需人工或更高层探针验证。
下一步建议：
- 后续改 `InputEventInjector.swift` 键盘映射、快捷键兼容或修饰键逻辑时，把 `node scripts/mac/check-input-keymap.mjs` 作为必跑回归。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：继续验证 Windows 被控端 WASAPI loopback 稳定性，并补有声电平强校验入口。
完成内容：
- `scripts/windows/observe-windows-host-audio.mjs` 新增显式 `--playTone`：运行观察时通过系统默认播放设备播放短 WAV 测试音，默认关闭。
- 新增 `--requireLevel` / `--minLevel`：可要求稳态观察期间最大电平达到阈值，证明 WASAPI loopback 捕获到了真实系统输出，而不仅是静音 PCM 帧。
- 测试音参数支持 `--toneFrequency`、`--toneDurationMs`、`--toneDelayMs`、`--toneVolume`。
- Windows host README、当前状态、下一步和任务板已补充 30 秒长稳与测试音电平验收结果。
修改文件：
- `scripts/windows/observe-windows-host-audio.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/observe-windows-host-audio.mjs`
- `node scripts/windows/observe-windows-host-audio.mjs --durationMs 30000 --minFrames 1200 --minFps 40 --maxGapMs 1000 --timeoutMs 45000`
- `node scripts/windows/observe-windows-host-audio.mjs --durationMs 4500 --minFrames 160 --minFps 40 --maxGapMs 1000 --timeoutMs 25000 --playTone --requireLevel --minLevel 0.02`
- `node scripts/windows/observe-windows-host-audio.mjs --durationMs 2500 --minFrames 80 --minFps 40 --maxGapMs 1000 --timeoutMs 20000`
- `git diff --check`
验证结果：
- 30 秒 WASAPI 长稳观察通过：1482 帧，稳态 50 FPS，最大间隔 33 ms，payload 固定 7680 bytes。
- 测试音强校验通过：208 帧，稳态 49.93 FPS，最大间隔 33 ms，电平 min/avg/max 为 `0/0.0815/0.222`。
- 默认无测试音路径仍通过：107 帧，稳态 50.28 FPS，最大间隔 32 ms，电平为 0。
遗留问题：
- 还需要 Mac client 连接真实 Windows host 做主观听感、延迟和音量变化验收；本轮只证明 Windows host 采集、打包和电平检测正常。
下一步建议：
- 用 Mac client 连接 Windows host，并在 Windows 端同步运行 `observe-windows-host-audio --useExisting` 记录电平和帧间隔。
- 后续可跑 60 秒以上长稳，确认没有偶发大间隔或队列堆积。
是否改了协议：否。
是否需要另一端配合：本轮不需要；后续真实听感需要 Mac 端配合。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：增强 Windows 控制端远控画面黑边输入防护，避免窗口化/等比缩放时误操作远端。
完成内容：
- Windows 控制端在适应窗口黑边区域移动鼠标时会隐藏远端鼠标点，不再保留一个容易误导的位置。
- 黑边区域鼠标按下、滚轮和右键菜单不会发送远控输入；页面会提示“黑边区域不会发送远控输入”。
- 如果用户从真实画面内按下鼠标并拖到黑边再松开，会用最后一个有效画面坐标补发鼠标抬起，避免远端出现“按下没释放”的状态。
- `test-windows-client-browser.mjs` 新增黑边输入防护页面级回归：模拟黑边移动、黑边按下、画面内按下、黑边释放和黑边滚轮；测试时会临时接管发送函数计数，不向真实 Mac 发鼠标事件。
修改文件：
- `apps/windows-client/app.js`
- `apps/windows-client/styles.css`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-coordinate-mapping.mjs`
- `git diff --check`
- `node scripts/windows/test-windows-client-browser.mjs --host 192.168.31.122 --port 43770 --password <本机测试密码> --timeoutMs 45000 --requireH264`
- `node scripts/windows/test-windows-client-browser.mjs --host 192.168.31.122 --port 43770 --password <本机测试密码> --timeoutMs 45000 --requireH264 --injectPcmAudio`
验证结果：
- 页面级自检输出 `Black bar guard: move=true, down=true, release=true, wheel=true`。
- 真实 Mac H.264 验收仍通过：canvas `1920x1080`，`avc1.420029:annexb`，未回退 JPEG。
- H.264 + PCM 注入组合验收仍通过，页面声音状态出现 `播放 47`。
遗留问题：
- 当前只是控制端黑边/拖拽释放防护；真实输入注入仍需 Mac 端在 `inject` 模式下由人工或明确联调呼叫验收。
下一步建议：
- 后续改 Windows 控制端缩放、画布层级、全屏布局或输入事件时，继续跑 `test-windows-client-browser.mjs`，确保黑边防护不退化。
是否改了协议：否。
是否需要另一端配合：否；本轮只改 Windows 控制端输入层和自测。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：把 Windows 控制端真实 Mac H.264/WebCodecs 页面级自检做成可靠强校验。
完成内容：
- `scripts/windows/test-windows-client-browser.mjs` 新增 `--requireH264`，要求远端画面必须走 canvas/WebCodecs H.264 解码，且诊断中不能出现 JPEG 回退。
- 调整自动化浏览器启动参数，移除会让 Edge 判定 `avc1.420029:annexb` 不支持的 GPU/合成禁用参数；headless 模式保留视频解码所需的 GPU/合成能力。
- 保留 `--disable-gpu-sandbox` 和局域网 WebSocket 测试参数，避免扩大权限面。
- README、当前状态、下一步和 H.264 计划文档已同步，明确视频链路改动后应加跑 `--requireH264`。
修改文件：
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/09-streaming-video-plan.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `git diff --check`
- `node scripts/windows/test-windows-client-browser.mjs --host 192.168.31.122 --port 43770 --password <本机测试密码> --timeoutMs 45000 --requireH264`
- `node scripts/windows/test-windows-client-browser.mjs --host 192.168.31.122 --port 43770 --password <本机测试密码> --timeoutMs 45000 --requireH264 --injectPcmAudio`
- `node scripts/windows/test-windows-client-browser.mjs --host 192.168.31.122 --port 43770 --password <本机测试密码> --timeoutMs 45000`
验证结果：
- 真实 Mac host 返回 `h264 / annexb-base64 / 真实屏幕`，Windows 控制端 canvas 为 `1920x1080`，image 回退未启用。
- `--requireH264` 输出 canvas `1920x1080`，解码器为 `avc1.420029:annexb`，收到约 43.7 FPS，协商 30 Hz。
- `--requireH264 --injectPcmAudio` 同时通过，页面声音状态出现 `播放 32`，H.264 画面仍保持 canvas 解码；连接初期若先收到非关键帧，会出现一次可恢复的“等待关键帧”提示。
- 普通真实 Mac 连接路径也通过，输出 `H.264 已解码 #6`，说明不强制 H.264 的默认验收没有被新开关影响。
遗留问题：
- 当前 Mac host 协商仍是 30 Hz，Windows 请求 60 Hz 时实收约 24-26 FPS；后续要继续排查 Mac host 采集/编码节奏，而不是 Windows 解码器能力。
- 直接运行 `node scripts/windows/test-windows-client-browser.mjs` 会默认连本机 `127.0.0.1:43770`，本机没有运行假 Mac/真实 host 时会超时；真实联调用 `--host` 指向 Mac。
下一步建议：
- 后续任何 Windows 控制端视频解码、浏览器启动参数、Mac host H.264 输出改动，都把 `--requireH264` 加入回归。
- Mac 端可继续用 `scripts/mac/observe-mac-video.mjs` 观察 H.264 帧率和最大间隔；Windows 端再配合页面级 `--requireH264` 做端到端验收。
是否改了协议：否。
是否需要另一端配合：本轮不需要；已用正在运行的真实 Mac host 完成端到端验收。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：基于 Mac 的通用音频自检参数，补 Windows 本机 WASAPI 真实 PCM 强校验入口。
完成内容：
- 在 `scripts/windows/test-mac-client-browser.mjs` 增加 `--requireAudio` 便捷参数：等价于临时启动 WASAPI host，并要求 PCM payload 和页面播放计数。
- 页面连接前改用浏览器调试协议发送真实鼠标点击打开声音和连接按钮，避免 WebAudio 因自动化脚本点击缺少用户手势而停在“等待播放”。
- `--requireAudio` 额外强校验最后一帧为 `pcm-f32le` / `pcm-f32le-base64` / 48kHz / 2ch。
- 文档补充 `--requireAudio` 的 Windows 本机验收用法，同时保留 Mac 端已加入的 `--enableAudio` / `--expectAudio...` 通用参数说明。
修改文件：
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/mac-client/README.md`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `git diff --check`
- `node scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/test-mac-client-browser.mjs --requireAudio --timeoutMs 30000`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --expectAuthFailure --expectedAttemptsRemaining 2 --expectedMaxAttempts 3 --clientPort 5191 --debugPort 9342`
验证结果：
- 默认页面级自检通过：真实 `windows-ffmpeg-gdigrab-mjpeg` 画面、`input_ack · log`、`Command+C -> Ctrl`、文本剪贴板 `system`、本机文本剪贴板读取/监听、文件剪贴板 `clipboard`、最近连接保存/回填/清空均通过。
- 真实音频页面级自检通过：Windows host 启动 WASAPI loopback，Mac client 显示 `pcm-f32le-base64 · 48000 Hz`，音频状态出现 `播放 18`。
- 认证失败回归仍通过：`认证失败 · 剩余 2/3 次`。
遗留问题：
- 本机测试时系统输出电平为 0，说明测试时无可听系统声音或静音；PCM 管道和播放调度正常，但真实听感仍需要在有系统声音时由 Mac 真机连接 Windows host 确认。
下一步建议：
- 后续做 Windows host 音频或 Mac client 音频 UI 改动时，加跑 `node scripts/windows/test-mac-client-browser.mjs --requireAudio`。
- 真机听感验收时，Windows 端可同时跑 `node scripts/windows/observe-windows-host-audio.mjs --useExisting` 记录帧率、电平和最大间隔。
是否改了协议：否；复用现有 `audio_settings_update`、`audio_settings_ack` 和 `audio_frame`。
是否需要另一端配合：后续真实听感需要 Mac 端配合，本轮 Windows 本机页面级验证已通过。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：新增 Mac host 视频持续帧观察脚本，便于持续验证真实 Mac H.264/JPEG 帧率、间隔和采集管线。
完成内容：
- 新增 `scripts/mac/observe-mac-video.mjs`。
- 脚本只读连接已运行的 Mac host，不启动/停止服务，不发送输入事件。
- 支持 `--preferredVideoCodec h264|mjpeg`、`--requireH264`、`--requireRealVideo`、`--expectedCodec`、`--expectedPipeline`、`--minFrames`、`--minFps` 和 `--maxGapMs`。
- 统计 `video_frame` 帧数、实际 FPS、平均/最大接收间隔、payload 大小、codec、encoding、`capturePipeline`、source、尺寸和 frameId 范围。
- README、Mac host README、当前状态、下一步和任务板已补充使用说明。
修改文件：
- `scripts/mac/observe-mac-video.mjs`
- `apps/mac-host/README.md`
- `README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/observe-mac-video.mjs`
- `node scripts/mac/observe-mac-video.mjs --durationMs 3000 --requireH264 --minFrames 20 --minFps 5 --maxGapMs 1000`
- `node scripts/mac/observe-mac-video.mjs --durationMs 2000 --preferredVideoCodec mjpeg --requireRealVideo --minFrames 10 --minFps 5 --maxGapMs 1000`
验证结果：
- 真实 Mac host `127.0.0.1:43770` H.264 观察通过：3 秒 89 帧，约 29.2fps，最大间隔 42ms，pipeline=`screencapturekit-h264`，encoding=`annexb-base64`。
- JPEG 兜底观察通过：2 秒 37 帧，约 17.9fps，最大间隔 71ms，pipeline=`background-jpeg`，source=`screen`。
遗留问题：
- 这轮只新增观察工具；更长时间 30-60 秒观察、CPU 占用采样和端到端 Windows 解码体验仍需继续验证。
下一步建议：
- Mac 端可用 `node scripts/mac/observe-mac-video.mjs --durationMs 30000 --requireH264 --minFrames 600 --minFps 20 --maxGapMs 1000` 做长时间 H.264 帧节奏观察。
- Windows 控制端端到端解码和 JPEG 回退体验仍由 Windows 端页面级自检继续覆盖。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：给 Mac client 页面级自检补可选音频验收模式，方便后续验证 Windows WASAPI host 到 Mac 控制端的 PCM 播放链路。
完成内容：
- `scripts/windows/test-mac-client-browser.mjs` 新增 `--enableAudio`、`--expectAudioFrame`、`--expectAudioPayload`、`--expectAudioPlayback` 和 `--audioMode <mode>`。
- 断言级联：要求播放会自动要求 payload，要求 payload 会自动要求 audio_frame，要求 audio_frame 会自动开启页面音频开关。
- 临时 Windows host 启动时可通过 `--audioMode wasapi` 传入 `LAN_DUAL_WINDOWS_AUDIO_MODE=wasapi`。
- 浏览器自检会记录页面收到的 WebSocket 消息，统计 `audio_frame` 数量、最后一帧 codec/encoding/sampleRate/channels/payload 信息，并用实际 `播放 N` 计数判断播放是否递增，避免把“等待播放”误判为已播放。
- README、Mac client README、当前状态、下一步和任务板已补充音频验收参数。
修改文件：
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/mac-client/README.md`
- `README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/mac-client/app.js`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `git diff --check`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --clientPort 5190 --debugPort 9341`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --enableAudio --expectAudioFrame --skipFileClipboard --clientPort 5192 --debugPort 9343`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --expectAuthFailure --expectedAttemptsRemaining 2 --expectedMaxAttempts 3 --clientPort 5191 --debugPort 9342`
验证结果：
- mock 音频帧路径通过，输出 `Audio: pcm-f32le · level 55% / 接收 1 帧 · mock · payload=0`。
- 完整页面回归通过：连接、最近连接保存/回填/清空、输入 ack、`Command+C` 映射、文本剪贴板、本机剪贴板读取/监听和文件剪贴板回退链路均通过。
- 认证失败回归仍通过：`认证失败 · 剩余 2/3 次`。
遗留问题：
- Mac 本机只能验证 mock `audio_frame` 接收；PCM payload 和 WebAudio 播放计数需要连接真实 Windows WASAPI host 继续验收。
下一步建议：
- Windows 端启动真实 WASAPI host 后，Mac/Windows 任一端可运行 `node scripts/windows/test-mac-client-browser.mjs --useExistingHost --host <Windows IP> --port <端口> --enableAudio --expectAudioPayload --expectAudioPlayback`。
- 在 Windows 本机临时启动 host 验收时，可运行 `node scripts/windows/test-mac-client-browser.mjs --audioMode wasapi --expectAudioPayload --expectAudioPlayback`。
是否改了协议：否。
是否需要另一端配合：需要 Windows 端在真实 WASAPI host 上跑一次 payload/playback 强校验。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：修正 Windows host 音频观察口径，并优化 WASAPI PCM 发送节奏。
完成内容：
- `observe-windows-host-audio.mjs` 新增 `--warmupFrames`，默认丢掉前 5 帧再计算稳态 FPS，同时输出首帧延迟和整体 FPS。
- Windows host PCM 队列上限改为可配置 `LAN_DUAL_WINDOWS_AUDIO_QUEUE_FRAMES`；WASAPI 默认 96 帧，DirectShow 默认 24 帧。
- Windows host PCM 发送轮询从固定 20ms 下限改为 PCM 使用更小轮询间隔，避免 Windows 定时器粒度把 20ms 帧拖成约 31ms。
- README 和下一步清单已更新观察脚本和队列配置说明。
修改文件：
- `apps/windows-host/src/windows-audio-capture.mjs`
- `apps/windows-host/src/windows-host-service.mjs`
- `scripts/windows/observe-windows-host-audio.mjs`
- `apps/windows-host/README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/NEXT_ACTIONS.md`
验证方式：
- `npm.cmd run check` in `apps/windows-host`
- `node --check scripts/windows/observe-windows-host-audio.mjs`
- `node scripts/windows/observe-windows-host-audio.mjs --durationMs 6000 --minFrames 220 --minFps 40 --maxGapMs 1000 --timeoutMs 30000`
验证结果：
- 修复前长测稳态约 32.17 FPS。
- 修复后 6 秒观察收到 283 帧，稳态约 49.9 FPS，最大间隔 32 ms。
- payload 固定 7680 bytes，sampleRate=48000，channels=2。
- 当前系统输出电平仍为 0，说明测试时系统无可听输出或静音；音频帧节奏已正常。
遗留问题：
- 还需要在 Windows 实际播放系统声音时观察电平变化，并由 Mac client 做真实听感验收。
下一步建议：
- Mac client 打开远端声音时，Windows 端可同步跑 `observe-windows-host-audio --useExisting` 记录稳态帧率和电平。
是否改了协议：否。
是否需要另一端配合：后续听感验收需要 Mac 端配合，本轮 Windows 本机节奏验证已通过。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：新增 Windows host 音频持续帧观察脚本，便于排查 WASAPI/DirectShow 音频卡顿、静音和帧间隔问题。
完成内容：
- 新增 `scripts/windows/observe-windows-host-audio.mjs`。
- 默认临时启动 `screenMode=mock`、`audioMode=wasapi` 的 Windows host，只观察音频，不额外压视频。
- 支持 `--useExisting` 连接已运行的 Windows host。
- 统计 `audio_frame` 帧数、平均 FPS、最大帧间隔、payload 大小、codec/encoding/sampleRate/channels 和电平 min/avg/max。
- Windows host README、当前状态和下一步清单已补充音频观察入口。
修改文件：
- `scripts/windows/observe-windows-host-audio.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/observe-windows-host-audio.mjs`
- `node scripts/windows/observe-windows-host-audio.mjs --durationMs 2500 --minFrames 60 --minFps 20 --maxGapMs 1000 --timeoutMs 25000`
验证结果：
- 2.5 秒收到 68 个 `pcm-f32le-base64` 音频帧。
- 平均约 27.16 FPS，最大间隔 32 ms。
- payload 固定 7680 bytes，sampleRate=48000，channels=2。
- 当前系统输出电平为 0，说明测试时系统无可听输出或静音；管道本身正常。
遗留问题：
- 后续还需要在有真实系统声音播放时观察电平变化。
- 长时间 30-60 秒观察尚未跑。
下一步建议：
- Mac client 连接 Windows host 打开远端声音时，同时在 Windows 端跑观察脚本或用 `--useExisting` 记录帧节奏。
是否改了协议：否。
是否需要另一端配合：否；Mac 端后续做真实听感验收时可参考该脚本。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：给 Mac client 最近连接补清空入口，避免本地连接历史越积越乱。
完成内容：
- 连接面板最近连接行新增“清空”按钮。
- 清空只删除 `lanDualMacClientRecentConnections` 本地记录，不影响密码输入框和当前连接。
- 最近连接清空后会禁用下拉框、禁用清空按钮，并显示 `已清空最近连接 · 不保存密码`。
- `scripts/windows/test-mac-client-browser.mjs` 新增清空断言：先验证保存和回填，再点击清空，确认 localStorage 不再包含 host/port，最近连接下拉禁用。
修改文件：
- `apps/mac-client/index.html`
- `apps/mac-client/styles.css`
- `apps/mac-client/app.js`
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/mac-client/README.md`
- `README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/mac-client/app.js`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `git diff --check`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --clientPort 5190 --debugPort 9341`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --expectAuthFailure --expectedAttemptsRemaining 2 --expectedMaxAttempts 3 --clientPort 5191 --debugPort 9342`
验证结果：
- 普通页面级自检通过，并输出 `Recent clear: 已清空最近连接 · 不保存密码`。
- 连接、最近连接保存/回填、输入 ack、`Command+C` 映射、文本剪贴板、本机剪贴板读取/监听和文件剪贴板回归均通过。
- 认证失败回归仍通过：`认证失败 · 剩余 2/3 次`。
遗留问题：
- 最近连接还没有重命名/编辑标签能力；当前标签仍来自 session/device 信息或 host:port。
下一步建议：
- 后续可补最近连接重命名，或等 Windows WASAPI 完成后做真实 Windows PCM 音频验收。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：打磨 Mac 控制 Windows 原型的快捷键提示，并把 `Command` 到 Windows `Ctrl` 的映射固化进页面级自检。
完成内容：
- 远控画面提示改为明确说明 Mac `Command` 会按 Windows `Ctrl` 发送。
- 发送 `Command` 快捷键时，输入状态和事件日志会显示 `Command→Ctrl+键`，人工测试时更容易判断映射是否生效。
- `scripts/windows/test-mac-client-browser.mjs` 新增 WebSocket 发送记录器，只在浏览器测试进程中拦截本页发出的 JSON。
- 页面级自检现在会模拟 `Command+C`，断言发出的 `input_event` 为 `ctrlKey=true`、`metaKey=false`、`localMetaKey=true`、`shortcutProfile=mac_command_to_windows_ctrl`。
修改文件：
- `apps/mac-client/index.html`
- `apps/mac-client/app.js`
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/mac-client/README.md`
- `README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/mac-client/app.js`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `git diff --check`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --clientPort 5190 --debugPort 9341`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --expectAuthFailure --expectedAttemptsRemaining 2 --expectedMaxAttempts 3 --clientPort 5191 --debugPort 9342`
验证结果：
- 普通页面级自检通过，并输出 `Shortcut: Command+C -> ctrlKey=true, metaKey=false`。
- 连接、最近连接、输入 ack、文本剪贴板、本机剪贴板读取/监听和文件剪贴板回归均通过。
- 认证失败回归仍通过：`认证失败 · 剩余 2/3 次`。
遗留问题：
- 这轮只覆盖 Mac 控制 Windows 页面端的 `Command` 到 `Ctrl` 发送约定；更复杂的输入法、功能键、按下/抬起时序仍可后续继续打磨。
下一步建议：
- Windows 端完成 WASAPI loopback 后，Mac 端可继续用 `apps/mac-client` 做真实 Windows PCM 音频验收。
- Mac 端后续可继续补最近连接清空/重命名，或扩展快捷键自检到 `Command+V`、`Command+A`。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：给 Mac 控制 Windows 原型增加最近连接保存和回填，改善重复连接体验。
完成内容：
- `apps/mac-client` 连接面板新增最近连接下拉框和“使用最近”按钮。
- 成功收到 `session_answer.ok` 后保存当前 host、port 和时间到 localStorage，最多保留 8 条。
- 最近连接不保存连接密码；页面状态文案和自检都会明确检查“不保存密码”。
- 页面加载时会自动填入最近一次成功连接；手动选择最近连接也会回填地址和端口。
- `scripts/windows/test-mac-client-browser.mjs` 新增最近连接断言：确认选项出现、localStorage 包含 host/port、不包含页面密码，并验证回填。
修改文件：
- `apps/mac-client/index.html`
- `apps/mac-client/styles.css`
- `apps/mac-client/app.js`
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/mac-client/README.md`
- `README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/mac-client/app.js`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `git diff --check`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --clientPort 5190 --debugPort 9341`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --expectAuthFailure --expectedAttemptsRemaining 2 --expectedMaxAttempts 3 --clientPort 5191 --debugPort 9342`
遗留问题：
- 最近连接目前只有保存/选择回填；后续可补清空列表、重命名或从 discovery 设备名生成更友好的标签。
下一步建议：
- Mac 端继续打磨键盘映射和真实 Windows PCM 音频验收。
- Windows 端后续改 Windows host 时继续跑默认 `test-mac-client-browser.mjs`，它会覆盖最近连接、文本、本机剪贴板监听和文件剪贴板。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：给 Windows 被控端接入 WASAPI loopback 第一版，解决 Mac 反控 Windows 时真实系统声音来源问题。
完成内容：
- 新增 `scripts/windows/wasapi-loopback-capture.ps1`，用 Windows WASAPI loopback 读取默认播放设备系统声音，输出 `pcm-f32le` 交错 PCM 到 stdout。
- Windows host 音频模块新增显式 `LAN_DUAL_WINDOWS_AUDIO_MODE=wasapi`，默认仍为模拟音频，不会自动采集声音。
- `/discovery` 音频能力会显示 `mode=wasapi-loopback`、WASAPI 格式、采样率、声道数和后端信息。
- `scripts/windows/check-windows-audio-devices.mjs` 新增 WASAPI 格式检查；默认只读格式不采集，显式 `--probe --wasapi` 才短时读取系统输出 PCM。
- `scripts/windows/test-windows-host.ps1` 新增 `-AudioMode wasapi` 和 `-RequireAudio`，可临时启动 Windows host 并强校验真实 PCM 音频帧。
修改文件：
- `scripts/windows/wasapi-loopback-capture.ps1`
- `scripts/windows/check-windows-audio-devices.mjs`
- `scripts/windows/test-windows-host.ps1`
- `apps/windows-host/src/windows-audio-capture.mjs`
- `apps/windows-host/src/windows-host-service.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\wasapi-loopback-capture.ps1 -InfoOnly`
- `node --check apps/windows-host/src/windows-audio-capture.mjs`
- `node --check scripts/windows/check-windows-audio-devices.mjs`
- `node scripts/windows/check-windows-audio-devices.mjs`
- `node scripts/windows/check-windows-audio-devices.mjs --probe --wasapi --durationMs 600`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\test-windows-host.ps1 -MockVideo -AudioMode wasapi -RequireAudio -TimeoutMs 25000`
验证结果：
- 本机 WASAPI 默认播放设备格式为 48000 Hz、2ch、float32。
- `--probe --wasapi` 捕获 226560 bytes PCM，当前 peak=0，说明管道可读但当时系统输出为静音或无可听声音。
- Windows host 自检通过：`audio_frame` 为 `pcm-f32le` / `pcm-f32le-base64` / `system-pcm`，sampleRate=48000、channels=2、frames=960、payloadBytes≈7680。
遗留问题：
- 还没有做长时间音频稳定性和 Mac client 真实播放验收。
- 当前 WASAPI helper 由 PowerShell/C# 启动，适合第一版验证；后续可升级为常驻原生模块，降低启动开销。
- 系统无声音或静音时可正常输出静音 PCM，后续 UI 需要把“管道正常但电平为 0”和“采集失败”区分开。
下一步建议：
- 用 Mac client 连接 Windows host，打开远端声音，确认 Mac 端能听到 Windows 系统声音。
- 跑 30-60 秒音频观察，统计音频帧间隔、payload 和电平变化。
- 后续继续做 Windows Graphics Capture，提升反控 Windows 视频体验。
是否改了协议：否；复用现有 `audio_frame`、`audio_settings_update` 和 `audio_settings_ack`，后端信息只放在 `/discovery` 能力诊断里。
是否需要另一端配合：需要 Mac 端后续做真实播放验收，但本轮 Windows 本机自检已通过。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：新增 Windows 音频设备检查入口，给后续真实系统声音采集和双路声音排查做准备。
完成内容：
- 新增 `scripts/windows/check-windows-audio-devices.mjs`。
- 默认只枚举 FFmpeg DirectShow 设备和当前音频环境变量，不采集声音。
- 支持 `--probe --device "设备名"` 做短时内存 PCM 检测，不保存文件。
- 自动识别 `C:\DevTools\ffmpeg\bin\ffmpeg.exe`，也兼容 `LAN_DUAL_FFMPEG`。
- 对设备做轻量分类：`microphone`、`virtual-or-loopback`、`audio`。
- Windows host README 改为优先使用该脚本列设备，并补充 `--probe` 用法。
修改文件：
- `scripts/windows/check-windows-audio-devices.mjs`
- `apps/windows-host/README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-audio-devices.mjs`
- `node scripts/windows/check-windows-audio-devices.mjs`
- `npm.cmd run check` in `apps/windows-host`
- `git diff --check`
- 本机列出 7 个 DirectShow 设备、4 个音频设备；未执行 `--probe`，没有采集声音。
遗留问题：
- 当前 DirectShow 列表里没有明确的系统 loopback 设备；`麦克风阵列 (网易虚拟音频设备)` 被识别为虚拟/loopback 候选，但真实效果需要后续显式 `--probe` 或接入 WASAPI loopback 验证。
下一步建议：
- 后续做 Windows 反控声音时，优先接 WASAPI loopback，减少虚拟声卡依赖。
- 若临时使用 DirectShow 过渡，先用该脚本选定设备，再设置 `LAN_DUAL_WINDOWS_AUDIO_DEVICE`。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：让 Windows host 视频观察脚本也复用 FFmpeg 显式路径兜底，避免 PATH 继承差异导致观察脚本回退。
完成内容：
- `scripts/windows/observe-windows-host-video.mjs` 新增 `--ffmpeg` 参数。
- 观察脚本会自动识别 `C:\DevTools\ffmpeg\bin\ffmpeg.exe`，并通过 `LAN_DUAL_FFMPEG` 传给临时 Windows host。
- Windows host 文档补充观察脚本的 `--ffmpeg` 用法，并修正一处 `--useExistingHost` 为真实参数 `--useExisting`。
修改文件：
- `scripts/windows/observe-windows-host-video.mjs`
- `apps/windows-host/README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/observe-windows-host-video.mjs`
- `npm.cmd run check` in `apps/windows-host`
- `git diff --check`
- `node scripts/windows/observe-windows-host-video.mjs --screenMode ffmpeg --fps 10 --durationMs 2500 --minFrames 12 --minFps 5 --maxGapMs 1200 --timeoutMs 25000`
- 观察结果：24 帧 / 2578 ms，平均 9.31 FPS，最大间隔 110 ms，掉帧 0，管线 `windows-ffmpeg-gdigrab-mjpeg`，编码 `jpeg`。
遗留问题：
- 这仍是 FFmpeg gdigrab 过渡层；正式长期方案仍建议做 Windows Graphics Capture + 编码管线。
下一步建议：
- 继续跑 Mac client 默认强校验，确认 Mac 端文件剪贴板发送到 Windows host 时 `saveMode=clipboard`。
- 后续推进 WASAPI loopback，替代当前 DirectShow 虚拟设备音频过渡入口。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：补齐 Windows 端 FFmpeg 环境，并让 Windows host 在 PATH 不稳定时也能可靠找到 FFmpeg。
完成内容：
- 已安装 FFmpeg 到 `C:\DevTools\ffmpeg`，当前账号 PATH 已加入 `C:\DevTools\ffmpeg\bin`。
- Windows host 屏幕采集现在支持 `LAN_DUAL_FFMPEG`，可显式指定 `ffmpeg.exe` 路径。
- `scripts/windows/test-windows-host.ps1` 新增 `-Ffmpeg` 参数，并会自动识别 `C:\DevTools\ffmpeg\bin\ffmpeg.exe`。
- Windows host 文档补充 `LAN_DUAL_FFMPEG` 配置示例。
修改文件：
- `apps/windows-host/src/windows-screen-capture.mjs`
- `scripts/windows/test-windows-host.ps1`
- `apps/windows-host/README.md`
验证方式：
- `C:\DevTools\ffmpeg\bin\ffmpeg.exe -version` 通过，版本为 `8.1.1-essentials_build-www.gyan.dev`。
- `ffmpeg -f dshow -list_devices true -i dummy` 可列出本机 DirectShow 音频设备。
- `npm.cmd run check` in `apps/windows-host` 通过。
- `node --check apps/windows-host/src/windows-screen-capture.mjs` 通过。
- `git diff --check` 通过。
- 普通沙盒进程直接 `gdigrab` 报 Windows `error 5`，授权系统上下文直接抓屏成功。
- 授权系统上下文运行 `scripts/windows/test-windows-host.ps1 -ScreenMode ffmpeg -Fps 10 -TimeoutMs 25000` 通过：真实 `jpeg` 首帧、`windows-ffmpeg-gdigrab-mjpeg`、文本剪贴板和文件剪贴板均通过。
遗留问题：
- 系统级 Machine PATH 写入被注册表权限拒绝；已改为当前用户 PATH。当前已启动的 Codex 进程可能仍需手动追加 `C:\DevTools\ffmpeg\bin` 或使用 `LAN_DUAL_FFMPEG`。
- 非授权沙盒进程无法抓取 Windows 桌面，FFmpeg `gdigrab` 会报 `error 5`；真实桌面/授权上下文可正常抓屏。
下一步建议：
- 后续 Windows host 启动脚本可默认设置 `LAN_DUAL_FFMPEG=C:\DevTools\ffmpeg\bin\ffmpeg.exe`，避免 PATH 继承差异。
- 继续推进 WASAPI loopback，减少 DirectShow 虚拟设备依赖。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：参考 UU 远程方式继续优化 Windows 控制端画面内悬浮控制中心。
完成内容：
- 将控制中心收起态改成更像远控软件的右上角悬浮入口，增加当前刷新率/码率摘要。
- 展开菜单改为单列快捷控制项，保留显示屏、画质、窗口缩放、声音、音量、全屏、窗口和退出远控。
- 控制中心悬浮层增加 `pointer-events` 隔离，减少覆盖画面时误挡非控制区域。
- 页面级自检增加悬浮层和摘要断言，继续覆盖画质、缩放、声音、音量和全屏/窗口切换。
修改文件：
- `apps/windows-client/index.html`
- `apps/windows-client/styles.css`
- `apps/windows-client/app.js`
- `apps/windows-client/README.md`
- `scripts/windows/test-windows-client-browser.mjs`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `git diff --check`
- 静态 UI 结构检查通过：确认 `floatingControlSummary`、悬浮层 pointer-events、摘要同步逻辑和页面级断言均存在。
遗留问题：
- 本机 Edge headless 自检在浏览器 GPU target 阶段崩溃；改用 Chrome 后仍卡在浏览器自动化启动阶段，未进入应用逻辑。后续可在非沙盒桌面会话或 Mac/Windows 真机浏览器环境再跑完整页面级自检。
下一步建议：
- 继续让 Windows 控制端连接真实 Mac host，观察 H.264/JPEG 回退、PCM 声音和悬浮控制中心在真实画面中的遮挡情况。
- 后续可继续把控制中心扩展成更接近 UU 的分组菜单，例如“安全、更多、显示屏详情”，但不要复制对方素材。
是否改了协议：否。
是否需要另一端配合：暂不需要；如果 Mac 端要改 `apps/windows-client` 或页面自检，请先在联络板预告。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：给 Mac 控制 Windows 原型增加本机文本剪贴板读取和可选自动监听。
完成内容：
- `apps/mac-client` 文本剪贴板面板新增“读取 Mac 剪贴板”按钮，可读取浏览器授权后的本机文本剪贴板并填入待发送文本框。
- 新增“监听 Mac 文本剪贴板变化并自动发送”开关；默认关闭，只监听文本，用户显式开启后才会定时读取并发送变化内容。
- 自动监听会去重同一段文本，断开连接或连接关闭时会自动停止，避免未连接状态继续读取本机剪贴板。
- `scripts/windows/test-mac-client-browser.mjs` 会授予浏览器剪贴板权限，覆盖手动读取发送和监听变化自动发送。
- README、当前状态、下一步和任务板已同步该能力。
修改文件：
- `apps/mac-client/index.html`
- `apps/mac-client/app.js`
- `apps/mac-client/styles.css`
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/mac-client/README.md`
- `README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/mac-client/app.js`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `git diff --check`
- 普通页面级自检：`node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --clientPort 5190 --debugPort 9341`
- 认证失败回归：`node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --expectAuthFailure --expectedAttemptsRemaining 2 --expectedMaxAttempts 3 --clientPort 5191 --debugPort 9342`
验证结果：
- 普通页面级自检通过：视频、`input_ack · log`、手动文本剪贴板、读取 Mac 本机剪贴板后发送、监听文本变化自动发送、文件剪贴板均通过。
- 认证失败回归仍通过：`Auth failure: 认证失败 · 剩余 2/3 次`。
遗留问题：
- 当前只覆盖文本剪贴板；文件剪贴板仍需用户手动选择文件，浏览器不能后台读取系统文件剪贴板。
- Windows 默认模式仍需 Windows 端跑一次系统文件剪贴板强校验 `saveMode=clipboard`。
下一步建议：
- Mac 端可继续打磨键盘映射和连接历史/最近连接体验。
- Windows 端可继续跑默认 `test-mac-client-browser.mjs`，确认真实 Windows host 的文本/文件系统剪贴板模式。
是否改了协议：否。
是否需要另一端配合：Windows 系统剪贴板强校验仍需要 Windows 端执行默认页面级自检。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：把 Mac client 错误密码路径固化为页面级自检断言。
完成内容：
- `scripts/windows/test-mac-client-browser.mjs` 新增 `--expectAuthFailure` 模式，认证失败时不再把脚本判为失败，而是等待页面显示认证失败状态。
- 新增 `--hostPassword` 和 `--clientPassword`，普通模式默认仍沿用 `--password`；错误密码模式默认让临时 host 使用正确密码、页面填入派生的错误密码。
- 新增 `--expectedAttemptsRemaining` 和 `--expectedMaxAttempts`，可断言 `认证失败 · 剩余 2/3 次` 这类剩余次数提示。
- README、当前状态、下一步和任务板已同步该自检入口。
修改文件：
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/mac-client/README.md`
- `README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `git diff --check`
- 错误密码模式：`node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --expectAuthFailure --expectedAttemptsRemaining 2 --expectedMaxAttempts 3 --clientPort 5191 --debugPort 9342`
- 普通成功模式：`node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --clientPort 5190 --debugPort 9341`
验证结果：
- 错误密码模式通过：输出 `Auth failure: 认证失败 · 剩余 2/3 次` 和 `Mac client auth failure self-test passed`。
- 普通成功模式仍通过：连接、mock 视频、`input_ack · log`、文本 `clipboard_ack · memory-only`、文件 `clipboard_file_result · temp` 均正常。
遗留问题：
- Windows 默认模式仍需 Windows 端跑一次系统文件剪贴板强校验 `saveMode=clipboard`。
下一步建议：
- Mac 端可继续做自动剪贴板监听或 Mac client 键盘映射打磨。
- Windows 端涉及 Mac 反控认证 UX 时，可直接加跑 `--expectAuthFailure`。
是否改了协议：否。
是否需要另一端配合：Windows 系统文件剪贴板强校验仍需要 Windows 端执行默认页面级自检。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：改善 Mac 控制 Windows 原型的认证失败体验。
完成内容：
- `apps/mac-client` 会读取 `auth_result.attemptsRemaining/maxAttempts`，在连接状态里显示 `认证失败 · 剩余 2/3 次` 或无剩余尝试。
- 认证失败后会关闭当前 WebSocket 并释放连接按钮，避免页面停留在“连接中但不可重试”的状态，用户可改密码后重新连接。
- WebSocket close 事件会保留认证失败状态，不再立刻覆盖成普通“未连接”。
- README、当前状态和任务板已同步该能力。
修改文件：
- `apps/mac-client/app.js`
- `apps/mac-client/README.md`
- `README.md`
- `docs/CURRENT_STATUS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/mac-client/app.js`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `git diff --check`
- 正常路径：`node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --clientPort 5190 --debugPort 9341`
- 错误密码路径：临时启动 `43773` Windows host，使用 `--useExistingHost --password wrong-password --skipFileClipboard` 连接，预期脚本失败并输出认证失败快照。
验证结果：
- 正常路径通过：连接、mock 视频、`input_ack · log`、文本 `clipboard_ack · memory-only`、文件 `clipboard_file_result · temp` 均正常。
- 错误密码路径输出 `Last connection: 认证失败 · 剩余 2/3 次`，事件日志包含 `认证失败 · 连接密码不正确 · 剩余 2/3 次` 和连接关闭。
遗留问题：
- 还没有把错误密码路径固化成独立自动化脚本断言；当前为临时命令验证。
下一步建议：
- 后续可给 `test-mac-client-browser.mjs` 增加 `--expectAuthFailure` 模式，把认证失败 UX 变成正式回归。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：把 Mac 控制 Windows 原型的文件剪贴板发送纳入页面级自动化自检。
完成内容：
- `scripts/windows/test-mac-client-browser.mjs` 新增浏览器 CDP 文件注入：自动创建临时小文件、设置到 `#clipboardFileInput`，点击发送并等待 `clipboard_file_result`。
- 自检默认在 Windows 上要求系统剪贴板强校验：文本需返回 `system`，文件需返回 `saveMode=clipboard`。
- 新增 `--allowClipboardFallback`，用于 Mac/Linux 开发环境验证 `memory-only` 文本和 `saveMode=temp` 文件回退链路；新增 `--skipFileClipboard` 便于临时跳过文件剪贴板段。
- README 和状态/任务文档已说明 Mac client 页面级自检覆盖视频、输入、文本剪贴板和文件剪贴板。
修改文件：
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/mac-client/README.md`
- `README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node --check apps/mac-client/app.js`
- `node --check apps/mac-client/server.mjs`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --clientPort 5190 --debugPort 9341`
验证结果：
- Mac 本机回退自检通过：连接、mock 视频、`input_ack · log`、文本 `clipboard_ack · memory-only` 均正常。
- 文件剪贴板自动化通过：CDP 注入 88 B 临时文件，Mac client 分块发送后收到 `File clipboard: 已写入 · temp · 88 B`。
遗留问题：
- Mac 本机只能验证 `saveMode=temp` 回退；真实 Windows 系统文件剪贴板 `saveMode=clipboard` 需要 Windows 端运行默认 `node scripts/windows/test-mac-client-browser.mjs` 强校验。
下一步建议：
- Windows 端拉取后跑默认 Mac client 页面级自检，确认真实 Windows host 的文件剪贴板返回 `saveMode=clipboard`。
- Mac 端可继续打磨 `apps/mac-client` 错误提示、真实 PCM 音频验收入口和自动剪贴板监听。
是否改了协议：否。
是否需要另一端配合：需要 Windows 端跑默认自检确认系统文件剪贴板强校验。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：给 Mac 控制 Windows 原型增加文件剪贴板发送入口。
完成内容：
- `apps/mac-client` 文本剪贴板面板下新增文件选择和“发送文件”入口。
- 发送文件时复用现有 `clipboard_file_offer`、`clipboard_file_chunk`、`clipboard_file_complete` 流程，方向为 `client_to_host`。
- 文件按 64KB 分块 base64 发送，单批默认限制 32MB，避免浏览器一次读取过大文件卡住页面。
- 页面可显示对端 `clipboard_file_response`、`clipboard_file_progress` 和 `clipboard_file_result`，包括 `saveMode` 和接收进度。
- 0 字节文件会发送一个空 chunk，确保接收端能创建对应空文件。
修改文件：
- `apps/mac-client/app.js`
- `apps/mac-client/index.html`
- `apps/mac-client/styles.css`
- `apps/mac-client/README.md`
- `README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/mac-client/server.mjs`
- `node --check apps/mac-client/app.js`
- `git diff --check`
- 本机启动 Windows host 回退服务：`LAN_DUAL_PORT=43772 LAN_DUAL_HOST=127.0.0.1 LAN_DUAL_WINDOWS_INPUT_MODE=log node server.mjs`
- 本机启动 Mac client：`node server.mjs`
- 内置浏览器打开 `http://127.0.0.1:5188/`，连接 `127.0.0.1:43772`，确认文件剪贴板 UI 存在，未选择文件时点击“发送文件”不会误发送。
验证结果：
- 页面显示文件选择和发送入口。
- 连接、认证、会话协商和视频显示仍通过。
- 未选择文件时状态保持 `未选择`，没有向 Windows host 发送文件块。
- 临时 `43772` 和 `5188` 测试端口已关闭。
遗留问题：
- 浏览器自动化不能无提示选择本机文件；真实小文件发送和 Windows 系统文件剪贴板 `saveMode=clipboard` 仍需要 Windows 端或人工手动验证。
- 当前未实现自动监听 Mac 本机剪贴板文件变化。
下一步建议：
- Windows 端可扩展 `scripts/windows/test-mac-client-browser.mjs`，在真实 Windows host 上用临时小文件覆盖 Mac client 文件剪贴板发送。
- Mac 端后续继续打磨错误提示、键盘映射和自动剪贴板监听。
是否改了协议：否；复用现有 `clipboard_file_*`。
是否需要另一端配合：真实文件写入 Windows 系统文件剪贴板验收需要 Windows 端配合。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：让 Windows 控制端全屏体验由悬浮控制中心主导。
完成内容：
- Windows 控制端进入全屏后隐藏原顶部工具栏，不再占用远控画面上方空间。
- 全屏时远控画面贴边显示，保留底部状态栏和右上角悬浮控制中心。
- 悬浮控制中心的“全屏”和“窗口”按钮已纳入 `test-windows-client-browser.mjs` 回归。
- Windows 控制端 README 已说明全屏后顶部工具栏隐藏，悬浮控制中心作为主要入口。
修改文件：
- `apps/windows-client/styles.css`
- `apps/windows-client/README.md`
- `scripts/windows/test-windows-client-browser.mjs`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node --check apps/windows-client/app.js`
- `node scripts/windows/test-coordinate-mapping.mjs`
- 临时启动假 Mac 服务后运行 `node scripts/windows/test-windows-client-browser.mjs --noRequireVideoSurface`
验证结果：
- 控制中心回归通过：`open=true, quality=true, scale=true, audio=true, volume=true, fullscreen=true, window=true`。
- 假 Mac 页面级自检仍通过：连接、诊断、模拟视频 surface 和 WebCodecs 环境检查均正常。
遗留问题：
- 还没有做悬浮控制中心拖动、自动收起或边缘吸附。
下一步建议：
- 后续可继续把“安全/更多/快捷键”做进悬浮控制中心，再逐步弱化顶部工具栏。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：把 Windows 控制端悬浮控制中心纳入页面级自检回归。
完成内容：
- `scripts/windows/test-windows-client-browser.mjs` 在连接被控端前会先展开 `#controlCenterToggle`。
- 自动验证悬浮控制中心的画质、缩放、声音开关和音量会同步到原顶部工具栏。
- 验证完成后会恢复页面初始显示设置，再继续执行原有 WebSocket 连接、诊断和视频 surface 检查。
- Windows 控制端 README 已说明页面级自检会先回归悬浮控制中心。
修改文件：
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node --check apps/windows-client/app.js`
- `node scripts/windows/test-coordinate-mapping.mjs`
- 临时启动假 Mac 服务后运行 `node scripts/windows/test-windows-client-browser.mjs --noRequireVideoSurface`
验证结果：
- 控制中心回归通过：`open=true, quality=true, scale=true, audio=true, volume=true`。
- 假 Mac 页面级自检仍通过：连接、诊断、模拟视频 surface 和 WebCodecs 环境检查均正常。
遗留问题：
- 暂未把该检查拆成独立脚本；目前作为 Windows 控制端页面级自检的一部分执行。
下一步建议：
- 后续继续增强悬浮控制中心时，把新增菜单项同步补进同一个页面级回归。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：参考用户提供的 UU 远程控制中心思路，给 Windows 控制端增加画面内悬浮控制中心第一版。
完成内容：
- 在 Windows 控制端远控画面右上角新增“控制中心”悬浮入口。
- 展开后可快速切换显示屏、画质、缩放模式、声音开关、音量、全屏、窗口和退出远控。
- 悬浮控件不维护第二套状态，而是同步驱动现有顶部工具栏控件和原有 `sendDisplaySettings()`、`setFullscreen()`、`disconnect()` 逻辑。
- 控制中心在真实视频帧显示后仍保留在画面上，不会被模拟窗口隐藏逻辑影响。
- Windows 控制端 README 已补充该能力。
修改文件：
- `apps/windows-client/index.html`
- `apps/windows-client/styles.css`
- `apps/windows-client/app.js`
- `apps/windows-client/README.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check apps/windows-client/protocol-client.js`
- `node scripts/windows/test-coordinate-mapping.mjs`
- 本地浏览器自动化检查：展开控制中心，验证画质、缩放、声音和音量会同步到原工具栏。
- 临时启动假 Mac 服务后运行 `node scripts/windows/test-windows-client-browser.mjs --noRequireVideoSurface`
验证结果：
- 自动化检查确认控制中心可展开，`sharp` 画质同步到 `4K / 120 Hz / 50 Mbps`，缩放、声音和音量同步正常。
- 页面截图人工查看正常：浮层位于画面右上角，文字未溢出，未遮挡主要远控内容。
- 假 Mac 页面级自检通过：控制端可连接、接收模拟视频帧并保持现有诊断状态。
遗留问题：
- 第一版是固定右上角浮层，暂未做拖动、吸附边缘、自动收起、快捷键唤出和菜单分组动画。
下一步建议：
- 后续可继续补“显示屏/画质/窗口/声音/安全/更多”分组菜单，并在全屏状态下隐藏顶部工具栏，只保留悬浮控制中心。
- Mac 控制 Windows 的 `apps/mac-client` 后续也可复用同样的信息架构，形成双端一致体验。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：把 Mac client 文本剪贴板发送纳入 Windows 端页面级自检。
完成内容：
- `scripts/windows/test-mac-client-browser.mjs` 在视频和输入确认之后，会自动填写 Mac client 文本剪贴板输入框并点击发送。
- 自检会等待页面收到 `clipboard_ack`，并要求真实 Windows host 返回 `system` 模式，覆盖 Mac 控制 Windows 的文本剪贴板端到端链路。
- Windows host README 已更新，说明 Mac 控制 Windows 页面级自检覆盖真实视频、`input_ack` 和文本 `clipboard_ack`。
- 未修改 `apps/mac-client` 本体，避免和 Mac 端正在做的音频播放入口冲突。
修改文件：
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/windows-host/README.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/test-mac-client-browser.mjs`
验证结果：
- 页面连接临时 Windows host 成功，显示真实 `windows-host-ffmpeg-mjpeg` 画面。
- 鼠标和键盘事件收到 `input_ack`：`已确认 · log`。
- 文本剪贴板发送后收到 `clipboard_ack`：`已写入 · system · 41 字`。
遗留问题：
- 该脚本仍只验证 Mac client 的 Web 原型；后续原生 Mac 控制端出现后要补同等回归。
下一步建议：
- 根据用户反馈，后续 Windows 控制端和 Mac 控制端都可以学习 UU 远程的“悬浮控制中心”方式：远控画面顶部或边缘放小型浮动入口，展开后提供显示屏、画质、窗口、声音、安全、快捷键、全屏和退出远控等菜单。
- Mac 端当前可继续补 Windows 音频播放；Windows 端后续可继续补 Windows host WASAPI loopback 或控制端悬浮工具栏原型。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：给 Mac 控制 Windows 原型增加远端音频播放入口。
完成内容：
- `apps/mac-client` 右侧新增“Windows 声音”面板，默认关闭，不会主动请求远端声音。
- 打开“播放远端声音”后会发送 `audio_settings_update`，并显示音量、远端确认和音频帧接收状态。
- 新增 WebAudio PCM 播放队列，支持 `pcm-f32le-base64` 过渡音频帧，兼容 `planar` / `interleaved` 布局。
- mock 音频帧只更新状态，不会假装播放真实系统声音。
- 断开连接或关闭声音时会关闭 AudioContext，避免后台继续占用音频资源。
修改文件：
- `apps/mac-client/app.js`
- `apps/mac-client/index.html`
- `apps/mac-client/styles.css`
- `apps/mac-client/README.md`
- `README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/mac-client/server.mjs`
- `node --check apps/mac-client/app.js`
- `git diff --check`
- 本机启动 Windows host 回退服务：`LAN_DUAL_PORT=43772 LAN_DUAL_HOST=127.0.0.1 LAN_DUAL_WINDOWS_INPUT_MODE=log node server.mjs`
- 本机启动 Mac client：`node server.mjs`
- 内置浏览器打开 `http://127.0.0.1:5188/`，连接 `127.0.0.1:43772`，再打开“播放远端声音”。
验证结果：
- 默认连接后音频状态为 `未开启`，说明未主动请求远端音频。
- 打开声音后收到 `audio_settings_ack`：`mock-opus · 80%`。
- 页面显示 mock 音频帧接收状态：`接收 5 帧 · mock`。
- Windows host 日志确认：`音频设置已更新：开启 / 80%`。
- 临时 `43772` 和 `5188` 测试端口已关闭。
遗留问题：
- 本机 macOS 只能验证 mock 音频帧和播放入口状态；真实 PCM 播放需要 Windows host 配置 `LAN_DUAL_WINDOWS_AUDIO_DEVICE` 或后续 WASAPI loopback 后，在真实 Windows 上确认可听见声音。
- 目前没有音频延迟/漂移 UI，只显示播放帧数和丢帧计数。
下一步建议：
- Windows 端可用真实 DirectShow loopback/虚拟声卡设备启动 Windows host，然后让 Mac client 打开“播放远端声音”，确认 `pcm-f32le-base64` 可播放。
- Mac 端后续继续补文件剪贴板和更完整的错误提示。
是否改了协议：否；复用现有 `audio_settings_update`、`audio_settings_ack` 和 `audio_frame`。
是否需要另一端配合：真实 Windows PCM 播放验收需要 Windows 端提供真实 PCM 音频帧。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：给 Mac 控制 Windows 原型增加文本剪贴板发送入口。
完成内容：
- `apps/mac-client` 右侧新增“文本剪贴板”面板，可输入文字并发送到 Windows host。
- 发送消息使用现有 `clipboard_text`，方向为 `client_to_host`，并显示远端返回的 `clipboard_ack`、写入模式和文本长度。
- `session_offer.wantClipboardText` 已改为 `true`，让会话能力和页面实际能力一致。
- Mac client 事件日志改为安全 DOM 拼接，不再用 `innerHTML` 拼远端字符串。
- README、当前状态、下一步和任务板已同步，反方向“文本剪贴板可用”单独标为完成；文件剪贴板和音频播放仍是后续项。
修改文件：
- `apps/mac-client/app.js`
- `apps/mac-client/index.html`
- `apps/mac-client/styles.css`
- `apps/mac-client/README.md`
- `README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/mac-client/server.mjs`
- `node --check apps/mac-client/app.js`
- `git diff --check`
- 本机启动 Windows host 回退服务：`LAN_DUAL_PORT=43772 LAN_DUAL_HOST=127.0.0.1 LAN_DUAL_WINDOWS_INPUT_MODE=log node server.mjs`
- 本机启动 Mac client：`node server.mjs`
- 内置浏览器打开 `http://127.0.0.1:5188/`，连接 `127.0.0.1:43772`。
验证结果：
- 页面发现、WebSocket 连接、认证、会话协商和视频显示通过。
- 键盘 `a` 输入收到 `input_ack`：`已确认 · log`。
- 文本剪贴板发送 `ABC` 后收到 `clipboard_ack`：`已写入 · memory-only · 3 字`。
- Windows host 日志确认：`收到文本剪贴板：3 字 / memory-only`。
- 临时 `43772` 和 `5188` 测试端口已关闭。
遗留问题：
- 本机 macOS 环境验证的是 Windows host 非 Windows 回退模式 `memory-only`；真实 Windows 机器上应显示 `system`。
- 内置浏览器 `fill()` 受虚拟剪贴板限制，自动化验证改用逐键输入；页面手动输入不受影响。
- 文件剪贴板、自动监听 Mac 本机剪贴板和 Windows 音频播放仍未接入 Mac client。
下一步建议：
- Windows 端可扩展 `scripts/windows/test-mac-client-browser.mjs`，把 Mac client 文本剪贴板发送纳入页面级自检，并在真实 Windows host 上确认 `mode=system`。
- Mac 端后续继续补 Mac client 文件剪贴板、Windows 音频播放和真实 Windows host 端到端验收。
是否改了协议：否；复用现有 `clipboard_text` / `clipboard_ack`。
是否需要另一端配合：暂无阻塞；真实 Windows 系统剪贴板模式验证需要 Windows 端运行真实 Windows host。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：给 Windows host 一键自检增加默认端口冲突防护。
完成内容：
- `scripts/windows/test-windows-host.ps1` 默认启动临时 Windows host 前会检查目标端口。
- 如果 `127.0.0.1:43772` 已被其他服务占用，脚本会自动选择临时空闲端口并把探针连接目标切到该端口。
- 只有显式传入 `-UseExisting` 时才复用已经运行的 Windows host，避免误连旧进程导致自检结论不准。
- Windows host README 已补充该行为和 `-UseExisting` 用法。
修改文件：
- `scripts/windows/test-windows-host.ps1`
- `apps/windows-host/README.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-windows-host.ps1 -Fps 30`
- 临时占用 `127.0.0.1:43772` 后再次运行同一条自检命令
验证结果：
- 正常路径通过：真实 `windows-ffmpeg-gdigrab-mjpeg` 首帧、文本剪贴板和文件剪贴板均通过。
- 端口占用路径通过：脚本输出临时端口并完成同样的真实视频和剪贴板验证。
遗留问题：
- 无。
下一步建议：
- 等 Mac client 文本剪贴板提交推送后，Windows 端可拉取并扩展 `test-mac-client-browser.mjs` 覆盖文本剪贴板 ack。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：给 Mac client 页面级自检增加 Windows host 临时端口冲突防护。
完成内容：
- `scripts/windows/test-mac-client-browser.mjs` 在临时启动 Windows host 前会检查目标端口能否绑定。
- 默认 `43772` 被占用时自动切换到临时空闲端口，并把页面表单同步改成该端口。
- 只有显式 `--useExistingHost` 时才复用已经运行的 Windows host。
- Windows host README 已记录该行为。
修改文件：
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/windows-host/README.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `git diff --check`
- `node scripts/windows/test-mac-client-browser.mjs`
- 临时占用 `127.0.0.1:43772` 后运行 `node scripts/windows/test-mac-client-browser.mjs`
验证结果：
- 正常页面级自检通过：真实 `windows-host-ffmpeg-mjpeg` 画面和 `input_ack · log`。
- 端口占用场景通过：输出 `Port 43772 is busy; using temporary Windows host port ...`，页面连接临时端口并通过。
遗留问题：
- Mac client 页面自己的日志仍会提示默认端口 `43772`，但脚本已经覆盖输入框端口，不影响自检结果。
下一步建议：
- 后续可给其他固定端口脚本继续补同样的端口避让。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：给 Windows host 增加显式配置的 FFmpeg DirectShow PCM 音频采集入口。
完成内容：
- `WindowsAudioCaptureCoordinator` 默认仍保持模拟音频帧，不会自动采集真实麦克风或系统声音。
- 设置 `LAN_DUAL_WINDOWS_AUDIO_DEVICE` 且 `LAN_DUAL_WINDOWS_AUDIO_MODE=dshow` 后，Windows host 会用 FFmpeg DirectShow 采集指定音频设备，输出 `pcm-f32le-base64`、48kHz、双声道、20ms PCM 帧。
- `/discovery` 的音频能力会列出 DirectShow audio 设备、当前模式、配置设备、后端和错误信息。
- Windows host 服务端已接入音频 `start/stop`，真实 PCM 按 20ms 发送；mock 音频仍按低频状态帧发送。
- 文档已说明该入口适合先接 loopback/虚拟声卡设备，正式默认系统声音仍待 WASAPI loopback。
修改文件：
- `apps/windows-host/src/windows-audio-capture.mjs`
- `apps/windows-host/src/windows-host-service.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check apps/windows-host/src/windows-audio-capture.mjs`
- `node --check apps/windows-host/src/windows-host-service.mjs`
- `npm.cmd run check` in `apps/windows-host`
- `git diff --check`
- 内存 PCM 打包验证：向音频模块注入 7680 字节静音 PCM，确认输出 `pcm-f32le-base64`。
- 显式配置模式协商验证：设置临时 `LAN_DUAL_WINDOWS_AUDIO_DEVICE=unit-test-device` 和 `LAN_DUAL_WINDOWS_AUDIO_MODE=dshow`，确认 capabilities/answer 为 DirectShow PCM。
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-host.ps1 -Fps 30`
- `node scripts/windows/test-auth-retry-policy.mjs`
- `node scripts/windows/test-mac-client-browser.mjs`
验证结果：
- 默认未配置设备时，Windows host 仍是安全 mock 音频；发现接口列出了本机可用 DirectShow audio 设备。
- PCM 帧打包通过：`7680 bytes / 48000 Hz / 2 ch / 960 frames`。
- 显式配置协商通过：`dshow-pcm / pcm-f32le / pcm-f32le-base64`。
- Windows host 一键自检、认证回归和 Mac client 页面级自检均通过。
遗留问题：
- 没有主动打开真实音频设备实采，避免未经确认采集麦克风；需要用户明确选择 loopback/虚拟声卡设备后再做端到端声音验证。
- 正式默认系统声音采集仍需 WASAPI loopback。
下一步建议：
- 用户确认可用 loopback/虚拟声卡设备名后，运行 Windows host 并用 Mac client 验证真实 PCM 播放。
是否改了协议：否；复用已有 `pcm-f32le-base64` 音频帧字段。
是否需要另一端配合：暂不需要；真机声音播放验收时需要 Mac client 连接 Windows host。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：给 Windows host 视频观察脚本增加临时端口冲突防护。
完成内容：
- `scripts/windows/observe-windows-host-video.mjs` 在临时启动 Windows host 前会先检查目标端口能否绑定。
- 默认端口被占用时，脚本会自动申请一个临时空闲端口并改用该端口启动/观察。
- `--useExisting` 模式保持原行为，用于连接已经运行的 Windows host。
- Windows host README 已记录端口行为。
修改文件：
- `scripts/windows/observe-windows-host-video.mjs`
- `apps/windows-host/README.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check scripts/windows/observe-windows-host-video.mjs`
- `git diff --check`
- `node scripts/windows/observe-windows-host-video.mjs --durationMs 1500 --minFrames 8 --minFps 6`
- 临时占用 `127.0.0.1:43772` 后运行观察脚本，确认输出 `Port 43772 is busy; using temporary port ...` 并完成视频观察。
验证结果：
- 默认观察路径通过。
- 端口占用场景通过：脚本自动换到临时端口，完成 FFmpeg gdigrab 观察。
遗留问题：
- 其他旧脚本仍使用固定端口；如果未来也需要并行跑，可逐步加同样的端口防护。
下一步建议：
- 后续需要并行跑多个本机自检时，优先使用已带端口防护的观察脚本，其他脚本串行运行。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：优化 Windows host 视频发送调度，让 FFmpeg MJPEG 更接近协商帧率。
完成内容：
- 将 Windows host 视频发送循环从固定 `setInterval` 改为上一帧完成后的自调度 `setTimeout`。
- 调度会按目标间隔追赶下一帧，避免 FFmpeg 等待新帧时跳过下一次定时器 tick。
- 保留原有防重入逻辑，断开连接和重启会话时仍会停止当前视频循环。
- 更新任务板、下一步行动、交接记录和文件占用记录。
修改文件：
- `apps/windows-host/src/windows-host-service.mjs`
- `docs/04-task-board.md`
- `docs/NEXT_ACTIONS.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check apps/windows-host/src/windows-host-service.mjs`
- `npm.cmd run check` in `apps/windows-host`
- `git diff --check`
- `node scripts/windows/observe-windows-host-video.mjs`
- `node scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/observe-windows-host-video.mjs --screenMode system --fps 4 --durationMs 2500 --minFrames 3 --minFps 1 --maxGapMs 2000`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-host.ps1 -Fps 30`
- `node scripts/windows/test-auth-retry-policy.mjs`
验证结果：
- FFmpeg gdigrab 默认路径从约 23.99 FPS 提升到约 29.39 FPS：5 秒收到 147 帧，最大帧间隔 52 ms，掉帧 0。
- Mac client 页面级自检通过，仍能显示 `windows-host-ffmpeg-mjpeg` 并收到 `input_ack · log`。
- System.Drawing 兜底路径串行重跑通过：约 2.91 FPS，最大帧间隔 354 ms，`capturePipeline=windows-gdi-jpeg`。
- Windows host 一键自检和认证重试回归均通过。
遗留问题：
- FFmpeg MJPEG 仍是过渡方案；若要 60/120Hz 或更低带宽，还需要 Windows Graphics Capture 与正式编码管线。
下一步建议：
- 后续改视频采集时继续用 `observe-windows-host-video.mjs` 做量化，再用页面级自检确认 UI 体验。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：新增 Windows host 视频持续帧观察脚本，方便判断真实帧率和卡顿。
完成内容：
- 新增 `scripts/windows/observe-windows-host-video.mjs`。
- 默认会临时启动 Windows host，完成 `/discovery`、WebSocket、认证、会话协商后观察 5 秒 `video_frame`。
- 统计实际帧数、平均 FPS、最大帧间隔、平均 payload、掉帧数、采集管线和 codec。
- 支持 `--useExisting` 连接已运行的 Windows host，支持 `--screenMode system` 对照旧系统截图兜底路径，支持 `--json` 输出。
- 更新根 README、Windows host README、当前状态、下一步行动和任务板。
修改文件：
- `scripts/windows/observe-windows-host-video.mjs`
- `README.md`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check scripts/windows/observe-windows-host-video.mjs`
- `git diff --check`
- `node scripts/windows/observe-windows-host-video.mjs`
- `node scripts/windows/observe-windows-host-video.mjs --screenMode system --fps 4 --durationMs 2500 --minFrames 3 --minFps 1 --maxGapMs 2000`
验证结果：
- FFmpeg gdigrab 默认路径通过：5 秒收到 120 帧，平均约 23.99 FPS，最大帧间隔 50 ms，`capturePipeline=windows-ffmpeg-gdigrab-mjpeg`。
- System.Drawing 兜底路径通过：约 2.04 FPS，最大帧间隔 541 ms，`capturePipeline=windows-gdi-jpeg`。
遗留问题：
- FFmpeg 过渡层仍未达到稳定满 30/60 FPS，后续仍需要 Windows Graphics Capture 或更正式的原生视频编码管线。
下一步建议：
- 每次改 Windows host 视频采集/调度后，先跑该脚本观察实际帧节奏，再跑页面级自检确认控制端显示。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：把 Windows host 屏幕采集从逐帧 PowerShell 截图过渡到 FFmpeg gdigrab 持续 MJPEG 管线，并保持自检稳定。
完成内容：
- Windows host 在 `auto` 模式下会优先检测并使用 FFmpeg `gdigrab`，输出 `windows-ffmpeg-gdigrab-mjpeg` / `windows-host-ffmpeg-mjpeg`。
- 无 FFmpeg 或显式 `system` 时继续使用 PowerShell/System.Drawing JPEG；采集失败仍会回退模拟帧。
- 视频发送调度从固定 8 FPS 上限改为按 `maxScreenFps` 调度；FFmpeg 模式默认 30 FPS，允许 1-60。
- `test-windows-host.ps1` 和 `test-mac-client-browser.mjs` 默认改为 `auto`，优先覆盖 FFmpeg 管线。
- Windows 系统剪贴板文本/文件写入增加短重试，降低 `Set-Clipboard` 被临时占用导致的误失败。
- 更新根 README、Windows host README、当前状态、下一步行动和任务板。
修改文件：
- `apps/windows-host/src/windows-screen-capture.mjs`
- `apps/windows-host/src/windows-host-service.mjs`
- `apps/windows-host/src/windows-clipboard-bridge.mjs`
- `scripts/windows/test-windows-host.ps1`
- `scripts/windows/test-mac-client-browser.mjs`
- `README.md`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check apps/windows-host/src/windows-clipboard-bridge.mjs`
- `node --check apps/windows-host/src/windows-screen-capture.mjs`
- `node --check apps/windows-host/src/windows-host-service.mjs`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `git diff --check`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-host.ps1 -Fps 30`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-host.ps1 -ScreenMode system -SkipClipboardText -SkipClipboardFile`
- `node scripts/windows/test-mac-client-browser.mjs`
- `npm.cmd run check` in `apps/windows-host`
- `node scripts/windows/test-auth-retry-policy.mjs`
验证结果：
- Windows host 自检通过，`/discovery` 暴露 `mode=ffmpeg-mjpeg`、`capturePipeline=windows-ffmpeg-gdigrab-mjpeg`。
- 30 Hz 请求下首帧真实视频通过：`codec=jpeg`、`encoding=data-url`、`source=screen`、`capturePipeline=windows-ffmpeg-gdigrab-mjpeg`。
- 强制 `-ScreenMode system` 兜底路径通过，返回 `mode=system-jpeg`、`capturePipeline=windows-gdi-jpeg`。
- 文本剪贴板写入通过：`Clipboard text accepted: 57 chars / mode=system`。
- 文件剪贴板写入通过：`Clipboard file accepted: 1 file / 128 bytes / saveMode=clipboard`。
- Mac client 页面级自检通过，远端状态显示 `windows-host-ffmpeg-mjpeg`，并收到 `input_ack · log`。
- 认证重试策略回归通过，Windows host 和假 Mac 均保持错误密码剩余 `2/1/0`、第三次断开、新连接正确认证。
遗留问题：
- 这仍是过渡层，不是最终 Windows Graphics Capture；真实高帧率、低延迟和资源占用还需要后续 WGC 或原生编码管线。
- 当前 Windows host 音频仍是模拟帧，真实系统声音待 WASAPI loopback。
下一步建议：
- Mac 端可继续用 `apps/mac-client` 连接 Windows host，观察 FFmpeg MJPEG 画面和输入确认。
- Windows 端下一步可推进 WASAPI loopback 或 Windows Graphics Capture。
是否改了协议：否。
是否需要另一端配合：不需要；后续真机 Mac 反控 Windows 验收时再通过 Agent Link Board 发 call。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：把 Windows host 文本剪贴板写入纳入一键自检。
完成内容：
- `scripts/windows/test-windows-host.ps1` 默认增加 `--clipboardText` 验证。
- 新增 `-SkipClipboardText` 开关，特殊环境可跳过文本剪贴板验证。
- 更新根 README、Windows host README、当前状态、下一步行动和任务板。
修改文件：
- `scripts/windows/test-windows-host.ps1`
- `README.md`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `git diff --check`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-host.ps1`
验证结果：
- 临时 Windows host 启动成功，真实 `windows-gdi-jpeg` 首帧通过。
- 文本剪贴板写入通过：`Clipboard text accepted: 57 chars / mode=system`。
- 文件剪贴板写入通过：`Clipboard file accepted: 1 file / 128 bytes / saveMode=clipboard`。
遗留问题：
- 该自检会写入 Windows 系统剪贴板；需要保留原剪贴板内容时，可后续加保存/恢复逻辑。
下一步建议：
- Mac client 文本剪贴板入口推送后，用 `test-mac-client-browser.mjs` 扩展页面级验证，覆盖 Mac 控制 Windows 的剪贴板发送体验。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：新增认证重试策略回归脚本。
完成内容：
- 新增 `scripts/windows/test-auth-retry-policy.mjs`。
- 脚本会临时启动 Windows host，并导入启动假 Mac 服务。
- 对两条链路分别验证错误密码剩余 `2/1/0`、第三次认证失败后关闭连接、新连接正确密码通过。
- 更新根 README、Windows host README、当前状态、下一步行动和任务板。
修改文件：
- `scripts/windows/test-auth-retry-policy.mjs`
- `README.md`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check scripts/windows/test-auth-retry-policy.mjs`
- `git diff --check`
- `node scripts/windows/test-auth-retry-policy.mjs`
验证结果：
- Windows host 错误密码 3 次分别返回剩余 `2/1/0`，第三次后关闭；重新连接正确密码通过。
- 假 Mac 服务错误密码 3 次分别返回剩余 `2/1/0`，第三次后关闭；重新连接正确密码通过。
遗留问题：
- 该脚本只覆盖本地 Windows host 和假 Mac；真实 Mac 认证策略仍由 Mac 端自己的验证和探针覆盖。
下一步建议：
- 连接安全相关改动后先跑该脚本，再跑端到端页面/探针脚本。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：新增 Mac client 连接 Windows host 的 Windows 侧页面自检。
完成内容：
- 新增 `scripts/windows/test-mac-client-browser.mjs`。
- 脚本会临时启动 Windows host 和 `apps/mac-client` 静态页面，打开 Edge/Chrome，通过页面连接 Windows host。
- 自检会等待真实视频 surface，默认要求非 `mock-svg`，并发送鼠标移动、点击和键盘 `a`，确认页面收到 `input_ack`。
- 更新根 README、Windows host README、当前状态、下一步行动和任务板。
修改文件：
- `scripts/windows/test-mac-client-browser.mjs`
- `README.md`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `git diff --check`
- `node scripts/windows/test-mac-client-browser.mjs`
验证结果：
- 临时 Windows host 启动在 `127.0.0.1:43772`，Mac client 页面启动在 `127.0.0.1:5188`。
- 页面连接成功，远端状态 `1280x720 · windows-host-system-jpeg`，视频 `jpeg · #1`。
- 页面发送鼠标和键盘事件后收到 `input_ack`，输入状态 `已确认 · log`。
遗留问题：
- 默认输入模式为 `log`，不会真实注入；SendInput 仍需有人看屏幕时用专门参数或人工联调验证。
- 该脚本只验证 JPEG/data-url 路径；后续如果 Mac client 接 H.264 或音频播放，需要扩展自检。
下一步建议：
- Windows host 改动后同时跑 `test-windows-host.ps1` 和 `test-mac-client-browser.mjs`，覆盖被控端服务和 Mac 反控页面链路。
是否改了协议：否。
是否需要另一端配合：不需要；Mac 端可拉取后直接复用脚本结果。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：创建 Mac 控制 Windows 的最小控制端原型。
完成内容：
- 新增 `apps/mac-client` Web 原型，提供中文连接页和远端画面区域。
- 支持 `/discovery`、WebSocket `hello`、`auth_request`、`session_offer`。
- 支持显示 Windows host 的 JPEG/data-url `video_frame`，显示视频帧状态和 mock 音频状态。
- 支持点击远端画面后发送鼠标移动、按下/抬起、滚轮和键盘 `input_event`。
- 键盘映射默认把 Mac `Command` 当作 Windows `Ctrl` 发送，方便 Mac 上用 `Command+C/V` 控制 Windows 常用快捷键。
- 新增 `apps/mac-client/server.mjs` 静态服务和 README。
修改文件：
- `apps/mac-client/*`
- `README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
验证方式：
- `node --check apps/mac-client/server.mjs`
- `node --check apps/mac-client/app.js`
- `git diff --check`
- 本机启动 `apps/windows-host`：`LAN_DUAL_PORT=43772 LAN_DUAL_HOST=127.0.0.1 LAN_DUAL_WINDOWS_INPUT_MODE=log node server.mjs`
- 本机启动 `apps/mac-client`：`node server.mjs`
- 用浏览器打开 `http://127.0.0.1:5188/`，连接 `127.0.0.1:43772`。
验证结果：
- Mac client 页面发现 Windows host、认证、会话协商均通过。
- 页面显示 mock `video_frame`，状态为 `mock-svg`，视频帧递增。
- 点击远端画面并发送键盘 `a` 后，页面收到 `input_ack`：`已确认 · log`。
- Windows host 日志记录了鼠标 move/down/up 和 key 输入事件；临时 `43772` 端口已释放。
遗留问题：
- 这是 Web 原型，不是 SwiftUI/原生桌面窗口。
- 音频帧当前只显示状态，尚未播放 Windows host 音频。
- 仍需连接真实 Windows 机器验证真实 JPEG 画面、SendInput 和防火墙放行体验。
下一步建议：
- Windows 端认证重试限制完成后，Mac 端可拉取最新，再用 `apps/mac-client` 连接真实 Windows host 做端到端验证。
- 后续给 `apps/mac-client` 加剪贴板文本/文件入口、音频播放和更完整的错误提示。
是否改了协议：否。
是否需要另一端配合：后续真实 Windows host 验收需要 Windows 端配合启动服务。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：对齐本机假 Mac WebSocket 服务的认证失败限制。
完成内容：
- `apps/mock-mac-host/server.mjs` 现在会在同一 WebSocket 连接内统计密码失败次数。
- 失败时 `auth_result` 返回 `attemptsRemaining` 和 `maxAttempts`。
- 第 3 次失败返回 `LAN002` 和“次数过多”原因后关闭连接。
- 成功认证会重置失败计数。
修改文件：
- `apps/mock-mac-host/server.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check apps/mock-mac-host/server.mjs`
- `git diff --check`
- 临时 WebSocket 错误密码验证：连续 3 次错误密码分别返回剩余 `2/1/0`，第三次后连接关闭。
遗留问题：
- 假 Mac 仍是快速回归和失败场景模拟工具，真实功能验收继续以真 Mac host 为准。
下一步建议：
- 后续连接安全相关改动，继续同时验证真实 Mac、Windows host 和假 Mac 三条链路。
是否改了协议：否；使用现有 `attemptsRemaining/maxAttempts` 字段。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：补强 Windows 控制端认证失败提示和自动重连行为。
完成内容：
- Windows 控制端现在会读取 `auth_result.attemptsRemaining/maxAttempts`，密码错误时显示剩余尝试次数。
- 密码错误次数耗尽时显示被控端已关闭连接，提示用户检查密码后重新连接。
- 自动重连过程中如果遇到 `LAN002` 认证失败，会停止重连，避免继续消耗被控端认证次数。
- 本地模拟传输也会返回认证剩余次数，便于快速回归失败提示。
修改文件：
- `apps/windows-client/app.js`
- `apps/windows-client/protocol-client.js`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check apps/windows-client/protocol-client.js`
- `git diff --check`
- Edge 页面级本地模拟验证：选择“本地模拟 / 密码错误”后，远程状态显示 `连接密码错误，还可尝试 2 次。`，事件日志同步记录该提示。
遗留问题：
- 真机 UI 上的手动错误密码提示仍建议后续在 Windows 桌面窗口里人工看一眼。
下一步建议：
- 继续优化真实 Mac 连接中的重连和错误状态展示，尤其是权限、H.264 回退和输入拒绝场景。
是否改了协议：否；消费已有字段。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：对齐 Windows 被控端认证失败重试限制。
完成内容：
- Windows 被控端同一 WebSocket 连接内最多允许 3 次密码认证失败。
- `auth_result` 现在会返回 `attemptsRemaining` 和 `maxAttempts`；第三次失败返回 `LAN002` 后关闭连接。
- 认证成功会重置失败计数。
- 更新 Windows host README、当前状态和任务板。
修改文件：
- `apps/windows-host/src/windows-host-service.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `npm.cmd run check` in `apps/windows-host`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-host.ps1`
- 临时 WebSocket 错误密码验证：连续 3 次错误密码分别返回剩余 `2/1/0`，第三次后连接关闭。
遗留问题：
- 假 Mac 服务仍未加认证重试限制；如果要完全一致，后续可以补 mock 服务的失败次数模拟。
下一步建议：
- 后续 Windows host 安全相关改动后，继续同时验证正常认证路径和错误认证关闭路径。
是否改了协议：否；使用 Mac 端已经采用的 `attemptsRemaining` / `maxAttempts` 字段。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：补充 Windows 被控端本机一键自检入口，方便后续 Mac 反控 Windows 前做快速回归。
完成内容：
- 新增 `scripts/windows/test-windows-host.ps1`，默认在 `127.0.0.1:43772` 临时启动 Windows 被控端，跑完后自动关闭。
- 自检复用 canonical `scripts/windows/probe-mac-host.mjs`，验证 `/discovery`、WebSocket 认证、会话协商、真实 JPEG 首帧和文件剪贴板接收。
- 默认强制 `LAN_DUAL_WINDOWS_INPUT_MODE=log` 且不发送输入事件，避免无人值守时误动鼠标键盘；需要测 SendInput 时显式加 `-InputEvents -InputMode system`。
- 更新 Windows host README、根 README、当前状态、下一步和任务板。
修改文件：
- `scripts/windows/test-windows-host.ps1`
- `apps/windows-host/README.md`
- `README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-host.ps1`
- 验证结果：临时 Windows host 启动成功，认证通过，首帧 `codec=jpeg`、`capturePipeline=windows-gdi-jpeg`、`source=screen`，文件剪贴板 `saveMode=clipboard`，临时端口关闭成功。
遗留问题：
- 默认不覆盖真实输入注入；SendInput 仍需有人看着屏幕时用 `-InputEvents -InputMode system` 单独验证。
下一步建议：
- 后续每次改 Windows host 屏幕、剪贴板或输入模块后，先跑该脚本做本机回归。
- Mac 控制窗口到位后，用该脚本先确认 Windows host 健康，再进行双端联调。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：补充 Mac 键盘输入映射覆盖自检，降低后续输入注入回归风险。
完成内容：
- 新增 `scripts/mac/check-input-keymap.mjs`，解析 `InputEventInjector.swift` 中 `keyCodeByCode` 和 `keyCodeByKey` 两张映射表。
- 自检覆盖 Windows 控制端会发送的常用 `KeyboardEvent.code` 和 `event.key`：字母、数字、符号、导航键、修饰键、F1-F20、小键盘。
- 支持 `--json` 输出，便于后续接入一键回归或 CI。
- 更新 Mac host README，说明该脚本只做源码静态检查，不会注入真实键盘事件。
修改文件：
- `scripts/mac/check-input-keymap.mjs`
- `apps/mac-host/README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
验证方式：
- `node --check scripts/mac/check-input-keymap.mjs`
- `node scripts/mac/check-input-keymap.mjs`
- `node scripts/mac/check-input-keymap.mjs --json`
验证结果：
- `keyCodeByCode=115`、`keyCodeByKey=113`。
- `KeyboardEvent.code` 覆盖：字母 26/26、数字 10/10、符号 11/11、导航 15/15、修饰键 9/9、功能键 20/20、小键盘 18/18。
- `event.key` 覆盖：文本 60/60、导航 22/22、修饰键 8/8、功能键 20/20、小键盘 2/2。
遗留问题：
- 这是静态覆盖检查，不代表真实 `inject` 模式已经在用户桌面安全验证；真实注入仍需用户确认环境后切换 `LAN_DUAL_INPUT_MODE=inject` 做小范围验证。
下一步建议：
- 后续新增键盘映射或改 Windows 控制端键盘事件时，把 `node scripts/mac/check-input-keymap.mjs` 纳入回归。
- 真机输入验证继续先用 `log` 模式跑 `--inputEvents`，再切 `inject` 做单键/鼠标移动安全验收。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：补充 Mac 系统声音持续帧观察脚本。
完成内容：
- 新增 `scripts/mac/observe-mac-audio.mjs`，用最小 `hello/auth/session_offer` 握手连接真实 Mac host，持续统计 `audio_frame`。
- 脚本会校验 `pcm-f32le`、`pcm-f32le-base64`、48kHz、2ch、有效 `frames` 和 payload，并统计帧数、接收间隔、payload 大小、电平范围、frameId 范围。
- 更新 Mac host README，记录音频持续观察命令。
修改文件：
- `scripts/mac/observe-mac-audio.mjs`
- `apps/mac-host/README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
验证方式：
- `node --check scripts/mac/observe-mac-audio.mjs`
- `node scripts/mac/observe-mac-audio.mjs --help`
- `node scripts/mac/observe-mac-audio.mjs --durationMs 5000 --minFrames 40 --maxGapMs 1000`
- `node scripts/mac/observe-mac-audio.mjs --durationMs 10000 --minFrames 80 --maxGapMs 1000`
验证结果：
- 真实 Mac host `127.0.0.1:43770` / `system-pcm` 10 秒观察通过。
- 收到 501 帧，约 50.0 fps，接收间隔平均/最大 `20.0/22 ms`。
- payload 固定 `7680` bytes，总 payload `3847680` bytes，frameId `1->501`。
- 当前环境无系统声音，电平 `0.000/0.000/0.000`，这不影响帧节奏和格式验证。
遗留问题：
- 还需要在真实有声音播放、静音切换和长时间运行下继续观察电平变化、延迟和 CPU。
下一步建议：
- Mac 端可播放系统声音后运行 `node scripts/mac/observe-mac-audio.mjs --durationMs 30000 --minFrames 250 --maxGapMs 1000`，确认 level 随音频变化。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：补充 Mac host H.264 + PCM 音频连续连接稳定性检查入口。
完成内容：
- 新增 `scripts/mac/stress-mac-host.mjs`，循环复用 canonical `scripts/windows/probe-mac-host.mjs` 做连续 WebSocket 建连、H.264 首帧和 PCM 音频帧校验。
- 默认要求 `--requireH264`、`--requireAudio` 和 `--expectInputMode log`，适合真实 Mac 被控端安全联调。
- macOS 上会用 `lsof` / `ps` 采样监听进程 PID、RSS、CPU 和 FD 数，便于观察连续建连后的资源释放。
- 更新 Mac host README，记录本机稳定性检查命令。
修改文件：
- `scripts/mac/stress-mac-host.mjs`
- `apps/mac-host/README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
验证方式：
- `node --check scripts/mac/stress-mac-host.mjs`
- `node scripts/mac/stress-mac-host.mjs --help`
- `node scripts/mac/stress-mac-host.mjs --iterations 3 --expectInputMode log --timeoutMs 12000`
- `node scripts/mac/stress-mac-host.mjs --iterations 10 --expectInputMode log --timeoutMs 12000`
验证结果：
- 真实 Mac host `127.0.0.1:43770` 连续 10 次 H.264 + PCM 音频探针全部通过。
- H.264 首帧确认 `annexb-base64`、`screencapturekit-h264`、`avc1.420029`，NAL 包含 SPS/PPS/IDR。
- PCM 音频确认 `pcm-f32le-base64`、48kHz、2ch、960 frames、planar、payload 约 7680 bytes。
- 监听进程 PID `82436` 在 10 次循环中 FD `30->30`，RSS `63488->63312 KB`。
遗留问题：
- 当前只是短循环连接稳定性检查；后续仍需要更长时间播放、延迟、CPU 占用和真实控制端体验测试。
下一步建议：
- Mac 端后续可用 `node scripts/mac/stress-mac-host.mjs --iterations 50 --expectInputMode log` 做更长回归。
- 如果 Windows 端需要真实 Mac 长稳配合，可在联络板发 `call`，Mac 端保持 `43770/log` 运行并执行该脚本记录结果。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：让 Windows 控制端页面级自检可在 Mac 开发机上运行。
完成内容：
- `scripts/windows/test-windows-client-browser.mjs` 支持 `BROWSER_PATH` / `MSEDGE_PATH` / `CHROME_PATH`，并会自动查找 macOS Edge、Chrome 或 Chromium。
- 修复脚本在带空格的 macOS 仓库路径下启动本地静态服务失败的问题，改用 `fileURLToPath` 解析 `import.meta.url`。
- 更新 Windows 控制端 README，说明 macOS 开发机可用 Chrome/Edge 跑页面级自检。
修改文件：
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-client-browser.mjs --host 127.0.0.1 --port 43770 --injectPcmAudio --timeoutMs 45000`
验证结果：
- macOS Chrome headless 可启动并连接真实 Mac host。
- 当前 Chrome 环境不支持 `avc1.420029` H.264 配置时，控制端正确请求 JPEG 兜底并显示真实画面。
- PCM 音频播放入口通过注入验证，页面显示播放计数递增。
遗留问题：
- macOS Chrome 运行时会输出 Google updater 噪声日志，不影响自检结果。
下一步建议：
- 后续可把该页面级自检纳入 Mac 侧回归流程，用于验证真实 Mac host 与 Windows 控制端 UI 的端到端状态。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：让 Windows 控制端把远端文件写入 Windows 系统文件剪贴板。
完成内容：
- Windows 桌面壳新增 `write_files_to_clipboard` 原生命令：接收远端文件内容，保存到本机临时目录，再用 Windows 系统文件剪贴板写入这些文件路径。
- Windows 控制端远端文件托盘新增“写入系统文件剪贴板”按钮；桌面版接收远端文件完成后会自动尝试写入系统文件剪贴板。
- 浏览器预览版保持原有内存暂存和手动下载能力，不会误报系统剪贴板成功。
- 为避免桌面 IPC 一次传输过大，当前自动写系统文件剪贴板上限为 128MB；超过后仍保留在远端文件托盘下载。
- `clipboard_file_result.saveMode` 在桌面版成功时返回 `clipboard`，失败或浏览器预览时继续返回 `memory-only` / `temp` 和原因。
修改文件：
- `apps/windows-client/app.js`
- `apps/windows-client/index.html`
- `apps/windows-client/README.md`
- `apps/windows-desktop/src-tauri/src/main.rs`
- `apps/windows-desktop/src-tauri/Cargo.toml`
- `apps/windows-desktop/src-tauri/Cargo.lock`
- `apps/windows-desktop/src-tauri/tauri.conf.json`
- `apps/windows-desktop/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `cargo check` in `apps/windows-desktop/src-tauri`
- `npm.cmd run build` in `apps/windows-desktop`
- `git diff --check`
遗留问题：
- 还没有做大文件原生分块写入；超过 128MB 的远端文件先保留托盘下载。
- 未做真实 Mac 文件复制到 Windows 桌面壳的人工端到端点击验证；需要有人在 Windows 桌面 exe 中连接 Mac 后复制文件测试。
下一步建议：
- 真机测试时让 Mac 复制一个小文件或压缩包，确认 Windows 桌面版收到后资源管理器里可以直接粘贴。
- 后续把文件剪贴板写入从 base64 IPC 升级为原生分块/临时流，支持更大文件。
是否改了协议：否；仍使用现有 `clipboard_file_*` 消息和 `saveMode` 字段。
是否需要另一端配合：暂无阻塞；端到端验收时需要 Mac 端复制文件触发 `clipboard_file_*`。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：为 Windows 被控端接入真实屏幕采集第一版，支撑后续 Mac 反控 Windows。
完成内容：
- Windows 被控端新增系统截图 JPEG 视频帧路径，默认 Windows 环境使用 `system-jpeg`，非 Windows 或强制 mock 时保留模拟帧。
- `/discovery`、`session_answer`、`display_settings_ack` 和 `video_frame` 会暴露 `videoCodec=jpeg`、`capturePipeline=windows-gdi-jpeg`、`hostMode=windows-host-system-jpeg`、`source=screen` 等诊断字段。
- 视频发送循环改为异步防重入，截图尚未完成时不会堆积下一帧任务。
- 截图失败时自动回退 `mock-svg`，并在 `streamFallbackReason` / `lastCaptureError` 中保留失败原因。
- README、当前状态、下一步和任务板已同步，说明这是 PowerShell/System.Drawing 过渡层，后续仍需升级 Windows Graphics Capture。
修改文件：
- `apps/windows-host/src/windows-screen-capture.mjs`
- `apps/windows-host/src/windows-host-service.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check apps/windows-host/src/windows-screen-capture.mjs`
- `node --check apps/windows-host/src/windows-host-service.mjs`
- `npm.cmd run check` in `apps/windows-host`
- `git diff --check`
- 本机模块最小采集：`frameCodec=jpeg`、`pipeline=windows-gdi-jpeg`、`source=screen`、`640x360`。
- 临时启动 Windows 被控端 `127.0.0.1:43772`，复用探针 `--requireRealVideo` 通过：首帧 `codec=jpeg`、`capturePipeline=windows-gdi-jpeg`、`source=screen`。
遗留问题：
- 当前每帧会调用 PowerShell/System.Drawing，适合先验证真实画面，不适合高帧率长期使用；默认上限较低。
- 后续仍需 Windows Graphics Capture、视频编码管线和 WASAPI loopback。
下一步建议：
- Mac 端控制窗口到位后，可先连接 Windows host 验证 JPEG 真实画面，再推进输入和声音。
- Windows 端下一轮可继续做 WASAPI loopback 或把截图过渡层升级为 WGC 常驻采集。
是否改了协议：否；使用既有 `session_answer` / `display_settings_ack` / `video_frame` 字段。
是否需要另一端配合：暂无阻塞；后续 Mac 控制窗口验证时需要 Mac 端发起连接。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：接入 Windows 控制端真实 Mac PCM 音频播放入口。
完成内容：
- Windows 控制端请求 `preferredAudioCodec=pcm-f32le`，并在 `audio_settings_update` 中声明 `codec=pcm-f32le`。
- 新增 Web Audio 播放入口，支持 `pcm-f32le-base64` 过渡帧，兼容 `layout=planar` 和 `layout=interleaved`。
- 音量滑块会实时调整播放增益；关闭声音会释放 AudioContext。
- Edge 页面级自检新增 `--injectPcmAudio`，可注入 planar PCM 帧验证播放路径。
- Windows 真机探针新增 `-RequireAudio` / `--requireAudio`，可确认 Mac 返回真实 `pcm-f32le-base64` 音频帧。
- 已用真实 Mac 连接验证收到 `pcm-f32le` 音频帧后播放计数递增。
修改文件：
- `apps/windows-client/app.js`
- `apps/windows-client/README.md`
- `scripts/windows/test-windows-client-browser.mjs`
- `scripts/windows/probe-mac-host.mjs`
- `scripts/windows/test-mac-host.ps1`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-client-browser.mjs --host 192.168.31.122 --port 43770 --password demo-password --timeoutMs 45000 --injectPcmAudio`
- `scripts/windows/test-mac-host.ps1 -HostName 192.168.31.122 -RequireH264 -RequireAudio -ExpectInputMode log -TimeoutMs 15000`
遗留问题：
- 当前仍是 PCM + base64 过渡格式，带宽较高；后续应接 Opus 或二进制音频帧。
- 需要继续做长时间播放、静音、音量变化和延迟体验验证。
下一步建议：
- Mac 端继续验证系统声音采集稳定性；Windows 端可继续优化延迟和音频缓冲策略。
是否改了协议：否；本轮只消费 Mac 已推送的 PCM 音频协议字段。
是否需要另一端配合：暂无阻塞；后续长时间音频稳定性测试需要 Mac 端保持服务运行并播放系统声音。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：接入 Mac 真实系统声音采集第一版。
完成内容：
- 新增 ScreenCaptureKit 系统音频采集流，优先输出真实 `audio_frame`。
- 真实音频帧使用过渡格式：`codec=pcm-f32le`、`encoding=pcm-f32le-base64`、`audioMode=system-pcm`、48kHz、双声道、20ms。
- 系统音频启动失败时会发送 `audio_status`，并自动回退到原有模拟音频帧，避免控制端声音状态断掉。
- `/discovery`、`hello_ack`、`session_answer`、`display_settings_ack` 和 `audio_settings_ack` 会暴露实际音频 codec/mode。
- 更新协议文档、共享示例、Mac README、当前状态、下一步和任务板。
修改文件：
- `apps/mac-host/Sources/MacHost/MacHostService.swift`
- `apps/mac-host/Sources/MacHost/ScreenCaptureCoordinator.swift`
- `apps/mac-host/README.md`
- `shared/protocol/README.md`
- `shared/protocol/messages.example.json`
- `docs/03-architecture-and-protocol.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `swift build` in `apps/mac-host`
- `node scripts/windows/probe-mac-host.mjs --host 127.0.0.1 --port 43770 --requireH264 --expectInputMode log`
- Mac 本机播放 `/System/Library/Sounds/Glass.aiff`，临时 WebSocket 探针请求 `wantAudio=true`，收到 `pcm-f32le-base64` / `system-pcm` / `sampleRate=48000` / `channels=2` / `frames=960` / `payloadBytes=7680`。
遗留问题：
- Windows 控制端当前仍只显示音频帧状态，尚未播放真实 PCM。
- 过渡期 PCM + base64 带宽较高，后续应接 Opus 或二进制音频帧。
下一步建议：
- Windows 端接入 `pcm-f32le-base64` 播放，注意 `layout=planar` 时需要重排为播放器需要的 interleaved 格式。
- Mac 端继续验证静音、无系统声音、长时间运行和音量变化。
是否改了协议：是，新增真实 PCM 音频帧过渡字段；向后兼容保留 mock 音频帧。
是否需要另一端配合：需要 Windows 端接真实 PCM 播放。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：收尾 H.264 第一版真机验证状态，并清理 Swift 6 并发警告。
完成内容：
- 拉取并验证 `d63c4e3 Add H264 streaming video path` 后，Mac host 可在真 Mac 上启动 H.264 流式输出。
- 本机探针 `--requireH264 --expectInputMode log` 已确认 `videoCodec=h264`、`videoEncoding=annexb-base64`、`capturePipeline=screencapturekit-h264`。
- 为 Mac host 的主队列串行状态对象补充受控 `@unchecked Sendable` 标记，消除 Swift 6 Sendable 捕获警告。
- 同步当前状态、下一步、任务板、流式视频计划和测试协调文件，避免继续显示“H.264 待真机验证”的旧状态。
修改文件：
- `apps/mac-host/Sources/MacHost/MacHostService.swift`
- `apps/mac-host/Sources/MacHost/ScreenCaptureCoordinator.swift`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/09-streaming-video-plan.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/TEST_COORDINATION.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `swift build` in `apps/mac-host`
- `node scripts/windows/probe-mac-host.mjs --host 127.0.0.1 --port 43770 --requireH264 --expectInputMode log`
遗留问题：
- H.264 仍处于 JSON + base64 过渡传输，后续可迁移 WebSocket 二进制帧。
- 还需要 Windows 控制端做真实 WebCodecs 解码、延迟、连续重连、CPU 占用和回退体验验收。
下一步建议：
- Windows 端连接真实 Mac host，验证 H.264 画面是否稳定显示，并记录解码失败或回退原因。
- Mac 端下一轮优先做 H.264 连续重连/释放压测，或继续推进真实 macOS 系统声音采集。
是否改了协议：否。
是否需要另一端配合：需要 Windows 端继续做控制端真实 H.264 解码体验验收。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：修正 JPEG 链路帧率误导，并启动流式视频编码路线。
完成内容：
- Mac JPEG 调试链路默认 `LAN_DUAL_MAX_SCREEN_FPS` 从 12 提到 30，允许最高 60。
- Mac 会话协商返回真实协商 FPS、请求 FPS 和主机上限，避免 Windows 误显示请求值。
- Windows 控制端新增实收 FPS 统计，刷新率卡片显示实收 FPS、协商 Hz、请求 Hz。
- Windows 控制端收到真实视频帧后隐藏等待连接的模拟窗口覆盖层，并在鼠标按下时聚焦远控画布。
- 新增 `docs/09-streaming-video-plan.md`，确定 ScreenCaptureKit + VideoToolbox H.264 的下一阶段路线。
修改文件：
- `apps/mac-host/Sources/MacHost/HostConfiguration.swift`
- `apps/mac-host/Sources/MacHost/MacHostService.swift`
- `apps/windows-client/app.js`
- `apps/windows-client/styles.css`
- `docs/09-streaming-video-plan.md`
- `docs/03-architecture-and-protocol.md`
- `shared/protocol/*`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check apps/windows-client/protocol-client.js`
- `node scripts/windows/test-coordinate-mapping.mjs`
- `npm.cmd run check` in `apps/windows-host`
- `scripts/windows/dev-lab.ps1`
- `npm.cmd run build` in `apps/windows-desktop`
遗留问题：
- 当前仍是 JPEG 调试链路，不会达到稳定 60FPS；正式低延迟体验需按 H.264 计划继续实现。
下一步建议：
- Mac 端拉取最新代码后，重启 `apps/mac-host`，验证协商 FPS 和实收 FPS。
- 下一轮优先在 Mac 端实现 `SCStream` + `VTCompressionSession` 的 H.264 输出。
是否改了协议：是，新增/明确 `requestedFps`、`maxScreenFps`、H.264 `video_frame` 过渡字段。
是否需要另一端配合：需要 Mac 端拉取并重启服务验证。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：为同一局域网内的 Mac Codex 和 Windows Codex 增加实时联络工具。
完成内容：
- 新增 `scripts/codex-link-server.mjs`，提供局域网 Web 联络板、实时事件推送、状态、消息和测试呼叫接口。
- 新增 `scripts/codex-link-client.mjs`，让 Codex 可通过命令行查看状态、监控消息、发送消息、更新状态和发起测试呼叫。
- 新增 `scripts/windows/start-codex-link.ps1`，Windows 一键后台启动联络板。
- 新增 `docs/LAN_CODEX_LINK.md`，记录 Windows/Mac 启动方式和命令行收发方式。
- 更新 `docs/TEST_COORDINATION.md`，把局域网联络板作为优先联调通知方式之一。
修改文件：
- `scripts/codex-link-server.mjs`
- `scripts/codex-link-client.mjs`
- `scripts/windows/start-codex-link.ps1`
- `docs/LAN_CODEX_LINK.md`
- `docs/TEST_COORDINATION.md`
- `docs/04-task-board.md`
- `README.md`
验证方式：
- `node --check scripts/codex-link-server.mjs`
- `node --check scripts/codex-link-client.mjs`
- 已在 Windows 本机启动服务，地址为 `http://192.168.31.68:17888`。
- 已用命令行客户端发送状态和消息，并用 `watch --once` 收到回显。
遗留问题：
- 默认未启用令牌，只适合可信局域网；需要更安全时启动时传入 `--token` 或 `-Token`。
下一步建议：
- Mac 端拉取代码后打开 `http://192.168.31.68:17888`，或用 `scripts/codex-link-client.mjs --server http://192.168.31.68:17888 watch` 监控消息。
是否改了协议：否。
是否需要另一端配合：需要 Mac 端试连联络板。

## 2026-06-12 Windows Codex - 交接中心

日期：2026-06-12
开发端：Windows Codex
本轮目标：建立双 Codex 交接中心，减少 Mac 端和 Windows 端开发漂移。
完成内容：
- 新增 `docs/CURRENT_STATUS.md`，集中记录当前事实和开工检查。
- 新增 `docs/NEXT_ACTIONS.md`，集中记录短期优先任务和双端可接事项。
- 新增 `docs/ACTIVE_LOCKS.md`，登记当前文件占用和高冲突区域。
- 新增 `docs/HANDOFF_LOG.md`，作为双端阶段性交接记录。
- 新增 `docs/TEST_COORDINATION.md`，定义测试呼叫、阻塞和超时规则。
修改文件：
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
- `docs/TEST_COORDINATION.md`
- `docs/05-codex-handoff.md`
- `docs/04-task-board.md`
- `README.md`
验证方式：
- 文档已写入仓库，未改动现有业务代码。
遗留问题：
- 当前本地已有多处未提交改动，部分是在本轮文档改造前已存在，部分是在文档改造期间被检测到；已先登记到 `docs/ACTIVE_LOCKS.md`，接手前需要确认这些改动的归属和意图。
下一步建议：
- Mac 端 Codex 开工时先读 `docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md` 和 `docs/ACTIVE_LOCKS.md`。
- Windows 端下一次继续开发前，也先更新锁定文件状态。
是否改了协议：否。
是否需要另一端配合：需要 Mac 端遵守同一套交接文件。
