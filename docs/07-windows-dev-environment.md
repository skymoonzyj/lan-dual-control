# Windows 开发环境说明

本文记录 Windows 侧后续开发需要的基础环境，用于开发控制端界面、WebSocket 协议层、Tauri 桌面壳和后续 Windows 被控服务。

## 当前已准备

- Node.js：用于运行 Windows 控制端静态服务和假 Mac WebSocket 服务。
- npm：使用 `npm.cmd` 调用，避免 PowerShell 执行策略拦截 `npm.ps1`。
- Git：用于同步 GitHub 仓库。
- WebView2 Runtime：Windows 桌面壳运行时已存在。
- Rust：已安装在 `E:\codex\.tools`。
  - `RUSTUP_HOME=E:\codex\.tools\rustup`
  - `CARGO_HOME=E:\codex\.tools\cargo`
  - `E:\codex\.tools\cargo\bin` 已写入当前用户 Path。

## 仍需管理员完成

Visual Studio C++ Build Tools 需要管理员权限安装。它用于 Tauri、Rust `stable-msvc` 工具链和后续 Windows 原生模块编译。

安装器已下载到：

```text
E:\codex\.tools\installers\vs_BuildTools.exe
```

推荐方式：右键以管理员身份运行：

```powershell
E:\codex\lan-dual-control\scripts\windows\setup-dev-env-admin.ps1
```

该脚本会做两件事：

- 把 Rust 相关路径写入系统级环境变量。
- 安装 `Microsoft.VisualStudio.Workload.VCTools`。

如果脚本被系统策略拦截，可以手动双击 `vs_BuildTools.exe`，勾选“使用 C++ 的桌面开发”后安装。

## 验证方式

打开一个新的 PowerShell，运行：

```powershell
E:\codex\lan-dual-control\scripts\windows\verify-dev-env.ps1
```

理想结果应包含：

- Node.js `[ok]`
- npm `[ok]`
- Git `[ok]`
- Rust `[ok]`
- Cargo `[ok]`
- MSVC cl.exe `[ok]`
- MSBuild `[ok]`
- WebView2 Runtime `[ok]`

如果 `MSVC cl.exe` 或 `MSBuild` 仍显示 missing，说明 Visual Studio C++ Build Tools 还没有安装完成，或当前终端没有加载开发者环境。

## 当前项目运行

Windows 控制端页面：

```powershell
node E:\codex\lan-dual-control\apps\windows-client\server.mjs 5178
```

假 Mac WebSocket 服务：

```powershell
node E:\codex\lan-dual-control\apps\mock-mac-host\server.mjs 43770
```

浏览器访问：

```text
http://127.0.0.1:5178/
```
