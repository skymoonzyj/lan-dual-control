import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const helperDir = resolve(repoRoot, "apps/windows-wgc-helper");
const helperExe = resolve(helperDir, "target/debug/lan-dual-wgc-helper.exe");
const observeScript = resolve(scriptDir, "observe-windows-host-video.mjs");

const defaults = {
  timeoutMs: 90000,
  observerDurationMs: 1200,
  minObserverFrames: 5,
  realCaptureFrames: 1,
  realCaptureWidth: 1280,
  realCaptureHeight: 720,
  realCaptureJpegQuality: 0.55,
  realHostDurationMs: 1500,
  realHostMinFrames: 1,
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-wgc-helper.mjs [options]

Options:
  --timeoutMs <ms>          Per command timeout. Default: ${defaults.timeoutMs}
  --observerDurationMs <ms> Node host integration observation window. Default: ${defaults.observerDurationMs}
  --minObserverFrames <n>   Minimum frames in Node host integration check. Default: ${defaults.minObserverFrames}
  --realCaptureFrames <n>   Real WGC frames to capture directly. Default: ${defaults.realCaptureFrames}
  --realCaptureWidth <px>   Requested real WGC capture width. Default: ${defaults.realCaptureWidth}
  --realCaptureHeight <px>  Requested real WGC capture height. Default: ${defaults.realCaptureHeight}
  --realCaptureJpegQuality <n> Real WGC JPEG quality. Default: ${defaults.realCaptureJpegQuality}
  --realHostDurationMs <ms> Real Windows host WGC observation window. Default: ${defaults.realHostDurationMs}
  --realHostMinFrames <n>   Minimum real Windows host WGC frames. Default: ${defaults.realHostMinFrames}
  --skipRealCapture         Skip direct real WGC frame readback check
  --skipRealHostIntegration Skip real Windows host + real WGC helper integration check
  --skipObserver            Skip Node host integration check
  --json                    Print JSON summary
  --help, -h                Show this help without building

Description:
  Builds apps/windows-wgc-helper, verifies --probe creates WGC/D3D objects,
  verifies --mock emits json-lines-v1 frames with parseable timestamps, verifies
  real capture emits scaled JPEG frames with quality applied, points the Windows
  host WGC helper mode at mock helper output for a stable contract check, then
  verifies a temporary Windows host can receive real WGC helper frames.
`);
}

function parseArgs(argv) {
  const args = {
    ...defaults,
    skipRealCapture: false,
    skipRealHostIntegration: false,
    skipObserver: false,
    json: false,
    help: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--skipObserver") {
      args.skipObserver = true;
      continue;
    }
    if (token === "--skipRealCapture") {
      args.skipRealCapture = true;
      continue;
    }
    if (token === "--skipRealHostIntegration") {
      args.skipRealHostIntegration = true;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(10000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    if (token === "--observerDurationMs" && next && !next.startsWith("--")) {
      args.observerDurationMs = Math.max(500, Number(next) || defaults.observerDurationMs);
      index += 1;
      continue;
    }
    if (token === "--minObserverFrames" && next && !next.startsWith("--")) {
      args.minObserverFrames = Math.max(1, Number(next) || defaults.minObserverFrames);
      index += 1;
      continue;
    }
    if (token === "--realCaptureFrames" && next && !next.startsWith("--")) {
      args.realCaptureFrames = Math.max(1, Number(next) || defaults.realCaptureFrames);
      index += 1;
      continue;
    }
    if (token === "--realCaptureWidth" && next && !next.startsWith("--")) {
      args.realCaptureWidth = Math.max(1, Number(next) || defaults.realCaptureWidth);
      index += 1;
      continue;
    }
    if (token === "--realCaptureHeight" && next && !next.startsWith("--")) {
      args.realCaptureHeight = Math.max(1, Number(next) || defaults.realCaptureHeight);
      index += 1;
      continue;
    }
    if (token === "--realCaptureJpegQuality" && next && !next.startsWith("--")) {
      args.realCaptureJpegQuality = Math.min(1, Math.max(0.01, Number(next) || defaults.realCaptureJpegQuality));
      index += 1;
      continue;
    }
    if (token === "--realHostDurationMs" && next && !next.startsWith("--")) {
      args.realHostDurationMs = Math.max(500, Number(next) || defaults.realHostDurationMs);
      index += 1;
      continue;
    }
    if (token === "--realHostMinFrames" && next && !next.startsWith("--")) {
      args.realHostMinFrames = Math.max(1, Number(next) || defaults.realHostMinFrames);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function runCommand(command, args, { cwd = repoRoot, env = process.env, timeoutMs = defaults.timeoutMs } = {}) {
  return new Promise((resolveRun) => {
    const startedAt = performance.now();
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    const timer = setTimeout(() => {
      child.kill();
      const stdoutBuffer = Buffer.concat(stdoutChunks);
      const stderrBuffer = Buffer.concat(stderrChunks);
      resolveRun({
        command,
        args,
        cwd,
        exitCode: null,
        timedOut: true,
        stdout: stdoutBuffer.toString("utf8"),
        stderr: stderrBuffer.toString("utf8"),
        stdoutBuffer,
        stderrBuffer,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.from(chunk));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      const stdoutBuffer = Buffer.concat(stdoutChunks);
      const stderrBuffer = Buffer.concat(stderrChunks);
      resolveRun({
        command,
        args,
        cwd,
        exitCode: null,
        timedOut: false,
        stdout: stdoutBuffer.toString("utf8"),
        stderr: `${stderrBuffer.toString("utf8")}\n${error.message}`.trim(),
        stdoutBuffer,
        stderrBuffer,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const stdoutBuffer = Buffer.concat(stdoutChunks);
      const stderrBuffer = Buffer.concat(stderrChunks);
      resolveRun({
        command,
        args,
        cwd,
        exitCode,
        timedOut: false,
        stdout: stdoutBuffer.toString("utf8"),
        stderr: stderrBuffer.toString("utf8"),
        stdoutBuffer,
        stderrBuffer,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    });
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runRequired(command, args, options) {
  const result = await runCommand(command, args, options);
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(`${command} ${args.join(" ")} failed${result.timedOut ? " (timeout)" : ""}.\n${result.stdout}\n${result.stderr}`.trim());
  }
  return result;
}

function parseJsonLines(output) {
  return String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
}

function parseBinaryFrames(buffer) {
  const messages = [];
  let offset = 0;
  while (offset < buffer.length) {
    const newlineIndex = buffer.indexOf(0x0a, offset);
    if (newlineIndex < 0) {
      throw new Error(`binary helper output ended before JSON header newline at offset ${offset}`);
    }
    const line = buffer.subarray(offset, newlineIndex).toString("utf8").trim();
    offset = newlineIndex + 1;
    if (!line) {
      continue;
    }
    const message = JSON.parse(line.replace(/^\uFEFF/, ""));
    const payloadBytes = Number(message.payloadBytes) || 0;
    if (String(message.encoding || "").toLowerCase() === "binary" || message.binaryPayload === true) {
      if (offset + payloadBytes > buffer.length) {
        throw new Error(`binary helper payload truncated: need ${payloadBytes}, have ${buffer.length - offset}`);
      }
      message.payloadBuffer = buffer.subarray(offset, offset + payloadBytes);
      offset += payloadBytes;
    }
    messages.push(message);
  }
  return messages;
}

async function buildHelper(args) {
  await runRequired("cargo", ["check", "--quiet"], { cwd: helperDir, timeoutMs: args.timeoutMs });
  await runRequired("cargo", ["build", "--quiet"], { cwd: helperDir, timeoutMs: args.timeoutMs });
  assert(existsSync(helperExe), `helper exe not found after build: ${helperExe}`);
  return helperExe;
}

async function probeHelper(args) {
  const result = await runRequired(helperExe, ["--probe"], { cwd: helperDir, timeoutMs: args.timeoutMs });
  const lines = parseJsonLines(result.stdout);
  const probe = lines.find((line) => line.type === "probe");
  assert(probe, "missing probe JSON line");
  assert(probe.ok === true, `expected WGC probe ok=true, got ${JSON.stringify(probe)}`);
  assert(Number(probe.width) > 0 && Number(probe.height) > 0, `invalid WGC probe display size: ${JSON.stringify(probe)}`);
  assert(probe.sessionSupported === true, "expected GraphicsCaptureSession support");
  return probe;
}

async function checkMockFrames(args) {
  const result = await runRequired(helperExe, ["--mock", "--frames", "3", "--fps", "30", "--width", "640", "--height", "360"], {
    cwd: helperDir,
    timeoutMs: args.timeoutMs,
  });
  const lines = parseJsonLines(result.stdout);
  const hello = lines.find((line) => line.type === "hello");
  const frames = lines.filter((line) => line.type === "frame");
  assert(hello?.protocol === "json-lines-v1", `missing helper hello protocol: ${JSON.stringify(hello)}`);
  assert(frames.length === 3, `expected 3 mock frames, got ${frames.length}`);
  for (const frame of frames) {
    assert(Date.parse(String(frame.timestamp || "")) > 0, `frame timestamp is not parseable: ${JSON.stringify(frame)}`);
    assert(String(frame.dataBase64 || "").length > 0, "mock frame missing dataBase64");
  }
  return { hello, frameCount: frames.length };
}

async function checkMockBinaryRawFrames(args) {
  const result = await runRequired(helperExe, [
    "--mock",
    "--frames",
    "2",
    "--fps",
    "30",
    "--width",
    "8",
    "--height",
    "6",
    "--outputFormat",
    "bgra",
    "--protocol",
    "binary-frame-v1",
  ], {
    cwd: helperDir,
    timeoutMs: args.timeoutMs,
  });
  const messages = parseBinaryFrames(result.stdoutBuffer);
  const hello = messages.find((line) => line.type === "hello");
  const frames = messages.filter((line) => line.type === "frame");
  assert(hello?.protocol === "binary-frame-v1", `missing helper binary protocol: ${JSON.stringify(hello)}`);
  assert(hello?.codec === "raw-bgra", `expected raw-bgra hello, got ${JSON.stringify(hello)}`);
  assert(hello?.encoding === "binary", `expected binary hello encoding, got ${JSON.stringify(hello)}`);
  assert(frames.length === 2, `expected 2 binary raw mock frames, got ${frames.length}`);
  for (const frame of frames) {
    assert(frame.codec === "raw-bgra", `expected raw-bgra binary frame, got ${JSON.stringify(frame)}`);
    assert(frame.encoding === "binary", `expected binary frame encoding, got ${JSON.stringify(frame)}`);
    assert(frame.payloadBuffer?.length === 8 * 6 * 4, `binary raw payload length mismatch: ${frame.payloadBuffer?.length}`);
    assert(Number(frame.payloadBytes) === frame.payloadBuffer.length, "binary raw payloadBytes did not match actual bytes");
  }
  return { hello, frameCount: frames.length, payloadBytes: frames[0].payloadBuffer.length };
}

async function checkMockBinaryNv12Frames(args) {
  const result = await runRequired(helperExe, [
    "--mock",
    "--frames",
    "2",
    "--fps",
    "30",
    "--width",
    "8",
    "--height",
    "6",
    "--outputFormat",
    "nv12",
    "--protocol",
    "binary-frame-v1",
  ], {
    cwd: helperDir,
    timeoutMs: args.timeoutMs,
  });
  const messages = parseBinaryFrames(result.stdoutBuffer);
  const hello = messages.find((line) => line.type === "hello");
  const frames = messages.filter((line) => line.type === "frame");
  assert(hello?.protocol === "binary-frame-v1", `missing helper binary protocol: ${JSON.stringify(hello)}`);
  assert(hello?.codec === "raw-nv12", `expected raw-nv12 hello, got ${JSON.stringify(hello)}`);
  assert(hello?.pixelFormat === "nv12", `expected nv12 pixel format, got ${JSON.stringify(hello)}`);
  assert(hello?.encoding === "binary", `expected binary hello encoding, got ${JSON.stringify(hello)}`);
  assert(frames.length === 2, `expected 2 binary NV12 mock frames, got ${frames.length}`);
  for (const frame of frames) {
    assert(frame.codec === "raw-nv12", `expected raw-nv12 binary frame, got ${JSON.stringify(frame)}`);
    assert(frame.pixelFormat === "nv12", `expected nv12 binary frame, got ${JSON.stringify(frame)}`);
    assert(frame.encoding === "binary", `expected binary frame encoding, got ${JSON.stringify(frame)}`);
    assert(frame.payloadBuffer?.length === 8 * 6 * 3 / 2, `binary NV12 payload length mismatch: ${frame.payloadBuffer?.length}`);
    assert(Number(frame.payloadBytes) === frame.payloadBuffer.length, "binary NV12 payloadBytes did not match actual bytes");
  }
  return { hello, frameCount: frames.length, payloadBytes: frames[0].payloadBuffer.length };
}

function assertJpegBase64(frame, label) {
  const bytes = Buffer.from(String(frame.dataBase64 || ""), "base64");
  assert(bytes.length > 32, `${label} JPEG payload too small: ${bytes.length} bytes`);
  assert(bytes[0] === 0xff && bytes[1] === 0xd8, `${label} JPEG missing SOI marker`);
  assert(bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9, `${label} JPEG missing EOI marker`);
  return bytes.length;
}

async function checkRealCaptureFrames(args) {
  const result = await runRequired(helperExe, [
    "--frames",
    String(args.realCaptureFrames),
    "--fps",
    "10",
    "--width",
    String(args.realCaptureWidth),
    "--height",
    String(args.realCaptureHeight),
    "--jpegQuality",
    String(args.realCaptureJpegQuality),
  ], {
    cwd: helperDir,
    timeoutMs: args.timeoutMs,
  });
  const lines = parseJsonLines(result.stdout);
  const hello = lines.find((line) => line.type === "hello");
  const frames = lines.filter((line) => line.type === "frame");
  assert(hello?.backend === "windows-graphics-capture", `missing real capture hello backend: ${JSON.stringify(hello)}`);
  assert(hello?.protocol === "json-lines-v1", `missing real capture hello protocol: ${JSON.stringify(hello)}`);
  assert(hello?.codec === "jpeg", `expected real capture codec=jpeg, got ${hello?.codec || "missing"}`);
  assert(hello?.encoding === "base64", `expected real capture encoding=base64, got ${hello?.encoding || "missing"}`);
  assert(Number(hello?.width) > 0 && Number(hello?.height) > 0, `invalid real capture hello dimensions: ${JSON.stringify(hello)}`);
  assert(Number(hello.width) <= args.realCaptureWidth && Number(hello.height) <= args.realCaptureHeight, `real capture hello did not honor requested bounds: ${JSON.stringify(hello)}`);
  assert(Math.abs(Number(hello.jpegQuality) - args.realCaptureJpegQuality) < 0.001, `real capture hello did not echo jpegQuality=${args.realCaptureJpegQuality}: ${JSON.stringify(hello)}`);
  assert(frames.length === args.realCaptureFrames, `expected ${args.realCaptureFrames} real frame(s), got ${frames.length}`);

  let totalPayloadBytes = 0;
  for (const [index, frame] of frames.entries()) {
    const label = `real frame ${index + 1}`;
    assert(Date.parse(String(frame.timestamp || "")) > 0, `${label} timestamp is not parseable: ${JSON.stringify(frame)}`);
    assert(Number(frame.width) > 0 && Number(frame.height) > 0, `${label} has invalid dimensions: ${JSON.stringify(frame)}`);
    assert(Number(frame.width) <= args.realCaptureWidth && Number(frame.height) <= args.realCaptureHeight, `${label} did not honor requested bounds: ${JSON.stringify(frame)}`);
    assert(Number(frame.sourceWidth) >= Number(frame.width) && Number(frame.sourceHeight) >= Number(frame.height), `${label} source dimensions should be at least output dimensions: ${JSON.stringify(frame)}`);
    if (Number(frame.sourceWidth) > args.realCaptureWidth || Number(frame.sourceHeight) > args.realCaptureHeight) {
      assert(frame.scaled === true, `${label} should report scaled=true: ${JSON.stringify(frame)}`);
      assert(Number(frame.width) * Number(frame.height) < Number(frame.sourceWidth) * Number(frame.sourceHeight), `${label} did not reduce pixel count: ${JSON.stringify(frame)}`);
    }
    assert(Math.abs(Number(frame.jpegQuality) - args.realCaptureJpegQuality) < 0.001, `${label} did not echo jpegQuality=${args.realCaptureJpegQuality}: ${JSON.stringify(frame)}`);
    const decodedLength = assertJpegBase64(frame, label);
    totalPayloadBytes += decodedLength;
    if (Number(frame.payloadBytes) > 0) {
      assert(Number(frame.payloadBytes) === decodedLength, `${label} payloadBytes ${frame.payloadBytes} did not match decoded JPEG size ${decodedLength}`);
    }
  }

  const firstFrame = frames[0] || {};
  return {
    hello,
    frameCount: frames.length,
    width: Number(firstFrame.width) || 0,
    height: Number(firstFrame.height) || 0,
    sourceWidth: Number(firstFrame.sourceWidth) || 0,
    sourceHeight: Number(firstFrame.sourceHeight) || 0,
    jpegQuality: Number(firstFrame.jpegQuality) || 0,
    scaled: firstFrame.scaled === true,
    payloadBytes: Number(firstFrame.payloadBytes) || assertJpegBase64(firstFrame, "first real frame"),
    totalPayloadBytes,
  };
}

async function checkMockNodeHostIntegration(args) {
  const env = {
    ...process.env,
    LAN_DUAL_WINDOWS_WGC_HELPER: helperExe,
    LAN_DUAL_WINDOWS_WGC_HELPER_ARGS: "--mock",
  };
  const result = await runRequired(process.execPath, [
    observeScript,
    "--screenMode",
    "wgc",
    "--requireRealVideo",
    "false",
    "--durationMs",
    String(args.observerDurationMs),
    "--minFrames",
    String(args.minObserverFrames),
    "--minFps",
    "0",
    "--maxGapMs",
    String(Math.max(10000, args.observerDurationMs + 6000)),
    "--resourceSample",
    "false",
    "--json",
  ], {
    cwd: repoRoot,
    env,
    timeoutMs: args.timeoutMs,
  });
  const report = JSON.parse(result.stdout.trim().replace(/^\uFEFF/, ""));
  const screen = report.discoveryScreen || {};
  const wgc = screen.wgc || {};
  const observation = report.observation || {};
  assert(report.ok === true, "observer report was not ok");
  assert(screen.capturePipeline === "windows-wgc-helper-jpeg", `expected WGC helper pipeline, got ${screen.capturePipeline || "missing"}`);
  assert(wgc.active === true, `expected screen.wgc.active=true, got ${JSON.stringify(wgc)}`);
  assert(wgc.helperCommand === helperExe, `expected helper command ${helperExe}, got ${wgc.helperCommand || "missing"}`);
  assert(Array.isArray(observation.pipelines) && observation.pipelines.includes("windows-wgc-helper-jpeg"), "observer did not receive WGC helper frames");
  assert(Number(observation.frameCount) >= args.minObserverFrames, `expected at least ${args.minObserverFrames} frames, got ${observation.frameCount || 0}`);
  return { frameCount: observation.frameCount, fps: observation.fps, pipeline: screen.capturePipeline };
}

async function checkRealNodeHostIntegration(args) {
  const env = {
    ...process.env,
    LAN_DUAL_WINDOWS_WGC_HELPER: helperExe,
  };
  delete env.LAN_DUAL_WINDOWS_WGC_HELPER_ARGS;
  const result = await runRequired(process.execPath, [
    observeScript,
    "--screenMode",
    "wgc",
    "--requireRealVideo",
    "true",
    "--width",
    String(args.realCaptureWidth),
    "--height",
    String(args.realCaptureHeight),
    "--durationMs",
    String(args.realHostDurationMs),
    "--minFrames",
    String(args.realHostMinFrames),
    "--minFps",
    "0",
    "--maxGapMs",
    String(Math.max(10000, args.realHostDurationMs + 6000)),
    "--resourceSample",
    "false",
    "--json",
  ], {
    cwd: repoRoot,
    env,
    timeoutMs: args.timeoutMs,
  });
  const report = JSON.parse(result.stdout.trim().replace(/^\uFEFF/, ""));
  const screen = report.discoveryScreen || {};
  const wgc = screen.wgc || {};
  const observation = report.observation || {};
  assert(report.ok === true, "real host observer report was not ok");
  assert(screen.capturePipeline === "windows-wgc-helper-jpeg", `expected real WGC helper pipeline, got ${screen.capturePipeline || "missing"}`);
  assert(wgc.active === true, `expected real screen.wgc.active=true, got ${JSON.stringify(wgc)}`);
  assert(wgc.helperCommand === helperExe, `expected real helper command ${helperExe}, got ${wgc.helperCommand || "missing"}`);
  assert(Array.isArray(observation.pipelines) && observation.pipelines.includes("windows-wgc-helper-jpeg"), "real observer did not receive WGC helper frames");
  assert(Number(observation.frameCount) >= args.realHostMinFrames, `expected at least ${args.realHostMinFrames} real host frame(s), got ${observation.frameCount || 0}`);
  assert(Number(observation.width) <= args.realCaptureWidth && Number(observation.height) <= args.realCaptureHeight, `real host output did not honor requested bounds: ${JSON.stringify(observation)}`);
  assert(Array.isArray(observation.jpegQualities) && observation.jpegQualities.length > 0, "real host did not report JPEG quality");
  return {
    frameCount: observation.frameCount,
    fps: observation.fps,
    width: observation.width,
    height: observation.height,
    avgPayloadBytes: observation.avgPayloadBytes,
    maxFrameAgeMs: observation.maxFrameAgeMs,
    pipeline: screen.capturePipeline,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const helperPath = await buildHelper(args);
  const probe = await probeHelper(args);
  const mock = await checkMockFrames(args);
  const mockBinaryRaw = await checkMockBinaryRawFrames(args);
  const mockBinaryNv12 = await checkMockBinaryNv12Frames(args);
  const realCapture = args.skipRealCapture ? null : await checkRealCaptureFrames(args);
  const mockObserver = args.skipObserver ? null : await checkMockNodeHostIntegration(args);
  const realHost = args.skipObserver || args.skipRealHostIntegration ? null : await checkRealNodeHostIntegration(args);
  const summary = { ok: true, helperPath, probe, mock, mockBinaryRaw, mockBinaryNv12, realCapture, mockObserver, realHost };
  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`[OK] Rust WGC helper built: ${helperPath}`);
    console.log(`[OK] WGC probe: ${probe.displayName || "display"} ${probe.width}x${probe.height}`);
    console.log(`[OK] Mock contract frames: ${mock.frameCount}`);
    console.log(`[OK] Mock binary raw BGRA frames: ${mockBinaryRaw.frameCount}, ${mockBinaryRaw.payloadBytes} bytes each`);
    console.log(`[OK] Mock binary raw NV12 frames: ${mockBinaryNv12.frameCount}, ${mockBinaryNv12.payloadBytes} bytes each`);
    if (realCapture) {
      console.log(`[OK] Real WGC capture: ${realCapture.frameCount} frame(s) ${realCapture.width}x${realCapture.height} from ${realCapture.sourceWidth}x${realCapture.sourceHeight}, q=${realCapture.jpegQuality}, ${realCapture.payloadBytes} bytes first JPEG`);
    }
    if (mockObserver) {
      console.log(`[OK] Mock Node host integration: ${mockObserver.frameCount} frames via ${mockObserver.pipeline}`);
    }
    if (realHost) {
      console.log(`[OK] Real Windows host WGC integration: ${realHost.frameCount} frame(s) ${realHost.width}x${realHost.height}, avg ${Math.round(realHost.avgPayloadBytes || 0)} bytes via ${realHost.pipeline}`);
    }
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
