#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const defaults = {
  profile: "all",
  sleep: 0,
  displaySleep: 0,
  networkWake: "on",
  apply: false,
  confirmUserPresent: false,
  json: false,
  boardSummary: false,
  help: false,
  timeoutMs: 120000,
};

const profileFlags = {
  all: "-a",
  ac: "-c",
  battery: "-b",
  ups: "-u",
};

function printHelp() {
  console.log(`Usage: node scripts/mac/apply-mac-power-settings.mjs [options]

Supervised Mac power settings helper for unattended LAN control.
Default mode is dry-run. Real changes require both --apply and
--confirmUserPresent. When applying, the helper rings first, then asks macOS to
run pmset with administrator privileges, and finally reads pmset back.

Options:
  --profile <all|ac|battery|ups>  pmset profile flag. Default: ${defaults.profile}
  --sleep <minutes>               System sleep value. Default: ${defaults.sleep}
  --displaySleep <minutes>        Display sleep value. Default: ${defaults.displaySleep}
  --networkWake <on|off>          Wake-for-network value. Default: ${defaults.networkWake}
  --apply                         Apply the pmset command through macOS authorization.
  --confirmUserPresent            Required with --apply; confirms a human is ready
                                  for the macOS authorization pop-up.
  --timeoutMs <ms>                Authorization/readback timeout. Default: ${defaults.timeoutMs}
  --boardSummary                  Print one Agent Link Board friendly line.
  --json                          Print one machine-readable JSON object.
  --help, -h                      Show this help without probing or changing anything.

Machine-readable JSON fields:
  status                          dry-run | applied.
  commands.apply                  Copyable pmset command.
  commands.verify                 pmset readback command.
  authorization.method            osascript-administrator-privileges when applied.
  verify                          pmset readback summary after applied.

Examples:
  node scripts/mac/apply-mac-power-settings.mjs --boardSummary
  node scripts/mac/apply-mac-power-settings.mjs --apply --confirmUserPresent --boardSummary
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
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--boardSummary") {
      args.boardSummary = true;
      continue;
    }
    if (token === "--apply") {
      args.apply = true;
      continue;
    }
    if (token === "--confirmUserPresent") {
      args.confirmUserPresent = true;
      continue;
    }
    if (token === "--profile" && next && !next.startsWith("--")) {
      args.profile = parseProfile(next);
      index += 1;
      continue;
    }
    if (token === "--sleep" && next && !next.startsWith("--")) {
      args.sleep = clampInteger(next, 0, 1440, defaults.sleep);
      index += 1;
      continue;
    }
    if (token === "--displaySleep" && next && !next.startsWith("--")) {
      args.displaySleep = clampInteger(next, 0, 1440, defaults.displaySleep);
      index += 1;
      continue;
    }
    if (token === "--networkWake" && next && !next.startsWith("--")) {
      args.networkWake = parseNetworkWake(next);
      index += 1;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampInteger(next, 5000, 600000, defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function parseProfile(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (profileFlags[normalized]) return normalized;
  throw new Error(`Invalid --profile ${value}; expected all, ac, battery, or ups.`);
}

function parseNetworkWake(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "on" || normalized === "1" || normalized === "true") return "on";
  if (normalized === "off" || normalized === "0" || normalized === "false") return "off";
  throw new Error(`Invalid --networkWake ${value}; expected on or off.`);
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function makePmsetArgs(args) {
  const networkValue = args.networkWake === "on" ? "1" : "0";
  return [
    profileFlags[args.profile] || profileFlags.all,
    "sleep",
    String(args.sleep),
    "displaysleep",
    String(args.displaySleep),
    "womp",
    networkValue,
    "tcpkeepalive",
    networkValue,
  ];
}

function makeDisplayCommand(args) {
  return ["pmset", ...makePmsetArgs(args)].join(" ");
}

function makeCommands(args) {
  return {
    apply: makeDisplayCommand(args),
    verify: "pmset -g custom",
    macUnattendedSendStatus:
      "node scripts/mac/check-mac-unattended-status.mjs --host 127.0.0.1 --port 43770 --server http://192.168.31.68:17888 --sendStatus --boardSummary",
    macLaunchAgentPlan: "node scripts/mac/install-mac-host-launch-agent.mjs --boardSummary",
  };
}

function shellQuote(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function appleScriptQuote(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function selectedPmsetBin() {
  if (process.env.LAN_DUAL_PMSET_BIN) return process.env.LAN_DUAL_PMSET_BIN;
  return existsSync("/usr/bin/pmset") ? "/usr/bin/pmset" : "pmset";
}

function selectedOsaScriptBin() {
  return process.env.LAN_DUAL_OSASCRIPT_BIN || "osascript";
}

function playAttentionSound(osascriptBin, timeoutMs) {
  const result = spawnSync(osascriptBin, ["-e", "beep 2"], {
    encoding: "utf8",
    timeout: Math.min(Math.max(1000, timeoutMs), 5000),
    maxBuffer: 1024 * 64,
  });
  if (result.status !== 0) {
    process.stderr.write("\x07");
  }
}

function applyWithAdministratorPrivileges(args) {
  const osascriptBin = selectedOsaScriptBin();
  const pmsetBin = selectedPmsetBin();
  const command = [shellQuote(pmsetBin), ...makePmsetArgs(args).map(shellQuote)].join(" ");
  const prompt = "LAN Dual Control needs to update Mac power settings for unattended LAN control.";
  const script = `do shell script "${appleScriptQuote(command)}" with administrator privileges with prompt "${appleScriptQuote(prompt)}"`;
  playAttentionSound(osascriptBin, args.timeoutMs);
  const result = spawnSync(osascriptBin, ["-e", script], {
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 1024 * 1024,
  });
  const errorMessage = result.error?.message || "";
  const timedOut = result.error?.code === "ETIMEDOUT" || /timed out|timeout/i.test(errorMessage);
  return {
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    timedOut,
    errorMessage,
    stdout: String(result.stdout || "").slice(0, 12000),
    stderr: String(result.stderr || "").slice(0, 12000),
    method: "osascript-administrator-privileges",
  };
}

function runVerify(args) {
  const result = spawnSync(selectedPmsetBin(), ["-g", "custom"], {
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 1024 * 1024,
  });
  const raw = String(result.stdout || result.stderr || "");
  const settings = parsePmset(raw);
  const parsedPowerSettingCount = countParsedPowerSettings(settings);
  const risks = classifyPowerRisks(settings);
  if (result.status === 0 && parsedPowerSettingCount === 0) {
    risks.push({
      id: raw.trim() ? "pmset-readback-unparsed" : "pmset-readback-empty",
    });
  }
  const ok = result.status === 0 && risks.length === 0;
  const reason = ok
    ? "ok"
    : risks[0]?.id || `pmset-exit-${result.status ?? "unknown"}`;
  return {
    ok,
    reason,
    status: result.status,
    signal: result.signal,
    raw: raw.slice(0, 12000),
    settings,
    risks,
    riskIds: risks.map((item) => item.id),
    summary: summarizePower(settings),
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

function countParsedPowerSettings(settings) {
  return Object.values(settings || {}).reduce((count, data) => {
    return count + Object.keys(data || {}).length;
  }, 0);
}

function classifyPowerRisks(settings) {
  const risks = [];
  const sleep = settingValues(settings, ["sleep"]);
  if (sleep.some((item) => item.value > 0)) {
    risks.push({ id: "system-sleep-enabled" });
  }
  const displaySleep = settingValues(settings, ["displaysleep"]);
  if (displaySleep.some((item) => item.value > 0)) {
    risks.push({ id: "display-sleep-enabled" });
  }
  const wakeNetwork = settingValues(settings, ["womp", "tcpkeepalive"]);
  if (wakeNetwork.length > 0 && wakeNetwork.every((item) => item.value === 0)) {
    risks.push({ id: "network-wake-disabled" });
  }
  return risks;
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

function makeReport(args) {
  const commands = makeCommands(args);
  if (args.apply && !args.confirmUserPresent) {
    throw new Error("--apply requires --confirmUserPresent so the user can answer the macOS authorization pop-up.");
  }
  const report = {
    ok: true,
    checkedAt: new Date().toISOString(),
    status: args.apply ? "applied" : "dry-run",
    confirmed: Boolean(args.confirmUserPresent),
    applied: false,
    profile: args.profile,
    settings: {
      sleep: args.sleep,
      displaySleep: args.displaySleep,
      networkWake: args.networkWake,
    },
    commands,
    authorization: null,
    verify: null,
    boardSummary: "",
  };
  if (args.apply) {
    const applyResult = applyWithAdministratorPrivileges(args);
    report.authorization = {
      method: applyResult.method,
      ok: applyResult.ok,
      status: applyResult.status,
      signal: applyResult.signal,
      timedOut: applyResult.timedOut,
    };
    if (!applyResult.ok) {
      const details = [];
      if (applyResult.timedOut) details.push(`timed out after ${args.timeoutMs}ms`);
      if (applyResult.signal) details.push(`signal ${applyResult.signal}`);
      if (applyResult.status !== null && applyResult.status !== undefined) details.push(`exit ${applyResult.status}`);
      if (applyResult.errorMessage) details.push(applyResult.errorMessage);
      if (applyResult.stderr) details.push(applyResult.stderr);
      if (applyResult.stdout) details.push(applyResult.stdout);
      const detail = details.join("; ") || "authorization ended without a status";
      throw new Error(`macOS authorization did not complete: ${detail}`);
    }
    report.applied = true;
    report.verify = runVerify(args);
    if (!report.verify.ok) {
      report.ok = false;
    }
  }
  report.boardSummary = makeBoardSummary(report);
  return report;
}

function makeBoardSummary(report) {
  const riskIds = report.verify?.riskIds?.length ? report.verify.riskIds.join(",") : "none";
  if (report.status === "dry-run") {
    return [
      `MacPowerApply=status=dry-run profile=${report.profile} sleep=${report.settings.sleep} displaySleep=${report.settings.displaySleep} networkWake=${report.settings.networkWake} ApplyRequires=--apply --confirmUserPresent.`,
      `Apply=${report.commands.apply}; Verify=${report.commands.verify}; MacUnattendedSendStatus=${report.commands.macUnattendedSendStatus}; MacLaunchAgentPlan=${report.commands.macLaunchAgentPlan}.`,
      "No password was printed or sent; no system changes or remote control events were attempted.",
    ].join(" ");
  }
  const verified = report.verify?.ok && riskIds === "none" ? "ok" : "failed";
  return [
    `MacPowerApply=status=applied profile=${report.profile} sleep=${report.settings.sleep} displaySleep=${report.settings.displaySleep} networkWake=${report.settings.networkWake} verified=${verified} risks=${riskIds}.`,
    `VerifySummary=${report.verify?.summary || "unknown"}; MacUnattendedSendStatus=${report.commands.macUnattendedSendStatus}; MacLaunchAgentPlan=${report.commands.macLaunchAgentPlan}.`,
    "No password was printed or sent; no remote control events were attempted.",
  ].join(" ");
}

function printText(report) {
  console.log("Mac power settings apply:");
  console.log(`- status: ${report.status}`);
  console.log(`- profile: ${report.profile}`);
  console.log(`- sleep: ${report.settings.sleep}`);
  console.log(`- displaySleep: ${report.settings.displaySleep}`);
  console.log(`- networkWake: ${report.settings.networkWake}`);
  console.log(`- apply command: ${report.commands.apply}`);
  console.log(`- verify command: ${report.commands.verify}`);
  if (report.authorization) {
    console.log(`- authorization: ${report.authorization.ok ? "ok" : "failed"} via ${report.authorization.method}`);
  }
  if (report.verify) {
    console.log(`- verify: ${report.verify.ok ? "ok" : "failed"} ${report.verify.summary}`);
    console.log(`- risks: ${report.verify.riskIds.length ? report.verify.riskIds.join(",") : "none"}`);
  }
  console.log(`- Mac unattended send status: ${report.commands.macUnattendedSendStatus}`);
  console.log(`- Mac LaunchAgent plan: ${report.commands.macLaunchAgentPlan}`);
  console.log(report.boardSummary);
}

function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  const report = makeReport(args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
    return;
  }
  if (args.boardSummary) {
    console.log(report.boardSummary);
    if (!report.ok) process.exitCode = 1;
    return;
  }
  printText(report);
  if (!report.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({
      ok: false,
      checkedAt: new Date().toISOString(),
      error: {
        message: error.message || String(error),
      },
    }, null, 2));
  } else {
    console.error(error.message || String(error));
  }
  process.exit(1);
}
