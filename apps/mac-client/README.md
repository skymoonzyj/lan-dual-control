# Mac 控制端原型

这是 Mac 控制 Windows 的最小 Web 控制端原型。它先跑通 M3 反方向控制链路的控制端侧：

- 输入 Windows host 地址、端口和密码。
- 通过 `/discovery` 发现 Windows 被控端。
- 通过 WebSocket 完成 `hello`、`auth_request`、`session_offer`。
- 显示 Windows host 的 JPEG `video_frame`。
- 向 Windows host 发送鼠标移动、按钮、滚轮和键盘 `input_event`。
- 手动发送文本 `clipboard_text` 到 Windows host，并显示 `clipboard_ack` 写入结果。
- 手动选择文件并按 `clipboard_file_*` 分块发送到 Windows host。
- 可手动开启远端声音，播放 `pcm-f32le-base64` PCM `audio_frame`，mock 音频帧只显示状态。
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
- 音频播放当前只覆盖 PCM 过渡格式；真实 Windows 系统声音需要 Windows host 配置 DirectShow loopback/虚拟声卡或后续 WASAPI loopback 后再端到端验收。
- 当前支持手动发送文本和文件剪贴板；自动监听 Mac 本机剪贴板后续再接。
- 浏览器文件选择需要用户手动授权，自动化脚本不能无提示选择本机文件。
- 键盘映射把 Mac `Command` 当作 Windows `Ctrl` 发送，方便 `Command+C/V` 控制 Windows 常用快捷键。
- 浏览器安全限制下，必须点击远程画面后才会发送键盘事件。

## 验证

```bash
node --check apps/mac-client/server.mjs
node --check apps/mac-client/app.js
```

本机联调已验证：连接 `127.0.0.1:43772` Windows host 回退服务后，发送文本剪贴板会收到 `clipboard_ack`，非 Windows 环境显示 `memory-only` 回退模式。

音频入口本机联调已验证：打开“播放远端声音”后，Windows host mock 音频帧会开始接收并更新状态；真实 PCM 播放需要在 Windows 机器上用 `pcm-f32le-base64` 音频设备继续验收。

文件剪贴板入口本机联调已验证：页面显示文件选择和发送入口，未选择文件时不会误发送；真实文件写入 Windows 系统文件剪贴板需要在 Windows host 上手动选择小文件继续验收。
