import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  server: process.env.CODEX_LINK_SERVER || "http://192.168.31.68:17888",
  host: "127.0.0.1",
  port: "43770",
  hostProvided: false,
  password: process.env.LAN_DUAL_PASSWORD || "demo-password",
  passwordProvided: false,
  promptPassword: false,
  requirePassword: true,
  discover: false,
  discoverNoLocalSubnets: false,
  discoverTimeoutMs: 1200,
  timeoutMs: 30000,
  videoDurationMs: 300000,
  audioDurationMs: 30000,
  minVideoFrames: 1200,
  minVideoFps: 5,
  maxVideoGapMs: 3000,
  minAudioFrames: 900,
  minAudioFps: 40,
  maxAudioGapMs: 1000,
  progressIntervalMs: 10000,
  width: 1920,
  height: 1080,
  fps: 60,
  bandwidthKbps: 50000,
  clientPort: 5197,
  debugPort: 9337,
  allowMockVideo: false,
  skipProbe: false,
  skipBrowser: false,
  skipAudio: false,
  skipClipboard: false,
  skipFileClipboard: false,
  skipInputLog: false,
  preflightOnly: false,
  checkClientDiagnostics: false,
  userAuthRequest: false,
  sendUserAuthRequest: false,
  json: false,
  boardSummary: false,
  fastProfile: false,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/check-mac-formal-e2e.mjs [options]

Runs the Windows-side formal E2E flow for a real Mac host. It reuses the safe
password support in probe-mac-host and test-windows-client-browser, passes the
password to child probes through LAN_DUAL_PASSWORD, and never sends inject.

Options:
  --host <host>                  Mac host address. Default: ${defaults.host}
  --port <port>                  Mac host port. Default: ${defaults.port}
  --discover                     Find the best Mac host with discover-lan-hosts before running.
  --discoverNoLocalSubnets       With --discover, only probe 127.0.0.1 and explicit --host targets.
  --discoverTimeoutMs <ms>       Per-host discovery timeout. Default: ${defaults.discoverTimeoutMs}
  --password <password>          Probe password. Prefer LAN_DUAL_PASSWORD or --promptPassword.
  --promptPassword               Prompt once for the password without echoing it.
  --requirePassword              Refuse empty/demo-password credentials. Default: on.
  --allowDemoPassword            Permit demo-password for local mock/dev probes only.
  --timeoutMs <ms>               Per-step timeout. Default: ${defaults.timeoutMs}
  --videoDurationMs <ms>         H.264 observation duration. Default: ${defaults.videoDurationMs}
  --audioDurationMs <ms>         PCM audio observation duration. Default: ${defaults.audioDurationMs}
  --minVideoFrames <count>       Required observed video frames. Default: ${defaults.minVideoFrames}
  --minVideoFps <fps>            Required observed video FPS. Default: ${defaults.minVideoFps}
  --maxVideoGapMs <ms>           Max video arrival gap. Default: ${defaults.maxVideoGapMs}
  --minAudioFrames <count>       Required observed audio frames. Default: ${defaults.minAudioFrames}
  --minAudioFps <fps>            Required observed audio FPS. Default: ${defaults.minAudioFps}
  --maxAudioGapMs <ms>           Max audio arrival gap. Default: ${defaults.maxAudioGapMs}
  --progressIntervalMs <ms>      Print media observation progress every N ms; 0 disables. Default: ${defaults.progressIntervalMs}
  --width <px>                   Requested width. Default: ${defaults.width}
  --height <px>                  Requested height. Default: ${defaults.height}
  --fps <fps>                    Requested refresh rate. Default: ${defaults.fps}
  --bandwidthKbps <kbps>         Requested max bandwidth. Default: ${defaults.bandwidthKbps}
  --clientPort <port>            Local Windows client web port. Default: ${defaults.clientPort}
  --debugPort <port>             Browser remote debugging port. Default: ${defaults.debugPort}
  --fastProfile                  Short local smoke profile: 10s video, 3s audio.
  --allowMockVideo               Do not require H.264/real video; useful for mock host checks.
  --skipProbe                    Skip protocol/media/clipboard/input-log probe.
  --skipBrowser                  Skip Windows client browser H.264 check.
  --skipAudio                    Skip PCM audio probe.
  --skipClipboard                Skip text and file clipboard probes.
  --skipFileClipboard            Skip file clipboard probe only.
  --skipInputLog                 Skip safe input-log probe.
  --preflightOnly                Only read /discovery and print readiness plus the formal run plan.
  --checkClientDiagnostics       With preflight, also run Windows client diagnostics against discovery runtime.
  --userAuthRequest              With preflight, print a NEED_USER_AUTH reminder for the next password step.
  --sendUserAuthRequest          With preflight, send NEED_USER_AUTH to Agent Link Board only when ready.
  --server <url>                 Agent Link Board URL for --sendUserAuthRequest. Default: ${defaults.server}
  --json                         With --preflightOnly, print a single JSON object including runPlan.
  --boardSummary                 Print a short secret-free Agent Link Board summary.
  runPlan.manualChecklist        Human true-test checklist for connection,
                                 video, audio, clipboard, input_ack, and diagnostics.
  --help, -h                     Show this help.

