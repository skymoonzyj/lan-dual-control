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
- 支持分辨率、刷新率、带宽、声音、剪贴板控制项。
  - 分辨率：原生、720p、900p、1080p、1440p、4K。
  - 刷新率：15、30、45、60、90、120、144 FPS。
  - 带宽：5、10、20、50、80、120、200 Mbps。
- 支持画面缩放模式：适应窗口、原始比例、拉伸填充。
- 鼠标坐标按实际视频画面区域映射，黑边区域不会误发输入。
- 支持保存连接方式、地址、端口和画质设置。
- 支持最近连接列表。
- 支持连接状态机和中文错误提示。
- 支持假 Mac 联调错误模拟：密码错误、权限不足、视频中断、连接后断开。
- 支持非手动断线后自动重连，最多重试 3 次。
- 支持 `Ctrl+V` 读取本机文字剪贴板并发送给被控端，也可接收远端 `clipboard_text` 并写入本机剪贴板。
- 支持一键反控请求编号、方向状态显示、超时回滚和对端确认。
- 支持收到对端 `reverse_control_request` 时弹出确认。
- 本地事件日志，可一键导出当前连接状态、画质参数、重连状态和事件记录。

## 运行方式

### 方式一：直接打开静态页面

```text
E:\codex\lan-dual-control\apps\windows-client\index.html
```

默认选择“本地模拟”时，不需要启动任何服务。

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

连接成功后，分辨率、刷新率、带宽、声音、剪贴板、鼠标键盘输入和一键反控按钮都会通过协议层发送消息。
假 Mac 服务还会持续发送模拟 `video_frame`，用于提前验证 Windows 端画面渲染流程。
如果假 Mac 断开连接，Windows 控制端会进入“重连中”状态并自动尝试恢复；点击“断开”会停止自动重连。
模拟场景中的“反控已同意 / 反控超时 / 对方向我发起反控”可用于提前联调反控状态机。
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
