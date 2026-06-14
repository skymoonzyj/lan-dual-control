import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const observeScript = resolve(scriptDir, "observe-windows-host-video.mjs");

const defaults = {
  timeoutMs: 45000,
  durationMs: 6500,
  minFrames: 1,
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-wgc-mode.mjs [options]

Options:
  --timeoutMs <ms>       Overall observer timeout. Default: ${defaults.timeoutMs}
  --durationMs <ms>      WGC-mode observation window. Default: ${defaults.durationMs}
  --minFrames <n>        Minimum frames required from the fallback path. Default: ${defaults.minFrames}
  --mockHelper           Use a temporary JSON-lines helper to verify WGC helper frame ingestion
  --help, -h             Show this help without starting a host

Description:
  Starts the Windows video observer with --screenMode wgc and verifies the
  transitional WGC entrypoint reports requestedMode=wgc, screen.wgc diagnostics,
  and an explicit fallback reason. With --mockHelper it also verifies the
  helper contract can drive the windows-wgc-helper-jpeg pipeline.
`);
}

function parseArgs(argv) {
  const args = { ...defaults, help: false, mockHelper: false };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--mockHelper") {
      args.mockHelper = true;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(5000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    if (token === "--durationMs" && next && !next.startsWith("--")) {
      args.durationMs = Math.max(1000, Number(next) || defaults.durationMs);
      index += 1;
      continue;
    }
    if (token === "--minFrames" && next && !next.startsWith("--")) {
      args.minFrames = Math.max(1, Number(next) || defaults.minFrames);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function createMockWgcHelper() {
  const dir = mkdtempSync(resolve(tmpdir(), "lan-dual-wgc-helper-"));
  const helperPath = resolve(dir, "mock-wgc-helper.mjs");
  const onePixelJpegBase64 =
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AUf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AUf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QUf/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QUf/EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QUf/Z";
  const source = `
const width = Number(process.env.LAN_DUAL_WGC_WIDTH) || 1280;
const height = Number(process.env.LAN_DUAL_WGC_HEIGHT) || 720;
const fps = Math.max(1, Math.min(120, Number(process.env.LAN_DUAL_WGC_FPS) || 30));
const intervalMs = Math.max(8, Math.round(1000 / fps));
const dataBase64 = ${JSON.stringify(onePixelJpegBase64)};
console.log(JSON.stringify({ type: "hello", backend: "contract-test-wgc-helper", codec: "jpeg", encoding: "base64", width, height, fps }));
let frameId = 0;
setInterval(() => {
  frameId += 1;
  console.log(JSON.stringify({
    type: "frame",
    frameId,
    timestamp: new Date().toISOString(),
    width,
    height,
    sourceWidth: width,
    sourceHeight: height,
    dataBase64,
    payloadBytes: Buffer.byteLength(dataBase64, "base64"),
  }));
}, intervalMs);
`;
  writeFileSync(helperPath, source, "utf8");
  return {
    dir,
    helperPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function runObserver(args) {
  return new Promise((resolveRun) => {
    const env = { ...process.env };
    if (args.mockHelper) {
      env.LAN_DUAL_WINDOWS_WGC_HELPER = process.execPath;
      env.LAN_DUAL_WINDOWS_WGC_HELPER_ARGS = args.mockHelper.helperPath;
      env.LAN_DUAL_WINDOWS_WGC_ALLOW_UNSUPPORTED = "1";
    }
    const child = spawn(process.execPath, [
      observeScript,
      "--screenMode",
      "wgc",
      "--requireRealVideo",
      "false",
      "--durationMs",
      String(args.durationMs),
      "--minFrames",
      String(args.minFrames),
      "--minFps",
      "0",
      "--maxGapMs",
      String(Math.max(10000, args.durationMs + 6000)),
      "--resourceSample",
      "false",
      "--json",
    ], {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolveRun({ exitCode: null, timedOut: true, stdout, stderr });
    }, args.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({ exitCode: null, timedOut: false, stdout, stderr: `${stderr}\n${error.message}`.trim() });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({ exitCode, timedOut: false, stdout, stderr });
    });
  });
}

function parseObserverJson(output) {
  const text = String(output || "").trim().replace(/^\uFEFF/, "");
  if (!text) {
    throw new Error("observer produced no JSON");
  }
  return JSON.parse(text);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  let mockHelper = null;
  if (args.mockHelper) {
    mockHelper = createMockWgcHelper();
    args.mockHelper = mockHelper;
  }

  try {
    const result = await runObserver(args);
    if (result.exitCode !== 0 || result.timedOut) {
      throw new Error(`WGC-mode observer failed${result.timedOut ? " (timeout)" : ""}.\n${result.stdout}\n${result.stderr}`.trim());
    }

    const report = parseObserverJson(result.stdout);
    const screen = report.discoveryScreen || {};
    const wgc = screen.wgc || {};
    const observation = report.observation || {};

    assert(report.ok === true, "observer report was not ok");
    assert(screen.requestedMode === "wgc", `expected requestedMode=wgc, got ${screen.requestedMode || "missing"}`);
    assert(wgc.requested === true, "expected screen.wgc.requested=true");
    assert(Array.isArray(observation.requestedScreenModes) && observation.requestedScreenModes.includes("wgc"), "expected observed frames to carry requestedScreenMode=wgc");
    assert(Number(observation.frameCount) >= args.minFrames, `expected at least ${args.minFrames} frame(s), got ${observation.frameCount || 0}`);

    if (args.mockHelper) {
      assert(wgc.active === true, `expected mock helper WGC backend to be active; got ${JSON.stringify(wgc)}`);
      assert(wgc.backendImplemented === true, `expected helper-backed WGC backendImplemented=true; got ${JSON.stringify(wgc)}`);
      assert(wgc.helperAvailable === true, `expected screen.wgc.helperAvailable=true; got ${JSON.stringify(wgc)}`);
      assert(wgc.helperProtocol === "json-lines-v1", `expected json-lines-v1 helper protocol, got ${wgc.helperProtocol || "missing"}`);
      assert(screen.capturePipeline === "windows-wgc-helper-jpeg", `expected WGC helper pipeline, got ${screen.capturePipeline || "missing"}`);
      assert(Array.isArray(observation.pipelines) && observation.pipelines.includes("windows-wgc-helper-jpeg"), "expected observed frames from windows-wgc-helper-jpeg");
      console.log(`[OK] WGC helper contract produced frames: active=${wgc.active}, pipeline=${screen.capturePipeline}, frames=${observation.frameCount}`);
    } else {
      assert(wgc.active === false, `expected WGC backend to be inactive without a helper; got ${JSON.stringify(wgc)}`);
      assert(wgc.backendImplemented === false, `expected screen.wgc.backendImplemented=false until helper is configured; got ${JSON.stringify(wgc)}`);
      assert(String(wgc.fallbackReason || "").includes("helper is not active"), "expected WGC fallback reason to mention inactive helper");
      console.log(`[OK] WGC mode entrypoint reports fallback diagnostics: active=${wgc.active}, supported=${wgc.supported}, pipeline=${screen.capturePipeline || "unknown"}`);
    }
  } finally {
    mockHelper?.cleanup();
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
