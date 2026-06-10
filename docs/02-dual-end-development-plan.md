# 双端开发计划书

## 1. 总体策略

项目按“双端同构，平台能力分层”的思路开发：

- 两端都具备控制端能力。
- 两端都具备被控端能力。
- 网络协议、消息格式、连接状态机尽量共用。
- 屏幕采集、声音采集、输入注入使用各平台原生能力。
- 文件剪贴板使用独立传输通道，不混在输入事件通道里。

这样第一版可以先实现 Windows 控制 Mac，但不会把架构写死，后续加 Mac 控制 Windows 和一键反控时不用推倒重来。

## 2. 推荐技术路线

### 共享核心

- Rust 或 TypeScript 负责协议定义、状态机和基础网络层。
- 第一版可以使用 TCP/WebSocket + MJPEG 或低复杂度帧压缩。
- 协议从一开始预留 audio channel、clipboard channel 和 file transfer channel。
- 文本剪贴板优先实现。
- 文件剪贴板后续通过文件传输通道实现。
- 第二版再升级为 H.264/H.265 视频编码和 Opus 音频编码。

### macOS 端

- 屏幕采集：优先研究 ScreenCaptureKit。
- 声音采集：研究 ScreenCaptureKit 音频或系统音频捕获方案。
- 输入注入：使用 Accessibility 权限和 CGEvent。
- 权限：引导用户开启屏幕录制、辅助功能、输入监控，声音采集如需权限也要提示。
- 第一阶段先使用 Swift Package 命令行被控端骨架，验证协议、权限、屏幕采集和输入注入。
- UI：真机验证后再补 SwiftUI 状态窗口。

### Windows 端

- 屏幕采集：后续使用 Windows Graphics Capture。
- 声音采集：后续使用 WASAPI loopback。
- 输入注入：SendInput。
- UI：优先 WPF、WinUI 或 Tauri，要求中文、窗口化、易调试。
- 渲染：第一版可以普通图像帧渲染，第二版再接视频解码。
- 音频播放：接收被控端音频流并在本机播放，提供静音和音量控制。

## 3. 模块拆分

建议仓库结构：

```text
lan-dual-control/
  apps/
    mac-host/              macOS 被控与控制端
    windows-client/        Windows 控制端 Web 原型
    windows-desktop/       Windows 控制端 Tauri 桌面壳
    windows-host/          Windows 被控端骨架，用于 Mac 反控 Windows
  shared/
    protocol/              消息结构、端口、状态机
    media/                 视频、音频、剪贴板和文件传输抽象
    docs/                  双端对接资料
  docs/
    01-product-plan.md
    02-dual-end-development-plan.md
    03-architecture-and-protocol.md
    04-task-board.md
    05-codex-handoff.md
    06-github-workflow.md
```

第一版可以先不创建全部代码目录，但文档和协议从一开始要保持清楚。

## 4. 开发阶段

### 阶段 0：环境准备

目标：两台机器都能拉取 GitHub 仓库，并跑基础测试。

任务：

- Windows 安装 Git、开发工具和 Codex。
- Mac mini 安装 Git、Xcode Command Line Tools、Codex。
- 两端克隆同一个 GitHub 仓库。
- 确认两端能互相 ping 通。
- 记录两端局域网 IP。

### 阶段 1：Windows 控制 Mac 原型

目标：Windows 看到 Mac 画面，能基础操作。

Mac 端任务：

- 启动本地服务，监听局域网端口。
- 请求并检测屏幕录制权限。
- 采集主屏幕帧。
- 接收鼠标键盘事件并注入到系统。

Windows 端任务：

- 中文连接界面。
- 输入 Mac IP 和端口。
- 显示远程画面。
- 捕获窗口内鼠标键盘事件。
- 把输入事件发给 Mac。

验收：

- Windows 窗口内可以看到 Mac 桌面。
- 鼠标移动、左键点击、键盘输入可用。
- 断开连接后两端不崩溃。

### 阶段 2：连接安全和控制体验

目标：让第一版从“能跑”变成“自己能长期用”。

任务：

- 添加固定密码或一次性配对码。
- 添加连接中、已连接、断开、权限不足等中文状态。
- 添加窗口缩放模式：原始比例、适应窗口。
- 添加全屏切换。
- 添加分辨率选择。
- 添加刷新率选择。
- 添加码率限制。
- 添加画质设置。
- 添加声音接收开关。
- 添加文本剪贴板同步。
- 添加日志文件。

验收：

- 不输入密码不能控制。
- 权限不足时 Mac 端能明确提示。
- Windows 端窗口缩放不影响输入坐标映射。
- 全屏和窗口化切换正常。
- 分辨率、刷新率、码率设置生效。
- 控制端可以接收被控端声音，或清楚显示当前平台暂不支持。
- 文本剪贴板双向同步可用。

### 阶段 3：Mac 控制 Windows

目标：反方向控制链路跑通。

Windows 端任务：

- 启动被控服务。
- 采集 Windows 屏幕。
- 采集 Windows 系统声音。
- 接收 Mac 输入事件。
- 使用 SendInput 注入输入。
- 处理 Windows 防火墙提示。

Mac 端任务：

- 中文连接界面。
- 输入 Windows IP 和端口。
- 显示 Windows 画面。
- 播放 Windows 声音。
- 发送鼠标键盘事件。

验收：

- Mac 可以窗口化控制 Windows。
- 双端都可以独立作为控制端或被控端。
- 声音和文字剪贴板在反方向也可用。

### 阶段 4：一键反控

目标：连接中的双方可以切换控制方向。

任务：

- 协议中加入 reverse_control_request。
- 被请求方弹出确认。
- 当前控制连接降级或关闭。
- 新方向连接建立。
- UI 显示当前方向。

验收：

- Windows 控制 Mac 时，点击反控后，Mac 可控制 Windows。
- Mac 控制 Windows 时，点击反控后，Windows 可控制 Mac。
- 未确认时不能反控。

### 阶段 5：文件剪贴板和增强能力

目标：接近成熟工具体验。

任务：

- 文件、压缩包、图片等剪贴板同步。
- 大文件传输进度。
- 局域网自动发现。
- 多显示器选择。
- 剪贴板冲突处理。
- 音频延迟优化。
- 硬件编码。
- 安装包。
- 开机自启。

## 5. 两端职责边界

Mac 端优先负责：

- macOS 权限。
- ScreenCaptureKit。
- macOS 声音采集。
- CGEvent 输入注入。
- Mac 被控服务稳定性。

Windows 端优先负责：

- 中文控制窗口。
- Windows 画面渲染。
- Windows 音频播放。
- 键鼠事件捕获。
- Windows 被控服务和 SendInput。

共享部分优先负责：

- 通信协议。
- 坐标映射。
- 帧格式。
- 音频格式。
- 剪贴板格式。
- 文件传输格式。
- 连接状态。
- 错误码。

## 6. 质量要求

- 每个阶段都要有可运行演示。
- 每次协议变更必须更新 docs/03-architecture-and-protocol.md。
- 每次任务完成必须更新 docs/04-task-board.md。
- 双端都不要私自改对方模块，除非同步文档。
- 所有用户可见文字默认中文。
