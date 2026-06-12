# Windows 控制端原型

这是第一版 Windows 控制端壳，用于提前验证中文界面、连接状态、显示参数、声音开关、剪贴板开关和输入事件记录。

## 当前能力

- 手动输入 Mac 局域网 IP 和端口，也可以用“刷新设备”探测本机服务和连接历史里的 `/discovery` 接口。
- 支持本地模拟握手，也支持 WebSocket 协议连接。
- 支持 hello、auth_request、session_offer、display_settings、video_frame、input_event、clipboard_text 和 reverse_control_request 消息。
- 显示模拟远程桌面画面。
- 接收并渲染假 Mac 服务发送的模拟 `video_frame`。
- 捕获远程画面区域内的鼠标移动、点击、滚轮和键盘事件。
- 支持窗口化和全屏显示切换。
- 支持远控画面内 UU 式右上角悬浮控制中心：收起时显示当前刷新率和码率摘要，展开后可快速切换显示屏、画质、缩放、声音、音量、全屏、窗口和退出远控；全屏后会隐藏顶部工具栏，保留悬浮控制中心作为主要入口。
- 支持画质预设、分辨率、刷新率、码率、声音、剪贴板控制项。
  - 画质预设：流畅、均衡、高清、自定义。
  - 分辨率：1080P、2K、4K。
  - 刷新率：30、60、120、144、240 Hz。
  - 码率：5 Mbps、10 Mbps、15 Mbps、20 Mbps、40 Mbps、50 Mbps。
  - 声音：开关、音量、模拟音频帧状态、真实 PCM 音频播放。
- 支持画面缩放模式：适应窗口、原始比例、拉伸填充。
- 窗口缩放坐标映射有独立回归脚本，覆盖适应窗口黑边、原始比例滚动和拉伸填充。
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
- 支持非手动断线后自动重连，最多重试 3 次；遇到密码错误会停止重连，等待用户确认密码。
- 支持声音接收：处理 `audio_settings_ack`、模拟 `audio_frame` 和真实 `pcm-f32le-base64` PCM 帧，状态栏显示音频帧、音量、延迟和播放计数。
- 支持真实 Mac 视频帧诊断：连接后可区分 `jpeg` 真实视频帧和 `mock-svg` 模拟帧，并记录图片解码失败。
- 支持实收 FPS 统计：刷新率卡片会区分“实收 FPS、协商 Hz、请求 Hz”，避免把控制端请求值误认为真实帧率。
- 支持 H.264 流式解码入口：当前窗口环境支持 WebCodecs 时会优先请求 `h264`，收到 `annexb-base64` 帧后用 `VideoDecoder` 渲染到视频画布；会依次探测显式 Annex B 和浏览器默认 H.264 配置，连续失败时自动请求 JPEG 兜底。
- 支持 Mac 主机诊断状态条：显示主机模式、运行时 PID/启动时间/build、采集管线、视频来源、WebCodecs 解码状态、H.264 启动回退原因、丢帧、权限、输入模式和剪贴板通道。
- 支持 `Ctrl+V` 粘贴前预同步本机剪贴板：文字走 `clipboard_text`，图片等可读剪贴板项走 `clipboard_file_*`，资源管理器文件路径后续接入桌面原生模块。
- 支持文件剪贴板发送骨架：可手动选择文件、压缩包或图片，按 `clipboard_file_*` 消息分块发送并显示进度。
- 支持远端文件收件托盘：Mac 复制普通文件后，控制端可接收、查看、手动下载；Windows 桌面版会把不超过 128MB 的远端文件写入系统文件剪贴板，浏览器预览版保留内存暂存。
- 支持一键反控请求编号、方向状态显示、超时回滚和对端确认。
- 支持收到对端 `reverse_control_request` 时弹出确认。
- 本地事件日志，可一键导出当前连接状态、画质参数、重连状态、最近收到的远端文件和事件记录。

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

真实 Mac 页面级自检可自动启动本地控制端页面、打开 Edge、连接 Mac，并确认诊断条和视频画面；加 `--requireH264` 可强制要求真实 H.264/WebCodecs 画布解码成功，加 `--injectPcmAudio` 可额外注入一帧 planar PCM，验证控制端音频播放入口：
脚本会先回归画面内悬浮控制中心，确认悬浮层、摘要、画质、缩放、声音、音量、全屏和窗口按钮能同步到原工具栏与页面布局；随后会模拟适应窗口黑边输入，确认黑边移动、点击、滚轮不会发远控事件，画面内按下后移到黑边松开也能正常释放。连接成功后还会等待刷新率卡片显示数值型“实收 FPS”和“协商 Hz”，避免把请求刷新率误当成真实帧率。
只需要快速检查诊断条、悬浮控制中心和黑边输入防护时，可加 `--diagnosticsOnly`，不会连接被控端；该路径也会模拟 Mac host `runtime`，确认诊断条能显示 PID、运行时长和 build。Mac host 重启后，可再加 `--expectDiscoveryRuntimeBuildId <build-id>`，通过真实 `/discovery` 无密码验收设备列表和诊断条显示的 runtime。

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --diagnosticsOnly
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --diagnosticsOnly --host 192.168.31.122 --port 43770 --expectDiscoveryRuntimeBuildId db48055
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --host 192.168.31.122 --port 43770 --password demo-password
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --host 192.168.31.122 --port 43770 --password demo-password --requireH264
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --host 192.168.31.122 --port 43770 --password demo-password --injectPcmAudio
```

该脚本会保留浏览器 GPU/视频合成能力，避免自检环境把 WebCodecs H.264 误判为不支持；真实 Mac 192.168.31.122:43770 已验证 `avc1.420029:annexb` 解码到 1920×1080 canvas。

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
如果假 Mac 断开连接，Windows 控制端会进入“重连中”状态并自动尝试恢复；点击“断开”会停止自动重连。
模拟场景中的“输入被拒绝”可用于回归 `input_ack` 失败提示；“反控已同意 / 反控超时 / 对方向我发起反控”可用于提前联调反控状态机。
点击左侧“刷新设备”后，如果假 Mac 服务正在运行，会显示为在线设备，点击即可自动填入地址、端口和 WebSocket 连接方式。

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