Examples:
  node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --preflightOnly
  node scripts/windows/check-mac-formal-e2e.mjs --discover --preflightOnly --boardSummary
  node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --preflightOnly --boardSummary
  node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --preflightOnly --checkClientDiagnostics --userAuthRequest
  node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --preflightOnly --checkClientDiagnostics --sendUserAuthRequest
  node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --promptPassword
  node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --promptPassword --fastProfile
  node scripts/windows/check-mac-formal-e2e.mjs --host 127.0.0.1 --allowDemoPassword --allowMockVideo --skipAudio --skipBrowser
`);
}

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);

    if (key === "allowDemoPassword") {
      args.requirePassword = false;
      continue;
    }
    if (
      key === "promptPassword" ||
      key === "requirePassword" ||
      key === "discover" ||
      key === "discoverNoLocalSubnets" ||
      key === "allowMockVideo" ||
      key === "skipProbe" ||
      key === "skipBrowser" ||
      key === "skipAudio" ||
      key === "skipClipboard" ||
      key === "skipFileClipboard" ||
      key === "skipInputLog" ||
      key === "preflightOnly" ||
      key === "checkClientDiagnostics" ||
      key === "userAuthRequest" ||
      key === "sendUserAuthRequest" ||
      key === "json" ||
      key === "boardSummary" ||
      key === "fastProfile"
    ) {
      args[key] = true;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(args, key) && next && !next.startsWith("--")) {
      if (key === "password") {
        args.passwordProvided = true;
      }
      if (key === "host") {
        args.hostProvided = true;
      }
      args[key] = next;
      index += 1;
    }
  }

  for (const key of [
    "timeoutMs",
    "videoDurationMs",
    "audioDurationMs",
    "minVideoFrames",
    "minVideoFps",
    "maxVideoGapMs",
    "minAudioFrames",
    "minAudioFps",
    "maxAudioGapMs",
    "progressIntervalMs",
    "width",
    "height",
    "fps",
    "bandwidthKbps",
    "clientPort",
    "debugPort",
    "discoverTimeoutMs",
  ]) {
    args[key] = Number(args[key]);
  }

  if (args.fastProfile) {
    args.videoDurationMs = 10000;
    args.audioDurationMs = 3000;
    args.minVideoFrames = args.allowMockVideo ? 5 : 30;
    args.minAudioFrames = 60;
  }

  return args;
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function formatDurationMs(ms) {
  const value = Math.max(0, Number(ms) || 0);
  if (value <= 0) return "0s";
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function makeFormalCommand(args) {
  return [
    "node",
    "scripts/windows/check-mac-formal-e2e.mjs",
    "--host", args.host,
    "--port", String(args.port),
    "--promptPassword",
  ].join(" ");
}

function makeFormalPowerShellCommand(args) {
  return [
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-mac-formal-e2e.ps1",
    "-HostName", args.host,
    "-Port", String(args.port),
    "-PromptPassword",
  ].join(" ");
}

function quoteCommandArg(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:=@-]+$/.test(text) ? text : JSON.stringify(text);
}

function makeDisplayCommand(script, args) {
  return ["node", script, ...args].map(quoteCommandArg).join(" ");
}

function makeManualChecklist(args) {
  const target = `${args.host}:${Number(args.port)}`;
  return [
    {
      id: "connection",
      label: "Connection",
      evidence: `Windows client status shows connected to Mac host ${target}; discovery/runtime build matches /discovery.`,
    },
    {
      id: "video",
      label: "Video",
      evidence: "Windows client shows Mac desktop frames, fresh frame age or clock-skew warning, and expected FPS/codec diagnostics.",
    },
    {
      id: "audio",
      label: "Audio",
      evidence: args.skipAudio
        ? "Audio probe is skipped in this run plan; rerun without --skipAudio before judging daily-use sound."
        : "Windows client receives and plays Mac system PCM audio without duplicate local/remote confusion.",
    },
    {
      id: "clipboard",
      label: "Clipboard",
      evidence: args.skipClipboard
        ? "Clipboard probe is skipped in this run plan; rerun without --skipClipboard before judging text/file copy."
        : "Text clipboard and file/zip clipboard transfer work in both the probe result and Windows client diagnostics.",
    },
    {
      id: "input_ack",
      label: "Input ack",
      evidence: args.skipInputLog
        ? "Input-log probe is skipped in this run plan; rerun without --skipInputLog before judging control acknowledgments."
        : "Mac host returns input_ack in log mode; no real system input injection is requested by this formal run.",
    },
    {
      id: "diagnostics",
      label: "Diagnostics",
      evidence: "Windows client event panel '复制诊断' or exported log includes connection, runtime build, FPS/frame-age, audio, clipboard, and input status.",
    },
  ];
}

function makeFormalRunPlan(args) {
  const probeExpectedMs =
    (Number(args.videoDurationMs) || 0) +
    (args.skipAudio ? 0 : Number(args.audioDurationMs) || 0);
  const browserTimeoutMs = Math.max(args.timeoutMs, 45000);
  const steps = [];
  if (!args.skipProbe) {
    steps.push({
      id: "protocol-media-clipboard-input-log",
      label: "Protocol, H.264, audio, clipboard, and input-log probe",
      script: "scripts/windows/probe-mac-host.mjs",
      command: makeDisplayCommand("scripts/windows/probe-mac-host.mjs", makeProbeArgs(args)),
      timeoutMs: args.timeoutMs,
      expectedDurationMs: probeExpectedMs,
      checks: {
        h264: !args.allowMockVideo,
        realVideo: !args.allowMockVideo,
        audio: !args.skipAudio,
        clipboardText: !args.skipClipboard,
        clipboardFile: !args.skipClipboard && !args.skipFileClipboard,
        inputLog: !args.skipInputLog,
        inject: false,
      },
    });
  }
  if (!args.skipBrowser) {
    steps.push({
      id: "windows-client-browser-h264",
      label: "Windows client browser discovery and H.264 canvas check",
      script: "scripts/windows/test-windows-client-browser.mjs",
      command: makeDisplayCommand("scripts/windows/test-windows-client-browser.mjs", makeBrowserArgs(args)),
      timeoutMs: browserTimeoutMs,
      expectedDurationMs: browserTimeoutMs,
      checks: {
        discoveryUi: true,
        h264: !args.allowMockVideo,
        inject: false,
      },
    });
  }

  return {
    target: { host: args.host, port: Number(args.port) },
    requiresPassword: true,
    passwordTransport: "LAN_DUAL_PASSWORD environment only",
    passwordInCommandArguments: false,
    inject: false,
    inputMode: args.skipInputLog ? "skipped" : "log",
    profile: args.fastProfile ? "fast" : "formal",
    video: {
      width: args.width,
      height: args.height,
      fps: args.fps,
      bandwidthKbps: args.bandwidthKbps,
      durationMs: args.videoDurationMs,
      minFrames: args.minVideoFrames,
      minFps: args.minVideoFps,
      maxGapMs: args.maxVideoGapMs,
      progressIntervalMs: args.progressIntervalMs,
      allowMockVideo: args.allowMockVideo,
    },
    audio: {
      skipped: args.skipAudio,
      durationMs: args.skipAudio ? 0 : args.audioDurationMs,
      minFrames: args.skipAudio ? 0 : args.minAudioFrames,
      minFps: args.skipAudio ? 0 : args.minAudioFps,
      maxGapMs: args.skipAudio ? null : args.maxAudioGapMs,
      progressIntervalMs: args.progressIntervalMs,
    },
    clipboard: {
      text: !args.skipClipboard,
      file: !args.skipClipboard && !args.skipFileClipboard,
    },
    manualChecklist: makeManualChecklist(args),
    steps,
    estimatedDurationMs: steps.reduce((total, step) => total + (Number(step.expectedDurationMs) || 0), 0),
  };
}

function statusFlag(value) {
  if (value === true) return "on";
  if (value === false) return "off";
  return "unknown";
}

function summarizeDisplays(report) {
  const displays = report.capabilities?.displays || [];
  if (!Array.isArray(displays) || displays.length === 0) return "none";
  return displays
    .map((display) => `${display.id || "display"}${display.primary ? "*" : ""}:${display.width || "?"}x${display.height || "?"}`)
    .join(",");
}

function makeBoardSummary(report, outcome = "preflight") {
  const prefix = outcome === "formal-success"
    ? "Windows formal Mac E2E finished"
    : "Windows formal Mac E2E preflight";
  if (!report.online) {
    return [
      `${prefix}: offline; target=${report.target.host}:${report.target.port}; error=${report.error?.message || "unknown"}.`,
      "Password was not requested and is not included.",
      `Next safe command after Mac host is online: ${report.command}.`,
      `Next safe PowerShell command after Mac host is online: ${report.formalPowerShellCommand}.`,
      "ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics.",
      "Inject was not used and still needs explicit user confirmation.",
    ].join(" ");
  }

  const failedChecks = Array.isArray(report.failedChecks) && report.failedChecks.length > 0
    ? report.failedChecks.map((check) => check.name).join(",")
    : "none";
  const state = outcome === "formal-success"
    ? "completed"
    : report.ok
      ? "ready"
      : `blocked(${failedChecks})`;
  const clientDiagnostics = report.clientDiagnostics?.requested
    ? report.clientDiagnostics.ok
      ? "passed"
      : "failed"
    : "skipped";
  const permissions = report.permissions || {};
  return [
    `${prefix}: ${state}; target=${report.target.host}:${report.target.port}; runtimeBuild=${report.runtime?.buildId || "unknown"}; runtimePid=${report.runtime?.processId || "unknown"}.`,
    `Capabilities h264=${statusFlag(report.capabilities?.h264Stream)} audio=${report.capabilities?.audioMode || statusFlag(report.capabilities?.audio)} clipboardText=${statusFlag(report.capabilities?.clipboardText)} clipboardFile=${statusFlag(report.capabilities?.clipboardFile)} inputMode=${report.capabilities?.inputMode || "missing"} mock=${statusFlag(report.capabilities?.mock)} maxScreenFps=${report.capabilities?.maxScreenFps || "unknown"}.`,
    `Permissions screen=${statusFlag(permissions.screenRecording)} accessibility=${statusFlag(permissions.accessibility)} inputMonitoring=${statusFlag(permissions.inputMonitoring)}; displays=${summarizeDisplays(report)}; clientDiagnostics=${clientDiagnostics}; failedChecks=${failedChecks}.`,
    "ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics.",
    `Safe formal command: ${report.command}. Password is not included; inject was not used and still needs explicit user confirmation.`,
    `Safe formal PowerShell command: ${report.formalPowerShellCommand}. Password is not included; inject was not used and still needs explicit user confirmation.`,
  ].join(" ");
}

function makeUserAuthRequest(report) {
  const target = `${report.target.host}:${report.target.port}`;
  if (!report.ok) {
    const failedChecks = Array.isArray(report.failedChecks) && report.failedChecks.length > 0
      ? report.failedChecks.map((check) => check.name).join(",")
      : "unknown";
    return [
      `NEED_USER_AUTH: 暂时不要输入正式密码，Windows 侧正式 Mac E2E 预检尚未 ready，target=${target}，failedChecks=${failedChecks}。`,
      `位置/步骤：先处理预检问题后重跑 node scripts/windows/check-mac-formal-e2e.mjs --host ${report.target.host} --port ${report.target.port} --preflightOnly --checkClientDiagnostics --boardSummary。`,
      "处理后请回复 预检已通过。",
    ].join(" ");
  }

  return [
    `NEED_USER_AUTH: 正式 Mac 端到端验收需要你在 Windows 本机隐藏输入 Mac host 正式密码，target=${target}。`,
    `位置/步骤：在 E:\\codex\\lan-dual-control 运行 ${report.command}。`,
    `PowerShell 等价：${report.formalPowerShellCommand}。`,
    "不要把密码发到联络板；本命令默认不执行 inject，inject 仍需你另行明确确认。",
    "处理后请回复 已输入密码并开始验收。",
  ].join(" ");
}

function attachBoardSummary(report, outcome = "preflight") {
  report.boardSummary = makeBoardSummary(report, outcome);
  report.userAuthRequest = makeUserAuthRequest(report);
  return report;
}

async function sendUserAuthRequest(args, report) {
  if (!args.sendUserAuthRequest) {
    return {
      requested: false,
      ok: null,
      exitCode: null,
      detail: "not requested",
      error: "",
    };
  }

  if (!report.ok) {
    return {
      requested: true,
      ok: false,
      exitCode: null,
      detail: "preflight is not ready; user auth request was not sent",
      error: "",
    };
  }

  const result = await runCapturedNode([
    "scripts/codex-link-client.mjs",
    "--server", args.server,
    "send",
    "--from", "Windows Codex",
    "--text", report.userAuthRequest,
  ], {
    cwd: repoRoot,
    timeoutMs: Math.min(Math.max(Number(args.timeoutMs) || defaults.timeoutMs, 5000), 30000),
  });
  const detail = result.ok ? "sent" : tailLines(`${result.stderr}\n${result.stdout}`, 3).join("; ") || `exit ${result.exitCode}`;
  return {
    requested: true,
    ok: result.ok,
    exitCode: result.exitCode,
    detail,
    error: result.ok ? "" : detail,
  };
}

function discoveryScannerArgs(args) {
  const scannerArgs = [
    "scripts/windows/discover-lan-hosts.mjs",
    "--json",
    "--requireMacHost",
    "--timeoutMs",
    String(args.discoverTimeoutMs),
    "--port",
    String(args.port),
  ];
  if (args.discoverNoLocalSubnets) {
    scannerArgs.push("--noLocalSubnets");
  }
  if (args.hostProvided) {
    scannerArgs.push("--host", args.host);
  }
  return scannerArgs;
}

function parseDiscoveryJson(text) {
  try {
    return JSON.parse(String(text || "").trim());
  } catch (error) {
    throw new Error(`Discovery did not print valid JSON: ${error.message}`);
  }
}

async function resolveTarget(args) {
  if (!args.discover) {
    return {
      requested: false,
      ok: true,
      source: "explicit",
      target: { host: args.host, port: Number(args.port) },
      command: "",
    };
  }

  const childArgs = discoveryScannerArgs(args);
  const command = `node ${childArgs.join(" ")}`;
  const result = await runCapturedNode(childArgs, {
    cwd: repoRoot,
    timeoutMs: Math.max(15000, Number(args.discoverTimeoutMs) * 12 + 8000),
  });
  let payload = null;
  try {
    payload = parseDiscoveryJson(result.stdout);
  } catch (error) {
    return {
      requested: true,
      ok: false,
      source: "discover-lan-hosts",
      command,
      error: {
        message: `${error.message}; scannerExit=${result.exitCode ?? "null"}; timedOut=${result.timedOut}`,
      },
      stdoutTail: tailLines(result.stdout),
      stderrTail: tailLines(result.stderr),
    };
  }

  const best = payload.bestMacHost || null;
  if (!result.ok || !best) {
    return {
      requested: true,
      ok: false,
      source: "discover-lan-hosts",
      command,
      scanned: payload.scanned || 0,
      foundMacHosts: Array.isArray(payload.macHosts) ? payload.macHosts.length : 0,
      boardSummary: payload.boardSummary || "",
      error: {
        message: payload.boardSummary || `No Mac host found by discovery; scannerExit=${result.exitCode ?? "null"}`,
      },
      raw: payload,
      stdoutTail: tailLines(result.stdout),
      stderrTail: tailLines(result.stderr),
    };
  }

  args.host = String(best.host);
  args.port = String(best.port);
  return {
    requested: true,
    ok: true,
    source: "discover-lan-hosts",
    command,
    target: { host: args.host, port: Number(args.port) },
    scanned: payload.scanned || 0,
    foundMacHosts: Array.isArray(payload.macHosts) ? payload.macHosts.length : 1,
    selected: best,
    boardSummary: payload.boardSummary || "",
  };
}

async function fetchDiscovery(args) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await fetch(`http://${args.host}:${args.port}/discovery`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const discovery = await response.json();
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - startedAt),
      discovery,
    };
  } finally {
    clearTimeout(timer);
  }
}

