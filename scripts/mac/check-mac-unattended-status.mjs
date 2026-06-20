#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const codexLinkClient = process.env.LAN_DUAL_CODEX_LINK_CLIENT || "scripts/codex-link-client.mjs";
const hostRuntimePaths = [
  "apps/mac-host/Package.swift",
  "apps/mac-host/Sources",
];

const defaults = {
  host: "127.0.0.1",
  port: 43770,
  timeoutMs: 3000,
  server: "http://192.168.31.68:17888",
  device: "Mac Unattended",
  role: "Mac 值守",
  label: "com.lan-dual-control.mac-host",
  launchAgentPath: path.join(os.homedir(), "Library", "LaunchAgents", "com.lan-dual-control.mac-host.plist"),
  json: false,
  boardSummary: false,
  sendStatus: false,
  requireHostOnline: false,
  requireLaunchAgent: false,
  requireLaunchAgentMaxFps: false,
  requireLaunchAgentLoaded: false,
  requireControlPermissions: false,
  strict: false,
  skipLaunchctl: false,
  skipPmset: false,
  help: false,
};
const formalTargetMaxScreenFps = 60;

function printHelp() {
  console.log(`Usage: node scripts/mac/check-mac-unattended-status.mjs [options]

Checks Mac controlled-end unattended readiness without changing system state.
It is read-only: it does not create or load LaunchAgents, does not start Mac
host, does not authenticate WebSocket, does not request or print passwords, and
does not send input events.

Options:
  --host <host>                  Mac host discovery host. Default: ${defaults.host}
  --port <port>                  Mac host discovery port. Default: ${defaults.port}
  --timeoutMs <ms>               Per probe timeout. Default: ${defaults.timeoutMs}
  --label <launchd label>        LaunchAgent label. Default: ${defaults.label}
  --launchAgentPath <path>       LaunchAgent plist path. Default:
                                 ${defaults.launchAgentPath}
  --requireHostOnline            Fail if Mac host /discovery is offline.
  --requireLaunchAgent           Fail if LaunchAgent plist is missing.
  --requireLaunchAgentMaxFps     Fail if LaunchAgent maxScreenFps is missing or below ${formalTargetMaxScreenFps}.
  --requireLaunchAgentLoaded     Fail if launchctl does not show the label loaded.
  --requireControlPermissions    Fail if Screen Recording or Accessibility is off.
  --strict                       Treat warnings as failures.
  --skipLaunchctl                Do not run launchctl print; useful for local tests.
  --skipPmset                    Do not run pmset; useful for local tests.
  --boardSummary                 Print a short secret-free Agent Link Board summary.
  --sendStatus                   Send the summary to Agent Link Board as
                                 device "${defaults.device}" by default.
  --server <url>                 Agent Link Board URL. Default: ${defaults.server}
  --device <name>                Agent Link Board status device. Default: ${defaults.device}
  --role <role>                  Agent Link Board status role. Default: ${defaults.role}
  --json                         Print one machine-readable JSON object.
  --help, -h                     Show this help without probing anything.

By default this command is read-only and does not write to Agent Link Board.
Only --sendStatus posts the MacUnattendedHealth= summary.

Machine-readable JSON fields:
  host                           Mac host /discovery status, permissions, inputMode.
  launchAgent                    LaunchAgent plist existence and launchctl loaded status.
  macHostAuthPath                Secret-free formal-auth guidance for the
                                 current LaunchAgent password mode, exposed
                                 as MacHostAuthPath= in board summaries.
  power                          pmset sleep/display/network-wake snapshot and risk notes.
  limitations                    Lock screen, display sleep, system sleep, reboot/login limits.
  macPowerHealth                 Stable ok|warning|unknown power risk summary
                                  exposed as MacPowerHealth= in board
                                  summaries. Detailed warning tags include
                                  system-sleep-enabled, display-sleep-enabled,
                                  and network-wake-disabled.
  macUnattendedHealth            Stable ok|warning|blocked health summary
                                  exposed as MacUnattendedHealth= in board
                                  summaries.
  commands.launchAgentPlan       Secret-free LaunchAgent dry-run planner command.
  commands.macMaxFpsPlan         Secret-free LaunchAgent dry-run planner command
                                  for the formal 60Hz max-FPS target.
  commands.macUnattendedStatus   Secret-free exact rerun command for this
                                  report; preserves host/port/path and require flags.
  commands.macUnattendedSendStatus
                                  Secret-free exact rerun command that also
                                  posts the independent "Mac Unattended"
                                  Agent Link Board status; it uses the default
                                  board URL and never requests a password.
  commands.macPowerPlan           Secret-free read-only power settings preview
                                  command; prints pmset and verification
                                  commands but does not run or apply them.
  commands.macRemoteAudioPlan     Secret-free read-only remote-only audio plan;
                                  explains that system-pcm capture does not
                                  mute local speakers or change volume/output.
  commands.macRemoteAudioStatus   Secret-free read-only remote audio status
                                  command; checks system-pcm capture and
                                  current output volume/mute without changing
                                  volume/output.
  commands.macRemoteAudioSendStatus
                                  Secret-free read-only remote audio status
                                  refresh command; posts "Mac Remote Audio" to
                                  Agent Link Board without changing volume/output.
  commands.macInputSafetyPlan     Secret-free read-only input safety plan;
                                  keeps real input blocked until the user is
                                  watching and does not change system state.
  commands.macInputSafetyStatus   Secret-free read-only input safety status
                                  gate; probes /discovery only and keeps real
                                  input blocked until the user is watching.
  commands.macInputSafetySendStatus
                                  Secret-free read-only input safety status
                                  refresh; posts "Mac Input Safety" to Agent
                                  Link Board without sending input.
  commands.macSafeInjectRehearsal Secret-free read-only safe inject rehearsal
                                  planner; checks userPresence and prints copy-
                                  only steps without starting inject.
  commands.macManualUxStatus      Secret-free read-only post-PASS manual UX
                                  status command; it only reports which
                                  checks still need a person at the keyboard.
  commands.macManualUxSendStatus  Secret-free manual UX status refresh command;
                                  posts status only, without messages, calls,
                                  passwords, auth, or input.
  commands.macClientManualChecklist
                                  User-visible Mac client manual checklist
                                  action for local page session diagnostics;
                                  it reminds the user to verify copied
                                  diagnostics do not include a connection
                                  password.
  commands.macUnattendedFormal   Secret-free formal 60Hz gate command requiring
                                  LaunchAgent maxScreenFps and loaded status.
  commands.macHostSafeStart      Secret-free foreground Mac host safe-start
                                  command; prompts for password locally.
  commands.macMaxFpsSafeStart    Secret-free foreground Mac host safe-start
                                  command for the formal 60Hz target; prompts
                                  locally, never embeds a password, and does
                                  not send input.
  commands.macHostStop           Secret-free local stop command for the
                                  current Mac host /discovery process; does
                                  not authenticate or request a password.
  commands.macLaunchAgentLoad    Manual launchctl bootstrap command for the
                                  checked LaunchAgent plist.
  commands.macLaunchAgentPrint   Manual launchctl print command for verifying
                                  the checked LaunchAgent label.
  commands.macHostReadiness      Follow-up Mac host readiness command with the
                                  standard MacHostReadiness label.
  commands.hostReadiness         Follow-up Mac host readiness command.
  commands.macHostMedia          Follow-up Mac host media baseline command;
                                  prompts locally and never embeds a password
                                  in argv.
  commands.macResumeStatus       Follow-up Mac resume status command with the
                                  standard MacResumeStatus label.
  commands.windowsHostStatus     Secret-free Windows-side local host status
                                  command for the active Mac -> Windows
                                  preflight call; it does not authenticate,
                                  request a password, or send input.
  commands.windowsHostReadiness  Secret-free Windows-side local host readiness
                                  command for the active Mac -> Windows
                                  preflight call; it does not authenticate,
                                  request a password, or send input.
  commands.macFormalLocalSmoke   Follow-up formal H.264 + PCM + input-log
                                  short validation command; prompts locally
                                  and never embeds a password in argv.
  commands.macClientBrowserSelfTest
                                  Secret-free local Mac client browser self-test.
                                  It uses a mock Windows host and does not use
                                  a real host password, Agent Link call, input,
                                  or inject.
  commands.macScriptHelp         Unified side-effect-free Mac script help
                                  self-check command.

Examples:
  node scripts/mac/check-mac-unattended-status.mjs --boardSummary
  node scripts/mac/check-mac-unattended-status.mjs --json --requireLaunchAgent
`);
}

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
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
      token === "--json" ||
      token === "--boardSummary" ||
      token === "--requireHostOnline" ||
      token === "--requireLaunchAgent" ||
      token === "--requireLaunchAgentMaxFps" ||
      token === "--requireLaunchAgentLoaded" ||
      token === "--requireControlPermissions" ||
      token === "--strict" ||
      token === "--skipLaunchctl" ||
      token === "--skipPmset" ||
      token === "--sendStatus"
    ) {
      args[token.slice(2)] = true;
      continue;
    }
    if (token === "--host" && next && !next.startsWith("--")) {
      args.host = next.trim();
      index += 1;
      continue;
    }
    if (token === "--port" && next && !next.startsWith("--")) {
      args.port = clampInteger(next, 1, 65535, defaults.port);
      index += 1;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampInteger(next, 500, 60000, defaults.timeoutMs);
      index += 1;
      continue;
    }
    if (token === "--server" && next && !next.startsWith("--")) {
      args.server = next.trim();
      index += 1;
      continue;
    }
    if (token === "--device" && next && !next.startsWith("--")) {
      args.device = next.trim();
      index += 1;
      continue;
    }
    if (token === "--role" && next && !next.startsWith("--")) {
      args.role = next.trim();
      index += 1;
      continue;
    }
    if (token === "--label" && next && !next.startsWith("--")) {
      args.label = next.trim();
      index += 1;
      continue;
    }
    if (token === "--launchAgentPath" && next && !next.startsWith("--")) {
      args.launchAgentPath = path.resolve(next);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  args.host = String(args.host || defaults.host).trim();
  args.server = String(args.server || defaults.server).trim().replace(/\/+$/, "");
  args.device = String(args.device || defaults.device).trim() || defaults.device;
  args.role = String(args.role || defaults.role).trim() || defaults.role;
  return args;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function command(commandName, commandArgs, options = {}) {
  const result = spawnSync(commandName, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: options.timeoutMs || 3000,
    maxBuffer: 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    error: result.error?.message || "",
  };
}

function getGitBuildId() {
  const result = command("git", ["rev-parse", "--short", "HEAD"], { timeoutMs: 3000 });
  return result.ok ? normalizedText(result.stdout) : "";
}

function getChangedHostRuntimeFiles(fromBuildId, toBuildId) {
  const from = normalizedText(fromBuildId);
  const to = normalizedText(toBuildId || "HEAD") || "HEAD";
  if (!from) return null;
  const revParse = command("git", ["rev-parse", "--verify", "--quiet", `${from}^{commit}`], { timeoutMs: 3000 });
  if (!revParse.ok) return null;
  const diff = command("git", ["diff", "--name-only", `${from}..${to}`, "--", ...hostRuntimePaths], { timeoutMs: 3000 });
  if (!diff.ok) return null;
  return splitLines(diff.stdout);
}

function makeBuildDiff(runtimeBuildId, currentBuildId) {
  const from = normalizedText(runtimeBuildId);
  const to = normalizedText(currentBuildId);
  if (!from || !to) {
    return {
      differs: false,
      fromBuildId: from,
      toBuildId: to,
      comparable: false,
      changedHostRuntimeFiles: null,
      changedHostRuntimeFileCount: null,
      severity: "unknown",
      message: "Build comparison unavailable because runtime.buildId or current git build is missing.",
    };
  }
  if (from === to) {
    return {
      differs: false,
      fromBuildId: from,
      toBuildId: to,
      comparable: true,
      changedHostRuntimeFiles: [],
      changedHostRuntimeFileCount: 0,
      severity: "ok",
      message: "Running host build matches current git.",
    };
  }

  const changedFiles = getChangedHostRuntimeFiles(from, to);
  if (!Array.isArray(changedFiles)) {
    return {
      differs: true,
      fromBuildId: from,
      toBuildId: to,
      comparable: false,
      changedHostRuntimeFiles: null,
      changedHostRuntimeFileCount: null,
      severity: "warning",
      message: `Running host build ${from} differs from current git ${to}; local git history cannot prove whether Mac host runtime changed.`,
    };
  }
  if (changedFiles.length === 0) {
    return {
      differs: true,
      fromBuildId: from,
      toBuildId: to,
      comparable: true,
      changedHostRuntimeFiles: [],
      changedHostRuntimeFileCount: 0,
      severity: "stale-metadata",
      message: `No Mac host runtime source changes since ${from}; behavior is likely current, but build metadata is stale.`,
    };
  }
  return {
    differs: true,
    fromBuildId: from,
    toBuildId: to,
    comparable: true,
    changedHostRuntimeFiles: changedFiles,
    changedHostRuntimeFileCount: changedFiles.length,
    severity: "restart-recommended",
    message: `Mac host runtime source changed since ${from}; restart before unattended or formal validation.`,
  };
}

function requestJson(url, timeoutMs) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 512 * 1024) {
          request.destroy(new Error("response too large"));
        }
      });
      response.on("end", () => {
        if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
          resolve({ ok: false, status: response.statusCode || 0, error: `HTTP ${response.statusCode || 0}` });
          return;
        }
        try {
          resolve({ ok: true, status: response.statusCode || 0, payload: JSON.parse(body) });
        } catch (error) {
          resolve({ ok: false, status: response.statusCode || 0, error: `invalid JSON: ${error.message}` });
        }
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error(`timed out after ${timeoutMs}ms`));
    });
    request.on("error", (error) => {
      resolve({ ok: false, status: 0, error: error.message });
    });
  });
}

