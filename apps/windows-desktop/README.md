# Windows 桌面壳

这是 Windows 控制端的 Tauri 桌面壳。它复用 `apps/windows-client` 里的网页界面，目标是先把当前原型变成可运行的 Windows 桌面应用。

## 运行

先安装依赖：

```powershell
cd E:\codex\lan-dual-control\apps\windows-desktop
npm.cmd install
```

开发运行：

```powershell
npm.cmd run dev
```

Tauri 会自动启动 `apps/windows-client/server.mjs`，然后打开桌面窗口。

## 打包

```powershell
npm.cmd run build
```

当前先生成桌面 exe，不启用 MSI/NSIS 安装包。产物位置：

```text
apps\windows-desktop\src-tauri\target\release\lan-dual-control-windows.exe
```

安装包阶段后续单独处理，避免被 WiX/NSIS 下载和系统权限问题卡住。

## 当前范围

- 已接入现有中文控制端界面。
- 已支持本地模拟和 WebSocket 局域网连接方式。
- 已支持分辨率、刷新率、码率、声音、剪贴板等控制项。
- 已增加桌面原生命令：远端文件接收完成后可分块保存到本机临时目录，并写入 Windows 系统文件剪贴板。
- 已增加“本机被控”桌面入口：可在桌面壳里体检 Windows host 环境、预览防火墙放行命令、用隐藏密码启动/停止 Windows 被控端，并查看启动日志和 `/discovery` 状态。
- 已验证可构建 Windows 桌面 exe。
- 下一步再接入原生窗口菜单、托盘、配置存储、正式图标、安装包和自动启动。

## 本机被控入口

桌面版左侧会显示“本机被控”面板。默认输入模式是“安全日志”，不会无人值守地把真实键鼠事件注入 Windows；需要让 Mac 真正反控这台 Windows 时，再手动切到“真实控制”。

- `体检`：调用 `scripts/windows/check-windows-host-readiness.mjs --json`，检查 Node、FFmpeg、Windows host 语法、输入 helper、音频设备和局域网/防火墙状态。
- `防火墙预览`：只生成放行命令预览，不修改系统设置。
- `启动`：要求填写被控密码，通过桌面原生命令启动 `apps/windows-host/server.mjs`。
- `停止`：停止由桌面壳启动的 Windows host 进程树，避免留下 FFmpeg 或 Node 子进程。

## 远端文件剪贴板

Windows 控制端收到 Mac 复制过来的文件后，桌面壳会优先使用原生分块写入：

- 前端每次把 1MB 文件块交给 Tauri，不再把整批文件一次性 base64 传给原生命令。
- 原生层会校验每个文件的分块偏移和最终字节数，写完后再调用 Windows 系统文件剪贴板。
- 当前桌面版上限与远控文件传输上限一致，为 512MB，原生命令层也会强制校验该上限。
- 新建写入任务前会尽力清理 7 天以上的旧临时目录；近期临时文件会保留，避免刚写入系统文件剪贴板后立即粘贴失败。
- Rust 单元测试已覆盖分块偏移错误、写入超出预期、未写完禁止结束、取消清理临时目录和超限拒绝。
- 旧的一次性写入命令仍保留作兼容回退。
