# Windows 控制端原型

这是第一版 Windows 控制端壳，用于提前验证中文界面、连接状态、显示参数、声音开关、剪贴板开关和输入事件记录。

## 当前能力

- 手动输入 Mac 局域网 IP 和端口，也可以用“刷新设备”探测本机服务、连接历史和局域网里的 `/discovery` 接口；桌面版会调用本机扫描工具自动扫当前 IPv4 网段，浏览器预览版只轻量探测已知地址，避免网页预览时大量并发探测。刷新后若发现真实在线设备，会优先自动选中 macOS 被控端，填入地址和端口，并把 runtime/build 显示到诊断条。
- 支持本地模拟握手，也支持 WebSocket 协议连接。
- 支持 hello、auth_request、session_offer、display_settings、video_frame、input_event、clipboard_text 和 reverse_control_request 消息。
- 显示模拟远程桌面画面。
- 接收并渲染假 Mac 服务发送的模拟 `video_frame`。
- 捕获远程画面区域内的鼠标移动、点击、滚轮和键盘事件。
- 支持窗口化和全屏显示切换。
- 支持远控画面内右上角悬浮控制中心：收起时显示当前编码、实收 FPS/请求刷新率和码率摘要，展开后可快速切换显示屏、画质、分辨率、刷新率、码率、缩放、声音、音量、常用 macOS 快捷键、普通全屏、真全屏、窗口、复制诊断、立即重连和退出远控；全屏后会隐藏顶部工具栏，保留悬浮控制中心作为主要入口，并显示 `Esc` 退出全屏、连接/重连倒计时、当前视频链路、实收 FPS、协商/请求刷新率、低于请求刷新率提示、帧延迟或时钟偏差、回退原因、声音接收帧数/电平/播放计数/音量、文字/文件剪贴板能力、远端文件接收进度或系统剪贴板写入状态、输入模式和安全状态；“复制诊断”会在按钮上短暂显示已复制或复制失败，复制报告也会写入当前全屏浮层的连接、视频、声音、剪贴板、输入和安全状态，方便全屏现场确认；进入全屏时会短暂显示轻提示，提示 `Esc` 退出、当前画质、刷新率、码率和输入状态。真全屏会优先调用浏览器/桌面壳的系统 Fullscreen API，当前环境不支持时自动保留普通全屏并给出中文提示。
- 支持画质预设、分辨率、刷新率、码率、声音、剪贴板控制项。
  - 画质预设：流畅、自动、高清、原画、自定义；原画会请求 4K、50 Mbps，并切到原始比例，方便检查细节。
  - 分辨率：1080P、2K、4K。
  - 刷新率：30、60、120、144、240 Hz。
  - 码率：5 Mbps、10 Mbps、15 Mbps、20 Mbps、40 Mbps、50 Mbps。
  - 声音：开关、音量、模拟音频帧状态、真实 PCM 音频播放。
