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
  width: 640,
  height: 360,
  h264Encoder: "",
  h264Source: "jpeg",
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-wgc-mode.mjs [options]

Options:
  --timeoutMs <ms>       Overall observer timeout. Default: ${defaults.timeoutMs}
  --durationMs <ms>      WGC-mode observation window. Default: ${defaults.durationMs}
  --minFrames <n>        Minimum frames required from the fallback path. Default: ${defaults.minFrames}
  --mockHelper           Use a temporary JSON-lines helper to verify WGC helper frame ingestion
  --h264Bridge           With --mockHelper, request H.264 and enable the WGC->FFmpeg bridge
  --h264Encoder <name>   Optional H.264 encoder for --h264Bridge, for example h264_nvenc
  --h264Source <source>  jpeg | raw-bgra | nv12 for --h264Bridge. Default: ${defaults.h264Source}
  --width <px>           Observer request width. Default: ${defaults.width}
  --height <px>          Observer request height. Default: ${defaults.height}
  --help, -h             Show this help without starting a host

Description:
  Starts the Windows video observer with --screenMode wgc and verifies the
  transitional WGC entrypoint reports requestedMode=wgc, screen.wgc diagnostics,
  and an explicit fallback reason. With --mockHelper it also verifies the
  helper contract can drive the windows-wgc-helper-jpeg pipeline. With
  --mockHelper --h264Bridge it also verifies the explicit WGC JPEG to
  FFmpeg H.264 bridge pipeline without requiring real WGC permissions. The
  bridge can be contract-tested with JPEG, raw BGRA, or NV12 source frames.
`);
}

function parseArgs(argv) {
  const args = { ...defaults, help: false, mockHelper: false, h264Bridge: false };
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
    if (token === "--h264Bridge") {
      args.h264Bridge = true;
      continue;
    }
    if (token === "--h264Encoder" && next && !next.startsWith("--")) {
      args.h264Encoder = next.trim().toLowerCase();
      index += 1;
      continue;
    }
    if (token === "--h264Source" && next && !next.startsWith("--")) {
      const source = next.trim().toLowerCase();
      if (["raw", "bgra", "raw-bgra", "raw_bgra"].includes(source)) {
        args.h264Source = "raw-bgra";
      } else if (["nv12", "raw-nv12", "raw_nv12", "yuv", "yuv420"].includes(source)) {
        args.h264Source = "nv12";
      } else {
        args.h264Source = "jpeg";
      }
      index += 1;
      continue;
    }
    if (token === "--width" && next && !next.startsWith("--")) {
      args.width = Math.max(320, Number(next) || defaults.width);
      index += 1;
      continue;
    }
    if (token === "--height" && next && !next.startsWith("--")) {
      args.height = Math.max(180, Number(next) || defaults.height);
      index += 1;
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
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCv+zl+zl/w0B/wkP8AxUP9g/2T9n/5cvtPm+b5v/TRNuPK9857Y5P2jf2cv+Gf/wDhHv8Aiof7e/tb7R/y5fZvK8ryv+mj7s+b7Yx3zwfs5ftG/wDDP/8AwkP/ABT39vf2t9n/AOX37N5Xleb/ANM33Z832xjvng/aN/aN/wCGgP8AhHv+Ke/sH+yftH/L79p83zfK/wCmabceV75z2xz+3/8ACj/aP/Tj/t3+X/wL4v6sfmH+w/Uf+n3z7/dt/Vz/2Q==";
  const source = `
