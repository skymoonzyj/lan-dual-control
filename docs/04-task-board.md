# 任务清单与里程碑

## 里程碑 M0：仓库和文档

状态：进行中。

- [x] 建立策划书。
- [x] 建立双端开发计划书。
- [x] 建立协议草案。
- [x] 建立双 Codex 协作说明。
- [x] 建立双端交接中心：当前状态、下一步、文件占用和交接日志。
- [x] 建立双端测试联络规则。
- [x] 建立局域网 Codex 联络板，支持网页实时收发和命令行收发。
- [x] 上传到 GitHub 仓库。
- [x] Mac mini 到位后克隆仓库。

## 里程碑 M1：Windows 控制 Mac 原型

目标：Windows 能窗口化看到并控制 Mac。

Mac 端：

- [x] 创建 mac-host 项目骨架。
- [x] 检测屏幕录制权限骨架。
- [x] 真机验证屏幕录制权限。
- [x] 采集主屏幕图像。
- [x] 后台 JPEG 采集管线，避免截图和编码阻塞主线程。
- [x] 开启 WebSocket 局域网监听端口骨架。
- [x] 提供 `/discovery` HTTP 发现接口。
- [x] 发送模拟 `video_frame`，便于 Windows 控制端先联调真实 Mac 服务入口。
- [x] 接收鼠标事件骨架。
- [x] 接收键盘事件骨架。
- [x] 注入鼠标键盘到 macOS。

Windows 端：

- [x] 创建 windows-client 项目。
- [x] 中文连接窗口。
- [x] 输入 IP 和端口。
- [x] 显示模拟远程画面。
- [x] 捕获鼠标移动、点击、滚轮。
- [x] 捕获键盘输入。
- [x] 增加远控 macOS 默认按键映射。
- [x] 增加 Windows 常用快捷键兼容：Ctrl+C/V 等按 macOS Command 快捷键发送。
- [x] 映射窗口坐标到远程屏幕坐标。
- [x] 增加窗口缩放模式。
- [x] 按实际视频区域映射鼠标坐标。
- [x] 增加 WebSocket 协议客户端。
- [x] 增加本机假 Mac 联调服务。
- [x] 接收并渲染模拟视频帧。
- [x] 增加真实 Mac 联通自检脚本，可检查 `/discovery`、WebSocket、认证、会话和第一帧视频帧。
- [x] 增加 Mac 主机诊断状态条，可显示权限、采集管线、视频来源、丢帧和剪贴板通道。
- [x] 保存连接方式、地址、端口和画质设置。
- [x] 增加最近连接列表。
- [x] 增加连接状态机。
- [x] 增加中文错误提示。
- [x] 增加假 Mac 错误模拟。
- [x] 增加意外断线自动重连。
- [x] 增加文本剪贴板同步消息。
- [x] 增加 Windows Tauri 桌面壳。
- [x] 构建 Windows 桌面 exe。
- [x] 桌面壳增加本机被控入口，可选择低风险/部署/深度体检、预览防火墙命令、启动/停止 Windows host。
- [x] 连接真实 Mac 被控端。

共享：

- [x] 定义 hello/auth/session 消息。
- [x] 定义视频帧格式。
- [x] 定义输入事件格式。
- [x] 定义错误码。
- [x] 创建 Swift 协议消息模型。

验收：

- [x] Windows 输入 Mac IP 后能进入模拟连接。
- [x] Windows 窗口中能看到模拟 Mac 桌面。
- [x] 鼠标点击可记录为输入事件。
- [x] 键盘输入可记录为输入事件。
- [x] 断开连接不会卡死。
- [x] Windows 可通过 WebSocket 连接本机假 Mac 服务。
- [x] Windows 可接收并显示假 Mac 服务的模拟视频帧。
- [x] Windows 可记住最近连接和常用画质设置。
- [x] Windows 可显示密码错误、权限不足、视频中断等中文错误。
- [x] 黑边区域不会误发远程鼠标输入。
- [x] Windows 控制端可构建为桌面 exe。
- [x] 意外断线后 Windows 控制端会自动重连，手动断开不会重连。
- [x] Windows 控制端可发送和接收文本剪贴板消息。
- [x] macOS 被控端可写入系统文本剪贴板，并把 Mac 本机复制的新文字推送给 Windows 控制端。
- [x] macOS 被控端可接收文件剪贴板块，保存到临时目录并写入系统文件剪贴板。
- [x] macOS 被控端可通过 WebSocket 完成 hello/auth/session 握手并发送模拟视频帧。
- [x] macOS 被控端可接收 `input_event` 并通过 CGEvent 注入鼠标、滚轮和常用键盘快捷键。

当前备注：