async function checkHost(args) {
  const url = `http://${args.host}:${args.port}/discovery`;
  const result = await requestJson(url, args.timeoutMs);
  const payload = result.payload || {};
  return {
    checked: true,
    online: Boolean(result.ok),
    url,
    status: result.status || 0,
    error: result.ok ? "" : result.error || "unknown",
    deviceName: String(payload.deviceName || payload.name || ""),
    inputMode: String(payload.inputMode || payload.capabilities?.inputMode || payload.capabilities?.input?.mode || ""),
    permissions: payload.permissions || {},
    runtime: payload.runtime || {},
    capabilities: payload.capabilities || {},
    buildDiff: {},
  };
}

function readLaunchAgentPlist(args) {
  const exists = existsSync(args.launchAgentPath);
  let label = "";
  let programArguments = [];
  let readable = false;
  let error = "";
  if (exists) {
    try {
      const text = readFileSync(args.launchAgentPath, "utf8");
      readable = true;
      label = extractPlistLabel(text);
      programArguments = extractPlistProgramArguments(text);
    } catch (readError) {
      error = readError.message;
    }
  }
  const maxScreenFps = getProgramArgumentNumber(programArguments, "--maxScreenFps");
  const passwordMode = detectLaunchAgentPasswordMode(programArguments);
  return {
    path: args.launchAgentPath,
    exists,
    readable,
    label: label || args.label,
    labelMatches: !label || label === args.label,
    programArguments,
    maxScreenFps,
    passwordMode,
    error,
  };
}

