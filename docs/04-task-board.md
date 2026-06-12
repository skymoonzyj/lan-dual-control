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
- macOS 被控端已接入 CGEvent 输入注入；默认 `LAN_DUAL_INPUT_MODE=inject`，可切到 `log` 做安全联调。
- Windows 控制端当前已可区分真实 JPEG、H.264 视频帧和模拟视频帧，并记录图片或 WebCodecs 解码失败；`scripts/windows/test-mac-host.ps1` 可用于真机连通自检，显式加 `-ClipboardText -ClipboardFile` 可验证 macOS 文本和文件剪贴板写入。
- 真 Mac 已通过强校验探针验证真实 JPEG 首帧、H.264 Annex B 首帧和 PCM 音频帧：`-RequireRealVideo` 会拒绝 mock/fallback 视频帧，`-RequireH264` 会确认 SPS/PPS/IDR，`-RequireAudio` 会确认 `pcm-f32le-base64` payload，`-ExpectInputMode log` 可确认安全输入模式。
- Mac 端新增 `scripts/mac/stress-mac-host.mjs`，可循环复用 canonical 探针做 H.264 + PCM 连续连接稳定性检查；真机 10 次循环已通过，监听进程 FD 保持 `30->30`。
- Mac 端新增 `scripts/mac/observe-mac-audio.mjs`，可持续观察系统声音 `audio_frame` 帧率、接收间隔、payload 和电平；真机 10 秒观察收到 501 帧，约 50fps，最大间隔 22ms。
- Mac 端新增 `scripts/mac/check-input-keymap.mjs`，可静态验证 CGEvent 键盘映射覆盖；当前常用 `KeyboardEvent.code` 和 `event.key` 键组全覆盖。
- Windows 控制端已增加 Mac 主机诊断状态条：会汇总 `permissions`、`hostMode`、`capturePipeline`、`source`、WebCodecs 解码状态、`droppedFrames`、`input_ack` 和剪贴板模式，真机权限、输入拒绝、解码失败或采集回退问题可直接在画面内看到。
- Mac 端已兼容 Windows 端现有 `kind/action/remoteX/remoteY` 输入事件字段。
- Windows 控制端已新增 Edge 页面级自检脚本 `scripts/windows/test-windows-client-browser.mjs`，可自动打开控制端、连接真实 Mac、读取诊断条并确认视频 surface；当前 Edge headless 不支持 `avc1.420029` 时已验证会自动请求 JPEG 兜底并显示真实 Mac 画面。
- Windows 控制端已接入真实 `pcm-f32le-base64` 音频播放，支持 planar/interleaved Float32 PCM 和音量滑块；页面级自检已验证真实 Mac 连接下音频播放计数递增。
- 真 Mac 后续继续做输入注入、真实音频长时间稳定性、低延迟稳定性和更完整的键盘/输入法兼容验证。
- MSI/NSIS 安装包暂未开启，先保留桌面 exe 构建；安装包放到 M5 处理。

## 里程碑 M2：安全和控制体验

目标：能作为个人日常工具试用。

- [x] 添加固定密码认证门禁。
- [x] 添加 Windows 一键自检和联调启动脚本。
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
- [ ] 处理防火墙提示。

Mac 端：

- [x] 创建 Mac 控制窗口第一版：`apps/mac-client` Web 原型。
- [x] 输入 Windows IP 连接。
- [x] 显示 Windows 画面。
- [ ] 播放 Windows 声音。
- [x] 播放 Windows PCM 音频帧入口。
- [x] 发送鼠标键盘事件。
- [x] 发送文本剪贴板到 Windows host。
- [x] 发送文件剪贴板到 Windows host 的入口。

验收：

- [ ] Mac 可以窗口化控制 Windows。
- [ ] Windows 和 Mac 都能担任控制端或被控端。
- [ ] 声音在反方向可用。
- [x] 文本剪贴板在反方向可用。

当前备注：

