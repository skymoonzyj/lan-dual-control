const { LocalMockTransport, ProtocolClient, WebSocketTransport, protocolVersion } =
  window.LanDualProtocol;

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
  statusText: document.querySelector("#statusText"),
  inputText: document.querySelector("#inputText"),
  clipboardText: document.querySelector("#clipboardText"),
  resolutionSelect: document.querySelector("#resolutionSelect"),
  displaySelect: document.querySelector("#displaySelect"),
  fpsSelect: document.querySelector("#fpsSelect"),
  bandwidthSelect: document.querySelector("#bandwidthSelect"),
  scaleModeSelect: document.querySelector("#scaleModeSelect"),
  audioToggle: document.querySelector("#audioToggle"),
  clipboardToggle: document.querySelector("#clipboardToggle"),
  fileClipboardButton: document.querySelector("#fileClipboardButton"),
  fileClipboardInput: document.querySelector("#fileClipboardInput"),
  directionIndicator: document.querySelector("#directionIndicator"),
  directionText: document.querySelector("#directionText"),
  reverseStateText: document.querySelector("#reverseStateText"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  windowModeButton: document.querySelector("#windowModeButton"),
  reverseButton: document.querySelector("#reverseButton"),
  reverseButtonText: document.querySelector("#reverseButtonText"),
  cursorDot: document.querySelector("#cursorDot"),
  remoteFrameImage: document.querySelector("#remoteFrameImage"),
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
  LAN007: "视频流中断，请检查局域网连接或降低刷新率/带宽。",
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
  audioFrames: 0,
  audioLevel: 0,
  recentConnections: [],
  connectionState: "idle",
  remoteDisplays: fallbackDisplays,
  activeDisplayId: "main",
  remoteFrameWidth: 1920,
  remoteFrameHeight: 1080,
  manualDisconnect: false,
  reconnectAttempts: 0,
  reconnectTimer: null,
  reconnectStableTimer: null,
  clipboardSequence: 0,
  fileTransferSequence: 0,
  fileTransferActive: false,
  controlDirection: "windows_to_mac",
  pendingControlDirection: "",
  reverseRequestId: "",
  reverseRequestTimer: null,
  reverseStateDetail: "你当前是控制方",
  logEntries: [],
  discoveredDevices: fallbackDevices,
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
    resolution: elements.resolutionSelect.value,
    displayId: elements.displaySelect.value,
    fps: elements.fpsSelect.value,
    bandwidth: elements.bandwidthSelect.value,
    scaleMode: elements.scaleModeSelect.value,
    audio: elements.audioToggle.checked,
    audioVolume: elements.audioVolumeRange.value,
    clipboard: elements.clipboardToggle.checked,
    recentConnections: state.recentConnections,
  };
}

function savePreferences() {
  writePreferences(collectPreferences());
}

