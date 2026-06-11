# Mac 控制端原型

这是 Mac 控制 Windows 的最小 Web 控制端原型。它先跑通 M3 反方向控制链路的控制端侧：

- 输入 Windows host 地址、端口和密码。
- 通过 `/discovery` 发现 Windows 被控端。
- 通过 WebSocket 完成 `hello`、`auth_request`、`session_offer`。
- 显示 Windows host 的 JPEG `video_frame`。
- 向 Windows host 发送鼠标移动、按钮、滚轮和键盘 `input_event`。
- 显示 `input_ack`、视频帧和连接日志。

## 运行

在 Mac 上启动控制端页面：

```bash
cd apps/mac-client
node server.mjs
```

打开：

```text
http://127.0.0.1:5188/
```

本机联调时，如果不想占用真实 Mac host 的 `43770`，可以在另一个终端启动 Windows host 的 mock/回退服务：

```bash
cd apps/windows-host
LAN_DUAL_PORT=43772 LAN_DUAL_HOST=127.0.0.1 LAN_DUAL_WINDOWS_INPUT_MODE=log node server.mjs
```

然后 Mac 控制端填写：

```text
地址：127.0.0.1
端口：43772
密码：demo-password
```

真实 Windows 联调时，Windows 端运行 `apps/windows-host`，Mac 控制端填写 Windows 局域网 IP 和端口 `43770`。

## 当前限制

- 这是 Web 原型，不是 SwiftUI/原生桌面窗口。
- 目前只显示 JPEG/data-url 视频帧；后续再接 H.264/WebCodecs 或原生解码。
- 音频帧只显示状态，尚未播放 Windows host 音频。
- 键盘映射把 Mac `Command` 当作 Windows `Ctrl` 发送，方便 `Command+C/V` 控制 Windows 常用快捷键。
- 浏览器安全限制下，必须点击远程画面后才会发送键盘事件。

## 验证

```bash
node --check apps/mac-client/server.mjs
node --check apps/mac-client/app.js
```
