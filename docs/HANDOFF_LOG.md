# 双端交接记录

用途：每个 Codex 完成一段工作后，把结果写在最上面。另一端只看最新几条，就能知道该接哪里。

## 交接模板

```text
日期：
开发端：
本轮目标：
完成内容：
修改文件：
验证方式：
遗留问题：
下一步建议：
是否改了协议：
是否需要另一端配合：
```

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：让 Windows 控制端全屏体验由悬浮控制中心主导。
完成内容：
- Windows 控制端进入全屏后隐藏原顶部工具栏，不再占用远控画面上方空间。
- 全屏时远控画面贴边显示，保留底部状态栏和右上角悬浮控制中心。
- 悬浮控制中心的“全屏”和“窗口”按钮已纳入 `test-windows-client-browser.mjs` 回归。
- Windows 控制端 README 已说明全屏后顶部工具栏隐藏，悬浮控制中心作为主要入口。
修改文件：
- `apps/windows-client/styles.css`
- `apps/windows-client/README.md`
- `scripts/windows/test-windows-client-browser.mjs`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node --check apps/windows-client/app.js`
- `node scripts/windows/test-coordinate-mapping.mjs`
- 临时启动假 Mac 服务后运行 `node scripts/windows/test-windows-client-browser.mjs --noRequireVideoSurface`
验证结果：
- 控制中心回归通过：`open=true, quality=true, scale=true, audio=true, volume=true, fullscreen=true, window=true`。
- 假 Mac 页面级自检仍通过：连接、诊断、模拟视频 surface 和 WebCodecs 环境检查均正常。
遗留问题：
- 还没有做悬浮控制中心拖动、自动收起或边缘吸附。
下一步建议：
- 后续可继续把“安全/更多/快捷键”做进悬浮控制中心，再逐步弱化顶部工具栏。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：把 Windows 控制端悬浮控制中心纳入页面级自检回归。
完成内容：
- `scripts/windows/test-windows-client-browser.mjs` 在连接被控端前会先展开 `#controlCenterToggle`。
- 自动验证悬浮控制中心的画质、缩放、声音开关和音量会同步到原顶部工具栏。
- 验证完成后会恢复页面初始显示设置，再继续执行原有 WebSocket 连接、诊断和视频 surface 检查。
- Windows 控制端 README 已说明页面级自检会先回归悬浮控制中心。
修改文件：
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node --check apps/windows-client/app.js`
- `node scripts/windows/test-coordinate-mapping.mjs`
- 临时启动假 Mac 服务后运行 `node scripts/windows/test-windows-client-browser.mjs --noRequireVideoSurface`
验证结果：
- 控制中心回归通过：`open=true, quality=true, scale=true, audio=true, volume=true`。
- 假 Mac 页面级自检仍通过：连接、诊断、模拟视频 surface 和 WebCodecs 环境检查均正常。
遗留问题：
- 暂未把该检查拆成独立脚本；目前作为 Windows 控制端页面级自检的一部分执行。
下一步建议：
- 后续继续增强悬浮控制中心时，把新增菜单项同步补进同一个页面级回归。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：参考用户提供的 UU 远程控制中心思路，给 Windows 控制端增加画面内悬浮控制中心第一版。
完成内容：
- 在 Windows 控制端远控画面右上角新增“控制中心”悬浮入口。
- 展开后可快速切换显示屏、画质、缩放模式、声音开关、音量、全屏、窗口和退出远控。
- 悬浮控件不维护第二套状态，而是同步驱动现有顶部工具栏控件和原有 `sendDisplaySettings()`、`setFullscreen()`、`disconnect()` 逻辑。
- 控制中心在真实视频帧显示后仍保留在画面上，不会被模拟窗口隐藏逻辑影响。
- Windows 控制端 README 已补充该能力。
修改文件：
- `apps/windows-client/index.html`
- `apps/windows-client/styles.css`
- `apps/windows-client/app.js`
- `apps/windows-client/README.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check apps/windows-client/protocol-client.js`
- `node scripts/windows/test-coordinate-mapping.mjs`
- 本地浏览器自动化检查：展开控制中心，验证画质、缩放、声音和音量会同步到原工具栏。
- 临时启动假 Mac 服务后运行 `node scripts/windows/test-windows-client-browser.mjs --noRequireVideoSurface`
验证结果：
- 自动化检查确认控制中心可展开，`sharp` 画质同步到 `4K / 120 Hz / 50 Mbps`，缩放、声音和音量同步正常。
- 页面截图人工查看正常：浮层位于画面右上角，文字未溢出，未遮挡主要远控内容。
- 假 Mac 页面级自检通过：控制端可连接、接收模拟视频帧并保持现有诊断状态。
遗留问题：
- 第一版是固定右上角浮层，暂未做拖动、吸附边缘、自动收起、快捷键唤出和菜单分组动画。
下一步建议：
- 后续可继续补“显示屏/画质/窗口/声音/安全/更多”分组菜单，并在全屏状态下隐藏顶部工具栏，只保留悬浮控制中心。
- Mac 控制 Windows 的 `apps/mac-client` 后续也可复用同样的信息架构，形成双端一致体验。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：把 Mac client 文本剪贴板发送纳入 Windows 端页面级自检。
完成内容：
- `scripts/windows/test-mac-client-browser.mjs` 在视频和输入确认之后，会自动填写 Mac client 文本剪贴板输入框并点击发送。
- 自检会等待页面收到 `clipboard_ack`，并要求真实 Windows host 返回 `system` 模式，覆盖 Mac 控制 Windows 的文本剪贴板端到端链路。
- Windows host README 已更新，说明 Mac 控制 Windows 页面级自检覆盖真实视频、`input_ack` 和文本 `clipboard_ack`。
- 未修改 `apps/mac-client` 本体，避免和 Mac 端正在做的音频播放入口冲突。
修改文件：
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/windows-host/README.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/test-mac-client-browser.mjs`
验证结果：
- 页面连接临时 Windows host 成功，显示真实 `windows-host-ffmpeg-mjpeg` 画面。
- 鼠标和键盘事件收到 `input_ack`：`已确认 · log`。
- 文本剪贴板发送后收到 `clipboard_ack`：`已写入 · system · 41 字`。
遗留问题：
- 该脚本仍只验证 Mac client 的 Web 原型；后续原生 Mac 控制端出现后要补同等回归。
下一步建议：
- 根据用户反馈，后续 Windows 控制端和 Mac 控制端都可以学习 UU 远程的“悬浮控制中心”方式：远控画面顶部或边缘放小型浮动入口，展开后提供显示屏、画质、窗口、声音、安全、快捷键、全屏和退出远控等菜单。
- Mac 端当前可继续补 Windows 音频播放；Windows 端后续可继续补 Windows host WASAPI loopback 或控制端悬浮工具栏原型。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：给 Mac 控制 Windows 原型增加远端音频播放入口。
完成内容：
- `apps/mac-client` 右侧新增“Windows 声音”面板，默认关闭，不会主动请求远端声音。
- 打开“播放远端声音”后会发送 `audio_settings_update`，并显示音量、远端确认和音频帧接收状态。
- 新增 WebAudio PCM 播放队列，支持 `pcm-f32le-base64` 过渡音频帧，兼容 `planar` / `interleaved` 布局。
- mock 音频帧只更新状态，不会假装播放真实系统声音。
- 断开连接或关闭声音时会关闭 AudioContext，避免后台继续占用音频资源。
修改文件：
- `apps/mac-client/app.js`
- `apps/mac-client/index.html`
- `apps/mac-client/styles.css`
- `apps/mac-client/README.md`
- `README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/mac-client/server.mjs`
- `node --check apps/mac-client/app.js`
- `git diff --check`
- 本机启动 Windows host 回退服务：`LAN_DUAL_PORT=43772 LAN_DUAL_HOST=127.0.0.1 LAN_DUAL_WINDOWS_INPUT_MODE=log node server.mjs`
- 本机启动 Mac client：`node server.mjs`
- 内置浏览器打开 `http://127.0.0.1:5188/`，连接 `127.0.0.1:43772`，再打开“播放远端声音”。
验证结果：
- 默认连接后音频状态为 `未开启`，说明未主动请求远端音频。
- 打开声音后收到 `audio_settings_ack`：`mock-opus · 80%`。
- 页面显示 mock 音频帧接收状态：`接收 5 帧 · mock`。
- Windows host 日志确认：`音频设置已更新：开启 / 80%`。
- 临时 `43772` 和 `5188` 测试端口已关闭。
遗留问题：
- 本机 macOS 只能验证 mock 音频帧和播放入口状态；真实 PCM 播放需要 Windows host 配置 `LAN_DUAL_WINDOWS_AUDIO_DEVICE` 或后续 WASAPI loopback 后，在真实 Windows 上确认可听见声音。
- 目前没有音频延迟/漂移 UI，只显示播放帧数和丢帧计数。
下一步建议：
- Windows 端可用真实 DirectShow loopback/虚拟声卡设备启动 Windows host，然后让 Mac client 打开“播放远端声音”，确认 `pcm-f32le-base64` 可播放。
- Mac 端后续继续补文件剪贴板和更完整的错误提示。
是否改了协议：否；复用现有 `audio_settings_update`、`audio_settings_ack` 和 `audio_frame`。
是否需要另一端配合：真实 Windows PCM 播放验收需要 Windows 端提供真实 PCM 音频帧。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：给 Mac 控制 Windows 原型增加文本剪贴板发送入口。
完成内容：
- `apps/mac-client` 右侧新增“文本剪贴板”面板，可输入文字并发送到 Windows host。
- 发送消息使用现有 `clipboard_text`，方向为 `client_to_host`，并显示远端返回的 `clipboard_ack`、写入模式和文本长度。
- `session_offer.wantClipboardText` 已改为 `true`，让会话能力和页面实际能力一致。
- Mac client 事件日志改为安全 DOM 拼接，不再用 `innerHTML` 拼远端字符串。
- README、当前状态、下一步和任务板已同步，反方向“文本剪贴板可用”单独标为完成；文件剪贴板和音频播放仍是后续项。
修改文件：
- `apps/mac-client/app.js`
- `apps/mac-client/index.html`
- `apps/mac-client/styles.css`
- `apps/mac-client/README.md`
- `README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check apps/mac-client/server.mjs`
- `node --check apps/mac-client/app.js`
- `git diff --check`
- 本机启动 Windows host 回退服务：`LAN_DUAL_PORT=43772 LAN_DUAL_HOST=127.0.0.1 LAN_DUAL_WINDOWS_INPUT_MODE=log node server.mjs`
- 本机启动 Mac client：`node server.mjs`
- 内置浏览器打开 `http://127.0.0.1:5188/`，连接 `127.0.0.1:43772`。
验证结果：
- 页面发现、WebSocket 连接、认证、会话协商和视频显示通过。
- 键盘 `a` 输入收到 `input_ack`：`已确认 · log`。
- 文本剪贴板发送 `ABC` 后收到 `clipboard_ack`：`已写入 · memory-only · 3 字`。
- Windows host 日志确认：`收到文本剪贴板：3 字 / memory-only`。
- 临时 `43772` 和 `5188` 测试端口已关闭。
遗留问题：
- 本机 macOS 环境验证的是 Windows host 非 Windows 回退模式 `memory-only`；真实 Windows 机器上应显示 `system`。
- 内置浏览器 `fill()` 受虚拟剪贴板限制，自动化验证改用逐键输入；页面手动输入不受影响。
- 文件剪贴板、自动监听 Mac 本机剪贴板和 Windows 音频播放仍未接入 Mac client。
下一步建议：
- Windows 端可扩展 `scripts/windows/test-mac-client-browser.mjs`，把 Mac client 文本剪贴板发送纳入页面级自检，并在真实 Windows host 上确认 `mode=system`。
- Mac 端后续继续补 Mac client 文件剪贴板、Windows 音频播放和真实 Windows host 端到端验收。
是否改了协议：否；复用现有 `clipboard_text` / `clipboard_ack`。
是否需要另一端配合：暂无阻塞；真实 Windows 系统剪贴板模式验证需要 Windows 端运行真实 Windows host。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：给 Windows host 一键自检增加默认端口冲突防护。
完成内容：
- `scripts/windows/test-windows-host.ps1` 默认启动临时 Windows host 前会检查目标端口。
- 如果 `127.0.0.1:43772` 已被其他服务占用，脚本会自动选择临时空闲端口并把探针连接目标切到该端口。
- 只有显式传入 `-UseExisting` 时才复用已经运行的 Windows host，避免误连旧进程导致自检结论不准。
- Windows host README 已补充该行为和 `-UseExisting` 用法。
修改文件：
- `scripts/windows/test-windows-host.ps1`
- `apps/windows-host/README.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-windows-host.ps1 -Fps 30`
- 临时占用 `127.0.0.1:43772` 后再次运行同一条自检命令
验证结果：
- 正常路径通过：真实 `windows-ffmpeg-gdigrab-mjpeg` 首帧、文本剪贴板和文件剪贴板均通过。
- 端口占用路径通过：脚本输出临时端口并完成同样的真实视频和剪贴板验证。
遗留问题：
- 无。
下一步建议：
- 等 Mac client 文本剪贴板提交推送后，Windows 端可拉取并扩展 `test-mac-client-browser.mjs` 覆盖文本剪贴板 ack。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：给 Mac client 页面级自检增加 Windows host 临时端口冲突防护。
完成内容：
- `scripts/windows/test-mac-client-browser.mjs` 在临时启动 Windows host 前会检查目标端口能否绑定。
- 默认 `43772` 被占用时自动切换到临时空闲端口，并把页面表单同步改成该端口。
- 只有显式 `--useExistingHost` 时才复用已经运行的 Windows host。
- Windows host README 已记录该行为。
修改文件：
- `scripts/windows/test-mac-client-browser.mjs`
- `apps/windows-host/README.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `git diff --check`
- `node scripts/windows/test-mac-client-browser.mjs`
- 临时占用 `127.0.0.1:43772` 后运行 `node scripts/windows/test-mac-client-browser.mjs`
验证结果：
- 正常页面级自检通过：真实 `windows-host-ffmpeg-mjpeg` 画面和 `input_ack · log`。
- 端口占用场景通过：输出 `Port 43772 is busy; using temporary Windows host port ...`，页面连接临时端口并通过。
遗留问题：
- Mac client 页面自己的日志仍会提示默认端口 `43772`，但脚本已经覆盖输入框端口，不影响自检结果。
下一步建议：
- 后续可给其他固定端口脚本继续补同样的端口避让。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：给 Windows host 增加显式配置的 FFmpeg DirectShow PCM 音频采集入口。
完成内容：
- `WindowsAudioCaptureCoordinator` 默认仍保持模拟音频帧，不会自动采集真实麦克风或系统声音。
- 设置 `LAN_DUAL_WINDOWS_AUDIO_DEVICE` 且 `LAN_DUAL_WINDOWS_AUDIO_MODE=dshow` 后，Windows host 会用 FFmpeg DirectShow 采集指定音频设备，输出 `pcm-f32le-base64`、48kHz、双声道、20ms PCM 帧。
- `/discovery` 的音频能力会列出 DirectShow audio 设备、当前模式、配置设备、后端和错误信息。
- Windows host 服务端已接入音频 `start/stop`，真实 PCM 按 20ms 发送；mock 音频仍按低频状态帧发送。
- 文档已说明该入口适合先接 loopback/虚拟声卡设备，正式默认系统声音仍待 WASAPI loopback。
修改文件：
- `apps/windows-host/src/windows-audio-capture.mjs`
- `apps/windows-host/src/windows-host-service.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check apps/windows-host/src/windows-audio-capture.mjs`
- `node --check apps/windows-host/src/windows-host-service.mjs`
- `npm.cmd run check` in `apps/windows-host`
- `git diff --check`
- 内存 PCM 打包验证：向音频模块注入 7680 字节静音 PCM，确认输出 `pcm-f32le-base64`。
- 显式配置模式协商验证：设置临时 `LAN_DUAL_WINDOWS_AUDIO_DEVICE=unit-test-device` 和 `LAN_DUAL_WINDOWS_AUDIO_MODE=dshow`，确认 capabilities/answer 为 DirectShow PCM。
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-host.ps1 -Fps 30`
- `node scripts/windows/test-auth-retry-policy.mjs`
- `node scripts/windows/test-mac-client-browser.mjs`
验证结果：
- 默认未配置设备时，Windows host 仍是安全 mock 音频；发现接口列出了本机可用 DirectShow audio 设备。
- PCM 帧打包通过：`7680 bytes / 48000 Hz / 2 ch / 960 frames`。
- 显式配置协商通过：`dshow-pcm / pcm-f32le / pcm-f32le-base64`。
- Windows host 一键自检、认证回归和 Mac client 页面级自检均通过。
遗留问题：
- 没有主动打开真实音频设备实采，避免未经确认采集麦克风；需要用户明确选择 loopback/虚拟声卡设备后再做端到端声音验证。
- 正式默认系统声音采集仍需 WASAPI loopback。
下一步建议：
- 用户确认可用 loopback/虚拟声卡设备名后，运行 Windows host 并用 Mac client 验证真实 PCM 播放。
是否改了协议：否；复用已有 `pcm-f32le-base64` 音频帧字段。
是否需要另一端配合：暂不需要；真机声音播放验收时需要 Mac client 连接 Windows host。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：给 Windows host 视频观察脚本增加临时端口冲突防护。
完成内容：
- `scripts/windows/observe-windows-host-video.mjs` 在临时启动 Windows host 前会先检查目标端口能否绑定。
- 默认端口被占用时，脚本会自动申请一个临时空闲端口并改用该端口启动/观察。
- `--useExisting` 模式保持原行为，用于连接已经运行的 Windows host。
- Windows host README 已记录端口行为。
修改文件：
- `scripts/windows/observe-windows-host-video.mjs`
- `apps/windows-host/README.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check scripts/windows/observe-windows-host-video.mjs`
- `git diff --check`
- `node scripts/windows/observe-windows-host-video.mjs --durationMs 1500 --minFrames 8 --minFps 6`
- 临时占用 `127.0.0.1:43772` 后运行观察脚本，确认输出 `Port 43772 is busy; using temporary port ...` 并完成视频观察。
验证结果：
- 默认观察路径通过。
- 端口占用场景通过：脚本自动换到临时端口，完成 FFmpeg gdigrab 观察。
遗留问题：
- 其他旧脚本仍使用固定端口；如果未来也需要并行跑，可逐步加同样的端口防护。
下一步建议：
- 后续需要并行跑多个本机自检时，优先使用已带端口防护的观察脚本，其他脚本串行运行。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：优化 Windows host 视频发送调度，让 FFmpeg MJPEG 更接近协商帧率。
完成内容：
- 将 Windows host 视频发送循环从固定 `setInterval` 改为上一帧完成后的自调度 `setTimeout`。
- 调度会按目标间隔追赶下一帧，避免 FFmpeg 等待新帧时跳过下一次定时器 tick。
- 保留原有防重入逻辑，断开连接和重启会话时仍会停止当前视频循环。
- 更新任务板、下一步行动、交接记录和文件占用记录。
修改文件：
- `apps/windows-host/src/windows-host-service.mjs`
- `docs/04-task-board.md`
- `docs/NEXT_ACTIONS.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check apps/windows-host/src/windows-host-service.mjs`
- `npm.cmd run check` in `apps/windows-host`
- `git diff --check`
- `node scripts/windows/observe-windows-host-video.mjs`
- `node scripts/windows/test-mac-client-browser.mjs`
- `node scripts/windows/observe-windows-host-video.mjs --screenMode system --fps 4 --durationMs 2500 --minFrames 3 --minFps 1 --maxGapMs 2000`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-host.ps1 -Fps 30`
- `node scripts/windows/test-auth-retry-policy.mjs`
验证结果：
- FFmpeg gdigrab 默认路径从约 23.99 FPS 提升到约 29.39 FPS：5 秒收到 147 帧，最大帧间隔 52 ms，掉帧 0。
- Mac client 页面级自检通过，仍能显示 `windows-host-ffmpeg-mjpeg` 并收到 `input_ack · log`。
- System.Drawing 兜底路径串行重跑通过：约 2.91 FPS，最大帧间隔 354 ms，`capturePipeline=windows-gdi-jpeg`。
- Windows host 一键自检和认证重试回归均通过。
遗留问题：
- FFmpeg MJPEG 仍是过渡方案；若要 60/120Hz 或更低带宽，还需要 Windows Graphics Capture 与正式编码管线。
下一步建议：
- 后续改视频采集时继续用 `observe-windows-host-video.mjs` 做量化，再用页面级自检确认 UI 体验。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：新增 Windows host 视频持续帧观察脚本，方便判断真实帧率和卡顿。
完成内容：
- 新增 `scripts/windows/observe-windows-host-video.mjs`。
- 默认会临时启动 Windows host，完成 `/discovery`、WebSocket、认证、会话协商后观察 5 秒 `video_frame`。
- 统计实际帧数、平均 FPS、最大帧间隔、平均 payload、掉帧数、采集管线和 codec。
- 支持 `--useExisting` 连接已运行的 Windows host，支持 `--screenMode system` 对照旧系统截图兜底路径，支持 `--json` 输出。
- 更新根 README、Windows host README、当前状态、下一步行动和任务板。
修改文件：
- `scripts/windows/observe-windows-host-video.mjs`
- `README.md`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check scripts/windows/observe-windows-host-video.mjs`
- `git diff --check`
- `node scripts/windows/observe-windows-host-video.mjs`
- `node scripts/windows/observe-windows-host-video.mjs --screenMode system --fps 4 --durationMs 2500 --minFrames 3 --minFps 1 --maxGapMs 2000`
验证结果：
- FFmpeg gdigrab 默认路径通过：5 秒收到 120 帧，平均约 23.99 FPS，最大帧间隔 50 ms，`capturePipeline=windows-ffmpeg-gdigrab-mjpeg`。
- System.Drawing 兜底路径通过：约 2.04 FPS，最大帧间隔 541 ms，`capturePipeline=windows-gdi-jpeg`。
遗留问题：
- FFmpeg 过渡层仍未达到稳定满 30/60 FPS，后续仍需要 Windows Graphics Capture 或更正式的原生视频编码管线。
下一步建议：
- 每次改 Windows host 视频采集/调度后，先跑该脚本观察实际帧节奏，再跑页面级自检确认控制端显示。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：把 Windows host 屏幕采集从逐帧 PowerShell 截图过渡到 FFmpeg gdigrab 持续 MJPEG 管线，并保持自检稳定。
完成内容：
- Windows host 在 `auto` 模式下会优先检测并使用 FFmpeg `gdigrab`，输出 `windows-ffmpeg-gdigrab-mjpeg` / `windows-host-ffmpeg-mjpeg`。
- 无 FFmpeg 或显式 `system` 时继续使用 PowerShell/System.Drawing JPEG；采集失败仍会回退模拟帧。
- 视频发送调度从固定 8 FPS 上限改为按 `maxScreenFps` 调度；FFmpeg 模式默认 30 FPS，允许 1-60。
- `test-windows-host.ps1` 和 `test-mac-client-browser.mjs` 默认改为 `auto`，优先覆盖 FFmpeg 管线。
- Windows 系统剪贴板文本/文件写入增加短重试，降低 `Set-Clipboard` 被临时占用导致的误失败。
- 更新根 README、Windows host README、当前状态、下一步行动和任务板。
修改文件：
- `apps/windows-host/src/windows-screen-capture.mjs`
- `apps/windows-host/src/windows-host-service.mjs`
- `apps/windows-host/src/windows-clipboard-bridge.mjs`
- `scripts/windows/test-windows-host.ps1`
- `scripts/windows/test-mac-client-browser.mjs`
- `README.md`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check apps/windows-host/src/windows-clipboard-bridge.mjs`
- `node --check apps/windows-host/src/windows-screen-capture.mjs`
- `node --check apps/windows-host/src/windows-host-service.mjs`
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `git diff --check`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-host.ps1 -Fps 30`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-host.ps1 -ScreenMode system -SkipClipboardText -SkipClipboardFile`
- `node scripts/windows/test-mac-client-browser.mjs`
- `npm.cmd run check` in `apps/windows-host`
- `node scripts/windows/test-auth-retry-policy.mjs`
验证结果：
- Windows host 自检通过，`/discovery` 暴露 `mode=ffmpeg-mjpeg`、`capturePipeline=windows-ffmpeg-gdigrab-mjpeg`。
- 30 Hz 请求下首帧真实视频通过：`codec=jpeg`、`encoding=data-url`、`source=screen`、`capturePipeline=windows-ffmpeg-gdigrab-mjpeg`。
- 强制 `-ScreenMode system` 兜底路径通过，返回 `mode=system-jpeg`、`capturePipeline=windows-gdi-jpeg`。
- 文本剪贴板写入通过：`Clipboard text accepted: 57 chars / mode=system`。
- 文件剪贴板写入通过：`Clipboard file accepted: 1 file / 128 bytes / saveMode=clipboard`。
- Mac client 页面级自检通过，远端状态显示 `windows-host-ffmpeg-mjpeg`，并收到 `input_ack · log`。
- 认证重试策略回归通过，Windows host 和假 Mac 均保持错误密码剩余 `2/1/0`、第三次断开、新连接正确认证。
遗留问题：
- 这仍是过渡层，不是最终 Windows Graphics Capture；真实高帧率、低延迟和资源占用还需要后续 WGC 或原生编码管线。
- 当前 Windows host 音频仍是模拟帧，真实系统声音待 WASAPI loopback。
下一步建议：
- Mac 端可继续用 `apps/mac-client` 连接 Windows host，观察 FFmpeg MJPEG 画面和输入确认。
- Windows 端下一步可推进 WASAPI loopback 或 Windows Graphics Capture。
是否改了协议：否。
是否需要另一端配合：不需要；后续真机 Mac 反控 Windows 验收时再通过 Agent Link Board 发 call。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：把 Windows host 文本剪贴板写入纳入一键自检。
完成内容：
- `scripts/windows/test-windows-host.ps1` 默认增加 `--clipboardText` 验证。
- 新增 `-SkipClipboardText` 开关，特殊环境可跳过文本剪贴板验证。
- 更新根 README、Windows host README、当前状态、下一步行动和任务板。
修改文件：
- `scripts/windows/test-windows-host.ps1`
- `README.md`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `git diff --check`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-host.ps1`
验证结果：
- 临时 Windows host 启动成功，真实 `windows-gdi-jpeg` 首帧通过。
- 文本剪贴板写入通过：`Clipboard text accepted: 57 chars / mode=system`。
- 文件剪贴板写入通过：`Clipboard file accepted: 1 file / 128 bytes / saveMode=clipboard`。
遗留问题：
- 该自检会写入 Windows 系统剪贴板；需要保留原剪贴板内容时，可后续加保存/恢复逻辑。
下一步建议：
- Mac client 文本剪贴板入口推送后，用 `test-mac-client-browser.mjs` 扩展页面级验证，覆盖 Mac 控制 Windows 的剪贴板发送体验。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：新增认证重试策略回归脚本。
完成内容：
- 新增 `scripts/windows/test-auth-retry-policy.mjs`。
- 脚本会临时启动 Windows host，并导入启动假 Mac 服务。
- 对两条链路分别验证错误密码剩余 `2/1/0`、第三次认证失败后关闭连接、新连接正确密码通过。
- 更新根 README、Windows host README、当前状态、下一步行动和任务板。
修改文件：
- `scripts/windows/test-auth-retry-policy.mjs`
- `README.md`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check scripts/windows/test-auth-retry-policy.mjs`
- `git diff --check`
- `node scripts/windows/test-auth-retry-policy.mjs`
验证结果：
- Windows host 错误密码 3 次分别返回剩余 `2/1/0`，第三次后关闭；重新连接正确密码通过。
- 假 Mac 服务错误密码 3 次分别返回剩余 `2/1/0`，第三次后关闭；重新连接正确密码通过。
遗留问题：
- 该脚本只覆盖本地 Windows host 和假 Mac；真实 Mac 认证策略仍由 Mac 端自己的验证和探针覆盖。
下一步建议：
- 连接安全相关改动后先跑该脚本，再跑端到端页面/探针脚本。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：新增 Mac client 连接 Windows host 的 Windows 侧页面自检。
完成内容：
- 新增 `scripts/windows/test-mac-client-browser.mjs`。
- 脚本会临时启动 Windows host 和 `apps/mac-client` 静态页面，打开 Edge/Chrome，通过页面连接 Windows host。
- 自检会等待真实视频 surface，默认要求非 `mock-svg`，并发送鼠标移动、点击和键盘 `a`，确认页面收到 `input_ack`。
- 更新根 README、Windows host README、当前状态、下一步行动和任务板。
修改文件：
- `scripts/windows/test-mac-client-browser.mjs`
- `README.md`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check scripts/windows/test-mac-client-browser.mjs`
- `git diff --check`
- `node scripts/windows/test-mac-client-browser.mjs`
验证结果：
- 临时 Windows host 启动在 `127.0.0.1:43772`，Mac client 页面启动在 `127.0.0.1:5188`。
- 页面连接成功，远端状态 `1280x720 · windows-host-system-jpeg`，视频 `jpeg · #1`。
- 页面发送鼠标和键盘事件后收到 `input_ack`，输入状态 `已确认 · log`。
遗留问题：
- 默认输入模式为 `log`，不会真实注入；SendInput 仍需有人看屏幕时用专门参数或人工联调验证。
- 该脚本只验证 JPEG/data-url 路径；后续如果 Mac client 接 H.264 或音频播放，需要扩展自检。
下一步建议：
- Windows host 改动后同时跑 `test-windows-host.ps1` 和 `test-mac-client-browser.mjs`，覆盖被控端服务和 Mac 反控页面链路。
是否改了协议：否。
是否需要另一端配合：不需要；Mac 端可拉取后直接复用脚本结果。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：创建 Mac 控制 Windows 的最小控制端原型。
完成内容：
- 新增 `apps/mac-client` Web 原型，提供中文连接页和远端画面区域。
- 支持 `/discovery`、WebSocket `hello`、`auth_request`、`session_offer`。
- 支持显示 Windows host 的 JPEG/data-url `video_frame`，显示视频帧状态和 mock 音频状态。
- 支持点击远端画面后发送鼠标移动、按下/抬起、滚轮和键盘 `input_event`。
- 键盘映射默认把 Mac `Command` 当作 Windows `Ctrl` 发送，方便 Mac 上用 `Command+C/V` 控制 Windows 常用快捷键。
- 新增 `apps/mac-client/server.mjs` 静态服务和 README。
修改文件：
- `apps/mac-client/*`
- `README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
验证方式：
- `node --check apps/mac-client/server.mjs`
- `node --check apps/mac-client/app.js`
- `git diff --check`
- 本机启动 `apps/windows-host`：`LAN_DUAL_PORT=43772 LAN_DUAL_HOST=127.0.0.1 LAN_DUAL_WINDOWS_INPUT_MODE=log node server.mjs`
- 本机启动 `apps/mac-client`：`node server.mjs`
- 用浏览器打开 `http://127.0.0.1:5188/`，连接 `127.0.0.1:43772`。
验证结果：
- Mac client 页面发现 Windows host、认证、会话协商均通过。
- 页面显示 mock `video_frame`，状态为 `mock-svg`，视频帧递增。
- 点击远端画面并发送键盘 `a` 后，页面收到 `input_ack`：`已确认 · log`。
- Windows host 日志记录了鼠标 move/down/up 和 key 输入事件；临时 `43772` 端口已释放。
遗留问题：
- 这是 Web 原型，不是 SwiftUI/原生桌面窗口。
- 音频帧当前只显示状态，尚未播放 Windows host 音频。
- 仍需连接真实 Windows 机器验证真实 JPEG 画面、SendInput 和防火墙放行体验。
下一步建议：
- Windows 端认证重试限制完成后，Mac 端可拉取最新，再用 `apps/mac-client` 连接真实 Windows host 做端到端验证。
- 后续给 `apps/mac-client` 加剪贴板文本/文件入口、音频播放和更完整的错误提示。
是否改了协议：否。
是否需要另一端配合：后续真实 Windows host 验收需要 Windows 端配合启动服务。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：对齐本机假 Mac WebSocket 服务的认证失败限制。
完成内容：
- `apps/mock-mac-host/server.mjs` 现在会在同一 WebSocket 连接内统计密码失败次数。
- 失败时 `auth_result` 返回 `attemptsRemaining` 和 `maxAttempts`。
- 第 3 次失败返回 `LAN002` 和“次数过多”原因后关闭连接。
- 成功认证会重置失败计数。
修改文件：
- `apps/mock-mac-host/server.mjs`
- `docs/CURRENT_STATUS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check apps/mock-mac-host/server.mjs`
- `git diff --check`
- 临时 WebSocket 错误密码验证：连续 3 次错误密码分别返回剩余 `2/1/0`，第三次后连接关闭。
遗留问题：
- 假 Mac 仍是快速回归和失败场景模拟工具，真实功能验收继续以真 Mac host 为准。
下一步建议：
- 后续连接安全相关改动，继续同时验证真实 Mac、Windows host 和假 Mac 三条链路。
是否改了协议：否；使用现有 `attemptsRemaining/maxAttempts` 字段。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：补强 Windows 控制端认证失败提示和自动重连行为。
完成内容：
- Windows 控制端现在会读取 `auth_result.attemptsRemaining/maxAttempts`，密码错误时显示剩余尝试次数。
- 密码错误次数耗尽时显示被控端已关闭连接，提示用户检查密码后重新连接。
- 自动重连过程中如果遇到 `LAN002` 认证失败，会停止重连，避免继续消耗被控端认证次数。
- 本地模拟传输也会返回认证剩余次数，便于快速回归失败提示。
修改文件：
- `apps/windows-client/app.js`
- `apps/windows-client/protocol-client.js`
- `apps/windows-client/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check apps/windows-client/protocol-client.js`
- `git diff --check`
- Edge 页面级本地模拟验证：选择“本地模拟 / 密码错误”后，远程状态显示 `连接密码错误，还可尝试 2 次。`，事件日志同步记录该提示。
遗留问题：
- 真机 UI 上的手动错误密码提示仍建议后续在 Windows 桌面窗口里人工看一眼。
下一步建议：
- 继续优化真实 Mac 连接中的重连和错误状态展示，尤其是权限、H.264 回退和输入拒绝场景。
是否改了协议：否；消费已有字段。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：对齐 Windows 被控端认证失败重试限制。
完成内容：
- Windows 被控端同一 WebSocket 连接内最多允许 3 次密码认证失败。
- `auth_result` 现在会返回 `attemptsRemaining` 和 `maxAttempts`；第三次失败返回 `LAN002` 后关闭连接。
- 认证成功会重置失败计数。
- 更新 Windows host README、当前状态和任务板。
修改文件：
- `apps/windows-host/src/windows-host-service.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `npm.cmd run check` in `apps/windows-host`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-host.ps1`
- 临时 WebSocket 错误密码验证：连续 3 次错误密码分别返回剩余 `2/1/0`，第三次后连接关闭。
遗留问题：
- 假 Mac 服务仍未加认证重试限制；如果要完全一致，后续可以补 mock 服务的失败次数模拟。
下一步建议：
- 后续 Windows host 安全相关改动后，继续同时验证正常认证路径和错误认证关闭路径。
是否改了协议：否；使用 Mac 端已经采用的 `attemptsRemaining` / `maxAttempts` 字段。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：补充 Windows 被控端本机一键自检入口，方便后续 Mac 反控 Windows 前做快速回归。
完成内容：
- 新增 `scripts/windows/test-windows-host.ps1`，默认在 `127.0.0.1:43772` 临时启动 Windows 被控端，跑完后自动关闭。
- 自检复用 canonical `scripts/windows/probe-mac-host.mjs`，验证 `/discovery`、WebSocket 认证、会话协商、真实 JPEG 首帧和文件剪贴板接收。
- 默认强制 `LAN_DUAL_WINDOWS_INPUT_MODE=log` 且不发送输入事件，避免无人值守时误动鼠标键盘；需要测 SendInput 时显式加 `-InputEvents -InputMode system`。
- 更新 Windows host README、根 README、当前状态、下一步和任务板。
修改文件：
- `scripts/windows/test-windows-host.ps1`
- `apps/windows-host/README.md`
- `README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-host.ps1`
- 验证结果：临时 Windows host 启动成功，认证通过，首帧 `codec=jpeg`、`capturePipeline=windows-gdi-jpeg`、`source=screen`，文件剪贴板 `saveMode=clipboard`，临时端口关闭成功。
遗留问题：
- 默认不覆盖真实输入注入；SendInput 仍需有人看着屏幕时用 `-InputEvents -InputMode system` 单独验证。
下一步建议：
- 后续每次改 Windows host 屏幕、剪贴板或输入模块后，先跑该脚本做本机回归。
- Mac 控制窗口到位后，用该脚本先确认 Windows host 健康，再进行双端联调。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：补充 Mac 键盘输入映射覆盖自检，降低后续输入注入回归风险。
完成内容：
- 新增 `scripts/mac/check-input-keymap.mjs`，解析 `InputEventInjector.swift` 中 `keyCodeByCode` 和 `keyCodeByKey` 两张映射表。
- 自检覆盖 Windows 控制端会发送的常用 `KeyboardEvent.code` 和 `event.key`：字母、数字、符号、导航键、修饰键、F1-F20、小键盘。
- 支持 `--json` 输出，便于后续接入一键回归或 CI。
- 更新 Mac host README，说明该脚本只做源码静态检查，不会注入真实键盘事件。
修改文件：
- `scripts/mac/check-input-keymap.mjs`
- `apps/mac-host/README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
验证方式：
- `node --check scripts/mac/check-input-keymap.mjs`
- `node scripts/mac/check-input-keymap.mjs`
- `node scripts/mac/check-input-keymap.mjs --json`
验证结果：
- `keyCodeByCode=115`、`keyCodeByKey=113`。
- `KeyboardEvent.code` 覆盖：字母 26/26、数字 10/10、符号 11/11、导航 15/15、修饰键 9/9、功能键 20/20、小键盘 18/18。
- `event.key` 覆盖：文本 60/60、导航 22/22、修饰键 8/8、功能键 20/20、小键盘 2/2。
遗留问题：
- 这是静态覆盖检查，不代表真实 `inject` 模式已经在用户桌面安全验证；真实注入仍需用户确认环境后切换 `LAN_DUAL_INPUT_MODE=inject` 做小范围验证。
下一步建议：
- 后续新增键盘映射或改 Windows 控制端键盘事件时，把 `node scripts/mac/check-input-keymap.mjs` 纳入回归。
- 真机输入验证继续先用 `log` 模式跑 `--inputEvents`，再切 `inject` 做单键/鼠标移动安全验收。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：补充 Mac 系统声音持续帧观察脚本。
完成内容：
- 新增 `scripts/mac/observe-mac-audio.mjs`，用最小 `hello/auth/session_offer` 握手连接真实 Mac host，持续统计 `audio_frame`。
- 脚本会校验 `pcm-f32le`、`pcm-f32le-base64`、48kHz、2ch、有效 `frames` 和 payload，并统计帧数、接收间隔、payload 大小、电平范围、frameId 范围。
- 更新 Mac host README，记录音频持续观察命令。
修改文件：
- `scripts/mac/observe-mac-audio.mjs`
- `apps/mac-host/README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
验证方式：
- `node --check scripts/mac/observe-mac-audio.mjs`
- `node scripts/mac/observe-mac-audio.mjs --help`
- `node scripts/mac/observe-mac-audio.mjs --durationMs 5000 --minFrames 40 --maxGapMs 1000`
- `node scripts/mac/observe-mac-audio.mjs --durationMs 10000 --minFrames 80 --maxGapMs 1000`
验证结果：
- 真实 Mac host `127.0.0.1:43770` / `system-pcm` 10 秒观察通过。
- 收到 501 帧，约 50.0 fps，接收间隔平均/最大 `20.0/22 ms`。
- payload 固定 `7680` bytes，总 payload `3847680` bytes，frameId `1->501`。
- 当前环境无系统声音，电平 `0.000/0.000/0.000`，这不影响帧节奏和格式验证。
遗留问题：
- 还需要在真实有声音播放、静音切换和长时间运行下继续观察电平变化、延迟和 CPU。
下一步建议：
- Mac 端可播放系统声音后运行 `node scripts/mac/observe-mac-audio.mjs --durationMs 30000 --minFrames 250 --maxGapMs 1000`，确认 level 随音频变化。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：补充 Mac host H.264 + PCM 音频连续连接稳定性检查入口。
完成内容：
- 新增 `scripts/mac/stress-mac-host.mjs`，循环复用 canonical `scripts/windows/probe-mac-host.mjs` 做连续 WebSocket 建连、H.264 首帧和 PCM 音频帧校验。
- 默认要求 `--requireH264`、`--requireAudio` 和 `--expectInputMode log`，适合真实 Mac 被控端安全联调。
- macOS 上会用 `lsof` / `ps` 采样监听进程 PID、RSS、CPU 和 FD 数，便于观察连续建连后的资源释放。
- 更新 Mac host README，记录本机稳定性检查命令。
修改文件：
- `scripts/mac/stress-mac-host.mjs`
- `apps/mac-host/README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
验证方式：
- `node --check scripts/mac/stress-mac-host.mjs`
- `node scripts/mac/stress-mac-host.mjs --help`
- `node scripts/mac/stress-mac-host.mjs --iterations 3 --expectInputMode log --timeoutMs 12000`
- `node scripts/mac/stress-mac-host.mjs --iterations 10 --expectInputMode log --timeoutMs 12000`
验证结果：
- 真实 Mac host `127.0.0.1:43770` 连续 10 次 H.264 + PCM 音频探针全部通过。
- H.264 首帧确认 `annexb-base64`、`screencapturekit-h264`、`avc1.420029`，NAL 包含 SPS/PPS/IDR。
- PCM 音频确认 `pcm-f32le-base64`、48kHz、2ch、960 frames、planar、payload 约 7680 bytes。
- 监听进程 PID `82436` 在 10 次循环中 FD `30->30`，RSS `63488->63312 KB`。
遗留问题：
- 当前只是短循环连接稳定性检查；后续仍需要更长时间播放、延迟、CPU 占用和真实控制端体验测试。
下一步建议：
- Mac 端后续可用 `node scripts/mac/stress-mac-host.mjs --iterations 50 --expectInputMode log` 做更长回归。
- 如果 Windows 端需要真实 Mac 长稳配合，可在联络板发 `call`，Mac 端保持 `43770/log` 运行并执行该脚本记录结果。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：让 Windows 控制端页面级自检可在 Mac 开发机上运行。
完成内容：
- `scripts/windows/test-windows-client-browser.mjs` 支持 `BROWSER_PATH` / `MSEDGE_PATH` / `CHROME_PATH`，并会自动查找 macOS Edge、Chrome 或 Chromium。
- 修复脚本在带空格的 macOS 仓库路径下启动本地静态服务失败的问题，改用 `fileURLToPath` 解析 `import.meta.url`。
- 更新 Windows 控制端 README，说明 macOS 开发机可用 Chrome/Edge 跑页面级自检。
修改文件：
- `scripts/windows/test-windows-client-browser.mjs`
- `apps/windows-client/README.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-client-browser.mjs --host 127.0.0.1 --port 43770 --injectPcmAudio --timeoutMs 45000`
验证结果：
- macOS Chrome headless 可启动并连接真实 Mac host。
- 当前 Chrome 环境不支持 `avc1.420029` H.264 配置时，控制端正确请求 JPEG 兜底并显示真实画面。
- PCM 音频播放入口通过注入验证，页面显示播放计数递增。
遗留问题：
- macOS Chrome 运行时会输出 Google updater 噪声日志，不影响自检结果。
下一步建议：
- 后续可把该页面级自检纳入 Mac 侧回归流程，用于验证真实 Mac host 与 Windows 控制端 UI 的端到端状态。
是否改了协议：否。
是否需要另一端配合：不需要。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：让 Windows 控制端把远端文件写入 Windows 系统文件剪贴板。
完成内容：
- Windows 桌面壳新增 `write_files_to_clipboard` 原生命令：接收远端文件内容，保存到本机临时目录，再用 Windows 系统文件剪贴板写入这些文件路径。
- Windows 控制端远端文件托盘新增“写入系统文件剪贴板”按钮；桌面版接收远端文件完成后会自动尝试写入系统文件剪贴板。
- 浏览器预览版保持原有内存暂存和手动下载能力，不会误报系统剪贴板成功。
- 为避免桌面 IPC 一次传输过大，当前自动写系统文件剪贴板上限为 128MB；超过后仍保留在远端文件托盘下载。
- `clipboard_file_result.saveMode` 在桌面版成功时返回 `clipboard`，失败或浏览器预览时继续返回 `memory-only` / `temp` 和原因。
修改文件：
- `apps/windows-client/app.js`
- `apps/windows-client/index.html`
- `apps/windows-client/README.md`
- `apps/windows-desktop/src-tauri/src/main.rs`
- `apps/windows-desktop/src-tauri/Cargo.toml`
- `apps/windows-desktop/src-tauri/Cargo.lock`
- `apps/windows-desktop/src-tauri/tauri.conf.json`
- `apps/windows-desktop/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `cargo check` in `apps/windows-desktop/src-tauri`
- `npm.cmd run build` in `apps/windows-desktop`
- `git diff --check`
遗留问题：
- 还没有做大文件原生分块写入；超过 128MB 的远端文件先保留托盘下载。
- 未做真实 Mac 文件复制到 Windows 桌面壳的人工端到端点击验证；需要有人在 Windows 桌面 exe 中连接 Mac 后复制文件测试。
下一步建议：
- 真机测试时让 Mac 复制一个小文件或压缩包，确认 Windows 桌面版收到后资源管理器里可以直接粘贴。
- 后续把文件剪贴板写入从 base64 IPC 升级为原生分块/临时流，支持更大文件。
是否改了协议：否；仍使用现有 `clipboard_file_*` 消息和 `saveMode` 字段。
是否需要另一端配合：暂无阻塞；端到端验收时需要 Mac 端复制文件触发 `clipboard_file_*`。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：为 Windows 被控端接入真实屏幕采集第一版，支撑后续 Mac 反控 Windows。
完成内容：
- Windows 被控端新增系统截图 JPEG 视频帧路径，默认 Windows 环境使用 `system-jpeg`，非 Windows 或强制 mock 时保留模拟帧。
- `/discovery`、`session_answer`、`display_settings_ack` 和 `video_frame` 会暴露 `videoCodec=jpeg`、`capturePipeline=windows-gdi-jpeg`、`hostMode=windows-host-system-jpeg`、`source=screen` 等诊断字段。
- 视频发送循环改为异步防重入，截图尚未完成时不会堆积下一帧任务。
- 截图失败时自动回退 `mock-svg`，并在 `streamFallbackReason` / `lastCaptureError` 中保留失败原因。
- README、当前状态、下一步和任务板已同步，说明这是 PowerShell/System.Drawing 过渡层，后续仍需升级 Windows Graphics Capture。
修改文件：
- `apps/windows-host/src/windows-screen-capture.mjs`
- `apps/windows-host/src/windows-host-service.mjs`
- `apps/windows-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check apps/windows-host/src/windows-screen-capture.mjs`
- `node --check apps/windows-host/src/windows-host-service.mjs`
- `npm.cmd run check` in `apps/windows-host`
- `git diff --check`
- 本机模块最小采集：`frameCodec=jpeg`、`pipeline=windows-gdi-jpeg`、`source=screen`、`640x360`。
- 临时启动 Windows 被控端 `127.0.0.1:43772`，复用探针 `--requireRealVideo` 通过：首帧 `codec=jpeg`、`capturePipeline=windows-gdi-jpeg`、`source=screen`。
遗留问题：
- 当前每帧会调用 PowerShell/System.Drawing，适合先验证真实画面，不适合高帧率长期使用；默认上限较低。
- 后续仍需 Windows Graphics Capture、视频编码管线和 WASAPI loopback。
下一步建议：
- Mac 端控制窗口到位后，可先连接 Windows host 验证 JPEG 真实画面，再推进输入和声音。
- Windows 端下一轮可继续做 WASAPI loopback 或把截图过渡层升级为 WGC 常驻采集。
是否改了协议：否；使用既有 `session_answer` / `display_settings_ack` / `video_frame` 字段。
是否需要另一端配合：暂无阻塞；后续 Mac 控制窗口验证时需要 Mac 端发起连接。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：接入 Windows 控制端真实 Mac PCM 音频播放入口。
完成内容：
- Windows 控制端请求 `preferredAudioCodec=pcm-f32le`，并在 `audio_settings_update` 中声明 `codec=pcm-f32le`。
- 新增 Web Audio 播放入口，支持 `pcm-f32le-base64` 过渡帧，兼容 `layout=planar` 和 `layout=interleaved`。
- 音量滑块会实时调整播放增益；关闭声音会释放 AudioContext。
- Edge 页面级自检新增 `--injectPcmAudio`，可注入 planar PCM 帧验证播放路径。
- Windows 真机探针新增 `-RequireAudio` / `--requireAudio`，可确认 Mac 返回真实 `pcm-f32le-base64` 音频帧。
- 已用真实 Mac 连接验证收到 `pcm-f32le` 音频帧后播放计数递增。
修改文件：
- `apps/windows-client/app.js`
- `apps/windows-client/README.md`
- `scripts/windows/test-windows-client-browser.mjs`
- `scripts/windows/probe-mac-host.mjs`
- `scripts/windows/test-mac-host.ps1`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check scripts/windows/test-windows-client-browser.mjs`
- `node scripts/windows/test-windows-client-browser.mjs --host 192.168.31.122 --port 43770 --password demo-password --timeoutMs 45000 --injectPcmAudio`
- `scripts/windows/test-mac-host.ps1 -HostName 192.168.31.122 -RequireH264 -RequireAudio -ExpectInputMode log -TimeoutMs 15000`
遗留问题：
- 当前仍是 PCM + base64 过渡格式，带宽较高；后续应接 Opus 或二进制音频帧。
- 需要继续做长时间播放、静音、音量变化和延迟体验验证。
下一步建议：
- Mac 端继续验证系统声音采集稳定性；Windows 端可继续优化延迟和音频缓冲策略。
是否改了协议：否；本轮只消费 Mac 已推送的 PCM 音频协议字段。
是否需要另一端配合：暂无阻塞；后续长时间音频稳定性测试需要 Mac 端保持服务运行并播放系统声音。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：接入 Mac 真实系统声音采集第一版。
完成内容：
- 新增 ScreenCaptureKit 系统音频采集流，优先输出真实 `audio_frame`。
- 真实音频帧使用过渡格式：`codec=pcm-f32le`、`encoding=pcm-f32le-base64`、`audioMode=system-pcm`、48kHz、双声道、20ms。
- 系统音频启动失败时会发送 `audio_status`，并自动回退到原有模拟音频帧，避免控制端声音状态断掉。
- `/discovery`、`hello_ack`、`session_answer`、`display_settings_ack` 和 `audio_settings_ack` 会暴露实际音频 codec/mode。
- 更新协议文档、共享示例、Mac README、当前状态、下一步和任务板。
修改文件：
- `apps/mac-host/Sources/MacHost/MacHostService.swift`
- `apps/mac-host/Sources/MacHost/ScreenCaptureCoordinator.swift`
- `apps/mac-host/README.md`
- `shared/protocol/README.md`
- `shared/protocol/messages.example.json`
- `docs/03-architecture-and-protocol.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/HANDOFF_LOG.md`
- `docs/ACTIVE_LOCKS.md`
验证方式：
- `swift build` in `apps/mac-host`
- `node scripts/windows/probe-mac-host.mjs --host 127.0.0.1 --port 43770 --requireH264 --expectInputMode log`
- Mac 本机播放 `/System/Library/Sounds/Glass.aiff`，临时 WebSocket 探针请求 `wantAudio=true`，收到 `pcm-f32le-base64` / `system-pcm` / `sampleRate=48000` / `channels=2` / `frames=960` / `payloadBytes=7680`。
遗留问题：
- Windows 控制端当前仍只显示音频帧状态，尚未播放真实 PCM。
- 过渡期 PCM + base64 带宽较高，后续应接 Opus 或二进制音频帧。
下一步建议：
- Windows 端接入 `pcm-f32le-base64` 播放，注意 `layout=planar` 时需要重排为播放器需要的 interleaved 格式。
- Mac 端继续验证静音、无系统声音、长时间运行和音量变化。
是否改了协议：是，新增真实 PCM 音频帧过渡字段；向后兼容保留 mock 音频帧。
是否需要另一端配合：需要 Windows 端接真实 PCM 播放。

## 2026-06-12 Mac Codex

日期：2026-06-12
开发端：Mac Codex
本轮目标：收尾 H.264 第一版真机验证状态，并清理 Swift 6 并发警告。
完成内容：
- 拉取并验证 `d63c4e3 Add H264 streaming video path` 后，Mac host 可在真 Mac 上启动 H.264 流式输出。
- 本机探针 `--requireH264 --expectInputMode log` 已确认 `videoCodec=h264`、`videoEncoding=annexb-base64`、`capturePipeline=screencapturekit-h264`。
- 为 Mac host 的主队列串行状态对象补充受控 `@unchecked Sendable` 标记，消除 Swift 6 Sendable 捕获警告。
- 同步当前状态、下一步、任务板、流式视频计划和测试协调文件，避免继续显示“H.264 待真机验证”的旧状态。
修改文件：
- `apps/mac-host/Sources/MacHost/MacHostService.swift`
- `apps/mac-host/Sources/MacHost/ScreenCaptureCoordinator.swift`
- `apps/mac-host/README.md`
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/04-task-board.md`
- `docs/09-streaming-video-plan.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/TEST_COORDINATION.md`
- `docs/HANDOFF_LOG.md`
验证方式：
- `swift build` in `apps/mac-host`
- `node scripts/windows/probe-mac-host.mjs --host 127.0.0.1 --port 43770 --requireH264 --expectInputMode log`
遗留问题：
- H.264 仍处于 JSON + base64 过渡传输，后续可迁移 WebSocket 二进制帧。
- 还需要 Windows 控制端做真实 WebCodecs 解码、延迟、连续重连、CPU 占用和回退体验验收。
下一步建议：
- Windows 端连接真实 Mac host，验证 H.264 画面是否稳定显示，并记录解码失败或回退原因。
- Mac 端下一轮优先做 H.264 连续重连/释放压测，或继续推进真实 macOS 系统声音采集。
是否改了协议：否。
是否需要另一端配合：需要 Windows 端继续做控制端真实 H.264 解码体验验收。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：修正 JPEG 链路帧率误导，并启动流式视频编码路线。
完成内容：
- Mac JPEG 调试链路默认 `LAN_DUAL_MAX_SCREEN_FPS` 从 12 提到 30，允许最高 60。
- Mac 会话协商返回真实协商 FPS、请求 FPS 和主机上限，避免 Windows 误显示请求值。
- Windows 控制端新增实收 FPS 统计，刷新率卡片显示实收 FPS、协商 Hz、请求 Hz。
- Windows 控制端收到真实视频帧后隐藏等待连接的模拟窗口覆盖层，并在鼠标按下时聚焦远控画布。
- 新增 `docs/09-streaming-video-plan.md`，确定 ScreenCaptureKit + VideoToolbox H.264 的下一阶段路线。
修改文件：
- `apps/mac-host/Sources/MacHost/HostConfiguration.swift`
- `apps/mac-host/Sources/MacHost/MacHostService.swift`
- `apps/windows-client/app.js`
- `apps/windows-client/styles.css`
- `docs/09-streaming-video-plan.md`
- `docs/03-architecture-and-protocol.md`
- `shared/protocol/*`
验证方式：
- `node --check apps/windows-client/app.js`
- `node --check apps/windows-client/protocol-client.js`
- `node scripts/windows/test-coordinate-mapping.mjs`
- `npm.cmd run check` in `apps/windows-host`
- `scripts/windows/dev-lab.ps1`
- `npm.cmd run build` in `apps/windows-desktop`
遗留问题：
- 当前仍是 JPEG 调试链路，不会达到稳定 60FPS；正式低延迟体验需按 H.264 计划继续实现。
下一步建议：
- Mac 端拉取最新代码后，重启 `apps/mac-host`，验证协商 FPS 和实收 FPS。
- 下一轮优先在 Mac 端实现 `SCStream` + `VTCompressionSession` 的 H.264 输出。
是否改了协议：是，新增/明确 `requestedFps`、`maxScreenFps`、H.264 `video_frame` 过渡字段。
是否需要另一端配合：需要 Mac 端拉取并重启服务验证。

