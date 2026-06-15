# Mac 控制端原型

这是 Mac 控制 Windows 的最小 Web 控制端原型。它先跑通 M3 反方向控制链路的控制端侧：

- 输入 Windows host 地址、端口和密码。
- 点击发现时会锁定发现按钮，避免重复 `/discovery` 请求互相覆盖状态。
- 未连接、连接中或自动重连等待时修改地址或端口会取消仍在进行的发现/连接/重连请求，并清理旧远端摘要和 runtime，避免把上一台 Windows host 的发现结果误当成新目标；已连接后修改地址不会打断当前会话，只在下次连接生效。
- 点击连接后会立即锁定连接按钮、启用断开按钮，避免重复发起连接；连接中点击断开会取消仍在进行的发现/连接尝试。
- 成功连接后保存最近连接，供下次一键回填，也可一键清空；只保存 host、port 和时间，不保存密码。
- 通过 `/discovery` 发现 Windows 被控端。
- 通过 WebSocket 完成 `hello`、`auth_request`、`session_offer`。
- 认证失败时显示远端返回的剩余尝试次数，清理远程画面、远端摘要、音频状态、会话诊断和远端运行信息，并自动释放连接按钮，方便改密码后重连。
- 意外断线后最多自动重连 3 次，并会在等待重连时清理上一帧远程画面、音频状态和远端运行信息，远端摘要显示“连接中断”；手动断开和认证失败不会自动重连。
- 手动断开会停止剪贴板监听、取消正在发送的文件、关闭音频播放、清理上一帧远程画面，并把远端摘要、音频状态、会话诊断和远端运行信息重置为未就绪状态。
- 显示 Windows host 的 `video_frame`；浏览器支持 WebCodecs 时会优先请求 `h264` / `annexb` 并渲染到 canvas，不支持或连续解码失败时自动请求 MJPEG/JPEG 兜底；二进制视频默认开启，H.264 会声明 `preferredVideoTransport=binary-h264`，JPEG/MJPEG 会声明 `binary-jpeg`，Windows host 支持时可用 WebSocket 二进制帧传输，减少 base64 文本开销；收到 `video_frame.timestamp` 时，视频状态和会话诊断会显示帧到达年龄或时钟偏差；收到 Windows WGC `repeatPreviousFrame` 轻量重复帧时会保持上一帧画面并显示重复计数。
- 支持画质、分辨率、刷新率和码率设置，当前可选 1080P/2K/4K、30/60/120/144/240 Hz、5/10/15/20/40/50 Mbps；成功连接后修改会立即发送 `display_settings`。
- 向 Windows host 发送鼠标移动、按钮、滚轮和键盘 `input_event`；Mac `Command` 会按 Windows `Ctrl` 发送，方便常用快捷键。
- 手动发送文本 `clipboard_text` 到 Windows host，并显示 `clipboard_ack` 写入结果。
- 文字发送按钮仅在已连接且文本非空时可用，避免未连接或空内容误点。
- 可读取 Mac 本机文本剪贴板；用户显式开启后可监听文本变化并自动发送到 Windows host。
- 手动选择文件并按 `clipboard_file_*` 分块发送到 Windows host。
- 文件发送按钮仅在已连接且已选文件时可用，发送中和断开后会禁用。
- 可手动开启远端声音，播放 `pcm-f32le-base64` PCM `audio_frame`，mock 音频帧只显示状态；关闭再重新开启音频会立即清理旧状态并等待新音频帧。
- 显示会话诊断：首帧耗时、视频持续 FPS/最大帧间隔、音频首帧/播放计数、自动重连次数和 Windows host 可选 runtime/build 信息。
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

## 真连前预检

Mac 控制真实 Windows host 前，先做只读预检：

```bash
node scripts/mac/check-mac-client-readiness.mjs --checkBoard --boardSummary
```

如果 Windows host 已经启动，把地址也带上：

```bash
node scripts/mac/check-mac-client-readiness.mjs --host <Windows IP> --port 43770 --checkBoard --boardSummary
```

