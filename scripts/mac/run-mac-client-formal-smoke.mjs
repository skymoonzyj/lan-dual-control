#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promptPassword as promptMacPassword } from "./password-prompt.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  host: "",
  port: 43770,
  clientHost: "127.0.0.1",
  clientPort: 5188,
  debugPort: 9340,
  timeoutMs: 60000,
  observeVideoMs: 1200,
  minObservedVideoFrames: 4,
  minObservedVideoFps: 3,
  maxInitialVideoMs: 15000,
  maxAudioFrameMs: 15000,
  maxAudioPlaybackMs: 20000,
  server: "http://192.168.31.68:17888",
  skipBoard: false,
  allowDirty: false,
  allowPreflightWarnings: false,
  preflightOnly: false,
  promptPassword: false,
  requirePassword: true,
  allowDemoPassword: false,
  skipAudio: false,
  skipFileClipboard: false,
  allowClipboardFallback: process.platform !== "win32",
  headed: false,
  json: false,
  boardSummary: false,
  dryRun: false,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/run-mac-client-formal-smoke.mjs [options]

Runs the Mac client browser smoke against an already-running Windows host.
It first runs the read-only formal checklist. If not --preflightOnly, it then
authenticates through the Mac client page using LAN_DUAL_PASSWORD or a frontmost
--promptPassword dialog. Passwords are passed to child probes through the
environment, not command arguments, and are never printed.

Options:
  --host <host>                  Windows host address. Required for real smoke.
  --port <port>                  Windows host port. Default: ${defaults.port}
  --clientHost <host>            Local Mac client host. Default: ${defaults.clientHost}
  --clientPort <port>            Local Mac client web port. Default: ${defaults.clientPort}
  --debugPort <port>             Browser remote debugging port. Default: ${defaults.debugPort}
  --timeoutMs <ms>               Browser smoke timeout. Default: ${defaults.timeoutMs}
  --observeVideoMs <ms>          Sustained video observation window. Default: ${defaults.observeVideoMs}
  --minObservedVideoFrames <n>   Minimum frames during observation. Default: ${defaults.minObservedVideoFrames}
  --minObservedVideoFps <fps>    Minimum FPS during observation. Default: ${defaults.minObservedVideoFps}
  --maxInitialVideoMs <ms>       Maximum first-frame time. Default: ${defaults.maxInitialVideoMs}
  --maxAudioFrameMs <ms>         Maximum first audio frame time. Default: ${defaults.maxAudioFrameMs}
  --maxAudioPlaybackMs <ms>      Maximum audio playback count time. Default: ${defaults.maxAudioPlaybackMs}
  --server <url>                 Agent Link Board URL. Default: ${defaults.server}
  --skipBoard                    Do not read Agent Link Board in preflight.
  --allowDirty                   Allow dirty git worktree as a preflight warning.
  --allowPreflightWarnings       Allow ok-but-not-ready preflight warnings before auth.
  --preflightOnly                Only run the read-only checklist; no password/browser auth.
  --promptPassword               Ring first, then ask for password in a frontmost macOS dialog.
  --requirePassword              Refuse empty/demo password for real smoke. Default: true
  --noRequirePassword            Allow missing password only for local non-formal diagnostics.
  --allowDemoPassword            Allow demo-password for local fake-host tests only.
  --skipAudio                    Do not require audio payload/playback in browser smoke.
  --skipFileClipboard            Skip file clipboard checks.
  --allowClipboardFallback       Allow temp/memory clipboard fallback. Default: ${defaults.allowClipboardFallback}
  --headed                       Run browser headed instead of headless.
  --dryRun                       Print the command shape without running browser auth.
  --boardSummary                 Print a short secret-free Agent Link Board summary.
  --json                         Print one machine-readable JSON object.
  --help, -h                     Show this help without probing anything.

