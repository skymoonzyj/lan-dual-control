#!/usr/bin/env node

import http from "node:http";
import os from "node:os";
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const args = parseArgs(process.argv.slice(2));
const host = args.host ?? process.env.CODEX_LINK_HOST ?? "0.0.0.0";
const port = Number(args.port ?? process.env.CODEX_LINK_PORT ?? 17888);
const token = args.token ?? process.env.CODEX_LINK_TOKEN ?? "";
const stateFile =
  args.state ??
  process.env.CODEX_LINK_STATE ??
  path.resolve(process.cwd(), ".dev-lab", "codex-link-state.json");

const clients = new Set();
let state = await loadState();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/") {
      sendHtml(res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      if (!isAuthorized(req, url)) return unauthorized(res);
      sendJson(res, state);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      if (!isAuthorized(req, url)) return unauthorized(res);
      sendJson(res, makeHealth());
      return;
    }

    if (req.method === "GET" && url.pathname === "/events") {
      if (!isAuthorized(req, url)) return unauthorized(res);
      openEventStream(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/message") {
      if (!isAuthorized(req, url)) return unauthorized(res);
      const body = await readJson(req);
      addEvent({
        type: body.type || "message",
        from: clean(body.from) || "unknown",
        text: clean(body.text),
      });
      await persistAndBroadcast();
      sendJson(res, { ok: true, state });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/status") {
      if (!isAuthorized(req, url)) return unauthorized(res);
      const body = await readJson(req);
      const device = clean(body.device) || "unknown";
      state.statuses[device] = {
        role: clean(body.role),
        status: clean(body.status) || "online",
        note: clean(body.note),
        updatedAt: now(),
      };
      addEvent({
        type: "status",
        from: device,
        text: `${state.statuses[device].status}${state.statuses[device].note ? `: ${state.statuses[device].note}` : ""}`,
      });
      await persistAndBroadcast();
      sendJson(res, { ok: true, state });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/presence") {
      if (!isAuthorized(req, url)) return unauthorized(res);
      const body = await readJson(req);
      const userPresence = makeUserPresence(body);
      if (!userPresence) {
        sendJson(res, { ok: false, error: "status must be present or away" }, 400);
        return;
      }
      state.userPresence = userPresence;
      addEvent({
        type: "presence",
        from: userPresence.updatedBy || "unknown",
        text: `${userPresence.label}: status=${userPresence.status}${userPresence.reason ? ` reason=${userPresence.reason}` : ""}`,
      });
      await persistAndBroadcast();
      sendJson(res, { ok: true, state });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/call") {
      if (!isAuthorized(req, url)) return unauthorized(res);
      const body = await readJson(req);
      state.currentCall = {
        status: clean(body.status) || "CALLING",
        from: clean(body.from),
        need: clean(body.need),
        startedAt: clean(body.startedAt) || now(),
        goal: clean(body.goal),
        environment: clean(body.environment),
        connection: clean(body.connection),
        command: clean(body.command),
        expected: clean(body.expected),
        actual: clean(body.actual),
        blockedBy: clean(body.blockedBy),
        ask: clean(body.ask),
        timeout: clean(body.timeout),
        owner: clean(body.owner),
        updatedAt: now(),
      };
      addEvent({
        type: "call",
        from: state.currentCall.from || "unknown",
        text: `${state.currentCall.status}: ${state.currentCall.goal || "test coordination"}`,
      });
      await persistAndBroadcast();
      sendJson(res, { ok: true, state });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/clear-call") {
      if (!isAuthorized(req, url)) return unauthorized(res);
      state.currentCall = null;
      addEvent({ type: "call", from: "system", text: "Current call cleared" });
      await persistAndBroadcast();
      sendJson(res, { ok: true, state });
      return;
    }

    sendText(res, 404, "Not found");
  } catch (error) {
    console.error(error);
    sendJson(res, { ok: false, error: String(error?.message ?? error) }, 500);
  }
});

