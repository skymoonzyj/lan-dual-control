# 明日工作计划

日期：2026-06-12

## 当前基线

- GitHub `main` 已同步到最新提交。
- Windows 控制端已支持中文界面、本地模拟、WebSocket 局域网连接、画质档位、分辨率、刷新率、码率、声音骨架、剪贴板骨架、一键反控状态机和桌面 exe 构建。
- 第一轮连接安全已经实装：未认证连接不能直接进入会话，假 Mac、Windows 被控端和 macOS 被控端骨架会返回统一的 `LAN002`。
- Windows 侧已经增加 `scripts/windows/dev-lab.ps1`，可做一键健康检查，并可启动控制端、假 Mac 和 Windows 被控端联调服务。
- Windows 侧已经增加 `scripts/windows/test-mac-host.ps1`，可在 Mac 真机服务启动后检查 `/discovery`、WebSocket、认证、会话和第一帧视频帧；显式加 `-ClipboardText -ClipboardFile` 可验证 macOS 文本和文件剪贴板写入。
- macOS 被控端已升级为 WebSocket 服务，支持 `/discovery`、hello/auth/session、后台真实屏幕 JPEG 帧、模拟视频帧回退、模拟音频帧、CGEvent 输入注入、系统文本剪贴板读写和变更推送、系统文件剪贴板接收写入、Mac 本机文件剪贴板推送到控制端内存接收；真实声音采集仍待实装。
- Windows 控制端已可区分真实 JPEG 视频帧和模拟视频帧，并显示 Mac 主机诊断状态条；Mac 端已兼容 Windows 端当前发送的输入事件字段。
- Windows 控制端现在会把 `input_ack` 的已注入、已记录或被拒绝状态写入诊断条；被拒绝时会显示 `LAN005` 等错误码并把输入状态标为“被拒绝”。
- Windows 控制端的坐标映射已增加独立回归脚本，覆盖适应窗口、原始比例滚动和拉伸填充；浏览器回归已验证全屏/窗口切换和缩放模式仍可发送输入。
- 真 Mac 已通过 `--requireRealVideo --expectInputMode log --inputEvents` 强校验：首帧为真实 JPEG，输入事件以安全日志模式确认；JPEG 调试链路已经改为显示实收 FPS，不再把请求刷新率当作真实帧率。
- 真 Mac 已通过 `--clipboardRoundTrip` 验证文本剪贴板双向同步：控制端写入 Mac 和 Mac 本机复制推回控制端均可自动确认。
- 真 Mac 文件剪贴板新增 `--clipboardFileHostToClient` 探针：在 Mac 本机复制普通文件后，通过 `clipboard_file_*` 推送给控制端并重组校验字节；Windows 控制端当前先以内存托盘暂存并提供下载，不写系统文件剪贴板。
- Windows 被控端仍是骨架阶段，真实屏幕采集和真实声音采集仍待实装；文本/文件剪贴板在 Windows 上已可写入系统剪贴板，输入事件已接入最小 SendInput 桥。
- 当前已经在真 Mac 上开发和验证 macOS 被控端；后续功能验收以真实 `apps/mac-host` 为主，假 Mac 只作为快速回归和异常场景模拟。

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
- [x] 在真实 Mac 上验证 Swift 骨架的认证门禁。

验收：

- [x] 密码错误或未认证时无法进入会话。
- [x] 未认证请求返回明确中文错误。
- [x] 本地模拟、假 Mac WebSocket、Windows 被控端骨架三条路径行为一致。
- [x] macOS 真机路径已通过 `scripts/windows/probe-mac-host.mjs` 验证 hello/auth/session。

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
- [x] 输入事件处理后返回 `input_ack`，联调脚本可确认 5 类样例输入事件已被处理。
- [x] 不破坏现有模拟视频帧、模拟音频帧和协议握手。

## 真 Mac 优先验收

现在优先级切换为 Mac 真机对接：

1. 在真 Mac 上运行 `apps/mac-host`，默认用 `LAN_DUAL_INPUT_MODE=log` 做安全协议验证。
2. 用 `scripts/windows/probe-mac-host.mjs --requireRealVideo --expectInputMode log --inputEvents` 或 Windows 侧 `scripts/windows/test-mac-host.ps1 -RequireRealVideo -ExpectInputMode log -InputEvents` 验证 `/discovery`、WebSocket、认证、会话、真实首帧和 `input_ack`。
3. 验证屏幕录制、辅助功能、输入监控权限。
4. 验证 Windows 控制端能收到 `codec: "jpeg"` 的真实 Mac 屏幕帧。
5. 在确认安全后切换 `LAN_DUAL_INPUT_MODE=inject`，验证 Windows 控制端能移动 Mac 鼠标、点击、滚轮和发送常用快捷键。
6. 验证 Windows 和 Mac 能互相同步系统文本剪贴板。
7. 验证 Windows 发送文件剪贴板后，Mac Finder 能粘贴收到的文件。
8. 验证 Mac 复制普通文件后，Windows 控制端能按块接收并在内存中重组完整文件。
9. 按 [流式视频编码计划](09-streaming-video-plan.md) 把当前后台 JPEG 管线升级为 ScreenCaptureKit 流式采集 + VideoToolbox H.264。

说明：假 Mac 服务仍保留，用来快速测试 UI、协议兼容和失败场景；但它不能替代真 Mac 验收。

## 暂不优先处理

- MSI/NSIS 安装包。
- H.264 硬件编码完整落地前，JPEG 链路只作为调试和兜底使用。
- 真实低延迟音频优化。
- UDP/mDNS 真正自动发现。
- 大文件断点续传。

这些都重要，但不适合明天一开工就做。明天先把安全、联调脚本和 Windows 被控端基础能力打稳。
