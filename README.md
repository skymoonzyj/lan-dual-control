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

当前 Windows 端已经可以在“本地模拟”和“WebSocket 局域网”之间切换，并可构建为 Windows 桌面 exe。左侧设备列表已加入局域网发现骨架，可探测本机假 Mac 服务、Windows 被控端骨架和连接历史中的 `/discovery` 接口；画质设置已加入流畅、均衡、高清和自定义预设；剪贴板已加入文件传输骨架，可手动选择文件、压缩包或图片并按块发送；显示设置已加入多显示器选择骨架；声音接收已加入音量设置和模拟音频帧骨架。Mac mini 到位后，继续从 [任务清单与里程碑](docs/04-task-board.md) 的 M1 对接真实 Mac 被控端；后续做 Mac 反控 Windows 时，从 `apps/windows-host` 接入真实屏幕采集、真实 WASAPI 音频采集和 SendInput。

Windows 本机联调可运行：

```powershell
scripts\windows\dev-lab.ps1 -Start
```

它会检查环境并启动 Windows 控制端页面、假 Mac 服务和 Windows 被控端骨架。

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
