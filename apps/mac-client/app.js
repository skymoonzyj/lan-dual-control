const elements = {
  hostInput: document.querySelector("#hostInput"),
  portInput: document.querySelector("#portInput"),
  passwordInput: document.querySelector("#passwordInput"),
  discoverButton: document.querySelector("#discoverButton"),
  connectButton: document.querySelector("#connectButton"),
  reconnectNowButton: document.querySelector("#reconnectNowButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  recentConnectionSelect: document.querySelector("#recentConnectionSelect"),
  useRecentConnectionButton: document.querySelector("#useRecentConnectionButton"),
  clearRecentConnectionsButton: document.querySelector("#clearRecentConnectionsButton"),
  recentConnectionStatus: document.querySelector("#recentConnectionStatus"),
  qualityPresetSelect: document.querySelector("#qualityPresetSelect"),
  resolutionSelect: document.querySelector("#resolutionSelect"),
  fpsSelect: document.querySelector("#fpsSelect"),
  bandwidthSelect: document.querySelector("#bandwidthSelect"),
  displaySettingsStatus: document.querySelector("#displaySettingsStatus"),
  connectionStatus: document.querySelector("#connectionStatus"),
  remoteStatus: document.querySelector("#remoteStatus"),
  videoStatus: document.querySelector("#videoStatus"),
  audioStatus: document.querySelector("#audioStatus"),
  audioToggle: document.querySelector("#audioToggle"),
  audioVolumeRange: document.querySelector("#audioVolumeRange"),
  audioVolumeText: document.querySelector("#audioVolumeText"),
  audioPlaybackStatus: document.querySelector("#audioPlaybackStatus"),
  firstVideoMetric: document.querySelector("#firstVideoMetric"),
  videoFlowMetric: document.querySelector("#videoFlowMetric"),
  audioFlowMetric: document.querySelector("#audioFlowMetric"),
  reconnectMetric: document.querySelector("#reconnectMetric"),
  remoteRuntimeMetric: document.querySelector("#remoteRuntimeMetric"),
  reversePolicyMetric: document.querySelector("#reversePolicyMetric"),
  inputStatus: document.querySelector("#inputStatus"),
  remoteViewport: document.querySelector("#remoteViewport"),
  remoteImage: document.querySelector("#remoteImage"),
  remoteCanvas: document.querySelector("#remoteCanvas"),
  emptyState: document.querySelector("#emptyState"),
  focusButton: document.querySelector("#focusButton"),
  clipboardTextInput: document.querySelector("#clipboardTextInput"),
  readClipboardButton: document.querySelector("#readClipboardButton"),
  sendClipboardButton: document.querySelector("#sendClipboardButton"),
  clipboardStatus: document.querySelector("#clipboardStatus"),
  clipboardWatchToggle: document.querySelector("#clipboardWatchToggle"),
  localClipboardStatus: document.querySelector("#localClipboardStatus"),
  clipboardFileInput: document.querySelector("#clipboardFileInput"),
  sendClipboardFilesButton: document.querySelector("#sendClipboardFilesButton"),
  fileClipboardStatus: document.querySelector("#fileClipboardStatus"),
  eventLog: document.querySelector("#eventLog"),
  exportLogButton: document.querySelector("#exportLogButton"),
  clearLogButton: document.querySelector("#clearLogButton"),
};

const state = {
  socket: null,
  connected: false,
  authenticated: false,
  remoteWidth: 1280,
  remoteHeight: 720,
  frameCount: 0,
  frameWindowStartedAt: 0,
  frameWindowCount: 0,
  lastPointerSentAt: 0,
  inputSequence: 0,
  audioFrames: 0,
  audioLevel: 0,
  audioContext: null,
  audioGain: null,
  audioNextPlayTime: 0,
  audioPlayedFrames: 0,
  audioDroppedFrames: 0,
  audioLastError: "",
  lastAudioFrameAgeMs: null,
  connectionStartedAt: 0,
  firstVideoFrameMs: 0,
  firstAudioFrameMs: 0,
  lastVideoFrameAt: 0,
  maxVideoGapMs: 0,
  lastVideoFps: 0,
  lastVideoCodec: "",
  lastVideoFrameAgeMs: null,
  repeatSignalVideoFrames: 0,
  binaryVideoFrames: 0,
  remoteImageObjectUrl: "",
  h264Decoder: null,
  h264DecoderKey: "",
  h264DecoderConfigPromise: null,
  h264DecoderStatus: "idle",
  h264DecoderErrorCount: 0,
  h264DecoderLastError: "",
  h264DecoderQueue: [],
  h264DecoderNeedsKeyFrame: true,
  h264SkippedDeltaFrames: 0,
  h264DecodedFrames: 0,
  h264FallbackActive: false,
  h264FallbackReason: "",
  h264DecoderLatencyMs: 0,
  reconnectTotal: 0,
  fileTransferActive: false,
  fileTransferId: "",
  fileTransferAbortController: null,
  fileTransfers: new Map(),
  closeStatusOverride: "",
  manualDisconnect: false,
  connectAttemptId: 0,
  discoveryAbortController: null,
  discoveryRequestId: 0,
  reconnectAttempts: 0,
  reconnectTimer: null,
  reconnectCountdownTimer: null,
  reconnectNextAt: 0,
  reconnectReason: "",
  reconnectStableTimer: null,
  remoteRuntime: null,
  remoteCapabilities: null,
  clipboardWatchTimer: null,
  clipboardReadInFlight: false,
  lastLocalClipboardText: "",
  recentConnections: [],
  logEntries: [],
};

const recentConnectionsStorageKey = "lanDualMacClientRecentConnections";
const maxRecentConnections = 8;
const fileChunkSizeBytes = 64 * 1024;
const maxClipboardFileBytes = 32 * 1024 * 1024;
const clipboardWatchIntervalMs = 1200;
const maxReconnectAttempts = 3;
const reconnectBaseDelayMs = 1200;
const reconnectStableMs = 10000;
const reconnectDelayScale = (() => {
  const value = Number(new URLSearchParams(window.location.search).get("reconnectDelayScale") || "1");
  return Number.isFinite(value) && value > 0 ? value : 1;
})();
const binaryVideoMagic = "LDCV1\n";
const videoQualityPresets = {
  smooth: { resolution: "1920x1080", fps: "30", bandwidth: "10" },
  balanced: { resolution: "1920x1080", fps: "60", bandwidth: "20" },
  sharp: { resolution: "2560x1440", fps: "60", bandwidth: "40" },
};
const resolutionLabels = {
  "1920x1080": "1080P",
  "2560x1440": "2K",
  "3840x2160": "4K",
};

function nowText() {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

function logEvent(title, detail = "") {
  const entry = {
    time: nowText(),
    title,
    detail,
  };
  state.logEntries.unshift(entry);
  while (state.logEntries.length > 80) {
    state.logEntries.pop();
  }
  const item = document.createElement("li");
  const strong = document.createElement("strong");
  strong.textContent = title;
  item.append(strong);
  if (detail) {
    item.append(` · ${detail}`);
  }
  const time = document.createElement("span");
  time.textContent = entry.time;
  item.append(" ", time);
  elements.eventLog.prepend(item);
  while (elements.eventLog.children.length > 80) {
    elements.eventLog.lastElementChild?.remove();
  }
}

function setConnectionStatus(text) {
  elements.connectionStatus.textContent = text;
}

function setReconnectNowVisible(visible) {
  elements.reconnectNowButton.hidden = !visible;
  elements.reconnectNowButton.disabled = !visible;
}

function setConnected(connected) {
  state.connected = connected;
  elements.connectButton.disabled = connected;
  elements.disconnectButton.disabled = !connected;
  if (connected) {
    setReconnectNowVisible(false);
  }
  setConnectionStatus(connected ? "已连接" : "未连接");
  updateTextClipboardButton();
  updateFileClipboardButton();
  renderSessionDiagnostics();
}

function formatMs(value) {
  return `${Math.max(0, Math.round(value))} ms`;
}

function calculateFrameAgeMs(timestamp) {
  if (!timestamp) {
    return null;
  }
  const parsed = Date.parse(String(timestamp));
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Date.now() - parsed;
}

function formatFrameAge(ageMs) {
  if (!Number.isFinite(ageMs)) {
    return "";
  }
  if (ageMs < -50) {
    return `时钟偏差 ${formatMs(Math.abs(ageMs))}`;
  }
  return `到达 ${formatMs(ageMs)}`;
}

function normalizeRemoteRuntime(runtime) {
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

function formatRemoteRuntimeDiagnostics(runtime) {
  const normalized = normalizeRemoteRuntime(runtime);
  if (!normalized) {
    return "未提供";
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

function updateRemoteRuntime(runtime) {
  state.remoteRuntime = normalizeRemoteRuntime(runtime);
  renderSessionDiagnostics();
}

function normalizeRemoteCapabilities(capabilities) {
  if (!capabilities || typeof capabilities !== "object") {
    return null;
  }
  const reverse = capabilities.reverseControl && typeof capabilities.reverseControl === "object"
    ? capabilities.reverseControl
    : {};
  const policy = reverse.policy && typeof reverse.policy === "object"
    ? reverse.policy
    : capabilities.reverseControlPolicy && typeof capabilities.reverseControlPolicy === "object"
    ? capabilities.reverseControlPolicy
    : {};
  const rawMode =
    capabilities.reverseControlMode ||
    reverse.mode ||
    reverse.reverseControlMode ||
    policy.mode ||
    (capabilities.reverseControl === false || reverse.supported === false ? "disabled" : "");
  const mode = String(rawMode).trim().toLowerCase();
  const hasReverseSignal =
    rawMode ||
    capabilities.reverseControl !== undefined ||
    Object.keys(reverse).length > 0 ||
    Object.keys(policy).length > 0;
  if (!hasReverseSignal) {
    return null;
  }
  const supported = capabilities.reverseControl !== undefined && typeof capabilities.reverseControl !== "object"
    ? Boolean(capabilities.reverseControl)
    : reverse.supported !== undefined
      ? Boolean(reverse.supported)
      : policy.supported !== undefined
        ? Boolean(policy.supported)
        : mode !== "disabled";
  const autoAccept = reverse.autoAccept !== undefined
    ? Boolean(reverse.autoAccept)
    : Boolean(policy.autoAccept);
  const requiresConfirmation = reverse.requiresConfirmation !== undefined
    ? Boolean(reverse.requiresConfirmation)
    : policy.requiresConfirmation !== undefined
      ? Boolean(policy.requiresConfirmation)
      : mode !== "accept" && mode !== "disabled";
  return {
    reverseControl: supported,
    reverseControlMode: mode || (supported ? "unknown" : "disabled"),
    reverseControlPolicy: {
      requiresConfirmation,
      autoAccept,
      supported,
    },
  };
}

function formatReversePolicyDiagnostics(capabilities) {
  const normalized = normalizeRemoteCapabilities(capabilities);
  if (!normalized) {
    return "未提供";
  }
  const modeLabels = {
    deny: "默认拒绝",
    accept: "实验自动同意",
    disabled: "未启用",
    unknown: "未知策略",
  };
  const modeText = modeLabels[normalized.reverseControlMode] || normalized.reverseControlMode;
  const detail = normalized.reverseControlMode === "accept"
    ? "仅可信局域网实验"
    : normalized.reverseControlMode === "disabled" || normalized.reverseControl === false || normalized.reverseControlPolicy.supported === false
      ? "不可请求反控"
      : normalized.reverseControlPolicy.requiresConfirmation
        ? "需要 Windows 用户确认"
        : normalized.reverseControlPolicy.autoAccept
          ? "会自动同意"
          : "等待对端策略";
  return `${modeText} · ${detail}`;
}

function updateRemoteCapabilities(capabilities) {
  state.remoteCapabilities = normalizeRemoteCapabilities(capabilities);
  renderSessionDiagnostics();
}

function clearRemoteEndpointDetails() {
  updateRemoteRuntime(null);
  updateRemoteCapabilities(null);
}

function resetSessionDiagnostics({ resetReconnects = false } = {}) {
  state.connectionStartedAt = performance.now();
  state.firstVideoFrameMs = 0;
  state.firstAudioFrameMs = 0;
  state.lastVideoFrameAt = 0;
  state.maxVideoGapMs = 0;
  state.lastVideoFps = 0;
  state.lastVideoCodec = "";
  state.lastVideoFrameAgeMs = null;
  state.repeatSignalVideoFrames = 0;
  state.binaryVideoFrames = 0;
  state.frameCount = 0;
  state.frameWindowStartedAt = 0;
  state.frameWindowCount = 0;
  if (resetReconnects) {
    state.reconnectTotal = 0;
  }
  renderSessionDiagnostics();
}

function renderSessionDiagnostics() {
  elements.firstVideoMetric.textContent = state.firstVideoFrameMs > 0
    ? `${formatMs(state.firstVideoFrameMs)} · ${state.remoteWidth}x${state.remoteHeight}`
    : state.connected ? "等待首帧" : "未就绪";

  if (state.frameCount > 0) {
    const fpsText = state.lastVideoFps > 0 ? ` · ${state.lastVideoFps.toFixed(1)} fps` : "";
    const ageText = formatFrameAge(state.lastVideoFrameAgeMs);
    const ageMetricText = ageText ? ` · ${ageText}` : "";
    const repeatText = state.repeatSignalVideoFrames > 0 ? ` · 重复 ${state.repeatSignalVideoFrames}` : "";
    const binaryText = state.binaryVideoFrames > 0 ? ` · 二进制 ${state.binaryVideoFrames}` : "";
    elements.videoFlowMetric.textContent = `${state.lastVideoCodec || "video"} · #${state.frameCount}${fpsText} · gap max ${formatMs(state.maxVideoGapMs)}${ageMetricText}${repeatText}${binaryText}`;
  } else {
    elements.videoFlowMetric.textContent = state.connected ? "等待视频" : "未接收";
  }

  if (state.audioFrames > 0) {
    const firstAudioText = state.firstAudioFrameMs > 0 ? `首帧 ${formatMs(state.firstAudioFrameMs)} · ` : "";
    const droppedText = state.audioDroppedFrames > 0 ? ` · 丢 ${state.audioDroppedFrames}` : "";
    const ageText = formatFrameAge(state.lastAudioFrameAgeMs);
    const ageMetricText = ageText ? ` · ${ageText}` : "";
    elements.audioFlowMetric.textContent = `${firstAudioText}接收 ${state.audioFrames} · 播放 ${state.audioPlayedFrames}${droppedText}${ageMetricText}`;
  } else {
    elements.audioFlowMetric.textContent = elements.audioToggle.checked ? "等待音频" : "未开启";
  }

  elements.reconnectMetric.textContent = state.reconnectTotal > 0
    ? `已尝试 ${state.reconnectTotal} 次 · 当前 ${state.reconnectAttempts}/${maxReconnectAttempts}${formatReconnectCountdownSuffix()}`
    : "0 次";
  elements.remoteRuntimeMetric.textContent = formatRemoteRuntimeDiagnostics(state.remoteRuntime);
  elements.reversePolicyMetric.textContent = formatReversePolicyDiagnostics(state.remoteCapabilities);
}

function reconnectDelayForAttempt(attempt) {
  return Math.max(1, Math.round(reconnectBaseDelayMs * attempt * reconnectDelayScale));
}

function reconnectSecondsRemaining() {
  if (!state.reconnectNextAt) {
    return 0;
  }
  return Math.max(0, Math.ceil((state.reconnectNextAt - Date.now()) / 1000));
}

function formatReconnectCountdownSuffix() {
  const remainingSeconds = reconnectSecondsRemaining();
  return remainingSeconds > 0 ? ` · ${remainingSeconds} 秒后重连` : "";
}

function renderReconnectCountdown() {
  if (!state.reconnectNextAt) return;
  const remainingSeconds = reconnectSecondsRemaining();
  if (remainingSeconds <= 0) {
    setConnectionStatus(`正在重连（${state.reconnectAttempts}/${maxReconnectAttempts}）`);
  } else {
    setConnectionStatus(`连接中断，${remainingSeconds} 秒后自动重连（${state.reconnectAttempts}/${maxReconnectAttempts}）`);
  }
  renderSessionDiagnostics();
}

function resetVideoSurface(status = "无画面") {
  resetVideoDecoder({ resetFallback: true });
  releaseRemoteImageObjectUrl();
  elements.remoteImage.removeAttribute("src");
  elements.remoteImage.classList.remove("is-visible");
  elements.remoteCanvas.classList.remove("is-visible");
  elements.remoteCanvas.width = 0;
  elements.remoteCanvas.height = 0;
  elements.emptyState.classList.remove("is-hidden");
  elements.videoStatus.textContent = status;
}

function resetRemoteStatus(status = "等待发现") {
  elements.remoteStatus.textContent = status;
}

function resetAudioStatus() {
  elements.audioStatus.textContent = elements.audioToggle.checked ? "未接收" : "未开启";
}

function setDiscoverButtonBusy(busy) {
  elements.discoverButton.disabled = busy;
  elements.discoverButton.textContent = busy ? "发现中" : "发现";
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
  state.reconnectNextAt = 0;
  state.reconnectReason = "";
  setReconnectNowVisible(false);
  if (state.reconnectStableTimer) {
    window.clearTimeout(state.reconnectStableTimer);
    state.reconnectStableTimer = null;
  }
}

function markConnectionStableLater() {
  if (state.reconnectStableTimer) {
    window.clearTimeout(state.reconnectStableTimer);
  }
  state.reconnectStableTimer = window.setTimeout(() => {
    state.reconnectStableTimer = null;
    if (state.connected && state.authenticated) {
      state.reconnectAttempts = 0;
      renderSessionDiagnostics();
    }
  }, reconnectStableMs);
}

function closeSocketSilently() {
  const socket = state.socket;
  state.socket = null;
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    socket.close();
  }
}

function cancelPendingDiscovery() {
  if (state.discoveryAbortController) {
    state.discoveryAbortController.abort();
    state.discoveryAbortController = null;
  }
  state.discoveryRequestId += 1;
}

function resetEndpointDiscoveryState() {
  if (state.connected || state.authenticated) {
    elements.remoteStatus.textContent = "当前会话保持，地址下次连接生效";
    return;
  }
  cancelConnectAttempt();
  clearReconnectTimers();
  state.manualDisconnect = true;
  closeSocketSilently();
  state.authenticated = false;
  resetAudioPlayback();
  cancelActiveFileTransfer("连接目标已变更，文件发送已取消");
  clearRemoteEndpointDetails();
  resetSessionDiagnostics({ resetReconnects: true });
  resetVideoSurface();
  resetRemoteStatus();
  setConnected(false);
  setDiscoverButtonBusy(false);
}

function beginConnectAttempt() {
  cancelPendingDiscovery();
  state.connectAttemptId += 1;
  return state.connectAttemptId;
}

function cancelConnectAttempt() {
  state.connectAttemptId += 1;
  cancelPendingDiscovery();
}

function isConnectAttemptActive(attemptId) {
  return state.connectAttemptId === attemptId && !state.manualDisconnect;
}

function targetBaseUrl() {
  const host = elements.hostInput.value.trim() || "127.0.0.1";
  const port = elements.portInput.value.trim() || "43770";
  return `http://${host}:${port}`;
}

function targetWsUrl() {
  const host = elements.hostInput.value.trim() || "127.0.0.1";
  const port = elements.portInput.value.trim() || "43770";
  return `ws://${host}:${port}`;
}

function currentEndpoint() {
  return {
    host: elements.hostInput.value.trim() || "127.0.0.1",
    port: elements.portInput.value.trim() || "43770",
  };
}

function recentConnectionKey(connection) {
  return `${connection.host}:${connection.port}`;
}

function formatRecentConnectionLabel(connection) {
  const endpoint = recentConnectionKey(connection);
  const date = connection.lastConnectedAt ? new Date(connection.lastConnectedAt) : null;
  const timeText = date && !Number.isNaN(date.getTime())
    ? date.toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "最近";
  return `${connection.label || endpoint} · ${timeText}`;
}

function loadRecentConnections() {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentConnectionsStorageKey) || "[]");
    state.recentConnections = Array.isArray(parsed)
      ? parsed
        .filter((connection) => connection && connection.host && connection.port)
        .map((connection) => ({
          host: String(connection.host),
          port: String(connection.port),
          label: connection.label ? String(connection.label) : "",
          lastConnectedAt: connection.lastConnectedAt ? String(connection.lastConnectedAt) : "",
        }))
        .slice(0, maxRecentConnections)
      : [];
  } catch {
    state.recentConnections = [];
  }
}

function persistRecentConnections() {
  try {
    localStorage.setItem(recentConnectionsStorageKey, JSON.stringify(state.recentConnections));
  } catch (error) {
    logEvent("最近连接保存失败", error?.message || "localStorage unavailable");
  }
}

function renderRecentConnections() {
  elements.recentConnectionSelect.textContent = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = state.recentConnections.length ? "选择最近连接" : "暂无最近连接";
  elements.recentConnectionSelect.append(placeholder);

  for (const connection of state.recentConnections) {
    const option = document.createElement("option");
    option.value = recentConnectionKey(connection);
    option.textContent = formatRecentConnectionLabel(connection);
    elements.recentConnectionSelect.append(option);
  }

  const hasRecent = state.recentConnections.length > 0;
  elements.recentConnectionSelect.disabled = !hasRecent;
  elements.useRecentConnectionButton.disabled = !hasRecent;
  elements.clearRecentConnectionsButton.disabled = !hasRecent;
  elements.recentConnectionStatus.textContent = hasRecent
    ? `${state.recentConnections.length} 条 · 不保存密码`
    : "不保存密码";
}

function applyRecentConnection(connection) {
  if (!connection) return;
  elements.hostInput.value = connection.host;
  elements.portInput.value = connection.port;
  resetEndpointDiscoveryState();
  elements.recentConnectionStatus.textContent = `已填入 ${recentConnectionKey(connection)} · 不保存密码`;
  logEvent("已填入最近连接", recentConnectionKey(connection));
}

function applySelectedRecentConnection() {
  const value = elements.recentConnectionSelect.value;
  if (!value) return;
  const connection = state.recentConnections.find((item) => recentConnectionKey(item) === value);
  applyRecentConnection(connection);
}

function saveRecentConnection(details = {}) {
  const endpoint = currentEndpoint();
  const connection = {
    host: endpoint.host,
    port: endpoint.port,
    label: details.label || `${endpoint.host}:${endpoint.port}`,
    lastConnectedAt: new Date().toISOString(),
  };
  state.recentConnections = [
    connection,
    ...state.recentConnections.filter((item) => recentConnectionKey(item) !== recentConnectionKey(connection)),
  ].slice(0, maxRecentConnections);
  persistRecentConnections();
  renderRecentConnections();
  elements.recentConnectionStatus.textContent = `已保存 ${recentConnectionKey(connection)} · 不保存密码`;
}

function clearRecentConnections() {
  state.recentConnections = [];
  try {
    localStorage.removeItem(recentConnectionsStorageKey);
  } catch (error) {
    logEvent("最近连接清空失败", error?.message || "localStorage unavailable");
  }
  renderRecentConnections();
  elements.recentConnectionStatus.textContent = "已清空最近连接 · 不保存密码";
  logEvent("最近连接已清空", "只清空地址和端口，不影响密码输入框");
}

function initializeRecentConnections() {
  loadRecentConnections();
  renderRecentConnections();
  if (state.recentConnections[0]) {
    applyRecentConnection(state.recentConnections[0]);
    elements.recentConnectionSelect.value = recentConnectionKey(state.recentConnections[0]);
  }
}

function makeEnvelope(message) {
  return {
    id: `${message.type}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...message,
  };
}

function send(message) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    return null;
  }
  const envelope = makeEnvelope(message);
  state.socket.send(JSON.stringify(envelope));
  return envelope;
}

function currentVideoSettings() {
  const [widthText, heightText] = String(elements.resolutionSelect.value || "1920x1080").split("x");
  const width = Math.max(320, Math.min(3840, Number(widthText) || 1920));
  const height = Math.max(180, Math.min(2160, Number(heightText) || 1080));
  const fps = Math.max(1, Math.min(240, Number(elements.fpsSelect.value) || 60));
  const bandwidthMbps = Math.max(1, Math.min(200, Number(elements.bandwidthSelect.value) || 20));
  return {
    width,
    height,
    fps,
    bandwidthMbps,
    maxBandwidthKbps: bandwidthMbps * 1000,
    qualityPreset: elements.qualityPresetSelect.value || "balanced",
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

function binaryVideoTransportEnabled() {
  const value = String(new URLSearchParams(window.location.search).get("binaryVideo") ?? "").toLowerCase();
  return !["0", "false", "off"].includes(value);
}

function preferredVideoTransport() {
  if (!binaryVideoTransportEnabled()) {
    return "json";
  }
  return preferredVideoCodec() === "h264" ? "binary-h264" : "binary-jpeg";
}

function supportedVideoTransports() {
  return binaryVideoTransportEnabled() ? ["json", "binary-jpeg", "binary-h264"] : ["json"];
}

function describeVideoSettings(settings = currentVideoSettings()) {
  const resolution = `${settings.width}x${settings.height}`;
  const resolutionLabel = resolutionLabels[resolution] || resolution;
  return `${resolutionLabel} · ${settings.fps} Hz · ${settings.bandwidthMbps} Mbps`;
}

function updateDisplaySettingsStatus(prefix = "请求") {
  elements.displaySettingsStatus.textContent = `${prefix} ${describeVideoSettings()}`;
}

function makeDisplaySettingsMessage(type = "display_settings") {
  const settings = currentVideoSettings();
  return {
    type,
    width: settings.width,
    height: settings.height,
    fps: settings.fps,
    maxFps: settings.fps,
    maxBandwidthKbps: settings.maxBandwidthKbps,
    qualityPreset: settings.qualityPreset,
    displayMode: "window",
    displayId: "main",
    resolutionMode: "scaled",
    preferredWidth: settings.width,
    preferredHeight: settings.height,
    preferredVideoCodec: preferredVideoCodec(),
    preferredVideoEncoding: preferredVideoEncoding(),
    preferredVideoTransport: preferredVideoTransport(),
    supportedVideoTransports: supportedVideoTransports(),
    audio: elements.audioToggle.checked,
    audioVolume: audioVolume(),
  };
}

function sendDisplaySettings() {
  updateDisplaySettingsStatus("请求");
  if (!state.authenticated) {
    return;
  }
  const settings = makeDisplaySettingsMessage("display_settings");
  send(settings);
  logEvent("显示设置已发送", describeVideoSettings());
}

function applyQualityPreset() {
  const preset = videoQualityPresets[elements.qualityPresetSelect.value];
  if (!preset) {
    updateDisplaySettingsStatus("请求");
    return;
  }
  elements.resolutionSelect.value = preset.resolution;
  elements.fpsSelect.value = preset.fps;
  elements.bandwidthSelect.value = preset.bandwidth;
  sendDisplaySettings();
}

function markCustomVideoSettings() {
  const settings = currentVideoSettings();
  const matchingPreset = Object.entries(videoQualityPresets).find(([, preset]) => (
    preset.resolution === `${settings.width}x${settings.height}` &&
    preset.fps === String(settings.fps) &&
    preset.bandwidth === String(settings.bandwidthMbps)
  ));
  elements.qualityPresetSelect.value = matchingPreset?.[0] || "custom";
  sendDisplaySettings();
}

async function discover({ signal, lockButton = true } = {}) {
  const requestId = ++state.discoveryRequestId;
  const url = `${targetBaseUrl()}/discovery`;
  if (lockButton) {
    setDiscoverButtonBusy(true);
  }
  elements.remoteStatus.textContent = "发现中";
  try {
    const response = await fetch(url, { cache: "no-store", signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (requestId === state.discoveryRequestId) {
      updateRemoteRuntime(payload.runtime);
      updateRemoteCapabilities(payload.capabilities);
      elements.remoteStatus.textContent = `${payload.deviceName || payload.hostName || "Windows"} · ${payload.platform || "unknown"}`;
      logEvent("发现成功", `${payload.host || elements.hostInput.value}:${payload.port || elements.portInput.value}`);
    }
    return payload;
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") {
      throw error;
    }
    if (requestId === state.discoveryRequestId) {
      clearRemoteEndpointDetails();
      elements.remoteStatus.textContent = "发现失败";
      logEvent("发现失败", error.message);
    }
    throw error;
  } finally {
    if (lockButton && requestId === state.discoveryRequestId) {
      setDiscoverButtonBusy(false);
    }
  }
}

async function connect({ reconnect = false } = {}) {
  const attemptId = beginConnectAttempt();
  if (!reconnect) {
    state.manualDisconnect = false;
    state.reconnectAttempts = 0;
    clearReconnectTimers();
    closeSocketSilently();
    state.authenticated = false;
    clearRemoteEndpointDetails();
    resetSessionDiagnostics({ resetReconnects: true });
    stopClipboardWatch("正在重新连接，监听已停止");
    resetAudioPlayback();
  } else {
    resetSessionDiagnostics();
  }
  setConnectionStatus("连接中");
  elements.connectButton.disabled = true;
  elements.disconnectButton.disabled = false;
  resetVideoSurface("等待视频");
  primeAudioPlayback();
  const discoveryAbortController = new AbortController();
  state.discoveryAbortController = discoveryAbortController;
  try {
    await discover({ signal: discoveryAbortController.signal });
  } catch {
    // Discovery is helpful but not mandatory for direct WebSocket testing.
  } finally {
    if (state.discoveryAbortController === discoveryAbortController) {
      state.discoveryAbortController = null;
    }
  }
  if (!isConnectAttemptActive(attemptId)) {
    return;
  }

  const endpoint = targetWsUrl();
  const socket = new WebSocket(endpoint);
  socket.binaryType = "arraybuffer";
  state.socket = socket;
  socket.addEventListener("open", () => {
    if (socket !== state.socket) return;
    state.closeStatusOverride = "";
    setConnected(true);
    logEvent(reconnect ? "自动重连已连接" : "WebSocket 已连接", endpoint);
    send({
      type: "hello",
      clientName: "Mac 控制端 Web 原型",
      clientPlatform: "macos",
      protocolVersion: 1,
    });
  });
  socket.addEventListener("message", (event) => {
    if (socket !== state.socket) return;
    void handleMessage(event.data);
  });
  socket.addEventListener("close", () => {
    if (socket !== state.socket) return;
    const closeStatusOverride = state.closeStatusOverride;
    state.socket = null;
    state.authenticated = false;
    setConnected(false);
    clearRemoteEndpointDetails();
    state.closeStatusOverride = "";
    stopClipboardWatch("连接关闭，监听已停止");
    resetAudioPlayback();
    cancelActiveFileTransfer("连接关闭，文件发送已取消");
    resetVideoSurface(closeStatusOverride ? "无画面" : "连接中断");
    resetRemoteStatus(closeStatusOverride ? "等待发现" : "连接中断");
    logEvent("连接关闭");

    if (closeStatusOverride) {
      setConnectionStatus(closeStatusOverride);
      return;
    }
    if (state.manualDisconnect) {
      setConnectionStatus("未连接");
      return;
    }
    scheduleReconnect("连接意外关闭");
  });
  socket.addEventListener("error", () => {
    if (socket !== state.socket) return;
    setConnectionStatus("连接错误");
    logEvent("连接错误", endpoint);
  });
}

function scheduleReconnect(reason) {
  clearReconnectTimers();
  if (state.manualDisconnect) return;
  if (state.reconnectAttempts >= maxReconnectAttempts) {
    setConnectionStatus(`连接失败 · 自动重连 ${maxReconnectAttempts} 次未恢复`);
    elements.connectButton.disabled = false;
    elements.disconnectButton.disabled = true;
    logEvent("停止重连", reason);
    return;
  }

  state.reconnectAttempts += 1;
  state.reconnectTotal += 1;
  const delayMs = reconnectDelayForAttempt(state.reconnectAttempts);
  state.reconnectNextAt = Date.now() + delayMs;
  state.reconnectReason = reason;
  setReconnectNowVisible(true);
  renderReconnectCountdown();
  elements.connectButton.disabled = true;
  elements.disconnectButton.disabled = false;
  renderSessionDiagnostics();
  logEvent("自动重连", `${reason} · 第 ${state.reconnectAttempts}/${maxReconnectAttempts} 次`);

  state.reconnectTimer = window.setTimeout(() => {
    state.reconnectTimer = null;
    if (state.reconnectCountdownTimer) {
      window.clearInterval(state.reconnectCountdownTimer);
      state.reconnectCountdownTimer = null;
    }
    state.reconnectNextAt = 0;
    setReconnectNowVisible(false);
    void connect({ reconnect: true });
  }, delayMs);
  state.reconnectCountdownTimer = window.setInterval(renderReconnectCountdown, 250);
}

function reconnectNow() {
  if (!state.reconnectTimer) return;
  const reason = state.reconnectReason || "手动立即重连";
  window.clearTimeout(state.reconnectTimer);
  state.reconnectTimer = null;
  if (state.reconnectCountdownTimer) {
    window.clearInterval(state.reconnectCountdownTimer);
    state.reconnectCountdownTimer = null;
  }
  state.reconnectNextAt = 0;
  state.reconnectReason = "";
  setReconnectNowVisible(false);
  setConnectionStatus(`正在重连（${state.reconnectAttempts}/${maxReconnectAttempts}）`);
  renderSessionDiagnostics();
  logEvent("立即重连", reason);
  void connect({ reconnect: true });
}

function makeLogFileName() {
  const stamp = new Date()
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");
  return `lan-dual-mac-client-log-${stamp}.txt`;
}

function getReconnectExportStatus(now = Date.now()) {
  const attemptText = `${state.reconnectAttempts}/${maxReconnectAttempts}`;
  const reason = state.reconnectReason || "-";
  if (state.reconnectTimer && state.reconnectNextAt) {
    const remainingSeconds = Math.max(0, Math.ceil((state.reconnectNextAt - now) / 1000));
    return {
      status: `等待自动重连（${attemptText}，${remainingSeconds} 秒后）`,
      reason,
      next: `${new Date(state.reconnectNextAt).toISOString()}（约 ${remainingSeconds} 秒后）`,
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

function buildLogExportText() {
  const settings = currentVideoSettings();
  const reconnectExport = getReconnectExportStatus();
  const eventLines = state.logEntries.map((entry, index) => {
    const detail = entry.detail ? ` | ${entry.detail}` : "";
    return `${String(index + 1).padStart(3, "0")} | ${entry.time} | ${entry.title}${detail}`;
  });

  return [
    "LAN Dual Control Mac 控制端日志",
    `导出时间：${new Date().toISOString()}`,
    "",
    "连接状态",
    `- 当前状态：${elements.connectionStatus.textContent || "-"}`,
    `- 远端摘要：${elements.remoteStatus.textContent || "-"}`,
    `- 目标地址：${currentEndpoint().host}:${currentEndpoint().port}`,
    `- 远端运行：${elements.remoteRuntimeMetric.textContent || "-"}`,
    `- 反控策略：${elements.reversePolicyMetric.textContent || "-"}`,
    `- 重连状态：${reconnectExport.status}`,
    `- 重连原因：${reconnectExport.reason}`,
    `- 下次重连：${reconnectExport.next}`,
    "",
    "显示与媒体",
    `- 画质预设：${elements.qualityPresetSelect.selectedOptions[0]?.textContent || settings.qualityPreset}`,
    `- 分辨率：${settings.width} × ${settings.height}`,
    `- 刷新率：${settings.fps} Hz`,
    `- 码率：${settings.bandwidthMbps} Mbps`,
    `- 视频状态：${elements.videoStatus.textContent || "-"}`,
    `- 视频诊断：${elements.videoFlowMetric.textContent || "-"}`,
    `- 音频状态：${elements.audioStatus.textContent || "-"}`,
    `- 音频诊断：${elements.audioFlowMetric.textContent || "-"}`,
    `- 远端声音：${elements.audioToggle.checked ? `开启 · ${audioVolume()}%` : "关闭"}`,
    "",
    "输入与剪贴板",
    `- 输入状态：${elements.inputStatus.textContent || "-"}`,
    `- 文本剪贴板：${elements.clipboardStatus.textContent || "-"}`,
    `- 本机剪贴板监听：${elements.clipboardWatchToggle.checked ? "开启" : "关闭"}`,
    `- 本机剪贴板状态：${elements.localClipboardStatus.textContent || "-"}`,
    `- 文件剪贴板：${elements.fileClipboardStatus.textContent || "-"}`,
    "",
    "运行统计",
    `- 视频帧：${state.frameCount}`,
    `- 音频帧：${state.audioFrames}`,
    `- 音频播放帧：${state.audioPlayedFrames}`,
    `- 二进制视频帧：${state.binaryVideoFrames}`,
    `- H.264 解码帧：${state.h264DecodedFrames}`,
    `- H.264 错误：${state.h264DecoderErrorCount}`,
    `- 重连次数：${state.reconnectTotal}`,
    "",
    "事件记录",
    ...(eventLines.length ? eventLines : ["暂无事件记录"]),
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
    logEvent("日志导出", link.download);
  } catch (error) {
    logEvent("日志导出失败", error?.message || "当前环境不允许导出文件");
  }
}

function disconnect() {
  cancelConnectAttempt();
  setDiscoverButtonBusy(false);
  state.manualDisconnect = true;
  clearReconnectTimers();
  state.closeStatusOverride = "";
  closeSocketSilently();
  state.authenticated = false;
  stopClipboardWatch("已断开，监听已停止");
  resetAudioPlayback();
  cancelActiveFileTransfer("已断开，文件发送已取消");
  clearRemoteEndpointDetails();
  resetSessionDiagnostics({ resetReconnects: true });
  resetVideoSurface();
  resetRemoteStatus();
  setConnected(false);
  renderSessionDiagnostics();
}

function isBinaryMessage(rawData) {
  return rawData instanceof ArrayBuffer || ArrayBuffer.isView(rawData) || rawData instanceof Blob;
}

async function arrayBufferFromWebSocketData(rawData) {
  if (rawData instanceof ArrayBuffer) {
    return rawData;
  }
  if (ArrayBuffer.isView(rawData)) {
    return rawData.buffer.slice(rawData.byteOffset, rawData.byteOffset + rawData.byteLength);
  }
  if (rawData instanceof Blob) {
    return rawData.arrayBuffer();
  }
  throw new Error("unsupported binary payload");
}

async function parseBinaryMessage(rawData) {
  const arrayBuffer = await arrayBufferFromWebSocketData(rawData);
  const bytes = new Uint8Array(arrayBuffer);
  const magicBytes = new TextEncoder().encode(binaryVideoMagic);
  if (bytes.length < magicBytes.length + 4) {
    throw new Error("binary frame too small");
  }
  for (let index = 0; index < magicBytes.length; index += 1) {
    if (bytes[index] !== magicBytes[index]) {
      throw new Error("unknown binary frame magic");
    }
  }

  const view = new DataView(arrayBuffer);
  const headerLength = view.getUint32(magicBytes.length);
  const headerStart = magicBytes.length + 4;
  const payloadStart = headerStart + headerLength;
  if (headerLength <= 0 || payloadStart > bytes.length) {
    throw new Error("invalid binary frame header length");
  }

  const decoder = new TextDecoder();
  const header = JSON.parse(decoder.decode(bytes.slice(headerStart, payloadStart)));
  const payload = bytes.slice(payloadStart);
  if (header.type !== "video_frame") {
    return header;
  }
  if (payload.length <= 0) {
    return header;
  }

  const codec = String(header.codec || "").toLowerCase();
  const videoTransport = String(header.videoTransport || "").toLowerCase();
  if (codec === "h264" || videoTransport === "binary-h264") {
    return {
      ...header,
      encoding: header.encoding || "annexb-binary",
      videoTransport: "binary-h264",
      mimeType: header.mimeType || "video/avc",
      binaryPayload: payload,
      binaryPayloadBytes: payload.byteLength,
      payloadBytes: Number(header.payloadBytes) || payload.byteLength,
    };
  }

  const mimeType = header.mimeType || "image/jpeg";
  const objectUrl = URL.createObjectURL(new Blob([payload], { type: mimeType }));
  return {
    ...header,
    encoding: header.encoding || "binary-jpeg",
    videoTransport: header.videoTransport || "binary-jpeg",
    mimeType,
    objectUrl,
    binaryPayloadBytes: payload.byteLength,
    payloadBytes: Number(header.payloadBytes) || payload.byteLength,
  };
}

async function handleMessage(rawData) {
  let message;
  try {
    message = isBinaryMessage(rawData)
      ? await parseBinaryMessage(rawData)
      : JSON.parse(rawData);
  } catch (error) {
    logEvent("收到无法解析的消息", error?.message || "");
    return;
  }

  switch (message.type) {
    case "hello_ack":
      handleHelloAck(message);
      break;
    case "auth_result":
      handleAuthResult(message);
      break;
    case "session_answer":
      handleSessionAnswer(message);
      break;
    case "display_settings_ack":
      handleDisplaySettingsAck(message);
      break;
    case "video_frame":
      handleVideoFrame(message);
      break;
    case "audio_frame":
      handleAudioFrame(message);
      break;
    case "audio_settings_ack":
      handleAudioSettingsAck(message);
      break;
    case "input_ack":
      elements.inputStatus.textContent = `${message.accepted ? "已确认" : "被拒绝"} · ${message.mode || "unknown"}`;
      if (!message.accepted) {
        logEvent("输入被拒绝", message.reason || message.code || "unknown");
      }
      break;
    case "clipboard_ack":
      handleClipboardAck(message);
      break;
    case "clipboard_file_response":
      handleClipboardFileResponse(message);
      break;
    case "clipboard_file_progress":
      handleClipboardFileProgress(message);
      break;
    case "clipboard_file_result":
      handleClipboardFileResult(message);
      break;
    case "error":
      logEvent("远端错误", message.message || message.reason || message.code || "unknown");
      break;
    default:
      logEvent("收到消息", message.type || "unknown");
      break;
  }
}

function handleHelloAck(message) {
  if (message.runtime) {
    updateRemoteRuntime(message.runtime);
  }
  updateRemoteCapabilities(message.capabilities);
  elements.remoteStatus.textContent = `${message.hostName || message.deviceName || "Windows"} · ${message.hostPlatform || "windows"}`;
  logEvent("握手成功", message.hostName || message.deviceName || "Windows 被控端");
  send({
    type: "auth_request",
    method: "password",
    password: elements.passwordInput.value,
  });
}

function authAttemptText(message) {
  const remaining = Number(message.attemptsRemaining);
  const maxAttempts = Number(message.maxAttempts);
  if (!Number.isFinite(remaining)) {
    return "";
  }
  if (remaining <= 0) {
    return Number.isFinite(maxAttempts) && maxAttempts > 0 ? `无剩余尝试 · 共 ${maxAttempts} 次` : "无剩余尝试";
  }
  return Number.isFinite(maxAttempts) && maxAttempts > 0
    ? `剩余 ${remaining}/${maxAttempts} 次`
    : `剩余 ${remaining} 次`;
}

function closeAfterAuthFailure(status) {
  state.closeStatusOverride = status;
  state.authenticated = false;
  setConnected(false);
  clearRemoteEndpointDetails();
  resetSessionDiagnostics({ resetReconnects: true });
  stopClipboardWatch("认证失败，监听已停止");
  resetAudioPlayback();
  cancelActiveFileTransfer("认证失败，文件发送已取消");
  resetVideoSurface();
  resetRemoteStatus();
  setConnectionStatus(status);
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    state.socket.close(1000, "auth failed");
    return;
  }
}

function handleAuthResult(message) {
  if (!message.ok) {
    const attemptText = authAttemptText(message);
    const status = attemptText ? `认证失败 · ${attemptText}` : "认证失败";
    const reason = message.reason || message.message || message.code || "unknown";
    setConnectionStatus(status);
    logEvent("认证失败", attemptText ? `${reason} · ${attemptText}` : reason);
    closeAfterAuthFailure(status);
    return;
  }
  state.authenticated = true;
  updateTextClipboardButton();
  updateFileClipboardButton();
  markConnectionStableLater();
  logEvent("认证通过");
  send({
    ...makeDisplaySettingsMessage("session_offer"),
    protocolVersion: 1,
    wantVideo: true,
    wantAudio: elements.audioToggle.checked,
    wantClipboardText: true,
    wantClipboardFile: true,
    preferredVideoCodec: preferredVideoCodec(),
    preferredVideoEncoding: preferredVideoEncoding(),
    preferredAudioCodec: "pcm-f32le",
    audioVolume: audioVolume(),
  });
}

function handleSessionAnswer(message) {
  if (!message.ok) {
    logEvent("会话协商失败", message.reason || message.message || message.code || "unknown");
    return;
  }
  state.remoteWidth = Number(message.width || message.screenWidth || state.remoteWidth);
  state.remoteHeight = Number(message.height || message.screenHeight || state.remoteHeight);
  if (message.runtime) {
    updateRemoteRuntime(message.runtime);
  }
  if (message.capabilities) {
    updateRemoteCapabilities(message.capabilities);
  }
  elements.remoteStatus.textContent = `${state.remoteWidth}x${state.remoteHeight} · ${message.hostMode || "windows-host"}`;
  if (message.audioEnabled) {
    elements.audioStatus.textContent = `${message.audioCodec || "audio"} · 已协商`;
  } else {
    elements.audioStatus.textContent = elements.audioToggle.checked ? "对端未开启" : "未开启";
  }
  const acknowledged = {
    width: state.remoteWidth,
    height: state.remoteHeight,
    fps: Number(message.fps) || currentVideoSettings().fps,
    bandwidthMbps: Math.round((Number(message.maxBandwidthKbps) || currentVideoSettings().maxBandwidthKbps) / 1000),
  };
  elements.displaySettingsStatus.textContent = `已确认 ${describeVideoSettings(acknowledged)}`;
  saveRecentConnection({ label: message.deviceName || message.hostName || message.hostMode || "" });
  logEvent("会话已协商", `${state.remoteWidth}x${state.remoteHeight} · ${message.videoCodec || "video"}`);
}

function handleDisplaySettingsAck(message) {
  const acknowledged = {
    width: Number(message.width) || currentVideoSettings().width,
    height: Number(message.height) || currentVideoSettings().height,
    fps: Number(message.fps) || currentVideoSettings().fps,
    bandwidthMbps: Math.round((Number(message.maxBandwidthKbps) || currentVideoSettings().maxBandwidthKbps) / 1000),
  };
  if (message.accepted !== false && String(message.videoCodec || "").toLowerCase() === "h264") {
    resetVideoDecoder();
  }
  elements.displaySettingsStatus.textContent = `${message.accepted === false ? "未接受" : "已确认"} ${describeVideoSettings(acknowledged)}`;
  logEvent("显示设置已确认", `${message.videoCodec || "?"} · ${message.fps || "?"} Hz`);
}

function releaseRemoteImageObjectUrl() {
  if (!state.remoteImageObjectUrl) {
    return;
  }
  URL.revokeObjectURL(state.remoteImageObjectUrl);
  state.remoteImageObjectUrl = "";
}

function showRemoteImageFrame(source, { objectUrl = false } = {}) {
  if (objectUrl) {
    if (state.remoteImageObjectUrl && state.remoteImageObjectUrl !== source) {
      releaseRemoteImageObjectUrl();
    }
    state.remoteImageObjectUrl = source;
  } else {
    releaseRemoteImageObjectUrl();
  }
  resetVideoDecoder();
  elements.remoteImage.src = source;
  elements.remoteImage.classList.add("is-visible");
  elements.remoteCanvas.classList.remove("is-visible");
  elements.emptyState.classList.add("is-hidden");
}

function handleVideoFrame(frame) {
  if (String(frame.codec ?? "").toLowerCase() === "h264") {
    void handleH264VideoFrame(frame);
    return;
  }

  const isRepeatSignal = frame.repeatPreviousFrame === true && !frame.dataUrl && !frame.objectUrl;
  if (isRepeatSignal && !visibleRemoteFrameElement()) {
    logEvent("忽略重复帧", "尚未收到可显示的视频帧");
    return;
  }

  if (frame.objectUrl) {
    showRemoteImageFrame(frame.objectUrl, { objectUrl: true });
  } else if (frame.dataUrl) {
    showRemoteImageFrame(frame.dataUrl);
  }
  recordVideoFrameStats(frame);
}

function recordVideoFrameStats(frame) {
  const isRepeatSignal = frame.repeatPreviousFrame === true && !frame.dataUrl && !frame.objectUrl;
  const normalizedEncoding = String(frame.encoding ?? "").toLowerCase();
  const isBinaryFrame = normalizedEncoding.includes("binary") ||
    String(frame.videoTransport ?? "").toLowerCase().startsWith("binary-") ||
    Boolean(frame.objectUrl) ||
    Boolean(frame.binaryPayload);
  const codecLabel = `${frame.codec || "jpeg"}${isBinaryFrame ? "/binary" : ""}`;
  state.remoteWidth = Number(frame.width || state.remoteWidth);
  state.remoteHeight = Number(frame.height || state.remoteHeight);
  state.frameCount += 1;
  if (isRepeatSignal) {
    state.repeatSignalVideoFrames += 1;
  }
  if (isBinaryFrame) {
    state.binaryVideoFrames += 1;
  }
  state.frameWindowCount += 1;
  const now = performance.now();
  if (!state.firstVideoFrameMs && state.connectionStartedAt) {
    state.firstVideoFrameMs = now - state.connectionStartedAt;
  }
  if (state.lastVideoFrameAt) {
    state.maxVideoGapMs = Math.max(state.maxVideoGapMs, now - state.lastVideoFrameAt);
  }
  state.lastVideoFrameAt = now;
  state.lastVideoCodec = codecLabel;
  state.lastVideoFrameAgeMs = calculateFrameAgeMs(frame.timestamp);
  const ageText = formatFrameAge(state.lastVideoFrameAgeMs);
  const ageStatusText = ageText ? ` · ${ageText}` : "";
  const repeatText = isRepeatSignal ? ` · 重复 ${state.repeatSignalVideoFrames}` : "";
  if (!state.frameWindowStartedAt) {
    state.frameWindowStartedAt = now;
  }
  const elapsed = now - state.frameWindowStartedAt;
  if (elapsed >= 1000) {
    const fps = (state.frameWindowCount * 1000) / elapsed;
    state.lastVideoFps = fps;
    elements.videoStatus.textContent = `${codecLabel} · #${frame.frameId || state.frameCount} · ${fps.toFixed(1)} fps${ageStatusText}${repeatText}`;
    state.frameWindowCount = 0;
    state.frameWindowStartedAt = now;
  } else {
    elements.videoStatus.textContent = `${codecLabel} · #${frame.frameId || state.frameCount}${ageStatusText}${repeatText}`;
  }
  renderSessionDiagnostics();
}

function resetVideoDecoder({ resetFallback = false } = {}) {
  if (state.h264Decoder && state.h264Decoder.state !== "closed") {
    try {
      state.h264Decoder.close();
    } catch {
      // Best-effort cleanup; a closing decoder should not block reconnect.
    }
  }
  state.h264Decoder = null;
  state.h264DecoderKey = "";
  state.h264DecoderConfigPromise = null;
  state.h264DecoderStatus = "idle";
  state.h264DecoderErrorCount = 0;
  state.h264DecoderLastError = "";
  state.h264DecoderQueue = [];
  state.h264DecoderNeedsKeyFrame = true;
  state.h264SkippedDeltaFrames = 0;
  state.h264DecodedFrames = 0;
  state.h264DecoderLatencyMs = 0;
  if (resetFallback) {
    state.h264FallbackActive = false;
    state.h264FallbackReason = "";
  }
}

function requestJpegVideoFallback(reason) {
  if (state.h264FallbackActive) {
    return;
  }
  const errorCount = state.h264DecoderErrorCount;
  const lastError = state.h264DecoderLastError;
  state.h264FallbackActive = true;
  state.h264FallbackReason = reason || "H.264 解码失败";
  resetVideoDecoder();
  state.h264FallbackActive = true;
  state.h264FallbackReason = reason || "H.264 解码失败";
  state.h264DecoderStatus = "fallback";
  state.h264DecoderErrorCount = errorCount;
  state.h264DecoderLastError = lastError;
  elements.videoStatus.textContent = `H.264 回退 · ${state.h264FallbackReason}`;
  logEvent("视频回退", `${state.h264FallbackReason}，已请求 JPEG 兜底`);
  if (state.authenticated) {
    sendDisplaySettings();
  }
}

function recordH264DecodeError(error) {
  state.h264DecoderErrorCount += 1;
  state.h264DecoderStatus = "error";
  state.h264DecoderLastError = error?.message || String(error);
  logEvent("H.264 解码失败", state.h264DecoderLastError);
  if (state.h264DecoderErrorCount >= 2) {
    requestJpegVideoFallback(state.h264DecoderLastError);
  }
}

function base64ToUint8Array(value) {
  const binary = window.atob(String(value));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function h264PayloadBytes(frame) {
  if (frame.binaryPayload instanceof Uint8Array) {
    return frame.binaryPayload;
  }
  if (frame.binaryPayload instanceof ArrayBuffer) {
    return new Uint8Array(frame.binaryPayload);
  }
  if (ArrayBuffer.isView(frame.binaryPayload)) {
    return new Uint8Array(frame.binaryPayload.buffer, frame.binaryPayload.byteOffset, frame.binaryPayload.byteLength);
  }
  if (frame.payload) {
    return base64ToUint8Array(frame.payload);
  }
  return null;
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

async function selectH264DecoderConfig(baseConfig, format) {
  const candidates = [
    { label: format, config: { ...baseConfig, avc: { format } } },
    { label: "default", config: baseConfig },
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

async function ensureH264Decoder(frame) {
  if (!supportsWebCodecsH264()) {
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
  if (state.h264DecoderConfigPromise && state.h264DecoderKey === decoderKey) {
    return state.h264DecoderConfigPromise;
  }

  const previousErrorCount = state.h264DecoderErrorCount;
  const previousLastError = state.h264DecoderLastError;
  resetVideoDecoder();
  state.h264DecoderStatus = "configuring";
  state.h264DecoderKey = decoderKey;
  state.h264DecoderErrorCount = previousErrorCount;
  state.h264DecoderLastError = previousLastError;
  const baseConfig = {
    codec,
    hardwareAcceleration: "prefer-hardware",
    optimizeForLatency: true,
  };
  state.h264DecoderConfigPromise = (async () => {
    const { config, label } = await selectH264DecoderConfig(baseConfig, format);
    const decoder = new VideoDecoder({
      output: drawDecodedVideoFrame,
      error: (error) => recordH264DecodeError(error),
    });
    decoder.configure(config);
    if (state.h264DecoderKey !== decoderKey) {
      decoder.close();
      throw new Error("H.264 解码器配置已被新会话替换");
    }
    state.h264Decoder = decoder;
    state.h264DecoderStatus = "configured";
    state.h264DecoderConfigPromise = null;
    logEvent("H.264 解码器", `${codec}:${label}`);
    return decoder;
  })();
  try {
    return await state.h264DecoderConfigPromise;
  } catch (error) {
    if (state.h264DecoderKey === decoderKey) {
      state.h264DecoderConfigPromise = null;
    }
    throw error;
  }
}

async function handleH264VideoFrame(frame) {
  const payloadBytes = h264PayloadBytes(frame);
  if (!payloadBytes?.byteLength) {
    logEvent("视频帧", "收到 H.264 视频帧但缺少 payload");
    return;
  }
  recordVideoFrameStats({ ...frame, codec: "h264" });
  elements.videoStatus.textContent = `h264 · #${frame.frameId || state.frameCount} · ${state.h264DecoderStatus}`;

  if (state.h264FallbackActive) {
    elements.videoStatus.textContent = `H.264 回退 · 等待 JPEG`;
    return;
  }

  try {
    const decoder = await ensureH264Decoder(frame);
    const isKeyFrame = Boolean(frame.keyFrame) || isH264KeyFramePayload(payloadBytes, frame.encoding);
    if (state.h264DecoderNeedsKeyFrame && !isKeyFrame) {
      state.h264SkippedDeltaFrames += 1;
      state.h264DecoderStatus = "waiting-keyframe";
      elements.videoStatus.textContent = `h264 · 等待关键帧 · 跳过 ${state.h264SkippedDeltaFrames}`;
      return;
    }
    if (isKeyFrame) {
      state.h264DecoderNeedsKeyFrame = false;
    }
    const durationUs = Number(frame.durationUs) || Math.round(1_000_000 / Math.max(1, state.lastVideoFps || currentVideoSettings().fps || 30));
    const timestampUs =
      Number(frame.timestampUs) ||
      Math.max(0, Number(frame.frameId ?? state.frameCount) - 1) * durationUs;
    state.h264DecoderQueue.push({
      frameId: frame.frameId ?? state.frameCount,
      queuedAt: performance.now(),
      timestampUs,
    });
    if (state.h264DecoderQueue.length > 120) {
      state.h264DecoderQueue.shift();
    }
    state.h264DecoderStatus = "decoding";
    decoder.decode(new EncodedVideoChunk({
      type: isKeyFrame ? "key" : "delta",
      timestamp: timestampUs,
      duration: durationUs,
      data: payloadBytes,
    }));
  } catch (error) {
    recordH264DecodeError(error);
  }
}

function drawDecodedVideoFrame(videoFrame) {
  const decodedMeta = state.h264DecoderQueue.shift();
  const width = videoFrame.displayWidth || videoFrame.codedWidth || state.remoteWidth;
  const height = videoFrame.displayHeight || videoFrame.codedHeight || state.remoteHeight;
  if (width && height) {
    state.remoteWidth = width;
    state.remoteHeight = height;
  }
  const canvas = elements.remoteCanvas;
  if (canvas.width !== state.remoteWidth) {
    canvas.width = state.remoteWidth;
  }
  if (canvas.height !== state.remoteHeight) {
    canvas.height = state.remoteHeight;
  }
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    videoFrame.close();
    recordH264DecodeError(new Error("无法取得视频画布上下文"));
    return;
  }
  context.drawImage(videoFrame, 0, 0, canvas.width, canvas.height);
  videoFrame.close();
  state.h264DecodedFrames += 1;
  state.h264DecoderStatus = "rendering";
  state.h264DecoderLatencyMs = decodedMeta?.queuedAt
    ? performance.now() - decodedMeta.queuedAt
    : state.h264DecoderLatencyMs;
  releaseRemoteImageObjectUrl();
  elements.remoteImage.classList.remove("is-visible");
  elements.remoteImage.removeAttribute("src");
  canvas.classList.add("is-visible");
  elements.emptyState.classList.add("is-hidden");
  const ageText = formatFrameAge(state.lastVideoFrameAgeMs);
  const ageStatusText = ageText ? ` · ${ageText}` : "";
  elements.videoStatus.textContent = `h264 · 解码 #${decodedMeta?.frameId ?? state.h264DecodedFrames} · ${formatMs(state.h264DecoderLatencyMs)}${ageStatusText}`;
  renderSessionDiagnostics();
}

function visibleRemoteFrameElement() {
  if (elements.remoteCanvas.classList.contains("is-visible")) {
    return elements.remoteCanvas;
  }
  if (elements.remoteImage.classList.contains("is-visible")) {
    return elements.remoteImage;
  }
  return null;
}

function imagePointFromEvent(event) {
  const frameElement = visibleRemoteFrameElement();
  if (!frameElement) {
    return null;
  }
  const rect = frameElement.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }
  const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  return {
    x,
    y,
    remoteX: Math.round(x * Math.max(1, state.remoteWidth - 1)),
    remoteY: Math.round(y * Math.max(1, state.remoteHeight - 1)),
  };
}

function buttonName(button) {
  if (button === 2) return "right";
  if (button === 1) return "middle";
  return "left";
}

function sendPointerEvent(eventName, event, extra = {}) {
  if (!state.authenticated) return;
  const point = imagePointFromEvent(event);
  if (!point) return;
  state.inputSequence += 1;
  send({
    type: "input_event",
    event: eventName,
    sequence: state.inputSequence,
    pointerType: "mouse",
    ...point,
    ...extra,
  });
}

function keyboardModifiers(event) {
  const modifiers = [];
  if (event.shiftKey) modifiers.push("shift");
  if (event.altKey) modifiers.push("alt");
  if (event.ctrlKey || event.metaKey) modifiers.push("ctrl");
  return modifiers;
}

function keyboardDisplayKey(event) {
  if (!event.key) return event.code || "key";
  return event.key.length === 1 ? event.key.toUpperCase() : event.key;
}

function keyboardSendLabel(event) {
  const key = keyboardDisplayKey(event);
  if (event.metaKey) return `Command→Ctrl+${key}`;
  if (event.ctrlKey) return `Ctrl+${key}`;
  if (event.altKey || event.shiftKey) {
    return [...keyboardModifiers(event), key].join("+");
  }
  return key;
}

function sendKeyboardEvent(event) {
  if (!state.authenticated) return;
  state.inputSequence += 1;
  const modifiers = keyboardModifiers(event);
  const label = keyboardSendLabel(event);
  const envelope = send({
    type: "input_event",
    event: "key",
    action: event.repeat ? "down" : "key",
    sequence: state.inputSequence,
    key: event.key,
    code: event.code,
    repeat: event.repeat,
    ctrlKey: modifiers.includes("ctrl"),
    altKey: modifiers.includes("alt"),
    shiftKey: modifiers.includes("shift"),
    metaKey: false,
    modifiers,
    remoteModifiers: modifiers,
    shortcutProfile: event.metaKey ? "mac_command_to_windows_ctrl" : "mac_to_windows",
    localKey: event.key,
    localCode: event.code,
    localCtrlKey: event.ctrlKey,
    localAltKey: event.altKey,
    localShiftKey: event.shiftKey,
    localMetaKey: event.metaKey,
  });
  if (envelope) {
    elements.inputStatus.textContent = event.metaKey || event.ctrlKey
      ? `快捷键已发送 · ${label}`
      : `键盘已发送 · ${label}`;
    if (event.metaKey) {
      logEvent("快捷键映射", `${label} · 发往 Windows 为 Ctrl`);
    }
  }
}

function audioVolume() {
  return Math.max(0, Math.min(100, Number(elements.audioVolumeRange.value) || 0));
}

function updateAudioVolumeLabel() {
  elements.audioVolumeText.textContent = `${audioVolume()}%`;
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
  state.audioFrames = 0;
  state.audioLevel = 0;
  state.lastAudioFrameAgeMs = null;
  state.firstAudioFrameMs = 0;
  resetAudioStatus();
  elements.audioPlaybackStatus.textContent = elements.audioToggle.checked ? "等待音频帧" : "未开启";
  renderSessionDiagnostics();
}

async function ensureAudioPlayback(sampleRate = 48000) {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("当前浏览器不支持 WebAudio");
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
    state.audioGain.gain.value = audioVolume() / 100;
  }
  return state.audioContext;
}

function primeAudioPlayback() {
  if (!elements.audioToggle.checked || audioVolume() <= 0) {
    return;
  }
  void ensureAudioPlayback(48000)
    .then(() => {
      elements.audioPlaybackStatus.textContent = "播放已准备";
    })
    .catch((error) => {
      state.audioLastError = error?.message || String(error);
      elements.audioPlaybackStatus.textContent = `准备失败 · ${state.audioLastError}`;
      logEvent("声音播放准备失败", state.audioLastError);
    });
}

function sendAudioSettings() {
  updateAudioVolumeLabel();
  if (state.audioGain) {
    state.audioGain.gain.value = audioVolume() / 100;
  }
  if (!state.authenticated) {
    elements.audioPlaybackStatus.textContent = elements.audioToggle.checked ? "等待连接" : "未开启";
    return;
  }
  send({
    type: "audio_settings_update",
    enabled: elements.audioToggle.checked,
    codec: "pcm-f32le",
    sampleRate: 48000,
    channels: 2,
    volume: audioVolume(),
    muted: !elements.audioToggle.checked || audioVolume() <= 0,
  });
}

function handleAudioSettingsAck(message) {
  elements.audioPlaybackStatus.textContent = message.enabled
    ? `远端已开启 · ${message.codec || "audio"}`
    : "远端已关闭";
  logEvent("声音设置确认", message.enabled ? `${message.codec || "audio"} · ${message.volume ?? audioVolume()}%` : "已关闭");
}

function getAudioPayload(frame) {
  return frame.payload || frame.data || frame.samples || frame.audioData || "";
}

function base64ToBytes(payload) {
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
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

  const bytes = base64ToBytes(payload);
  const channels = Math.max(1, Math.min(8, Number(frame.channels) || 2));
  const sampleRate = Math.max(8000, Math.min(192000, Number(frame.sampleRate) || 48000));
  const layout = String(frame.layout ?? "interleaved").toLowerCase() === "planar" ? "planar" : "interleaved";
  let samples;

  if (codec.includes("s16")) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    samples = new Float32Array(Math.floor(bytes.byteLength / 2));
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.max(-1, Math.min(1, view.getInt16(index * 2, true) / 32768));
    }
  } else {
    const alignedLength = bytes.byteLength - (bytes.byteLength % 4);
    const view = new DataView(bytes.buffer, bytes.byteOffset, alignedLength);
    samples = new Float32Array(alignedLength / 4);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.max(-1, Math.min(1, view.getFloat32(index * 4, true)));
    }
  }

  const frameCount = Math.floor(samples.length / channels);
  if (frameCount <= 0) {
    return null;
  }
  return { samples, channels, sampleRate, frameCount, layout };
}

