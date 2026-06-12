const elements = {
  hostInput: document.querySelector("#hostInput"),
  portInput: document.querySelector("#portInput"),
  passwordInput: document.querySelector("#passwordInput"),
  discoverButton: document.querySelector("#discoverButton"),
  connectButton: document.querySelector("#connectButton"),
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
  inputStatus: document.querySelector("#inputStatus"),
  remoteViewport: document.querySelector("#remoteViewport"),
  remoteImage: document.querySelector("#remoteImage"),
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
  connectionStartedAt: 0,
  firstVideoFrameMs: 0,
  firstAudioFrameMs: 0,
  lastVideoFrameAt: 0,
  maxVideoGapMs: 0,
  lastVideoFps: 0,
  lastVideoCodec: "",
  reconnectTotal: 0,
  fileTransferActive: false,
  fileTransfers: new Map(),
  closeStatusOverride: "",
  manualDisconnect: false,
  reconnectAttempts: 0,
  reconnectTimer: null,
  reconnectStableTimer: null,
  clipboardWatchTimer: null,
  clipboardReadInFlight: false,
  lastLocalClipboardText: "",
  recentConnections: [],
};

const recentConnectionsStorageKey = "lanDualMacClientRecentConnections";
const maxRecentConnections = 8;
const fileChunkSizeBytes = 64 * 1024;
const maxClipboardFileBytes = 32 * 1024 * 1024;
const clipboardWatchIntervalMs = 1200;
const maxReconnectAttempts = 3;
const reconnectBaseDelayMs = 1200;
const reconnectStableMs = 10000;
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
  const item = document.createElement("li");
  const strong = document.createElement("strong");
  strong.textContent = title;
  item.append(strong);
  if (detail) {
    item.append(` · ${detail}`);
  }
  const time = document.createElement("span");
  time.textContent = nowText();
  item.append(" ", time);
  elements.eventLog.prepend(item);
  while (elements.eventLog.children.length > 80) {
    elements.eventLog.lastElementChild?.remove();
  }
}

function setConnectionStatus(text) {
  elements.connectionStatus.textContent = text;
}

function setConnected(connected) {
  state.connected = connected;
  elements.connectButton.disabled = connected;
  elements.disconnectButton.disabled = !connected;
  setConnectionStatus(connected ? "已连接" : "未连接");
  renderSessionDiagnostics();
}

function formatMs(value) {
  return `${Math.max(0, Math.round(value))} ms`;
}

function resetSessionDiagnostics({ resetReconnects = false } = {}) {
  state.connectionStartedAt = performance.now();
  state.firstVideoFrameMs = 0;
  state.firstAudioFrameMs = 0;
  state.lastVideoFrameAt = 0;
  state.maxVideoGapMs = 0;
  state.lastVideoFps = 0;
  state.lastVideoCodec = "";
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
    elements.videoFlowMetric.textContent = `${state.lastVideoCodec || "video"} · #${state.frameCount}${fpsText} · gap max ${formatMs(state.maxVideoGapMs)}`;
  } else {
    elements.videoFlowMetric.textContent = state.connected ? "等待视频" : "未接收";
  }

  if (state.audioFrames > 0) {
    const firstAudioText = state.firstAudioFrameMs > 0 ? `首帧 ${formatMs(state.firstAudioFrameMs)} · ` : "";
    const droppedText = state.audioDroppedFrames > 0 ? ` · 丢 ${state.audioDroppedFrames}` : "";
    elements.audioFlowMetric.textContent = `${firstAudioText}接收 ${state.audioFrames} · 播放 ${state.audioPlayedFrames}${droppedText}`;
  } else {
    elements.audioFlowMetric.textContent = elements.audioToggle.checked ? "等待音频" : "未开启";
  }

  elements.reconnectMetric.textContent = state.reconnectTotal > 0
    ? `已尝试 ${state.reconnectTotal} 次 · 当前 ${state.reconnectAttempts}/${maxReconnectAttempts}`
    : "0 次";
}

function resetVideoSurface(status = "无画面") {
  elements.remoteImage.removeAttribute("src");
  elements.remoteImage.classList.remove("is-visible");
  elements.emptyState.classList.remove("is-hidden");
  elements.videoStatus.textContent = status;
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

async function discover() {
  const url = `${targetBaseUrl()}/discovery`;
  elements.remoteStatus.textContent = "发现中";
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    elements.remoteStatus.textContent = `${payload.deviceName || payload.hostName || "Windows"} · ${payload.platform || "unknown"}`;
    logEvent("发现成功", `${payload.host || elements.hostInput.value}:${payload.port || elements.portInput.value}`);
    return payload;
  } catch (error) {
    elements.remoteStatus.textContent = "发现失败";
    logEvent("发现失败", error.message);
    throw error;
  }
}