- 已完成 Windows 控制端静态原型，当前支持本地模拟和 WebSocket 协议连接。
- 已完成连接历史和设置持久化；连接密码不会写入本地存储。
- 已完成窗口缩放模式和精准坐标映射，支持适应窗口、原始比例、拉伸填充；坐标映射已抽出为 `mapping-utils.js`，并由 `scripts/windows/test-coordinate-mapping.mjs` 覆盖适应窗口黑边、原始比例滚动和拉伸填充。
- Windows 控制端已把黑边输入防护固化到页面级自检：黑边移动、点击、滚轮不会发送远控事件，画面内按下后移到黑边松开会用最后有效坐标释放，避免远端鼠标按下状态粘住。
- 已完成连接状态机和中文错误提示，假 Mac 服务可模拟常见失败场景；认证失败会显示剩余尝试次数。
- macOS 被控端已限制同一 WebSocket 连接内最多 3 次密码认证失败，失败耗尽后返回 `LAN002` 并关闭连接。
- 已完成意外断线自动重连，当前最多重试 3 次，手动断开会停止重连，密码错误会停止自动重连。
- 已完成文本剪贴板协议打通，文件剪贴板仍按文件传输通道单独开发。
- macOS 被控端已接入系统文本剪贴板：远端文本写入 `NSPasteboard`，本机复制新文本会按 `host_to_client` 推送。
- 真 Mac 已通过 `--clipboardRoundTrip` 验证文本剪贴板双向同步：控制端文本可写入 Mac 系统剪贴板，Mac 本机复制的新文本可按 `host_to_client` 推回控制端。
- macOS 被控端已接入系统文件剪贴板接收：Windows 发送的文件块会落到临时目录，并写入 `NSPasteboard` 文件 URL。
- 已统一 `display_settings`、`display_settings_ack`、`video_frame` 协议命名，假 Mac 服务可持续发送模拟帧。
- 已完成 Windows Tauri 桌面壳，已验证可构建 `lan-dual-control-windows.exe`。
- 已完成本机假 Mac WebSocket 联调服务；当前真 Mac 已到位，后续功能完成以真实 macOS 被控端验证为准，假 Mac 只做快速回归和失败场景模拟，并已对齐 3 次认证失败断开行为。
- 已完成 macOS 被控端 Swift WebSocket 骨架，支持 `/discovery`、hello/auth/session、模拟 `video_frame`、真实系统声音 PCM `audio_frame`、输入事件日志、文本和文件剪贴板确认。
- macOS 被控端已接入真实屏幕 JPEG `video_frame` 抓取；默认 `LAN_DUAL_VIDEO_MODE=auto`，权限不足或采集失败时自动回退模拟帧。
- macOS 被控端真实屏幕帧已改为后台采集/编码队列，支持 `LAN_DUAL_MAX_SCREEN_FPS`、`LAN_DUAL_JPEG_QUALITY` 和 `video_frame.droppedFrames` 调试字段。
- macOS 被控端已补齐 FPS 诊断字段：`session_answer`、`display_settings_ack` 和 `video_frame` 会返回 `requestedFps`、实际 `fps`、`maxScreenFps`、`frameIntervalMs`、`videoCodec` 和 `capturePipeline`。
- macOS 被控端 JPEG 调试链路默认真实采集上限改为 30 FPS；Windows 控制端会显示实收 FPS、协商帧率和请求帧率，避免把请求值误认为真实帧率。
- macOS 被控端 H.264 流式启动有 5 秒 watchdog；启动阶段未建立 `videoStream` 时会回退 `background-jpeg` 并带 `streamFallbackReason`，迟到启动成功的旧流会被 generation token 停止。
- macOS 被控端已接入 CGEvent 输入注入；当前默认 `LAN_DUAL_INPUT_MODE=log` 做安全联调，只有显式设为 `inject` 时才真实注入。
- Windows 控制端当前已可区分真实 JPEG、H.264 视频帧和模拟视频帧，并记录图片或 WebCodecs 解码失败；`scripts/windows/test-mac-host.ps1` 可用于真机连通自检，显式加 `-ClipboardText -ClipboardFile` 可验证 macOS 文本和文件剪贴板写入。
- 真 Mac 已通过强校验探针验证真实 JPEG 首帧、H.264 Annex B 首帧和 PCM 音频帧：`-RequireRealVideo` 会拒绝 mock/fallback 视频帧，`-RequireH264` 会确认 SPS/PPS/IDR，`-RequireAudio` 会确认 `pcm-f32le-base64` payload，`-ExpectInputMode log` 可确认安全输入模式。
- Mac 端新增 `scripts/mac/observe-mac-video.mjs`，可持续观察 `video_frame` FPS、最大接收间隔、payload、codec、encoding、capturePipeline、source、显示器来源、帧 `timestamp` 接收年龄和 H.264 `timestampUs` / `durationUs` 媒体时间线；真机 H.264 30 秒 877 帧约 29.2fps，最大间隔 45ms；时间线短测 H.264 3 秒 89 帧约 29.2fps、媒体间隔平均/最大 `34281/41668us`、`durationUs=33333`；Mac host 最新代码会输出带小数秒的 ISO `timestamp`，临时 43771 build 已验证 discovery/runtime 为毫秒格式且 mock `video_frame` 接收年龄 max 0ms；空闲/低变化桌面 5 分钟 H.264 约 10.6fps、60 秒复测约 10.9fps，JPEG 60 秒对照约 16.4fps，后续高 FPS 强校验需要使用动态画面或真实控制场景。
- Mac 端新增 `scripts/mac/stress-mac-host.mjs`，可循环复用 canonical 探针做 H.264 + PCM 连续连接稳定性检查；真机 50 次循环已通过，监听进程 RSS `79376->80656 KB`，FD 保持 `30->30`。脚本现可统计并阈值化完整 probe、首帧、H.264 确认和首个音频帧耗时，便于把连续建连体验退化纳入回归。
- Mac 端新增 `scripts/mac/observe-mac-audio.mjs`，可持续观察系统声音 `audio_frame` 帧率、接收间隔、payload 和电平；真机 30 秒观察收到 1501 帧，约 50fps，最大间隔 24ms；5 分钟长稳收到 15001 帧，50.0fps，最大间隔 31ms；脚本支持显式 `--playTone --requireLevel` 做本机有声电平强校验，默认不播放声音。
- Mac 端新增 `scripts/mac/check-input-keymap.mjs`，可静态验证 CGEvent 键盘映射覆盖；当前常用 `KeyboardEvent.code`、`event.key`、同义 code/key 和修饰键 flag fallback 全覆盖。
- Mac 端新增 `scripts/mac/smoke-mac-input-log.mjs`，可在真实 Mac host 的 `inputMode=log` 下发送鼠标/滚轮/键盘/快捷键冒烟事件并强制要求 `input_ack`；真机 16/16 通过，全部为 `mode=log`、`injected=false`。
- Mac 端新增 `scripts/mac/check-mac-displays.mjs`，可验证 `/discovery`、`session_answer.displays`、`activeDisplayId` 和 `display_settings_ack`；也可加 `--requireRuntime --expectBuildId <id>` 强制确认 `/discovery` 与 `hello_ack` 来自目标 Mac host 进程；当前单屏真机 `main` round-trip 已通过，真实外接双屏采集切换仍待实物验收。
- Mac 端新增 `scripts/mac/start-mac-host.mjs` 日常安全启动助手：默认 `inputMode=log`，打印 Windows 端可填写的局域网地址，等待 `/discovery`，并默认运行 `check-mac-displays --requireRuntime --expectBuildId <build>`；`--status` 可只读查看当前 `/discovery`/runtime/权限/能力和 Windows 可连地址，不启动服务也不要求密码，运行中 build 落后当前 git 时会只比较 `apps/mac-host` 运行源码并提示是否有 host 行为相关改动，`--status --json` 会输出只含 JSON 的机器可读状态对象；真机局域网联调建议加 `--promptPassword --requirePassword`，避免空密码或 `demo-password`；临时恢复无密码 `/discovery`/runtime 诊断通道可用 `--ephemeralPassword --requirePassword` 生成一次性随机密码且不打印。
- Mac 端新增 `scripts/mac/check-mac-resume-status.mjs` 恢复开工轻量总览：只读汇总 git 状态、可选联络板快照、Mac host `/discovery`、权限、能力、LAN 地址和运行中 build 到当前 git 的 Mac host runtime 源码差异；不会启动服务、不会认证 WebSocket、不会要求或打印密码、不会发送输入事件。适合双方早上恢复、发最终状态、或正式密码验收前先判断是否需要重启/修权限；`--json` 可供自动化消费，`--requireOnline` / `--requireClean` / `--requireNoRuntimeChanges` 可把对应问题转成失败。
- Mac 端新增 `scripts/mac/check-mac-host-readiness.mjs` 一键体检聚合脚本：默认只读检查 Node/Swift、Mac host build、直接启动输入默认值、启动助手语法/干跑、键盘映射覆盖和 `/discovery` 状态；可加 `--probeVideo --probeAudio --probeInputLog --probeStartHelper` 串联真实 H.264、PCM、log 输入和启动助手临时端口自测。Mac host 最新源码已用 `IOHIDCheckAccess` 只读探测真实 Input Monitoring 状态，不再把 `/discovery.permissions.inputMonitoring` 硬编码为 `false`；readiness 也会默认提示运行中 host build 是否落后当前 git，并列出旧 build 后变动的 Mac host runtime 源码文件，支持 `--requireInputMonitoring` 单独强制输入监控权限。常用部署验收可用 `--profile deploy`，深度本机部署验收可用 `--profile deep`。
- Windows 控制端已增加 Mac 主机诊断状态条：会汇总 `/discovery.runtime`、`permissions`、`hostMode`、`capturePipeline`、`source`、WebCodecs 解码状态、`streamFallbackReason`、`droppedFrames`、`input_ack` 和剪贴板模式，真机旧进程、权限、输入拒绝、解码失败或 H.264 启动回退问题可直接在画面内看到。
- Windows 控制端已把顶部“延迟”改为真实“帧延迟”：收到 `video_frame.timestamp` 后显示帧到达新鲜度，诊断条同步显示 `到达 <ms>`，没有真实时间戳时保持等待，两端系统时钟明显不一致时显示“时钟偏差”；页面级 `--diagnosticsOnly` 已覆盖正常帧年龄和时钟偏差提示。Mac 控制 Windows 的 `apps/mac-client` 也会在视频状态和会话诊断视频流行显示 `video_frame.timestamp` 到达年龄或时钟偏差，并由 `test-mac-client-browser.mjs` 默认视频路径断言；Mac client 已新增 WebCodecs H.264 canvas 接收准备，会优先请求 `h264/annexb`，不支持或失败时请求 MJPEG/JPEG 兜底，待 Windows host ffmpeg-h264 推出后做真实强校验。
- Mac 端已兼容 Windows 端现有 `kind/action/remoteX/remoteY` 输入事件字段。
- Windows 控制端已新增 Edge 页面级自检脚本 `scripts/windows/test-windows-client-browser.mjs`，可自动打开控制端、连接真实 Mac、读取诊断条并确认视频 surface；当前 Edge headless 不支持 `avc1.420029` 时已验证会自动请求 JPEG 兜底并显示真实 Mac 画面。
- Windows 控制端已接入真实 `pcm-f32le-base64` 音频播放，支持 planar/interleaved Float32 PCM 和音量滑块；页面级自检已验证真实 Mac 连接下音频播放计数递增。
- Windows 控制端页面级 `--requireH264` 已在真实 Mac host 上验证 WebCodecs H.264 解码成功，`avc1.420029:annexb` 渲染到 1920×1080 canvas；控制端会识别 Annex B/AVC 关键帧并在重配置后等待关键帧，脚本已收紧为要求 `H264Errors=0`，避免首帧非关键帧误喂产生噪声错误。
- 真 Mac 后续继续做输入注入、真实音频长时间稳定性、低延迟稳定性和更完整的键盘/输入法兼容验证。
- MSI/NSIS 安装包暂未开启，先保留桌面 exe 构建；安装包放到 M5 处理。