const width = Number(process.env.LAN_DUAL_WGC_WIDTH) || 1280;
const height = Number(process.env.LAN_DUAL_WGC_HEIGHT) || 720;
const fps = Math.max(1, Math.min(120, Number(process.env.LAN_DUAL_WGC_FPS) || 30));
const intervalMs = Math.max(8, Math.round(1000 / fps));
const dataBase64 = ${JSON.stringify(onePixelJpegBase64)};
const outputFormat = String(process.env.LAN_DUAL_WGC_OUTPUT_FORMAT || "jpeg").toLowerCase();
const rawBgra = outputFormat === "bgra" || outputFormat === "raw-bgra" || outputFormat === "raw";
const rawNv12 = outputFormat === "nv12" || outputFormat === "raw-nv12" || outputFormat === "raw_nv12" || outputFormat === "yuv420";
const frameWidth = rawNv12 ? Math.max(2, width - (width % 2)) : width;
const frameHeight = rawNv12 ? Math.max(2, height - (height % 2)) : height;
const protocol = String(process.env.LAN_DUAL_WGC_HELPER_PROTOCOL || "json-lines-v1").toLowerCase();
const binaryProtocol = protocol === "binary-frame-v1" || protocol === "binary-frame" || protocol === "binary";
const jpegFrame = Buffer.from(dataBase64, "base64");
const rawFrame = rawBgra ? Buffer.alloc(frameWidth * frameHeight * 4) : rawNv12 ? Buffer.alloc(frameWidth * frameHeight * 3 / 2) : null;
if (rawBgra) {
  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < frameWidth; x += 1) {
      const offset = (y * frameWidth + x) * 4;
      rawFrame[offset] = x % 256;
      rawFrame[offset + 1] = y % 256;
      rawFrame[offset + 2] = (x + y) % 256;
      rawFrame[offset + 3] = 255;
    }
  }
} else if (rawNv12) {
  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < frameWidth; x += 1) {
      rawFrame[y * frameWidth + x] = (16 + ((x + y) % 220)) & 0xff;
    }
  }
  rawFrame.fill(128, frameWidth * frameHeight);
}
const rawBase64 = rawFrame ? rawFrame.toString("base64") : "";
const rawCodec = rawNv12 ? "raw-nv12" : "raw-bgra";
const rawPixelFormat = rawNv12 ? "nv12" : "bgra";
function emit(message, payload = null) {
  process.stdout.write(JSON.stringify(message) + "\\n");
  if (payload) {
    process.stdout.write(payload);
  }
}
emit({
  type: "hello",
  backend: "contract-test-wgc-helper",
  codec: rawFrame ? rawCodec : "jpeg",
  encoding: binaryProtocol ? "binary" : "base64",
  protocol: binaryProtocol ? "binary-frame-v1" : "json-lines-v1",
  pixelFormat: rawFrame ? rawPixelFormat : "jpeg",
  width: frameWidth,
  height: frameHeight,
  fps,
});
let frameId = 0;
setInterval(() => {
  frameId += 1;
  const payload = rawFrame || jpegFrame;
  const frame = {
    type: "frame",
    frameId,
    timestamp: new Date().toISOString(),
    width: frameWidth,
    height: frameHeight,
    sourceWidth: frameWidth,
    sourceHeight: frameHeight,
    codec: rawFrame ? rawCodec : "jpeg",
    encoding: binaryProtocol ? "binary" : "base64",
    pixelFormat: rawFrame ? rawPixelFormat : "jpeg",
    payloadBytes: payload.length,
  };
  if (binaryProtocol) {
    frame.binaryPayload = true;
    emit(frame, payload);
  } else {
    frame.dataBase64 = rawFrame ? rawBase64 : dataBase64;
    emit(frame);
  }
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
    if (args.h264Bridge) {
      env.LAN_DUAL_WINDOWS_WGC_H264_BRIDGE = "1";
      env.LAN_DUAL_WINDOWS_WGC_H264_SOURCE = args.h264Source;
    }
    const observerArgs = [
      observeScript,
      "--screenMode",
      "wgc",
      "--requireRealVideo",
      "false",
      "--durationMs",
      String(args.durationMs),
      "--width",
      String(args.width),
      "--height",
      String(args.height),
      "--minFrames",
      String(args.minFrames),
      "--minFps",
      "0",
      "--maxGapMs",
      String(Math.max(10000, args.durationMs + 6000)),
      "--resourceSample",
      "false",
      "--json",
    ];
    if (args.h264Bridge) {
      observerArgs.push(
        "--preferredVideoCodec",
        "h264",
        "--wgcH264Bridge",
        "true",
        "--wgcH264Source",
        args.h264Source,
        "--wgcRepeatLastFrame",
        "true",
        "--wgcRepeatLastFrameMode",
        "full",
      );
      if (args.h264Encoder) {
        observerArgs.push("--h264Encoder", args.h264Encoder);
      }
    }
    const child = spawn(process.execPath, observerArgs, {
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
    const session = report.session || {};
    const wgc = screen.wgc || {};
    const observation = report.observation || {};

    assert(report.ok === true, "observer report was not ok");
    assert(screen.requestedMode === "wgc", `expected requestedMode=wgc, got ${screen.requestedMode || "missing"}`);
    assert(wgc.requested === true, "expected screen.wgc.requested=true");
    assert(Array.isArray(observation.requestedScreenModes) && observation.requestedScreenModes.includes("wgc"), "expected observed frames to carry requestedScreenMode=wgc");
    assert(Number(observation.frameCount) >= args.minFrames, `expected at least ${args.minFrames} frame(s), got ${observation.frameCount || 0}`);

    if (args.mockHelper && args.h264Bridge) {
      assert(wgc.active === true, `expected mock helper WGC backend to be active; got ${JSON.stringify(wgc)}`);
      assert(wgc.h264BridgeEnabled === true, `expected WGC H.264 bridge to be enabled; got ${JSON.stringify(wgc)}`);
      assert(wgc.h264BridgeAvailable === true, `expected WGC H.264 bridge to be available; got ${JSON.stringify(wgc)}`);
      assert(wgc.h264BridgeSource === args.h264Source, `expected h264BridgeSource=${args.h264Source}, got ${wgc.h264BridgeSource || "missing"}`);
      const expectedHelperProtocol = args.h264Source === "jpeg" ? "json-lines-v1" : "binary-frame-v1";
      assert(wgc.helperProtocol === expectedHelperProtocol, `expected helperProtocol=${expectedHelperProtocol}, got ${wgc.helperProtocol || "missing"}`);
      assert(session.videoCodec === "h264", `expected negotiated videoCodec=h264, got ${session.videoCodec || "missing"}`);
      assert(session.videoEncoding === "annexb-base64", `expected annexb-base64, got ${session.videoEncoding || "missing"}`);
      const expectedPipeline = args.h264Source === "nv12"
        ? "windows-wgc-helper-nv12-ffmpeg-h264"
        : args.h264Source === "raw-bgra"
          ? "windows-wgc-helper-raw-bgra-ffmpeg-h264"
          : "windows-wgc-helper-ffmpeg-h264";
      assert(session.capturePipeline === expectedPipeline, `expected WGC H.264 bridge pipeline ${expectedPipeline}, got ${session.capturePipeline || "missing"}`);
      const observedPipelines = Array.isArray(observation.pipelines) ? observation.pipelines : [];
      const observedCodecs = Array.isArray(observation.codecs) ? observation.codecs : [];
      const observedExpectedPipeline = observedPipelines.includes(expectedPipeline) ||
        (args.h264Source === "nv12" && session.capturePipeline === expectedPipeline && observedCodecs.includes("h264"));
      assert(observedExpectedPipeline, `expected observed frames from ${expectedPipeline}, got ${observedPipelines.join(", ") || "none"}`);
      assert(observedCodecs.includes("h264"), "expected observed H.264 frames");
      if (args.h264Encoder) {
        assert(Array.isArray(observation.h264Encoders) && observation.h264Encoders.includes(args.h264Encoder), `expected h264Encoder=${args.h264Encoder}`);
      }
      console.log(`[OK] WGC H.264 bridge contract produced frames: active=${wgc.active}, source=${args.h264Source}, pipeline=${session.capturePipeline}, frames=${observation.frameCount}, encoder=${session.h264Encoder || "default"}`);
    } else if (args.mockHelper) {
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
