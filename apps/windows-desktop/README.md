# Windows 桌面壳

这是 Windows 控制端的 Tauri 桌面壳。它复用 `apps/windows-client` 里的网页界面，目标是先把当前原型变成可运行的 Windows 桌面应用。

## 运行

先安装依赖：

```powershell
cd E:\codex\lan-dual-control\apps\windows-desktop
npm.cmd install
```

开发运行：

```powershell
npm.cmd run dev
```

Tauri 会自动启动 `apps/windows-client/server.mjs`，然后打开桌面窗口。

## 打包

```powershell
npm.cmd run build
```

当前先生成桌面 exe，不启用 MSI/NSIS 安装包。产物位置：

```text
apps\windows-desktop\src-tauri\target\release\lan-dual-control-windows.exe
```

安装包阶段后续单独处理，避免被 WiX/NSIS 下载和系统权限问题卡住。

## 当前范围

- 已接入现有中文控制端界面。
- 已支持本地模拟和 WebSocket 局域网连接方式。
- 已支持分辨率、刷新率、码率、声音、剪贴板等控制项。
- 已开始 W8 桌面视频主线：Rust 原生侧新增 `w8_native_video` 实时队列和 Tauri 命令，先把 H.264 关键帧追实时、delta 积压清理和队列快照从 Web 渲染循环里抽出来。当前是视频队列 / 接口 MVP，还没有宣称完成 Windows Media Foundation / D3D11 硬解码和原生画面绘制。
- 已增加桌面原生命令：远端文件接收完成后可分块保存到本机临时目录，并写入 Windows 系统文件剪贴板。
- 已增加桌面原生命令：用户在资源管理器复制普通文件或压缩包后，Windows 控制端按 `Ctrl+V` 可读取系统文件剪贴板路径，并按现有 `clipboard_file_*` 通道分块发送到被控端；文件夹暂不递归发送。
- 已增加“本机被控”桌面入口：可在桌面壳里体检 Windows host 环境，勾选“媒体基线”后会把 `--probeMedia` 纳入体检并显示 `media=ok|partial|failed`，也可预览防火墙放行命令、用隐藏密码启动/停止 Windows 被控端，并通过 `start-windows-host --status --json --checkBoard` 只读查看真实 `/discovery`、runtime build、视频/音频/输入/剪贴板能力、Agent Link Board 当前呼叫和启动日志。
- 已验证可构建 Windows 桌面 exe。
- 下一步再接入原生窗口菜单、托盘、配置存储、正式图标、安装包和自动启动。

## 本机被控入口

桌面版左侧会显示“本机被控”面板。默认输入模式是“安全日志”，不会无人值守地把真实键鼠事件注入 Windows；需要让 Mac 真正反控这台 Windows 时，再手动切到“真实控制”。

- `体检`：可选择低风险、部署、深度三档。低风险调用 `scripts/windows/check-windows-host-readiness.mjs --profile default --json --checkBoard`；勾选“媒体基线”时会额外传 `--probeMedia`，顺序跑视频+音频媒体聚合，并在状态区显示“媒体基线正常/部分通过/失败”；部署档会要求端口可达、运行中 host build 与当前代码一致，并跑带帧新鲜度和 timestamp 单调性强校验的视频/音频短观察；深度档会额外串联 Windows host 本机自检。面板只显示通讯板呼叫方向和目标，不回显 call command。
- `防火墙预览`：只生成放行命令预览，不修改系统设置。
- `启动`：要求填写被控密码，通过桌面原生命令启动 `apps/windows-host/server.mjs`；桌面壳会自动把当前 git short hash 写入 `LAN_DUAL_BUILD_ID`，便于体检和 Mac 端确认没有连到旧进程。
- `停止`：停止由桌面壳启动的 Windows host 进程树，避免留下 FFmpeg 或 Node 子进程。
- `状态刷新`：面板会轮询桌面壳进程状态，同时调用 Node 状态助手的 `--status --json --checkBoard` 路径。若端口上已有非桌面壳启动的 Windows host，面板会显示“已在线”和对应 runtime/capabilities，但停止按钮仍只针对桌面壳自己启动的进程；如果 Mac 已在通讯板发起 Windows host 验收 call，状态区和日志区会提示“Mac 正在请求 Windows 配合”，DONE call 只显示为非待办。

## W8 桌面视频主线

真实最小化 / 切 app 复测证明 WebCodecs + canvas 在后台调度下仍可能把 H.264 队列堆到 600ms 以上。桌面版现在新增原生视频队列 MVP：

- `get_w8_native_video_plan` 返回当前 W8 视频侧边界和下一步 native renderer 计划。
- `start_w8_native_video_session` / `stop_w8_native_video_session` 管理桌面视频会话状态。
- `push_w8_native_video_frame` 接收视频帧元数据并执行低延迟队列策略。
- `get_w8_native_video_snapshot` 返回队列帧数、队列毫秒、丢帧、关键帧请求和最近原因。

当前策略是：低延迟正常帧保留；积压时若有较新关键帧，丢旧并跳到该关键帧；没有可用关键帧时清掉 delta 积压并等待关键帧，避免旧帧继续堆积。下一步接 H.264 接收、Windows Media Foundation / D3D11 解码和原生画面绘制。

## 远端文件剪贴板

Windows 控制端收到 Mac 复制过来的文件后，桌面壳会优先使用原生分块写入：

- 前端每次把 1MB 文件块交给 Tauri，不再把整批文件一次性 base64 传给原生命令。
- 原生层会校验每个文件的分块偏移和最终字节数，写完后再调用 Windows 系统文件剪贴板。
- 当前桌面版上限与远控文件传输上限一致，为 512MB，原生命令层也会强制校验该上限。
- 新建写入任务前会尽力清理 7 天以上的旧临时目录；近期临时文件会保留，避免刚写入系统文件剪贴板后立即粘贴失败。
- 控制端事件日志会显示最近一次临时目录，远端文件工具栏可一键打开该目录；原生命令只允许打开本应用文件剪贴板临时根目录下的路径。
- Rust 单元测试已覆盖分块偏移错误、写入超出预期、未写完禁止结束、取消清理临时目录、超限拒绝和临时目录白名单。
- 旧的一次性写入命令仍保留作兼容回退。

## 本机文件剪贴板读取

Windows 桌面版会在网页剪贴板 API 读不到文件时，调用 Tauri 原生命令读取系统剪贴板的 `FileDropList`：

- 用户从资源管理器复制文件或压缩包后，在远控窗口按 `Ctrl+V`，控制端会先读取文件路径清单，再按现有 `clipboard_file_offer/chunk/complete` 分块发送。
- 原生层只登记普通文件，跳过文件夹；如果剪贴板里只有文件夹，会返回中文提示，避免无意递归发送整目录。
- 文件内容按块读取并 base64 返回给前端，前端沿用已有发送进度、等待对端确认、失败保留和重新发送逻辑。
- 读取状态在本次发送结束或失败后清理；Rust 单元测试覆盖读取 transfer、按偏移读块、越界拒绝和清理状态。
