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
  floatingCopyDiagnosticsButton: document.querySelector("#floatingCopyDiagnosticsButton"),
  floatingReconnectButton: document.querySelector("#floatingReconnectButton"),
  floatingDisconnectButton: document.querySelector("#floatingDisconnectButton"),
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
const nativeClipboardChunkSizeBytes = 1024 * 1024;
const maxNativeClipboardFileBytes = maxClipboardFileBytes;
const defaultAgentLinkServer = "http://192.168.31.68:17888";
const localMacAlertWatcherStatusPollMs = 15000;
const defaultHostDiagnosticsText = "诊断：等待连接。";
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
const videoDecoderStatusLabels = {
  idle: "待机",
  unsupported: "不支持",
  configuring: "初始化",
  configured: "已就绪",
  decoding: "解码中",
  rendering: "已绘制",
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
  client: null,
  activeHost: "",
  activePort: "",
  videoFrames: 0,
  videoFrameTimes: [],
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
  h264DecoderErrorCount: 0,
  h264DecoderWarned: false,
  h264DecoderQueue: [],
  h264DecoderNeedsKeyFrame: true,
  h264SkippedDeltaFrames: 0,
  h264DecodedFrames: 0,
  h264FallbackActive: false,
  h264FallbackReason: "",
  audioFrames: 0,
  audioLevel: 0,
  audioContext: null,
  audioGain: null,
  audioNextPlayTime: 0,
  audioPlayedFrames: 0,
  audioDroppedFrames: 0,
  audioLastError: "",
  recentConnections: [],
  localHostRunning: false,
  localHostOnline: false,
  localHostBusy: false,
  localHostPollTimer: null,
  localMacAlertWatcherRunning: false,
  localMacAlertWatcherBusy: false,
  localMacAlertWatcherStatusCheckedAt: 0,
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
  fileTransferSequence: 0,
  fileTransferActive: false,
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
    h264FallbackReason: "",
    streamFallbackReason: "",
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
  const detail = formatInputStatusDetail();
  return `${state.inputEvents}${detail ? `（${detail}）` : ""}`;
}

