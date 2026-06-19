#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  preset: "wmc-current",
  server: process.env.CODEX_LINK_SERVER || "http://127.0.0.1:17888",
  token: process.env.CODEX_LINK_TOKEN || "",
  device: "Mac Codex",
  role: "Mac 端",
  from: "Mac Codex",
  taskBoardPath: path.join(repoRoot, "docs/04-task-board.md"),
};

const presets = {
  "wmc-current": [
    {
      id: "W1",
      aliases: ["G1", "N3"],
      topic: "one-click-entry",
      evidence: "task-board:windows-control-mac-entry",
      needles: ["Windows 根目录双击入口", "Windows 一键打开当前 Mac 控制页"],
    },
    {
      id: "W2",
      aliases: ["G2", "N1"],
      topic: "video-low-latency",
      evidence: "task-board:windows-n1-h264-video-queue",
      needles: ["Windows N1 H.264 视频低延迟队列治理"],
    },
    {
      id: "W3",
      aliases: ["G3", "N2"],
      topic: "audio-low-latency",
      evidence: "task-board:windows-n2-webaudio-queue",
      needles: ["Windows N2 WebAudio 队列治理"],
    },
    {
      id: "M1",
      aliases: ["G4", "N4"],
      topic: "remote-only-audio-plan",
      evidence: "task-board:mac-remote-audio-plan-and-windows-consumer",
      needles: ["MacRemoteAudioPlan=", "Windows 控制端消费 Mac 远端独占声音方案"],
    },
    {
      id: "M2",
      aliases: ["G5", "N5"],
      topic: "input-safety-path",
      evidence: "task-board:mac-input-safety-plan-and-windows-consumer",
      needles: ["Windows 控制端消费 Mac 真实输入安全方案"],
    },
    {
      id: "C1",
      aliases: ["N6"],
      topic: "daily-item-reporting",
      evidence: "task-board:daily-item-reporter-wmc-numbering",
      needles: ["DAILY_ITEM W/M/C 新编号上报格式工具"],
    },
  ],
};
presets["night-unattended"] = presets["wmc-current"];

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
  } else {
    const report = buildReport(args);
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(args.boardSummary ? report.boardSummary : formatHuman(report));
    }
    if (args.sendStatus) await sendStatus(args, report);
    if (args.sendMessage) await sendMessage(args, report);
    if (report.status !== "PASS" && !args.allowBlocked) process.exitCode = 1;
  }
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    ...defaults,
    json: false,
    boardSummary: false,
    sendStatus: false,
    sendMessage: false,
    allowBlocked: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--boardSummary") {
      args.boardSummary = true;
      continue;
    }
    if (token === "--sendStatus") {
      args.sendStatus = true;
      continue;
    }
    if (token === "--sendMessage") {
      args.sendMessage = true;
      continue;
    }
    if (token === "--allowBlocked") {
      args.allowBlocked = true;
      continue;
    }
    if (token.startsWith("--") && next && !next.startsWith("--")) {
      const key = token.slice(2);
      if (!Object.hasOwn(args, key)) throw new Error(`Unknown argument: ${token}`);
      args[key] = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  args.server = String(args.server || defaults.server).replace(/\/+$/, "");
  args.token = String(args.token || "");
  args.taskBoardPath = path.resolve(repoRoot, args.taskBoardPath || defaults.taskBoardPath);
  if (!Object.hasOwn(presets, args.preset)) throw new Error(`Unknown preset: ${args.preset}`);
  return args;
}

function buildReport(args) {
  const taskBoard = readFileSync(args.taskBoardPath, "utf8");
  const items = presets[args.preset].map((item) => {
    const missing = item.needles.filter((needle) => !taskBoard.includes(needle));
    const aliasPart = item.aliases?.length ? ` alias=${item.aliases.join(",")}` : "";
    const status = missing.length === 0 ? "PASS" : "BLOCKED";
    const line = status === "PASS"
      ? `DAILY_ITEM ${item.id} PASS${aliasPart} topic=${item.topic} evidence=${item.evidence}`
      : `DAILY_ITEM ${item.id} BLOCKED${aliasPart} topic=${item.topic} blockedBy=missing-evidence missing=${missing.map(safeToken).join(",") || "unknown"}`;
    return {
      id: item.id,
      aliases: item.aliases || [],
      topic: item.topic,
      status,
      evidence: item.evidence,
      missing,
      line,
    };
  });
  const status = items.every((item) => item.status === "PASS") ? "PASS" : "BLOCKED";
  const checkedAt = new Date().toISOString();
  const boardSummary = [
    `DAILY_ITEM_REPORT preset=${args.preset} status=${status} checkedAt=${checkedAt}`,
    ...items.map((item) => item.line),
    "Safety=no-credentials,no-auth,no-input-inject",
  ].join("; ");
  return {
    ok: status === "PASS",
    preset: args.preset,
    status,
    checkedAt,
    taskBoardPath: path.relative(repoRoot, args.taskBoardPath),
    items,
    boardSummary,
  };
}

function safeToken(value) {
  return String(value || "")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_.:-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "missing";
}

function formatHuman(report) {
  return [
    `Daily item report: ${report.status}`,
    `- preset: ${report.preset}`,
    `- checkedAt: ${report.checkedAt}`,
    ...report.items.map((item) => `- ${item.line}`),
    "- Safety: no credentials, no auth, no input/inject",
  ].join("\n");
}

async function sendStatus(args, report) {
  await post(args, "/api/status", {
    device: args.device,
    role: args.role,
    status: report.status === "PASS" ? "daily-items-pass" : "daily-items-blocked",
    note: report.boardSummary,
  });
}

async function sendMessage(args, report) {
  await post(args, "/api/message", {
    from: args.from,
    type: "message",
    text: report.boardSummary,
  });
}

async function post(args, pathName, body) {
  const response = await fetch(new URL(pathName, args.server), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(args.token ? { "X-Codex-Link-Token": args.token } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Agent Link post failed: ${response.status} ${text}`);
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { ok: true };
  }
  if (payload?.ok === false) throw new Error(payload.error || "Agent Link post failed");
}

function printHelp() {
  console.log(`Usage:
  node scripts/codex-link-daily-items.mjs [--preset wmc-current] [--boardSummary|--json]
  node scripts/codex-link-daily-items.mjs --server http://host:17888 --sendStatus --sendMessage --boardSummary

Options:
  --preset <name>           Report preset. Default: ${defaults.preset}
                            wmc-current emits W1/W2/W3/M1/M2/C1.
                            night-unattended is kept as a legacy alias but also
                            emits W/M/C item IDs with old G/N aliases.
  --taskBoardPath <path>    Markdown task board to verify. Default: docs/04-task-board.md
  --boardSummary            Print one Agent Link friendly DAILY_ITEM summary line.
  --json                    Print machine-readable JSON.
  --sendStatus              Post the summary as a device status to Agent Link Board.
  --sendMessage             Post the summary as a message to Agent Link Board.
  --server <url>            Agent Link Board URL. Default: ${defaults.server}
  --device <name>           Agent Link status device. Default: ${defaults.device}
  --role <role>             Agent Link status role. Default: ${defaults.role}
  --from <name>             Agent Link message sender. Default: ${defaults.from}
  --allowBlocked            Return exit 0 even when one or more items are BLOCKED.
  --help, -h                Show this help.

Safety:
  Default mode is read-only and does not contact Agent Link Board.
  The report never authenticates to a host and never sends input events.
  Use explicit --sendStatus or --sendMessage to post the DAILY_ITEM lines.
`);
}
