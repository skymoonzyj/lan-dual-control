# Mac 控制端原型

这是 Mac 控制 Windows 的最小 Web 控制端原型。它先跑通 M3 反方向控制链路的控制端侧：

- 输入 Windows host 地址、端口和密码。
- 点击发现时会锁定发现按钮，避免重复 `/discovery` 请求互相覆盖状态。
- 点击连接后会立即锁定连接按钮、启用断开按钮，避免重复发起连接；连接中点击断开会取消仍在进行的发现/连接尝试。
- 成功连接后保存最近连接，供下次一键回填，也可一键清空；只保存 host、port 和时间，不保存密码。
- 通过 `/discovery` 发现 Windows 被控端。
- 通过 WebSocket 完成 `hello`、`auth_request`、`session_offer`。
- 认证失败时显示远端返回的剩余尝试次数，清理远程画面，并自动释放连接按钮，方便改密码后重连。
- 意外断线后最多自动重连 3 次，并会在等待重连时清理上一帧远程画面；手动断开和认证失败不会自动重连。
- 手动断开会停止剪贴板监听、取消正在发送的文件、关闭音频播放、清理上一帧远程画面，并把会话诊断重置为未就绪状态。
- 显示 Windows host 的 JPEG `video_frame`。
- 支持画质、分辨率、刷新率和码率设置，当前可选 1080P/2K/4K、30/60/120/144/240 Hz、5/10/15/20/40/50 Mbps；成功连接后修改会立即发送 `display_settings`。
- 向 Windows host 发送鼠标移动、按钮、滚轮和键盘 `input_event`；Mac `Command` 会按 Windows `Ctrl` 发送，方便常用快捷键。
- 手动发送文本 `clipboard_text` 到 Windows host，并显示 `clipboard_ack` 写入结果。
- 文字发送按钮仅在已连接且文本非空时可用，避免未连接或空内容误点。
- 可读取 Mac 本机文本剪贴板；用户显式开启后可监听文本变化并自动发送到 Windows host。
- 手动选择文件并按 `clipboard_file_*` 分块发送到 Windows host。
- 文件发送按钮仅在已连接且已选文件时可用，发送中和断开后会禁用。
- 可手动开启远端声音，播放 `pcm-f32le-base64` PCM `audio_frame`，mock 音频帧只显示状态。
- 显示会话诊断：首帧耗时、视频持续 FPS/最大帧间隔、音频首帧/播放计数和自动重连次数。
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
```

本机联调已验证：连接 `127.0.0.1:43772` Windows host 回退服务后，发送文本剪贴板会收到 `clipboard_ack`，非 Windows 环境显示 `memory-only` 回退模式。

Mac 本机文本剪贴板已纳入页面级自检：脚本会断言未连接/空文本时“发送文字”禁用，连接后填入临时文本再确认按钮启用并发送；还会授权浏览器剪贴板、写入临时文本、点击“读取 Mac 剪贴板”并确认按钮可用，再发送并等待 `clipboard_ack`。自检会继续开启监听，写入新文本后确认自动发送收到 `clipboard_ack`。断开连接时监听会自动停止，文字/文件发送按钮都会回到禁用态。页面级自检也会先确认“发现”按钮在 `/discovery` 请求中锁定并恢复，再在连接发起后确认“连接”按钮立刻禁用、“断开”按钮可用，并验证连接中点击断开不会继续建立 WebSocket，防止重复连接或误连接。

最近连接已纳入页面级自检：成功协商后确认页面保存当前 host/port、localStorage 不包含连接密码，验证选择最近连接可回填地址和端口，再点击“清空”确认 localStorage 删除该记录且下拉框禁用。

视频参数已纳入页面级自检：脚本会确认默认 `session_offer` 请求 1080P / 60 Hz / 20 Mbps，并切换到高清预设，断言页面发送 2K / 60 Hz / 40 Mbps 的 `display_settings` 且收到 `display_settings_ack`。

持续视频体验也可量化：脚本加 `--observeVideoMs <毫秒>` 会在连接后统计短窗口内收到的 `video_frame` 数和实收 FPS；加 `--minObservedVideoFrames <帧数>` 或 `--minObservedVideoFps <FPS>` 可把持续来帧能力变成强校验。

会话诊断面板已纳入页面级自检：连接成功并出现首帧后，脚本会断言“首帧”和“视频流”指标已从等待状态更新，音频验收时也会断言音频诊断显示已接收帧；自检末尾会点击“断开”，确认连接状态、视频表面和诊断指标回到干净初始态。

快捷键映射已纳入页面级自检：脚本会模拟 `Command+C`，拦截页面发出的 `input_event`，断言发往 Windows 的 `ctrlKey=true`、`metaKey=false`，同时保留 `localMetaKey=true` 便于诊断。

音频入口本机联调已验证：打开“播放远端声音”后，Windows host mock 音频帧会开始接收并更新状态；Windows 端可运行 `scripts/windows/test-mac-client-browser.mjs --requireAudio` 临时启用 WASAPI loopback，断言页面收到 `pcm-f32le-base64` 并出现播放计数。

Mac client 页面级自检可加 `--enableAudio --expectAudioFrame` 验证音频请求和 audio_frame 接收，脚本会打印首条音频帧耗时；加 `--maxAudioFrameMs <毫秒>` 可把它变成强校验。在 Windows 本机临时启动 WASAPI host 验收时，可加 `--audioMode wasapi --expectAudioPayload --expectAudioPlayback --maxAudioPlaybackMs <毫秒>`；连接已运行的真实 Windows WASAPI host 时，可加 `--useExistingHost --host <Windows IP> --port <端口> --enableAudio --expectAudioPayload --expectAudioPlayback --maxAudioFrameMs <毫秒> --maxAudioPlaybackMs <毫秒>`，要求收到带 PCM payload 的音频帧并确认页面播放计数递增。

文件剪贴板入口本机联调已验证：页面显示文件选择和发送入口，未连接/未选择文件/发送中都会禁用发送按钮；`scripts/windows/test-mac-client-browser.mjs` 会用浏览器调试协议注入临时小文件并等待 `clipboard_file_result`。自检还会模拟文件读取中点击断开，确认页面取消当前文件发送且不会继续发出 `clipboard_file_complete`。在 Windows 上默认要求系统文件剪贴板 `saveMode=clipboard`，在 Mac/Linux 开发环境可加 `--allowClipboardFallback --mockVideo` 验证 `saveMode=temp` 回退链路。

认证失败路径已固化到页面级自检：`scripts/windows/test-mac-client-browser.mjs --expectAuthFailure --expectedAttemptsRemaining 2 --expectedMaxAttempts 3` 会启动正确密码的临时 Windows host，并让 Mac 控制端填错密码，断言页面最终保留 `认证失败 · 剩余 2/3 次`，连接按钮可重试，且视频表面回到“无画面”。

意外断线自动重连可用 `scripts/windows/test-mac-client-browser.mjs --expectReconnect --mockVideo --allowClipboardFallback --skipFileClipboard --timeoutMs 45000` 做页面级自检：脚本会连接临时 Windows host，杀掉 host 等页面进入自动重连状态，再用同一端口重启 host 并要求页面恢复到“已连接”。

体验耗时指标也已纳入页面级自检：脚本会打印首次视频可见耗时；加 `--maxInitialVideoMs <毫秒>` 可把首帧耗时变成强校验。搭配 `--expectReconnect` 时还会打印意外断线到恢复画面的总耗时；加 `--maxReconnectRestoreMs <毫秒>` 可强制要求自动恢复不超过指定阈值。
