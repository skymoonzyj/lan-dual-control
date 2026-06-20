#!/usr/bin/env node

function printHelp() {
  console.log(`Usage: node scripts/mac/plan-mac-remote-audio.mjs [options]

Plans a safe Mac remote-only audio path for the current ScreenCaptureKit
system-pcm capture flow. This command is plan-only: it does not change Mac
audio output, does not prompt for passwords, does not send input, and does not
connect to a host.

Options:
  --json          Print machine-readable plan details.
  --boardSummary  Print one secret-free Agent Link Board summary line.
  --help, -h      Show this help without doing any runtime checks.

Remote-only audio means Mac system sound is heard on the remote client while
the local Mac speaker path is intentionally muted or routed away with explicit
user consent and a restore path.`);
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
    planId: "mac-remote-audio-plan",
    status: "plan-only",
    currentCapture: {
      captureMode: "system-pcm",
      localPlaybackControl: "not-controlled-by-host",
      doesNotMuteLocalOutput: true,
      evidence: [
        "ScreenCaptureCoordinator.startSystemAudioStream uses SCStreamConfiguration capturesAudio=true and excludesCurrentProcessAudio=true.",
        "MacHostService sends system-pcm audio_frame payloads to the remote client.",
        "Current host code performs no output-device or volume change before or after capture.",
      ],
      interpretation:
        "The current host captures system PCM in parallel for the remote side; it does not implement a local speaker mute or output-device switch.",
    },
    remoteOnlyOptions: [
      {
        id: "manual-mute-restore",
        label: "User-confirmed local mute with restore checklist",
        status: "candidate",
        tradeoff: "Fastest to verify, but affects all Mac local audio and must be restored explicitly.",
      },
      {
        id: "virtual-output-device",
        label: "Route local output to a virtual or null device",
        status: "candidate",
        tradeoff: "Closer to remote-only behavior, but requires an installed audio device and clear user setup.",
      },
      {
        id: "product-toggle",
        label: "Add a visible Remote-only / Also play locally toggle",
        status: "recommended-product-path",
        tradeoff: "Safest product behavior if it snapshots current output state, asks consent, and restores on disconnect.",
      },
    ],
    consentChecklist: [
      {
        id: "explain-current-local-output",
        action: "Explain that system-pcm capture does not mute the Mac speaker path.",
        requiredBefore: "any-volume-or-output-change",
      },
      {
        id: "choose-single-route",
        action: "Choose exactly one route: manual mute, virtual output device, or product toggle.",
        requiredBefore: "any-volume-or-output-change",
      },
      {
        id: "confirm-restore-path-before-change",
        action: "Confirm how local Mac audio will be restored before applying a change.",
        requiredBefore: "any-volume-or-output-change",
      },
    ],
    restoreChecklist: [
      {
        id: "restore-user-selected-output-state",
        action: "Restore the user-selected mute/output route or disable the product remote-only toggle.",
        requiredAfter: "remote-only-audio-session",
      },
      {
        id: "rerun-remote-audio-status",
        action: "Rerun check-mac-remote-audio-status to confirm local output is back in the expected state.",
        requiredAfter: "restore",
      },
    ],
    recommendedNext:
      "Keep current capture behavior unchanged for this round; implement product-toggle only with explicit user consent, visible state, and restore handling.",
    safety: {
      noPassword: true,
      noInput: true,
      noInject: true,
      noVolumeChange: true,
      noHostConnection: true,
      requiresUserConsentBeforeApplying: true,
    },
  };
}

function makeBoardSummary(plan) {
  const optionIds = plan.remoteOnlyOptions.map((option) => option.id).join("/");
  return [
    `Mac remote audio plan: status=${plan.status};`,
    "capture=system-pcm-does-not-mute-local;",
    `RemoteOnlyOptions=${optionIds};`,
    "recommended=product-toggle-with-explicit-consent;",
    "safety=no-volume-change,no password/input/inject.",
    "Consent=explicit-before-change;",
    "RestorePath=required-before-apply.",
  ].join(" ");
}

function printPlain(plan) {
  console.log("Mac remote audio plan");
  console.log(`Status: ${plan.status}`);
  console.log("Current capture: system-pcm capture is active-capable, but local playback is not controlled by Mac host.");
  console.log("Current behavior: the host does not mute local output or switch output devices.");
  console.log("Recommended next: add a visible remote-only toggle only with explicit consent and restore handling.");
  console.log("Consent gate: explain local output, choose one route, and confirm restore before any change.");
  console.log("Restore gate: restore selected output state, then rerun check-mac-remote-audio-status.");
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
