# W11 / W8-RUSTDESK-AUDIT

最后更新：2026-06-22

用途：回应 Agent Link Board 的 W11 开工令，把 RustDesk 的视频/实时策略思路转成我们自己的 Windows 控 Mac 落地计划。本文只做架构审计和实现映射，不复制 RustDesk AGPL 源码。

## AGPL 边界

- 只阅读 RustDesk 官方公开源码的结构和行为，不复制函数、类型、实现片段、注释或测试。
- 本项目实现继续使用自己的协议、诊断字段、Windows Tauri/Rust 代码和 Mac host H.264/PCM 输出。
- 本轮不改 Mac、不改 WebSocket 协议、不请求密码、不做真实 input/inject、不改系统声音输出。
- 参考来源：
  - https://github.com/rustdesk/rustdesk/blob/master/src/server/video_service.rs
  - https://github.com/rustdesk/rustdesk/blob/master/src/server/video_qos.rs
  - https://github.com/rustdesk/rustdesk/blob/master/src/server/audio_service.rs

## 1. 常驻视频服务循环

RustDesk 做法：`video_service` 是常驻 capturer + encoder 服务。它创建 capture backend，读取 `VideoQoS` 的 `spf` 和 `ratio`，用 negotiated codec 初始化 encoder；捕获到有效帧后编码发送，并把 `VideoReceived` 这类客户端回执作为节奏信号。捕获、编码、显示变化、隐私模式、UAC/桌面变化和 codec switch 都在服务循环里处理；硬编初始化失败时会切 fallback。

我们怎么自己实现：Windows 桌面端要把 WebView 降为控制壳和诊断面，主视频链路改成常驻 native media session：Mac H.264 入站后进入 Windows native receiver，随后走 realtime queue -> MF/D3D11 decoder -> HWND/D3D surface present。已有 W8 已经做到 `w8_native_video.rs` 中的 Annex B 入站识别、低延迟队列、持久 MF worker、D3D11 latest-frame surface、NV12/BGRA8 -> HWND present、stream-change/device-lost 恢复和 `W8NativeVideo=` 摘要；W12 应把这些散点正式收束成“桌面端 native session 是主路径”的入口，而不是继续补 Web 摘要。

涉及我们文件：
- `apps/windows-desktop/src-tauri/src/w8_native_video.rs`
- `apps/windows-desktop/src-tauri/src/main.rs`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `scripts/windows/post-w8-desktop-video-board.mjs`
- `scripts/windows/post-w2w3-retest-board.mjs`
- `docs/w8-windows-desktop-video-plan.md`

最小补丁：
- W12-1：在 `w8_native_video.rs` 内明确 native session 状态机，记录 `receiverActive/decoderActive/presentActive/sessionMode`，并把“WebView 主解码”从正常路径降为 `diagnostic-fallback`。
- W12-2：在 `app.js` 的 H.264 接收路径里，当桌面 Tauri 命令可用且 native present 已启动时，WebCodecs/canvas 只保留诊断备用，不再驱动主画面。
- W12-3：在上板 helper 中继续强制 `mainSurface=native-hwnd`、`presenting=yes`、`presentGap`、`w8Decoder` 和 `errors=0` 作为 W8/C5 真实验收入口。

测试命令：
- `cd apps/windows-desktop/src-tauri; cargo test w8_native_video`
- `cd apps/windows-desktop/src-tauri; cargo check`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `node scripts/windows/test-post-w8-desktop-video-board.mjs`
- `node scripts/windows/test-post-w2w3-retest-board.mjs`

真实验收字段：
- `mainSurface=native-hwnd`
- `canvasRole=diagnostic-fallback`
- `webDecode=native-main-surface`
- `presenting=yes`
- `presentFrames`
- `decoded`
- `presentGap`
- `w8Decoder=pushed:<n>/submitted:<n>/gap:<n>`
- `errors=0`

## 2. VideoQoS 到 W13 实时控制器

RustDesk 做法：`VideoQoS` 用每个用户的 delay history、RTT、FPS 和质量 ratio 做动态控制。源码注释里的核心策略是：网络延迟低于阈值时提高 FPS 或质量，延迟高时降低 FPS 或质量；实际 delay 使用 delay minus RTT；多用户时按最保守的节奏收敛。它还区分动态画面、码率 ratio、用户质量选择和每秒/每几秒的调整节奏。

