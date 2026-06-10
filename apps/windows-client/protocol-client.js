(function attachProtocol(global) {
  const protocolVersion = 1;

  function delay(ms) {
    return new Promise((resolve) => {
      global.setTimeout(resolve, ms);
    });
  }

  function makeId(prefix) {
    const random = Math.random().toString(16).slice(2, 8);
    return `${prefix}-${Date.now().toString(16)}-${random}`;
  }

  class ProtocolError extends Error {
    constructor(message, code = "LAN001") {
      super(message);
      this.name = "ProtocolError";
      this.code = code;
    }
  }

  function makeMockVideoFrame(frameId, width = 1920, height = 1080) {
    const now = new Date();
    const hue = (frameId * 23) % 360;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stop-color="hsl(${hue}, 42%, 24%)"/>
            <stop offset="100%" stop-color="hsl(${(hue + 90) % 360}, 38%, 12%)"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg)"/>
        <rect x="48" y="42" width="${width - 96}" height="46" rx="12" fill="rgba(255,255,255,0.9)"/>
        <text x="76" y="72" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="22" fill="#1f2937">Mock Mac Desktop</text>
        <rect x="${Math.round(width * 0.12)}" y="${Math.round(height * 0.18)}" width="${Math.round(width * 0.48)}" height="${Math.round(height * 0.46)}" rx="18" fill="rgba(255,255,255,0.92)"/>
        <circle cx="${Math.round(width * 0.15)}" cy="${Math.round(height * 0.22)}" r="12" fill="#ef4444"/>
        <circle cx="${Math.round(width * 0.18)}" cy="${Math.round(height * 0.22)}" r="12" fill="#f59e0b"/>
        <circle cx="${Math.round(width * 0.21)}" cy="${Math.round(height * 0.22)}" r="12" fill="#22c55e"/>
        <text x="${Math.round(width * 0.15)}" y="${Math.round(height * 0.34)}" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="44" font-weight="700" fill="#111827">局域网远控测试帧</text>
        <text x="${Math.round(width * 0.15)}" y="${Math.round(height * 0.42)}" font-family="Consolas, monospace" font-size="30" fill="#4b5563">frame #${frameId}</text>
        <text x="${Math.round(width * 0.15)}" y="${Math.round(height * 0.48)}" font-family="Consolas, monospace" font-size="26" fill="#4b5563">${now.toLocaleTimeString("zh-CN")}</text>
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
      dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    };
  }

  class LocalMockTransport {
    constructor() {
      this.onMessage = null;
      this.connected = false;
      this.frameTimer = null;
      this.frameId = 0;
    }

    async connect() {
      await delay(180);
      this.connected = true;
    }

    send(message) {
      if (!this.connected) {
        throw new Error("本地模拟连接未建立");
      }

      const parsed = JSON.parse(message);
      this.replyFor(parsed);
    }

    disconnect() {
      this.connected = false;
      this.stopVideoFrames();
    }

    replyFor(message) {
      const sendLater = (reply, ms = 120) => {
        global.setTimeout(() => {
          if (this.connected && this.onMessage) {
            this.onMessage(reply);
          }
        }, ms);
      };

      if (message.type === "hello") {
        sendLater({
          type: "hello_ack",
          protocolVersion,
          hostName: "本机假 Mac",
          hostPlatform: "macos",
        });
        return;
      }

      if (message.type === "auth_request") {
        const authFailed = message.password !== "demo-password" || message.mockScenario === "auth_failed";
        sendLater({
          type: "auth_result",
          ok: !authFailed,
          code: authFailed ? "LAN002" : "",
          reason: authFailed ? "连接密码不正确" : "",
        });
        return;
      }

      if (message.type === "session_offer") {
        if (message.mockScenario === "screen_permission_denied") {
          sendLater({
            type: "session_answer",
            ok: false,
            code: "LAN004",
            reason: "Mac 缺少屏幕录制权限",
          });
          return;
        }

        if (message.mockScenario === "accessibility_permission_denied") {
          sendLater({
            type: "session_answer",
            ok: false,
            code: "LAN005",
            reason: "Mac 缺少辅助功能权限",
          });
          return;
        }

        const width = Number(message.preferredWidth) || 1920;
        const height = Number(message.preferredHeight) || 1080;
        const answer = {
          type: "session_answer",
          ok: true,
          videoCodec: message.preferredVideoCodec ?? "mjpeg",
          audioCodec: message.wantAudio ? (message.preferredAudioCodec ?? "opus") : "none",
          fps: Math.min(Number(message.maxFps) || 60, 60),
          maxBandwidthKbps: Number(message.maxBandwidthKbps) || 50000,
          width,
          height,
          clipboardText: Boolean(message.wantClipboardText),
          clipboardFile: Boolean(message.wantClipboardFile),
        };
        sendLater(answer);
        global.setTimeout(() => this.startVideoFrames(answer), 300);
        if (message.mockScenario === "video_interrupted") {
          global.setTimeout(() => {
            if (this.connected && this.onMessage) {
              this.onMessage({
                type: "error",
                code: "LAN007",
                message: "视频流中断",
              });
            }
            this.stopVideoFrames();
          }, 2600);
        }
        if (message.mockScenario === "disconnect_after_connect") {
          global.setTimeout(() => this.disconnect(), 3200);
        }
        return;
      }

      if (message.type === "display_settings") {
        sendLater({ type: "display_settings_ack", accepted: true }, 80);
        return;
      }

      if (message.type === "clipboard_text") {
        sendLater({ type: "clipboard_ack", accepted: true }, 80);
        return;
      }

      if (message.type === "reverse_control_request") {
        sendLater({
          type: "reverse_control_response",
          accepted: false,
          reason: "Mac 端确认窗口还没有实装",
        });
      }
    }

    startVideoFrames(session) {
      this.stopVideoFrames();
      const intervalMs = Math.max(120, Math.round(1000 / Math.min(Number(session.fps) || 5, 8)));
      this.frameTimer = global.setInterval(() => {
        if (!this.connected || !this.onMessage) return;
        this.frameId += 1;
        this.onMessage(makeMockVideoFrame(this.frameId, session.width, session.height));
      }, intervalMs);
    }

    stopVideoFrames() {
      if (this.frameTimer) {
        global.clearInterval(this.frameTimer);
        this.frameTimer = null;
      }
    }
  }

  class WebSocketTransport {
    constructor() {
      this.socket = null;
      this.onMessage = null;
      this.onClose = null;
    }

    connect({ host, port }) {
      return new Promise((resolve, reject) => {
        const socket = new WebSocket(`ws://${host}:${port}`);
        this.socket = socket;

        socket.addEventListener("open", () => resolve());
        socket.addEventListener("message", (event) => {
          try {
            const parsed = JSON.parse(event.data);
            if (this.onMessage) {
              this.onMessage(parsed);
            }
          } catch {
            if (this.onMessage) {
              this.onMessage({ type: "error", message: "收到无法解析的消息" });
            }
          }
        });
        socket.addEventListener("close", () => {
          if (this.onClose) {
            this.onClose();
          }
        });
        socket.addEventListener("error", () => {
          reject(new Error("WebSocket 连接失败，请确认被控端服务已启动"));
        });
      });
    }

    send(message) {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket 未连接");
      }
      this.socket.send(message);
    }

    disconnect() {
      if (this.socket) {
        this.socket.close();
        this.socket = null;
      }
    }
  }

  class ProtocolClient {
    constructor({ transport, onState, onMessage, onClose } = {}) {
      this.transport = transport;
      this.onState = onState ?? (() => {});
      this.onMessage = onMessage ?? (() => {});
      this.onClose = onClose ?? (() => {});
      this.waiters = new Map();
      this.connected = false;
      this.session = null;

      this.transport.onMessage = (message) => this.handleMessage(message);
      this.transport.onClose = () => this.handleClose();
    }

    async connect({ host, port, password, sessionOffer }) {
      this.onState("connecting", `正在连接 ${host}:${port}`);
      await this.transport.connect({ host, port });

      await this.sendAndWait(
        {
          type: "hello",
          clientName: "Windows 控制端",
          clientPlatform: "windows",
          protocolVersion,
        },
        "hello_ack",
      );

      this.onState("authenticating");
      const auth = await this.sendAndWait(
        {
          type: "auth_request",
          password,
          mockScenario: sessionOffer.mockScenario,
        },
        "auth_result",
      );

      if (!auth.ok) {
        throw new ProtocolError(auth.reason || "被控端拒绝连接", auth.code || "LAN002");
      }

      this.onState("negotiating");
      const answer = await this.sendAndWait(sessionOffer, "session_answer");
      if (!answer.ok) {
        throw new ProtocolError(answer.reason || "媒体协商失败", answer.code || "LAN003");
      }

      this.connected = true;
      this.session = answer;
      this.onState("streaming");
      return answer;
    }

    disconnect() {
      this.connected = false;
      this.transport.disconnect();
      this.rejectWaiters(new Error("连接已断开"));
    }

    sendInputEvent(event) {
      if (!this.connected) return;
      this.send({
        type: "input_event",
        ...event,
      });
    }

    sendDisplaySettings(settings) {
      if (!this.connected) return;
      this.send({
        type: "display_settings",
        ...settings,
      });
    }

    sendClipboardText(text) {
      if (!this.connected) return;
      this.send({
        type: "clipboard_text",
        text,
      });
    }

    requestReverseControl() {
      if (!this.connected) return;
      this.send({
        type: "reverse_control_request",
        requestedBy: "windows-client",
      });
    }

    async sendAndWait(message, responseType) {
      const waiter = this.waitFor(responseType);
      this.send(message);
      return waiter;
    }

    send(message) {
      const envelope = {
        id: makeId(message.type),
        timestamp: new Date().toISOString(),
        ...message,
      };
      this.transport.send(JSON.stringify(envelope));
    }

    waitFor(type, timeoutMs = 2400) {
      return new Promise((resolve, reject) => {
        const timeout = global.setTimeout(() => {
          this.waiters.delete(type);
          reject(new Error(`等待 ${type} 超时`));
        }, timeoutMs);

        this.waiters.set(type, {
          resolve: (message) => {
            global.clearTimeout(timeout);
            resolve(message);
          },
          reject: (error) => {
            global.clearTimeout(timeout);
            reject(error);
          },
        });
      });
    }

    handleMessage(message) {
      const waiter = this.waiters.get(message.type);
      if (waiter) {
        this.waiters.delete(message.type);
        waiter.resolve(message);
        return;
      }

      this.onMessage(message);
    }

    handleClose() {
      if (!this.connected) return;
      this.connected = false;
      this.rejectWaiters(new Error("连接已断开"));
      this.onClose();
    }

    rejectWaiters(error) {
      this.waiters.forEach((waiter) => waiter.reject(error));
      this.waiters.clear();
    }
  }

  global.LanDualProtocol = {
    LocalMockTransport,
    ProtocolClient,
    WebSocketTransport,
    protocolVersion,
  };
})(globalThis);
