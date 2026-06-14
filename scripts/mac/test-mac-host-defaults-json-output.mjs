#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const scriptPath = "scripts/mac/test-mac-host-defaults.mjs";

const defaults = {
  timeoutMs: 30000,
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
      args.timeoutMs = Math.max(5000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-host-defaults-json-output.mjs [options]

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks
`);
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function runDefaults(timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn(
      process.execPath,
      [
        scriptPath,
        "--timeoutMs",
        String(timeoutMs),
        "--json",
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
    }, timeoutMs + 5000);
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
  if (text.includes("[OK]") || text.includes("[INFO]") || text.includes("[FAIL]")) {
    throw new Error(`${label} JSON stdout should not include text logs.\n${stdout}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} did not print parseable JSON: ${error.message}\nStdout:\n${stdout}`);
  }
}

async function assertJsonSuccess(timeoutMs) {
  const result = await runDefaults(timeoutMs);
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(`test-mac-host-defaults JSON success should pass. exit=${result.exitCode} timedOut=${result.timedOut}\n${output}`);
  }

  const payload = parseJsonOutput(result.stdout, "test-mac-host-defaults JSON success");
  if (payload.ok !== true) {
    throw new Error(`JSON success should report ok=true.\n${result.stdout}`);
  }
  if (payload.binary?.exists !== true) {
    throw new Error(`JSON success should report existing Mac host binary.\n${result.stdout}`);
  }
  if (typeof payload.nativeInputMonitoring !== "boolean") {
    throw new Error(`JSON success should report nativeInputMonitoring boolean.\n${result.stdout}`);
  }
  if (payload.summary?.verified !== 2) {
    throw new Error(`JSON success should report two verified cases.\n${result.stdout}`);
  }
  const defaultCase = payload.cases?.find((item) => item.label === "default-input-log");
  const injectCase = payload.cases?.find((item) => item.label === "explicit-input-inject");
  if (defaultCase?.actualInputMode !== "log") {
    throw new Error(`JSON success should report default inputMode=log.\n${result.stdout}`);
  }
  if (injectCase?.actualInputMode !== "inject") {
    throw new Error(`JSON success should report explicit inputMode=inject.\n${result.stdout}`);
  }
  if (payload.cases.some((item) => item.permissions?.inputMonitoring !== payload.nativeInputMonitoring)) {
    throw new Error(`JSON success should keep permission diagnostics aligned with native probe.\n${result.stdout}`);
  }
  if (!String(result.stderr).includes("Mac host direct-start input defaults verified")) {
    throw new Error(`JSON mode should keep human logs on stderr.\n${result.stderr}`);
  }
  if (String(result.stdout).includes("test-password") || String(result.stderr).includes("test-password")) {
    throw new Error(`JSON test output should not include the temporary password.\n${output}`);
  }
  print("OK", "test-mac-host-defaults JSON output is parseable");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  await assertJsonSuccess(args.timeoutMs);
  print("OK", "Mac host defaults JSON output self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
