#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  label: "com.lan-dual-control.mac-host",
  launchAgentPath: path.join(os.homedir(), "Library", "LaunchAgents", "com.lan-dual-control.mac-host.plist"),
  logDir: path.join(os.homedir(), "Library", "Logs", "lan-dual-control"),
  host: "0.0.0.0",
  port: 43770,
  repoRoot,
  nodePath: "/usr/bin/env",
  nodeCommand: "node",
  inputMode: "log",
  passwordMode: "ephemeral",
  videoMode: "auto",
  maxScreenFps: 30,
  jpegQuality: "",
  bonjour: true,
  keepAlive: false,
  throttleInterval: 30,
  write: false,
  force: false,
  json: false,
  boardSummary: false,
  help: false,
};

function printHelp() {
  console.log(`Usage: node scripts/mac/install-mac-host-launch-agent.mjs [options]

Builds a macOS LaunchAgent plist for starting the Mac host after user login.
Default mode is dry-run: it prints the plist, copyable commands, and safety
notes without writing files, loading launchctl, starting Mac host, authenticating
WebSocket, requesting passwords, or sending input/inject events.

Options:
  --label <label>              LaunchAgent label. Default: ${defaults.label}
  --launchAgentPath <path>     Plist path. Default:
                               ${defaults.launchAgentPath}
  --logDir <path>              stdout/stderr log directory. Default:
                               ${defaults.logDir}
  --repoRoot <path>            Repository working directory. Default: current repo
  --nodePath <path>            Program executable. Default: /usr/bin/env
  --nodeCommand <name>         Command passed to /usr/bin/env. Default: node
  --host <host>                Mac host bind host. Default: ${defaults.host}
  --port <port>                Mac host port. Default: ${defaults.port}
  --videoMode <mode>           auto | screen | mock. Default: auto
  --maxScreenFps <fps>         LAN_DUAL_MAX_SCREEN_FPS. Default: ${defaults.maxScreenFps}
  --jpegQuality <value>        LAN_DUAL_JPEG_QUALITY, 0.1 to 0.95
  --noBonjour                  Disable Bonjour/mDNS advertisement.
  --passwordMode <mode>        ephemeral | prompt | env-required. Default: ephemeral
                               ephemeral never prints the password and is best for
                               auto-starting discovery/status only.
                               prompt uses the visible macOS password dialog at
                               login; start-mac-host plays the user alert first.
                               env-required writes no password and expects the
                               launchd environment to provide LAN_DUAL_PASSWORD.
  --keepAlive                  Ask launchd to restart the host after crashes.
  --throttleInterval <sec>     launchd restart throttle. Default: ${defaults.throttleInterval}
  --write                      Write plist and log directory. Does not load launchctl.
  --force                      Allow --write to overwrite an existing plist.
  --boardSummary               Print one secret-free Agent Link Board summary line.
  --json                       Print one machine-readable JSON report.
  --help, -h                   Show this help without probing or writing anything.

Machine-readable JSON fields:
  commands.macUnattendedFormal Post-write read-only formal check command; fails
                               if LaunchAgent maxScreenFps is missing/below 60
                               or if launchctl does not show the agent loaded.
  commands.macHostReadiness    Secret-free low-risk Mac host readiness command;
                               reads host and Agent Link Board state only.
  commands.macFormalLocalSmoke Secret-free local H.264/PCM/input-log smoke
                               command; prompts locally and never embeds a
                               password in argv.
  commands.macScriptHelp       Secret-free Mac script help safety check; verifies
                               help paths stay side-effect-free.

Examples:
  node scripts/mac/install-mac-host-launch-agent.mjs --boardSummary
  node scripts/mac/install-mac-host-launch-agent.mjs --write
  node scripts/mac/install-mac-host-launch-agent.mjs --passwordMode prompt --write
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
    if (token === "--write" || token === "--force" || token === "--json" || token === "--boardSummary" || token === "--keepAlive" || token === "--noBonjour") {
      if (token === "--noBonjour") {
        args.bonjour = false;
      } else {
        args[token.slice(2)] = true;
      }
      continue;
    }
    if (token === "--label" && next && !next.startsWith("--")) {
      args.label = next.trim();
      index += 1;
      continue;
    }
    if (token === "--launchAgentPath" && next && !next.startsWith("--")) {
      args.launchAgentPath = resolveUserPath(next);
      index += 1;
      continue;
    }
    if (token === "--logDir" && next && !next.startsWith("--")) {
      args.logDir = resolveUserPath(next);
      index += 1;
      continue;
    }
    if (token === "--repoRoot" && next && !next.startsWith("--")) {
      args.repoRoot = path.resolve(resolveUserPath(next));
      index += 1;
      continue;
    }
    if (token === "--nodePath" && next && !next.startsWith("--")) {
      args.nodePath = next.trim();
      index += 1;
      continue;
    }
    if (token === "--nodeCommand" && next && !next.startsWith("--")) {
      args.nodeCommand = next.trim();
      index += 1;
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
    if (token === "--videoMode" && next && !next.startsWith("--")) {
      args.videoMode = normalizeChoice(next, ["auto", "screen", "mock"], defaults.videoMode);
      index += 1;
      continue;
    }
    if (token === "--maxScreenFps" && next && !next.startsWith("--")) {
      args.maxScreenFps = clampInteger(next, 1, 60, defaults.maxScreenFps);
      index += 1;
      continue;
    }
    if (token === "--jpegQuality" && next && !next.startsWith("--")) {
      args.jpegQuality = normalizeJpegQuality(next);
      index += 1;
      continue;
    }
    if (token === "--passwordMode" && next && !next.startsWith("--")) {
      args.passwordMode = normalizeChoice(next, ["ephemeral", "prompt", "env-required"], defaults.passwordMode);
      index += 1;
      continue;
    }
    if (token === "--throttleInterval" && next && !next.startsWith("--")) {
      args.throttleInterval = clampInteger(next, 5, 3600, defaults.throttleInterval);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  args.label = args.label || defaults.label;
  args.launchAgentPath = path.resolve(resolveUserPath(args.launchAgentPath));
  args.logDir = path.resolve(resolveUserPath(args.logDir));
  args.repoRoot = path.resolve(resolveUserPath(args.repoRoot));
  args.nodePath = args.nodePath || defaults.nodePath;
  args.nodeCommand = args.nodeCommand || defaults.nodeCommand;
  args.host = args.host || defaults.host;
  args.inputMode = "log";
  return args;
}

function resolveUserPath(value) {
  const text = String(value || "").trim();
  if (text === "~") return os.homedir();
  if (text.startsWith("~/")) return path.join(os.homedir(), text.slice(2));
  return text;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function normalizeChoice(value, allowed, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeJpegQuality(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return "";
  return String(Math.max(0.1, Math.min(0.95, parsed)));
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function shellQuote(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function plistBool(value) {
  return value ? "<true/>" : "<false/>";
}

function makeProgramArguments(args) {
  const program = [
    args.nodePath,
  ];
  if (path.basename(args.nodePath) === "env") {
    program.push(args.nodeCommand);
  }
  program.push(
    "scripts/mac/start-mac-host.mjs",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--requirePassword",
    "--inputMode",
    "log",
    "--videoMode",
    args.videoMode,
    "--maxScreenFps",
    String(args.maxScreenFps),
  );
  if (args.jpegQuality) {
    program.push("--jpegQuality", args.jpegQuality);
  }
  if (!args.bonjour) {
    program.push("--noBonjour");
  }
  if (args.passwordMode === "ephemeral") {
    program.push("--ephemeralPassword");
  } else if (args.passwordMode === "prompt") {
    program.push("--promptPassword");
  }
  return program;
}

function makePlist(args, programArguments) {
  const stdoutPath = path.join(args.logDir, "mac-host-launch-agent.out.log");
  const stderrPath = path.join(args.logDir, "mac-host-launch-agent.err.log");
  const keepAliveXml = args.keepAlive
    ? `<dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>`
    : "<false/>";
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(args.label)}</string>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(args.repoRoot)}</string>
  <key>ProgramArguments</key>
  <array>
${programArguments.map((item) => `    <string>${xmlEscape(item)}</string>`).join("\n")}
  </array>
  <key>RunAtLoad</key>
  ${plistBool(true)}
  <key>KeepAlive</key>
  ${keepAliveXml}
  <key>ThrottleInterval</key>
  <integer>${args.throttleInterval}</integer>
  <key>StandardOutPath</key>
  <string>${xmlEscape(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(stderrPath)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
`;
}

function makeCommands(args) {
  const uid = "$(id -u)";
  return {
    dryRun: makeDryRunCommand(args),
    writePlist: makeWritePlistCommand(args),
    createDirs: `mkdir -p ${shellQuote(path.dirname(args.launchAgentPath))} ${shellQuote(args.logDir)}`,
    bootstrap: `launchctl bootstrap gui/${uid} ${shellQuote(args.launchAgentPath)}`,
    bootout: `launchctl bootout gui/${uid}/${shellQuote(args.label)}`,
    print: `launchctl print gui/${uid}/${shellQuote(args.label)}`,
    hostStatus: `node scripts/mac/start-mac-host.mjs --status --host 127.0.0.1 --port ${args.port} --boardSummary`,
    macHostReadiness: `node scripts/mac/check-mac-host-readiness.mjs --host 127.0.0.1 --port ${args.port} --checkBoard --boardSummary`,
    macFormalLocalSmoke: `node scripts/mac/check-mac-formal-local-smoke.mjs --host 127.0.0.1 --port ${args.port} --promptPassword --boardSummary`,
    unattendedStatus: `node scripts/mac/check-mac-unattended-status.mjs --host 127.0.0.1 --port ${args.port} --launchAgentPath ${shellQuote(args.launchAgentPath)} --boardSummary`,
    macUnattendedFormal: `node scripts/mac/check-mac-unattended-status.mjs --host 127.0.0.1 --port ${args.port} --launchAgentPath ${shellQuote(args.launchAgentPath)} --requireLaunchAgentMaxFps --requireLaunchAgentLoaded --boardSummary`,
    macScriptHelp: "node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary",
  };
}

function appendNonDefaultPlanArgs(parts, args, { includeLaunchAgentPath = false, includeLogDir = false } = {}) {
  if (args.label !== defaults.label) parts.push("--label", shellQuote(args.label));
  if (includeLaunchAgentPath || args.launchAgentPath !== defaults.launchAgentPath) {
    parts.push("--launchAgentPath", shellQuote(args.launchAgentPath));
  }
  if (includeLogDir || args.logDir !== defaults.logDir) parts.push("--logDir", shellQuote(args.logDir));
  if (args.repoRoot !== path.resolve(defaults.repoRoot)) parts.push("--repoRoot", shellQuote(args.repoRoot));
  if (args.nodePath !== defaults.nodePath) parts.push("--nodePath", shellQuote(args.nodePath));
  if (args.nodeCommand !== defaults.nodeCommand) parts.push("--nodeCommand", shellQuote(args.nodeCommand));
  if (args.host !== defaults.host) parts.push("--host", shellQuote(args.host));
  if (args.port !== defaults.port) parts.push("--port", String(args.port));
  if (args.videoMode !== defaults.videoMode) parts.push("--videoMode", shellQuote(args.videoMode));
  if (args.maxScreenFps !== defaults.maxScreenFps) parts.push("--maxScreenFps", String(args.maxScreenFps));
  if (args.jpegQuality) parts.push("--jpegQuality", shellQuote(args.jpegQuality));
  if (!args.bonjour) parts.push("--noBonjour");
  if (args.passwordMode !== defaults.passwordMode) parts.push("--passwordMode", shellQuote(args.passwordMode));
  if (args.keepAlive) parts.push("--keepAlive");
  if (args.throttleInterval !== defaults.throttleInterval) parts.push("--throttleInterval", String(args.throttleInterval));
}

function makeWritePlistCommand(args) {
  const parts = ["node scripts/mac/install-mac-host-launch-agent.mjs", "--write"];
  appendNonDefaultPlanArgs(parts, args, { includeLaunchAgentPath: true, includeLogDir: true });
  return parts.join(" ");
}

function makeDryRunCommand(args) {
  const parts = ["node scripts/mac/install-mac-host-launch-agent.mjs"];
  appendNonDefaultPlanArgs(parts, args);
  parts.push("--boardSummary");
  return parts.join(" ");
}

function makeWarnings(args) {
  const warnings = [
    "This script never writes a LAN_DUAL_PASSWORD value into the plist.",
    "It does not run launchctl bootstrap/bootout, start Mac host, authenticate WebSocket, or send input/inject events.",
    "LaunchAgent starts only after a user login session; pre-login remote control is not supported.",
  ];
  if (args.passwordMode === "ephemeral") {
    warnings.push("passwordMode=ephemeral is safe for automatic discovery/status, but the random password is not shared with other devices for authenticated remote control.");
  }
  if (args.passwordMode === "prompt") {
    warnings.push("passwordMode=prompt may show a visible password dialog at login; use only when a user can answer it.");
  }
  if (args.passwordMode === "env-required") {
    warnings.push("passwordMode=env-required writes no secret; the agent will fail unless launchd provides LAN_DUAL_PASSWORD by another user-managed mechanism.");
  }
  if (args.keepAlive) {
    warnings.push("keepAlive restarts the host after crashes; use throttle logs to diagnose repeated failures.");
  }
  return warnings;
}

function makeBoardSummary(report) {
  const writeState = report.wrote ? "wrote" : "dry-run";
  const auth = report.args.passwordMode === "ephemeral"
    ? "ephemeral-discovery-only"
    : report.args.passwordMode;
  return [
    `Mac LaunchAgent plan: ${writeState}; label=${report.args.label}; path=${report.paths.launchAgentPath}; port=${report.args.port}; maxFps=${report.args.maxScreenFps}; auth=${auth}; keepAlive=${report.args.keepAlive ? "on" : "off"}.`,
    `MacLaunchAgentPlan=${report.commands.dryRun}; ManualWrite=${report.commands.writePlist}; ManualLoad=${report.commands.bootstrap}; Status=${report.commands.unattendedStatus}; MacUnattendedFormal=${report.commands.macUnattendedFormal}; MacHostReadiness=${report.commands.macHostReadiness}; MacFormalLocalSmoke=${report.commands.macFormalLocalSmoke}; MacScriptHelp=${report.commands.macScriptHelp}.`,
    "No password is written or requested by this planner; no launchctl/start/auth/input/inject action was attempted.",
  ].join(" ");
}

function writePlan(args, plist) {
  if (!args.write) {
    return { wrote: false };
  }
  if (existsSync(args.launchAgentPath) && !args.force) {
    throw new Error(`LaunchAgent plist already exists: ${args.launchAgentPath}. Use --force to overwrite.`);
  }
  mkdirSync(path.dirname(args.launchAgentPath), { recursive: true });
  mkdirSync(args.logDir, { recursive: true });
  writeFileSync(args.launchAgentPath, plist, { encoding: "utf8", mode: 0o644 });
  return { wrote: true };
}

function makeReport(args) {
  const programArguments = makeProgramArguments(args);
  const plist = makePlist(args, programArguments);
  const writeResult = writePlan(args, plist);
  const commands = makeCommands(args);
  const report = {
    ok: true,
    checkedAt: new Date().toISOString(),
    dryRun: !args.write,
    wrote: writeResult.wrote,
    args: {
      label: args.label,
      host: args.host,
      port: args.port,
      repoRoot: args.repoRoot,
      nodePath: args.nodePath,
      nodeCommand: args.nodeCommand,
      inputMode: args.inputMode,
      passwordMode: args.passwordMode,
      videoMode: args.videoMode,
      maxScreenFps: args.maxScreenFps,
      jpegQuality: args.jpegQuality,
      bonjour: args.bonjour,
      keepAlive: args.keepAlive,
      throttleInterval: args.throttleInterval,
    },
    paths: {
      launchAgentPath: args.launchAgentPath,
      logDir: args.logDir,
      stdoutPath: path.join(args.logDir, "mac-host-launch-agent.out.log"),
      stderrPath: path.join(args.logDir, "mac-host-launch-agent.err.log"),
    },
    programArguments,
    plist,
    commands,
    warnings: makeWarnings(args),
    boardSummary: "",
  };
  report.boardSummary = makeBoardSummary(report);
  return report;
}

function printHuman(report) {
  console.log(`Mac LaunchAgent plan: ${report.wrote ? "wrote plist" : "dry-run"}`);
  console.log(`- label: ${report.args.label}`);
  console.log(`- plist: ${report.paths.launchAgentPath}`);
  console.log(`- logs: ${report.paths.stdoutPath} / ${report.paths.stderrPath}`);
  console.log(`- command: ${report.programArguments.map(shellQuote).join(" ")}`);
  console.log(`- auth mode: ${report.args.passwordMode}`);
  console.log(`- input mode: ${report.args.inputMode}`);
  console.log("- manual commands:");
  console.log(`  - write: ${report.commands.writePlist}`);
  console.log(`  - load: ${report.commands.bootstrap}`);
  console.log(`  - status: ${report.commands.unattendedStatus}`);
  console.log(`  - formal check: ${report.commands.macUnattendedFormal}`);
  console.log(`  - host readiness: ${report.commands.macHostReadiness}`);
  console.log(`  - formal local smoke: ${report.commands.macFormalLocalSmoke}`);
  console.log(`  - script help safety check: ${report.commands.macScriptHelp}`);
  console.log("- warnings:");
  for (const warning of report.warnings) {
    console.log(`  - ${warning}`);
  }
  if (!report.wrote) {
    console.log("- plist preview:");
    console.log(report.plist.trimEnd());
  }
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
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printHuman(report);
  }
}

try {
  main();
} catch (error) {
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
}
