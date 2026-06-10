# Windows 控制端原型

这是第一版 Windows 控制端壳，用于提前验证中文界面、连接状态、显示参数、声音开关、剪贴板开关和输入事件记录。

## 当前能力

- 手动输入 Mac 局域网 IP 和端口。
- 模拟 hello、auth、session_offer 握手。
- 显示模拟远程桌面画面。
- 捕获远程画面区域内的鼠标移动、点击、滚轮和键盘事件。
- 支持窗口化和全屏显示切换。
- 支持分辨率、刷新率、带宽、声音、剪贴板控制项。
- 支持一键反控按钮的请求日志。
- 本地事件日志。

## 运行方式

直接打开：

```text
E:\codex\lan-dual-control\apps\windows-client\index.html
```

或使用本地静态服务：

```powershell
node E:\codex\lan-dual-control\apps\windows-client\server.mjs 5178
```

然后访问：

```text
http://127.0.0.1:5178/
```

## 后续对接

等 Mac 端被控服务完成后，把 `app.js` 里的模拟握手替换为真实网络连接：

- hello
- auth_request
- session_offer
- video_frame
- audio_frame
- input_event
- clipboard_text
- clipboard_file_offer

