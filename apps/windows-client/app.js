const { LocalMockTransport, ProtocolClient, WebSocketTransport, protocolVersion } =
  window.LanDualProtocol;

const elements = {
  transportSelect: document.querySelector("#transportSelect"),
  hostInput: document.querySelector("#hostInput"),
  portInput: document.querySelector("#portInput"),
  passwordInput: document.querySelector("#passwordInput"),
  connectButton: document.querySelector("#connectButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  refreshDevicesButton: document.querySelector("#refreshDevicesButton"),
  clearLogButton: document.querySelector("#clearLogButton"),
  connectionBadge: document.querySelector("#connectionBadge"),
  eventLog: document.querySelector("#eventLog"),
  remoteCanvas: document.querySelector("#remoteCanvas"),
  remoteStatusText: document.querySelector("#remoteStatusText"),
  statusText: document.querySelector("#statusText"),
  inputText: document.querySelector("#inputText"),
  clipboardText: document.querySelector("#clipboardText"),
  resolutionSelect: document.querySelector("#resolutionSelect"),
  fpsSelect: document.querySelector("#fpsSelect"),
  bandwidthSelect: document.querySelector("#bandwidthSelect"),
  audioToggle: document.querySelector("#audioToggle"),
  clipboardToggle: document.querySelector("#clipboardToggle"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  windowModeButton: document.querySelector("#windowModeButton"),
  reverseButton: document.querySelector("#reverseButton"),
  cursorDot: document.querySelector("#cursorDot"),
  remoteFrameImage: document.querySelector("#remoteFrameImage"),
  metricResolution: document.querySelector("#metricResolution"),
  metricFps: document.querySelector("#metricFps"),
  metricBandwidth: document.querySelector("#metricBandwidth"),
  metricLatency: document.querySelector("#metricLatency"),
  clockText: document.querySelector("#clockText"),
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
};

function nowTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

function addLog(title, detail = "") {
  const item = document.createElement("li");
  item.innerHTML = `<strong>${title}</strong>${detail ? ` · ${detail}` : ""}<br><span>${nowTime()}</span>`;
  elements.eventLog.prepend(item);

  while (elements.eventLog.children.length > 24) {
    elements.eventLog.lastElementChild.remove();
  }
}

function setBadge(mode, text) {
  elements.connectionBadge.className = `status-badge ${mode}`;
  elements.connectionBadge.textContent = text;
}

function setUiConnecting(host, port) {
  state.connecting = true;
  state.connected = false;
  state.videoFrames = 0;
  setBadge("connecting", "连接中");
  elements.statusText.textContent = `正在连接 ${host}:${port}`;
  elements.remoteStatusText.textContent = "正在建立局域网会话...";
  elements.connectButton.disabled = true;
  elements.disconnectButton.disabled = false;
  elements.reverseButton.disabled = true;
}

function setUiConnected(answer) {
  state.connected = true;
  state.connecting = false;
  setBadge("online", "已连接");
  elements.statusText.textContent = `已连接 ${state.activeHost}:${state.activePort}`;
  elements.remoteStatusText.textContent = "远程画面通道已就绪，等待真实视频帧接入。";
  elements.connectButton.disabled = true;
  elements.disconnectButton.disabled = false;
  elements.reverseButton.disabled = false;
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
}

function setUiDisconnected(statusText = "未连接", logDetail = "会话已关闭") {
  state.connected = false;
  state.connecting = false;
  stopLatencyLoop();
  setBadge("offline", "未连接");
  elements.statusText.textContent = statusText;
  elements.remoteStatusText.textContent = "连接已断开。";
  elements.remoteFrameImage.removeAttribute("src");
  elements.remoteFrameImage.classList.remove("is-visible");
  elements.metricLatency.textContent = "-- ms";
  elements.connectButton.disabled = false;
  elements.disconnectButton.disabled = true;
  elements.reverseButton.disabled = true;
  addLog("断开连接", logDetail);
}

function currentDisplaySettings() {
  const resolutionValue = elements.resolutionSelect.value;
  const [width, height] =
    resolutionValue === "native" ? ["原生", ""] : resolutionValue.split("x");

  return {
    displayMode: state.fullscreen ? "fullscreen" : "windowed",
    resolutionMode: resolutionValue === "native" ? "native" : "fixed",
    width,
    height,
    fps: Number(elements.fpsSelect.value),
    maxBandwidthKbps: Number(elements.bandwidthSelect.value) * 1000,
    audio: elements.audioToggle.checked,
    clipboard: elements.clipboardToggle.checked,
  };
}

function updateMetrics() {
  const settings = currentDisplaySettings();
  elements.metricResolution.textContent =
    settings.resolutionMode === "native" ? "原生" : `${settings.width} × ${settings.height}`;
  elements.metricFps.textContent = `${settings.fps} FPS`;
  elements.metricBandwidth.textContent = `${elements.bandwidthSelect.value} Mbps`;
  elements.clipboardText.textContent = `剪贴板：${settings.clipboard ? "已开启" : "已关闭"}`;
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
    preferredWidth,
    preferredHeight,
    preferredVideoCodec: "mjpeg",
    preferredAudioCodec: "opus",
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
    resolutionMode: settings.resolutionMode,
    fps: settings.fps,
    maxBandwidthKbps: settings.maxBandwidthKbps,
    audio: settings.audio,
    clipboardText: settings.clipboard,
    clipboardFile: settings.clipboard,
    ...fixedResolution,
  };
}

function createTransport() {
  return elements.transportSelect.value === "websocket"
    ? new WebSocketTransport()
    : new LocalMockTransport();
}

async function connect() {
  const host = elements.hostInput.value.trim();
  const port = elements.portInput.value.trim();
  const password = elements.passwordInput.value;

  if (!host || !port || !password) {
    addLog("连接失败", "目标地址、端口和密码都要填写");
    return;
  }

  const transportLabel =
    elements.transportSelect.value === "websocket" ? "WebSocket 局域网" : "本地模拟";
  state.activeHost = host;
  state.activePort = port;
  setUiConnecting(host, port);
  addLog("开始连接", `${transportLabel} · ${host}:${port}`);

  const client = new ProtocolClient({
    transport: createTransport(),
    onMessage: handleProtocolMessage,
    onClose: () => {
      state.client = null;
      setUiDisconnected("连接已断开", "被控端关闭了连接");
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
    addLog(
      "连接成功",
      `${answer.videoCodec} · ${answer.fps} FPS · ${Math.round(answer.maxBandwidthKbps / 1000)} Mbps`,
    );
  } catch (error) {
    client.disconnect();
    state.client = null;
    setUiDisconnected("连接失败", error.message);
    elements.remoteStatusText.textContent = error.message;
    addLog("连接失败", error.message);
  }
}

function disconnect() {
  if (!state.connected && !state.connecting) {
    return;
  }

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

function sendDisplaySettings() {
  updateMetrics();
  if (!state.connected || !state.client) {
    return;
  }

  state.client.sendDisplaySettings(buildDisplaySettingsMessage());
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
  if (!state.connected) {
    return;
  }

  state.inputEvents += 1;
  elements.inputText.textContent = `输入事件：${state.inputEvents}`;

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
  const rect = elements.remoteCanvas.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  elements.cursorDot.style.left = `${x * 100}%`;
  elements.cursorDot.style.top = `${y * 100}%`;
  registerInputEvent("鼠标移动", `x=${x.toFixed(3)}, y=${y.toFixed(3)}`, {
    pointerType: "mouse",
    action: "move",
    x,
    y,
  });
}

function syncClipboardText() {
  if (!state.connected || !elements.clipboardToggle.checked) {
    return;
  }
  elements.clipboardText.textContent = "剪贴板：文字同步完成";
  if (state.client) {
    state.client.sendClipboardText("来自 Windows 控制端的测试文字");
  }
  addLog("剪贴板", "已发送文字同步请求");
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

  if (message.type === "clipboard_ack") {
    addLog("被控端确认", "剪贴板文字已接收");
    return;
  }

  if (message.type === "reverse_control_response") {
    addLog("一键反控", message.accepted ? "被控端已同意" : message.reason || "被控端暂未同意");
    return;
  }

  if (message.type === "error") {
    addLog("协议错误", message.message || "未知错误");
  }
}

function renderVideoFrame(frame) {
  if (!frame.dataUrl) {
    addLog("视频帧", "收到视频帧但缺少 dataUrl");
    return;
  }

  state.videoFrames += 1;
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

document.querySelectorAll(".device-row").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".device-row").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    elements.hostInput.value = button.dataset.host;
    addLog("选择设备", button.dataset.host);
  });
});