async function connect({ reconnect = false } = {}) {
  if (!reconnect) {
    state.manualDisconnect = false;
    state.reconnectAttempts = 0;
    clearReconnectTimers();
    closeSocketSilently();
    state.authenticated = false;
    resetSessionDiagnostics({ resetReconnects: true });
    stopClipboardWatch("正在重新连接，监听已停止");
    resetAudioPlayback();
  } else {
    resetSessionDiagnostics();
  }
  setConnectionStatus("连接中");
  resetVideoSurface("等待视频");
  primeAudioPlayback();
  try {
    await discover();
  } catch {
    // Discovery is helpful but not mandatory for direct WebSocket testing.
  }

  const endpoint = targetWsUrl();
  const socket = new WebSocket(endpoint);
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
    handleMessage(event.data);
  });
  socket.addEventListener("close", () => {
    if (socket !== state.socket) return;
    const closeStatusOverride = state.closeStatusOverride;
    state.socket = null;
    setConnected(false);
    state.closeStatusOverride = "";
    state.authenticated = false;
    stopClipboardWatch("连接关闭，监听已停止");
    resetAudioPlayback();
    resetVideoSurface(closeStatusOverride ? "无画面" : "连接中断");
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
  const delayMs = reconnectBaseDelayMs * state.reconnectAttempts;
  setConnectionStatus(`连接中断，${Math.round(delayMs / 1000)} 秒后自动重连（${state.reconnectAttempts}/${maxReconnectAttempts}）`);
  elements.connectButton.disabled = true;
  elements.disconnectButton.disabled = false;
  renderSessionDiagnostics();
  logEvent("自动重连", `${reason} · 第 ${state.reconnectAttempts}/${maxReconnectAttempts} 次`);

  state.reconnectTimer = window.setTimeout(() => {
    state.reconnectTimer = null;
    void connect({ reconnect: true });
  }, delayMs);
}

function disconnect() {
  state.manualDisconnect = true;
  clearReconnectTimers();
  state.closeStatusOverride = "";
  closeSocketSilently();
  state.authenticated = false;
  stopClipboardWatch("已断开，监听已停止");
  resetAudioPlayback();
  resetSessionDiagnostics({ resetReconnects: true });
  resetVideoSurface();
  setConnected(false);
  renderSessionDiagnostics();
}

function handleMessage(rawData) {
  let message;
  try {
    message = JSON.parse(rawData);
  } catch {
    logEvent("收到无法解析的消息");
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
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    state.socket.close(1000, "auth failed");
    return;
  }
  setConnected(false);
  setConnectionStatus(status);
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
  markConnectionStableLater();
  logEvent("认证通过");
  send({
    ...makeDisplaySettingsMessage("session_offer"),
    protocolVersion: 1,
    wantVideo: true,
    wantAudio: elements.audioToggle.checked,
    wantClipboardText: true,
    wantClipboardFile: true,
    preferredVideoCodec: "mjpeg",
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
  elements.displaySettingsStatus.textContent = `${message.accepted === false ? "未接受" : "已确认"} ${describeVideoSettings(acknowledged)}`;
  logEvent("显示设置已确认", `${message.videoCodec || "?"} · ${message.fps || "?"} Hz`);
}

function handleVideoFrame(frame) {
  if (frame.dataUrl) {
    elements.remoteImage.src = frame.dataUrl;
    elements.remoteImage.classList.add("is-visible");
    elements.emptyState.classList.add("is-hidden");
  }
  state.remoteWidth = Number(frame.width || state.remoteWidth);
  state.remoteHeight = Number(frame.height || state.remoteHeight);
  state.frameCount += 1;
  state.frameWindowCount += 1;
  const now = performance.now();
  if (!state.firstVideoFrameMs && state.connectionStartedAt) {
    state.firstVideoFrameMs = now - state.connectionStartedAt;
  }
  if (state.lastVideoFrameAt) {
    state.maxVideoGapMs = Math.max(state.maxVideoGapMs, now - state.lastVideoFrameAt);
  }
  state.lastVideoFrameAt = now;
  state.lastVideoCodec = frame.codec || "jpeg";
  if (!state.frameWindowStartedAt) {
    state.frameWindowStartedAt = now;
  }
  const elapsed = now - state.frameWindowStartedAt;
  if (elapsed >= 1000) {
    const fps = (state.frameWindowCount * 1000) / elapsed;
    state.lastVideoFps = fps;
    elements.videoStatus.textContent = `${frame.codec || "jpeg"} · #${frame.frameId || state.frameCount} · ${fps.toFixed(1)} fps`;
    state.frameWindowCount = 0;
    state.frameWindowStartedAt = now;
  } else {
    elements.videoStatus.textContent = `${frame.codec || "jpeg"} · #${frame.frameId || state.frameCount}`;
  }
  renderSessionDiagnostics();
}

function imagePointFromEvent(event) {
  const rect = elements.remoteImage.getBoundingClientRect();
  if (!rect.width || !rect.height || !elements.remoteImage.classList.contains("is-visible")) {
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
  state.firstAudioFrameMs = 0;
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
  const playbackText = state.audioPlayedFrames > 0
    ? ` · 播放 ${state.audioPlayedFrames}`
    : payload
      ? elements.audioToggle.checked ? " · 等待播放" : " · 未播放"
      : "";
  const droppedText = state.audioDroppedFrames > 0 ? ` · 丢 ${state.audioDroppedFrames}` : "";
  elements.audioStatus.textContent = `${codec} · level ${levelText}${playbackText}${droppedText}`;
  elements.audioPlaybackStatus.textContent = payload
    ? `${frame.encoding || "pcm"} · ${frame.sampleRate || 48000} Hz`
    : `接收 ${state.audioFrames} 帧 · ${frame.audioMode || "mock"}`;
  renderSessionDiagnostics();
}

function handleAudioFrame(frame) {
  state.audioFrames += 1;
  if (!state.firstAudioFrameMs && state.connectionStartedAt) {
    state.firstAudioFrameMs = performance.now() - state.connectionStartedAt;
  }
  state.audioLevel = Math.max(0, Math.min(1, Number(frame.level ?? frame.peak ?? 0)));
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

function updateFileClipboardButton() {
  elements.sendClipboardFilesButton.disabled = state.fileTransferActive;
}

async function sendClipboardFiles() {
  if (!state.authenticated) {
    elements.fileClipboardStatus.textContent = "未连接";
    logEvent("文件剪贴板未发送", "请先连接 Windows host");
    return;
  }

  const files = Array.from(elements.clipboardFileInput.files ?? []);
  if (files.length === 0) {
    elements.fileClipboardStatus.textContent = "未选择";
    return;
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
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
  state.fileTransferActive = true;
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
      let chunkIndex = 0;
      if (file.size === 0) {
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
        const chunk = file.slice(offset, Math.min(offset + fileChunkSizeBytes, file.size));
        const dataBase64 = arrayBufferToBase64(await chunk.arrayBuffer());
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

    send({
      type: "clipboard_file_complete",
      transferId,
      totalBytes,
      fileCount: files.length,
    });
    elements.fileClipboardStatus.textContent = `已发送 ${formatBytes(sentBytes)}`;
    logEvent("文件剪贴板", `文件块发送完成，等待确认 · ${transferId}`);
  } catch (error) {
    const message = error?.message || "文件发送失败";
    elements.fileClipboardStatus.textContent = "发送失败";
    logEvent("文件剪贴板失败", message);
  } finally {
    state.fileTransferActive = false;
    elements.clipboardFileInput.value = "";
    updateFileClipboardButton();
  }
}

function handleClipboardFileResponse(message) {
  if (!message.accepted) {
    elements.fileClipboardStatus.textContent = "对端拒绝";
    logEvent("文件剪贴板拒绝", message.reason || message.code || "unknown");
    state.fileTransfers.delete(message.transferId);
    return;
  }
  const chunkText = message.maxChunkBytes ? ` · 块 ${formatBytes(message.maxChunkBytes)}` : "";
  elements.fileClipboardStatus.textContent = `对端准备 · ${message.saveMode || "unknown"}${chunkText}`;
}

function handleClipboardFileProgress(message) {
  const receivedBytes = Number(message.receivedBytes) || 0;
  const totalBytes = Number(message.totalBytes) || 0;
  const percent = totalBytes === 0 ? 100 : Math.round((receivedBytes / totalBytes) * 100);
  elements.fileClipboardStatus.textContent = `对端接收 ${percent}%`;
}

function handleClipboardFileResult(message) {
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
  void discover();
});

elements.connectButton.addEventListener("click", () => {
  void connect();
});

elements.disconnectButton.addEventListener("click", disconnect);
elements.useRecentConnectionButton.addEventListener("click", applySelectedRecentConnection);
elements.recentConnectionSelect.addEventListener("change", applySelectedRecentConnection);
elements.clearRecentConnectionsButton.addEventListener("click", clearRecentConnections);
elements.qualityPresetSelect.addEventListener("change", applyQualityPreset);
elements.resolutionSelect.addEventListener("change", markCustomVideoSettings);
elements.fpsSelect.addEventListener("change", markCustomVideoSettings);
elements.bandwidthSelect.addEventListener("change", markCustomVideoSettings);
elements.focusButton.addEventListener("click", () => elements.remoteViewport.focus());
elements.clearLogButton.addEventListener("click", () => {
  elements.eventLog.textContent = "";
});
elements.audioToggle.addEventListener("change", () => {
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
  const files = Array.from(elements.clipboardFileInput.files ?? []);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  elements.fileClipboardStatus.textContent = files.length
    ? `${files.length} 个 · ${formatBytes(totalBytes)}`
    : "未选择";
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
renderSessionDiagnostics();
logEvent("Mac 控制端已就绪", "默认连接 127.0.0.1:43772，可改为 Windows 局域网 IP:43770");