function extractPlistLabel(text) {
  const match = String(text || "").match(/<key>\s*Label\s*<\/key>\s*<string>\s*([^<]+?)\s*<\/string>/i);
  return match ? xmlUnescape(match[1]).trim() : "";
}

function extractPlistProgramArguments(text) {
  const arrayMatch = String(text || "").match(/<key>\s*ProgramArguments\s*<\/key>\s*<array>([\s\S]*?)<\/array>/i);
  if (!arrayMatch) return [];
  return [...arrayMatch[1].matchAll(/<string>\s*([\s\S]*?)\s*<\/string>/gi)]
    .map((match) => xmlUnescape(match[1]).trim())
    .filter(Boolean);
}

function xmlUnescape(value) {
  return String(value || "")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function getProgramArgumentNumber(programArguments, key) {
  const items = Array.isArray(programArguments) ? programArguments : [];
  for (let index = 0; index < items.length; index += 1) {
    const item = String(items[index] || "");
    if (item === key) {
      const parsed = Number(items[index + 1]);
      return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
    }
    if (item.startsWith(`${key}=`)) {
      const parsed = Number(item.slice(key.length + 1));
      return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
    }
  }
  return null;
}

function hasProgramArgument(programArguments, key) {
  const items = Array.isArray(programArguments) ? programArguments : [];
  return items.some((item) => String(item || "") === key);
}

function detectLaunchAgentPasswordMode(programArguments) {
  if (!Array.isArray(programArguments) || programArguments.length === 0) return "unknown";
  if (hasProgramArgument(programArguments, "--ephemeralPassword")) return "ephemeral";
  if (hasProgramArgument(programArguments, "--promptPassword")) return "prompt";
  if (hasProgramArgument(programArguments, "--requirePassword")) return "env-required";
  return "none";
}

function checkLaunchctl(args) {
  if (args.skipLaunchctl) {
    return { checked: false, loaded: null, summary: "skipped", error: "" };
  }
  if (os.platform() !== "darwin") {
    return { checked: false, loaded: null, summary: "unsupported platform", error: "" };
  }
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (!Number.isInteger(uid)) {
    return { checked: false, loaded: null, summary: "uid unavailable", error: "" };
  }
  const result = spawnSync("launchctl", ["print", `gui/${uid}/${args.label}`], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(1000, args.timeoutMs),
    maxBuffer: 1024 * 1024,
  });
  return {
    checked: true,
    loaded: result.status === 0,
    summary: result.status === 0 ? "loaded" : "not loaded",
    error: result.status === 0 ? "" : String(result.stderr || result.stdout || "").trim().slice(0, 240),
  };
}

function checkLaunchAgent(args) {
  const plist = readLaunchAgentPlist(args);
  const launchctl = checkLaunchctl(args);
  return {
    ...plist,
    launchctl,
    installed: plist.exists && plist.readable && plist.labelMatches,
    loaded: launchctl.loaded,
  };
}

function runPmset(args) {
  if (args.skipPmset) {
    return { checked: false, ok: null, raw: "", settings: {}, summary: "skipped", warnings: [] };
  }
  if (os.platform() !== "darwin") {
    return { checked: false, ok: null, raw: "", settings: {}, summary: "unsupported platform", warnings: [] };
  }
  const result = spawnSync("pmset", ["-g", "custom"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(1000, args.timeoutMs),
    maxBuffer: 1024 * 1024,
  });
  const raw = String(result.stdout || result.stderr || "");
  const settings = parsePmset(raw);
  const risks = classifyPowerRisks(settings);
  const warnings = classifyPowerWarnings(risks);
  return {
    checked: true,
    ok: result.status === 0,
    raw: raw.slice(0, 12000),
    settings,
    risks,
    summary: summarizePower(settings),
    warnings,
  };
}

function parsePmset(text) {
  const profiles = {};
  let section = "current";
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const heading = trimmed.match(/^(.+):$/);
    if (heading) {
      section = heading[1].toLowerCase().replace(/\s+/g, "-");
      profiles[section] ||= {};
      continue;
    }
    const match = trimmed.match(/^([A-Za-z][A-Za-z0-9 _-]*?)\s+(-?\d+)\b/);
    if (!match) continue;
    profiles[section] ||= {};
    const key = match[1].trim().toLowerCase().replace(/\s+/g, "");
    profiles[section][key] = Number(match[2]);
  }
  return profiles;
}

function settingValues(settings, keys) {
  const values = [];
  for (const [profile, data] of Object.entries(settings || {})) {
    for (const key of keys) {
      if (Number.isFinite(data[key])) values.push({ profile, key, value: data[key] });
    }
  }
  return values;
}

function classifyPowerRisks(settings) {
  const risks = [];
  const sleep = settingValues(settings, ["sleep"]);
  if (sleep.some((item) => item.value > 0)) {
    risks.push({
      id: "system-sleep-enabled",
      text: "System sleep is enabled in at least one power profile; a sleeping Mac will not stay controllable.",
    });
  }
  const displaySleep = settingValues(settings, ["displaysleep"]);
  if (displaySleep.some((item) => item.value > 0)) {
    risks.push({
      id: "display-sleep-enabled",
      text: "Display sleep is enabled in at least one power profile; ScreenCaptureKit behavior still needs real Mac verification after display sleep.",
    });
  }
  const wakeNetwork = settingValues(settings, ["womp", "tcpkeepalive"]);
  if (wakeNetwork.length > 0 && wakeNetwork.every((item) => item.value === 0)) {
    risks.push({
      id: "network-wake-disabled",
      text: "Wake for network access/tcpkeepalive appears disabled; unattended reconnect after idle may be unreliable.",
    });
  }
  return risks;
}

function classifyPowerWarnings(risks) {
  const items = Array.isArray(risks) ? risks : [];
  if (items.length === 0) return [];
  return [items.map((item) => item.text).filter(Boolean).join(" ")];
}

function summarizePower(settings) {
  const sleep = settingValues(settings, ["sleep"]);
  const display = settingValues(settings, ["displaysleep"]);
  const wake = settingValues(settings, ["womp", "tcpkeepalive"]);
  const summarize = (items) => items.length === 0
    ? "unknown"
    : items.map((item) => `${item.profile}:${item.value}`).join(",");
  return `sleep=${summarize(sleep)} displaySleep=${summarize(display)} networkWake=${summarize(wake)}`;
}

