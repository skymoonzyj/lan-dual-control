# W8 Windows 桌面控制端视频侧计划

最后更新：2026-06-22

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
- 原生侧会维护持续 decoder session 诊断摘要：首个 decoder config 建立会话后，后续 H.264 push 会累计提交帧、MF 输入接受帧、decoded frame 计数、输出 subtype 和最近状态。
- 真正长期持有 `IMFTransform` 的 runtime 已放进专用 `lan-dual-w8-mf-decoder` worker 线程；Tauri 全局状态只保存可 Send 的命令通道/线程句柄和摘要，后续 access unit 通过 worker 命令队列进入同一个 MF decoder。
- decoder session 会同步返回 decoded frame handoff / latest-frame 摘要：`frameHandoffActive/frameHandoffMode/frameHandoffStatus/latestFrameFormat/latestFrameBytes/latestFrameId`。有 decoded sample 时记录最新帧格式、长度和序号；还没产出 decoded sample 时显示 `waiting-decoded-frame`，不宣称已经完成 native surface 绘制。
- worker 启动时会创建 D3D11 latest-frame texture target：`nativeSurfaceReady/nativeSurfaceMode/nativeSurfaceStatus/nativeSurfaceFormat/nativeSurfaceWidth/nativeSurfaceHeight/nativeSurfaceReason`。`ProcessOutput` 产出 decoded `IMFSample` 后，会把 sample 合并成 contiguous buffer，并用 D3D11 `UpdateSubresource` 写入 latest-frame texture；`decoderSession` 同步返回 `nativeSurfaceCopyStatus/nativeSurfaceCopyBytes/nativeSurfacePresentedFrames/nativeSurfaceLastFrameId`。
- worker 同时会创建 BGRA8 native present texture target：`nativePresentReady/nativePresentMode/nativePresentStatus/nativePresentFormat/nativePresentWidth/nativePresentHeight/nativePresentFrames/nativePresentLastFrameId/nativePresentReason`。会话启动时如果拿到真实 Tauri 窗口 HWND，worker 会在同一个 D3D11 device 上创建持久 `IDXGISwapChain1`；BGRA8 输出可从 latest-frame texture `CopyResource` 到 present texture，再复制到 swapchain back buffer 并调用 `Present`，状态为 `latest-frame-swapchain-presented`。常见 NV12 输出会通过 D3D11 `VideoProcessorBlt` 转入 BGRA8 present texture，再进入同一个 HWND swapchain，状态为 `latest-frame-nv12-converted-presented`；NV12 的 present texture 和 swapchain back buffer 会跟随窗口 client resize。
- worker 遇到 Media Foundation `MF_E_TRANSFORM_STREAM_CHANGE` 时会重新枚举输出类型并 `SetOutputType`，按新的输出 subtype 重建 D3D11 latest-frame surface、BGRA8 present texture 和可用的 HWND swapchain 目标；`decoderSession` 会刷新 `outputSubtype`、`latestFrameFormat`、`nativeSurface*`、`nativePresent*`，状态为 `stream-change-reconfigured`。
- worker 遇到 D3D11/DXGI device lost 类错误时会识别 `DXGI_ERROR_DEVICE_REMOVED/RESET/HUNG` 和常见 HRESULT 字符串，按当前 output subtype 和窗口目标重建 D3D11 latest-frame surface、BGRA8 present texture 和可用的 HWND swapchain 目标；`decoderSession` 会显示 `device-lost-rebuilt`。如果重建失败，会显示 `device-lost-rebuild-blocked`。
- 桌面壳现在会在 W8 会话启动后对真实 Tauri 窗口 HWND 做 D3D11 swapchain 预检：`probe_w8_native_video_window_swapchain` 会读取窗口 client 尺寸，并尝试创建 BGRA8 / 2 buffers / flip-discard `CreateSwapChainForHwnd`；Windows 控制端诊断/导出会显示 `原生窗口交换链 ready|blocked`、尺寸、格式、状态和参数。
- Windows 复测摘要现在会把 W8 原生视频状态压成 `W8NativeVideo=`：`test-windows-client-browser --boardSummary` 读取页面 snapshot 里的 `decoderSession/nativePresent/nativeSurface/windowSwapchain` 字段，输出 `ui/mainSurface/canvasRole/status/present/presentFrames/decoded/presenting/presentGap/queueDrops/queueDropScope/queueReason/output/surface/copy/handoff/swapchain/streamChange/deviceLost/errors`；其中 `ui=html-shell` 表示 Tauri 控制面仍是 HTML/CSS/JS，`mainSurface=native-hwnd` 表示视频主面已有 MF/D3D11/HWND 原生 Present 证据，`canvasRole=diagnostic-fallback` 表示 Web canvas 只作诊断/备用；`presenting=yes|no` 和 `presentGap=<decoded-presentFrames>` 用来直接判断真实长跑时原生窗口 Present 是否跟上解码。`queueDropScope=predecode` 表示旧 native queue 预过滤层在丢旧保实时，后续长期 native decoder/present 仍可继续处理同一批 access unit，不应误判为原生呈现全丢。`Run-WinClientRetest-And-Post.cmd` 会把这条 W8 摘要单独发布到 Agent Link Board，和旧 `W2W3Retest=` 分开，避免污染 W2 H.264 对照诊断。
- 原生队列默认目标约 80ms，硬上限约 180ms。
- 队列积压且已有较新关键帧时，直接丢旧跳到最新关键帧。
- 队列积压但没有可用新关键帧时，清掉 delta 积压并进入等待关键帧状态，避免继续攒旧帧。
- 队列返回 `accepted=false` 的 H.264 delta 不再提交给持久 MF/D3D11 decoder；`need-keyframe` / `waiting-keyframe` 只更新队列丢帧和等待关键帧诊断，保留上一条 decoder 摘要，下一条 `keyframe-recovered` 才继续进入原生解码线程。
- 该 MVP 已推进到 MF worker、D3D11 latest-frame texture、BGRA8 present texture、真实 HWND swapchain 预检、BGRA8 latest-frame -> HWND swapchain `Present`、NV12 -> BGRA8 `VideoProcessorBlt` -> HWND swapchain `Present`、NV12 窗口 client resize 后的 `ResizeBuffers` / present texture 重建、stream-change 后输出重选 / native surface 重建、device-lost 后 native surface / present target 重建，以及 `W8NativeVideo=` 长跑摘要出口。后续要让它成为最终体验路径，还需要真实 Mac 长时间观感验证。