function applyPreferences() {
  const preferences = readPreferences();

  if (preferences.transport) elements.transportSelect.value = preferences.transport;
  if (preferences.host) elements.hostInput.value = preferences.host;
  if (preferences.port) elements.portInput.value = preferences.port;
  if (preferences.mockScenario) elements.mockScenarioSelect.value = preferences.mockScenario;
  if (preferences.resolution) elements.resolutionSelect.value = preferences.resolution;
  if (preferences.displayId) state.activeDisplayId = preferences.displayId;
  if (preferences.fps) elements.fpsSelect.value = preferences.fps;
  if (preferences.bandwidth) elements.bandwidthSelect.value = preferences.bandwidth;
  if (preferences.scaleMode) elements.scaleModeSelect.value = preferences.scaleMode;
  if (typeof preferences.audio === "boolean") elements.audioToggle.checked = preferences.audio;
  if (preferences.audioVolume) elements.audioVolumeRange.value = preferences.audioVolume;
  if (typeof preferences.clipboard === "boolean") {
    elements.clipboardToggle.checked = preferences.clipboard;
  }

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
  resetReverseControlState();
  setConnectionState("connecting", `正在连接 ${host}:${port}`);
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
  elements.remoteCanvas.focus();
  startLatencyLoop();

  if (answer.width && answer.height) {
    elements.metricResolution.textContent = `${answer.width} × ${answer.height}`;
  }
  if (answer.fps) {
    elements.metricFps.textContent = `${answer.fps} FPS`;
  }
  if (answer.maxBandwidthKbps) {
    elements.metricBandwidth.textContent = `${Math.round(answer.maxBandwidthKbps / 1000)} Mbps`;
  }
  if (answer.audioEnabled) {
    elements.audioText.textContent = `声音：已协商 · ${answer.audioCodec ?? "opus"}`;
  } else if (elements.audioToggle.checked) {
    elements.audioText.textContent = "声音：对端暂未开启音频流";
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
  elements.metricLatency.textContent = "-- ms";
  state.audioFrames = 0;
  state.audioLevel = 0;
  elements.audioText.textContent = "声音：待机";
  elements.connectButton.disabled = false;
  elements.disconnectButton.disabled = true;
  elements.reverseButton.disabled = true;
  state.fileTransferActive = false;
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
  elements.metricLatency.textContent = "-- ms";
  state.audioFrames = 0;
  state.audioLevel = 0;
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
  elements.metricFps.textContent = `${settings.fps} FPS`;
  elements.metricBandwidth.textContent = `${elements.bandwidthSelect.value} Mbps`;
  elements.audioVolumeText.textContent = `${settings.audioVolume}%`;
  elements.audioText.textContent = settings.audio
    ? `声音：已开启 · ${settings.audioVolume}%`
    : "声音：已关闭";
  elements.clipboardText.textContent = `剪贴板：${settings.clipboard ? "已开启" : "已关闭"}`;
  updateFileClipboardButton();
}

function buildAudioSettingsMessage() {
  const settings = currentDisplaySettings();
  return {
    enabled: settings.audio,
    codec: "opus",
    sampleRate: 48000,
    channels: 2,
    volume: settings.audioVolume,
    muted: !settings.audio || settings.audioVolume === 0,
  };
}

function updateAudioStatusFromFrame(frame) {
  state.audioFrames += 1;
  state.audioLevel = Math.max(0, Math.min(1, Number(frame.level ?? frame.peak ?? 0)));
  const volume = Number(elements.audioVolumeRange.value);
  const levelText = `${Math.round(state.audioLevel * 100)}%`;
  const latencyText = frame.latencyMs ? ` · ${Math.round(frame.latencyMs)} ms` : "";
  elements.audioText.textContent = `声音：接收中 · ${levelText} · ${volume}%${latencyText}`;

  if (state.audioFrames === 1 || state.audioFrames % 20 === 0) {
    addLog(
      "声音帧",
      `${frame.codec ?? "mock"} · ${frame.sampleRate ?? 48000} Hz · level ${levelText}`,
    );
  }
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
  const connectionLabel =
    elements.transportSelect.value === "websocket" ? "WebSocket 局域网" : "本地模拟";
  const eventLines = state.logEntries
    .slice()
    .reverse()
    .map((entry, index) => {
      const detail = entry.detail ? ` | ${entry.detail}` : "";
      return `${String(index + 1).padStart(3, "0")} | ${entry.time} | ${entry.title}${detail}`;
    });

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
    "",
    "显示与能力",
    `- 显示模式：${settings.displayMode === "fullscreen" ? "全屏" : "窗口"}`,
    `- 显示器：${elements.displaySelect.selectedOptions[0]?.textContent ?? settings.displayId}`,
    `- 分辨率：${settings.resolutionMode === "native" ? "原生" : `${settings.width} × ${settings.height}`}`,
    `- 缩放：${elements.scaleModeSelect.selectedOptions[0]?.textContent ?? settings.scaleMode}`,
    `- 刷新率：${settings.fps} FPS`,
    `- 带宽：${Math.round(settings.maxBandwidthKbps / 1000)} Mbps`,
    `- 声音：${settings.audio ? `开启 · ${settings.audioVolume}%` : "关闭"}`,
    `- 剪贴板：${settings.clipboard ? "开启" : "关闭"}`,
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
    displayMode: settings.displayMode,
    displayId: settings.displayId,
    preferredWidth,
    preferredHeight,
    preferredVideoCodec: "mjpeg",
    preferredAudioCodec: "opus",
    audioVolume: settings.audioVolume,
    mockScenario: elements.mockScenarioSelect.value,
  };
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
    displayMode: settings.displayMode,
    displayId: settings.displayId,
    resolutionMode: settings.resolutionMode,
    fps: settings.fps,
    maxBandwidthKbps: settings.maxBandwidthKbps,
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
      `${answer.videoCodec} · ${answer.fps} FPS · ${Math.round(answer.maxBandwidthKbps / 1000)} Mbps`,
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
  return `${settings.displayMode === "fullscreen" ? "全屏" : "窗口"} · ${elements.metricResolution.textContent} · ${settings.fps} FPS · ${elements.bandwidthSelect.value} Mbps`;
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
  } else {
    elements.remoteFrameImage.style.removeProperty("width");
    elements.remoteFrameImage.style.removeProperty("height");
  }
}