- 支持画面缩放模式：适应窗口、原始比例、拉伸填充。
- 窗口缩放坐标映射和 Windows 到 macOS 快捷键映射有独立回归脚本，覆盖适应窗口黑边、原始比例滚动、拉伸填充，以及 Ctrl+C/V/X/A/Z/Y 等常用快捷键到 Command 组合键的转换。
- 适应窗口时黑边区域会隐藏远端鼠标点并忽略鼠标/滚轮输入；如果从真实画面内拖拽到黑边再松开，会用最后一个有效坐标补发抬起事件，避免远端卡住按下状态。
- 支持多显示器选择骨架：被控端返回 `displays` 后可在控制端选择目标显示器，并通过 `display_settings.displayId` 下发。
- 支持远控 macOS 默认按键映射：Win -> Command、Alt -> Option、Ctrl -> Control，可手动调整并一键还原。
- 默认开启 Windows 常用快捷键兼容：Ctrl+C/V/X/A/Z/S/F/P/O/N/W/T/R 会按 macOS Command 快捷键发送，Ctrl+Y 会转为 Command+Shift+Z。
- 鼠标坐标按实际视频画面区域映射，黑边区域不会误发输入。
- 支持保存连接方式、地址、端口和画质设置。
- 支持最近连接列表。
- 支持连接状态机和中文错误提示；认证失败会显示剩余尝试次数。
- 支持假 Mac 联调错误模拟：密码错误、权限不足、输入被拒绝、视频中断、连接后断开。
- 支持认证门禁联调：未认证连接不能进入会话、输入、剪贴板或反控流程。
- 支持非手动断线后自动重连，最多重试 3 次；重连等待时会显示倒计时并提供“立即重连”按钮，遇到密码错误会停止重连，等待用户确认密码。
- 支持声音接收：处理 `audio_settings_ack`、模拟 `audio_frame` 和真实 `pcm-f32le-base64` PCM 帧，状态栏显示音频帧、音量、音频延迟和播放计数。
- 支持真实 Mac 视频帧诊断：连接后可区分 `jpeg` 真实视频帧和 `mock-svg` 模拟帧，并记录图片解码失败。
- 支持实收 FPS 统计：刷新率卡片会区分“实收 FPS、协商 Hz、请求 Hz”，普通诊断条和全屏浮层会在实收 FPS 明显低于请求刷新率时提示“低于请求”，避免把控制端请求值误认为真实帧率。
- 支持视频帧延迟显示：顶部“帧延迟”卡片和诊断条会用 `video_frame.timestamp` 估算远端帧到达本机时的新鲜度；没有真实帧时间戳时显示等待，两端系统时钟明显不一致时显示“时钟偏差”，不再使用随机模拟延迟。
- 支持 H.264 流式解码入口：当前窗口环境支持 WebCodecs 时会优先请求 `h264`，收到 `annexb-base64` 帧后用 `VideoDecoder` 渲染到视频画布；会依次探测显式 Annex B 和浏览器默认 H.264 配置，解析 Annex B/AVC NAL 类型识别 IDR/SPS/PPS 关键帧，重配置后会等待关键帧再喂给解码器，连续失败时自动请求 JPEG 兜底。
- 支持 Mac 主机诊断状态条：显示主机模式、运行时 PID/启动时间/build、采集管线、视频来源、WebCodecs 解码状态、H.264 启动回退原因、丢帧、权限、输入模式和剪贴板通道。
- 顶部“输入事件”状态会直接区分安全日志、真实控制、已注入和被拒绝；Mac host 处于 `inputMode=log` 时会显示“安全日志，不会真正控制”，避免把安全记录模式误判为控制失效。
- 支持 `Ctrl+V` 粘贴前预同步本机剪贴板：文字走 `clipboard_text`，图片等可读剪贴板项走 `clipboard_file_*`，资源管理器文件路径后续接入桌面原生模块。
- 支持文件剪贴板发送骨架：可手动选择文件、压缩包或图片，按 `clipboard_file_*` 消息分块发送并显示进度。
- 支持远端文件收件托盘：Mac 复制普通文件后，控制端可接收、查看、手动下载；接收中、分块进度、超限拒绝、解析失败、不完整完成和 45 秒无新分块/完成消息的传输超时都会直接显示在托盘状态条，不只依赖底部剪贴板文字或事件日志；Windows 桌面版会把不超过 512MB 的远端文件按 1MB 原生分块写入系统文件剪贴板，原生层会校验分块边界并清理 7 天以上旧临时目录；系统剪贴板写入失败但文件已落盘时，本地事件日志和托盘状态会显示临时目录，可一键打开该目录或重试写入；清空托盘会清掉内存暂存和状态提示，但不会删除系统剪贴板仍可能需要的临时目录；浏览器预览版保留内存暂存。
- 桌面版新增“本机被控”面板：可选择低风险/部署/深度三档体检 Windows host 环境，也可勾选“媒体基线”把 `check-windows-host-readiness --probeMedia` 纳入体检并显示 `media=ok|partial|failed`；面板还能预览防火墙放行命令、用隐藏密码启动/停止 Windows 被控端，并查看启动日志、`/discovery` 状态、runtime build、视频/音频/输入/剪贴板能力、反控策略、Agent Link Board 当前呼叫和体检帧新鲜度阈值；面板会消费 `start-windows-host --status --json --checkBoard` 的只读状态，active Mac -> Windows call 会显示为“Mac 正在请求 Windows 配合”，DONE call 不当作待办，浏览器预览版会保持该面板禁用。启动前可在面板选择反控策略：默认“需确认”不会自动同意 Mac 反控，只有可信局域网短测才切到“实验同意”；如果 Mac 已经发起过反控请求但被默认拒绝，host 在线状态会显示“反控：刚收到请求”并给出“临时允许后让对方重试”的提示；host 在线后可点“临时允许反控”打开约 30 秒一次性授权窗口，下一次 Mac 反控请求通过后自动关闭；同一面板的“Mac 提醒”区可查看、开启或停止 Windows 本机 Agent Link 浮窗 watcher，用于远控窗口最小化或等待 Mac 授权/权限/反控重试时接住提醒。自动状态轮询会把 watcher 状态查询节流到约 15 秒一次，避免频繁启动 PowerShell；手动“刷新提醒”和开启/停止按钮仍会立即执行。
- 支持一键反控请求编号、方向状态显示、超时回滚和对端确认。
- 支持收到对端 `reverse_control_request` 时弹出确认。
- 本地事件日志，可一键导出或复制当前诊断报告；报告顶部有“快速摘要”，先汇总远端连接、重连、远端文件、剪贴板、视频、声音、输入模式/ack、全屏浮层、本机协作和画质请求，下面再把远端连接、本机协作和显示能力分段展示。详细内容包含连接状态、画质参数、视频链路/实收 FPS/协商或请求刷新率/低于请求/帧延迟/回退原因、声音接收/播放/音量/电平/丢帧/错误、剪贴板开关/文字文件能力/远端文件接收进度/系统剪贴板写入结果、输入事件与安全日志/真实注入/拒绝状态、全屏浮层连接/视频/声音/剪贴板/输入/安全状态、重连状态、重连等待原因、下次重连倒计时、远端文件状态/进行中接收/临时目录、本机 Mac 提醒 watcher 状态/最近检查时间/轮询间隔、本机被控 Windows host 状态/端口/反控策略/体检档位/最近输出脱敏摘要、最近收到的远端文件和事件记录。

