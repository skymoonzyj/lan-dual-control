#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const scriptPath = "scripts/mac/check-input-keymap.mjs";
const sourcePath = path.join(repoRoot, "apps", "mac-host", "Sources", "MacHost", "InputEventInjector.swift");

const defaults = {
  timeoutMs: 8000,
};

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
      args.timeoutMs = Math.max(1000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-input-keymap-json-output.mjs [options]

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks
`);
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function runKeymap(extraArgs, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn(
      process.execPath,
      [
        scriptPath,
        "--json",
        ...extraArgs,
      ],
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolveRun({ exitCode: null, timedOut: true, stdout, stderr });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({ exitCode: null, timedOut: false, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({ exitCode, timedOut: false, stdout, stderr });
    });
  });
}

function parseJsonOutput(stdout, label) {
  const text = stdout.trim();
  if (text.includes("[OK]") || text.includes("[INFO]") || text.includes("[ERROR]")) {
    throw new Error(`${label} JSON stdout should not include text logs.\n${stdout}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} did not print parseable JSON: ${error.message}\nStdout:\n${stdout}`);
  }
}

async function assertJsonSuccess(timeoutMs) {
  const result = await runKeymap([], timeoutMs);
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(`check-input-keymap JSON success should pass. exit=${result.exitCode} timedOut=${result.timedOut}\n${output}`);
  }

  const payload = parseJsonOutput(result.stdout, "check-input-keymap JSON success");
  if (payload.ok !== true) {
    throw new Error(`JSON success should report ok=true.\n${result.stdout}`);
  }
  if (!Array.isArray(payload.codeGroups) || !Array.isArray(payload.keyGroups)) {
    throw new Error(`JSON success should include codeGroups and keyGroups.\n${result.stdout}`);
  }
  if (payload.codeEntries < 100 || payload.keyEntries < 100) {
    throw new Error(`JSON success should report substantial parsed key maps.\n${result.stdout}`);
  }
  if (!Array.isArray(payload.missing) || payload.missing.length !== 0) {
    throw new Error(`JSON success should have no missing keys.\n${result.stdout}`);
  }
  if (!Array.isArray(payload.modifierFlags) || payload.modifierFlags.some((item) => item.issues?.length > 0)) {
    throw new Error(`JSON success should include passing modifier flag coverage.\n${result.stdout}`);
  }
  print("OK", "check-input-keymap JSON success output is parseable");
}

async function assertJsonMissingKey(timeoutMs) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "lan-dual-keymap-json-"));
  try {
    const source = await readFile(sourcePath, "utf8");
    const badSource = source.replace('"KeyA": 0, ', "");
    if (badSource === source) {
      throw new Error("Test fixture could not remove KeyA from InputEventInjector.swift source");
    }
    const badSourcePath = path.join(tempDir, "InputEventInjectorMissingKey.swift");
    await writeFile(badSourcePath, badSource);

    const result = await runKeymap(["--source", badSourcePath], timeoutMs);
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode === 0 || result.timedOut) {
      throw new Error(`check-input-keymap JSON missing-key path should fail. exit=${result.exitCode} timedOut=${result.timedOut}\n${output}`);
    }

    const payload = parseJsonOutput(result.stdout, "check-input-keymap JSON missing-key path");
    if (payload.ok !== false) {
      throw new Error(`JSON missing-key path should report ok=false.\n${result.stdout}`);
    }
    if (!payload.missing?.includes("letters:KeyA")) {
      throw new Error(`JSON missing-key path should report letters:KeyA.\n${result.stdout}`);
    }
    print("OK", "check-input-keymap JSON missing-key failure stays machine-readable");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function assertJsonReadError(timeoutMs) {
  const missingPath = path.join(tmpdir(), "lan-dual-control-missing-keymap-source.swift");
  const result = await runKeymap(["--source", missingPath], timeoutMs);
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode === 0 || result.timedOut) {
    throw new Error(`check-input-keymap JSON read-error path should fail. exit=${result.exitCode} timedOut=${result.timedOut}\n${output}`);
  }

  const payload = parseJsonOutput(result.stdout, "check-input-keymap JSON read-error path");
  if (payload.ok !== false || !payload.error?.message) {
    throw new Error(`JSON read-error path should report ok=false and error.message.\n${result.stdout}`);
  }
  print("OK", "check-input-keymap JSON read-error failure stays machine-readable");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  await assertJsonSuccess(args.timeoutMs);
  await assertJsonMissingKey(args.timeoutMs);
  await assertJsonReadError(args.timeoutMs);
  print("OK", "Mac input keymap JSON output self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
