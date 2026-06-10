export class WindowsScreenCaptureCoordinator {
  constructor({ logger } = {}) {
    this.logger = logger;
    this.mode = "mock";
  }

  getCapabilities() {
    return {
      available: false,
      mode: this.mode,
      plannedBackend: "Windows Graphics Capture",
      message: "当前为骨架模式，先发送模拟视频帧。",
    };
  }

  negotiate(message) {
    const width = Number(message.preferredWidth) || 1920;
    const height = Number(message.preferredHeight) || 1080;
    const fps = Math.min(Number(message.maxFps) || 60, 60);
    const maxBandwidthKbps = Number(message.maxBandwidthKbps) || 50000;

    return {
      width,
      height,
      fps,
      maxBandwidthKbps,
      videoCodec: message.preferredVideoCodec ?? "mjpeg",
    };
  }

  start(session) {
    this.logger?.info(
      `屏幕采集骨架已启动：${session.width}x${session.height} / ${session.fps} FPS / mock`,
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
        <text x="${Math.round(width * 0.16)}" y="${Math.round(height * 0.43)}" font-family="Consolas, monospace" font-size="30" fill="#4b5563">frame #${frameId}</text>
        <text x="${Math.round(width * 0.16)}" y="${Math.round(height * 0.5)}" font-family="Consolas, monospace" font-size="26" fill="#4b5563">${now.toLocaleTimeString("zh-CN")}</text>
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
      dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
    };
  }
}
