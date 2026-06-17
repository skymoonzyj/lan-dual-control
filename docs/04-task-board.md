# 任务清单与里程碑

## 里程碑 M0：仓库和文档

状态：进行中。

- [x] 建立策划书。
- [x] 建立双端开发计划书。
- [x] 建立协议草案。
- [x] 建立双 Codex 协作说明。
- [x] 建立双端交接中心：当前状态、下一步、文件占用和交接日志。
- [x] 建立双端测试联络规则。
- [x] 建立局域网 Codex 联络板，支持网页实时收发和命令行收发。
- [x] Windows 侧联络板 Mac 提醒 watcher 可后台运行：优先 PowerShell 7，Mac 授权/权限/502/blocked/长时间无更新、Mac 发给 Windows 的 active currentCall，以及 Mac 反控请求 `LAN008` 后等待 Windows `ReverseGrant` 临时授权都会弹本机提醒；支持状态/停止/重启、防重复启动和 `-Json` 机器可读输出，并有无弹窗自动回归。
- [x] 上传到 GitHub 仓库。
- [x] Mac mini 到位后克隆仓库。

## 里程碑 M1：Windows 控制 Mac 原型

目标：Windows 能窗口化看到并控制 Mac。

Mac 端：

- [x] 创建 mac-host 项目骨架。
- [x] 检测屏幕录制权限骨架。
- [x] 真机验证屏幕录制权限。
- [x] 采集主屏幕图像。
- [x] 后台 JPEG 采集管线，避免截图和编码阻塞主线程。
- [x] 开启 WebSocket 局域网监听端口骨架。
- [x] 提供 `/discovery` HTTP 发现接口。
- [x] 发送模拟 `video_frame`，便于 Windows 控制端先联调真实 Mac 服务入口。
- [x] 接收鼠标事件骨架。
- [x] 接收键盘事件骨架。
- [x] 注入鼠标键盘到 macOS。

Windows 端：

- [x] 创建 windows-client 项目。
- [x] 中文连接窗口。
- [x] 输入 IP 和端口。
- [x] 显示模拟远程画面。
- [x] 捕获鼠标移动、点击、滚轮。
- [x] 捕获键盘输入。
- [x] 增加远控 macOS 默认按键映射。
- [x] 增加 Windows 常用快捷键兼容：Ctrl+C/V 等按 macOS Command 快捷键发送。
- [x] Windows 控制 Mac 快捷键映射抽成共享可测工具：`mapping-utils.js` 统一页面和测试逻辑，回归覆盖 Ctrl+C/V/X/A/Z/Y、Ctrl+Shift+Z、兼容开关、自定义 Win/Alt/Ctrl 映射，以及页面 diagnostics-only 实际调用路径。
- [x] Windows 控制端顶部输入状态直显安全日志/真实控制/已注入/被拒绝：Mac host 为 `inputMode=log` 时会提示“安全日志，不会真正控制”，页面 diagnostics-only 已覆盖该文案。
- [x] 映射窗口坐标到远程屏幕坐标。
- [x] 增加窗口缩放模式。
- [x] 按实际视频区域映射鼠标坐标。
- [x] 增加 WebSocket 协议客户端。
- [x] 增加本机假 Mac 联调服务。
- [x] 接收并渲染模拟视频帧。
- [x] 增加真实 Mac 联通自检脚本，可检查 `/discovery`、WebSocket、认证、会话和第一帧视频帧。
- [x] 增加 Mac 主机诊断状态条，可显示权限、采集管线、视频来源、丢帧和剪贴板通道。
- [x] 保存连接方式、地址、端口和画质设置。
- [x] 增加最近连接列表。
- [x] 增加连接状态机。

## Mac 反控 Windows 真连准备