elements.transportSelect.addEventListener("change", () => {
  const isWebSocket = elements.transportSelect.value === "websocket";
  addLog("连接方式", isWebSocket ? "WebSocket 局域网" : "本地模拟");
});
elements.connectButton.addEventListener("click", connect);
elements.disconnectButton.addEventListener("click", disconnect);
elements.refreshDevicesButton.addEventListener("click", () =>
  addLog("刷新设备", "发现 3 台模拟设备"),
);
elements.clearLogButton.addEventListener("click", () => {
  elements.eventLog.innerHTML = "";
  addLog("日志", "已清空");
});

elements.fullscreenButton.addEventListener("click", () => setFullscreen(true));
elements.windowModeButton.addEventListener("click", () => setFullscreen(false));
elements.reverseButton.addEventListener("click", () => {
  if (state.client) {
    state.client.requestReverseControl();
  }
  addLog("一键反控", "已发送反控请求，等待 Mac 确认");
});

elements.resolutionSelect.addEventListener("change", sendDisplaySettings);
elements.fpsSelect.addEventListener("change", sendDisplaySettings);
elements.bandwidthSelect.addEventListener("change", sendDisplaySettings);
elements.audioToggle.addEventListener("change", () => {
  addLog("声音", elements.audioToggle.checked ? "已请求接收被控端声音" : "已关闭声音接收");
  sendDisplaySettings();
});
elements.clipboardToggle.addEventListener("change", () => {
  updateMetrics();
  addLog("剪贴板", elements.clipboardToggle.checked ? "已开启" : "已关闭");
  sendDisplaySettings();
});

elements.remoteCanvas.addEventListener("mousemove", updateCursor);
elements.remoteCanvas.addEventListener("mousedown", (event) => {
  registerInputEvent("鼠标按下", `button=${event.button}`, {
    pointerType: "mouse",
    action: "down",
    button: event.button,
  });
});
elements.remoteCanvas.addEventListener("mouseup", (event) => {
  registerInputEvent("鼠标抬起", `button=${event.button}`, {
    pointerType: "mouse",
    action: "up",
    button: event.button,
  });
});
elements.remoteCanvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  registerInputEvent("滚轮", `deltaY=${Math.round(event.deltaY)}`, {
    pointerType: "mouse",
    action: "wheel",
    deltaY: Math.round(event.deltaY),
  });
});
elements.remoteCanvas.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "v" && event.ctrlKey) {
    syncClipboardText();
  }
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
updateMetrics();
addLog("控制端启动", "本地模拟模式，可切换 WebSocket");
