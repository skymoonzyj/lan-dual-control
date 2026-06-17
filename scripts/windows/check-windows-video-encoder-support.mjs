import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");

const defaults = {
  timeoutMs: 20000,
  ffmpeg: "",
  json: false,
  verbose: false,
  skipFfmpeg: false,
  skipWgc: false,
  skipWebCodecs: false,
  requireAnyH264: false,
  requireHardwareH264: false,
  requireWgc: false,
  requireWebCodecsH264: false,
  boardSummary: false,
};

const hardwareEncoderNames = new Set([
  "h264_nvenc",
  "h264_qsv",
  "h264_amf",
  "h264_mf",
  "h264_d3d12va",
  "h264_videotoolbox",
  "h264_vaapi",
  "h264_omx",
  "h264_v4l2m2m",
]);

const softwareEncoderNames = new Set([
  "libx264",
  "libx264rgb",
  "h264",
]);

function printHelp() {
  console.log(`Usage:
  node scripts/windows/check-windows-video-encoder-support.mjs [options]

Options:
  --ffmpeg <path>            FFmpeg executable path. Auto-detects LAN_DUAL_FFMPEG,
                             C:\\DevTools\\ffmpeg\\bin\\ffmpeg.exe, then PATH.
  --timeoutMs <ms>           Per probe timeout. Default: ${defaults.timeoutMs}
  --skipFfmpeg               Skip FFmpeg encoder list probe.
  --skipWgc                  Skip Windows Graphics Capture preflight.
  --skipWebCodecs            Skip browser WebCodecs H.264 decode probe.
  --requireAnyH264           Exit non-zero if no FFmpeg H.264 encoder is available.
  --requireHardwareH264      Exit non-zero if no FFmpeg hardware H.264 encoder is available.
  --requireWgc               Exit non-zero if Windows Graphics Capture preflight fails.
  --requireWebCodecsH264     Exit non-zero if browser WebCodecs H.264 support is unavailable.
  --json                     Print a single machine-readable JSON object.
  --boardSummary             Print a one-line secret-free Agent Link Board summary.
  --verbose                  Include child stderr tails in JSON and text output.
  --help, -h                 Show this help without probing.

Description:
  Read-only Windows video capability report for the next WGC/H.264 work.
  It does not start the remote-control host, does not capture the screen, and
  does not change system settings. It summarizes FFmpeg software/hardware H.264
  encoders, WGC readiness, browser WebCodecs H.264 decode support, and a safe
  recommendation for the next video pipeline step.

Examples:
  node scripts/windows/check-windows-video-encoder-support.mjs
  node scripts/windows/check-windows-video-encoder-support.mjs --json
  node scripts/windows/check-windows-video-encoder-support.mjs --boardSummary
  node scripts/windows/check-windows-video-encoder-support.mjs --requireAnyH264 --requireWgc
`);
}