## 里程碑 M2：安全和控制体验

目标：能作为个人日常工具试用。

- [x] 添加固定密码认证门禁。
- [x] 添加 Windows 一键自检和联调启动脚本。
- [x] 添加 Mac host 安全启动助手和 runtime/display 自检入口。
- [x] 添加 Mac host 一键体检聚合脚本。
- [x] 添加中文连接状态。
- [x] 添加权限不足提示。
- [x] 添加画质设置：流畅、均衡、高清、自定义预设，联动分辨率、刷新率和码率。
- [x] 添加分辨率设置。
- [x] 添加刷新率设置。
- [x] 添加码率设置。
- [x] 添加全屏/窗口化切换。
- [x] 添加声音接收开关。
- [x] 添加设置持久化。
- [x] 添加窗口缩放模式。
- [x] 添加文本剪贴板同步。
- [x] 添加基础日志。
- [x] 添加日志导出。
- [x] 添加连接历史。

验收：

- [x] 未授权设备不能连接。
- [x] Mac 权限不足时有明确中文提示。
- [x] Windows 缩放窗口后坐标仍正确。
- [x] 全屏和窗口化切换正常。
- [x] 分辨率、刷新率、码率设置在 Windows 原型中生效。
- [x] 控制端可以接收被控端声音骨架：支持音量设置、`audio_settings_update` 和模拟 `audio_frame` 状态回传。
- [x] 控制端播放真实被控端声音。
- [x] Windows 控制端可发送和接收文本剪贴板消息。
- [x] Windows 控制端可导出连接和事件日志。
- [x] 真机两端可以同步复制文字。

