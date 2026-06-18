#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  host: "127.0.0.1",
  port: 43770,
  timeoutMs: 3000,
  label: "com.lan-dual-control.mac-host",
  launchAgentPath: path.join(os.homedir(), "Library", "LaunchAgents", "com.lan-dual-control.mac-host.plist"),
  json: false,
  boardSummary: false,
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
  --json                         Print one machine-readable JSON object.
  --help, -h                     Show this help without probing anything.

Machine-readable JSON fields:
  host                           Mac host /discovery status, permissions, inputMode.
  launchAgent                    LaunchAgent plist existence and launchctl loaded status.
  power                          pmset sleep/display/network-wake snapshot and risk notes.
  limitations                    Lock screen, display sleep, system sleep, reboot/login limits.
  commands.launchAgentPlan       Secret-free LaunchAgent dry-run planner command.
  commands.macMaxFpsPlan         Secret-free LaunchAgent dry-run planner command
                                  for the formal 60Hz max-FPS target.
  commands.macUnattendedStatus   Secret-free exact rerun command for this
                                  report; preserves host/port/path and require flags.
  commands.macUnattendedFormal   Secret-free formal 60Hz gate command requiring
                                  LaunchAgent maxScreenFps and loaded status.
  commands.hostReadiness         Follow-up Mac host readiness command.

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
      token === "--skipPmset"
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
  return args;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
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
  return {
    path: args.launchAgentPath,
    exists,
    readable,
    label: label || args.label,
    labelMatches: !label || label === args.label,
    programArguments,
    maxScreenFps,
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
  const warnings = classifyPowerWarnings(settings);
  return {
    checked: true,
    ok: result.status === 0,
    raw: raw.slice(0, 12000),
    settings,
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

function classifyPowerWarnings(settings) {
  const warnings = [];
  const sleep = settingValues(settings, ["sleep"]);
  if (sleep.some((item) => item.value > 0)) {
    warnings.push("system sleep is enabled in at least one power profile; sleeping Mac will not stay controllable.");
  }
  const wakeNetwork = settingValues(settings, ["womp", "tcpkeepalive"]);
  if (wakeNetwork.length > 0 && wakeNetwork.every((item) => item.value === 0)) {
    warnings.push("Wake for network access/tcpkeepalive appears disabled; unattended reconnect after idle may be unreliable.");
  }
  return warnings;
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
    addFinding(findings, launchAgentMaxFpsLevel, "launch-agent-max-fps", `LaunchAgent maxScreenFps is not explicit; start helper default is 30FPS, below the formal ${formalTargetMaxScreenFps}Hz target.`);
  } else if (launchAgent.readable && launchAgent.maxScreenFps < formalTargetMaxScreenFps) {
    addFinding(findings, launchAgentMaxFpsLevel, "launch-agent-max-fps", `LaunchAgent maxScreenFps=${launchAgent.maxScreenFps}; formal ${formalTargetMaxScreenFps}Hz validation will keep reporting a remote FPS limit until the max-FPS plan is reviewed.`);
  }
  if (args.requireLaunchAgentLoaded && !launchAgent.launchctl.checked) {
    addFinding(findings, "blocker", "launch-agent-loaded-unchecked", `LaunchAgent ${args.label} loaded status was not checked.`);
  } else if (args.requireLaunchAgentLoaded && launchAgent.launchctl.checked && launchAgent.loaded !== true) {
    addFinding(findings, "blocker", "launch-agent-not-loaded", `LaunchAgent ${args.label} is not loaded.`);
  } else if (launchAgent.launchctl.checked && launchAgent.loaded !== true) {
    addFinding(findings, "warning", "launch-agent-not-loaded", `LaunchAgent ${args.label} is not loaded.`);
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
    hostStatus: `node scripts/mac/start-mac-host.mjs --status --host ${args.host} --port ${args.port} --boardSummary`,
    hostReadiness: `node scripts/mac/check-mac-host-readiness.mjs --host ${args.host} --port ${args.port} --checkBoard --boardSummary`,
    startHost: `node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port ${args.port}`,
    stopHost: `node scripts/mac/start-mac-host.mjs --stop --host ${args.host} --port ${args.port}`,
    launchAgentPath: args.launchAgentPath,
    launchAgentLabel: args.label,
  };
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
  const host = report.host.online
    ? `online inputMode=${report.host.inputMode || "unknown"} build=${report.host.runtime?.buildId || "unknown"}`
    : `offline ${report.args.host}:${report.args.port}`;
  const perms = report.host.online
    ? `permissions=screen:${boolText(report.host.permissions?.screenRecording)} accessibility:${boolText(report.host.permissions?.accessibility)} inputMonitoring:${boolText(report.host.permissions?.inputMonitoring)}`
    : "permissions=unknown";
  const agent = `launchAgent=${report.launchAgent.exists ? "file-present" : "missing"} loaded=${report.launchAgent.loaded === null ? "unknown" : boolText(report.launchAgent.loaded)}`;
  const agentMaxFps = report.launchAgent.maxScreenFps === null ? "unknown" : String(report.launchAgent.maxScreenFps);
  return [
    `Mac unattended status: host=${host}; ${perms}; ${agent} maxFps=${agentMaxFps}; power=${report.power.summary}; ${attention}${findingSummary ? ` ${findingSummary}` : ""}.`,
    `MacUnattendedStatus=${report.commands.macUnattendedStatus}; MacLaunchAgentPlan=${report.commands.launchAgentPlan}; MacMaxFpsPlan=${report.commands.macMaxFpsPlan}; MacUnattendedFormal=${report.commands.macUnattendedFormal}; HostReadiness=${report.commands.hostReadiness}.`,
    "Limits: lock/display-sleep/reboot-login still need real Mac verification before unattended promises.",
    "No password was requested or sent; no input/inject/system changes were attempted.",
  ].join(" ");
}

function summarizeFindingIds(findings) {
  const ids = [...new Set(findings.map((item) => item.id).filter(Boolean))];
  if (ids.length === 0) return "unknown";
  if (ids.length <= 4) return ids.join(",");
  return `${ids.slice(0, 4).join(",")}+${ids.length - 4}more`;
}

function boolText(value) {
  if (value === true) return "true";
  if (value === false) return "false";
  return "unknown";
}

async function buildReport(args) {
  const host = await checkHost(args);
  const launchAgent = checkLaunchAgent(args);
  const power = runPmset(args);
  const findings = buildFindings({ args, host, launchAgent, power });
  const ok = findings.every((item) => item.level !== "blocker") &&
    (!args.strict || findings.every((item) => item.level !== "warning"));
  const report = {
    ok,
    checkedAt: new Date().toISOString(),
    args: {
      host: args.host,
      port: args.port,
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
    commands: makeCommands(args),
    boardSummary: "",
  };
  report.boardSummary = makeBoardSummary(report);
  return report;
}

function printHuman(report) {
  console.log(`Mac unattended status: ${report.ok ? "ok" : "needs attention"}`);
  console.log(`- host: ${report.host.online ? `online ${report.args.host}:${report.args.port}` : `offline ${report.args.host}:${report.args.port}`} inputMode=${report.host.inputMode || "unknown"}`);
  console.log(`- permissions: screen=${boolText(report.host.permissions?.screenRecording)} accessibility=${boolText(report.host.permissions?.accessibility)} inputMonitoring=${boolText(report.host.permissions?.inputMonitoring)}`);
  console.log(`- LaunchAgent: path=${report.launchAgent.path}; file=${report.launchAgent.exists ? "present" : "missing"}; loaded=${report.launchAgent.loaded === null ? "unknown" : boolText(report.launchAgent.loaded)}; maxFps=${report.launchAgent.maxScreenFps === null ? "unknown" : report.launchAgent.maxScreenFps}`);
  console.log(`- power: ${report.power.summary}`);
  for (const item of report.findings) {
    const prefix = item.level === "blocker" ? "BLOCK" : item.level === "warning" ? "WARN" : "INFO";
    console.log(`[${prefix}] ${item.text}`);
  }
  console.log("- limitations:");
  for (const item of report.limitations) console.log(`  - ${item}`);
  console.log(`- LaunchAgent plan: ${report.commands.launchAgentPlan}`);
  console.log(`- Mac max FPS plan: ${report.commands.macMaxFpsPlan}`);
  console.log(`- host readiness: ${report.commands.hostReadiness}`);
  console.log(report.boardSummary);
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  const report = await buildReport(args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printHuman(report);
  }
  process.exitCode = report.ok ? 0 : 1;
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
