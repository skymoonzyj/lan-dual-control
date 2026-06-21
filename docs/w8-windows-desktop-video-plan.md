# W8 Windows 桌面控制端视频侧计划

最后更新：2026-06-21

## 背景

真实最小化 / 切 app / 切回测试里，Web 控制端已经能连接并解码 H.264，但仍出现约 30-39 FPS / 60Hz、本机队列 600ms+、`queue-overflow-wait-keyframe` 反复出现的问题。结论是：WebCodecs / canvas / 浏览器后台调度不适合作为最终桌面体验的主渲染路径。

W8 主线把 Windows 桌面控制端作为最终体验入口。现有 Tauri WebView 仍保留窗口、启动、剪贴板、文件、本机 host 面板和诊断，但视频核心链路要逐步进入 Windows 原生侧。

## 本轮 MVP

本轮完成的是视频侧第一块可运行基础，不改协议、不改 Mac host：

- 新增 Rust 原生视频队列模块 `w8_native_video`。
- 新增 Tauri 命令：读取 W8 视频计划、启动/停止 W8 视频会话、推入视频帧元数据、读取队列快照。
- 原生队列默认目标约 80ms，硬上限约 180ms。
- 队列积压且已有较新关键帧时，直接丢旧跳到最新关键帧。
- 队列积压但没有可用新关键帧时，清掉 delta 积压并进入等待关键帧状态，避免继续攒旧帧。
- 该 MVP 只接管实时队列策略和桌面原生接口，不宣称已经完成 H.264 硬解码或原生画面绘制。

## 关键接口

Tauri 原生命令：

- `get_w8_native_video_plan`
- `start_w8_native_video_session`
- `push_w8_native_video_frame`
- `get_w8_native_video_snapshot`
- `stop_w8_native_video_session`

这些接口后续会被桌面控制端的媒体接收层调用。当前可以用 Rust 单元测试验证低延迟策略，不需要真实密码、不认证、不发 input/inject。

## 下一步

1. 把 Mac host H.264 WebSocket 接收路径从浏览器渲染循环迁到桌面原生侧或独立 native renderer。
2. 接入 Windows Media Foundation 或 D3D11 解码器，把 Annex B H.264 解码为可绘制帧。
3. 用 native surface 做最新帧绘制策略，窗口最小化 / 后台 / 切 app 时仍按实时队列丢旧保新。
4. 与 W8 音频子任务对齐时间戳和低延迟策略，但视频侧不等待音频完成。
5. 保留 Web 控制端作为诊断 / 备用路径，不再把 Web canvas 当最终体验主线。

## 验收口径

- Rust 视频队列测试必须覆盖：低延迟正常入队、积压跳到最新关键帧、无关键帧时清 delta 并等待关键帧。
- 桌面端 `cargo check` 必须通过。
- 后续接入真实渲染后，真实最小化 / 切 app / 切回测试要看本机视频队列是否保持在 80-180ms 附近，而不是继续堆到 600ms+。
