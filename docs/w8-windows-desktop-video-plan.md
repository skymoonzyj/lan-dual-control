# W8 Windows 桌面控制端视频侧计划

最后更新：2026-06-21

## 背景

真实最小化 / 切 app / 切回测试里，Web 控制端已经能连接并解码 H.264，但仍出现约 30-39 FPS / 60Hz、本机队列 600ms+、`queue-overflow-wait-keyframe` 反复出现的问题。结论是：WebCodecs / canvas / 浏览器后台调度不适合作为最终桌面体验的主渲染路径。

W8 主线把 Windows 桌面控制端作为最终体验入口。现有 Tauri WebView 仍保留窗口、启动、剪贴板、文件、本机 host 面板和诊断，但视频核心链路要逐步进入 Windows 原生侧。

## 本轮 MVP

本轮完成的是视频侧第一块可运行基础，不改协议、不改 Mac host：

- 新增 Rust 原生视频队列模块 `w8_native_video`。
- 新增 Tauri 命令：读取 W8 视频计划、探测本机原生解码能力、启动/停止 W8 视频会话、推入视频帧元数据、推入 base64 Annex B H.264 payload、读取队列快照。
- 原生侧可以识别 Annex B H.264 NAL type，并提取 SPS、PPS、IDR、关键帧状态。
- 原生侧可以从 SPS/PPS 提取 decoder config 摘要，例如 `avc1.420029`。
- 原生侧可以只读探测 D3D11 hardware device 与 Media Foundation H.264 decoder MFT，并返回 `ready/reason/D3D11 feature level/decoder counts`。
- 原生侧可以在首个带 SPS/PPS 的 H.264 帧到达时执行 Media Foundation decoder init preflight：创建 H.264 decoder MFT、设置 H.264 输入类型、写入参数集并枚举输出 subtype。
- 原生侧可以在首个带 SPS/PPS/IDR 的 H.264 帧到达时执行 Media Foundation sample decode step preflight：把完整 Annex B access unit 包成 MF sample，调用 `ProcessInput` 并尝试 `ProcessOutput`，输出 `need-more-input`、`decoded-output`、`stream-change` 或明确 blocked reason。
- 原生侧会维护持续 decoder session 诊断摘要：首个 decoder config 建立会话后，后续 H.264 push 会累计提交帧、MF 输入接受帧、decoded frame 计数、输出 subtype 和最近状态。当前没有把 `IMFTransform` 直接放入 Tauri 全局状态跨线程保存，真正长期 decoder 需要下一步放进专用 native decoder/renderer 线程。
- 原生队列默认目标约 80ms，硬上限约 180ms。
- 队列积压且已有较新关键帧时，直接丢旧跳到最新关键帧。
- 队列积压但没有可用新关键帧时，清掉 delta 积压并进入等待关键帧状态，避免继续攒旧帧。
- 该 MVP 只接管实时队列策略和桌面原生接口，不宣称已经完成 H.264 硬解码或原生画面绘制。

## 关键接口

Tauri 原生命令：

- `get_w8_native_video_plan`
- `probe_w8_native_video_decoder`
- `start_w8_native_video_session`
- `push_w8_native_video_frame`
- `push_w8_native_h264_annexb_frame`
- `get_w8_native_video_snapshot`
- `stop_w8_native_video_session`

这些接口后续会被桌面控制端的媒体接收层调用。当前可以用 Rust 单元测试验证 Annex B NAL 识别、decoder config 提取、MF/D3D11 能力探测、decoder init preflight、sample decode step preflight、持续 decoder session 诊断计数和低延迟策略，不需要真实密码、不认证、不发 input/inject。

## 下一步

1. 把真正长期 Media Foundation decoder runtime 放到专用 native decoder/renderer 线程，避免 Tauri state 跨线程持有 `IMFTransform`。
2. 把 Mac host H.264 WebSocket 接收路径从浏览器渲染循环迁到桌面原生侧或独立 native renderer，并调用 `push_w8_native_h264_annexb_frame`。
3. 在专用 decoder 线程里输出 decoded frame 计数、输出 subtype、sample length 等格式诊断。
4. 用 native surface 做最新帧绘制策略，窗口最小化 / 后台 / 切 app 时仍按实时队列丢旧保新。
5. 与 W8 音频子任务对齐时间戳和低延迟策略，但视频侧不等待音频完成。
6. 保留 Web 控制端作为诊断 / 备用路径，不再把 Web canvas 当最终体验主线。

## 验收口径

- Rust 视频队列测试必须覆盖：低延迟正常入队、积压跳到最新关键帧、无关键帧时清 delta 并等待关键帧。
- Rust H.264 入站测试必须覆盖：Annex B SPS/PPS/IDR 识别、关键帧元数据进入原生队列。
- Rust 原生能力测试必须覆盖：D3D11 / Media Foundation H.264 探测结果能汇总为 ready 或明确 blocked reason。
- Rust decoder init 测试必须覆盖：缺 SPS/PPS 不尝试初始化，带 SPS/PPS 时尝试设置输入类型并汇总输出 subtype。
- Rust decode step 测试必须覆盖：缺 SPS/PPS/IDR 不尝试步进，带 SPS/PPS/IDR 时创建 MF sample 并汇总 `ProcessInput/ProcessOutput` 状态。
- Rust decoder session 测试必须覆盖：首个 decoder config 建立会话摘要，后续 H.264 push 累计 submitted/accepted/decoded 计数，并返回输出 subtype 和最近状态。
- 桌面端 `cargo check` 必须通过。
- 后续接入真实渲染后，真实最小化 / 切 app / 切回测试要看本机视频队列是否保持在 80-180ms 附近，而不是继续堆到 600ms+。
