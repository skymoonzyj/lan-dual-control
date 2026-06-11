# 明日工作计划

日期：2026-06-12

## 当前基线

- GitHub `main` 已同步到最新提交。
- Windows 控制端已支持中文界面、本地模拟、WebSocket 局域网连接、画质档位、分辨率、刷新率、码率、声音骨架、剪贴板骨架、一键反控状态机和桌面 exe 构建。
- 第一轮连接安全已经实装：未认证连接不能直接进入会话，假 Mac、Windows 被控端和 macOS 被控端骨架会返回统一的 `LAN002`。
- Windows 侧已经增加 `scripts/windows/dev-lab.ps1`，可做一键健康检查，并可启动控制端、假 Mac 和 Windows 被控端联调服务。
- macOS 被控端和 Windows 被控端都还是骨架阶段，真实屏幕采集、真实声音采集和真实输入注入仍待实装。
- Mac mini 到位后，优先从 macOS 真机权限、Swift 骨架运行和 Windows 控制端真实连接开始。

## 明天优先目标

1. 在 Mac mini 上跑通 macOS 被控端 Swift 骨架。
2. 用 Windows 控制端连接真实 Mac，验证 hello/auth/session 是否跑通。
3. 补强 Windows 被控端的基础可用性。
4. 根据真机权限结果，拆分屏幕采集、声音采集和输入注入的第一批任务。

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

- 优先补文本剪贴板真实写入或更完整的接收状态。
- 评估 SendInput 输入注入的最小实现范围。
- 继续保持 Windows 被控端可以独立跑 `npm.cmd run check`。

验收：

- Windows 被控端日志能清楚显示收到的控制事件和剪贴板事件。
- 不破坏现有模拟视频帧、模拟音频帧和协议握手。

## 如果 Mac mini 明天到货

优先级临时切换为 Mac 真机对接：

1. 在 Mac 上安装 Git、Xcode Command Line Tools、Codex。
2. 克隆 GitHub 仓库。
3. 运行 `apps/mac-host` 的 Swift 骨架。
4. 验证屏幕录制、辅助功能、输入监控权限。
5. Windows 控制端连接真实 Mac 被控端，先看 hello/auth/session 是否跑通。

## 暂不优先处理

- MSI/NSIS 安装包。
- 硬件编码。
- 真实低延迟音频优化。
- UDP/mDNS 真正自动发现。
- 大文件断点续传。

这些都重要，但不适合明天一开工就做。明天先把安全、联调脚本和 Windows 被控端基础能力打稳。