function makePreflightReport(args, discoveryResult) {
  const discovery = discoveryResult.discovery || null;
  const capabilities = discovery?.capabilities || {};
  const runtime = discovery?.runtime || null;
  const permissions = discovery?.permissions || capabilities.permissions || null;
  const displays = Array.isArray(capabilities.displays) ? capabilities.displays : [];
  const checks = [];
  const addCheck = (name, ok, detail = "") => {
    checks.push({ name, ok: Boolean(ok), detail });
  };

  addCheck("platform", discovery?.platform === "macos", discovery?.platform || "missing");
  addCheck("video", capabilities.video === true, `video=${String(capabilities.video)}`);
  addCheck(
    "h264",
    args.allowMockVideo || capabilities.h264Stream === true,
    `h264Stream=${String(capabilities.h264Stream)}${args.allowMockVideo ? " (mock allowed)" : ""}`,
  );
  addCheck(
    "realVideo",
    args.allowMockVideo || capabilities.mock !== true,
    `mock=${String(capabilities.mock)}${args.allowMockVideo ? " (mock allowed)" : ""}`,
  );
  if (!args.skipAudio) {
    addCheck("audio", capabilities.audio === true, `audio=${String(capabilities.audio)} / ${capabilities.audioMode || "mode unknown"}`);
  }
  if (!args.skipClipboard) {
    addCheck("clipboardText", capabilities.clipboardText === true, `clipboardText=${String(capabilities.clipboardText)}`);
    if (!args.skipFileClipboard) {
      addCheck("clipboardFile", capabilities.clipboardFile === true, `clipboardFile=${String(capabilities.clipboardFile)}`);
    }
  }
  if (!args.skipInputLog) {
    addCheck("inputMode", String(capabilities.inputMode || "").toLowerCase() === "log", `inputMode=${capabilities.inputMode || "missing"}`);
  }

  const failed = checks.filter((check) => !check.ok);
  return attachBoardSummary({
    ok: failed.length === 0,
    online: true,
    target: { host: args.host, port: Number(args.port) },
    latencyMs: discoveryResult.latencyMs,
    device: {
      id: discovery?.deviceId || "",
      name: discovery?.deviceName || discovery?.hostName || "",
      platform: discovery?.platform || "",
      role: discovery?.role || "",
    },
    runtime,
    permissions,
    capabilities: {
      video: capabilities.video === true,
      h264Stream: capabilities.h264Stream === true,
      audio: capabilities.audio === true,
      audioMode: capabilities.audioMode || "",
      clipboardText: capabilities.clipboardText === true,
      clipboardFile: capabilities.clipboardFile === true,
      inputMode: capabilities.inputMode || "",
      mock: capabilities.mock === true,
      capturePipeline: capabilities.capturePipeline || "",
      maxScreenFps: Number(capabilities.maxScreenFps) || null,
      displayCount: displays.length,
      displays,
    },
    checks,
    failedChecks: failed,
    clientDiagnostics: {
      requested: false,
      ok: null,
      detail: "not requested",
    },
    command: makeFormalCommand(args),
    formalPowerShellCommand: makeFormalPowerShellCommand(args),
    runPlan: makeFormalRunPlan(args),
  });
}

