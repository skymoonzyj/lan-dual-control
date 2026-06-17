# 局域网 Codex 联络板

用途：让 Windows 端和 Mac 端在同一个局域网里及时互相喊话、记录测试呼叫、更新在线状态。

这个工具不经过公网服务器。一台设备启动服务，两台设备都用浏览器打开同一个局域网地址。

## Windows 启动

在项目根目录运行：

```powershell
scripts\windows\start-codex-link.ps1
```

启动后会显示本机地址和局域网地址。Mac 端打开类似下面的地址：

```text
http://192.168.1.x:17888
```

## Mac 启动

在项目根目录运行：

```bash
node scripts/codex-link-server.mjs --host 0.0.0.0 --port 17888
```

Windows 端打开 Mac 的局域网地址：

```text
http://192.168.1.x:17888
```

## 使用方式

- “我的状态”：告诉对方自己在线、测试中、等待、阻塞或离开。
- “发消息”：发普通文字消息。
- “测试呼叫”：发起一轮需要另一端配合的联调。
- “当前呼叫”：两端共同看到最新测试请求。
- “授权提醒”：在浏览器里开启声音/桌面提醒后，联络板会突出显示需要用户处理、502/Bad Gateway、权限/授权阻塞和长时间未更新状态。

网页本身是实时刷新的：打开页面后，它会通过浏览器的实时事件连接接收服务端推送，不需要手动刷新。

## 授权和卡住提醒

如果一端遇到需要用户处理的弹窗、系统授权、502/Bad Gateway、权限缺失或长时间卡住，必须在联络板发一条带高优先级关键词的消息。推荐格式：

```text
NEED_USER_AUTH: <需要用户做什么>。位置/步骤：<具体路径>。处理后请回复 <如何确认>。
```

也可以使用这些关键词：

```text
USER_ACTION_REQUIRED
BLOCKED_BY_PERMISSION
AUTHORIZATION_REQUIRED
PERMISSION_REQUIRED
LAN008
ReverseGrant
allow-windows-reverse-control
502
Bad Gateway
Gateway Timeout
```

Windows 浏览器打开联络板后，点击“开启声音/桌面提醒”，以后这些消息会触发顶部红色提醒、标题闪烁、提示音和浏览器桌面通知。页面也会把 `coding`、`testing`、`waiting`、`ready` 状态超过阈值未更新的设备标红，默认阈值 5 分钟，可在页面里调整。

如果希望 Windows 即使没有盯着浏览器也能弹窗提醒 Mac 侧异常，可以启动本机 watcher。它只读取联络板状态，不会发送密码或密钥：

```powershell
scripts\windows\start-mac-alert-watcher.ps1 -Server http://192.168.1.x:17888
```

启动器会优先使用 PowerShell 7 `pwsh`，找不到时再回退 Windows PowerShell。它会把日志写到 `.dev-lab/mac-alert-watcher.*.log`，并用 `.dev-lab/mac-alert-watcher.pid` 防止重复启动，适合把 Mac 窗口最小化后继续让 Windows 本机弹窗提醒授权、权限、502、blocked、长时间无更新、Mac 反控请求被 `LAN008` 拒绝后等待 Windows `ReverseGrant` 临时授权，或 Mac Codex 发给 Windows Codex/Windows host 的当前测试呼叫。

查看、停止或重启后台 watcher：

```powershell
scripts\windows\start-mac-alert-watcher.ps1 -Server http://192.168.1.x:17888 -Status
scripts\windows\start-mac-alert-watcher.ps1 -Server http://192.168.1.x:17888 -Stop
scripts\windows\start-mac-alert-watcher.ps1 -Server http://192.168.1.x:17888 -Restart
```

脚本或桌面壳需要机器读取时，在上述命令后加 `-Json`。`-Status -Json`、`-Stop -Json` 和启动/重复启动路径都会输出单个 JSON 对象，包含 `action`、`running`、`processIds`、日志路径和 `message`；不会回显 token。