Examples:
  node scripts/mac/run-mac-client-formal-smoke.mjs --host 192.168.31.50 --port 43770 --preflightOnly --boardSummary
  node scripts/mac/run-mac-client-formal-smoke.mjs --host 192.168.31.50 --port 43770 --promptPassword
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
    if (
      token === "--skipBoard" ||
      token === "--allowDirty" ||
      token === "--allowPreflightWarnings" ||
      token === "--preflightOnly" ||
      token === "--promptPassword" ||
      token === "--requirePassword" ||
      token === "--allowDemoPassword" ||
      token === "--skipAudio" ||
      token === "--skipFileClipboard" ||
      token === "--allowClipboardFallback" ||
      token === "--headed" ||
      token === "--dryRun" ||
      token === "--boardSummary" ||
      token === "--json"
    ) {
      args[token.slice(2)] = true;
      continue;
    }
    if (token === "--noRequirePassword") {
      args.requirePassword = false;
      continue;
    }
    if ((token === "--host" || token === "--windowsHost") && next && !next.startsWith("--")) {
      args.host = next;
      index += 1;
      continue;
    }
    if (token === "--clientHost" && next && !next.startsWith("--")) {
      args.clientHost = next;
      index += 1;
      continue;
    }
    const numericKeys = new Set([
      "port",
      "clientPort",
      "debugPort",
      "timeoutMs",
      "observeVideoMs",
      "minObservedVideoFrames",
      "minObservedVideoFps",
      "maxInitialVideoMs",
      "maxAudioFrameMs",
      "maxAudioPlaybackMs",
    ]);
    if (token.startsWith("--") && numericKeys.has(token.slice(2)) && next && !next.startsWith("--")) {
      args[token.slice(2)] = next;
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

  args.host = String(args.host || "").trim();
  args.clientHost = String(args.clientHost || defaults.clientHost).trim();
  args.server = String(args.server || defaults.server).trim();
  args.port = clampInteger(args.port, 1, 65535, defaults.port);
  args.clientPort = clampInteger(args.clientPort, 1, 65535, defaults.clientPort);
  args.debugPort = clampInteger(args.debugPort, 1, 65535, defaults.debugPort);
  args.timeoutMs = clampInteger(args.timeoutMs, 5000, 600000, defaults.timeoutMs);
  args.observeVideoMs = clampInteger(args.observeVideoMs, 0, 600000, defaults.observeVideoMs);
  args.minObservedVideoFrames = clampInteger(args.minObservedVideoFrames, 0, 1000000, defaults.minObservedVideoFrames);
  args.minObservedVideoFps = nonNegativeNumber(args.minObservedVideoFps, defaults.minObservedVideoFps);
  args.maxInitialVideoMs = clampInteger(args.maxInitialVideoMs, 0, 600000, defaults.maxInitialVideoMs);
  args.maxAudioFrameMs = clampInteger(args.maxAudioFrameMs, 0, 600000, defaults.maxAudioFrameMs);
  args.maxAudioPlaybackMs = clampInteger(args.maxAudioPlaybackMs, 0, 600000, defaults.maxAudioPlaybackMs);
  return args;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function nonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function redact(value, secret) {
  let text = String(value || "");
  if (secret) text = text.split(secret).join("[redacted]");
  const envSecret = process.env.LAN_DUAL_PASSWORD || "";
  if (envSecret) text = text.split(envSecret).join("[redacted]");
  return text;
}

function runPreflight(args) {
  const preflightArgs = [
    "scripts/mac/check-mac-client-formal-status.mjs",
    "--json",
    "--clientHost",
    args.clientHost,
    "--clientPort",
    String(args.clientPort),
    "--timeoutMs",
    String(Math.min(args.timeoutMs, 60000)),
  ];
  if (args.host) preflightArgs.push("--host", args.host, "--port", String(args.port));
  if (args.skipBoard) preflightArgs.push("--skipBoard");
  if (args.allowDirty || args.dryRun || args.preflightOnly) preflightArgs.push("--allowDirty");
  const result = spawnSync(process.execPath, preflightArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(Math.min(args.timeoutMs, 60000) + 5000, 10000),
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
    },
  });
  const stdout = String(result.stdout || "").trim();
  let payload = null;
  let parseError = "";
  try {
    payload = JSON.parse(stdout);
  } catch (error) {
    parseError = error.message;
  }
  return {
    exitCode: result.status,
    stdout,
    stderr: String(result.stderr || ""),
    payload,
    parseError,
  };
}