该脚本不会启动 Mac client、不会启动或认证 Windows host、不会要求或打印密码、不会发送输入事件。它只检查 repo、Mac client 静态文件和语法、可选本地 Mac client HTTP 页面、可选 Windows host `/discovery` 及 Agent Link Board，并输出可直接发到通讯板的无密摘要。需要机器可读结果时加 `--json`；本地页面已启动时可加 `--probeClientServer`；正式要求目标 Windows host 在线时可加 `--requireWindowsHost`。

正式做 Mac 控制 Windows 真连观感验收前，可跑更严格的清单：

```bash
node scripts/mac/check-mac-client-formal-status.mjs --host <Windows IP> --port 43770 --boardSummary
```

该清单会复用 readiness，并把 repo 干净、本地 Mac client 页面在线、Windows host `/discovery` 在线、通讯板可读、H.264/音频/输入/剪贴板能力可见整理成 `readyToCall`、`callText` 和 `boardSummary`。它仍然只读：不会认证 WebSocket、不会要求或打印密码、不会发送输入，也不会执行 `inject`。

## 当前限制

- 这是 Web 原型，不是 SwiftUI/原生桌面窗口。
- H.264 当前使用浏览器 WebCodecs 解码；不支持 WebCodecs 或不支持当前 `codecString` 的浏览器会自动请求 MJPEG/JPEG。Windows host 的 `ffmpeg-h264` 模式已能在收到 `preferredVideoCodec=mjpeg` 或 `preferredVideoEncoding=data-url` 后切回 JPEG 输出，避免页面无画面；Windows 本机页面级 `--requireH264Video` 已验证 H.264 canvas 解码可见，`--expectBinaryH264Video` 已验证 H.264 Annex B payload 可走 WebSocket 二进制帧，真机 Mac 控制真实 Windows host 的观感仍需继续验收。
- 画质设置已能请求 60 Hz；Windows host FFmpeg gdigrab 本机观察 60 Hz 请求约 56 FPS，但真实 Mac 控制 Windows 的观感仍需真机确认。
- 音频播放当前覆盖 PCM 过渡格式；真实 Windows 系统声音已可通过 Windows host WASAPI loopback 做页面级自检，真实听感还需要 Mac 真机连接 Windows host 继续确认。
- 当前支持手动发送文本和文件剪贴板；Mac 本机文本剪贴板读取和自动监听默认关闭，需用户手动点击读取或开启监听。
- 最近连接只写入浏览器 localStorage 的地址、端口和时间，不保存连接密码；“清空”只删除最近连接，不影响密码输入框。
- 自动重连复用当前页面里的 host、port 和密码输入值；如果用户改了连接参数或点击手动断开，会停止本轮重连。
- 浏览器文件选择需要用户手动授权，自动化脚本不能无提示选择本机文件。
- 键盘映射把 Mac `Command` 当作 Windows `Ctrl` 发送，方便 `Command+C/V` 控制 Windows 常用快捷键；页面会在远控画面提示该映射，发送快捷键时输入状态和日志也会显示 `Command→Ctrl`。
- 浏览器安全限制下，必须点击远程画面后才会发送键盘事件。

## 验证

```bash
node --check apps/mac-client/server.mjs
node --check apps/mac-client/app.js
node scripts/mac/test-mac-client-readiness.mjs
node scripts/mac/test-mac-client-formal-status.mjs
```

本机联调已验证：连接 `127.0.0.1:43772` Windows host 回退服务后，发送文本剪贴板会收到 `clipboard_ack`，非 Windows 环境显示 `memory-only` 回退模式。

Mac 本机文本剪贴板已纳入页面级自检：脚本会断言未连接/空文本时“发送文字”禁用，连接后填入临时文本再确认按钮启用并发送；还会授权浏览器剪贴板、写入临时文本、点击“读取 Mac 剪贴板”并确认按钮可用，再发送并等待 `clipboard_ack`。自检会继续开启监听，写入新文本后确认自动发送收到 `clipboard_ack`。断开连接时监听会自动停止，文字/文件发送按钮都会回到禁用态。页面级自检也会先确认“发现”按钮在 `/discovery` 请求中锁定并恢复，再在连接发起后确认“连接”按钮立刻禁用、“断开”按钮可用，并验证连接中点击断开不会继续建立 WebSocket，防止重复连接或误连接。

