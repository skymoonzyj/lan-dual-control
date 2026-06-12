import { WindowsInputInjector } from "../../apps/windows-host/src/windows-input-injector.mjs";

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const logger = {
  info(message) {
    print("INFO", message);
  },
  warn(message) {
    print("WARN", message);
  },
};

async function run() {
  const logInjector = new WindowsInputInjector({ logger, mode: "log" });
  const logResult = await logInjector.inject({
    type: "input_event",
    event: "mouse_move",
    action: "move",
    x: 0.25,
    y: 0.25,
  });
  assert(logResult.accepted, "log mode should accept input events");
  assert(!logResult.injected, "log mode must not inject input events");
  assert(logResult.mode === "log", `expected log mode, got ${logResult.mode}`);
  logInjector.close();
  print("OK", "Log mode input path passed");

  if (process.platform !== "win32") {
    print("SKIP", "Persistent PowerShell SendInput helper dry run requires Windows");
    return;
  }

  const systemInjector = new WindowsInputInjector({ logger, mode: "system" });
  try {
    const unsupportedKey = await systemInjector.inject({
      type: "input_event",
      event: "key",
      action: "key",
      key: "Unidentified",
      code: "Unidentified",
    });
    assert(!unsupportedKey.accepted, "unsupported key should be rejected before helper injection");
    assert(!unsupportedKey.injected, "unsupported key must not be injected");
    assert(unsupportedKey.mode === "system", `expected system mode, got ${unsupportedKey.mode}`);
    print("OK", "Unsupported key rejection passed");

    const dryRun = await systemInjector.inject({
      type: "input_event",
      event: "__dry_run_unsupported__",
      action: "dry-run",
      x: 0,
      y: 0,
    });
    assert(!dryRun.accepted, "dry-run unsupported event should be rejected");
    assert(!dryRun.injected, "dry-run unsupported event must not inject");
    assert(dryRun.mode === "system", `expected system mode, got ${dryRun.mode}`);
    assert(
      String(dryRun.reason || "").includes("Unsupported input event"),
      `dry-run should return helper error, got: ${dryRun.reason}`,
    );
    print("OK", "Persistent helper dry-run path passed without sending real input");
  } finally {
    systemInjector.close();
  }
}

run().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
