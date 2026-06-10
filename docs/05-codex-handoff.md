# 双 Codex 账号协作说明

这个项目可能会由两台电脑、两个 Codex 账号共同开发：

- Windows 电脑上的 Codex：偏 Windows 端和中文控制窗口。
- Mac mini 上的 Codex：偏 macOS 权限、屏幕采集、声音采集和输入注入。

两个 Codex 账号不会自动共享记忆，所以必须把项目事实写进仓库文档。

## 1. 通用规则

- 开始开发前先阅读 README.md 和 docs/ 下所有文档。
- 修改协议前必须更新 docs/03-architecture-and-protocol.md。
- 完成任务后必须更新 docs/04-task-board.md。
- 重要问题写进 docs/04-task-board.md 的对应里程碑。
- 不要随意改另一个端的代码，除非文档里明确需要。

## 2. 给 Windows 端 Codex 的启动提示

复制下面这段给 Windows 端 Codex：

```text
请先阅读本仓库 README.md 和 docs/ 下的全部计划文档。你的主要职责是 Windows 端：
1. 中文控制窗口；
2. 输入 Mac 局域网 IP 后连接；
3. 渲染 Mac 传来的画面；
4. 播放 Mac 传来的声音；
5. 捕获 Windows 窗口内鼠标键盘事件；
6. 实现窗口化、全屏、分辨率、刷新率、码率、声音和剪贴板控制项；
7. 维护 `apps/windows-host` Windows 被控端骨架，用于 Mac 反控 Windows。

开发时遵守 docs/03-architecture-and-protocol.md 的协议。完成任何任务后更新 docs/04-task-board.md。不要改 Mac 端实现，除非协议或对接要求必须同步。
```

## 3. 给 Mac 端 Codex 的启动提示

复制下面这段给 Mac mini 上的 Codex：

```text
请先阅读本仓库 README.md 和 docs/ 下的全部计划文档。你的主要职责是 Mac 端：
1. 处理 macOS 屏幕录制、辅助功能、输入监控权限；
2. 采集 Mac 屏幕；
3. 采集 Mac 系统声音；
4. 开启局域网被控服务；
5. 接收 Windows 端发来的鼠标键盘事件并注入系统；
6. 支持被控端分辨率、刷新率、码率和剪贴板能力；
7. 后续实现 Mac 控制窗口，用于 Mac 反控 Windows。

当前已存在 `apps/mac-host` Swift Package 骨架和 `apps/windows-host` Windows 被控端骨架。Mac mini 到位后，先运行 `swift run lan-dual-mac-host`，验证权限、TCP hello 握手、ScreenCaptureKit 预检，再逐步实现真实视频帧和 CGEvent 输入注入。后续做 Mac 反控 Windows 时，可先连接 `apps/windows-host`，它会返回模拟 `video_frame` 并记录输入事件。

开发时遵守 docs/03-architecture-and-protocol.md 的协议。完成任何任务后更新 docs/04-task-board.md。不要改 Windows 端实现，除非协议或对接要求必须同步。
```

## 4. 对接前检查

每次双端对接前确认：

- 两端都拉取最新 main。
- docs/03-architecture-and-protocol.md 中的协议版本一致。
- 两端端口一致。
- 两端错误码一致。
- 视频帧格式一致。
- 鼠标坐标是否按 0 到 1 的比例传递。
- 声音开关、编码格式、采样率是否一致。
- 分辨率、刷新率、码率设置字段是否一致。
- 文本剪贴板和文件剪贴板协议版本是否一致。
- macOS 权限是否已开启。
- Windows 防火墙是否允许局域网连接。

## 5. 交接记录模板

每次结束一个开发阶段，可以在任务清单末尾追加：

```text
日期：
开发端：
完成内容：
修改文件：
如何验证：
遗留问题：
下一步建议：
```
