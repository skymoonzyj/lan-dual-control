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
| Windows Codex | `apps/mac-host/Sources/MacHost/HostConfiguration.swift`、`apps/mac-host/Sources/MacHost/MacHostService.swift`、`apps/windows-client/app.js`、`apps/windows-client/styles.css`、`docs/09-streaming-video-plan.md`、`shared/protocol/*` | 2026-06-12 | 已完成 JPEG 帧率协商修正、实收 FPS 显示、真实画面覆盖层修复和 H.264 流式视频计划。 |