- [x] 新增 Mac 控制端本地页面启动/状态助手。
- [x] 新增 Mac 控制 Windows 前的只读 readiness 和 formal checklist。
- [x] 新增 Mac 侧 Windows host 发现入口：`scripts/mac/discover-windows-hosts.mjs --boardSummary` 只读扫描 `/discovery`，过滤 `platform=windows`，输出下一步 formal checklist 命令和 ready 后 `--sendCall` 协调命令；不认证、不要求密码、不发送输入、不执行 `inject`。
- [x] Mac 侧 Windows host 发现摘要新增 formal 人工真连清单入口：JSON 带 `formalChecklistCommand` / `manualChecklistSummary`，`--boardSummary` 带 `FormalChecklist=` 与 `ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics`，发现到 Windows host 后可直接进入清单验收。
- [x] 增加中文错误提示。
- [x] 增加假 Mac 错误模拟。
- [x] 增加意外断线自动重连。
- [x] Windows 控制端自动重连等待态增加倒计时和“立即重连”按钮，页面级 diagnostics 回归覆盖按钮显示、倒计时文案和手动立即重连清理计时器。
- [x] Windows 控制端导出日志会写入重连状态、重连原因和下次重连倒计时，方便现场断线后直接发日志定位恢复过程。
- [x] 增加文本剪贴板同步消息。
- [x] 增加 Windows Tauri 桌面壳。
- [x] 构建 Windows 桌面 exe。
- [x] 桌面壳增加本机被控入口，可选择低风险/部署/深度体检、预览防火墙命令、启动/停止 Windows host。
- [x] 连接真实 Mac 被控端。
- [x] 正式 Mac E2E 无密预检可输出执行计划、耗时和安全边界。
- [x] 正式 Mac E2E 支持自动发现最佳 Mac host，预检 JSON 会记录选址结果。
- [x] 正式 Mac E2E 增加 PowerShell 包装入口，可用 `-Discover -PreflightOnly -BoardSummary` 做无密码预检，或用 `-Discover -PromptPassword` 在 Windows 本机隐藏输入正式密码后跑完整验收。
- [x] Windows 控制端页面自检支持自动发现最佳 Mac host 后再跑无密 UI runtime 验收。
- [x] 底层 Mac host 探针支持自动发现最佳 Mac host 后再做认证、媒体、剪贴板和 input-log 验收。
- [x] PowerShell Mac host 验收入口支持 `-Discover` 自动发现；发现失败先退出，不弹密码框，方便 Windows 端无手填 IP 做 H.264、音频、剪贴板和 input-log 探针。
- [x] Windows Mac host 底层探针支持真实输入注入强校验：`--expectInputInjected true|false` 校验 `input_ack.injected`，`--inputEventSet safe` 默认只发鼠标移动和 F13，避免真机 inject 验收时误点或把 log-only ack 误判为通过。
- [x] 真实 Windows 控制 Mac safe inject 小验收通过：2026-06-16 连接 `192.168.31.122:43770` / runtime build `d398d64` / `inputMode=inject`，Windows 本机隐藏输入密码后 safe set 2 个事件均 `input_ack injected=true`，未执行点击、Delete、Ctrl+A 或 full event set；后续复跑 Mac 端启动 inject host 必须带 `--confirmUserWatching`。
- [x] Windows 端新增恢复开工总览 `scripts/windows/check-windows-resume-status.mjs --checkBoard --boardSummary`：只读汇总 git、通讯板、Mac formal preflight、自动发现目标和下一步命令；不认证、不要求密码、不发送输入、不执行 `inject`。
- [x] Windows 恢复开工总览新增 PowerShell 包装入口 `scripts/windows/check-windows-resume-status.ps1 -CheckBoard -BoardSummary`，并可加 `-CheckClientDiagnostics` 做无密 Windows 控制端页面诊断。
- [x] Windows 恢复开工总览优先结构化读取 Agent Link Board `/api/state` 的 `currentCall`，失败时才退回旧命令输出解析：`--checkBoard --json`、普通输出和 `--boardSummary` 会显示 active Mac -> Windows 呼叫方向/目标，DONE call 不会误当作待办，方便 Windows 接手时直接响应 Mac 端正式测试请求。
- [x] Windows 恢复开工总览会输出 Windows host 媒体基线命令：JSON、普通输出和 `--boardSummary` 都会给出 `check-windows-host-readiness --checkBoard --probeMedia --boardSummary`，方便 Mac 反控 Windows 前一键刷新视频/音频基线。
- [x] Windows 恢复开工总览会输出本机一次性反控授权命令：JSON、普通输出和 `--boardSummary` 都会给出 `ReverseGrant=allow-windows-reverse-control --host 127.0.0.1 --port 43770 --durationMs 30000 --boardSummary`，方便 Windows 恢复开工时直接打开短时授权后让 Mac 重试反控请求。
- [x] Windows 恢复开工总览的 JSON/普通输出会输出本机 Mac 提醒 watcher 启动和状态命令：`start-mac-alert-watcher.ps1 -Server <Agent Link Board>` / `-Status`，方便窗口最小化或等待 Mac 授权/反控重试时直接开启 Windows 浮窗提醒；`--boardSummary` 仍保持短摘要。
- [x] Windows 恢复开工总览会只读显示本机 Mac 提醒 watcher 运行状态：JSON 带 `windowsMacAlertWatcher.state/running`，普通输出显示 `Windows Mac alert watcher: running/not-running/unknown/unavailable`，不会自动启动 watcher。
- [x] Windows 恢复开工总览现在优先调用 `start-mac-alert-watcher.ps1 -Status -Json` 读取 watcher 状态；JSON 会保留 `source=json`、原始 `payload` 和 `parseError`，只有机器可读输出不可用时才退回旧文本解析。
- [x] Windows 恢复开工总览会输出 Windows 控制端无密页面诊断命令和页面内“复制诊断 / 快速摘要”提示：JSON、普通输出和 `--boardSummary` 都会给出带 `--boardSummary` 的 `WinClientDiagnostics=` 与 `CopyDiagnostics=`，方便真连现场先发一行页面诊断，再复制 Windows 控制端诊断报告定位 UI 卡点。
- [x] Windows 桌面版“本机被控”面板新增“Mac 提醒”区：可只读刷新本机 alert watcher 状态，也可一键开启或停止 Windows 浮窗提醒；浏览器预览版保持禁用，页面自测覆盖按钮、默认联络板地址和运行/未运行文案。
- [x] Windows 桌面版“Mac 提醒”自动状态轮询已节流：本机状态轮询仍为 2.5 秒，但 watcher PowerShell 状态查询约 15 秒一次；手动刷新和开启/停止按钮仍即时执行，页面自测锁定节流阈值。
- [x] Windows 控制端导出日志/状态快照会写入本机 Mac 提醒 watcher 状态、详情、最近检查时间、自动轮询间隔和联络板地址，方便远控窗口最小化后复盘 Windows 侧是否开了浮窗提醒。
- [x] Windows 控制端导出日志/状态快照会写入本机被控 Windows host 状态、徽标、详情、端口、画面/声音/输入/反控策略、体检档位、媒体基线开关和最近状态输出脱敏摘要，方便 Mac 反控 Windows 时复盘 Windows 侧是否已准备好。
- [x] Windows 控制端事件面板新增“复制诊断”按钮：复用同一份脱敏导出日志文本写入系统剪贴板，方便现场直接粘贴给 Codex 或发到 Agent Link Board；页面 diagnostics 回归覆盖复制内容和脱敏。
- [x] Windows 控制端导出/复制诊断报告已整理为“连接状态”和“本机协作”分段，现场粘贴后可更快区分远端 Mac 连接问题和 Windows 本机 host / 提醒 watcher 准备状态。
- [x] Windows 控制端导出/复制诊断报告顶部新增“快速摘要”，一屏内先汇总远端连接、重连、本机协作和画质请求；页面 diagnostics 回归覆盖摘要和复制内容。
- [x] Windows 控制端页面自检新增 `--boardSummary`：diagnostics-only 或真实连接成功后 stdout 输出一行无密 `Windows client diagnostics` 摘要，详细进度转 stderr，便于直接发 Agent Link Board。
- [x] Windows 控制端远端文件托盘补齐接收中/失败状态条：文件 offer、分块进度、超限拒绝、解析失败和不完整完成都会直接显示在“远端文件”面板；页面 diagnostics 回归覆盖文件尚未完成时的状态可见性和超限拒绝提示。
- [x] Windows 控制端远端文件接收新增超时/中断恢复：45 秒无新分块或完成消息、连接中断或重新连接会停止正在接收的 transfer，托盘状态条显示已收/总量和重试提示，并向对端返回失败结果；页面 diagnostics 覆盖超时后状态、Map 清理和不泄密。
- [x] Windows host 启动/状态助手也支持 `--status --checkBoard` / PowerShell `-Status -CheckBoard`：只读读取 Agent Link Board `/api/state.currentCall`，JSON、普通输出和 `--boardSummary` 会提示 active Mac -> Windows call，DONE call 不进入待办摘要，不启动 host、不认证、不发送密码、不执行 `inject`。
- [x] Windows host 启动/状态助手 `--status` 也会输出本机媒体基线命令：JSON 带 `windowsHostMediaReadinessCommand`，普通输出和 `--boardSummary` 带 `WindowsHostMedia=check-windows-host-readiness --checkBoard --probeMedia --boardSummary`，方便 Mac 反控前刷新视频/音频基线。
- [x] Windows host 启动/状态助手和 readiness 摘要也会输出视频能力体检命令：JSON 带 `windowsVideoEncoderSupportCommand`，普通输出和 `--boardSummary` 带 `WindowsVideoSupport=check-windows-video-encoder-support --boardSummary`，方便 H.264/WGC/WebCodecs 调试前先发无密能力摘要。
- [x] Windows host PowerShell 包装入口支持 `-Help` / `-h` 纯帮助：说明 `-Status -CheckBoard -BoardSummary`、`WindowsHostMedia=`、`WindowsVideoSupport=` 和 `ReverseGrant=`，不会启动 host、不会认证、不会要求或打印密码。
- [x] Windows 视频能力体检支持 PowerShell 包装入口：`check-windows-video-encoder-support.ps1 -BoardSummary/-Json/-RequireAnyH264/-RequireHardwareH264/-RequireWgc/-RequireWebCodecsH264`，专项回归覆盖 Node 和 PowerShell 输出一致性。
- [x] Windows WGC/WinRT/GPU 专项预检支持 `--boardSummary` 和 PowerShell 包装入口：`check-windows-wgc-support.ps1 -BoardSummary/-Json/-RequireSupported` 可输出一行无密摘要；`check-windows-resume-status` 现会给出 `WindowsWgcSupport=` / `WindowsWgcSupportPs=`，便于把采集前置条件从综合视频体检里单独拎出来排查。
- [x] Windows host readiness 支持 PowerShell 包装入口：`check-windows-host-readiness.ps1 -CheckBoard -BoardSummary/-Json/-Profile deploy/-ProbeMedia` 可直接走同一套 Node 体检逻辑；`-Help/-h` 纯帮助不会启动 host、不会认证、不会要求或打印密码，专项回归覆盖 Node/PowerShell 的 help、JSON、boardSummary 和不泄密。
- [x] Windows PowerShell 入口建立统一 `-Help/-h` 纯帮助覆盖自检：`test-windows-powershell-help.mjs` 自动发现带 `Help` switch 的 `.ps1`，当前覆盖 18 个入口、36 条命令，包含 `test-windows-host.ps1`、`dev-lab.ps1`、`test-windows-client-browser.ps1`、`check-webcodecs-h264-support.ps1` 和 `check-windows-wgc-support.ps1`；已锁定帮助路径不启动 host/watcher/Agent Link、不改机器环境、不初始化 WASAPI/采集声音、不认证、不发送密码/Token/input/inject。
- [x] Windows PowerShell help 自检支持 `--boardSummary`：可一行输出 Windows PowerShell 或 PowerShell 7 的 36/36 覆盖摘要，`--json` 同步带 `boardSummary` 字段；`check-windows-resume-status` 的 JSON/普通输出/`--boardSummary` 也会给出 `PowerShellHelp=` 和 `PowerShellHelpPwsh=` 两条无密命令。
- [x] Windows WebCodecs H.264 浏览器探针支持 `--boardSummary` 和 PowerShell 包装入口：`check-webcodecs-h264-support.ps1 -RequireCodec avc1.42C02A -BoardSummary` 可输出无密单行摘要；探针已补 DevTools 硬超时和 Edge 临时进程清理，`check-windows-resume-status` 会给出 `WindowsWebCodecs=` / `WindowsWebCodecsPs=`。
- [x] Mac host 启动/状态助手也支持 `--status --checkBoard`：只读读取 Agent Link Board `/api/state.currentCall`，JSON、普通输出和 `--boardSummary` 会提示 active call，DONE call 标为 inactive，摘要不回显 command；`--boardSummary --checkBoard` 会自动走 status，不会误启动 host。
- [x] Windows 桌面版“本机被控”面板的体检和状态刷新也会启用 `--checkBoard`：UI 会提示 active Mac -> Windows call 为“Mac 正在请求 Windows 配合”，DONE call 不当作待办，且不回显 call command。
- [x] Windows 桌面版“本机被控”面板接入反控策略选择和状态显示：启动前可选“需确认 / 实验同意 / 关闭”，默认“需确认”并透传给 `start-windows-host --reverseControlMode deny`；状态区会显示实际 `capabilities.reverseControl`，避免 Mac 反控 Windows 前误开自动同意。
- [x] Windows host 和桌面“本机被控”面板支持一次性临时反控授权：Windows 本机点击“临时允许反控”后打开约 30 秒窗口，下一次 Mac `reverse_control_request` 会通过并立即消耗；默认 `deny-confirm`、实验 `accept-lab` 和禁用 `disabled` 语义保持不变，授权管理端点只允许回环访问。
- [x] Windows 本机临时反控授权新增命令行备用入口：`allow-windows-reverse-control.mjs` 可只读查看、打开一次性授权、撤销授权，并输出无密 JSON 或 Agent Link Board 单行摘要；专项回归覆盖在线授权/撤销和离线安全摘要。
- [x] Windows 本机临时反控授权支持 PowerShell 包装入口：`allow-windows-reverse-control.ps1 -BoardSummary/-Status/-Revoke/-Json` 可在 PowerShell 7 或 Windows PowerShell 中直接查看、授权、撤销；专项回归覆盖 Node/PowerShell 在线、离线和帮助输出。
- [x] Windows resume/status/readiness 摘要接入 PowerShell 7 版一次性反控授权命令：`check-windows-resume-status`、`start-windows-host --status` 和 `check-windows-host-readiness` 都会在 JSON/普通输出/`--boardSummary` 中新增 `ReverseGrantPs=` 或 `windowsReverseControlGrantPowerShellCommand`，同时保留旧的 Node `ReverseGrant=` 备用命令；专项回归覆盖在线、离线、PowerShell wrapper help 和 boardSummary。
- [x] Windows host `--status` 和 Windows readiness 摘要会直接给出 `ReverseGrant=allow-windows-reverse-control --boardSummary`：默认需确认策略下，无论是普通状态、JSON、启动后 ready 输出还是 Agent Link Board 一行摘要，都能看到本机临时授权命令；readiness 压缩 runtime 摘要时也会独立保留该命令。
- [x] Windows host 会记录最近一次被默认安全拒绝的反控请求，并通过 `/discovery.capabilities.reverseControlGrant.lastRequest` 暴露给本机面板；Windows 桌面“本机被控”状态会显示“反控：刚收到请求”和临时授权后重试提示。
- [x] Windows readiness runtime/boardSummary 保留反控授权窗口和最近请求状态：运行中 host 有一次性授权时显示 `reverse=temporary-grant`，刚安全拒绝过 Mac 请求时显示 `reverse=pending-request`，专项回归用本机临时 host 覆盖两种状态。
- [x] Mac client 增加受保护的“请求反控/重试反控”入口：只在已连接、已认证且 Windows host 声明支持反控接收时可点；点击只发送 `reverse_control_request`，显示 `reverse_control_response` 的 `LAN008` 安全拒绝、Windows 临时授权重试提示和 accepted/临时授权已使用状态，页面自测覆盖默认拒绝、回环临时授权、重试成功、不泄露密码和不发送额外输入事件。
- [x] Mac client 在 `LAN008`、最近请求或临时授权状态下直接显示并可一键复制 Windows 本机 PowerShell 推荐一次性授权命令：`allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port <Windows host port> -Grant -DurationMs 30000 -BoardSummary`，并展示 Node 备用命令；accepted 后隐藏命令，页面自测覆盖 PowerShell 复制、Node 备用显示和无额外输入事件。
- [x] Mac client 事件日志新增“复制诊断”按钮：复用同一份不含连接密码的导出日志文本写入 Mac 浏览器剪贴板，方便现场直接粘贴给 Agent Link Board 或另一端；页面自测覆盖复制内容、脱敏和无额外输入事件。
- [x] Mac client readiness 摘要新增 `CopyDiagnostics=`：JSON、普通输出和 `--boardSummary` 都提示在事件日志点击“复制诊断”，方便现场先发一行 readiness 后再粘贴完整页面诊断。
- [x] Mac client readiness 摘要新增 `MacClientPage=` / JSON `commands.macClientPageStatusCommand`：直接指向 `start-mac-client --status --boardSummary`，方便单独跑 readiness 时先确认本地页面在线；该命令只读、不启动页面、不连接 Windows、不认证、不发送 input/inject。
- [x] Mac client 本地页面启动/状态助手摘要新增 `CopyDiagnostics=`：`start-mac-client --status --boardSummary` 页面在线时提示在事件日志点击“复制诊断”，页面离线时提示先启动页面、在线后再复制诊断；专项自测覆盖 JSON 内摘要、真实 stdout 单行摘要、在线/离线摘要和不泄密。
- [x] Mac client 本地页面启动/状态助手 JSON 新增 `commands`：`macClientStartOrReuseCommand`、`macClientFormalStatusCommand` 和 `macClientCopyDiagnosticsAction` 可供恢复总览或自动化直接消费；自测覆盖离线、启动、在线 status 和 allowExisting 路径，确认命令不带密码。
- [x] Mac client formal checklist/smoke 的 runPlan 和通讯板摘要补齐反控请求安全演练：Mac 请求预期 `LAN008`，Windows 本机优先用 PowerShell 一次性授权，Node 命令作为 fallback，Mac 重试预期 accepted/临时授权已使用；命令和自测均锁定不发密码、不发送输入事件、不执行 `inject`。
- [x] Mac formal smoke 的 discovery 结果透传人工真连清单：`run-mac-client-formal-smoke --discover --preflightOnly --boardSummary` 会在摘要里显示 `FormalChecklist=` 与 `ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics`，JSON `discovery` 也带对应字段。
- [x] Mac `.mjs` 工具脚本建立统一 `--help/-h` 纯帮助覆盖自检：`test-mac-script-help.mjs` 当前覆盖 44 个脚本、88 条帮助命令，并拒绝帮助路径误启动服务、弹密码提示、输出真实环境密码、启动 DevTools/Swift build、连接真实 host 或读取 Agent Link Board 状态；`--boardSummary` 可输出一行无密上板摘要，并由 `test-mac-script-help-summary.mjs` 专项锁定。
- [x] Mac 恢复开工总览也可解析 Agent Link Board `currentCall`：`--checkBoard --json`、普通输出和 `--boardSummary` 会显示 `call=active/done/none`，DONE 呼叫不会误当作待办，摘要不回显 call command。
- [x] Mac 恢复开工总览会输出本地 Mac client 页面状态命令：JSON `commands.macClientPageStatusCommand`、普通输出和 `--boardSummary` 都带 `MacClientPage=start-mac-client --status --boardSummary`，只读检查页面是否在线，不启动服务、不连接 Windows。
- [x] Mac 恢复开工总览会输出 Mac client 无密诊断和复制诊断提示：JSON、普通输出和 `--boardSummary` 都带 `MacClientDiagnostics=check-mac-client-readiness --probeClientServer --checkBoard --boardSummary` 与 `CopyDiagnostics=Mac client 事件日志点击“复制诊断”`，方便现场先发一行 readiness，再粘贴完整页面诊断。
- [x] Mac 恢复开工总览会输出 Windows host 发现命令：JSON `commands.macClientDiscoverWindowsCommand`、普通输出和 `--boardSummary` 都带 `MacClientDiscoverWindows=discover-windows-hosts --boardSummary`，方便恢复后先只读发现 Windows host，再跑 formal checklist；不认证、不发送 call/input/inject。
- [x] Mac 恢复开工总览会输出 Mac client formal 人工真连清单命令：JSON `commands.macClientFormalChecklistCommand`、普通输出和 `--boardSummary` 都带 `MacClientFormalChecklist=check-mac-client-formal-status --boardSummary`，方便恢复后直接拿到 `ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics`；不认证、不发送 call/input/inject。
- [x] Mac 恢复开工总览会输出本机 formal local smoke 命令：JSON `commands.macFormalLocalSmokeCommand`、普通输出和 `--boardSummary` 都带 `MacFormalLocalSmoke=check-mac-formal-local-smoke --promptPassword --boardSummary`，正式呼叫 Windows 前可先本机短验收 H.264/PCM/input-log 并得到一行上板摘要；命令显式弹密码，不把密码放 argv，不发送 call/input/inject。
- [x] Mac 恢复开工总览会输出 formal E2E 只读预检命令：JSON `commands.macFormalE2eStatusCommand`、普通输出和 `--boardSummary` 都带 `MacFormalE2E=check-mac-formal-e2e-status --boardSummary`，正式呼叫 Windows 前可先一行确认 repo/联络板/Mac host/权限/媒体/剪贴板/display/build 是否 ready；不弹密码、不发送 call/input/inject。
- [x] Mac formal E2E 只读预检也会输出本机短验收命令：JSON `commands.macFormalLocalSmokeCommand`、`callText` 和 `--boardSummary` 都带 `MacFormalLocalSmoke=check-mac-formal-local-smoke --promptPassword --boardSummary`，长时间正式验收前先提醒本机短验 H.264/PCM/input-log；不自动运行 smoke、不弹密码、不发送 call/input/inject。
- [x] Mac 恢复开工总览会输出 Mac 脚本 help 安全自检命令：JSON `commands.macScriptHelpCommand`、普通输出和 `--boardSummary` 都带 `MacScriptHelp=test-mac-script-help --timeoutMs 10000 --boardSummary`，提醒修改 `scripts/mac/*.mjs` 后跑统一 `--help/-h` 副作用防线并得到一行上板摘要。
- [x] Windows 恢复开工总览支持 `--userAuthRequest` / PowerShell `-UserAuthRequest`，预检 ready 后直接输出可发 Agent Link Board 的 `NEED_USER_AUTH` 文本和固定目标 PowerShell 正式验收命令。
- [x] Windows 恢复开工总览支持显式 `--sendUserAuthRequest` / PowerShell `-SendUserAuthRequest`，只在 formal preflight ready 时把无密授权提示发到 Agent Link Board，未 ready 时拒绝发送。
- [x] Windows formal E2E runner 支持 `--sendUserAuthRequest` / PowerShell `-SendUserAuthRequest`，在 `--preflightOnly` ready 后直接向 Agent Link Board 发送无密 `NEED_USER_AUTH`，未 ready 不发送。
- [x] Windows LAN 发现 Mac host 摘要新增 ready 后自动发送授权提醒命令：`discover-lan-hosts --boardSummary --requireMacHost` 会同时给出预检、`--userAuthRequest`、`--sendUserAuthRequest` 和正式 `--promptPassword` 命令；发现本身只读，不认证、不发密码、不执行 `inject`。
- [x] Windows formal Mac E2E 已在真实 Mac host `192.168.31.122:43770` / runtime build `c5e5009` 通过：H.264/WebCodecs、音频、文本/文件剪贴板、input-log、黑边防护和客户端诊断均 OK，node exit code 0；密码未上通讯板，未执行 `inject`。
- [x] Windows formal Mac E2E / `probe-mac-host` 长时间媒体观察新增进度心跳：视频和音频长测开始时打印目标时长，默认每 10 秒输出帧数、剩余时间、当前 FPS 和最大间隔；`--progressIntervalMs` 可调整或关闭，避免现场 5 分钟长测被误判为卡住。
- [x] Mac client 页面级自检的连接首帧、认证失败、H.264/二进制视频、音频首帧/播放、持续视频观察和重连恢复等待都已接入 `--progressIntervalMs` 进度心跳，真实 Mac 控制 Windows 验收时不再长时间静默等待。
- [x] Windows 控制 Mac 页面级自检的连接、视频 surface、H.264/WebCodecs 和 PCM 音频播放等待也接入 `--progressIntervalMs` 页面快照心跳；同轮修复 diagnostics 后连接按钮禁用状态恢复漏项，避免自检后真实连接点击无效。