## 关键接口

Tauri 原生命令：

- `get_w8_native_video_plan`
- `probe_w8_native_video_decoder`
- `probe_w8_native_video_window_swapchain`
- `start_w8_native_video_session`
- `push_w8_native_video_frame`
- `push_w8_native_h264_annexb_frame`
- `get_w8_native_video_snapshot`
- `stop_w8_native_video_session`

这些接口后续会被桌面控制端的媒体接收层调用。当前可以用 Rust 单元测试验证 Annex B NAL 识别、decoder config 提取、MF/D3D11 能力探测、decoder init preflight、sample decode step preflight、持续 decoder session 诊断计数、专用 decoder worker 线程和低延迟策略，不需要真实密码、不认证、不发 input/inject。

## 下一步

1. 对真实 Mac H.264 长时间运行做观感和诊断验证，确认 `nativePresentStatus` 持续为 `latest-frame-nv12-converted-presented` 或 `latest-frame-swapchain-presented`，且偶发 `stream-change-reconfigured` / `device-lost-rebuilt` 后能继续出帧。
2. 让窗口最小化 / 后台 / 切 app 时的 native renderer 仍按实时队列丢旧保新，并把真实长跑中的 device-lost / swapchain lost 证据继续收敛到更细的重建策略。
3. 根据真实长跑结果决定是否需要把 decoder MFT 本体也纳入更高层重建，而不只重建 D3D11 surface / present target。
4. 把 Mac host H.264 WebSocket 接收路径继续收束到桌面原生侧，逐步降低 WebCodecs/canvas 在最终体验里的权重。
5. 与 W8 音频子任务对齐时间戳和低延迟策略，但视频侧不等待音频完成。
6. 保留 Web 控制端作为诊断 / 备用路径，不再把 Web canvas 当最终体验主线。

## 验收口径