function makeOfflinePreflightReport(args, error) {
  return attachBoardSummary({
    ok: false,
    online: false,
    target: { host: args.host, port: Number(args.port) },
    error: {
      message: error.message,
      name: error.name || "Error",
    },
    checks: [
      {
        name: "discovery",
        ok: false,
        detail: error.message,
      },
    ],
    failedChecks: [
      {
        name: "discovery",
        ok: false,
        detail: error.message,
      },
    ],
    clientDiagnostics: {
      requested: false,
      ok: null,
      detail: "not requested",
    },
    command: makeFormalCommand(args),
    formalPowerShellCommand: makeFormalPowerShellCommand(args),
    runPlan: makeFormalRunPlan(args),
  });
}

function printRunPlan(runPlan) {
  if (!runPlan) return;
  const video = runPlan.video || {};
  const audio = runPlan.audio || {};
  const steps = Array.isArray(runPlan.steps) ? runPlan.steps : [];
  print(
    "INFO",
    `Formal run plan: steps=${steps.length} profile=${runPlan.profile || "formal"} estimated=${formatDurationMs(runPlan.estimatedDurationMs)} video=${video.width || "?"}x${video.height || "?"}@${video.fps || "?"}Hz/${Math.round((Number(video.bandwidthKbps) || 0) / 1000)}Mbps audio=${audio.skipped ? "skipped" : formatDurationMs(audio.durationMs)} inject=${runPlan.inject}.`,
  );
  print("INFO", `Password handling: ${runPlan.passwordTransport}; passwordInCommandArguments=${runPlan.passwordInCommandArguments}.`);
  for (const [index, step] of steps.entries()) {
    print(
      "INFO",
      `Plan ${index + 1}: ${step.label}; expected=${formatDurationMs(step.expectedDurationMs)}; timeout=${formatDurationMs(step.timeoutMs)}; command=${step.command}`,
    );
  }
  const manualChecklist = Array.isArray(runPlan.manualChecklist) ? runPlan.manualChecklist : [];
  if (manualChecklist.length > 0) {
    print("INFO", "Manual true-test checklist:");
    for (const item of manualChecklist) {
      print("INFO", `- ${item.id}: ${item.evidence}`);
    }
  }
}