共享：

- [x] 定义 hello/auth/session 消息。
- [x] 定义视频帧格式。
- [x] 定义输入事件格式。
- [x] 定义错误码。
- [x] 创建 Swift 协议消息模型。

验收：

- [x] Windows 输入 Mac IP 后能进入模拟连接。
- [x] Windows 窗口中能看到模拟 Mac 桌面。
- [x] 鼠标点击可记录为输入事件。
- [x] 键盘输入可记录为输入事件。
- [x] 断开连接不会卡死。
- [x] Windows 可通过 WebSocket 连接本机假 Mac 服务。
- [x] Windows 可接收并显示假 Mac 服务的模拟视频帧。
- [x] Windows 可记住最近连接和常用画质设置。
- [x] Windows 可显示密码错误、权限不足、视频中断等中文错误。
- [x] 黑边区域不会误发远程鼠标输入。
- [x] Windows 控制端可构建为桌面 exe。
- [x] 意外断线后 Windows 控制端会自动重连，等待时显示倒计时并可点“立即重连”，手动断开不会重连。
- [x] Windows 控制端可发送和接收文本剪贴板消息。
- [x] macOS 被控端可写入系统文本剪贴板，并把 Mac 本机复制的新文字推送给 Windows 控制端。
- [x] macOS 被控端可接收文件剪贴板块，保存到临时目录并写入系统文件剪贴板。
- [x] macOS 被控端可通过 WebSocket 完成 hello/auth/session 握手并发送模拟视频帧。
- [x] macOS 被控端可接收 `input_event` 并通过 CGEvent 注入鼠标、滚轮和常用键盘快捷键。

当前备注：

