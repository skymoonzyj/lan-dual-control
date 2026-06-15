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
  discover: false,
  discoverHosts: [],
  discoverSubnets: [],
  discoverNoLocalSubnets: false,
  discoverTimeoutMs: 650,
  discoverScanTimeoutMs: 0,
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
  --discover                     Find the best Windows host before preflight/auth.
  --discoverHost <host>          With --discover, probe this host directly. Repeatable.
  --discoverSubnet <cidr>        With --discover, scan this IPv4 subnet. Repeatable.
  --discoverNoLocalSubnets       With --discover, only probe 127.0.0.1 and explicit targets.
  --discoverTimeoutMs <ms>       Per-host discovery timeout. Default: ${defaults.discoverTimeoutMs}
  --discoverScanTimeoutMs <ms>   Overall discovery timeout. Default: auto
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
  node scripts/mac/run-mac-client-formal-smoke.mjs --discover --preflightOnly --boardSummary
  node scripts/mac/run-mac-client-formal-smoke.mjs --host 192.168.31.50 --port 43770 --promptPassword
  node scripts/mac/run-mac-client-formal-smoke.mjs --discover --promptPassword
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
      token === "--discover" ||
      token === "--discoverNoLocalSubnets" ||
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
    if ((token === "--discoverHost" || token === "--discoverWindowsHost") && next && !next.startsWith("--")) {
      args.discoverHosts.push(next.trim());
      index += 1;
      continue;
    }
    if (token === "--discoverSubnet" && next && !next.startsWith("--")) {
      args.discoverSubnets.push(next.trim());
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
      "discoverTimeoutMs",
      "discoverScanTimeoutMs",
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
  args.discoverHosts = [...new Set((args.discoverHosts || []).filter(Boolean))];
  args.discoverSubnets = [...new Set((args.discoverSubnets || []).filter(Boolean))];
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
  args.discoverTimeoutMs = clampInteger(args.discoverTimeoutMs, 100, 5000, defaults.discoverTimeoutMs);
  args.discoverScanTimeoutMs = clampInteger(args.discoverScanTimeoutMs, 0, 300000, defaults.discoverScanTimeoutMs);
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

function runDiscovery(args) {
  if (!args.discover) return { requested: false };
  const discoverArgs = [
    "scripts/mac/discover-windows-hosts.mjs",
    "--json",
    "--requireFound",
    "--timeoutMs",
    String(args.discoverTimeoutMs),
  ];
  if (args.discoverScanTimeoutMs > 0) {
    discoverArgs.push("--scanTimeoutMs", String(args.discoverScanTimeoutMs));
  }
  if (args.discoverNoLocalSubnets) {
    discoverArgs.push("--noLocalSubnets");
  }
  for (const host of args.discoverHosts) {
    discoverArgs.push("--host", host);
  }
  for (const subnet of args.discoverSubnets) {
    discoverArgs.push("--subnet", subnet);
  }
  if (args.port) discoverArgs.push("--port", String(args.port));
  const result = spawnSync(process.execPath, discoverArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(args.discoverScanTimeoutMs || 30000, 10000),
    maxBuffer: 12 * 1024 * 1024,
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
    requested: true,
    exitCode: result.status,
    stdout,
    stderr: String(result.stderr || ""),
    payload,
    parseError,
  };
}

function applyDiscovery(args, discovery) {
  if (!discovery?.requested) return;
  if (!discovery.payload) {
    throw new Error(`Windows host discovery did not produce JSON: ${discovery.parseError || "unknown parse error"}`);
  }
  if (!discovery.payload.ok || !discovery.payload.best) {
    throw new Error(`Windows host discovery found no usable Windows host (${discovery.payload.found?.length || 0} found).`);
  }
  args.host = String(discovery.payload.best.host || "").trim();
  args.port = clampInteger(discovery.payload.best.port, 1, 65535, args.port);
  if (!args.host) {
    throw new Error("Windows host discovery returned an empty host.");
  }
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

function hasWindowsHost(args) {
  return Boolean(String(args.host || "").trim());
}

function makeBrowserSmokeCommand(args) {
  if (!hasWindowsHost(args)) return "";
  return makeBrowserArgs(args).join(" ");
}

function makePreflightCommand(args) {
  return [
    "node scripts/mac/check-mac-client-formal-status.mjs",
    ...(args.host ? ["--host", args.host, "--port", String(args.port)] : []),
    "--boardSummary",
  ].join(" ");
}

function makeDiscoveryRetryCommand(args) {
  const command = [
    "node scripts/mac/run-mac-client-formal-smoke.mjs",
    "--discover",
    "--preflightOnly",
    "--boardSummary",
  ];
  if (args.discoverNoLocalSubnets) command.push("--discoverNoLocalSubnets");
  for (const host of args.discoverHosts || []) {
    command.push("--discoverHost", host);
  }
  for (const subnet of args.discoverSubnets || []) {
    command.push("--discoverSubnet", subnet);
  }
  if (args.port) command.push("--port", String(args.port));
  return command.join(" ");
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
  const discoveryText = report.discovery?.requested
    ? ` Discovery=${report.discovery.selected ? `${report.discovery.selected.host}:${report.discovery.selected.port}` : "requested"}.`
    : "";
  if (report.ok && report.browserSmoke?.ran) {
    return [
      `Mac client browser smoke passed against ${target}; duration=${report.browserSmoke.durationMs}ms.${discoveryText}`,
      `Preflight ready=${report.preflight?.readyToCall ? "yes" : "no"}; command used environment password, not argv.`,
      "No password was sent to Agent Link Board; inject was not executed.",
    ].join(" ");
  }
  if (report.preflightOnly || report.dryRun) {
    const nextText = report.commands?.browserSmoke
      ? `Next: run with --promptPassword when ready to authenticate; command=${report.commands.browserSmoke}.`
      : `Next: start or discover a Windows host, then rerun safe preflight; command=${report.commands?.discoverPreflight || ""}.`;
    return [
      `Mac client browser smoke preflight for ${target}: ok=${report.preflight?.ok ? "yes" : "no"} ready=${report.preflight?.readyToCall ? "yes" : "no"}.${discoveryText}`,
      nextText,
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
  if (report.discovery?.requested) {
    console.log(`- discovery: ${report.discovery.ok ? "ok" : "failed"}${report.discovery.selected ? ` selected=${report.discovery.selected.host}:${report.discovery.selected.port}` : ""}`);
  }
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
      discover: args.discover,
      discoverHosts: args.discoverHosts,
      discoverSubnets: args.discoverSubnets,
      discoverNoLocalSubnets: args.discoverNoLocalSubnets,
      discoverTimeoutMs: args.discoverTimeoutMs,
      discoverScanTimeoutMs: args.discoverScanTimeoutMs,
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
      preflight: makePreflightCommand(args),
      discoverPreflight: makeDiscoveryRetryCommand(args),
      browserSmoke: makeBrowserSmokeCommand(args),
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
  let discovery = { requested: false };
  try {
    discovery = runDiscovery(args);
    applyDiscovery(args, discovery);
  } catch (error) {
    const report = makeReport(args, {
      exitCode: null,
      payload: null,
      parseError: "",
    });
    report.discovery = summarizeDiscovery(discovery);
    report.error = { message: redact(error.message, process.env.LAN_DUAL_PASSWORD || "") };
    report.boardSummary = makeBoardSummary(report);
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else if (args.boardSummary) {
      console.log(report.boardSummary);
    } else {
      printHuman(report);
    }
    process.exitCode = 1;
    return;
  }
  const preflight = runPreflight(args);
  const report = makeReport(args, preflight);
  report.discovery = summarizeDiscovery(discovery);
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

function summarizeDiscovery(discovery) {
  if (!discovery?.requested) return { requested: false };
  const best = discovery.payload?.best || null;
  return {
    requested: true,
    ok: Boolean(discovery.payload?.ok && best),
    exitCode: discovery.exitCode,
    foundCount: Array.isArray(discovery.payload?.found) ? discovery.payload.found.length : 0,
    ignoredCount: Array.isArray(discovery.payload?.ignored) ? discovery.payload.ignored.length : 0,
    selected: best
      ? {
          host: best.host,
          port: best.port,
          deviceName: best.deviceName || best.name || "",
          buildId: best.runtime?.buildId || "",
          inputMode: best.capabilities?.input?.mode || best.capabilities?.inputMode || "",
        }
      : null,
    boardSummary: discovery.payload?.boardSummary || "",
    parseError: discovery.parseError || "",
  };
}

main().catch((error) => {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ok: false, error: { message: redact(error.message, process.env.LAN_DUAL_PASSWORD || "") } }, null, 2));
  } else {
    console.error(`[FAIL] ${redact(error.message, process.env.LAN_DUAL_PASSWORD || "")}`);
  }
  process.exitCode = 1;
});