function makeBrowserArgs(args) {
  const browserArgs = [
    "scripts/windows/test-mac-client-browser.mjs",
    "--useExistingHost",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--clientPort",
    String(args.clientPort),
    "--debugPort",
    String(args.debugPort),
    "--timeoutMs",
    String(args.timeoutMs),
    "--useEnvPassword",
    "--requirePassword",
    "--maxInitialVideoMs",
    String(args.maxInitialVideoMs),
  ];
  if (args.observeVideoMs > 0) {
    browserArgs.push(
      "--observeVideoMs",
      String(args.observeVideoMs),
      "--minObservedVideoFrames",
      String(args.minObservedVideoFrames),
      "--minObservedVideoFps",
      String(args.minObservedVideoFps),
    );
  }
  if (!args.skipAudio) {
    browserArgs.push(
      "--enableAudio",
      "--expectAudioPayload",
      "--expectAudioPlayback",
      "--maxAudioFrameMs",
      String(args.maxAudioFrameMs),
      "--maxAudioPlaybackMs",
      String(args.maxAudioPlaybackMs),
    );
  }
  if (args.skipFileClipboard) browserArgs.push("--skipFileClipboard");
  if (args.allowClipboardFallback) browserArgs.push("--allowClipboardFallback");
  if (args.headed) browserArgs.push("--headed");
  return browserArgs;
}

async function preparePassword(args) {
  if (args.preflightOnly || args.dryRun) return "";
  if (args.promptPassword) {
    const value = await promptMacPassword({
      title: "LAN Dual Control",
      message: "Enter the Windows host password for this Mac client smoke test. It is not printed or sent to Agent Link Board.",
      prompt: "Windows host password:",
      terminalLabel: "Windows host password: ",
      output: args.json ? process.stderr : process.stdout,
    });
    if (!value) throw new Error("Password cannot be empty when --promptPassword is used.");
    return value;
  }
  return process.env.LAN_DUAL_PASSWORD || "";
}

function validatePassword(args, password) {
  if (args.preflightOnly || args.dryRun || !args.requirePassword) return;
  if (!password) {
    throw new Error("Formal browser smoke requires LAN_DUAL_PASSWORD or --promptPassword.");
  }
  if (!args.allowDemoPassword && password === "demo-password") {
    throw new Error("Formal browser smoke refuses demo-password. Use the formal Windows host password, or --allowDemoPassword only for local fake-host tests.");
  }
}

function runBrowserSmoke(args, password) {
  const browserArgs = makeBrowserArgs(args);
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, browserArgs, {
      cwd: repoRoot,
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: password,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 1000);
    }, args.timeoutMs + 5000);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({
        exitCode: null,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({
        exitCode,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
      });
    });
  });
}

function makeBoardSummary(report) {
  const target = report.args.host ? `${report.args.host}:${report.args.port}` : "<missing Windows host>";
  if (report.ok && report.browserSmoke?.ran) {
    return [
      `Mac client browser smoke passed against ${target}; duration=${report.browserSmoke.durationMs}ms.`,
      `Preflight ready=${report.preflight?.readyToCall ? "yes" : "no"}; command used environment password, not argv.`,
      "No password was sent to Agent Link Board; inject was not executed.",
    ].join(" ");
  }
  if (report.preflightOnly || report.dryRun) {
    return [
      `Mac client browser smoke preflight for ${target}: ok=${report.preflight?.ok ? "yes" : "no"} ready=${report.preflight?.readyToCall ? "yes" : "no"}.`,
      `Next: run with --promptPassword when ready to authenticate; command=${report.commands?.browserSmoke || ""}.`,
      "No password was requested or sent; inject was not executed.",
    ].join(" ");
  }
  return [
    `Mac client browser smoke failed/blocked for ${target}: ${report.error?.message || report.browserSmoke?.error || "unknown"}.`,
    "Keep passwords off Agent Link Board; rerun preflight before retrying.",
    "Inject was not executed.",
  ].join(" ");
}

