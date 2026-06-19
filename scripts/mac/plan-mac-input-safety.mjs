#!/usr/bin/env node

function printHelp() {
  console.log(`Usage: node scripts/mac/plan-mac-input-safety.mjs [options]

Plans the safe path for real Mac input control. This command is plan-only: it
does not start Mac host, does not prompt for passwords, does not authenticate a
WebSocket, does not send input events, and does not execute real input.

Options:
  --json          Print machine-readable plan details.
  --boardSummary  Print one secret-free Agent Link Board summary line.
  --help, -h      Show this help without doing any runtime checks.

Real input must stay blocked until a human explicitly confirms they are
watching the Mac screen. The start helper must use --confirmUserWatching before
switching from the default log mode to real input mode.`);
}

function parseArgs(argv) {
  const args = {
    json: false,
    boardSummary: false,
    help: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
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
    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function buildPlan() {
  return {
    planId: "mac-input-safety-plan",
    status: "plan-only",
    defaultMode: "log",
    currentSafetyModel: {
      defaultInputMode: "log",
      startHelperDefault: "log",
      directEnvironmentDefault: "log",
      reason:
        "Unattended runs must only log input acknowledgements; real input is a user-attended mode.",
    },
    realInput: {
      requiresUserWatching: true,
      startHelperRequiresConfirmFlag: true,
      requiredFlag: "--confirmUserWatching",
      recommendedStartPath:
        "node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --inputMode inject --confirmUserWatching --background",
      recommendedProbePath:
        "node scripts/windows/probe-mac-host.mjs --promptPassword --requirePassword --inputEvents --inputEventSet safe --expectInputMode inject --expectInputInjected true",
      recommendedEventSet: "safe",
      safeEventSetNotes: [
        "Use the safe event set first: mouse move and F13 only.",
        "Avoid click, scroll, Delete, Ctrl+A, or full event set until the user explicitly accepts those side effects.",
      ],
    },
    blockers: [
      "requires-user-watching",
      "requires-local-hidden-password-entry",
      "requires-safe-event-set-first",
    ],
    safety: {
      noPassword: true,
      noHostConnection: true,
      noInputEventsSent: true,
      noInjectExecuted: true,
      noSystemSettingsChanged: true,
    },
  };
}

function makeBoardSummary(plan) {
  return [
    `Mac input safety plan: status=${plan.status};`,
    `default=${plan.defaultMode};`,
    "realInput=blocked-until-user-watching;",
    `required=${plan.realInput.requiredFlag};`,
    `eventSet=${plan.realInput.recommendedEventSet};`,
    "safety=no-password,no-input-events,no-inject.",
  ].join(" ");
}

function printPlain(plan) {
  console.log("Mac input safety plan");
  console.log(`Status: ${plan.status}`);
  console.log("Default mode: log only, safe for unattended coordination.");
  console.log("Real input: blocked until the user confirms they are watching the Mac screen.");
  console.log("Required flag: --confirmUserWatching");
  console.log("Recommended first event set: safe");
  console.log(`Agent Link Board summary: ${makeBoardSummary(plan)}`);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const plan = buildPlan();
  if (args.json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  if (args.boardSummary) {
    console.log(makeBoardSummary(plan));
    return;
  }
  printPlain(plan);
}

main();
