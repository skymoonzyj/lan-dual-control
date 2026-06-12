# 下一步行动

最后更新：2026-06-12

用途：让两台机器上的 Codex 都知道现在最值得做什么。只放短期任务，长期计划继续放在 `docs/04-task-board.md`。

## 最高优先级

1. Mac 端继续验证真实被控服务。
   - 默认使用 `LAN_DUAL_INPUT_MODE=log` 做安全联调。
   - 在 Windows 端运行 `scripts/windows/test-mac-host.ps1 -HostName 192.168.1.x -RequireRealVideo -ExpectInputMode log -InputEvents`。
   - 验证通过后，再切到 `LAN_DUAL_INPUT_MODE=inject` 做真实输入注入。

2. Windows 端继续完善控制体验。
   - 保持诊断状态条准确显示真实视频、模拟回退、权限、输入注入和剪贴板状态。
   - 继续验证 Mac 真实 `pcm-f32le-base64` 音频帧播放稳定性，重点看静音、音量变化、长时间运行和延迟。
   - 继续避免黑边区域误发输入。
   - 处理真实 Mac 连接中的中文错误提示和重连体验。

3. 继续 H.264 流式视频链路验收。
   - Mac 真机已通过 `--requireH264` 首帧强校验，下一步由 Windows 控制端验证真实解码、延迟和回退体验。
   - JPEG 链路继续保留为兜底和权限调试。
   - Windows 控制端继续显示实收 FPS、协商帧率和请求帧率。

4. 共享协议只做必要变更。
   - 任何协议字段变更都必须同步 Swift、Windows 控制端、Windows 被控端、假 Mac 服务和探针脚本。
   - 协议兼容性不确定时，优先新增字段，不直接删除旧字段。

## Mac Codex 可接任务

- 继续验证真实 macOS 系统声音采集，重点看静音、无系统声音、音量变化和长时间运行；可用 `node scripts/mac/observe-mac-audio.mjs --durationMs 30000 --minFrames 250 --maxGapMs 1000` 观察持续帧节奏。
- 继续压测 ScreenCaptureKit + VideoToolbox H.264，重点看断开释放、连续重连、延迟和 CPU 占用；可用 `node scripts/mac/stress-mac-host.mjs --iterations 50 --expectInputMode log` 做连续连接回归。
- 扩展 CGEvent 键盘映射，重点验证中文输入法、Command 组合键和功能键；改映射前后先跑 `node scripts/mac/check-input-keymap.mjs`。
- 增加真实多显示器枚举和采集切换。
- 继续完善 `apps/mac-client` Mac 控制 Windows 原型：接真实 Windows host 验证、增加文件剪贴板/音频播放、打磨键盘映射和错误提示。

## Windows Codex 可接任务

- 优化 Windows 控制端远端文件托盘，后续把桌面版文件剪贴板写入升级为原生分块，支持更大的文件。
- Windows 被控端 FFmpeg gdigrab 过渡层当前已接近 30 FPS；下一步把该采集层升级为 Windows Graphics Capture 和正式编码管线，进一步提升帧率、延迟、带宽和资源占用表现。
- 在当前 FFmpeg DirectShow PCM 过渡入口基础上接入 WASAPI loopback，替换 Windows 被控端默认模拟音频帧。
- 优化 Windows 控制端文件托盘和错误提示。
- Windows host 或假 Mac 认证相关改动后运行 `node scripts/windows/test-auth-retry-policy.mjs`，确认错误密码剩余次数、第三次断开和新连接正确认证未退化。
- Windows host 相关改动后运行 `scripts/windows/test-windows-host.ps1`，确认真实视频首帧、文本剪贴板和文件剪贴板接收未退化；涉及 Mac 反控链路时再运行 `node scripts/windows/test-mac-client-browser.mjs`，确认 Mac client 页面可显示 Windows 画面并收到 `input_ack`。
- Windows host 视频性能相关改动后运行 `node scripts/windows/observe-windows-host-video.mjs`，确认实际 FPS、最大帧间隔和采集管线符合预期。
- 继续维护本机假 Mac 服务，用于快速回归和失败场景模拟。

## 暂不优先

- 安装包。
- 公网账号系统。
- 大文件断点续传。
- H.264 硬件编码深度优化。
- UDP/mDNS 自动发现完整实现。