function getDisplayedFrameRect() {
  const canvasRect = elements.remoteCanvas.getBoundingClientRect();
  const scrollLeft = elements.remoteCanvas.scrollLeft;
  const scrollTop = elements.remoteCanvas.scrollTop;
  const frameWidth = Math.max(1, state.remoteFrameWidth);
  const frameHeight = Math.max(1, state.remoteFrameHeight);
  const canvasWidth = Math.max(1, elements.remoteCanvas.clientWidth);
  const canvasHeight = Math.max(1, elements.remoteCanvas.clientHeight);
  const scaleMode = elements.scaleModeSelect.value;

  if (scaleMode === "stretch") {
    return {
      left: canvasRect.left,
      top: canvasRect.top,
      width: canvasWidth,
      height: canvasHeight,
    };
  }

  if (scaleMode === "original") {
    return {
      left: canvasRect.left - scrollLeft,
      top: canvasRect.top - scrollTop,
      width: frameWidth,
      height: frameHeight,
    };
  }

  const scale = Math.min(canvasWidth / frameWidth, canvasHeight / frameHeight);
  const width = frameWidth * scale;
  const height = frameHeight * scale;

  return {
    left: canvasRect.left + (canvasWidth - width) / 2,
    top: canvasRect.top + (canvasHeight - height) / 2,
    width,
    height,
  };
}