function updateInputStatus() {
  if (state.connected && state.controlDirection === "mac_to_windows") {
    elements.inputText.textContent = "输入事件：暂停（当前由 Mac 控制）";
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
  return state.connected && state.controlDirection === "windows_to_mac";
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
    h264FallbackReason: "",
    streamFallbackReason: "",
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

function formatVideoDecoderDiagnostics(diagnostics) {
  const status = diagnostics.videoDecoderStatus
    ? labelFromMap(diagnostics.videoDecoderStatus, videoDecoderStatusLabels)
    : "";
  const codec = diagnostics.videoDecoderCodec || "";
  const decodedFrames = Number(diagnostics.h264DecodedFrames);
  const errors = Number(diagnostics.videoDecoderErrors);
  const queue = Number(diagnostics.videoDecoderQueue);
  const latency = Number(diagnostics.h264DecoderLatencyMs);
  const parts = [status, codec].filter(Boolean);

  if (Number.isFinite(decodedFrames) && decodedFrames > 0) {
    parts.push(`已绘制 ${decodedFrames}`);
  }
  if (Number.isFinite(queue) && queue > 0) {
    parts.push(`队列 ${queue}`);
  }
  if (Number.isFinite(latency) && latency > 0) {
    parts.push(`解码 ${Math.round(latency)}ms`);
  }
  if (Number.isFinite(errors) && errors > 0) {
    parts.push(`错误 ${errors}`);
  }
  if (diagnostics.h264FallbackReason) {
    parts.push(`回退：${diagnostics.h264FallbackReason}`);
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
  if (getVideoRateWarning()) {
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
    if (frameAgeText) {
      frameParts.push(diagnostics.videoFrameClockSkewed ? frameAgeText : `到达 ${frameAgeText}`);
    }
    if (qualityText) {
      frameParts.push(qualityText);
    }
    parts.push(`视频：${frameParts.join(" / ")}`);
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
  state.hostDiagnostics = {
    ...state.hostDiagnostics,
    ...nextDiagnostics,
  };
  elements.hostDiagnosticsText.textContent = renderHostDiagnosticsText();
  setHostDiagnosticsLevel(getHostDiagnosticsLevel());
  updateInputStatus();
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
  updateHostDiagnostics({ runtime: normalizeHostRuntime(device.runtime) });
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
    updateHostDiagnostics({ runtime: normalizeHostRuntime(device.runtime) });
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
    detail.textContent = [
      `${device.host}:${device.port}`,
      getPlatformLabel(device.platform),
      getRoleLabel(device.role),
      statusText,
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
    runtime: runtime ?? null,
  });
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
    elements.audioText.textContent = `声音：已协商 · ${answer.audioCodec ?? "opus"}`;
  } else if (elements.audioToggle.checked) {
    elements.audioText.textContent = "声音：对端暂未开启音频流";
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

function updateReconnectControls(visible = Boolean(state.reconnectTimer)) {
  const isVisible = Boolean(visible);
  if (elements.reconnectNowButton) {
    elements.reconnectNowButton.hidden = !isVisible;
    elements.reconnectNowButton.disabled = !isVisible || state.connecting;
  }
  if (elements.floatingReconnectButton) {
    elements.floatingReconnectButton.hidden = !isVisible;
    elements.floatingReconnectButton.disabled = !isVisible || state.connecting;
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
  state.audioLevel = 0;
  resetAudioPlayback();
  elements.audioText.textContent = "声音：待机";
  elements.connectButton.disabled = false;
  elements.disconnectButton.disabled = true;
  elements.reverseButton.disabled = true;
  state.fileTransferActive = false;
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
    setUiDisconnected("连接失败", `自动重连 ${maxReconnectAttempts} 次仍未恢复：${reason}`);
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
  return parts.join(" / ");
}

function getVideoRateWarning() {
  const actual = Number(state.actualVideoFps) || 0;
  const requested = state.requestedFps || Number(elements.fpsSelect.value) || 0;
  if (!state.connected || !actual || !requested) return "";
  if (actual < requested * 0.85 && requested - actual >= 5) {
    return `低于请求 ${requested} Hz`;
  }
  const negotiated = state.negotiatedFps || requested;
  if (negotiated && actual < negotiated * 0.85 && negotiated - actual >= 5) {
    return `低于协商 ${negotiated} Hz`;
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
    return "剪贴板：正在发送文件";
  }

  const writeStatus = state.receivedClipboardWriteStatus || {};
  if (writeStatus.text) {
    return `剪贴板：${compactFloatingStatusText(writeStatus.text)}`;
  }

  if (state.receivedClipboardFiles.length > 0) {
    return `剪贴板：已收 ${state.receivedClipboardFiles.length} 个远端文件`;
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
  if (state.fullscreen && elements.fullscreenHint?.classList.contains("is-visible")) {
    updateFullscreenHintText();
  }
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
      elements.floatingControlSummary.textContent = `${codecText} · ${fpsText} · ${bandwidthText}`;
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
  state.videoFrameTimes = [];
  state.actualVideoFps = 0;
  state.lastVideoFrameAgeMs = null;
  state.lastVideoFrameTimestamp = "";
  state.videoFrameClockSkewed = false;
  state.requestedFps = 0;
  state.negotiatedFps = 0;
  elements.metricLatency.textContent = "-- ms";
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
  state.h264DecoderErrorCount = 0;
  state.h264DecoderWarned = false;
  state.h264DecoderQueue = [];
  state.h264DecoderNeedsKeyFrame = true;
  state.h264SkippedDeltaFrames = 0;
  state.h264DecodedFrames = 0;
  if (resetFallback) {
    state.h264FallbackActive = false;
    state.h264FallbackReason = "";
  }
}

function recordVideoFrameTime() {
  const now = performance.now();
  state.videoFrameTimes.push(now);
  const cutoff = now - 2000;
  while (state.videoFrameTimes.length > 0 && state.videoFrameTimes[0] < cutoff) {
    state.videoFrameTimes.shift();
  }

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

function updateFpsMetric() {
  const requested = state.requestedFps || Number(elements.fpsSelect.value) || 0;
  const negotiated = state.negotiatedFps || requested;
  const actual = state.actualVideoFps;
  const actualText = actual > 0 ? `${actual.toFixed(1)} FPS` : "-- FPS";
  const parts = [`实收 ${actualText}`, `协商 ${negotiated || "--"} Hz`];
  if (requested && negotiated && requested !== negotiated) {
    parts.push(`请求 ${requested} Hz`);
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
  if (state.audioContext) {
    state.audioContext.close().catch(() => {});
  }
  state.audioContext = null;
  state.audioGain = null;
  state.audioNextPlayTime = 0;
  state.audioPlayedFrames = 0;
  state.audioDroppedFrames = 0;
  state.audioLastError = "";
  syncFloatingControlStatus();
}

function primeAudioPlayback() {
  if (!elements.audioToggle.checked || Number(elements.audioVolumeRange.value) <= 0) {
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
    state.audioNextPlayTime = state.audioContext.currentTime + 0.04;
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

async function playPcmAudioFrame(frame) {
  if (!elements.audioToggle.checked || Number(elements.audioVolumeRange.value) <= 0) {
    return false;
  }

  const decoded = decodePcmAudioFrame(frame);
  if (!decoded) {
    return false;
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

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(state.audioGain);
  const now = audioContext.currentTime;
  const queuedSeconds = Math.max(0, state.audioNextPlayTime - now);
  if (queuedSeconds > 0.35) {
    state.audioDroppedFrames += 1;
    state.audioNextPlayTime = now + 0.04;
  }
  const playAt = Math.max(audioContext.currentTime + 0.015, state.audioNextPlayTime);
  source.start(playAt);
  source.onended = () => source.disconnect();
  state.audioNextPlayTime = playAt + buffer.duration;
  state.audioPlayedFrames += 1;
  return true;
}

function renderAudioStatusFromFrame(frame) {
  const volume = Number(elements.audioVolumeRange.value);
  const levelText = `${Math.round(state.audioLevel * 100)}%`;
  const latencyText = frame.latencyMs ? ` · ${Math.round(frame.latencyMs)} ms` : "";
  const playbackText = state.audioPlayedFrames > 0
    ? ` · 播放 ${state.audioPlayedFrames}`
    : getAudioPayload(frame)
      ? " · 等待播放"
      : "";
  const droppedText = state.audioDroppedFrames > 0 ? ` · 丢 ${state.audioDroppedFrames}` : "";
  elements.audioText.textContent = `声音：接收中 · ${levelText} · ${volume}%${latencyText}${playbackText}${droppedText}`;
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
  state.audioLevel = Math.max(0, Math.min(1, Number(frame.level ?? frame.peak ?? 0)));
  renderAudioStatusFromFrame(frame);
}

function handleAudioFrame(frame) {
  updateAudioStatusFromFrame(frame);
  if (!getAudioPayload(frame)) {
    return;
  }

  void playPcmAudioFrame(frame)
    .then((played) => {
      if (played) {
        renderAudioStatusFromFrame(frame);
      }
    })
    .catch((error) => {
      state.audioLastError = error?.message || String(error);
      elements.audioText.textContent = `声音：播放失败 · ${state.audioLastError}`;
      syncFloatingControlStatus();
      addLog("声音播放失败", state.audioLastError);
    });
}

function updateFileClipboardButton() {
  elements.fileClipboardButton.disabled =
    !state.connected ||
    !state.client ||
    !elements.clipboardToggle.checked ||
    state.fileTransferActive;
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
  if (state.reconnectTimer && state.reconnectDueAt) {
    const remainingSeconds = Math.max(0, Math.ceil((state.reconnectDueAt - now) / 1000));
    return {
      status: `等待自动重连（${attemptText}，${remainingSeconds} 秒后）`,
      reason,
      next: `${new Date(state.reconnectDueAt).toISOString()}（约 ${remainingSeconds} 秒后）`,
    };
  }
  if (state.connectionState === "reconnecting" && state.connecting) {
    return {
      status: `正在自动重连（${attemptText}）`,
      reason,
      next: "-",
    };
  }
  if (state.reconnectAttempts > 0) {
    return {
      status: `未等待（已尝试 ${attemptText}）`,
      reason,
      next: "-",
    };
  }
  return {
    status: "未等待",
    reason: "-",
    next: "-",
  };
}

function formatMacAlertWatcherCheckedAt(checkedAt, now = Date.now()) {
  if (!checkedAt) return "未检查";
  const elapsedSeconds = Math.max(0, Math.round((now - checkedAt) / 1000));
  return `${new Date(checkedAt).toISOString()}（约 ${elapsedSeconds} 秒前）`;
}

function getMacAlertWatcherExportStatus(now = Date.now()) {
  const available = canUseDesktopHostControl();
  const statusDetail = elements.localMacAlertWatcherStatusText.textContent.trim() || "-";
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
    detail: statusDetail,
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
  parts.push("自启/睡眠状态等待 Mac 上报");

  return {
    status: compactExportStatusText(parts.join(" · "), 220),
    note: "当前仅由 Windows 侧连接、发现、重连和提醒 watcher 推断；LaunchAgent、自启动、锁屏/睡眠可达性需等 Mac status/readiness 上报。",
  };
}

function getSelectExportLabel(selectElement) {
  return selectElement?.selectedOptions?.[0]?.textContent?.trim() || selectElement?.value || "-";
}

function sanitizeExportStatusLine(line) {
  return String(line || "")
    .replace(/\b(LAN_DUAL_PASSWORD)\s*=\s*\S+/gi, "$1=<hidden>")
    .replace(/\b(password|passwd|pwd|token|secret)\s*[:=]\s*\S+/gi, "$1=<hidden>")
    .replace(/(--(?:password|token|secret))\s+\S+/gi, "$1 <hidden>")
    .slice(0, 220);
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

function getFloatingControlExportStatus() {
  return {
    mode: state.immersiveFullscreen ? "真全屏" : state.fullscreen ? "普通全屏" : "窗口",
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
  clipboardExport,
  videoExport,
  audioExport,
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
  return [
    `- 远端连接：${currentStateLabel} · ${connectionLabel} · ${targetLabel}`,
    `- Mac 主机：${hostDiagnosticsExport}`,
    `- Mac 值守：${macReachabilityExport.status}`,
    `- 重连：${reconnectParts.join(" · ")}`,
    `- 远端文件：${remoteFileExport.summary}`,
    `- 剪贴板：${clipboardExport}`,
    `- 视频：${videoExport}`,
    `- 声音：${audioExport.summary}`,
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
  const clipboardExport = getClipboardExportStatus();
  const videoExport = getVideoExportStatus();
  const audioExport = getAudioExportStatus();
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
      clipboardExport,
      videoExport,
      audioExport,
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
    `- 协议版本：${protocolVersion}`,
    `- 主机诊断：${hostDiagnosticsExport}`,
    "",
    "本机协作",
    `- Mac 提醒：${macAlertWatcherExport.status}`,
    `- Mac 提醒详情：${macAlertWatcherExport.detail}`,
    `- Mac 提醒最近检查：${macAlertWatcherExport.checkedAt}`,
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
    `- 声音：${settings.audio ? `开启 · ${settings.audioVolume}%` : "关闭"}`,
    `- 声音状态：${audioExport.summary}`,
    `- 声音电平：${audioExport.level}`,
    `- 声音错误：${audioExport.error}`,
    `- 剪贴板：${settings.clipboard ? "开启" : "关闭"}`,
    `- 剪贴板状态：${clipboardExport}`,
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
  if (discoveredDevice?.runtime) {
    updateHostDiagnostics({ runtime: discoveredDevice.runtime });
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
  if (!state.connected || !state.client) {
    return;
  }

  state.client.sendDisplaySettings(buildDisplaySettingsMessage());
  state.client.sendAudioSettings(buildAudioSettingsMessage());
  addLog("更新显示设置", describeDisplaySettings());
}

function setFullscreen(enabled) {
  if (!enabled && state.immersiveFullscreen) {
    void exitDocumentFullscreen();
    state.immersiveFullscreen = false;
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

async function readLocalClipboardFiles() {
  if (!navigator.clipboard?.read || typeof File === "undefined") {
    return {
      files: [],
      reason: "文件剪贴板自动同步需要桌面原生模块，当前可先用“发送文件”按钮。",
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
  if (!state.connected || !elements.clipboardToggle.checked) {
    return;
  }

  const clipboardFiles = await readLocalClipboardFiles();
  if (clipboardFiles.files.length > 0) {
    await sendFilesToRemote(clipboardFiles.files, { sourceLabel: "文件剪贴板" });
    return;
  }

  const sentText = await syncClipboardText({ quietNoText: true });
  if (!sentText && clipboardFiles.reason) {
    addLog("文件剪贴板", clipboardFiles.reason);
  }
}

async function sendFilesToRemote(files, { sourceLabel = "文件剪贴板", clearFileInput = false } = {}) {
  if (!state.connected || !state.client) {
    elements.clipboardText.textContent = "剪贴板：请先连接被控端";
    syncFloatingControlStatus();
    addLog(sourceLabel, "未连接，无法发送文件");
    return;
  }

  if (!elements.clipboardToggle.checked) {
    elements.clipboardText.textContent = "剪贴板：已关闭";
    syncFloatingControlStatus();
    addLog(sourceLabel, "剪贴板同步已关闭");
    return;
  }

  if (files.length === 0) {
    return;
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > maxClipboardFileBytes) {
    const message = `文件总大小 ${formatBytes(totalBytes)}，超过当前上限 ${formatBytes(maxClipboardFileBytes)}`;
    elements.clipboardText.textContent = "剪贴板：文件过大";
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
  state.fileTransferActive = true;
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

    for (const [fileIndex, file] of files.entries()) {
      let chunkIndex = 0;
      for (let offset = 0; offset < file.size; offset += fileChunkSizeBytes) {
        const chunk = file.slice(offset, Math.min(offset + fileChunkSizeBytes, file.size));
        const dataBase64 = arrayBufferToBase64(await chunk.arrayBuffer());
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
        sentBytes = nextSentBytes;
        chunkIndex += 1;
        const percent = totalBytes === 0 ? 100 : Math.round((sentBytes / totalBytes) * 100);
        elements.clipboardText.textContent = `剪贴板：文件发送 ${percent}%`;
        syncFloatingControlStatus();
        if (chunkIndex % 8 === 0) {
          await yieldToUi();
        }
      }
    }

    state.client.sendClipboardFileComplete({
      transferId,
      totalBytes,
      fileCount: files.length,
    });
    elements.clipboardText.textContent = `剪贴板：文件已发送 ${formatBytes(sentBytes)}`;
    syncFloatingControlStatus();
    addLog(sourceLabel, `文件块发送完成，等待对端确认 · ${transferId}`);
  } catch (error) {
    const message = error?.message || "文件发送失败";
    elements.clipboardText.textContent = "剪贴板：文件发送失败";
    syncFloatingControlStatus();
    addLog(`${sourceLabel}失败`, message);
  } finally {
    state.fileTransferActive = false;
    if (clearFileInput) elements.fileClipboardInput.value = "";
    updateFileClipboardButton();
    syncFloatingControlStatus();
  }
}

async function sendClipboardFiles() {
  const files = Array.from(elements.fileClipboardInput.files ?? []);
  await sendFilesToRemote(files, { sourceLabel: "文件剪贴板", clearFileInput: true });
}

function getTauriInvoke() {
  return window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || null;
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
  return {
    running,
    badgeMode: running ? "online" : "offline",
    badgeText: running ? "提醒中" : "未开启",
    statusText: running
      ? `Windows 浮窗提醒已开启${processText}${serverText}。`
      : "Windows 浮窗提醒未开启；可一键启动后接收 Mac 授权、权限和反控等待消息。",
    toggleText: running ? "停止提醒" : "开启提醒",
    toggleIcon: running ? "■" : "◌",
  };
}

function applyMacAlertWatcherResult(result) {
  const payload = normalizeMacAlertWatcherPayload(result);
  const view = macAlertWatcherUiState(payload);
  state.localMacAlertWatcherStatusCheckedAt = Date.now();
  state.localMacAlertWatcherRunning = view.running;
  setLocalMacAlertWatcherBadge(view.badgeMode, view.badgeText);
  elements.localMacAlertWatcherStatusText.textContent = view.statusText;
  elements.localMacAlertWatcherToggleButton.lastChild.textContent = ` ${view.toggleText}`;
  elements.localMacAlertWatcherToggleButton.querySelector("span").textContent = view.toggleIcon;
  updateLocalMacAlertWatcherControls();
}

function applyMacAlertWatcherError(error) {
  state.localMacAlertWatcherStatusCheckedAt = Date.now();
  state.localMacAlertWatcherRunning = false;
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
    return `正在接收 ${countText}：${formatBytes(receivedBytes)}/${formatBytes(totalBytes)}，${percent}%。完成后会写入系统文件剪贴板或留在托盘。`;
  }
  return `正在接收 ${countText}：${formatBytes(receivedBytes)}。完成后会写入系统文件剪贴板或留在托盘。`;
}

function touchRemoteFileTransfer(transfer, now = Date.now()) {
  if (!transfer) return;
  transfer.startedAt = Number(transfer.startedAt) || now;
  transfer.lastActivityAt = now;
}

function remoteFileTransferProgressText(transfer = {}) {
  const receivedBytes = Math.max(0, Number(transfer.receivedBytes) || 0);
  const totalBytes = Math.max(0, Number(transfer.totalBytes) || 0);
  if (totalBytes > 0) {
    return `${formatBytes(receivedBytes)}/${formatBytes(totalBytes)}`;
  }
  return formatBytes(receivedBytes);
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
  touchRemoteFileTransfer(transfer);

  try {
    const fileIndex = Math.max(0, Number(message.fileIndex) || 0);
    let file = transfer.files.find((item) => item.index === fileIndex);
    if (!file) {
      file = {
        index: fileIndex,
        name: normalizeRemoteFileName(message.fileName, fileIndex),
        size: 0,
        mimeType: "application/octet-stream",
        lastModified: Date.now(),
        chunks: [],
        receivedBytes: 0,
      };
      transfer.files.push(file);
    }

    const bytes = base64ToUint8Array(message.dataBase64);
    const offset = Math.max(0, Number(message.offset) || file.receivedBytes);
    file.chunks.push({ offset, bytes });
    file.receivedBytes += bytes.byteLength;
    transfer.receivedBytes += bytes.byteLength;

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
    files.length >= expectedFileCount &&
    receivedBytes >= totalBytes &&
    transfer.files.every((file) => !file.size || file.receivedBytes >= file.size);

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

function handleClipboardFileResponse(message) {
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
  const percent = Math.round((Number(message.receivedBytes || 0) / Number(message.totalBytes)) * 100);
  elements.clipboardText.textContent = `剪贴板：对端接收 ${percent}%`;
  syncFloatingControlStatus();
}

function handleClipboardFileResult(message) {
  elements.clipboardText.textContent = message.accepted
    ? "剪贴板：对端已完成文件接收"
    : "剪贴板：对端文件接收失败";
  syncFloatingControlStatus();
  addLog("文件剪贴板", message.reason || (message.accepted ? "对端已完成文件接收" : "对端文件接收失败"));
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
      runtime: normalizeHostRuntime(message.runtime) ?? state.hostDiagnostics.runtime,
    });
    if (message.streamFallbackReason) {
      addLog("视频回退", message.streamFallbackReason);
    }
    addLog("被控端确认", "显示设置已接收");
    return;
  }

  if (message.type === "audio_settings_ack") {
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
  recordVideoFrameTime();
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
    streamFallbackReason: Object.prototype.hasOwnProperty.call(frame, "streamFallbackReason")
      ? (frame.streamFallbackReason ?? "")
      : frameCodec === "h264"
        ? ""
        : state.hostDiagnostics.streamFallbackReason,
  };
  updateHostDiagnostics(frameDiagnostics);

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
  updateHostDiagnostics({
    videoDecoderStatus: state.h264DecoderStatus,
    videoDecoderCodec: state.h264DecoderCodec,
    videoDecoderErrors: state.h264DecoderErrorCount,
    videoDecoderQueue: state.h264DecoderQueue.length,
    h264DecodedFrames: state.h264DecodedFrames,
    h264DecoderLatencyMs: state.h264DecoderLatencyMs,
    h264FallbackReason: state.h264FallbackReason,
    ...extra,
  });
}

function requestJpegVideoFallback(reason) {
  if (state.h264FallbackActive) {
    return;
  }

  const errorCount = state.h264DecoderErrorCount;
  const lastError = state.h264DecoderLastError;
  state.h264FallbackActive = true;
  state.h264FallbackReason = reason || "H.264 解码失败";
  state.h264DecoderStatus = "fallback";
  resetVideoDecoder();
  state.h264DecoderStatus = "fallback";
  state.h264DecoderErrorCount = errorCount;
  state.h264DecoderLastError = lastError;
  updateH264DecoderDiagnostics();
  addLog("视频回退", `${state.h264FallbackReason}，已请求 JPEG 兜底`);

  if (state.connected && state.client) {
    state.client.sendDisplaySettings(buildDisplaySettingsMessage());
  }
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

function getLengthPrefixedNalTypes(bytes, lengthSize = 4) {
  const nalTypes = [];
  let index = 0;
  while (index + lengthSize <= bytes.length) {
    let nalLength = 0;
    for (let offset = 0; offset < lengthSize; offset += 1) {
      nalLength = (nalLength << 8) | bytes[index + offset];
    }
    index += lengthSize;
    if (nalLength <= 0 || index + nalLength > bytes.length) {
      break;
    }
    nalTypes.push(bytes[index] & 0x1f);
    index += nalLength;
  }
  return nalTypes;
}

function isH264KeyFramePayload(bytes, encoding) {
  const normalizedEncoding = String(encoding ?? "").toLowerCase();
  const nalTypes = normalizedEncoding.includes("annexb")
    ? getAnnexBNalTypes(bytes)
    : getLengthPrefixedNalTypes(bytes);
  return nalTypes.includes(5) || nalTypes.includes(7) || nalTypes.includes(8);
}

async function renderH264VideoFrame(frame) {
  if (!frame.payload) {
    addLog("视频帧", "收到 H.264 视频帧但缺少 payload");
    return;
  }

  state.videoFrames += 1;
  recordVideoFrameTime();
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
    const decoder = await ensureH264Decoder(frame);
    const payloadBytes = base64ToUint8Array(frame.payload);
    const isKeyFrame = Boolean(frame.keyFrame) || isH264KeyFramePayload(payloadBytes, frame.encoding);
    if (state.h264DecoderNeedsKeyFrame && !isKeyFrame) {
      state.h264SkippedDeltaFrames += 1;
      state.h264DecoderStatus = "waiting-keyframe";
      updateH264DecoderDiagnostics();
      elements.remoteStatusText.textContent = `等待 H.264 关键帧，已跳过 delta #${frame.frameId ?? state.videoFrames}`;
      if (state.h264SkippedDeltaFrames % 30 === 0) {
        addLog("H.264 等待关键帧", `跳过 delta 帧 #${frame.frameId ?? state.videoFrames}`);
      }
      return;
    }
    if (isKeyFrame) {
      state.h264DecoderNeedsKeyFrame = false;
    }
    const durationUs = Number(frame.durationUs) || Math.round(1_000_000 / Math.max(1, state.negotiatedFps || 30));
    const timestampUs =
      Number(frame.timestampUs) ||
      Math.max(0, Number(frame.frameId ?? state.videoFrames) - 1) * durationUs;
    state.h264DecoderStatus = "decoding";
    state.h264DecoderQueue.push({
      frameId: frame.frameId ?? state.videoFrames,
      queuedAt: performance.now(),
      timestampUs,
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

async function ensureH264Decoder(frame) {
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
  resetVideoDecoder();
  state.h264DecoderErrorCount = previousErrorCount;
  state.h264DecoderWarned = previousWarned;
  state.h264DecoderLastError = previousLastError;
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

elements.fullscreenButton.addEventListener("click", () => setFullscreen(true));
elements.windowModeButton.addEventListener("click", () => setFullscreen(false));
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
  if (elements.fileClipboardButton.disabled) return;
  elements.fileClipboardInput.click();
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
document.addEventListener("MSFullscreenChange", handleNativeFullscreenChange);

tickClock();
setInterval(tickClock, 1000);
setInterval(expireStaleRemoteFileTransfers, remoteFileTransferSweepIntervalMs);
applyPreferences();
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
