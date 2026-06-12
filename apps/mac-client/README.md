# Mac 控制端原型

这是 Mac 控制 Windows 的最小 Web 控制端原型。它先跑通 M3 反方向控制链路的控制端侧：

- 输入 Windows host 地址、端口和密码。
- 通过 `/discovery` 发现 Windows 被控端。
- 通过 WebSocket 完成 `hello`、`auth_request`、`session_offer`。
- 认证失败时显示远端返回的剩余尝试次数，并自动释放连接按钮，方便改密码后重连。
- 显示 Windows host 的 JPEG `video_frame`。
- 向 Windows host 发送鼠标移动、按钮、滚轮和键盘 `input_event`。
- 手动发送文本 `clipboard_text` 到 Windows host，并显示 `clipboard_ack` 写入结果。
- 可读取 Mac 本机文本剪贴板；用户显式开启后可监听文本变化并自动发送到 Windows host。
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
- 当前支持手动发送文本和文件剪贴板；Mac 本机文本剪贴板读取和自动监听默认关闭，需用户手动点击读取或开启监听。
- 浏览器文件选择需要用户手动授权，自动化脚本不能无提示选择本机文件。
- 键盘映射把 Mac `Command` 当作 Windows `Ctrl` 发送，方便 `Command+C/V` 控制 Windows 常用快捷键。
- 浏览器安全限制下，必须点击远程画面后才会发送键盘事件。

## 验证

```bash
node --check apps/mac-client/server.mjs
node --check apps/mac-client/app.js
```

本机联调已验证：连接 `127.0.0.1:43772` Windows host 回退服务后，发送文本剪贴板会收到 `clipboard_ack`，非 Windows 环境显示 `memory-only` 回退模式。

Mac 本机文本剪贴板已纳入页面级自检：脚本会授权浏览器剪贴板、写入临时文本、点击“读取 Mac 剪贴板”并发送，再开启监听后写入新文本，确认自动发送收到 `clipboard_ack`。断开连接时监听会自动停止。

音频入口本机联调已验证：打开“播放远端声音”后，Windows host mock 音频帧会开始接收并更新状态；真实 PCM 播放需要在 Windows 机器上用 `pcm-f32le-base64` 音频设备继续验收。

文件剪贴板入口本机联调已验证：页面显示文件选择和发送入口，未选择文件时不会误发送；`scripts/windows/test-mac-client-browser.mjs` 会用浏览器调试协议注入临时小文件并等待 `clipboard_file_result`。在 Windows 上默认要求系统文件剪贴板 `saveMode=clipboard`，在 Mac/Linux 开发环境可加 `--allowClipboardFallback --mockVideo` 验证 `saveMode=temp` 回退链路。

认证失败路径已固化到页面级自检：`scripts/windows/test-mac-client-browser.mjs --expectAuthFailure --expectedAttemptsRemaining 2 --expectedMaxAttempts 3` 会启动正确密码的临时 Windows host，并让 Mac 控制端填错密码，断言页面最终保留 `认证失败 · 剩余 2/3 次`。