最近连接已纳入页面级自检：成功协商后确认页面保存当前 host/port、localStorage 不包含连接密码，验证选择最近连接可回填地址和端口，再点击“清空”确认 localStorage 删除该记录且下拉框禁用。

视频参数已纳入页面级自检：脚本会确认默认 `session_offer` 请求 1080P / 60 Hz / 20 Mbps，并根据浏览器能力断言支持 WebCodecs 时请求 `preferredVideoCodec=h264` / `preferredVideoEncoding=annexb` / `preferredVideoTransport=binary-h264`，禁用 WebCodecs 时请求 `mjpeg` / `data-url` / `binary-jpeg` 兜底；同时断言 `supportedVideoTransports` 会随 `session_offer`、`display_settings` 一起发送并包含 `json`、`binary-jpeg`、`binary-h264`。页面 URL 带 `?binaryVideo=0` 或自检加 `--disableBinaryVideo` 时，只声明 `json` 并回归 H.264 JSON/base64 兼容路径；切换到高清预设后，脚本会断言页面发送 2K / 60 Hz / 40 Mbps 的 `display_settings` 且保留对应视频编码和传输偏好，并收到 `display_settings_ack`；如果启用了持续视频观察，还会继续要求切换后收到新的视频帧，且最后一帧尺寸、编码和传输方式与新设置一致。

持续视频体验也可量化：脚本加 `--observeVideoMs <毫秒>` 会在连接后统计短窗口内收到的 `video_frame` 数和实收 FPS；加 `--minObservedVideoFrames <帧数>` 或 `--minObservedVideoFps <FPS>` 可把持续来帧能力变成强校验。

会话诊断面板已纳入页面级自检：连接成功并出现首帧后，脚本会断言“首帧”和“视频流”指标已从等待状态更新，并在对端提供 `video_frame.timestamp` 时断言视频状态和诊断行显示“到达 <ms>”或“时钟偏差”；视频表面可以是 JPEG `<img>` 或 H.264 `<canvas>`，自检会统一识别；加 `--requireH264Video` 时，脚本会启动 `ffmpeg-h264` host 并要求页面显示 H.264 canvas，不允许回退 JPEG；加 `--expectBinaryH264Video` 时，脚本会要求页面收到 `binary-h264` 帧并保持 H.264 canvas 可见；加 `--expectBinaryVideo` 时，脚本会启动 WGC JPEG helper 并要求页面收到 `binary-jpeg` 视频帧、保持画面可见且诊断显示“二进制”；加 `--disableBinaryVideo` 时，脚本会用 `?binaryVideo=0` 关闭二进制视频并要求旧 JSON/base64 路径仍可显示；加 `--expectRepeatSignalVideo` 时，脚本会启动 WGC mock helper 并要求 `repeatPreviousFrame` 轻量重复帧保持画面可见且诊断显示“重复”；加 `--expectH264Fallback` 时，脚本会显式模拟 H.264 配置不支持，要求页面发送 MJPEG/JPEG fallback 请求并最终显示 `jpeg` 画面；临时 Windows host 也会断言 runtime 里显示 PID 和测试 build id，音频验收时也会断言音频诊断显示已接收帧；自检末尾会点击“断开”，确认连接状态、视频表面、音频状态和诊断指标回到干净初始态。

真实 WGC NV12 H.264 页面链路也可用同一个自检覆盖：加 `--expectWgcNv12H264Video` 时，脚本会启动真实 WGC helper、启用 NV12 H.264 bridge 和 `h264_nvenc`，要求页面收到 `binary-h264`、显示 H.264 canvas，并断言 session pipeline 为 `windows-wgc-helper-nv12-ffmpeg-h264`。

