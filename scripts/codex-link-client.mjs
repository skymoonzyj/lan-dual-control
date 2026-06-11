#!/usr/bin/env node

const defaults = {
  server: process.env.CODEX_LINK_SERVER || "http://127.0.0.1:17888",
  intervalMs: 2000,
};

function parseArgs(argv) {
  const options = { ...defaults, _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      options._.push(item);
      continue;
    }

    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  options.server = String(options.server || defaults.server).replace(/\/+$/, "");
  options.intervalMs = Number(options.intervalMs || options.interval || defaults.intervalMs) || defaults.intervalMs;
  return options;
}

function usage() {
  return `
Usage:
  node scripts/codex-link-client.mjs --server http://host:17888 watch [--once]
  node scripts/codex-link-client.mjs --server http://host:17888 status --device "Mac Codex" --role "Mac 端" --status online --note "我已上线"
  node scripts/codex-link-client.mjs --server http://host:17888 send --from "Mac Codex" --text "mac-host 已启动"
  node scripts/codex-link-client.mjs --server http://host:17888 call --from "Mac Codex" --need "Windows Codex" --goal "验证连接" --ask "请运行探针"
  node scripts/codex-link-client.mjs --server http://host:17888 clear-call
`.trim();
}

async function requestJson(options, path, { method = "GET", body } = {}) {
  const response = await fetch(`${options.server}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { "X-Codex-Link-Token": String(options.token) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`${method} ${path} failed: HTTP ${response.status} ${await response.text()}`);
  }
  return response.json();
}

function formatTime(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return String(value);
  }
}

function formatCall(call) {
  if (!call) return "当前呼叫：暂无";
  return [
    `当前呼叫：${call.status || "UNKNOWN"}`,
    `发起端：${call.from || ""}`,
    `需要配合端：${call.need || ""}`,
    `目标：${call.goal || ""}`,
    `连接信息：${call.connection || ""}`,
    `测试命令：${call.command || ""}`,
    `需要对方做什么：${call.ask || ""}`,
    `实际结果：${call.actual || ""}`,
    `阻塞原因：${call.blockedBy || ""}`,
    `更新时间：${formatTime(call.updatedAt)}`,
  ].filter((line) => !line.endsWith("：")).join("\n");
}

function formatStatuses(statuses = {}) {
  const entries = Object.entries(statuses).sort(([, a], [, b]) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  if (entries.length === 0) return "状态：暂无";
  return [
    "状态：",
    ...entries.map(([device, item]) => `- ${device} [${item.role || ""}] ${item.status || ""} ${item.note || ""} (${formatTime(item.updatedAt)})`),
  ].join("\n");
}

function formatEvents(events = [], limit = 12) {
  const recent = events.slice(-limit);
  if (recent.length === 0) return "事件：暂无";
  return [
    "事件：",
    ...recent.map((event) => `- ${formatTime(event.at)} ${event.type || ""} ${event.from || ""}: ${event.text || ""}`),
  ].join("\n");
}

function renderState(state, { limit } = {}) {
  return [
    `更新时间：${formatTime(state.updatedAt)}`,
    formatCall(state.currentCall),
    formatStatuses(state.statuses),
    formatEvents(state.events, limit),
  ].join("\n\n");
}

async function watch(options) {
  const seen = new Set();
  let first = true;

  while (true) {
    const state = await requestJson(options, "/api/state");
    const events = state.events || [];
    const unseen = events.filter((event) => !seen.has(event.id));
    for (const event of events) {
      if (event.id) seen.add(event.id);
    }

    if (first || unseen.length > 0) {
      const view = first ? state : { ...state, events: unseen };
      console.log(renderState(view, { limit: Number(options.limit || 12) }));
      console.log("");
    }
    first = false;

    if (options.once) return;
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs));
  }
}

async function postStatus(options) {
  requireOption(options, "device");
  const result = await requestJson(options, "/api/status", {
    method: "POST",
    body: {
      device: options.device,
      role: options.role || "",
      status: options.status || "online",
      note: options.note || "",
    },
  });
  console.log(`状态已发送：${options.device} ${options.status || "online"}`);
  return result;
}

async function sendMessage(options) {
  const from = options.from || options.device || "unknown";
  requireOption({ ...options, from }, "from");
  requireOption(options, "text");
  await requestJson(options, "/api/message", {
    method: "POST",
    body: { from, text: options.text },
  });
  console.log(`消息已发送：${from}`);
}

async function postCall(options) {
  await requestJson(options, "/api/call", {
    method: "POST",
    body: {
      status: options.status || "CALLING",
      from: options.from || options.device || "unknown",
      need: options.need || "",
      goal: options.goal || "",
      connection: options.connection || "",
      command: options.command || "",
      ask: options.ask || "",
      actual: options.actual || "",
      blockedBy: options.blockedBy || "",
      timeout: options.timeout || "",
      owner: options.owner || options.need || "",
    },
  });
  console.log(`呼叫已发布：${options.status || "CALLING"}`);
}

async function clearCall(options) {
  await requestJson(options, "/api/clear-call", { method: "POST", body: {} });
  console.log("当前呼叫已清除");
}

function requireOption(options, key) {
  if (!options[key]) {
    throw new Error(`Missing --${key}\n${usage()}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const command = options._[0];

  switch (command) {
    case "watch":
      await watch(options);
      break;
    case "status":
      await postStatus(options);
      break;
    case "send":
      await sendMessage(options);
      break;
    case "call":
      await postCall(options);
      break;
    case "clear-call":
      await clearCall(options);
      break;
    case "help":
    case undefined:
      console.log(usage());
      break;
    default:
      throw new Error(`Unknown command: ${command}\n${usage()}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