## 运行方式

### 方式一：直接打开静态页面

```text
E:\codex\lan-dual-control\apps\windows-client\index.html
```

默认选择“本地模拟”时，不需要启动任何服务。

坐标映射回归可单独运行：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-coordinate-mapping.mjs
```

需要先查看说明而不运行坐标断言时，可以运行：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-coordinate-mapping.mjs --help
```

真实 Mac 页面级自检可自动启动本地控制端页面、打开 Edge、连接 Mac，并确认诊断条和视频画面；加 `--requireH264` 可强制要求真实 H.264/WebCodecs 画布解码成功且本次连接 H.264 解码错误计数为 0，加 `--injectPcmAudio` 可额外注入一帧 planar PCM，验证控制端音频播放入口。连接/视频/H.264 和音频播放等待会默认每 10 秒输出一次当前页面快照，可用 `--progressIntervalMs <ms>` 调整，传 `0` 可关闭：
脚本会先回归画面内悬浮控制中心，确认悬浮层、摘要、画质/原画、分辨率、刷新率、码率、缩放、声音、音量、连接/重连状态、视频链路状态、普通诊断条和浮层的低于请求刷新率提示、声音接收/播放状态、剪贴板/远端文件状态、输入/安全状态条、快捷键发送、复制诊断、进入全屏轻提示、`Esc` 退出全屏、真全屏模拟路径、全屏、立即重连和窗口按钮能同步到原工具栏与页面布局；随后会模拟适应窗口黑边输入，确认黑边移动、点击、滚轮不会发远控事件，画面内按下后移到黑边松开也能正常释放。连接成功后还会等待刷新率卡片显示数值型“实收 FPS”和“协商 Hz”，避免把请求刷新率误当成真实帧率。
只需要快速检查诊断条、悬浮控制中心和黑边输入防护时，可加 `--diagnosticsOnly`，不会连接被控端；该路径也会模拟 Mac host `runtime`，确认诊断条能显示 PID、运行时长和 build，并覆盖顶部输入状态的安全日志/真实控制/被拒绝提示、视频帧新鲜度显示、时钟偏差提示、H.264 Annex B/AVC 关键帧识别 helper，以及自动重连倒计时和“立即重连”按钮。Mac host 重启后，可再加 `--discover --expectDiscoveryRuntimeBuildId <build-id>`，脚本会先用 `discover-lan-hosts` 自动选中最佳 Mac host，再通过真实 `/discovery` 无密码验收设备列表、刷新后自动选中 WebSocket 设备、以及诊断条显示的 runtime。已知 IP 且不想扫整段局域网时，可组合 `--discover --discoverNoLocalSubnets --host <Mac IP> --port 43770`。需要把结果发到 Agent Link Board 时，加 `--boardSummary` 会让 stdout 只输出一行无密摘要，详细 `[OK]` 进度会转到 stderr。

