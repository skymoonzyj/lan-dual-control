#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  host: "127.0.0.1",
  port: 43770,
  hostProvided: false,
  discover: true,
  discoverNoLocalSubnets: false,
  discoverTimeoutMs: 1200,
  timeoutMs: 12000,
  server: "http://192.168.31.68:17888",
  checkBoard: false,
  checkClientDiagnostics: false,
  allowMockVideo: false,
  skipAudio: false,
  skipClipboard: false,
  skipFileClipboard: false,
  skipInputLog: false,
  requireClean: false,
  requireMacReady: false,
  json: false,
  boardSummary: false,
  userAuthRequest: false,
  sendUserAuthRequest: false,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/check-windows-resume-status.mjs [options]

Prints a safe Windows-side resume-status report before continuing LAN dual
control work. It is read-only: it does not authenticate a WebSocket, does not
ask for or print passwords, does not send input, and does not execute inject.

Options:
  --host <host>                 Explicit Mac host target. Default: ${defaults.host}
  --port <port>                 Mac host port. Default: ${defaults.port}
  --noDiscover                  Do not scan; only preflight --host/--port.
  --discover                    Auto-discover the best Mac host. Default: on.
  --discoverNoLocalSubnets      Only probe 127.0.0.1 and explicit --host targets.
  --discoverTimeoutMs <ms>      Per-host discovery timeout. Default: ${defaults.discoverTimeoutMs}
  --timeoutMs <ms>              Per child command timeout. Default: ${defaults.timeoutMs}
  --server <url>                Agent Link Board URL. Default: ${defaults.server}
  --checkBoard                  Read one Agent Link Board snapshot.
  --checkClientDiagnostics      Also run Windows client diagnostics in formal preflight.
  --allowMockVideo              Permit mock video in formal preflight; tests only.
  --skipAudio                   Skip audio capability in formal preflight.
  --skipClipboard               Skip text/file clipboard in formal preflight.
  --skipFileClipboard           Skip file clipboard only in formal preflight.
  --skipInputLog                Skip inputMode=log in formal preflight.
  --requireClean                Exit non-zero if git worktree is dirty.
  --requireMacReady             Exit non-zero if Mac formal preflight is not ready.
  --boardSummary                Print a one-line secret-free Agent Link Board summary.
  --userAuthRequest             Print a secret-free NEED_USER_AUTH message for Agent Link Board.
  --sendUserAuthRequest         Send NEED_USER_AUTH to Agent Link Board only when preflight is ready.
  --json                        Print one machine-readable JSON object.
  --help, -h                    Show this help without probing anything.

Examples:
  node scripts/windows/check-windows-resume-status.mjs --checkBoard --boardSummary
  node scripts/windows/check-windows-resume-status.mjs --checkBoard --checkClientDiagnostics --userAuthRequest
  node scripts/windows/check-windows-resume-status.mjs --checkBoard --checkClientDiagnostics --sendUserAuthRequest
  node scripts/windows/check-windows-resume-status.mjs --discoverNoLocalSubnets --host 192.168.31.122 --port 43770 --json