function makeLimitations() {
  return [
    "Lock screen: verify with real Mac because an active logged-in user session is still required for many screen/audio paths.",
    "Display sleep: may keep the host process alive, but ScreenCaptureKit behavior must be verified on the real Mac/display.",
    "System sleep: host becomes unreachable unless the Mac wakes for network; avoid sleep for dependable unattended control.",
    "Reboot: LaunchAgent can start after user login, but pre-login remote control is not proven by this project yet.",
    "Real input injection: keep inputMode=log for unattended checks; inject requires the user watching and explicit confirmation.",
  ];
}

function addFinding(findings, level, id, text) {
  findings.push({ level, id, text });
}

function buildFindings({ args, host, launchAgent, power }) {
  const findings = [];
  if (!host.online) {
    addFinding(findings, args.requireHostOnline ? "blocker" : "warning", "host-offline", `Mac host is offline at ${args.host}:${args.port}.`);
  } else {
    if (host.buildDiff?.severity === "restart-recommended") {
      addFinding(findings, "warning", "mac-host-build-stale", `${host.buildDiff.message} Stop the current host with ${makeMacHostStopCommand(args)}, then restart with ${makeMacMaxFpsSafeStartCommand(args)} or load the prepared LaunchAgent.`);
    }
    if (host.inputMode && host.inputMode !== "log") {
      addFinding(findings, "blocker", "input-mode", `Mac host inputMode=${host.inputMode}; unattended checks should stay in log mode.`);
    }
    if (args.requireControlPermissions && host.permissions?.screenRecording !== true) {
      addFinding(findings, "blocker", "screen-recording", "Screen Recording permission is not confirmed.");
    } else if (host.permissions?.screenRecording !== true) {
      addFinding(findings, "warning", "screen-recording", "Screen Recording permission is not confirmed; real video may fail or fall back.");
    }
    if (args.requireControlPermissions && host.permissions?.accessibility !== true) {
      addFinding(findings, "blocker", "accessibility", "Accessibility permission is not confirmed.");
    } else if (host.permissions?.accessibility !== true) {
      addFinding(findings, "warning", "accessibility", "Accessibility permission is not confirmed; real input injection cannot work.");
    }
  }

  const launchAgentMissingLevel = args.requireLaunchAgent || args.requireLaunchAgentMaxFps ? "blocker" : "warning";
  const launchAgentMaxFpsLevel = args.requireLaunchAgentMaxFps ? "blocker" : "warning";
  if (!launchAgent.exists) {
    addFinding(findings, launchAgentMissingLevel, "launch-agent-missing", `LaunchAgent plist is missing at ${launchAgent.path}.`);
  } else if (!launchAgent.labelMatches) {
    addFinding(findings, "warning", "launch-agent-label", `LaunchAgent label is ${launchAgent.label}; expected ${args.label}.`);
  } else if (launchAgent.readable && launchAgent.maxScreenFps === null) {
    addFinding(findings, launchAgentMaxFpsLevel, "launch-agent-max-fps", `LaunchAgent maxScreenFps is not explicit; start helper default is 30FPS, below the formal ${formalTargetMaxScreenFps}Hz target. For foreground validation use ${makeMacMaxFpsSafeStartCommand(args)}; for persistence review ${makeLaunchAgentPlanCommand(args, { maxScreenFps: formalTargetMaxScreenFps })}.`);
  } else if (launchAgent.readable && launchAgent.maxScreenFps < formalTargetMaxScreenFps) {
    addFinding(findings, launchAgentMaxFpsLevel, "launch-agent-max-fps", `LaunchAgent maxScreenFps=${launchAgent.maxScreenFps}; formal ${formalTargetMaxScreenFps}Hz validation will keep reporting a remote FPS limit until the foreground 60Hz safe start or max-FPS LaunchAgent plan is used: ${makeMacMaxFpsSafeStartCommand(args)}; dry-run plan: ${makeLaunchAgentPlanCommand(args, { maxScreenFps: formalTargetMaxScreenFps })}.`);
  }
  if (args.requireLaunchAgentLoaded && !launchAgent.launchctl.checked) {
    addFinding(findings, "blocker", "launch-agent-loaded-unchecked", `LaunchAgent ${args.label} loaded status was not checked.`);
  } else if (args.requireLaunchAgentLoaded && launchAgent.launchctl.checked && launchAgent.loaded !== true) {
    addFinding(findings, "blocker", "launch-agent-not-loaded", `LaunchAgent ${args.label} is not loaded. To transition without guessing: stop the current host with ${makeMacHostStopCommand(args)}, manually load the LaunchAgent with ${makeMacLaunchAgentLoadCommand(args)}, then verify with ${makeMacUnattendedFormalCommand(args)}.`);
  } else if (launchAgent.launchctl.checked && launchAgent.loaded !== true) {
    addFinding(findings, "warning", "launch-agent-not-loaded", `LaunchAgent ${args.label} is not loaded. If the plist is ready, stop the current host with ${makeMacHostStopCommand(args)}, manually load with ${makeMacLaunchAgentLoadCommand(args)}, then verify with ${makeMacUnattendedFormalCommand(args)}.`);
  }

  for (const warning of power.warnings || []) {
    addFinding(findings, "warning", "power", warning);
  }
  return findings;
}

function makeCommands(args) {
  return {
    macUnattendedStatus: makeMacUnattendedStatusCommand(args),
    macUnattendedFormal: makeMacUnattendedFormalCommand(args),
    launchAgentPlan: makeLaunchAgentPlanCommand(args),
    macMaxFpsPlan: makeLaunchAgentPlanCommand(args, { maxScreenFps: formalTargetMaxScreenFps }),
    macUnattendedSendStatus: makeMacUnattendedSendStatusCommand(args),
    macPowerPlan: makeMacPowerPlanCommand(),
    macRemoteAudioPlan: makeMacRemoteAudioPlanCommand(),
    macRemoteAudioStatus: makeMacRemoteAudioStatusCommand(args),
    macRemoteAudioSendStatus: makeMacRemoteAudioSendStatusCommand(args),
    macInputSafetyPlan: makeMacInputSafetyPlanCommand(),
    macInputSafetyStatus: makeMacInputSafetyStatusCommand(args),
    macInputSafetySendStatus: makeMacInputSafetySendStatusCommand(args),
    macSafeInjectRehearsal: makeMacSafeInjectRehearsalCommand(args),
    macManualUxStatus: makeMacManualUxStatusCommand(),
    macManualUxSendStatus: makeMacManualUxSendStatusCommand(),
    macClientManualChecklist: makeMacClientManualChecklistAction(),
    macHostSafeStart: makeMacHostSafeStartCommand(args),
    macMaxFpsSafeStart: makeMacMaxFpsSafeStartCommand(args),
    macHostStop: makeMacHostStopCommand(args),
    macLaunchAgentLoad: makeMacLaunchAgentLoadCommand(args),
    macLaunchAgentPrint: makeMacLaunchAgentPrintCommand(args),
    hostStatus: `node scripts/mac/start-mac-host.mjs --status --host ${args.host} --port ${args.port} --boardSummary`,
    macHostReadiness: `node scripts/mac/check-mac-host-readiness.mjs --host ${args.host} --port ${args.port} --checkBoard --boardSummary`,
    hostReadiness: `node scripts/mac/check-mac-host-readiness.mjs --host ${args.host} --port ${args.port} --checkBoard --boardSummary`,
    macHostMedia: makeMacHostMediaCommand(args),
    macResumeStatus: makeMacResumeStatusCommand(args),
    windowsHostStatus: makeWindowsHostStatusCommand(),
    windowsHostReadiness: makeWindowsHostReadinessCommand(),
    macFormalLocalSmoke: makeMacFormalLocalSmokeCommand(args),
    macClientBrowserSelfTest: makeMacClientBrowserSelfTestCommand(),
    macScriptHelp: makeMacScriptHelpCommand(),
    startHost: `node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port ${args.port}`,
    stopHost: makeMacHostStopCommand(args),
    launchAgentPath: args.launchAgentPath,
    launchAgentLabel: args.label,
  };
}