- 已完成 Windows 控制端静态原型，当前支持本地模拟和 WebSocket 协议连接。
- 已完成连接历史和设置持久化；连接密码不会写入本地存储。
- 已完成窗口缩放模式和精准坐标映射，支持适应窗口、原始比例、拉伸填充；坐标映射已抽出为 `mapping-utils.js`，并由 `scripts/windows/test-coordinate-mapping.mjs` 覆盖适应窗口黑边、原始比例滚动和拉伸填充。
- Windows 控制端已把黑边输入防护固化到页面级自检：黑边移动、点击、滚轮不会发送远控事件，画面内按下后移到黑边松开会用最后有效坐标释放，避免远端鼠标按下状态粘住。
- 已完成连接状态机和中文错误提示，假 Mac 服务可模拟常见失败场景；认证失败会显示剩余尝试次数。
- macOS 被控端已限制同一 WebSocket 连接内最多 3 次密码认证失败，失败耗尽后返回 `LAN002` 并关闭连接。
- 已完成意外断线自动重连，当前最多重试 3 次；等待下一次自动重连时会显示倒计时并提供“立即重连”，手动断开会停止重连，密码错误会停止自动重连。
- 已完成文本剪贴板协议打通，文件剪贴板仍按文件传输通道单独开发。
- macOS 被控端已接入系统文本剪贴板：远端文本写入 `NSPasteboard`，本机复制新文本会按 `host_to_client` 推送。
- 真 Mac 已通过 `--clipboardRoundTrip` 验证文本剪贴板双向同步：控制端文本可写入 Mac 系统剪贴板，Mac 本机复制的新文本可按 `host_to_client` 推回控制端。
- macOS 被控端已接入系统文件剪贴板接收：Windows 发送的文件块会落到临时目录，并写入 `NSPasteboard` 文件 URL；接收端已加固为必须先 offer、校验文件数/总大小/清单一致性、连续 offset、分块大小和逐文件磁盘大小，重复/重叠/不完整分块不能误完成，空文件仍兼容。
- 已统一 `display_settings`、`display_settings_ack`、`video_frame` 协议命名，假 Mac 服务可持续发送模拟帧。
- 已完成 Windows Tauri 桌面壳，已验证可构建 `lan-dual-control-windows.exe`。
- 已完成本机假 Mac WebSocket 联调服务；当前真 Mac 已到位，后续功能完成以真实 macOS 被控端验证为准，假 Mac 只做快速回归和失败场景模拟，并已对齐 3 次认证失败断开行为。
- 已完成 macOS 被控端 Swift WebSocket 骨架，支持 `/discovery`、hello/auth/session、模拟 `video_frame`、真实系统声音 PCM `audio_frame`、输入事件日志、文本和文件剪贴板确认。
- macOS 被控端已接入真实屏幕 JPEG `video_frame` 抓取；默认 `LAN_DUAL_VIDEO_MODE=auto`，权限不足或采集失败时自动回退模拟帧。
- macOS 被控端真实屏幕帧已改为后台采集/编码队列，支持 `LAN_DUAL_MAX_SCREEN_FPS`、`LAN_DUAL_JPEG_QUALITY` 和 `video_frame.droppedFrames` 调试字段。
- macOS 被控端已补齐 FPS 诊断字段：`session_answer`、`display_settings_ack` 和 `video_frame` 会返回 `requestedFps`、实际 `fps`、`maxScreenFps`、`frameIntervalMs`、`videoCodec` 和 `capturePipeline`。
- macOS 被控端 JPEG 调试链路默认真实采集上限改为 30 FPS；Windows 控制端会显示实收 FPS、协商帧率和请求帧率，避免把请求值误认为真实帧率。
- macOS 被控端 H.264 流式启动有 5 秒 watchdog；启动阶段未建立 `videoStream` 时会回退 `background-jpeg` 并带 `streamFallbackReason`，迟到启动成功的旧流会被 generation token 停止。
- macOS 被控端已接入 CGEvent 输入注入；当前默认 `LAN_DUAL_INPUT_MODE=log` 做安全联调，日常启动助手只有在显式 `--inputMode inject --confirmUserWatching` 或 `--injectInput --confirmUserWatching` 时才允许真实注入。
- Windows 控制端当前已可区分真实 JPEG、H.264 视频帧和模拟视频帧，并记录图片或 WebCodecs 解码失败；`scripts/windows/test-mac-host.ps1 -Discover` 可用于真机连通自检并自动发现 Mac host，显式加 `-ClipboardText -ClipboardFile` 可验证 macOS 文本和文件剪贴板写入。
- Windows 端新增 `scripts/windows/check-mac-formal-e2e.mjs` 正式 Mac E2E 聚合脚本：`--preflightOnly --boardSummary` 可只读生成可发 Agent Link Board 的无密摘要，`--preflightOnly --json` 可给自动化读取并带 `runPlan`，普通预检也会列出正式验收步骤、预计耗时、密码经环境变量传递和 `inject=false` 安全边界；`--preflightOnly --userAuthRequest` 可输出无密 `NEED_USER_AUTH`，`--preflightOnly --sendUserAuthRequest` / PowerShell `-SendUserAuthRequest` 会在预检 ready 后直接发送到 Agent Link Board，未 ready 不发送；真正验收时使用 `--promptPassword` 由用户本机隐藏输入正式密码，默认串联发现/认证/H.264 长测/音频/剪贴板/input-log/页面 H.264，密码只经环境变量传给子探针，不执行 `inject`。2026-06-16 真实 `192.168.31.122:43770` 已在 runtime build `c5e5009` 完成完整 formal E2E 并通过：H.264/WebCodecs、音频、剪贴板、input-log、页面诊断和黑边防护 OK，node exit code 0；后续复跑仍按先预检、再本机隐藏输入密码的流程，`inject` 继续单独确认。
- 真 Mac 已通过强校验探针验证真实 JPEG 首帧、H.264 Annex B 首帧和 PCM 音频帧：`-RequireRealVideo` 会拒绝 mock/fallback 视频帧，`-RequireH264` 会确认 SPS/PPS/IDR，`-RequireAudio` 会确认 `pcm-f32le-base64` payload，`-ExpectInputMode log` 可确认安全输入模式。
- Mac 端新增 `scripts/mac/observe-mac-video.mjs`，可持续观察 `video_frame` FPS、最大接收间隔、payload、codec、encoding、capturePipeline、source、显示器来源、帧 `timestamp` 接收年龄和 H.264 `timestampUs` / `durationUs` 媒体时间线；普通输出默认每 10 秒打印进度，可用 `--progressIntervalMs` 调整或关闭；真机 H.264 30 秒 877 帧约 29.2fps，最大间隔 45ms；时间线短测 H.264 3 秒 89 帧约 29.2fps、媒体间隔平均/最大 `34281/41668us`、`durationUs=33333`；Mac host 最新代码会输出带小数秒的 ISO `timestamp`，临时 43771 build 已验证 discovery/runtime 为毫秒格式且 mock `video_frame` 接收年龄 max 0ms；空闲/低变化桌面 5 分钟 H.264 约 10.6fps、60 秒复测约 10.9fps，JPEG 60 秒对照约 16.4fps，后续高 FPS 强校验需要使用动态画面或真实控制场景。
- Mac 端新增 `scripts/mac/stress-mac-host.mjs`，可循环复用 canonical 探针做 H.264 + PCM 连续连接稳定性检查；真机 50 次循环已通过，监听进程 RSS `79376->80656 KB`，FD 保持 `30->30`。脚本现可统计并阈值化完整 probe、首帧、H.264 确认和首个音频帧耗时，便于把连续建连体验退化纳入回归。
- Mac 端新增 `scripts/mac/observe-mac-audio.mjs`，可持续观察系统声音 `audio_frame` 帧率、接收间隔、payload 和电平；普通输出默认每 10 秒打印进度，可用 `--progressIntervalMs` 调整或关闭；真机 30 秒观察收到 1501 帧，约 50fps，最大间隔 24ms；5 分钟长稳收到 15001 帧，50.0fps，最大间隔 31ms；脚本支持显式 `--playTone --requireLevel` 做本机有声电平强校验，默认不播放声音。
- Mac 端新增 `scripts/mac/observe-mac-media.mjs` 媒体聚合入口：只连接已运行的 Mac host，顺序汇总 H.264 视频和系统 PCM 音频观察，支持 `--json` 和一行无密 `--boardSummary`；单路成功单路失败时摘要标为 `Mac media baseline partial`，全部执行链路失败时保留 `failed <数量>`，`--json` 提供机器可读 `summary.status=ok|partial|failed`；子观察器普通输出默认每 10 秒报告进度，`--json` / `--boardSummary` 保持 stdout 干净并把进度写到 stderr；不会启动 host、不会发送输入、不会执行 `inject`，密码只通过 `LAN_DUAL_PASSWORD` 传给子探针，默认不播放测试音。可选 `--resourceSample` 会只读读取本机 Mac host PID 并采样 CPU/RSS，采样不可用时只在摘要里标记 unavailable，不影响媒体观测成败。
- Mac 端新增 `scripts/mac/check-input-keymap.mjs`，可静态验证 CGEvent 键盘映射覆盖；当前常用 `KeyboardEvent.code`、`event.key`、同义 code/key 和修饰键 flag fallback 全覆盖。
- Mac 端新增 `scripts/mac/smoke-mac-input-log.mjs`，可在真实 Mac host 的 `inputMode=log` 下发送鼠标/滚轮/键盘/快捷键冒烟事件并强制要求 `input_ack`；真机 16/16 通过，全部为 `mode=log`、`injected=false`。
- Mac 端新增 `scripts/mac/check-mac-displays.mjs`，可验证 `/discovery`、`session_answer.displays`、`activeDisplayId` 和 `display_settings_ack`；也可加 `--requireRuntime --expectBuildId <id>` 强制确认 `/discovery` 与 `hello_ack` 来自目标 Mac host 进程；当前单屏真机 `main` round-trip 已通过，真实外接双屏采集切换仍待实物验收。
- Mac 端新增 `scripts/mac/start-mac-host.mjs` 日常安全启动助手：默认 `inputMode=log`，打印 Windows 端可填写的局域网地址，等待 `/discovery`，并默认运行 `check-mac-displays --requireRuntime --expectBuildId <build>`；`--status` 可只读查看当前 `/discovery`/runtime/权限/能力和 Windows 可连地址，不启动服务也不要求密码，运行中 build 落后当前 git 时会只比较 `apps/mac-host` 运行源码并提示是否有 host 行为相关改动，`--status --json` 会输出只含 JSON 的机器可读状态对象；`--status --checkBoard` 会只读读取 Agent Link Board `/api/state.currentCall`，普通输出、JSON 和 `--boardSummary` 会提示 active call，DONE call 标为 inactive，摘要不回显 command，且 `--boardSummary --checkBoard` 会自动转入 status 防止误启动服务；`--stop` 可安全停止本机 `/discovery` 对应的 Mac host PID，不读取密码、不认证 WebSocket，并拒绝非本机或非 Mac discovery；真机局域网联调建议加 `--promptPassword --requirePassword`，它会先响两声并输出不含密码的前台弹窗提示，再优先打开 macOS 系统隐藏密码弹窗，系统弹窗失败时才尝试原生 AppKit 前台高层级隐藏密码框，避免空密码或 `demo-password`；显式 `--background` 可在 `/discovery` 和 runtime/display 校验通过后让 host 后台常驻，并把日志写到 `.dev-lab/mac-host/` 或 `--logFile <path>` 指定位置；临时恢复无密码 `/discovery`/runtime 诊断通道可用 `--ephemeralPassword --requirePassword` 生成一次性随机密码且不打印。
- Mac 端新增 `scripts/mac/check-mac-resume-status.mjs` 恢复开工轻量总览：只读汇总 git 状态、可选联络板快照、Mac host `/discovery`、权限、能力、LAN 地址、Agent Link Board `currentCall` 和运行中 build 到当前 git 的 Mac host runtime 源码差异；不会启动服务、不会认证 WebSocket、不会要求或打印密码、不会发送输入事件。适合双方早上恢复、发最终状态、或正式密码验收前先判断是否需要先响应 active call、重启 host 或修权限；JSON、普通输出和 `--boardSummary` 会给出 `MacFormalE2E=check-mac-formal-e2e-status --boardSummary` 只读正式验收预检入口；`--boardSummary` 可输出适合直接发到联络板的秘密安全摘要，`--json` 可供自动化消费，`--requireOnline` / `--requireClean` / `--requireNoRuntimeChanges` 可把对应问题转成失败。
- Mac 端新增 `scripts/mac/check-mac-formal-e2e-status.mjs` 正式端到端验收清单：复用 resume status，只读汇总 repo、联络板、Mac host、LAN 地址、`inputMode=log`、权限、H.264、系统 PCM、剪贴板、显示器和 buildDiff，输出 `readyToCall`、checklist、`callText` 和可直接发 Agent Link Board 的 `--boardSummary`；JSON、`callText` 和摘要会同时给出 `MacFormalLocalSmoke=check-mac-formal-local-smoke --promptPassword --boardSummary`，提醒长时间正式验收前先本机短验 H.264/PCM/input-log；不会启动服务、不会认证 WebSocket、不会要求或打印密码、不会发送输入事件，并会明确把 `inject` 标为跳过。`--sendCall` 只有 ready 时才会发无密 formal call；旧 runtime 源码变化等未 ready 场景会在 JSON 错误中保留具体 blocker、下一步和变动文件，且不会触碰通讯板发送。发 call 和 `--clearStaleCall` 前会直接读取 Agent Link Board `/api/state`，完成态 `currentCall` 记录但不阻塞，active call 仍默认保护；`--clearStaleCall` 可在 checklist 不 ready 时清理本脚本此前发起的过期 Mac formal E2E call，但会保留其他端/其他目标的 call。
- Mac 端新增 `scripts/mac/check-mac-formal-local-smoke.mjs` 正式端到端前本机短验收聚合脚本：复用 H.264、PCM 和 input-log 探针，默认要求正式密码来自 `LAN_DUAL_PASSWORD` 或 `--promptPassword`，拒绝空密码和 `demo-password`；`--promptPassword` 会先响两声并输出不含密码的前台弹窗提示，再优先打开 macOS 系统隐藏密码弹窗，系统弹窗失败时才尝试原生 AppKit 前台高层级隐藏密码框，密码只经环境变量传给子进程；不会启动 host、不会打印密码、不会执行 `inject`。支持 `--json` 完整结构和 `--boardSummary` 一行无密摘要；`scripts/mac/test-mac-formal-local-smoke.mjs` 用临时假 Mac host 覆盖密码安全、boardSummary 和三探针聚合成功。
- Mac 端新增 `scripts/mac/check-mac-host-readiness.mjs` 一键体检聚合脚本：默认只读检查 Node/Swift、Mac host build、直接启动输入默认值、启动助手语法/干跑、键盘映射覆盖和 `/discovery` 状态；`--checkBoard --boardSummary` 会只读 Agent Link Board `/api/state.currentCall`，把 active call 带进 JSON/普通输出/无密摘要，DONE call 标为 inactive 且摘要不回显 command；可加 `--probeVideo --probeAudio --probeMedia --probeInputLog --probeStartHelper --probeClipboardSecurity` 串联真实 H.264、PCM、媒体聚合、log 输入、启动助手临时端口自测和文件剪贴板接收完整性安全回归，其中 `--probeMedia --boardSummary` 会显示 `media=ok|partial|failed` 并保留 passed/failed 计数。正式密码 host 做深度探针时可加 `--promptPassword`，它会先响两声并输出不含密码的前台弹窗提示，再优先打开 macOS 系统隐藏密码弹窗，系统弹窗失败时才尝试原生 AppKit 前台高层级隐藏密码框，readiness 会通过环境变量传给子探针，不放进命令参数。Mac host 最新源码已用 `IOHIDCheckAccess` 只读探测真实 Input Monitoring 状态，不再把 `/discovery.permissions.inputMonitoring` 硬编码为 `false`；readiness 也会默认提示运行中 host build 是否落后当前 git，并列出旧 build 后变动的 Mac host runtime 源码文件，支持 `--requireInputMonitoring` 单独强制输入监控权限。常用部署验收可用 `--profile deploy`，深度本机部署验收可用 `--profile deep`，其中 deep 会自动包含 `--probeClipboardSecurity`。
- Mac 端新增 `scripts/mac/check-mac-client-readiness.mjs` Mac 控制 Windows 真连前只读预检：默认检查 repo、Mac client 静态文件和 JS 语法；可选 `--probeClientServer` 检查本地 Mac client 页面，可选 `--host <Windows IP> --port 43770` 检查 Windows host `/discovery`，可选 `--checkBoard` 读取 Agent Link Board；支持 `--boardSummary` 和 `--json`，并在 JSON、普通输出和摘要里带 `CopyDiagnostics=Mac client 事件日志点击“复制诊断”`。脚本不会启动 Mac client、不会启动或认证 Windows host、不会要求或打印密码、不会发送输入事件；自测覆盖离线/require 失败、普通输出、复制诊断提示、临时 Mac client server 和 mock Windows discovery。
- Mac 端新增 `scripts/mac/check-mac-client-formal-status.mjs` Mac 控制 Windows 正式真连清单：复用 readiness，把 repo 干净、本地 Mac client 页面在线、Windows host `/discovery` 在线、Agent Link Board 可读、H.264/音频/input-log/剪贴板能力可见整理为 `readyToCall`、`callText`、`runPlan` 和 `boardSummary`；`runPlan` 列出本地页面、Windows discovery、formal checklist、浏览器 smoke 和质量/资源观察步骤，并明确 `passwordInCommandArguments=false`、`passwordOnAgentLinkBoard=false`、`inject=false`。清单不认证、不要求密码、不发送输入；本地 Mac client 页面离线时会提示 `start-mac-client --allowExisting` 和 `run-mac-client-formal-smoke --ensureClient` 两条低摩擦恢复路径，JSON commands 也包含 `safePreflightWithEnsureClient`、`sendCallWithEnsureClient` 和带 `--ensureClient` 的 `browserSmoke`；显式 `--sendCall` 只有 ready 时才会发 Mac Codex -> Windows Codex 的无密正式 Windows host 验收 call，发送前直接读取 Agent Link Board `/api/state`，完成态 `currentCall` 不阻塞，已有 active call 默认拒绝覆盖，协调后可加 `--forceCall`；自测用临时 Mac client server、mock Windows discovery 和假 Agent Link Board 覆盖 ready shape、runPlan、`--ensureClient` 提示、ready 发送、离线拒绝、已有 call 拒绝、DONE call 不阻塞和 force 覆盖。
- [x] Mac client formal checklist 的 `runPlan.manualChecklist` 新增人工真连验收清单：连接/认证、视频、音频、剪贴板、input_ack 和复制诊断/日志证据六项；普通输出和 `--boardSummary` 都会提示 `ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics`，方便 Mac -> Windows 轻量联调逐项验收。
- Mac 端新增 `scripts/mac/run-mac-client-formal-smoke.mjs` Mac 控制 Windows 真连浏览器冒烟执行器：可加 `--discover` 先只读扫描 Windows `/discovery` 自动选中最佳 Windows host，发现失败不会弹密码框；可加 `--ensureClient` 在预检前安全启动或复用本地 Mac client 页面，并输出 `ensuredClient` 摘要；随后跑无密 formal checklist，ready 后才认证页面；密码来自 `LAN_DUAL_PASSWORD` 或 `--promptPassword`，并只经环境变量传给子页面自检，不放 argv、不发联络板、不执行 `inject`。`--ensureClient` 只碰本机 Web 页面，不连接 Windows host、不认证、不要求或打印密码、不发送输入；`--promptPassword` 会先响两声并输出不含密码的前台弹窗提示，再优先打开 macOS 系统隐藏密码弹窗，系统弹窗失败时才尝试原生 AppKit 前台高层级隐藏密码框；预检/干跑在已有 Windows host 时会输出 `commands.sendCall`，ready 摘要会提示先用 `check-mac-client-formal-status --sendCall` 协调 Windows，且 `--server <url>` 会贯穿到内部 formal checklist、sendCall 命令和实际发送 call 的子流程；`--discover --ensureClient --preflightOnly --sendCall` 可一条命令完成发现、确保本地页面、只读预检和 ready 后无密 Agent Link Board call，未 ready 或没有 host 时拒绝发送，不认证、不弹密码；页面自检新增 `--useEnvPassword`/`--requirePassword`，正式模式联网前拒绝空密码和 `demo-password`。
- Mac client formal status/smoke 现在还会在 JSON/boardSummary/call payload 中输出 PowerShell 推荐的 `windowsReverseGrantStatus`、`windowsOpenOneTimeReverseGrant`、Node 备用的 `windowsReverseGrantStatusNodeFallback`、`windowsOpenOneTimeReverseGrantNodeFallback` 和 `reverseControlRehearsal`，把 `LAN008 -> Windows 本机一次性授权 -> Mac 重试 accepted` 写成可执行计划；Windows 授权 helper 明确只在 Windows host 本机回环运行，Mac 侧不会直接调用授权端点。
- Windows 控制端已增加 Mac 主机诊断状态条：会汇总 `/discovery.runtime`、`permissions`、`hostMode`、`capturePipeline`、`source`、WebCodecs 解码状态、`streamFallbackReason`、`droppedFrames`、`input_ack` 和剪贴板模式，真机旧进程、权限、输入拒绝、解码失败或 H.264 启动回退问题可直接在画面内看到。
- Windows 控制端已把顶部“延迟”改为真实“帧延迟”：收到 `video_frame.timestamp` 后显示帧到达新鲜度，诊断条同步显示 `到达 <ms>`，没有真实时间戳时保持等待，两端系统时钟明显不一致时显示“时钟偏差”；页面级 `--diagnosticsOnly` 已覆盖正常帧年龄和时钟偏差提示。Mac 控制 Windows 的 `apps/mac-client` 也会在视频状态和会话诊断视频流行显示 `video_frame.timestamp` 到达年龄或时钟偏差，并由 `test-mac-client-browser.mjs` 默认视频路径断言；Mac client 已新增 WebCodecs H.264 canvas 接收准备，会优先请求 `h264/annexb`，不支持或失败时请求 MJPEG/JPEG 兜底，待 Windows host ffmpeg-h264 推出后做真实强校验。
- Mac 端已兼容 Windows 端现有 `kind/action/remoteX/remoteY` 输入事件字段。
- Windows 控制端已新增 Edge 页面级自检脚本 `scripts/windows/test-windows-client-browser.mjs`，可自动打开控制端、连接真实 Mac、读取诊断条并确认视频 surface；当前 Edge headless 不支持 `avc1.420029` 时已验证会自动请求 JPEG 兜底并显示真实 Mac 画面。
- Windows 控制端已接入真实 `pcm-f32le-base64` 音频播放，支持 planar/interleaved Float32 PCM 和音量滑块；页面级自检已验证真实 Mac 连接下音频播放计数递增。
- Windows 控制端页面级 `--requireH264` 已在真实 Mac host 上验证 WebCodecs H.264 解码成功，`avc1.420029:annexb` 渲染到 1920×1080 canvas；控制端会识别 Annex B/AVC 关键帧并在重配置后等待关键帧，脚本已收紧为要求 `H264Errors=0`，避免首帧非关键帧误喂产生噪声错误。
- 真 Mac 后续继续做输入注入、真实音频长时间稳定性、低延迟稳定性和更完整的键盘/输入法兼容验证。
- MSI/NSIS 安装包暂未开启，先保留桌面 exe 构建；安装包放到 M5 处理。

