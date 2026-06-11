export class WindowsScreenCaptureCoordinator {
  constructor({ logger } = {}) {
    this.logger = logger;
    this.mode = "mock";
    this.displays = [
      { id: "windows-main", name: "Windows 主显示器", width: 1920, height: 1080, primary: true },
      { id: "windows-secondary", name: "Windows 扩展显示器", width: 2560, height: 1440, primary: false },
    ];
  }

  getCapabilities() {
    return {
      available: false,
      mode: this.mode,
      plannedBackend: "Windows Graphics Capture",
      displays: this.getDisplays(),
      message: "当前为骨架模式，先发送模拟视频帧。",
    };
  }

  getDisplays() {
    return this.displays;
  }

  pickDisplay(displayId) {
    return (
      this.displays.find((display) => display.id === displayId) ||
      this.displays.find((display) => display.primary) ||
      this.displays[0]
    );
  }

  negotiate(message) {
    const activeDisplay = this.pickDisplay(message.displayId);
    const width = Number(message.preferredWidth) || activeDisplay.width || 1920;
    const height = Number(message.preferredHeight) || activeDisplay.height || 1080;
    const fps = Math.min(Number(message.maxFps) || 60, 60);
    const maxBandwidthKbps = Number(message.maxBandwidthKbps) || 50000;

    return {
      width,
      height,
      fps,
      requestedFps: Number(message.maxFps) || 60,
      maxScreenFps: 60,
      maxBandwidthKbps,
      videoCodec: "mock-svg",
      videoEncoding: "data-url",
      displays: this.getDisplays(),
      activeDisplayId: activeDisplay.id,
      displayName: activeDisplay.name,
    };
  }

  updateSessionDisplay(session, message) {
    const activeDisplay = this.pickDisplay(message.displayId || session.activeDisplayId);
    return {
      ...session,
      activeDisplayId: activeDisplay.id,
      displayName: activeDisplay.name,
      width:
        message.resolutionMode === "native"
          ? activeDisplay.width
          : Number(message.width) || session.width,
      height:
        message.resolutionMode === "native"
          ? activeDisplay.height
          : Number(message.height) || session.height,
      fps: Number(message.fps) || session.fps,
      requestedFps: Number(message.fps) || session.requestedFps || session.fps,
      maxBandwidthKbps: Number(message.maxBandwidthKbps) || session.maxBandwidthKbps,
    };
  }

  start(session) {
    this.logger?.info(
      `屏幕采集骨架已启动：${session.displayName ?? "显示器"} / ${session.width}x${session.height} / ${session.fps} Hz / mock`,
    );
  }

  stop() {
    this.logger?.info("屏幕采集骨架已停止");
  }

  makeFrame(frameId, session) {
    const now = new Date();
    const width = session.width || 1920;
    const height = session.height || 1080;
    const hue = (frameId * 17) % 360;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stop-color="hsl(${hue}, 36%, 22%)"/>
            <stop offset="100%" stop-color="hsl(${(hue + 120) % 360}, 40%, 12%)"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg)"/>
        <rect x="42" y="38" width="${width - 84}" height="54" rx="8" fill="rgba(255,255,255,0.92)"/>
        <text x="70" y="73" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="24" font-weight="700" fill="#17202a">Windows Host Skeleton</text>
        <rect x="${Math.round(width * 0.12)}" y="${Math.round(height * 0.2)}" width="${Math.round(width * 0.52)}" height="${Math.round(height * 0.42)}" rx="10" fill="rgba(255,255,255,0.9)"/>
        <text x="${Math.round(width * 0.16)}" y="${Math.round(height * 0.34)}" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="42" font-weight="700" fill="#111827">Mac 反控 Windows 测试帧</text>
        <text x="${Math.round(width * 0.16)}" y="${Math.round(height * 0.43)}" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="30" fill="#4b5563">${session.displayName ?? "Windows 主显示器"}</text>
        <text x="${Math.round(width * 0.16)}" y="${Math.round(height * 0.5)}" font-family="Consolas, monospace" font-size="30" fill="#4b5563">frame #${frameId}</text>
        <text x="${Math.round(width * 0.16)}" y="${Math.round(height * 0.57)}" font-family="Consolas, monospace" font-size="26" fill="#4b5563">${now.toLocaleTimeString("zh-CN")}</text>
      </svg>`;

    return {
      type: "video_frame",
      frameId,
      timestamp: now.toISOString(),
      width,
      height,
      codec: "mock-svg",
      encoding: "data-url",
      keyFrame: frameId === 1 || frameId % 30 === 0,
      source: "mock",
      capturePipeline: "mock-svg",
      droppedFrames: 0,
      dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
    };
  }
}