## 里程碑 M3：Mac 控制 Windows

目标：反方向控制跑通。

Windows 端：

- [x] 创建 Windows 被控服务骨架。
- [x] 采集 Windows 屏幕第一版：系统截图 JPEG 帧，失败回退模拟帧。
- [x] Windows 模拟音频帧骨架。
- [ ] 采集 Windows 系统声音。
- [x] 接收 Mac 输入事件骨架。
- [x] 接收文本剪贴板并在 Windows 上写入系统剪贴板。
- [x] 接收文件剪贴板并在 Windows 上写入系统文件剪贴板。
- [x] 使用 SendInput 注入输入。
- [x] 防火墙/局域网可达性只读检查脚本。
- [x] Windows host 启动助手级防火墙友好提示和一键引导。
- [x] Windows host 显式防火墙放行助手：默认干跑/只读，用户明确同意后才尝试新增 Private TCP 入站规则。
- [x] 桌面端防火墙友好提示和一键引导。

Mac 端：

- [x] 创建 Mac 控制窗口第一版：`apps/mac-client` Web 原型。
- [x] 输入 Windows IP 连接。
- [x] 显示 Windows 画面。
- [ ] 播放 Windows 声音。
- [x] 播放 Windows PCM 音频帧入口。
- [x] 发送鼠标键盘事件。
- [x] 保存最近连接且不保存密码。
- [x] 清空最近连接且不影响密码输入框。
- [x] 意外断线后自动重连，手动断开和认证失败不会重连。
- [x] Mac client 页面级自检支持可选音频帧、PCM payload 和播放计数验收。
- [x] Mac client 页面级自检支持首次视频可见和断线恢复耗时阈值验收。
- [x] Mac client 页面级自检支持音频首帧和真实 PCM 播放耗时阈值验收。
- [x] Mac client 页面级自检支持短窗口视频持续来帧/FPS 阈值验收。
- [x] Mac client 会话诊断显示 Windows host runtime/build，并由页面级自检确认临时 host PID/build 已显示。
- [x] Mac client 音频状态和会话诊断显示 `audio_frame.timestamp` 到达新鲜度，并由页面级自检覆盖。
- [x] Mac client 手动断开会清空远端运行 runtime，页面级自检覆盖断开后显示“未提供”。
- [x] Mac client 意外断线等待自动重连时会清空远端运行 runtime，恢复连接后重新显示当前 host runtime。
- [x] 发送文本剪贴板到 Windows host。
- [x] 发送文件剪贴板到 Windows host 的入口。
- [x] Mac `Command` 到 Windows `Ctrl` 快捷键映射提示和页面级自检。

验收：

- [ ] Mac 可以窗口化控制 Windows。
- [ ] Windows 和 Mac 都能担任控制端或被控端。
- [x] 声音在反方向可用。
- [x] 文本剪贴板在反方向可用。

当前备注：

