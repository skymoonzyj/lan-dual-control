# 双端测试联络规则

最后更新：2026-06-12

用途：当一方正在测试，需要另一方及时配合时，用这个文件记录“正在呼叫谁、需要什么、当前卡在哪里”。真正的即时提醒建议通过微信、飞书、钉钉、Telegram 或 GitHub Issue 通知人；这个文件负责保留项目内的事实记录。

## 最推荐的联络方式

1. 人类即时消息负责提醒。
   - 例如：在微信或飞书发一句“Mac Codex 需要 Windows 端配合，看 `docs/TEST_COORDINATION.md` 最新呼叫”。
   - Codex 本身不会自动收到另一台机器的本地文件变化，所以要有人或外部通知把另一端叫醒。

2. 同一局域网内可以使用项目自带的联络板。
   - 启动方式见 `docs/LAN_CODEX_LINK.md`。
   - 一台设备启动服务，两台设备都打开同一个网页。
   - 适合实时发消息、更新在线状态和发起测试呼叫。
   - Codex 可以用 `scripts/codex-link-client.mjs watch` 监控消息，用 `send/status/call` 给联络板发送信息。

3. GitHub Issue 负责跨设备提醒。
   - 开一个固定 Issue，例如：`Test coordination / 双端联调呼叫`。
   - 测试方在 Issue 评论里贴同一份呼叫内容。
   - 另一台机器收到 GitHub 通知后，让对应 Codex 拉最新代码并查看本文件。

4. 本文件负责沉淀当前事实。
   - 谁在测试。
   - 需要哪一端配合。
   - 当前 IP、端口、输入模式、测试命令。
   - 是否阻塞。
   - 下一步由谁做。

## 呼叫状态

| 状态 | 含义 |
| --- | --- |
| `CALLING` | 一方正在呼叫另一方配合测试 |
| `READY` | 被呼叫方已准备好 |
| `TESTING` | 双方正在联调 |
| `BLOCKED` | 测试阻塞，需要另一方处理 |
| `DONE` | 本轮测试完成 |
| `CANCELLED` | 本轮测试取消 |

## 呼叫模板

把最新一条放在“当前呼叫”里，完成后移动到“历史记录”。

```text
状态：
发起端：
需要配合端：
开始时间：
目标：
测试环境：
连接信息：
测试命令：
期望现象：
当前现象：
阻塞点：
需要对方做什么：
超时时间：
下一步负责人：
```

## 当前呼叫

状态：DONE
发起端：Windows Codex
需要配合端：Mac Codex
开始时间：2026-06-12
目标：拉取 `d63c4e3` 后验证 Mac H.264 流式视频链路
测试环境：真实 macOS 被控端，本机探针强校验
连接信息：Mac 端口 43770，不在文档中写密码
测试命令：`node scripts/windows/probe-mac-host.mjs --host 127.0.0.1 --port 43770 --requireH264 --expectInputMode log`
期望现象：`videoCodec=h264`、`videoEncoding=annexb-base64`、`capturePipeline=screencapturekit-h264`
当前现象：`swift build` 通过；Mac host 已重启在 `0.0.0.0:43770`；本机强校验通过，返回 `h264` / `annexb-base64` / `screencapturekit-h264`
阻塞点：无
需要对方做什么：Windows 端继续用真实 Mac host 验证控制端 WebCodecs 解码、延迟、回退和 UI 状态
超时时间：-
下一步负责人：Windows Codex

## 常见联调呼叫示例

### Windows 呼叫 Mac

```text
状态：CALLING
发起端：Windows Codex
需要配合端：Mac Codex
开始时间：2026-06-12 21:30
目标：验证 Windows 控制端连接真实 Mac 被控端，并收到真实 JPEG 首帧
测试环境：同一局域网，Windows 控制端 + macOS 被控端
连接信息：Mac IP 192.168.1.x，端口 17654，不在文档中写密码
测试命令：scripts/windows/test-mac-host.ps1 -HostName 192.168.1.x -RequireRealVideo -ExpectInputMode log -InputEvents
期望现象：/discovery 正常，认证通过，首帧 codec=jpeg 且 source 不是 mock/fallback，input_ack 为 logged
当前现象：等待 Mac 端启动服务
阻塞点：Mac 服务未启动或端口不通
需要对方做什么：Mac 端启动 apps/mac-host，并确认屏幕录制权限已开启
超时时间：30 分钟
下一步负责人：Mac Codex
```

### Mac 呼叫 Windows

```text
状态：CALLING
发起端：Mac Codex
需要配合端：Windows Codex
开始时间：2026-06-12 22:10
目标：验证 Mac 复制文件后，Windows 控制端能接收并重组文件
测试环境：真实 Mac 被控端 + Windows 控制端
连接信息：Windows 端连接 Mac IP，不在文档中写密码
测试命令：scripts/windows/test-mac-host.ps1 -HostName 192.168.1.x -ClipboardFileHostToClient
期望现象：Windows 控制端收到 clipboard_file_*，文件托盘出现完整文件
当前现象：等待 Windows 控制端运行并连接
阻塞点：Windows 控制端未在线
需要对方做什么：Windows 端启动控制端，连接真实 Mac 服务，然后重新跑探针
超时时间：30 分钟
下一步负责人：Windows Codex
```

## 超时规则

- 轻量测试：15 分钟无人响应，就把状态改为 `BLOCKED`。
- 真机联调：30 分钟无人响应，就把状态改为 `BLOCKED`。
- 阻塞后不要继续盲改代码，先把现象、日志和需要对方做的事写清楚。
- 不要在文档里写连接密码、系统账号密码、Apple ID 或任何密钥。
