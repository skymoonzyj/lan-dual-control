#!/usr/bin/env node
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/apply-mac-power-settings.mjs";

const defaults = {
  timeoutMs: 8000,
};

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-power-apply.mjs [options]

Verifies the supervised Mac power settings apply helper. The test uses fake
osascript and pmset binaries; it never changes real power settings, never asks
for a password, and never sends input/inject events.

Options:
  --timeoutMs <ms>    Command timeout. Default: ${defaults.timeoutMs}
  --help, -h          Show this help without running checks
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
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampInteger(next, 1000, 60000, defaults.timeoutMs);
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

function run(args, extraArgs = [], env = {}) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      ...env,
    },
  });
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(String(stdout || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${stdout}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(text, needle, label) {
  assert(String(text || "").includes(needle), `${label} should include ${needle}`);
}

function assertNotIncludes(text, needle, label) {
  assert(!String(text || "").includes(needle), `${label} should not include ${needle}`);
}

function assertSecretSafe(text, label) {
  const value = String(text || "");
  assertNotIncludes(value, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(value, "--password", label);
  assertNotIncludes(value, "sudo", label);
  assertNotIncludes(value, "input_event", label);
  assertNotIncludes(value, "--inputMode inject", label);
  assertNotIncludes(value, "inject", label);
  assertNotIncludes(value, "secret", label);
  assertNotIncludes(value, "token", label);
}

function makeFakeTools() {
  const dir = mkdtempSync(path.join(tmpdir(), "lan-dual-power-apply-"));
  const logPath = path.join(dir, "tool.log");
  const osascriptPath = path.join(dir, "osascript");
  const pmsetPath = path.join(dir, "pmset");
  writeFileSync(
    osascriptPath,
    `#!/usr/bin/env node
const fs = require("fs");
const logPath = process.env.FAKE_TOOL_LOG;
const args = process.argv.slice(2);
fs.appendFileSync(logPath, "osascript " + JSON.stringify(args) + "\\n");
const script = args.join(" ");
if (script.includes("beep 2")) process.exit(0);
if (script.includes("with administrator privileges")) {
  if (process.env.FAKE_ADMIN_TIMEOUT === "1") {
    setTimeout(() => {}, 5000);
    return;
  }
  process.exit(0);
}
process.exit(2);
`,
  );
  writeFileSync(
    pmsetPath,
    `#!/usr/bin/env node
const fs = require("fs");
const logPath = process.env.FAKE_TOOL_LOG;
const args = process.argv.slice(2);
fs.appendFileSync(logPath, "pmset " + JSON.stringify(args) + "\\n");
if (args.join(" ") === "-g custom") {
  console.log("AC Power:");
  console.log(" sleep                0");
  console.log(" displaysleep         0");
  console.log(" womp                 1");
  console.log(" tcpkeepalive         1");
  process.exit(0);
}
process.exit(3);
`,
  );
  chmodSync(osascriptPath, 0o755);
  chmodSync(pmsetPath, 0o755);
  return { dir, logPath, osascriptPath, pmsetPath };
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run(args, [flag], {
      LAN_DUAL_OSASCRIPT_BIN: "/no/such/osascript",
      LAN_DUAL_PMSET_BIN: "/no/such/pmset",
    });
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assertIncludes(result.stdout, "Usage", `${script} ${flag}`);
    assertIncludes(result.stdout, "--apply", `${script} ${flag}`);
    assertIncludes(result.stdout, "--confirmUserPresent", `${script} ${flag}`);
    assertIncludes(result.stdout, "administrator privileges", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.apply", `${script} ${flag}`);
    assertSecretSafe(`${result.stdout}\n${result.stderr}`, `${script} ${flag}`);
  }
  console.log("[OK] Mac power apply help is side-effect-free");
}

function checkDryRun(args) {
  const result = run(args, ["--json"], {
    LAN_DUAL_OSASCRIPT_BIN: "/no/such/osascript",
    LAN_DUAL_PMSET_BIN: "/no/such/pmset",
  });
  assert(result.status === 0, `dry-run JSON should exit 0\n${result.stdout}\n${result.stderr}`);
  const payload = parseJson(result.stdout, "dry-run JSON");
  assert(payload.status === "dry-run", "dry-run JSON status should be dry-run");
  assert(payload.confirmed === false, "dry-run JSON should not be confirmed");
  assert(payload.applied === false, "dry-run JSON should not be applied");
  assertIncludes(payload.commands?.apply || "", "pmset -a sleep 0 displaysleep 0 womp 1 tcpkeepalive 1", "dry-run apply command");
  assertIncludes(payload.commands?.verify || "", "pmset -g custom", "dry-run verify command");
  assertIncludes(payload.boardSummary || "", "MacPowerApply=status=dry-run", "dry-run board summary");
  assertIncludes(payload.boardSummary || "", "ApplyRequires=--apply --confirmUserPresent", "dry-run board summary");
  assertSecretSafe(`${result.stdout}\n${result.stderr}`, "dry-run JSON");
  console.log("[OK] Mac power apply dry-run does not touch tools");
}

function checkApplyRequiresConfirmation(args) {
  const tools = makeFakeTools();
  try {
    const result = run(args, ["--apply", "--json"], {
      LAN_DUAL_OSASCRIPT_BIN: tools.osascriptPath,
      LAN_DUAL_PMSET_BIN: tools.pmsetPath,
      FAKE_TOOL_LOG: tools.logPath,
    });
    assert(result.status !== 0, "--apply without --confirmUserPresent should fail");
    assertIncludes(`${result.stdout}\n${result.stderr}`, "--confirmUserPresent", "apply without confirmation");
    let log = "";
    try {
      log = readFileSync(tools.logPath, "utf8");
    } catch {
      log = "";
    }
    assert(log === "", "apply without confirmation should not call osascript or pmset");
    assertSecretSafe(`${result.stdout}\n${result.stderr}`, "apply without confirmation");
  } finally {
    rmSync(tools.dir, { recursive: true, force: true });
  }
  console.log("[OK] Mac power apply refuses unconfirmed system changes");
}

function checkApplyWithAdminPrompt(args) {
  const tools = makeFakeTools();
  try {
    const result = run(args, ["--apply", "--confirmUserPresent", "--json"], {
      LAN_DUAL_OSASCRIPT_BIN: tools.osascriptPath,
      LAN_DUAL_PMSET_BIN: tools.pmsetPath,
      FAKE_TOOL_LOG: tools.logPath,
    });
    assert(result.status === 0, `confirmed apply should exit 0\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "confirmed apply JSON");
    assert(payload.status === "applied", "confirmed apply status should be applied");
    assert(payload.confirmed === true, "confirmed apply should be confirmed");
    assert(payload.applied === true, "confirmed apply should be applied");
    assert(payload.authorization?.method === "osascript-administrator-privileges", "authorization method should be osascript administrator privileges");
    assert(payload.verify?.ok === true, "verify should be ok");
    assert(payload.verify?.risks?.length === 0, "verify should report no remaining power risks");
    assertIncludes(payload.boardSummary || "", "MacPowerApply=status=applied", "confirmed apply board summary");
    assertIncludes(payload.boardSummary || "", "verified=ok", "confirmed apply board summary");
    assertIncludes(payload.boardSummary || "", "No password was printed or sent", "confirmed apply board summary");
    const log = readFileSync(tools.logPath, "utf8");
    const beepIndex = log.indexOf("beep 2");
    const adminIndex = log.indexOf("with administrator privileges");
    const verifyIndex = log.indexOf('pmset ["-g","custom"]');
    assert(beepIndex >= 0, "confirmed apply should play attention sound");
    assert(adminIndex > beepIndex, "administrator prompt should happen after attention sound");
    assert(verifyIndex > adminIndex, "pmset verification should happen after administrator apply");
    assertIncludes(log, "pmset -a sleep 0 displaysleep 0 womp 1 tcpkeepalive 1", "administrator command");
    assertIncludes(log, "with prompt", "administrator command should include a visible prompt message");
    assertSecretSafe(`${result.stdout}\n${result.stderr}\n${log}`, "confirmed apply");
  } finally {
    rmSync(tools.dir, { recursive: true, force: true });
  }
  console.log("[OK] Mac power apply rings, uses administrator prompt, and verifies readback");
}

function checkAdminTimeoutIsClear(args) {
  const tools = makeFakeTools();
  try {
    const result = run(args, ["--apply", "--confirmUserPresent", "--json", "--timeoutMs", "1000"], {
      LAN_DUAL_OSASCRIPT_BIN: tools.osascriptPath,
      LAN_DUAL_PMSET_BIN: tools.pmsetPath,
      FAKE_TOOL_LOG: tools.logPath,
      FAKE_ADMIN_TIMEOUT: "1",
    });
    assert(result.status !== 0, "timed out administrator prompt should fail");
    const payload = parseJson(result.stdout, "timed out admin JSON");
    assert(payload.ok === false, "timed out admin JSON should be ok=false");
    assertIncludes(payload.error?.message || "", "timed out", "timed out admin error");
    assertSecretSafe(`${result.stdout}\n${result.stderr}`, "timed out admin JSON");
  } finally {
    rmSync(tools.dir, { recursive: true, force: true });
  }
  console.log("[OK] Mac power apply reports administrator timeout clearly");
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  checkHelp(args);
  checkDryRun(args);
  checkApplyRequiresConfirmation(args);
  checkApplyWithAdminPrompt(args);
  checkAdminTimeoutIsClear(args);
  console.log("[OK] Mac power apply self-test passed");
}

try {
  main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exit(1);
}
