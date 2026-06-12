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
   - 黑边输入防护已固化到 Windows 控制端页面级自检；后续改缩放、画布或输入层时保持该回归。
   - 处理真实 Mac 连接中的中文错误提示和重连体验。

3. 继续 H.264 流式视频链路验收。
   - Mac 真机已通过 `--requireH264` 首帧强校验，Windows 控制端页面级 `--requireH264` 也已验证真实 WebCodecs 解码；下一步继续观察延迟、长时间稳定性和 JPEG 回退体验。
   - JPEG 链路继续保留为兜底和权限调试。
   - Windows 控制端继续显示实收 FPS、协商帧率和请求帧率。

4. 共享协议只做必要变更。
   - 任何协议字段变更都必须同步 Swift、Windows 控制端、Windows 被控端、假 Mac 服务和探针脚本。
   - 协议兼容性不确定时，优先新增字段，不直接删除旧字段。

## Mac Codex 可接任务

- 继续验证真实 macOS 系统声音采集，重点看静音、无系统声音、音量变化和长时间运行；可用 `node scripts/mac/observe-mac-audio.mjs --durationMs 30000 --minFrames 250 --maxGapMs 1000` 观察持续帧节奏。
- 继续压测 ScreenCaptureKit + VideoToolbox H.264，重点看断开释放、连续重连、延迟和 CPU 占用；可用 `node scripts/mac/observe-mac-video.mjs --durationMs 30000 --requireH264 --minFrames 600 --minFps 20 --maxGapMs 1000` 做持续帧观察，用 `node scripts/mac/stress-mac-host.mjs --iterations 50 --expectInputMode log` 做连续连接回归。
- 扩展 CGEvent 键盘映射，重点验证中文输入法、Command 组合键和功能键；改映射前后先跑 `node scripts/mac/check-input-keymap.mjs`。
- 增加真实多显示器枚举和采集切换。
- 继续完善 `apps/mac-client` Mac 控制 Windows 原型：用 `test-mac-client-browser.mjs --useExistingHost --enableAudio --expectAudioPayload --expectAudioPlayback` 接真实 Windows WASAPI host 验收 PCM 播放；Windows 本机临时启动 host 验收可直接加 `--requireAudio`，继续打磨键盘映射边界，后续可补最近连接重命名等小体验。

## Windows Codex 可接任务

- 优化 Windows 控制端远端文件托盘，后续把桌面版文件剪贴板写入升级为原生分块，支持更大的文件。
- Windows 被控端 FFmpeg gdigrab 过渡层当前已接近 30 FPS；下一步把该采集层升级为 Windows Graphics Capture 和正式编码管线，进一步提升帧率、延迟、带宽和资源占用表现。
- 继续验证 Windows 被控端 WASAPI loopback：重点看静音、系统音量变化、长时间运行、Mac client 播放体验和无系统声音时的提示；可用 `node scripts/windows/observe-windows-host-audio.mjs --durationMs 30000 --minFrames 1200 --minFps 40 --maxGapMs 1000` 做持续帧观察。
- 优化 Windows 控制端文件托盘和错误提示。
- Windows host 或假 Mac 认证相关改动后运行 `node scripts/windows/test-auth-retry-policy.mjs`，确认错误密码剩余次数、第三次断开和新连接正确认证未退化。
- Windows 控制端视频、缩放或输入相关改动后，用真实 Mac host 运行 `node scripts/windows/test-windows-client-browser.mjs --host <Mac IP> --port 43770 --password <密码> --requireH264`，确认 H.264/WebCodecs 画布解码未退回 JPEG，并确认黑边输入防护回归通过。
- Windows host 相关改动后运行 `scripts/windows/test-windows-host.ps1`，确认真实视频首帧、文本剪贴板和文件剪贴板接收未退化；涉及音频时可加 `-AudioMode wasapi -RequireAudio`；涉及 Mac 反控链路时再运行 `node scripts/windows/test-mac-client-browser.mjs`，确认 Mac client 页面可显示 Windows 画面、收到 `input_ack`，并完成 `Command+C` 到 `Ctrl+C` 映射、最近连接保存/回填/清空、文本/本机剪贴板监听/文件剪贴板发送；需要验收真实 PCM 播放时，本机临时 host 可加 `--requireAudio`，已运行 host 可加 `--useExistingHost --enableAudio --expectAudioPayload --expectAudioPlayback`；认证相关改动可加跑 `node scripts/windows/test-mac-client-browser.mjs --expectAuthFailure --expectedAttemptsRemaining 2 --expectedMaxAttempts 3`。
- Windows host 视频性能相关改动后运行 `node scripts/windows/observe-windows-host-video.mjs`，确认实际 FPS、最大帧间隔和采集管线符合预期。
- 继续维护本机假 Mac 服务，用于快速回归和失败场景模拟。

## 暂不优先

- 安装包。
- 公网账号系统。
- 大文件断点续传。
- H.264 硬件编码深度优化。
- UDP/mDNS 自动发现完整实现。
