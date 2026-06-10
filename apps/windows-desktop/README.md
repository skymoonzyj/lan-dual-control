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
- 已支持分辨率、刷新率、带宽、声音、剪贴板等控制项。
- 已验证可构建 Windows 桌面 exe。
- 下一步再接入原生窗口菜单、托盘、配置存储、正式图标、安装包和自动启动。