## 里程碑 M2：安全和控制体验

目标：能作为个人日常工具试用。

- [x] 添加固定密码认证门禁。
- [x] 添加 Windows 一键自检和联调启动脚本。
- [x] 添加 Mac host 安全启动助手和 runtime/display 自检入口。
- [x] 添加 Mac host 启动助手后台常驻模式。
- [x] 添加 Mac host 一键体检聚合脚本。
- [x] 添加中文连接状态。
- [x] 添加权限不足提示。
- [x] 添加画质设置：流畅、均衡、高清、自定义预设，联动分辨率、刷新率和码率。
- [x] 添加分辨率设置。
- [x] 添加刷新率设置。
- [x] 添加码率设置。
- [x] 添加全屏/窗口化切换。
- [x] 添加声音接收开关。
- [x] 添加设置持久化。
- [x] 添加窗口缩放模式。
- [x] 添加文本剪贴板同步。
- [x] 添加基础日志。
- [x] 添加日志导出。
- [x] 添加连接历史。

验收：

- [x] 未授权设备不能连接。
- [x] Mac 权限不足时有明确中文提示。
- [x] Windows 缩放窗口后坐标仍正确。
- [x] 全屏和窗口化切换正常。
- [x] 分辨率、刷新率、码率设置在 Windows 原型中生效。
- [x] 控制端可以接收被控端声音骨架：支持音量设置、`audio_settings_update` 和模拟 `audio_frame` 状态回传。
- [x] 控制端播放真实被控端声音。
- [x] Windows 控制端可发送和接收文本剪贴板消息。
- [x] Windows 控制端可导出连接和事件日志。
- [x] 真机两端可以同步复制文字。

## 里程碑 M3：Mac 控制 Windows

目标：反方向控制跑通。

Windows 端：

- [x] 创建 Windows 被控服务骨架。
- [x] 采集 Windows 屏幕第一版：系统截图 JPEG 帧，失败回退模拟帧。
- [x] Windows 模拟音频帧骨架。
- [ ] 采集 Windows 系统声音。
- [x] 接收 Mac 输入事件骨架。
- [x] 接收文本剪贴板并在 Windows 上写入系统剪贴板。
- [x] 接收文件剪贴板并在 Windows 上写入系统文件剪贴板。
- [x] 使用 SendInput 注入输入。
- [x] 防火墙/局域网可达性只读检查脚本。
- [x] Windows host 启动助手级防火墙友好提示和一键引导。
- [x] Windows host 显式防火墙放行助手：默认干跑/只读，用户明确同意后才尝试新增 Private TCP 入站规则。
- [x] 桌面端防火墙友好提示和一键引导。

Mac 端：

- [x] 创建 Mac 控制窗口第一版：`apps/mac-client` Web 原型。
- [x] 输入 Windows IP 连接。
- [x] 显示 Windows 画面。
- [ ] 播放 Windows 声音。
- [x] 播放 Windows PCM 音频帧入口。
- [x] 发送鼠标键盘事件。
- [x] 保存最近连接且不保存密码。
- [x] 清空最近连接且不影响密码输入框。
- [x] 意外断线后自动重连，手动断开和认证失败不会重连。
- [x] Mac client 页面级自检支持可选音频帧、PCM payload 和播放计数验收。
- [x] Mac client 页面级自检支持首次视频可见和断线恢复耗时阈值验收。
- [x] Mac client 页面级自检支持音频首帧和真实 PCM 播放耗时阈值验收。
- [x] Mac client 页面级自检支持短窗口视频持续来帧/FPS 阈值验收。
- [x] Mac client 页面级自检长等待新增进度心跳：`--observeVideoMs` 持续视频观察和 `--expectReconnect` 恢复等待会默认每 10 秒输出进度；`--progressIntervalMs` 可调整或关闭，避免现场验收误判卡住。
- [x] Mac client 会话诊断显示 Windows host runtime/build，并由页面级自检确认临时 host PID/build 已显示。
- [x] Mac client 音频状态和会话诊断显示 `audio_frame.timestamp` 到达新鲜度，并由页面级自检覆盖。
- [x] Mac client 手动断开会清空远端运行 runtime，页面级自检覆盖断开后显示“未提供”。
- [x] Mac client 意外断线等待自动重连时会清空远端运行 runtime，恢复连接后重新显示当前 host runtime。
- [x] 发送文本剪贴板到 Windows host。
- [x] 发送文件剪贴板到 Windows host 的入口。
- [x] Mac `Command` 到 Windows `Ctrl` 快捷键映射提示和页面级自检。