- 已创建 `apps/windows-host` Node.js WebSocket 被控服务骨架。
- 当前可完成 hello/auth/session 握手，未认证连接会被拒绝，同一连接内密码错误 3 次后会关闭；认证后可发送 Windows 系统截图 JPEG `video_frame`、模拟 `audio_frame`、接收 `input_event`、处理 `clipboard_text`。
- Windows 被控端在 Windows 上会用 PowerShell `Set-Clipboard` 写入系统文本剪贴板，非 Windows 开发环境回退为 `memory-only`，并在 `/discovery`、`hello_ack`、`session_answer` 暴露剪贴板模式。
- Windows 被控端可接收 `clipboard_file_*` 文件块并落到临时目录；在 Windows 上会用 PowerShell `Set-Clipboard -Path` 写入系统文件剪贴板，非 Windows 开发环境回退为 `saveMode: temp`。
- Windows 被控端已接入最小 SendInput 桥：Windows 上通过 PowerShell/C# 调用 `SendInput`/`SetCursorPos` 注入鼠标、滚轮和常用键盘事件，非 Windows 开发环境回退为日志模式。
- macOS 被控端、Windows 被控端和假 Mac 服务处理输入事件后都会返回 `input_ack`，控制端和探针可确认输入已注入、仅记录或被拒绝。
- Windows 被控端已新增本机一键自检脚本 `scripts/windows/test-windows-host.ps1`，可临时启动服务并验证真实 JPEG 首帧、文本剪贴板和文件剪贴板接收；默认不发送输入事件。
- Windows 被控端已新增视频持续帧观察脚本 `scripts/windows/observe-windows-host-video.mjs`，可统计实际 FPS、最大帧间隔、掉帧数和采集管线；当前本机 FFmpeg gdigrab 过渡层约 29 FPS，System.Drawing 兜底约 3 FPS。
- Windows 被控端已新增显式 DirectShow PCM 音频入口；设置 `LAN_DUAL_WINDOWS_AUDIO_DEVICE` 后可采集指定音频设备并发送 `pcm-f32le-base64`，默认未配置设备时继续发送模拟音频帧，避免误采真实麦克风。
- Windows 侧已新增 `scripts/windows/test-mac-client-browser.mjs` 页面级自检，可自动启动 Windows host 和 `apps/mac-client`，确认真实 `windows-ffmpeg-gdigrab-mjpeg` 或 `windows-gdi-jpeg` 画面、`input_ack · log`、文本剪贴板 `clipboard_ack`、文件剪贴板 `clipboard_file_result`，也可用 `--expectAuthFailure` 回归认证失败剩余次数提示。
- Windows 侧已新增 `scripts/windows/test-auth-retry-policy.mjs`，可同时回归 Windows host 和假 Mac 服务的 3 次认证失败断开策略。
- Mac 控制 Windows 已新增 `apps/mac-client` Web 原型：可连接 Windows host、显示 JPEG/data-url 画面、认证失败时提示剩余尝试次数、发送鼠标和键盘 `input_event`，也可手动发送文本 `clipboard_text` 并显示 `clipboard_ack`，以及选择文件后按 `clipboard_file_*` 分块发送；新增 PCM 音频播放入口，可播放 `pcm-f32le-base64` 过渡帧，mock 音频只显示状态；本机 mock/回退 Windows host 验证已通过，文件写入系统剪贴板可由 Windows 默认 `test-mac-client-browser.mjs` 强校验。
- 当前屏幕采集默认优先 FFmpeg gdigrab 持续 MJPEG，PowerShell/System.Drawing 系统截图作为兜底，全部失败时会回退模拟帧；音频默认未配置时继续模拟，可显式配置 `LAN_DUAL_WINDOWS_AUDIO_DEVICE` 试用 DirectShow PCM；后续仍需升级 Windows Graphics Capture，真实系统声音采集待接 WASAPI loopback，输入注入可优化为高性能原生模块或常驻进程。

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

- [x] 局域网自动发现骨架：控制端刷新设备并探测 `/discovery`，假 Mac 和 Windows 被控端已返回设备信息。
- [ ] 跨设备 UDP/mDNS 自动发现。
- [x] macOS 被控端 Bonjour/mDNS 广播：发布 `_lan-dual-control._tcp`，TXT 记录指向 `/discovery` 和控制端口。
- [ ] Windows/Tauri 原生层浏览 `_lan-dual-control._tcp` 并回填设备列表。
- [x] 文件、压缩包、图片等剪贴板传输骨架：控制端可选择文件并按 `clipboard_file_*` 分块发送，假 Mac 和 Windows 被控端可确认进度。
- [x] macOS 被控端文件剪贴板读写第一版：可接收 Windows 文件块并写入 `NSPasteboard`，也可读取 Mac 本机普通文件剪贴板并推送给控制端内存接收。
- [x] Windows 控制端为远端文件提供安全保存 UI：最近一批远端文件可在收件托盘查看、单个下载、全部下载或清空。
- [x] Windows 控制端把远端文件写入 Windows 系统文件剪贴板：桌面版接收完成后保存到临时目录并调用系统文件剪贴板，浏览器预览版保留内存托盘。
- [ ] 大文件传输速度、剩余时间和断点续传。
- [x] 多显示器选择骨架：控制端显示 `displays` 下拉框，并通过 `displayId` 切换目标屏幕。
- [ ] 真实多显示器枚举和采集切换。
- [ ] 音频延迟优化。
- [x] macOS 系统声音采集第一版：ScreenCaptureKit 输出真实 `pcm-f32le-base64`、48kHz、双声道 PCM `audio_frame`，失败时回退模拟音频。
- [x] ScreenCaptureKit 流式采集 + VideoToolbox H.264 硬件编码第一版。（已在真 Mac 上通过 `--requireH264` 首帧强校验；端到端延迟、连续重连和 CPU 占用继续作为稳定性任务推进。）
- [ ] 安装包。
- [ ] 开机自启。
