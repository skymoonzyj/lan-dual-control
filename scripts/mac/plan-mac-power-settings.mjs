#!/usr/bin/env node

const defaults = {
  profile: "all",
  sleep: 0,
  displaySleep: 0,
  networkWake: "on",
  json: false,
  boardSummary: false,
  help: false,
};

const profileFlags = {
  all: "-a",
  ac: "-c",
  battery: "-b",
  ups: "-u",
};

function printHelp() {
  console.log(`Usage: node scripts/mac/plan-mac-power-settings.mjs [options]

Builds a read-only Mac power settings preview for unattended LAN control.
This helper does not run pmset, does not change system settings, does not ask
for a password, and does not send input events.

Options:
  --profile <all|ac|battery|ups>  pmset profile flag to preview. Default: ${defaults.profile}
  --sleep <minutes>               System sleep value to preview. Default: ${defaults.sleep}
  --displaySleep <minutes>        Display sleep value to preview. Default: ${defaults.displaySleep}
  --networkWake <on|off>          Wake-for-network preview. Default: ${defaults.networkWake}
  --boardSummary                  Print one secret-free Agent Link Board line.
  --json                          Print one machine-readable JSON object.
  --help, -h                      Show this help without probing anything.

Machine-readable JSON fields:
  status                          Always "preview".
  profile                         all|ac|battery|ups.
  settings                        Proposed sleep, displaySleep, and networkWake values.
  commands.preview                Copyable pmset preview command; not executed.
  commands.verify                 Copyable pmset readback command.
  commands.macUnattendedStatus    Follow-up Mac unattended status command.
  commands.macLaunchAgentPlan     Follow-up LaunchAgent dry-run planner command.
  commands.powerApplyRunbook      Ordered manual labels for supervised power
                                  changes: Preview -> ManualApply -> Verify
                                  -> MacUnattendedStatus -> MacLaunchAgentPlan.

Examples:
  node scripts/mac/plan-mac-power-settings.mjs --boardSummary
  node scripts/mac/plan-mac-power-settings.mjs --profile ac --displaySleep 5 --networkWake off --json
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
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--boardSummary") {
      args.boardSummary = true;
      continue;
    }
    if (token === "--apply") {
      throw new Error("Refusing to apply settings: this helper is preview-only and does not change system state.");
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

function makePreviewCommand(args) {
  const networkValue = args.networkWake === "on" ? "1" : "0";
  return [
    "pmset",
    profileFlags[args.profile] || profileFlags.all,
    "sleep",
    String(args.sleep),
    "displaysleep",
    String(args.displaySleep),
    "womp",
    networkValue,
    "tcpkeepalive",
    networkValue,
  ].join(" ");
}

function makeMacUnattendedStatusCommand() {
  return "node scripts/mac/check-mac-unattended-status.mjs --boardSummary";
}

function makeMacLaunchAgentPlanCommand() {
  return "node scripts/mac/install-mac-host-launch-agent.mjs --boardSummary";
}

function makePowerApplyRunbook(commands) {
  return [
    {
      label: "Preview",
      command: commands.preview,
      note: "Review the pmset command without running it.",
    },
    {
      label: "ManualApply",
      command: commands.preview,
      note: "Run the preview command manually only after the user confirms this Mac should change power settings.",
    },
    {
      label: "Verify",
      command: commands.verify,
      note: "Read back pmset settings after manual apply.",
    },
    {
      label: "MacUnattendedStatus",
      command: commands.macUnattendedStatus,
      note: "Refresh local unattended evidence after power changes.",
    },
    {
      label: "MacLaunchAgentPlan",
      command: commands.macLaunchAgentPlan,
      note: "Continue to login persistence planning if LaunchAgent is still not loaded.",
    },
  ];
}

function makeReport(args) {
  const commands = {
    preview: makePreviewCommand(args),
    verify: "pmset -g custom",
    macUnattendedStatus: makeMacUnattendedStatusCommand(),
    macLaunchAgentPlan: makeMacLaunchAgentPlanCommand(),
  };
  commands.powerApplyRunbook = makePowerApplyRunbook(commands);
  const report = {
    status: "preview",
    profile: args.profile,
    settings: {
      sleep: args.sleep,
      displaySleep: args.displaySleep,
      networkWake: args.networkWake,
    },
    commands,
    notes: [
      "Dry-run only: copy the preview command only after deciding to change local Mac power settings.",
      "Run the verify command, MacUnattendedStatus, and MacLaunchAgentPlan afterwards to refresh Agent Link Board evidence and plan login persistence.",
    ],
    boardSummary: "",
  };
  report.boardSummary = makeBoardSummary(report);
  return report;
}

function makeBoardSummary(report) {
  const powerApply = report.commands.powerApplyRunbook.map((step) => step.label).join("->");
  return [
    `MacPowerPlan=status=${report.status} profile=${report.profile} sleep=${report.settings.sleep} displaySleep=${report.settings.displaySleep} networkWake=${report.settings.networkWake} DryRunOnly.`,
    `Preview=${report.commands.preview}; PowerApply=${powerApply}; Verify=${report.commands.verify}; MacUnattendedStatus=${report.commands.macUnattendedStatus}; MacLaunchAgentPlan=${report.commands.macLaunchAgentPlan}.`,
    "No password was requested or sent; no system changes or input events were attempted.",
  ].join(" ");
}

function printText(report) {
  console.log("Mac power settings plan:");
  console.log(`- status: ${report.status}`);
  console.log(`- profile: ${report.profile}`);
  console.log(`- sleep: ${report.settings.sleep}`);
  console.log(`- displaySleep: ${report.settings.displaySleep}`);
  console.log(`- networkWake: ${report.settings.networkWake}`);
  console.log(`- preview: ${report.commands.preview}`);
  console.log(`- verify: ${report.commands.verify}`);
  console.log(`- Mac unattended status: ${report.commands.macUnattendedStatus}`);
  console.log(`- Mac LaunchAgent plan: ${report.commands.macLaunchAgentPlan}`);
  console.log(`- Power apply runbook: ${report.commands.powerApplyRunbook.map((step) => step.label).join(" -> ")}`);
  console.log("- safety: dry-run only; no password, no system changes, no input events");
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  const report = makeReport(args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (args.boardSummary) {
    console.log(report.boardSummary);
    return;
  }
  printText(report);
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