function printFormalStepStart(step, index, totalSteps, runPlan) {
  print(
    "INFO",
    `Starting plan ${index + 1}/${totalSteps}: ${step.label}; expected about ${formatDurationMs(step.expectedDurationMs)}, timeout ${formatDurationMs(step.timeoutMs)}.`,
  );
  if (step.id === "protocol-media-clipboard-input-log") {
    const video = runPlan.video || {};
    const audio = runPlan.audio || {};
    print(
      "INFO",
      `Plan ${index + 1} is the long media probe: after the first H.264 frame it keeps observing video for ${formatDurationMs(video.durationMs)}${audio.skipped ? "" : `, then audio for ${formatDurationMs(audio.durationMs)}`}. Progress prints every ${formatDurationMs(video.progressIntervalMs)}; this part can look quiet if progress is disabled.`,
    );
  }
  if (step.id === "windows-client-browser-h264") {
    print(
      "INFO",
      `Plan ${index + 1} opens the Windows client page and waits for connected H.264 canvas/FPS diagnostics. It has its own progress snapshots every ${formatDurationMs(runPlan.video?.progressIntervalMs)}.`,
    );
  }
}

function printFormalStepDone(step, index, totalSteps) {
  print("OK", `Finished plan ${index + 1}/${totalSteps}: ${step.label}`);
}