function parseArgs(argv) {
  const args = { ...defaults, help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
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
    if (token === "--verbose") {
      args.verbose = true;
      continue;
    }
    if (token === "--skipFfmpeg") {
      args.skipFfmpeg = true;
      continue;
    }
    if (token === "--skipWgc") {
      args.skipWgc = true;
      continue;
    }
    if (token === "--skipWebCodecs") {
      args.skipWebCodecs = true;
      continue;
    }
    if (token === "--requireAnyH264") {
      args.requireAnyH264 = true;
      continue;
    }
    if (token === "--requireHardwareH264") {
      args.requireHardwareH264 = true;
      continue;
    }
    if (token === "--requireWgc") {
      args.requireWgc = true;
      continue;
    }
    if (token === "--requireWebCodecsH264") {
      args.requireWebCodecsH264 = true;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(3000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    if (token === "--ffmpeg" && next && !next.startsWith("--")) {
      args.ffmpeg = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function print(kind, text, args) {
  if (!args.json && !args.boardSummary) {
    console.log(`[${kind}] ${text}`);
  }
}

function tail(text, maxLines = 12) {
  return String(text || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-maxLines)
    .join("\n");
}

function runProcess(command, commandArgs, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn(command, commandArgs, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const startedAt = performance.now();
    const timer = setTimeout(() => {
      child.kill();
      resolveRun({
        ok: false,
        exitCode: null,
        timedOut: true,
        durationMs: Math.round(performance.now() - startedAt),
        stdout,
        stderr,
        error: `timed out after ${timeoutMs} ms`,
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
        exitCode: null,
        timedOut: false,
        durationMs: Math.round(performance.now() - startedAt),
        stdout,
        stderr,
        error: error.message,
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({
        ok: exitCode === 0,
        exitCode,
        timedOut: false,
        durationMs: Math.round(performance.now() - startedAt),
        stdout,
        stderr,
        error: exitCode === 0 ? "" : (stderr.trim() || `exit ${exitCode}`),
      });
    });
  });
}

function resolveFfmpegCommand(explicitValue) {
  const candidates = [
    explicitValue,
    process.env.LAN_DUAL_FFMPEG,
    "C:\\DevTools\\ffmpeg\\bin\\ffmpeg.exe",
    "ffmpeg.exe",
    "ffmpeg",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (/^[a-zA-Z]:[\\/]/.test(candidate) || candidate.startsWith("\\\\")) {
      if (existsSync(candidate)) return candidate;
    } else {
      return candidate;
    }
  }
  return "ffmpeg";
}

async function probeFfmpeg(args) {
  if (args.skipFfmpeg) {
    return { skipped: true, available: false };
  }

  const command = resolveFfmpegCommand(args.ffmpeg);
  const versionRun = await runProcess(command, ["-version"], args.timeoutMs);
  if (!versionRun.ok) {
    return {
      skipped: false,
      available: false,
      command,
      error: versionRun.error,
      stderrTail: args.verbose ? tail(versionRun.stderr) : undefined,
    };
  }

  const encodersRun = await runProcess(command, ["-hide_banner", "-encoders"], args.timeoutMs);
  if (!encodersRun.ok) {
    return {
      skipped: false,
      available: true,
      command,
      version: parseFfmpegVersion(versionRun.stdout),
      error: encodersRun.error,
      stderrTail: args.verbose ? tail(encodersRun.stderr) : undefined,
    };
  }

  const encoders = parseEncoders(encodersRun.stdout);
  const h264Encoders = encoders.filter((encoder) => isH264Encoder(encoder.name, encoder.description));
  const hardware = h264Encoders.filter((encoder) => hardwareEncoderNames.has(encoder.name));
  const software = h264Encoders.filter((encoder) => softwareEncoderNames.has(encoder.name) || !hardwareEncoderNames.has(encoder.name));
  const preferredHardware = choosePreferredHardwareEncoder(hardware);
  const preferredSoftware = choosePreferredSoftwareEncoder(software);

  return {
    skipped: false,
    available: true,
    command,
    version: parseFfmpegVersion(versionRun.stdout),
    h264: {
      available: h264Encoders.length > 0,
      hardwareAvailable: hardware.length > 0,
      softwareAvailable: software.length > 0,
      preferredHardware,
      preferredSoftware,
      hardware,
      software,
      all: h264Encoders,
    },
    stderrTail: args.verbose ? tail(encodersRun.stderr) : undefined,
  };
}

function parseFfmpegVersion(output) {
  const firstLine = String(output || "").split(/\r?\n/).find(Boolean) || "";
  const match = firstLine.match(/ffmpeg version\s+([^\s]+)/i);
  return {
    line: firstLine,
    version: match?.[1] || "",
  };
}

function parseEncoders(output) {
  const encoders = [];
  for (const line of String(output || "").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z.]{6})\s+(\S+)\s+(.+)$/);
    if (!match) continue;
    encoders.push({
      flags: match[1],
      name: match[2],
      description: match[3].trim(),
    });
  }
  return encoders;
}

function isH264Encoder(name, description) {
  const normalizedName = String(name || "").toLowerCase();
  const normalizedDescription = String(description || "").toLowerCase();
  return normalizedName.includes("h264") ||
    normalizedName.includes("x264") ||
    normalizedDescription.includes("h.264") ||
    normalizedDescription.includes("avc");
}

function choosePreferredHardwareEncoder(encoders) {
  const priority = ["h264_nvenc", "h264_qsv", "h264_amf", "h264_mf", "h264_d3d12va", "h264_vaapi", "h264_videotoolbox"];
  return priority.map((name) => encoders.find((encoder) => encoder.name === name)).find(Boolean) || encoders[0] || null;
}

function choosePreferredSoftwareEncoder(encoders) {
  const priority = ["libx264", "libx264rgb", "h264"];
  return priority.map((name) => encoders.find((encoder) => encoder.name === name)).find(Boolean) || encoders[0] || null;
}

async function runJsonScript(scriptName, scriptArgs, timeoutMs) {
  const run = await runProcess(process.execPath, [resolve(scriptDir, scriptName), ...scriptArgs], timeoutMs);
  if (!run.ok) {
    return {
      ok: false,
      error: run.error,
      exitCode: run.exitCode,
      timedOut: run.timedOut,
      stdoutTail: tail(run.stdout),
      stderrTail: tail(run.stderr),
    };
  }
  try {
    return {
      ok: true,
      durationMs: run.durationMs,
      data: JSON.parse(run.stdout.trim().replace(/^\uFEFF/, "")),
    };
  } catch (error) {
    return {
      ok: false,
      error: `JSON parse failed: ${error.message}`,
      stdoutTail: tail(run.stdout),
      stderrTail: tail(run.stderr),
    };
  }
}

async function probeWgc(args) {
  if (args.skipWgc) {
    return { skipped: true, ok: true };
  }
  const result = await runJsonScript("check-windows-wgc-support.mjs", ["--json", "--timeoutMs", String(args.timeoutMs)], args.timeoutMs + 3000);
  if (!result.ok) {
    return { skipped: false, ok: false, error: result.error, stdoutTail: result.stdoutTail, stderrTail: args.verbose ? result.stderrTail : undefined };
  }
  const summary = result.data?.summary || {};
  return {
    skipped: false,
    ok: Boolean(result.data?.ok),
    supported: Boolean(summary.supported),
    summary,
  };
}

async function probeWebCodecs(args) {
  if (args.skipWebCodecs) {
    return { skipped: true, ok: true };
  }
  const result = await runJsonScript("check-webcodecs-h264-support.mjs", ["--json", "--timeoutMs", String(args.timeoutMs)], args.timeoutMs + 5000);
  if (!result.ok) {
    return { skipped: false, ok: false, error: result.error, stdoutTail: result.stdoutTail, stderrTail: args.verbose ? result.stderrTail : undefined };
  }
  const data = result.data || {};
  return {
    skipped: false,
    ok: Boolean(data.ok),
    available: Boolean(data.available),
    anySupported: Boolean(data.anySupported),
    preferred: data.preferred || null,
    supportedCodecs: Array.isArray(data.supportedCodecs) ? data.supportedCodecs : [],
    userAgent: data.userAgent || "",
    failures: Array.isArray(data.failures) ? data.failures : [],
  };
}

function buildRecommendation(ffmpeg, wgc, webCodecs) {
  const steps = [];
  const ffmpegH264 = ffmpeg?.h264 || {};
  const hardware = ffmpegH264.preferredHardware;
  const software = ffmpegH264.preferredSoftware;
  const wgcSupported = Boolean(wgc?.supported);
  const browserCanDecode = Boolean(webCodecs?.anySupported);

  let preferredPath = "not-ready";
  if (wgcSupported && hardware) {
    preferredPath = `prototype-wgc-hardware-h264-${hardware.name}`;
    steps.push(`Prototype WGC capture into a hardware H.264 encoder candidate: ${hardware.name}.`);
  } else if (wgcSupported && software) {
    preferredPath = `prototype-wgc-software-h264-${software.name}`;
    steps.push(`Prototype WGC capture into ${software.name}; keep watching CPU because this is software encoding.`);
  } else if (ffmpegH264.available) {
    preferredPath = "continue-ffmpeg-h264-transition";
    steps.push("Keep the current ffmpeg-h264 transition path while adding a native or FFmpeg hardware encoder probe.");
  } else {
    steps.push("Install or repair FFmpeg H.264 encoding support before expanding Windows H.264 paths.");
  }

  if (!wgcSupported) {
    steps.push("Fix WGC preflight blockers before replacing gdigrab/System.Drawing capture.");
  }
  if (!browserCanDecode) {
    steps.push("Keep MJPEG/JPEG fallback enabled because this browser did not confirm WebCodecs H.264 decode support.");
  }
  if (browserCanDecode) {
    steps.push("Keep binary-h264 and WebCodecs matrix tests as the guardrail before changing the encoder path.");
  }

  return {
    preferredPath,
    nextSteps: steps,
  };
}

function collectFailures(args, ffmpeg, wgc, webCodecs) {
  const failures = [];
  const warnings = [];
  const h264 = ffmpeg?.h264 || {};

  if (!args.skipFfmpeg && !ffmpeg?.available) {
    warnings.push(`FFmpeg unavailable: ${ffmpeg?.error || "unknown error"}`);
  }
  if (args.requireAnyH264 && !h264.available) {
    failures.push("no FFmpeg H.264 encoder is available");
  }
  if (args.requireHardwareH264 && !h264.hardwareAvailable) {
    failures.push("no FFmpeg hardware H.264 encoder is available");
  }
  if (args.requireWgc && !wgc?.supported) {
    failures.push(`WGC preflight failed: ${(wgc?.summary?.blockers || []).join("; ") || wgc?.error || "unknown reason"}`);
  }
  if (args.requireWebCodecsH264 && !webCodecs?.anySupported) {
    failures.push(`WebCodecs H.264 unavailable: ${(webCodecs?.failures || []).join("; ") || webCodecs?.error || "unknown reason"}`);
  }
  if (wgc && !wgc.skipped && !wgc.supported) {
    warnings.push(`WGC not ready: ${(wgc.summary?.blockers || []).join("; ") || wgc.error || "unknown reason"}`);
  }
  if (webCodecs && !webCodecs.skipped && !webCodecs.anySupported) {
    warnings.push(`WebCodecs H.264 not confirmed: ${(webCodecs.failures || []).join("; ") || webCodecs.error || "unknown reason"}`);
  }
  if (h264.available && !h264.hardwareAvailable) {
    warnings.push("FFmpeg H.264 is available, but no FFmpeg hardware H.264 encoder was found.");
  }

  return { failures, warnings };
}

function summarizeForText(result, args) {
  const ffmpeg = result.ffmpeg;
  const h264 = ffmpeg?.h264 || {};
  if (ffmpeg?.skipped) {
    print("INFO", "FFmpeg encoder probe skipped.", args);
  } else if (!ffmpeg?.available) {
    print("WARN", `FFmpeg unavailable: ${ffmpeg?.error || "unknown error"}`, args);
  } else {
    print("OK", `FFmpeg: ${ffmpeg.version?.line || ffmpeg.command}`, args);
    const hardware = (h264.hardware || []).map((encoder) => encoder.name).join(", ") || "none";
    const software = (h264.software || []).map((encoder) => encoder.name).join(", ") || "none";
    print(h264.available ? "OK" : "WARN", `H.264 encoders: software=${software}; hardware=${hardware}`, args);
  }

  if (result.wgc?.skipped) {
    print("INFO", "WGC preflight skipped.", args);
  } else if (result.wgc?.supported) {
    print("OK", `WGC preflight: supported, OS build ${result.wgc.summary?.osBuild || "unknown"}, hardware GPUs ${result.wgc.summary?.hardwareGpuCount ?? "unknown"}`, args);
  } else {
    print("WARN", `WGC preflight: ${result.wgc?.error || (result.wgc?.summary?.blockers || []).join("; ") || "not supported"}`, args);
  }

  if (result.webCodecs?.skipped) {
    print("INFO", "WebCodecs H.264 probe skipped.", args);
  } else if (result.webCodecs?.anySupported) {
    const preferred = result.webCodecs.preferred;
    print("OK", `WebCodecs H.264: supported (${preferred?.codec || "unknown"} / ${preferred?.format || "unknown"})`, args);
  } else {
    print("WARN", `WebCodecs H.264: ${result.webCodecs?.error || (result.webCodecs?.failures || []).join("; ") || "not confirmed"}`, args);
  }

  print(result.ok ? "OK" : "ERROR", `Recommendation: ${result.recommendation.preferredPath}`, args);
  for (const step of result.recommendation.nextSteps) {
    print("INFO", step, args);
  }
  for (const warning of result.warnings) {
    print("WARN", warning, args);
  }
  for (const failure of result.failures) {
    print("ERROR", failure, args);
  }
}

function compactToken(value) {
  return String(value || "")
    .replace(/[\r\n;]+/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

function formatFfmpegBoardSummary(ffmpeg) {
  if (ffmpeg?.skipped) return "ffmpeg=skipped";
  if (!ffmpeg?.available) return `ffmpeg=unavailable${ffmpeg?.error ? `(${compactToken(ffmpeg.error)})` : ""}`;
  const h264 = ffmpeg.h264 || {};
  const hardware = h264.preferredHardware?.name || "none";
  const software = h264.preferredSoftware?.name || "none";
  return `ffmpegH264=${h264.available ? "ok" : "missing"}; hardware=${hardware}; software=${software}`;
}

function formatWgcBoardSummary(wgc) {
  if (wgc?.skipped) return "wgc=skipped";
  if (wgc?.supported) return "wgc=ok";
  const blocker = compactToken((wgc?.summary?.blockers || [])[0] || wgc?.error || "not-ready");
  return `wgc=blocked(${blocker})`;
}

function formatWebCodecsBoardSummary(webCodecs) {
  if (webCodecs?.skipped) return "webcodecs=skipped";
  if (webCodecs?.anySupported) {
    const preferred = webCodecs.preferred || {};
    const codec = preferred.codec || webCodecs.supportedCodecs?.[0] || "h264";
    const format = preferred.format || "unknown";
    return `webcodecs=ok(${codec}/${format})`;
  }
  const failure = compactToken((webCodecs?.failures || [])[0] || webCodecs?.error || "not-confirmed");
  return `webcodecs=unconfirmed(${failure})`;
}

function makeBoardSummary(result) {
  const parts = [
    `Windows video encoder support: ${result.ok ? "ok" : "failed"}`,
    formatFfmpegBoardSummary(result.ffmpeg),
    formatWgcBoardSummary(result.wgc),
    formatWebCodecsBoardSummary(result.webCodecs),
    `recommendation=${compactToken(result.recommendation?.preferredPath || "unknown")}`,
  ];
  if (result.warnings?.length) {
    parts.push(`warnings=${result.warnings.length}`);
  }
  if (result.failures?.length) {
    parts.push(`failures=${result.failures.length}`);
  }
  parts.push("read-only", "no-password", "no-host", "no-input/inject");
  return parts.filter(Boolean).join("; ");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const [ffmpeg, wgc, webCodecs] = await Promise.all([
    probeFfmpeg(args),
    probeWgc(args),
    probeWebCodecs(args),
  ]);
  const recommendation = buildRecommendation(ffmpeg, wgc, webCodecs);
  const { failures, warnings } = collectFailures(args, ffmpeg, wgc, webCodecs);
  const result = {
    ok: failures.length === 0,
    args: {
      timeoutMs: args.timeoutMs,
      ffmpeg: args.ffmpeg || "",
      skipped: {
        ffmpeg: args.skipFfmpeg,
        wgc: args.skipWgc,
        webCodecs: args.skipWebCodecs,
      },
      required: {
        anyH264: args.requireAnyH264,
        hardwareH264: args.requireHardwareH264,
        wgc: args.requireWgc,
        webCodecsH264: args.requireWebCodecsH264,
      },
    },
    ffmpeg,
    wgc,
    webCodecs,
    recommendation,
    warnings,
    failures,
  };
  result.boardSummary = makeBoardSummary(result);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (args.boardSummary) {
    console.log(result.boardSummary);
  } else {
    summarizeForText(result, args);
  }

  process.exitCode = result.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