server.listen(port, host, () => {
  console.log(`Codex LAN Link listening on http://${host}:${port}`);
  for (const ip of localIPv4()) {
    console.log(`LAN URL: http://${ip}:${port}`);
  }
  if (token) {
    console.log("Token protection is enabled. Open the page with ?token=YOUR_TOKEN once.");
  } else {
    console.log("Token protection is disabled. Use only on a trusted LAN.");
  }
});

async function loadState() {
  if (existsSync(stateFile)) {
    try {
      const parsed = JSON.parse(await readFile(stateFile, "utf8"));
      return normalizeState(parsed);
    } catch (error) {
      console.warn(`Could not read ${stateFile}: ${error.message}`);
    }
  }

  return normalizeState({
    createdAt: now(),
    updatedAt: now(),
    statuses: {},
    currentCall: null,
    events: [],
  });
}

function normalizeState(input) {
  return {
    createdAt: input.createdAt || now(),
    updatedAt: input.updatedAt || now(),
    statuses: input.statuses || {},
    currentCall: input.currentCall || null,
    events: Array.isArray(input.events) ? input.events.slice(-200) : [],
    pinnedTasks: Array.isArray(input.pinnedTasks) ? input.pinnedTasks : [],
    userPresence: input.userPresence && typeof input.userPresence === "object" ? input.userPresence : null,
  };
}

function makeHealth() {
  return {
    ok: true,
    service: "codex-link-board",
    version: "presence-health-v1",
    serverTime: now(),
    stateUpdatedAt: state.updatedAt || "",
    features: {
      state: true,
      events: true,
      status: true,
      message: true,
      call: true,
      clearCall: true,
      presence: true,
      userPresence: true,
      pinnedTasks: true,
    },
    limits: {
      maxEvents: 200,
    },
  };
}

function makeUserPresence(body = {}) {
  const status = normalizePresenceStatus(body.status || body.presence || body.state);
  if (!status) return null;
  const defaults = defaultPresence(status);
  return {
    status,
    state: status,
    label: clean(body.label) || defaults.label,
    instruction: clean(body.instruction) || defaults.instruction,
    reason: clean(body.reason) || defaults.reason,
    updatedAt: now(),
    updatedBy: clean(body.updatedBy || body.by || body.from) || "unknown",
  };
}

function normalizePresenceStatus(value) {
  const text = clean(value).toLowerCase();
  if (["present", "awake", "user-present", "user_present", "用户在场", "在场", "我在场"].includes(text)) {
    return "present";
  }
  if (["away", "sleeping", "asleep", "sleep", "user-away", "user_away", "用户不在", "不在", "休息", "睡觉"].includes(text)) {
    return "away";
  }
  return "";
}

function defaultPresence(status) {
  if (status === "present") {
    return {
      label: "用户在场",
      instruction: "可以安排需要用户配合的任务；需要密码、系统授权、真实 input/inject 或人工确认前，仍必须先说明目标、安全边界和预计耗时，并先提醒用户。",
      reason: "用户已明确表示在场/可操作",
    };
  }
  return {
    label: "用户不在",
    instruction: "只做无授权任务；需要用户密码、系统授权、真实 input/inject、改系统声音输出或人工观感确认时，先标记 BLOCKED_BY_USER_AWAY。",
    reason: "用户休息/离开，直到用户明确说回来/可以授权之前，只允许无授权任务",
  };
}

async function saveState() {
  state.updatedAt = now();
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function addEvent(event) {
  state.events.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: now(),
    type: event.type || "message",
    from: event.from || "unknown",
    text: event.text || "",
  });
  state.events = state.events.slice(-200);
}

