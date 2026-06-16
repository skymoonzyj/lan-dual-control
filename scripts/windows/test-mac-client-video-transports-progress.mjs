import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const matrixScript = resolve(scriptDir, "test-mac-client-video-transports.mjs");

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-mac-client-video-transports-progress.mjs

Description:
  Verifies the Mac client video transport matrix prints outer progress during
  child browser self-test waits while keeping --json output parseable.

Options:
  --help, -h  Show this help without running child scripts
`);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(text, needle, context) {
  assert(String(text).includes(needle), `${context} missing ${needle}\n${text}`);
}

function assertNotIncludes(text, needle, context) {
  assert(!String(text).includes(needle), `${context} unexpectedly included ${needle}\n${text}`);
}

function runNode(args, { env = process.env, timeoutMs = 20000 } = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolveRun({
        ok: false,
        timedOut: true,
        exitCode: null,
        stdout,
        stderr,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({
        ok: false,
        timedOut: false,
        exitCode: null,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({
        ok: exitCode === 0,
        timedOut: false,
        exitCode,
        stdout,
        stderr,
      });
    });
  });
}

function parseJsonOutput(output, context) {
  try {
    return JSON.parse(String(output || "").trim().replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`${context} did not print clean JSON: ${error.message}\n${output}`);
  }
}

function fakeBrowserSelfTestSource() {
  return `
function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }
  return fallback;
}

await new Promise((resolveDelay) => setTimeout(resolveDelay, Number(process.env.FAKE_BROWSER_DELAY_MS) || 350));

const progress = argValue("--progressIntervalMs", "missing");
console.log("[OK] Binary H.264 video: fake frame visible progress=" + progress);
console.log("[OK] Mac client browser self-test passed progress=" + progress);
`;
}

async function verifyHelp() {
  const matrixHelp = await runNode([matrixScript, "--help"]);
  assert(matrixHelp.ok, `matrix --help failed\n${matrixHelp.stderr}`);
  assertIncludes(matrixHelp.stdout, "--progressIntervalMs", "matrix help");

  const selfHelp = await runNode([fileURLToPath(import.meta.url), "--help"]);
  assert(selfHelp.ok, `self --help failed\n${selfHelp.stderr}`);
  assertIncludes(selfHelp.stdout, "Usage:", "self help");
  console.log("[OK] Help includes --progressIntervalMs");
}

async function verifyOrdinaryProgress(fakeBrowserPath) {
  const result = await runNode([
    matrixScript,
    "--case",
    "binary-h264",
    "--timeoutMs",
    "10000",
    "--progressIntervalMs",
    "100",
    "--retries",
    "0",
  ], {
    env: {
      ...process.env,
      LAN_DUAL_MAC_CLIENT_BROWSER_TEST_SCRIPT: fakeBrowserPath,
      FAKE_BROWSER_DELAY_MS: "350",
    },
  });
  assert(result.ok, `matrix ordinary run failed\n${result.stdout}\n${result.stderr}`);
  assertIncludes(result.stdout, "progressEvery=0.1s", "ordinary output");
  assertIncludes(result.stdout, "case binary-h264 attempt 1/1 progress", "ordinary output");
  assertIncludes(result.stdout, "Mac client video transport matrix passed", "ordinary output");
  assertIncludes(result.stdout, "progress=100", "ordinary output highlights");
  console.log("[OK] Matrix ordinary output prints outer progress and passes progress to the child");
}

async function verifyJsonClean(fakeBrowserPath) {
  const result = await runNode([
    matrixScript,
    "--case",
    "binary-h264",
    "--timeoutMs",
    "10000",
    "--progressIntervalMs",
    "100",
    "--retries",
    "0",
    "--json",
  ], {
    env: {
      ...process.env,
      LAN_DUAL_MAC_CLIENT_BROWSER_TEST_SCRIPT: fakeBrowserPath,
      FAKE_BROWSER_DELAY_MS: "350",
    },
  });
  assert(result.ok, `matrix JSON run failed\n${result.stdout}\n${result.stderr}`);
  assertNotIncludes(result.stdout, "[INFO]", "JSON output");
  assertNotIncludes(result.stdout, "progress:", "JSON output");
  const summary = parseJsonOutput(result.stdout, "matrix JSON output");
  assert(summary.progressIntervalMs === 100, "JSON summary should include progressIntervalMs");
  assert(summary.results?.[0]?.highlights?.some((line) => line.includes("progress=100")), "JSON highlights should retain child progress argument evidence");
  console.log("[OK] Matrix --json remains clean");
}

async function main() {
  await verifyHelp();
  const tempDir = await mkdtemp(join(tmpdir(), "lan-dual-video-matrix-progress-"));
  const fakeBrowserPath = join(tempDir, "fake-browser-self-test.mjs");
  try {
    await writeFile(fakeBrowserPath, fakeBrowserSelfTestSource(), "utf8");
    await verifyOrdinaryProgress(fakeBrowserPath);
    await verifyJsonClean(fakeBrowserPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
  console.log("[OK] Mac client video transport matrix progress tests passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.stack || error.message}`);
  process.exitCode = 1;
});
