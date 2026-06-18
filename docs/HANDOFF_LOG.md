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

## 2026-06-19 Mac Codex

日期：2026-06-19 继续推进
开发端：Mac Codex
本轮目标：让 Mac heartbeat 直接给出前台 60Hz 安全启动命令，补齐旧 host / 远端 30Hz 上限时的无密下一步。
完成内容：
- `check-mac-heartbeat --boardSummary` 新增 `MacMaxFpsSafeStart=`，命令为 `start-mac-host --promptPassword --requirePassword --host 0.0.0.0 --port <port> --maxScreenFps 60`。
- JSON `commands.macMaxFpsSafeStartCommand` 同步输出，Windows watcher/控制端已有的 `MacMaxFpsSafeStart=` 消费逻辑可以直接复用。
- 该命令只是人工可复制指引，不自动启动 host、不读取或打印密码、不认证、不发送 input/inject。
修改文件：
- `scripts/mac/check-mac-heartbeat.mjs`
- `scripts/mac/test-mac-heartbeat.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增 heartbeat 自测断言并确认失败：`node scripts/mac/test-mac-heartbeat.mjs --timeoutMs 30000`，失败点是 `MacMaxFpsSafeStart=` 缺失。
- 实现后复跑同一 heartbeat 自测通过。
- 真实心跳：`node scripts/mac/check-mac-heartbeat.mjs --host 127.0.0.1 --port 43770 --clientHost 127.0.0.1 --clientPort 5188 --checkBoard --boardSummary` 已输出 `MacMaxFpsSafeStart=... --maxScreenFps 60`。
- 语法、Mac script help、diff check 和冲突扫描通过。
遗留问题：
- 真正停止旧 Mac host、前台 60Hz 启动或加载 LaunchAgent 仍需要用户授权；本轮没有请求密码，也没有启动/停止服务。
下一步建议：
- 白天用户在场时，先按 `MacHostStop=` 停旧 host，再按 `MacMaxFpsSafeStart=` 做前台 60Hz 验证，或按 `MacLaunchAgentLoad=` 切到 LaunchAgent 后跑 `MacUnattendedFormal=`。
是否改了协议：否；只增加 heartbeat 摘要/JSON 里的安全命令标签。
是否需要另一端配合：后续真实 Windows 控 Mac 60Hz 验收需要 Windows 端复跑页面/正式 E2E，但本轮不需要。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 本机 Mac 提醒 watcher 消费 `MacLaunchAgentLoad=` / `MacLaunchAgentPrint=`，在最小化窗口时也能提示 60Hz LaunchAgent 人工切换链。
完成内容：
- `watch-codex-link-mac-alerts.ps1` 新增 `MacLaunchAgentLoad=` / `MacLaunchAgentPrint=` 规则：同段出现 `loaded=false`、`launchAgentLoaded=false`、LaunchAgent 缺失/未加载/失败、`fps-limit`、`launch-agent-max-fps`、旧 build 或重启建议等上下文时会提醒。
- `test-mac-alert-watcher.mjs` 新增红绿回归：先确认 `loaded=false + MacLaunchAgentLoad/Print` 不提醒，再实现后确认会提醒；同时锁定干净 `warnings=none blockers=none` 命令清单不提醒。
- 这只是 Windows 本机提醒 watcher 的规则补强，不自动执行 `launchctl`，不认证、不发密码、不发送 input/inject。
修改文件：
- `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 红灯：`node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 20000` 失败在 `Mac LaunchAgent command guidance status should include "ALERT:"`。
- 绿灯：实现规则后复跑同一命令通过，并确认 “Mac LaunchAgent load/print guidance alone is ignored”。
- 提交前还会跑 PowerShell help 覆盖、语法、diff check 和冲突扫描。
遗留问题：
- 真机 60Hz 切换仍需用户或 Mac 端人工执行 `launchctl` 相关命令，并用 `MacUnattendedFormal=` 复查 loaded/max-fps blocker 是否消失。
下一步建议：
- 若 Mac heartbeat 显示 `loaded=false` 且同时提供 `MacLaunchAgentLoad=` / `MacLaunchAgentPrint=`，Windows 最小化窗口也应弹本机提醒；现场继续按 `MacHostStop=` -> `MacLaunchAgentLoad=` -> `MacLaunchAgentPrint=` -> `MacUnattendedFormal=` 处理。
是否改了协议：否；只消费已有通讯板/诊断文本里的安全命令标签。
是否需要另一端配合：后续真实执行 LaunchAgent 加载、打印验证和 formal 60Hz 强校验时需要 Mac 端或用户配合。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端消费 Mac heartbeat/readiness/unattended 里的 `MacLaunchAgentLoad=` / `MacLaunchAgentPrint=`，在 60Hz LaunchAgent 切换场景给出中文提示。
完成内容：
- Windows 控制端 Mac 提醒解析新增 `MacLaunchAgentLoad=` / `MacLaunchAgentPrint=` 识别：同段摘要有 warning/blocker、旧 build、重启建议、`fps-limit`、`launch-agent-max-fps` 或 `loaded=false` 等上下文时，会显示“Mac LaunchAgent 加载命令已提供”“Mac LaunchAgent 打印验证命令已提供”。
- 复制/导出诊断保留原始 `launchctl bootstrap` / `launchctl print` 命令，便于现场按 `MacHostStop=` -> `MacLaunchAgentLoad=` -> `MacLaunchAgentPrint=` -> `MacUnattendedFormal=` 的顺序让 Mac 侧人工切换和复查。
- 干净命令清单不误弹；这只是 UI 诊断和文案消费，不自动运行 `launchctl`，不认证、不发密码、不发送 input/inject。
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
- 先新增 diagnostics-only 页面断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5210 --debugPort 9350 --timeoutMs 45000`，失败点是 Mac 提醒诊断没有“Mac LaunchAgent 加载命令已提供”“Mac LaunchAgent 打印验证命令已提供”。
- 实现后复跑同一 diagnostics-only 通过；提交前还会跑语法、diff check 和冲突扫描。
遗留问题：
- 真机 60Hz 切换仍需用户或 Mac 端人工执行 `launchctl` 相关命令，并用 `MacUnattendedFormal=` 复查 loaded/max-fps blocker 是否消失。
下一步建议：
- 最新 Mac heartbeat 已经能上板 `MacLaunchAgentLoad=` / `MacLaunchAgentPrint=`；Windows 端看到 LaunchAgent/刷新率 warning 时，可直接复制提示链让 Mac 端完成人工切换。
是否改了协议：否；只消费已有通讯板/诊断文本里的安全命令标签。
是否需要另一端配合：后续真实执行 LaunchAgent 加载、打印验证和 formal 60Hz 强校验时需要 Mac 端或用户配合。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端消费 Mac heartbeat/readiness/unattended 里的 `MacUnattendedStatus=` / `MacUnattendedFormal=` 安全命令，在有 warning/blocker、旧 build 或刷新率上限上下文时给出中文提示。
完成内容：
- Windows 控制端 Mac 提醒解析新增值守状态/正式检查命令识别：同段摘要出现风险上下文时，会显示“Mac 值守状态命令已提供”“Mac 值守正式检查命令已提供”。
- 复制/导出诊断保留原始 `MacUnattendedStatus=` / `MacUnattendedFormal=` 命令，便于现场让 Mac 侧复跑普通值守状态或 formal 60Hz 强校验。
- 干净命令清单不误弹；这只是 UI 诊断和文案消费，不自动运行 Mac 脚本，不认证、不发密码、不发送 input/inject。
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
- 先新增 diagnostics-only 页面断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5210 --debugPort 9350 --timeoutMs 45000`，失败点是 Mac 提醒诊断没有“Mac 值守状态命令已提供”“Mac 值守正式检查命令已提供”。
- 实现后复跑同一 diagnostics-only 通过；提交前还会跑语法、diff check 和冲突扫描。
遗留问题：
- 真机 Mac host 仍是旧 build/restart recommended 场景时，后续仍需用户或 Mac 端按 `MacHostStop=` / `MacHostSafeStart=` 完成真实切换，再验收 60Hz、文件剪贴板和输入链路。
下一步建议：
- Mac heartbeat 已能上板 `MacUnattendedStatus=` / `MacUnattendedFormal=`；Windows 端看到值守/刷新率 warning 时，先让 Mac 端复跑这些检查，再决定是否执行 stop/safe-start。
是否改了协议：否；只消费已有通讯板/诊断文本里的安全命令标签。
是否需要另一端配合：后续真实切换 Mac host、复跑 formal 60Hz 强校验时需要 Mac 端或用户配合。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端消费 Mac heartbeat/readiness 里的 `MacHostStop=`，在旧 Mac host build 场景给出清楚中文提示。
完成内容：
- Windows 控制端 Mac 提醒解析新增 `MacHostStop=` 识别：当同段摘要出现 `mac-host-build-stale`、`restart recommended`、`runtimeBuild=` 或 `hostRuntimeChanges=` 时，会显示“Mac host 停止旧进程命令已提供”。
- 复制/导出诊断保留原始 `MacHostStop=` 命令，便于现场先停止旧 Mac host，再按 `MacHostSafeStart=` 安全前台启动到新 build。
- 这只是 UI 诊断和文案消费，不自动运行 stop/start，不认证、不发密码、不发送 input/inject。
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
- 先新增 diagnostics-only 页面断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5210 --debugPort 9350 --timeoutMs 45000`，失败点是 Mac 提醒诊断没有“Mac host 停止旧进程命令已提供”。
- 实现后复跑同一 diagnostics-only 通过。
遗留问题：
- 真机 Mac host 仍需人工在 Mac 侧停止旧进程并用最新/60Hz 安全启动后再验收真实 60Hz、文件剪贴板和输入链路。
下一步建议：
- Mac heartbeat 再报 `mac-host-build-stale` 时，先按 `MacHostStop=` / `MacHostSafeStart=` 处理旧 host，再做正式 Windows 控 Mac 验收。
是否改了协议：否；只消费已有通讯板/诊断文本里的 `MacHostStop=`。
是否需要另一端配合：需要 Mac 端或用户在现场执行停止旧 host 和安全重启时配合。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端本机文件等待对端确认期间，当前 transfer 的对端进度能刷新保活时间。
完成内容：
- `clipboard_file_progress` 如果属于当前 `transferId`，会刷新 `lastActivityAt`，确认超时计算也优先使用最新活动时间。
- 大文件场景里，只要对端仍在持续上报接收进度，Windows 端不会按本机分块发送完成时间误判“对端确认超时”。
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
- 先新增页面断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`（失败点：对端 progress 到达后仍按旧完成时间触发“对端确认超时”）。
- 实现后复跑同一 diagnostics-only 通过。
遗留问题：
- 这只是等待确认阶段的保活，不是断点续传；连接中断后仍需从头重新发送。
下一步建议：
- 真机大文件测试时观察对端进度、最终 result、确认超时和重新发送按钮是否与 Mac 侧大文件接收时间一致。
是否改了协议：否；只消费既有 `clipboard_file_progress` 和 `transferId`。
是否需要另一端配合：暂不需要。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端本机文件发送中途收到当前 transfer 失败结果时保留文件并可重发。
完成内容：
- `clipboard_file_result.accepted=false` 如果在当前 transfer 分块发送中途到达，会复用 active 发送信息保留文件名、大小和可重发状态。
- 发送循环在收到当前失败结果后立即停止，不再继续发送剩余分块或 `clipboard_file_complete`，顶部状态和全屏/监看浮层保持“对端文件接收失败 · 可重新发送”。
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
- 先新增页面断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`（失败点：中途失败后顶部仍显示“正在发送”，`canRetry=false`，按钮仍是“发送文件”）。
- 实现后复跑同一 diagnostics-only 通过。
遗留问题：
- 这仍是从头重新发送，不是断点续传。
下一步建议：
- 真机大文件测试时观察中途失败、确认超时、对端拒收和旧消息迟到的按钮/浮层/诊断文案是否一致。
是否改了协议：否；只消费既有 `clipboard_file_result` 和 `transferId`。
是否需要另一端配合：暂不需要。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端本机文件重新发送时，active 发送中也忽略旧 transfer 的迟到结果。
完成内容：
- `clipboard_file_result` 现在优先用正在发送的 `outgoingFileTransfer.transferId` 判断当前任务；如果旧 transfer 的结果在新一轮分块发送中途才到，只写事件日志，不再覆盖当前顶部剪贴板状态或全屏/监看浮层。
- 页面 diagnostics-only 覆盖“确认超时 -> 重新发送 -> 第一块发送中旧 result 迟到”的场景，确保当前发送中状态不被旧结果打断。
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
- 先新增页面断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`（失败点：旧 result 在 active retry 中把 UI 覆盖成“对端已接收...”）。
- 实现后复跑同一 diagnostics-only 通过。
遗留问题：
- 这仍是从头重新发送，不是断点续传。
下一步建议：
- 真机大文件测试时继续观察 active 发送、等待确认、旧 response/result/progress 迟到和重新发送按钮文案是否保持一致。
是否改了协议：否；只消费既有 `transferId`。
是否需要另一端配合：暂不需要。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端本机文件发送重试后忽略旧 transfer 的迟到清单响应。
完成内容：
- `clipboard_file_response` 现在会检查 `transferId`；如果旧 transfer 的接受/拒绝清单响应在重新发送后才到，只写事件日志，不再覆盖当前顶部剪贴板状态或全屏/监看浮层。
- 页面 diagnostics-only 覆盖“确认超时 -> 重新发送 -> 旧 accepted/rejected response 迟到”的场景，确保当前发送仍保持“等待对端确认”状态。
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
- 先新增页面断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`（失败点：旧 accepted response 覆盖为“对端已准备接收文件”，旧 rejected response 覆盖为旧拒绝原因）。
- 实现后复跑同一 diagnostics-only 通过。
遗留问题：
- 这仍是从头重新发送，不是断点续传。
下一步建议：
- 真机大文件测试时继续观察旧 response、旧 result、旧 progress 和重新发送按钮文案是否保持一致，不互相覆盖。
是否改了协议：否；只消费既有 `transferId`。
是否需要另一端配合：暂不需要。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端本机文件发送重试后忽略旧 transfer 的迟到进度。
完成内容：
- `clipboard_file_progress` 现在会检查 `transferId`；如果旧 transfer 的进度在重新发送后才到，只写事件日志，不再覆盖当前顶部剪贴板状态或全屏/监看浮层。
- 页面 diagnostics-only 覆盖“确认超时 -> 重新发送 -> 旧进度 100% 迟到”的场景，确保当前发送仍保持“等待对端确认”状态。
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
- 先新增页面断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`（失败点：旧 `clipboard_file_progress` 把状态覆盖成“对端接收 100%”）。
- 实现后复跑同一 diagnostics-only 通过。
遗留问题：
- 这仍是从头重新发送，不是断点续传。
下一步建议：
- 真机大文件测试时继续观察旧 result、旧 progress 和重新发送按钮文案是否保持一致，不互相覆盖。
是否改了协议：否；只消费既有 `transferId`。
是否需要另一端配合：暂不需要。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端收到对端文件清单拒绝时立即显示失败并允许重发。
完成内容：
- `clipboard_file_response.accepted=false` 现在会更新本机发送状态为对端失败，显示对端拒绝原因和“可重新发送”。
- 文件选择会保留，发送按钮切到“重新发送”；全屏/监看浮层同步显示可重发状态。
- 发送循环在让出 UI 后会识别同一 transfer 的拒绝状态，避免继续保持“等待对端确认”的旧表现。
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
- 先新增页面断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`（失败点：拒绝后顶部只显示“对端拒绝文件”，浮层仍是“等待对端确认”，按钮仍是“发送文件”）。
- 实现后复跑同一 diagnostics-only 通过。
遗留问题：
- 这只消费既有 `clipboard_file_response`，不新增协议字段，也不实现断点续传。
下一步建议：
- 真机互传大文件时顺手观察 offer 拒绝、完成后 result 失败、确认超时三种失败路径的按钮和浮层文案是否一致。
是否改了协议：否；只改 Windows 控制端 UI 状态和页面自测。
是否需要另一端配合：暂不需要。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端手动发送文件未选择文件时给出稳定可见中文提示。
完成内容：
- 手动发送文件入口没有文件时，顶部剪贴板状态会显示“未选择文件”。
- 全屏/监看浮层会同步显示“未选择文件”，不会残留上一条“文件过大”或等待确认状态。
- 页面 diagnostics-only 覆盖空选择早退，确认不会发送 `clipboard_file_offer` / chunk / complete。
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
- 先新增页面断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`（失败点：顶部仍为“已开启”，浮层残留上一条“文件过大”）。
- 实现后复跑同一 diagnostics-only 通过。
遗留问题：
- 这只改善空选择早退反馈，不改变文件选择器、文件大小上限、分块协议或断点续传策略。
下一步建议：
- 真机手动发送文件时顺手确认取消选择、重新选择和失败重发三类按钮状态不会互相覆盖。
是否改了协议：否；只改 Windows 控制端 UI 状态和页面自测。
是否需要另一端配合：暂不需要。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端手动发送文件超过大小上限时给出稳定可见中文提示。
完成内容：
- 手动发送文件/压缩包超过当前大小上限时，顶部剪贴板状态会显示“文件过大”并带当前上限原因。
- 全屏/监看浮层会同步显示“文件过大”和“超过当前上限”，不会停留在旧的等待对端确认状态。
- 页面 diagnostics-only 用轻量 fake 文件对象覆盖超限早退，不会创建真实大文件。
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
- 先新增页面断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`（失败点：文件过大时浮层仍显示旧的“等待对端确认”）。
- 实现后复跑同一 diagnostics-only 通过。
遗留问题：
- 这只改善超限早退反馈，不改变 512 MB 上限、分块协议或断点续传策略。
下一步建议：
- 真机大文件测试时确认“文件过大”提示、对端确认超时提示和重新发送按钮文案不会互相覆盖。
是否改了协议：否；只改 Windows 控制端 UI 状态和页面自测。
是否需要另一端配合：暂不需要。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端手动发送文件在未连接或剪贴板关闭时给出稳定可见中文提示。
完成内容：
- 未连接被控端时手动发送文件，顶部剪贴板状态会显示“请先连接被控端”。
- 剪贴板同步关闭时手动发送文件，顶部状态会显示“已关闭”。
- 全屏/监看浮层会同步显示同一状态，不会被旧的本地剪贴板提示覆盖。
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
- 先新增页面断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`（失败点：手动发送文件未连接时浮层仍显示旧状态“已关闭”）。
- 实现后复跑同一 diagnostics-only 通过。
遗留问题：
- 这只改善手动发送文件的早退反馈，不改变文件夹递归发送和断点续传策略。
下一步建议：
- 真机体验时顺手确认“发送文件”按钮、资源管理器 `Ctrl+V`、断线、关闭剪贴板开关四条路径的提示是否一致。
是否改了协议：否；只改 Windows 控制端 UI 状态和页面自测。
是否需要另一端配合：暂不需要。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端 `Ctrl+V` 在未连接或剪贴板关闭时给出可见中文提示。
完成内容：
- 未连接被控端时按 `Ctrl+V`，顶部剪贴板状态会显示“请先连接被控端”。
- 剪贴板同步关闭时按 `Ctrl+V`，顶部状态会显示“已关闭”。
- 全屏/监看浮层会同步显示同一状态，避免远控画面里按键后没有反馈。
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
- 先新增页面断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`（失败点：未连接时仍显示“剪贴板：待机”，剪贴板关闭时顶部仍显示“剪贴板：已开启”）。
- 实现后复跑同一 diagnostics-only 通过。
- `node --check apps/windows-client/app.js` 通过。
- `node --check scripts/windows/test-windows-client-browser.mjs` 通过。
- `git diff --check` 通过。
- 冲突标记扫描无命中。
遗留问题：
- 这只改善 `Ctrl+V` 早退反馈，不改变文件夹递归发送和断点续传策略。
下一步建议：
- 真机体验时顺手确认断开连接、关闭剪贴板开关、复制普通文件/压缩包、复制文件夹四种 `Ctrl+V` 状态都能一眼读懂。
是否改了协议：否；只改 Windows 控制端 UI 状态和页面自测。
是否需要另一端配合：暂不需要。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端 `Ctrl+V` 文件剪贴板读取失败时给出可见中文原因。
完成内容：
- 当资源管理器剪贴板里只有文件夹、桌面原生读取不可用或读取失败时，顶部剪贴板状态会显示具体原因。
- 全屏/监看浮层剪贴板状态会同步显示同一原因，避免只在事件日志里看到失败。
- 浮层状态优先级保持传输状态更高，文件发送中/失败/等待确认不会被旧的本地读取失败提示覆盖。
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
- 先新增页面断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`（失败点：浮层仍显示“剪贴板：已开启”，以及旧状态可能盖住后续正常发送的“等待对端确认”）。
- 实现后复跑同一 diagnostics-only 通过。
- `node --check apps/windows-client/app.js` 通过。
- `node --check scripts/windows/test-windows-client-browser.mjs` 通过。
- `git diff --check` 通过。
- 冲突标记扫描无命中。
遗留问题：
- 文件夹剪贴板仍暂不递归发送；后续若要支持文件夹，需要先设计打包和目录结构策略。
下一步建议：
- Windows 桌面版真机验收时，分别复制普通文件、压缩包和文件夹后在远控窗口按 `Ctrl+V`，确认成功路径、失败原因、浮层状态和事件日志都好读。
是否改了协议：否；只改 Windows 控制端 UI 状态和页面自测。
是否需要另一端配合：暂不需要；真机长测时再请 Mac 端配合接收文件。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 桌面控制端支持资源管理器复制文件后用 `Ctrl+V` 发送到被控端。
完成内容：
- Windows 控制端在浏览器剪贴板 API 没有读到文件时，会尝试调用 Tauri 原生文件剪贴板读取。
- Windows 桌面壳新增 `begin_clipboard_file_read`、`read_clipboard_file_chunk`、`cancel_clipboard_file_read`，读取系统 `FileDropList` 后按块返回文件内容。
- 资源管理器复制普通文件/压缩包后，远控窗口 `Ctrl+V` 会沿现有 `clipboard_file_*` 通道发送；文件夹暂不递归发送，避免误传整目录。
修改文件：
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-desktop/src-tauri/src/main.rs`
- `apps/windows-client/README.md`
- `apps/windows-desktop/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增页面断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`（失败点：未调用原生命令、未发送文件）。
- 先新增 Rust 单测并确认失败：`cargo test --manifest-path apps/windows-desktop/src-tauri/Cargo.toml native_clipboard_read_transfer_reads_file_chunks_and_cleans_state`（失败点：读取函数不存在）。
- 实现后复跑页面 diagnostics-only 通过。
- `cargo test --manifest-path apps/windows-desktop/src-tauri/Cargo.toml` 通过。
遗留问题：
- 文件夹剪贴板暂不递归发送；后续如果要支持文件夹，需要先设计打包/目录结构策略。
- 仍不是断点续传；连接中断后需要从头重发。
下一步建议：
- Windows 桌面版真机验收：在资源管理器复制 `.zip` 或普通文件，切回远控窗口按 `Ctrl+V`，观察发送进度、对端 result、复制诊断和重发体验。
是否改了协议：否；复用既有 `clipboard_file_offer/chunk/complete/result`。
是否需要另一端配合：暂不需要；真机长测时再请 Mac 端配合接收文件。

## 2026-06-19 Mac Codex

日期：2026-06-19 继续推进
开发端：Mac Codex
本轮目标：让 Mac client 在 Windows 文件剪贴板不可用时本地拦截手动文件/压缩包发送。
完成内容：
- Mac client 现在会消费 Windows host 的 `clipboardFile` / `clipboardFileMode` 和 `capabilities.clipboard.file` / `fileMode`。
- 当对端明确报告文件剪贴板不可用时，Mac 端选择文件后会禁用发送按钮并提示检查 Windows 文件剪贴板能力。
- 发送函数增加二次守卫；即使按钮被误触，也不会发出 `clipboard_file_offer`、分块或完成消息。
- 复制/导出诊断的“文件发送建议”会覆盖对端文件剪贴板不可用场景。
修改文件：
- `apps/mac-client/app.js`
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增浏览器自测断言并确认失败：`node scripts/windows/test-mac-client-browser.mjs --clientPort 5198 --debugPort 9342 --mockVideo --allowClipboardFallback --progressIntervalMs 0 --timeoutMs 45000`，失败点为 `Mac client remote file clipboard unavailable guard timed out`。
- 实现后同一命令通过，新增输出：`Mac client remote file clipboard unavailable copied advice: copied diagnostics include file clipboard advice` 和 `File remote capability guard: 对端文件剪贴板不可用...`。
- 过程中发现并修复断开连接取消提示被能力清空刷新覆盖的问题，复跑同一自测通过。
遗留问题：
- 这只是 Mac client 本地 UI/诊断守卫，不修复 Windows host 或系统文件剪贴板能力本体。
- 旧 host 没有能力字段时仍保持允许发送，避免误拦截；真机仍需通过诊断确认两端能力是否准确。
下一步建议：
- 真机文件/压缩包测试时同时粘贴 Mac client 复制诊断和 Windows 控制端复制/导出诊断，确认两端的文件剪贴板能力建议能对上。
是否改了协议：否；只消费既有能力字段并改 Mac client 本地 UI/自测/文档。
是否需要另一端配合：暂不需要；真机长测时再呼叫 Windows 配合。

## 2026-06-19 Mac Codex

日期：2026-06-19 继续推进
开发端：Mac Codex
本轮目标：让 Mac client 复制/导出诊断在文件发送失败或超时时直接给出下一步建议。
完成内容：
- Mac client 导出/复制诊断新增“文件发送建议”行。
- 文件发送中或等待确认时提示保持连接和等待 Windows 回执。
- 对端失败、确认超时或可重新发送时提示点击“重新发送”，并让 Windows 端检查连接、文件剪贴板能力、权限或磁盘空间。
修改文件：
- `apps/mac-client/app.js`
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/windows/test-mac-client-browser.mjs --clientPort 5198 --debugPort 9342 --mockVideo --allowClipboardFallback --progressIntervalMs 0 --timeoutMs 45000`（失败点：复制诊断缺少“文件发送建议”“点击‘重新发送’”“检查文件剪贴板能力”）。
- 实现后复跑同一 mock browser 自测通过，新增输出：`Mac client file clipboard failed result copied advice: copied diagnostics include file clipboard advice` 和 `Mac client file clipboard timeout copied advice: copied diagnostics include file clipboard advice`。
遗留问题：
- 这仍是诊断和现场操作提示增强，不是断点续传。
- 真机大文件/压缩包长测仍需观察 Mac 诊断建议、Windows 端 result 和重发体验是否足够好读。
下一步建议：
- 真机长测时同时粘贴 Mac client 复制诊断和 Windows 控制端复制/导出诊断，确认两边“文件发送建议 / 本机发送建议 / 远端文件建议 / 剪贴板能力建议”能互相对上。
是否改了协议：否；只改 Mac client 本地诊断导出和页面自测。
是否需要另一端配合：暂不需要；真机长测时再呼叫 Windows 配合。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端在对端文件剪贴板不可用时，本地拦截手动发送文件。
完成内容：
- Windows 控制端发送文件前会读取被控端剪贴板能力诊断。
- 当被控端明确报告文件剪贴板不可用时，页面会提示“对端文件剪贴板不可用”，不再发送 `clipboard_file_offer`、分块或完成消息。
- 未知能力不阻断发送，避免旧 host 缺少诊断字段时误拦截。
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
- 先新增断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`（失败点：仍发送 offer/chunk/complete）。
- 实现后复跑同一 diagnostics-only 命令通过。
遗留问题：
- 这只是发送前的本地防误操作；对端文件剪贴板能力本体修复仍要看 Mac/Windows host 端实现。
下一步建议：
- 真机文件/压缩包复制长测时，如果看到“对端文件剪贴板不可用”，优先让被控端修复文件剪贴板能力，临时路径继续用远端文件托盘/临时目录。
是否改了协议：否；只消费既有 `/discovery`/host diagnostics 能力并做 Windows 控制端本地拦截。
是否需要另一端配合：暂不需要；真机长测时再请被控端配合验证文件剪贴板能力。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端复制/导出诊断给出剪贴板能力下一步建议。
完成内容：
- 复制/导出诊断新增“剪贴板能力建议”，独立于“剪贴板状态”“远端文件建议”和“本机发送建议”。
- 剪贴板同步关闭时提示先开启；远端文字剪贴板不可用时提示检查被控端剪贴板权限或模式。
- 远端文件剪贴板不可用时，报告会明确提示文件/压缩包不能直接复制粘贴，并建议检查被控端文件剪贴板能力，或暂时使用远端文件托盘/临时目录。
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
- 先新增断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`（失败点：快速摘要和详细报告没有“剪贴板能力建议”）。
- 实现后复跑同一 diagnostics-only 命令通过。
遗留问题：
- 这仍是诊断和现场操作提示增强，不是文件剪贴板能力本体修复。
下一步建议：
- 真机文件/压缩包复制长测时，若报告出现“剪贴板能力建议”，优先按提示检查对应端的文字/文件剪贴板能力，再判断是否需要做更深的原生剪贴板修复。
是否改了协议：否；只改 Windows 控制端本地诊断导出。
是否需要另一端配合：暂不需要；真机长测时再请 Mac 端配合文件复制/接收。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端复制/导出诊断给出远端文件接收下一步建议。
完成内容：
- 复制/导出诊断新增“远端文件建议”行，独立于“远端文件”状态。
- 接收中会提示保持连接；接收超时、中断、坏分块或拒收时会提示让 Mac 重新复制并检查连接。
- Windows 系统文件剪贴板写入失败时，会提示重试写入、检查文件剪贴板权限或打开临时目录取文件；成功状态不输出建议。
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
- 先新增断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`（失败点：快速摘要和详细报告没有“远端文件建议”）。
- 实现后复跑同一 diagnostics-only 命令通过。
遗留问题：
- 这仍是诊断和现场操作提示增强，不是断点续传。
下一步建议：
- 真机大文件/压缩包长测时观察“远端文件建议”和“本机发送建议”是否能直接指导现场恢复。
是否改了协议：否；只改 Windows 控制端本地诊断导出。
是否需要另一端配合：暂不需要；真机长测时再请 Mac 端配合文件复制/接收。

## 2026-06-19 Mac Codex

日期：2026-06-19 继续推进
开发端：Mac Codex
本轮目标：让 Mac client 发送文件后，如果对端迟迟不返回 `clipboard_file_result`，也能保留文件并一键重发。
完成内容：
- Mac client 发送 `clipboard_file_complete` 后会启动默认 45 秒确认计时器。
- 计时器到期仍未收到当前 transfer 的 `clipboard_file_result` 时，页面显示“确认超时”、保留当前文件选择，并把按钮切换为“重新发送”。
- 点击“重新发送”会从头发起新的 `transferId`；旧 transfer 的迟到 result 会被忽略，不会覆盖当前重发等待状态。
修改文件：
- `apps/mac-client/app.js`
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/windows/test-mac-client-browser.mjs --clientPort 5198 --debugPort 9342 --mockVideo --allowClipboardFallback --progressIntervalMs 0 --timeoutMs 8000`（失败点：`Mac client file clipboard timeout retry state timed out`）。
- 实现后复跑完整 mock browser 自测：`node scripts/windows/test-mac-client-browser.mjs --clientPort 5198 --debugPort 9342 --mockVideo --allowClipboardFallback --progressIntervalMs 0 --timeoutMs 45000`，新增输出：`File clipboard retry after result timeout: 确认超时 ... 可重新发送 -> 已写入 · clipboard · 128 B`。
遗留问题：
- 这仍不是断点续传；超时后的重发会从头发送保留文件。
- 真机大文件/压缩包长测仍需观察 Windows 端真实 result、超时和重发体验。
下一步建议：
- 真机长测时同时看 Mac client 超时重发、Windows 控制端本机发送超时重发和复制/导出诊断是否一致好读。
是否改了协议：否；只消费既有 `clipboard_file_result`，并在本地 UI 做超时兜底。
是否需要另一端配合：暂不需要；真实大文件/压缩包长测时再呼叫 Windows 配合。

## 2026-06-19 Mac Codex

日期：2026-06-19 继续推进
开发端：Mac Codex
本轮目标：让 Mac client 发送文件到 Windows 后，能消费对端失败结果并保留一键重发。
完成内容：
- Mac client 发送 `clipboard_file_complete` 后现在进入“等待确认”状态，按钮保持禁用，不再把“网络已发完”误当成对端已写入。
- 收到 `clipboard_file_result accepted:false`（例如 Windows 接收端完整性守卫返回 `LAN011`）时，页面会显示失败 code/reason、保留当前文件选择，并把按钮切换为“重新发送”。
- 点击“重新发送”会复用保留文件重新发起新的 transfer；成功收到 accepted 结果后才清空文件选择并恢复普通“发送文件”按钮。
修改文件：
- `apps/mac-client/app.js`
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/windows/test-mac-client-browser.mjs --clientPort 5198 --debugPort 9342 --mockVideo --allowClipboardFallback --progressIntervalMs 0 --timeoutMs 45000`（失败点：`Mac client file clipboard failed result retry state timed out`）。
- 实现后复跑同一命令通过，新增输出：`File clipboard retry after failed result: 失败 · temp · LAN011 · offset mismatch; please resend · 可重新发送 -> 已写入 · clipboard · 128 B`。
遗留问题：
- 这不是断点续传；重发会从头发起新 transfer。
- 真实 Windows host 的大文件/压缩包失败后资源管理器粘贴体验仍需人工长测。
下一步建议：
- Windows 端继续补控制端发送文件后的对端结果提示时，可以用 Mac client 现在的 `LAN011 -> 重新发送` 行为做对照。
是否改了协议：否；只消费既有 `clipboard_file_result` 字段。
是否需要另一端配合：暂不需要。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端复制/导出诊断给出本机发送文件下一步建议。
完成内容：
- 复制/导出诊断新增“本机发送建议”行，独立于“本机发送文件”状态。
- 确认超时、对端拒收或本机发送失败时，报告会提示点击“重新发送”；重复失败时提示让对端检查文件剪贴板能力、权限或磁盘空间。
- 对端已接收成功时不输出建议，避免正常报告被无关操作提示打扰。
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
- 先新增断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`（失败点：快速摘要和详细报告没有“本机发送建议”）。
- 实现后复跑同一 diagnostics-only 命令通过。
遗留问题：
- 这仍是诊断和现场操作提示增强，不是断点续传。
下一步建议：
- 真机大文件/压缩包长测时观察“本机发送文件”和“本机发送建议”是否足够指导重发或对端排查。
是否改了协议：否；只改 Windows 控制端本地诊断导出。
是否需要另一端配合：暂不需要；真机长测时再请 Mac 端配合文件复制/接收。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端复制/导出诊断单独显示本机发送文件状态。
完成内容：
- 复制/导出诊断新增“本机发送文件”摘要，独立于“剪贴板状态”和“远端文件”。
- 状态可显示正在发送、等待对端确认、对端确认超时、对端失败或本机发送失败，并带短文件名列表。
- 页面 diagnostics 回归覆盖同时存在远端文件接收和本机发送文件确认超时的场景，确保导出报告不会互相覆盖。
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
- 先新增断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`（失败点：快速摘要和详细报告没有“本机发送文件”）。
- 实现后复跑同一 diagnostics-only 命令通过。
遗留问题：
- 这仍是诊断展示增强，不是断点续传。
- 真机大文件/压缩包长测时继续观察导出诊断里的本机发送文件状态是否足够好读。
下一步建议：
- 后续可以继续做真实长测前的自动化提示，例如把“确认超时后建议重发/让对端检查文件剪贴板能力”做成更短的现场操作建议。
是否改了协议：否；只改 Windows 控制端本地诊断导出。
是否需要另一端配合：暂不需要；真机长测时再请 Mac 端配合文件复制/接收。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端手动发送文件等待对端确认超时时可直接重发。
完成内容：
- 本机文件分块发送完成后，如果 45 秒没有收到对端 `clipboard_file_result`，顶部剪贴板状态和全屏/监看浮层会提示“对端确认超时”。
- 确认超时后保留当前文件选择，按钮切换为“重新发送”，用户可直接从头重发保留文件。
- 如果超时后已经重新发送，旧 `transferId` 的迟到对端结果只写事件日志，不再覆盖当前重发等待状态。
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
- 先新增断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`（失败点：旧 `transferId` 的迟到结果覆盖当前重发状态）。
- 实现后复跑备用端口：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`
遗留问题：
- 这仍是从头重新发送，不是断点续传。
- 默认 `5197/9337` 端口复跑时曾只打印页面地址后退出，备用端口通过；现场若看到 `WinClientPorts=occupied(...;stale-diagnostics)`，继续按已有备用端口提示处理。
下一步建议：
- 真机大文件/压缩包长测时重点观察对端确认是否能稳定返回、超时提示是否足够明显，以及重发后系统文件剪贴板粘贴是否稳定。
是否改了协议：否；复用既有 `clipboard_file_result` 和 `transferId`。
是否需要另一端配合：暂不需要；真机长测时再请 Mac 端配合复制文件或模拟长时间不返回结果。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端手动发送文件在对端拒收后也能直接重发。
完成内容：
- 手动选文件发送时，本机分块发完后不再立刻清空文件选择，而是等待对端 `clipboard_file_result accepted=true` 后再清空。
- 如果对端返回 `accepted=false`，顶部状态和全屏/监看浮层会显示“可重新发送”，文件选择继续保留，按钮切换为“重新发送”。
- 点击“重新发送”会复用保留的 `FileList` 从头重发；重发成功并收到对端接受结果后清空文件选择。
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
- 先新增断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`（失败点：对端失败后文件选择已清空、按钮仍是“发送文件”、重发计数为 0）。
- 实现后复跑：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
遗留问题：
- 这仍是从头重新发送，不是断点续传。
- 如果对端长期不返回 `clipboard_file_result`，手动选择会暂时保留以等待结果；后续可补“等待确认超时/手动放弃等待”提示。
下一步建议：
- 真实大文件/压缩包长测时同时看对端失败重试、速度/ETA 和系统剪贴板粘贴是否稳定。
是否改了协议：否；复用既有 `clipboard_file_result accepted=false`。
是否需要另一端配合：暂不需要；真机重试体验长测时再请 Mac 端配合返回失败或复制大文件。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端发送文件后能看清对端实际处理结果。
完成内容：
- 本机分块发送完成后，顶部剪贴板状态会显示“等待对端确认”，避免把网络发送完成误读为对端已写入剪贴板。
- 收到对端 `clipboard_file_result` 后，顶部状态、全屏/监看浮层和事件日志会区分：已写入系统文件剪贴板、已保存到临时目录、暂存在远端托盘或接收失败原因。
- 新增页面 diagnostics-only 回归，覆盖 `saveMode=clipboard`、`temp`、`memory-only` 和失败带已收/总量四类结果。
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
- 先新增断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`（失败点：旧界面只显示“对端已完成文件接收”，悬浮窗回到“已开启”）。
- 实现后复跑：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
遗留问题：
- 仍不是断点续传；连接中断后仍需重新复制或重新发送。
- 真机大文件/压缩包复制还需要在 Windows 桌面版和真实 Mac host 上继续人工长测。
下一步建议：
- 后续真实文件复制时同时观察两端速度/ETA、对端 result 提示和系统剪贴板粘贴体验；若失败原因仍不够清楚，再细化 Mac/Windows host 返回的 `reason` 文案。
是否改了协议：否；复用既有 `clipboard_file_result.saveMode`、`reason`、`receivedBytes` 和 `totalBytes`。
是否需要另一端配合：暂不需要；真机长测时再请 Mac 端配合复制文件或压缩包。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：补强 Windows 控制端远端文件接收完整性，避免坏分块被误拼成成功文件。
完成内容：
- Windows 控制端接收 `clipboard_file_chunk` 时，现在只接受 offer 清单里的 `fileIndex`。
- 分块 `offset` 必须连续等于当前已收字节数；重复 offset、错位 offset 会停止该 transfer，提示让 Mac 重新复制，并向对端返回 `LAN011`。
- 分块不能超过单文件声明大小，也不能超过整批声明总字节数；越界会失败而不是拼接成可下载文件。
- 完成消息现在要求文件数量、总字节数和逐文件已收字节数精确匹配，不再用“>=”放过重复/多余数据。
修改文件：
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/03-architecture-and-protocol.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`（失败点：重复 offset、越界分块、未知 fileIndex 均未被拒绝）。
- 实现后复跑：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- 收尾验证：`node --check apps/windows-client/app.js`、`node --check scripts/windows/test-windows-client-browser.mjs`、`git diff --check`、行首冲突扫描。
遗留问题：
- 仍不是断点续传；连接中断后仍需要对端重新复制/重新发送。
- 真机大压缩包复制到 Windows 后的资源管理器粘贴体验还需要人工长测。
下一步建议：
- 可继续补发送侧对 `clipboard_file_result` 的更细状态，把“网络已发完”和“对端写入系统剪贴板成功/失败”区分得更直观。
是否改了协议：否；只补接收端对既有分块字段的校验规则。
是否需要另一端配合：暂不需要。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：把 Windows 控制端“可重新发送”提示变成真正的一键重发。
完成内容：
- 发送文件失败后，若保留了文件选择且当前仍连接，`发送文件` 按钮会切换成 `重新发送`。
- 点击 `重新发送` 会直接复用当前保留的 `FileList` 调用原 `sendFilesToRemote`，不再要求用户重新打开文件选择器。
- 重发成功后会按原成功路径清空文件选择并恢复普通 `发送文件` 按钮；不改 `clipboard_file_*` 协议，不实现断点续传。
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
- 先新增断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`（失败点：点击按钮后 retry offer/chunk/complete 计数仍为 0）。
- 实现后复跑：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- 收尾验证：`node --check apps/windows-client/app.js`、`node --check scripts/windows/test-windows-client-browser.mjs`、`git diff --check`、行首冲突扫描。
遗留问题：
- 仍不是断点续传；重发会从头发送保留文件。
下一步建议：
- 后续可继续补对端 `clipboard_file_progress/result` 的发送后确认状态，让“已发送到网络”和“对端已写入剪贴板”区分得更清楚。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-19 Mac Codex

日期：2026-06-19 继续推进
开发端：Mac Codex
本轮目标：统一 `MacClientBrowserSelfTest=` 为一行输出 wrapper，避免把原始 browser/临时 host 噪声日志贴到通讯板。
完成内容：
- `scripts/mac/test-mac-client-browser-self-test-wrapper.mjs --boardSummary` 现在会运行本地 mock browser 自测，并只在 stdout 输出最终一行无密摘要。
- Mac heartbeat、resume status、Mac client page status、readiness、Windows discovery、formal status 和 formal smoke 的 `MacClientBrowserSelfTest=` 全部改为 wrapper 命令。
- 对应测试断言现在要求 wrapper 路径，并防止退回原始 `test-mac-client-browser-self-test.mjs --boardSummary` 噪声入口。
修改文件：
- `scripts/mac/test-mac-client-browser-self-test-wrapper.mjs`
- `scripts/mac/check-mac-heartbeat.mjs`
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/start-mac-client.mjs`
- `scripts/mac/check-mac-client-readiness.mjs`
- `scripts/mac/discover-windows-hosts.mjs`
- `scripts/mac/check-mac-client-formal-status.mjs`
- `scripts/mac/run-mac-client-formal-smoke.mjs`
- matching `scripts/mac/test-*.mjs`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先改 heartbeat 断言并确认失败：`node scripts/mac/test-mac-heartbeat.mjs --timeoutMs 12000`（失败点：board summary 仍指向原始 browser self-test）。
- 实现后复跑受影响自测：wrapper、heartbeat、Mac client readiness、start helper、Windows discovery、formal status、formal smoke、resume status。
- 直接验证 wrapper 一行输出：`node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs --boardSummary --timeoutMs 60000`。
遗留问题：
- 真实 Mac 控 Windows 长时间观感、真实 Windows host 音视频延迟和大文件断点续传仍按任务板继续；本轮不认证真实 Windows host、不执行 input/inject。
下一步建议：
- 需要贴通讯板时优先复制 `MacClientBrowserSelfTest=node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs --boardSummary`；它会跑本地 mock 链路并只输出一行。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-19 Mac Codex

日期：2026-06-19 继续推进
开发端：Mac Codex
本轮目标：让最新 `MacHeartbeat=` 摘要直接暴露本地 Mac client browser self-test 入口，方便早上恢复时先跑安全 mock 自测。
完成内容：
- `check-mac-heartbeat --boardSummary` 现在输出 `MacClientBrowserSelfTest=node scripts/mac/test-mac-client-browser-self-test.mjs --boardSummary`。
- `commands.macClientBrowserSelfTestCommand` 进入 JSON 命令集合，保持无密码、无认证、无 Agent Link Board call、无 input/inject。
- 交接文档、下一步清单和任务板同步说明：Windows 端只看最新心跳时，也能让 Mac 端先跑本地 mock browser 自测，再继续正式真连。
修改文件：
- `scripts/mac/check-mac-heartbeat.mjs`
- `scripts/mac/test-mac-heartbeat.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/mac/test-mac-heartbeat.mjs --timeoutMs 12000`（失败点：offline board summary 未包含 `MacClientBrowserSelfTest=`）。
- 实现后复跑：`node scripts/mac/test-mac-heartbeat.mjs --timeoutMs 12000`
- 收尾验证：`node --check scripts/mac/check-mac-heartbeat.mjs`、`node --check scripts/mac/test-mac-heartbeat.mjs`、`node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`、`node scripts/mac/check-mac-heartbeat.mjs --host 127.0.0.1 --port 43770 --clientHost 127.0.0.1 --clientPort 5188 --checkBoard --boardSummary`、`node scripts/mac/test-mac-client-browser-self-test.mjs --boardSummary`、`git diff --check`、行首冲突扫描。
遗留问题：
- 这轮只补 Mac heartbeat 的安全自测入口；真实 Mac 控 Windows 长时间观感、真实 Windows host 音视频延迟和大文件传输仍按下一步清单继续。
下一步建议：
- 白天恢复时先看 Agent Link Board 最新 `MacHeartbeat=`，需要快速确认 Mac client 页面链路时直接复制 `MacClientBrowserSelfTest=`；需要真连 Windows 时再走 `MacClientFormalChecklist=` / `MacClientFormalSmoke=`。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端手动发送文件失败后保留重试线索，而不是只显示“失败”。
完成内容：
- `sendFilesToRemote` 失败时会保留最近发送失败快照，包括已发字节、总量、文件数、错误信息和最近分块样本。
- 手动选择文件发送失败时不再清空文件选择，顶部剪贴板状态会显示“文件发送失败 ... 可重新发送”。
- 全屏/监看浮层和复制/导出诊断会复用最近失败摘要；不改 `clipboard_file_*` 协议，也不实现真正断点续传。
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
- 先新增断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`（失败点：缺少最近发送失败摘要 helper）。
- 实现后复跑：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- 收尾验证：`node --check apps/windows-client/app.js`、`node --check scripts/windows/test-windows-client-browser.mjs`、`git diff --check`、行首冲突扫描。
遗留问题：
- 这只是普通重新发送提示；连接中断后的断点续传仍未实现。
下一步建议：
- 后续真实大文件测试时重点看失败后再次点击发送文件是否符合预期；真正断点续传需要另行设计传输协议和两端状态。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端发送本机文件时也显示速度和预计剩余时间。
完成内容：
- `sendFilesToRemote` 新增发送侧状态对象，记录本次 transfer 的已发字节、总量、文件数和最近分块样本。
- 新增发送侧进度文案：正在发送 N 个文件、已发/总量、百分比、速度和预计剩余时间。
- 顶部剪贴板状态和全屏/监看浮层剪贴板状态共用同一套发送文案；不改 `clipboard_file_*` 协议。
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
- 先新增断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`（失败点：页面缺 `describeOutgoingFileTransferStatus`，浮层发送中只显示“正在发送文件”）。
- 实现后复跑：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- 收尾验证：`node --check apps/windows-client/app.js`、`node --check scripts/windows/test-windows-client-browser.mjs`、`git diff --check`、行首冲突扫描。
遗留问题：
- 断点续传尚未实现；真实大文件长测后再决定是否调整发送/接收样本窗口。
下一步建议：
- 后续可继续做断点续传设计，或先在真实 Mac/Windows 双端用大文件压缩包观察发送和接收两侧状态是否一致。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-19 Windows Codex

日期：2026-06-19 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端远端文件接收速度/预计剩余时间使用最近分块滑动平均，减少大文件显示跳变。
完成内容：
- 接收远端文件分块时记录最近 8 个分块的字节数和间隔时间。
- 速度/ETA 文案优先使用最近分块样本的加权平均；样本不足 1 秒时回退到原来的总平均。
- 托盘、全屏/监看浮层剪贴板状态和复制/导出诊断共用同一套速度文案；不改 `clipboard_file_*` 协议，不实现断点续传。
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
- 先新增断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`（失败点：诊断里的远端文件活动传输未显示 `速度 2.0 KB/s` / `剩余约 2 秒`）。
- 实现后复跑：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- 收尾验证：`node --check apps/windows-client/app.js`、`node --check scripts/windows/test-windows-client-browser.mjs`、`git diff --check`、行首冲突扫描。
遗留问题：
- 发送侧测速已在后续 Windows 轮次补上；断点续传尚未实现。真实大文件长测后再决定是否调整样本窗口或 ETA 显示策略。
下一步建议：
- 真实 Mac/Windows 双端文件传输时，用较大压缩包观察速度/ETA 是否平滑；如果连接中断仍需要对端重新复制，这是后续断点续传任务。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端接收远端文件时显示实时速度和预计剩余时间，并同步到诊断。
完成内容：
- 远端文件接收中的托盘状态现在会显示速度与预计剩余时间。
- 全屏/监看浮层的剪贴板状态和复制/导出诊断会带同一组接收进度、速度、预计剩余时间和无新分块时长。
- 浏览器 diagnostics-only 回归覆盖接收进度文本和诊断导出文本；本轮只改接收侧显示，不改 `clipboard_file_*` 协议，不实现断点续传。
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
- 先新增断言并确认失败：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`（失败点：远端文件接收 50% 文案还没有 `速度 1 B/s` 和 `剩余约 2 秒`）。
- 实现后复跑：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- 收尾验证：`node --check apps/windows-client/app.js`、`node --check scripts/windows/test-windows-client-browser.mjs`、`git diff --check`、行首冲突扫描。
遗留问题：
- 断点续传、发送侧测速和滑动平均尚未实现；真实大文件长测时需要观察速度/ETA 是否跳变明显。
下一步建议：
- 真实 Mac/Windows 双端文件传输时，用大文件和压缩包测试托盘、全屏/监看浮层、复制诊断三处显示是否一致；如果 ETA 抖动明显，再补滑动平均。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：把 Mac 恢复总览里的 `MacClientFormalChecklist=` 对齐成无占位 discovery 命令，避免早上开工第一屏仍复制 bare checklist。
完成内容：
- `check-mac-resume-status` 的 `commands.macClientFormalChecklistCommand` / `MacClientFormalChecklist=` 从 `check-mac-client-formal-status --boardSummary` 改为 `check-mac-client-formal-status --discover --port 43770 --boardSummary`。
- `check-mac-resume-status --help` 的字段说明补充该命令会先按默认 Windows host 端口发现目标，再输出人工真连清单。
- `test-mac-resume-status` 增加 JSON 和 `--boardSummary` 断言，要求该命令包含 `--discover`、`--port 43770`、`--boardSummary`，且不含密码、`--sendCall`、`--json` 或 `<Windows IP>` 占位。
修改文件：
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/mac/test-mac-resume-status.mjs --timeoutMs 12000`（失败点：offline JSON Mac client formal checklist command 不含 `--discover`）
- 语法检查：`node --check scripts/mac/check-mac-resume-status.mjs`、`node --check scripts/mac/test-mac-resume-status.mjs`
- 实现后复跑：`node scripts/mac/test-mac-resume-status.mjs --timeoutMs 12000`
- 统一 Mac help 安全自检：`node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- 真实只读恢复摘要：`node scripts/mac/check-mac-resume-status.mjs --checkBoard --boardSummary`（确认输出 `MacClientFormalChecklist=... --discover --port 43770 --boardSummary`）
- 最终收尾：`git diff --check`；`rg -n "^(<<<<<<<|=======|>>>>>>>)" docs scripts/mac`
遗留问题：
- 本轮只对齐恢复总览建议命令；不启动 Windows 连接、不认证、不弹密码、不发送 call/input/inject。
下一步建议：
- 白天继续时，开工第一屏可跑 `node scripts/mac/check-mac-resume-status.mjs --checkBoard --boardSummary`，直接复制其中 `MacClientFormalChecklist=` 做无密 discovery checklist。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：把 `start-mac-client` 本地页面状态入口里的 `MacClientFormalChecklist=` 对齐成无占位自动 discovery 命令，避免恢复现场复制 `<Windows IP>` 模板。
完成内容：
- `macClientFormalStatusCommand` / `MacClientFormalChecklist=` 从 `check-mac-client-formal-status --host <Windows IP> --port 43770 --boardSummary` 改为 `check-mac-client-formal-status --discover --port 43770 --boardSummary`。
- `start-mac-client --help` 的机器可读字段说明补充该命令会先发现 Windows host，不再使用占位 IP。
- 专项测试先改断言并确认旧实现失败，再更新实现通过。
修改文件：
- `scripts/mac/start-mac-client.mjs`
- `scripts/mac/test-mac-client-start-helper.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/mac/test-mac-client-start-helper.mjs --timeoutMs 12000`（失败点：formal checklist command 不含 `--discover`，仍含 `<Windows IP>`）
- 语法检查：`node --check scripts/mac/start-mac-client.mjs`、`node --check scripts/mac/test-mac-client-start-helper.mjs`
- 实现后复跑：`node scripts/mac/test-mac-client-start-helper.mjs --timeoutMs 12000`
- 统一 Mac help 安全自检：`node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- 真实页面状态摘要：`node scripts/mac/start-mac-client.mjs --status --boardSummary`（确认输出 `MacClientFormalChecklist=... --discover --port 43770 --boardSummary`）
- 最终收尾：`git diff --check`；`rg -n "^(<<<<<<<|=======|>>>>>>>)" docs scripts/mac`
遗留问题：
- 本轮只调整本地 Mac client 页面状态/启动助手的建议命令；不启动 Windows 连接、不认证、不弹密码、不发送 call/input/inject。
下一步建议：
- 白天继续时，若只需要确认 Mac client 页面是否在线，可先跑 `node scripts/mac/start-mac-client.mjs --status --boardSummary`，再直接复制其中 `MacClientFormalChecklist=` 或 `MacClientFormalSmoke=` 做无密 preflight。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：让 `discover-windows-hosts` 也输出标准 `MacClientFormalSmoke=` 安全无密 preflight 标签，衔接 Windows resume/watcher 已消费的同名入口。
完成内容：
- JSON 新增 `macClientFormalSmokeCommand`，默认输出 `node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary`。
- `--boardSummary` 发现 Windows host 时新增 `MacClientFormalSmoke=`，与既有 target-specific `FormalSmoke=` 并存；前者是标准安全重跑入口，后者仍是已发现 host 的定点 preflight。
- 普通输出新增 `Mac client formal smoke:` 行；帮助文本说明该命令是给 watcher/自动化消费的安全标签，不继承密码、认证、call 或 input/inject 路径。
修改文件：
- `scripts/mac/discover-windows-hosts.mjs`
- `scripts/mac/test-discover-windows-hosts.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/mac/test-discover-windows-hosts.mjs --timeoutMs 10000`（失败点：help 不含 `macClientFormalSmokeCommand`）
- 语法检查：`node --check scripts/mac/discover-windows-hosts.mjs`、`node --check scripts/mac/test-discover-windows-hosts.mjs`
- 实现后复跑：`node scripts/mac/test-discover-windows-hosts.mjs --timeoutMs 10000`
- 统一 Mac help 安全自检：`node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- 真实只读 discovery：`node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary`
- 最终收尾：`git diff --check`；`rg -n "^(<<<<<<<|=======|>>>>>>>)" docs scripts/mac`
遗留问题：
- 本轮只补 discovery 输出和文档，不运行真实 browser auth，不弹密码，不发送 call，不发送 input/inject。
下一步建议：
- 白天继续时先看 Agent Link Board；若只拿到 `discover-windows-hosts` 摘要，可直接复制 `MacClientFormalSmoke=` 做安全无密 preflight，再决定是否由用户授权密码跑真实 smoke 或用 call 请求 Windows 配合。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端页面/复制诊断消费 `WindowsFirewallStatus=` 与 `WindowsFirewallPreview=`，把上一轮防火墙只读入口从脚本摘要补到现场 UI 诊断。
完成内容：
- `apps/windows-client/app.js` 的 Mac 提醒风险翻译器新增 `windows-firewall-status` / `windows-firewall-preview`，当同段文本存在 `WindowsLanRisk=`、`no-firewall-allow`、`public-profile`、`lan-probe-blocked`、`tcp-unreachable` 等 LAN/firewall 风险时，会在 Mac 值守快速摘要和复制/导出诊断里显示“Windows 防火墙只读检查命令已提供”“Windows 防火墙放行预览命令已提供”。
- `scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly` 新增覆盖：导出和复制诊断必须包含 `WindowsFirewallStatus=` / `WindowsFirewallPreview=` 提示，且 `WindowsFirewallPreview` 仍不得包含 `--addRule`。
- `apps/windows-client/README.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md` 已同步说明该入口只读/dry-run，不自动运行、不改系统、不认证、不发密码/input/inject。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
遗留问题：
- 本轮只把 Windows 控制端 UI/诊断和复制报告补齐；实际防火墙状态仍以 `check-windows-firewall --json` 的只读结果为准，真正加规则仍需用户/管理员显式执行，不在 Agent Link Board 自动发送 `--addRule`。
是否改了协议：否。
是否需要另一端配合：暂不需要；Mac 端继续按 `WindowsFirewallStatus=` / `WindowsFirewallPreview=` 标签消费即可。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：补 WindowsLanRisk 后的安全下一步入口，让 Windows 发现/防火墙问题能从 status/readiness/resume 一行摘要直接进入只读检查和 dry-run 预览。
完成内容：
- `start-windows-host --status` 的 JSON、普通输出、离线/在线 `--boardSummary` 新增 `windowsFirewallStatusCommand` / `WindowsFirewallStatus=` 与 `windowsFirewallPreviewCommand` / `WindowsFirewallPreview=`。
- `check-windows-host-readiness` 的 JSON、PowerShell JSON 和 `--boardSummary` 新增同一组防火墙只读/dry-run 命令，和 `WindowsLanRisk=` 放在一起便于现场排查。
- `check-windows-resume-status` 的 JSON `commands`、普通输出和 `--boardSummary` 新增 `WindowsFirewallStatus=` / `WindowsFirewallPreview=`；PowerShell wrapper help 已同步说明。
- `WindowsFirewallStatus=` 指向 `check-windows-firewall --host 0.0.0.0 --port <port> --json`；`WindowsFirewallPreview=` 指向 `check-windows-firewall --dryRunRule --ruleProfile Private`，不含 `--addRule`，不会自动改系统防火墙。
修改文件：
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/check-windows-host-readiness.ps1`
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check`：`check-windows-host-readiness.mjs`、`start-windows-host.mjs`、`check-windows-resume-status.mjs` 和本轮改到的 4 个测试脚本均通过。
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 120000 --readinessTimeoutMs 8000`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 120000`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 120000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 120000`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-host-readiness.mjs --script start-windows-host.mjs --script check-windows-resume-status.mjs --script test-windows-host-readiness-board-summary.mjs --script test-windows-host-start-helper.mjs --script test-windows-resume-status.mjs --script test-windows-resume-status-powershell.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary`
- 真实摘要：`check-windows-host-readiness --checkBoard --boardSummary`、`start-windows-host --status --checkBoard --boardSummary`、`check-windows-resume-status --checkBoard --boardSummary` 均确认输出 `WindowsFirewallStatus=` 与 `WindowsFirewallPreview=`。
- 非沙盒只读确认：`check-windows-firewall --json` 能读取当前 listener/profile；`--dryRunRule --ruleProfile Private` 只打印 `New-NetFirewallRule` 建议，不新增规则。
- `git diff --check` 与冲突标记扫描通过。
遗留问题：
- 当前 Windows 网络 Profile 仍是 Public，且未发现 enabled inbound allow rule；本轮只把只读检查和 dry-run 预览入口显式暴露，不自动改系统设置。
- 当前 Windows host runtime build 仍是旧进程 `f27f0a6`，正式验收前如需最新代码，应按安全流程重启 host。
下一步建议：
- Mac 端发现不到 Windows host 或看到 `WindowsLanRisk=no-firewall-allow,public-profile` 时，先复制 `WindowsFirewallStatus=` 做只读确认；需要用户处理系统防火墙前再看 `WindowsFirewallPreview=`，不要在通讯板发送真正 `--addRule` 自动修改命令。
是否改了协议：否。
是否需要另一端配合：暂不需要；Mac 端只需在后续摘要里继续消费这些只读标签，不发送密码/token/系统账号。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：让 Windows 本机提醒和 Windows 控制端诊断消费 Mac 侧 `MacClientDiscoverWindows=` 与 `WindowsLanRisk=`，避免 Mac 发现不到 Windows host 时丢失防火墙/Public 网络线索。
完成内容：
- `watch-codex-link-mac-alerts.ps1` 新增 `MacClientDiscoverWindows` / `discover-windows-hosts` 与 `WindowsLanRisk`、`no-firewall-allow`、`public-profile`、`lan-probe-blocked`、`tcp-unreachable` 等组合提醒规则。
- Windows 控制端 `parseMacUnattendedAttention` 会解析 `WindowsLanRisk=` / `WindowsLanRisks=`，把 Mac client Windows 发现命令、Windows 局域网风险、防火墙入站放行、Public 网络等短标签中文化。
- 复制/导出诊断的 Mac 值守摘要对 LAN 风险做优先排序，并适当放宽导出摘要长度，避免关键 Windows 防火墙/Public 网络风险被长心跳/命令提示截断。
修改文件：
- `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先红后绿：`node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 15000`
- 先红后绿：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script test-mac-alert-watcher.mjs --script test-windows-client-browser.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary`
- `git diff --check`
- `rg`/PowerShell 冲突标记扫描：`scripts/windows`、`apps/windows-client`、`docs` 无 `<<<<<<<` / `=======` / `>>>>>>>`。
遗留问题：
- 本轮只补 Windows 侧提醒/诊断消费；未改变 discovery/formal smoke 协议，未运行真实认证，未发送 call，未发送 input/inject。
下一步建议：
- 真实 Mac 控 Windows 前，如果 Windows 摘要看到 `WindowsLanRisk=no-firewall-allow,public-profile`，先检查 Windows host 监听地址、网络 Profile 和防火墙入站放行，再让 Mac 端重跑 discover/formal smoke。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：让 `run-mac-client-formal-smoke` 自身也输出稳定的 `MacClientFormalSmoke=` 安全重跑标签，避免只拿到 formal smoke 摘要时还要回翻 heartbeat/resume。
完成内容：
- JSON `commands.macClientFormalSmoke` 新增无密预检命令：`node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary`。
- preflight、dry-run、sendCall、成功/失败/发现失败的 `--boardSummary` 都会输出 `MacClientFormalSmoke=`；自定义端口、Mac client 端口和备用 Agent Link Board URL 会以安全参数保留。
- 新标签不继承 `--promptPassword`、`--password`、`--useEnvPassword`、`--sendCall` 或 `--forceCall`，只用于安全启动/复用 Mac client 页面并做无密 discovery/formal preflight。
修改文件：
- `scripts/mac/run-mac-client-formal-smoke.mjs`
- `scripts/mac/test-mac-client-formal-smoke.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/mac/test-mac-client-formal-smoke.mjs --timeoutMs 22000`（失败点：help 不含 `commands.macClientFormalSmoke`）
- 语法检查：`node --check scripts/mac/run-mac-client-formal-smoke.mjs`、`node --check scripts/mac/test-mac-client-formal-smoke.mjs`
- 实现后复跑：`node scripts/mac/test-mac-client-formal-smoke.mjs --timeoutMs 22000`
- 统一 Mac help 安全自检：`node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- 真实无密预检：`node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --allowDirty --boardSummary`（发现 `192.168.31.68:43770`，`ok=yes ready=yes blockers=none warnings=repo`，摘要含 `MacClientFormalSmoke=... --discover --ensureClient --preflightOnly --boardSummary`）
- 最终收尾：`git diff --check`；`rg -n "^(<<<<<<<|=======|>>>>>>>)" docs scripts/mac`
遗留问题：
- 本轮只补无密重跑标签和摘要；未执行真实 browser auth，未弹密码，未发送 call，未发送 input/inject。
下一步建议：
- Windows 端或人工看到 Mac formal smoke 失败/阻塞摘要时，可直接复制 `MacClientFormalSmoke=` 先重跑安全无密 preflight；ready 后再决定是否发 call 或由用户在 Mac 本机输入密码跑真实 smoke。
是否改了协议：否。
是否需要另一端配合：暂不需要；Windows 端当前 resume/watchers 已能消费同名标签。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：让 Mac formal smoke 的 `--discover` 失败路径也能透传 Agent Link Board 上的 `WindowsLanRisk=`，避免发现不到 Windows host 时丢失防火墙/Public 网络线索。
完成内容：
- `run-mac-client-formal-smoke --discover` 调用底层 `discover-windows-hosts` 时，在未 `--skipBoard` 的情况下同步传入 `--server <url> --checkBoard`。
- JSON `discovery.windowsLanRisk` 会保留底层发现脚本输出的脱敏 risk token；`--boardSummary` 在发现失败/阻塞时也会显示 `WindowsLanRisk=<safe tokens>`。
- 失败路径仍在任何密码提示、浏览器认证、Agent Link Board call、input 或 inject 之前退出；不回显被拒绝的危险候选。
修改文件：
- `scripts/mac/run-mac-client-formal-smoke.mjs`
- `scripts/mac/test-mac-client-formal-smoke.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/mac/test-mac-client-formal-smoke.mjs --timeoutMs 22000`（失败点：discover failure 未读取 Agent Link Board）
- 语法检查：`node --check scripts/mac/run-mac-client-formal-smoke.mjs`、`node --check scripts/mac/test-mac-client-formal-smoke.mjs`、`node --check scripts/mac/discover-windows-hosts.mjs`、`node --check scripts/mac/test-discover-windows-hosts.mjs`
- 实现后复跑：`node scripts/mac/test-mac-client-formal-smoke.mjs --timeoutMs 22000`
- `node scripts/mac/test-discover-windows-hosts.mjs --timeoutMs 10000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- 真实无密预检：`node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary`（合入 Windows `52b83f4` 后复跑，发现 `192.168.31.68:43770`，`ready=yes`，`warnings=none`）
- 真实 heartbeat：`node scripts/mac/check-mac-heartbeat.mjs --host 127.0.0.1 --port 43770 --clientHost 127.0.0.1 --clientPort 5188 --checkBoard --boardSummary`（`status=ok`，`call=none`）
- 最终收尾：`git diff --check`；`rg -n "^(<<<<<<<|=======|>>>>>>>)" docs scripts/mac`
遗留问题：
- 本轮只补 `--discover` 失败/阻塞时的 LAN 风险线索；未执行真实 browser auth，未弹密码，未发送 call，未发送 input/inject。
下一步建议：
- Windows 端继续消费 `MacClientDiscoverWindows=` / `MacClientFormalSmoke=` 时，如果 Mac formal smoke 摘要出现 `WindowsLanRisk=no-firewall-allow,public-profile`，优先按 Windows 防火墙/网络 Profile 排查，不要误判为 Mac client 页面或 H.264 等待卡住。
是否改了协议：否。
是否需要另一端配合：暂不需要；Windows 端可继续当前 Windows-only resume 消费展示。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：让 Mac client formal checklist 在无 host 场景也能只读自动发现 Windows host，减少默认 `127.0.0.1` 误判。
完成内容：
- `check-mac-client-formal-status` 新增 `--discover`、`--discoverHost`、`--discoverNoLocalSubnets`、`--discoverTimeoutMs`、`--discoverScanTimeoutMs`；未显式 `--host` 时可先调用 `discover-windows-hosts --json`，发现成功后再跑原 formal checklist。
- JSON 新增 `discovery` 和 `args.discoveredWindowsHost`；`--boardSummary` 在发现成功时带 `Discovery=<host>:<port>`。
- 无 host 的 `MacClientFormalChecklist=` 现在默认输出 `node scripts/mac/check-mac-client-formal-status.mjs --discover --port 43770 --boardSummary`；已知 host 时仍输出目标化 `--host <Windows IP> --port <port>`。
- 该流程只读，不认证、不弹密码、不发送 Agent Link Board call、不发送 input/inject；发现失败只回到原 blocker/提示路径。
修改文件：
- `scripts/mac/check-mac-client-formal-status.mjs`
- `scripts/mac/test-mac-client-formal-status.mjs`
- `scripts/mac/check-mac-client-readiness.mjs`
- `scripts/mac/test-mac-client-readiness.mjs`
- `scripts/mac/check-mac-heartbeat.mjs`
- `scripts/mac/test-mac-heartbeat.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/mac/test-mac-client-formal-status.mjs --timeoutMs 22000`（失败点：help 不含 `--discover`）
- 先新增 heartbeat 断言并确认失败：`node scripts/mac/test-mac-heartbeat.mjs --timeoutMs 12000`（失败点：`MacClientFormalChecklist` 不含 `--discover`）
- 实现后复跑：`node scripts/mac/test-mac-client-formal-status.mjs --timeoutMs 22000`
- `node scripts/mac/test-mac-client-readiness.mjs --timeoutMs 18000`
- `node scripts/mac/test-mac-heartbeat.mjs --timeoutMs 12000`
- 合入 Windows `cc23c76` 后复跑语法：`node --check scripts/mac/check-mac-client-formal-status.mjs`、`node --check scripts/mac/check-mac-client-readiness.mjs`、`node --check scripts/mac/check-mac-heartbeat.mjs`、`node --check scripts/mac/test-mac-client-formal-status.mjs`、`node --check scripts/mac/test-mac-client-readiness.mjs`、`node --check scripts/mac/test-mac-heartbeat.mjs`
- 合入 Windows `cc23c76` 后复跑：`node scripts/mac/test-mac-client-formal-status.mjs --timeoutMs 22000`
- `node scripts/mac/test-mac-client-readiness.mjs --timeoutMs 18000`
- `node scripts/mac/test-mac-heartbeat.mjs --timeoutMs 12000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- 真实只读发现清单：`node scripts/mac/check-mac-client-formal-status.mjs --discover --allowDirty --boardSummary`（发现 `192.168.31.68:43770`，输出目标化 `MacClientFormalChecklist=... --host 192.168.31.68 --port 43770 --boardSummary`；仅因本轮未提交显示 `repo=dirty(11)` warning）
- 真实 heartbeat：`node scripts/mac/check-mac-heartbeat.mjs --host 127.0.0.1 --port 43770 --clientHost 127.0.0.1 --clientPort 5188 --checkBoard --boardSummary`（`status=ok`，通讯板入口含 `MacClientFormalChecklist=... --discover --port 43770 --boardSummary`）
- 最终收尾：`git diff --check`；`rg -n "^(<<<<<<<|=======|>>>>>>>)" docs scripts/mac`
遗留问题：
- 这轮只做只读 discover/checklist 衔接；未执行真实 browser smoke，未发送 call，未认证，未执行 input/inject。
下一步建议：
- Windows 端看到 `MacClientFormalChecklist=` 时可直接复制新版 `--discover --port 43770 --boardSummary`；如已知 Windows IP，可继续用目标化 `--host <Windows IP> --port <port>`。
是否改了协议：否。
是否需要另一端配合：暂不需要；Windows 端可继续当前 Windows-only resume 消费展示。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：让 Windows 恢复总览消费 Mac 端上板的 `MacClientDiscoverWindows=` 只读 Windows host 发现入口。
完成内容：
- `check-windows-resume-status` 默认新增 `commands.macClientDiscoverWindowsCommand`，普通输出和 `--boardSummary` 会给出 `MacClientDiscoverWindows=node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary`。
- `--checkBoard` 会从 Agent Link Board `/api/state` 或 fallback 文本安全提取 `MacClientDiscoverWindows=` / `RerunMacClientDiscoverWindows=`；只接受 `discover-windows-hosts.mjs`、`--checkBoard`、`--boardSummary` 和白名单只读参数，拒绝密码/token/secret、`--promptPassword`、`--sendCall`、`--forceCall` 或缺联络板读取/摘要参数的候选。
- PowerShell 包装帮助和 Node/PowerShell 回归都已覆盖该入口；不认证、不弹密码、不发 call/input/inject。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- 先新增 PowerShell 断言并确认失败：`node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- 实现后复跑：`node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- 实现后复跑：`node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-resume-status.mjs --script test-windows-resume-status.mjs --script test-windows-resume-status-powershell.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary`
- `node scripts/windows/check-windows-resume-status.mjs --checkBoard --boardSummary`（真实摘要已显示 `MacClientDiscoverWindows=... --checkBoard --boardSummary`）
遗留问题：
- 本轮只做 Windows resume 的只读消费/展示；未运行真实 Mac 控 Windows browser smoke，未认证 Windows host，未发送 Agent Link call。
下一步建议：
- Mac 控 Windows 真连前，Windows 侧先跑 `check-windows-resume-status --checkBoard --boardSummary`，先看 `MacClientDiscoverWindows=` 做只读 Windows host 发现和 `WindowsLanRisk=` 对齐，再看 `MacClientFormalChecklist=` / `MacClientFormalSmoke=` 继续无密 formal checklist / preflight。
是否改了协议：否。
是否需要另一端配合：暂不需要；Mac heartbeat/resume/status 已能上板同名入口。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：让 Windows 恢复总览消费 Mac 端上板的 `MacClientFormalChecklist=` 正式清单入口。
完成内容：
- `check-windows-resume-status` 默认新增 `commands.macClientFormalChecklistCommand`，普通输出和 `--boardSummary` 会给出 `MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs --discover --port 43770 --boardSummary`。
- `--checkBoard` 会从 Agent Link Board `/api/state` 或 fallback 文本安全提取 `MacClientFormalChecklist=` / `RerunMacClientFormalChecklist=`；只接受 `check-mac-client-formal-status.mjs`、`--boardSummary` 和白名单只读参数，拒绝密码/token/secret、`--promptPassword`、`--sendCall`、`--forceCall`、占位 host/port 或缺摘要参数。
- PowerShell 包装帮助和 Node/PowerShell 回归都已覆盖该入口；不认证、不弹密码、不发 call/input/inject。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- 先新增 PowerShell 断言并确认失败：`node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- 实现后复跑：`node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- 实现后复跑：`node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- `node scripts/windows/check-windows-resume-status.mjs --checkBoard --boardSummary`（真实摘要已显示 `MacClientFormalChecklist=... --boardSummary`）
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-resume-status.mjs --script test-windows-resume-status.mjs --script test-windows-resume-status-powershell.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary`
遗留问题：
- 本轮只做 Windows resume 的只读消费/展示；未运行真实 Mac browser smoke，未认证 Windows host，未发送 Agent Link call。
下一步建议：
- Mac 控 Windows 真连前，Windows 侧先跑 `check-windows-resume-status --checkBoard --boardSummary`，先看 `MacClientFormalChecklist=` 做无密正式清单，再看 `MacClientFormalSmoke=` 做无密 preflight；需要真实密码 smoke 时仍由用户在 Mac/Windows 本机隐藏输入。
是否改了协议：否。
是否需要另一端配合：暂不需要；Mac heartbeat/resume 已能上板同名入口。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：让 Windows 恢复总览消费 Mac 端上板的 `MacClientFormalSmoke=` 安全预检入口。
完成内容：
- `check-windows-resume-status` 默认新增 `commands.macClientFormalSmokeCommand`，普通输出和 `--boardSummary` 会给出 `MacClientFormalSmoke=node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary`。
- `--checkBoard` 会从 Agent Link Board `/api/state` 或 fallback 文本安全提取 `MacClientFormalSmoke=` / `RerunMacClientFormalSmoke=`；只接受 `run-mac-client-formal-smoke.mjs`、`--discover`、`--ensureClient`、`--preflightOnly`、`--boardSummary`，拒绝密码/token/secret、缺关键参数或不完整候选。
- PowerShell 包装帮助和 Node/PowerShell 回归都已覆盖该入口；不认证、不弹密码、不发 call/input/inject。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- 先新增 PowerShell 断言并确认失败：`node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- 实现后复跑：`node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- 实现后复跑：`node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- `node scripts/windows/check-windows-resume-status.mjs --checkBoard --boardSummary`（真实摘要已显示 `MacClientFormalSmoke=... --discover --ensureClient --preflightOnly --boardSummary`）
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-resume-status.mjs --script test-windows-resume-status.mjs --script test-windows-resume-status-powershell.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary`
遗留问题：
- 本轮只做 Windows resume 的只读消费/展示；未运行真实 Mac browser smoke，未认证 Windows host，未发送 Agent Link call。
下一步建议：
- Mac 控 Windows 真连前，Windows 侧先跑 `check-windows-resume-status --checkBoard --boardSummary`，看到 `MacClientFormalSmoke=` 后让 Mac 端先做无密 discovery/formal preflight，再决定是否需要用户输入密码或发 call。
是否改了协议：否。
是否需要另一端配合：暂不需要；Mac 端已能上板同名入口。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：让 Mac heartbeat 一行摘要也能直接给出 Mac 控 Windows formal checklist/smoke 入口，避免 Windows 端只看心跳时还要翻 resume。
完成内容：
- `check-mac-heartbeat` 的 JSON `commands` 新增 `macClientFormalChecklistCommand` 与 `macClientFormalSmokeCommand`。
- `check-mac-heartbeat --boardSummary` 现在输出 `MacClientFormalChecklist=` 和 `MacClientFormalSmoke=node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary`。
- 这些命令只用于只读 formal checklist / 无密 preflight；不弹密码、不认证 Windows host、不发送 Agent Link Board call、不发送 input/inject。
修改文件：
- `scripts/mac/check-mac-heartbeat.mjs`
- `scripts/mac/test-mac-heartbeat.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/mac/test-mac-heartbeat.mjs --timeoutMs 12000`
- 实现后复跑：`node scripts/mac/test-mac-heartbeat.mjs --timeoutMs 12000`
- `node --check scripts/mac/check-mac-heartbeat.mjs`
- `node --check scripts/mac/test-mac-heartbeat.mjs`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/mac/check-mac-heartbeat.mjs --host 127.0.0.1 --port 43770 --clientHost 127.0.0.1 --clientPort 5188 --checkBoard --boardSummary`（真实摘要已显示 `MacClientFormalChecklist=` 与 `MacClientFormalSmoke=... --ensureClient --preflightOnly --boardSummary`）
- 合并 Windows 端 `741374b` 后已重新跑上述验证；真实 heartbeat 首次因 Mac Codex 上板时间戳过旧按预期 blocked，刷新 `Mac Codex` 状态后复跑为 `status=ok`。
遗留问题：
- 这轮只增强 heartbeat 上板提示；未执行真实 browser smoke，未发送 call，未执行 input/inject。
下一步建议：
- Windows 端看到 `MacHeartbeat=` 时可直接复制其中的 `MacClientFormalChecklist=` / `MacClientFormalSmoke=` 继续 Mac 控 Windows 预检；如需真实密码 smoke，仍等用户在 Mac 本机隐藏输入。
是否改了协议：否。
是否需要另一端配合：暂不需要；Windows 端可继续 Windows-only resume/sendAgentCallAck 工作。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：让 Mac 恢复总览里的 Mac client formal smoke 入口默认先确保本地页面在线，减少真连前手工漏启动页面。
完成内容：
- `check-mac-resume-status` 的 `MacClientFormalSmoke=` / JSON `commands.macClientFormalSmokeCommand` 现在输出 `node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary`。
- 该入口只做本地 Mac client 页面安全启动/复用、Windows discovery 和无密 formal preflight；不弹密码、不认证 Windows host、不发 Agent Link Board call、不发送 input/inject。
- `test-mac-resume-status` 已把 `--ensureClient` 纳入命令断言，同时继续拒绝 `--promptPassword`、`--password`、`--sendCall` 和 `--forceCall`。
修改文件：
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先改断言并确认失败：`node scripts/mac/test-mac-resume-status.mjs --timeoutMs 22000`
- 实现后复跑：`node scripts/mac/test-mac-resume-status.mjs --timeoutMs 22000`
- `node --check scripts/mac/check-mac-resume-status.mjs`
- `node --check scripts/mac/test-mac-resume-status.mjs`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/mac/check-mac-resume-status.mjs --checkBoard --boardSummary`（真实摘要已显示 `MacClientFormalSmoke=... --discover --ensureClient --preflightOnly --boardSummary`）
遗留问题：
- 这轮只增强恢复总览给出的安全预检入口；未执行真实密码 browser smoke，未发送 call，未执行 input/inject。
下一步建议：
- Mac 控制 Windows 真连前优先从 `check-mac-resume-status --checkBoard --boardSummary` 复制 `MacClientFormalSmoke=`，再根据 preflight 结果决定是否需要发 call 或由用户输入密码跑真实 smoke。
是否改了协议：否。
是否需要另一端配合：暂不需要；Windows 端可继续当前 Windows-only resume/sendAgentCallAck 工作。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：把安全认证 `AgentCallAck=` 从“复制命令”补成显式安全发送入口，减少现场手动复制步骤。
完成内容：
- `check-windows-resume-status` 新增 `--sendAgentCallAck`，只在 Agent Link Board 当前 call 是 active secure-auth 且 `WindowsSecureAuthPath` 已就绪时发送无密确认消息。
- PowerShell 包装入口新增 `-SendAgentCallAck`，转发到同一套 Node 安全门控。
- 发送结果写入 JSON `sentAgentCallAck`，失败时加入 `failedChecks`，例如当前不是 secure-auth active call ready 时会拒绝发送且不 POST 通讯板。
- `AgentCallAck=` 摘要命令和真实发送共用同一段文本：只说明安全路径已提供，请 Mac/人工确认后再清理 currentCall；不包含密码，也不自动清 call。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- 先新增 PowerShell 断言并确认失败：`node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- 实现后复跑：`node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- 实现后复跑：`node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
遗留问题：
- 旧 secure-auth currentCall 是否清理仍需 Mac/人工确认；本轮仍不自动 `clear-call`。
下一步建议：
- 若现场确认安全路径已收到，可由 Mac/人工决定清理 active call；不要在通讯板发送密码/token/系统账号。
是否改了协议：否。
是否需要另一端配合：需要 Mac/人工确认安全路径后决定是否清理当前 call；不需要 Mac 改协议。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：让 Windows resume 对安全认证 active call 给出可复制的无密确认命令，帮助收束联络板上已响应的 call。
完成内容：
- `check-windows-resume-status` 在 secure-auth currentCall 且已有安全 `WindowsSecureAuthPath` 时，现在会生成 `board.currentCall.agentCallAckCommand`。
- `--boardSummary` 同步输出 `AgentCallAck=node scripts/codex-link-client.mjs ... send --from "Windows Codex" --text "...WindowsSecureAuthPath..."`，用于回复 Mac 端“Windows 已提供安全路径，请本机确认后再清理 currentCall”。
- `AgentCallAck` 只发送说明，不自动 `clear-call`，也不会认证 WebSocket、不会发送密码、不会发送 input/inject。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- 实现后复跑：`node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- `node scripts/windows/check-windows-resume-status.mjs --checkBoard --boardSummary`（真实通讯板摘要已显示 `AgentCallAck=`）
遗留问题：
- 旧 active call 是否清理仍需 Mac/人工确认；本轮没有自动调用 `clear-call`，避免误清其他端仍在看的呼叫。
下一步建议：
- 如果通讯板仍显示 “Coordinate secure auth...” active call，Windows 侧可复制 `AgentCallAck=` 发一条确认消息；Mac 端确认路径后再由负责方显式清理 call。
是否改了协议：否。
是否需要另一端配合：需要 Mac/人工确认安全路径并决定何时清理 active call；不要在通讯板发送密码/token/系统账号。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：补强正式 E2E 第二步现场提示，避免 Windows client browser H.264 canvas/FPS 等待被误判为卡住。
完成内容：
- `check-mac-formal-e2e` 的 runPlan 现在给 `windows-client-browser-h264` 步骤输出 `troubleshootingHints[]`，机器可读地列出第二步排障顺序。
- 普通输出现在在 Plan 2 后打印 `Plan 2 hint:`，提示等待的是 Windows client 页面、WebSocket、H.264 canvas 与 FPS 诊断。
- 提示直接覆盖四类现场常见误判：进度心跳是否还在刷、默认端口残留时用 `--clientPort 5200 --debugPort 9340`、`WindowsLanRisk=` 指向防火墙/Public 网络/LAN 风险、`remoteMaxFps` 低于请求 Hz 时先提升 Mac host/LaunchAgent 上限。
修改文件：
- `scripts/windows/check-mac-formal-e2e.mjs`
- `scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/windows/test-mac-formal-e2e-preflight.mjs --timeoutMs 45000`
- `node --check scripts/windows/check-mac-formal-e2e.mjs`
- `node --check scripts/windows/test-mac-formal-e2e-preflight.mjs`
- 实现后复跑：`node scripts/windows/test-mac-formal-e2e-preflight.mjs --timeoutMs 45000`
- `node scripts/windows/check-mac-formal-e2e.mjs --host 127.0.0.1 --port 9 --preflightOnly --timeoutMs 1200`（预期离线失败，但必须打印 `Plan 2 hint:`）
- `node scripts/windows/test-windows-script-help.mjs --script check-mac-formal-e2e.mjs --script test-mac-formal-e2e-preflight.mjs --timeoutMs 10000`
- `git diff --check`
遗留问题：
- 这轮只增强诊断提示和 runPlan 字段；未执行真实 WebSocket 认证、未发送密码、未发 input/inject，也未改变媒体/端口流程。
下一步建议：
- 现场复跑正式 E2E 第二步时，先看 `Plan 2 hint:`、`WinClientPorts=`、`WindowsLanRisk=` 和 `remoteMaxFps`，再决定是否要换端口、处理 Windows 防火墙/Public 网络或让 Mac 端提升 60Hz 上限。
是否改了协议：否。
是否需要另一端配合：暂不需要；Mac 端可拉取后读取 `runPlan.steps[].troubleshootingHints[]` 或直接按终端提示排障。不要在通讯板发送密码/token/系统账号。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：让 Windows resume 第一屏也消费联络板上的 `WindowsLanRisk=`，避免 LAN/firewall 风险只藏在 readiness 摘要里。
完成内容：
- `check-windows-resume-status --checkBoard` 现在会从 Agent Link Board `/api/state` 或 fallback `watch --once` 输出里安全提取 `WindowsLanRisk=`，写入 JSON `board.windowsLanRisk`、普通输出和 `--boardSummary`。
- 提取器只接受固定短标签：`none`、`not-checked`、`no-lan-ip`、`no-listener`、`bind-address`、`tcp-unreachable`、`lan-probe-blocked`、`firewall-query-failed`、`public-profile`、`no-firewall-allow`；未知标签、命令样式内容或疑似敏感参数候选会被拒绝且不回显。
- PowerShell wrapper 回归已覆盖同一场景；Windows 第一屏看到 `WindowsLanRisk=no-firewall-allow,public-profile` 时可优先排查防火墙放行和 Public 网络，避免误判为 Mac client 第二步或 H.264 卡住。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- 实现后复跑：`node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
遗留问题：
- 当前只是只读显示/消费风险标签；没有修改 Windows 防火墙、没有改网络 Profile、没有认证 WebSocket、没有发送密码/input/inject。
- 用户现场提到 formal E2E 第二部看起来卡住；本轮确认这类长等待阶段容易误判，后续真实跑 `test-mac-client-browser` 时可加/关注进度输出，并先看 `WindowsLanRisk=`、`WinClientPorts=`、`remoteMaxFps` 和 H.264 surface 等状态定位。
下一步建议：
- 推送后让 Mac 端拉取；Mac 端若也消费了 `WindowsLanRisk=`，双方可在下一轮先跑 resume/readiness 一行摘要，确认 Windows 防火墙/Public 网络风险，再决定是否做真实密码 browser smoke。
是否改了协议：否。
是否需要另一端配合：暂不需要；Mac 端可继续消费/展示 `WindowsLanRisk=`。不要在通讯板发送密码/token/系统账号。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：把 Mac 侧所有恢复/状态摘要里的 Windows host 发现入口统一升级为 `discover-windows-hosts --checkBoard --boardSummary`，避免刚新增的 `WindowsLanRisk=` 消费能力只在少数入口可见。
完成内容：
- `check-mac-heartbeat`、`check-mac-resume-status`、`start-mac-client --status` 和 `check-mac-client-formal-status` 现在都输出 `MacClientDiscoverWindows=node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary`。
- `check-mac-client-formal-status --boardSummary` 新增稳定标签 `MacClientDiscoverWindows=`，Windows host 未发现/未检查时，一行 formal 摘要也能直接给出读板 discovery 入口。
- `run-mac-client-formal-smoke` 缺 host 提示和 `discover-windows-hosts --help` 示例同步改为带 `--checkBoard`。
- 当前状态/下一步/任务板更新为新版命令；历史交接记录保留当时事实不改。
修改文件：
- `scripts/mac/check-mac-heartbeat.mjs`
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/start-mac-client.mjs`
- `scripts/mac/check-mac-client-formal-status.mjs`
- `scripts/mac/run-mac-client-formal-smoke.mjs`
- `scripts/mac/discover-windows-hosts.mjs`
- `scripts/mac/test-mac-heartbeat.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `scripts/mac/test-mac-client-start-helper.mjs`
- `scripts/mac/test-mac-client-formal-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增 heartbeat/resume/start/formal status 自测断言并确认失败：旧 discovery 命令缺 `--checkBoard`。
- `node scripts/mac/test-mac-heartbeat.mjs --timeoutMs 12000`
- `node scripts/mac/test-mac-resume-status.mjs --timeoutMs 22000`
- `node scripts/mac/test-mac-client-start-helper.mjs --timeoutMs 12000`
- `node scripts/mac/test-mac-client-formal-status.mjs --timeoutMs 30000`
遗留问题：
- 本轮只改 Mac 端输出建议命令；没有认证 WebSocket，没有请求/发送密码，没有发送 input/inject，也没有自动清理旧 secure-auth currentCall。
下一步建议：
- 白天恢复或 Windows 发现不到时，优先复制任一 Mac 摘要里的 `MacClientDiscoverWindows=`；它会默认读取 Agent Link Board 上的 `WindowsLanRisk=`，再决定是否需要 Windows/人工处理防火墙/Public 网络。
是否改了协议：否。
是否需要另一端配合：暂不需要 Windows 改代码；如果真实发现仍失败，需要 Windows/人工按 `WindowsLanRisk=` 处理防火墙/网络。不要在通讯板发送密码/token/系统账号。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：让 Mac discovery/readiness 消费 Windows 已经上板的 `WindowsLanRisk=`，把“发现不到 Windows host”转成可直接排查的 LAN/firewall 风险提示。
完成内容：
- 新增 `scripts/mac/board-windows-lan-risk.mjs`，统一只读读取 Agent Link Board `/api/state` 并安全提取 `WindowsLanRisk=` / `WindowsLanRisks=`；只接受逗号分隔的短 risk token，拒绝 `--password`、`LAN_DUAL_PASSWORD`、token/secret/passwd/pwd 等危险候选，且拒绝候选不回显。
- `discover-windows-hosts` 新增 `--checkBoard` / `--server`，JSON 输出 `windowsLanRisk`，`--boardSummary` 在未发现 Windows host 或发现成功时都能附带脱敏 `WindowsLanRisk=no-firewall-allow,public-profile`。
- `check-mac-client-readiness --checkBoard` 现在把风险写入 `board.windowsLanRisk`、recommendation、windows-host next step 和一行摘要；Mac client discovery 命令也默认带 `--checkBoard --boardSummary`。
- `check-mac-client-readiness` 在 Agent Link Board 可读时不再把 `watch --once` 原始事件文本写进 `board.error`，避免危险示例或敏感文本通过 JSON 回显。
修改文件：
- `scripts/mac/board-windows-lan-risk.mjs`
- `scripts/mac/discover-windows-hosts.mjs`
- `scripts/mac/check-mac-client-readiness.mjs`
- `scripts/mac/test-discover-windows-hosts.mjs`
- `scripts/mac/test-mac-client-readiness.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增 discovery/readiness 自测断言并确认失败：缺 `--checkBoard` / `board.windowsLanRisk` 帮助字段。
- `node --check scripts/mac/board-windows-lan-risk.mjs`
- `node --check scripts/mac/discover-windows-hosts.mjs`
- `node --check scripts/mac/check-mac-client-readiness.mjs`
- `node --check scripts/mac/test-discover-windows-hosts.mjs`
- `node --check scripts/mac/test-mac-client-readiness.mjs`
- `node scripts/mac/test-discover-windows-hosts.mjs --timeoutMs 12000`
- `node scripts/mac/test-mac-client-readiness.mjs --timeoutMs 18000`
遗留问题：
- 本轮只读消费 Windows 风险摘要，不修改 Windows 防火墙/网络配置，不认证、不请求或发送密码、不发送 input/inject。
下一步建议：
- Mac 端发现不到 Windows host 时优先跑 `node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary` 或 `node scripts/mac/check-mac-client-readiness.mjs --checkBoard --boardSummary`；如果看到 `WindowsLanRisk=no-firewall-allow,public-profile`，先让 Windows/人工确认防火墙入站放行和 Public 网络，再复查 discovery。
是否改了协议：否。
是否需要另一端配合：暂不需要 Windows 改代码；若真实现场仍发现不到 Windows host，需要 Windows/人工按风险标签排查防火墙/网络。不要在通讯板发送密码/token/系统账号。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：让 Mac formal status/smoke 消费 Windows 已经上板的安全认证路径，闭环 `mac-confirm-secure-auth-path` 下一步。
完成内容：
- `check-mac-client-formal-status` 现在会读取 Agent Link Board `/api/state`，从 `WindowsSecureAuthPath=` / `SecureAuthPath=` 中只提取安全的 Windows 本机隐藏密码重启命令：`node scripts/windows/start-windows-host.mjs --host 0.0.0.0 --port <port> --promptPassword --requirePassword`。
- 提取规则会拒绝带 `--password`、token/secret/passwd/pwd、`LAN_DUAL_PASSWORD=`、非 `0.0.0.0` host、占位端口、缺 `--promptPassword` / `--requirePassword` 或错误脚本/未知参数的候选；拒绝候选不会出现在 formal status 输出里。
- `run-mac-client-formal-smoke` 会继承 nested formal preflight 已校验的 `commands.windowsSecureAuthPath`，并在 JSON commands、`SecureAuthPath=` 和 `--boardSummary` 中显示，方便 Mac/人工确认 Windows 已给出安全路径。
- formal status 汇总层在 Agent Link Board 可读时不再把 `watch --once` 原始事件文本塞进 `readiness.board.error`，避免危险示例或敏感文本被 JSON 回显。
修改文件：
- `scripts/mac/check-mac-client-formal-status.mjs`
- `scripts/mac/run-mac-client-formal-smoke.mjs`
- `scripts/mac/test-mac-client-formal-status.mjs`
- `scripts/mac/test-mac-client-formal-smoke.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增 formal status 自测断言并确认失败：`node scripts/mac/test-mac-client-formal-status.mjs --timeoutMs 30000`
- 先新增 formal smoke 自测断言并确认失败：`node scripts/mac/test-mac-client-formal-smoke.mjs --timeoutMs 30000`
- `node --check scripts/mac/check-mac-client-formal-status.mjs`
- `node --check scripts/mac/run-mac-client-formal-smoke.mjs`
- `node --check scripts/mac/test-mac-client-formal-status.mjs`
- `node --check scripts/mac/test-mac-client-formal-smoke.mjs`
- `node scripts/mac/test-mac-client-formal-status.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-client-formal-smoke.mjs --timeoutMs 30000`
遗留问题：
- 本轮只做只读路径确认和摘要闭环；没有输入真实 Windows 密码，没有认证 WebSocket，没有运行真实 browser smoke，没有发送 input/inject，也没有自动清理 currentCall。
下一步建议：
- Mac/人工可跑 `node scripts/mac/check-mac-client-formal-status.mjs --host 192.168.31.68 --port 43770 --boardSummary` 确认能看到 `WindowsSecureAuthPath=` 后，再在用户在场时按同一临时密码流程复跑真实 browser smoke；确认完成后再协调清理旧安全认证 currentCall。
是否改了协议：否。
是否需要另一端配合：需要 Windows/人工在现场按 `WindowsSecureAuthPath=` 本机隐藏输入临时密码；不要在通讯板发送密码/token/系统账号。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：让 Windows host readiness 的一行上板摘要直接暴露 LAN/firewall 风险，不再只显示 `warnings=<数量>`。
完成内容：
- `check-windows-host-readiness --json` 新增顶层 `windowsLanRisks[]`，从 `Windows host LAN/firewall` warning 归类 `no-firewall-allow`、`public-profile`、`lan-probe-blocked`、`tcp-unreachable`、`bind-address`、`no-listener`、`no-lan-ip`、`firewall-query-failed`。
- `--boardSummary` 新增 `WindowsLanRisk=<短标签或 none>`；当前 Windows 现场摘要可直接显示 `WindowsLanRisk=no-firewall-allow,public-profile`，方便 Mac 端/人工判断发现不到 Windows host 时先看防火墙放行和 Public 网络。
- 该改动只读，不改防火墙、不认证、不请求或发送密码、不发送 input/inject。
修改文件：
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增断言并确认失败：`node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 120000 --readinessTimeoutMs 8000`
- 实现后复跑：`node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 120000 --readinessTimeoutMs 8000`
遗留问题：
- 当前机器仍提示未发现 TCP 43770 入站放行规则且网络为 Public；本轮只是把风险稳定上报，不自动修改系统防火墙/网络配置。
下一步建议：
- Mac 端后续如果发现不到 Windows host，优先读取 `WindowsLanRisk=`；若是 `no-firewall-allow` 或 `public-profile`，由 Windows 用户确认后再手动调整防火墙/网络配置，或用现有 dry-run/管理员流程处理。
是否改了协议：否。
是否需要另一端配合：暂不需要；Mac 端可选择消费 `WindowsLanRisk=`，不要在通讯板发送密码/token/系统账号。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：让 Windows resume 在安全认证 currentCall 已有可用 `WindowsSecureAuthPath=` 时，明确提示下一步由 Mac/人工确认路径，而不是继续表现成 Windows 未响应。
完成内容：
- `check-windows-resume-status --checkBoard --json` 现在会识别 active Mac -> Windows 安全认证 call：当 call 文本指向认证/密码/随机运行期密码，且报告已有安全 `WindowsSecureAuthPath` 时，JSON `board.currentCall.secureAuthPathReady=true`、`next=mac-confirm-secure-auth-path`。
- `--boardSummary` 同步输出 `AgentCallNext=mac-confirm-secure-auth-path`；普通输出里也会显示 `callNext=mac-confirm-secure-auth-path`。
- 该提示只说明 Windows 已给出本地隐藏输入同一临时密码的安全路径；脚本不会自动清理 currentCall，不认证、不请求或发送密码、不发送 input/inject。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
遗留问题：
- 当前 Agent Link Board 的安全认证 call 仍由 Mac 发起；Windows 端不擅自清理。Mac/人工确认 `WindowsSecureAuthPath` 后，可按双方约定清理 currentCall 或发新 call。
下一步建议：
- Mac 端重新拉取后可跑 Windows resume boardSummary 或自己的 formal smoke/status 摘要，确认看到 `AgentCallNext=mac-confirm-secure-auth-path` 后继续现场安全认证流程。
是否改了协议：否。
是否需要另一端配合：需要 Mac/人工确认路径；不要在通讯板发送密码/token/系统账号。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：把 formal E2E readiness 也补上当前 30fps host -> 60Hz LaunchAgent 的安全人工切换命令链。
完成内容：
- `check-mac-formal-e2e-status` 的 help、JSON commands、`callText` 和 `--boardSummary` 新增 `MacHostStop=`、`MacLaunchAgentLoad=`、`MacLaunchAgentPrint=`，和 resume/unattended 摘要使用同一条“停当前 host -> 手动 launchctl bootstrap -> launchctl print 验证 -> MacUnattendedFormal 强校验”链。
- formal E2E checklist 现在看到 `fps-limit`、当前 host 仍 30fps 或 LaunchAgent 未 loaded 时，不必先跳回 resume/unattended 查命令；正式呼叫 Windows 前的一行 readiness 摘要已经能直接给出下一步。
- 新增输出只是可复制指引；脚本仍只读，不自动停止 host、不运行 `launchctl`、不启动服务、不弹密码、不认证、不发送 Agent Link Board call/input/inject。
修改文件：
- `scripts/mac/check-mac-formal-e2e-status.mjs`
- `scripts/mac/test-mac-formal-e2e-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 先新增自测断言并确认失败：`node scripts/mac/test-mac-formal-e2e-status.mjs --timeoutMs 45000`
- `node --check scripts/mac/check-mac-formal-e2e-status.mjs`
- `node --check scripts/mac/test-mac-formal-e2e-status.mjs`
- 实现后复跑：`node scripts/mac/test-mac-formal-e2e-status.mjs --timeoutMs 45000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/mac/check-mac-formal-e2e-status.mjs --host 127.0.0.1 --port 43770 --allowDirty --boardSummary`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/mac docs || true`
遗留问题：
- 当前真实 Mac host 仍未自动切换到 LaunchAgent；本轮没有停 host、没有加载 LaunchAgent、没有弹密码框。要真正消除 30fps 上限，仍需用户确认后人工执行摘要里的 `MacHostStop=` / `MacLaunchAgentLoad=` / `MacLaunchAgentPrint=` / `MacUnattendedFormal=`。
下一步建议：
- 需要正式长验收前，Mac 端先跑 `node scripts/mac/check-mac-formal-e2e-status.mjs --host 127.0.0.1 --port 43770 --boardSummary`；如果摘要仍见 `warnings=fps-limit`，先按人工切换链处理，再让 Windows 复跑 formal preflight。
是否改了协议：否。
是否需要另一端配合：暂不需要 Windows 端改代码；Windows 端后续只需读取新的 formal E2E 摘要字段并在用户确认后复跑 formal preflight。不要在通讯板发送密码/token/系统账号。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：把当前 Mac host 仍为 `maxScreenFps=30`、LaunchAgent plist 已是 60 但未加载的现场缺口，收口成恢复第一屏可直接执行的安全命令链。
完成内容：
- `check-mac-unattended-status` 的 help、JSON、普通输出和 `--boardSummary` 新增 `MacHostStop=`、`MacLaunchAgentLoad=`、`MacLaunchAgentPrint=`，明确 60Hz/LaunchAgent 切换顺序：先只停本机当前 `/discovery` 对应 Mac host，再人工 `launchctl bootstrap` 加载 LaunchAgent，最后用 `MacUnattendedFormal=` 复查 loaded + max FPS。
- `check-mac-resume-status` 同步在 JSON commands、普通输出和 `--boardSummary` 输出同一组三段命令，让开工第一屏不用再跳到 planner 里翻 `ManualLoad=`。
- 新增命令都只是可复制指引；脚本本身仍不停止 host、不运行 `launchctl`、不启动服务、不认证、不请求或发送密码、不发送 input/inject。
修改文件：
- `scripts/mac/check-mac-unattended-status.mjs`
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/test-mac-unattended-status.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node scripts/mac/test-mac-unattended-status.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-resume-status.mjs --timeoutMs 45000`
遗留问题：
- 当前真实 Mac host 仍在运行 `maxScreenFps=30`；本轮没有自动停 host、没有加载 LaunchAgent，也没有弹密码框。现场切到 60Hz 仍需用户/人工按摘要执行 `MacHostStop=`、`MacLaunchAgentLoad=`、`MacLaunchAgentPrint=` / `MacUnattendedFormal=` 后再复跑正式 E2E。
下一步建议：
- Mac 端先发 `node scripts/mac/check-mac-resume-status.mjs --checkBoard --boardSummary` 到联络板；若仍见 `warnings=fps-limit` 或 `launch-agent-not-loaded`，由用户确认后执行摘要里的停止/加载/复查链，再让 Windows 侧复跑 formal preflight。
是否改了协议：否。
是否需要另一端配合：需要 Windows 端后续读取新的 `MacHostStop=` / `MacLaunchAgentLoad=` / `MacLaunchAgentPrint=` 摘要并在用户确认后复跑 60Hz formal preflight；不要在通讯板发送密码/token/系统账号。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：把 Windows 随机运行期密码导致的真实 browser smoke 阻塞沉淀为 Mac formal 工具的稳定安全认证路径提示。
完成内容：
- `check-mac-client-formal-status` 的 JSON runPlan、普通输出和 `--boardSummary` 新增 `SecureAuthPath=`、`WindowsSecureAuthStart=`、`WindowsSecureAuthStartNodeFallback=`，明确随机密码不可取回时的安全流程：Windows 本机停止旧 host，前台隐藏输入临时密码重启 host，用户在 Mac `--promptPassword` 弹窗里输入同一个临时密码。
- `run-mac-client-formal-smoke` 的 JSON commands 和 preflight/dryRun/失败/成功 `--boardSummary` 同步输出同一组安全路径字段；真实 smoke 因缺少本地密码失败时也会直接给出流程，避免误判为连接坏或脚本卡住。
- 所有新增命令只生成提示，不启动 Windows host、不认证、不传密码、不发送 input_event、不执行 inject；输出拒绝 `--password`、`LAN_DUAL_PASSWORD=`、token 形态。
修改文件：
- `scripts/mac/check-mac-client-formal-status.mjs`
- `scripts/mac/run-mac-client-formal-smoke.mjs`
- `scripts/mac/test-mac-client-formal-status.mjs`
- `scripts/mac/test-mac-client-formal-smoke.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node scripts/mac/test-mac-client-formal-status.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-client-formal-smoke.mjs --timeoutMs 30000`
遗留问题：
- 当前真实 Windows host `192.168.31.68:43770` 仍是随机运行期密码启动；真实 browser smoke 需要用户在 Windows 和 Mac 两台机器本机输入同一个临时密码后再跑。
下一步建议：
- 等 Windows 侧完成同名 SecureAuthPath/status 摘要后，由用户现场输入临时密码，Mac 再运行 `run-mac-client-formal-smoke --host 192.168.31.68 --port 43770 --ensureClient --promptPassword --boardSummary`。
是否改了协议：否。
是否需要另一端配合：需要 Windows 端按安全流程重启 host 或给出同名摘要；不要在通讯板发送密码/token/系统账号。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：把 `WindowsSecureAuthPath=` / `SecureAuthPath=` 消费进 Windows 恢复总览和控制端诊断，承接 Mac true browser smoke 的安全认证阻塞。
完成内容：
- `check-windows-resume-status` 默认输出 JSON `commands.windowsSecureAuthPath`、普通输出和 `--boardSummary` 的 `WindowsSecureAuthPath=node scripts/windows/start-windows-host.mjs --host 0.0.0.0 --port 43770 --promptPassword --requirePassword`。
- `--checkBoard` 会从 Agent Link Board 最近状态/消息/事件安全提取 `WindowsSecureAuthPath=` 或 `SecureAuthPath=`，并拒绝带 `--password`、token/secret、非 `0.0.0.0` 绑定、缺 `--promptPassword` / `--requirePassword` 或 `<当前端口>` 占位的候选。
- PowerShell 包装器帮助、JSON 和 `-BoardSummary` 已同步。
- Windows 控制端 Mac 提醒区、快速摘要和复制/导出诊断会在认证/密码/失败/阻塞上下文里显示“Windows 安全认证路径已提供”；干净命令清单不误弹，不自动运行命令。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
遗留问题：
- 这轮不实际重启 Windows host，也不认证 WebSocket；真正 browser smoke 仍需要用户现场在 Windows 和 Mac 两端隐藏输入同一个临时密码。
下一步建议：
- Mac 端看到 `WindowsSecureAuthPath=` 后，按现场流程重启 Windows host 并复跑 true browser smoke；不要在通讯板发送密码/token，也不要执行 input/inject。
是否改了协议：否。
是否需要另一端配合：需要 Mac 端后续消费该摘要并复跑认证 smoke；不需要共享密码。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：响应 Mac secure-auth call，把随机运行期密码阻塞时的安全认证路径写入 Windows host/status/readiness 摘要。
完成内容：
- `start-windows-host --status` 普通输出、JSON 和 `--boardSummary` 新增 `windowsSecureAuthPath` / `WindowsSecureAuthPath=`。
- `check-windows-host-readiness` 普通 `--boardSummary`、JSON、PowerShell JSON 和 PowerShell `-BoardSummary` 会复用或补齐同一条 `WindowsSecureAuthPath=`。
- 安全路径固定为 Windows 本机前台重启 `node scripts/windows/start-windows-host.mjs --host 0.0.0.0 --port <port> --promptPassword --requirePassword`，由用户在 Windows 与 Mac 两端隐藏密码提示中输入同一个临时密码；不通过 Agent Link Board、命令参数或日志传密码。
- PowerShell help 已记录 `WindowsSecureAuthPath=`，便于现场查参数时直接看到无密流程。
修改文件：
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/check-windows-host-readiness.ps1`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 45000 --readinessTimeoutMs 5000`
遗留问题：
- 当前后台 Windows host 仍是之前随机运行期密码启动；正式 browser smoke 需要用户现场按 `WindowsSecureAuthPath=` 重启并在两端本地输入同一个临时密码。
下一步建议：
- Mac 端看到 `WindowsSecureAuthPath=` 后，不要在通讯板索要密码；等用户现场重启 Windows host 并输入同一临时密码后，再跑 true browser smoke。仍不要执行 input/inject，除非用户另行明确确认。
是否改了协议：否。
是否需要另一端配合：需要 Mac 端按新摘要流程复跑认证 smoke；不需要共享任何密码。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：复查 Windows formal Mac E2E 第二步卡住体验，并给密码等待加明确提示。
完成内容：
- 无密复查真实 Mac host `192.168.31.122:43770`：`check-mac-formal-e2e --preflightOnly --checkClientDiagnostics --boardSummary` 返回 ready，`clientDiagnostics=passed`，runtime build `d398d64`。
- 结论：第二步诊断页本身可跑通；当前“没有 60Hz”的主要现场证据是 Mac host 自报 `maxScreenFps=30`，需要 Mac 侧按 `MacMaxFpsPlan` / LaunchAgent max FPS 方案处理后再长测。
- `check-mac-formal-e2e --promptPassword` 和 `test-windows-client-browser --promptPassword` 现在会在隐藏密码提示前说明“等待隐藏密码输入：输入时不会显示字符；这是正常等待，不是卡住。”。
- 专项回归新增非交互终端断言，确保两个入口都先输出提示，再因非交互终端拒绝，不泄露密码。
修改文件：
- `scripts/windows/check-mac-formal-e2e.mjs`
- `scripts/windows/test-windows-client-browser.mjs`
- `scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --preflightOnly --checkClientDiagnostics --boardSummary --timeoutMs 45000 --progressIntervalMs 10000`
- `node scripts/windows/test-mac-formal-e2e-preflight.mjs --timeoutMs 70000`
遗留问题：
- 真正正式 browser/auth 长测仍需要用户在 Windows 本机输入 Mac host 密码；密码不得发 Agent Link Board。
- 60Hz 体验还需要 Mac host 上限从 30 提升并经 Mac 侧 readiness/status 强校验。
下一步建议：
- Mac 侧先处理 `maxScreenFps=30`，Windows 侧随后复跑正式 E2E 或页面级 `--requireH264` 长测。
是否改了协议：否。
是否需要另一端配合：需要 Mac 侧后续确认 60Hz/LaunchAgent max FPS 配置；当前不阻塞无密诊断。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：给 Windows 音频设备检查增加可发 Agent Link Board 的一行摘要，并校准反向声音任务状态。
完成内容：
- `check-windows-audio-devices.mjs` 新增 `--boardSummary`，输出 `AudioDevices=Windows audio devices: wasapi=...; dshowAudio=...; probe=...; no password/auth/input/inject.`。
- `--json` 也会带同一份 `boardSummary`，方便脚本或桌面壳读取。
- 新增专项回归 `test-windows-audio-devices-summary.mjs`，用临时 fake WASAPI helper 覆盖一行摘要、JSON 字段、帮助文本和不泄密。
- 任务板已把 Windows 系统声音采集、Mac client 播放 Windows 声音校准为已完成，并记录 `AudioDevices=` 摘要入口。
修改文件：
- `scripts/windows/check-windows-audio-devices.mjs`
- `scripts/windows/test-windows-audio-devices-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node scripts/windows/test-windows-audio-devices-summary.mjs --timeoutMs 20000`
遗留问题：
- 这轮不重新做真实 WASAPI 长测；真实 Windows 声音仍以 `observe-windows-host-audio` / `observe-windows-host-media` 和 Mac client 播放验收为准。
下一步建议：
- Mac 反控 Windows 前可先跑 `node scripts/windows/check-windows-audio-devices.mjs --boardSummary` 同步本机音频能力，再按需跑 `observe-windows-host-audio --playTone --requireLevel` 或媒体基线。
是否改了协议：否。
是否需要另一端配合：不阻塞；Mac 端后续只需消费现有 `audio_frame` / PCM 播放链路。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：让 Windows 恢复开工总览直接消费 Agent Link Board 上的 Mac heartbeat 新鲜度。
完成内容：
- `check-windows-resume-status --checkBoard` 现在会从 `/api/state` 的状态/消息/事件里解析所有 `MacHeartbeat=` 摘要。
- 恢复总览会取最新 `checkedAt` 的那段，避免旧事件覆盖新的 `Mac Heartbeat` 状态。
- JSON 新增 `board.macHeartbeatFreshness`，普通输出和 `--boardSummary` 新增 `MacHeartbeatFreshness=fresh|stale checked=<秒> codex=<秒> board=<秒> checkedAt=<时间>`。
- Node 和 PowerShell wrapper 回归都覆盖旧心跳事件 + 新心跳状态并存时取最新状态。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
遗留问题：
- 这轮只把恢复总览第一屏补上 heartbeat freshness；真实是否需要重启 Mac heartbeat watcher 仍以 `MacHeartbeatStatus=` / Mac 端后台 watcher 状态为准。
下一步建议：
- 白天恢复工作时先跑 Windows resume `--checkBoard --boardSummary`。如果看到 `MacHeartbeatFreshness=stale`，先让 Mac 端跑 `MacHeartbeatOnce=` 或 `MacHeartbeatStatus=`，再判断 Mac Codex/host 是否卡住。
是否改了协议：否。
是否需要另一端配合：不阻塞；后续 Mac 端只需继续按现有 `MacHeartbeat=` 摘要上板。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：消费 Mac heartbeat 新鲜度字段，让 Windows 控制端能识别旧 `Mac Heartbeat` 摘要。
完成内容：
- Windows 控制端会解析 `MacHeartbeat=` 文本里的 `checkedAt=`、Mac Codex `updatedAt=` / `ageMs=` 和 `boardUpdatedAt=`。
- 如果 `checkedAt` 超过约 2 分钟，Mac 提醒区风险摘要会显示“Mac 心跳摘要过旧”。
- Mac 值守快速摘要和复制/导出诊断会同步显示心跳新鲜度，导出报告新增“Mac 心跳新鲜度：心跳检查 / Mac Codex / 联络板”。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
遗留问题：
- 这轮只做 Windows 控制端消费；Mac heartbeat watcher 是否在线仍以 Mac 端后台 watcher/status 为准。
下一步建议：
- 真实联调时如果 Windows 显示“Mac 心跳摘要过旧”，先让 Mac 端跑 `MacHeartbeatOnce=` 或 `MacHeartbeatStatus=`，再继续判断 Mac Codex 是否卡住。
是否改了协议：否。
是否需要另一端配合：不阻塞；后续可让 Mac 端发一条新的 `MacHeartbeat=` 摘要验证 Windows 提醒区刷新。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：让 Mac 恢复总览第一屏直接显示后台 heartbeat watcher 是否在值守。
完成内容：
- `scripts/mac/check-mac-resume-status.mjs` 现在会只读调用 `start-mac-heartbeat-watcher --status --json`，并把结果写入 JSON `macHeartbeatWatcher`。
- `--boardSummary` 的首段新增 `heartbeatWatcher=running/not-running`、`lastHeartbeat=...` 与 `lastRun/post`；无后台日志时显示 `lastHeartbeat=not-seen` / `lastRun=not-seen`。
- 普通输出新增 `Mac heartbeat watcher:` 行，方便恢复开工时不用另跑命令也能判断后台 watcher 是否真的启动。
- 该检查不启动 watcher、不停止 watcher、不认证 WebSocket、不请求密码、不发送 input/inject；失败只作为状态诊断显示，不阻塞其他恢复摘要。
- `scripts/mac/test-mac-resume-status.mjs` 覆盖 help、JSON、普通输出和 boardSummary 里的 watcher 状态字段。
修改文件：
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-resume-status.mjs`
- `node --check scripts/mac/test-mac-resume-status.mjs`
- `node scripts/mac/test-mac-resume-status.mjs --timeoutMs 45000`
- `node scripts/mac/check-mac-resume-status.mjs --checkBoard --boardSummary`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/mac docs` 无匹配。
遗留问题：
- 当前真实后台 heartbeat watcher 未启动，所以真实摘要显示 `heartbeatWatcher=not-running lastHeartbeat=not-seen`；是否长期启动仍等用户或两端确认后执行 `MacHeartbeatStart=`。
下一步建议：
- 如果要长期值守，运行 `MacHeartbeatStart=` 后再跑 `check-mac-resume-status --checkBoard --boardSummary`，确认第一屏变为 running 且出现最近 `lastHeartbeat`。
是否改了协议：否。
是否需要另一端配合：暂不阻塞；Windows 端可直接读取 Mac resume 摘要里的 `heartbeatWatcher=` 文本。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：增强 Mac heartbeat 后台 watcher 状态查询，让 Windows 新复制按钮拿到最近一次心跳结果。
完成内容：
- `scripts/mac/start-mac-heartbeat-watcher.mjs --status --json` 现在会读取后台 watcher stdout 日志尾部，并提取最后一条 `MacHeartbeat=status=...` 和最后一条 `Mac heartbeat watch: ...`。
- JSON 新增 `lastHeartbeat.heartbeat` 与 `lastHeartbeat.watcherRun`，包含最近心跳 `status`、`checkedAt`、`reason`、`codexAgeMs`、`blockers`、`warnings`、`boardUpdatedAt` 和最近一次 watcher `run/post`。
- `--status --boardSummary` 的一行摘要新增 `lastHeartbeat=...` 与 `lastRun=...`；没有后台日志时明确显示 `lastHeartbeat=not-seen` / `lastRun=not-seen`。
- 状态查询只读日志尾部，不启动 watcher、不访问密码、不认证 WebSocket、不发送 input/inject；日志摘要会做 password/token/secret/key 脱敏。
- `scripts/mac/test-mac-heartbeat-watcher-start-helper.mjs` 的 fake watcher 现在写入真实形态心跳日志，覆盖 start/status/boardSummary/restart 路径。
修改文件：
- `scripts/mac/start-mac-heartbeat-watcher.mjs`
- `scripts/mac/test-mac-heartbeat-watcher-start-helper.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/start-mac-heartbeat-watcher.mjs`
- `node --check scripts/mac/test-mac-heartbeat-watcher-start-helper.mjs`
- `node scripts/mac/test-mac-heartbeat-watcher-start-helper.mjs --timeoutMs 45000`
- `node scripts/mac/start-mac-heartbeat-watcher.mjs --status --boardSummary`
- `node scripts/mac/start-mac-heartbeat-watcher.mjs --status --json`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/mac docs` 无匹配。
遗留问题：
- 本轮没有真实启动后台 watcher；真实长期值守仍由用户或两端确认后执行 `MacHeartbeatStart=`。
下一步建议：
- Windows 端可直接用“查状态”按钮复制 `MacHeartbeatStatus=`，让 Mac 端运行后看 `lastHeartbeat=` 是否随后台 watcher 刷新。
是否改了协议：否。
是否需要另一端配合：暂不阻塞；这轮增强的是 Mac 端状态命令输出，Windows 新按钮可直接受益。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：把 Mac heartbeat watcher 管理入口从恢复摘要推进到 Windows 控制端页面，减少手工复制整段摘要。
完成内容：
- Windows 控制端“本机被控 -> Mac 提醒”区新增 `心跳一次`、`前台持续`、`后台启动`、`查状态`、`停止心跳` 五个复制按钮。
- 按钮会优先从 Mac 提醒 watcher 最近文本或输出里安全提取 `MacHeartbeatOnce=` / `MacHeartbeatWatch=` / `MacHeartbeatStart=` / `MacHeartbeatStatus=` / `MacHeartbeatStop=`；若没有提取到，则按当前 Mac 端口和 Agent Link Board 生成默认安全命令。
- 控制端现在也会把 `MacHeartbeatStart=` / `MacHeartbeatStatus=` / `MacHeartbeatStop=` 翻译成中文提醒，复制/导出诊断能显示后台启动、状态查询和停止命令已提供。
- 所有按钮只复制需要在 Mac 端执行的命令，不会在 Windows 端启动 Mac 脚本、不认证、不发送密码、不发送 input/inject。
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
- `git diff --check`
- 行首冲突扫描无匹配。
遗留问题：
- 这轮只做复制入口；实际启动/停止 Mac heartbeat watcher 仍需在 Mac 端执行复制出的命令。
下一步建议：
- 等 Mac host 在线后继续真机远控体验验收，重点看监看小窗、Mac 提醒区复制入口、视频/音频和文件剪贴板链路。
是否改了协议：否。
是否需要另一端配合：不阻塞；后续可让 Mac 端粘贴执行 `MacHeartbeatStatus=` 或 `MacHeartbeatStart=` 验证 Windows 提醒区刷新。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：增强 Mac heartbeat 摘要的新鲜度可读性，避免旧 `Mac Heartbeat` 状态被误判为当前状态。
完成内容：
- `check-mac-heartbeat --boardSummary` 首段新增 `checkedAt=`，明确这次心跳检查的生成时间。
- 读取 Agent Link Board 时，摘要里的 `board=` 新增 `boardUpdatedAt=`，明确本次读取到的联络板更新时间。
- `codex=` 摘要新增 Mac Codex 状态 `updatedAt=` 与 `ageMs=`，正常、重连信号和 stale blocker 路径都会携带对应时间证据。
- `scripts/mac/test-mac-heartbeat.mjs` 新增假联络板时间戳覆盖，确认 board updatedAt、Mac Codex updatedAt 和摘要文本保持无密。
修改文件：
- `scripts/mac/check-mac-heartbeat.mjs`
- `scripts/mac/test-mac-heartbeat.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-heartbeat.mjs`
- `node --check scripts/mac/test-mac-heartbeat.mjs`
- `node --check scripts/mac/watch-mac-heartbeat.mjs`
- `node --check scripts/mac/test-watch-mac-heartbeat.mjs`
- `node scripts/mac/test-mac-heartbeat.mjs --timeoutMs 45000`
- `node scripts/mac/test-watch-mac-heartbeat.mjs --timeoutMs 45000`
- `node scripts/mac/check-mac-heartbeat.mjs --checkBoard --boardSummary`
- `node scripts/mac/watch-mac-heartbeat.mjs --once --boardSummary`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/mac docs` 无匹配。
遗留问题：
- 这轮只增强 Mac heartbeat 摘要自身的新鲜度字段；Windows 端若要把 `checkedAt` / `boardUpdatedAt` / `ageMs` 做成 UI 提醒，可后续消费这些稳定文本。
下一步建议：
- 继续真实 Mac 被控端长时间体验验收；如果 Windows 提醒区仍容易误读旧心跳，再让 Windows Codex 把这些时间字段接入中文风险提示。
是否改了协议：否。
是否需要另一端配合：暂不阻塞；Windows 端可继续按原 `MacHeartbeat=` 摘要消费，新字段是向后兼容的补充。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：补齐 Mac heartbeat 后台 watcher 的可管理启动入口，并同步到恢复总览。
完成内容：
- 新增 `scripts/mac/start-mac-heartbeat-watcher.mjs`：支持 start/status/stop/restart，管理 `.dev-lab/mac-heartbeat/` 下的 PID、metadata 和 stdout/stderr 日志。
- 后台 watcher 默认启动 `watch-mac-heartbeat --sendStatus --intervalMs 30000`，以独立设备 `Mac Heartbeat` 上 Agent Link Board，不刷新或伪装 `Mac Codex` 状态。
- 新增 `scripts/mac/test-mac-heartbeat-watcher-start-helper.mjs`，用 fake watcher 覆盖 help、not-running status、start/status/boardSummary/stop 和 restart 生命周期。
- `check-mac-resume-status` 的 JSON、普通输出和 `--boardSummary` 新增 `MacHeartbeatStart=`、`MacHeartbeatStatus=`、`MacHeartbeatStop=`，并保留 `MacHeartbeatOnce=` / `MacHeartbeatWatch=`。
修改文件：
- `scripts/mac/start-mac-heartbeat-watcher.mjs`
- `scripts/mac/test-mac-heartbeat-watcher-start-helper.mjs`
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/start-mac-heartbeat-watcher.mjs`
- `node --check scripts/mac/test-mac-heartbeat-watcher-start-helper.mjs`
- `node --check scripts/mac/check-mac-resume-status.mjs`
- `node --check scripts/mac/test-mac-resume-status.mjs`
- `node scripts/mac/test-mac-heartbeat-watcher-start-helper.mjs --timeoutMs 45000`
- `node scripts/mac/test-mac-resume-status.mjs --timeoutMs 45000`
- `node scripts/mac/start-mac-heartbeat-watcher.mjs --status --boardSummary`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/mac docs` 无匹配。
遗留问题：
- 本轮只提供 Mac 端后台 watcher 管理入口，没有真实启动常驻 watcher；如需长时间值守，后续由用户或两端确认后再运行 `MacHeartbeatStart=`。
- Windows 端已消费 `MacHeartbeatOnce=` / `MacHeartbeatWatch=`；若要在 Windows resume/控制端进一步显示 `MacHeartbeatStart/Status/Stop`，可由 Windows Codex 后续接入。
下一步建议：
- 继续真实 Mac 被控端长时间体验验收，或让 Windows 端消费 `MacHeartbeatStart/Status/Stop` 稳定标签。
是否改了协议：否。
是否需要另一端配合：暂不阻塞；如 Windows 端想展示后台 watcher 管理命令，可消费 Mac resume 摘要里的 `MacHeartbeatStart=` / `MacHeartbeatStatus=` / `MacHeartbeatStop=`。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows 恢复总览默认输出并消费 Mac heartbeat watcher 管理入口，减少对历史通讯板摘要的依赖。
完成内容：
- `check-windows-resume-status` JSON `commands.macHeartbeatOnceCommand` / `commands.macHeartbeatWatchCommand` / `commands.macHeartbeatStartCommand` / `commands.macHeartbeatStatusCommand` / `commands.macHeartbeatStopCommand`、普通输出和 `--boardSummary` 默认给出 Mac 端可复制的 heartbeat watcher 命令。
- 默认单次命令包含 `watch-mac-heartbeat --once --sendStatus --host 127.0.0.1 --port <Mac port> --server <Agent Link Board> --boardSummary`。
- 默认持续 watcher 命令包含 `watch-mac-heartbeat --sendStatus --host 127.0.0.1 --port <Mac port> --server <Agent Link Board> --intervalMs 30000`。
- 默认后台 helper 命令包含 `start-mac-heartbeat-watcher --host 127.0.0.1 --port <Mac port> --server <Agent Link Board> --intervalMs 30000 --boardSummary`、`--status --boardSummary` 和 `--stop --boardSummary`。
- `--checkBoard` 仍会优先使用 Mac resume 已上板的 `MacHeartbeatOnce=` / `MacHeartbeatWatch=` / `MacHeartbeatStart=` / `MacHeartbeatStatus=` / `MacHeartbeatStop=`，并保留安全校验。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- `node scripts/windows/check-windows-resume-status.mjs --noDiscover --host 192.168.31.122 --port 43770 --boardSummary`
- `node scripts/windows/check-windows-resume-status.mjs --noDiscover --host 192.168.31.122 --port 43770 --checkBoard --boardSummary`
- PowerShell AST 解析通过。
- `git diff --check`
- 行首冲突扫描无匹配。
遗留问题：
- 这轮只把 Mac heartbeat watcher 管理入口放进 Windows 恢复总览；Windows 控制端页面内的一键复制/分按钮入口还没做。
下一步建议：
- 下一轮可以把 Windows 桌面版“Mac 提醒”区做成更明确的“复制单次心跳 / 启动后台心跳 / 查看状态 / 停止后台心跳”入口，或继续真实 Mac 视频/音频长测。
是否改了协议：否。
是否需要另一端配合：不阻塞；后续真实体验验收时可让 Mac 端运行 `MacHeartbeatStart=` 或 `MacHeartbeatStatus=` 观察 Windows 提醒区刷新。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows 侧消费 Mac resume 暴露的 `MacHeartbeatOnce=` / `MacHeartbeatWatch=`。
完成内容：
- `check-windows-resume-status --checkBoard` 新增安全提取 `MacHeartbeatOnce=node scripts/mac/watch-mac-heartbeat.mjs --once --sendStatus --boardSummary` 和 `MacHeartbeatWatch=node scripts/mac/watch-mac-heartbeat.mjs --sendStatus --intervalMs 30000`。
- 提取结果写入 JSON `board.macHeartbeatOnce` / `board.macHeartbeatWatch`、普通输出和 `--boardSummary`；危险候选会被拒绝，包括敏感参数、缺 `--sendStatus`、单次命令缺 `--once --boardSummary`、持续 watcher 缺 `--intervalMs` 或脚本路径不对。
- Windows 控制端 Mac 提醒区、快速摘要、复制/导出诊断新增中文风险：“Mac 单次心跳上板命令已提供”“Mac 持续心跳 watcher 命令已提供”，只在 stale/blocked/非空 warning/blocker 或 Codex 重连风险上下文中显示。
- PowerShell wrapper 帮助和 Node/PowerShell resume 回归同步覆盖这些新字段。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- `node scripts/windows/check-windows-resume-status.mjs --noDiscover --host 192.168.31.122 --port 43770 --checkBoard --boardSummary`
- PowerShell AST 解析通过。
遗留问题：
- 这轮只消费和显示 Mac heartbeat watcher 入口；真正把持续 watcher 纳入桌面壳开关/后台服务管理，后续再做。
下一步建议：
- 下一轮可以把 Windows 桌面版“Mac 提醒”区做成更明确的“一键复制/启动 MacHeartbeatOnce/Watch 指令”入口，或者继续推进真实 Mac 画面/音频长测。
是否改了协议：否。
是否需要另一端配合：不阻塞；后续可让 Mac 端运行 `MacHeartbeatOnce=` 或 `MacHeartbeatWatch=` 观察 Windows 提醒区是否稳定刷新。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows 侧消费 Mac `check-mac-heartbeat` 新 reason，并把心跳入口放进恢复总览。
完成内容：
- `watch-codex-link-mac-alerts.ps1` 新增 `mac-codex-stale` 和 `codex-reconnect-signal` 直接提醒规则。
- Windows 控制端 Mac 提醒区、快速摘要、复制/导出诊断新增中文风险：“Mac Codex 长时间无新进展”“Mac Codex 出现重连异常信号”。
- `check-windows-resume-status` JSON、普通输出和 `--boardSummary` 新增 `MacHeartbeat=node scripts/mac/check-mac-heartbeat.mjs --host <Mac IP> --port <port> --server <Agent Link Board> --checkBoard --boardSummary`。
- Node/PowerShell resume 回归、watcher 回归和 Windows client diagnostics-only 覆盖这些新字段/文案。
修改文件：
- `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- `node scripts/windows/check-windows-resume-status.mjs --noDiscover --host 192.168.31.122 --port 43770 --boardSummary`
- PowerShell AST 解析通过。
- `git diff --check`
- 行首冲突扫描无匹配。
遗留问题：
- 这轮只消费 Mac heartbeat 摘要文本和提供命令入口；真正独立常驻 heartbeat/watchdog 后台化仍由后续 Mac/Windows 桌面壳共同决定。
下一步建议：
- 真实联调时让 Mac 端跑 `MacHeartbeat=` 摘要，再观察 Windows watcher、Windows 控制端 Mac 提醒区和监看小窗状态是否及时显示 stale/reconnect 风险。
是否改了协议：否。
是否需要另一端配合：不阻塞；后续真实体验验收时需要 Mac 端运行或定时上报 `check-mac-heartbeat` 摘要。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：落地 Windows 控 Mac 页面内“Mac 监看”小窗第一版。
完成内容：
- Windows 控制端顶部工具栏新增“监看小窗”入口，悬浮控制中心也新增“监看”按钮。
- 进入小窗后远控画面缩到页面右下角，默认只监看、不发送键鼠或快捷键；小窗显示连接、视频、输入安全状态和 Mac 提醒摘要。
- 小窗支持拖动、浏览器内缩放、恢复主窗口、复制诊断和断开；复制/导出诊断会标记“监看小窗”和“只监看，不发送输入”。
- 页面自检新增小窗回归：进入、禁输入、拖动、恢复和复制诊断均纳入 `test-windows-client-browser --diagnosticsOnly`。
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
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps scripts docs shared` 无匹配。
遗留问题：
- 这版还是页面内小窗，不是桌面壳 always-on-top 独立窗口；真实 Mac 连接后还要看小窗尺寸、拖动/缩放手感和 Mac 卡住提醒可读性。
下一步建议：
- 真连 Mac 时打开小窗观察 Codex/编译/测试场景；确认体验稳定后，再把同一状态抽到 Tauri 桌面置顶小窗。
是否改了协议：否。
是否需要另一端配合：不阻塞；后续真实 Mac 连接体验验收时可请 Mac 端保持 host 在线并上报 heartbeat/watchdog 状态。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows 侧消费精确 `codex-reconnect-stuck` 卡住信号。
完成内容：
- `watch-codex-link-mac-alerts.ps1` 新增精确匹配：`reason=codex-reconnect-stuck`、`正在重新连接 5/5`、`stream disconnected before completion`，以及 `error sending request` + `/backend-api/codex/responses`。
- Windows 控制端 Mac 提醒区、快速摘要和复制/导出诊断新增中文风险：“Mac Codex 可能卡在重新连接 5/5”“检测到 stream disconnected before completion”“请查看 Mac 窗口，可能需要手动重试/刷新”。
- 回归覆盖 Agent Link Board event/status 两种入口，确保 Mac 侧 watchdog 或人工消息都能触发 Windows 本机提醒。
修改文件：
- `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- PowerShell 7 AST parse `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
遗留问题：
- Mac 侧真正检测“正在重新连接 5/5”的 watchdog/OCR 仍由 Mac 端落地；Windows 侧已准备好消费其上报。
下一步建议：
- 继续做 Windows 控 Mac 页面内监看小窗，让这个 `codex-reconnect-stuck` 风险能直接显示在小窗里。
是否改了协议：否。
是否需要另一端配合：需要 Mac 端 heartbeat/watchdog 后续上报 `reason=codex-reconnect-stuck` 或对应 evidence 文本。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows 侧先落地 Mac 卡住/心跳/502 独立提醒底座，并回复小窗模式排期。
完成内容：
- 已在 Agent Link Board 回复：Windows 侧 Mac 监看小窗第一版建议先做页面内“浮层缩小模式”，复用现有视频画布、悬浮控制中心和诊断状态，默认只监看、不捕获键鼠；稳定后再抽到桌面壳 always-on-top 独立小窗。
- `watch-codex-link-mac-alerts.ps1` 扩展 stale 判断：`checking`、`thinking`、`running`、`syncing`、`planning` 等 Mac Codex 进行中状态长时间无更新会提醒；Mac -> Windows `currentCall` 超过阈值未更新会单独提醒。
- watcher 新增 Mac 心跳/host/网络文案识别：`MacHeartbeat=stale`、Mac watchdog 心跳过期、Mac host `/discovery` 不可达、`ECONNREFUSED`、502/Bad Gateway/API 网络错误都会触发 Windows 本机提醒。
- Windows 控制端 Mac 提醒区、快速摘要和复制/导出诊断新增中文风险：“Mac 心跳过期，可能卡住”“Mac host 不可达”“Mac/API 网络错误”，并放宽 Mac 值守导出摘要长度，避免关键卡住信号被截断。
修改文件：
- `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- PowerShell 7 AST parse `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 30000`
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
遗留问题：
- 本轮只做 Windows 侧独立提醒底座；真正独立 Mac watchdog/heartbeat 进程或 Mac health endpoint 仍需 Mac 端后续设计。
- 小窗模式本轮只确定排期和消费底座，未开始 UI 实装。
下一步建议：
- 继续做 Windows 控 Mac 的页面内“监看小窗/浮层缩小模式”：默认只监看，显示远端画面、连接/FPS/延迟、输入/安全状态、最近 Mac 提醒，并提供恢复、复制诊断和断开。
是否改了协议：否。
是否需要另一端配合：Mac 端后续可补独立 watchdog/heartbeat 字段；Windows 当前规则已能消费文本和 watcher 摘要。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows host 状态和 readiness 对齐 `WindowsReverseGrant*` 稳定标签。
完成内容：
- `start-windows-host --status` 的 JSON、普通输出和 `--boardSummary` 在默认需确认反控策略下新增 `WindowsReverseGrantStatus=`、`WindowsOpenOneTimeReverseGrant=`、`WindowsReverseGrantStatusNodeFallback=`、`WindowsOpenOneTimeReverseGrantNodeFallback=`；同时保留旧 `ReverseGrant=` / `ReverseGrantPs=`。
- `check-windows-host-readiness` 的 JSON、普通输出和 `--boardSummary` 同步新增同名稳定标签；即使 runtime 摘要压缩，也会补齐 PowerShell 7 推荐命令和 Node fallback。
- PowerShell wrapper 帮助、Windows host README、任务板和下一步文档同步说明新标签，方便 Mac 端或人工从任一 Windows host/status/readiness 摘要复制本机回环状态查询和 30 秒一次性授权命令。
修改文件：
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/check-windows-host-readiness.ps1`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node --check scripts/windows/test-windows-host-start-helper.mjs`
- `node --check scripts/windows/test-windows-host-readiness-board-summary.mjs`
- PowerShell 7 AST parse `start-windows-host.ps1` 和 `check-windows-host-readiness.ps1`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --script start-windows-host.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-host-readiness.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --script start-windows-host.ps1 --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --script start-windows-host.ps1 --shell pwsh --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --script check-windows-host-readiness.ps1 --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --script check-windows-host-readiness.ps1 --shell pwsh --timeoutMs 10000 --boardSummary`
- 真实只读 `node scripts/windows/start-windows-host.mjs --status --boardSummary --checkBoard --timeoutMs 12000`：本机 host 离线时按预期非 0，但摘要已输出 `WindowsReverseGrant*` 标签和旧兼容标签。
- 真实只读 `node scripts/windows/check-windows-host-readiness.mjs --checkBoard --boardSummary --timeoutMs 12000`
遗留问题：
- 本轮不执行真实 Mac -> Windows 反控请求；一次性授权实际闭环仍需现场两端配合。
下一步建议：
- Mac 端拿到 `WindowsOpenOneTimeReverseGrant=` 后，在 Windows 本机打开临时授权，再让 Mac client 重试反控；后续可继续把相同稳定标签接入更多 UI 自动复制入口。
是否改了协议：否。
是否需要另一端配合：暂不需要；真实反控演练时需要 Mac 端发起请求。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows 恢复总览对齐 `WindowsReverseGrant*` 稳定标签。
完成内容：
- `check-windows-resume-status` 的 JSON、普通输出和 `--boardSummary` 新增 `WindowsReverseGrantStatus=`、`WindowsOpenOneTimeReverseGrant=`、`WindowsReverseGrantStatusNodeFallback=`、`WindowsOpenOneTimeReverseGrantNodeFallback=`；PowerShell 推荐命令使用 `pwsh ... allow-windows-reverse-control.ps1 -Status/-Grant -BoardSummary`，Node fallback 使用 `allow-windows-reverse-control.mjs --status/--grant --boardSummary`。
- `--checkBoard` 会从 Agent Link Board 最近状态/消息/事件安全提取 Mac 端同名标签：只接受 Windows 本机回环地址、真实数字端口、`BoardSummary`、`-Status` / `-Grant` 和限时授权参数；拒绝非回环地址、密码/token/secret、缺少 boardSummary 或占位端口，不把拒绝候选写入摘要。
- PowerShell wrapper 帮助和 Node/PowerShell 回归同步覆盖新字段，保留旧 `ReverseGrant=` / `ReverseGrantPs=` 兼容标签。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- PowerShell 7 AST parse `scripts/windows/check-windows-resume-status.ps1`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
遗留问题：
- 本轮不执行真实 Mac -> Windows 反控请求；真实 LAN008 后一次性授权闭环仍需现场两端配合。
下一步建议：
- 让 Mac 端 `start-mac-client` / readiness / smoke 摘要继续输出同名稳定标签；Windows 侧用恢复总览或控制端提醒区直接复制 `WindowsOpenOneTimeReverseGrant=` 后让 Mac 重试反控。
是否改了协议：否。
是否需要另一端配合：暂不需要；真实演练时需要 Mac 端发起反控请求。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows watcher/控制端消费 Mac 侧 `WindowsReverseGrant*` 稳定标签。
完成内容：
- `watch-codex-link-mac-alerts.ps1` 收紧反控授权匹配：`WindowsReverseGrantStatus=` / `WindowsOpenOneTimeReverseGrant=` / `ReverseGrant=` / `allow-windows-reverse-control` 只有搭配 `LAN008`、等待/重试、失败/阻塞或非空风险上下文时才提醒；干净 `warnings=none blockers=none` 命令清单不误弹。
- Windows 控制端 Mac 提醒区、快速摘要和复制/导出诊断新增“Windows 反控授权状态命令已提供”“Windows 一次性反控授权命令已提供”，并放宽 Mac 值守风险摘要长度，避免多项现场风险被截断。
- 回归新增结构化反控授权标签告警和干净标签不告警，同时页面 diagnostics-only 覆盖导出/复制文本里的新中文提示和原始命令。
修改文件：
- `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
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
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- PowerShell 7 AST parse `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 未执行真实 Mac -> Windows 反控请求或一次性授权；本轮只做 Windows 本机提醒/诊断消费层。
下一步建议：
- Mac 端正式 smoke/checklist/discover 摘要带 `WindowsReverseGrant*` 后，Windows 侧可直接看 Mac 提醒区或复制诊断；若出现 `LAN008` 或等待重试，再按 `WindowsOpenOneTimeReverseGrant=` 在 Windows 本机打开一次性授权。
是否改了协议：否。
是否需要另一端配合：暂不需要；真实反控演练仍需要用户现场确认。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：让 Windows discovery 和 formal preflight 也直接给出 `MacFormalLocalSmoke=` 本机短验收入口。
完成内容：
- `discover-lan-hosts` 的 JSON `macFormalE2e.macFormalLocalSmokeCommand`、普通输出和 `--boardSummary` 新增 `MacFormalLocalSmoke=node scripts/mac/check-mac-formal-local-smoke.mjs --host <Mac IP> --port <port> --promptPassword --boardSummary`。
- `check-mac-formal-e2e --preflightOnly` 的 JSON、普通输出、`--boardSummary` 和 `NEED_USER_AUTH` 也新增同一条 `MacFormalLocalSmoke=`，提醒正式长测前先由 Mac 本机短验 H.264/PCM/input-log。
- `discover-lan-hosts.ps1` 帮助说明同步该标签；专项回归覆盖 Node/PowerShell JSON、boardSummary、帮助、不泄密和真实 Mac 只读摘要。
修改文件：
- `scripts/windows/discover-lan-hosts.mjs`
- `scripts/windows/discover-lan-hosts.ps1`
- `scripts/windows/test-discover-lan-hosts.mjs`
- `scripts/windows/check-mac-formal-e2e.mjs`
- `scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/discover-lan-hosts.mjs`
- `node --check scripts/windows/check-mac-formal-e2e.mjs`
- `node --check scripts/windows/test-discover-lan-hosts.mjs`
- `node --check scripts/windows/test-mac-formal-e2e-preflight.mjs`
- PowerShell 7 AST parse `discover-lan-hosts.ps1` 和 `check-mac-formal-e2e.ps1`
- `node scripts/windows/test-windows-script-help.mjs --script discover-lan-hosts.mjs --script check-mac-formal-e2e.mjs --timeoutMs 10000`
- `node scripts/windows/test-discover-lan-hosts.mjs --timeoutMs 45000`
- `node scripts/windows/test-mac-formal-e2e-preflight.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary`
- 真实只读 `discover-lan-hosts --noLocalSubnets --host 192.168.31.122 --port 43770 --requireMacHost --boardSummary --timeoutMs 1200`
- 真实只读 `check-mac-formal-e2e --host 192.168.31.122 --port 43770 --preflightOnly --boardSummary --timeoutMs 45000`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 未执行真实密码认证、Mac 本机短验收或 input/inject；本轮只补 Windows 侧可复制入口和无密摘要。
- 真实 Mac 当前仍上报 `maxScreenFps=30`，formal preflight 会继续提示 `FpsLimit requested=60Hz remoteMax=30Hz`。
下一步建议：
- 现场正式长测前，先让 Mac 端复制 discovery/formal preflight 摘要里的 `MacFormalLocalSmoke=` 做本机短验收；若仍显示 30Hz 上限，再按 `MacMaxFpsPlan=` / `MacUnattendedFormal=` 处理 LaunchAgent 上限和 loaded 门禁。
是否改了协议：否。
是否需要另一端配合：暂不需要；真正本机短验收需要 Mac 端/用户现场输入密码。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：让 Windows 恢复总览直接提供并安全提取 `MacFormalLocalSmoke=` 本机短验收入口。
完成内容：
- `check-windows-resume-status` 的 JSON `commands.macFormalLocalSmokeCommand`、普通输出和 `--boardSummary` 新增 `MacFormalLocalSmoke=node scripts/mac/check-mac-formal-local-smoke.mjs --host <Mac IP> --port <port> --promptPassword --boardSummary`。
- `--checkBoard` 会从 Agent Link Board `/api/state` 或 watch 文本中提取最近 `MacFormalLocalSmoke=` / `RerunFormalLocalSmoke=` 命令；只接受 `node scripts/mac/check-mac-formal-local-smoke.mjs`，拒绝 `--password`、token/secret、占位端口和不带 `--boardSummary` 的候选。
- PowerShell 包装帮助同步说明该入口；Node/PowerShell 回归都覆盖 JSON、boardSummary、帮助和联络板安全提取。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- PowerShell 7 AST parse `scripts/windows/check-windows-resume-status.ps1`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
遗留问题：
- 未执行真实密码认证、真实 Mac 本机短验收或 input/inject；本轮只做 Windows 恢复总览入口和安全提取。
下一步建议：
- Windows 开工第一屏继续优先跑 `check-windows-resume-status --checkBoard --boardSummary`；如果摘要里有 `MacFormalLocalSmoke=`，先让 Mac 端按该命令做本机短验收，再进入正式长测。
是否改了协议：否。
是否需要另一端配合：暂不需要；真正短验收需要 Mac 端/用户现场输入密码。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows watcher 和控制端诊断消费 Mac 侧 `MacFormalLocalSmoke=` / `RerunFormalLocalSmoke=`。
完成内容：
- `watch-codex-link-mac-alerts.ps1` 新增 Mac 本机正式短验收显式匹配：`MacFormalLocalSmoke=`、`RerunFormalLocalSmoke=` 或 `check-mac-formal-local-smoke` 搭配 failed/blocked/ready=false、认证/密码或非空 warning/blocker 时会触发 Windows 本机提醒。
- Windows 控制端 Mac 提醒区、快速摘要和复制/导出诊断新增中文风险“Mac 本机短验收需处理”“Mac 本机短验收重跑命令已提供”，并会把 watcher finding 详情纳入导出诊断的脱敏文本。
- 干净摘要保护保持：`MacFormalLocalSmoke=ready warnings=none blockers=none` 和单独复跑命令不会误弹提醒。
- 复制/导出诊断的 Mac 值守摘要长度略放宽，避免风险标签较多时把新复跑命令提示截掉。
修改文件：
- `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
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
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- PowerShell 7 AST parse `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
遗留问题：
- 未执行真实密码认证或 input/inject；本轮只做 Windows 侧提醒/诊断消费层。
下一步建议：
- Mac 端后续跑 `check-mac-formal-local-smoke --boardSummary` 后，Windows 可直接看 Mac 提醒区或复制诊断，确认是否出现本机短验收失败和可复跑命令。
是否改了协议：否。
是否需要另一端配合：暂不需要；正式本机短验收仍由 Mac 端/用户现场输入密码触发。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：复查 formal E2E 第二步，并让 Windows host 状态摘要输出统一 `MacClientFormalChecklist=` 标签。
完成内容：
- 重新复查 Windows formal E2E 第二步依赖：无密 preflight + Windows client diagnostics-only 均通过；正式连接 Mac 的第二步仍需要用户本机隐藏输入密码，密码未写入命令或通讯板。
- `start-windows-host --status` 在线目标新增 `formalChecklistLabel`，内容为 `MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs --host <Windows IP> --port <port> --boardSummary`。
- 普通 status、JSON `macClientReadinessCommands[]` 和 `--boardSummary` 都会输出该统一标签；原 `formalCommand`、readiness 命令和 `sendCallCommand` 保持兼容。
修改文件：
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --preflightOnly --checkClientDiagnostics --boardSummary --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --host 192.168.31.122 --port 43770 --diagnosticsOnly --requireH264 --boardSummary --timeoutMs 45000`
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check scripts/windows/test-windows-host-start-helper.mjs`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --script start-windows-host.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows apps/windows-host docs`
遗留问题：
- Mac host 当前 `/discovery` 仍显示 `maxScreenFps=30`；正式 60Hz 长测前应先按 `MacMaxFpsPlan=` 或 `MacMaxFpsSafeStart=` 提升上限并用 `MacUnattendedFormal=` 强校验。
下一步建议：
- Mac 控 Windows 前先让 Windows 侧跑 `start-windows-host --status --boardSummary`，Mac 侧复制 `MacClientFormalChecklist=` 对应命令跑正式清单；ready 后再决定是否 `--sendCall`。
是否改了协议：否。
是否需要另一端配合：暂不需要；正式密码连 Mac 或 60Hz 上限调整需要用户/Mac 端现场配合。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows watcher 和控制端诊断消费 Mac 侧 `MacClientFormalChecklist=` 正式清单入口。
完成内容：
- `watch-codex-link-mac-alerts.ps1` 新增 `MacClientFormalChecklist=` 显式匹配：当它与 Mac client/formal 的 `windows-host`、`video`、`build`、`auth`、`repo` 等 warning/blocker 或 `ready=false/blocked/failed` 同时出现时提醒。
- 控制端 Mac 提醒区、快速摘要和复制/导出诊断新增中文提示“Mac client 正式清单命令已提供”，并保留原始 `MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs ...` 命令证据。
- 清爽状态保护保持不变：`MacClientFormalChecklist=` 单独伴随 `warnings=none blockers=none` 时不误弹。
- 页面 diagnostics-only 回归把重复的 Mac 提醒假数据整理为变量，并覆盖导出/复制诊断文本里的新中文提示和原始命令。
修改文件：
- `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
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
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- PowerShell / PowerShell 7 AST parse `watch-codex-link-mac-alerts.ps1`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5201 --debugPort 9341 --boardSummary --timeoutMs 45000`
遗留问题：
- 本轮只做 Windows 侧消费层，不启动 Mac client/host，不认证 WebSocket，不发送密码，不执行 input/inject。
下一步建议：
- Mac 端若继续补更多 `MacClientFormalChecklist=` 来源，Windows 侧现有 watcher/控制端诊断应能直接显示；后续可继续做 Mac -> Windows 真机 formal smoke 的无密 readiness/反控授权联动。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows watcher 和控制端诊断消费 Mac 侧 `MacMaxFpsSafeStart=`，并按用户要求重新复查 formal E2E 第二步。
完成内容：
- `watch-codex-link-mac-alerts.ps1` 现在会在 `MacMaxFpsSafeStart=` 与 `fps-limit`、`mac-host-max-fps`、`launch-agent-max-fps` 等上限 warning 同时出现时触发 Windows 本机提醒。
- Windows 控制端 Mac 提醒区、快速摘要和复制/导出诊断会把该情况翻译成“Mac 60Hz 安全启动命令已提供”，并保留原始 `MacMaxFpsSafeStart=` 命令证据。
- 新增 watcher 回归覆盖“有上限 warning 时提醒”和“`warnings=none blockers=none` 只带命令时不误弹”两条路径。
- 页面 diagnostics-only 回归同步覆盖导出/复制诊断文本，确认中文风险和原始安全启动命令都会进入现场报告。
- 已重新复查 formal E2E 第二步：真实 Mac `192.168.31.122:43770` 无密 preflight 通过，Windows client diagnostics-only 通过；当前 Mac discovery 仍上报 `maxScreenFps=30`，因此 60Hz 体感上限应先让 Mac 端按 `MacMaxFpsSafeStart=` 或 `MacMaxFpsPlan=` 调整后再复验。
修改文件：
- `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node scripts/windows/check-mac-formal-e2e.mjs --discover --preflightOnly --boardSummary --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --host 192.168.31.122 --port 43770 --diagnosticsOnly --boardSummary --timeoutMs 45000 --clientPort 5200 --debugPort 9340`
- `node scripts/windows/discover-lan-hosts.mjs --host 192.168.31.122 --port 43770 --timeoutMs 45000 --boardSummary`
- `node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --preflightOnly --checkClientDiagnostics --boardSummary --timeoutMs 45000 --clientPort 5200 --debugPort 9340`
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --boardSummary --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-client-browser.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary`
- PowerShell / PowerShell 7 AST parse `watch-codex-link-mac-alerts.ps1`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮不启动正式 Mac host、不写 LaunchAgent、不认证 WebSocket、不发送密码、不执行 input/inject。
- 真正的 formal Plan 2 H.264 canvas 连接仍需要用户本机隐藏输入 Mac 密码；如果命令停在 `Mac host password:`，属于等待现场输入。
下一步建议：
- Mac 侧先把当前 30Hz 上限按 `MacMaxFpsSafeStart=` 前台启动或按 `MacMaxFpsPlan=` 写入 LaunchAgent，再复跑 readiness/status；Windows 侧再做正式 60Hz 第二步。
是否改了协议：否。
是否需要另一端配合：需要 Mac 侧在方便时处理 60Hz 上限并复报 readiness/status。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows 恢复总览新增 `MacHostReadiness=` 无密 host readiness 摘要入口。
完成内容：
- `check-windows-resume-status` 的 JSON `commands` 新增 `macHostReadinessCommand`。
- 普通输出“Next safe commands”和 `--boardSummary` 新增 `MacHostReadiness=node scripts/mac/check-mac-host-readiness.mjs --host <Mac IP> --port <port> --checkBoard --boardSummary`。
- 该入口用于让 Mac 端跑无密低风险 host readiness，与需要密码的媒体/正式验收命令分开；不会认证、不要求或打印密码、不发送 input/inject。
- 已合入 Mac 最新 `7f69426`，两端都使用同名 `MacHostReadiness=` 摘要标签。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-resume-status.mjs --timeoutMs 10000`
- `node scripts/windows/check-windows-resume-status.mjs --discoverNoLocalSubnets --host 192.168.31.122 --port 43770 --checkBoard --boardSummary --timeoutMs 45000`：确认真实摘要包含 `MacHostReadiness=node scripts/mac/check-mac-host-readiness.mjs --host 192.168.31.122 --port 43770 --checkBoard --boardSummary`。
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary`
遗留问题：
- 本轮只新增 Windows 侧恢复总览入口；不启动 Mac host、不跑 Mac readiness 实际命令、不认证、不发送 input/inject。
下一步建议：
- 后续恢复开工时先发 Windows `check-windows-resume-status --checkBoard --boardSummary`，若需要 Mac 侧细节，再让 Mac 端复制其中的 `MacHostReadiness=`。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows 恢复总览消费 Mac 侧 `MacMaxFpsSafeStart=` 60Hz 前台安全启动标签，并复查 formal E2E 第二步。
完成内容：
- `check-windows-resume-status --checkBoard` 现在会从 Agent Link Board `/api/state` 的状态、消息和事件里提取最近的 `MacMaxFpsSafeStart=`。
- JSON 新增 `board.macMaxFpsSafeStart`，普通输出和 `--boardSummary` 会在找到安全候选时显示 `MacMaxFpsSafeStart=node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port <端口> --maxScreenFps 60`。
- 提取器要求候选必须是 `node scripts/mac/start-mac-host.mjs ...`、带真实数字端口、带 `--maxScreenFps 1..240`；带 `--password`、token、secret、passwd、pwd 或 `<当前端口>` 占位的候选会被拒绝且不输出敏感文本。
- 重新复查 formal E2E 第二步基础链路：真实 Mac `192.168.31.122:43770` 的无密 preflight 和 Windows client diagnostics 通过；完整 Plan 2 仍需要现场输入 Mac 密码。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node scripts/windows/check-mac-formal-e2e.mjs --preflightOnly --checkClientDiagnostics --host 192.168.31.122 --port 43770 --clientPort 5200 --debugPort 9340 --timeoutMs 45000`
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-resume-status.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary`
- 真实只读 `node scripts/windows/check-windows-resume-status.mjs --discoverNoLocalSubnets --host 192.168.31.122 --port 43770 --checkBoard --boardSummary --timeoutMs 45000`：确认 Mac ready，当前联络板未输出可接受的 `MacMaxFpsSafeStart=`，占位或不完整候选不会进入摘要。
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows docs`（预期无匹配）
遗留问题：
- 本轮不启动 Mac host、不写 LaunchAgent、不认证密码、不做真实 H.264 长画面验收、不发送 input/inject。
下一步建议：
- Mac 端若要让 Windows 恢复总览显示 `MacMaxFpsSafeStart=`，应上板真实数字端口的命令；Windows 端再用 `check-windows-resume-status --checkBoard --boardSummary` 只读确认。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows 恢复总览消费 Mac 侧 `MacHostSafeStart=` 安全启动标签。
完成内容：
- `check-windows-resume-status --checkBoard` 现在会从 Agent Link Board `/api/state` 的状态、消息和事件里提取最近的 `MacHostSafeStart=`。
- JSON 新增 `board.macHostSafeStart`，普通输出和 `--boardSummary` 会在找到时显示 `MacHostSafeStart=node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port <端口>`。
- 提取器只接受 `node scripts/mac/start-mac-host.mjs ...` 形式且带真实数字端口的候选，并拒绝带 `--password`、token、secret、passwd、pwd 或 `<当前端口>` 这类占位值的命令；拒绝计数保留在 JSON 中，但不输出敏感文本。
- PowerShell wrapper 帮助同步说明 `-CheckBoard` 会带出 `MacHostSafeStart=`。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-resume-status.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary`
- 真实只读 `node scripts/windows/check-windows-resume-status.mjs --discoverNoLocalSubnets --host 192.168.31.122 --port 43770 --checkBoard --boardSummary --timeoutMs 45000`：确认当前 Mac 预检 ready，且占位端口候选不会作为可复制 `MacHostSafeStart=` 输出。
遗留问题：
- 本轮只消费通讯板里已有的 Mac 安全启动命令；没有启动 Mac host、没有处理 LaunchAgent、没有做密码认证或真实 H.264 画面验收。
下一步建议：
- 后续若 Mac 端希望 Windows 总览显示可复制 `MacHostSafeStart=`，应在通讯板状态/消息里放真实数字端口的命令，不要只放 `<当前端口>` 占位说明。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：Mac host 状态摘要显式输出安全前台启动标签。
完成内容：
- `start-mac-host --status --boardSummary` 离线和在线路径都新增 `MacHostSafeStart=`，复用现有 `commands.safeStartCommand`。
- 离线摘要仍保留原来的 `Next: start safely with ...` 人类提示，但同时提供可被 watcher/脚本稳定识别的一行标签。
- 状态助手回归覆盖离线 JSON、默认 JSON、active currentCall 摘要和在线 JSON，确认 `MacHostSafeStart=` 保留当前 `--port <端口>`，且不泄密、不启动服务、不发送 input/inject。
修改文件：
- `scripts/mac/start-mac-host.mjs`
- `scripts/mac/test-mac-host-start-helper.mjs`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/start-mac-host.mjs`
- `node --check scripts/mac/test-mac-host-start-helper.mjs`
- `node scripts/mac/start-mac-host.mjs --status --host 127.0.0.1 --port 43888 --boardSummary`（预期因 host 离线退出非 0；stdout 一行摘要包含 `MacHostSafeStart=` 且保留 `--port 43888`）
- `node scripts/mac/test-mac-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/mac/start-mac-host.mjs scripts/mac/test-mac-host-start-helper.mjs docs/HANDOFF_LOG.md docs/ACTIVE_LOCKS.md docs/04-task-board.md`
遗留问题：
- 本轮只补 status 摘要标签；没有启动 host、没有写入/加载 LaunchAgent。
下一步建议：
- Windows watcher/控制端消费 `MacHostSafeStart=` 后，可以从 readiness/resume/formal/status 任一入口稳定识别安全启动建议；真实 60Hz 复验仍需要现场授权后处理 LaunchAgent 和重启。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：Mac formal E2E readiness 摘要显式输出安全前台启动标签。
完成内容：
- `check-mac-formal-e2e-status --boardSummary` 离线和在线路径都新增 `MacHostSafeStart=`，复用现有 `commands.macHostSafeStartCommand`。
- 离线 formal E2E 摘要仍会说明先用 `MacHostSafeStart` 启动 host 再重跑 checklist，并保留当前 `--port <端口>`。
- 统一测试形状要求 formal E2E 摘要必须包含 `MacHostSafeStart=`、`start-mac-host.mjs`、`--promptPassword` 和 `--requirePassword`，避免回退成自然语言不可解析提示。
修改文件：
- `scripts/mac/check-mac-formal-e2e-status.mjs`
- `scripts/mac/test-mac-formal-e2e-status.mjs`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-formal-e2e-status.mjs`
- `node --check scripts/mac/test-mac-formal-e2e-status.mjs`
- `node scripts/mac/test-mac-formal-e2e-status.mjs --timeoutMs 30000`
- `node scripts/mac/check-mac-formal-e2e-status.mjs --host 127.0.0.1 --port 43888 --skipBoard --boardSummary`（预期因 host 离线退出非 0；stdout 一行摘要包含 `MacHostSafeStart=` 且保留 `--port 43888`）
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/mac/check-mac-formal-e2e-status.mjs scripts/mac/test-mac-formal-e2e-status.mjs docs/HANDOFF_LOG.md docs/ACTIVE_LOCKS.md docs/04-task-board.md`
遗留问题：
- 本轮只补 formal E2E readiness 摘要标签；没有启动 host、没有发 Agent Link Board call、没有认证、没有 input/inject。
下一步建议：
- 继续把 Mac 侧其他正式/页面入口的下一步命令标签统一成可复制、可被 Windows watcher 识别的一行摘要；真正 60Hz 复验仍需后续现场授权后处理 LaunchAgent 并让 Windows 侧重跑 formal preflight。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：Mac 恢复总览摘要显式输出安全前台启动标签。
完成内容：
- `check-mac-resume-status --boardSummary` 离线和在线路径都新增 `MacHostSafeStart=`，复用现有 `commands.macHostSafeStartCommand`。
- 离线摘要保留说明“先用 MacHostSafeStart 启动正式 host，再做 Windows E2E”，同时 `MacHostSafeStart=` 会保留当前 `--port <端口>`。
- 普通输出新增 `Mac host safe start` 下一步行，便于不用 JSON/boardSummary 时也能直接复制。
修改文件：
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-resume-status.mjs`
- `node --check scripts/mac/test-mac-resume-status.mjs`
- `node scripts/mac/test-mac-resume-status.mjs --timeoutMs 30000`
- `node scripts/mac/check-mac-resume-status.mjs --host 127.0.0.1 --port 43888 --checkBoard --boardSummary`（确认一行摘要包含 `MacHostSafeStart=` 且保留 `--port 43888`）
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/mac/check-mac-resume-status.mjs scripts/mac/test-mac-resume-status.mjs docs/HANDOFF_LOG.md docs/ACTIVE_LOCKS.md docs/04-task-board.md`
遗留问题：
- 本轮只补恢复总览里的结构化安全启动标签；没有实际启动、写入或加载 LaunchAgent。
下一步建议：
- 后续若要消除真实 Mac host `maxScreenFps=30`，仍需现场授权后走 LaunchAgent 写入/加载/重启，再让 Windows 侧复跑双门禁 formal preflight。
是否改了协议：否。
是否需要另一端配合：暂不需要；后续真实 60Hz 复验需要 Windows 端跑只读检查。

## 2026-06-18 Mac Codex

日期：2026-06-18 继续推进
开发端：Mac Codex
本轮目标：Mac 值守检查摘要补齐安全前台启动入口。
完成内容：
- `check-mac-unattended-status` 的 JSON `commands` 新增 `macHostSafeStart`，命令为 `node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port <当前端口>`。
- `--boardSummary` 在 `MacUnattendedStatus=` 后新增 `MacHostSafeStart=`，让 LaunchAgent 缺失、host 离线或 60Hz 值守门禁失败时，同一行摘要就能复制安全启动命令。
- 普通输出也会显示 `Mac host safe start`；该入口只提示本机前台隐藏密码输入，不把密码放到 argv，不发送 input/inject，不改协议。
修改文件：
- `scripts/mac/check-mac-unattended-status.mjs`
- `scripts/mac/test-mac-unattended-status.mjs`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-unattended-status.mjs`
- `node --check scripts/mac/test-mac-unattended-status.mjs`
- `node scripts/mac/test-mac-unattended-status.mjs --timeoutMs 30000`
- `node scripts/mac/check-mac-unattended-status.mjs --host 127.0.0.1 --port 43888 --skipLaunchctl --skipPmset --boardSummary`（确认一行摘要包含 `MacHostSafeStart=` 且保留 `--port 43888`）
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/mac/check-mac-unattended-status.mjs scripts/mac/test-mac-unattended-status.mjs docs/HANDOFF_LOG.md docs/ACTIVE_LOCKS.md docs/04-task-board.md`
遗留问题：
- 本轮只补状态/摘要里的安全启动入口；没有实际写入或加载 LaunchAgent，也没有重启 Mac host。
下一步建议：
- 真正消除 Windows formal 60Hz 预检里的 `maxScreenFps=30` / LaunchAgent loaded blocker，仍需用户现场允许后由 Mac 端运行 LaunchAgent 规划、加载并重启 host，再让 Windows 侧复跑 discovery / resume / formal preflight。
是否改了协议：否。
是否需要另一端配合：暂不需要；后续真实 60Hz 值守复验需要 Windows 端按最新摘要复跑只读检查。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows 侧消费 Mac `MacHostSafeStart=` 安全启动提示。
完成内容：
- `watch-codex-link-mac-alerts.ps1` 识别带非空 readiness finding 的 `MacHostSafeStart=` 场景；`warnings=none blockers=none` 时不会误弹。
- Windows 控制端 Mac 提醒区、快速摘要和复制/导出诊断现在会把 `MacHostSafeStart=` 翻译为“Mac host 安全启动命令已提供”，并保留原始命令文本。
- 修正 `ready with warnings: blockers: none warnings: ...` 被误解析出 `blockers` 风险词的噪音。
- Windows 控制端 README、当前状态、下一步和任务板已同步该行为。
修改文件：
- `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
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
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- PowerShell AST parse: `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary`
遗留问题：
- 本轮只让 Windows 侧显示和传播 Mac 安全启动提示；真正启动或重启 Mac host 仍由 Mac 端按 `MacHostSafeStart=` 命令执行。
下一步建议：
- Mac 端若 readiness 报 host 离线或 blocker，可直接把带 `MacHostSafeStart=` 的 boardSummary 发上板；Windows 端会在提醒区和复制诊断里显示“Mac host 安全启动命令已提供”，再由 Mac 端执行安全启动。
是否改了协议：否。
是否需要另一端配合：暂不需要；Mac 端后续实际离线/重启场景可自然验证该提示。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows 侧生成的 `MacUnattendedFormal=` 对齐 Mac 最新双门禁。
完成内容：
- `check-mac-formal-e2e` 的 `fpsLimit.macUnattendedFormalCommand` 现在同时带 `--requireLaunchAgentMaxFps` 和 `--requireLaunchAgentLoaded`。
- `discover-lan-hosts` 的 JSON、普通输出和 `--boardSummary` 的 `MacUnattendedFormal=` 同步改为 max FPS + LaunchAgent loaded 双门禁。
- `check-windows-resume-status` 的 JSON、普通输出、`--boardSummary` 与 PowerShell wrapper help 同步改为双门禁。
- Windows 控制端 README、当前状态、下一步和任务板已把旧的单 max FPS 校验说明更新为双门禁。
- 真实 Mac 无密预检确认当前 host 仍上报 `maxScreenFps=30`，但 formal preflight、discovery 和 resume status 均已输出双门禁命令；没有认证、不发密码、不发送 input/inject。
修改文件：
- `scripts/windows/check-mac-formal-e2e.mjs`
- `scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `scripts/windows/discover-lan-hosts.mjs`
- `scripts/windows/discover-lan-hosts.ps1`
- `scripts/windows/test-discover-lan-hosts.mjs`
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-mac-formal-e2e.mjs`
- `node --check scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `node --check scripts/windows/discover-lan-hosts.mjs`
- `node --check scripts/windows/test-discover-lan-hosts.mjs`
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- `node scripts/windows/test-mac-formal-e2e-preflight.mjs --timeoutMs 30000`
- `node scripts/windows/test-discover-lan-hosts.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-script-help.mjs --script check-mac-formal-e2e.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-script-help.mjs --script discover-lan-hosts.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-resume-status.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary`
- `node scripts/windows/check-mac-formal-e2e.mjs --discover --discoverNoLocalSubnets --host 192.168.31.122 --port 43770 --preflightOnly --checkClientDiagnostics --boardSummary --timeoutMs 45000 --clientPort 5301 --debugPort 9441 --progressIntervalMs 5000`
- `node scripts/windows/discover-lan-hosts.mjs --noLocalSubnets --host 192.168.31.122 --port 43770 --requireMacHost --boardSummary --timeoutMs 1200`
- `node scripts/windows/check-windows-resume-status.mjs --discoverNoLocalSubnets --host 192.168.31.122 --port 43770 --boardSummary --clientPort 5302 --debugPort 9442`
遗留问题：
- 当前真实 Mac host 仍上报 `maxScreenFps=30`；要让 60Hz formal gate 通过，还需要 Mac 端实际写入并加载 LaunchAgent 后重启/复验。
下一步建议：
- Mac 端处理 LaunchAgent 后，Windows 侧先跑 discovery / resume / formal preflight 的 `--boardSummary`，确认 `MacUnattendedFormal=` 对应命令不再报 max FPS 或 loaded blocker，再做正式带密码长测。
是否改了协议：否。
是否需要另一端配合：需要 Mac 端后续实际加载 LaunchAgent 后复验；本轮 Windows 侧已完成命令和文档对齐。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows host `--status` 离线安全启动建议保留当前 host/port。
完成内容：
- `start-windows-host --status` 的离线 JSON 新增 `safeStartCommand` 与 `ephemeralStartCommand`，两者都会显式带当前 `--host <host>` / `--port <port>`。
- 普通输出的 `Start safely with:` 和 `--boardSummary` 的 `start safely with ...` 改用同一条安全启动命令，避免自定义端口现场复制后退回默认 `43770`。
- 离线建议仍不启动 Windows host、不认证、不要求或打印密码、不发送 input/inject；临时冒烟命令仅额外带 `--skipFirewallCheck`。
- Windows host README、当前状态、下一步和任务板已同步该行为。
修改文件：
- `scripts/windows/start-windows-host.mjs`
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
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --script start-windows-host.mjs --timeoutMs 10000`
- `node scripts/windows/start-windows-host.mjs --status --host 127.0.0.1 --port 43888 --boardSummary`（预期离线失败，但摘要保留 `--port 43888`）
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows docs apps/windows-host`
遗留问题：
- 本轮只补 Windows host 状态入口的离线启动建议；真正 Mac 反控 Windows 真连仍需 Windows host 在线后继续跑 readiness/formal smoke。
下一步建议：
- Mac 端若发现 Windows host 离线，可直接复制 `start-windows-host --status --boardSummary` 里的 `start safely with ...`；自定义端口场景不需要手工改命令。
是否改了协议：否。
是否需要另一端配合：暂无；这是 Windows-only 状态/文档收口。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows formal E2E 预检直接输出 Mac unattended formal 60Hz 强校验入口。
完成内容：
- `check-mac-formal-e2e` 的 `fpsLimit` JSON 新增 `macUnattendedFormalCommand`，命令为 `node scripts/mac/check-mac-unattended-status.mjs --host <Mac> --port <port> --requireLaunchAgentMaxFps --requireLaunchAgentLoaded --boardSummary`。
- 当正式请求刷新率高于 Mac host `maxScreenFps` 时，`--boardSummary` 会在 `MacMaxFpsPlan=` 后继续输出 `MacUnattendedFormal=`，提示 Mac 端写入/重启后如何只读强校验 LaunchAgent max FPS / loaded blocker。
- `--userAuthRequest` / `--sendUserAuthRequest` 的 `NEED_USER_AUTH` 刷新率提示也会带同一条强校验命令；仍不包含密码、不带 `--write`、不执行 `launchctl`、不发送 input/inject。
- formal preflight mock client diagnostics 回归改用临时 `clientPort` / `debugPort`，避免本机默认 `5197/9337` 旧诊断残留导致误报。
修改文件：
- `scripts/windows/check-mac-formal-e2e.mjs`
- `scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-mac-formal-e2e.mjs`
- `node --check scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `node scripts/windows/test-mac-formal-e2e-preflight.mjs --timeoutMs 30000`
- `node scripts/windows/check-mac-formal-e2e.mjs --discover --discoverNoLocalSubnets --host 192.168.31.122 --port 43770 --preflightOnly --checkClientDiagnostics --boardSummary --progressIntervalMs 10000 --timeoutMs 45000`（真实只读摘要已输出 `MacMaxFpsPlan=` 和 `MacUnattendedFormal=`；当前 Mac host 仍上报 `maxScreenFps=30`）
遗留问题：
- 本轮只补 Windows formal preflight 的提示链路；真正让强校验通过仍需要 Mac 端写入/加载 LaunchAgent maxScreenFps 并重启 host。
下一步建议：
- Mac 端处理 LaunchAgent 后，Windows 侧重跑 formal preflight `--boardSummary`，确认 `MacUnattendedFormal=` 对应命令不再报 blocker，随后再做正式长测。
是否改了协议：否。
是否需要另一端配合：暂不需要；消除 blocker 需要 Mac 端后续处理 LaunchAgent。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows LAN discovery 对齐 Mac unattended formal 60Hz 强校验入口。
完成内容：
- `discover-lan-hosts` 的 `macFormalE2e` JSON 新增 `macUnattendedFormalCommand`，命令为 `node scripts/mac/check-mac-unattended-status.mjs --host <Mac> --port <port> --requireLaunchAgentMaxFps --requireLaunchAgentLoaded --boardSummary`。
- `discover-lan-hosts --boardSummary` 和普通输出在发现 Mac host 后新增 `MacUnattendedFormal=`，让发现层就能提示正式 60Hz LaunchAgent max FPS + loaded 门禁。
- PowerShell wrapper `discover-lan-hosts.ps1 -Help` 同步说明 `MacUnattendedFormal=`；发现脚本 Node/PowerShell JSON 和 boardSummary 回归均覆盖新字段。
修改文件：
- `scripts/windows/discover-lan-hosts.mjs`
- `scripts/windows/discover-lan-hosts.ps1`
- `scripts/windows/test-discover-lan-hosts.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/discover-lan-hosts.mjs`
- `node --check scripts/windows/test-discover-lan-hosts.mjs`
- `node scripts/windows/test-discover-lan-hosts.mjs --timeoutMs 30000`
- `node scripts/windows/discover-lan-hosts.mjs --noLocalSubnets --host 192.168.31.122 --port 43770 --requireMacHost --boardSummary --timeoutMs 1200`（真实只读发现已输出 `MacUnattendedFormal=`；当前 Mac host 仍上报 `maxScreenFps=30`）
- `node scripts/windows/test-windows-script-help.mjs --script discover-lan-hosts.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary`
- 附带复核正式 E2E 第二步：`node --check scripts/windows/check-mac-formal-e2e.mjs`、`node --check scripts/windows/test-mac-formal-e2e-preflight.mjs`、`node scripts/windows/test-mac-formal-e2e-preflight.mjs --timeoutMs 30000`、`node scripts/windows/check-mac-formal-e2e.mjs --discover --discoverNoLocalSubnets --host 192.168.31.122 --port 43770 --preflightOnly --checkClientDiagnostics --boardSummary --progressIntervalMs 10000 --timeoutMs 45000`
遗留问题：
- 本轮只在 Windows discovery 层暴露 Mac formal 60Hz 值守门禁命令；真正消除 `launch-agent-missing` blocker 仍需 Mac 端实际写入/加载 LaunchAgent maxScreenFps 并重启 host。
下一步建议：
- Mac 端处理 LaunchAgent 后，Windows 侧先跑 discovery `--boardSummary`，再跑恢复总览或 formal preflight，确认 `MacUnattendedFormal=` 对应命令不再报 blocker。
是否改了协议：否。
是否需要另一端配合：暂不需要；消除 blocker 需要 Mac 端后续处理 LaunchAgent。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows 恢复总览对齐 Mac unattended formal 60Hz 强校验。
完成内容：
- `check-windows-resume-status` 的 JSON、普通输出和 `--boardSummary` 新增 `MacUnattendedFormal=node scripts/mac/check-mac-unattended-status.mjs --host <Mac> --port <port> --requireLaunchAgentMaxFps --requireLaunchAgentLoaded --boardSummary`。
- PowerShell 包装入口 `check-windows-resume-status.ps1 -Help` 补充 formal 60Hz Mac-side unattended gate 说明。
- Node 与 PowerShell 恢复总览回归覆盖新字段、boardSummary 标签和 `--requireLaunchAgentMaxFps` 参数，确保命令无密、只读、不认证、不发送 input/inject。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- 合入 Mac 最新 `4b2d9ed` 后复跑：`node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- 合入 Mac 最新 `4b2d9ed` 后复跑：`node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary`
- `node scripts/windows/check-windows-resume-status.mjs --checkBoard --boardSummary`（真实只读摘要已包含 `MacUnattendedFormal=`；当前本地未提交所以摘要显示 `repo=dirty(9)`，符合预期）
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows docs`（无匹配）
遗留问题：
- 本轮只暴露正式值守强校验命令；真正让 `--requireLaunchAgentMaxFps` 通过仍需要 Mac 端写入/加载 LaunchAgent maxScreenFps 并重启 host。
下一步建议：
- Mac 端处理 LaunchAgent 后，Windows 侧优先跑 `check-windows-resume-status --checkBoard --boardSummary`，看 `MacUnattendedFormal=` 对应命令是否不再报 blocker。
是否改了协议：否。
是否需要另一端配合：暂不需要；消除 blocker 需要 Mac 端后续实际处理 LaunchAgent。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows 侧消费 Mac unattended 新增 `launch-agent-max-fps` 摘要。
完成内容：
- Windows 控制端 Mac 值守风险中文映射新增 `launch-agent-max-fps` / `launch-agent-max-screen-fps`，Mac 提醒区和复制/导出诊断会把 `launch-agent-max-fps` 显示为“LaunchAgent 刷新率上限需调整”。
- `test-mac-alert-watcher` 的 Mac unattended fake 摘要对齐 Mac 最新真实格式：`warnings=launch-agent-missing,launch-agent-not-loaded,launch-agent-max-fps,power-risk`，确认 watcher 保留该短标签证据。
- 页面 diagnostics-only 回归把 `launch-agent-max-fps` 加入 watcher 假状态，确认 Mac 提醒详情和复制文本保留原始短标签，中文风险里显示 LaunchAgent 刷新率上限提示。
修改文件：
- `scripts/windows/test-mac-alert-watcher.mjs`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5225 --debugPort 9365 --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --clientPort 5226 --debugPort 9366 --timeoutMs 45000`
- 合入 Mac 最新 `6082a12` 后复跑：`node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --clientPort 5227 --debugPort 9367 --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --script test-mac-alert-watcher.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows apps/windows-client docs`（无匹配）
遗留问题：
- 本轮只增强 Windows 侧提醒和中文风险可见性；不认证真实 WebSocket、不请求密码、不发送 input/inject。
下一步建议：
- Mac 端实际写入/加载 LaunchAgent maxScreenFps=60 并重启 host 后，Windows 端再复跑值守/status 摘要，确认 `warnings=launch-agent-max-fps` 消失。
是否改了协议：否。
是否需要另一端配合：暂不需要；真正消除 warning 需要 Mac 端调整 LaunchAgent 并加载/重启 host。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows 侧消费 Mac host readiness 新增 `mac-host-max-fps` 摘要。
完成内容：
- Windows 控制端 Mac 值守风险中文映射新增 `mac-host-max-fps` / `mac-host-max-screen-fps`，Mac 提醒区和复制/导出诊断会把 `mac-host-max-fps` 显示为“Mac host 刷新率上限需调整”。
- `test-mac-alert-watcher` 的 Mac host readiness fake 摘要对齐 Mac 最新真实格式：`warnings=mac-host-discovery,agent-link-board-currentcall,mac-host-max-fps`，确认 watcher 保留该短标签证据。
- 页面 diagnostics-only 回归把 `mac-host-max-fps` 加入 watcher 假状态，确认 Mac 提醒详情和复制文本保留原始短标签，中文风险里仍有刷新率上限提示。
修改文件：
- `scripts/windows/test-mac-alert-watcher.mjs`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5219 --debugPort 9359 --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --clientPort 5220 --debugPort 9360 --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --script test-mac-alert-watcher.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows apps/windows-client docs`（无命中）
遗留问题：
- 本轮只增强 Windows 侧提醒和中文风险可见性；不认证真实 WebSocket、不请求密码、不发送 input/inject。
下一步建议：
- Mac 端实际把 host max FPS 调到 60 并重启后，Windows 端再复跑无密 preflight 和页面真连，确认 `warnings=mac-host-max-fps` 消失且 `/discovery.capabilities.maxScreenFps=60`。
是否改了协议：否。
是否需要另一端配合：暂不需要；真正消除 warning 需要 Mac 端调整 host 上限并重启。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows 侧消费 Mac `fps-limit` 摘要。
完成内容：
- Windows Mac 提醒 watcher 显式识别 `MacResumeStatus`、`Mac resume status` 和 `check-mac-resume-status` 摘要里的非空 `warnings=` / `blockers=`，覆盖 `warnings=h264-fallback,fps-limit` 与 `MacMaxFpsPlan=`，并确认 `warnings=none blockers=none` 不误提醒。
- Windows 控制端 Mac 值守风险中文映射新增 `fps-limit` / `max-fps` / `max-screen-fps`，Mac 提醒区和复制/导出诊断会把 `fps-limit` 显示为“Mac 刷新率上限需调整”。
- 页面 diagnostics-only 回归把 Mac resume findings 加入 watcher 假状态，确认 Mac 提醒面板、快速摘要、Mac 值守详情、Mac 提醒详情和复制文本都保留中文风险与原始短标签证据。
修改文件：
- `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- PowerShell AST 解析 `scripts/windows/watch-codex-link-mac-alerts.ps1`
- PowerShell 7 AST 解析 `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5217 --debugPort 9357 --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --clientPort 5218 --debugPort 9358 --timeoutMs 45000`
- `node scripts/windows/test-windows-powershell-help.mjs --script watch-codex-link-mac-alerts.ps1 --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --script watch-codex-link-mac-alerts.ps1 --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-script-help.mjs --script test-mac-alert-watcher.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows apps/windows-client docs`（无命中）
遗留问题：
- 本轮只增强 Windows 侧提醒和中文风险可见性；不认证真实 WebSocket、不请求密码、不发送 input/inject。
下一步建议：
- Mac 端如果按 `MacMaxFpsPlan` 真正调整 LaunchAgent/host 上限并重启，Windows 端再跑正式预检或真实页面连接确认 `maxScreenFps=60`，再判断 60Hz 观感。
是否改了协议：否。
是否需要另一端配合：暂不需要；真正提高刷新率上限需要 Mac 端执行/重启 host。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows 侧对齐 Mac formal smoke `preflight blockers=` / `warnings=` 明细。
完成内容：
- Windows Mac 提醒 watcher 显式识别 `MacClientFormalSmoke`、`Mac client formal smoke` 和 `run-mac-client-formal-smoke` 摘要里的非空 `warnings=` / `blockers=`，并确认 `warnings=none blockers=none` 不误提醒。
- Windows 控制端 Mac 值守风险中文映射新增 `board` / `agent-link-board`，Mac 提醒区和复制/导出诊断会把 Mac formal smoke 的 `warnings=board` 显示为“联络板状态需检查”。
- 页面 diagnostics-only 回归把 Mac formal smoke findings 加入 watcher 假状态，确认 Mac 提醒面板、快速摘要、Mac 值守详情和 Mac 提醒详情都保留中文风险与原始短标签证据。
修改文件：
- `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- PowerShell AST 解析 `scripts/windows/watch-codex-link-mac-alerts.ps1`
- PowerShell 7 AST 解析 `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5209 --debugPort 9349 --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --clientPort 5210 --debugPort 9350 --timeoutMs 45000`
- `node scripts/windows/test-windows-powershell-help.mjs --script watch-codex-link-mac-alerts.ps1 --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --script watch-codex-link-mac-alerts.ps1 --timeoutMs 10000 --boardSummary`
遗留问题：
- 本轮只增强 Windows 侧提醒和中文风险可见性；不认证真实 WebSocket、不请求密码、不发送 input/inject。
下一步建议：
- Mac 端后续新增 formal smoke 短标签时，Windows 侧继续补中文映射；如果是真实 ready with warning，Windows watcher 应继续弹窗/日志提示。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：Windows 侧对齐 Mac 最新 host readiness `blockers=` / `warnings=` 明细。
完成内容：
- Windows Mac 提醒 watcher 显式识别 `MacHostReadiness`、`Mac host readiness` 和 `check-mac-host-readiness` 摘要里的非空 `warnings=` / `blockers=`，`warnings=none blockers=none` 仍不提醒。
- Windows 控制端 Mac 值守风险中文映射新增 `mac-host-discovery`、`mac-host-media-aggregate`、`agent-link-board-currentcall`、Mac host build/helper/runtime/display 等短标签，Mac 提醒区和复制/导出诊断会显示“Mac host 发现需检查”“联络板当前呼叫需协调”等中文风险。
- 页面 diagnostics-only 回归把 Mac host readiness findings 加入 watcher 假状态，确认 Mac 提醒面板、快速摘要、Mac 值守详情和 Mac 提醒详情都保留中文风险与原始短标签证据。
修改文件：
- `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- PowerShell AST 解析 `scripts/windows/watch-codex-link-mac-alerts.ps1`
- PowerShell 7 AST 解析 `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5207 --debugPort 9347 --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --clientPort 5208 --debugPort 9348 --timeoutMs 45000`
- `node scripts/windows/test-windows-powershell-help.mjs --script watch-codex-link-mac-alerts.ps1 --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --script watch-codex-link-mac-alerts.ps1 --timeoutMs 10000 --boardSummary`
遗留问题：
- 本轮只增强 Windows 侧提醒和中文风险可见性；不认证真实 WebSocket、不请求密码、不发送 input/inject。
下一步建议：
- Mac 端继续保持 readiness/formal 摘要使用稳定短标签；Windows 侧后续可继续把新增短标签纳入中文映射。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：复核正式 E2E 第二步，并把 Mac findings 中文风险直接前置到 Windows 控制端“Mac 提醒”面板。
完成内容：
- 重新复核真实 Mac `192.168.31.122:43770`：无密 formal preflight ready，Mac 端权限/H.264/系统 PCM/文本与文件剪贴板/inputMode=log 均通过；干净备用端口 `5202/9342` 的 Windows client diagnostics-only 通过。
- 确认当前 `5200/9340` 里仍有旧 diagnostics 残留，恢复总览会显示 `WinClientPorts=occupied(...;stale-diagnostics)` 并给出备用端口命令；未自动结束现场进程。
- Windows 控制端“本机被控 -> Mac 提醒”状态行现在会读取 watcher `recentAlerts` / `lastAlert` / message 里的 `warnings=`、`warnings:`、`blockers=`、`blockers:`，直接显示“风险：视频链路需检查、运行版本需检查、认证/密码步骤待确认、Windows 被控端未指定或未就绪、仓库状态需检查”等中文摘要。
- 页面 diagnostics-only 回归新增 Mac 提醒面板风险摘要断言；复制/导出诊断的中文风险逻辑保持复用同一套解析。
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
- `node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --preflightOnly --checkClientDiagnostics --clientPort 5200 --debugPort 9340 --timeoutMs 45000 --progressIntervalMs 5000 --boardSummary`
- `node scripts/windows/test-windows-client-browser.mjs --host 192.168.31.122 --port 43770 --clientPort 5202 --debugPort 9342 --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5203 --debugPort 9343 --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --clientPort 5204 --debugPort 9344 --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-client-browser.mjs --timeoutMs 10000`
- `node scripts/windows/check-windows-resume-status.mjs --host 192.168.31.122 --port 43770 --clientPort 5200 --debugPort 9340 --alternateClientPort 5202 --alternateDebugPort 9342 --boardSummary --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps/windows-client scripts/windows docs`
遗留问题：
- 完整认证第二步仍需要用户现场输入 Mac host 密码；当前会话没有可用 `LAN_DUAL_PASSWORD`，本轮没有代跑需要密码的正式 WebSocket 验收。
- Mac 当前 `maxScreenFps=30`，请求 60Hz 时仍会按远端上限运行；要提升体验需 Mac 端调整上限并重启 host 后再测。
下一步建议：
- 如果现场再次看到第二步“卡住”，先看 `Starting plan 1/2` / `Starting plan 2/2` 和进度心跳；默认端口残留时优先换 `5202/9342` 或先手动清理旧诊断进程。
是否改了协议：否。
是否需要另一端配合：完整正式第二步需要用户现场输入密码；提高 60Hz 上限需要 Mac 端重启 host。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控 Mac 复制/导出诊断把 Mac formal findings 短标签翻译成中文风险。
完成内容：
- Windows 控制端 Mac 值守风险解析现在同时支持 `warnings=` / `blockers=` 和 `warnings:` / `blockers:`。
- 风险短标签映射新增 `video`、`build`、`auth`、`windows-host`、`repo`、`h264-fallback`、`stale-build`、`stale-metadata` 等，复制/导出诊断会显示“视频链路需检查”“运行版本需检查”“认证/密码步骤待确认”“Windows 被控端未指定或未就绪”“仓库状态需检查”等中文原因。
- 页面 diagnostics-only 回归新增 Mac formal findings 场景，确认快速摘要、Mac 值守分段、Mac 提醒详情和复制文本都保留中文风险与原始短标签证据。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5200 --debugPort 9340 --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --clientPort 5200 --debugPort 9340 --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-client-browser.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps/windows-client scripts/windows docs`
遗留问题：
- 本轮只扩展 Windows 控制端复制/导出诊断翻译；不改协议，不启动真实远控，不认证，不发送 input/inject。
下一步建议：
- 后续可把这些中文风险也显示到控制端“Mac 提醒”可视区域，而不只是在复制/导出的诊断文本里出现。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：让 Windows 本机 Mac 提醒 watcher 对齐 Mac 最新 `blockers=` / `warnings=` 明细摘要。
完成内容：
- `watch-codex-link-mac-alerts.ps1` 把 warning/blocker 字段匹配升级为同时支持 `warnings=` / `blockers=` 和 `warnings:` / `blockers:`。
- watcher 新增 Mac client readiness/formal 与 formal E2E status 的显式触发规则；`warnings=windows-host`、`warnings=video,build,auth`、`ready with warnings` 等会进入 Windows 本机提醒链路，`warnings=none blockers=none` 仍不提醒。
- `test-mac-alert-watcher.mjs` 新增 fake Agent Link Board 回归，覆盖 Mac client/formal findings 提醒和 clean findings 防噪音。
修改文件：
- `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- Windows PowerShell AST 解析 `scripts/windows/watch-codex-link-mac-alerts.ps1`
- PowerShell 7 AST 解析 `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-powershell-help.mjs --script watch-codex-link-mac-alerts.ps1 --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --script watch-codex-link-mac-alerts.ps1 --timeoutMs 10000 --boardSummary`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows docs`
遗留问题：
- 本轮只增强 Windows watcher 识别和回归；不启动正式后台 watcher，不触发真实系统弹窗。
下一步建议：
- Mac 端继续把 readiness/formal/final E2E 的 boardSummary 保持为稳定短标签；Windows 控制端复制诊断可后续把 `video/build/auth/windows-host` 进一步翻译成更细中文风险。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续收口
开发端：Windows Codex
本轮目标：让 Windows 恢复总览 PowerShell wrapper 也能直接绕开第二步默认诊断端口残留，对齐 Node 入口的 `WinClientPorts` 能力。
完成内容：
- `check-windows-resume-status.ps1` 新增 `-ClientPort`、`-DebugPort`、`-AlternateClientPort`、`-AlternateDebugPort`，并传给 Node 恢复总览。
- PowerShell wrapper 帮助新增备用端口示例：`-ClientPort 5200 -DebugPort 9340`，并说明 `WinClientDiagnosticsAlt` 用于默认 `5197/9337` 被旧诊断残留占用时复查。
- PowerShell 回归新增 custom ports/fake stale diagnostics 场景，确认 `WinClientPorts=occupied(5200,9340;stale-diagnostics)`、`WinClientPortsNext=use --clientPort 5201 --debugPort 9341`、formal preflight 命令和诊断命令都收到端口参数。
修改文件：
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- Windows PowerShell AST 解析 `scripts/windows/check-windows-resume-status.ps1`
- PowerShell 7 AST 解析 `scripts/windows/check-windows-resume-status.ps1`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 60000`
- `node scripts/windows/test-windows-powershell-help.mjs --script check-windows-resume-status.ps1 --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --script check-windows-resume-status.ps1 --timeoutMs 10000 --boardSummary`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-resume-status.ps1 -DiscoverNoLocalSubnets -HostName 192.168.31.122 -Port 43770 -CheckClientDiagnostics -ClientPort 5200 -DebugPort 9340 -BoardSummary -TimeoutMs 45000`
- `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-resume-status.ps1 -DiscoverNoLocalSubnets -HostName 192.168.31.122 -Port 43770 -CheckClientDiagnostics -ClientPort 5200 -DebugPort 9340 -BoardSummary -TimeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows docs`
遗留问题：
- 本轮仍不自动结束旧诊断进程；只提供 PowerShell/Node 备用端口绕行和明确提示。
下一步建议：
- 以后现场如果 `WinClientPorts=occupied(...;stale-diagnostics)`，PowerShell 入口优先跑 `check-windows-resume-status.ps1 -DiscoverNoLocalSubnets -HostName 192.168.31.122 -Port 43770 -CheckClientDiagnostics -ClientPort 5200 -DebugPort 9340 -BoardSummary`。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-18 Windows Codex

日期：2026-06-18 现场复核
开发端：Windows Codex
本轮目标：重新检查正式验收第二步卡住现象，并把 Windows 控制端诊断默认端口占用提示固化进恢复总览。
完成内容：
- 现场复核确认 `192.168.31.122:43770` 无密 preflight ready，Windows client diagnostics 用备用端口 `5200/9340` 通过；默认 `5197/9337` 当前被旧 `apps/windows-client/server.mjs` 和 Edge 调试进程占用。
- `check-windows-resume-status` 新增只读端口占用检查，JSON 输出 `windowsClientDiagnosticsPorts`，普通输出和 `--boardSummary` 输出 `WinClientPorts=` / `WinClientPortsNext=`。
- `WinClientDiagnostics=` / PowerShell 等价命令现在显式写出默认 `--clientPort 5197 --debugPort 9337`；默认端口被占时，报告会同时给出 `WinClientDiagnosticsAlt=` / `WinClientDiagnosticsAltPs=`，推荐 `5200/9340` 备用端口。
- 新增 fake 端口占用回归，覆盖 `occupied(...;stale-diagnostics)` 摘要、不泄密和备用命令。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --preflightOnly --checkClientDiagnostics --clientPort 5200 --debugPort 9340 --timeoutMs 45000 --requireH264 --boardSummary`
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 60000`
- `node scripts/windows/check-windows-resume-status.mjs --discoverNoLocalSubnets --host 192.168.31.122 --port 43770 --boardSummary --timeoutMs 45000`
- `node scripts/windows/check-windows-resume-status.mjs --discoverNoLocalSubnets --host 192.168.31.122 --port 43770 --checkClientDiagnostics --clientPort 5200 --debugPort 9340 --boardSummary --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-resume-status.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows docs`
遗留问题：
- 本轮只提示端口占用，不自动杀旧进程；如要释放默认端口，需要用户确认后手动关闭旧诊断窗口或进程。
下一步建议：
- 现场再跑完整正式第二步时，如果默认端口仍占用，先加 `--clientPort 5200 --debugPort 9340` 或 PowerShell `-ClientPort 5200 -DebugPort 9340`。
是否改了协议：否。
是否需要另一端配合：否；Mac 端无需同步代码。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：让正式 Mac E2E 预检直接解释远端 FPS 上限截断，并给出 Mac 端安全 dry-run 提升上限建议，避免把请求 60Hz 但远端 30Hz 误判成 Windows 第二步卡住。
完成内容：
- `check-mac-formal-e2e` 的预检报告新增 `fpsLimit` 字段，记录 `requestedFps`、`maxScreenFps`、`limited` 和无密 `macMaxFpsPlanCommand`。
- `--boardSummary` 现在会在真实 `maxScreenFps=30`、正式请求 60Hz 时输出 `FpsLimit requested=60Hz remoteMax=30Hz`，并给出 `MacMaxFpsPlan=node scripts/mac/install-mac-host-launch-agent.mjs --port 43770 --maxScreenFps 60 --boardSummary`。
- `--userAuthRequest` / `--sendUserAuthRequest` 的 `NEED_USER_AUTH` 文本会先提示“当前 Mac host 上限 30Hz，正式验收请求 60Hz 会按远端上限运行”，再提醒用户输入正式密码；不会把密码、`--write`、`launchctl` 或 `inject` 放进建议。
- 回归新增只读 fake discovery 场景，专门模拟 Mac 远端 30Hz 上限，锁定 JSON、通讯板摘要和授权提醒的 secret-free/dry-run 行为。
修改文件：
- `scripts/windows/check-mac-formal-e2e.mjs`
- `scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-mac-formal-e2e.mjs`
- `node --check scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `node scripts/windows/test-mac-formal-e2e-preflight.mjs --timeoutMs 45000`
- `node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --preflightOnly --boardSummary --timeoutMs 45000`
遗留问题：
- 本轮只解释和规划上限，不实际修改 Mac host 运行上限；真实 60Hz 仍需要 Mac 端 dry-run/写入 LaunchAgent 或启动参数并重启 host 后再做 H.264/音频/资源长稳。
下一步建议：
- Mac 端可按摘要里的 `MacMaxFpsPlan=` 先 dry-run LaunchAgent 参数，确认 `LAN_DUAL_MAX_SCREEN_FPS=60` 的写入/重启路径；Windows 端随后用同一正式预检和页面诊断复查是否不再被 30Hz 截断。
是否改了协议：否，消费已有 `maxScreenFps` 诊断字段并扩展 Windows 侧报告。
是否需要另一端配合：需要 Mac 端后续决定是否提高 host 上限并重启；本轮代码本身不需要 Mac 端同步改动。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：让 Windows 控制端明确显示 Mac host 远端 `maxScreenFps` 上限，避免用户请求 60/120Hz 时误判为 Windows 第二步卡住或控制端卡顿。
完成内容：
- Windows 控 Mac 页面现在会从 `/discovery.capabilities.maxScreenFps`、`session_answer.maxScreenFps`、`display_settings_ack.maxScreenFps` 和 `video_frame.maxScreenFps` 保存远端最高刷新率。
- 设备列表会显示在线 Mac 的“最高 30 Hz”；FPS 卡片、普通诊断条、全屏悬浮控制中心和复制/导出诊断都会显示“远端上限 30 Hz”。
- 低帧率提示更细：实收低于协商值时显示“低于协商 30 Hz”；远端上限低于用户请求时显示“远端上限 30 Hz”；没有远端上限且实收低于请求时仍显示“低于请求”。
- 页面 diagnostics-only 回归覆盖全屏浮层、普通诊断条和导出文本里的 `低于协商 30 Hz / 远端上限 30 Hz`。
- 真实 Mac `192.168.31.122:43770` 无密预检仍 ready，当前上报 `maxScreenFps=30`，验证本轮 UI 解释和现场事实一致。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5205 --debugPort 9345 --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --clientPort 5206 --debugPort 9346 --timeoutMs 45000`
- `node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --preflightOnly --boardSummary --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps/windows-client scripts/windows docs`
遗留问题：
- 本轮不改变 Mac host 实际采集上限；如果要让 Mac 真上 60Hz，需要后续在 Mac host 启动参数或 LaunchAgent 中调整 `LAN_DUAL_MAX_SCREEN_FPS` 并重新做性能/稳定性验收。
下一步建议：
- 下一轮可继续推进 Mac host LaunchAgent 配置里暴露 `maxScreenFps` dry-run/写入说明，或者做真实 Mac 60Hz 上限调整后的 H.264 长稳验收。
是否改了协议：否，消费已有可选诊断字段。
是否需要另一端配合：不需要；真正提高 Mac 端上限时需要 Mac 端重启 host 并配合观察性能。

## 2026-06-18 Windows Codex

日期：2026-06-18 现场复核与收口
开发端：Windows Codex
本轮目标：重新检查正式验收第二步现场卡住感，并让 Windows 桌面壳/控制端能看到 Mac 提醒 watcher 最近告警摘要。
完成内容：
- 重新复核真实 Mac host `192.168.31.122:43770`：无密正式预检 ready，H.264、系统 PCM、文本/文件剪贴板、三项权限和 `inputMode=log` 均正常；Windows client diagnostics-only 通过。
- 确认正式第二步 runPlan 现在包含 `--progressIntervalMs`，等待 H.264 canvas/FPS 时会周期性打印进度；完整认证第二步仍需用户现场输入 Mac host 密码后运行。
- `start-mac-alert-watcher.ps1 -Status -Json` 新增 `recentAlerts` / `lastAlert`，从 watcher stdout log 解析最近 `ALERT:`，并对 Token 做本地脱敏。
- Windows 控制端 Mac 提醒区在 watcher 运行时显示“最近提醒：...”，复制/导出诊断也能带出最近 Mac 授权/权限/值守提醒摘要。
- 回归覆盖 JSON 最近提醒解析、token 不泄露、页面 statusText 最近提醒显示。
修改文件：
- `scripts/windows/start-mac-alert-watcher.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
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
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- PowerShell AST parse `scripts/windows/start-mac-alert-watcher.ps1`
- `node scripts/windows/test-mac-formal-e2e-preflight.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --clientPort 5204 --debugPort 9344 --timeoutMs 45000 --progressIntervalMs 5000`
- `node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --preflightOnly --checkClientDiagnostics --boardSummary --timeoutMs 45000 --progressIntervalMs 5000`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --clientPort 5203 --debugPort 9343 --timeoutMs 45000`
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps/windows-client scripts/windows docs`
遗留问题：
- 本轮未认证真实 WebSocket、未请求或输入密码、未发送 input/inject；完整正式第二步仍需用户现场输入 Mac host 密码后复跑。
- 当前只是读取最近 watcher log 摘要，不改 Windows 浮窗弹出行为；如果 watcher 尚未产生 `ALERT:`，UI 不显示最近提醒。
下一步建议：
- 后续可在 Windows 桌面壳里加最近提醒列表/清除入口；Mac 侧继续把值守 warnings/blockers 稳定放入 status/readiness 摘要。
是否改了协议：否。
是否需要另一端配合：不需要；完整正式第二步需要用户现场输入密码。

## 2026-06-18 Windows Codex

日期：2026-06-18 现场复核
开发端：Windows Codex
本轮目标：重新检查正式验收“第二步”现场卡住感，并收口 Windows 控制端 Mac 值守风险诊断。
完成内容：
- 复核真实 Mac host `192.168.31.122:43770` 的无密预检：发现、H.264、系统 PCM、文本/文件剪贴板和 `inputMode=log` 均 ready；当前会话没有可用密码环境变量，所以未代跑需要认证的正式第二步。
- `check-mac-formal-e2e` 正式运行现在会在密码输入后明确打印 `Starting plan 1/2` / `Starting plan 2/2`，并说明 Plan 1 在 H.264 首帧确认后还会继续做长视频观察，再做音频观察；Plan 2 才是 Windows client 浏览器 H.264 canvas 检查。
- 修正 formal runPlan 的 Plan 1 预计耗时为视频观察 + 音频观察的顺序总时长，不再用二者最大值低估现场等待时间。
- `probe-mac-host` 的视频/音频观察尾段现在会在目标时间窗口末尾正常收口，避免已收到足够帧后因最后几十毫秒等不到下一帧被误判失败；真正长时间无帧仍按 `maxVideoGapMs` / `maxAudioGapMs` 失败。
- Windows 控 Mac 复制/导出诊断的 Mac 值守摘要现在可解析 `MacUnattendedStatus`、`warnings=`、`blockers=`，并把 `launch-agent-missing`、`power-risk` 等短标签翻译为中文风险，方便窗口最小化提醒链路和复制诊断串起来。
修改文件：
- `scripts/windows/probe-mac-host.mjs`
- `scripts/windows/check-mac-formal-e2e.mjs`
- `scripts/windows/test-mac-formal-e2e-preflight.mjs`
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
- `node --check scripts/windows/probe-mac-host.mjs`
- `node --check scripts/windows/check-mac-formal-e2e.mjs`
- `node --check scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `node scripts/windows/test-mac-formal-e2e-preflight.mjs --timeoutMs 45000`
- `node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --clientPort 5197 --debugPort 9337 --timeoutMs 45000 --preflightOnly --clientDiagnostics --progressIntervalMs 5000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps/windows-client scripts/windows docs`
遗留问题：
- 本轮未认证真实 WebSocket、未请求或输入密码、未发送 input/inject；完整正式第二步仍需用户现场输入 Mac host 密码后复跑。
- 桌面壳目前只暴露 watcher 状态，不暴露最新 watcher alert/log；控制端只有在状态/诊断文本已带 warnings/blockers 时才能翻译风险，后续可把 watcher 最近告警安全暴露给前端。
下一步建议：
- 现场复跑完整正式 E2E 时加 `--progressIntervalMs 5000`，看到 H.264 首帧后继续等 Plan 1 的视频观察进度；出现 `Starting plan 2/2` 后才判断浏览器页面第二步。
是否改了协议：否。
是否需要另一端配合：完整正式 E2E 仍需要用户现场输入密码；Mac 端后续可继续把值守 warnings/blockers 稳定放进 readiness/status 摘要。

## 2026-06-18 Windows Codex

日期：2026-06-18 继续推进
开发端：Windows Codex
本轮目标：让 Windows 本机 Mac 提醒 watcher 能识别 Mac 值守 warning/blocker，补齐“窗口最小化也能透传 Mac 值守问题”的提醒链路。
完成内容：
- `watch-codex-link-mac-alerts.ps1` 的紧急文本规则新增 `MacUnattendedStatus`、`Mac unattended status`、`MacLaunchAgentPlan`、`warnings=`、`blockers=`、LaunchAgent 缺失/未加载/禁用/失败、电源风险、睡眠不可达和 host 离线等 Mac 值守相关触发词。
- `test-mac-alert-watcher.mjs` 新增 Mac 值守 message 和 Mac status 两条假联络板回归，确认 Mac 端发布 `warnings=launch-agent-missing,...` 或 `MacUnattendedStatus=...` 时会触发 `ALERT:`，非 Mac 事件仍不会误触发；同时新增 `warnings=none blockers=none` 正常状态不提醒的防噪音回归。
- CURRENT_STATUS、NEXT_ACTIONS、任务板和 ACTIVE_LOCKS 已同步。
修改文件：
- `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 30000`
遗留问题：
- 本轮只增强 Windows watcher 识别规则，不安装或修改 Mac LaunchAgent，不认证真实 host，不发送密码/input/inject。
下一步建议：
- Mac 端后续把 LaunchAgent/电源/睡眠限制进一步产品化后，继续让 boardSummary 使用稳定短标签；Windows 侧可再把这些短标签接进控制端“Mac 值守”面板的明确状态。
是否改了协议：否。
是否需要另一端配合：不需要；后续真机值守验证需要 Mac 端继续上报真实 warnings/blockers。

## 2026-06-18 Windows Codex

日期：2026-06-18 现场复核
开发端：Windows Codex
本轮目标：复查用户现场正式 E2E “第二步”看似卡住的问题，并补齐第二步进度心跳透传。
完成内容：
- 只读复核真实 Mac host `192.168.31.122:43770`：发现成功，runtime build `d398d64`，H.264/系统 PCM/文字和文件剪贴板/inputMode=log/三项权限均 ready，Windows client diagnostics 通过；当前 Mac discovery 上报 `maxScreenFps=30`，所以正式连接即使请求 60Hz 也会协商到 30Hz。
- `check-mac-formal-e2e` 现在会把 `--progressIntervalMs` 透传给预检查里的客户端诊断和正式第二步 `test-windows-client-browser`，让第二步连接、H.264 canvas 和 FPS 诊断等待时也按同一频率输出页面快照。
- 回归新增断言，确保 runPlan 中第二步命令包含 `--progressIntervalMs`，避免后续又退化为静默等待。
修改文件：
- `scripts/windows/check-mac-formal-e2e.mjs`
- `scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-mac-formal-e2e.mjs`
- `node --check scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `node scripts/windows/test-mac-formal-e2e-preflight.mjs --timeoutMs 45000`
- `node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --preflightOnly --checkClientDiagnostics --boardSummary`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows docs`
遗留问题：
- 本轮没有认证真实 WebSocket、没有请求或输入密码、没有发送 input/inject；真实第二步 H.264 页面检查仍需用户现场输入 Mac host 密码后复跑。
- Mac host 当前能力摘要仍显示 `maxScreenFps=30`；60Hz/更高刷新率需要 Mac 端继续推进采集/编码上限，不是本轮 Windows 进度心跳修复能解决的。
下一步建议：
- 现场复跑完整正式 E2E 时可加 `--progressIntervalMs 5000`，如果看到第二步等待，就按快照判断卡在连接、H.264 canvas、FPS 诊断还是音频播放。
是否改了协议：否。
是否需要另一端配合：需要 Mac 端后续说明/提升 `maxScreenFps=30` 的采集上限；本轮进度透传无需 Mac 配合。

## 2026-06-18 Windows Codex

日期：2026-06-18 夜间
开发端：Windows Codex
本轮目标：把 Mac 值守检查入口接进 Windows 恢复总览，方便 Windows 开工第一屏同步 Mac LaunchAgent、自启动、电源和锁屏/睡眠限制摘要。
完成内容：
- `check-windows-resume-status` 的 JSON、普通输出和 `--boardSummary` 新增 `MacUnattended=node scripts/mac/check-mac-unattended-status.mjs --host <Mac host> --port <port> --boardSummary`。
- PowerShell 包装 `check-windows-resume-status.ps1 -Help` 同步说明该 Mac-side unattended/startup status command。
- Node 与 PowerShell resume 回归新增 JSON 字段、单行 boardSummary 和帮助文本断言，确认命令只作为无密只读摘要入口，不认证、不发密码、不发送 input/inject。
- CURRENT_STATUS、NEXT_ACTIONS、任务板和 ACTIVE_LOCKS 已同步。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 60000`
遗留问题：
- 本轮只接入命令入口，不在 Windows 侧直接执行 Mac LaunchAgent/pmset 检查；真实自启动、睡眠和锁屏可达性仍以 Mac 端 `check-mac-unattended-status` 结果为准。
下一步建议：
- Mac 端继续把 LaunchAgent 启停和 status 字段产品化；Windows 控制端后续可消费这些字段，把“等待 Mac 上报”升级为明确的在线/权限缺失/可能睡眠/需要授权提示。
是否改了协议：否。
是否需要另一端配合：后续需要 Mac 端继续推进值守状态字段；当前不阻塞。

## 2026-06-18 Windows Codex

日期：2026-06-18 夜间
开发端：Windows Codex
本轮目标：让 Windows 控 Mac 复制诊断快速摘要写出 Mac 值守/可远程推断，配合后续 Mac 自启、锁屏和休息场景产品化。
完成内容：
- 复制/导出的诊断报告快速摘要新增“Mac 值守”一行，基于 Windows 侧当前连接、设备发现、重连等待和 Mac 提醒 watcher 推断“当前可远程/恢复中/已发现/未发现”。
- “连接状态”分段新增 Mac 值守详情和说明，明确 LaunchAgent、自启动、锁屏/睡眠可达性仍等待 Mac status/readiness 上报，避免 Windows 侧提前承诺系统能力。
- 页面 diagnostics-only 自检在模拟断线等待态下断言导出文本和复制文本都包含 Mac 值守、提醒 watcher 和“自启/睡眠状态等待 Mac 上报”。
- Windows 控制端 README、当前状态、下一步和任务板已同步。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps\windows-client scripts\windows docs`
遗留问题：
- 夜间只做无授权页面自检，不连接真实 Mac、不认证、不发送密码/input/inject；Mac 自启动、睡眠、锁屏可达性还需要 Mac 端 status/readiness 输出真实字段后再接 UI。
下一步建议：
- Mac 端值守 status/readiness 一旦输出 LaunchAgent、睡眠风险和锁屏可达性字段，Windows 控制端可把当前“等待 Mac 上报”升级为明确的在线/权限缺失/可能睡眠/需要授权提示。
是否改了协议：否。
是否需要另一端配合：后续需要 Mac 端提供值守状态字段；当前不阻塞。

## 2026-06-18 Windows Codex

日期：2026-06-18 续跑
开发端：Windows Codex
本轮目标：让 Windows 控 Mac 复制诊断快速摘要直接写出 Mac 主机诊断/权限/runtime，方便第一屏定位看不到画面、权限缺失、旧 build 或 H.264 回退。
完成内容：
- 复制/导出的诊断报告快速摘要新增“Mac 主机”一行，复用页面已有主机诊断文字并压缩到一行。
- “连接状态”分段的“主机诊断”也改用同一份脱敏/压缩状态，避免过长诊断撑坏报告。
- 页面 diagnostics-only 自检模拟 Mac host runtime、辅助功能权限未开、H.264 回退和剪贴板能力，断言导出文本和复制文本都包含 Mac 主机摘要/主机诊断。
- Windows 控制端 README、当前状态、下一步和任务板已同步。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps\windows-client scripts\windows docs`
遗留问题：
- 夜间只做无授权页面自检，不连接真实 Mac、不认证、不发送密码/input/inject；真实权限缺失和旧 runtime 仍需现场真机状态确认。
下一步建议：
- 现场看不到画面或怀疑 Mac host 没重启时，先复制诊断，看快速摘要里的“Mac 主机”行是否显示权限未开、H.264 回退或旧 build。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Windows Codex

日期：2026-06-18 续跑
开发端：Windows Codex
本轮目标：让 Windows 控 Mac 复制诊断快速摘要直接写出独立剪贴板状态，方便定位文字、文件或压缩包复制问题。
完成内容：
- 复制/导出的诊断报告快速摘要新增“剪贴板”一行，复用全屏浮层同一套剪贴板状态口径。
- “显示与能力”分段新增“剪贴板状态”，记录关闭/待机、文字文件能力、远端文件接收进度、系统剪贴板写入结果或最近收到文件。
- 页面 diagnostics-only 自检模拟远端压缩包接收中状态，断言导出文本和复制文本都包含独立剪贴板摘要/状态。
- Windows 控制端 README、当前状态、下一步和任务板已同步。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps\windows-client scripts\windows docs`
遗留问题：
- 真实大文件/压缩包复制仍需后续用 Mac 真机做人工体验验收。
下一步建议：
- 白天继续真实 Mac 连接下复制文本、文件和压缩包，核对复制诊断里的“剪贴板”与“远端文件”是否和实际体验一致。
是否改了协议：否。
是否需要另一端配合：暂不需要；真机体验验收时需要 Mac host 在线。

## 2026-06-18 Windows Codex

日期：2026-06-18 夜间
开发端：Windows Codex
本轮目标：让 Windows 控 Mac 复制诊断快速摘要直接写出独立视频状态，方便定位卡顿、不是 60Hz 或 H.264/JPEG 回退。
完成内容：
- 复制/导出的诊断报告快速摘要新增“视频”一行，复用全屏浮层同一套视频状态口径。
- “显示与能力”分段新增“视频状态”，记录 H.264/JPEG、实收 FPS、协商/请求刷新率、低于请求、帧延迟或回退原因。
- 页面 diagnostics-only 的低 FPS 自检同时断言导出文本包含独立视频摘要和视频状态。
- Windows 控制端 README、当前状态、下一步、任务板和锁表已同步。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps\windows-client scripts\windows docs`
遗留问题：
- 夜间只做无授权页面自检，不连接真实 Mac、不认证、不发送密码/input/inject；真实卡顿和主观流畅度仍需用户在场时验收。
下一步建议：
- 现场觉得“远控太卡/没有 60Hz”时先复制诊断，看快速摘要里的“视频”行；若显示“低于请求 60 Hz”或回退原因，再分别查 Mac host 采集/H.264 pipeline/WebCodecs/网络。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Windows Codex

日期：2026-06-18 夜间
开发端：Windows Codex
本轮目标：让 Windows 控 Mac 复制诊断快速摘要直接写出输入模式/注入状态，方便定位“已连接但不能点击”。
完成内容：
- 复制/导出的诊断报告快速摘要新增“输入”一行，记录输入事件数量以及安全日志/真实控制/模拟/等待认证等输入模式。
- 运行统计里的“输入事件”改为同一份状态来源，会带 `input_ack` 的已记录、已注入或被拒绝错误码。
- 页面 diagnostics-only 自检在重连导出场景里模拟 `inputMode=log` + `inputAckStatus=logged`，确认导出和复制文本包含“安全日志，不会真正控制 / 已记录”。
- Windows 控制端 README、当前状态、下一步、任务板和锁表已同步。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps\windows-client scripts\windows docs`
遗留问题：
- 夜间只做无授权页面自检，不连接真实 Mac、不认证、不发送密码/input/inject；真实点击控制仍需用户在场时按正式流程验收。
下一步建议：
- 现场看到“连上但不能点”时，先复制诊断；若快速摘要显示“输入：...（安全日志，不会真正控制 / 已记录）”，说明链路收到了输入但 Mac host 仍在安全日志模式，需要按用户确认流程切换真实注入。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Windows Codex

日期：2026-06-18 夜间
开发端：Windows Codex
本轮目标：让 Windows 控 Mac 复制诊断报告直接写出普通声音接收/播放状态，方便定位听不到声音。
完成内容：
- 复制/导出的诊断报告快速摘要新增“声音”一行，记录关闭/等待音频/已接收等待播放/正在播放/播放失败、音量、接收帧、播放帧和丢帧。
- “显示与能力”分段新增声音状态、声音电平和声音错误。
- 页面 diagnostics-only 自检在重连导出场景里模拟 24 帧音频已接收但播放 0 帧，确认报告和复制文本包含“已接收，等待播放”、音量、电平和丢帧。
- Windows 控制端 README、当前状态、下一步、任务板和锁表已同步。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps\windows-client scripts\windows docs`
遗留问题：
- 夜间只做无授权页面自检，不连接真实 Mac、不认证、不发送密码/input/inject；真实听感、系统音量和双路声音体验仍需用户在场时验收。
下一步建议：
- 现场听不到声音时先复制诊断，看“声音”快速摘要和“声音状态/声音电平/声音错误”：若显示“已接收，等待播放”，优先查 Windows 播放权限/浏览器音频上下文/音量。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Windows Codex

日期：2026-06-18 夜间
开发端：Windows Codex
本轮目标：让 Windows 控 Mac 普通窗口诊断条也提示低于请求刷新率，和全屏浮层保持一致。
完成内容：
- 普通窗口诊断条的视频分段会在实收 FPS 明显低于请求 Hz 时显示“低于请求 N Hz”。
- 同一状态会把诊断条标为 warning，窗口化控制时不必进入全屏也能看出不是请求刷新率。
- 全屏浮层继续复用同一套帧率差距判断，避免两处口径不一致。
- 页面 diagnostics-only 自检新增 `low-fps-diagnostics`，覆盖 `22.9 FPS / 请求 60 Hz` 会提示、`58 FPS / 请求 60 Hz` 不误报。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps\windows-client scripts\windows docs`
遗留问题：
- 夜间只做无授权页面自检，不连接真实 Mac、不认证、不发送密码/input/inject；真实动态画面和主观流畅度仍需用户在场时验收。
下一步建议：
- 窗口化使用时如果觉得卡，先看顶部诊断条里的“低于请求 N Hz”和帧延迟；全屏时看浮层同一信息，必要时复制诊断给另一端。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Windows Codex

日期：2026-06-18 续跑
开发端：Windows Codex
本轮目标：让 Windows 控 Mac 全屏浮层在实收 FPS 明显低于请求刷新率时直接提示，辅助判断“不是 60Hz”。
完成内容：
- 全屏浮层视频状态新增帧率差距提示：已连接且实收 FPS 明显低于请求 Hz 时显示“低于请求 N Hz”。
- 该提示复用现有实收 FPS、协商 Hz 和请求 Hz 状态，不新增协议字段。
- 页面 diagnostics-only 自检固定 `22.9 FPS / 协商 30 Hz / 请求 60 Hz` 场景，确认浮层显示“低于请求 60 Hz”。
- Windows 控制端 README、当前状态、下一步、任务板和锁表已同步。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps\windows-client scripts\windows docs`
遗留问题：
- 本轮只做页面状态提示和 diagnostics-only 自检，不连接真实 Mac、不认证、不发送密码/input/inject；真实主观流畅度仍要看 Mac host 当前 H.264/JPEG 管线、动态画面和实收 FPS。
下一步建议：
- 真机联调觉得卡或不像 60Hz 时，优先展开全屏浮层或复制诊断，看“实收 FPS / 协商 Hz / 请求 Hz / 低于请求”组合，而不是只看请求档位。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Windows Codex

日期：2026-06-18 续跑
开发端：Windows Codex
本轮目标：让 Windows 控 Mac 的复制诊断报告也记录全屏浮层状态，方便真全屏现场粘贴复盘。
完成内容：
- 复制/导出的诊断报告顶部“快速摘要”新增“全屏浮层”一行，记录当前窗口/全屏模式、连接状态和视频状态。
- “显示与能力”分段新增全屏浮层摘要、提示、连接、视频、声音、剪贴板、输入和安全状态。
- 页面 diagnostics-only 自检新增导出文本和剪贴板复制文本断言，确认浮层状态会进入报告。
- Windows 控制端 README、当前状态、下一步、任务板和锁表已同步。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps\windows-client scripts\windows docs`
遗留问题：
- 本轮只做页面报告和 diagnostics-only 自检，不连接真实 Mac、不认证、不发送密码/input/inject；真实全屏现场仍需确认粘贴出的浮层状态足够直观。
下一步建议：
- 真机联调遇到卡顿、断线、没声音或文件剪贴板问题时，在全屏浮层直接点“复制诊断”，先看快速摘要里的全屏浮层连接/视频/声音/剪贴板状态。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Windows Codex

日期：2026-06-18 续跑
开发端：Windows Codex
本轮目标：第一阶段远控 UI 补强，让全屏浮层“复制诊断”点击后有即时反馈。
完成内容：
- Windows 控 Mac 悬浮控制中心的“复制诊断”按钮在复制成功后短暂显示“已复制”，复制失败时短暂显示“复制失败”，随后恢复“复制诊断”。
- 反馈复用现有 `copyLogsToClipboard()` 成功/失败路径，不改变诊断报告内容、不新增协议字段。
- 页面自检在浮层复制诊断断言里新增按钮反馈检查，确认成功复制后按钮文字包含“已复制”，并继续确认复制内容不含 `demo-password`。
- Windows 控制端 README、当前状态、下一步、任务板和锁表已同步。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps\windows-client scripts\windows docs`
遗留问题：
- 本轮只做页面 UI 和 diagnostics-only 自检，不连接真实 Mac、不认证、不发送密码/input/inject；真实全屏现场仍需人工确认按钮反馈在实际桌面壳里足够醒目。
下一步建议：
- 真机联调时在普通全屏/真全屏下点“复制诊断”，确认按钮反馈和粘贴到 Codex/Agent Link Board 的内容都符合预期。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-18 Windows Codex

日期：2026-06-18 续跑
开发端：Windows Codex
本轮目标：第一阶段远控 UI 补强，让 Windows 控 Mac 全屏时可以直接复制脱敏诊断报告。
完成内容：
- Windows 控 Mac 悬浮控制中心动作区新增“复制诊断”按钮，展开浮层后可直接复制与事件面板同源的脱敏诊断报告。
- 复制内容复用现有 `buildLogExportText()` / `copyLogsToClipboard()`，包含快速摘要、连接状态、本机协作和显示能力等排障信息；仍保留“本机被控密码：不导出”。
- 页面自检新增浮层复制诊断断言，模拟点击按钮后确认剪贴板文本包含“快速摘要 / 连接状态 / 本机协作”，并确认没有 `demo-password`。
- Windows 控制端 README、当前状态、下一步、任务板和锁表已同步。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps\windows-client scripts\windows docs`
遗留问题：
- 本轮只做页面 UI 和 diagnostics-only 自检，不连接真实 Mac、不认证、不发送密码/input/inject；真实全屏现场还需要人工确认复制后的文本能顺手粘贴到 Agent Link Board 或 Codex。
下一步建议：
- 真机联调时在普通全屏/真全屏下遇到卡顿、没声音或断线，优先点浮层“复制诊断”，看快速摘要里的连接、重连、视频、声音和本机协作信息是否足够定位。
是否改了协议：否。
是否需要另一端配合：暂不需要；真实全屏排障时再通过 Agent Link Board 发 call。

## 2026-06-18 Windows Codex

日期：2026-06-18 续跑
开发端：Windows Codex
本轮目标：第一阶段远控 UI 补强，让 Windows 控 Mac 全屏时能直接看到连接和重连状态，并可在浮层内立即重连。
完成内容：
- Windows 控 Mac 悬浮控制中心新增“连接”状态胶囊，展开后显示未连接、连接中、已连接、断线自动重连倒计时、重连次数和简短断线原因。
- 悬浮控制中心动作区新增“立即重连”按钮；只有自动重连等待中才显示，点击后复用现有 `reconnectNow()` 流程，不改变重连策略。
- 页面自检新增浮层连接/重连状态断言，模拟第 2/3 次自动重连倒计时，并确认浮层“立即重连”按钮可用；重连控件回归也改为点击浮层按钮确认动作。
- Windows 控制端 README、当前状态、下一步、任务板和锁表已同步。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps\windows-client scripts\windows docs`
遗留问题：
- 本轮只做页面 UI 和 diagnostics-only 自检，不连接真实 Mac、不认证、不发送密码/input/inject；真实断网或 Mac host 重启时仍需现场观察全屏浮层倒计时、立即重连和恢复画面的体验。
下一步建议：
- 真机 Mac 联调时在普通全屏/真全屏下重启 host 或断开网络，观察浮层“连接”状态和“立即重连”按钮是否足够直观，并复制诊断确认重连原因和下次重连时间一致。
是否改了协议：否。
是否需要另一端配合：暂不需要；真实断线恢复联调时再通过 Agent Link Board 发 call。

## 2026-06-18 Windows Codex

日期：2026-06-18 续跑
开发端：Windows Codex
本轮目标：第一阶段远控 UI 补强，让 Windows 控 Mac 全屏时能直接看到剪贴板和远端文件接收状态。
完成内容：
- Windows 控 Mac 悬浮控制中心新增“剪贴板”状态胶囊，展开后显示文字/文件剪贴板能力、远端文件接收进度、系统文件剪贴板写入状态、最近收到远端文件数量或关闭/待机状态。
- 剪贴板状态会跟随本机文字/文件发送、远端文件 offer/chunk/complete、系统文件剪贴板写入结果、远端文件托盘清空和剪贴板开关刷新。
- 页面自检新增浮层剪贴板状态断言，模拟正在接收 2 个远端文件，进度 `1.0 MB/2.0 MB`。
- Windows 控制端 README、当前状态、下一步、任务板和锁表已同步。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps\windows-client scripts\windows docs`
遗留问题：
- 本轮只做页面 UI 和 diagnostics-only 自检，不连接真实 Mac、不认证、不发送密码/input/inject；真实 Mac 连接时仍需用普通文件和压缩包复制验证浮层状态、远端文件托盘和 Windows 系统剪贴板写入是否一致。
下一步建议：
- 真实 Mac 联调时优先在普通全屏/真全屏下复制一个小文件和一个压缩包，观察“剪贴板”状态是否能从接收进度走到系统剪贴板写入结果。
是否改了协议：否。
是否需要另一端配合：暂不需要；真实 Mac 文件剪贴板联调时再通过 Agent Link Board 发 call。

## 2026-06-18 Windows Codex

日期：2026-06-18 续跑
开发端：Windows Codex
本轮目标：第一阶段远控 UI 补强，让 Windows 控 Mac 全屏时能直接看到声音接收和播放状态。
完成内容：
- Windows 控 Mac 悬浮控制中心新增“声音”状态胶囊，展开后显示声音关闭/等待音频/接收帧数/电平/音量/播放计数/丢帧。
- 声音状态会跟随音频帧、播放成功、播放失败、音频协商、音量变化和开关变化刷新，方便现场区分“没收到音频”“收到但没播放”“音量为 0”或“播放失败”。
- 页面自检新增浮层声音状态断言，模拟接收 24 帧、电平 37%、音量 33%、播放 20 帧和丢 2 帧。
- Windows 控制端 README、当前状态、下一步、任务板和锁表已同步。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps\windows-client scripts\windows docs`
遗留问题：
- 本轮只做页面 UI 和 diagnostics-only 自检，不连接真实 Mac、不认证、不发送密码/input/inject；真实 Mac 连接时仍需观察浮层声音状态和实际听感是否一致。
下一步建议：
- 真实 Mac 联调时优先在普通全屏/真全屏下观察声音状态，确认音频帧、电平、播放计数和 Windows 实际扬声器输出是否一致。
是否改了协议：否。
是否需要另一端配合：暂不需要；真实 Mac 联调时再通过 Agent Link Board 发 call。

## 2026-06-18 Windows Codex

日期：2026-06-18 续跑
开发端：Windows Codex
本轮目标：第一阶段远控 UI 补强，让 Windows 控 Mac 全屏时能直接看到视频链路和卡顿指标。
完成内容：
- Windows 控 Mac 悬浮控制中心新增“视频”状态胶囊，展开后显示当前 H.264/JPEG/模拟链路、实收 FPS、协商/请求刷新率、帧延迟或时钟偏差。
- 视频状态会同步 H.264/JPEG 回退原因、等待关键帧和解码异常提示，便于现场判断“没有 60Hz”、卡顿或回退 JPEG 的原因。
- 页面自检新增浮层视频状态断言，模拟 H.264、实收 22.9 FPS、协商 30 Hz、请求 60 Hz、123ms 到达延迟和回退原因。
- Windows 控制端 README、当前状态、下一步、任务板和锁表已同步。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps\windows-client scripts\windows docs`
遗留问题：
- 本轮只做页面 UI 和 diagnostics-only 自检，不连接真实 Mac、不认证、不发送密码/input/inject；真实 Mac 连接时仍需观察全屏状态行是否足够帮助现场判断帧率和延迟。
下一步建议：
- 真实 Mac 联调时优先在真全屏/普通全屏下截图或复制诊断，确认浮层视频状态、顶部 FPS 卡片和诊断条三处信息一致。
是否改了协议：否。
是否需要另一端配合：暂不需要；真实 Mac 联调时再通过 Agent Link Board 发 call。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：第一阶段远控 UI 补强，为 Windows 控 Mac 增加真全屏/沉浸式全屏入口。
完成内容：
- Windows 控 Mac 悬浮控制中心新增“真全屏”按钮，普通全屏、真全屏、窗口和退出远控入口并列展示。
- 真全屏优先调用浏览器/桌面壳 Fullscreen API；如果当前环境不支持或调用失败，会保留普通全屏并给中文提示，不影响连接和输入。
- 原有 `Esc` 退出逻辑继续生效；原生系统全屏退出事件会同步回页面全屏状态，避免 UI 状态残留。
- 页面自检扩展覆盖真全屏模拟路径，同时保留原画、详细参数同步、全屏轻提示、Esc 退出、快捷键发送和黑边输入防护覆盖。
- Windows 控制端 README、当前状态、下一步、任务板和锁表已同步。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
遗留问题：
- 本轮未在真实 Windows 桌面壳里人工点击系统全屏，只用页面自检模拟 Fullscreen API 成功路径；真实 Mac 连接时仍需观察真全屏进入/退出手感。
下一步建议：
- Windows 控 Mac UI 下一步可继续补画质模式说明/当前真实编码状态，也可以转入真实 Mac host 下的原画、真全屏、声音和快捷键手感验收。
是否改了协议：否。
是否需要另一端配合：暂不需要；真实 Mac 联调时再通过 Agent Link Board 发 call。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：第一阶段远控 UI 补强，确保 Windows 控 Mac 进入全屏后不会找不到退出方式。
完成内容：
- Windows 控 Mac 远程画面新增全屏轻提示：进入全屏时短暂显示 `Esc` 退出、当前画质、刷新率、码率和输入状态。
- `Esc` 键在全屏里会优先退出全屏；如果控制中心正展开，会同时收起控制中心，避免只关面板不退出全屏。
- 页面自检扩展覆盖全屏提示可见、提示文案包含当前 `Hz/Mbps`、`Esc` 退出全屏、全屏/窗口按钮和原有黑边输入防护。
- Windows 控制端 README、当前状态、下一步、任务板和锁表已同步。
修改文件：
- `apps/windows-client/index.html`
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
遗留问题：
- 本轮只做页面 UI 行为和自检，不改变协议、不连接真实 Mac、不认证、不发送密码/input/inject。真实 Mac 连接时仍需观察全屏提示是否不遮挡操作、原画模式下文案是否足够清楚。
下一步建议：
- Windows 控 Mac UI 继续补“真全屏/沉浸式全屏”入口规划，或转入真实 Mac 连接下的原画/声音/快捷键手感验收。
是否改了协议：否。
是否需要另一端配合：暂不需要；真实 Mac 连接验收时再通过 Agent Link Board 发 call。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：第一阶段远控 UI 收口，把 Windows 控 Mac 悬浮控制中心补成可日常操作的远控工具栏。
完成内容：
- Windows 控 Mac 顶部画质预设改为“流畅 / 自动 / 高清 / 原画 / 自定义”，新增“原画”预设：请求 4K、50 Mbps，并切到原始比例。
- 远程画面右上角悬浮控制中心新增分辨率、刷新率、码率、常用 macOS 快捷键发送、`Esc` 退出全屏提示、输入模式和安全状态；全屏后仍保留这些入口。
- 常用快捷键按钮复用现有 `input_event` 键盘消息，不新增协议；当前包括复制、粘贴、剪切、全选、撤销、重做、查找、保存、应用切换和锁屏。
- 页面自检扩展覆盖原画预设、详细显示参数同步、快捷键发送、安全状态显示、全屏/窗口切换和黑边输入防护。
- Windows 控制端 README、当前状态、下一步、任务板和锁表已同步。
修改文件：
- `apps/windows-client/index.html`
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
遗留问题：
- 本轮只做 Windows 控 Mac 页面的 UI/入口收口，没有改变视频编码、协议字段或 Mac 端页面。真实 Mac 连接下还需要人工观察原画模式、全屏退出、声音和快捷键手感。
下一步建议：
- 下一轮优先在真实 Mac host 连接时用新控制中心验收：原画/高清/流畅切换、全屏退出、声音开关、快捷键发送和 `inputMode=log/inject/rejected` 状态是否足够清楚。
是否改了协议：否。
是否需要另一端配合：暂不需要；真实 Mac 联调时再通过 Agent Link Board 发 call。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：把 Windows WebCodecs H.264 解码预检命令补进 Windows host status/readiness 摘要。
完成内容：
- `start-windows-host --status` 的 JSON、普通输出、离线/在线 `--boardSummary` 和启动后 ready 输出新增 `windowsWebCodecsH264Command` / `windowsWebCodecsH264PowerShellCommand`，指向 `check-webcodecs-h264-support` 的 Node 与 PowerShell 一行摘要命令。
- `check-windows-host-readiness` 的 JSON、PowerShell JSON 和 `--boardSummary` 新增同一组 `WindowsWebCodecs=` / `WindowsWebCodecsPs=`，即使 runtime 摘要被压缩也会额外保留完整可复制命令。
- `start-windows-host.ps1` 与 `check-windows-host-readiness.ps1` 的 `-Help/-h` 同步说明 `WindowsWebCodecs=` / `WindowsWebCodecsPs=`，帮助路径仍不启动 host、不认证、不读取密码、不发送 input/inject。
- Windows host README、当前状态、下一步、任务板和锁表已同步。
修改文件：
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/check-windows-host-readiness.ps1`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node --check scripts/windows/test-windows-host-start-helper.mjs`
- `node --check scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 120000 --readinessTimeoutMs 8000`
- `node scripts/windows/test-windows-script-help.mjs --script start-windows-host.mjs --script check-windows-host-readiness.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --script start-windows-host.ps1 --script check-windows-host-readiness.ps1 --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-webcodecs-h264-support-board-summary.mjs --timeoutMs 45000`
- `node scripts/windows/start-windows-host.mjs --status --checkBoard --boardSummary`（本机 43770 离线，按设计非 0，但输出确认包含 `WindowsWebCodecs=` / `WindowsWebCodecsPs=` 且不启动 host）
- `node scripts/windows/check-windows-host-readiness.mjs --checkBoard --boardSummary --timeoutMs 8000`
遗留问题：
- 本轮只暴露已有 WebCodecs H.264 解码预检命令，没有改变浏览器解码或视频传输链路。
下一步建议：
- Windows 本机被控入口排查 H.264 时，先复制 `WindowsVideoSupport=` 做综合能力体检；需要单独确认浏览器解码时复制 `WindowsWebCodecs=` 或 `WindowsWebCodecsPs=`；通过后再继续 WGC benchmark/compare 或真实 Mac client 观感验收。
是否改了协议：否。
是否需要另一端配合：否；真实 H.264 观感或 Mac client 端到端验收时再通过 Agent Link Board 呼叫 Mac 端。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：把 Windows WGC/WinRT/GPU 专项预检命令补进 Windows host status/readiness 摘要。
完成内容：
- `start-windows-host --status` 的 JSON、普通输出、离线/在线 `--boardSummary` 和启动后 ready 输出新增 `windowsWgcSupportCommand` / `windowsWgcSupportPowerShellCommand`，指向 `check-windows-wgc-support` 的 Node 与 PowerShell 一行摘要命令。
- `check-windows-host-readiness` 的 JSON、PowerShell JSON 和 `--boardSummary` 新增同一组 `WindowsWgcSupport=` / `WindowsWgcSupportPs=`，即使 runtime 摘要被压缩也会额外保留完整可复制命令。
- `start-windows-host.ps1` 与 `check-windows-host-readiness.ps1` 的 `-Help/-h` 同步说明 `WindowsWgcSupport=` / `WindowsWgcSupportPs=`，帮助路径仍不启动 host、不认证、不读取密码、不发送 input/inject。
- Windows host README、当前状态、下一步、任务板和锁表已同步。
修改文件：
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/check-windows-host-readiness.ps1`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node --check scripts/windows/test-windows-host-start-helper.mjs`
- `node --check scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 120000 --readinessTimeoutMs 8000`
- `node scripts/windows/test-windows-script-help.mjs --script start-windows-host.mjs --script check-windows-host-readiness.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --script start-windows-host.ps1 --script check-windows-host-readiness.ps1 --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-wgc-support-board-summary.mjs --timeoutMs 45000`
- `node scripts/windows/start-windows-host.mjs --status --checkBoard --boardSummary`（本机 43770 离线，按设计非 0，但输出确认包含 `WindowsWgcSupport=` / `WindowsWgcSupportPs=` 且不启动 host）
- `node scripts/windows/check-windows-host-readiness.mjs --checkBoard --boardSummary --timeoutMs 8000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps docs scripts shared`（无命中）
遗留问题：
- 本轮只暴露已有 WGC 支持专项预检命令，没有改变 WGC 采集/编码性能链路。
下一步建议：
- Windows 本机被控入口排查 WGC 时，先复制 `WindowsWgcSupport=` 或 `WindowsWgcSupportPs=` 做基础能力确认；通过后再跑 `WindowsWgcBenchmark=` 或 `WindowsWgcCompare=` 看帧率/源格式。
是否改了协议：否。
是否需要另一端配合：否；真实 WGC 观感/资源对照时再通过 Agent Link Board 呼叫 Mac 端。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：把 Windows WGC raw-bgra/NV12 对照命令补进 Windows host status/readiness 摘要。
完成内容：
- `start-windows-host --status` 的 JSON、普通输出、离线/在线 `--boardSummary` 和启动后 ready 输出新增 `windowsWgcCompareCommand` / `windowsWgcComparePowerShellCommand`，指向 `compare-windows-wgc-h264-sources` 的 Node 与 PowerShell 一行摘要命令。
- `check-windows-host-readiness` 的 JSON、PowerShell JSON 和 `--boardSummary` 新增同一组 `WindowsWgcCompare=` / `WindowsWgcComparePs=`，即使 runtime 摘要被压缩也会额外保留完整可复制命令。
- `start-windows-host.ps1` 与 `check-windows-host-readiness.ps1` 的 `-Help/-h` 同步说明 `WindowsWgcCompare=` / `WindowsWgcComparePs=`，帮助路径仍不启动 host、不认证、不读取密码、不发送 input/inject。
- Windows host README、当前状态、下一步、任务板和锁表已同步。
修改文件：
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/check-windows-host-readiness.ps1`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node --check scripts/windows/test-windows-host-start-helper.mjs`
- `node --check scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 120000 --readinessTimeoutMs 8000`
- `node scripts/windows/test-windows-script-help.mjs --script start-windows-host.mjs --script check-windows-host-readiness.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --script start-windows-host.ps1 --script check-windows-host-readiness.ps1 --timeoutMs 10000 --boardSummary`
- `node scripts/windows/start-windows-host.mjs --status --checkBoard --boardSummary`（本机 43770 离线，按设计非 0，但输出确认包含 `WindowsWgcCompare=` / `WindowsWgcComparePs=` 且不启动 host）
- `node scripts/windows/check-windows-host-readiness.mjs --checkBoard --boardSummary --timeoutMs 8000`
遗留问题：
- 本轮只暴露已有 raw-bgra/NV12 对照命令，没有实际跑真实 WGC compare；真实性能数据仍按现场需要执行 `WindowsWgcCompare=` 或 `WindowsWgcComparePs=`。
下一步建议：
- Mac 控 Windows 前若只想确认本机 Windows host 状态，先发 `start-windows-host --status --checkBoard --boardSummary`；若要从本机被控入口直接做 WGC 源格式对照，复制其中 `WindowsWgcCompare=` 或 `WindowsWgcComparePs=`。
是否改了协议：否。
是否需要另一端配合：否；真实观感/资源对照时再通过 Agent Link Board 呼叫 Mac 端。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：把 Windows host 媒体基线的 PowerShell 命令补进 Windows host status/readiness 摘要。
完成内容：
- `start-windows-host --status` 的 JSON、普通输出、离线/在线 `--boardSummary` 和启动后 ready 输出新增 `windowsHostMediaReadinessPowerShellCommand` / `WindowsHostMediaPs=`，指向 `check-windows-host-readiness.ps1 -CheckBoard -ProbeMedia -BoardSummary`。
- `check-windows-host-readiness` 的 JSON、PowerShell JSON 和 `--boardSummary` 新增同一条 `WindowsHostMediaPs=`，即使 runtime 摘要被压缩也会独立保留该入口。
- `start-windows-host.ps1` 与 `check-windows-host-readiness.ps1` 的 `-Help/-h` 同步说明 `WindowsHostMediaPs=`，帮助路径仍不启动 host、不认证、不读取密码、不发送 input/inject。
- Windows host README、当前状态、下一步、任务板和锁表已同步。
修改文件：
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/check-windows-host-readiness.ps1`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node --check scripts/windows/test-windows-host-start-helper.mjs`
- `node --check scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 120000 --readinessTimeoutMs 8000`
- `node scripts/windows/test-windows-script-help.mjs --script start-windows-host.mjs --script check-windows-host-readiness.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --script start-windows-host.ps1 --script check-windows-host-readiness.ps1 --timeoutMs 10000 --boardSummary`
- `node scripts/windows/start-windows-host.mjs --status --checkBoard --boardSummary`（本机 43770 离线，按设计非 0，但输出确认包含 `WindowsHostMediaPs=` 且不启动 host）
- `node scripts/windows/check-windows-host-readiness.mjs --checkBoard --boardSummary --timeoutMs 8000`
遗留问题：
- 本轮只暴露已有 PowerShell 媒体基线命令，没有实际启动 Windows host 或跑强校验 `-ProbeMedia`；真实视频/音频基线仍按现场需要执行 `WindowsHostMedia=` 或 `WindowsHostMediaPs=`。
下一步建议：
- Mac 控 Windows 前若只想确认本机 Windows host 状态，先发 `start-windows-host --status --checkBoard --boardSummary`；若要用现场 PowerShell 刷新本机视频/音频基线，复制其中 `WindowsHostMediaPs=`。
是否改了协议：否。
是否需要另一端配合：否；真实观感/资源对照时再通过 Agent Link Board 呼叫 Mac 端。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：把 Windows 视频能力体检的 PowerShell 命令补进 Windows host status/readiness 摘要。
完成内容：
- `start-windows-host --status` 的 JSON、普通输出、离线/在线 `--boardSummary` 和启动后 ready 输出新增 `windowsVideoEncoderSupportPowerShellCommand` / `WindowsVideoSupportPs=`，指向 `check-windows-video-encoder-support.ps1 -BoardSummary`。
- `check-windows-host-readiness` 的 JSON、PowerShell JSON 和 `--boardSummary` 新增同一条 `WindowsVideoSupportPs=`，即使 runtime 摘要被压缩也会独立保留该入口。
- `start-windows-host.ps1` 与 `check-windows-host-readiness.ps1` 的 `-Help/-h` 同步说明 `WindowsVideoSupportPs=`，帮助路径仍不启动 host、不认证、不读取密码、不发送 input/inject。
- Windows host README、当前状态、下一步、任务板和锁表已同步。
修改文件：
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/check-windows-host-readiness.ps1`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node --check scripts/windows/test-windows-host-start-helper.mjs`
- `node --check scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 120000 --readinessTimeoutMs 8000`
- `node scripts/windows/test-windows-script-help.mjs --script start-windows-host.mjs --script check-windows-host-readiness.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --script start-windows-host.ps1 --script check-windows-host-readiness.ps1 --timeoutMs 10000 --boardSummary`
- `node scripts/windows/start-windows-host.mjs --status --checkBoard --boardSummary`（本机 43770 离线，按设计非 0，但输出确认包含 `WindowsVideoSupportPs=` 且不启动 host）
- `node scripts/windows/check-windows-host-readiness.mjs --checkBoard --boardSummary --timeoutMs 8000`
遗留问题：
- 本轮只暴露已有 PowerShell 视频能力体检命令，没有实际跑强校验视频能力体检；真实性能/能力仍按现场需要执行 `WindowsVideoSupport=` 或 `WindowsVideoSupportPs=`。
下一步建议：
- Mac 控 Windows 前若只想确认本机 Windows host 状态，先发 `start-windows-host --status --checkBoard --boardSummary`；若要用现场 PowerShell 先确认 FFmpeg H.264、硬编、WGC 和 WebCodecs 能力，复制其中 `WindowsVideoSupportPs=`。
是否改了协议：否。
是否需要另一端配合：否；真实观感/资源对照时再通过 Agent Link Board 呼叫 Mac 端。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：把 Windows WGC 基础 benchmark 的 PowerShell 命令也补进 Windows host status/readiness 摘要。
完成内容：
- `start-windows-host --status` 的 JSON、普通输出、离线/在线 `--boardSummary` 和启动后 ready 输出新增 `windowsWgcBenchmarkPowerShellCommand` / `WindowsWgcBenchmarkPs=`，指向 `benchmark-windows-wgc-settings.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary`。
- `check-windows-host-readiness` 的 JSON、PowerShell JSON 和 `--boardSummary` 新增同一条 `WindowsWgcBenchmarkPs=`，即使 runtime 摘要被压缩也会独立保留该入口。
- `start-windows-host.ps1` 与 `check-windows-host-readiness.ps1` 的 `-Help/-h` 同步说明 `WindowsWgcBenchmarkPs=`，帮助路径仍不启动 host、不认证、不读取密码、不发送 input/inject。
- Windows host README、当前状态、下一步、任务板和锁表已同步。
修改文件：
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/check-windows-host-readiness.ps1`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node --check scripts/windows/test-windows-host-start-helper.mjs`
- `node --check scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 120000 --readinessTimeoutMs 8000`
- `node scripts/windows/test-windows-script-help.mjs --script start-windows-host.mjs --script check-windows-host-readiness.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --script start-windows-host.ps1 --script check-windows-host-readiness.ps1 --timeoutMs 10000 --boardSummary`
- `node scripts/windows/start-windows-host.mjs --status --checkBoard --boardSummary`（本机 43770 离线，按设计非 0，但输出确认包含 `WindowsWgcBenchmarkPs=` 且不启动 host）
- `node scripts/windows/check-windows-host-readiness.mjs --checkBoard --boardSummary --timeoutMs 8000`
遗留问题：
- 本轮只暴露已有 PowerShell benchmark 命令，没有实际跑真实 WGC benchmark；真实性能数据仍需现场按 `WindowsWgcBenchmark=` 或 `WindowsWgcBenchmarkPs=` 手动执行。
下一步建议：
- Mac 控 Windows 前若只想确认本机 Windows host 状态，先发 `start-windows-host --status --checkBoard --boardSummary`；若要用现场 PowerShell 跑基础 WGC 刷新率/码率，复制其中 `WindowsWgcBenchmarkPs=`。
是否改了协议：否。
是否需要另一端配合：否；真实观感/资源对照时再通过 Agent Link Board 呼叫 Mac 端。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：把 Windows WGC 基础 benchmark 命令补进 Windows host status/readiness 摘要。
完成内容：
- `start-windows-host --status` 的 JSON、普通输出、离线/在线 `--boardSummary` 和启动后 ready 输出新增 `windowsWgcBenchmarkCommand` / `WindowsWgcBenchmark=`，指向 `benchmark-windows-wgc-settings --profile 60:20000:balanced --durationMs 1800 --boardSummary`。
- `check-windows-host-readiness` 的 JSON、PowerShell JSON 和 `--boardSummary` 新增同一条 `WindowsWgcBenchmark=`，即使 runtime 摘要被压缩也会独立保留该入口。
- `start-windows-host.ps1` 与 `check-windows-host-readiness.ps1` 的 `-Help/-h` 同步说明 `WindowsWgcBenchmark=`，且帮助路径仍不启动 host、不认证、不读取密码、不发送 input/inject。
- `test-windows-host-start-helper.mjs` 和 `test-windows-host-readiness-board-summary.mjs` 已覆盖 offline/online、JSON、PowerShell help 和 boardSummary 中的 benchmark 命令。
- Windows host README、当前状态、下一步、任务板和锁表已同步。
修改文件：
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/check-windows-host-readiness.ps1`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node --check scripts/windows/test-windows-host-start-helper.mjs`
- `node --check scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 120000 --readinessTimeoutMs 8000`
- `node scripts/windows/test-windows-script-help.mjs --script start-windows-host.mjs --script check-windows-host-readiness.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --script start-windows-host.ps1 --script check-windows-host-readiness.ps1 --timeoutMs 10000 --boardSummary`
- `node scripts/windows/start-windows-host.mjs --status --checkBoard --boardSummary`（本机 43770 离线，按设计非 0，但输出确认包含 `WindowsWgcBenchmark=` 且不启动 host）
- `node scripts/windows/check-windows-host-readiness.mjs --checkBoard --boardSummary --timeoutMs 8000`
- `git diff --check`
- conflict marker scan
遗留问题：
- 本轮只暴露已有 benchmark 命令，没有实际跑真实 WGC benchmark；真实性能数据仍需现场按 `WindowsWgcBenchmark=` 手动执行。
下一步建议：
- Mac 控 Windows 前若只想确认本机 Windows host 状态，先发 `start-windows-host --status --checkBoard --boardSummary`；若要看基础 WGC 刷新率/码率，再复制其中 `WindowsWgcBenchmark=`。
是否改了协议：否。
是否需要另一端配合：否；真实观感/资源对照时再通过 Agent Link Board 呼叫 Mac 端。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：把 Windows WGC 刷新率/码率 benchmark 接入 Windows 恢复总览。
完成内容：
- `scripts/windows/check-windows-resume-status.mjs` 的 JSON、普通输出和 `--boardSummary` 新增 `WindowsWgcBenchmark=` / `WindowsWgcBenchmarkPs=`，指向 `benchmark-windows-wgc-settings` 的 Node 与 PowerShell 一行摘要命令。
- `scripts/windows/test-windows-resume-status.mjs` 和 `scripts/windows/test-windows-resume-status-powershell.mjs` 增加 mock JSON 与 boardSummary 断言，锁定 benchmark 命令使用 `60:20000:balanced`、`1800ms` 和无密摘要模式。
- 当前状态、下一步、任务板和锁表已同步；恢复后可直接从 `check-windows-resume-status --checkBoard --boardSummary` 复制基础 benchmark 或 raw-bgra/NV12 compare 两级 WGC 排查命令。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- `node scripts/windows/test-windows-resume-status.mjs`
- `node scripts/windows/test-windows-resume-status-powershell.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-resume-status.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --script check-windows-resume-status.ps1 --timeoutMs 10000 --boardSummary`
- `node scripts/windows/check-windows-resume-status.mjs --checkBoard --boardSummary`
- `git diff --check`
- conflict marker scan
遗留问题：
- 本轮只把现有 benchmark 入口接到恢复总览，没有实际跑真实 WGC benchmark；真实性能数据仍按现场需要手动运行 `WindowsWgcBenchmark=` 或 `WindowsWgcBenchmarkPs=`。
下一步建议：
- 白天恢复后先跑 `check-windows-resume-status --checkBoard --boardSummary`，若要看基础刷新率/码率表现先用 `WindowsWgcBenchmark=`，需要 raw-bgra/NV12 源格式对照再用 `WindowsWgcCompare=`。
是否改了协议：否。
是否需要另一端配合：否；真实观感/资源对照时再通过 Agent Link Board 呼叫 Mac 端。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：给 Windows WGC 刷新率/码率 benchmark 增加可上板摘要和 PowerShell 入口。
完成内容：
- `scripts/windows/benchmark-windows-wgc-settings.mjs` 新增 `--boardSummary`，JSON 同步带 `boardSummary` 字段；摘要包含分辨率、H.264/重复帧模式、各 profile 帧数/FPS/fresh/source/repeat/pipeline，并声明 no formal password/no Mac auth/no input/inject。
- 新增 PowerShell 包装 `scripts/windows/benchmark-windows-wgc-settings.ps1`，支持 `-Profile`、`-DurationMs`、`-BoardSummary`、`-Json`、`-RepeatLastFrame`、`-H264Bridge`、`-H264Source`、`-H264Encoder`、`-MotionStimulus` 和纯 `-Help/-h`。
- `scripts/windows/test-windows-wgc-progress-output.mjs` 扩展 fake observe 回归，覆盖 benchmark Node `--boardSummary`、PowerShell `-BoardSummary`、PowerShell `-Json`、普通进度输出和不泄密。
- Windows PowerShell 统一 help 覆盖更新为 20 个 `.ps1` 入口、40 条帮助命令，新增 `benchmark-windows-wgc-settings.ps1`。
- Windows host README、当前状态、下一步、任务板和锁表已同步。
修改文件：
- `scripts/windows/benchmark-windows-wgc-settings.mjs`
- `scripts/windows/benchmark-windows-wgc-settings.ps1`
- `scripts/windows/test-windows-wgc-progress-output.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/benchmark-windows-wgc-settings.mjs`
- `node --check scripts/windows/test-windows-wgc-progress-output.mjs`
- PowerShell AST parse `benchmark-windows-wgc-settings.ps1`
- `node scripts/windows/test-windows-wgc-progress-output.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script benchmark-windows-wgc-settings.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --script benchmark-windows-wgc-settings.ps1 --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary`
遗留问题：
- 本轮没有跑真实 WGC benchmark；新增输出路径使用 fake observe 锁定。真实性能数据仍按现场需要手动运行 benchmark 命令。
下一步建议：
- 需要看刷新率/码率基础表现时，先跑 `benchmark-windows-wgc-settings.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary`；需要 raw-bgra/NV12 对照时，再跑 `compare-windows-wgc-h264-sources.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary`。
是否改了协议：否。
是否需要另一端配合：否；真实观感/资源对照时再通过 Agent Link Board 呼叫 Mac 端。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：给 Windows WGC H.264 raw-bgra vs NV12 源格式对照补 PowerShell 入口，并接入 Windows 恢复总览。
完成内容：
- 新增 `scripts/windows/compare-windows-wgc-h264-sources.ps1`，包装同名 Node compare 工具，支持 `-Profile`、`-DurationMs`、`-BoardSummary`、`-Json`、`-ProgressIntervalMs`、`-SkipBuild`、`-Helper` 和常用阈值参数；帮助说明该工具只跑本机临时 Windows host/WGC helper benchmark，不连接 Mac、不认证、不请求或打印密码、不发送 input/inject。
- `scripts/windows/test-windows-wgc-progress-output.mjs` 新增 PowerShell fake-benchmark 回归，覆盖 `-BoardSummary` 单行干净输出、`-Json` 纯 JSON 和不泄密。
- `check-windows-resume-status` 的 JSON、普通输出和 `--boardSummary` 新增 `WindowsWgcCompare=` / `WindowsWgcComparePs=`，方便恢复开工时从总览直接复制较重的 raw-bgra vs NV12 对照命令。
- Windows PowerShell 统一 help 覆盖更新为 19 个 `.ps1` 入口、38 条帮助命令，新增 `compare-windows-wgc-h264-sources.ps1`。
- Windows host README、当前状态、下一步和任务板已同步 Node/PowerShell 两条 WGC 对照入口。
修改文件：
- `scripts/windows/compare-windows-wgc-h264-sources.ps1`
- `scripts/windows/test-windows-wgc-progress-output.mjs`
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-windows-wgc-progress-output.mjs`
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- `node scripts/windows/test-windows-wgc-progress-output.mjs`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-powershell-help.mjs --script compare-windows-wgc-h264-sources.ps1 --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary`
遗留问题：
- 本轮没有跑真实 WGC raw-bgra/NV12 benchmark；新增 PowerShell wrapper 的行为用 fake benchmark 锁定。真实性能数据仍按现场需要手动运行 `WindowsWgcCompare=` / `WindowsWgcComparePs=`。
下一步建议：
- 白天恢复后先跑 `node scripts/windows/check-windows-resume-status.mjs --checkBoard --boardSummary`，看 `WindowsWgcSupport=`、`WindowsWgcCompare=`、`WindowsWebCodecs=` 和 Mac 端 currentCall，再决定是否做真实 WGC 对照或 Mac client 真连。
是否改了协议：否。
是否需要另一端配合：否；仅在白天要跑真实 WGC/Mac client 观感对照时再通过 Agent Link Board 呼叫 Mac 端。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：把 Windows WGC/WinRT/GPU 专项预检做成可上板的一行摘要，并接入恢复总览。
完成内容：
- `scripts/windows/check-windows-wgc-support.mjs` 新增 `--boardSummary`，JSON 同步带 `boardSummary` 字段；摘要包含 supported、required、osBuild、`GraphicsCaptureSession.IsSupported()`、WinRT 类型、硬件/虚拟 GPU 数和 no host/no password/no capture/no input/inject 安全边界。
- 新增 PowerShell 包装 `scripts/windows/check-windows-wgc-support.ps1`，支持 `-BoardSummary`、`-Json`、`-RequireSupported`、`-VerboseOutput` 和纯 `-Help/-h`。
- 新增 `scripts/windows/test-windows-wgc-support-board-summary.mjs`，覆盖 Node/PowerShell 单行摘要、JSON `boardSummary`、PowerShell help 和不泄密。
- `check-windows-resume-status` 的 JSON、普通输出和 `--boardSummary` 新增 `WindowsWgcSupport=` / `WindowsWgcSupportPs=`，恢复开工时可把 WGC 前置条件和综合视频/WebCodecs 检查分开上板。
- Windows PowerShell 统一 help 覆盖更新为 18 个 `.ps1` 入口、36 条帮助命令，新增 `check-windows-wgc-support.ps1`。
修改文件：
- `scripts/windows/check-windows-wgc-support.mjs`
- `scripts/windows/check-windows-wgc-support.ps1`
- `scripts/windows/test-windows-wgc-support-board-summary.mjs`
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-wgc-support.mjs`
- `node --check scripts/windows/test-windows-wgc-support-board-summary.mjs`
- PowerShell AST parse `check-windows-wgc-support.ps1`
- `node scripts/windows/check-windows-wgc-support.mjs --boardSummary`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-wgc-support.ps1 -BoardSummary`
- `node scripts/windows/test-windows-wgc-support-board-summary.mjs --timeoutMs 20000`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-wgc-support.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --script check-windows-wgc-support.ps1 --timeoutMs 10000 --boardSummary`
遗留问题：
- 本轮只做只读 WGC/WinRT/GPU 前置条件检查和恢复总览提示；没有启动 Windows host、没有认证 WebSocket、没有采集屏幕/声音、没有发送密码/input/inject。
下一步建议：
- 白天排查高刷或 H.264 体验时，先跑 `check-windows-resume-status --checkBoard --boardSummary`，看 `WindowsWgcSupport=`、`WindowsVideoSupport=` 和 `WindowsWebCodecs=` 三条分别是否 ready，再决定继续看 WGC helper 原生硬编、采集节奏或浏览器解码。
是否改了协议：否。
是否需要另一端配合：否；真实观感联调时再通过 Agent Link Board 呼叫 Mac。

## 2026-06-17 Mac Codex

日期：2026-06-17 续跑
开发端：Mac Codex
本轮目标：让 Mac formal E2E 预检直接提示本机 formal local smoke。
完成内容：
- `scripts/mac/check-mac-formal-e2e-status.mjs` 的 JSON `commands` 新增 `macFormalLocalSmokeCommand`，命令形状为 `check-mac-formal-local-smoke --host <host> --port <port> --promptPassword --boardSummary`。
- `callText` 和 `--boardSummary` 新增 `MacFormalLocalSmoke=`，提醒长时间正式 E2E 前先由 Mac 本机短验 H.264、系统 PCM 和 `inputMode=log` 输入 ack。
- 该提示只生成命令，不自动运行 smoke、不弹密码、不认证 WebSocket、不发送 Agent Link Board call/input/inject。
- `scripts/mac/test-mac-formal-e2e-status.mjs` 覆盖 help、离线/在线 JSON、ready sendCall JSON、secret redaction 和 boardSummary 中的新命令，并断言命令不带 `--password`、不带 `--sendCall`、不回显 board server。
修改文件：
- `scripts/mac/check-mac-formal-e2e-status.mjs`
- `scripts/mac/test-mac-formal-e2e-status.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-formal-e2e-status.mjs`
- `node --check scripts/mac/test-mac-formal-e2e-status.mjs`
- `node scripts/mac/test-mac-formal-e2e-status.mjs --timeoutMs 45000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/mac/check-mac-formal-e2e-status.mjs --host 127.0.0.1 --port 43770 --boardSummary --allowDirty`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮只做只读提示链路收口；没有运行真实 formal local smoke、没有触发密码弹窗、没有认证真实 host、没有发送 call/input/inject。
下一步建议：
- 白天正式呼叫 Windows 前，按 `check-mac-resume-status --checkBoard --boardSummary` 给出的顺序走：先 `MacFormalLocalSmoke=` 本机短验，再 `MacFormalE2E=` 只读确认 readiness，ready 后再显式 `--sendCall`。
是否改了协议：否。
是否需要另一端配合：否；真实端到端验收时再通过 Agent Link Board 呼叫 Windows。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：把 Windows 浏览器 WebCodecs H.264 能力检查做成可上板的一行摘要，并接入恢复总览。
完成内容：
- `scripts/windows/check-webcodecs-h264-support.mjs` 新增 `--boardSummary`，JSON 同步带 `boardSummary` 字段；摘要包含 H.264 支持状态、首选 codec/format、浏览器信息和 no host/no password/no capture/no input/inject 安全边界。
- 新增 PowerShell 包装 `scripts/windows/check-webcodecs-h264-support.ps1`，支持 `-RequireCodec avc1.42C02A -BoardSummary`、`-Json`、`-RequireAny`、`-Headed` 和纯 `-Help/-h`。
- 修复 WebCodecs 探针的浏览器等待与清理：DevTools 发现、WebSocket、CDP 调用都有硬超时；Edge 兼容层重启后会按临时 `userDataDir` 清理残留进程，避免现场命令卡住。
- `check-windows-resume-status` 的 JSON、普通输出和 `--boardSummary` 新增 `WindowsWebCodecs=` / `WindowsWebCodecsPs=`，恢复开工一行摘要能直接给出浏览器 H.264 解码能力检查命令。
- 新增 `scripts/windows/test-webcodecs-h264-support-board-summary.mjs`，覆盖 Node/PowerShell 单行摘要、JSON `boardSummary`、PowerShell help 和不泄密。
修改文件：
- `scripts/windows/check-webcodecs-h264-support.mjs`
- `scripts/windows/check-webcodecs-h264-support.ps1`
- `scripts/windows/test-webcodecs-h264-support-board-summary.mjs`
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-webcodecs-h264-support.mjs`
- `node --check scripts/windows/test-webcodecs-h264-support-board-summary.mjs`
- PowerShell AST parse `check-webcodecs-h264-support.ps1`
- `node scripts/windows/check-webcodecs-h264-support.mjs --debugPort 19452 --timeoutMs 8000 --codecs avc1.42C02A --boardSummary`
- `node scripts/windows/test-webcodecs-h264-support-board-summary.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --script check-webcodecs-h264-support.mjs --script test-webcodecs-h264-support-board-summary.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary`
遗留问题：
- 本轮只做本机浏览器只读能力检查，没有连接 Mac、没有启动 Windows host、没有认证、没有发送密码/input/inject。
下一步建议：
- 白天 H.264 或无画面排查时，先跑恢复总览看 `WindowsWebCodecs=` / `WindowsWebCodecsPs=`；如果浏览器能力 OK，再继续看 host 编码、WebSocket 二进制帧和页面解码链路。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Mac Codex

日期：2026-06-17 续跑
开发端：Mac Codex
本轮目标：让 Mac 恢复总览直接给出 formal E2E 只读预检入口。
完成内容：
- `scripts/mac/check-mac-resume-status.mjs` 的 JSON `commands` 新增 `macFormalE2eStatusCommand`，命令形状为 `check-mac-formal-e2e-status --host <host> --port <port> --boardSummary`。
- 普通输出和 `--boardSummary` 新增 `MacFormalE2E=`，正式呼叫 Windows 前可先一行确认 repo、联络板、Mac host、权限、媒体、剪贴板、display 和 buildDiff readiness。
- 该命令保持只读：不弹密码、不认证 WebSocket、不发送 Agent Link Board call/input/inject；真正发正式呼叫仍需人工确认后另行显式 `--sendCall`。
- `scripts/mac/test-mac-resume-status.mjs` 覆盖 help、离线/在线 JSON、普通输出和 boardSummary 中的新命令，并断言命令不带 `--password`、不带 `--sendCall`、不带自定义 board server。
修改文件：
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-resume-status.mjs`
- `node --check scripts/mac/test-mac-resume-status.mjs`
- `node scripts/mac/test-mac-resume-status.mjs --timeoutMs 10000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/mac/check-mac-formal-e2e-status.mjs --host 127.0.0.1 --port 43770 --boardSummary --allowDirty`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮只做只读 resume/status 收口；没有运行真实 formal E2E、没有触发密码弹窗、没有认证真实 host、没有发送 call/input/inject。
下一步建议：
- 白天正式呼叫 Windows 前，先跑 `check-mac-resume-status --checkBoard --boardSummary`，按摘要里的 `MacFormalLocalSmoke=` 做本机短验收，再按 `MacFormalE2E=` 确认 readiness，ready 后再决定是否显式 `--sendCall`。
是否改了协议：否。
是否需要另一端配合：否；真实端到端验收时再通过 Agent Link Board 呼叫 Windows。

## 2026-06-17 Mac Codex

日期：2026-06-17 续跑
开发端：Mac Codex
本轮目标：让 Mac formal local smoke 可直接输出一行联络板摘要。
完成内容：
- `scripts/mac/check-mac-formal-local-smoke.mjs` 新增 `--boardSummary`：完成 H.264、PCM 和 input-log 聚合后，stdout 只输出一行无密摘要，进度输出走 stderr。
- 失败路径也支持 `--boardSummary`，会输出一行可读失败摘要并保留“未执行 inject、未打印密码”的安全边界。
- `scripts/mac/check-mac-resume-status.mjs` 的 `MacFormalLocalSmoke=` 推荐命令从 `--json` 改为 `--boardSummary`，让恢复总览默认给出可直接上板的短验收命令。
- `scripts/mac/test-mac-formal-local-smoke.mjs` 覆盖 help、缺密码 boardSummary 失败、fake host 成功 boardSummary 单行输出和不泄密；`scripts/mac/test-mac-resume-status.mjs` 锁定新的命令形状。
修改文件：
- `scripts/mac/check-mac-formal-local-smoke.mjs`
- `scripts/mac/test-mac-formal-local-smoke.mjs`
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-formal-local-smoke.mjs`
- `node --check scripts/mac/test-mac-formal-local-smoke.mjs`
- `node --check scripts/mac/check-mac-resume-status.mjs`
- `node --check scripts/mac/test-mac-resume-status.mjs`
- `node scripts/mac/test-mac-formal-local-smoke.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-resume-status.mjs --timeoutMs 10000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮只跑假 Mac host 自测；没有运行真实 `--promptPassword --boardSummary`，没有触发密码弹窗、没有认证真实 host、没有发送 call/input/inject。
下一步建议：
- 用户在场、正式呼叫 Windows 前，先运行 `check-mac-resume-status --checkBoard --boardSummary`，再按摘要里的 `MacFormalLocalSmoke=` 执行本机短验收并把一行结果同步到联络板。
是否改了协议：否。
是否需要另一端配合：否；真实端到端验收时再通过 Agent Link Board 呼叫 Windows。

## 2026-06-17 Mac Codex

日期：2026-06-17 续跑
开发端：Mac Codex
本轮目标：让 Mac 恢复总览直接给出本机 formal local smoke 短验收入口。
完成内容：
- `scripts/mac/check-mac-resume-status.mjs` 的 JSON `commands` 新增 `macFormalLocalSmokeCommand`，命令形状为 `check-mac-formal-local-smoke --host <host> --port <port> --promptPassword --json`。
- 普通输出和 `--boardSummary` 新增 `MacFormalLocalSmoke=`，正式呼叫 Windows 前可先由 Mac 本机短验收 H.264、系统 PCM 和 `inputMode=log` 输入 ack。
- 建议列表新增本机 smoke 下一步，仍保持 resume status 本身只读：不启动服务、不认证、不要求或打印密码、不发送 call/input/inject。
- `scripts/mac/test-mac-resume-status.mjs` 覆盖 help、离线/在线 JSON、普通输出和 boardSummary 中的新命令，并断言命令不带 `--password`、不发 call。
修改文件：
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-resume-status.mjs`
- `node --check scripts/mac/test-mac-resume-status.mjs`
- `node scripts/mac/test-mac-resume-status.mjs --timeoutMs 10000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮没有运行 `check-mac-formal-local-smoke --promptPassword`，因此没有触发密码弹窗、没有认证、没有真实媒体/input-log 连接。
下一步建议：
- 白天正式呼叫 Windows 前，先跑 `check-mac-resume-status --checkBoard --boardSummary` 看 `MacFormalLocalSmoke=`，再按需执行本机短验收。
是否改了协议：否。
是否需要另一端配合：否；真实 Windows 端到端验收时再通过 Agent Link Board 发 call。

## 2026-06-17 Mac Codex

日期：2026-06-17 续跑
开发端：Mac Codex
本轮目标：让 Mac formal smoke 的 discovery 结果也透传 formal 人工真连清单。
完成内容：
- `scripts/mac/run-mac-client-formal-smoke.mjs` 的 `discovery` JSON 新增 `formalChecklistCommand` 和 `manualChecklistSummary`，来源于 `discover-windows-hosts`。
- `--discover --preflightOnly --boardSummary` 和 discover sendCall 摘要现在会带 `FormalChecklist=` 与 `ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics`，发现、预检、人工清单路径更连贯。
- 该透传保持只读语义：发现和预检不认证、不要求或打印密码、不发送 input/inject；只有显式 `--preflightOnly --sendCall` 且 ready 时才发送既有无密 call。
- `scripts/mac/test-mac-client-formal-smoke.mjs` 覆盖 help、discover preflight 和 discover sendCall 中的新字段/摘要。
修改文件：
- `scripts/mac/run-mac-client-formal-smoke.mjs`
- `scripts/mac/test-mac-client-formal-smoke.mjs`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/run-mac-client-formal-smoke.mjs`
- `node --check scripts/mac/test-mac-client-formal-smoke.mjs`
- `node scripts/mac/test-mac-client-formal-smoke.mjs --timeoutMs 45000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮没有启动真实 Windows host、没有认证、没有发送密码/input/inject；真实 Mac -> Windows smoke 仍需 Windows host 在线和用户密码授权。
下一步建议：
- 真机联调前优先跑 `run-mac-client-formal-smoke --discover --ensureClient --preflightOnly --boardSummary`，先看 `FormalChecklist=` / `ManualChecklist=`，ready 后再决定是否 `--sendCall` 或 `--promptPassword`。
是否改了协议：否。
是否需要另一端配合：真实联调时需要 Windows 端启动 Windows host。

## 2026-06-17 Mac Codex

日期：2026-06-17 续跑
开发端：Mac Codex
本轮目标：让 Mac 侧 Windows host 发现摘要直接带 formal 人工真连清单。
完成内容：
- `scripts/mac/discover-windows-hosts.mjs` 的 JSON 新增 `formalChecklistCommand` 和 `manualChecklistSummary`，发现 Windows host 后直接给 `check-mac-client-formal-status --host <Windows IP> --port <port> --boardSummary`。
- `--boardSummary` 新增 `FormalChecklist=` 与 `ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics`，普通输出同步打印 `Formal checklist` 和 `Manual checklist`。
- 该发现入口仍保持只读：只扫描 `/discovery`，不认证 WebSocket、不要求或打印密码、不发送 Agent Link Board call/input/inject。
- `scripts/mac/test-discover-windows-hosts.mjs` 覆盖 help、JSON 和 boardSummary 中的新字段，并确认无 Windows host 时仍给出下一步提示。
修改文件：
- `scripts/mac/discover-windows-hosts.mjs`
- `scripts/mac/test-discover-windows-hosts.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/discover-windows-hosts.mjs`
- `node --check scripts/mac/test-discover-windows-hosts.mjs`
- `node scripts/mac/test-discover-windows-hosts.mjs --timeoutMs 30000`
- `node scripts/mac/discover-windows-hosts.mjs --noLocalSubnets --host 127.0.0.1 --timeoutMs 200 --scanTimeoutMs 3000 --boardSummary`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮没有启动真实 Windows host、没有认证、没有发送密码/call/input/inject；真实 Mac -> Windows 联调仍需 Windows host 在线后复测。
下一步建议：
- 恢复现场可先运行 `discover-windows-hosts --boardSummary`；发现到 Windows host 后，直接把摘要里的 `FormalChecklist=` 和 `ManualChecklist=` 发到通讯板或继续跑 formal checklist。
是否改了协议：否。
是否需要另一端配合：真实联调时需要 Windows 端启动 Windows host。

## 2026-06-17 Mac Codex

日期：2026-06-17 续跑
开发端：Mac Codex
本轮目标：让 Mac 恢复总览直接提示 Windows host 发现入口。
完成内容：
- `scripts/mac/check-mac-resume-status.mjs` 新增 `commands.macClientDiscoverWindowsCommand`，值为 `node scripts/mac/discover-windows-hosts.mjs --boardSummary`。
- 普通输出新增 `Mac client discover Windows host:`；`--boardSummary` 新增 `MacClientDiscoverWindows=...`，恢复现场可先只读发现 Windows host，再跑 `MacClientFormalChecklist=`。
- 该入口保持只读：不启动 host/client、不认证、不要求或打印密码、不发送 Agent Link Board call/input/inject、不回显自定义 server URL。
- `scripts/mac/test-mac-resume-status.mjs` 覆盖 help、离线/在线 JSON、普通输出和 boardSummary 中的新命令，并确认不携带密码/发起 call。
修改文件：
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-resume-status.mjs`
- `node --check scripts/mac/test-mac-resume-status.mjs`
- `node scripts/mac/test-mac-resume-status.mjs --timeoutMs 45000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/mac/test-discover-windows-hosts.mjs --timeoutMs 30000`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮只补恢复总览入口和自测，没有启动真实 Windows host、没有认证、没有发送密码/call/input/inject。
下一步建议：
- 恢复开工先跑 `check-mac-resume-status --checkBoard --boardSummary`；看到 `MacClientDiscoverWindows=` 后先找 Windows host，再用 `MacClientFormalChecklist=` 发 formal manual checklist。
是否改了协议：否。
是否需要另一端配合：真实 Mac -> Windows 联调时需要 Windows 端启动 Windows host。

## 2026-06-17 Mac Codex

日期：2026-06-17 续跑
开发端：Mac Codex
本轮目标：让 Mac 恢复总览直接提示 Mac 控制 Windows formal 人工清单入口。
完成内容：
- `scripts/mac/check-mac-resume-status.mjs` 新增 `commands.macClientFormalChecklistCommand`，值为 `node scripts/mac/check-mac-client-formal-status.mjs --boardSummary`。
- 普通输出新增 `Mac client formal checklist:`；`--boardSummary` 新增 `MacClientFormalChecklist=...`，方便恢复现场时直接拿到 Mac -> Windows formal 人工真连清单。
- 该入口保持只读：不启动 host/client、不认证、不要求或打印密码、不发送 Agent Link Board call/input/inject、不回显自定义 server URL。
- `scripts/mac/test-mac-resume-status.mjs` 覆盖 help、离线/在线 JSON、普通输出和 boardSummary 中的新命令，并确认不携带密码/发起 call。
修改文件：
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-resume-status.mjs`
- `node --check scripts/mac/test-mac-resume-status.mjs`
- `node scripts/mac/test-mac-resume-status.mjs --timeoutMs 45000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮只补恢复总览和自测，没有启动真实 Windows host、没有认证、没有发送密码/input/inject。
下一步建议：
- 恢复开工先跑 `check-mac-resume-status --checkBoard --boardSummary`；看到 `MacClientFormalChecklist=` 后可直接发/运行 formal manual checklist。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Mac Codex

日期：2026-06-17 续跑
开发端：Mac Codex
本轮目标：给 Mac 控制 Windows formal checklist 补人工真连验收清单。
完成内容：
- `scripts/mac/check-mac-client-formal-status.mjs` 的 `runPlan` 新增 `manualChecklist`，把人工真连要确认的连接、视频、音频、剪贴板、input_ack 和复制诊断/日志证据整理成固定 JSON 字段。
- 普通输出新增 `Manual true-test checklist`，`--boardSummary` 新增 `ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics`，方便发通讯板后双方按项执行。
- 清单保持只读语义：不启动 Windows host、不认证、不要求或打印密码、不发送输入事件、不执行 inject；反控授权仍只提示 Windows 本机回环命令。
- `scripts/mac/test-mac-client-formal-status.mjs` 覆盖 help、离线 JSON、普通输出、ready JSON 和 boardSummary 中的新清单，并确认不泄露 `LAN_DUAL_PASSWORD`。
修改文件：
- `scripts/mac/check-mac-client-formal-status.mjs`
- `scripts/mac/test-mac-client-formal-status.mjs`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-client-formal-status.mjs`
- `node --check scripts/mac/test-mac-client-formal-status.mjs`
- `node scripts/mac/test-mac-client-formal-status.mjs --timeoutMs 45000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮只补人工验收计划和自测，没有启动真实 Windows host、没有认证、没有发送密码/input/inject。
下一步建议：
- 后续 Mac -> Windows 轻量联调时，先用 `check-mac-client-formal-status --boardSummary` 发 readiness 和 `ManualChecklist=`，再按连接、视频、音频、剪贴板、input_ack、复制诊断逐项打勾。
是否改了协议：否。
是否需要另一端配合：后续真实联调时需要 Windows 端启动/保持 Windows host 在线。

## 2026-06-17 Mac Codex

日期：2026-06-17 续跑
开发端：Mac Codex
本轮目标：让 Mac client readiness 自身也输出本地页面状态命令。
完成内容：
- `scripts/mac/check-mac-client-readiness.mjs` 新增 `commands.macClientPageStatusCommand`，值为 `node scripts/mac/start-mac-client.mjs --status --boardSummary`，只读检查本地 Mac client 页面在线状态。
- 普通输出新增 `Mac client page status:`；`--boardSummary` 新增 `MacClientPage=...`，方便不经过 resume status 时也能先发本地页面状态。
- help、JSON、普通输出和 boardSummary 都继续不启动 Mac client、不连接 Windows host、不认证、不要求或打印密码、不发送 input、不执行 inject。
- `scripts/mac/test-mac-client-readiness.mjs` 覆盖 help、离线 JSON、plain report、boardSummary 和本地 Mac client server probe 中的新命令，并确认命令不带密码/server/allowExisting 参数。
- 已先合并 Windows 最新 `b5bdeb1`，保留对方 Windows 控制端远端文件接收超时/中断恢复交接记录。
修改文件：
- `scripts/mac/check-mac-client-readiness.mjs`
- `scripts/mac/test-mac-client-readiness.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-client-readiness.mjs`
- `node --check scripts/mac/test-mac-client-readiness.mjs`
- `node scripts/mac/test-mac-client-readiness.mjs --timeoutMs 45000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮只补 Mac readiness 的无密下一步命令，不启动真实 Windows host、不认证、不发送密码/input/inject。
下一步建议：
- 现场直接跑 Mac client readiness 时，优先用 `MacClientPage=` 先确认本地页面在线，再按 `CopyDiagnostics=` 粘贴页面完整诊断；如需更完整恢复总览仍先跑 `check-mac-resume-status --checkBoard --boardSummary`。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：补强 Windows 控制端远端文件接收卡住/超时后的恢复提示。
完成内容：
- `apps/windows-client/app.js` 新增远端文件传输活动时间戳和超时扫描，45 秒没有收到新分块或完成消息时，会停止该 transfer。
- 超时、中断、重新连接都会把“远端文件”托盘状态条切到 warning，显示已收/总量和“请让 Mac 重新复制”的恢复提示，不再让界面长期停留在“正在接收”。
- 超时路径会沿用既有 `clipboard_file_result accepted:false` 回给对端，保持协议兼容；本轮没有新增协议字段。
- `scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly` 的 file-clipboard-recovery 检查新增超时模拟，覆盖状态条文字、warning class、Map 清理、失败 result 和不泄密。
- Windows client README、当前状态、下一步、任务板和锁表已同步。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-client-browser.mjs --timeoutMs 10000`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮是页面级模拟和本地 diagnostics，没有跑真实 Mac 文件复制中断；后续真机联调仍需验证大文件/压缩包在断网、Mac host 重启或复制取消时的提示。
下一步建议：
- 真机文件剪贴板联调时，刻意中断一次传输，确认 Windows 控制端“远端文件”状态条在约 45 秒后提示接收超时，并且再次复制可以恢复。
是否改了协议：否。
是否需要另一端配合：后续真机中断场景需要 Mac 端配合复测。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：补强 Windows 控制端远端文件托盘在接收中和失败场景下的可见状态。
完成内容：
- `apps/windows-client/app.js` 新增远端文件托盘状态渲染 helper，状态条不再要求已有文件行；只要有接收、拒绝或失败状态，就会在“远端文件”面板显示。
- 文件 `clipboard_file_offer` 接收后会显示正在接收的文件数、已收/总字节和百分比；分块到达时持续更新进度。
- 剪贴板关闭、缺少文件清单、总量超限、分块解析失败和不完整完成都会写入托盘 warning 状态，并提示让 Mac 重新复制或说明已拒绝接收。
- `scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly` 的 file-clipboard-recovery 检查新增接收中状态可见性、50% 分块进度、超限拒绝提示和协议响应断言。
- Windows client README、当前状态、下一步、任务板和锁表已同步。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮只补 Windows 控制端托盘状态和页面自测，没有跑真实 Mac 文件复制；后续仍需用真实文件/压缩包验收 Windows 粘贴可用性和失败恢复。
下一步建议：
- 真机文件剪贴板联调时，除了看事件日志，也直接看“远端文件”面板状态条是否显示接收进度、拒绝原因、临时目录或可重试动作。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Mac Codex

日期：2026-06-17 17:20
开发端：Mac Codex
本轮目标：把本地 Mac client 页面状态命令接入 Mac 恢复总览。
完成内容：
- `scripts/mac/check-mac-resume-status.mjs` 新增 `commands.macClientPageStatusCommand`，值为 `node scripts/mac/start-mac-client.mjs --status --boardSummary`，只读检查本地 Mac client 页面是否在线。
- 普通输出新增 `[NEXT] Mac client page status: ...`；`--boardSummary` 新增 `MacClientPage=...`，可直接发 Agent Link Board。
- JSON、普通输出和 boardSummary 均继续不启动服务、不认证、不发送密码/input/inject。
- `scripts/mac/test-mac-resume-status.mjs` 覆盖 help、离线/在线 JSON、普通输出和 boardSummary 中的新命令。
- 当前状态、下一步和任务板已同步该恢复总览入口。
修改文件：
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-resume-status.mjs`
- `node --check scripts/mac/test-mac-resume-status.mjs`
- `node scripts/mac/test-mac-resume-status.mjs --timeoutMs 45000`
遗留问题：
- 本轮只补 Mac 恢复总览和自测，不启动真实 Windows host、不认证、不发送密码/input/inject。
下一步建议：
- 恢复现场要同步 Mac 控制端页面状态时，优先按 resume status 摘要里的 `MacClientPage=` 发一行页面在线状态，再按 `MacClientDiagnostics=` 发 readiness 摘要。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Mac Codex

日期：2026-06-17 17:15
开发端：Mac Codex
本轮目标：让 `start-mac-client --json` 也提供机器可读的下一步命令和复制诊断动作。
完成内容：
- `scripts/mac/start-mac-client.mjs` 的 JSON 报告新增 `commands.macClientStartOrReuseCommand`，指向当前 host/port 的安全启动或复用命令。
- JSON 报告新增 `commands.macClientFormalStatusCommand`，给出 Mac 控制 Windows 前的 formal status 一行摘要命令模板。
- JSON 报告新增 `commands.macClientCopyDiagnosticsAction`，与 `CopyDiagnostics=` 摘要使用同一段“事件日志点击复制诊断、粘贴前确认不含连接密码”提示。
- `scripts/mac/test-mac-client-start-helper.mjs` 覆盖离线 status、启动成功、在线 status 和 allowExisting 四条 JSON 路径的 commands 字段。
- 当前状态和任务板已同步该 JSON commands 能力；已先合并 Windows 最新 `ffb05db`，保留对方 PowerShell help boardSummary 交接记录。
修改文件：
- `scripts/mac/start-mac-client.mjs`
- `scripts/mac/test-mac-client-start-helper.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/start-mac-client.mjs`
- `node --check scripts/mac/test-mac-client-start-helper.mjs`
- `node scripts/mac/test-mac-client-start-helper.mjs --timeoutMs 45000`
遗留问题：
- 本轮只补本地 Mac client 启动助手 JSON 和自测，不连接 Windows host、不认证、不发送密码/input/inject。
下一步建议：
- 后续恢复总览或自动化需要本地 Mac client 页面下一步命令时，可优先读取 `start-mac-client --json` 的 `commands` 字段，避免手工拼命令。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Mac Codex

日期：2026-06-17 17:05
开发端：Mac Codex
本轮目标：把 `start-mac-client --status --boardSummary` 的真实 stdout 摘要路径纳入自测。
完成内容：
- `scripts/mac/test-mac-client-start-helper.mjs` 新增 `assertSingleLine`，直接断言 `--status --boardSummary` stdout 非空且只有一行。
- 离线状态会单独运行 `--status --boardSummary`，确认非零退出时仍输出可发板的 `Mac client page offline`、`CopyDiagnostics=`、`复制诊断` 和连接密码安全提示。
- 在线临时 Mac client 页面状态同样运行 `--status --boardSummary`，确认零退出时输出 `Mac client page online`、`CopyDiagnostics=`、`复制诊断` 和连接密码安全提示。
- 当前状态和任务板已同步：启动助手自测现在覆盖 JSON 内摘要和真实 stdout 单行摘要。
修改文件：
- `scripts/mac/test-mac-client-start-helper.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/test-mac-client-start-helper.mjs`
- `node scripts/mac/test-mac-client-start-helper.mjs --timeoutMs 45000`
遗留问题：
- 本轮只补自测和文档，不启动真实 Windows host、不认证、不发送密码/input/inject。
下一步建议：
- 后续修改 `start-mac-client` 摘要时，直接跑 `test-mac-client-start-helper`，它会同时覆盖 JSON 和真实 `--boardSummary` 输出。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 休息续跑
开发端：Windows Codex
本轮目标：让 Windows PowerShell help 覆盖结果可一行发到 Agent Link Board，并把该命令接入 Windows 恢复总览。
完成内容：
- `scripts/windows/test-windows-powershell-help.mjs` 新增 `--boardSummary`：成功时一行输出 14 个 `.ps1` / 28 条 `-Help/-h` 覆盖结果；`--json` 同步带 `boardSummary`。
- 新增 `scripts/windows/test-windows-powershell-help-summary.mjs`，专项锁定 boardSummary 单行、JSON 字段，以及不泄露 `LAN_DUAL_PASSWORD`、Token、Agent Link 状态或协议流量。
- `scripts/windows/check-windows-resume-status.mjs` 的 JSON、普通输出和 boardSummary 新增 `PowerShellHelp=` / `PowerShellHelpPwsh=`，分别给 Windows PowerShell 与 PowerShell 7 的无密 help 覆盖摘要命令。
- PowerShell wrapper help、Node/PowerShell resume status 回归、Windows host README、当前状态、下一步和任务板已同步。
修改文件：
- `scripts/windows/test-windows-powershell-help.mjs`
- `scripts/windows/test-windows-powershell-help-summary.mjs`
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-windows-powershell-help.mjs`
- `node --check scripts/windows/test-windows-powershell-help-summary.mjs`
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- `node scripts/windows/test-windows-powershell-help-summary.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary`
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-powershell-help-summary.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 60000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 60000`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮只补诊断/交接工具，不运行真实 Mac/Windows 远控、不认证、不发送密码/input/inject。
下一步建议：
- 后续 Windows `.ps1` 改动后，优先把 `PowerShellHelp=` 和 `PowerShellHelpPwsh=` 两条摘要发到通讯板，再按需贴详细失败输出。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 休息续跑
开发端：Windows Codex
本轮目标：给容易误启动本机服务的 Windows PowerShell 入口补 `-Help/-h` 纯帮助，并纳入统一覆盖自检。
完成内容：
- `scripts/windows/test-windows-host.ps1` 新增 `-Help/-h`：说明本机 Windows host 自检、视频/音频/剪贴板/input-log 参数和安全边界；帮助路径早退出，不检查端口、不启动临时 host、不认证、不触碰剪贴板、不采集屏幕/声音、不发送输入。
- `scripts/windows/dev-lab.ps1` 新增 `-Help/-h`：说明 dev lab 检查、启动、停止、构建和端口参数；帮助路径早退出，不跑 Node/npm 检查、不创建 `.dev-lab` 文件、不启动/停止服务、不构建桌面 app。
- `scripts/windows/test-windows-powershell-help.mjs` 自动发现新增两个入口后，覆盖从 12 个 PowerShell 脚本、24 条命令扩展到 14 个脚本、28 条命令，并在 Windows PowerShell 与 PowerShell 7 下通过。
- Windows host README、当前状态、下一步、任务板和锁表已同步。
修改文件：
- `scripts/windows/test-windows-host.ps1`
- `scripts/windows/dev-lab.ps1`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- PowerShell 7 语法解析 `scripts/windows/test-windows-host.ps1`
- PowerShell 7 语法解析 `scripts/windows/dev-lab.ps1`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/dev-lab.ps1 -Help`
- `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-host.ps1 -h`
- `node --check scripts/windows/test-windows-powershell-help.mjs`
- `node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000`
遗留问题：
- 本轮只补帮助和文档，不运行真实 Windows host 自检、不做 Mac 反控 Windows 真连。
下一步建议：
- 后续若继续补剩余 PowerShell 入口，避免碰 `scripts/windows/test-mac-host.ps1` 这类高冲突探针，除非先在 Agent Link Board 明确协调。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Mac Codex

日期：2026-06-17 16:55
开发端：Mac Codex
本轮目标：让 Mac client 本地页面启动/状态助手的一行摘要也带页面复制诊断提示。
完成内容：
- `scripts/mac/start-mac-client.mjs` 的 `--boardSummary` 在线摘要新增 `CopyDiagnostics=Mac client 事件日志点击“复制诊断”`，并提醒粘贴前确认不包含连接密码。
- 离线摘要保留启动下一步，同时提示页面在线后再复制诊断，避免离线时误以为已经能取页面日志。
- `scripts/mac/test-mac-client-start-helper.mjs` 增加在线/离线 JSON 摘要断言，锁住 `CopyDiagnostics=`、`复制诊断` 和连接密码安全提示。
- 当前状态、下一步和任务板已同步该启动助手摘要能力。
修改文件：
- `scripts/mac/start-mac-client.mjs`
- `scripts/mac/test-mac-client-start-helper.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/start-mac-client.mjs`
- `node --check scripts/mac/test-mac-client-start-helper.mjs`
- `node scripts/mac/test-mac-client-start-helper.mjs --timeoutMs 45000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/mac docs`
遗留问题：
- 本轮只补 Mac client 本地页面启动/状态摘要和自测，不连接 Windows host、不认证、不发送密码/input/inject。
下一步建议：
- 现场只想确认本地 Mac client 页面状态时，可先跑 `node scripts/mac/start-mac-client.mjs --status --boardSummary`；若页面在线，再点事件日志“复制诊断”粘贴完整报告。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Mac Codex

日期：2026-06-17 17:05
开发端：Mac Codex
本轮目标：给 Mac script help 的 `--boardSummary` / JSON `boardSummary` 增加专项自测，防止上板摘要后续退化。
完成内容：
- 新增 `scripts/mac/test-mac-script-help-summary.mjs`，只选取 `test-mac-script-help.mjs` 自身跑 `--boardSummary` 和 `--json`，断言摘要为单行、包含纯 help 安全边界，并且 JSON 带同一段 `boardSummary`。
- 专项自测确认摘要不打印 `LAN_DUAL_PASSWORD=`、密码提示、Agent Link Board 状态或协议流量关键词。
- 新脚本纳入统一 Mac help 覆盖；当前 `test-mac-script-help` 覆盖数更新为 44 个脚本、88 条 `--help/-h` 命令。
- 当前状态和任务板已同步为 44/88。
修改文件：
- `scripts/mac/test-mac-script-help-summary.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/test-mac-script-help-summary.mjs`
- `node scripts/mac/test-mac-script-help-summary.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000`
遗留问题：
- 本轮只新增 Mac 侧自测与文档计数，不启动真实服务、不认证、不发送密码/input/inject；真实 Mac 控制 Windows 仍需 Windows host 在线和 Agent Link Board 呼叫配合。
下一步建议：
- 后续修改 `test-mac-script-help` 的摘要或 JSON 输出时，先跑 `test-mac-script-help-summary`，再跑完整 `test-mac-script-help`。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Mac Codex

日期：2026-06-17 16:50
开发端：Mac Codex
本轮目标：让 Mac script help 统一自检可直接输出 Agent Link Board 一行摘要，并让恢复总览推荐这一形态。
完成内容：
- `scripts/mac/test-mac-script-help.mjs` 新增 `--boardSummary`：完整跑 43 个 Mac `.mjs` 脚本、86 条 `--help/-h` 命令后，stdout 只输出一行无密摘要。
- `--json` 结果新增同一段 `boardSummary` 字段，方便自动化消费后再转发通讯板。
- `check-mac-resume-status` 的 `commands.macScriptHelpCommand` / `MacScriptHelp=` 改为 `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`，现场按恢复总览即可得到可发板摘要。
- 文档同步说明该命令不读取 Agent Link Board、不认证、不要求密码、不启动 host/client、不发送 input/inject。
修改文件：
- `scripts/mac/test-mac-script-help.mjs`
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/test-mac-script-help.mjs`
- `node --check scripts/mac/check-mac-resume-status.mjs`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --json`
- `node scripts/mac/test-mac-resume-status.mjs --timeoutMs 45000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000`
遗留问题：
- 本轮只改 Mac 侧 help/恢复总览提示和文档，不启动真实服务、不认证、不发送密码/input/inject；真实 Mac 控制 Windows 仍需 Windows host 在线和 Agent Link Board 呼叫配合。
下一步建议：
- 后续 Mac 端改任意 `.mjs`，先跑恢复总览，再执行 `MacScriptHelp=` 一行摘要；如果失败，先本地看详细普通输出，不要把大量 stderr 或敏感上下文直接贴板。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Mac Codex

日期：2026-06-17 16:35
开发端：Mac Codex
本轮目标：让 Mac 恢复开工总览直接提示统一 Mac script help 安全自检命令。
完成内容：
- `check-mac-resume-status` 新增 `commands.macScriptHelpCommand`，固定为 `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary`。
- JSON、普通输出和 `--boardSummary` 都会输出 `MacScriptHelp=`，方便每次修改 `scripts/mac/*.mjs` 后直接按恢复总览跑统一 `--help/-h` 副作用防线。
- 自测补齐 help 字段、离线/在线 JSON、普通输出和 boardSummary 断言，并确认该命令不带密码、不回显自定义 board server、不读取 Agent Link Board。
修改文件：
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-resume-status.mjs`
- `node --check scripts/mac/test-mac-resume-status.mjs`
- `node scripts/mac/test-mac-resume-status.mjs --timeoutMs 45000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/mac docs`
遗留问题：
- 本轮只补恢复总览提示和回归，不启动真实服务、不认证、不发送密码/input/inject；真实 Mac 控制 Windows 仍需 Windows host 在线和 Agent Link Board 呼叫配合。
下一步建议：
- 后续 Mac 端改任意 `scripts/mac/*.mjs`，先跑恢复总览，再按 `MacScriptHelp=` 运行统一 help 安全自检，最后再发通讯板/推送。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Mac Codex

日期：2026-06-17 14:40
开发端：Mac Codex
本轮目标：加固 Mac `.mjs` 工具的 `--help/-h` 统一自检，防止现场查参数时误触发运行时副作用。
完成内容：
- `scripts/mac/test-mac-script-help.mjs` 在原有 43 个脚本、86 条帮助命令覆盖基础上，新增 forbidden runtime output 检查。
- 自检现在会拒绝密码提示、真实 `LAN_DUAL_PASSWORD=` 值输出、Mac client/server 启动提示、浏览器 DevTools 监听、Swift build 日志、Mac host 启动日志、真实 host 协议收发日志和 Agent Link Board 状态输出。
- 规则按运行时日志/提示形态匹配，允许帮助文本保留安全占位符示例，如 `LAN_DUAL_PASSWORD=...`，避免误伤正常文档。
- 当前状态和任务板已同步；本轮不改 Windows 脚本、不改协议、不启动真实服务。
修改文件：
- `scripts/mac/test-mac-script-help.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/test-mac-script-help.mjs`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000`
遗留问题：
- 本轮只加固 Mac 脚本 help 覆盖，不做真实 Mac 控制 Windows 联调；后续真连仍需通过 Agent Link Board 呼叫 Windows 端配合授权。
下一步建议：
- 后续新增或修改 `scripts/mac/*.mjs` 时，先确认 `--help` 和 `-h` 都是早退出路径，再跑 `node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000`，避免查参数时误启动 host/client 或触发密码/联络板动作。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：同步最近 Windows PowerShell 纯帮助覆盖与安全边界，确保后续现场脚本查参数不会误触发服务、系统改动或采集动作。
完成内容：
- `scripts/windows/test-windows-powershell-help.mjs` 已作为统一 PowerShell help 覆盖自检：自动发现 `scripts/windows/*.ps1` 中声明 `Help` switch 的入口，并验证 `-Help/-h` 快速 0 退出、输出 Usage/Options 帮助且不误触发运行时动作。
- 当前已覆盖 12 个 PowerShell 脚本、24 条帮助命令：反控授权、formal E2E、Windows readiness/resume/video support、dev-env 检查/系统级 setup、Agent Link 启动、Mac alert watcher 启动与直接 watcher、Windows host 启动、WASAPI loopback capture。
- 最近补齐的 `start-codex-link.ps1`、`verify-dev-env.ps1`、`setup-dev-env-admin.ps1`、`watch-codex-link-mac-alerts.ps1` 和 `wasapi-loopback-capture.ps1` 的 `-Help/-h` 都是早退出路径：不创建日志、不启动服务/监听、不改机器环境、不启动 Build Tools 安装器、不初始化 WASAPI、不采集系统声音、不打印 Token、不认证、不发送密码/input/inject。
- `CURRENT_STATUS`、`NEXT_ACTIONS` 和任务板已同步：以后改任意 Windows `.ps1` 入口后，必须跑统一 help 自检的 Windows PowerShell 与 PowerShell 7 两条路径。
修改文件：
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- 文档 diff 审阅
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" docs`
- 代码侧上一轮已在 `849aa1f` 验证：`node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000` 与 `node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000` 均 24/24 通过，`test-mac-alert-watcher` 通过。
遗留问题：
- 本轮只同步文档，不新增代码能力；真实反控和媒体链路仍按现有 NEXT_ACTIONS 继续验收。
下一步建议：
- 后续新增或修改 Windows PowerShell 脚本时，先实现 `-Help/-h` 早退出，再跑 `test-windows-powershell-help` 的 Windows PowerShell 与 PowerShell 7 双路径，避免现场查参数误启动服务或触发系统操作。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Mac Codex

日期：2026-06-17 14:15
开发端：Mac Codex
本轮目标：把 Mac 侧反控授权提示对齐到 Windows PowerShell 推荐入口，同时保留 Node 备用命令。
完成内容：
- Mac client 在 `LAN008`、最近请求或临时授权窗口状态下展示 PowerShell 推荐授权命令，并保留 Node 备用命令；复制按钮只复制 PowerShell 命令，不混入备用命令。
- Mac client 导出/复制诊断文本新增 PowerShell 推荐命令和 Node 备用命令两项。
- `check-mac-client-formal-status` 和 `run-mac-client-formal-smoke` 的 `windowsReverseGrantStatus` / `windowsOpenOneTimeReverseGrant` 改为 PowerShell 推荐命令，并新增 `windowsReverseGrantStatusNodeFallback` / `windowsOpenOneTimeReverseGrantNodeFallback`。
- formal runPlan、boardSummary 和 sendCall 文案都明确 PowerShell 优先、Node fallback；仍强调授权 helper 只能在 Windows host 本机回环运行。
- 当前状态、下一步、任务板和 Mac client README 已同步。
修改文件：
- `apps/mac-client/index.html`
- `apps/mac-client/styles.css`
- `apps/mac-client/app.js`
- `apps/mac-client/README.md`
- `scripts/windows/test-mac-client-browser.mjs`
- `scripts/mac/check-mac-client-formal-status.mjs`
- `scripts/mac/run-mac-client-formal-smoke.mjs`
- `scripts/mac/test-mac-client-formal-status.mjs`
- `scripts/mac/test-mac-client-formal-smoke.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/mac-client/app.js`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node --check scripts/mac/check-mac-client-formal-status.mjs`
- `node --check scripts/mac/run-mac-client-formal-smoke.mjs`
- `node --check scripts/mac/test-mac-client-formal-status.mjs`
- `node --check scripts/mac/test-mac-client-formal-smoke.mjs`
- `node scripts/mac/test-mac-client-formal-status.mjs --timeoutMs 45000`
- `node scripts/mac/test-mac-client-formal-smoke.mjs --timeoutMs 45000`
- `node scripts/windows/test-mac-client-browser.mjs --clientPort 5198 --debugPort 9342 --mockVideo --allowClipboardFallback --skipFileClipboard --progressIntervalMs 0 --timeoutMs 45000`
遗留问题：
- 本轮只补 Mac 侧提示和回归，不启动真实 Windows host、不认证、不发送密码、不发送 input、不执行 inject。
下一步建议：
- 真连演练时，让 Windows 端优先运行 Mac 页面或 formal 摘要里的 PowerShell 授权命令，再让 Mac client 点“重试反控”；PowerShell 不可用时再用 Node fallback。
是否改了协议：否。
是否需要另一端配合：否；后续真实反控演练才需要 Windows 端现场配合。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：给 Windows host readiness 增加 PowerShell 包装入口，方便现场用 PowerShell 7/Windows PowerShell 跑一键体检和 Agent Link Board 摘要。
完成内容：
- 新增 `scripts/windows/check-windows-host-readiness.ps1`，把 `-CheckBoard`、`-BoardSummary`、`-Json`、`-Profile default|deploy|deep`、`-ProbeMedia`、`-ProbeVideo`、`-ProbeAudio`、`-ProbeClipboardSecurity`、`-ProbeWgcH264Sources`、`-Require*` 等常用参数转给同一个 Node readiness 脚本。
- `-Help/-h` 只打印说明，不启动 host、不认证、不要求或打印密码、不发送 input/inject；帮助里同步列出 `WindowsHostMedia=`、`WindowsVideoSupport=`、`ReverseGrant=` 和 `ReverseGrantPs=`。
- `test-windows-host-readiness-board-summary` 扩展到覆盖 PowerShell wrapper help、`-Json -CheckBoard` 和 `-BoardSummary -CheckBoard`，确认一行摘要、active currentCall、`WindowsVideoSupport=`、`ReverseGrantPs=` 和不泄密。
- Windows host README、当前状态、下一步、任务板和锁表已同步。
修改文件：
- `scripts/windows/check-windows-host-readiness.ps1`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-windows-host-readiness-board-summary.mjs`
- PowerShell AST 解析 `scripts/windows/check-windows-host-readiness.ps1`
- Windows PowerShell `-Help` 和 PowerShell 7 `-Help`
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 45000`
- 定点 help coverage
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows apps/windows-host docs`
遗留问题：
- 本轮只补 PowerShell 包装和只读/低风险体检入口；真实 Mac 反控 Windows 仍需 Windows host 在线、用户在 Windows 本机确认授权后再联调。
下一步建议：
- 现场 Mac 控制 Windows 前优先跑 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-host-readiness.ps1 -CheckBoard -BoardSummary` 发一行无密 readiness，再按需要用 `-Profile deploy` 或 `-ProbeMedia` 做更严格验收。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：把 PowerShell 7 版一次性反控授权命令接入 Windows 恢复总览、host status 和 readiness 摘要。
完成内容：
- `check-windows-resume-status` 的 JSON、普通输出和 `--boardSummary` 新增 `ReverseGrantPs=` / `windowsReverseControlGrantPowerShellBoardSummary`，同时保留 Node `ReverseGrant=` 备用命令。
- `start-windows-host --status`、启动后 ready 输出和 `--boardSummary` 新增 `windowsReverseControlGrantPowerShellCommand` / `ReverseGrantPs=`，并把 Node 命令明确标为 fallback。
- `check-windows-host-readiness` 的 runtime JSON、顶层 JSON 和 `boardSummary` 新增 PowerShell 授权命令；即使 runtime 摘要被压缩，也会独立保留 `ReverseGrantPs=`。
- PowerShell 包装帮助、Windows host README、当前状态、下一步、任务板和锁表已同步。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check` 覆盖本轮 7 个 Windows 脚本/测试。
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 45000`
- PowerShell AST 解析 `check-windows-resume-status.ps1` 和 `start-windows-host.ps1`。
- `node scripts/windows/test-windows-script-help.mjs` 定点覆盖本轮相关命令。
- 离线 `check-windows-resume-status --boardSummary` 和 `start-windows-host --status --json` 样例确认 `ReverseGrantPs=` / `windowsReverseControlGrantPowerShellCommand`。
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows apps/windows-host docs`
遗留问题：
- 本轮只补状态/摘要提示，不自动打开授权，也不执行真实反控；正式 Mac 反控 Windows 仍需 Windows host 在线后由 Windows 本机授权，再让 Mac 重试。
下一步建议：
- 真连时优先把 `ReverseGrantPs=` 发到 Agent Link Board 或在 Windows 本机执行，成功后让 Mac client 点“重试反控”确认 accepted。
是否改了协议：否。
是否需要另一端配合：否；后续真实反控演练需要 Mac 端发起请求。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：给 Windows 本机一次性反控授权助手增加 PowerShell 包装入口，方便现场用 PowerShell 7 直接授权/撤销/上板摘要。
完成内容：
- 新增 `scripts/windows/allow-windows-reverse-control.ps1`。
- PowerShell wrapper 支持 `-BoardSummary`、`-Json`、`-Status`、`-Grant`、`-Revoke`、`-Action`、`-DurationMs`、`-TimeoutMs` 和 `-HostName`；`-Help/-h` 只打印说明，不联系 host。
- 包装入口仍只调用 Windows host 本机回环管理端点，不使用或打印密码，不认证远端，不发送输入事件，不执行 `inject`。
- `test-windows-reverse-control-grant-helper` 扩展到同时覆盖 Node 和 PowerShell 的在线授权、状态读取、撤销、离线 boardSummary 和帮助输出。
- Windows host README、当前状态、下一步、任务板和锁表已同步。
修改文件：
- `scripts/windows/allow-windows-reverse-control.ps1`
- `scripts/windows/test-windows-reverse-control-grant-helper.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/allow-windows-reverse-control.mjs`
- `node --check scripts/windows/test-windows-reverse-control-grant-helper.mjs`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -Help`
- PowerShell 7 `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -Help`
- `node scripts/windows/test-windows-reverse-control-grant-helper.mjs --timeoutMs 20000`
- `node scripts/windows/test-windows-script-help.mjs --script allow-windows-reverse-control.mjs --script test-windows-reverse-control-grant-helper.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows apps/windows-host docs`
遗留问题：
- 本轮只补 PowerShell 包装和本机临时授权流程；真实 Mac 反控 Windows 闭环仍需 Windows host 在线、Mac client 发起请求后现场配合。
下一步建议：
- 真连时优先在 Windows 端运行 `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -BoardSummary` 或点桌面面板“临时允许反控”，再让 Mac client 点“重试反控”确认 accepted。
是否改了协议：否。
是否需要另一端配合：否；后续真实反控演练需要 Mac 端发起 `reverse_control_request`。

## 2026-06-17 Mac Codex

日期：2026-06-17 13:51
开发端：Mac Codex
本轮目标：让 Mac client readiness 自身也提示页面复制诊断入口。
完成内容：
- `check-mac-client-readiness` 新增 `commands.macClientCopyDiagnosticsAction`，JSON 可直接读取该提示。
- `--boardSummary` 增加 `CopyDiagnostics=Mac client 事件日志点击“复制诊断”`，和 Mac 恢复总览里的 `MacClientDiagnostics=` 形成闭环。
- 普通输出新增 `Copy diagnostics:` 行，现场不看 JSON 时也能知道下一步怎么粘贴完整页面诊断。
- 自测新增 help、JSON、普通输出、boardSummary 和不泄密断言。
修改文件：
- `scripts/mac/check-mac-client-readiness.mjs`
- `scripts/mac/test-mac-client-readiness.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-client-readiness.mjs`
- `node --check scripts/mac/test-mac-client-readiness.mjs`
- `node scripts/mac/test-mac-client-readiness.mjs --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/mac docs`
遗留问题：
- 本轮只补 Mac client readiness 提示，不打开真实 Windows host、不认证、不发送密码、不发送 input、不执行 inject。
下一步建议：
- 现场先跑 `node scripts/mac/check-mac-client-readiness.mjs --probeClientServer --checkBoard --boardSummary` 发一行 readiness；如需更多细节，再在 Mac client 页面事件日志点“复制诊断”粘贴完整报告。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Mac Codex

日期：2026-06-17 13:18
开发端：Mac Codex
本轮目标：让 Mac 恢复总览直接提示 Mac client 无密诊断和复制诊断入口。
完成内容：
- `check-mac-resume-status` 的 JSON、普通输出和 `--boardSummary` 新增 `macClientDiagnosticsCommand` / `MacClientDiagnostics=`。
- 诊断命令指向 `node scripts/mac/check-mac-client-readiness.mjs --probeClientServer --checkBoard --boardSummary`，只读检查 Mac client 文件/本地页面状态。
- 同一总览新增 `macClientCopyDiagnosticsAction` / `CopyDiagnostics=`，提示在 Mac client 事件日志点击“复制诊断”，粘贴前确认不含连接密码。
- 自测新增 help、JSON、普通输出、boardSummary、在线/离线和不泄密断言。
修改文件：
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-resume-status.mjs`
- `node --check scripts/mac/test-mac-resume-status.mjs`
- `node scripts/mac/test-mac-resume-status.mjs --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/mac docs`
遗留问题：
- 本轮只补 Mac 恢复总览提示，不打开浏览器、不连接 Windows host、不认证、不发送密码、不执行 input/inject。
下一步建议：
- 恢复现场先跑 `node scripts/mac/check-mac-resume-status.mjs --checkBoard --boardSummary`；按摘要里的 `MacClientDiagnostics=` 发一行 Mac client readiness，再按需粘贴页面“复制诊断”的完整报告。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：给 WindowsVideoSupport 视频能力体检增加 PowerShell 包装入口，方便 PowerShell 7 现场直接运行。
完成内容：
- 新增 `scripts/windows/check-windows-video-encoder-support.ps1`。
- PowerShell wrapper 支持 `-BoardSummary`、`-Json`、`-SkipFfmpeg`、`-SkipWgc`、`-SkipWebCodecs`、`-RequireAnyH264`、`-RequireHardwareH264`、`-RequireWgc`、`-RequireWebCodecsH264`、`-Ffmpeg` 和 `-TimeoutMs`。
- `-Help` / `-h` 输出纯帮助，明确该工具只读、不启动 host、不抓屏、不认证、不要求或打印密码、不发送 input/inject。
- `test-windows-video-encoder-support-board-summary` 扩展到同时覆盖 Node 和 PowerShell 的一行摘要、JSON `boardSummary`、失败摘要和帮助输出。
- Windows host README、当前状态、下一步、任务板和锁表已同步。
修改文件：
- `scripts/windows/check-windows-video-encoder-support.ps1`
- `scripts/windows/test-windows-video-encoder-support-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-video-encoder-support.mjs`
- `node --check scripts/windows/test-windows-video-encoder-support-board-summary.mjs`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-video-encoder-support.ps1 -Help`
- `node scripts/windows/test-windows-video-encoder-support-board-summary.mjs --timeoutMs 15000`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-video-encoder-support.ps1 -BoardSummary`
- PowerShell 7 `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-video-encoder-support.ps1 -BoardSummary`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-video-encoder-support.mjs --script test-windows-video-encoder-support-board-summary.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows apps/windows-host docs`
遗留问题：
- 本轮不切换既有 `WindowsVideoSupport=` 摘要里的 Node 命令；PowerShell wrapper 作为现场等价入口并已在文档中说明。
下一步建议：
- H.264/WGC 现场调试前可跑 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-video-encoder-support.ps1 -BoardSummary`，先把一行能力摘要发到 Agent Link Board。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：补齐 Windows host PowerShell 启动/状态入口帮助，让 PowerShell 7/Windows PowerShell 用户也能直接看到无密上板命令。
完成内容：
- `start-windows-host.ps1` 新增 `-Help` / `-h` 纯帮助入口。
- 帮助明确 `-Status -CheckBoard -BoardSummary` 不启动 host、不认证、不要求或打印密码、不发送 input/inject。
- 帮助列出 `WindowsHostMedia=`、`WindowsVideoSupport=` 和 `ReverseGrant=` 三条可发 Agent Link Board 的安全命令。
- `test-windows-host-start-helper` 增加 PowerShell wrapper help 回归，覆盖 `-Help` 和 `-h`，并断言不会误启动 host。
- 当前状态、下一步、任务板和锁表已同步。
修改文件：
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-windows-host-start-helper.mjs`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-windows-host.ps1 -Help`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-windows-host.ps1 -h`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 60000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows docs`
遗留问题：
- 本轮只补 PowerShell 帮助和文档，不启动真实 Windows host、不认证、不发送密码、不执行 input/inject。
下一步建议：
- 白天若从 PowerShell 入口启动或查状态，忘记参数时先跑 `scripts/windows/start-windows-host.ps1 -Help`；现场给通讯板发 Windows host 状态时继续优先用 `-Status -CheckBoard -BoardSummary`。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：让 Windows 恢复总览里的 Windows 控制端诊断命令直接输出通讯板一行摘要。
完成内容：
- `check-windows-resume-status` 的 `windowsClientDiagnosticsCommand` / `WinClientDiagnostics=` 追加 `--boardSummary`。
- 帮助示例同步为 `test-windows-client-browser --discover --diagnosticsOnly --boardSummary --timeoutMs 45000`。
- Node/PowerShell 回归同时断言 JSON 命令和一行 `boardSummary` 都包含该参数，避免以后退回多行输出。
- 当前状态、下一步、任务板和锁表已同步。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-resume-status.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- `node scripts/windows/check-windows-resume-status.mjs --noDiscover --host 127.0.0.1 --port 9 --boardSummary --timeoutMs 12000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows docs`
遗留问题：
- 本轮只改恢复总览推荐命令，不打开浏览器、不连接真实 Mac、不认证、不发送密码、不执行 input/inject。
下一步建议：
- 恢复现场先跑 `node scripts/windows/check-windows-resume-status.mjs --checkBoard --boardSummary`；按摘要里的 `WinClientDiagnostics=` 发一行页面诊断，再按需粘贴页面“复制诊断”的完整快速摘要。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Mac Codex

日期：2026-06-17 13:03
开发端：Mac Codex
本轮目标：给 Mac client 事件日志补“复制诊断”入口，便于现场直接粘贴状态。
完成内容：
- 事件日志面板新增“复制诊断”按钮，复用 `buildLogExportText()` 输出写入 Mac 浏览器剪贴板。
- 成功/失败状态显示在日志面板下方；清空日志时同步清除复制状态。
- 复制不会连接 Windows、不认证、不发送 `input_event`，复制文本沿用导出日志的不含密码约束。
- 页面自测新增按钮、剪贴板内容、无密码字符串和无额外输入事件断言。
修改文件：
- `apps/mac-client/index.html`
- `apps/mac-client/app.js`
- `apps/mac-client/styles.css`
- `apps/mac-client/README.md`
- `scripts/windows/test-mac-client-browser.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/mac-client/app.js`
- `node --check apps/mac-client/server.mjs`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/test-mac-client-browser.mjs --clientPort 5198 --debugPort 9342 --mockVideo --allowClipboardFallback --skipFileClipboard --progressIntervalMs 0 --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" .`
遗留问题：
- 本轮未连接真实 Windows host，只用本机 mock 页面链路验证复制诊断、剪贴板内容和安全边界。
下一步建议：
- 现场需要给另一端或通讯板发 Mac client 状态时，优先点事件日志“复制诊断”，不必下载日志文件；不要把密码或系统账号发上板。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：给 Windows 控制端页面自检新增一行上板摘要，方便真机现场快速回报 UI 诊断结果。
完成内容：
- `scripts/windows/test-windows-client-browser.mjs` 新增 `--boardSummary` 参数。
- 显式启用时，详细 `[OK]` / 进度日志转到 stderr，stdout 只输出一行无密 `Windows client diagnostics: ...` 摘要。
- 摘要包含模式、目标、发现结果、已通过检查项、远端/诊断/FPS/音频/画面摘要，并明确未把密码发到 Agent Link Board、未执行 input/inject。
- README、当前状态、下一步、任务板和锁表已同步。
修改文件：
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `--boardSummary` 实测 stdout 1 行，stderr 14 行详细进度。
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-client-browser.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows apps/windows-client docs`
遗留问题：
- 本轮只验证 diagnostics-only 摘要；真实 Mac 认证连接摘要等下次现场有密码时再跑。
下一步建议：
- 恢复总览给出 `WinClientDiagnostics=` 后，现场可追加 `--boardSummary` 先发一行结果，再按需粘贴页面“复制诊断”的完整快速摘要。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 续跑
开发端：Windows Codex
本轮目标：让 Windows 恢复开工总览直接提示 Windows 控制端无密页面诊断和“复制诊断”入口。
完成内容：
- `check-windows-resume-status` 的 JSON、普通输出和 `--boardSummary` 新增 `windowsClientDiagnosticsCommand` / `WinClientDiagnostics=`，指向 `test-windows-client-browser --discover --diagnosticsOnly`。
- 同一总览新增 `windowsClientCopyDiagnosticsAction` / `CopyDiagnostics=`，提醒在 Windows 控制端事件面板点“复制诊断”，先看“快速摘要”。
- PowerShell 包装帮助同步说明该无密诊断入口；Node/PowerShell 回归新增命令形状、端口、摘要和不泄密断言。
- 当前状态、下一步、任务板和锁表已同步。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- `pwsh -NoProfile -Command '$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile("scripts/windows/check-windows-resume-status.ps1",[ref]$tokens,[ref]$errors) | Out-Null; if ($errors.Count) { exit 1 }; "OK"'`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-resume-status.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows docs`
遗留问题：
- 本轮只补恢复总览提示，不实际打开浏览器、不连接真实 Mac、不启动 Windows host。
下一步建议：
- 明天恢复联调时先看 `check-windows-resume-status --checkBoard --boardSummary`，若出现 UI 卡点，按 `WinClientDiagnostics=` 跑无密页面诊断，再用页面“复制诊断”贴出快速摘要。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 休息续跑
开发端：Windows Codex
本轮目标：给 Windows 控制端复制/导出诊断报告增加顶部快速摘要，方便现场粘贴后先判断卡点。
完成内容：
- `buildLogExportText()` 在详细分段前新增“快速摘要”小节，汇总远端连接、重连、本机协作和画质请求。
- 摘要复用现有页面状态和脱敏诊断数据，不读取或导出密码，也不触发额外 host / watcher 探测。
- 页面 diagnostics 回归新增摘要小节、远端目标、重连原因、本机协作和画质请求断言；复制诊断也确认带摘要。
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
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-client-browser.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps/windows-client scripts/windows docs`
遗留问题：
- 本轮只优化诊断文本可读性，不连接真实 Mac、不启动真实 Windows host。
下一步建议：
- 后续真实联调时，现场优先点 Windows 控制端事件面板“复制诊断”，先看“快速摘要”，再展开看“连接状态 / 本机协作”。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Mac Codex

日期：2026-06-17 12:35
开发端：Mac Codex
本轮目标：补齐 Mac client 反控授权命令一键复制，降低现场手动复制长命令出错概率。
完成内容：
- Mac client “一键反控”帮助区在 `LAN008`、最近请求或临时授权窗口状态下继续显示 Windows 本机回环授权命令，并新增“复制命令”按钮。
- 复制只写入 Mac 端浏览器剪贴板，不访问 Windows host 授权端点，不发送 `input_event`，成功/失败会显示状态并写入本地事件日志。
- accepted/临时授权已使用后命令和复制按钮会一起隐藏；日志导出新增“反控授权复制”状态，便于现场复盘。
- 页面自测新增复制按钮、剪贴板内容、无密码、无额外输入事件断言。
修改文件：
- `apps/mac-client/index.html`
- `apps/mac-client/app.js`
- `apps/mac-client/styles.css`
- `apps/mac-client/README.md`
- `scripts/windows/test-mac-client-browser.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/mac-client/app.js`
- `node --check apps/mac-client/server.mjs`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/test-mac-client-browser.mjs --clientPort 5198 --debugPort 9342 --mockVideo --allowClipboardFallback --skipFileClipboard --progressIntervalMs 0 --timeoutMs 45000`
- `git diff --check`
- `rg -n "^(<{7}|={7}|>{7})" .`
遗留问题：
- 本轮未连接真实 Windows host；只用本机 mock Windows host 验证页面复制、`LAN008 -> 临时授权 -> accepted` 和安全边界。
下一步建议：
- 真实 Mac 控制 Windows smoke 时，若 Mac 页面显示授权命令，可直接点“复制命令”，再通过通讯板让 Windows 端在 Windows 本机终端执行；不要把密码或系统账号发上板。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 休息续跑
开发端：Windows Codex
本轮目标：整理 Windows 控制端诊断报告结构，让远端连接和本机协作状态更容易阅读。
完成内容：
- `buildLogExportText()` 把 Mac 提醒 watcher 和本机被控 Windows host 字段从“连接状态”挪到新增“本机协作”小节。
- 保留原字段名不变，导出日志和复制诊断仍复用同一份脱敏文本。
- 页面 diagnostics 回归新增 `本机协作` 分段断言，复制诊断也确认包含该分段。
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
- 本轮只整理诊断文本结构，没有改真实连接、host 启动或系统剪贴板路径。
下一步建议：
- 若继续做诊断体验，可考虑在报告顶部增加一行短摘要，用于通讯板快速浏览。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 休息续跑
开发端：Windows Codex
本轮目标：给 Windows 控制端增加“复制诊断”入口，方便现场直接粘贴当前状态报告。
完成内容：
- 事件面板新增 `copyLogButton`，显示“复制诊断”按钮。
- 新增 `copyLogsToClipboard()` 和 `writeTextToClipboard()`：优先用 `navigator.clipboard.writeText`，失败时退回隐藏文本框复制；复制内容复用 `buildLogExportText()`，与导出日志保持同一份脱敏文本。
- 页面 diagnostics 回归 mock 剪贴板，确认复制文本包含 Mac 提醒、本机被控状态和脱敏输出，且不包含 fake 密码原文；复制成功会写入“诊断复制”事件。
- README、当前状态、下一步和任务板已同步。
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
遗留问题：
- 本轮没有在真实桌面壳里人工点按钮，只用浏览器页面级自测 mock 剪贴板验证逻辑；桌面实机可在下次联调时顺手点一次确认系统剪贴板。
下一步建议：
- 后续可把复制诊断也做进 Mac client，形成双端一致的现场反馈入口。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 休息续跑
开发端：Windows Codex
本轮目标：让 Windows 控制端导出日志记录本机被控 Windows host 状态，方便 Mac 反控 Windows 排查。
完成内容：
- `buildLogExportText()` 新增本机被控诊断字段：状态、徽标、详情、端口、画面/声音/输入/反控策略、体检档位、媒体基线开关、最近状态输出摘要和“密码不导出”说明。
- 新增 `getLocalHostExportStatus()`、`getLocalHostOutputSummary()` 和脱敏函数；导出只读取页面已有状态，不启动 host、不探测端口、不读取被控密码输入框。
- 页面 diagnostics 回归模拟 Windows host 正在运行，并在最近输出里放入 fake `password=...`，确认导出文本会脱敏为 `password=<hidden>` 且不包含原始值。
- 顺手修复桌面专属面板自测对反控策略/媒体基线选项的状态污染，临时改值后会恢复原值。
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
- 本轮不启动真实 Windows host，不验证真实 Mac 反控 Windows；只是把页面已有本机状态纳入导出日志。
下一步建议：
- 后续可把导出文本重排成“远端连接 / 本机协作 / 事件记录”三段，提高现场阅读效率。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 休息续跑
开发端：Windows Codex
本轮目标：让 Windows 控制端导出日志记录本机 Mac 提醒 watcher 状态，方便窗口最小化提醒链路排查。
完成内容：
- `buildLogExportText()` 新增“Mac 提醒”诊断字段：状态、详情、最近检查时间、自动轮询间隔和联络板地址。
- 新增 `getMacAlertWatcherExportStatus()` / `formatMacAlertWatcherCheckedAt()`，只读取前端已有状态，不自动启动 watcher，也不触发额外 PowerShell 查询。
- `test-windows-client-browser --diagnosticsOnly` 的重连/导出日志回归新增 watcher 字段断言，确认导出文本带 `提醒中`、最近检查、15 秒轮询和默认联络板地址。
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
- 本轮不启动真实 watcher，不测试系统浮窗 lifecycle；完整后台 lifecycle 仍用 `test-mac-alert-watcher --includeLifecycle` 或桌面按钮人工验收。
下一步建议：
- 若后续继续增强现场排查，可以把导出日志里的本机被控状态、体检摘要和 watcher 状态整理成更明显的“本机协作状态”小节。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 12:21
开发端：Windows Codex
本轮目标：给桌面壳 Mac 提醒 watcher 状态查询加节流，避免频繁启动 PowerShell。
完成内容：
- `apps/windows-client/app.js` 新增 `localMacAlertWatcherStatusPollMs=15000` 和 `shouldRefreshMacAlertWatcherStatus`；自动本机状态轮询仍 2.5 秒，但 watcher 状态查询约 15 秒才触发一次。
- 手动“刷新提醒”、开启和停止 watcher 仍会立即调用 Tauri 命令，不受自动节流影响。
- 页面自测新增 watcher 节流阈值断言，锁定无缓存立即查、15 秒前不查、到 15 秒后再查。
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
- 本轮只改前端轮询节流，没有重新跑桌面壳真实按钮 lifecycle；完整 watcher 后台 lifecycle 仍可用 `test-mac-alert-watcher --includeLifecycle` 或人工点按钮验收。
下一步建议：
- 后续如果桌面壳继续增加后台工具状态，优先采用类似节流/缓存策略，避免每轮 UI 状态刷新都启动外部进程。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 12:13
开发端：Windows Codex
本轮目标：把 Windows 本机 Mac 提醒 watcher 接入桌面壳。
完成内容：
- Tauri 后端新增 `get_mac_alert_watcher_status`、`start_mac_alert_watcher`、`stop_mac_alert_watcher`，统一调用 `scripts/windows/start-mac-alert-watcher.ps1 -Json`，默认联络板为 `http://192.168.31.68:17888`。
- Windows 控制端“本机被控”面板新增“Mac 提醒”区：显示 `需桌面版/未开启/提醒中/不可用`，可一键开启或停止 Windows 本机浮窗 watcher，并可刷新状态。
- 页面轮询会同时读取 watcher 状态；浏览器预览版保持禁用，不会启动后台 watcher。
- `test-windows-client-browser --diagnosticsOnly` 的桌面专属面板回归新增默认联络板地址、按钮禁用、运行/未运行文案和纯格式化函数断言。
- README、当前状态、下一步和任务板已同步。
修改文件：
- `apps/windows-desktop/src-tauri/src/main.rs`
- `apps/windows-client/index.html`
- `apps/windows-client/app.js`
- `apps/windows-client/styles.css`
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
- `cargo check --manifest-path apps/windows-desktop/src-tauri/Cargo.toml`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-mac-alert-watcher.ps1 -Server http://192.168.31.68:17888 -Status -Json`
- `cargo test --manifest-path apps/windows-desktop/src-tauri/Cargo.toml`
遗留问题：
- 本轮未真实点击桌面壳按钮启动 watcher，只验证 Tauri 编译、PowerShell JSON status 和页面逻辑；如需完整后台 lifecycle，仍可跑 `test-mac-alert-watcher --includeLifecycle` 或人工点桌面按钮。
下一步建议：
- 明天 Windows 侧等待 Mac 授权/权限/反控重试时，优先打开桌面壳“本机被控 -> Mac 提醒”并点“开启提醒”；命令行入口作为备用。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 12:06
开发端：Windows Codex
本轮目标：让 Windows 恢复开工总览优先消费 Mac alert watcher 的机器可读状态。
完成内容：
- `check-windows-resume-status` 调用 `start-mac-alert-watcher.ps1 -Status -Json` 判断本机 Mac 提醒 watcher 是否运行，不再优先解析人类文本。
- JSON 报告新增 `windowsMacAlertWatcher.source`、`payload` 和 `parseError`；`source=json` 时可直接读取原始状态对象，旧环境或 JSON 不可用时仍退回文本兜底。
- Node/PowerShell 恢复总览回归都锁定 `source=json`、`payload.action=status` 和空 `parseError`。
- 当前状态、下一步和任务板已同步，ACTIVE_LOCKS 已释放。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- PowerShell 7 AST 语法解析 `scripts/windows/check-windows-resume-status.ps1`
- `node scripts/windows/check-windows-resume-status.mjs --noDiscover --host 127.0.0.1 --port 9 --json --timeoutMs 12000`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-resume-status.mjs --script test-windows-resume-status.mjs --script test-windows-resume-status-powershell.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 60000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 60000`
- `git diff --check`
- 行首冲突标记扫描
遗留问题：
- 这轮不启动正式 watcher，只做状态读取路径；完整 watcher 后台 lifecycle 仍按 `test-mac-alert-watcher --includeLifecycle` 手动深跑。
下一步建议：
- 后续桌面壳或自动化读取 watcher 状态时直接消费 `windowsMacAlertWatcher.payload/running/source`，不要再解析输出文本。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 12:02
开发端：Windows Codex
本轮目标：给 Windows Mac alert watcher 启动器增加机器可读 JSON 输出。
完成内容：
- `scripts/windows/start-mac-alert-watcher.ps1` 新增 `-Json`：`-Status`、`-Stop`、启动、重复启动和 `-Restart` 路径都会输出单个 JSON 对象，包含 `action`、`running`、`processIds`、日志路径、`powerShell` 和 `message`。
- `-Json` 输出不会回显 `-Token`，适合恢复总览、桌面壳或后续自动化稳定消费。
- 修正 `-Restart -Json` 只输出最终一个 JSON 对象，不会先输出 stop JSON 再输出 restart JSON。
- `test-mac-alert-watcher` 新增 `-Status -Json` 和未运行 `-Stop -Json` 断言，确认输出可解析且不泄露测试 token。
- 当前状态、下一步、任务板和联络板说明已同步。
修改文件：
- `scripts/windows/start-mac-alert-watcher.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/LAN_CODEX_LINK.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- PowerShell 7 AST 语法解析 `scripts/windows/start-mac-alert-watcher.ps1`
- `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-mac-alert-watcher.ps1 -Server http://127.0.0.1:1 -Status -Json`
- `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-mac-alert-watcher.ps1 -Server http://127.0.0.1:1 -Stop -Json`
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script test-mac-alert-watcher.mjs --timeoutMs 10000`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 30000`
- `git diff --check`
- 行首冲突标记扫描
遗留问题：
- 这轮默认回归只测不启动正式 watcher 的 JSON status/stop；完整后台 lifecycle 仍保留在 `--includeLifecycle` 手动深跑入口，避免常规回归在少数 PowerShell alias 环境悬挂。
下一步建议：
- 后续接 Windows 桌面壳时优先消费 `start-mac-alert-watcher.ps1 -Status -Json`，不要再解析人类文本。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 11:49
开发端：Windows Codex
本轮目标：让 Windows 恢复开工总览只读显示本机 Mac 提醒 watcher 是否运行。
完成内容：
- `check-windows-resume-status` 新增 `windowsMacAlertWatcher` JSON 字段，运行现有 `start-mac-alert-watcher.ps1 -Status` 只读检查 watcher 状态，不自动启动后台进程。
- 普通输出新增 `Windows Mac alert watcher: running/not-running/unknown/unavailable`，开工时能直接判断是否需要启动本机浮窗提醒。
- PowerShell 包装帮助同步说明 watcher status 只读检查；Node/PowerShell 回归新增状态字段断言。
- 当前状态、下一步和任务板已同步。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- `node scripts/windows/check-windows-resume-status.mjs --noDiscover --host 127.0.0.1 --port 9 --json --timeoutMs 12000`
- PowerShell 7 AST 语法解析 `scripts/windows/check-windows-resume-status.ps1`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-resume-status.mjs --script test-windows-resume-status.mjs --script test-windows-resume-status-powershell.mjs --timeoutMs 10000`
- `node scripts/windows/check-windows-resume-status.mjs --noDiscover --host 127.0.0.1 --port 9 --timeoutMs 12000`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 60000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 60000`
遗留问题：
- 这轮只读查询 watcher 状态，不自动启动 watcher；如果显示 `not-running`，仍需按恢复总览里的 start 命令手动启动。
下一步建议：
- 后续可考虑把 watcher 状态接入 Windows 桌面壳“本机被控/协作”区域，但这轮先保持 CLI 总览低风险。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 11:47
开发端：Windows Codex
本轮目标：把 Windows 本机 Mac 提醒 watcher 的启动/状态命令纳入恢复开工总览。
完成内容：
- `check-windows-resume-status` 的 JSON/普通输出新增 `windowsMacAlertWatcherStart` 和 `windowsMacAlertWatcherStatus`，直接给出 `start-mac-alert-watcher.ps1 -Server <Agent Link Board>` 与 `-Status`。
- PowerShell 包装帮助同步说明本机 Mac 提醒 watcher 命令；`--boardSummary` 仍保持短摘要，只保留 Mac preflight、WindowsHostMedia、ReverseGrant 和 no password/no input/inject 安全说明。
- Node/PowerShell 回归新增 watcher 命令断言，确认命令包含当前 Agent Link Board server、不误标 start 为 status，并继续确认不泄露测试密码。
- 当前状态、下一步和任务板已同步。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- PowerShell 7 AST 语法解析 `scripts/windows/check-windows-resume-status.ps1`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-resume-status.mjs --script test-windows-resume-status.mjs --script test-windows-resume-status-powershell.mjs --timeoutMs 10000`
- `node scripts/windows/check-windows-resume-status.mjs --noDiscover --host 127.0.0.1 --port 9 --json --timeoutMs 12000`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 60000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 60000`
遗留问题：
- 这轮只把 watcher 管理命令放进恢复总览，不自动启动后台 watcher，不认证、不要求密码、不发送输入、不执行 inject。
下一步建议：
- 后续 Windows 开工先跑恢复总览；需要等待 Mac 端授权、权限或反控重试时，复制普通输出里的 watcher start/status 命令打开本机浮窗提醒。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-17 Windows Codex

日期：2026-06-17 11:37
开发端：Windows Codex
本轮目标：补强 Windows 本机 Agent Link watcher，让 Mac 端等待反控临时授权时也能弹 Windows 本机提醒。
完成内容：
- `watch-codex-link-mac-alerts.ps1` 的 urgent 规则新增 `LAN008`、`ReverseGrant`、`allow-windows-reverse-control`、`reverse_control_request/response` 和中英文反控授权等待关键词。
- watcher 现在会在 Mac 消息或 Mac 状态里看到“临时允许反控 / 重试反控”等文字时提醒 Windows，适合 Mac client 请求反控被默认 `LAN008` 安全拒绝后提示 Windows 打开一次性授权。
- `test-mac-alert-watcher` 新增 fake Agent Link Board 回归，覆盖 Mac 反控授权消息和 Mac waiting 状态提醒，并继续确认非 Mac 事件不误报。
- 当前状态、下一步、任务板和联络板说明已同步。
修改文件：
- `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/LAN_CODEX_LINK.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- PowerShell 7 AST 语法解析 `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `node scripts/windows/test-windows-script-help.mjs --script test-mac-alert-watcher.mjs --timeoutMs 10000`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 30000`
遗留问题：
- 这轮只增强联络板提醒器，不启动真实 Windows host、不认证、不发送密码、不发送输入、不执行 inject。
下一步建议：
- 后续 Mac 端发起反控演练时，如果 Mac 状态或消息写出 `LAN008` / `ReverseGrant`，Windows watcher 后台运行即可弹本机提醒；Windows 端再按摘要里的 `allow-windows-reverse-control` 或桌面按钮打开一次性授权，让 Mac 重试。
是否改了协议：否。
是否需要另一端配合：真实闭环仍需要 Mac 端发起反控请求；本轮自测不需要另一端配合。

## 2026-06-17 Windows Codex

日期：2026-06-17 11:27
开发端：Windows Codex
本轮目标：让 Windows 恢复开工总览也直接提示本机一次性反控授权命令，方便明天接着做 Mac 反控 Windows 联调。
完成内容：
- `check-windows-resume-status` 的 JSON、普通输出和 `--boardSummary` 新增 `windowsReverseControlGrantBoardSummary` / `ReverseGrant=`，指向 Windows 本机回环授权命令 `allow-windows-reverse-control --host 127.0.0.1 --port 43770 --durationMs 30000 --boardSummary`。
- PowerShell 包装帮助同步说明恢复总览同时给出媒体基线命令和本机一次性反控授权命令。
- Node/PowerShell 回归覆盖帮助、JSON、boardSummary 中的 `ReverseGrant=`，并继续确认不泄露测试密码。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- PowerShell 7 AST 语法解析 `scripts/windows/check-windows-resume-status.ps1`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-resume-status.mjs --script test-windows-resume-status.mjs --script test-windows-resume-status-powershell.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 60000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 60000`
- `node scripts/windows/check-windows-resume-status.mjs --noDiscover --host 127.0.0.1 --port 9 --boardSummary --timeoutMs 12000`
遗留问题：
- 这轮只补恢复总览提示，不启动真实 Windows host、不认证、不发送密码、不发送输入、不执行 inject。
下一步建议：
- 明天恢复时先跑 `node scripts/windows/check-windows-resume-status.mjs --checkBoard --boardSummary`；如 Mac 端要演练反控，按摘要里的 `ReverseGrant=` 在 Windows 本机打开一次性授权，再让 Mac 点“重试反控”。
是否改了协议：否。
是否需要另一端配合：真实闭环仍需要 Mac 端发起 `reverse_control_request` 后双方现场确认；本轮代码回归不需要另一端配合。

## 2026-06-17 Mac Codex

日期：2026-06-17 11:54
开发端：Mac Codex
本轮目标：让 Mac client 反控请求 UI 在现场联调时直接给出 Windows 本机一次性授权命令，减少 `LAN008` 后通讯板来回确认。
完成内容：
- “一键反控”区域新增授权提示和可选中命令块；未连接/未认证/未声明策略时显示轻提示，不打扰主流程。
- 当 Mac 请求反控被 `LAN008` 默认安全拒绝、或 Windows discovery 暴露最近请求时，页面显示 Windows 本机回环命令：`node scripts/windows/allow-windows-reverse-control.mjs --host 127.0.0.1 --port <Windows host port> --grant --durationMs 30000 --boardSummary`。
- 当 Windows 已打开一次性授权窗口时，页面提示 Mac 立即点“重试反控”，并继续显示同一条 Windows 本机命令；accepted/临时授权已使用后会隐藏命令，避免误导 Windows 重复授权。
- 日志导出新增“反控授权提示”和“Windows 本机授权命令”，方便真实联调现场复盘；命令不包含密码、token 或系统账号信息。
- 页面自测扩展断言：`LAN008` 后命令出现且为 `--host 127.0.0.1 --port <当前 Windows host port>`，临时授权时仍显示，accepted 后隐藏；仍确认不泄露密码、不发送额外 `input_event`。
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
- `node --check apps/mac-client/server.mjs`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/test-mac-client-browser.mjs --clientPort 5198 --debugPort 9342 --mockVideo --allowClipboardFallback --skipFileClipboard --progressIntervalMs 0 --timeoutMs 45000`
遗留问题：
- 本轮仍不连接真实 Windows host、不认证、不触发真实反控、不执行 inject；真实验收需要 Windows 端本机运行 helper 或点击桌面面板按钮配合。
下一步建议：
- 真连时 Mac 先点“请求反控”看到 `LAN008`，页面会直接显示 Windows 本机授权命令；Windows 端运行命令或点“临时允许反控”后，Mac 点“重试反控”确认 accepted/临时授权已使用。
是否改了协议：否。只增加 Mac client UI/日志提示，继续使用已有 `reverse_control_request` / `reverse_control_response` 和 Windows 本机授权 helper。
是否需要另一端配合：真实联调需要 Windows 端本机执行一次性授权命令或点击桌面面板；本轮自测不需要真实 Windows 配合。

## 2026-06-17 Mac Codex

日期：2026-06-17 09:28
开发端：Mac Codex
本轮目标：把 Mac 控制 Windows formal checklist/smoke 的执行计划补齐到“请求反控 -> Windows 本机一次性授权 -> Mac 重试 accepted”的安全演练闭环，方便后续真机联调照通讯板执行。
完成内容：
- `check-mac-client-formal-status` 的 `runPlan.commands` 新增 Windows 本机回环授权状态命令、一次性授权命令和 `reverseControlRehearsal` 文本；`runPlan.steps` 新增 `reverse-control-request` 步骤，明确先点“请求反控”预期 `LAN008`，Windows 本机运行 `allow-windows-reverse-control --grant --durationMs 30000 --boardSummary`，Mac 再点“重试反控”预期 accepted/临时授权已使用。
- formal `--sendCall` 的 Agent Link Board call 文本同步带上反控演练说明和 Windows 本机授权命令；仍只发送无密协调信息，不认证、不发密码、不发送输入、不执行 inject。
- `run-mac-client-formal-smoke` 的 `--preflightOnly` / `--dryRun` JSON 和 `--boardSummary` 也会输出同一套反控演练命令，发现/ensureClient/sendCall 路径均保留秘密安全边界。
- 自测补齐新增字段、boardSummary、call payload 和 no secret/no input/no inject 断言；修复本轮新增 boardSummary 里误用外层 `args` 的作用域问题。
修改文件：
- `scripts/mac/check-mac-client-formal-status.mjs`
- `scripts/mac/run-mac-client-formal-smoke.mjs`
- `scripts/mac/test-mac-client-formal-status.mjs`
- `scripts/mac/test-mac-client-formal-smoke.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-client-formal-status.mjs`
- `node --check scripts/mac/run-mac-client-formal-smoke.mjs`
- `node --check scripts/mac/test-mac-client-formal-status.mjs`
- `node --check scripts/mac/test-mac-client-formal-smoke.mjs`
- `node scripts/mac/test-mac-client-formal-status.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-client-formal-smoke.mjs --timeoutMs 30000`
遗留问题：
- 这轮只补齐 formal 计划、通讯板摘要和自动测试，不连接真实 Windows host、不认证、不触发真实反控、不执行 inject。
下一步建议：
- 真连时先跑 `node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --sendCall` 协调 Windows；用户在场后 Mac 端用 `--promptPassword` 跑真实页面 smoke。要验收反控闭环时，Mac 先点“请求反控”看到 `LAN008`，Windows 本机运行 `node scripts/windows/allow-windows-reverse-control.mjs --grant --durationMs 30000 --boardSummary` 或点桌面面板“临时允许反控”，Mac 再点“重试反控”。
是否改了协议：否。只消费已有 `reverse_control_request` / `reverse_control_response` 和 Windows 本机授权助手。
是否需要另一端配合：后续真实联调需要 Windows 端在本机运行一次性授权命令或点击桌面面板按钮；本轮自测不需要真实 Windows 配合。

## 2026-06-17 Mac Codex

日期：2026-06-17 09:05
开发端：Mac Codex
本轮目标：补齐 Mac client 的受保护“请求反控/重试反控”入口，让 Windows 默认拒绝、临时允许、重试成功形成页面闭环。
完成内容：
- Mac client 会话诊断下方新增“一键反控”操作区和状态行，按钮只在已连接、已认证且 Windows host 声明支持反控接收时启用。
- 点击按钮只通过当前 WebSocket 发送 `reverse_control_request`，携带 `requestId`、来源和平台信息，不发送密码、不发送输入事件、不执行 inject。
- 页面新增 `reverse_control_response` 处理：默认 `LAN008` 会提示“Windows 已安全拒绝，请在 Windows 端临时允许后重试”；发现临时授权后按钮显示“重试反控”；accepted 且授权被消耗时显示“Windows 已同意 / 临时授权已使用”。
- 日志导出新增“反控请求”状态，断线、认证失败、目标变更和手动断开会清理旧反控请求状态。
- 页面自测新增反控请求闭环：默认拒绝、回环临时授权、重试成功、不泄露密码和不发送额外 input_event。
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
- `node --check apps/mac-client/server.mjs`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/test-mac-client-browser.mjs --clientPort 5198 --debugPort 9342 --mockVideo --allowClipboardFallback --skipFileClipboard --progressIntervalMs 0 --timeoutMs 45000`
遗留问题：
- 这轮只完成页面请求和回执产品闭环；真实 Mac 控制 Windows 的完整方向切换/接管体验仍需双方在现场用 Agent Link Board call 协调后联调，不能自动执行 inject。
下一步建议：
- 真实 Windows host 在线时，让 Mac client 先点“请求反控”触发 `LAN008`，Windows 本机点“临时允许反控”，Mac 再点“重试反控”；确认 accepted 后再讨论真实切换控制方向的后续实现。
是否改了协议：否。使用 Windows host 已存在的 `reverse_control_request` / `reverse_control_response` 消息和 `reverseControlGrant` 能力字段。
是否需要另一端配合：真实联调需要 Windows 端打开一次性临时授权并观察 Windows host/桌面面板状态；本轮本机临时 host 自测不需要真实 Windows 配合。

## 2026-06-17 Windows Codex

日期：2026-06-17 11:15
开发端：Windows Codex
本轮目标：让 Windows host 状态和 readiness 摘要直接带出临时反控授权命令，方便 Mac client 请求反控入口完成后现场联调。
完成内容：
- `start-windows-host --status` JSON 新增 `windowsReverseControlGrantCommand`，普通输出、启动后 ready 输出和在线 `--boardSummary` 在默认需确认策略下显示 `Windows reverse grant command` / `ReverseGrant=`。
- `check-windows-host-readiness` JSON 新增 `windowsReverseControlGrantCommand`，`--boardSummary` 即使压缩运行时摘要也会独立保留 `ReverseGrant=...allow-windows-reverse-control...`，避免命令被长 Mac next 文本截掉。
- `test-windows-host-start-helper` 和 `test-windows-host-readiness-board-summary` 已覆盖离线、在线、启动 ready 输出、JSON、boardSummary、pending-request 和 temporary-grant 两种反控状态里的命令可见性。
- Windows host README、当前状态、下一步和任务板已同步；本轮仍未碰 `apps/mac-client`，避免和 Mac 端请求反控入口工作冲突。
修改文件：
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node --check scripts/windows/test-windows-host-start-helper.mjs`
- `node --check scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 60000`
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 120000 --readinessTimeoutMs 10000`
遗留问题：
- 还需要 Mac 端请求反控按钮推送后做真实闭环：Mac 请求一次看到 `LAN008`，Windows 用摘要里的 `ReverseGrant=` 打开一次性授权，再让 Mac 重试确认 accepted。
下一步建议：
- Mac 端推送后，Windows 端 pull/rebase，优先跑 `test-mac-client-browser` 的反控请求回归；若真实 Windows host 在线，可直接把 `start-windows-host --status --checkBoard --boardSummary` 摘要发通讯板，按其中 `ReverseGrant=` 配合 Mac 重试。
是否改了协议：未改协议；只给状态 JSON 和无密摘要增加现有本机授权助手命令提示。
是否需要另一端配合：需要 Mac 端完成并推送 Mac client 请求反控入口后，一起跑 `LAN008 -> ReverseGrant -> accepted` 闭环。

## 2026-06-17 Windows Codex

日期：2026-06-17 08:58
开发端：Windows Codex
本轮目标：避开 Mac 端正在处理的 Mac client 请求反控入口，补齐 Windows 本机一次性反控授权的命令行备用流程。
完成内容：
- 新增 `allow-windows-reverse-control.mjs`：可对本机 Windows host 执行 `--status`、默认 `--grant` 和 `--revoke`，只访问回环管理端点，不要求密码、不发送输入、不执行 `inject`。
- 支持 `--json` 和 `--boardSummary`：在线时输出当前 `reverseControlMode`、授权窗口、最近请求；离线时仍输出干净失败 JSON / 单行摘要，适合上 Agent Link Board。
- 新增 `test-windows-reverse-control-grant-helper.mjs`：启动临时 Windows host，覆盖状态读取、一次性授权、boardSummary、撤销授权和离线安全摘要。
- Windows host README、当前状态、下一步和任务板已同步；本轮不碰 `apps/mac-client`，避免和 Mac Codex 00:22 的请求反控入口工作冲突。
修改文件：
- `scripts/windows/allow-windows-reverse-control.mjs`
- `scripts/windows/test-windows-reverse-control-grant-helper.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/allow-windows-reverse-control.mjs`
- `node --check scripts/windows/test-windows-reverse-control-grant-helper.mjs`
- `node scripts/windows/test-windows-reverse-control-grant-helper.mjs --timeoutMs 15000`
遗留问题：
- Mac client 请求按钮和 `reverse_control_response` 状态显示由 Mac 端本轮继续处理；Windows 侧已提供命令行临时授权入口，方便后续真连时配合重试。
下一步建议：
- Mac 端推送请求反控入口后，Windows 端 pull/rebase，再跑 Mac client 页面自测与真实 Windows host 一次性授权联调：先让 Mac 请求一次看到 `LAN008`，Windows 执行 `allow-windows-reverse-control --boardSummary`，再让 Mac 重试确认 accepted。
是否改了协议：未改协议；只新增 Windows 本机管理端点的命令行封装和自测。
是否需要另一端配合：需要 Mac 端后续基于已在做的 Mac client 请求入口联调一次 `LAN008 -> 临时允许 -> 重试 accepted` 流程。

## 2026-06-17 Windows Codex

日期：2026-06-17 00:18
开发端：Windows Codex
本轮目标：让 Windows readiness 的 runtime/boardSummary 保留一次性反控授权和最近请求状态，避免只读体检把 `temporary-grant` / `pending-request` 降级成普通 `deny`。
完成内容：
- `check-windows-host-readiness` 的 runtime 能力摘要新增反控状态优先级：临时授权优先显示 `reverse=temporary-grant`，最近被拒绝请求优先显示 `reverse=pending-request`，否则再显示 `deny-confirm` / `accept-lab` / `disabled`。
- `test-windows-host-readiness-board-summary` 新增本机临时 Windows host 回归：先认证发送默认拒绝的 `reverse_control_request`，确认 readiness runtime 和 boardSummary 均显示 `pending-request`；再通过本机 `/reverse-control/grant` 打开一次性授权，确认显示 `temporary-grant`。
- Windows host README、当前状态、下一步和任务板已同步；ACTIVE_LOCKS 将释放本轮文件。
修改文件：
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node --check scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 120000 --readinessTimeoutMs 10000`
遗留问题：
- Mac client 仍需要后续真正的“请求反控/收到 LAN008 后引导 Windows 临时允许/临时授权后重试”产品化按钮和回执状态。
下一步建议：
- 继续做 Mac client 的受保护请求反控按钮，或做 Windows 端 readiness/桌面面板在真实 Windows host 常驻时的端到端人工验收。
是否改了协议：否。只消费已存在的 `capabilities.reverseControl.grant` / `lastRequest` 状态。
是否需要另一端配合：暂不强制；真实反控闭环验收时需要 Mac 端发起请求、Windows 端点击临时允许后重试。

## 2026-06-17 Windows Codex

日期：2026-06-17 00:10
开发端：Windows Codex
本轮目标：让 Mac 控制 Windows 页面显示 Windows host 的一次性临时反控授权和最近请求状态，补齐昨晚 Windows `reverseControlGrant` 的可见闭环。
完成内容：
- Mac client 的 `normalizeRemoteCapabilities` 现在会读取 `capabilities.reverseControlGrant` 或对象化 `reverseControl.grant`。
- “反控策略”诊断行在 Windows 已打开一次性授权时显示“Windows 已临时允许一次 / N 秒内重试”。
- Windows 已记录最近被默认拒绝的反控请求时，Mac client 会显示“Windows 已收到请求 / 临时允许后重试”。
- 页面 formatter 回归覆盖默认拒绝、实验自动同意、未启用、临时授权和最近请求五种格式。
- Mac client README、当前状态、下一步和任务板已同步。
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
- `node scripts/windows/test-mac-client-browser.mjs --diagnosticsOnly --timeoutMs 45000 --progressIntervalMs 0`
- `node --check apps/mac-client/server.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script test-mac-client-browser.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" <本轮文件>`（无冲突标记）
遗留问题：
- 这仍是“状态提示”闭环，Mac client 还没有真正的“请求反控/重试反控”按钮和 `reverse_control_response` 产品化状态。
下一步建议：
- 下一轮可在 Mac client 增加受保护的“请求反控”按钮：默认先提示 Windows 端需要临时允许，收到 `LAN008` 后保留待重试状态；发现 `reverseControlGrant.active` 后引导用户立即重试。
是否改了协议：否。只消费 Windows host 已暴露的可选 discovery 能力字段，旧 host 没有该字段时保持原显示。
是否需要另一端配合：暂不强制需要；真实反控联调时需要 Windows 端打开一次性临时授权窗口。

## 2026-06-16 Mac Codex

日期：2026-06-16 23:55
开发端：Mac Codex
本轮目标：让 Mac 控制 Windows 页面直接显示 Windows host 当前反控策略，避免真连前看不出默认拒绝、实验同意或禁用状态。
完成内容：
- Mac client 会话诊断新增“反控策略”行，初始显示“未提供”。
- 从 `/discovery`、`hello_ack` 和 `session_answer` 读取 Windows host 的 `reverseControlMode`、`reverseControlPolicy`，并兼容对象化 `capabilities.reverseControl` 状态。
- UI 显示默认拒绝、实验自动同意、未启用和未知策略的中文说明；默认拒绝会明确“需要 Windows 用户确认”，实验同意会标注“仅可信局域网实验”。
- 目标变更、发现失败、连接开始、连接关闭、认证失败、手动断开和重连等待都会清空旧反控策略，避免 stale 状态误导用户。
- Mac client 日志导出新增“反控策略”字段，页面自测覆盖正常连接、认证失败、重连等待/恢复、手动断开清空、导出文本和扁平/对象/disabled 三类能力格式。
修改文件：
- `apps/mac-client/index.html`
- `apps/mac-client/app.js`
- `apps/mac-client/README.md`
- `scripts/windows/test-mac-client-browser.mjs`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/mac-client/app.js`
- `node --check apps/mac-client/server.mjs`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/test-mac-client-browser.mjs --clientPort 5198 --debugPort 9342 --mockVideo --allowClipboardFallback --skipFileClipboard --progressIntervalMs 0 --timeoutMs 45000`
- `node scripts/windows/test-mac-client-browser.mjs --clientPort 5198 --debugPort 9342 --mockVideo --allowClipboardFallback --skipFileClipboard --expectAuthFailure --expectedAttemptsRemaining 2 --expectedMaxAttempts 3 --clientPassword wrong-password --progressIntervalMs 0 --timeoutMs 45000`
- `node scripts/windows/test-mac-client-browser.mjs --clientPort 5198 --debugPort 9342 --mockVideo --allowClipboardFallback --skipFileClipboard --expectReconnect --testReconnectNow --progressIntervalMs 0 --timeoutMs 60000`
- `node scripts/windows/test-windows-script-help.mjs --script test-mac-client-browser.mjs --timeoutMs 10000`
- `git diff --check`
- 冲突标记扫描：`apps/mac-client/README.md`、`apps/mac-client/app.js`、`apps/mac-client/index.html`、`scripts/windows/test-mac-client-browser.mjs`
- 内置浏览器打开 `http://127.0.0.1:5188/`，确认存在 `#reversePolicyMetric` 且初始值为“未提供”。
遗留问题：
- Mac client 目前只展示策略，还没有发送 `reverse_control_request` 或消费 Windows 一次性临时授权窗口做“立即请求反控”的完整体验。
下一步建议：
- Windows host 已推一次性临时反控授权后，Mac 端下一轮可读取 `reverseControlGrant.active`，在页面上提示“Windows 已临时允许下一次反控”，并增加安全的请求反控按钮/回执显示。
是否改了协议：否。只消费 Windows host 已暴露的可选能力字段，兼容扁平和对象化状态。
是否需要另一端配合：暂不需要；后续请求反控按钮和真实联调需要 Windows 端开一次性授权窗口配合。

## 2026-06-16 Windows Codex

日期：2026-06-16 23:59
开发端：Windows Codex
本轮目标：让 Windows host 在默认安全拒绝 Mac 反控请求后，Windows 本机能看到“刚收到请求”，再临时授权并让 Mac 重试。
完成内容：
- Windows host 的一次性授权状态新增 `lastRequest`：默认 `deny` 拒绝反控请求时，会短时记录 requestId、来源、时间、状态和原因，不保存请求正文或密码。
- `/discovery.capabilities.reverseControlGrant.lastRequest` 现在可让本机 UI 看到最近一次被拒绝请求；`start-windows-host --status` 普通输出会显示 `pendingRequest=on`，`--boardSummary` 会把反控状态标成 `pending-request`。
- Windows 桌面“本机被控”面板状态会显示 `反控：刚收到请求`，详情行提示“已安全拒绝；可点击临时允许反控后让对方重试”。
- 反控专项回归覆盖默认拒绝后的最近请求状态、临时授权消耗后不再保持待处理，以及页面 diagnostics 对“刚收到请求”的显示。
- Windows host/client README、当前状态、下一步和任务板已同步。
修改文件：
- `apps/windows-host/src/windows-host-service.mjs`
- `scripts/windows/start-windows-host.mjs`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-host-reverse-control.mjs`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-host/README.md`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-host/src/windows-host-service.mjs`
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-host-reverse-control.mjs`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-host-reverse-control.mjs --timeoutMs 15000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000 --progressIntervalMs 0`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --script start-windows-host.mjs --script test-windows-host-reverse-control.mjs --script test-windows-client-browser.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" <本轮文件>`（无冲突标记）
遗留问题：
- 这仍不是完整的 Windows 本机弹窗确认队列；现在的现场流程是：Mac 先请求会被安全拒绝并留下提示，Windows 点“临时允许反控”，Mac 端再重试一次。
下一步建议：
- Mac client 可读取 Windows `/discovery.capabilities.reverseControlGrant.lastRequest` 或 `reverseControlGrant.active`，在 Mac 侧给出“Windows 刚看到请求/已临时允许，请重试”的更直观提示。
- 下一轮可继续做 Windows 本机真正的请求弹窗队列：收到请求后在桌面壳弹出同意/拒绝，按钮直接打开一次性授权并通知 Mac 重试。
是否改了协议：未改共享消息协议；新增 Windows host 可选 discovery 能力字段 `reverseControlGrant.lastRequest`，旧客户端可忽略。
是否需要另一端配合：暂不强制需要；Mac 端如要优化体验，可读取新的 discovery 字段。

## 2026-06-16 Windows Codex

日期：2026-06-16 23:45
开发端：Windows Codex
本轮目标：让 Mac 反控 Windows 不必只能在长期 `accept` 实验模式下通过，先补一个安全的一次性本机临时授权窗口。
完成内容：
- Windows host 新增一次性临时反控授权管理器：默认 `deny` 仍拒绝，Windows 本机打开授权后，下一次 `reverse_control_request` 会 accepted 并立即消耗授权。
- 新增本机 HTTP 管理端点 `/reverse-control/status`、`/reverse-control/grant`、`/reverse-control/revoke`；授权/撤销只允许回环地址访问，局域网其他设备不能直接打开授权窗口。
- `/discovery.capabilities.reverseControlGrant` 会暴露授权窗口是否 active、剩余时间和一次性属性。
- `start-windows-host --status --json` / 普通输出 / boardSummary 现在能看到 `temporary-grant` 状态。
- Windows 桌面 Tauri 新增 `grant_windows_host_reverse_control` 命令，向本机 host 打开约 30 秒一次性授权。
- Windows 控制端“本机被控”面板新增“临时允许反控”按钮；host 在线时可用，点击后状态区显示临时允许倒计时，使用或超时后自动回到默认安全语义。
- 专项回归新增“本机临时授权只接受一次并消耗”的覆盖；页面 diagnostics 覆盖临时授权状态文案。
- Windows host/client README、当前状态、下一步和任务板已同步。
修改文件：
- `apps/windows-host/src/windows-host-service.mjs`
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/test-windows-host-reverse-control.mjs`
- `apps/windows-client/index.html`
- `apps/windows-client/app.js`
- `apps/windows-client/styles.css`
- `apps/windows-desktop/src-tauri/src/main.rs`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-host/README.md`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-host/src/windows-host-service.mjs`
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-host-reverse-control.mjs`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-host-reverse-control.mjs --timeoutMs 15000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000 --progressIntervalMs 0`
- `cargo check --manifest-path apps/windows-desktop/src-tauri/Cargo.toml`
遗留问题：
- 这还不是完整“收到请求弹窗、用户点同意/拒绝”的交互；当前是先由 Windows 本机点击按钮打开一次性窗口，再让 Mac 发起反控请求。
下一步建议：
- 下一步可让 Mac client 在发现 `reverseControlGrant.active` 后优先提示“Windows 已允许一次反控，请立即请求”，或进一步做 Windows 本机真正的请求弹窗队列。
是否改了协议：未改共享协议；只新增 Windows host 可选 discovery 能力字段和本机管理端点，原有 `reverse_control_request/response` 消息形状保持兼容。
是否需要另一端配合：暂不需要；Mac 端如果要优化体验，可读取 `reverseControlGrant.active` 做提示。

## 2026-06-16 Windows Codex

日期：2026-06-16 23:25
开发端：Windows Codex
本轮目标：把 Windows 桌面“本机被控”面板接上反控策略选择和状态显示，延续默认安全拒绝。
完成内容：
- 本机被控面板新增“反控策略”下拉：需确认、实验同意、关闭；默认仍是“需确认”。
- `buildLocalHostLaunchRequest()` 会把 `reverseControlMode` 交给桌面壳。
- Tauri `start_windows_host` 接收 `reverseControlMode`，规范化为 `deny|accept|disabled`，同时传入 `LAN_DUAL_WINDOWS_REVERSE_CONTROL_MODE` 和启动助手 dry-run 参数。
- 状态助手摘要会读取 `capabilities.reverseControl`，在本机被控概要和详情里显示“反控：需确认 / 实验自动同意 / 关闭”。
- Windows client 页面自测覆盖默认策略、切换到实验同意、状态摘要显示和不泄露通讯板 call command。
- Windows client README、当前状态、下一步和任务板已同步。
修改文件：
- `apps/windows-client/index.html`
- `apps/windows-client/app.js`
- `apps/windows-desktop/src-tauri/src/main.rs`
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000 --progressIntervalMs 0`
- `cargo check --manifest-path apps/windows-desktop/src-tauri/Cargo.toml`
遗留问题：
- 真正产品化的 Windows 本机确认弹窗和短时授权窗口仍未做；当前“实验同意”只适合可信局域网短测。
下一步建议：
- 后续接收 Mac 反控 Windows 请求时，把默认 `deny-confirm` 变成“弹 Windows 本机确认 -> 短时 accept -> 自动回到 deny”的完整产品流。
是否改了协议：否。只把既有 Windows host 反控策略接入 Windows 桌面 UI 和启动链路。
是否需要另一端配合：不需要；Mac 端真连前读取 Windows 状态摘要即可看到当前策略。

## 2026-06-16 Windows Codex

日期：2026-06-16
开发端：Windows Codex
本轮目标：把 Windows host 反控策略接入启动器、状态诊断和 readiness 摘要，避免 Mac 反控 Windows 前看不出当前是否会自动同意。
完成内容：
- `start-windows-host.mjs` 新增 `--reverseControlMode deny|accept|disabled`，默认仍是安全 `deny`。
- `start-windows-host.ps1` 新增 `-ReverseControlMode` 参数，并透传给 Node 启动助手。
- 启动 dry-run 会显示当前反控策略；`accept` 会标注为 trusted LAN lab auto-accept，避免误当成默认安全路径。
- `--status` 普通输出新增 `Reverse control` 行；`--status --json` 的 `capabilities.reverseControl` 现在包含 `supported/mode/requiresConfirmation/autoAccept/policy`。
- `--status --boardSummary` 在线摘要新增 `reverse=deny-confirm|accept-lab|disabled`，readiness runtime 摘要同步显示 `reverse=<mode>`。
- 启动助手和 readiness 专项回归已补反控策略断言。
- Windows host README、当前状态、下一步和任务板已同步；默认不会自动同意反控，完整确认 UI 仍未产品化。
修改文件：
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node --check scripts/windows/test-windows-host-start-helper.mjs`
- `node --check scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `node scripts/windows/start-windows-host.mjs --help`
- `pwsh -NoProfile -Command '$tokens = $null; $errors = $null; [System.Management.Automation.Language.Parser]::ParseFile("E:\codex\lan-dual-control\scripts\windows\start-windows-host.ps1", [ref]$tokens, [ref]$errors) | Out-Null; if ($errors.Count -gt 0) { exit 1 }; "parse-ok"'`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 90000 --readinessTimeoutMs 8000`
- `node scripts/windows/test-windows-script-help.mjs --timeoutMs 10000`（全量 90 条帮助命令通过）
- `node scripts/windows/start-windows-host.mjs --dryRun --reverseControlMode accept`
- `node scripts/windows/start-windows-host.mjs --status --json --host 127.0.0.1 --port 43770`（当前本机离线，按预期 exit 1 并输出离线 JSON）
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows apps/windows-host docs`（无冲突标记）
遗留问题：
- 本轮只做策略可见化和启动参数；真正由 Windows 桌面确认后临时同意、并让 Mac 端自动打开/接管 Windows 的完整产品流仍待后续实现。
下一步建议：
- 后续接 Windows 桌面“收到 Mac 反控请求”确认入口时，继续保持默认 `deny-confirm`，只在用户本机确认后短时允许。
是否改了协议：否。只消费已有 `reverseControlMode` / `reverseControlPolicy` 能力字段，并扩展本地工具输出。
是否需要另一端配合：当前不需要；Mac 端真连验收时只需读取摘要中的 `reverse=...`。

## 2026-06-16 Windows Codex

日期：2026-06-16 22:55
开发端：Windows Codex
本轮目标：让 Windows host 的 `reverse_control_request` 不再停留在“尚未实装”的模糊拒绝，而是有明确安全策略和可回归状态回执。
完成内容：
- Windows host 新增 `LAN_DUAL_WINDOWS_REVERSE_CONTROL_MODE` 策略：默认 `deny`，可选 `accept` 或 `disabled`。
- `/discovery.capabilities` 和 `hello_ack.capabilities` 新增 `reverseControlMode` / `reverseControlPolicy`，Mac 端预检可以看到当前策略。
- 未认证 `reverse_control_request` 继续按 `LAN002` 拒绝。
- 认证后默认 `deny` 按 `LAN008` 拒绝，理由明确写出需要用户确认并保持当前控制方向；缺少 `requestId` 也按 `LAN008` 拒绝。
- 显式 `accept` 仅作为可信局域网实验短测入口，返回 accepted=true 和 `reverseControlState=accepted`；`disabled` 会声明能力不可用并拒绝。
- 新增 `test-windows-host-reverse-control.mjs`，用临时 in-process Windows host 覆盖未认证、默认拒绝、缺 requestId、显式 accept 和 disabled 五条路径。
- Windows host README、当前状态、下一步和任务板已同步。
修改文件：
- `apps/windows-host/server.mjs`
- `apps/windows-host/src/windows-host-service.mjs`
- `scripts/windows/test-windows-host-reverse-control.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-host/src/windows-host-service.mjs`
- `node --check apps/windows-host/server.mjs`
- `node --check scripts/windows/test-windows-host-reverse-control.mjs`
- `node scripts/windows/test-windows-host-reverse-control.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-host-reverse-control.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-script-help.mjs --timeoutMs 10000`（全量 90 条 help 命令通过）
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps/windows-host scripts/windows docs`（无冲突标记）
遗留问题：
- 本轮不实现“同意后自动打开另一端控制窗口/接管连接”的完整产品流程；默认仍安全拒绝，真正同意还需要后续接桌面确认入口。
下一步建议：
- 后续可以把 Windows 桌面壳确认弹窗接到该策略，确认后再临时切 `accept` 或通过更细的本地确认通道回执。
是否改了协议：否。只增加向后兼容的能力/回执诊断字段。
是否需要另一端配合：当前不需要；后续产品化一键反控需要 Mac 端配合真实接管流程。

## 2026-06-16 Windows Codex

日期：2026-06-16 22:41
开发端：Windows Codex
本轮目标：让 Mac client 视频传输矩阵可以直接输出适合 Agent Link Board 的一行摘要。
完成内容：
- `test-mac-client-video-transports.mjs` 新增 `--boardSummary`，成功和失败路径都会输出一行无密摘要。
- `--json` 输出新增 `boardSummary` 字段，自动化可直接读取。
- 摘要包含通过数、失败 case、重试次数、H.264 encoder / WGC NV12 是否包含，以及 no formal password / no Agent Link Board secrets / no input/inject 安全说明。
- `--boardSummary` 模式不打印外层进度、重试 warning 或 verbose 子输出，保持一行可贴通讯板。
- `test-mac-client-video-transports-progress.mjs` 扩展 fake 子自检回归，覆盖成功摘要、失败摘要、JSON 摘要和不混入进度行。
- Windows host README、当前状态、下一步和任务板已同步。
修改文件：
- `scripts/windows/test-mac-client-video-transports.mjs`
- `scripts/windows/test-mac-client-video-transports-progress.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-client-video-transports.mjs`
- `node --check scripts/windows/test-mac-client-video-transports-progress.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script test-mac-client-video-transports.mjs --script test-mac-client-video-transports-progress.mjs --timeoutMs 10000`
- `node scripts/windows/test-mac-client-video-transports-progress.mjs`（普通沙盒需允许临时 Node 子进程，已按允许子进程方式通过）
遗留问题：
- 本轮只验证矩阵调度层和 fake 子自检输出，未启动真实 Windows host/browser/WGC helper，未连接 Mac、未认证正式服务、未发送输入或执行 `inject`。
下一步建议：
- 后续 H.264 / fallback / binary frame 改动后，可用 `test-mac-client-video-transports --boardSummary` 一行同步矩阵结果到通讯板；若失败，再用普通输出或 `--json` 查看详情。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 22:33
开发端：Windows Codex
本轮目标：让 Mac client 视频传输矩阵在多 case 浏览器自检等待时有外层进度反馈。
完成内容：
- `test-mac-client-video-transports.mjs` 新增 `--progressIntervalMs`，普通输出默认每 10 秒显示当前 case、attempt、临时 host/client/debug 端口和子进程超时剩余。
- 矩阵会把 `--progressIntervalMs` 透传给每个 `test-mac-client-browser.mjs` 子自检，让内层连接、视频、音频等待继续输出页面快照。
- `--json` 保持纯 JSON，不混入进度行，并在摘要里记录 `progressIntervalMs`。
- 新增 `test-mac-client-video-transports-progress.mjs`，用 fake 子自检覆盖普通外层进度、参数透传和 JSON 纯净。
- Windows host README、当前状态、下一步和任务板已同步。
修改文件：
- `scripts/windows/test-mac-client-video-transports.mjs`
- `scripts/windows/test-mac-client-video-transports-progress.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-client-video-transports.mjs`
- `node --check scripts/windows/test-mac-client-video-transports-progress.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script test-mac-client-video-transports.mjs --script test-mac-client-video-transports-progress.mjs --timeoutMs 10000`
- `node scripts/windows/test-mac-client-video-transports-progress.mjs`（普通沙盒需允许临时 Node 子进程，已按允许子进程方式通过）
遗留问题：
- 本轮只验证矩阵调度层和 fake 子自检输出，未启动真实 Windows host/browser/WGC helper，未连接 Mac、未认证正式服务、未发送输入或执行 `inject`。
下一步建议：
- 后续改 H.264、fallback、binary-jpeg/binary-h264 或 WGC NV12 页面接收时，跑矩阵可保留默认 10 秒心跳；现场需要更密集反馈时加 `--progressIntervalMs 5000`。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 22:25
开发端：Windows Codex
本轮目标：让 Windows WGC benchmark/compare 在长时间子进程等待时有进度反馈，避免现场误判卡住。
完成内容：
- `benchmark-windows-wgc-settings.mjs` 新增 `--progressIntervalMs`，普通输出会在 helper 构建和每个 profile 子观察期间打印 elapsed、expected 和 timeout left；默认 10 秒一次，`0` 可关闭。
- `compare-windows-wgc-h264-sources.mjs` 新增同名参数，普通输出会在每个 raw-bgra/NV12 source 子 benchmark 期间打印等待进度，并把该参数透传给子 benchmark。
- `--json` 和 `--boardSummary` 保持干净，不混入进度行。
- 新增 `test-windows-wgc-progress-output.mjs`，用临时 fake observer/benchmark 覆盖普通进度输出、JSON/boardSummary 干净和不泄密。
- Windows host README、当前状态、下一步和任务板已同步。
修改文件：
- `scripts/windows/benchmark-windows-wgc-settings.mjs`
- `scripts/windows/compare-windows-wgc-h264-sources.mjs`
- `scripts/windows/test-windows-wgc-progress-output.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/benchmark-windows-wgc-settings.mjs`
- `node --check scripts/windows/compare-windows-wgc-h264-sources.mjs`
- `node --check scripts/windows/test-windows-wgc-progress-output.mjs`
- `node scripts/windows/test-windows-wgc-progress-output.mjs`（普通沙盒首次 `spawn EPERM`，按允许子进程方式重跑通过）
遗留问题：
- 本轮只验证进度输出和机器输出纯净性，未启动真实 WGC helper、未连接 Mac、未认证正式服务、未发送输入或执行 `inject`。
下一步建议：
- 后续真实 WGC 性能长测可保留默认 10 秒心跳；现场需要更密集反馈时加 `--progressIntervalMs 5000`，通讯板摘要继续使用 `--boardSummary`。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 22:05
开发端：Windows Codex
本轮目标：让 Windows host 视频、音频和媒体聚合观察在长时间基线时有进度反馈。
完成内容：
- `observe-windows-host-video.mjs` 新增 `--progressIntervalMs`，普通输出会打印开始目标和周期进度，包含已收帧、剩余时间、FPS、fresh/repeated、最大间隔、帧年龄、codec/pipeline。
- `observe-windows-host-audio.mjs` 新增 `--progressIntervalMs`，普通输出会打印开始目标和周期进度，包含已收帧、剩余时间、FPS、最大间隔、帧年龄、电平、codec/mode。
- `observe-windows-host-media.mjs` 新增同名参数并透传给视频/音频子探针；普通输出会显示聚合子任务进度，`--json` 和 `--boardSummary` 保持干净，不混入进度行。
- 修复视频/音频观察循环尾段等待：如果目标观察时长已到且已有帧，会正常结束，不再因为最后一次等帧跨过窗口而多等完整 timeout。
- `test-windows-host-media-board-summary.mjs` 新增普通进度输出回归，并继续覆盖 JSON、一行摘要、失败和 partial failure 不泄密。
- Windows host README、当前状态、下一步和任务板已同步。
修改文件：
- `scripts/windows/observe-windows-host-video.mjs`
- `scripts/windows/observe-windows-host-audio.mjs`
- `scripts/windows/observe-windows-host-media.mjs`
- `scripts/windows/test-windows-host-media-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/observe-windows-host-video.mjs`
- `node --check scripts/windows/observe-windows-host-audio.mjs`
- `node --check scripts/windows/observe-windows-host-media.mjs`
- `node --check scripts/windows/test-windows-host-media-board-summary.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script observe-windows-host-video.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-script-help.mjs --script observe-windows-host-audio.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-script-help.mjs --script observe-windows-host-media.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-host-media-board-summary.mjs --timeoutMs 60000`
- `node scripts/windows/observe-windows-host-video.mjs --screenMode mock --requireRealVideo false --durationMs 1200 --progressIntervalMs 200 --minFrames 2 --minFps 1 --resourceSample false`
- `node scripts/windows/observe-windows-host-audio.mjs --audioMode mock --screenMode mock --requirePcm false --durationMs 1200 --progressIntervalMs 200 --minFrames 2 --minFps 1 --resourceSample false`
遗留问题：
- 本轮只跑本机 mock 视频/音频观察，未启动正式 Windows host，未认证真实服务，未发送输入或执行 `inject`。
下一步建议：
- Mac 反控 Windows 前的长媒体基线可保留默认 10 秒心跳；现场等待时可加 `--progressIntervalMs 5000`，通讯板摘要仍用 `--boardSummary`。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 22:00
开发端：Windows Codex
本轮目标：让 Windows 控制 Mac 页面自检的连接、视频和音频等待都有现场进度反馈。
完成内容：
- `scripts/windows/test-windows-client-browser.mjs` 新增通用页面快照等待包装，连接、视频 surface、H.264/WebCodecs 和 PCM 音频播放等待默认每 10 秒输出状态、远端、诊断、FPS、音频和帧计数。
- 新增 `--progressIntervalMs <ms>`，可调节心跳频率，传 `0` 可关闭。
- 修复 `verifyReconnectControls` 只恢复重连/断开按钮、漏恢复连接按钮禁用状态的问题，避免 diagnostics-only 测完后后续连接点击无效。
- Windows client README、当前状态、下一步和任务板已同步。
修改文件：
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-client-browser.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000 --progressIntervalMs 1000`
- 本机假 Mac：`test-windows-client-browser.mjs --host 127.0.0.1 --port 43773 --password demo-password --timeoutMs 45000 --progressIntervalMs 1000 --clientPort 5205 --debugPort 9349`
- 本机假 Mac + PCM：`test-windows-client-browser.mjs --host 127.0.0.1 --port 43774 --password demo-password --timeoutMs 45000 --progressIntervalMs 1000 --clientPort 5206 --debugPort 9350 --injectPcmAudio`
遗留问题：
- 本轮只连接本机假 Mac 服务和本机浏览器自检，未认证真实 Mac host、未发送密码、未执行 `inject`。
下一步建议：
- 下次现场真连 Mac 时保留默认 10 秒心跳；如果用户在旁边等结果，可临时加 `--progressIntervalMs 5000` 更快看到卡点。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 21:55
开发端：Windows Codex
本轮目标：让 Mac client 页面自检的连接、认证、视频和音频等待都有进度反馈。
完成内容：
- `scripts/windows/test-mac-client-browser.mjs` 新增通用页面等待心跳包装，会输出连接状态、远端摘要、视频状态、音频状态、二进制/重复帧/音频帧计数等当前页面快照。
- 连接首帧、认证失败、H.264 视频、二进制 H.264、H.264 fallback、重复帧、二进制 JPEG、音频首帧和音频播放等待都接入 `--progressIntervalMs`。
- 既有长视频观察和重连恢复心跳保留；`--progressIntervalMs 0` 仍可关闭。
- Mac client README、当前状态、下一步和任务板已同步。
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
- `node scripts/windows/test-windows-script-help.mjs --script test-mac-client-browser.mjs --timeoutMs 10000`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --skipFileClipboard --progressIntervalMs 200 --timeoutMs 45000 --clientPort 5200 --debugPort 9344`
- `node scripts/windows/test-mac-client-browser.mjs --expectAuthFailure --expectedAttemptsRemaining 2 --expectedMaxAttempts 3 --progressIntervalMs 200 --timeoutMs 45000 --clientPort 5201 --debugPort 9345`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --skipFileClipboard --enableAudio --expectAudioFrame --progressIntervalMs 200 --timeoutMs 45000 --clientPort 5202 --debugPort 9346`
- `node scripts/windows/test-mac-client-browser.mjs --screenMode ffmpeg-h264 --requireH264Video --expectBinaryH264Video --allowClipboardFallback --skipFileClipboard --progressIntervalMs 200 --timeoutMs 45000 --clientPort 5203 --debugPort 9347`
- `node scripts/windows/test-mac-client-browser.mjs --screenMode ffmpeg-h264 --expectH264Fallback --forceH264Unsupported --allowClipboardFallback --skipFileClipboard --progressIntervalMs 200 --timeoutMs 45000 --clientPort 5204 --debugPort 9348`
遗留问题：
- 本轮只跑本机临时 Windows host 和本机浏览器自检，未连接真实 Windows host、未认证真实服务、未执行 `inject`。
下一步建议：
- 真实 Mac 控制 Windows smoke 现场可保留默认 10 秒心跳；若用户在旁边等待，建议临时加 `--progressIntervalMs 5000` 或更短，方便判断卡在连接、视频、音频还是重连。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 21:40
开发端：Windows Codex
本轮目标：让 Mac client 页面自检的长视频观察和重连等待也有进度反馈。
完成内容：
- `scripts/windows/test-mac-client-browser.mjs` 新增 `--progressIntervalMs`，默认 10 秒，传 `0` 可关闭。
- `--observeVideoMs` 持续视频观察会打印开始目标，并按间隔输出已收帧数、剩余时间和当前 FPS；连接后和切换 2K 后的观察都会使用同一心跳。
- `--expectReconnect` 的恢复等待会打印等待目标，并按间隔输出当前连接状态、远端状态、session 数和画面是否恢复。
- Mac client README、当前状态、下一步和任务板已同步。
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
- `node scripts/windows/test-windows-script-help.mjs --script test-mac-client-browser.mjs --timeoutMs 10000`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --skipFileClipboard --observeVideoMs 800 --minObservedVideoFrames 2 --progressIntervalMs 200 --timeoutMs 45000 --clientPort 5198 --debugPort 9342`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --skipFileClipboard --expectReconnect --testReconnectNow --progressIntervalMs 200 --timeoutMs 45000 --clientPort 5199 --debugPort 9343`
遗留问题：
- 本轮只跑本机临时 Windows host 和本机浏览器自检，未连接真实 Windows host、未认证真实服务、未执行 `inject`。
下一步建议：
- 真实 Mac 控制 Windows 观感验收时，长窗口可加 `--observeVideoMs 30000 --progressIntervalMs 5000`，断线恢复可加 `--expectReconnect --maxReconnectRestoreMs <ms>` 同时看心跳和最终恢复耗时。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 21:25
开发端：Windows Codex
本轮目标：解决正式 Mac E2E 长测中间无输出、现场看起来像卡住的问题。
完成内容：
- `probe-mac-host.mjs` 的视频/音频观察会先打印目标时长，随后按 `--progressIntervalMs` 周期输出帧数、剩余时间、当前 FPS 和最大帧间隔。
- `check-mac-formal-e2e.mjs` 新增同名 `--progressIntervalMs` 参数并传给底层探针，默认 10 秒；传 `0` 可关闭。
- formal E2E mock fast path 回归把心跳间隔降到 200ms，断言 `Video observation started` 和 `Video progress:` 出现，同时继续确认不泄露密码。
- Windows client README、当前状态、下一步和任务板已同步说明长测心跳。
修改文件：
- `scripts/windows/probe-mac-host.mjs`
- `scripts/windows/check-mac-formal-e2e.mjs`
- `scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/probe-mac-host.mjs`
- `node --check scripts/windows/check-mac-formal-e2e.mjs`
- `node --check scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `node scripts/windows/test-mac-formal-e2e-preflight.mjs --timeoutMs 45000`
遗留问题：
- 本轮不连接真实 Mac、不输入正式密码、不执行 `inject`；真实 5 分钟长测可在用户准备好密码后复跑确认现场观感。
下一步建议：
- 下次正式跑 `check-mac-formal-e2e --discover --promptPassword` 时，观察 5 分钟 H.264 阶段是否每 10 秒输出心跳；如果需要更密集现场反馈可临时加 `--progressIntervalMs 5000`。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 21:05
开发端：Windows Codex
本轮目标：让 Windows 控制端导出日志能记录重连等待诊断。
完成内容：
- `buildLogExportText()` 在连接状态里新增重连状态、重连原因和下次重连倒计时，便于现场断线后直接导出日志复盘。
- `reconnectNow()` 保留原断线原因直到连接成功或失败，不会在立即重连时提前清空原因。
- `test-windows-client-browser.mjs --diagnosticsOnly` 的重连控件回归新增导出文本断言，确认等待自动重连时导出日志带 `重连状态`、`重连原因` 和 `下次重连`。
- Windows client README、当前状态、下一步和任务板已同步。
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
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-client-browser.mjs --timeoutMs 10000`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮只增强导出日志，不做真实断网/host 重启恢复耗时测试。
下一步建议：
- 下次真实 Mac 断线/重启复测时，直接导出 Windows 控制端日志，检查重连状态、原因、倒计时和事件记录是否足够定位问题。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 20:56
开发端：Windows Codex
本轮目标：改善 Windows 控制端断线后的重连体验。
完成内容：
- `apps/windows-client` 连接面板新增“立即重连”按钮；只有进入自动重连等待态时显示，点击后会跳过等待并立刻执行当前重连尝试。
- 自动重连等待态现在按秒刷新状态栏和远程画面状态，显示第几次重连与剩余时间；手动“断开”仍会停止自动重连。
- 修复按钮通用 `display: inline-flex` 覆盖 HTML `hidden` 的布局问题，确保隐藏按钮不占位。
- `test-windows-client-browser.mjs --diagnosticsOnly` 新增页面级重连控件回归，覆盖倒计时、按钮显示、立即重连和计时器清理。
- Windows client README、当前状态、下一步和任务板已同步。
修改文件：
- `apps/windows-client/index.html`
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- 内置浏览器访问 `http://127.0.0.1:5178/`，确认默认隐藏的“立即重连”不占位，连接/断开按钮同排显示
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-client-browser.mjs --timeoutMs 10000`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮只做页面重连体验，不连接真实 Mac，不做真实断网/host 重启恢复耗时测试。
下一步建议：
- 真实 Mac host 或假 Mac 服务下复测断线/重启场景，结合 `--maxReconnectRestoreMs` 记录画面恢复耗时和用户提示是否足够直观。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 20:37
开发端：Windows Codex
本轮目标：让 Windows host 状态助手也提示本机媒体基线命令。
完成内容：
- `scripts/windows/start-windows-host.mjs --status` 的 JSON 新增 `windowsHostMediaReadinessCommand`，指向 `check-windows-host-readiness --checkBoard --probeMedia --boardSummary`。
- 普通 status 输出、离线/在线 `--boardSummary` 和启动后 ready 输出都会提示 `Windows host media baseline command` / `WindowsHostMedia=`。
- `scripts/windows/test-windows-host-start-helper.mjs` 覆盖离线、在线、JSON、boardSummary、fake board currentCall 和临时端口真实启动路径中的媒体命令，同时继续确认不泄露测试密码。
- Windows host README、当前状态、下一步和任务板已同步。
修改文件：
- `scripts/windows/start-windows-host.mjs`
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
- PowerShell 7 AST 解析 `scripts/windows/start-windows-host.ps1`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --script start-windows-host.mjs --script test-windows-host-start-helper.mjs --timeoutMs 10000`
- 离线 `start-windows-host --status --boardSummary` 确认输出 `WindowsHostMedia=`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮只补状态提示，不启动正式 Windows host，不做真实媒体长测。
下一步建议：
- Mac 端用 `start-windows-host --status --checkBoard --boardSummary` 确认 Windows host 状态时，可直接复制摘要里的 `WindowsHostMedia=` 命令让 Windows 侧刷新视频/音频基线。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 20:18
开发端：Windows Codex
本轮目标：让 Windows 恢复开工总览直接提示本机 Windows host 媒体基线命令。
完成内容：
- `scripts/windows/check-windows-resume-status.mjs` 的 JSON、普通输出和 `--boardSummary` 新增 `windowsHostMediaReadinessBoardSummary` / `WindowsHostMedia=`，指向 `check-windows-host-readiness --checkBoard --probeMedia --boardSummary`。
- PowerShell 包装帮助同步说明恢复总览会带 Windows host media baseline 命令。
- Node 与 PowerShell 回归锁定 JSON 字段、通讯板摘要和帮助文案，确认不泄露 mock 密码。
- 当前状态、下一步和任务板已同步，说明 Mac 反控 Windows 前可以从恢复总览直接拿到媒体基线命令。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- PowerShell 7 AST 语法解析 `scripts/windows/check-windows-resume-status.ps1`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-resume-status.mjs --script test-windows-resume-status.mjs --script test-windows-resume-status-powershell.mjs --timeoutMs 10000`
- `node scripts/windows/check-windows-resume-status.mjs --noDiscover --host 127.0.0.1 --port 9 --boardSummary --timeoutMs 12000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps docs scripts shared`
遗留问题：
- 本轮只补命令提示，不启动正式 Windows host，不做真实媒体长测。
下一步建议：
- Mac 控制 Windows 前，先按恢复总览里的 `WindowsHostMedia=` 命令刷新 Windows host 视频/音频基线；如果显示 partial/failed，再查看 readiness JSON 里的具体媒体聚合详情。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 20:03
开发端：Windows Codex
本轮目标：把 Windows readiness `--probeMedia` 接入 Windows 桌面“本机被控”体检面板。
完成内容：
- Windows 控制端“本机被控”面板新增“媒体基线”复选框，默认不勾选，避免普通低风险体检变慢。
- 前端 `buildLocalHostReadinessRequest` 会在勾选时传 `probeMedia=true`；Tauri 后端 `run_windows_host_readiness` 会把它转成 `check-windows-host-readiness --probeMedia`。
- 体检摘要新增“媒体基线正常/部分通过/失败”；详情行把 `Windows host media aggregate` 压缩为视频 FPS、音频 FPS、最大间隔和帧年龄，避免整条媒体 boardSummary 挤满面板。
- 页面 diagnostics-only 回归锁定：浏览器预览版面板仍禁用、默认请求 `probeMedia=false`、勾选后请求 `probeMedia=true`，媒体摘要和详情能正确显示。
- Windows client / desktop README、当前状态、下一步和任务板已同步。
修改文件：
- `apps/windows-desktop/src-tauri/src/main.rs`
- `apps/windows-client/index.html`
- `apps/windows-client/app.js`
- `apps/windows-client/styles.css`
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
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
- `cargo check --manifest-path apps/windows-desktop/src-tauri/Cargo.toml`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps docs scripts shared`
遗留问题：
- 本轮没有在真实桌面窗口里人工点击“媒体基线”按钮；已用页面级 diagnostics-only 和 Tauri 编译检查覆盖请求形状和展示逻辑。
下一步建议：
- 后续 Mac 控制 Windows 前，可直接在 Windows 桌面“本机被控”面板勾选“媒体基线”跑体检；如果 UI 显示部分通过，再用命令行 `--probeMedia --json` 看具体视频/音频失败细节。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 19:49
开发端：Windows Codex
本轮目标：给 Windows host readiness 增加统一媒体聚合状态，方便 Mac 控制 Windows 前用一行摘要判断视频/音频基线。
完成内容：
- `scripts/windows/check-windows-host-readiness.mjs` 新增显式 `--probeMedia`，复用 `observe-windows-host-media --json` 顺序跑视频+音频媒体聚合。
- readiness JSON 新增 `Windows host media aggregate` 结果详情，保留媒体 `summary.status=ok|partial|failed`、video/audio/resource 片段和脱敏 `boardSummary`。
- readiness `--boardSummary` 会显示 `media=ok`、`media=partial(passed=X,failed=Y)` 或 `media=failed(passed=X,failed=Y)`；默认未跑媒体时显示 `media=not-checked`。
- `scripts/windows/test-windows-host-readiness-board-summary.mjs` 增加帮助、`--probeMedia --json`、默认 `media=not-checked` 和不泄密断言。
- Windows host README、当前状态、下一步和任务板同步了 `--probeMedia --boardSummary` 用法。
修改文件：
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node --check scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `node scripts/windows/check-windows-host-readiness.mjs --json --probeMedia --timeoutMs 8000`
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 90000 --readinessTimeoutMs 8000`
- `node scripts/windows/check-windows-host-readiness.mjs --boardSummary --probeMedia --timeoutMs 8000`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-host-readiness.mjs --script test-windows-host-readiness-board-summary.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-script-help.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps docs scripts shared`
遗留问题：
- 本轮只做本机 Windows 临时 host 媒体聚合；正式 Mac 控制 Windows 真机连接仍需等 Windows host 用正式密码启动后由 Mac 端验收。
下一步建议：
- Mac 端准备控制 Windows 前，可先让 Windows 端运行 `node scripts/windows/check-windows-host-readiness.mjs --probeMedia --boardSummary`，根据 `media=ok|partial|failed` 决定是否继续 formal smoke。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 19:08
开发端：Windows Codex
本轮目标：把 Mac media `summary.status` 接入 Mac readiness 的一行媒体摘要。
完成内容：
- `scripts/mac/check-mac-host-readiness.mjs` 的 `--probeMedia --boardSummary` 现在优先消费媒体聚合 `summary.status=ok|partial|failed`。
- readiness 摘要从旧的 `media=passed` / 泛化 failed 改为 `media=ok`、`media=partial(passed=X,failed=Y)` 或 `media=failed(passed=X,failed=Y)`；旧 payload 没有 `status` 时仍按 passed/failed 计数推断。
- `scripts/mac/test-mac-host-readiness-board.mjs` 新增 formatter 源码级回归，覆盖 ok、partial、failed 和旧 payload fallback，并增强 offline `--probeMedia` JSON/boardSummary 断言。
- Mac host README、当前状态、下一步和任务板同步说明 readiness 可直接输出 `media=ok|partial|failed`。
修改文件：
- `scripts/mac/check-mac-host-readiness.mjs`
- `scripts/mac/test-mac-host-readiness-board.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-host-readiness.mjs`
- `node --check scripts/mac/test-mac-host-readiness-board.mjs`
- `node scripts/mac/test-mac-host-readiness-board.mjs --timeoutMs 45000`
- `node scripts/mac/test-mac-script-help.mjs --script check-mac-host-readiness.mjs --script test-mac-host-readiness-board.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps docs scripts shared`
遗留问题：
- 本轮仍只跑离线/fake board/readiness formatter 回归，没有启动真实 Mac host；真实媒体状态由 Mac 本机后续 `--probeMedia` 或 `observe-mac-media` 验证。
下一步建议：
- Agent Link Board 或桌面面板读取 readiness 一行摘要时，可直接根据 `media=partial` 判断媒体链路是局部失败，而不是整体失败。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Mac Codex

日期：2026-06-16 13:30
开发端：Mac Codex
本轮目标：给 Mac 媒体聚合基线补可选本机资源采样，便于和 Windows 媒体摘要对照。
完成内容：
- `scripts/mac/observe-mac-media.mjs` 新增 `--resourceSample`、`--resourceSampleIntervalMs` 和 `--resourceSampleTimeoutMs`，默认关闭；开启后只读 `/discovery.runtime.processId`，仅对本机 Mac host 进程用 `ps` 采样 CPU、RSS 和虚拟内存。
- JSON 报告新增 `resource` 与对应 `args.resourceSample*` 字段；`--boardSummary` 新增 `resource=off|sampled|unavailable` 片段，保持一行、无密、无输入、无 inject。
- 采样不可用、目标不是本机、缺少 runtime PID 或在 Windows 审查机运行时，只记录 unavailable，不影响视频/音频 probe 成败。
- `scripts/mac/test-mac-media-json-output.mjs` 增加资源采样 fake-host 回归，并保持默认关闭、partial failure、失败摘要和不泄密检查。
修改文件：
- `scripts/mac/observe-mac-media.mjs`
- `scripts/mac/test-mac-media-json-output.mjs`
- `README.md`
- `apps/mac-host/README.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check scripts/mac/observe-mac-media.mjs`
- `node --check scripts/mac/test-mac-media-json-output.mjs`
- `node scripts/mac/test-mac-media-json-output.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-script-help.mjs --script observe-mac-media.mjs --script test-mac-media-json-output.mjs --timeoutMs 8000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 8000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" README.md apps/mac-host/README.md docs/04-task-board.md docs/HANDOFF_LOG.md scripts/mac/observe-mac-media.mjs scripts/mac/test-mac-media-json-output.mjs`
遗留问题：
- 本轮没有启动真实 Mac host，也没有跑真实资源采样长窗口；下一次真实媒体基线可用 `node scripts/mac/observe-mac-media.mjs --resourceSample --boardSummary` 直接把 CPU/RSS 一并发到 Agent Link Board。
下一步建议：
- 双端都可用各自 media aggregate 的一行摘要做 H.264/PCM/FPS/资源对照；如果 Mac 真实采样显示 RSS 或 CPU 异常，再进入 Swift host 侧采集/编码性能定位。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 13:46
开发端：Windows Codex
本轮目标：补齐 Mac media 聚合的机器可读状态和 partial 摘要语义。
完成内容：
- `scripts/mac/observe-mac-media.mjs` 的 JSON `summary` 新增 `status` 字段，取值为 `ok`、`partial` 或 `failed`。
- `--boardSummary` 成功时保留 `Mac media baseline passed`，单路成功单路失败时改为 `Mac media baseline partial`，全部执行链路失败时仍显示 `failed <数量>`。
- 合并时保留 Mac 端已新增的 `--resourceSample` / `resource=off|sampled|unavailable` 能力；资源采样不可用仍不影响视频/音频结果。
- `scripts/mac/test-mac-media-json-output.mjs` fake-host 回归新增成功、partial failure、全失败三种 `summary.status` 断言，并保留不泄密和不执行 input/inject 的检查；帮助检查失败信息补 status/signal/error，方便 Windows 审查机定位 `spawnSync node.exe EPERM`。
- Mac host README、当前状态、下一步和任务板同步说明 `summary.status` / partial 摘要。
修改文件：
- `scripts/mac/observe-mac-media.mjs`
- `scripts/mac/test-mac-media-json-output.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/observe-mac-media.mjs`
- `node --check scripts/mac/test-mac-media-json-output.mjs`
- `node scripts/mac/test-mac-media-json-output.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-script-help.mjs --script observe-mac-media.mjs --script test-mac-media-json-output.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-script-help.mjs --script observe-windows-host-media.mjs --script test-windows-host-media-board-summary.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps docs scripts shared`
遗留问题：
- 本轮只跑 fake Mac host 聚合自测；真实 Mac host 媒体基线仍需在 Mac 本机用正式密码或 `LAN_DUAL_PASSWORD` 运行。
下一步建议：
- 双端媒体聚合现在都有 `summary.status=ok|partial|failed`；后续 Agent Link Board 或桌面面板自动化可统一消费该字段。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 13:35
开发端：Windows Codex
本轮目标：给 Windows host 媒体聚合 JSON 增加机器可读状态字段。
完成内容：
- `scripts/windows/observe-windows-host-media.mjs` 的 JSON `summary` 新增 `status` 字段，取值为 `ok`、`partial` 或 `failed`，和 `boardSummary` 的 `Windows media: ok/partial/failed` 保持一致。
- `summary.status=partial` 表示视频/音频其中一路成功、另一路失败；`failed` 只表示全部执行链路失败；自动化可直接读 JSON，不必解析一行摘要。
- `scripts/windows/test-windows-host-media-board-summary.mjs` 新增成功、全失败、partial failure 三种 `summary.status` 回归，并继续确认摘要不泄密。
- Windows host README、当前状态、下一步和任务板同步说明 `summary.status`。
修改文件：
- `scripts/windows/observe-windows-host-media.mjs`
- `scripts/windows/test-windows-host-media-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/observe-windows-host-media.mjs`
- `node --check scripts/windows/test-windows-host-media-board-summary.mjs`
- `node scripts/windows/test-windows-host-media-board-summary.mjs --timeoutMs 60000`
- `node scripts/windows/test-windows-script-help.mjs --script observe-windows-host-media.mjs --script test-windows-host-media-board-summary.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-script-help.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps docs scripts shared`
遗留问题：
- 本轮只增强 Windows media JSON；Mac media 聚合如需同名 `summary.status`，可由 Mac 端按相同语义补齐。
下一步建议：
- 后续桌面面板或 Agent Link Board 自动化消费媒体基线时，优先读 `summary.status`，再展示 `boardSummary` 给人看。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 13:30
开发端：Windows Codex
本轮目标：让 Windows host 媒体观察摘要区分 partial failure 和全失败。
完成内容：
- `scripts/windows/observe-windows-host-media.mjs` 新增媒体聚合状态判断：全部通过显示 `Windows media: ok`，单路成功单路失败显示 `Windows media: partial`，全部执行链路失败才显示 `Windows media: failed`。
- `scripts/windows/test-windows-host-media-board-summary.mjs` 的 partial failure 回归改为断言 `Windows media: partial`，继续覆盖视频失败但音频成功、失败链路标记、成功链路保留和不泄密。
- Windows host README、当前状态、下一步和任务板同步说明 `partial` / `failed` 的区别，避免把 FFmpeg/GDI 临时抓屏失败误读成音频也坏。
修改文件：
- `scripts/windows/observe-windows-host-media.mjs`
- `scripts/windows/test-windows-host-media-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/observe-windows-host-media.mjs`
- `node --check scripts/windows/test-windows-host-media-board-summary.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script observe-windows-host-media.mjs --script test-windows-host-media-board-summary.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-host-media-board-summary.mjs --timeoutMs 60000`
- `node scripts/windows/test-windows-script-help.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps docs scripts shared`
遗留问题：
- 本轮仍是 mock partial failure 回归；真实 Windows host 媒体基线需要在 Windows 桌面捕获稳定后复测。
下一步建议：
- 下一轮可继续把 Mac/Windows media 聚合摘要格式对齐，或跑真实 Windows host WGC/H.264 媒体基线，确认 60Hz/码率设置下的稳定 FPS。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 13:20
开发端：Windows Codex
本轮目标：让 Windows host 媒体观察聚合脚本在单路失败时继续收集另一条链路结果。
完成内容：
- `scripts/windows/observe-windows-host-media.mjs` 不再因为视频或音频其中一路失败就立刻结束；视频失败后会继续跑音频，音频失败时会保留已成功的视频结果。
- JSON 报告新增 `summary.passed`、`summary.failed`、`summary.failures`、`summary.skipped`、`summary.noInput` 和 `summary.noInject`，方便自动化判断 partial failure。
- `--boardSummary` 失败摘要会明确写 `video=failed reason=...` 或 `audio=failed reason=...`，不会再把失败链路误显示为 skipped。
- `scripts/windows/test-windows-host-media-board-summary.mjs` 新增 partial failure 回归：模拟视频阈值失败但音频 mock 成功，断言 JSON 保留音频帧、失败列表标记 video、不泄露测试密码。
修改文件：
- `scripts/windows/observe-windows-host-media.mjs`
- `scripts/windows/test-windows-host-media-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/observe-windows-host-media.mjs`
- `node --check scripts/windows/test-windows-host-media-board-summary.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script observe-windows-host-media.mjs --script test-windows-host-media-board-summary.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-host-media-board-summary.mjs --timeoutMs 60000`
- `node scripts/windows/test-windows-script-help.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps docs scripts shared`
遗留问题：
- 本轮仍使用 mock host 回归 partial failure；真实 FFmpeg/WASAPI 长观察需要在下一次 Windows host 媒体基线或 Mac 反控 Windows 联调时跑。
下一步建议：
- 若真实 `gdigrab` 再次 `error 5`，直接跑 `node scripts/windows/observe-windows-host-media.mjs --resourceSampleTree true --boardSummary`，确认摘要是否仍能给出 WASAPI 音频结果。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 13:09
开发端：Windows Codex
本轮目标：让 Windows host 媒体观察聚合脚本在失败时也能输出可发 Agent Link Board 的安全摘要。
完成内容：
- `scripts/windows/observe-windows-host-media.mjs` 的失败路径现在会生成脱敏 `ok=false` JSON 报告，并保留同格式 `boardSummary`。
- `--boardSummary` 失败时只输出一行 `Windows media: failed` 摘要，包含 target、elapsed、请求分辨率/Hz/Mbps/音频参数、简短错误原因和“不含密码/不执行 inject”边界。
- 成功路径的摘要格式保持兼容；若视频已成功而音频失败，失败报告会保留已完成的视频片段，方便定位是哪一段坏了。
- `scripts/windows/test-windows-host-media-board-summary.mjs` 新增失败 boardSummary 和失败 JSON 回归，断言输出不泄露测试密码片段。
修改文件：
- `scripts/windows/observe-windows-host-media.mjs`
- `scripts/windows/test-windows-host-media-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/observe-windows-host-media.mjs`
- `node --check scripts/windows/test-windows-host-media-board-summary.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script observe-windows-host-media.mjs --script test-windows-host-media-board-summary.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-host-media-board-summary.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps docs scripts shared`
遗留问题：
- 本轮只增强失败摘要和测试覆盖；真实 Windows FFmpeg gdigrab / WASAPI 仍需要在后续真机媒体基线里继续观察。
下一步建议：
- 做 Windows host 媒体基线或 Mac 反控 Windows 体验前，可直接跑 `node scripts/windows/observe-windows-host-media.mjs --resourceSampleTree true --boardSummary`；成功或失败都能把一行脱敏结果发给 Mac 端对照。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 12:52
开发端：Windows Codex
本轮目标：让 Windows host 媒体观察聚合脚本输出可发 Agent Link Board 的无密摘要。
完成内容：
- `scripts/windows/observe-windows-host-media.mjs` 新增 `--boardSummary`：顺序跑视频/音频观察后只输出一行可贴通讯板的媒体基线摘要。
- JSON 报告新增 `boardSummary` 字段，摘要包含请求分辨率/Hz/Mbps、视频 FPS/最大间隔/帧年龄、音频稳态 FPS/最大间隔/帧年龄和资源采样状态。
- `--boardSummary` 模式会压掉运行过程日志，避免通讯板消息里混入子命令输出；摘要不包含密码、系统账号、输入事件或 `inject` 命令。
- 新增 `scripts/windows/test-windows-host-media-board-summary.mjs`，用本机短时 mock 视频/音频 host 覆盖 JSON boardSummary、一行 boardSummary、help 和不泄密。
修改文件：
- `scripts/windows/observe-windows-host-media.mjs`
- `scripts/windows/test-windows-host-media-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/observe-windows-host-media.mjs`
- `node --check scripts/windows/test-windows-host-media-board-summary.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script observe-windows-host-media.mjs --script test-windows-host-media-board-summary.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-host-media-board-summary.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --timeoutMs 10000`
- `node scripts/windows/observe-windows-host-media.mjs --skipAudio --videoScreenMode mock --requireRealVideo false --videoDurationMs 800 --videoMinFrames 2 --videoMinFps 1 --resourceSample false --password media-test-secret-should-not-render --boardSummary`
遗留问题：
- 本轮只做摘要输出和 mock 回归；真实 FFmpeg gdigrab 视频基线仍需在桌面捕获稳定后复测，或继续推进 WGC/原生硬编路线。
下一步建议：
- 后续做 Windows host 画质/延迟/资源对照时，可直接跑 `node scripts/windows/observe-windows-host-media.mjs --resourceSampleTree true --boardSummary`，把一行结果发到 Agent Link Board 给 Mac 端对齐。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 12:45
开发端：Windows Codex
本轮目标：让 Windows 桌面版“本机被控”面板也能显示 Agent Link Board 当前测试呼叫。
完成内容：
- Tauri 桌面壳的 Windows host readiness/status 原生命令支持透传 `checkBoard` 和 `server` 到 Node helper。
- Windows 控制端本机被控面板默认在体检和状态刷新时启用 `--checkBoard`，状态区和日志区会提示 active Mac -> Windows call 为“Mac 正在请求 Windows 配合”。
- DONE/完成态 call 只显示为非待办，不会误当作 Windows 当前要处理的呼叫；UI 不回显 call command。
- 页面级 diagnostics-only 回归补充 fake board active/DONE currentCall，断言请求携带 `checkBoard=true`、提示文案出现且 secret-like command 不渲染。
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
- `cargo check --manifest-path apps/windows-desktop/src-tauri/Cargo.toml`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
遗留问题：
- 本轮只做桌面 UI 可见提示，不自动响应/清理通讯板 call，不启动 Windows host，不认证、不发送密码、不执行真实输入。
下一步建议：
- Mac 侧准备控制 Windows 前，可先发 formal call；Windows 桌面版“本机被控”面板会直接显示该呼叫，再由用户决定启动/体检 Windows host。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Mac Codex

日期：2026-06-16 12:35
开发端：Mac Codex
本轮目标：让 Mac host 启动/状态助手也能只读提示 Agent Link Board 当前测试呼叫。
完成内容：
- `scripts/mac/start-mac-host.mjs` 新增 `--checkBoard`、`--server <url>` 和 `--boardSummary`，在 `--status` 路径只读读取 Agent Link Board `/api/state.currentCall`。
- JSON 输出新增 `board` 和 `boardSummary`；普通输出会显示 `Agent Link Board currentCall`；`--boardSummary` 输出一行秘密安全摘要。
- active call 会提示先协调，DONE/COMPLETED/CANCELLED/RESOLVED/CLOSED 等完成态 call 标为 inactive；摘要不回显 call command，JSON 保留结构化 command 给自动化。
- `--boardSummary --checkBoard` 即使忘记 `--status` 也会自动走只读 status，避免误启动 Mac host。
- `scripts/mac/test-mac-host-start-helper.mjs` 用假 Agent Link Board 覆盖默认不读板、active call、DONE call、单行 boardSummary 和不泄密。
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
- `node scripts/mac/test-mac-host-start-helper.mjs --timeoutMs 60000`
- `node scripts/mac/start-mac-host.mjs --status --json --checkBoard --timeoutMs 5000`
- `node scripts/mac/start-mac-host.mjs --boardSummary --checkBoard --timeoutMs 5000`
遗留问题：
- 本轮不自动响应/清理通讯板 call，也不启动或重启正式 Mac host；只让状态助手在日常查看 host 时更容易看见待处理 call。
下一步建议：
- 日常查看 Mac host 状态或准备重启前，可跑 `node scripts/mac/start-mac-host.mjs --status --checkBoard --boardSummary`，确认 host、buildDiff 和通讯板 call 后再行动。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Mac Codex

日期：2026-06-16 12:23
开发端：Mac Codex
本轮目标：让 Mac host readiness 也能只读提示 Agent Link Board 当前测试呼叫。
完成内容：
- `scripts/mac/check-mac-host-readiness.mjs` 新增 `--checkBoard`、`--server <url>` 和 `--boardSummary`，显式启用时直接读取 Agent Link Board `/api/state.currentCall`。
- JSON 输出新增顶层 `board`；普通输出新增 `Agent Link Board currentCall` step；`--boardSummary` 会输出一行秘密安全摘要。
- active call 会作为 readiness warning 提示先协调，DONE/COMPLETED/CANCELLED/RESOLVED/CLOSED 等完成态 call 标为 inactive，不当作待办；摘要不回显 call command，JSON 保留结构化 command 给自动化。
- 新增 `scripts/mac/test-mac-host-readiness-board.mjs`，用假 Agent Link Board 覆盖默认不读板、active call、DONE call、单行 boardSummary 和不泄密。
修改文件：
- `scripts/mac/check-mac-host-readiness.mjs`
- `scripts/mac/test-mac-host-readiness-board.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-host-readiness.mjs`
- `node --check scripts/mac/test-mac-host-readiness-board.mjs`
- `node scripts/mac/test-mac-host-readiness-board.mjs --timeoutMs 60000`
- `node scripts/mac/check-mac-host-readiness.mjs --json --checkBoard --timeoutMs 5000 --skipCurrentBuildCheck`
- `node scripts/mac/check-mac-host-readiness.mjs --boardSummary --checkBoard --timeoutMs 5000 --skipCurrentBuildCheck`
遗留问题：
- 本轮不自动响应/清理通讯板 call，也不启动/重启 Mac host；只让 readiness 在 Windows 已发 call 时更容易被 Mac 侧看见。
下一步建议：
- Mac host 改动、重启或正式验收前可跑 `node scripts/mac/check-mac-host-readiness.mjs --checkBoard --boardSummary`，先确认本机 readiness 和通讯板是否有 active call。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 12:23
开发端：Windows Codex
本轮目标：让 Windows host 启动/状态助手也能看到 Agent Link Board 当前测试呼叫。
完成内容：
- `scripts/windows/start-windows-host.mjs` 新增 `--checkBoard` 和 `--server <url>`，在 `--status` 路径只读读取 Agent Link Board `/api/state.currentCall`。
- `--status --json`、普通输出和 `--status --boardSummary` 会提示 active Mac -> Windows call；DONE/完成态 call 不进入待办摘要。
- PowerShell 包装 `scripts/windows/start-windows-host.ps1` 同步新增 `-CheckBoard` 和 `-Server`。
- 启动助手自测新增本机 fake Agent Link Board，覆盖 active Mac -> Windows call 和 DONE call；摘要不回显 call command。
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
- PowerShell 7 AST 语法解析 `start-windows-host.ps1`
- `node scripts/windows/test-windows-script-help.mjs --script start-windows-host.mjs --script test-windows-host-start-helper.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 60000`
- `node scripts/windows/start-windows-host.mjs --status --checkBoard --boardSummary --host 127.0.0.1 --port 9 --timeoutMs 8000`（离线非 0 符合预期）
- `node scripts/windows/start-windows-host.mjs --status --checkBoard --host 127.0.0.1 --port 9 --timeoutMs 8000`（真实联络板只读，当前 DONE call 显示 inactive）
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮只做状态提示，不自动响应、清理或覆盖通讯板 call；不启动 Windows host、不认证、不发送密码、不执行 `inject`。
下一步建议：
- Mac 发起 Windows host 验收 call 后，Windows 可先跑 `node scripts/windows/start-windows-host.mjs --status --checkBoard --boardSummary` 判断当前 host 是否在线、是否有待处理 call，再决定是否启动 host 或跑 readiness。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 12:18
开发端：Windows Codex
本轮目标：让 Windows host readiness 在准备 Mac 反控 Windows 时也能看到 Agent Link Board 当前测试呼叫。
完成内容：
- `scripts/windows/check-windows-host-readiness.mjs` 新增 `--checkBoard` 和 `--server <url>`，只读读取 Agent Link Board `/api/state.currentCall`。
- JSON 输出新增 `board`；普通输出会提示当前 call active/inactive；`--boardSummary` 只在 active Mac -> Windows call 时追加 `call=...`，DONE call 不当作待办。
- 通讯板读取失败只作为 warning，不会认证 WebSocket、不要求或发送密码、不发送输入、不执行 `inject`。
- `scripts/windows/test-windows-host-readiness-board-summary.mjs` 增加 fake Agent Link Board active Mac -> Windows call，覆盖 JSON 和一行 boardSummary 均能提示 call，且不回显 call command。
修改文件：
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node --check scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 120000 --readinessTimeoutMs 8000`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-host-readiness.mjs --script test-windows-host-readiness-board-summary.mjs --timeoutMs 10000`
- `node scripts/windows/check-windows-host-readiness.mjs --checkBoard --boardSummary --timeoutMs 8000`
遗留问题：
- 本轮不自动响应/清理通讯板 call，也不启动 Windows host；只让 readiness 在 Mac 已发 call 时更容易被 Windows 侧看见。
下一步建议：
- Mac 发起 `run-mac-client-formal-smoke --discover --ensureClient --preflightOnly --sendCall` 后，Windows 可跑 `node scripts/windows/check-windows-host-readiness.mjs --checkBoard --boardSummary`，确认本机 readiness 和 active call 后再启动 Windows host。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Windows Codex

日期：2026-06-16 12:05
开发端：Windows Codex
本轮目标：让 Windows 恢复开工总览与 Mac 侧一样优先结构化读取 Agent Link Board 当前测试呼叫。
完成内容：
- `scripts/windows/check-windows-resume-status.mjs` 的 `--checkBoard` 现在优先直接读取 Agent Link Board `/api/state`，把 `currentCall` 结构化写入 JSON；读取失败时仍保留旧的 `codex-link-client watch --once` 输出解析兜底。
- JSON `board.source` 会标记 `api-state` / `codex-link-client` / `skipped`，便于后续自动化判断读取路径；active Mac -> Windows call 仍会进入普通输出和 `--boardSummary`。
- DONE/完成类 call 会保留在 JSON 的 `board.currentCall` 中并标记 `active=false`，但不会进入待办摘要，避免恢复开工时误把已完成呼叫当作新任务。
- Node 与 PowerShell 回归都锁定 fake Agent Link Board `/api/state` 读取路径；Node 回归额外覆盖 DONE call 不进入 board summary。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- PowerShell 7 AST 语法解析 `check-windows-resume-status.ps1`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-resume-status.mjs --script test-windows-resume-status.mjs --script test-windows-resume-status-powershell.mjs --timeoutMs 10000`
- `node scripts/windows/check-windows-resume-status.mjs --checkBoard --noDiscover --host 127.0.0.1 --port 9 --boardSummary --timeoutMs 12000`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮不改变通讯板协议，也不自动发送/清理 call；只改 Windows 恢复总览读取方式和提示稳定性。
下一步建议：
- Windows 侧恢复开工继续先跑 `check-windows-resume-status --checkBoard --boardSummary`；如果出现 active Mac -> Windows call，先响应该 call，再启动新的正式验收。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Mac Codex

日期：2026-06-16 11:57
开发端：Mac Codex
本轮目标：让 Mac formal `--sendCall` / `--clearStaleCall` 守卫直接结构化读取 Agent Link Board 状态，避免完成呼叫误阻塞。
完成内容：
- `scripts/mac/check-mac-formal-e2e-status.mjs` 和 `scripts/mac/check-mac-client-formal-status.mjs` 的发 call 前守卫改为直接读取 Agent Link Board `/api/state` JSON，不再解析 `codex-link-client watch --once` 的人类可读文本。
- `done`、`completed`、`complete`、`cancelled`、`canceled`、`resolved`、`closed` 状态的 `currentCall` 会记录在 `boardCallBeforeSend` 中，但视为 inactive，不再阻塞新的正式 `--sendCall`。
- 没有状态或仍处于 active 状态的 `currentCall` 继续默认阻塞覆盖，除非显式 `--forceCall`；formal E2E 的 `--clearStaleCall` 仍只清理精确匹配的 Mac formal E2E 旧 call。
- 两组自测新增 DONE call 不阻塞回归，并保留已有 active call 默认拒绝、`--forceCall` 覆盖和秘密安全断言。
修改文件：
- `scripts/mac/check-mac-client-formal-status.mjs`
- `scripts/mac/check-mac-formal-e2e-status.mjs`
- `scripts/mac/test-mac-client-formal-status.mjs`
- `scripts/mac/test-mac-formal-e2e-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-client-formal-status.mjs`
- `node --check scripts/mac/test-mac-client-formal-status.mjs`
- `node --check scripts/mac/check-mac-formal-e2e-status.mjs`
- `node --check scripts/mac/test-mac-formal-e2e-status.mjs`
- `node scripts/mac/test-mac-client-formal-status.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-formal-e2e-status.mjs --timeoutMs 45000`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮只改 Mac 端 formal call 守卫和文档，不启动服务、不认证、不发送密码、不执行 `inject`。
下一步建议：
- Mac 侧后续发正式 call 前继续优先跑 `--boardSummary` / `--json` 看 `boardCallBeforeSend`；如果联络板显示 active call，先协调再决定是否 `--forceCall`。
是否改了协议：否。
是否需要另一端配合：当前不需要；Windows 端可继续做对称结构化读取或真实 Mac 控制 Windows 验收。

## 2026-06-16 Mac Codex

日期：2026-06-16 11:48
开发端：Mac Codex
本轮目标：让 Mac 恢复开工总览也能看到 Agent Link Board 当前测试呼叫。
完成内容：
- `scripts/mac/check-mac-resume-status.mjs` 在 `--checkBoard` 时直接读取 Agent Link Board `/api/state` JSON，并把 `currentCall` 结构化写入 `board.currentCall`。
- JSON 报告新增 `board.currentCall` 与 `board.activeCall`；普通输出会显示当前 call 摘要；`--boardSummary` 会追加 `call=active/done/none`，便于 Mac 端恢复开工时不漏看 Windows/Mac 待处理呼叫。
- 摘要只显示 call 状态、标题、来源、需要方和连接，不回显 call command；结构化 JSON 仍保留 command 给自动化读取。
- `scripts/mac/test-mac-resume-status.mjs` 用独立假 Agent Link Board 子进程覆盖 active call、DONE call、JSON/boardSummary 和秘密安全断言。
修改文件：
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-resume-status.mjs`
- `node --check scripts/mac/test-mac-resume-status.mjs`
- `node scripts/mac/test-mac-resume-status.mjs --timeoutMs 30000`
- `node scripts/mac/check-mac-resume-status.mjs --checkBoard --boardSummary --timeoutMs 5000`
遗留问题：
- 本轮不改变通讯板协议，也不自动发送/清理 call；只做恢复总览提示。真实测试协调仍按现有 `--sendCall` / `--forceCall` 规则执行。
下一步建议：
- 每次 Mac 端恢复工作仍先跑 `node scripts/mac/check-mac-resume-status.mjs --checkBoard --boardSummary`；如果显示 `call=active(...)`，先响应或协调该 call，再启动新的正式验收。
是否改了协议：否。
是否需要另一端配合：当前不需要。

## 2026-06-16 Mac Codex

日期：2026-06-16 11:32
开发端：Mac Codex
本轮目标：让 Mac 控制 Windows formal status 在本地 Mac client 页面离线时直接指向 `--ensureClient` 恢复路径。
完成内容：
- `scripts/mac/check-mac-client-formal-status.mjs` 的本地 Mac client 页面 blocker/warning 现在会同时提示 `start-mac-client --allowExisting` 和 `run-mac-client-formal-smoke --ensureClient`，避免 formal checklist 与 smoke 新入口脱节。
- `runPlan.commands` 新增/细化 `ensureMacClient`、`checkMacClient`、`safePreflightWithEnsureClient`、`sendCallWithEnsureClient`，并让正式 `browserSmoke` 默认带 `--ensureClient`；自定义 Windows host、client host/port 和 Agent Link Board server 会贯穿到命令。
- `scripts/mac/test-mac-client-formal-status.mjs` 增加离线提示、ready runPlan target-specific `--ensureClient` 命令和通讯板 call expected 文案断言。
- 本轮不启动服务、不认证 WebSocket、不要求或发送密码、不执行 `inject`，只收口本地页面启动提示和交接文档。
修改文件：
- `scripts/mac/check-mac-client-formal-status.mjs`
- `scripts/mac/test-mac-client-formal-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-client-formal-status.mjs`
- `node --check scripts/mac/test-mac-client-formal-status.mjs`
- `node scripts/mac/test-mac-client-formal-status.mjs --timeoutMs 30000`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮只验证 formal status 的本机/假服务路径；真实 Mac 控制 Windows 浏览器 smoke 仍需要 Windows host 在线，并由用户在 Mac 本机隐藏输入正式 Windows host 密码后执行。
下一步建议：
- Windows host 在线后，Mac 侧优先运行 `node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --sendCall`；ready 后再由用户在 Mac 本机隐藏输入正式密码运行 `node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --promptPassword`。
是否改了协议：否。
是否需要另一端配合：当前不需要；后续真实 Mac 控制 Windows 验收需要 Windows host 在线。

## 2026-06-16 Windows Codex

日期：2026-06-16 11:40
开发端：Windows Codex
本轮目标：让 Windows 恢复开工总览能看到 Agent Link Board 当前测试呼叫。
完成内容：
- `scripts/windows/check-windows-resume-status.mjs` 在 `--checkBoard` 时解析联络板 `currentCall`，提取 status/from/need/goal/command 等摘要，并判断是否 active、是否来自 Mac 侧、是否需要 Windows 处理。
- JSON 报告新增 `board.currentCall`；普通输出会在 Agent Link Board 行下显示 `currentCall=active/inactive` 和可执行 command；`--boardSummary` 会在有 active call 时追加 `call=...`，方便直接贴回通讯板。
- `scripts/windows/check-windows-resume-status.ps1` 帮助文案同步说明 `-CheckBoard` 会汇总当前 Agent Link call。
- Node 和 PowerShell 两套回归都新增 fake Agent Link Board active Mac -> Windows call 覆盖，确认摘要包含方向/目标且不泄露测试密码。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- PowerShell 7 AST 语法解析 `check-windows-resume-status.ps1`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 45000`
遗留问题：
- 本轮只用假 Mac host 和假 Agent Link Board 自测；没有启动真实 Windows host、没有连接真实 Mac、没有认证 WebSocket、没有发送密码、没有执行 `inject`。
下一步建议：
- Mac 端发 `run-mac-client-formal-smoke --discover --ensureClient --preflightOnly --sendCall` 后，Windows 侧可同时用 watcher 弹窗和 `check-windows-resume-status --checkBoard --boardSummary` 看见该 active call，再启动/确认 Windows host。
是否改了协议：否。
是否需要另一端配合：当前不需要；后续真实 Mac 控制 Windows 验收时由 Mac 端发 call。

## 2026-06-16 Windows Codex

日期：2026-06-16 11:20
开发端：Windows Codex
本轮目标：让 Windows 本地 Agent Link watcher 能识别 Mac 发给 Windows 的正式测试呼叫。
完成内容：
- `scripts/windows/watch-codex-link-mac-alerts.ps1` 新增 `currentCall` 读取逻辑：当 Agent Link Board 上有来自 Mac 侧、需要 Windows Codex/Windows host 配合、且状态仍未完成的呼叫时，会在 Windows 本机触发提醒。
- 已完成的 `DONE`/`COMPLETED`/`CANCELLED` 等呼叫不会提醒；Windows 自己呼叫 Mac 的测试请求也不会被这个 watcher 误弹。
- 提醒内容包含 status/from/need/goal/connection/command/expected/ask/updatedAt，便于 Windows 端从弹窗或日志直接知道下一步该跑什么；规则仍只读联络板，不认证、不发送密码、不执行输入。
- `scripts/windows/test-mac-alert-watcher.mjs` 用本机假 Agent Link Board 增加 Mac -> Windows active call、done call 忽略、Windows -> Mac call 忽略三条回归。
修改文件：
- `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
- `docs/LAN_CODEX_LINK.md`
- `docs/TEST_COORDINATION.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- PowerShell 7 AST 语法解析 `watch-codex-link-mac-alerts.ps1`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 20000`
- `node scripts/windows/test-windows-script-help.mjs --script test-mac-alert-watcher.mjs --timeoutMs 10000`
遗留问题：
- 本轮只用假联络板验证，没有触发真实系统弹窗；真实使用时可通过 `scripts/windows/start-mac-alert-watcher.ps1 -Server http://192.168.31.68:17888 -Restart` 后等待 Mac 端发正式 `--sendCall` 验证。
下一步建议：
- Mac 端准备正式 Mac 控制 Windows smoke 时，可继续使用 `run-mac-client-formal-smoke --discover --preflightOnly --sendCall`；Windows watcher 后台运行时会看到该 currentCall 并提醒 Windows 端先确认 host 状态。
是否改了协议：否。
是否需要另一端配合：当前不需要；后续真实 Mac 控制 Windows 验收时由 Mac 端发 call 即可。

## 2026-06-16 Mac Codex

日期：2026-06-16 11:21
开发端：Mac Codex
本轮目标：给 Mac 控制 Windows formal smoke 增加安全 `--ensureClient`，减少真连前忘开本地 Mac client 页面的问题。
完成内容：
- `scripts/mac/run-mac-client-formal-smoke.mjs` 新增 `--ensureClient`：在 discovery/preflight 前调用 `scripts/mac/start-mac-client.mjs --json --allowExisting --host <clientHost> --port <clientPort>`，安全启动或复用本机 Mac client 页面。
- `--ensureClient` 会清空传给启动助手的 `LAN_DUAL_PASSWORD`，只启动/检查本机 Web 页面；不会连接 Windows host、不会认证 WebSocket、不会要求或打印密码、不会发送输入事件、不会执行 `inject`。
- JSON 输出新增 `ensuredClient` 摘要：`attempted`、`ok`、`exitCode`、`signal`、`url`、`online`、`processId`、`reusedExisting` 和 `error`，方便自动化判断本地页面是新启还是复用。
- 本地页面启动失败时，错误摘要优先保留子进程异常、信号或 stderr，再回退到 JSON parseError，避免只看到“解析失败”。
- 自测新增 `--ensureClient` help 断言和临时端口 preflight 覆盖：会启动临时 Mac client 页面，跑无密 formal checklist，并确认测试密码没有泄露；测试结束会清理临时进程。
- Mac client README、CURRENT_STATUS、NEXT_ACTIONS、04-task-board 和 ACTIVE_LOCKS 已同步推荐命令：`node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --sendCall`。
修改文件：
- `scripts/mac/run-mac-client-formal-smoke.mjs`
- `scripts/mac/test-mac-client-formal-smoke.mjs`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/run-mac-client-formal-smoke.mjs`
- `node --check scripts/mac/test-mac-client-formal-smoke.mjs`
- `node scripts/mac/test-mac-client-formal-smoke.mjs --timeoutMs 60000`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮只验证本机临时页面和 mock Windows discovery；真实 Mac 控制 Windows 浏览器 smoke 仍需要 Windows host 在线，并由用户在 Mac 本机隐藏输入正式 Windows host 密码后执行。
下一步建议：
- Windows host 启动后，Mac 侧优先运行 `node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --sendCall`；它会先确保本地页面在线，再 ready 后发无密 call。随后用户在 Mac 本机隐藏输入正式密码，运行 `node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --promptPassword` 做真实观感/音画/剪贴板 smoke。
是否改了协议：否。
是否需要另一端配合：当前不需要；后续真实 Mac 控制 Windows 验收需要 Windows host 在线。

## 2026-06-16 Mac Codex

日期：2026-06-16 11:06
开发端：Mac Codex
本轮目标：把 Mac 控制 Windows formal smoke 的发现、只读预检和通讯板呼叫收成一条安全命令。
完成内容：
- `scripts/mac/run-mac-client-formal-smoke.mjs` 新增显式 `--sendCall` / `--forceCall` 参数，其中 `--sendCall` 只能和 `--preflightOnly` 同用，避免误进入浏览器认证或密码流程。
- `--preflightOnly --sendCall` 会先跑原有无密 formal checklist，只有 `readyToCall=true` 时才委托 `check-mac-client-formal-status --sendCall` 发送 Agent Link Board call；未 ready、没有 Windows host、或通讯板发送失败都会拒绝并返回错误。
- `--discover --preflightOnly --sendCall` 可先只读扫描 Windows `/discovery`、自动选中最佳 Windows host，再发送同一条无密正式 Windows host 验收 call；发送结果会写入 JSON `sentCall`，boardSummary 成功时显示 `Agent Link Board call was sent`。
- 参数解析错误现在也能按 `--json` 输出机器可读错误，避免自动化遇到 `--sendCall` 漏 `--preflightOnly` 时拿到空 stdout。
- README、CURRENT_STATUS、NEXT_ACTIONS、04-task-board 和 ACTIVE_LOCKS 已同步推荐命令：`node scripts/mac/run-mac-client-formal-smoke.mjs --discover --preflightOnly --sendCall`。
- 本轮只用本机假 Windows host 和假 Agent Link Board 自测；未连接真实 Windows host、未认证 WebSocket、未要求或发送密码、未向真实通讯板发 formal call、未执行 `inject`。
修改文件：
- `scripts/mac/run-mac-client-formal-smoke.mjs`
- `scripts/mac/test-mac-client-formal-smoke.mjs`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/run-mac-client-formal-smoke.mjs`
- `node --check scripts/mac/test-mac-client-formal-smoke.mjs`
- `node scripts/mac/test-mac-client-formal-smoke.mjs --timeoutMs 60000`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 真实 Mac 控制 Windows 浏览器 smoke 仍需要 Windows host 在线，并由用户在 Mac 本机隐藏输入正式 Windows host 密码后执行 `--discover --promptPassword`。
下一步建议：
- Windows host 启动后，Mac 侧先运行 `node scripts/mac/run-mac-client-formal-smoke.mjs --discover --preflightOnly --sendCall`；它 ready 才会发 call 给 Windows。随后用户在 Mac 本机隐藏输入正式密码，运行 `node scripts/mac/run-mac-client-formal-smoke.mjs --discover --promptPassword` 做真实观感/音画/剪贴板 smoke。
是否改了协议：否。
是否需要另一端配合：当前不需要；后续真实 Mac 控制 Windows 验收需要 Windows host 在线。

## 2026-06-16 Windows Codex

日期：2026-06-16 11:05
开发端：Windows Codex
本轮目标：让 Windows host `--status` 输出 Mac 侧 formal `--sendCall` 协调命令，方便 Mac 反控 Windows 前安全发起无密 call。
完成内容：
- `scripts/windows/start-windows-host.mjs` 的 Mac 下一步目标新增 `sendCallCommand`，对应 `node scripts/mac/check-mac-client-formal-status.mjs --host <Windows IP> --port <port> --sendCall`。
- `--status` 普通输出、`--status --json`、`--status --boardSummary` 以及启动后 ready 输出都会带 Mac formal send-call 命令。
- 该命令只用于 Mac formal checklist ready 后向 Agent Link Board 发起无密协调 call；Windows status 本身仍只读 `/discovery`，不启动、不认证、不要求或发送密码、不执行 `inject`。
- `scripts/windows/test-windows-host-start-helper.mjs` 增加普通输出、JSON、boardSummary 和启动后 ready 输出中的 `--sendCall` 断言。
修改文件：
- `scripts/windows/start-windows-host.mjs`
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
- `node scripts/windows/test-windows-script-help.mjs --script start-windows-host.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
遗留问题：
- 本轮只用临时本机 Windows host 自测，没有启动正式常驻 Windows host，也没有执行真实 Mac 控制 Windows 浏览器 smoke。
下一步建议：
- 后续 Mac 控制 Windows 真连前，Windows 侧先运行 `node scripts/windows/start-windows-host.mjs --status --boardSummary`；若在线且 build 可接受，Mac 侧可按摘要先跑 formal checklist，ready 后再用 `--sendCall` 发起协调。
是否改了协议：否。
是否需要另一端配合：当前不需要；真实 Mac 控制 Windows 验收时需要 Windows host 在线、Mac client 页面在线，并由用户在 Mac 本机隐藏输入正式密码。

## 2026-06-16 Windows Codex

日期：2026-06-16 10:55
开发端：Windows Codex
本轮目标：让 Windows 侧发现 Mac host 后也能直接给出 ready 后的无密授权提醒发送命令，减少正式 Mac E2E 前手工拼接通讯板消息。
完成内容：
- `scripts/windows/discover-lan-hosts.mjs` 在发现 Mac host 后新增 `macFormalE2e.sendUserAuthRequestCommand`，对应 `check-mac-formal-e2e --preflightOnly --checkClientDiagnostics --sendUserAuthRequest`。
- `--boardSummary` 和普通文本输出现在同时给出预检、只生成授权提醒、自动发送授权提醒和正式 `--promptPassword` 命令。
- 发现脚本仍只读 `/discovery`，不认证 WebSocket、不要求或发送密码、不发送输入、不执行 `inject`；真正发送授权提醒仍由后续 `check-mac-formal-e2e` 在 preflight ready 时守卫。
- `scripts/windows/test-discover-lan-hosts.mjs` 增加 JSON 和 board summary 断言，锁定 `--sendUserAuthRequest` 命令出现且输出不含 `LAN_DUAL_PASSWORD` / 测试密码。
修改文件：
- `scripts/windows/discover-lan-hosts.mjs`
- `scripts/windows/test-discover-lan-hosts.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/discover-lan-hosts.mjs`
- `node --check scripts/windows/test-discover-lan-hosts.mjs`
- `node scripts/windows/test-discover-lan-hosts.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-script-help.mjs --script discover-lan-hosts.mjs --timeoutMs 10000`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮未扫描真实局域网、未启动或认证真实 Mac host；只用本机假 `/discovery` 验证发现摘要和下一步命令。
下一步建议：
- 后续 Windows 控制 Mac 复跑前，可先运行 `node scripts/windows/discover-lan-hosts.mjs --boardSummary --requireMacHost`，若摘要确认 buildDiff 可接受，再按摘要里的 `--sendUserAuthRequest` 命令触发无密授权提醒。
是否改了协议：否。
是否需要另一端配合：当前不需要；真实 formal E2E 复跑时再由 Mac host 在线配合。

## 2026-06-16 Mac Codex

日期：2026-06-16 10:47
开发端：Mac Codex
本轮目标：收口 Mac 控制 Windows formal smoke 的通讯板衔接，让预检/干跑也直接暴露 ready 后的 `--sendCall` 命令。
完成内容：
- `scripts/mac/run-mac-client-formal-smoke.mjs` 在已有 Windows host 时新增 `commands.sendCall`，对应 `check-mac-client-formal-status --host <Windows IP> --port <port> --sendCall`。
- `--preflightOnly --boardSummary` 在 formal checklist ready 时会提示可先用该 `--sendCall` 命令协调 Windows；没有 host 时仍不输出空 host 的 auth/sendCall 命令。
- `run-mac-client-formal-smoke --server <url>` 现在会传给内部 `check-mac-client-formal-status`，并同步写进输出的 preflight/sendCall 命令，方便假通讯板或备用通讯板测试。
- `scripts/mac/test-mac-client-formal-smoke.mjs` 的假 Agent Link Board 改为独立子进程，避免同步子进程读板时把同进程 HTTP server 事件循环堵住；新增断言覆盖 ready sendCall 提示、自定义 board server 贯穿和发现失败无 sendCall。
- 本轮未启动真实 Windows host、未认证 WebSocket、未要求或发送密码、未发送通讯板 call、未执行 `inject`。
修改文件：
- `scripts/mac/run-mac-client-formal-smoke.mjs`
- `scripts/mac/test-mac-client-formal-smoke.mjs`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/run-mac-client-formal-smoke.mjs`
- `node --check scripts/mac/test-mac-client-formal-smoke.mjs`
- `node scripts/mac/test-mac-client-formal-smoke.mjs --timeoutMs 60000`
遗留问题：
- 本轮只补无密流程衔接；真实 Mac 控制 Windows 浏览器 smoke 仍需要 Windows host 在线，并由用户在 Mac 本机隐藏输入正式 Windows host 密码后执行。
下一步建议：
- Windows host 启动后，Mac 侧先跑 `node scripts/mac/run-mac-client-formal-smoke.mjs --discover --preflightOnly --boardSummary`；若 ready 且需要 Windows 端看屏/保活，再运行摘要或 JSON 里的 `--sendCall` 命令，最后由用户在 Mac 本机隐藏输入正式密码跑 `--discover --promptPassword`。
是否改了协议：否。
是否需要另一端配合：当前不需要；后续真实 Mac 控制 Windows 验收需要 Windows host 在线。

## 2026-06-16 Mac Codex

日期：2026-06-16 10:35
开发端：Mac Codex
本轮目标：让 Mac 侧发现 Windows host 后直接给出 ready 后的通讯板 call 命令，减少跨端真连前手工拼接。
完成内容：
- `scripts/mac/discover-windows-hosts.mjs` 在发现 Windows host 后新增 `sendCallCommand` 字段，对应 `check-mac-client-formal-status --host <Windows IP> --port <port> --sendCall`。
- `--boardSummary` 现在同时给出 formal checklist 命令和 ready 后的 `--sendCall` 协调命令；仍然只读扫描 `/discovery`，不认证、不要求密码、不发送输入、不执行 `inject`。
- `scripts/mac/test-discover-windows-hosts.mjs` 增加 JSON 和 board summary 断言，确保 `sendCallCommand` 出现且摘要不泄密。
修改文件：
- `scripts/mac/discover-windows-hosts.mjs`
- `scripts/mac/test-discover-windows-hosts.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/discover-windows-hosts.mjs`
- `node --check scripts/mac/test-discover-windows-hosts.mjs`
- `node scripts/mac/test-discover-windows-hosts.mjs --timeoutMs 30000`
遗留问题：
- 本轮未扫描真实局域网、未启动 Windows host、未跑真实 Mac 控制 Windows 验收；后续需要 Windows host 在线并由用户在 Mac 本机隐藏输入正式密码后执行真连 smoke。
下一步建议：
- Windows host 启动后，Mac 侧运行 `node scripts/mac/discover-windows-hosts.mjs --boardSummary`；若 formal checklist ready 且需要 Windows 协调，再运行摘要里的 `--sendCall` 命令。
是否改了协议：否。
是否需要另一端配合：当前不需要；后续真实 Mac 控制 Windows 验收需要 Windows host 在线。

## 2026-06-16 Mac Codex

日期：2026-06-16 10:22
开发端：Mac Codex
本轮目标：补齐 Mac 控制 Windows formal checklist 的无密通讯板呼叫入口，减少真连验收前手工协调失误。
完成内容：
- `scripts/mac/check-mac-client-formal-status.mjs` 新增 `--sendCall` / `--forceCall`：只有 `readyToCall=true` 时才向 Agent Link Board 发送 Mac Codex -> Windows Codex 的正式 Windows host 验收 call。
- 发送前会先读取通讯板 current call；如果已有 active call，默认拒绝覆盖并提示先协调，只有显式 `--forceCall` 才允许替换。
- call payload 不包含密码、token 或系统账号；`command` 字段给 Windows 端可执行的 `start-windows-host --status --json` 状态确认命令，Mac 端真连命令放在 `expected/ask` 里说明。
- `scripts/mac/test-mac-client-formal-status.mjs` 增加假 Agent Link Board 覆盖：离线 `--sendCall` 不发板、ready 发送一条、已有 call 拒绝覆盖、`--forceCall` 显式覆盖。
- 本轮未启动/停止真实服务，未认证 WebSocket，未要求或发送密码，未执行 `inject`，未改协议。
修改文件：
- `scripts/mac/check-mac-client-formal-status.mjs`
- `scripts/mac/test-mac-client-formal-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-client-formal-status.mjs`
- `node --check scripts/mac/test-mac-client-formal-status.mjs`
- `node scripts/mac/test-mac-client-formal-status.mjs --timeoutMs 60000`
- `node scripts/mac/check-mac-client-formal-status.mjs --skipBoard --allowDirty --allowClientServerOffline --allowWindowsHostOffline --boardSummary --timeoutMs 1200`
- `git diff --check`
- 冲突标记扫描
遗留问题：
- 本轮只补安全协调入口，没有执行真实 Mac 控制 Windows 跨机验收；需要 Windows host 在线、Mac client 页面在线并由用户在 Mac 本机隐藏输入正式密码后再跑 `run-mac-client-formal-smoke`。
下一步建议：
- Windows host 准备好后，Mac 侧先运行 `node scripts/mac/check-mac-client-formal-status.mjs --host <Windows IP> --port 43770 --boardSummary`；ready 且需要另一端配合时再运行同命令加 `--sendCall`。
是否改了协议：否。
是否需要另一端配合：当前不需要；后续真实 Mac 控制 Windows 验收需要 Windows 端保持 host 在线。

## 2026-06-16 Mac Codex

日期：2026-06-16 09:52
开发端：Mac Codex
本轮目标：让 Mac 恢复开工摘要直接携带真实 inject 启动硬护栏，减少联络板转述时的歧义。
完成内容：
- `scripts/mac/check-mac-resume-status.mjs` 的普通 safety recommendation 和 `--boardSummary` 现在明确写出：inject 启动需要用户看着 Mac 屏幕，并且必须带 `--confirmUserWatching`。
- `scripts/mac/test-mac-resume-status.mjs` 增加断言，要求离线/在线 JSON 与 board summary 都包含 `--confirmUserWatching`，避免以后退回含糊文案。
- 实际运行 `node scripts/mac/check-mac-resume-status.mjs --checkBoard --boardSummary` 确认摘要仍不泄密，且当前 Mac host 在线于 `192.168.31.122:43770`、`inputMode=log`、runtime build `d398d64`，host runtime source diff=0。
- 本轮未启动/停止 host，未要求密码，未发送密码，未执行 `inject`，未改协议。
修改文件：
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-resume-status.mjs`
- `node --check scripts/mac/test-mac-resume-status.mjs`
- `node scripts/mac/test-mac-resume-status.mjs --timeoutMs 60000`
- `node scripts/mac/check-mac-resume-status.mjs --checkBoard --boardSummary`
- `git diff --check`
遗留问题：
- 当前 Mac host 仍是 runtime build `d398d64`，repo build metadata 已到 `54163bb+`；`apps/mac-host` runtime 源码无变化，日常 log 模式可继续。部署强验收时再重启 host。
下一步建议：
- 继续推进不需要授权的 Mac 侧稳定性：可扩展 resume/formal checklist 的安全摘要覆盖，或做 Mac client 控制 Windows 真连前的只读状态增强。
是否改了协议：否。
是否需要另一端配合：否。

## 2026-06-16 Mac Codex

日期：2026-06-16 09:25
开发端：Mac Codex
本轮目标：收口真实 Mac input inject 复跑文档，确保后续两端不会复制旧命令绕过 `--confirmUserWatching` 护栏。
完成内容：
- 开工检查 Agent Link Board、远端 git 和 Mac resume summary；当前 repo 干净，Mac host 在线于 `192.168.31.122:43770`，runtime build `d398d64`，`inputMode=log`，权限/H.264/audio 可用；运行中 host 到当前 repo 仅 build metadata stale，host runtime source diff=0。
- 文档同步 `scripts/mac/start-mac-host.mjs` 最新安全行为：真实 `--inputMode inject` / `--injectInput` 启动必须额外带 `--confirmUserWatching`，dry-run/status/stop/log 模式不受影响。
- 更新可复制复跑命令：真实 safe inject 复跑时 Mac 端应先确认用户正在看 Mac 屏幕，再运行 `node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --inputMode inject --confirmUserWatching --background`；Windows 端仍只跑 `--inputEventSet safe --expectInputMode inject --expectInputInjected true`。
- 明确裸 `LAN_DUAL_INPUT_MODE=inject` 只保留给人工监督下的底层调试，不作为日常交接命令。
- 本轮未启动/停止 host，未要求密码，未发送密码，未执行 `inject`，未改协议或代码。
修改文件：
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/08-next-work-plan.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node scripts/mac/check-mac-resume-status.mjs --checkBoard --boardSummary`
- `git diff --check`
- 冲突标记扫描
- `rg` 检查文档中 `inject` / `--inputMode inject` 复跑口径
遗留问题：
- 当前 Mac host runtime build 仍是 `d398d64`，repo 是更新后的文档提交；host runtime source diff=0，不影响当前 log-mode 服务。下一次需要部署强验收时再重启 host 到最新 build metadata。
下一步建议：
- 继续做无需用户授权的稳定性任务：优先在 log 模式下复跑 Mac host 长稳/恢复状态检查，或推进 Mac client 控制 Windows 真连前的只读清单和 UI 体验。
是否改了协议：否。
是否需要另一端配合：否；仅请 Windows 端后续复跑真实 inject 时按新文档加 `--confirmUserWatching`。

## 2026-06-16 Windows Codex

日期：2026-06-16 09:40
开发端：Windows Codex
本轮目标：增强 Windows 控制端输入模式提示，避免 Mac host 处于安全 `inputMode=log` 时，用户看到“已连接但不能点击/控制”后误判为故障。
完成内容：
- `apps/windows-client/app.js` 新增顶部输入状态详情：`inputMode=log` 显示“安全日志，不会真正控制”，`inject` 显示“真实控制”，`input_ack` 会同步显示“已记录 / 已注入 / 被拒绝”和错误码。
- `updateHostDiagnostics` / `resetHostDiagnostics` 会同步刷新顶部“输入事件”卡片，连接成功后无需先移动鼠标就能看到当前输入模式。
- 诊断导出里的输入事件行改为复用页面当前文案，保留安全日志/真实控制/拒绝等上下文。
- `scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly` 新增页面级输入状态断言，覆盖安全日志、已记录、真实控制、已注入和被拒绝提示。
- `apps/windows-client/README.md`、当前状态、下一步和任务板已同步该提示与回归入口。
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
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-client-browser.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps/windows-client/app.js scripts/windows/test-windows-client-browser.mjs apps/windows-client/README.md docs/CURRENT_STATUS.md docs/NEXT_ACTIONS.md docs/04-task-board.md docs/HANDOFF_LOG.md docs/ACTIVE_LOCKS.md`
遗留问题：
- 本轮不连接真实 Mac、不发送密码、不执行真实 `inject`；只是把安全日志模式在 Windows UI 上讲清楚。
下一步建议：
- 后续真机控制体验验收时，先看顶部“输入事件”是否显示安全日志或真实控制，再决定是否需要 Mac 端在用户看屏幕时短时间切 `inject`。
是否改了协议：否。
是否需要另一端配合：否；后续真实输入体验验收才需要 Mac 端配合。

## 2026-06-16 Windows Codex

日期：2026-06-16 09:30
开发端：Windows Codex
本轮目标：把 Windows 控制 Mac 的快捷键兼容映射从页面内联逻辑抽成可测试共享工具，降低后续真实键盘/文本编辑验收的误判风险。
完成内容：
- `apps/windows-client/mapping-utils.js` 新增键盘映射共享函数和常量：默认 Win→Command、Alt→Option、Ctrl→Control；Windows 快捷键兼容开启时，Ctrl+C/V/X/A/Z/F/S/P/O/N/W/T/R 会按 macOS Command 快捷键发送，Ctrl+Y 和 Ctrl+Shift+Z 都映射为 Command+Shift+Z。
- `apps/windows-client/app.js` 改为复用共享映射函数，保留原有 UI、偏好保存、兼容开关和自定义 Win/Alt/Ctrl 下拉框行为。
- `scripts/windows/test-coordinate-mapping.mjs` 扩展为坐标 + 键盘映射双回归：覆盖 Ctrl+C/V/X/A/Z/Y、Ctrl+Shift+Z、兼容关闭后的 Ctrl→Control、自定义 Win/Alt/Ctrl 映射和描述文字。
- `scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly` 新增页面级键盘映射断言，确认真实页面路径里 Ctrl+C -> Command+C，自定义映射仍生效。
- `apps/windows-client/README.md` 和状态/下一步/任务文档已同步该回归入口。
修改文件：
- `apps/windows-client/mapping-utils.js`
- `apps/windows-client/app.js`
- `apps/windows-client/README.md`
- `scripts/windows/test-coordinate-mapping.mjs`
- `scripts/windows/test-windows-client-browser.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-client/mapping-utils.js`
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-coordinate-mapping.mjs`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-coordinate-mapping.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script test-coordinate-mapping.mjs --script test-windows-client-browser.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --timeoutMs 45000`
遗留问题：
- 本轮没有执行真实 Mac 输入注入，也没有扩大到点击/滚轮/full event set；真机编辑器/文本框验收仍需要用户在场，并由 Mac 端提供安全测试页面或空白可撤销场景。
下一步建议：
- 真机键盘体验验收前先跑本轮两条回归，再让 Mac host 在用户确认后短时间切 `inject`，从安全文本框验证复制、粘贴、撤销、重做和中文输入法边界。
是否改了协议：否。
是否需要另一端配合：当前不需要；后续真机键盘体验验收需要 Mac 端准备安全场景。

## 2026-06-16 Windows Codex

日期：2026-06-16 09:15
开发端：Windows Codex
本轮目标：在用户确认人在现场后，完成真实 Mac input inject 小范围验收，并补上 Windows 探针的真注入强校验，避免把日志模式误判为真注入。
完成内容：
- 开工检查 Agent Link Board 和真实 `/discovery`：Mac host `192.168.31.122:43770` 先在线于 `inputMode=log`，随后 Mac Codex 在用户确认看着 Mac 屏幕后停止 log host，并用隐藏密码启动 `--inputMode inject --background`。
- Windows 端只读发现确认新 Mac host ready：runtime build `d398d64`，`inputMode=inject`，权限全开，host runtime source diff=0。
- 真实 safe inject 小验收已通过：Windows 本机隐藏输入密码后运行 `node scripts/windows/probe-mac-host.mjs --host 192.168.31.122 --port 43770 --promptPassword --requirePassword --inputEvents --inputEventSet safe --expectInputMode inject --expectInputInjected true`，probe exit code 0；safe set 仅鼠标移动 + F13，2 个事件均收到 `input_ack injected=true`。
- 已向 Agent Link Board 同步通过摘要；密码未上通讯板，未执行点击、Delete、Ctrl+A 或 full event set。
- `scripts/windows/probe-mac-host.mjs` 新增 `--expectInputInjected true|false`，在 `--inputEvents` 时强制检查每个 `input_ack.injected`，防止 log-only ack 被误当成真实注入。
- `probe-mac-host` 新增 `--inputEventSet safe|full`，默认 `safe` 只发送鼠标移动和 F13 两个低副作用事件；旧的点击、滚轮、Ctrl+A、Delete、Insert 等事件保留在显式 `--inputEventSet full`。
- `scripts/windows/test-mac-host.ps1` 同步支持 `-ExpectInputInjected` 和 `-InputEventSet`，便于现场用 PowerShell 跑同一套真注入小验收。
- `scripts/windows/test-probe-mac-host-discover.mjs` 增加 mock 回归：log-only mock host 在 `--expectInputInjected false` 下通过，在 `--expectInputInjected true` 下必须失败。
修改文件：
- `scripts/windows/probe-mac-host.mjs`
- `scripts/windows/test-mac-host.ps1`
- `scripts/windows/test-probe-mac-host-discover.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/probe-mac-host.mjs`
- `node --check scripts/windows/test-probe-mac-host-discover.mjs`
- PowerShell AST parse `scripts/windows/test-mac-host.ps1`
- `node scripts/windows/test-probe-mac-host-discover.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --script probe-mac-host.mjs --script test-probe-mac-host-discover.mjs --timeoutMs 10000`
- 真实 inject transcript：`.dev-lab/mac-inject-safe-20260616-091526.transcript.txt`，结尾包含 `Input events acknowledged: 2 events / injected=true` 和 `probe exit code: 0`
遗留问题：
- 本轮只覆盖低副作用 safe set（鼠标移动 + F13）；点击、滚轮、Delete、Ctrl+A、Insert 等 full event set 仍需用户另行明确同意后再做。
下一步建议：
- 先不要默认扩大到 `--inputEventSet full`；下一步更值得做的是把真实点击/键盘映射和可撤销测试场景设计好，再在空白安全页面里验收。
是否改了协议：否。
是否需要另一端配合：本轮已配合完成；后续若扩大 full event set，需要 Mac Codex 保持 host 在线并需要用户继续在现场观察屏幕。

## 2026-06-16 Windows Codex

日期：2026-06-16 08:58
开发端：Windows Codex
本轮目标：响应 Mac 端正式 E2E 呼叫，在用户在场时完成真实 Windows 控制 Mac formal E2E，并把结果同步到联络板和文档。
完成内容：
- 开工前读取 Agent Link Board，确认 Mac host 已由 Mac Codex 启动并 ready：`192.168.31.122:43770`，runtime build `c5e5009`，`inputMode=log`，屏幕录制/辅助功能/输入监控权限全开，H.264、系统 PCM、文本/文件剪贴板可用。
- Windows 侧先跑无密 `check-mac-formal-e2e --discover --discoverNoLocalSubnets --preflightOnly --checkClientDiagnostics --boardSummary`，确认 discovery、权限、能力和 Windows 控制端诊断均通过；摘要已发 Agent Link Board，未包含密码。
- 由于 Codex 内部终端不是交互 TTY，正式 `--promptPassword` 改为可见 PowerShell 7 窗口运行，由用户在 Windows 本机隐藏输入正式 Mac host 密码；密码只经环境变量传给子探针，未上通讯板、未放入命令参数。
- 正式验收完成且 node exit code 0：H.264/WebCodecs 解码 OK，canvas 1920x1080，`H264Errors=0`；页面显示实收约 52.4 FPS、协商 30 Hz、请求 60 Hz；系统 PCM 音频帧可播放；文本/文件剪贴板、input-log、黑边防护、stream fallback 诊断和 frame age 诊断均 OK。
- Agent Link Board 已补发正式验收结果摘要；Supervisor 已把 call 标记 DONE。
修改文件：
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node scripts/windows/check-mac-formal-e2e.mjs --discover --discoverNoLocalSubnets --host 192.168.31.122 --port 43770 --preflightOnly --checkClientDiagnostics --boardSummary`
- 可见 PowerShell 7 正式验收窗口运行 `node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --promptPassword`
- 正式 transcript：`.dev-lab/formal-e2e-windows-20260616-084744.transcript.txt`
- transcript 结尾包含 `[OK] Formal Mac E2E checks finished.` 和 `Formal E2E node exit code: 0`
遗留问题：
- 本轮仍未执行真实输入注入；当前 `inputMode=log` 只验证了安全输入 ack。进入 `inject` 前必须由用户另行明确确认，并确保两端屏幕可见。
- 当前结果证明真实控制链路的媒体、剪贴板和安全输入日志路径可用；后续还要继续做长时间稳定性、真实操作手感、最小化提醒产品化和 Mac 反控 Windows 真连。
下一步建议：
- 白天继续时先看 Agent Link Board 和本条交接，再决定是否进入真实 `inject` 验收，或优先做长稳/画质/延迟/音频听感专项。
- 若要复跑 formal E2E，仍按“无密预检 -> 用户本机隐藏输入密码 -> 正式验收”的流程，密码不要发通讯板。
是否改了协议：否。
是否需要另一端配合：本轮正式验收已完成；后续若做真实 `inject` 或长稳专项，需要用户和 Mac Codex 明确配合。

## 2026-06-16 Mac Codex

日期：2026-06-16 08:57
开发端：Mac Codex
本轮目标：白天恢复后重新启动真实 Mac host，协同 Windows 完成正式 Windows 控制 Mac E2E，并记录通过证据。
完成内容：
- 开工前读取 Agent Link Board、同步 Windows 最新 `5e8bb4b` watcher lifecycle 提交，并确认本地 repo clean。
- 用户在场后，按安全流程运行 `node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --background`：脚本先响铃并弹 Mac 本机隐藏密码框，密码未发送到通讯板或命令参数。
- Mac host 后台启动成功：`192.168.31.122:43770`，pid=`84997`，runtimeBuild=`c5e5009`，`inputMode=log`，screen/accessibility/inputMonitoring 权限全开，H.264、系统 PCM、文本/文件剪贴板可用。
- 向 Agent Link Board 发送 ready 状态并刷新 formal E2E call，Windows 侧随后完成无密 preflight/client diagnostics。
- Supervisor 确认正式 Windows 控制 Mac E2E 已完成且退出码 0；Windows transcript `.dev-lab/formal-e2e-windows-20260616-084744.transcript.txt` 显示 Control center、文件剪贴板恢复、黑边防护、H.264/WebCodecs、音频帧和诊断均 OK，最终 `[OK] Formal Mac E2E checks finished`。Windows Codex 补发摘要：H.264/WebCodecs 解码 OK，canvas=`1920x1080`，实收约 `52.4 FPS`（请求 60Hz、协商 30Hz），audio `pcm-f32le` 有播放，剪贴板/文件剪贴板恢复/input-log/客户端诊断均 OK。
- 拉取 Windows `5e8bb4b` 后，运行中 Mac host 只剩 build metadata stale；`changedHostRuntimeFileCount=0`，Mac host 行为源码未变，所以未为 watcher 文档/Windows 脚本提交重启 host。
- CURRENT_STATUS、NEXT_ACTIONS 和任务板同步：正式 E2E 已通过；密码未上通讯板；`inject` 仍未执行。
修改文件：
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --background`
- `node scripts/mac/check-mac-formal-e2e-status.mjs --boardSummary`
- `node scripts/mac/check-mac-resume-status.mjs --checkBoard --json`
- `node scripts/mac/start-mac-host.mjs --status --json`
- Agent Link Board Supervisor `DONE: 正式端到端验收 Mac host`，actual 为 Windows runner 退出码 0
- `git diff --check`
- 行首冲突标记扫描
遗留问题：
- `inject` 真实输入注入未执行；需要用户在屏幕前明确确认后再切 `LAN_DUAL_INPUT_MODE=inject` 验收。
- 当前 Mac host 仍在后台运行；如收工或无人值守，使用 `node scripts/mac/start-mac-host.mjs --stop` 安全停止。
- Windows formal 结果摘要已由 Supervisor 和 Windows Codex 双方确认；后续若需要复审，可先看 `.dev-lab/formal-e2e-windows-20260616-084744.transcript.txt`。
下一步建议：
- 短期优先做真实输入注入安全验收设计/执行，或继续做 H.264/音频长时间稳定性和低延迟体验收口。
- 若继续正式测试，先在通讯板同步，再用 Mac/Windows resume status 做无密检查；不要重复要求用户输入密码，除非要重新认证或重启 host。
是否改了协议：否。
是否需要另一端配合：正式 E2E 已通过；后续 inject 或长稳测试需要 Windows 端和用户在场配合。

## 2026-06-16 Mac Codex

日期：2026-06-16 08:31
开发端：Mac Codex
本轮目标：给 Mac host 后台常驻启动补安全停止入口，让 `--background` 有对称的日常收尾命令。
完成内容：
- `scripts/mac/start-mac-host.mjs` 新增 `--stop`；它只读取本机 `/discovery`，确认目标是 macOS host 且存在 `runtime.processId` 后，才向该 PID 发送 `SIGTERM` 并等待 `/discovery` 离线。
- `--stop` 不读取密码、不弹密码框、不认证 WebSocket；离线时视为已经停止；非本机 host、非 macOS discovery、缺 runtime PID 或 PID 异常时拒绝停止，避免误杀未知服务。
- `--stop --json` 输出机器可读结果，包含 `ok`、`stopped`、`alreadyStopped`、`probe`、`targetPid`、`runtime` 和错误 code，方便后续桌面壳或联络板自动化消费。
- `scripts/mac/test-mac-host-start-helper.mjs` 增加离线 stop、非本机拒绝、非 Mac discovery 拒绝、后台临时 host 由 `--stop --json` 停止并确认离线的回归。
- Mac host README、CURRENT_STATUS、NEXT_ACTIONS 和任务板同步 `--stop` 的使用和安全边界。
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
- `node scripts/mac/test-mac-host-start-helper.mjs --timeoutMs 60000`
- `node scripts/mac/test-mac-script-help.mjs --script start-mac-host.mjs --script test-mac-host-start-helper.mjs --timeoutMs 10000`
- `node scripts/mac/start-mac-host.mjs --status --json`（当前默认 43770 离线，预期返回非 0 JSON）
- `node scripts/mac/start-mac-host.mjs --stop --json --host 192.0.2.55 --port 43770`（预期拒绝非本机 host）
- `git diff --check`
- 行首冲突标记扫描
遗留问题：
- 当前默认 `127.0.0.1:43770` 没有 Mac host 在线；本轮未启动正式 Mac host，也未触发密码弹窗。
- Windows formal E2E 仍需要用户在 Windows 本机隐藏输入 Mac host 正式密码后继续；`inject` 仍需另行明确确认。
下一步建议：
- 需要后台启动时继续用 `node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --background`；需要收尾时用 `node scripts/mac/start-mac-host.mjs --stop`。
- 若后续要把 Mac host 启停接进桌面壳或 Agent Link Board，优先消费 `--status --json` 与 `--stop --json`，不要手动按端口盲杀进程。
是否改了协议：否。
是否需要另一端配合：本轮代码改动不需要 Windows 端修改；正式 E2E 仍等待 Windows 端在用户授权后继续。

## 2026-06-16 Windows Codex

日期：2026-06-16 08:35
开发端：Windows Codex
本轮目标：白天恢复工作后检查正式 E2E 状态，并补强 Windows Mac alert watcher 的后台生命周期管理。
完成内容：
- 开工检查 Agent Link Board：当前无 active call；`git pull --rebase --autostash` 后本地与远端对齐。
- Windows 恢复总览显示 repo clean、head=`b00d02d`、board ok，但 Mac host 当前离线；已向通讯板发起无密 call，请 Mac 端启动 `192.168.31.122:43770` Mac host 后再继续 Windows 无密 preflight / 正式 E2E。
- 已启动 Windows 本机 Mac alert watcher，并确认正式 watcher 可被 `-Status` 找到。
- `scripts/windows/start-mac-alert-watcher.ps1` 新增 `-Status`、`-Stop`、`-Restart`，默认防重复启动；使用 `.dev-lab/mac-alert-watcher.pid` 记录 PID，同时通过 watcher 脚本路径和 `-Server` 命令行兜底查找长驻进程，避免 PowerShell 7 WindowsApps 启动别名导致 PID 文件不可靠。
- 启动器新增测试专用 `-PidFile`、`-OutLog`、`-ErrLog`，便于手动或后续自动化验证生命周期而不碰正式 watcher。
- `scripts/windows/test-mac-alert-watcher.mjs` 保持默认无弹窗提醒规则回归；生命周期启动/停止测试改为可选 `--includeLifecycle`，避免某些 Windows PowerShell 别名保留 stdio 句柄导致常规回归悬挂。
修改文件：
- `scripts/windows/start-mac-alert-watcher.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
- `docs/LAN_CODEX_LINK.md`
- `docs/TEST_COORDINATION.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-mac-alert-watcher.ps1 -Server http://192.168.31.68:17888 -Status`
- 手动独立 PID/log lifecycle：测试 watcher 启动、重复启动提示 already running、`-Status` 找到同一 PID、`-Stop` 成功停止。
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 20000`
遗留问题：
- Mac host 当前离线，正式 E2E 仍需 Mac 端先启动 host；不要在通讯板发送密码。
- `--includeLifecycle` 自动测试在当前 Windows/Codex 运行方式下可能因后台 PowerShell stdio 句柄悬挂，默认不纳入常规回归；生命周期已用独立 PID/log 手动验证。
下一步建议：
- Mac host 在线后，Windows 端先跑 `node scripts/windows/check-windows-resume-status.mjs --checkBoard --boardSummary --checkClientDiagnostics` 或正式 `check-mac-formal-e2e --discover --preflightOnly --checkClientDiagnostics --boardSummary`。
- 用户在 Windows 本机准备好正式密码后，再运行 `scripts/windows/check-mac-formal-e2e.ps1 -Discover -PromptPassword`。
是否改了协议：否。
是否需要另一端配合：需要 Mac 端启动/确认 Mac host 在线；Windows 已发 Agent Link Board call。

## 2026-06-15 Mac Codex

日期：2026-06-15 22:35
开发端：Mac Codex
本轮目标：给 Mac host 启动助手补显式后台常驻模式，减少正式联调时终端会话占用，同时保持密码和健康检查边界。
完成内容：
- `scripts/mac/start-mac-host.mjs` 新增 `--background` 和 `--logFile <path>`；显式后台模式会先按原流程准备密码、拒绝已占用端口、启动 Swift host、等待 `/discovery`，并在 runtime/display 校验通过后才 detach 退出启动助手。
- 后台日志默认写入 `.dev-lab/mac-host/lan-dual-mac-host-<port>.log`，也可用 `--logFile` 指定；默认前台启动行为保持不变。
- 后台模式如果 runtime/display 校验失败会停掉刚启动的 host 并返回失败；只有显式 `--skipRuntimeCheck` 才跳过该校验。
- runtime/display 子校验不再通过 `--password` 命令参数传递密码，改为继承启动环境里的 `LAN_DUAL_PASSWORD`，避免密码出现在 argv。
- `scripts/mac/test-mac-host-start-helper.mjs` 新增后台启动临时端口回归、后台校验失败不脱离静态守卫，以及 runtime/display 子校验不传 `--password` 的静态守卫。
- Mac host README、CURRENT_STATUS、NEXT_ACTIONS 和任务板同步 `--background` 使用方式；文档当前事实更新为：真实 Mac host `192.168.31.122:43770` 已在 `b28c42c` 运行，Windows 无密预检已通过，下一步等待用户在 Windows 本机隐藏输入正式密码。
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
- `node scripts/mac/start-mac-host.mjs --help`
- `node scripts/mac/start-mac-host.mjs --status --json`
- `node scripts/mac/test-mac-host-start-helper.mjs --timeoutMs 60000`
- `node scripts/mac/test-mac-script-help.mjs --script start-mac-host.mjs --script test-mac-host-start-helper.mjs --timeoutMs 10000`
- `git diff --check`
- 行首冲突标记扫描
遗留问题：
- 本轮没有执行 Windows 侧正式长测；formal E2E 仍等待用户在 Windows 本机隐藏输入 Mac host 正式密码。
- 真实 43770 runtime build 为 `b28c42c`，相对当前 repo `1598357` 只有 build metadata stale，`changedHostRuntimeFileCount=0`；若后续 Mac host runtime 源码再变化，正式长测前仍需重启 host。
下一步建议：
- Windows 端用户授权后继续跑 `check-mac-formal-e2e --discover --promptPassword` 完整验收；不要在联络板发送密码，`inject` 仍需另行明确确认。
- 后续需要长期启动 Mac host 时可用 `node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --background`，启动助手确认健康后会退出，host 日志留在 `.dev-lab/mac-host/`。
是否改了协议：否。
是否需要另一端配合：需要 Windows 端在用户授权后继续 formal E2E；本轮代码改动本身不需要 Windows 端修改。

## 2026-06-15 Windows Codex

日期：2026-06-15 23:00
开发端：Windows Codex
本轮目标：补强 Windows 本机 Mac 联络板提醒 watcher，支撑 Mac 窗口最小化时的授权/卡住透传提醒。
完成内容：
- `scripts/windows/watch-codex-link-mac-alerts.ps1` 恢复并扩展提醒规则：`NEED_USER_AUTH`、`USER_ACTION_REQUIRED`、权限/授权、502/Bad Gateway、`blocked` 状态和长时间无更新都会触发提醒。
- watcher 新增 `-Once`、`-NoPopup`、`-AlertExistingEvents`，可做无弹窗单次调试；默认仍把历史已有事件视为已看过，避免启动时重复弹旧消息。
- watcher 启动时设置 UTF-8 输出，并用 code point 组装中文关键词，兼容 PowerShell 7 和 Windows PowerShell 的脚本编码差异。
- `scripts/windows/start-mac-alert-watcher.ps1` 后台启动器优先使用 PowerShell 7 `pwsh`，找不到再回退 Windows PowerShell；同步透传 `-AlertExistingEvents` / `-NoPopup`。
- 新增 `scripts/windows/test-mac-alert-watcher.mjs`：用本机假 Agent Link Board 和 `-Once -NoPopup` 覆盖默认跳过历史事件、Mac 授权事件、中文权限提示、502、非 Mac 事件忽略、blocked 状态和 stale 状态。
修改文件：
- `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `scripts/windows/start-mac-alert-watcher.ps1`
- `scripts/windows/test-mac-alert-watcher.mjs`
- `docs/LAN_CODEX_LINK.md`
- `docs/TEST_COORDINATION.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-alert-watcher.mjs`
- PowerShell 7 AST parse `scripts/windows/watch-codex-link-mac-alerts.ps1`
- PowerShell 7 AST parse `scripts/windows/start-mac-alert-watcher.ps1`
- `node scripts/windows/test-mac-alert-watcher.mjs --timeoutMs 20000`
遗留问题：
- 这只是 Agent Link Board 层的提醒透传；未来产品内的“Mac 远控窗口最小化后通知浮窗”仍需要正式应用层事件/通知协议设计。
- 正式 Mac E2E 长测仍等待用户在 Windows 本机隐藏输入 Mac host 正式密码；本轮没有认证、没有发送密码、没有执行 `inject`。
下一步建议：
- 白天继续前可先运行 `scripts\windows\start-mac-alert-watcher.ps1 -Server http://192.168.31.68:17888`，让 Windows 本机接住 Mac 端授权/卡住提醒。
- 用户准备好正式密码后，继续 `scripts/windows/check-mac-formal-e2e.ps1 -Discover -PromptPassword` 或 Node 等价命令跑正式长测。
是否改了协议：否。
是否需要另一端配合：暂不需要；正式 E2E 仍需要用户在 Windows 本机输入密码，Mac host 当前 ready。

## 2026-06-15 Windows Codex

日期：2026-06-15 22:45
开发端：Windows Codex
本轮目标：响应 Mac formal E2E call，完成 Windows 无密预检，并让 formal runner 能安全向通讯板发送用户授权提示。
完成内容：
- 收到 Mac formal E2E call 后，Windows 侧对真实 `192.168.31.122:43770` 跑无密 `check-mac-formal-e2e --discover --discoverNoLocalSubnets --preflightOnly --checkClientDiagnostics --boardSummary`：ready，runtimeBuild=`b28c42c`，H.264/系统 PCM/文本剪贴板/文件剪贴板/input-log/权限/client diagnostics 全通过。
- `scripts/windows/check-mac-formal-e2e.mjs` 新增 `--sendUserAuthRequest` 和 `--server`：只在 `--preflightOnly` 且预检 ready 时向 Agent Link Board 发送无密 `NEED_USER_AUTH`；未 ready 时不会发送，避免误催用户输入正式密码。
- `scripts/windows/check-mac-formal-e2e.ps1` 新增 `-SendUserAuthRequest` / `-Server`，同步包装 Node 能力。
- 回归测试新增假 Agent Link Board：验证离线时不 POST、mock ready 时只向 `/api/message` POST 一条不含密码的 `NEED_USER_AUTH`。
- 已对真实 Mac host 执行一次 `--sendUserAuthRequest`，通讯板已收到无密授权提示；密码未打印/未上板，未执行 `inject`。
修改文件：
- `scripts/windows/check-mac-formal-e2e.mjs`
- `scripts/windows/check-mac-formal-e2e.ps1`
- `scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `scripts/windows/test-mac-formal-e2e-powershell.mjs`
- `docs/07-windows-dev-environment.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-mac-formal-e2e.mjs`
- `node --check scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `node --check scripts/windows/test-mac-formal-e2e-powershell.mjs`
- PowerShell AST parse `scripts/windows/check-mac-formal-e2e.ps1`
- `node scripts/windows/test-mac-formal-e2e-preflight.mjs --timeoutMs 90000`
- `node scripts/windows/test-mac-formal-e2e-powershell.mjs --timeoutMs 90000`
- 真实无密预检 + 发送授权提示：`node scripts/windows/check-mac-formal-e2e.mjs --discover --discoverNoLocalSubnets --host 192.168.31.122 --port 43770 --preflightOnly --checkClientDiagnostics --sendUserAuthRequest`
遗留问题：
- 正式 E2E 长测仍需要用户在 Windows 本机隐藏输入 Mac host 正式密码；当前 Codex 不会也不应在通讯板发送密码。
- `inject` 未执行，仍需用户另行明确确认。
- 本地仍有无关未提交改动 `scripts/windows/watch-codex-link-mac-alerts.ps1`，未纳入本轮。
下一步建议：
- 用户在 Windows 本机准备好后运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-mac-formal-e2e.ps1 -Discover -PromptPassword`，或 Node 等价 `node scripts/windows/check-mac-formal-e2e.mjs --discover --promptPassword`，开始正式 H.264/音频/剪贴板/input-log 长测。
- 正式长测通过后，再讨论是否进入真实 `inject` 输入验收。
是否改了协议：否。
是否需要另一端配合：需要用户在 Windows 本机输入正式密码后继续正式 E2E；Mac host 当前已 ready。

## 2026-06-15 Windows Codex

日期：2026-06-15 22:20
开发端：Windows Codex
本轮目标：把 WGC H.264 raw-bgra/NV12 源格式对照接入 Windows readiness，方便后续一键收口卡顿/帧率排查。
完成内容：
- `scripts/windows/check-windows-host-readiness.mjs` 新增显式 `--probeWgcH264Sources`，默认关闭，`--profile deep` 也不会自动启用，避免普通体检变重。
- 开启该探针时，readiness 会启动本机临时 Windows host/WGC helper，跑一组 30Hz/10Mbps raw-bgra vs NV12 H.264 短对照，并把结果纳入普通输出、JSON 和无密 `--boardSummary`；首次失败会换临时端口自动重试一次，降低 WGC/helper 瞬时波动造成的误报。
- `scripts/windows/test-windows-host-readiness-board-summary.mjs` 更新帮助/JSON 形状断言，确认新探针默认关闭且帮助文本可见。
- Windows host README、当前状态、下一步和任务板已同步，说明该探针是 WGC 性能排查的轻量入口；更长窗口或多 profile 仍用 `compare-windows-wgc-h264-sources.mjs`。
修改文件：
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node --check scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `node scripts/windows/check-windows-host-readiness.mjs --help`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-host-readiness.mjs --script test-windows-host-readiness-board-summary.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 90000`
- `node scripts/windows/check-windows-host-readiness.mjs --probeWgcH264Sources --json --timeoutMs 60000`
- `node scripts/windows/check-windows-host-readiness.mjs --probeWgcH264Sources --boardSummary --timeoutMs 60000`
遗留问题：
- `--probeWgcH264Sources` 仍是诊断入口，不是最终优化；真实高帧率路线仍要继续做 helper 原生硬编、GPU/SIMD 转换或 Mac client 真连资源/观感对照。
- 本地仍有无关未提交改动 `scripts/windows/watch-codex-link-mac-alerts.ps1`，未纳入本轮。
下一步建议：
- Windows 侧后续做 WGC/H.264 性能收口时，先用 `check-windows-host-readiness --probeWgcH264Sources --boardSummary` 做短摘要；需要更详细数据再跑 `compare-windows-wgc-h264-sources --profile 60:20000:balanced --durationMs 1800 --boardSummary`。
- Mac formal E2E 仍等待 Mac host 重启到当前 build 后，再由 Windows 侧重新无密预检和用户授权。
是否改了协议：否。
是否需要另一端配合：不需要；正式 E2E 仍等 Mac host 重启。

## 2026-06-15 Mac Codex

日期：2026-06-15 21:55
开发端：Mac Codex
本轮目标：给 Mac formal E2E 增加安全清理过期通讯板 call 的入口，并清掉当前误导性的旧 formal call。
完成内容：
- 基于 Windows 最新 `9a52ca9` 继续开发，保留 Windows 端 WGC H.264 source comparison 交接内容。
- `scripts/mac/check-mac-formal-e2e-status.mjs` 新增 `--clearStaleCall`：仅当 checklist 不 ready 且当前 Agent Link Board call 精确匹配 Mac Codex -> Windows Codex 的“正式端到端验收 Mac host”时，才调用 `clear-call` 清理；如果当前 call 属于其他端/其他目标，或 formal checklist 已 ready，则只报告原因并保持不动。
- `--sendCall` 和 `--clearStaleCall` 互斥，避免同一轮既发送又清理；JSON 输出会包含 `boardCallBeforeClear` 和 `clearedStaleCall`，方便自动化/交接判断。
- `scripts/mac/test-mac-formal-e2e-status.mjs` 的假通讯板新增 `/api/clear-call` 模拟，回归覆盖：过期 Mac formal call 可清理、非 Mac formal call 不清理、ready 状态下匹配 formal call 不清理。
- 已对真实 Agent Link Board 执行 `node scripts/mac/check-mac-formal-e2e-status.mjs --clearStaleCall --json --server http://192.168.31.68:17888`，旧的 formal E2E call 被清空；随后 `watch --once` 显示 `[call] none`。
- 文档同步 `--clearStaleCall` 使用边界和当前事实：真实 Mac host `192.168.31.122:43770` 仍在线但 runtime build `d807536` 偏旧，`d807536..9a52ca9` 仍有 `apps/mac-host/Sources/MacHost/MacHostService.swift` runtime 源码变化，formal E2E 前仍需先重启 Mac host。
修改文件：
- `scripts/mac/check-mac-formal-e2e-status.mjs`
- `scripts/mac/test-mac-formal-e2e-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-formal-e2e-status.mjs`
- `node --check scripts/mac/test-mac-formal-e2e-status.mjs`
- `node scripts/mac/test-mac-formal-e2e-status.mjs --timeoutMs 60000`
- `node scripts/mac/check-mac-formal-e2e-status.mjs --clearStaleCall --json --server http://192.168.31.68:17888`
- `node scripts/codex-link-client.mjs --server http://192.168.31.68:17888 watch --once`，确认 `[call] none`
遗留问题：
- 未重启真实 Mac host；当前 formal E2E 仍因旧 runtime build 和 Mac host runtime 源码变化而不 ready。
下一步建议：
- 用户在场时运行 `node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword` 重启 Mac host 到当前 build；重启后再跑 `node scripts/mac/check-mac-formal-e2e-status.mjs --boardSummary`，ready 后再用 `--sendCall` 或通讯板通知 Windows 做无密预检/正式验收。
是否改了协议：否。
是否需要另一端配合：现在不需要；重启 Mac host 后需要 Windows 端重新发现/预检。

## 2026-06-15 Mac Codex

日期：2026-06-15 21:15
开发端：Mac Codex
本轮目标：加固 Mac formal E2E 呼叫前的旧 runtime 保护，避免把已变更的旧 Mac host 误叫去正式长测。
完成内容：
- `scripts/mac/check-mac-formal-e2e-status.mjs --sendCall` 未 ready 时不再只报 blocker 数字，会输出具体 blocker、下一步建议和变动的 Mac host runtime 文件；`--json --sendCall` 失败时保留完整 report，便于自动化/通讯板读取原因。
- `scripts/mac/test-mac-formal-e2e-status.mjs` 新增旧 runtime 源码变化回归：假 Mac host 返回最近一次 runtime 变更前的 build，确认 `--sendCall` 拒绝、JSON 带 `Runtime Build` blocker、提示重启、列出 `apps/mac-host/Sources/MacHost/MacHostService.swift`，且不会读取/覆盖通讯板 call。
- 当前真实只读检查显示 Mac host `192.168.31.122:43770` 在线、runtime build `d807536`、权限/H.264/系统 PCM/剪贴板/inputMode=log 均可见，但 repo `06d1908` 相对该 runtime 有 1 个 Mac host runtime 源码变化；formal E2E 前应先重启 Mac host。
- 同步 CURRENT_STATUS / NEXT_ACTIONS / 04-task-board，把旧的 “formal E2E ready” 当前事实改为“需先重启 Mac host”。
修改文件：
- `scripts/mac/check-mac-formal-e2e-status.mjs`
- `scripts/mac/test-mac-formal-e2e-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-formal-e2e-status.mjs`
- `node --check scripts/mac/test-mac-formal-e2e-status.mjs`
- `node scripts/mac/test-mac-formal-e2e-status.mjs --timeoutMs 60000`
- `node scripts/mac/check-mac-formal-e2e-status.mjs --boardSummary`
遗留问题：
- 未重启真实 Mac host；当前 `--boardSummary` 仍会正确失败并提示先重启。重启需要用户在场输入正式密码或使用安全启动流程。
下一步建议：
- 用户在场时，先运行 `node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword` 重启到当前 build，再跑 `node scripts/mac/check-mac-formal-e2e-status.mjs --boardSummary`；ready 后再协调 Windows 做无密预检和正式密码验收。
是否改了协议：否。
是否需要另一端配合：重启后需要 Windows 端重新发现/预检；现在先不要催用户输入正式密码。

## 2026-06-15 Windows Codex

日期：2026-06-15 21:20
开发端：Windows Codex
本轮目标：新增 Windows WGC H.264 raw-bgra vs NV12 源格式对照入口，辅助下一步性能优化取舍。
完成内容：
- 新增 `scripts/windows/compare-windows-wgc-h264-sources.mjs`，包装现有 `benchmark-windows-wgc-settings.mjs`，默认同条件顺序跑 raw-bgra 和 NV12 两条 WGC H.264 源格式。
- 输出普通对照摘要、`--json` 机器可读结果和 `--boardSummary` 无密联络板摘要；结果包含 FPS、fresh FPS、unique helper FPS、重复帧比例、helper frame/convert avg、CPU/工作集 delta 和 winner。
- 默认只启动本机临时 Windows host / WGC helper / FFmpeg，不连接 Mac、不认证正式密码、不发送输入、不执行 `inject`。
- 本机短测 `1280x720`、30Hz、10M、repeat-full、`h264_nvenc`、1.2 秒通过：raw-bgra 19 帧/15.58 FPS、helper frame avg 72.086ms、convert avg 70.696ms；NV12 28 帧/23.03 FPS、helper frame avg 68.805ms、convert avg 67.741ms；本次短测 winner=NV12。
- Windows host README、当前状态、下一步和任务板已同步，下一步继续优先做 helper 原生硬编或 GPU/SIMD 转换，避免继续在 CPU 桥上深调。
修改文件：
- `scripts/windows/compare-windows-wgc-h264-sources.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/compare-windows-wgc-h264-sources.mjs`
- `node scripts/windows/compare-windows-wgc-h264-sources.mjs --help`
- `node scripts/windows/test-windows-script-help.mjs --script compare-windows-wgc-h264-sources.mjs --timeoutMs 10000`
- `node scripts/windows/compare-windows-wgc-h264-sources.mjs --profile 30:10000:balanced --durationMs 1200 --timeoutMs 60000 --minFrames 1 --minFps 0 --maxGapMs 10000 --resourceSample false --skipBuild --boardSummary`
- `node scripts/windows/compare-windows-wgc-h264-sources.mjs --profile 30:10000:balanced --durationMs 1200 --timeoutMs 60000 --minFrames 1 --minFps 0 --maxGapMs 10000 --resourceSample false --skipBuild --json`
遗留问题：
- 该脚本是性能对照入口，不是最终优化；真实 60Hz 日常观感仍需要 helper 原生硬编、动态画面源帧节奏和 Mac client 真连验收。
- 本地仍有无关未提交改动 `scripts/windows/watch-codex-link-mac-alerts.ps1`，未纳入本轮。
下一步建议：
- Windows 侧下一轮优先基于该脚本跑 `--profile 60:20000:balanced --durationMs 1800 --boardSummary`，再推进 helper 原生 D3D11/NVENC 编码或 GPU/SIMD 转换。
- Mac 真连验收仍等用户在 Windows 本机隐藏输入正式密码；不要在联络板发送密码，`inject` 仍需另行明确确认。
是否改了协议：否。
是否需要另一端配合：不需要；后续 Mac client 真连观感验收需要 Mac 端配合。

## 2026-06-15 Windows Codex

日期：2026-06-15 20:56
开发端：Windows Codex
本轮目标：新增 Windows 审查机双端剪贴板完整性聚合回归，方便 Supervisor 一条命令复审。
完成内容：
- 新增 `scripts/windows/test-clipboard-integrity-suite.mjs`，顺序串联三条已有专项检查：Windows clipboard bridge 模块级完整性、Windows host WebSocket 服务级坏包回归、Mac host Swift 源码文件剪贴板接收完整性检查。
- 支持 `--json` 输出机器可读结果，支持 `--boardSummary` 输出一行无密 Agent Link Board 摘要：会标明 Windows module / Windows service / Mac source 三项状态。
- 聚合脚本不要求正式密码、不发送输入、不执行 `inject`；Windows 服务级子检查只启动临时本机 in-process host 并使用测试密码。
- CURRENT_STATUS / NEXT_ACTIONS 已把该脚本记录为双端剪贴板整改复审的优先入口。
修改文件：
- `scripts/windows/test-clipboard-integrity-suite.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-clipboard-integrity-suite.mjs`
- `node scripts/windows/test-clipboard-integrity-suite.mjs --timeoutMs 45000`
- `node scripts/windows/test-clipboard-integrity-suite.mjs --boardSummary --timeoutMs 45000`
- `node scripts/windows/test-clipboard-integrity-suite.mjs --json --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs --script test-clipboard-integrity-suite.mjs --timeoutMs 10000`
遗留问题：
- 当前 Codex 普通沙盒会拦截该聚合脚本启动子测试进程，表现为 `spawn EPERM`；这不是测试逻辑失败，Windows 审查机复跑时需允许本机子进程。
- 本地仍有无关未提交改动 `scripts/windows/watch-codex-link-mac-alerts.ps1`，未纳入本轮。
下一步建议：
- Supervisor 可直接运行 `node scripts/windows/test-clipboard-integrity-suite.mjs --boardSummary --timeoutMs 45000` 复审 Windows/Mac 双端剪贴板整改；通过后恢复 WGC 性能优化或正式 Mac E2E。
是否改了协议：否。
是否需要另一端配合：不需要；等待 Supervisor/Mac readiness 探针后续同步。

## 2026-06-15 Mac Codex

日期：2026-06-15 21:00
开发端：Mac Codex
本轮目标：把 Mac host 文件剪贴板接收完整性回归接入 Mac readiness，方便收工和部署前自动覆盖。
完成内容：
- `scripts/mac/check-mac-host-readiness.mjs` 新增显式 `--probeClipboardSecurity`，会串联 `scripts/mac/test-mac-host-clipboard-file-integrity.mjs`。
- `--profile deep` 现在会在部署检查、媒体/input-log 探针和启动助手自测之外，自动包含 Mac host 文件剪贴板安全回归。
- 新增 `scripts/mac/test-mac-readiness-clipboard-security.mjs`，覆盖帮助文本、源码 wiring、`--probeClipboardSecurity --json` 聚合结果、`--profile deep --json` 自动启用，以及不泄露密码形态。
- 同步 Mac host README、CURRENT_STATUS、NEXT_ACTIONS、04-task-board 和 ACTIVE_LOCKS。
修改文件：
- `scripts/mac/check-mac-host-readiness.mjs`
- `scripts/mac/test-mac-readiness-clipboard-security.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-host-readiness.mjs`
- `node --check scripts/mac/test-mac-readiness-clipboard-security.mjs`
- `node scripts/mac/test-mac-readiness-clipboard-security.mjs --timeoutMs 45000`
- `node scripts/mac/test-mac-script-help.mjs --script check-mac-host-readiness.mjs --script test-mac-readiness-clipboard-security.mjs --timeoutMs 10000`
遗留问题：
- 本轮只接入本地安全回归；正式 Windows -> Mac 文件剪贴板仍需后续由 Windows 侧用 `--clipboardFile` / `-ClipboardFile` 在真机 E2E 中验证。
下一步建议：
- Mac host 或文件剪贴板相关改动后，可运行 `node scripts/mac/check-mac-host-readiness.mjs --probeClipboardSecurity` 做低风险安全回归；部署深检继续用 `--profile deep`。
是否改了协议：否。
是否需要另一端配合：不需要立即配合；Windows/Supervisor 可在复审时跑新增 Mac readiness 测试或真机文件剪贴板探针。

## 2026-06-15 Mac Codex

日期：2026-06-15 20:30
开发端：Mac Codex
本轮目标：对称加固 Mac host 文件剪贴板接收完整性，避免坏分块误完成。
完成内容：
- `apps/mac-host/Sources/MacHost/MacHostService.swift` 加固 `clipboard_file_offer`：校验文件数上限、总大小上限、清单文件数、文件索引、逐文件 size 与 `totalBytes` 一致；合法 0 字节文件会在 offer 阶段创建空文件。
- `clipboard_file_chunk` 必须引用已有 transfer 和已声明 fileIndex；拒绝负数/无效 offset、超大分块、非空文件空块、重复/重叠/不连续 offset、越界写入和累计总字节超声明值；异常分块会清理该 transfer，要求对端重新开始干净传输。
- 完成阶段要求 URL 数量、声明文件数、总 receivedBytes、逐文件 receivedBytes 和实际磁盘文件大小全部精确匹配，不再用 `>=` 让重复/重叠分块蒙混通过；同一批重名文件会先在内存里去重，避免非空文件覆盖。
- 新增 `scripts/mac/test-mac-host-clipboard-file-integrity.mjs`，用 Swift 源码守卫检查和小型区间模型覆盖无自动创建 file state、chunk 上限、offset 连续、逐文件完整性、磁盘大小检查、空文件和同批重名保护。
- 同步当前状态、下一步、任务板和锁文件；未改共享协议、未发送密码、未执行 `inject`。
修改文件：
- `apps/mac-host/Sources/MacHost/MacHostService.swift`
- `scripts/mac/test-mac-host-clipboard-file-integrity.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `swift build --package-path apps/mac-host`
- `node --check scripts/mac/test-mac-host-clipboard-file-integrity.mjs`
- `node scripts/mac/test-mac-host-clipboard-file-integrity.mjs`
- `node scripts/mac/test-mac-script-help.mjs --script test-mac-host-clipboard-file-integrity.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" .`
遗留问题：
- 本轮是源码构建和专项回归，未用真实 Windows 控制端发送文件到 Mac 系统剪贴板；正式 E2E 时仍需 Windows 侧用 `--clipboardFile` / `-ClipboardFile` 真机验证。
下一步建议：
- Supervisor/Windows 可复跑 `node scripts/mac/test-mac-host-clipboard-file-integrity.mjs` 做审查；正式 Mac E2E 恢复后，Windows 侧继续跑无密预检，再由用户本机隐藏输入密码执行含文件剪贴板的正式验收。
是否改了协议：否，仍使用现有 `clipboard_file_*` 消息；只是 Mac 接收端更严格拒绝坏输入。
是否需要另一端配合：需要 Windows 侧在正式 E2E 或专项探针里复测 Windows -> Mac 文件剪贴板真机路径。

## 2026-06-15 Windows Codex

日期：2026-06-15 20:43
开发端：Windows Codex
本轮目标：复跑并修复 Mac 密码弹窗测试在 Windows 审查机上的 fake shim 路径。
完成内容：
- Windows 审查机复跑 `node scripts/mac/test-mac-password-prompt.mjs --timeoutMs 10000` 初始失败，增强测试输出后确认普通 Codex 沙盒会因 fake shim 再启动 `node.exe` 报 `EPERM`。
- `scripts/mac/password-prompt.mjs` 在 Windows 平台发现 PATH 中存在 fake `osascript.mjs` / `swift.mjs` 时，优先直接用当前 Node 进程启动该 `.mjs` 执行体，避开 `cmd.exe` / `.cmd %*` 对多行 AppleScript 参数的重新解释；未发现 fake `.mjs` 时仍回到原有 Windows shell 查找路径，macOS 真机逻辑不变。
- `scripts/mac/test-mac-password-prompt.mjs` 的失败断言现在会打印 `status`、`signal` 和 `error`，以后 Windows 审查机再失败时能区分 fake shim、参数转义和权限问题。
- 授权子进程后，Windows 审查机复跑 `test-mac-password-prompt` 通过；`test-mac-host-start-helper` 也通过，非 macOS 真实 Swift host 启动段按预期 `[SKIP]`。
修改文件：
- `scripts/mac/password-prompt.mjs`
- `scripts/mac/test-mac-password-prompt.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/password-prompt.mjs`
- `node --check scripts/mac/test-mac-password-prompt.mjs`
- `node --check scripts/mac/test-mac-host-clipboard-file-integrity.mjs`
- `node scripts/mac/test-mac-host-clipboard-file-integrity.mjs`
- `node scripts/mac/test-mac-password-prompt.mjs --timeoutMs 10000`
- `node scripts/mac/test-mac-host-start-helper.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-script-help.mjs --script password-prompt.mjs --script test-mac-password-prompt.mjs --script test-mac-host-start-helper.mjs --timeoutMs 8000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 8000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/mac/password-prompt.mjs scripts/mac/test-mac-password-prompt.mjs docs/CURRENT_STATUS.md docs/NEXT_ACTIONS.md docs/HANDOFF_LOG.md docs/ACTIVE_LOCKS.md`
遗留问题：
- 当前 Codex 沙盒普通权限会拦截 fake shim 再启动 `node.exe`，表现为 `spawnSync ... EPERM`；这不是 Mac helper 逻辑失败，复跑时需要允许子进程。
- 本地仍有无关未提交改动 `scripts/windows/watch-codex-link-mac-alerts.ps1`，未纳入本轮。
- Mac host 文件剪贴板对称加固已拉取到 `ca8d648` 并在 Windows 审查机复跑 `test-mac-host-clipboard-file-integrity` 通过；等待 Supervisor 最终复审。
下一步建议：
- Supervisor 可复审 Windows/Mac 双端剪贴板整改和 Mac 测试兼容；通过后再恢复 WGC 性能优化或正式 Mac E2E。
是否改了协议：否。
是否需要另一端配合：需要 Mac 端同步对称剪贴板加固结果；Supervisor 可复审。

## 2026-06-15 Windows Codex

日期：2026-06-15 20:34
开发端：Windows Codex
本轮目标：把 Windows host 文件剪贴板服务级坏包回归接入一键 readiness，方便收工和部署前自动覆盖。
完成内容：
- `scripts/windows/check-windows-host-readiness.mjs` 新增显式 `--probeClipboardSecurity`；该探针会串联 `test-windows-host-clipboard-security.mjs`，走真实 WebSocket host 文件剪贴板坏包回归。
- `--profile deep` 现在在 deploy 检查、Windows host PowerShell 本机自检之外，自动包含文件剪贴板服务级安全回归。
- `scripts/windows/test-windows-host-readiness-board-summary.mjs` 增加帮助文本和 JSON 聚合形状回归，确认 readiness 输出 `probeClipboardSecurity=true` 且结果包含 `Windows host clipboard security`。
- Windows host README、CURRENT_STATUS、NEXT_ACTIONS、04-task-board 已同步新入口和回归顺序。
修改文件：
- `scripts/windows/check-windows-host-readiness.mjs`
- `scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-host-readiness.mjs`
- `node --check scripts/windows/test-windows-host-readiness-board-summary.mjs`
- `node scripts/windows/test-windows-host-clipboard-security.mjs --timeoutMs 15000`
- `node scripts/windows/check-windows-host-readiness.mjs --probeClipboardSecurity --json --timeoutMs 12000`
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 120000 --readinessTimeoutMs 12000`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-host-readiness.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-host-readiness-board-summary.mjs --timeoutMs 10000`
- `node scripts/windows/test-windows-script-help.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" scripts/windows/check-windows-host-readiness.mjs scripts/windows/test-windows-host-readiness-board-summary.mjs apps/windows-host/README.md docs/CURRENT_STATUS.md docs/NEXT_ACTIONS.md docs/04-task-board.md docs/HANDOFF_LOG.md docs/ACTIVE_LOCKS.md`
遗留问题：
- 本地仍有无关未提交改动 `scripts/windows/watch-codex-link-mac-alerts.ps1`，未纳入本轮。
- WGC NV12 快速转换 WIP 仍在 stash，等待剪贴板整改复审后再恢复。
下一步建议：
- Mac 对称剪贴板加固推送后，Windows 侧拉取并复跑 Mac 相关测试；随后可恢复 WGC 性能优化或正式 Mac E2E。
是否改了协议：否。
是否需要另一端配合：暂不需要；等待 Mac/Supervisor 后续同步。

## 2026-06-15 Windows Codex

日期：2026-06-15 20:35
开发端：Windows Codex
本轮目标：在 Windows 文件剪贴板完整性整改后，补真实 WebSocket 服务级坏包回归。
完成内容：
- 新增 `scripts/windows/test-windows-host-clipboard-security.mjs`：本进程启动临时 Windows host，走真实 `/discovery`、WebSocket `hello/auth` 和 `clipboard_file_*` 消息，不写系统剪贴板、不发送输入。
- 服务级覆盖无 offer 分片、超过总大小上限、超过文件数上限、超大 chunk、重复 chunk、重叠 chunk、不完整完成、bytes 声明不一致和错误 `fileIndex`。
- 合法场景保留：重复/重叠被拒绝后，后续合法 tail chunk 仍可完成，证明拒绝坏包不会破坏同一传输中的有效分片。
- Windows host README、CURRENT_STATUS、NEXT_ACTIONS、04-task-board 已同步新脚本用途和后续回归顺序。
修改文件：
- `scripts/windows/test-windows-host-clipboard-security.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-windows-host-clipboard-security.mjs`
- `node scripts/windows/test-windows-host-clipboard-security.mjs --timeoutMs 15000`
- `node scripts/windows/test-windows-clipboard-bridge.mjs`
- `npm --prefix apps/windows-host run check`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-host.ps1`
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-host-clipboard-security.mjs --timeoutMs 10000`
遗留问题：
- Supervisor 对 `924eb36` 的复审尚未在通讯板出现；本轮只是继续加固 Windows 回归证据。
- 本地仍有无关未提交改动 `scripts/windows/watch-codex-link-mac-alerts.ps1`，未纳入本轮。
- WGC NV12 快速转换 WIP 仍保留在本地 stash，等待复审/协调后再恢复。
下一步建议：
- 等 Mac 端对称文件剪贴板加固推送后，Windows 可拉取并复跑相关跨平台测试；随后再恢复 WGC 性能优化或正式 Mac E2E。
是否改了协议：否。
是否需要另一端配合：暂不需要；等待 Supervisor/Mac 端后续复审和对称修复。

## 2026-06-15 Windows Codex

日期：2026-06-15 20:20
开发端：Windows Codex
本轮目标：处理 Supervisor 审查发现的 Windows host 文件剪贴板接收完整性风险。
完成内容：
- `apps/windows-host/src/windows-clipboard-bridge.mjs` 加固文件接收状态机：`clipboard_file_chunk` 必须先有已接受的 `clipboard_file_offer`，不再自动创建传输。
- offer 阶段校验 `transferId`、文件数量、文件索引连续性、清单 size 与 `totalBytes` 一致、文件数上限和 512MB 总量上限；chunk 阶段校验 `fileIndex`、`chunkIndex`、`offset`、声明 bytes、协商分块大小、不越界且不重叠。
- 完成阶段按每个文件的真实覆盖区间和 expected size 判断完整性；重复/重叠 chunk 不再能通过累计 receivedBytes 让损坏文件被当作完整。
- 保留 0 字节文件兼容：合法空文件会创建空文件并可完成；非空文件的 0 字节 chunk 会被拒绝。
- 新增 `scripts/windows/test-windows-clipboard-bridge.mjs` 专项回归，覆盖无 offer、超大 chunk、重复/重叠 chunk、不完整文件、超过总大小/文件数、空文件和乱序合法分片。
- 暂停并临时保存了未完成的 WGC NV12 快速转换 WIP，未混入本次提交。
修改文件：
- `apps/windows-host/src/windows-clipboard-bridge.mjs`
- `scripts/windows/test-windows-clipboard-bridge.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `npm --prefix apps/windows-host run check`
- `node --check scripts/windows/test-windows-clipboard-bridge.mjs`
- `node scripts/windows/test-windows-clipboard-bridge.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-clipboard-bridge.mjs --timeoutMs 10000`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-host.ps1`
- `node scripts/windows/test-windows-script-help.mjs --timeoutMs 10000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" apps/windows-host/src/windows-clipboard-bridge.mjs scripts/windows/test-windows-clipboard-bridge.mjs apps/windows-host/README.md docs`
遗留问题：
- 本轮没有继续 WGC NV12 快速转换优化；WGC WIP 已存入本地 stash，后续需在 Supervisor 复审通过后再恢复。
- 本地仍有一个无关未提交改动 `scripts/windows/watch-codex-link-mac-alerts.ps1`，未纳入本轮。
下一步建议：
- 请 Supervisor/Windows 审查机复跑 `node scripts/windows/test-windows-clipboard-bridge.mjs` 和 `scripts/windows/test-windows-host.ps1` 复审；通过后再恢复 WGC 性能优化。
是否改了协议：否，仍使用原 `clipboard_file_*` 消息；只是更严格校验和拒绝坏输入。
是否需要另一端配合：暂不需要；正式 Mac client 真连文件复制体验可在复审后再协调。

## 2026-06-15 Mac Codex

日期：2026-06-15 20:05
开发端：Mac Codex
本轮目标：加固 Mac formal E2E `--sendCall`，避免通讯板已有测试呼叫时被静默覆盖。
完成内容：
- `scripts/mac/check-mac-formal-e2e-status.mjs` 的 `--sendCall` 发送前会重新读取 Agent Link Board 当前 `currentCall`。
- 如果通讯板已有 active call，默认拒绝发送并失败，错误信息会标出已有 call 的来源/目标，提示先清理或协调。
- 新增显式 `--forceCall`，只有人工确认要替换旧呼叫后才允许覆盖；JSON 会记录 `boardCallBeforeSend` 方便审查。
- `scripts/mac/test-mac-formal-e2e-status.mjs` 的假通讯板新增 currentCall 模拟，覆盖默认拒绝覆盖和 `--forceCall` 显式覆盖。
- `docs/CURRENT_STATUS.md` 和 `docs/NEXT_ACTIONS.md` 同步 currentCall 保护和 `--forceCall` 使用边界。
修改文件：
- `scripts/mac/check-mac-formal-e2e-status.mjs`
- `scripts/mac/test-mac-formal-e2e-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-formal-e2e-status.mjs`
- `node --check scripts/mac/test-mac-formal-e2e-status.mjs`
- `node scripts/mac/test-mac-formal-e2e-status.mjs --timeoutMs 60000`
- 真实 `node scripts/mac/check-mac-formal-e2e-status.mjs --sendCall --allowDirty --json`，因当前通讯板已有 Mac formal call 按预期拒绝覆盖且未发送新 call。
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" .`
遗留问题：
- 本轮仍未向真实 Agent Link Board 发送 formal E2E call；当前板上旧 call 需要正式测试前由双方决定清理、复用或显式覆盖。
下一步建议：
- Windows 剪贴板整改/Supervisor 复审完成后，先确认通讯板 currentCall 状态，再决定是否清理旧 call 或用 `--forceCall` 发新 formal E2E call。
是否改了协议：否。
是否需要另一端配合：暂不需要；正式 E2E 时需要 Windows 端配合和用户本机隐藏输入密码。

## 2026-06-15 Mac Codex

日期：2026-06-15 19:55
开发端：Mac Codex
本轮目标：给 Mac formal E2E checklist 增加显式通讯板呼叫发送能力，避免手工拼 call 和未 ready 误呼叫。
完成内容：
- `scripts/mac/check-mac-formal-e2e-status.mjs` 新增 `--sendCall`：只有 `readyToCall=true` 时才调用 Agent Link Board `call`，未 ready 会拒绝发送并失败。
- JSON 报告新增 `callPayload`，发送成功后新增 `sentCall`，包含实际无密呼叫内容，方便审查。
- 呼叫内容固定提醒 Windows 端做 discovery/auth/H.264 5-10 分钟/系统音频/剪贴板/input-log，并明确密码不要发联络板、不要执行 `inject`，除非用户另行明确确认。
- `scripts/mac/test-mac-formal-e2e-status.mjs` 新增本地假 Mac host 和假 Agent Link Board：覆盖离线 `--sendCall` 拒绝、ready 时只发送一条无密 call、payload 不泄露 secret-like 文本。
- `docs/CURRENT_STATUS.md` 和 `docs/NEXT_ACTIONS.md` 同步 `--sendCall` 的安全边界。
修改文件：
- `scripts/mac/check-mac-formal-e2e-status.mjs`
- `scripts/mac/test-mac-formal-e2e-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-formal-e2e-status.mjs`
- `node --check scripts/mac/test-mac-formal-e2e-status.mjs`
- `node scripts/mac/test-mac-formal-e2e-status.mjs --timeoutMs 60000`
- `node scripts/mac/check-mac-formal-e2e-status.mjs --boardSummary`，预期因本轮未提交改动显示 dirty blocker。
- `node scripts/mac/check-mac-formal-e2e-status.mjs --boardSummary --allowDirty`，只读预览显示真实 Mac host 仍 ready。
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" .`
遗留问题：
- 本轮未向真实 Agent Link Board 发 formal E2E call，只用假通讯板验证发送路径；真实 call 应在准备正式测试且确认 Windows 端可配合时再显式运行 `--sendCall`。
下一步建议：
- Windows 剪贴板完整性整改和 Supervisor 复审完成后，Mac 侧先跑 `check-mac-formal-e2e-status --boardSummary`，如仍 ready，再用 `--sendCall` 呼叫 Windows 正式 E2E。
是否改了协议：否。
是否需要另一端配合：暂不需要；正式 E2E 时需要 Windows 端配合和用户本机隐藏输入密码。

## 2026-06-15 Mac Codex

日期：2026-06-15 19:25
开发端：Mac Codex
本轮目标：同步 Mac 测试兼容修复和当前无密 formal readiness 状态到开工文档。
完成内容：
- `docs/CURRENT_STATUS.md` 记录 `test-mac-password-prompt` 已支持 Windows 审查机 fake `.cmd` shim/PATH/PATHEXT，以及 `test-mac-host-start-helper` 非 macOS 真实 Swift 启动段明确 `[SKIP]`。
- `docs/CURRENT_STATUS.md` 和 `docs/NEXT_ACTIONS.md` 记录当前无密 Mac formal E2E 状态：repo `f858eda` 干净，Mac host `192.168.31.122:43770` 在线，runtime build `d807536`，权限全开，H.264/系统 PCM/剪贴板开启，`inputMode=log`，仅 build 元数据落后且 Mac host runtime 源码变化数为 0。
- `docs/NEXT_ACTIONS.md` 补充 Supervisor/Windows 审查机复跑 Mac 测试时的预期：密码弹窗测试不打开真实系统弹窗，启动助手测试在非 macOS 上跳过真实 Swift host 启动段。
修改文件：
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node scripts/mac/check-mac-resume-status.mjs --checkBoard --boardSummary`
- `node scripts/mac/check-mac-formal-e2e-status.mjs --boardSummary`
- `node scripts/mac/start-mac-host.mjs --status --json`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" .`
遗留问题：
- 正式认证仍需用户在本机隐藏输入密码；`inject` 仍需另行明确确认。
下一步建议：
- 等 Supervisor/Windows 审查机复跑 Mac 测试；Windows 侧剪贴板完整性整改完成后，再协调正式 E2E 或 Mac client 真连观感对照。
是否改了协议：否。
是否需要另一端配合：需要 Supervisor/Windows 审查机复审；正式 E2E 需要用户授权输入密码。

## 2026-06-15 Mac Codex

日期：2026-06-15 19:15
开发端：Mac Codex
本轮目标：修复 Mac 测试在 Windows 审查机上的兼容问题。
完成内容：
- `scripts/mac/test-mac-password-prompt.mjs` 的 fake `osascript`/`swift` 现在同时生成 Unix shim、`.mjs` 执行体和 Windows `.cmd` 包装器。
- fake 命令 PATH 注入改用 Node 平台分隔符，并在 Windows 上补 `PATHEXT=.CMD`，避免 Windows `spawn("osascript")` / `spawn("swift")` 找不到无扩展名 shim。
- `scripts/mac/password-prompt.mjs` 只在 Windows 平台为 `osascript`/`swift` 调用启用 shell 查找，方便 Windows 审查机命中 `.cmd` fake shim；macOS 真机仍保持直接调用真实系统工具。
- `scripts/mac/test-mac-host-start-helper.mjs` 保留 dry-run/status/密码安全检查；只有真实启动 Swift Mac host 的 online/status 和 launch 段在非 macOS 上明确输出 `[SKIP]`，避免 Windows 审查机误跑 `swift run`。
修改文件：
- `scripts/mac/password-prompt.mjs`
- `scripts/mac/test-mac-password-prompt.mjs`
- `scripts/mac/test-mac-host-start-helper.mjs`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/password-prompt.mjs`
- `node --check scripts/mac/test-mac-password-prompt.mjs`
- `node --check scripts/mac/test-mac-host-start-helper.mjs`
- `node scripts/mac/test-mac-password-prompt.mjs --timeoutMs 10000`
- `node scripts/mac/test-mac-host-start-helper.mjs --timeoutMs 30000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" .`
遗留问题：
- 本机是 macOS，无法直接执行 Windows 审查机真实 `cmd.exe` 路径；已通过生成 `.cmd` 包装器、平台 PATH/PATHEXT 和非 macOS skip 逻辑降低跨平台风险，需 Supervisor/Windows 审查机复跑确认。
下一步建议：
- Supervisor 在 Windows 审查机复跑 `node scripts/mac/test-mac-password-prompt.mjs` 和 `node scripts/mac/test-mac-host-start-helper.mjs`。
是否改了协议：否。
是否需要另一端配合：需要 Supervisor/Windows 审查机复审。

## 2026-06-15 Mac Codex

日期：2026-06-15 18:54
开发端：Mac Codex
本轮目标：修复 Mac client formal smoke 在 discovery 失败时输出空 host 认证命令的问题。
完成内容：
- 复现 `run-mac-client-formal-smoke --discover --preflightOnly --boardSummary` 在未发现 Windows host 时输出 `--host  --port ...` 浏览器认证命令。
- `scripts/mac/run-mac-client-formal-smoke.mjs` 现在只有存在有效 Windows host 时才生成 `commands.browserSmoke`；缺 host 时 boardSummary 改为提示先启动/发现 Windows host，再重跑无密安全预检。
- `commands.discoverPreflight` 新增安全重跑命令，发现失败时不会给出会认证的浏览器 smoke 命令。
- `scripts/mac/test-mac-client-formal-smoke.mjs` 新增断言：discovery 失败不打印 `--host  --port`，JSON 不包含无 host 的 `browserSmoke`，但包含安全 `discoverPreflight`。
修改文件：
- `scripts/mac/run-mac-client-formal-smoke.mjs`
- `scripts/mac/test-mac-client-formal-smoke.mjs`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/run-mac-client-formal-smoke.mjs`
- `node --check scripts/mac/test-mac-client-formal-smoke.mjs`
- `node scripts/mac/run-mac-client-formal-smoke.mjs --discover --discoverNoLocalSubnets --preflightOnly --boardSummary --timeoutMs 3000`
- `node scripts/mac/test-mac-client-formal-smoke.mjs --timeoutMs 30000`
- 待跑：`git diff --check`
- 待跑：`rg -n "^(<<<<<<<|=======|>>>>>>>)" .`
遗留问题：
- 未做真实 Windows host 认证，也未弹密码框；这是预期，本轮只修无密失败摘要。
下一步建议：
- Windows host 在线后再跑 `node scripts/mac/run-mac-client-formal-smoke.mjs --discover --preflightOnly --boardSummary` 做只读预检；ready 后再由用户用 `--promptPassword` 正式认证。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-15 Mac Codex

日期：2026-06-15 18:48
开发端：Mac Codex
本轮目标：按用户反馈“没有看到显示输入密码的地方”，继续加固 Mac 侧 `--promptPassword` 的真实可见性。
完成内容：
- `scripts/mac/password-prompt.mjs` 调整弹窗优先级：每次需要人工密码时仍先播放两声提示音并输出不含密码的 `[ACTION]` 提示，但默认优先打开 macOS 系统隐藏密码弹窗；系统弹窗打不开时，才尝试原生 AppKit 前台高层级隐藏密码框作为备用。
- 用户取消系统弹窗后会直接停止，不会再弹第二个备用窗口，避免“我明明点了取消又冒出一个”的困惑。
- 保留 `LAN_DUAL_PREFER_NATIVE_PASSWORD_DIALOG=1` 作为本地调试开关，可显式优先测试原生 AppKit 高层级窗口；默认仍禁止终端隐藏输入 fallback，避免用户找不到输入位置。
- `scripts/mac/test-mac-password-prompt.mjs` 同步覆盖默认系统弹窗成功、显式原生弹窗成功、取消不 fallback、系统失败后原生 fallback、全部失败和密码不泄露。
- Mac host/client README、当前状态、下一步和任务板同步新行为：默认系统密码弹窗优先，原生高层级窗口备用，密码不进 argv/日志/Agent Link Board。
修改文件：
- `scripts/mac/password-prompt.mjs`
- `scripts/mac/test-mac-password-prompt.mjs`
- `apps/mac-host/README.md`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/password-prompt.mjs`
- `node --check scripts/mac/test-mac-password-prompt.mjs`
- `node --check scripts/mac/start-mac-host.mjs`
- `node --check scripts/mac/run-mac-client-formal-smoke.mjs`
- `node scripts/mac/test-mac-password-prompt.mjs --timeoutMs 10000`
- `node scripts/mac/test-mac-readiness-prompt-password.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-host-start-helper.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-client-formal-smoke.mjs --timeoutMs 30000`
- `git diff --check`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" .`
遗留问题：
- 本轮不主动弹真实正式密码框，避免在非正式验收时打扰用户。下一次真实 `--promptPassword` 应先响两声，再出现 macOS 系统隐藏密码弹窗；如果系统策略仍遮挡弹窗，再考虑短生命周期 `.app` 包方案。
下一步建议：
- 需要正式密码时优先用现有 `--promptPassword` 入口，不要把密码写到命令或联络板。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-15 Windows Codex

日期：2026-06-15 19:10
开发端：Windows Codex
本轮目标：给 WGC helper 增加内部阶段耗时诊断，定位 60Hz/NV12/H.264 低源帧瓶颈。
完成内容：
- `apps/windows-wgc-helper` 真实 capture frame header 新增 `helperTimingMs`，记录 wait frame、TryGetNextFrame、surface/interface、staging create、CopyResource、Map、BGRA/NV12/JPEG 转换/编码、Unmap、CloseFrame 和 frame total before emit。
- `apps/windows-host/src/windows-screen-capture.mjs` 安全归一化并透传 `helperTimingMs`：JPEG helper、raw BGRA/NV12 binary helper、WGC H.264 bridge 输出的 `video_frame` 都能带该诊断字段。
- `scripts/windows/observe-windows-host-video.mjs` 会汇总 helper timing 每个阶段的 samples/avg/min/max，并在普通输出打印关键 `frame/wait/output/map/convert/copy avg/max`。
- `scripts/windows/benchmark-windows-wgc-settings.mjs` 在 compact profile/JSON 中保留 `helperTimingMs`，普通 profile 输出后额外打印 helper timing 摘要。
- 真实 720p/60Hz/20M/NV12/`h264_nvenc`/repeat-full 短测显示 helper 整帧平均约 127.5ms，`convertEncodeMs` 平均约 126.3ms，`mapMs` 约 0.6ms，`copyResourceMs` 约 0.004ms；瓶颈集中在 helper CPU BGRA→NV12 转换/缩放。
修改文件：
- `apps/windows-wgc-helper/src/main.rs`
- `apps/windows-host/src/windows-screen-capture.mjs`
- `scripts/windows/observe-windows-host-video.mjs`
- `scripts/windows/benchmark-windows-wgc-settings.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `cargo fmt`
- `cargo check`
- `node --check apps/windows-host/src/windows-screen-capture.mjs`
- `node --check scripts/windows/observe-windows-host-video.mjs`
- `node --check scripts/windows/benchmark-windows-wgc-settings.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script observe-windows-host-video.mjs --script benchmark-windows-wgc-settings.mjs`
- `node scripts/windows/test-windows-wgc-helper.mjs --skipRealCapture`
- `node scripts/windows/test-windows-wgc-mode.mjs`
- `node scripts/windows/benchmark-windows-wgc-settings.mjs --skipBuild --profile 60:20000:balanced --durationMs 1500 --timeoutMs 50000 --minFrames 5 --minFps 0 --maxGapMs 10000 --maxFrameAgeMs 1000 --resourceSample false --resourceSampleTree false --repeatLastFrame --h264Bridge --h264Source nv12 --h264Encoder h264_nvenc --json`
- `node scripts/windows/benchmark-windows-wgc-settings.mjs --skipBuild --profile 60:20000:balanced --durationMs 900 --timeoutMs 50000 --minFrames 3 --minFps 0 --maxGapMs 10000 --maxFrameAgeMs 1000 --resourceSample false --resourceSampleTree false --repeatLastFrame --h264Bridge --h264Source nv12 --h264Encoder h264_nvenc`
遗留问题：
- 这轮只定位瓶颈，没有优化转换管线；NV12/H.264 仍主要卡在 helper 端 CPU BGRA→NV12 转换/缩放。
下一步建议：
- 优先做 CPU 转换优化或替代：对照 raw BGRA 交给 FFmpeg/GPU 转换、SIMD/多线程 BGRA→NV12、D3D/GPU shader 转 NV12，或直接 helper 原生 D3D11/NVENC 硬编。
是否改了协议：否。`helperTimingMs` 是 Windows helper/host/observer 内部可选诊断字段，不要求 Mac 端实现。
是否需要另一端配合：暂不需要；Mac client 真连观感/资源对照时再呼叫 Mac 端。

## 2026-06-15 Windows Codex

日期：2026-06-15 18:36
开发端：Windows Codex
本轮目标：给 WGC benchmark 增加动态画面刺激源，用真实桌面变化对照静态桌面下的源帧 FPS。
完成内容：
- `scripts/windows/benchmark-windows-wgc-settings.mjs` 新增 `--motionStimulus`，默认短暂打开 WinForms/GDI 动画窗口；也可用 `--motionStimulusBackend browser` 打开 Edge/Chrome 动画窗口。
- 新增 `--motionStimulusWidth`、`--motionStimulusHeight`、`--motionStimulusWarmupMs`、`--motionStimulusBrowser` 参数；JSON 输出增加 `motionStimulus` 摘要。
- 动画窗口会在 benchmark 前启动、等待 warmup，测试结束自动关闭；启动失败时会清理临时目录。
- 真实对照：WinForms 动态窗口 60Hz/20M/NV12/`h264_nvenc`/repeat-full 短测实收 43 帧、约 23.52 FPS，真实新帧约 4.92 FPS、唯一 helper 源帧约 4.92 FPS、重复帧 79.1%、内容年龄最大 180ms；browser 动态窗口短测约 25.40 FPS、唯一源帧约 4.97 FPS。与静态桌面差距不大，说明当前瓶颈更像 helper 读回/事件节奏，而不是单纯桌面静态。
修改文件：
- `scripts/windows/benchmark-windows-wgc-settings.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/benchmark-windows-wgc-settings.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script benchmark-windows-wgc-settings.mjs`
- `node scripts/windows/benchmark-windows-wgc-settings.mjs --skipBuild --profile 60:20000:balanced --durationMs 1800 --timeoutMs 50000 --minFrames 5 --minFps 0 --maxGapMs 10000 --maxFrameAgeMs 1000 --resourceSample false --resourceSampleTree false --repeatLastFrame --h264Bridge --h264Source nv12 --h264Encoder h264_nvenc --motionStimulus --motionStimulusBackend winforms --motionStimulusWarmupMs 1200 --json`
- 早一轮也跑过 `--motionStimulus --motionStimulusBackend browser` 的 Edge 动态窗口短测。
遗留问题：
- 动态窗口没有显著提高 WGC helper 源帧 FPS；后续不能继续把低 FPS 归因于静态桌面，应转向 helper 内部采集节奏、D3D readback/转换开销或原生硬编路线。
下一步建议：
- 优先做 helper 内部阶段耗时诊断：FrameArrived 间隔、TryGetNextFrame、CopyResource/Map、BGRA->NV12、stdout 写出耗时。
- 再考虑 helper 原生 H.264/NVENC，减少 Node->FFmpeg 往返和重复帧兜底。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-15 Windows Codex

日期：2026-06-15 18:25
开发端：Windows Codex
本轮目标：增强 Windows WGC/NV12 H.264 帧节奏诊断，避免把请求 60Hz、重复帧和真实新源帧混在一起判断。
完成内容：
- `scripts/windows/observe-windows-host-video.mjs` 新增 `freshFps`、`uniqueHelperFps`、`repeatedFrameRatio`、`repeatedFramePercent`、`repeatSignalFramePercent` 等 JSON 指标，并新增 `--minFreshFps`、`--minUniqueHelperFps`、`--maxRepeatedFrameRatio`、`--maxContentAgeMs` 阈值。
- `scripts/windows/benchmark-windows-wgc-settings.mjs` 透传上述阈值，profile 摘要现在会直接显示实收 FPS、真实新帧 FPS、唯一 helper 源帧 FPS、重复帧比例和内容年龄。
- `scripts/windows/test-windows-wgc-mode.mjs` 回归断言新指标存在，且 fresh/repeated 数量与总帧数一致。
- 真实短测显示：60Hz/20M/NV12/`h264_nvenc`/repeat-full 会话协商 60Hz，但 1.5 秒实收 35 帧、约 22.94 FPS，真实新帧约 3.93 FPS、唯一 helper 源帧约 4.59 FPS、重复帧 82.9%、内容年龄最大 152ms。后续判断卡顿要同时看实收 FPS 和源帧 FPS。
修改文件：
- `scripts/windows/observe-windows-host-video.mjs`
- `scripts/windows/benchmark-windows-wgc-settings.mjs`
- `scripts/windows/test-windows-wgc-mode.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/observe-windows-host-video.mjs`
- `node --check scripts/windows/benchmark-windows-wgc-settings.mjs`
- `node --check scripts/windows/test-windows-wgc-mode.mjs`
- `node scripts/windows/test-windows-wgc-mode.mjs --mockHelper --h264Bridge --h264Source nv12 --durationMs 1500 --minFrames 5 --timeoutMs 30000`
- `node scripts/windows/test-windows-wgc-mode.mjs --durationMs 800 --minFrames 1 --timeoutMs 20000`
- `node scripts/windows/observe-windows-host-video.mjs --screenMode mock --requireRealVideo false --durationMs 700 --minFrames 2 --minFreshFps 1 --maxRepeatedFrameRatio 0 --resourceSample false --json`
- `node scripts/windows/benchmark-windows-wgc-settings.mjs --skipBuild --profile 60:20000:balanced --durationMs 1500 --timeoutMs 45000 --minFrames 5 --minFps 0 --maxGapMs 10000 --maxFrameAgeMs 1000 --resourceSample false --resourceSampleTree false --repeatLastFrame --h264Bridge --h264Source nv12 --h264Encoder h264_nvenc --json`
- `node scripts/windows/test-windows-script-help.mjs --script observe-windows-host-video.mjs --script benchmark-windows-wgc-settings.mjs --script test-windows-wgc-mode.mjs`
遗留问题：
- 本轮只增强诊断和阈值，没有改变采集/编码管线。静态桌面下 WGC 源帧 FPS 仍明显低于请求 60Hz，真正优化仍要继续做 helper 原生硬编、动态画面源帧节奏和 Mac client 真连观感对照。
下一步建议：
- 后续 WGC/NV12/H.264 性能测试不要只看 `fps`，同时看 `freshFps`、`uniqueHelperFps`、`repeatedFramePercent` 和 `maxContentAgeMs`。
- 若要把 60Hz 做成真实观感，优先推进 helper 原生硬编或 GPU 侧 NV12/编码，配合动态画面测试。
是否改了协议：否。
是否需要另一端配合：暂不需要；Mac 端真连观感对照时再配合。

## 2026-06-15 Windows Codex

日期：2026-06-15 18:18
开发端：Windows Codex
本轮目标：让 Windows 恢复开工总览可显式把安全授权提示发送到 Agent Link Board，同时避免未 ready 时误发。
完成内容：
- `scripts/windows/check-windows-resume-status.mjs` 新增 `--sendUserAuthRequest`，PowerShell 包装新增 `-SendUserAuthRequest`。
- 只有 formal preflight ready 时才调用 `scripts/codex-link-client.mjs send` 发出无密 `NEED_USER_AUTH` 文本；preflight 不 ready 时不会发送，并把 `sendUserAuthRequest` 作为失败检查。
- JSON 输出新增 `sentUserAuthRequest`，记录是否请求发送、是否成功和失败原因。
- Node 和 PowerShell 回归都用本机假 Agent Link Board 覆盖 ready 时发送一条消息、不泄露密码；Node 回归额外覆盖离线时不发送。
- 真实只读 `-UserAuthRequest` 打印路径仍通过，未对真实联络板执行 `-SendUserAuthRequest`，避免重复刷授权请求。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- PowerShell AST parse `scripts/windows/check-windows-resume-status.ps1`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 30000`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-resume-status.ps1 -CheckBoard -CheckClientDiagnostics -UserAuthRequest`
遗留问题：
- 真实正式 E2E 仍需用户在 Windows 本机输入 Mac host 正式密码；`inject` 仍需另行明确确认。
下一步建议：
- 需要请求用户输入密码时，先用 `-UserAuthRequest` 预览文本；确认要代发到联络板时再用 `-SendUserAuthRequest`。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-15 Windows Codex

日期：2026-06-15 18:12
开发端：Windows Codex
本轮目标：让 Windows 恢复开工总览能直接输出正式验收前的安全授权提示，减少手工拼联络板消息。
完成内容：
- `scripts/windows/check-windows-resume-status.mjs` 新增 `--userAuthRequest`，JSON 报告也新增 `userAuthRequest` 字段。
- `scripts/windows/check-windows-resume-status.ps1` 新增 `-UserAuthRequest`。
- 当 formal preflight ready 时，输出 `NEED_USER_AUTH` 文本，提示用户在 Windows 本机隐藏输入 Mac host 正式密码，并给出固定目标的 PowerShell 正式验收命令：`check-mac-formal-e2e.ps1 -Discover -DiscoverNoLocalSubnets -HostName <host> -Port <port> -PromptPassword`。
- 当 preflight 不可用或不 ready 时，仍输出“暂时不要输入正式密码”的安全提示；不认证、不请求密码、不发送输入、不执行 `inject`。
- Node 和 PowerShell 回归都覆盖 `userAuthRequest` 不泄露密码。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- PowerShell AST parse `scripts/windows/check-windows-resume-status.ps1`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 30000`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-resume-status.ps1 -CheckBoard -CheckClientDiagnostics -UserAuthRequest`
遗留问题：
- 仍未执行正式 E2E，因为需要用户在 Windows 本机输入 Mac host 正式密码；`inject` 仍需另行明确确认。
下一步建议：
- 用户准备好密码时，先运行 `check-windows-resume-status.ps1 -CheckBoard -CheckClientDiagnostics -UserAuthRequest` 生成联络板授权提示，再按提示运行正式 PowerShell 验收。
是否改了协议：否。
是否需要另一端配合：暂不需要；正式验收需要用户输入密码。

## 2026-06-15 Windows Codex

日期：2026-06-15 18:00
开发端：Windows Codex
本轮目标：给 Windows 恢复开工总览补 PowerShell 包装入口，方便 Windows 日常用一条 `.ps1` 命令做只读状态同步。
完成内容：
- 新增 `scripts/windows/check-windows-resume-status.ps1`，薄包装 `check-windows-resume-status.mjs`，支持 `-CheckBoard`、`-CheckClientDiagnostics`、`-BoardSummary`、`-Json`、`-RequireMacReady`、`-RequireClean`、`-DiscoverNoLocalSubnets`、`-NoDiscover` 等参数。
- 新增 `scripts/windows/test-windows-resume-status-powershell.mjs`，用本机 mock Mac 覆盖 PowerShell 帮助、mock discovery JSON、单行 board summary、离线默认非失败和 `-RequireMacReady` 失败路径。
- 真实只读 PowerShell 路径 `-CheckBoard -CheckClientDiagnostics -BoardSummary` 已通过：自动选中 `192.168.31.122:43770`，Mac ready，runtime build `d807536`，`inputMode=log`，Windows 控制端诊断 `passed`；没有请求密码、没有认证、没有发送输入、没有执行 `inject`。
- 当前状态、下一步行动和任务板已同步 PowerShell 用法。
修改文件：
- `scripts/windows/check-windows-resume-status.ps1`
- `scripts/windows/test-windows-resume-status-powershell.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-windows-resume-status-powershell.mjs`
- PowerShell AST parse `scripts/windows/check-windows-resume-status.ps1`
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-resume-status-powershell.mjs`
- `node scripts/windows/test-windows-resume-status-powershell.mjs --timeoutMs 30000`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-resume-status.ps1 -CheckBoard -CheckClientDiagnostics -BoardSummary`
遗留问题：
- 这仍是无密码恢复/预检工具，不替代正式 E2E。正式验收仍需用户在 Windows 本机隐藏输入 Mac host 正式密码；`inject` 仍需用户另行明确确认。
下一步建议：
- 后续 Windows 开工优先运行 `check-windows-resume-status.ps1 -CheckBoard -BoardSummary`；正式验收前加 `-CheckClientDiagnostics`，ready 后再走 `check-mac-formal-e2e.ps1 -Discover -PromptPassword`。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-15 Windows Codex

日期：2026-06-15 17:50
开发端：Windows Codex
本轮目标：新增 Windows 侧恢复开工总览，方便每天开工先安全汇总 repo、通讯板、Mac formal preflight 和下一步命令。
完成内容：
- 新增 `scripts/windows/check-windows-resume-status.mjs`：默认自动发现最佳 Mac host，汇总 git 状态、可选 Agent Link Board 快照、Mac formal E2E 无密预检、下一步 PowerShell/Node 安全命令和一行 `--boardSummary`。
- 默认只读、不认证 WebSocket、不要求或打印密码、不发送输入、不执行 `inject`；Mac host 离线默认是 warning，`--requireMacReady` 才会失败，`--requireClean` 可让脏工作区失败。
- 新增 `scripts/windows/test-windows-resume-status.mjs`，用本机 mock Mac 覆盖 help、在线 JSON、通讯板摘要、离线默认非失败和 `--requireMacReady` 严格失败路径。
- 当前真实只读 `--checkBoard --boardSummary` 可自动发现 `192.168.31.122:43770`，显示 Mac ready、runtime build `d807536`、`inputMode=log`；没有请求密码、没有认证、没有 inject。
- 当前状态、下一步行动和任务板已同步每天恢复 Windows 侧工作时优先运行该脚本。
修改文件：
- `scripts/windows/check-windows-resume-status.mjs`
- `scripts/windows/test-windows-resume-status.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-resume-status.mjs`
- `node --check scripts/windows/test-windows-resume-status.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-resume-status.mjs --script test-windows-resume-status.mjs`
- `node scripts/windows/test-windows-resume-status.mjs --timeoutMs 30000`
- `node scripts/windows/check-windows-resume-status.mjs --checkBoard --boardSummary`
- `node scripts/windows/check-windows-resume-status.mjs --noDiscover --host 127.0.0.1 --port 9 --json`
- `node scripts/windows/test-windows-script-help.mjs`
- `git diff --check`
- 行首冲突标记扫描
遗留问题：
- 这只是恢复开工/预检总览，不替代正式 E2E。正式 Windows 控制 Mac 验收仍需用户在 Windows 本机隐藏输入正式密码；`inject` 仍需用户另行明确确认。
下一步建议：
- 白天继续前先运行 `node scripts/windows/check-windows-resume-status.mjs --checkBoard --boardSummary`，把摘要同步到 Agent Link Board；若 ready，再按 `check-mac-formal-e2e.ps1 -Discover -PromptPassword` 进入正式验收。
是否改了协议：否。
是否需要另一端配合：暂不需要；Mac 端只需知道 Windows 侧已有对等恢复总览入口。

## 2026-06-15 Mac Codex

日期：2026-06-15 18:05
开发端：Mac Codex
本轮目标：按用户反馈“没有看到显示输入密码的地方”，继续加固 Mac 侧所有 `--promptPassword` 人工密码入口，确保需要输入密码时先响铃、再显示清楚的前台密码窗口。
完成内容：
- `scripts/mac/password-prompt.mjs` 改为先播放两声提示音，并输出一行不含密码的 `[ACTION] Password required...` 提示，再打开原生 AppKit 隐藏密码框。
- 原生密码框改为 warning 样式、高窗口层级、跨 Space、unhide、deminiaturize、多次前置并聚焦输入框；默认仍不回退终端隐藏输入，避免用户看不到输入位置。
- 真实可见性测试发现 `NSAlert` 窗口调用 `makeMain()` 会在当前 macOS/Xcode 组合下崩溃，已移除该调用并在测试里防回归；修复后真实测试窗口可正常显示/返回，且不打印输入内容。
- AppleScript fallback 也补了 caution 图标；原生弹窗打不开时才使用 fallback，用户取消仍直接停止，不会连续弹第二个窗口。
- `scripts/mac/test-mac-password-prompt.mjs` 覆盖两声提示音、不含密码提示、高层级前台窗口、禁止 `makeMain()` 回归、fallback caution 图标和秘密不泄露。
- Mac host/client README、当前状态、下一步和任务板同步新行为：两声提示音、不含密码提示、前台高层级隐藏密码框、密码不进 argv/日志/联络板。
修改文件：
- `scripts/mac/password-prompt.mjs`
- `scripts/mac/test-mac-password-prompt.mjs`
- `apps/mac-host/README.md`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/password-prompt.mjs`
- `node --check scripts/mac/test-mac-password-prompt.mjs`
- `node scripts/mac/test-mac-password-prompt.mjs --timeoutMs 10000`
- 抽取内嵌 Swift 脚本后运行 `swiftc -parse /tmp/lan-dual-password-prompt.swift`
- 真实可见性测试：只弹测试密码框，不认证服务、不发送密码；修复前复现 `makeMain()` 崩溃，修复后窗口可正常返回且不打印输入内容。
- `node scripts/mac/test-mac-host-start-helper.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-readiness-prompt-password.mjs --timeoutMs 10000`
- `node scripts/mac/test-mac-formal-local-smoke.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-client-formal-smoke.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-script-help.mjs --script password-prompt.mjs --script start-mac-host.mjs --script check-mac-host-readiness.mjs --script check-mac-formal-local-smoke.mjs --script run-mac-client-formal-smoke.mjs --timeoutMs 10000`
遗留问题：
- 本轮未认证真实 host、未启动正式长测、未执行 `inject`；正式密码仍只能由用户在本机弹窗输入，不能发联络板。
下一步建议：
- 下次需要人工密码时直接运行对应 `--promptPassword` 入口；应先听到两声提示音，再看到前台隐藏密码框和不含密码的 action 提示。
- 若仍遇到系统层遮挡，再考虑短生命周期 `.app` 包或绑定当前前台应用的系统 dialog；当前原生 Swift 弹窗已通过真实可见性冒烟。
是否改了协议：否。
是否需要另一端配合：暂不需要；Windows 端只需知道 Mac 侧密码弹窗体验已加固，密码仍不要发联络板，`inject` 仍需用户另行明确确认。

## 2026-06-15 Mac Codex

日期：2026-06-15 17:33
开发端：Mac Codex
本轮目标：让 Mac 控制 Windows 的 formal browser smoke 也能自动发现 Windows host，减少正式联调前手工复制 IP/端口。
完成内容：
- `scripts/mac/run-mac-client-formal-smoke.mjs` 新增 `--discover`，会先只读调用 `scripts/mac/discover-windows-hosts.mjs --json --requireFound` 自动选中最佳 Windows host，再进入原 formal checklist 或正式浏览器 smoke。
- 新增 `--discoverHost`、`--discoverSubnet`、`--discoverNoLocalSubnets`、`--discoverTimeoutMs` 和 `--discoverScanTimeoutMs`，已知 Windows IP 时可只探明确目标，避免扫整段局域网。
- 发现失败会先输出失败报告并退出，不会弹 `--promptPassword` 密码框；发现结果会写入 JSON 的 `discovery` 字段和 board summary。
- `scripts/mac/discover-windows-hosts.mjs` 新增 `--noLocalSubnets` 透传到底层 LAN scanner。
- `scripts/mac/test-mac-client-formal-smoke.mjs` 覆盖 discover 自动选中 mock Windows host、发现失败不触发密码提示、preflight/dryRun 不泄露密码和 demo/空密码拒绝。
- Mac client README、当前状态、下一步和任务板同步新推荐命令：`run-mac-client-formal-smoke --discover --preflightOnly --boardSummary` 和 `--discover --promptPassword`。
修改文件：
- `scripts/mac/run-mac-client-formal-smoke.mjs`
- `scripts/mac/test-mac-client-formal-smoke.mjs`
- `scripts/mac/discover-windows-hosts.mjs`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/discover-windows-hosts.mjs`
- `node --check scripts/mac/run-mac-client-formal-smoke.mjs`
- `node --check scripts/mac/test-mac-client-formal-smoke.mjs`
- `node scripts/mac/test-mac-client-formal-smoke.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-script-help.mjs --script discover-windows-hosts.mjs --script run-mac-client-formal-smoke.mjs --script test-mac-client-formal-smoke.mjs --timeoutMs 8000`
- `git diff --check`
- 行首冲突标记扫描
遗留问题：
- 本轮没有认证真实 Windows host、没有输入正式密码、没有执行 `inject`；真实 smoke 仍需 Windows host 在线并由用户输入正式密码。
下一步建议：
- Windows host 启动后，Mac 侧先跑 `node scripts/mac/run-mac-client-formal-smoke.mjs --discover --preflightOnly --boardSummary`；ready 后跑 `node scripts/mac/run-mac-client-formal-smoke.mjs --discover --promptPassword`。已知 Windows IP 时加 `--discoverNoLocalSubnets --discoverHost <Windows IP>`。
是否改了协议：否。
是否需要另一端配合：需要 Windows 端启动正式 Windows host；密码不要发联络板，`inject` 仍需用户另行明确确认。

## 2026-06-15 Mac Codex

日期：2026-06-15 17:12
开发端：Mac Codex
本轮目标：按用户现场反馈“没有看到显示输入密码的地方”，继续加固 Mac 侧真实密码输入弹窗可见性。
完成内容：
- `scripts/mac/password-prompt.mjs` 的原生 AppKit 密码框从 floating 提升为 modal panel，并在弹出前后请求系统注意、跨 Space 显示、设置第一响应者、外部通过 System Events 多次拉前台。
- `--promptPassword` 仍保持先响铃再弹窗；显式要求弹窗时不静默复用旧环境密码，默认也不回退终端隐藏输入，避免用户看不到输入位置。
- `scripts/mac/test-mac-password-prompt.mjs` 的假 `swift`/`osascript` 回归同步覆盖 critical attention、modal panel、跨 Space、二次 refocus 和外部前台拉起。
- Mac host/client README、当前状态和下一步说明已同步“前台模态、多次拉前台、密码不进 argv/日志/联络板”的行为。
修改文件：
- `scripts/mac/password-prompt.mjs`
- `scripts/mac/test-mac-password-prompt.mjs`
- `apps/mac-host/README.md`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/password-prompt.mjs`
- `node --check scripts/mac/test-mac-password-prompt.mjs`
- `node scripts/mac/test-mac-password-prompt.mjs --timeoutMs 8000`
- `node scripts/mac/test-mac-client-formal-smoke.mjs --timeoutMs 20000`
- `node scripts/mac/test-mac-script-help.mjs --script password-prompt.mjs --script start-mac-host.mjs --script check-mac-host-readiness.mjs --script check-mac-formal-local-smoke.mjs --script run-mac-client-formal-smoke.mjs --timeoutMs 8000`
- `git diff --check`
- 行首冲突标记扫描
遗留问题：
- 本轮不会弹真实密码框、不会认证真实 host、不会执行 `inject`；下次真实 `--promptPassword` 应先响铃并弹出更强前台的隐藏密码框。
下一步建议：
- 如果用户确认要重新启动或正式验收，优先使用 `node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword` 或 `node scripts/mac/run-mac-client-formal-smoke.mjs --host <Windows IP> --port 43770 --promptPassword`，观察是否能看到前台密码框；若仍被系统层遮挡，再考虑短生命周期 `.app` 包或直接绑定前台应用的系统 dialog。
是否改了协议：否。
是否需要另一端配合：暂不需要；Windows 端只需知道 Mac 侧密码弹窗体验已继续加固，密码仍不要发联络板。

## 2026-06-15 Windows Codex

日期：2026-06-15 18:55
开发端：Windows Codex
本轮目标：给 Windows 正式 Mac E2E 聚合脚本增加 PowerShell 包装入口，让用户后续更容易做无密码预检和正式隐藏密码验收。
完成内容：
- 新增 `scripts/windows/check-mac-formal-e2e.ps1`，薄包装 `node scripts/windows/check-mac-formal-e2e.mjs`。
- PowerShell 入口支持 `-Discover`、`-DiscoverNoLocalSubnets`、`-PreflightOnly`、`-CheckClientDiagnostics`、`-BoardSummary`、`-UserAuthRequest`、`-PromptPassword`、`-FastProfile`、各项时长/阈值和 `-Skip*` 参数。
- 常用流程变成：先 `check-mac-formal-e2e.ps1 -Discover -PreflightOnly -CheckClientDiagnostics -BoardSummary` 无密码预检；用户准备好正式密码后再 `check-mac-formal-e2e.ps1 -Discover -PromptPassword`。
- 新增 `scripts/windows/test-mac-formal-e2e-powershell.mjs`，用本机 mock Mac 覆盖 PowerShell 帮助、自动发现 JSON 预检、离线发现不弹密码和 mock 快速正式路径。
- Windows 环境说明、当前状态、下一步和任务板同步 PowerShell 正式入口。
修改文件：
- `scripts/windows/check-mac-formal-e2e.ps1`
- `scripts/windows/test-mac-formal-e2e-powershell.mjs`
- `docs/07-windows-dev-environment.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-formal-e2e-powershell.mjs`
- PowerShell AST parse `scripts/windows/check-mac-formal-e2e.ps1`
- `node scripts/windows/test-windows-script-help.mjs --script test-mac-formal-e2e-powershell.mjs`
- `node scripts/windows/test-mac-formal-e2e-powershell.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-script-help.mjs`
- `git diff --check`
- 行首冲突标记扫描
遗留问题：
- 真实 Mac 的正式长测仍需要用户在 Windows 本机隐藏输入正式密码；本轮不认证真实 Mac、不发送输入、不执行 `inject`。
下一步建议：
- 用户准备好正式密码后，优先 PowerShell 入口：先 `-Discover -PreflightOnly -CheckClientDiagnostics -BoardSummary`，ready 后再 `-Discover -PromptPassword` 跑正式 E2E。
是否改了协议：否。
是否需要另一端配合：暂不需要；真实正式密码验收需要用户在 Windows 本机输入密码，`inject` 仍需另行明确确认。

## 2026-06-15 Windows Codex

日期：2026-06-15 18:20
开发端：Windows Codex
本轮目标：让 PowerShell Mac host 验收入口也能自动发现 Mac host，减少正式探针前手工复制 IP/端口。
完成内容：
- `scripts/windows/test-mac-host.ps1` 新增 `-Discover`、`-DiscoverNoLocalSubnets` 和 `-DiscoverTimeoutMs`，并在 `-Discover` 未显式传 `-HostName` 时允许自动扫描局域网。
- PowerShell wrapper 发现成功后才继续原有密码、认证、session、H.264、音频、剪贴板和 input-log 探针；发现失败会先退出，不弹密码框。
- 新增 `scripts/windows/test-mac-host-powershell-discover.mjs`，用本机 mock Mac 覆盖 PowerShell `-Discover` 到 WebSocket/auth/session/首帧路径，并覆盖离线 discovery 不触发密码提示。
- Windows 环境说明、当前状态、下一步和任务板同步新命令。
修改文件：
- `scripts/windows/test-mac-host.ps1`
- `scripts/windows/test-mac-host-powershell-discover.mjs`
- `docs/07-windows-dev-environment.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-host-powershell-discover.mjs`
- PowerShell AST parse `scripts/windows/test-mac-host.ps1`
- `node scripts/windows/test-windows-script-help.mjs --script test-mac-host-powershell-discover.mjs`
- `node scripts/windows/test-mac-host-powershell-discover.mjs --timeoutMs 30000`
- `node scripts/windows/test-windows-script-help.mjs`
- `git diff --check`
- 行首冲突标记扫描
遗留问题：
- 真实 Mac 的正式长测仍需要用户在 Windows 本机隐藏输入正式密码；本轮不认证真实 Mac、不发送输入、不执行 `inject`。
下一步建议：
- 用户准备好正式密码后，可运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-mac-host.ps1 -Discover -PromptPassword -RequirePassword -RequireH264 -ExpectInputMode log` 做底层正式探针；完整正式验收仍走 `check-mac-formal-e2e --discover --promptPassword`。
是否改了协议：否。
是否需要另一端配合：暂不需要；真实正式密码验收需要用户在 Windows 本机输入密码，`inject` 仍需另行明确确认。

## 2026-06-15 Windows Codex

日期：2026-06-15 17:45
开发端：Windows Codex
本轮目标：让底层 Mac host 探针也能自动发现 Mac host，方便单独做 H.264、音频、剪贴板和 input-log 验收。
完成内容：
- `scripts/windows/probe-mac-host.mjs` 新增 `--discover`、`--discoverNoLocalSubnets` 和 `--discoverTimeoutMs`。
- probe 会在密码检查前先调用 `scripts/windows/discover-lan-hosts.mjs --json --requireMacHost`，选中 `bestMacHost` 后再进入原 `/discovery`、WebSocket、认证、session 和媒体/剪贴板/input 探针。
- 发现失败会先退出，不会弹出或要求密码；发现成功后再使用原有 `LAN_DUAL_PASSWORD`、`--promptPassword` 或 `--password` 路径。
- 新增 `scripts/windows/test-probe-mac-host-discover.mjs`，用本机 mock Mac 覆盖自动发现、认证、会话和首帧，并覆盖离线 discovery 不触发密码提示。
- `CURRENT_STATUS`、`NEXT_ACTIONS` 和任务板同步新命令。
修改文件：
- `scripts/windows/probe-mac-host.mjs`
- `scripts/windows/test-probe-mac-host-discover.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/probe-mac-host.mjs`
- `node --check scripts/windows/test-probe-mac-host-discover.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script probe-mac-host.mjs --script test-probe-mac-host-discover.mjs`
- `node scripts/windows/test-probe-mac-host-discover.mjs --timeoutMs 30000`
遗留问题：
- 真实 Mac 的正式长测仍需要用户在 Windows 本机隐藏输入正式密码；本轮只用 mock host 做认证/首帧回归，没有对真实正式密码通道认证。
下一步建议：
- 用户准备好输入正式密码后，可先单跑 `node scripts/windows/probe-mac-host.mjs --discover --promptPassword --requirePassword --requireH264 --expectInputMode log`，再按需要加音频/剪贴板/长测参数；完整正式验收继续用 `check-mac-formal-e2e --discover --promptPassword`。
是否改了协议：否。
是否需要另一端配合：暂不需要；真实正式密码验收需要用户在 Windows 本机输入密码，`inject` 仍需另行明确确认。

## 2026-06-15 Windows Codex

日期：2026-06-15 17:25
开发端：Windows Codex
本轮目标：让 Windows 控制端页面级自检也能自动发现 Mac host，减少 UI 验收前手工复制 IP/端口。
完成内容：
- `scripts/windows/test-windows-client-browser.mjs` 新增 `--discover`、`--discoverNoLocalSubnets` 和 `--discoverTimeoutMs`。
- 页面自检会在密码检查和浏览器启动前先调用 `scripts/windows/discover-lan-hosts.mjs --json --requireMacHost`，选中 `bestMacHost` 后再进入原 `diagnosticsOnly` 或正式连接流程。
- `--diagnosticsOnly --discover --expectDiscoveryRuntimeBuildId <build-id>` 可不输入密码验证真实 Mac `/discovery.runtime`、设备列表自动选中和诊断条 runtime 显示。
- 新增 `scripts/windows/test-windows-client-browser-discover.mjs`，用本机带 CORS 的假 `/discovery` 服务 + Edge diagnosticsOnly 覆盖 `--discover` 到 UI runtime 验收的完整无密路径。
- Windows client README、当前状态、下一步和任务板同步新命令。
修改文件：
- `scripts/windows/test-windows-client-browser.mjs`
- `scripts/windows/test-windows-client-browser-discover.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node --check scripts/windows/test-windows-client-browser-discover.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-client-browser.mjs --script test-windows-client-browser-discover.mjs`
- `node scripts/windows/test-windows-client-browser-discover.mjs --timeoutMs 60000`
遗留问题：
- 正式连接真实 Mac 的 H.264 页面验收仍需要用户在 Windows 本机隐藏输入正式密码；本轮没有认证、没有发送输入、没有执行 `inject`。
下一步建议：
- 用户准备好输入正式密码后，可直接跑 `node scripts/windows/test-windows-client-browser.mjs --discover --promptPassword --requirePassword --requireH264` 做页面级正式 H.264 验收；正式聚合长测仍走 `check-mac-formal-e2e --discover --promptPassword`。
是否改了协议：否。
是否需要另一端配合：暂不需要；如果 Mac host 重启到新 build，Windows 侧可用 `--discover --diagnosticsOnly --expectDiscoveryRuntimeBuildId <build-id>` 先做无密 UI 验收。

## 2026-06-15 Mac Codex

日期：2026-06-15 16:55
开发端：Mac Codex
本轮目标：收口 Mac 控制 Windows formal browser smoke 执行器，并再次修正用户反馈的密码输入窗口可见性。
完成内容：
- 新增 `scripts/mac/run-mac-client-formal-smoke.mjs`：先跑无密 `check-mac-client-formal-status --json` 预检，ready 后才用 Mac client 页面连接真实 Windows host；正式密码只来自 `LAN_DUAL_PASSWORD` 或 `--promptPassword`，并通过环境变量传给子页面自检，不放 argv、不打印、不发 Agent Link Board。
- 新增 `scripts/mac/test-mac-client-formal-smoke.mjs`：用本地 Mac client server 和 mock Windows `/discovery` 覆盖 help、缺 host、preflight/dryRun 秘密安全、空密码和 `demo-password` 拒绝；测试不会打开真实密码框、不会认证真实 host、不会发送输入。
- `scripts/windows/test-mac-client-browser.mjs` 新增 `--useEnvPassword` / `--requirePassword`，供 Mac 包装器安全调用；默认旧 mock 行为不变，正式模式会在联网前拒绝空密码和 `demo-password`。
- `scripts/mac/password-prompt.mjs` 改为先响铃，再优先打开原生 AppKit 前台置顶隐藏密码框；原生窗口打不开时才退回系统 macOS 隐藏密码框，取消不弹第二个备用窗口。这样需要用户输入密码时更容易看到窗口。
- `scripts/mac/check-mac-client-formal-status.mjs` 的建议命令改为 `run-mac-client-formal-smoke --promptPassword`，避免后续直接手写 Windows 页面自检命令时绕过 Mac 侧密码弹窗体验。
- Mac client README、当前状态、下一步和任务板同步新增正式 smoke 用法及密码安全边界。
修改文件：
- `scripts/mac/run-mac-client-formal-smoke.mjs`
- `scripts/mac/test-mac-client-formal-smoke.mjs`
- `scripts/mac/password-prompt.mjs`
- `scripts/mac/test-mac-password-prompt.mjs`
- `scripts/mac/check-mac-client-formal-status.mjs`
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/mac-host/README.md`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/password-prompt.mjs`
- `node --check scripts/mac/test-mac-password-prompt.mjs`
- `node --check scripts/mac/run-mac-client-formal-smoke.mjs`
- `node --check scripts/mac/test-mac-client-formal-smoke.mjs`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/mac/test-mac-password-prompt.mjs --timeoutMs 8000`
- `node scripts/mac/test-mac-client-formal-smoke.mjs --timeoutMs 20000`
- `LAN_DUAL_PASSWORD= node scripts/windows/test-mac-client-browser.mjs --useExistingHost --host 127.0.0.1 --port 9 --useEnvPassword --requirePassword --timeoutMs 5000`
- `LAN_DUAL_PASSWORD=demo-password node scripts/windows/test-mac-client-browser.mjs --useExistingHost --host 127.0.0.1 --port 9 --useEnvPassword --requirePassword --timeoutMs 5000`
- 待最终提交前再跑 Mac/Windows help、formal status、diff check 和冲突标记搜索。
遗留问题：
- 本轮仍未执行真实 Windows host 认证和浏览器真连冒烟；需要 Windows host 在线并由用户输入正式密码后运行 `run-mac-client-formal-smoke --promptPassword`。
- `inject` 仍未执行，且必须等用户明确确认正在看屏幕后才允许另行验收。
下一步建议：
- 白天继续时先看 Agent Link Board，再启动/确认 Windows host，Mac 侧运行 `node scripts/mac/discover-windows-hosts.mjs --boardSummary` 和 `node scripts/mac/check-mac-client-formal-status.mjs --host <Windows IP> --port 43770 --boardSummary`；ready 后运行 `node scripts/mac/run-mac-client-formal-smoke.mjs --host <Windows IP> --port 43770 --promptPassword`。
是否改了协议：否。
是否需要另一端配合：需要 Windows 端启动正式 Windows host 并同步 IP/端口；密码不要发联络板。

## 2026-06-15 Mac Codex

日期：2026-06-15 16:24
开发端：Mac Codex
本轮目标：继续按用户反馈加固 Mac 侧密码输入可见性，并给 Mac 控制 Windows formal checklist 增加无密执行计划。
完成内容：
- `scripts/mac/password-prompt.mjs` 调整 `--promptPassword` 弹窗顺序：先响铃，再优先打开原生 AppKit 前台置顶隐藏密码框；原生窗口打不开时才退回系统 macOS 隐藏密码框。
- 用户取消前台密码框时直接取消，不再继续弹备用窗口；默认仍不退回终端隐藏输入，避免用户看不到输入位置。
- 显式 `--promptPassword` 仍不复用已有 `LAN_DUAL_PASSWORD`，必须弹前台窗口重新输入；密码不进 argv、不打印、不发联络板。
- `scripts/mac/check-mac-client-formal-status.mjs` 新增 `runPlan`，普通输出、JSON 和 boardSummary 均能展示 Mac 控制 Windows 真连前的安全执行路径：本地 Mac client 页面、Windows discovery、formal checklist、浏览器 smoke、质量/资源观察。
- runPlan 明确 `passwordInCommandArguments=false`、`passwordOnAgentLinkBoard=false`、`inject=false`，并提醒 `inject` 仍需用户明确确认。
- `apps/mac-host/README.md`、`apps/mac-client/README.md`、`CURRENT_STATUS`、`NEXT_ACTIONS` 和任务板同步当前行为。
修改文件：
- `scripts/mac/password-prompt.mjs`
- `scripts/mac/test-mac-password-prompt.mjs`
- `scripts/mac/start-mac-host.mjs`
- `scripts/mac/check-mac-host-readiness.mjs`
- `scripts/mac/check-mac-formal-local-smoke.mjs`
- `scripts/mac/check-mac-client-formal-status.mjs`
- `scripts/mac/test-mac-client-formal-status.mjs`
- `apps/mac-host/README.md`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/password-prompt.mjs`
- `node --check scripts/mac/test-mac-password-prompt.mjs`
- `node scripts/mac/test-mac-password-prompt.mjs --timeoutMs 10000`
- `node --check scripts/mac/check-mac-client-formal-status.mjs`
- `node --check scripts/mac/test-mac-client-formal-status.mjs`
- `node scripts/mac/test-mac-client-formal-status.mjs --timeoutMs 15000`
- `node scripts/mac/test-mac-host-start-helper.mjs --timeoutMs 15000`
- `node scripts/mac/test-mac-readiness-prompt-password.mjs --timeoutMs 12000`
- `node scripts/mac/test-mac-formal-local-smoke.mjs --timeoutMs 15000`
- `node scripts/mac/test-mac-script-help.mjs --script password-prompt.mjs --script start-mac-host.mjs --script check-mac-host-readiness.mjs --script check-mac-formal-local-smoke.mjs --script check-mac-client-formal-status.mjs --script test-mac-password-prompt.mjs --script test-mac-client-formal-status.mjs --timeoutMs 8000`
- `git diff --check`
- 冲突标记搜索通过
遗留问题：
- 本轮没有弹真实正式密码框，避免在未进入正式验收时打扰用户；下次真实 `--promptPassword` 会先响铃再显示原生 AppKit 前台置顶隐藏密码框。
- GitHub fetch 偶发卡住；本轮已基于 Windows 最新 `c486fc6` 合并，推送前仍需最后 fetch 确认。
下一步建议：
- Windows host 启动后，Mac 侧运行 `node scripts/mac/discover-windows-hosts.mjs --boardSummary`，再运行 `node scripts/mac/check-mac-client-formal-status.mjs --host <Windows IP> --port 43770 --boardSummary`；ready 后按 runPlan 做浏览器 smoke 和观感/资源记录。
是否改了协议：否。
是否需要另一端配合：需要 Windows 端启动正式 Windows host 并同步 IP/端口；密码不要发联络板，`inject` 仍需用户另行明确确认。

## 2026-06-15 Windows Codex

日期：2026-06-15 17:05
开发端：Windows Codex
本轮目标：让 Windows formal E2E 脚本能自动发现并选中 Mac host，减少正式验收前手工复制 IP/端口。
完成内容：
- `scripts/windows/check-mac-formal-e2e.mjs` 新增 `--discover`，会先只读调用 `scripts/windows/discover-lan-hosts.mjs --json --requireMacHost`，选中 `bestMacHost` 后再进入原 preflight/formal 流程。
- 新增 `--discoverNoLocalSubnets` 和 `--discoverTimeoutMs`，方便已知 IP 时限定扫描范围。
- 预检 JSON 新增 `discoverySelection`，记录是否请求 discovery、选中的 host/port、扫描摘要和 discovery board summary；正式安全命令仍输出显式 `--host <Mac IP> --port <port> --promptPassword`。
- 修复 `discover-lan-hosts` 对 `/discovery` 返回 `port/controlPort=0` 时误信端口的问题，现在会回退到实际探测端口；本地假 Mac 也能被自动选中。
- `test-mac-formal-e2e-preflight` 覆盖 discovery 自动选中 mock Mac host、discovery 离线无密失败、且不泄露密码。
修改文件：
- `scripts/windows/check-mac-formal-e2e.mjs`
- `scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `scripts/windows/discover-lan-hosts.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-mac-formal-e2e.mjs`
- `node --check scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `node scripts/windows/test-mac-formal-e2e-preflight.mjs --timeoutMs 90000`
- `node scripts/windows/test-discover-lan-hosts.mjs --timeoutMs 15000`
- `node scripts/windows/check-mac-formal-e2e.mjs --discover --preflightOnly --boardSummary --timeoutMs 12000 --discoverTimeoutMs 1200`
- `node scripts/windows/test-windows-script-help.mjs --timeoutMs 8000`
- `git diff --check`
- 冲突标记搜索通过
遗留问题：
- `--discover` 只解决正式 E2E 前的选址和无密预检；真正认证和长测仍需要用户在 Windows 本机隐藏输入正式密码。
下一步建议：
- 白天继续正式 E2E 时，先运行 `check-mac-formal-e2e --discover --preflightOnly --checkClientDiagnostics --boardSummary`，ready 后用 `--discover --preflightOnly --checkClientDiagnostics --userAuthRequest` 生成用户授权提醒。
是否改了协议：否。
是否需要另一端配合：不需要；正式认证仍需要用户输入密码，`inject` 仍需另行明确确认。

## 2026-06-15 Windows Codex

日期：2026-06-15 16:35
开发端：Windows Codex
本轮目标：让 Windows 侧 Mac host 发现摘要同时判断运行中 Mac host 是否需要因旧 build 重启。
完成内容：
- `scripts/windows/discover-lan-hosts.mjs` 对发现到的 Mac host 增加 `buildDiff`，比较 `/discovery.runtime.buildId` 到当前 git 的 `apps/mac-host/Package.swift` 与 `apps/mac-host/Sources` 变化。
- `--json` 的 `macHosts[]` / `bestMacHost` 现在带 `buildDiff`，顶层新增 `currentBuildId`；通用 `found` 保持未扩展，方便旧消费方继续使用。
- `--boardSummary` 现在会输出 `build=current`、`stale metadata only, hostRuntimeChanges=0` 或 `restart recommended`，帮助正式 E2E 前判断是否要请 Mac 端重启 host。
- `scripts/windows/test-discover-lan-hosts.mjs` 补 buildDiff 字段和无密摘要断言。
修改文件：
- `scripts/windows/discover-lan-hosts.mjs`
- `scripts/windows/test-discover-lan-hosts.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/discover-lan-hosts.mjs`
- `node --check scripts/windows/test-discover-lan-hosts.mjs`
- `node scripts/windows/test-discover-lan-hosts.mjs --timeoutMs 15000`
- `node scripts/windows/discover-lan-hosts.mjs --noLocalSubnets --host 192.168.31.122 --port 43770 --requireMacHost --boardSummary --timeoutMs 1200`
- `node scripts/windows/discover-lan-hosts.mjs --noLocalSubnets --host 192.168.31.122 --port 43770 --requireMacHost --json --timeoutMs 1200`
遗留问题：
- 这仍是只读 discovery/git diff 判断，不会重启 Mac host、不认证、不执行正式长测。
- 当前真实 Mac host `runtimeBuild=d807536`，到本轮开发前的 Windows repo `207e9b9` 没有 Mac host runtime 源码变化，因此摘要显示 `stale metadata only, hostRuntimeChanges=0`。
下一步建议：
- 正式 E2E 前先看 discovery 摘要：若 `restart recommended`，先让 Mac 端安全重启；若 `stale metadata only` 且 formal preflight ready，可继续进入用户本机密码输入流程。
是否改了协议：否。
是否需要另一端配合：不需要；仅当摘要提示 `restart recommended` 时，后续正式长测前需要 Mac 端重启 host。

## 2026-06-15 Windows Codex

日期：2026-06-15 16:20
开发端：Windows Codex
本轮目标：增强 Windows 侧 Mac host 发现入口，让正式 E2E 前少手工拼 IP、端口和命令。
完成内容：
- `scripts/windows/discover-lan-hosts.mjs` 新增 `--boardSummary`、`--requireMacHost` 和 `--noLocalSubnets`。
- `--json` 保持原通用 `found` 字段，同时新增 `macHosts`、`nonMacHosts`、`bestMacHost`、`macFormalE2e` 和 `boardSummary`。
- 发现 Mac host 后会输出三条下一步命令：无密 formal preflight、标准 `NEED_USER_AUTH` 提醒、正式 `--promptPassword` E2E；摘要明确不认证、不发密码、不打开 WebSocket、不发送输入、不执行 `inject`。
- 新增 `scripts/windows/test-discover-lan-hosts.mjs`，用本机临时假 `/discovery` 服务覆盖 JSON 字段、board summary、`--requireMacHost` 失败路径和无 secret-like 泄露。
- Windows 控制端 README、当前状态、下一步和任务板同步记录新入口。
修改文件：
- `scripts/windows/discover-lan-hosts.mjs`
- `scripts/windows/test-discover-lan-hosts.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/discover-lan-hosts.mjs`
- `node --check scripts/windows/test-discover-lan-hosts.mjs`
- `node scripts/windows/discover-lan-hosts.mjs --help`
- `node scripts/windows/test-discover-lan-hosts.mjs --timeoutMs 15000`
- `node scripts/windows/test-windows-script-help.mjs --script discover-lan-hosts.mjs --script test-discover-lan-hosts.mjs`
- `node scripts/windows/discover-lan-hosts.mjs --noLocalSubnets --host 192.168.31.122 --port 43770 --requireMacHost --boardSummary --timeoutMs 1200`
- `node scripts/windows/discover-lan-hosts.mjs --noLocalSubnets --host 192.168.31.122 --port 43770 --requireMacHost --json --timeoutMs 1200`
- `node scripts/windows/test-windows-script-help.mjs --timeoutMs 8000`
- `git diff --check`
- 冲突标记搜索通过
遗留问题：
- 当前真实 Mac host `/discovery.runtime.buildId=d807536`，仓库已继续前进；这轮只做发现/命令生成，不重启 Mac host，也不跑正式认证。
下一步建议：
- 正式 Windows 控制 Mac E2E 前，先运行新发现摘要命令确认 Mac IP/port 和 runtime，再跑 `check-mac-formal-e2e --preflightOnly --checkClientDiagnostics --boardSummary`。用户准备好时再用 `--userAuthRequest` 提醒本机隐藏输入正式密码，最后执行 `--promptPassword` 正式验收。
是否改了协议：否。
是否需要另一端配合：不需要；正式 E2E 仍需要用户输入密码和 Mac host 保持在线，`inject` 仍需用户另行明确确认。

## 2026-06-15 Windows Codex

日期：2026-06-15 14:30
开发端：Windows Codex
本轮目标：让 Windows host 真启动成功后，直接把 Mac 端下一步 readiness / formal checklist 命令和联络板摘要打印出来。
完成内容：
- `start-windows-host.mjs` 抽出共享在线 status 构造逻辑，`--status` 和启动成功后的 `/discovery` ready 路径共用同一套能力、runtime、Mac next 命令和 boardSummary 生成。
- 启动助手在 `/discovery` ready 后会打印 `Mac readiness command`、`Mac formal checklist command` 和一行无密 `Agent Link Board summary`。
- `test-windows-host-start-helper.mjs` 的真实临时启动路径新增断言，确认启动成功输出包含 readiness、formal checklist 和无密通讯板摘要。
- Windows host README 同步说明启动助手 ready 后会直接给出 Mac 端可运行的两类下一步命令。
修改文件：
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `apps/windows-host/README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check scripts/windows/test-windows-host-start-helper.mjs`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `$env:LAN_DUAL_PASSWORD='test-password'; node scripts/windows/start-windows-host.mjs --requirePassword --dryRun`
遗留问题：
- 这只改善启动输出和联络效率；真正 Mac 反控 Windows 还需要 Windows host 正式启动后，由 Mac 端连接并跑 formal checklist / 真连验收。
下一步建议：
- 下次需要让 Mac 反控 Windows 时，Windows 端用 `start-windows-host --promptPassword --requirePassword` 启动后，把它打印的 Agent Link Board summary 发到通讯板。
是否改了协议：否。
是否需要另一端配合：不需要；后续真连验收需要 Mac 端按输出命令连接。

## 2026-06-15 Windows Codex

日期：2026-06-15 14:15
开发端：Windows Codex
本轮目标：让 Windows host 在线状态直接给 Mac 端 formal checklist 下一步命令，减少 Mac 反控 Windows 真连前的手工拼命令。
完成内容：
- `start-windows-host --status` 的 Mac 下一步目标保留原 `check-mac-client-readiness` 命令，同时新增 `formalCommand`：`check-mac-client-formal-status --host <Windows IP> --port <port> --boardSummary`。
- `--status --boardSummary` 在线时优先提示 Mac formal checklist 命令，并附带 readiness 命令；离线摘要保持安全启动建议。
- 普通 status 输出新增 `Mac formal checklist command` 行，JSON 输出的 `macClientReadinessCommands[]` 新增 `readinessCommand` 和 `formalCommand` 字段，向后兼容原 `command` 字段。
- Windows host README 同步说明 `--status --boardSummary` / readiness board summary 会给出 Mac readiness 与 formal checklist 两类下一步命令。
修改文件：
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `apps/windows-host/README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check scripts/windows/test-windows-host-start-helper.mjs`
- `node scripts/windows/start-windows-host.mjs --help`
- `node scripts/windows/start-windows-host.mjs --status --boardSummary --host 127.0.0.1 --port 43999`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-host-readiness-board-summary.mjs --timeoutMs 90000 --readinessTimeoutMs 8000`
- `node scripts/windows/test-windows-script-help.mjs --script start-windows-host.mjs --script test-windows-host-start-helper.mjs --script check-windows-host-readiness.mjs`
遗留问题：
- 这只是状态/联络体验增强，不会启动 Windows host，也不替代用户输入正式密码或 Mac 端真连验收。
下一步建议：
- Windows host 正式启动后，先发 `start-windows-host --status --boardSummary` 到联络板；Mac 端可直接运行摘要里的 `check-mac-client-formal-status`。
是否改了协议：否。
是否需要另一端配合：不需要；后续真连验收需要 Mac 端连接已启动的 Windows host。
## 2026-06-15 Windows Codex

日期：2026-06-15 13:55
开发端：Windows Codex
本轮目标：让 Mac client 视频传输矩阵在浏览器或临时 host 端口瞬时释放失败时自动恢复，减少误报。
完成内容：
- `scripts/windows/test-mac-client-video-transports.mjs` 新增 `--retries` 和 `--retryDelayMs`，默认单个 case 失败后自动重试 1 次。
- 每次重试会分配新的临时 Windows host、Mac client 和浏览器 debug 端口，避免上一轮进程释放慢导致继续撞端口。
- 人类输出会显示失败尝试和最终是否经过重试；`--json` 输出新增 `retries`、`retryDelayMs`、最终 `attempt` 和每次 `attempts` 摘要。
- README 同步记录默认重试行为；需要严格复现首次失败时可加 `--retries 0`。
修改文件：
- `scripts/windows/test-mac-client-video-transports.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-client-video-transports.mjs`
- `node scripts/windows/test-mac-client-video-transports.mjs --help`
- `node scripts/windows/test-windows-script-help.mjs --script test-mac-client-video-transports.mjs`
- `node scripts/windows/test-mac-client-video-transports.mjs --case binary-h264 --timeoutMs 90000 --h264Encoder h264_nvenc --retries 1 --retryDelayMs 1000`
- `node scripts/windows/test-mac-client-video-transports.mjs --case h264-json --json --timeoutMs 90000 --h264Encoder h264_nvenc --retries 0`
- `node scripts/windows/test-mac-client-video-transports.mjs --timeoutMs 90000 --h264Encoder h264_nvenc`
- `node scripts/windows/test-mac-client-video-transports.mjs --case wgc-nv12-h264 --timeoutMs 90000 --wgcNv12ObserveVideoMs 1500 --wgcNv12MinObservedVideoFrames 5 --wgcNv12MinObservedVideoFps 3 --retries 1`
遗留问题：
- 这只是测试矩阵稳定性加固，不改变 Windows host 实际视频管线；真实 Mac 控制 Windows 的观感、延迟和资源仍要真连验证。
下一步建议：
- 后续视频传输、H.264 或 WGC NV12 改动继续跑默认矩阵；若要复现首败现场，临时加 `--retries 0`。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-15 Windows Codex

日期：2026-06-15 13:21
开发端：Windows Codex
本轮目标：把真实 WGC helper + NV12 + NVENC H.264 路线接入 Mac client 视频传输矩阵，作为 Mac 反控 Windows 真连前的页面级守门项。
完成内容：
- `scripts/windows/test-mac-client-video-transports.mjs` 新增可选 case `wgc-nv12-h264`，可用 `--case wgc-nv12-h264` 单独跑，也可用 `--includeWgcNv12` 加入默认四项矩阵。
- 新 case 复用 `test-mac-client-browser --expectWgcNv12H264Video`，默认用 `h264_nvenc`，启动真实 WGC helper，要求页面显示 `h264/binary-h264`，并断言 session pipeline 为 `windows-wgc-helper-nv12-ffmpeg-h264`。
- 默认矩阵仍保持四项，不强制要求 WGC helper 或桌面捕获上下文，避免没有 helper 的机器误失败。
- `apps/windows-host/README.md`、`CURRENT_STATUS`、`NEXT_ACTIONS` 和任务板同步记录默认四项与可选 WGC NV12 第五项的用法和本机结果。
修改文件：
- `scripts/windows/test-mac-client-video-transports.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-client-video-transports.mjs`
- `node scripts/windows/test-mac-client-video-transports.mjs --help`
- `node scripts/windows/test-mac-client-video-transports.mjs --case wgc-nv12-h264 --timeoutMs 90000 --wgcNv12ObserveVideoMs 1500 --wgcNv12MinObservedVideoFrames 5 --wgcNv12MinObservedVideoFps 3 --verbose`
- `node scripts/windows/test-mac-client-video-transports.mjs --case binary-h264 --timeoutMs 90000 --h264Encoder h264_nvenc --verbose`
- `node scripts/windows/test-mac-client-video-transports.mjs --timeoutMs 90000 --h264Encoder h264_nvenc`
遗留问题：
- 真实 Mac 控制 Windows 跨机器观感、延迟、资源占用仍需要 Windows host 正式启动后由 Mac 端真连验收；当前只是 Windows 本机页面级守门。
- WGC NV12 仍是 CPU readback/转换 + FFmpeg/NVENC 桥接，低延迟主线下一步仍应推进 helper 原生硬编。
下一步建议：
- 涉及 WGC NV12/H.264 的 Windows host 或 Mac client 改动后，跑 `test-mac-client-video-transports --case wgc-nv12-h264`；日常 H.264/transport 改动继续跑默认四项矩阵。
是否改了协议：否。
是否需要另一端配合：不需要；后续真连观感验收需要 Mac 端连接正式 Windows host。

## 2026-06-15 Windows Codex

日期：2026-06-15 13:08
开发端：Windows Codex
本轮目标：给正式 Windows 控制 Mac E2E 增加无密执行计划输出，让用户输入正式密码前能看到将要执行的步骤、耗时和安全边界。
完成内容：
- `scripts/windows/check-mac-formal-e2e.mjs` 的预检报告新增 `runPlan`：包含目标、正式/快速 profile、视频分辨率/FPS/码率/时长阈值、音频阈值、剪贴板范围、子步骤命令、预计耗时、密码只走 `LAN_DUAL_PASSWORD` 环境变量和 `inject=false`。
- 普通 `--preflightOnly` 输出现在会在 readiness 后打印 `Formal run plan`，离线时也会给出同一份计划；`--preflightOnly --json` 则输出机器可读 `runPlan`。
- `scripts/windows/test-mac-formal-e2e-preflight.mjs` 新增 runPlan 安全形状断言，覆盖离线 JSON、mock JSON 和 mock UI diagnostics，确认不泄露 `test-password`/`demo-password`。
- `CURRENT_STATUS`、`NEXT_ACTIONS` 和任务板同步记录 runPlan 用法。
修改文件：
- `scripts/windows/check-mac-formal-e2e.mjs`
- `scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-mac-formal-e2e.mjs`
- `node --check scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `node scripts/windows/check-mac-formal-e2e.mjs --help`
- `node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --preflightOnly`
- `node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --preflightOnly --checkClientDiagnostics --json`
- `node scripts/windows/test-mac-formal-e2e-preflight.mjs --timeoutMs 90000`
- `node scripts/windows/test-windows-script-help.mjs`
遗留问题：
- 正式认证、5-10 分钟真实 E2E 长测和页面真实控制仍需要用户在 Windows 本机运行 `--promptPassword` 并隐藏输入 Mac host 正式密码；`inject` 仍需用户另行明确确认。
下一步建议：
- 用户准备好后运行 `node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --promptPassword`，先完成不含 inject 的正式 H.264/音频/剪贴板/input-log 验收。
是否改了协议：否。
是否需要另一端配合：需要 Mac host 继续在线；正式验收需要用户本机输入密码，密码不要发联络板。

## 2026-06-15 Mac Codex

日期：2026-06-15 13:20
开发端：Mac Codex
本轮目标：减少 Mac 控制 Windows 真连前手工猜 Windows IP 的步骤，补一个 Mac 侧只读 Windows host 发现入口；同时按用户反馈让显式密码输入每次都弹出可见前台窗口。
完成内容：
- `--promptPassword` 继续先响铃再打开前台置顶原生 AppKit 隐藏密码框；显式要求弹窗时，即使环境里已有 `LAN_DUAL_PASSWORD`，也不会静默复用旧值，而是要求用户在弹窗里重新输入。
- 新增 `scripts/mac/discover-windows-hosts.mjs`：复用现有 `scripts/windows/discover-lan-hosts.mjs` 扫描 `/discovery`，但只保留 `platform=windows` 的目标。
- 发现到 Windows host 时，输出可直接运行的 `node scripts/mac/check-mac-client-formal-status.mjs --host <Windows IP> --port <port> --boardSummary`；未发现时说明只看到非 Windows/self host 或没有 Windows host，并提示让 Windows Codex 启动 host 后重试。
- 支持 `--json`、`--boardSummary`、`--requireFound`、`--host`、`--subnet`、`--port`、`--timeoutMs` 等参数；脚本只读，不认证 WebSocket、不要求或打印密码、不发送输入、不执行 `inject`。
- 新增 `scripts/mac/test-discover-windows-hosts.mjs`，用假底层扫描器覆盖发现 Windows、过滤 Mac/self、无 Windows 时 `--requireFound` 失败和摘要不泄密。
- `check-mac-client-formal-status` 的 help、离线 checklist、callText 和 boardSummary 改为优先提示运行 `discover-windows-hosts`，并修正旧提示里不存在的 `--checkBoard` 参数。
- `apps/mac-client/README.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md`、`docs/04-task-board.md`、`docs/ACTIVE_LOCKS.md` 已同步。
修改文件：
- `scripts/mac/discover-windows-hosts.mjs`
- `scripts/mac/test-discover-windows-hosts.mjs`
- `scripts/mac/password-prompt.mjs`
- `scripts/mac/start-mac-host.mjs`
- `scripts/mac/check-mac-host-readiness.mjs`
- `scripts/mac/check-mac-formal-local-smoke.mjs`
- `scripts/mac/test-mac-password-prompt.mjs`
- `scripts/mac/test-mac-host-start-helper.mjs`
- `scripts/mac/test-mac-readiness-prompt-password.mjs`
- `scripts/mac/test-mac-formal-local-smoke.mjs`
- `scripts/mac/check-mac-client-formal-status.mjs`
- `scripts/mac/test-mac-client-formal-status.mjs`
- `apps/mac-host/README.md`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/discover-windows-hosts.mjs`
- `node --check scripts/mac/test-discover-windows-hosts.mjs`
- `node --check scripts/mac/password-prompt.mjs`
- `node --check scripts/mac/start-mac-host.mjs`
- `node --check scripts/mac/check-mac-host-readiness.mjs`
- `node --check scripts/mac/check-mac-formal-local-smoke.mjs`
- `node --check scripts/mac/test-mac-password-prompt.mjs`
- `node --check scripts/mac/test-mac-host-start-helper.mjs`
- `node --check scripts/mac/test-mac-readiness-prompt-password.mjs`
- `node --check scripts/mac/test-mac-formal-local-smoke.mjs`
- `node scripts/mac/test-mac-password-prompt.mjs --timeoutMs 8000`
- `node scripts/mac/test-mac-host-start-helper.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-readiness-prompt-password.mjs --timeoutMs 8000`
- `node scripts/mac/test-mac-formal-local-smoke.mjs --timeoutMs 20000`
- `node scripts/mac/test-discover-windows-hosts.mjs --timeoutMs 10000`
- `node scripts/mac/test-mac-client-formal-status.mjs --timeoutMs 15000`
- `node scripts/mac/test-mac-script-help.mjs --script discover-windows-hosts.mjs --script test-discover-windows-hosts.mjs --script check-mac-client-formal-status.mjs --timeoutMs 8000`
遗留问题：
- 当前真实局域网发现仍取决于 Windows host 是否启动；脚本不会替 Windows 启动 host，只负责 Mac 侧发现和下一步命令生成。
下一步建议：
- Windows host 启动后，Mac 侧先运行 `node scripts/mac/discover-windows-hosts.mjs --boardSummary`，再用输出的 formal checklist 命令确认 `readyToCall`，随后发 Agent Link Board call 做真连观感/延迟/资源对照。
- 任何真实 `--promptPassword` 前仍会先响铃；需要系统授权/点击时再用 `NEED_USER_AUTH`/提示音叫用户，不在联络板发送密码。
是否改了协议：否。
是否需要另一端配合：真连验收需要 Windows 端启动 Windows host；代码改动不需要 Windows 修改。

## 2026-06-15 Mac Codex

日期：2026-06-15 13:00
开发端：Mac Codex
本轮目标：按用户现场反馈“没有看到输入密码的地方”，再次加固 Mac 侧 `--promptPassword` 的可见性，确保需要用户输入密码时先响铃再弹出真正前台窗口。
完成内容：
- `scripts/mac/password-prompt.mjs` 首选改为原生 Swift/AppKit 隐藏密码框：运行时会激活当前进程、窗口置顶、跨 Space 可见，并把密码框设为第一响应者，避免藏在后台。
- 如果原生 AppKit 弹窗打不开，才退回 AppleScript 前台隐藏密码框；如果用户取消，则直接停止，不会再弹第二个备用窗口。
- 默认仍不退回终端隐藏输入，只有显式 `LAN_DUAL_ALLOW_TERMINAL_PASSWORD_PROMPT=1` 才允许本地人工 fallback；密码仍不打印、不进 argv、不发联络板。
- `scripts/mac/test-mac-password-prompt.mjs` 增加假 `swift`，覆盖提示音、原生 AppKit 前台/置顶/聚焦脚本、取消不 fallback、原生失败后 AppleScript fallback 和全部失败路径。
- 更新 `start-mac-host`、`check-mac-host-readiness`、`check-mac-formal-local-smoke` 的帮助文字，以及 Mac host README、当前状态、下一步和任务板中的弹窗说明。
修改文件：
- `scripts/mac/password-prompt.mjs`
- `scripts/mac/test-mac-password-prompt.mjs`
- `scripts/mac/start-mac-host.mjs`
- `scripts/mac/check-mac-host-readiness.mjs`
- `scripts/mac/check-mac-formal-local-smoke.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/password-prompt.mjs`
- `node --check scripts/mac/test-mac-password-prompt.mjs`
- `node scripts/mac/test-mac-password-prompt.mjs --timeoutMs 10000`
- 抽取 `password-prompt.mjs` 内嵌 Swift/AppKit 脚本后用 `swift -frontend -parse -` 解析通过
- `node scripts/mac/test-mac-host-start-helper.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-readiness-prompt-password.mjs --timeoutMs 10000`
- `node scripts/mac/test-mac-formal-local-smoke.mjs --timeoutMs 12000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 8000`
- `git diff --check`
- 冲突标记搜索
遗留问题：
- 本轮未弹真实正式密码框，避免在未进入正式验收时打扰用户；下次任何真实 `--promptPassword` 都会先响铃，再显示前台置顶原生密码框。
下一步建议：
- 若还需要真实启动 Mac host，使用 `node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword`；用户应能看到前台密码框。如果仍不可见，下一步考虑改为短生命周期 `.app` 包或使用 `osascript display dialog` 绑定当前前台应用。
是否改了协议：否。
是否需要另一端配合：无需 Windows 修改；只需 Windows Codex 知道 Mac 侧密码弹窗体验已再次加固。

## 2026-06-15 Mac Codex

日期：2026-06-15 13:05
开发端：Mac Codex
本轮目标：补齐 Mac 控制 Windows 前的本地 Mac client 页面启动/状态入口，让正式清单不再依赖人工记命令。
完成内容：
- 新增 `scripts/mac/start-mac-client.mjs`：默认启动 `apps/mac-client/server.mjs` 并等待页面可访问；`--status` 只读检查页面是否在线；`--json` 输出机器可读结果；`--boardSummary` 输出可发联络板的无密摘要；`--allowExisting` 可复用已在线页面；`--open` 可启动后打开浏览器。
- 新增 `scripts/mac/test-mac-client-start-helper.mjs`，覆盖 help、离线 status JSON、启动成功、重复启动拒绝、`--allowExisting` 复用和不泄露密码。
- `check-mac-client-formal-status` 在本地页面离线时提示使用 `node scripts/mac/start-mac-client.mjs`，减少正式真连前的手工步骤。
- `apps/mac-client/README.md`、`docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md` 同步记录新 helper 和推荐流程。
修改文件：
- `scripts/mac/start-mac-client.mjs`
- `scripts/mac/test-mac-client-start-helper.mjs`
- `scripts/mac/check-mac-client-formal-status.mjs`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/start-mac-client.mjs`
- `node --check scripts/mac/test-mac-client-start-helper.mjs`
- `node scripts/mac/test-mac-client-start-helper.mjs --timeoutMs 12000`
遗留问题：
- 该 helper 只启动/检查本地 Mac client 页面；真实连接 Windows host、认证、媒体/剪贴板/input-log 仍需 Windows host 在线后按 formal checklist 发起。
下一步建议：
- Windows host 给出 IP/端口后，Mac 侧运行 `node scripts/mac/start-mac-client.mjs --allowExisting`，再运行 `node scripts/mac/check-mac-client-formal-status.mjs --host <Windows IP> --port 43770 --boardSummary`，ready 后再发 call 做真连观感/延迟/资源对照。
是否改了协议：否。
是否需要另一端配合：不需要 Windows 端改代码；真连验收仍需要 Windows 端启动 Windows host 并同步 IP/端口。

## 2026-06-15 Mac Codex

日期：2026-06-15 12:45
开发端：Mac Codex
本轮目标：按用户反馈继续修正 Mac 侧需要输入密码时看不到输入框的问题，并把本地 Mac formal checklist 基于 Windows 最新提交重放。
完成内容：
- 已先同步远端并把 `c78fbdd Add Mac client formal status checklist` 变基到 Windows 最新 `743de0b Add Windows host board summary status` 之后，避免覆盖 Windows 端 boardSummary 工作。
- `scripts/mac/password-prompt.mjs` 的 macOS 隐藏密码框改为通过 SystemUIServer 激活前台，再显示 hidden answer 对话框；仍然先响铃，默认不退回终端隐藏输入。
- `scripts/mac/start-mac-host.mjs --promptPassword` 现在语义更明确：显式要求弹窗时，不允许和 `--password` 或已有 `LAN_DUAL_PASSWORD` 混用，避免悄悄复用旧密码导致用户等不到输入框。
- 更新 `apps/mac-host/README.md`、`docs/CURRENT_STATUS.md` 和 `docs/NEXT_ACTIONS.md`，记录 SystemUIServer 前置弹窗和“想弹窗先不要预设环境密码”的规则。
- 扩展 `scripts/mac/test-mac-password-prompt.mjs` 和 `scripts/mac/test-mac-host-start-helper.mjs`，覆盖 SystemUIServer 前置脚本和 `--promptPassword` 拒绝复用环境密码。
修改文件：
- `scripts/mac/password-prompt.mjs`
- `scripts/mac/start-mac-host.mjs`
- `scripts/mac/test-mac-password-prompt.mjs`
- `scripts/mac/test-mac-host-start-helper.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/password-prompt.mjs`
- `node --check scripts/mac/start-mac-host.mjs`
- `node --check scripts/mac/test-mac-password-prompt.mjs`
- `node --check scripts/mac/test-mac-host-start-helper.mjs`
- `node scripts/mac/test-mac-password-prompt.mjs --timeoutMs 8000`
- `node scripts/mac/test-mac-host-start-helper.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-readiness-prompt-password.mjs --timeoutMs 5000`
- `node scripts/mac/test-mac-formal-local-smoke.mjs --timeoutMs 12000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 5000`
- `git diff --check`
遗留问题：
- 未触发真实正式密码输入，避免在用户未明确要求启动/验收时弹真实密码框；下次如需输入密码，会先响铃再弹前台 macOS 隐藏密码框。
下一步建议：
- 白天继续前先看 Agent Link Board；若要启动真实 Mac host，用 `node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword`，并确保没有预设 `LAN_DUAL_PASSWORD`，这样会强制弹窗。
是否改了协议：否。
是否需要另一端配合：无需 Windows 修改；Windows 端只需知道 Mac 侧密码弹窗可见性已加固。

## 2026-06-15 Mac Codex

日期：2026-06-15 12:25
开发端：Mac Codex
本轮目标：给 Mac 控制 Windows 的正式真连/观感验收增加只读清单，减少发起跨机测试前的手工判断。
完成内容：
- 新增 `scripts/mac/check-mac-client-formal-status.mjs`，复用 `check-mac-client-readiness --json`，输出正式真连前 `checklist`、`counts`、`readyToCall`、`callText` 和 `boardSummary`。
- 清单默认要求 repo 干净、本地 Mac client 页面在线、Windows host `/discovery` 在线、Agent Link Board 可读；同时汇总 H.264/视频传输、音频、input-log、剪贴板能力，并明确 `inject` 跳过。
- 脚本只读：不启动 Mac client、不启动 Windows host、不认证 WebSocket、不要求或打印密码、不发送输入事件、不执行 `inject`；本地诊断可用 `--allowDirty`、`--allowClientServerOffline`、`--allowWindowsHostOffline` 放宽为 warning，但 `readyToCall` 仍不会因此变 true。
- 新增 `scripts/mac/test-mac-client-formal-status.mjs`，覆盖帮助、离线 blocker、allow warning、无密 board summary、临时 Mac client server + mock Windows discovery 的 ready shape。
- 文档同步到 Mac client README、当前状态、下一步和任务板。
修改文件：
- `scripts/mac/check-mac-client-formal-status.mjs`
- `scripts/mac/test-mac-client-formal-status.mjs`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-client-formal-status.mjs`
- `node --check scripts/mac/test-mac-client-formal-status.mjs`
- `node scripts/mac/test-mac-client-formal-status.mjs --timeoutMs 15000`
- `node scripts/mac/check-mac-client-formal-status.mjs --skipBoard --allowDirty --allowClientServerOffline --allowWindowsHostOffline --boardSummary --timeoutMs 1200`
- 待收尾前再跑 Mac help、diff check 和冲突标记搜索。
遗留问题：
- 真实 Mac client 连接 Windows host 的观感/延迟/资源对照仍需要 Windows host 在线并由双方在通讯板发起测试；本轮只做无密清单和 mock 形状回归。
下一步建议：
- Windows host 在线后，Mac 侧先启动本地 `apps/mac-client/server.mjs`，再运行 `node scripts/mac/check-mac-client-formal-status.mjs --host <Windows IP> --port 43770 --boardSummary`。
- 如果 `readyToCall=true`，把摘要发通讯板后再做页面级或人工真连，对比 WGC NV12 H.264、ffmpeg-h264、binary-jpeg/JPEG fallback 的首帧、FPS、frame age、音频播放、剪贴板、input-log、带宽和 CPU。
是否改了协议：否。
是否需要另一端配合：真连验收需要 Windows 端启动 Windows host 并同步 IP/端口；密码不要发联络板。

## 2026-06-15 Mac Codex

日期：2026-06-15 12:00
开发端：Mac Codex
本轮目标：补齐 Mac 控制 Windows 真连前的只读预检工具，并按用户反馈继续加固 Mac 侧密码弹窗可见性。
完成内容：
- 新增 `scripts/mac/check-mac-client-readiness.mjs`：真连 Windows 前只读检查 repo、Mac client 静态文件和 JS 语法，可选检查本地 Mac client HTTP 页面、Windows host `/discovery` 和 Agent Link Board。
- 预检脚本支持 `--boardSummary` 输出可直接发通讯板的无密摘要，也支持 `--json` 给自动化消费；`--requireClientServer`、`--requireWindowsHost`、`--requireClean` 可把对应问题升级为 blocker。
- 新增 `scripts/mac/test-mac-client-readiness.mjs`，覆盖 help、离线 JSON、require 失败、board summary 不泄露 secret-like server 文本、临时 Mac client server 和 mock Windows discovery。
- `scripts/mac/password-prompt.mjs` 继续加固：`--promptPassword` 先响铃，再 `activate` 前台 macOS hidden answer 对话框；默认不再退回终端隐藏输入，避免用户看不到输入位置。只有显式 `LAN_DUAL_ALLOW_TERMINAL_PASSWORD_PROMPT=1` 才允许本地手工终端 fallback。
- 同步更新 Mac README、当前状态、下一步和任务板，说明正式密码输入会激活到前台，且密码不打印、不进 argv、不发联络板。
修改文件：
- `scripts/mac/check-mac-client-readiness.mjs`
- `scripts/mac/test-mac-client-readiness.mjs`
- `scripts/mac/password-prompt.mjs`
- `scripts/mac/start-mac-host.mjs`
- `scripts/mac/check-mac-host-readiness.mjs`
- `scripts/mac/check-mac-formal-local-smoke.mjs`
- `scripts/mac/test-mac-password-prompt.mjs`
- `scripts/mac/test-mac-host-start-helper.mjs`
- `scripts/mac/test-mac-readiness-prompt-password.mjs`
- `scripts/mac/test-mac-formal-local-smoke.mjs`
- `apps/mac-client/README.md`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check` 覆盖本轮 Mac 脚本。
- `node scripts/mac/test-mac-client-readiness.mjs --timeoutMs 12000`
- `node scripts/mac/check-mac-client-readiness.mjs --boardSummary --timeoutMs 1200`
- `node scripts/mac/test-mac-password-prompt.mjs --timeoutMs 8000`
- `node scripts/mac/test-mac-readiness-prompt-password.mjs --timeoutMs 8000`
- `node scripts/mac/test-mac-formal-local-smoke.mjs --timeoutMs 20000`
- `node scripts/mac/test-mac-host-start-helper.mjs --timeoutMs 30000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 5000`
- `git diff --check`
- 冲突标记搜索
遗留问题：
- 本轮未做真实 Mac client 连接 Windows host 的观感/延迟/资源对照，因为需要 Windows host 保持在线并按双方约定发起真连测试。
- 本轮未执行任何真实输入注入，也未收集或发送密码。
下一步建议：
- Windows host 在线后，Mac 侧先跑 `node scripts/mac/check-mac-client-readiness.mjs --host <Windows IP> --port 43770 --checkBoard --boardSummary`，把摘要发 Agent Link Board。
- 预检 ready 后，再用现有页面级脚本或手动 Mac client 真连 Windows host，对比 WGC NV12 H.264、raw-bgra、ffmpeg-h264、binary-jpeg 的首帧、FPS、frame age、音频播放、带宽和 CPU。
是否改了协议：否。
是否需要另一端配合：真连观感/资源验收需要 Windows 端启动目标 Windows host 并同步地址；密码不要发联络板。

## 2026-06-15 Windows Codex

日期：2026-06-15 12:20
开发端：Windows Codex
本轮目标：把 WGC H.264 bridge 从 raw BGRA 继续推进到 NV12，降低 helper 到 host 的 raw 像素 payload，并补齐启动/观察/基准入口。
完成内容：
- `apps/windows-wgc-helper` 新增 `--outputFormat nv12` / `LAN_DUAL_WGC_OUTPUT_FORMAT=nv12`；NV12 输出会调整为偶数宽高，payload 大小为 `width*height*3/2`。
- Windows host 新增 `LAN_DUAL_WINDOWS_WGC_H264_SOURCE=nv12` / `--wgcH264Source nv12`，会让 helper 使用 `binary-frame-v1` 输出 raw NV12，并用 FFmpeg `rawvideo -pix_fmt nv12` 接入 H.264/NVENC。
- `/discovery.capabilities.screen.wgc.h264BridgeSource` 和 session/frame 的 `capturePipeline` 可显示 `windows-wgc-helper-nv12-ffmpeg-h264`。
- `observe-windows-host-video`、`start-windows-host`、`start-windows-host.ps1`、`benchmark-windows-wgc-settings` 均支持 `nv12` 入口；基准脚本也可直接加 `--h264Bridge --h264Source nv12 --h264Encoder h264_nvenc`。
- `test-windows-wgc-helper` 新增 helper mock binary NV12 合同；`test-windows-wgc-mode` 新增 mock NV12 H.264 bridge 合同。
修改文件：
- `apps/windows-wgc-helper/src/main.rs`
- `apps/windows-host/src/windows-screen-capture.mjs`
- `scripts/windows/observe-windows-host-video.mjs`
- `scripts/windows/benchmark-windows-wgc-settings.mjs`
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `scripts/windows/test-windows-wgc-helper.mjs`
- `scripts/windows/test-windows-wgc-mode.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `cargo fmt --check` / `cargo check --quiet` in `apps/windows-wgc-helper`
- `npm.cmd run check` in `apps/windows-host`
- `node --check` 覆盖本轮改动的 Windows 脚本
- `node scripts/windows/test-windows-wgc-helper.mjs --skipRealCapture --skipRealHostIntegration --observerDurationMs 1400 --minObserverFrames 2`：helper build/probe、mock JPEG、mock binary BGRA 192 bytes、mock binary NV12 72 bytes、mock Node host JPEG 43 帧通过。
- `node scripts/windows/test-windows-wgc-mode.mjs --mockHelper --h264Bridge --durationMs 2200 --minFrames 2 --h264Source nv12 --width 320 --height 180`：66 帧通过，pipeline=`windows-wgc-helper-nv12-ffmpeg-h264`。
- raw-bgra 回归同脚本 67 帧通过。
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`：启动助手 dry-run/status/临时 host 自测通过，并验证 `--wgcH264Source nv12`。
- 真实 helper + `h264_nvenc` NV12 短观察：`320x180` 2.2 秒 67 帧、约 30.12 FPS、fresh helper frame 42；`1280x720` 2.2 秒 67 帧、约 30.06 FPS、fresh helper frame 12、repeat full 55、最大间隔 60ms，pipeline=`windows-wgc-helper-nv12-ffmpeg-h264`。
- `benchmark-windows-wgc-settings --skipBuild --profile 30:50000:balanced --durationMs 1200 --minFrames 1 --resourceSample false --resourceSampleTree false --repeatLastFrame --h264Bridge --h264Source nv12 --h264Encoder h264_nvenc --width 320 --height 180`：36 帧、约 29.65 FPS，确认基准入口可用。
遗留问题：
- NV12 当前仍是 D3D11 staging CPU readback 后 CPU 转 NV12，再交给 FFmpeg/NVENC，不是最终的 GPU 零拷贝或 helper 原生硬编。
- 还未做 Mac client 真连 Windows host 的主观观感、延迟和资源对照。
下一步建议：
- 推进 helper 原生硬编或 GPU 侧 NV12/VideoProcessor 转换，减少 CPU readback/转换开销。
- 用 Mac client 真实连接 Windows host，对比 `ffmpeg-h264`、WGC JPEG bridge、WGC raw-bgra binary、WGC NV12 binary 的画质、延迟、带宽和 CPU。
是否改了协议：否。只改 Windows host 与 WGC helper 的内部 stdout 合同和启动/观察参数，远控 WebSocket 协议未变。
是否需要另一端配合：代码改动本身不需要；真连观感和资源验收需要 Mac client 连接 Windows host。

## 2026-06-15 Windows Codex

日期：2026-06-15 11:35
开发端：Windows Codex
本轮目标：把 WGC raw-bgra H.264 bridge 的 helper 内部传输从 JSON/base64 推进到二进制 payload，减少 raw 像素承载开销。
完成内容：
- `apps/windows-wgc-helper` 新增 `--protocol json-lines-v1|binary-frame-v1` 和 `LAN_DUAL_WGC_HELPER_PROTOCOL`；旧 `json-lines-v1` 保持不变，`binary-frame-v1` 会输出一行 JSON header 后紧跟原始 payload。
- Windows host 为普通 WGC JPEG helper 保持 `json-lines-v1`；当会话走 `--wgcH264Source raw-bgra` 时默认请求 `binary-frame-v1`，并在 `/discovery.capabilities.screen.wgc.helperProtocol` 暴露计划协议。
- Node host stdout parser 同时兼容 JSON 行和 binary-frame，raw-bgra binary payload 直接作为 `Buffer` 喂给 FFmpeg，不再先 base64 解码。
- `test-windows-wgc-mode` 的 mock helper 支持 `binary-frame-v1`，raw-bgra H.264 bridge 合同会断言 helperProtocol；`test-windows-wgc-helper` 新增 helper mock binary raw 合同解析。
- 文档同步为：raw 二进制管道已完成，下一步转 NV12/helper 原生硬编和 Mac client 真连观感/资源对照。
修改文件：
- `apps/windows-wgc-helper/src/main.rs`
- `apps/windows-host/src/windows-screen-capture.mjs`
- `scripts/windows/test-windows-wgc-mode.mjs`
- `scripts/windows/test-windows-wgc-helper.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `cargo fmt --check` / `cargo check --quiet` in `apps/windows-wgc-helper`
- `node --check apps/windows-host/src/windows-screen-capture.mjs`
- `node --check scripts/windows/test-windows-wgc-mode.mjs`
- `node --check scripts/windows/test-windows-wgc-helper.mjs`
- `node scripts/windows/test-windows-wgc-mode.mjs --mockHelper --h264Bridge --durationMs 2200 --minFrames 2 --h264Source raw-bgra --width 320 --height 180`：45 帧通过，pipeline=`windows-wgc-helper-raw-bgra-ffmpeg-h264`。
- `node scripts/windows/test-windows-wgc-helper.mjs --skipRealCapture --skipRealHostIntegration --observerDurationMs 1400 --minObserverFrames 2`：helper build/probe、mock JSON、mock binary raw 2 帧、mock Node host 43 帧通过。
- 真实 helper + `h264_nvenc` raw-bgra binary 短观察：`320x180` 2.5 秒 46 帧、约 18.28 FPS；`1280x720` 两轮 2.2 秒短测均为 66 帧、约 29.6-30.0 FPS，`helperProtocol=binary-frame-v1`，pipeline=`windows-wgc-helper-raw-bgra-ffmpeg-h264`。
遗留问题：
- 这仍然是 helper CPU readback + raw BGRA stdin + FFmpeg/NVENC 桥接，不是最终最省资源形态；最新 720p 静态桌面复验 fresh helper frame 2、repeat full 64，pacing 能补到约 30 FPS，但真实源帧仍受桌面变化和 WGC `FrameArrived` 节奏影响。
- 未做 Mac client 真连主观观感和资源对照；也未改共享 WebSocket 协议。
下一步建议：
- 继续推进 WGC helper 输出 NV12 或 helper 原生硬编，减少 BGRA->FFmpeg 转换成本。
- 让 Mac client 真实连接 Windows host，对比 WGC raw-bgra binary H.264、ffmpeg-h264、binary-h264 和 JPEG fallback 的画质、延迟、带宽、CPU。
是否改了协议：否。只改 Windows host 与 WGC helper 的内部 stdout 合同，远控 WebSocket 协议未变。
是否需要另一端配合：代码改动本身不需要；真连观感验收需要 Mac client 连接 Windows host。

## 2026-06-15 Mac Codex

日期：2026-06-15 11:33
开发端：Mac Codex
本轮目标：按用户反馈修正 Mac 侧 `--promptPassword` 在 Codex 桌面里只等终端隐藏输入、用户看不到输入位置的问题。
完成内容：
- 新增 `scripts/mac/password-prompt.mjs` 共享 helper：需要密码时先播放提示音，再把 macOS 隐藏密码对话框激活到前台；密码只返回给当前 Node 进程，不打印、不写命令参数、不发联络板。
- `scripts/mac/start-mac-host.mjs`、`scripts/mac/check-mac-host-readiness.mjs`、`scripts/mac/check-mac-formal-local-smoke.mjs` 的 `--promptPassword` 已统一接入该 helper；`--json` 路径不会把提示文字写到 stdout。
- 新增 `scripts/mac/test-mac-password-prompt.mjs`，用假的 `osascript` 覆盖提示音、弹窗成功、用户取消和弹窗失败路径；测试只校验密码长度/哈希，不输出密码正文。
- 旧的自动化非交互失败测试改为显式设置 `LAN_DUAL_DISABLE_PASSWORD_DIALOG=1` / `LAN_DUAL_DISABLE_PASSWORD_BEEP=1`，避免回归测试时误弹真实系统窗口；人工正式运行不设置这些变量，会正常响铃并弹窗。
- 文档同步说明 Mac 侧正式密码输入会弹 macOS 隐藏密码框，避免再让用户去终端里找输入位置。
修改文件：
- `scripts/mac/password-prompt.mjs`
- `scripts/mac/start-mac-host.mjs`
- `scripts/mac/check-mac-host-readiness.mjs`
- `scripts/mac/check-mac-formal-local-smoke.mjs`
- `scripts/mac/test-mac-password-prompt.mjs`
- `scripts/mac/test-mac-host-start-helper.mjs`
- `scripts/mac/test-mac-readiness-prompt-password.mjs`
- `scripts/mac/test-mac-formal-local-smoke.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check` 覆盖上述新增/修改脚本。
- `node scripts/mac/test-mac-password-prompt.mjs --timeoutMs 8000`
- `node scripts/mac/test-mac-readiness-prompt-password.mjs --timeoutMs 8000`
- `node scripts/mac/test-mac-formal-local-smoke.mjs --timeoutMs 20000`
遗留问题：
- 本轮未跑真实正式密码 smoke，避免在用户未明确要求时触发真实认证链路；如需执行，可运行 `node scripts/mac/check-mac-formal-local-smoke.mjs --promptPassword --json`，此时会先响铃并把 macOS 密码框激活到前台。
- 不执行 `inject`；真实注入仍需用户明确确认正在看屏幕。
下一步建议：
- 正式 E2E 前先跑 `node scripts/mac/check-mac-formal-e2e-status.mjs --boardSummary`，再根据需要运行 Mac 本机 smoke 或通知 Windows 端用 formal runner。
是否改了协议：否。
是否需要另一端配合：不需要；这是 Mac 侧用户输入体验与安全回归改进。

## 2026-06-15 Windows Codex

日期：2026-06-15 11:10
开发端：Windows Codex
本轮目标：给 Windows 正式 Mac E2E 预检/聚合脚本增加可直接发联络板的无密摘要，减少双端手工同步。
完成内容：
- `scripts/windows/check-mac-formal-e2e.mjs` 新增 `--boardSummary`；`--preflightOnly --boardSummary` 只读 `/discovery` 后输出一段 Agent Link Board 可用摘要，不要求密码、不认证、不执行输入。
- `--preflightOnly --json` 同步包含 `boardSummary` 字段，方便自动化或联络板脚本消费。
- 正式聚合路径带 `--boardSummary` 时，全部子探针完成后会输出完成摘要；密码仍只通过 `LAN_DUAL_PASSWORD` 传给子进程，不放命令参数。
- `scripts/windows/test-mac-formal-e2e-preflight.mjs` 增加离线 board summary、mock board summary、JSON summary 字段和 mock 快速路径完成摘要回归，并验证不泄露密码。
- 真实 Mac host 只读预检摘要通过：`192.168.31.122:43770` ready，runtime build `d807536`，权限全绿，H.264/系统 PCM/文本剪贴板/文件剪贴板开启，`inputMode=log`，`mock=off`。
修改文件：
- `scripts/windows/check-mac-formal-e2e.mjs`
- `scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-mac-formal-e2e.mjs`
- `node --check scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script check-mac-formal-e2e.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script test-mac-formal-e2e-preflight.mjs`
- `node scripts/windows/test-mac-formal-e2e-preflight.mjs`
- `node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --preflightOnly --boardSummary`
遗留问题：
- 本轮仍未跑正式认证和 5-10 分钟长测，因为需要用户在 Windows 本机安全输入 Mac host 正式密码；密码不要发到聊天或联络板。
- 未执行 `inject`，仍需用户明确确认并在屏幕前看护后才可做真实注入验收。
下一步建议：
- 用户准备好时，在 Windows 本机运行 `node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --promptPassword`，隐藏输入正式密码后执行正式 E2E。
- 执行前可先把 `--preflightOnly --boardSummary` 输出发到联络板，确认 Mac 侧状态仍 ready。
是否改了协议：否。
是否需要另一端配合：代码改动本身不需要；正式 E2E 仍需要用户输入正式密码，并需要 Mac host 保持在线。

## 2026-06-15 Mac Codex

日期：2026-06-15 10:45
开发端：Mac Codex
本轮目标：新增正式 Windows E2E 前的 Mac 本机安全短验收聚合脚本，先在 Mac 侧串 H.264、PCM 和 input-log。
完成内容：
- 新增 `scripts/mac/check-mac-formal-local-smoke.mjs`，复用 `observe-mac-video`、`observe-mac-audio` 和 `smoke-mac-input-log`，默认串联 H.264、系统 PCM 和安全 `inputMode=log` 输入 ack。
- 默认要求正式密码来自 `LAN_DUAL_PASSWORD` 或 `--promptPassword`，拒绝空密码和 `demo-password`；密码只通过 `LAN_DUAL_PASSWORD` 环境变量传给子探针，不放进命令参数。
- 支持 `--json` 输出结构化报告和 `boardSummary`；失败 JSON 可解析，错误文本会 redaction 环境密码或显式 `--password`。
- 不启动 Mac host、不重启当前正式 host、不切 `inject`、不打印密码；`--allowDemoPassword` 只建议用于本地假服务测试。
- 新增 `scripts/mac/test-mac-formal-local-smoke.mjs`，用临时假 Mac host 覆盖帮助、密码安全失败、demo 密码默认拒绝、全跳过 JSON、显式 fake demo 放行和三探针聚合成功。
修改文件：
- `scripts/mac/check-mac-formal-local-smoke.mjs`
- `scripts/mac/test-mac-formal-local-smoke.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-formal-local-smoke.mjs`
- `node --check scripts/mac/test-mac-formal-local-smoke.mjs`
- `node scripts/mac/test-mac-formal-local-smoke.mjs --timeoutMs 30000`
遗留问题：
- 本轮未对真实 `192.168.31.122:43770` 跑正式本机 smoke，因为需要用户输入正式密码；若要执行，先提醒用户并用 `--promptPassword` 隐藏输入。
- 本轮未执行 `inject`，仍需用户明确确认后才可做真实注入验收。
下一步建议：
- 正式 call Windows 前：先跑 `node scripts/mac/check-mac-formal-e2e-status.mjs --boardSummary`；如需 Mac 本机也先短验收，再跑 `node scripts/mac/check-mac-formal-local-smoke.mjs --promptPassword`。
- Windows 端已具备 `scripts/windows/check-mac-formal-e2e.mjs`，用户在 Windows 本机安全输入正式密码后可继续正式 E2E。
是否改了协议：否。
是否需要另一端配合：代码改动本身不需要；正式 E2E 仍需要 Windows 端用正式密码配合。

## 2026-06-15 Mac Codex

日期：2026-06-15 10:20
开发端：Mac Codex
本轮目标：新增正式端到端验收前的 Mac 侧清单状态工具，减少白天恢复时手工判断是否可以 call Windows。
完成内容：
- 新增 `scripts/mac/check-mac-formal-e2e-status.mjs`：复用 `check-mac-resume-status --json`，只读生成正式 E2E checklist，覆盖 repo、Agent Link Board、Mac host、LAN 地址、`inputMode=log`、屏幕录制/辅助功能/输入监控、H.264、系统 PCM、剪贴板、显示器和 buildDiff。
- 输出 `readyToCall`、`counts`、`checklist`、`callText` 和 `boardSummary`；`--boardSummary` 可直接发送到联络板，`--json` 可供自动化读取。
- 默认检查 Agent Link Board；离线 host、脏工作区、不可读联络板、缺权限/能力会形成 blocker 或 warning。开发中本地预览可用 `--allowDirty`，正式 call 前不应放宽。
- 脚本不启动服务、不认证 WebSocket、不要求或打印密码、不发送输入事件；`inject` 明确标为跳过，仍需用户另行明确确认。
- 新增 `scripts/mac/test-mac-formal-e2e-status.mjs`，覆盖帮助、离线 blocker、在线 checklist shape、board summary 和 secret-like 文本不泄露。
修改文件：
- `scripts/mac/check-mac-formal-e2e-status.mjs`
- `scripts/mac/test-mac-formal-e2e-status.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-formal-e2e-status.mjs`
- `node --check scripts/mac/test-mac-formal-e2e-status.mjs`
- `node scripts/mac/test-mac-formal-e2e-status.mjs --requireOnline --timeoutMs 12000`
- `node scripts/mac/check-mac-formal-e2e-status.mjs --boardSummary --allowDirty --timeoutMs 8000`
遗留问题：
- 当前正式 Mac host 仍在线 `192.168.31.122:43770`，runtime build 是 `d807536`，repo 当前为 `24e588f` 加本轮 WIP；`d807536..24e588f` 无 Mac host runtime 源码变化，清单会把它作为 stale metadata warning。
- 正式 Windows 侧发现/认证/H.264 5-10 分钟/音频/剪贴板/input-log 仍需 Windows Codex 下一轮配合；本轮未执行 inject。
下一步建议：
- 白天恢复后先跑 `node scripts/mac/check-mac-formal-e2e-status.mjs --boardSummary`，如果 `readyToCall=true` 再把摘要发联络板并 call Windows。
- Windows 端继续连接 `192.168.31.122:43770` 做正式发现、认证、H.264 5-10 分钟、音频、剪贴板和 input-log；inject 仍需用户明确确认。
是否改了协议：否。
是否需要另一端配合：代码改动本身不需要；正式 E2E 仍需要 Windows 端配合。

## 2026-06-15 Windows Codex

日期：2026-06-15 09:40
开发端：Windows Codex
本轮目标：把 WGC H.264 桥从 JPEG 正确性原型推进到 raw-bgra 正确性原型，先跳过 helper 侧 JPEG 编码/FFmpeg 侧 JPEG 解码。
完成内容：
- `apps/windows-wgc-helper` 新增 `--outputFormat jpeg|bgra` 和 `LAN_DUAL_WGC_OUTPUT_FORMAT`；默认仍是 JPEG，显式 `bgra` 时输出 `codec=raw-bgra`、`pixelFormat=bgra` 的 JSON 行 base64 raw 像素。
- Windows host 新增 `LAN_DUAL_WINDOWS_WGC_H264_SOURCE=jpeg|raw-bgra`，`raw-bgra` 时 helper 环境自动切到 `LAN_DUAL_WGC_OUTPUT_FORMAT=bgra`，FFmpeg stdin 使用 `-f rawvideo -pix_fmt bgra -video_size WxH`，输出 `capturePipeline=windows-wgc-helper-raw-bgra-ffmpeg-h264`。
- `observe-windows-host-video` 新增 `--wgcH264Source`，`start-windows-host.mjs` / PowerShell 包装新增 `--wgcH264Source` / `-WgcH264Source`。
- `test-windows-wgc-mode` 的 mock helper 可输出 raw BGRA，并覆盖 raw-bgra H.264 bridge 合同。
- 文档更新为：raw-bgra JSON/base64 原型已完成，下一步应做二进制 raw 管道、NV12 或 helper 原生硬编。
修改文件：
- `apps/windows-wgc-helper/src/main.rs`
- `apps/windows-host/src/windows-screen-capture.mjs`
- `scripts/windows/observe-windows-host-video.mjs`
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `scripts/windows/test-windows-wgc-mode.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check`：Windows screen capture、observe、start helper、WGC mode test、start helper test。
- `cargo check`、`cargo build` in `apps/windows-wgc-helper`。
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`。
- `node scripts/windows/test-windows-wgc-mode.mjs --mockHelper --h264Bridge --durationMs 2000 --minFrames 3 --h264Source jpeg`。
- `node scripts/windows/test-windows-wgc-mode.mjs --mockHelper --h264Bridge --durationMs 2000 --minFrames 3 --h264Source raw-bgra --width 320 --height 180`。
- `apps/windows-wgc-helper/target/debug/lan-dual-wgc-helper.exe --mock --frames 1 --width 16 --height 16 --outputFormat bgra`。
- 真实 helper + `h264_nvenc` raw-bgra 短观察：`320x180` 2.5 秒 76 帧、约 30.23 FPS；`1280x720` 1.8 秒最终复验 44 帧、约 24.29 FPS，pipeline=`windows-wgc-helper-raw-bgra-ffmpeg-h264`。
遗留问题：
- raw-bgra 当前仍通过 JSON/base64 传输 raw 像素，720p 下 fresh helper frame 只有 6 帧，其余依赖 repeat full 补 pacing；这是正确性原型，不是最终性能形态。
- 仍未做 Mac client 真连观感、5-10 分钟长稳、资源占用和动态画面对照。
下一步建议：
- 不要继续深调 JSON raw；优先做 helper -> host 的二进制 raw 管道，或直接改 NV12 / helper 原生 H.264 硬编。
- 待 Mac 正式密码通道在线后，再做 Windows 控制端发现、正式认证、H.264 5-10 分钟、音频、剪贴板和 input log 验收。
是否改了协议：没有改共享远控协议；仅新增 Windows 端本机 helper/启动/观察参数和诊断字段。
是否需要另一端配合：暂不需要；下一步 Mac client 真连观感验收需要 Mac 端配合。

## 2026-06-15 Mac Codex

日期：2026-06-15 09:55
开发端：Mac Codex
本轮目标：给 Mac 恢复状态脚本补一个可直接发送到联络板的秘密安全摘要，减少正式验收前手工拼状态。
完成内容：
- `scripts/mac/check-mac-resume-status.mjs` 新增 `--boardSummary`，在不启动服务、不认证 WebSocket、不要求密码、不发送输入事件的前提下，输出一段适合直接发到 Agent Link Board 的短摘要。
- 摘要包含 repo clean/dirty、Mac host 地址、runtime build、inputMode、权限、H.264、音频、采集管线、显示器、buildDiff 和正式验收下一步。
- 离线 host 时摘要会提示先用 `start-mac-host --promptPassword --requirePassword` 正式安全启动。
- JSON 报告新增 `boardSummary` 字段，便于脚本自动化读取同一段摘要；摘要不包含密码、系统账号、联络板 token 或 server URL。
- `scripts/mac/test-mac-resume-status.mjs` 补离线/在线 `--boardSummary`、JSON 内嵌摘要和 secret-like 文本不泄露断言。
修改文件：
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-resume-status.mjs`
- `node --check scripts/mac/test-mac-resume-status.mjs`
- `node scripts/mac/check-mac-resume-status.mjs --boardSummary --timeoutMs 3000`
- `node scripts/mac/check-mac-resume-status.mjs --json --timeoutMs 3000`
- `node scripts/mac/test-mac-resume-status.mjs --requireOnline --timeoutMs 10000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 5000`
- `git diff --check`
- 冲突标记搜索
遗留问题：
- 当前正式 Mac host 仍在线 `192.168.31.122:43770`，runtime build 仍是 `d807536`，repo 当前为 `186cb45`，但 `d807536..186cb45` 无 Mac host runtime 源码变化；本轮未重启 host，也未执行 `inject`。
- Windows 端正式 E2E 仍等待 Windows Codex 从 WGC raw/NVENC 工作切换或回复。
下一步建议：
- 需要同步状态时可直接运行 `node scripts/mac/check-mac-resume-status.mjs --checkBoard --boardSummary`，再把输出发给 Windows Codex。
- Windows 可继续按现有 call 连接 `192.168.31.122:43770` 做发现、正式认证、H.264 5-10 分钟、音频、剪贴板和 input-log；`inject` 仍需用户明确确认。
是否改了协议：否。
是否需要另一端配合：代码改动本身不需要；正式 E2E 仍需要 Windows 端配合。

## 2026-06-15 Mac Codex

日期：2026-06-15 09:45
开发端：Mac Codex
本轮目标：修正正式密码 Mac host 深度 readiness 容易被默认 `demo-password` 误判的问题，并减少探针密码暴露面。
完成内容：
- `scripts/mac/check-mac-host-readiness.mjs` 新增 `--promptPassword`，可在交互终端隐藏输入探针密码，适合正式密码 host 的 `--probeVideo` / `--probeAudio` / `--probeInputLog` / `--profile deploy`。
- readiness 子探针不再通过 `--password <value>` argv 传递密码，改用 `LAN_DUAL_PASSWORD` 环境变量传给 `check-mac-displays`、`observe-mac-video`、`observe-mac-audio` 和 `smoke-mac-input-log`。
- `observe-mac-video`、`observe-mac-audio`、`smoke-mac-input-log` 默认读取 `LAN_DUAL_PASSWORD`，仍保留显式 `--password` 兼容旧调用。
- 新增 `scripts/mac/test-mac-readiness-prompt-password.mjs`，覆盖非交互提示失败、JSON stdout 不混入提示、互斥参数不泄露密码、JSON 摘要不含密码、readiness 不再把密码放进子探针 argv。
- 文档同步说明正式密码深度验收可用 `--promptPassword`，避免刚才默认 demo 密码导致的 H.264/audio/input-log 误报超时。
修改文件：
- `scripts/mac/check-mac-host-readiness.mjs`
- `scripts/mac/observe-mac-video.mjs`
- `scripts/mac/observe-mac-audio.mjs`
- `scripts/mac/smoke-mac-input-log.mjs`
- `scripts/mac/test-mac-readiness-prompt-password.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-host-readiness.mjs`
- `node --check scripts/mac/observe-mac-video.mjs`
- `node --check scripts/mac/observe-mac-audio.mjs`
- `node --check scripts/mac/smoke-mac-input-log.mjs`
- `node --check scripts/mac/test-mac-readiness-prompt-password.mjs`
- `node scripts/mac/test-mac-readiness-prompt-password.mjs --timeoutMs 10000`
- `node scripts/mac/test-mac-video-json-output.mjs --timeoutMs 10000`
- `node scripts/mac/test-mac-audio-json-output.mjs --timeoutMs 10000`
- `node scripts/mac/test-mac-input-log-json-output.mjs --timeoutMs 10000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 5000`
- `node scripts/mac/test-mac-readiness-json-details.mjs --timeoutMs 12000`
- `node scripts/mac/check-mac-host-readiness.mjs --requireOpen --requireControlPermissions --requireInputMonitoring --requireCurrentBuildId --timeoutMs 20000`
- `git diff --check`
- 冲突标记搜索
遗留问题：
- 当前正式 Mac host 仍在线 `192.168.31.122:43770`，`build=d807536`，`inputMode=log`，权限全绿；本轮未重启 host，也未执行真实 `inject`。
- 真正的 Windows 侧 E2E 长测还在等待 Windows Codex 从 WGC raw WIP 切换或回复。
下一步建议：
- Windows 端准备验收时，继续连接 `192.168.31.122:43770` 做发现、正式认证、H.264 5-10 分钟、音频、剪贴板和 input-log；`inject` 仍需用户明确确认。
- Mac 端若需本机正式密码深度验收，可运行 `node scripts/mac/check-mac-host-readiness.mjs --promptPassword --profile deploy --timeoutMs 30000`。
是否改了协议：否。
是否需要另一端配合：需要 Windows 端继续正式 E2E 验收 call；本轮代码改动本身不需要 Windows 端修改。

## 2026-06-15 Mac Codex

日期：2026-06-15 09:00
开发端：Mac Codex
本轮目标：补一个恢复开工/正式验收前的 Mac 侧轻量总览，减少双方早上恢复时靠聊天猜当前状态。
完成内容：
- 新增 `scripts/mac/check-mac-resume-status.mjs`。
- 脚本只读汇总当前 git 分支/干净状态、可选 Agent Link Board 快照、Mac host `/discovery` 在线状态、runtime、权限、能力、显示器、LAN 地址，以及运行中 build 到当前 git 的 Mac host runtime 源码差异。
- 支持 `--json` 输出机器可读报告；支持 `--requireClean`、`--requireOnline`、`--requireNoRuntimeChanges` 把未提交改动、离线 host 或运行源码变化升级为失败。
- 不启动服务、不认证 WebSocket、不要求或打印密码、不发送输入事件，适合恢复工作前、发状态前或正式密码端到端验收前先跑。
- 新增 `scripts/mac/test-mac-resume-status.mjs`，覆盖帮助、离线 JSON、`--requireOnline` 失败、在线 JSON 字段形状和输出不回显无关 secret-like 文本。
修改文件：
- `scripts/mac/check-mac-resume-status.mjs`
- `scripts/mac/test-mac-resume-status.mjs`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/mac/check-mac-resume-status.mjs`
- `node --check scripts/mac/test-mac-resume-status.mjs`
- `node scripts/mac/check-mac-resume-status.mjs --json --timeoutMs 5000`
- `node scripts/mac/test-mac-resume-status.mjs --timeoutMs 10000`
- `node scripts/mac/test-mac-script-help.mjs --timeoutMs 5000`
- `node scripts/mac/check-mac-resume-status.mjs --checkBoard --timeoutMs 8000`
- `git diff --check`
- 冲突标记搜索
遗留问题：
- 当前本机 `127.0.0.1:43770` 报告为离线；脚本按预期给出安全启动建议。正式端到端验收前需要用户确认/输入正式密码后用 `start-mac-host --promptPassword --requirePassword` 启动。
- 该脚本只是轻量总览，不替代 `check-mac-host-readiness --profile deploy/deep` 或 Windows 控制端正式认证验收。
下一步建议：
- 白天恢复时先跑 `node scripts/mac/check-mac-resume-status.mjs --checkBoard` 并把结果同步到联络板。
- 如果 host 离线，先正式密码启动 Mac host；如果 host 在线且无 runtime 源码差异，再按联络板顺序做 Windows 发现、正式认证、H.264 5-10 分钟、音频、剪贴板和 input log。
是否改了协议：否。
是否需要另一端配合：暂不需要；正式密码 E2E 验收时需要 Windows 端配合。

## 2026-06-15 Windows Codex

日期：2026-06-15 09:35
开发端：Windows Codex
本轮目标：做一个低风险 WGC helper 接 FFmpeg/NVENC H.264 的最小原型，验证“WGC 来源 + H.264 输出”链路是否能通。
完成内容：
- Windows host 新增显式 `LAN_DUAL_WINDOWS_WGC_H264_BRIDGE=1` / `--wgcH264Bridge` 开关；仅在 `screenMode=wgc` 且会话请求 H.264 时启用。
- 新增 `windows-wgc-helper-ffmpeg-h264` 管线：从 WGC helper JSON 行 JPEG 帧读取，写入 FFmpeg stdin，再复用现有 H.264 Annex B 分包、`codecString`、`h264Encoder` 和 binary-h264 传输能力。
- WGC diagnostics 新增 `h264BridgeEnabled`、`h264BridgeAvailable`、`h264BridgeEncoder`、`h264BridgePipeline`，session/frame 会回传实际 pipeline 和 encoder。
- `observe-windows-host-video` 新增 `--wgcH264Bridge true`；`test-windows-wgc-mode` 新增 `--h264Bridge` 合同自测。
- `start-windows-host.mjs` 和 `start-windows-host.ps1` 新增 `--wgcHelper` / `-WgcHelper`、`--wgcH264Bridge` / `-WgcH264Bridge`、`--wgcRepeatLastFrame` / `-WgcRepeatLastFrame` 和 repeat mode 参数。
修改文件：
- `apps/windows-host/src/windows-screen-capture.mjs`
- `scripts/windows/observe-windows-host-video.mjs`
- `scripts/windows/test-windows-wgc-mode.mjs`
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
- `node --check` 相关 Windows host/脚本文件
- PowerShell AST 解析 `start-windows-host.ps1`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-wgc-mode.mjs --mockHelper --h264Bridge --durationMs 3000 --minFrames 5`
- PowerShell 包装 dry run 验证 WGC bridge 参数透传
- 真实 WGC helper + `h264_nvenc` 短观察：1280x720、30Hz、50Mbps、repeat full，3 秒 91 帧、约 30.29 FPS、最大间隔 59ms、平均帧年龄 1ms，pipeline=`windows-wgc-helper-ffmpeg-h264`
遗留问题：
- 这是 JPEG 桥接原型：WGC helper 先编码 JPEG，FFmpeg 再解码并编码 H.264，存在重复编解码开销，不应作为最终低延迟实现。
- 16x16 mock helper 对 NVENC 不具代表性；真实 720p helper + NVENC 已通过短测。
下一步建议：
- 优先让 WGC helper 输出 raw BGRA/NV12 给 FFmpeg，或直接在原生层接硬件编码；随后跑 Mac client 真连观感、资源和 5-10 分钟长稳。
是否改了协议：否。新增字段均为 capabilities/session/frame 诊断兼容字段。
是否需要另一端配合：暂不需要；后续 Mac client 真连观感验收需要 Mac 端配合。

## 2026-06-15 Windows Codex

日期：2026-06-15 01:20
开发端：Windows Codex
本轮目标：把联络板里的“需要用户授权/卡住”提醒收口，减少 Mac 端出现授权弹窗、502 或长时间无状态更新时 Windows 端错过消息。
完成内容：
- 联络板网页新增授权/卡住提醒面板，可开启声音和浏览器桌面通知。
- 网页会识别 `NEED_USER_AUTH`、`USER_ACTION_REQUIRED`、`BLOCKED_BY_PERMISSION`、授权/权限关键词、502、Bad Gateway 和 Gateway Timeout。
- 网页会把 `coding`、`testing`、`waiting`、`ready` 状态超过阈值未更新的设备标红，并触发顶部提醒；默认阈值 5 分钟，可在页面调整。
- 新增 Windows watcher：`scripts/windows/start-mac-alert-watcher.ps1` 后台启动，`scripts/windows/watch-codex-link-mac-alerts.ps1` 前台调试；用于在 Windows 本机弹窗提醒 Mac 侧需要处理或长时间无更新。
- `docs/LAN_CODEX_LINK.md` 和 `docs/TEST_COORDINATION.md` 已补高优先级提醒格式、触发词和 watcher 使用方式。
修改文件：
- `scripts/codex-link-server.mjs`
- `scripts/windows/start-mac-alert-watcher.ps1`
- `scripts/windows/watch-codex-link-mac-alerts.ps1`
- `docs/LAN_CODEX_LINK.md`
- `docs/TEST_COORDINATION.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/codex-link-server.mjs`
- PowerShell AST 解析两个 watcher 脚本
- 静态搜索确认没有把真实 token、密码或密钥打印到日志/文档
- `git diff --check`
- 冲突标记搜索
遗留问题：
- 浏览器桌面通知需要用户在联络板页面点击“开启声音/桌面提醒”并授权浏览器通知。
- watcher 若传入 `-Token`，token 会作为本机进程参数存在；只在可信个人机器上使用，不要把 token 写入联络板消息或文档。
下一步建议：
- 白天恢复工作时，两端先打开联络板；Windows 浏览器点一次“开启声音/桌面提醒”，再用 `USER_ACTION_REQUIRED` 发测试消息确认提醒能弹出。
是否改了协议：否。
是否需要另一端配合：需要 Mac 端后续按新格式发送 `NEED_USER_AUTH` / `USER_ACTION_REQUIRED` 类消息；不需要立即联调。

## 2026-06-15 Windows Codex

日期：2026-06-15 00:58
开发端：Windows Codex
本轮目标：把现有 Windows `ffmpeg-h264` 过渡路径从固定 `libx264` 扩展为可选 FFmpeg H.264 encoder，并先验证 `h264_nvenc`，为下一步 WGC 采集源接 NVENC 做准备。
完成内容：
- Windows host 新增 `LAN_DUAL_WINDOWS_H264_ENCODER`，默认仍为 `libx264`，可显式选择 `h264_nvenc`、`h264_qsv`、`h264_amf`、`h264_mf`、`h264_d3d12va` 等 FFmpeg encoder。
- `ffmpeg-h264` 的 FFmpeg 输出参数按 encoder 分流：`libx264` 保持原有 ultrafast/zerolatency/baseline/repeat headers；`h264_nvenc` 使用低延迟 CBR 参数；其他硬编入口走保守通用参数。
- `/discovery.capabilities.screen`、`session_answer`、`display_settings_ack` 和 H.264 `video_frame` 都会带 `h264Encoder`，方便确认实际运行的编码器。
- Windows 启动助手、PowerShell 包装、视频观察脚本、H.264 自检、Mac client 页面自检和视频传输矩阵都支持 `--h264Encoder` / `-H264Encoder`。
- Windows host README、CURRENT_STATUS、NEXT_ACTIONS 和任务板已同步：明确本轮是 gdigrab H.264 过渡路径的 encoder 选择与 NVENC 验证，真正低延迟路线仍是 WGC 采集源接 NVENC。
修改文件：
- `apps/windows-host/src/windows-screen-capture.mjs`
- `apps/windows-host/src/windows-host-service.mjs`
- `scripts/windows/observe-windows-host-video.mjs`
- `scripts/windows/test-windows-h264-mode.mjs`
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/start-windows-host.ps1`
- `scripts/windows/test-mac-client-browser.mjs`
- `scripts/windows/test-mac-client-video-transports.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check` 相关 Windows host 与脚本文件
- `npm.cmd --prefix apps/windows-host run check`
- `node scripts/windows/start-windows-host.mjs --dryRun --screenMode ffmpeg-h264 --h264Encoder h264_nvenc`
- `node scripts/windows/test-windows-h264-mode.mjs --h264Encoder h264_nvenc --durationMs 2000 --minFrames 10 --minFps 5 --timeoutMs 60000 --captureTimeoutMs 12000`
- `node scripts/windows/test-mac-client-video-transports.mjs --h264Encoder h264_nvenc --timeoutMs 60000`
- `node scripts/windows/test-windows-script-help.mjs`
- `git diff --check`
- 冲突标记搜索
验证结果：
- NVENC H.264 短流通过：54 帧 / 26.99 FPS / 最大间隔 76ms，且 discovery/session/frame 诊断均能断言 `h264Encoder=h264_nvenc`。
- NVENC 视频传输矩阵 4/4 通过：`binary-h264` 页面观察 51 帧 / 907ms / 56.2 FPS，H.264 JSON/base64 54 帧 / 914ms / 59.1 FPS，H.264 fallback 53 帧 / 910ms / 58.2 FPS，`binary-jpeg` 11 帧 / 1208ms / 9.1 FPS。
- 默认 `libx264` 回归也已通过，未发现 H.264 基线路径退化。
遗留问题：
- 这轮仍使用 FFmpeg `gdigrab` 作为采集源，只验证 encoder 选择和 Mac client 接收链路；还不是 WGC + NVENC 真正低延迟原型。
- 联络板提醒功能已在后一轮独立收口，避免和 H.264 encoder 提交混在一起。
下一步建议：
- 下一轮 Windows 端优先把 WGC helper 的真实帧源接到 H.264/NVENC 输出，继续用 `test-mac-client-video-transports.mjs --h264Encoder h264_nvenc` 守住四条接收/回退路径。
- 做 WGC+NVENC 前后对照 `observe-windows-host-video --resourceSampleTree true --json`，记录帧率、最大间隔、帧新鲜度、带宽和资源占用。
是否改了协议：否；只向现有 discovery/session/frame 诊断增加向后兼容的 `h264Encoder` 字段。
是否需要另一端配合：暂不需要；真机 Mac client 连接 Windows host 做观感/延迟/带宽对照时需要 Mac 端配合。

## 2026-06-15 Windows Codex

日期：2026-06-15 00:15
开发端：Windows Codex
本轮目标：把 Windows 端 H.264/硬编路线的前置判断做成一键只读体检，避免后续 WGC 硬编原型靠猜。
完成内容：
- 新增 `scripts/windows/check-windows-video-encoder-support.mjs`。
- 脚本会汇总 FFmpeg H.264 编码器列表、Windows Graphics Capture 预检和浏览器 WebCodecs H.264 解码能力。
- 支持 `--json` 机器可读输出，支持 `--requireAnyH264`、`--requireHardwareH264`、`--requireWgc`、`--requireWebCodecsH264` 做强校验。
- 本机强校验确认 FFmpeg `8.1.1` 同时具备 `libx264` 软件编码和 `h264_nvenc`、`h264_qsv`、`h264_amf`、`h264_mf`、`h264_d3d12va` 等硬编入口；WGC 预检通过；Edge WebCodecs H.264 支持通过。
- 推荐下一步：WGC 采集接 NVENC H.264 原型，继续用 `test-mac-client-video-transports.mjs` 守住 binary-h264、JSON/base64、fallback 和 binary-jpeg 四条回归。
修改文件：
- `scripts/windows/check-windows-video-encoder-support.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-windows-video-encoder-support.mjs`
- `node scripts/windows/check-windows-video-encoder-support.mjs --help`
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-video-encoder-support.mjs`
- `node scripts/windows/check-windows-video-encoder-support.mjs --requireAnyH264 --requireHardwareH264 --requireWgc --requireWebCodecsH264`
- `node scripts/windows/check-windows-video-encoder-support.mjs --json`
- `node scripts/windows/test-windows-script-help.mjs`
- `git diff --check`
- 冲突标记搜索
遗留问题：
- 这轮只是能力体检和路线判断；还没有把 WGC 帧接到 NVENC/MediaFoundation/D3D12VA 编码器。
- FFmpeg 列出多个硬编入口不等于全部都能在当前屏幕采集路径上稳定工作，下一轮需要做最小 NVENC 原型并用矩阵回归确认。
下一步建议：
- Windows 端下一轮优先做 WGC + NVENC H.264 最小原型；若 NVENC 初始化失败，再按体检结果回退 QSV/AMF/MF/D3D12VA 或保留 libx264。
- 改编码路径后先跑 `check-windows-video-encoder-support`，再跑 `test-windows-h264-mode` 和 `test-mac-client-video-transports`。
是否改了协议：否。
是否需要另一端配合：暂不需要；真机观感和 Mac client 双机验收阶段需要 Mac 端配合。

## 2026-06-14 Windows Codex

日期：2026-06-14 23:55
开发端：Windows Codex
本轮目标：把 Mac client 视频传输四条关键路径封装成一个顺序矩阵回归，降低后续 WGC/H.264/二进制传输改动的漏测概率。
完成内容：
- 新增 `scripts/windows/test-mac-client-video-transports.mjs`。
- 默认顺序运行 4 个 `test-mac-client-browser.mjs` 页面级自检：`binary-h264`、H.264 JSON/base64 兼容路径、H.264 unsupported 后 MJPEG/JPEG fallback、`binary-jpeg`。
- 每个 case 自动分配独立 Windows host 端口、Mac client HTTP 端口和浏览器 debug 端口，避免并发或连续测试时端口互抢。
- 支持 `--case <id>`、`--skip <id>`、`--json`、`--verbose`、`--basePort`、`--clientPort`、`--debugPort`、`--timeoutMs` 和观察窗口/阈值参数。
- Windows host README、Mac client README、CURRENT_STATUS、NEXT_ACTIONS、任务板和 ACTIVE_LOCKS 已同步。
修改文件：
- `scripts/windows/test-mac-client-video-transports.mjs`
- `apps/windows-host/README.md`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-mac-client-video-transports.mjs`
- `node scripts/windows/test-mac-client-video-transports.mjs --help`
- `node scripts/windows/test-windows-script-help.mjs --script test-mac-client-video-transports.mjs`
- `node scripts/windows/test-mac-client-video-transports.mjs --timeoutMs 45000`
- `node scripts/windows/test-mac-client-video-transports.mjs --case h264-json --json --timeoutMs 45000`
验证结果：
- 单脚本 help 覆盖通过：`--help` 和 `-h` 都快速 0 退出。
- 完整视频传输矩阵 4/4 通过：
  - `binary-h264`：54 帧 / 909ms / 59.4 FPS，21 个二进制 H.264 帧。
  - H.264 JSON/base64：54 帧 / 905ms / 59.7 FPS。
  - H.264 unsupported fallback：53 帧 / 911ms / 58.2 FPS。
  - `binary-jpeg`：11 帧 / 1202ms / 9.2 FPS。
- `--json` 单项输出通过：`h264-json` case 返回纯 JSON 摘要，56 帧 / 908ms / 61.7 FPS。
遗留问题：
- 这是 Windows 本机临时 host + Mac client 页面级矩阵；真实 Mac 连接真实 Windows host 的观感、带宽、延迟和 CPU 对照仍需双机联调。
- `binary-jpeg` 仍受当前 WGC helper 静态桌面源帧节奏限制，矩阵只证明传输路径没坏，不代表源帧率已达到 60Hz。
下一步建议：
- 后续改视频传输、H.264、fallback、WGC repeat 或 binary frame 时优先跑 `test-mac-client-video-transports.mjs`，再继续推进 WGC H.264/硬编和真实 Mac client 观感验收。
是否改了协议：否。
是否需要另一端配合：暂不需要；真机观感验收需要 Mac 端后续配合。

## 2026-06-14 Windows Codex

日期：2026-06-14 23:20
开发端：Windows Codex
本轮目标：把可选 WebSocket 二进制视频帧从 JPEG 扩展到 H.264 Annex B payload，减少 `ffmpeg-h264` 路径的 base64 文本开销，同时保留旧 JSON/base64 兼容路径。
完成内容：
- Windows host 根据当前会话实际 `videoCodec` 选择视频传输：JPEG 会话可用 `binary-jpeg`，H.264 会话可用 `binary-h264`，否则继续 `json`。
- H.264 二进制帧沿用 `LDCV1\n + header length + JSON header + binary payload` 封装；JSON 头保留 `video_frame` 元数据并改为 `encoding=annexb-binary` / `videoTransport=binary-h264`，不再包含 base64 `payload`，payload 为原始 Annex B 字节。
- `/discovery.capabilities.videoTransports` 现在声明 `json`、`binary-jpeg`、`binary-h264`。
- Mac client 在支持二进制视频时，H.264 请求 `preferredVideoTransport=binary-h264`，JPEG/MJPEG 请求 `binary-jpeg`；`?binaryVideo=0` 或自检 `--disableBinaryVideo` 会只声明 `json`，回归旧 H.264 JSON/base64 路径。
- Mac client 可解析 H.264 binary frame，把二进制 Annex B payload 直接喂给 WebCodecs canvas；视频状态会显示 `h264/binary` 并统计二进制帧。
- `scripts/windows/test-mac-client-browser.mjs` 新增 `--expectBinaryH264Video` 和 `--disableBinaryVideo`，并修正实际 codec 为 JPEG fallback 时的 `display_settings_ack.videoTransport` 断言。
- 协议文档、Windows host README、Mac client README、CURRENT_STATUS、NEXT_ACTIONS 和任务板已同步。
修改文件：
- `apps/windows-host/src/windows-host-service.mjs`
- `apps/mac-client/app.js`
- `scripts/windows/test-mac-client-browser.mjs`
- `docs/03-architecture-and-protocol.md`
- `apps/windows-host/README.md`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-host/src/windows-host-service.mjs`
- `node --check apps/mac-client/app.js`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `npm.cmd --prefix apps/windows-host run check`
- `node scripts/windows/test-mac-client-browser.mjs --expectBinaryH264Video --allowClipboardFallback --skipFileClipboard --observeVideoMs 900 --minObservedVideoFrames 4 --minObservedVideoFps 4 --timeoutMs 45000`
- `node scripts/windows/test-mac-client-browser.mjs --expectH264Fallback --allowClipboardFallback --skipFileClipboard --observeVideoMs 900 --minObservedVideoFrames 4 --minObservedVideoFps 4 --timeoutMs 45000`
- `node scripts/windows/test-mac-client-browser.mjs --expectBinaryVideo --allowClipboardFallback --skipFileClipboard --observeVideoMs 1200 --minObservedVideoFrames 5 --minObservedVideoFps 5 --timeoutMs 45000`
- `node scripts/windows/test-mac-client-browser.mjs --screenMode ffmpeg-h264 --requireH264Video --disableBinaryVideo --allowClipboardFallback --skipFileClipboard --observeVideoMs 900 --minObservedVideoFrames 4 --minObservedVideoFps 4 --timeoutMs 45000`
验证结果：
- H.264 二进制路径通过：页面显示 `h264/binary`，短窗口 55 帧 / 911ms / 60.4 FPS，收到 23 个 binary H.264 帧。
- H.264 unsupported fallback 仍通过：最终显示 `jpeg/binary`，短窗口 52 帧 / 912ms / 57.0 FPS。
- WGC JPEG `binary-jpeg` 回归通过：短窗口 11 帧 / 1213ms / 9.1 FPS。
- H.264 JSON/base64 兼容路径通过：短窗口 54 帧 / 914ms / 59.1 FPS。
遗留问题：
- 这轮仍是 Windows 本机临时 host + Mac client 页面级自检；真实 Mac 上连接 Windows host 的观感、延迟、带宽和 CPU 对照仍需双机联调。
- `ffmpeg-h264` 仍使用软件编码；正式低延迟方向仍应推进 WGC H.264/硬编。
下一步建议：
- 继续推进 WGC H.264/硬编或轻量 repeat signal 与 `binary-h264` 的组合验证；让 Mac 端真实连接 Windows host 做观感、带宽、延迟和资源对照。
是否改了协议：是，向后兼容新增可选 `binary-h264` video transport 和 `annexb-binary` H.264 帧编码；旧 `annexb-base64` JSON 路径保留。
是否需要另一端配合：暂不需要；真实 Mac client 观感验收需要 Mac 端后续配合。

## 2026-06-14 Windows Codex

日期：2026-06-14 22:55
开发端：Windows Codex
本轮目标：确认 Windows `ffmpeg-h264` 的 WebCodecs 支持真相，并把 Mac client 页面级 H.264/Fallback 自检改成稳定、可解释的强校验。
完成内容：
- 新增 `scripts/windows/check-webcodecs-h264-support.mjs`：临时启动本机 Edge/Chrome 和一个 `127.0.0.1` 探针页面，调用 `VideoDecoder.isConfigSupported` 检查多组 `avc1.*` codecString 的 `annexb` 与默认 AVC 支持；支持 `--json`、`--requireAny`、`--requireCodec`。
- `scripts/windows/test-mac-client-browser.mjs` headless 默认不再追加 `--disable-gpu`，避免把 WebCodecs H.264 能力误判为 unsupported；需要复现旧环境时可显式用 `--disableGpu`。
- 页面自检新增 `--requireH264Video`，可要求 Mac client 必须显示 H.264 canvas，不允许回退 JPEG。
- 页面自检新增 `--forceH264Unsupported`，`--expectH264Fallback` 会自动启用它：保留 WebCodecs 对象，但让 `VideoDecoder.isConfigSupported` 对 H.264 返回 unsupported，从而稳定测试“浏览器拒绝 H.264 后请求 JPEG fallback”的路径，不再依赖禁 GPU 的偶然副作用。
- H.264 视频 frame age 断言改为等待诊断稳定后再检查，避免刚进入 `rendering` 状态时误判顶部状态还没来得及显示 `到达 <ms>`。
- Windows host README、Mac client README、CURRENT_STATUS、NEXT_ACTIONS 和 ACTIVE_LOCKS 已同步。
修改文件：
- `scripts/windows/check-webcodecs-h264-support.mjs`
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/windows-host/README.md`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/check-webcodecs-h264-support.mjs`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/check-webcodecs-h264-support.mjs --requireCodec avc1.42C02A`
- `node scripts/windows/check-webcodecs-h264-support.mjs --requireCodec avc1.42C02A --json`
- `node scripts/windows/test-mac-client-browser.mjs --screenMode ffmpeg-h264 --requireH264Video --allowClipboardFallback --skipFileClipboard --observeVideoMs 900 --minObservedVideoFrames 4 --minObservedVideoFps 4 --timeoutMs 45000`
- `node scripts/windows/test-mac-client-browser.mjs --expectH264Fallback --allowClipboardFallback --skipFileClipboard --observeVideoMs 900 --minObservedVideoFrames 4 --minObservedVideoFps 4 --timeoutMs 45000`
- `node scripts/windows/test-mac-client-browser.mjs --screenMode ffmpeg-h264 --disableWebCodecs --allowClipboardFallback --skipFileClipboard --observeVideoMs 900 --minObservedVideoFrames 4 --minObservedVideoFps 4 --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs`
验证结果：
- WebCodecs 探针通过：当前 Edge Headless `149.0.0.0` 对 `avc1.42C02A` 的 `annexb` 和默认 AVC 均返回 supported；默认列表里的 `avc1.420029`、`avc1.42E01F`、`avc1.42001E`、`avc1.42E01E`、`avc1.4D4029`、`avc1.640029` 也均 supported。
- H.264 canvas 强校验通过：页面显示 `h264 · 解码 #4 · 8 ms · 到达 2 ms`，短窗口 `55` 帧 / `906 ms` / `60.7 FPS`。
- 显式模拟 H.264 unsupported 的 fallback 通过：页面显示 `jpeg/binary`，短窗口 `54` 帧 / `903 ms` / `59.8 FPS`。
- 完全禁用 WebCodecs 的 fallback 通过：页面显示 `jpeg/binary`，短窗口 `52` 帧 / `902 ms` / `57.6 FPS`。
- Windows 脚本帮助覆盖已包含新探针：`23` 个脚本、`46` 条 `--help/-h` 命令通过。
遗留问题：
- 这轮确认的是 Windows 本机 Edge + 临时 Windows host 的 H.264 canvas 路径；真实 Mac 机器上的 Mac client 连接真实 Windows host 观感、延迟、带宽和 CPU 仍需双机联调。
- Windows `ffmpeg-h264` 仍是 FFmpeg/libx264 + JSON/base64 过渡路径；正式低延迟路线仍应推进 WGC H.264/硬编。
下一步建议：
- 继续做 WGC H.264/硬编，或让 Mac 端用真实 Mac client 连接 Windows host，对比 `--requireH264Video`、MJPEG fallback、binary-jpeg、WGC repeat signal 的观感与资源。
是否改了协议：否。
是否需要另一端配合：暂不需要；真机观感对照需要 Mac 端连接 Windows host。

## 2026-06-14 Windows Codex

日期：2026-06-14 22:30
开发端：Windows Codex
本轮目标：修复 Mac client 在浏览器不支持 Windows `ffmpeg-h264` 输出时触发 MJPEG/JPEG 回退后仍无画面的问题。
完成内容：
- `apps/windows-host/src/windows-screen-capture.mjs` 让 `ffmpeg-h264` 模式不再死守 H.264：当 `session_offer` 或后续 `display_settings` 明确请求 `preferredVideoCodec=mjpeg`、`videoCodec=mjpeg`、`preferredVideoEncoding=data-url` 等非 H.264 偏好时，当前会话会按 FFmpeg MJPEG/JPEG 管线输出。
- H.264 仍是默认行为：显式 `ffmpeg-h264` 启动且客户端没有 codec fallback 偏好时，仍返回 `h264` / `annexb-base64` / `windows-ffmpeg-gdigrab-h264`。
- `makeFfmpegKey` 增加 stream kind，避免同一 host 从 H.264 切 MJPEG 时复用旧 FFmpeg 进程。
- `scripts/windows/test-mac-client-browser.mjs` 新增 `--expectH264Fallback`，验证页面先尝试 H.264，浏览器拒绝当前 `codecString` 后发送 MJPEG fallback，并最终显示 JPEG 画面。
- 页面级高清设置断言会在 H.264 fallback 已发生时继续要求后续 `display_settings` 保持 `mjpeg/data-url`，避免切换分辨率后又回到不可解码的 H.264。
- Windows host README、Mac client README、协议文档、CURRENT_STATUS、NEXT_ACTIONS、任务板和 ACTIVE_LOCKS 已同步。
修改文件：
- `apps/windows-host/src/windows-screen-capture.mjs`
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/windows-host/README.md`
- `apps/mac-client/README.md`
- `docs/03-architecture-and-protocol.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-host/src/windows-screen-capture.mjs`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `npm.cmd --prefix apps/windows-host run check`
- `node scripts/windows/test-mac-client-browser.mjs --screenMode ffmpeg-h264 --disableWebCodecs --allowClipboardFallback --skipFileClipboard --observeVideoMs 900 --minObservedVideoFrames 4 --minObservedVideoFps 4 --timeoutMs 45000`
- `node scripts/windows/test-mac-client-browser.mjs --expectH264Fallback --allowClipboardFallback --skipFileClipboard --observeVideoMs 900 --minObservedVideoFrames 4 --minObservedVideoFps 4 --timeoutMs 45000`
- `node scripts/windows/test-windows-h264-mode.mjs --durationMs 1500 --minFrames 5 --minFps 5 --timeoutMs 45000`
验证结果：
- 禁用 WebCodecs 的直接 MJPEG fallback 通过：页面显示 `jpeg/binary`，短窗口 `55` 帧 / `915 ms` / `60.1 FPS`。
- 动态 H.264 fallback 通过：Edge/WebCodecs 拒绝 `avc1.42C02A` 后页面请求 MJPEG，Windows host 切到 `windows-ffmpeg-gdigrab-mjpeg`，页面显示 `jpeg/binary`，短窗口 `52` 帧 / `907 ms` / `57.3 FPS`。
- 独立 H.264 输出仍通过：`test-windows-h264-mode` 收到 `42` 帧 / `1.5s` / `27.73 FPS`，最大间隔 `55 ms`。
遗留问题：
- 当前 Windows H.264 仍是 FFmpeg/libx264 + JSON/base64 过渡路径；低延迟正式路线仍应推进 WGC H.264/硬编或更高效的二进制视频 payload。
- 本轮修复的是“解码失败后仍有画面”的可靠性，不代表当前浏览器环境已经能解码所有 H.264 `codecString`。
下一步建议：
- 继续做 Windows WGC H.264/硬编，或在真实 Mac client 连接真实 Windows host 时对照 MJPEG、binary-jpeg、H.264 和 fallback 的画面、延迟、带宽与 CPU。
是否改了协议：否；只更严格地消费已有 `preferredVideoCodec` / `videoCodec` / `preferredVideoEncoding` / `videoEncoding` 字段，并补充协议文档说明运行中 fallback 语义。
是否需要另一端配合：暂不需要；后续真机观感对照需要 Mac 端连接 Windows host。

## 2026-06-14 Windows Codex

日期：2026-06-14 22:15
开发端：Windows Codex
本轮目标：给 Windows host 和 Mac client 增加可选 WebSocket `binary-jpeg` 视频传输，减少 JPEG 帧 data URL/base64 文本开销。
完成内容：
- `apps/windows-host/src/websocket-codec.mjs` 新增 WebSocket binary frame 编码能力，文本控制消息仍走原有 JSON 文本帧。
- `apps/windows-host/src/windows-host-service.mjs` 新增 `preferredVideoTransport=binary-jpeg` 协商：客户端声明支持时，JPEG `video_frame` 会用 `LDCV1\n` magic + JSON 头长度 + JSON 元数据 + 原始 JPEG 字节发送；H.264、音频、输入、剪贴板和无图片 payload 的 repeat signal 仍保持原逻辑。
- `/discovery.capabilities.videoTransports` 暴露 `json` / `binary-jpeg`，`session_answer` 和 `display_settings_ack` 回传实际 `videoTransport`。
- `apps/mac-client/app.js` 声明 `preferredVideoTransport=binary-jpeg`，接收 WebSocket ArrayBuffer，解析 `binary-jpeg` 后用 object URL 显示 JPEG，并在视频状态/会话诊断中显示 `jpeg/binary` 和“二进制 N”；切 H.264、断开或重置时会释放旧 object URL。
- `scripts/windows/test-mac-client-browser.mjs` 新增 `--expectBinaryVideo`，浏览器侧 WebSocket 记录器可解析二进制视频头并统计 binary 帧；默认 session/display 设置断言也覆盖 `preferredVideoTransport`。
- 协议文档、Mac client README、Windows host README、CURRENT_STATUS、NEXT_ACTIONS、任务板和 ACTIVE_LOCKS 已同步。
修改文件：
- `apps/windows-host/src/websocket-codec.mjs`
- `apps/windows-host/src/windows-host-service.mjs`
- `apps/mac-client/app.js`
- `scripts/windows/test-mac-client-browser.mjs`
- `docs/03-architecture-and-protocol.md`
- `apps/windows-host/README.md`
- `apps/mac-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-host/src/websocket-codec.mjs`
- `node --check apps/windows-host/src/windows-host-service.mjs`
- `node --check apps/mac-client/app.js`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `npm.cmd --prefix apps/windows-host run check`
- `node scripts/windows/test-mac-client-browser.mjs --expectBinaryVideo --allowClipboardFallback --skipFileClipboard --observeVideoMs 1200 --minObservedVideoFrames 5 --minObservedVideoFps 5 --timeoutMs 45000`
- `node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --skipFileClipboard --disableWebCodecs --observeVideoMs 900 --minObservedVideoFrames 4 --minObservedVideoFps 4 --timeoutMs 45000`
验证结果：
- `--expectBinaryVideo` 通过：页面显示 `jpeg/binary`，初始视频约 `525 ms`，持续观察 `11` 帧 / `1211 ms` / `9.1 FPS`，诊断显示“二进制 1”。
- 普通 mock 回归通过：短窗口 `54` 帧 / `907 ms` / `59.5 FPS`，并覆盖输入 ack、Command→Ctrl、文本剪贴板和断开清理。
遗留问题：
- 当前二进制传输只覆盖 JPEG 图片 payload；H.264 仍是 `annexb-base64` 过渡格式。
- WGC 真实源帧仍受 `FrameArrived` 节奏影响，二进制传输主要减少文本/base64 负担，不会凭空增加真实源帧。
下一步建议：
- 继续推进 Windows WGC H.264/硬编或更高效的视频 payload，并用真实 Mac client 连接真实 Windows host 对照 full/signal/binary/H.264 的延迟、带宽、CPU 和观感。
是否改了协议：是，新增向后兼容的可选 `preferredVideoTransport`、`supportedVideoTransports`、`videoTransport` 和 `binary-jpeg` WebSocket binary frame 封包；旧 JSON/data-url 路径保持可用。
是否需要另一端配合：暂不需要；后续真机观感验收需要 Mac 端连接 Windows host。

## 2026-06-14 Windows Codex

日期：2026-06-14 21:50
开发端：Windows Codex
本轮目标：让 Mac client 显式兼容 Windows WGC `repeatPreviousFrame` 轻量重复帧，并补页面级自检。
完成内容：
- `apps/mac-client/app.js` 新增 repeat signal 计数：收到 `repeatPreviousFrame=true` 且无 `dataUrl` 的 JPEG 重复帧时保留上一帧画面、继续更新视频统计，并在顶部视频状态和会话诊断里显示“重复 N”。
- 如果 repeat signal 在首个可显示视频帧前到达，Mac client 会忽略该重复帧并记录日志，避免把空画面误计为首帧。
- `scripts/windows/test-mac-client-browser.mjs` 新增 `--expectRepeatSignalVideo`：临时启动 Windows host + WGC mock helper，启用 `LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME=1` 和 `LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME_MODE=signal`，验证 Mac client 画面保持可见且诊断显示重复计数。
- Mac client README、CURRENT_STATUS、NEXT_ACTIONS、任务板和 ACTIVE_LOCKS 已同步。
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
- `node scripts/windows/test-mac-client-browser.mjs --expectRepeatSignalVideo --allowClipboardFallback --skipFileClipboard --observeVideoMs 1200 --minObservedVideoFrames 10 --minObservedVideoFps 8 --timeoutMs 45000`
验证结果：
- 页面级自检通过：首帧约 `789 ms`，视频状态显示 `jpeg · #12 · 到达 1 ms · 重复 9`，诊断行显示 `重复 9`，短窗口观察 `46` 帧 / `1205 ms` / `38.2 FPS`。
- 自检同时覆盖默认 `1080P / 60Hz / 20Mbps`、切换 `2K / 60Hz / 40Mbps`、输入 ack、Command→Ctrl、文本剪贴板和手动断开清理。
遗留问题：
- 这轮使用本机 WGC mock helper 证明客户端兼容性；真实 Mac 控制真实 Windows WGC signal/full repeat 观感仍需后续双机联调。
下一步建议：
- 请 Mac 端或 Windows 端用真实 Windows host 对照 WGC `full` / `signal`，观察画面连续性、延迟、带宽和资源；随后继续推进 WebSocket 二进制帧或 H.264/硬编。
是否改了协议：否；只消费 Windows WGC 已有可选 `repeatPreviousFrame` 字段。
是否需要另一端配合：暂不需要；真机观感对照需要 Mac 端连接 Windows host。

## 2026-06-14 Windows Codex

日期：2026-06-14 21:20
开发端：Windows Codex
本轮目标：给 Windows WGC repeat-last-frame 增加轻量信令模式，降低重复帧重复发送 JPEG/base64 的成本。
完成内容：
- `apps/windows-host/src/windows-screen-capture.mjs` 新增 `LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME_MODE=full|signal`。默认 `full` 保持旧行为；`signal` 只在重复帧发送 `repeatPreviousFrame=true`、`payloadBytes=0` 和尺寸/时间戳诊断，不重发 `dataUrl`。
- `/discovery.capabilities.screen.wgc.repeatLastFrameMode` 暴露当前模式；`video_frame` 新增可选 `repeatPreviousFrame`、`repeatLastFrameMode`、`sourcePayloadBytes` 诊断字段。
- `observe-windows-host-video.mjs` 新增 `--wgcRepeatLastFrameMode <full|signal>`，JSON 统计 `repeatSignalFrames` 和 `repeatLastFrameModes`。
- `benchmark-windows-wgc-settings.mjs` 新增 `--repeatLastFrameMode <full|signal>`，文本/JSON 报告 signal 重复帧数量。
- Windows host README、CURRENT_STATUS、NEXT_ACTIONS、任务板和 ACTIVE_LOCKS 已同步结论。
修改文件：
- `apps/windows-host/src/windows-screen-capture.mjs`
- `scripts/windows/observe-windows-host-video.mjs`
- `scripts/windows/benchmark-windows-wgc-settings.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-host/src/windows-screen-capture.mjs`
- `node --check scripts/windows/observe-windows-host-video.mjs`
- `node --check scripts/windows/benchmark-windows-wgc-settings.mjs`
- `npm.cmd run check`（`apps/windows-host`）
- `node scripts/windows/test-windows-wgc-mode.mjs --durationMs 1200 --minFrames 1`
- `node scripts/windows/test-windows-wgc-mode.mjs --mockHelper --durationMs 1200 --minFrames 5`
- `node scripts/windows/test-windows-script-help.mjs`
- `node scripts/windows/benchmark-windows-wgc-settings.mjs --profile 60:20000:balanced --durationMs 1600 --timeoutMs 45000 --repeatLastFrame --repeatLastFrameMode signal --json`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 60Hz/20M/signal repeat 两轮短基准：约 `31-32 FPS`，重复帧 `33-35`，全部为 signal 重复帧，新鲜 helper 帧 `17`，平均图片 payload 约 `17-23 KB`，内容年龄最大 `79-82 ms`，timestamp 单调。
- 对比上一轮 full repeat 的 60Hz/20M：FPS 近似，但 signal 模式不再为重复帧携带 JPEG/base64，平均图片 payload 从约 `63.4 KB` 降到约 `17-23 KB`。
遗留问题：
- signal 模式降低重复帧传输/解析成本，但不会增加真实源帧；当前静态桌面下 WGC helper 真实新帧仍受 `FrameArrived` 节奏限制。
下一步建议：
- 继续推进 WebSocket 二进制视频帧、Windows WGC H.264/硬编，或让 Mac client 真实连接 Windows WGC signal/full repeat 对照观感、延迟、带宽和资源占用。
是否改了协议：未改共享必需字段；Windows WGC `video_frame` 增加可选轻量 repeat 诊断字段，默认 `full` 兼容旧行为。
是否需要另一端配合：暂不需要；真连观感验收需要 Mac 端连接 Windows host。

## 2026-06-14 Windows Codex

日期：2026-06-14 20:55
开发端：Windows Codex
本轮目标：给 Windows WGC helper 管线增加可选 repeat-last-frame pacing 诊断模式，并量化它对帧率/间隔/带宽的影响。
完成内容：
- `apps/windows-host/src/windows-screen-capture.mjs` 新增 `LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME=1`：默认关闭；开启后，已有上一帧且一个调度周期内没有新 WGC helper 帧时复用上一张 JPEG。
- WGC `video_frame` 新增诊断字段 `repeatedFrame`、`sourceTimestamp`、`contentAgeMs`；`timestamp` 统一为发送时刻，避免 repeat/fresh 混合时 timestamp 单调性误判。
- `/discovery.capabilities.screen.wgc.repeatLastFrame` 会显示当前 repeat 模式是否开启。
- `observe-windows-host-video.mjs` 新增 `--wgcRepeatLastFrame true`，并统计 `freshFrames`、`repeatedFrames`、`uniqueHelperFrameCount`、`avg/maxContentAgeMs`。
- `benchmark-windows-wgc-settings.mjs` 新增 `--repeatLastFrame`，报告 repeat 帧数和内容年龄。
- Windows host README、CURRENT_STATUS、NEXT_ACTIONS、任务板和 ACTIVE_LOCKS 已同步结论。
修改文件：
- `apps/windows-host/src/windows-screen-capture.mjs`
- `scripts/windows/observe-windows-host-video.mjs`
- `scripts/windows/benchmark-windows-wgc-settings.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-host/src/windows-screen-capture.mjs`
- `node --check scripts/windows/observe-windows-host-video.mjs`
- `node --check scripts/windows/benchmark-windows-wgc-settings.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script observe-windows-host-video.mjs --script benchmark-windows-wgc-settings.mjs`
- `npm.cmd run check`（`apps/windows-host`）
- `node scripts/windows/benchmark-windows-wgc-settings.mjs --profile 60:20000:balanced --durationMs 1600 --timeoutMs 45000 --json`
- `node scripts/windows/benchmark-windows-wgc-settings.mjs --profile 60:20000:balanced --durationMs 1600 --timeoutMs 45000 --repeatLastFrame --json`
- `node scripts/windows/benchmark-windows-wgc-settings.mjs --durationMs 1800 --timeoutMs 45000 --repeatLastFrame`
验证结果：
- 不 repeat 的 60Hz/20M 对照：17 帧/1.63 秒，约 `10.45 FPS`，重复帧 `0`，最大间隔 `85 ms`。
- repeat 的 60Hz/20M 对照：50 帧/1.60 秒，约 `31.16 FPS`，新鲜帧 `17`，重复帧 `33`，最大间隔 `32 ms`，内容年龄最大 `80 ms`。
- repeat 默认三档：30Hz/10M 为 56 帧、约 `30.45 FPS`、重复 40；60Hz/20M 为 62 帧、约 `33.92 FPS`、重复 42；120Hz/40M sharp 为 68 帧、约 `37.78 FPS`、重复 46；内容年龄最大约 `80-96 ms`。
遗留问题：
- repeat 能改善视觉连续性并降低最大间隔，但仍无法达到 60/120Hz；瓶颈已经转向 JSON/base64 重发 JPEG 的网络/序列化成本和 Node/WebSocket 发送节奏。
下一步建议：
- 优先设计 WebSocket 二进制视频帧，或把 Windows WGC 管线升级到 H.264/硬编；如果保留 JPEG，可增加轻量重复帧信令，避免重复发送完整 base64 payload。
是否改了协议：未改共享必需字段；Windows WGC `video_frame` 增加可选诊断字段。
是否需要另一端配合：暂不需要；下一步若做 Mac client 真连观感，需要 Mac 端配合连接 Windows host。

## 2026-06-14 Windows Codex

日期：2026-06-14 20:35
开发端：Windows Codex
本轮目标：新增 Windows WGC 刷新率/码率基准脚本，并确认高刷新请求在测试链路里不会被 60Hz 上限误挡。
完成内容：
- 新增 `scripts/windows/benchmark-windows-wgc-settings.mjs`：自动构建或复用 `apps/windows-wgc-helper`，顺序启动临时 Windows host，用 WGC 模式跑多档刷新率/码率/quality 基准。
- `observe-windows-host-video.mjs` 在本机临时 host 且 `--screenMode wgc` 时，`LAN_DUAL_WINDOWS_MAX_SCREEN_FPS` 上限改为按请求最高 240；FFmpeg/系统路径仍按 60Hz 上限保护。
- Windows host README、CURRENT_STATUS、NEXT_ACTIONS、任务板和 ACTIVE_LOCKS 已记录 30/60/120Hz 短基准。
修改文件：
- `scripts/windows/benchmark-windows-wgc-settings.mjs`
- `scripts/windows/observe-windows-host-video.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/benchmark-windows-wgc-settings.mjs`
- `node --check scripts/windows/observe-windows-host-video.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script benchmark-windows-wgc-settings.mjs --script observe-windows-host-video.mjs`
- `node scripts/windows/benchmark-windows-wgc-settings.mjs --profile 60:20000:balanced --durationMs 1500 --timeoutMs 45000 --json`
- `node scripts/windows/benchmark-windows-wgc-settings.mjs --durationMs 2200 --timeoutMs 45000`
验证结果：
- 单 profile 60Hz/20M 通过：会话 `60Hz`，15 帧/1.56 秒，约 `9.62 FPS`，平均约 `85.8 KB`，帧年龄最大 `4 ms`，管线为 `windows-wgc-helper-jpeg`。
- 默认三档通过：30Hz/10M 为 21 帧、约 `9.25 FPS`、平均约 `78 KB`；60Hz/20M 为 25 帧、约 `11.11 FPS`、平均约 `83 KB`；120Hz/40M sharp 为 27 帧、约 `12.22 FPS`、平均约 `121 KB`。
遗留问题：
- 会话刷新率已经可以协商到 120Hz，但当前 WGC helper/host 仍等待 `FrameArrived` 新事件，静态桌面实际帧率只有约 9-12 FPS。
下一步建议：
- 先设计可选 repeat-last-frame pacing 诊断模式，量化“观感提升 vs 带宽增加”；随后推进正式 H.264/硬编或二进制帧管线。
是否改了协议：否；只新增 Windows 本机基准脚本，并调整临时 host 测试入口的 WGC FPS 上限。
是否需要另一端配合：暂不需要；pacing 策略落地后再请 Mac client 真连验收。

## 2026-06-14 Windows Codex

日期：2026-06-14 20:22
开发端：Windows Codex
本轮目标：让 Windows WGC Rust helper 消费请求分辨率和 JPEG quality，并验证真实 Windows host 能走真实 helper 出帧。
完成内容：
- `lan-dual-wgc-helper` 新增 `--jpegQuality` 参数和 `LAN_DUAL_WGC_JPEG_QUALITY` 环境变量，兼容 `0.01-1.0` 和 `1-100` 两种写法。
- 默认 capture 模式现在会按请求宽高等比缩放且不放大；例如 `2560x1440` 源请求 `1280x720` 会输出 `1280x720`。
- WIC JPEG encoder 现在写入 `ImageQuality`，frame/hello JSON 会带 `jpegQuality`、`scaled`、`sourceWidth/sourceHeight` 诊断。
- `scripts/windows/test-windows-wgc-helper.mjs` 升级为三段验证：直接缩放真帧 JPEG、mock helper 合同接入、真实 Windows host + 真实 helper 出帧。
- Windows WGC helper README、Windows host README、CURRENT_STATUS、NEXT_ACTIONS、任务板和 ACTIVE_LOCKS 已同步。
修改文件：
- `apps/windows-wgc-helper/Cargo.toml`
- `apps/windows-wgc-helper/src/main.rs`
- `apps/windows-wgc-helper/README.md`
- `scripts/windows/test-windows-wgc-helper.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `cargo fmt --check`（`apps/windows-wgc-helper`）
- `cargo check --quiet`（`apps/windows-wgc-helper`）
- `node --check scripts/windows/test-windows-wgc-helper.mjs`
- `node scripts/windows/test-windows-wgc-helper.mjs --timeoutMs 120000`
- 真实 host 额外观察：`observe-windows-host-video --screenMode wgc --requireRealVideo true --durationMs 1500 --minFrames 1 --resourceSample false --json`
验证结果：
- WGC probe 通过，主显示器为 `显示 1`，源尺寸 `2560x1440`。
- 直接 helper 真帧通过：请求 `1280x720`、q=`0.55`，输出 `1280x720`，本轮复验首帧约 `96 KB`。
- mock Node host 合同通过：36 帧 `windows-wgc-helper-jpeg`。
- 真实 Windows host + 真实 helper 通过：14 帧 `1280x720`，平均约 `84 KB`。
遗留问题：
- 当前 WGC helper 仍是事件驱动 + JPEG/base64 过渡形态；还需要连续帧 pacing、资源占用对照、码率 A/B 和 Mac client 真连观感验收。
下一步建议：
- 运行更长的 `observe-windows-host-video --screenMode wgc --resourceSampleTree true --json`，和 FFmpeg 60Hz 基线对照 FPS、最大间隔、CPU/内存、payload 和 frame age；再请 Mac 端用 Mac client 真连看观感和延迟。
是否改了协议：否；只扩展 Windows 内部 helper 输出诊断字段，复用既有 `video_frame`。
是否需要另一端配合：暂不需要；下一轮做完资源对照后再请 Mac client 真机验收。

## 2026-06-14 Windows Codex

日期：2026-06-14 20:35
开发端：Windows Codex
本轮目标：让 Windows WGC Rust helper 输出真实屏幕 JPEG 帧，并把自测升级为真帧校验。
完成内容：
- `lan-dual-wgc-helper` 默认 capture 模式已能订阅 WGC `FrameArrived`，读取 `Direct3D11CaptureFrame.Surface`，转成 `ID3D11Texture2D`。
- 新增 D3D11 CPU-readable staging texture readback，把 BGRA 拷贝成 BGR，并通过 WIC JPEG encoder 输出真实 JPEG。
- helper 继续按既有 `json-lines-v1` 输出 `hello` 和 `frame`，不改共享协议；`--probe` 和 `--mock` 仍保留。
- `scripts/windows/test-windows-wgc-helper.mjs` 新增默认真帧检查，解码 base64 并校验 JPEG SOI/EOI、payloadBytes、时间戳和尺寸；Node host 合同检查仍用 helper mock mode，避免静态桌面 WGC 事件稀疏导致自测不稳定。
- Windows WGC helper README、Windows host README、CURRENT_STATUS、NEXT_ACTIONS、任务板和 ACTIVE_LOCKS 已同步。
修改文件：
- `apps/windows-wgc-helper/Cargo.toml`
- `apps/windows-wgc-helper/src/main.rs`
- `apps/windows-wgc-helper/README.md`
- `scripts/windows/test-windows-wgc-helper.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `cargo fmt --check`（`apps/windows-wgc-helper`）
- `cargo check --quiet`（`apps/windows-wgc-helper`）
- `node --check scripts/windows/test-windows-wgc-helper.mjs`
- `node scripts/windows/test-windows-wgc-helper.mjs --timeoutMs 90000`
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-wgc-helper.mjs`
- `node scripts/windows/test-windows-script-help.mjs`
验证结果：
- WGC probe 通过，主显示器为 `显示 1`，尺寸 `2560x1440`。
- 直接真帧检查通过：输出 1 帧真实 `2560x1440` JPEG，最终复验首帧约 `508640` bytes。
- Node host 集成观察通过：mock helper 合同路径收到 37 帧，管线为 `windows-wgc-helper-jpeg`。
- 全量 Windows 脚本帮助覆盖 21 个脚本、42 条命令通过。
遗留问题：
- helper 目前仍输出原始捕获尺寸，尚未应用请求宽高、JPEG 质量、码率和连续帧 pacing；当前 2K/1440p JPEG payload 偏大，不宜直接当最终低延迟管线。
下一步建议：
- 在 Rust helper 内增加缩放和 JPEG quality 参数，接入 `LAN_DUAL_WGC_WIDTH` / `HEIGHT` / `JPEG_QUALITY`，再用 `observe-windows-host-video --screenMode wgc --resourceSampleTree true --json` 与 FFmpeg 60Hz 基线对照，最后请 Mac 端用 Mac client 真连看画面、延迟和资源占用。
是否改了协议：否；复用现有 Windows host 内部 helper 合同和既有 `video_frame`。
是否需要另一端配合：暂不需要；缩放/质量控制完成后再请 Mac 端做真实观感验收。

## 2026-06-14 Windows Codex

日期：2026-06-14 20:10
开发端：Windows Codex
本轮目标：新增 Windows WGC Rust helper 初始化链路和自测入口。
完成内容：
- 新增 `apps/windows-wgc-helper` Rust 项目，作为后续真正 WGC 采集的原生 helper。
- `lan-dual-wgc-helper --probe` 会真实初始化 D3D11 device、WinRT Direct3D device、主显示器 `GraphicsCaptureItem`、frame pool 和 capture session，并输出机器可读 JSON 诊断。
- `lan-dual-wgc-helper --mock` 按 `json-lines-v1` 输出 JPEG 测试帧，用于先验证 Node host helper 合同。
- 新增 `scripts/windows/test-windows-wgc-helper.mjs`，覆盖 helper 构建、WGC probe、mock 帧合同，以及把 helper 接入 Windows host 后收到 `windows-wgc-helper-jpeg` 帧。
- Windows host README、CURRENT_STATUS、NEXT_ACTIONS、任务板和 ACTIVE_LOCKS 已同步，明确下一步是真正读取 `Direct3D11CaptureFrame.Surface` 并编码 JPEG。
修改文件：
- `apps/windows-wgc-helper/Cargo.toml`
- `apps/windows-wgc-helper/Cargo.lock`
- `apps/windows-wgc-helper/src/main.rs`
- `apps/windows-wgc-helper/README.md`
- `scripts/windows/test-windows-wgc-helper.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `cargo check`（`apps/windows-wgc-helper`）
- `cargo run -- --probe`
- `cargo run -- --mock --frames 2 --fps 30 --width 640 --height 360`
- `node --check scripts/windows/test-windows-wgc-helper.mjs`
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-wgc-helper.mjs`
- `node scripts/windows/test-windows-wgc-helper.mjs`
验证结果：
- WGC probe 通过，显示器为 `显示 1`，尺寸 `2560x1440`，`sessionSupported=true`。
- mock 合同输出带 ISO 时间戳的 JPEG 测试帧。
- Node host 集成观察收到 36 帧，管线为 `windows-wgc-helper-jpeg`。
遗留问题：
- 目前还没有把真实 `Direct3D11CaptureFrame.Surface` 读回并编码成 JPEG；Node 集成测试仍使用 helper 的 mock 合同帧。
下一步建议：
- 在 Rust helper 内实现 surface readback/staging texture + WIC/JPEG 编码，再用 `observe-windows-host-video --screenMode wgc --resourceSampleTree true --json` 对照 FFmpeg 基线，并请 Mac 端做真实控制端观感验收。
是否改了协议：否；只新增 Windows 内部 helper 项目、自测入口和文档。
是否需要另一端配合：暂不需要；真实 WGC 帧输出后再请 Mac 端验收。

## 2026-06-14 Windows Codex

日期：2026-06-14 19:45
开发端：Windows Codex
本轮目标：给 Windows WGC 模式补上原生 helper 接入边界和可验证的出帧合同。
完成内容：
- `apps/windows-host/src/windows-screen-capture.mjs` 新增 `LAN_DUAL_WINDOWS_WGC_HELPER` / `LAN_DUAL_WINDOWS_WGC_HELPER_ARGS` 接入点。
- `LAN_DUAL_WINDOWS_SCREEN_MODE=wgc` 现在会在 WGC 预检通过且 helper 可用时启动 helper，并从 stdout 读取 `json-lines-v1` 帧；helper 输出 JPEG base64 frame 后，host 会发出既有 `video_frame`，`capturePipeline=windows-wgc-helper-jpeg`。
- 未配置 helper 时不会伪装成 WGC，仍明确降级到 FFmpeg/System.Drawing/mock，并在 `/discovery.capabilities.screen.wgc` 里显示 `helperConfigured/helperAvailable/active/backendImplemented/fallbackReason`。
- `scripts/windows/test-windows-wgc-mode.mjs` 新增 `--mockHelper`，用临时 JSON 行 helper 验证 helper 合同可出帧；默认模式继续验证无 helper 降级诊断。
- Windows host README、CURRENT_STATUS、NEXT_ACTIONS、任务板和 ACTIVE_LOCKS 已同步，明确下一步是实现真正原生 `lan-dual-wgc-helper`。
修改文件：
- `apps/windows-host/src/windows-screen-capture.mjs`
- `scripts/windows/test-windows-wgc-mode.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-host/src/windows-screen-capture.mjs`
- `node --check scripts/windows/test-windows-wgc-mode.mjs`
- `node scripts/windows/test-windows-wgc-mode.mjs --durationMs 1200 --timeoutMs 20000`
- `node scripts/windows/test-windows-wgc-mode.mjs --mockHelper --durationMs 1200 --minFrames 5 --timeoutMs 20000`
- `npm run check`（`apps/windows-host`）
- `node scripts/windows/check-windows-host-readiness.mjs --json --timeoutMs 20000`
- `node scripts/windows/test-windows-script-help.mjs --script test-windows-wgc-mode.mjs`
- `node scripts/windows/test-windows-script-help.mjs`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 默认 WGC 模式在无 helper 时通过：`active=false`、WGC 预检支持、实际回退管线为 `windows-ffmpeg-gdigrab-mjpeg`。
- `--mockHelper` 通过：25 帧来自 `windows-wgc-helper-jpeg`，`screen.wgc.active=true`。
- Windows host 包语法检查通过；默认 readiness 8 项通过、0 失败，当前 43770 未启动只产生预期 warning。
- 全量 Windows 脚本帮助覆盖 20 个脚本、40 条命令通过；diff check 和冲突标记搜索通过。
遗留问题：
- 这还不是原生 WGC 采集本体；本机当前只有 .NET runtime、没有 .NET SDK/Visual Studio C++ build toolchain，后续写 `lan-dual-wgc-helper` 前需要确定/安装原生构建环境。
下一步建议：
- 实现真正的 Windows 原生 WGC helper，让它按 `json-lines-v1` 输出 JPEG 帧；接入后用 `observe-windows-host-video --screenMode wgc --resourceSampleTree true --json` 对照 FFmpeg 60Hz 基线。
是否改了协议：否；复用现有 `video_frame`，只新增 Windows host 内部 helper 合同和诊断字段。
是否需要另一端配合：暂不需要；原生 helper 完成后再请 Mac 端用 Mac client 做真实观感/延迟验收。

## 2026-06-14 Windows Codex

日期：2026-06-14 19:05
开发端：Windows Codex
本轮目标：让 Windows host readiness 消费统一的 Windows host 状态 JSON。
完成内容：
- `scripts/windows/check-windows-host-readiness.mjs` 的 “Windows host runtime” 步骤改为调用 `scripts/windows/start-windows-host.mjs --status --json`。
- readiness 现在统一消费状态助手的 runtime、buildDiff、capabilities 和 warning；默认档 host 离线仍只作为 warning，显式 `--requireOpen` / `--requireCurrentBuildId` / `--expectBuildId` 时按原规则失败。
- 移除了 readiness 内部重复维护的旧 build 源码 diff 逻辑，避免与启动助手状态 JSON 分叉。
- Windows host README、CURRENT_STATUS、NEXT_ACTIONS、任务板和 ACTIVE_LOCKS 已同步。
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
- `node scripts/windows/test-windows-script-help.mjs --script check-windows-host-readiness.mjs`
- `node scripts/windows/check-windows-host-readiness.mjs --json --timeoutMs 20000`
- `node scripts/windows/check-windows-host-readiness.mjs --json --requireOpen --timeoutMs 20000`
验证结果：
- 语法、帮助入口和单脚本 help 覆盖通过。
- 默认 readiness 在当前 `43770` 未启动时 8 项通过、0 失败，runtime 步骤通过状态助手给出离线 warning。
- 显式 `--requireOpen` 在当前 `43770` 未启动时按预期失败，LAN/firewall 与 runtime 两步都报告端口不可达。
遗留问题：
- 未启动真实 Windows host 做在线 readiness 路径复验；状态助手在线路径已有启动助手自测覆盖，后续启动真实 host 后可用 `--profile deploy` 验证。
下一步建议：
- 下一步继续推进 WGC 真采集 backend，或在真实 Windows host 启动后跑桌面壳面板 + readiness deploy 的一致性验收。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-14 Windows Codex

日期：2026-06-14 18:55
开发端：Windows Codex
本轮目标：让 Windows 桌面壳“本机被控”面板消费统一的 Windows host 只读状态 JSON。
完成内容：
- Windows 桌面壳新增 Tauri 命令 `get_windows_host_helper_status`，调用 `scripts/windows/start-windows-host.mjs --status --json`，只读查看本机端口上的 `/discovery`，不启动服务、不认证、不要求密码。
- Windows 控制端“本机被控”面板刷新时同时读取桌面壳托管进程状态和 helper status，显示真实 runtime/build、视频/音频/输入/剪贴板能力、在线/离线原因和旧 build 提示。
- 面板新增“已在线”状态：如果端口上已有非桌面壳启动的 Windows host，会禁止重复启动，但停止按钮仍只针对桌面壳自己启动的进程。
- 页面自检补充 helper status 在线/离线摘要、能力行和日志行断言。
修改文件：
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
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly`
- `cargo check`（`apps/windows-desktop/src-tauri`）
验证结果：
- 前端语法、页面级 diagnosticsOnly 和桌面壳 Rust 编译检查均通过。
遗留问题：
- 还未用真实桌面窗口手动观察面板视觉效果；当前已由页面自检覆盖摘要/按钮/日志逻辑。
下一步建议：
- 后续启动真实 Windows host 后，在桌面壳面板确认“已在线/运行中”状态、runtime build 和 capabilities 与命令行 `--status --json` 一致。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-14 Windows Codex

日期：2026-06-14 18:40
开发端：Windows Codex
本轮目标：让 Windows PowerShell 启动助手也能直接输出机器可读状态 JSON。
完成内容：
- `scripts/windows/start-windows-host.ps1` 新增 `-Json`，可与 `-Status` 组合透传到 Node `--status --json`。
- Windows host README、CURRENT_STATUS、NEXT_ACTIONS、任务板和 ACTIVE_LOCKS 已同步 `-Status -Json` 用法。
修改文件：
- `scripts/windows/start-windows-host.ps1`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\start-windows-host.ps1 -Status -Json -HostName 127.0.0.1 -Port 43770`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 当前本机 `127.0.0.1:43770` 未运行 Windows host，`-Status -Json` 按预期返回非 0 和纯 JSON 离线状态，没有启动服务、没有要求密码。
遗留问题：
- 桌面壳尚未消费该 JSON 状态入口。
下一步建议：
- 后续桌面壳“本机被控”状态刷新可调用 PowerShell `-Status -Json` 或 Node `--status --json`。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-14 Windows Codex

日期：2026-06-14 18:20
开发端：Windows Codex
本轮目标：对齐 Mac host 状态助手 JSON 输出，让 Windows host 状态也能被脚本、桌面壳或联络板稳定消费。
完成内容：
- `scripts/windows/start-windows-host.mjs --status` 新增 `--json`，在线/离线都只输出机器可读 JSON，不混入 `[INFO]`/`[WARN]` 日志行。
- JSON 在线对象包含 probe、currentBuildId、device、runtime、capabilities、lanAddresses、warnings 和 buildDiff；能力分组覆盖 screen、audio、input、clipboard、reverseControl 和 mock。
- JSON 离线对象包含 `ok=false`、probe、currentBuildId、lanAddresses、error.message 和安全启动建议；仍按原有约定返回非 0。
- 旧 build 诊断改为先生成 `buildDiff` 对象，再分别渲染文本/JSON，避免两种输出事实不一致。
- PowerShell 包装 `scripts/windows/start-windows-host.ps1` 新增 `-Status`，透传到 Node `--status`。
- 启动助手自测补充 `--status --json` 在线/离线覆盖，断言 JSON 可解析、在线包含 runtime/buildDiff/能力分组，且 JSON 输出不混入日志行。
- Windows host README、CURRENT_STATUS、NEXT_ACTIONS、任务板和 ACTIVE_LOCKS 已同步 `--status --json` 与 PowerShell `-Status` 用法。
修改文件：
- `scripts/windows/start-windows-host.mjs`
- `scripts/windows/test-windows-host-start-helper.mjs`
- `scripts/windows/start-windows-host.ps1`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/start-windows-host.mjs`
- `node --check scripts/windows/test-windows-host-start-helper.mjs`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/windows/test-windows-script-help.mjs`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\start-windows-host.ps1 -Status -HostName 127.0.0.1 -Port 43770`
- `node scripts/windows/start-windows-host.mjs --status --json --host 127.0.0.1 --port 43770`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 语法、启动助手完整自测和全量 Windows 脚本帮助覆盖通过；当前覆盖 20 个脚本、40 条 `--help/-h` 命令。
- 启动助手自测通过：`--status` 和 `--status --json` 的离线/临时在线 host 路径均通过，且不泄露测试密码。
- 当前本机 `127.0.0.1:43770` 未运行 Windows host，PowerShell `-Status` 和 Node `--status --json` 均按预期返回离线建议和非 0；JSON 输出为纯 JSON，`currentBuildId=1ff0808`。
遗留问题：
- 桌面壳尚未直接消费 `--status --json`；下一轮可把“本机被控”面板的状态刷新切到该 JSON 入口，减少解析日志。
下一步建议：
- 反控 Windows 联调前优先用 `node scripts/windows/start-windows-host.mjs --status --json` 或 PowerShell `-Status` 做只读状态确认；若离线，再启动 host。
是否改了协议：否。
是否需要另一端配合：暂不需要；Mac 端拉取后可消费 Windows 状态 JSON。

## 2026-06-14 Windows Codex

日期：2026-06-14 16:50
开发端：Windows Codex
本轮目标：给 Windows host 启动助手补齐与 Mac host 对等的只读状态检查入口，减少反控 Windows 联调前的盲目重启。
完成内容：
- `scripts/windows/start-windows-host.mjs` 新增 `--status`，在密码处理之前只读探测 `/discovery`，在线时打印 runtime、视频、音频、输入、剪贴板能力和 Mac 端可尝试的局域网地址。
- `--status` 遇到运行中 `/discovery.runtime.buildId` 与当前 git 不一致时，会只比较 `apps/windows-host/package.json`、`apps/windows-host/server.mjs` 和 `apps/windows-host/src`，提示旧 build 后是否有 Windows host 运行源码变化。
- `--status` 离线时返回非 0 并给安全启动建议，不启动服务、不认证、不要求或打印密码；若要让 Mac 接收 Windows 系统声音，提示启动时加 `--wasapi`。
- 启动助手自测新增 `--status` 离线和临时在线 host 覆盖，确认不会泄露密码，也不会误启动。
- Windows host README、CURRENT_STATUS、NEXT_ACTIONS 和任务板已同步 `--status` 用法。
修改文件：
- `scripts/windows/start-windows-host.mjs`
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
- `node scripts/windows/start-windows-host.mjs --help`
- `node scripts/windows/test-windows-script-help.mjs --script start-windows-host.mjs`
- `node scripts/windows/test-windows-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/windows/start-windows-host.mjs --status --host 127.0.0.1 --port 43770`
- `node scripts/windows/test-windows-script-help.mjs`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 语法、帮助入口和全量 Windows 脚本帮助覆盖通过；当前覆盖 20 个脚本、40 条 `--help/-h` 命令。
- 启动助手完整自测通过：缺密码拒绝、非交互密码提示拒绝、环境密码干跑、`--status` 离线无密码、`--status` 临时在线 host、环境密码临时启动和防火墙干跑均通过。
- 当前本机 `127.0.0.1:43770` 未运行 Windows host，`--status` 按预期返回离线并给安全启动建议。
遗留问题：
- `--status` 目前是 Node 启动助手入口；PowerShell 包装尚未加 `-Status` 短入口，后续可以补到桌面/PowerShell 日常流程。
- 当前没有真实 Mac 控制 Windows 认证联调；待用户提供正式密码或启动 Windows host 后再跑 Mac client 端到端验收。
下一步建议：
- 反控 Windows 联调前先运行 `node scripts/windows/start-windows-host.mjs --status`；若离线再用 `--promptPassword --requirePassword` 启动，需要系统声音时加 `--wasapi`。
- 下一轮 Windows 侧可继续推进 PowerShell `-Status`、桌面壳状态按钮，或真正 WGC backend。
是否改了协议：否。
是否需要另一端配合：暂不需要；Mac 端拉取后可只读使用该状态入口。

## 2026-06-14 Mac Codex

日期：2026-06-14 16:50
开发端：Mac Codex
本轮目标：让 Mac host 状态检查可被脚本/联络板稳定消费，减少自动化解析人类日志的脆弱性。
完成内容：
- `scripts/mac/start-mac-host.mjs --status` 新增 `--json`：在线/离线都只输出机器可读 JSON，不混入 `[INFO]`/`[WARN]` 日志行。
- JSON 在线对象包含 `online`、`probe`、`deviceName`、`inputMode`、`runtime`、`permissions`、`capabilities`、`lanAddresses`、`currentBuildId`、`buildDiff` 和原始 `discovery`。
- JSON 离线对象包含 `online=false`、`probe`、`currentBuildId`、`error.message` 和安全启动建议；仍按原有约定返回非 0。
- 旧 build 诊断改为先生成 `buildDiff` 对象，再分别渲染文本/JSON，避免两种输出事实不一致。
- 启动助手自测补充 `--status --json` 在线/离线覆盖，断言 JSON 可解析、在线包含 runtime/buildDiff/lanAddresses，且 JSON 输出不混入日志行。
- Mac host README、CURRENT_STATUS、NEXT_ACTIONS、任务板和 ACTIVE_LOCKS 已同步 `--status --json` 用法。
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
- `node scripts/mac/start-mac-host.mjs --help`
- `node scripts/mac/test-mac-script-help.mjs --script start-mac-host.mjs`
- `node scripts/mac/test-mac-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/mac/start-mac-host.mjs --status --json --host 127.0.0.1 --port 43770`
- `node scripts/mac/check-mac-host-readiness.mjs --requireOpen --skipCurrentBuildCheck --timeoutMs 12000`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 语法、帮助入口、启动助手完整自测通过；`--status --json` 在线/离线路径均能输出纯 JSON。
- 真实 `--status --json` 成功读取当前 43770：`online=true`、runtime `buildId=1506dcd`、当前源码 `currentBuildId=90d1c5d`，且 `buildDiff.changedHostRuntimeFileCount=0`。
- Mac readiness 9/9 通过；本轮只改状态助手/自测/文档，不改协议，不要求重启当前 host。
遗留问题：
- 当前 Mac host 仍使用一次性随机密码，只适合 `/discovery`、runtime 和 UI diagnostics；认证联调仍需要用户输入正式密码或按约定密码重启。
下一步建议：
- 后续联络板或脚本需要判断 Mac host 是否在线、权限是否齐、运行 build 是否旧时，优先消费 `node scripts/mac/start-mac-host.mjs --status --json`。
是否改了协议：否。
是否需要另一端配合：暂不需要。

## 2026-06-14 Mac Codex

日期：2026-06-14 16:05
开发端：Mac Codex
本轮目标：增强 Mac host 状态检查，让旧 build 提醒能区分“服务运行源码已变”与“只是 build 元数据落后”。
完成内容：
- `scripts/mac/start-mac-host.mjs --status` 遇到运行中 `/discovery.runtime.buildId` 与当前 git 不一致时，会只比较 `apps/mac-host/Package.swift` 和 `apps/mac-host/Sources`，输出旧 build 后是否有 Mac host 运行源码变化。
- 若旧 build 可解析且没有运行源码变化，会提示服务行为大概率仍是当前的，只是 build 元数据落后；若有变化，会列出最多 4 个变动文件并提示重启必要性；若旧 build 不在本地 git 历史，会明确说明无法比较。
- 启动助手自测补充旧 build 不可解析时的 `--status` 输出断言。
- Mac host README、CURRENT_STATUS、NEXT_ACTIONS 和任务板同步 `--status` 旧 build 诊断说明。
- 当前真实 Mac host 仍在线 `192.168.31.122:43770`，runtime `pid=74165`、`build=1506dcd`、`inputMode=log`；`--status` 已确认 `1506dcd..407bd92` 之间没有 Mac host 运行源码变化，因此暂不需要为了服务行为重启。
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
- `node scripts/mac/start-mac-host.mjs --help`
- `node scripts/mac/test-mac-script-help.mjs --script start-mac-host.mjs`
- `node scripts/mac/start-mac-host.mjs --status --host 127.0.0.1 --port 43770`
- `node scripts/mac/test-mac-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/mac/check-mac-host-readiness.mjs --requireOpen --skipCurrentBuildCheck --timeoutMs 12000`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 语法、帮助入口、启动助手完整自测通过。
- 真实 `--status` 成功显示当前 43770 在线、权限全开、H.264/PCM/剪贴板能力在线，并提示 `No Mac host runtime source changes since 1506dcd`。
- Mac readiness 9/9 通过，当前 host 仍是安全 `log` 输入模式。
遗留问题：
- 当前 Mac host 仍使用一次性随机密码，只适合 `/discovery`、runtime 和 UI diagnostics；认证联调仍需要用户输入正式密码或按约定密码重启。
下一步建议：
- 如果后续只是查状态，优先运行 `node scripts/mac/start-mac-host.mjs --status`；只有它提示 Mac host 运行源码有变化，或需要正式密码认证联调时，再协调重启。
- 白天用户在场后，再考虑正式密码下的 Windows 控制 Mac H.264/WebCodecs、PCM 音频、真实输入注入验收。
是否改了协议：否。
是否需要另一端配合：暂不需要；推送前已通过联络板发预告。

## 2026-06-14 Mac Codex

日期：2026-06-14 14:32
开发端：Mac Codex
本轮目标：恢复真实 Mac host 在线诊断面，并让启动助手支持不启动服务的状态检查，减少开工/联调前确认成本。
完成内容：
- 已同步 Windows 最新 `1506dcd Auto-select discovered Windows client host`，本地 main 与 origin/main 对齐后继续开发。
- 当前 Mac host 已用 `--ephemeralPassword --requirePassword` 恢复到 `0.0.0.0:43770`，LAN 地址 `192.168.31.122:43770`，runtime `pid=74165`、`build=1506dcd`、`inputMode=log`，密码为一次性随机值且未打印/未共享。
- `scripts/mac/start-mac-host.mjs` 新增 `--status`：只读探测 `/discovery`，在线时打印 runtime、权限、能力摘要和 Windows 可尝试地址；离线时返回非 0 并打印安全启动建议。该入口不会启动 Swift host，不会要求或打印密码。
- 启动助手自测补充 `--status` 离线/在线覆盖，确保离线不会误启动，在线临时 host 会显示 runtime/权限/Windows 可连地址。
- Mac host README、CURRENT_STATUS、NEXT_ACTIONS 和任务板已同步 `--status` 用法。
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
- `node scripts/mac/start-mac-host.mjs --help`
- `node scripts/mac/test-mac-script-help.mjs --script start-mac-host.mjs`
- `node scripts/mac/test-mac-host-start-helper.mjs --timeoutMs 45000`
- `node scripts/mac/start-mac-host.mjs --status --host 127.0.0.1 --port 43770`
- `node scripts/mac/check-mac-host-readiness.mjs --requireOpen --requireCurrentBuildId --timeoutMs 12000`
- `node scripts/windows/discover-lan-hosts.mjs --host 192.168.31.122 --port 43770 --requireFound --json`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --host 192.168.31.122 --port 43770 --expectDiscoveryRuntimeBuildId 1506dcd --timeoutMs 60000`
- `git diff --check`
- 冲突标记搜索
验证结果：
- 语法、帮助入口、启动助手自测通过；`--status` 授权只读查询当前真实 host 成功，显示 `pid=74165 build=1506dcd`、权限 screen/accessibility/inputMonitoring 全 on、H.264/PCM/剪贴板能力在线。
- Mac readiness 9/9 通过，且强制当前 build 为 `1506dcd`。
- Windows 局域网发现脚本发现 `192.168.31.122:43770` 和 `127.0.0.1:43770`，runtime build 均为 `1506dcd`。
- Windows 控制端 diagnosticsOnly 无密码 UI 验收通过：设备列表/诊断条显示当前 Mac host，刷新设备自动选中真实 WebSocket 目标，runtime build 为 `1506dcd`。
- 普通沙盒下 `start-mac-host --status` 和早前 readiness 会因本机网络权限出现 `EPERM` 假阴性；授权只读路径通过，已按环境限制处理。
遗留问题：
- 当前 Mac host 使用一次性随机密码，只适合 `/discovery`、runtime 和 UI diagnostics；真正 WebSocket 认证联调仍需要用户输入正式密码或按约定密码重启。
- Agent Link Board 当前 `http://192.168.31.68:17888` 连接失败，暂无法发板上状态；需要恢复通讯板后补发本轮结果。
下一步建议：
- Windows 端可先继续无密码 diagnostics/discovery 检查 `192.168.31.122:43770` / build `1506dcd`。
- 若用户准备真实控制测试，先在 Mac 端用正式密码重启 host，再让 Windows 端跑 `test-windows-client-browser --requireH264` 端到端验收。
是否改了协议：否。
是否需要另一端配合：暂不需要；认证联调需要用户提供正式密码或重启到约定密码。

## 2026-06-14 Windows Codex

日期：2026-06-14 03:25
开发端：Windows Codex
本轮目标：减少真机联调时“刷新设备后还要手动点设备”的步骤。
完成内容：
- Windows 控制端刷新设备后，如果发现真实在线 WebSocket 设备，会在未连接状态下自动选中最佳目标。
- 自动选择优先级为 macOS 被控端，其次是其他在线 host；如果当前输入框已经是在线目标，则保留当前目标并刷新 runtime 诊断。
- 自动选择会填入目标地址、端口和 WebSocket 连接方式，并把 `/discovery.runtime` 显示到诊断条。
- 页面级自检 `test-windows-client-browser --diagnosticsOnly --expectDiscoveryRuntimeBuildId` 已从“手动点击设备行”升级为断言刷新后自动选中在线设备。
修改文件：
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --host 192.168.31.122 --port 43770 --expectDiscoveryRuntimeBuildId edcde5e --timeoutMs 60000`
验证结果：
- 真实 Mac host `192.168.31.122:43770` 的 diagnosticsOnly 通过；设备列表显示 `PID 63007 / build edcde5e`，刷新后自动选中 WebSocket 目标，并把 runtime 显示到诊断条。
遗留问题：
- 当前 Mac host 仍使用一次性随机密码，只适合 discovery/runtime/UI 检查；真正连接控制需要用户输入正式密码或按约定密码重启。
下一步建议：
- 白天继续前先看 Agent Link Board；若用户准备真实控制测试，再用正式密码跑 Windows 控制端 `--requireH264` 端到端连接。
是否改了协议：否。
是否需要另一端配合：暂不需要。

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

日期：2026-06-13 14:50
开发端：Windows Codex
本轮目标：降低真机联调时手动找 Mac IP 的摩擦，让 Windows 控制端刷新设备时能自动发现同局域网被控端。
完成内容：
- 新增 `scripts/windows/discover-lan-hosts.mjs`，可扫描本机 IPv4 局域网网段或指定 `--subnet` / `--host` 的 `/discovery`，输出文本或 JSON；脚本只做 HTTP discovery，不认证、不打开 WebSocket、不发送输入、不改系统设置。
- Windows 桌面壳新增 Tauri 命令 `discover_lan_hosts`，调用上述脚本并把 JSON 结果回传给前端。
- Windows 控制端“刷新设备”会在桌面版优先调用原生局域网扫描，并与浏览器轻量探测的本机/当前地址/连接历史结果合并去重；浏览器预览版不扫整段网段，避免网页预览时大量并发探测。
- 刷新设备流程加了 `finally` 恢复按钮状态，扫描失败时不会让刷新按钮一直不可点。
- Windows client README 已补充局域网发现说明和命令示例。
修改文件：
- `scripts/windows/discover-lan-hosts.mjs`
- `apps/windows-client/app.js`
- `apps/windows-client/README.md`
- `apps/windows-desktop/src-tauri/src/main.rs`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
验证方式：
- `node --check scripts/windows/discover-lan-hosts.mjs`
- `node --check apps/windows-client/app.js`
- `node scripts/windows/discover-lan-hosts.mjs --help`
- `node scripts/windows/test-windows-script-help.mjs --script discover-lan-hosts.mjs`
- `node scripts/windows/discover-lan-hosts.mjs --timeoutMs 350 --json --verbose`
- `cargo check` in `apps/windows-desktop/src-tauri`
验证结果：
- 真实局域网扫描发现 Mac host：`192.168.31.122:43770`，`deviceName=macOS 被控端`，`runtime.buildId=b2e3cdf`，`processId=92813`，`inputMode=log`，`h264Stream=true`，`audioMode=system-pcm`。
- 桌面壳 `cargo check` 通过。
遗留问题：
- `scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly` 在当前 Windows headless 浏览器环境出现 `Target crashed` / 超时波动；最小 `about:blank` headless 探针可以打开，说明需要单独排查页面级浏览器自检壳或本机浏览器环境。本轮未把该自检记为通过。
- 这不是 UDP/mDNS 完整发现；当前桌面版是主动 HTTP `/discovery` 扫描，浏览器预览版只做已知地址轻量探测。
下一步建议：
- Windows 端可继续排查 `test-windows-client-browser.mjs` headless `Target crashed`，优先让 diagnosticsOnly 在当前机器恢复稳定。
- 真机联调时优先点 Windows 桌面版“刷新设备”，应能自动出现 `192.168.31.122:43770` 或后续 DHCP 分配的新 Mac IP。
是否改了协议：否。
是否需要另一端配合：不需要；Mac 端保持 host 监听 `/discovery` 即可被扫描到。

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