function printHuman(report) {
  console.log("Mac client formal browser smoke");
  console.log(`- target: ${report.args.host || "<missing>"}:${report.args.port}`);
  console.log(`- preflight: ok=${report.preflight?.ok ? "yes" : "no"} ready=${report.preflight?.readyToCall ? "yes" : "no"}`);
  if (report.preflight?.counts) {
    console.log(`- checklist: ${report.preflight.counts.blocker} blockers, ${report.preflight.counts.warning} warnings`);
  }
  if (report.dryRun) {
    console.log(`- dryRun command: ${report.commands.browserSmoke}`);
  } else if (report.preflightOnly) {
    console.log("- browser smoke: skipped (--preflightOnly)");
  } else if (report.browserSmoke?.ran) {
    console.log(`- browser smoke: ${report.browserSmoke.ok ? "passed" : "failed"} (${report.browserSmoke.durationMs}ms)`);
  }
  if (report.error?.message) console.log(`- error: ${report.error.message}`);
  console.log(report.boardSummary);
}

function makeReport(args, preflight) {
  return {
    ok: false,
    preflightOnly: args.preflightOnly,
    dryRun: args.dryRun,
    checkedAt: new Date().toISOString(),
    args: {
      host: args.host,
      port: args.port,
      clientHost: args.clientHost,
      clientPort: args.clientPort,
      debugPort: args.debugPort,
      skipBoard: args.skipBoard,
      allowDirty: args.allowDirty,
      allowPreflightWarnings: args.allowPreflightWarnings,
      skipAudio: args.skipAudio,
      skipFileClipboard: args.skipFileClipboard,
      allowClipboardFallback: args.allowClipboardFallback,
    },
    commands: {
      preflight: [
        "node scripts/mac/check-mac-client-formal-status.mjs",
        ...(args.host ? ["--host", args.host, "--port", String(args.port)] : []),
        "--boardSummary",
      ].join(" "),
      browserSmoke: makeBrowserArgs(args).join(" "),
    },
    preflight: preflight.payload,
    preflightRaw: {
      exitCode: preflight.exitCode,
      parseError: preflight.parseError,
    },
  };
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  const preflight = runPreflight(args);
  const report = makeReport(args, preflight);
  try {
    if (!args.host) {
      throw new Error("--host <Windows IP> is required. Run scripts/mac/discover-windows-hosts.mjs --boardSummary first if needed.");
    }
    if (!preflight.payload) {
      throw new Error(`formal checklist did not produce JSON: ${preflight.parseError || "unknown parse error"}`);
    }
    if (!preflight.payload.ok) {
      throw new Error(`formal checklist has blockers (${preflight.payload.counts?.blocker ?? "unknown"}).`);
    }
    if (!args.preflightOnly && !args.dryRun && !args.allowPreflightWarnings && !preflight.payload.readyToCall) {
      throw new Error("formal checklist is not readyToCall. Clear warnings/blockers or rerun preflight with board available before browser auth.");
    }
    if (args.preflightOnly) {
      report.ok = preflight.exitCode === 0;
    } else if (args.dryRun) {
      report.ok = true;
    } else {
      const password = await preparePassword(args);
      validatePassword(args, password);
      const browserSmoke = await runBrowserSmoke(args, password);
      report.browserSmoke = {
        ran: true,
        ok: browserSmoke.exitCode === 0 && !browserSmoke.timedOut,
        exitCode: browserSmoke.exitCode,
        timedOut: browserSmoke.timedOut,
        durationMs: browserSmoke.durationMs,
        stdout: redact(browserSmoke.stdout, password),
        stderr: redact(browserSmoke.stderr, password),
      };
      if (!report.browserSmoke.ok) {
        throw new Error(`browser smoke failed with exit=${browserSmoke.exitCode}${browserSmoke.timedOut ? " timed out" : ""}`);
      }
      report.ok = true;
    }
  } catch (error) {
    report.error = { message: redact(error.message, process.env.LAN_DUAL_PASSWORD || "") };
    report.ok = false;
  }
  report.boardSummary = makeBoardSummary(report);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printHuman(report);
  }
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ok: false, error: { message: redact(error.message, process.env.LAN_DUAL_PASSWORD || "") } }, null, 2));
  } else {
    console.error(`[FAIL] ${redact(error.message, process.env.LAN_DUAL_PASSWORD || "")}`);
  }
  process.exitCode = 1;
});
