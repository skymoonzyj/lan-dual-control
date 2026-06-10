# Windows 被控端骨架

这是为后续“Mac 反控 Windows”准备的第一版 Windows 被控服务骨架。它先跑通局域网监听、协议握手、会话协商、模拟视频帧、输入事件接收和文本剪贴板确认。

## 当前内容

- Node.js WebSocket 被控服务，默认端口 `43770`。
- `hello`、`auth_request`、`session_offer`、`display_settings`、`input_event`、`clipboard_text` 和 `reverse_control_request` 消息处理。
- 模拟 `video_frame` 输出，用于未来 Mac 控制端提前验证画面渲染。
- Windows Graphics Capture 占位模块。
- WASAPI loopback 音频采集占位模块。
- SendInput 输入注入占位模块，当前只记录鼠标键盘事件，不注入系统。
- 文本剪贴板占位模块，当前只确认收到文字，不写入系统剪贴板。

## 运行

进入目录：

```powershell
cd E:\codex\lan-dual-control\apps\windows-host
```

启动：

```powershell
node .\server.mjs
```

可选参数：

```powershell
node .\server.mjs 43770 0.0.0.0
```

可选环境变量：

```powershell
$env:LAN_DUAL_HOST="0.0.0.0"
$env:LAN_DUAL_PORT="43770"
$env:LAN_DUAL_PASSWORD="demo-password"
node .\server.mjs
```

本机调试时如果 `43770` 已被假 Mac 服务占用，可以临时使用：

```powershell
node .\server.mjs 43772 127.0.0.1
```

## 下一步

1. 使用 Mac 控制端连接 `ws://Windows-IP:43770`。
2. 接入 Windows Graphics Capture，替换模拟 `video_frame`。
3. 接入 SendInput，把 `input_event` 注入 Windows。
4. 接入 WASAPI loopback，发送真实系统声音。
5. 处理 Windows 防火墙提示和局域网放行说明。