function printPreflightReport(report) {
  if (!report.online) {
    print("ERROR", `Mac host discovery offline: ${report.error?.message || "unknown error"}`);
    print("INFO", `Target: ${report.target.host}:${report.target.port}`);
    print("INFO", "Ask Mac side to confirm the host is running before entering the password.");
    printRunPlan(report.runPlan);
    return;
  }

  print("OK", `Mac host discovery: ${report.device.name || "Mac host"} / ${report.target.host}:${report.target.port} / ${report.latencyMs}ms`);
  if (report.runtime) {
    print("INFO", `Runtime: pid=${report.runtime.processId || "?"} build=${report.runtime.buildId || "?"} uptime=${report.runtime.uptimeSeconds || "?"}s`);
  }
  print(
    "INFO",
    `Capabilities: h264=${report.capabilities.h264Stream} audio=${report.capabilities.audio} clipboardText=${report.capabilities.clipboardText} clipboardFile=${report.capabilities.clipboardFile} inputMode=${report.capabilities.inputMode || "missing"} mock=${report.capabilities.mock}`,
  );
  if (report.capabilities.displayCount > 0) {
    const displays = report.capabilities.displays
      .map((display) => `${display.id || "display"}${display.primary ? "*" : ""}:${display.width || "?"}x${display.height || "?"}`)
      .join(", ");
    print("INFO", `Displays: ${displays}`);
  }
  for (const check of report.checks) {
    print(check.ok ? "OK" : "WARN", `${check.name}: ${check.detail}`);
  }
  print("INFO", `Formal command: ${report.command}`);
  printRunPlan(report.runPlan);
}

function summarizeDiagnosticsOutput(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines
    .filter((line) => line.startsWith("[OK]") || line.startsWith("[FAIL]"))
    .slice(-3)
    .join("; ") || lines.at(-1) || "";
}

async function runClientDiagnostics(args, report) {
  const childArgs = [
    "scripts/windows/test-windows-client-browser.mjs",
    "--diagnosticsOnly",
    "--host", args.host,
    "--port", String(args.port),
    "--clientPort", String(args.clientPort),
    "--debugPort", String(args.debugPort),
    "--timeoutMs", String(Math.max(args.timeoutMs, 45000)),
    "--progressIntervalMs", String(args.progressIntervalMs),
  ];
  const runtimeBuildId = String(report.runtime?.buildId || "").trim();
  if (runtimeBuildId) {
    childArgs.push("--expectDiscoveryRuntimeBuildId", runtimeBuildId);
  }

  const startedAt = performance.now();
  const result = await runCapturedNode(childArgs, {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    timeoutMs: Math.max(args.timeoutMs + 15000, 60000),
  });
  const detail = result.ok
    ? runtimeBuildId
      ? `passed; runtimeBuild=${runtimeBuildId}; ${summarizeDiagnosticsOutput(result.stdout)}`
      : `passed; runtime build unavailable so runtime-id check was skipped; ${summarizeDiagnosticsOutput(result.stdout)}`
    : `failed; ${summarizeDiagnosticsOutput(`${result.stdout}\n${result.stderr}`) || `exit ${result.exitCode}`}`;
  return {
    requested: true,
    ok: result.ok,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    elapsedMs: Math.round(performance.now() - startedAt),
    runtimeBuildId: runtimeBuildId || "",
    command: `node ${childArgs.join(" ")}`,
    detail,
    stdoutTail: tailLines(result.stdout),
    stderrTail: tailLines(result.stderr),
  };
}