async function playPcmAudioFrame(frame) {
  if (!elements.audioToggle.checked || audioVolume() <= 0) {
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

function renderAudioFrameStatus(frame) {
  const levelText = `${Math.round(state.audioLevel * 100)}%`;
  const codec = frame.codec || "mock";
  const payload = getAudioPayload(frame);
  const ageText = formatFrameAge(state.lastAudioFrameAgeMs);
  const ageStatusText = ageText ? ` · ${ageText}` : "";
  const playbackText = state.audioPlayedFrames > 0
    ? ` · 播放 ${state.audioPlayedFrames}`
    : payload
      ? elements.audioToggle.checked ? " · 等待播放" : " · 未播放"
      : "";
  const droppedText = state.audioDroppedFrames > 0 ? ` · 丢 ${state.audioDroppedFrames}` : "";
  elements.audioStatus.textContent = `${codec} · level ${levelText}${ageStatusText}${playbackText}${droppedText}`;
  elements.audioPlaybackStatus.textContent = payload
    ? `${frame.encoding || "pcm"} · ${frame.sampleRate || 48000} Hz${ageStatusText}`
    : `接收 ${state.audioFrames} 帧 · ${frame.audioMode || "mock"}${ageStatusText}`;
  renderSessionDiagnostics();
}

function handleAudioFrame(frame) {
  state.audioFrames += 1;
  if (!state.firstAudioFrameMs && state.connectionStartedAt) {
    state.firstAudioFrameMs = performance.now() - state.connectionStartedAt;
  }
  state.audioLevel = Math.max(0, Math.min(1, Number(frame.level ?? frame.peak ?? 0)));
  const ageMs = calculateFrameAgeMs(frame.timestamp);
  state.lastAudioFrameAgeMs = ageMs;
  renderAudioFrameStatus(frame);
  if (!getAudioPayload(frame)) {
    return;
  }
  void playPcmAudioFrame(frame)
    .then((played) => {
      if (played) {
        renderAudioFrameStatus(frame);
      }
    })
    .catch((error) => {
      state.audioLastError = error?.message || String(error);
      elements.audioPlaybackStatus.textContent = `播放失败 · ${state.audioLastError}`;
      logEvent("声音播放失败", state.audioLastError);
    });
}

function makeClipboardId() {
  return `mac-client-clip-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 8)}`;
}

function updateTextClipboardButton() {
  const hasText = elements.clipboardTextInput.value.length > 0;
  elements.sendClipboardButton.disabled = !state.authenticated || !hasText;
}

function sendClipboardText({ source = "manual" } = {}) {
  if (!state.authenticated) {
    elements.clipboardStatus.textContent = "未连接";
    logEvent("剪贴板未发送", "请先连接 Windows host");
    return;
  }
  const text = elements.clipboardTextInput.value;
  if (!text) {
    elements.clipboardStatus.textContent = "内容为空";
    return;
  }
  const clipboardId = makeClipboardId();
  send({
    type: "clipboard_text",
    direction: "client_to_host",
    clipboardId,
    text,
    textLength: text.length,
    mode: "system",
  });
  elements.clipboardStatus.textContent = `已发送 ${text.length} 字`;
  logEvent(source === "watch" ? "监听剪贴板已发送" : "剪贴板已发送", `${text.length} 字`);
}

function handleClipboardAck(message) {
  const status = `${message.accepted ? "已写入" : "写入失败"} · ${message.mode || "unknown"} · ${message.textLength ?? 0} 字`;
  elements.clipboardStatus.textContent = status;
  logEvent(message.accepted ? "剪贴板确认" : "剪贴板失败", message.reason || status);
}

function clipboardApiAvailable() {
  return Boolean(navigator.clipboard?.readText);
}

async function readLocalClipboard({ silent = false } = {}) {
  if (!clipboardApiAvailable()) {
    elements.localClipboardStatus.textContent = "当前浏览器不支持读取剪贴板";
    if (!silent) {
      logEvent("读取 Mac 剪贴板失败", "浏览器不支持 Clipboard API");
    }
    return null;
  }
  if (state.clipboardReadInFlight) {
    return null;
  }

  state.clipboardReadInFlight = true;
  try {
    const text = await navigator.clipboard.readText();
    if (!text) {
      elements.localClipboardStatus.textContent = "Mac 剪贴板为空";
      return "";
    }
    elements.clipboardTextInput.value = text;
    updateTextClipboardButton();
    elements.localClipboardStatus.textContent = `已读取 ${text.length} 字`;
    if (!silent) {
      logEvent("已读取 Mac 剪贴板", `${text.length} 字`);
    }
    return text;
  } catch (error) {
    const message = error?.message || "读取权限被拒绝";
    elements.localClipboardStatus.textContent = "读取失败";
    if (!silent) {
      logEvent("读取 Mac 剪贴板失败", message);
    }
    return null;
  } finally {
    state.clipboardReadInFlight = false;
  }
}

async function readLocalClipboardIntoTextArea() {
  const text = await readLocalClipboard();
  if (text) {
    state.lastLocalClipboardText = text;
  }
}

async function pollLocalClipboard() {
  const text = await readLocalClipboard({ silent: true });
  if (text === null || text === "") {
    return;
  }
  if (text === state.lastLocalClipboardText) {
    elements.localClipboardStatus.textContent = `监听中 · ${text.length} 字`;
    return;
  }
  state.lastLocalClipboardText = text;
  if (!state.authenticated) {
    elements.localClipboardStatus.textContent = "监听到变化 · 未连接";
    logEvent("监听到 Mac 剪贴板变化", "请先连接 Windows host");
    return;
  }
  elements.localClipboardStatus.textContent = `监听发送 ${text.length} 字`;
  sendClipboardText({ source: "watch" });
}

async function startClipboardWatch() {
  if (!clipboardApiAvailable()) {
    elements.clipboardWatchToggle.checked = false;
    elements.localClipboardStatus.textContent = "当前浏览器不支持读取剪贴板";
    logEvent("剪贴板监听未开启", "浏览器不支持 Clipboard API");
    return;
  }
  const initialText = await readLocalClipboard({ silent: true });
  state.lastLocalClipboardText = initialText || elements.clipboardTextInput.value || "";
  if (state.clipboardWatchTimer) {
    window.clearInterval(state.clipboardWatchTimer);
  }
  state.clipboardWatchTimer = window.setInterval(() => {
    void pollLocalClipboard();
  }, clipboardWatchIntervalMs);
  elements.localClipboardStatus.textContent = "监听中 · 仅文本";
  logEvent("Mac 剪贴板监听已开启", "只监听文本变化，默认不会读取文件");
}

function stopClipboardWatch(status = "监听已关闭") {
  if (state.clipboardWatchTimer) {
    window.clearInterval(state.clipboardWatchTimer);
  }
  state.clipboardWatchTimer = null;
  if (elements.clipboardWatchToggle.checked) {
    elements.clipboardWatchToggle.checked = false;
  }
  elements.localClipboardStatus.textContent = status;
}

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function makeFileTransferId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `mac-client-file-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 8)}`;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    const chunk = bytes.subarray(offset, offset + 0x8000);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function yieldToUi() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function selectedClipboardFiles() {
  const files = Array.from(elements.clipboardFileInput.files ?? []);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return { files, totalBytes, tooLarge: totalBytes > maxClipboardFileBytes };
}

function updateFileClipboardButton() {
  const { files, tooLarge } = selectedClipboardFiles();
  elements.sendClipboardFilesButton.disabled = state.fileTransferActive || !state.authenticated || files.length === 0 || tooLarge;
}

function throwIfFileTransferCanceled(signal) {
  if (signal?.aborted || !state.authenticated) {
    throw new DOMException("File transfer canceled", "AbortError");
  }
}

function cancelActiveFileTransfer(status = "文件发送已取消") {
  if (!state.fileTransferActive && !state.fileTransferAbortController) {
    return;
  }
  state.fileTransferAbortController?.abort();
  state.fileTransferId = "";
  state.fileTransferAbortController = null;
  state.fileTransferActive = false;
  state.fileTransfers.clear();
  elements.fileClipboardStatus.textContent = status;
  updateFileClipboardButton();
}

function isCurrentFileTransferMessage(message) {
  const transferId = String(message.transferId || "");
  return transferId && state.fileTransfers.has(transferId);
}

async function sendClipboardFiles() {
  if (!state.authenticated) {
    elements.fileClipboardStatus.textContent = "未连接";
    logEvent("文件剪贴板未发送", "请先连接 Windows host");
    return;
  }

  const { files, totalBytes } = selectedClipboardFiles();
  if (files.length === 0) {
    elements.fileClipboardStatus.textContent = "未选择";
    return;
  }

  if (totalBytes > maxClipboardFileBytes) {
    const detail = `${formatBytes(totalBytes)} 超过上限 ${formatBytes(maxClipboardFileBytes)}`;
    elements.fileClipboardStatus.textContent = "文件过大";
    logEvent("文件剪贴板过大", detail);
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
  const abortController = new AbortController();
  state.fileTransferActive = true;
  state.fileTransferId = transferId;
  state.fileTransferAbortController = abortController;
  state.fileTransfers.set(transferId, { fileCount: files.length, totalBytes, sentBytes: 0 });
  updateFileClipboardButton();
  elements.fileClipboardStatus.textContent = `准备发送 ${files.length} 个`;

  try {
    send({
      type: "clipboard_file_offer",
      transferId,
      direction: "client_to_host",
      totalBytes,
      fileCount: files.length,
      maxChunkBytes: fileChunkSizeBytes,
      files: fileMetas,
    });
    logEvent("文件剪贴板", `开始发送 ${files.length} 个文件 · ${formatBytes(totalBytes)}`);

    for (const [fileIndex, file] of files.entries()) {
      throwIfFileTransferCanceled(abortController.signal);
      let chunkIndex = 0;
      if (file.size === 0) {
        throwIfFileTransferCanceled(abortController.signal);
        send({
          type: "clipboard_file_chunk",
          transferId,
          fileIndex,
          fileName: file.name,
          chunkIndex,
          offset: 0,
          bytes: 0,
          sentBytes,
          totalBytes,
          encoding: "base64",
          dataBase64: "",
        });
        elements.fileClipboardStatus.textContent = "发送空文件";
      }
      for (let offset = 0; offset < file.size; offset += fileChunkSizeBytes) {
        throwIfFileTransferCanceled(abortController.signal);
        const chunk = file.slice(offset, Math.min(offset + fileChunkSizeBytes, file.size));
        const dataBase64 = arrayBufferToBase64(await chunk.arrayBuffer());
        throwIfFileTransferCanceled(abortController.signal);
        const nextSentBytes = sentBytes + chunk.size;
        send({
          type: "clipboard_file_chunk",
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
        state.fileTransfers.set(transferId, { fileCount: files.length, totalBytes, sentBytes });
        const percent = totalBytes === 0 ? 100 : Math.round((sentBytes / totalBytes) * 100);
        elements.fileClipboardStatus.textContent = `发送 ${percent}%`;
        if (chunkIndex % 8 === 0) {
          await yieldToUi();
        }
      }
    }

    throwIfFileTransferCanceled(abortController.signal);
    send({
      type: "clipboard_file_complete",
      transferId,
      totalBytes,
      fileCount: files.length,
    });
    elements.fileClipboardStatus.textContent = `已发送 ${formatBytes(sentBytes)}`;
    logEvent("文件剪贴板", `文件块发送完成，等待确认 · ${transferId}`);
  } catch (error) {
    if (error?.name === "AbortError") {
      logEvent("文件剪贴板取消", elements.fileClipboardStatus.textContent || "文件发送已取消");
      return;
    }
    const message = error?.message || "文件发送失败";
    elements.fileClipboardStatus.textContent = "发送失败";
    logEvent("文件剪贴板失败", message);
  } finally {
    if (state.fileTransferAbortController === abortController) {
      state.fileTransferAbortController = null;
      state.fileTransferId = "";
      state.fileTransferActive = false;
    }
    if (!state.fileTransferActive) {
      elements.clipboardFileInput.value = "";
    }
    updateFileClipboardButton();
  }
}

function handleClipboardFileResponse(message) {
  if (!isCurrentFileTransferMessage(message)) {
    return;
  }
  if (!message.accepted) {
    elements.fileClipboardStatus.textContent = "对端拒绝";
    logEvent("文件剪贴板拒绝", message.reason || message.code || "unknown");
    state.fileTransfers.delete(message.transferId);
    if (state.fileTransferActive && message.transferId === state.fileTransferId) {
      cancelActiveFileTransfer("对端拒绝，文件发送已取消");
    }
    return;
  }
  const chunkText = message.maxChunkBytes ? ` · 块 ${formatBytes(message.maxChunkBytes)}` : "";
  elements.fileClipboardStatus.textContent = `对端准备 · ${message.saveMode || "unknown"}${chunkText}`;
}

function handleClipboardFileProgress(message) {
  if (!isCurrentFileTransferMessage(message)) {
    return;
  }
  const receivedBytes = Number(message.receivedBytes) || 0;
  const totalBytes = Number(message.totalBytes) || 0;
  const percent = totalBytes === 0 ? 100 : Math.round((receivedBytes / totalBytes) * 100);
  elements.fileClipboardStatus.textContent = `对端接收 ${percent}%`;
}

function handleClipboardFileResult(message) {
  if (!isCurrentFileTransferMessage(message)) {
    return;
  }
  const totalBytes = Number(message.totalBytes) || 0;
  const receivedBytes = Number(message.receivedBytes) || 0;
  const status = message.accepted
    ? `已写入 · ${message.saveMode || "unknown"} · ${formatBytes(receivedBytes || totalBytes)}`
    : `失败 · ${message.saveMode || "unknown"}`;
  elements.fileClipboardStatus.textContent = status;
  logEvent(message.accepted ? "文件剪贴板确认" : "文件剪贴板失败", message.reason || status);
  state.fileTransfers.delete(message.transferId);
}

elements.discoverButton.addEventListener("click", () => {
  void discover().catch(() => {});
});

elements.connectButton.addEventListener("click", () => {
  void connect();
});

elements.reconnectNowButton.addEventListener("click", reconnectNow);
elements.disconnectButton.addEventListener("click", disconnect);
elements.hostInput.addEventListener("input", () => resetEndpointDiscoveryState());
elements.portInput.addEventListener("input", () => resetEndpointDiscoveryState());
elements.useRecentConnectionButton.addEventListener("click", applySelectedRecentConnection);
elements.recentConnectionSelect.addEventListener("change", applySelectedRecentConnection);
elements.clearRecentConnectionsButton.addEventListener("click", clearRecentConnections);
elements.qualityPresetSelect.addEventListener("change", applyQualityPreset);
elements.resolutionSelect.addEventListener("change", markCustomVideoSettings);
elements.fpsSelect.addEventListener("change", markCustomVideoSettings);
elements.bandwidthSelect.addEventListener("change", markCustomVideoSettings);
elements.focusButton.addEventListener("click", () => elements.remoteViewport.focus());
elements.exportLogButton.addEventListener("click", exportLogs);
elements.clearLogButton.addEventListener("click", () => {
  elements.eventLog.textContent = "";
  state.logEntries = [];
});
elements.audioToggle.addEventListener("change", () => {
  resetAudioStatus();
  if (elements.audioToggle.checked) {
    primeAudioPlayback();
  } else {
    resetAudioPlayback();
  }
  sendAudioSettings();
});
elements.audioVolumeRange.addEventListener("input", () => {
  updateAudioVolumeLabel();
  sendAudioSettings();
});
elements.readClipboardButton.addEventListener("click", () => {
  void readLocalClipboardIntoTextArea();
});
elements.clipboardTextInput.addEventListener("input", updateTextClipboardButton);
elements.sendClipboardButton.addEventListener("click", () => sendClipboardText());
elements.clipboardWatchToggle.addEventListener("change", () => {
  if (elements.clipboardWatchToggle.checked) {
    void startClipboardWatch();
  } else {
    stopClipboardWatch();
  }
});
elements.sendClipboardFilesButton.addEventListener("click", () => {
  void sendClipboardFiles();
});
elements.clipboardFileInput.addEventListener("change", () => {
  const { files, totalBytes, tooLarge } = selectedClipboardFiles();
  elements.fileClipboardStatus.textContent = files.length
    ? tooLarge
      ? `文件过大 · ${formatBytes(totalBytes)} / 上限 ${formatBytes(maxClipboardFileBytes)}`
      : `${files.length} 个 · ${formatBytes(totalBytes)}`
    : "未选择";
  updateFileClipboardButton();
});

elements.remoteViewport.addEventListener("pointerdown", (event) => {
  elements.remoteViewport.focus();
  event.preventDefault();
  sendPointerEvent("mouse_button", event, {
    action: "down",
    button: buttonName(event.button),
  });
});

elements.remoteViewport.addEventListener("pointerup", (event) => {
  event.preventDefault();
  sendPointerEvent("mouse_button", event, {
    action: "up",
    button: buttonName(event.button),
  });
});

elements.remoteViewport.addEventListener("pointermove", (event) => {
  const now = performance.now();
  if (now - state.lastPointerSentAt < 33) return;
  state.lastPointerSentAt = now;
  sendPointerEvent("mouse_move", event, { action: "move" });
});

elements.remoteViewport.addEventListener("wheel", (event) => {
  event.preventDefault();
  sendPointerEvent("mouse_wheel", event, {
    action: "wheel",
    deltaX: Math.round(event.deltaX),
    deltaY: Math.round(event.deltaY),
  });
}, { passive: false });

elements.remoteViewport.addEventListener("keydown", (event) => {
  if (!state.authenticated) return;
  event.preventDefault();
  sendKeyboardEvent(event);
});

updateAudioVolumeLabel();
updateDisplaySettingsStatus();
initializeRecentConnections();
updateTextClipboardButton();
updateFileClipboardButton();
renderSessionDiagnostics();
logEvent("Mac 控制端已就绪", "默认连接 127.0.0.1:43772，可改为 Windows 局域网 IP:43770");