验收：

- [ ] Mac 可以窗口化控制 Windows。
- [ ] Windows 和 Mac 都能担任控制端或被控端。
- [x] 声音在反方向可用。
- [x] 文本剪贴板在反方向可用。

当前备注：

- 已创建 `apps/windows-host` Node.js WebSocket 被控服务骨架。
- 当前可完成 hello/auth/session 握手，未认证连接会被拒绝，同一连接内密码错误 3 次后会关闭；认证后可发送 Windows 系统截图 JPEG `video_frame`、模拟 `audio_frame`、接收 `input_event`、处理 `clipboard_text`。
- Windows 被控端在 Windows 上会用 PowerShell `Set-Clipboard` 写入系统文本剪贴板，非 Windows 开发环境回退为 `memory-only`，并在 `/discovery`、`hello_ack`、`session_answer` 暴露剪贴板模式。
- Windows 被控端 `/discovery` 和 `hello_ack` 会带可选 `runtime` 诊断：`processId`、`startedAt`、`uptimeSeconds` 和 `buildId`；启动助手和桌面壳启动路径会默认把当前 git short hash 写入 `LAN_DUAL_BUILD_ID`，方便 Mac 反控 Windows 前确认没有连到旧进程。
- Windows 被控端可接收 `clipboard_file_*` 文件块并落到临时目录；在 Windows 上会用 PowerShell `Set-Clipboard -Path` 写入系统文件剪贴板，非 Windows 开发环境回退为 `saveMode: temp`。
- Windows 被控端已接入常驻 C# SendInput helper：Windows 上通过 helper 调用 `SendInput`/`SetCursorPos` 注入鼠标、滚轮和常用键盘事件，避免每个事件重复启动 PowerShell；非 Windows 开发环境回退为日志模式。`scripts/windows/measure-windows-input-helper.mjs` 可用不支持事件安全干跑，量化 helper 冷启动和热路径延迟。
- macOS 被控端、Windows 被控端和假 Mac 服务处理输入事件后都会返回 `input_ack`，控制端和探针可确认输入已注入、仅记录或被拒绝。
- Windows 被控端已新增本机一键自检脚本 `scripts/windows/test-windows-host.ps1`，可临时启动服务并验证真实 JPEG 首帧、文本剪贴板和文件剪贴板接收；默认不发送输入事件。
- Windows 被控端 readiness 已支持 `--profile default|deploy|deep`：默认低风险、不要求 host 正在监听；默认也会跑 Windows Graphics Capture 支持预检，但在采集管线正式切换前只作为信息项，`--requireWgc` 可显式强制。`deploy` 用于 host 已启动后的部署验收，要求端口可达、运行中 build 与当前 git 一致，并跑视频/音频短观察；`deep` 额外串联 Windows host PowerShell 本机自检和文件剪贴板服务级坏包回归，单独加 `--probeClipboardSecurity` 也可把该回归纳入默认体检。WGC H.264 raw-bgra/NV12 短对照可显式加 `--probeWgcH264Sources` 纳入 readiness，但它比普通体检重，不随 `deep` 自动触发。也可单独用 `--expectBuildId`、`--requireCurrentBuildId` 和 `--skipCurrentBuildCheck` 控制 runtime build 校验强度；发现旧 build 时会尽量列出之后变动过的 Windows host 运行源码文件，方便判断是否必须重启。
- Windows 被控端 readiness 已支持显式 `--probeMedia`：复用 `observe-windows-host-media --json` 顺序跑视频+音频媒体聚合，JSON 保留 `Windows host media aggregate` 详情，`--boardSummary` 直接显示 `media=ok|partial|failed` 和 passed/failed 计数，便于 Agent Link Board 上判断是局部媒体失败还是整体失败。
- Windows 被控端已新增 `scripts/windows/check-windows-firewall.mjs` 只读检查脚本，可列出本机局域网 IP、端口监听、TCP 探测、网络配置和 TCP 入站放行规则；默认不改系统防火墙，只在缺少放行时给出管理员 PowerShell 建议命令。
- Windows 被控端已新增启动助手 `scripts/windows/start-windows-host.mjs` 和 `scripts/windows/start-windows-host.ps1`：启动服务后列出 Mac 端可填的局域网地址，等待 `/discovery` 就绪并自动跑只读防火墙/端口检查；Node 入口可用 `--status` 只读查看当前 Windows host `/discovery`、runtime/build、视频/音频/输入/剪贴板能力和旧 build 源码差异，离线时只给安全启动建议，不启动、不认证、不要求密码；`--status --json` 输出纯机器可读 JSON，PowerShell 包装也可用 `-Status` / `-Status -Json`，Windows readiness 和桌面壳面板均消费该 JSON 作为统一状态来源；`--status --checkBoard` / `-Status -CheckBoard` 会结构化读取 Agent Link Board `/api/state.currentCall`，在 Mac 已发起 Windows host 验收 call 时把 active Mac -> Windows call 带进普通输出、JSON 和无密摘要，DONE call 不当作待办；`--status --boardSummary` / `-Status -BoardSummary` 会给 Mac 端 readiness、formal checklist、ready 后的 `check-mac-client-formal-status --sendCall` 协调命令，以及 `WindowsHostMedia=check-windows-host-readiness --checkBoard --probeMedia --boardSummary` 本机媒体基线命令、`WindowsVideoSupport=check-windows-video-encoder-support --boardSummary` 视频编码/WGC/WebCodecs 体检命令和默认需确认策略下的 `ReverseGrant=allow-windows-reverse-control --boardSummary` 临时授权命令；PowerShell 包装 `-Help` / `-h` 也会说明这些安全状态入口，不会启动 host；`check-windows-host-readiness --checkBoard --boardSummary` 也会输出同类 currentCall 摘要并在压缩 runtime 摘要时独立保留 `WindowsVideoSupport=` 和 `ReverseGrant=`；需要系统声音时显式加 `--wasapi` 或 `-Wasapi`；真机联调建议加 `--promptPassword --requirePassword` 或 `-PromptPassword -RequirePassword`，避免退回 demo 密码；可加 `--dryRunFirewallRule` / `-DryRunFirewallRule` 预览放行命令，只有显式 `--addFirewallRule` / `-AddFirewallRule` 才会尝试新增 Private TCP 入站规则。`scripts/windows/test-windows-host-start-helper.mjs` 已覆盖启动助手密码安全、PowerShell `-Help/-h`、`--status`/`--status --json`/`--status --boardSummary` 在线/离线、fake board active/DONE currentCall、媒体基线命令、视频能力体检命令、反控授权命令、防火墙干跑和临时端口实启回归。
- Windows 桌面壳已新增“本机被控”面板：通过 Tauri 原生命令选择低风险/部署/深度 readiness、预览防火墙放行命令、要求隐藏密码后启动/停止 Windows host，并在 UI 内显示日志和 `/discovery` 状态；面板会消费 `start-windows-host --status --json --checkBoard` 显示真实 runtime/build、视频/音频/输入/剪贴板能力和 Agent Link Board currentCall，端口已有非托管 host 时显示“已在线”但不误启用停止按钮；默认输入模式是安全日志。
- Windows 桌面壳“本机被控”面板已新增“媒体基线”开关：默认不跑媒体，勾选后会让 Tauri 后端传 `--probeMedia`，并在体检摘要和详情中显示媒体基线正常/部分通过/失败、视频 FPS、音频 FPS、最大间隔和帧年龄。
- Windows 被控端已新增视频持续帧观察脚本 `scripts/windows/observe-windows-host-video.mjs`，可统计实际 FPS、最大帧间隔、掉帧数、采集管线、请求码率、`jpegQuality`、`video_frame.timestamp` 接收年龄和本机 host 资源摘要，并可用 `--maxFrameAgeMs` / `--requireMonotonicTimestamp` 强校验帧新鲜度；当前本机 FFmpeg gdigrab 普通启动已可协商 60Hz，720p/60Hz 旧基线约 57.1 FPS，带 `--resourceSampleTree true` 的资源对照为 49.49 FPS、进程树 CPU 平均/峰值 4.5/5.4%、工作集峰值约 309.3 MiB；System.Drawing 兜底仍约 3 FPS。
- Windows 被控端已新增显式 WASAPI loopback 系统声音入口；设置 `LAN_DUAL_WINDOWS_AUDIO_MODE=wasapi` 后可采集默认播放设备系统声音并发送 `pcm-f32le-base64`，默认未显式开启时继续发送模拟音频帧，避免误采。DirectShow PCM 入口仍保留给虚拟声卡/loopback 设备兼容验证。`observe-windows-host-audio.mjs` 已支持 30 秒稳态观察、`audio_frame.timestamp` 接收年龄统计、`--maxFrameAgeMs` / `--requireMonotonicTimestamp` 新鲜度强校验、资源摘要，以及 `--playTone --requireLevel` 短测试音电平强校验；本机 30 秒稳态 50 FPS、最大间隔 33ms，短资源对照主进程工作集峰值约 62.5 MiB，测试音最高电平 0.222。
- Windows 被控端已新增 `scripts/windows/observe-windows-host-media.mjs`，用于顺序串联视频观察和 WASAPI 音频观察并输出统一媒体基线报告，避免并发临时 host 干扰采集；现支持 `--boardSummary` 输出一行可发 Agent Link Board 的无密媒体基线摘要，包含请求分辨率/Hz/Mbps、视频 FPS/最大间隔/帧年龄、音频稳态 FPS/最大间隔/帧年龄和资源采样状态；单路成功单路失败时摘要标为 `Windows media: partial`，全部执行链路失败时标为 `Windows media: failed`，`--json` 失败路径仍返回可解析报告、`boardSummary` 和机器可读 `summary.status=ok|partial|failed`，视频/音频其中一路失败时会继续尝试另一条链路并保留成功结果，且不回显密码或执行输入；本轮音频顺序路径通过，当前桌面会话的 FFmpeg `gdigrab` 视频路径出现 `error 5` / mock fallback，真实视频基线待桌面捕获稳定后复测或由 WGC 采集替换。
- [x] Windows host 视频/音频/媒体观察新增进度心跳：`observe-windows-host-video`、`observe-windows-host-audio` 和 `observe-windows-host-media` 普通输出默认每 10 秒报告进度，`--progressIntervalMs` 可调整或关闭；`--json` / `--boardSummary` 仍保持纯输出，方便自动化和通讯板使用。
- Windows 侧已新增 `scripts/windows/test-mac-client-browser.mjs` 页面级自检，可自动启动 Windows host 和 `apps/mac-client`，确认真实 `windows-ffmpeg-gdigrab-mjpeg` 或 `windows-gdi-jpeg` 画面、Windows host runtime/build 诊断显示、默认 1080P/60Hz/20Mbps 和 2K/60Hz/40Mbps 的码率/JPEG 质量回执、`input_ack · log`、Mac `Command+C` 映射为 Windows `Ctrl+C`、最近连接保存/回填/清空且不保存密码、文本剪贴板 `clipboard_ack`、Mac 本机文本剪贴板读取/监听、文件剪贴板 `clipboard_file_result`，也可用 `--enableAudio` / `--expectAudioPayload` / `--expectAudioPlayback` 验收反控音频；Windows 本机强校验真实 WASAPI PCM 时可直接用 `--requireAudio`，认证失败可用 `--expectAuthFailure` 回归剩余次数提示；体验验收可用 `--maxInitialVideoMs`、`--observeVideoMs`、`--minObservedVideoFrames`、`--minObservedVideoFps`、`--maxReconnectRestoreMs`、`--maxAudioFrameMs` 和 `--maxAudioPlaybackMs` 把首帧、持续来帧/FPS、断线恢复、音频首帧和真实 PCM 播放耗时转为强校验。新增 `scripts/windows/test-mac-client-video-transports.mjs` 会顺序编排 4 个页面自检，统一覆盖 `binary-h264`、H.264 JSON/base64、H.264 fallback 和 `binary-jpeg`。
- Windows 侧已新增 `scripts/windows/test-auth-retry-policy.mjs`，可同时回归 Windows host 和假 Mac 服务的 3 次认证失败断开策略。
- Windows 常用检查/回归脚本已补齐 `--help/-h` 纯帮助入口：`check-windows-audio-devices`、`check-windows-firewall`、`test-auth-retry-policy`、`test-coordinate-mapping` 和 `test-windows-input-helper` 查参数时不会误触发探测、临时服务、input helper 或断言。
- Windows 侧已新增 `scripts/windows/test-windows-script-help.mjs`，可统一回归 `scripts/windows/*.mjs` 的 `--help` / `-h` 纯帮助入口；当前覆盖 45 个脚本、90 条帮助命令，并修正旧脚本 `-h` 会被忽略的问题。
- Mac 控制 Windows 已新增 `apps/mac-client` Web 原型：可连接 Windows host、显示 JPEG/data-url 画面、选择画质/分辨率/刷新率/码率并下发 `display_settings`、在会话诊断显示 Windows host runtime/build、认证失败时提示剩余尝试次数、意外断线后最多自动重连 3 次、成功连接后保存最近 host/port/时间并一键回填或清空且不保存密码、发送鼠标和键盘 `input_event`，页面提示 Mac `Command` 会按 Windows `Ctrl` 发送且自检覆盖该映射，也可手动发送文本 `clipboard_text` 并显示 `clipboard_ack`，读取/监听 Mac 本机文本剪贴板，以及选择文件后按 `clipboard_file_*` 分块发送；新增 PCM 音频播放入口，可播放 `pcm-f32le-base64` 过渡帧，mock 音频只显示状态；Windows host 已按既有 `qualityPreset`/`maxBandwidthKbps` 应用并回传 `jpegQuality`；本机 Windows host 验证已覆盖默认 1080P/60Hz/20Mbps、切换 2K/60Hz/40Mbps、runtime/build 显示、系统文件剪贴板、意外断线自动重连、首帧/断线恢复耗时阈值、短窗口视频持续来帧/FPS 阈值、Windows WGC `repeatPreviousFrame` 轻量重复帧画面保持和诊断计数、音频首帧耗时阈值和真实 WASAPI PCM 播放。
- 当前屏幕采集默认优先 FFmpeg gdigrab 持续 MJPEG，PowerShell/System.Drawing 系统截图作为兜底，全部失败时会回退模拟帧；Windows 被控端也已新增可选 `ffmpeg-h264` 过渡模式，使用 FFmpeg 输出 `video_frame.codec=h264`、`capturePipeline=windows-ffmpeg-gdigrab-h264`、`codecString` 和 `h264Encoder`，默认 `libx264`，也可通过 `LAN_DUAL_WINDOWS_H264_ENCODER` 或脚本 `--h264Encoder h264_nvenc` 切到 NVENC，可按客户端能力走 `annexb-base64` JSON 或 `annexb-binary` / `binary-h264` WebSocket 二进制帧；真实桌面权限下本机 720p/30Hz libx264 短基线为 73 帧/2.5 秒、约 28.83 FPS、最大间隔 53ms，`2026-06-15` NVENC 过渡路径已通过 H.264 输出、Mac client binary-h264 和视频传输矩阵 4/4 回归，普通沙盒上下文可能因 FFmpeg `gdigrab error 5` 回退 mock，主要用于 Mac client H.264 接收链路和编码器选择对接。WGC 目前已完成支持预检，当前 Windows 11 build `26200`、WGC WinRT 类型、`GraphicsCaptureSession.IsSupported()` 和硬件 GPU 检测均通过；`check-windows-wgc-support.mjs --boardSummary` 与 `check-windows-wgc-support.ps1 -BoardSummary` 可输出一行无密摘要，`check-windows-resume-status` 也会给出 `WindowsWgcSupport=` / `WindowsWgcSupportPs=`。`LAN_DUAL_WINDOWS_WGC_HELPER` JSON 行 helper 接入点已落地，配置 helper 后可走 `windows-wgc-helper-jpeg` 管线，新增 Rust helper `apps/windows-wgc-helper` 已能初始化 D3D11/WinRT Direct3D/GraphicsCaptureItem/frame pool/session，并已能从 `Direct3D11CaptureFrame.Surface` 读回真实帧、按请求宽高等比缩放且不放大、用 WIC `ImageQuality` 编码 JPEG 后按 JSON 行输出；本机直接真帧 `1280x720`/q0.55 本轮首帧约 96 KB，真实 Windows host + 真实 helper 短观察收到 14 帧、平均约 84 KB，体积会随桌面内容波动。新增 `benchmark-windows-wgc-settings.mjs` 可顺序跑 WGC 刷新率/码率/资源基准；当前 30/60/120Hz 会话刷新率均可协商，但静态桌面实收约 9-12 FPS。可选 repeat-last-frame 诊断模式已落地，30/60/120Hz 短基准分别约 30.45/33.92/37.78 FPS，内容年龄最大约 80-96ms；轻量信令模式也已落地，`--repeatLastFrameMode signal` 时重复帧只发 `repeatPreviousFrame=true`，60Hz/20M 短基准约 31-32 FPS，平均图片 payload 降到约 17-23 KB。`binary-jpeg` 和 `binary-h264` 可降低图片/H.264 payload 的文本传输成本；后续要继续减少编码和源帧成本，推进 WGC 采集源接 NVENC 和 Mac client 真连观感验收。音频默认未配置时继续模拟，可显式设置 `LAN_DUAL_WINDOWS_AUDIO_MODE=wasapi` 试用系统声音 loopback，或配置 `LAN_DUAL_WINDOWS_AUDIO_DEVICE` 试用 DirectShow PCM；输入注入后续重点是真实 `system` 模式手感和安全边界验收。
- Windows 端新增只读视频编码能力体检 `scripts/windows/check-windows-video-encoder-support.mjs` 和 PowerShell 包装 `scripts/windows/check-windows-video-encoder-support.ps1`，可一次汇总 FFmpeg H.264 软件/硬件编码器、WGC 预检和浏览器 WebCodecs H.264 支持，并支持 JSON/强校验/一行 `boardSummary`。本机 `2026-06-15` 强校验通过，发现 `h264_nvenc`、`h264_qsv`、`h264_amf`、`h264_mf`、`h264_d3d12va` 和 `libx264`。同日已完成显式 WGC helper JPEG -> FFmpeg/NVENC H.264 桥接原型、raw-bgra -> FFmpeg/NVENC H.264 正确性原型、raw-bgra helper 内部 `binary-frame-v1`，以及 NV12 -> FFmpeg/NVENC H.264 bridge。当前 NV12 真实 helper + `h264_nvenc` 在 `1280x720` 下 2.2 秒收到 67 帧、约 30.06 FPS，pipeline=`windows-wgc-helper-nv12-ffmpeg-h264`，`helperProtocol=binary-frame-v1`；WGC 观察/benchmark 已能输出 `freshFps`、`uniqueHelperFps`、`repeatedFramePercent` 和阈值，最新静态桌面 60Hz/20M/NV12/`h264_nvenc`/repeat-full 短测显示实收约 22.94 FPS、真实新帧约 3.93 FPS、唯一源帧约 4.59 FPS、重复帧 82.9%；benchmark 现可加 `--motionStimulus` 打开 WinForms/browser 动态窗口做对照，本机 WinForms 动态短测仍只有约 23.52 FPS、真实新帧约 4.92 FPS、重复帧 79.1%。新增 `scripts/windows/compare-windows-wgc-h264-sources.mjs` 可同条件对照 raw-bgra 与 NV12；`1280x720`、30Hz、10M、repeat-full、`h264_nvenc`、1.2 秒短测显示 NV12 胜出，FPS 约 `23.03 vs 15.58`，helper frame avg 约 `68.805ms vs 72.086ms`。下一步应推进 helper 原生硬编、helper 内部采集节奏或 Mac client 真连资源/观感对照。

