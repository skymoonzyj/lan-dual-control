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

  class LocalMockTransport {
    constructor() {
      this.onMessage = null;
      this.connected = false;
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
        sendLater({
          type: "auth_result",
          ok: message.password === "demo-password",
          reason: message.password === "demo-password" ? "" : "连接密码不正确",
        });
        return;
      }

      if (message.type === "session_offer") {
        sendLater({
          type: "session_answer",
          ok: true,
          videoCodec: message.preferredVideoCodec ?? "mjpeg",
          audioCodec: message.wantAudio ? (message.preferredAudioCodec ?? "opus") : "none",
          fps: Math.min(Number(message.maxFps) || 60, 60),
          maxBandwidthKbps: Number(message.maxBandwidthKbps) || 50000,
          width: Number(message.preferredWidth) || 1920,
          height: Number(message.preferredHeight) || 1080,
          clipboardText: Boolean(message.wantClipboardText),
          clipboardFile: Boolean(message.wantClipboardFile),
        });
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
    constructor({ transport, onMessage, onClose } = {}) {
      this.transport = transport;
      this.onMessage = onMessage ?? (() => {});
      this.onClose = onClose ?? (() => {});
      this.waiters = new Map();
      this.connected = false;
      this.session = null;

      this.transport.onMessage = (message) => this.handleMessage(message);
      this.transport.onClose = () => this.handleClose();
    }

    async connect({ host, port, password, sessionOffer }) {
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

      const auth = await this.sendAndWait(
        {
          type: "auth_request",
          password,
        },
        "auth_result",
      );

      if (!auth.ok) {
        throw new Error(auth.reason || "被控端拒绝连接");
      }

      const answer = await this.sendAndWait(sessionOffer, "session_answer");
      if (!answer.ok) {
        throw new Error(answer.reason || "媒体协商失败");
      }

      this.connected = true;
      this.session = answer;
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