`);
}

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--noDiscover") {
      args.discover = false;
      continue;
    }
    if (
      token === "--discover" ||
      token === "--discoverNoLocalSubnets" ||
      token === "--checkBoard" ||
      token === "--checkClientDiagnostics" ||
      token === "--allowMockVideo" ||
      token === "--skipAudio" ||
      token === "--skipClipboard" ||
      token === "--skipFileClipboard" ||
      token === "--skipInputLog" ||
      token === "--requireClean" ||
      token === "--requireMacReady" ||
      token === "--boardSummary" ||
      token === "--userAuthRequest" ||
      token === "--sendUserAuthRequest" ||
      token === "--json"
    ) {
      args[token.slice(2)] = true;
      continue;
    }
    if (token === "--host" && next && !next.startsWith("--")) {
      args.host = next;
      args.hostProvided = true;
      index += 1;
      continue;
    }
    if (token === "--port" && next && !next.startsWith("--")) {
      args.port = clampInteger(next, 1, 65535, defaults.port);
      index += 1;
      continue;
    }
    if (token === "--discoverTimeoutMs" && next && !next.startsWith("--")) {
      args.discoverTimeoutMs = clampInteger(next, 250, 10000, defaults.discoverTimeoutMs);
      index += 1;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampInteger(next, 3000, 120000, defaults.timeoutMs);
      index += 1;
      continue;
    }
    if (token === "--server" && next && !next.startsWith("--")) {
      args.server = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  args.host = String(args.host || defaults.host).trim();
  args.server = String(args.server || defaults.server).trim();
  return args;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function command(commandName, commandArgs, options = {}) {
  const result = spawnSync(commandName, commandArgs, {
    cwd: options.cwd || repoRoot,
    encoding: "utf8",
    timeout: options.timeoutMs || 5000,
    maxBuffer: options.maxBuffer || 8 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
      ...(options.env || {}),
    },
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    error: result.error ? result.error.message : "",
  };
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function tailLines(text, limit = 12) {
  const lines = splitLines(text);
  return lines.slice(-limit);
}

function getGitStatus() {
  const branch = command("git", ["status", "--short", "--branch"], { timeoutMs: 5000 });
  const head = command("git", ["log", "--oneline", "--decorate", "-1"], { timeoutMs: 5000 });
  const currentBuildId = command("git", ["rev-parse", "--short", "HEAD"], { timeoutMs: 3000 });
  const statusLines = splitLines(branch.stdout);
  const changes = statusLines.filter((line) => !line.startsWith("##"));
  return {
    ok: branch.ok && head.ok,
    clean: branch.ok && changes.length === 0,
    branchLine: statusLines.find((line) => line.startsWith("##")) || "",
    head: normalizedText(head.stdout),
    currentBuildId: normalizedText(currentBuildId.stdout),
    changeCount: changes.length,
    changes,
    errors: [branch.error || branch.stderr, head.error || head.stderr, currentBuildId.error || currentBuildId.stderr]
      .map(normalizedText)
      .filter(Boolean),
  };
}

function getBoardSnapshot(args) {
  if (!args.checkBoard) {
    return {
      requested: false,
      ok: null,
      status: null,
      lineCount: 0,
      tail: [],
      error: "",
    };
  }
  const result = command(process.execPath, [
    "scripts/codex-link-client.mjs",
    "--server", args.server,
    "watch",
    "--once",
  ], { timeoutMs: Math.min(Math.max(args.timeoutMs, 5000), 30000) });
  return {
    requested: true,
    ok: result.ok,
    status: result.status,
    lineCount: splitLines(`${result.stdout}\n${result.stderr}`).length,
    tail: tailLines(`${result.stdout}\n${result.stderr}`, 8),
    error: normalizedText(result.error || result.stderr),
  };
}

function makePreflightArgs(args) {
  const child = [
    "scripts/windows/check-mac-formal-e2e.mjs",
    "--preflightOnly",
    "--json",
    "--timeoutMs", String(args.timeoutMs),
    "--discoverTimeoutMs", String(args.discoverTimeoutMs),
    "--port", String(args.port),
  ];
  if (args.discover) {
    child.push("--discover");
  }
  if (!args.discover || args.hostProvided || args.discoverNoLocalSubnets) {
    child.push("--host", args.host);
  }
  if (args.discoverNoLocalSubnets) {
    child.push("--discoverNoLocalSubnets");
  }
  if (args.checkClientDiagnostics) {
    child.push("--checkClientDiagnostics");
  }
  if (args.allowMockVideo) {
    child.push("--allowMockVideo");
  }
  if (args.skipAudio) {
    child.push("--skipAudio");
  }
  if (args.skipClipboard) {
    child.push("--skipClipboard");
  }
  if (args.skipFileClipboard) {
    child.push("--skipFileClipboard");
  }
  if (args.skipInputLog) {
    child.push("--skipInputLog");
  }
  return child;
}

function runFormalPreflight(args) {
  const childArgs = makePreflightArgs(args);
  const result = command(process.execPath, childArgs, {
    timeoutMs: Math.max(args.timeoutMs, args.checkClientDiagnostics ? 70000 : 15000),
  });
  let payload = null;
  let parseError = "";
  try {
    payload = JSON.parse(String(result.stdout || "").trim());
  } catch (error) {
    parseError = error.message;
  }
  return {
    requested: true,
    ok: result.ok,
    status: result.status,
    command: `node ${childArgs.join(" ")}`,
    payload,
    parseError,
    stdoutTail: tailLines(result.stdout),
    stderrTail: tailLines(result.stderr),
    error: normalizedText(result.error || result.stderr),
  };
}

function makeCommands(args, preflight) {
  const target = preflight.payload?.target || { host: args.host, port: args.port };
  const host = String(target.host || args.host);
  const port = Number(target.port || args.port);
  return {
    resumeBoardSummary: "node scripts/windows/check-windows-resume-status.mjs --checkBoard --boardSummary",
    preflightBoardSummary: [
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-mac-formal-e2e.ps1",
      "-Discover",
      "-PreflightOnly",
      "-CheckClientDiagnostics",
      "-BoardSummary",
    ].join(" "),
    userAuthRequest: [
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-mac-formal-e2e.ps1",
      "-Discover",
      "-PreflightOnly",
      "-CheckClientDiagnostics",
      "-UserAuthRequest",
    ].join(" "),
    formalRun: [
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-mac-formal-e2e.ps1",
      "-Discover",
      "-PromptPassword",
    ].join(" "),
    formalRunFixedTarget: [
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-mac-formal-e2e.ps1",
      "-Discover",
      "-DiscoverNoLocalSubnets",
      "-HostName", host,
      "-Port", String(port),
      "-PromptPassword",
    ].join(" "),
  };
}

function makeBoardSummary(report) {
  const mac = report.macPreflight?.payload || {};
  const failedChecks = Array.isArray(mac.failedChecks) && mac.failedChecks.length > 0
    ? mac.failedChecks.map((check) => check.name).join(",")
    : "none";
  const target = mac.target
    ? `${mac.target.host}:${mac.target.port}`
    : `${report.args.host}:${report.args.port}`;
  const macState = mac.online
    ? mac.ok
      ? "ready"
      : `blocked(${failedChecks})`
    : "offline";
  const board = report.board.requested
    ? report.board.ok
      ? "ok"
      : "failed"
    : "skipped";
  const git = report.git.ok
    ? report.git.clean
      ? "clean"
      : `dirty(${report.git.changeCount})`
    : "unknown";
  const runtime = mac.runtime?.buildId || "unknown";
  const inputMode = mac.capabilities?.inputMode || "unknown";
  const clientDiagnostics = mac.clientDiagnostics?.requested
    ? mac.clientDiagnostics.ok
      ? "passed"
      : "failed"
    : "skipped";
  return [
    `Windows resume: repo=${git}; head=${report.git.currentBuildId || "unknown"}; board=${board}; mac=${macState}; target=${target}; runtimeBuild=${runtime}; inputMode=${inputMode}; clientDiagnostics=${clientDiagnostics}; failedChecks=${failedChecks}.`,
    `Next=${mac.ok ? report.commands.userAuthRequest : report.commands.preflightBoardSummary}.`,
    "No password was requested or sent; no WebSocket auth/input/inject was performed.",
  ].join(" ");
}

function makeUserAuthRequest(report) {
  const mac = report.macPreflight?.payload;
  if (mac?.ok) {
    const target = mac.target
      ? `${mac.target.host}:${mac.target.port}`
      : `${report.args.host}:${report.args.port}`;
    return [
      `NEED_USER_AUTH: 正式 Mac 端到端验收需要你在 Windows 本机隐藏输入 Mac host 正式密码，target=${target}。`,
      `位置/步骤：在 ${repoRoot.replace(/[\\/]+$/, "")} 运行 ${report.commands.formalRunFixedTarget}。`,
      "不要把密码发到联络板；本命令默认不执行 inject，inject 仍需你另行明确确认。",
      "处理后请回复 已输入密码并开始验收。",
    ].join(" ");
  }

  const preflightRequest = normalizedText(report.macPreflight?.payload?.userAuthRequest);
  if (preflightRequest) return preflightRequest;

  const target = report.macPreflight?.payload?.target
    ? `${report.macPreflight.payload.target.host}:${report.macPreflight.payload.target.port}`
    : `${report.args.host}:${report.args.port}`;
  const detail = report.macPreflight?.parseError || report.macPreflight?.error || "preflight unavailable";
  return [
    `NEED_USER_AUTH: 暂时不要输入正式密码，Windows 侧恢复总览尚未拿到可用 formal preflight，target=${target}。`,
    `位置/步骤：先处理预检问题后重跑 ${report.commands.preflightBoardSummary}。`,
    `当前细节：${detail}。密码不要发到联络板；inject 仍需用户另行明确确认。`,
  ].join(" ");
}

function sendUserAuthRequest(args, report) {
  if (!args.sendUserAuthRequest) {
    return {
      requested: false,
      ok: null,
      status: null,
      error: "",
      detail: "not requested",
    };
  }

  if (!report.macPreflight?.payload?.ok) {
    return {
      requested: true,
      ok: false,
      status: null,
      error: "",
      detail: "Mac formal preflight is not ready; user auth request was not sent.",
    };
  }

  const result = command(process.execPath, [
    "scripts/codex-link-client.mjs",
    "--server", args.server,
    "send",
    "--from", "Windows Codex",
    "--text", report.userAuthRequest,
  ], { timeoutMs: Math.min(Math.max(args.timeoutMs, 5000), 30000) });
  return {
    requested: true,
    ok: result.ok,
    status: result.status,
    error: normalizedText(result.error || result.stderr),
    detail: result.ok ? "sent" : normalizedText(result.error || result.stderr || `exit ${result.status}`),
  };
}

function makeReport(args) {
  const git = getGitStatus();
  const board = getBoardSnapshot(args);
  const macPreflight = runFormalPreflight(args);
  const commands = makeCommands(args, macPreflight);
  const checks = [
    { name: "gitStatus", ok: git.ok, detail: git.clean ? "clean" : `${git.changeCount} change(s)` },
    { name: "board", ok: !board.requested || board.ok, detail: board.requested ? `lines=${board.lineCount}` : "skipped" },
    {
      name: "macPreflight",
      ok: Boolean(macPreflight.payload),
      detail: macPreflight.payload?.online
        ? `target=${macPreflight.payload.target?.host}:${macPreflight.payload.target?.port}`
        : macPreflight.payload?.error?.message || macPreflight.parseError || "offline",
    },
  ];
  if (args.requireClean) {
    checks.push({ name: "requireClean", ok: git.clean, detail: git.clean ? "clean" : `${git.changeCount} change(s)` });
  }
  if (args.requireMacReady) {
    checks.push({
      name: "requireMacReady",
      ok: Boolean(macPreflight.payload?.ok),
      detail: macPreflight.payload?.ok ? "ready" : "not ready",
    });
  }
  const report = {
    ok: false,
    generatedAt: new Date().toISOString(),
    args: {
      host: args.host,
      port: args.port,
      discover: args.discover,
      discoverNoLocalSubnets: args.discoverNoLocalSubnets,
      checkBoard: args.checkBoard,
      checkClientDiagnostics: args.checkClientDiagnostics,
      requireClean: args.requireClean,
      requireMacReady: args.requireMacReady,
      sendUserAuthRequest: args.sendUserAuthRequest,
    },
    git,
    board,
    macPreflight,
    commands,
    checks,
    failedChecks: [],
  };
  report.boardSummary = makeBoardSummary(report);
  report.userAuthRequest = makeUserAuthRequest(report);
  report.sentUserAuthRequest = sendUserAuthRequest(args, report);
  if (args.sendUserAuthRequest) {
    checks.push({
      name: "sendUserAuthRequest",
      ok: report.sentUserAuthRequest.ok,
      detail: report.sentUserAuthRequest.detail,
    });
  }
  report.failedChecks = checks.filter((check) => !check.ok);
  report.ok = report.failedChecks.length === 0;
  return report;
}

function printHuman(report) {
  console.log("Windows resume status");
  const repoState = report.git.ok
    ? report.git.clean
      ? "clean"
      : `dirty (${report.git.changeCount} change(s))`
    : "unknown";
  console.log(`- Repo: ${repoState} ${report.git.currentBuildId || ""}`);
  if (report.git.head) {
    console.log(`  ${report.git.head}`);
  }
  if (report.board.requested) {
    console.log(`- Agent Link Board: ${report.board.ok ? "ok" : "failed"} (${report.board.lineCount} line(s))`);
  } else {
    console.log("- Agent Link Board: skipped (use --checkBoard)");
  }
  const mac = report.macPreflight.payload || null;
  if (mac?.online) {
    const state = mac.ok ? "ready" : "blocked";
    console.log(`- Mac formal preflight: ${state} ${mac.target?.host}:${mac.target?.port}`);
    console.log(`  runtime=${mac.runtime?.buildId || "unknown"} inputMode=${mac.capabilities?.inputMode || "unknown"} h264=${flag(mac.capabilities?.h264Stream)} audio=${mac.capabilities?.audioMode || flag(mac.capabilities?.audio)} clipboardFile=${flag(mac.capabilities?.clipboardFile)}`);
    if (!mac.ok && Array.isArray(mac.failedChecks) && mac.failedChecks.length > 0) {
      console.log(`  failedChecks=${mac.failedChecks.map((check) => check.name).join(",")}`);
    }
  } else {
    const detail = mac?.error?.message || report.macPreflight.parseError || "offline";
    console.log(`- Mac formal preflight: offline (${detail})`);
  }
  console.log("- Next safe commands:");
  console.log(`  ${report.commands.preflightBoardSummary}`);
  console.log(`  ${report.commands.userAuthRequest}`);
  console.log(`  ${report.commands.formalRun}`);
  console.log("- Board summary:");
  console.log(`  ${report.boardSummary}`);
  console.log("- User auth request:");
  console.log(`  ${report.userAuthRequest}`);
  if (report.sentUserAuthRequest.requested) {
    console.log(`- Sent user auth request: ${report.sentUserAuthRequest.ok ? "ok" : "failed"} (${report.sentUserAuthRequest.detail})`);
  }
}

function flag(value) {
  if (value === true) return "on";
  if (value === false) return "off";
  return value == null || value === "" ? "unknown" : String(value);
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  const report = makeReport(args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.userAuthRequest) {
    console.log(report.userAuthRequest);
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printHuman(report);
  }
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
