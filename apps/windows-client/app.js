const elements = {
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
  bandwidthRange: document.querySelector("#bandwidthRange"),
  bandwidthOutput: document.querySelector("#bandwidthOutput"),
  audioToggle: document.querySelector("#audioToggle"),
  clipboardToggle: document.querySelector("#clipboardToggle"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  windowModeButton: document.querySelector("#windowModeButton"),
  reverseButton: document.querySelector("#reverseButton"),
  cursorDot: document.querySelector("#cursorDot"),
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
};

const protocolVersion = 1;

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
    maxBandwidthKbps: Number(elements.bandwidthRange.value) * 1000,
    audio: elements.audioToggle.checked,
    clipboard: elements.clipboardToggle.checked,
  };
}

function updateMetrics() {
  const settings = currentDisplaySettings();
  elements.bandwidthOutput.value = `${elements.bandwidthRange.value} Mbps`;
  elements.metricResolution.textContent =
    settings.resolutionMode === "native" ? "原生" : `${settings.width} × ${settings.height}`;
  elements.metricFps.textContent = `${settings.fps} FPS`;
  elements.metricBandwidth.textContent = `${elements.bandwidthRange.value} Mbps`;
  elements.clipboardText.textContent = `剪贴板：${settings.clipboard ? "已开启" : "已关闭"}`;
}

function buildSessionOffer() {
  const settings = currentDisplaySettings();
  const [preferredWidth, preferredHeight] =
    settings.resolutionMode === "native" ? [0, 0] : [Number(settings.width), Number(settings.height)];

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

function simulateHandshake() {
  const host = elements.hostInput.value.trim();
  const port = elements.portInput.value.trim();
  const password = elements.passwordInput.value;

  if (!host || !port || !password) {
    addLog("连接失败", "目标地址、端口和密码都要填写");
    return;
  }

  state.connecting = true;
  setBadge("connecting", "连接中");
  elements.statusText.textContent = `正在连接 ${host}:${port}`;
  elements.remoteStatusText.textContent = "正在建立局域网会话...";
  elements.connectButton.disabled = true;
  elements.disconnectButton.disabled = false;

  const hello = {
    type: "hello",
    clientName: "Windows 控制端",
    clientPlatform: "windows",
    protocolVersion,
  };
  addLog("发送 hello", `${hello.clientName} → ${host}:${port}`);

  setTimeout(() => {
    addLog("验证密码", "模拟被控端返回验证通过");
    addLog("协商媒体", JSON.stringify(buildSessionOffer()));
  }, 420);

  setTimeout(() => {
    state.connected = true;
    state.connecting = false;
    setBadge("online", "已连接");
    elements.statusText.textContent = `已连接 ${host}:${port}`;
    elements.remoteStatusText.textContent = "Mac 远程画面模拟流已接入。";
    elements.reverseButton.disabled = false;
    elements.remoteCanvas.focus();
    startLatencyLoop();
    addLog("连接成功", "视频、输入、声音和剪贴板通道已就绪");
  }, 920);
}

function disconnect() {
  if (!state.connected && !state.connecting) {
    return;
  }

  state.connected = false;
  state.connecting = false;
  stopLatencyLoop();
  setBadge("offline", "未连接");
  elements.statusText.textContent = "未连接";
  elements.remoteStatusText.textContent = "连接已断开。";
  elements.metricLatency.textContent = "-- ms";
  elements.connectButton.disabled = false;
  elements.disconnectButton.disabled = true;
  elements.reverseButton.disabled = true;
  addLog("断开连接", "会话已关闭");
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

function sendDisplaySettings() {
  updateMetrics();
  if (!state.connected) {
    return;
  }

  const settings = currentDisplaySettings();
  addLog(
    "更新显示设置",
    `${settings.displayMode === "fullscreen" ? "全屏" : "窗口"} · ${elements.metricResolution.textContent} · ${settings.fps} FPS · ${elements.bandwidthRange.value} Mbps`,
  );
}

function setFullscreen(enabled) {
  state.fullscreen = enabled;
  document.querySelector(".app-shell").classList.toggle("is-fullscreen", enabled);
  elements.fullscreenButton.classList.toggle("active", enabled);
  elements.windowModeButton.classList.toggle("active", !enabled);
  sendDisplaySettings();
}

function registerInputEvent(kind, detail) {
  if (!state.connected) {
    return;
  }

  state.inputEvents += 1;
  elements.inputText.textContent = `输入事件：${state.inputEvents}`;

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
  registerInputEvent("鼠标移动", `x=${x.toFixed(3)}, y=${y.toFixed(3)}`);
}

function syncClipboardText() {
  if (!state.connected || !elements.clipboardToggle.checked) {
    return;
  }
  elements.clipboardText.textContent = "剪贴板：文字同步完成";
  addLog("剪贴板", "模拟同步一段文字");
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

elements.connectButton.addEventListener("click", simulateHandshake);
elements.disconnectButton.addEventListener("click", disconnect);
elements.refreshDevicesButton.addEventListener("click", () => addLog("刷新设备", "发现 2 台模拟设备"));
elements.clearLogButton.addEventListener("click", () => {
  elements.eventLog.innerHTML = "";
  addLog("日志", "已清空");
});

elements.fullscreenButton.addEventListener("click", () => setFullscreen(true));
elements.windowModeButton.addEventListener("click", () => setFullscreen(false));
elements.reverseButton.addEventListener("click", () => addLog("一键反控", "已发送反控请求，等待 Mac 确认"));

elements.resolutionSelect.addEventListener("change", sendDisplaySettings);
elements.fpsSelect.addEventListener("change", sendDisplaySettings);
elements.bandwidthRange.addEventListener("input", sendDisplaySettings);
elements.audioToggle.addEventListener("change", () => {
  addLog("声音", elements.audioToggle.checked ? "已请求接收被控端声音" : "已关闭声音接收");
});
elements.clipboardToggle.addEventListener("change", () => {
  updateMetrics();
  addLog("剪贴板", elements.clipboardToggle.checked ? "已开启" : "已关闭");
});

elements.remoteCanvas.addEventListener("mousemove", updateCursor);
elements.remoteCanvas.addEventListener("mousedown", (event) => {
  registerInputEvent("鼠标按下", `button=${event.button}`);
});
elements.remoteCanvas.addEventListener("mouseup", (event) => {
  registerInputEvent("鼠标抬起", `button=${event.button}`);
});
elements.remoteCanvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  registerInputEvent("滚轮", `deltaY=${Math.round(event.deltaY)}`);
});
elements.remoteCanvas.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "v" && event.ctrlKey) {
    syncClipboardText();
  }
  registerInputEvent("键盘", `${event.ctrlKey ? "Ctrl+" : ""}${event.key}`);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.fullscreen) {
    setFullscreen(false);
  }
});

tickClock();
setInterval(tickClock, 1000);
updateMetrics();
addLog("控制端启动", "本地模拟模式");