function runCapturedNode(childArgs, { cwd, timeoutMs }) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, childArgs, {
      cwd,
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolveRun(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({
        ok: false,
        exitCode: null,
        timedOut: true,
        stdout,
        stderr,
      });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        ok: false,
        exitCode: null,
        timedOut: false,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      finish({
        ok: exitCode === 0,
        exitCode,
        timedOut: false,
        stdout,
        stderr,
      });
    });
  });
}

function tailLines(text, limit = 8) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-limit);
}

async function runPreflight(args) {
  const discoverySelection = await resolveTarget(args);
  if (discoverySelection.requested && !discoverySelection.ok) {
    const report = makeOfflinePreflightReport(args, new Error(discoverySelection.error?.message || "Mac host discovery failed"));
    report.discoverySelection = discoverySelection;
    attachBoardSummary(report);
    report.sentUserAuthRequest = await sendUserAuthRequest(args, report);
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else if (args.userAuthRequest || args.sendUserAuthRequest) {
      console.log(report.userAuthRequest);
    } else if (args.boardSummary) {
      console.log(report.boardSummary);
    } else {
      printPreflightReport(report);
    }
    process.exitCode = 1;
    return report;
  }

  let report;
  try {
    report = makePreflightReport(args, await fetchDiscovery(args));
  } catch (error) {
    report = makeOfflinePreflightReport(args, error);
  }
  report.discoverySelection = discoverySelection;
  if (report.online && args.checkClientDiagnostics) {
    report.clientDiagnostics = await runClientDiagnostics(args, report);
    report.checks.push({
      name: "windowsClientDiagnostics",
      ok: report.clientDiagnostics.ok,
      detail: report.clientDiagnostics.detail,
    });
    report.failedChecks = report.checks.filter((check) => !check.ok);
    report.ok = report.failedChecks.length === 0;
    attachBoardSummary(report);
    report.discoverySelection = discoverySelection;
  }

  report.sentUserAuthRequest = await sendUserAuthRequest(args, report);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.userAuthRequest || args.sendUserAuthRequest) {
    console.log(report.userAuthRequest);
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printPreflightReport(report);
  }
  process.exitCode = report.ok && (!args.sendUserAuthRequest || report.sentUserAuthRequest.ok) ? 0 : 1;
  return report;
}

async function preparePassword(args) {
  if (args.promptPassword && args.passwordProvided) {
    throw new Error("--promptPassword cannot be combined with --password.");
  }
  if (args.promptPassword && process.env.LAN_DUAL_PASSWORD) {
    throw new Error("--promptPassword refuses to override an existing LAN_DUAL_PASSWORD. Unset it or omit --promptPassword.");
  }
  if (args.promptPassword) {
    args.password = await promptHidden("Mac host password: ");
    if (!args.password) {
      throw new Error("Password cannot be empty when --promptPassword is used.");
    }
  }
  const effectivePassword = String(args.password || "");
  if (args.requirePassword && !effectivePassword) {
    throw new Error("LAN_DUAL_PASSWORD is required. Set it in the environment, pass --password, or use --promptPassword.");
  }
  if (args.requirePassword && effectivePassword === "demo-password") {
    throw new Error("Refusing to use demo-password. Use --promptPassword/LAN_DUAL_PASSWORD, or --allowDemoPassword for local mock checks.");
  }
}

function promptHidden(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.reject(new Error("--promptPassword requires an interactive terminal."));
  }

  return new Promise((resolvePrompt, rejectPrompt) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    const previousRawMode = stdin.isRaw;
    let value = "";
    let settled = false;

    const cleanup = () => {
      stdin.off("data", onData);
      if (typeof stdin.setRawMode === "function") {
        stdin.setRawMode(Boolean(previousRawMode));
      }
      stdin.pause();
    };
    const finish = (result, error = null) => {
      if (settled) return;
      settled = true;
      cleanup();
      stdout.write("\n");
      if (error) rejectPrompt(error);
      else resolvePrompt(result);
    };
    const onData = (chunk) => {
      const text = String(chunk);
      for (const char of text) {
        const code = char.charCodeAt(0);
        if (char === "\r" || char === "\n") {
          finish(value);
          return;
        }
        if (code === 3) {
          finish("", new Error("Password prompt cancelled."));
          return;
        }
        if (code === 8 || code === 127) {
          value = value.slice(0, -1);
          continue;
        }
        if (code >= 32) {
          value += char;
        }
      }
    };

    stdout.write(label);
    stdin.resume();
    stdin.setEncoding("utf8");
    if (typeof stdin.setRawMode === "function") {
      stdin.setRawMode(true);
    }
    stdin.on("data", onData);
  });
}

function runNode(script, childArgs, { env, cwd }) {
  return new Promise((resolveRun, rejectRun) => {
    print("RUN", `node ${script} ${childArgs.join(" ")}`);
    const child = spawn(process.execPath, [script, ...childArgs], {
      cwd,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(new Error(`${script} exited ${code}`));
      }
    });
  });
}