- 已创建 `apps/windows-host` Node.js WebSocket 被控服务骨架。
- 当前可完成 hello/auth/session 握手，未认证连接会被拒绝，同一连接内密码错误 3 次后会关闭；认证后可发送 Windows 系统截图 JPEG `video_frame`、模拟 `audio_frame`、接收 `input_event`、处理 `clipboard_text`。
- Windows 被控端在 Windows 上会用 PowerShell `Set-Clipboard` 写入系统文本剪贴板，非 Windows 开发环境回退为 `memory-only`，并在 `/discovery`、`hello_ack`、`session_answer` 暴露剪贴板模式。
- Windows 被控端 `/discovery` 和 `hello_ack` 会带可选 `runtime` 诊断：`processId`、`startedAt`、`uptimeSeconds` 和 `buildId`；启动助手和桌面壳启动路径会默认把当前 git short hash 写入 `LAN_DUAL_BUILD_ID`，方便 Mac 反控 Windows 前确认没有连到旧进程。
- Windows 被控端可接收 `clipboard_file_*` 文件块并落到临时目录；在 Windows 上会用 PowerShell `Set-Clipboard -Path` 写入系统文件剪贴板，非 Windows 开发环境回退为 `saveMode: temp`。
- Windows 被控端已接入常驻 C# SendInput helper：Windows 上通过 helper 调用 `SendInput`/`SetCursorPos` 注入鼠标、滚轮和常用键盘事件，避免每个事件重复启动 PowerShell；非 Windows 开发环境回退为日志模式。`scripts/windows/measure-windows-input-helper.mjs` 可用不支持事件安全干跑，量化 helper 冷启动和热路径延迟。
- macOS 被控端、Windows 被控端和假 Mac 服务处理输入事件后都会返回 `input_ack`，控制端和探针可确认输入已注入、仅记录或被拒绝。
- Windows 被控端已新增本机一键自检脚本 `scripts/windows/test-windows-host.ps1`，可临时启动服务并验证真实 JPEG 首帧、文本剪贴板和文件剪贴板接收；默认不发送输入事件。
- Windows 被控端 readiness 已支持 `--profile default|deploy|deep`：默认低风险、不要求 host 正在监听；默认也会跑 Windows Graphics Capture 支持预检，但在采集管线正式切换前只作为信息项，`--requireWgc` 可显式强制。`deploy` 用于 host 已启动后的部署验收，要求端口可达、运行中 build 与当前 git 一致，并跑视频/音频短观察；`deep` 额外串联 Windows host PowerShell 本机自检。也可单独用 `--expectBuildId`、`--requireCurrentBuildId` 和 `--skipCurrentBuildCheck` 控制 runtime build 校验强度；发现旧 build 时会尽量列出之后变动过的 Windows host 运行源码文件，方便判断是否必须重启。
- Windows 被控端已新增 `scripts/windows/check-windows-firewall.mjs` 只读检查脚本，可列出本机局域网 IP、端口监听、TCP 探测、网络配置和 TCP 入站放行规则；默认不改系统防火墙，只在缺少放行时给出管理员 PowerShell 建议命令。
- Windows 被控端已新增启动助手 `scripts/windows/start-windows-host.mjs` 和 `scripts/windows/start-windows-host.ps1`：启动服务后列出 Mac 端可填的局域网地址，等待 `/discovery` 就绪并自动跑只读防火墙/端口检查；Node 入口可用 `--status` 只读查看当前 Windows host `/discovery`、runtime/build、视频/音频/输入/剪贴板能力和旧 build 源码差异，离线时只给安全启动建议，不启动、不认证、不要求密码；`--status --json` 输出纯机器可读 JSON，PowerShell 包装也可用 `-Status` / `-Status -Json`，Windows readiness 和桌面壳面板均消费该 JSON 作为统一状态来源；需要系统声音时显式加 `--wasapi` 或 `-Wasapi`；真机联调建议加 `--promptPassword --requirePassword` 或 `-PromptPassword -RequirePassword`，避免退回 demo 密码；可加 `--dryRunFirewallRule` / `-DryRunFirewallRule` 预览放行命令，只有显式 `--addFirewallRule` / `-AddFirewallRule` 才会尝试新增 Private TCP 入站规则。`scripts/windows/test-windows-host-start-helper.mjs` 已覆盖启动助手密码安全、`--status`/`--status --json` 在线/离线、防火墙干跑和临时端口实启回归。
- Windows 桌面壳已新增“本机被控”面板：通过 Tauri 原生命令选择低风险/部署/深度 readiness、预览防火墙放行命令、要求隐藏密码后启动/停止 Windows host，并在 UI 内显示日志和 `/discovery` 状态；面板会消费 `start-windows-host --status --json` 显示真实 runtime/build、视频/音频/输入/剪贴板能力，端口已有非托管 host 时显示“已在线”但不误启用停止按钮；默认输入模式是安全日志。
- Windows 被控端已新增视频持续帧观察脚本 `scripts/windows/observe-windows-host-video.mjs`，可统计实际 FPS、最大帧间隔、掉帧数、采集管线、请求码率、`jpegQuality`、`video_frame.timestamp` 接收年龄和本机 host 资源摘要，并可用 `--maxFrameAgeMs` / `--requireMonotonicTimestamp` 强校验帧新鲜度；当前本机 FFmpeg gdigrab 普通启动已可协商 60Hz，720p/60Hz 旧基线约 57.1 FPS，带 `--resourceSampleTree true` 的资源对照为 49.49 FPS、进程树 CPU 平均/峰值 4.5/5.4%、工作集峰值约 309.3 MiB；System.Drawing 兜底仍约 3 FPS。
- Windows 被控端已新增显式 WASAPI loopback 系统声音入口；设置 `LAN_DUAL_WINDOWS_AUDIO_MODE=wasapi` 后可采集默认播放设备系统声音并发送 `pcm-f32le-base64`，默认未显式开启时继续发送模拟音频帧，避免误采。DirectShow PCM 入口仍保留给虚拟声卡/loopback 设备兼容验证。`observe-windows-host-audio.mjs` 已支持 30 秒稳态观察、`audio_frame.timestamp` 接收年龄统计、`--maxFrameAgeMs` / `--requireMonotonicTimestamp` 新鲜度强校验、资源摘要，以及 `--playTone --requireLevel` 短测试音电平强校验；本机 30 秒稳态 50 FPS、最大间隔 33ms，短资源对照主进程工作集峰值约 62.5 MiB，测试音最高电平 0.222。
- Windows 被控端已新增 `scripts/windows/observe-windows-host-media.mjs`，用于顺序串联视频观察和 WASAPI 音频观察并输出统一媒体基线报告，避免并发临时 host 干扰采集；本轮音频顺序路径通过，当前桌面会话的 FFmpeg `gdigrab` 视频路径出现 `error 5` / mock fallback，真实视频基线待桌面捕获稳定后复测或由 WGC 采集替换。
- Windows 侧已新增 `scripts/windows/test-mac-client-browser.mjs` 页面级自检，可自动启动 Windows host 和 `apps/mac-client`，确认真实 `windows-ffmpeg-gdigrab-mjpeg` 或 `windows-gdi-jpeg` 画面、Windows host runtime/build 诊断显示、默认 1080P/60Hz/20Mbps 和 2K/60Hz/40Mbps 的码率/JPEG 质量回执、`input_ack · log`、Mac `Command+C` 映射为 Windows `Ctrl+C`、最近连接保存/回填/清空且不保存密码、文本剪贴板 `clipboard_ack`、Mac 本机文本剪贴板读取/监听、文件剪贴板 `clipboard_file_result`，也可用 `--enableAudio` / `--expectAudioPayload` / `--expectAudioPlayback` 验收反控音频；Windows 本机强校验真实 WASAPI PCM 时可直接用 `--requireAudio`，认证失败可用 `--expectAuthFailure` 回归剩余次数提示；体验验收可用 `--maxInitialVideoMs`、`--observeVideoMs`、`--minObservedVideoFrames`、`--minObservedVideoFps`、`--maxReconnectRestoreMs`、`--maxAudioFrameMs` 和 `--maxAudioPlaybackMs` 把首帧、持续来帧/FPS、断线恢复、音频首帧和真实 PCM 播放耗时转为强校验。新增 `scripts/windows/test-mac-client-video-transports.mjs` 会顺序编排 4 个页面自检，统一覆盖 `binary-h264`、H.264 JSON/base64、H.264 fallback 和 `binary-jpeg`。
- Windows 侧已新增 `scripts/windows/test-auth-retry-policy.mjs`，可同时回归 Windows host 和假 Mac 服务的 3 次认证失败断开策略。
- Windows 常用检查/回归脚本已补齐 `--help/-h` 纯帮助入口：`check-windows-audio-devices`、`check-windows-firewall`、`test-auth-retry-policy`、`test-coordinate-mapping` 和 `test-windows-input-helper` 查参数时不会误触发探测、临时服务、input helper 或断言。
- Windows 侧已新增 `scripts/windows/test-windows-script-help.mjs`，可统一回归 `scripts/windows/*.mjs` 的 `--help` / `-h` 纯帮助入口；当前覆盖 25 个脚本、50 条帮助命令，并修正旧脚本 `-h` 会被忽略的问题。
- Mac 控制 Windows 已新增 `apps/mac-client` Web 原型：可连接 Windows host、显示 JPEG/data-url 画面、选择画质/分辨率/刷新率/码率并下发 `display_settings`、在会话诊断显示 Windows host runtime/build、认证失败时提示剩余尝试次数、意外断线后最多自动重连 3 次、成功连接后保存最近 host/port/时间并一键回填或清空且不保存密码、发送鼠标和键盘 `input_event`，页面提示 Mac `Command` 会按 Windows `Ctrl` 发送且自检覆盖该映射，也可手动发送文本 `clipboard_text` 并显示 `clipboard_ack`，读取/监听 Mac 本机文本剪贴板，以及选择文件后按 `clipboard_file_*` 分块发送；新增 PCM 音频播放入口，可播放 `pcm-f32le-base64` 过渡帧，mock 音频只显示状态；Windows host 已按既有 `qualityPreset`/`maxBandwidthKbps` 应用并回传 `jpegQuality`；本机 Windows host 验证已覆盖默认 1080P/60Hz/20Mbps、切换 2K/60Hz/40Mbps、runtime/build 显示、系统文件剪贴板、意外断线自动重连、首帧/断线恢复耗时阈值、短窗口视频持续来帧/FPS 阈值、Windows WGC `repeatPreviousFrame` 轻量重复帧画面保持和诊断计数、音频首帧耗时阈值和真实 WASAPI PCM 播放。
- 当前屏幕采集默认优先 FFmpeg gdigrab 持续 MJPEG，PowerShell/System.Drawing 系统截图作为兜底，全部失败时会回退模拟帧；Windows 被控端也已新增可选 `ffmpeg-h264` 过渡模式，使用 FFmpeg 输出 `video_frame.codec=h264`、`capturePipeline=windows-ffmpeg-gdigrab-h264`、`codecString` 和 `h264Encoder`，默认 `libx264`，也可通过 `LAN_DUAL_WINDOWS_H264_ENCODER` 或脚本 `--h264Encoder h264_nvenc` 切到 NVENC，可按客户端能力走 `annexb-base64` JSON 或 `annexb-binary` / `binary-h264` WebSocket 二进制帧；真实桌面权限下本机 720p/30Hz libx264 短基线为 73 帧/2.5 秒、约 28.83 FPS、最大间隔 53ms，`2026-06-15` NVENC 过渡路径已通过 H.264 输出、Mac client binary-h264 和视频传输矩阵 4/4 回归，普通沙盒上下文可能因 FFmpeg `gdigrab error 5` 回退 mock，主要用于 Mac client H.264 接收链路和编码器选择对接。WGC 目前已完成支持预检，当前 Windows 11 build `26200`、WGC WinRT 类型、`GraphicsCaptureSession.IsSupported()` 和硬件 GPU 检测均通过；`LAN_DUAL_WINDOWS_WGC_HELPER` JSON 行 helper 接入点已落地，配置 helper 后可走 `windows-wgc-helper-jpeg` 管线，新增 Rust helper `apps/windows-wgc-helper` 已能初始化 D3D11/WinRT Direct3D/GraphicsCaptureItem/frame pool/session，并已能从 `Direct3D11CaptureFrame.Surface` 读回真实帧、按请求宽高等比缩放且不放大、用 WIC `ImageQuality` 编码 JPEG 后按 JSON 行输出；本机直接真帧 `1280x720`/q0.55 本轮首帧约 96 KB，真实 Windows host + 真实 helper 短观察收到 14 帧、平均约 84 KB，体积会随桌面内容波动。新增 `benchmark-windows-wgc-settings.mjs` 可顺序跑 WGC 刷新率/码率/资源基准；当前 30/60/120Hz 会话刷新率均可协商，但静态桌面实收约 9-12 FPS。可选 repeat-last-frame 诊断模式已落地，30/60/120Hz 短基准分别约 30.45/33.92/37.78 FPS，内容年龄最大约 80-96ms；轻量信令模式也已落地，`--repeatLastFrameMode signal` 时重复帧只发 `repeatPreviousFrame=true`，60Hz/20M 短基准约 31-32 FPS，平均图片 payload 降到约 17-23 KB。`binary-jpeg` 和 `binary-h264` 可降低图片/H.264 payload 的文本传输成本；后续要继续减少编码和源帧成本，推进 WGC 采集源接 NVENC 和 Mac client 真连观感验收。音频默认未配置时继续模拟，可显式设置 `LAN_DUAL_WINDOWS_AUDIO_MODE=wasapi` 试用系统声音 loopback，或配置 `LAN_DUAL_WINDOWS_AUDIO_DEVICE` 试用 DirectShow PCM；输入注入后续重点是真实 `system` 模式手感和安全边界验收。
- Windows 端新增只读视频编码能力体检 `scripts/windows/check-windows-video-encoder-support.mjs`，可一次汇总 FFmpeg H.264 软件/硬件编码器、WGC 预检和浏览器 WebCodecs H.264 支持，并支持 JSON/强校验。本机 `2026-06-15` 强校验通过，发现 `h264_nvenc`、`h264_qsv`、`h264_amf`、`h264_mf`、`h264_d3d12va` 和 `libx264`，推荐下一步从 WGC JPEG 过渡到 WGC + NVENC H.264 原型。