## 2026-06-12 Windows Codex

日期：2026-06-12
开发端：Windows Codex
本轮目标：为同一局域网内的 Mac Codex 和 Windows Codex 增加实时联络工具。
完成内容：
- 新增 `scripts/codex-link-server.mjs`，提供局域网 Web 联络板、实时事件推送、状态、消息和测试呼叫接口。
- 新增 `scripts/codex-link-client.mjs`，让 Codex 可通过命令行查看状态、监控消息、发送消息、更新状态和发起测试呼叫。
- 新增 `scripts/windows/start-codex-link.ps1`，Windows 一键后台启动联络板。
- 新增 `docs/LAN_CODEX_LINK.md`，记录 Windows/Mac 启动方式和命令行收发方式。
- 更新 `docs/TEST_COORDINATION.md`，把局域网联络板作为优先联调通知方式之一。
修改文件：
- `scripts/codex-link-server.mjs`
- `scripts/codex-link-client.mjs`
- `scripts/windows/start-codex-link.ps1`
- `docs/LAN_CODEX_LINK.md`
- `docs/TEST_COORDINATION.md`
- `docs/04-task-board.md`
- `README.md`
验证方式：
- `node --check scripts/codex-link-server.mjs`
- `node --check scripts/codex-link-client.mjs`
- 已在 Windows 本机启动服务，地址为 `http://192.168.31.68:17888`。
- 已用命令行客户端发送状态和消息，并用 `watch --once` 收到回显。
遗留问题：
- 默认未启用令牌，只适合可信局域网；需要更安全时启动时传入 `--token` 或 `-Token`。
下一步建议：
- Mac 端拉取代码后打开 `http://192.168.31.68:17888`，或用 `scripts/codex-link-client.mjs --server http://192.168.31.68:17888 watch` 监控消息。
是否改了协议：否。
是否需要另一端配合：需要 Mac 端试连联络板。

