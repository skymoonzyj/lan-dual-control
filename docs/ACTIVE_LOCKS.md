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
| 无 | - | 当前没有文件占用 | 2026-06-12 | 已释放 |

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