## 里程碑 M4：一键反控

目标：正在连接时可以切换控制方向。

- [x] 增加 reverse_control_request。
- [x] 增加反控确认弹窗。
- [x] 增加切换方向状态机。
- [x] 增加失败回滚。
- [x] 增加当前控制方向显示。

验收：

- [x] Windows 控制 Mac 时可以请求反控。
- [ ] Mac 确认后可以控制 Windows。
- [x] 拒绝反控时原连接保持正常。

当前备注：

- Windows 控制端已支持反控请求编号、方向状态显示、超时回滚和收到请求时的确认弹窗。
- 本地模拟和假 Mac WebSocket 服务已支持反控已同意、反控超时、对方向我发起反控三种联调场景。
- 当前“已同意”仍只完成 Windows 侧状态切换；真正的 Mac 控制窗口与 Windows 被控端接管流程仍待实装。

## 里程碑 M5：文件剪贴板和增强体验

- [x] 局域网自动发现骨架：控制端刷新设备并探测 `/discovery`，假 Mac 和 Windows 被控端已返回设备信息；Windows 桌面版已可通过 `scripts/windows/discover-lan-hosts.mjs` 扫描当前 IPv4 网段并合并到设备列表。刷新后若发现真实在线 WebSocket 设备，会自动选中最佳目标并显示 runtime；真实 Mac `192.168.31.122:43770` / build `edcde5e` 已由 diagnosticsOnly 验证。
- [ ] 跨设备 UDP/mDNS 自动发现。
- [x] macOS 被控端 Bonjour/mDNS 广播：发布 `_lan-dual-control._tcp`，TXT 记录指向 `/discovery` 和控制端口。
- [ ] Windows/Tauri 原生层浏览 `_lan-dual-control._tcp` 并回填设备列表。
- [x] 文件、压缩包、图片等剪贴板传输骨架：控制端可选择文件并按 `clipboard_file_*` 分块发送，假 Mac 和 Windows 被控端可确认进度。
- [x] macOS 被控端文件剪贴板读写第一版：可接收 Windows 文件块并写入 `NSPasteboard`，也可读取 Mac 本机普通文件剪贴板并推送给控制端内存接收。
- [x] Windows 控制端为远端文件提供安全保存 UI：最近一批远端文件可在收件托盘查看、单个下载、全部下载或清空；清空会清理内存暂存和状态提示，并明确不删除系统剪贴板仍可能需要的临时目录。
- [x] Windows 控制端把远端文件写入 Windows 系统文件剪贴板：桌面版接收完成后按 1MB 原生分块保存到临时目录并调用系统文件剪贴板，原生层校验 512MB 总量、分块偏移、最终字节数并清理 7 天以上旧临时目录；系统写入失败但文件已落盘时，本地日志和托盘状态显示临时目录，可一键打开该目录并重试写入；浏览器预览版保留内存托盘。
- [ ] 大文件传输速度、剩余时间和断点续传。
- [x] 多显示器选择骨架：控制端显示 `displays` 下拉框，并通过 `displayId` 切换目标屏幕。
- [ ] 真实外接多显示器采集切换验收。（Mac host 已有枚举/回执/单屏 round-trip，自检脚本已就绪。）
- [ ] 音频延迟优化。
- [x] macOS 系统声音采集第一版：ScreenCaptureKit 输出真实 `pcm-f32le-base64`、48kHz、双声道 PCM `audio_frame`，失败时回退模拟音频。
- [x] Windows 系统声音采集第一版：WASAPI loopback 输出真实 `pcm-f32le-base64`、48kHz、双声道 PCM `audio_frame`，默认关闭，显式 `LAN_DUAL_WINDOWS_AUDIO_MODE=wasapi` 时启用。
- [x] ScreenCaptureKit 流式采集 + VideoToolbox H.264 硬件编码第一版。（已在真 Mac 上通过 `--requireH264` 首帧强校验；端到端延迟、连续重连和 CPU 占用继续作为稳定性任务推进。）
- [x] Windows host FFmpeg gdigrab + libx264 H.264 过渡模式。（显式 `ffmpeg-h264` 输出 Annex B base64，用于 Mac client H.264 接收对接；正式 Windows 低延迟采集仍优先推进 WGC。）
- [x] Windows WGC Rust helper 初始化链路。（`apps/windows-wgc-helper --probe` 可创建 D3D11/WinRT Direct3D/GraphicsCaptureItem/frame pool/session；`--mock` 已接入 Node host helper 合同。）
- [x] Windows WGC Rust helper 真实帧读回和 JPEG 输出。（默认 capture 可读取 `Direct3D11CaptureFrame.Surface`、CPU staging texture、WIC JPEG，并输出 JSON 行 frame；本机一帧 `2560x1440` 真帧自测通过。）
- [x] Windows WGC helper 请求分辨率缩放和 JPEG 质量控制。（`1280x720`/q0.55 缩放真帧自测通过；真实 Windows host + 真实 helper 短观察收到 `windows-wgc-helper-jpeg` 真帧。）
- [x] Windows WGC 刷新率/码率基准脚本。（`benchmark-windows-wgc-settings.mjs` 默认顺序跑 30/60/120Hz WGC 观察；当前会话刷新率可协商，静态桌面实收约 9-12 FPS。）
- [x] Windows WGC repeat-last-frame pacing 诊断模式。（默认关闭；开启后 60Hz/20M 短基准约 31 FPS，三档 repeat 约 30-38 FPS，已暴露 JSON/base64 重发瓶颈。）
- [x] Windows WGC repeat-last-frame 轻量信令模式。（`--repeatLastFrameMode signal` 时重复帧只发 `repeatPreviousFrame=true`，60Hz/20M 短基准约 31-32 FPS，平均图片 payload 降到约 17-23 KB。）
- [x] Mac client 接收 Windows WGC 轻量重复帧。（`--expectRepeatSignalVideo` 会启动 WGC mock helper，验证 `repeatPreviousFrame` 无 `dataUrl` 时保持上一帧可见并显示“重复”计数。）
- [x] Windows host 可选 `binary-jpeg` WebSocket 二进制视频帧。（Mac client 声明 `preferredVideoTransport=binary-jpeg` 后，JPEG 元数据保留 JSON 头、图片改走原始 JPEG 字节；`--expectBinaryVideo` 页面级自检通过。）
- [x] Windows host `ffmpeg-h264` 模式的 MJPEG/JPEG fallback。（Mac client/WebCodecs 拒绝当前 H.264 `codecString` 后发送 `preferredVideoCodec=mjpeg` / `preferredVideoEncoding=data-url`，同一个 host 会切到 `windows-ffmpeg-gdigrab-mjpeg` 并恢复 JPEG 画面；`--expectH264Fallback` 页面级自检通过。）
- [x] Windows host 可选 `binary-h264` WebSocket 二进制视频帧。（Mac client 声明 `preferredVideoTransport=binary-h264` 后，H.264 JSON 头保留在 `LDCV1` binary frame，Annex B payload 改走原始字节；`--expectBinaryH264Video`、`--disableBinaryVideo` 兼容回归和 `binary-jpeg` 回归通过。）
- [x] Mac client 视频传输矩阵回归脚本。（`test-mac-client-video-transports.mjs` 顺序覆盖 `binary-h264`、H.264 JSON/base64、H.264 unsupported fallback 和 `binary-jpeg`，当前 4/4 通过，避免后续手动四连测和端口互抢。）
- [x] Windows 视频编码能力体检脚本。（`check-windows-video-encoder-support.mjs` 汇总 FFmpeg H.264 软件/硬件编码器、WGC 预检和浏览器 WebCodecs；本机强校验通过并推荐 WGC + NVENC 原型。）
- [x] Windows host `ffmpeg-h264` 可选 H.264 encoder。（默认 `libx264`，支持 `LAN_DUAL_WINDOWS_H264_ENCODER` / `--h264Encoder h264_nvenc`，discovery/session/frame/观察脚本回传实际 `h264Encoder`；NVENC 路径和默认 libx264 回归均通过。）
- [ ] Windows WGC H.264/硬编原型，以及 Mac client 真连观感验收。
- [ ] 安装包。
- [ ] 开机自启。
