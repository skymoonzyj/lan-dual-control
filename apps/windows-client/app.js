const { LocalMockTransport, ProtocolClient, WebSocketTransport, protocolVersion } =
  window.LanDualProtocol;
const { computeDisplayedFrameRect, mapClientPointToRemote } = window.LanDualMapping;

const elements = {
  transportSelect: document.querySelector("#transportSelect"),
  hostInput: document.querySelector("#hostInput"),
  portInput: document.querySelector("#portInput"),
  passwordInput: document.querySelector("#passwordInput"),
  mockScenarioSelect: document.querySelector("#mockScenarioSelect"),
  connectButton: document.querySelector("#connectButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  refreshDevicesButton: document.querySelector("#refreshDevicesButton"),
  deviceList: document.querySelector("#deviceList"),
  exportLogButton: document.querySelector("#exportLogButton"),
  clearLogButton: document.querySelector("#clearLogButton"),
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
  downloadAllReceivedFilesButton: document.querySelector("#downloadAllReceivedFilesButton"),
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
const defaultControlPort = "43770";
const fileChunkSizeBytes = 64 * 1024;
const maxClipboardFileBytes = 512 * 1024 * 1024;
const maxNativeClipboardFileBytes = 128 * 1024 * 1024;
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
    label: "均衡",
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
};
const defaultKeyboardMapping = {
  win: "meta",
  alt: "alt",
  ctrl: "ctrl",
};
const remoteModifierLabels = {
  meta: "⌘ Command",
  alt: "⌥ Option",
  ctrl: "^ Control",
  shift: "⇧ Shift",
  none: "不映射",
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
const windowsShortcutMap = {
  a: { key: "a", code: "KeyA", action: "select_all", label: "全选" },
  c: { key: "c", code: "KeyC", action: "copy", label: "复制" },
  f: { key: "f", code: "KeyF", action: "find", label: "查找" },
  n: { key: "n", code: "KeyN", action: "new", label: "新建" },
  o: { key: "o", code: "KeyO", action: "open", label: "打开" },
  p: { key: "p", code: "KeyP", action: "print", label: "打印" },
  r: { key: "r", code: "KeyR", action: "reload", label: "刷新" },
  s: { key: "s", code: "KeyS", action: "save", label: "保存" },
  t: { key: "t", code: "KeyT", action: "new_tab", label: "新建标签" },
  v: { key: "v", code: "KeyV", action: "paste", label: "粘贴" },
  w: { key: "w", code: "KeyW", action: "close", label: "关闭" },
  x: { key: "x", code: "KeyX", action: "cut", label: "剪切" },
  y: { key: "z", code: "KeyZ", action: "redo", label: "重做", forceShift: true },
  z: { key: "z", code: "KeyZ", action: "undo", label: "撤销" },
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
  latencyTimer: null,
  client: null,
  activeHost: "",
  activePort: "",
  videoFrames: 0,
  videoFrameTimes: [],
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
  reconnectStableTimer: null,
  clipboardSequence: 0,
  fileTransferSequence: 0,
  fileTransferActive: false,
  remoteFileTransfers: new Map(),
  receivedClipboardFiles: [],
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
    qualityPreset: "",
    jpegQuality: null,
    videoDecoderStatus: "",
    videoDecoderCodec: "",
    videoDecoderErrors: 0,
    videoDecoderQueue: 0,
    h264DecodedFrames: 0,
    h264DecoderLatencyMs: 0,
    h264FallbackReason: "",
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

function updateInputStatus() {
  if (state.connected && state.controlDirection === "mac_to_windows") {
    elements.inputText.textContent = "输入事件：暂停（当前由 Mac 控制）";
    return;
  }

  if (state.hostDiagnostics.inputAckStatus === "rejected") {
    elements.inputText.textContent = `输入事件：${state.inputEvents}（被拒绝）`;
    return;
  }

  elements.inputText.textContent = `输入事件：${state.inputEvents}`;
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

function getErrorMessage(error) {
  const code = error?.code;
  if (code && errorMessages[code]) {
    return errorMessages[code];
  }
  return error?.message || "发生未知错误。";
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
    qualityPreset: "",
    jpegQuality: null,
    videoDecoderStatus: "",
    videoDecoderCodec: "",
    videoDecoderErrors: 0,
    videoDecoderQueue: 0,
    h264DecodedFrames: 0,
    h264DecoderLatencyMs: 0,
    h264FallbackReason: "",
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
  if (Number(diagnostics.videoDecoderErrors) > 0) {
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
  const droppedFrames = Number(diagnostics.droppedFrames);
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
  if (videoParts.length > 0) {
    const frameParts = [...videoParts];
    if (Number.isFinite(droppedFrames)) {
      frameParts.push(`丢帧 ${droppedFrames}`);
    }
    if (qualityText) {
      frameParts.push(qualityText);
    }
    parts.push(`视频：${frameParts.join(" / ")}`);
  }
  if (decoderText) {
    parts.push(`解码：${decoderText}`);
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
}

function resetHostDiagnostics(text = defaultHostDiagnosticsText) {
  state.hostDiagnostics = getEmptyHostDiagnostics();
  elements.hostDiagnosticsText.textContent = text;
  setHostDiagnosticsLevel("idle");
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
  applyKeyboardMapping(preferences.keyboardMapping ?? defaultKeyboardMapping);

  state.recentConnections = Array.isArray(preferences.recentConnections)
    ? preferences.recentConnections.slice(0, 5)
    : [];
  renderDisplayOptions(fallbackDisplays, state.activeDisplayId);
  renderRecentConnections();
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
}

function updateDisplaysFromSession(answer = {}) {
  renderDisplayOptions(answer.displays, answer.activeDisplayId || answer.displayId || state.activeDisplayId);
}

function normalizeKeyMapValue(value, fallback) {
  return Object.prototype.hasOwnProperty.call(remoteModifierLabels, value) ? value : fallback;
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

function addMappedModifier(modifiers, modifier) {
  if (modifier && modifier !== "none") {
    modifiers.add(modifier);
  }
}

function mapKeyboardModifiers(event) {
  const mapping = getKeyboardMapping();
  const shortcut = getMacShortcutOverride(event);
  if (shortcut) {
    const modifiers = shortcut.modifiers;
    return {
      mapping,
      modifiers,
      key: shortcut.key,
      code: shortcut.code,
      ctrlKey: false,
      altKey: false,
      shiftKey: modifiers.includes("shift"),
      metaKey: true,
      shortcutProfile: "windows_to_macos",
      shortcutAction: shortcut.action,
      shortcutLabel: shortcut.label,
    };
  }

  const remoteModifiers = new Set();
  if (event.shiftKey) {
    remoteModifiers.add("shift");
  }
  if (event.metaKey) {
    addMappedModifier(remoteModifiers, mapping.win);
  }
  if (event.altKey) {
    addMappedModifier(remoteModifiers, mapping.alt);
  }
  if (event.ctrlKey) {
    addMappedModifier(remoteModifiers, mapping.ctrl);
  }

  const modifiers = [...remoteModifiers];
  return {
    mapping,
    modifiers,
    ctrlKey: modifiers.includes("ctrl"),
    altKey: modifiers.includes("alt"),
    shiftKey: modifiers.includes("shift"),
    metaKey: modifiers.includes("meta"),
  };
}

function getMacShortcutOverride(event) {
  if (!elements.shortcutCompatToggle.checked || !event.ctrlKey || event.altKey || event.metaKey) {
    return null;
  }

  const key = String(event.key ?? "").toLowerCase();
  const shortcut = windowsShortcutMap[key];
  if (!shortcut) {
    return null;
  }

  const modifiers = new Set(["meta"]);
  if (event.shiftKey || shortcut.forceShift) {
    modifiers.add("shift");
  }

  const action = key === "z" && event.shiftKey ? "redo" : shortcut.action;
  const label = key === "z" && event.shiftKey ? "重做" : shortcut.label;
  return {
    ...shortcut,
    action,
    label,
    modifiers: [...modifiers],
  };
}

function describeKeyboardInput(event, mapped) {
  const prefix = mapped.modifiers
    .map((modifier) => remoteModifierLabels[modifier] ?? modifier)
    .join("+");
  const key = mapped.key ?? event.key;
  const label = mapped.shortcutLabel ? ` · ${mapped.shortcutLabel}` : "";
  return `${prefix ? `${prefix}+` : ""}${key}${label}`;
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

function selectDevice(device, button) {
  document.querySelectorAll(".device-row, .history-row").forEach((item) =>
    item.classList.remove("active"),
  );
  button.classList.add("active");
  elements.hostInput.value = device.host;
  elements.portInput.value = device.port;
  elements.transportSelect.value = device.transport ?? "websocket";
  savePreferences();
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
    detail.textContent = `${device.host}:${device.port} · ${getPlatformLabel(device.platform)} · ${getRoleLabel(device.role)} · ${statusText}`;
    textWrap.append(title, detail);
    button.append(dot, textWrap);
    button.addEventListener("click", () => selectDevice(device, button));
    elements.deviceList.append(button);
  });
}

async function refreshDevices() {
  elements.refreshDevicesButton.disabled = true;
  addLog("刷新设备", "正在探测本机、当前地址和连接历史");

  const discovered = (await Promise.all(getDiscoveryCandidates().map(probeDiscoveryCandidate))).filter(
    Boolean,
  );
  state.discoveredDevices = buildDeviceList(discovered);
  renderDiscoveredDevices();

  const onlineCount = state.discoveredDevices.filter((device) => device.status === "online").length;
  addLog(
    "刷新设备",
    onlineCount > 0 ? `发现 ${onlineCount} 台在线设备` : "暂未发现在线设备，保留手动和模拟入口",
  );
  elements.refreshDevicesButton.disabled = false;
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
  state.remoteFileTransfers.clear();
  elements.remoteCanvas.classList.remove("has-video-frame");
  resetReverseControlState();
  setConnectionState("connecting", `正在连接 ${host}:${port}`);
  resetHostDiagnostics(`诊断：正在连接 ${host}:${port}`);
  elements.connectButton.disabled = true;
  elements.disconnectButton.disabled = false;
  elements.reverseButton.disabled = true;
  updateFileClipboardButton();
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
  });
  elements.remoteCanvas.focus();
  startLatencyLoop();

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
}

function clearReconnectTimers() {
  if (state.reconnectTimer) {
    window.clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  if (state.reconnectStableTimer) {
    window.clearTimeout(state.reconnectStableTimer);
    state.reconnectStableTimer = null;
  }
}

function setUiDisconnected(statusText = "未连接", logDetail = "会话已关闭") {
  state.connected = false;
  state.connecting = false;
  resetReverseControlState();
  stopLatencyLoop();
  setConnectionState(statusText === "连接失败" ? "failed" : "disconnected", statusText);
  elements.remoteFrameImage.removeAttribute("src");
  elements.remoteFrameImage.classList.remove("is-visible");
  elements.remoteVideoCanvas.classList.remove("is-visible");
  elements.remoteCanvas.classList.remove("has-video-frame");
  resetVideoFrameStats();
  resetVideoDecoder({ resetFallback: true });
  elements.metricLatency.textContent = "-- ms";
  resetHostDiagnostics(statusText === "未连接" ? defaultHostDiagnosticsText : `诊断：${statusText}`);
  state.audioFrames = 0;
  state.audioLevel = 0;
  resetAudioPlayback();
  elements.audioText.textContent = "声音：待机";
  elements.connectButton.disabled = false;
  elements.disconnectButton.disabled = true;
  elements.reverseButton.disabled = true;
  state.fileTransferActive = false;
  state.remoteFileTransfers.clear();
  updateFileClipboardButton();
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
  stopLatencyLoop();
  elements.remoteFrameImage.removeAttribute("src");
  elements.remoteFrameImage.classList.remove("is-visible");
  elements.remoteVideoCanvas.classList.remove("is-visible");
  elements.remoteCanvas.classList.remove("has-video-frame");
  resetVideoFrameStats();
  resetVideoDecoder({ resetFallback: true });
  elements.metricLatency.textContent = "-- ms";
  resetHostDiagnostics("诊断：连接中断，等待重连。");
  state.audioFrames = 0;
  state.audioLevel = 0;
  resetAudioPlayback();
  elements.audioText.textContent = "声音：待机";

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
  setConnectionState(
    "reconnecting",
    `连接中断，${Math.round(delayMs / 1000)} 秒后自动重连（${state.reconnectAttempts}/${maxReconnectAttempts}）`,
  );
  resetHostDiagnostics(`诊断：等待第 ${state.reconnectAttempts}/${maxReconnectAttempts} 次自动重连。`);
  elements.connectButton.disabled = true;
  elements.disconnectButton.disabled = false;
  elements.reverseButton.disabled = true;
  updateFileClipboardButton();
  addLog("自动重连", `${reason} · 第 ${state.reconnectAttempts}/${maxReconnectAttempts} 次`);
  updateReverseControlUi();

  state.reconnectTimer = window.setTimeout(() => {
    state.reconnectTimer = null;
    connect({ reconnect: true });
  }, delayMs);
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
}

function resetVideoFrameStats() {
  state.videoFrameTimes = [];
  state.actualVideoFps = 0;
  state.requestedFps = 0;
  state.negotiatedFps = 0;
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
}

function primeAudioPlayback() {
  if (!elements.audioToggle.checked || Number(elements.audioVolumeRange.value) <= 0) {
    return;
  }

  void ensureAudioPlayback(48000)
    .then(() => {
      if (state.audioContext?.state === "running") {
        elements.audioText.textContent = `声音：播放已准备 · ${elements.audioVolumeRange.value}%`;
      }
    })
    .catch((error) => {
      state.audioLastError = error?.message || String(error);
      addLog("声音播放准备失败", state.audioLastError);
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

function buildLogExportText() {
  const settings = currentDisplaySettings();
  const keyboardMapping = getKeyboardMapping();
  const connectionLabel =
    elements.transportSelect.value === "websocket" ? "WebSocket 局域网" : "本地模拟";
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
    "连接状态",
    `- 当前状态：${connectionStates[state.connectionState]?.label ?? state.connectionState}`,
    `- 状态详情：${elements.statusText.textContent}`,
    `- 当前方向：${getControlDirectionLabel(state.controlDirection)}`,
    `- 反控状态：${state.reverseStateDetail}`,
    `- 连接方式：${connectionLabel}`,
    `- 目标地址：${elements.hostInput.value.trim() || "-"}:${elements.portInput.value.trim() || "-"}`,
    `- 协议版本：${protocolVersion}`,
    `- 主机诊断：${elements.hostDiagnosticsText.textContent.replace(/^诊断：/, "") || "-"}`,
    "",
    "显示与能力",
    `- 画质预设：${elements.qualityPresetSelect.selectedOptions[0]?.textContent ?? settings.qualityPreset}`,
    `- 显示模式：${settings.displayMode === "fullscreen" ? "全屏" : "窗口"}`,
    `- 显示器：${elements.displaySelect.selectedOptions[0]?.textContent ?? settings.displayId}`,
    `- 分辨率：${settings.resolutionMode === "native" ? "原生" : `${settings.width} × ${settings.height}`}`,
    `- 缩放：${elements.scaleModeSelect.selectedOptions[0]?.textContent ?? settings.scaleMode}`,
    `- 刷新率：${settings.fps} Hz`,
    `- 码率：${Math.round(settings.maxBandwidthKbps / 1000)} Mbps`,
    `- 声音：${settings.audio ? `开启 · ${settings.audioVolume}%` : "关闭"}`,
    `- 剪贴板：${settings.clipboard ? "开启" : "关闭"}`,
    `- 最近收到远端文件：${state.receivedClipboardFiles.length} 个`,
    `- 按键映射：Win→${remoteModifierLabels[keyboardMapping.win]}，Alt→${remoteModifierLabels[keyboardMapping.alt]}，Ctrl→${remoteModifierLabels[keyboardMapping.ctrl]}`,
    `- Windows 快捷键兼容：${elements.shortcutCompatToggle.checked ? "开启" : "关闭"}`,
    "",
    "运行统计",
    `- 输入事件：${state.inputEvents}`,
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
    if (reconnect && !state.manualDisconnect) {
      scheduleReconnect(message);
      return;
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

function startLatencyLoop() {
  stopLatencyLoop();
  state.latencyTimer = window.setInterval(() => {
    if (!state.connected) return;
    const latency = 8 + Math.floor(Math.random() * 16);
    elements.metricLatency.textContent = `${latency} ms`;
  }, 1000);
}

function stopLatencyLoop() {
  if (state.latencyTimer) {
    window.clearInterval(state.latencyTimer);
    state.latencyTimer = null;
  }
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
  state.fullscreen = enabled;
  document.querySelector(".app-shell").classList.toggle("is-fullscreen", enabled);
  elements.fullscreenButton.classList.toggle("active", enabled);
  elements.windowModeButton.classList.toggle("active", !enabled);
  sendDisplaySettings();
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
    return;
  }

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
        addLog("剪贴板", "本机剪贴板没有文字内容");
      }
      return false;
    }

    const clipboardId = makeClipboardId();
    elements.clipboardText.textContent = `剪贴板：已发送 ${text.length} 字`;
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
    addLog(sourceLabel, "未连接，无法发送文件");
    return;
  }

  if (!elements.clipboardToggle.checked) {
    elements.clipboardText.textContent = "剪贴板：已关闭";
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
    addLog(sourceLabel, `文件块发送完成，等待对端确认 · ${transferId}`);
  } catch (error) {
    const message = error?.message || "文件发送失败";
    elements.clipboardText.textContent = "剪贴板：文件发送失败";
    addLog(`${sourceLabel}失败`, message);
  } finally {
    state.fileTransferActive = false;
    if (clearFileInput) elements.fileClipboardInput.value = "";
    updateFileClipboardButton();
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
  try {
    const nativeFiles = await Promise.all(
      files.map(async (file, index) => ({
        name: makeSafeDownloadName(file.name, index),
        dataBase64: await blobToBase64(file.blob),
      })),
    );
    return await invoke("write_files_to_clipboard", { files: nativeFiles });
  } catch (error) {
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
  const result = await writeReceivedFilesToSystemClipboard();
  if (result.clipboardWritten) {
    elements.clipboardText.textContent = `剪贴板：已写入系统文件剪贴板（${result.fileCount ?? state.receivedClipboardFiles.length} 个文件）`;
    addLog("远端文件剪贴板", result.reason || "已写入 Windows 系统文件剪贴板");
  } else {
    elements.clipboardText.textContent = "剪贴板：系统文件剪贴板写入失败";
    addLog("远端文件剪贴板", result.reason || "文件仍保留在远端文件托盘");
  }
}

function renderReceivedFiles() {
  elements.receivedFilesList.innerHTML = "";
  const files = state.receivedClipboardFiles;
  const canWriteFileClipboard = canUseDesktopFileClipboard();
  elements.copyReceivedFilesButton.disabled = files.length === 0 || !canWriteFileClipboard;
  elements.copyReceivedFilesButton.title = canWriteFileClipboard
    ? "写入系统文件剪贴板"
    : "桌面版支持写入系统文件剪贴板";
  elements.downloadAllReceivedFilesButton.disabled = files.length === 0;
  elements.clearReceivedFilesButton.disabled = files.length === 0;

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
  for (const file of state.receivedClipboardFiles) {
    if (file.objectUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(file.objectUrl);
    }
  }
  state.receivedClipboardFiles = [];
  renderReceivedFiles();
  elements.clipboardText.textContent = elements.clipboardToggle.checked ? "剪贴板：已开启" : "剪贴板：已关闭";
  addLog("远端文件", "已清空内存暂存文件");
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
    state.client?.sendClipboardFileResponse({
      transferId,
      accepted: false,
      code: "LAN011",
      reason,
    });
    return;
  }

  state.remoteFileTransfers.set(transferId, {
    transferId,
    totalBytes,
    receivedBytes: 0,
    fileCount: Number(message.fileCount) || files.length,
    files,
  });

  elements.clipboardText.textContent = `剪贴板：准备接收远端 ${fileCount || files.length} 个文件`;
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

  const saveMode = systemClipboardResult.clipboardWritten ? "clipboard" : systemClipboardResult.saveMode || "memory-only";
  const reason = systemClipboardResult.clipboardWritten
    ? systemClipboardResult.reason || "Windows 系统文件剪贴板已写入。"
    : systemClipboardResult.reason || "Windows 控制端已在浏览器内存中接收文件，可在远端文件托盘下载。";

  elements.clipboardText.textContent = systemClipboardResult.clipboardWritten
    ? `剪贴板：已接收并写入系统文件剪贴板（${files.length} 个文件）`
    : `剪贴板：已接收远端 ${files.length} 个文件（内存暂存）`;
  addLog(
    "文件剪贴板",
    systemClipboardResult.clipboardWritten
      ? `已接收远端 ${files.length} 个文件，共 ${formatBytes(receivedBytes)}，并写入 Windows 系统文件剪贴板`
      : `已接收远端 ${files.length} 个文件，共 ${formatBytes(receivedBytes)}，可在远端文件托盘下载；${reason}`,
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
  addLog("文件剪贴板", message.accepted ? "对端已接受文件清单" : message.reason || "对端拒绝文件清单");
}

function handleClipboardFileProgress(message) {
  if (!message.totalBytes) {
    return;
  }
  const percent = Math.round((Number(message.receivedBytes || 0) / Number(message.totalBytes)) * 100);
  elements.clipboardText.textContent = `剪贴板：对端接收 ${percent}%`;
}

function handleClipboardFileResult(message) {
  elements.clipboardText.textContent = message.accepted
    ? "剪贴板：对端已完成文件接收"
    : "剪贴板：对端文件接收失败";
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
    addLog("剪贴板", "已写入远端文字到本机剪贴板");
    state.client?.sendClipboardAck({
      accepted: true,
      clipboardId: message.clipboardId,
    });
  } catch (error) {
    const reason = error?.message || "写入系统剪贴板失败";
    elements.clipboardText.textContent = "剪贴板：接收失败";
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
      clipboardText: message.clipboardText ?? state.hostDiagnostics.clipboardText,
      clipboardFile: message.clipboardFile ?? state.hostDiagnostics.clipboardFile,
      clipboardTextMode: message.clipboardTextMode ?? state.hostDiagnostics.clipboardTextMode,
      clipboardFileMode: message.clipboardFileMode ?? state.hostDiagnostics.clipboardFileMode,
      qualityPreset: message.qualityPreset ?? state.hostDiagnostics.qualityPreset,
      jpegQuality: message.jpegQuality ?? state.hostDiagnostics.jpegQuality,
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
    return;
  }

  if (message.type === "audio_status") {
    elements.audioText.textContent = message.enabled
      ? `声音：${message.message || "已开启"}`
      : `声音：${message.message || "已关闭"}`;
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
  const frameLabel = getVideoFrameLabel(frame);
  const frameCapturePipeline = frame.capturePipeline ?? state.hostDiagnostics.capturePipeline;
  const frameDiagnostics = {
    videoCodec: frame.codec ?? state.hostDiagnostics.videoCodec,
    videoEncoding: frame.encoding ?? state.hostDiagnostics.videoEncoding,
    videoSource: frame.source ?? state.hostDiagnostics.videoSource,
    capturePipeline: frameCapturePipeline,
    droppedFrames: frame.droppedFrames ?? state.hostDiagnostics.droppedFrames,
    qualityPreset: frame.qualityPreset ?? state.hostDiagnostics.qualityPreset,
    jpegQuality: frame.jpegQuality ?? state.hostDiagnostics.jpegQuality,
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

async function renderH264VideoFrame(frame) {
  if (!frame.payload) {
    addLog("视频帧", "收到 H.264 视频帧但缺少 payload");
    return;
  }

  state.videoFrames += 1;
  recordVideoFrameTime();
  updateFpsMetric();
  updateHostDiagnostics({
    videoCodec: "h264",
    videoEncoding: frame.encoding ?? "annexb-base64",
    videoSource: frame.source ?? state.hostDiagnostics.videoSource,
    capturePipeline: frame.capturePipeline ?? "screencapturekit-h264",
    droppedFrames: frame.droppedFrames ?? state.hostDiagnostics.droppedFrames,
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
      type: frame.keyFrame ? "key" : "delta",
      timestamp: timestampUs,
      duration: durationUs,
      data: base64ToUint8Array(frame.payload),
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
elements.disconnectButton.addEventListener("click", disconnect);
elements.refreshDevicesButton.addEventListener("click", refreshDevices);
elements.exportLogButton.addEventListener("click", exportLogs);
elements.clearLogButton.addEventListener("click", () => {
  state.logEntries = [];
  elements.eventLog.innerHTML = "";
  addLog("日志", "已清空");
});

elements.fullscreenButton.addEventListener("click", () => setFullscreen(true));
elements.windowModeButton.addEventListener("click", () => setFullscreen(false));
elements.reverseButton.addEventListener("click", requestReverseControl);

elements.qualityPresetSelect.addEventListener("change", () => {
  if (elements.qualityPresetSelect.value === "custom") {
    savePreferences();
    addLog("画质预设", "自定义");
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
  sendDisplaySettings();
});
elements.audioVolumeRange.addEventListener("input", () => {
  elements.audioVolumeText.textContent = `${elements.audioVolumeRange.value}%`;
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

[elements.hostInput, elements.portInput].forEach((input) => {
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
  if (canSendControlInput()) {
    event.preventDefault();
  }
});
elements.remoteCanvas.addEventListener("mousedown", (event) => {
  if (!canSendControlInput()) return;
  elements.remoteCanvas.focus();
  const mapped = mapPointerToRemote(event);
  if (!mapped) return;
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
  const mapped = mapPointerToRemote(event);
  if (!mapped) return;
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
  event.preventDefault();
  if (!canSendControlInput()) return;
  const mapped = mapPointerToRemote(event);
  if (!mapped) return;
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
    setFullscreen(false);
  }
});

tickClock();
setInterval(tickClock, 1000);
applyPreferences();
state.discoveredDevices = buildDeviceList();
renderDiscoveredDevices();
applyScaleMode();
updateMetrics();
renderReceivedFiles();
resetHostDiagnostics();
updateReverseControlUi();
addLog("控制端启动", "本地模拟模式，可切换 WebSocket");