function mapPointerToRemote(event) {
  const frameRect = getDisplayedFrameRect();
  const x = (event.clientX - frameRect.left) / frameRect.width;
  const y = (event.clientY - frameRect.top) / frameRect.height;
  const normalizedX = Math.min(1, Math.max(0, x));
  const normalizedY = Math.min(1, Math.max(0, y));
  const remoteMaxX = Math.max(0, state.remoteFrameWidth - 1);
  const remoteMaxY = Math.max(0, state.remoteFrameHeight - 1);

  if (x < 0 || x > 1 || y < 0 || y > 1) {
    return null;
  }

  return {
    x: normalizedX,
    y: normalizedY,
    remoteX: Math.round(normalizedX * remoteMaxX),
    remoteY: Math.round(normalizedY * remoteMaxY),
    frameRect,
  };
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

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return window.btoa(binary);
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

async function writeLocalClipboardText(text) {
  if (!navigator.clipboard?.writeText) {
    throw new Error("当前环境不允许写入系统剪贴板");
  }
  await navigator.clipboard.writeText(text);
}

async function syncClipboardText() {
  if (!state.connected || !elements.clipboardToggle.checked) {
    return;
  }

  try {
    const text = await readLocalClipboardText();
    if (!text) {
      elements.clipboardText.textContent = "剪贴板：没有可同步的文字";
      addLog("剪贴板", "本机剪贴板没有文字内容");
      return;
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
  } catch (error) {
    const message = error?.message || "剪贴板读取失败";
    elements.clipboardText.textContent = "剪贴板：同步失败";
    addLog("剪贴板失败", message);
  }
}

async function sendClipboardFiles() {
  if (!state.connected || !state.client) {
    elements.clipboardText.textContent = "剪贴板：请先连接被控端";
    addLog("文件剪贴板", "未连接，无法发送文件");
    return;
  }

  if (!elements.clipboardToggle.checked) {
    elements.clipboardText.textContent = "剪贴板：已关闭";
    addLog("文件剪贴板", "剪贴板同步已关闭");
    return;
  }

  const files = Array.from(elements.fileClipboardInput.files ?? []);
  if (files.length === 0) {
    return;
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > maxClipboardFileBytes) {
    const message = `文件总大小 ${formatBytes(totalBytes)}，超过当前上限 ${formatBytes(maxClipboardFileBytes)}`;
    elements.clipboardText.textContent = "剪贴板：文件过大";
    addLog("文件剪贴板", message);
    elements.fileClipboardInput.value = "";
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
    addLog("文件剪贴板", `开始发送 ${files.length} 个文件，共 ${formatBytes(totalBytes)}`);

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
    addLog("文件剪贴板", `文件块发送完成，等待对端确认 · ${transferId}`);
  } catch (error) {
    const message = error?.message || "文件发送失败";
    elements.clipboardText.textContent = "剪贴板：文件发送失败";
    addLog("文件剪贴板失败", message);
  } finally {
    state.fileTransferActive = false;
    elements.fileClipboardInput.value = "";
    updateFileClipboardButton();
  }
}

function handleClipboardFileOffer(message) {
  const fileCount = Array.isArray(message.files) ? message.files.length : 0;
  addLog("文件剪贴板", `收到远端文件清单 ${fileCount} 个，当前先不落地保存`);
  state.client?.sendClipboardFileResponse({
    transferId: message.transferId,
    accepted: false,
    reason: "Windows 控制端接收文件到系统剪贴板需要桌面原生模块，后续接入。",
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
    updateAudioStatusFromFrame(message);
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
  if (!frame.dataUrl) {
    addLog("视频帧", "收到视频帧但缺少 dataUrl");
    return;
  }

  state.videoFrames += 1;
  if (frame.width && frame.height) {
    state.remoteFrameWidth = Number(frame.width);
    state.remoteFrameHeight = Number(frame.height);
  }
  applyScaleMode();
  elements.remoteFrameImage.src = frame.dataUrl;
  elements.remoteFrameImage.classList.add("is-visible");
  elements.remoteStatusText.textContent = `正在接收模拟视频帧 #${frame.frameId ?? state.videoFrames}`;

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
elements.connectButton.addEventListener("click", connect);
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

elements.resolutionSelect.addEventListener("change", sendDisplaySettings);
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
elements.fpsSelect.addEventListener("change", sendDisplaySettings);
elements.bandwidthSelect.addEventListener("change", sendDisplaySettings);
elements.audioToggle.addEventListener("change", () => {
  savePreferences();
  addLog("声音", elements.audioToggle.checked ? "已请求接收被控端声音" : "已关闭声音接收");
  sendDisplaySettings();
});
elements.audioVolumeRange.addEventListener("input", () => {
  elements.audioVolumeText.textContent = `${elements.audioVolumeRange.value}%`;
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

[elements.hostInput, elements.portInput].forEach((input) => {
  input.addEventListener("change", savePreferences);
});

elements.remoteCanvas.addEventListener("mousemove", updateCursor);
elements.remoteCanvas.addEventListener("mousedown", (event) => {
  if (!canSendControlInput()) return;
  const mapped = mapPointerToRemote(event);
  if (!mapped) return;
  registerInputEvent("鼠标按下", `button=${event.button} · ${mapped.remoteX},${mapped.remoteY}`, {
    pointerType: "mouse",
    action: "down",
    button: event.button,
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
    pointerType: "mouse",
    action: "up",
    button: event.button,
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
elements.remoteCanvas.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "v" && event.ctrlKey) {
    syncClipboardText();
  }
  if (!canSendControlInput()) return;
  registerInputEvent("键盘", `${event.ctrlKey ? "Ctrl+" : ""}${event.key}`, {
    action: "key",
    key: event.key,
    code: event.code,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
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
updateReverseControlUi();
addLog("控制端启动", "本地模拟模式，可切换 WebSocket");