## 里程碑 M4：一键反控

目标：正在连接时可以切换控制方向。

- [x] 增加 reverse_control_request。
- [x] 增加反控确认弹窗。
- [x] 增加切换方向状态机。
- [x] 增加失败回滚。
- [x] 增加当前控制方向显示。
- [x] Windows host 反控请求安全回执：未认证 `LAN002`，默认 `deny` 下认证后 `LAN008` 安全拒绝，显式实验 `accept` 才自动同意，`disabled` 会在发现能力里声明不可用。
- [x] Windows host 启动/状态/readiness 摘要显示反控策略：启动助手支持 `--reverseControlMode` / PowerShell `-ReverseControlMode`，`--status --json` 暴露 `capabilities.reverseControl`，`--boardSummary` 输出 `reverse=deny-confirm|accept-lab|disabled`。
- [x] Mac client 会话诊断显示 Windows host 反控策略：从 `/discovery` / `hello_ack` / `session_answer` 读取 `reverseControlMode` / `reverseControlPolicy` / `capabilities.reverseControl`，显示默认拒绝、实验自动同意或未启用；断线、认证失败、重连等待和手动断开会清空旧策略，导出日志包含该字段。
- [x] Mac client 会话诊断显示 Windows host 一次性临时反控授权和最近请求状态：读取 `reverseControlGrant.active` 与 `reverseControlGrant.lastRequest.active`，提示“Windows 已临时允许一次”或“Windows 已收到请求”，页面自测覆盖扁平/对象/禁用/临时授权/最近请求格式。

验收：

- [x] Windows 控制 Mac 时可以请求反控。
- [ ] Mac 确认后可以控制 Windows。
- [x] 拒绝反控时原连接保持正常。

当前备注：

- Windows 控制端已支持反控请求编号、方向状态显示、超时回滚和收到请求时的确认弹窗。
- 本地模拟和假 Mac WebSocket 服务已支持反控已同意、反控超时、对方向我发起反控三种联调场景。
- 当前“已同意”仍只完成控制端状态切换；Windows host 已能策略化回执反控请求，但默认不会无确认自动同意。真正从一端请求后由另一端自动打开/接管控制窗口的产品化流程仍待实装。

## 里程碑 M5：文件剪贴板和增强体验