function buildMacHostAuthPath(report) {
  const mode = report.launchAgent?.passwordMode || "unknown";
  const base = {
    mode,
    next: "MacHostStop->MacMaxFpsSafeStart->MacHostMedia",
    command: report.commands.macMaxFpsSafeStart,
  };
  if (mode === "ephemeral") {
    return {
      ...base,
      status: "prompt-password-required",
      reason: "launch-agent-ephemeral-password",
      note: "LaunchAgent uses a random runtime password that is not shared; formal auth needs a foreground prompt-password restart with the same temporary password typed locally on both sides.",
    };
  }
  if (mode === "prompt") {
    return {
      ...base,
      status: "prompt-password-configured",
      reason: "launch-agent-prompt-password",
      note: "LaunchAgent is configured for a visible prompt-password path; a user must still enter the same temporary password locally for formal auth.",
    };
  }
  if (mode === "env-required") {
    return {
      ...base,
      status: "env-password-required",
      reason: "launch-agent-env-required",
      note: "LaunchAgent requires an externally supplied password; do not put it on Agent Link Board or in command arguments.",
    };
  }
  if (mode === "none") {
    return {
      ...base,
      status: "no-password-required",
      reason: "launch-agent-no-password",
      note: "LaunchAgent ProgramArguments do not require a password; review before formal auth.",
    };
  }
  return {
    ...base,
    status: "unknown",
    reason: report.launchAgent?.exists ? "launch-agent-auth-mode-unknown" : "launch-agent-missing",
    note: "LaunchAgent password mode is unknown; use a foreground prompt-password safe start before formal auth.",
  };
}

function makeMacHostStopCommand(args) {
  return [
    "node scripts/mac/start-mac-host.mjs",
    "--stop",
    "--host",
    shellQuote(args.host),
    "--port",
    String(args.port),
  ].join(" ");
}

function statusProbeHost(args = {}) {
  const host = args.host || defaults.host;
  return host === "0.0.0.0" || host === "::" ? defaults.host : host;
}

function makeMacResumeStatusCommand(args = {}) {
  return [
    "node scripts/mac/check-mac-resume-status.mjs",
    "--host",
    shellQuote(statusProbeHost(args)),
    "--port",
    String(args.port || defaults.port),
    "--checkBoard",
    "--boardSummary",
  ].join(" ");
}

function makeMacHostMediaCommand(args = {}) {
  return [
    "node scripts/mac/check-mac-host-readiness.mjs",
    "--host",
    shellQuote(statusProbeHost(args)),
    "--port",
    String(args.port || defaults.port),
    "--checkBoard",
    "--probeMedia",
    "--probeMediaResourceSample",
    "--promptPassword",
    "--boardSummary",
  ].join(" ");
}

function makeMacLaunchAgentLoadCommand(args) {
  return `launchctl bootstrap gui/$(id -u) ${shellQuote(args.launchAgentPath)}`;
}

function makeMacLaunchAgentPrintCommand(args) {
  return `launchctl print gui/$(id -u)/${shellQuote(args.label)}`;
}

function makeLaunchAgentPlanCommand(args, { maxScreenFps = null } = {}) {
  const parts = [
    "node scripts/mac/install-mac-host-launch-agent.mjs",
    "--launchAgentPath",
    shellQuote(args.launchAgentPath),
    "--port",
    String(args.port),
  ];
  if (args.label !== defaults.label) parts.push("--label", shellQuote(args.label));
  if (maxScreenFps !== null) parts.push("--maxScreenFps", String(maxScreenFps));
  parts.push("--boardSummary");
  return parts.join(" ");
}

function makeMacHostSafeStartCommand(args) {
  return [
    "node scripts/mac/start-mac-host.mjs",
    "--promptPassword",
    "--requirePassword",
    "--host",
    "0.0.0.0",
    "--port",
    String(args.port),
  ].join(" ");
}

function makeMacMaxFpsSafeStartCommand(args) {
  return [
    "node scripts/mac/start-mac-host.mjs",
    "--promptPassword",
    "--requirePassword",
    "--host",
    "0.0.0.0",
    "--port",
    String(args.port),
    "--maxScreenFps",
    String(formalTargetMaxScreenFps),
  ].join(" ");
}

function makeMacFormalLocalSmokeCommand(args) {
  return [
    "node scripts/mac/check-mac-formal-local-smoke.mjs",
    "--host",
    shellQuote(args.host),
    "--port",
    String(args.port),
    "--promptPassword",
    "--boardSummary",
  ].join(" ");
}

function makeWindowsHostStatusCommand() {
  return "node scripts/windows/start-windows-host.mjs --status --host 127.0.0.1 --port 43770 --boardSummary";
}

function makeWindowsHostReadinessCommand() {
  return "node scripts/windows/check-windows-host-readiness.mjs --host 127.0.0.1 --port 43770 --checkBoard --boardSummary";
}

function makeMacScriptHelpCommand() {
  return "node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary";
}

function makeMacClientBrowserSelfTestCommand() {
  return "node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs --boardSummary";
}

function makeMacPowerPlanCommand() {
  return [
    "node scripts/mac/plan-mac-power-settings.mjs",
    "--profile",
    "all",
    "--sleep",
    "0",
    "--displaySleep",
    "0",
    "--networkWake",
    "on",
    "--boardSummary",
  ].join(" ");
}

function makeMacRemoteAudioPlanCommand() {
  return "node scripts/mac/plan-mac-remote-audio.mjs --boardSummary";
}

function makeMacRemoteAudioStatusCommand(args) {
  return [
    "node scripts/mac/check-mac-remote-audio-status.mjs",
    "--host",
    shellQuote(args.host),
    "--port",
    String(args.port),
    "--boardSummary",
  ].join(" ");
}

function makeMacRemoteAudioSendStatusCommand(args) {
  return [
    "node scripts/mac/check-mac-remote-audio-status.mjs",
    "--host",
    shellQuote(args.host),
    "--port",
    String(args.port),
    "--server",
    shellQuote(defaults.server),
    "--sendStatus",
    "--boardSummary",
  ].join(" ");
}

function makeMacInputSafetyPlanCommand() {
  return "node scripts/mac/plan-mac-input-safety.mjs --boardSummary";
}

