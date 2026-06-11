# Windows 开发环境说明

本文记录 Windows 侧后续开发需要的基础环境，用于开发控制端界面、WebSocket 协议层、Tauri 桌面壳和后续 Windows 被控服务。

## 当前已准备

- Node.js：用于运行 Windows 控制端静态服务和假 Mac WebSocket 服务。
- npm：使用 `npm.cmd` 调用，避免 PowerShell 执行策略拦截 `npm.ps1`。
- Git：用于同步 GitHub 仓库。
- WebView2 Runtime：Windows 桌面壳运行时已存在。
- Rust：已安装在 `C:\DevTools`。
  - `RUSTUP_HOME=C:\DevTools\rustup`
  - `CARGO_HOME=C:\DevTools\cargo`
  - `C:\DevTools\cargo\bin` 已写入当前用户 Path。
- Visual Studio C++ Build Tools：已安装，用于 Tauri、Rust `stable-msvc` 工具链和后续 Windows 原生模块编译。
  - `cl.exe` 位于 Visual Studio BuildTools 的 MSVC 目录。
  - `MSBuild.exe` 位于 Visual Studio BuildTools 的 MSBuild 目录。
- Rust/MSVC 编译链路已通过临时 `cargo build` 验证，可以生成 Windows `.exe`。

说明：旧目录 `E:\codex\.tools` 暂时保留为兼容备份。如果系统级 `Machine` 环境变量还指向旧目录，请用管理员身份运行下面的管理员脚本刷新到 `C:\DevTools`，确认验证全绿后再删除旧目录。

## 管理员脚本

如果以后换新电脑，或需要重新配置系统级环境变量，可以右键以管理员身份运行：

```powershell
E:\codex\lan-dual-control\scripts\windows\setup-dev-env-admin.ps1
```

安装器缓存位置：

```text
C:\DevTools\installers\vs_BuildTools.exe
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

普通 PowerShell 里直接输入 `cl` 或 `msbuild` 可能仍然找不到，这是正常的；Visual Studio 的 C++ 工具默认不写入普通 PATH。验证脚本会直接扫描 BuildTools 安装目录。

## 一键联调脚本

常用健康检查：

```powershell
cd E:\codex\lan-dual-control
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\dev-lab.ps1
```

启动本地联调服务：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\dev-lab.ps1 -Start
```

默认端口：

- Windows 控制端页面：`http://127.0.0.1:5178/`
- 假 Mac WebSocket：`127.0.0.1:43770`
- Windows 被控端骨架：`127.0.0.1:43772`

停止脚本启动的服务：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\dev-lab.ps1 -Stop
```

如需顺手重新构建桌面 exe：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\dev-lab.ps1 -Build
```

## 当前项目运行

Windows 控制端页面：

```powershell
node E:\codex\lan-dual-control\apps\windows-client\server.mjs 5178
```

假 Mac WebSocket 服务：

```powershell
node E:\codex\lan-dual-control\apps\mock-mac-host\server.mjs 43770
```

Windows 被控端骨架：

```powershell
node E:\codex\lan-dual-control\apps\windows-host\server.mjs 43770 0.0.0.0
```

如果本机调试时 `43770` 已被假 Mac 服务占用，可以临时改用：

```powershell
node E:\codex\lan-dual-control\apps\windows-host\server.mjs 43772 127.0.0.1
```

浏览器访问：

```text
http://127.0.0.1:5178/
```
