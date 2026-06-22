const { LocalMockTransport, ProtocolClient, WebSocketTransport, protocolVersion } =
  window.LanDualProtocol;
const {
  computeDisplayedFrameRect,
  mapClientPointToRemote,
  defaultKeyboardMapping,
  remoteModifierLabels,
  normalizeKeyMapValue,
  mapKeyboardInput,
  describeKeyboardInput,
} = window.LanDualMapping;

const elements = {
  transportSelect: document.querySelector("#transportSelect"),
  hostInput: document.querySelector("#hostInput"),
  portInput: document.querySelector("#portInput"),
  passwordInput: document.querySelector("#passwordInput"),
  mockScenarioSelect: document.querySelector("#mockScenarioSelect"),
  connectionActions: document.querySelector("#connectionActions"),
  connectButton: document.querySelector("#connectButton"),
  reconnectNowButton: document.querySelector("#reconnectNowButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  refreshDevicesButton: document.querySelector("#refreshDevicesButton"),
  deviceList: document.querySelector("#deviceList"),
  copyLogButton: document.querySelector("#copyLogButton"),
  exportLogButton: document.querySelector("#exportLogButton"),
  clearLogButton: document.querySelector("#clearLogButton"),
  localHostBadge: document.querySelector("#localHostBadge"),
  localHostPortInput: document.querySelector("#localHostPortInput"),
  localHostPasswordInput: document.querySelector("#localHostPasswordInput"),
  localHostScreenModeSelect: document.querySelector("#localHostScreenModeSelect"),
  localHostAudioModeSelect: document.querySelector("#localHostAudioModeSelect"),
  localHostInputModeSelect: document.querySelector("#localHostInputModeSelect"),
  localHostReverseControlModeSelect: document.querySelector("#localHostReverseControlModeSelect"),
  localHostReadinessProfileSelect: document.querySelector("#localHostReadinessProfileSelect"),
  localHostProbeMediaToggle: document.querySelector("#localHostProbeMediaToggle"),
  localHostReadinessButton: document.querySelector("#localHostReadinessButton"),
  localHostStartButton: document.querySelector("#localHostStartButton"),
  localHostFirewallButton: document.querySelector("#localHostFirewallButton"),
  localHostStopButton: document.querySelector("#localHostStopButton"),
  localHostReverseGrantButton: document.querySelector("#localHostReverseGrantButton"),
  localMacAlertWatcherBadge: document.querySelector("#localMacAlertWatcherBadge"),
  localMacAlertWatcherStatusText: document.querySelector("#localMacAlertWatcherStatusText"),
  localMacAlertWatcherToggleButton: document.querySelector("#localMacAlertWatcherToggleButton"),
  localMacAlertWatcherRefreshButton: document.querySelector("#localMacAlertWatcherRefreshButton"),
  localMacHeartbeatCommandButtons: Array.from(document.querySelectorAll("[data-mac-heartbeat-command]")),
  localHostStatusText: document.querySelector("#localHostStatusText"),
  localHostOutput: document.querySelector("#localHostOutput"),
  historyList: document.querySelector("#historyList"),
  connectionBadge: document.querySelector("#connectionBadge"),
  eventLog: document.querySelector("#eventLog"),
  remoteCanvas: document.querySelector("#remoteCanvas"),
  remoteStatusText: document.querySelector("#remoteStatusText"),
  hostDiagnosticsText: document.querySelector("#hostDiagnosticsText"),
  statusText: document.querySelector("#statusText"),
  inputText: document.querySelector("#inputText"),
  clipboardText: document.querySelector("#clipboardText"),
  qualityPresetSelect: document.querySelector("#qualityPresetSelect"),
  resolutionSelect: document.querySelector("#resolutionSelect"),
  displaySelect: document.querySelector("#displaySelect"),
  fpsSelect: document.querySelector("#fpsSelect"),
  bandwidthSelect: document.querySelector("#bandwidthSelect"),
  scaleModeSelect: document.querySelector("#scaleModeSelect"),
  audioToggle: document.querySelector("#audioToggle"),
  clipboardToggle: document.querySelector("#clipboardToggle"),
  fileClipboardButton: document.querySelector("#fileClipboardButton"),
  fileClipboardInput: document.querySelector("#fileClipboardInput"),
  copyReceivedFilesButton: document.querySelector("#copyReceivedFilesButton"),
  receivedFilesList: document.querySelector("#receivedFilesList"),
  receivedFilesStatus: document.querySelector("#receivedFilesStatus"),
  downloadAllReceivedFilesButton: document.querySelector("#downloadAllReceivedFilesButton"),
  openReceivedFilesTempButton: document.querySelector("#openReceivedFilesTempButton"),
  clearReceivedFilesButton: document.querySelector("#clearReceivedFilesButton"),
  keyMapWinSelect: document.querySelector("#keyMapWinSelect"),
  keyMapAltSelect: document.querySelector("#keyMapAltSelect"),
  keyMapCtrlSelect: document.querySelector("#keyMapCtrlSelect"),
  shortcutCompatToggle: document.querySelector("#shortcutCompatToggle"),
  resetKeyMapButton: document.querySelector("#resetKeyMapButton"),
  directionIndicator: document.querySelector("#directionIndicator"),
  directionText: document.querySelector("#directionText"),
  reverseStateText: document.querySelector("#reverseStateText"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  windowModeButton: document.querySelector("#windowModeButton"),
  reverseButton: document.querySelector("#reverseButton"),
  reverseButtonText: document.querySelector("#reverseButtonText"),
  monitorModeButton: document.querySelector("#monitorModeButton"),
  remoteControlCenter: document.querySelector("#remoteControlCenter"),
  controlCenterToggle: document.querySelector("#controlCenterToggle"),
  controlCenterPanel: document.querySelector("#controlCenterPanel"),
  floatingControlSummary: document.querySelector("#floatingControlSummary"),
  floatingDisplaySelect: document.querySelector("#floatingDisplaySelect"),
  floatingQualitySelect: document.querySelector("#floatingQualitySelect"),
  floatingResolutionSelect: document.querySelector("#floatingResolutionSelect"),
  floatingFpsSelect: document.querySelector("#floatingFpsSelect"),
  floatingBandwidthSelect: document.querySelector("#floatingBandwidthSelect"),
  floatingScaleSelect: document.querySelector("#floatingScaleSelect"),
  floatingAudioSelect: document.querySelector("#floatingAudioSelect"),
  floatingFullscreenHint: document.querySelector("#floatingFullscreenHint"),
  floatingConnectionStatus: document.querySelector("#floatingConnectionStatus"),
  floatingVideoStatus: document.querySelector("#floatingVideoStatus"),
  floatingAudioStatus: document.querySelector("#floatingAudioStatus"),
  floatingClipboardStatus: document.querySelector("#floatingClipboardStatus"),
  floatingInputModeStatus: document.querySelector("#floatingInputModeStatus"),
  floatingSecurityStatus: document.querySelector("#floatingSecurityStatus"),
  floatingShortcutSelect: document.querySelector("#floatingShortcutSelect"),
  floatingShortcutButton: document.querySelector("#floatingShortcutButton"),
  floatingAudioVolumeRange: document.querySelector("#floatingAudioVolumeRange"),
  floatingAudioVolumeText: document.querySelector("#floatingAudioVolumeText"),
  floatingFullscreenButton: document.querySelector("#floatingFullscreenButton"),
  floatingImmersiveFullscreenButton: document.querySelector("#floatingImmersiveFullscreenButton"),
  floatingWindowButton: document.querySelector("#floatingWindowButton"),
  floatingMonitorModeButton: document.querySelector("#floatingMonitorModeButton"),
  floatingCopyDiagnosticsButton: document.querySelector("#floatingCopyDiagnosticsButton"),
  floatingReconnectButton: document.querySelector("#floatingReconnectButton"),
  floatingDisconnectButton: document.querySelector("#floatingDisconnectButton"),
  monitorModeBar: document.querySelector("#monitorModeBar"),
  monitorModeStatus: document.querySelector("#monitorModeStatus"),
  monitorModeDragHandle: document.querySelector("#monitorModeDragHandle"),
  monitorModeRestoreButton: document.querySelector("#monitorModeRestoreButton"),
  monitorModeCopyButton: document.querySelector("#monitorModeCopyButton"),
  monitorModeDisconnectButton: document.querySelector("#monitorModeDisconnectButton"),
  fullscreenHint: document.querySelector("#fullscreenHint"),
  fullscreenHintText: document.querySelector("#fullscreenHintText"),
  fullscreenHintClose: document.querySelector("#fullscreenHintClose"),
  cursorDot: document.querySelector("#cursorDot"),
  remoteFrameImage: document.querySelector("#remoteFrameImage"),
  remoteVideoCanvas: document.querySelector("#remoteVideoCanvas"),
  metricResolution: document.querySelector("#metricResolution"),
  metricFps: document.querySelector("#metricFps"),
  metricBandwidth: document.querySelector("#metricBandwidth"),
  metricLatency: document.querySelector("#metricLatency"),
  audioVolumeRange: document.querySelector("#audioVolumeRange"),
  audioVolumeText: document.querySelector("#audioVolumeText"),
  audioText: document.querySelector("#audioText"),
  clockText: document.querySelector("#clockText"),
};

const storageKey = "lan-dual-control.windows-client.preferences.v1";
const maxReconnectAttempts = 3;
const reconnectBaseDelayMs = 1200;
const reverseControlTimeoutMs = 4800;
const maxStoredLogEntries = 500;
const discoveryProbeTimeoutMs = 650;
const discoveryLanScanTimeoutMs = 650;
const browserDiscoveryProbeConcurrency = 8;
const defaultControlPort = "43770";
const fileChunkSizeBytes = 64 * 1024;
const maxClipboardFileBytes = 512 * 1024 * 1024;
const remoteFileTransferStallTimeoutMs = 45 * 1000;
const remoteFileTransferSweepIntervalMs = 1000;
const remoteFileTransferRateSampleLimit = 8;
const nativeClipboardChunkSizeBytes = 1024 * 1024;
const maxNativeClipboardFileBytes = maxClipboardFileBytes;
const defaultAgentLinkServer = "http://192.168.31.68:17888";
const localMacAlertWatcherStatusPollMs = 15000;
const macHeartbeatFreshnessStaleMs = 2 * 60 * 1000;
const defaultHostDiagnosticsText = "诊断：等待连接。";
const audioInitialBufferSeconds = 0.06;
const audioMinimumBufferSeconds = 0.05;
const audioMaximumQueuedSeconds = 0.45;
const audioResyncBufferSeconds = 0.12;
const audioStableUnderrunBufferSeconds = 0.10;
const audioRecoveryUnderrunBufferSeconds = 0.08;
const audioLowLatencyTargetQueuedSeconds = 0.06;
const audioLowLatencySoftCapSeconds = 0.06;
const audioAdaptiveUnderrunWindowSeconds = 2;
const audioStableUnderrunMinimumPlayedFrames = 8;
const audioVisibilityRecoveryMinimumHiddenMs = 250;
const audioVisibilityRecoveryQueuedSeconds = 0.18;
const audioVisibilityRecoveryFollowupWindowMs = 3000;
const audioStutterGapThresholdMs = 120;
const audioFirstFrameWaitThresholdMs = 3000;
const audioStreamStallThresholdMs = 2500;
const audioStreamStallPollMs = 1000;
const videoFirstFrameWaitThresholdMs = 3000;
const videoStreamStallThresholdMs = 2500;
const videoStreamStatusPollMs = 1000;
const h264MaximumQueuedFrames = 8;
const h264MaximumQueueAgeMs = 450;
const h264LiveBacklogMinimumAgeMs = 90;
const h264LiveBacklogFrameWindow = 6;
const h264LiveBacklogKeyFrameRequestCooldownMs = 700;
const h264W13LocalQosTargetQueueMs = 120;
const h264W13LocalQosMaxQueueMs = 180;
const h264W13LocalArrivalGapMs = 1000;
const h264FirstSurfaceQueueGraceMs = 2200;
const h264VisibilityRecoveryMinimumHiddenMs = 250;
const h264KeyFrameWaitFallbackSkippedDeltas = 90;
const h264KeyFrameWaitRecoveryTimeoutMs = 900;
const h264KeyFrameWaitRecoveryRetryMs = 900;
const h264RecoveryQueueGraceMs = 1600;
const h264RecoveryQueueGraceAgeMs = 1200;
const h264RecoveryKeyFrameDecodeGraceMs = 1800;
const h264RecoveryKeyFrameQueueAgeMs = 2200;
const h264FallbackRecoveryCooldownMs = 2500;
const h264FallbackRecoveryStableJpegFrames = 3;
const h264FallbackRecoveryLoopWindowMs = 15000;
const h264FallbackRecoveryLoopThreshold = 2;
const h264FallbackRecoveryPauseMs = 10000;
const w8NativeVideoProgressWindowMs = 5000;
const videoStutterGapThresholdMs = 120;
const audioStatusRenderIntervalMs = 140;
const displayOptionDefaults = {
  resolution: "1920x1080",
  fps: "60",
  bandwidth: "50",
};
const allowedDisplayOptions = {
  resolution: ["1920x1080", "2560x1440", "3840x2160"],
  fps: ["30", "60", "120", "144", "240"],
  bandwidth: ["5", "10", "15", "20", "40", "50"],
};
const qualityPresets = {
  smooth: {
    label: "流畅",
    resolution: "1920x1080",
    fps: "30",
    bandwidth: "10",
  },
  balanced: {
    label: "自动",
    resolution: "2560x1440",
    fps: "60",
    bandwidth: "20",
  },
  sharp: {
    label: "高清",
    resolution: "3840x2160",
    fps: "120",
    bandwidth: "50",
  },
  original: {
    label: "原画",
    resolution: "3840x2160",
    fps: "60",
    bandwidth: "50",
    scaleMode: "original",
  },
};
const floatingShortcutActions = {
  copy: { label: "复制", key: "c", code: "KeyC", modifiers: ["meta"] },
  paste: { label: "粘贴", key: "v", code: "KeyV", modifiers: ["meta"], syncClipboard: true },
  cut: { label: "剪切", key: "x", code: "KeyX", modifiers: ["meta"] },
  select_all: { label: "全选", key: "a", code: "KeyA", modifiers: ["meta"] },
  undo: { label: "撤销", key: "z", code: "KeyZ", modifiers: ["meta"] },
  redo: { label: "重做", key: "z", code: "KeyZ", modifiers: ["meta", "shift"] },
  find: { label: "查找", key: "f", code: "KeyF", modifiers: ["meta"] },
  save: { label: "保存", key: "s", code: "KeyS", modifiers: ["meta"] },
  app_switch: { label: "切换应用", key: "Tab", code: "Tab", modifiers: ["meta"] },
  lock_screen: { label: "锁屏", key: "q", code: "KeyQ", modifiers: ["ctrl", "meta"] },
};
const hostModeLabels = {
  "mac-host-background-jpeg": "Mac 后台 JPEG",
  "mac-host-h264-stream": "Mac 流式 H.264",
  "mac-host-mock-video": "Mac 模拟画面",
  "local-mock-mac": "本地模拟 Mac",
  "mock-mac-host": "假 Mac 服务",
  "windows-host-skeleton": "Windows 被控骨架",
  "windows-host-system-jpeg": "Windows 系统 JPEG",
};
const capturePipelineLabels = {
  "background-jpeg": "后台 JPEG",
  "screencapturekit-h264": "流式 H.264",
  "windows-gdi-jpeg": "Windows 系统截图",
  "windows-gdi-jpeg-fallback-mock": "Windows 截图回退",
  "windows-ffmpeg-gdigrab-mjpeg": "FFmpeg gdigrab MJPEG",
  "windows-ffmpeg-gdigrab-h264": "FFmpeg gdigrab H.264",
  "mock-svg": "模拟画面",
  "screen-fallback-mock": "采集回退",
  "screen-timeout-mock": "采集超时",
  "screen-cooldown-mock": "等待恢复",
};
const videoSourceLabels = {
  screen: "真实屏幕",
  mock: "模拟源",
};
const inputModeLabels = {
  inject: "真实注入",
  log: "安全日志",
  mock: "模拟记录",
  auth: "等待认证",
};
const reverseControlModeLabels = {
  deny: "需确认",
  accept: "实验自动同意",
  disabled: "关闭",
};
const inputAckStatusLabels = {
  injected: "已注入",
  logged: "已记录",
  rejected: "被拒绝",
};
const macUnattendedRiskLabels = {
  "launch-agent-missing": "自启动未配置",
  "launch-agent-not-loaded": "自启动未加载",
  "launch-agent-disabled": "自启动已停用",
  "launch-agent-failed": "自启动失败",
  "launch-agent-max-fps": "LaunchAgent 刷新率上限需调整",
  "launch-agent-max-screen-fps": "LaunchAgent 刷新率上限需检查",
  "launch-agent": "自启动需检查",
  "power": "电源设置需检查",
  "power-risk": "电源设置可能导致睡眠断连",
  "power-warning": "电源设置有提醒",
  "power-blocked": "电源设置阻塞值守",
  "mac-power-plan-command": "Mac 电源预案命令已提供",
  "mac-power-apply-command": "Mac 电源授权执行命令已提供",
  "mac-remote-audio-local-output": "Mac 本机仍会出声",
  "local-output-audible": "Mac 本机仍会出声",
  "mac-remote-audio-not-active": "远端独占声音未开启",
  "mac-remote-audio-user-consent": "远端独占声音需用户明确同意",
  "mac-remote-audio-read-only": "不会自动改 Mac 音量",
  "user-presence-away": "用户不在",
  "user-presence-no-auth-only": "只做无授权任务",
  "agent-link-presence-endpoint-unavailable": "presence 接口未启用",
  "blocked_by_user_away": "用户不在，只做无授权任务",
  "blocked-by-user-away": "用户不在，只做无授权任务",
  "system-sleep-enabled": "系统睡眠未关闭",
  "display-sleep-enabled": "显示器睡眠未关闭",
  "network-wake-disabled": "网络唤醒未开启",
  "sleep": "睡眠策略需检查",
  "sleep-risk": "睡眠可能断连",
  "sleep-blocked": "睡眠阻塞值守",
  "sleep-unreachable": "睡眠后不可达",
  "host-offline": "Mac host 离线",
  "host-unreachable": "Mac host 不可达",
  "mac-heartbeat-summary-stale": "Mac 心跳摘要过旧",
  "mac-heartbeat-stale": "Mac 心跳过期，可能卡住",
  "mac-heartbeat-health-warning": "Mac 心跳健康有提醒",
  "mac-heartbeat-health-blocked": "Mac 心跳健康阻塞",
  "mac-heartbeat-health-unknown": "Mac 心跳健康未知",
  "mac-heartbeat-rerun-command": "Mac 心跳复查命令已提供",
  "mac-heartbeat-once-command": "Mac 单次心跳上板命令已提供",
  "mac-heartbeat-watch-command": "Mac 持续心跳 watcher 命令已提供",
  "mac-heartbeat-start-command": "Mac 后台心跳启动命令已提供",
  "mac-heartbeat-status-command": "Mac 后台心跳状态命令已提供",
  "mac-heartbeat-stop-command": "Mac 后台心跳停止命令已提供",
  "mac-unattended-status-command": "Mac 值守状态命令已提供",
  "mac-unattended-formal-command": "Mac 值守正式检查命令已提供",
  "mac-watchdog-stale": "Mac watchdog 心跳过期",
  "mac-api-error": "Mac/API 网络错误",
  "mac-codex-stale": "Mac Codex 长时间无新进展",
  "mac-codex-stuck": "Mac Codex 可能卡住",
  "codex-reconnect-signal": "Mac Codex 出现重连异常信号",
  "codex-reconnect-stuck": "Mac Codex 可能卡在重新连接 5/5",
  "codex-stream-disconnected": "检测到 stream disconnected before completion",
  "codex-backend-request-error": "Codex 后端请求中断",
  "codex-manual-retry": "请查看 Mac 窗口，可能需要手动重试/刷新",
  "mac-host": "Mac host 需检查",
  "mac-host-discovery": "Mac host 发现需检查",
  "mac-host-readiness-command": "Mac host 体检命令已提供",
  "mac-host-media-command": "Mac 媒体基线命令已提供",
  "mac-host-stop-command": "Mac host 停止旧进程命令已提供",
  "mac-host-safe-start": "Mac host 安全启动命令已提供",
  "mac-max-fps-safe-start": "Mac 60Hz 安全启动命令已提供",
  "mac-launch-agent-plan-command": "Mac LaunchAgent 预案命令已提供",
  "mac-launch-agent-load-command": "Mac LaunchAgent 加载命令已提供",
  "mac-launch-agent-print-command": "Mac LaunchAgent 打印验证命令已提供",
  "mac-client-page-command": "Mac client 页面状态命令已提供",
  "mac-client-diagnostics-command": "Mac client 诊断命令已提供",
  "mac-client-discover-windows": "Mac client Windows 发现命令已提供",
  "mac-client-formal-checklist": "Mac client 正式清单命令已提供",
  "mac-client-prompt-password-smoke": "Mac client 前台密码真测命令已提供",
  "mac-client-browser-self-test": "Mac client 本地 browser 自测命令已提供",
  "mac-script-help-command": "Mac 脚本 help 安全自检命令已提供",
  "mac-script-help-failed": "Mac 脚本 help 自检失败",
  "mac-formal-local-smoke": "Mac 本机短验收需处理",
  "mac-formal-local-smoke-rerun": "Mac 本机短验收重跑命令已提供",
  "windows-reverse-grant-status": "Windows 反控授权状态命令已提供",
  "windows-open-one-time-reverse-grant": "Windows 一次性反控授权命令已提供",
  "windows-secure-auth-path": "Windows 安全认证路径已提供",
  "windows-firewall-status": "Windows 防火墙只读检查命令已提供",
  "windows-firewall-preview": "Windows 防火墙放行预览命令已提供",
  "windows-client-ports-occupied": "Windows 控制端诊断端口被占用",
  "windows-client-diagnostics-alt": "Windows 控制端备用诊断命令已提供",
  "windows-client-ports-owners": "Windows 控制端端口占用进程已提供",
  "mac-host-media-aggregate": "Mac 媒体基线需检查",
  "mac-host-runtime-display-round-trip": "Mac runtime/display 回环需检查",
  "mac-host-build": "Mac host 构建需检查",
  "mac-host-build-stale": "Mac host 运行版本偏旧",
  "mac-host-direct-start-defaults": "Mac host 默认启动安全需检查",
  "mac-host-start-helper-syntax": "Mac host 启动助手语法需检查",
  "mac-host-helper-dry-run": "Mac host 启动助手干跑需检查",
  "mac-host-file-clipboard-security": "Mac 文件剪贴板安全回归需检查",
  "mac-host-max-fps": "Mac host 刷新率上限需调整",
  "mac-host-max-screen-fps": "Mac host 刷新率上限需检查",
  "agent-link-board-currentcall": "联络板当前呼叫需协调",
  board: "联络板状态需检查",
  "agent-link-board": "联络板状态需检查",
  "windows-host": "Windows 被控端未指定或未就绪",
  "windows-lan-risk": "Windows 局域网风险需检查",
  "no-firewall-allow": "Windows 防火墙入站放行需检查",
  "public-profile": "Windows 当前网络是 Public",
  "lan-probe-blocked": "Windows LAN 探测被阻挡",
  "tcp-unreachable": "Windows TCP 端口不可达",
  "bind-address": "Windows 监听地址需检查",
  "no-listener": "Windows host 未监听",
  "no-lan-ip": "Windows 未发现局域网地址",
  "firewall-query-failed": "Windows 防火墙查询失败",
  "node-js": "Node.js 环境需检查",
  swift: "Swift 环境需检查",
  repo: "仓库状态需检查",
  "worktree-dirty": "仓库有未提交改动",
  build: "运行版本需检查",
  "stale-build": "运行版本偏旧",
  "stale-metadata": "运行版本元数据偏旧",
  video: "视频链路需检查",
  media: "媒体基线需检查",
  "h264-fallback": "当前不是 H.264 管线",
  "fps-limit": "Mac 刷新率上限需调整",
  "max-fps": "Mac 刷新率上限需检查",
  "max-screen-fps": "Mac 刷新率上限需检查",
  pipeline: "采集管线需检查",
  auth: "认证/密码步骤待确认",
  password: "密码步骤待确认",
  "client-page": "Mac 控制页需检查",
  "local-server": "本地控制页需检查",
  "screen-recording-missing": "屏幕录制权限缺失",
  "accessibility-missing": "辅助功能权限缺失",
  "input-monitoring-missing": "输入监控权限缺失",
  "not-ready": "值守未就绪",
  attention: "值守需要关注",
};
const macHeartbeatCommandSpecs = {
  once: {
    label: "MacHeartbeatOnce",
    text: "心跳一次",
    script: "watch-mac-heartbeat.mjs",
    required: ["--once", "--sendStatus", "--boardSummary"],
    defaultArgs: ["--once", "--sendStatus", "--host", "127.0.0.1", "--port", "{port}", "--server", "{server}", "--boardSummary"],
    logText: "单次心跳上板",
  },
  watch: {
    label: "MacHeartbeatWatch",
    text: "前台持续",
    script: "watch-mac-heartbeat.mjs",
    required: ["--sendStatus", "--intervalMs"],
    defaultArgs: ["--sendStatus", "--host", "127.0.0.1", "--port", "{port}", "--server", "{server}", "--intervalMs", "30000"],
    logText: "前台持续心跳",
  },
  start: {
    label: "MacHeartbeatStart",
    text: "后台启动",
    script: "start-mac-heartbeat-watcher.mjs",
    required: ["--boardSummary"],
    forbidden: ["--status", "--stop"],
    defaultArgs: ["--host", "127.0.0.1", "--port", "{port}", "--server", "{server}", "--intervalMs", "30000", "--boardSummary"],
    logText: "后台心跳启动",
  },
  status: {
    label: "MacHeartbeatStatus",
    text: "查状态",
    script: "start-mac-heartbeat-watcher.mjs",
    required: ["--status", "--boardSummary"],
    defaultArgs: ["--status", "--host", "127.0.0.1", "--port", "{port}", "--server", "{server}", "--boardSummary"],
    logText: "后台心跳状态",
  },
  stop: {
    label: "MacHeartbeatStop",
    text: "停止心跳",
    script: "start-mac-heartbeat-watcher.mjs",
    required: ["--stop", "--boardSummary"],
    defaultArgs: ["--stop", "--host", "127.0.0.1", "--port", "{port}", "--server", "{server}", "--boardSummary"],
    logText: "后台心跳停止",
  },
};
const videoDecoderStatusLabels = {
  idle: "待机",
  unsupported: "不支持",
  configuring: "初始化",
  configured: "已就绪",
  decoding: "解码中",
  "waiting-keyframe": "等待关键帧",
  recovering: "恢复中",
  resyncing: "重同步",
  rendering: "已绘制",
  "native-main-surface": "原生主画面",
  error: "解码错误",
  fallback: "JPEG 回退",
};
const clipboardModeLabels = {
  system: "系统",
  mock: "模拟",
  "memory-only": "内存",
  temp: "临时文件",
};
const fallbackDisplays = [
  {
    id: "main",
    name: "主显示器",
    width: 1920,
    height: 1080,
    primary: true,
  },
  {
    id: "secondary",
    name: "扩展显示器",
    width: 2560,
    height: 1440,
    primary: false,
  },
];

const fallbackDevices = [
  {
    id: "local-mock:127.0.0.1:43770",
    deviceName: "本地模拟 Mac",
    host: "127.0.0.1",
    port: "43770",
    platform: "macos",
    role: "host",
    transport: "local",
    status: "suggested",
    source: "内置模拟",
  },
  {
    id: "websocket-local:127.0.0.1:43770",
    deviceName: "本机 WebSocket 服务",
    host: "127.0.0.1",
    port: "43770",
    platform: "macos",
    role: "host",
    transport: "websocket",
    status: "suggested",
    source: "假 Mac 或 Windows 被控端",
  },
  {
    id: "mac-mini-example:192.168.1.23:43770",
    deviceName: "Mac mini 示例",
    host: "192.168.1.23",
    port: "43770",
    platform: "macos",
    role: "host",
    transport: "websocket",
    status: "manual",
    source: "手动填写后可连接",
  },
];

const connectionStates = {
  idle: { badge: "offline", label: "未连接", status: "未连接" },
  connecting: { badge: "connecting", label: "连接中", status: "正在建立局域网连接..." },
  authenticating: { badge: "connecting", label: "验证中", status: "正在验证连接密码..." },
  negotiating: { badge: "connecting", label: "协商中", status: "正在协商画面、声音和剪贴板能力..." },
  streaming: { badge: "online", label: "已连接", status: "正在接收远程画面。" },
  reconnecting: { badge: "connecting", label: "重连中", status: "连接中断，正在尝试恢复..." },
  disconnected: { badge: "offline", label: "已断开", status: "连接已断开。" },
  failed: { badge: "offline", label: "连接失败", status: "连接失败。" },
};

const errorMessages = {
  LAN001: "无法连接到目标 IP，请确认两台设备在同一局域网，且被控端服务已经启动。",
  LAN002: "连接密码错误，请重新输入连接密码。",
  LAN003: "目标端拒绝连接，请查看被控端状态。",
  LAN004: "Mac 缺少屏幕录制权限，请在系统设置中允许本应用录制屏幕。",
  LAN005: "Mac 缺少辅助功能权限，无法执行鼠标键盘控制。",
  LAN006: "协议版本不兼容，请同步两端到同一版本。",
  LAN007: "视频流中断，请检查局域网连接或降低刷新率/码率。",
  LAN008: "一键反控被拒绝，当前控制方向保持不变。",
  LAN011: "剪贴板同步失败，请检查剪贴板权限或关闭后重试。",
};

const state = {
  connected: false,
  connecting: false,
  inputEvents: 0,
  fullscreen: false,
  immersiveFullscreen: false,
  monitorMode: false,
  monitorModeDrag: null,
  client: null,
  activeHost: "",
  activePort: "",
  videoFrames: 0,
  videoWaitingSince: 0,
  videoLastFrameAt: 0,
  videoFrameTimes: [],
  videoFrameTimingSamples: [],
  lastVideoFrameAgeMs: null,
  lastVideoFrameTimestamp: "",
  videoFrameClockSkewed: false,
  requestedFps: 0,
  negotiatedFps: 0,
  actualVideoFps: 0,
  h264Decoder: null,
  h264DecoderKey: "",
  h264DecoderCodec: "",
  h264DecoderStatus: "idle",
  h264DecoderLastError: "",
  h264DecoderLatencyMs: 0,
  videoDecoderQueueMs: 0,
  videoDroppedStaleFrames: 0,
  videoLastDropReason: "",
  videoVisibilityHiddenAt: 0,
  h264VisibilityRecoveryCount: 0,
  h264VisibilityRecoveryLastAt: 0,
  h264DecoderErrorCount: 0,
  h264DecoderWarned: false,
  h264DecoderQueue: [],
  h264DecoderNeedsKeyFrame: true,
  h264SkippedDeltaFrames: 0,
  h264KeyFrameWaitStartedAt: 0,
  h264KeyFrameRecoveryLastRequestedAt: 0,
  h264RecoveryQueueGraceUntil: 0,
  h264RecoveryInFlight: false,
  h264RecoveryKeyFrameReceivedAt: 0,
  h264RecoveryFrameDrawnAt: 0,
  h264LiveBacklogRecoveryLastRequestedAt: 0,
  h264LiveBacklogRecoveryCount: 0,
  h264DecodedFrames: 0,
  h264ReceivedFrames: 0,
  h264ReceivedKeyFrames: 0,
  h264ReceivedDeltaFrames: 0,
  h264ReceivedSps: 0,
  h264ReceivedPps: 0,
  h264ReceivedIdr: 0,
  h264LastNalTypes: "",
  h264LastKeyFrameId: "",
  h264WebDecodeBypassedForNativeSurface: 0,
  h264WebDecodeBypassReason: "",
  h264WebDecodeBypassLastFrameId: "",
  w14NativeReceiverStarted: false,
  w14NativeReceiverPromise: null,
  w14NativeReceiverSnapshot: null,
  w14NativeReceiverSnapshotTimer: null,
  w14NativeReceiverLastError: "",
  w8NativeVideoSessionStarted: false,
  w8NativeVideoSessionPromise: null,
  w8NativeVideoPushPromise: null,
  w8NativeVideoFramesPushed: 0,
  w8NativeVideoDroppedFrames: 0,
  w8NativeVideoHasDecoderConfig: false,
  w8NativeVideoCodecString: "",
  w8NativeVideoNativeNalTypes: "",
  w8NativeVideoNativeHasSps: false,
  w8NativeVideoNativeHasPps: false,
  w8NativeVideoNativeHasIdr: false,
  w8NativeVideoNativeIsKeyframe: false,
  w8NativeVideoNativeKeyFrames: 0,
  w8NativeVideoNativeSpsCount: 0,
  w8NativeVideoNativePpsCount: 0,
  w8NativeVideoNativeIdrCount: 0,
  w8NativeVideoNativeByteLen: 0,
  w8NativeVideoDecoderProbePromise: null,
  w8NativeVideoDecoderReady: false,
  w8NativeVideoDecoderMode: "",
  w8NativeVideoDecoderReason: "",
  w8NativeVideoD3dFeatureLevel: "",
  w8NativeVideoDecoderInitReady: false,
  w8NativeVideoDecoderInitMode: "",
  w8NativeVideoDecoderInitReason: "",
  w8NativeVideoDecoderInitOutputSubtypes: "",
  w8NativeVideoDecodeStepReady: false,
  w8NativeVideoDecodeStepMode: "",
  w8NativeVideoDecodeStepReason: "",
  w8NativeVideoDecodeStepStatus: "",
  w8NativeVideoDecoderSessionActive: false,
  w8NativeVideoDecoderSessionMode: "",
  w8NativeVideoDecoderSessionReason: "",
  w8NativeVideoDecoderSessionStatus: "",
  w8NativeVideoDecoderSessionOutputSubtype: "",
  w8NativeVideoDecoderSessionSubmittedFrames: 0,
  w8NativeVideoDecoderSessionAcceptedInputFrames: 0,
  w8NativeVideoDecoderSessionDecodedFrames: 0,
  w8NativeVideoDecoderSessionWorkerThread: false,
  w8NativeVideoDecoderSessionWorkerMode: "",
  w8NativeVideoDecoderSessionWorkerStatus: "",
  w8NativeVideoFrameHandoffActive: false,
  w8NativeVideoFrameHandoffMode: "",
  w8NativeVideoFrameHandoffStatus: "",
  w8NativeVideoLatestFrameFormat: "",
  w8NativeVideoLatestFrameBytes: 0,
  w8NativeVideoLatestFrameId: null,
  w8NativeVideoLatestFrameUpdatedAtMs: 0,
  w8NativeVideoNativeSurfaceReady: false,
  w8NativeVideoNativeSurfaceMode: "",
  w8NativeVideoNativeSurfaceStatus: "",
  w8NativeVideoNativeSurfaceFormat: "",
  w8NativeVideoNativeSurfaceWidth: 0,
  w8NativeVideoNativeSurfaceHeight: 0,
  w8NativeVideoNativeSurfaceReason: "",
  w8NativeVideoNativeSurfaceCopyStatus: "",
  w8NativeVideoNativeSurfaceCopyBytes: 0,
  w8NativeVideoNativeSurfacePresentedFrames: 0,
  w8NativeVideoNativeSurfaceLastFrameId: null,
  w8NativeVideoNativeSurfaceUpdatedAtMs: 0,
  w8NativeVideoNativePresentReady: false,
  w8NativeVideoNativePresentMode: "",
  w8NativeVideoNativePresentStatus: "",
  w8NativeVideoNativePresentFormat: "",
  w8NativeVideoNativePresentWidth: 0,
  w8NativeVideoNativePresentHeight: 0,
  w8NativeVideoNativePresentFrames: 0,
  w8NativeVideoNativePresentLastFrameId: null,
  w8NativeVideoNativePresentUpdatedAtMs: 0,
  w8NativeVideoNativePresentReason: "",
  w8NativeVideoFreshnessStatus: "",
  w8NativeVideoPresentFrameLag: 0,
  w8NativeVideoPresentAgeMs: 0,
  w8NativeVideoWindowSwapchainProbePromise: null,
  w8NativeVideoWindowSwapchainReady: false,
  w8NativeVideoWindowSwapchainMode: "",
  w8NativeVideoWindowSwapchainStatus: "",
  w8NativeVideoWindowSwapchainFormat: "",
  w8NativeVideoWindowSwapchainWidth: 0,
  w8NativeVideoWindowSwapchainHeight: 0,
  w8NativeVideoWindowSwapchainBufferCount: 0,
  w8NativeVideoWindowSwapchainSwapEffect: "",
  w8NativeVideoWindowSwapchainReason: "",
  w8NativeVideoErrors: 0,
  w8NativeVideoLastError: "",
  w8NativeVideoLastSnapshot: null,
  w8NativeVideoProgressSamples: [],
  w8NativeVideoProgressStatus: "",
  w8NativeVideoProgressNext: "",
  w8NativeVideoProgressWindowMs: 0,
  w8NativeVideoPresentFrameDelta: 0,
  w8NativeVideoPresentFps: 0,
  w8NativeVideoDecodedFrameDelta: 0,
  w8NativeVideoDecodedFps: 0,
  w8NativeVideoWebBypassDelta: 0,
  w8NativeVideoWebBypassFps: 0,
  w8NativeVideoFramesPushedDelta: 0,
  w8NativeVideoSubmittedFrameDelta: 0,
  h264FallbackActive: false,
  h264FallbackReason: "",
  h264FallbackRecoveryDueAt: 0,
  h264FallbackRecoveryJpegFrames: 0,
  h264FallbackRecoveryRequested: false,
  h264FallbackRecoveryCount: 0,
  h264FallbackLastReason: "",
  h264FallbackRecoveryPausedUntil: 0,
  h264FallbackRecoveryPauseCount: 0,
  h264FallbackRecoveryTimestamps: [],
  audioFrames: 0,
  audioFrameTimes: [],
  audioFrameTimingSamples: [],
  audioLastFrameAt: 0,
  audioWaitingSince: 0,
  audioLevel: 0,
  audioContext: null,
  audioGain: null,
  audioNextPlayTime: 0,
  audioScheduledSources: [],
  audioPlayedFrames: 0,
  audioDroppedFrames: 0,
  audioLatencyTrimmedFrames: 0,
  audioResyncCount: 0,
  audioUnderrunCount: 0,
  audioStablePrebufferCount: 0,
  audioLastUnderrunAt: 0,
  audioLastDropReason: "",
  audioLastBufferReason: "",
  audioVisibilityHiddenAt: 0,
  audioVisibilityRecoveryCount: 0,
  audioVisibilityRecoveryLastAt: 0,
  audioLastError: "",
  audioLastStatusUpdateAt: 0,
  audioLastRenderedDroppedFrames: 0,
  nativeAudioRunning: false,
  nativeAudioSampleRate: 0,
  nativeAudioChannels: 0,
  nativeAudioSnapshot: null,
  recentConnections: [],
  localHostRunning: false,
  localHostOnline: false,
  localHostBusy: false,
  localHostPollTimer: null,
  localMacAlertWatcherRunning: false,
  localMacAlertWatcherBusy: false,
  localMacAlertWatcherStatusCheckedAt: 0,
  localMacAlertWatcherFindingText: "",
  connectionState: "idle",
  remoteDisplays: fallbackDisplays,
  activeDisplayId: "main",
  remoteFrameWidth: 1920,
  remoteFrameHeight: 1080,
  lastFrameDecodeErrorId: "",
  applyingQualityPreset: false,
  manualDisconnect: false,
  reconnectAttempts: 0,
  reconnectTimer: null,
  reconnectCountdownTimer: null,
  reconnectStableTimer: null,
  reconnectDueAt: 0,
  reconnectReason: "",
  copyDiagnosticsFeedbackTimer: null,
  clipboardSequence: 0,
  localClipboardStatusText: "",
  fileTransferSequence: 0,
  fileTransferActive: false,
  outgoingFileTransfer: null,
  lastOutgoingFileTransfer: null,
  remoteFileTransfers: new Map(),
  receivedClipboardFiles: [],
  receivedClipboardTempPath: "",
  receivedClipboardWriteStatus: {
    kind: "",
    text: "",
  },
  lastRemotePointer: null,
  remotePointerButtonsDown: new Set(),
  pointerOutsideFrameNoticeAt: 0,
  fullscreenHintTimer: null,
  controlDirection: "windows_to_mac",
  pendingControlDirection: "",
  reverseRequestId: "",
  reverseRequestTimer: null,
  reverseStateDetail: "你当前是控制方",
  logEntries: [],
  discoveredDevices: fallbackDevices,
  hostDiagnostics: {
    hostMode: "",
    capturePipeline: "",
    permissions: null,
    clipboardText: null,
    clipboardFile: null,
    clipboardTextMode: "",
    clipboardFileMode: "",
    inputMode: "",
    inputAckStatus: "",
    inputAckEvent: "",
    inputAckReason: "",
    inputAckCode: "",
    videoCodec: "",
    videoEncoding: "",
    videoSource: "",
    droppedFrames: null,
    videoFrameAgeMs: null,
    videoFrameTimestamp: "",
    videoFrameClockSkewed: false,
    qualityPreset: "",
    jpegQuality: null,
    videoDecoderStatus: "",
    videoDecoderCodec: "",
    videoDecoderErrors: 0,
    videoDecoderQueue: 0,
    h264DecodedFrames: 0,
    h264DecoderLatencyMs: 0,
    h264ReceivedFrames: 0,
    h264ReceivedKeyFrames: 0,
    h264ReceivedDeltaFrames: 0,
    h264ReceivedSps: 0,
    h264ReceivedPps: 0,
    h264ReceivedIdr: 0,
    h264LastNalTypes: "",
    h264LastKeyFrameId: "",
    h264WebDecodeBypassedForNativeSurface: 0,
    h264WebDecodeBypassReason: "",
    h264WebDecodeBypassLastFrameId: "",
    w14NativeReceiverRunning: false,
    w14NativeReceiverStatus: "",
    w14NativeReceiverTransport: "",
    w14NativeReceiverMediaOwner: "",
    w14NativeReceiverConnected: false,
    w14NativeReceiverAuthenticated: false,
    w14NativeReceiverSessionActive: false,
    w14NativeReceiverLastError: "",
    w14NativeVideoFrames: 0,
    w14NativeVideoH264Frames: 0,
    w14NativeVideoLastFrameId: null,
    w14NativeVideoLastFrameReceivedAtMs: 0,
    w14NativeVideoLastCodec: "",
    w14NativeVideoLastEncoding: "",
    w14NativeVideoRunning: false,
    w14NativeVideoRendererMode: "",
    w14NativeVideoPushedFrames: 0,
    w14NativeVideoAcceptedFrames: 0,
    w14NativeVideoDroppedFrames: 0,
    w14NativeVideoQueueMs: 0,
    w14NativeVideoDecodedFrames: 0,
    w14NativeVideoPresentFrames: 0,
    w14NativeVideoPresenting: false,
    w14NativeVideoLastPushedFrameId: null,
    w14NativeVideoLatestFrameId: null,
    w14NativeVideoSurfaceFrameId: null,
    w14NativeVideoPresentFrameId: null,
    w14NativeVideoLatestFrameUpdatedAtMs: 0,
    w14NativeVideoSurfaceUpdatedAtMs: 0,
    w14NativeVideoPresentUpdatedAtMs: 0,
    w14NativeVideoFreshnessStatus: "",
    w14NativeVideoPresentFrameLag: 0,
    w14NativeVideoPresentAgeMs: 0,
    w14NativeVideoLastStatus: "",
    w14NativeVideoLastReason: "",
    w14NativeVideoLastError: "",
    w14NativeAudioFrames: 0,
    w14NativeAudioLastCodec: "",
    w14NativeAudioLastEncoding: "",
    w14NativeAudioSampleRate: 0,
    w14NativeAudioChannels: 0,
    w14NativeAudioPlaybackRunning: false,
    w14NativeAudioPlaybackQueueMs: 0,
    w14NativeAudioPlaybackPushedFrames: 0,
    w14NativeAudioPlaybackPlayedFrames: 0,
    w14NativeAudioPlaybackTrimmedFrames: 0,
    w14NativeAudioPlaybackUnderruns: 0,
    w14NativeAudioPlaybackDroppedFrames: 0,
    w14NativeAudioOutputCallbacks: 0,
    w14NativeAudioOutputCallbackFrames: 0,
    w14NativeAudioOutputSignalCallbacks: 0,
    w14NativeAudioOutputSilentCallbacks: 0,
    w14NativeAudioOutputPeakMilli: 0,
    w14NativeAudioOutputRmsMilli: 0,
    w14NativeAudioOutputBufferFrames: 0,
    w14NativeAudioOutputBufferMs: 0,
    w14NativeAudioOutputLowLatency: false,
    w14NativeAudioOutputDeviceName: "",
    w14NativeAudioOutputSampleFormat: "",
    w14NativeAudioOutputStreamRunning: false,
    w8NativeVideoFramesPushed: 0,
    w8NativeVideoQueueMs: 0,
    w8NativeVideoDroppedFrames: 0,
    w8NativeVideoHasDecoderConfig: false,
    w8NativeVideoCodecString: "",
    w8NativeVideoNativeNalTypes: "",
    w8NativeVideoNativeHasSps: false,
    w8NativeVideoNativeHasPps: false,
    w8NativeVideoNativeHasIdr: false,
    w8NativeVideoNativeIsKeyframe: false,
    w8NativeVideoNativeKeyFrames: 0,
    w8NativeVideoNativeSpsCount: 0,
    w8NativeVideoNativePpsCount: 0,
    w8NativeVideoNativeIdrCount: 0,
    w8NativeVideoNativeByteLen: 0,
    w8NativeVideoDecoderReady: false,
    w8NativeVideoDecoderMode: "",
    w8NativeVideoDecoderReason: "",
    w8NativeVideoD3dFeatureLevel: "",
    w8NativeVideoDecoderInitReady: false,
    w8NativeVideoDecoderInitMode: "",
    w8NativeVideoDecoderInitReason: "",
    w8NativeVideoDecoderInitOutputSubtypes: "",
    w8NativeVideoDecodeStepReady: false,
    w8NativeVideoDecodeStepMode: "",
    w8NativeVideoDecodeStepReason: "",
    w8NativeVideoDecodeStepStatus: "",
    w8NativeVideoDecoderSessionActive: false,
    w8NativeVideoDecoderSessionMode: "",
    w8NativeVideoDecoderSessionReason: "",
    w8NativeVideoDecoderSessionStatus: "",
    w8NativeVideoDecoderSessionOutputSubtype: "",
    w8NativeVideoDecoderSessionSubmittedFrames: 0,
    w8NativeVideoDecoderSessionAcceptedInputFrames: 0,
    w8NativeVideoDecoderSessionDecodedFrames: 0,
    w8NativeVideoDecoderSessionWorkerThread: false,
    w8NativeVideoDecoderSessionWorkerMode: "",
    w8NativeVideoDecoderSessionWorkerStatus: "",
    w8NativeVideoFrameHandoffActive: false,
    w8NativeVideoFrameHandoffMode: "",
    w8NativeVideoFrameHandoffStatus: "",
    w8NativeVideoLatestFrameFormat: "",
    w8NativeVideoLatestFrameBytes: 0,
    w8NativeVideoLatestFrameId: null,
    w8NativeVideoLatestFrameUpdatedAtMs: 0,
    w8NativeVideoNativeSurfaceReady: false,
    w8NativeVideoNativeSurfaceMode: "",
    w8NativeVideoNativeSurfaceStatus: "",
    w8NativeVideoNativeSurfaceFormat: "",
    w8NativeVideoNativeSurfaceWidth: 0,
    w8NativeVideoNativeSurfaceHeight: 0,
    w8NativeVideoNativeSurfaceReason: "",
    w8NativeVideoNativeSurfaceCopyStatus: "",
    w8NativeVideoNativeSurfaceCopyBytes: 0,
    w8NativeVideoNativeSurfacePresentedFrames: 0,
    w8NativeVideoNativeSurfaceLastFrameId: null,
    w8NativeVideoNativeSurfaceUpdatedAtMs: 0,
    w8NativeVideoNativePresentReady: false,
    w8NativeVideoNativePresentMode: "",
    w8NativeVideoNativePresentStatus: "",
    w8NativeVideoNativePresentFormat: "",
    w8NativeVideoNativePresentWidth: 0,
    w8NativeVideoNativePresentHeight: 0,
    w8NativeVideoNativePresentFrames: 0,
    w8NativeVideoNativePresentLastFrameId: null,
    w8NativeVideoNativePresentUpdatedAtMs: 0,
    w8NativeVideoNativePresentReason: "",
    w8NativeVideoFreshnessStatus: "",
    w8NativeVideoPresentFrameLag: 0,
    w8NativeVideoPresentAgeMs: 0,
    w8NativeVideoWindowSwapchainReady: false,
    w8NativeVideoWindowSwapchainMode: "",
    w8NativeVideoWindowSwapchainStatus: "",
    w8NativeVideoWindowSwapchainFormat: "",
    w8NativeVideoWindowSwapchainWidth: 0,
    w8NativeVideoWindowSwapchainHeight: 0,
    w8NativeVideoWindowSwapchainBufferCount: 0,
    w8NativeVideoWindowSwapchainSwapEffect: "",
    w8NativeVideoWindowSwapchainReason: "",
    w8NativeVideoLastReason: "",
    w8NativeVideoErrors: 0,
    w8NativeVideoLastError: "",
    w8NativeVideoProgressStatus: "",
    w8NativeVideoProgressNext: "",
    w8NativeVideoProgressWindowMs: 0,
    w8NativeVideoPresentFrameDelta: 0,
    w8NativeVideoPresentFps: 0,
    w8NativeVideoDecodedFrameDelta: 0,
    w8NativeVideoDecodedFps: 0,
    w8NativeVideoWebBypassDelta: 0,
    w8NativeVideoWebBypassFps: 0,
    w8NativeVideoFramesPushedDelta: 0,
    w8NativeVideoSubmittedFrameDelta: 0,
    videoDecoderQueueMs: 0,
    videoDroppedStaleFrames: 0,
    videoLastDropReason: "",
    h264FallbackReason: "",
    h264FallbackRecoveryCount: 0,
    h264FallbackLastReason: "",
    h264FallbackRecoveryPausedMs: 0,
    h264FallbackRecoveryPauseCount: 0,
    streamFallbackReason: "",
    maxScreenFps: null,
    runtime: null,
    warnedMockFrame: false,
  },
};

function nowTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

function addLog(title, detail = "") {
  const entry = {
    time: new Date().toISOString(),
    title,
    detail,
  };
  state.logEntries.unshift(entry);
  if (state.logEntries.length > maxStoredLogEntries) {
    state.logEntries.length = maxStoredLogEntries;
  }

  const item = document.createElement("li");
  const titleElement = document.createElement("strong");
  titleElement.textContent = title;
  const detailText = document.createTextNode(detail ? ` · ${detail}` : "");
  const breakElement = document.createElement("br");
  const timeElement = document.createElement("span");
  timeElement.textContent = nowTime();
  item.append(titleElement, detailText, breakElement, timeElement);
  elements.eventLog.prepend(item);

  while (elements.eventLog.children.length > 24) {
    elements.eventLog.lastElementChild.remove();
  }
}

function setBadge(mode, text) {
  elements.connectionBadge.className = `status-badge ${mode}`;
  elements.connectionBadge.textContent = text;
}

function setConnectionState(nextState, detail = "") {
  const stateConfig = connectionStates[nextState] ?? connectionStates.idle;
  state.connectionState = nextState;
  setBadge(stateConfig.badge, stateConfig.label);
  elements.statusText.textContent = detail || stateConfig.status;
  elements.remoteStatusText.textContent = detail || stateConfig.status;
  syncFloatingControlCenter();
}

function clearReverseControlTimer() {
  if (state.reverseRequestTimer) {
    window.clearTimeout(state.reverseRequestTimer);
    state.reverseRequestTimer = null;
  }
}

function getControlDirectionLabel(direction) {
  return direction === "mac_to_windows" ? "Mac 控制 Windows" : "Windows 控制 Mac";
}

function getDefaultReverseStateDetail(direction = state.controlDirection) {
  return direction === "mac_to_windows" ? "你当前是被控方" : "你当前是控制方";
}

function getNextControlDirection(direction = state.controlDirection) {
  return direction === "mac_to_windows" ? "windows_to_mac" : "mac_to_windows";
}

function getInputModeStatusText(inputMode) {
  if (inputMode === "log") return "安全日志，不会真正控制";
  if (inputMode === "inject") return "真实控制";
  if (inputMode === "mock") return "模拟记录";
  if (inputMode === "auth") return "等待认证";
  return inputMode ? labelFromMap(inputMode, inputModeLabels) : "";
}

function getInputAckStatusText(diagnostics = state.hostDiagnostics) {
  if (!diagnostics.inputAckStatus) return "";
  const text = labelFromMap(diagnostics.inputAckStatus, inputAckStatusLabels);
  if (diagnostics.inputAckStatus !== "rejected") return text;
  const detail = [diagnostics.inputAckCode, diagnostics.inputAckReason].filter(Boolean).join(" ");
  return detail ? `${text} ${detail}` : text;
}

function formatInputStatusDetail(diagnostics = state.hostDiagnostics) {
  const parts = [];
  const modeText = getInputModeStatusText(diagnostics.inputMode);
  const ackText = getInputAckStatusText(diagnostics);
  if (modeText) parts.push(modeText);
  if (ackText) parts.push(ackText);
  return parts.join(" / ");
}

function getInputExportStatus() {
  if (state.connected && state.controlDirection === "mac_to_windows") {
    return "暂停（当前由 Mac 控制）";
  }
  if (state.monitorMode) {
    return `${state.inputEvents}（只监看，不发送输入）`;
  }
  const detail = formatInputStatusDetail();
  return `${state.inputEvents}${detail ? `（${detail}）` : ""}`;
}

function updateInputStatus() {
  if (state.connected && state.controlDirection === "mac_to_windows") {
    elements.inputText.textContent = "输入事件：暂停（当前由 Mac 控制）";
    syncFloatingControlStatus();
    return;
  }

  if (state.monitorMode) {
    elements.inputText.textContent = `输入事件：${state.inputEvents}（只监看，不发送输入）`;
    syncFloatingControlStatus();
    return;
  }

  const detail = formatInputStatusDetail();
  elements.inputText.textContent = `输入事件：${state.inputEvents}${detail ? `（${detail}）` : ""}`;
  syncFloatingControlStatus();
}

function updateReverseControlUi() {
  elements.directionText.textContent = getControlDirectionLabel(state.controlDirection);
  elements.reverseStateText.textContent = state.reverseStateDetail;
  elements.directionIndicator.classList.toggle("is-pending", Boolean(state.reverseRequestId));
  elements.directionIndicator.classList.toggle(
    "is-reversed",
    state.controlDirection === "mac_to_windows",
  );
  elements.reverseButtonText.textContent =
    state.controlDirection === "mac_to_windows" ? "请求切回" : "请求反控";
  elements.reverseButton.disabled =
    !state.connected || state.connecting || Boolean(state.reconnectTimer) || Boolean(state.reverseRequestId);
  updateInputStatus();
}

function resetReverseControlState() {
  clearReverseControlTimer();
  state.controlDirection = "windows_to_mac";
  state.pendingControlDirection = "";
  state.reverseRequestId = "";
  state.reverseStateDetail = getDefaultReverseStateDetail("windows_to_mac");
  updateReverseControlUi();
}

function canSendControlInput() {
  return state.connected && state.controlDirection === "windows_to_mac" && !state.monitorMode;
}

function getAuthErrorMessage(error) {
  const attemptsRemaining = Number(error?.attemptsRemaining);
  if (Number.isFinite(attemptsRemaining)) {
    if (attemptsRemaining <= 0) {
      return "连接密码错误次数过多，被控端已关闭连接，请检查密码后重新连接。";
    }
    return `连接密码错误，还可尝试 ${attemptsRemaining} 次。`;
  }
  return error?.message || errorMessages.LAN002;
}

function getErrorMessage(error) {
  const code = error?.code;
  if (code === "LAN002") {
    return getAuthErrorMessage(error);
  }
  if (code && errorMessages[code]) {
    return errorMessages[code];
  }
  return error?.message || "发生未知错误。";
}

function shouldRetryConnection(error) {
  const code = error?.code;
  return code !== "LAN002" && code !== "LAN006";
}

function getEmptyHostDiagnostics() {
  return {
    hostMode: "",
    capturePipeline: "",
    permissions: null,
    clipboardText: null,
    clipboardFile: null,
    clipboardTextMode: "",
    clipboardFileMode: "",
    inputMode: "",
    inputAckStatus: "",
    inputAckEvent: "",
    inputAckReason: "",
    inputAckCode: "",
    videoCodec: "",
    videoEncoding: "",
    videoSource: "",
    droppedFrames: null,
    videoFrameAgeMs: null,
    videoFrameTimestamp: "",
    videoFrameClockSkewed: false,
    qualityPreset: "",
    jpegQuality: null,
    videoDecoderStatus: "",
    videoDecoderCodec: "",
    videoDecoderErrors: 0,
    videoDecoderQueue: 0,
    h264DecodedFrames: 0,
    h264DecoderLatencyMs: 0,
    h264ReceivedFrames: 0,
    h264ReceivedKeyFrames: 0,
    h264ReceivedDeltaFrames: 0,
    h264ReceivedSps: 0,
    h264ReceivedPps: 0,
    h264ReceivedIdr: 0,
    h264LastNalTypes: "",
    h264LastKeyFrameId: "",
    h264WebDecodeBypassedForNativeSurface: 0,
    h264WebDecodeBypassReason: "",
    h264WebDecodeBypassLastFrameId: "",
    w14NativeReceiverRunning: false,
    w14NativeReceiverStatus: "",
    w14NativeReceiverTransport: "",
    w14NativeReceiverMediaOwner: "",
    w14NativeReceiverConnected: false,
    w14NativeReceiverAuthenticated: false,
    w14NativeReceiverSessionActive: false,
    w14NativeReceiverLastError: "",
    w14NativeVideoFrames: 0,
    w14NativeVideoH264Frames: 0,
    w14NativeVideoLastFrameId: null,
    w14NativeVideoLastFrameReceivedAtMs: 0,
    w14NativeVideoLastCodec: "",
    w14NativeVideoLastEncoding: "",
    w14NativeVideoRunning: false,
    w14NativeVideoRendererMode: "",
    w14NativeVideoPushedFrames: 0,
    w14NativeVideoAcceptedFrames: 0,
    w14NativeVideoDroppedFrames: 0,
    w14NativeVideoQueueMs: 0,
    w14NativeVideoDecodedFrames: 0,
    w14NativeVideoPresentFrames: 0,
    w14NativeVideoPresenting: false,
    w14NativeVideoLastPushedFrameId: null,
    w14NativeVideoLatestFrameId: null,
    w14NativeVideoSurfaceFrameId: null,
    w14NativeVideoPresentFrameId: null,
    w14NativeVideoLatestFrameUpdatedAtMs: 0,
    w14NativeVideoSurfaceUpdatedAtMs: 0,
    w14NativeVideoPresentUpdatedAtMs: 0,
    w14NativeVideoFreshnessStatus: "",
    w14NativeVideoPresentFrameLag: 0,
    w14NativeVideoPresentAgeMs: 0,
    w14NativeVideoLastStatus: "",
    w14NativeVideoLastReason: "",
    w14NativeVideoLastError: "",
    w14NativeAudioFrames: 0,
    w14NativeAudioLastCodec: "",
    w14NativeAudioLastEncoding: "",
    w14NativeAudioSampleRate: 0,
    w14NativeAudioChannels: 0,
    w14NativeAudioPlaybackRunning: false,
    w14NativeAudioPlaybackQueueMs: 0,
    w14NativeAudioPlaybackPushedFrames: 0,
    w14NativeAudioPlaybackPlayedFrames: 0,
    w14NativeAudioPlaybackTrimmedFrames: 0,
    w14NativeAudioPlaybackUnderruns: 0,
    w14NativeAudioPlaybackDroppedFrames: 0,
    w14NativeAudioOutputCallbacks: 0,
    w14NativeAudioOutputCallbackFrames: 0,
    w14NativeAudioOutputSignalCallbacks: 0,
    w14NativeAudioOutputSilentCallbacks: 0,
    w14NativeAudioOutputPeakMilli: 0,
    w14NativeAudioOutputRmsMilli: 0,
    w14NativeAudioOutputBufferFrames: 0,
    w14NativeAudioOutputBufferMs: 0,
    w14NativeAudioOutputLowLatency: false,
    w14NativeAudioOutputDeviceName: "",
    w14NativeAudioOutputSampleFormat: "",
    w14NativeAudioOutputStreamRunning: false,
    w8NativeVideoFramesPushed: 0,
    w8NativeVideoQueueMs: 0,
    w8NativeVideoDroppedFrames: 0,
    w8NativeVideoHasDecoderConfig: false,
    w8NativeVideoCodecString: "",
    w8NativeVideoNativeNalTypes: "",
    w8NativeVideoNativeHasSps: false,
    w8NativeVideoNativeHasPps: false,
    w8NativeVideoNativeHasIdr: false,
    w8NativeVideoNativeIsKeyframe: false,
    w8NativeVideoNativeKeyFrames: 0,
    w8NativeVideoNativeSpsCount: 0,
    w8NativeVideoNativePpsCount: 0,
    w8NativeVideoNativeIdrCount: 0,
    w8NativeVideoNativeByteLen: 0,
    w8NativeVideoDecoderReady: false,
    w8NativeVideoDecoderMode: "",
    w8NativeVideoDecoderReason: "",
    w8NativeVideoD3dFeatureLevel: "",
    w8NativeVideoDecoderInitReady: false,
    w8NativeVideoDecoderInitMode: "",
    w8NativeVideoDecoderInitReason: "",
    w8NativeVideoDecoderInitOutputSubtypes: "",
    w8NativeVideoDecodeStepReady: false,
    w8NativeVideoDecodeStepMode: "",
    w8NativeVideoDecodeStepReason: "",
    w8NativeVideoDecodeStepStatus: "",
    w8NativeVideoDecoderSessionActive: false,
    w8NativeVideoDecoderSessionMode: "",
    w8NativeVideoDecoderSessionReason: "",
    w8NativeVideoDecoderSessionStatus: "",
    w8NativeVideoDecoderSessionOutputSubtype: "",
    w8NativeVideoDecoderSessionSubmittedFrames: 0,
    w8NativeVideoDecoderSessionAcceptedInputFrames: 0,
    w8NativeVideoDecoderSessionDecodedFrames: 0,
    w8NativeVideoDecoderSessionWorkerThread: false,
    w8NativeVideoDecoderSessionWorkerMode: "",
    w8NativeVideoDecoderSessionWorkerStatus: "",
    w8NativeVideoFrameHandoffActive: false,
    w8NativeVideoFrameHandoffMode: "",
    w8NativeVideoFrameHandoffStatus: "",
    w8NativeVideoLatestFrameFormat: "",
    w8NativeVideoLatestFrameBytes: 0,
    w8NativeVideoLatestFrameId: null,
    w8NativeVideoLatestFrameUpdatedAtMs: 0,
    w8NativeVideoNativeSurfaceReady: false,
    w8NativeVideoNativeSurfaceMode: "",
    w8NativeVideoNativeSurfaceStatus: "",
    w8NativeVideoNativeSurfaceFormat: "",
    w8NativeVideoNativeSurfaceWidth: 0,
    w8NativeVideoNativeSurfaceHeight: 0,
    w8NativeVideoNativeSurfaceReason: "",
    w8NativeVideoNativeSurfaceCopyStatus: "",
    w8NativeVideoNativeSurfaceCopyBytes: 0,
    w8NativeVideoNativeSurfacePresentedFrames: 0,
    w8NativeVideoNativeSurfaceLastFrameId: null,
    w8NativeVideoNativeSurfaceUpdatedAtMs: 0,
    w8NativeVideoNativePresentReady: false,
    w8NativeVideoNativePresentMode: "",
    w8NativeVideoNativePresentStatus: "",
    w8NativeVideoNativePresentFormat: "",
    w8NativeVideoNativePresentWidth: 0,
    w8NativeVideoNativePresentHeight: 0,
    w8NativeVideoNativePresentFrames: 0,
    w8NativeVideoNativePresentLastFrameId: null,
    w8NativeVideoNativePresentUpdatedAtMs: 0,
    w8NativeVideoNativePresentReason: "",
    w8NativeVideoFreshnessStatus: "",
    w8NativeVideoPresentFrameLag: 0,
    w8NativeVideoPresentAgeMs: 0,
    w8NativeVideoWindowSwapchainReady: false,
    w8NativeVideoWindowSwapchainMode: "",
    w8NativeVideoWindowSwapchainStatus: "",
    w8NativeVideoWindowSwapchainFormat: "",
    w8NativeVideoWindowSwapchainWidth: 0,
    w8NativeVideoWindowSwapchainHeight: 0,
    w8NativeVideoWindowSwapchainBufferCount: 0,
    w8NativeVideoWindowSwapchainSwapEffect: "",
    w8NativeVideoWindowSwapchainReason: "",
    w8NativeVideoLastReason: "",
    w8NativeVideoErrors: 0,
    w8NativeVideoLastError: "",
    w8NativeVideoProgressStatus: "",
    w8NativeVideoProgressNext: "",
    w8NativeVideoProgressWindowMs: 0,
    w8NativeVideoPresentFrameDelta: 0,
    w8NativeVideoPresentFps: 0,
    w8NativeVideoDecodedFrameDelta: 0,
    w8NativeVideoDecodedFps: 0,
    w8NativeVideoWebBypassDelta: 0,
    w8NativeVideoWebBypassFps: 0,
    w8NativeVideoFramesPushedDelta: 0,
    w8NativeVideoSubmittedFrameDelta: 0,
    videoDecoderQueueMs: 0,
    videoDroppedStaleFrames: 0,
    videoLastDropReason: "",
    h264FallbackReason: "",
    h264FallbackRecoveryCount: 0,
    h264FallbackLastReason: "",
    h264FallbackRecoveryPausedMs: 0,
    h264FallbackRecoveryPauseCount: 0,
    streamFallbackReason: "",
    maxScreenFps: null,
    runtime: null,
    warnedMockFrame: false,
  };
}

function normalizeOptionalBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function labelFromMap(value, labels) {
  const normalized = String(value ?? "");
  return labels[normalized] ?? normalized;
}

function formatPermissionItem(permissions, key, label) {
  const value = normalizeOptionalBoolean(permissions?.[key]);
  if (value === true) return `${label}已开`;
  if (value === false) return `${label}未开`;
  return `${label}未知`;
}

function formatPermissionStatus(permissions) {
  if (!permissions || typeof permissions !== "object") {
    return "";
  }

  return [
    formatPermissionItem(permissions, "screenRecording", "屏幕录制"),
    formatPermissionItem(permissions, "accessibility", "辅助功能"),
    formatPermissionItem(permissions, "inputMonitoring", "输入监控"),
  ].join("，");
}

function formatClipboardCapability(enabled, mode) {
  const normalizedEnabled = normalizeOptionalBoolean(enabled);
  if (normalizedEnabled === false) return "关闭";
  if (mode) return labelFromMap(mode, clipboardModeLabels);
  if (normalizedEnabled === true) return "已协商";
  return "";
}

function formatJpegQuality(value) {
  const quality = Number(value);
  if (!Number.isFinite(quality) || quality <= 0) {
    return "";
  }
  return `质量 ${Math.round(quality * 100)}%`;
}

function normalizeHostRuntime(runtime) {
  if (!runtime || typeof runtime !== "object") {
    return null;
  }

  const processId = runtime.processId ?? runtime.pid ?? "";
  const startedAt = runtime.startedAt ? String(runtime.startedAt) : "";
  const uptimeSeconds = Number(runtime.uptimeSeconds);
  const buildId = runtime.buildId ? String(runtime.buildId) : "";
  const normalized = {
    processId: processId === null || processId === undefined ? "" : String(processId),
    startedAt,
    uptimeSeconds: Number.isFinite(uptimeSeconds) && uptimeSeconds >= 0 ? uptimeSeconds : null,
    buildId,
  };

  if (
    !normalized.processId &&
    !normalized.startedAt &&
    normalized.uptimeSeconds === null &&
    !normalized.buildId
  ) {
    return null;
  }

  return normalized;
}

function formatRuntimeUptime(seconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return remainHours > 0 ? `${days}d ${remainHours}h` : `${days}d`;
}

function formatRuntimeStartedAt(startedAt) {
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) {
    return startedAt;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatHostRuntimeDiagnostics(runtime) {
  const normalized = normalizeHostRuntime(runtime);
  if (!normalized) {
    return "";
  }

  const parts = [];
  if (normalized.processId) {
    parts.push(`PID ${normalized.processId}`);
  }
  if (normalized.uptimeSeconds !== null) {
    parts.push(`已运行 ${formatRuntimeUptime(normalized.uptimeSeconds)}`);
  }
  if (normalized.startedAt) {
    parts.push(`启动 ${formatRuntimeStartedAt(normalized.startedAt)}`);
  }
  if (normalized.buildId) {
    parts.push(`build ${normalized.buildId}`);
  }
  return parts.join(" / ");
}

function getInputAckDiagnostics(message) {
  const accepted = Boolean(message.accepted);
  return {
    inputMode: message.mode ?? state.hostDiagnostics.inputMode,
    inputAckStatus: accepted ? (message.injected ? "injected" : "logged") : "rejected",
    inputAckEvent: message.event ?? "input",
    inputAckReason: message.reason ?? "",
    inputAckCode: message.code ?? "",
  };
}

function formatInputDiagnostics(diagnostics) {
  const parts = [];
  if (diagnostics.inputMode) {
    parts.push(labelFromMap(diagnostics.inputMode, inputModeLabels));
  }
  if (diagnostics.inputAckStatus) {
    parts.push(labelFromMap(diagnostics.inputAckStatus, inputAckStatusLabels));
  }
  if (diagnostics.inputAckStatus === "rejected") {
    const detail = [diagnostics.inputAckCode, diagnostics.inputAckReason].filter(Boolean).join(" ");
    if (detail) {
      parts.push(detail);
    }
  }
  return parts.join(" / ");
}

function formatVideoFrameAge(ageMs, { clockSkewed = false, compact = false } = {}) {
  if (clockSkewed) {
    return "时钟偏差";
  }
  if (ageMs === null || ageMs === undefined || ageMs === "") {
    return compact ? "-- ms" : "";
  }
  const age = Number(ageMs);
  if (!Number.isFinite(age)) {
    return compact ? "-- ms" : "";
  }
  if (age >= 1000) {
    return `${(age / 1000).toFixed(age >= 10_000 ? 0 : 1)}s`;
  }
  return `${Math.max(0, Math.round(age))}ms`;
}

function normalizeRemoteMaxScreenFps(value) {
  const fps = Number(value);
  if (!Number.isFinite(fps) || fps <= 0) {
    return null;
  }
  return Math.round(fps);
}

function getRemoteMaxScreenFps(diagnostics = state.hostDiagnostics) {
  return normalizeRemoteMaxScreenFps(diagnostics?.maxScreenFps);
}

function formatRemoteFpsLimitText({ includeWhenAtOrBelowRequest = false } = {}) {
  const maxScreenFps = getRemoteMaxScreenFps();
  if (!maxScreenFps) {
    return "";
  }
  const requested = state.requestedFps || Number(elements.fpsSelect.value) || 0;
  const negotiated = state.negotiatedFps || 0;
  const shouldShow =
    includeWhenAtOrBelowRequest ||
    (requested && requested > maxScreenFps) ||
    (negotiated && negotiated > maxScreenFps);
  return shouldShow ? `远端上限 ${maxScreenFps} Hz` : "";
}

function parseFrameTimestampMs(value) {
  if (value === null || value === undefined || value === "") {
    return NaN;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  const normalized = String(value).trim();
  if (/^-?\d+(\.\d+)?$/.test(normalized)) {
    const numeric = Number(normalized);
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  }
  return Date.parse(normalized);
}

function parseFrameTimestampUsMs(value) {
  if (value === null || value === undefined || value === "") return NaN;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric / 1000 : NaN;
}

function getFrameRemoteMediaTimestampMs(frame) {
  const timestampUs = parseFrameTimestampUsMs(
    frame?.timestampUs ?? frame?.mediaTimestampUs ?? frame?.presentationTimestampUs ?? frame?.audioTimestampUs,
  );
  if (Number.isFinite(timestampUs)) return timestampUs;

  const rawTimestamp = frame?.mediaTimestamp ?? frame?.timestamp ?? frame?.captureTimestamp ?? frame?.capturedAt ?? "";
  return parseFrameTimestampMs(rawTimestamp);
}

function recordFrameTimingSample(sampleKey, receivedAt, remoteMediaAtMs, cutoff) {
  if (!Array.isArray(state[sampleKey])) state[sampleKey] = [];
  if (Number.isFinite(Number(remoteMediaAtMs))) {
    state[sampleKey].push({
      receivedAt,
      remoteMediaAtMs: Number(remoteMediaAtMs),
    });
  }
  state[sampleKey] = state[sampleKey]
    .filter((sample) => Number.isFinite(Number(sample?.receivedAt)) && Number(sample.receivedAt) >= cutoff)
    .slice(-240);
}

function getFrameTimingGapStats(samples, valueKey, stutterThresholdMs = videoStutterGapThresholdMs) {
  const values = Array.isArray(samples)
    ? samples
        .map((sample) => Number(sample?.[valueKey]))
        .filter((value) => Number.isFinite(value))
    : [];
  if (values.length < 2) {
    return { sampleCount: values.length, averageGapMs: 0, maxGapMs: 0, stutterCount: 0, maxStutterGapMs: 0 };
  }

  const gaps = [];
  for (let index = 1; index < values.length; index += 1) {
    const gap = values[index] - values[index - 1];
    if (Number.isFinite(gap) && gap >= 0) gaps.push(gap);
  }
  if (!gaps.length) {
    return { sampleCount: values.length, averageGapMs: 0, maxGapMs: 0, stutterCount: 0, maxStutterGapMs: 0 };
  }

  const total = gaps.reduce((sum, gap) => sum + gap, 0);
  const stutterGaps = gaps.filter((gap) => gap >= stutterThresholdMs);
  return {
    sampleCount: values.length,
    averageGapMs: Math.round(total / gaps.length),
    maxGapMs: Math.round(Math.max(...gaps)),
    stutterCount: stutterGaps.length,
    maxStutterGapMs: stutterGaps.length ? Math.round(Math.max(...stutterGaps)) : 0,
  };
}

function getVideoRemoteMediaGapStats() {
  return getFrameTimingGapStats(state.videoFrameTimingSamples, "remoteMediaAtMs");
}

function getAudioRemoteMediaGapStats() {
  return getFrameTimingGapStats(state.audioFrameTimingSamples, "remoteMediaAtMs", audioStutterGapThresholdMs);
}

function classifyW8NativeVideoSession(diagnostics = state) {
  const source = diagnostics || {};
  const nested = source.hostDiagnostics || {};
  const numberValue = (key) => {
    const value = source[key] ?? nested[key];
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
  };
  const stringValue = (key) => String(source[key] ?? nested[key] ?? "").trim();
  const framesPushed = numberValue("w8NativeVideoFramesPushed");
  const submitted = numberValue("w8NativeVideoDecoderSessionSubmittedFrames");
  const decoded = numberValue("w8NativeVideoDecoderSessionDecodedFrames");
  const surfaceFrames = numberValue("w8NativeVideoNativeSurfacePresentedFrames");
  const presentFrames = numberValue("w8NativeVideoNativePresentFrames");
  const processInputFailures = numberValue("w8NativeVideoProcessInputFailures");
  const processOutputNeedMoreInput = numberValue("w8NativeVideoProcessOutputNeedMoreInputFrames");
  const processOutputFailures = numberValue("w8NativeVideoProcessOutputFailures");
  const lastProcessOutputStatus = stringValue("w8NativeVideoLastProcessOutputStatus");
  const errors = numberValue("w8NativeVideoErrors");
  const status = stringValue("w8NativeVideoDecoderSessionStatus");
  const present = stringValue("w8NativeVideoNativePresentStatus");
  const surface = stringValue("w8NativeVideoNativeSurfaceStatus");
  const copy = stringValue("w8NativeVideoNativeSurfaceCopyStatus");
  const handoff = stringValue("w8NativeVideoFrameHandoffStatus");
  const swapchain = stringValue("w8NativeVideoWindowSwapchainStatus");
  const lastError = stringValue("w8NativeVideoLastError");
  const reasonText = [
    status,
    present,
    surface,
    copy,
    handoff,
    swapchain,
    stringValue("w8NativeVideoDecoderSessionReason"),
    stringValue("w8NativeVideoNativePresentReason"),
    stringValue("w8NativeVideoNativeSurfaceReason"),
    stringValue("w8NativeVideoWindowSwapchainReason"),
    stringValue("w8NativeVideoLastProcessInputStatus"),
    lastProcessOutputStatus,
    lastError,
  ].join(" ").toLowerCase();
  const presentLower = present.toLowerCase();
  const surfaceLower = `${surface} ${copy}`.toLowerCase();
  const isWindowPresenting = presentFrames > 0 && presentLower.includes("presented");
  const hasNativePipeline =
    decoded > 0 ||
    submitted > 0 ||
    presentFrames > 0 ||
    surfaceFrames > 0 ||
    Boolean(status || present || surface || copy || handoff || swapchain);
  const nativeAck =
    isWindowPresenting ? "presented" :
      surfaceFrames > 0 || surfaceLower.includes("presented") ? "surface" :
        decoded > 0 ? "decoded" :
          submitted > 0 ? "submitted" :
            framesPushed > 0 ? "received" : "none";
  const mediaSession = isWindowPresenting ? "native-main" : hasNativePipeline ? "native-pending" : "web-diagnostic";
  const presentGap = Math.max(0, decoded - presentFrames);
  const presentGapLimit = Math.max(2, Math.ceil(Math.max(1, decoded) * 0.02));
  const hasDeviceLost = reasonText.includes("device-lost");
  const hasStreamChange = reasonText.includes("stream-change");
  const hasStreamReconfigured = reasonText.includes("reconfigured");
  let nativeClass = "web-diagnostic";
  let nativeNext = "collect-native-video-evidence";

  if (reasonText.includes("device-lost-rebuild-blocked")) {
    nativeClass = "device-lost-blocked";
    nativeNext = "recreate-native-session";
  } else if (errors > 0 || lastError) {
    nativeClass = "decoder-error";
    nativeNext = "inspect-native-error";
  } else if (hasDeviceLost && isWindowPresenting) {
    nativeClass = "device-lost-recovered";
    nativeNext = "watch-arrival-qos";
  } else if (hasDeviceLost) {
    nativeClass = "device-lost-rebuild-pending";
    nativeNext = "inspect-device-rebuild";
  } else if (hasStreamChange && !hasStreamReconfigured) {
    nativeClass = "stream-change-pending";
    nativeNext = "reconfigure-output";
  } else if (hasStreamChange && isWindowPresenting) {
    nativeClass = "stream-change-recovered";
    nativeNext = "watch-arrival-qos";
  } else if (isWindowPresenting && presentGap <= presentGapLimit) {
    nativeClass = "present-ok";
    nativeNext = "watch-arrival-qos";
  } else if (decoded > 0 && presentGap > presentGapLimit) {
    nativeClass = "present-gap";
    nativeNext = "inspect-native-present";
  } else if (decoded > 0) {
    nativeClass = "present-pending";
    nativeNext = "inspect-native-present";
  } else if (nativeAck === "surface") {
    nativeClass = "surface-ready";
    nativeNext = "inspect-hwnd-present";
  } else if (submitted > 0 && processInputFailures > 0) {
    nativeClass = "mf-input-error";
    nativeNext = "inspect-mf-process-input";
  } else if (submitted > 0 && processOutputFailures > 0) {
    nativeClass = "mf-output-error";
    nativeNext = "inspect-mf-process-output";
  } else if (submitted > 0 && processOutputNeedMoreInput > 0) {
    nativeClass = "mf-need-more-input";
    nativeNext = "inspect-mf-input-format-or-drain";
  } else if (submitted > 0) {
    nativeClass = "decoder-submitted";
    nativeNext = "wait-decoded-or-classify-decoder";
  } else if (framesPushed > 0) {
    nativeClass = "receiving";
    nativeNext = "wait-decoder-submit";
  }

  return {
    mediaSession,
    nativeAck,
    nativeClass,
    nativeNext,
    presentGap,
    presentGapLimit,
  };
}

function getVideoFrameAgeDiagnostics(frame) {
  const rawTimestamp = frame?.timestamp ?? frame?.captureTimestamp ?? frame?.capturedAt ?? "";
  const parsedTimestampMs = parseFrameTimestampMs(rawTimestamp);
  if (!Number.isFinite(parsedTimestampMs)) {
    return {
      videoFrameAgeMs: null,
      videoFrameTimestamp: rawTimestamp ? String(rawTimestamp) : "",
      videoFrameClockSkewed: false,
    };
  }

  const ageMs = Date.now() - parsedTimestampMs;
  const clockSkewed = ageMs < -250;
  return {
    videoFrameAgeMs: clockSkewed ? null : Math.max(0, ageMs),
    videoFrameTimestamp: String(rawTimestamp),
    videoFrameClockSkewed: clockSkewed,
  };
}

function updateVideoFrameAgeMetric(ageDiagnostics) {
  state.lastVideoFrameAgeMs = ageDiagnostics.videoFrameAgeMs;
  state.lastVideoFrameTimestamp = ageDiagnostics.videoFrameTimestamp;
  state.videoFrameClockSkewed = ageDiagnostics.videoFrameClockSkewed;

  const text = formatVideoFrameAge(ageDiagnostics.videoFrameAgeMs, {
    clockSkewed: ageDiagnostics.videoFrameClockSkewed,
    compact: true,
  });
  elements.metricLatency.textContent = text;
}

function formatW13LocalVideoQosDiagnostics(diagnostics = state.hostDiagnostics) {
  const status = String(diagnostics?.w13LocalVideoQosStatus || "").trim();
  const arrivalSource = String(diagnostics?.w13LocalVideoQosArrivalSource || "").trim();
  const dropPolicy = String(diagnostics?.w13LocalVideoQosDropPolicy || "").trim();
  const keyframeRequest = String(diagnostics?.w13LocalVideoQosKeyframeRequest || "").trim();
  const localAvgMs = Number(diagnostics?.w13LocalVideoQosLocalAvgMs);
  const localMaxMs = Number(diagnostics?.w13LocalVideoQosLocalMaxMs);
  const remoteMediaAvgMs = Number(diagnostics?.w13LocalVideoQosRemoteMediaAvgMs);
  const remoteMediaMaxMs = Number(diagnostics?.w13LocalVideoQosRemoteMediaMaxMs);
  const targetQueueMs = Number(diagnostics?.w13LocalVideoQosTargetQueueMs);
  const maxQueueMs = Number(diagnostics?.w13LocalVideoQosMaxQueueMs);
  const next = String(diagnostics?.w13LocalVideoQosNext || "").trim();
  const hasArrivalGap =
    (Number.isFinite(localAvgMs) && localAvgMs > 0) ||
    (Number.isFinite(localMaxMs) && localMaxMs > 0) ||
    (Number.isFinite(remoteMediaAvgMs) && remoteMediaAvgMs > 0) ||
    (Number.isFinite(remoteMediaMaxMs) && remoteMediaMaxMs > 0);
  const hasQueueThreshold =
    (Number.isFinite(targetQueueMs) && targetQueueMs > 0) ||
    (Number.isFinite(maxQueueMs) && maxQueueMs > 0);
  if (!status && !arrivalSource && !dropPolicy && !keyframeRequest && !hasArrivalGap && !hasQueueThreshold && !next) {
    return [];
  }

  const parts = [];
  if (status) parts.push(`W13本地QoS ${status}`);
  if (arrivalSource) parts.push(`W13到达来源 ${arrivalSource}`);
  if (Number.isFinite(localAvgMs) && localAvgMs > 0) parts.push(`W13本地平均间隔 ${Math.round(localAvgMs)} ms`);
  if (Number.isFinite(localMaxMs) && localMaxMs > 0) parts.push(`W13本地最大间隔 ${Math.round(localMaxMs)} ms`);
  if (Number.isFinite(remoteMediaAvgMs) && remoteMediaAvgMs > 0) parts.push(`W13远端媒体平均间隔 ${Math.round(remoteMediaAvgMs)} ms`);
  if (Number.isFinite(remoteMediaMaxMs) && remoteMediaMaxMs > 0) parts.push(`W13远端媒体最大间隔 ${Math.round(remoteMediaMaxMs)} ms`);
  if (dropPolicy) parts.push(`W13策略 ${dropPolicy}`);
  if (keyframeRequest) parts.push(`W13关键帧请求 ${keyframeRequest}`);
  if (hasQueueThreshold) {
    const targetText = Number.isFinite(targetQueueMs) && targetQueueMs > 0 ? Math.round(targetQueueMs) : "--";
    const maxText = Number.isFinite(maxQueueMs) && maxQueueMs > 0 ? Math.round(maxQueueMs) : "--";
    parts.push(`W13门槛 ${targetText}/${maxText} ms`);
  }
  if (next) parts.push(`W13下一步 ${next}`);
  return parts;
}

function formatVideoDecoderDiagnostics(diagnostics) {
  const status = diagnostics.videoDecoderStatus
    ? labelFromMap(diagnostics.videoDecoderStatus, videoDecoderStatusLabels)
    : "";
  const codec = diagnostics.videoDecoderCodec || "";
  const decodedFrames = Number(diagnostics.h264DecodedFrames);
  const errors = Number(diagnostics.videoDecoderErrors);
  const queue = Number(diagnostics.videoDecoderQueue);
  const queueMs = Number(diagnostics.videoDecoderQueueMs);
  const latency = Number(diagnostics.h264DecoderLatencyMs);
  const droppedStaleFrames = Number(diagnostics.videoDroppedStaleFrames);
  const lastDropReason = String(diagnostics.videoLastDropReason || "").trim();
  const receivedFrames = Number(diagnostics.h264ReceivedFrames);
  const receivedKeyFrames = Number(diagnostics.h264ReceivedKeyFrames);
  const receivedSps = Number(diagnostics.h264ReceivedSps);
  const receivedPps = Number(diagnostics.h264ReceivedPps);
  const receivedIdr = Number(diagnostics.h264ReceivedIdr);
  const lastNalTypes = String(diagnostics.h264LastNalTypes || "").trim();
  const webDecodeBypassCount = Number(diagnostics.h264WebDecodeBypassedForNativeSurface);
  const nativeFrames = Number(diagnostics.w8NativeVideoFramesPushed);
  const nativeQueueMs = Number(diagnostics.w8NativeVideoQueueMs);
  const nativeDroppedFrames = Number(diagnostics.w8NativeVideoDroppedFrames);
  const nativeHasDecoderConfig = Boolean(diagnostics.w8NativeVideoHasDecoderConfig);
  const nativeCodecString = String(diagnostics.w8NativeVideoCodecString || "").trim();
  const nativeNalTypes = String(diagnostics.w8NativeVideoNativeNalTypes || "").trim();
  const nativeIsKeyframe = diagnostics.w8NativeVideoNativeIsKeyframe === true;
  const nativeKeyFrames = Number(diagnostics.w8NativeVideoNativeKeyFrames);
  const nativeSpsCount = Number(diagnostics.w8NativeVideoNativeSpsCount);
  const nativePpsCount = Number(diagnostics.w8NativeVideoNativePpsCount);
  const nativeIdrCount = Number(diagnostics.w8NativeVideoNativeIdrCount);
  const nativeByteLen = Number(diagnostics.w8NativeVideoNativeByteLen);
  const nativeDecoderReady = Boolean(diagnostics.w8NativeVideoDecoderReady);
  const nativeDecoderMode = String(diagnostics.w8NativeVideoDecoderMode || "").trim();
  const nativeDecoderReason = String(diagnostics.w8NativeVideoDecoderReason || "").trim();
  const nativeD3dFeatureLevel = String(diagnostics.w8NativeVideoD3dFeatureLevel || "").trim();
  const nativeDecoderInitReady = Boolean(diagnostics.w8NativeVideoDecoderInitReady);
  const nativeDecoderInitMode = String(diagnostics.w8NativeVideoDecoderInitMode || "").trim();
  const nativeDecoderInitReason = String(diagnostics.w8NativeVideoDecoderInitReason || "").trim();
  const nativeDecoderInitOutputSubtypes = String(diagnostics.w8NativeVideoDecoderInitOutputSubtypes || "").trim();
  const nativeDecodeStepReady = Boolean(diagnostics.w8NativeVideoDecodeStepReady);
  const nativeDecodeStepMode = String(diagnostics.w8NativeVideoDecodeStepMode || "").trim();
  const nativeDecodeStepReason = String(diagnostics.w8NativeVideoDecodeStepReason || "").trim();
  const nativeDecodeStepStatus = String(diagnostics.w8NativeVideoDecodeStepStatus || "").trim();
  const nativeDecoderSessionActive = Boolean(diagnostics.w8NativeVideoDecoderSessionActive);
  const nativeDecoderSessionMode = String(diagnostics.w8NativeVideoDecoderSessionMode || "").trim();
  const nativeDecoderSessionReason = String(diagnostics.w8NativeVideoDecoderSessionReason || "").trim();
  const nativeDecoderSessionStatus = String(diagnostics.w8NativeVideoDecoderSessionStatus || "").trim();
  const nativeDecoderSessionOutputSubtype = String(
    diagnostics.w8NativeVideoDecoderSessionOutputSubtype || "",
  ).trim();
  const nativeDecoderSessionSubmittedFrames = Number(
    diagnostics.w8NativeVideoDecoderSessionSubmittedFrames,
  );
  const nativeDecoderSessionAcceptedInputFrames = Number(
    diagnostics.w8NativeVideoDecoderSessionAcceptedInputFrames,
  );
  const nativeDecoderSessionDecodedFrames = Number(
    diagnostics.w8NativeVideoDecoderSessionDecodedFrames,
  );
  const nativeProcessInputAttempts = Number(diagnostics.w8NativeVideoProcessInputAttempts);
  const nativeProcessInputAcceptedFrames = Number(
    diagnostics.w8NativeVideoProcessInputAcceptedFrames,
  );
  const nativeProcessInputFailures = Number(diagnostics.w8NativeVideoProcessInputFailures);
  const nativeLastProcessInputStatus = String(
    diagnostics.w8NativeVideoLastProcessInputStatus || "",
  ).trim();
  const nativeProcessOutputAttempts = Number(diagnostics.w8NativeVideoProcessOutputAttempts);
  const nativeProcessOutputProducedFrames = Number(
    diagnostics.w8NativeVideoProcessOutputProducedFrames,
  );
  const nativeProcessOutputNeedMoreInputFrames = Number(
    diagnostics.w8NativeVideoProcessOutputNeedMoreInputFrames,
  );
  const nativeProcessOutputStreamChangeFrames = Number(
    diagnostics.w8NativeVideoProcessOutputStreamChangeFrames,
  );
  const nativeProcessOutputNoSampleFrames = Number(
    diagnostics.w8NativeVideoProcessOutputNoSampleFrames,
  );
  const nativeProcessOutputFailures = Number(diagnostics.w8NativeVideoProcessOutputFailures);
  const nativeLastProcessOutputStatus = String(
    diagnostics.w8NativeVideoLastProcessOutputStatus || "",
  ).trim();
  const nativeDecoderSessionWorkerThread = Boolean(diagnostics.w8NativeVideoDecoderSessionWorkerThread);
  const nativeDecoderSessionWorkerMode = String(
    diagnostics.w8NativeVideoDecoderSessionWorkerMode || "",
  ).trim();
  const nativeDecoderSessionWorkerStatus = String(
    diagnostics.w8NativeVideoDecoderSessionWorkerStatus || "",
  ).trim();
  const nativeFrameHandoffActive = Boolean(diagnostics.w8NativeVideoFrameHandoffActive);
  const nativeFrameHandoffMode = String(diagnostics.w8NativeVideoFrameHandoffMode || "").trim();
  const nativeFrameHandoffStatus = String(
    diagnostics.w8NativeVideoFrameHandoffStatus || "",
  ).trim();
  const nativeLatestFrameFormat = String(diagnostics.w8NativeVideoLatestFrameFormat || "").trim();
  const nativeLatestFrameBytes = Number(diagnostics.w8NativeVideoLatestFrameBytes);
  const nativeSurfaceReady = Boolean(diagnostics.w8NativeVideoNativeSurfaceReady);
  const nativeSurfaceMode = String(diagnostics.w8NativeVideoNativeSurfaceMode || "").trim();
  const nativeSurfaceStatus = String(diagnostics.w8NativeVideoNativeSurfaceStatus || "").trim();
  const nativeSurfaceFormat = String(diagnostics.w8NativeVideoNativeSurfaceFormat || "").trim();
  const nativeSurfaceWidth = Number(diagnostics.w8NativeVideoNativeSurfaceWidth);
  const nativeSurfaceHeight = Number(diagnostics.w8NativeVideoNativeSurfaceHeight);
  const nativeSurfaceReason = String(diagnostics.w8NativeVideoNativeSurfaceReason || "").trim();
  const nativeSurfaceCopyStatus = String(
    diagnostics.w8NativeVideoNativeSurfaceCopyStatus || "",
  ).trim();
  const nativeSurfaceCopyBytes = Number(diagnostics.w8NativeVideoNativeSurfaceCopyBytes);
  const nativeSurfacePresentedFrames = Number(
    diagnostics.w8NativeVideoNativeSurfacePresentedFrames,
  );
  const nativePresentReady = Boolean(diagnostics.w8NativeVideoNativePresentReady);
  const nativePresentMode = String(diagnostics.w8NativeVideoNativePresentMode || "").trim();
  const nativePresentStatus = String(diagnostics.w8NativeVideoNativePresentStatus || "").trim();
  const nativePresentFormat = String(diagnostics.w8NativeVideoNativePresentFormat || "").trim();
  const nativePresentWidth = Number(diagnostics.w8NativeVideoNativePresentWidth);
  const nativePresentHeight = Number(diagnostics.w8NativeVideoNativePresentHeight);
  const nativePresentFrames = Number(diagnostics.w8NativeVideoNativePresentFrames);
  const nativePresentReason = String(diagnostics.w8NativeVideoNativePresentReason || "").trim();
  const nativeWindowSwapchainReady = Boolean(diagnostics.w8NativeVideoWindowSwapchainReady);
  const nativeWindowSwapchainMode = String(diagnostics.w8NativeVideoWindowSwapchainMode || "").trim();
  const nativeWindowSwapchainStatus = String(diagnostics.w8NativeVideoWindowSwapchainStatus || "").trim();
  const nativeWindowSwapchainFormat = String(diagnostics.w8NativeVideoWindowSwapchainFormat || "").trim();
  const nativeWindowSwapchainWidth = Number(diagnostics.w8NativeVideoWindowSwapchainWidth);
  const nativeWindowSwapchainHeight = Number(diagnostics.w8NativeVideoWindowSwapchainHeight);
  const nativeWindowSwapchainBufferCount = Number(diagnostics.w8NativeVideoWindowSwapchainBufferCount);
  const nativeWindowSwapchainSwapEffect = String(
    diagnostics.w8NativeVideoWindowSwapchainSwapEffect || "",
  ).trim();
  const nativeWindowSwapchainReason = String(diagnostics.w8NativeVideoWindowSwapchainReason || "").trim();
  const nativeLastReason = String(diagnostics.w8NativeVideoLastReason || "").trim();
  const nativeErrors = Number(diagnostics.w8NativeVideoErrors);
  const nativeLastError = String(diagnostics.w8NativeVideoLastError || "").trim();
  const nativeProgressStatus = String(diagnostics.w8NativeVideoProgressStatus || "").trim();
  const nativeProgressNext = String(diagnostics.w8NativeVideoProgressNext || "").trim();
  const nativeProgressWindowMs = Number(diagnostics.w8NativeVideoProgressWindowMs);
  const nativePresentFrameDelta = Number(diagnostics.w8NativeVideoPresentFrameDelta);
  const nativePresentFps = Number(diagnostics.w8NativeVideoPresentFps);
  const nativeDecodedFrameDelta = Number(diagnostics.w8NativeVideoDecodedFrameDelta);
  const nativeDecodedFps = Number(diagnostics.w8NativeVideoDecodedFps);
  const nativeWebBypassDelta = Number(diagnostics.w8NativeVideoWebBypassDelta);
  const nativeWebBypassFps = Number(diagnostics.w8NativeVideoWebBypassFps);
  const nativeFramesPushedDelta = Number(diagnostics.w8NativeVideoFramesPushedDelta);
  const nativeSubmittedFrameDelta = Number(diagnostics.w8NativeVideoSubmittedFrameDelta);
  const nativeClassifier = classifyW8NativeVideoSession(diagnostics);
  const nativeDecoderProgress =
    nativeDecoderSessionSubmittedFrames > 0 ||
    nativeDecoderSessionAcceptedInputFrames > 0 ||
    nativeDecoderSessionDecodedFrames > 0 ||
    nativeSurfacePresentedFrames > 0 ||
    nativePresentFrames > 0 ||
    nativeDecoderSessionActive ||
    Boolean(nativeSurfaceStatus || nativePresentStatus);
  const parts = [status, codec].filter(Boolean);

  if (Number.isFinite(decodedFrames) && decodedFrames > 0) {
    parts.push(`已绘制 ${decodedFrames}`);
  }
  if (Number.isFinite(receivedFrames) && receivedFrames > 0) {
    parts.push(`收到 ${receivedFrames}`);
  }
  if (Number.isFinite(receivedKeyFrames) && receivedKeyFrames > 0) {
    parts.push(`关键帧 ${receivedKeyFrames}`);
  }
  if (
    (Number.isFinite(receivedSps) && receivedSps > 0) ||
    (Number.isFinite(receivedPps) && receivedPps > 0) ||
    (Number.isFinite(receivedIdr) && receivedIdr > 0)
  ) {
    parts.push(`SPS/PPS/IDR ${Math.max(0, receivedSps || 0)}/${Math.max(0, receivedPps || 0)}/${Math.max(0, receivedIdr || 0)}`);
  }
  if (lastNalTypes) {
    parts.push(`NAL ${lastNalTypes}`);
  }
  if (Number.isFinite(webDecodeBypassCount) && webDecodeBypassCount > 0) {
    parts.push(`WebCodecs 旁路 ${Math.round(webDecodeBypassCount)}`);
  }
  if (Number.isFinite(nativeFrames) && nativeFrames > 0) {
    parts.push(`原生队列 ${nativeFrames}`);
  }
  if (Number.isFinite(nativeQueueMs) && nativeQueueMs > 0) {
    parts.push(`原生队列 ${Math.round(nativeQueueMs)}ms`);
  }
  if (Number.isFinite(nativeDroppedFrames) && nativeDroppedFrames > 0) {
    parts.push(`原生丢旧帧 ${nativeDroppedFrames}`);
  }
  if (nativeCodecString) {
    parts.push(`原生解码配置 ${nativeCodecString}`);
  } else if (nativeHasDecoderConfig) {
    parts.push("原生解码配置已到达");
  }
  if (nativeNalTypes) {
    parts.push(`原生NAL ${nativeNalTypes}`);
  }
  if (
    (Number.isFinite(nativeSpsCount) && nativeSpsCount > 0) ||
    (Number.isFinite(nativePpsCount) && nativePpsCount > 0) ||
    (Number.isFinite(nativeIdrCount) && nativeIdrCount > 0)
  ) {
    parts.push(
      `原生SPS/PPS/IDR ${Math.max(0, nativeSpsCount || 0)}/${Math.max(0, nativePpsCount || 0)}/${Math.max(0, nativeIdrCount || 0)}`,
    );
  }
  if (nativeIsKeyframe) {
    parts.push("原生关键帧 yes");
  }
  if (Number.isFinite(nativeKeyFrames) && nativeKeyFrames > 0) {
    parts.push(`原生关键帧累计 ${Math.round(nativeKeyFrames)}`);
  }
  if (Number.isFinite(nativeByteLen) && nativeByteLen > 0) {
    parts.push(`原生字节 ${Math.round(nativeByteLen)}`);
  }
  if (nativeDecoderMode) {
    parts.push(`原生解码器 ${nativeDecoderReady ? "ready" : "blocked"}`);
  }
  if (nativeD3dFeatureLevel) {
    parts.push(`D3D11 ${nativeD3dFeatureLevel}`);
  }
  if (nativeDecoderReason && !nativeDecoderReady) {
    parts.push(`原生解码器原因 ${nativeDecoderReason.replace(/\s+/g, " ").slice(0, 80)}`);
  }
  if (nativeDecoderInitMode) {
    parts.push(`原生解码初始化 ${nativeDecoderInitReady ? "ready" : "blocked"}`);
  }
  if (nativeDecoderInitOutputSubtypes) {
    parts.push(`原生输出 ${nativeDecoderInitOutputSubtypes}`);
  }
  if (nativeDecoderInitReason && !nativeDecoderInitReady) {
    parts.push(`原生初始化原因 ${nativeDecoderInitReason.replace(/\s+/g, " ").slice(0, 80)}`);
  }
  if (nativeDecodeStepMode) {
    parts.push(`原生解码步进 ${nativeDecodeStepReady ? "ready" : "blocked"}`);
  }
  if (nativeDecodeStepStatus) {
    parts.push(`原生步进状态 ${nativeDecodeStepStatus}`);
  }
  if (nativeDecodeStepReason && !nativeDecodeStepReady) {
    parts.push(`原生步进原因 ${nativeDecodeStepReason.replace(/\s+/g, " ").slice(0, 80)}`);
  }
  if (nativeDecoderSessionMode) {
    parts.push(`原生解码会话 ${nativeDecoderSessionActive ? "active" : "blocked"}`);
  }
  if (nativeDecoderSessionOutputSubtype) {
    parts.push(`原生会话输出 ${nativeDecoderSessionOutputSubtype}`);
  }
  if (Number.isFinite(nativeDecoderSessionSubmittedFrames) && nativeDecoderSessionSubmittedFrames > 0) {
    parts.push(`原生会话输入 ${nativeDecoderSessionSubmittedFrames}`);
  }
  if (
    Number.isFinite(nativeDecoderSessionAcceptedInputFrames) &&
    nativeDecoderSessionAcceptedInputFrames > 0
  ) {
    parts.push(`原生会话接受 ${nativeDecoderSessionAcceptedInputFrames}`);
  }
  if (
    nativeDecoderSessionMode &&
    Number.isFinite(nativeDecoderSessionDecodedFrames) &&
    nativeDecoderSessionDecodedFrames >= 0
  ) {
    parts.push(`原生会话解码 ${nativeDecoderSessionDecodedFrames}`);
  }
  if (Number.isFinite(nativeProcessInputAttempts) && nativeProcessInputAttempts > 0) {
    const acceptedText = Number.isFinite(nativeProcessInputAcceptedFrames)
      ? Math.max(0, Math.round(nativeProcessInputAcceptedFrames))
      : "--";
    parts.push(`MF输入 ${nativeLastProcessInputStatus || "unknown"} ${acceptedText}/${Math.round(nativeProcessInputAttempts)}`);
  }
  if (Number.isFinite(nativeProcessInputFailures) && nativeProcessInputFailures > 0) {
    parts.push(`MF输入失败 ${Math.round(nativeProcessInputFailures)}`);
  }
  if (Number.isFinite(nativeProcessOutputAttempts) && nativeProcessOutputAttempts > 0) {
    const producedText = Number.isFinite(nativeProcessOutputProducedFrames)
      ? Math.max(0, Math.round(nativeProcessOutputProducedFrames))
      : "--";
    parts.push(`MF输出 ${nativeLastProcessOutputStatus || "unknown"} ${producedText}/${Math.round(nativeProcessOutputAttempts)}`);
  }
  if (
    Number.isFinite(nativeProcessOutputNeedMoreInputFrames) &&
    nativeProcessOutputNeedMoreInputFrames > 0
  ) {
    parts.push(`MF需更多输入 ${Math.round(nativeProcessOutputNeedMoreInputFrames)}`);
  }
  if (
    Number.isFinite(nativeProcessOutputStreamChangeFrames) &&
    nativeProcessOutputStreamChangeFrames > 0
  ) {
    parts.push(`MF流变化 ${Math.round(nativeProcessOutputStreamChangeFrames)}`);
  }
  if (
    Number.isFinite(nativeProcessOutputNoSampleFrames) &&
    nativeProcessOutputNoSampleFrames > 0
  ) {
    parts.push(`MF无样本 ${Math.round(nativeProcessOutputNoSampleFrames)}`);
  }
  if (Number.isFinite(nativeProcessOutputFailures) && nativeProcessOutputFailures > 0) {
    parts.push(`MF输出失败 ${Math.round(nativeProcessOutputFailures)}`);
  }
  if (nativeDecoderSessionStatus) {
    parts.push(`原生会话状态 ${nativeDecoderSessionStatus}`);
  }
  if (nativeDecoderSessionWorkerMode || nativeDecoderSessionWorkerThread) {
    parts.push(`原生解码线程 ${nativeDecoderSessionWorkerThread ? "active" : "blocked"}`);
  }
  if (nativeDecoderSessionWorkerStatus) {
    parts.push(`原生线程状态 ${nativeDecoderSessionWorkerStatus}`);
  }
  if (nativeFrameHandoffMode || nativeFrameHandoffActive) {
    parts.push(`原生帧交接 ${nativeFrameHandoffActive ? "active" : "blocked"}`);
  }
  if (nativeLatestFrameFormat) {
    const latestFrameText =
      Number.isFinite(nativeLatestFrameBytes) && nativeLatestFrameBytes > 0
        ? `${nativeLatestFrameFormat} / ${Math.round(nativeLatestFrameBytes)} bytes`
        : nativeLatestFrameFormat;
    parts.push(`原生最新帧 ${latestFrameText}`);
  }
  if (nativeFrameHandoffStatus) {
    parts.push(`原生帧状态 ${nativeFrameHandoffStatus}`);
  }
  if (nativeSurfaceMode || nativeSurfaceReady) {
    parts.push(`原生表面 ${nativeSurfaceReady ? "ready" : "blocked"}`);
  }
  if (nativeSurfaceFormat) {
    const surfaceSize =
      Number.isFinite(nativeSurfaceWidth) && nativeSurfaceWidth > 0 &&
      Number.isFinite(nativeSurfaceHeight) && nativeSurfaceHeight > 0
        ? `${Math.round(nativeSurfaceWidth)}x${Math.round(nativeSurfaceHeight)} `
        : "";
    parts.push(`原生表面目标 D3D11 ${surfaceSize}${nativeSurfaceFormat}`.trim());
  }
  if (nativeSurfaceStatus) {
    parts.push(`原生表面状态 ${nativeSurfaceStatus}`);
  }
  if (
    nativeSurfaceCopyStatus &&
    nativeSurfaceCopyStatus !== nativeSurfaceStatus
  ) {
    parts.push(`原生表面写入状态 ${nativeSurfaceCopyStatus}`);
  }
  if (Number.isFinite(nativeSurfaceCopyBytes) && nativeSurfaceCopyBytes > 0) {
    parts.push(`原生表面写入 ${Math.round(nativeSurfaceCopyBytes)} bytes`);
  }
  if (
    Number.isFinite(nativeSurfacePresentedFrames) &&
    nativeSurfacePresentedFrames > 0
  ) {
    parts.push(`原生表面呈现 ${Math.round(nativeSurfacePresentedFrames)}`);
  }
  if (nativeSurfaceReason && !nativeSurfaceReady) {
    parts.push(`原生表面原因 ${nativeSurfaceReason.replace(/\s+/g, " ").slice(0, 80)}`);
  }
  if (nativePresentMode || nativePresentReady) {
    parts.push(`原生呈现目标 ${nativePresentReady ? "ready" : "blocked"}`);
  }
  if (nativePresentFormat) {
    const presentSize =
      Number.isFinite(nativePresentWidth) && nativePresentWidth > 0 &&
      Number.isFinite(nativePresentHeight) && nativePresentHeight > 0
        ? `${Math.round(nativePresentWidth)}x${Math.round(nativePresentHeight)} `
        : "";
    parts.push(`原生呈现目标 D3D11 ${presentSize}${nativePresentFormat}`.trim());
  }
  if (nativePresentStatus) {
    parts.push(`原生呈现状态 ${nativePresentStatus}`);
  }
  if (Number.isFinite(nativePresentFrames) && nativePresentFrames > 0) {
    parts.push(`原生呈现帧 ${Math.round(nativePresentFrames)}`);
  }
  if (nativePresentReason && !nativePresentReady) {
    parts.push(`原生呈现原因 ${nativePresentReason.replace(/\s+/g, " ").slice(0, 80)}`);
  }
  if (nativeWindowSwapchainMode || nativeWindowSwapchainReady) {
    parts.push(`原生窗口交换链 ${nativeWindowSwapchainReady ? "ready" : "blocked"}`);
  }
  if (nativeWindowSwapchainFormat) {
    const swapchainSize =
      Number.isFinite(nativeWindowSwapchainWidth) && nativeWindowSwapchainWidth > 0 &&
      Number.isFinite(nativeWindowSwapchainHeight) && nativeWindowSwapchainHeight > 0
        ? `${Math.round(nativeWindowSwapchainWidth)}x${Math.round(nativeWindowSwapchainHeight)} `
        : "";
    parts.push(`原生窗口交换链 D3D11 ${swapchainSize}${nativeWindowSwapchainFormat}`.trim());
  }
  if (nativeWindowSwapchainStatus) {
    parts.push(`原生窗口交换链状态 ${nativeWindowSwapchainStatus}`);
  }
  if (Number.isFinite(nativeWindowSwapchainBufferCount) && nativeWindowSwapchainBufferCount > 0) {
    const effect = nativeWindowSwapchainSwapEffect ? ` / ${nativeWindowSwapchainSwapEffect}` : "";
    parts.push(`原生窗口交换链参数 ${Math.round(nativeWindowSwapchainBufferCount)} buffers${effect}`);
  }
  if (nativeWindowSwapchainReason && !nativeWindowSwapchainReady) {
    parts.push(`原生窗口交换链原因 ${nativeWindowSwapchainReason.replace(/\s+/g, " ").slice(0, 80)}`);
  }
  if (nativeDecoderProgress || nativePresentReady || nativeWindowSwapchainReady) {
    parts.push(`原生分类 ${nativeClassifier.nativeClass}`);
    parts.push(`原生下一步 ${nativeClassifier.nativeNext}`);
  }
  if (nativeProgressStatus) {
    parts.push(`原生进展 ${nativeProgressStatus}`);
    if (Number.isFinite(nativeProgressWindowMs) && nativeProgressWindowMs > 0) {
      parts.push(`原生窗口 ${Math.round(nativeProgressWindowMs)}ms`);
    }
    if (Number.isFinite(nativePresentFrameDelta) && nativePresentFrameDelta > 0) {
      const fpsText = Number.isFinite(nativePresentFps) && nativePresentFps > 0
        ? ` / ${nativePresentFps.toFixed(1)} FPS`
        : "";
      parts.push(`原生呈现增长 ${Math.round(nativePresentFrameDelta)}${fpsText}`);
    }
    if (Number.isFinite(nativeDecodedFrameDelta) && nativeDecodedFrameDelta > 0) {
      const fpsText = Number.isFinite(nativeDecodedFps) && nativeDecodedFps > 0
        ? ` / ${nativeDecodedFps.toFixed(1)} FPS`
        : "";
      parts.push(`原生解码增长 ${Math.round(nativeDecodedFrameDelta)}${fpsText}`);
    }
    if (Number.isFinite(nativeWebBypassDelta) && nativeWebBypassDelta > 0) {
      const fpsText = Number.isFinite(nativeWebBypassFps) && nativeWebBypassFps > 0
        ? ` / ${nativeWebBypassFps.toFixed(1)} FPS`
        : "";
      parts.push(`Web旁路增长 ${Math.round(nativeWebBypassDelta)}${fpsText}`);
    }
    if (Number.isFinite(nativeFramesPushedDelta) && nativeFramesPushedDelta > 0) {
      parts.push(`原生入站增长 ${Math.round(nativeFramesPushedDelta)}`);
    }
    if (Number.isFinite(nativeSubmittedFrameDelta) && nativeSubmittedFrameDelta > 0) {
      parts.push(`原生提交增长 ${Math.round(nativeSubmittedFrameDelta)}`);
    }
    if (nativeProgressNext) parts.push(`原生进展下一步 ${nativeProgressNext}`);
  }
  parts.push(...formatW13LocalVideoQosDiagnostics(diagnostics));
  if (nativeDecoderSessionReason && !nativeDecoderSessionActive) {
    parts.push(`原生会话原因 ${nativeDecoderSessionReason.replace(/\s+/g, " ").slice(0, 80)}`);
  }
  if (nativeLastReason) {
    parts.push(`原生原因 ${nativeLastReason}`);
  }
  if (Number.isFinite(nativeErrors) && nativeErrors > 0) {
    parts.push(`原生错误 ${nativeErrors}`);
  }
  if (nativeLastError) {
    parts.push(`原生最近错误 ${nativeLastError.replace(/\s+/g, " ").slice(0, 80)}`);
  }
  if (Number.isFinite(queue) && queue > 0) {
    parts.push(`队列 ${queue}`);
  }
  if (Number.isFinite(queueMs) && queueMs > 0) {
    parts.push(`队列 ${Math.round(queueMs)}ms`);
  }
  if (Number.isFinite(latency) && latency > 0) {
    parts.push(`解码 ${Math.round(latency)}ms`);
  }
  if (Number.isFinite(droppedStaleFrames) && droppedStaleFrames > 0) {
    parts.push(`本机丢旧帧 ${droppedStaleFrames}`);
  }
  if (lastDropReason) {
    parts.push(`原因 ${lastDropReason}`);
  }
  if (Number.isFinite(errors) && errors > 0) {
    parts.push(`错误 ${errors}`);
  }
  if (diagnostics.h264FallbackReason) {
    parts.push(`回退：${diagnostics.h264FallbackReason}`);
  }
  const fallbackRecoveryCount = Number(diagnostics.h264FallbackRecoveryCount);
  if (Number.isFinite(fallbackRecoveryCount) && fallbackRecoveryCount > 0) {
    parts.push(`回退恢复 ${fallbackRecoveryCount} 次`);
  }
  const fallbackLastReason = String(diagnostics.h264FallbackLastReason || "").trim();
  if (fallbackLastReason) {
    parts.push(`最近回退：${fallbackLastReason}`);
  }
  const fallbackRecoveryPauseCount = Number(diagnostics.h264FallbackRecoveryPauseCount);
  if (Number.isFinite(fallbackRecoveryPauseCount) && fallbackRecoveryPauseCount > 0) {
    parts.push(`恢复暂停 ${fallbackRecoveryPauseCount} 次`);
  }
  const fallbackRecoveryPausedMs = Number(diagnostics.h264FallbackRecoveryPausedMs);
  if (Number.isFinite(fallbackRecoveryPausedMs) && fallbackRecoveryPausedMs > 0) {
    parts.push(`暂停剩余 ${Math.ceil(fallbackRecoveryPausedMs / 1000)}s`);
  }

  return parts.join(" / ");
}

function getHostPermissionWarnings(permissions) {
  if (!permissions || typeof permissions !== "object") {
    return [];
  }

  const warnings = [];
  if (normalizeOptionalBoolean(permissions.screenRecording) === false) {
    warnings.push("屏幕录制未开，可能只能看到模拟画面");
  }
  if (normalizeOptionalBoolean(permissions.accessibility) === false) {
    warnings.push("辅助功能未开，鼠标键盘注入可能失败");
  }
  if (normalizeOptionalBoolean(permissions.inputMonitoring) === false) {
    warnings.push("输入监控未开，部分快捷键可能受限");
  }
  return warnings;
}

function isMockVideoDiagnostics(diagnostics = state.hostDiagnostics) {
  return (
    diagnostics.videoSource === "mock" ||
    diagnostics.capturePipeline === "mock-svg" ||
    diagnostics.capturePipeline === "screen-fallback-mock" ||
    diagnostics.capturePipeline === "screen-timeout-mock" ||
    diagnostics.capturePipeline === "screen-cooldown-mock" ||
    diagnostics.videoCodec === "mock-svg"
  );
}

function getHostDiagnosticsLevel(diagnostics = state.hostDiagnostics) {
  const warnings = getHostPermissionWarnings(diagnostics.permissions);
  const hasCaptureFallback =
    diagnostics.capturePipeline === "screen-fallback-mock" ||
    diagnostics.capturePipeline === "screen-timeout-mock" ||
    diagnostics.capturePipeline === "screen-cooldown-mock";
  if (diagnostics.inputAckStatus === "rejected") {
    return "warning";
  }
  if (diagnostics.inputMode === "log") {
    return "warning";
  }
  if (diagnostics.videoDecoderStatus === "error" || diagnostics.videoDecoderStatus === "fallback") {
    return "warning";
  }
  if (diagnostics.streamFallbackReason) {
    return "warning";
  }
  if (Number(diagnostics.videoDecoderErrors) > 0) {
    return "warning";
  }
  if (diagnostics.videoFrameClockSkewed || Number(diagnostics.videoFrameAgeMs) > 1000) {
    return "warning";
  }
  if (getVideoRateWarning() || formatRemoteFpsLimitText()) {
    return "warning";
  }
  if (warnings.length > 0 || hasCaptureFallback) {
    return "warning";
  }
  if (
    state.connected &&
    isMockVideoDiagnostics(diagnostics) &&
    (diagnostics.hostMode === "mac-host-mock-video" ||
      hasCaptureFallback)
  ) {
    return "warning";
  }
  if (state.connected) {
    return "ok";
  }
  return "idle";
}

function setHostDiagnosticsLevel(level) {
  elements.hostDiagnosticsText.classList.toggle("is-ok", level === "ok");
  elements.hostDiagnosticsText.classList.toggle("is-warning", level === "warning");
}

function renderHostDiagnosticsText() {
  const diagnostics = state.hostDiagnostics;
  const parts = [];
  const hostParts = [
    diagnostics.hostMode ? labelFromMap(diagnostics.hostMode, hostModeLabels) : "",
    diagnostics.capturePipeline ? labelFromMap(diagnostics.capturePipeline, capturePipelineLabels) : "",
  ].filter(Boolean);
  const videoParts = [
    diagnostics.videoCodec || "",
    diagnostics.videoEncoding || "",
    diagnostics.videoSource ? labelFromMap(diagnostics.videoSource, videoSourceLabels) : "",
  ].filter(Boolean);
  const inputText = formatInputDiagnostics(diagnostics);
  const decoderText = formatVideoDecoderDiagnostics(diagnostics);
  const streamFallbackText = diagnostics.streamFallbackReason || "";
  const runtimeText = formatHostRuntimeDiagnostics(diagnostics.runtime);
  const droppedFrames = Number(diagnostics.droppedFrames);
  const frameAgeText = formatVideoFrameAge(diagnostics.videoFrameAgeMs, {
    clockSkewed: diagnostics.videoFrameClockSkewed,
  });
  const qualityText = formatJpegQuality(diagnostics.jpegQuality);
  const clipboardText = formatClipboardCapability(
    diagnostics.clipboardText,
    diagnostics.clipboardTextMode,
  );
  const clipboardFile = formatClipboardCapability(
    diagnostics.clipboardFile,
    diagnostics.clipboardFileMode,
  );
  const permissionText = formatPermissionStatus(diagnostics.permissions);
  const fpsLimitText = formatRemoteFpsLimitText();

  if (hostParts.length > 0) {
    parts.push(`主机：${hostParts.join(" / ")}`);
  }
  if (runtimeText) {
    parts.push(`运行：${runtimeText}`);
  }
  if (videoParts.length > 0) {
    const frameParts = [...videoParts];
    const rateWarning = getVideoRateWarning();
    if (Number.isFinite(droppedFrames)) {
      frameParts.push(`丢帧 ${droppedFrames}`);
    }
    if (rateWarning) {
      frameParts.push(rateWarning);
    }
    if (fpsLimitText) {
      frameParts.push(fpsLimitText);
    }
    if (frameAgeText) {
      frameParts.push(diagnostics.videoFrameClockSkewed ? frameAgeText : `到达 ${frameAgeText}`);
    }
    if (qualityText) {
      frameParts.push(qualityText);
    }
    parts.push(`视频：${frameParts.join(" / ")}`);
  } else if (fpsLimitText) {
    parts.push(`视频上限：${fpsLimitText}`);
  }
  if (decoderText) {
    parts.push(`解码：${decoderText}`);
  }
  if (streamFallbackText) {
    parts.push(`视频回退：${streamFallbackText}`);
  }
  if (permissionText) {
    parts.push(`权限：${permissionText}`);
  }
  if (inputText) {
    parts.push(`输入：${inputText}`);
  }
  if (clipboardText || clipboardFile) {
    parts.push(`剪贴板：文字 ${clipboardText || "未知"}，文件 ${clipboardFile || "未知"}`);
  }

  return parts.length > 0 ? `诊断：${parts.join("；")}` : defaultHostDiagnosticsText;
}

function updateHostDiagnostics(nextDiagnostics = {}) {
  const normalizedDiagnostics = Object.fromEntries(
    Object.entries(nextDiagnostics).filter(([, value]) => value !== undefined),
  );
  state.hostDiagnostics = {
    ...state.hostDiagnostics,
    ...normalizedDiagnostics,
  };
  elements.hostDiagnosticsText.textContent = renderHostDiagnosticsText();
  setHostDiagnosticsLevel(getHostDiagnosticsLevel());
  updateInputStatus();
  if (Object.prototype.hasOwnProperty.call(normalizedDiagnostics, "maxScreenFps")) {
    updateFpsMetric();
  }
  syncFloatingControlStatus();
}

function resetHostDiagnostics(text = defaultHostDiagnosticsText) {
  state.hostDiagnostics = getEmptyHostDiagnostics();
  elements.hostDiagnosticsText.textContent = text;
  setHostDiagnosticsLevel("idle");
  updateInputStatus();
}

function readPreferences() {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writePreferences(nextPreferences) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(nextPreferences));
  } catch {
    addLog("设置保存", "当前环境不允许写入本地存储");
  }
}

function collectPreferences() {
  return {
    transport: elements.transportSelect.value,
    host: elements.hostInput.value.trim(),
    port: elements.portInput.value.trim(),
    mockScenario: elements.mockScenarioSelect.value,
    qualityPreset: elements.qualityPresetSelect.value,
    resolution: elements.resolutionSelect.value,
    displayId: elements.displaySelect.value,
    fps: elements.fpsSelect.value,
    bandwidth: elements.bandwidthSelect.value,
    scaleMode: elements.scaleModeSelect.value,
    audio: elements.audioToggle.checked,
    audioVolume: elements.audioVolumeRange.value,
    clipboard: elements.clipboardToggle.checked,
    keyboardMapping: getKeyboardMapping(),
    shortcutCompatibility: elements.shortcutCompatToggle.checked,
    localHostPort: elements.localHostPortInput.value.trim(),
    localHostScreenMode: elements.localHostScreenModeSelect.value,
    localHostAudioMode: elements.localHostAudioModeSelect.value,
    localHostInputMode: elements.localHostInputModeSelect.value,
    localHostReverseControlMode: elements.localHostReverseControlModeSelect.value,
    localHostReadinessProfile: elements.localHostReadinessProfileSelect.value,
    recentConnections: state.recentConnections,
  };
}

function savePreferences() {
  writePreferences(collectPreferences());
}

function normalizeDisplayOption(kind, value) {
  const normalized = String(value ?? "");
  return allowedDisplayOptions[kind]?.includes(normalized)
    ? normalized
    : displayOptionDefaults[kind];
}

function applyPreferences() {
  const preferences = readPreferences();

  if (preferences.transport) elements.transportSelect.value = preferences.transport;
  if (preferences.host) elements.hostInput.value = preferences.host;
  if (preferences.port) elements.portInput.value = preferences.port;
  if (preferences.mockScenario) elements.mockScenarioSelect.value = preferences.mockScenario;
  if (preferences.qualityPreset) elements.qualityPresetSelect.value = preferences.qualityPreset;
  elements.resolutionSelect.value = normalizeDisplayOption("resolution", preferences.resolution);
  if (preferences.displayId) state.activeDisplayId = preferences.displayId;
  elements.fpsSelect.value = normalizeDisplayOption("fps", preferences.fps);
  elements.bandwidthSelect.value = normalizeDisplayOption("bandwidth", preferences.bandwidth);
  if (preferences.scaleMode) elements.scaleModeSelect.value = preferences.scaleMode;
  if (typeof preferences.audio === "boolean") elements.audioToggle.checked = preferences.audio;
  if (preferences.audioVolume) elements.audioVolumeRange.value = preferences.audioVolume;
  if (typeof preferences.clipboard === "boolean") {
    elements.clipboardToggle.checked = preferences.clipboard;
  }
  elements.shortcutCompatToggle.checked =
    typeof preferences.shortcutCompatibility === "boolean"
      ? preferences.shortcutCompatibility
      : true;
  if (preferences.localHostPort) elements.localHostPortInput.value = preferences.localHostPort;
  if (preferences.localHostScreenMode) elements.localHostScreenModeSelect.value = preferences.localHostScreenMode;
  if (preferences.localHostAudioMode) elements.localHostAudioModeSelect.value = preferences.localHostAudioMode;
  if (preferences.localHostInputMode) elements.localHostInputModeSelect.value = preferences.localHostInputMode;
  if (preferences.localHostReverseControlMode) {
    elements.localHostReverseControlModeSelect.value = preferences.localHostReverseControlMode;
  }
  if (preferences.localHostReadinessProfile) {
    elements.localHostReadinessProfileSelect.value = preferences.localHostReadinessProfile;
  }
  applyKeyboardMapping(preferences.keyboardMapping ?? defaultKeyboardMapping);

  state.recentConnections = Array.isArray(preferences.recentConnections)
    ? preferences.recentConnections.slice(0, 5)
    : [];
  renderDisplayOptions(fallbackDisplays, state.activeDisplayId);
  renderRecentConnections();
  syncFloatingControlCenter();
}

function normalizeDisplays(displays = []) {
  const normalized = displays
    .filter(Boolean)
    .map((display, index) => ({
      id: String(display.id ?? `display-${index + 1}`),
      name: display.name || `显示器 ${index + 1}`,
      width: Number(display.width) || 0,
      height: Number(display.height) || 0,
      primary: Boolean(display.primary),
    }));

  return normalized.length > 0 ? normalized : fallbackDisplays;
}

function getDisplayOptionLabel(display) {
  const size = display.width && display.height ? ` · ${display.width} × ${display.height}` : "";
  return `${display.name}${display.primary ? " · 主屏" : ""}${size}`;
}

function renderDisplayOptions(displays = state.remoteDisplays, preferredDisplayId = state.activeDisplayId) {
  state.remoteDisplays = normalizeDisplays(displays);
  const nextDisplayId =
    state.remoteDisplays.find((display) => display.id === preferredDisplayId)?.id ??
    state.remoteDisplays.find((display) => display.primary)?.id ??
    state.remoteDisplays[0].id;

  elements.displaySelect.innerHTML = "";
  state.remoteDisplays.forEach((display) => {
    const option = document.createElement("option");
    option.value = display.id;
    option.textContent = getDisplayOptionLabel(display);
    elements.displaySelect.append(option);
  });

  elements.displaySelect.value = nextDisplayId;
  state.activeDisplayId = nextDisplayId;
  syncFloatingControlCenter();
}

function updateDisplaysFromSession(answer = {}) {
  renderDisplayOptions(answer.displays, answer.activeDisplayId || answer.displayId || state.activeDisplayId);
}

function getKeyboardMapping() {
  return {
    win: normalizeKeyMapValue(elements.keyMapWinSelect.value, defaultKeyboardMapping.win),
    alt: normalizeKeyMapValue(elements.keyMapAltSelect.value, defaultKeyboardMapping.alt),
    ctrl: normalizeKeyMapValue(elements.keyMapCtrlSelect.value, defaultKeyboardMapping.ctrl),
  };
}

function applyKeyboardMapping(mapping = defaultKeyboardMapping) {
  elements.keyMapWinSelect.value = normalizeKeyMapValue(mapping.win, defaultKeyboardMapping.win);
  elements.keyMapAltSelect.value = normalizeKeyMapValue(mapping.alt, defaultKeyboardMapping.alt);
  elements.keyMapCtrlSelect.value = normalizeKeyMapValue(mapping.ctrl, defaultKeyboardMapping.ctrl);
}

function resetKeyboardMapping() {
  applyKeyboardMapping(defaultKeyboardMapping);
  elements.shortcutCompatToggle.checked = true;
  savePreferences();
  addLog("按键映射", "已还原默认：Win→Command，Alt→Option，Ctrl→Control，Windows 快捷键开启");
}

function mapKeyboardModifiers(event) {
  return mapKeyboardInput(event, {
    keyboardMapping: getKeyboardMapping(),
    shortcutCompatibility: elements.shortcutCompatToggle.checked,
  });
}

function applyQualityPreset(presetKey, { send = true } = {}) {
  const preset = qualityPresets[presetKey];
  if (!preset) {
    savePreferences();
    return;
  }

  state.applyingQualityPreset = true;
  elements.resolutionSelect.value = preset.resolution;
  elements.fpsSelect.value = preset.fps;
  elements.bandwidthSelect.value = preset.bandwidth;
  if (preset.scaleMode) {
    elements.scaleModeSelect.value = preset.scaleMode;
    applyScaleMode();
  }
  state.applyingQualityPreset = false;
  updateMetrics();
  savePreferences();
  addLog("画质预设", `${preset.label} · ${preset.resolution} · ${preset.fps} Hz · ${preset.bandwidth} Mbps`);

  if (send) {
    sendDisplaySettings();
  }
}

function markQualityPresetCustom() {
  if (state.applyingQualityPreset || elements.qualityPresetSelect.value === "custom") {
    return;
  }
  elements.qualityPresetSelect.value = "custom";
}

function getPlatformLabel(platform = "") {
  const value = platform.toLowerCase();
  if (value === "macos") return "Mac";
  if (value === "windows") return "Windows";
  return platform || "未知系统";
}

function getRoleLabel(role = "") {
  const value = role.toLowerCase();
  if (value === "host") return "可被控制";
  if (value === "controller") return "控制端";
  if (value === "both") return "双端待命";
  return role || "未知角色";
}

function makeDeviceKey(device) {
  return `${device.transport ?? "websocket"}:${device.host}:${device.port}`;
}

function makeDiscoveryCandidate(host, port = defaultControlPort) {
  const normalizedHost = String(host ?? "").trim();
  const normalizedPort = String(port ?? defaultControlPort).trim();
  if (!normalizedHost || !normalizedPort) return null;
  return {
    host: normalizedHost,
    port: normalizedPort,
  };
}

function getDiscoveryCandidates() {
  const candidates = [
    makeDiscoveryCandidate(elements.hostInput.value, elements.portInput.value),
    makeDiscoveryCandidate("127.0.0.1", defaultControlPort),
    makeDiscoveryCandidate("127.0.0.1", "43771"),
    ...state.recentConnections.map((connection) =>
      makeDiscoveryCandidate(connection.host, connection.port),
    ),
    ...fallbackDevices
      .filter((device) => device.transport === "websocket")
      .map((device) => makeDiscoveryCandidate(device.host, device.port)),
  ].filter(Boolean);

  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.host}:${candidate.port}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeDiscoveryDevice(payload, candidate) {
  if (!payload || payload.type !== "lan_dual_discovery") {
    return null;
  }

  const host =
    payload.host && payload.host !== "0.0.0.0" ? String(payload.host) : candidate.host;
  const port = String(payload.controlPort ?? payload.port ?? candidate.port ?? defaultControlPort);
  const platform = payload.platform ?? "unknown";
  const role = payload.role ?? "host";

  return {
    id: payload.deviceId || `discovery:${platform}:${role}:${host}:${port}`,
    deviceName: payload.deviceName || `${getPlatformLabel(platform)} 被控端`,
    host,
    port,
    platform,
    role,
    transport: "websocket",
    status: "online",
    source: "自动发现",
    capabilities: payload.capabilities ?? {},
    runtime: normalizeHostRuntime(payload.runtime),
    lastSeenAt: payload.lastSeenAt || new Date().toISOString(),
  };
}

async function probeDiscoveryCandidate(candidate) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), discoveryProbeTimeoutMs);

  try {
    const response = await fetch(`http://${candidate.host}:${candidate.port}/discovery`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return normalizeDiscoveryDevice(await response.json(), candidate);
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function runDiscoveryCandidates(candidates, concurrency = browserDiscoveryProbeConcurrency) {
  const results = new Array(candidates.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
    while (cursor < candidates.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await probeDiscoveryCandidate(candidates[index]);
    }
  });
  await Promise.all(workers);
  return results.filter(Boolean);
}

function normalizeDesktopDiscoveryDevice(item) {
  if (!item || item.ok === false) {
    return null;
  }
  const candidate = makeDiscoveryCandidate(item.host, item.port);
  if (!candidate) {
    return null;
  }
  const platform = item.platform || "unknown";
  const role = item.role || "host";
  return {
    id: item.deviceId || `discovery:${platform}:${role}:${candidate.host}:${candidate.port}`,
    deviceName: item.deviceName || `${getPlatformLabel(platform)} 被控端`,
    host: candidate.host,
    port: candidate.port,
    platform,
    role,
    transport: "websocket",
    status: "online",
    source: "局域网扫描",
    capabilities: item.capabilities ?? {},
    runtime: normalizeHostRuntime(item.runtime),
    lastSeenAt: item.lastSeenAt || new Date().toISOString(),
  };
}

function buildDeviceList(discoveredDevices = []) {
  const devices = [...discoveredDevices.filter(Boolean), ...fallbackDevices];
  const byKey = new Map();

  devices.forEach((device) => {
    const key = makeDeviceKey(device);
    if (!byKey.has(key) || byKey.get(key).status !== "online") {
      byKey.set(key, {
        ...device,
        id: device.id || key,
      });
    }
  });

  return [...byKey.values()].sort((left, right) => {
    const rank = { online: 0, suggested: 1, manual: 2 };
    return (rank[left.status] ?? 9) - (rank[right.status] ?? 9);
  });
}

function upsertDiscoveredDevice(device) {
  if (!device) return;
  const key = makeDeviceKey(device);
  const onlineDevices = state.discoveredDevices.filter(
    (item) => item.status === "online" && makeDeviceKey(item) !== key,
  );
  state.discoveredDevices = buildDeviceList([device, ...onlineDevices]);
  renderDiscoveredDevices();
}

function findDiscoveredDevice(host, port, transport = "websocket") {
  const targetHost = String(host ?? "").trim();
  const targetPort = String(port ?? "").trim();
  const targetTransport = transport ?? "websocket";
  if (!targetHost || !targetPort) return null;
  return (
    state.discoveredDevices.find(
      (device) =>
        device.host === targetHost &&
        String(device.port) === targetPort &&
        (device.transport ?? "websocket") === targetTransport,
    ) ?? null
  );
}

async function probeConnectionDiagnostics(host, port, transport = "websocket") {
  if (transport !== "websocket") {
    return null;
  }
  const candidate = makeDiscoveryCandidate(host, port);
  if (!candidate) {
    return null;
  }
  const device = await probeDiscoveryCandidate(candidate);
  if (device) {
    upsertDiscoveredDevice(device);
    return device;
  }
  return null;
}

function isCurrentConnectionDevice(device) {
  if (!device) return false;
  return (
    elements.hostInput.value.trim() === String(device.host ?? "").trim() &&
    elements.portInput.value.trim() === String(device.port ?? "").trim() &&
    elements.transportSelect.value === (device.transport ?? "websocket")
  );
}

function autoSelectDeviceRank(device) {
  const platform = String(device.platform ?? "").toLowerCase();
  const role = String(device.role ?? "").toLowerCase();
  if (platform === "macos" && role === "host") return 0;
  if (platform === "macos") return 1;
  if (role === "host") return 2;
  return 3;
}

function pickAutoSelectableDevice(devices) {
  const onlineWebSocketDevices = devices.filter(
    (device) => device.status === "online" && (device.transport ?? "websocket") === "websocket",
  );
  if (onlineWebSocketDevices.length === 0) {
    return null;
  }

  const currentOnline = onlineWebSocketDevices.find(isCurrentConnectionDevice);
  if (currentOnline) {
    return currentOnline;
  }

  return onlineWebSocketDevices
    .slice()
    .sort((left, right) => autoSelectDeviceRank(left) - autoSelectDeviceRank(right))[0];
}

function autoSelectDiscoveredDevice(devices) {
  if (state.connected || state.connecting) {
    return null;
  }

  const device = pickAutoSelectableDevice(devices);
  if (!device) {
    return null;
  }

  const changed = !isCurrentConnectionDevice(device);
  elements.hostInput.value = device.host;
  elements.portInput.value = device.port;
  elements.transportSelect.value = device.transport ?? "websocket";
  updateHostDiagnostics({
    runtime: normalizeHostRuntime(device.runtime),
    maxScreenFps: normalizeRemoteMaxScreenFps(device.capabilities?.maxScreenFps),
  });
  savePreferences();

  if (changed) {
    addLog("自动选择设备", `${device.deviceName} · ${device.host}:${device.port}`);
  }

  return device;
}

function selectDevice(device, button) {
  document.querySelectorAll(".device-row, .history-row").forEach((item) =>
    item.classList.remove("active"),
  );
  button?.classList.add("active");
  elements.hostInput.value = device.host;
  elements.portInput.value = device.port;
  elements.transportSelect.value = device.transport ?? "websocket";
  savePreferences();
  if (!state.connected && !state.connecting) {
    updateHostDiagnostics({
      runtime: normalizeHostRuntime(device.runtime),
      maxScreenFps: normalizeRemoteMaxScreenFps(device.capabilities?.maxScreenFps),
    });
  }
  addLog("选择设备", `${device.deviceName} · ${device.host}:${device.port}`);
}

function renderDiscoveredDevices() {
  elements.deviceList.innerHTML = "";

  state.discoveredDevices.forEach((device) => {
    const button = document.createElement("button");
    button.className = "device-row";
    button.type = "button";
    button.dataset.host = device.host;
    button.dataset.port = device.port;
    button.dataset.transport = device.transport ?? "websocket";

    const isActive =
      elements.hostInput.value.trim() === device.host &&
      elements.portInput.value.trim() === device.port &&
      elements.transportSelect.value === button.dataset.transport;
    if (isActive) {
      button.classList.add("active");
    }

    const dot = document.createElement("span");
    dot.className = `device-dot ${device.status === "online" ? "online" : "muted"}`;

    const textWrap = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = device.deviceName;
    const detail = document.createElement("small");
    const statusText = device.status === "online" ? "在线" : device.source;
    const runtimeText = formatHostRuntimeDiagnostics(device.runtime);
    const maxScreenFps = normalizeRemoteMaxScreenFps(device.capabilities?.maxScreenFps);
    const fpsLimitText = maxScreenFps ? `最高 ${maxScreenFps} Hz` : "";
    detail.textContent = [
      `${device.host}:${device.port}`,
      getPlatformLabel(device.platform),
      getRoleLabel(device.role),
      statusText,
      fpsLimitText,
      runtimeText,
    ].filter(Boolean).join(" · ");
    textWrap.append(title, detail);
    button.append(dot, textWrap);
    button.addEventListener("click", () => selectDevice(device, button));
    elements.deviceList.append(button);
  });
}

async function refreshDevices() {
  elements.refreshDevicesButton.disabled = true;
  addLog("刷新设备", "正在探测本机、连接历史和局域网设备");

  try {
    const invoke = getTauriInvoke();
    let discovered = [];
    let usedDesktopScan = false;
    if (invoke) {
      try {
        const result = await invoke("discover_lan_hosts", {
          request: {
            port: Number(elements.portInput.value) || Number(defaultControlPort),
            timeoutMs: discoveryLanScanTimeoutMs,
            requireFound: false,
          },
        });
        discovered = (result?.json?.found || []).map(normalizeDesktopDiscoveryDevice).filter(Boolean);
        usedDesktopScan = true;
      } catch (error) {
        addLog("局域网扫描", error?.message || "桌面扫描失败，改用浏览器轻量探测");
      }
    }

    const browserDiscovered = await runDiscoveryCandidates(getDiscoveryCandidates());
    discovered = [...discovered, ...browserDiscovered];
    state.discoveredDevices = buildDeviceList(discovered);
    const selectedDevice = autoSelectDiscoveredDevice(state.discoveredDevices);
    renderDiscoveredDevices();

    const onlineCount = state.discoveredDevices.filter((device) => device.status === "online").length;
    addLog(
      "刷新设备",
      onlineCount > 0
        ? `发现 ${onlineCount} 台在线设备${selectedDevice ? "，已自动选中可连接设备" : ""}${usedDesktopScan ? "，已扫描局域网" : ""}`
        : "暂未发现在线设备，保留手动和模拟入口",
    );
  } finally {
    elements.refreshDevicesButton.disabled = false;
  }
}

function rememberCurrentConnection() {
  const host = elements.hostInput.value.trim();
  const port = elements.portInput.value.trim();
  if (!host || !port) return;

  const transport = elements.transportSelect.value;
  const id = `${transport}:${host}:${port}`;
  const nextConnection = {
    id,
    host,
    port,
    transport,
    label: transport === "websocket" ? "WebSocket 局域网" : "本地模拟",
    lastConnectedAt: new Date().toISOString(),
  };

  state.recentConnections = [
    nextConnection,
    ...state.recentConnections.filter((item) => item.id !== id),
  ].slice(0, 5);

  renderRecentConnections();
  savePreferences();
}

function renderRecentConnections() {
  elements.historyList.innerHTML = "";

  if (state.recentConnections.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "还没有连接历史";
    elements.historyList.append(empty);
    return;
  }

  state.recentConnections.forEach((connection) => {
    const button = document.createElement("button");
    button.className = "history-row";
    button.type = "button";
    button.dataset.host = connection.host;
    button.dataset.port = connection.port;
    button.dataset.transport = connection.transport;
    const dot = document.createElement("span");
    dot.className = "device-dot";
    const textWrap = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = `${connection.host}:${connection.port}`;
    const detail = document.createElement("small");
    detail.textContent = connection.label;
    textWrap.append(title, detail);
    button.append(dot, textWrap);
    button.addEventListener("click", () => {
      document.querySelectorAll(".device-row, .history-row").forEach((item) =>
        item.classList.remove("active"),
      );
      button.classList.add("active");
      elements.hostInput.value = connection.host;
      elements.portInput.value = connection.port;
      elements.transportSelect.value = connection.transport;
      savePreferences();
      addLog("选择历史", `${connection.label} · ${connection.host}:${connection.port}`);
    });
    elements.historyList.append(button);
  });
}

function setUiConnecting(host, port) {
  state.connecting = true;
  state.connected = false;
  state.videoFrames = 0;
  resetVideoFrameStats();
  resetVideoDecoder({ resetFallback: true });
  resetAudioPlayback();
  state.lastFrameDecodeErrorId = "";
  rejectAllRemoteFileTransfers("正在建立新连接，远端文件接收已中断", { notifyPeer: false });
  elements.remoteCanvas.classList.remove("has-video-frame");
  resetReverseControlState();
  setConnectionState("connecting", `正在连接 ${host}:${port}`);
  resetHostDiagnostics(`诊断：正在连接 ${host}:${port}`);
  elements.connectButton.disabled = true;
  elements.disconnectButton.disabled = false;
  elements.reverseButton.disabled = true;
  updateFileClipboardButton();
  syncFloatingControlCenter();
}

function setUiConnected(answer) {
  state.connected = true;
  state.connecting = false;
  clearReconnectTimers();
  state.reconnectStableTimer = window.setTimeout(markConnectionStable, 10000);
  setConnectionState("streaming", `已连接 ${state.activeHost}:${state.activePort}`);
  elements.connectButton.disabled = true;
  elements.disconnectButton.disabled = false;
  elements.reverseButton.disabled = false;
  updateDisplaysFromSession(answer);
  updateFileClipboardButton();
  const selectedDevice = findDiscoveredDevice(
    state.activeHost,
    state.activePort,
    elements.transportSelect.value,
  );
  const runtime = normalizeHostRuntime(answer.runtime) ?? selectedDevice?.runtime ?? state.hostDiagnostics.runtime;
  const maxScreenFps =
    normalizeRemoteMaxScreenFps(answer.maxScreenFps) ??
    normalizeRemoteMaxScreenFps(selectedDevice?.capabilities?.maxScreenFps) ??
    state.hostDiagnostics.maxScreenFps;
  updateHostDiagnostics({
    hostMode: answer.hostMode ?? "",
    capturePipeline: answer.capturePipeline ?? "",
    permissions: answer.permissions ?? null,
    clipboardText: answer.clipboardText ?? null,
    clipboardFile: answer.clipboardFile ?? null,
    clipboardTextMode: answer.clipboardTextMode ?? "",
    clipboardFileMode: answer.clipboardFileMode ?? "",
    inputMode: answer.inputMode ?? "",
    videoCodec: answer.videoCodec ?? "",
    videoEncoding: answer.videoEncoding ?? "",
    qualityPreset: answer.qualityPreset ?? "",
    jpegQuality: answer.jpegQuality ?? null,
    streamFallbackReason: answer.streamFallbackReason ?? "",
    maxScreenFps,
    runtime: runtime ?? null,
  });
  state.videoWaitingSince = performance.now();
  elements.remoteCanvas.focus();

  if (answer.width && answer.height) {
    elements.metricResolution.textContent = `${answer.width} × ${answer.height}`;
  }
  if (answer.fps) {
    state.negotiatedFps = Number(answer.fps) || 0;
    state.requestedFps = Number(answer.requestedFps) || Number(elements.fpsSelect.value) || state.negotiatedFps;
    updateFpsMetric();
  }
  if (answer.maxBandwidthKbps) {
    elements.metricBandwidth.textContent = `${Math.round(answer.maxBandwidthKbps / 1000)} Mbps`;
  }
  if (answer.audioEnabled) {
    state.audioWaitingSince = elements.audioToggle.checked ? performance.now() : 0;
    elements.audioText.textContent = `声音：已协商 · ${answer.audioCodec ?? "opus"}`;
  } else if (elements.audioToggle.checked) {
    state.audioWaitingSince = 0;
    elements.audioText.textContent = "声音：对端暂未开启音频流";
  } else {
    state.audioWaitingSince = 0;
  }

  const permissionWarnings = getHostPermissionWarnings(answer.permissions);
  if (permissionWarnings.length > 0) {
    addLog("Mac 权限", permissionWarnings.join("；"));
  }
  if (answer.capturePipeline === "mock-svg" && answer.hostMode === "mac-host-mock-video") {
    addLog("主机诊断", "Mac 当前返回模拟画面，请检查屏幕录制权限或视频模式");
  }
  if (answer.inputMode === "log") {
    addLog("输入模式", "Mac 当前是安全日志模式，只记录输入，不会真正控制鼠标键盘");
  }

  updateReverseControlUi();
  syncFloatingControlCenter();
}

function clearReconnectTimers() {
  if (state.reconnectTimer) {
    window.clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  if (state.reconnectCountdownTimer) {
    window.clearInterval(state.reconnectCountdownTimer);
    state.reconnectCountdownTimer = null;
  }
  if (state.reconnectStableTimer) {
    window.clearTimeout(state.reconnectStableTimer);
    state.reconnectStableTimer = null;
  }
  state.reconnectDueAt = 0;
  state.reconnectReason = "";
  updateReconnectControls(false);
}

function formatReconnectActionState(visible = Boolean(state.reconnectTimer)) {
  const isVisible = Boolean(visible);
  if (!isVisible || !state.reconnectDueAt) {
    return { label: "立即重连", title: "" };
  }

  const seconds = Math.max(0, Math.ceil((state.reconnectDueAt - Date.now()) / 1000));
  const attemptText = `${state.reconnectAttempts}/${maxReconnectAttempts}`;
  const label = seconds > 0 ? `立即重连（${seconds} 秒）` : "立即重连（现在）";
  const details = ["立即重连", `第 ${attemptText} 次`];
  if (seconds > 0) {
    details.push(`约 ${seconds} 秒后自动重连`);
  } else {
    details.push("正在自动重连");
  }
  if (state.reconnectReason) details.push(`原因：${state.reconnectReason}`);
  if (state.activeHost && state.activePort) details.push(`目标：${state.activeHost}:${state.activePort}`);
  return { label, title: details.join("；") };
}

function setReconnectButtonLabel(button, label, title) {
  if (!button) return;
  const icon = button.querySelector?.("[aria-hidden='true']");
  if (icon) {
    const textNodeType = window.Node?.TEXT_NODE ?? 3;
    let labelNode = Array.from(button.childNodes).find(
      (node) => node.nodeType === textNodeType && node.textContent.trim(),
    );
    if (!labelNode) {
      labelNode = document.createTextNode("");
      button.appendChild(labelNode);
    }
    labelNode.textContent = ` ${label}`;
  } else {
    button.textContent = label;
  }

  if (title) {
    button.title = title;
    button.setAttribute("aria-label", title);
  } else {
    button.removeAttribute("title");
    button.removeAttribute("aria-label");
  }
}

function updateReconnectControls(visible = Boolean(state.reconnectTimer)) {
  const isVisible = Boolean(visible);
  const actionState = formatReconnectActionState(isVisible);
  if (elements.reconnectNowButton) {
    elements.reconnectNowButton.hidden = !isVisible;
    elements.reconnectNowButton.disabled = !isVisible || state.connecting;
    setReconnectButtonLabel(elements.reconnectNowButton, actionState.label, actionState.title);
  }
  if (elements.floatingReconnectButton) {
    elements.floatingReconnectButton.hidden = !isVisible;
    elements.floatingReconnectButton.disabled = !isVisible || state.connecting;
    setReconnectButtonLabel(elements.floatingReconnectButton, actionState.label, actionState.title);
  }
  if (elements.connectionActions) {
    elements.connectionActions.classList.toggle("has-reconnect", isVisible);
  }
  syncFloatingControlStatus();
}

function formatReconnectCountdown(remainingMs) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const attemptText = `${state.reconnectAttempts}/${maxReconnectAttempts}`;
  if (seconds <= 0) {
    return `正在自动重连 ${state.activeHost}:${state.activePort}（${attemptText}）`;
  }
  return `连接中断，${seconds} 秒后自动重连（${attemptText}）`;
}

function getReconnectExhaustedSuggestion() {
  return "点“连接”重新尝试；复制诊断给两端；如仍失败，检查 Mac host 和局域网。";
}

function formatReconnectExhaustedStatus(reason = "") {
  const reasonText = reason ? `：${reason}` : "";
  return `连接失败：自动重连 ${maxReconnectAttempts} 次仍未恢复${reasonText}。点“连接”重新尝试，或复制诊断给两端。`;
}

function refreshReconnectCountdown() {
  if (!state.reconnectTimer || !state.reconnectDueAt) {
    updateReconnectControls(false);
    return;
  }
  const text = formatReconnectCountdown(state.reconnectDueAt - Date.now());
  state.connectionState = "reconnecting";
  setBadge(connectionStates.reconnecting.badge, connectionStates.reconnecting.label);
  elements.statusText.textContent = text;
  elements.remoteStatusText.textContent = text;
  updateReconnectControls(true);
  syncFloatingControlCenter();
}

function setUiDisconnected(statusText = "未连接", logDetail = "会话已关闭") {
  void stopW14NativeReceiver({ resetDiagnostics: true, force: true });
  state.connected = false;
  state.connecting = false;
  resetReverseControlState();
  setConnectionState(statusText === "连接失败" ? "failed" : "disconnected", statusText);
  elements.remoteFrameImage.removeAttribute("src");
  elements.remoteFrameImage.classList.remove("is-visible");
  elements.remoteVideoCanvas.classList.remove("is-visible");
  elements.remoteCanvas.classList.remove("has-video-frame");
  resetVideoFrameStats();
  resetVideoDecoder({ resetFallback: true });
  resetHostDiagnostics(statusText === "未连接" ? defaultHostDiagnosticsText : `诊断：${statusText}`);
  state.audioFrames = 0;
  state.audioFrameTimes = [];
  state.audioFrameTimingSamples = [];
  state.audioLevel = 0;
  resetAudioPlayback();
  elements.audioText.textContent = "声音：待机";
  elements.connectButton.disabled = false;
  elements.disconnectButton.disabled = true;
  elements.reverseButton.disabled = true;
  state.fileTransferActive = false;
  state.outgoingFileTransfer = null;
  rejectAllRemoteFileTransfers("连接已断开，远端文件接收已中断", { notifyPeer: false });
  updateFileClipboardButton();
  syncFloatingControlCenter();
  addLog("断开连接", logDetail);
}

function markConnectionStable() {
  state.reconnectStableTimer = null;
  if (!state.connected) return;
  state.reconnectAttempts = 0;
}

function handleUnexpectedClose(reason = "被控端关闭了连接") {
  void stopW14NativeReceiver({ resetDiagnostics: true, force: true });
  state.client = null;
  state.connected = false;
  state.connecting = false;
  elements.remoteFrameImage.removeAttribute("src");
  elements.remoteFrameImage.classList.remove("is-visible");
  elements.remoteVideoCanvas.classList.remove("is-visible");
  elements.remoteCanvas.classList.remove("has-video-frame");
  resetVideoFrameStats();
  resetVideoDecoder({ resetFallback: true });
  resetHostDiagnostics("诊断：连接中断，等待重连。");
  state.audioFrames = 0;
  state.audioFrameTimes = [];
  state.audioFrameTimingSamples = [];
  state.audioLevel = 0;
  resetAudioPlayback();
  elements.audioText.textContent = "声音：待机";
  rejectAllRemoteFileTransfers("连接中断，远端文件接收已中断", { notifyPeer: false });

  if (state.manualDisconnect) {
    setUiDisconnected("连接已断开", reason);
    return;
  }

  scheduleReconnect(reason);
}

function scheduleReconnect(reason) {
  clearReconnectTimers();
  clearReverseControlTimer();
  state.controlDirection = "windows_to_mac";
  state.reverseRequestId = "";
  state.pendingControlDirection = "";
  state.reverseStateDetail = getDefaultReverseStateDetail("windows_to_mac");

  if (state.reconnectAttempts >= maxReconnectAttempts) {
    state.reconnectReason = reason;
    state.reconnectDueAt = 0;
    const exhaustedStatus = formatReconnectExhaustedStatus(reason);
    setUiDisconnected("连接失败", `自动重连 ${maxReconnectAttempts} 次仍未恢复：${reason}`);
    setConnectionState("failed", exhaustedStatus);
    resetHostDiagnostics(`诊断：自动重连已停止（${maxReconnectAttempts}/${maxReconnectAttempts}）。${getReconnectExhaustedSuggestion()}`);
    addLog("自动重连停止", `已尝试 ${maxReconnectAttempts}/${maxReconnectAttempts} 次 · ${reason}`);
    syncFloatingControlCenter();
    return;
  }

  state.reconnectAttempts += 1;
  const delayMs = reconnectBaseDelayMs * state.reconnectAttempts;
  state.reconnectReason = reason;
  state.reconnectDueAt = Date.now() + delayMs;
  setConnectionState("reconnecting", formatReconnectCountdown(delayMs));
  resetHostDiagnostics(`诊断：等待第 ${state.reconnectAttempts}/${maxReconnectAttempts} 次自动重连。`);
  elements.connectButton.disabled = true;
  elements.disconnectButton.disabled = false;
  elements.reverseButton.disabled = true;
  updateFileClipboardButton();
  addLog("自动重连", `${reason} · 第 ${state.reconnectAttempts}/${maxReconnectAttempts} 次`);
  updateReverseControlUi();
  updateReconnectControls(true);
  state.reconnectCountdownTimer = window.setInterval(refreshReconnectCountdown, 1000);

  state.reconnectTimer = window.setTimeout(() => {
    if (state.reconnectCountdownTimer) {
      window.clearInterval(state.reconnectCountdownTimer);
      state.reconnectCountdownTimer = null;
    }
    state.reconnectTimer = null;
    state.reconnectDueAt = 0;
    updateReconnectControls(false);
    connect({ reconnect: true });
  }, delayMs);
}

function reconnectNow() {
  if (!state.reconnectTimer) return;
  window.clearTimeout(state.reconnectTimer);
  state.reconnectTimer = null;
  if (state.reconnectCountdownTimer) {
    window.clearInterval(state.reconnectCountdownTimer);
    state.reconnectCountdownTimer = null;
  }
  state.reconnectDueAt = 0;
  const attemptText = `${state.reconnectAttempts}/${maxReconnectAttempts}`;
  const reason = state.reconnectReason || "用户手动立即重连";
  updateReconnectControls(false);
  addLog("立即重连", `${reason} · 第 ${attemptText} 次`);
  connect({ reconnect: true });
}

function currentDisplaySettings() {
  const resolutionValue = elements.resolutionSelect.value;
  const [width, height] =
    resolutionValue === "native" ? ["原生", ""] : resolutionValue.split("x");

  return {
    qualityPreset: elements.qualityPresetSelect.value,
    displayMode: state.fullscreen ? "fullscreen" : "windowed",
    displayId: elements.displaySelect.value || state.activeDisplayId,
    resolutionMode: resolutionValue === "native" ? "native" : "fixed",
    width,
    height,
    fps: Number(elements.fpsSelect.value),
    maxBandwidthKbps: Number(elements.bandwidthSelect.value) * 1000,
    scaleMode: elements.scaleModeSelect.value,
    audio: elements.audioToggle.checked,
    audioVolume: Number(elements.audioVolumeRange.value),
    clipboard: elements.clipboardToggle.checked,
  };
}

function updateMetrics() {
  const settings = currentDisplaySettings();
  elements.metricResolution.textContent =
    settings.resolutionMode === "native" ? "原生" : `${settings.width} × ${settings.height}`;
  if (state.connected) {
    updateFpsMetric();
  } else {
    elements.metricFps.textContent = `请求 ${settings.fps} Hz`;
  }
  elements.metricBandwidth.textContent = `${elements.bandwidthSelect.value} Mbps`;
  elements.audioVolumeText.textContent = `${settings.audioVolume}%`;
  elements.audioText.textContent = settings.audio
    ? `声音：已开启 · ${settings.audioVolume}%`
    : "声音：已关闭";
  state.localClipboardStatusText = "";
  elements.clipboardText.textContent = `剪贴板：${settings.clipboard ? "已开启" : "已关闭"}`;
  updateFileClipboardButton();
  syncFloatingControlCenter();
}

function cloneSelectOptions(sourceSelect, targetSelect) {
  if (!sourceSelect || !targetSelect) return;
  const sourceSignature = Array.from(sourceSelect.options)
    .map((option) => `${option.value}:${option.textContent}`)
    .join("|");
  const targetSignature = Array.from(targetSelect.options)
    .map((option) => `${option.value}:${option.textContent}`)
    .join("|");
  if (sourceSignature !== targetSignature) {
    targetSelect.innerHTML = "";
    Array.from(sourceSelect.options).forEach((sourceOption) => {
      const option = document.createElement("option");
      option.value = sourceOption.value;
      option.textContent = sourceOption.textContent;
      targetSelect.append(option);
    });
  }
  targetSelect.value = sourceSelect.value;
}

function formatFloatingConnectionStatus() {
  const target = [state.activeHost, state.activePort].filter(Boolean).join(":");
  const stateConfig = connectionStates[state.connectionState] ?? connectionStates.idle;

  if (state.reconnectTimer || state.connectionState === "reconnecting") {
    const attemptText = `${state.reconnectAttempts}/${maxReconnectAttempts}`;
    if (state.connecting) {
      return `连接：正在重连${target ? ` ${target}` : ""}（${attemptText}）`;
    }
    const remainingSeconds = state.reconnectDueAt
      ? Math.max(0, Math.ceil((state.reconnectDueAt - Date.now()) / 1000))
      : 0;
    const reason = String(state.reconnectReason || "").replace(/\s+/g, " ").trim();
    const reasonText = reason ? ` · ${reason.length > 18 ? `${reason.slice(0, 17)}...` : reason}` : "";
    return remainingSeconds > 0
      ? `连接：${remainingSeconds} 秒后重连（${attemptText}）${reasonText}`
      : `连接：准备重连（${attemptText}）${reasonText}`;
  }

  if (state.connecting) {
    return `连接：${stateConfig.label}${target ? ` ${target}` : ""}`;
  }

  if (state.connected) {
    return `连接：已连接${target ? ` ${target}` : ""}`;
  }

  if (state.connectionState === "failed" || state.connectionState === "disconnected") {
    return `连接：${stateConfig.label}`;
  }

  return "连接：未连接";
}

function formatFloatingInputModeStatus() {
  if (!state.connected) return "输入：未连接";
  if (state.monitorMode) return "输入：只监看，不发送输入";
  if (state.controlDirection === "mac_to_windows") return "输入：当前由 Mac 控制";
  const modeText = getInputModeStatusText(state.hostDiagnostics.inputMode) || "等待对端确认";
  return `输入：${modeText}`;
}

function formatFloatingSecurityStatus() {
  if (!state.connected) return "安全：待机";
  if (state.hostDiagnostics.inputAckStatus === "rejected") {
    return "安全：输入被拒绝";
  }
  if (state.hostDiagnostics.inputMode === "inject") {
    return "安全：真实控制";
  }
  if (state.hostDiagnostics.inputMode === "log") {
    return "安全：仅记录";
  }
  const level = getHostDiagnosticsLevel();
  if (level === "warning") return "安全：需注意";
  if (level === "ok") return "安全：正常";
  return "安全：连接中";
}

function formatFloatingVideoCodec(diagnostics = state.hostDiagnostics) {
  const codec = String(diagnostics.videoCodec || "").toLowerCase();
  if (codec === "h264") return "H.264";
  if (codec === "jpeg" || codec === "mjpeg") return codec.toUpperCase();
  if (codec === "mock-svg") return "模拟";
  if (codec) return codec.toUpperCase();
  return diagnostics.capturePipeline ? labelFromMap(diagnostics.capturePipeline, capturePipelineLabels) : "等待视频";
}

function formatFloatingVideoRate() {
  const requested = state.requestedFps || Number(elements.fpsSelect.value) || 0;
  const negotiated = state.negotiatedFps || requested;
  const parts = [];
  if (state.actualVideoFps > 0) {
    parts.push(`实收 ${state.actualVideoFps.toFixed(1)} FPS`);
  } else if (state.connected) {
    parts.push("实收 -- FPS");
  }
  if (negotiated) {
    parts.push(`协商 ${negotiated} Hz`);
  }
  if (requested && negotiated && requested !== negotiated) {
    parts.push(`请求 ${requested} Hz`);
  } else if (!state.connected && requested) {
    parts.push(`请求 ${requested} Hz`);
  }
  const fpsLimitText = formatRemoteFpsLimitText();
  if (fpsLimitText) {
    parts.push(fpsLimitText);
  }
  return parts.join(" / ");
}

function getVideoRateWarning() {
  const actual = Number(state.actualVideoFps) || 0;
  const requested = state.requestedFps || Number(elements.fpsSelect.value) || 0;
  if (!state.connected || !actual || !requested) return "";
  const negotiated = state.negotiatedFps || requested;
  if (negotiated && actual < negotiated * 0.85 && negotiated - actual >= 5) {
    return `低于协商 ${negotiated} Hz`;
  }
  if (!formatRemoteFpsLimitText() && actual < requested * 0.85 && requested - actual >= 5) {
    return `低于请求 ${requested} Hz`;
  }
  return "";
}

function formatFloatingVideoStatus() {
  const diagnostics = state.hostDiagnostics;
  const parts = [formatFloatingVideoCodec(diagnostics), formatFloatingVideoRate()].filter(Boolean);
  const rateWarning = getVideoRateWarning();
  if (rateWarning) {
    parts.push(rateWarning);
  }
  const ageText = formatVideoFrameAge(diagnostics.videoFrameAgeMs, {
    clockSkewed: diagnostics.videoFrameClockSkewed,
  });
  if (ageText) {
    parts.push(diagnostics.videoFrameClockSkewed ? ageText : `到达 ${ageText}`);
  }
  const fallbackReason = diagnostics.streamFallbackReason || diagnostics.h264FallbackReason || "";
  if (fallbackReason) {
    parts.push(`回退 ${fallbackReason}`);
  } else if (diagnostics.videoDecoderStatus === "waiting-keyframe") {
    parts.push("等待关键帧");
  } else if (diagnostics.videoDecoderStatus === "error") {
    parts.push("解码异常");
  }
  return `视频：${parts.join(" · ")}`;
}

function getVideoExportStatus() {
  const videoStatus = formatFloatingVideoStatus().replace(/^视频：/, "").trim();
  return videoStatus || "-";
}

function compactExportStatusText(text, maxLength = 180) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "-";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function getHostDiagnosticsExportStatus() {
  const diagnosticsText = elements.hostDiagnosticsText.textContent.replace(/^诊断：/, "").trim();
  return compactExportStatusText(diagnosticsText);
}

function formatFloatingAudioStatus() {
  const volume = Number(elements.audioVolumeRange.value) || 0;
  if (!elements.audioToggle.checked) {
    return "声音：关闭";
  }
  if (state.audioLastError) {
    const detail = String(state.audioLastError).replace(/\s+/g, " ").slice(0, 24);
    return `声音：播放失败 · ${detail}`;
  }
  const parts = [];
  if (state.audioFrames > 0) {
    parts.push(`接收 ${state.audioFrames} 帧`);
    parts.push(`电平 ${Math.round(state.audioLevel * 100)}%`);
  } else if (state.connected) {
    parts.push("等待音频");
  } else {
    parts.push("已开启");
  }
  parts.push(`${volume}%`);
  if (state.audioPlayedFrames > 0) {
    parts.push(`播放 ${state.audioPlayedFrames}`);
  } else if (state.audioFrames > 0) {
    parts.push("等待播放");
  }
  if (state.audioDroppedFrames > 0) {
    parts.push(`丢 ${state.audioDroppedFrames}`);
  }
  const firstFrameWaitStatus = getAudioFirstFrameWaitStatus();
  if (firstFrameWaitStatus.waiting) {
    parts.unshift(`等待音频首帧 ${firstFrameWaitStatus.ageSeconds}s`);
  } else {
    const stallStatus = getAudioStreamStallStatus();
    if (stallStatus.stalled) {
      parts.unshift(`音频断流 ${stallStatus.ageSeconds}s`);
    }
  }
  return `声音：${parts.join(" · ")}`;
}

function compactFloatingStatusText(text, maxLength = 42) {
  const normalized = String(text || "").replace(/\s+/g, " ").replace(/^剪贴板：/, "").trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function formatFloatingClipboardStatus() {
  if (!elements.clipboardToggle.checked) {
    return "剪贴板：关闭";
  }

  const activeTransfer = state.remoteFileTransfers.values().next().value;
  if (activeTransfer) {
    const fileCount = Number(activeTransfer.fileCount) || (Array.isArray(activeTransfer.files) ? activeTransfer.files.length : 0);
    const countText = fileCount > 0 ? `${fileCount} 个文件` : "远端文件";
    return `剪贴板：接收 ${countText} · ${remoteFileTransferProgressText(activeTransfer)}`;
  }

  if (state.fileTransferActive) {
    const outgoingStatus = state.outgoingFileTransfer
      ? describeOutgoingFileTransferStatus(state.outgoingFileTransfer)
      : "正在发送文件";
    return `剪贴板：${compactFloatingStatusText(outgoingStatus, 56) || "正在发送文件"}`;
  }

  const writeStatus = state.receivedClipboardWriteStatus || {};
  if (writeStatus.text) {
    return `剪贴板：${compactFloatingStatusText(writeStatus.text)}`;
  }

  if (state.receivedClipboardFiles.length > 0) {
    return `剪贴板：已收 ${state.receivedClipboardFiles.length} 个远端文件`;
  }

  if (state.lastOutgoingFileTransfer?.status === "remote-result") {
    return `剪贴板：${compactFloatingStatusText(describeOutgoingFileResultStatus(state.lastOutgoingFileTransfer), 56)}`;
  }

  if (state.lastOutgoingFileTransfer?.status === "failed") {
    return `剪贴板：${compactFloatingStatusText(describeLastOutgoingFileTransferStatus(state.lastOutgoingFileTransfer), 56)}`;
  }

  if (state.localClipboardStatusText) {
    return `剪贴板：${compactFloatingStatusText(state.localClipboardStatusText, 64)}`;
  }

  if (state.lastOutgoingFileTransfer?.status === "sent") {
    return `剪贴板：${compactFloatingStatusText(
      `等待对端确认：${outgoingFileTransferProgressText(state.lastOutgoingFileTransfer)}`,
      56,
    )}`;
  }

  if (state.connected) {
    const textCapability = formatClipboardCapability(
      state.hostDiagnostics.clipboardText,
      state.hostDiagnostics.clipboardTextMode,
    );
    const fileCapability = formatClipboardCapability(
      state.hostDiagnostics.clipboardFile,
      state.hostDiagnostics.clipboardFileMode,
    );
    if (textCapability || fileCapability) {
      return `剪贴板：文字 ${textCapability || "未知"} / 文件 ${fileCapability || "未知"}`;
    }
    return "剪贴板：已开启";
  }

  return "剪贴板：待机";
}

function getClipboardExportStatus() {
  const clipboardStatus = formatFloatingClipboardStatus().replace(/^剪贴板：/, "").trim();
  return clipboardStatus || "-";
}

function isClipboardCapabilityUnavailable(enabled, mode = "") {
  const normalizedEnabled = normalizeOptionalBoolean(enabled);
  if (normalizedEnabled === false) return true;
  const normalizedMode = String(mode || "").trim().toLowerCase();
  return ["disabled", "off", "none", "unsupported", "unavailable"].includes(normalizedMode);
}

function getClipboardCapabilitySuggestionExportStatus() {
  if (!elements.clipboardToggle.checked) {
    return "剪贴板同步已关闭；开启后才能同步文字和文件。";
  }

  const diagnostics = state.hostDiagnostics || {};
  const textUnavailable = isClipboardCapabilityUnavailable(
    diagnostics.clipboardText,
    diagnostics.clipboardTextMode,
  );
  const fileUnavailable = isClipboardCapabilityUnavailable(
    diagnostics.clipboardFile,
    diagnostics.clipboardFileMode,
  );

  if (textUnavailable && fileUnavailable) {
    return "远端文字和文件剪贴板不可用；请检查被控端剪贴板权限、模式和文件剪贴板能力。";
  }
  if (textUnavailable) {
    return "远端文字剪贴板不可用；请检查被控端剪贴板权限或剪贴板模式。";
  }
  if (fileUnavailable) {
    return "远端文件剪贴板不可用；文件/压缩包不能直接复制粘贴，请检查被控端文件剪贴板能力，或暂时使用远端文件托盘/临时目录。";
  }
  return "-";
}

function getOutgoingFileTransferExportStatus() {
  const transfer = state.fileTransferActive && state.outgoingFileTransfer
    ? state.outgoingFileTransfer
    : state.lastOutgoingFileTransfer;
  if (!transfer) return "-";

  let statusText = "";
  if (transfer.status === "failed") {
    statusText = describeLastOutgoingFileTransferStatus(transfer);
  } else if (transfer.status === "remote-result") {
    statusText = describeOutgoingFileResultStatus(transfer);
  } else if (transfer.status === "sent") {
    statusText = `等待对端确认：${outgoingFileTransferProgressText(transfer)}`;
  } else if (state.fileTransferActive || transfer.status === "sending") {
    statusText = describeOutgoingFileTransferStatus(transfer);
  }
  if (!statusText) return "-";

  const fileNames = Array.isArray(transfer.files)
    ? transfer.files
        .map((file) => String(file?.name || "").trim())
        .filter(Boolean)
    : [];
  const fileText = fileNames.length > 0
    ? `；文件 ${fileNames.slice(0, 3).join("、")}${fileNames.length > 3 ? ` 等 ${fileNames.length} 个` : ""}`
    : "";
  return compactExportStatusText(`${statusText}${fileText}`, 220);
}

function getOutgoingFileTransferSuggestionExportStatus() {
  const transfer = state.fileTransferActive && state.outgoingFileTransfer
    ? state.outgoingFileTransfer
    : state.lastOutgoingFileTransfer;
  if (!transfer) return "-";
  if (transfer.status === "remote-result" && transfer.accepted) return "-";

  const reason = String(transfer.reason || transfer.error || "");
  const canRetry = Boolean(transfer.canRetry);
  if (state.fileTransferActive || transfer.status === "sending") {
    return "保持连接并等待本机分块发送完成，暂时不要重复点击发送。";
  }
  if (transfer.status === "sent") {
    return canRetry
      ? "继续等待对端确认；如果长时间无结果，可点击“重新发送”或让对端检查文件剪贴板能力。"
      : "继续等待对端确认；如果长时间无结果，请重新选择文件或让对端检查文件剪贴板能力。";
  }
  if (transfer.status === "remote-result" && !transfer.accepted) {
    if (canRetry) {
      const timeoutText = /确认超时|没有收到结果|超时/.test(reason)
        ? "确认超时后"
        : "对端接收失败后";
      return `点击“重新发送”；${timeoutText}若再次失败，让对端检查文件剪贴板能力、权限或磁盘空间。`;
    }
    return "需要重新选择文件后再发送；同时让对端检查文件剪贴板能力、权限或磁盘空间。";
  }
  if (transfer.status === "failed") {
    return canRetry
      ? "点击“重新发送”；若继续失败，先检查连接状态，再重新发送。"
      : "需要重新选择文件后再发送；如果继续失败，先检查连接状态。";
  }
  return "-";
}

function syncElementTitleFromText(element) {
  if (!element) return;
  const title = String(element.textContent || "").replace(/\s+/g, " ").trim();
  if (title) {
    element.title = title;
  } else {
    element.removeAttribute("title");
  }
}

function syncReadableStatusTitles() {
  [
    elements.metricFps,
    elements.metricBandwidth,
    elements.metricLatency,
    elements.statusText,
    elements.inputText,
    elements.audioText,
    elements.clipboardText,
    elements.remoteStatusText,
    elements.hostDiagnosticsText,
  ].forEach(syncElementTitleFromText);
}

function syncFloatingControlStatus() {
  if (elements.floatingFullscreenHint) {
    elements.floatingFullscreenHint.textContent = state.immersiveFullscreen
      ? "Esc 退出真全屏"
      : state.fullscreen
        ? "Esc 退出全屏"
        : "全屏后 Esc 退出";
  }
  if (elements.floatingConnectionStatus) {
    elements.floatingConnectionStatus.textContent = formatFloatingConnectionStatus();
  }
  if (elements.floatingVideoStatus) {
    elements.floatingVideoStatus.textContent = formatFloatingVideoStatus();
  }
  if (elements.floatingAudioStatus) {
    elements.floatingAudioStatus.textContent = formatFloatingAudioStatus();
  }
  if (elements.floatingClipboardStatus) {
    elements.floatingClipboardStatus.textContent = formatFloatingClipboardStatus();
  }
  if (elements.floatingInputModeStatus) {
    elements.floatingInputModeStatus.textContent = formatFloatingInputModeStatus();
  }
  if (elements.floatingSecurityStatus) {
    elements.floatingSecurityStatus.textContent = formatFloatingSecurityStatus();
  }
  if (elements.floatingShortcutButton) {
    elements.floatingShortcutButton.disabled = !canSendControlInput();
  }
  if (elements.floatingMonitorModeButton) {
    elements.floatingMonitorModeButton.disabled = state.monitorMode;
  }
  if (state.fullscreen && elements.fullscreenHint?.classList.contains("is-visible")) {
    updateFullscreenHintText();
  }
  if (state.monitorMode) {
    updateMonitorModeStatus();
  }
  syncReadableStatusTitles();
}

function clearFullscreenHintTimer() {
  if (state.fullscreenHintTimer) {
    window.clearTimeout(state.fullscreenHintTimer);
    state.fullscreenHintTimer = null;
  }
}

function formatFullscreenHintText() {
  const settings = currentDisplaySettings();
  const quality = elements.qualityPresetSelect.selectedOptions[0]?.textContent || "自定义";
  const input = formatFloatingInputModeStatus();
  const mode = state.immersiveFullscreen ? "真全屏" : "全屏";
  return `Esc 退出${mode} · ${quality} · ${settings.fps} Hz / ${elements.bandwidthSelect.value} Mbps · ${input}`;
}

function updateFullscreenHintText() {
  if (elements.fullscreenHintText) {
    elements.fullscreenHintText.textContent = formatFullscreenHintText();
  }
}

function hideFullscreenHint() {
  clearFullscreenHintTimer();
  if (!elements.fullscreenHint) return;
  elements.fullscreenHint.classList.remove("is-visible");
  window.setTimeout(() => {
    if (!elements.fullscreenHint.classList.contains("is-visible")) {
      elements.fullscreenHint.hidden = true;
    }
  }, 180);
}

function showFullscreenHint({ autoHide = true } = {}) {
  if (!elements.fullscreenHint) return;
  clearFullscreenHintTimer();
  updateFullscreenHintText();
  elements.fullscreenHint.hidden = false;
  elements.fullscreenHint.classList.add("is-visible");
  if (autoHide) {
    state.fullscreenHintTimer = window.setTimeout(hideFullscreenHint, 3800);
  }
}

function fullscreenApiElement() {
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement ||
    null
  );
}

function fullscreenApiTarget() {
  return document.querySelector(".app-shell") || document.documentElement;
}

function requestElementFullscreen(element) {
  const request =
    element?.requestFullscreen ||
    element?.webkitRequestFullscreen ||
    element?.msRequestFullscreen;
  if (!request) {
    return Promise.reject(new Error("当前窗口环境不支持系统真全屏"));
  }
  return Promise.resolve(request.call(element));
}

function exitDocumentFullscreen() {
  const exit =
    document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.msExitFullscreen;
  if (!exit || !fullscreenApiElement()) {
    return Promise.resolve();
  }
  return Promise.resolve(exit.call(document));
}

async function enterImmersiveFullscreen() {
  setFullscreen(true);
  try {
    await requestElementFullscreen(fullscreenApiTarget());
    state.immersiveFullscreen = true;
    syncFloatingControlCenter();
    showFullscreenHint();
    addLog("真全屏", "已进入沉浸式全屏，按 Esc 退出");
  } catch (error) {
    state.immersiveFullscreen = false;
    elements.remoteStatusText.textContent = "当前窗口环境不支持真全屏，已进入普通全屏";
    addLog("真全屏不可用", error?.message || "已使用普通全屏");
    syncFloatingControlCenter();
    showFullscreenHint();
  }
}

function handleNativeFullscreenChange() {
  const active = Boolean(fullscreenApiElement());
  if (active) {
    state.immersiveFullscreen = true;
    if (!state.fullscreen) {
      setFullscreen(true);
    }
  } else if (state.immersiveFullscreen) {
    state.immersiveFullscreen = false;
    if (state.fullscreen) {
      setFullscreen(false);
    } else {
      syncFloatingControlCenter();
    }
  }
}

function syncFloatingControlCenter() {
  cloneSelectOptions(elements.displaySelect, elements.floatingDisplaySelect);
  cloneSelectOptions(elements.resolutionSelect, elements.floatingResolutionSelect);
  cloneSelectOptions(elements.fpsSelect, elements.floatingFpsSelect);
  cloneSelectOptions(elements.bandwidthSelect, elements.floatingBandwidthSelect);
  if (elements.floatingQualitySelect) {
    elements.floatingQualitySelect.value = elements.qualityPresetSelect.value;
  }
  if (elements.floatingScaleSelect) {
    elements.floatingScaleSelect.value = elements.scaleModeSelect.value;
  }
  if (elements.floatingAudioSelect) {
    elements.floatingAudioSelect.value = elements.audioToggle.checked ? "on" : "off";
  }
  if (elements.floatingAudioVolumeRange) {
    elements.floatingAudioVolumeRange.value = elements.audioVolumeRange.value;
  }
  if (elements.floatingAudioVolumeText) {
    elements.floatingAudioVolumeText.textContent = `${elements.audioVolumeRange.value}%`;
  }
  if (elements.floatingControlSummary) {
    const bandwidthText =
      elements.metricBandwidth.textContent || `${elements.bandwidthSelect.value} Mbps`;
    if (state.connected) {
      const codec = String(state.hostDiagnostics.videoCodec || "").toLowerCase();
      const codecText =
        codec === "h264" ? "H.264" : codec === "jpeg" ? "JPEG" : codec ? codec.toUpperCase() : "视频";
      const fpsText =
        state.actualVideoFps > 0
          ? `${state.actualVideoFps.toFixed(1)} FPS`
          : `${state.negotiatedFps || elements.fpsSelect.value} Hz`;
      const fpsLimitText = formatRemoteFpsLimitText();
      const fpsSummary = fpsLimitText ? `${fpsText} / ${fpsLimitText}` : fpsText;
      elements.floatingControlSummary.textContent = `${codecText} · ${fpsSummary} · ${bandwidthText}`;
    } else {
      elements.floatingControlSummary.textContent = `请求 ${elements.fpsSelect.value} Hz · ${bandwidthText}`;
    }
  }
  if (elements.floatingDisconnectButton) {
    elements.floatingDisconnectButton.disabled = !state.connected && !state.connecting && !state.reconnectTimer;
  }
  if (elements.floatingFullscreenButton) {
    elements.floatingFullscreenButton.disabled = state.fullscreen;
  }
  if (elements.floatingImmersiveFullscreenButton) {
    elements.floatingImmersiveFullscreenButton.disabled = state.immersiveFullscreen;
  }
  if (elements.floatingWindowButton) {
    elements.floatingWindowButton.disabled = !state.fullscreen && !state.immersiveFullscreen;
  }
  if (elements.floatingReconnectButton) {
    const reconnectVisible = Boolean(state.reconnectTimer);
    elements.floatingReconnectButton.hidden = !reconnectVisible;
    elements.floatingReconnectButton.disabled = !reconnectVisible || state.connecting;
  }
  syncFloatingControlStatus();
}

function setControlCenterOpen(open) {
  if (!elements.controlCenterPanel || !elements.controlCenterToggle) return;
  elements.controlCenterPanel.hidden = !open;
  elements.controlCenterToggle.classList.toggle("is-open", open);
  elements.controlCenterToggle.setAttribute("aria-expanded", String(open));
  if (open) {
    syncFloatingControlCenter();
  }
}

function dispatchControlEvent(element, eventName = "change") {
  element.dispatchEvent(new Event(eventName, { bubbles: true }));
}

function resetVideoFrameStats() {
  state.videoWaitingSince = 0;
  state.videoLastFrameAt = 0;
  state.videoFrameTimes = [];
  state.videoFrameTimingSamples = [];
  state.actualVideoFps = 0;
  state.lastVideoFrameAgeMs = null;
  state.lastVideoFrameTimestamp = "";
  state.videoFrameClockSkewed = false;
  state.requestedFps = 0;
  state.negotiatedFps = 0;
  resetW14NativeReceiverState();
  resetW8NativeVideoState();
  elements.metricLatency.textContent = "-- ms";
}

function resetH264ReceiveEvidence() {
  state.h264ReceivedFrames = 0;
  state.h264ReceivedKeyFrames = 0;
  state.h264ReceivedDeltaFrames = 0;
  state.h264ReceivedSps = 0;
  state.h264ReceivedPps = 0;
  state.h264ReceivedIdr = 0;
  state.h264LastNalTypes = "";
  state.h264LastKeyFrameId = "";
  state.h264WebDecodeBypassedForNativeSurface = 0;
  state.h264WebDecodeBypassReason = "";
  state.h264WebDecodeBypassLastFrameId = "";
}

function resetVideoDecoder({ resetFallback = false } = {}) {
  if (state.h264Decoder && state.h264Decoder.state !== "closed") {
    try {
      state.h264Decoder.close();
    } catch {
      // Decoder teardown is best-effort during reconnect/disconnect.
    }
  }
  state.h264Decoder = null;
  state.h264DecoderKey = "";
  state.h264DecoderCodec = "";
  state.h264DecoderStatus = "idle";
  state.h264DecoderLastError = "";
  state.h264DecoderLatencyMs = 0;
  state.videoDecoderQueueMs = 0;
  state.videoDroppedStaleFrames = 0;
  state.videoLastDropReason = "";
  state.h264DecoderErrorCount = 0;
  state.h264DecoderWarned = false;
  state.h264DecoderQueue = [];
  state.h264DecoderNeedsKeyFrame = true;
  state.h264SkippedDeltaFrames = 0;
  state.h264KeyFrameWaitStartedAt = 0;
  state.h264KeyFrameRecoveryLastRequestedAt = 0;
  state.h264RecoveryQueueGraceUntil = 0;
  state.h264RecoveryInFlight = false;
  state.h264RecoveryKeyFrameReceivedAt = 0;
  state.h264RecoveryFrameDrawnAt = 0;
  state.h264LiveBacklogRecoveryLastRequestedAt = 0;
  state.h264LiveBacklogRecoveryCount = 0;
  state.h264DecodedFrames = 0;
  state.h264WebDecodeBypassedForNativeSurface = 0;
  state.h264WebDecodeBypassReason = "";
  state.h264WebDecodeBypassLastFrameId = "";
  if (resetFallback) {
    resetH264ReceiveEvidence();
    state.h264FallbackActive = false;
    state.h264FallbackReason = "";
    state.h264FallbackRecoveryDueAt = 0;
    state.h264FallbackRecoveryJpegFrames = 0;
    state.h264FallbackRecoveryRequested = false;
    state.h264FallbackRecoveryCount = 0;
    state.h264FallbackLastReason = "";
    state.h264FallbackRecoveryPausedUntil = 0;
    state.h264FallbackRecoveryPauseCount = 0;
    state.h264FallbackRecoveryTimestamps = [];
  }
}

function recordVideoFrameTime(frame = null) {
  state.videoWaitingSince = 0;
  const now = performance.now();
  state.videoLastFrameAt = now;
  if (!Array.isArray(state.videoFrameTimes)) state.videoFrameTimes = [];
  state.videoFrameTimes.push(now);
  const cutoff = now - 2000;
  while (state.videoFrameTimes.length > 0 && state.videoFrameTimes[0] < cutoff) {
    state.videoFrameTimes.shift();
  }
  recordFrameTimingSample("videoFrameTimingSamples", now, getFrameRemoteMediaTimestampMs(frame), cutoff);

  if (state.videoFrameTimes.length < 2) {
    state.actualVideoFps = 0;
    return 0;
  }

  const first = state.videoFrameTimes[0];
  const last = state.videoFrameTimes[state.videoFrameTimes.length - 1];
  const durationSeconds = Math.max(0.001, (last - first) / 1000);
  state.actualVideoFps = (state.videoFrameTimes.length - 1) / durationSeconds;
  return state.actualVideoFps;
}

function recordAudioFrameTime(frame = null) {
  const now = performance.now();
  state.audioLastFrameAt = now;
  state.audioWaitingSince = 0;
  if (!Array.isArray(state.audioFrameTimes)) state.audioFrameTimes = [];
  state.audioFrameTimes.push(now);
  const cutoff = now - 2000;
  while (state.audioFrameTimes.length > 0 && state.audioFrameTimes[0] < cutoff) {
    state.audioFrameTimes.shift();
  }
  recordFrameTimingSample("audioFrameTimingSamples", now, getFrameRemoteMediaTimestampMs(frame), cutoff);
}

function formatVideoFrameGapStatusText() {
  const { sampleCount, maxGapMs, stutterCount } = getVideoFrameGapStats();
  if (sampleCount < 2) return "";
  const parts = [`最大间隔 ${maxGapMs} ms`];
  if (stutterCount > 0) parts.push(`卡顿 ${stutterCount}`);
  return parts.join(" · ");
}

function formatVideoLocalQueueStatusText() {
  const decoderQueueMetrics = getH264DecoderQueueMetrics();
  const decoderQueueMs = Math.max(
    Number(decoderQueueMetrics.oldestAgeMs) || 0,
    Number(state.videoDecoderQueueMs || state.hostDiagnostics?.videoDecoderQueueMs) || 0,
  );
  const staleDrops = Number(state.videoDroppedStaleFrames || state.hostDiagnostics?.videoDroppedStaleFrames) || 0;
  const fallbackRecoveryCount = Number(state.h264FallbackRecoveryCount || state.hostDiagnostics?.h264FallbackRecoveryCount) || 0;
  const fallbackRecoveryPauseCount =
    Number(state.h264FallbackRecoveryPauseCount || state.hostDiagnostics?.h264FallbackRecoveryPauseCount) || 0;
  const fallbackRecoveryPausedMs = getH264FallbackRecoveryPausedMs();
  const parts = [];
  if (decoderQueueMs > 0) parts.push("本机队列 " + Math.round(decoderQueueMs) + " ms");
  if (staleDrops > 0) parts.push("本地过期丢帧 " + staleDrops);
  if (fallbackRecoveryCount > 0) parts.push("回退恢复 " + fallbackRecoveryCount + " 次");
  if (fallbackRecoveryPauseCount > 0) parts.push("恢复暂停 " + fallbackRecoveryPauseCount + " 次");
  if (fallbackRecoveryPausedMs > 0) parts.push("暂停剩余 " + Math.ceil(fallbackRecoveryPausedMs / 1000) + "s");
  return parts.join(" · ");
}

function formatVideoLiveHealthStatusText(now = performance.now(), {
  firstFrameWaitStatus = null,
  streamStallStatus = null,
} = {}) {
  const frameCount = Number(state.videoFrames) || 0;
  if (frameCount <= 0) return "";
  if (firstFrameWaitStatus?.waiting || streamStallStatus?.stalled) return "";

  const decoderQueueMetrics = getH264DecoderQueueMetrics(now);
  const decoderQueueMs = Math.max(
    Number(decoderQueueMetrics.oldestAgeMs) || 0,
    Number(state.videoDecoderQueueMs || state.hostDiagnostics?.videoDecoderQueueMs) || 0,
  );
  const targetAgeMs = getH264LiveBacklogTargetAgeMs();
  const staleDrops = Number(state.videoDroppedStaleFrames || state.hostDiagnostics?.videoDroppedStaleFrames) || 0;
  const liveBacklogRecoveryCount =
    Number(state.h264LiveBacklogRecoveryCount || state.hostDiagnostics?.h264LiveBacklogRecoveryCount) || 0;
  const dropReason = String(state.videoLastDropReason || state.hostDiagnostics?.videoLastDropReason || "").trim();
  const decoderStatus = String(state.h264DecoderStatus || state.hostDiagnostics?.videoDecoderStatus || "").toLowerCase();
  const needsKeyFrame = Boolean(state.h264DecoderNeedsKeyFrame || state.hostDiagnostics?.h264DecoderNeedsKeyFrame);
  if (needsKeyFrame && decoderStatus && decoderStatus !== "idle") {
    return "视频等关键帧";
  }
  if (
    staleDrops > 0 ||
    decoderQueueMs >= Math.max(h264MaximumQueueAgeMs, targetAgeMs * 2) ||
    /queue-overflow|recovery-keyframe-jump-live/.test(dropReason)
  ) {
    return "视频积压";
  }
  if (
    liveBacklogRecoveryCount > 0 ||
    decoderQueueMs >= targetAgeMs ||
    /live-backlog/.test(dropReason)
  ) {
    return "视频追实时";
  }

  const actual = Number(state.actualVideoFps) || 0;
  const negotiated = Number(state.negotiatedFps || state.requestedFps || elements.fpsSelect.value) || 0;
  const remoteMediaGapStats = getVideoRemoteMediaGapStats();
  const expectedGapMs = negotiated > 0 ? 1000 / negotiated : 0;
  const remoteCadenceLooksHealthy =
    remoteMediaGapStats.sampleCount >= 2 &&
    expectedGapMs > 0 &&
    remoteMediaGapStats.averageGapMs <= expectedGapMs * 1.45;
  if (actual > 0 && negotiated > 0 && actual < negotiated * 0.75) {
    return remoteCadenceLooksHealthy ? "本机绘制偏慢" : "视频低 FPS";
  }

  return "视频实时正常";
}

function updateFpsMetric() {
  const requested = state.requestedFps || Number(elements.fpsSelect.value) || 0;
  const negotiated = state.negotiatedFps || requested;
  const actual = state.actualVideoFps;
  const actualText = actual > 0 ? `${actual.toFixed(1)} FPS` : "-- FPS";
  const parts = [`实收 ${actualText}`, `协商 ${negotiated || "--"} Hz`];
  if (requested && negotiated && requested !== negotiated) {
    parts.push(`请求 ${requested} Hz`);
  }
  const fpsLimitText = formatRemoteFpsLimitText();
  if (fpsLimitText) {
    parts.push(fpsLimitText);
  }
  const liveHealthText = formatVideoLiveHealthStatusText();
  if (liveHealthText) {
    parts.push(liveHealthText);
  }
  const frameGapText = formatVideoFrameGapStatusText();
  if (frameGapText) {
    parts.push(frameGapText);
  }
  const localQueueText = formatVideoLocalQueueStatusText();
  if (localQueueText) {
    parts.push(localQueueText);
  }
  elements.metricFps.textContent = parts.join(" · ");
  syncFloatingControlStatus();
}

function buildAudioSettingsMessage() {
  const settings = currentDisplaySettings();
  return {
    enabled: settings.audio,
    codec: "pcm-f32le",
    sampleRate: 48000,
    channels: 2,
    volume: settings.audioVolume,
    muted: !settings.audio || settings.audioVolume === 0,
  };
}

function resetAudioPlayback() {
  void stopNativeAudioPlayback("reset-audio-playback");
  stopScheduledAudioSources();
  if (state.audioContext) {
    state.audioContext.close().catch(() => {});
  }
  state.audioContext = null;
  state.audioGain = null;
  state.audioNextPlayTime = 0;
  state.audioScheduledSources = [];
  state.audioPlayedFrames = 0;
  state.audioDroppedFrames = 0;
  state.audioLatencyTrimmedFrames = 0;
  state.audioResyncCount = 0;
  state.audioUnderrunCount = 0;
  state.audioStablePrebufferCount = 0;
  state.audioLastUnderrunAt = 0;
  state.audioLastDropReason = "";
  state.audioLastBufferReason = "";
  state.audioVisibilityHiddenAt = 0;
  state.audioVisibilityRecoveryCount = 0;
  state.audioVisibilityRecoveryLastAt = 0;
  state.audioLastError = "";
  state.audioLastFrameAt = 0;
  state.audioWaitingSince = 0;
  state.audioLastStatusUpdateAt = 0;
  state.audioLastRenderedDroppedFrames = 0;
  state.nativeAudioRunning = false;
  state.nativeAudioSampleRate = 0;
  state.nativeAudioChannels = 0;
  state.nativeAudioSnapshot = null;
  syncFloatingControlStatus();
}

function getScheduledAudioSources() {
  if (!Array.isArray(state.audioScheduledSources)) {
    state.audioScheduledSources = [];
  }
  return state.audioScheduledSources;
}

function removeScheduledAudioSource(source) {
  const scheduled = getScheduledAudioSources();
  const index = scheduled.findIndex((entry) => entry.source === source);
  if (index >= 0) scheduled.splice(index, 1);
}

function stopScheduledAudioSource(entry) {
  try {
    entry?.source?.stop?.();
  } catch {
    // Already-ended WebAudio sources throw when stopped again.
  }
  try {
    entry?.source?.disconnect?.();
  } catch {
    // Disconnect can throw after a source has already been detached.
  }
}

function stopScheduledAudioSources() {
  const scheduled = getScheduledAudioSources();
  const entries = scheduled.splice(0, scheduled.length);
  for (const entry of entries) {
    stopScheduledAudioSource(entry);
  }
  return entries.length;
}

function pruneScheduledAudioSources(now) {
  const scheduled = getScheduledAudioSources();
  for (let index = scheduled.length - 1; index >= 0; index -= 1) {
    const entry = scheduled[index];
    const endAt = Number(entry.playAt) + Number(entry.duration || 0);
    if (Number.isFinite(endAt) && endAt <= now) {
      scheduled.splice(index, 1);
    }
  }
}

function trimFutureScheduledAudioSources(now) {
  const scheduled = getScheduledAudioSources();
  let dropped = 0;
  let activeEndAt = Number(now) || 0;
  for (let index = scheduled.length - 1; index >= 0; index -= 1) {
    const entry = scheduled[index];
    const playAt = Number(entry?.playAt);
    const duration = Number(entry?.duration) || 0;
    const endAt = Number.isFinite(playAt) ? playAt + duration : 0;
    if (Number.isFinite(playAt) && playAt > now) {
      scheduled.splice(index, 1);
      stopScheduledAudioSource(entry);
      dropped += 1;
      continue;
    }
    if (Number.isFinite(endAt) && endAt > activeEndAt) {
      activeEndAt = endAt;
    }
  }
  return { dropped, activeEndAt };
}

function dropScheduledAudioSources(now) {
  const scheduled = getScheduledAudioSources();
  let dropped = 0;
  for (let index = scheduled.length - 1; index >= 0; index -= 1) {
    const entry = scheduled[index];
    const playAt = Number(entry?.playAt);
    const duration = Number(entry?.duration) || 0;
    const endAt = Number.isFinite(playAt) ? playAt + duration : 0;
    const stillScheduled = (
      (Number.isFinite(playAt) && playAt > now) ||
      (Number.isFinite(endAt) && endAt > now)
    );
    if (!stillScheduled) continue;
    scheduled.splice(index, 1);
    stopScheduledAudioSource(entry);
    dropped += 1;
  }
  return { dropped, activeEndAt: Number(now) || 0 };
}

function resyncAudioQueue(reason, now, { dropActive = false } = {}) {
  const { dropped, activeEndAt } = dropActive
    ? dropScheduledAudioSources(now)
    : trimFutureScheduledAudioSources(now);
  state.audioDroppedFrames += Math.max(1, dropped);
  state.audioResyncCount = (Number(state.audioResyncCount) || 0) + 1;
  state.audioLastDropReason = reason;
  state.audioLastBufferReason = reason;
  state.audioLastUnderrunAt = 0;
  state.audioNextPlayTime = dropActive
    ? now + audioResyncBufferSeconds
    : Math.max(now + audioResyncBufferSeconds, activeEndAt);
  return dropped;
}

function trimAudioQueueToLowLatencyTarget(reason, now) {
  const { dropped, activeEndAt } = trimFutureScheduledAudioSources(now);
  if (dropped <= 0) return 0;
  state.audioLatencyTrimmedFrames = (Number(state.audioLatencyTrimmedFrames) || 0) + dropped;
  state.audioLastDropReason = reason;
  state.audioLastBufferReason = reason;
  state.audioNextPlayTime = Math.max(now + audioLowLatencyTargetQueuedSeconds, activeEndAt);
  return dropped;
}

function shouldRecoverAudioAfterVisibilityReturn(now, hiddenNow = performance.now()) {
  if (!state.audioContext || !elements.audioToggle.checked || Number(elements.audioVolumeRange.value) <= 0) {
    return false;
  }

  const hiddenAt = Number(state.audioVisibilityHiddenAt) || 0;
  if (hiddenAt <= 0 || hiddenNow - hiddenAt < audioVisibilityRecoveryMinimumHiddenMs) {
    return false;
  }

  const queuedSeconds = Math.max(0, Number(state.audioNextPlayTime) - now);
  return queuedSeconds >= audioVisibilityRecoveryQueuedSeconds || getScheduledAudioSources().length > 1;
}

function recoverAudioAfterVisibilityReturn(reason = "visibility-return-audio-recovery") {
  const now = Number(state.audioContext?.currentTime);
  const hiddenNow = performance.now();
  if (!Number.isFinite(now) || !shouldRecoverAudioAfterVisibilityReturn(now, hiddenNow)) {
    state.audioVisibilityHiddenAt = 0;
    return false;
  }

  if (state.audioContext?.state === "suspended") {
    void state.audioContext.resume().catch(() => {});
  }
  state.audioVisibilityRecoveryCount = (Number(state.audioVisibilityRecoveryCount) || 0) + 1;
  state.audioVisibilityRecoveryLastAt = hiddenNow;
  resyncAudioQueue(reason || "visibility-return-audio-recovery", now, { dropActive: true });
  state.audioVisibilityHiddenAt = 0;
  syncFloatingControlStatus();
  return true;
}

function shouldSnapAudioQueueToLive(now, currentNow = performance.now()) {
  if (!state.audioContext || !elements.audioToggle.checked || Number(elements.audioVolumeRange.value) <= 0) {
    return false;
  }
  const queuedSeconds = Math.max(0, Number(state.audioNextPlayTime) - now);
  if (queuedSeconds < audioVisibilityRecoveryQueuedSeconds) {
    return false;
  }
  const lastVisibilityRecoveryAt = Number(state.audioVisibilityRecoveryLastAt) || 0;
  return lastVisibilityRecoveryAt > 0 &&
    currentNow - lastVisibilityRecoveryAt <= audioVisibilityRecoveryFollowupWindowMs;
}

function shouldUseAudioRecoveryUnderrunBuffer(currentNow = performance.now()) {
  const lastVisibilityRecoveryAt = Number(state.audioVisibilityRecoveryLastAt) || 0;
  if (lastVisibilityRecoveryAt <= 0 || currentNow - lastVisibilityRecoveryAt > audioVisibilityRecoveryFollowupWindowMs) {
    return false;
  }
  const lastReason = String(state.audioLastDropReason || state.audioLastBufferReason || "");
  return lastReason === "queue-overflow-snap-live" || lastReason.includes("visibility-return-audio");
}

function primeAudioPlayback() {
  if (!elements.audioToggle.checked || Number(elements.audioVolumeRange.value) <= 0) {
    return;
  }

  if (canUseDesktopNativeAudioPlayback()) {
    elements.audioText.textContent = `声音：原生播放待音频帧 · ${elements.audioVolumeRange.value}%`;
    syncFloatingControlStatus();
    return;
  }

  void ensureAudioPlayback(48000)
    .then(() => {
      if (state.audioContext?.state === "running") {
        elements.audioText.textContent = `声音：播放已准备 · ${elements.audioVolumeRange.value}%`;
        syncFloatingControlStatus();
      }
    })
    .catch((error) => {
      state.audioLastError = error?.message || String(error);
      addLog("声音播放准备失败", state.audioLastError);
      syncFloatingControlStatus();
    });
}

async function ensureAudioPlayback(sampleRate) {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("当前窗口环境不支持音频播放");
  }

  if (!state.audioContext || state.audioContext.state === "closed") {
    try {
      state.audioContext = new AudioContextConstructor({ sampleRate });
    } catch {
      state.audioContext = new AudioContextConstructor();
    }
    state.audioGain = state.audioContext.createGain();
    state.audioGain.connect(state.audioContext.destination);
    state.audioNextPlayTime = state.audioContext.currentTime + audioInitialBufferSeconds;
  }

  if (state.audioContext.state === "suspended") {
    await state.audioContext.resume();
  }
  if (state.audioGain) {
    state.audioGain.gain.value = Number(elements.audioVolumeRange.value) / 100;
  }
  return state.audioContext;
}

function getAudioPayload(frame) {
  return frame.payload || frame.data || frame.samples || frame.audioData || "";
}

function decodePcmAudioFrame(frame) {
  const payload = getAudioPayload(frame);
  if (!payload) {
    return null;
  }

  const codec = String(frame.codec ?? "").toLowerCase();
  const encoding = String(frame.encoding ?? "").toLowerCase();
  if (!codec.includes("pcm") && !codec.includes("f32") && !codec.includes("s16") && !encoding.includes("pcm")) {
    return null;
  }
  const bytes = base64ToUint8Array(payload);
  const channels = Math.max(1, Math.min(8, Number(frame.channels) || 2));
  const sampleRate = Math.max(8000, Math.min(192000, Number(frame.sampleRate) || 48000));
  const layout = String(frame.layout ?? "interleaved").toLowerCase() === "planar"
    ? "planar"
    : "interleaved";
  let samples;

  if (codec.includes("s16")) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    samples = new Float32Array(Math.floor(bytes.byteLength / 2));
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.max(-1, Math.min(1, view.getInt16(index * 2, true) / 32768));
    }
  } else {
    const alignedLength = bytes.byteLength - (bytes.byteLength % 4);
    samples = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + alignedLength));
  }

  const frameCount = Math.floor(samples.length / channels);
  if (frameCount <= 0) {
    return null;
  }

  return { samples, channels, sampleRate, frameCount, layout };
}

function canUseDesktopNativeAudioPlayback() {
  return Boolean(getTauriInvoke());
}

function updateNativeAudioSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return;
  state.nativeAudioSnapshot = snapshot;
  state.nativeAudioRunning = Boolean(snapshot.running);
  state.nativeAudioSampleRate = Number(snapshot.sampleRate) || state.nativeAudioSampleRate || 0;
  state.nativeAudioChannels = Number(snapshot.channels) || state.nativeAudioChannels || 0;
  const reason = String(snapshot.lastReason || "").trim();
  if (reason) {
    state.audioLastBufferReason = reason;
  }
}

async function stopNativeAudioPlayback(reason = "native-audio-stop") {
  const invoke = getTauriInvoke();
  const wasRunning = Boolean(state.nativeAudioRunning);
  state.nativeAudioRunning = false;
  state.nativeAudioSampleRate = 0;
  state.nativeAudioChannels = 0;
  state.nativeAudioSnapshot = null;
  if (!invoke || !wasRunning) return false;
  try {
    const snapshot = await invoke("stop_w9_native_audio_session");
    updateNativeAudioSnapshot(snapshot);
    state.nativeAudioRunning = false;
    return true;
  } catch (error) {
    state.audioLastError = error?.message || String(error);
    state.audioLastBufferReason = reason;
    addLog("原生声音停止失败", state.audioLastError);
    return false;
  }
}

async function ensureNativeAudioPlayback(decoded) {
  const invoke = getTauriInvoke();
  if (!invoke) return null;

  const sampleRate = Math.max(8000, Math.min(192000, Number(decoded.sampleRate) || 48000));
  const channels = Math.max(1, Math.min(8, Number(decoded.channels) || 2));
  const needsStart =
    !state.nativeAudioRunning ||
    Number(state.nativeAudioSampleRate) !== sampleRate ||
    Number(state.nativeAudioChannels) !== channels;

  if (needsStart) {
    if (state.nativeAudioRunning) {
      await stopNativeAudioPlayback("native-audio-format-change");
    }
    const snapshot = await invoke("start_w9_native_audio_session", {
      request: {
        sampleRate,
        channels,
        targetQueueMs: Math.round(audioLowLatencyTargetQueuedSeconds * 1000),
        maxLiveQueueMs: Math.round(audioResyncBufferSeconds * 1000),
      },
    });
    updateNativeAudioSnapshot(snapshot);
    state.nativeAudioRunning = true;
    state.nativeAudioSampleRate = sampleRate;
    state.nativeAudioChannels = channels;
  }

  return invoke;
}

function makeNativeInterleavedF32Samples(decoded) {
  const volume = Math.max(0, Math.min(1, (Number(elements.audioVolumeRange.value) || 0) / 100));
  const samples = new Float32Array(decoded.frameCount * decoded.channels);
  for (let frameIndex = 0; frameIndex < decoded.frameCount; frameIndex += 1) {
    for (let channel = 0; channel < decoded.channels; channel += 1) {
      const sourceIndex = decoded.layout === "planar"
        ? channel * decoded.frameCount + frameIndex
        : frameIndex * decoded.channels + channel;
      const value = Number(decoded.samples[sourceIndex]) || 0;
      samples[frameIndex * decoded.channels + channel] = Math.max(-1, Math.min(1, value * volume));
    }
  }
  return samples;
}

function encodeF32leBase64(samples) {
  return arrayBufferToBase64(samples.buffer.slice(samples.byteOffset, samples.byteOffset + samples.byteLength));
}

async function playNativePcmAudioFrame(frame, decoded) {
  const invoke = await ensureNativeAudioPlayback(decoded);
  if (!invoke) return false;

  const samples = makeNativeInterleavedF32Samples(decoded);
  const snapshot = await invoke("push_w9_native_pcm_f32_frame", {
    request: {
      dataBase64: encodeF32leBase64(samples),
      sampleRate: decoded.sampleRate,
      channels: decoded.channels,
    },
  });
  updateNativeAudioSnapshot(snapshot);
  state.audioPlayedFrames += 1;
  if (!String(state.audioLastBufferReason || "").trim()) {
    state.audioLastBufferReason = "native-playback-queued";
  }
  return true;
}

async function playPcmAudioFrame(frame) {
  if (!elements.audioToggle.checked || Number(elements.audioVolumeRange.value) <= 0) {
    return false;
  }

  const decoded = decodePcmAudioFrame(frame);
  if (!decoded) {
    return false;
  }

  if (canUseDesktopNativeAudioPlayback()) {
    return playNativePcmAudioFrame(frame, decoded);
  }

  const audioContext = await ensureAudioPlayback(decoded.sampleRate);
  const buffer = audioContext.createBuffer(decoded.channels, decoded.frameCount, decoded.sampleRate);
  for (let channel = 0; channel < decoded.channels; channel += 1) {
    const channelData = buffer.getChannelData(channel);
    for (let index = 0; index < decoded.frameCount; index += 1) {
      const sampleIndex = decoded.layout === "planar"
        ? channel * decoded.frameCount + index
        : index * decoded.channels + channel;
      channelData[index] = decoded.samples[sampleIndex] || 0;
    }
  }

  const now = audioContext.currentTime;
  const currentNow = performance.now();
  pruneScheduledAudioSources(now);
  const queuedSeconds = Math.max(0, state.audioNextPlayTime - now);
  if (queuedSeconds > audioMaximumQueuedSeconds) {
    const snapToLive = shouldSnapAudioQueueToLive(now, currentNow);
    resyncAudioQueue(
      snapToLive ? "queue-overflow-snap-live" : "queue-overflow-trim-future",
      now,
      { dropActive: snapToLive },
    );
  } else if (shouldSnapAudioQueueToLive(now, currentNow)) {
    resyncAudioQueue("queue-overflow-snap-live", now, { dropActive: true });
  } else if (queuedSeconds > audioLowLatencySoftCapSeconds) {
    trimAudioQueueToLowLatencyTarget("queue-latency-trim-future", now);
  }
  if (state.audioNextPlayTime < now + audioMinimumBufferSeconds) {
    const lastUnderrunAt = Number(state.audioLastUnderrunAt);
    const isRepeatedUnderrun =
      Number.isFinite(lastUnderrunAt) &&
      lastUnderrunAt > 0 &&
      now - lastUnderrunAt <= audioAdaptiveUnderrunWindowSeconds;
    state.audioUnderrunCount = (Number(state.audioUnderrunCount) || 0) + 1;
    state.audioLastUnderrunAt = now;
    if (shouldUseAudioRecoveryUnderrunBuffer(currentNow)) {
      state.audioStablePrebufferCount = (Number(state.audioStablePrebufferCount) || 0) + 1;
      state.audioLastBufferReason = "queue-underrun-recovery-prebuffer";
      state.audioNextPlayTime = now + audioRecoveryUnderrunBufferSeconds;
    } else if (isRepeatedUnderrun && (Number(state.audioPlayedFrames) || 0) >= audioStableUnderrunMinimumPlayedFrames) {
      state.audioStablePrebufferCount = (Number(state.audioStablePrebufferCount) || 0) + 1;
      state.audioLastBufferReason = "queue-underrun-stable-prebuffer";
      state.audioNextPlayTime = now + audioStableUnderrunBufferSeconds;
    } else if (isRepeatedUnderrun) {
      state.audioLastBufferReason = "queue-underrun-startup-prebuffer";
      state.audioNextPlayTime = now + audioInitialBufferSeconds;
    } else {
      state.audioLastBufferReason = "queue-underrun-prebuffer";
      state.audioNextPlayTime = now + audioInitialBufferSeconds;
    }
  }

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(state.audioGain);
  const playAt = state.audioNextPlayTime;
  const scheduledEntry = { source, playAt, duration: buffer.duration };
  getScheduledAudioSources().push(scheduledEntry);
  source.onended = () => {
    removeScheduledAudioSource(source);
    try {
      source.disconnect();
    } catch {
      // Ignore disconnect races on ended sources.
    }
  };
  source.start(playAt);
  state.audioNextPlayTime = playAt + buffer.duration;
  state.audioPlayedFrames += 1;
  return true;
}

function shouldRenderAudioStatus({ force = false } = {}) {
  if (force) return true;
  const now = performance.now();
  if (state.audioDroppedFrames !== state.audioLastRenderedDroppedFrames) return true;
  return now - state.audioLastStatusUpdateAt >= audioStatusRenderIntervalMs;
}

function formatAudioArrivalStatusText() {
  const { sampleCount, maxGapMs, stutterCount } = getAudioFrameGapStats();
  if (sampleCount < 2) return "";
  const parts = [`最大间隔 ${maxGapMs} ms`];
  if (stutterCount > 0) parts.push(`音频卡顿 ${stutterCount}`);
  return ` · ${parts.join(" · ")}`;
}

function formatAudioBufferHealthStatusText() {
  const parts = [];
  const resyncCount = Number(state.audioResyncCount) || 0;
  const underrunCount = Number(state.audioUnderrunCount) || 0;
  const stablePrebufferCount = Number(state.audioStablePrebufferCount) || 0;
  const visibilityRecoveryCount = Number(state.audioVisibilityRecoveryCount) || 0;
  const latencyTrimmedCount = Number(state.audioLatencyTrimmedFrames) || 0;
  if (resyncCount > 0) parts.push(`重同步 ${resyncCount}`);
  if (underrunCount > 0) parts.push(`补缓冲 ${underrunCount}`);
  if (stablePrebufferCount > 0) parts.push(`稳缓冲 ${stablePrebufferCount}`);
  if (latencyTrimmedCount > 0) parts.push(`追实时 ${latencyTrimmedCount}`);
  if (visibilityRecoveryCount > 0) parts.push(`可见恢复 ${visibilityRecoveryCount}`);
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

function getVideoFirstFrameWaitStatus(now = performance.now()) {
  const frameCount = Number(state.videoFrames) || 0;
  const waitingSince = Number(state.videoWaitingSince) || 0;
  if (!state.connected || frameCount > 0 || waitingSince <= 0) {
    return { waiting: false, ageMs: 0, ageSeconds: 0 };
  }
  const ageMs = Math.max(0, now - waitingSince);
  if (ageMs < videoFirstFrameWaitThresholdMs) {
    return { waiting: false, ageMs, ageSeconds: 0 };
  }
  return {
    waiting: true,
    ageMs,
    ageSeconds: Math.max(1, Math.round(ageMs / 1000)),
  };
}

function renderVideoFirstFrameWaitStatus(now = performance.now()) {
  const waitStatus = getVideoFirstFrameWaitStatus(now);
  if (!waitStatus.waiting) return false;
  elements.remoteStatusText.textContent = `画面：等待视频首帧 · 已等待 ${waitStatus.ageSeconds}s`;
  syncFloatingControlStatus();
  return true;
}

function getVideoStreamStallStatus(now = performance.now()) {
  const frameCount = Number(state.videoFrames) || 0;
  const lastFrameAt = Number(state.videoLastFrameAt) || 0;
  if (!state.connected || frameCount <= 0 || !Number.isFinite(lastFrameAt) || lastFrameAt <= 0) {
    return { stalled: false, ageMs: 0, ageSeconds: 0, frameCount };
  }
  const ageMs = Math.max(0, now - lastFrameAt);
  if (ageMs < videoStreamStallThresholdMs) {
    return { stalled: false, ageMs, ageSeconds: 0, frameCount };
  }
  return {
    stalled: true,
    ageMs,
    ageSeconds: Math.max(1, Math.round(ageMs / 1000)),
    frameCount,
  };
}

function renderVideoStreamStallStatus(now = performance.now()) {
  if (renderVideoFirstFrameWaitStatus(now)) return true;
  const stallStatus = getVideoStreamStallStatus(now);
  if (!stallStatus.stalled) return false;
  elements.remoteStatusText.textContent = `画面：视频断流 · 最后收到 ${stallStatus.ageSeconds}s 前 · 接收 ${stallStatus.frameCount} 帧`;
  syncFloatingControlStatus();
  return true;
}

function getAudioFirstFrameWaitStatus(now = performance.now()) {
  const frameCount = Number(state.audioFrames) || 0;
  const waitingSince = Number(state.audioWaitingSince) || 0;
  if (!elements.audioToggle.checked || !state.connected || frameCount > 0 || waitingSince <= 0) {
    return { waiting: false, ageMs: 0, ageSeconds: 0 };
  }
  const ageMs = Math.max(0, now - waitingSince);
  if (ageMs < audioFirstFrameWaitThresholdMs) {
    return { waiting: false, ageMs, ageSeconds: 0 };
  }
  return {
    waiting: true,
    ageMs,
    ageSeconds: Math.max(1, Math.round(ageMs / 1000)),
  };
}

function getAudioStreamStallStatus(now = performance.now()) {
  const frameCount = Number(state.audioFrames) || 0;
  const lastFrameAt = Number(state.audioLastFrameAt) || 0;
  if (!elements.audioToggle.checked || frameCount <= 0 || !Number.isFinite(lastFrameAt) || lastFrameAt <= 0) {
    return { stalled: false, ageMs: 0, ageSeconds: 0, frameCount };
  }
  const ageMs = Math.max(0, now - lastFrameAt);
  if (ageMs < audioStreamStallThresholdMs) {
    return { stalled: false, ageMs, ageSeconds: 0, frameCount };
  }
  return {
    stalled: true,
    ageMs,
    ageSeconds: Math.max(1, Math.round(ageMs / 1000)),
    frameCount,
  };
}

function renderAudioStreamStallStatus(now = performance.now()) {
  const firstFrameWaitStatus = getAudioFirstFrameWaitStatus(now);
  if (firstFrameWaitStatus.waiting) {
    const volume = Number(elements.audioVolumeRange.value) || 0;
    elements.audioText.textContent = `声音：等待音频首帧 · 已等待 ${firstFrameWaitStatus.ageSeconds}s · 音量 ${volume}%`;
    state.audioLastStatusUpdateAt = now;
    syncFloatingControlStatus();
    return true;
  }
  const stallStatus = getAudioStreamStallStatus(now);
  if (!stallStatus.stalled) return false;
  const volume = Number(elements.audioVolumeRange.value) || 0;
  const playedCount = Number(state.audioPlayedFrames) || 0;
  const droppedCount = Number(state.audioDroppedFrames) || 0;
  const parts = [
    "音频断流",
    `最后收到 ${stallStatus.ageSeconds}s 前`,
    `音量 ${volume}%`,
    `接收 ${stallStatus.frameCount} 帧`,
  ];
  if (playedCount > 0) parts.push(`播放 ${playedCount}`);
  if (droppedCount > 0) parts.push(`丢 ${droppedCount}`);
  elements.audioText.textContent = `声音：${parts.join(" · ")}${formatAudioBufferHealthStatusText()}${formatAudioArrivalStatusText()}`;
  state.audioLastStatusUpdateAt = now;
  syncFloatingControlStatus();
  return true;
}

function renderAudioStatusFromFrame(frame, options = {}) {
  if (!shouldRenderAudioStatus(options)) return false;
  state.audioLastStatusUpdateAt = performance.now();
  state.audioLastRenderedDroppedFrames = state.audioDroppedFrames;
  const volume = Number(elements.audioVolumeRange.value);
  const levelText = `${Math.round(state.audioLevel * 100)}%`;
  const latencyText = frame.latencyMs ? ` · ${Math.round(frame.latencyMs)} ms` : "";
  const playbackText = state.audioPlayedFrames > 0
    ? ` · 播放 ${state.audioPlayedFrames}`
    : getAudioPayload(frame)
      ? " · 等待播放"
      : "";
  const droppedText = state.audioDroppedFrames > 0 ? ` · 丢 ${state.audioDroppedFrames}` : "";
  const bufferHealthText = formatAudioBufferHealthStatusText();
  const arrivalText = formatAudioArrivalStatusText();
  elements.audioText.textContent = `声音：接收中 · ${levelText} · ${volume}%${latencyText}${playbackText}${droppedText}${bufferHealthText}${arrivalText}`;
  syncFloatingControlStatus();

  if (state.audioFrames === 1 || state.audioFrames % 20 === 0) {
    addLog(
      "声音帧",
      `${frame.codec ?? "mock"} · ${frame.sampleRate ?? 48000} Hz · level ${levelText}${state.audioPlayedFrames ? ` · played ${state.audioPlayedFrames}` : ""}`,
    );
  }
}

function updateAudioStatusFromFrame(frame) {
  state.audioFrames += 1;
  recordAudioFrameTime(frame);
  state.audioLevel = Math.max(0, Math.min(1, Number(frame.level ?? frame.peak ?? 0)));
  renderAudioStatusFromFrame(frame, { force: state.audioFrames === 1 });
}

function handleAudioFrame(frame) {
  updateAudioStatusFromFrame(frame);
  if (!getAudioPayload(frame)) {
    return;
  }

  const droppedBeforePlayback = state.audioDroppedFrames;
  void playPcmAudioFrame(frame)
    .then((played) => {
      if (played || state.audioDroppedFrames !== droppedBeforePlayback) {
        renderAudioStatusFromFrame(frame, { force: state.audioDroppedFrames !== droppedBeforePlayback });
      }
    })
    .catch((error) => {
      state.audioLastError = error?.message || String(error);
      elements.audioText.textContent = `声音：播放失败 · ${state.audioLastError}`;
      syncFloatingControlStatus();
      addLog("声音播放失败", state.audioLastError);
    });
}

function canRetryLastOutgoingFileTransfer() {
  const transfer = state.lastOutgoingFileTransfer || {};
  const failedLocally = transfer.status === "failed";
  const failedRemotely = transfer.status === "remote-result" && transfer.accepted === false;
  return Boolean(
    (failedLocally || failedRemotely) &&
      transfer.canRetry &&
      state.connected &&
      state.client &&
      elements.clipboardToggle.checked &&
      !state.fileTransferActive &&
      (elements.fileClipboardInput.files?.length || 0) > 0,
  );
}

function updateFileClipboardButton() {
  const canRetry = canRetryLastOutgoingFileTransfer();
  elements.fileClipboardButton.disabled =
    !state.connected ||
    !state.client ||
    !elements.clipboardToggle.checked ||
    state.fileTransferActive;
  const label = elements.fileClipboardButton.querySelector("span:not([aria-hidden])");
  if (label) {
    label.textContent = canRetry ? "重新发送" : "发送文件";
  }
  elements.fileClipboardButton.title = canRetry ? "重新发送上次失败的文件" : "选择并发送文件";
}

function makeLogFileName() {
  const stamp = new Date()
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");
  return `lan-dual-control-log-${stamp}.txt`;
}

function getReconnectExportStatus(now = Date.now()) {
  const attemptText = `${state.reconnectAttempts}/${maxReconnectAttempts}`;
  const reason = state.reconnectReason || "-";
  if (state.connectionState === "failed" && state.reconnectAttempts >= maxReconnectAttempts) {
    return {
      status: `自动重连已停止（${attemptText}，需手动重试）`,
      reason,
      next: "-",
      suggestion: getReconnectExhaustedSuggestion(),
    };
  }
  if (state.reconnectTimer && state.reconnectDueAt) {
    const remainingSeconds = Math.max(0, Math.ceil((state.reconnectDueAt - now) / 1000));
    return {
      status: `等待自动重连（${attemptText}，${remainingSeconds} 秒后）`,
      reason,
      next: `${new Date(state.reconnectDueAt).toISOString()}（约 ${remainingSeconds} 秒后）`,
      suggestion: "-",
    };
  }
  if (state.connectionState === "reconnecting" && state.connecting) {
    return {
      status: `正在自动重连（${attemptText}）`,
      reason,
      next: "-",
      suggestion: "-",
    };
  }
  if (state.reconnectAttempts > 0) {
    return {
      status: `未等待（已尝试 ${attemptText}）`,
      reason,
      next: "-",
      suggestion: "-",
    };
  }
  return {
    status: "未等待",
    reason: "-",
    next: "-",
    suggestion: "-",
  };
}

function formatMacAlertWatcherCheckedAt(checkedAt, now = Date.now()) {
  if (!checkedAt) return "未检查";
  const elapsedSeconds = Math.max(0, Math.round((now - checkedAt) / 1000));
  return `${new Date(checkedAt).toISOString()}（约 ${elapsedSeconds} 秒前）`;
}

function formatRelativeAgeMs(ageMs) {
  const age = Number(ageMs);
  if (!Number.isFinite(age) || age < 0) return "";
  if (age < 1000) return "刚刚";
  const seconds = Math.round(age / 1000);
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

function parseIsoAgeMs(value, now = Date.now()) {
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, now - parsed);
}

function parseCompactAgeMs(value) {
  const match = /^(\d+(?:\.\d+)?)(ms|s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)?$/i.exec(
    String(value || "").trim(),
  );
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const unit = String(match[2] || "ms").toLowerCase();
  if (unit === "ms") return amount;
  if (unit === "s" || unit.startsWith("sec") || unit.startsWith("second")) return amount * 1000;
  if (unit === "m" || unit.startsWith("min") || unit.startsWith("minute")) return amount * 60 * 1000;
  if (unit === "h" || unit.startsWith("hr") || unit.startsWith("hour")) return amount * 60 * 60 * 1000;
  return null;
}

function normalizeMacUnattendedToken(token) {
  return String(token || "")
    .trim()
    .replace(/^["'`]+|["'`,.;，。；:：]+$/g, "")
    .toLowerCase();
}

function isEmptyMacUnattendedValue(value) {
  return ["", "none", "ok", "0", "false", "-", "none.", "ok.", "warnings", "blockers"].includes(
    normalizeMacUnattendedToken(value),
  );
}

function extractMacUnattendedValues(text, key) {
  const values = [];
  const pattern = new RegExp(`${key}\\s*[:=]\\s*([^\\s;；，。]+)`, "gi");
  let match;
  while ((match = pattern.exec(String(text || "")))) {
    for (const rawValue of String(match[1] || "").split(",")) {
      const value = normalizeMacUnattendedToken(rawValue);
      if (!isEmptyMacUnattendedValue(value)) {
        values.push(value);
      }
    }
  }
  return [...new Set(values)];
}

function extractWindowsLanRiskValues(text) {
  const values = [];
  const pattern = /\bWindowsLanRisks?\s*=\s*([^\s;；，。]+)/gi;
  let match;
  while ((match = pattern.exec(String(text || "")))) {
    for (const rawValue of String(match[1] || "").split(",")) {
      const value = normalizeMacUnattendedToken(rawValue);
      if (!isEmptyMacUnattendedValue(value)) {
        values.push(value);
      }
    }
  }
  return [...new Set(values)];
}

function extractMacHeartbeatValue(text, key) {
  const pattern = new RegExp(`\\b${escapeRegExp(key)}\\s*=\\s*([^\\s;；，。]+)`, "i");
  const match = pattern.exec(String(text || ""));
  return match ? match[1] : "";
}

function extractMacHeartbeatFreshnessValue(text, key) {
  const pattern = new RegExp(`\\b${escapeRegExp(key)}\\s*=\\s*([^\\s;；，。]+)`, "i");
  const match = pattern.exec(String(text || ""));
  return match ? match[1] : "";
}

function extractMacHeartbeatSegments(text) {
  const source = String(text || "");
  const matches = [...source.matchAll(/\bMacHeartbeat\s*=/gi)];
  return matches.map((match, index) => {
    const next = matches[index + 1];
    return source.slice(match.index, next ? next.index : source.length);
  });
}

function selectLatestMacHeartbeatSegment(text) {
  const segments = extractMacHeartbeatSegments(text);
  if (!segments.length) return "";

  let selected = segments[0];
  let selectedTime = Number.NEGATIVE_INFINITY;
  for (const segment of segments) {
    const checkedTime = Date.parse(extractMacHeartbeatValue(segment, "checkedAt"));
    if (Number.isFinite(checkedTime) && checkedTime >= selectedTime) {
      selected = segment;
      selectedTime = checkedTime;
    }
  }
  return selected;
}

function parseMacHeartbeatFreshnessField(text, now = Date.now()) {
  const source = String(text || "");
  const match = /\bMacHeartbeatFreshness\s*=\s*(fresh|stale)\b([^;\r\n]*)/i.exec(source);
  if (!match) return null;

  const status = String(match[1] || "").toLowerCase();
  const segment = `${match[0]}`;
  const checkedAt = extractMacHeartbeatFreshnessValue(segment, "checkedAt");
  const checkedAgeMs =
    parseCompactAgeMs(extractMacHeartbeatFreshnessValue(segment, "checked")) ?? parseIsoAgeMs(checkedAt, now);
  const codexAgeMs = parseCompactAgeMs(extractMacHeartbeatFreshnessValue(segment, "codex"));
  const boardAgeMs = parseCompactAgeMs(extractMacHeartbeatFreshnessValue(segment, "board"));
  const parts = [];
  if (checkedAgeMs !== null) parts.push(`心跳检查 ${formatRelativeAgeMs(checkedAgeMs)}`);
  if (codexAgeMs !== null) parts.push(`Mac Codex ${formatRelativeAgeMs(codexAgeMs)}`);
  if (boardAgeMs !== null) parts.push(`联络板 ${formatRelativeAgeMs(boardAgeMs)}`);
  const detail = parts.filter(Boolean).join(" / ");
  const stale = status === "stale";

  return {
    present: true,
    checkedAt,
    boardUpdatedAt: "",
    codexUpdatedAt: "",
    checkedAgeMs,
    boardAgeMs,
    codexAgeMs,
    stale,
    summary: stale ? `Mac 心跳摘要过旧${detail ? `（${detail}）` : ""}` : detail,
    detail,
  };
}

function parseMacHeartbeatFreshness(text, now = Date.now()) {
  const source = String(text || "");
  const stableFreshness = parseMacHeartbeatFreshnessField(source, now);
  if (stableFreshness) return stableFreshness;

  if (!/\bMacHeartbeat\s*=/.test(source)) {
    return { present: false, summary: "", detail: "", stale: false };
  }
  const heartbeatSource = selectLatestMacHeartbeatSegment(source) || source;

  const checkedAt = extractMacHeartbeatValue(heartbeatSource, "checkedAt");
  const codexUpdatedAt = extractMacHeartbeatValue(heartbeatSource, "updatedAt");
  const boardUpdatedAt = extractMacHeartbeatValue(heartbeatSource, "boardUpdatedAt");
  const codexAgeRaw = extractMacHeartbeatValue(heartbeatSource, "ageMs");
  const checkedAgeMs = parseIsoAgeMs(checkedAt, now);
  const boardAgeMs = parseIsoAgeMs(boardUpdatedAt, now);
  const rawCodexAgeMs = codexAgeRaw === "" ? NaN : Number(codexAgeRaw);
  const codexAgeMs = Number.isFinite(rawCodexAgeMs)
    ? Math.max(0, rawCodexAgeMs)
    : parseIsoAgeMs(codexUpdatedAt, now);
  const stale = checkedAgeMs !== null && checkedAgeMs >= macHeartbeatFreshnessStaleMs;
  const parts = [];
  if (checkedAgeMs !== null) parts.push(`心跳检查 ${formatRelativeAgeMs(checkedAgeMs)}`);
  if (codexAgeMs !== null) parts.push(`Mac Codex ${formatRelativeAgeMs(codexAgeMs)}`);
  if (boardAgeMs !== null) parts.push(`联络板 ${formatRelativeAgeMs(boardAgeMs)}`);
  const detail = parts.filter(Boolean).join(" / ");

  return {
    present: true,
    checkedAt,
    boardUpdatedAt,
    codexUpdatedAt,
    checkedAgeMs,
    boardAgeMs,
    codexAgeMs,
    stale,
    summary: stale ? `Mac 心跳摘要过旧${detail ? `（${detail}）` : ""}` : detail,
    detail,
  };
}

function labelMacUnattendedRisk(value) {
  const token = normalizeMacUnattendedToken(value);
  if (!token) return "";
  if (macUnattendedRiskLabels[token]) return macUnattendedRiskLabels[token];
  if (token.includes("launch-agent")) return "自启动需检查";
  if (token.includes("power")) return "电源设置需检查";
  if (token.includes("sleep")) return "睡眠策略需检查";
  if (token.includes("host")) return "Mac host 需检查";
  if (token.includes("permission")) return "权限需检查";
  return token.replace(/[-_]+/g, " ");
}

function splitMacStatusSegments(text) {
  return String(text || "")
    .split(/[;\r\n]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function isCleanMacStatusEvidenceSegment(segment) {
  return (
    !/\b(?:failed|blocked|cancelled|timeout|timed out|stale|unreachable|offline|partial)\b|失败|阻塞|离线|不可达|未通过|不通过/i.test(segment) &&
    !/\bready(?:ToCall)?\s*=\s*false\b/i.test(segment) &&
    !/\bstatus\s*=\s*(?:warning|blocked|failed)\b/i.test(segment) &&
    !/\bwarnings?\s*[:=]\s*(?!none\b)[^;\s]+/i.test(segment) &&
    !/\bblockers?\s*[:=]\s*(?!none\b)[^;\s]+/i.test(segment)
  );
}

function hasMacPositiveEvidenceSegment(text, keywordPattern, successPattern) {
  return splitMacStatusSegments(text).some((segment) =>
    keywordPattern.test(segment) &&
    !/\bnode\s+scripts[\\/]+mac[\\/]+|\bscripts[\\/]+mac[\\/]+|\.mjs\b/i.test(segment) &&
    successPattern.test(segment) &&
    isCleanMacStatusEvidenceSegment(segment),
  );
}

function labelMacPositiveEvidenceValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const compact = text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  if (/macheartbeat(?:ok|healthy|normal)|mac心跳正常|心跳正常/.test(compact)) return "Mac 心跳正常";
  if (/machostmedia(?:ok|passed|ready)|macmediabaseline(?:ok|passed)|媒体基线(?:已)?(?:通过|正常)/.test(compact)) return "Mac 媒体基线已通过";
  if (/macformallocalsmoke(?:ok|passed|ready)|本机短验收(?:已)?通过/.test(compact)) return "Mac 本机短验收已通过";
  if (/macformale2e(?:ok|passed|ready|readytocall|checklistpassed)|formale2e(?:ok|passed|ready)|formale2e已就绪|正式e2e已就绪/.test(compact)) {
    return "Mac formal E2E 已就绪";
  }
  if (/macclientpage(?:online|ok|ready)|clientpage(?:online|ok|ready)|macclient页面在线|控制页在线|页面在线/.test(compact)) {
    return "Mac client 页面在线";
  }
  if (/macclientdiagnostics(?:ok|passed|ready)|macclientreadiness(?:ok|passed|ready)|clientdiagnostics(?:ok|passed|ready)|clientreadiness(?:ok|passed|ready)|macclient诊断(?:已)?通过|诊断(?:已)?通过/.test(compact)) {
    return "Mac client 诊断已通过";
  }
  return "";
}

function parseMacEvidenceFieldLabels(text) {
  const labels = [];
  for (const segment of splitMacStatusSegments(text)) {
    if (
      !/\b(?:MacEvidence|Evidence)\s*[:=]/i.test(segment) ||
      /\bnode\s+scripts[\\/]+mac[\\/]+|\bscripts[\\/]+mac[\\/]+|\.mjs\b/i.test(segment) ||
      !isCleanMacStatusEvidenceSegment(segment)
    ) {
      continue;
    }
    for (const match of segment.matchAll(/\b(?:MacEvidence|Evidence)\s*[:=]\s*([^;]+)/gi)) {
      const rawValues = String(match[1] || "")
        .replace(/\b(?:warnings?|blockers?|reason|suggestedAction|actionCommands)\s*[:=][\s\S]*$/i, "")
        .split(/[,|/]+|\s{2,}/)
        .map((value) => value.trim())
        .filter(Boolean);
      for (const value of rawValues) {
        const label = labelMacPositiveEvidenceValue(value);
        if (label) labels.push(label);
      }
    }
  }
  return [...new Set(labels)];
}

function parseStandaloneMacEvidenceLabels(text) {
  const labels = [];
  for (const segment of splitMacStatusSegments(text)) {
    if (
      /\b(?:MacEvidence|Evidence)\s*[:=]/i.test(segment) ||
      /\bnode\s+scripts[\\/]+mac[\\/]+|\bscripts[\\/]+mac[\\/]+|\.mjs\b/i.test(segment) ||
      !isCleanMacStatusEvidenceSegment(segment)
    ) {
      continue;
    }
    for (const match of segment.matchAll(/\b(MacHeartbeatOk|MacHostMediaOk|MacFormalLocalSmokeOk|MacFormalE2EOk|MacClientPageOnline|MacClientDiagnosticsOk)\b/gi)) {
      const label = labelMacPositiveEvidenceValue(match[1]);
      if (label) labels.push(label);
    }
  }
  return [...new Set(labels)];
}
const manualUxChecklistLabels = {
  connection: "连接",
  video: "画面",
  audio: "声音",
  clipboard: "剪贴板",
  file: "文件",
  window: "窗口",
  fullscreen: "全屏",
  original: "原画",
  "copy-diagnostics": "复制诊断",
};

function parsePostPassManualUxEvidenceLabels(text) {
  const source = String(text || "");
  const hasPostPassNext = /\bPostPassNext\s*=\s*WindowsRecordPassAndTailError\+MacManualUxStandby\b/i.test(source);
  const checklistMatch = /\bManualUxChecklist\s*=\s*([^;\r\n]+)/i.exec(source);
  if (!hasPostPassNext && !checklistMatch) return [];
  const checklist = String(checklistMatch?.[1] || "")
    .split(/[,|/\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => manualUxChecklistLabels[item] || "")
    .filter(Boolean);
  const suffix = checklist.length ? `：${[...new Set(checklist)].join("/")}` : "";
  return [`已进入手工体验清单${suffix}`];
}

function parseMacRemoteAudioPlanEvidenceLabels(text) {
  const source = String(text || "");
  const hasRemoteAudioPlan =
    /\bMacRemoteAudioPlan\s*=\s*(?:node\s+)?(?:scripts[\\/]+mac[\\/]+)?plan-mac-remote-audio\.mjs\b/i.test(source) ||
    /\bMac remote audio plan\b/i.test(source) ||
    /\bRemoteOnlyOptions\s*=/i.test(source);
  if (!hasRemoteAudioPlan) return [];
  const labels = ["Mac 远端独占声音方案已提供"];
  if (/\bcapture\s*=\s*system-pcm-does-not-mute-local\b|does-not-mute-local|does not mute local|不会自动静音/i.test(source)) {
    labels.push("当前不会自动静音 Mac 本机");
  }
  if (/\brecommended\s*=\s*product-toggle-with-explicit-consent\b|\bConsent\s*=\s*explicit-before-change\b|explicit-consent|明确同意/i.test(source)) {
    labels.push("远端独占声音需用户明确同意");
  }
  if (/\bRestorePath\s*=\s*required-before-apply\b|restoreChecklist|恢复复查路径|恢复路径/i.test(source)) {
    labels.push("恢复路径需先确认");
  }
  if (/\bsafety\s*=\s*[^;\r\n]*\bno-volume-change\b|\bno-volume-change\b|no volume change|不自动改系统音量/i.test(source)) {
    labels.push("不自动改系统音量");
  }
  return [...new Set(labels)];
}
function extractMacRemoteAudioStatusRisks(text) {
  const source = String(text || "");
  if (!/\b(?:MacRemoteAudioStatus|MacRemoteAudio)\s*[:=]|\bMac remote audio status\b/i.test(source)) return [];
  const statusSource = source.replace(/\bMacRemoteAudioPlan\s*=\s*[^;\r\n]*/gi, "");
  if (!/\b(?:status|reason|capture|localOutput|remoteOnly|blockers|Next|Safety)\s*=/i.test(statusSource)) return [];
  if (/\b(?:password|passwd|pwd|token|secret)\s*[:=]\s*\S+/i.test(statusSource)) return [];
  if (/(?:^|\s)--(?:password|token|secret|passwd|pwd)\s+\S+/i.test(statusSource)) return [];

  const risks = [];
  if (/\bstatus\s*=\s*local-playback-active\b|\breason\s*=\s*local-output-audible\b|\blocalOutput\s*=\s*audible\b|\bblockers?\s*=\s*[^;\r\n]*\blocal-output-audible\b/i.test(statusSource)) {
    risks.push("mac-remote-audio-local-output");
  }
  if (/\bremoteOnly\s*=\s*not-active\b|\bstatus\s*=\s*local-playback-active\b/i.test(statusSource)) {
    risks.push("mac-remote-audio-not-active");
  }
  if (/\bNext\s*=\s*ask-user-consent-before-mute-or-route\b|explicit-consent|明确同意/i.test(statusSource)) {
    risks.push("mac-remote-audio-user-consent");
  }
  if (/\bSafety\s*=\s*[^;\r\n]*\b(?:read-only|no-volume-change)\b|\b(?:read-only|no-volume-change)\b/i.test(statusSource)) {
    risks.push("mac-remote-audio-read-only");
  }
  return [...new Set(risks)];
}

function extractUserPresenceRisks(text) {
  const source = String(text || "");
  if (!/\bUserPresence(?:Action)?\s*=/i.test(source) && !/\bBLOCKED_BY_USER_AWAY\b/i.test(source)) return [];
  if (/\b(?:password|passwd|pwd|token|secret)\s*[:=]\s*\S+/i.test(source)) return [];
  if (/(?:^|\s)--(?:password|token|secret|passwd|pwd)\s+\S+/i.test(source)) return [];

  const risks = [];
  if (/\bUserPresence\s*=\s*(?:away|sleeping|asleep|user-away|user_sleeping|用户不在|不在|休息|睡觉)\b/i.test(source)) {
    risks.push("user-presence-away");
  }
  if (/\bUserPresenceAction\s*=\s*no-auth-only\b|\bBLOCKED_BY_USER_AWAY\b/i.test(source)) {
    risks.push("user-presence-no-auth-only");
  }
  return [...new Set(risks)];
}
function isSafeAgentLinkPresenceSegment(segment) {
  return (
    !/\b(?:password|passwd|pwd|token|secret|cookie)\s*[:=]\s*\S+/i.test(segment) &&
    !/(?:^|\s)--(?:password|token|secret|passwd|pwd)\s+\S+/i.test(segment)
  );
}

function extractAgentLinkPresenceRisks(text) {
  const risks = [];
  for (const segment of splitMacStatusSegments(text)) {
    if (!isSafeAgentLinkPresenceSegment(segment)) continue;
    const endpoint404 =
      /(?:\bpresence\s+(?:endpoint|api)\b|\bpresence\s*接口|\/api\/presence)[^;\r\n。]*(?:\b404\b|not\s+found|unavailable|未启用|不可用)/i.test(segment) ||
      /(?:\b404\b|not\s+found|unavailable|未启用|不可用)[^;\r\n。]*(?:\bpresence\s+(?:endpoint|api)\b|\bpresence\s*接口|\/api\/presence)/i.test(segment);
    if (endpoint404) risks.push("agent-link-presence-endpoint-unavailable");
  }
  return [...new Set(risks)];
}

function parseAgentLinkPresenceEvidenceLabels(text) {
  const labels = [];
  for (const segment of splitMacStatusSegments(text)) {
    if (!isSafeAgentLinkPresenceSegment(segment)) continue;
    if (/\bstate\.userPresence\b/i.test(segment) && /(?:仍以|以|current|authority|authoritative|为准|source\s+of\s+truth)/i.test(segment)) {
      labels.push("仍以 state.userPresence 为准");
    }
  }
  return [...new Set(labels)];
}

function parseMacInputSafetyPlanEvidenceLabels(text) {
  const source = String(text || "");
  const hasInputSafetyPlan =
    /\bMacInputSafetyPlan\s*=\s*(?:node\s+)?(?:scripts[\\/]+mac[\\/]+)?plan-mac-input-safety\.mjs\b/i.test(source) ||
    /\bMac input safety plan\b/i.test(source) ||
    /\brealInput\s*=\s*blocked-until-user-watching\b/i.test(source);
  if (!hasInputSafetyPlan) return [];
  const labels = ["Mac 真实输入安全方案已提供"];
  if (/\bdefault\s*=\s*log\b|Default mode:\s*log|default input mode[^;\r\n]*log|默认.*安全日志/i.test(source)) {
    labels.push("默认输入模式保持安全日志");
  }
  if (/\brealInput\s*=\s*blocked-until-user-watching\b|blocked until the user confirms|requires-user-watching|正在看 Mac 屏幕/i.test(source)) {
    labels.push("真实输入需用户正在看 Mac 屏幕");
  }
  if (/--confirmUserWatching\b/i.test(source)) {
    labels.push("真实输入需 --confirmUserWatching");
  }
  if (/\beventSet\s*=\s*safe\b|recommended first event set:\s*safe|recommendedEventSet[^;\r\n]*safe/i.test(source)) {
    labels.push("先用 safe 输入事件集");
  }
  if (/\bsafety\s*=\s*[^;\r\n]*(?:no-input-events|no-inject)\b|no input events|no inject|noInputEventsSent|noInjectExecuted/i.test(source)) {
    labels.push("不发送输入事件或执行注入");
  }
  return [...new Set(labels)];
}

function parseMacHostAuthPathEvidenceLabels(text) {
  const source = String(text || "");
  const match = /\bMacHostAuthPath\s*=\s*([^;\r\n]+)/i.exec(source);
  if (!match || !/\bprompt-password-required\b/i.test(match[1])) return [];
  const labels = [
    "Mac host 需要前台输入连接密码",
    "Windows 控制页密码框填写同一个临时密码",
    "不要把密码发到通讯板",
  ];
  if (/launch-agent-ephemeral-password|\bmode\s*=\s*ephemeral\b|ephemeral/i.test(match[1])) {
    labels.push("当前 Mac host 是一次性密码模式");
  }
  if (/MacMaxFpsSafeStart|MacHostStop->MacMaxFpsSafeStart|--maxScreenFps\s+60|60\s*Hz/i.test(source)) {
    labels.push("先在 Mac 前台同密重启 60Hz host");
  } else if (/MacHostSafeStart|MacHostStop->MacHostSafeStart/i.test(source)) {
    labels.push("先在 Mac 前台同密重启 host");
  }
  if (/\bsafety\s*=\s*[^;\r\n]*no-password\b|\bno-password\b|不要.*密码.*通讯板/i.test(source)) {
    labels.push("不要把密码发到通讯板");
  }
  return [...new Set(labels)];
}

function parseMacClientPasswordLocationEvidenceLabels(text) {
  const source = String(text || "");
  const match = /\bMacClientPasswordLocation\s*=\s*([^;\r\n]+)/i.exec(source);
  if (!match) return [];
  const value = match[1];
  if (
    !/Mac client 页面连接 Windows 时/.test(value) ||
    !/Windows 当前临时密码/.test(value) ||
    !/页面“连接密码”框/.test(value) ||
    !/终端隐藏输入只用于脚本/.test(value) ||
    !/不要把密码发通讯板/.test(value)
  ) {
    return [];
  }
  if (/\b(?:LAN_DUAL_PASSWORD|password|passwd|pwd|token|secret)\s*[:=]\s*\S+/i.test(value)) return [];
  if (/(?:^|\s)--(?:password|token|secret|passwd|pwd)\s+\S+/i.test(value)) return [];
  if (/\b(?:input_event|input_events|inject)\b/i.test(value) || /自动发送/.test(value)) return [];
  return [
    "Mac client 密码输入位置已提示",
    "Mac client 页面密码框填写 Windows 临时密码",
    "终端隐藏输入只用于 formal/browser runner",
    "不要把密码发到通讯板",
  ];
}
function splitMacHeartbeatHealthReasonValues(segment) {
  const reason = extractMacHeartbeatFreshnessValue(segment, "reason");
  if (!reason) return [];
  return reason
    .split(/[,|/]+/)
    .map((value) => normalizeMacUnattendedToken(value))
    .filter((value) => !isEmptyMacUnattendedValue(value));
}

function extractMacHeartbeatHealthRisks(text) {
  const risks = [];
  for (const segment of splitMacStatusSegments(text)) {
    const match = /\bMacHeartbeatHealth\s*=\s*(ok|healthy|normal|warning|blocked|failed|stale|unknown)\b/i.exec(segment);
    if (!match || /\bnode\s+scripts[\\/]+mac[\\/]+|\bscripts[\\/]+mac[\\/]+|\.mjs\b/i.test(segment)) {
      continue;
    }
    const status = normalizeMacUnattendedToken(match[1]);
    if (status === "ok" || status === "healthy" || status === "normal") {
      continue;
    }
    const reasonRisks = splitMacHeartbeatHealthReasonValues(segment);
    risks.push(...reasonRisks);
    if (status === "warning") risks.push("mac-heartbeat-health-warning");
    if (status === "blocked" || status === "failed") risks.push("mac-heartbeat-health-blocked");
    if (status === "stale") risks.push("mac-heartbeat-stale");
    if (status === "unknown") risks.push("mac-heartbeat-health-unknown");
  }
  return risks.filter((risk) => !isEmptyMacUnattendedValue(risk));
}

function hasCleanMacHeartbeatHealthEvidence(text) {
  return splitMacStatusSegments(text).some(
    (segment) =>
      /\bMacHeartbeatHealth\s*=\s*(?:ok|healthy|normal)\b/i.test(segment) &&
      !/\bnode\s+scripts[\\/]+mac[\\/]+|\bscripts[\\/]+mac[\\/]+|\.mjs\b/i.test(segment) &&
      isCleanMacStatusEvidenceSegment(segment),
  );
}

function isCleanLatestMacHeartbeatEvidence(text, now = Date.now()) {
  const segment = selectLatestMacHeartbeatSegment(text);
  if (!segment) return false;
  const freshness = parseMacHeartbeatFreshness(segment, now);
  const riskText = segment.replace(/\bstale metadata only\b/gi, "");
  return (
    freshness.present &&
    freshness.checkedAgeMs !== null &&
    !freshness.stale &&
    /\bMacHeartbeat\s*=\s*(?:status\s*=\s*)?ok\b/i.test(segment) &&
    !/\b(?:failed|blocked|cancelled|timeout|timed out|unreachable|offline|partial)\b|失败|阻塞|离线|不可达|未通过|不通过/i.test(riskText) &&
    !/\bstatus\s*=\s*(?:warning|blocked|failed)\b/i.test(riskText) &&
    !/\bwarnings?\s*[:=]\s*(?!none\b)[^;\s]+/i.test(segment) &&
    !/\bblockers?\s*[:=]\s*(?!none\b)[^;\s]+/i.test(segment)
  );
}

function isSafeMacScriptHelpStatusSegment(segment) {
  return (
    !/\b(?:password|passwd|pwd|token|secret|cookie)\s*[:=]\s*\S+/i.test(segment) &&
    !/(?:^|\s)--(?:password|token|secret|passwd|pwd)\s+\S+/i.test(segment) &&
    !/\bnode\s+scripts[\\/]+mac[\\/]+|\bscripts[\\/]+mac[\\/]+|\.mjs\b/i.test(segment)
  );
}

function extractMacScriptHelpStatusRisks(text) {
  const risks = [];
  for (const segment of splitMacStatusSegments(text)) {
    const match = /\bMacScriptHelpStatus\s*=\s*(ok|failed)\b/i.exec(segment);
    if (!match || !isSafeMacScriptHelpStatusSegment(segment)) continue;
    const status = normalizeMacUnattendedToken(match[1]);
    const failedCount = /\bfailures\s*=\s*(?!0\b)\d+/i.test(segment);
    if (status === "failed" || failedCount) {
      risks.push("mac-script-help-failed");
    }
  }
  return [...new Set(risks)];
}

function hasCleanMacScriptHelpStatusEvidence(text) {
  return splitMacStatusSegments(text).some((segment) => {
    const match = /\bMacScriptHelpStatus\s*=\s*(ok|failed)\b/i.exec(segment);
    if (!match || !isSafeMacScriptHelpStatusSegment(segment)) return false;
    if (normalizeMacUnattendedToken(match[1]) !== "ok") return false;
    return !/\bfailures\s*=\s*(?!0\b)\d+/i.test(segment);
  });
}
function parseMacPositiveEvidenceLabels(text) {
  const source = String(text || "");
  const labels = [];
  if (hasCleanMacHeartbeatHealthEvidence(source) || isCleanLatestMacHeartbeatEvidence(source)) {
    labels.push("Mac 心跳正常");
  }
  if (
    hasMacPositiveEvidenceSegment(
      source,
      /\bMacHostMedia\b/i,
      /\bmedia\s*=\s*ok\b|\bpassed\s*=\s*[1-9]\d*\s*\/\s*[1-9]\d*\b|通过/i,
    )
  ) {
    labels.push("Mac 媒体基线已通过");
  }
  if (
    hasMacPositiveEvidenceSegment(
      source,
      /\bMacFormalLocalSmoke\b/i,
      /通过|\bpassed\s*[:=]\s*(?:true|ok|[1-9]\d*\s*\/\s*[1-9]\d*)\b|\bstatus\s*=\s*ok\b|\bH\.?264\s+\d+[\s\S]*\bPCM\s+\d+[\s\S]*\binput[- ]log\s+\d+\s*\/\s*\d+\s+ack\b/i,
    )
  ) {
    labels.push("Mac 本机短验收已通过");
  }
  if (
    hasMacPositiveEvidenceSegment(
      source,
      /\bMacFormalE2E\b/i,
      /\bready(?:ToCall)?\s*=\s*true\b|\bchecklist\s*=\s*(?:passed|ok)\b|\bstatus\s*=\s*ok\b|通过/i,
    )
  ) {
    labels.push("Mac formal E2E 已就绪");
  }
  if (
    hasMacPositiveEvidenceSegment(
      source,
      /\bMacClientPage\b/i,
      /\bstatus\s*=\s*(?:online|ok|ready)\b|\bonline\b|\bready\s*=\s*true\b|通过/i,
    )
  ) {
    labels.push("Mac client 页面在线");
  }
  if (
    hasMacPositiveEvidenceSegment(
      source,
      /\bMacClientDiagnostics\b/i,
      /\bstatus\s*=\s*ok\b|\bprobeClientServer\s*=\s*ok\b|\bpage\s*=\s*online\b|通过/i,
    )
  ) {
    labels.push("Mac client 诊断已通过");
  }
  if (hasCleanMacScriptHelpStatusEvidence(source)) {
    labels.push("Mac 脚本 help 自检已通过");
  }
  labels.push(...parseMacEvidenceFieldLabels(source));
  labels.push(...parseStandaloneMacEvidenceLabels(source));
  labels.push(...parsePostPassManualUxEvidenceLabels(source));
  labels.push(...parseMacRemoteAudioPlanEvidenceLabels(source));
  labels.push(...parseMacInputSafetyPlanEvidenceLabels(source));
  labels.push(...parseMacHostAuthPathEvidenceLabels(source));
  labels.push(...parseMacClientPasswordLocationEvidenceLabels(source));
  labels.push(...parseAgentLinkPresenceEvidenceLabels(source));
  return [...new Set(labels)];
}

function parseMacUnattendedAttention(text) {
  const source = String(text || "");
  const warnings = extractMacUnattendedValues(source, "warnings");
  const blockers = extractMacUnattendedValues(source, "blockers");
  const windowsLanRisks = extractWindowsLanRiskValues(source);
  const heartbeatHealthRisks = extractMacHeartbeatHealthRisks(source);
  const remoteAudioStatusRisks = extractMacRemoteAudioStatusRisks(source);
  const userPresenceRisks = extractUserPresenceRisks(source);
  const agentLinkPresenceRisks = extractAgentLinkPresenceRisks(source);
  const macScriptHelpStatusRisks = extractMacScriptHelpStatusRisks(source);
  const risks = [...new Set([...userPresenceRisks, ...agentLinkPresenceRisks, ...macScriptHelpStatusRisks, ...blockers, ...warnings, ...windowsLanRisks, ...heartbeatHealthRisks, ...remoteAudioStatusRisks])];
  const heartbeatFreshness = parseMacHeartbeatFreshness(source);
  const evidenceLabels = parseMacPositiveEvidenceLabels(source);
  const lower = source.toLowerCase();
  const hasMacHostStop = /\bMacHostStop\s*=/i.test(source);
  const hasMacHostReadinessCommand =
    /\bMacHostReadiness\s*=\s*node\s+scripts[\\/]+mac[\\/]+check-mac-host-readiness\.mjs\b/i.test(source);
  const hasMacHostMediaCommand =
    /\bMacHostMedia\s*=\s*(?:node\s+)?(?:scripts[\\/]+mac[\\/]+)?check-mac-host-readiness\.mjs\b/i.test(source);
  const hasMacHostSafeStart = /\bMacHostSafeStart\s*=/i.test(source);
  const hasMacMaxFpsSafeStart = /\bMacMaxFpsSafeStart\s*=/i.test(source);
  const hasMacLaunchAgentPlan =
    /\bMacLaunchAgentPlan\s*=\s*(?:node\s+)?(?:scripts[\\/]+mac[\\/]+)?install-mac-host-launch-agent\.mjs\b/i.test(source);
  const hasMacLaunchAgentLoad = /\bMacLaunchAgentLoad\s*=\s*launchctl\s+bootstrap\b/i.test(source);
  const hasMacLaunchAgentPrint = /\bMacLaunchAgentPrint\s*=\s*launchctl\s+print\b/i.test(source);
  const hasMacClientPageCommand =
    /\bMacClientPage\s*=\s*(?:node\s+)?(?:scripts[\\/]+mac[\\/]+)?start-mac-client\.mjs\b/i.test(source);
  const hasMacClientDiagnosticsCommand =
    /\bMacClientDiagnostics\s*=\s*(?:node\s+)?(?:scripts[\\/]+mac[\\/]+)?check-mac-client-readiness\.mjs\b/i.test(source);
  const hasMacClientDiscoverWindows = /\bMacClientDiscoverWindows\s*=/i.test(source);
  const hasMacClientFormalChecklist = /\bMacClientFormalChecklist\s*=/i.test(source);
  const hasMacClientPromptPasswordSmoke = /\bMacClientPromptPasswordSmoke\s*=/i.test(source);
  const hasMacClientBrowserSelfTest = /\bMacClientBrowserSelfTest\s*=/i.test(source);
  const hasMacScriptHelp =
    /\bMacScriptHelp\s*=\s*(?:node\s+scripts[\\/]+mac[\\/]+)?test-mac-script-help\.mjs\b/i.test(source);
  const hasMacFormalE2e = /\bMacFormalE2E\s*=/i.test(source);
  const hasMacHeartbeatRerun = /\bMacHeartbeatRerun\s*=/i.test(source);
  const hasMacHeartbeatOnce = /\bMacHeartbeatOnce\s*=/i.test(source);
  const hasMacHeartbeatWatch = /\bMacHeartbeatWatch\s*=/i.test(source);
  const hasMacHeartbeatStart = /\bMacHeartbeatStart\s*=/i.test(source);
  const hasMacHeartbeatStatus = /\bMacHeartbeatStatus\s*=/i.test(source);
  const hasMacHeartbeatStop = /\bMacHeartbeatStop\s*=/i.test(source);
  const hasMacUnattendedStatusCommand =
    /\bMacUnattended(?:Status)?\s*=\s*node\s+scripts[\\/]+mac[\\/]+check-mac-unattended-status\.mjs\b/i.test(source);
  const hasMacUnattendedFormalCommand =
    /\bMacUnattendedFormal\s*=\s*node\s+scripts[\\/]+mac[\\/]+check-mac-unattended-status\.mjs\b/i.test(source);
  const hasMacPowerPlanCommand =
    /\bMacPowerPlan\s*=\s*(?:node\s+)?(?:scripts[\\/]+mac[\\/]+)?plan-mac-power-settings\.mjs\b/i.test(source);
  const hasMacPowerApplyCommand =
    /\bMacPowerApply\s*=\s*(?:node\s+)?(?:scripts[\\/]+mac[\\/]+)?apply-mac-power-settings\.mjs\b/i.test(source);
  const hasMacFormalLocalSmoke = /\b(MacFormalLocalSmoke|check-mac-formal-local-smoke)\b/i.test(source);
  const hasRerunFormalLocalSmoke = /\bRerunFormalLocalSmoke\s*=/i.test(source);
  const hasWindowsReverseGrantStatus = /\bWindowsReverseGrantStatus(NodeFallback)?\s*=/i.test(source);
  const hasWindowsOpenOneTimeReverseGrant = /\bWindowsOpenOneTimeReverseGrant(NodeFallback)?\s*=/i.test(source);
  const hasWindowsSecureAuthPath = /\b(?:WindowsSecureAuthPath|SecureAuthPath)\s*=/i.test(source);
  const hasWindowsFirewallStatus = /\bWindowsFirewallStatus\s*=/i.test(source);
  const hasWindowsFirewallPreview = /\bWindowsFirewallPreview\s*=/i.test(source);
  const hasWindowsClientPortsOccupied = /\bWinClientPorts\s*=\s*occupied\(/i.test(source);
  const hasWindowsClientPortsStaleDiagnostics = /\bstale-diagnostics\b/i.test(source);
  const hasWindowsClientDiagnosticsAlt = /\bWinClientDiagnosticsAlt\s*=/i.test(source);
  const hasWindowsClientPortsNext = /\bWinClientPortsNext\s*=\s*(?!none\b)[^;]+/i.test(source);
  const hasWindowsClientPortsOwners = /\bWinClientPortsOwners\s*=\s*(?!none\b|-)[^;\s]+/i.test(source);
  const hasMacMaxFpsFinding = risks.some((risk) =>
    risk === "fps-limit" ||
    risk === "mac-host-max-fps" ||
    risk === "launch-agent-max-fps",
  );
  const hasMacClientFormalFinding = risks.some((risk) =>
    risk === "windows-host" ||
    risk === "video" ||
    risk === "build" ||
    risk === "auth" ||
    risk === "repo" ||
    risk === "board",
  );
  const hasMacClientDiscoverPromptContext =
    /\bWindows host discovery:\s*found\s*[1-9]\d*\b/i.test(source) ||
    /\bWindows host discovery:[^;]*\bbest\s*=\s*(?!none\b|not[- ]found\b)[^.;]+/i.test(source) ||
    /\bMacClientDiscoverWindows\b[^;]*(found\s*[1-9]\d*|best\s*=|selected\s*=|ready\s*=\s*true)/i.test(source) ||
    /\bdiscover-windows-hosts\.mjs\b[^;]*(found\s*[1-9]\d*|best\s*=|selected\s*=|ready\s*=\s*true)/i.test(source);
  const hasMacFormalE2eFinding =
    hasMacFormalE2e &&
    (
      risks.length > 0 ||
      /readytocall\s*=\s*false|ready\s*=\s*false|blocked|failed/.test(lower)
    );
  const hasWindowsReverseGrantContext =
    risks.some((risk) => risk === "windows-host" || risk === "auth" || risk === "board") ||
    /\bLAN008\b|reverse_control_|ready\s*=\s*false|blocked|failed|pending-request|临时允许|重试|请求反控|等待\s*Windows/i.test(source);
  const hasWindowsSecureAuthContext =
    risks.some((risk) => risk === "windows-host" || risk === "auth" || risk === "password" || risk === "board") ||
    /\b(auth|password|promptPassword|LAN_DUAL_PASSWORD|true\s*browser|browser\s*smoke|formal\s*smoke|smoke|exit\s*=\s*1|ready\s*=\s*false|blocked|failed)\b|认证|密码|现场|等待\s*Windows|随机运行期密码/i.test(source);
  const hasWindowsFirewallContext =
    windowsLanRisks.length > 0 ||
    risks.some((risk) =>
      [
        "windows-lan-risk",
        "no-firewall-allow",
        "public-profile",
        "lan-probe-blocked",
        "tcp-unreachable",
        "bind-address",
        "firewall-query-failed",
        "windows-host",
      ].includes(risk),
    ) ||
    /\bWindowsLanRisks?|firewall|public-profile|no-firewall-allow|lan-probe-blocked|tcp-unreachable|防火墙|端口不可达/i.test(source);
  if (lower.includes("ready=false") && risks.length === 0) {
    risks.push("not-ready");
  }
  if (heartbeatFreshness.stale) {
    risks.unshift("mac-heartbeat-summary-stale");
  }
  const macHeartbeatRiskSource = source.replace(/\bstale metadata only\b/gi, "");
  if (/\b(MacHeartbeat|heartbeat)\b.*\b(stale|missing|expired|timeout|timed out|lost|failed|unreachable)\b/i.test(macHeartbeatRiskSource)) {
    risks.unshift("mac-heartbeat-stale");
  }
  if (/\b(MacWatchdog|watchdog)\b.*\b(stale|missing|expired|timeout|timed out|lost|failed|unreachable)\b/i.test(source)) {
    risks.unshift("mac-watchdog-stale");
  }
  if (
    /\b(Mac host|MacHost|mac-host|\/discovery)\b.*\b(unreachable|offline|econnrefused|etimedout|timeout|timed out|failed|bad gateway)\b/i.test(source) ||
    /\b(unreachable|offline|econnrefused|etimedout|timeout|timed out|failed|bad gateway)\b.*\b(Mac host|MacHost|mac-host|\/discovery)\b/i.test(source)
  ) {
    risks.unshift(lower.includes("offline") || lower.includes("离线") ? "host-offline" : "host-unreachable");
  }
  if (/\b(HTTP\s*)?502\b|Bad Gateway|Gateway Timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|network timeout|request timeout|API error/i.test(source)) {
    risks.unshift("mac-api-error");
  }
  const hasCodexReconnectStuck =
    /codex-reconnect-stuck/i.test(source) ||
    /正在重新连接\s*5\/5/i.test(source);
  const hasCodexStreamDisconnected = /stream disconnected before completion/i.test(source);
  const hasCodexBackendRequestError =
    /error sending request.*backend-api\/codex\/responses/i.test(source) ||
    /backend-api\/codex\/responses.*error sending request/i.test(source);
  if (hasCodexBackendRequestError) {
    risks.unshift("codex-backend-request-error");
  }
  if (hasCodexStreamDisconnected) {
    risks.unshift("codex-stream-disconnected");
  }
  if (/codex-reconnect-signal/i.test(source)) {
    risks.unshift("codex-reconnect-signal");
  }
  if (hasCodexReconnectStuck) {
    risks.unshift("codex-reconnect-stuck");
  }
  if (/mac-codex-stale/i.test(source)) {
    risks.unshift("mac-codex-stale");
  }
  if (hasCodexReconnectStuck || hasCodexStreamDisconnected || hasCodexBackendRequestError) {
    risks.push("codex-manual-retry");
  }
  const genericStuckRiskSource = source
    .replace(/\brealInput\s*=\s*blocked-until-user-watching\b/gi, "")
    .replace(/\bReal input:\s*blocked until the user confirms[^.;\r\n]*/gi, "")
    .replace(/\bblocked until the user confirms[^.;\r\n]*/gi, "");
  if (/\b(stuck|blocked|hung)\b|卡住|阻塞/.test(genericStuckRiskSource) && !/\bblockers\s*[:=]\s*none\b/i.test(source)) {
    risks.unshift("mac-codex-stuck");
  }
  if (/attention\s*=\s*(warning|blocker|failed)/i.test(source) && risks.length === 0) {
    risks.push("attention");
  }
  const hasMacUnattendedCommandContext =
    risks.length > 0 ||
    /attention\s*=\s*(warning|blocker|failed)|ready\s*=\s*false|restart recommended|hostRuntimeChanges|runtimeBuild|mac-host-build-stale|launch-agent|max-fps|fps-limit|power-risk|sleep-risk|stale build|build.*stale|运行.*旧|重启/i.test(source);
  if (hasMacUnattendedStatusCommand && hasMacUnattendedCommandContext) {
    risks.unshift("mac-unattended-status-command");
  }
  if (hasMacUnattendedFormalCommand && hasMacUnattendedCommandContext) {
    risks.unshift("mac-unattended-formal-command");
  }
  const hasMacPowerPlanCommandContext = risks.some((risk) =>
    /^(?:power|sleep|system-sleep-enabled|display-sleep-enabled|network-wake-disabled)\b/i.test(risk),
  );
  if (hasMacPowerPlanCommand && hasMacPowerPlanCommandContext) {
    risks.unshift("mac-power-plan-command");
  }
  if (hasMacPowerApplyCommand && hasMacPowerPlanCommandContext) {
    risks.unshift("mac-power-apply-command");
  }
  const hasMacLaunchAgentCommandContext =
    risks.length > 0 ||
    /attention\s*=\s*(warning|blocker|failed)|ready\s*=\s*false|restart recommended|hostRuntimeChanges|runtimeBuild|mac-host-build-stale|launch-agent-(missing|not-loaded|failed|disabled|max-fps|max-screen-fps)|max-fps|fps-limit|loaded\s*=\s*false|not[- ]loaded|未\s*loaded|未加载|stale build|build.*stale|运行.*旧|重启/i.test(source);
  if (hasMacLaunchAgentPlan && hasMacLaunchAgentCommandContext) {
    risks.unshift("mac-launch-agent-plan-command");
  }
  if (hasMacLaunchAgentLoad && hasMacLaunchAgentCommandContext) {
    risks.unshift("mac-launch-agent-load-command");
  }
  if (hasMacLaunchAgentPrint && hasMacLaunchAgentCommandContext) {
    risks.unshift("mac-launch-agent-print-command");
  }
  if (
    hasMacHostStop &&
    (
      risks.some((risk) => risk === "mac-host-build-stale" || risk === "mac-host-build" || risk === "build" || risk === "stale-build") ||
      /mac-host-build-stale|restart recommended|hostRuntimeChanges|runtimeBuild|stale build|build.*stale|运行.*旧|重启/.test(source)
    )
  ) {
    risks.unshift("mac-host-stop-command");
  }
  const hasMacHostReadinessCommandContext =
    risks.length > 0 ||
    /attention\s*=\s*(warning|blocker|failed)|ready\s*=\s*false|host-(offline|unreachable)|offline|unreachable|econnrefused|restart recommended|hostRuntimeChanges|runtimeBuild|mac-host-build-stale|mac-host-(discovery|max-fps|max-screen-fps)|fps-limit|launch-agent|max-fps|stale build|build.*stale|运行.*旧|重启/i.test(source);
  if (hasMacHostReadinessCommand && hasMacHostReadinessCommandContext) {
    risks.unshift("mac-host-readiness-command");
  }
  const hasMacHostMediaCommandContext =
    risks.length > 0 ||
    hasMacFormalE2eFinding ||
    /\b(MacHeartbeat|MacResumeStatus|MacUnattendedStatus|MacUnattendedFormal|MacHostReadiness|MacFormalE2E|MacFormalLocalSmoke)\b[^;]*(status\s*=\s*(warning|blocked|failed)|attention\s*=\s*(warning|blocker|failed)|ready(ToCall)?\s*=\s*false|blocked|failed|stale|restart recommended|hostRuntimeChanges|mac-host-build-stale|h264-fallback|fps-limit|mac-host-media-aggregate|video|audio|pcm)/i.test(source);
  if (hasMacHostMediaCommand && hasMacHostMediaCommandContext) {
    risks.unshift("mac-host-media-command");
  }
  if (
    hasMacHostSafeStart &&
    (risks.length > 0 || /host-(offline|unreachable)|ready\s*=\s*false|offline|离线/.test(lower))
  ) {
    risks.unshift("mac-host-safe-start");
  }
  if (
    hasMacMaxFpsSafeStart &&
    (hasMacMaxFpsFinding || /fps-limit|mac-host-max-fps|launch-agent-max-fps/.test(lower))
  ) {
    risks.unshift("mac-max-fps-safe-start");
  }
  if (windowsLanRisks.length > 0) {
    risks.unshift("windows-lan-risk");
  }
  const hasMacClientCommandFinding =
    risks.some((risk) =>
      [
        "client-page",
        "local-server",
        "windows-host",
        "auth",
        "board",
        "video",
        "build",
        "repo",
      ].includes(risk),
    ) ||
    /\b(MacClientPage|MacClientDiagnostics|Mac client page|Mac client readiness|start-mac-client|check-mac-client-readiness)\b[^;]*(status\s*=\s*(warning|blocked|failed)|ready\s*=\s*false|offline|unreachable|failed|blockers\s*[:=]\s*(?!none\b)[^;\s]+|warnings\s*[:=]\s*(?!none\b)[^;\s]+)/i.test(source);
  if (hasMacClientPageCommand && hasMacClientCommandFinding) {
    risks.unshift("mac-client-page-command");
  }
  if (hasMacClientDiagnosticsCommand && hasMacClientCommandFinding) {
    risks.unshift("mac-client-diagnostics-command");
  }
  if (
    hasMacClientDiscoverWindows &&
    (
      windowsLanRisks.length > 0 ||
      risks.some((risk) => risk === "windows-host" || risk === "board") ||
      /ready\s*=\s*false|blocked|failed|not-found|not found|windows host.*(missing|offline|unreachable)|发现不到\s*Windows/i.test(lower)
    )
  ) {
    risks.unshift("mac-client-discover-windows");
  }
  if (
    hasMacClientFormalChecklist &&
    (hasMacClientFormalFinding || /ready\s*=\s*false|blocked|failed/.test(lower))
  ) {
    risks.unshift("mac-client-formal-checklist");
  }
  if (
    hasMacClientPromptPasswordSmoke &&
    (
      hasMacClientFormalFinding ||
      hasMacClientDiscoverPromptContext ||
      /ready\s*=\s*false|blocked|failed|\bauth\b|windowssecureauthpath|lan008|认证|密码/.test(lower)
    )
  ) {
    risks.unshift("mac-client-prompt-password-smoke");
  }
  if (
    hasMacClientBrowserSelfTest &&
    (
      risks.length > 0 ||
      hasMacClientFormalFinding ||
      hasMacFormalE2eFinding ||
      /ready\s*=\s*false|blocked|failed/.test(lower)
    )
  ) {
    risks.unshift("mac-client-browser-self-test");
  }
  if (
    hasMacScriptHelp &&
    (
      risks.length > 0 ||
      hasMacFormalE2eFinding ||
      /attention\s*=\s*(warning|blocker|failed)|readytocall\s*=\s*false|ready\s*=\s*false|blocked|failed|stale|restart recommended/.test(lower)
    )
  ) {
    risks.unshift("mac-script-help-command");
  }
  const hasMacHeartbeatCommandContext =
    risks.length > 0 ||
    heartbeatFreshness.stale ||
    /status\s*=\s*(warning|blocked|failed)|ready\s*=\s*false|blocked|failed|stale|watchdog|codex-reconnect|mac-codex|reason\s*=\s*(mac-codex-stale|codex-reconnect-signal|codex-reconnect-stuck)|warnings\s*[:=]\s*(?!none\b)[^;\s]+|blockers\s*[:=]\s*(?!none\b)[^;\s]+|restart recommended|mac-host-build-stale|hostRuntimeChanges|stream disconnected before completion|error sending request|正在重新连接\s*5\/5/i.test(source);
  if (
    hasMacHeartbeatRerun &&
    hasMacHeartbeatCommandContext
  ) {
    risks.unshift("mac-heartbeat-rerun-command");
  }
  if (hasMacHeartbeatOnce && hasMacHeartbeatCommandContext) {
    risks.unshift("mac-heartbeat-once-command");
  }
  if (hasMacHeartbeatWatch && hasMacHeartbeatCommandContext) {
    risks.unshift("mac-heartbeat-watch-command");
  }
  if (hasMacHeartbeatStart && hasMacHeartbeatCommandContext) {
    risks.unshift("mac-heartbeat-start-command");
  }
  if (hasMacHeartbeatStatus && hasMacHeartbeatCommandContext) {
    risks.unshift("mac-heartbeat-status-command");
  }
  if (hasMacHeartbeatStop && hasMacHeartbeatCommandContext) {
    risks.unshift("mac-heartbeat-stop-command");
  }
  if (
    hasMacFormalLocalSmoke &&
    (risks.length > 0 || /ready\s*=\s*false|blocked|failed|cancelled|password|auth/.test(lower))
  ) {
    risks.push("mac-formal-local-smoke");
  }
  if (
    hasRerunFormalLocalSmoke &&
    (risks.length > 0 || /ready\s*=\s*false|blocked|failed|cancelled|password|auth/.test(lower))
  ) {
    risks.push("mac-formal-local-smoke-rerun");
  }
  if (hasWindowsReverseGrantStatus && hasWindowsReverseGrantContext) {
    risks.unshift("windows-reverse-grant-status");
  }
  if (hasWindowsOpenOneTimeReverseGrant && hasWindowsReverseGrantContext) {
    risks.unshift("windows-open-one-time-reverse-grant");
  }
  if (hasWindowsSecureAuthPath && hasWindowsSecureAuthContext) {
    risks.unshift("windows-secure-auth-path");
  }
  if (hasWindowsFirewallStatus && hasWindowsFirewallContext) {
    risks.unshift("windows-firewall-status");
  }
  if (hasWindowsFirewallPreview && hasWindowsFirewallContext) {
    risks.unshift("windows-firewall-preview");
  }
  if (hasWindowsClientPortsOccupied) {
    risks.unshift("windows-client-ports-occupied");
  }
  if (
    (hasWindowsClientDiagnosticsAlt || hasWindowsClientPortsNext) &&
    (hasWindowsClientPortsOccupied || hasWindowsClientPortsStaleDiagnostics)
  ) {
    risks.unshift("windows-client-diagnostics-alt");
  }
  if (hasWindowsClientPortsOwners && (hasWindowsClientPortsOccupied || hasWindowsClientPortsStaleDiagnostics)) {
    risks.unshift("windows-client-ports-owners");
  }
  const priority = new Map(
    [
      "mac-client-discover-windows",
      "windows-lan-risk",
      "no-firewall-allow",
      "public-profile",
      "windows-firewall-status",
      "windows-firewall-preview",
      "windows-client-ports-occupied",
      "windows-client-diagnostics-alt",
      "windows-client-ports-owners",
      "mac-host-readiness-command",
      "lan-probe-blocked",
      "tcp-unreachable",
      "bind-address",
      "no-listener",
      "no-lan-ip",
      "firewall-query-failed",
    ].map((risk, index) => [risk, index]),
  );
  const orderedRisks = [...new Set(risks)]
    .map((risk, index) => ({ risk, index }))
    .sort((a, b) => (priority.get(a.risk) ?? 1000) - (priority.get(b.risk) ?? 1000) || a.index - b.index)
    .map(({ risk }) => risk);
  const labels = [
    ...new Set(
      orderedRisks
        .map((risk) =>
          risk === "mac-heartbeat-summary-stale" && heartbeatFreshness.summary
            ? heartbeatFreshness.summary
            : labelMacUnattendedRisk(risk),
        )
        .filter(Boolean),
    ),
  ];
  return {
    warnings,
    blockers,
    labels,
    summary: labels.length ? compactExportStatusText(labels.join(" / "), 1200) : "",
    evidenceLabels,
    evidenceSummary: evidenceLabels.length ? compactExportStatusText(evidenceLabels.join(" / "), 1200) : "",
    heartbeatFreshness,
  };
}

function getMacAlertWatcherExportStatus(now = Date.now()) {
  const available = canUseDesktopHostControl();
  const statusDetail = elements.localMacAlertWatcherStatusText.textContent.trim() || "-";
  const findingDetail = state.localMacAlertWatcherFindingText
    ? sanitizeExportStatusLine(state.localMacAlertWatcherFindingText, 1800)
    : "";
  const detail = findingDetail ? `${statusDetail} | ${findingDetail}` : statusDetail;
  const unattended = parseMacUnattendedAttention(`${statusDetail} ${findingDetail}`);
  let status = "未检查";
  if (!available) {
    status = "需桌面版";
  } else if (state.localMacAlertWatcherBusy) {
    status = state.localMacAlertWatcherRunning ? "处理中（此前提醒中）" : "处理中";
  } else if (state.localMacAlertWatcherStatusCheckedAt) {
    status = state.localMacAlertWatcherRunning ? "提醒中" : "未开启";
  }
  return {
    status,
    detail,
    unattended,
    heartbeatFreshness: unattended.heartbeatFreshness,
    checkedAt: formatMacAlertWatcherCheckedAt(state.localMacAlertWatcherStatusCheckedAt, now),
    pollInterval: `${Math.round(localMacAlertWatcherStatusPollMs / 1000)} 秒`,
    server: buildMacAlertWatcherRequest().server,
  };
}

function isMacHostDevice(device) {
  const platform = String(device?.platform ?? "").toLowerCase();
  const role = String(device?.role ?? "").toLowerCase();
  const name = String(device?.deviceName ?? "").toLowerCase();
  return platform === "macos" || role.includes("mac") || name.includes("mac");
}

function formatMacReachabilityDevice(device) {
  if (!device) return "";
  const target = [device.host, device.port].filter(Boolean).join(":");
  return [device.deviceName, target].filter(Boolean).join(" ");
}

function getMacReachabilityExportStatus({ targetLabel, reconnectExport, macAlertWatcherExport }) {
  const onlineMacDevices = state.discoveredDevices.filter(
    (device) =>
      device &&
      device.status === "online" &&
      (device.transport ?? "websocket") === "websocket" &&
      isMacHostDevice(device),
  );
  const activeHost = String(state.activeHost || elements.hostInput.value || "").trim();
  const activePort = String(state.activePort || elements.portInput.value || "").trim();
  const activeOnlineDevice =
    onlineMacDevices.find(
      (device) => String(device.host ?? "").trim() === activeHost && String(device.port ?? "").trim() === activePort,
    ) || onlineMacDevices[0];
  const targetText = targetLabel && targetLabel !== "-:-" ? targetLabel : [activeHost, activePort].filter(Boolean).join(":");
  const parts = [];

  if (state.connected) {
    parts.push(`当前可远程${targetText ? `（${targetText}）` : ""}`);
  } else if (state.connecting) {
    parts.push(`正在连接${targetText ? `（${targetText}）` : ""}`);
  } else if (state.reconnectTimer || state.connectionState === "reconnecting") {
    parts.push(`恢复中（${reconnectExport.status}）`);
  } else if (activeOnlineDevice) {
    parts.push(`已发现在线 Mac（${formatMacReachabilityDevice(activeOnlineDevice)}）`);
  } else {
    parts.push("未发现在线 Mac");
  }

  if (onlineMacDevices.length > 1) {
    parts.push(`在线 ${onlineMacDevices.length} 台`);
  }
  if (macAlertWatcherExport.status && macAlertWatcherExport.status !== "未检查") {
    parts.push(`提醒 ${macAlertWatcherExport.status}`);
  } else {
    parts.push("提醒未检查");
  }
  const unattendedSummary = macAlertWatcherExport.unattended?.summary || "";
  const evidenceSummary = macAlertWatcherExport.unattended?.evidenceSummary || "";
  if (unattendedSummary) {
    parts.push(`值守风险 ${unattendedSummary}`);
  }
  if (evidenceSummary) {
    parts.push(`值守证据 ${evidenceSummary}`);
  }
  if (!unattendedSummary && !evidenceSummary) {
    parts.push("自启/睡眠状态等待 Mac 上报");
  }
  const heartbeatFreshness =
    macAlertWatcherExport.heartbeatFreshness || macAlertWatcherExport.unattended?.heartbeatFreshness;
  if (heartbeatFreshness?.summary || heartbeatFreshness?.detail) {
    parts.push(`心跳 ${heartbeatFreshness.summary || heartbeatFreshness.detail}`);
  }

  return {
    status: compactExportStatusText(parts.join(" · "), 1600),
    note: unattendedSummary
      ? "Windows 已从 Mac 提醒 watcher 状态里识别到值守 warnings/blockers；详细 LaunchAgent、自启动、电源、锁屏/睡眠可达性仍以 Mac status/readiness 为准。"
      : evidenceSummary
        ? "Windows 已从 Mac 提醒 watcher 状态里识别到 Mac 媒体、本机短验收或认证路径提示；详细 LaunchAgent、自启动、电源、锁屏/睡眠可达性仍以 Mac status/readiness 为准。"
      : "当前仅由 Windows 侧连接、发现、重连和提醒 watcher 推断；LaunchAgent、自启动、锁屏/睡眠可达性需等 Mac status/readiness 上报。",
  };
}

function getSelectExportLabel(selectElement) {
  return selectElement?.selectedOptions?.[0]?.textContent?.trim() || selectElement?.value || "-";
}

function sanitizeExportStatusLine(line, maxLength = 220) {
  return String(line || "")
    .replace(/\b(LAN_DUAL_PASSWORD)\s*=\s*\S+/gi, "$1=<hidden>")
    .replace(/\b(password|passwd|pwd|token|secret)\s*[:=]\s*\S+/gi, "$1=<hidden>")
    .replace(/(--(?:password|token|secret))\s+\S+/gi, "$1 <hidden>")
    .slice(0, maxLength);
}

function getLocalHostOutputSummary() {
  const lines = elements.localHostOutput.textContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return "无";
  return `${lines.length} 行，最近：${sanitizeExportStatusLine(lines[lines.length - 1])}`;
}

function getLocalHostExportStatus() {
  const available = canUseDesktopHostControl();
  let status = "未检查";
  if (!available) {
    status = "需桌面版";
  } else if (state.localHostBusy) {
    status = state.localHostRunning || state.localHostOnline ? "处理中（此前在线）" : "处理中";
  } else if (state.localHostRunning) {
    status = "桌面壳托管运行中";
  } else if (state.localHostOnline) {
    status = "端口已在线";
  } else {
    status = "未在线";
  }
  return {
    status,
    badge: elements.localHostBadge.textContent.trim() || "-",
    detail: elements.localHostStatusText.textContent.trim() || "-",
    port: String(getLocalHostPort()),
    screenMode: getSelectExportLabel(elements.localHostScreenModeSelect),
    audioMode: getSelectExportLabel(elements.localHostAudioModeSelect),
    inputMode: getSelectExportLabel(elements.localHostInputModeSelect),
    reverseControlMode: getSelectExportLabel(elements.localHostReverseControlModeSelect),
    readinessProfile: getSelectExportLabel(elements.localHostReadinessProfileSelect),
    probeMedia: elements.localHostProbeMediaToggle?.checked ? "开启" : "关闭",
    outputSummary: getLocalHostOutputSummary(),
  };
}

function getRemoteFileTransferExportStatus(now = Date.now()) {
  const writeStatus = state.receivedClipboardWriteStatus || {};
  const activeTransfers = Array.from(state.remoteFileTransfers.values()).map((transfer) => {
    const idleMs = now - (Number(transfer.lastActivityAt) || Number(transfer.startedAt) || now);
    const idleSeconds = Math.max(0, Math.round(idleMs / 1000));
    const fileCount = Number(transfer.fileCount) || (Array.isArray(transfer.files) ? transfer.files.length : 0);
    const countText = fileCount > 0 ? `${fileCount} 个文件` : "远端文件";
    return `${countText} ${remoteFileTransferProgressText(transfer)}，约 ${idleSeconds} 秒无新分块`;
  });
  const statusText = String(writeStatus.text || "").trim();
  const kindText = writeStatus.kind ? `${writeStatus.kind} · ` : "";
  const receivedCount = state.receivedClipboardFiles.length;
  return {
    summary: statusText
      ? `${kindText}${statusText}`
      : activeTransfers.length > 0
        ? `正在接收 ${activeTransfers.length} 个传输`
        : receivedCount > 0
          ? `已暂存 ${receivedCount} 个文件`
          : "无远端文件状态",
    status: statusText ? `${kindText}${statusText}` : "无状态提示",
    active: activeTransfers.length ? activeTransfers.join("；") : "无",
    receivedCount,
    tempPath: state.receivedClipboardTempPath || "-",
  };
}

function getRemoteFileTransferSuggestionExportStatus() {
  const writeStatus = state.receivedClipboardWriteStatus || {};
  const kind = String(writeStatus.kind || "").trim();
  const statusText = String(writeStatus.text || "").trim();
  const hasActiveTransfers = state.remoteFileTransfers.size > 0;
  if (kind === "success") return "-";

  if (kind === "busy" || (!statusText && hasActiveTransfers)) {
    return "保持连接并等待远端文件接收完成；若长时间无新分块，请检查连接并让 Mac 重新复制。";
  }
  if (kind !== "warning" || !statusText) return "-";

  if (/系统|剪贴板写入|未写入|临时目录|重试写入/.test(statusText)) {
    return "可重试写入 Windows 系统文件剪贴板；若继续失败，检查文件剪贴板权限，或打开临时目录取文件。";
  }
  return "让 Mac 重新复制；若再次失败，请检查连接和两端文件剪贴板能力。";
}

function getResolutionExportLabel(settings) {
  return settings.resolutionMode === "native" ? "原生" : `${settings.width} × ${settings.height}`;
}

function getAudioExportStatus() {
  const enabled = elements.audioToggle.checked;
  const volume = Number(elements.audioVolumeRange.value) || 0;
  const frameCount = Number(state.audioFrames) || 0;
  const playedCount = Number(state.audioPlayedFrames) || 0;
  const droppedCount = Number(state.audioDroppedFrames) || 0;
  const level = Math.round((Number(state.audioLevel) || 0) * 100);
  const error = state.audioLastError ? String(state.audioLastError).replace(/\s+/g, " ").slice(0, 120) : "";
  let status = "待机";
  if (!enabled) {
    status = "关闭";
  } else if (error) {
    status = "播放失败";
  } else if (frameCount > 0 && playedCount > 0) {
    status = "正在播放";
  } else if (frameCount > 0) {
    status = "已接收，等待播放";
  } else if (state.connected) {
    status = "等待音频";
  }
  const volumeText = `${volume}%${enabled && volume <= 0 ? "（静音）" : ""}`;
  return {
    status,
    volume: volumeText,
    frames: frameCount,
    played: playedCount,
    dropped: droppedCount,
    level: `${level}%`,
    error: error || "-",
    summary: `${status} · 音量 ${volumeText} · 接收 ${frameCount} 帧 · 播放 ${playedCount} · 丢 ${droppedCount}`,
  };
}

function getVideoFrameGapStats() {
  const times = Array.isArray(state.videoFrameTimes)
    ? state.videoFrameTimes.filter((time) => Number.isFinite(Number(time))).map(Number)
    : [];
  if (times.length < 2) {
    return { sampleCount: times.length, averageGapMs: 0, maxGapMs: 0 };
  }

  const gaps = [];
  for (let index = 1; index < times.length; index += 1) {
    const gap = times[index] - times[index - 1];
    if (Number.isFinite(gap) && gap >= 0) gaps.push(gap);
  }
  if (!gaps.length) {
    return { sampleCount: times.length, averageGapMs: 0, maxGapMs: 0 };
  }

  const total = gaps.reduce((sum, gap) => sum + gap, 0);
  const stutterGaps = gaps.filter((gap) => gap >= videoStutterGapThresholdMs);
  return {
    sampleCount: times.length,
    averageGapMs: Math.round(total / gaps.length),
    maxGapMs: Math.round(Math.max(...gaps)),
    stutterCount: stutterGaps.length,
    maxStutterGapMs: stutterGaps.length ? Math.round(Math.max(...stutterGaps)) : 0,
  };
}

function getAudioFrameGapStats() {
  const times = Array.isArray(state.audioFrameTimes)
    ? state.audioFrameTimes.filter((time) => Number.isFinite(Number(time))).map(Number)
    : [];
  if (times.length < 2) {
    return { sampleCount: times.length, averageGapMs: 0, maxGapMs: 0, stutterCount: 0, maxStutterGapMs: 0 };
  }

  const gaps = [];
  for (let index = 1; index < times.length; index += 1) {
    const gap = times[index] - times[index - 1];
    if (Number.isFinite(gap) && gap >= 0) gaps.push(gap);
  }
  if (!gaps.length) {
    return { sampleCount: times.length, averageGapMs: 0, maxGapMs: 0, stutterCount: 0, maxStutterGapMs: 0 };
  }

  const total = gaps.reduce((sum, gap) => sum + gap, 0);
  const stutterGaps = gaps.filter((gap) => gap >= audioStutterGapThresholdMs);
  return {
    sampleCount: times.length,
    averageGapMs: Math.round(total / gaps.length),
    maxGapMs: Math.round(Math.max(...gaps)),
    stutterCount: stutterGaps.length,
    maxStutterGapMs: stutterGaps.length ? Math.round(Math.max(...stutterGaps)) : 0,
  };
}

function getVideoPerformanceExportStatus(now = performance.now()) {
  const requested = Number(state.requestedFps || elements.fpsSelect.value) || 0;
  const negotiated = Number(state.negotiatedFps || requested) || 0;
  const actual = Number(state.actualVideoFps) || 0;
  const frameCount = Number(state.videoFrames) || 0;
  const droppedFrames = Number(state.hostDiagnostics?.droppedFrames) || 0;
  const decoderQueueMetrics = getH264DecoderQueueMetrics();
  const decoderQueue = Math.max(
    Number(decoderQueueMetrics.queueLength) || 0,
    Number(state.hostDiagnostics?.videoDecoderQueue) || 0,
  );
  const decoderQueueMs = Math.max(
    Number(decoderQueueMetrics.oldestAgeMs) || 0,
    Number(state.videoDecoderQueueMs || state.hostDiagnostics?.videoDecoderQueueMs) || 0,
  );
  const decoderLatencyMs = Number(state.h264DecoderLatencyMs || state.hostDiagnostics?.h264DecoderLatencyMs) || 0;
  const liveBacklogRecoveryCount = Number(state.h264LiveBacklogRecoveryCount || state.hostDiagnostics?.h264LiveBacklogRecoveryCount) || 0;
  const staleDrops = Number(state.videoDroppedStaleFrames || state.hostDiagnostics?.videoDroppedStaleFrames) || 0;
  const skippedDeltaFrames = Number(state.h264SkippedDeltaFrames || state.hostDiagnostics?.h264SkippedDeltaFrames) || 0;
  const visibilityRecoveryCount = Number(state.h264VisibilityRecoveryCount || state.hostDiagnostics?.h264VisibilityRecoveryCount) || 0;
  const needsKeyFrame = Boolean(state.h264DecoderNeedsKeyFrame || state.hostDiagnostics?.h264DecoderNeedsKeyFrame);
  const dropReason = String(state.videoLastDropReason || state.hostDiagnostics?.videoLastDropReason || "").trim();
  const fallbackRecoveryCount = Number(state.h264FallbackRecoveryCount || state.hostDiagnostics?.h264FallbackRecoveryCount) || 0;
  const fallbackLastReason = String(state.h264FallbackLastReason || state.hostDiagnostics?.h264FallbackLastReason || "").trim();
  const fallbackRecoveryPauseCount = Number(state.h264FallbackRecoveryPauseCount || state.hostDiagnostics?.h264FallbackRecoveryPauseCount) || 0;
  const fallbackRecoveryPausedMs = getH264FallbackRecoveryPausedMs();
  const decoderStatus = state.hostDiagnostics?.videoDecoderStatus || state.h264DecoderStatus || "";
  const recoveryInFlight = Boolean(state.h264RecoveryInFlight || state.hostDiagnostics?.h264RecoveryInFlight);
  const recoveryKeyFrameReceivedAt = Number(state.h264RecoveryKeyFrameReceivedAt || state.hostDiagnostics?.h264RecoveryKeyFrameReceivedAt) || 0;
  const recoveryFrameDrawnAt = Number(state.h264RecoveryFrameDrawnAt || state.hostDiagnostics?.h264RecoveryFrameDrawnAt) || 0;
  const receivedFrames = Number(state.h264ReceivedFrames || state.hostDiagnostics?.h264ReceivedFrames) || 0;
  const receivedKeyFrames = Number(state.h264ReceivedKeyFrames || state.hostDiagnostics?.h264ReceivedKeyFrames) || 0;
  const receivedSps = Number(state.h264ReceivedSps || state.hostDiagnostics?.h264ReceivedSps) || 0;
  const receivedPps = Number(state.h264ReceivedPps || state.hostDiagnostics?.h264ReceivedPps) || 0;
  const receivedIdr = Number(state.h264ReceivedIdr || state.hostDiagnostics?.h264ReceivedIdr) || 0;
  const lastNalTypes = String(state.h264LastNalTypes || state.hostDiagnostics?.h264LastNalTypes || "").trim();
  const webDecodeBypassCount =
    Number(
      state.h264WebDecodeBypassedForNativeSurface ||
        state.hostDiagnostics?.h264WebDecodeBypassedForNativeSurface,
    ) || 0;
  const nativeFrames = Number(state.w8NativeVideoFramesPushed || state.hostDiagnostics?.w8NativeVideoFramesPushed) || 0;
  const nativeQueueMs = Number(state.hostDiagnostics?.w8NativeVideoQueueMs) || 0;
  const nativeDroppedFrames =
    Number(state.w8NativeVideoDroppedFrames || state.hostDiagnostics?.w8NativeVideoDroppedFrames) || 0;
  const nativeHasDecoderConfig = Boolean(
    state.w8NativeVideoHasDecoderConfig || state.hostDiagnostics?.w8NativeVideoHasDecoderConfig,
  );
  const nativeCodecString = String(
    state.w8NativeVideoCodecString || state.hostDiagnostics?.w8NativeVideoCodecString || "",
  ).trim();
  const nativeNalTypes = String(
    state.w8NativeVideoNativeNalTypes || state.hostDiagnostics?.w8NativeVideoNativeNalTypes || "",
  ).trim();
  const nativeIsKeyframe = Boolean(
    state.w8NativeVideoNativeIsKeyframe || state.hostDiagnostics?.w8NativeVideoNativeIsKeyframe,
  );
  const nativeKeyFrames =
    Number(
      state.w8NativeVideoNativeKeyFrames ||
        state.hostDiagnostics?.w8NativeVideoNativeKeyFrames,
    ) || 0;
  const nativeSpsCount =
    Number(
      state.w8NativeVideoNativeSpsCount ||
        state.hostDiagnostics?.w8NativeVideoNativeSpsCount,
    ) || 0;
  const nativePpsCount =
    Number(
      state.w8NativeVideoNativePpsCount ||
        state.hostDiagnostics?.w8NativeVideoNativePpsCount,
    ) || 0;
  const nativeIdrCount =
    Number(
      state.w8NativeVideoNativeIdrCount ||
        state.hostDiagnostics?.w8NativeVideoNativeIdrCount,
    ) || 0;
  const nativeByteLen =
    Number(
      state.w8NativeVideoNativeByteLen ||
        state.hostDiagnostics?.w8NativeVideoNativeByteLen,
    ) || 0;
  const nativeDecoderReady = Boolean(
    state.w8NativeVideoDecoderReady || state.hostDiagnostics?.w8NativeVideoDecoderReady,
  );
  const nativeDecoderMode = String(
    state.w8NativeVideoDecoderMode || state.hostDiagnostics?.w8NativeVideoDecoderMode || "",
  ).trim();
  const nativeDecoderReason = String(
    state.w8NativeVideoDecoderReason || state.hostDiagnostics?.w8NativeVideoDecoderReason || "",
  ).trim();
  const nativeD3dFeatureLevel = String(
    state.w8NativeVideoD3dFeatureLevel || state.hostDiagnostics?.w8NativeVideoD3dFeatureLevel || "",
  ).trim();
  const nativeDecoderInitReady = Boolean(
    state.w8NativeVideoDecoderInitReady || state.hostDiagnostics?.w8NativeVideoDecoderInitReady,
  );
  const nativeDecoderInitMode = String(
    state.w8NativeVideoDecoderInitMode || state.hostDiagnostics?.w8NativeVideoDecoderInitMode || "",
  ).trim();
  const nativeDecoderInitReason = String(
    state.w8NativeVideoDecoderInitReason || state.hostDiagnostics?.w8NativeVideoDecoderInitReason || "",
  ).trim();
  const nativeDecoderInitOutputSubtypes = String(
    state.w8NativeVideoDecoderInitOutputSubtypes ||
      state.hostDiagnostics?.w8NativeVideoDecoderInitOutputSubtypes ||
      "",
  ).trim();
  const nativeDecodeStepReady = Boolean(
    state.w8NativeVideoDecodeStepReady || state.hostDiagnostics?.w8NativeVideoDecodeStepReady,
  );
  const nativeDecodeStepMode = String(
    state.w8NativeVideoDecodeStepMode || state.hostDiagnostics?.w8NativeVideoDecodeStepMode || "",
  ).trim();
  const nativeDecodeStepReason = String(
    state.w8NativeVideoDecodeStepReason || state.hostDiagnostics?.w8NativeVideoDecodeStepReason || "",
  ).trim();
  const nativeDecodeStepStatus = String(
    state.w8NativeVideoDecodeStepStatus || state.hostDiagnostics?.w8NativeVideoDecodeStepStatus || "",
  ).trim();
  const nativeDecoderSessionActive = Boolean(
    state.w8NativeVideoDecoderSessionActive || state.hostDiagnostics?.w8NativeVideoDecoderSessionActive,
  );
  const nativeDecoderSessionMode = String(
    state.w8NativeVideoDecoderSessionMode || state.hostDiagnostics?.w8NativeVideoDecoderSessionMode || "",
  ).trim();
  const nativeDecoderSessionReason = String(
    state.w8NativeVideoDecoderSessionReason || state.hostDiagnostics?.w8NativeVideoDecoderSessionReason || "",
  ).trim();
  const nativeDecoderSessionStatus = String(
    state.w8NativeVideoDecoderSessionStatus || state.hostDiagnostics?.w8NativeVideoDecoderSessionStatus || "",
  ).trim();
  const nativeDecoderSessionOutputSubtype = String(
    state.w8NativeVideoDecoderSessionOutputSubtype ||
      state.hostDiagnostics?.w8NativeVideoDecoderSessionOutputSubtype ||
      "",
  ).trim();
  const nativeDecoderSessionSubmittedFrames =
    Number(
      state.w8NativeVideoDecoderSessionSubmittedFrames ||
        state.hostDiagnostics?.w8NativeVideoDecoderSessionSubmittedFrames,
    ) || 0;
  const nativeDecoderSessionAcceptedInputFrames =
    Number(
      state.w8NativeVideoDecoderSessionAcceptedInputFrames ||
        state.hostDiagnostics?.w8NativeVideoDecoderSessionAcceptedInputFrames,
    ) || 0;
  const nativeDecoderSessionDecodedFrames =
    Number(
      state.w8NativeVideoDecoderSessionDecodedFrames ||
        state.hostDiagnostics?.w8NativeVideoDecoderSessionDecodedFrames,
    ) || 0;
  const nativeProcessInputAttempts =
    Number(
      state.w8NativeVideoProcessInputAttempts ||
        state.hostDiagnostics?.w8NativeVideoProcessInputAttempts,
    ) || 0;
  const nativeProcessInputAcceptedFrames =
    Number(
      state.w8NativeVideoProcessInputAcceptedFrames ||
        state.hostDiagnostics?.w8NativeVideoProcessInputAcceptedFrames,
    ) || 0;
  const nativeProcessInputFailures =
    Number(
      state.w8NativeVideoProcessInputFailures ||
        state.hostDiagnostics?.w8NativeVideoProcessInputFailures,
    ) || 0;
  const nativeLastProcessInputStatus = String(
    state.w8NativeVideoLastProcessInputStatus ||
      state.hostDiagnostics?.w8NativeVideoLastProcessInputStatus ||
      "",
  ).trim();
  const nativeProcessOutputAttempts =
    Number(
      state.w8NativeVideoProcessOutputAttempts ||
        state.hostDiagnostics?.w8NativeVideoProcessOutputAttempts,
    ) || 0;
  const nativeProcessOutputProducedFrames =
    Number(
      state.w8NativeVideoProcessOutputProducedFrames ||
        state.hostDiagnostics?.w8NativeVideoProcessOutputProducedFrames,
    ) || 0;
  const nativeProcessOutputNeedMoreInputFrames =
    Number(
      state.w8NativeVideoProcessOutputNeedMoreInputFrames ||
        state.hostDiagnostics?.w8NativeVideoProcessOutputNeedMoreInputFrames,
    ) || 0;
  const nativeProcessOutputStreamChangeFrames =
    Number(
      state.w8NativeVideoProcessOutputStreamChangeFrames ||
        state.hostDiagnostics?.w8NativeVideoProcessOutputStreamChangeFrames,
    ) || 0;
  const nativeProcessOutputNoSampleFrames =
    Number(
      state.w8NativeVideoProcessOutputNoSampleFrames ||
        state.hostDiagnostics?.w8NativeVideoProcessOutputNoSampleFrames,
    ) || 0;
  const nativeProcessOutputFailures =
    Number(
      state.w8NativeVideoProcessOutputFailures ||
        state.hostDiagnostics?.w8NativeVideoProcessOutputFailures,
    ) || 0;
  const nativeLastProcessOutputStatus = String(
    state.w8NativeVideoLastProcessOutputStatus ||
      state.hostDiagnostics?.w8NativeVideoLastProcessOutputStatus ||
      "",
  ).trim();
  const nativeDecoderSessionWorkerThread = Boolean(
    state.w8NativeVideoDecoderSessionWorkerThread ||
      state.hostDiagnostics?.w8NativeVideoDecoderSessionWorkerThread,
  );
  const nativeDecoderSessionWorkerMode = String(
    state.w8NativeVideoDecoderSessionWorkerMode ||
      state.hostDiagnostics?.w8NativeVideoDecoderSessionWorkerMode ||
      "",
  ).trim();
  const nativeDecoderSessionWorkerStatus = String(
    state.w8NativeVideoDecoderSessionWorkerStatus ||
      state.hostDiagnostics?.w8NativeVideoDecoderSessionWorkerStatus ||
      "",
  ).trim();
  const nativeFrameHandoffActive = Boolean(
    state.w8NativeVideoFrameHandoffActive ||
      state.hostDiagnostics?.w8NativeVideoFrameHandoffActive,
  );
  const nativeFrameHandoffMode = String(
    state.w8NativeVideoFrameHandoffMode ||
      state.hostDiagnostics?.w8NativeVideoFrameHandoffMode ||
      "",
  ).trim();
  const nativeFrameHandoffStatus = String(
    state.w8NativeVideoFrameHandoffStatus ||
      state.hostDiagnostics?.w8NativeVideoFrameHandoffStatus ||
      "",
  ).trim();
  const nativeLatestFrameFormat = String(
    state.w8NativeVideoLatestFrameFormat ||
      state.hostDiagnostics?.w8NativeVideoLatestFrameFormat ||
      "",
  ).trim();
  const nativeLatestFrameBytes =
    Number(
      state.w8NativeVideoLatestFrameBytes ||
        state.hostDiagnostics?.w8NativeVideoLatestFrameBytes,
    ) || 0;
  const nativeLatestFrameId = normalizeFrameId(
    state.w8NativeVideoLatestFrameId ?? state.hostDiagnostics?.w8NativeVideoLatestFrameId,
  );
  const nativeLatestFrameUpdatedAtMs = normalizeTimestampMs(
    state.w8NativeVideoLatestFrameUpdatedAtMs ??
      state.hostDiagnostics?.w8NativeVideoLatestFrameUpdatedAtMs,
  );
  const nativeSurfaceReady = Boolean(
    state.w8NativeVideoNativeSurfaceReady ||
      state.hostDiagnostics?.w8NativeVideoNativeSurfaceReady,
  );
  const nativeSurfaceMode = String(
    state.w8NativeVideoNativeSurfaceMode ||
      state.hostDiagnostics?.w8NativeVideoNativeSurfaceMode ||
      "",
  ).trim();
  const nativeSurfaceStatus = String(
    state.w8NativeVideoNativeSurfaceStatus ||
      state.hostDiagnostics?.w8NativeVideoNativeSurfaceStatus ||
      "",
  ).trim();
  const nativeSurfaceFormat = String(
    state.w8NativeVideoNativeSurfaceFormat ||
      state.hostDiagnostics?.w8NativeVideoNativeSurfaceFormat ||
      "",
  ).trim();
  const nativeSurfaceWidth =
    Number(
      state.w8NativeVideoNativeSurfaceWidth ||
        state.hostDiagnostics?.w8NativeVideoNativeSurfaceWidth,
    ) || 0;
  const nativeSurfaceHeight =
    Number(
      state.w8NativeVideoNativeSurfaceHeight ||
        state.hostDiagnostics?.w8NativeVideoNativeSurfaceHeight,
    ) || 0;
  const nativeSurfaceReason = String(
    state.w8NativeVideoNativeSurfaceReason ||
      state.hostDiagnostics?.w8NativeVideoNativeSurfaceReason ||
      "",
  ).trim();
  const nativeSurfaceCopyStatus = String(
    state.w8NativeVideoNativeSurfaceCopyStatus ||
      state.hostDiagnostics?.w8NativeVideoNativeSurfaceCopyStatus ||
      "",
  ).trim();
  const nativeSurfaceCopyBytes =
    Number(
      state.w8NativeVideoNativeSurfaceCopyBytes ||
        state.hostDiagnostics?.w8NativeVideoNativeSurfaceCopyBytes,
    ) || 0;
  const nativeSurfacePresentedFrames =
    Number(
      state.w8NativeVideoNativeSurfacePresentedFrames ||
        state.hostDiagnostics?.w8NativeVideoNativeSurfacePresentedFrames,
    ) || 0;
  const nativeSurfaceLastFrameId = normalizeFrameId(
    state.w8NativeVideoNativeSurfaceLastFrameId ??
      state.hostDiagnostics?.w8NativeVideoNativeSurfaceLastFrameId,
  );
  const nativeSurfaceUpdatedAtMs = normalizeTimestampMs(
    state.w8NativeVideoNativeSurfaceUpdatedAtMs ??
      state.hostDiagnostics?.w8NativeVideoNativeSurfaceUpdatedAtMs,
  );
  const nativePresentReady = Boolean(
    state.w8NativeVideoNativePresentReady ||
      state.hostDiagnostics?.w8NativeVideoNativePresentReady,
  );
  const nativePresentMode = String(
    state.w8NativeVideoNativePresentMode ||
      state.hostDiagnostics?.w8NativeVideoNativePresentMode ||
      "",
  ).trim();
  const nativePresentStatus = String(
    state.w8NativeVideoNativePresentStatus ||
      state.hostDiagnostics?.w8NativeVideoNativePresentStatus ||
      "",
  ).trim();
  const nativePresentFormat = String(
    state.w8NativeVideoNativePresentFormat ||
      state.hostDiagnostics?.w8NativeVideoNativePresentFormat ||
      "",
  ).trim();
  const nativePresentWidth =
    Number(
      state.w8NativeVideoNativePresentWidth ||
        state.hostDiagnostics?.w8NativeVideoNativePresentWidth,
    ) || 0;
  const nativePresentHeight =
    Number(
      state.w8NativeVideoNativePresentHeight ||
        state.hostDiagnostics?.w8NativeVideoNativePresentHeight,
    ) || 0;
  const nativePresentFrames =
    Number(
      state.w8NativeVideoNativePresentFrames ||
        state.hostDiagnostics?.w8NativeVideoNativePresentFrames,
    ) || 0;
  const nativePresentLastFrameId = normalizeFrameId(
    state.w8NativeVideoNativePresentLastFrameId ??
      state.hostDiagnostics?.w8NativeVideoNativePresentLastFrameId,
  );
  const nativePresentUpdatedAtMs = normalizeTimestampMs(
    state.w8NativeVideoNativePresentUpdatedAtMs ??
      state.hostDiagnostics?.w8NativeVideoNativePresentUpdatedAtMs,
  );
  const nativeFreshnessStatus = String(
    state.w8NativeVideoFreshnessStatus || state.hostDiagnostics?.w8NativeVideoFreshnessStatus || "",
  ).trim();
  const nativePresentFrameLag =
    Number(state.w8NativeVideoPresentFrameLag || state.hostDiagnostics?.w8NativeVideoPresentFrameLag) || 0;
  const nativePresentAgeMs =
    Number(state.w8NativeVideoPresentAgeMs || state.hostDiagnostics?.w8NativeVideoPresentAgeMs) || 0;
  const nativePresentReason = String(
    state.w8NativeVideoNativePresentReason ||
      state.hostDiagnostics?.w8NativeVideoNativePresentReason ||
      "",
  ).trim();
  const nativeDecoderProgress =
    nativeDecoderSessionSubmittedFrames > 0 ||
    nativeDecoderSessionAcceptedInputFrames > 0 ||
    nativeDecoderSessionDecodedFrames > 0 ||
    nativeSurfacePresentedFrames > 0 ||
    nativePresentFrames > 0 ||
    nativeDecoderSessionActive ||
    Boolean(nativeSurfaceStatus || nativePresentStatus);
  const nativeWindowPresenting =
    nativePresentFrames > 0 && nativePresentStatus.toLowerCase().includes("presented");
  const nativeWindowSwapchainReady = Boolean(
    state.w8NativeVideoWindowSwapchainReady ||
      state.hostDiagnostics?.w8NativeVideoWindowSwapchainReady,
  );
  const nativeWindowSwapchainMode = String(
    state.w8NativeVideoWindowSwapchainMode ||
      state.hostDiagnostics?.w8NativeVideoWindowSwapchainMode ||
      "",
  ).trim();
  const nativeWindowSwapchainStatus = String(
    state.w8NativeVideoWindowSwapchainStatus ||
      state.hostDiagnostics?.w8NativeVideoWindowSwapchainStatus ||
      "",
  ).trim();
  const nativeWindowSwapchainFormat = String(
    state.w8NativeVideoWindowSwapchainFormat ||
      state.hostDiagnostics?.w8NativeVideoWindowSwapchainFormat ||
      "",
  ).trim();
  const nativeWindowSwapchainWidth =
    Number(
      state.w8NativeVideoWindowSwapchainWidth ||
        state.hostDiagnostics?.w8NativeVideoWindowSwapchainWidth,
    ) || 0;
  const nativeWindowSwapchainHeight =
    Number(
      state.w8NativeVideoWindowSwapchainHeight ||
        state.hostDiagnostics?.w8NativeVideoWindowSwapchainHeight,
    ) || 0;
  const nativeWindowSwapchainBufferCount =
    Number(
      state.w8NativeVideoWindowSwapchainBufferCount ||
        state.hostDiagnostics?.w8NativeVideoWindowSwapchainBufferCount,
    ) || 0;
  const nativeWindowSwapchainSwapEffect = String(
    state.w8NativeVideoWindowSwapchainSwapEffect ||
      state.hostDiagnostics?.w8NativeVideoWindowSwapchainSwapEffect ||
      "",
  ).trim();
  const nativeWindowSwapchainReason = String(
    state.w8NativeVideoWindowSwapchainReason ||
      state.hostDiagnostics?.w8NativeVideoWindowSwapchainReason ||
      "",
  ).trim();
  const nativeLastReason = String(state.hostDiagnostics?.w8NativeVideoLastReason || "").trim();
  const nativeErrors = Number(state.w8NativeVideoErrors || state.hostDiagnostics?.w8NativeVideoErrors) || 0;
  const nativeLastError = String(state.w8NativeVideoLastError || state.hostDiagnostics?.w8NativeVideoLastError || "").trim();
  const nativeProgressStatus = String(
    state.w8NativeVideoProgressStatus || state.hostDiagnostics?.w8NativeVideoProgressStatus || "",
  ).trim();
  const nativeProgressNext = String(
    state.w8NativeVideoProgressNext || state.hostDiagnostics?.w8NativeVideoProgressNext || "",
  ).trim();
  const nativeProgressWindowMs =
    Number(
      state.w8NativeVideoProgressWindowMs || state.hostDiagnostics?.w8NativeVideoProgressWindowMs,
    ) || 0;
  const nativePresentFrameDelta =
    Number(
      state.w8NativeVideoPresentFrameDelta || state.hostDiagnostics?.w8NativeVideoPresentFrameDelta,
    ) || 0;
  const nativePresentFps =
    Number(state.w8NativeVideoPresentFps || state.hostDiagnostics?.w8NativeVideoPresentFps) || 0;
  const nativeDecodedFrameDelta =
    Number(
      state.w8NativeVideoDecodedFrameDelta || state.hostDiagnostics?.w8NativeVideoDecodedFrameDelta,
    ) || 0;
  const nativeDecodedFps =
    Number(state.w8NativeVideoDecodedFps || state.hostDiagnostics?.w8NativeVideoDecodedFps) || 0;
  const nativeWebBypassDelta =
    Number(
      state.w8NativeVideoWebBypassDelta || state.hostDiagnostics?.w8NativeVideoWebBypassDelta,
    ) || 0;
  const nativeWebBypassFps =
    Number(state.w8NativeVideoWebBypassFps || state.hostDiagnostics?.w8NativeVideoWebBypassFps) || 0;
  const nativeFramesPushedDelta =
    Number(
      state.w8NativeVideoFramesPushedDelta || state.hostDiagnostics?.w8NativeVideoFramesPushedDelta,
    ) || 0;
  const nativeSubmittedFrameDelta =
    Number(
      state.w8NativeVideoSubmittedFrameDelta || state.hostDiagnostics?.w8NativeVideoSubmittedFrameDelta,
    ) || 0;
  const w14ReceiverStatus = String(state.hostDiagnostics?.w14NativeReceiverStatus || "").trim();
  const w14ReceiverTransport = String(state.hostDiagnostics?.w14NativeReceiverTransport || "").trim();
  const w14ReceiverMediaOwner = String(state.hostDiagnostics?.w14NativeReceiverMediaOwner || "").trim();
  const w14VideoRunning = Boolean(state.hostDiagnostics?.w14NativeVideoRunning);
  const w14VideoRendererMode = String(state.hostDiagnostics?.w14NativeVideoRendererMode || "").trim();
  const w14VideoPushedFrames = Number(state.hostDiagnostics?.w14NativeVideoPushedFrames) || 0;
  const w14VideoAcceptedFrames = Number(state.hostDiagnostics?.w14NativeVideoAcceptedFrames) || 0;
  const w14VideoDroppedFrames = Number(state.hostDiagnostics?.w14NativeVideoDroppedFrames) || 0;
  const w14VideoQueueMs = Number(state.hostDiagnostics?.w14NativeVideoQueueMs) || 0;
  const w14VideoDecodedFrames = Number(state.hostDiagnostics?.w14NativeVideoDecodedFrames) || 0;
  const w14VideoPresentFrames = Number(state.hostDiagnostics?.w14NativeVideoPresentFrames) || 0;
  const w14VideoPresenting = Boolean(state.hostDiagnostics?.w14NativeVideoPresenting);
  const w14VideoSourceFrameId = normalizeFrameId(state.hostDiagnostics?.w14NativeVideoLastFrameId);
  const w14VideoLatestFrameId = normalizeFrameId(state.hostDiagnostics?.w14NativeVideoLatestFrameId);
  const w14VideoSurfaceFrameId = normalizeFrameId(state.hostDiagnostics?.w14NativeVideoSurfaceFrameId);
  const w14VideoPresentFrameId = normalizeFrameId(state.hostDiagnostics?.w14NativeVideoPresentFrameId);
  const w14VideoFreshnessStatus = String(state.hostDiagnostics?.w14NativeVideoFreshnessStatus || "").trim();
  const w14VideoPresentFrameLag = Number(state.hostDiagnostics?.w14NativeVideoPresentFrameLag) || 0;
  const w14VideoPresentAgeMs = Number(state.hostDiagnostics?.w14NativeVideoPresentAgeMs) || 0;
  const w14VideoLastStatus = String(state.hostDiagnostics?.w14NativeVideoLastStatus || "").trim();
  const w14VideoLastReason = String(state.hostDiagnostics?.w14NativeVideoLastReason || "").trim();
  const w14VideoLastError = String(
    state.hostDiagnostics?.w14NativeVideoLastError || state.hostDiagnostics?.w14NativeReceiverLastError || "",
  ).trim();
  const w14AudioFrames = Number(state.hostDiagnostics?.w14NativeAudioFrames) || 0;
  const w14AudioPlaybackRunning = Boolean(state.hostDiagnostics?.w14NativeAudioPlaybackRunning);
  const w14AudioQueueMs = Number(state.hostDiagnostics?.w14NativeAudioPlaybackQueueMs) || 0;
  const w14AudioPushedFrames = Number(state.hostDiagnostics?.w14NativeAudioPlaybackPushedFrames) || 0;
  const w14AudioPlayedFrames = Number(state.hostDiagnostics?.w14NativeAudioPlaybackPlayedFrames) || 0;
  const w14AudioTrimmedFrames = Number(state.hostDiagnostics?.w14NativeAudioPlaybackTrimmedFrames) || 0;
  const w14AudioUnderruns = Number(state.hostDiagnostics?.w14NativeAudioPlaybackUnderruns) || 0;
  const w14AudioDroppedFrames = Number(state.hostDiagnostics?.w14NativeAudioPlaybackDroppedFrames) || 0;
  const w14AudioOutputCallbacks = Number(state.hostDiagnostics?.w14NativeAudioOutputCallbacks) || 0;
  const w14AudioOutputSignalCallbacks = Number(state.hostDiagnostics?.w14NativeAudioOutputSignalCallbacks) || 0;
  const w14AudioOutputSilentCallbacks = Number(state.hostDiagnostics?.w14NativeAudioOutputSilentCallbacks) || 0;
  const w14AudioOutputPeakMilli = Number(state.hostDiagnostics?.w14NativeAudioOutputPeakMilli) || 0;
  const w14AudioOutputRmsMilli = Number(state.hostDiagnostics?.w14NativeAudioOutputRmsMilli) || 0;
  const w14AudioOutputBufferFrames = Number(state.hostDiagnostics?.w14NativeAudioOutputBufferFrames) || 0;
  const w14AudioOutputBufferMs = Number(state.hostDiagnostics?.w14NativeAudioOutputBufferMs) || 0;
  const w14AudioOutputLowLatency = Boolean(state.hostDiagnostics?.w14NativeAudioOutputLowLatency);
  const w14AudioOutputDeviceName = String(state.hostDiagnostics?.w14NativeAudioOutputDeviceName || "").trim();
  const w14AudioOutputSampleFormat = String(state.hostDiagnostics?.w14NativeAudioOutputSampleFormat || "").trim();
  const w14AudioOutputStreamRunning = Boolean(state.hostDiagnostics?.w14NativeAudioOutputStreamRunning);
  const nativeClassifier = classifyW8NativeVideoSession(state);
  const w13LocalQosParts = formatW13LocalVideoQosDiagnostics(state.hostDiagnostics);
  const { sampleCount, averageGapMs, maxGapMs, stutterCount, maxStutterGapMs } = getVideoFrameGapStats();
  const remoteMediaGapStats = getVideoRemoteMediaGapStats();
  const firstFrameWaitStatus = getVideoFirstFrameWaitStatus(now);
  const streamStallStatus = firstFrameWaitStatus.waiting ? { stalled: false } : getVideoStreamStallStatus(now);
  const liveHealthText = formatVideoLiveHealthStatusText(now, { firstFrameWaitStatus, streamStallStatus });
  const parts = [];
  parts.push(actual > 0 ? `实收 ${actual.toFixed(1)} FPS` : "实收 -- FPS");
  if (firstFrameWaitStatus.waiting) {
    parts.push("等待视频首帧");
    parts.push(`已等待 ${firstFrameWaitStatus.ageSeconds}s`);
  } else if (streamStallStatus.stalled) {
    parts.push("视频断流");
    parts.push(`最后收到 ${streamStallStatus.ageSeconds}s 前`);
  }
  if (requested) parts.push(`请求 ${requested} Hz`);
  if (negotiated) parts.push(`协商 ${negotiated} Hz`);
  if (liveHealthText) parts.push(liveHealthText);
  if (sampleCount >= 2) {
    parts.push(`平均间隔 ${averageGapMs} ms`);
    parts.push(`最大间隔 ${maxGapMs} ms`);
    if (remoteMediaGapStats.sampleCount >= 2) {
      parts.push(`远端媒体平均间隔 ${remoteMediaGapStats.averageGapMs} ms`);
      parts.push(`远端媒体最大间隔 ${remoteMediaGapStats.maxGapMs} ms`);
      if (remoteMediaGapStats.stutterCount > 0) {
        parts.push(`远端媒体卡顿 ${remoteMediaGapStats.stutterCount}`);
        parts.push(`远端媒体最大卡顿 ${remoteMediaGapStats.maxStutterGapMs} ms`);
      }
    }
    if (stutterCount > 0) {
      parts.push(`卡顿 ${stutterCount}`);
      parts.push(`最大卡顿 ${maxStutterGapMs} ms`);
    }
  } else {
    parts.push("间隔样本不足");
  }
  parts.push(`帧 ${frameCount}`);
  if (droppedFrames > 0) parts.push(`远端丢帧 ${droppedFrames}`);
  if (receivedFrames > 0) parts.push(`H.264收到 ${receivedFrames}`);
  if (receivedKeyFrames > 0) parts.push(`关键帧 ${receivedKeyFrames}`);
  if (receivedSps > 0 || receivedPps > 0 || receivedIdr > 0) {
    parts.push(`SPS/PPS/IDR ${receivedSps}/${receivedPps}/${receivedIdr}`);
  }
  if (lastNalTypes) parts.push(`NAL ${lastNalTypes}`);
  if (w14ReceiverStatus || w14VideoRunning || w14VideoPushedFrames > 0) {
    parts.push(`W14原生接收 ${w14ReceiverStatus || "starting"}`);
    if (w14ReceiverTransport) parts.push(`W14传输 ${w14ReceiverTransport}`);
    if (w14ReceiverMediaOwner) parts.push(`W14媒体 ${w14ReceiverMediaOwner}`);
    if (w14VideoRendererMode) parts.push(`W14渲染 ${w14VideoRendererMode}`);
    parts.push(`W14原生视频 pushed ${Math.round(w14VideoPushedFrames)}`);
    parts.push(`W14原生视频 accepted ${Math.round(w14VideoAcceptedFrames)}`);
    if (w14VideoDroppedFrames > 0) {
      parts.push(`W14原生视频 dropped ${Math.round(w14VideoDroppedFrames)}`);
    }
    if (w14VideoQueueMs > 0) parts.push(`W14原生视频 queue ${Math.round(w14VideoQueueMs)} ms`);
    parts.push(`W14原生解码 ${Math.round(w14VideoDecodedFrames)}`);
    parts.push(`W14原生呈现 ${Math.round(w14VideoPresentFrames)}`);
    parts.push(`W14原生画面 ${w14VideoPresenting ? "yes" : "no"}`);
    if (w14VideoSourceFrameId !== null || w14VideoLatestFrameId !== null || w14VideoPresentFrameId !== null) {
      parts.push(
        `W14帧链 source:${w14VideoSourceFrameId ?? "none"}/latest:${w14VideoLatestFrameId ?? "none"}/surface:${w14VideoSurfaceFrameId ?? "none"}/present:${w14VideoPresentFrameId ?? "none"}`,
      );
    }
    if (w14VideoFreshnessStatus) parts.push(`W14新鲜度 ${w14VideoFreshnessStatus}`);
    if (w14VideoLatestFrameId !== null) parts.push(`W14呈现滞后 ${Math.round(w14VideoPresentFrameLag)}`);
    if (w14VideoPresentAgeMs > 0) parts.push(`W14呈现年龄 ${Math.round(w14VideoPresentAgeMs)} ms`);
    if (w14VideoLastStatus) parts.push(`W14原生状态 ${w14VideoLastStatus}`);
    if (w14VideoLastReason && !w14VideoPresenting) {
      parts.push(`W14原生原因 ${w14VideoLastReason.replace(/\s+/g, " ").slice(0, 80)}`);
    }
    if (w14VideoLastError) {
      parts.push(`W14原生错误 ${w14VideoLastError.replace(/\s+/g, " ").slice(0, 80)}`);
    }
  }
  if (w14AudioFrames > 0 || w14AudioPlaybackRunning || w14AudioOutputCallbacks > 0) {
    parts.push(`W14原生音频 frames ${Math.round(w14AudioFrames)}`);
    parts.push(`W14原生音频 ${w14AudioPlaybackRunning ? "running" : "stopped"}`);
    if (w14AudioQueueMs > 0) parts.push(`W14原生音频 queue ${Math.round(w14AudioQueueMs)} ms`);
    if (w14AudioPushedFrames > 0) parts.push(`W14原生音频 pushed ${Math.round(w14AudioPushedFrames)}`);
    if (w14AudioPlayedFrames > 0) parts.push(`W14原生音频 played ${Math.round(w14AudioPlayedFrames)}`);
    if (w14AudioTrimmedFrames > 0) parts.push(`W14原生音频 trimmed ${Math.round(w14AudioTrimmedFrames)}`);
    if (w14AudioUnderruns > 0) parts.push(`W14原生音频 underruns ${Math.round(w14AudioUnderruns)}`);
    if (w14AudioDroppedFrames > 0) parts.push(`W14原生音频 dropped ${Math.round(w14AudioDroppedFrames)}`);
    if (w14AudioOutputCallbacks > 0) parts.push(`W14音频回调 ${Math.round(w14AudioOutputCallbacks)}`);
    if (w14AudioOutputSignalCallbacks > 0) {
      parts.push(`W14音频有声回调 ${Math.round(w14AudioOutputSignalCallbacks)}`);
    }
    if (w14AudioOutputSilentCallbacks > 0) {
      parts.push(`W14音频静音回调 ${Math.round(w14AudioOutputSilentCallbacks)}`);
    }
    parts.push(`W14音频 peak ${Math.round(w14AudioOutputPeakMilli)}`);
    parts.push(`W14音频 rms ${Math.round(w14AudioOutputRmsMilli)}`);
    if (w14AudioOutputBufferMs > 0 || w14AudioOutputBufferFrames > 0) {
      parts.push(`W14音频输出buffer ${Math.round(w14AudioOutputBufferMs)} ms/${Math.round(w14AudioOutputBufferFrames)}f`);
    }
    parts.push(`W14音频低延迟 ${w14AudioOutputLowLatency ? "yes" : "no"}`);
    if (w14AudioOutputDeviceName) {
      parts.push(`W14音频设备 ${w14AudioOutputDeviceName.replace(/\s+/g, " ").slice(0, 80)}`);
    }
    if (w14AudioOutputSampleFormat) parts.push(`W14音频格式 ${w14AudioOutputSampleFormat}`);
    parts.push(`W14音频流 ${w14AudioOutputStreamRunning ? "running" : "stopped"}`);
    const outputDeviceToken = w14AudioOutputDeviceName
      ? w14AudioOutputDeviceName.replace(/\s+/g, "_").replace(/[;|,]+/g, "_").slice(0, 80)
      : "unknown";
    const outputFormatToken = w14AudioOutputSampleFormat
      ? w14AudioOutputSampleFormat.replace(/\s+/g, "_").replace(/[;|,]+/g, "_").slice(0, 40)
      : "unknown";
    parts.push(
      `W14AudioOutput=outputCallbacks=${Math.round(w14AudioOutputCallbacks)} callbackFrames=${Math.round(Number(state.hostDiagnostics?.w14NativeAudioOutputCallbackFrames) || 0)} signalCallbacks=${Math.round(w14AudioOutputSignalCallbacks)} silentCallbacks=${Math.round(w14AudioOutputSilentCallbacks)} peakMilli=${Math.round(w14AudioOutputPeakMilli)} rmsMilli=${Math.round(w14AudioOutputRmsMilli)} bufferMs=${Math.round(w14AudioOutputBufferMs)} bufferFrames=${Math.round(w14AudioOutputBufferFrames)} lowLatency=${w14AudioOutputLowLatency ? "true" : "false"} device=${outputDeviceToken} sampleFormat=${outputFormatToken} streamRunning=${w14AudioOutputStreamRunning ? "true" : "false"}`,
    );
  }
  if (nativeDecoderProgress || nativePresentReady || nativeWindowSwapchainReady) {
    parts.push("界面 HTML 壳");
    parts.push(
      `视频主画面 ${nativeWindowPresenting ? "原生 MF/D3D11/HWND" : "原生链路待 Present"}`,
    );
    parts.push("Web canvas 诊断/备用");
    if (webDecodeBypassCount > 0) {
      parts.push(`WebCodecs 旁路 原生主画面 ${Math.round(webDecodeBypassCount)}`);
    }
  }
  if (nativeFrames > 0) parts.push(`原生队列 ${nativeFrames}`);
  if (nativeQueueMs > 0) parts.push(`原生队列 ${Math.round(nativeQueueMs)} ms`);
  if (nativeDroppedFrames > 0) {
    parts.push(`${nativeDecoderProgress ? "原生预队列丢旧帧" : "原生丢旧帧"} ${nativeDroppedFrames}`);
  }
  if (nativeCodecString) parts.push(`原生解码配置 ${nativeCodecString}`);
  else if (nativeHasDecoderConfig) parts.push("原生解码配置已到达");
  if (nativeNalTypes) parts.push(`原生NAL ${nativeNalTypes}`);
  if (nativeSpsCount > 0 || nativePpsCount > 0 || nativeIdrCount > 0) {
    parts.push(`原生SPS/PPS/IDR ${nativeSpsCount}/${nativePpsCount}/${nativeIdrCount}`);
  }
  if (nativeIsKeyframe) parts.push("原生关键帧 yes");
  if (nativeKeyFrames > 0) parts.push(`原生关键帧累计 ${Math.round(nativeKeyFrames)}`);
  if (nativeByteLen > 0) parts.push(`原生字节 ${Math.round(nativeByteLen)}`);
  if (nativeDecoderMode) parts.push(`原生解码器 ${nativeDecoderReady ? "ready" : "blocked"}`);
  if (nativeD3dFeatureLevel) parts.push(`D3D11 ${nativeD3dFeatureLevel}`);
  if (nativeDecoderReason && !nativeDecoderReady) {
    parts.push(`原生解码器原因 ${nativeDecoderReason.replace(/\s+/g, " ").slice(0, 80)}`);
  }
  if (nativeDecoderInitMode) parts.push(`原生解码初始化 ${nativeDecoderInitReady ? "ready" : "blocked"}`);
  if (nativeDecoderInitOutputSubtypes) parts.push(`原生输出 ${nativeDecoderInitOutputSubtypes}`);
  if (nativeDecoderInitReason && !nativeDecoderInitReady) {
    parts.push(`原生初始化原因 ${nativeDecoderInitReason.replace(/\s+/g, " ").slice(0, 80)}`);
  }
  if (nativeDecodeStepMode) parts.push(`原生解码步进 ${nativeDecodeStepReady ? "ready" : "blocked"}`);
  if (nativeDecodeStepStatus) parts.push(`原生步进状态 ${nativeDecodeStepStatus}`);
  if (nativeDecodeStepReason && !nativeDecodeStepReady) {
    parts.push(`原生步进原因 ${nativeDecodeStepReason.replace(/\s+/g, " ").slice(0, 80)}`);
  }
  if (nativeDecoderSessionMode) {
    parts.push(`原生解码会话 ${nativeDecoderSessionActive ? "active" : "blocked"}`);
  }
  if (nativeDecoderSessionOutputSubtype) parts.push(`原生会话输出 ${nativeDecoderSessionOutputSubtype}`);
  if (nativeDecoderSessionSubmittedFrames > 0) parts.push(`原生会话输入 ${nativeDecoderSessionSubmittedFrames}`);
  if (nativeDecoderSessionAcceptedInputFrames > 0) {
    parts.push(`原生会话接受 ${nativeDecoderSessionAcceptedInputFrames}`);
  }
  if (nativeDecoderSessionMode) parts.push(`原生会话解码 ${nativeDecoderSessionDecodedFrames}`);
  if (nativeProcessInputAttempts > 0) {
    parts.push(`MF输入 ${nativeLastProcessInputStatus || "unknown"} ${nativeProcessInputAcceptedFrames}/${nativeProcessInputAttempts}`);
  }
  if (nativeProcessInputFailures > 0) parts.push(`MF输入失败 ${nativeProcessInputFailures}`);
  if (nativeProcessOutputAttempts > 0) {
    parts.push(`MF输出 ${nativeLastProcessOutputStatus || "unknown"} ${nativeProcessOutputProducedFrames}/${nativeProcessOutputAttempts}`);
  }
  if (nativeProcessOutputNeedMoreInputFrames > 0) {
    parts.push(`MF需更多输入 ${nativeProcessOutputNeedMoreInputFrames}`);
  }
  if (nativeProcessOutputStreamChangeFrames > 0) {
    parts.push(`MF流变化 ${nativeProcessOutputStreamChangeFrames}`);
  }
  if (nativeProcessOutputNoSampleFrames > 0) {
    parts.push(`MF无样本 ${nativeProcessOutputNoSampleFrames}`);
  }
  if (nativeProcessOutputFailures > 0) parts.push(`MF输出失败 ${nativeProcessOutputFailures}`);
  if (nativeDecoderSessionStatus) parts.push(`原生会话状态 ${nativeDecoderSessionStatus}`);
  if (nativeDecoderSessionWorkerMode || nativeDecoderSessionWorkerThread) {
    parts.push(`原生解码线程 ${nativeDecoderSessionWorkerThread ? "active" : "blocked"}`);
  }
  if (nativeDecoderSessionWorkerStatus) parts.push(`原生线程状态 ${nativeDecoderSessionWorkerStatus}`);
  if (nativeFrameHandoffMode || nativeFrameHandoffActive) {
    parts.push(`原生帧交接 ${nativeFrameHandoffActive ? "active" : "blocked"}`);
  }
  if (nativeLatestFrameFormat) {
    const latestFrameText =
      nativeLatestFrameBytes > 0
        ? `${nativeLatestFrameFormat} / ${Math.round(nativeLatestFrameBytes)} bytes`
        : nativeLatestFrameFormat;
    parts.push(`原生最新帧 ${latestFrameText}`);
  }
  if (nativeLatestFrameId !== null || nativeSurfaceLastFrameId !== null || nativePresentLastFrameId !== null) {
    parts.push(
      `原生帧链 latest:${nativeLatestFrameId ?? "none"}/surface:${nativeSurfaceLastFrameId ?? "none"}/present:${nativePresentLastFrameId ?? "none"}`,
    );
  }
  if (nativeFreshnessStatus) parts.push(`原生新鲜度 ${nativeFreshnessStatus}`);
  if (nativeLatestFrameId !== null) parts.push(`原生呈现滞后 ${Math.round(nativePresentFrameLag)}`);
  if (nativePresentAgeMs > 0) parts.push(`原生呈现年龄 ${Math.round(nativePresentAgeMs)} ms`);
  if (nativeLatestFrameUpdatedAtMs > 0 || nativeSurfaceUpdatedAtMs > 0 || nativePresentUpdatedAtMs > 0) {
    parts.push(
      `原生更新时间 latest:${Math.round(nativeLatestFrameUpdatedAtMs)}/surface:${Math.round(nativeSurfaceUpdatedAtMs)}/present:${Math.round(nativePresentUpdatedAtMs)}`,
    );
  }
  if (nativeFrameHandoffStatus) parts.push(`原生帧状态 ${nativeFrameHandoffStatus}`);
  if (nativeSurfaceMode || nativeSurfaceReady) {
    parts.push(`原生表面 ${nativeSurfaceReady ? "ready" : "blocked"}`);
  }
  if (nativeSurfaceFormat) {
    const surfaceSize =
      nativeSurfaceWidth > 0 && nativeSurfaceHeight > 0
        ? `${Math.round(nativeSurfaceWidth)}x${Math.round(nativeSurfaceHeight)} `
        : "";
    parts.push(`原生表面目标 D3D11 ${surfaceSize}${nativeSurfaceFormat}`.trim());
  }
  if (nativeSurfaceStatus) parts.push(`原生表面状态 ${nativeSurfaceStatus}`);
  if (nativeSurfaceCopyStatus && nativeSurfaceCopyStatus !== nativeSurfaceStatus) {
    parts.push(`原生表面写入状态 ${nativeSurfaceCopyStatus}`);
  }
  if (nativeSurfaceCopyBytes > 0) {
    parts.push(`原生表面写入 ${Math.round(nativeSurfaceCopyBytes)} bytes`);
  }
  if (nativeSurfacePresentedFrames > 0) {
    parts.push(`原生表面呈现 ${Math.round(nativeSurfacePresentedFrames)}`);
  }
  if (nativeSurfaceReason && !nativeSurfaceReady) {
    parts.push(`原生表面原因 ${nativeSurfaceReason.replace(/\s+/g, " ").slice(0, 80)}`);
  }
  if (nativePresentMode || nativePresentReady) {
    parts.push(`原生呈现目标 ${nativePresentReady ? "ready" : "blocked"}`);
  }
  if (nativePresentFormat) {
    const presentSize =
      nativePresentWidth > 0 && nativePresentHeight > 0
        ? `${Math.round(nativePresentWidth)}x${Math.round(nativePresentHeight)} `
        : "";
    parts.push(`原生呈现目标 D3D11 ${presentSize}${nativePresentFormat}`.trim());
  }
  if (nativePresentStatus) parts.push(`原生呈现状态 ${nativePresentStatus}`);
  if (nativePresentFrames > 0) {
    parts.push(`原生呈现帧 ${Math.round(nativePresentFrames)}`);
  }
  if (nativePresentReason && !nativePresentReady) {
    parts.push(`原生呈现原因 ${nativePresentReason.replace(/\s+/g, " ").slice(0, 80)}`);
  }
  if (nativeWindowSwapchainMode || nativeWindowSwapchainReady) {
    parts.push(`原生窗口交换链 ${nativeWindowSwapchainReady ? "ready" : "blocked"}`);
  }
  if (nativeWindowSwapchainFormat) {
    const swapchainSize =
      nativeWindowSwapchainWidth > 0 && nativeWindowSwapchainHeight > 0
        ? `${Math.round(nativeWindowSwapchainWidth)}x${Math.round(nativeWindowSwapchainHeight)} `
        : "";
    parts.push(`原生窗口交换链 D3D11 ${swapchainSize}${nativeWindowSwapchainFormat}`.trim());
  }
  if (nativeWindowSwapchainStatus) parts.push(`原生窗口交换链状态 ${nativeWindowSwapchainStatus}`);
  if (nativeWindowSwapchainBufferCount > 0) {
    const effect = nativeWindowSwapchainSwapEffect ? ` / ${nativeWindowSwapchainSwapEffect}` : "";
    parts.push(`原生窗口交换链参数 ${Math.round(nativeWindowSwapchainBufferCount)} buffers${effect}`);
  }
  if (nativeWindowSwapchainReason && !nativeWindowSwapchainReady) {
    parts.push(`原生窗口交换链原因 ${nativeWindowSwapchainReason.replace(/\s+/g, " ").slice(0, 80)}`);
  }
  if (nativeDecoderProgress || nativePresentReady || nativeWindowSwapchainReady) {
    parts.push(`原生分类 ${nativeClassifier.nativeClass}`);
    parts.push(`原生下一步 ${nativeClassifier.nativeNext}`);
  }
  if (nativeProgressStatus) {
    parts.push(`原生进展 ${nativeProgressStatus}`);
    if (nativeProgressWindowMs > 0) parts.push(`原生窗口 ${Math.round(nativeProgressWindowMs)} ms`);
    if (nativePresentFrameDelta > 0) {
      parts.push(`原生呈现增长 ${Math.round(nativePresentFrameDelta)}`);
      if (nativePresentFps > 0) parts.push(`原生呈现 ${nativePresentFps.toFixed(1)} FPS`);
    }
    if (nativeDecodedFrameDelta > 0) {
      parts.push(`原生解码增长 ${Math.round(nativeDecodedFrameDelta)}`);
      if (nativeDecodedFps > 0) parts.push(`原生解码 ${nativeDecodedFps.toFixed(1)} FPS`);
    }
    if (nativeWebBypassDelta > 0) {
      parts.push(`Web旁路增长 ${Math.round(nativeWebBypassDelta)}`);
      if (nativeWebBypassFps > 0) parts.push(`Web旁路 ${nativeWebBypassFps.toFixed(1)} FPS`);
    }
    if (nativeFramesPushedDelta > 0) parts.push(`原生入站增长 ${Math.round(nativeFramesPushedDelta)}`);
    if (nativeSubmittedFrameDelta > 0) parts.push(`原生提交增长 ${Math.round(nativeSubmittedFrameDelta)}`);
    if (nativeProgressNext) parts.push(`原生进展下一步 ${nativeProgressNext}`);
  }
  parts.push(...w13LocalQosParts);
  if (nativeDecoderSessionReason && !nativeDecoderSessionActive) {
    parts.push(`原生会话原因 ${nativeDecoderSessionReason.replace(/\s+/g, " ").slice(0, 80)}`);
  }
  if (nativeLastReason) parts.push(`原生原因 ${nativeLastReason}`);
  if (nativeErrors > 0) parts.push(`原生错误 ${nativeErrors}`);
  if (nativeLastError) parts.push(`原生最近错误 ${nativeLastError.replace(/\s+/g, " ").slice(0, 80)}`);
  if (decoderQueue > 0) parts.push(`解码队列 ${decoderQueue}`);
  if (decoderQueueMs > 0) parts.push(`本机队列 ${Math.round(decoderQueueMs)} ms`);
  if (decoderLatencyMs > 0) parts.push(`解码延迟 ${Math.round(decoderLatencyMs)} ms`);
  if (liveBacklogRecoveryCount > 0) parts.push(`追实时请求 ${liveBacklogRecoveryCount} 次`);
  if (staleDrops > 0) parts.push(`本地过期丢帧 ${staleDrops}`);
  if (skippedDeltaFrames > 0) parts.push(`跳过 delta ${skippedDeltaFrames}`);
  if (visibilityRecoveryCount > 0) parts.push(`可见恢复 ${visibilityRecoveryCount} 次`);
  if (recoveryInFlight && recoveryKeyFrameReceivedAt > 0 && recoveryFrameDrawnAt <= 0) {
    parts.push("恢复关键帧已收到");
  } else if (recoveryInFlight) {
    parts.push("恢复关键帧请求中");
  }
  if (needsKeyFrame && decoderStatus && decoderStatus !== "idle") parts.push("需要关键帧");
  if (dropReason) parts.push(`原因 ${dropReason}`);
  if (fallbackRecoveryCount > 0) parts.push(`回退恢复 ${fallbackRecoveryCount} 次`);
  if (fallbackLastReason) parts.push(`最近回退：${fallbackLastReason}`);
  if (fallbackRecoveryPauseCount > 0) parts.push(`恢复暂停 ${fallbackRecoveryPauseCount} 次`);
  if (fallbackRecoveryPausedMs > 0) parts.push(`暂停剩余 ${Math.ceil(fallbackRecoveryPausedMs / 1000)}s`);
  if (decoderStatus && decoderStatus !== "idle") parts.push(`解码 ${labelFromMap(decoderStatus, videoDecoderStatusLabels)}`);
  return parts.join(" · ");
}

function getAudioQueueMs() {
  if (state.nativeAudioRunning && canUseDesktopNativeAudioPlayback()) {
    const nativeQueueMs = Number(state.nativeAudioSnapshot?.queueMs);
    if (Number.isFinite(nativeQueueMs)) {
      return Math.max(0, Math.round(nativeQueueMs));
    }
  }
  const currentTime = Number(state.audioContext?.currentTime);
  const nextPlayTime = Number(state.audioNextPlayTime);
  if (!Number.isFinite(currentTime) || !Number.isFinite(nextPlayTime)) return 0;
  return Math.max(0, Math.round((nextPlayTime - currentTime) * 1000));
}

function getAudioPerformanceExportStatus(now = performance.now()) {
  const enabled = elements.audioToggle.checked;
  const frameCount = Number(state.audioFrames) || 0;
  const playedCount = Number(state.audioPlayedFrames) || 0;
  const droppedCount = Number(state.audioDroppedFrames) || 0;
  const queueMs = getAudioQueueMs();
  const resyncCount = Number(state.audioResyncCount) || 0;
  const underrunCount = Number(state.audioUnderrunCount) || 0;
  const stablePrebufferCount = Number(state.audioStablePrebufferCount) || 0;
  const visibilityRecoveryCount = Number(state.audioVisibilityRecoveryCount) || 0;
  const latencyTrimmedCount = Number(state.audioLatencyTrimmedFrames) || 0;
  const dropReason = String(state.audioLastDropReason || state.audioLastBufferReason || "").trim();
  const { sampleCount, averageGapMs, maxGapMs, stutterCount, maxStutterGapMs } = getAudioFrameGapStats();
  const remoteMediaGapStats = getAudioRemoteMediaGapStats();
  const bufferText = `${Math.round(audioInitialBufferSeconds * 1000)}/${Math.round(audioMinimumBufferSeconds * 1000)}/${Math.round(audioMaximumQueuedSeconds * 1000)}/${Math.round(audioResyncBufferSeconds * 1000)} ms`;
  const parts = [enabled ? "开启" : "关闭", `队列 ${queueMs} ms`, `缓冲 ${bufferText}`, `接收 ${frameCount}`, `播放 ${playedCount}`, `丢 ${droppedCount}`];
  if (state.nativeAudioRunning && canUseDesktopNativeAudioPlayback()) {
    const nativeSourceFrameMs = Number(state.nativeAudioSnapshot?.sourceFrameMs);
    const nativeSourceFrameMaxMs = Number(state.nativeAudioSnapshot?.sourceFrameMaxMs);
    const nativeSourceFrameCadenceMs = Number(state.nativeAudioSnapshot?.sourceFrameCadenceMs);
    const nativeSourceCadenceFrames = Number(state.nativeAudioSnapshot?.sourceCadenceFrames);
    const nativeOutputBufferFrames = Number(state.nativeAudioSnapshot?.outputBufferFrames);
    const nativeOutputBufferMs = Number(state.nativeAudioSnapshot?.outputBufferMs);
    const nativeOutputLowLatency = state.nativeAudioSnapshot?.outputLowLatency === true;
    if (Number.isFinite(nativeSourceFrameMs) && nativeSourceFrameMs > 0) {
      parts.push(`原生源帧 ${Math.round(nativeSourceFrameMs)} ms`);
    }
    if (Number.isFinite(nativeSourceFrameMaxMs) && nativeSourceFrameMaxMs > 0) {
      parts.push(`原生最大源帧 ${Math.round(nativeSourceFrameMaxMs)} ms`);
    }
    if (
      Number.isFinite(nativeSourceCadenceFrames) &&
      nativeSourceCadenceFrames > 0 &&
      Number.isFinite(nativeSourceFrameCadenceMs) &&
      nativeSourceFrameCadenceMs > 0
    ) {
      parts.push(`原生节奏 ${Math.round(nativeSourceCadenceFrames)}x${Math.round(nativeSourceFrameCadenceMs)} ms`);
    }
    if (
      (Number.isFinite(nativeOutputBufferMs) && nativeOutputBufferMs > 0) ||
      (Number.isFinite(nativeOutputBufferFrames) && nativeOutputBufferFrames > 0)
    ) {
      parts.push(
        `原生输出buffer ${Math.round(nativeOutputBufferMs || 0)} ms/${Math.round(nativeOutputBufferFrames || 0)}f`,
      );
    }
    parts.push(`原生低延迟输出 ${nativeOutputLowLatency ? "yes" : "no"}`);
  }
  const firstFrameWaitStatus = getAudioFirstFrameWaitStatus(now);
  if (firstFrameWaitStatus.waiting) {
    parts.push("等待音频首帧");
    parts.push(`已等待 ${firstFrameWaitStatus.ageSeconds}s`);
  } else {
    const stallStatus = getAudioStreamStallStatus(now);
    if (stallStatus.stalled) {
      parts.push("音频断流");
      parts.push(`最后收到 ${stallStatus.ageSeconds}s 前`);
    }
  }
  if (sampleCount >= 2) {
    parts.push(`平均间隔 ${averageGapMs} ms`);
    parts.push(`最大间隔 ${maxGapMs} ms`);
    if (remoteMediaGapStats.sampleCount >= 2) {
      parts.push(`远端音频平均间隔 ${remoteMediaGapStats.averageGapMs} ms`);
      parts.push(`远端音频最大间隔 ${remoteMediaGapStats.maxGapMs} ms`);
      if (remoteMediaGapStats.stutterCount > 0) {
        parts.push(`远端音频卡顿 ${remoteMediaGapStats.stutterCount}`);
        parts.push(`远端音频最大卡顿 ${remoteMediaGapStats.maxStutterGapMs} ms`);
      }
    }
    if (stutterCount > 0) {
      parts.push(`音频卡顿 ${stutterCount}`);
      parts.push(`最大音频卡顿 ${maxStutterGapMs} ms`);
    }
  }
  if (resyncCount > 0) parts.push(`重同步 ${resyncCount}`);
  if (underrunCount > 0) parts.push(`补缓冲 ${underrunCount}`);
  if (stablePrebufferCount > 0) parts.push(`稳缓冲 ${stablePrebufferCount}`);
  if (latencyTrimmedCount > 0) parts.push(`追实时 ${latencyTrimmedCount}`);
  if (visibilityRecoveryCount > 0) parts.push(`可见恢复 ${visibilityRecoveryCount}`);
  if (dropReason) parts.push(`原因 ${dropReason}`);
  if (state.audioLastError) {
    parts.push(`错误 ${String(state.audioLastError).replace(/\s+/g, " ").slice(0, 80)}`);
  }
  return parts.join(" · ");
}

function getFloatingControlExportStatus() {
  return {
    mode: state.monitorMode ? "监看小窗" : state.immersiveFullscreen ? "真全屏" : state.fullscreen ? "普通全屏" : "窗口",
    summary: elements.floatingControlSummary?.textContent?.trim() || "-",
    hint: elements.floatingFullscreenHint?.textContent?.trim() || "-",
    connection: formatFloatingConnectionStatus(),
    video: formatFloatingVideoStatus(),
    audio: formatFloatingAudioStatus(),
    clipboard: formatFloatingClipboardStatus(),
    input: formatFloatingInputModeStatus(),
    security: formatFloatingSecurityStatus(),
  };
}

function buildDiagnosticsQuickSummary({
  settings,
  currentStateLabel,
  connectionLabel,
  targetLabel,
  hostDiagnosticsExport,
  macReachabilityExport,
  reconnectExport,
  macAlertWatcherExport,
  localHostExport,
  remoteFileExport,
  remoteFileSuggestionExport,
  clipboardExport,
  clipboardCapabilitySuggestionExport,
  outgoingFileExport,
  outgoingFileSuggestionExport,
  videoExport,
  audioExport,
  videoPerformanceExport,
  audioPerformanceExport,
  floatingControlExport,
  inputExport,
}) {
  const reconnectParts = [reconnectExport.status];
  if (reconnectExport.reason && reconnectExport.reason !== "-") {
    reconnectParts.push(`原因 ${reconnectExport.reason}`);
  }
  if (reconnectExport.next && reconnectExport.next !== "-") {
    reconnectParts.push(`下次 ${reconnectExport.next}`);
  }
  if (reconnectExport.suggestion && reconnectExport.suggestion !== "-") {
    reconnectParts.push(`建议 ${reconnectExport.suggestion}`);
  }
  const heartbeatFreshness = macAlertWatcherExport.heartbeatFreshness;
  const heartbeatLine = heartbeatFreshness?.summary || heartbeatFreshness?.detail
    ? [`- Mac 心跳：${heartbeatFreshness.summary || heartbeatFreshness.detail}`]
    : [];
  return [
    `- 远端连接：${currentStateLabel} · ${connectionLabel} · ${targetLabel}`,
    `- Mac 主机：${hostDiagnosticsExport}`,
    `- Mac 值守：${macReachabilityExport.status}`,
    ...heartbeatLine,
    `- 重连：${reconnectParts.join(" · ")}`,
    `- 远端文件：${remoteFileExport.summary}`,
    ...(remoteFileSuggestionExport && remoteFileSuggestionExport !== "-" ? [`- 远端文件建议：${remoteFileSuggestionExport}`] : []),
    `- 剪贴板：${clipboardExport}`,
    ...(clipboardCapabilitySuggestionExport && clipboardCapabilitySuggestionExport !== "-"
      ? [`- 剪贴板能力建议：${clipboardCapabilitySuggestionExport}`]
      : []),
    ...(outgoingFileExport && outgoingFileExport !== "-" ? [`- 本机发送文件：${outgoingFileExport}`] : []),
    ...(outgoingFileSuggestionExport && outgoingFileSuggestionExport !== "-" ? [`- 本机发送建议：${outgoingFileSuggestionExport}`] : []),
    `- 视频：${videoExport}`,
    `- 现场视频：${videoPerformanceExport}`,
    `- 声音：${audioExport.summary}`,
    `- 现场声音：${audioPerformanceExport}`,
    `- 输入：${inputExport}`,
    `- 全屏浮层：${floatingControlExport.mode} · ${floatingControlExport.connection} · ${floatingControlExport.video}`,
    `- 本机协作：Mac 提醒 ${macAlertWatcherExport.status} · 本机被控 ${localHostExport.status} · 反控 ${localHostExport.reverseControlMode}`,
    `- 画质请求：${getResolutionExportLabel(settings)} · ${settings.fps} Hz · ${Math.round(settings.maxBandwidthKbps / 1000)} Mbps · 声音${settings.audio ? "开" : "关"}`,
  ];
}

function buildLogExportText() {
  const settings = currentDisplaySettings();
  const keyboardMapping = getKeyboardMapping();
  const currentStateLabel = connectionStates[state.connectionState]?.label ?? state.connectionState;
  const connectionLabel =
    elements.transportSelect.value === "websocket" ? "WebSocket 局域网" : "本地模拟";
  const hostForExport = state.activeHost || elements.hostInput.value.trim() || "-";
  const portForExport = state.activePort || elements.portInput.value.trim() || "-";
  const targetLabel = `${hostForExport}:${portForExport}`;
  const hostDiagnosticsExport = getHostDiagnosticsExportStatus();
  const reconnectExport = getReconnectExportStatus();
  const macAlertWatcherExport = getMacAlertWatcherExportStatus();
  const macReachabilityExport = getMacReachabilityExportStatus({
    targetLabel,
    reconnectExport,
    macAlertWatcherExport,
  });
  const localHostExport = getLocalHostExportStatus();
  const remoteFileExport = getRemoteFileTransferExportStatus();
  const remoteFileSuggestionExport = getRemoteFileTransferSuggestionExportStatus();
  const clipboardExport = getClipboardExportStatus();
  const clipboardCapabilitySuggestionExport = getClipboardCapabilitySuggestionExportStatus();
  const outgoingFileExport = getOutgoingFileTransferExportStatus();
  const outgoingFileSuggestionExport = getOutgoingFileTransferSuggestionExportStatus();
  const videoExport = getVideoExportStatus();
  const audioExport = getAudioExportStatus();
  const videoPerformanceExport = getVideoPerformanceExportStatus();
  const audioPerformanceExport = getAudioPerformanceExportStatus();
  const floatingControlExport = getFloatingControlExportStatus();
  const inputExport = getInputExportStatus();
  const resolutionLabel = getResolutionExportLabel(settings);
  const eventLines = state.logEntries
    .slice()
    .reverse()
    .map((entry, index) => {
      const detail = entry.detail ? ` | ${entry.detail}` : "";
      return `${String(index + 1).padStart(3, "0")} | ${entry.time} | ${entry.title}${detail}`;
    });
  const receivedFileLines = state.receivedClipboardFiles.map(
    (file, index) =>
      `${index + 1}. ${file.name} · ${formatBytes(file.size || 0)} · ${file.mimeType || "application/octet-stream"}`,
  );

  return [
    "LAN Dual Control Windows 控制端日志",
    `导出时间：${new Date().toISOString()}`,
    "",
    "快速摘要",
    ...buildDiagnosticsQuickSummary({
      settings,
      currentStateLabel,
      connectionLabel,
      targetLabel,
      hostDiagnosticsExport,
      macReachabilityExport,
      reconnectExport,
      macAlertWatcherExport,
      localHostExport,
      remoteFileExport,
      remoteFileSuggestionExport,
      clipboardExport,
      clipboardCapabilitySuggestionExport,
      outgoingFileExport,
      outgoingFileSuggestionExport,
      videoExport,
      audioExport,
      videoPerformanceExport,
      audioPerformanceExport,
      floatingControlExport,
      inputExport,
    }),
    "",
    "连接状态",
    `- 当前状态：${currentStateLabel}`,
    `- 状态详情：${elements.statusText.textContent}`,
    `- 当前方向：${getControlDirectionLabel(state.controlDirection)}`,
    `- 反控状态：${state.reverseStateDetail}`,
    `- 连接方式：${connectionLabel}`,
    `- 目标地址：${targetLabel}`,
    `- Mac 值守：${macReachabilityExport.status}`,
    `- Mac 值守说明：${macReachabilityExport.note}`,
    `- 重连状态：${reconnectExport.status}`,
    `- 重连原因：${reconnectExport.reason}`,
    `- 下次重连：${reconnectExport.next}`,
    `- 重连建议：${reconnectExport.suggestion}`,
    `- 协议版本：${protocolVersion}`,
    `- 主机诊断：${hostDiagnosticsExport}`,
    "",
    "本机协作",
    `- Mac 提醒：${macAlertWatcherExport.status}`,
    `- Mac 提醒详情：${macAlertWatcherExport.detail}`,
    `- Mac 提醒最近检查：${macAlertWatcherExport.checkedAt}`,
    `- Mac 心跳新鲜度：${macAlertWatcherExport.heartbeatFreshness?.detail || "-"}`,
    `- Mac 提醒自动轮询：约 ${macAlertWatcherExport.pollInterval}`,
    `- Mac 提醒联络板：${macAlertWatcherExport.server}`,
    `- 本机被控：${localHostExport.status}`,
    `- 本机被控徽标：${localHostExport.badge}`,
    `- 本机被控详情：${localHostExport.detail}`,
    `- 本机被控端口：${localHostExport.port}`,
    `- 本机被控画面：${localHostExport.screenMode}`,
    `- 本机被控声音：${localHostExport.audioMode}`,
    `- 本机被控输入：${localHostExport.inputMode}`,
    `- 本机被控反控策略：${localHostExport.reverseControlMode}`,
    `- 本机被控体检：${localHostExport.readinessProfile}；媒体基线 ${localHostExport.probeMedia}`,
    `- 本机被控最近输出：${localHostExport.outputSummary}`,
    `- 本机被控密码：不导出`,
    "",
    "显示与能力",
    `- 画质预设：${elements.qualityPresetSelect.selectedOptions[0]?.textContent ?? settings.qualityPreset}`,
    `- 显示模式：${settings.displayMode === "fullscreen" ? "全屏" : "窗口"}`,
    `- 显示器：${elements.displaySelect.selectedOptions[0]?.textContent ?? settings.displayId}`,
    `- 分辨率：${resolutionLabel}`,
    `- 缩放：${elements.scaleModeSelect.selectedOptions[0]?.textContent ?? settings.scaleMode}`,
    `- 刷新率：${settings.fps} Hz`,
    `- 码率：${Math.round(settings.maxBandwidthKbps / 1000)} Mbps`,
    `- 视频状态：${videoExport}`,
    `- 现场视频统计：${videoPerformanceExport}`,
    `- 声音：${settings.audio ? `开启 · ${settings.audioVolume}%` : "关闭"}`,
    `- 声音状态：${audioExport.summary}`,
    `- 现场声音统计：${audioPerformanceExport}`,
    `- 声音电平：${audioExport.level}`,
    `- 声音错误：${audioExport.error}`,
    `- 剪贴板：${settings.clipboard ? "开启" : "关闭"}`,
    `- 剪贴板状态：${clipboardExport}`,
    `- 剪贴板能力建议：${clipboardCapabilitySuggestionExport}`,
    `- 本机发送文件：${outgoingFileExport}`,
    `- 本机发送建议：${outgoingFileSuggestionExport}`,
    `- 全屏浮层模式：${floatingControlExport.mode}`,
    `- 全屏浮层摘要：${floatingControlExport.summary}`,
    `- 全屏浮层提示：${floatingControlExport.hint}`,
    `- 全屏浮层连接：${floatingControlExport.connection}`,
    `- 全屏浮层视频：${floatingControlExport.video}`,
    `- 全屏浮层声音：${floatingControlExport.audio}`,
    `- 全屏浮层剪贴板：${floatingControlExport.clipboard}`,
    `- 全屏浮层输入：${floatingControlExport.input}`,
    `- 全屏浮层安全：${floatingControlExport.security}`,
    `- 远端文件状态：${remoteFileExport.status}`,
    `- 远端文件建议：${remoteFileSuggestionExport}`,
    `- 正在接收远端文件：${remoteFileExport.active}`,
    `- 最近收到远端文件：${state.receivedClipboardFiles.length} 个`,
    `- 远端文件临时目录：${remoteFileExport.tempPath}`,
    `- 按键映射：Win→${remoteModifierLabels[keyboardMapping.win]}，Alt→${remoteModifierLabels[keyboardMapping.alt]}，Ctrl→${remoteModifierLabels[keyboardMapping.ctrl]}`,
    `- Windows 快捷键兼容：${elements.shortcutCompatToggle.checked ? "开启" : "关闭"}`,
    "",
    "运行统计",
    `- 输入事件：${inputExport}`,
    `- 视频帧：${state.videoFrames}`,
    `- 音频帧：${state.audioFrames}`,
    `- 重连次数：${state.reconnectAttempts}/${maxReconnectAttempts}`,
    `- 远端画面：${state.remoteFrameWidth} × ${state.remoteFrameHeight}`,
    "",
    "事件记录",
    ...(eventLines.length ? eventLines : ["暂无事件记录"]),
    "",
    "最近收到远端文件",
    ...(receivedFileLines.length ? receivedFileLines : ["暂无远端文件"]),
    "",
  ].join("\n");
}

function exportLogs() {
  try {
    const text = buildLogExportText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = makeLogFileName();
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    addLog("日志导出", link.download);
  } catch (error) {
    addLog("日志导出失败", error?.message || "当前环境不允许导出文件");
  }
}

async function writeTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      // Fall through to the textarea copy path for local file/browser preview contexts.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  try {
    const copied = document.execCommand?.("copy");
    if (!copied) throw new Error("copy command was rejected");
  } finally {
    textarea.remove();
  }
}

async function copyLogsToClipboard() {
  try {
    const text = buildLogExportText();
    await writeTextToClipboard(text);
    addLog("诊断复制", "已复制当前诊断报告");
    setFloatingCopyDiagnosticsFeedback("已复制");
  } catch (error) {
    addLog("诊断复制失败", error?.message || "当前环境不允许写入剪贴板");
    setFloatingCopyDiagnosticsFeedback("复制失败");
  }
}

function setFloatingCopyDiagnosticsFeedback(label) {
  if (!elements.floatingCopyDiagnosticsButton) return;
  if (state.copyDiagnosticsFeedbackTimer) {
    window.clearTimeout(state.copyDiagnosticsFeedbackTimer);
    state.copyDiagnosticsFeedbackTimer = null;
  }
  elements.floatingCopyDiagnosticsButton.textContent = label;
  state.copyDiagnosticsFeedbackTimer = window.setTimeout(() => {
    elements.floatingCopyDiagnosticsButton.textContent = "复制诊断";
    state.copyDiagnosticsFeedbackTimer = null;
  }, 1600);
}

function buildSessionOffer() {
  const settings = currentDisplaySettings();
  const [preferredWidth, preferredHeight] =
    settings.resolutionMode === "native"
      ? [0, 0]
      : [Number(settings.width), Number(settings.height)];

  return {
    type: "session_offer",
    protocolVersion,
    wantVideo: true,
    wantAudio: settings.audio,
    wantClipboardText: settings.clipboard,
    wantClipboardFile: settings.clipboard,
    maxFps: settings.fps,
    maxBandwidthKbps: settings.maxBandwidthKbps,
    qualityPreset: settings.qualityPreset,
    displayMode: settings.displayMode,
    displayId: settings.displayId,
    preferredWidth,
    preferredHeight,
    preferredVideoCodec: preferredVideoCodec(),
    preferredVideoEncoding: preferredVideoEncoding(),
    preferredAudioCodec: "pcm-f32le",
    audioVolume: settings.audioVolume,
    mockScenario: elements.mockScenarioSelect.value,
  };
}

function supportsWebCodecsH264() {
  return typeof window.VideoDecoder === "function" && typeof window.EncodedVideoChunk === "function";
}

function preferredVideoCodec() {
  if (state.h264FallbackActive) {
    return "mjpeg";
  }
  return supportsWebCodecsH264() ? "h264" : "mjpeg";
}

function preferredVideoEncoding() {
  return preferredVideoCodec() === "h264" ? "annexb" : "data-url";
}

function buildDisplaySettingsMessage() {
  const settings = currentDisplaySettings();
  const fixedResolution =
    settings.resolutionMode === "native"
      ? {}
      : {
          width: Number(settings.width),
          height: Number(settings.height),
        };

  return {
    qualityPreset: settings.qualityPreset,
    displayMode: settings.displayMode,
    displayId: settings.displayId,
    resolutionMode: settings.resolutionMode,
    fps: settings.fps,
    maxBandwidthKbps: settings.maxBandwidthKbps,
    preferredVideoCodec: preferredVideoCodec(),
    preferredVideoEncoding: preferredVideoEncoding(),
    audio: settings.audio,
    audioVolume: settings.audioVolume,
    clipboardText: settings.clipboard,
    clipboardFile: settings.clipboard,
    scaleMode: settings.scaleMode,
    ...fixedResolution,
  };
}

function createTransport() {
  return elements.transportSelect.value === "websocket"
    ? new WebSocketTransport()
    : new LocalMockTransport();
}

async function connect({ reconnect = false } = {}) {
  const host = elements.hostInput.value.trim();
  const port = elements.portInput.value.trim();
  const password = elements.passwordInput.value;

  if (!host || !port || !password) {
    const message = "目标地址、端口和密码都要填写";
    if (reconnect) {
      setUiDisconnected("连接失败", message);
    }
    addLog("连接失败", message);
    return;
  }

  const transportLabel =
    elements.transportSelect.value === "websocket" ? "WebSocket 局域网" : "本地模拟";
  state.manualDisconnect = false;
  state.activeHost = host;
  state.activePort = port;
  savePreferences();
  if (reconnect) {
    state.connected = false;
    state.connecting = true;
    setConnectionState(
      "reconnecting",
      `正在自动重连 ${host}:${port}（${state.reconnectAttempts}/${maxReconnectAttempts}）`,
    );
    elements.connectButton.disabled = true;
    elements.disconnectButton.disabled = false;
    elements.reverseButton.disabled = true;
    updateFileClipboardButton();
  } else {
    state.reconnectAttempts = 0;
    clearReconnectTimers();
    setUiConnecting(host, port);
  }
  addLog(reconnect ? "执行重连" : "开始连接", `${transportLabel} · ${host}:${port}`);

  const discoveredDevice = await probeConnectionDiagnostics(host, port, elements.transportSelect.value);
  if (discoveredDevice?.runtime || discoveredDevice?.capabilities?.maxScreenFps) {
    updateHostDiagnostics({
      runtime: discoveredDevice?.runtime,
      maxScreenFps: normalizeRemoteMaxScreenFps(discoveredDevice?.capabilities?.maxScreenFps),
    });
  }

  const client = new ProtocolClient({
    transport: createTransport(),
    onState: setConnectionState,
    onMessage: handleProtocolMessage,
    onClose: () => {
      if (state.client !== client) return;
      handleUnexpectedClose("被控端关闭了连接");
    },
  });
  state.client = client;

  try {
    addLog("发送 hello", "Windows 控制端");
    addLog("发送会话参数", describeDisplaySettings());
    const answer = await client.connect({
      host,
      port,
      password,
      sessionOffer: buildSessionOffer(),
    });
    if (!normalizeHostRuntime(answer.runtime) && discoveredDevice?.runtime) {
      answer.runtime = discoveredDevice.runtime;
    }
    setUiConnected(answer);
    void startW14NativeReceiverForConnection({ host, port, password });
    rememberCurrentConnection();
    addLog(
      "连接成功",
      `${answer.videoCodec} · ${answer.fps} Hz · ${Math.round(answer.maxBandwidthKbps / 1000)} Mbps`,
    );
  } catch (error) {
    client.disconnect();
    if (state.client === client) {
      state.client = null;
    }
    const message = getErrorMessage(error);
    if (reconnect && !state.manualDisconnect && shouldRetryConnection(error)) {
      scheduleReconnect(message);
      return;
    }
    if (reconnect && !state.manualDisconnect && !shouldRetryConnection(error)) {
      addLog("停止重连", "认证失败，请确认连接密码后手动连接");
    }
    setUiDisconnected("连接失败", message);
    elements.remoteStatusText.textContent = message;
    addLog("连接失败", message);
  }
}

function disconnect() {
  if (!state.connected && !state.connecting && !state.reconnectTimer) {
    return;
  }

  state.manualDisconnect = true;
  clearReconnectTimers();
  if (state.client) {
    state.client.disconnect();
    state.client = null;
  }
  setUiDisconnected();
}

function describeDisplaySettings() {
  const settings = currentDisplaySettings();
  return `${settings.displayMode === "fullscreen" ? "全屏" : "窗口"} · ${elements.metricResolution.textContent} · ${settings.fps} Hz · ${elements.bandwidthSelect.value} Mbps`;
}

function applyScaleMode() {
  elements.remoteCanvas.classList.toggle("scale-fit", elements.scaleModeSelect.value === "fit");
  elements.remoteCanvas.classList.toggle(
    "scale-original",
    elements.scaleModeSelect.value === "original",
  );
  elements.remoteCanvas.classList.toggle(
    "scale-stretch",
    elements.scaleModeSelect.value === "stretch",
  );

  if (elements.scaleModeSelect.value === "original") {
    elements.remoteFrameImage.style.width = `${state.remoteFrameWidth}px`;
    elements.remoteFrameImage.style.height = `${state.remoteFrameHeight}px`;
    elements.remoteVideoCanvas.style.width = `${state.remoteFrameWidth}px`;
    elements.remoteVideoCanvas.style.height = `${state.remoteFrameHeight}px`;
  } else {
    elements.remoteFrameImage.style.removeProperty("width");
    elements.remoteFrameImage.style.removeProperty("height");
    elements.remoteVideoCanvas.style.removeProperty("width");
    elements.remoteVideoCanvas.style.removeProperty("height");
  }
}

function getDisplayedFrameRect() {
  const canvasRect = elements.remoteCanvas.getBoundingClientRect();
  return computeDisplayedFrameRect({
    canvasLeft: canvasRect.left,
    canvasTop: canvasRect.top,
    canvasWidth: elements.remoteCanvas.clientWidth,
    canvasHeight: elements.remoteCanvas.clientHeight,
    scrollLeft: elements.remoteCanvas.scrollLeft,
    scrollTop: elements.remoteCanvas.scrollTop,
    frameWidth: state.remoteFrameWidth,
    frameHeight: state.remoteFrameHeight,
    scaleMode: elements.scaleModeSelect.value,
  });
}

function mapPointerToRemote(event) {
  const frameRect = getDisplayedFrameRect();
  return mapClientPointToRemote({
    clientX: event.clientX,
    clientY: event.clientY,
    frameRect,
    remoteFrameWidth: state.remoteFrameWidth,
    remoteFrameHeight: state.remoteFrameHeight,
  });
}

function rememberRemotePointer(mapped) {
  if (!mapped) return;
  state.lastRemotePointer = {
    x: mapped.x,
    y: mapped.y,
    remoteX: mapped.remoteX,
    remoteY: mapped.remoteY,
    frameRect: mapped.frameRect,
  };
}

function getMappedPointerForRelease(event) {
  const mapped = mapPointerToRemote(event);
  if (mapped) {
    rememberRemotePointer(mapped);
    return mapped;
  }
  if (state.remotePointerButtonsDown.has(event.button) && state.lastRemotePointer) {
    return state.lastRemotePointer;
  }
  return null;
}

function handlePointerOutsideFrame(action) {
  elements.cursorDot.classList.add("is-hidden");
  const now = Date.now();
  if (now - state.pointerOutsideFrameNoticeAt < 800) {
    return;
  }
  state.pointerOutsideFrameNoticeAt = now;
  elements.remoteStatusText.textContent = "黑边区域不会发送远控输入";
  if (action === "down" || action === "wheel") {
    addLog("输入忽略", "指针位于远端画面黑边区域");
  }
}

function getMouseButtonName(button) {
  if (button === 0) return "left";
  if (button === 1) return "middle";
  if (button === 2) return "right";
  return "unknown";
}

function sendDisplaySettings() {
  updateMetrics();
  applyScaleMode();
  savePreferences();
  const client = state.client;
  if (!state.connected || !client) {
    return;
  }

  const canSendDisplaySettings = typeof client.sendDisplaySettings === "function";
  const canSendAudioSettings = typeof client.sendAudioSettings === "function";
  if (!canSendDisplaySettings && !canSendAudioSettings) {
    return;
  }

  if (canSendDisplaySettings) {
    client.sendDisplaySettings(buildDisplaySettingsMessage());
  }
  if (canSendAudioSettings) {
    client.sendAudioSettings(buildAudioSettingsMessage());
  }
  addLog("更新显示设置", describeDisplaySettings());
}

function setFullscreen(enabled) {
  if (!enabled && state.immersiveFullscreen) {
    void exitDocumentFullscreen();
    state.immersiveFullscreen = false;
  }
  if (enabled && state.monitorMode) {
    setMonitorMode(false);
  }
  state.fullscreen = enabled;
  document.querySelector(".app-shell").classList.toggle("is-fullscreen", enabled);
  elements.fullscreenButton.classList.toggle("active", enabled);
  elements.windowModeButton.classList.toggle("active", !enabled);
  syncFloatingControlCenter();
  if (enabled) {
    showFullscreenHint();
  } else {
    hideFullscreenHint();
  }
  sendDisplaySettings();
}

function clearMonitorModePosition() {
  const surface = document.querySelector(".remote-surface");
  if (!surface) return;
  for (const property of ["left", "top", "right", "bottom", "width", "height"]) {
    surface.style.removeProperty(property);
  }
}

function formatMonitorModeStatus() {
  const source = [state.localMacAlertWatcherFindingText, elements.localMacAlertWatcherStatusText?.textContent || ""].join(" ");
  const attention = parseMacUnattendedAttention(source);
  const parts = [
    "只监看",
    formatFloatingConnectionStatus().replace(/^连接：/, ""),
    formatFloatingVideoStatus().replace(/^视频：/, ""),
    formatFloatingInputModeStatus().replace(/^输入：/, ""),
  ].filter(Boolean);
  if (attention.summary) {
    parts.push(`提醒：${attention.summary}`);
  }
  return compactExportStatusText(parts.join(" · "), 260);
}

function updateMonitorModeStatus() {
  if (elements.monitorModeStatus) {
    elements.monitorModeStatus.textContent = formatMonitorModeStatus();
  }
}

function setMonitorMode(enabled) {
  if (enabled && (state.fullscreen || state.immersiveFullscreen)) {
    setFullscreen(false);
  }
  state.monitorMode = Boolean(enabled);
  document.querySelector(".app-shell")?.classList.toggle("is-monitor-mode", state.monitorMode);
  elements.monitorModeButton?.classList.toggle("active", state.monitorMode);
  if (elements.monitorModeBar) {
    elements.monitorModeBar.hidden = !state.monitorMode;
  }
  if (state.monitorMode) {
    setControlCenterOpen(false);
    hideFullscreenHint();
    elements.remoteCanvas?.blur();
    addLog("监看小窗", "已进入只监看模式");
  } else {
    clearMonitorModePosition();
    state.monitorModeDrag = null;
    addLog("监看小窗", "已恢复主窗口");
  }
  updateInputStatus();
  syncFloatingControlCenter();
  updateMonitorModeStatus();
}

function startMonitorModeDrag(event) {
  if (!state.monitorMode || event.button !== 0) return;
  const surface = document.querySelector(".remote-surface");
  if (!surface) return;
  const rect = surface.getBoundingClientRect();
  state.monitorModeDrag = {
    startX: event.clientX,
    startY: event.clientY,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
  surface.style.left = `${rect.left}px`;
  surface.style.top = `${rect.top}px`;
  surface.style.right = "auto";
  surface.style.bottom = "auto";
  surface.style.width = `${rect.width}px`;
  surface.style.height = `${rect.height}px`;
  event.preventDefault();
}

function moveMonitorModeWindow(event) {
  if (!state.monitorModeDrag) return;
  const surface = document.querySelector(".remote-surface");
  if (!surface) return;
  const drag = state.monitorModeDrag;
  const nextLeft = Math.max(8, Math.min(window.innerWidth - drag.width - 8, drag.left + event.clientX - drag.startX));
  const nextTop = Math.max(8, Math.min(window.innerHeight - drag.height - 8, drag.top + event.clientY - drag.startY));
  surface.style.left = `${nextLeft}px`;
  surface.style.top = `${nextTop}px`;
}

function stopMonitorModeDrag() {
  state.monitorModeDrag = null;
}

function modifierFlags(modifiers = []) {
  return {
    ctrlKey: modifiers.includes("ctrl"),
    altKey: modifiers.includes("alt"),
    shiftKey: modifiers.includes("shift"),
    metaKey: modifiers.includes("meta"),
  };
}

async function sendFloatingShortcut() {
  const shortcutKey = elements.floatingShortcutSelect?.value || "copy";
  const shortcut = floatingShortcutActions[shortcutKey] || floatingShortcutActions.copy;
  if (!canSendControlInput()) {
    elements.remoteStatusText.textContent = "连接后可发送远程快捷键";
    addLog("快捷键", "当前未连接或控制方向已切换，未发送");
    syncFloatingControlStatus();
    return;
  }
  if (shortcut.syncClipboard) {
    await syncClipboardBeforePaste();
  }

  const flags = modifierFlags(shortcut.modifiers);
  registerInputEvent("快捷键", `${shortcut.label} · ${shortcut.modifiers.join("+")}+${shortcut.key}`, {
    event: "key",
    action: "key",
    key: shortcut.key,
    code: shortcut.code,
    repeat: false,
    ...flags,
    modifiers: shortcut.modifiers,
    remoteModifiers: shortcut.modifiers,
    keyboardMapping: getKeyboardMapping(),
    shortcutProfile: "toolbar",
    shortcutAction: shortcutKey,
    localKey: shortcut.key,
    localCode: shortcut.code,
    localCtrlKey: false,
    localAltKey: false,
    localShiftKey: false,
    localMetaKey: false,
  });
}

function registerInputEvent(kind, detail, eventPayload = {}) {
  if (!canSendControlInput()) {
    return;
  }

  state.inputEvents += 1;
  updateInputStatus();

  if (state.client) {
    state.client.sendInputEvent({
      kind,
      detail,
      sequence: state.inputEvents,
      ...eventPayload,
    });
  }

  if (state.inputEvents <= 8 || state.inputEvents % 10 === 0) {
    addLog(kind, detail);
  }
}

function updateCursor(event) {
  if (!canSendControlInput()) {
    return;
  }

  const mapped = mapPointerToRemote(event);
  if (!mapped) {
    handlePointerOutsideFrame("move");
    return;
  }
  rememberRemotePointer(mapped);
  elements.cursorDot.classList.remove("is-hidden");

  const canvasRect = elements.remoteCanvas.getBoundingClientRect();
  elements.cursorDot.style.left = `${((event.clientX - canvasRect.left + elements.remoteCanvas.scrollLeft) / elements.remoteCanvas.scrollWidth) * 100}%`;
  elements.cursorDot.style.top = `${((event.clientY - canvasRect.top + elements.remoteCanvas.scrollTop) / elements.remoteCanvas.scrollHeight) * 100}%`;
  registerInputEvent(
    "鼠标移动",
    `x=${mapped.x.toFixed(3)}, y=${mapped.y.toFixed(3)} · ${mapped.remoteX},${mapped.remoteY}`,
    {
      event: "mouse_move",
      pointerType: "mouse",
      action: "move",
      x: mapped.x,
      y: mapped.y,
      remoteX: mapped.remoteX,
      remoteY: mapped.remoteY,
      scaleMode: elements.scaleModeSelect.value,
    },
  );
}

function makeClipboardId() {
  state.clipboardSequence += 1;
  return `clip-${Date.now().toString(16)}-${state.clipboardSequence}`;
}

function makeFileTransferId() {
  state.fileTransferSequence += 1;
  return `file-${Date.now().toString(16)}-${state.fileTransferSequence}`;
}

function makeReverseRequestId() {
  return `reverse-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 8)}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function makeSafeDownloadName(name, index) {
  return normalizeRemoteFileName(name, index).replace(/^\.+/, "") || `clipboard-${index + 1}`;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return window.btoa(binary);
}

function base64ToUint8Array(base64) {
  const binary = window.atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function yieldToUi() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function readLocalClipboardText() {
  if (!navigator.clipboard?.readText) {
    throw new Error("当前环境不允许读取系统剪贴板，请在桌面版或 localhost 页面中使用");
  }
  return navigator.clipboard.readText();
}

function getClipboardBlobFileName(mimeType, index) {
  const extensionMap = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "application/zip": "zip",
    "application/x-zip-compressed": "zip",
  };
  const extension = extensionMap[mimeType] ?? "bin";
  return `clipboard-${Date.now().toString(16)}-${index + 1}.${extension}`;
}

async function readBrowserClipboardFiles() {
  if (!navigator.clipboard?.read || typeof File === "undefined") {
    return {
      files: [],
      reason: "浏览器剪贴板没有提供可读取的文件。",
    };
  }

  try {
    const items = await navigator.clipboard.read();
    const files = [];
    for (const item of items) {
      const fileTypes = item.types.filter((type) => !type.startsWith("text/"));
      for (const type of fileTypes) {
        const blob = await item.getType(type);
        if (!blob || blob.size === 0) {
          continue;
        }
        files.push(new File([blob], getClipboardBlobFileName(type, files.length), {
          type,
          lastModified: Date.now(),
        }));
      }
    }
    return { files, reason: "" };
  } catch (error) {
    return {
      files: [],
      reason: error?.message || "读取文件剪贴板失败，后续接入桌面原生模块。",
    };
  }
}

function parseNativeClipboardLastModified(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function makeNativeClipboardFile(meta, transferId, invoke) {
  const index = Number(meta.index ?? 0);
  const size = Math.max(0, Number(meta.size ?? 0));
  const mimeType = String(meta.mimeType || "application/octet-stream");
  return {
    name: String(meta.name || `clipboard-${index + 1}`),
    size,
    type: mimeType,
    lastModified: parseNativeClipboardLastModified(meta.lastModified),
    slice(start = 0, end = size) {
      const offset = Math.max(0, Number(start) || 0);
      const cappedEnd = Math.min(size, Math.max(offset, Number(end) || 0));
      const length = cappedEnd - offset;
      return {
        size: length,
        type: mimeType,
        async arrayBuffer() {
          const result = await invoke("read_clipboard_file_chunk", {
            payload: {
              transferId,
              fileIndex: index,
              offset,
              length,
            },
          });
          return base64ToUint8Array(result?.dataBase64 || "").buffer;
        },
      };
    },
  };
}

async function readNativeClipboardFiles() {
  const invoke = getTauriInvoke();
  if (!invoke) {
    return {
      files: [],
      reason: "文件剪贴板自动同步需要桌面原生模块，当前可先用“发送文件”按钮。",
    };
  }

  try {
    const result = await invoke("begin_clipboard_file_read");
    const transferId = String(result?.transferId || "");
    const metas = Array.isArray(result?.files) ? result.files : [];
    if (!transferId || metas.length === 0) {
      return {
        files: [],
        reason: result?.reason || "系统剪贴板里没有可发送的文件。",
      };
    }

    return {
      files: metas.map((meta, index) => makeNativeClipboardFile({ index, ...meta }, transferId, invoke)),
      reason: "",
      async cleanup() {
        await invoke("cancel_clipboard_file_read", {
          payload: { transferId },
        });
      },
    };
  } catch (error) {
    return {
      files: [],
      reason: error?.message || "读取系统文件剪贴板失败。",
    };
  }
}

async function readLocalClipboardFiles() {
  const browserResult = await readBrowserClipboardFiles();
  if (browserResult.files.length > 0) {
    return browserResult;
  }

  const nativeResult = await readNativeClipboardFiles();
  if (nativeResult.files.length > 0) {
    return nativeResult;
  }

  return {
    files: [],
    reason: nativeResult.reason || browserResult.reason,
  };
}

async function cleanupLocalClipboardFiles(clipboardFiles) {
  if (typeof clipboardFiles?.cleanup !== "function") {
    return;
  }
  try {
    await clipboardFiles.cleanup();
  } catch (error) {
    addLog("文件剪贴板", error?.message || "清理本机文件剪贴板读取状态失败");
  }
}

async function writeLocalClipboardText(text) {
  if (!navigator.clipboard?.writeText) {
    throw new Error("当前环境不允许写入系统剪贴板");
  }
  await navigator.clipboard.writeText(text);
}

async function syncClipboardText({ quietNoText = false } = {}) {
  if (!state.connected || !elements.clipboardToggle.checked) {
    return false;
  }

  try {
    const text = await readLocalClipboardText();
    if (!text) {
      if (!quietNoText) {
        elements.clipboardText.textContent = "剪贴板：没有可同步的文字";
        syncFloatingControlStatus();
        addLog("剪贴板", "本机剪贴板没有文字内容");
      }
      return false;
    }

    const clipboardId = makeClipboardId();
    elements.clipboardText.textContent = `剪贴板：已发送 ${text.length} 字`;
    syncFloatingControlStatus();
    if (state.client) {
      state.client.sendClipboardText(text, {
        clipboardId,
        direction: "client_to_host",
      });
    }
    addLog("剪贴板", `已发送文字 ${text.length} 字`);
    return true;
  } catch (error) {
    const message = error?.message || "剪贴板读取失败";
    elements.clipboardText.textContent = "剪贴板：同步失败";
    syncFloatingControlStatus();
    addLog("剪贴板失败", message);
    return false;
  }
}

async function syncClipboardBeforePaste() {
  if (!state.connected) {
    state.localClipboardStatusText = "剪贴板：请先连接被控端";
    elements.clipboardText.textContent = state.localClipboardStatusText;
    syncFloatingControlStatus();
    addLog("剪贴板", "未连接，无法同步剪贴板");
    return;
  }

  if (!elements.clipboardToggle.checked) {
    state.localClipboardStatusText = "剪贴板：已关闭";
    elements.clipboardText.textContent = state.localClipboardStatusText;
    syncFloatingControlStatus();
    addLog("剪贴板", "剪贴板同步已关闭");
    return;
  }

  const clipboardFiles = await readLocalClipboardFiles();
  if (clipboardFiles.files.length > 0) {
    try {
      await sendFilesToRemote(clipboardFiles.files, { sourceLabel: "文件剪贴板" });
    } finally {
      await cleanupLocalClipboardFiles(clipboardFiles);
    }
    return;
  }

  const sentText = await syncClipboardText({ quietNoText: true });
  if (!sentText && clipboardFiles.reason) {
    state.localClipboardStatusText = `剪贴板：${clipboardFiles.reason}`;
    elements.clipboardText.textContent = state.localClipboardStatusText;
    syncFloatingControlStatus();
    addLog("文件剪贴板", clipboardFiles.reason);
  }
}

async function sendFilesToRemote(files, { sourceLabel = "文件剪贴板", clearFileInput = false } = {}) {
  if (!state.connected || !state.client) {
    state.localClipboardStatusText = "剪贴板：请先连接被控端";
    elements.clipboardText.textContent = state.localClipboardStatusText;
    syncFloatingControlStatus();
    addLog(sourceLabel, "未连接，无法发送文件");
    return;
  }

  if (!elements.clipboardToggle.checked) {
    state.localClipboardStatusText = "剪贴板：已关闭";
    elements.clipboardText.textContent = state.localClipboardStatusText;
    syncFloatingControlStatus();
    addLog(sourceLabel, "剪贴板同步已关闭");
    return;
  }

  if (files.length === 0) {
    state.localClipboardStatusText = "剪贴板：未选择文件";
    elements.clipboardText.textContent = state.localClipboardStatusText;
    syncFloatingControlStatus();
    addLog(sourceLabel, "未选择文件，未发送");
    return;
  }

  state.localClipboardStatusText = "";
  const diagnostics = state.hostDiagnostics || {};
  if (isClipboardCapabilityUnavailable(diagnostics.clipboardFile, diagnostics.clipboardFileMode)) {
    const message = "对端文件剪贴板不可用；文件/压缩包不能直接复制粘贴，请检查被控端文件剪贴板能力，或暂时使用远端文件托盘/临时目录。";
    state.localClipboardStatusText = `剪贴板：${message}`;
    elements.clipboardText.textContent = state.localClipboardStatusText;
    syncFloatingControlStatus();
    addLog(`${sourceLabel}未发送`, message);
    return;
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > maxClipboardFileBytes) {
    const message = `文件总大小 ${formatBytes(totalBytes)}，超过当前上限 ${formatBytes(maxClipboardFileBytes)}`;
    state.localClipboardStatusText = `剪贴板：文件过大；${message}`;
    elements.clipboardText.textContent = state.localClipboardStatusText;
    syncFloatingControlStatus();
    addLog(sourceLabel, message);
    if (clearFileInput) elements.fileClipboardInput.value = "";
    return;
  }

  const transferId = makeFileTransferId();
  const fileMetas = files.map((file, index) => ({
    index,
    name: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
    lastModified: file.lastModified,
  }));

  let sentBytes = 0;
  const startedAt = Date.now();
  let transferSucceeded = false;
  state.fileTransferActive = true;
  state.lastOutgoingFileTransfer = null;
  state.outgoingFileTransfer = {
    transferId,
    totalBytes,
    sentBytes: 0,
    fileCount: files.length,
    files: fileMetas,
    startedAt,
    lastActivityAt: startedAt,
    rateSamples: [],
    canRetry: clearFileInput && (elements.fileClipboardInput.files?.length || 0) > 0,
    clearOnRemoteAccept: Boolean(clearFileInput),
  };
  updateFileClipboardButton();
  elements.clipboardText.textContent = `剪贴板：准备发送 ${files.length} 个文件`;
  syncFloatingControlStatus();

  try {
    state.client.sendClipboardFileOffer({
      transferId,
      direction: "client_to_host",
      totalBytes,
      fileCount: files.length,
      maxChunkBytes: fileChunkSizeBytes,
      files: fileMetas,
    });
    addLog(sourceLabel, `开始发送 ${files.length} 个文件，共 ${formatBytes(totalBytes)}`);
    await yieldToUi();
    if (isOutgoingFileTransferRejected(transferId)) {
      return;
    }

    for (const [fileIndex, file] of files.entries()) {
      let chunkIndex = 0;
      for (let offset = 0; offset < file.size; offset += fileChunkSizeBytes) {
        if (isOutgoingFileTransferRejected(transferId)) {
          return;
        }
        const chunk = file.slice(offset, Math.min(offset + fileChunkSizeBytes, file.size));
        const dataBase64 = arrayBufferToBase64(await chunk.arrayBuffer());
        if (isOutgoingFileTransferRejected(transferId)) {
          return;
        }
        const nextSentBytes = sentBytes + chunk.size;
        state.client.sendClipboardFileChunk({
          transferId,
          fileIndex,
          fileName: file.name,
          chunkIndex,
          offset,
          bytes: chunk.size,
          sentBytes: nextSentBytes,
          totalBytes,
          encoding: "base64",
          dataBase64,
        });
        if (isOutgoingFileTransferRejected(transferId)) {
          return;
        }
        sentBytes = nextSentBytes;
        if (state.outgoingFileTransfer?.transferId === transferId) {
          recordRemoteFileTransferRateSample(state.outgoingFileTransfer, chunk.size);
          state.outgoingFileTransfer.sentBytes = sentBytes;
        }
        chunkIndex += 1;
        elements.clipboardText.textContent = `剪贴板：${describeOutgoingFileTransferStatus(state.outgoingFileTransfer)}`;
        syncFloatingControlStatus();
        if (chunkIndex % 8 === 0) {
          await yieldToUi();
          if (isOutgoingFileTransferRejected(transferId)) {
            return;
          }
        }
      }
    }

    state.client.sendClipboardFileComplete({
      transferId,
      totalBytes,
      fileCount: files.length,
    });
    transferSucceeded = true;
    state.lastOutgoingFileTransfer = {
      ...(state.outgoingFileTransfer || {}),
      transferId,
      status: "sent",
      totalBytes,
      sentBytes,
      fileCount: files.length,
      files: fileMetas,
      completedAt: Date.now(),
      lastActivityAt: Date.now(),
      rateSamples: Array.isArray(state.outgoingFileTransfer?.rateSamples)
        ? [...state.outgoingFileTransfer.rateSamples]
        : [],
      canRetry: clearFileInput && (elements.fileClipboardInput.files?.length || 0) > 0,
      clearOnRemoteAccept: Boolean(clearFileInput),
    };
    elements.clipboardText.textContent = `剪贴板：文件已发送 ${formatBytes(sentBytes)}，等待对端确认`;
    syncFloatingControlStatus();
    addLog(sourceLabel, `文件块发送完成，等待对端确认 · ${transferId}`);
  } catch (error) {
    const message = error?.message || "文件发送失败";
    const failedAt = Date.now();
    const activeTransfer = state.outgoingFileTransfer || {};
    state.lastOutgoingFileTransfer = {
      ...activeTransfer,
      transferId,
      status: "failed",
      totalBytes,
      sentBytes,
      fileCount: files.length,
      files: fileMetas,
      error: message,
      failedAt,
      lastActivityAt: Number(activeTransfer.lastActivityAt) || failedAt,
      rateSamples: Array.isArray(activeTransfer.rateSamples) ? [...activeTransfer.rateSamples] : [],
      canRetry: clearFileInput && (elements.fileClipboardInput.files?.length || 0) > 0,
    };
    elements.clipboardText.textContent = `剪贴板：${describeLastOutgoingFileTransferStatus(state.lastOutgoingFileTransfer)}`;
    syncFloatingControlStatus();
    addLog(`${sourceLabel}失败`, message);
  } finally {
    state.fileTransferActive = false;
    state.outgoingFileTransfer = null;
    if (clearFileInput && transferSucceeded && !state.lastOutgoingFileTransfer?.clearOnRemoteAccept) {
      elements.fileClipboardInput.value = "";
    }
    updateFileClipboardButton();
    syncFloatingControlStatus();
  }
}

async function sendClipboardFiles() {
  const files = Array.from(elements.fileClipboardInput.files ?? []);
  await sendFilesToRemote(files, { sourceLabel: "文件剪贴板", clearFileInput: true });
}

async function handleFileClipboardButtonClick() {
  if (elements.fileClipboardButton.disabled) return;
  if (canRetryLastOutgoingFileTransfer()) {
    await sendClipboardFiles();
    return;
  }
  elements.fileClipboardInput.click();
}

function getTauriInvoke() {
  return window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || null;
}

function resetW8NativeVideoState() {
  state.w8NativeVideoSessionStarted = false;
  state.w8NativeVideoSessionPromise = null;
  state.w8NativeVideoPushPromise = null;
  state.w8NativeVideoFramesPushed = 0;
  state.w8NativeVideoDroppedFrames = 0;
  state.w8NativeVideoHasDecoderConfig = false;
  state.w8NativeVideoCodecString = "";
  state.w8NativeVideoNativeNalTypes = "";
  state.w8NativeVideoNativeHasSps = false;
  state.w8NativeVideoNativeHasPps = false;
  state.w8NativeVideoNativeHasIdr = false;
  state.w8NativeVideoNativeIsKeyframe = false;
  state.w8NativeVideoNativeKeyFrames = 0;
  state.w8NativeVideoNativeSpsCount = 0;
  state.w8NativeVideoNativePpsCount = 0;
  state.w8NativeVideoNativeIdrCount = 0;
  state.w8NativeVideoNativeByteLen = 0;
  state.w8NativeVideoDecoderProbePromise = null;
  state.w8NativeVideoDecoderReady = false;
  state.w8NativeVideoDecoderMode = "";
  state.w8NativeVideoDecoderReason = "";
  state.w8NativeVideoD3dFeatureLevel = "";
  state.w8NativeVideoDecoderInitReady = false;
  state.w8NativeVideoDecoderInitMode = "";
  state.w8NativeVideoDecoderInitReason = "";
  state.w8NativeVideoDecoderInitOutputSubtypes = "";
  state.w8NativeVideoDecodeStepReady = false;
  state.w8NativeVideoDecodeStepMode = "";
  state.w8NativeVideoDecodeStepReason = "";
  state.w8NativeVideoDecodeStepStatus = "";
  state.w8NativeVideoDecoderSessionActive = false;
  state.w8NativeVideoDecoderSessionMode = "";
  state.w8NativeVideoDecoderSessionReason = "";
  state.w8NativeVideoDecoderSessionStatus = "";
  state.w8NativeVideoDecoderSessionOutputSubtype = "";
  state.w8NativeVideoDecoderSessionSubmittedFrames = 0;
  state.w8NativeVideoDecoderSessionAcceptedInputFrames = 0;
  state.w8NativeVideoDecoderSessionDecodedFrames = 0;
  state.w8NativeVideoDecoderSessionWorkerThread = false;
  state.w8NativeVideoDecoderSessionWorkerMode = "";
  state.w8NativeVideoDecoderSessionWorkerStatus = "";
  state.w8NativeVideoFrameHandoffActive = false;
  state.w8NativeVideoFrameHandoffMode = "";
  state.w8NativeVideoFrameHandoffStatus = "";
  state.w8NativeVideoLatestFrameFormat = "";
  state.w8NativeVideoLatestFrameBytes = 0;
  state.w8NativeVideoLatestFrameId = null;
  state.w8NativeVideoLatestFrameUpdatedAtMs = 0;
  state.w8NativeVideoNativeSurfaceReady = false;
  state.w8NativeVideoNativeSurfaceMode = "";
  state.w8NativeVideoNativeSurfaceStatus = "";
  state.w8NativeVideoNativeSurfaceFormat = "";
  state.w8NativeVideoNativeSurfaceWidth = 0;
  state.w8NativeVideoNativeSurfaceHeight = 0;
  state.w8NativeVideoNativeSurfaceReason = "";
  state.w8NativeVideoNativeSurfaceCopyStatus = "";
  state.w8NativeVideoNativeSurfaceCopyBytes = 0;
  state.w8NativeVideoNativeSurfacePresentedFrames = 0;
  state.w8NativeVideoNativeSurfaceLastFrameId = null;
  state.w8NativeVideoNativeSurfaceUpdatedAtMs = 0;
  state.w8NativeVideoNativePresentReady = false;
  state.w8NativeVideoNativePresentMode = "";
  state.w8NativeVideoNativePresentStatus = "";
  state.w8NativeVideoNativePresentFormat = "";
  state.w8NativeVideoNativePresentWidth = 0;
  state.w8NativeVideoNativePresentHeight = 0;
  state.w8NativeVideoNativePresentFrames = 0;
  state.w8NativeVideoNativePresentLastFrameId = null;
  state.w8NativeVideoNativePresentUpdatedAtMs = 0;
  state.w8NativeVideoFreshnessStatus = "";
  state.w8NativeVideoPresentFrameLag = 0;
  state.w8NativeVideoPresentAgeMs = 0;
  state.w8NativeVideoNativePresentReason = "";
  state.w8NativeVideoWindowSwapchainProbePromise = null;
  state.w8NativeVideoWindowSwapchainReady = false;
  state.w8NativeVideoWindowSwapchainMode = "";
  state.w8NativeVideoWindowSwapchainStatus = "";
  state.w8NativeVideoWindowSwapchainFormat = "";
  state.w8NativeVideoWindowSwapchainWidth = 0;
  state.w8NativeVideoWindowSwapchainHeight = 0;
  state.w8NativeVideoWindowSwapchainBufferCount = 0;
  state.w8NativeVideoWindowSwapchainSwapEffect = "";
  state.w8NativeVideoWindowSwapchainReason = "";
  state.w8NativeVideoErrors = 0;
  state.w8NativeVideoLastError = "";
  state.w8NativeVideoLastSnapshot = null;
  state.w8NativeVideoProgressSamples = [];
  state.w8NativeVideoProgressStatus = "";
  state.w8NativeVideoProgressNext = "";
  state.w8NativeVideoProgressWindowMs = 0;
  state.w8NativeVideoPresentFrameDelta = 0;
  state.w8NativeVideoPresentFps = 0;
  state.w8NativeVideoDecodedFrameDelta = 0;
  state.w8NativeVideoDecodedFps = 0;
  state.w8NativeVideoWebBypassDelta = 0;
  state.w8NativeVideoWebBypassFps = 0;
  state.w8NativeVideoFramesPushedDelta = 0;
  state.w8NativeVideoSubmittedFrameDelta = 0;
}

function resetW14NativeReceiverState() {
  if (state.w14NativeReceiverSnapshotTimer) {
    window.clearInterval(state.w14NativeReceiverSnapshotTimer);
  }
  state.w14NativeReceiverStarted = false;
  state.w14NativeReceiverPromise = null;
  state.w14NativeReceiverSnapshot = null;
  state.w14NativeReceiverSnapshotTimer = null;
  state.w14NativeReceiverLastError = "";
}

function getW8NativeVideoPort() {
  const port = Number(state.activePort || elements.portInput.value);
  return Number.isFinite(port) && port > 0 ? Math.trunc(port) : undefined;
}

function getW8NativeVideoFps() {
  const fps = Number(state.negotiatedFps || state.requestedFps || elements.fpsSelect.value);
  return Number.isFinite(fps) && fps > 0 ? Math.max(1, Math.min(240, Math.trunc(fps))) : 60;
}

function canUseW14NativeReceiver() {
  return Boolean(getTauriInvoke()) && elements.transportSelect.value === "websocket";
}

function buildW14NativeReceiverRequest({ host, port, password } = {}) {
  const settings = currentDisplaySettings();
  const width = Number(settings.width);
  const height = Number(settings.height);
  const parsedPort = Number(port || state.activePort || elements.portInput.value);
  return {
    host: String(host || state.activeHost || elements.hostInput.value || "").trim(),
    port:
      Number.isFinite(parsedPort) && parsedPort > 0
        ? Math.max(1, Math.min(65535, Math.trunc(parsedPort)))
        : 0,
    password: String(password ?? elements.passwordInput.value ?? ""),
    maxFps: Math.max(1, Math.min(240, Math.trunc(Number(settings.fps) || 60))),
    maxBandwidthKbps: Math.max(1000, Math.trunc(Number(settings.maxBandwidthKbps) || 50_000)),
    preferredWidth: Number.isFinite(width) && width > 0 ? Math.trunc(width) : 0,
    preferredHeight: Number.isFinite(height) && height > 0 ? Math.trunc(height) : 0,
    wantAudio: Boolean(settings.audio),
    audioVolume: Math.max(0, Math.min(100, Math.trunc(Number(settings.audioVolume) || 0))),
    displayMode: settings.displayMode,
    displayId: settings.displayId || "main",
  };
}

function normalizeW14NativeReceiverDiagnostics(snapshot = state.w14NativeReceiverSnapshot) {
  const source = snapshot && typeof snapshot === "object" ? snapshot : {};
  const numberValue = (key) => Math.max(0, Math.trunc(Number(source[key]) || 0));
  const frameValue = (key) => normalizeFrameId(source[key]);
  const stringValue = (key) => String(source[key] ?? "").trim();
  const nativeVideoPresenting = source.nativeVideoPresenting === true;
  const nativeVideoPresentFrames = numberValue("nativeVideoPresentFrames");
  const nativeVideoDecodedFrames = numberValue("nativeVideoDecodedFrames");
  const nativeVideoLastStatus = stringValue("nativeVideoLastStatus");
  const nativeVideoLastReason = stringValue("nativeVideoLastReason");
  const nativeVideoLatestFrameId = frameValue("nativeVideoLatestFrameId");
  const nativeVideoSurfaceFrameId = frameValue("nativeVideoSurfaceFrameId");
  const nativeVideoPresentFrameId = frameValue("nativeVideoPresentFrameId");
  return {
    w14NativeReceiverRunning: source.running === true,
    w14NativeReceiverStatus: stringValue("status"),
    w14NativeReceiverTransport: stringValue("transport"),
    w14NativeReceiverMediaOwner: stringValue("mediaOwner"),
    w14NativeReceiverConnected: source.connected === true,
    w14NativeReceiverAuthenticated: source.authenticated === true,
    w14NativeReceiverSessionActive: source.sessionActive === true,
    w14NativeReceiverLastError: state.w14NativeReceiverLastError || stringValue("lastError"),
    w14NativeVideoFrames: numberValue("videoFrames"),
    w14NativeVideoH264Frames: numberValue("h264Frames"),
    w14NativeVideoLastFrameId: frameValue("lastVideoFrameId"),
    w14NativeVideoLastFrameReceivedAtMs: numberValue("lastVideoReceivedAtMs"),
    w14NativeVideoLastCodec: stringValue("lastVideoCodec"),
    w14NativeVideoLastEncoding: stringValue("lastVideoEncoding"),
    w14NativeVideoRunning: source.nativeVideoRunning === true,
    w14NativeVideoRendererMode: stringValue("nativeVideoRendererMode"),
    w14NativeVideoPushedFrames: numberValue("nativeVideoPushedFrames"),
    w14NativeVideoAcceptedFrames: numberValue("nativeVideoAcceptedFrames"),
    w14NativeVideoDroppedFrames: numberValue("nativeVideoDroppedFrames"),
    w14NativeVideoQueueMs: numberValue("nativeVideoQueueMs"),
    w14NativeVideoDecodedFrames: nativeVideoDecodedFrames,
    w14NativeVideoPresentFrames: nativeVideoPresentFrames,
    w14NativeVideoPresenting: nativeVideoPresenting,
    w14NativeVideoLastPushedFrameId: frameValue("nativeVideoLastPushedFrameId"),
    w14NativeVideoLatestFrameId: nativeVideoLatestFrameId,
    w14NativeVideoSurfaceFrameId: nativeVideoSurfaceFrameId,
    w14NativeVideoPresentFrameId: nativeVideoPresentFrameId,
    w14NativeVideoLatestFrameUpdatedAtMs: numberValue("nativeVideoLatestFrameUpdatedAtMs"),
    w14NativeVideoSurfaceUpdatedAtMs: numberValue("nativeVideoSurfaceUpdatedAtMs"),
    w14NativeVideoPresentUpdatedAtMs: numberValue("nativeVideoPresentUpdatedAtMs"),
    w14NativeVideoFreshnessStatus: stringValue("nativeVideoFreshnessStatus"),
    w14NativeVideoPresentFrameLag: numberValue("nativeVideoPresentFrameLag"),
    w14NativeVideoPresentAgeMs: numberValue("nativeVideoPresentAgeMs"),
    w14NativeVideoLastStatus: nativeVideoLastStatus,
    w14NativeVideoLastReason: nativeVideoLastReason,
    w14NativeVideoLastError: stringValue("nativeVideoLastError"),
    w14NativeAudioFrames: numberValue("audioFrames"),
    w14NativeAudioLastCodec: stringValue("lastAudioCodec"),
    w14NativeAudioLastEncoding: stringValue("lastAudioEncoding"),
    w14NativeAudioSampleRate: numberValue("audioSampleRate"),
    w14NativeAudioChannels: numberValue("audioChannels"),
    w14NativeAudioPlaybackRunning: source.audioPlaybackRunning === true,
    w14NativeAudioPlaybackQueueMs: numberValue("audioPlaybackQueueMs"),
    w14NativeAudioPlaybackPushedFrames: numberValue("audioPlaybackPushedFrames"),
    w14NativeAudioPlaybackPlayedFrames: numberValue("audioPlaybackPlayedFrames"),
    w14NativeAudioPlaybackTrimmedFrames: numberValue("audioPlaybackTrimmedFrames"),
    w14NativeAudioPlaybackUnderruns: numberValue("audioPlaybackUnderruns"),
    w14NativeAudioPlaybackDroppedFrames: numberValue("audioPlaybackDroppedFrames"),
    w14NativeAudioPlaybackSourceFrameMs: numberValue("audioPlaybackSourceFrameMs"),
    w14NativeAudioPlaybackSourceFrameMaxMs: numberValue("audioPlaybackSourceFrameMaxMs"),
    w14NativeAudioPlaybackSourceFrameCadenceMs: numberValue("audioPlaybackSourceFrameCadenceMs"),
    w14NativeAudioPlaybackSourceCadenceFrames: numberValue("audioPlaybackSourceCadenceFrames"),
    w14NativeAudioOutputCallbacks: numberValue("audioOutputCallbacks"),
    w14NativeAudioOutputCallbackFrames: numberValue("audioOutputCallbackFrames"),
    w14NativeAudioOutputSignalCallbacks: numberValue("audioOutputSignalCallbacks"),
    w14NativeAudioOutputSilentCallbacks: numberValue("audioOutputSilentCallbacks"),
    w14NativeAudioOutputPeakMilli: numberValue("audioOutputPeakMilli"),
    w14NativeAudioOutputRmsMilli: numberValue("audioOutputRmsMilli"),
    w14NativeAudioOutputBufferFrames: numberValue("audioOutputBufferFrames"),
    w14NativeAudioOutputBufferMs: numberValue("audioOutputBufferMs"),
    w14NativeAudioOutputLowLatency: source.audioOutputLowLatency === true,
    w14NativeAudioOutputDeviceName: stringValue("audioOutputDeviceName"),
    w14NativeAudioOutputSampleFormat: stringValue("audioOutputSampleFormat"),
    w14NativeAudioOutputStreamRunning: source.audioOutputStreamRunning === true,
    w14NativeAudioPlaybackLastReason: stringValue("audioPlaybackLastReason"),
    w8NativeVideoFramesPushed: numberValue("nativeVideoPushedFrames"),
    w8NativeVideoQueueMs: numberValue("nativeVideoQueueMs"),
    w8NativeVideoDroppedFrames: numberValue("nativeVideoDroppedFrames"),
    w8NativeVideoDecoderSessionActive: source.nativeVideoRunning === true,
    w8NativeVideoDecoderSessionMode: stringValue("nativeVideoRendererMode"),
    w8NativeVideoDecoderSessionStatus: nativeVideoLastStatus,
    w8NativeVideoDecoderSessionDecodedFrames: nativeVideoDecodedFrames,
    w8NativeVideoLatestFrameId: nativeVideoLatestFrameId,
    w8NativeVideoLatestFrameUpdatedAtMs: numberValue("nativeVideoLatestFrameUpdatedAtMs"),
    w8NativeVideoNativeSurfaceLastFrameId: nativeVideoSurfaceFrameId,
    w8NativeVideoNativeSurfaceUpdatedAtMs: numberValue("nativeVideoSurfaceUpdatedAtMs"),
    w8NativeVideoNativePresentReady: nativeVideoPresenting,
    w8NativeVideoNativePresentMode: stringValue("nativeVideoRendererMode"),
    w8NativeVideoNativePresentStatus: nativeVideoLastStatus,
    w8NativeVideoNativePresentFrames: nativeVideoPresentFrames,
    w8NativeVideoNativePresentLastFrameId: nativeVideoPresentFrameId,
    w8NativeVideoNativePresentUpdatedAtMs: numberValue("nativeVideoPresentUpdatedAtMs"),
    w8NativeVideoFreshnessStatus: stringValue("nativeVideoFreshnessStatus"),
    w8NativeVideoPresentFrameLag: numberValue("nativeVideoPresentFrameLag"),
    w8NativeVideoPresentAgeMs: numberValue("nativeVideoPresentAgeMs"),
    w8NativeVideoNativePresentReason: nativeVideoLastReason,
  };
}

function updateW14NativeReceiverDiagnostics({ snapshot = null, error = "" } = {}) {
  if (snapshot && typeof snapshot === "object") {
    state.w14NativeReceiverSnapshot = snapshot;
  }
  if (error) {
    state.w14NativeReceiverLastError = String(error).replace(/\s+/g, " ").slice(0, 160);
  } else if (snapshot) {
    state.w14NativeReceiverLastError = "";
  }
  const diagnostics = normalizeW14NativeReceiverDiagnostics();
  if (snapshot) {
    state.w14NativeReceiverStarted =
      diagnostics.w14NativeReceiverRunning &&
      diagnostics.w14NativeReceiverStatus !== "stopped" &&
      diagnostics.w14NativeReceiverStatus !== "error";
  }
  updateHostDiagnostics(diagnostics);
  return diagnostics;
}

function scheduleW14NativeReceiverSnapshotPolling() {
  if (state.w14NativeReceiverSnapshotTimer || !state.w14NativeReceiverStarted) return;
  state.w14NativeReceiverSnapshotTimer = window.setInterval(() => {
    if (!state.connected || !state.w14NativeReceiverStarted) {
      if (state.w14NativeReceiverSnapshotTimer) {
        window.clearInterval(state.w14NativeReceiverSnapshotTimer);
      }
      state.w14NativeReceiverSnapshotTimer = null;
      return;
    }
    void refreshW14NativeReceiverSnapshot();
  }, 1000);
}

async function refreshW14NativeReceiverSnapshot() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  try {
    const snapshot = await invoke("get_w14_native_receiver_snapshot");
    updateW14NativeReceiverDiagnostics({ snapshot });
    return snapshot || null;
  } catch (error) {
    updateW14NativeReceiverDiagnostics({ error: error?.message || String(error) });
    return null;
  }
}

async function startW14NativeReceiverForConnection({ host, port, password } = {}) {
  const invoke = getTauriInvoke();
  if (!invoke || !canUseW14NativeReceiver()) return null;
  if (state.w14NativeReceiverStarted) {
    return state.w14NativeReceiverSnapshot;
  }
  if (state.w14NativeReceiverPromise) {
    return state.w14NativeReceiverPromise;
  }

  const request = buildW14NativeReceiverRequest({ host, port, password });
  if (!request.host || !request.port || !request.password) return null;

  state.w14NativeReceiverPromise = invoke("start_w14_native_receiver_session", { request })
    .then((snapshot) => {
      state.w14NativeReceiverStarted = true;
      state.w14NativeReceiverSnapshot = snapshot || null;
      state.w14NativeReceiverLastError = "";
      updateW14NativeReceiverDiagnostics({ snapshot });
      scheduleW14NativeReceiverSnapshotPolling();
      addLog("W14 原生视频", "已启动桌面原生接收入口");
      return snapshot || null;
    })
    .catch((error) => {
      state.w14NativeReceiverStarted = false;
      updateW14NativeReceiverDiagnostics({ error: error?.message || String(error) });
      addLog("W14 原生视频", state.w14NativeReceiverLastError || "桌面原生接收入口启动失败");
      return null;
    })
    .finally(() => {
      state.w14NativeReceiverPromise = null;
    });

  return state.w14NativeReceiverPromise;
}

async function stopW14NativeReceiver({ resetDiagnostics = false, force = false } = {}) {
  const invoke = getTauriInvoke();
  if (state.w14NativeReceiverSnapshotTimer) {
    window.clearInterval(state.w14NativeReceiverSnapshotTimer);
    state.w14NativeReceiverSnapshotTimer = null;
  }
  const shouldStop =
    force ||
    state.w14NativeReceiverStarted ||
    state.w14NativeReceiverPromise ||
    state.w14NativeReceiverSnapshot;
  state.w14NativeReceiverStarted = false;
  state.w14NativeReceiverPromise = null;
  if (!invoke || !shouldStop) {
    if (resetDiagnostics) resetW14NativeReceiverState();
    return null;
  }

  try {
    const snapshot = await invoke("stop_w14_native_receiver_session");
    if (!resetDiagnostics) {
      updateW14NativeReceiverDiagnostics({ snapshot });
    }
    return snapshot || null;
  } catch (error) {
    if (!resetDiagnostics) {
      updateW14NativeReceiverDiagnostics({ error: error?.message || String(error) });
    }
    return null;
  } finally {
    if (resetDiagnostics) resetW14NativeReceiverState();
  }
}

function shouldUseW14NativeReceiverVideoPath() {
  const status = String(state.hostDiagnostics?.w14NativeReceiverStatus || "").toLowerCase();
  return Boolean(
    state.w14NativeReceiverStarted ||
      state.w14NativeReceiverPromise ||
      status === "starting" ||
      status === "connecting" ||
      status === "connected" ||
      status === "authenticating" ||
      status === "negotiating" ||
      status === "streaming",
  );
}

function roundW8NativeProgressFps(value) {
  return Number.isFinite(value) && value > 0 ? Math.round(value * 10) / 10 : 0;
}

function getW8NativeVideoProgressSnapshot(now = performance.now()) {
  return {
    at: Math.max(0, Number(now) || 0),
    framesPushed: Math.max(0, Math.trunc(Number(state.w8NativeVideoFramesPushed) || 0)),
    submittedFrames: Math.max(
      0,
      Math.trunc(Number(state.w8NativeVideoDecoderSessionSubmittedFrames) || 0),
    ),
    decodedFrames: Math.max(
      0,
      Math.trunc(Number(state.w8NativeVideoDecoderSessionDecodedFrames) || 0),
    ),
    presentFrames: Math.max(0, Math.trunc(Number(state.w8NativeVideoNativePresentFrames) || 0)),
    webBypass: Math.max(0, Math.trunc(Number(state.h264WebDecodeBypassedForNativeSurface) || 0)),
  };
}

function resetW8NativeVideoProgressDiagnostics() {
  state.w8NativeVideoProgressSamples = [];
  state.w8NativeVideoProgressStatus = "";
  state.w8NativeVideoProgressNext = "";
  state.w8NativeVideoProgressWindowMs = 0;
  state.w8NativeVideoPresentFrameDelta = 0;
  state.w8NativeVideoPresentFps = 0;
  state.w8NativeVideoDecodedFrameDelta = 0;
  state.w8NativeVideoDecodedFps = 0;
  state.w8NativeVideoWebBypassDelta = 0;
  state.w8NativeVideoWebBypassFps = 0;
  state.w8NativeVideoFramesPushedDelta = 0;
  state.w8NativeVideoSubmittedFrameDelta = 0;
  const diagnostics = {
    w8NativeVideoProgressStatus: "",
    w8NativeVideoProgressNext: "",
    w8NativeVideoProgressWindowMs: 0,
    w8NativeVideoPresentFrameDelta: 0,
    w8NativeVideoPresentFps: 0,
    w8NativeVideoDecodedFrameDelta: 0,
    w8NativeVideoDecodedFps: 0,
    w8NativeVideoWebBypassDelta: 0,
    w8NativeVideoWebBypassFps: 0,
    w8NativeVideoFramesPushedDelta: 0,
    w8NativeVideoSubmittedFrameDelta: 0,
  };
  state.hostDiagnostics = { ...(state.hostDiagnostics || {}), ...diagnostics };
  return diagnostics;
}

function updateW8NativeVideoProgressDiagnostics(now = performance.now()) {
  const sample = getW8NativeVideoProgressSnapshot(now);
  const hasEvidence =
    sample.framesPushed > 0 ||
    sample.submittedFrames > 0 ||
    sample.decodedFrames > 0 ||
    sample.presentFrames > 0 ||
    sample.webBypass > 0;
  if (!hasEvidence) {
    return resetW8NativeVideoProgressDiagnostics();
  }

  let samples = Array.isArray(state.w8NativeVideoProgressSamples)
    ? state.w8NativeVideoProgressSamples.filter((item) => item && Number.isFinite(Number(item.at)))
    : [];
  const last = samples.at(-1);
  if (
    last &&
    (sample.framesPushed < Number(last.framesPushed || 0) ||
      sample.submittedFrames < Number(last.submittedFrames || 0) ||
      sample.decodedFrames < Number(last.decodedFrames || 0) ||
      sample.presentFrames < Number(last.presentFrames || 0) ||
      sample.webBypass < Number(last.webBypass || 0))
  ) {
    samples = [];
  }

  samples.push(sample);
  const cutoff = sample.at - w8NativeVideoProgressWindowMs;
  samples = samples.filter((item) => Number(item.at) >= cutoff);
  state.w8NativeVideoProgressSamples = samples;
  const baseline = samples[0] || sample;
  const elapsedMs = Math.max(0, Math.round(sample.at - Number(baseline.at || sample.at)));
  const seconds = elapsedMs > 0 ? elapsedMs / 1000 : 0;
  const delta = (key) => Math.max(0, Math.round(Number(sample[key] || 0) - Number(baseline[key] || 0)));
  const framesPushedDelta = delta("framesPushed");
  const submittedDelta = delta("submittedFrames");
  const decodedDelta = delta("decodedFrames");
  const presentDelta = delta("presentFrames");
  const webBypassDelta = delta("webBypass");
  let progressStatus = elapsedMs < 500 ? "warming-up" : "stalled";
  let progressNext = elapsedMs < 500 ? "continue-observing-progress" : "inspect-native-video-stall";

  if (presentDelta > 0) {
    progressStatus = "present-progress";
    progressNext = "continue-long-run-observation";
  } else if (decodedDelta > 0) {
    progressStatus = "decode-progress";
    progressNext = "inspect-native-present";
  } else if (webBypassDelta > 0) {
    progressStatus = "native-bypass-progress";
    progressNext = "watch-native-present";
  } else if (submittedDelta > 0) {
    progressStatus = "decoder-submit-progress";
    progressNext = "wait-decoded-or-classify-decoder";
  } else if (framesPushedDelta > 0) {
    progressStatus = "receive-progress";
    progressNext = "wait-decoder-submit";
  }

  state.w8NativeVideoProgressStatus = progressStatus;
  state.w8NativeVideoProgressNext = progressNext;
  state.w8NativeVideoProgressWindowMs = elapsedMs;
  state.w8NativeVideoPresentFrameDelta = presentDelta;
  state.w8NativeVideoPresentFps = roundW8NativeProgressFps(seconds > 0 ? presentDelta / seconds : 0);
  state.w8NativeVideoDecodedFrameDelta = decodedDelta;
  state.w8NativeVideoDecodedFps = roundW8NativeProgressFps(seconds > 0 ? decodedDelta / seconds : 0);
  state.w8NativeVideoWebBypassDelta = webBypassDelta;
  state.w8NativeVideoWebBypassFps = roundW8NativeProgressFps(seconds > 0 ? webBypassDelta / seconds : 0);
  state.w8NativeVideoFramesPushedDelta = framesPushedDelta;
  state.w8NativeVideoSubmittedFrameDelta = submittedDelta;

  const diagnostics = {
    w8NativeVideoProgressStatus: state.w8NativeVideoProgressStatus,
    w8NativeVideoProgressNext: state.w8NativeVideoProgressNext,
    w8NativeVideoProgressWindowMs: state.w8NativeVideoProgressWindowMs,
    w8NativeVideoPresentFrameDelta: state.w8NativeVideoPresentFrameDelta,
    w8NativeVideoPresentFps: state.w8NativeVideoPresentFps,
    w8NativeVideoDecodedFrameDelta: state.w8NativeVideoDecodedFrameDelta,
    w8NativeVideoDecodedFps: state.w8NativeVideoDecodedFps,
    w8NativeVideoWebBypassDelta: state.w8NativeVideoWebBypassDelta,
    w8NativeVideoWebBypassFps: state.w8NativeVideoWebBypassFps,
    w8NativeVideoFramesPushedDelta: state.w8NativeVideoFramesPushedDelta,
    w8NativeVideoSubmittedFrameDelta: state.w8NativeVideoSubmittedFrameDelta,
  };
  state.hostDiagnostics = { ...(state.hostDiagnostics || {}), ...diagnostics };
  return diagnostics;
}

function normalizeW8NativeNalTypes(nalTypes) {
  if (!Array.isArray(nalTypes)) return [];
  return nalTypes
    .map((item) => Math.trunc(Number(item)))
    .filter((item) => Number.isFinite(item) && item >= 0 && item <= 255);
}

function normalizeFrameId(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.trunc(number);
}

function normalizeTimestampMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.trunc(number);
}

function updateW8NativeVideoFreshnessDiagnostics(nowMs = Date.now()) {
  const latestFrameId = normalizeFrameId(state.w8NativeVideoLatestFrameId);
  const surfaceFrameId = normalizeFrameId(state.w8NativeVideoNativeSurfaceLastFrameId);
  const presentFrameId = normalizeFrameId(state.w8NativeVideoNativePresentLastFrameId);
  const presentUpdatedAtMs = normalizeTimestampMs(state.w8NativeVideoNativePresentUpdatedAtMs);
  const presentAgeMs = presentUpdatedAtMs > 0 ? Math.max(0, Math.trunc(nowMs - presentUpdatedAtMs)) : 0;
  let freshnessStatus = "";

  if (latestFrameId !== null && presentFrameId !== null) {
    freshnessStatus =
      latestFrameId === presentFrameId && presentAgeMs <= 1000
        ? "present-fresh"
        : "present-stale";
  } else if (surfaceFrameId !== null) {
    freshnessStatus = "surface-only";
  } else if (latestFrameId !== null) {
    freshnessStatus = "decode-only";
  } else if (state.w8NativeVideoDecoderSessionAcceptedInputFrames > 0) {
    freshnessStatus = "accepted-only";
  } else {
    freshnessStatus = "";
  }

  state.w8NativeVideoLatestFrameId = latestFrameId;
  state.w8NativeVideoNativeSurfaceLastFrameId = surfaceFrameId;
  state.w8NativeVideoNativePresentLastFrameId = presentFrameId;
  state.w8NativeVideoPresentFrameLag =
    latestFrameId === null ? 0 : Math.max(0, latestFrameId - (presentFrameId ?? 0));
  state.w8NativeVideoPresentAgeMs = presentAgeMs;
  state.w8NativeVideoFreshnessStatus = freshnessStatus;
  return {
    w8NativeVideoFreshnessStatus: freshnessStatus,
    w8NativeVideoPresentFrameLag: state.w8NativeVideoPresentFrameLag,
    w8NativeVideoPresentAgeMs: presentAgeMs,
  };
}

function updateW8NativeVideoDiagnostics({
  snapshot = state.w8NativeVideoLastSnapshot,
  pushResult = null,
  error = "",
} = {}) {
  const queue = snapshot?.queue || {};
  const video = pushResult?.video || {};
  const summary = pushResult?.summary || {};
  const queueMs = Number.isFinite(Number(video.queueMs))
    ? Number(video.queueMs)
    : Number(queue.queueMs) || 0;
  const droppedNow = Number(video.droppedFrames) || 0;
  if (droppedNow > 0) {
    state.w8NativeVideoDroppedFrames += droppedNow;
  }
  const reason = String(video.reason || queue.lastReason || "").trim();
  if (error) {
    state.w8NativeVideoLastError = String(error).replace(/\s+/g, " ").slice(0, 120);
  }
  const codecString = String(summary.codecString || "").trim();
  if (codecString) {
    state.w8NativeVideoCodecString = codecString;
  }
  if (summary.hasDecoderConfig === true || codecString) {
    state.w8NativeVideoHasDecoderConfig = true;
  }
  const nativeNalTypes = normalizeW8NativeNalTypes(summary.nalTypes);
  if (nativeNalTypes.length > 0) {
    const nativeSpsCount = Math.max(0, Math.trunc(Number(summary.spsCount) || 0));
    const nativePpsCount = Math.max(0, Math.trunc(Number(summary.ppsCount) || 0));
    const nativeIdrCount = nativeNalTypes.filter((item) => item === 5).length;
    const nativeHasSps = summary.hasSps === true || nativeSpsCount > 0 || nativeNalTypes.includes(7);
    const nativeHasPps = summary.hasPps === true || nativePpsCount > 0 || nativeNalTypes.includes(8);
    const nativeHasIdr = summary.hasIdr === true || nativeIdrCount > 0;
    const nativeIsKeyframe =
      summary.isKeyframe === true || nativeHasIdr || nativeHasSps || nativeHasPps;
    state.w8NativeVideoNativeNalTypes = nativeNalTypes.slice(0, 16).join("/");
    state.w8NativeVideoNativeHasSps = state.w8NativeVideoNativeHasSps || nativeHasSps;
    state.w8NativeVideoNativeHasPps = state.w8NativeVideoNativeHasPps || nativeHasPps;
    state.w8NativeVideoNativeHasIdr = state.w8NativeVideoNativeHasIdr || nativeHasIdr;
    state.w8NativeVideoNativeIsKeyframe = nativeIsKeyframe;
    if (nativeIsKeyframe) {
      state.w8NativeVideoNativeKeyFrames += 1;
    }
    state.w8NativeVideoNativeSpsCount += nativeSpsCount || (nativeHasSps ? 1 : 0);
    state.w8NativeVideoNativePpsCount += nativePpsCount || (nativeHasPps ? 1 : 0);
    state.w8NativeVideoNativeIdrCount += nativeIdrCount || (nativeHasIdr ? 1 : 0);
    state.w8NativeVideoNativeByteLen = Math.max(0, Math.trunc(Number(summary.byteLen) || 0));
  }
  const decoderInit = pushResult?.decoderInit || summary.decoderInit || null;
  if (decoderInit && typeof decoderInit === "object") {
    state.w8NativeVideoDecoderInitReady = decoderInit.ready === true;
    state.w8NativeVideoDecoderInitMode = String(decoderInit.mode || "").trim();
    state.w8NativeVideoDecoderInitReason = String(decoderInit.reason || "")
      .replace(/\s+/g, " ")
      .slice(0, 160);
    state.w8NativeVideoDecoderInitOutputSubtypes = Array.isArray(decoderInit.outputSubtypes)
      ? decoderInit.outputSubtypes.map((item) => String(item || "").trim()).filter(Boolean).join("/")
      : String(decoderInit.outputSubtypes || "").trim();
  }
  const decodeStep = pushResult?.decodeStep || summary.decodeStep || null;
  if (decodeStep && typeof decodeStep === "object") {
    state.w8NativeVideoDecodeStepReady = decodeStep.ready === true;
    state.w8NativeVideoDecodeStepMode = String(decodeStep.mode || "").trim();
    state.w8NativeVideoDecodeStepReason = String(decodeStep.reason || "")
      .replace(/\s+/g, " ")
      .slice(0, 160);
    state.w8NativeVideoDecodeStepStatus = String(decodeStep.outputStatus || decodeStep.status || "").trim();
  }
  const decoderSession = pushResult?.decoderSession || summary.decoderSession || null;
  if (decoderSession && typeof decoderSession === "object") {
    state.w8NativeVideoDecoderSessionActive = decoderSession.active === true;
    state.w8NativeVideoDecoderSessionMode = String(decoderSession.mode || "").trim();
    state.w8NativeVideoDecoderSessionReason = String(decoderSession.reason || "")
      .replace(/\s+/g, " ")
      .slice(0, 160);
    state.w8NativeVideoDecoderSessionStatus = String(
      decoderSession.lastStatus || decoderSession.status || "",
    ).trim();
    state.w8NativeVideoDecoderSessionOutputSubtype = String(decoderSession.outputSubtype || "").trim();
    state.w8NativeVideoDecoderSessionSubmittedFrames = Math.max(
      0,
      Math.trunc(Number(decoderSession.submittedFrames) || 0),
    );
    state.w8NativeVideoDecoderSessionAcceptedInputFrames = Math.max(
      0,
      Math.trunc(Number(decoderSession.acceptedInputFrames) || 0),
    );
    state.w8NativeVideoDecoderSessionDecodedFrames = Math.max(
      0,
      Math.trunc(Number(decoderSession.decodedFrames) || 0),
    );
    state.w8NativeVideoProcessInputAttempts = Math.max(
      0,
      Math.trunc(Number(decoderSession.processInputAttempts) || 0),
    );
    state.w8NativeVideoProcessInputAcceptedFrames = Math.max(
      0,
      Math.trunc(Number(decoderSession.processInputAcceptedFrames) || 0),
    );
    state.w8NativeVideoProcessInputFailures = Math.max(
      0,
      Math.trunc(Number(decoderSession.processInputFailures) || 0),
    );
    state.w8NativeVideoLastProcessInputStatus = String(
      decoderSession.lastProcessInputStatus || "",
    ).trim();
    state.w8NativeVideoProcessOutputAttempts = Math.max(
      0,
      Math.trunc(Number(decoderSession.processOutputAttempts) || 0),
    );
    state.w8NativeVideoProcessOutputProducedFrames = Math.max(
      0,
      Math.trunc(Number(decoderSession.processOutputProducedFrames) || 0),
    );
    state.w8NativeVideoProcessOutputNeedMoreInputFrames = Math.max(
      0,
      Math.trunc(Number(decoderSession.processOutputNeedMoreInputFrames) || 0),
    );
    state.w8NativeVideoProcessOutputStreamChangeFrames = Math.max(
      0,
      Math.trunc(Number(decoderSession.processOutputStreamChangeFrames) || 0),
    );
    state.w8NativeVideoProcessOutputNoSampleFrames = Math.max(
      0,
      Math.trunc(Number(decoderSession.processOutputNoSampleFrames) || 0),
    );
    state.w8NativeVideoProcessOutputFailures = Math.max(
      0,
      Math.trunc(Number(decoderSession.processOutputFailures) || 0),
    );
    state.w8NativeVideoLastProcessOutputStatus = String(
      decoderSession.lastProcessOutputStatus || "",
    ).trim();
    state.w8NativeVideoDecoderSessionWorkerThread = decoderSession.workerThread === true;
    state.w8NativeVideoDecoderSessionWorkerMode = String(decoderSession.workerMode || "").trim();
    state.w8NativeVideoDecoderSessionWorkerStatus = String(decoderSession.workerStatus || "").trim();
    state.w8NativeVideoFrameHandoffActive = decoderSession.frameHandoffActive === true;
    state.w8NativeVideoFrameHandoffMode = String(decoderSession.frameHandoffMode || "").trim();
    state.w8NativeVideoFrameHandoffStatus = String(decoderSession.frameHandoffStatus || "").trim();
    state.w8NativeVideoLatestFrameFormat = String(decoderSession.latestFrameFormat || "").trim();
    state.w8NativeVideoLatestFrameBytes = Math.max(
      0,
      Math.trunc(Number(decoderSession.latestFrameBytes) || 0),
    );
    state.w8NativeVideoLatestFrameId =
      decoderSession.latestFrameId === null || decoderSession.latestFrameId === undefined
        ? null
        : normalizeFrameId(decoderSession.latestFrameId);
    state.w8NativeVideoLatestFrameUpdatedAtMs = normalizeTimestampMs(
      decoderSession.latestFrameUpdatedAtMs,
    );
    state.w8NativeVideoNativeSurfaceReady = decoderSession.nativeSurfaceReady === true;
    state.w8NativeVideoNativeSurfaceMode = String(decoderSession.nativeSurfaceMode || "").trim();
    state.w8NativeVideoNativeSurfaceStatus = String(decoderSession.nativeSurfaceStatus || "").trim();
    state.w8NativeVideoNativeSurfaceFormat = String(decoderSession.nativeSurfaceFormat || "").trim();
    state.w8NativeVideoNativeSurfaceWidth = Math.max(
      0,
      Math.trunc(Number(decoderSession.nativeSurfaceWidth) || 0),
    );
    state.w8NativeVideoNativeSurfaceHeight = Math.max(
      0,
      Math.trunc(Number(decoderSession.nativeSurfaceHeight) || 0),
    );
    state.w8NativeVideoNativeSurfaceReason = String(decoderSession.nativeSurfaceReason || "")
      .replace(/\s+/g, " ")
      .slice(0, 160);
    state.w8NativeVideoNativeSurfaceCopyStatus = String(
      decoderSession.nativeSurfaceCopyStatus || "",
    ).trim();
    state.w8NativeVideoNativeSurfaceCopyBytes = Math.max(
      0,
      Math.trunc(Number(decoderSession.nativeSurfaceCopyBytes) || 0),
    );
    state.w8NativeVideoNativeSurfacePresentedFrames = Math.max(
      0,
      Math.trunc(Number(decoderSession.nativeSurfacePresentedFrames) || 0),
    );
    state.w8NativeVideoNativeSurfaceLastFrameId =
      decoderSession.nativeSurfaceLastFrameId === null ||
      decoderSession.nativeSurfaceLastFrameId === undefined
        ? null
        : normalizeFrameId(decoderSession.nativeSurfaceLastFrameId);
    state.w8NativeVideoNativeSurfaceUpdatedAtMs = normalizeTimestampMs(
      decoderSession.nativeSurfaceUpdatedAtMs,
    );
    state.w8NativeVideoNativePresentReady = decoderSession.nativePresentReady === true;
    state.w8NativeVideoNativePresentMode = String(decoderSession.nativePresentMode || "").trim();
    state.w8NativeVideoNativePresentStatus = String(decoderSession.nativePresentStatus || "").trim();
    state.w8NativeVideoNativePresentFormat = String(decoderSession.nativePresentFormat || "").trim();
    state.w8NativeVideoNativePresentWidth = Math.max(
      0,
      Math.trunc(Number(decoderSession.nativePresentWidth) || 0),
    );
    state.w8NativeVideoNativePresentHeight = Math.max(
      0,
      Math.trunc(Number(decoderSession.nativePresentHeight) || 0),
    );
    state.w8NativeVideoNativePresentFrames = Math.max(
      0,
      Math.trunc(Number(decoderSession.nativePresentFrames) || 0),
    );
    state.w8NativeVideoNativePresentLastFrameId =
      decoderSession.nativePresentLastFrameId === null ||
      decoderSession.nativePresentLastFrameId === undefined
        ? null
        : normalizeFrameId(decoderSession.nativePresentLastFrameId);
    state.w8NativeVideoNativePresentUpdatedAtMs = normalizeTimestampMs(
      decoderSession.nativePresentUpdatedAtMs,
    );
    state.w8NativeVideoNativePresentReason = String(decoderSession.nativePresentReason || "")
      .replace(/\s+/g, " ")
      .slice(0, 160);
  }

  const freshnessDiagnostics = updateW8NativeVideoFreshnessDiagnostics();
  const progressDiagnostics = updateW8NativeVideoProgressDiagnostics();
  updateHostDiagnostics({
    w8NativeVideoFramesPushed: state.w8NativeVideoFramesPushed,
    w8NativeVideoQueueMs: Math.max(0, Math.round(queueMs)),
    w8NativeVideoDroppedFrames: state.w8NativeVideoDroppedFrames,
    w8NativeVideoHasDecoderConfig: state.w8NativeVideoHasDecoderConfig,
    w8NativeVideoCodecString: state.w8NativeVideoCodecString,
    w8NativeVideoNativeNalTypes: state.w8NativeVideoNativeNalTypes,
    w8NativeVideoNativeHasSps: state.w8NativeVideoNativeHasSps,
    w8NativeVideoNativeHasPps: state.w8NativeVideoNativeHasPps,
    w8NativeVideoNativeHasIdr: state.w8NativeVideoNativeHasIdr,
    w8NativeVideoNativeIsKeyframe: state.w8NativeVideoNativeIsKeyframe,
    w8NativeVideoNativeKeyFrames: state.w8NativeVideoNativeKeyFrames,
    w8NativeVideoNativeSpsCount: state.w8NativeVideoNativeSpsCount,
    w8NativeVideoNativePpsCount: state.w8NativeVideoNativePpsCount,
    w8NativeVideoNativeIdrCount: state.w8NativeVideoNativeIdrCount,
    w8NativeVideoNativeByteLen: state.w8NativeVideoNativeByteLen,
    w8NativeVideoDecoderReady: state.w8NativeVideoDecoderReady,
    w8NativeVideoDecoderMode: state.w8NativeVideoDecoderMode,
    w8NativeVideoDecoderReason: state.w8NativeVideoDecoderReason,
    w8NativeVideoD3dFeatureLevel: state.w8NativeVideoD3dFeatureLevel,
    w8NativeVideoDecoderInitReady: state.w8NativeVideoDecoderInitReady,
    w8NativeVideoDecoderInitMode: state.w8NativeVideoDecoderInitMode,
    w8NativeVideoDecoderInitReason: state.w8NativeVideoDecoderInitReason,
    w8NativeVideoDecoderInitOutputSubtypes: state.w8NativeVideoDecoderInitOutputSubtypes,
    w8NativeVideoDecodeStepReady: state.w8NativeVideoDecodeStepReady,
    w8NativeVideoDecodeStepMode: state.w8NativeVideoDecodeStepMode,
    w8NativeVideoDecodeStepReason: state.w8NativeVideoDecodeStepReason,
    w8NativeVideoDecodeStepStatus: state.w8NativeVideoDecodeStepStatus,
    w8NativeVideoDecoderSessionActive: state.w8NativeVideoDecoderSessionActive,
    w8NativeVideoDecoderSessionMode: state.w8NativeVideoDecoderSessionMode,
    w8NativeVideoDecoderSessionReason: state.w8NativeVideoDecoderSessionReason,
    w8NativeVideoDecoderSessionStatus: state.w8NativeVideoDecoderSessionStatus,
    w8NativeVideoDecoderSessionOutputSubtype: state.w8NativeVideoDecoderSessionOutputSubtype,
    w8NativeVideoDecoderSessionSubmittedFrames: state.w8NativeVideoDecoderSessionSubmittedFrames,
    w8NativeVideoDecoderSessionAcceptedInputFrames:
      state.w8NativeVideoDecoderSessionAcceptedInputFrames,
    w8NativeVideoDecoderSessionDecodedFrames: state.w8NativeVideoDecoderSessionDecodedFrames,
    w8NativeVideoProcessInputAttempts: state.w8NativeVideoProcessInputAttempts,
    w8NativeVideoProcessInputAcceptedFrames: state.w8NativeVideoProcessInputAcceptedFrames,
    w8NativeVideoProcessInputFailures: state.w8NativeVideoProcessInputFailures,
    w8NativeVideoLastProcessInputStatus: state.w8NativeVideoLastProcessInputStatus,
    w8NativeVideoProcessOutputAttempts: state.w8NativeVideoProcessOutputAttempts,
    w8NativeVideoProcessOutputProducedFrames: state.w8NativeVideoProcessOutputProducedFrames,
    w8NativeVideoProcessOutputNeedMoreInputFrames:
      state.w8NativeVideoProcessOutputNeedMoreInputFrames,
    w8NativeVideoProcessOutputStreamChangeFrames:
      state.w8NativeVideoProcessOutputStreamChangeFrames,
    w8NativeVideoProcessOutputNoSampleFrames: state.w8NativeVideoProcessOutputNoSampleFrames,
    w8NativeVideoProcessOutputFailures: state.w8NativeVideoProcessOutputFailures,
    w8NativeVideoLastProcessOutputStatus: state.w8NativeVideoLastProcessOutputStatus,
    w8NativeVideoDecoderSessionWorkerThread: state.w8NativeVideoDecoderSessionWorkerThread,
    w8NativeVideoDecoderSessionWorkerMode: state.w8NativeVideoDecoderSessionWorkerMode,
    w8NativeVideoDecoderSessionWorkerStatus: state.w8NativeVideoDecoderSessionWorkerStatus,
    w8NativeVideoFrameHandoffActive: state.w8NativeVideoFrameHandoffActive,
    w8NativeVideoFrameHandoffMode: state.w8NativeVideoFrameHandoffMode,
    w8NativeVideoFrameHandoffStatus: state.w8NativeVideoFrameHandoffStatus,
    w8NativeVideoLatestFrameFormat: state.w8NativeVideoLatestFrameFormat,
    w8NativeVideoLatestFrameBytes: state.w8NativeVideoLatestFrameBytes,
    w8NativeVideoLatestFrameId: state.w8NativeVideoLatestFrameId,
    w8NativeVideoLatestFrameUpdatedAtMs: state.w8NativeVideoLatestFrameUpdatedAtMs,
    w8NativeVideoNativeSurfaceReady: state.w8NativeVideoNativeSurfaceReady,
    w8NativeVideoNativeSurfaceMode: state.w8NativeVideoNativeSurfaceMode,
    w8NativeVideoNativeSurfaceStatus: state.w8NativeVideoNativeSurfaceStatus,
    w8NativeVideoNativeSurfaceFormat: state.w8NativeVideoNativeSurfaceFormat,
    w8NativeVideoNativeSurfaceWidth: state.w8NativeVideoNativeSurfaceWidth,
    w8NativeVideoNativeSurfaceHeight: state.w8NativeVideoNativeSurfaceHeight,
    w8NativeVideoNativeSurfaceReason: state.w8NativeVideoNativeSurfaceReason,
    w8NativeVideoNativeSurfaceCopyStatus: state.w8NativeVideoNativeSurfaceCopyStatus,
    w8NativeVideoNativeSurfaceCopyBytes: state.w8NativeVideoNativeSurfaceCopyBytes,
    w8NativeVideoNativeSurfacePresentedFrames: state.w8NativeVideoNativeSurfacePresentedFrames,
    w8NativeVideoNativeSurfaceLastFrameId: state.w8NativeVideoNativeSurfaceLastFrameId,
    w8NativeVideoNativeSurfaceUpdatedAtMs: state.w8NativeVideoNativeSurfaceUpdatedAtMs,
    w8NativeVideoNativePresentReady: state.w8NativeVideoNativePresentReady,
    w8NativeVideoNativePresentMode: state.w8NativeVideoNativePresentMode,
    w8NativeVideoNativePresentStatus: state.w8NativeVideoNativePresentStatus,
    w8NativeVideoNativePresentFormat: state.w8NativeVideoNativePresentFormat,
    w8NativeVideoNativePresentWidth: state.w8NativeVideoNativePresentWidth,
    w8NativeVideoNativePresentHeight: state.w8NativeVideoNativePresentHeight,
    w8NativeVideoNativePresentFrames: state.w8NativeVideoNativePresentFrames,
    w8NativeVideoNativePresentLastFrameId: state.w8NativeVideoNativePresentLastFrameId,
    w8NativeVideoNativePresentUpdatedAtMs: state.w8NativeVideoNativePresentUpdatedAtMs,
    w8NativeVideoNativePresentReason: state.w8NativeVideoNativePresentReason,
    ...freshnessDiagnostics,
    w8NativeVideoLastReason: reason,
    w8NativeVideoErrors: state.w8NativeVideoErrors,
    w8NativeVideoLastError: state.w8NativeVideoLastError,
    ...progressDiagnostics,
  });
}

function updateW8NativeVideoDecoderProbeDiagnostics(probe) {
  if (!probe || typeof probe !== "object") return;
  state.w8NativeVideoDecoderReady = probe.ready === true;
  state.w8NativeVideoDecoderMode = String(probe.mode || "").trim();
  state.w8NativeVideoDecoderReason = String(probe.reason || "").replace(/\s+/g, " ").slice(0, 160);
  state.w8NativeVideoD3dFeatureLevel = String(probe.d3dFeatureLevel || "").trim();
  updateHostDiagnostics({
    w8NativeVideoDecoderReady: state.w8NativeVideoDecoderReady,
    w8NativeVideoDecoderMode: state.w8NativeVideoDecoderMode,
    w8NativeVideoDecoderReason: state.w8NativeVideoDecoderReason,
    w8NativeVideoD3dFeatureLevel: state.w8NativeVideoD3dFeatureLevel,
  });
}

function updateW8NativeVideoWindowSwapchainDiagnostics(probe) {
  if (!probe || typeof probe !== "object") return;
  state.w8NativeVideoWindowSwapchainReady = probe.ready === true;
  state.w8NativeVideoWindowSwapchainMode = String(probe.mode || "").trim();
  state.w8NativeVideoWindowSwapchainStatus = String(
    probe.status || (probe.ready ? "ready" : "blocked"),
  ).trim();
  state.w8NativeVideoWindowSwapchainFormat = String(probe.format || "").trim();
  state.w8NativeVideoWindowSwapchainWidth = Math.max(
    0,
    Math.trunc(Number(probe.windowClientWidth) || Number(probe.width) || 0),
  );
  state.w8NativeVideoWindowSwapchainHeight = Math.max(
    0,
    Math.trunc(Number(probe.windowClientHeight) || Number(probe.height) || 0),
  );
  state.w8NativeVideoWindowSwapchainBufferCount = Math.max(
    0,
    Math.trunc(Number(probe.bufferCount) || 0),
  );
  state.w8NativeVideoWindowSwapchainSwapEffect = String(probe.swapEffect || "").trim();
  state.w8NativeVideoWindowSwapchainReason = String(probe.reason || "")
    .replace(/\s+/g, " ")
    .slice(0, 160);
  updateHostDiagnostics({
    w8NativeVideoWindowSwapchainReady: state.w8NativeVideoWindowSwapchainReady,
    w8NativeVideoWindowSwapchainMode: state.w8NativeVideoWindowSwapchainMode,
    w8NativeVideoWindowSwapchainStatus: state.w8NativeVideoWindowSwapchainStatus,
    w8NativeVideoWindowSwapchainFormat: state.w8NativeVideoWindowSwapchainFormat,
    w8NativeVideoWindowSwapchainWidth: state.w8NativeVideoWindowSwapchainWidth,
    w8NativeVideoWindowSwapchainHeight: state.w8NativeVideoWindowSwapchainHeight,
    w8NativeVideoWindowSwapchainBufferCount: state.w8NativeVideoWindowSwapchainBufferCount,
    w8NativeVideoWindowSwapchainSwapEffect: state.w8NativeVideoWindowSwapchainSwapEffect,
    w8NativeVideoWindowSwapchainReason: state.w8NativeVideoWindowSwapchainReason,
  });
}

function probeW8NativeVideoDecoder() {
  const invoke = getTauriInvoke();
  if (!invoke) return Promise.resolve(null);
  if (state.w8NativeVideoDecoderProbePromise) {
    return state.w8NativeVideoDecoderProbePromise;
  }
  state.w8NativeVideoDecoderProbePromise = invoke("probe_w8_native_video_decoder")
    .then((probe) => {
      updateW8NativeVideoDecoderProbeDiagnostics(probe);
      return probe;
    })
    .catch((error) => {
      state.w8NativeVideoDecoderReady = false;
      state.w8NativeVideoDecoderMode = "media-foundation-h264-d3d11-probe";
      state.w8NativeVideoDecoderReason = String(error?.message || error || "probe failed")
        .replace(/\s+/g, " ")
        .slice(0, 160);
      updateHostDiagnostics({
        w8NativeVideoDecoderReady: state.w8NativeVideoDecoderReady,
        w8NativeVideoDecoderMode: state.w8NativeVideoDecoderMode,
        w8NativeVideoDecoderReason: state.w8NativeVideoDecoderReason,
      });
      return null;
    })
    .finally(() => {
      state.w8NativeVideoDecoderProbePromise = null;
    });
  return state.w8NativeVideoDecoderProbePromise;
}

function probeW8NativeVideoWindowSwapchain() {
  const invoke = getTauriInvoke();
  if (!invoke) return Promise.resolve(null);
  if (state.w8NativeVideoWindowSwapchainProbePromise) {
    return state.w8NativeVideoWindowSwapchainProbePromise;
  }
  state.w8NativeVideoWindowSwapchainProbePromise = invoke("probe_w8_native_video_window_swapchain")
    .then((probe) => {
      updateW8NativeVideoWindowSwapchainDiagnostics(probe);
      return probe;
    })
    .catch((error) => {
      state.w8NativeVideoWindowSwapchainReady = false;
      state.w8NativeVideoWindowSwapchainMode = "d3d11-hwnd-swapchain-preflight";
      state.w8NativeVideoWindowSwapchainStatus = "blocked";
      state.w8NativeVideoWindowSwapchainFormat = "BGRA8";
      state.w8NativeVideoWindowSwapchainBufferCount = 2;
      state.w8NativeVideoWindowSwapchainSwapEffect = "flip-discard";
      state.w8NativeVideoWindowSwapchainReason = String(error?.message || error || "probe failed")
        .replace(/\s+/g, " ")
        .slice(0, 160);
      updateHostDiagnostics({
        w8NativeVideoWindowSwapchainReady: state.w8NativeVideoWindowSwapchainReady,
        w8NativeVideoWindowSwapchainMode: state.w8NativeVideoWindowSwapchainMode,
        w8NativeVideoWindowSwapchainStatus: state.w8NativeVideoWindowSwapchainStatus,
        w8NativeVideoWindowSwapchainFormat: state.w8NativeVideoWindowSwapchainFormat,
        w8NativeVideoWindowSwapchainBufferCount: state.w8NativeVideoWindowSwapchainBufferCount,
        w8NativeVideoWindowSwapchainSwapEffect: state.w8NativeVideoWindowSwapchainSwapEffect,
        w8NativeVideoWindowSwapchainReason: state.w8NativeVideoWindowSwapchainReason,
      });
      return null;
    })
    .finally(() => {
      state.w8NativeVideoWindowSwapchainProbePromise = null;
    });
  return state.w8NativeVideoWindowSwapchainProbePromise;
}

async function ensureW8NativeVideoSession() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  if (state.w8NativeVideoSessionStarted) {
    return state.w8NativeVideoLastSnapshot;
  }
  if (state.w8NativeVideoSessionPromise) {
    return state.w8NativeVideoSessionPromise;
  }

  const request = {
    host: state.activeHost || elements.hostInput.value.trim() || undefined,
    port: getW8NativeVideoPort(),
    requestedFps: getW8NativeVideoFps(),
    rendererMode: "native-video-queue-mvp",
    targetQueueMs: 80,
    hardMaxQueueMs: 180,
    maxFrames: 96,
  };

  state.w8NativeVideoSessionPromise = invoke("start_w8_native_video_session", { request })
    .then((snapshot) => {
      state.w8NativeVideoSessionStarted = true;
      state.w8NativeVideoLastSnapshot = snapshot || null;
      state.w8NativeVideoLastError = "";
      updateW8NativeVideoDiagnostics({ snapshot });
      void probeW8NativeVideoDecoder();
      void probeW8NativeVideoWindowSwapchain();
      return snapshot || null;
    })
    .catch((error) => {
      state.w8NativeVideoErrors += 1;
      updateW8NativeVideoDiagnostics({ error: error?.message || String(error) });
      if (state.w8NativeVideoErrors <= 3) {
        addLog("W8 原生视频", state.w8NativeVideoLastError || "原生视频会话启动失败");
      }
      return null;
    })
    .finally(() => {
      state.w8NativeVideoSessionPromise = null;
    });

  return state.w8NativeVideoSessionPromise;
}

async function pushW8NativeH264AnnexBFrameNow(frame, dataBase64) {
  const invoke = getTauriInvoke();
  if (!invoke || !dataBase64) return null;

  const session = await ensureW8NativeVideoSession();
  if (!session && !state.w8NativeVideoSessionStarted) {
    return null;
  }

  try {
    const id = Math.max(0, Math.trunc(Number(frame.frameId ?? state.videoFrames) || 0));
    const receivedAtMs = Math.max(0, Math.round(Number(performance.now()) || 0));
    const result = await invoke("push_w8_native_h264_annexb_frame", {
      request: {
        id,
        receivedAtMs,
        dataBase64,
      },
    });
    state.w8NativeVideoFramesPushed += 1;
    state.w8NativeVideoLastError = "";
    state.w8NativeVideoLastSnapshot = {
      ...(state.w8NativeVideoLastSnapshot || {}),
      queue: {
        ...((state.w8NativeVideoLastSnapshot || {}).queue || {}),
        queuedFrames: Math.max(0, Math.round(Number(result?.video?.queueLength) || Number(result?.video?.queuedFrames) || 0)),
        queueMs: Number(result?.video?.queueMs) || 0,
        lastReason: result?.video?.reason || "",
      },
    };
    updateW8NativeVideoDiagnostics({ pushResult: result });
    return result;
  } catch (error) {
    state.w8NativeVideoErrors += 1;
    updateW8NativeVideoDiagnostics({ error: error?.message || String(error) });
    if (state.w8NativeVideoErrors <= 3) {
      addLog("W8 原生视频", state.w8NativeVideoLastError || "H.264 帧推送失败");
    }
    return null;
  }
}

function pushW8NativeH264AnnexBFrame(frame, dataBase64) {
  const previousPush = state.w8NativeVideoPushPromise || Promise.resolve();
  const queuedPush = previousPush
    .catch(() => null)
    .then(() => pushW8NativeH264AnnexBFrameNow(frame, dataBase64));
  state.w8NativeVideoPushPromise = queuedPush.catch(() => null);
  return queuedPush;
}

function canUseDesktopFileClipboard() {
  return Boolean(getTauriInvoke());
}

function canUseDesktopHostControl() {
  return Boolean(getTauriInvoke());
}

function getLocalHostPort() {
  const port = Number(elements.localHostPortInput.value);
  if (!Number.isFinite(port)) return 43770;
  return Math.max(1025, Math.min(65535, Math.trunc(port)));
}

function buildLocalHostReadinessRequest(extra = {}) {
  return {
    host: "0.0.0.0",
    port: getLocalHostPort(),
    profile: elements.localHostReadinessProfileSelect.value,
    probeMedia: Boolean(elements.localHostProbeMediaToggle?.checked),
    checkBoard: true,
    ...extra,
  };
}

function buildLocalHostStatusRequest(extra = {}) {
  return {
    host: "127.0.0.1",
    port: getLocalHostPort(),
    checkBoard: true,
    ...extra,
  };
}

function buildMacAlertWatcherRequest(extra = {}) {
  return {
    server: defaultAgentLinkServer,
    ...extra,
  };
}

function buildLocalHostLaunchRequest() {
  return {
    host: "0.0.0.0",
    port: getLocalHostPort(),
    password: elements.localHostPasswordInput.value,
    screenMode: elements.localHostScreenModeSelect.value,
    audioMode: elements.localHostAudioModeSelect.value,
    inputMode: elements.localHostInputModeSelect.value,
    reverseControlMode: elements.localHostReverseControlModeSelect.value,
  };
}

function setLocalHostBadge(mode, text) {
  elements.localHostBadge.className = `status-badge ${mode}`;
  elements.localHostBadge.textContent = text;
}

function setLocalHostStatus(text) {
  elements.localHostStatusText.textContent = text;
}

function setLocalMacAlertWatcherBadge(mode, text) {
  elements.localMacAlertWatcherBadge.className = `status-badge ${mode}`;
  elements.localMacAlertWatcherBadge.textContent = text;
}

function normalizeMacAlertWatcherPayload(result) {
  if (result?.json && typeof result.json === "object") return result.json;
  if (result && typeof result === "object" && Object.prototype.hasOwnProperty.call(result, "running")) {
    return result;
  }
  return null;
}

function shouldRefreshMacAlertWatcherStatus(now = Date.now()) {
  return (
    !state.localMacAlertWatcherStatusCheckedAt ||
    now - state.localMacAlertWatcherStatusCheckedAt >= localMacAlertWatcherStatusPollMs
  );
}

function formatMacAlertWatcherLastAlert(payload) {
  const alerts = Array.isArray(payload?.recentAlerts) ? payload.recentAlerts : [];
  const lastAlert = payload?.lastAlert || (alerts.length ? alerts[alerts.length - 1] : null);
  if (!lastAlert || typeof lastAlert !== "object") return "";
  const parts = [
    lastAlert.title,
    lastAlert.message || lastAlert.summary,
  ].filter(Boolean);
  return compactExportStatusText(parts.join(" · "), 180);
}

function macAlertWatcherPayloadFindingText(payload) {
  if (!payload || typeof payload !== "object") return "";
  const alerts = Array.isArray(payload.recentAlerts) ? payload.recentAlerts : [];
  const parts = [payload.message];
  for (const alert of [...alerts, payload.lastAlert]) {
    if (!alert || typeof alert !== "object") continue;
    parts.push(alert.title, alert.message, alert.summary);
  }
  return parts.filter(Boolean).join(" ");
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeCommandPort(value, fallback = defaultControlPort) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? String(port) : fallback;
}

function macHeartbeatCommandPort() {
  return normalizeCommandPort(state.activePort || elements.portInput.value || defaultControlPort);
}

function macHeartbeatCommandServer() {
  const request = buildMacAlertWatcherRequest();
  return request.server || defaultAgentLinkServer;
}

function buildDefaultMacHeartbeatCommand(key) {
  const spec = macHeartbeatCommandSpecs[key];
  if (!spec) return "";
  const port = macHeartbeatCommandPort();
  const server = macHeartbeatCommandServer();
  const args = spec.defaultArgs.map((arg) => {
    if (arg === "{port}") return port;
    if (arg === "{server}") return server;
    return arg;
  });
  return ["node", `scripts/mac/${spec.script}`, ...args].join(" ");
}

function extractLabeledCommandValue(text, label) {
  const source = String(text || "");
  const match = new RegExp(`\\b${escapeRegExp(label)}\\s*=`, "i").exec(source);
  if (!match) return "";
  const start = match.index + match[0].length;
  const tail = source.slice(start);
  const boundary = /[;；\r\n]|[.。]\s+(?=(?:MacHeartbeat|Mac[A-Z][A-Za-z]+|Windows[A-Z][A-Za-z]+|RerunFormalLocalSmoke|FormalChecklist|ManualChecklist|WinClient|No password)\b)|\s+No password\b/i.exec(tail);
  const value = (boundary ? tail.slice(0, boundary.index) : tail)
    .trim()
    .replace(/[.。；;，,\s]+$/g, "");
  return value;
}

function hasSensitiveCommandPart(command) {
  return /--password\b|password\s*=|token|secret|passwd|pwd/i.test(String(command || ""));
}

function commandHasFlag(command, flag) {
  return new RegExp(`(^|\\s)${escapeRegExp(flag)}(\\s|$)`).test(String(command || ""));
}

function isSafeMacHeartbeatCommand(key, command) {
  const spec = macHeartbeatCommandSpecs[key];
  const text = String(command || "").trim();
  if (!spec || !text || hasSensitiveCommandPart(text)) return false;
  const scriptPattern = new RegExp(`^node\\s+scripts[\\\\/]mac[\\\\/]${escapeRegExp(spec.script)}\\b`, "i");
  if (!scriptPattern.test(text)) return false;
  for (const flag of spec.required || []) {
    if (!commandHasFlag(text, flag)) return false;
  }
  for (const flag of spec.forbidden || []) {
    if (commandHasFlag(text, flag)) return false;
  }
  return true;
}

function macHeartbeatCommandSourceText() {
  return [
    state.localMacAlertWatcherFindingText,
    elements.localMacAlertWatcherStatusText.textContent,
    elements.localHostOutput.textContent,
  ]
    .filter(Boolean)
    .join(" ");
}

function getMacHeartbeatCommands() {
  const source = macHeartbeatCommandSourceText();
  const commands = {};
  for (const key of Object.keys(macHeartbeatCommandSpecs)) {
    const spec = macHeartbeatCommandSpecs[key];
    const extracted = extractLabeledCommandValue(source, spec.label);
    commands[key] = isSafeMacHeartbeatCommand(key, extracted)
      ? extracted
      : buildDefaultMacHeartbeatCommand(key);
  }
  return commands;
}

function setMacHeartbeatCommandButtonFeedback(button, text) {
  if (!button) return;
  const label = button.dataset.label || macHeartbeatCommandSpecs[button.dataset.macHeartbeatCommand]?.text || "";
  const icon = button.querySelector("span")?.textContent || "";
  button.textContent = "";
  const iconElement = document.createElement("span");
  iconElement.setAttribute("aria-hidden", "true");
  iconElement.textContent = icon;
  button.append(iconElement, ` ${text}`);
  window.setTimeout(() => {
    button.textContent = "";
    const resetIcon = document.createElement("span");
    resetIcon.setAttribute("aria-hidden", "true");
    resetIcon.textContent = icon;
    button.append(resetIcon, ` ${label}`);
  }, 1400);
}

function updateMacHeartbeatCommandButtons() {
  const commands = getMacHeartbeatCommands();
  for (const button of elements.localMacHeartbeatCommandButtons) {
    const key = button.dataset.macHeartbeatCommand;
    const command = commands[key] || "";
    button.disabled = !command;
    button.title = command ? `复制 Mac 端执行命令：${command}` : "没有可复制的 Mac 心跳命令";
  }
}

async function copyMacHeartbeatCommand(key, button) {
  const spec = macHeartbeatCommandSpecs[key];
  const command = getMacHeartbeatCommands()[key] || "";
  if (!spec || !command) return;
  try {
    await writeTextToClipboard(command);
    setMacHeartbeatCommandButtonFeedback(button, "已复制");
    addLog("Mac 心跳命令", `已复制 ${spec.logText}`);
    renderLocalHostOutput([
      `[INFO] 已复制 ${spec.label}: ${command}`,
      "[INFO] 这条命令需要在 Mac 端执行；Windows 端未认证、未发送输入。",
    ]);
  } catch (error) {
    setMacHeartbeatCommandButtonFeedback(button, "复制失败");
    addLog("Mac 心跳命令", error?.message || "当前环境不允许写入剪贴板");
  }
}

function parseMacAlertWatcherFindingAttention(payload) {
  return parseMacUnattendedAttention(macAlertWatcherPayloadFindingText(payload));
}

function macAlertWatcherUiState(payload, { available = canUseDesktopHostControl(), busy = false } = {}) {
  if (!available) {
    return {
      running: false,
      badgeMode: "offline",
      badgeText: "需桌面版",
      statusText: "桌面版可开启 Windows 浮窗提醒，接住 Mac 端授权、权限和反控等待消息。",
      toggleText: "开启提醒",
      toggleIcon: "◌",
    };
  }
  if (busy) {
    return {
      running: state.localMacAlertWatcherRunning,
      badgeMode: "connecting",
      badgeText: "处理中",
      statusText: "正在处理 Mac 提醒 watcher...",
      toggleText: state.localMacAlertWatcherRunning ? "停止提醒" : "开启提醒",
      toggleIcon: state.localMacAlertWatcherRunning ? "■" : "◌",
    };
  }
  if (!payload || payload.ok === false) {
    return {
      running: false,
      badgeMode: "offline",
      badgeText: "未知",
      statusText: payload?.message || "暂时无法读取 Windows 浮窗提醒状态。",
      toggleText: "开启提醒",
      toggleIcon: "◌",
    };
  }
  const running = payload.running === true;
  const processIds = Array.isArray(payload.processIds) ? payload.processIds.filter(Boolean) : [];
  const processText = running && processIds.length > 0 ? `，PID ${processIds.join(", ")}` : "";
  const serverText = payload.server ? `，监听 ${payload.server}` : "";
  const lastAlertText = formatMacAlertWatcherLastAlert(payload);
  const lastAlertSuffix = lastAlertText ? ` 最近提醒：${lastAlertText}。` : "";
  const findingAttention = parseMacAlertWatcherFindingAttention(payload);
  const findingSummary = findingAttention.summary;
  const evidenceSummary = findingAttention.evidenceSummary;
  const findingSuffix = findingSummary ? ` 风险：${findingSummary}。` : "";
  const evidenceSuffix = evidenceSummary ? ` 证据：${evidenceSummary}。` : "";
  return {
    running,
    badgeMode: running ? "online" : "offline",
    badgeText: running ? "提醒中" : "未开启",
    statusText: running
      ? `Windows 浮窗提醒已开启${processText}${serverText}。${lastAlertSuffix}${findingSuffix}${evidenceSuffix}`
      : `Windows 浮窗提醒未开启；可一键启动后接收 Mac 授权、权限和反控等待消息。${lastAlertSuffix}${findingSuffix}${evidenceSuffix}`,
    toggleText: running ? "停止提醒" : "开启提醒",
    toggleIcon: running ? "■" : "◌",
  };
}

function applyMacAlertWatcherResult(result) {
  const payload = normalizeMacAlertWatcherPayload(result);
  const view = macAlertWatcherUiState(payload);
  state.localMacAlertWatcherStatusCheckedAt = Date.now();
  state.localMacAlertWatcherRunning = view.running;
  state.localMacAlertWatcherFindingText = macAlertWatcherPayloadFindingText(payload);
  setLocalMacAlertWatcherBadge(view.badgeMode, view.badgeText);
  elements.localMacAlertWatcherStatusText.textContent = view.statusText;
  elements.localMacAlertWatcherToggleButton.lastChild.textContent = ` ${view.toggleText}`;
  elements.localMacAlertWatcherToggleButton.querySelector("span").textContent = view.toggleIcon;
  updateLocalMacAlertWatcherControls();
}

function applyMacAlertWatcherError(error) {
  state.localMacAlertWatcherStatusCheckedAt = Date.now();
  state.localMacAlertWatcherRunning = false;
  state.localMacAlertWatcherFindingText = "";
  setLocalMacAlertWatcherBadge("offline", "不可用");
  elements.localMacAlertWatcherStatusText.textContent = error?.message || "读取 Windows 浮窗提醒状态失败。";
  elements.localMacAlertWatcherToggleButton.lastChild.textContent = " 开启提醒";
  elements.localMacAlertWatcherToggleButton.querySelector("span").textContent = "◌";
  updateLocalMacAlertWatcherControls();
}

function renderLocalHostOutput(lines = []) {
  elements.localHostOutput.textContent = lines.slice(-80).join("\n");
  elements.localHostOutput.scrollTop = elements.localHostOutput.scrollHeight;
}

function localHostCommandLines(result) {
  const lines = [];
  if (result?.stdout) lines.push(...result.stdout.trim().split(/\r?\n/).filter(Boolean));
  if (result?.stderr) {
    lines.push(...result.stderr.trim().split(/\r?\n/).filter(Boolean).map((line) => `[ERR] ${line}`));
  }
  return lines;
}

function readinessSummary(result) {
  const details = result?.json;
  if (!details || typeof details !== "object") {
    return result?.ok ? "体检完成。" : "体检未能生成完整结果。";
  }
  const profile = readinessProfileLabel(details.args?.profile || elements.localHostReadinessProfileSelect.value);
  const passed = Number(details.passed ?? 0);
  const failed = Number(details.failed ?? 0);
  const warnings = Number(details.warnings ?? 0);
  const media = readinessMediaStatusText(details);
  return `${profile}体检：通过 ${passed} 项，失败 ${failed} 项，提醒 ${warnings} 条${media ? `；${media}` : ""}。`;
}

function readinessProfileLabel(profile) {
  switch (profile) {
    case "deploy":
      return "部署";
    case "deep":
      return "深度";
    default:
      return "低风险";
  }
}

function readinessMediaAggregateResult(details = {}) {
  if (!details.args?.probeMedia) return null;
  return Array.isArray(details.results)
    ? details.results.find((item) => item.label === "Windows host media aggregate") || null
    : null;
}

function normalizeReadinessMediaStatus(value, ok, passed, failed) {
  if (value === "ok" || value === "partial" || value === "failed") return value;
  if (ok) return "ok";
  const safePassed = Number.isFinite(passed) ? passed : 0;
  const safeFailed = Number.isFinite(failed) ? failed : 0;
  if (Number.isFinite(passed) || Number.isFinite(failed)) {
    return safeFailed === 0 ? "ok" : safePassed > 0 ? "partial" : "failed";
  }
  return "failed";
}

function readinessMediaStatusText(details = {}) {
  if (!details.args?.probeMedia) return "";
  const result = readinessMediaAggregateResult(details);
  if (!result) return "媒体基线缺少结果";
  const summary = result.details?.summary || {};
  const passed = Number(summary.passed);
  const failed = Number(summary.failed);
  const status = normalizeReadinessMediaStatus(summary.status, result.ok, passed, failed);
  if (status === "ok") return "媒体基线正常";
  const countText = Number.isFinite(passed) || Number.isFinite(failed)
    ? `（通过 ${Number.isFinite(passed) ? passed : 0}，失败 ${Number.isFinite(failed) ? failed : 0}）`
    : "";
  return status === "partial" ? `媒体基线部分通过${countText}` : `媒体基线失败${countText}`;
}

function formatReadinessMediaObservation(prefix, observation = {}) {
  if (!observation || typeof observation !== "object") return "";
  const parts = [];
  if (Number.isFinite(Number(observation.frameCount))) parts.push(`${observation.frameCount} 帧`);
  if (Number.isFinite(Number(observation.fps))) parts.push(`${observation.fps} FPS`);
  if (observation.steady?.fps != null) parts.push(`稳态 ${observation.steady.fps} FPS`);
  if (Number.isFinite(Number(observation.maxGapMs))) parts.push(`最大间隔 ${observation.maxGapMs} ms`);
  if (Number.isFinite(Number(observation.maxFrameAgeMs))) parts.push(`帧年龄 ${observation.maxFrameAgeMs} ms`);
  return parts.length > 0 ? `${prefix}${parts.join(" / ")}` : "";
}

function readinessMediaAggregateSummary(item = {}) {
  const details = item.details || {};
  const summary = details.summary || {};
  const passed = Number(summary.passed);
  const failed = Number(summary.failed);
  const status = normalizeReadinessMediaStatus(summary.status, item.ok, passed, failed);
  const statusText = status === "ok" ? "正常" : status === "partial" ? "部分通过" : "失败";
  const countText = Number.isFinite(passed) || Number.isFinite(failed)
    ? `通过 ${Number.isFinite(passed) ? passed : 0}，失败 ${Number.isFinite(failed) ? failed : 0}`
    : "";
  const video = formatReadinessMediaObservation("视频 ", details.video?.observation);
  const audio = formatReadinessMediaObservation("音频 ", details.audio?.observation);
  return [statusText, countText, video, audio].filter(Boolean).join(" · ");
}

function readinessLines(result) {
  const details = result?.json;
  if (!details?.results) return localHostCommandLines(result);
  const args = details.args || {};
  const header = [
    `体检档位：${readinessProfileLabel(args.profile || elements.localHostReadinessProfileSelect.value)}`,
  ];
  if (args.currentBuildId) header.push(`当前代码：${args.currentBuildId}`);
  if (args.maxVideoFrameAgeMs != null) header.push(`视频帧新鲜度阈值：${args.maxVideoFrameAgeMs} ms`);
  if (args.maxAudioFrameAgeMs != null) header.push(`音频帧新鲜度阈值：${args.maxAudioFrameAgeMs} ms`);
  const media = readinessMediaStatusText(details);
  if (media) header.push(`媒体基线：${media.replace(/^媒体基线/, "")}`);
  const boardLine = localHostBoardCallLine(details);
  if (boardLine) header.push(boardLine);
  return [
    ...header,
    ...details.results.flatMap((item) => {
      const marker = item.ok ? "[OK]" : "[FAIL]";
      const summary = item.label === "Windows host media aggregate"
        ? readinessMediaAggregateSummary(item)
        : item.summary || "无摘要";
      const lines = [`${marker} ${item.label} · ${summary}`];
      for (const warning of item.warnings || []) lines.push(warning);
      for (const error of item.errors || []) lines.push(error);
      return lines;
    }),
  ];
}

function normalizeLocalHostHelperStatus(result) {
  if (result?.json && typeof result.json === "object") return result.json;
  if (result && typeof result === "object" && Object.prototype.hasOwnProperty.call(result, "ok")) return result;
  return null;
}

function formatLocalHostScreenStatus(screen = {}) {
  const pipeline = screen.capturePipeline || screen.mode || screen.requestedMode || "";
  const wgc = screen.wgc || {};
  const parts = [
    pipeline ? labelFromMap(pipeline, capturePipelineLabels) : "",
    screen.videoCodec || "",
    screen.videoEncoding || "",
  ].filter(Boolean);
  if (screen.codecString) parts.push(screen.codecString);
  if (wgc.active) {
    parts.push("WGC 已启用");
  } else if (wgc.backendImplemented) {
    parts.push("WGC 已实现");
  } else if (wgc.supported) {
    parts.push("WGC 可用");
  }
  return parts.join(" / ");
}

function formatLocalHostAudioStatus(audio = {}) {
  const parts = [
    audio.mode ? labelFromMap(audio.mode, { mock: "模拟", wasapi: "WASAPI", dshow: "DirectShow" }) : "",
    audio.mockFrames === false ? "真实 PCM" : audio.mockFrames === true ? "模拟帧" : "",
    audio.sampleRate ? `${audio.sampleRate}Hz` : "",
    audio.channels ? `${audio.channels}ch` : "",
  ].filter(Boolean);
  if (audio.backend && !parts.includes(audio.backend)) parts.push(audio.backend);
  return parts.join(" / ");
}

function formatLocalHostInputStatus(input = {}) {
  const parts = [
    input.mode ? labelFromMap(input.mode, inputModeLabels) : "",
    input.backend || "",
    input.helper ? "helper" : "",
  ].filter(Boolean);
  return parts.join(" / ");
}

function normalizeReverseControlMode(value) {
  const mode = String(value ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(reverseControlModeLabels, mode) ? mode : "deny";
}

function localHostReverseControlLastRequest(reverse = {}) {
  const request = reverse?.grant?.lastRequest;
  return request && typeof request === "object" && request.active ? request : null;
}

function formatReverseControlRequestAge(request = {}) {
  const ageMs = Number(request.ageMs);
  if (!Number.isFinite(ageMs) || ageMs < 1000) return "刚刚";
  const seconds = Math.max(1, Math.floor(ageMs / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  return `${Math.floor(seconds / 60)} 分钟前`;
}

function formatLocalHostReverseControlRequestLine(reverse = {}) {
  const request = localHostReverseControlLastRequest(reverse);
  if (!request) return "";
  const requester = request.requester || "Mac";
  return `反控请求：${requester} ${formatReverseControlRequestAge(request)}请求过，已安全拒绝；可点击“临时允许反控”后让对方重试。`;
}

function formatLocalHostReverseControlStatus(reverse = {}) {
  if (!reverse || typeof reverse !== "object" || Object.keys(reverse).length === 0) return "";
  const policy = reverse.policy && typeof reverse.policy === "object" ? reverse.policy : {};
  const mode = normalizeReverseControlMode(reverse.mode || reverse.reverseControlMode || policy.mode);
  if (reverse.supported === false || mode === "disabled") return reverseControlModeLabels.disabled;
  if (reverse.grant?.active) {
    const seconds = Math.max(1, Math.ceil((Number(reverse.grant.remainingMs) || 0) / 1000));
    return `临时允许 ${seconds} 秒`;
  }
  if (localHostReverseControlLastRequest(reverse)) return "刚收到请求";
  if (reverse.autoAccept || policy.autoAccept || mode === "accept") return reverseControlModeLabels.accept;
  if (reverse.requiresConfirmation || policy.requiresConfirmation || mode === "deny") return reverseControlModeLabels.deny;
  return labelFromMap(mode, reverseControlModeLabels);
}

function formatLocalHostClipboardStatus(clipboard = {}) {
  const text = formatClipboardCapability(clipboard.text, clipboard.textMode);
  const file = formatClipboardCapability(clipboard.file, clipboard.fileMode);
  return [
    text ? `文字 ${text}` : "",
    file ? `文件 ${file}` : "",
  ].filter(Boolean).join(" / ");
}

function localHostBoardCallStatus(status = {}) {
  const board = status.board || {};
  if (!board.requested) return null;
  if (!board.ok) {
    return {
      level: "warn",
      activeMacToWindows: false,
      text: `通讯板不可用：${board.error || "读取失败"}`,
    };
  }

  const call = board.currentCall || {};
  if (!call.present) {
    return {
      level: "ok",
      activeMacToWindows: false,
      text: "通讯板：没有待处理呼叫",
    };
  }

  const direction = [call.from, call.need].filter(Boolean).join(" → ");
  const goal = call.goal || "";
  const summary = [direction, goal].filter(Boolean).join(" · ");
  const activeMacToWindows = Boolean(call.active && call.needsWindows && call.fromMacSide);
  if (activeMacToWindows) {
    return {
      level: "call",
      activeMacToWindows: true,
      text: `通讯板：Mac 正在请求 Windows 配合${summary ? ` · ${summary}` : ""}`,
    };
  }

  return {
    level: "info",
    activeMacToWindows: false,
    text: `通讯板：currentCall ${call.active ? "非 Windows 待办" : "已完成/非待办"}${summary ? ` · ${summary}` : ""}`,
  };
}

function localHostBoardCallLine(status = {}) {
  const callStatus = localHostBoardCallStatus(status);
  if (!callStatus) return "";
  const prefix = callStatus.level === "call"
    ? "[CALL]"
    : callStatus.level === "warn"
      ? "[WARN]"
      : callStatus.level === "ok"
        ? "[OK]"
        : "[INFO]";
  return `${prefix} ${callStatus.text}`;
}

function localHostHelperStatusSummary(status, { managedPid = "" } = {}) {
  if (!status) return "";
  const boardCall = localHostBoardCallStatus(status);
  const boardText = boardCall?.activeMacToWindows ? "通讯板有 Mac→Windows 呼叫" : "";
  if (!status.ok) {
    const reason = status.error?.message || "端口没有响应";
    return `本机被控未在线：${reason}${boardText ? ` · ${boardText}` : ""}`;
  }

  const runtimeText = formatHostRuntimeDiagnostics(status.runtime);
  const screenText = formatLocalHostScreenStatus(status.capabilities?.screen || {});
  const audioText = formatLocalHostAudioStatus(status.capabilities?.audio || {});
  const reverseText = formatLocalHostReverseControlStatus(status.capabilities?.reverseControl || {});
  const parts = [
    managedPid ? `PID ${managedPid}` : runtimeText,
    screenText ? `画面 ${screenText}` : "",
    audioText ? `声音 ${audioText}` : "",
    reverseText ? `反控 ${reverseText}` : "",
    boardText,
  ].filter(Boolean);
  return `本机被控${managedPid ? "正在运行" : "已在线"}：${parts.join(" · ") || "/discovery 在线"}`;
}

function localHostHelperStatusLines(result) {
  const status = normalizeLocalHostHelperStatus(result);
  if (!status) return [];

  const target = status.probe?.url || `${status.probe?.host || "127.0.0.1"}:${status.probe?.port || getLocalHostPort()}`;
  const boardLine = localHostBoardCallLine(status);
  if (!status.ok) {
    return [
      `[WARN] 状态助手：/discovery 离线 ${target}`,
      boardLine,
      status.error?.message ? `[WARN] ${status.error.message}` : "",
      ...(status.suggestions || []).map((line) => `[INFO] ${line}`),
    ].filter(Boolean);
  }

  const lines = [`[OK] 状态助手：/discovery 在线 ${target}`];
  if (boardLine) lines.push(boardLine);
  const runtimeText = formatHostRuntimeDiagnostics(status.runtime);
  const screenText = formatLocalHostScreenStatus(status.capabilities?.screen || {});
  const audioText = formatLocalHostAudioStatus(status.capabilities?.audio || {});
  const inputText = formatLocalHostInputStatus(status.capabilities?.input || {});
  const reverseText = formatLocalHostReverseControlStatus(status.capabilities?.reverseControl || {});
  const reverseRequestLine = formatLocalHostReverseControlRequestLine(status.capabilities?.reverseControl || {});
  const clipboardText = formatLocalHostClipboardStatus(status.capabilities?.clipboard || {});
  if (runtimeText) lines.push(`运行：${runtimeText}`);
  if (screenText) lines.push(`画面：${screenText}`);
  if (audioText) lines.push(`声音：${audioText}`);
  if (inputText) lines.push(`输入：${inputText}`);
  if (reverseText) lines.push(`反控：${reverseText}`);
  if (reverseRequestLine) lines.push(reverseRequestLine);
  if (clipboardText) lines.push(`剪贴板：${clipboardText}`);
  for (const warning of status.warnings || []) lines.push(`[WARN] ${warning}`);
  if (status.buildDiff?.message) {
    lines.push(status.buildDiff.changed ? `[WARN] ${status.buildDiff.message}` : `[INFO] ${status.buildDiff.message}`);
  }
  return lines;
}

function updateLocalMacAlertWatcherControls() {
  const available = canUseDesktopHostControl();
  const busy = state.localMacAlertWatcherBusy;
  elements.localMacAlertWatcherToggleButton.disabled = !available || busy;
  elements.localMacAlertWatcherRefreshButton.disabled = !available || busy;
  if (!available || busy) {
    const view = macAlertWatcherUiState(null, { available, busy });
    setLocalMacAlertWatcherBadge(view.badgeMode, view.badgeText);
    elements.localMacAlertWatcherStatusText.textContent = view.statusText;
    elements.localMacAlertWatcherToggleButton.lastChild.textContent = ` ${view.toggleText}`;
    elements.localMacAlertWatcherToggleButton.querySelector("span").textContent = view.toggleIcon;
  }
  updateMacHeartbeatCommandButtons();
}

function updateLocalHostControls() {
  const available = canUseDesktopHostControl();
  const busy = state.localHostBusy;
  elements.localHostReadinessButton.disabled = !available || busy;
  elements.localHostStartButton.disabled = !available || busy || state.localHostRunning || state.localHostOnline;
  elements.localHostFirewallButton.disabled = !available || busy;
  elements.localHostStopButton.disabled = !available || busy || !state.localHostRunning;
  elements.localHostReverseGrantButton.disabled = !available || busy || !state.localHostOnline;
  [
    elements.localHostPortInput,
    elements.localHostPasswordInput,
    elements.localHostScreenModeSelect,
    elements.localHostAudioModeSelect,
    elements.localHostInputModeSelect,
    elements.localHostReverseControlModeSelect,
  ].forEach((element) => {
    element.disabled = !available || busy || state.localHostRunning;
  });
  elements.localHostReadinessProfileSelect.disabled = !available || busy;
  if (elements.localHostProbeMediaToggle) {
    elements.localHostProbeMediaToggle.disabled = !available || busy;
  }

  if (!available) {
    setLocalHostBadge("offline", "需桌面版");
    setLocalHostStatus("当前是浏览器预览版，桌面版可以启动本机 Windows 被控端。");
    return;
  }
  if (busy) {
    setLocalHostBadge("connecting", "处理中");
    return;
  }
  if (state.localHostRunning) {
    setLocalHostBadge("online", "运行中");
    return;
  }
  if (state.localHostOnline) {
    setLocalHostBadge("online", "已在线");
    return;
  }
  setLocalHostBadge("offline", "可启动");
}

function setLocalHostBusy(busy, text = "") {
  state.localHostBusy = busy;
  if (text) setLocalHostStatus(text);
  updateLocalHostControls();
}

function applyLocalHostSnapshot(snapshot) {
  state.localHostRunning = Boolean(snapshot?.running);
  const helperStatus = normalizeLocalHostHelperStatus(snapshot?.helperStatusResult);
  state.localHostOnline = Boolean(helperStatus?.ok || snapshot?.discovery);
  const logs = Array.isArray(snapshot?.logs) ? snapshot.logs : [];
  const helperLines = localHostHelperStatusLines(snapshot?.helperStatusResult);
  const helperErrorLine = snapshot?.helperStatusError ? [`[WARN] 状态助手读取失败：${snapshot.helperStatusError}`] : [];
  renderLocalHostOutput([...logs, ...helperLines, ...helperErrorLine]);
  const pidText = snapshot?.pid ? `PID ${snapshot.pid}` : "未运行";
  const discovery = snapshot?.discovery || {};
  const video = discovery.capturePipeline || discovery.source || discovery.hostMode || "";
  const audio = discovery.audioMode || discovery.audioCodec || "";
  const detail = [pidText, video && `画面 ${video}`, audio && `声音 ${audio}`].filter(Boolean).join(" · ");
  const helperSummary = localHostHelperStatusSummary(helperStatus, { managedPid: snapshot?.pid || "" });
  setLocalHostStatus(helperSummary || snapshot?.message || (detail ? `本机被控：${detail}` : "本机被控状态已刷新。"));
  if (detail && snapshot?.running) {
    setLocalHostStatus(helperSummary || `本机被控正在运行：${detail}`);
  }
  updateLocalHostControls();
}

async function refreshLocalHostProcessStatus() {
  const invoke = getTauriInvoke();
  if (!invoke) {
    updateLocalHostControls();
    updateLocalMacAlertWatcherControls();
    return;
  }
  try {
    const shouldRefreshWatcher = shouldRefreshMacAlertWatcherStatus();
    const [snapshotResult, helperResult, watcherResult] = await Promise.allSettled([
      invoke("get_windows_host_status"),
      invoke("get_windows_host_helper_status", {
        request: buildLocalHostStatusRequest(),
      }),
      shouldRefreshWatcher
        ? invoke("get_mac_alert_watcher_status", {
            request: buildMacAlertWatcherRequest(),
          })
        : Promise.resolve(null),
    ]);
    if (snapshotResult.status === "rejected" && helperResult.status === "rejected") {
      throw snapshotResult.reason;
    }
    const snapshot = snapshotResult.status === "fulfilled"
      ? snapshotResult.value
      : {
          running: false,
          logs: [],
          message: snapshotResult.reason?.message || "读取本机被控进程状态失败。",
        };
    if (helperResult.status === "fulfilled") {
      snapshot.helperStatusResult = helperResult.value;
    } else {
      snapshot.helperStatusError = helperResult.reason?.message || String(helperResult.reason || "");
    }
    applyLocalHostSnapshot(snapshot);
    if (!shouldRefreshWatcher) {
      updateLocalMacAlertWatcherControls();
    } else if (watcherResult.status === "fulfilled") {
      applyMacAlertWatcherResult(watcherResult.value);
    } else {
      applyMacAlertWatcherError(watcherResult.reason);
    }
  } catch (error) {
    setLocalHostStatus(error?.message || "读取本机被控状态失败。");
    updateLocalHostControls();
    updateLocalMacAlertWatcherControls();
  }
}

function startLocalHostPolling() {
  if (state.localHostPollTimer || !canUseDesktopHostControl()) return;
  state.localHostPollTimer = window.setInterval(() => {
    void refreshLocalHostProcessStatus();
  }, 2500);
}

async function runLocalHostReadiness() {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  const profile = readinessProfileLabel(elements.localHostReadinessProfileSelect.value);
  setLocalHostBusy(true, `正在运行${profile}体检...`);
  renderLocalHostOutput([]);
  try {
    const result = await invoke("run_windows_host_readiness", {
      request: buildLocalHostReadinessRequest(),
    });
    setLocalHostStatus(readinessSummary(result));
    renderLocalHostOutput(readinessLines(result));
    addLog("本机被控体检", readinessSummary(result));
  } catch (error) {
    setLocalHostStatus(error?.message || "本机被控体检失败。");
    renderLocalHostOutput([error?.message || String(error)]);
  } finally {
    setLocalHostBusy(false);
  }
}

async function previewLocalHostFirewallRule() {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  setLocalHostBusy(true, "正在生成防火墙放行预览...");
  try {
    const result = await invoke("preview_windows_firewall_rule", {
      request: buildLocalHostReadinessRequest(),
    });
    setLocalHostStatus("防火墙放行预览已生成，不会修改系统设置。");
    renderLocalHostOutput(localHostCommandLines(result));
    addLog("本机防火墙预览", result.ok ? "已生成预览命令" : "预览检查返回提醒");
  } catch (error) {
    setLocalHostStatus(error?.message || "防火墙预览失败。");
    renderLocalHostOutput([error?.message || String(error)]);
  } finally {
    setLocalHostBusy(false);
  }
}

async function startLocalWindowsHost() {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  const request = buildLocalHostLaunchRequest();
  if (!request.password.trim()) {
    setLocalHostStatus("请先输入被控密码。");
    return;
  }
  setLocalHostBusy(true, "正在启动本机 Windows 被控端...");
  renderLocalHostOutput([]);
  try {
    const snapshot = await invoke("start_windows_host", { request });
    applyLocalHostSnapshot(snapshot);
    addLog("本机被控启动", snapshot?.message || "Windows 被控端已启动");
  } catch (error) {
    state.localHostRunning = false;
    setLocalHostStatus(error?.message || "启动本机 Windows 被控端失败。");
    renderLocalHostOutput([error?.message || String(error)]);
  } finally {
    setLocalHostBusy(false);
  }
}

async function stopLocalWindowsHost() {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  setLocalHostBusy(true, "正在停止本机 Windows 被控端...");
  try {
    const snapshot = await invoke("stop_windows_host");
    applyLocalHostSnapshot(snapshot);
    addLog("本机被控停止", snapshot?.message || "Windows 被控端已停止");
  } catch (error) {
    setLocalHostStatus(error?.message || "停止本机 Windows 被控端失败。");
    renderLocalHostOutput([error?.message || String(error)]);
  } finally {
    setLocalHostBusy(false);
  }
}

async function grantLocalHostReverseControl() {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  setLocalHostBusy(true, "正在短时允许下一次反控请求...");
  try {
    const result = await invoke("grant_windows_host_reverse_control", {
      request: {
        port: getLocalHostPort(),
        durationMs: 30000,
      },
    });
    const grant = result?.json?.reverseControlGrant || {};
    const seconds = Math.max(1, Math.ceil((Number(grant.remainingMs) || 30000) / 1000));
    setLocalHostStatus(`已临时允许下一次 Mac 反控请求，约 ${seconds} 秒内有效，使用后自动关闭。`);
    renderLocalHostOutput(localHostCommandLines(result));
    addLog("本机反控授权", `已临时允许下一次请求，约 ${seconds} 秒有效`);
    await refreshLocalHostProcessStatus();
  } catch (error) {
    setLocalHostStatus(error?.message || "临时允许反控失败。");
    renderLocalHostOutput([error?.message || String(error)]);
  } finally {
    setLocalHostBusy(false);
  }
}

function setMacAlertWatcherBusy(busy, text = "") {
  state.localMacAlertWatcherBusy = busy;
  if (text) elements.localMacAlertWatcherStatusText.textContent = text;
  updateLocalMacAlertWatcherControls();
}

async function refreshMacAlertWatcherStatus({ quiet = false } = {}) {
  const invoke = getTauriInvoke();
  if (!invoke) {
    updateLocalMacAlertWatcherControls();
    return;
  }
  if (!quiet) setMacAlertWatcherBusy(true, "正在刷新 Windows 浮窗提醒状态...");
  try {
    const result = await invoke("get_mac_alert_watcher_status", {
      request: buildMacAlertWatcherRequest(),
    });
    state.localMacAlertWatcherBusy = false;
    applyMacAlertWatcherResult(result);
    if (!quiet) addLog("Mac 提醒", normalizeMacAlertWatcherPayload(result)?.running ? "Windows 浮窗提醒已开启" : "Windows 浮窗提醒未开启");
  } catch (error) {
    state.localMacAlertWatcherBusy = false;
    applyMacAlertWatcherError(error);
  }
}

async function toggleMacAlertWatcher() {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  const shouldStop = state.localMacAlertWatcherRunning;
  setMacAlertWatcherBusy(true, shouldStop ? "正在停止 Windows 浮窗提醒..." : "正在开启 Windows 浮窗提醒...");
  try {
    const result = await invoke(shouldStop ? "stop_mac_alert_watcher" : "start_mac_alert_watcher", {
      request: buildMacAlertWatcherRequest(),
    });
    state.localMacAlertWatcherBusy = false;
    applyMacAlertWatcherResult(result);
    const payload = normalizeMacAlertWatcherPayload(result);
    addLog("Mac 提醒", payload?.message || (payload?.running ? "Windows 浮窗提醒已开启" : "Windows 浮窗提醒已停止"));
    renderLocalHostOutput(localHostCommandLines(result));
  } catch (error) {
    state.localMacAlertWatcherBusy = false;
    applyMacAlertWatcherError(error);
    renderLocalHostOutput([error?.message || String(error)]);
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function blobToBase64(blob) {
  return arrayBufferToBase64(await blob.arrayBuffer());
}

function fileClipboardRecoveryText(result = {}) {
  const rootDir = String(result.rootDir || "").trim();
  if (rootDir) {
    return `临时目录：${rootDir}`;
  }

  const paths = Array.isArray(result.paths) ? result.paths.filter(Boolean) : [];
  if (paths.length === 1) {
    return `临时文件：${paths[0]}`;
  }
  if (paths.length > 1) {
    return `临时文件：${paths.length} 个，首个 ${paths[0]}`;
  }
  return "";
}

function fileClipboardRecoveryPath(result = {}) {
  const rootDir = String(result.rootDir || "").trim();
  if (rootDir) return rootDir;
  const paths = Array.isArray(result.paths) ? result.paths.filter(Boolean) : [];
  return paths[0] ? String(paths[0]) : "";
}

function fileClipboardLocalDetail(result = {}, fallback = "文件仍保留在远端文件托盘") {
  const reason = result.reason || fallback;
  const recovery = fileClipboardRecoveryText(result);
  return recovery && !reason.includes(recovery) ? `${reason}；${recovery}` : reason;
}

function renderReceivedFilesStatus() {
  const writeStatus = state.receivedClipboardWriteStatus || {};
  elements.receivedFilesStatus.hidden = !writeStatus.text;
  elements.receivedFilesStatus.textContent = writeStatus.text || "";
  elements.receivedFilesStatus.className = `received-files-status${writeStatus.kind ? ` is-${writeStatus.kind}` : ""}`;
}

function setReceivedFilesWriteStatus(kind = "", text = "") {
  state.receivedClipboardWriteStatus = {
    kind,
    text,
  };
  renderReceivedFilesStatus();
  syncFloatingControlStatus();
}

function describeIncomingFileTransferStatus(transfer = {}) {
  const fileCount = Number(transfer.fileCount) || (Array.isArray(transfer.files) ? transfer.files.length : 0);
  const receivedBytes = Math.max(0, Number(transfer.receivedBytes) || 0);
  const totalBytes = Math.max(0, Number(transfer.totalBytes) || 0);
  const countText = fileCount > 0 ? `${fileCount} 个文件` : "远端文件";
  if (totalBytes > 0) {
    const percent = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
    const rateText = remoteFileTransferRateText(transfer);
    const rateSuffix = rateText ? `，${rateText}` : "";
    return `正在接收 ${countText}：${formatBytes(receivedBytes)}/${formatBytes(totalBytes)}，${percent}%${rateSuffix}。完成后会写入系统文件剪贴板或留在托盘。`;
  }
  const rateText = remoteFileTransferRateText(transfer);
  const rateSuffix = rateText ? `，${rateText}` : "";
  return `正在接收 ${countText}：${formatBytes(receivedBytes)}${rateSuffix}。完成后会写入系统文件剪贴板或留在托盘。`;
}

function touchRemoteFileTransfer(transfer, now = Date.now()) {
  if (!transfer) return;
  transfer.startedAt = Number(transfer.startedAt) || now;
  transfer.lastActivityAt = now;
}

function remoteFileTransferProgressText(transfer = {}) {
  const receivedBytes = Math.max(0, Number(transfer.receivedBytes) || 0);
  const totalBytes = Math.max(0, Number(transfer.totalBytes) || 0);
  const rateText = remoteFileTransferRateText(transfer);
  const rateSuffix = rateText ? `，${rateText}` : "";
  if (totalBytes > 0) {
    return `${formatBytes(receivedBytes)}/${formatBytes(totalBytes)}${rateSuffix}`;
  }
  return `${formatBytes(receivedBytes)}${rateSuffix}`;
}

function remoteFileTransferSampleRateBytesPerSecond(transfer = {}) {
  const samples = Array.isArray(transfer.rateSamples) ? transfer.rateSamples : [];
  let sampleBytes = 0;
  let sampleDurationMs = 0;
  for (const sample of samples) {
    const bytes = Math.max(0, Number(sample?.bytes) || 0);
    const durationMs = Math.max(0, Number(sample?.durationMs) || 0);
    if (bytes <= 0 || durationMs <= 0) continue;
    sampleBytes += bytes;
    sampleDurationMs += durationMs;
  }
  if (sampleBytes <= 0 || sampleDurationMs < 1000) return 0;
  return sampleBytes / (sampleDurationMs / 1000);
}

function formatRemoteTransferEta(seconds) {
  const safeSeconds = Math.max(1, Math.ceil(Number(seconds) || 0));
  if (safeSeconds < 60) return `${safeSeconds} 秒`;
  const minutes = Math.ceil(safeSeconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} 小时`;
}

function outgoingFileTransferRateText(transfer = {}, now = Date.now()) {
  const sentBytes = Math.max(0, Number(transfer.sentBytes) || 0);
  if (sentBytes <= 0) return "";
  return remoteFileTransferRateText({ ...transfer, receivedBytes: sentBytes }, now);
}

function outgoingFileTransferProgressText(transfer = {}) {
  const sentBytes = Math.max(0, Number(transfer.sentBytes) || 0);
  const totalBytes = Math.max(0, Number(transfer.totalBytes) || 0);
  const rateText = outgoingFileTransferRateText(transfer);
  const rateSuffix = rateText ? `，${rateText}` : "";
  if (totalBytes > 0) {
    return `${formatBytes(sentBytes)}/${formatBytes(totalBytes)}${rateSuffix}`;
  }
  return `${formatBytes(sentBytes)}${rateSuffix}`;
}

function describeOutgoingFileTransferStatus(transfer = {}) {
  const fileCount = Number(transfer?.fileCount) || (Array.isArray(transfer?.files) ? transfer.files.length : 0);
  const sentBytes = Math.max(0, Number(transfer?.sentBytes) || 0);
  const totalBytes = Math.max(0, Number(transfer?.totalBytes) || 0);
  const countText = fileCount > 0 ? `${fileCount} 个文件` : "文件";
  if (totalBytes > 0) {
    const percent = Math.min(100, Math.round((sentBytes / totalBytes) * 100));
    return `正在发送 ${countText}：${outgoingFileTransferProgressText(transfer)}，${percent}%`;
  }
  return `正在发送 ${countText}：${outgoingFileTransferProgressText(transfer)}`;
}

function describeLastOutgoingFileTransferStatus(transfer = {}) {
  if (!transfer || transfer.status !== "failed") return "";
  const fileCount = Number(transfer.fileCount) || (Array.isArray(transfer.files) ? transfer.files.length : 0);
  const countText = fileCount > 0 ? `${fileCount} 个文件` : "文件";
  const retryText = transfer.canRetry ? "可重新发送" : "需重新选择文件";
  const errorText = transfer.error ? ` · ${String(transfer.error).replace(/\s+/g, " ").slice(0, 80)}` : "";
  return `文件发送失败 ${countText}：${outgoingFileTransferProgressText(transfer)}，${retryText}${errorText}`;
}

function outgoingFileResultBytesText(result = {}) {
  const receivedBytes = Math.max(0, Number(result.receivedBytes) || 0);
  const totalBytes = Math.max(0, Number(result.totalBytes) || 0);
  if (receivedBytes > 0 && totalBytes > 0 && receivedBytes !== totalBytes) {
    return `${formatBytes(receivedBytes)}/${formatBytes(totalBytes)}`;
  }
  if (totalBytes > 0) {
    return formatBytes(totalBytes);
  }
  if (receivedBytes > 0) {
    return formatBytes(receivedBytes);
  }
  return "";
}

function describeOutgoingFileResultStatus(result = {}) {
  const fileCount = Number(result.fileCount) || (Array.isArray(result.files) ? result.files.length : 0);
  const countText = fileCount > 0 ? `${fileCount} 个文件` : "文件";
  const bytesText = outgoingFileResultBytesText(result);
  const sizeText = bytesText ? `，${bytesText}` : "";
  const reasonText = result.reason
    ? ` · ${String(result.reason).replace(/\s+/g, " ").slice(0, 90)}`
    : "";

  if (!result.accepted) {
    const retryText = result.canRetry ? "，可重新发送" : "";
    return `对端文件接收失败（${countText}${sizeText}）${retryText}${reasonText}`;
  }

  if (result.saveMode === "clipboard") {
    return `对端已接收并写入系统文件剪贴板（${countText}${sizeText}）${reasonText}`;
  }
  if (result.saveMode === "temp") {
    return `对端已接收，系统剪贴板未写入，已保存到临时目录（${countText}${sizeText}）${reasonText}`;
  }
  if (result.saveMode === "memory-only") {
    return `对端已接收，暂存在远端托盘（${countText}${sizeText}）${reasonText}`;
  }
  return `对端已完成文件接收（${countText}${sizeText}）${reasonText}`;
}

function expirePendingOutgoingFileResult(now = Date.now()) {
  const transfer = state.lastOutgoingFileTransfer || {};
  if (transfer.status !== "sent") return 0;
  const lastActivityAt = Number(transfer.lastActivityAt) || Number(transfer.completedAt) || Number(transfer.startedAt) || now;
  const idleMs = now - lastActivityAt;
  if (idleMs < remoteFileTransferStallTimeoutMs) return 0;

  const idleSeconds = Math.max(1, Math.round(idleMs / 1000));
  const reason = `对端确认超时：${outgoingFileTransferProgressText(transfer)}，${idleSeconds} 秒没有收到结果`;
  state.lastOutgoingFileTransfer = {
    ...transfer,
    status: "remote-result",
    accepted: false,
    reason,
    receivedBytes: Math.max(0, Number(transfer.sentBytes) || 0),
    totalBytes: Math.max(0, Number(transfer.totalBytes) || 0),
    fileCount: Number(transfer.fileCount) || (Array.isArray(transfer.files) ? transfer.files.length : 0),
    failedAt: now,
    lastActivityAt: now,
    canRetry: Boolean(transfer.canRetry && (elements.fileClipboardInput.files?.length || 0) > 0),
  };
  const detail = describeOutgoingFileResultStatus(state.lastOutgoingFileTransfer);
  elements.clipboardText.textContent = `剪贴板：${detail}`;
  updateFileClipboardButton();
  syncFloatingControlStatus();
  addLog("文件剪贴板", detail);
  return 1;
}

function remoteFileTransferRateText(transfer = {}, now = Date.now()) {
  const receivedBytes = Math.max(0, Number(transfer.receivedBytes) || 0);
  if (receivedBytes <= 0) return "";
  const startedAt = Number(transfer.startedAt) || 0;
  if (!startedAt) return "";
  const lastActivityAt = Number(transfer.lastActivityAt) || now;
  const elapsedMs = Math.max(1, lastActivityAt - startedAt);
  const sampleRate = remoteFileTransferSampleRateBytesPerSecond(transfer);
  const bytesPerSecond = sampleRate > 0 ? sampleRate : receivedBytes / (elapsedMs / 1000);
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "";

  const totalBytes = Math.max(0, Number(transfer.totalBytes) || 0);
  const remainingBytes = Math.max(0, totalBytes - receivedBytes);
  const etaText = totalBytes > 0 && remainingBytes > 0
    ? `，剩余约 ${formatRemoteTransferEta(remainingBytes / bytesPerSecond)}`
    : "";
  return `速度 ${formatBytes(Math.max(1, Math.round(bytesPerSecond)))}/s${etaText}`;
}

function recordRemoteFileTransferRateSample(transfer, byteCount, now = Date.now()) {
  if (!transfer) return;
  const bytes = Math.max(0, Number(byteCount) || 0);
  const previousActivityAt = Number(transfer.lastActivityAt) || Number(transfer.startedAt) || now;
  touchRemoteFileTransfer(transfer, now);
  if (bytes <= 0) return;
  const durationMs = Math.max(1, now - previousActivityAt);
  if (!Array.isArray(transfer.rateSamples)) {
    transfer.rateSamples = [];
  }
  transfer.rateSamples.push({ bytes, durationMs });
  if (transfer.rateSamples.length > remoteFileTransferRateSampleLimit) {
    transfer.rateSamples.splice(0, transfer.rateSamples.length - remoteFileTransferRateSampleLimit);
  }
}

function rejectRemoteFileTransfer(transferId, reason, { notifyPeer = true, clipboardText = "剪贴板：远端文件接收中断" } = {}) {
  const transfer = state.remoteFileTransfers.get(transferId);
  if (!transfer) {
    return false;
  }

  state.remoteFileTransfers.delete(transferId);
  elements.clipboardText.textContent = clipboardText;
  addLog("文件剪贴板失败", reason);
  setReceivedFilesWriteStatus("warning", `${reason}。已停止接收，请让 Mac 重新复制。`);
  renderReceivedFiles();

  if (notifyPeer) {
    state.client?.sendClipboardFileResult({
      transferId,
      accepted: false,
      code: "LAN011",
      reason,
      receivedBytes: Math.max(0, Number(transfer.receivedBytes) || 0),
      totalBytes: Math.max(0, Number(transfer.totalBytes) || 0),
      fileCount: Number(transfer.fileCount) || (Array.isArray(transfer.files) ? transfer.files.length : 0),
    });
  }
  return true;
}

function rejectAllRemoteFileTransfers(reason, options = {}) {
  let rejected = 0;
  for (const transferId of Array.from(state.remoteFileTransfers.keys())) {
    if (rejectRemoteFileTransfer(transferId, reason, options)) {
      rejected += 1;
    }
  }
  return rejected;
}

function expireStaleRemoteFileTransfers(now = Date.now()) {
  let expired = 0;
  for (const [transferId, transfer] of Array.from(state.remoteFileTransfers.entries())) {
    const lastActivityAt = Number(transfer.lastActivityAt) || Number(transfer.startedAt) || now;
    const idleMs = now - lastActivityAt;
    if (idleMs < remoteFileTransferStallTimeoutMs) {
      continue;
    }

    const idleSeconds = Math.max(1, Math.round(idleMs / 1000));
    const reason = `远端文件接收超时：${remoteFileTransferProgressText(transfer)}，${idleSeconds} 秒没有收到新分块或完成消息`;
    if (rejectRemoteFileTransfer(transferId, reason)) {
      expired += 1;
    }
  }
  return expired;
}

function updateReceivedFilesWriteStatusFromResult(result = {}, fileCount = state.receivedClipboardFiles.length) {
  if (result.clipboardWritten) {
    setReceivedFilesWriteStatus(
      "success",
      `已写入 Windows 系统文件剪贴板（${result.fileCount ?? fileCount} 个文件），可直接粘贴。`,
    );
    return;
  }

  const recovery = fileClipboardRecoveryText(result);
  if (result.saveMode === "temp" && recovery) {
    setReceivedFilesWriteStatus("warning", "系统写入失败，但文件已保存到临时目录。可打开临时目录或重试写入。");
    return;
  }

  if (result.saveMode === "memory-only") {
    setReceivedFilesWriteStatus("warning", "未写入系统文件剪贴板，文件仍在内存托盘。可下载；桌面版可重试写入。");
    return;
  }

  setReceivedFilesWriteStatus("warning", result.reason || "系统文件剪贴板写入失败，可重试。");
}

function rememberFileClipboardTempPath(result = {}) {
  const path = fileClipboardRecoveryPath(result);
  if (path) {
    state.receivedClipboardTempPath = path;
  }
  renderReceivedFiles();
}

async function writeReceivedFilesToSystemClipboard(files = state.receivedClipboardFiles) {
  const invoke = getTauriInvoke();
  if (!invoke) {
    return {
      clipboardWritten: false,
      saveMode: "memory-only",
      reason: "当前是浏览器预览版，桌面版支持写入 Windows 系统文件剪贴板。",
    };
  }

  if (files.length === 0) {
    return {
      clipboardWritten: false,
      saveMode: "memory-only",
      reason: "没有可写入系统文件剪贴板的远端文件。",
    };
  }

  const totalBytes = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
  if (totalBytes > maxNativeClipboardFileBytes) {
    return {
      clipboardWritten: false,
      saveMode: "memory-only",
      reason: `远端文件 ${formatBytes(totalBytes)}，超过系统文件剪贴板写入上限 ${formatBytes(maxNativeClipboardFileBytes)}。`,
    };
  }

  elements.copyReceivedFilesButton.disabled = true;
  let nativeTransferId = "";
  try {
    const nativeFiles = files.map((file, index) => ({
      name: makeSafeDownloadName(file.name, index),
      size: Number(file.size) || 0,
    }));
    const beginResult = await invoke("begin_clipboard_file_write", {
      payload: {
        files: nativeFiles,
      },
    });
    nativeTransferId = beginResult?.transferId || "";
    if (!nativeTransferId) {
      throw new Error("桌面原生文件剪贴板传输没有返回 transferId。");
    }

    let writtenBytes = 0;
    for (const [fileIndex, file] of files.entries()) {
      let offset = 0;
      while (offset < file.size) {
        const chunk = file.blob.slice(offset, Math.min(offset + nativeClipboardChunkSizeBytes, file.size));
        const dataBase64 = await blobToBase64(chunk);
        const result = await invoke("append_clipboard_file_chunk", {
          payload: {
            transferId: nativeTransferId,
            fileIndex,
            offset,
            dataBase64,
          },
        });
        offset += chunk.size;
        writtenBytes = Number(result?.totalWrittenBytes) || writtenBytes + chunk.size;
        const percent = totalBytes === 0 ? 100 : Math.min(100, Math.round((writtenBytes / totalBytes) * 100));
        elements.clipboardText.textContent = `剪贴板：正在写入系统文件剪贴板 ${percent}%`;
        await yieldToUi();
      }
    }

    return await invoke("finish_clipboard_file_write", {
      payload: {
        transferId: nativeTransferId,
      },
    });
  } catch (error) {
    if (nativeTransferId) {
      await invoke("cancel_clipboard_file_write", {
        payload: {
          transferId: nativeTransferId,
        },
      }).catch(() => {});
    }

    if (files.length > 0 && totalBytes <= 128 * 1024 * 1024) {
      try {
        const nativeFiles = await Promise.all(
          files.map(async (file, index) => ({
            name: makeSafeDownloadName(file.name, index),
            dataBase64: await blobToBase64(file.blob),
          })),
        );
        return await invoke("write_files_to_clipboard", { files: nativeFiles });
      } catch {
        // Fall through to the original chunked error below.
      }
    }

    return {
      clipboardWritten: false,
      saveMode: "memory-only",
      reason: error?.message || String(error) || "写入 Windows 系统文件剪贴板失败。",
    };
  } finally {
    renderReceivedFiles();
  }
}

async function copyReceivedFilesToSystemClipboard() {
  if (state.receivedClipboardFiles.length === 0) {
    return;
  }

  elements.clipboardText.textContent = "剪贴板：正在写入系统文件剪贴板";
  setReceivedFilesWriteStatus("busy", "正在写入 Windows 系统文件剪贴板...");
  renderReceivedFiles();
  const result = await writeReceivedFilesToSystemClipboard();
  rememberFileClipboardTempPath(result);
  updateReceivedFilesWriteStatusFromResult(result);
  renderReceivedFiles();
  if (result.clipboardWritten) {
    elements.clipboardText.textContent = `剪贴板：已写入系统文件剪贴板（${result.fileCount ?? state.receivedClipboardFiles.length} 个文件）`;
    addLog("远端文件剪贴板", fileClipboardLocalDetail(result, "已写入 Windows 系统文件剪贴板"));
  } else {
    const savedToTemp = result.saveMode === "temp" && Boolean(fileClipboardRecoveryText(result));
    elements.clipboardText.textContent = savedToTemp
      ? "剪贴板：系统写入失败，文件已保存在临时目录"
      : "剪贴板：系统文件剪贴板写入失败";
    addLog("远端文件剪贴板", fileClipboardLocalDetail(result));
  }
}

function renderReceivedFiles() {
  elements.receivedFilesList.innerHTML = "";
  const files = state.receivedClipboardFiles;
  const canWriteFileClipboard = canUseDesktopFileClipboard();
  const canOpenTempPath = Boolean(getTauriInvoke() && state.receivedClipboardTempPath && files.length > 0);
  const writeStatus = state.receivedClipboardWriteStatus || {};
  const canRetryWrite =
    files.length > 0 && canWriteFileClipboard && writeStatus.kind === "warning" && Boolean(writeStatus.text);
  elements.copyReceivedFilesButton.disabled = files.length === 0 || !canWriteFileClipboard;
  elements.copyReceivedFilesButton.title = canWriteFileClipboard
    ? canRetryWrite
      ? "重试写入系统文件剪贴板"
      : "写入系统文件剪贴板"
    : "桌面版支持写入系统文件剪贴板";
  elements.downloadAllReceivedFilesButton.disabled = files.length === 0;
  elements.openReceivedFilesTempButton.disabled = !canOpenTempPath;
  elements.openReceivedFilesTempButton.title = canOpenTempPath
    ? "打开临时目录"
    : "桌面版写入系统文件剪贴板后可打开临时目录";
  elements.clearReceivedFilesButton.disabled = files.length === 0;
  elements.clearReceivedFilesButton.title = state.receivedClipboardTempPath
    ? "清空托盘（不删除系统剪贴板临时目录）"
    : "清空远端文件";
  renderReceivedFilesStatus();

  if (files.length === 0) {
    const empty = document.createElement("p");
    empty.className = "received-files-empty";
    empty.textContent = "Mac 复制文件后，会先暂存在这里，可手动下载。";
    elements.receivedFilesList.append(empty);
    return;
  }

  for (const [index, file] of files.entries()) {
    const row = document.createElement("div");
    row.className = "received-file-row";
    const info = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = file.name || `clipboard-${index + 1}`;
    const meta = document.createElement("small");
    meta.textContent = `${formatBytes(file.size || 0)} · ${file.mimeType || "application/octet-stream"}`;
    info.append(name, meta);

    const button = document.createElement("button");
    button.className = "secondary-action compact";
    button.type = "button";
    button.textContent = "下载";
    button.addEventListener("click", () => downloadReceivedFile(index));

    row.append(info, button);
    elements.receivedFilesList.append(row);
  }
}

function downloadReceivedFile(index) {
  const file = state.receivedClipboardFiles[index];
  if (!file?.objectUrl) {
    addLog("远端文件下载失败", "文件已不在内存中，请重新同步");
    return;
  }

  const link = document.createElement("a");
  link.href = file.objectUrl;
  link.download = makeSafeDownloadName(file.name, index);
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  addLog("远端文件下载", `${link.download} · ${formatBytes(file.size || 0)}`);
}

function downloadAllReceivedFiles() {
  if (state.receivedClipboardFiles.length === 0) {
    return;
  }

  for (const index of state.receivedClipboardFiles.keys()) {
    window.setTimeout(() => downloadReceivedFile(index), index * 160);
  }
}

function clearReceivedFiles() {
  const clearedCount = state.receivedClipboardFiles.length;
  const keptTempPath = state.receivedClipboardTempPath;
  for (const file of state.receivedClipboardFiles) {
    if (file.objectUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(file.objectUrl);
    }
  }
  state.receivedClipboardFiles = [];
  state.receivedClipboardTempPath = "";
  setReceivedFilesWriteStatus("", "");
  renderReceivedFiles();
  elements.clipboardText.textContent = elements.clipboardToggle.checked ? "剪贴板：已开启" : "剪贴板：已关闭";
  syncFloatingControlStatus();
  addLog(
    "远端文件",
    keptTempPath
      ? `已清空 ${clearedCount} 个内存暂存文件；系统剪贴板临时目录会保留给 Windows 粘贴使用`
      : `已清空 ${clearedCount} 个内存暂存文件`,
  );
}

async function openReceivedFilesTempPath() {
  const invoke = getTauriInvoke();
  if (!invoke) {
    addLog("打开临时目录失败", "浏览器预览版不能打开本机目录，请使用桌面版");
    return;
  }
  if (!state.receivedClipboardTempPath) {
    addLog("打开临时目录失败", "当前没有可打开的临时目录");
    return;
  }

  try {
    await invoke("open_clipboard_temp_path", {
      path: state.receivedClipboardTempPath,
    });
    addLog("打开临时目录", state.receivedClipboardTempPath);
  } catch (error) {
    addLog("打开临时目录失败", error?.message || String(error) || "无法打开临时目录");
  } finally {
    renderReceivedFiles();
  }
}

function normalizeRemoteFileName(name, index) {
  const fallback = `clipboard-${index + 1}`;
  const cleaned = String(name || fallback)
    .replace(/[\\/:*?"<>|\0]/g, "_")
    .trim();
  if (!cleaned || cleaned === "." || cleaned === "..") {
    return fallback;
  }
  return cleaned;
}

function handleClipboardFileOffer(message) {
  const fileCount = Array.isArray(message.files) ? message.files.length : 0;
  const transferId = message.transferId || makeFileTransferId();
  const files = Array.isArray(message.files)
    ? message.files.map((file, fallbackIndex) => {
        const index = Number.isInteger(Number(file.index)) ? Number(file.index) : fallbackIndex;
        return {
          index,
          name: normalizeRemoteFileName(file.name, index),
          size: Math.max(0, Number(file.size) || 0),
          mimeType: file.mimeType || "application/octet-stream",
          lastModified: Number(file.lastModified) || Date.now(),
          chunks: [],
          receivedBytes: 0,
        };
      })
    : [];
  const totalBytes = Math.max(0, Number(message.totalBytes) || files.reduce((sum, file) => sum + file.size, 0));

  if (!elements.clipboardToggle.checked) {
    addLog("文件剪贴板", "已拒绝远端文件：剪贴板同步已关闭");
    setReceivedFilesWriteStatus("warning", "已拒绝远端文件：剪贴板同步已关闭。");
    renderReceivedFiles();
    state.client?.sendClipboardFileResponse({
      transferId,
      accepted: false,
      code: "LAN011",
      reason: "Windows 控制端已关闭剪贴板同步",
    });
    return;
  }

  if (files.length === 0 && totalBytes > 0) {
    addLog("文件剪贴板", "已拒绝远端文件：缺少文件清单");
    setReceivedFilesWriteStatus("warning", "已拒绝远端文件：缺少文件清单，请让 Mac 重新复制。");
    renderReceivedFiles();
    state.client?.sendClipboardFileResponse({
      transferId,
      accepted: false,
      code: "LAN011",
      reason: "远端文件剪贴板缺少文件清单",
    });
    return;
  }

  if (totalBytes > maxClipboardFileBytes) {
    const reason = `远端文件总大小 ${formatBytes(totalBytes)}，超过当前上限 ${formatBytes(maxClipboardFileBytes)}`;
    addLog("文件剪贴板", reason);
    setReceivedFilesWriteStatus("warning", `${reason}，已拒绝接收。`);
    renderReceivedFiles();
    state.client?.sendClipboardFileResponse({
      transferId,
      accepted: false,
      code: "LAN011",
      reason,
    });
    return;
  }

  const now = Date.now();
  state.remoteFileTransfers.set(transferId, {
    transferId,
    totalBytes,
    receivedBytes: 0,
    fileCount: Number(message.fileCount) || files.length,
    files,
    startedAt: now,
    lastActivityAt: now,
  });

  setReceivedFilesWriteStatus("busy", describeIncomingFileTransferStatus(state.remoteFileTransfers.get(transferId)));
  renderReceivedFiles();
  elements.clipboardText.textContent = `剪贴板：准备接收远端 ${fileCount || files.length} 个文件`;
  syncFloatingControlStatus();
  addLog("文件剪贴板", `收到远端文件清单 ${fileCount || files.length} 个，共 ${formatBytes(totalBytes)}，暂存到浏览器内存`);
  state.client?.sendClipboardFileResponse({
    transferId,
    accepted: true,
    saveMode: "memory-only",
    maxChunkBytes: fileChunkSizeBytes,
    reason: "Windows 控制端已准备在浏览器内存中接收文件。",
  });
}

function handleClipboardFileChunk(message) {
  const transferId = message.transferId || "";
  const transfer = state.remoteFileTransfers.get(transferId);
  if (!transfer) {
    addLog("文件剪贴板", `收到未知文件块，已忽略 · ${transferId || "missing"}`);
    return;
  }

  try {
    const rawFileIndex = Number(message.fileIndex);
    if (!Number.isInteger(rawFileIndex) || rawFileIndex < 0) {
      rejectRemoteFileTransfer(transferId, `远端文件块 fileIndex 无效：${message.fileIndex}`, {
        clipboardText: "剪贴板：远端文件接收失败",
      });
      return;
    }

    const fileIndex = rawFileIndex;
    const file = transfer.files.find((item) => item.index === fileIndex);
    if (!file) {
      rejectRemoteFileTransfer(transferId, `远端文件块 fileIndex=${fileIndex} 未在清单中`, {
        clipboardText: "剪贴板：远端文件接收失败",
      });
      return;
    }

    const bytes = base64ToUint8Array(message.dataBase64);
    const rawOffset = Number(message.offset);
    const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : file.receivedBytes;
    const expectedOffset = Math.max(0, Number(file.receivedBytes) || 0);
    if (offset !== expectedOffset) {
      rejectRemoteFileTransfer(transferId, `远端文件块 offset 不连续：收到 ${offset}，期望 ${expectedOffset}`, {
        clipboardText: "剪贴板：远端文件接收失败",
      });
      return;
    }

    const declaredFileSize = Math.max(0, Number(file.size) || 0);
    if (offset + bytes.byteLength > declaredFileSize) {
      rejectRemoteFileTransfer(
        transferId,
        `远端文件块超过声明大小：${formatBytes(offset + bytes.byteLength)}/${formatBytes(declaredFileSize)}`,
        { clipboardText: "剪贴板：远端文件接收失败" },
      );
      return;
    }

    const declaredTotalBytes = Math.max(0, Number(transfer.totalBytes) || 0);
    if (declaredTotalBytes > 0 && transfer.receivedBytes + bytes.byteLength > declaredTotalBytes) {
      rejectRemoteFileTransfer(
        transferId,
        `远端文件传输超过声明总大小：${formatBytes(transfer.receivedBytes + bytes.byteLength)}/${formatBytes(declaredTotalBytes)}`,
        { clipboardText: "剪贴板：远端文件接收失败" },
      );
      return;
    }

    file.chunks.push({ offset, bytes });
    file.receivedBytes += bytes.byteLength;
    transfer.receivedBytes += bytes.byteLength;
    recordRemoteFileTransferRateSample(transfer, bytes.byteLength);

    const totalBytes = transfer.totalBytes || Number(message.totalBytes) || transfer.receivedBytes;
    const percent = totalBytes === 0 ? 100 : Math.min(100, Math.round((transfer.receivedBytes / totalBytes) * 100));
    elements.clipboardText.textContent = `剪贴板：接收远端文件 ${percent}%`;
    setReceivedFilesWriteStatus("busy", describeIncomingFileTransferStatus(transfer));
    syncFloatingControlStatus();
    state.client?.sendClipboardFileProgress({
      transferId,
      receivedBytes: transfer.receivedBytes,
      totalBytes,
    });
  } catch (error) {
    const reason = error?.message || "远端文件块解析失败";
    state.remoteFileTransfers.delete(transferId);
    elements.clipboardText.textContent = "剪贴板：远端文件接收失败";
    addLog("文件剪贴板失败", reason);
    setReceivedFilesWriteStatus("warning", `远端文件接收失败：${reason}。请让 Mac 重新复制。`);
    renderReceivedFiles();
    state.client?.sendClipboardFileResult({
      transferId,
      accepted: false,
      code: "LAN011",
      reason,
    });
  }
}

async function handleClipboardFileComplete(message) {
  const transferId = message.transferId || "";
  const transfer = state.remoteFileTransfers.get(transferId);
  if (!transfer) {
    addLog("文件剪贴板", `收到未知文件完成消息，已忽略 · ${transferId || "missing"}`);
    return;
  }
  touchRemoteFileTransfer(transfer);

  const totalBytes = transfer.totalBytes || Number(message.totalBytes) || transfer.receivedBytes;
  const files = transfer.files
    .slice()
    .sort((left, right) => left.index - right.index)
    .map((file) => {
      const orderedChunks = file.chunks
        .slice()
        .sort((left, right) => left.offset - right.offset)
        .map((chunk) => chunk.bytes);
      const blob = new Blob(orderedChunks, { type: file.mimeType || "application/octet-stream" });
      const objectUrl =
        typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
          ? URL.createObjectURL(blob)
          : "";
      return {
        name: file.name,
        size: blob.size,
        mimeType: blob.type,
        lastModified: file.lastModified,
        blob,
        objectUrl,
      };
    });
  const receivedBytes = files.reduce((sum, file) => sum + file.size, 0);
  const expectedFileCount = Number(message.fileCount) || transfer.fileCount || files.length;
  const complete =
    files.length === expectedFileCount &&
    receivedBytes === totalBytes &&
    transfer.files.every(
      (file) => Math.max(0, Number(file.receivedBytes) || 0) === Math.max(0, Number(file.size) || 0),
    );

  if (!complete) {
    const reason = `远端文件接收不完整：${formatBytes(receivedBytes)}/${formatBytes(totalBytes)}`;
    state.remoteFileTransfers.delete(transferId);
    elements.clipboardText.textContent = "剪贴板：远端文件接收不完整";
    addLog("文件剪贴板失败", reason);
    setReceivedFilesWriteStatus("warning", `${reason}。已停止接收，请让 Mac 重新复制。`);
    renderReceivedFiles();
    state.client?.sendClipboardFileResult({
      transferId,
      accepted: false,
      code: "LAN011",
      reason,
      receivedBytes,
      totalBytes,
      fileCount: files.length,
    });
    return;
  }

  state.remoteFileTransfers.delete(transferId);
  for (const file of state.receivedClipboardFiles) {
    if (file.objectUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(file.objectUrl);
    }
  }
  state.receivedClipboardFiles = files;
  state.receivedClipboardTempPath = "";
  setReceivedFilesWriteStatus("busy", "已接收远端文件，正在准备写入 Windows 系统文件剪贴板...");
  renderReceivedFiles();
  let systemClipboardResult = {
    clipboardWritten: false,
    saveMode: "memory-only",
    reason: "Windows 控制端已在浏览器内存中接收文件，桌面版可写入系统文件剪贴板。",
  };
  if (canUseDesktopFileClipboard()) {
    elements.clipboardText.textContent = `剪贴板：已接收远端 ${files.length} 个文件，正在写入系统文件剪贴板`;
    systemClipboardResult = await writeReceivedFilesToSystemClipboard(files);
  }
  rememberFileClipboardTempPath(systemClipboardResult);
  updateReceivedFilesWriteStatusFromResult(systemClipboardResult, files.length);
  renderReceivedFiles();

  const saveMode = systemClipboardResult.clipboardWritten ? "clipboard" : systemClipboardResult.saveMode || "memory-only";
  const reason = systemClipboardResult.clipboardWritten
    ? systemClipboardResult.reason || "Windows 系统文件剪贴板已写入。"
    : systemClipboardResult.reason || "Windows 控制端已在浏览器内存中接收文件，可在远端文件托盘下载。";
  const localReason = fileClipboardLocalDetail(systemClipboardResult, reason);
  const savedToTemp = saveMode === "temp" && Boolean(fileClipboardRecoveryText(systemClipboardResult));

  elements.clipboardText.textContent = systemClipboardResult.clipboardWritten
    ? `剪贴板：已接收并写入系统文件剪贴板（${files.length} 个文件）`
    : savedToTemp
      ? `剪贴板：已接收远端 ${files.length} 个文件（已保存到临时目录）`
      : `剪贴板：已接收远端 ${files.length} 个文件（内存暂存）`;
  syncFloatingControlStatus();
  addLog(
    "文件剪贴板",
    systemClipboardResult.clipboardWritten
      ? `已接收远端 ${files.length} 个文件，共 ${formatBytes(receivedBytes)}，并写入 Windows 系统文件剪贴板`
      : `已接收远端 ${files.length} 个文件，共 ${formatBytes(receivedBytes)}，可在远端文件托盘下载；${localReason}`,
  );
  state.client?.sendClipboardFileResult({
    transferId,
    accepted: true,
    receivedBytes,
    totalBytes,
    fileCount: files.length,
    saveMode,
    reason,
  });
}

function isOutgoingFileTransferRejected(transferId) {
  const transfer = state.lastOutgoingFileTransfer || {};
  return transfer.transferId === transferId && transfer.status === "remote-result" && transfer.accepted === false;
}

function handleClipboardFileResponse(message) {
  const transferId = String(message.transferId || "");
  const currentTransferId = state.fileTransferActive && state.outgoingFileTransfer?.transferId
    ? state.outgoingFileTransfer.transferId
    : state.lastOutgoingFileTransfer?.transferId || "";
  if (transferId && currentTransferId && transferId !== currentTransferId) {
    addLog("文件剪贴板", `忽略旧的对端文件清单响应 · ${transferId}`);
    return false;
  }
  const accepted = Boolean(message.accepted);
  if (!accepted) {
    const lastTransfer = state.lastOutgoingFileTransfer?.transferId === transferId
      ? state.lastOutgoingFileTransfer
      : null;
    const activeTransfer = state.outgoingFileTransfer?.transferId === transferId
      ? state.outgoingFileTransfer
      : null;
    const transfer = lastTransfer || activeTransfer;
    if (transfer) {
      const now = Date.now();
      state.lastOutgoingFileTransfer = {
        ...transfer,
        ...message,
        transferId,
        status: "remote-result",
        accepted: false,
        reason: message.reason || "对端拒绝文件清单",
        completedAt: now,
        lastActivityAt: now,
        canRetry: Boolean(
          (transfer.canRetry || transfer.clearOnRemoteAccept) && (elements.fileClipboardInput.files?.length || 0) > 0,
        ),
      };
      const detail = describeOutgoingFileResultStatus(state.lastOutgoingFileTransfer);
      elements.clipboardText.textContent = `剪贴板：${detail}`;
      updateFileClipboardButton();
      syncFloatingControlStatus();
      addLog("文件剪贴板", detail);
      return;
    }
  }

  const text = message.accepted
    ? "剪贴板：对端已准备接收文件"
    : `剪贴板：对端拒绝文件${message.reason ? `，${message.reason}` : ""}`;
  elements.clipboardText.textContent = text;
  syncFloatingControlStatus();
  addLog("文件剪贴板", message.accepted ? "对端已接受文件清单" : message.reason || "对端拒绝文件清单");
}

function handleClipboardFileProgress(message) {
  if (!message.totalBytes) {
    return;
  }
  const transferId = String(message.transferId || "");
  const currentTransferId = state.fileTransferActive && state.outgoingFileTransfer?.transferId
    ? state.outgoingFileTransfer.transferId
    : state.lastOutgoingFileTransfer?.transferId || "";
  if (transferId && currentTransferId && transferId !== currentTransferId) {
    addLog("文件剪贴板", `忽略旧的对端文件进度 · ${transferId}`);
    return;
  }
  const now = Date.now();
  if (transferId && state.outgoingFileTransfer?.transferId === transferId) {
    state.outgoingFileTransfer.lastActivityAt = now;
  }
  if (transferId && state.lastOutgoingFileTransfer?.transferId === transferId) {
    state.lastOutgoingFileTransfer.lastActivityAt = now;
  }
  const percent = Math.round((Number(message.receivedBytes || 0) / Number(message.totalBytes)) * 100);
  elements.clipboardText.textContent = `剪贴板：对端接收 ${percent}%`;
  syncFloatingControlStatus();
}

function handleClipboardFileResult(message) {
  const currentTransferId = state.fileTransferActive && state.outgoingFileTransfer?.transferId
    ? state.outgoingFileTransfer.transferId
    : state.lastOutgoingFileTransfer?.transferId || "";
  if (currentTransferId && message.transferId && currentTransferId !== message.transferId) {
    addLog("文件剪贴板", `忽略旧的对端文件结果 · ${message.transferId}`);
    return false;
  }
  const previousTransferMatches = state.lastOutgoingFileTransfer?.transferId === message.transferId;
  const activeTransferMatches = state.outgoingFileTransfer?.transferId === message.transferId;
  const previousTransfer = previousTransferMatches
    ? state.lastOutgoingFileTransfer
    : activeTransferMatches
      ? state.outgoingFileTransfer
      : {};
  const accepted = Boolean(message.accepted);
  const canRetry = !accepted &&
    Boolean(previousTransfer.canRetry && (elements.fileClipboardInput.files?.length || 0) > 0);
  state.lastOutgoingFileTransfer = {
    ...previousTransfer,
    ...message,
    status: "remote-result",
    accepted,
    canRetry,
    completedAt: Date.now(),
    lastActivityAt: Date.now(),
  };
  if (accepted && previousTransfer.clearOnRemoteAccept) {
    elements.fileClipboardInput.value = "";
    state.lastOutgoingFileTransfer.canRetry = false;
  }
  const detail = describeOutgoingFileResultStatus(state.lastOutgoingFileTransfer);
  elements.clipboardText.textContent = `剪贴板：${detail}`;
  updateFileClipboardButton();
  syncFloatingControlStatus();
  addLog("文件剪贴板", detail);
  return true;
}

async function receiveClipboardText(message) {
  if (!elements.clipboardToggle.checked) {
    state.client?.sendClipboardAck({
      accepted: false,
      clipboardId: message.clipboardId,
      reason: "Windows 控制端已关闭剪贴板同步",
    });
    return;
  }

  try {
    await writeLocalClipboardText(message.text ?? "");
    elements.clipboardText.textContent = `剪贴板：已接收 ${message.textLength ?? message.text?.length ?? 0} 字`;
    syncFloatingControlStatus();
    addLog("剪贴板", "已写入远端文字到本机剪贴板");
    state.client?.sendClipboardAck({
      accepted: true,
      clipboardId: message.clipboardId,
    });
  } catch (error) {
    const reason = error?.message || "写入系统剪贴板失败";
    elements.clipboardText.textContent = "剪贴板：接收失败";
    syncFloatingControlStatus();
    addLog("剪贴板失败", reason);
    state.client?.sendClipboardAck({
      accepted: false,
      clipboardId: message.clipboardId,
      reason,
    });
  }
}

function requestReverseControl() {
  if (!state.connected || !state.client || state.reverseRequestId) {
    return;
  }

  const nextDirection = getNextControlDirection();
  const requestId = makeReverseRequestId();
  state.pendingControlDirection = nextDirection;
  state.reverseRequestId = requestId;
  state.reverseStateDetail = `等待对端确认切换到${getControlDirectionLabel(nextDirection)}`;
  updateReverseControlUi();

  state.client.requestReverseControl({
    requestId,
    from: "Windows 控制端",
    message: `请求切换为${getControlDirectionLabel(nextDirection)}`,
    mockScenario: elements.mockScenarioSelect.value,
  });
  addLog("一键反控", `已发送请求，目标方向：${getControlDirectionLabel(nextDirection)}`);

  state.reverseRequestTimer = window.setTimeout(() => {
    state.reverseRequestTimer = null;
    state.reverseRequestId = "";
    state.pendingControlDirection = "";
    state.reverseStateDetail = "反控请求超时，当前方向保持不变";
    updateReverseControlUi();
    addLog("一键反控", "等待对端确认超时，当前方向保持不变");
  }, reverseControlTimeoutMs);
}

function handleReverseControlResponse(message) {
  if (!state.reverseRequestId) {
    addLog("一键反控", "收到未匹配的反控确认，已忽略");
    return;
  }

  if (state.reverseRequestId && message.requestId && message.requestId !== state.reverseRequestId) {
    return;
  }

  const nextDirection = state.pendingControlDirection || getNextControlDirection();
  clearReverseControlTimer();
  state.reverseRequestId = "";
  state.pendingControlDirection = "";

  if (message.accepted) {
    state.controlDirection = nextDirection;
    state.reverseStateDetail = `方向已切换到${getControlDirectionLabel(nextDirection)}`;
    updateReverseControlUi();
    addLog("一键反控", `对端已同意，已切换到${getControlDirectionLabel(nextDirection)}`);
    return;
  }

  state.reverseStateDetail = message.reason || "对端未同意，当前方向保持不变";
  updateReverseControlUi();
  addLog("一键反控", message.reason || "对端未同意，当前方向保持不变");
}

function handleIncomingReverseControlRequest(message) {
  if (!state.client) {
    return;
  }

  if (state.reverseRequestId) {
    state.client.sendReverseControlResponse({
      requestId: message.requestId,
      accepted: false,
      reason: "当前已有反控请求处理中",
    });
    addLog("一键反控", "已拒绝对方请求：当前已有反控请求处理中");
    return;
  }

  const nextDirection = getNextControlDirection();
  const requester = message.from || "对方";
  const promptText =
    message.message || `${requester} 请求切换为${getControlDirectionLabel(nextDirection)}，是否同意？`;
  const accepted = typeof window.confirm === "function" ? window.confirm(promptText) : false;

  state.client.sendReverseControlResponse({
    requestId: message.requestId,
    accepted,
    reason: accepted ? "" : "Windows 控制端拒绝切换方向",
  });

  if (accepted) {
    state.controlDirection = nextDirection;
    state.reverseStateDetail = `已同意对方请求，切换到${getControlDirectionLabel(nextDirection)}`;
    updateReverseControlUi();
    addLog("一键反控", `已同意${requester}请求，切换到${getControlDirectionLabel(nextDirection)}`);
    return;
  }

  state.reverseStateDetail = getDefaultReverseStateDetail();
  updateReverseControlUi();
  addLog("一键反控", `已拒绝${requester}的反控请求`);
}

function handleProtocolMessage(message) {
  if (message.type === "video_frame") {
    renderVideoFrame(message);
    return;
  }

  if (message.type === "display_settings_ack") {
    if (message.fps) {
      state.negotiatedFps = Number(message.fps) || state.negotiatedFps;
      state.requestedFps = Number(message.requestedFps) || Number(elements.fpsSelect.value) || state.requestedFps;
      updateFpsMetric();
    }
    updateHostDiagnostics({
      hostMode: message.hostMode ?? state.hostDiagnostics.hostMode,
      videoCodec: message.videoCodec ?? state.hostDiagnostics.videoCodec,
      videoEncoding: message.videoEncoding ?? state.hostDiagnostics.videoEncoding,
      capturePipeline: message.capturePipeline ?? state.hostDiagnostics.capturePipeline,
      streamFallbackReason: message.streamFallbackReason ?? "",
      clipboardText: message.clipboardText ?? state.hostDiagnostics.clipboardText,
      clipboardFile: message.clipboardFile ?? state.hostDiagnostics.clipboardFile,
      clipboardTextMode: message.clipboardTextMode ?? state.hostDiagnostics.clipboardTextMode,
      clipboardFileMode: message.clipboardFileMode ?? state.hostDiagnostics.clipboardFileMode,
      qualityPreset: message.qualityPreset ?? state.hostDiagnostics.qualityPreset,
      jpegQuality: message.jpegQuality ?? state.hostDiagnostics.jpegQuality,
      maxScreenFps: normalizeRemoteMaxScreenFps(message.maxScreenFps) ?? state.hostDiagnostics.maxScreenFps,
      runtime: normalizeHostRuntime(message.runtime) ?? state.hostDiagnostics.runtime,
    });
    if (message.streamFallbackReason) {
      addLog("视频回退", message.streamFallbackReason);
    }
    addLog("被控端确认", "显示设置已接收");
    return;
  }

  if (message.type === "audio_settings_ack") {
    if (message.enabled && state.connected && Number(state.audioFrames || 0) <= 0) {
      state.audioWaitingSince = state.audioWaitingSince || performance.now();
    } else if (!message.enabled) {
      state.audioWaitingSince = 0;
    }
    elements.audioText.textContent = message.enabled
      ? `声音：设置已接收 · ${message.volume ?? elements.audioVolumeRange.value}%`
      : "声音：已关闭";
    syncFloatingControlStatus();
    return;
  }

  if (message.type === "audio_status") {
    elements.audioText.textContent = message.enabled
      ? `声音：${message.message || "已开启"}`
      : `声音：${message.message || "已关闭"}`;
    syncFloatingControlStatus();
    return;
  }

  if (message.type === "audio_frame") {
    handleAudioFrame(message);
    return;
  }

  if (message.type === "input_ack") {
    const sequence = Number(message.sequence) || 0;
    updateHostDiagnostics(getInputAckDiagnostics(message));
    updateInputStatus();
    if (!message.accepted || sequence <= 3 || sequence % 20 === 0) {
      const status = message.accepted
        ? message.injected
          ? "已注入"
          : "已记录"
        : "被拒绝";
      addLog("输入确认", `${message.event ?? "input"} #${sequence || "-"} · ${status} · ${message.reason || message.mode || ""}`);
    }
    if (!message.accepted) {
      elements.remoteStatusText.textContent = `输入被拒绝：${message.reason || message.code || "请检查被控端权限"}`;
    }
    return;
  }

  if (message.type === "clipboard_ack") {
    const detail = message.accepted
      ? `剪贴板文字已接收${message.textLength ? ` · ${message.textLength} 字` : ""}`
      : message.reason || "剪贴板文字被拒绝";
    elements.clipboardText.textContent = message.accepted ? "剪贴板：对端已接收" : "剪贴板：对端拒绝";
    addLog("被控端确认", detail);
    return;
  }

  if (message.type === "clipboard_text") {
    receiveClipboardText(message);
    return;
  }

  if (message.type === "clipboard_file_offer") {
    handleClipboardFileOffer(message);
    return;
  }

  if (message.type === "clipboard_file_chunk") {
    handleClipboardFileChunk(message);
    return;
  }

  if (message.type === "clipboard_file_complete") {
    void handleClipboardFileComplete(message).catch((error) => {
      const reason = error?.message || "远端文件完成处理失败";
      elements.clipboardText.textContent = "剪贴板：远端文件接收失败";
      addLog("文件剪贴板失败", reason);
      state.client?.sendClipboardFileResult({
        transferId: message.transferId,
        accepted: false,
        code: "LAN011",
        reason,
      });
    });
    return;
  }

  if (message.type === "clipboard_file_response") {
    handleClipboardFileResponse(message);
    return;
  }

  if (message.type === "clipboard_file_progress") {
    handleClipboardFileProgress(message);
    return;
  }

  if (message.type === "clipboard_file_result") {
    handleClipboardFileResult(message);
    return;
  }

  if (message.type === "reverse_control_request") {
    handleIncomingReverseControlRequest(message);
    return;
  }

  if (message.type === "reverse_control_response") {
    handleReverseControlResponse(message);
    return;
  }

  if (message.type === "error") {
    const errorMessage = getErrorMessage(message);
    setConnectionState("failed", errorMessage);
    addLog("协议错误", errorMessage);
  }
}

function renderVideoFrame(frame) {
  if (String(frame.codec ?? "").toLowerCase() === "h264") {
    void renderH264VideoFrame(frame);
    return;
  }

  if (!frame.dataUrl) {
    addLog("视频帧", "收到视频帧但缺少 dataUrl");
    return;
  }

  state.videoFrames += 1;
  recordVideoFrameTime(frame);
  updateFpsMetric();
  const frameAgeDiagnostics = getVideoFrameAgeDiagnostics(frame);
  updateVideoFrameAgeMetric(frameAgeDiagnostics);
  const frameLabel = getVideoFrameLabel(frame);
  const frameCapturePipeline = frame.capturePipeline ?? state.hostDiagnostics.capturePipeline;
  const frameCodec = String(frame.codec ?? "").toLowerCase();
  const frameDiagnostics = {
    videoCodec: frame.codec ?? state.hostDiagnostics.videoCodec,
    videoEncoding: frame.encoding ?? state.hostDiagnostics.videoEncoding,
    videoSource: frame.source ?? state.hostDiagnostics.videoSource,
    capturePipeline: frameCapturePipeline,
    droppedFrames: frame.droppedFrames ?? state.hostDiagnostics.droppedFrames,
    ...frameAgeDiagnostics,
    qualityPreset: frame.qualityPreset ?? state.hostDiagnostics.qualityPreset,
    jpegQuality: frame.jpegQuality ?? state.hostDiagnostics.jpegQuality,
    maxScreenFps: normalizeRemoteMaxScreenFps(frame.maxScreenFps) ?? state.hostDiagnostics.maxScreenFps,
    streamFallbackReason: Object.prototype.hasOwnProperty.call(frame, "streamFallbackReason")
      ? (frame.streamFallbackReason ?? "")
      : frameCodec === "h264"
        ? ""
        : state.hostDiagnostics.streamFallbackReason,
  };
  updateHostDiagnostics(frameDiagnostics);
  maybeRecoverH264VideoFallback(frame);

  if (
    !state.hostDiagnostics.warnedMockFrame &&
    ((frameCapturePipeline && frameCapturePipeline.includes("mock")) ||
      state.hostDiagnostics.hostMode === "mac-host-mock-video")
  ) {
    state.hostDiagnostics.warnedMockFrame = true;
    addLog("视频诊断", "当前是模拟画面，可能是屏幕录制权限未开启或采集回退");
  }

  if (frame.width && frame.height) {
    state.remoteFrameWidth = Number(frame.width);
    state.remoteFrameHeight = Number(frame.height);
  }
  applyScaleMode();
  elements.remoteFrameImage.dataset.frameId = String(frame.frameId ?? state.videoFrames);
  elements.remoteFrameImage.dataset.frameCodec = frame.codec ?? "unknown";
  elements.remoteFrameImage.src = frame.dataUrl;
  elements.remoteFrameImage.classList.add("is-visible");
  elements.remoteVideoCanvas.classList.remove("is-visible");
  elements.remoteCanvas.classList.add("has-video-frame");
  elements.remoteStatusText.textContent = `正在接收${frameLabel} #${frame.frameId ?? state.videoFrames}`;

  if (frame.width && frame.height) {
    elements.metricResolution.textContent = `${frame.width} × ${frame.height}`;
  }

  if (state.videoFrames === 1 || state.videoFrames % 30 === 0) {
    addLog(
      "视频帧",
      `#${frame.frameId ?? state.videoFrames} · ${frame.width ?? "--"}×${frame.height ?? "--"} · ${frame.codec ?? "mock"}`,
    );
  }
}

function updateH264DecoderDiagnostics(extra = {}) {
  const decoderQueueMetrics = getH264DecoderQueueMetrics();
  const progressDiagnostics = updateW8NativeVideoProgressDiagnostics();
  updateHostDiagnostics({
    videoDecoderStatus: state.h264DecoderStatus,
    videoDecoderCodec: state.h264DecoderCodec,
    videoDecoderErrors: state.h264DecoderErrorCount,
    videoDecoderQueue: decoderQueueMetrics.queueLength,
    h264DecodedFrames: state.h264DecodedFrames,
    h264DecoderLatencyMs: state.h264DecoderLatencyMs,
    h264ReceivedFrames: state.h264ReceivedFrames,
    h264ReceivedKeyFrames: state.h264ReceivedKeyFrames,
    h264ReceivedDeltaFrames: state.h264ReceivedDeltaFrames,
    h264ReceivedSps: state.h264ReceivedSps,
    h264ReceivedPps: state.h264ReceivedPps,
    h264ReceivedIdr: state.h264ReceivedIdr,
    h264LastNalTypes: state.h264LastNalTypes,
    h264LastKeyFrameId: state.h264LastKeyFrameId,
    h264WebDecodeBypassedForNativeSurface: state.h264WebDecodeBypassedForNativeSurface,
    h264WebDecodeBypassReason: state.h264WebDecodeBypassReason,
    h264WebDecodeBypassLastFrameId: state.h264WebDecodeBypassLastFrameId,
    videoDecoderQueueMs: state.videoDecoderQueueMs,
    videoDroppedStaleFrames: state.videoDroppedStaleFrames,
    videoLastDropReason: state.videoLastDropReason,
    h264VisibilityRecoveryCount: state.h264VisibilityRecoveryCount,
    h264VisibilityRecoveryLastAt: state.h264VisibilityRecoveryLastAt,
    h264KeyFrameWaitMs: getH264KeyFrameWaitMs(),
    h264KeyFrameRecoveryLastRequestedAt: state.h264KeyFrameRecoveryLastRequestedAt,
    h264LiveBacklogRecoveryCount: state.h264LiveBacklogRecoveryCount,
    h264LiveBacklogRecoveryLastRequestedAt: state.h264LiveBacklogRecoveryLastRequestedAt,
    h264FallbackReason: state.h264FallbackReason,
    h264FallbackRecoveryCount: state.h264FallbackRecoveryCount,
    h264FallbackLastReason: state.h264FallbackLastReason,
    h264FallbackRecoveryPausedMs: getH264FallbackRecoveryPausedMs(),
    h264FallbackRecoveryPauseCount: state.h264FallbackRecoveryPauseCount,
    ...progressDiagnostics,
    ...extra,
  });
}

function getH264DecoderInternalQueueSize() {
  if (!state.h264Decoder || state.h264Decoder.state === "closed") return 0;
  const queueSize = Number(state.h264Decoder.decodeQueueSize);
  return Number.isFinite(queueSize) && queueSize > 0 ? Math.round(queueSize) : 0;
}

function getH264DecoderQueueMetrics(now = performance.now()) {
  const queue = Array.isArray(state.h264DecoderQueue) ? state.h264DecoderQueue : [];
  const webCodecsQueueSize = getH264DecoderInternalQueueSize();
  const queueLength = Math.max(queue.length, webCodecsQueueSize);
  const queuedAtValues = queue
    .map((item) => Number(item?.queuedAt))
    .filter((value) => Number.isFinite(value));
  if (!queuedAtValues.length) {
    return { queueLength, metadataQueueLength: queue.length, webCodecsQueueSize, oldestAgeMs: 0, newestAgeMs: 0 };
  }

  const oldestQueuedAt = Math.min(...queuedAtValues);
  const newestQueuedAt = Math.max(...queuedAtValues);
  return {
    queueLength,
    metadataQueueLength: queue.length,
    webCodecsQueueSize,
    oldestAgeMs: Math.max(0, Math.round(Number(now) - oldestQueuedAt)),
    newestAgeMs: Math.max(0, Math.round(Number(now) - newestQueuedAt)),
  };
}

function getH264FirstSurfaceQueueGraceFrames() {
  const fps = Math.max(
    1,
    Math.min(
      60,
      Number(state.negotiatedFps || state.requestedFps || elements.fpsSelect.value) || 30,
    ),
  );
  return Math.max(h264MaximumQueuedFrames, Math.ceil(fps * 2));
}

function shouldKeepH264DecoderForFirstSurface(metrics) {
  if ((Number(state.h264DecodedFrames) || 0) > 0) {
    return false;
  }
  const status = String(state.h264DecoderStatus || "");
  if (status !== "decoding" && status !== "configured") {
    return false;
  }
  return (
    metrics.queueLength <= getH264FirstSurfaceQueueGraceFrames() &&
    metrics.oldestAgeMs <= h264FirstSurfaceQueueGraceMs
  );
}

function getH264RecoveryQueueGraceFrames() {
  const fps = Math.max(
    1,
    Math.min(
      60,
      Number(state.negotiatedFps || state.requestedFps || elements.fpsSelect.value) || 30,
    ),
  );
  return Math.max(h264MaximumQueuedFrames, Math.ceil(fps * 1.2));
}

function shouldKeepH264DecoderForRecoveryQueueGrace(metrics, now = performance.now()) {
  const graceUntil = Number(state.h264RecoveryQueueGraceUntil) || 0;
  const timestamp = Number(now);
  if (!Number.isFinite(timestamp) || graceUntil <= 0 || timestamp > graceUntil) {
    return false;
  }
  if (
    metrics.queueLength > getH264RecoveryQueueGraceFrames() ||
    metrics.oldestAgeMs > h264RecoveryQueueGraceAgeMs
  ) {
    return false;
  }
  const status = String(state.h264DecoderStatus || "").toLowerCase();
  const dropReason = String(state.videoLastDropReason || "").toLowerCase();
  return (
    state.h264DecoderNeedsKeyFrame === true ||
    status === "recovering" ||
    status === "waiting-keyframe" ||
    dropReason === "keyframe-wait-h264-recovery" ||
    dropReason === "visibility-return-h264-recovery"
  );
}

function shouldKeepH264DecoderForReceivedRecoveryKeyFrame(metrics, now = performance.now()) {
  if (state.h264RecoveryInFlight !== true) {
    return false;
  }
  const receivedAt = Number(state.h264RecoveryKeyFrameReceivedAt) || 0;
  const drawnAt = Number(state.h264RecoveryFrameDrawnAt) || 0;
  const timestamp = Number(now);
  if (receivedAt <= 0 || drawnAt > 0 || !Number.isFinite(timestamp)) {
    return false;
  }
  if (timestamp - receivedAt > h264RecoveryKeyFrameDecodeGraceMs) {
    return false;
  }
  return (
    metrics.queueLength <= getH264RecoveryQueueGraceFrames() &&
    metrics.oldestAgeMs <= h264RecoveryKeyFrameQueueAgeMs
  );
}

function recordH264RecoveryKeyFrameReceived(now = performance.now()) {
  if (state.h264RecoveryInFlight !== true) {
    return;
  }
  const timestamp = Number(now);
  if (!Number.isFinite(timestamp)) {
    return;
  }
  if ((Number(state.h264RecoveryKeyFrameReceivedAt) || 0) <= 0) {
    state.h264RecoveryKeyFrameReceivedAt = timestamp;
  }
}

function markH264RecoveryFrameDrawn(now = performance.now()) {
  if (state.h264RecoveryInFlight !== true) {
    return;
  }
  const timestamp = Number(now);
  if (!Number.isFinite(timestamp)) {
    return;
  }
  state.h264RecoveryFrameDrawnAt = timestamp;
  state.h264RecoveryInFlight = false;
  state.h264RecoveryQueueGraceUntil = 0;
}

function shouldResyncH264DecoderQueue(now = performance.now()) {
  const metrics = getH264DecoderQueueMetrics(now);
  if (
    shouldKeepH264DecoderForFirstSurface(metrics) ||
    shouldKeepH264DecoderForRecoveryQueueGrace(metrics, now) ||
    shouldKeepH264DecoderForReceivedRecoveryKeyFrame(metrics, now)
  ) {
    return false;
  }
  return (
    metrics.queueLength > h264MaximumQueuedFrames ||
    metrics.oldestAgeMs > h264MaximumQueueAgeMs
  );
}

function closeH264DecoderForLatencyResync() {
  if (state.h264Decoder && state.h264Decoder.state !== "closed") {
    try {
      state.h264Decoder.close();
    } catch {
      // Decoder latency resync is best-effort; the next key frame reconfigures it.
    }
  }
}

function resyncH264DecoderQueueForLatency({
  isKeyFrame = false,
  frameId = "",
  now = performance.now(),
  reason = "queue-overflow-wait-keyframe",
} = {}) {
  const metrics = getH264DecoderQueueMetrics(now);
  const queuedDrops = metrics.queueLength;
  const currentFrameDrop = isKeyFrame ? 0 : 1;
  const droppedFrames = queuedDrops + currentFrameDrop;
  if (droppedFrames <= 0) {
    return { dropFrame: false, droppedFrames: 0, queueMs: metrics.oldestAgeMs, reason };
  }

  closeH264DecoderForLatencyResync();
  state.h264Decoder = null;
  state.h264DecoderKey = "";
  state.h264DecoderCodec = "";
  state.h264DecoderQueue = [];
  state.videoDecoderQueueMs = metrics.oldestAgeMs;
  state.videoDroppedStaleFrames = (Number(state.videoDroppedStaleFrames) || 0) + droppedFrames;
  state.videoLastDropReason = reason;
  state.h264DecoderNeedsKeyFrame = true;
  state.h264DecoderStatus = isKeyFrame ? "resyncing" : "waiting-keyframe";
  if (!isKeyFrame) {
    state.h264RecoveryInFlight = false;
    state.h264RecoveryKeyFrameReceivedAt = 0;
    state.h264RecoveryFrameDrawnAt = 0;
  }
  if (isKeyFrame) {
    clearH264KeyFrameWaitTimers();
  } else {
    startH264KeyFrameWait(now);
    state.h264SkippedDeltaFrames += 1;
  }
  updateH264DecoderDiagnostics();

  const detail = isKeyFrame
    ? `清理旧队列 ${queuedDrops} 帧，改用关键帧 #${frameId || "--"}`
    : `清理旧队列 ${queuedDrops} 帧并丢弃 delta #${frameId || "--"}，等待关键帧`;
  addLog("H.264 低延迟重同步", detail);
  return {
    dropFrame: !isKeyFrame,
    droppedFrames,
    queueMs: metrics.oldestAgeMs,
    reason,
  };
}

function getH264LatencyResyncReason({ isKeyFrame = false } = {}) {
  if (
    isKeyFrame &&
    state.h264RecoveryInFlight === true &&
    (Number(state.h264RecoveryKeyFrameReceivedAt) || 0) <= 0
  ) {
    return "recovery-keyframe-jump-live";
  }
  return "queue-overflow-wait-keyframe";
}

function getH264LiveBacklogTargetAgeMs() {
  const fps = Math.max(
    1,
    Math.min(
      240,
      Number(state.negotiatedFps || state.requestedFps || elements.fpsSelect.value) || 30,
    ),
  );
  return Math.max(h264LiveBacklogMinimumAgeMs, Math.round((1000 / fps) * h264LiveBacklogFrameWindow));
}

function getH264LiveBacklogStatus(now = performance.now()) {
  const metrics = getH264DecoderQueueMetrics(now);
  const targetAgeMs = getH264LiveBacklogTargetAgeMs();
  const decodedFrames = Number(state.h264DecodedFrames) || 0;
  const status = String(state.h264DecoderStatus || "").toLowerCase();
  const liveBacklog =
    decodedFrames > 0 &&
    !state.h264FallbackActive &&
    status !== "waiting-keyframe" &&
    status !== "recovering" &&
    metrics.queueLength > 1 &&
    metrics.oldestAgeMs >= targetAgeMs;
  return { metrics, targetAgeMs, liveBacklog };
}

function getW13LocalVideoQosDecision({ now = performance.now() } = {}) {
  const timestamp = Number(now);
  const metrics = getH264DecoderQueueMetrics(Number.isFinite(timestamp) ? timestamp : performance.now());
  const queueMs = Math.max(0, Math.round(Number(metrics.oldestAgeMs) || 0));
  const nativeClassifier = classifyW8NativeVideoSession(state);
  const nativeClass = String(nativeClassifier.nativeClass || "unknown").trim() || "unknown";
  const nativeNext = String(nativeClassifier.nativeNext || "unknown").trim() || "unknown";
  const localGapStats = getVideoFrameGapStats();
  const remoteMediaGapStats = getVideoRemoteMediaGapStats();
  const localAvgMs = Math.max(0, Math.round(Number(localGapStats.averageGapMs) || 0));
  const localMaxMs = Math.max(0, Math.round(Number(localGapStats.maxGapMs) || 0));
  const remoteMediaAvgMs = Math.max(0, Math.round(Number(remoteMediaGapStats.averageGapMs) || 0));
  const remoteMediaMaxMs = Math.max(0, Math.round(Number(remoteMediaGapStats.maxGapMs) || 0));
  const remoteMediaGap =
    remoteMediaMaxMs >= h264W13LocalArrivalGapMs &&
    remoteMediaMaxMs >= Math.max(h264W13LocalArrivalGapMs, Math.round(localMaxMs * 0.8));
  const windowsArrivalGap =
    localMaxMs >= h264W13LocalArrivalGapMs &&
    !remoteMediaGap;
  const decoderStatus = String(state.h264DecoderStatus || "").toLowerCase();
  const decodedFrames = Number(state.h264DecodedFrames) || 0;
  const canApplyLocalQos =
    decodedFrames > 0 &&
    !state.h264FallbackActive &&
    !state.h264DecoderNeedsKeyFrame &&
    decoderStatus !== "waiting-keyframe" &&
    decoderStatus !== "recovering" &&
    metrics.queueLength > 1;
  const nativeAllowsLocalQos =
    nativeNext === "watch-arrival-qos" ||
    ["present-ok", "device-lost-recovered", "stream-change-recovered", "web-diagnostic"].includes(nativeClass);
  let status = "observe";
  let next = "continue-long-run-observation";
  let dropPolicy = "observe";
  let keyframeRequest = "no";

  if (["decoder-error", "device-lost-blocked", "stream-change-pending"].includes(nativeClass)) {
    status = "native-error";
    next = "inspect-native-video-error";
    dropPolicy = "hold-qos";
  } else if (["present-gap", "surface-ready", "decoder-submitted", "present-pending"].includes(nativeClass)) {
    status = "native-present";
    next = "inspect-native-present";
    dropPolicy = "hold-qos";
  } else if (remoteMediaGap) {
    status = "remote-cadence";
    next = "ask-mac-readonly-media-cadence";
    dropPolicy = "hold-local";
  } else if (canApplyLocalQos && nativeAllowsLocalQos && (queueMs >= h264W13LocalQosTargetQueueMs || windowsArrivalGap)) {
    status = "local-backlog";
    next = "local-qos-trim-request-keyframe";
    dropPolicy = queueMs >= h264W13LocalQosMaxQueueMs ? "drop-old-keep-keyframe" : "request-keyframe";
    keyframeRequest = "yes";
  } else if (canApplyLocalQos && queueMs > 0) {
    status = "stable-candidate";
    next = "continue-long-run-observation";
  }

  return {
    status,
    nativeClass,
    nativeNext,
    arrivalSource: remoteMediaGap ? "remote-media-gap" : windowsArrivalGap ? "windows-arrival-gap" : queueMs >= h264W13LocalQosTargetQueueMs ? "windows-queue-backlog" : "stable",
    queueMs,
    localAvgMs,
    localMaxMs,
    remoteMediaAvgMs,
    remoteMediaMaxMs,
    presentGap: Number(nativeClassifier.presentGap) || 0,
    arrivalGapThresholdMs: h264W13LocalArrivalGapMs,
    targetQueueMs: h264W13LocalQosTargetQueueMs,
    maxQueueMs: h264W13LocalQosMaxQueueMs,
    dropPolicy,
    keyframeRequest,
    fpsAction: "hold",
    bandwidthAction: "hold",
    next,
  };
}

function requestW13LocalVideoQosKeyFrame(decision, now = performance.now(), frameId = "") {
  const timestamp = Number(now);
  if (!Number.isFinite(timestamp)) return false;
  if (state.h264DecoderNeedsKeyFrame === true) return false;
  const lastRequestedAt = Number(state.h264LiveBacklogRecoveryLastRequestedAt) || 0;
  if (lastRequestedAt > 0 && timestamp - lastRequestedAt < h264LiveBacklogKeyFrameRequestCooldownMs) {
    return false;
  }
  if (!state.connected || typeof state.client?.sendDisplaySettings !== "function") {
    return false;
  }

  state.h264LiveBacklogRecoveryLastRequestedAt = timestamp;
  state.h264LiveBacklogRecoveryCount = (Number(state.h264LiveBacklogRecoveryCount) || 0) + 1;
  state.videoLastDropReason = "w13-local-qos-keyframe-request";
  updateH264DecoderDiagnostics({
    w13LocalVideoQosStatus: decision.status,
    w13LocalVideoQosArrivalSource: decision.arrivalSource,
    w13LocalVideoQosLocalAvgMs: decision.localAvgMs,
    w13LocalVideoQosLocalMaxMs: decision.localMaxMs,
    w13LocalVideoQosRemoteMediaAvgMs: decision.remoteMediaAvgMs,
    w13LocalVideoQosRemoteMediaMaxMs: decision.remoteMediaMaxMs,
    w13LocalVideoQosDropPolicy: decision.dropPolicy,
    w13LocalVideoQosKeyframeRequest: decision.keyframeRequest,
    w13LocalVideoQosTargetQueueMs: decision.targetQueueMs,
    w13LocalVideoQosMaxQueueMs: decision.maxQueueMs,
    w13LocalVideoQosNext: decision.next,
  });
  state.client.sendDisplaySettings(buildDisplaySettingsMessage());
  addLog(
    "W13 本地视频 QoS",
    `本机队列 ${decision.queueMs} ms 超过 ${decision.targetQueueMs} ms，已请求关键帧 #${frameId || "--"}`,
  );
  return true;
}

function maybeApplyW13LocalVideoQos({ isKeyFrame = false, frameId = "", now = performance.now() } = {}) {
  const timestamp = Number(now);
  const decision = getW13LocalVideoQosDecision({ now: Number.isFinite(timestamp) ? timestamp : performance.now() });
  if (decision.status !== "local-backlog") {
    return { ...decision, dropFrame: false, requested: false, droppedFrames: 0 };
  }

  if (isKeyFrame && decision.queueMs >= decision.maxQueueMs) {
    const resync = resyncH264DecoderQueueForLatency({
      isKeyFrame: true,
      frameId,
      now: timestamp,
      reason: "w13-local-qos-keyframe-jump-live",
    });
    updateH264DecoderDiagnostics({
      w13LocalVideoQosStatus: decision.status,
      w13LocalVideoQosArrivalSource: decision.arrivalSource,
      w13LocalVideoQosLocalAvgMs: decision.localAvgMs,
      w13LocalVideoQosLocalMaxMs: decision.localMaxMs,
      w13LocalVideoQosRemoteMediaAvgMs: decision.remoteMediaAvgMs,
      w13LocalVideoQosRemoteMediaMaxMs: decision.remoteMediaMaxMs,
      w13LocalVideoQosDropPolicy: decision.dropPolicy,
      w13LocalVideoQosKeyframeRequest: "no",
      w13LocalVideoQosTargetQueueMs: decision.targetQueueMs,
      w13LocalVideoQosMaxQueueMs: decision.maxQueueMs,
      w13LocalVideoQosNext: decision.next,
    });
    return { ...decision, ...resync, requested: false, keyframeRequest: "no" };
  }

  const requested = requestW13LocalVideoQosKeyFrame(decision, timestamp, frameId);
  if (!requested) {
    return { ...decision, dropFrame: false, requested: false, droppedFrames: 0 };
  }
  if (decision.queueMs < decision.maxQueueMs) {
    return { ...decision, dropFrame: false, requested: true, droppedFrames: 0 };
  }

  const resync = resyncH264DecoderQueueForLatency({
    isKeyFrame: false,
    frameId,
    now: timestamp,
    reason: "w13-local-qos-drop-old-request-keyframe",
  });
  updateH264DecoderDiagnostics({
    w13LocalVideoQosStatus: decision.status,
    w13LocalVideoQosArrivalSource: decision.arrivalSource,
    w13LocalVideoQosLocalAvgMs: decision.localAvgMs,
    w13LocalVideoQosLocalMaxMs: decision.localMaxMs,
    w13LocalVideoQosRemoteMediaAvgMs: decision.remoteMediaAvgMs,
    w13LocalVideoQosRemoteMediaMaxMs: decision.remoteMediaMaxMs,
    w13LocalVideoQosDropPolicy: decision.dropPolicy,
    w13LocalVideoQosKeyframeRequest: decision.keyframeRequest,
    w13LocalVideoQosTargetQueueMs: decision.targetQueueMs,
    w13LocalVideoQosMaxQueueMs: decision.maxQueueMs,
    w13LocalVideoQosNext: decision.next,
  });
  return { ...decision, ...resync, requested: true };
}

function maybeRequestH264LiveBacklogKeyFrame({ isKeyFrame = false, frameId = "", now = performance.now() } = {}) {
  const timestamp = Number(now);
  const { metrics, targetAgeMs, liveBacklog } = getH264LiveBacklogStatus(timestamp);
  if (!liveBacklog) {
    return { dropFrame: false, requested: false, queueMs: metrics.oldestAgeMs, targetAgeMs };
  }

  if (isKeyFrame) {
    return resyncH264DecoderQueueForLatency({
      isKeyFrame: true,
      frameId,
      now: timestamp,
      reason: "live-backlog-keyframe-jump-live",
    });
  }

  if (state.h264DecoderNeedsKeyFrame === true) {
    return { dropFrame: false, requested: false, queueMs: metrics.oldestAgeMs, targetAgeMs };
  }
  const lastRequestedAt = Number(state.h264LiveBacklogRecoveryLastRequestedAt) || 0;
  if (lastRequestedAt > 0 && timestamp - lastRequestedAt < h264LiveBacklogKeyFrameRequestCooldownMs) {
    return { dropFrame: false, requested: false, queueMs: metrics.oldestAgeMs, targetAgeMs };
  }
  if (!state.connected || typeof state.client?.sendDisplaySettings !== "function") {
    return { dropFrame: false, requested: false, queueMs: metrics.oldestAgeMs, targetAgeMs };
  }

  state.h264LiveBacklogRecoveryLastRequestedAt = timestamp;
  state.h264LiveBacklogRecoveryCount = (Number(state.h264LiveBacklogRecoveryCount) || 0) + 1;
  state.videoLastDropReason = "live-backlog-keyframe-request";
  updateH264DecoderDiagnostics();
  state.client.sendDisplaySettings(buildDisplaySettingsMessage());
  addLog(
    "H.264 追实时",
    `本机队列 ${metrics.oldestAgeMs} ms 超过实时窗口 ${targetAgeMs} ms，已不断流请求关键帧 #${frameId || "--"}`,
  );
  return {
    dropFrame: false,
    droppedFrames: 0,
    reason: "live-backlog-keyframe-request",
    requested: true,
    queueMs: metrics.oldestAgeMs,
    targetAgeMs,
  };
}
function maybeResyncH264DecoderQueueForLatency({ isKeyFrame = false, frameId = "", now = performance.now() } = {}) {
  if (!shouldResyncH264DecoderQueue(now)) {
    return { dropFrame: false, droppedFrames: 0, queueMs: getH264DecoderQueueMetrics(now).oldestAgeMs };
  }
  return resyncH264DecoderQueueForLatency({
    isKeyFrame,
    frameId,
    now,
    reason: getH264LatencyResyncReason({ isKeyFrame }),
  });
}

function getH264KeyFrameWaitSkippedDeltaLimit() {
  const fps = Math.max(
    1,
    Math.min(
      60,
      Number(state.negotiatedFps || state.requestedFps || elements.fpsSelect.value) || 30,
    ),
  );
  return Math.max(h264KeyFrameWaitFallbackSkippedDeltas, Math.ceil(fps * 3));
}

function clearH264KeyFrameWaitTimers() {
  state.h264KeyFrameWaitStartedAt = 0;
  state.h264KeyFrameRecoveryLastRequestedAt = 0;
  state.h264RecoveryQueueGraceUntil = 0;
}

function startH264KeyFrameWait(now = performance.now(), { requestedNow = false } = {}) {
  const timestamp = Number(now);
  if (!Number.isFinite(timestamp)) return;
  const startedAt = Number(state.h264KeyFrameWaitStartedAt);
  if (!Number.isFinite(startedAt) || startedAt === 0) {
    state.h264KeyFrameWaitStartedAt = timestamp;
  }
  if (requestedNow) {
    state.h264KeyFrameRecoveryLastRequestedAt = timestamp;
    state.h264RecoveryQueueGraceUntil = timestamp + h264RecoveryQueueGraceMs;
    state.h264RecoveryInFlight = true;
    state.h264RecoveryKeyFrameReceivedAt = 0;
    state.h264RecoveryFrameDrawnAt = 0;
  }
}

function getH264KeyFrameWaitMs(now = performance.now()) {
  const startedAt = Number(state.h264KeyFrameWaitStartedAt);
  const timestamp = Number(now);
  if (!Number.isFinite(startedAt) || startedAt === 0 || !Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.round(timestamp - startedAt));
}

function shouldRetryH264KeyFrameWait(now = performance.now()) {
  const waitMs = getH264KeyFrameWaitMs(now);
  if (waitMs < h264KeyFrameWaitRecoveryTimeoutMs) {
    return false;
  }
  const timestamp = Number(now);
  const lastRequestedAt = Number(state.h264KeyFrameRecoveryLastRequestedAt) || 0;
  return lastRequestedAt <= 0 || timestamp - lastRequestedAt >= h264KeyFrameWaitRecoveryRetryMs;
}

function requestH264VideoRecovery(reason, { dropReason = "" } = {}) {
  const recoveryDropReason = String(dropReason || "").trim();
  state.h264FallbackActive = false;
  state.h264FallbackReason = "";
  state.h264FallbackRecoveryRequested = false;
  resetVideoDecoder();
  state.h264DecoderStatus = "recovering";
  state.h264DecoderNeedsKeyFrame = true;
  state.h264SkippedDeltaFrames = 0;
  startH264KeyFrameWait(performance.now(), { requestedNow: true });
  if (recoveryDropReason) {
    state.videoLastDropReason = recoveryDropReason;
  }
  updateH264DecoderDiagnostics();
  addLog("H.264 恢复", `${reason || "等待关键帧超时"}，已保持 H.264 并重启视频流`);

  if (state.connected && typeof state.client?.sendDisplaySettings === "function") {
    state.client.sendDisplaySettings(buildDisplaySettingsMessage());
  }
}
function hasH264VisibilityRecoveryEvidence() {
  const diagnosticCodec = String(state.hostDiagnostics?.videoCodec || "").toLowerCase();
  const decoderStatus = String(state.h264DecoderStatus || "").toLowerCase();
  return (
    diagnosticCodec === "h264" ||
    decoderStatus === "waiting-keyframe" ||
    decoderStatus === "decoding" ||
    decoderStatus === "configured" ||
    decoderStatus === "recovering" ||
    (Number(state.h264ReceivedFrames) || 0) > 0 ||
    (Number(state.h264DecodedFrames) || 0) > 0 ||
    state.videoLastDropReason === "queue-overflow-wait-keyframe"
  );
}

function shouldRecoverH264AfterVisibilityReturn(now = performance.now()) {
  if (!state.connected || state.h264FallbackActive || !supportsWebCodecsH264()) {
    return false;
  }
  if (!hasH264VisibilityRecoveryEvidence()) {
    return false;
  }

  const decoderStatus = String(state.h264DecoderStatus || "").toLowerCase();
  const dropReason = String(state.videoLastDropReason || "").toLowerCase();
  const hiddenAt = Number(state.videoVisibilityHiddenAt) || 0;
  const hiddenLongEnough = hiddenAt > 0 && now - hiddenAt >= h264VisibilityRecoveryMinimumHiddenMs;
  const metrics = getH264DecoderQueueMetrics(now);
  const waitingForRecovery =
    state.h264DecoderNeedsKeyFrame ||
    decoderStatus === "waiting-keyframe" ||
    decoderStatus === "recovering" ||
    dropReason === "queue-overflow-wait-keyframe";
  const queueStale = metrics.queueLength > h264MaximumQueuedFrames || metrics.oldestAgeMs > h264MaximumQueueAgeMs;
  return hiddenLongEnough || waitingForRecovery || queueStale;
}

function recoverH264AfterVisibilityReturn(reason = "visibility-return-h264-recovery") {
  const now = performance.now();
  if (!shouldRecoverH264AfterVisibilityReturn(now)) {
    state.videoVisibilityHiddenAt = 0;
    return false;
  }

  state.h264VisibilityRecoveryCount = (Number(state.h264VisibilityRecoveryCount) || 0) + 1;
  state.h264VisibilityRecoveryLastAt = now;
  requestH264VideoRecovery("窗口恢复可见，清理后台积压队列并请求 H.264 关键帧", {
    dropReason: reason || "visibility-return-h264-recovery",
  });
  state.videoVisibilityHiddenAt = 0;
  updateH264DecoderDiagnostics();
  return true;
}

function handleVideoVisibilityChange() {
  const hidden = Boolean(document.hidden || document.visibilityState === "hidden");
  if (hidden) {
    state.videoVisibilityHiddenAt = performance.now();
    if (state.audioContext && !state.audioVisibilityHiddenAt) {
      state.audioVisibilityHiddenAt = performance.now();
    }
    return;
  }
  recoverH264AfterVisibilityReturn("visibility-return-h264-recovery");
  recoverAudioAfterVisibilityReturn("visibility-return-audio-recovery");
}

function requestJpegVideoFallback(reason, { dropReason = "" } = {}) {
  if (state.h264FallbackActive) {
    return;
  }

  const errorCount = state.h264DecoderErrorCount;
  const lastError = state.h264DecoderLastError;
  const fallbackDropReason = String(dropReason || "").trim();
  state.h264FallbackActive = true;
  state.h264FallbackReason = reason || "H.264 解码失败";
  state.h264FallbackLastReason = state.h264FallbackReason;
  state.h264FallbackRecoveryDueAt = performance.now() + h264FallbackRecoveryCooldownMs;
  state.h264FallbackRecoveryJpegFrames = 0;
  state.h264FallbackRecoveryRequested = false;
  state.h264DecoderStatus = "fallback";
  resetVideoDecoder();
  state.h264DecoderStatus = "fallback";
  state.h264DecoderErrorCount = errorCount;
  state.h264DecoderLastError = lastError;
  if (fallbackDropReason) {
    state.videoLastDropReason = fallbackDropReason;
  }
  updateH264DecoderDiagnostics();
  addLog("视频回退", `${state.h264FallbackReason}，已请求 JPEG 兜底`);

  if (state.connected && typeof state.client?.sendDisplaySettings === "function") {
    state.client.sendDisplaySettings(buildDisplaySettingsMessage());
  }
}

function getH264FallbackRecoveryPausedMs(now = performance.now()) {
  const pausedUntil = Number(state.h264FallbackRecoveryPausedUntil) || 0;
  return Math.max(0, Math.ceil(pausedUntil - now));
}

function recordH264FallbackRecovery(now = performance.now()) {
  const recent = (Array.isArray(state.h264FallbackRecoveryTimestamps)
    ? state.h264FallbackRecoveryTimestamps
    : [])
    .map((timestamp) => Number(timestamp))
    .filter((timestamp) => Number.isFinite(timestamp) && now - timestamp <= h264FallbackRecoveryLoopWindowMs);
  recent.push(now);
  state.h264FallbackRecoveryTimestamps = recent;
  state.h264FallbackRecoveryCount = (Number(state.h264FallbackRecoveryCount) || 0) + 1;
  if (recent.length >= h264FallbackRecoveryLoopThreshold) {
    state.h264FallbackRecoveryPausedUntil = Math.max(
      Number(state.h264FallbackRecoveryPausedUntil) || 0,
      now + h264FallbackRecoveryPauseMs,
    );
    state.h264FallbackRecoveryPauseCount = (Number(state.h264FallbackRecoveryPauseCount) || 0) + 1;
    addLog("视频恢复暂停", "H.264 短时间反复回退，先保持 JPEG 保画面");
  }
}

function maybeRecoverH264VideoFallback(frame = {}) {
  if (!state.h264FallbackActive || state.h264FallbackRecoveryRequested) {
    return false;
  }

  const frameCodec = String(frame.codec ?? "").toLowerCase();
  const frameEncoding = String(frame.encoding ?? "").toLowerCase();
  const dataUrl = String(frame.dataUrl ?? "").toLowerCase();
  const isJpegFrame =
    frameCodec === "jpeg" ||
    frameCodec === "mjpeg" ||
    frameEncoding === "data-url" ||
    dataUrl.startsWith("data:image/jpeg");
  if (!isJpegFrame) {
    return false;
  }

  state.h264FallbackRecoveryJpegFrames = (Number(state.h264FallbackRecoveryJpegFrames) || 0) + 1;
  const now = performance.now();
  const dueAt = Number(state.h264FallbackRecoveryDueAt) || 0;
  if (
    state.h264FallbackRecoveryJpegFrames < h264FallbackRecoveryStableJpegFrames ||
    (dueAt > 0 && now < dueAt) ||
    !supportsWebCodecsH264() ||
    !state.connected ||
    typeof state.client?.sendDisplaySettings !== "function"
  ) {
    return false;
  }

  if (getH264FallbackRecoveryPausedMs(now) > 0) {
    updateH264DecoderDiagnostics();
    return false;
  }

  state.h264FallbackRecoveryRequested = true;
  recordH264FallbackRecovery(now);
  state.h264FallbackActive = false;
  state.h264FallbackReason = "";
  state.h264DecoderNeedsKeyFrame = true;
  state.h264SkippedDeltaFrames = 0;
  state.h264DecoderStatus = "recovering";
  updateH264DecoderDiagnostics();
  state.client.sendDisplaySettings(buildDisplaySettingsMessage());
  addLog("视频恢复", "JPEG 兜底稳定，已尝试恢复 H.264 低延迟");
  return true;
}
function recordH264DecodeError(error) {
  state.h264DecoderErrorCount += 1;
  state.h264DecoderStatus = "error";
  state.h264DecoderLastError = error?.message || String(error);
  updateH264DecoderDiagnostics();

  if (!state.h264DecoderWarned || state.h264DecoderErrorCount <= 3) {
    state.h264DecoderWarned = true;
    addLog("H.264 解码失败", state.h264DecoderLastError);
  }
  if (state.h264DecoderErrorCount >= 2) {
    requestJpegVideoFallback(state.h264DecoderLastError);
  }
}

async function selectH264DecoderConfig(baseConfig, format) {
  const candidates = [
    {
      label: format,
      config: { ...baseConfig, avc: { format } },
    },
    {
      label: "default",
      config: baseConfig,
    },
  ];

  if (typeof window.VideoDecoder.isConfigSupported !== "function") {
    return candidates[0];
  }

  const failures = [];
  for (const candidate of candidates) {
    try {
      const support = await window.VideoDecoder.isConfigSupported(candidate.config);
      if (support.supported) {
        return candidate;
      }
      failures.push(`${candidate.label}=unsupported`);
    } catch (error) {
      failures.push(`${candidate.label}=${error?.message || "error"}`);
    }
  }

  throw new Error(`当前窗口环境不支持 ${baseConfig.codec}（${failures.join("；")}）`);
}

function findAnnexBStartCode(bytes, fromIndex = 0) {
  for (let index = Math.max(0, fromIndex); index <= bytes.length - 3; index += 1) {
    if (bytes[index] !== 0 || bytes[index + 1] !== 0) continue;
    if (bytes[index + 2] === 1) {
      return { index, length: 3 };
    }
    if (index <= bytes.length - 4 && bytes[index + 2] === 0 && bytes[index + 3] === 1) {
      return { index, length: 4 };
    }
  }
  return null;
}

function getAnnexBNalTypes(bytes) {
  const nalTypes = [];
  let start = findAnnexBStartCode(bytes, 0);
  while (start) {
    const nalStart = start.index + start.length;
    const next = findAnnexBStartCode(bytes, nalStart);
    const nalEnd = next ? next.index : bytes.length;
    if (nalStart < nalEnd) {
      nalTypes.push(bytes[nalStart] & 0x1f);
    }
    start = next;
  }
  return nalTypes;
}

function isAnnexBPayload(bytes, encoding = "") {
  return String(encoding ?? "").toLowerCase().includes("annexb") ||
    Boolean(findAnnexBStartCode(bytes, 0));
}

function uint8ArrayToBase64(bytes) {
  let binary = "";
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return window.btoa(binary);
}

function parseLengthPrefixedNalUnits(bytes, lengthSize) {
  const units = [];
  let index = 0;
  while (index + lengthSize <= bytes.length) {
    let nalLength = 0;
    for (let offset = 0; offset < lengthSize; offset += 1) {
      nalLength = (nalLength << 8) | bytes[index + offset];
    }
    index += lengthSize;
    if (nalLength <= 0 || index + nalLength > bytes.length) {
      return [];
    }
    units.push(bytes.subarray(index, index + nalLength));
    index += nalLength;
  }
  return units;
}

function hasLikelyH264NalUnits(units) {
  return units.length > 0 && units.every((unit) => {
    const nalType = unit?.length ? unit[0] & 0x1f : 0;
    return nalType > 0 && nalType <= 23;
  });
}

function getLengthPrefixedNalUnits(bytes, lengthSize = 0) {
  const requestedSize = Number(lengthSize);
  const candidateSizes = [1, 2, 4].includes(requestedSize)
    ? [requestedSize]
    : [4, 2, 1];
  for (const candidateSize of candidateSizes) {
    const units = parseLengthPrefixedNalUnits(bytes, candidateSize);
    if (hasLikelyH264NalUnits(units)) {
      return units;
    }
  }
  return [];
}

function getLengthPrefixedNalTypes(bytes, lengthSize = 0) {
  return getLengthPrefixedNalUnits(bytes, lengthSize).map((nal) => nal[0] & 0x1f);
}

function toAnnexBBytesFromLengthPrefixed(bytes, lengthSize = 0) {
  const units = getLengthPrefixedNalUnits(bytes, lengthSize);
  if (!units.length) return bytes;
  const totalLength = units.reduce((total, unit) => total + 4 + unit.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const unit of units) {
    output.set([0, 0, 0, 1], offset);
    offset += 4;
    output.set(unit, offset);
    offset += unit.length;
  }
  return output;
}

function getNativeH264AnnexBPayloadBase64(frame, payloadBytes) {
  if (isAnnexBPayload(payloadBytes, frame.encoding)) {
    return frame.payload;
  }
  return uint8ArrayToBase64(toAnnexBBytesFromLengthPrefixed(payloadBytes));
}

function getH264PayloadNalTypes(bytes, encoding) {
  return isAnnexBPayload(bytes, encoding)
    ? getAnnexBNalTypes(bytes)
    : getLengthPrefixedNalTypes(bytes);
}

function isH264KeyFrameNalTypes(nalTypes) {
  return nalTypes.includes(5) || nalTypes.includes(7) || nalTypes.includes(8);
}

function isH264KeyFramePayload(bytes, encoding) {
  return isH264KeyFrameNalTypes(getH264PayloadNalTypes(bytes, encoding));
}

function countH264NalType(nalTypes, type) {
  return nalTypes.filter((nalType) => nalType === type).length;
}

function recordH264ReceiveEvidence({ frame = {}, nalTypes = [], isKeyFrame = false } = {}) {
  const normalizedNalTypes = nalTypes
    .map((nalType) => Number(nalType))
    .filter((nalType) => Number.isInteger(nalType) && nalType >= 0);
  state.h264ReceivedFrames = (Number(state.h264ReceivedFrames) || 0) + 1;
  if (isKeyFrame) {
    state.h264ReceivedKeyFrames = (Number(state.h264ReceivedKeyFrames) || 0) + 1;
    state.h264LastKeyFrameId = String(frame.frameId ?? state.videoFrames ?? "");
  } else {
    state.h264ReceivedDeltaFrames = (Number(state.h264ReceivedDeltaFrames) || 0) + 1;
  }
  state.h264ReceivedSps = (Number(state.h264ReceivedSps) || 0) + countH264NalType(normalizedNalTypes, 7);
  state.h264ReceivedPps = (Number(state.h264ReceivedPps) || 0) + countH264NalType(normalizedNalTypes, 8);
  state.h264ReceivedIdr = (Number(state.h264ReceivedIdr) || 0) + countH264NalType(normalizedNalTypes, 5);
  state.h264LastNalTypes = normalizedNalTypes.length ? normalizedNalTypes.slice(0, 8).join("/") : "";
}

function isW8NativeVideoMainSurfacePresenting() {
  if (!getTauriInvoke()) return false;
  const presentReady = Boolean(
    state.w8NativeVideoNativePresentReady ||
      state.hostDiagnostics?.w8NativeVideoNativePresentReady,
  );
  const presentFrames =
    Number(
      state.w8NativeVideoNativePresentFrames ||
        state.hostDiagnostics?.w8NativeVideoNativePresentFrames,
    ) || 0;
  const presentStatus = String(
    state.w8NativeVideoNativePresentStatus ||
      state.hostDiagnostics?.w8NativeVideoNativePresentStatus ||
      "",
  ).toLowerCase();
  return presentReady && presentFrames > 0 && presentStatus.includes("presented");
}

function bypassWebH264DecodeForNativeMainSurface(frame = {}) {
  if (state.h264Decoder && state.h264Decoder.state !== "closed") {
    try {
      state.h264Decoder.close();
    } catch {
      // Once native HWND presentation is active, WebCodecs teardown is best-effort.
    }
  }
  state.h264Decoder = null;
  state.h264DecoderKey = "";
  state.h264DecoderCodec = "";
  state.h264DecoderQueue = [];
  state.h264DecoderLatencyMs = 0;
  state.videoDecoderQueueMs = 0;
  state.videoDroppedStaleFrames = 0;
  state.videoLastDropReason = "";
  state.h264SkippedDeltaFrames = 0;
  state.h264DecoderNeedsKeyFrame = false;
  state.h264RecoveryInFlight = false;
  state.h264RecoveryKeyFrameReceivedAt = 0;
  state.h264RecoveryFrameDrawnAt = 0;
  state.h264RecoveryQueueGraceUntil = 0;
  state.h264LiveBacklogRecoveryLastRequestedAt = 0;
  state.h264LiveBacklogRecoveryCount = 0;
  clearH264KeyFrameWaitTimers();
  state.h264DecoderStatus = "native-main-surface";
  state.h264WebDecodeBypassedForNativeSurface =
    (Number(state.h264WebDecodeBypassedForNativeSurface) || 0) + 1;
  state.h264WebDecodeBypassReason = "native-main-surface-presenting";
  state.h264WebDecodeBypassLastFrameId = String(frame.frameId ?? state.videoFrames ?? "");
  updateH264DecoderDiagnostics();
  elements.remoteStatusText.textContent =
    `原生主画面接管中，WebCodecs 已旁路 #${frame.frameId ?? state.videoFrames}`;
}

async function renderH264VideoFrame(frame) {
  if (!frame.payload) {
    addLog("视频帧", "收到 H.264 视频帧但缺少 payload");
    return;
  }

  state.videoFrames += 1;
  recordVideoFrameTime(frame);
  updateFpsMetric();
  const frameAgeDiagnostics = getVideoFrameAgeDiagnostics(frame);
  updateVideoFrameAgeMetric(frameAgeDiagnostics);
  updateHostDiagnostics({
    videoCodec: "h264",
    videoEncoding: frame.encoding ?? "annexb-base64",
    videoSource: frame.source ?? state.hostDiagnostics.videoSource,
    capturePipeline: frame.capturePipeline ?? "screencapturekit-h264",
    droppedFrames: frame.droppedFrames ?? state.hostDiagnostics.droppedFrames,
    ...frameAgeDiagnostics,
    qualityPreset: frame.qualityPreset ?? state.hostDiagnostics.qualityPreset,
    maxScreenFps: normalizeRemoteMaxScreenFps(frame.maxScreenFps) ?? state.hostDiagnostics.maxScreenFps,
  });

  if (state.h264FallbackActive) {
    state.h264DecoderStatus = "fallback";
    updateH264DecoderDiagnostics();
    elements.remoteStatusText.textContent = "H.264 解码失败，正在等待 JPEG 兜底画面";
    if (state.videoFrames === 1 || state.videoFrames % 30 === 0) {
      addLog("视频回退", `等待 JPEG 兜底，忽略 H.264 帧 #${frame.frameId ?? state.videoFrames}`);
    }
    return;
  }

  if (frame.width && frame.height) {
    state.remoteFrameWidth = Number(frame.width);
    state.remoteFrameHeight = Number(frame.height);
    elements.metricResolution.textContent = `${frame.width} × ${frame.height}`;
  }
  applyScaleMode();
  elements.remoteCanvas.classList.add("has-video-frame");
  elements.remoteStatusText.textContent = `正在接收 H.264 视频帧 #${frame.frameId ?? state.videoFrames}`;

  try {
    const payloadBytes = base64ToUint8Array(frame.payload);
    const nalTypes = getH264PayloadNalTypes(payloadBytes, frame.encoding);
    const isKeyFrame = Boolean(frame.keyFrame) || isH264KeyFrameNalTypes(nalTypes);
    recordH264ReceiveEvidence({ frame, nalTypes, isKeyFrame });
    if (!shouldUseW14NativeReceiverVideoPath()) {
      void pushW8NativeH264AnnexBFrame(frame, getNativeH264AnnexBPayloadBase64(frame, payloadBytes));
    }
    if (isW8NativeVideoMainSurfacePresenting()) {
      bypassWebH264DecodeForNativeMainSurface(frame);
      return;
    }
    const latencyResync = maybeResyncH264DecoderQueueForLatency({
      isKeyFrame,
      frameId: frame.frameId ?? state.videoFrames,
    });
    if (latencyResync.dropFrame) {
      elements.remoteStatusText.textContent = `H.264 本机队列过高，已丢旧帧并等待关键帧 #${frame.frameId ?? state.videoFrames}`;
      return;
    }
    const w13LocalQos = maybeApplyW13LocalVideoQos({
      isKeyFrame,
      frameId: frame.frameId ?? state.videoFrames,
    });
    if (w13LocalQos.dropFrame) {
      elements.remoteStatusText.textContent =
        `W13 本地 QoS：队列 ${w13LocalQos.queueMs} ms，已丢旧帧并请求关键帧`;
      return;
    }
    if (w13LocalQos.requested) {
      elements.remoteStatusText.textContent =
        `W13 本地 QoS：队列 ${w13LocalQos.queueMs} ms，已请求关键帧`;
    }
    const liveBacklogRequest = maybeRequestH264LiveBacklogKeyFrame({
      isKeyFrame,
      frameId: frame.frameId ?? state.videoFrames,
    });
    if (liveBacklogRequest.requested) {
      elements.remoteStatusText.textContent = `H.264 本机队列 ${liveBacklogRequest.queueMs} ms，已请求关键帧追实时`;
    }
    if (state.h264DecoderNeedsKeyFrame && !isKeyFrame) {
      const waitNow = performance.now();
      startH264KeyFrameWait(waitNow);
      state.h264SkippedDeltaFrames += 1;
      state.h264DecoderStatus = "waiting-keyframe";
      updateH264DecoderDiagnostics();
      elements.remoteStatusText.textContent = `等待 H.264 关键帧，已跳过 delta #${frame.frameId ?? state.videoFrames}`;
      if (state.h264SkippedDeltaFrames % 30 === 0) {
        addLog("H.264 等待关键帧", `跳过 delta 帧 #${frame.frameId ?? state.videoFrames}`);
      }
      const skippedDeltaLimit = getH264KeyFrameWaitSkippedDeltaLimit();
      const waitMs = getH264KeyFrameWaitMs(waitNow);
      const timedRecoveryDue = shouldRetryH264KeyFrameWait(waitNow);
      if (state.h264SkippedDeltaFrames >= skippedDeltaLimit || timedRecoveryDue) {
        const recoveryReason = timedRecoveryDue
          ? `H.264 等待关键帧超过 ${waitMs} ms，重新请求关键帧`
          : `H.264 等待关键帧超时，已跳过 ${state.h264SkippedDeltaFrames} 帧`;
        requestH264VideoRecovery(
          recoveryReason,
          { dropReason: "keyframe-wait-h264-recovery" },
        );
        elements.remoteStatusText.textContent = "H.264 等待关键帧超时，正在重启 H.264 视频流";
      }
      return;
    }
    if (isKeyFrame) {
      const keyFrameNow = performance.now();
      state.h264DecoderNeedsKeyFrame = false;
      recordH264RecoveryKeyFrameReceived(keyFrameNow);
      clearH264KeyFrameWaitTimers();
    }
    const decoder = await ensureH264Decoder(frame, { currentFrameIsKeyFrame: isKeyFrame });
    const durationUs = Number(frame.durationUs) || Math.round(1_000_000 / Math.max(1, state.negotiatedFps || 30));
    const timestampUs =
      Number(frame.timestampUs) ||
      Math.max(0, Number(frame.frameId ?? state.videoFrames) - 1) * durationUs;
    state.h264DecoderStatus = "decoding";
    state.h264DecoderQueue.push({
      frameId: frame.frameId ?? state.videoFrames,
      queuedAt: performance.now(),
      timestampUs,
      keyFrame: isKeyFrame,
    });
    if (state.h264DecoderQueue.length > 120) {
      state.h264DecoderQueue.shift();
    }
    updateH264DecoderDiagnostics();
    const chunk = new EncodedVideoChunk({
      type: isKeyFrame ? "key" : "delta",
      timestamp: timestampUs,
      duration: durationUs,
      data: payloadBytes,
    });
    decoder.decode(chunk);
  } catch (error) {
    recordH264DecodeError(error);
  }

  if (state.videoFrames === 1 || state.videoFrames % 30 === 0) {
    addLog(
      "视频帧",
      `#${frame.frameId ?? state.videoFrames} · ${frame.width ?? "--"}×${frame.height ?? "--"} · h264`,
    );
  }
}

async function ensureH264Decoder(frame, { currentFrameIsKeyFrame = false } = {}) {
  if (!supportsWebCodecsH264()) {
    state.h264DecoderStatus = "unsupported";
    updateH264DecoderDiagnostics();
    throw new Error("当前窗口环境不支持 WebCodecs H.264 解码");
  }

  const codec = frame.codecString || "avc1.42E01F";
  const format = String(frame.encoding ?? "annexb-base64").toLowerCase().includes("annexb")
    ? "annexb"
    : "avc";
  const decoderKey = `${codec}:${format}`;
  if (state.h264Decoder && state.h264Decoder.state !== "closed" && state.h264DecoderKey === decoderKey) {
    return state.h264Decoder;
  }

  const previousErrorCount = state.h264DecoderErrorCount;
  const previousWarned = state.h264DecoderWarned;
  const previousLastError = state.h264DecoderLastError;
  const previousQueueMs = state.videoDecoderQueueMs;
  const previousDroppedStaleFrames = state.videoDroppedStaleFrames;
  const previousLastDropReason = state.videoLastDropReason;
  const previousRecoveryInFlight = state.h264RecoveryInFlight;
  const previousRecoveryKeyFrameReceivedAt = state.h264RecoveryKeyFrameReceivedAt;
  const previousRecoveryFrameDrawnAt = state.h264RecoveryFrameDrawnAt;
  const previousRecoveryQueueGraceUntil = state.h264RecoveryQueueGraceUntil;
  const previousLiveBacklogRecoveryLastRequestedAt = state.h264LiveBacklogRecoveryLastRequestedAt;
  const previousLiveBacklogRecoveryCount = state.h264LiveBacklogRecoveryCount;
  resetVideoDecoder();
  state.h264DecoderErrorCount = previousErrorCount;
  state.h264DecoderWarned = previousWarned;
  state.h264DecoderLastError = previousLastError;
  state.videoDecoderQueueMs = previousQueueMs;
  state.videoDroppedStaleFrames = previousDroppedStaleFrames;
  state.videoLastDropReason = previousLastDropReason;
  state.h264RecoveryInFlight = previousRecoveryInFlight;
  state.h264RecoveryKeyFrameReceivedAt = previousRecoveryKeyFrameReceivedAt;
  state.h264RecoveryFrameDrawnAt = previousRecoveryFrameDrawnAt;
  state.h264RecoveryQueueGraceUntil = previousRecoveryQueueGraceUntil;
  state.h264LiveBacklogRecoveryLastRequestedAt = previousLiveBacklogRecoveryLastRequestedAt;
  state.h264LiveBacklogRecoveryCount = previousLiveBacklogRecoveryCount;
  state.h264DecoderStatus = "configuring";
  state.h264DecoderKey = decoderKey;
  state.h264DecoderCodec = `${decoderKey}:checking`;
  updateH264DecoderDiagnostics();
  const baseConfig = {
    codec,
    hardwareAcceleration: "prefer-hardware",
    optimizeForLatency: true,
  };
  const { config, label } = await selectH264DecoderConfig(baseConfig, format);

  const decoder = new VideoDecoder({
    output: drawDecodedVideoFrame,
    error: (error) => {
      recordH264DecodeError(error);
    },
  });
  decoder.configure(config);
  state.h264Decoder = decoder;
  state.h264DecoderKey = decoderKey;
  state.h264DecoderCodec = `${codec}:${label}`;
  if (currentFrameIsKeyFrame) {
    state.h264DecoderNeedsKeyFrame = false;
    clearH264KeyFrameWaitTimers();
  }
  state.h264DecoderStatus = "configured";
  updateH264DecoderDiagnostics();
  return decoder;
}

function drawDecodedVideoFrame(videoFrame) {
  const decodedMeta = state.h264DecoderQueue.shift();
  const width = videoFrame.displayWidth || videoFrame.codedWidth || state.remoteFrameWidth;
  const height = videoFrame.displayHeight || videoFrame.codedHeight || state.remoteFrameHeight;
  if (width && height) {
    state.remoteFrameWidth = width;
    state.remoteFrameHeight = height;
    elements.metricResolution.textContent = `${width} × ${height}`;
  }

  const canvas = elements.remoteVideoCanvas;
  if (canvas.width !== state.remoteFrameWidth) {
    canvas.width = state.remoteFrameWidth;
  }
  if (canvas.height !== state.remoteFrameHeight) {
    canvas.height = state.remoteFrameHeight;
  }

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    videoFrame.close();
    addLog("H.264 解码器", "无法取得视频画布上下文");
    return;
  }
  context.drawImage(videoFrame, 0, 0, canvas.width, canvas.height);
  videoFrame.close();
  state.h264DecodedFrames += 1;
  state.h264DecoderStatus = "rendering";
  if (decodedMeta?.keyFrame) {
    markH264RecoveryFrameDrawn();
  }
  state.h264DecoderLatencyMs = decodedMeta?.queuedAt
    ? performance.now() - decodedMeta.queuedAt
    : state.h264DecoderLatencyMs;

  elements.remoteFrameImage.classList.remove("is-visible");
  elements.remoteFrameImage.removeAttribute("src");
  canvas.classList.add("is-visible");
  elements.remoteCanvas.classList.add("has-video-frame");
  elements.remoteStatusText.textContent = `H.264 已解码 #${decodedMeta?.frameId ?? state.h264DecodedFrames}`;
  updateH264DecoderDiagnostics();
  applyScaleMode();
}

function base64ToUint8Array(value) {
  const binary = window.atob(String(value));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getVideoFrameLabel(frame) {
  const codec = String(frame.codec ?? "").toLowerCase();
  const dataUrl = String(frame.dataUrl ?? "").toLowerCase();
  if (codec === "jpeg" || dataUrl.startsWith("data:image/jpeg")) {
    return "真实 JPEG 视频帧";
  }
  if (codec === "mock-svg" || dataUrl.startsWith("data:image/svg")) {
    return "模拟视频帧";
  }
  if (codec) {
    return `${codec} 视频帧`;
  }
  return "视频帧";
}

function tickClock() {
  elements.clockText.textContent = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

elements.transportSelect.addEventListener("change", () => {
  const isWebSocket = elements.transportSelect.value === "websocket";
  savePreferences();
  addLog("连接方式", isWebSocket ? "WebSocket 局域网" : "本地模拟");
});
elements.mockScenarioSelect.addEventListener("change", () => {
  savePreferences();
  addLog("模拟场景", elements.mockScenarioSelect.selectedOptions[0]?.textContent ?? "正常连接");
});
elements.connectButton.addEventListener("click", () => {
  primeAudioPlayback();
  void connect();
});
elements.reconnectNowButton.addEventListener("click", () => {
  primeAudioPlayback();
  reconnectNow();
});
elements.disconnectButton.addEventListener("click", disconnect);
elements.refreshDevicesButton.addEventListener("click", refreshDevices);
elements.copyLogButton.addEventListener("click", () => {
  void copyLogsToClipboard();
});
elements.exportLogButton.addEventListener("click", exportLogs);
elements.clearLogButton.addEventListener("click", () => {
  state.logEntries = [];
  elements.eventLog.innerHTML = "";
  addLog("日志", "已清空");
});
elements.localHostReadinessButton.addEventListener("click", () => {
  void runLocalHostReadiness();
});
elements.localHostFirewallButton.addEventListener("click", () => {
  void previewLocalHostFirewallRule();
});
elements.localHostStartButton.addEventListener("click", () => {
  void startLocalWindowsHost();
});
elements.localHostStopButton.addEventListener("click", () => {
  void stopLocalWindowsHost();
});
elements.localHostReverseGrantButton.addEventListener("click", () => {
  void grantLocalHostReverseControl();
});
elements.localMacAlertWatcherToggleButton.addEventListener("click", () => {
  void toggleMacAlertWatcher();
});
elements.localMacAlertWatcherRefreshButton.addEventListener("click", () => {
  void refreshMacAlertWatcherStatus();
});
for (const button of elements.localMacHeartbeatCommandButtons) {
  button.addEventListener("click", () => {
    void copyMacHeartbeatCommand(button.dataset.macHeartbeatCommand, button);
  });
}

elements.fullscreenButton.addEventListener("click", () => setFullscreen(true));
elements.windowModeButton.addEventListener("click", () => setFullscreen(false));
elements.monitorModeButton.addEventListener("click", () => setMonitorMode(!state.monitorMode));
elements.reverseButton.addEventListener("click", requestReverseControl);
elements.controlCenterToggle.addEventListener("click", () => {
  setControlCenterOpen(elements.controlCenterPanel.hidden);
});
elements.floatingFullscreenButton.addEventListener("click", () => {
  setFullscreen(true);
  setControlCenterOpen(false);
});
elements.floatingImmersiveFullscreenButton.addEventListener("click", () => {
  void enterImmersiveFullscreen();
  setControlCenterOpen(false);
});
elements.floatingWindowButton.addEventListener("click", () => {
  setFullscreen(false);
  setControlCenterOpen(false);
});
elements.floatingMonitorModeButton.addEventListener("click", () => {
  setMonitorMode(true);
  setControlCenterOpen(false);
});
elements.floatingCopyDiagnosticsButton.addEventListener("click", () => {
  void copyLogsToClipboard();
});
elements.floatingReconnectButton.addEventListener("click", () => {
  primeAudioPlayback();
  reconnectNow();
});
elements.floatingDisconnectButton.addEventListener("click", () => {
  disconnect();
  setControlCenterOpen(false);
});
elements.monitorModeRestoreButton.addEventListener("click", () => {
  setMonitorMode(false);
});
elements.monitorModeCopyButton.addEventListener("click", () => {
  void copyLogsToClipboard();
});
elements.monitorModeDisconnectButton.addEventListener("click", () => {
  disconnect();
  setMonitorMode(false);
});
elements.monitorModeDragHandle.addEventListener("pointerdown", startMonitorModeDrag);
elements.floatingQualitySelect.addEventListener("change", () => {
  elements.qualityPresetSelect.value = elements.floatingQualitySelect.value;
  dispatchControlEvent(elements.qualityPresetSelect);
  syncFloatingControlCenter();
});
elements.floatingDisplaySelect.addEventListener("change", () => {
  elements.displaySelect.value = elements.floatingDisplaySelect.value;
  dispatchControlEvent(elements.displaySelect);
  syncFloatingControlCenter();
});
elements.floatingResolutionSelect.addEventListener("change", () => {
  elements.resolutionSelect.value = elements.floatingResolutionSelect.value;
  dispatchControlEvent(elements.resolutionSelect);
  syncFloatingControlCenter();
});
elements.floatingFpsSelect.addEventListener("change", () => {
  elements.fpsSelect.value = elements.floatingFpsSelect.value;
  dispatchControlEvent(elements.fpsSelect);
  syncFloatingControlCenter();
});
elements.floatingBandwidthSelect.addEventListener("change", () => {
  elements.bandwidthSelect.value = elements.floatingBandwidthSelect.value;
  dispatchControlEvent(elements.bandwidthSelect);
  syncFloatingControlCenter();
});
elements.floatingScaleSelect.addEventListener("change", () => {
  elements.scaleModeSelect.value = elements.floatingScaleSelect.value;
  dispatchControlEvent(elements.scaleModeSelect);
  syncFloatingControlCenter();
});
elements.floatingAudioSelect.addEventListener("change", () => {
  elements.audioToggle.checked = elements.floatingAudioSelect.value === "on";
  dispatchControlEvent(elements.audioToggle);
  syncFloatingControlCenter();
});
elements.floatingAudioVolumeRange.addEventListener("input", () => {
  elements.audioVolumeRange.value = elements.floatingAudioVolumeRange.value;
  dispatchControlEvent(elements.audioVolumeRange, "input");
  syncFloatingControlCenter();
});
elements.floatingShortcutButton.addEventListener("click", () => {
  void sendFloatingShortcut();
});
elements.fullscreenHintClose.addEventListener("click", hideFullscreenHint);

elements.qualityPresetSelect.addEventListener("change", () => {
  if (elements.qualityPresetSelect.value === "custom") {
    savePreferences();
    addLog("画质预设", "自定义");
    syncFloatingControlCenter();
    return;
  }
  applyQualityPreset(elements.qualityPresetSelect.value);
});
elements.resolutionSelect.addEventListener("change", () => {
  markQualityPresetCustom();
  sendDisplaySettings();
});
elements.displaySelect.addEventListener("change", () => {
  state.activeDisplayId = elements.displaySelect.value;
  sendDisplaySettings();
  addLog("显示器", elements.displaySelect.selectedOptions[0]?.textContent ?? state.activeDisplayId);
});
elements.scaleModeSelect.addEventListener("change", () => {
  applyScaleMode();
  sendDisplaySettings();
  addLog("缩放模式", elements.scaleModeSelect.selectedOptions[0]?.textContent ?? "适应窗口");
});
elements.fpsSelect.addEventListener("change", () => {
  markQualityPresetCustom();
  sendDisplaySettings();
});
elements.bandwidthSelect.addEventListener("change", () => {
  markQualityPresetCustom();
  sendDisplaySettings();
});
elements.audioToggle.addEventListener("change", () => {
  savePreferences();
  addLog("声音", elements.audioToggle.checked ? "已请求接收被控端声音" : "已关闭声音接收");
  if (elements.audioToggle.checked) {
    primeAudioPlayback();
    if (state.connected && Number(state.audioFrames || 0) <= 0) {
      state.audioWaitingSince = performance.now();
    }
  } else {
    resetAudioPlayback();
  }
  syncFloatingControlCenter();
  sendDisplaySettings();
});
elements.audioVolumeRange.addEventListener("input", () => {
  elements.audioVolumeText.textContent = `${elements.audioVolumeRange.value}%`;
  syncFloatingControlCenter();
  if (state.audioGain) {
    state.audioGain.gain.value = Number(elements.audioVolumeRange.value) / 100;
  }
  if (!state.connected || !state.client) {
    savePreferences();
    return;
  }
  state.client.sendAudioSettings(buildAudioSettingsMessage());
  elements.audioText.textContent = `声音：音量 ${elements.audioVolumeRange.value}%`;
  savePreferences();
});
elements.clipboardToggle.addEventListener("change", () => {
  updateMetrics();
  savePreferences();
  addLog("剪贴板", elements.clipboardToggle.checked ? "已开启" : "已关闭");
  sendDisplaySettings();
});
elements.fileClipboardButton.addEventListener("click", () => {
  void handleFileClipboardButtonClick();
});
elements.fileClipboardInput.addEventListener("change", sendClipboardFiles);
elements.copyReceivedFilesButton.addEventListener("click", () => {
  void copyReceivedFilesToSystemClipboard();
});
elements.downloadAllReceivedFilesButton.addEventListener("click", downloadAllReceivedFiles);
elements.openReceivedFilesTempButton.addEventListener("click", openReceivedFilesTempPath);
elements.clearReceivedFilesButton.addEventListener("click", clearReceivedFiles);
[
  elements.keyMapWinSelect,
  elements.keyMapAltSelect,
  elements.keyMapCtrlSelect,
  elements.shortcutCompatToggle,
].forEach((select) => {
  select.addEventListener("change", () => {
    savePreferences();
    const mapping = getKeyboardMapping();
    const shortcutText = elements.shortcutCompatToggle.checked ? "Windows 快捷键开启" : "Windows 快捷键关闭";
    addLog(
      "按键映射",
      `Win→${remoteModifierLabels[mapping.win]}，Alt→${remoteModifierLabels[mapping.alt]}，Ctrl→${remoteModifierLabels[mapping.ctrl]}，${shortcutText}`,
    );
  });
});
elements.resetKeyMapButton.addEventListener("click", resetKeyboardMapping);

[
  elements.hostInput,
  elements.portInput,
  elements.localHostPortInput,
  elements.localHostScreenModeSelect,
  elements.localHostAudioModeSelect,
  elements.localHostInputModeSelect,
  elements.localHostReverseControlModeSelect,
  elements.localHostReadinessProfileSelect,
].forEach((input) => {
  input.addEventListener("change", savePreferences);
});

elements.remoteCanvas.addEventListener("mousemove", updateCursor);
elements.remoteFrameImage.addEventListener("error", () => {
  const frameId = elements.remoteFrameImage.dataset.frameId || String(state.videoFrames);
  if (state.lastFrameDecodeErrorId === frameId) {
    return;
  }
  state.lastFrameDecodeErrorId = frameId;
  const codec = elements.remoteFrameImage.dataset.frameCodec || "unknown";
  elements.remoteStatusText.textContent = `视频帧解码失败 #${frameId}`;
  addLog("视频帧", `图片解码失败 · #${frameId} · ${codec}`);
});
elements.remoteCanvas.addEventListener("contextmenu", (event) => {
  if (canSendControlInput() && mapPointerToRemote(event)) {
    event.preventDefault();
  }
});
elements.remoteCanvas.addEventListener("mousedown", (event) => {
  if (!canSendControlInput()) return;
  elements.remoteCanvas.focus();
  const mapped = mapPointerToRemote(event);
  if (!mapped) {
    handlePointerOutsideFrame("down");
    return;
  }
  rememberRemotePointer(mapped);
  state.remotePointerButtonsDown.add(event.button);
  registerInputEvent("鼠标按下", `button=${event.button} · ${mapped.remoteX},${mapped.remoteY}`, {
    event: "mouse_button",
    pointerType: "mouse",
    action: "down",
    button: getMouseButtonName(event.button),
    localButton: event.button,
    x: mapped.x,
    y: mapped.y,
    remoteX: mapped.remoteX,
    remoteY: mapped.remoteY,
    scaleMode: elements.scaleModeSelect.value,
  });
});
elements.remoteCanvas.addEventListener("mouseup", (event) => {
  if (!canSendControlInput()) return;
  const mapped = getMappedPointerForRelease(event);
  state.remotePointerButtonsDown.delete(event.button);
  if (!mapped) {
    handlePointerOutsideFrame("up");
    return;
  }
  registerInputEvent("鼠标抬起", `button=${event.button} · ${mapped.remoteX},${mapped.remoteY}`, {
    event: "mouse_button",
    pointerType: "mouse",
    action: "up",
    button: getMouseButtonName(event.button),
    localButton: event.button,
    x: mapped.x,
    y: mapped.y,
    remoteX: mapped.remoteX,
    remoteY: mapped.remoteY,
    scaleMode: elements.scaleModeSelect.value,
  });
});
elements.remoteCanvas.addEventListener("wheel", (event) => {
  if (!canSendControlInput()) return;
  const mapped = mapPointerToRemote(event);
  if (!mapped) {
    handlePointerOutsideFrame("wheel");
    return;
  }
  event.preventDefault();
  rememberRemotePointer(mapped);
  registerInputEvent("滚轮", `deltaY=${Math.round(event.deltaY)}`, {
    event: "mouse_wheel",
    pointerType: "mouse",
    action: "wheel",
    deltaY: Math.round(event.deltaY),
    x: mapped.x,
    y: mapped.y,
    remoteX: mapped.remoteX,
    remoteY: mapped.remoteY,
    scaleMode: elements.scaleModeSelect.value,
  });
});
elements.remoteCanvas.addEventListener("keydown", async (event) => {
  if (!canSendControlInput()) return;
  const mapped = mapKeyboardModifiers(event);
  event.preventDefault();
  if (mapped.shortcutAction === "paste") {
    await syncClipboardBeforePaste();
  }
  registerInputEvent("键盘", describeKeyboardInput(event, mapped), {
    event: "key",
    action: "key",
    key: mapped.key ?? event.key,
    code: mapped.code ?? event.code,
    repeat: event.repeat,
    ctrlKey: mapped.ctrlKey,
    altKey: mapped.altKey,
    shiftKey: mapped.shiftKey,
    metaKey: mapped.metaKey,
    modifiers: mapped.modifiers,
    remoteModifiers: mapped.modifiers,
    keyboardMapping: mapped.mapping,
    shortcutProfile: mapped.shortcutProfile,
    shortcutAction: mapped.shortcutAction,
    localKey: event.key,
    localCode: event.code,
    localCtrlKey: event.ctrlKey,
    localAltKey: event.altKey,
    localShiftKey: event.shiftKey,
    localMetaKey: event.metaKey,
  });
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.fullscreen) {
    if (!elements.controlCenterPanel.hidden) {
      setControlCenterOpen(false);
    }
    setFullscreen(false);
    return;
  }
  if (event.key === "Escape" && !elements.controlCenterPanel.hidden) {
    setControlCenterOpen(false);
  }
});
document.addEventListener("pointerdown", (event) => {
  if (
    !elements.controlCenterPanel.hidden &&
    !elements.remoteControlCenter.contains(event.target)
  ) {
    setControlCenterOpen(false);
  }
});
document.addEventListener("fullscreenchange", handleNativeFullscreenChange);
document.addEventListener("webkitfullscreenchange", handleNativeFullscreenChange);
document.addEventListener("visibilitychange", handleVideoVisibilityChange);
window.addEventListener("focus", () => {
  recoverH264AfterVisibilityReturn("window-focus-h264-recovery");
  recoverAudioAfterVisibilityReturn("window-focus-audio-recovery");
});
window.addEventListener("pointermove", moveMonitorModeWindow);
window.addEventListener("pointerup", stopMonitorModeDrag);
document.addEventListener("MSFullscreenChange", handleNativeFullscreenChange);

tickClock();
setInterval(tickClock, 1000);
setInterval(renderAudioStreamStallStatus, audioStreamStallPollMs);
setInterval(renderVideoStreamStallStatus, videoStreamStatusPollMs);
setInterval(expireStaleRemoteFileTransfers, remoteFileTransferSweepIntervalMs);
setInterval(expirePendingOutgoingFileResult, remoteFileTransferSweepIntervalMs);
applyPreferences();
const launchParams = window.LanDualLaunchParams?.applyLaunchParams({
  search: window.location.search,
  elements,
  log: addLog,
});
if (launchParams?.applied) {
  savePreferences();
  if (launchParams.focusPassword && elements.passwordInput) {
    elements.passwordInput.focus();
    elements.passwordInput.select();
  }
}
state.discoveredDevices = buildDeviceList();
renderDiscoveredDevices();
applyScaleMode();
updateMetrics();
renderReceivedFiles();
resetHostDiagnostics();
updateReverseControlUi();
updateLocalHostControls();
updateLocalMacAlertWatcherControls();
startLocalHostPolling();
void refreshLocalHostProcessStatus();
addLog("控制端启动", "本地模拟模式，可切换 WebSocket");