我们怎么自己实现：W13 新增 Windows 本地实时控制器，不先改协议。输入来自我们已有诊断：`arrivalSource/localQueueMs/presentGap/decoderGap/remoteMediaGap/staleDrops/liveBacklogRequests/visibilityRecovery`；输出先只影响 Windows 本地 drop policy、keyframe request 和诊断建议，后续再通过现有 `display_settings` 或新安全消息回传 Mac 调 `fps/bitrate/keyframe`。这样先解决“Windows 本地堆旧帧”和“native present 跟不上”的判断，再考虑让 Mac 降帧或降码率。

涉及我们文件：
- `apps/windows-desktop/src-tauri/src/w8_native_video.rs`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `scripts/windows/post-w8-desktop-video-board.mjs`
- `scripts/windows/post-w2w3-retest-board.mjs`
- 后续可新增 `apps/windows-desktop/src-tauri/src/w13_video_qos.rs`

最小补丁：
- W13-1：新增纯函数 `decideVideoQoS` 或 Rust 等价函数，输入最近 2-3 秒诊断窗口，输出 `desiredFps/desiredBitrateKbps/keyframeRequest/dropPolicy/reason`。
- W13-2：先在 Windows 端执行 `drop-old-keep-latest`、`wait-keyframe`、`request-keyframe`，不立即改变 Mac；当 `remoteMediaGap` 证明源端 cadence 异常时，再把建议回传给 Mac。
- W13-3：把决策结果放进 `W8NativeGate=` 或 `W8ArrivalBacklog=`，避免真实长跑只看到现象看不到控制器建议。

测试命令：
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `node scripts/windows/test-post-w8-desktop-video-board.mjs`
- `node scripts/windows/test-post-w2w3-retest-board.mjs`
- 后续新增后跑：`node scripts/windows/test-w13-video-qos.mjs`

真实验收字段：
- `arrivalSource=windows-arrival-gap|windows-queue-backlog|remote-media-gap|stable`
- `localMaxMs`
- `remoteMediaMaxMs`
- `presentGap`
- `decoderGap`
- `desiredFps`
- `desiredBitrateKbps`
- `dropPolicy=drop-old-keep-latest|wait-keyframe|keep`
- `keyframeRequest=yes|no`

## 3. 硬编解码失败与 fallback

RustDesk 做法：`video_service` 会根据 negotiated codec 选择硬件或软件编码路径，硬件初始化失败会 fallback 到软件 codec；运行中如果 codec、capture backend、display、UAC/桌面状态等关键条件变化，会触发服务 switch/restart，而不是在错误状态里继续假装正常。

我们怎么自己实现：W12 要把 MF/D3D11 decoder 和 native present 的失败分层，不把 fallback 当 PASS。失败先分类，再决定是否重建 D3D11 surface、重建 decoder session、请求 keyframe、退到 JPEG/diagnostic，还是提示用户重启桌面端。Web/JPEG fallback 只能叫 `diagnostic-fallback`，不能让 `W8NativeGate` 进入 `arrival-backlog-next` 或 C5 PASS。

涉及我们文件：
- `apps/windows-desktop/src-tauri/src/w8_native_video.rs`
- `apps/windows-desktop/src-tauri/src/main.rs`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `scripts/windows/post-w8-desktop-video-board.mjs`

最小补丁：
- W12-4：在 `w8_native_video.rs` 增加失败分类摘要：`nativeFailureClass=decoder-init|decode-step|surface-copy|present|stream-change|device-lost|unsupported-codec|unknown`。
- W12-5：当 `nativeFailureClass` 是可恢复类别时先执行现有重建策略；不可恢复时输出明确 fallback，WebView 只显示诊断画面和下一步建议。
- W12-6：`post-w8-desktop-video-board` 中如果出现 native failure 或 `mainSurface!=native-hwnd`，gate 必须保持 `native-present-next` / `native-error-next`，不进入体验 PASS。

测试命令：
- `cd apps/windows-desktop/src-tauri; cargo test w8_native_video`
- `cd apps/windows-desktop/src-tauri; cargo check`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `node scripts/windows/test-post-w8-desktop-video-board.mjs`

真实验收字段：
- `nativeFailureClass`
- `nativeRecovery=rebuilt|restart-required|fallback-diagnostic`
- `present=latest-frame-nv12-converted-presented|latest-frame-swapchain-presented`
- `streamChange=yes|no`
- `deviceLost=yes|no`
- `errors=0`
- `mainSurface=native-hwnd`

## 4. VideoReceived / Present ack 节奏

RustDesk 做法：服务端发送视频帧后，会等客户端 `VideoReceived` 或超时，这让服务循环能感知客户端是否真正消费了帧，而不是只看“已发送”。这个思路和 `VideoQoS` 结合后，可以避免编码端继续用错误节奏推帧。

