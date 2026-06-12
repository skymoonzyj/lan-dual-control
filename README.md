# 局域网双端远控项目

这是一个为个人局域网场景设计的双端远控软件计划仓库。目标是在同一局域网内实现 Windows 和 Mac 之间的窗口化远程控制，并支持后续一键反控。

## 项目目标

- 只在局域网内直连，不依赖公网账号服务器。
- 中文界面，降低 Parsec、NoMachine 这类英文软件的使用门槛。
- Windows 可以窗口化控制 Mac。
- Mac 后续也可以窗口化控制 Windows。
- 支持一键反控：当前被控端确认后可以切换为控制端。
- 控制端可以接收被控端声音，并提供静音和音量控制。
- 支持窗口化、全屏、分辨率、刷新率、码率和画质设置。
- 支持剪贴板同步，覆盖文字、文件、压缩包等常见内容。
- 优先做个人可用版，再逐步打磨低延迟、音频、多屏、剪贴板、文件传输和安装包。

## 文档入口

- [产品策划书](docs/01-product-plan.md)
- [双端开发计划书](docs/02-dual-end-development-plan.md)
- [架构与通信协议草案](docs/03-architecture-and-protocol.md)
- [任务清单与里程碑](docs/04-task-board.md)
- [双 Codex 账号协作说明](docs/05-codex-handoff.md)
- [GitHub 使用与同步流程](docs/06-github-workflow.md)
- [Windows 开发环境说明](docs/07-windows-dev-environment.md)
- [明日工作计划](docs/08-next-work-plan.md)
- [当前开发状态](docs/CURRENT_STATUS.md)
- [下一步行动](docs/NEXT_ACTIONS.md)
- [当前文件占用](docs/ACTIVE_LOCKS.md)
- [双端交接记录](docs/HANDOFF_LOG.md)
- [双端测试联络规则](docs/TEST_COORDINATION.md)
- [流式视频编码计划](docs/09-streaming-video-plan.md)
- [局域网 Codex 联络板](docs/LAN_CODEX_LINK.md)

## 推荐开发顺序

1. 先做 Windows 控制 Mac 的最小可用版。
2. 补齐中文界面、连接密码、窗口化/全屏、分辨率、刷新率、码率、声音和文字剪贴板。
3. 再做 Mac 控制 Windows。
4. 最后做一键反控、自动发现、文件剪贴板、硬件编码、音频优化和安装包。

## 当前状态

已加入第一版 Windows 控制端静态原型，位置：

- [Windows 控制端原型](apps/windows-client/README.md)

已加入 Windows Tauri 桌面壳，位置：

- [Windows 桌面壳](apps/windows-desktop/README.md)

已加入本机假 Mac WebSocket 联调服务，位置：

- [假 Mac 服务](apps/mock-mac-host/server.mjs)

已加入 macOS 被控端 Swift 骨架，位置：

- [macOS 被控端骨架](apps/mac-host/README.md)

已加入 Windows 被控端骨架，位置：

- [Windows 被控端骨架](apps/windows-host/README.md)

已加入 Mac 控制端 Web 原型，位置：

- [Mac 控制端原型](apps/mac-client/README.md)

当前 Windows 端已经可以在“本地模拟”和“WebSocket 局域网”之间切换，并可构建为 Windows 桌面 exe。左侧设备列表已加入局域网发现骨架，可探测本机假 Mac 服务、Windows 被控端和连接历史中的 `/discovery` 接口；画质设置已加入流畅、均衡、高清和自定义预设；剪贴板已加入文件传输骨架，可手动选择文件、压缩包或图片并按块发送；显示设置已加入多显示器选择骨架；声音接收已加入音量设置、模拟音频帧和真实 Mac PCM 播放。Windows 被控端已默认优先使用 FFmpeg gdigrab 持续 MJPEG 采集，无 FFmpeg 时回退系统截图 JPEG，并已有 SendInput 输入桥、文本/文件剪贴板接收和本机自检脚本；Mac 控制端 Web 原型已可连接 Windows host、显示画面、发送输入、提示认证剩余次数、手动发送文本/文件剪贴板，并具备 PCM 音频播放入口。后续 Mac 反控 Windows 时，继续升级 Windows Graphics Capture、WASAPI loopback、文件剪贴板验收和 Mac 控制窗口。

Windows 本机联调可运行：

```powershell
scripts\windows\dev-lab.ps1 -Start
```

它会检查环境并启动 Windows 控制端页面、假 Mac 服务和 Windows 被控端骨架。

Windows 被控端本机自检可运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-windows-host.ps1
```

它会临时启动 Windows 被控端并验证真实 JPEG 首帧、文本剪贴板和文件剪贴板接收；默认不发送鼠标键盘事件。

Windows 被控端视频持续帧观察可运行：

```powershell
node scripts\windows\observe-windows-host-video.mjs
```

它会临时启动 Windows 被控端并观察 5 秒真实视频帧，统计实际 FPS、最大帧间隔、掉帧数和采集管线。当前 Windows 本机 FFmpeg gdigrab 过渡层实测约 29 FPS，旧 System.Drawing 兜底约 3 FPS。

认证重试策略回归可运行：

```powershell
node scripts\windows\test-auth-retry-policy.mjs
```

它会验证 Windows 被控端和假 Mac 服务在同一连接内密码错误 3 次后关闭，并确认新连接正确密码可通过。

Mac 控制 Windows 页面级自检可运行：

```powershell
node scripts\windows\test-mac-client-browser.mjs
```

它会临时启动 Windows 被控端和 Mac 控制端页面，自动确认 Windows 画面、输入确认、文本剪贴板和文件剪贴板发送；Windows 上默认要求文本写入系统剪贴板、文件写入系统文件剪贴板。非 Windows 开发环境可加 `--mockVideo --allowClipboardFallback` 验证页面和临时目录回退链路。

Mac 控制端认证失败提示可运行：

```powershell
node scripts\windows\test-mac-client-browser.mjs --expectAuthFailure --expectedAttemptsRemaining 2 --expectedMaxAttempts 3
```

它会让临时 Windows 被控端使用正确密码，同时让 Mac 控制端填错密码，并断言页面显示剩余认证次数。

Mac 真机被控端启动后，可在 Windows 上做一次联通自检：

```powershell
scripts\windows\test-mac-host.ps1 -HostName 192.168.1.x
```

它会检查 `/discovery`、WebSocket、密码认证、会话协商和第一帧视频帧。
需要验证系统剪贴板时，可以加上 `-ClipboardText -ClipboardFile`。
真机验收时建议加 `-RequireRealVideo -ExpectInputMode log`，确认不是模拟帧，且输入仍处在安全日志模式：

```powershell
scripts\windows\test-mac-host.ps1 -HostName 192.168.1.x -RequireRealVideo -ExpectInputMode log
```