视频传输矩阵已封装成 `scripts/windows/test-mac-client-video-transports.mjs`：它会顺序跑 `binary-h264`、H.264 JSON/base64 兼容路径、H.264 unsupported fallback 和 `binary-jpeg` 四组页面自检，并自动分配独立 host/client/debug 端口，避免并发抢端口。视频传输、H.264、fallback 或 binary frame 相关改动后优先跑这个脚本；本轮 Windows 本机矩阵 4/4 通过。

快捷键映射已纳入页面级自检：脚本会模拟 `Command+C`，拦截页面发出的 `input_event`，断言发往 Windows 的 `ctrlKey=true`、`metaKey=false`，同时保留 `localMetaKey=true` 便于诊断。

音频入口本机联调已验证：打开“播放远端声音”后，Windows host mock 音频帧会开始接收并更新状态；Windows 端可运行 `scripts/windows/test-mac-client-browser.mjs --requireAudio` 临时启用 WASAPI loopback，断言页面收到 `pcm-f32le-base64` 并出现播放计数。

Mac client 页面级自检可加 `--enableAudio --expectAudioFrame` 验证音频请求和 audio_frame 接收，脚本会打印首条音频帧耗时，并在对端提供 `audio_frame.timestamp` 时断言顶部音频状态和播放状态显示“到达 <ms>”或“时钟偏差”；音频开关关闭/重新开启后顶部状态会从“未开启”回到“未接收”。加 `--maxAudioFrameMs <毫秒>` 可把首条音频帧耗时变成强校验。在 Windows 本机临时启动 WASAPI host 验收时，可加 `--audioMode wasapi --expectAudioPayload --expectAudioPlayback --maxAudioPlaybackMs <毫秒>`；连接已运行的真实 Windows WASAPI host 时，可加 `--useExistingHost --host <Windows IP> --port <端口> --enableAudio --expectAudioPayload --expectAudioPlayback --maxAudioFrameMs <毫秒> --maxAudioPlaybackMs <毫秒>`，要求收到带 PCM payload 的音频帧并确认页面播放计数递增。

文件剪贴板入口本机联调已验证：页面显示文件选择和发送入口，未连接/未选择文件/发送中都会禁用发送按钮，超过 32MB 上限时会直接显示“文件过大”并禁用发送；`scripts/windows/test-mac-client-browser.mjs` 会用浏览器调试协议注入临时小文件并等待 `clipboard_file_result`。自检还会模拟超限文件选择、对端拒绝文件清单和文件读取中点击断开，确认页面取消当前文件发送且不会继续发出 `clipboard_file_complete`；取消后迟到的旧 `clipboard_file_*` 消息也不会覆盖当前状态。在 Windows 上默认要求系统文件剪贴板 `saveMode=clipboard`，在 Mac/Linux 开发环境可加 `--allowClipboardFallback --mockVideo` 验证 `saveMode=temp` 回退链路。

认证失败路径已固化到页面级自检：`scripts/windows/test-mac-client-browser.mjs --expectAuthFailure --expectedAttemptsRemaining 2 --expectedMaxAttempts 3` 会启动正确密码的临时 Windows host，并让 Mac 控制端填错密码，断言页面最终保留 `认证失败 · 剩余 2/3 次`，连接按钮可重试，远端摘要回到“等待发现”，视频表面回到“无画面”，且远端运行信息回到“未提供”。

意外断线自动重连可用 `scripts/windows/test-mac-client-browser.mjs --expectReconnect --mockVideo --allowClipboardFallback --skipFileClipboard --timeoutMs 45000` 做页面级自检：脚本会连接临时 Windows host，杀掉 host 等页面进入自动重连状态，确认远端摘要显示“连接中断”、旧画面已清理且剪贴板发送入口禁用，再用同一端口重启 host 并要求页面恢复到“已连接”。

体验耗时指标也已纳入页面级自检：脚本会打印首次视频可见耗时；加 `--maxInitialVideoMs <毫秒>` 可把首帧耗时变成强校验。搭配 `--expectReconnect` 时还会打印意外断线到恢复画面的总耗时；加 `--maxReconnectRestoreMs <毫秒>` 可强制要求自动恢复不超过指定阈值。