async function persistAndBroadcast() {
  await saveState();
  const payload = `event: state\ndata: ${JSON.stringify(state)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

function openEventStream(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
  clients.add(res);
  req.on("close", () => clients.delete(res));
}

function sendHtml(res) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(html);
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function unauthorized(res) {
  sendJson(res, { ok: false, error: "unauthorized" }, 401);
}

function isAuthorized(req, url) {
  if (!token) return true;
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const apiToken = req.headers["x-codex-link-token"] || "";
  const queryToken = url.searchParams.get("token") || "";
  return bearer === token || apiToken === token || queryToken === token;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).slice(0, 4000).trim();
}

function now() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function localIPv4() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}

const html = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Codex LAN Link</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #1e2329;
      --muted: #667085;
      --border: #d8dee8;
      --accent: #1769e0;
      --accent-soft: #e8f1ff;
      --danger: #b42318;
      --danger-soft: #fff1f0;
      --warning: #b54708;
      --warning-soft: #fff7e6;
      --ok: #067647;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
      background: var(--panel);
      position: sticky;
      top: 0;
      z-index: 2;
    }
    h1 { font-size: 18px; margin: 0; }
    .connection { color: var(--muted); font-size: 13px; }
    .urgent-banner {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 12px 20px;
      border-bottom: 1px solid #f0b8ae;
      background: var(--danger-soft);
      color: var(--danger);
    }
    .urgent-banner.hidden { display: none; }
    .urgent-title {
      font-weight: 700;
      margin-bottom: 3px;
    }
    .urgent-text {
      color: #7a271a;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 13px;
    }
    .urgent-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .urgent-actions button {
      width: auto;
      margin: 0;
      white-space: nowrap;
    }
    .urgent-actions .secondary {
      background: #fff;
      color: var(--danger);
      border-color: #f0b8ae;
    }
    main {
      display: grid;
      grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
      gap: 16px;
      padding: 16px;
      max-width: 1280px;
      margin: 0 auto;
    }
    section {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
    }
    h2 {
      font-size: 15px;
      margin: 0 0 12px;
    }
    label {
      display: block;
      margin: 10px 0 5px;
      font-size: 12px;
      color: var(--muted);
    }
    input, textarea, select, button {
      width: 100%;
      font: inherit;
      border-radius: 6px;
    }
    input, textarea, select {
      border: 1px solid var(--border);
      padding: 9px 10px;
      background: #fff;
      color: var(--text);
    }
    textarea {
      min-height: 70px;
      resize: vertical;
    }
    button {
      border: 0;
      padding: 10px 12px;
      background: var(--accent);
      color: #fff;
      cursor: pointer;
      margin-top: 10px;
    }
    button.secondary {
      background: var(--accent-soft);
      color: var(--accent);
      border: 1px solid #b8d3ff;
    }
    button.danger {
      background: var(--danger);
    }
    .alert-panel {
      border-left: 4px solid var(--warning);
      background: var(--warning-soft);
    }
    .alert-status {
      color: var(--muted);
      font-size: 12px;
      margin-top: 8px;
      line-height: 1.45;
    }
    .grid2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .current-call {
      border-left: 4px solid var(--accent);
      background: #fbfdff;
      padding: 10px;
      border-radius: 6px;
      min-height: 72px;
      white-space: pre-wrap;
    }
    .empty { color: var(--muted); }
    .status-list, .event-list {
      display: grid;
      gap: 8px;
    }
    .status-card, .event-card {
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 9px 10px;
      background: #fff;
    }
    .event-card.call { border-left: 4px solid var(--accent); }
    .event-card.status { border-left: 4px solid var(--ok); }
    .event-card.urgent {
      border-left: 4px solid var(--danger);
      background: var(--danger-soft);
    }
    .status-card.stale {
      border-left: 4px solid var(--danger);
      background: var(--danger-soft);
    }
    .event-meta, .status-meta {
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 4px;
    }
    .event-text {
      white-space: pre-wrap;
      word-break: break-word;
    }
    @media (max-width: 850px) {
      main { grid-template-columns: 1fr; }
      header { align-items: flex-start; gap: 8px; flex-direction: column; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Codex LAN Link</h1>
    <div id="connection" class="connection">连接中...</div>
  </header>
  <div id="urgentBanner" class="urgent-banner hidden">
    <div>
      <div id="urgentTitle" class="urgent-title">需要用户处理</div>
      <div id="urgentText" class="urgent-text"></div>
    </div>
    <div class="urgent-actions">
      <button id="enableAlertsTop" class="danger">开启提醒</button>
      <button id="ackAlertTop" class="secondary">已处理</button>
    </div>
  </div>
  <main>
    <div>
      <section>
        <h2>我的状态</h2>
        <div class="grid2">
          <div>
            <label for="device">设备</label>
            <input id="device" placeholder="Windows Codex" />
          </div>
          <div>
            <label for="role">角色</label>
            <input id="role" placeholder="Windows 端" />
          </div>
        </div>
        <label for="status">状态</label>
        <select id="status">
          <option value="online">在线</option>
          <option value="testing">测试中</option>
          <option value="waiting">等待对方</option>
          <option value="blocked">阻塞</option>
          <option value="offline">离开</option>
        </select>
        <label for="note">备注</label>
        <input id="note" placeholder="正在跑真实 Mac 首帧验证" />
        <button id="saveStatus">更新状态</button>
      </section>

      <section style="margin-top:16px">
        <h2>发消息</h2>
        <label for="message">消息</label>
        <textarea id="message" placeholder="Mac 端服务已启动，等 Windows 连接。"></textarea>
        <button id="sendMessage">发送</button>
      </section>

      <section class="alert-panel" style="margin-top:16px">
        <h2>授权提醒</h2>
        <div class="grid2">
          <button id="enableAlerts">开启声音/桌面提醒</button>
          <button id="testAlert" class="secondary">测试提醒</button>
        </div>
        <label for="staleMinutes">卡住提醒阈值（分钟）</label>
        <input id="staleMinutes" type="number" min="3" max="240" step="1" />
        <button id="ackAlert" class="secondary">标记当前提醒已处理</button>
        <div id="alertStatus" class="alert-status"></div>
      </section>

      <section style="margin-top:16px">
        <h2>测试呼叫</h2>
        <div class="grid2">
          <div>
            <label for="callStatus">状态</label>
            <select id="callStatus">
              <option>CALLING</option>
              <option>READY</option>
              <option>TESTING</option>
              <option>BLOCKED</option>
              <option>DONE</option>
              <option>CANCELLED</option>
            </select>
          </div>
          <div>
            <label for="need">需要配合端</label>
            <input id="need" placeholder="Mac Codex" />
          </div>
        </div>
        <label for="goal">目标</label>
        <input id="goal" placeholder="验证真实 JPEG 首帧" />
        <label for="connectionInfo">连接信息</label>
        <input id="connectionInfo" placeholder="Mac IP 192.168.1.x，端口 17654" />
        <label for="command">测试命令</label>
        <textarea id="command" placeholder="scripts/windows/test-mac-host.ps1 -HostName 192.168.1.x -RequireRealVideo"></textarea>
        <label for="ask">需要对方做什么</label>
        <textarea id="ask" placeholder="请启动 apps/mac-host，并确认屏幕录制权限已开启。"></textarea>
        <button id="saveCall">发布/更新呼叫</button>
        <button id="clearCall" class="secondary">清除当前呼叫</button>
      </section>
    </div>

    <div>
      <section>
        <h2>当前呼叫</h2>
        <div id="currentCall" class="current-call empty">暂无呼叫</div>
      </section>
      <section style="margin-top:16px">
        <h2>在线状态</h2>
        <div id="statuses" class="status-list"></div>
      </section>
      <section style="margin-top:16px">
        <h2>消息记录</h2>
        <div id="events" class="event-list"></div>
      </section>
    </div>
  </main>
  <script>
    const qs = new URLSearchParams(location.search);
    const tokenFromUrl = qs.get("token");
    if (tokenFromUrl) localStorage.setItem("codexLinkToken", tokenFromUrl);
    const token = localStorage.getItem("codexLinkToken") || "";
    const baseTitle = document.title;
    const urgentPatterns = [
      /NEED_USER_AUTH/i,
      /USER_ACTION_REQUIRED/i,
      /BLOCKED_BY_PERMISSION/i,
      /AUTHORIZATION_REQUIRED/i,
      /PERMISSION_REQUIRED/i,
      /\b(HTTP\s*)?502\b/i,
      /Bad Gateway/i,
      /Gateway Timeout/i,
      /(接口|请求|网络).{0,16}(502|Bad Gateway|超时|失败)/i,
      /需要.{0,12}(授权|权限|用户|人工|确认|处理)/i,
      /(授权|权限).{0,12}(卡住|阻塞|缺失|失败|需要)/i,
    ];
    let alertsEnabled = localStorage.getItem("codexLinkAlertsEnabled") === "true";
    let staleMinutes = clampNumber(localStorage.getItem("codexLinkStaleMinutes"), 3, 240, 5);
    let lastAckUrgentId = localStorage.getItem("codexLinkLastAckUrgentId") || "";
    let lastNotifiedUrgentId = "";
    let currentUrgent = null;
    let titleTimer = null;
    let audioContext = null;
    const headers = () => ({
      "Content-Type": "application/json",
      ...(token ? { "X-Codex-Link-Token": token } : {}),
    });

    const $ = (id) => document.getElementById(id);
    const savedDevice = localStorage.getItem("codexLinkDevice") || "";
    const savedRole = localStorage.getItem("codexLinkRole") || "";
    $("device").value = savedDevice;
    $("role").value = savedRole;
    $("staleMinutes").value = String(staleMinutes);
    updateAlertStatus();

    async function post(path, body) {
      const response = await fetch(path, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    }

    $("saveStatus").onclick = async () => {
      localStorage.setItem("codexLinkDevice", $("device").value);
      localStorage.setItem("codexLinkRole", $("role").value);
      await post("/api/status", {
        device: $("device").value,
        role: $("role").value,
        status: $("status").value,
        note: $("note").value,
      });
    };

    $("sendMessage").onclick = async () => {
      await post("/api/message", {
        from: $("device").value || "unknown",
        text: $("message").value,
      });
      $("message").value = "";
    };

    $("saveCall").onclick = async () => {
      await post("/api/call", {
        status: $("callStatus").value,
        from: $("device").value || "unknown",
        need: $("need").value,
        goal: $("goal").value,
        connection: $("connectionInfo").value,
        command: $("command").value,
        ask: $("ask").value,
        owner: $("need").value,
      });
    };

    $("clearCall").onclick = async () => {
      await post("/api/clear-call", {});
    };

    $("enableAlerts").onclick = enableAlerts;
    $("enableAlertsTop").onclick = enableAlerts;
    $("testAlert").onclick = async () => {
      await enableAlerts();
      notifyUrgent({
        id: "local-test-" + Date.now(),
        from: "Codex LAN Link",
        text: "这是一条本机测试提醒。以后 Mac 端发 NEED_USER_AUTH / USER_ACTION_REQUIRED / BLOCKED_BY_PERMISSION 时会触发同样提醒。",
        at: new Date().toISOString(),
      }, true);
    };
    $("ackAlert").onclick = acknowledgeUrgent;
    $("ackAlertTop").onclick = acknowledgeUrgent;
    $("staleMinutes").onchange = () => {
      staleMinutes = clampNumber($("staleMinutes").value, 3, 240, 5);
      $("staleMinutes").value = String(staleMinutes);
      localStorage.setItem("codexLinkStaleMinutes", String(staleMinutes));
      updateAlertStatus();
    };

    function render(state) {
      $("connection").textContent = "已连接，最后更新 " + new Date(state.updatedAt).toLocaleTimeString();
      renderCall(state.currentCall);
      renderStatuses(state.statuses || {});
      renderEvents(state.events || []);
      updateUrgent(state);
    }

    function renderCall(call) {
      const node = $("currentCall");
      if (!call) {
        node.className = "current-call empty";
        node.textContent = "暂无呼叫";
        return;
      }
      node.className = "current-call";
      node.textContent = [
        "状态：" + call.status,
        "发起端：" + (call.from || ""),
        "需要配合端：" + (call.need || ""),
        "目标：" + (call.goal || ""),
        "连接信息：" + (call.connection || ""),
        "测试命令：" + (call.command || ""),
        "需要对方做什么：" + (call.ask || ""),
        "更新时间：" + new Date(call.updatedAt).toLocaleString(),
      ].filter(Boolean).join("\n");
    }

    function renderStatuses(statuses) {
      const items = Object.entries(statuses).sort((a, b) => String(b[1].updatedAt).localeCompare(String(a[1].updatedAt)));
      $("statuses").innerHTML = items.length ? items.map(([device, item]) =>
        '<div class="status-card' + (isStaleStatus(item) ? ' stale' : '') + '">' +
          '<div class="status-meta">' + escapeHtml(item.role || "") + ' · ' + new Date(item.updatedAt).toLocaleString() + '</div>' +
          '<strong>' + escapeHtml(device) + '</strong>：' + escapeHtml(item.status || "") +
          '<div>' + escapeHtml(item.note || "") + '</div>' +
          (isStaleStatus(item) ? '<div class="event-meta">超过 ' + staleMinutes + ' 分钟未更新，可能已卡住或离线</div>' : '') +
        '</div>'
      ).join("") : '<div class="empty">暂无状态</div>';
    }

    function renderEvents(events) {
      $("events").innerHTML = events.slice().reverse().map((event) =>
        '<div class="event-card ' + escapeHtml(event.type) + (isUrgentEvent(event) ? ' urgent' : '') + '">' +
          '<div class="event-meta">' + escapeHtml(event.type) + ' · ' + escapeHtml(event.from) + ' · ' + new Date(event.at).toLocaleString() + '</div>' +
          '<div class="event-text">' + escapeHtml(event.text) + '</div>' +
        '</div>'
      ).join("");
    }

    function urgentMatch(text) {
      return urgentPatterns.some((pattern) => pattern.test(String(text || "")));
    }

    function isUrgentEvent(event) {
      return event?.type === "alert" || urgentMatch(event?.text);
    }

    function latestUrgent(state) {
      const candidates = [];
      for (const event of state.events || []) {
        if (isUrgentEvent(event)) {
          candidates.push({
            id: "event:" + event.id,
            from: event.from || "unknown",
            text: event.text || "",
            at: event.at || "",
          });
        }
      }

      const call = state.currentCall;
      const callText = [
        call?.status,
        call?.goal,
        call?.blockedBy,
        call?.ask,
        call?.actual,
      ].filter(Boolean).join("\n");
      if (call && (String(call.status || "").toUpperCase() === "BLOCKED" || urgentMatch(callText))) {
        candidates.push({
          id: "call:" + (call.updatedAt || call.startedAt || ""),
          from: call.from || "unknown",
          text: callText,
          at: call.updatedAt || call.startedAt || "",
        });
      }

      for (const [device, item] of Object.entries(state.statuses || {})) {
        const statusText = [item.status, item.note].filter(Boolean).join(": ");
        if (String(item.status || "").toLowerCase() === "blocked" || urgentMatch(statusText)) {
          candidates.push({
            id: "status:" + device + ":" + (item.updatedAt || ""),
            from: device,
            text: statusText,
            at: item.updatedAt || "",
          });
        }
        if (isStaleStatus(item)) {
          candidates.push({
            id: "stale:" + device + ":" + (item.updatedAt || "") + ":" + staleMinutes,
            from: device,
            text: "AGENT_STALE: " + device + " 超过 " + staleMinutes + " 分钟没有更新状态。上次状态：" + statusText + "。可能是 502、网络错误、授权弹窗或任务卡住；请检查对应机器的 Codex 窗口。",
            at: new Date().toISOString(),
          });
        }
      }

      return candidates
        .filter((item) => item.id && item.id !== lastAckUrgentId)
        .sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null;
    }

    function updateUrgent(state) {
      const urgent = latestUrgent(state);
      if (!urgent) {
        currentUrgent = null;
        hideUrgent();
        return;
      }

      currentUrgent = urgent;
      $("urgentBanner").classList.remove("hidden");
      $("urgentTitle").textContent = "需要用户处理 · " + (urgent.from || "unknown");
      $("urgentText").textContent = urgent.text || "";
      startTitleFlash();
      if (alertsEnabled && urgent.id !== lastNotifiedUrgentId) {
        notifyUrgent(urgent);
      }
    }

    async function enableAlerts() {
      alertsEnabled = true;
      localStorage.setItem("codexLinkAlertsEnabled", "true");
      if ("Notification" in window && Notification.permission === "default") {
        try {
          await Notification.requestPermission();
        } catch {}
      }
      await playBeep();
      updateAlertStatus();
    }

    function updateAlertStatus() {
      const notificationState = "Notification" in window ? Notification.permission : "unsupported";
      $("alertStatus").textContent = alertsEnabled
        ? "提醒已开启。触发词：NEED_USER_AUTH、USER_ACTION_REQUIRED、BLOCKED_BY_PERMISSION、502、Bad Gateway。coding/testing/waiting 超过 " + staleMinutes + " 分钟未更新也会提醒。浏览器通知状态：" + notificationState + "。"
        : "提醒未开启。点击开启后，Windows 浏览器会在 Mac 需要授权、502 停住或长时间未更新时播放提示音并弹出桌面通知。";
    }

    function acknowledgeUrgent() {
      if (currentUrgent?.id) {
        lastAckUrgentId = currentUrgent.id;
        localStorage.setItem("codexLinkLastAckUrgentId", lastAckUrgentId);
      }
      currentUrgent = null;
      hideUrgent();
    }

    function hideUrgent() {
      $("urgentBanner").classList.add("hidden");
      stopTitleFlash();
    }

    function notifyUrgent(urgent, force = false) {
      lastNotifiedUrgentId = urgent.id;
      playBeep();
      if ("Notification" in window && Notification.permission === "granted") {
        const title = force ? "Codex LAN Link 测试提醒" : "Codex LAN Link 需要处理";
        new Notification(title, {
          body: (urgent.from ? urgent.from + ": " : "") + String(urgent.text || "").slice(0, 180),
          tag: "codex-link-urgent",
        });
      }
    }

    async function playBeep() {
      try {
        audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === "suspended") await audioContext.resume();
        const now = audioContext.currentTime;
        for (let index = 0; index < 3; index += 1) {
          const oscillator = audioContext.createOscillator();
          const gain = audioContext.createGain();
          oscillator.type = "sine";
          oscillator.frequency.value = index % 2 ? 660 : 880;
          gain.gain.setValueAtTime(0.0001, now + index * 0.22);
          gain.gain.exponentialRampToValueAtTime(0.16, now + index * 0.22 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.22 + 0.16);
          oscillator.connect(gain);
          gain.connect(audioContext.destination);
          oscillator.start(now + index * 0.22);
          oscillator.stop(now + index * 0.22 + 0.17);
        }
      } catch {}
    }

    function startTitleFlash() {
      if (titleTimer) return;
      let active = false;
      titleTimer = setInterval(() => {
        active = !active;
        document.title = active ? "[需要处理] " + baseTitle : baseTitle;
      }, 900);
    }

    function stopTitleFlash() {
      if (titleTimer) clearInterval(titleTimer);
      titleTimer = null;
      document.title = baseTitle;
    }

    function isStaleStatus(item) {
      const status = String(item?.status || "").toLowerCase();
      if (!["coding", "testing", "waiting", "ready"].includes(status)) return false;
      const updatedAt = Date.parse(item?.updatedAt || "");
      if (!Number.isFinite(updatedAt)) return false;
      return Date.now() - updatedAt > staleMinutes * 60 * 1000;
    }

    function clampNumber(value, min, max, fallback) {
      const number = Number(value);
      if (!Number.isFinite(number)) return fallback;
      return Math.min(max, Math.max(min, Math.round(number)));
    }

    function escapeHtml(value) {
      return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    const eventUrl = "/events" + (token ? "?token=" + encodeURIComponent(token) : "");
    const events = new EventSource(eventUrl);
    events.addEventListener("state", (event) => render(JSON.parse(event.data)));
    events.onerror = () => {
      $("connection").textContent = "连接中断，正在等待恢复";
    };

    fetch("/api/state" + (token ? "?token=" + encodeURIComponent(token) : ""))
      .then((response) => response.json())
      .then(render)
      .catch(() => {
        $("connection").textContent = "无法读取状态，请检查令牌或服务";
      });
  </script>
</body>
</html>`;