我们怎么自己实现：我们当前是 Windows 控 Mac，Windows 是接收/呈现端，所以第一阶段不需要复制 RustDesk 的网络 ack 模型。我们要先建立本地 native present ack：一帧被提交 decoder、decoded、写入 surface、present 到 HWND 后，分别更新 `submitted/decoded/presentFrames/presentGap`。第二阶段再把 Windows 的本地 QoS 建议安全回传 Mac，让 Mac 调整 `fps/bitrate/keyframe`。

涉及我们文件：
- `apps/windows-desktop/src-tauri/src/w8_native_video.rs`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`
- `scripts/windows/post-w8-desktop-video-board.mjs`
- `shared/protocol`（第二阶段才需要，修改前必须另开高冲突占用）

最小补丁：
- W12-7：把 native present ack 明确写成 `nativeAck=submitted|decoded|surface|presented` 或同等诊断字段。
- W13-4：当 `presentGap` 或 `decoderGap` 连续超阈值时，QoS 控制器输出本地 drop/keyframe 策略；只有 `remoteMediaGap` 证明源端异常时才考虑回传 Mac。
- 第二阶段协议改动必须单独登记，不在 W11 审计里直接修改。

测试命令：
- `cd apps/windows-desktop/src-tauri; cargo test w8_native_video`
- `node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary --timeoutMs 45000`
- `node scripts/windows/test-post-w8-desktop-video-board.mjs`

真实验收字段：
- `submitted`
- `decoded`
- `presentFrames`
- `presenting=yes`
- `presentGap`
- `nativeAck=presented`
- `keyframeRequest=yes|no`
- `arrivalSource`

## 5. 音频 10ms 模型交给 W9

RustDesk 做法：`audio_service` 的方向是音频服务循环、设备选择/重启、10ms PCM frame、Opus LowDelay 编码，并关注 loopback 能力和平台差异。它会在设备变更或服务 restart 时重新建立音频流。

我们怎么自己实现：这部分归 W9，不在 W11 视频主线里改。可借鉴的不是代码，而是模型：Mac PCM 进入 Windows native playback queue 后按 10/20ms frame 管理；queue 超阈值时 trim future/stale；设备和重启逻辑只做用户同意后的可恢复路径，不改系统默认输出设备。

涉及我们文件：
- `apps/windows-desktop/src-tauri/src/w9_native_audio.rs`
- `apps/windows-desktop/src-tauri/src/native_audio_queue.rs`
- `apps/windows-desktop/src-tauri/src/native_audio_player.rs`
- `apps/windows-client/app.js`
- `scripts/windows/test-windows-client-browser.mjs`

最小补丁：
- W9-1：把 Mac PCM 帧切入 native audio queue，标记 `nativeAudioQueueMs/nativeAudioDrop/nativeAudioStutter`。
- W9-2：10ms 或 20ms 为内部调度单位，保持 WebAudio 为诊断/备用。
- W9-3：设备 restart 只在用户同意和可恢复路径明确后执行，不改系统输出设备。

测试命令：
- `cd apps/windows-desktop/src-tauri; cargo test native_audio`
- `node scripts/windows/test-windows-client-browser.mjs --onlyAudioBufferGuards --timeoutMs 45000`
- 后续 W9 新增专项 native audio playback 测试。

真实验收字段：
- `nativeAudioQueueMs`
- `nativeAudioDrop=0`
- `nativeAudioStutter=0`
- `audioFrameMs=10|20`
- `audioMode=native-pcm`

## W11 结论

- W11 不再继续做摘要小补丁；它把 W8 后续拆成 W12 原生视频最小可用链路、W13 实时 QoS、W9 原生音频模型。
- W12 的第一目标不是“画面能显示”，而是“主画面由 native-hwnd 承担，并且 Web/canvas 只保留诊断 fallback”。
- W13 的第一目标不是立刻改 Mac 协议，而是在 Windows 本地先把 `arrivalSource/presentGap/decoderGap/remoteMediaGap` 转成可解释的 `desiredFps/desiredBitrateKbps/dropPolicy/keyframeRequest`。
- C5 真实体验验收必须看 15 分钟连续运行、窗口切换/最小化、`mainSurface=native-hwnd`、`presenting=yes`、`presentGap` 可接受、`w8Decoder` 正常、音频 dropped/stutter、剪贴板/文件入口和窗口/全屏/原画入口。真实 input/inject 另开任务。
