# 明日工作计划

日期：2026-06-12

## 当前基线

- GitHub `main` 已同步到最新提交。
- Windows 控制端已支持中文界面、本地模拟、WebSocket 局域网连接、画质档位、分辨率、刷新率、码率、声音骨架、剪贴板骨架、一键反控状态机和桌面 exe 构建。
- 第一轮连接安全已经实装：未认证连接不能直接进入会话，假 Mac、Windows 被控端和 macOS 被控端骨架会返回统一的 `LAN002`。
- Windows 侧已经增加 `scripts/windows/dev-lab.ps1`，可做一键健康检查，并可启动控制端、假 Mac 和 Windows 被控端联调服务。
- Windows 侧已经增加 `scripts/windows/test-mac-host.ps1`，可在 Mac 真机服务启动后检查 `/discovery`、WebSocket、认证、会话和第一帧视频帧；显式加 `-ClipboardText -ClipboardFile` 可验证 macOS 文本和文件剪贴板写入。
- macOS 被控端已升级为 WebSocket 服务，支持 `/discovery`、hello/auth/session、后台真实屏幕 JPEG 帧、模拟视频帧回退、模拟音频帧、CGEvent 输入注入、系统文本剪贴板读写和变更推送、系统文件剪贴板接收写入；真实声音采集仍待实装。
- Windows 控制端已可区分真实 JPEG 视频帧和模拟视频帧，并显示 Mac 主机诊断状态条；Mac 端已兼容 Windows 端当前发送的输入事件字段。
- Windows 被控端仍是骨架阶段，真实屏幕采集和真实声音采集仍待实装；文本/文件剪贴板在 Windows 上已可写入系统剪贴板，输入事件已接入最小 SendInput 桥。
- Mac mini 到位后，优先从 macOS 真机权限、Swift WebSocket 骨架运行和 Windows 控制端真实连接开始。

## 明天优先目标

1. 在 Mac mini 上跑通 macOS 被控端 Swift 骨架。
2. 用 Windows 控制端连接真实 Mac，验证 hello/auth/session 是否跑通。
3. 补强 Windows 被控端的基础可用性。
4. 根据真机权限结果，拆分低延迟采集、声音采集和输入法兼容的第一批任务。

## 任务 1：连接安全第一轮

目标：让“未授权设备不能连接”从任务清单里的空项变成可验证能力。

计划：

- [x] 梳理当前 `auth_request`、`auth_result`、`LAN002` 的使用路径。
- [x] 给假 Mac 服务和 Windows 被控端统一认证行为。
- [x] 给 macOS Swift 骨架增加每条连接的认证状态记录。
- [x] 记录连接密码暂不落盘的原则，避免本机保存明文密码。
- [ ] 在真实 Mac 上验证 Swift 骨架的认证门禁。

验收：

- [x] 密码错误或未认证时无法进入会话。
- [x] 未认证请求返回明确中文错误。
- [x] 本地模拟、假 Mac WebSocket、Windows 被控端骨架三条路径行为一致。
- [ ] macOS 真机路径待 Mac mini 上验证。

## 任务 2：一键自检和联调启动脚本

目标：明天以后不用手动记一串命令，减少反复折腾。

计划：

- [x] 增加 Windows 侧脚本，用于检查 Node、npm、Tauri 构建产物和关键端口。
- [x] 脚本能启动或提示启动这些组件：
  - Windows 控制端本地页面。
  - 假 Mac WebSocket 联调服务。
  - Windows 被控端骨架。
- [x] 脚本输出通过、失败、端口占用、依赖缺失等结果。

验收：

- [x] 一条命令能完成主要健康检查。
- [x] 启动模式会检查控制端页面、假 Mac 发现接口和 Windows 被控端发现接口。
- [x] 失败时能看到下一步该处理什么。

## 任务 3：Windows 被控端补强

目标：为后续 Mac 反控 Windows 提前铺路。

计划：

- [x] 优先补文本剪贴板真实写入或更完整的接收状态。
- [x] 补文件剪贴板接收端临时落地和 Windows 系统文件剪贴板写入。
- [x] 评估并接入 SendInput 输入注入的最小实现范围。
- [x] 继续保持 Windows 被控端可以独立跑 `npm.cmd run check`。

验收：

- [x] Windows 被控端日志能清楚显示收到的控制事件和剪贴板事件。
- [x] Windows 被控端收到 `clipboard_text` 后，在 Windows 上写入系统文本剪贴板，非 Windows 环境回退为内存模式。
- [x] Windows 被控端收到 `clipboard_file_*` 后保存文件块，在 Windows 上写入系统文件剪贴板，非 Windows 环境回退为临时文件模式。
- [x] Windows 被控端收到输入事件后，在 Windows 上通过 SendInput 注入鼠标、滚轮和常用键盘，非 Windows 环境回退为日志模式。
- [x] 不破坏现有模拟视频帧、模拟音频帧和协议握手。

## 如果 Mac mini 明天到货

优先级临时切换为 Mac 真机对接：

1. 在 Mac 上安装 Git、Xcode Command Line Tools、Codex。
2. 克隆 GitHub 仓库。
3. 运行 `apps/mac-host` 的 Swift 骨架。
4. 验证 `/discovery` 和 WebSocket hello/auth/session 是否跑通。
5. 在 Windows 上运行 `scripts/windows/test-mac-host.ps1 -HostName <Mac-IP>` 做自动联通自检；需要剪贴板深度验证时加 `-ClipboardText -ClipboardFile`。
6. 验证屏幕录制、辅助功能、输入监控权限。
7. 验证 Windows 控制端能收到 `codec: "jpeg"` 的真实 Mac 屏幕帧。
8. 验证 Windows 控制端能移动 Mac 鼠标、点击、滚轮和发送常用快捷键。
9. 验证 Windows 和 Mac 能互相同步系统文本剪贴板。
10. 验证 Windows 发送文件剪贴板后，Mac Finder 能粘贴收到的文件。
11. 继续把当前后台 JPEG 管线升级为真正的 ScreenCaptureKit 流式输出或硬件编码。

## 暂不优先处理

- MSI/NSIS 安装包。
- 硬件编码。
- 真实低延迟音频优化。
- UDP/mDNS 真正自动发现。
- 大文件断点续传。

这些都重要，但不适合明天一开工就做。明天先把安全、联调脚本和 Windows 被控端基础能力打稳。