需要前台调试时直接运行：

```powershell
scripts\windows\watch-codex-link-mac-alerts.ps1 -Server http://192.168.1.x:17888
```

需要只验证规则、不弹窗不响铃时：

```powershell
scripts\windows\watch-codex-link-mac-alerts.ps1 -Server http://192.168.1.x:17888 -Once -NoPopup -AlertExistingEvents
node scripts\windows\test-mac-alert-watcher.mjs --timeoutMs 20000
```

`test-mac-alert-watcher` 会用本机假联络板覆盖 Mac 授权/权限/502/反控授权等待/blocked/stale 提醒，以及 Mac -> Windows active `currentCall` 提醒和完成呼叫忽略规则。

如果联络板启用了令牌，可以加 `-Token`；不要把令牌贴到联络板消息或项目文档里。

## Codex 命令行收发

两边 Codex 不一定一直盯着浏览器，所以也提供命令行客户端。

查看当前状态：

```powershell
node scripts/codex-link-client.mjs --server http://192.168.1.x:17888 state
```

实时监控新消息和测试呼叫：

```powershell
node scripts/codex-link-client.mjs --server http://192.168.1.x:17888 watch
```

只看一眼然后退出，适合 Codex 开工前检查：

```powershell
node scripts/codex-link-client.mjs --server http://192.168.1.x:17888 watch --once
```

发送普通消息：

```powershell
node scripts/codex-link-client.mjs --server http://192.168.1.x:17888 send --from "Windows Codex" --text "我准备开始连接真实 Mac。"
```

更新自己的状态：

```powershell
node scripts/codex-link-client.mjs --server http://192.168.1.x:17888 status --device "Windows Codex" --role "Windows 端" --status testing --note "正在跑首帧验证"
```

发起测试呼叫：

```powershell
node scripts/codex-link-client.mjs --server http://192.168.1.x:17888 call --from "Windows Codex" --need "Mac Codex" --goal "验证真实 JPEG 首帧" --connection "Mac IP 192.168.1.x，端口 17654" --command "scripts/windows/test-mac-host.ps1 -HostName 192.168.1.x -RequireRealVideo -ExpectInputMode log" --ask "请启动 apps/mac-host，并确认屏幕录制权限已开启。"
```

清除当前呼叫：

```powershell
node scripts/codex-link-client.mjs --server http://192.168.1.x:17888 clear-call
```

Mac 端也用同一个客户端，只是命令写法换成 Bash：

```bash
node scripts/codex-link-client.mjs --server http://192.168.1.x:17888 send --from "Mac Codex" --text "mac-host 已启动，等待 Windows 连接。"
```

## 建议流程

1. 开工时，两端都打开联络板并更新自己的状态。
2. 一方要测试时，填写“测试呼叫”。
3. 另一方看到后把状态改成 `READY` 或 `TESTING`。
4. 测试完成后，把呼叫状态改成 `DONE`。
5. 卡住时，把呼叫状态改成 `BLOCKED`，并写清楚需要对方做什么。

## 安全说明

默认不启用密码，适合可信局域网短时间使用。

需要加令牌时，启动时传入：

```powershell
scripts\windows\start-codex-link.ps1 -Token "自己设一个临时令牌"
```

或在 Mac 上运行：

```bash
node scripts/codex-link-server.mjs --host 0.0.0.0 --port 17888 --token "自己设一个临时令牌"
```

第一次打开网页时，在地址后面加：

```text
?token=自己设的临时令牌
```

不要把令牌、连接密码、系统账号密码写进项目文档。

命令行客户端使用令牌时，加上：

```powershell
node scripts/codex-link-client.mjs --server http://192.168.1.x:17888 --token "自己设的临时令牌" state
```

## 数据保存

联络板会把状态保存到：

```text
.dev-lab/codex-link-state.json
```

这个文件只用于本地联调，不需要提交到仓库。