正式 Mac E2E 长测仍走 `check-mac-formal-e2e.mjs --promptPassword`，密码只经环境变量传给子探针；其中 5 分钟视频观察和音频观察会先打印观察目标，并默认每 10 秒输出一次进度心跳，包含已收帧数、剩余时间、当前 FPS 和最大帧间隔，避免现场误判为卡住。需要调试心跳频率时可加 `--progressIntervalMs <ms>`，传 `0` 可关闭。

```powershell
node E:\codex\lan-dual-control\scripts\windows\discover-lan-hosts.mjs
node E:\codex\lan-dual-control\scripts\windows\discover-lan-hosts.mjs --boardSummary --requireMacHost
node E:\codex\lan-dual-control\scripts\windows\discover-lan-hosts.mjs --noLocalSubnets --host 192.168.31.122 --port 43770 --requireMacHost --boardSummary
node E:\codex\lan-dual-control\scripts\windows\discover-lan-hosts.mjs --subnet 192.168.31.0/24 --requireFound
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --diagnosticsOnly
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --diagnosticsOnly --boardSummary
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --discover --diagnosticsOnly --boardSummary --expectDiscoveryRuntimeBuildId d807536
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --discover --discoverNoLocalSubnets --host 192.168.31.122 --port 43770 --diagnosticsOnly --boardSummary --expectDiscoveryRuntimeBuildId d807536
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --diagnosticsOnly --host 192.168.31.122 --port 43770 --expectDiscoveryRuntimeBuildId edcde5e
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --discover --promptPassword --requirePassword --requireH264
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --host 192.168.31.122 --port 43770 --password demo-password
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --host 192.168.31.122 --port 43770 --password demo-password --requireH264
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --host 192.168.31.122 --port 43770 --password demo-password --injectPcmAudio
node E:\codex\lan-dual-control\scripts\windows\check-mac-formal-e2e.mjs --discover --promptPassword
```

该脚本会保留浏览器 GPU/视频合成能力，避免自检环境把 WebCodecs H.264 误判为不支持；真实 Mac 127.0.0.1:43770 / build `db48055` 已验证 `avc1.420029:annexb` 解码到 1920×1080 canvas，`H264Errors=0`。

该脚本也可在 macOS 开发机上用 Chrome/Edge 跑；找不到浏览器时可设置 `BROWSER_PATH`、`MSEDGE_PATH` 或 `CHROME_PATH`。

### 方式二：使用本地静态服务

```powershell
node E:\codex\lan-dual-control\apps\windows-client\server.mjs 5178
```

然后访问：

```text
http://127.0.0.1:5178/
```

### 方式三：联调 WebSocket 假 Mac

先启动假 Mac 服务：

```powershell
node E:\codex\lan-dual-control\apps\mock-mac-host\server.mjs 43770
```

再打开 Windows 控制端，选择：

- 连接方式：WebSocket 局域网
- 目标地址：127.0.0.1
- 端口：43770
- 连接密码：demo-password

连接成功后，分辨率、刷新率、码率、声音、剪贴板、鼠标键盘输入和一键反控按钮都会通过协议层发送消息。
假 Mac 服务还会持续发送模拟 `video_frame`，用于提前验证 Windows 端画面渲染流程。
如果假 Mac 断开连接，Windows 控制端会进入“重连中”状态并自动尝试恢复；等待期间可以点击“立即重连”马上尝试本次重连，点击“断开”会停止自动重连。
模拟场景中的“输入被拒绝”可用于回归 `input_ack` 失败提示；“反控已同意 / 反控超时 / 对方向我发起反控”可用于提前联调反控状态机。
点击左侧“刷新设备”后，如果假 Mac 服务或真实 Mac host 正在运行，会显示为在线设备；刷新结果里有真实在线设备时会自动填入地址、端口和 WebSocket 连接方式，也可以手动点击列表切换目标。

## 后续对接

等 Mac 端被控服务完成后，优先复用 `protocol-client.js` 的消息格式，对接真实被控服务：

- hello
- auth_request
- session_offer
- display_settings
- video_frame
- audio_frame
- input_event
- clipboard_text
- clipboard_file_offer
- clipboard_file_chunk
- clipboard_file_complete
