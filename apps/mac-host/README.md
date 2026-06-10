# macOS 被控端骨架

这是 Mac mini 到位前先准备的 macOS 被控端骨架。它的目标是接收 Windows 控制端协议，后续接入真实屏幕采集、声音采集和输入注入。

## 当前内容

- Swift Package 项目结构。
- TCP 监听骨架，默认端口 `43770`。
- `hello`、`auth_request`、`session_offer`、`input_event` 消息模型。
- macOS 权限检查骨架：
  - 屏幕录制。
  - 辅助功能。
  - 输入监控提示。
- ScreenCaptureKit 资源预检骨架。
- CGEvent 输入注入占位实现。

## 在 Mac 上运行

进入目录：

```bash
cd apps/mac-host
```

运行：

```bash
swift run lan-dual-mac-host
```

可选环境变量：

```bash
export LAN_DUAL_HOST=0.0.0.0
export LAN_DUAL_PORT=43770
export LAN_DUAL_PASSWORD=demo-password
swift run lan-dual-mac-host
```

## 首次运行需要打开的 macOS 权限

进入系统设置：

```text
系统设置 -> 隐私与安全性
```

需要允许：

- 屏幕录制：`lan-dual-mac-host`
- 辅助功能：`lan-dual-mac-host`
- 输入监控：如果系统提示，也允许 `lan-dual-mac-host`

修改权限后通常需要重启程序。

## 下一步

Mac mini 到位后优先验证：

1. `swift run lan-dual-mac-host` 能启动。
2. 权限检查结果是否正确。
3. Windows 控制端能通过 TCP 发送 `hello` 并收到 `hello_ack`。
4. ScreenCaptureKit 能拿到主屏幕。
5. CGEvent 能注入鼠标移动和点击。