## 2026-06-12 Windows Codex - 交接中心

日期：2026-06-12
开发端：Windows Codex
本轮目标：建立双 Codex 交接中心，减少 Mac 端和 Windows 端开发漂移。
完成内容：
- 新增 `docs/CURRENT_STATUS.md`，集中记录当前事实和开工检查。
- 新增 `docs/NEXT_ACTIONS.md`，集中记录短期优先任务和双端可接事项。
- 新增 `docs/ACTIVE_LOCKS.md`，登记当前文件占用和高冲突区域。
- 新增 `docs/HANDOFF_LOG.md`，作为双端阶段性交接记录。
- 新增 `docs/TEST_COORDINATION.md`，定义测试呼叫、阻塞和超时规则。
修改文件：
- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/ACTIVE_LOCKS.md`
- `docs/HANDOFF_LOG.md`
- `docs/TEST_COORDINATION.md`
- `docs/05-codex-handoff.md`
- `docs/04-task-board.md`
- `README.md`
验证方式：
- 文档已写入仓库，未改动现有业务代码。
遗留问题：
- 当前本地已有多处未提交改动，部分是在本轮文档改造前已存在，部分是在文档改造期间被检测到；已先登记到 `docs/ACTIVE_LOCKS.md`，接手前需要确认这些改动的归属和意图。
下一步建议：
- Mac 端 Codex 开工时先读 `docs/CURRENT_STATUS.md`、`docs/NEXT_ACTIONS.md` 和 `docs/ACTIVE_LOCKS.md`。
- Windows 端下一次继续开发前，也先更新锁定文件状态。
是否改了协议：否。
是否需要另一端配合：需要 Mac 端遵守同一套交接文件。