function makeMacInputSafetyStatusCommand(args) {
  return [
    "node scripts/mac/check-mac-input-safety-status.mjs",
    "--host",
    shellQuote(args.host),
    "--port",
    String(args.port),
    "--checkBoard",
    "--boardSummary",
  ].join(" ");
}

function makeMacInputSafetySendStatusCommand(args) {
  return [
    "node scripts/mac/check-mac-input-safety-status.mjs",
    "--host",
    shellQuote(args.host),
    "--port",
    String(args.port),
    "--checkBoard",
    "--server",
    shellQuote(defaults.server),
    "--sendStatus",
    "--boardSummary",
  ].join(" ");
}

function makeMacSafeInjectRehearsalCommand(args) {
  return [
    "node scripts/mac/plan-mac-safe-inject-rehearsal.mjs",
    "--host",
    shellQuote(args.host),
    "--port",
    String(args.port),
    "--checkBoard",
    "--boardSummary",
  ].join(" ");
}

function makeMacManualUxStatusCommand() {
  return "node scripts/mac/check-mac-manual-ux-status.mjs --boardSummary";
}

function makeMacManualUxSendStatusCommand() {
  return `node scripts/mac/check-mac-manual-ux-status.mjs --server ${shellQuote(defaults.server)} --sendStatus --boardSummary`;
}

function makeMacClientManualChecklistAction() {
  return "Mac client 会话诊断查看“手工清单”：连接/视频/音频/剪贴板/文件/窗口/全屏/原画/input_ack/复制诊断；复制诊断会带出同一行，粘贴前确认不包含连接密码";
}

function makeMacUnattendedFormalCommand(args) {
  const parts = [
    "node scripts/mac/check-mac-unattended-status.mjs",
    "--host",
    shellQuote(args.host),
    "--port",
    String(args.port),
    "--launchAgentPath",
    shellQuote(args.launchAgentPath),
  ];
  if (args.timeoutMs !== defaults.timeoutMs) parts.push("--timeoutMs", String(args.timeoutMs));
  if (args.label !== defaults.label) parts.push("--label", shellQuote(args.label));
  parts.push("--requireLaunchAgentMaxFps", "--requireLaunchAgentLoaded", "--boardSummary");
  return parts.join(" ");
}

function makeMacUnattendedStatusCommand(args) {
  const parts = [
    "node scripts/mac/check-mac-unattended-status.mjs",
    "--host",
    shellQuote(args.host),
    "--port",
    String(args.port),
    "--launchAgentPath",
    shellQuote(args.launchAgentPath),
  ];
  if (args.timeoutMs !== defaults.timeoutMs) parts.push("--timeoutMs", String(args.timeoutMs));
  if (args.label !== defaults.label) parts.push("--label", shellQuote(args.label));
  if (args.requireHostOnline) parts.push("--requireHostOnline");
  if (args.requireLaunchAgent) parts.push("--requireLaunchAgent");
  if (args.requireLaunchAgentMaxFps) parts.push("--requireLaunchAgentMaxFps");
  if (args.requireLaunchAgentLoaded) parts.push("--requireLaunchAgentLoaded");
  if (args.requireControlPermissions) parts.push("--requireControlPermissions");
  if (args.strict) parts.push("--strict");
  if (args.skipLaunchctl) parts.push("--skipLaunchctl");
  if (args.skipPmset) parts.push("--skipPmset");
  parts.push("--boardSummary");
  return parts.join(" ");
}

function makeMacUnattendedSendStatusCommand(args) {
  const parts = [
    "node scripts/mac/check-mac-unattended-status.mjs",
    "--host",
    shellQuote(args.host),
    "--port",
    String(args.port),
    "--launchAgentPath",
    shellQuote(args.launchAgentPath),
    "--server",
    defaults.server,
  ];
  if (args.timeoutMs !== defaults.timeoutMs) parts.push("--timeoutMs", String(args.timeoutMs));
  if (args.label !== defaults.label) parts.push("--label", shellQuote(args.label));
  if (args.requireHostOnline) parts.push("--requireHostOnline");
  if (args.requireLaunchAgent) parts.push("--requireLaunchAgent");
  if (args.requireLaunchAgentMaxFps) parts.push("--requireLaunchAgentMaxFps");
  if (args.requireLaunchAgentLoaded) parts.push("--requireLaunchAgentLoaded");
  if (args.requireControlPermissions) parts.push("--requireControlPermissions");
  if (args.strict) parts.push("--strict");
  if (args.skipLaunchctl) parts.push("--skipLaunchctl");
  if (args.skipPmset) parts.push("--skipPmset");
  parts.push("--sendStatus", "--boardSummary");
  return parts.join(" ");
}