- [x] 局域网自动发现骨架：控制端刷新设备并探测 `/discovery`，假 Mac 和 Windows 被控端已返回设备信息；Windows 桌面版已可通过 `scripts/windows/discover-lan-hosts.mjs` 扫描当前 IPv4 网段并合并到设备列表。命令行发现脚本已支持 `--boardSummary`、`--requireMacHost` 和 `--noLocalSubnets`，可输出 Mac formal E2E 预检、授权提醒、ready 后自动发送授权提醒和正式验收命令；刷新后若发现真实在线 WebSocket 设备，会自动选中最佳目标并显示 runtime。当前真实 Mac `192.168.31.122:43770` / runtime build `c5e5009` 已由只读 discovery、Windows client diagnostics 和完整 formal E2E 验证通过。
- [ ] 跨设备 UDP/mDNS 自动发现。
- [x] macOS 被控端 Bonjour/mDNS 广播：发布 `_lan-dual-control._tcp`，TXT 记录指向 `/discovery` 和控制端口。
- [ ] Windows/Tauri 原生层浏览 `_lan-dual-control._tcp` 并回填设备列表。
- [x] 文件、压缩包、图片等剪贴板传输骨架：控制端可选择文件并按 `clipboard_file_*` 分块发送，假 Mac 和 Windows 被控端可确认进度。
- [x] macOS 被控端文件剪贴板读写第一版：可接收 Windows 文件块并写入 `NSPasteboard`，也可读取 Mac 本机普通文件剪贴板并推送给控制端内存接收。
- [x] macOS 被控端文件剪贴板接收完整性加固：必须先 offer，再按文件数量/总大小/清单一致性/fileIndex/offset/分块上限/连续 offset/逐文件磁盘大小校验，拒绝无 offer、超大、越界、重复重叠和不完整传输；`check-mac-host-readiness --probeClipboardSecurity` 和 `--profile deep` 已能自动串联本地专项安全回归。
- [x] Windows 被控端文件剪贴板接收完整性加固：必须先 offer，再按文件数量/总大小/分块上限/fileIndex/offset/不重叠区间/逐文件 expected size 校验，拒绝无 offer、超大、重复重叠和不完整传输。
- [x] Windows 被控端文件剪贴板服务级坏包回归：`test-windows-host-clipboard-security.mjs` 通过真实 WebSocket host 覆盖无 offer、超总量/文件数、超大 chunk、重复/重叠、未接收完整、bytes 不一致和错误 fileIndex；`check-windows-host-readiness --probeClipboardSecurity` 和 `--profile deep` 已能自动串联该安全回归。
- [x] Windows 控制端为远端文件提供安全保存 UI：最近一批远端文件可在收件托盘查看、单个下载、全部下载或清空；清空会清理内存暂存和状态提示，并明确不删除系统剪贴板仍可能需要的临时目录。
- [x] Windows 控制端把远端文件写入 Windows 系统文件剪贴板：桌面版接收完成后按 1MB 原生分块保存到临时目录并调用系统文件剪贴板，原生层校验 512MB 总量、分块偏移、最终字节数并清理 7 天以上旧临时目录；系统写入失败但文件已落盘时，本地日志和托盘状态显示临时目录，可一键打开该目录并重试写入；浏览器预览版保留内存托盘。
- [ ] 大文件传输速度、剩余时间和断点续传。
- [x] 多显示器选择骨架：控制端显示 `displays` 下拉框，并通过 `displayId` 切换目标屏幕。
- [ ] 真实外接多显示器采集切换验收。（Mac host 已有枚举/回执/单屏 round-trip，自检脚本已就绪。）
- [ ] 音频延迟优化。
- [x] macOS 系统声音采集第一版：ScreenCaptureKit 输出真实 `pcm-f32le-base64`、48kHz、双声道 PCM `audio_frame`，失败时回退模拟音频。
- [x] Windows 系统声音采集第一版：WASAPI loopback 输出真实 `pcm-f32le-base64`、48kHz、双声道 PCM `audio_frame`，默认关闭，显式 `LAN_DUAL_WINDOWS_AUDIO_MODE=wasapi` 时启用。
- [x] ScreenCaptureKit 流式采集 + VideoToolbox H.264 硬件编码第一版。（已在真 Mac 上通过 `--requireH264` 首帧强校验；端到端延迟、连续重连和 CPU 占用继续作为稳定性任务推进。）
- [x] Windows host FFmpeg gdigrab + libx264 H.264 过渡模式。（显式 `ffmpeg-h264` 输出 Annex B base64，用于 Mac client H.264 接收对接；正式 Windows 低延迟采集仍优先推进 WGC。）
- [x] Windows WGC Rust helper 初始化链路。（`apps/windows-wgc-helper --probe` 可创建 D3D11/WinRT Direct3D/GraphicsCaptureItem/frame pool/session；`--mock` 已接入 Node host helper 合同。）
- [x] Windows WGC Rust helper 真实帧读回和 JPEG 输出。（默认 capture 可读取 `Direct3D11CaptureFrame.Surface`、CPU staging texture、WIC JPEG，并输出 JSON 行 frame；本机一帧 `2560x1440` 真帧自测通过。）
- [x] Windows WGC helper 请求分辨率缩放和 JPEG 质量控制。（`1280x720`/q0.55 缩放真帧自测通过；真实 Windows host + 真实 helper 短观察收到 `windows-wgc-helper-jpeg` 真帧。）
- [x] Windows WGC 刷新率/码率基准脚本。（`benchmark-windows-wgc-settings.mjs` 默认顺序跑 30/60/120Hz WGC 观察；当前会话刷新率可协商，静态桌面实收约 9-12 FPS。）
- [x] Windows WGC repeat-last-frame pacing 诊断模式。（默认关闭；开启后 60Hz/20M 短基准约 31 FPS，三档 repeat 约 30-38 FPS，已暴露 JSON/base64 重发瓶颈。）
- [x] Windows WGC repeat-last-frame 轻量信令模式。（`--repeatLastFrameMode signal` 时重复帧只发 `repeatPreviousFrame=true`，60Hz/20M 短基准约 31-32 FPS，平均图片 payload 降到约 17-23 KB。）
- [x] Windows WGC 帧节奏诊断指标。（`observe-windows-host-video` / `benchmark-windows-wgc-settings` 输出实收 FPS、真实新帧 FPS、唯一 helper 源帧 FPS、重复帧比例和内容年龄，并支持对应阈值，避免把请求 60Hz、重复帧和真实新画面混在一起。）
- [x] Windows WGC 动态画面 benchmark 刺激源。（`benchmark-windows-wgc-settings --motionStimulus` 可短暂打开 WinForms 或 browser 动画窗口；本机动态短测仍未显著提高 unique helper source FPS，指向 helper 读回/事件节奏而非单纯静态桌面。）
- [x] Windows WGC helper 内部阶段耗时诊断。（helper frame header 新增 `helperTimingMs`，Windows host 透传到 JPEG/H.264 `video_frame`，observer/benchmark 汇总 wait/try/copy/map/convert 等阶段；真实 NV12/H.264 短测显示瓶颈集中在 CPU BGRA→NV12 转换/缩放。）
- [x] Windows WGC H.264 raw-bgra vs NV12 源格式对照脚本。（`compare-windows-wgc-h264-sources.mjs` 包装现有 benchmark，输出 FPS、重复帧、helperTiming、资源 delta、`--json` 和无密 `--boardSummary`；`check-windows-host-readiness --probeWgcH264Sources` 可跑一组更短的 readiness 对照。）
- [x] Windows WGC benchmark/compare 长等待进度心跳。（`benchmark-windows-wgc-settings.mjs` 和 `compare-windows-wgc-h264-sources.mjs` 普通输出默认每 10 秒报告子进程等待进度，`--progressIntervalMs` 可调或关闭，`--json` / `--boardSummary` 保持干净。）
- [x] Mac client 接收 Windows WGC 轻量重复帧。（`--expectRepeatSignalVideo` 会启动 WGC mock helper，验证 `repeatPreviousFrame` 无 `dataUrl` 时保持上一帧可见并显示“重复”计数。）
- [x] Windows host 可选 `binary-jpeg` WebSocket 二进制视频帧。（Mac client 声明 `preferredVideoTransport=binary-jpeg` 后，JPEG 元数据保留 JSON 头、图片改走原始 JPEG 字节；`--expectBinaryVideo` 页面级自检通过。）
- [x] Windows host `ffmpeg-h264` 模式的 MJPEG/JPEG fallback。（Mac client/WebCodecs 拒绝当前 H.264 `codecString` 后发送 `preferredVideoCodec=mjpeg` / `preferredVideoEncoding=data-url`，同一个 host 会切到 `windows-ffmpeg-gdigrab-mjpeg` 并恢复 JPEG 画面；`--expectH264Fallback` 页面级自检通过。）
- [x] Windows host 可选 `binary-h264` WebSocket 二进制视频帧。（Mac client 声明 `preferredVideoTransport=binary-h264` 后，H.264 JSON 头保留在 `LDCV1` binary frame，Annex B payload 改走原始字节；`--expectBinaryH264Video`、`--disableBinaryVideo` 兼容回归和 `binary-jpeg` 回归通过。）
- [x] Mac client 视频传输矩阵回归脚本。（`test-mac-client-video-transports.mjs` 默认顺序覆盖 `binary-h264`、H.264 JSON/base64、H.264 unsupported fallback 和 `binary-jpeg`，当前 4/4 通过，避免后续手动四连测和端口互抢。）
- [x] Mac client 视频传输矩阵外层进度心跳和上板摘要。（矩阵普通输出默认每 10 秒报告当前 case/attempt、临时端口和子进程超时剩余，并透传 `--progressIntervalMs` 给页面自检；`--json` 保持干净且带 `boardSummary`，`--boardSummary` 输出一行无密摘要。）
- [x] Mac host 媒体观察进度心跳。（`observe-mac-video`、`observe-mac-audio` 和 `observe-mac-media` 普通输出默认每 10 秒报告观察进度，`--progressIntervalMs` 可调整或关闭；`--json` / `--boardSummary` stdout 保持干净，聚合脚本把子观察器进度转到 stderr。）
- [x] Windows 视频编码能力体检脚本。（`check-windows-video-encoder-support.mjs` / `.ps1` 汇总 FFmpeg H.264 软件/硬件编码器、WGC 预检和浏览器 WebCodecs；本机强校验通过，已用于推进 WGC H.264 桥接原型。）
- [x] Windows host `ffmpeg-h264` 可选 H.264 encoder。（默认 `libx264`，支持 `LAN_DUAL_WINDOWS_H264_ENCODER` / `--h264Encoder h264_nvenc`，discovery/session/frame/观察脚本回传实际 `h264Encoder`；NVENC 路径和默认 libx264 回归均通过。）
- [x] Windows WGC H.264/硬编桥接原型。（显式 `--wgcH264Bridge`，真实 helper + `h264_nvenc` 短观察通过，pipeline=`windows-wgc-helper-ffmpeg-h264`。）
- [x] Windows WGC raw-bgra -> FFmpeg/NVENC H.264 正确性原型。（`--wgcH264Source raw-bgra` / `LAN_DUAL_WINDOWS_WGC_H264_SOURCE=raw-bgra`，真实 helper + `h264_nvenc` 短观察通过，pipeline=`windows-wgc-helper-raw-bgra-ffmpeg-h264`。）
- [x] Windows WGC raw-bgra helper 内部二进制管道。（raw-bgra H.264 bridge 默认 `binary-frame-v1`，真实 helper + `h264_nvenc` 720p 短观察约 30 FPS；静态桌面源帧仍偏稀疏。）
- [x] Windows WGC NV12 helper 内部二进制管道。（`--wgcH264Source nv12` / `LAN_DUAL_WINDOWS_WGC_H264_SOURCE=nv12`，真实 helper + `h264_nvenc` 720p 短观察约 30 FPS，pipeline=`windows-wgc-helper-nv12-ffmpeg-h264`。）
- [x] Mac client 视频传输矩阵可选覆盖真实 WGC NV12 H.264。（`test-mac-client-video-transports --case wgc-nv12-h264` 启动真实 WGC helper + `h264_nvenc`，页面级验证 `h264/binary-h264`、1080P/2K 设置切换和 `windows-wgc-helper-nv12-ffmpeg-h264` session pipeline。）
- [ ] Windows WGC helper 原生硬编，以及 Mac client 真连观感/资源验收。
- [ ] 安装包。
- [ ] 开机自启。
