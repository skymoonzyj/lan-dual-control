#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const scriptPath = "scripts/mac/stress-mac-host.mjs";

const defaults = {
  timeoutMs: 10000,
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
      args.timeoutMs = Math.max(3000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-stress-json-output.mjs [options]

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks
`);
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function createFakeProbe(mode) {
  const dir = mkdtempSync(path.join(tmpdir(), "lan-dual-stress-json-"));
  const markerPath = path.join(dir, "probe-count.txt");
  const probePath = path.join(dir, "fake-probe.mjs");
  writeFileSync(
    probePath,
    `#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const markerPath = ${JSON.stringify(markerPath)};
const mode = ${JSON.stringify(mode)};
let count = 0;
try {
  count = Number(readFileSync(markerPath, "utf8")) || 0;
} catch {
  count = 0;
}
count += 1;
writeFileSync(markerPath, String(count));
const passwordIndex = process.argv.indexOf("--password");
const password = passwordIndex >= 0 ? process.argv[passwordIndex + 1] : "";
console.log("[OK] First frame: 1280x720 frameId=" + count);
console.log("[OK] H.264 video confirmed: codec=h264 encoding=annexb-base64");
console.log("[OK] Audio frame confirmed: codec=pcm-f32le");
if (mode === "fail-second" && count === 2) {
  console.error("simulated probe failure password=" + password);
  process.exit(7);
}
`,
  );
  return {
    probePath,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function runStress(probePath, extraArgs, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn(
      process.execPath,
      [
        scriptPath,
        "--json",
        "--probeScript",
        probePath,
        "--host",
        "127.0.0.1",
        "--port",
        "43770",
        "--password",
        "super-secret-json-test",
        "--iterations",
        "2",
        "--delayMs",
        "0",
        "--timeoutMs",
        "3000",
        "--sampleProcess",
        "false",
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
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${label} did not print parseable JSON: ${error.message}\nStdout:\n${stdout}`);
  }
}

async function assertJsonSuccess(timeoutMs) {
  const probe = createFakeProbe("success");
  try {
    const result = await runStress(probe.probePath, [], timeoutMs);
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode !== 0 || result.timedOut) {
      throw new Error(`stress-mac-host JSON success should pass. exit=${result.exitCode} timedOut=${result.timedOut}\n${output}`);
    }
    const payload = parseJsonOutput(result.stdout, "stress-mac-host JSON success");
    if (payload.ok !== true) {
      throw new Error(`JSON success should report ok=true.\n${result.stdout}`);
    }
    if (payload.summary?.completedIterations !== 2) {
      throw new Error(`JSON success should complete two iterations.\n${result.stdout}`);
    }
    if (payload.summary?.attemptedIterations !== 2 || payload.summary?.failedIterations !== 0) {
      throw new Error(`JSON success should report attempted=2 and failed=0.\n${result.stdout}`);
    }
    if (payload.summary?.probe?.count !== 2) {
      throw new Error(`JSON success probe summary count should be two.\n${result.stdout}`);
    }
    if (payload.results?.length !== 2 || payload.results.some((item) => item.ok !== true)) {
      throw new Error(`JSON success should include two passing probe results.\n${result.stdout}`);
    }
    if (payload.results.some((item) => item.timings?.firstFrameMs === null)) {
      throw new Error(`JSON success should include first frame timings.\n${result.stdout}`);
    }
    if (String(result.stdout).includes("[OK]") || String(result.stdout).includes("[INFO]")) {
      throw new Error(`JSON stdout should not include text logs.\n${result.stdout}`);
    }
    if (String(result.stdout).includes("super-secret-json-test")) {
      throw new Error(`JSON stdout should not include the probe password.\n${result.stdout}`);
    }
    print("OK", "stress-mac-host JSON success output is parseable");
  } finally {
    probe.cleanup();
  }
}

async function assertJsonFailure(timeoutMs) {
  const probe = createFakeProbe("fail-second");
  try {
    const result = await runStress(probe.probePath, [], timeoutMs);
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode === 0 || result.timedOut) {
      throw new Error(`stress-mac-host JSON failure should fail. exit=${result.exitCode} timedOut=${result.timedOut}\n${output}`);
    }
    const payload = parseJsonOutput(result.stdout, "stress-mac-host JSON failure");
    if (payload.ok !== false) {
      throw new Error(`JSON failure should report ok=false.\n${result.stdout}`);
    }
    if (!String(payload.error?.message || "").includes("probe #2 failed")) {
      throw new Error(`JSON failure error message missing probe number.\n${result.stdout}`);
    }
    if (String(result.stdout).includes("super-secret-json-test")) {
      throw new Error(`JSON failure should redact password.\n${result.stdout}`);
    }
    if (payload.results?.length !== 2 || payload.results[0]?.ok !== true || payload.results[1]?.ok !== false) {
      throw new Error(`JSON failure should retain successful and failed probe results.\n${result.stdout}`);
    }
    if (payload.summary?.attemptedIterations !== 2 || payload.summary?.completedIterations !== 1 || payload.summary?.failedIterations !== 1) {
      throw new Error(`JSON failure should summarize attempted/completed/failed probes.\n${result.stdout}`);
    }
    if (!payload.results[1]?.stderrTail?.some((line) => line.includes("[redacted-password]"))) {
      throw new Error(`JSON failure stderr tail should retain redacted diagnostic.\n${result.stdout}`);
    }
    print("OK", "stress-mac-host JSON failure keeps failed probe details");
  } finally {
    probe.cleanup();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  await assertJsonSuccess(args.timeoutMs);
  await assertJsonFailure(args.timeoutMs);
  print("OK", "Mac stress JSON output self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