function shellQuote(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function makeBoardSummary(report) {
  const blockersList = report.findings.filter((item) => item.level === "blocker");
  const warningsList = report.findings.filter((item) => item.level === "warning");
  const blockers = blockersList.length;
  const warnings = warningsList.length;
  const attention = blockers > 0
    ? `attention=${blockers} blocker(s)`
    : warnings > 0
      ? `attention=${warnings} warning(s)`
      : "attention=none";
  const findingSummary = `blockers=${blockers > 0 ? summarizeFindingIds(blockersList) : "none"} warnings=${warnings > 0 ? summarizeFindingIds(warningsList) : "none"}`;
  const hostBuildDetail = formatBoardBuildDiff(report.host.buildDiff);
  const host = report.host.online
    ? `online inputMode=${report.host.inputMode || "unknown"} build=${report.host.runtime?.buildId || "unknown"}${hostBuildDetail ? ` ${hostBuildDetail}` : ""}`
    : `offline ${report.args.host}:${report.args.port}`;
  const perms = report.host.online
    ? `permissions=screen:${boolText(report.host.permissions?.screenRecording)} accessibility:${boolText(report.host.permissions?.accessibility)} inputMonitoring:${boolText(report.host.permissions?.inputMonitoring)}`
    : "permissions=unknown";
  const agent = `launchAgent=${report.launchAgent.exists ? "file-present" : "missing"} loaded=${report.launchAgent.loaded === null ? "unknown" : boolText(report.launchAgent.loaded)}`;
  const agentMaxFps = report.launchAgent.maxScreenFps === null ? "unknown" : String(report.launchAgent.maxScreenFps);
  const suggestedAction = report.suggestedAction?.boardSummary || "";
  const powerHealth = formatMacPowerHealthSummary(report.macPowerHealth);
  const unattendedHealth = formatMacUnattendedHealthSummary(report.macUnattendedHealth);
  const authPath = formatMacHostAuthPathSummary(report.macHostAuthPath);
  return [
    `Mac unattended status: host=${host}; ${perms}; ${agent} maxFps=${agentMaxFps}; power=${report.power.summary}; ${powerHealth}; ${unattendedHealth}; ${authPath}; ${attention}${findingSummary ? ` ${findingSummary}` : ""}${suggestedAction ? ` ${suggestedAction}` : ""}.`,
    `MacUnattendedStatus=${report.commands.macUnattendedStatus}; MacUnattendedSendStatus=${report.commands.macUnattendedSendStatus}; MacPowerPlan=${report.commands.macPowerPlan}; MacRemoteAudioPlan=${report.commands.macRemoteAudioPlan}; MacRemoteAudioStatus=${report.commands.macRemoteAudioStatus}; MacRemoteAudioSendStatus=${report.commands.macRemoteAudioSendStatus}; MacInputSafetyPlan=${report.commands.macInputSafetyPlan}; MacInputSafetyStatus=${report.commands.macInputSafetyStatus}; MacInputSafetySendStatus=${report.commands.macInputSafetySendStatus}; MacSafeInjectRehearsal=${report.commands.macSafeInjectRehearsal}; MacManualUxStatus=${report.commands.macManualUxStatus}; MacManualUxSendStatus=${report.commands.macManualUxSendStatus}; MacClientManualChecklist=${report.commands.macClientManualChecklist}; MacHostSafeStart=${report.commands.macHostSafeStart}; MacMaxFpsSafeStart=${report.commands.macMaxFpsSafeStart}; MacHostStop=${report.commands.macHostStop}; MacLaunchAgentLoad=${report.commands.macLaunchAgentLoad}; MacLaunchAgentPrint=${report.commands.macLaunchAgentPrint}; MacLaunchAgentPlan=${report.commands.launchAgentPlan}; MacMaxFpsPlan=${report.commands.macMaxFpsPlan}; MacUnattendedFormal=${report.commands.macUnattendedFormal}; MacHostReadiness=${report.commands.macHostReadiness}; HostReadiness=${report.commands.hostReadiness}; MacHostMedia=${report.commands.macHostMedia}; MacResumeStatus=${report.commands.macResumeStatus}; WindowsHostStatus=${report.commands.windowsHostStatus}; WindowsHostReadiness=${report.commands.windowsHostReadiness}; MacFormalLocalSmoke=${report.commands.macFormalLocalSmoke}; MacClientBrowserSelfTest=${report.commands.macClientBrowserSelfTest}; MacScriptHelp=${report.commands.macScriptHelp}.`,
    "Limits: lock/display-sleep/reboot-login still need real Mac verification before unattended promises.",
    "No password was requested or sent; no input/inject/system changes were attempted.",
  ].join(" ");
}

function formatBoardBuildDiff(buildDiff) {
  if (!buildDiff || buildDiff.severity === "ok" || buildDiff.severity === "unknown") return "";
  if (buildDiff.severity === "stale-metadata") {
    return `runtimeBuild=${buildDiff.fromBuildId || "unknown"} stale metadata only, hostRuntimeChanges=0`;
  }
  if (buildDiff.severity === "restart-recommended") {
    return `runtimeBuild=${buildDiff.fromBuildId || "unknown"} restart recommended, hostRuntimeChanges=${buildDiff.changedHostRuntimeFileCount ?? "unknown"}`;
  }
  return "";
}

function buildSuggestedAction(report) {
  if (report.host?.online && report.host?.buildDiff?.severity === "restart-recommended") {
    return {
      id: "restart-mac-host-safely",
      reason: "Mac host runtime build is stale; stop the old local host, restart with a visible password prompt, then rerun MacResumeStatus.",
      commands: {
        macHostStop: report.commands.macHostStop,
        macHostSafeStart: report.commands.macHostSafeStart,
        macMaxFpsSafeStart: report.commands.macMaxFpsSafeStart,
        macResumeStatus: report.commands.macResumeStatus,
      },
      boardSummary: "suggestedAction=restart-mac-host-safely actionCommands=MacHostStop->MacHostSafeStart-or-MacMaxFpsSafeStart->MacResumeStatus",
    };
  }
  return undefined;
}

function summarizeFindingIds(findings) {
  const ids = [...new Set(findings.map((item) => item.id).filter(Boolean))];
  if (ids.length === 0) return "unknown";
  if (ids.length <= 4) return ids.join(",");
  return `${ids.slice(0, 4).join(",")}+${ids.length - 4}more`;
}

function summarizeHealthFindingIds(findings) {
  const ids = [...new Set(findings.map((item) => item.id).filter(Boolean))];
  return ids.length > 0 ? ids.join(",") : "none";
}

function summarizePowerRiskIds(risks) {
  const ids = [...new Set((Array.isArray(risks) ? risks : []).map((item) => item.id).filter(Boolean))];
  return ids.length > 0 ? ids.join(",") : "none";
}

function buildMacPowerHealth(report) {
  const power = report.power || {};
  if (!power.checked) {
    return {
      status: "unknown",
      reason: power.summary === "skipped" ? "skipped" : "not-checked",
      warnings: "unknown",
      checkedAt: report.checkedAt || "",
    };
  }
  if (power.ok !== true) {
    return {
      status: "unknown",
      reason: "pmset-failed",
      warnings: summarizePowerRiskIds(power.risks),
      checkedAt: report.checkedAt || "",
    };
  }
  const warnings = summarizePowerRiskIds(power.risks);
  return {
    status: warnings === "none" ? "ok" : "warning",
    reason: warnings === "none" ? "ok" : warnings.split(",")[0],
    warnings,
    checkedAt: report.checkedAt || "",
  };
}

function formatMacPowerHealthSummary(health) {
  if (!health) return "MacPowerHealth=unknown reason=unknown warnings=unknown checkedAt=unknown";
  return [
    `MacPowerHealth=${health.status || "unknown"}`,
    `reason=${health.reason || "unknown"}`,
    `warnings=${health.warnings || "unknown"}`,
    `checkedAt=${health.checkedAt || "unknown"}`,
  ].join(" ");
}

function buildMacUnattendedHealth(report) {
  const blockers = report.findings.filter((item) => item.level === "blocker");
  const warnings = report.findings.filter((item) => item.level === "warning");
  const status = blockers.length > 0
    ? "blocked"
    : warnings.length > 0
      ? "warning"
      : "ok";
  return {
    status,
    reason: blockers[0]?.id || warnings[0]?.id || "ok",
    blockers: summarizeHealthFindingIds(blockers),
    warnings: summarizeHealthFindingIds(warnings),
    checkedAt: report.checkedAt || "",
  };
}

function formatMacUnattendedHealthSummary(health) {
  if (!health) return "MacUnattendedHealth=unknown reason=unknown blockers=unknown warnings=unknown checkedAt=unknown";
  return [
    `MacUnattendedHealth=${health.status || "unknown"}`,
    `reason=${health.reason || "unknown"}`,
    `blockers=${health.blockers || "unknown"}`,
    `warnings=${health.warnings || "unknown"}`,
    `checkedAt=${health.checkedAt || "unknown"}`,
  ].join(" ");
}

function formatMacHostAuthPathSummary(authPath) {
  if (!authPath) return "MacHostAuthPath=unknown reason=unknown mode=unknown next=unknown";
  return [
    `MacHostAuthPath=${authPath.status || "unknown"}`,
    `reason=${authPath.reason || "unknown"}`,
    `mode=${authPath.mode || "unknown"}`,
    `next=${authPath.next || "unknown"}`,
  ].join(" ");
}

function boolText(value) {
  if (value === true) return "true";
  if (value === false) return "false";
  return "unknown";
}

async function buildReport(args) {
  const currentBuildId = getGitBuildId();
  const host = await checkHost(args);
  host.buildDiff = makeBuildDiff(host.runtime?.buildId, currentBuildId);
  const launchAgent = checkLaunchAgent(args);
  const power = runPmset(args);
  const findings = buildFindings({ args, host, launchAgent, power });
  const ok = findings.every((item) => item.level !== "blocker") &&
    (!args.strict || findings.every((item) => item.level !== "warning"));
  const report = {
    ok,
    checkedAt: new Date().toISOString(),
    currentBuildId,
    args: {
      host: args.host,
      port: args.port,
      server: args.server,
      sendStatus: args.sendStatus,
      device: args.device,
      role: args.role,
      label: args.label,
      launchAgentPath: args.launchAgentPath,
      requireHostOnline: args.requireHostOnline,
      requireLaunchAgent: args.requireLaunchAgent,
      requireLaunchAgentMaxFps: args.requireLaunchAgentMaxFps,
      requireLaunchAgentLoaded: args.requireLaunchAgentLoaded,
      requireControlPermissions: args.requireControlPermissions,
      strict: args.strict,
      skipLaunchctl: args.skipLaunchctl,
      skipPmset: args.skipPmset,
    },
    host,
    launchAgent,
    power,
    limitations: makeLimitations(),
    findings,
    macPowerHealth: undefined,
    macUnattendedHealth: undefined,
    macHostAuthPath: undefined,
    commands: makeCommands(args),
    suggestedAction: undefined,
    boardSummary: "",
  };
  report.macPowerHealth = buildMacPowerHealth(report);
  report.macUnattendedHealth = buildMacUnattendedHealth(report);
  report.macHostAuthPath = buildMacHostAuthPath(report);
  report.suggestedAction = buildSuggestedAction(report);
  report.boardSummary = makeBoardSummary(report);
  return report;
}

function printHuman(report) {
  console.log(`Mac unattended status: ${report.ok ? "ok" : "needs attention"}`);
  console.log(`- host: ${report.host.online ? `online ${report.args.host}:${report.args.port}` : `offline ${report.args.host}:${report.args.port}`} inputMode=${report.host.inputMode || "unknown"}`);
  console.log(`- permissions: screen=${boolText(report.host.permissions?.screenRecording)} accessibility=${boolText(report.host.permissions?.accessibility)} inputMonitoring=${boolText(report.host.permissions?.inputMonitoring)}`);
  console.log(`- LaunchAgent: path=${report.launchAgent.path}; file=${report.launchAgent.exists ? "present" : "missing"}; loaded=${report.launchAgent.loaded === null ? "unknown" : boolText(report.launchAgent.loaded)}; maxFps=${report.launchAgent.maxScreenFps === null ? "unknown" : report.launchAgent.maxScreenFps}`);
  console.log(`- power: ${report.power.summary}`);
  console.log(`- power health: ${report.macPowerHealth.status} (${report.macPowerHealth.reason})`);
  console.log(`- unattended health: ${report.macUnattendedHealth.status} (${report.macUnattendedHealth.reason})`);
  for (const item of report.findings) {
    const prefix = item.level === "blocker" ? "BLOCK" : item.level === "warning" ? "WARN" : "INFO";
    console.log(`[${prefix}] ${item.text}`);
  }
  console.log("- limitations:");
  for (const item of report.limitations) console.log(`  - ${item}`);
  console.log(`- LaunchAgent plan: ${report.commands.launchAgentPlan}`);
  console.log(`- Mac max FPS plan: ${report.commands.macMaxFpsPlan}`);
  console.log(`- Mac host safe start: ${report.commands.macHostSafeStart}`);
  console.log(`- Mac 60Hz safe foreground start: ${report.commands.macMaxFpsSafeStart}`);
  console.log(`- Mac host stop: ${report.commands.macHostStop}`);
  console.log(`- Mac LaunchAgent load: ${report.commands.macLaunchAgentLoad}`);
  console.log(`- Mac LaunchAgent print: ${report.commands.macLaunchAgentPrint}`);
  console.log(`- Mac host readiness: ${report.commands.macHostReadiness}`);
  console.log(`- Mac host media: ${report.commands.macHostMedia}`);
  console.log(`- Mac resume status: ${report.commands.macResumeStatus}`);
  console.log(`- Mac unattended board-status refresh: ${report.commands.macUnattendedSendStatus}`);
  console.log(`- Mac power plan: ${report.commands.macPowerPlan}`);
  console.log(`- Mac remote-only audio plan: ${report.commands.macRemoteAudioPlan}`);
  console.log(`- Mac remote audio status: ${report.commands.macRemoteAudioStatus}`);
  console.log(`- Mac remote audio board-status refresh: ${report.commands.macRemoteAudioSendStatus}`);
  console.log(`- Mac input safety plan: ${report.commands.macInputSafetyPlan}`);
  console.log(`- Mac input safety status: ${report.commands.macInputSafetyStatus}`);
  console.log(`- Mac input safety board-status refresh: ${report.commands.macInputSafetySendStatus}`);
  console.log(`- Mac safe inject rehearsal plan: ${report.commands.macSafeInjectRehearsal}`);
  console.log(`- Mac manual UX status: ${report.commands.macManualUxStatus}`);
  console.log(`- Mac manual UX board-status refresh: ${report.commands.macManualUxSendStatus}`);
  console.log(`- Mac client manual checklist: ${report.commands.macClientManualChecklist}`);
  if (report.suggestedAction) console.log(`- suggested action: ${report.suggestedAction.boardSummary}`);
  console.log(`- Mac formal local smoke: ${report.commands.macFormalLocalSmoke}`);
  console.log(`- Mac client browser self-test: ${report.commands.macClientBrowserSelfTest}`);
  console.log(`- Mac script help: ${report.commands.macScriptHelp}`);
  if (report.postStatus) {
    console.log(`- Agent Link status post: ${report.postStatus.ok ? "ok" : "failed"} (${report.postStatus.status})`);
  }
  console.log(report.boardSummary);
}

function statusForReport(report) {
  const health = report?.macUnattendedHealth?.status || "";
  if (health === "blocked") return "blocked";
  if (health === "warning") return "warning";
  return "online";
}

function safeSnippet(text) {
  return String(text || "")
    .replace(/(password|token|secret|key)\s*[:=]\s*["']?[^"'\s]+/gi, "$1=<redacted>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function postStatus(args, report) {
  const status = statusForReport(report);
  const result = spawnSync(process.execPath, [
    codexLinkClient,
    "--server",
    args.server,
    "status",
    "--device",
    args.device,
    "--role",
    args.role,
    "--status",
    status,
    "--note",
    report.boardSummary,
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(args.timeoutMs + 3000, 5000),
    maxBuffer: 2 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
    },
  });
  return {
    ok: result.status === 0,
    status,
    exitCode: result.status,
    stdout: safeSnippet(result.stdout),
    stderr: safeSnippet(result.stderr),
    error: safeSnippet(result.error ? result.error.message : ""),
  };
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  const report = await buildReport(args);
  if (args.sendStatus) {
    report.postStatus = postStatus(args, report);
  }
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printHuman(report);
  }
  process.exitCode = report.ok && (!args.sendStatus || report.postStatus?.ok) ? 0 : 1;
}

main().catch((error) => {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({
      ok: false,
      checkedAt: new Date().toISOString(),
      error: { message: error.message, name: error.name },
    }, null, 2));
  } else {
    console.error(`[FAIL] ${error.message}`);
  }
  process.exitCode = 1;
});