function makeProbeArgs(args) {
  const probeArgs = [
    "--host", args.host,
    "--port", String(args.port),
    "--timeoutMs", String(args.timeoutMs),
    "--width", String(args.width),
    "--height", String(args.height),
    "--fps", String(args.fps),
    "--bandwidthKbps", String(args.bandwidthKbps),
    "--durationMs", String(args.videoDurationMs),
    "--minVideoFrames", String(args.minVideoFrames),
    "--minVideoFps", String(args.minVideoFps),
    "--maxVideoGapMs", String(args.maxVideoGapMs),
    "--progressIntervalMs", String(args.progressIntervalMs),
  ];
  if (args.requirePassword) {
    probeArgs.push("--requirePassword");
  }

  if (!args.allowMockVideo) {
    probeArgs.push("--requireH264", "--expectInputMode", "log");
  }
  if (!args.skipAudio) {
    probeArgs.push(
      "--requireAudio",
      "--observeAudioMs", String(args.audioDurationMs),
      "--minAudioFrames", String(args.minAudioFrames),
      "--minAudioFps", String(args.minAudioFps),
      "--maxAudioGapMs", String(args.maxAudioGapMs),
    );
  }
  if (!args.skipClipboard) {
    probeArgs.push("--clipboardText");
    if (!args.skipFileClipboard) {
      probeArgs.push("--clipboardFile", "--clipboardFileBytes", "128");
    }
  }
  if (!args.skipInputLog) {
    probeArgs.push("--inputEvents");
  }
  return probeArgs;
}

function makeBrowserArgs(args) {
  const browserArgs = [
    "--host", args.host,
    "--port", String(args.port),
    "--clientPort", String(args.clientPort),
    "--debugPort", String(args.debugPort),
    "--timeoutMs", String(Math.max(args.timeoutMs, 45000)),
    "--progressIntervalMs", String(args.progressIntervalMs),
  ];
  if (args.requirePassword) {
    browserArgs.push("--requirePassword");
  }
  if (!args.allowMockVideo) {
    browserArgs.push("--requireH264");
  }
  return browserArgs;
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }

  const args = parseArgs(process.argv);
  if (args.json && !args.preflightOnly) {
    throw new Error("--json is only supported with --preflightOnly.");
  }
  if (args.userAuthRequest && !args.preflightOnly) {
    throw new Error("--userAuthRequest is only supported with --preflightOnly.");
  }
  if (args.sendUserAuthRequest && !args.preflightOnly) {
    throw new Error("--sendUserAuthRequest is only supported with --preflightOnly.");
  }
  if (args.preflightOnly) {
    await runPreflight(args);
    return;
  }

  const preflightReport = await runPreflight({ ...args, json: false, boardSummary: false });
  if (!preflightReport.ok) {
    throw new Error("Preflight failed. Fix the Mac host readiness issue before entering the password.");
  }

  await preparePassword(args);
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  const childEnv = {
    ...process.env,
    LAN_DUAL_PASSWORD: args.password,
  };

  print("INFO", `Target: ${args.host}:${args.port}`);
  print("INFO", "Password will be passed to child probes through LAN_DUAL_PASSWORD, not command arguments.");
  print("INFO", args.allowMockVideo ? "Video mode: mock/dev allowed." : "Video mode: requiring real H.264 Mac host.");
  print("INFO", args.skipInputLog ? "Input-log probe skipped." : "Input-log probe enabled; inject is not used.");

  const runPlan = preflightReport.runPlan || makeFormalRunPlan(args);
  const plannedSteps = Array.isArray(runPlan.steps) ? runPlan.steps : [];
  const probeStep = plannedSteps.find((step) => step.id === "protocol-media-clipboard-input-log");
  const browserStep = plannedSteps.find((step) => step.id === "windows-client-browser-h264");

  if (!args.skipProbe) {
    const index = probeStep ? plannedSteps.indexOf(probeStep) : 0;
    printFormalStepStart(probeStep || { label: "Protocol, H.264, audio, clipboard, and input-log probe", timeoutMs: args.timeoutMs }, index, plannedSteps.length || 2, runPlan);
    await runNode("scripts/windows/probe-mac-host.mjs", makeProbeArgs(args), { env: childEnv, cwd: repoRoot });
    printFormalStepDone(probeStep || { label: "Protocol, H.264, audio, clipboard, and input-log probe" }, index, plannedSteps.length || 2);
  }
  if (!args.skipBrowser) {
    const index = browserStep ? plannedSteps.indexOf(browserStep) : args.skipProbe ? 0 : 1;
    printFormalStepStart(browserStep || { label: "Windows client browser discovery and H.264 canvas check", timeoutMs: Math.max(args.timeoutMs, 45000) }, index, plannedSteps.length || 2, runPlan);
    await runNode("scripts/windows/test-windows-client-browser.mjs", makeBrowserArgs(args), { env: childEnv, cwd: repoRoot });
    printFormalStepDone(browserStep || { label: "Windows client browser discovery and H.264 canvas check" }, index, plannedSteps.length || 2);
  }

  print("OK", "Formal Mac E2E checks finished.");
  if (args.boardSummary) {
    console.log(attachBoardSummary(preflightReport, "formal-success").boardSummary);
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