- Rust 视频队列测试必须覆盖：低延迟正常入队、积压跳到最新关键帧、无关键帧时清 delta 并等待关键帧。
- Rust H.264 入站测试必须覆盖：Annex B SPS/PPS/IDR 识别、关键帧元数据进入原生队列。
- Rust 原生能力测试必须覆盖：D3D11 / Media Foundation H.264 探测结果能汇总为 ready 或明确 blocked reason。
- Rust decoder init 测试必须覆盖：缺 SPS/PPS 不尝试初始化，带 SPS/PPS 时尝试设置输入类型并汇总输出 subtype。
- Rust decode step 测试必须覆盖：缺 SPS/PPS/IDR 不尝试步进，带 SPS/PPS/IDR 时创建 MF sample 并汇总 `ProcessInput/ProcessOutput` 状态。
- Rust decoder session 测试必须覆盖：首个 decoder config 建立会话摘要，后续 H.264 push 累计 submitted/accepted/decoded 计数，并返回输出 subtype 和最近状态。
- Rust decoder session 低延迟测试必须覆盖：被队列拒绝的 delta 不提交给 decoder，不增加 `submittedFrames`，且下一条恢复关键帧会继续推进 decoder session。
- Rust decoder worker 测试必须覆盖：会话摘要声明 `workerThread=true`、`workerMode=dedicated-native-decoder-thread`、`workerStatus=active`，并且 Tauri state 不直接持有非 Send 的 `IMFTransform`。
- Rust decoded frame handoff 测试必须覆盖：会话摘要声明 `frameHandoffActive=true`、`frameHandoffMode=native-latest-frame-handoff`，还没产出 decoded sample 时返回 `waiting-decoded-frame`，产出 sample 后能记录 latest-frame 格式和字节数。
- Rust native surface target 测试必须覆盖：会话摘要声明 `nativeSurfaceReady=true`、`nativeSurfaceMode=d3d11-latest-frame-texture-target`、目标尺寸 `1920x1080`、格式与 decoder 输出 subtype 对齐。
- Rust native surface copy 测试必须覆盖：contiguous decoded `IMFSample` 能写入 D3D11 latest-frame texture，并记录 `nativeSurfaceCopyStatus/nativeSurfaceCopyBytes/nativeSurfacePresentedFrames/nativeSurfaceLastFrameId`。
- Rust native present target 测试必须覆盖：会话摘要声明 `nativePresentReady=true`、格式 `BGRA8`；无 HWND 时 BGRA8 latest-frame texture 可 staged 到 present texture，带 HWND 时 BGRA8 latest-frame 可进入 `d3d11-hwnd-swapchain` 并返回 `latest-frame-swapchain-presented`；NV12 latest-frame 可通过 D3D11 `VideoProcessorBlt` 转入 BGRA8 present texture，并在带 HWND 时返回 `latest-frame-nv12-converted-presented`；NV12 窗口 client resize 后必须触发 swapchain `ResizeBuffers`、重建 present texture 并继续 Present。
- Rust stream-change 恢复测试必须覆盖：`MF_E_TRANSFORM_STREAM_CHANGE` 后重新选择输出 subtype、重建 D3D11 native surface / present target，并把 `decoderSession.outputSubtype`、`nativeSurface*`、`nativePresent*` 同步刷新为 `stream-change-reconfigured` 证据。
- Rust device-lost 恢复测试必须覆盖：识别 `DXGI_ERROR_DEVICE_REMOVED/RESET/HUNG` / HRESULT 字符串，device-lost 后能重建 D3D11 native surface / present target，并把 `decoderSession` 保持在 `device-lost-rebuilt` 或 `device-lost-rebuild-blocked`，不误报普通 `waiting-decoded-frame`。
- Windows 复测摘要测试必须覆盖：真实复测输出里的 `W8NativeVideo=` 会被 `post-w2w3-retest-board` 安全提取、单独上板，并且不会把 W8 的 `decoded/present` 字段混进 `W2H264BoardDiagnosis=`；同一摘要必须包含 `ui=html-shell`、`mainSurface=native-hwnd|native-pending`、`canvasRole=diagnostic-fallback`、`presenting=yes|no`、`presentGap=<n>`、`queueDrops=<n>`、`queueDropScope=predecode|queue` 与 `queueReason=<reason>`，防止长跑时只看到静态 `presentFrames/decoded` 或旧 queue dropped 统计而无法快速判断原生呈现是否脱节。
- Rust HWND swapchain 预检测试必须覆盖：swapchain 描述使用 BGRA8、2 buffers、single-sample、flip-discard 和 client 尺寸兜底；Windows 控制端诊断/导出必须出现 `原生窗口交换链 ...`。
- 桌面端 `cargo check` 必须通过。
- 后续接入真实渲染后，真实最小化 / 切 app / 切回测试要看本机视频队列是否保持在 80-180ms 附近，而不是继续堆到 600ms+。
