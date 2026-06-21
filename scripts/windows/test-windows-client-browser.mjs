import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  host: "127.0.0.1",
  port: "43770",
  hostProvided: false,
  discover: false,
  discoverNoLocalSubnets: false,
  discoverTimeoutMs: 1200,
  password: process.env.LAN_DUAL_PASSWORD || "demo-password",
  passwordProvided: false,
  promptPassword: false,
  requirePassword: false,
  clientPort: 5197,
  debugPort: 9337,
  timeoutMs: 30000,
  progressIntervalMs: 10000,
  requireVideoSurface: true,
  requireH264: false,
  requireAudioStability: false,
  audioStabilityMinFrames: 12,
  audioStabilityMaxQueueMs: 100,
  audioStabilityMaxGapMs: 120,
  injectPcmAudio: false,
  diagnosticsOnly: false,
  expectDiscoveryRuntimeBuildId: "",
  headless: true,
  boardSummary: false,
  onlyAudioBufferGuards: false,
  onlyH264LatencyQueueGuard: false,
};

let activeOutputArgs = null;
let lastBoardSummary = "";
let activeSummary = null;

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-client-browser.mjs [options]

Runs the Windows control client browser self-test against a Mac host. Without
--diagnosticsOnly it connects to the configured host and validates the video
surface, diagnostics, input guards, and optional audio injection.

Options:
  --host <host>                         Mac host address. Default: ${defaults.host}
  --port <port>                         Mac host port. Default: ${defaults.port}
  --discover                            Find the best Mac host with discover-lan-hosts before testing.
  --discoverNoLocalSubnets              With --discover, only probe 127.0.0.1 and explicit --host targets.
  --discoverTimeoutMs <ms>              Per-host discovery timeout. Default: ${defaults.discoverTimeoutMs}
  --password <password>                 Probe password. Default: LAN_DUAL_PASSWORD or demo-password.
  --promptPassword                      Prompt for the probe password without echoing it.
  --requirePassword                     Refuse empty/demo-password credentials before connecting.
  --clientPort <port>                   Local Windows client web port. Default: ${defaults.clientPort}
  --debugPort <port>                    Browser remote debugging port. Default: ${defaults.debugPort}
  --timeoutMs <ms>                      Per-step timeout. Default: ${defaults.timeoutMs}
  --progressIntervalMs <ms>             Print connection/video/audio wait progress every N ms; 0 disables. Default: ${defaults.progressIntervalMs}
  --headed                              Run browser headed instead of headless.
  --diagnosticsOnly                     Only run local UI diagnostics; do not connect to a Mac host.
  --onlyAudioBufferGuards               Only run the audio queue/buffer guard browser check.
  --onlyH264LatencyQueueGuard           Only run the H.264 latency/keyframe queue browser check.
  --boardSummary                        Print one secret-free Agent Link Board summary line on stdout; progress goes to stderr.
  --noRequireVideoSurface               Do not require a visible decoded video surface.
  --requireH264                         Require H.264/WebCodecs decoded video.
  --requireAudioStability               Wait for enough low-latency PCM audio evidence before passing connection.
  --noRequireAudioStability             Do not wait for PCM audio stability evidence.
  --audioStabilityMinFrames <n>         Minimum received/played PCM frames for audio stability. Default: ${defaults.audioStabilityMinFrames}
  --audioStabilityMaxQueueMs <ms>       Maximum local PCM queue for audio stability. Default: ${defaults.audioStabilityMaxQueueMs}
  --audioStabilityMaxGapMs <ms>         Maximum local PCM arrival gap before reporting stutter. Default: ${defaults.audioStabilityMaxGapMs}
  --injectPcmAudio                      Inject a synthetic PCM frame into the page and require playback state.
  --expectDiscoveryRuntimeBuildId <id>  Require /discovery runtime.buildId before connecting.

Examples:
  node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly
  node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary
  node scripts/windows/test-windows-client-browser.mjs --discover --diagnosticsOnly --expectDiscoveryRuntimeBuildId <build-id>
  node scripts/windows/test-windows-client-browser.mjs --discover --diagnosticsOnly --boardSummary --expectDiscoveryRuntimeBuildId <build-id>
  node scripts/windows/test-windows-client-browser.mjs --host 192.168.1.20 --port 43770 --promptPassword --requirePassword --requireH264
  node scripts/windows/test-windows-client-browser.mjs --discover --promptPassword --requirePassword --requireH264
  node scripts/windows/test-windows-client-browser.mjs --host 127.0.0.1 --port 43770 --injectPcmAudio
`);
}

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];

    if (key === "headed") {
      args.headless = false;
      continue;
    }
    if (key === "discover") {
      args.discover = true;
      continue;
    }
    if (key === "discoverNoLocalSubnets") {
      args.discoverNoLocalSubnets = true;
      continue;
    }
    if (key === "noRequireVideoSurface") {
      args.requireVideoSurface = false;
      continue;
    }
    if (key === "requireH264") {
      args.requireH264 = true;
      args.requireVideoSurface = true;
      continue;
    }
    if (key === "requireAudioStability") {
      args.requireAudioStability = true;
      args.audioStabilityExplicit = true;
      continue;
    }
    if (key === "noRequireAudioStability") {
      args.requireAudioStability = false;
      args.audioStabilityExplicit = true;
      continue;
    }
    if (key === "injectPcmAudio") {
      args.injectPcmAudio = true;
      continue;
    }
    if (key === "diagnosticsOnly") {
      args.diagnosticsOnly = true;
      args.requireVideoSurface = false;
      continue;
    }
    if (key === "boardSummary") {
      args.boardSummary = true;
      continue;
    }
    if (key === "onlyAudioBufferGuards") {
      args.onlyAudioBufferGuards = true;
      args.diagnosticsOnly = true;
      args.requireVideoSurface = false;
      continue;
    }
    if (key === "onlyH264LatencyQueueGuard") {
      args.onlyH264LatencyQueueGuard = true;
      args.diagnosticsOnly = true;
      args.requireVideoSurface = false;
      continue;
    }
    if (key === "promptPassword") {
      args.promptPassword = true;
      continue;
    }
    if (key === "requirePassword") {
      args.requirePassword = true;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(args, key) && next && !next.startsWith("--")) {
      if (key === "password") {
        args.passwordProvided = true;
      }
      if (key === "host") {
        args.hostProvided = true;
      }
      args[key] = next;
      index += 1;
    }
  }

  args.clientPort = Number(args.clientPort);
  args.debugPort = Number(args.debugPort);
  args.timeoutMs = Number(args.timeoutMs);
  args.audioStabilityMinFrames = Math.max(0, Number(args.audioStabilityMinFrames) || defaults.audioStabilityMinFrames);
  args.audioStabilityMaxQueueMs = Math.max(0, Number(args.audioStabilityMaxQueueMs) || defaults.audioStabilityMaxQueueMs);
  args.audioStabilityMaxGapMs = Math.max(0, Number(args.audioStabilityMaxGapMs) || defaults.audioStabilityMaxGapMs);
  if (args.boardSummary && !args.diagnosticsOnly && !args.audioStabilityExplicit) {
    args.requireAudioStability = true;
  }
  const progressIntervalMs = Number(args.progressIntervalMs);
  args.progressIntervalMs = Number.isFinite(progressIntervalMs)
    ? Math.max(0, progressIntervalMs)
    : defaults.progressIntervalMs;
  args.discoverTimeoutMs = Math.max(250, Number(args.discoverTimeoutMs) || defaults.discoverTimeoutMs);
  return args;
}

async function preparePassword(args) {
  if (args.diagnosticsOnly) return;
  if (args.promptPassword && args.passwordProvided) {
    throw new Error("--promptPassword cannot be combined with --password.");
  }
  if (args.promptPassword && process.env.LAN_DUAL_PASSWORD) {
    throw new Error("--promptPassword refuses to override an existing LAN_DUAL_PASSWORD. Unset it or omit --promptPassword.");
  }
  if (args.promptPassword) {
    print("INFO", "等待隐藏密码输入：请直接在当前终端窗口输入 Mac 端当前临时密码；输入时不会显示字符，按 Enter 继续；这是正常等待，不是卡住；不要输到网页或通讯板。");
    args.password = await promptHidden("当前终端输入 Mac 临时密码（输入不显示，回车继续）: ");
    if (!args.password) {
      throw new Error("Password cannot be empty when --promptPassword is used.");
    }
  }
  const effectivePassword = String(args.password || "");
  if (args.requirePassword && !effectivePassword) {
    throw new Error("LAN_DUAL_PASSWORD is required. Set it in the environment, pass --password, or use --promptPassword.");
  }
  if (args.requirePassword && effectivePassword === "demo-password") {
    throw new Error("Refusing to use demo-password when --requirePassword is used.");
  }
}

function promptHidden(label) {
  if (!process.stdin.isTTY) {
    return Promise.reject(new Error("--promptPassword requires an interactive terminal."));
  }

  return new Promise((resolvePrompt, rejectPrompt) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    const previousRawMode = stdin.isRaw;
    let value = "";
    let settled = false;

    const cleanup = () => {
      stdin.off("data", onData);
      if (typeof stdin.setRawMode === "function") {
        stdin.setRawMode(Boolean(previousRawMode));
      }
      stdin.pause();
    };
    const finish = (result, error = null) => {
      if (settled) return;
      settled = true;
      cleanup();
      stdout.write("\n");
      if (error) {
        rejectPrompt(error);
      } else {
        resolvePrompt(result);
      }
    };
    const onData = (chunk) => {
      const text = String(chunk);
      for (const char of text) {
        const code = char.charCodeAt(0);
        if (char === "\r" || char === "\n") {
          finish(value);
          return;
        }
        if (code === 3) {
          finish("", new Error("Password prompt cancelled."));
          return;
        }
        if (code === 8 || code === 127) {
          value = value.slice(0, -1);
          continue;
        }
        if (code >= 32) {
          value += char;
        }
      }
    };

    stdout.write(label);
    stdin.resume();
    stdin.setEncoding("utf8");
    if (typeof stdin.setRawMode === "function") {
      stdin.setRawMode(true);
    }
    stdin.on("data", onData);
  });
}

function print(kind, text) {
  const line = `[${kind}] ${text}`;
  if (activeOutputArgs?.boardSummary) {
    console.error(line);
  } else {
    console.log(line);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSeconds(ms) {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

function progressEveryText(args) {
  return args.progressIntervalMs > 0 ? formatSeconds(args.progressIntervalMs) : "off";
}

function compactProgressText(value, maxLength = 100) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function compactBoardSummaryText(value, maxLength = 180) {
  return compactProgressText(value, maxLength)
    .replace(/[;|]/g, ",")
    .replace(/\b(LAN_DUAL_PASSWORD|password|passwd|pwd|token|secret)\s*[:=]\s*\S+/gi, "$1=<hidden>")
    .replace(/(--(?:password|token|secret))\s+\S+/gi, "$1 <hidden>");
}

function stripLiveExportPrefix(value) {
  return String(value ?? "")
    .trim()
    .replace(/^-\s*现场(?:视频|声音)(?:统计)?：\s*/, "")
    .replace(/^开启\s*·\s*/, "")
    .trim();
}

function makeW2W3RetestSummary(summary) {
  const parts = [];
  const video = stripLiveExportPrefix(summary.liveVideo || "");
  const audio = stripLiveExportPrefix(summary.liveAudio || "");
  const h264 = String(summary.h264 || "").trim();
  if (video) parts.push(`video=${compactBoardSummaryText(video, 180)}`);
  if (audio) parts.push(`audio=${compactBoardSummaryText(audio, 180)}`);
  if (h264) parts.push(`h264=${compactBoardSummaryText(h264, 260)}`);
  if (summary.h264Errors !== "") parts.push(`h264Errors=${summary.h264Errors}`);
  return parts.length ? `W2W3Retest=${parts.join(", ")}` : "";
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveInteger(value) {
  return Math.max(0, Math.round(finiteNumber(value, 0)));
}

function getAudioStabilityStatus(value = {}, args = {}) {
  if (!args.requireAudioStability) {
    return { ok: true, reason: "audio-stability-disabled" };
  }

  const minFrames = Math.max(0, positiveInteger(args.audioStabilityMinFrames || defaults.audioStabilityMinFrames));
  const maxQueueMs = Math.max(0, positiveInteger(args.audioStabilityMaxQueueMs || defaults.audioStabilityMaxQueueMs));
  const maxGapMs = Math.max(0, positiveInteger(args.audioStabilityMaxGapMs || defaults.audioStabilityMaxGapMs));
  const frames = positiveInteger(value.audioFrames);
  const played = positiveInteger(value.audioPlayedFrames);
  const dropped = positiveInteger(value.audioDroppedFrames);
  const queueMs = positiveInteger(value.audioQueueMs);
  const observedMaxGapMs = positiveInteger(value.audioMaxGapMs);
  const stutterCount = positiveInteger(value.audioStutterCount);
  const minPlayedFrames = Math.max(1, Math.min(minFrames, Math.floor(minFrames * 0.75)));
  const reasons = [];

  if (minFrames > 0 && frames < minFrames) reasons.push(`audio-frames ${frames}/${minFrames}`);
  if (minFrames > 0 && played < minPlayedFrames) reasons.push(`audio-played ${played}/${minPlayedFrames}`);
  if (dropped > 0) reasons.push(`audio-dropped ${dropped}`);
  if (maxQueueMs > 0 && queueMs > maxQueueMs) reasons.push(`audio-queue ${queueMs}/${maxQueueMs}ms`);
  if (maxGapMs > 0 && observedMaxGapMs > maxGapMs) reasons.push(`audio-gap ${observedMaxGapMs}/${maxGapMs}ms`);
  if (stutterCount > 0) reasons.push(`audio-stutter ${stutterCount}`);
  if (played <= 0 && /等待/.test(String(value.audio || ""))) reasons.push("audio-waiting-playback");

  return {
    ok: reasons.length === 0,
    reason: reasons.length ? reasons.join("; ") : "audio-stable",
    frames,
    played,
    dropped,
    queueMs,
    maxGapMs: observedMaxGapMs,
    stutterCount,
  };
}

function hasOwnValue(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key) && object[key] !== undefined && object[key] !== null;
}

function booleanText(value) {
  return value ? "true" : "false";
}

function h264CanvasVisible(value = {}) {
  if (hasOwnValue(value, "canvas")) {
    return String(value.canvas).toLowerCase() === "true" || value.canvas === true;
  }
  return Boolean(
    value.canvasVisible &&
    positiveInteger(value.canvasWidth) > 0 &&
    positiveInteger(value.canvasHeight) > 0
  );
}

function h264ImageVisible(value = {}) {
  if (hasOwnValue(value, "image")) {
    return String(value.image).toLowerCase() === "true" || value.image === true;
  }
  return Boolean(value.imageVisible && value.imageHasSource);
}

function makeH264RetestSummary(value = {}) {
  const parts = [];
  const status = String(value.h264DecoderStatus ?? value.status ?? "").trim();
  const decoded = positiveInteger(value.h264DecodedFrames ?? value.decoded);
  const skippedDelta = positiveInteger(value.h264SkippedDeltaFrames ?? value.skippedDelta);
  const needsKeyFrame = value.h264DecoderNeedsKeyFrame ?? value.needsKeyFrame;
  const queue = positiveInteger(value.h264DecoderQueue ?? value.queueLength ?? value.queue);
  const queueMs = positiveInteger(value.h264DecoderQueueMs ?? value.queueMs);
  const staleDrops = positiveInteger(value.h264DroppedStaleFrames ?? value.droppedStale ?? value.staleDrops);
  const reason = String(value.h264LastDropReason ?? value.lastDropReason ?? value.reason ?? "").trim();
  const recovery = positiveInteger(value.h264FallbackRecoveryCount ?? value.fallbackRecoveryCount);
  const pause = positiveInteger(value.h264FallbackRecoveryPauseCount ?? value.fallbackRecoveryPauseCount);
  const received = positiveInteger(value.h264ReceivedFrames ?? value.received ?? value.recv);
  const keyFrames = positiveInteger(value.h264ReceivedKeyFrames ?? value.keyFrames ?? value.key);
  const sps = positiveInteger(value.h264ReceivedSps ?? value.sps);
  const pps = positiveInteger(value.h264ReceivedPps ?? value.pps);
  const idr = positiveInteger(value.h264ReceivedIdr ?? value.idr);
  const lastNal = String(value.h264LastNalTypes ?? value.lastNal ?? "").trim();
  const hasCanvasSignal = ["canvas", "canvasVisible", "canvasWidth", "canvasHeight"].some((key) => hasOwnValue(value, key));
  const hasImageSignal = ["image", "imageVisible", "imageHasSource"].some((key) => hasOwnValue(value, key));

  if (status) parts.push(`status=${status}`);
  if (status || decoded > 0) parts.push(`decoded=${decoded}`);
  if (hasCanvasSignal) parts.push(`canvas=${booleanText(h264CanvasVisible(value))}`);
  if (hasImageSignal) parts.push(`image=${booleanText(h264ImageVisible(value))}`);
  if (skippedDelta > 0) parts.push(`skippedDelta=${skippedDelta}`);
  if (needsKeyFrame === true) parts.push("needsKeyframe=yes");
  if (queue > 0) parts.push(`queue=${queue}`);
  if (queueMs > 0) parts.push(`queueMs=${queueMs}`);
  if (staleDrops > 0) parts.push(`staleDrops=${staleDrops}`);
  if (reason) parts.push(`reason=${reason}`);
  if (received > 0) parts.push(`recv=${received}`);
  if (keyFrames > 0) parts.push(`key=${keyFrames}`);
  if (sps > 0) parts.push(`sps=${sps}`);
  if (pps > 0) parts.push(`pps=${pps}`);
  if (idr > 0) parts.push(`idr=${idr}`);
  if (lastNal) parts.push(`lastNal=${lastNal}`);
  if (recovery > 0) parts.push(`recovery=${recovery}`);
  if (pause > 0) parts.push(`pause=${pause}`);
  return parts.join(" ");
}

function makeBoardSummary(summary) {
  const checks = Array.from(summary.checks || []);
  const checkText = checks.length ? checks.join(",") : "none";
  const discovery = summary.discoveryTarget
    ? `${summary.discoveryTarget}${summary.discoveryRuntimeBuild ? `/build=${summary.discoveryRuntimeBuild}` : ""}`
    : "skipped";
  const details = [];
  if (summary.remote) details.push(`remote=${compactBoardSummaryText(summary.remote, 120)}`);
  if (summary.discoveryDiagnostics) {
    details.push(`discoveryDiag=${compactBoardSummaryText(summary.discoveryDiagnostics, 120)}`);
  }
  if (summary.uiDiagnostics) details.push(`uiDiag=${compactBoardSummaryText(summary.uiDiagnostics, 140)}`);
  if (!summary.discoveryDiagnostics && !summary.uiDiagnostics && summary.diagnostics) {
    details.push(`diag=${compactBoardSummaryText(summary.diagnostics, 140)}`);
  }
  const w2w3Retest = makeW2W3RetestSummary(summary);
  if (w2w3Retest) details.push(w2w3Retest);
  if (summary.fps) details.push(`fps=${compactBoardSummaryText(summary.fps, 80)}`);
  if (summary.audio) details.push(`audio=${compactBoardSummaryText(summary.audio, 80)}`);
  if (summary.surface) details.push(`surface=${summary.surface}`);
  if (summary.h264Errors !== "") details.push(`h264Errors=${summary.h264Errors}`);
  if (summary.error) details.push(`error=${compactBoardSummaryText(summary.error, 140)}`);
  const detailText = details.length ? ` ${details.join("; ")}.` : "";
  return [
    `Windows client diagnostics: ${summary.status}; mode=${summary.mode}; target=${summary.target}; discovery=${discovery}; checks=${checkText}.`,
    detailText.trim(),
    "No password was printed or sent to Agent Link Board; no input/inject was performed.",
  ].filter(Boolean).join(" ");
}

function verifyW2W3RetestH264Summary() {
  const h264 = makeH264RetestSummary({
    status: "waiting-keyframe",
    decoded: 0,
    skippedDelta: 68,
    needsKeyFrame: true,
    queue: 9,
    queueMs: 900,
    staleDrops: 68,
    reason: "queue-overflow-wait-keyframe",
    h264ReceivedFrames: 68,
    h264ReceivedKeyFrames: 1,
    h264ReceivedSps: 1,
    h264ReceivedPps: 1,
    h264ReceivedIdr: 1,
    h264LastNalTypes: "1",
    canvasVisible: false,
    canvasWidth: 0,
    canvasHeight: 0,
    imageVisible: false,
    imageHasSource: false,
  });
  const text = makeBoardSummary({
    status: "passed",
    mode: "connect",
    target: "192.168.31.122:43770",
    discoveryTarget: "192.168.31.122:43770",
    checks: ["connection"],
    liveVideo: "- 现场视频：实收 -- FPS · 请求 60 Hz · 协商 60 Hz · 间隔样本不足 · 帧 68 · 解码队列 9 · 本机队列 900 ms · 本地过期丢帧 68 · 原因 queue-overflow-wait-keyframe · 解码 等待关键帧",
    liveAudio: "- 现场声音：开启 · 队列 120 ms · 接收 3400 · 播放 3400 · 丢 0",
    h264,
    h264Errors: "0",
  });
  const ok =
    text.includes("W2W3Retest=") &&
    text.includes("h264=status=waiting-keyframe") &&
    text.includes("skippedDelta=68") &&
    text.includes("needsKeyframe=yes") &&
    text.includes("reason=queue-overflow-wait-keyframe") &&
    text.includes("recv=68") &&
    text.includes("key=1") &&
    text.includes("sps=1") &&
    text.includes("pps=1") &&
    text.includes("idr=1") &&
    text.includes("lastNal=1") &&
    text.includes("canvas=false") &&
    text.includes("image=false");
  return { ok, text, h264 };
}

function verifyW2W3RetestAudioStabilityGate() {
  const args = {
    requireAudioStability: true,
    audioStabilityMinFrames: 12,
    audioStabilityMaxQueueMs: 100,
  };
  const shortCandidate = getAudioStabilityStatus({
    audioFrames: 4,
    audioPlayedFrames: 4,
    audioDroppedFrames: 0,
    audioQueueMs: 40,
    audioMaxGapMs: 45,
    audioStutterCount: 0,
  }, args);
  const stableCandidate = getAudioStabilityStatus({
    audioFrames: 18,
    audioPlayedFrames: 18,
    audioDroppedFrames: 0,
    audioQueueMs: 44,
    audioMaxGapMs: 46,
    audioStutterCount: 0,
  }, args);
  const queuedCandidate = getAudioStabilityStatus({
    audioFrames: 18,
    audioPlayedFrames: 18,
    audioDroppedFrames: 0,
    audioQueueMs: 140,
    audioMaxGapMs: 46,
    audioStutterCount: 0,
  }, args);
  const ok =
    !shortCandidate.ok &&
    shortCandidate.reason.includes("audio-frames") &&
    stableCandidate.ok &&
    !queuedCandidate.ok &&
    queuedCandidate.reason.includes("audio-queue");
  return { ok, shortCandidate, stableCandidate, queuedCandidate };
}

function emitBoardSummary(summary) {
  lastBoardSummary = makeBoardSummary(summary);
  if (activeOutputArgs?.boardSummary) {
    console.log(lastBoardSummary);
  }
}

function printTimedProgress(label, startedAt, deadline, details = "") {
  const now = Date.now();
  const elapsedMs = Math.max(0, now - startedAt);
  const remainingMs = Math.max(0, deadline - now);
  const totalMs = Math.max(1, deadline - startedAt);
  const percent = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
  const suffix = details ? ` · ${details}` : "";
  print("INFO", `${label}: ${formatSeconds(elapsedMs)} elapsed / ${formatSeconds(remainingMs)} left / ${percent.toFixed(0)}%${suffix}`);
}

async function waitFor(fn, timeoutMs, label, options = {}) {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  const progressIntervalMs = Math.max(0, Number(options.progressIntervalMs) || 0);
  let nextProgressAt = progressIntervalMs > 0 ? startedAt + progressIntervalMs : 0;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    if (nextProgressAt > 0 && Date.now() >= nextProgressAt && Date.now() < deadline) {
      try {
        options.onProgress?.({ startedAt, deadline, lastError });
      } catch {}
      do {
        nextProgressAt += progressIntervalMs;
      } while (nextProgressAt <= Date.now());
    }
    await delay(250);
  }
  throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ""}`);
}

function windowsClientSnapshotExpression() {
  return `(() => {
    const text = (selector) => document.querySelector(selector)?.textContent || "";
    const canvas = document.querySelector("#remoteVideoCanvas");
    const image = document.querySelector("#remoteFrameImage");
    const diagnostics = text("#hostDiagnosticsText");
    const status = text("#statusText");
    const remote = text("#remoteStatusText");
    const audio = text("#audioText");
    const exportText = typeof buildLogExportText === "function" ? buildLogExportText() : "";
    const exportLines = exportText.split(/\\r?\\n/);
    const exportLine = (prefix) => exportLines.find((line) => line.startsWith(prefix)) || "";
    const logs = [...document.querySelectorAll("#eventLog li")]
      .slice(0, 10)
      .map((item) => item.innerText.replace(/\\s+/g, " "));
    const h264MetaQueue = Array.isArray(window.state?.h264DecoderQueue) ? window.state.h264DecoderQueue.length : 0;
    const h264WebCodecsQueue = Number(window.state?.h264Decoder?.decodeQueueSize) || 0;
    const h264DecoderQueue = Math.max(h264MetaQueue, h264WebCodecsQueue);
    const audioCurrentTime = Number(window.state?.audioContext?.currentTime);
    const audioNextPlayTime = Number(window.state?.audioNextPlayTime);
    const audioQueueMs = Number.isFinite(audioCurrentTime) && Number.isFinite(audioNextPlayTime)
      ? Math.max(0, Math.round((audioNextPlayTime - audioCurrentTime) * 1000))
      : 0;
    const audioGapStats = typeof getAudioFrameGapStats === "function"
      ? getAudioFrameGapStats()
      : {};
    return {
      status,
      remote,
      diagnostics,
      audio,
      metricFps: text("#metricFps"),
      webCodecs: typeof VideoDecoder,
      encodedVideoChunk: typeof EncodedVideoChunk,
      h264DecoderErrors: window.state?.h264DecoderErrorCount ?? 0,
      h264DecoderStatus: window.state?.h264DecoderStatus ?? "",
      h264DecodedFrames: window.state?.h264DecodedFrames ?? 0,
      h264SkippedDeltaFrames: window.state?.h264SkippedDeltaFrames ?? 0,
      h264DecoderNeedsKeyFrame: Boolean(window.state?.h264DecoderNeedsKeyFrame),
      h264DecoderQueue,
      h264DecoderQueueMs: window.state?.videoDecoderQueueMs ?? 0,
      h264DroppedStaleFrames: window.state?.videoDroppedStaleFrames ?? 0,
      h264LastDropReason: window.state?.videoLastDropReason ?? "",
      h264FallbackRecoveryCount: window.state?.h264FallbackRecoveryCount ?? 0,
      h264FallbackRecoveryPauseCount: window.state?.h264FallbackRecoveryPauseCount ?? 0,
      h264ReceivedFrames: window.state?.h264ReceivedFrames ?? 0,
      h264ReceivedKeyFrames: window.state?.h264ReceivedKeyFrames ?? 0,
      h264ReceivedDeltaFrames: window.state?.h264ReceivedDeltaFrames ?? 0,
      h264ReceivedSps: window.state?.h264ReceivedSps ?? 0,
      h264ReceivedPps: window.state?.h264ReceivedPps ?? 0,
      h264ReceivedIdr: window.state?.h264ReceivedIdr ?? 0,
      h264LastNalTypes: window.state?.h264LastNalTypes ?? "",
      h264LastKeyFrameId: window.state?.h264LastKeyFrameId ?? "",
      videoFrames: window.state?.videoFrames ?? 0,
      audioFrames: window.state?.audioFrames ?? 0,
      audioPlayedFrames: window.state?.audioPlayedFrames ?? 0,
      audioDroppedFrames: window.state?.audioDroppedFrames ?? 0,
      audioQueueMs,
      audioAverageGapMs: audioGapStats.averageGapMs ?? 0,
      audioMaxGapMs: audioGapStats.maxGapMs ?? 0,
      audioStutterCount: audioGapStats.stutterCount ?? 0,
      audioMaxStutterGapMs: audioGapStats.maxStutterGapMs ?? 0,
      liveVideo: exportLine("- 现场视频：") || exportLine("- 现场视频统计："),
      liveAudio: exportLine("- 现场声音：") || exportLine("- 现场声音统计："),
      canvasVisible: canvas?.classList.contains("is-visible") || false,
      canvasWidth: canvas?.width || 0,
      canvasHeight: canvas?.height || 0,
      imageVisible: image?.classList.contains("is-visible") || false,
      imageHasSource: Boolean(image?.getAttribute("src")),
      logs,
    };
  })()`;
}

function snapshotProgressDetails(snapshot, extra = "") {
  if (!snapshot) return extra || "snapshot=pending";
  const parts = [];
  const add = (label, value) => {
    const text = compactProgressText(value);
    if (text) parts.push(`${label}=${text}`);
  };
  add("status", snapshot.status);
  add("remote", snapshot.remote);
  add("diagnostics", snapshot.diagnostics);
  add("fps", snapshot.metricFps);
  if (snapshot.audio || Number(snapshot.audioFrames) > 0) {
    add("audio", snapshot.audio);
  }
  if (Number(snapshot.videoFrames) > 0) {
    add("videoFrames", snapshot.videoFrames);
  }
  if (Number(snapshot.audioFrames) > 0) {
    add("audioFrames", snapshot.audioFrames);
  }
  if (snapshot.audioStabilityReason && snapshot.audioStabilityReason !== "audio-stable") {
    add("audioStable", snapshot.audioStabilityReason);
  }
  if (Number(snapshot.h264DecoderErrors) > 0) {
    add("h264Errors", snapshot.h264DecoderErrors);
  }
  if (extra) parts.push(compactProgressText(extra));
  return parts.join(" · ") || "snapshot=pending";
}

async function waitForWindowsClientSnapshot({ args, session, label, timeoutMs, check, onSnapshot }) {
  const effectiveTimeoutMs = timeoutMs ?? args.timeoutMs;
  let latestSnapshot = null;
  print("INFO", `${label} waiting: timeout=${formatSeconds(effectiveTimeoutMs)}, progressEvery=${progressEveryText(args)}.`);
  return waitFor(
    async () => {
      const value = await evaluate(session, windowsClientSnapshotExpression());
      latestSnapshot = value;
      onSnapshot?.(value);
      return check(value);
    },
    effectiveTimeoutMs,
    label,
    {
      progressIntervalMs: args.progressIntervalMs,
      onProgress: ({ startedAt, deadline, lastError }) => {
        const errorText = lastError ? `lastError=${lastError.message}` : "";
        printTimedProgress(`${label} progress`, startedAt, deadline, snapshotProgressDetails(latestSnapshot, errorText));
      },
    },
  );
}

function findBrowserPath() {
  const candidates = [
    process.env.BROWSER_PATH,
    process.env.MSEDGE_PATH,
    process.env.CHROME_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean);
  const browserPath = candidates.find((candidate) => existsSync(candidate));
  if (!browserPath) {
    throw new Error("browser not found; install Microsoft Edge/Chrome or set BROWSER_PATH, MSEDGE_PATH, or CHROME_PATH");
  }
  return browserPath;
}

function startProcess(command, args, options = {}) {
  return spawn(command, args, {
    cwd: options.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function stopWindowsProcessesByCommandLine(matchText) {
  if (!matchText || process.platform !== "win32") return;
  spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      [
        "$match = $env:LAN_DUAL_PROCESS_MATCH",
        "Get-CimInstance Win32_Process |",
          "Where-Object { $_.CommandLine -and $_.CommandLine.Contains($match) } |",
          "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
      ].join(" "),
    ],
    {
      env: { ...process.env, LAN_DUAL_PROCESS_MATCH: matchText },
      stdio: "ignore",
      timeout: 10000,
      windowsHide: true,
    },
  );
}

function stopProcessTree(child, { commandLineMatch = "" } = {}) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    stopWindowsProcessesByCommandLine(commandLineMatch);
    spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Stop-Process -Id ${child.pid} -Force -ErrorAction SilentlyContinue`,
      ],
      {
        stdio: "ignore",
        timeout: 10000,
        windowsHide: true,
      },
    );
  } else if (child.exitCode === null && child.signalCode === null) {
    child.kill();
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }
  child.unref?.();
  child.stdout?.destroy();
  child.stderr?.destroy();
}

async function removeDirectoryBestEffort(path) {
  if (!path) return;
  if (process.platform === "win32") {
    spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Remove-Item -LiteralPath $env:LAN_DUAL_REMOVE_PATH -Recurse -Force -ErrorAction SilentlyContinue",
      ],
      {
        env: { ...process.env, LAN_DUAL_REMOVE_PATH: path },
        stdio: "ignore",
        timeout: 10000,
        windowsHide: true,
      },
    );
    return;
  }
  await rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {});
}

function runCapturedProcess(command, args, options = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const startedAt = performance.now();
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun({
        ...result,
        stdout,
        stderr: result.stderr ?? stderr,
        durationMs: Math.round(performance.now() - startedAt),
      });
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ exitCode: null, signal: "timeout", timedOut: true, ok: false });
    }, options.timeoutMs ?? 15000);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      finish({
        exitCode: null,
        signal: "error",
        timedOut: false,
        ok: false,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (exitCode, signal) => {
      finish({
        exitCode,
        signal,
        timedOut: false,
        ok: exitCode === 0,
      });
    });
  });
}

function attachProcessLog(child, name) {
  child.stdout?.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) print(name, text);
  });
  child.stderr?.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) print(`${name}:err`, text);
  });
}

function tailLines(text, limit = 8) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  return lines.slice(-limit).join("\n");
}

function discoveryScannerArgs(args) {
  const scannerArgs = [
    "scripts/windows/discover-lan-hosts.mjs",
    "--json",
    "--requireMacHost",
    "--timeoutMs",
    String(args.discoverTimeoutMs),
    "--port",
    String(args.port),
  ];
  if (args.discoverNoLocalSubnets) {
    scannerArgs.push("--noLocalSubnets");
  }
  if (args.hostProvided) {
    scannerArgs.push("--host", args.host);
  }
  return scannerArgs;
}

async function resolveDiscoveryTarget(args) {
  if (!args.discover) return null;
  const childArgs = discoveryScannerArgs(args);
  const result = await runCapturedProcess(process.execPath, childArgs, {
    cwd: repoRoot,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
    },
    timeoutMs: Math.max(15000, Number(args.discoverTimeoutMs) * 12 + 8000),
  });
  let payload;
  try {
    payload = JSON.parse(String(result.stdout || "").trim());
  } catch (error) {
    throw new Error(
      `Mac host discovery did not print valid JSON: ${error.message}; exit=${result.exitCode ?? "null"}; stdout=${tailLines(result.stdout)}; stderr=${tailLines(result.stderr)}`,
    );
  }
  const best = payload.bestMacHost || null;
  if (!result.ok || !best) {
    const detail = payload.boardSummary || `no Mac host found; exit=${result.exitCode ?? "null"}`;
    throw new Error(`Mac host discovery failed: ${detail}`);
  }
  args.host = String(best.host);
  args.port = String(best.port);
  return {
    command: `node ${childArgs.join(" ")}`,
    target: `${args.host}:${args.port}`,
    foundMacHosts: Array.isArray(payload.macHosts) ? payload.macHosts.length : 1,
    runtimeBuild: best.runtime?.buildId || "",
    boardSummary: payload.boardSummary || "",
  };
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}`);
  }
  return response.json();
}

class CdpSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(message.error.message || JSON.stringify(message.error)));
        } else {
          resolve(message.result);
        }
        return;
      }
      this.events.push(message);
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({ id, method, params });
    this.socket.send(payload);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  waitForEvent(method, timeoutMs) {
    return waitFor(() => {
      const index = this.events.findIndex((event) => event.method === method);
      if (index < 0) return null;
      const [event] = this.events.splice(index, 1);
      return event;
    }, timeoutMs, method);
  }

  close() {
    this.socket.close();
  }
}

async function connectCdp(debugPort, timeoutMs) {
  const targets = await waitFor(
    async () => {
      const list = await getJson(`http://127.0.0.1:${debugPort}/json/list`);
      return list.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    },
    timeoutMs,
    "Edge DevTools target",
  );

  const socket = new WebSocket(targets.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP WebSocket error")), { once: true });
  });
  return new CdpSession(socket);
}

async function closeBrowserBestEffort(session) {
  if (!session) return;
  await Promise.race([session.send("Browser.close").catch(() => {}), delay(1000)]).catch(() => {});
}

async function evaluate(session, expression) {
  const result = await session.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const detail =
      result.exceptionDetails.exception?.description ||
      result.exceptionDetails.exception?.value ||
      result.exceptionDetails.text ||
      "Runtime.evaluate failed";
    throw new Error(detail);
  }
  return result.result?.value;
}

async function verifyFloatingControlCenter(session) {
  const result = await evaluate(
    session,
    `(async () => {
      const valueOf = (selector) => document.querySelector(selector)?.value ?? "";
      const setValue = (selector, value, eventName = "change") => {
        const element = document.querySelector(selector);
        if (!element) return;
        element.value = value;
        element.dispatchEvent(new Event(eventName, { bubbles: true }));
      };
      const toggle = document.querySelector("#controlCenterToggle");
      const panel = document.querySelector("#controlCenterPanel");
      const remoteControlCenter = document.querySelector("#remoteControlCenter");
      const summary = document.querySelector("#floatingControlSummary");
      const audioToggle = document.querySelector("#audioToggle");
      if (!toggle || !panel || !remoteControlCenter || !summary) {
        return { ok: false, reason: "missing control center elements" };
      }

      const original = {
        quality: valueOf("#qualityPresetSelect"),
        resolution: valueOf("#resolutionSelect"),
        fps: valueOf("#fpsSelect"),
        bandwidth: valueOf("#bandwidthSelect"),
        display: valueOf("#displaySelect"),
        scale: valueOf("#scaleModeSelect"),
        audio: Boolean(audioToggle?.checked),
        volume: valueOf("#audioVolumeRange"),
      };

      if (panel.hidden) toggle.click();
      const opened = !panel.hidden && toggle.getAttribute("aria-expanded") === "true";
      const centerStyles = getComputedStyle(remoteControlCenter);
      const toggleStyles = getComputedStyle(toggle);
      const floatingLayer =
        centerStyles.position === "absolute" &&
        centerStyles.pointerEvents === "none" &&
        toggleStyles.pointerEvents === "auto";

      setValue("#floatingQualitySelect", "sharp");
      const qualitySynced =
        valueOf("#qualityPresetSelect") === "sharp" &&
        valueOf("#resolutionSelect") === "3840x2160" &&
        valueOf("#fpsSelect") === "120" &&
        valueOf("#bandwidthSelect") === "50";
      const summarySynced = summary.textContent.includes("120 Hz") && summary.textContent.includes("50 Mbps");

      setValue("#floatingQualitySelect", "original");
      const originalPresetSynced =
        valueOf("#qualityPresetSelect") === "original" &&
        valueOf("#resolutionSelect") === "3840x2160" &&
        valueOf("#fpsSelect") === "60" &&
        valueOf("#bandwidthSelect") === "50" &&
        valueOf("#scaleModeSelect") === "original";

      setValue("#floatingResolutionSelect", "1920x1080");
      setValue("#floatingFpsSelect", "144");
      setValue("#floatingBandwidthSelect", "40");
      const detailedSettingsSynced =
        valueOf("#qualityPresetSelect") === "custom" &&
        valueOf("#resolutionSelect") === "1920x1080" &&
        valueOf("#fpsSelect") === "144" &&
        valueOf("#bandwidthSelect") === "40";

      setValue("#floatingScaleSelect", "stretch");
      const scaleSynced =
        valueOf("#scaleModeSelect") === "stretch" &&
        document.querySelector("#remoteCanvas")?.classList.contains("scale-stretch");

      setValue("#floatingAudioSelect", "off");
      const audioSynced = !document.querySelector("#audioToggle")?.checked;

      setValue("#floatingAudioVolumeRange", "33", "input");
      const volumeSynced =
        valueOf("#audioVolumeRange") === "33" &&
        document.querySelector("#floatingAudioVolumeText")?.textContent === "33%";

      let connectionStatusText = "";
      const connectionStatusVisible = (() => {
        const floatingReconnectButton = document.querySelector("#floatingReconnectButton");
        const originalConnectionState = {
          connected: state.connected,
          connecting: state.connecting,
          connectionState: state.connectionState,
          activeHost: state.activeHost,
          activePort: state.activePort,
          reconnectAttempts: state.reconnectAttempts,
          reconnectTimer: state.reconnectTimer,
          reconnectDueAt: state.reconnectDueAt,
          reconnectReason: state.reconnectReason,
        };
        try {
          state.connected = false;
          state.connecting = false;
          state.connectionState = "reconnecting";
          state.activeHost = "192.168.31.122";
          state.activePort = "43770";
          state.reconnectAttempts = 2;
          state.reconnectTimer = 1;
          state.reconnectDueAt = Date.now() + 2400;
          state.reconnectReason = "测试断线";
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
          connectionStatusText = document.querySelector("#floatingConnectionStatus")?.textContent || "";
          return (
            connectionStatusText.includes("连接：") &&
            connectionStatusText.includes("秒后重连") &&
            connectionStatusText.includes("2/3") &&
            !floatingReconnectButton?.hidden &&
            !floatingReconnectButton?.disabled
          );
        } finally {
          state.connected = originalConnectionState.connected;
          state.connecting = originalConnectionState.connecting;
          state.connectionState = originalConnectionState.connectionState;
          state.activeHost = originalConnectionState.activeHost;
          state.activePort = originalConnectionState.activePort;
          state.reconnectAttempts = originalConnectionState.reconnectAttempts;
          state.reconnectTimer = originalConnectionState.reconnectTimer;
          state.reconnectDueAt = originalConnectionState.reconnectDueAt;
          state.reconnectReason = originalConnectionState.reconnectReason;
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
        }
      })();

      let audioStatusText = "";
      const audioStatusVisible = (() => {
        const audioToggleElement = document.querySelector("#audioToggle");
        const originalAudioState = {
          connected: state.connected,
          audioChecked: Boolean(audioToggleElement?.checked),
          audioFrames: state.audioFrames,
          audioLevel: state.audioLevel,
          audioPlayedFrames: state.audioPlayedFrames,
          audioDroppedFrames: state.audioDroppedFrames,
          audioLastError: state.audioLastError,
        };
        try {
          state.connected = true;
          if (audioToggleElement) audioToggleElement.checked = true;
          state.audioFrames = 24;
          state.audioLevel = 0.37;
          state.audioPlayedFrames = 20;
          state.audioDroppedFrames = 2;
          state.audioLastError = "";
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
          audioStatusText = document.querySelector("#floatingAudioStatus")?.textContent || "";
          return (
            audioStatusText.includes("接收 24 帧") &&
            audioStatusText.includes("电平 37%") &&
            audioStatusText.includes("33%") &&
            audioStatusText.includes("播放 20") &&
            audioStatusText.includes("丢 2")
          );
        } finally {
          state.connected = originalAudioState.connected;
          if (audioToggleElement) audioToggleElement.checked = originalAudioState.audioChecked;
          state.audioFrames = originalAudioState.audioFrames;
          state.audioLevel = originalAudioState.audioLevel;
          state.audioPlayedFrames = originalAudioState.audioPlayedFrames;
          state.audioDroppedFrames = originalAudioState.audioDroppedFrames;
          state.audioLastError = originalAudioState.audioLastError;
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
        }
      })();

      let clipboardStatusText = "";
      const clipboardStatusVisible = (() => {
        const clipboardToggleElement = document.querySelector("#clipboardToggle");
        const originalClipboardState = {
          connected: state.connected,
          checked: Boolean(clipboardToggleElement?.checked),
          fileTransferActive: state.fileTransferActive,
          remoteFileTransfers: new Map(state.remoteFileTransfers),
          receivedClipboardWriteStatus: { ...state.receivedClipboardWriteStatus },
          receivedClipboardFiles: [...state.receivedClipboardFiles],
          hostDiagnostics: { ...state.hostDiagnostics },
        };
        try {
          state.connected = true;
          if (clipboardToggleElement) clipboardToggleElement.checked = true;
          state.fileTransferActive = false;
          state.remoteFileTransfers = new Map([
            [
              "transfer-test",
              {
                fileCount: 2,
                receivedBytes: 1048576,
                totalBytes: 2097152,
                files: [],
              },
            ],
          ]);
          state.receivedClipboardWriteStatus = { kind: "", text: "" };
          state.receivedClipboardFiles = [];
          state.hostDiagnostics = {
            ...state.hostDiagnostics,
            clipboardText: true,
            clipboardTextMode: "system",
            clipboardFile: true,
            clipboardFileMode: "system",
          };
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
          clipboardStatusText = document.querySelector("#floatingClipboardStatus")?.textContent || "";
          return (
            clipboardStatusText.includes("接收 2 个文件") &&
            clipboardStatusText.includes("1.0 MB/2.0 MB")
          );
        } finally {
          state.connected = originalClipboardState.connected;
          if (clipboardToggleElement) clipboardToggleElement.checked = originalClipboardState.checked;
          state.fileTransferActive = originalClipboardState.fileTransferActive;
          state.remoteFileTransfers = originalClipboardState.remoteFileTransfers;
          state.receivedClipboardWriteStatus = originalClipboardState.receivedClipboardWriteStatus;
          state.receivedClipboardFiles = originalClipboardState.receivedClipboardFiles;
          state.hostDiagnostics = originalClipboardState.hostDiagnostics;
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
        }
      })();

      let videoStatusText = "";
      const videoStatusVisible = (() => {
        const originalVideoState = {
          connected: state.connected,
          actualVideoFps: state.actualVideoFps,
          negotiatedFps: state.negotiatedFps,
          requestedFps: state.requestedFps,
          hostDiagnostics: { ...state.hostDiagnostics },
        };
        try {
          state.connected = true;
          state.actualVideoFps = 22.9;
          state.negotiatedFps = 30;
          state.requestedFps = 60;
          state.hostDiagnostics = {
            ...state.hostDiagnostics,
            videoCodec: "h264",
            videoFrameAgeMs: 123,
            videoFrameClockSkewed: false,
            maxScreenFps: 30,
            streamFallbackReason: "H.264 启动超时，已回退 JPEG",
          };
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
          videoStatusText = document.querySelector("#floatingVideoStatus")?.textContent || "";
          return (
            videoStatusText.includes("H.264") &&
            videoStatusText.includes("实收 22.9 FPS") &&
            videoStatusText.includes("协商 30 Hz") &&
            videoStatusText.includes("请求 60 Hz") &&
            videoStatusText.includes("低于协商 30 Hz") &&
            videoStatusText.includes("远端上限 30 Hz") &&
            videoStatusText.includes("到达 123ms") &&
            videoStatusText.includes("回退")
          );
        } finally {
          state.connected = originalVideoState.connected;
          state.actualVideoFps = originalVideoState.actualVideoFps;
          state.negotiatedFps = originalVideoState.negotiatedFps;
          state.requestedFps = originalVideoState.requestedFps;
          state.hostDiagnostics = originalVideoState.hostDiagnostics;
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
        }
      })();
      const statusVisible =
        document.querySelector("#floatingFullscreenHint")?.textContent.includes("Esc") &&
        document.querySelector("#floatingConnectionStatus")?.textContent.includes("连接") &&
        document.querySelector("#floatingVideoStatus")?.textContent.includes("视频") &&
        document.querySelector("#floatingAudioStatus")?.textContent.includes("声音") &&
        document.querySelector("#floatingClipboardStatus")?.textContent.includes("剪贴板") &&
        document.querySelector("#floatingInputModeStatus")?.textContent.includes("输入") &&
        document.querySelector("#floatingSecurityStatus")?.textContent.includes("安全");

      const displaySettingsPartialClient = (() => {
        const originalConnected = state.connected;
        const originalClient = state.client;
        const originalHostDiagnostics = { ...state.hostDiagnostics };
        let error = "";
        try {
          state.connected = true;
          state.client = {
            sendInputEvent() {},
          };
          state.hostDiagnostics = {
            ...state.hostDiagnostics,
            audio: true,
          };
          try {
            sendDisplaySettings();
          } catch (caught) {
            error = caught?.message || String(caught);
          }
          return { ok: !error, error };
        } finally {
          state.connected = originalConnected;
          state.client = originalClient;
          state.hostDiagnostics = originalHostDiagnostics;
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
        }
      })();

      const shortcutSent = (() => {
        const sent = [];
        const originalConnected = state.connected;
        const originalControlDirection = state.controlDirection;
        const originalClient = state.client;
        const originalInputEvents = state.inputEvents;
        const originalInputMode = state.hostDiagnostics.inputMode;
        try {
          state.connected = true;
          state.controlDirection = "windows_to_mac";
          state.hostDiagnostics.inputMode = "inject";
          state.client = {
            sendInputEvent(payload) {
              sent.push(payload);
            },
          };
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
          setValue("#floatingShortcutSelect", "copy");
          document.querySelector("#floatingShortcutButton")?.click();
          return (
            sent.length === 1 &&
            sent[0].shortcutProfile === "toolbar" &&
            sent[0].shortcutAction === "copy" &&
            sent[0].key === "c" &&
            sent[0].metaKey === true &&
            sent[0].remoteModifiers?.includes("meta")
          );
        } finally {
          state.connected = originalConnected;
          state.controlDirection = originalControlDirection;
          state.client = originalClient;
          state.inputEvents = originalInputEvents;
          state.hostDiagnostics.inputMode = originalInputMode;
          if (typeof updateInputStatus === "function") updateInputStatus();
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
        }
      })();

      let diagnosticsCopyText = "";
      const diagnosticsCopyVisible = await (async () => {
        const button = document.querySelector("#floatingCopyDiagnosticsButton");
        const eventLog = document.querySelector("#eventLog");
        const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
        const originalLogEntries = Array.isArray(state.logEntries) ? state.logEntries.slice() : [];
        const originalEventLogHtml = eventLog?.innerHTML || "";
        const originalButtonText = button?.textContent || "";
        const originalFeedbackTimer = state.copyDiagnosticsFeedbackTimer;
        if (!button || typeof copyLogsToClipboard !== "function") return false;
        try {
          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
              writeText: async (text) => {
                diagnosticsCopyText = String(text);
              },
            },
          });
          button.click();
          await new Promise((resolve) => setTimeout(resolve, 0));
          return (
            !button.disabled &&
            diagnosticsCopyText.includes("\\n快速摘要\\n") &&
            diagnosticsCopyText.includes("\\n连接状态\\n") &&
            diagnosticsCopyText.includes("\\n本机协作\\n") &&
            diagnosticsCopyText.includes("- 当前状态：") &&
            diagnosticsCopyText.includes("- 本机被控密码：不导出") &&
            !diagnosticsCopyText.includes("demo-password") &&
            button.textContent.includes("已复制") &&
            state.logEntries[0]?.title === "诊断复制"
          );
        } finally {
          if (state.copyDiagnosticsFeedbackTimer && state.copyDiagnosticsFeedbackTimer !== originalFeedbackTimer) {
            window.clearTimeout(state.copyDiagnosticsFeedbackTimer);
          }
          state.copyDiagnosticsFeedbackTimer = originalFeedbackTimer;
          button.textContent = originalButtonText;
          if (originalClipboardDescriptor) {
            Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
          } else {
            try {
              delete navigator.clipboard;
            } catch {
              // Ignore cleanup failures in older browser contexts.
            }
          }
          state.logEntries = originalLogEntries;
          if (eventLog) eventLog.innerHTML = originalEventLogHtml;
        }
      })();

      document.querySelector("#floatingFullscreenButton")?.click();
      const shell = document.querySelector(".app-shell");
      const topbar = document.querySelector(".topbar");
      const remoteSurface = document.querySelector(".remote-surface");
      const fullscreenHint = document.querySelector("#fullscreenHint");
      const fullscreenHintText = document.querySelector("#fullscreenHintText")?.textContent || "";
      const fullscreenEntered =
        shell?.classList.contains("is-fullscreen") &&
        getComputedStyle(topbar).display === "none" &&
        getComputedStyle(remoteSurface).paddingTop === "0px";
      const fullscreenHintVisible =
        fullscreenHint?.classList.contains("is-visible") &&
        fullscreenHintText.includes("Esc") &&
        fullscreenHintText.includes("144 Hz") &&
        fullscreenHintText.includes("40 Mbps");

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      const fullscreenEscExited =
        !shell?.classList.contains("is-fullscreen") &&
        getComputedStyle(topbar).display !== "none";

      const originalRequestFullscreen = shell?.requestFullscreen;
      let immersiveRequestCalled = false;
      if (shell) {
        shell.requestFullscreen = () => {
          immersiveRequestCalled = true;
          return Promise.resolve();
        };
      }
      if (typeof enterImmersiveFullscreen === "function") {
        await enterImmersiveFullscreen();
      }
      await Promise.resolve();
      const immersiveFullscreenEntered =
        immersiveRequestCalled &&
        Boolean(state.immersiveFullscreen) &&
        shell?.classList.contains("is-fullscreen") &&
        document.querySelector("#fullscreenHintText")?.textContent.includes("真全屏");
      setFullscreen(false);
      if (shell && originalRequestFullscreen) {
        shell.requestFullscreen = originalRequestFullscreen;
      }

      if (panel.hidden) toggle.click();
      document.querySelector("#floatingFullscreenButton")?.click();

      if (panel.hidden) toggle.click();
      document.querySelector("#floatingWindowButton")?.click();
      const fullscreenExited =
        !shell?.classList.contains("is-fullscreen") &&
        getComputedStyle(topbar).display !== "none";
      if (panel.hidden) toggle.click();

      const monitorModeCheck = await (async () => {
        const monitorButton = document.querySelector("#monitorModeButton");
        const floatingMonitorButton = document.querySelector("#floatingMonitorModeButton");
        const monitorBar = document.querySelector("#monitorModeBar");
        const monitorStatus = document.querySelector("#monitorModeStatus");
        const restoreButton = document.querySelector("#monitorModeRestoreButton");
        const copyButton = document.querySelector("#monitorModeCopyButton");
        if (
          !monitorButton ||
          !floatingMonitorButton ||
          !monitorBar ||
          !monitorStatus ||
          !restoreButton ||
          !copyButton ||
          typeof setMonitorMode !== "function" ||
          typeof startMonitorModeDrag !== "function" ||
          typeof moveMonitorModeWindow !== "function" ||
          typeof stopMonitorModeDrag !== "function"
        ) {
          return { ok: false, reason: "missing monitor mode elements" };
        }

        const originalMonitorMode = state.monitorMode;
        const originalConnected = state.connected;
        const originalControlDirection = state.controlDirection;
        const originalClient = state.client;
        const originalInputEvents = state.inputEvents;
        const originalHostDiagnostics = { ...state.hostDiagnostics };
        const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
        const originalLogEntries = Array.isArray(state.logEntries) ? state.logEntries.slice() : [];
        const eventLog = document.querySelector("#eventLog");
        const originalEventLogHtml = eventLog?.innerHTML || "";
        const originalFeedbackTimer = state.copyDiagnosticsFeedbackTimer;
        const originalFloatingCopyText = document.querySelector("#floatingCopyDiagnosticsButton")?.textContent || "";
        const originalRemoteSurfaceStyle = remoteSurface?.getAttribute("style") || "";
        const sent = [];
        let copiedText = "";

        try {
          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
              writeText: async (text) => {
                copiedText = String(text);
              },
            },
          });
          state.connected = true;
          state.controlDirection = "windows_to_mac";
          state.inputEvents = 10;
          state.hostDiagnostics = {
            ...state.hostDiagnostics,
            inputMode: "inject",
            inputAckStatus: "injected",
          };
          state.client = {
            sendInputEvent(payload) {
              sent.push(payload);
            },
          };
          if (typeof updateInputStatus === "function") updateInputStatus();
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();

          monitorButton.click();
          await Promise.resolve();
          const monitorSurfaceStyle = getComputedStyle(remoteSurface);
          const enteredByTopbar =
            state.monitorMode &&
            shell?.classList.contains("is-monitor-mode") &&
            !monitorBar.hidden &&
            getComputedStyle(topbar).display === "none" &&
            monitorSurfaceStyle.position === "fixed" &&
            monitorSurfaceStyle.pointerEvents === "auto" &&
            monitorStatus.textContent.includes("只监看") &&
            document.querySelector("#inputText")?.textContent.includes("只监看") &&
            document.querySelector("#floatingInputModeStatus")?.textContent.includes("只监看");

          const inputBefore = state.inputEvents;
          setValue("#floatingShortcutSelect", "copy");
          const shortcutButton = document.querySelector("#floatingShortcutButton");
          shortcutButton?.click();
          const inputBlocked =
            sent.length === 0 &&
            state.inputEvents === inputBefore &&
            Boolean(shortcutButton?.disabled);

          copyButton.click();
          await new Promise((resolve) => setTimeout(resolve, 0));
          const copiedMonitorDiagnostics =
            copiedText.includes("- 全屏浮层模式：监看小窗") &&
            copiedText.includes("只监看，不发送输入") &&
            !copiedText.includes("demo-password");

          const rect = remoteSurface.getBoundingClientRect();
          startMonitorModeDrag({
            button: 0,
            clientX: rect.left + 12,
            clientY: rect.top + 12,
            preventDefault() {},
          });
          moveMonitorModeWindow({
            clientX: rect.left + 48,
            clientY: rect.top + 34,
          });
          stopMonitorModeDrag();
          const dragHandled =
            remoteSurface.style.left.endsWith("px") &&
            remoteSurface.style.top.endsWith("px") &&
            remoteSurface.style.right === "auto" &&
            remoteSurface.style.bottom === "auto";

          restoreButton.click();
          const restoredByButton =
            !state.monitorMode &&
            !shell?.classList.contains("is-monitor-mode") &&
            monitorBar.hidden;

          if (panel.hidden) toggle.click();
          floatingMonitorButton.click();
          const enteredByFloating =
            state.monitorMode &&
            shell?.classList.contains("is-monitor-mode") &&
            !monitorBar.hidden &&
            panel.hidden;

          return {
            ok:
              enteredByTopbar &&
              inputBlocked &&
              copiedMonitorDiagnostics &&
              dragHandled &&
              restoredByButton &&
              enteredByFloating,
            enteredByTopbar,
            inputBlocked,
            copiedMonitorDiagnostics,
            dragHandled,
            restoredByButton,
            enteredByFloating,
            status: monitorStatus.textContent,
          };
        } finally {
          setMonitorMode(Boolean(originalMonitorMode));
          state.connected = originalConnected;
          state.controlDirection = originalControlDirection;
          state.client = originalClient;
          state.inputEvents = originalInputEvents;
          state.hostDiagnostics = originalHostDiagnostics;
          if (state.copyDiagnosticsFeedbackTimer && state.copyDiagnosticsFeedbackTimer !== originalFeedbackTimer) {
            window.clearTimeout(state.copyDiagnosticsFeedbackTimer);
          }
          state.copyDiagnosticsFeedbackTimer = originalFeedbackTimer;
          const floatingCopyButton = document.querySelector("#floatingCopyDiagnosticsButton");
          if (floatingCopyButton) floatingCopyButton.textContent = originalFloatingCopyText;
          state.logEntries = originalLogEntries;
          if (eventLog) eventLog.innerHTML = originalEventLogHtml;
          if (remoteSurface) {
            if (originalRemoteSurfaceStyle) {
              remoteSurface.setAttribute("style", originalRemoteSurfaceStyle);
            } else {
              remoteSurface.removeAttribute("style");
            }
          }
          if (originalClipboardDescriptor) {
            Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
          } else {
            try {
              delete navigator.clipboard;
            } catch {
              // Ignore cleanup failures in older browser contexts.
            }
          }
          if (typeof updateInputStatus === "function") updateInputStatus();
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
        }
      })();

      document.querySelector("#qualityPresetSelect").value = original.quality;
      document.querySelector("#resolutionSelect").value = original.resolution;
      document.querySelector("#fpsSelect").value = original.fps;
      document.querySelector("#bandwidthSelect").value = original.bandwidth;
      document.querySelector("#displaySelect").value = original.display;
      document.querySelector("#scaleModeSelect").value = original.scale;
      document.querySelector("#audioToggle").checked = original.audio;
      document.querySelector("#audioVolumeRange").value = original.volume;
      if (typeof updateMetrics === "function") updateMetrics();
      if (typeof applyScaleMode === "function") applyScaleMode();
      if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
      toggle.click();

      return {
        ok:
          opened &&
          floatingLayer &&
          summarySynced &&
          qualitySynced &&
          originalPresetSynced &&
          detailedSettingsSynced &&
          scaleSynced &&
          audioSynced &&
          volumeSynced &&
          statusVisible &&
          connectionStatusVisible &&
          audioStatusVisible &&
          clipboardStatusVisible &&
          videoStatusVisible &&
          displaySettingsPartialClient.ok &&
          shortcutSent &&
          diagnosticsCopyVisible &&
          fullscreenEntered &&
          fullscreenHintVisible &&
          fullscreenEscExited &&
          immersiveFullscreenEntered &&
          fullscreenExited &&
          monitorModeCheck.ok,
        opened,
        floatingLayer,
        summarySynced,
        summary: summary.textContent,
        qualitySynced,
        originalPresetSynced,
        detailedSettingsSynced,
        scaleSynced,
        audioSynced,
        volumeSynced,
        statusVisible,
        connectionStatusVisible,
        connectionStatusText,
        audioStatusVisible,
        audioStatusText,
        clipboardStatusVisible,
        clipboardStatusText,
        videoStatusVisible,
        videoStatusText,
        displaySettingsPartialClient,
        shortcutSent,
        diagnosticsCopyVisible,
        diagnosticsCopyTextLength: diagnosticsCopyText.length,
        fullscreenEntered,
        fullscreenHintVisible,
        fullscreenEscExited,
        immersiveFullscreenEntered,
        fullscreenExited,
        monitorModeCheck,
        closed: panel.hidden,
        restored: {
          quality: valueOf("#qualityPresetSelect"),
          resolution: valueOf("#resolutionSelect"),
          fps: valueOf("#fpsSelect"),
          bandwidth: valueOf("#bandwidthSelect"),
          scale: valueOf("#scaleModeSelect"),
          audio: Boolean(document.querySelector("#audioToggle")?.checked),
          volume: valueOf("#audioVolumeRange"),
        },
      };
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`floating control center check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyDesktopOnlyHostPanel(session) {
  const result = await evaluate(
    session,
    `(() => {
      const badge = document.querySelector("#localHostBadge");
      const status = document.querySelector("#localHostStatusText");
      const watcherBadge = document.querySelector("#localMacAlertWatcherBadge");
      const watcherStatus = document.querySelector("#localMacAlertWatcherStatusText");
      const buttons = [
        "#localHostReadinessButton",
        "#localHostStartButton",
        "#localHostFirewallButton",
        "#localHostStopButton",
        "#localHostReverseGrantButton",
        "#localMacAlertWatcherToggleButton",
        "#localMacAlertWatcherRefreshButton",
      ].map((selector) => document.querySelector(selector));
      const inputs = [
        "#localHostPortInput",
        "#localHostPasswordInput",
        "#localHostScreenModeSelect",
        "#localHostAudioModeSelect",
        "#localHostInputModeSelect",
        "#localHostReverseControlModeSelect",
        "#localHostReadinessProfileSelect",
        "#localHostProbeMediaToggle",
      ].map((selector) => document.querySelector(selector));
      const profileSelect = document.querySelector("#localHostReadinessProfileSelect");
      const probeMediaToggle = document.querySelector("#localHostProbeMediaToggle");
      const reverseSelect = document.querySelector("#localHostReverseControlModeSelect");
      const originalReverseValue = reverseSelect?.value || "";
      const originalProbeMediaChecked = Boolean(probeMediaToggle?.checked);
      const profileOptions = Array.from(profileSelect?.options || []).map((option) => option.value);
      const defaultLaunchRequest =
        typeof buildLocalHostLaunchRequest === "function"
          ? buildLocalHostLaunchRequest()
          : {};
      if (reverseSelect) reverseSelect.value = "accept";
      const acceptLaunchRequest =
        typeof buildLocalHostLaunchRequest === "function"
          ? buildLocalHostLaunchRequest()
          : {};
      if (reverseSelect) reverseSelect.value = originalReverseValue;
      const readinessRequest =
        typeof buildLocalHostReadinessRequest === "function"
          ? buildLocalHostReadinessRequest()
          : {};
      if (probeMediaToggle) probeMediaToggle.checked = true;
      const mediaReadinessRequest =
        typeof buildLocalHostReadinessRequest === "function"
          ? buildLocalHostReadinessRequest()
          : {};
      if (probeMediaToggle) probeMediaToggle.checked = originalProbeMediaChecked;
      const statusRequest =
        typeof buildLocalHostStatusRequest === "function"
          ? buildLocalHostStatusRequest()
          : {};
      const watcherRequest =
        typeof buildMacAlertWatcherRequest === "function"
          ? buildMacAlertWatcherRequest()
          : {};
      const macAlertFindingText = [
        "MacUnattendedStatus=attention warnings=launch-agent-missing,launch-agent-max-fps,power-risk blockers=none",
        "MacPowerHealth=warning reason=system-sleep-enabled warnings=system-sleep-enabled,display-sleep-enabled blockers=none checkedAt=2026-06-19T08:08:38.575Z",
        "MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=launch-agent-not-loaded,power checkedAt=2026-06-19T08:10:38.575Z",
        "UserPresence=away source=api-state updatedAt=2026-06-20T13:52:05.698Z",
        "UserPresenceAction=no-auth-only blocker=BLOCKED_BY_USER_AWAY",
        "MacPowerPlan=node scripts/mac/plan-mac-power-settings.mjs --profile all --sleep 0 --displaySleep 0 --networkWake on --boardSummary",
        "MacRemoteAudioPlan=node scripts/mac/plan-mac-remote-audio.mjs --boardSummary",
        "Mac remote audio plan: status=plan-only; capture=system-pcm-does-not-mute-local; RemoteOnlyOptions=manual-mute-restore/virtual-output-device/product-toggle; recommended=product-toggle-with-explicit-consent; safety=no-volume-change,no password/input/inject. Consent=explicit-before-change; RestorePath=required-before-apply.",
        "MacInputSafetyPlan=node scripts/mac/plan-mac-input-safety.mjs --boardSummary",
        "Mac input safety plan: status=plan-only; default=log; realInput=blocked-until-user-watching; required=--confirmUserWatching; eventSet=safe; safety=no-password,no-input-events,no-inject.",
        "MacHostAuthPath=prompt-password-required reason=launch-agent-ephemeral-password mode=ephemeral next=MacHostStop->MacMaxFpsSafeStart->MacHostMedia",
        "MacClientPasswordLocation=Mac client 页面连接 Windows 时，把 Windows 当前临时密码填页面“连接密码”框；formal/browser runner 的终端隐藏输入只用于脚本；不要把密码发通讯板",
        "MacUnattendedStatus=node scripts/mac/check-mac-unattended-status.mjs --host 127.0.0.1 --port 43770 --boardSummary",
        "MacUnattendedFormal=node scripts/mac/check-mac-unattended-status.mjs --host 127.0.0.1 --port 43770 --requireLaunchAgentMaxFps --requireLaunchAgentLoaded --boardSummary",
        "MacLaunchAgentLoad=launchctl bootstrap gui/$(id -u) /Users/skymoonzyj/Library/LaunchAgents/com.lan-dual-control.mac-host.plist",
        "MacLaunchAgentPrint=launchctl print gui/$(id -u)/com.lan-dual-control.mac-host",
        "MacFormalStatus=ready with warnings: blockers: none warnings: video,build,auth,windows-host,repo",
        "MacResumeStatus=ready with warnings blockers=none warnings=h264-fallback,fps-limit",
        "MacHostReadiness=attention blockers=none warnings=mac-host-discovery,agent-link-board-currentcall,mac-host-max-fps",
        "MacHostReadiness=node scripts/mac/check-mac-host-readiness.mjs --host 127.0.0.1 --port 43770 --checkBoard --boardSummary",
        "MacHeartbeat=status=warning warnings=mac-host-build-stale reason=ok restart recommended hostRuntimeChanges=1 MacHostStop=node scripts/mac/start-mac-host.mjs --stop --host 127.0.0.1 --port 43770",
        "MacHostSafeStart=node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43770",
        "MacMaxFpsSafeStart=node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43770 --maxScreenFps 60",
        "MacClientDiscoverWindows=node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary",
        "WindowsLanRisk=no-firewall-allow,public-profile",
        "WindowsFirewallStatus=node scripts/windows/check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --json",
        "WindowsFirewallPreview=node scripts/windows/check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --dryRunRule --ruleProfile Private",
        "MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs --host 192.168.31.68 --port 43770 --boardSummary",
        "MacClientPromptPasswordSmoke=node scripts/mac/run-mac-client-formal-smoke.mjs --host 192.168.31.68 --port 43770 --ensureClient --promptPassword --boardSummary",
        "MacClientBrowserSelfTest=node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs --boardSummary",
        "MacScriptHelp=node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary",
        "MacHostMedia 通过 passed=12/12 media=ok",
        "MacFormalLocalSmoke 通过：H.264 89 frames / 29.54 fps / maxGap 38ms，PCM 151 frames / 49.87 fps / maxGap 32ms，input-log 16/16 ack，injected=false",
        "MacFormalLocalSmoke=failed blockers=auth warnings=video",
        "RerunFormalLocalSmoke=node scripts/mac/check-mac-formal-local-smoke.mjs --host 127.0.0.1 --port 43770 --promptPassword --boardSummary",
        "WindowsReverseGrantStatus=pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Status -BoardSummary",
        "WindowsOpenOneTimeReverseGrant=pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Grant -DurationMs 30000 -BoardSummary",
        "WindowsSecureAuthPath=node scripts/windows/start-windows-host.mjs --host 0.0.0.0 --port 43770 --promptPassword --requirePassword",
        "PostPassNext=WindowsRecordPassAndTailError+MacManualUxStandby",
        "ManualUxChecklist=connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics",
        "run-mac-client-formal-smoke preflight ready=false blockers=windows-host warnings=board",
        "MacHeartbeat=status=ok; checkedAt=2020-01-01T00:00:00.000Z; device=Mac; codex=ok status=coding updatedAt=2020-01-01T00:00:00.000Z ageMs=999999; macHost=online 127.0.0.1:43770; macClient=online http://127.0.0.1:5188/; board=ok boardUpdatedAt=2020-01-01T00:00:00.000Z; blockers=none warnings=none reason=ok",
        "MacHeartbeat=stale heartbeat missing; Mac host /discovery unreachable ECONNREFUSED; HTTP 502 Bad Gateway",
        "MacHeartbeat=status=blocked; codex=mac-codex-stale; blockers=mac-codex-stale warnings=none reason=mac-codex-stale",
        "MacHeartbeat=status=warning; codex=codex-reconnect-signal; blockers=none warnings=codex-reconnect-signal reason=codex-reconnect-signal",
        "MacHeartbeat=blocked reason=codex-reconnect-stuck evidence=正在重新连接 5/5 / stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses) suggestedAction=请用户查看 Mac Codex 窗口",
        "MacHeartbeatOnce=node scripts/mac/watch-mac-heartbeat.mjs --once --sendStatus --boardSummary",
        "MacHeartbeatWatch=node scripts/mac/watch-mac-heartbeat.mjs --sendStatus --intervalMs 30000",
        "MacHeartbeatStart=node scripts/mac/start-mac-heartbeat-watcher.mjs --host 127.0.0.1 --port 43770 --server http://192.168.31.68:17888 --intervalMs 30000 --boardSummary",
        "MacHeartbeatStatus=node scripts/mac/start-mac-heartbeat-watcher.mjs --status --host 127.0.0.1 --port 43770 --server http://192.168.31.68:17888 --boardSummary",
        "MacHeartbeatStop=node scripts/mac/start-mac-heartbeat-watcher.mjs --stop --host 127.0.0.1 --port 43770 --server http://192.168.31.68:17888 --boardSummary",
      ].join("; ");
      const macAlertFindingSummary = "Mac side status alert - Mac Codex | " + macAlertFindingText;
      const userPresenceAwayText = "UserPresence=away source=api-state updatedAt=2026-06-20T13:52:05.698Z; UserPresenceAction=no-auth-only blocker=BLOCKED_BY_USER_AWAY";
      const userPresenceAwayAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(userPresenceAwayText)
          : null;
      const userPresenceAwayReachability =
        typeof getMacReachabilityExportStatus === "function"
          ? getMacReachabilityExportStatus({
              targetLabel: "",
              reconnectExport: { status: "未等待" },
              macAlertWatcherExport: {
                status: "提醒中",
                unattended: userPresenceAwayAttention,
                heartbeatFreshness: userPresenceAwayAttention?.heartbeatFreshness,
              },
            })
          : null;
      const postPassManualUxText = "PostPassNext=WindowsRecordPassAndTailError+MacManualUxStandby; ManualUxChecklist=connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics";
      const postPassManualUxAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(postPassManualUxText)
          : null;
      const postPassManualUxView =
        typeof macAlertWatcherUiState === "function"
          ? macAlertWatcherUiState({
              ok: true,
              action: "status",
              running: true,
              processIds: [1357],
              server: "http://192.168.31.68:17888",
              recentAlerts: [{ at: "2026-06-20 01:20:00", title: "Post pass UX", message: postPassManualUxText }],
              lastAlert: { at: "2026-06-20 01:20:00", title: "Post pass UX", message: postPassManualUxText },
              message: "Mac alert watcher is running.",
            }, { available: true, busy: false })
          : {};
      const macRemoteAudioPlanText = [
        "MacRemoteAudioPlan=node scripts/mac/plan-mac-remote-audio.mjs --boardSummary",
        "Mac remote audio plan: status=plan-only; capture=system-pcm-does-not-mute-local; RemoteOnlyOptions=manual-mute-restore/virtual-output-device/product-toggle; recommended=product-toggle-with-explicit-consent; safety=no-volume-change,no password/input/inject. Consent=explicit-before-change; RestorePath=required-before-apply.",
      ].join("; ");
      const macRemoteAudioPlanAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(macRemoteAudioPlanText)
          : null;
      const macRemoteAudioPlanView =
        typeof macAlertWatcherUiState === "function"
          ? macAlertWatcherUiState({
              ok: true,
              action: "status",
              running: true,
              processIds: [2469],
              server: "http://192.168.31.68:17888",
              recentAlerts: [{ at: "2026-06-20 02:30:00", title: "Mac remote audio", message: macRemoteAudioPlanText }],
              lastAlert: { at: "2026-06-20 02:30:00", title: "Mac remote audio", message: macRemoteAudioPlanText },
              message: "Mac alert watcher is running.",
            }, { available: true, busy: false })
          : {};
      const macRemoteAudioStatusText = "MacRemoteAudioStatus=status=local-playback-active localOutput=audible remoteOnly=not-active Next=ask-user-consent-before-mute-or-route Safety=read-only,no-volume-change.";
      const macRemoteAudioStatusAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(macRemoteAudioStatusText)
          : null;
      const macRemoteAudioStatusView =
        typeof macAlertWatcherUiState === "function"
          ? macAlertWatcherUiState({
              ok: true,
              action: "status",
              running: true,
              processIds: [2473],
              server: "http://192.168.31.68:17888",
              recentAlerts: [{ at: "2026-06-20 02:32:00", title: "Mac remote audio status", message: macRemoteAudioStatusText }],
              lastAlert: { at: "2026-06-20 02:32:00", title: "Mac remote audio status", message: macRemoteAudioStatusText },
              message: "Mac alert watcher is running.",
            }, { available: true, busy: false })
          : {};
      const macInputSafetyPlanText = [
        "MacInputSafetyPlan=node scripts/mac/plan-mac-input-safety.mjs --boardSummary",
        "Mac input safety plan: status=plan-only; default=log; realInput=blocked-until-user-watching; required=--confirmUserWatching; eventSet=safe; safety=no-password,no-input-events,no-inject.",
      ].join("; ");
      const macInputSafetyPlanAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(macInputSafetyPlanText)
          : null;
      const macInputSafetyPlanView =
        typeof macAlertWatcherUiState === "function"
          ? macAlertWatcherUiState({
              ok: true,
              action: "status",
              running: true,
              processIds: [2470],
              server: "http://192.168.31.68:17888",
              recentAlerts: [{ at: "2026-06-20 02:35:00", title: "Mac input safety", message: macInputSafetyPlanText }],
              lastAlert: { at: "2026-06-20 02:35:00", title: "Mac input safety", message: macInputSafetyPlanText },
              message: "Mac alert watcher is running.",
            }, { available: true, busy: false })
          : {};
      const macHostAuthPathText = [
        "MacHostAuthPath=prompt-password-required reason=launch-agent-ephemeral-password mode=ephemeral next=MacHostStop->MacMaxFpsSafeStart->MacHostMedia",
        "MacClientPasswordLocation=Mac client 页面连接 Windows 时，把 Windows 当前临时密码填页面“连接密码”框；formal/browser runner 的终端隐藏输入只用于脚本；不要把密码发通讯板",
        "MacMaxFpsSafeStart=node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43770 --maxScreenFps 60",
        "safety=no-password,no-input-inject",
      ].join("; ");
      const macHostAuthPathAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(macHostAuthPathText)
          : null;
      const macHostAuthPathBareAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention("MacHostAuthPath=prompt-password-required reason=launch-agent-ephemeral-password mode=ephemeral next=MacHostStop->MacMaxFpsSafeStart->MacHostMedia")
          : null;
      const macHostAuthPathView =
        typeof macAlertWatcherUiState === "function"
          ? macAlertWatcherUiState({
              ok: true,
              action: "status",
              running: true,
              processIds: [2471],
              server: "http://192.168.31.68:17888",
              recentAlerts: [{ at: "2026-06-20 09:30:00", title: "Mac auth path", message: macHostAuthPathText }],
              lastAlert: { at: "2026-06-20 09:30:00", title: "Mac auth path", message: macHostAuthPathText },
              message: "Mac alert watcher is running.",
            }, { available: true, busy: false })
          : {};
      const macClientPasswordLocationText = "MacClientPasswordLocation=Mac client 页面连接 Windows 时，把 Windows 当前临时密码填页面“连接密码”框；formal/browser runner 的终端隐藏输入只用于脚本；不要把密码发通讯板";
      const macClientPasswordLocationAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(macClientPasswordLocationText)
          : null;
      const macClientPasswordLocationView =
        typeof macAlertWatcherUiState === "function"
          ? macAlertWatcherUiState({
              ok: true,
              action: "status",
              running: true,
              processIds: [2472],
              server: "http://192.168.31.68:17888",
              recentAlerts: [{ at: "2026-06-20 09:32:00", title: "Mac client password location", message: macClientPasswordLocationText }],
              lastAlert: { at: "2026-06-20 09:32:00", title: "Mac client password location", message: macClientPasswordLocationText },
              message: "Mac alert watcher is running.",
            }, { available: true, busy: false })
          : {};
      const watcherRunningView =
        typeof macAlertWatcherUiState === "function"
          ? macAlertWatcherUiState({
              ok: true,
              action: "status",
              running: true,
              processIds: [1357],
              server: "http://192.168.31.68:17888",
              recentAlerts: [
                {
                  at: "2026-06-18 10:31:00",
                  title: "Mac side status alert - Mac Codex",
                  message: macAlertFindingText,
                  summary: macAlertFindingSummary,
                },
              ],
              lastAlert: {
                at: "2026-06-18 10:31:00",
                title: "Mac side status alert - Mac Codex",
                message: macAlertFindingText,
                summary: macAlertFindingSummary,
              },
              message: "Mac alert watcher is running.",
            }, { available: true, busy: false })
          : {};
      const watcherStoppedView =
        typeof macAlertWatcherUiState === "function"
          ? macAlertWatcherUiState({
              ok: true,
              action: "status",
              running: false,
              processIds: [],
              server: "http://192.168.31.68:17888",
              message: "Mac alert watcher is not running.",
            }, { available: true, busy: false })
          : {};
      const previousWatcherCheckedAt = typeof state === "object" ? state.localMacAlertWatcherStatusCheckedAt || 0 : 0;
      if (typeof state === "object") state.localMacAlertWatcherStatusCheckedAt = 1000;
      const freshHeartbeatNoStale =
        typeof parseMacHeartbeatFreshness === "function"
          ? parseMacHeartbeatFreshness(
              [
                "MacHeartbeat=status=ok; checkedAt=2020-01-01T00:00:00.000Z; updatedAt=2020-01-01T00:00:00.000Z; ageMs=999999; boardUpdatedAt=2020-01-01T00:00:00.000Z",
                "MacHeartbeat=status=ok; checkedAt=2026-06-18T10:00:00.000Z; updatedAt=2026-06-18T09:59:55.000Z; ageMs=65000; boardUpdatedAt=2026-06-18T10:00:02.000Z",
              ].join("; "),
              Date.parse("2026-06-18T10:01:00.000Z"),
            )
          : null;
      const stableHeartbeatFreshnessAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "Windows resume: repo=clean board=ok mac=ready",
                "MacHeartbeat=node scripts/mac/check-mac-heartbeat.mjs --host 127.0.0.1 --port 43770 --checkBoard --boardSummary",
                "MacHeartbeatFreshness=stale checked=180s codex=303s board=49s checkedAt=2026-06-19T05:00:00.000Z",
              ].join("; "),
            )
          : null;
      const stableHeartbeatFreshnessDirect =
        typeof parseMacHeartbeatFreshness === "function"
          ? parseMacHeartbeatFreshness("MacHeartbeatFreshness=fresh checked=20s codex=164s board=49s checkedAt=2026-06-19T05:12:59.408Z")
          : null;
      const stableHeartbeatFreshnessEvidence =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              "Windows resume: repo=clean board=ok mac=ready; MacHeartbeatFreshness=fresh checked=20s codex=64s board=38s checkedAt=2026-06-19T05:12:59.408Z",
            )
          : null;
      const blockedHeartbeatWithFreshnessEvidence =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "MacHeartbeat=status=blocked; checkedAt=2026-06-19T05:12:59.408Z; blockers=mac-codex-stale warnings=none reason=mac-codex-stale",
                "MacHeartbeatFreshness=fresh checked=20s codex=360s board=38s checkedAt=2026-06-19T05:12:59.408Z",
              ].join("; "),
            )
          : null;
      const positiveMacHeartbeatHealthAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              "MacHeartbeatHealth=ok checked=20s reason=ok blockers=none warnings=none",
            )
          : null;
      const warningMacHeartbeatHealthAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              "MacHeartbeatHealth=warning checked=20s reason=mac-host-build-stale blockers=none warnings=none",
            )
          : null;
      const blockedMacHeartbeatHealthAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              "MacHeartbeatHealth=blocked checked=20s reason=mac-codex-stale blockers=none warnings=none",
            )
          : null;
      const warningMacPowerHealthAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              "MacPowerHealth=warning reason=system-sleep-enabled warnings=system-sleep-enabled,display-sleep-enabled blockers=none checkedAt=2026-06-19T08:08:38.575Z",
            )
          : null;
      const warningMacPowerHealthWithPlanAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              "MacPowerHealth=warning reason=system-sleep-enabled warnings=system-sleep-enabled,display-sleep-enabled blockers=none checkedAt=2026-06-19T08:08:38.575Z; MacPowerPlan=node scripts/mac/plan-mac-power-settings.mjs --profile all --sleep 0 --displaySleep 0 --networkWake on --boardSummary",
            )
          : null;
      const warningMacPowerHealthWithApplyAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              "MacPowerHealth=warning reason=system-sleep-enabled warnings=system-sleep-enabled,display-sleep-enabled blockers=none checkedAt=2026-06-19T08:08:38.575Z; MacPowerApply=node scripts/mac/apply-mac-power-settings.mjs --apply --confirmUserPresent --profile all --sleep 0 --displaySleep 0 --networkWake on --boardSummary",
            )
          : null;
      const okMacPowerHealthAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              "MacPowerHealth=ok reason=ok warnings=none blockers=none checkedAt=2026-06-19T08:08:38.575Z; MacPowerPlan=node scripts/mac/plan-mac-power-settings.mjs --profile all --sleep 0 --displaySleep 0 --networkWake on --boardSummary",
            )
          : null;
      const warningMacUnattendedHealthAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              "MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=launch-agent-not-loaded,power checkedAt=2026-06-19T08:10:38.575Z",
            )
          : null;
      const macLaunchAgentPlanAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              "MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=launch-agent-not-loaded checkedAt=2026-06-19T08:10:38.575Z; MacLaunchAgentPlan=node scripts/mac/install-mac-host-launch-agent.mjs --port 43770 --maxScreenFps 60 --boardSummary",
            )
          : null;
      const okMacUnattendedHealthAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              "MacUnattendedHealth=ok reason=ok blockers=none warnings=none checkedAt=2026-06-19T08:10:38.575Z",
            )
          : null;
      const cleanMacLaunchAgentPlanAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              "MacLaunchAgentPlan=node scripts/mac/install-mac-host-launch-agent.mjs --port 43770 --maxScreenFps 60 --boardSummary",
            )
          : null;
      const cleanMacPowerPlanCommandAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              "MacPowerPlan=node scripts/mac/plan-mac-power-settings.mjs --profile all --sleep 0 --displaySleep 0 --networkWake on --boardSummary",
            )
          : null;
      const cleanMacPowerApplyCommandAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              "MacPowerApply=node scripts/mac/apply-mac-power-settings.mjs --apply --confirmUserPresent --profile all --sleep 0 --displaySleep 0 --networkWake on --boardSummary",
            )
          : null;
      const watcherThrottleBefore =
        typeof shouldRefreshMacAlertWatcherStatus === "function"
          ? shouldRefreshMacAlertWatcherStatus(15999)
          : null;
      const watcherThrottleAtLimit =
        typeof shouldRefreshMacAlertWatcherStatus === "function"
          ? shouldRefreshMacAlertWatcherStatus(16000)
          : null;
      const watcherThrottleNoCache = (() => {
        if (typeof shouldRefreshMacAlertWatcherStatus !== "function" || typeof state !== "object") return null;
        state.localMacAlertWatcherStatusCheckedAt = 0;
        return shouldRefreshMacAlertWatcherStatus(2000);
      })();
      if (typeof state === "object") state.localMacAlertWatcherStatusCheckedAt = previousWatcherCheckedAt;
      const heartbeatCommandCheck = (() => {
        if (
          typeof state !== "object" ||
          typeof getMacHeartbeatCommands !== "function" ||
          typeof updateMacHeartbeatCommandButtons !== "function"
        ) {
          return { ok: false, reason: "missing heartbeat command helpers" };
        }
        const originalFindingText = state.localMacAlertWatcherFindingText || "";
        const originalStatusText = watcherStatus?.textContent || "";
        try {
          state.localMacAlertWatcherFindingText = macAlertFindingText;
          if (watcherStatus) watcherStatus.textContent = "Windows 浮窗提醒已开启。" + macAlertFindingText;
          const commands = getMacHeartbeatCommands();
          updateMacHeartbeatCommandButtons();
          const commandButtons = Array.from(document.querySelectorAll("[data-mac-heartbeat-command]"));
          const buttonTitles = Object.fromEntries(
            commandButtons.map((button) => [button.dataset.macHeartbeatCommand, button.title || ""]),
          );
          return {
            ok:
              commands.once === "node scripts/mac/watch-mac-heartbeat.mjs --once --sendStatus --boardSummary" &&
              commands.watch === "node scripts/mac/watch-mac-heartbeat.mjs --sendStatus --intervalMs 30000" &&
              commands.start?.includes("start-mac-heartbeat-watcher.mjs") &&
              commands.start?.includes("--intervalMs 30000") &&
              commands.status?.includes("start-mac-heartbeat-watcher.mjs --status") &&
              commands.stop?.includes("start-mac-heartbeat-watcher.mjs --stop") &&
              commandButtons.length === 5 &&
              commandButtons.every((button) => !button.disabled) &&
              buttonTitles.once?.includes("watch-mac-heartbeat.mjs --once") &&
              buttonTitles.start?.includes("start-mac-heartbeat-watcher.mjs"),
            commands,
            buttonTitles,
            disabled: commandButtons.map((button) => Boolean(button.disabled)),
          };
        } finally {
          state.localMacAlertWatcherFindingText = originalFindingText;
          if (watcherStatus) watcherStatus.textContent = originalStatusText;
          updateMacHeartbeatCommandButtons();
        }
      })();
      const cleanMacHostReadinessCommandAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "MacHeartbeat=status=ok warnings=none blockers=none",
                "MacHostReadiness=node scripts/mac/check-mac-host-readiness.mjs --host 127.0.0.1 --port 43770 --checkBoard --boardSummary",
              ].join("; "),
            )
          : null;
      const cleanMacHostMediaCommandAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "MacHeartbeat=status=ok warnings=none blockers=none",
                "MacHostMedia=node scripts/mac/check-mac-host-readiness.mjs --host 127.0.0.1 --port 43770 --checkBoard --probeMedia --probeMediaResourceSample --promptPassword --boardSummary",
              ].join("; "),
            )
          : null;
      const positiveMacValidationText = [
        "MacHostMedia 通过 passed=12/12 media=ok",
        "MacFormalLocalSmoke 通过：H.264 89 frames / 29.54 fps / maxGap 38ms，PCM 151 frames / 49.87 fps / maxGap 32ms，input-log 16/16 ack，injected=false",
        "blockers=none warnings=none",
      ].join("; ");
      const positiveMacValidationAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(positiveMacValidationText)
          : null;
      const positiveMacValidationView =
        typeof macAlertWatcherUiState === "function"
          ? macAlertWatcherUiState({
              ok: true,
              action: "status",
              running: true,
              processIds: [2468],
              server: "http://192.168.31.68:17888",
              lastAlert: {
                at: "2026-06-19 10:51:58",
                title: "Mac validation evidence",
                message: positiveMacValidationText,
                summary: positiveMacValidationText,
              },
              message: "Mac alert watcher is running.",
            }, { available: true, busy: false })
          : {};
      const positiveMacFormalE2eText = [
        "MacFormalE2E=status=ok readyToCall=true checklist=passed",
        "repo=ok board=ok macHost=ok h264=ok audio=ok clipboard=ok display=ok build=current",
        "blockers=none warnings=none",
      ].join("; ");
      const positiveMacFormalE2eAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(positiveMacFormalE2eText)
          : null;
      const positiveMacFormalE2eView =
        typeof macAlertWatcherUiState === "function"
          ? macAlertWatcherUiState({
              ok: true,
              action: "status",
              running: true,
              processIds: [2468],
              server: "http://192.168.31.68:17888",
              lastAlert: {
                at: "2026-06-19 11:05:00",
                title: "Mac formal E2E evidence",
                message: positiveMacFormalE2eText,
                summary: positiveMacFormalE2eText,
              },
              message: "Mac alert watcher is running.",
            }, { available: true, busy: false })
          : {};
      const positiveMacHeartbeatText = [
        "MacHeartbeat=status=ok; checkedAt=" + new Date(Date.now() - 30000).toISOString(),
        "device=Mac; codex=ok status=idle updatedAt=2026-06-19T03:09:35.367Z ageMs=30000",
        "macHost=online 127.0.0.1:43770 build=ed937a2 inputMode=log runtimeBuild=ed937a2 stale metadata only, hostRuntimeChanges=0",
        "macClient=online http://127.0.0.1:5188/; board=ok; blockers=none warnings=none reason=ok",
      ].join("; ");
      const positiveMacHeartbeatAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(positiveMacHeartbeatText)
          : null;
      const positiveMacHeartbeatView =
        typeof macAlertWatcherUiState === "function"
          ? macAlertWatcherUiState({
              ok: true,
              action: "status",
              running: true,
              processIds: [2468],
              server: "http://192.168.31.68:17888",
              lastAlert: {
                at: "2026-06-19 11:15:00",
                title: "Mac heartbeat evidence",
                message: positiveMacHeartbeatText,
                summary: positiveMacHeartbeatText,
              },
              message: "Mac alert watcher is running.",
            }, { available: true, busy: false })
          : {};
      const positiveMacClientStatusText = [
        "MacClientPage=status=online url=http://127.0.0.1:5188/ blockers=none warnings=none",
        "MacClientDiagnostics=status=ok probeClientServer=ok page=online blockers=none warnings=none",
      ].join("; ");
      const positiveMacClientStatusAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(positiveMacClientStatusText)
          : null;
      const positiveMacClientStatusView =
        typeof macAlertWatcherUiState === "function"
          ? macAlertWatcherUiState({
              ok: true,
              action: "status",
              running: true,
              processIds: [2468],
              server: "http://192.168.31.68:17888",
              lastAlert: {
                at: "2026-06-19 11:20:00",
                title: "Mac client status evidence",
                message: positiveMacClientStatusText,
                summary: positiveMacClientStatusText,
              },
              message: "Mac alert watcher is running.",
            }, { available: true, busy: false })
          : {};
      const positiveMacGenericEvidenceText = [
        "MacFormalE2E=status=ok readyToCall=true checklist=passed blockers=none warnings=none",
        "Evidence=MacClientPageOnline,MacClientDiagnosticsOk,MacHostMediaOk",
      ].join("; ");
      const positiveMacGenericEvidenceAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(positiveMacGenericEvidenceText)
          : null;
      const positiveMacGenericEvidenceView =
        typeof macAlertWatcherUiState === "function"
          ? macAlertWatcherUiState({
              ok: true,
              action: "status",
              running: true,
              processIds: [2468],
              server: "http://192.168.31.68:17888",
              lastAlert: {
                at: "2026-06-19 11:35:00",
                title: "Mac generic evidence",
                message: positiveMacGenericEvidenceText,
                summary: positiveMacGenericEvidenceText,
              },
              message: "Mac alert watcher is running.",
            }, { available: true, busy: false })
          : {};
      const positiveMacResumeEvidenceText = [
        "Windows resume: board=ok mac=ready blockers=none warnings=none",
        "MacEvidence=MacHostMediaOk,MacFormalLocalSmokeOk,MacClientPageOnline",
      ].join("; ");
      const positiveMacResumeEvidenceAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(positiveMacResumeEvidenceText)
          : null;
      const positiveMacResumeEvidenceView =
        typeof macAlertWatcherUiState === "function"
          ? macAlertWatcherUiState({
              ok: true,
              action: "status",
              running: true,
              processIds: [2468],
              server: "http://192.168.31.68:17888",
              lastAlert: {
                at: "2026-06-19 11:55:00",
                title: "Windows resume MacEvidence",
                message: positiveMacResumeEvidenceText,
                summary: positiveMacResumeEvidenceText,
              },
              message: "Mac alert watcher is running.",
            }, { available: true, busy: false })
          : {};
      const positiveMacStandaloneEvidenceText = [
        "Mac heartbeat watcher evidence refreshed: MacClientPageOnline MacClientDiagnosticsOk",
      ].join("; ");
      const positiveMacStandaloneEvidenceAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(positiveMacStandaloneEvidenceText)
          : null;
      const positiveMacStandaloneEvidenceView =
        typeof macAlertWatcherUiState === "function"
          ? macAlertWatcherUiState({
              ok: true,
              action: "status",
              running: true,
              processIds: [2468],
              server: "http://192.168.31.68:17888",
              lastAlert: {
                at: "2026-06-19 12:58:00",
                title: "Mac standalone evidence",
                message: positiveMacStandaloneEvidenceText,
                summary: positiveMacStandaloneEvidenceText,
              },
              message: "Mac alert watcher is running.",
            }, { available: true, busy: false })
          : {};
      const failedMacStandaloneEvidenceAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention("Mac diagnostics failed: MacHostMediaOk failed blockers=media")
          : null;
      const blockedHeartbeatRiskEvidenceAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              "MacHeartbeat=blocked reason=codex-reconnect-stuck evidence=正在重新连接 5/5 / stream disconnected before completion blockers=mac-codex-stale warnings=none",
            )
          : null;
      const cleanMacClientPageCommandAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "MacClientPage=node scripts/mac/start-mac-client.mjs --status --boardSummary",
                "Mac client page online blockers=none warnings=none",
              ].join("; "),
            )
          : null;
      const cleanMacClientDiagnosticsCommandAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "MacClientDiagnostics=node scripts/mac/check-mac-client-readiness.mjs --probeClientServer --checkBoard --boardSummary",
                "Mac client readiness ready blockers=none warnings=none",
              ].join("; "),
            )
          : null;
      const cleanMacClientBrowserSelfTestAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "MacClientBrowserSelfTest=node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs --boardSummary",
                "Mac client browser self-test ready blockers=none warnings=none",
              ].join("; "),
            )
          : null;
      const macUnattendedBrowserSelfTestAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "MacUnattendedStatus=attention warnings=launch-agent-missing,launch-agent-max-fps,power-risk blockers=none",
                "MacClientBrowserSelfTest=node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs --boardSummary",
              ].join("; "),
            )
          : null;
      const cleanMacClientPromptPasswordSmokeAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "MacClientPromptPasswordSmoke=node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --promptPassword --boardSummary",
                "Mac client prompt password smoke ready blockers=none warnings=none",
              ].join("; "),
            )
          : null;
      const macDiscoveryPromptPasswordSmokeAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "Windows host discovery: found 1; best=Windows 被控端 / windows / 192.168.31.68:43770",
                "MacClientDiscoverWindows=node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary",
                "MacClientPromptPasswordSmoke=node scripts/mac/run-mac-client-formal-smoke.mjs --host 192.168.31.68 --port 43770 --ensureClient --promptPassword --boardSummary",
              ].join("; "),
            )
          : null;
      const cleanMacScriptHelpAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "MacScriptHelp=node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary",
                "Mac script help ready blockers=none warnings=none",
              ].join("; "),
            )
          : null;
      const macScriptHelpOkStatusAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              "Mac script help: ok 148/148 commands across 74 scripts; timeout=10000ms. MacScriptHelpStatus=ok commands=148/148 scripts=74 timeoutMs=10000.",
            )
          : null;
      const macScriptHelpFailedStatusAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              "Mac script help: failed 1/148 across 74 scripts; timeout=10000ms. MacScriptHelpStatus=failed failures=1 commands=148 scripts=74 timeoutMs=10000.",
            )
          : null;
      const agentLinkPresenceFallbackAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              "presence 接口在当前板服务上仍 404，仍以 state.userPresence 为准；无密码/auth/input/inject。",
            )
          : null;
      const cleanMacHeartbeatCommandAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "MacHeartbeat=status=ok warnings=none blockers=none reason=ok",
                "MacHeartbeatRerun=node scripts/mac/check-mac-heartbeat.mjs --host 127.0.0.1 --port 43770 --checkBoard --boardSummary",
                "MacHeartbeatOnce=node scripts/mac/watch-mac-heartbeat.mjs --once --sendStatus --boardSummary",
                "MacHeartbeatWatch=node scripts/mac/watch-mac-heartbeat.mjs --sendStatus --intervalMs 30000",
                "MacHeartbeatStart=node scripts/mac/start-mac-heartbeat-watcher.mjs --host 127.0.0.1 --port 43770 --server http://192.168.31.68:17888 --intervalMs 30000 --boardSummary",
                "MacHeartbeatStatus=node scripts/mac/start-mac-heartbeat-watcher.mjs --status --host 127.0.0.1 --port 43770 --server http://192.168.31.68:17888 --boardSummary",
                "MacHeartbeatStop=node scripts/mac/start-mac-heartbeat-watcher.mjs --stop --host 127.0.0.1 --port 43770 --server http://192.168.31.68:17888 --boardSummary",
              ].join("; "),
            )
          : null;
      const macHeartbeatRerunAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "MacHeartbeat=status=blocked blockers=mac-codex-stale warnings=mac-host-build-stale reason=mac-codex-stale",
                "MacHeartbeatRerun=node scripts/mac/check-mac-heartbeat.mjs --host 127.0.0.1 --port 43770 --checkBoard --boardSummary",
              ].join("; "),
            )
          : null;
      const macHostMediaCommandAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "MacHeartbeat=status=warning warnings=mac-host-build-stale reason=ok restart recommended hostRuntimeChanges=1",
                "MacHostMedia=node scripts/mac/check-mac-host-readiness.mjs --host 127.0.0.1 --port 43770 --checkBoard --probeMedia --probeMediaResourceSample --promptPassword --boardSummary",
              ].join("; "),
            )
          : null;
      const macClientPageCommandAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "MacClientPage=node scripts/mac/start-mac-client.mjs --status --boardSummary",
                "Mac client page offline blockers=client-page warnings=local-server",
              ].join("; "),
            )
          : null;
      const macClientDiagnosticsCommandAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "MacClientDiagnostics=node scripts/mac/check-mac-client-readiness.mjs --probeClientServer --checkBoard --boardSummary",
                "Mac client readiness status=warning blockers=windows-host warnings=board",
              ].join("; "),
            )
          : null;
      const macFormalE2eBrowserSelfTestAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "MacFormalE2E=status=warning readyToCall=false blockers=mac-host-build-stale warnings=fps-limit",
                "MacClientBrowserSelfTest=node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs --boardSummary",
              ].join("; "),
            )
          : null;
      const macFormalE2eScriptHelpAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "MacFormalE2E=status=warning readyToCall=false blockers=mac-host-build-stale warnings=fps-limit",
                "MacScriptHelp=node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary",
              ].join("; "),
            )
          : null;
      const windowsClientPortsAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "Windows resume: repo=clean board=ok mac=ready",
                "WinClientPorts=occupied(5197,9337;stale-diagnostics)",
                "WinClientPortsNext=use --clientPort 5200 --debugPort 9340",
                "WinClientPortsOwners=5197:node.exe:61088,9337:msedge.exe:44488",
                "WinClientDiagnosticsAlt=node scripts/windows/test-windows-client-browser.mjs --clientPort 5200 --debugPort 9340 --diagnosticsOnly --boardSummary --timeoutMs 45000",
              ].join("; "),
            )
          : null;
      const cleanWindowsClientPortsAttention =
        typeof parseMacUnattendedAttention === "function"
          ? parseMacUnattendedAttention(
              [
                "Windows resume: repo=clean board=ok mac=ready",
                "WinClientPorts=free",
                "WinClientPortsNext=none",
                "WinClientPortsOwners=none",
              ].join("; "),
            )
          : null;
      const readinessHeaderLines =
        typeof readinessLines === "function"
          ? readinessLines({
              json: {
                args: {
                  profile: "deploy",
                  currentBuildId: "client-test",
                  maxVideoFrameAgeMs: 1000,
                  maxAudioFrameAgeMs: 750,
                  probeMedia: true,
                },
                board: {
                  requested: true,
                  ok: true,
                  currentCall: {
                    present: true,
                    active: true,
                    from: "Mac Codex",
                    need: "Windows Codex",
                    goal: "正式 Windows host 验收",
                    needsWindows: true,
                    fromMacSide: true,
                    command: "node scripts/mac/check-mac-client-formal-status.mjs --sendCall --secret should-not-render",
                  },
                },
                results: [
                  {
                    ok: true,
                    label: "Windows host video observation",
                    summary: "passed",
                    warnings: [],
                    errors: [],
                  },
                  {
                    ok: true,
                    label: "Windows host media aggregate",
                    summary: "Windows media: ok | target=127.0.0.1:43772 | No passwords in summary; no input/inject.",
                    details: {
                      summary: {
                        status: "ok",
                        passed: 2,
                        failed: 0,
                      },
                      video: {
                        observation: {
                          frameCount: 144,
                          fps: 57.33,
                          maxGapMs: 39,
                          maxFrameAgeMs: 2,
                        },
                      },
                      audio: {
                        observation: {
                          frameCount: 108,
                          fps: 50.2,
                          maxGapMs: 32,
                          maxFrameAgeMs: 10,
                          steady: {
                            fps: 50,
                          },
                        },
                      },
                    },
                    warnings: [],
                    errors: [],
                  },
                ],
              },
            })
          : [];
      const readinessHeaderText = readinessHeaderLines.join("\\n");
      const readinessSummaryText =
        typeof readinessSummary === "function"
          ? readinessSummary({
              json: {
                args: {
                  profile: "default",
                  probeMedia: true,
                },
                passed: 9,
                failed: 0,
                warnings: 1,
                results: [
                  {
                    ok: true,
                    label: "Windows host media aggregate",
                    details: {
                      summary: {
                        status: "ok",
                        passed: 2,
                        failed: 0,
                      },
                    },
                    warnings: [],
                    errors: [],
                  },
                ],
              },
            })
          : "";
      const helperResult = {
        json: {
          ok: true,
          probe: {
            url: "http://127.0.0.1:43770/discovery",
          },
          runtime: {
            processId: 2468,
            uptimeSeconds: 65,
            buildId: "helper-test",
          },
          capabilities: {
            screen: {
              capturePipeline: "windows-ffmpeg-gdigrab-h264",
              videoCodec: "h264",
              videoEncoding: "annexb-base64",
            },
            audio: {
              mode: "wasapi",
              backend: "wasapi",
              mockFrames: false,
              sampleRate: 48000,
              channels: 2,
            },
            input: {
              mode: "log",
              backend: "sendinput-helper",
              helper: true,
            },
            reverseControl: {
              supported: true,
              mode: "deny",
              requiresConfirmation: true,
              autoAccept: false,
              policy: {
                mode: "deny",
              },
              grant: {
                active: false,
                remainingMs: 0,
                oneTime: true,
                lastRequest: {
                  active: true,
                  status: "rejected_needs_grant",
                  requestId: "reverse-request-ui",
                  requester: "Mac client",
                  requestedAt: "2026-06-16T12:00:00.000Z",
                  updatedAt: "2026-06-16T12:00:00.000Z",
                  reason: "confirmation required",
                  ageMs: 23000,
                  expiresAt: "2026-06-16T12:02:00.000Z",
                },
              },
            },
            clipboard: {
              text: true,
              textMode: "system",
              file: true,
              fileMode: "clipboard",
            },
          },
          warnings: ["WGC fallback: demo"],
          board: {
            requested: true,
            ok: true,
            currentCall: {
              present: true,
              active: true,
              from: "Mac Codex",
              need: "Windows Codex",
              goal: "正式 Windows host 验收",
              needsWindows: true,
              fromMacSide: true,
              command: "node scripts/mac/check-mac-client-formal-status.mjs --sendCall --secret should-not-render",
            },
          },
          buildDiff: {
            changed: false,
            message: "No Windows host runtime source changes since old-build.",
          },
        },
      };
      const helperStatus =
        typeof normalizeLocalHostHelperStatus === "function"
          ? normalizeLocalHostHelperStatus(helperResult)
          : null;
      const helperSummary =
        typeof localHostHelperStatusSummary === "function"
          ? localHostHelperStatusSummary(helperStatus, { managedPid: "2468" })
          : "";
      const helperLinesText =
        typeof localHostHelperStatusLines === "function"
          ? localHostHelperStatusLines(helperResult).join("\\n")
          : "";
      const grantReverseText =
        typeof formatLocalHostReverseControlStatus === "function"
          ? formatLocalHostReverseControlStatus({
              supported: true,
              mode: "deny",
              requiresConfirmation: true,
              grant: {
                active: true,
                remainingMs: 30000,
                oneTime: true,
              },
            })
          : "";
      const offlineHelperLinesText =
        typeof localHostHelperStatusLines === "function"
          ? localHostHelperStatusLines({
              json: {
                ok: false,
                probe: {
                  host: "127.0.0.1",
                  port: 43770,
                },
                error: {
                  message: "connect ECONNREFUSED 127.0.0.1:43770",
                },
                board: {
                  requested: true,
                  ok: true,
                  currentCall: {
                    present: true,
                    active: false,
                    from: "Mac Codex",
                    need: "Windows Codex",
                    goal: "已完成的 Windows host 验收",
                    needsWindows: true,
                    fromMacSide: true,
                    command: "done command should-not-render",
                  },
                },
              },
            }).join("\\n")
          : "";

      return {
        ok:
          typeof getTauriInvoke === "function" &&
          typeof canUseDesktopHostControl === "function" &&
          typeof buildLocalHostReadinessRequest === "function" &&
          typeof buildLocalHostStatusRequest === "function" &&
          typeof buildMacAlertWatcherRequest === "function" &&
          typeof macAlertWatcherUiState === "function" &&
          typeof shouldRefreshMacAlertWatcherStatus === "function" &&
          typeof refreshMacAlertWatcherStatus === "function" &&
          typeof toggleMacAlertWatcher === "function" &&
          typeof normalizeLocalHostHelperStatus === "function" &&
          typeof localHostHelperStatusSummary === "function" &&
          typeof localHostHelperStatusLines === "function" &&
          typeof grantLocalHostReverseControl === "function" &&
          typeof maxNativeClipboardFileBytes === "number" &&
          typeof maxClipboardFileBytes === "number" &&
          typeof nativeClipboardChunkSizeBytes === "number" &&
          getTauriInvoke() === null &&
          canUseDesktopHostControl() === false &&
          badge?.textContent === "需桌面版" &&
          status?.textContent.includes("浏览器预览版") &&
          watcherBadge?.textContent === "需桌面版" &&
          watcherStatus?.textContent.includes("Windows 浮窗提醒") &&
          buttons.every((button) => button?.disabled) &&
          inputs.every((input) => input?.disabled) &&
          profileSelect?.value === "default" &&
          probeMediaToggle?.checked === false &&
          profileOptions.join(",") === "default,deploy,deep" &&
          defaultLaunchRequest.reverseControlMode === "deny" &&
          acceptLaunchRequest.reverseControlMode === "accept" &&
          readinessRequest.profile === "default" &&
          readinessRequest.probeMedia === false &&
          mediaReadinessRequest.probeMedia === true &&
          readinessRequest.checkBoard === true &&
          statusRequest.host === "127.0.0.1" &&
          statusRequest.port === readinessRequest.port &&
          statusRequest.checkBoard === true &&
          watcherRequest.server === "http://192.168.31.68:17888" &&
          watcherRunningView.running === true &&
          watcherRunningView.badgeText === "提醒中" &&
          watcherRunningView.toggleText === "停止提醒" &&
          watcherRunningView.statusText.includes("PID 1357") &&
          watcherRunningView.statusText.includes("192.168.31.68") &&
          watcherRunningView.statusText.includes("最近提醒") &&
          watcherRunningView.statusText.includes("MacUnattendedStatus=attention") &&
          watcherRunningView.statusText.includes("风险：") &&
          watcherRunningView.statusText.includes("用户不在") &&
          watcherRunningView.statusText.includes("只做无授权任务") &&
          userPresenceAwayAttention?.summary.includes("用户不在") &&
          userPresenceAwayAttention?.summary.includes("只做无授权任务") &&
          userPresenceAwayReachability?.status.includes("用户不在") &&
          userPresenceAwayReachability?.status.includes("只做无授权任务") &&
          watcherRunningView.statusText.includes("视频链路需检查") &&
          watcherRunningView.statusText.includes("运行版本需检查") &&
          watcherRunningView.statusText.includes("认证/密码步骤待确认") &&
          watcherRunningView.statusText.includes("Windows 被控端未指定或未就绪") &&
          watcherRunningView.statusText.includes("仓库状态需检查") &&
          watcherRunningView.statusText.includes("LaunchAgent 刷新率上限需调整") &&
          watcherRunningView.statusText.includes("Mac 心跳摘要过旧") &&
          watcherRunningView.statusText.includes("Mac 心跳过期") &&
          watcherRunningView.statusText.includes("Mac 后台心跳启动命令已提供") &&
          watcherRunningView.statusText.includes("Mac 后台心跳状态命令已提供") &&
          watcherRunningView.statusText.includes("Mac 后台心跳停止命令已提供") &&
          watcherRunningView.statusText.includes("Windows 安全认证路径已提供") &&
          watcherRunningView.statusText.includes("Mac host 不可达") &&
          watcherRunningView.statusText.includes("Mac/API 网络错误") &&
          watcherRunningView.statusText.includes("Mac Codex 可能卡在重新连接 5/5") &&
          watcherRunningView.statusText.includes("stream disconnected before completion") &&
          watcherRunningView.statusText.includes("请查看 Mac 窗口") &&
          watcherRunningView.statusText.includes("已进入手工体验清单") &&
          watcherRunningView.statusText.includes("复制诊断") &&
          watcherStoppedView.running === false &&
          watcherStoppedView.badgeText === "未开启" &&
          watcherStoppedView.toggleText === "开启提醒" &&
          watcherStoppedView.statusText.includes("未开启") &&
          watcherThrottleBefore === false &&
          watcherThrottleAtLimit === true &&
          watcherThrottleNoCache === true &&
          freshHeartbeatNoStale?.stale === false &&
          freshHeartbeatNoStale?.summary.includes("心跳检查 1 分钟前") &&
          stableHeartbeatFreshnessDirect?.present === true &&
          stableHeartbeatFreshnessDirect?.stale === false &&
          stableHeartbeatFreshnessDirect?.summary.includes("心跳检查 20 秒前") &&
          stableHeartbeatFreshnessDirect?.summary.includes("Mac Codex 3 分钟前") &&
          stableHeartbeatFreshnessAttention?.summary.includes("Mac 心跳摘要过旧") &&
          stableHeartbeatFreshnessAttention?.summary.includes("心跳检查 3 分钟前") &&
          stableHeartbeatFreshnessAttention?.summary.includes("Mac Codex 5 分钟前") &&
          Array.isArray(stableHeartbeatFreshnessEvidence?.evidenceLabels) &&
          stableHeartbeatFreshnessEvidence.evidenceLabels.length === 0 &&
          stableHeartbeatFreshnessEvidence?.evidenceSummary === "" &&
          blockedHeartbeatWithFreshnessEvidence?.summary.includes("Mac Codex 可能卡住") &&
          Array.isArray(blockedHeartbeatWithFreshnessEvidence?.evidenceLabels) &&
          !blockedHeartbeatWithFreshnessEvidence.evidenceLabels.includes("Mac 心跳正常") &&
          positiveMacHeartbeatHealthAttention?.summary === "" &&
          positiveMacHeartbeatHealthAttention?.evidenceSummary.includes("Mac 心跳正常") &&
          Array.isArray(positiveMacHeartbeatHealthAttention?.evidenceLabels) &&
          positiveMacHeartbeatHealthAttention.evidenceLabels.length === 1 &&
          warningMacHeartbeatHealthAttention?.summary.includes("Mac host 运行版本偏旧") &&
          !warningMacHeartbeatHealthAttention?.evidenceSummary.includes("Mac 心跳正常") &&
          blockedMacHeartbeatHealthAttention?.summary.includes("Mac Codex 长时间无新进展") &&
          !blockedMacHeartbeatHealthAttention?.evidenceSummary.includes("Mac 心跳正常") &&
          warningMacPowerHealthAttention?.summary.includes("系统睡眠未关闭") &&
          warningMacPowerHealthAttention?.summary.includes("显示器睡眠未关闭") &&
          warningMacPowerHealthWithPlanAttention?.summary.includes("系统睡眠未关闭") &&
          warningMacPowerHealthWithPlanAttention?.summary.includes("显示器睡眠未关闭") &&
          warningMacPowerHealthWithPlanAttention?.summary.includes("Mac 电源预案命令已提供") &&
          warningMacPowerHealthWithApplyAttention?.summary.includes("系统睡眠未关闭") &&
          warningMacPowerHealthWithApplyAttention?.summary.includes("显示器睡眠未关闭") &&
          warningMacPowerHealthWithApplyAttention?.summary.includes("Mac 电源授权执行命令已提供") &&
          okMacPowerHealthAttention?.summary === "" &&
          Array.isArray(okMacPowerHealthAttention?.labels) &&
          okMacPowerHealthAttention.labels.length === 0 &&
          warningMacUnattendedHealthAttention?.summary.includes("自启动未加载") &&
          warningMacUnattendedHealthAttention?.summary.includes("电源设置需检查") &&
          macLaunchAgentPlanAttention?.summary.includes("自启动未加载") &&
          macLaunchAgentPlanAttention?.summary.includes("Mac LaunchAgent 预案命令已提供") &&
          okMacUnattendedHealthAttention?.summary === "" &&
          Array.isArray(okMacUnattendedHealthAttention?.labels) &&
          okMacUnattendedHealthAttention.labels.length === 0 &&
          cleanMacLaunchAgentPlanAttention?.summary === "" &&
          Array.isArray(cleanMacLaunchAgentPlanAttention?.labels) &&
          cleanMacLaunchAgentPlanAttention.labels.length === 0 &&
          cleanMacPowerPlanCommandAttention?.summary === "" &&
          Array.isArray(cleanMacPowerPlanCommandAttention?.labels) &&
          cleanMacPowerPlanCommandAttention.labels.length === 0 &&
          cleanMacPowerApplyCommandAttention?.summary === "" &&
          Array.isArray(cleanMacPowerApplyCommandAttention?.labels) &&
          cleanMacPowerApplyCommandAttention.labels.length === 0 &&
          heartbeatCommandCheck.ok &&
          cleanMacHostReadinessCommandAttention?.summary === "" &&
          Array.isArray(cleanMacHostReadinessCommandAttention?.labels) &&
          cleanMacHostReadinessCommandAttention.labels.length === 0 &&
          cleanMacHostMediaCommandAttention?.summary === "" &&
          Array.isArray(cleanMacHostMediaCommandAttention?.labels) &&
          cleanMacHostMediaCommandAttention.labels.length === 0 &&
          postPassManualUxAttention?.summary === "" &&
          postPassManualUxAttention?.evidenceSummary.includes("已进入手工体验清单") &&
          postPassManualUxAttention?.evidenceSummary.includes("复制诊断") &&
          Array.isArray(postPassManualUxAttention?.evidenceLabels) &&
          postPassManualUxAttention.evidenceLabels.length === 1 &&
          postPassManualUxView.statusText.includes("证据：") &&
          postPassManualUxView.statusText.includes("已进入手工体验清单") &&
          postPassManualUxView.statusText.includes("复制诊断") &&
          !postPassManualUxView.statusText.includes("风险：") &&
          macRemoteAudioPlanAttention?.summary === "" &&
          macRemoteAudioPlanAttention?.evidenceSummary.includes("Mac 远端独占声音方案已提供") &&
          macRemoteAudioPlanAttention?.evidenceSummary.includes("当前不会自动静音 Mac 本机") &&
          macRemoteAudioPlanAttention?.evidenceSummary.includes("远端独占声音需用户明确同意") &&
          macRemoteAudioPlanAttention?.evidenceSummary.includes("不自动改系统音量") &&
          macRemoteAudioPlanAttention?.evidenceSummary.includes("恢复路径需先确认") &&
          Array.isArray(macRemoteAudioPlanAttention?.evidenceLabels) &&
          macRemoteAudioPlanAttention.evidenceLabels.length >= 4 &&
          macRemoteAudioPlanView.statusText.includes("证据：") &&
          macRemoteAudioPlanView.statusText.includes("Mac 远端独占声音方案已提供") &&
          macRemoteAudioPlanView.statusText.includes("当前不会自动静音 Mac 本机") &&
          macRemoteAudioPlanView.statusText.includes("远端独占声音需用户明确同意") &&
          macRemoteAudioPlanView.statusText.includes("不自动改系统音量") &&
          macRemoteAudioPlanView.statusText.includes("恢复路径需先确认") &&
          !macRemoteAudioPlanView.statusText.includes("风险：") &&
          macRemoteAudioStatusAttention?.summary.includes("Mac 本机仍会出声") &&
          macRemoteAudioStatusAttention?.summary.includes("远端独占声音未开启") &&
          macRemoteAudioStatusAttention?.summary.includes("远端独占声音需用户明确同意") &&
          Array.isArray(macRemoteAudioStatusAttention?.labels) &&
          macRemoteAudioStatusAttention.labels.length >= 3 &&
          macRemoteAudioStatusView.statusText.includes("风险：") &&
          macRemoteAudioStatusView.statusText.includes("Mac 本机仍会出声") &&
          macRemoteAudioStatusView.statusText.includes("远端独占声音未开启") &&
          macRemoteAudioStatusView.statusText.includes("远端独占声音需用户明确同意") &&
          macInputSafetyPlanAttention?.summary === "" &&
          macInputSafetyPlanAttention?.evidenceSummary.includes("Mac 真实输入安全方案已提供") &&
          macInputSafetyPlanAttention?.evidenceSummary.includes("默认输入模式保持安全日志") &&
          macInputSafetyPlanAttention?.evidenceSummary.includes("真实输入需用户正在看 Mac 屏幕") &&
          macInputSafetyPlanAttention?.evidenceSummary.includes("真实输入需 --confirmUserWatching") &&
          macInputSafetyPlanAttention?.evidenceSummary.includes("先用 safe 输入事件集") &&
          macInputSafetyPlanAttention?.evidenceSummary.includes("不发送输入事件或执行注入") &&
          Array.isArray(macInputSafetyPlanAttention?.evidenceLabels) &&
          macInputSafetyPlanAttention.evidenceLabels.length >= 6 &&
          macInputSafetyPlanView.statusText.includes("证据：") &&
          macInputSafetyPlanView.statusText.includes("Mac 真实输入安全方案已提供") &&
          macInputSafetyPlanView.statusText.includes("默认输入模式保持安全日志") &&
          macInputSafetyPlanView.statusText.includes("真实输入需用户正在看 Mac 屏幕") &&
          macInputSafetyPlanView.statusText.includes("真实输入需 --confirmUserWatching") &&
          macInputSafetyPlanView.statusText.includes("先用 safe 输入事件集") &&
          macInputSafetyPlanView.statusText.includes("不发送输入事件或执行注入") &&
          !macInputSafetyPlanView.statusText.includes("风险：") &&
          macHostAuthPathAttention?.summary === "" &&
          macHostAuthPathAttention?.evidenceSummary.includes("Mac host 需要前台输入连接密码") &&
          macHostAuthPathAttention?.evidenceSummary.includes("当前 Mac host 是一次性密码模式") &&
          macHostAuthPathAttention?.evidenceSummary.includes("Windows 控制页密码框填写同一个临时密码") &&
          macHostAuthPathAttention?.evidenceSummary.includes("先在 Mac 前台同密重启 60Hz host") &&
          macHostAuthPathAttention?.evidenceSummary.includes("不要把密码发到通讯板") &&
          macHostAuthPathBareAttention?.evidenceSummary.includes("不要把密码发到通讯板") &&
          macHostAuthPathBareAttention?.evidenceSummary.includes("Windows 控制页密码框填写同一个临时密码") &&
          Array.isArray(macHostAuthPathAttention?.evidenceLabels) &&
          macHostAuthPathAttention.evidenceLabels.length >= 5 &&
          macHostAuthPathView.statusText.includes("证据：") &&
          macHostAuthPathView.statusText.includes("Mac host 需要前台输入连接密码") &&
          macHostAuthPathView.statusText.includes("当前 Mac host 是一次性密码模式") &&
          macHostAuthPathView.statusText.includes("Windows 控制页密码框填写同一个临时密码") &&
          macHostAuthPathView.statusText.includes("先在 Mac 前台同密重启 60Hz host") &&
          macHostAuthPathView.statusText.includes("不要把密码发到通讯板") &&
          !macHostAuthPathView.statusText.includes("风险：") &&
          macClientPasswordLocationAttention?.summary === "" &&
          macClientPasswordLocationAttention?.evidenceSummary.includes("Mac client 密码输入位置已提示") &&
          macClientPasswordLocationAttention?.evidenceSummary.includes("Mac client 页面密码框填写 Windows 临时密码") &&
          macClientPasswordLocationAttention?.evidenceSummary.includes("终端隐藏输入只用于 formal/browser runner") &&
          macClientPasswordLocationAttention?.evidenceSummary.includes("不要把密码发到通讯板") &&
          Array.isArray(macClientPasswordLocationAttention?.evidenceLabels) &&
          macClientPasswordLocationAttention.evidenceLabels.length >= 4 &&
          macClientPasswordLocationView.statusText.includes("证据：") &&
          macClientPasswordLocationView.statusText.includes("Mac client 密码输入位置已提示") &&
          macClientPasswordLocationView.statusText.includes("Mac client 页面密码框填写 Windows 临时密码") &&
          macClientPasswordLocationView.statusText.includes("终端隐藏输入只用于 formal/browser runner") &&
          macClientPasswordLocationView.statusText.includes("不要把密码发到通讯板") &&
          !macClientPasswordLocationView.statusText.includes("风险：") &&
          positiveMacValidationAttention?.summary === "" &&
          Array.isArray(positiveMacValidationAttention?.labels) &&
          positiveMacValidationAttention.labels.length === 0 &&
          positiveMacValidationAttention?.evidenceSummary.includes("Mac 媒体基线已通过") &&
          positiveMacValidationAttention?.evidenceSummary.includes("Mac 本机短验收已通过") &&
          Array.isArray(positiveMacValidationAttention?.evidenceLabels) &&
          positiveMacValidationAttention.evidenceLabels.length === 2 &&
          positiveMacValidationView.statusText.includes("证据：") &&
          positiveMacValidationView.statusText.includes("Mac 媒体基线已通过") &&
          positiveMacValidationView.statusText.includes("Mac 本机短验收已通过") &&
          !positiveMacValidationView.statusText.includes("风险：") &&
          positiveMacFormalE2eAttention?.summary === "" &&
          Array.isArray(positiveMacFormalE2eAttention?.labels) &&
          positiveMacFormalE2eAttention.labels.length === 0 &&
          positiveMacFormalE2eAttention?.evidenceSummary.includes("Mac formal E2E 已就绪") &&
          Array.isArray(positiveMacFormalE2eAttention?.evidenceLabels) &&
          positiveMacFormalE2eAttention.evidenceLabels.length === 1 &&
          positiveMacFormalE2eView.statusText.includes("证据：") &&
          positiveMacFormalE2eView.statusText.includes("Mac formal E2E 已就绪") &&
          !positiveMacFormalE2eView.statusText.includes("风险：") &&
          positiveMacHeartbeatAttention?.summary === "" &&
          Array.isArray(positiveMacHeartbeatAttention?.labels) &&
          positiveMacHeartbeatAttention.labels.length === 0 &&
          positiveMacHeartbeatAttention?.evidenceSummary.includes("Mac 心跳正常") &&
          Array.isArray(positiveMacHeartbeatAttention?.evidenceLabels) &&
          positiveMacHeartbeatAttention.evidenceLabels.length === 1 &&
          positiveMacHeartbeatView.statusText.includes("证据：") &&
          positiveMacHeartbeatView.statusText.includes("Mac 心跳正常") &&
          !positiveMacHeartbeatView.statusText.includes("风险：") &&
          positiveMacClientStatusAttention?.summary === "" &&
          Array.isArray(positiveMacClientStatusAttention?.labels) &&
          positiveMacClientStatusAttention.labels.length === 0 &&
          positiveMacClientStatusAttention?.evidenceSummary.includes("Mac client 页面在线") &&
          positiveMacClientStatusAttention?.evidenceSummary.includes("Mac client 诊断已通过") &&
          Array.isArray(positiveMacClientStatusAttention?.evidenceLabels) &&
          positiveMacClientStatusAttention.evidenceLabels.length === 2 &&
          positiveMacClientStatusView.statusText.includes("证据：") &&
          positiveMacClientStatusView.statusText.includes("Mac client 页面在线") &&
          positiveMacClientStatusView.statusText.includes("Mac client 诊断已通过") &&
          !positiveMacClientStatusView.statusText.includes("风险：") &&
          positiveMacGenericEvidenceAttention?.summary === "" &&
          Array.isArray(positiveMacGenericEvidenceAttention?.labels) &&
          positiveMacGenericEvidenceAttention.labels.length === 0 &&
          positiveMacGenericEvidenceAttention?.evidenceSummary.includes("Mac formal E2E 已就绪") &&
          positiveMacGenericEvidenceAttention?.evidenceSummary.includes("Mac client 页面在线") &&
          positiveMacGenericEvidenceAttention?.evidenceSummary.includes("Mac client 诊断已通过") &&
          positiveMacGenericEvidenceAttention?.evidenceSummary.includes("Mac 媒体基线已通过") &&
          Array.isArray(positiveMacGenericEvidenceAttention?.evidenceLabels) &&
          positiveMacGenericEvidenceAttention.evidenceLabels.length === 4 &&
          positiveMacGenericEvidenceView.statusText.includes("证据：") &&
          positiveMacGenericEvidenceView.statusText.includes("Mac client 页面在线") &&
          positiveMacGenericEvidenceView.statusText.includes("Mac client 诊断已通过") &&
          positiveMacGenericEvidenceView.statusText.includes("Mac 媒体基线已通过") &&
          !positiveMacGenericEvidenceView.statusText.includes("风险：") &&
          positiveMacResumeEvidenceAttention?.summary === "" &&
          Array.isArray(positiveMacResumeEvidenceAttention?.labels) &&
          positiveMacResumeEvidenceAttention.labels.length === 0 &&
          positiveMacResumeEvidenceAttention?.evidenceSummary.includes("Mac 媒体基线已通过") &&
          positiveMacResumeEvidenceAttention?.evidenceSummary.includes("Mac 本机短验收已通过") &&
          positiveMacResumeEvidenceAttention?.evidenceSummary.includes("Mac client 页面在线") &&
          Array.isArray(positiveMacResumeEvidenceAttention?.evidenceLabels) &&
          positiveMacResumeEvidenceAttention.evidenceLabels.length === 3 &&
          positiveMacResumeEvidenceView.statusText.includes("证据：") &&
          positiveMacResumeEvidenceView.statusText.includes("Mac 媒体基线已通过") &&
          positiveMacResumeEvidenceView.statusText.includes("Mac 本机短验收已通过") &&
          positiveMacResumeEvidenceView.statusText.includes("Mac client 页面在线") &&
          !positiveMacResumeEvidenceView.statusText.includes("风险：") &&
          positiveMacStandaloneEvidenceAttention?.summary === "" &&
          Array.isArray(positiveMacStandaloneEvidenceAttention?.labels) &&
          positiveMacStandaloneEvidenceAttention.labels.length === 0 &&
          positiveMacStandaloneEvidenceAttention?.evidenceSummary.includes("Mac client 页面在线") &&
          positiveMacStandaloneEvidenceAttention?.evidenceSummary.includes("Mac client 诊断已通过") &&
          !positiveMacStandaloneEvidenceAttention?.evidenceSummary.includes("Mac 媒体基线已通过") &&
          Array.isArray(positiveMacStandaloneEvidenceAttention?.evidenceLabels) &&
          positiveMacStandaloneEvidenceAttention.evidenceLabels.length === 2 &&
          positiveMacStandaloneEvidenceView.statusText.includes("证据：") &&
          positiveMacStandaloneEvidenceView.statusText.includes("Mac client 页面在线") &&
          positiveMacStandaloneEvidenceView.statusText.includes("Mac client 诊断已通过") &&
          !positiveMacStandaloneEvidenceView.statusText.includes("Mac 媒体基线已通过") &&
          !positiveMacStandaloneEvidenceView.statusText.includes("风险：") &&
          failedMacStandaloneEvidenceAttention?.summary.includes("媒体基线需检查") &&
          !failedMacStandaloneEvidenceAttention?.evidenceSummary.includes("Mac 媒体基线已通过") &&
          blockedHeartbeatRiskEvidenceAttention?.summary.includes("Mac Codex 长时间无新进展") &&
          !blockedHeartbeatRiskEvidenceAttention?.evidenceSummary.includes("Mac 心跳正常") &&
          cleanMacClientPageCommandAttention?.summary === "" &&
          Array.isArray(cleanMacClientPageCommandAttention?.labels) &&
          cleanMacClientPageCommandAttention.labels.length === 0 &&
          cleanMacClientDiagnosticsCommandAttention?.summary === "" &&
          Array.isArray(cleanMacClientDiagnosticsCommandAttention?.labels) &&
          cleanMacClientDiagnosticsCommandAttention.labels.length === 0 &&
          cleanMacClientBrowserSelfTestAttention?.summary === "" &&
          Array.isArray(cleanMacClientBrowserSelfTestAttention?.labels) &&
          cleanMacClientBrowserSelfTestAttention.labels.length === 0 &&
          macUnattendedBrowserSelfTestAttention?.summary.includes("Mac client 本地 browser 自测命令已提供") &&
          cleanMacClientPromptPasswordSmokeAttention?.summary === "" &&
          Array.isArray(cleanMacClientPromptPasswordSmokeAttention?.labels) &&
          cleanMacClientPromptPasswordSmokeAttention.labels.length === 0 &&
          macDiscoveryPromptPasswordSmokeAttention?.summary.includes("Mac client 前台密码真测命令已提供") &&
          cleanMacScriptHelpAttention?.summary === "" &&
          Array.isArray(cleanMacScriptHelpAttention?.labels) &&
          cleanMacScriptHelpAttention.labels.length === 0 &&
          macScriptHelpOkStatusAttention?.summary === "" &&
          macScriptHelpOkStatusAttention?.evidenceSummary.includes("Mac 脚本 help 自检已通过") &&
          Array.isArray(macScriptHelpOkStatusAttention?.evidenceLabels) &&
          macScriptHelpOkStatusAttention.evidenceLabels.length === 1 &&
          macScriptHelpFailedStatusAttention?.summary.includes("Mac 脚本 help 自检失败") &&
          !macScriptHelpFailedStatusAttention?.evidenceSummary.includes("Mac 脚本 help 自检已通过") &&
          agentLinkPresenceFallbackAttention?.summary.includes("presence 接口未启用") &&
          agentLinkPresenceFallbackAttention?.evidenceSummary.includes("仍以 state.userPresence 为准") &&
          cleanMacHeartbeatCommandAttention?.summary === "" &&
          Array.isArray(cleanMacHeartbeatCommandAttention?.labels) &&
          cleanMacHeartbeatCommandAttention.labels.length === 0 &&
          macHeartbeatRerunAttention?.summary.includes("Mac 心跳复查命令已提供") &&
          macHostMediaCommandAttention?.summary.includes("Mac 媒体基线命令已提供") &&
          macClientPageCommandAttention?.summary.includes("Mac client 页面状态命令已提供") &&
          macClientDiagnosticsCommandAttention?.summary.includes("Mac client 诊断命令已提供") &&
          macFormalE2eBrowserSelfTestAttention?.summary.includes("Mac client 本地 browser 自测命令已提供") &&
          macFormalE2eScriptHelpAttention?.summary.includes("Mac 脚本 help 安全自检命令已提供") &&
          windowsClientPortsAttention?.summary.includes("Windows 控制端诊断端口被占用") &&
          windowsClientPortsAttention?.summary.includes("Windows 控制端备用诊断命令已提供") &&
          windowsClientPortsAttention?.summary.includes("Windows 控制端端口占用进程已提供") &&
          cleanWindowsClientPortsAttention?.summary === "" &&
          Array.isArray(cleanWindowsClientPortsAttention?.labels) &&
          cleanWindowsClientPortsAttention.labels.length === 0 &&
          readinessHeaderText.includes("client-test") &&
          readinessHeaderText.includes("1000 ms") &&
          readinessHeaderText.includes("750 ms") &&
          readinessHeaderText.includes("媒体基线：正常") &&
          readinessHeaderText.includes("视频 144 帧") &&
          readinessHeaderText.includes("音频 108 帧") &&
          readinessHeaderText.includes("Windows host video observation") &&
          readinessHeaderText.includes("Mac 正在请求 Windows 配合") &&
          !readinessHeaderText.includes("should-not-render") &&
          readinessSummaryText.includes("媒体基线正常") &&
          helperStatus?.runtime?.buildId === "helper-test" &&
          helperSummary.includes("PID 2468") &&
          helperSummary.includes("FFmpeg gdigrab H.264") &&
          helperSummary.includes("WASAPI") &&
          helperSummary.includes("反控 刚收到请求") &&
          grantReverseText.includes("临时允许 30 秒") &&
          helperSummary.includes("通讯板有 Mac→Windows 呼叫") &&
          helperLinesText.includes("状态助手") &&
          helperLinesText.includes("[CALL] 通讯板") &&
          helperLinesText.includes("正式 Windows host 验收") &&
          !helperLinesText.includes("should-not-render") &&
          helperLinesText.includes("build helper-test") &&
          helperLinesText.includes("反控：刚收到请求") &&
          helperLinesText.includes("反控请求：Mac client") &&
          helperLinesText.includes("临时允许反控") &&
          helperLinesText.includes("剪贴板") &&
          helperLinesText.includes("WGC fallback") &&
          offlineHelperLinesText.includes("离线") &&
          offlineHelperLinesText.includes("ECONNREFUSED") &&
          offlineHelperLinesText.includes("currentCall 已完成/非待办") &&
          !offlineHelperLinesText.includes("should-not-render") &&
          maxNativeClipboardFileBytes === maxClipboardFileBytes &&
          nativeClipboardChunkSizeBytes === 1024 * 1024,
        badge: badge?.textContent || "",
        status: status?.textContent || "",
        watcherBadge: watcherBadge?.textContent || "",
        watcherStatus: watcherStatus?.textContent || "",
        profile: profileSelect?.value || "",
        requestProfile: readinessRequest.profile || "",
        requestProbeMedia: readinessRequest.probeMedia,
        mediaRequestProbeMedia: mediaReadinessRequest.probeMedia,
        defaultLaunchRequest,
        acceptLaunchRequest,
        statusRequest,
        watcherRequest,
        watcherRunningView,
        watcherStoppedView,
        watcherThrottleBefore,
        watcherThrottleAtLimit,
        watcherThrottleNoCache,
        freshHeartbeatNoStale,
        stableHeartbeatFreshnessDirect,
        stableHeartbeatFreshnessAttention,
        stableHeartbeatFreshnessEvidence,
        blockedHeartbeatWithFreshnessEvidence,
        positiveMacHeartbeatHealthAttention,
        warningMacHeartbeatHealthAttention,
        blockedMacHeartbeatHealthAttention,
        warningMacPowerHealthAttention,
        warningMacPowerHealthWithPlanAttention,
        warningMacPowerHealthWithApplyAttention,
        okMacPowerHealthAttention,
        warningMacUnattendedHealthAttention,
        macLaunchAgentPlanAttention,
        okMacUnattendedHealthAttention,
        cleanMacLaunchAgentPlanAttention,
        cleanMacPowerPlanCommandAttention,
        cleanMacPowerApplyCommandAttention,
        heartbeatCommandCheck,
        cleanMacHostReadinessCommandAttention,
        cleanMacHostMediaCommandAttention,
        postPassManualUxAttention,
        postPassManualUxView,
        macRemoteAudioPlanAttention,
        macRemoteAudioPlanView,
        macInputSafetyPlanAttention,
        macInputSafetyPlanView,
        macHostAuthPathAttention,
        macHostAuthPathBareAttention,
        macHostAuthPathView,
        macClientPasswordLocationAttention,
        macClientPasswordLocationView,
        positiveMacValidationAttention,
        positiveMacValidationView,
        positiveMacFormalE2eAttention,
        positiveMacFormalE2eView,
        positiveMacHeartbeatAttention,
        positiveMacHeartbeatView,
        positiveMacClientStatusAttention,
        positiveMacClientStatusView,
        positiveMacGenericEvidenceAttention,
        positiveMacGenericEvidenceView,
        positiveMacStandaloneEvidenceAttention,
        positiveMacStandaloneEvidenceView,
        failedMacStandaloneEvidenceAttention,
        blockedHeartbeatRiskEvidenceAttention,
        cleanMacClientPageCommandAttention,
        cleanMacClientDiagnosticsCommandAttention,
        cleanMacClientBrowserSelfTestAttention,
        macUnattendedBrowserSelfTestAttention,
        cleanMacClientPromptPasswordSmokeAttention,
        macDiscoveryPromptPasswordSmokeAttention,
        cleanMacScriptHelpAttention,
        macScriptHelpOkStatusAttention,
        macScriptHelpFailedStatusAttention,
        agentLinkPresenceFallbackAttention,
        macHeartbeatRerunAttention,
        macHostMediaCommandAttention,
        macClientPageCommandAttention,
        macClientDiagnosticsCommandAttention,
        macFormalE2eBrowserSelfTestAttention,
        macFormalE2eScriptHelpAttention,
        windowsClientPortsAttention,
        cleanWindowsClientPortsAttention,
        readinessHeader: readinessHeaderLines.slice(0, 4),
        readinessSummaryText,
        helperSummary,
        helperLinesText,
        offlineHelperLinesText,
        buttonsDisabled: buttons.map((button) => Boolean(button?.disabled)),
        inputsDisabled: inputs.map((input) => Boolean(input?.disabled)),
        maxNativeClipboardFileBytes,
        maxClipboardFileBytes,
        nativeClipboardChunkSizeBytes,
      };
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`desktop-only host panel check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyFileClipboardRecoveryText(session) {
  const result = await evaluate(
    session,
    `(async () => {
      if (
        typeof fileClipboardRecoveryText !== "function" ||
        typeof fileClipboardLocalDetail !== "function" ||
        typeof describeOutgoingFileTransferStatus !== "function" ||
        typeof describeLastOutgoingFileTransferStatus !== "function" ||
        typeof describeIncomingFileTransferStatus !== "function" ||
        typeof expireStaleRemoteFileTransfers !== "function" ||
        typeof renderReceivedFiles !== "function" ||
        typeof openReceivedFilesTempPath !== "function" ||
        typeof updateReceivedFilesWriteStatusFromResult !== "function"
      ) {
        return { ok: false, reason: "missing file clipboard recovery helpers" };
      }
      if (typeof state !== "object" || typeof elements !== "object") {
        return { ok: false, reason: "missing app state" };
      }

      const tempResult = {
        clipboardWritten: false,
        saveMode: "temp",
        reason: "系统文件剪贴板写入失败",
        rootDir: "C:/Temp/lan-dual-control/clip-1",
        paths: ["C:/Temp/lan-dual-control/clip-1/001-demo.zip"],
      };
      const memoryResult = {
        clipboardWritten: false,
        saveMode: "memory-only",
        reason: "浏览器预览版只能保留内存托盘",
      };
      const recovery = fileClipboardRecoveryText(tempResult);
      const detail = fileClipboardLocalDetail(tempResult, "fallback");
      const memoryDetail = fileClipboardLocalDetail(memoryResult, "fallback");
      const outgoingStatus = describeOutgoingFileTransferStatus({
        fileCount: 1,
        sentBytes: 2048,
        totalBytes: 4096,
        startedAt: Date.now() - 2000,
        lastActivityAt: Date.now() - 1000,
        rateSamples: [
          { bytes: 2048, durationMs: 1000 },
          { bytes: 2048, durationMs: 1000 },
        ],
      });
      const openButton = document.querySelector("#openReceivedFilesTempButton");
      const copyButton = document.querySelector("#copyReceivedFilesButton");
      const clearButton = document.querySelector("#clearReceivedFilesButton");
      const status = document.querySelector("#receivedFilesStatus");

      const originalTauri = window.__TAURI__;
      const originalFiles = state.receivedClipboardFiles;
      const originalTempPath = state.receivedClipboardTempPath;
      const originalWriteStatus = state.receivedClipboardWriteStatus;
      const originalTransfers = state.remoteFileTransfers;
      const originalOutgoingTransfer = state.outgoingFileTransfer;
      const originalLastOutgoingTransfer = state.lastOutgoingFileTransfer;
      const originalFileTransferActive = state.fileTransferActive;
      const originalConnected = state.connected;
      const originalClient = state.client;
      const originalClipboardToggle = elements.clipboardToggle.checked;
      const originalHostDiagnostics = { ...(state.hostDiagnostics || {}) };
      const calls = [];
      const clipboardResponses = [];
      const clipboardProgress = [];
      const clipboardResults = [];
      const unsupportedSends = [];
      const nativeClipboardSends = [];
      const nativeClipboardInvokes = [];
      const nativeClipboardFailureInvokes = [];
      const failingSends = [];
      const retrySends = [];
      const originalNavigatorClipboard = navigator.clipboard;
      let navigatorClipboardOverridden = false;
      try {
        state.fileTransferActive = true;
        state.outgoingFileTransfer = {
          fileCount: 1,
          sentBytes: 2048,
          totalBytes: 4096,
          startedAt: Date.now() - 2000,
          lastActivityAt: Date.now() - 1000,
          rateSamples: [
            { bytes: 2048, durationMs: 1000 },
            { bytes: 2048, durationMs: 1000 },
          ],
        };
        if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
        const outgoingFloatingStatus = document.querySelector("#floatingClipboardStatus")?.textContent || "";
        state.fileTransferActive = false;
        state.outgoingFileTransfer = null;

        state.connected = false;
        elements.clipboardToggle.checked = true;
        elements.clipboardText.textContent = "剪贴板：待机";
        if (typeof syncFloatingControlStatus === "function") syncFloatingControlStatus();
        await syncClipboardBeforePaste();
        const pasteDisconnectedText = elements.clipboardText.textContent || "";
        const pasteDisconnectedFloating = document.querySelector("#floatingClipboardStatus")?.textContent || "";

        state.connected = true;
        elements.clipboardToggle.checked = false;
        elements.clipboardText.textContent = "剪贴板：已开启";
        if (typeof syncFloatingControlStatus === "function") syncFloatingControlStatus();
        await syncClipboardBeforePaste();
        const pasteDisabledText = elements.clipboardText.textContent || "";
        const pasteDisabledFloating = document.querySelector("#floatingClipboardStatus")?.textContent || "";
        elements.clipboardToggle.checked = true;

        const manualSendBlockedFile = new File([new Uint8Array([80, 75, 3, 4])], "manual-blocked.zip", {
          type: "application/zip",
        });
        state.connected = false;
        state.client = null;
        elements.clipboardToggle.checked = true;
        elements.clipboardText.textContent = "剪贴板：待机";
        if (typeof syncFloatingControlStatus === "function") syncFloatingControlStatus();
        await sendFilesToRemote([manualSendBlockedFile], { sourceLabel: "手动发送未连接测试" });
        const manualDisconnectedText = elements.clipboardText.textContent || "";
        const manualDisconnectedFloating = document.querySelector("#floatingClipboardStatus")?.textContent || "";

        state.connected = true;
        state.client = {
          sendClipboardFileOffer: () => {},
          sendClipboardFileChunk: () => {},
          sendClipboardFileComplete: () => {},
        };
        elements.clipboardToggle.checked = false;
        elements.clipboardText.textContent = "剪贴板：已开启";
        if (typeof syncFloatingControlStatus === "function") syncFloatingControlStatus();
        await sendFilesToRemote([manualSendBlockedFile], { sourceLabel: "手动发送关闭测试" });
        const manualDisabledText = elements.clipboardText.textContent || "";
        const manualDisabledFloating = document.querySelector("#floatingClipboardStatus")?.textContent || "";
        elements.clipboardToggle.checked = true;

        const nativeClipboardBytes = new Uint8Array([80, 75, 3, 4, 9]);
        const nativeClipboardBase64 = window.btoa(
          Array.from(nativeClipboardBytes, (byte) => String.fromCharCode(byte)).join(""),
        );
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            read: async () => [],
            readText: async () => "",
          },
        });
        navigatorClipboardOverridden = true;
        window.__TAURI__ = {
          core: {
            invoke: async (command, args = {}) => {
              nativeClipboardInvokes.push({ command, args });
              if (command === "begin_clipboard_file_read") {
                return {
                  transferId: "native-read-1",
                  fileCount: 1,
                  totalBytes: nativeClipboardBytes.length,
                  files: [
                    {
                      index: 0,
                      name: "native-demo.zip",
                      size: nativeClipboardBytes.length,
                      mimeType: "application/zip",
                      lastModified: 1710000000000,
                    },
                  ],
                };
              }
              if (command === "read_clipboard_file_chunk") {
                const payload = args.payload || {};
                const offset = Number(payload.offset || 0);
                const length = Number(payload.length || nativeClipboardBytes.length);
                const bytes = nativeClipboardBytes.slice(offset, Math.min(nativeClipboardBytes.length, offset + length));
                const dataBase64 = window.btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
                return {
                  transferId: payload.transferId,
                  fileIndex: payload.fileIndex,
                  offset,
                  bytes: bytes.length,
                  dataBase64,
                };
              }
              if (command === "cancel_clipboard_file_read") {
                return true;
              }
              throw new Error("unexpected native clipboard command " + command);
            },
          },
        };
        state.connected = true;
        elements.clipboardToggle.checked = true;
        state.hostDiagnostics = {
          ...(state.hostDiagnostics || {}),
          clipboardText: true,
          clipboardTextMode: "system",
          clipboardFile: true,
          clipboardFileMode: "system",
        };
        state.client = {
          sendClipboardFileOffer: (payload) => nativeClipboardSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => nativeClipboardSends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => nativeClipboardSends.push({ type: "complete", payload }),
        };
        await syncClipboardBeforePaste();
        const nativeClipboardOffer = nativeClipboardSends.find((item) => item.type === "offer")?.payload || {};
        const nativeClipboardChunk = nativeClipboardSends.find((item) => item.type === "chunk")?.payload || {};
        const nativeClipboardComplete = nativeClipboardSends.find((item) => item.type === "complete")?.payload || {};
        const nativeClipboardText = elements.clipboardText.textContent || "";
        const nativeClipboardCommands = nativeClipboardInvokes.map((item) => item.command);
        state.hostDiagnostics = { ...originalHostDiagnostics };

        window.__TAURI__ = {
          core: {
            invoke: async (command, args = {}) => {
              nativeClipboardFailureInvokes.push({ command, args });
              if (command === "begin_clipboard_file_read") {
                throw new Error("系统剪贴板里只有文件夹；当前先支持文件和压缩包，暂不递归发送文件夹。");
              }
              throw new Error("unexpected native clipboard failure command " + command);
            },
          },
        };
        state.connected = true;
        elements.clipboardToggle.checked = true;
        elements.clipboardText.textContent = "剪贴板：已开启";
        if (typeof syncFloatingControlStatus === "function") syncFloatingControlStatus();
        await syncClipboardBeforePaste();
        const nativeClipboardFailureText = elements.clipboardText.textContent || "";
        const nativeClipboardFailureFloating = document.querySelector("#floatingClipboardStatus")?.textContent || "";
        const nativeClipboardFailureCommands = nativeClipboardFailureInvokes.map((item) => item.command);

        const nativeClipboardAfterFailureSuccessSends = [];
        state.hostDiagnostics = {
          ...(state.hostDiagnostics || {}),
          clipboardText: true,
          clipboardTextMode: "system",
          clipboardFile: true,
          clipboardFileMode: "system",
        };
        state.client = {
          sendClipboardFileOffer: (payload) => nativeClipboardAfterFailureSuccessSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => nativeClipboardAfterFailureSuccessSends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => nativeClipboardAfterFailureSuccessSends.push({ type: "complete", payload }),
        };
        await sendFilesToRemote(
          [new File([new Uint8Array([80, 75, 3, 4])], "after-folder-failure.zip", { type: "application/zip" })],
          { sourceLabel: "文件剪贴板" },
        );
        const nativeClipboardAfterFailureSuccessText = elements.clipboardText.textContent || "";
        const nativeClipboardAfterFailureSuccessFloating =
          document.querySelector("#floatingClipboardStatus")?.textContent || "";
        const nativeClipboardAfterFailureSuccessSendCount = nativeClipboardAfterFailureSuccessSends.length;

        const unsupportedFile = new File([new Uint8Array([1, 2, 3, 4])], "unsupported.zip", { type: "application/zip" });
        state.connected = true;
        elements.clipboardToggle.checked = true;
        if (typeof updateHostDiagnostics === "function") {
          updateHostDiagnostics({
            clipboardText: true,
            clipboardTextMode: "system",
            clipboardFile: false,
            clipboardFileMode: "unsupported",
          });
        } else {
          state.hostDiagnostics = {
            ...(state.hostDiagnostics || {}),
            clipboardText: true,
            clipboardTextMode: "system",
            clipboardFile: false,
            clipboardFileMode: "unsupported",
          };
        }
        state.client = {
          sendClipboardFileOffer: (payload) => unsupportedSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => unsupportedSends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => unsupportedSends.push({ type: "complete", payload }),
        };
        await sendFilesToRemote([unsupportedFile], { sourceLabel: "能力拦截测试" });
        const unsupportedClipboardText = elements.clipboardText.textContent || "";
        const unsupportedSendCount = unsupportedSends.length;
        state.hostDiagnostics = { ...originalHostDiagnostics };

        const oversizeOutgoingSends = [];
        const oversizeOutgoingFile = {
          name: "too-large-local.zip",
          size: maxClipboardFileBytes + 1,
          type: "application/zip",
          lastModified: 1710000000000,
        };
        state.connected = true;
        elements.clipboardToggle.checked = true;
        state.hostDiagnostics = {
          ...(state.hostDiagnostics || {}),
          clipboardText: true,
          clipboardTextMode: "system",
          clipboardFile: true,
          clipboardFileMode: "system",
        };
        state.client = {
          sendClipboardFileOffer: (payload) => oversizeOutgoingSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => oversizeOutgoingSends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => oversizeOutgoingSends.push({ type: "complete", payload }),
        };
        elements.clipboardText.textContent = "剪贴板：已开启";
        if (typeof syncFloatingControlStatus === "function") syncFloatingControlStatus();
        await sendFilesToRemote([oversizeOutgoingFile], { sourceLabel: "文件过大测试" });
        const oversizeOutgoingText = elements.clipboardText.textContent || "";
        const oversizeOutgoingFloating = document.querySelector("#floatingClipboardStatus")?.textContent || "";
        const oversizeOutgoingSendCount = oversizeOutgoingSends.length;
        state.hostDiagnostics = { ...originalHostDiagnostics };

        const emptyOutgoingSends = [];
        state.connected = true;
        elements.clipboardToggle.checked = true;
        state.client = {
          sendClipboardFileOffer: (payload) => emptyOutgoingSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => emptyOutgoingSends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => emptyOutgoingSends.push({ type: "complete", payload }),
        };
        elements.clipboardText.textContent = "剪贴板：已开启";
        if (typeof syncFloatingControlStatus === "function") syncFloatingControlStatus();
        await sendFilesToRemote([], { sourceLabel: "未选择文件测试" });
        const emptyOutgoingText = elements.clipboardText.textContent || "";
        const emptyOutgoingFloating = document.querySelector("#floatingClipboardStatus")?.textContent || "";
        const emptyOutgoingSendCount = emptyOutgoingSends.length;

        const retryFileBytes = new Uint8Array(fileChunkSizeBytes + 2048);
        retryFileBytes.fill(65);
        const retryFile = new File([retryFileBytes], "retry-demo.zip", { type: "application/zip" });
        const retryDataTransfer = new DataTransfer();
        retryDataTransfer.items.add(retryFile);
        elements.fileClipboardInput.files = retryDataTransfer.files;
        state.connected = true;
        state.client = {
          sendClipboardFileOffer: (payload) => failingSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => {
            failingSends.push({ type: "chunk", payload });
            const chunkCount = failingSends.filter((item) => item.type === "chunk").length;
            if (chunkCount > 1) throw new Error("模拟断线");
          },
          sendClipboardFileComplete: (payload) => failingSends.push({ type: "complete", payload }),
        };
        await sendFilesToRemote([retryFile], { sourceLabel: "失败发送测试", clearFileInput: true });
        const failedClipboardText = elements.clipboardText.textContent || "";
        const lastOutgoingFailure = state.lastOutgoingFileTransfer || {};
        const lastOutgoingFailureStatus = describeLastOutgoingFileTransferStatus(lastOutgoingFailure);
        const floatingAfterSendFailure = formatFloatingClipboardStatus();
        const fileInputLengthAfterFailure = elements.fileClipboardInput.files?.length || 0;
        const chunkSendCount = failingSends.filter((item) => item.type === "chunk").length;
        const retrySentText = formatBytes(fileChunkSizeBytes);
        state.client = {
          sendClipboardFileOffer: (payload) => retrySends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => retrySends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => retrySends.push({ type: "complete", payload }),
        };
        elements.fileClipboardButton.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
        const retryOfferCount = retrySends.filter((item) => item.type === "offer").length;
        const retryChunkCount = retrySends.filter((item) => item.type === "chunk").length;
        const retryCompleteCount = retrySends.filter((item) => item.type === "complete").length;
        const retryClipboardText = elements.clipboardText.textContent || "";
        const fileInputLengthAfterRetry = elements.fileClipboardInput.files?.length || 0;
        state.remoteFileTransfers = new Map();
        state.client = {
          sendClipboardFileResponse: (payload) => clipboardResponses.push(payload),
          sendClipboardFileProgress: (payload) => clipboardProgress.push(payload),
          sendClipboardFileResult: (payload) => clipboardResults.push(payload),
        };
        elements.clipboardToggle.checked = true;
        handleClipboardFileOffer({
          type: "clipboard_file_offer",
          transferId: "live-transfer",
          fileCount: 1,
          totalBytes: 4,
          files: [
            {
              index: 0,
              name: "demo.txt",
              size: 4,
              mimeType: "text/plain",
            },
          ],
        });
        const offeredTransfer = state.remoteFileTransfers.get("live-transfer");
        if (offeredTransfer) {
          offeredTransfer.startedAt = Date.now() - 2000;
        }
        const statusVisibleAfterOffer = status && !status.hidden;
        const statusTextAfterOffer = status?.textContent || "";
        const statusClassAfterOffer = status?.className || "";
        const emptyTextAfterOffer = document.querySelector(".received-files-empty")?.textContent || "";
        handleClipboardFileChunk({
          type: "clipboard_file_chunk",
          transferId: "live-transfer",
          fileIndex: 0,
          fileName: "demo.txt",
          offset: 0,
          dataBase64: btoa("te"),
        });
        const statusVisibleAfterChunk = status && !status.hidden;
        const statusTextAfterChunk = status?.textContent || "";
        const statusClassAfterChunk = status?.className || "";
        const liveTransfer = state.remoteFileTransfers.get("live-transfer");
        const rateSampleAfterChunk = liveTransfer?.rateSamples?.[0] || {};
        const rateSampleCountAfterChunk = liveTransfer?.rateSamples?.length || 0;
        liveTransfer.lastActivityAt = Date.now() - remoteFileTransferStallTimeoutMs - 1000;
        const expiredCount = expireStaleRemoteFileTransfers(Date.now());
        const statusTextAfterTimeout = status?.textContent || "";
        const statusClassAfterTimeout = status?.className || "";
        const clipboardTextAfterTimeout = elements.clipboardText.textContent || "";
        const transferCountAfterTimeout = state.remoteFileTransfers.size;
        state.remoteFileTransfers.clear();
        handleClipboardFileOffer({
          type: "clipboard_file_offer",
          transferId: "too-large",
          fileCount: 1,
          totalBytes: maxClipboardFileBytes + 1,
          files: [
            {
              index: 0,
              name: "huge.zip",
              size: maxClipboardFileBytes + 1,
              mimeType: "application/zip",
            },
          ],
        });
        const statusTextAfterOversize = status?.textContent || "";
        const statusClassAfterOversize = status?.className || "";

        state.receivedClipboardFiles = [
          {
            name: "demo.zip",
            size: 3,
            mimeType: "application/zip",
            blob: new Blob(["zip"]),
            objectUrl: "",
          },
        ];
        state.receivedClipboardTempPath = tempResult.rootDir;
        updateReceivedFilesWriteStatusFromResult(tempResult, 1);
        window.__TAURI__ = {
          core: {
            invoke: async (command, payload) => {
              calls.push({ command, payload });
              return true;
            },
          },
        };
        renderReceivedFiles();
        const enabledAfterTempPath = openButton && !openButton.disabled;
        const retryTitleAfterFailure = copyButton?.title || "";
        const clearTitleAfterFailure = clearButton?.title || "";
        const statusTextAfterFailure = status?.textContent || "";
        const statusClassAfterFailure = status?.className || "";
        const statusHiddenAfterFailure = Boolean(status?.hidden);
        await openReceivedFilesTempPath();
        clearReceivedFiles();
        const clearedFilesLength = state.receivedClipboardFiles.length;
        const clearedTempPath = state.receivedClipboardTempPath;
        const clearButtonDisabledAfterClear = clearButton?.disabled === true;
        const openButtonDisabledAfterClear = openButton?.disabled === true;
        const statusHiddenAfterClear = Boolean(status?.hidden);
        const statusTextAfterClear = status?.textContent || "";
        const clearLogDetail = state.logEntries[0]?.detail || "";
        state.receivedClipboardFiles = [
          {
            name: "demo.zip",
            size: 3,
            mimeType: "application/zip",
            blob: new Blob(["zip"]),
            objectUrl: "",
          },
        ];
        state.receivedClipboardTempPath = "";
        updateReceivedFilesWriteStatusFromResult(
          {
            clipboardWritten: true,
            saveMode: "clipboard",
            fileCount: 1,
          },
          1,
        );
        renderReceivedFiles();
        const disabledWithoutTempPath = openButton?.disabled === true;
        const statusTextAfterSuccess = status?.textContent || "";

        return {
          ok:
            recovery === "临时目录：C:/Temp/lan-dual-control/clip-1" &&
            detail.includes("系统文件剪贴板写入失败") &&
            detail.includes("临时目录：C:/Temp/lan-dual-control/clip-1") &&
            memoryDetail === "浏览器预览版只能保留内存托盘" &&
            outgoingStatus.includes("正在发送 1 个文件") &&
            outgoingStatus.includes("2.0 KB/4.0 KB") &&
            outgoingStatus.includes("50%") &&
            outgoingStatus.includes("速度 2.0 KB/s") &&
            outgoingStatus.includes("剩余约 1 秒") &&
            outgoingFloatingStatus.includes("发送 1 个文件") &&
            outgoingFloatingStatus.includes("2.0 KB/4.0 KB") &&
            outgoingFloatingStatus.includes("速度 2.0 KB/s") &&
            pasteDisconnectedText.includes("请先连接被控端") &&
            pasteDisconnectedFloating.includes("请先连接被控端") &&
            pasteDisabledText.includes("已关闭") &&
            pasteDisabledFloating.includes("关闭") &&
            manualDisconnectedText.includes("请先连接被控端") &&
            manualDisconnectedFloating.includes("请先连接被控端") &&
            manualDisabledText.includes("已关闭") &&
            manualDisabledFloating.includes("关闭") &&
            nativeClipboardSends.filter((item) => item.type === "offer").length === 1 &&
            nativeClipboardSends.filter((item) => item.type === "chunk").length === 1 &&
            nativeClipboardSends.filter((item) => item.type === "complete").length === 1 &&
            nativeClipboardOffer.files?.[0]?.name === "native-demo.zip" &&
            nativeClipboardOffer.totalBytes === nativeClipboardBytes.length &&
            nativeClipboardChunk.bytes === nativeClipboardBytes.length &&
            nativeClipboardComplete.totalBytes === nativeClipboardBytes.length &&
            nativeClipboardCommands.includes("begin_clipboard_file_read") &&
            nativeClipboardCommands.includes("read_clipboard_file_chunk") &&
            nativeClipboardCommands.includes("cancel_clipboard_file_read") &&
            nativeClipboardText.includes("等待对端确认") &&
            nativeClipboardFailureCommands.includes("begin_clipboard_file_read") &&
            nativeClipboardFailureText.includes("系统剪贴板里只有文件夹") &&
            nativeClipboardFailureText.includes("暂不递归发送文件夹") &&
            nativeClipboardFailureFloating.includes("系统剪贴板里只有文件夹") &&
            nativeClipboardAfterFailureSuccessText.includes("等待对端确认") &&
            nativeClipboardAfterFailureSuccessFloating.includes("等待对端确认") &&
            nativeClipboardAfterFailureSuccessSendCount >= 3 &&
            unsupportedSendCount === 0 &&
            unsupportedClipboardText.includes("对端文件剪贴板不可用") &&
            unsupportedClipboardText.includes("文件/压缩包不能直接复制粘贴") &&
            oversizeOutgoingSendCount === 0 &&
            oversizeOutgoingText.includes("文件过大") &&
            oversizeOutgoingFloating.includes("文件过大") &&
            oversizeOutgoingFloating.includes("超过当前上限") &&
            emptyOutgoingSendCount === 0 &&
            emptyOutgoingText.includes("未选择文件") &&
            emptyOutgoingFloating.includes("未选择文件") &&
            failedClipboardText.includes("文件发送失败") &&
            failedClipboardText.includes("可重新发送") &&
            lastOutgoingFailure.status === "failed" &&
            lastOutgoingFailure.error === "模拟断线" &&
            lastOutgoingFailure.sentBytes === fileChunkSizeBytes &&
            lastOutgoingFailure.totalBytes === retryFile.size &&
            lastOutgoingFailureStatus.includes("发送失败") &&
            lastOutgoingFailureStatus.includes(retrySentText) &&
            lastOutgoingFailureStatus.includes("可重新发送") &&
            floatingAfterSendFailure.includes("发送失败") &&
            fileInputLengthAfterFailure === 1 &&
            chunkSendCount === 2 &&
            retryOfferCount === 1 &&
            retryChunkCount === 2 &&
            retryCompleteCount === 1 &&
            retryClipboardText.includes("文件已发送") &&
            retryClipboardText.includes("等待对端确认") &&
            fileInputLengthAfterRetry === 1 &&
            statusVisibleAfterOffer &&
            statusTextAfterOffer.includes("正在接收 1 个文件") &&
            statusTextAfterOffer.includes("0 B/4 B") &&
            statusClassAfterOffer.includes("is-busy") &&
            emptyTextAfterOffer.includes("Mac 复制文件") &&
            statusVisibleAfterChunk &&
            statusTextAfterChunk.includes("2 B/4 B") &&
            statusTextAfterChunk.includes("50%") &&
            statusTextAfterChunk.includes("速度 1 B/s") &&
            statusTextAfterChunk.includes("剩余约") &&
            rateSampleCountAfterChunk === 1 &&
            rateSampleAfterChunk.bytes === 2 &&
            rateSampleAfterChunk.durationMs > 0 &&
            statusClassAfterChunk.includes("is-busy") &&
            expiredCount === 1 &&
            statusTextAfterTimeout.includes("远端文件接收超时") &&
            statusTextAfterTimeout.includes("2 B/4 B") &&
            statusClassAfterTimeout.includes("is-warning") &&
            clipboardTextAfterTimeout.includes("远端文件接收中断") &&
            transferCountAfterTimeout === 0 &&
            statusTextAfterOversize.includes("超过当前上限") &&
            statusTextAfterOversize.includes("已拒绝接收") &&
            statusClassAfterOversize.includes("is-warning") &&
            clipboardResponses.some((payload) => payload.transferId === "live-transfer" && payload.accepted === true) &&
            clipboardResponses.some((payload) => payload.transferId === "too-large" && payload.accepted === false) &&
            clipboardProgress.some((payload) => payload.transferId === "live-transfer" && payload.receivedBytes === 2) &&
            clipboardResults.some(
              (payload) =>
                payload.transferId === "live-transfer" &&
                payload.accepted === false &&
                String(payload.reason || "").includes("接收超时") &&
                payload.receivedBytes === 2,
            ) &&
            enabledAfterTempPath &&
            disabledWithoutTempPath &&
            retryTitleAfterFailure === "重试写入系统文件剪贴板" &&
            clearTitleAfterFailure === "清空托盘（不删除系统剪贴板临时目录）" &&
            statusTextAfterFailure.includes("可打开临时目录或重试写入") &&
            statusClassAfterFailure.includes("is-warning") &&
            !statusHiddenAfterFailure &&
            statusTextAfterSuccess.includes("已写入 Windows 系统文件剪贴板") &&
            clearedFilesLength === 0 &&
            clearedTempPath === "" &&
            clearButtonDisabledAfterClear &&
            openButtonDisabledAfterClear &&
            statusHiddenAfterClear &&
            statusTextAfterClear === "" &&
            clearLogDetail.includes("系统剪贴板临时目录会保留") &&
            calls.length === 1 &&
            calls[0].command === "open_clipboard_temp_path" &&
            calls[0].payload?.path === tempResult.rootDir,
          recovery,
          detail,
          memoryDetail,
          pasteDisconnectedText,
          pasteDisconnectedFloating,
          pasteDisabledText,
          pasteDisabledFloating,
          manualDisconnectedText,
          manualDisconnectedFloating,
          manualDisabledText,
          manualDisabledFloating,
          nativeClipboardText,
          nativeClipboardCommands,
          nativeClipboardSends,
          nativeClipboardOffer,
          nativeClipboardChunk,
          nativeClipboardComplete,
          nativeClipboardFailureText,
          nativeClipboardFailureFloating,
          nativeClipboardFailureCommands,
          nativeClipboardAfterFailureSuccessText,
          nativeClipboardAfterFailureSuccessFloating,
          nativeClipboardAfterFailureSuccessSendCount,
          unsupportedClipboardText,
          unsupportedSendCount,
          unsupportedSends,
          oversizeOutgoingText,
          oversizeOutgoingFloating,
          oversizeOutgoingSendCount,
          emptyOutgoingText,
          emptyOutgoingFloating,
          emptyOutgoingSendCount,
          failedClipboardText,
          lastOutgoingFailure,
          lastOutgoingFailureStatus,
          floatingAfterSendFailure,
          fileInputLengthAfterFailure,
          chunkSendCount,
          retryOfferCount,
          retryChunkCount,
          retryCompleteCount,
          retryClipboardText,
          fileInputLengthAfterRetry,
          failingSends: failingSends.map((item) => ({
            type: item.type,
            bytes: item.payload?.bytes,
            offset: item.payload?.offset,
            totalBytes: item.payload?.totalBytes,
          })),
          statusTextAfterOffer,
          statusClassAfterOffer,
          statusTextAfterChunk,
          statusClassAfterChunk,
          expiredCount,
          statusTextAfterTimeout,
          statusClassAfterTimeout,
          clipboardTextAfterTimeout,
          transferCountAfterTimeout,
          statusTextAfterOversize,
          statusClassAfterOversize,
          clipboardResponses,
          clipboardProgress,
          clipboardResults,
          enabledAfterTempPath,
          disabledWithoutTempPath,
          retryTitleAfterFailure,
          clearTitleAfterFailure,
          statusTextAfterFailure,
          statusClassAfterFailure,
          statusTextAfterSuccess,
          clearedFilesLength,
          clearedTempPath,
          clearButtonDisabledAfterClear,
          openButtonDisabledAfterClear,
          statusHiddenAfterClear,
          statusTextAfterClear,
          clearLogDetail,
          calls,
        };
      } finally {
        if (typeof originalTauri === "undefined") {
          delete window.__TAURI__;
        } else {
          window.__TAURI__ = originalTauri;
        }
        if (navigatorClipboardOverridden) {
          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: originalNavigatorClipboard,
          });
        }
        state.receivedClipboardFiles = originalFiles;
        state.receivedClipboardTempPath = originalTempPath;
        state.receivedClipboardWriteStatus = originalWriteStatus;
        state.remoteFileTransfers = originalTransfers;
        state.outgoingFileTransfer = originalOutgoingTransfer;
        state.lastOutgoingFileTransfer = originalLastOutgoingTransfer;
        state.fileTransferActive = originalFileTransferActive;
        state.connected = originalConnected;
        state.client = originalClient;
        elements.clipboardToggle.checked = originalClipboardToggle;
        state.hostDiagnostics = originalHostDiagnostics;
        elements.fileClipboardInput.value = "";
        renderReceivedFiles();
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`file clipboard recovery text check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyOutgoingFileResultStatus(session) {
  const result = await evaluate(
    session,
    `(async () => {
      if (
        typeof handleClipboardFileResult !== "function" ||
        typeof handleClipboardFileResponse !== "function" ||
        typeof handleClipboardFileProgress !== "function" ||
        typeof formatFloatingClipboardStatus !== "function" ||
        typeof syncFloatingControlStatus !== "function" ||
        typeof sendFilesToRemote !== "function" ||
        typeof canRetryLastOutgoingFileTransfer !== "function" ||
        typeof updateFileClipboardButton !== "function" ||
        typeof expirePendingOutgoingFileResult !== "function"
      ) {
        return { ok: false, reason: "missing outgoing file result helpers" };
      }
      if (typeof state !== "object" || typeof elements !== "object") {
        return { ok: false, reason: "missing app state" };
      }

      const originalLastOutgoingTransfer = state.lastOutgoingFileTransfer;
      const originalConnected = state.connected;
      const originalClipboardToggle = elements.clipboardToggle.checked;
      const originalClient = state.client;
      const originalFileTransferActive = state.fileTransferActive;
      const originalOutgoingTransfer = state.outgoingFileTransfer;
      const offerRejectSends = [];
      const firstRemoteRejectSends = [];
      const remoteRejectRetrySends = [];
      const activeFailureSends = [];
      const progressKeepaliveSends = [];
      const pendingTimeoutSends = [];
      const pendingTimeoutRetrySends = [];
      try {
        state.connected = true;
        elements.clipboardToggle.checked = true;
        state.lastOutgoingFileTransfer = {
          transferId: "result-clipboard",
          status: "sent",
          fileCount: 2,
          sentBytes: 4096,
          totalBytes: 4096,
          files: [
            { index: 0, name: "a.txt", size: 2048 },
            { index: 1, name: "b.zip", size: 2048 },
          ],
        };
        handleClipboardFileResult({
          type: "clipboard_file_result",
          transferId: "result-clipboard",
          accepted: true,
          saveMode: "clipboard",
          fileCount: 2,
          receivedBytes: 4096,
          totalBytes: 4096,
          reason: "macOS 系统剪贴板已写入。",
        });
        const clipboardText = elements.clipboardText.textContent || "";
        const floatingClipboardText = formatFloatingClipboardStatus();

        state.lastOutgoingFileTransfer = {
          transferId: "result-temp",
          status: "sent",
          fileCount: 1,
          sentBytes: 2048,
          totalBytes: 2048,
          files: [{ index: 0, name: "temp.zip", size: 2048 }],
        };
        handleClipboardFileResult({
          type: "clipboard_file_result",
          transferId: "result-temp",
          accepted: true,
          saveMode: "temp",
          fileCount: 1,
          receivedBytes: 2048,
          totalBytes: 2048,
          reason: "系统文件剪贴板写入失败，已保存到临时目录。",
        });
        const tempText = elements.clipboardText.textContent || "";

        state.lastOutgoingFileTransfer = {
          transferId: "result-memory",
          status: "sent",
          fileCount: 1,
          sentBytes: 128,
          totalBytes: 128,
          files: [{ index: 0, name: "memory.txt", size: 128 }],
        };
        handleClipboardFileResult({
          type: "clipboard_file_result",
          transferId: "result-memory",
          accepted: true,
          saveMode: "memory-only",
          fileCount: 1,
          receivedBytes: 128,
          totalBytes: 128,
          reason: "浏览器预览版只能保留内存托盘。",
        });
        const memoryText = elements.clipboardText.textContent || "";

        state.lastOutgoingFileTransfer = {
          transferId: "result-failed",
          status: "sent",
          fileCount: 1,
          sentBytes: 4096,
          totalBytes: 4096,
          files: [{ index: 0, name: "failed.zip", size: 4096 }],
        };
        handleClipboardFileResult({
          type: "clipboard_file_result",
          transferId: "result-failed",
          accepted: false,
          fileCount: 1,
          receivedBytes: 2048,
          totalBytes: 4096,
          reason: "接收超时",
        });
        const failedText = elements.clipboardText.textContent || "";
        const resultState = state.lastOutgoingFileTransfer || {};

        const offerRejectBytes = new Uint8Array(fileChunkSizeBytes + 384);
        offerRejectBytes.fill(68);
        const offerRejectFile = new File([offerRejectBytes], "offer-reject.zip", { type: "application/zip" });
        const offerRejectDataTransfer = new DataTransfer();
        offerRejectDataTransfer.items.add(offerRejectFile);
        elements.fileClipboardInput.files = offerRejectDataTransfer.files;
        state.client = {
          sendClipboardFileOffer: (payload) => offerRejectSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => offerRejectSends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => offerRejectSends.push({ type: "complete", payload }),
        };
        await sendFilesToRemote([offerRejectFile], { sourceLabel: "文件清单拒绝测试", clearFileInput: true });
        const offerRejectTransferId = offerRejectSends.find((item) => item.type === "offer")?.payload?.transferId;
        handleClipboardFileResponse({
          type: "clipboard_file_response",
          transferId: offerRejectTransferId,
          accepted: false,
          code: "LAN011",
          reason: "对端文件剪贴板空间不足，拒绝文件清单",
        });
        updateFileClipboardButton();
        const offerRejectText = elements.clipboardText.textContent || "";
        const offerRejectFloating = formatFloatingClipboardStatus();
        const offerRejectState = state.lastOutgoingFileTransfer || {};
        const fileInputLengthAfterOfferReject = elements.fileClipboardInput.files?.length || 0;
        const canRetryAfterOfferReject = canRetryLastOutgoingFileTransfer();
        const buttonLabelAfterOfferReject = elements.fileClipboardButton.querySelector("span:not([aria-hidden])")?.textContent || "";

        const remoteRejectBytes = new Uint8Array(fileChunkSizeBytes + 512);
        remoteRejectBytes.fill(66);
        const remoteRejectFile = new File([remoteRejectBytes], "remote-reject.zip", { type: "application/zip" });
        const remoteRejectDataTransfer = new DataTransfer();
        remoteRejectDataTransfer.items.add(remoteRejectFile);
        elements.fileClipboardInput.files = remoteRejectDataTransfer.files;
        state.client = {
          sendClipboardFileOffer: (payload) => firstRemoteRejectSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => firstRemoteRejectSends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => firstRemoteRejectSends.push({ type: "complete", payload }),
        };
        await sendFilesToRemote([remoteRejectFile], { sourceLabel: "对端失败重试测试", clearFileInput: true });
        const sentTransferId = firstRemoteRejectSends.find((item) => item.type === "complete")?.payload?.transferId;
        handleClipboardFileResult({
          type: "clipboard_file_result",
          transferId: sentTransferId,
          accepted: false,
          fileCount: 1,
          receivedBytes: fileChunkSizeBytes,
          totalBytes: remoteRejectFile.size,
          reason: "对端写入系统剪贴板失败",
        });
        updateFileClipboardButton();
        const remoteFailureText = elements.clipboardText.textContent || "";
        const remoteFailureFloating = formatFloatingClipboardStatus();
        const remoteFailureState = state.lastOutgoingFileTransfer || {};
        const fileInputLengthAfterRemoteFailure = elements.fileClipboardInput.files?.length || 0;
        const canRetryAfterRemoteFailure = canRetryLastOutgoingFileTransfer();
        const buttonLabelAfterRemoteFailure = elements.fileClipboardButton.querySelector("span:not([aria-hidden])")?.textContent || "";
        const buttonTitleAfterRemoteFailure = elements.fileClipboardButton.title || "";

        state.client = {
          sendClipboardFileOffer: (payload) => remoteRejectRetrySends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => remoteRejectRetrySends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => remoteRejectRetrySends.push({ type: "complete", payload }),
        };
        elements.fileClipboardButton.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
        const remoteRejectRetryOfferCount = remoteRejectRetrySends.filter((item) => item.type === "offer").length;
        const remoteRejectRetryChunkCount = remoteRejectRetrySends.filter((item) => item.type === "chunk").length;
        const remoteRejectRetryCompleteCount = remoteRejectRetrySends.filter((item) => item.type === "complete").length;
        const retrySentTransferId = remoteRejectRetrySends.find((item) => item.type === "complete")?.payload?.transferId;
        handleClipboardFileResult({
          type: "clipboard_file_result",
          transferId: retrySentTransferId,
          accepted: true,
          saveMode: "clipboard",
          fileCount: 1,
          receivedBytes: remoteRejectFile.size,
          totalBytes: remoteRejectFile.size,
          reason: "重发后已写入系统文件剪贴板",
        });
        updateFileClipboardButton();
        const fileInputLengthAfterRemoteAccept = elements.fileClipboardInput.files?.length || 0;

        const activeFailureBytes = new Uint8Array(fileChunkSizeBytes + 768);
        activeFailureBytes.fill(69);
        const activeFailureFile = new File([activeFailureBytes], "active-failure.zip", { type: "application/zip" });
        const activeFailureDataTransfer = new DataTransfer();
        activeFailureDataTransfer.items.add(activeFailureFile);
        elements.fileClipboardInput.files = activeFailureDataTransfer.files;
        let activeFailureInjected = false;
        state.client = {
          sendClipboardFileOffer: (payload) => activeFailureSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => {
            activeFailureSends.push({ type: "chunk", payload });
            if (!activeFailureInjected) {
              activeFailureInjected = true;
              handleClipboardFileResult({
                type: "clipboard_file_result",
                transferId: payload.transferId,
                accepted: false,
                fileCount: 1,
                receivedBytes: payload.sentBytes,
                totalBytes: activeFailureFile.size,
                reason: "对端中途拒收",
              });
            }
          },
          sendClipboardFileComplete: (payload) => activeFailureSends.push({ type: "complete", payload }),
        };
        await sendFilesToRemote([activeFailureFile], { sourceLabel: "中途失败重试测试", clearFileInput: true });
        updateFileClipboardButton();
        const activeFailureOfferCount = activeFailureSends.filter((item) => item.type === "offer").length;
        const activeFailureChunkCount = activeFailureSends.filter((item) => item.type === "chunk").length;
        const activeFailureCompleteCount = activeFailureSends.filter((item) => item.type === "complete").length;
        const activeFailureText = elements.clipboardText.textContent || "";
        const activeFailureFloating = formatFloatingClipboardStatus();
        const activeFailureState = state.lastOutgoingFileTransfer || {};
        const activeFailureFileInputLength = elements.fileClipboardInput.files?.length || 0;
        const activeFailureCanRetry = canRetryLastOutgoingFileTransfer();
        const activeFailureButtonLabel = elements.fileClipboardButton.querySelector("span:not([aria-hidden])")?.textContent || "";

        const progressKeepaliveBytes = new Uint8Array(fileChunkSizeBytes + 640);
        progressKeepaliveBytes.fill(70);
        const progressKeepaliveFile = new File([progressKeepaliveBytes], "progress-keepalive.zip", { type: "application/zip" });
        const progressKeepaliveDataTransfer = new DataTransfer();
        progressKeepaliveDataTransfer.items.add(progressKeepaliveFile);
        elements.fileClipboardInput.files = progressKeepaliveDataTransfer.files;
        state.client = {
          sendClipboardFileOffer: (payload) => progressKeepaliveSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => progressKeepaliveSends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => progressKeepaliveSends.push({ type: "complete", payload }),
        };
        await sendFilesToRemote([progressKeepaliveFile], { sourceLabel: "对端进度保活测试", clearFileInput: true });
        const progressKeepaliveTransfer = state.lastOutgoingFileTransfer || {};
        const progressKeepaliveAt = Number(progressKeepaliveTransfer.completedAt || Date.now()) + Math.floor(remoteFileTransferStallTimeoutMs / 2);
        const originalDateNow = Date.now;
        Date.now = () => progressKeepaliveAt;
        try {
          handleClipboardFileProgress({
            type: "clipboard_file_progress",
            transferId: progressKeepaliveTransfer.transferId,
            receivedBytes: Math.floor(progressKeepaliveFile.size / 2),
            totalBytes: progressKeepaliveFile.size,
          });
        } finally {
          Date.now = originalDateNow;
        }
        const progressKeepaliveNoTimeoutCount = expirePendingOutgoingFileResult(progressKeepaliveAt + remoteFileTransferStallTimeoutMs - 1000);
        const progressKeepaliveText = elements.clipboardText.textContent || "";
        const progressKeepaliveState = state.lastOutgoingFileTransfer || {};
        const progressKeepaliveOfferCount = progressKeepaliveSends.filter((item) => item.type === "offer").length;
        const progressKeepaliveChunkCount = progressKeepaliveSends.filter((item) => item.type === "chunk").length;
        const progressKeepaliveCompleteCount = progressKeepaliveSends.filter((item) => item.type === "complete").length;

        const pendingBytes = new Uint8Array(fileChunkSizeBytes + 256);
        pendingBytes.fill(67);
        const pendingFile = new File([pendingBytes], "pending-timeout.zip", { type: "application/zip" });
        const pendingDataTransfer = new DataTransfer();
        pendingDataTransfer.items.add(pendingFile);
        elements.fileClipboardInput.files = pendingDataTransfer.files;
        state.client = {
          sendClipboardFileOffer: (payload) => pendingTimeoutSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => pendingTimeoutSends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => pendingTimeoutSends.push({ type: "complete", payload }),
        };
        await sendFilesToRemote([pendingFile], { sourceLabel: "对端确认超时测试", clearFileInput: true });
        const pendingBeforeTimeout = state.lastOutgoingFileTransfer || {};
        const expiredPendingCount = expirePendingOutgoingFileResult(
          Number(pendingBeforeTimeout.completedAt || Date.now()) + remoteFileTransferStallTimeoutMs + 1000,
        );
        updateFileClipboardButton();
        const pendingTimeoutText = elements.clipboardText.textContent || "";
        const pendingTimeoutFloating = formatFloatingClipboardStatus();
        const pendingTimeoutState = state.lastOutgoingFileTransfer || {};
        const canRetryAfterPendingTimeout = canRetryLastOutgoingFileTransfer();
        const fileInputLengthAfterPendingTimeout = elements.fileClipboardInput.files?.length || 0;
        const buttonLabelAfterPendingTimeout = elements.fileClipboardButton.querySelector("span:not([aria-hidden])")?.textContent || "";

        let injectedStaleResultDuringActiveRetry = false;
        let staleResultDuringActiveReturn;
        let staleResultDuringActiveState = {};
        let staleResultDuringActiveText = "";
        let staleResultDuringActiveCurrentId = "";
        state.client = {
          sendClipboardFileOffer: (payload) => pendingTimeoutRetrySends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => {
            pendingTimeoutRetrySends.push({ type: "chunk", payload });
            if (!injectedStaleResultDuringActiveRetry) {
              injectedStaleResultDuringActiveRetry = true;
              staleResultDuringActiveCurrentId = state.outgoingFileTransfer?.transferId || "";
              staleResultDuringActiveReturn = handleClipboardFileResult({
                transferId: pendingBeforeTimeout.transferId,
                accepted: true,
                saveMode: "clipboard",
                fileCount: 1,
                totalBytes: pendingFile.size,
                reason: "old result during active retry",
              });
              staleResultDuringActiveState = state.lastOutgoingFileTransfer || {};
              staleResultDuringActiveText = elements.clipboardText.textContent || "";
            }
          },
          sendClipboardFileComplete: (payload) => pendingTimeoutRetrySends.push({ type: "complete", payload }),
        };
        elements.fileClipboardButton.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
        const pendingTimeoutRetryOfferCount = pendingTimeoutRetrySends.filter((item) => item.type === "offer").length;
        const pendingTimeoutRetryChunkCount = pendingTimeoutRetrySends.filter((item) => item.type === "chunk").length;
        const pendingTimeoutRetryCompleteCount = pendingTimeoutRetrySends.filter((item) => item.type === "complete").length;
        const pendingTimeoutRetryTransferId = pendingTimeoutRetrySends.find((item) => item.type === "complete")?.payload?.transferId;
        const staleLateResultReturn = handleClipboardFileResult({
          transferId: pendingBeforeTimeout.transferId,
          accepted: true,
          saveMode: "clipboard",
          fileCount: 1,
          totalBytes: pendingFile.size,
          reason: "old transfer accepted late",
        });
        const staleLateResultState = state.lastOutgoingFileTransfer || {};
        const staleLateResultText = elements.clipboardText.textContent || "";
        handleClipboardFileProgress({
          type: "clipboard_file_progress",
          transferId: pendingBeforeTimeout.transferId,
          receivedBytes: pendingFile.size,
          totalBytes: pendingFile.size,
        });
        const staleLateProgressState = state.lastOutgoingFileTransfer || {};
        const staleLateProgressText = elements.clipboardText.textContent || "";
        const textBeforeStaleResponse = elements.clipboardText.textContent || "";
        handleClipboardFileResponse({
          type: "clipboard_file_response",
          transferId: pendingBeforeTimeout.transferId,
          accepted: true,
        });
        const staleLateAcceptResponseState = state.lastOutgoingFileTransfer || {};
        const staleLateAcceptResponseText = elements.clipboardText.textContent || "";
        handleClipboardFileResponse({
          type: "clipboard_file_response",
          transferId: pendingBeforeTimeout.transferId,
          accepted: false,
          reason: "old offer rejected late",
        });
        const staleLateRejectResponseState = state.lastOutgoingFileTransfer || {};
        const staleLateRejectResponseText = elements.clipboardText.textContent || "";

        return {
          ok:
            clipboardText.includes("对端已接收并写入系统文件剪贴板") &&
            clipboardText.includes("2 个文件") &&
            clipboardText.includes("4.0 KB") &&
            floatingClipboardText.includes("系统文件剪贴板") &&
            tempText.includes("临时目录") &&
            tempText.includes("2.0 KB") &&
            memoryText.includes("远端托盘") &&
            failedText.includes("对端文件接收失败") &&
            failedText.includes("2.0 KB/4.0 KB") &&
            failedText.includes("接收超时") &&
            resultState.status === "remote-result" &&
            resultState.accepted === false &&
            offerRejectText.includes("对端文件接收失败") &&
            offerRejectText.includes("可重新发送") &&
            offerRejectText.includes("文件剪贴板空间不足") &&
            offerRejectFloating.includes("可重新发送") &&
            offerRejectState.status === "remote-result" &&
            offerRejectState.accepted === false &&
            offerRejectState.canRetry === true &&
            fileInputLengthAfterOfferReject === 1 &&
            canRetryAfterOfferReject === true &&
            buttonLabelAfterOfferReject === "重新发送" &&
            remoteFailureText.includes("对端文件接收失败") &&
            remoteFailureText.includes("可重新发送") &&
            remoteFailureFloating.includes("可重新发送") &&
            remoteFailureState.status === "remote-result" &&
            remoteFailureState.accepted === false &&
            remoteFailureState.canRetry === true &&
            fileInputLengthAfterRemoteFailure === 1 &&
            canRetryAfterRemoteFailure === true &&
            buttonLabelAfterRemoteFailure === "重新发送" &&
            buttonTitleAfterRemoteFailure.includes("重新发送") &&
            remoteRejectRetryOfferCount === 1 &&
            remoteRejectRetryChunkCount === 2 &&
            remoteRejectRetryCompleteCount === 1 &&
            fileInputLengthAfterRemoteAccept === 0 &&
            activeFailureOfferCount === 1 &&
            activeFailureChunkCount === 1 &&
            activeFailureCompleteCount === 0 &&
            activeFailureText.includes("对端文件接收失败") &&
            activeFailureText.includes("可重新发送") &&
            activeFailureText.includes("对端中途拒收") &&
            activeFailureFloating.includes("可重新发送") &&
            activeFailureState.transferId &&
            activeFailureState.status === "remote-result" &&
            activeFailureState.accepted === false &&
            activeFailureState.canRetry === true &&
            activeFailureState.files?.[0]?.name === "active-failure.zip" &&
            activeFailureFileInputLength === 1 &&
            activeFailureCanRetry === true &&
            activeFailureButtonLabel === "重新发送" &&
            progressKeepaliveOfferCount === 1 &&
            progressKeepaliveChunkCount === 2 &&
            progressKeepaliveCompleteCount === 1 &&
            progressKeepaliveNoTimeoutCount === 0 &&
            progressKeepaliveText.includes("对端接收") &&
            !progressKeepaliveText.includes("对端确认超时") &&
            progressKeepaliveState.transferId === progressKeepaliveTransfer.transferId &&
            progressKeepaliveState.status === "sent" &&
            progressKeepaliveState.lastActivityAt === progressKeepaliveAt &&
            expiredPendingCount === 1 &&
            pendingTimeoutText.includes("对端确认超时") &&
            pendingTimeoutText.includes("可重新发送") &&
            pendingTimeoutFloating.includes("对端确认超时") &&
            pendingTimeoutState.status === "remote-result" &&
            pendingTimeoutState.accepted === false &&
            pendingTimeoutState.canRetry === true &&
            canRetryAfterPendingTimeout === true &&
            fileInputLengthAfterPendingTimeout === 1 &&
            buttonLabelAfterPendingTimeout === "重新发送" &&
            pendingTimeoutRetryOfferCount === 1 &&
            pendingTimeoutRetryChunkCount === 2 &&
            pendingTimeoutRetryCompleteCount === 1 &&
            staleResultDuringActiveReturn === false &&
            staleResultDuringActiveCurrentId === pendingTimeoutRetryTransferId &&
            !staleResultDuringActiveState.transferId &&
            !staleResultDuringActiveText.includes("old result during active retry") &&
            staleLateResultReturn === false &&
            staleLateResultState.transferId === pendingTimeoutRetryTransferId &&
            staleLateResultState.status === "sent" &&
            !staleLateResultText.includes("old transfer accepted late") &&
            staleLateProgressState.transferId === pendingTimeoutRetryTransferId &&
            staleLateProgressState.status === "sent" &&
            !staleLateProgressText.includes("对端接收 100%") &&
            staleLateAcceptResponseState.transferId === pendingTimeoutRetryTransferId &&
            staleLateAcceptResponseState.status === "sent" &&
            staleLateAcceptResponseText === textBeforeStaleResponse &&
            !staleLateAcceptResponseText.includes("对端已准备接收文件") &&
            staleLateRejectResponseState.transferId === pendingTimeoutRetryTransferId &&
            staleLateRejectResponseState.status === "sent" &&
            staleLateRejectResponseText === textBeforeStaleResponse &&
            !staleLateRejectResponseText.includes("old offer rejected late"),
          clipboardText,
          floatingClipboardText,
          tempText,
          memoryText,
          failedText,
          resultState,
          offerRejectText,
          offerRejectFloating,
          offerRejectState,
          fileInputLengthAfterOfferReject,
          canRetryAfterOfferReject,
          buttonLabelAfterOfferReject,
          remoteFailureText,
          remoteFailureFloating,
          remoteFailureState,
          fileInputLengthAfterRemoteFailure,
          canRetryAfterRemoteFailure,
          buttonLabelAfterRemoteFailure,
          buttonTitleAfterRemoteFailure,
          remoteRejectRetryOfferCount,
          remoteRejectRetryChunkCount,
          remoteRejectRetryCompleteCount,
          fileInputLengthAfterRemoteAccept,
          activeFailureOfferCount,
          activeFailureChunkCount,
          activeFailureCompleteCount,
          activeFailureText,
          activeFailureFloating,
          activeFailureState,
          activeFailureFileInputLength,
          activeFailureCanRetry,
          activeFailureButtonLabel,
          progressKeepaliveOfferCount,
          progressKeepaliveChunkCount,
          progressKeepaliveCompleteCount,
          progressKeepaliveNoTimeoutCount,
          progressKeepaliveText,
          progressKeepaliveState,
          progressKeepaliveAt,
          expiredPendingCount,
          pendingTimeoutText,
          pendingTimeoutFloating,
          pendingTimeoutState,
          canRetryAfterPendingTimeout,
          fileInputLengthAfterPendingTimeout,
          buttonLabelAfterPendingTimeout,
          pendingTimeoutRetryOfferCount,
          pendingTimeoutRetryChunkCount,
          pendingTimeoutRetryCompleteCount,
          pendingTimeoutRetryTransferId,
          staleResultDuringActiveReturn,
          staleResultDuringActiveCurrentId,
          staleResultDuringActiveState,
          staleResultDuringActiveText,
          staleLateResultReturn,
          staleLateResultState,
          staleLateResultText,
          staleLateProgressState,
          staleLateProgressText,
          textBeforeStaleResponse,
          staleLateAcceptResponseState,
          staleLateAcceptResponseText,
          staleLateRejectResponseState,
          staleLateRejectResponseText,
        };
      } finally {
        state.lastOutgoingFileTransfer = originalLastOutgoingTransfer;
        state.connected = originalConnected;
        elements.clipboardToggle.checked = originalClipboardToggle;
        state.client = originalClient;
        state.fileTransferActive = originalFileTransferActive;
        state.outgoingFileTransfer = originalOutgoingTransfer;
        elements.fileClipboardInput.value = "";
        updateFileClipboardButton();
        syncFloatingControlStatus();
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`outgoing file result status check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyFileClipboardIntegrityGuards(session) {
  const result = await evaluate(
    session,
    `(() => {
      if (
        typeof handleClipboardFileOffer !== "function" ||
        typeof handleClipboardFileChunk !== "function" ||
        typeof renderReceivedFiles !== "function"
      ) {
        return { ok: false, reason: "missing file clipboard handlers" };
      }
      if (typeof state !== "object" || typeof elements !== "object") {
        return { ok: false, reason: "missing app state" };
      }

      const originalTransfers = state.remoteFileTransfers;
      const originalFiles = state.receivedClipboardFiles;
      const originalWriteStatus = state.receivedClipboardWriteStatus;
      const originalClipboardToggle = elements.clipboardToggle.checked;
      const originalClient = state.client;
      const clipboardResponses = [];
      const clipboardResults = [];
      const status = document.querySelector("#receivedFilesStatus");

      function offer(transferId, files = [{ index: 0, name: "demo.txt", size: 4, mimeType: "text/plain" }]) {
        handleClipboardFileOffer({
          type: "clipboard_file_offer",
          transferId,
          fileCount: files.length,
          totalBytes: files.reduce((sum, file) => sum + file.size, 0),
          files,
        });
      }

      function resultFor(transferId) {
        return clipboardResults.find((payload) => payload.transferId === transferId) || {};
      }

      try {
        state.remoteFileTransfers = new Map();
        state.receivedClipboardFiles = [];
        elements.clipboardToggle.checked = true;
        state.client = {
          sendClipboardFileResponse: (payload) => clipboardResponses.push(payload),
          sendClipboardFileProgress: () => {},
          sendClipboardFileResult: (payload) => clipboardResults.push(payload),
        };

        offer("duplicate-transfer");
        handleClipboardFileChunk({
          type: "clipboard_file_chunk",
          transferId: "duplicate-transfer",
          fileIndex: 0,
          offset: 0,
          dataBase64: btoa("te"),
        });
        handleClipboardFileChunk({
          type: "clipboard_file_chunk",
          transferId: "duplicate-transfer",
          fileIndex: 0,
          offset: 0,
          dataBase64: btoa("st"),
        });
        const duplicateResult = resultFor("duplicate-transfer");
        const duplicateTransferGone = !state.remoteFileTransfers.has("duplicate-transfer");
        const duplicateStatusText = status?.textContent || "";

        offer("oversize-transfer");
        handleClipboardFileChunk({
          type: "clipboard_file_chunk",
          transferId: "oversize-transfer",
          fileIndex: 0,
          offset: 0,
          dataBase64: btoa("abcde"),
        });
        const oversizeResult = resultFor("oversize-transfer");
        const oversizeTransferGone = !state.remoteFileTransfers.has("oversize-transfer");

        offer("unknown-index");
        handleClipboardFileChunk({
          type: "clipboard_file_chunk",
          transferId: "unknown-index",
          fileIndex: 1,
          offset: 0,
          dataBase64: btoa("xx"),
        });
        const unknownIndexResult = resultFor("unknown-index");
        const unknownIndexTransferGone = !state.remoteFileTransfers.has("unknown-index");

        const acceptedOffers = clipboardResponses.filter((payload) => payload.accepted).length;
        const rejectedResults = clipboardResults.filter((payload) => payload.accepted === false);
        const duplicateReason = String(duplicateResult.reason || "");
        const oversizeReason = String(oversizeResult.reason || "");
        const unknownIndexReason = String(unknownIndexResult.reason || "");

        return {
          ok:
            acceptedOffers === 3 &&
            rejectedResults.length === 3 &&
            duplicateTransferGone &&
            oversizeTransferGone &&
            unknownIndexTransferGone &&
            duplicateResult.code === "LAN011" &&
            oversizeResult.code === "LAN011" &&
            unknownIndexResult.code === "LAN011" &&
            duplicateReason.includes("offset") &&
            duplicateReason.includes("期望") &&
            oversizeReason.includes("超过声明大小") &&
            unknownIndexReason.includes("未在清单中") &&
            duplicateStatusText.includes("请让 Mac 重新复制"),
          acceptedOffers,
          rejectedResults,
          duplicateResult,
          oversizeResult,
          unknownIndexResult,
          duplicateTransferGone,
          oversizeTransferGone,
          unknownIndexTransferGone,
          duplicateStatusText,
        };
      } finally {
        state.remoteFileTransfers = originalTransfers;
        state.receivedClipboardFiles = originalFiles;
        state.receivedClipboardWriteStatus = originalWriteStatus;
        elements.clipboardToggle.checked = originalClipboardToggle;
        state.client = originalClient;
        renderReceivedFiles();
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`file clipboard integrity guard check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyBlackBarInputGuard(session) {
  const result = await evaluate(
    session,
    `(() => {
      if (
        typeof canSendControlInput !== "function" ||
        typeof registerInputEvent !== "function" ||
        typeof updateCursor !== "function"
      ) {
        return { ok: false, reason: "missing input functions" };
      }

      const canvas = document.querySelector("#remoteCanvas");
      const status = document.querySelector("#remoteStatusText");
      const cursorDot = document.querySelector("#cursorDot");
      const scaleSelect = document.querySelector("#scaleModeSelect");
      if (!canvas || !status || !cursorDot || !scaleSelect || typeof state !== "object") {
        return { ok: false, reason: "missing input guard elements" };
      }

      const originalCanSend = canSendControlInput;
      const originalRegister = registerInputEvent;
      const originalRect = canvas.getBoundingClientRect.bind(canvas);
      const originalScale = scaleSelect.value;
      const originalConnected = state.connected;
      const originalDirection = state.controlDirection;
      const originalWidth = state.remoteFrameWidth;
      const originalHeight = state.remoteFrameHeight;
      const originalLastPointer = state.lastRemotePointer;
      const originalButtons = new Set(state.remotePointerButtonsDown);
      const sent = [];

      const defineMetric = (name, value) => {
        Object.defineProperty(canvas, name, {
          configurable: true,
          value,
        });
      };
      const mouse = (type, x, y, button = 0) =>
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button,
        });

      try {
        canSendControlInput = () => true;
        registerInputEvent = (kind, detail, payload = {}) => {
          sent.push({ kind, detail, payload });
        };
        canvas.getBoundingClientRect = () => ({
          left: 10,
          top: 20,
          width: 1000,
          height: 1000,
          right: 1010,
          bottom: 1020,
          x: 10,
          y: 20,
          toJSON() {
            return this;
          },
        });
        defineMetric("clientWidth", 1000);
        defineMetric("clientHeight", 1000);
        defineMetric("scrollWidth", 1000);
        defineMetric("scrollHeight", 1000);
        defineMetric("scrollLeft", 0);
        defineMetric("scrollTop", 0);
        state.connected = true;
        state.controlDirection = "windows_to_mac";
        state.remoteFrameWidth = 1920;
        state.remoteFrameHeight = 1080;
        state.lastRemotePointer = null;
        state.remotePointerButtonsDown.clear();
        scaleSelect.value = "fit";
        if (typeof applyScaleMode === "function") applyScaleMode();

        canvas.dispatchEvent(mouse("mousemove", 20, 40));
        const moveIgnored = sent.length === 0 && cursorDot.classList.contains("is-hidden");

        canvas.dispatchEvent(mouse("mousedown", 20, 40, 0));
        const blackBarDownIgnored =
          sent.length === 0 &&
          status.textContent.includes("黑边区域不会发送远控输入");

        canvas.dispatchEvent(mouse("mousedown", 510, 520, 0));
        const insideDownSent =
          sent.length === 1 &&
          sent[0].payload.event === "mouse_button" &&
          sent[0].payload.action === "down" &&
          sent[0].payload.remoteX === 960 &&
          sent[0].payload.remoteY === 540;

        canvas.dispatchEvent(mouse("mouseup", 20, 40, 0));
        const releaseSentAtLastPoint =
          sent.length === 2 &&
          sent[1].payload.event === "mouse_button" &&
          sent[1].payload.action === "up" &&
          sent[1].payload.remoteX === 960 &&
          sent[1].payload.remoteY === 540;

        canvas.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: 20,
            clientY: 40,
            deltaY: 120,
          }),
        );
        const blackBarWheelIgnored = sent.length === 2;

        return {
          ok:
            moveIgnored &&
            blackBarDownIgnored &&
            insideDownSent &&
            releaseSentAtLastPoint &&
            blackBarWheelIgnored,
          moveIgnored,
          blackBarDownIgnored,
          insideDownSent,
          releaseSentAtLastPoint,
          blackBarWheelIgnored,
          sentCount: sent.length,
          status: status.textContent,
          sent,
        };
      } finally {
        canSendControlInput = originalCanSend;
        registerInputEvent = originalRegister;
        canvas.getBoundingClientRect = originalRect;
        delete canvas.clientWidth;
        delete canvas.clientHeight;
        delete canvas.scrollWidth;
        delete canvas.scrollHeight;
        delete canvas.scrollLeft;
        delete canvas.scrollTop;
        scaleSelect.value = originalScale;
        state.connected = originalConnected;
        state.controlDirection = originalDirection;
        state.remoteFrameWidth = originalWidth;
        state.remoteFrameHeight = originalHeight;
        state.lastRemotePointer = originalLastPointer;
        state.remotePointerButtonsDown.clear();
        for (const button of originalButtons) state.remotePointerButtonsDown.add(button);
        if (typeof applyScaleMode === "function") applyScaleMode();
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`black bar input guard check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyStreamFallbackDiagnostics(session) {
  const result = await evaluate(
    session,
    `(() => {
      if (
        typeof handleProtocolMessage !== "function" ||
        typeof resetHostDiagnostics !== "function" ||
        typeof renderHostDiagnosticsText !== "function" ||
        typeof state !== "object"
      ) {
        return { ok: false, reason: "missing diagnostics functions" };
      }

      const diagnosticsElement = document.querySelector("#hostDiagnosticsText");
      if (!diagnosticsElement) {
        return { ok: false, reason: "missing diagnostics element" };
      }

      const originalDiagnostics = { ...state.hostDiagnostics };
      const originalText = diagnosticsElement.textContent;
      const originalOk = diagnosticsElement.classList.contains("is-ok");
      const originalWarning = diagnosticsElement.classList.contains("is-warning");
      const fallbackReason = "H.264 启动超时，已回退 JPEG";
      const runtime = {
        processId: 12345,
        startedAt: "2026-06-12T08:00:00Z",
        uptimeSeconds: 7322,
        buildId: "runtime-test",
      };

      try {
        resetHostDiagnostics();
        handleProtocolMessage({
          type: "display_settings_ack",
          accepted: true,
          hostMode: "mac-host-h264-stream",
          videoCodec: "h264",
          videoEncoding: "annexb-base64",
          capturePipeline: "screencapturekit-h264",
          runtime,
        });

        const runtimeText = diagnosticsElement.textContent;
        const runtimeState = state.hostDiagnostics.runtime || {};

        handleProtocolMessage({
          type: "display_settings_ack",
          accepted: true,
          hostMode: "mac-host-background-jpeg",
          videoCodec: "jpeg",
          videoEncoding: "data-url",
          capturePipeline: "background-jpeg",
          streamFallbackReason: fallbackReason,
        });

        const fallbackText = diagnosticsElement.textContent;
        const fallbackWarning = diagnosticsElement.classList.contains("is-warning");
        const fallbackState = state.hostDiagnostics.streamFallbackReason;
        const fallbackRuntimeState = state.hostDiagnostics.runtime || {};

        handleProtocolMessage({
          type: "display_settings_ack",
          accepted: true,
          hostMode: "mac-host-h264-stream",
          videoCodec: "h264",
          videoEncoding: "annexb-base64",
          capturePipeline: "screencapturekit-h264",
        });

        const clearedText = diagnosticsElement.textContent;
        const clearedState = state.hostDiagnostics.streamFallbackReason;

        return {
          ok:
            fallbackText.includes("视频回退") &&
            fallbackText.includes(fallbackReason) &&
            runtimeText.includes("运行") &&
            runtimeText.includes("PID 12345") &&
            runtimeText.includes("runtime-test") &&
            runtimeState.buildId === runtime.buildId &&
            fallbackText.includes("runtime-test") &&
            fallbackRuntimeState.processId === "12345" &&
            fallbackWarning &&
            fallbackState === fallbackReason &&
            !clearedText.includes(fallbackReason) &&
            clearedState === "" &&
            clearedText.includes("runtime-test"),
          runtimeText,
          runtimeState,
          fallbackText,
          fallbackWarning,
          fallbackState,
          fallbackRuntimeState,
          clearedText,
          clearedState,
        };
      } finally {
        state.hostDiagnostics = originalDiagnostics;
        diagnosticsElement.textContent = originalText;
        diagnosticsElement.classList.toggle("is-ok", originalOk);
        diagnosticsElement.classList.toggle("is-warning", originalWarning);
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`stream fallback diagnostics check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyVideoFrameAgeDiagnostics(session) {
  const result = await evaluate(
    session,
    `(() => {
      if (
        typeof handleProtocolMessage !== "function" ||
        typeof resetHostDiagnostics !== "function" ||
        typeof resetVideoFrameStats !== "function" ||
        typeof state !== "object"
      ) {
        return { ok: false, reason: "missing video frame diagnostics functions" };
      }

      const diagnosticsElement = document.querySelector("#hostDiagnosticsText");
      const latencyElement = document.querySelector("#metricLatency");
      const fpsElement = document.querySelector("#metricFps");
      const resolutionElement = document.querySelector("#metricResolution");
      const remoteCanvas = document.querySelector("#remoteCanvas");
      const image = document.querySelector("#remoteFrameImage");
      if (!diagnosticsElement || !latencyElement || !fpsElement || !resolutionElement || !remoteCanvas || !image) {
        return { ok: false, reason: "missing video frame diagnostics elements" };
      }

      const originalDiagnostics = { ...state.hostDiagnostics };
      const originalText = diagnosticsElement.textContent;
      const originalOk = diagnosticsElement.classList.contains("is-ok");
      const originalWarning = diagnosticsElement.classList.contains("is-warning");
      const originalLatency = latencyElement.textContent;
      const originalFpsText = fpsElement.textContent;
      const originalResolutionText = resolutionElement.textContent;
      const originalVideoFrames = state.videoFrames;
      const originalFrameTimes = [...state.videoFrameTimes];
      const originalActualFps = state.actualVideoFps;
      const originalRequestedFps = state.requestedFps;
      const originalNegotiatedFps = state.negotiatedFps;
      const originalFrameAgeMs = state.lastVideoFrameAgeMs;
      const originalFrameTimestamp = state.lastVideoFrameTimestamp;
      const originalClockSkewed = state.videoFrameClockSkewed;
      const originalCanvasHasVideo = remoteCanvas.classList.contains("has-video-frame");
      const originalImageVisible = image.classList.contains("is-visible");
      const originalImageSrc = image.getAttribute("src");
      const svgDataUrl = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22320%22%20height%3D%22180%22%3E%3Crect%20width%3D%22320%22%20height%3D%22180%22%20fill%3D%22%230f172a%22/%3E%3C/svg%3E";

      try {
        resetHostDiagnostics();
        resetVideoFrameStats();
        handleProtocolMessage({
          type: "video_frame",
          frameId: 321,
          timestamp: new Date(Date.now() - 123).toISOString(),
          width: 320,
          height: 180,
          codec: "jpeg",
          encoding: "data-url",
          source: "screen",
          capturePipeline: "background-jpeg",
          droppedFrames: 0,
          dataUrl: svgDataUrl,
        });

        const diagnostics = diagnosticsElement.textContent;
        const latency = latencyElement.textContent;
        const age = Number(state.hostDiagnostics.videoFrameAgeMs);
        const normalOk =
          diagnostics.includes("到达") &&
          latency.includes("ms") &&
          Number.isFinite(age) &&
          age >= 0 &&
          age < 5000;

        handleProtocolMessage({
          type: "video_frame",
          frameId: 322,
          timestamp: new Date(Date.now() + 2000).toISOString(),
          width: 320,
          height: 180,
          codec: "jpeg",
          encoding: "data-url",
          source: "screen",
          capturePipeline: "background-jpeg",
          droppedFrames: 0,
          dataUrl: svgDataUrl,
        });

        const skewText = diagnosticsElement.textContent;
        const skewLatency = latencyElement.textContent;
        const skewOk =
          skewText.includes("时钟偏差") &&
          skewLatency.includes("时钟偏差") &&
          state.hostDiagnostics.videoFrameClockSkewed === true;

        return {
          ok: normalOk && skewOk,
          diagnostics,
          latency,
          age,
          skewText,
          skewLatency,
        };
      } finally {
        state.hostDiagnostics = originalDiagnostics;
        state.videoFrames = originalVideoFrames;
        state.videoFrameTimes = originalFrameTimes;
        state.actualVideoFps = originalActualFps;
        state.requestedFps = originalRequestedFps;
        state.negotiatedFps = originalNegotiatedFps;
        state.lastVideoFrameAgeMs = originalFrameAgeMs;
        state.lastVideoFrameTimestamp = originalFrameTimestamp;
        state.videoFrameClockSkewed = originalClockSkewed;
        diagnosticsElement.textContent = originalText;
        diagnosticsElement.classList.toggle("is-ok", originalOk);
        diagnosticsElement.classList.toggle("is-warning", originalWarning);
        latencyElement.textContent = originalLatency;
        fpsElement.textContent = originalFpsText;
        resolutionElement.textContent = originalResolutionText;
        remoteCanvas.classList.toggle("has-video-frame", originalCanvasHasVideo);
        image.classList.toggle("is-visible", originalImageVisible);
        if (originalImageSrc) {
          image.setAttribute("src", originalImageSrc);
        } else {
          image.removeAttribute("src");
        }
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`video frame age diagnostics check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyLowFpsDiagnostics(session) {
  const result = await evaluate(
    session,
    `(() => {
      if (
        typeof updateHostDiagnostics !== "function" ||
        typeof resetHostDiagnostics !== "function" ||
        typeof buildLogExportText !== "function" ||
        typeof state !== "object"
      ) {
        return { ok: false, reason: "missing low FPS diagnostics functions" };
      }

      const diagnosticsElement = document.querySelector("#hostDiagnosticsText");
      if (!diagnosticsElement) {
        return { ok: false, reason: "missing diagnostics element" };
      }

      const originalDiagnostics = { ...state.hostDiagnostics };
      const originalConnected = state.connected;
      const originalActualFps = state.actualVideoFps;
      const originalRequestedFps = state.requestedFps;
      const originalNegotiatedFps = state.negotiatedFps;
      const originalText = diagnosticsElement.textContent;
      const originalOk = diagnosticsElement.classList.contains("is-ok");
      const originalWarning = diagnosticsElement.classList.contains("is-warning");

      try {
        resetHostDiagnostics();
        state.connected = true;
        state.actualVideoFps = 22.9;
        state.negotiatedFps = 30;
        state.requestedFps = 60;
        updateHostDiagnostics({
          videoCodec: "jpeg",
          videoEncoding: "data-url",
          videoSource: "screen",
          capturePipeline: "background-jpeg",
          droppedFrames: 0,
          maxScreenFps: 30,
        });
        const lowText = diagnosticsElement.textContent;
        const lowWarning = diagnosticsElement.classList.contains("is-warning");
        const exportText = buildLogExportText();
        const exportVideo =
          exportText.includes("- 视频：JPEG") &&
          exportText.includes("实收 22.9 FPS") &&
          exportText.includes("协商 30 Hz") &&
          exportText.includes("请求 60 Hz") &&
          exportText.includes("低于协商 30 Hz") &&
          exportText.includes("远端上限 30 Hz") &&
          exportText.includes("- 视频状态：JPEG");

        state.actualVideoFps = 29;
        updateHostDiagnostics({ maxScreenFps: 30 });
        const cappedText = diagnosticsElement.textContent;
        const cappedWarning = diagnosticsElement.classList.contains("is-warning");

        state.actualVideoFps = 58;
        state.negotiatedFps = 60;
        updateHostDiagnostics({ maxScreenFps: null });
        const nearText = diagnosticsElement.textContent;
        const nearWarning = diagnosticsElement.classList.contains("is-warning");

        return {
          ok:
            lowText.includes("低于协商 30 Hz") &&
            lowText.includes("远端上限 30 Hz") &&
            lowWarning &&
            exportVideo &&
            cappedText.includes("远端上限 30 Hz") &&
            !cappedText.includes("低于协商") &&
            !cappedText.includes("低于请求") &&
            cappedWarning &&
            !nearText.includes("低于请求") &&
            !nearText.includes("远端上限") &&
            !nearWarning,
          lowText,
          lowWarning,
          exportVideo,
          cappedText,
          cappedWarning,
          nearText,
          nearWarning,
        };
      } finally {
        state.hostDiagnostics = originalDiagnostics;
        state.connected = originalConnected;
        state.actualVideoFps = originalActualFps;
        state.requestedFps = originalRequestedFps;
        state.negotiatedFps = originalNegotiatedFps;
        diagnosticsElement.textContent = originalText;
        diagnosticsElement.classList.toggle("is-ok", originalOk);
        diagnosticsElement.classList.toggle("is-warning", originalWarning);
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`low FPS diagnostics check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyDiscoveryRuntimeDiagnostics(session, { host, port, buildId, timeoutMs }) {
  const result = await evaluate(
    session,
    `(async () => {
      if (
        typeof refreshDevices !== "function" ||
        typeof state !== "object" ||
        typeof elements !== "object"
      ) {
        return { ok: false, reason: "missing discovery functions" };
      }

      const setValue = (selector, value) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        element.value = value;
        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      };

      setValue("#transportSelect", "local");
      setValue("#hostInput", ${JSON.stringify(host)});
      setValue("#portInput", ${JSON.stringify(port)});
      await refreshDevices();

      const targetHost = ${JSON.stringify(host)};
      const targetPort = ${JSON.stringify(String(port))};
      const buildId = ${JSON.stringify(buildId)};
      const rows = [...document.querySelectorAll(".device-row")];
      const row = rows.find((item) => item.dataset.host === targetHost && item.dataset.port === targetPort);
      const detail = row?.innerText || "";
      const diagnostics = document.querySelector("#hostDiagnosticsText")?.textContent || "";
      const selectedHost = document.querySelector("#hostInput")?.value || "";
      const selectedPort = document.querySelector("#portInput")?.value || "";
      const selectedTransport = document.querySelector("#transportSelect")?.value || "";
      const device = state.discoveredDevices.find(
        (item) => item.host === targetHost && String(item.port) === targetPort,
      );
      const runtime = device?.runtime || {};

      return {
        ok:
          Boolean(row) &&
          row.classList.contains("active") &&
          selectedHost === targetHost &&
          selectedPort === targetPort &&
          selectedTransport === "websocket" &&
          detail.includes(buildId) &&
          diagnostics.includes("运行") &&
          diagnostics.includes(buildId) &&
          runtime.buildId === buildId,
        detail,
        diagnostics,
        selectedHost,
        selectedPort,
        selectedTransport,
        active: Boolean(row?.classList.contains("active")),
        runtime,
        rowCount: rows.length,
      };
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`discovery runtime diagnostics check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyH264KeyFrameDetection(session) {
  const result = await evaluate(
    session,
    `(async () => {
      if (
        typeof isH264KeyFramePayload !== "function" ||
        typeof renderH264VideoFrame !== "function" ||
        typeof getVideoPerformanceExportStatus !== "function" ||
        typeof state !== "object"
      ) {
        return { ok: false, reason: "missing H.264 key frame/evidence helpers" };
      }
      const annexbKey = new Uint8Array([
        0, 0, 0, 1, 0x67, 0x42, 0xe0, 0x1f,
        0, 0, 0, 1, 0x68, 0xce, 0x06, 0xe2,
        0, 0, 0, 1, 0x65, 0x88, 0x84,
      ]);
      const annexbDelta = new Uint8Array([0, 0, 0, 1, 0x41, 0x9a, 0x22]);
      const avcKey = new Uint8Array([0, 0, 0, 3, 0x65, 0x88, 0x84]);
      const makeBase64 = (bytes) => {
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return btoa(binary);
      };
      const original = {
        h264Decoder: state.h264Decoder,
        h264DecoderQueue: Array.isArray(state.h264DecoderQueue) ? state.h264DecoderQueue.slice() : [],
        h264DecoderStatus: state.h264DecoderStatus,
        h264DecoderKey: state.h264DecoderKey,
        h264DecoderCodec: state.h264DecoderCodec,
        h264DecoderLatencyMs: state.h264DecoderLatencyMs,
        h264DecoderErrorCount: state.h264DecoderErrorCount,
        h264DecoderWarned: state.h264DecoderWarned,
        h264DecoderLastError: state.h264DecoderLastError,
        h264DecoderNeedsKeyFrame: state.h264DecoderNeedsKeyFrame,
        h264SkippedDeltaFrames: state.h264SkippedDeltaFrames,
        h264DecodedFrames: state.h264DecodedFrames,
        h264ReceivedFrames: state.h264ReceivedFrames,
        h264ReceivedKeyFrames: state.h264ReceivedKeyFrames,
        h264ReceivedDeltaFrames: state.h264ReceivedDeltaFrames,
        h264ReceivedSps: state.h264ReceivedSps,
        h264ReceivedPps: state.h264ReceivedPps,
        h264ReceivedIdr: state.h264ReceivedIdr,
        h264LastNalTypes: state.h264LastNalTypes,
        h264LastKeyFrameId: state.h264LastKeyFrameId,
        videoFrames: state.videoFrames,
        videoFrameTimes: Array.isArray(state.videoFrameTimes) ? state.videoFrameTimes.slice() : [],
        videoDecoderQueueMs: state.videoDecoderQueueMs,
        videoDroppedStaleFrames: state.videoDroppedStaleFrames,
        videoLastDropReason: state.videoLastDropReason,
        remoteFrameWidth: state.remoteFrameWidth,
        remoteFrameHeight: state.remoteFrameHeight,
        requestedFps: state.requestedFps,
        negotiatedFps: state.negotiatedFps,
        activeHost: state.activeHost,
        activePort: state.activePort,
        w8NativeVideoSessionStarted: state.w8NativeVideoSessionStarted,
        w8NativeVideoSessionPromise: state.w8NativeVideoSessionPromise,
        w8NativeVideoPushPromise: state.w8NativeVideoPushPromise,
        w8NativeVideoFramesPushed: state.w8NativeVideoFramesPushed,
        w8NativeVideoDroppedFrames: state.w8NativeVideoDroppedFrames,
        w8NativeVideoHasDecoderConfig: state.w8NativeVideoHasDecoderConfig,
        w8NativeVideoCodecString: state.w8NativeVideoCodecString,
        w8NativeVideoDecoderProbePromise: state.w8NativeVideoDecoderProbePromise,
        w8NativeVideoDecoderReady: state.w8NativeVideoDecoderReady,
        w8NativeVideoDecoderMode: state.w8NativeVideoDecoderMode,
        w8NativeVideoDecoderReason: state.w8NativeVideoDecoderReason,
        w8NativeVideoD3dFeatureLevel: state.w8NativeVideoD3dFeatureLevel,
        w8NativeVideoDecoderInitReady: state.w8NativeVideoDecoderInitReady,
        w8NativeVideoDecoderInitMode: state.w8NativeVideoDecoderInitMode,
        w8NativeVideoDecoderInitReason: state.w8NativeVideoDecoderInitReason,
        w8NativeVideoDecoderInitOutputSubtypes: state.w8NativeVideoDecoderInitOutputSubtypes,
        w8NativeVideoDecodeStepReady: state.w8NativeVideoDecodeStepReady,
        w8NativeVideoDecodeStepMode: state.w8NativeVideoDecodeStepMode,
        w8NativeVideoDecodeStepReason: state.w8NativeVideoDecodeStepReason,
        w8NativeVideoDecodeStepStatus: state.w8NativeVideoDecodeStepStatus,
        w8NativeVideoDecoderSessionActive: state.w8NativeVideoDecoderSessionActive,
        w8NativeVideoDecoderSessionMode: state.w8NativeVideoDecoderSessionMode,
        w8NativeVideoDecoderSessionReason: state.w8NativeVideoDecoderSessionReason,
        w8NativeVideoDecoderSessionStatus: state.w8NativeVideoDecoderSessionStatus,
        w8NativeVideoDecoderSessionOutputSubtype: state.w8NativeVideoDecoderSessionOutputSubtype,
        w8NativeVideoDecoderSessionSubmittedFrames: state.w8NativeVideoDecoderSessionSubmittedFrames,
        w8NativeVideoDecoderSessionAcceptedInputFrames: state.w8NativeVideoDecoderSessionAcceptedInputFrames,
        w8NativeVideoDecoderSessionDecodedFrames: state.w8NativeVideoDecoderSessionDecodedFrames,
        w8NativeVideoDecoderSessionWorkerThread: state.w8NativeVideoDecoderSessionWorkerThread,
        w8NativeVideoDecoderSessionWorkerMode: state.w8NativeVideoDecoderSessionWorkerMode,
        w8NativeVideoDecoderSessionWorkerStatus: state.w8NativeVideoDecoderSessionWorkerStatus,
        w8NativeVideoFrameHandoffActive: state.w8NativeVideoFrameHandoffActive,
        w8NativeVideoFrameHandoffMode: state.w8NativeVideoFrameHandoffMode,
        w8NativeVideoFrameHandoffStatus: state.w8NativeVideoFrameHandoffStatus,
        w8NativeVideoLatestFrameFormat: state.w8NativeVideoLatestFrameFormat,
        w8NativeVideoLatestFrameBytes: state.w8NativeVideoLatestFrameBytes,
        w8NativeVideoLatestFrameId: state.w8NativeVideoLatestFrameId,
        w8NativeVideoNativeSurfaceReady: state.w8NativeVideoNativeSurfaceReady,
        w8NativeVideoNativeSurfaceMode: state.w8NativeVideoNativeSurfaceMode,
        w8NativeVideoNativeSurfaceStatus: state.w8NativeVideoNativeSurfaceStatus,
        w8NativeVideoNativeSurfaceFormat: state.w8NativeVideoNativeSurfaceFormat,
        w8NativeVideoNativeSurfaceWidth: state.w8NativeVideoNativeSurfaceWidth,
        w8NativeVideoNativeSurfaceHeight: state.w8NativeVideoNativeSurfaceHeight,
        w8NativeVideoNativeSurfaceReason: state.w8NativeVideoNativeSurfaceReason,
        w8NativeVideoErrors: state.w8NativeVideoErrors,
        w8NativeVideoLastError: state.w8NativeVideoLastError,
        w8NativeVideoLastSnapshot: state.w8NativeVideoLastSnapshot,
        hostDiagnostics: { ...(state.hostDiagnostics || {}) },
        tauriDescriptor: Object.getOwnPropertyDescriptor(window, "__TAURI__"),
        videoDecoderDescriptor: Object.getOwnPropertyDescriptor(window, "VideoDecoder"),
        encodedVideoChunkDescriptor: Object.getOwnPropertyDescriptor(window, "EncodedVideoChunk"),
      };
      const nativeCalls = [];

      class FakeVideoDecoder {
        static async isConfigSupported() {
          return { supported: true };
        }
        constructor(options = {}) {
          this.options = options;
          this.state = "configured";
          this.decodeQueueSize = 0;
        }
        configure(config) {
          this.config = config;
        }
        decode() {
          this.decodeQueueSize = 0;
        }
        close() {
          this.state = "closed";
        }
      }
      class FakeEncodedVideoChunk {
        constructor(init = {}) {
          this.type = init.type;
          this.timestamp = init.timestamp;
          this.duration = init.duration;
          this.data = init.data;
        }
      }

      try {
        Object.defineProperty(window, "__TAURI__", {
          configurable: true,
          value: {
            core: {
              invoke: async (command, payload = {}) => {
                nativeCalls.push({ command, payload });
                if (command === "start_w8_native_video_session") {
                  return {
                    running: true,
                    host: payload?.request?.host || "",
                    port: payload?.request?.port || 0,
                    requestedFps: payload?.request?.requestedFps || 60,
                    rendererMode: "native-video-queue-mvp",
                    queue: {
                      queuedFrames: 0,
                      queueMs: 0,
                      acceptedFrames: 0,
                      droppedFrames: 0,
                      keyframeRequests: 0,
                      waitingForKeyframe: false,
                      maxObservedQueueMs: 0,
                      lastFrameId: null,
                      lastReason: "idle",
                    },
                  };
                }
                if (command === "push_w8_native_h264_annexb_frame") {
                  const id = Number(payload?.request?.id) || 0;
                  return {
                    video: {
                      accepted: true,
                      droppedFrames: 0,
                      queueMs: id === 42 ? 16 : 0,
                      waitingForKeyframe: false,
                      reason: "queued",
                    },
                    summary: id === 42
                      ? {
                          nalTypes: [7, 8, 5],
                          hasSps: true,
                          hasPps: true,
                          hasIdr: true,
                          isKeyframe: true,
                          byteLen: 23,
                          spsCount: 1,
                          ppsCount: 1,
                          hasDecoderConfig: true,
                          codecString: "avc1.420029",
                        }
                      : {
                          nalTypes: [1],
                          hasSps: false,
                          hasPps: false,
                          hasIdr: false,
                          isKeyframe: false,
                          byteLen: 7,
                          spsCount: 0,
                          ppsCount: 0,
                          hasDecoderConfig: false,
                          codecString: null,
                      },
                    decoderInit: id === 42
                      ? {
                          mode: "media-foundation-h264-decoder-init-preflight",
                          attempted: true,
                          ready: true,
                          codecString: "avc1.420029",
                          inputTypeSet: true,
                          outputTypeAvailable: true,
                          outputSubtypes: ["NV12", "ARGB32"],
                          reason: "ready; input=h264; output=NV12",
                        }
                      : null,
                    decodeStep: id === 42
                      ? {
                          mode: "media-foundation-h264-sample-decode-step-preflight",
                          attempted: true,
                          ready: true,
                          codecString: "avc1.420029",
                          frameByteLen: 23,
                          sampleCreated: true,
                          inputAccepted: true,
                          outputAttempted: true,
                          outputProduced: false,
                          outputStatus: "need-more-input",
                          reason: "ready; ProcessInput accepted; ProcessOutput need-more-input",
                        }
                      : null,
                    decoderSession: id >= 42
                      ? {
                          mode: "media-foundation-h264-persistent-decoder-session",
                          attempted: true,
                          active: true,
                          ready: true,
                          codecString: "avc1.420029",
                          outputSubtype: "NV12",
                          submittedFrames: id === 42 ? 1 : 2,
                          acceptedInputFrames: id === 42 ? 1 : 2,
                          decodedFrames: 1,
                          lastStatus: "latest-frame-presented",
                          workerThread: true,
                          workerMode: "dedicated-native-decoder-thread",
                          workerStatus: "active",
                          frameHandoffActive: true,
                          frameHandoffMode: "native-latest-frame-handoff",
                          frameHandoffStatus: "latest-frame-ready",
                          latestFrameFormat: "NV12",
                          latestFrameBytes: 3110400,
                          latestFrameId: 1,
                          nativeSurfaceReady: true,
                          nativeSurfaceMode: "d3d11-latest-frame-texture-target",
                          nativeSurfaceStatus: "latest-frame-presented",
                          nativeSurfaceFormat: "NV12",
                          nativeSurfaceWidth: 1920,
                          nativeSurfaceHeight: 1080,
                          nativeSurfaceCopyStatus: "latest-frame-presented",
                          nativeSurfaceCopyBytes: 3110400,
                          nativeSurfacePresentedFrames: 1,
                          nativeSurfaceLastFrameId: 1,
                          reason: "ready; persistent decoder session active",
                        }
                      : null,
                  };
                }
                if (command === "probe_w8_native_video_decoder") {
                  return {
                    mode: "media-foundation-h264-d3d11-probe",
                    d3d11Available: true,
                    d3dFeatureLevel: "11_1",
                    mediaFoundationAvailable: true,
                    h264DecoderAvailable: true,
                    h264DecoderCount: 2,
                    h264HardwareDecoderAvailable: true,
                    h264HardwareDecoderCount: 1,
                    ready: true,
                    reason: "ready",
                  };
                }
                throw new Error("unexpected invoke " + command);
              },
            },
          },
        });
        Object.defineProperty(window, "VideoDecoder", {
          configurable: true,
          value: FakeVideoDecoder,
        });
        Object.defineProperty(window, "EncodedVideoChunk", {
          configurable: true,
          value: FakeEncodedVideoChunk,
        });
        state.h264Decoder = null;
        state.h264DecoderQueue = [];
        state.h264DecoderStatus = "idle";
        state.h264DecoderKey = "";
        state.h264DecoderCodec = "";
        state.h264DecoderLatencyMs = 0;
        state.h264DecoderErrorCount = 0;
        state.h264DecoderWarned = false;
        state.h264DecoderLastError = "";
        state.h264DecoderNeedsKeyFrame = true;
        state.h264SkippedDeltaFrames = 0;
        state.h264DecodedFrames = 0;
        state.h264ReceivedFrames = 0;
        state.h264ReceivedKeyFrames = 0;
        state.h264ReceivedDeltaFrames = 0;
        state.h264ReceivedSps = 0;
        state.h264ReceivedPps = 0;
        state.h264ReceivedIdr = 0;
        state.h264LastNalTypes = "";
        state.h264LastKeyFrameId = "";
        state.videoFrames = 0;
        state.videoFrameTimes = [];
        state.videoDecoderQueueMs = 0;
        state.videoDroppedStaleFrames = 0;
        state.videoLastDropReason = "";
        state.requestedFps = 60;
        state.negotiatedFps = 60;
        state.activeHost = "192.168.31.122";
        state.activePort = "43770";
        state.w8NativeVideoSessionStarted = false;
        state.w8NativeVideoSessionPromise = null;
        state.w8NativeVideoPushPromise = null;
        state.w8NativeVideoFramesPushed = 0;
        state.w8NativeVideoDroppedFrames = 0;
        state.w8NativeVideoHasDecoderConfig = false;
        state.w8NativeVideoCodecString = "";
        state.w8NativeVideoDecoderProbePromise = null;
        state.w8NativeVideoDecoderReady = false;
        state.w8NativeVideoDecoderMode = "";
        state.w8NativeVideoDecoderReason = "";
        state.w8NativeVideoD3dFeatureLevel = "";
        state.w8NativeVideoDecoderInitReady = false;
        state.w8NativeVideoDecoderInitMode = "";
        state.w8NativeVideoDecoderInitReason = "";
        state.w8NativeVideoDecoderInitOutputSubtypes = "";
        state.w8NativeVideoDecodeStepReady = false;
        state.w8NativeVideoDecodeStepMode = "";
        state.w8NativeVideoDecodeStepReason = "";
        state.w8NativeVideoDecodeStepStatus = "";
        state.w8NativeVideoDecoderSessionActive = false;
        state.w8NativeVideoDecoderSessionMode = "";
        state.w8NativeVideoDecoderSessionReason = "";
        state.w8NativeVideoDecoderSessionStatus = "";
        state.w8NativeVideoDecoderSessionOutputSubtype = "";
        state.w8NativeVideoDecoderSessionSubmittedFrames = 0;
        state.w8NativeVideoDecoderSessionAcceptedInputFrames = 0;
        state.w8NativeVideoDecoderSessionDecodedFrames = 0;
        state.w8NativeVideoDecoderSessionWorkerThread = false;
        state.w8NativeVideoDecoderSessionWorkerMode = "";
        state.w8NativeVideoDecoderSessionWorkerStatus = "";
        state.w8NativeVideoFrameHandoffActive = false;
        state.w8NativeVideoFrameHandoffMode = "";
        state.w8NativeVideoFrameHandoffStatus = "";
        state.w8NativeVideoLatestFrameFormat = "";
        state.w8NativeVideoLatestFrameBytes = 0;
        state.w8NativeVideoLatestFrameId = null;
        state.w8NativeVideoNativeSurfaceReady = false;
        state.w8NativeVideoNativeSurfaceMode = "";
        state.w8NativeVideoNativeSurfaceStatus = "";
        state.w8NativeVideoNativeSurfaceFormat = "";
        state.w8NativeVideoNativeSurfaceWidth = 0;
        state.w8NativeVideoNativeSurfaceHeight = 0;
        state.w8NativeVideoNativeSurfaceReason = "";
        state.w8NativeVideoNativeSurfaceCopyStatus = "";
        state.w8NativeVideoNativeSurfaceCopyBytes = 0;
        state.w8NativeVideoNativeSurfacePresentedFrames = 0;
        state.w8NativeVideoNativeSurfaceLastFrameId = null;
        state.w8NativeVideoErrors = 0;
        state.w8NativeVideoLastError = "";
        state.w8NativeVideoLastSnapshot = null;
        state.hostDiagnostics = {};

        await renderH264VideoFrame({
          payload: makeBase64(annexbDelta),
          encoding: "annexb-base64",
          codecString: "avc1.420029",
          width: 1920,
          height: 1080,
          frameId: 41,
          keyFrame: false,
        });
        await renderH264VideoFrame({
          payload: makeBase64(annexbKey),
          encoding: "annexb-base64",
          codecString: "avc1.420029",
          width: 1920,
          height: 1080,
          frameId: 42,
          keyFrame: false,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));

        const exportText = getVideoPerformanceExportStatus();
        const nativeStartCalls = nativeCalls.filter((call) => call.command === "start_w8_native_video_session");
        const nativePushCalls = nativeCalls.filter((call) => call.command === "push_w8_native_h264_annexb_frame");
        const nativeProbeCalls = nativeCalls.filter((call) => call.command === "probe_w8_native_video_decoder");
        const nativeQueueRecorded =
          nativeStartCalls.length === 1 &&
          nativePushCalls.length === 2 &&
          nativeProbeCalls.length === 1 &&
          nativeStartCalls[0].payload?.request?.host === "192.168.31.122" &&
          nativeStartCalls[0].payload?.request?.port === 43770 &&
          nativePushCalls[0].payload?.request?.id === 41 &&
          nativePushCalls[1].payload?.request?.id === 42 &&
          nativePushCalls[1].payload?.request?.dataBase64 === makeBase64(annexbKey) &&
          state.w8NativeVideoFramesPushed === 2 &&
          state.hostDiagnostics?.w8NativeVideoFramesPushed === 2 &&
          state.hostDiagnostics?.w8NativeVideoQueueMs === 16 &&
          state.hostDiagnostics?.w8NativeVideoHasDecoderConfig === true &&
          state.hostDiagnostics?.w8NativeVideoCodecString === "avc1.420029" &&
          state.hostDiagnostics?.w8NativeVideoDecoderReady === true &&
          state.hostDiagnostics?.w8NativeVideoDecoderMode === "media-foundation-h264-d3d11-probe" &&
          state.hostDiagnostics?.w8NativeVideoD3dFeatureLevel === "11_1" &&
          state.hostDiagnostics?.w8NativeVideoDecoderInitReady === true &&
          state.hostDiagnostics?.w8NativeVideoDecoderInitMode ===
            "media-foundation-h264-decoder-init-preflight" &&
          state.hostDiagnostics?.w8NativeVideoDecoderInitOutputSubtypes === "NV12/ARGB32" &&
          state.hostDiagnostics?.w8NativeVideoDecodeStepReady === true &&
          state.hostDiagnostics?.w8NativeVideoDecodeStepMode ===
            "media-foundation-h264-sample-decode-step-preflight" &&
          state.hostDiagnostics?.w8NativeVideoDecodeStepStatus === "need-more-input" &&
          state.hostDiagnostics?.w8NativeVideoDecoderSessionActive === true &&
          state.hostDiagnostics?.w8NativeVideoDecoderSessionMode ===
            "media-foundation-h264-persistent-decoder-session" &&
          state.hostDiagnostics?.w8NativeVideoDecoderSessionOutputSubtype === "NV12" &&
          state.hostDiagnostics?.w8NativeVideoDecoderSessionSubmittedFrames === 1 &&
          state.hostDiagnostics?.w8NativeVideoDecoderSessionAcceptedInputFrames === 1 &&
          state.hostDiagnostics?.w8NativeVideoDecoderSessionDecodedFrames === 1 &&
          state.hostDiagnostics?.w8NativeVideoDecoderSessionStatus === "latest-frame-presented" &&
          state.hostDiagnostics?.w8NativeVideoDecoderSessionWorkerThread === true &&
          state.hostDiagnostics?.w8NativeVideoDecoderSessionWorkerMode ===
            "dedicated-native-decoder-thread" &&
          state.hostDiagnostics?.w8NativeVideoDecoderSessionWorkerStatus === "active" &&
          state.hostDiagnostics?.w8NativeVideoFrameHandoffActive === true &&
          state.hostDiagnostics?.w8NativeVideoFrameHandoffMode === "native-latest-frame-handoff" &&
          state.hostDiagnostics?.w8NativeVideoFrameHandoffStatus === "latest-frame-ready" &&
          state.hostDiagnostics?.w8NativeVideoLatestFrameFormat === "NV12" &&
          state.hostDiagnostics?.w8NativeVideoNativeSurfaceReady === true &&
          state.hostDiagnostics?.w8NativeVideoNativeSurfaceMode === "d3d11-latest-frame-texture-target" &&
          state.hostDiagnostics?.w8NativeVideoNativeSurfaceStatus === "latest-frame-presented" &&
          state.hostDiagnostics?.w8NativeVideoNativeSurfaceFormat === "NV12" &&
          state.hostDiagnostics?.w8NativeVideoNativeSurfaceWidth === 1920 &&
          state.hostDiagnostics?.w8NativeVideoNativeSurfaceHeight === 1080 &&
          state.hostDiagnostics?.w8NativeVideoNativeSurfaceCopyStatus === "latest-frame-presented" &&
          state.hostDiagnostics?.w8NativeVideoNativeSurfaceCopyBytes === 3110400 &&
          state.hostDiagnostics?.w8NativeVideoNativeSurfacePresentedFrames === 1 &&
          state.hostDiagnostics?.w8NativeVideoNativeSurfaceLastFrameId === 1 &&
          exportText.includes("原生队列 2") &&
          exportText.includes("原生队列 16 ms") &&
          exportText.includes("原生解码配置 avc1.420029") &&
          exportText.includes("原生解码器 ready") &&
          exportText.includes("D3D11 11_1") &&
          exportText.includes("原生解码初始化 ready") &&
          exportText.includes("原生输出 NV12/ARGB32") &&
          exportText.includes("原生解码步进 ready") &&
          exportText.includes("原生步进状态 need-more-input") &&
          exportText.includes("原生解码会话 active") &&
          exportText.includes("原生会话输出 NV12") &&
          exportText.includes("原生会话输入 1") &&
          exportText.includes("原生会话解码 1") &&
          exportText.includes("原生会话状态 latest-frame-presented") &&
          exportText.includes("原生解码线程 active") &&
          exportText.includes("原生帧交接 active") &&
          exportText.includes("原生最新帧 NV12") &&
          exportText.includes("原生帧状态 latest-frame-ready") &&
          exportText.includes("原生表面 ready") &&
          exportText.includes("原生表面目标 D3D11 1920x1080 NV12") &&
          exportText.includes("原生表面状态 latest-frame-presented") &&
          exportText.includes("原生表面写入 3110400 bytes") &&
          exportText.includes("原生表面呈现 1");
        const h264EvidenceRecorded =
          state.h264ReceivedFrames === 2 &&
          state.h264ReceivedDeltaFrames === 1 &&
          state.h264ReceivedKeyFrames === 1 &&
          state.h264ReceivedSps === 1 &&
          state.h264ReceivedPps === 1 &&
          state.h264ReceivedIdr === 1 &&
          state.h264LastNalTypes === "7/8/5" &&
          String(state.h264LastKeyFrameId) === "42" &&
          state.h264DecoderNeedsKeyFrame === false &&
          exportText.includes("H.264收到 2") &&
          exportText.includes("关键帧 1") &&
          exportText.includes("SPS/PPS/IDR 1/1/1") &&
          exportText.includes("NAL 7/8/5");

        return {
          ok:
            isH264KeyFramePayload(annexbKey, "annexb-base64") &&
            !isH264KeyFramePayload(annexbDelta, "annexb-base64") &&
            isH264KeyFramePayload(avcKey, "avc") &&
            h264EvidenceRecorded &&
            nativeQueueRecorded,
          annexbKey: isH264KeyFramePayload(annexbKey, "annexb-base64"),
          annexbDelta: isH264KeyFramePayload(annexbDelta, "annexb-base64"),
          avcKey: isH264KeyFramePayload(avcKey, "avc"),
          h264EvidenceRecorded,
          nativeQueueRecorded,
          nativeCalls,
          w8NativeVideoFramesPushed: state.w8NativeVideoFramesPushed,
          w8NativeVideoQueueMs: state.hostDiagnostics?.w8NativeVideoQueueMs,
          w8NativeVideoHasDecoderConfig: state.hostDiagnostics?.w8NativeVideoHasDecoderConfig,
          w8NativeVideoCodecString: state.hostDiagnostics?.w8NativeVideoCodecString,
          w8NativeVideoDecoderReady: state.hostDiagnostics?.w8NativeVideoDecoderReady,
          w8NativeVideoDecoderMode: state.hostDiagnostics?.w8NativeVideoDecoderMode,
          w8NativeVideoD3dFeatureLevel: state.hostDiagnostics?.w8NativeVideoD3dFeatureLevel,
          w8NativeVideoDecoderInitReady: state.hostDiagnostics?.w8NativeVideoDecoderInitReady,
          w8NativeVideoDecoderInitMode: state.hostDiagnostics?.w8NativeVideoDecoderInitMode,
          w8NativeVideoDecoderInitOutputSubtypes: state.hostDiagnostics?.w8NativeVideoDecoderInitOutputSubtypes,
          w8NativeVideoDecodeStepReady: state.hostDiagnostics?.w8NativeVideoDecodeStepReady,
          w8NativeVideoDecodeStepMode: state.hostDiagnostics?.w8NativeVideoDecodeStepMode,
          w8NativeVideoDecodeStepStatus: state.hostDiagnostics?.w8NativeVideoDecodeStepStatus,
          w8NativeVideoDecoderSessionActive: state.hostDiagnostics?.w8NativeVideoDecoderSessionActive,
          w8NativeVideoDecoderSessionMode: state.hostDiagnostics?.w8NativeVideoDecoderSessionMode,
          w8NativeVideoDecoderSessionOutputSubtype: state.hostDiagnostics?.w8NativeVideoDecoderSessionOutputSubtype,
          w8NativeVideoDecoderSessionSubmittedFrames:
            state.hostDiagnostics?.w8NativeVideoDecoderSessionSubmittedFrames,
          w8NativeVideoDecoderSessionAcceptedInputFrames:
            state.hostDiagnostics?.w8NativeVideoDecoderSessionAcceptedInputFrames,
          w8NativeVideoDecoderSessionDecodedFrames: state.hostDiagnostics?.w8NativeVideoDecoderSessionDecodedFrames,
          w8NativeVideoDecoderSessionStatus: state.hostDiagnostics?.w8NativeVideoDecoderSessionStatus,
          w8NativeVideoDecoderSessionWorkerThread:
            state.hostDiagnostics?.w8NativeVideoDecoderSessionWorkerThread,
          w8NativeVideoDecoderSessionWorkerMode:
            state.hostDiagnostics?.w8NativeVideoDecoderSessionWorkerMode,
          w8NativeVideoDecoderSessionWorkerStatus:
            state.hostDiagnostics?.w8NativeVideoDecoderSessionWorkerStatus,
          w8NativeVideoFrameHandoffActive:
            state.hostDiagnostics?.w8NativeVideoFrameHandoffActive,
          w8NativeVideoFrameHandoffMode:
            state.hostDiagnostics?.w8NativeVideoFrameHandoffMode,
          w8NativeVideoFrameHandoffStatus:
            state.hostDiagnostics?.w8NativeVideoFrameHandoffStatus,
          w8NativeVideoLatestFrameFormat:
            state.hostDiagnostics?.w8NativeVideoLatestFrameFormat,
          w8NativeVideoNativeSurfaceReady:
            state.hostDiagnostics?.w8NativeVideoNativeSurfaceReady,
          w8NativeVideoNativeSurfaceMode:
            state.hostDiagnostics?.w8NativeVideoNativeSurfaceMode,
          w8NativeVideoNativeSurfaceStatus:
            state.hostDiagnostics?.w8NativeVideoNativeSurfaceStatus,
          w8NativeVideoNativeSurfaceFormat:
            state.hostDiagnostics?.w8NativeVideoNativeSurfaceFormat,
          w8NativeVideoNativeSurfaceWidth:
            state.hostDiagnostics?.w8NativeVideoNativeSurfaceWidth,
          w8NativeVideoNativeSurfaceHeight:
            state.hostDiagnostics?.w8NativeVideoNativeSurfaceHeight,
          w8NativeVideoNativeSurfaceCopyStatus:
            state.hostDiagnostics?.w8NativeVideoNativeSurfaceCopyStatus,
          w8NativeVideoNativeSurfaceCopyBytes:
            state.hostDiagnostics?.w8NativeVideoNativeSurfaceCopyBytes,
          w8NativeVideoNativeSurfacePresentedFrames:
            state.hostDiagnostics?.w8NativeVideoNativeSurfacePresentedFrames,
          w8NativeVideoNativeSurfaceLastFrameId:
            state.hostDiagnostics?.w8NativeVideoNativeSurfaceLastFrameId,
          h264ReceivedFrames: state.h264ReceivedFrames,
          h264ReceivedDeltaFrames: state.h264ReceivedDeltaFrames,
          h264ReceivedKeyFrames: state.h264ReceivedKeyFrames,
          h264ReceivedSps: state.h264ReceivedSps,
          h264ReceivedPps: state.h264ReceivedPps,
          h264ReceivedIdr: state.h264ReceivedIdr,
          h264LastNalTypes: state.h264LastNalTypes,
          h264LastKeyFrameId: state.h264LastKeyFrameId,
          h264DecoderNeedsKeyFrame: state.h264DecoderNeedsKeyFrame,
          exportText,
        };
      } finally {
        state.h264Decoder = original.h264Decoder;
        state.h264DecoderQueue = original.h264DecoderQueue;
        state.h264DecoderStatus = original.h264DecoderStatus;
        state.h264DecoderKey = original.h264DecoderKey;
        state.h264DecoderCodec = original.h264DecoderCodec;
        state.h264DecoderLatencyMs = original.h264DecoderLatencyMs;
        state.h264DecoderErrorCount = original.h264DecoderErrorCount;
        state.h264DecoderWarned = original.h264DecoderWarned;
        state.h264DecoderLastError = original.h264DecoderLastError;
        state.h264DecoderNeedsKeyFrame = original.h264DecoderNeedsKeyFrame;
        state.h264SkippedDeltaFrames = original.h264SkippedDeltaFrames;
        state.h264DecodedFrames = original.h264DecodedFrames;
        state.h264ReceivedFrames = original.h264ReceivedFrames;
        state.h264ReceivedKeyFrames = original.h264ReceivedKeyFrames;
        state.h264ReceivedDeltaFrames = original.h264ReceivedDeltaFrames;
        state.h264ReceivedSps = original.h264ReceivedSps;
        state.h264ReceivedPps = original.h264ReceivedPps;
        state.h264ReceivedIdr = original.h264ReceivedIdr;
        state.h264LastNalTypes = original.h264LastNalTypes;
        state.h264LastKeyFrameId = original.h264LastKeyFrameId;
        state.videoFrames = original.videoFrames;
        state.videoFrameTimes = original.videoFrameTimes;
        state.videoDecoderQueueMs = original.videoDecoderQueueMs;
        state.videoDroppedStaleFrames = original.videoDroppedStaleFrames;
        state.videoLastDropReason = original.videoLastDropReason;
        state.remoteFrameWidth = original.remoteFrameWidth;
        state.remoteFrameHeight = original.remoteFrameHeight;
        state.requestedFps = original.requestedFps;
        state.negotiatedFps = original.negotiatedFps;
        state.activeHost = original.activeHost;
        state.activePort = original.activePort;
        state.w8NativeVideoSessionStarted = original.w8NativeVideoSessionStarted;
        state.w8NativeVideoSessionPromise = original.w8NativeVideoSessionPromise;
        state.w8NativeVideoPushPromise = original.w8NativeVideoPushPromise;
        state.w8NativeVideoFramesPushed = original.w8NativeVideoFramesPushed;
        state.w8NativeVideoDroppedFrames = original.w8NativeVideoDroppedFrames;
        state.w8NativeVideoHasDecoderConfig = original.w8NativeVideoHasDecoderConfig;
        state.w8NativeVideoCodecString = original.w8NativeVideoCodecString;
        state.w8NativeVideoDecoderProbePromise = original.w8NativeVideoDecoderProbePromise;
        state.w8NativeVideoDecoderReady = original.w8NativeVideoDecoderReady;
        state.w8NativeVideoDecoderMode = original.w8NativeVideoDecoderMode;
        state.w8NativeVideoDecoderReason = original.w8NativeVideoDecoderReason;
        state.w8NativeVideoD3dFeatureLevel = original.w8NativeVideoD3dFeatureLevel;
        state.w8NativeVideoDecoderInitReady = original.w8NativeVideoDecoderInitReady;
        state.w8NativeVideoDecoderInitMode = original.w8NativeVideoDecoderInitMode;
        state.w8NativeVideoDecoderInitReason = original.w8NativeVideoDecoderInitReason;
        state.w8NativeVideoDecoderInitOutputSubtypes = original.w8NativeVideoDecoderInitOutputSubtypes;
        state.w8NativeVideoDecodeStepReady = original.w8NativeVideoDecodeStepReady;
        state.w8NativeVideoDecodeStepMode = original.w8NativeVideoDecodeStepMode;
        state.w8NativeVideoDecodeStepReason = original.w8NativeVideoDecodeStepReason;
        state.w8NativeVideoDecodeStepStatus = original.w8NativeVideoDecodeStepStatus;
        state.w8NativeVideoDecoderSessionActive = original.w8NativeVideoDecoderSessionActive;
        state.w8NativeVideoDecoderSessionMode = original.w8NativeVideoDecoderSessionMode;
        state.w8NativeVideoDecoderSessionReason = original.w8NativeVideoDecoderSessionReason;
        state.w8NativeVideoDecoderSessionStatus = original.w8NativeVideoDecoderSessionStatus;
        state.w8NativeVideoDecoderSessionOutputSubtype = original.w8NativeVideoDecoderSessionOutputSubtype;
        state.w8NativeVideoDecoderSessionSubmittedFrames = original.w8NativeVideoDecoderSessionSubmittedFrames;
        state.w8NativeVideoDecoderSessionAcceptedInputFrames = original.w8NativeVideoDecoderSessionAcceptedInputFrames;
        state.w8NativeVideoDecoderSessionDecodedFrames = original.w8NativeVideoDecoderSessionDecodedFrames;
        state.w8NativeVideoDecoderSessionWorkerThread = original.w8NativeVideoDecoderSessionWorkerThread;
        state.w8NativeVideoDecoderSessionWorkerMode = original.w8NativeVideoDecoderSessionWorkerMode;
        state.w8NativeVideoDecoderSessionWorkerStatus = original.w8NativeVideoDecoderSessionWorkerStatus;
        state.w8NativeVideoFrameHandoffActive = original.w8NativeVideoFrameHandoffActive;
        state.w8NativeVideoFrameHandoffMode = original.w8NativeVideoFrameHandoffMode;
        state.w8NativeVideoFrameHandoffStatus = original.w8NativeVideoFrameHandoffStatus;
        state.w8NativeVideoLatestFrameFormat = original.w8NativeVideoLatestFrameFormat;
        state.w8NativeVideoLatestFrameBytes = original.w8NativeVideoLatestFrameBytes;
        state.w8NativeVideoLatestFrameId = original.w8NativeVideoLatestFrameId;
        state.w8NativeVideoNativeSurfaceReady = original.w8NativeVideoNativeSurfaceReady;
        state.w8NativeVideoNativeSurfaceMode = original.w8NativeVideoNativeSurfaceMode;
        state.w8NativeVideoNativeSurfaceStatus = original.w8NativeVideoNativeSurfaceStatus;
        state.w8NativeVideoNativeSurfaceFormat = original.w8NativeVideoNativeSurfaceFormat;
        state.w8NativeVideoNativeSurfaceWidth = original.w8NativeVideoNativeSurfaceWidth;
        state.w8NativeVideoNativeSurfaceHeight = original.w8NativeVideoNativeSurfaceHeight;
        state.w8NativeVideoNativeSurfaceReason = original.w8NativeVideoNativeSurfaceReason;
        state.w8NativeVideoErrors = original.w8NativeVideoErrors;
        state.w8NativeVideoLastError = original.w8NativeVideoLastError;
        state.w8NativeVideoLastSnapshot = original.w8NativeVideoLastSnapshot;
        state.hostDiagnostics = original.hostDiagnostics;
        if (original.tauriDescriptor) {
          Object.defineProperty(window, "__TAURI__", original.tauriDescriptor);
        } else {
          delete window.__TAURI__;
        }
        if (original.videoDecoderDescriptor) {
          Object.defineProperty(window, "VideoDecoder", original.videoDecoderDescriptor);
        } else {
          delete window.VideoDecoder;
        }
        if (original.encodedVideoChunkDescriptor) {
          Object.defineProperty(window, "EncodedVideoChunk", original.encodedVideoChunkDescriptor);
        } else {
          delete window.EncodedVideoChunk;
        }
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`H.264 key frame detection check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyVideoStutterDiagnostics(session) {
  const result = await evaluate(
    session,
    `(() => {
      if (
        typeof getVideoPerformanceExportStatus !== "function" ||
        typeof updateFpsMetric !== "function" ||
        typeof state !== "object"
      ) {
        return { ok: false, reason: "missing video stutter diagnostics helpers" };
      }

      const original = {
        videoFrameTimes: Array.isArray(state.videoFrameTimes) ? state.videoFrameTimes.slice() : [],
        videoFrameTimingSamples: Array.isArray(state.videoFrameTimingSamples)
          ? state.videoFrameTimingSamples.map((sample) => ({ ...sample }))
          : undefined,
        videoFrames: state.videoFrames,
        actualVideoFps: state.actualVideoFps,
        requestedFps: state.requestedFps,
        negotiatedFps: state.negotiatedFps,
        hostDiagnostics: { ...(state.hostDiagnostics || {}) },
        decoderQueue: Array.isArray(state.h264DecoderQueue) ? state.h264DecoderQueue.slice() : [],
        decoderLatency: state.h264DecoderLatencyMs,
        decoderQueueMs: state.videoDecoderQueueMs,
        droppedStale: state.videoDroppedStaleFrames,
        lastDropReason: state.videoLastDropReason,
        fallbackRecoveryCount: state.h264FallbackRecoveryCount,
        fallbackLastReason: state.h264FallbackLastReason,
        fallbackRecoveryPausedUntil: state.h264FallbackRecoveryPausedUntil,
        fallbackRecoveryPauseCount: state.h264FallbackRecoveryPauseCount,
        connected: state.connected,
        videoWaitingSince: state.videoWaitingSince,
        videoLastFrameAt: state.videoLastFrameAt,
        remoteStatusText: document.querySelector("#remoteStatusText")?.textContent || "",
        metricFpsText: document.querySelector("#metricFps")?.textContent || "",
      };

      try {
        state.videoFrameTimes = [1000, 1016, 1032, 1200, 1216, 1400];
        state.videoFrameTimingSamples = [
          { receivedAt: 1000, remoteMediaAtMs: 0 },
          { receivedAt: 1016, remoteMediaAtMs: 17 },
          { receivedAt: 1032, remoteMediaAtMs: 34 },
          { receivedAt: 1200, remoteMediaAtMs: 51 },
          { receivedAt: 1216, remoteMediaAtMs: 68 },
          { receivedAt: 1400, remoteMediaAtMs: 85 },
        ];
        state.videoFrames = 6;
        state.actualVideoFps = 12.5;
        state.requestedFps = 60;
        state.negotiatedFps = 60;
        state.hostDiagnostics = {};
        state.h264DecoderQueue = [];
        state.h264DecoderLatencyMs = 0;
        state.videoDecoderQueueMs = 260;
        state.videoDroppedStaleFrames = 3;
        state.videoLastDropReason = "queue-overflow-wait-keyframe";
        state.h264FallbackRecoveryCount = 2;
        state.h264FallbackLastReason = "keyframe-wait-timeout-fallback";
        state.h264FallbackRecoveryPauseCount = 1;
        state.h264FallbackRecoveryPausedUntil = performance.now() + 9000;
        const exportText = getVideoPerformanceExportStatus();
        updateFpsMetric();
        const fpsElement = document.querySelector("#metricFps");
        const fpsStatusText = fpsElement?.textContent || "";
        const fpsTitleText = fpsElement?.getAttribute("title") || "";
        const videoStutterStatusVisible =
          fpsStatusText.includes("最大间隔 184 ms") &&
          fpsStatusText.includes("卡顿 2");
        const videoLocalQueueStatusVisible =
          fpsStatusText.includes("本机队列 260 ms") &&
          fpsStatusText.includes("本地过期丢帧 3") &&
          fpsStatusText.includes("回退恢复 2 次") &&
          fpsStatusText.includes("恢复暂停 1 次") &&
          fpsStatusText.includes("暂停剩余");
        const videoLocalQueueTitleVisible =
          fpsTitleText.includes("本机队列 260 ms") &&
          fpsTitleText.includes("本地过期丢帧 3") &&
          fpsTitleText.includes("回退恢复 2 次") &&
          fpsTitleText.includes("恢复暂停 1 次") &&
          fpsTitleText.includes("暂停剩余");
        const videoBacklogHealthVisible =
          exportText.includes("视频积压") &&
          fpsStatusText.includes("视频积压") &&
          fpsTitleText.includes("视频积压");
        state.videoFrameTimes = [2000, 2017, 2034, 2051, 2068, 2085];
        state.videoFrameTimingSamples = [
          { receivedAt: 2000, remoteMediaAtMs: 0 },
          { receivedAt: 2017, remoteMediaAtMs: 17 },
          { receivedAt: 2034, remoteMediaAtMs: 34 },
          { receivedAt: 2051, remoteMediaAtMs: 51 },
          { receivedAt: 2068, remoteMediaAtMs: 68 },
          { receivedAt: 2085, remoteMediaAtMs: 85 },
        ];
        state.videoFrames = 6;
        state.actualVideoFps = 60;
        state.requestedFps = 60;
        state.negotiatedFps = 60;
        state.hostDiagnostics = {};
        state.h264DecoderQueue = [];
        state.h264DecoderLatencyMs = 0;
        state.videoDecoderQueueMs = 32;
        state.videoDroppedStaleFrames = 0;
        state.videoLastDropReason = "";
        state.h264FallbackRecoveryCount = 0;
        state.h264FallbackLastReason = "";
        state.h264FallbackRecoveryPauseCount = 0;
        state.h264FallbackRecoveryPausedUntil = 0;
        const healthyExportText = getVideoPerformanceExportStatus();
        updateFpsMetric();
        const healthyFpsStatusText = fpsElement?.textContent || "";
        const healthyLiveStatusVisible =
          healthyExportText.includes("视频实时正常") &&
          healthyFpsStatusText.includes("视频实时正常");
        const firstFrameWaitNow = 9000;
        state.connected = true;
        state.videoFrames = 0;
        state.videoFrameTimes = [];
        state.actualVideoFps = 0;
        state.videoWaitingSince = firstFrameWaitNow - 4300;
        const firstFrameWaitRendered =
          typeof renderVideoFirstFrameWaitStatus === "function" &&
          renderVideoFirstFrameWaitStatus(firstFrameWaitNow);
        const firstFrameWaitStatusText = document.querySelector("#remoteStatusText")?.textContent || "";
        const firstFrameWaitExportText = getVideoPerformanceExportStatus(firstFrameWaitNow);
        const videoFirstFrameWaitVisible =
          firstFrameWaitRendered &&
          firstFrameWaitStatusText.includes("等待视频首帧") &&
          firstFrameWaitStatusText.includes("已等待 4s") &&
          firstFrameWaitExportText.includes("等待视频首帧") &&
          firstFrameWaitExportText.includes("已等待 4s");
        const streamStallNow = 14000;
        state.connected = true;
        state.videoFrames = 4;
        state.videoFrameTimes = [1000, 1016, 1032, 1048];
        state.actualVideoFps = 60;
        state.videoWaitingSince = 0;
        state.videoLastFrameAt = streamStallNow - 4300;
        const streamStallRendered =
          typeof renderVideoStreamStallStatus === "function" &&
          renderVideoStreamStallStatus(streamStallNow);
        const streamStallStatusText = document.querySelector("#remoteStatusText")?.textContent || "";
        const streamStallExportText = getVideoPerformanceExportStatus(streamStallNow);
        const videoStreamStallVisible =
          streamStallRendered &&
          streamStallStatusText.includes("视频断流") &&
          streamStallStatusText.includes("最后收到 4s 前") &&
          streamStallExportText.includes("视频断流") &&
          streamStallExportText.includes("最后收到 4s 前");
        return {
          ok:
            exportText.includes("平均间隔 80 ms") &&
            exportText.includes("最大间隔 184 ms") &&
            exportText.includes("远端媒体平均间隔 17 ms") &&
            exportText.includes("远端媒体最大间隔 17 ms") &&
            exportText.includes("卡顿 2") &&
            exportText.includes("最大卡顿 184 ms") &&
            exportText.includes("本机队列 260 ms") &&
            exportText.includes("本地过期丢帧 3") &&
            exportText.includes("回退恢复 2 次") &&
            exportText.includes("恢复暂停 1 次") &&
            videoStutterStatusVisible &&
            videoLocalQueueStatusVisible &&
            videoLocalQueueTitleVisible &&
            videoBacklogHealthVisible &&
            healthyLiveStatusVisible &&
            videoFirstFrameWaitVisible &&
            videoStreamStallVisible,
          exportText,
          healthyExportText,
          videoStutterStatusVisible,
          videoLocalQueueStatusVisible,
          videoLocalQueueTitleVisible,
          videoBacklogHealthVisible,
          healthyLiveStatusVisible,
          fpsStatusText,
          fpsTitleText,
          healthyFpsStatusText,
          videoFirstFrameWaitVisible,
          firstFrameWaitRendered,
          firstFrameWaitStatusText,
          firstFrameWaitExportText,
          videoStreamStallVisible,
          streamStallRendered,
          streamStallStatusText,
          streamStallExportText,
        };
      } finally {
        state.videoFrameTimes = original.videoFrameTimes;
        if (original.videoFrameTimingSamples === undefined) {
          delete state.videoFrameTimingSamples;
        } else {
          state.videoFrameTimingSamples = original.videoFrameTimingSamples;
        }
        state.videoFrames = original.videoFrames;
        state.actualVideoFps = original.actualVideoFps;
        state.requestedFps = original.requestedFps;
        state.negotiatedFps = original.negotiatedFps;
        state.hostDiagnostics = original.hostDiagnostics;
        state.h264DecoderQueue = original.decoderQueue;
        state.h264DecoderLatencyMs = original.decoderLatency;
        state.videoDecoderQueueMs = original.decoderQueueMs;
        state.videoDroppedStaleFrames = original.droppedStale;
        state.videoLastDropReason = original.lastDropReason;
        state.h264FallbackRecoveryCount = original.fallbackRecoveryCount;
        state.h264FallbackLastReason = original.fallbackLastReason;
        state.h264FallbackRecoveryPausedUntil = original.fallbackRecoveryPausedUntil;
        state.h264FallbackRecoveryPauseCount = original.fallbackRecoveryPauseCount;
        state.connected = original.connected;
        if (original.videoWaitingSince === undefined) {
          delete state.videoWaitingSince;
        } else {
          state.videoWaitingSince = original.videoWaitingSince;
        }
        if (original.videoLastFrameAt === undefined) {
          delete state.videoLastFrameAt;
        } else {
          state.videoLastFrameAt = original.videoLastFrameAt;
        }
        const remoteStatus = document.querySelector("#remoteStatusText");
        if (remoteStatus) remoteStatus.textContent = original.remoteStatusText;
        const metricFps = document.querySelector("#metricFps");
        if (metricFps) metricFps.textContent = original.metricFpsText;
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`video stutter diagnostics check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyH264LatencyQueueGuard(session) {
  const result = await evaluate(
    session,
    `(async () => {
      if (
        typeof resyncH264DecoderQueueForLatency !== "function" ||
        typeof maybeResyncH264DecoderQueueForLatency !== "function" ||
        typeof maybeRequestH264LiveBacklogKeyFrame !== "function" ||
        typeof getVideoPerformanceExportStatus !== "function" ||
        typeof ensureH264Decoder !== "function" ||
        typeof recoverH264AfterVisibilityReturn !== "function" ||
        typeof state !== "object"
      ) {
        return { ok: false, reason: "missing H.264 latency queue guard helpers" };
      }

      const originalDecoder = state.h264Decoder;
      const originalDecoderQueue = Array.isArray(state.h264DecoderQueue) ? state.h264DecoderQueue.slice() : [];
      const originalDecoderStatus = state.h264DecoderStatus;
      const originalDecoderKey = state.h264DecoderKey;
      const originalDecoderCodec = state.h264DecoderCodec;
      const originalDecoderLatency = state.h264DecoderLatencyMs;
      const originalDecoderErrors = state.h264DecoderErrorCount;
      const originalDecoderWarned = state.h264DecoderWarned;
      const originalDecoderLastError = state.h264DecoderLastError;
      const originalNeedsKeyFrame = state.h264DecoderNeedsKeyFrame;
      const originalSkippedDelta = state.h264SkippedDeltaFrames;
      const originalDecodedFrames = state.h264DecodedFrames;
      const originalFallbackActive = state.h264FallbackActive;
      const originalFallbackReason = state.h264FallbackReason;
      const originalFallbackRecoveryDueAt = state.h264FallbackRecoveryDueAt;
      const originalFallbackRecoveryJpegFrames = state.h264FallbackRecoveryJpegFrames;
      const originalFallbackRecoveryRequested = state.h264FallbackRecoveryRequested;
      const originalFallbackRecoveryCount = state.h264FallbackRecoveryCount;
      const originalFallbackLastReason = state.h264FallbackLastReason;
      const originalFallbackRecoveryPausedUntil = state.h264FallbackRecoveryPausedUntil;
      const originalFallbackRecoveryPauseCount = state.h264FallbackRecoveryPauseCount;
      const originalFallbackRecoveryTimestamps = Array.isArray(state.h264FallbackRecoveryTimestamps)
        ? state.h264FallbackRecoveryTimestamps.slice()
        : [];
      const originalConnected = state.connected;
      const originalClient = state.client;
      const originalVideoFrames = state.videoFrames;
      const originalVideoFrameTimes = Array.isArray(state.videoFrameTimes) ? state.videoFrameTimes.slice() : [];
      const originalRemoteFrameWidth = state.remoteFrameWidth;
      const originalRemoteFrameHeight = state.remoteFrameHeight;
      const originalDroppedStale = state.videoDroppedStaleFrames;
      const originalQueueMs = state.videoDecoderQueueMs;
      const originalLastDropReason = state.videoLastDropReason;
      const originalVisibilityHiddenAt = state.videoVisibilityHiddenAt;
      const originalVisibilityRecoveryCount = state.h264VisibilityRecoveryCount;
      const originalVisibilityRecoveryLastAt = state.h264VisibilityRecoveryLastAt;
      const originalKeyFrameWaitStartedAt = state.h264KeyFrameWaitStartedAt;
      const originalKeyFrameRecoveryLastRequestedAt = state.h264KeyFrameRecoveryLastRequestedAt;
      const originalRecoveryQueueGraceUntil = state.h264RecoveryQueueGraceUntil;
      const originalRecoveryInFlight = state.h264RecoveryInFlight;
      const originalRecoveryKeyFrameReceivedAt = state.h264RecoveryKeyFrameReceivedAt;
      const originalRecoveryFrameDrawnAt = state.h264RecoveryFrameDrawnAt;
      const originalLiveBacklogRecoveryLastRequestedAt = state.h264LiveBacklogRecoveryLastRequestedAt;
      const originalLiveBacklogRecoveryCount = state.h264LiveBacklogRecoveryCount;
      const originalHostDiagnostics = { ...(state.hostDiagnostics || {}) };
      const originalVideoDecoderDescriptor = Object.getOwnPropertyDescriptor(window, "VideoDecoder");

      let closeCalls = 0;
      try {
        state.h264Decoder = {
          state: "configured",
          close: () => { closeCalls += 1; },
        };
        state.h264DecoderQueue = Array.from({ length: 9 }, (_, index) => ({
          frameId: index + 1,
          queuedAt: 100 + index,
          timestampUs: index * 33333,
        }));
        state.h264DecoderStatus = "decoding";
        state.h264DecoderKey = "avc1.420029:annexb";
        state.h264DecoderCodec = "avc1.420029:annexb";
        state.h264DecoderLatencyMs = 488;
        state.h264DecoderErrorCount = 0;
        state.h264DecoderWarned = false;
        state.h264DecoderLastError = "";
        state.h264DecoderNeedsKeyFrame = false;
        state.h264SkippedDeltaFrames = 0;
        state.h264DecodedFrames = 12;
        state.videoDecoderQueueMs = 0;
        state.videoDroppedStaleFrames = 0;
        state.videoLastDropReason = "";

        const resync = resyncH264DecoderQueueForLatency({
          isKeyFrame: false,
          frameId: 99,
          now: 1000,
          reason: "queue-overflow-wait-keyframe",
        });
        const exportText = getVideoPerformanceExportStatus();
        const deltaOk =
          resync?.dropFrame === true &&
          resync?.droppedFrames === 10 &&
          closeCalls === 1 &&
          state.h264Decoder === null &&
          state.h264DecoderQueue.length === 0 &&
          state.h264DecoderNeedsKeyFrame === true &&
          state.h264DecoderStatus === "waiting-keyframe" &&
          state.h264SkippedDeltaFrames === 1 &&
          state.videoDroppedStaleFrames === 10 &&
          state.videoLastDropReason === "queue-overflow-wait-keyframe" &&
          exportText.includes("本机队列 900 ms") &&
          exportText.includes("解码延迟 488 ms") &&
          exportText.includes("本地过期丢帧 10") &&
          exportText.includes("原因 queue-overflow-wait-keyframe") &&
          exportText.includes("跳过 delta 1") &&
          exportText.includes("需要关键帧");

        const fakeDecoders = [];
        class FakeVideoDecoder {
          static async isConfigSupported() {
            return { supported: true };
          }
          constructor(options = {}) {
            this.options = options;
            this.state = "configured";
            this.decodeQueueSize = 0;
            this.decodedChunks = [];
            fakeDecoders.push(this);
          }
          configure(config) {
            this.config = config;
          }
          decode(chunk) {
            this.decodedChunks.push(chunk);
          }
          close() {
            this.state = "closed";
          }
        }
        Object.defineProperty(window, "VideoDecoder", {
          configurable: true,
          value: FakeVideoDecoder,
        });

        const closeCallsBeforeFirstSurfaceGrace = closeCalls;
        state.h264Decoder = {
          state: "configured",
          decodeQueueSize: 9,
          close: () => { closeCalls += 1; },
        };
        state.h264DecoderQueue = Array.from({ length: 9 }, (_, index) => ({
          frameId: index + 301,
          queuedAt: 100 + index,
          timestampUs: index * 33333,
        }));
        state.h264DecoderStatus = "decoding";
        state.h264DecoderKey = "avc1.420029:annexb";
        state.h264DecoderCodec = "avc1.420029:annexb";
        state.h264DecoderLatencyMs = 0;
        state.h264DecoderNeedsKeyFrame = false;
        state.h264SkippedDeltaFrames = 0;
        state.h264DecodedFrames = 0;
        state.videoDecoderQueueMs = 0;
        state.videoDroppedStaleFrames = 0;
        state.videoLastDropReason = "";

        const firstSurfaceGraceResync = maybeResyncH264DecoderQueueForLatency({
          isKeyFrame: false,
          frameId: 309,
          now: 1000,
        });
        const firstSurfaceQueueGrace =
          firstSurfaceGraceResync?.dropFrame === false &&
          closeCalls === closeCallsBeforeFirstSurfaceGrace &&
          state.h264Decoder !== null &&
          state.h264DecoderQueue.length === 9 &&
          state.h264DecoderNeedsKeyFrame === false &&
          state.h264DecoderStatus === "decoding" &&
          state.h264SkippedDeltaFrames === 0 &&
          state.videoDroppedStaleFrames === 0 &&
          state.videoLastDropReason === "";

        state.h264Decoder = {
          state: "configured",
          close: () => { closeCalls += 1; },
        };
        state.h264DecoderQueue = Array.from({ length: 9 }, (_, index) => ({
          frameId: index + 11,
          queuedAt: 200 + index,
          timestampUs: index * 33333,
        }));
        state.h264DecoderStatus = "decoding";
        state.h264DecoderKey = "avc1.420029:annexb";
        state.h264DecoderCodec = "avc1.420029:annexb";
        state.h264DecoderLatencyMs = 333;
        state.h264DecodedFrames = 12;
        state.h264DecoderNeedsKeyFrame = false;
        state.videoDecoderQueueMs = 0;
        state.videoDroppedStaleFrames = 0;
        state.videoLastDropReason = "";

        const keyResync = resyncH264DecoderQueueForLatency({
          isKeyFrame: true,
          frameId: 120,
          now: 1100,
          reason: "queue-overflow-wait-keyframe",
        });
        await ensureH264Decoder({ codecString: "avc1.420029", encoding: "annexb-base64" });
        const keyExportText = getVideoPerformanceExportStatus();
        const keyPreserved =
          keyResync?.dropFrame === false &&
          keyResync?.droppedFrames === 9 &&
          state.videoDroppedStaleFrames === 9 &&
          state.videoDecoderQueueMs === 900 &&
          state.videoLastDropReason === "queue-overflow-wait-keyframe" &&
          keyExportText.includes("本地过期丢帧 9") &&
          keyExportText.includes("原因 queue-overflow-wait-keyframe");

        const closeCallsBeforeWebCodecsBackpressure = closeCalls;
        state.h264Decoder = {
          state: "configured",
          decodeQueueSize: 9,
          close: () => { closeCalls += 1; },
        };
        state.h264DecoderQueue = [
          { frameId: 201, queuedAt: 1050, timestampUs: 0 },
          { frameId: 202, queuedAt: 1060, timestampUs: 33333 },
        ];
        state.h264DecoderStatus = "decoding";
        state.h264DecoderKey = "avc1.420029:annexb";
        state.h264DecoderCodec = "avc1.420029:annexb";
        state.h264DecoderLatencyMs = 0;
        state.h264DecodedFrames = 12;
        state.h264DecoderNeedsKeyFrame = false;
        state.h264SkippedDeltaFrames = 0;
        state.videoDecoderQueueMs = 0;
        state.videoDroppedStaleFrames = 0;
        state.videoLastDropReason = "";

        const webCodecsQueueResync = maybeResyncH264DecoderQueueForLatency({
          isKeyFrame: false,
          frameId: 203,
          now: 1100,
        });
        const webCodecsQueueExportText = getVideoPerformanceExportStatus();
        const webCodecsQueueBackpressure =
          webCodecsQueueResync?.dropFrame === true &&
          webCodecsQueueResync?.droppedFrames === 10 &&
          closeCalls === closeCallsBeforeWebCodecsBackpressure + 1 &&
          state.h264Decoder === null &&
          state.h264DecoderQueue.length === 0 &&
          state.h264DecoderNeedsKeyFrame === true &&
          state.h264DecoderStatus === "waiting-keyframe" &&
          state.h264SkippedDeltaFrames === 1 &&
          state.videoDroppedStaleFrames === 10 &&
          state.videoLastDropReason === "queue-overflow-wait-keyframe" &&
          webCodecsQueueExportText.includes("本地过期丢帧 10") &&
          webCodecsQueueExportText.includes("原因 queue-overflow-wait-keyframe");

        const liveBacklogSettings = [];
        const liveBacklogNow = performance.now();
        state.connected = true;
        state.client = {
          sendDisplaySettings(message) {
            liveBacklogSettings.push(message);
          },
        };
        state.h264FallbackActive = false;
        state.h264Decoder = {
          state: "configured",
          close: () => { closeCalls += 1; },
        };
        state.h264DecoderQueue = Array.from({ length: 4 }, (_, index) => ({
          frameId: index + 240,
          queuedAt: liveBacklogNow - 132 + index,
          timestampUs: index * 16667,
          keyFrame: false,
        }));
        state.h264DecoderStatus = "decoding";
        state.h264DecoderKey = "avc1.420029:annexb";
        state.h264DecoderCodec = "avc1.420029:annexb";
        state.h264DecoderNeedsKeyFrame = false;
        state.h264SkippedDeltaFrames = 0;
        state.h264DecodedFrames = 12;
        state.requestedFps = 60;
        state.negotiatedFps = 60;
        state.videoDroppedStaleFrames = 0;
        state.videoLastDropReason = "";
        state.h264LiveBacklogRecoveryLastRequestedAt = 0;
        state.h264LiveBacklogRecoveryCount = 0;

        const closeCallsBeforeLiveBacklogRequest = closeCalls;
        const staleDropsBeforeLiveBacklogRequest = state.videoDroppedStaleFrames;
        const liveBacklogRequest = maybeRequestH264LiveBacklogKeyFrame({
          isKeyFrame: false,
          frameId: 244,
          now: liveBacklogNow,
        });
        const liveBacklogRepeat = maybeRequestH264LiveBacklogKeyFrame({
          isKeyFrame: false,
          frameId: 245,
          now: liveBacklogNow + 100,
        });
        const liveBacklogExportText = getVideoPerformanceExportStatus(liveBacklogNow + 100);
        const liveBacklogKeyFrameRequest =
          liveBacklogRequest?.requested === true &&
          liveBacklogRequest?.dropFrame === false &&
          liveBacklogRequest?.droppedFrames === 0 &&
          liveBacklogRepeat?.requested === false &&
          closeCalls === closeCallsBeforeLiveBacklogRequest &&
          state.h264Decoder !== null &&
          state.h264DecoderQueue.length === 4 &&
          state.h264DecoderNeedsKeyFrame === false &&
          state.h264DecoderStatus === "decoding" &&
          state.h264SkippedDeltaFrames === 0 &&
          state.h264LiveBacklogRecoveryCount === 1 &&
          state.videoDroppedStaleFrames === staleDropsBeforeLiveBacklogRequest &&
          state.videoLastDropReason === "live-backlog-keyframe-request" &&
          liveBacklogSettings.length === 1 &&
          liveBacklogSettings[0]?.preferredVideoCodec === "h264" &&
          liveBacklogSettings[0]?.preferredVideoEncoding === "annexb" &&
          liveBacklogExportText.includes("追实时请求 1 次") &&
          !liveBacklogExportText.includes("本地过期丢帧 5") &&
          !liveBacklogExportText.includes("跳过 delta 1") &&
          !liveBacklogExportText.includes("需要关键帧") &&
          liveBacklogExportText.includes("原因 live-backlog-keyframe-request");

        if (typeof maybeRecoverH264VideoFallback !== "function") {
          return { ok: false, reason: "missing H.264 fallback recovery helper" };
        }

        const fallbackSettings = [];
        const makeBase64 = (bytes) => {
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          return btoa(binary);
        };
        const makeDeltaPayload = () => makeBase64(new Uint8Array([0, 0, 0, 1, 0x41, 0, 0, 0]));
        const makeKeyPayload = () => makeBase64(new Uint8Array([0, 0, 0, 1, 0x67, 0, 0, 0, 1, 0x68, 0, 0, 0, 1, 0x65, 0]));
        const makeJpegDataUrl = () => "data:image/jpeg;base64," + makeBase64(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
        state.connected = true;
        state.client = {
          sendDisplaySettings(message) {
            fallbackSettings.push(message);
          },
        };
        state.h264Decoder = null;
        state.h264DecoderQueue = [];
        state.h264DecoderStatus = "waiting-keyframe";
        state.h264DecoderKey = "";
        state.h264DecoderCodec = "";
        state.h264DecoderNeedsKeyFrame = true;
        state.requestedFps = 60;
        state.negotiatedFps = 60;
        state.h264SkippedDeltaFrames = 89;
        state.h264FallbackActive = false;
        state.h264FallbackReason = "";
        state.h264FallbackRecoveryCount = 0;
        state.h264FallbackLastReason = "";
        state.h264FallbackRecoveryPausedUntil = 0;
        state.h264FallbackRecoveryPauseCount = 0;
        state.h264FallbackRecoveryTimestamps = [];
        state.videoLastDropReason = "";
        state.videoDroppedStaleFrames = 0;
        state.videoFrames = 0;
        state.videoFrameTimes = [];
        await renderH264VideoFrame({
          payload: makeDeltaPayload(),
          encoding: "annexb-base64",
          codecString: "avc1.420029",
          width: 1920,
          height: 1080,
          frameId: 390,
          keyFrame: false,
        });
        const keyFrameWaitGraceExportText = getVideoPerformanceExportStatus();
        const keyFrameWaitGrace =
          state.h264FallbackActive === false &&
          state.h264DecoderStatus === "waiting-keyframe" &&
          state.h264SkippedDeltaFrames === 90 &&
          fallbackSettings.length === 0 &&
          keyFrameWaitGraceExportText.includes("跳过 delta 90") &&
          keyFrameWaitGraceExportText.includes("需要关键帧") &&
          !keyFrameWaitGraceExportText.includes("解码 JPEG 回退");

        state.h264SkippedDeltaFrames = 179;
        await renderH264VideoFrame({
          payload: makeDeltaPayload(),
          encoding: "annexb-base64",
          codecString: "avc1.420029",
          width: 1920,
          height: 1080,
          frameId: 480,
          keyFrame: false,
        });
        const keyFrameWaitH264RecoveryExportText = getVideoPerformanceExportStatus();
        const keyFrameWaitH264Recovery =
          state.h264FallbackActive === false &&
          state.h264DecoderStatus === "recovering" &&
          state.h264SkippedDeltaFrames === 0 &&
          state.videoLastDropReason === "keyframe-wait-h264-recovery" &&
          fallbackSettings.length === 1 &&
          fallbackSettings[0]?.preferredVideoCodec === "h264" &&
          fallbackSettings[0]?.preferredVideoEncoding === "annexb" &&
          keyFrameWaitH264RecoveryExportText.includes("原因 keyframe-wait-h264-recovery") &&
          !keyFrameWaitH264RecoveryExportText.includes("解码 JPEG 回退");

        state.h264FallbackRecoveryDueAt = performance.now() - 1;
        await renderVideoFrame({
          dataUrl: makeJpegDataUrl(),
          codec: "jpeg",
          encoding: "data-url",
          width: 1920,
          height: 1080,
          frameId: 391,
        });
        await renderVideoFrame({
          dataUrl: makeJpegDataUrl(),
          codec: "jpeg",
          encoding: "data-url",
          width: 1920,
          height: 1080,
          frameId: 392,
        });
        await renderVideoFrame({
          dataUrl: makeJpegDataUrl(),
          codec: "jpeg",
          encoding: "data-url",
          width: 1920,
          height: 1080,
          frameId: 393,
        });
        const fallbackRecoveryExportText = getVideoPerformanceExportStatus();
        const fallbackRecovery =
          fallbackSettings.length === 1 &&
          state.h264FallbackActive === false &&
          state.h264DecoderStatus === "recovering" &&
          state.h264FallbackRecoveryCount === 0 &&
          !fallbackRecoveryExportText.includes("回退恢复");

        const renderStableJpegFrames = async (startFrameId) => {
          for (let offset = 0; offset < 3; offset += 1) {
            await renderVideoFrame({
              dataUrl: makeJpegDataUrl(),
              codec: "jpeg",
              encoding: "data-url",
              width: 1920,
              height: 1080,
              frameId: startFrameId + offset,
            });
          }
        };

        requestJpegVideoFallback("第二次等待关键帧", { dropReason: "keyframe-wait-timeout-fallback" });
        state.h264FallbackRecoveryDueAt = performance.now() - 1;
        await renderStableJpegFrames(394);
        const secondRecoveryExportText = getVideoPerformanceExportStatus();
        const secondFallbackRecovery =
          fallbackSettings.length === 3 &&
          fallbackSettings[2]?.preferredVideoCodec === "h264" &&
          fallbackSettings[2]?.preferredVideoEncoding === "annexb" &&
          state.h264FallbackRecoveryCount === 1 &&
          secondRecoveryExportText.includes("回退恢复 1 次");

        requestJpegVideoFallback("第三次等待关键帧", { dropReason: "keyframe-wait-timeout-fallback" });
        state.h264FallbackRecoveryDueAt = performance.now() - 1;
        await renderStableJpegFrames(397);
        const fallbackRecoveryPausedExportText = getVideoPerformanceExportStatus();
        const fallbackRecoveryPause =
          fallbackSettings.length === 5 &&
          fallbackSettings[4]?.preferredVideoCodec === "h264" &&
          state.h264FallbackActive === false &&
          state.h264DecoderStatus === "recovering" &&
          state.h264FallbackRecoveryCount === 2 &&
          fallbackRecoveryPausedExportText.includes("最近回退：第三次等待关键帧");

        const visibilitySettingsBefore = fallbackSettings.length;
        state.connected = true;
        state.client = {
          sendDisplaySettings(message) {
            fallbackSettings.push(message);
          },
        };
        state.h264FallbackActive = false;
        state.h264Decoder = {
          state: "configured",
          close: () => { closeCalls += 1; },
        };
        state.h264DecoderQueue = Array.from({ length: 9 }, (_, index) => ({
          frameId: index + 601,
          queuedAt: performance.now() - 470 + index,
          timestampUs: index * 33333,
        }));
        state.h264DecoderStatus = "waiting-keyframe";
        state.h264DecoderKey = "avc1.420029:annexb";
        state.h264DecoderCodec = "avc1.420029:annexb";
        state.h264DecoderNeedsKeyFrame = true;
        state.h264SkippedDeltaFrames = 12;
        state.videoDroppedStaleFrames = 142;
        state.videoDecoderQueueMs = 470;
        state.videoLastDropReason = "queue-overflow-wait-keyframe";
        state.videoVisibilityHiddenAt = performance.now() - 1200;
        state.h264VisibilityRecoveryCount = 0;
        state.h264VisibilityRecoveryLastAt = 0;
        const visibilityRecoveryResult = recoverH264AfterVisibilityReturn("visibility-return-h264-recovery");
        const visibilityRecoveryExportText = getVideoPerformanceExportStatus();
        const visibilityRecovery =
          visibilityRecoveryResult === true &&
          state.h264FallbackActive === false &&
          state.h264DecoderStatus === "recovering" &&
          state.h264DecoderNeedsKeyFrame === true &&
          state.h264SkippedDeltaFrames === 0 &&
          state.h264DecoderQueue.length === 0 &&
          state.h264VisibilityRecoveryCount === 1 &&
          state.videoLastDropReason === "visibility-return-h264-recovery" &&
          fallbackSettings.length === visibilitySettingsBefore + 1 &&
          fallbackSettings.at(-1)?.preferredVideoCodec === "h264" &&
          fallbackSettings.at(-1)?.preferredVideoEncoding === "annexb" &&
          visibilityRecoveryExportText.includes("原因 visibility-return-h264-recovery") &&
          !visibilityRecoveryExportText.includes("解码 JPEG 回退");

        const timedKeyFrameRecoverySettingsBefore = fallbackSettings.length;
        state.connected = true;
        state.client = {
          sendDisplaySettings(message) {
            fallbackSettings.push(message);
          },
        };
        state.h264FallbackActive = false;
        state.h264Decoder = null;
        state.h264DecoderQueue = [];
        state.h264DecoderStatus = "waiting-keyframe";
        state.h264DecoderKey = "avc1.420029:annexb";
        state.h264DecoderCodec = "avc1.420029:annexb";
        state.h264DecoderNeedsKeyFrame = true;
        state.h264SkippedDeltaFrames = 12;
        state.h264DecodedFrames = 12;
        state.requestedFps = 60;
        state.negotiatedFps = 60;
        state.videoLastDropReason = "visibility-return-h264-recovery";
        state.videoDroppedStaleFrames = 18;
        state.videoDecoderQueueMs = 503;
        state.h264KeyFrameWaitStartedAt = performance.now() - 1300;
        state.h264KeyFrameRecoveryLastRequestedAt = performance.now() - 1300;
        await renderH264VideoFrame({
          payload: makeDeltaPayload(),
          encoding: "annexb-base64",
          codecString: "avc1.420029",
          width: 1920,
          height: 1080,
          frameId: 701,
          keyFrame: false,
        });
        const timedKeyFrameRecoveryExportText = getVideoPerformanceExportStatus();
        const timedKeyFrameRecovery =
          state.h264FallbackActive === false &&
          state.h264DecoderStatus === "recovering" &&
          state.h264DecoderNeedsKeyFrame === true &&
          state.h264SkippedDeltaFrames === 0 &&
          state.videoLastDropReason === "keyframe-wait-h264-recovery" &&
          fallbackSettings.length === timedKeyFrameRecoverySettingsBefore + 1 &&
          fallbackSettings.at(-1)?.preferredVideoCodec === "h264" &&
          fallbackSettings.at(-1)?.preferredVideoEncoding === "annexb" &&
          timedKeyFrameRecoveryExportText.includes("原因 keyframe-wait-h264-recovery") &&
          !timedKeyFrameRecoveryExportText.includes("解码 JPEG 回退");

        const closeCallsBeforePostRecoveryQueueGrace = closeCalls;
        const postRecoveryQueueGraceNow = performance.now();
        state.h264FallbackActive = false;
        state.h264Decoder = {
          state: "configured",
          close: () => { closeCalls += 1; },
        };
        state.h264DecoderQueue = Array.from({ length: 4 }, (_, index) => ({
          frameId: index + 801,
          queuedAt: postRecoveryQueueGraceNow - 533 + index,
          timestampUs: index * 33333,
        }));
        state.h264DecoderStatus = "recovering";
        state.h264DecoderKey = "avc1.420029:annexb";
        state.h264DecoderCodec = "avc1.420029:annexb";
        state.h264DecoderNeedsKeyFrame = true;
        state.h264SkippedDeltaFrames = 0;
        state.h264DecodedFrames = 12;
        state.videoDroppedStaleFrames = 18;
        state.videoDecoderQueueMs = 503;
        state.videoLastDropReason = "keyframe-wait-h264-recovery";
        state.h264KeyFrameWaitStartedAt = postRecoveryQueueGraceNow - 600;
        state.h264KeyFrameRecoveryLastRequestedAt = postRecoveryQueueGraceNow - 100;
        state.h264RecoveryQueueGraceUntil = postRecoveryQueueGraceNow + 1200;
        const postRecoveryGraceResync = maybeResyncH264DecoderQueueForLatency({
          isKeyFrame: false,
          frameId: 805,
          now: postRecoveryQueueGraceNow,
        });
        const postRecoveryQueueGrace =
          postRecoveryGraceResync?.dropFrame === false &&
          closeCalls === closeCallsBeforePostRecoveryQueueGrace &&
          state.h264Decoder !== null &&
          state.h264DecoderQueue.length === 4 &&
          state.h264DecoderNeedsKeyFrame === true &&
          state.h264DecoderStatus === "recovering" &&
          state.videoDroppedStaleFrames === 18 &&
          state.videoLastDropReason === "keyframe-wait-h264-recovery";

        const recoveryKeyFrameSettingsBefore = fallbackSettings.length;
        requestH264VideoRecovery("测试 H.264 恢复请求", { dropReason: "keyframe-wait-h264-recovery" });
        const recoveryRequested =
          state.h264RecoveryInFlight === true &&
          state.h264RecoveryKeyFrameReceivedAt === 0 &&
          state.h264RecoveryFrameDrawnAt === 0 &&
          fallbackSettings.length === recoveryKeyFrameSettingsBefore + 1;
        await renderH264VideoFrame({
          payload: makeKeyPayload(),
          encoding: "annexb-base64",
          codecString: "avc1.420029",
          width: 1920,
          height: 1080,
          frameId: 806,
          keyFrame: true,
        });
        const recoveryKeyFrameProgress =
          recoveryRequested &&
          state.h264RecoveryInFlight === true &&
          Number(state.h264RecoveryKeyFrameReceivedAt) > 0 &&
          state.h264RecoveryFrameDrawnAt === 0 &&
          state.h264DecoderNeedsKeyFrame === false &&
          state.h264DecoderQueue.some((item) => item.frameId === 806 && item.keyFrame === true);

        const closeCallsBeforeRecoveryKeyFrameJump = closeCalls;
        const staleDropsBeforeRecoveryKeyFrameJump = state.videoDroppedStaleFrames;
        const recoveryKeyFrameJumpNow = performance.now();
        state.h264FallbackActive = false;
        state.h264Decoder = {
          state: "configured",
          decodeQueueSize: 9,
          close: () => { closeCalls += 1; },
        };
        state.h264DecoderQueue = Array.from({ length: 9 }, (_, index) => ({
          frameId: index + 900,
          queuedAt: recoveryKeyFrameJumpNow - 900 + index,
          timestampUs: index * 33333,
          keyFrame: false,
        }));
        state.h264DecoderStatus = "decoding";
        state.h264DecoderKey = "avc1.420029:annexb";
        state.h264DecoderCodec = "avc1.420029:annexb";
        state.h264DecoderNeedsKeyFrame = false;
        state.h264DecodedFrames = 12;
        state.videoDecoderQueueMs = 900;
        state.videoLastDropReason = "keyframe-wait-h264-recovery";
        state.h264RecoveryInFlight = true;
        state.h264RecoveryKeyFrameReceivedAt = 0;
        state.h264RecoveryFrameDrawnAt = 0;
        state.h264RecoveryQueueGraceUntil = 0;
        const fakeDecoderCountBeforeRecoveryKeyFrameJump = fakeDecoders.length;
        await renderH264VideoFrame({
          payload: makeKeyPayload(),
          encoding: "annexb-base64",
          codecString: "avc1.420029",
          width: 1920,
          height: 1080,
          frameId: 906,
          keyFrame: true,
        });
        const recoveryKeyFrameJumpedLive =
          closeCalls === closeCallsBeforeRecoveryKeyFrameJump + 1 &&
          fakeDecoders.length === fakeDecoderCountBeforeRecoveryKeyFrameJump + 1 &&
          state.h264Decoder === fakeDecoders.at(-1) &&
          state.h264DecoderQueue.length === 1 &&
          state.h264DecoderQueue[0]?.frameId === 906 &&
          state.h264DecoderQueue[0]?.keyFrame === true &&
          state.h264RecoveryInFlight === true &&
          Number(state.h264RecoveryKeyFrameReceivedAt) > 0 &&
          state.h264RecoveryFrameDrawnAt === 0 &&
          state.h264DecoderNeedsKeyFrame === false &&
          state.videoDroppedStaleFrames === staleDropsBeforeRecoveryKeyFrameJump + 9 &&
          state.videoLastDropReason === "recovery-keyframe-jump-live";

        const closeCallsBeforeLiveBacklogJump = closeCalls;
        const staleDropsBeforeLiveBacklogJump = state.videoDroppedStaleFrames;
        const liveBacklogJumpNow = performance.now();
        state.h264FallbackActive = false;
        state.h264Decoder = {
          state: "configured",
          decodeQueueSize: 4,
          close: () => { closeCalls += 1; },
        };
        state.h264DecoderQueue = Array.from({ length: 4 }, (_, index) => ({
          frameId: index + 930,
          queuedAt: liveBacklogJumpNow - 132 + index,
          timestampUs: index * 16667,
          keyFrame: false,
        }));
        state.h264DecoderStatus = "decoding";
        state.h264DecoderKey = "avc1.420029:annexb";
        state.h264DecoderCodec = "avc1.420029:annexb";
        state.h264DecoderNeedsKeyFrame = false;
        state.h264DecodedFrames = 12;
        state.videoDecoderQueueMs = 132;
        state.videoLastDropReason = "live-backlog-keyframe-request";
        state.h264RecoveryInFlight = false;
        state.h264RecoveryKeyFrameReceivedAt = 0;
        state.h264RecoveryFrameDrawnAt = 0;
        state.h264RecoveryQueueGraceUntil = 0;
        const fakeDecoderCountBeforeLiveBacklogJump = fakeDecoders.length;
        await renderH264VideoFrame({
          payload: makeKeyPayload(),
          encoding: "annexb-base64",
          codecString: "avc1.420029",
          width: 1920,
          height: 1080,
          frameId: 936,
          keyFrame: true,
        });
        const liveBacklogKeyFrameJumpedLive =
          closeCalls === closeCallsBeforeLiveBacklogJump + 1 &&
          fakeDecoders.length === fakeDecoderCountBeforeLiveBacklogJump + 1 &&
          state.h264Decoder === fakeDecoders.at(-1) &&
          state.h264DecoderQueue.length === 1 &&
          state.h264DecoderQueue[0]?.frameId === 936 &&
          state.h264DecoderQueue[0]?.keyFrame === true &&
          state.h264DecoderNeedsKeyFrame === false &&
          state.videoDroppedStaleFrames === staleDropsBeforeLiveBacklogJump + 4 &&
          state.videoLastDropReason === "live-backlog-keyframe-jump-live";

        const closeCallsBeforeReceivedKeyFrameGuard = closeCalls;
        const receivedKeyFrameGuardNow = performance.now();
        state.h264FallbackActive = false;
        state.h264Decoder = {
          state: "configured",
          close: () => { closeCalls += 1; },
        };
        state.h264DecoderQueue = [
          { frameId: 806, queuedAt: receivedKeyFrameGuardNow - 533, timestampUs: 0, keyFrame: true },
          { frameId: 807, queuedAt: receivedKeyFrameGuardNow - 500, timestampUs: 33333, keyFrame: false },
        ];
        state.h264DecoderStatus = "decoding";
        state.h264DecoderKey = "avc1.420029:annexb";
        state.h264DecoderCodec = "avc1.420029:annexb";
        state.h264DecoderNeedsKeyFrame = false;
        state.h264SkippedDeltaFrames = 0;
        state.h264DecodedFrames = 12;
        state.videoDroppedStaleFrames = 18;
        state.videoDecoderQueueMs = 503;
        state.videoLastDropReason = "keyframe-wait-h264-recovery";
        state.h264RecoveryInFlight = true;
        state.h264RecoveryKeyFrameReceivedAt = receivedKeyFrameGuardNow - 100;
        state.h264RecoveryFrameDrawnAt = 0;
        state.h264RecoveryQueueGraceUntil = 0;
        const receivedKeyFrameExportText = getVideoPerformanceExportStatus(receivedKeyFrameGuardNow);
        const receivedKeyFrameResync = maybeResyncH264DecoderQueueForLatency({
          isKeyFrame: false,
          frameId: 807,
          now: receivedKeyFrameGuardNow,
        });
        const receivedKeyFramePreserved =
          receivedKeyFrameResync?.dropFrame === false &&
          closeCalls === closeCallsBeforeReceivedKeyFrameGuard &&
          state.h264Decoder !== null &&
          state.h264DecoderQueue.length === 2 &&
          state.h264RecoveryInFlight === true &&
          state.h264RecoveryKeyFrameReceivedAt > 0 &&
          state.videoDroppedStaleFrames === 18 &&
          state.videoLastDropReason === "keyframe-wait-h264-recovery" &&
          receivedKeyFrameExportText.includes("恢复关键帧已收到");

        state.h264DecoderQueue = [
          { frameId: 806, queuedAt: performance.now() - 20, timestampUs: 0, keyFrame: true },
        ];
        state.h264RecoveryInFlight = true;
        state.h264RecoveryKeyFrameReceivedAt = performance.now() - 20;
        state.h264RecoveryFrameDrawnAt = 0;
        state.remoteFrameWidth = 2;
        state.remoteFrameHeight = 2;
        const frameCanvas = document.createElement("canvas");
        frameCanvas.width = 2;
        frameCanvas.height = 2;
        frameCanvas.getContext("2d").fillRect(0, 0, 2, 2);
        const bitmap = await createImageBitmap(frameCanvas);
        drawDecodedVideoFrame(bitmap);
        const recoveryDrawCleared =
          state.h264RecoveryInFlight === false &&
          Number(state.h264RecoveryFrameDrawnAt) > 0 &&
          state.h264DecoderStatus === "rendering";

        return {
          ok: deltaOk && firstSurfaceQueueGrace && keyPreserved && webCodecsQueueBackpressure && liveBacklogKeyFrameRequest && liveBacklogKeyFrameJumpedLive && keyFrameWaitGrace && keyFrameWaitH264Recovery && timedKeyFrameRecovery && postRecoveryQueueGrace && recoveryKeyFrameProgress && recoveryKeyFrameJumpedLive && receivedKeyFramePreserved && recoveryDrawCleared && fallbackRecovery && secondFallbackRecovery && fallbackRecoveryPause && visibilityRecovery,
          deltaOk,
          firstSurfaceQueueGrace,
          firstSurfaceGraceResync,
          keyPreserved,
          webCodecsQueueBackpressure,
          liveBacklogKeyFrameRequest,
          liveBacklogRequest,
          liveBacklogRepeat,
          liveBacklogExportText,
          liveBacklogKeyFrameJumpedLive,
          keyFrameWaitGrace,
          keyFrameWaitH264Recovery,
          timedKeyFrameRecovery,
          timedKeyFrameRecoveryExportText,
          postRecoveryQueueGrace,
          postRecoveryGraceResync,
          recoveryKeyFrameProgress,
          recoveryKeyFrameJumpedLive,
          receivedKeyFramePreserved,
          receivedKeyFrameExportText,
          receivedKeyFrameResync,
          recoveryDrawCleared,
          fallbackRecovery,
          secondFallbackRecovery,
          fallbackRecoveryPause,
          visibilityRecovery,
          fallbackRecoveryCount: state.h264FallbackRecoveryCount,
          fallbackLastReason: state.h264FallbackLastReason,
          fallbackRecoveryPausedUntil: state.h264FallbackRecoveryPausedUntil,
          fallbackRecoveryPauseCount: state.h264FallbackRecoveryPauseCount,
          fallbackRecoveryExportText,
          secondRecoveryExportText,
          fallbackRecoveryPausedExportText,
          visibilityRecoveryExportText,
          visibilityRecoveryCount: state.h264VisibilityRecoveryCount,
          keyFrameWaitGraceExportText,
          keyFrameWaitH264RecoveryExportText,
          fallbackSettings,
          fallbackReason: state.h264FallbackReason,
          queueBackpressureDropped: webCodecsQueueResync?.droppedFrames ?? 0,
          webCodecsQueueResync,
          webCodecsQueueExportText,
          resync,
          keyResync,
          closeCalls,
          queueLength: state.h264DecoderQueue.length,
          needsKeyFrame: state.h264DecoderNeedsKeyFrame,
          status: state.h264DecoderStatus,
          skippedDelta: state.h264SkippedDeltaFrames,
          droppedStale: state.videoDroppedStaleFrames,
          queueMs: state.videoDecoderQueueMs,
          lastDropReason: state.videoLastDropReason,
          exportText,
          keyExportText,
        };
      } finally {
        state.h264Decoder = originalDecoder;
        state.h264DecoderQueue = originalDecoderQueue;
        state.h264DecoderStatus = originalDecoderStatus;
        state.h264DecoderKey = originalDecoderKey;
        state.h264DecoderCodec = originalDecoderCodec;
        state.h264DecoderLatencyMs = originalDecoderLatency;
        state.h264DecoderErrorCount = originalDecoderErrors;
        state.h264DecoderWarned = originalDecoderWarned;
        state.h264DecoderLastError = originalDecoderLastError;
        state.h264DecoderNeedsKeyFrame = originalNeedsKeyFrame;
        state.h264SkippedDeltaFrames = originalSkippedDelta;
        state.h264DecodedFrames = originalDecodedFrames;
        state.h264FallbackActive = originalFallbackActive;
        state.h264FallbackReason = originalFallbackReason;
        state.h264FallbackRecoveryDueAt = originalFallbackRecoveryDueAt;
        state.h264FallbackRecoveryJpegFrames = originalFallbackRecoveryJpegFrames;
        state.h264FallbackRecoveryRequested = originalFallbackRecoveryRequested;
        state.h264FallbackRecoveryCount = originalFallbackRecoveryCount;
        state.h264FallbackLastReason = originalFallbackLastReason;
        state.h264FallbackRecoveryPausedUntil = originalFallbackRecoveryPausedUntil;
        state.h264FallbackRecoveryPauseCount = originalFallbackRecoveryPauseCount;
        state.h264FallbackRecoveryTimestamps = originalFallbackRecoveryTimestamps;
        state.connected = originalConnected;
        state.client = originalClient;
        state.videoFrames = originalVideoFrames;
        state.videoFrameTimes = originalVideoFrameTimes;
        state.remoteFrameWidth = originalRemoteFrameWidth;
        state.remoteFrameHeight = originalRemoteFrameHeight;
        state.videoDroppedStaleFrames = originalDroppedStale;
        state.videoDecoderQueueMs = originalQueueMs;
        state.videoLastDropReason = originalLastDropReason;
        state.videoVisibilityHiddenAt = originalVisibilityHiddenAt;
        state.h264VisibilityRecoveryCount = originalVisibilityRecoveryCount;
        state.h264VisibilityRecoveryLastAt = originalVisibilityRecoveryLastAt;
        state.h264KeyFrameWaitStartedAt = originalKeyFrameWaitStartedAt;
        state.h264KeyFrameRecoveryLastRequestedAt = originalKeyFrameRecoveryLastRequestedAt;
        state.h264RecoveryQueueGraceUntil = originalRecoveryQueueGraceUntil;
        state.h264RecoveryInFlight = originalRecoveryInFlight;
        state.h264RecoveryKeyFrameReceivedAt = originalRecoveryKeyFrameReceivedAt;
        state.h264RecoveryFrameDrawnAt = originalRecoveryFrameDrawnAt;
        state.h264LiveBacklogRecoveryLastRequestedAt = originalLiveBacklogRecoveryLastRequestedAt;
        state.h264LiveBacklogRecoveryCount = originalLiveBacklogRecoveryCount;
        state.hostDiagnostics = originalHostDiagnostics;
        if (originalVideoDecoderDescriptor) {
          Object.defineProperty(window, "VideoDecoder", originalVideoDecoderDescriptor);
        }
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`H.264 latency queue guard check failed: ${JSON.stringify(result)}`);
  }
  return result;
}
async function verifyInputModeStatusText(session) {
  const result = await evaluate(
    session,
    `(() => {
      if (
        typeof updateHostDiagnostics !== "function" ||
        typeof resetHostDiagnostics !== "function" ||
        typeof updateInputStatus !== "function"
      ) {
        return { ok: false, reason: "missing input status functions" };
      }

      const inputText = () => document.querySelector("#inputText")?.textContent || "";
      const reset = () => {
        resetHostDiagnostics();
        updateInputStatus();
      };

      try {
        reset();
        const initial = inputText();
        updateHostDiagnostics({
          inputMode: "log",
          inputAckStatus: "",
          inputAckCode: "",
          inputAckReason: "",
        });
        const logMode = inputText();
        updateHostDiagnostics({
          inputMode: "log",
          inputAckStatus: "logged",
          inputAckCode: "",
          inputAckReason: "",
        });
        const logged = inputText();
        updateHostDiagnostics({
          inputMode: "inject",
          inputAckStatus: "injected",
          inputAckCode: "",
          inputAckReason: "",
        });
        const injected = inputText();
        updateHostDiagnostics({
          inputMode: "log",
          inputAckStatus: "rejected",
          inputAckCode: "LAN403",
          inputAckReason: "permission missing",
        });
        const rejected = inputText();

        return {
          ok:
            /^输入事件：\\d+$/.test(initial) &&
            logMode.includes("安全日志") &&
            logMode.includes("不会真正控制") &&
            logged.includes("已记录") &&
            injected.includes("真实控制") &&
            injected.includes("已注入") &&
            rejected.includes("被拒绝") &&
            rejected.includes("LAN403"),
          initial,
          logMode,
          logged,
          injected,
          rejected,
        };
      } finally {
        reset();
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`Input mode status text check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyWindowsToMacKeyboardMapping(session) {
  const result = await evaluate(
    session,
    `(() => {
      if (
        typeof mapKeyboardModifiers !== "function" ||
        typeof describeKeyboardInput !== "function" ||
        typeof elements !== "object"
      ) {
        return { ok: false, reason: "missing keyboard mapping functions" };
      }

      const originalWin = elements.keyMapWinSelect.value;
      const originalAlt = elements.keyMapAltSelect.value;
      const originalCtrl = elements.keyMapCtrlSelect.value;
      const originalCompatibility = elements.shortcutCompatToggle.checked;
      const event = (key, code, flags = {}) =>
        new KeyboardEvent("keydown", {
          key,
          code,
          ctrlKey: Boolean(flags.ctrlKey),
          altKey: Boolean(flags.altKey),
          shiftKey: Boolean(flags.shiftKey),
          metaKey: Boolean(flags.metaKey),
          bubbles: true,
          cancelable: true,
        });

      try {
        elements.keyMapWinSelect.value = "meta";
        elements.keyMapAltSelect.value = "alt";
        elements.keyMapCtrlSelect.value = "ctrl";
        elements.shortcutCompatToggle.checked = true;

        const copy = mapKeyboardModifiers(event("c", "KeyC", { ctrlKey: true }));
        const paste = mapKeyboardModifiers(event("v", "KeyV", { ctrlKey: true }));
        const redoShift = mapKeyboardModifiers(event("z", "KeyZ", { ctrlKey: true, shiftKey: true }));
        const redoY = mapKeyboardModifiers(event("y", "KeyY", { ctrlKey: true }));
        const copyDescription = describeKeyboardInput(event("c", "KeyC", { ctrlKey: true }), copy);

        elements.shortcutCompatToggle.checked = false;
        const plainCtrl = mapKeyboardModifiers(event("c", "KeyC", { ctrlKey: true }));

        elements.shortcutCompatToggle.checked = true;
        elements.keyMapWinSelect.value = "none";
        elements.keyMapAltSelect.value = "meta";
        elements.keyMapCtrlSelect.value = "alt";
        const custom = mapKeyboardModifiers(event("k", "KeyK", {
          ctrlKey: true,
          altKey: true,
          metaKey: true,
        }));

        return {
          ok:
            copy.shortcutProfile === "windows_to_macos" &&
            copy.shortcutAction === "copy" &&
            copy.key === "c" &&
            copy.code === "KeyC" &&
            copy.metaKey === true &&
            copy.ctrlKey === false &&
            copy.modifiers.join("+") === "meta" &&
            paste.shortcutAction === "paste" &&
            redoShift.shortcutAction === "redo" &&
            redoShift.modifiers.join("+") === "meta+shift" &&
            redoY.shortcutAction === "redo" &&
            redoY.key === "z" &&
            redoY.modifiers.join("+") === "meta+shift" &&
            plainCtrl.shortcutProfile === undefined &&
            plainCtrl.ctrlKey === true &&
            plainCtrl.metaKey === false &&
            plainCtrl.modifiers.join("+") === "ctrl" &&
            custom.modifiers.join("+") === "meta+alt" &&
            custom.metaKey === true &&
            custom.altKey === true &&
            custom.ctrlKey === false &&
            copyDescription.includes("⌘ Command+c") &&
            copyDescription.includes("复制"),
          copy,
          paste,
          redoShift,
          redoY,
          plainCtrl,
          custom,
          copyDescription,
        };
      } finally {
        elements.keyMapWinSelect.value = originalWin;
        elements.keyMapAltSelect.value = originalAlt;
        elements.keyMapCtrlSelect.value = originalCtrl;
        elements.shortcutCompatToggle.checked = originalCompatibility;
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`Windows-to-Mac keyboard mapping check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyReconnectControls(session) {
  const result = await evaluate(
    session,
    `(async () => {
      if (
        typeof scheduleReconnect !== "function" ||
        typeof reconnectNow !== "function" ||
        typeof clearReconnectTimers !== "function" ||
        typeof connect !== "function" ||
        typeof buildLogExportText !== "function" ||
        typeof copyLogsToClipboard !== "function" ||
        typeof state !== "object"
      ) {
        return { ok: false, reason: "missing reconnect functions" };
      }

      const reconnectButton = document.querySelector("#reconnectNowButton");
      const floatingReconnectButton = document.querySelector("#floatingReconnectButton");
      const actions = document.querySelector("#connectionActions");
      const status = document.querySelector("#statusText");
      const remote = document.querySelector("#remoteStatusText");
      const connectButton = document.querySelector("#connectButton");
      const disconnectButton = document.querySelector("#disconnectButton");
      const copyButton = document.querySelector("#copyLogButton");
      const eventLog = document.querySelector("#eventLog");
      const hostDiagnosticsElement = document.querySelector("#hostDiagnosticsText");
      if (!reconnectButton || !floatingReconnectButton || !actions || !status || !remote || !connectButton || !disconnectButton || !copyButton) {
        return { ok: false, reason: "missing reconnect elements" };
      }

      const originalConnect = connect;
      const originalAttempts = state.reconnectAttempts;
      const originalTimer = state.reconnectTimer;
      const originalCountdownTimer = state.reconnectCountdownTimer;
      const originalStableTimer = state.reconnectStableTimer;
      const originalDueAt = state.reconnectDueAt;
      const originalReason = state.reconnectReason;
      const originalHost = state.activeHost;
      const originalPort = state.activePort;
      const originalConnected = state.connected;
      const originalConnecting = state.connecting;
      const originalConnectionState = state.connectionState;
      const originalManualDisconnect = state.manualDisconnect;
      const originalActionsClass = actions.className;
      const originalReconnectHidden = reconnectButton.hidden;
      const originalReconnectDisabled = reconnectButton.disabled;
      const originalReconnectHtml = reconnectButton.innerHTML;
      const originalReconnectTitle = reconnectButton.getAttribute("title");
      const originalFloatingReconnectHidden = floatingReconnectButton.hidden;
      const originalFloatingReconnectDisabled = floatingReconnectButton.disabled;
      const originalFloatingReconnectHtml = floatingReconnectButton.innerHTML;
      const originalFloatingReconnectTitle = floatingReconnectButton.getAttribute("title");
      const originalConnectDisabled = connectButton.disabled;
      const originalDisconnectDisabled = disconnectButton.disabled;
      const originalStatus = status.textContent;
      const originalRemote = remote.textContent;
      const originalBadge = document.querySelector("#connectionBadge")?.className || "";
      const originalBadgeText = document.querySelector("#connectionBadge")?.textContent || "";
      const originalTauri = window.__TAURI__;
      const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
      const originalLogEntries = Array.isArray(state.logEntries) ? state.logEntries.slice() : [];
      const originalEventLogHtml = eventLog?.innerHTML || "";
      const originalWatcherRunning = state.localMacAlertWatcherRunning;
      const originalWatcherBusy = state.localMacAlertWatcherBusy;
      const originalWatcherCheckedAt = state.localMacAlertWatcherStatusCheckedAt;
      const originalWatcherFindingText = state.localMacAlertWatcherFindingText || "";
      const originalWatcherStatus = document.querySelector("#localMacAlertWatcherStatusText")?.textContent || "";
      const originalLocalHostRunning = state.localHostRunning;
      const originalLocalHostOnline = state.localHostOnline;
      const originalLocalHostBusy = state.localHostBusy;
      const localHostBadge = document.querySelector("#localHostBadge");
      const localHostStatus = document.querySelector("#localHostStatusText");
      const localHostOutput = document.querySelector("#localHostOutput");
      const localHostProbeMediaToggle = document.querySelector("#localHostProbeMediaToggle");
      const localHostInputSelect = document.querySelector("#localHostInputModeSelect");
      const localHostReverseSelect = document.querySelector("#localHostReverseControlModeSelect");
      const localHostReadinessSelect = document.querySelector("#localHostReadinessProfileSelect");
      const clipboardToggleElement = document.querySelector("#clipboardToggle");
      const audioToggleElement = document.querySelector("#audioToggle");
      const audioVolumeElement = document.querySelector("#audioVolumeRange");
      const originalLocalHostBadgeText = localHostBadge?.textContent || "";
      const originalLocalHostBadgeClass = localHostBadge?.className || "";
      const originalLocalHostStatus = localHostStatus?.textContent || "";
      const originalLocalHostOutput = localHostOutput?.textContent || "";
      const originalProbeMedia = Boolean(localHostProbeMediaToggle?.checked);
      const originalLocalHostInputValue = localHostInputSelect?.value || "";
      const originalLocalHostReverseValue = localHostReverseSelect?.value || "";
      const originalLocalHostReadinessValue = localHostReadinessSelect?.value || "";
      const originalReceivedFiles = state.receivedClipboardFiles;
      const originalReceivedTempPath = state.receivedClipboardTempPath;
      const originalReceivedWriteStatus = state.receivedClipboardWriteStatus;
      const originalRemoteFileTransfers = state.remoteFileTransfers;
      const originalLastOutgoingFileTransfer = state.lastOutgoingFileTransfer;
      const originalClipboardChecked = Boolean(clipboardToggleElement?.checked);
      const originalAudioChecked = Boolean(audioToggleElement?.checked);
      const originalAudioVolume = audioVolumeElement?.value || "";
      const originalAudioFrames = state.audioFrames;
      const originalAudioLevel = state.audioLevel;
      const originalAudioPlayedFrames = state.audioPlayedFrames;
      const originalAudioDroppedFrames = state.audioDroppedFrames;
      const originalAudioLastError = state.audioLastError;
      const originalAudioContext = state.audioContext;
      const originalAudioNextPlayTime = state.audioNextPlayTime;
      const originalAudioResyncCount = state.audioResyncCount;
      const originalAudioLastDropReason = state.audioLastDropReason;
      const originalVideoFrames = state.videoFrames;
      const originalVideoFrameTimes = Array.isArray(state.videoFrameTimes) ? state.videoFrameTimes.slice() : [];
      const originalActualVideoFps = state.actualVideoFps;
      const originalRequestedFps = state.requestedFps;
      const originalNegotiatedFps = state.negotiatedFps;
      const originalInputEvents = state.inputEvents;
      const originalHostDiagnostics = { ...(state.hostDiagnostics || {}) };
      const originalHostDiagnosticsText = hostDiagnosticsElement?.textContent || "";
      const originalHostDiagnosticsClass = hostDiagnosticsElement?.className || "";
      const originalControlDirection = state.controlDirection;
      const calls = [];
      let copiedText = "";
      const macAlertFindingText = [
        "MacUnattendedStatus=attention warnings=launch-agent-missing,launch-agent-max-fps,power-risk blockers=none",
        "MacPowerHealth=warning reason=system-sleep-enabled warnings=system-sleep-enabled,display-sleep-enabled blockers=none checkedAt=2026-06-19T08:08:38.575Z",
        "MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=launch-agent-not-loaded,power checkedAt=2026-06-19T08:10:38.575Z",
        "MacPowerPlan=node scripts/mac/plan-mac-power-settings.mjs --profile all --sleep 0 --displaySleep 0 --networkWake on --boardSummary",
        "MacRemoteAudioPlan=node scripts/mac/plan-mac-remote-audio.mjs --boardSummary",
        "Mac remote audio plan: status=plan-only; capture=system-pcm-does-not-mute-local; RemoteOnlyOptions=manual-mute-restore/virtual-output-device/product-toggle; recommended=product-toggle-with-explicit-consent; safety=no-volume-change,no password/input/inject. Consent=explicit-before-change; RestorePath=required-before-apply.",
        "MacInputSafetyPlan=node scripts/mac/plan-mac-input-safety.mjs --boardSummary",
        "Mac input safety plan: status=plan-only; default=log; realInput=blocked-until-user-watching; required=--confirmUserWatching; eventSet=safe; safety=no-password,no-input-events,no-inject.",
        "MacHostAuthPath=prompt-password-required reason=launch-agent-ephemeral-password mode=ephemeral next=MacHostStop->MacMaxFpsSafeStart->MacHostMedia",
        "MacClientPasswordLocation=Mac client 页面连接 Windows 时，把 Windows 当前临时密码填页面“连接密码”框；formal/browser runner 的终端隐藏输入只用于脚本；不要把密码发通讯板",
        "MacUnattendedStatus=node scripts/mac/check-mac-unattended-status.mjs --host 127.0.0.1 --port 43770 --boardSummary",
        "MacUnattendedFormal=node scripts/mac/check-mac-unattended-status.mjs --host 127.0.0.1 --port 43770 --requireLaunchAgentMaxFps --requireLaunchAgentLoaded --boardSummary",
        "MacLaunchAgentLoad=launchctl bootstrap gui/$(id -u) /Users/skymoonzyj/Library/LaunchAgents/com.lan-dual-control.mac-host.plist",
        "MacLaunchAgentPrint=launchctl print gui/$(id -u)/com.lan-dual-control.mac-host",
        "MacFormalStatus=ready with warnings: blockers: none warnings: video,build,auth,windows-host,repo",
        "MacResumeStatus=ready with warnings blockers=none warnings=h264-fallback,fps-limit",
        "MacHostReadiness=attention blockers=none warnings=mac-host-discovery,agent-link-board-currentcall,mac-host-max-fps",
        "MacHostReadiness=node scripts/mac/check-mac-host-readiness.mjs --host 127.0.0.1 --port 43770 --checkBoard --boardSummary",
        "MacHeartbeat=status=warning warnings=mac-host-build-stale reason=ok restart recommended hostRuntimeChanges=1 MacHostStop=node scripts/mac/start-mac-host.mjs --stop --host 127.0.0.1 --port 43770",
        "MacHostSafeStart=node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43770",
        "MacMaxFpsSafeStart=node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43770 --maxScreenFps 60",
        "MacClientDiscoverWindows=node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary",
        "WindowsLanRisk=no-firewall-allow,public-profile",
        "WindowsFirewallStatus=node scripts/windows/check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --json",
        "WindowsFirewallPreview=node scripts/windows/check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --dryRunRule --ruleProfile Private",
        "MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs --host 192.168.31.68 --port 43770 --boardSummary",
        "MacClientPromptPasswordSmoke=node scripts/mac/run-mac-client-formal-smoke.mjs --host 192.168.31.68 --port 43770 --ensureClient --promptPassword --boardSummary",
        "MacClientBrowserSelfTest=node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs --boardSummary",
        "MacScriptHelp=node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary",
        "MacHostMedia 通过 passed=12/12 media=ok",
        "MacFormalLocalSmoke 通过：H.264 89 frames / 29.54 fps / maxGap 38ms，PCM 151 frames / 49.87 fps / maxGap 32ms，input-log 16/16 ack，injected=false",
        "MacFormalE2E=status=ok readyToCall=true checklist=passed repo=ok board=ok macHost=ok h264=ok audio=ok clipboard=ok display=ok build=current blockers=none warnings=none",
        "MacClientPage=status=online url=http://127.0.0.1:5188/ blockers=none warnings=none",
        "MacClientDiagnostics=status=ok probeClientServer=ok page=online blockers=none warnings=none",
        "Evidence=MacClientPageOnline,MacClientDiagnosticsOk,MacHostMediaOk",
        "MacFormalLocalSmoke=failed blockers=auth warnings=video",
        "RerunFormalLocalSmoke=node scripts/mac/check-mac-formal-local-smoke.mjs --host 127.0.0.1 --port 43770 --promptPassword --boardSummary",
        "WindowsReverseGrantStatus=pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Status -BoardSummary",
        "WindowsOpenOneTimeReverseGrant=pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Grant -DurationMs 30000 -BoardSummary",
        "WindowsSecureAuthPath=node scripts/windows/start-windows-host.mjs --host 0.0.0.0 --port 43770 --promptPassword --requirePassword",
        "PostPassNext=WindowsRecordPassAndTailError+MacManualUxStandby",
        "ManualUxChecklist=connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics",
        "run-mac-client-formal-smoke preflight ready=false blockers=windows-host warnings=board",
        "MacHeartbeat=status=ok; checkedAt=2020-01-01T00:00:00.000Z; device=Mac; codex=ok status=coding updatedAt=2020-01-01T00:00:00.000Z ageMs=999999; macHost=online 127.0.0.1:43770; macClient=online http://127.0.0.1:5188/; board=ok boardUpdatedAt=2020-01-01T00:00:00.000Z; blockers=none warnings=none reason=ok",
        "MacHeartbeat=stale heartbeat missing; Mac host /discovery unreachable ECONNREFUSED; HTTP 502 Bad Gateway",
        "MacHeartbeat=status=blocked; codex=mac-codex-stale; blockers=mac-codex-stale warnings=none reason=mac-codex-stale",
        "MacHeartbeat=status=warning; codex=codex-reconnect-signal; blockers=none warnings=codex-reconnect-signal reason=codex-reconnect-signal",
        "MacHeartbeat=blocked reason=codex-reconnect-stuck evidence=正在重新连接 5/5 / stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses) suggestedAction=请用户查看 Mac Codex 窗口",
        "MacHeartbeatOnce=node scripts/mac/watch-mac-heartbeat.mjs --once --sendStatus --boardSummary",
        "MacHeartbeatWatch=node scripts/mac/watch-mac-heartbeat.mjs --sendStatus --intervalMs 30000",
        "MacHeartbeatStart=node scripts/mac/start-mac-heartbeat-watcher.mjs --host 127.0.0.1 --port 43770 --server http://192.168.31.68:17888 --intervalMs 30000 --boardSummary",
        "MacHeartbeatStatus=node scripts/mac/start-mac-heartbeat-watcher.mjs --status --host 127.0.0.1 --port 43770 --server http://192.168.31.68:17888 --boardSummary",
        "MacHeartbeatStop=node scripts/mac/start-mac-heartbeat-watcher.mjs --stop --host 127.0.0.1 --port 43770 --server http://192.168.31.68:17888 --boardSummary",
      ].join("; ");

      try {
        connect = async (options = {}) => {
          calls.push({ reconnect: Boolean(options.reconnect) });
        };
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async (text) => {
              copiedText = String(text);
            },
          },
        });
        window.__TAURI__ = { core: { invoke: async () => ({}) } };
        state.localMacAlertWatcherRunning = true;
        state.localMacAlertWatcherBusy = false;
        state.localMacAlertWatcherStatusCheckedAt = Date.now();
        state.localMacAlertWatcherFindingText = macAlertFindingText;
        const watcherStatus = document.querySelector("#localMacAlertWatcherStatusText");
        if (watcherStatus) {
          watcherStatus.textContent = "Windows 浮窗提醒已开启，监听测试联络板。" + macAlertFindingText;
        }
        state.localHostRunning = true;
        state.localHostOnline = true;
        state.localHostBusy = false;
        if (localHostBadge) {
          localHostBadge.textContent = "运行中";
          localHostBadge.className = "status-badge online";
        }
        if (localHostStatus) localHostStatus.textContent = "本机被控正在运行：PID 2468 · 反控 需确认";
        if (localHostOutput) localHostOutput.textContent = "[INFO] Windows host ready\\npassword=should-not-export";
        if (localHostProbeMediaToggle) localHostProbeMediaToggle.checked = true;
        if (localHostInputSelect) localHostInputSelect.value = "log";
        if (localHostReverseSelect) localHostReverseSelect.value = "deny";
        if (localHostReadinessSelect) localHostReadinessSelect.value = "default";
        state.reconnectAttempts = 0;
        state.activeHost = "192.168.31.122";
        state.activePort = "43770";
        state.connected = false;
        state.connecting = false;
        state.manualDisconnect = false;
        state.receivedClipboardFiles = [
          {
            name: "demo.zip",
            size: 3,
            mimeType: "application/zip",
            blob: new Blob(["zip"]),
            objectUrl: "",
          },
        ];
        state.receivedClipboardTempPath = "C:/Temp/lan-dual-control/clip-1";
        state.receivedClipboardWriteStatus = {
          kind: "warning",
          text: "远端文件接收超时：2 B/4 B，45 秒没有收到新分块或完成消息。已停止接收，请让 Mac 重新复制。",
        };
        state.remoteFileTransfers = new Map([
          [
            "diagnostic-transfer",
            {
              transferId: "diagnostic-transfer",
              totalBytes: 4096,
              receivedBytes: 1024,
              fileCount: 1,
              files: [
                {
                  index: 0,
                  name: "demo.txt",
                  size: 4,
                  mimeType: "text/plain",
                },
              ],
              startedAt: Date.now() - 2000,
              lastActivityAt: Date.now() - 1000,
              rateSamples: [
                { bytes: 2048, durationMs: 1000 },
                { bytes: 2048, durationMs: 1000 },
              ],
            },
          ],
        ]);
        state.lastOutgoingFileTransfer = {
          transferId: "diagnostic-outgoing-timeout",
          status: "remote-result",
          accepted: false,
          fileCount: 1,
          sentBytes: 65792,
          receivedBytes: 65792,
          totalBytes: 65792,
          files: [
            {
              index: 0,
              name: "pending-timeout.zip",
              size: 65792,
              mimeType: "application/zip",
            },
          ],
          reason: "对端确认超时：64.3 KB/64.3 KB，46 秒没有收到结果",
          canRetry: true,
          completedAt: Date.now() - 46000,
          failedAt: Date.now() - 1000,
        };
        if (clipboardToggleElement) clipboardToggleElement.checked = true;
        if (audioToggleElement) audioToggleElement.checked = true;
        if (audioVolumeElement) audioVolumeElement.value = "33";
        state.audioFrames = 24;
        state.audioLevel = 0.37;
        state.audioPlayedFrames = 0;
        state.audioDroppedFrames = 2;
        state.audioLastError = "";
        state.audioContext = { currentTime: 10.12, state: "running" };
        state.audioNextPlayTime = 10.24;
        state.audioResyncCount = 1;
        state.audioLastDropReason = "queue-overflow-trim-future";
        state.videoFrames = 90;
        state.videoFrameTimes = [1000, 1033, 1066, 1099, 1199];
        state.actualVideoFps = 20.1;
        state.requestedFps = 60;
        state.negotiatedFps = 60;
        scheduleReconnect("测试断线");
        state.inputEvents = 7;
        state.controlDirection = "windows_to_mac";
        if (typeof updateHostDiagnostics === "function") updateHostDiagnostics({
          hostMode: "mac-host-background-jpeg",
          capturePipeline: "background-jpeg",
          permissions: {
            screenRecording: true,
            accessibility: false,
            inputMonitoring: true,
          },
          runtime: {
            processId: 24680,
            uptimeSeconds: 3661,
            buildId: "host-build-test",
          },
          videoCodec: "jpeg",
          videoEncoding: "data-url",
          streamFallbackReason: "H.264 启动超时，已回退 JPEG",
          clipboardText: true,
          clipboardTextMode: "system",
          clipboardFile: false,
          clipboardFileMode: "unsupported",
          inputMode: "log",
          inputAckStatus: "logged",
          inputAckCode: "",
          inputAckReason: "",
        });
        if (typeof updateInputStatus === "function") updateInputStatus();
        const exportText = typeof buildLogExportText === "function" ? buildLogExportText() : "";
        const exportChecks = {
          quickSummarySection: exportText.includes("\\n快速摘要\\n"),
          quickSummaryRemote:
            exportText.includes("- 远端连接：") && exportText.includes("192.168.31.122:43770"),
          quickSummaryHost:
            exportText.includes("- Mac 主机：") &&
            exportText.includes("PID 24680") &&
            exportText.includes("host-build-test") &&
            exportText.includes("权限") &&
            exportText.includes("辅助功能未开") &&
            exportText.includes("视频回退"),
          quickSummaryMacReachability:
            exportText.includes("- Mac 值守：恢复中") &&
            exportText.includes("值守风险") &&
            exportText.includes("值守证据") &&
            exportText.includes("提醒 提醒中") &&
            exportText.includes("Mac 心跳摘要过旧"),
          quickSummaryReconnect:
            exportText.includes("- 重连：等待自动重连") && exportText.includes("原因 测试断线"),
          quickSummaryRemoteFiles:
            exportText.includes("- 远端文件：warning") && exportText.includes("远端文件接收超时"),
          quickSummaryRemoteFileSuggestion:
            exportText.includes("- 远端文件建议：") &&
            exportText.includes("让 Mac 重新复制") &&
            exportText.includes("检查连接"),
          quickSummaryClipboard:
            exportText.includes("- 剪贴板：接收 1 个文件") &&
            exportText.includes("2 B/4 B"),
          quickSummaryClipboardCapabilitySuggestion:
            exportText.includes("- 剪贴板能力建议：") &&
            exportText.includes("文件/压缩包不能直接复制粘贴") &&
            exportText.includes("检查被控端文件剪贴板能力"),
          quickSummaryOutgoingFile:
            exportText.includes("- 本机发送文件：") &&
            exportText.includes("对端确认超时") &&
            exportText.includes("可重新发送"),
          quickSummaryOutgoingFileSuggestion:
            exportText.includes("- 本机发送建议：") &&
            exportText.includes("点击“重新发送”") &&
            exportText.includes("检查文件剪贴板能力"),
          quickSummaryAudio:
            exportText.includes("- 声音：已接收，等待播放") &&
            exportText.includes("音量 33%") &&
            exportText.includes("接收 24 帧") &&
            exportText.includes("播放 0") &&
            exportText.includes("丢 2"),
          quickSummaryLiveVideo:
            exportText.includes("- 现场视频：") &&
            exportText.includes("实收 20.1 FPS") &&
            exportText.includes("请求 60 Hz") &&
            exportText.includes("协商 60 Hz") &&
            exportText.includes("平均间隔 50 ms") &&
            exportText.includes("最大间隔 100 ms"),
          quickSummaryLiveAudio:
            exportText.includes("- 现场声音：") &&
            exportText.includes("队列 120 ms") &&
            exportText.includes("缓冲 60/50/450/120 ms") &&
            exportText.includes("接收 24") &&
            exportText.includes("重同步 1") &&
            exportText.includes("原因 queue-overflow-trim-future") &&
            exportText.includes("丢 2"),
          quickSummaryInput: exportText.includes("- 输入：7（安全日志，不会真正控制 / 已记录）"),
          quickSummaryFloating:
            exportText.includes("- 全屏浮层：窗口") &&
            exportText.includes("连接：") &&
            exportText.includes("秒后重连"),
          quickSummaryLocal: exportText.includes(
            "- 本机协作：Mac 提醒 提醒中 · 本机被控 桌面壳托管运行中 · 反控 需确认",
          ),
          quickSummaryQuality: /- 画质请求：.+ Hz · .+ Mbps/.test(exportText),
          reconnectStatus: exportText.includes("- 重连状态：等待自动重连（1/3"),
          macReachabilityDetail:
            exportText.includes("- Mac 值守：恢复中") &&
            exportText.includes("视频链路需检查") &&
            exportText.includes("运行版本需检查") &&
            exportText.includes("认证/密码步骤待确认") &&
            exportText.includes("Windows 被控端未指定或未就绪") &&
            exportText.includes("仓库状态需检查") &&
            exportText.includes("系统睡眠未关闭") &&
            exportText.includes("显示器睡眠未关闭") &&
            exportText.includes("自启动未加载") &&
            exportText.includes("LaunchAgent 刷新率上限需调整") &&
            exportText.includes("Mac 值守状态命令已提供") &&
            exportText.includes("Mac 值守正式检查命令已提供") &&
            exportText.includes("Mac LaunchAgent 加载命令已提供") &&
            exportText.includes("Mac LaunchAgent 打印验证命令已提供") &&
            exportText.includes("Mac 60Hz 安全启动命令已提供") &&
            exportText.includes("Mac host 体检命令已提供") &&
            exportText.includes("Mac host 停止旧进程命令已提供") &&
            exportText.includes("Mac host 安全启动命令已提供") &&
            exportText.includes("Mac client Windows 发现命令已提供") &&
            exportText.includes("Windows 防火墙入站放行需检查") &&
            exportText.includes("Windows 当前网络是 Public") &&
            exportText.includes("Windows 防火墙只读检查命令已提供") &&
            exportText.includes("Windows 防火墙放行预览命令已提供") &&
            exportText.includes("Mac client 正式清单命令已提供") &&
            exportText.includes("Mac client 前台密码真测命令已提供") &&
            exportText.includes("Mac client 本地 browser 自测命令已提供") &&
            exportText.includes("Mac 脚本 help 安全自检命令已提供") &&
            exportText.includes("Mac 本机短验收需处理") &&
            exportText.includes("Mac 本机短验收重跑命令已提供") &&
            exportText.includes("Windows 反控授权状态命令已提供") &&
            exportText.includes("Windows 一次性反控授权命令已提供") &&
            exportText.includes("Windows 安全认证路径已提供") &&
            exportText.includes("已进入手工体验清单") &&
            exportText.includes("复制诊断") &&
            exportText.includes("Mac 心跳摘要过旧") &&
            exportText.includes("Mac 心跳过期，可能卡住") &&
            exportText.includes("Mac 后台心跳启动命令已提供") &&
            exportText.includes("Mac 后台心跳状态命令已提供") &&
            exportText.includes("Mac 后台心跳停止命令已提供") &&
            exportText.includes("Mac host 不可达") &&
            exportText.includes("Mac/API 网络错误") &&
            exportText.includes("Mac Codex 可能卡在重新连接 5/5") &&
            exportText.includes("检测到 stream disconnected before completion") &&
            exportText.includes("请查看 Mac 窗口，可能需要手动重试/刷新") &&
            exportText.includes("值守证据 Mac 媒体基线已通过") &&
            exportText.includes("Mac 本机短验收已通过") &&
            exportText.includes("Mac formal E2E 已就绪") &&
            exportText.includes("Mac client 页面在线") &&
            exportText.includes("Mac client 诊断已通过") &&
            exportText.includes("- Mac 值守说明：Windows 已从 Mac 提醒 watcher 状态里识别到值守 warnings/blockers"),
          reconnectReason: exportText.includes("- 重连原因：测试断线"),
          reconnectNext: exportText.includes("- 下次重连："),
          reconnectSeconds: exportText.includes("秒后）"),
          hostDiagnosticsDetail:
            exportText.includes("- 主机诊断：") &&
            exportText.includes("PID 24680") &&
            exportText.includes("host-build-test") &&
            exportText.includes("辅助功能未开"),
          macAlertStatus: exportText.includes("- Mac 提醒：提醒中"),
          macAlertDetail:
            exportText.includes("- Mac 提醒详情：Windows 浮窗提醒已开启") &&
            exportText.includes("warnings=launch-agent-missing,launch-agent-max-fps,power-risk") &&
            exportText.includes("MacPowerHealth=warning") &&
            exportText.includes("MacUnattendedHealth=warning") &&
            exportText.includes("MacPowerPlan=node scripts/mac/plan-mac-power-settings.mjs") &&
            exportText.includes("MacRemoteAudioPlan=node scripts/mac/plan-mac-remote-audio.mjs") &&
            exportText.includes("MacInputSafetyPlan=node scripts/mac/plan-mac-input-safety.mjs") &&
            exportText.includes("realInput=blocked-until-user-watching") &&
            exportText.includes("required=--confirmUserWatching") &&
            exportText.includes("eventSet=safe") &&
            exportText.includes("safety=no-password,no-input-events,no-inject") &&
            exportText.includes("Mac 真实输入安全方案已提供") &&
            exportText.includes("默认输入模式保持安全日志") &&
            exportText.includes("真实输入需用户正在看 Mac 屏幕") &&
            exportText.includes("真实输入需 --confirmUserWatching") &&
            exportText.includes("先用 safe 输入事件集") &&
            exportText.includes("不发送输入事件或执行注入") &&
            exportText.includes("MacHostAuthPath=prompt-password-required") &&
            exportText.includes("reason=launch-agent-ephemeral-password") &&
            exportText.includes("Mac host 需要前台输入连接密码") &&
            exportText.includes("当前 Mac host 是一次性密码模式") &&
            exportText.includes("Windows 控制页密码框填写同一个临时密码") &&
            exportText.includes("先在 Mac 前台同密重启 60Hz host") &&
            exportText.includes("不要把密码发到通讯板") &&
            exportText.includes("MacClientPasswordLocation=Mac client 页面连接 Windows 时") &&
            exportText.includes("页面“连接密码”框") &&
            exportText.includes("formal/browser runner 的终端隐藏输入只用于脚本") &&
            exportText.includes("capture=system-pcm-does-not-mute-local") &&
            exportText.includes("recommended=product-toggle-with-explicit-consent") &&
            exportText.includes("safety=no-volume-change") &&
            exportText.includes("warnings: video,build,auth,windows-host,repo") &&
            exportText.includes("warnings=h264-fallback,fps-limit") &&
            exportText.includes("warnings=mac-host-discovery,agent-link-board-currentcall,mac-host-max-fps") &&
            exportText.includes("MacUnattendedStatus=node scripts/mac/check-mac-unattended-status.mjs") &&
            exportText.includes("MacUnattendedFormal=node scripts/mac/check-mac-unattended-status.mjs") &&
            exportText.includes("MacHostReadiness=node scripts/mac/check-mac-host-readiness.mjs") &&
            exportText.includes("MacLaunchAgentLoad=launchctl bootstrap") &&
            exportText.includes("MacLaunchAgentPrint=launchctl print") &&
            exportText.includes("MacHostStop=node scripts/mac/start-mac-host.mjs --stop") &&
            exportText.includes("MacHostSafeStart=node scripts/mac/start-mac-host.mjs") &&
            exportText.includes("MacMaxFpsSafeStart=node scripts/mac/start-mac-host.mjs") &&
            exportText.includes("MacClientDiscoverWindows=node scripts/mac/discover-windows-hosts.mjs") &&
            exportText.includes("WindowsLanRisk=no-firewall-allow,public-profile") &&
            exportText.includes("WindowsFirewallStatus=node scripts/windows/check-windows-firewall.mjs") &&
            exportText.includes("WindowsFirewallPreview=node scripts/windows/check-windows-firewall.mjs") &&
            !exportText.includes("WindowsFirewallPreview=node scripts/windows/check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --dryRunRule --ruleProfile Private --addRule") &&
            exportText.includes("MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs") &&
            exportText.includes("MacClientPromptPasswordSmoke=node scripts/mac/run-mac-client-formal-smoke.mjs") &&
            exportText.includes("MacClientBrowserSelfTest=node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs") &&
            exportText.includes("MacScriptHelp=node scripts/mac/test-mac-script-help.mjs") &&
            exportText.includes("RerunFormalLocalSmoke=node scripts/mac/check-mac-formal-local-smoke.mjs") &&
            exportText.includes("WindowsReverseGrantStatus=pwsh") &&
            exportText.includes("WindowsOpenOneTimeReverseGrant=pwsh") &&
            exportText.includes("WindowsSecureAuthPath=node scripts/windows/start-windows-host.mjs") &&
            exportText.includes("PostPassNext=WindowsRecordPassAndTailError+MacManualUxStandby") &&
            exportText.includes("ManualUxChecklist=connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics") &&
            exportText.includes("checkedAt=2020-01-01T00:00:00.000Z") &&
            exportText.includes("MacHeartbeat=stale") &&
            exportText.includes("HTTP 502 Bad Gateway") &&
            exportText.includes("Mac Codex 长时间无新进展") &&
            exportText.includes("Mac Codex 出现重连异常信号") &&
            exportText.includes("Mac 单次心跳上板命令已提供") &&
            exportText.includes("Mac 持续心跳 watcher 命令已提供") &&
            exportText.includes("MacHeartbeatStart=node scripts/mac/start-mac-heartbeat-watcher.mjs") &&
            exportText.includes("MacHeartbeatStatus=node scripts/mac/start-mac-heartbeat-watcher.mjs") &&
            exportText.includes("MacHeartbeatStop=node scripts/mac/start-mac-heartbeat-watcher.mjs") &&
            exportText.includes("reason=codex-reconnect-stuck") &&
            exportText.includes("warnings=board"),
          macAlertCheckedAt: exportText.includes("- Mac 提醒最近检查："),
          macAlertHeartbeatFreshness:
            exportText.includes("- Mac 心跳新鲜度：") &&
            exportText.includes("Mac Codex") &&
            exportText.includes("联络板"),
          macAlertSecondsAgo: exportText.includes("秒前）"),
          macAlertPoll: exportText.includes("- Mac 提醒自动轮询：约 15 秒"),
          macAlertServer: exportText.includes("- Mac 提醒联络板：http://192.168.31.68:17888"),
          localCollaborationSection: exportText.includes("\\n本机协作\\n"),
          localHostStatus: exportText.includes("- 本机被控：桌面壳托管运行中"),
          localHostBadge: exportText.includes("- 本机被控徽标：运行中"),
          localHostDetail: exportText.includes("- 本机被控详情：本机被控正在运行"),
          localHostPort: exportText.includes("- 本机被控端口：43770"),
          localHostInput: exportText.includes("- 本机被控输入：安全日志"),
          localHostReverse: exportText.includes("- 本机被控反控策略：需确认"),
          localHostReadiness: exportText.includes("- 本机被控体检：低风险；媒体基线 开启"),
          localHostOutput: exportText.includes("- 本机被控最近输出："),
          localHostOutputMasked: exportText.includes("password=<hidden>"),
          localHostPasswordHidden: exportText.includes("- 本机被控密码：不导出"),
          floatingMode: exportText.includes("- 全屏浮层模式：窗口"),
          floatingSummary: exportText.includes("- 全屏浮层摘要："),
          floatingHint: exportText.includes("- 全屏浮层提示："),
          floatingConnection:
            exportText.includes("- 全屏浮层连接：连接：") && exportText.includes("秒后重连"),
          floatingVideo: exportText.includes("- 全屏浮层视频：视频："),
          floatingAudio: exportText.includes("- 全屏浮层声音：声音："),
          floatingClipboard: exportText.includes("- 全屏浮层剪贴板：剪贴板："),
          floatingInput: exportText.includes("- 全屏浮层输入：输入："),
          floatingSecurity: exportText.includes("- 全屏浮层安全：安全："),
          audioStatus:
            exportText.includes("- 声音状态：已接收，等待播放") &&
            exportText.includes("音量 33%") &&
            exportText.includes("接收 24 帧") &&
            exportText.includes("播放 0") &&
            exportText.includes("丢 2"),
          liveVideoStatus:
            exportText.includes("- 现场视频统计：") &&
            exportText.includes("实收 20.1 FPS") &&
            exportText.includes("最大间隔 100 ms"),
          liveAudioStatus:
            exportText.includes("- 现场声音统计：") &&
            exportText.includes("队列 120 ms") &&
            exportText.includes("缓冲 60/50/450/120 ms") &&
            exportText.includes("重同步 1") &&
            exportText.includes("原因 queue-overflow-trim-future"),
          audioLevel: exportText.includes("- 声音电平：37%"),
          audioError: exportText.includes("- 声音错误：-"),
          clipboardStatus:
            exportText.includes("- 剪贴板状态：接收 1 个文件") &&
            exportText.includes("2 B/4 B"),
          clipboardCapabilitySuggestion:
            exportText.includes("- 剪贴板能力建议：") &&
            exportText.includes("文件/压缩包不能直接复制粘贴") &&
            exportText.includes("检查被控端文件剪贴板能力"),
          outgoingFileStatus:
            exportText.includes("- 本机发送文件：对端文件接收失败") &&
            exportText.includes("pending-timeout.zip") &&
            exportText.includes("对端确认超时") &&
            exportText.includes("可重新发送"),
          outgoingFileSuggestion:
            exportText.includes("- 本机发送建议：点击“重新发送”") &&
            exportText.includes("让对端检查文件剪贴板能力"),
          runtimeInput: exportText.includes("- 输入事件：7（安全日志，不会真正控制 / 已记录）"),
          remoteFileStatus:
            exportText.includes("- 远端文件状态：warning") && exportText.includes("远端文件接收超时"),
          remoteFileSuggestion:
            exportText.includes("- 远端文件建议：让 Mac 重新复制") &&
            exportText.includes("检查连接"),
          remoteFileActive:
            exportText.includes("- 正在接收远端文件：1 个文件 1.0 KB/4.0 KB") &&
            exportText.includes("速度 2.0 KB/s") &&
            exportText.includes("剩余约 2 秒") &&
            exportText.includes("秒无新分块"),
          remoteFileReceivedCount: exportText.includes("- 最近收到远端文件：1 个"),
          remoteFileTempPath: exportText.includes("- 远端文件临时目录：C:/Temp/lan-dual-control/clip-1"),
          remoteFileList: exportText.includes("1. demo.zip · 3 B · application/zip"),
          noLocalHostSecret: !exportText.includes("should-not-export"),
        };
        await copyLogsToClipboard();
        const copied =
          copiedText.includes("\\n快速摘要\\n") &&
          copiedText.includes("\\n本机协作\\n") &&
          copiedText.includes("- 远端连接：") &&
          copiedText.includes("- Mac 主机：") &&
          copiedText.includes("- Mac 值守：恢复中") &&
          copiedText.includes("视频链路需检查") &&
          copiedText.includes("运行版本需检查") &&
          copiedText.includes("认证/密码步骤待确认") &&
          copiedText.includes("Windows 被控端未指定或未就绪") &&
          copiedText.includes("仓库状态需检查") &&
          copiedText.includes("系统睡眠未关闭") &&
          copiedText.includes("显示器睡眠未关闭") &&
          copiedText.includes("自启动未加载") &&
          copiedText.includes("LaunchAgent 刷新率上限需调整") &&
          copiedText.includes("Mac 值守状态命令已提供") &&
          copiedText.includes("Mac 值守正式检查命令已提供") &&
          copiedText.includes("Mac LaunchAgent 加载命令已提供") &&
          copiedText.includes("Mac LaunchAgent 打印验证命令已提供") &&
          copiedText.includes("Mac 60Hz 安全启动命令已提供") &&
          copiedText.includes("Mac host 体检命令已提供") &&
          copiedText.includes("Mac host 停止旧进程命令已提供") &&
          copiedText.includes("Mac host 安全启动命令已提供") &&
          copiedText.includes("Mac client Windows 发现命令已提供") &&
          copiedText.includes("Windows 防火墙入站放行需检查") &&
          copiedText.includes("Windows 当前网络是 Public") &&
          copiedText.includes("Windows 防火墙只读检查命令已提供") &&
          copiedText.includes("Windows 防火墙放行预览命令已提供") &&
          copiedText.includes("Mac client 正式清单命令已提供") &&
          copiedText.includes("Mac client 前台密码真测命令已提供") &&
          copiedText.includes("Mac client 本地 browser 自测命令已提供") &&
          copiedText.includes("Mac 脚本 help 安全自检命令已提供") &&
          copiedText.includes("Mac 本机短验收需处理") &&
          copiedText.includes("Mac 本机短验收重跑命令已提供") &&
          copiedText.includes("Windows 反控授权状态命令已提供") &&
          copiedText.includes("Windows 一次性反控授权命令已提供") &&
          copiedText.includes("Windows 安全认证路径已提供") &&
          copiedText.includes("Mac 心跳过期，可能卡住") &&
          copiedText.includes("Mac host 不可达") &&
          copiedText.includes("Mac/API 网络错误") &&
          copiedText.includes("Mac Codex 长时间无新进展") &&
          copiedText.includes("Mac Codex 出现重连异常信号") &&
          copiedText.includes("Mac 单次心跳上板命令已提供") &&
          copiedText.includes("Mac 持续心跳 watcher 命令已提供") &&
          copiedText.includes("Mac Codex 可能卡在重新连接 5/5") &&
          copiedText.includes("检测到 stream disconnected before completion") &&
          copiedText.includes("launch-agent-max-fps") &&
          copiedText.includes("mac-host-max-fps") &&
          copiedText.includes("MacUnattendedStatus=node scripts/mac/check-mac-unattended-status.mjs") &&
          copiedText.includes("MacUnattendedFormal=node scripts/mac/check-mac-unattended-status.mjs") &&
          copiedText.includes("MacHostReadiness=node scripts/mac/check-mac-host-readiness.mjs") &&
          copiedText.includes("MacLaunchAgentLoad=launchctl bootstrap") &&
          copiedText.includes("MacLaunchAgentPrint=launchctl print") &&
          copiedText.includes("MacHostStop=node scripts/mac/start-mac-host.mjs --stop") &&
          copiedText.includes("MacHostSafeStart=node scripts/mac/start-mac-host.mjs") &&
          copiedText.includes("MacMaxFpsSafeStart=node scripts/mac/start-mac-host.mjs") &&
          copiedText.includes("MacClientDiscoverWindows=node scripts/mac/discover-windows-hosts.mjs") &&
          copiedText.includes("WindowsLanRisk=no-firewall-allow,public-profile") &&
          copiedText.includes("WindowsFirewallStatus=node scripts/windows/check-windows-firewall.mjs") &&
          copiedText.includes("WindowsFirewallPreview=node scripts/windows/check-windows-firewall.mjs") &&
          !copiedText.includes("WindowsFirewallPreview=node scripts/windows/check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --dryRunRule --ruleProfile Private --addRule") &&
          copiedText.includes("MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs") &&
          copiedText.includes("MacClientPromptPasswordSmoke=node scripts/mac/run-mac-client-formal-smoke.mjs") &&
          copiedText.includes("MacClientBrowserSelfTest=node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs") &&
          copiedText.includes("MacScriptHelp=node scripts/mac/test-mac-script-help.mjs") &&
          copiedText.includes("RerunFormalLocalSmoke=node scripts/mac/check-mac-formal-local-smoke.mjs") &&
          copiedText.includes("WindowsReverseGrantStatus=pwsh") &&
          copiedText.includes("WindowsOpenOneTimeReverseGrant=pwsh") &&
          copiedText.includes("WindowsSecureAuthPath=node scripts/windows/start-windows-host.mjs") &&
          copiedText.includes("host-build-test") &&
          copiedText.includes("辅助功能未开") &&
          copiedText.includes("- 本机被控：桌面壳托管运行中") &&
          copiedText.includes("- Mac 提醒：提醒中") &&
          copiedText.includes("- 全屏浮层连接：连接：") &&
          copiedText.includes("- 全屏浮层视频：视频：") &&
          copiedText.includes("- 剪贴板：接收 1 个文件") &&
          copiedText.includes("- 剪贴板状态：接收 1 个文件") &&
          copiedText.includes("- 剪贴板能力建议：") &&
          copiedText.includes("文件/压缩包不能直接复制粘贴") &&
          copiedText.includes("检查被控端文件剪贴板能力") &&
          copiedText.includes("- 本机发送文件：") &&
          copiedText.includes("pending-timeout.zip") &&
          copiedText.includes("对端确认超时") &&
          copiedText.includes("可重新发送") &&
          copiedText.includes("- 本机发送建议：") &&
          copiedText.includes("点击“重新发送”") &&
          copiedText.includes("让对端检查文件剪贴板能力") &&
          copiedText.includes("- 输入：7（安全日志，不会真正控制 / 已记录）") &&
          copiedText.includes("- 输入事件：7（安全日志，不会真正控制 / 已记录）") &&
          copiedText.includes("- 声音状态：已接收，等待播放") &&
          copiedText.includes("- 现场视频：") &&
          copiedText.includes("平均间隔 50 ms") &&
          copiedText.includes("- 现场声音：") &&
          copiedText.includes("队列 120 ms") &&
          copiedText.includes("重同步 1") &&
          copiedText.includes("原因 queue-overflow-trim-future") &&
          copiedText.includes("- 声音电平：37%") &&
          copiedText.includes("- 现场视频统计：") &&
          copiedText.includes("- 现场声音统计：") &&
          copiedText.includes("- 远端文件状态：warning") &&
          copiedText.includes("远端文件接收超时") &&
          copiedText.includes("- 远端文件建议：") &&
          copiedText.includes("让 Mac 重新复制") &&
          copiedText.includes("检查连接") &&
          copiedText.includes("- 正在接收远端文件：1 个文件 1.0 KB/4.0 KB") &&
          copiedText.includes("速度 2.0 KB/s") &&
          copiedText.includes("剩余约 2 秒") &&
          copiedText.includes("- 远端文件临时目录：C:/Temp/lan-dual-control/clip-1") &&
          copiedText.includes("password=<hidden>") &&
          !copiedText.includes("should-not-export") &&
          state.logEntries[0]?.title === "诊断复制";
        const scheduled =
          state.reconnectTimer &&
          state.reconnectCountdownTimer &&
          !reconnectButton.hidden &&
          !reconnectButton.disabled &&
          !floatingReconnectButton.hidden &&
          !floatingReconnectButton.disabled &&
          reconnectButton.textContent.includes("立即重连（") &&
          reconnectButton.textContent.includes("秒") &&
          reconnectButton.title.includes("第 1/3 次") &&
          reconnectButton.title.includes("测试断线") &&
          floatingReconnectButton.textContent.includes("立即重连（") &&
          floatingReconnectButton.textContent.includes("秒") &&
          floatingReconnectButton.title.includes("第 1/3 次") &&
          floatingReconnectButton.title.includes("测试断线") &&
          actions.classList.contains("has-reconnect") &&
          !disconnectButton.disabled &&
          status.textContent.includes("秒后自动重连") &&
          status.textContent.includes("1/3") &&
          remote.textContent.includes("秒后自动重连") &&
          Object.values(exportChecks).every(Boolean);

        floatingReconnectButton.click();
        const immediate =
          calls.length === 1 &&
          calls[0].reconnect === true &&
          state.reconnectTimer === null &&
          state.reconnectCountdownTimer === null &&
          reconnectButton.hidden &&
          floatingReconnectButton.hidden &&
          reconnectButton.textContent.includes("立即重连") &&
          !reconnectButton.textContent.includes("秒") &&
          !reconnectButton.title &&
          floatingReconnectButton.textContent === "立即重连" &&
          !floatingReconnectButton.title &&
          !actions.classList.contains("has-reconnect");

        state.reconnectAttempts = 3;
        state.reconnectReason = "";
        state.audioContext = null;
        state.audioNextPlayTime = 0;
        scheduleReconnect("持续断线");
        const exhaustedExportText = typeof buildLogExportText === "function" ? buildLogExportText() : "";
        const exhausted =
          state.connectionState === "failed" &&
          state.reconnectTimer === null &&
          state.reconnectCountdownTimer === null &&
          reconnectButton.hidden &&
          floatingReconnectButton.hidden &&
          !actions.classList.contains("has-reconnect") &&
          !connectButton.disabled &&
          disconnectButton.disabled &&
          status.textContent.includes("自动重连 3 次仍未恢复") &&
          status.textContent.includes("点“连接”重新尝试") &&
          status.textContent.includes("复制诊断") &&
          remote.textContent.includes("自动重连 3 次仍未恢复") &&
          hostDiagnosticsElement?.textContent.includes("自动重连已停止") &&
          exhaustedExportText.includes("- 重连状态：自动重连已停止（3/3") &&
          exhaustedExportText.includes("- 重连原因：持续断线") &&
          exhaustedExportText.includes("- 重连建议：点“连接”重新尝试") &&
          exhaustedExportText.includes("复制诊断给两端");

        return {
          ok: scheduled && immediate && copied && exhausted,
          scheduled,
          immediate,
          exhausted,
          copied,
          exhaustedStatus: status.textContent,
          exhaustedRemote: remote.textContent,
          exhaustedHostDiagnostics: hostDiagnosticsElement?.textContent || "",
          exhaustedExportHasSuggestion: exhaustedExportText.includes("- 重连建议："),
          reconnectButtonText: reconnectButton.textContent,
          reconnectButtonTitle: reconnectButton.title,
          floatingReconnectButtonText: floatingReconnectButton.textContent,
          floatingReconnectButtonTitle: floatingReconnectButton.title,
          status: status.textContent,
          remote: remote.textContent,
          exportHasReconnectStatus: exportText.includes("- 重连状态："),
          exportHasReconnectReason: exportText.includes("- 重连原因：测试断线"),
          exportHasMacAlertWatcherStatus: exportText.includes("- Mac 提醒：提醒中"),
          exportHasMacAlertWatcherCheckedAt: exportText.includes("- Mac 提醒最近检查："),
          exportHasLocalHostStatus: exportText.includes("- 本机被控：桌面壳托管运行中"),
          exportMasksLocalHostOutput: !exportText.includes("should-not-export"),
          exportChecks,
          macReachabilityLine: exportText.split("\\n").find((line) => line.startsWith("- Mac 值守：")) || "",
          macAlertDetailLine: exportText.split("\\n").find((line) => line.startsWith("- Mac 提醒详情：")) || "",
          liveVideoLine: exportText.split("\\n").find((line) => line.startsWith("- 现场视频：")) || "",
          liveAudioLine: exportText.split("\\n").find((line) => line.startsWith("- 现场声音：")) || "",
          copiedTextHasLocalHostStatus: copiedText.includes("- 本机被控：桌面壳托管运行中"),
          copiedTextMasksLocalHostOutput: !copiedText.includes("should-not-export"),
          calls,
        };
      } finally {
        if (state.reconnectTimer) window.clearTimeout(state.reconnectTimer);
        if (state.reconnectCountdownTimer) window.clearInterval(state.reconnectCountdownTimer);
        if (state.reconnectStableTimer && state.reconnectStableTimer !== originalStableTimer) {
          window.clearTimeout(state.reconnectStableTimer);
        }
        connect = originalConnect;
        state.reconnectAttempts = originalAttempts;
        state.reconnectTimer = originalTimer;
        state.reconnectCountdownTimer = originalCountdownTimer;
        state.reconnectStableTimer = originalStableTimer;
        state.reconnectDueAt = originalDueAt;
        state.reconnectReason = originalReason;
        state.activeHost = originalHost;
        state.activePort = originalPort;
        state.connected = originalConnected;
        state.connecting = originalConnecting;
        state.connectionState = originalConnectionState;
        state.manualDisconnect = originalManualDisconnect;
        state.localMacAlertWatcherRunning = originalWatcherRunning;
        state.localMacAlertWatcherBusy = originalWatcherBusy;
        state.localMacAlertWatcherStatusCheckedAt = originalWatcherCheckedAt;
        state.localMacAlertWatcherFindingText = originalWatcherFindingText;
        state.localHostRunning = originalLocalHostRunning;
        state.localHostOnline = originalLocalHostOnline;
        state.localHostBusy = originalLocalHostBusy;
        state.receivedClipboardFiles = originalReceivedFiles;
        state.receivedClipboardTempPath = originalReceivedTempPath;
        state.receivedClipboardWriteStatus = originalReceivedWriteStatus;
        state.remoteFileTransfers = originalRemoteFileTransfers;
        state.lastOutgoingFileTransfer = originalLastOutgoingFileTransfer;
        if (clipboardToggleElement) clipboardToggleElement.checked = originalClipboardChecked;
        if (audioToggleElement) audioToggleElement.checked = originalAudioChecked;
        if (audioVolumeElement) audioVolumeElement.value = originalAudioVolume;
        state.audioFrames = originalAudioFrames;
        state.audioLevel = originalAudioLevel;
        state.audioPlayedFrames = originalAudioPlayedFrames;
        state.audioDroppedFrames = originalAudioDroppedFrames;
        state.audioLastError = originalAudioLastError;
        state.audioContext = originalAudioContext;
        state.audioNextPlayTime = originalAudioNextPlayTime;
        state.audioResyncCount = originalAudioResyncCount;
        state.audioLastDropReason = originalAudioLastDropReason;
        state.videoFrames = originalVideoFrames;
        state.videoFrameTimes = originalVideoFrameTimes;
        state.actualVideoFps = originalActualVideoFps;
        state.requestedFps = originalRequestedFps;
        state.negotiatedFps = originalNegotiatedFps;
        state.inputEvents = originalInputEvents;
        state.hostDiagnostics = originalHostDiagnostics;
        if (hostDiagnosticsElement) {
          hostDiagnosticsElement.textContent = originalHostDiagnosticsText;
          hostDiagnosticsElement.className = originalHostDiagnosticsClass;
        }
        state.controlDirection = originalControlDirection;
        if (typeof updateInputStatus === "function") updateInputStatus();
        state.logEntries = originalLogEntries;
        if (eventLog) eventLog.innerHTML = originalEventLogHtml;
        window.__TAURI__ = originalTauri;
        if (originalClipboardDescriptor) {
          Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
        } else {
          try {
            delete navigator.clipboard;
          } catch (error) {
            // Ignore cleanup failures in browsers that expose clipboard on the prototype.
          }
        }
        const watcherStatus = document.querySelector("#localMacAlertWatcherStatusText");
        if (watcherStatus) watcherStatus.textContent = originalWatcherStatus;
        if (localHostBadge) {
          localHostBadge.textContent = originalLocalHostBadgeText;
          localHostBadge.className = originalLocalHostBadgeClass;
        }
        if (localHostStatus) localHostStatus.textContent = originalLocalHostStatus;
        if (localHostOutput) localHostOutput.textContent = originalLocalHostOutput;
        if (localHostProbeMediaToggle) localHostProbeMediaToggle.checked = originalProbeMedia;
        if (localHostInputSelect) localHostInputSelect.value = originalLocalHostInputValue;
        if (localHostReverseSelect) localHostReverseSelect.value = originalLocalHostReverseValue;
        if (localHostReadinessSelect) localHostReadinessSelect.value = originalLocalHostReadinessValue;
        actions.className = originalActionsClass;
        reconnectButton.hidden = originalReconnectHidden;
        reconnectButton.disabled = originalReconnectDisabled;
        reconnectButton.innerHTML = originalReconnectHtml;
        if (originalReconnectTitle === null) reconnectButton.removeAttribute("title");
        else reconnectButton.setAttribute("title", originalReconnectTitle);
        floatingReconnectButton.hidden = originalFloatingReconnectHidden;
        floatingReconnectButton.disabled = originalFloatingReconnectDisabled;
        floatingReconnectButton.innerHTML = originalFloatingReconnectHtml;
        if (originalFloatingReconnectTitle === null) floatingReconnectButton.removeAttribute("title");
        else floatingReconnectButton.setAttribute("title", originalFloatingReconnectTitle);
        connectButton.disabled = originalConnectDisabled;
        disconnectButton.disabled = originalDisconnectDisabled;
        status.textContent = originalStatus;
        remote.textContent = originalRemote;
        const badge = document.querySelector("#connectionBadge");
        if (badge) {
          badge.className = originalBadge;
          badge.textContent = originalBadgeText;
        }
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`reconnect controls check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyAudioPlaybackBufferGuards(session) {
  const result = await evaluate(
    session,
    `(async () => {
      if (typeof playPcmAudioFrame !== "function" || typeof getAudioPerformanceExportStatus !== "function") {
        return { ok: false, reason: "audio playback helpers missing" };
      }
      const audioToggle = document.querySelector("#audioToggle");
      const volumeRange = document.querySelector("#audioVolumeRange");
      const original = {
        checked: Boolean(audioToggle?.checked),
        volume: volumeRange?.value || "",
        context: state.audioContext,
        gain: state.audioGain,
        nextPlayTime: state.audioNextPlayTime,
        played: state.audioPlayedFrames,
        dropped: state.audioDroppedFrames,
        lastError: state.audioLastError,
        scheduledSources: Array.isArray(state.audioScheduledSources) ? state.audioScheduledSources.slice() : undefined,
        resyncCount: state.audioResyncCount,
        lastDropReason: state.audioLastDropReason,
        underrunCount: state.audioUnderrunCount,
        lastBufferReason: state.audioLastBufferReason,
        stablePrebufferCount: state.audioStablePrebufferCount,
        lastUnderrunAt: state.audioLastUnderrunAt,
        visibilityHiddenAt: state.audioVisibilityHiddenAt,
        visibilityRecoveryCount: state.audioVisibilityRecoveryCount,
        visibilityRecoveryLastAt: state.audioVisibilityRecoveryLastAt,
        latencyTrimmedFrames: state.audioLatencyTrimmedFrames,
        frames: state.audioFrames,
        lastFrameAt: state.audioLastFrameAt,
        waitingSince: state.audioWaitingSince,
        connected: state.connected,
        frameTimes: Array.isArray(state.audioFrameTimes) ? state.audioFrameTimes.slice() : undefined,
        frameTimingSamples: Array.isArray(state.audioFrameTimingSamples)
          ? state.audioFrameTimingSamples.map((sample) => ({ ...sample }))
          : undefined,
        tauri: window.__TAURI__,
        nativeAudioRunning: state.nativeAudioRunning,
        nativeAudioSampleRate: state.nativeAudioSampleRate,
        nativeAudioChannels: state.nativeAudioChannels,
        nativeAudioSnapshot: state.nativeAudioSnapshot,
      };
      const starts = [];
      const stops = [];
      const makeFakeContext = (currentTime) => ({
        state: "running",
        currentTime,
        createBuffer(channels, frameCount, sampleRate) {
          return {
            duration: frameCount / sampleRate,
            getChannelData() {
              return new Float32Array(frameCount);
            },
          };
        },
        createBufferSource() {
          return {
            buffer: null,
            connect() {},
            start(time) {
              starts.push(time);
            },
            stop() {
              stops.push(this.buffer?.duration ?? 0);
            },
            disconnect() {},
          };
        },
      });
      const makeFrame = () => {
        const samples = new Float32Array(960 * 2);
        const bytes = new Uint8Array(samples.buffer);
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return {
          codec: "pcm-f32le",
          encoding: "pcm-f32le-base64",
          layout: "interleaved",
          channels: 2,
          sampleRate: 48000,
          payload: btoa(binary),
        };
      };

      try {
        if (audioToggle) audioToggle.checked = true;
        if (volumeRange) volumeRange.value = "80";
        const nativeAudioInvokes = [];
        const nativeFrame = makeFrame();
        window.__TAURI__ = {
          core: {
            invoke: async (command, args = {}) => {
              nativeAudioInvokes.push({ command, args });
              if (command === "start_w9_native_audio_session") {
                return {
                  running: true,
                  sampleRate: args?.request?.sampleRate || 48000,
                  channels: args?.request?.channels || 2,
                  queueMs: 0,
                  pushedFrames: 0,
                  playedFrames: 0,
                  trimmedFrames: 0,
                  underruns: 0,
                  lastReason: "native-playback-started",
                };
              }
              if (command === "push_w9_native_pcm_f32_frame") {
                return {
                  running: true,
                  sampleRate: args?.request?.sampleRate || 48000,
                  channels: args?.request?.channels || 2,
                  queueMs: 24,
                  pushedFrames: 960,
                  playedFrames: 0,
                  trimmedFrames: 0,
                  underruns: 0,
                  lastReason: "native-playback-queued",
                };
              }
              if (command === "stop_w9_native_audio_session") {
                return {
                  running: false,
                  sampleRate: 48000,
                  channels: 2,
                  queueMs: 0,
                  pushedFrames: 0,
                  playedFrames: 0,
                  trimmedFrames: 0,
                  underruns: 0,
                  lastReason: "native-playback-stopped",
                };
              }
              throw new Error("unexpected native audio command " + command);
            },
          },
        };
        state.audioContext = makeFakeContext(70);
        state.audioGain = { gain: { value: 0 } };
        state.audioNextPlayTime = 70.4;
        state.audioPlayedFrames = 0;
        state.audioDroppedFrames = 0;
        state.audioResyncCount = 0;
        state.audioLastDropReason = "";
        state.audioLastBufferReason = "";
        state.audioScheduledSources = [];
        starts.length = 0;
        stops.length = 0;
        const nativeAudioPlayed = await playPcmAudioFrame(nativeFrame);
        const nativeAudioBridgeUsed =
          nativeAudioPlayed &&
          starts.length === 0 &&
          nativeAudioInvokes.length === 2 &&
          nativeAudioInvokes[0].command === "start_w9_native_audio_session" &&
          nativeAudioInvokes[0].args?.request?.sampleRate === 48000 &&
          nativeAudioInvokes[0].args?.request?.channels === 2 &&
          nativeAudioInvokes[1].command === "push_w9_native_pcm_f32_frame" &&
          nativeAudioInvokes[1].args?.request?.sampleRate === 48000 &&
          nativeAudioInvokes[1].args?.request?.channels === 2 &&
          typeof nativeAudioInvokes[1].args?.request?.dataBase64 === "string" &&
          nativeAudioInvokes[1].args.request.dataBase64.length > 0 &&
          state.audioPlayedFrames === 1 &&
          state.audioLastBufferReason === "native-playback-queued" &&
          getAudioQueueMs() === 24;

        window.__TAURI__ = original.tauri;

        state.audioContext = makeFakeContext(10);
        state.audioGain = { gain: { value: 0 } };
        state.audioNextPlayTime = 9;
        state.audioPlayedFrames = 0;
        state.audioDroppedFrames = 0;
        if (Array.isArray(state.audioScheduledSources)) state.audioScheduledSources.length = 0;
        state.audioResyncCount = 0;
        state.audioLastDropReason = "";
        state.audioUnderrunCount = 0;
        state.audioLastBufferReason = "";
        state.audioStablePrebufferCount = 0;
        state.audioLastUnderrunAt = 0;
        starts.length = 0;
        stops.length = 0;
        const underrunPlayed = await playPcmAudioFrame(makeFrame());
        const underrunStart = starts[0] || 0;
        const underrunExportText = getAudioPerformanceExportStatus();
        const underrunCountAfterPrebuffer = state.audioUnderrunCount;
        const underrunBufferReasonAfterPrebuffer = state.audioLastBufferReason;
        const underrunPrebufferDiagnosed =
          underrunPlayed &&
          underrunStart >= 10.055 &&
          underrunStart < 10.075 &&
          underrunCountAfterPrebuffer === 1 &&
          underrunBufferReasonAfterPrebuffer === "queue-underrun-prebuffer" &&
          underrunExportText.includes("补缓冲 1") &&
          underrunExportText.includes("原因 queue-underrun-prebuffer");
        const preservedPrebuffer = underrunPrebufferDiagnosed;

        state.audioContext.currentTime = 10.2;
        state.audioPlayedFrames = 8;
        starts.length = 0;
        stops.length = 0;
        const adaptiveUnderrunPlayed = await playPcmAudioFrame(makeFrame());
        const adaptiveUnderrunStart = starts[0] || 0;
        const adaptiveUnderrunExportText = getAudioPerformanceExportStatus();
        state.audioFrameTimes = [0, 20, 210, 250, 470];
        state.audioFrameTimingSamples = [
          { receivedAt: 0, remoteMediaAtMs: 0 },
          { receivedAt: 20, remoteMediaAtMs: 20 },
          { receivedAt: 210, remoteMediaAtMs: 40 },
          { receivedAt: 250, remoteMediaAtMs: 60 },
          { receivedAt: 470, remoteMediaAtMs: 80 },
        ];
        const arrivalGapExportText = getAudioPerformanceExportStatus();
        const arrivalGapDiagnosed =
          arrivalGapExportText.includes("平均间隔 118 ms") &&
          arrivalGapExportText.includes("最大间隔 220 ms") &&
          arrivalGapExportText.includes("远端音频平均间隔 20 ms") &&
          arrivalGapExportText.includes("远端音频最大间隔 20 ms") &&
          arrivalGapExportText.includes("音频卡顿 2") &&
          arrivalGapExportText.includes("最大音频卡顿 220 ms");
        renderAudioStatusFromFrame(makeFrame(), { force: true });
        const arrivalGapStatusText = document.querySelector("#audioText")?.textContent || "";
        const arrivalGapStatusVisible =
          arrivalGapStatusText.includes("最大间隔 220 ms") &&
          arrivalGapStatusText.includes("音频卡顿 2");
        const bufferHealthStatusVisible =
          arrivalGapStatusText.includes("补缓冲 2") &&
          arrivalGapStatusText.includes("稳缓冲 1");
        const stallNow = 10000;
        state.audioFrames = 3;
        state.audioLastFrameAt = stallNow - 4300;
        const stallRendered =
          typeof renderAudioStreamStallStatus === "function" &&
          renderAudioStreamStallStatus(stallNow);
        const stallStatusText = document.querySelector("#audioText")?.textContent || "";
        const stallExportText = getAudioPerformanceExportStatus(stallNow);
        const audioStallVisible =
          stallRendered &&
          stallStatusText.includes("音频断流") &&
          stallStatusText.includes("最后收到 4s 前") &&
          stallExportText.includes("音频断流") &&
          stallExportText.includes("最后收到 4s 前");
        const firstFrameWaitNow = 12000;
        state.connected = true;
        state.audioFrames = 0;
        state.audioLastFrameAt = 0;
        state.audioWaitingSince = firstFrameWaitNow - 4300;
        const firstFrameWaitRendered =
          typeof renderAudioStreamStallStatus === "function" &&
          renderAudioStreamStallStatus(firstFrameWaitNow);
        const firstFrameWaitStatusText = document.querySelector("#audioText")?.textContent || "";
        const firstFrameWaitExportText = getAudioPerformanceExportStatus(firstFrameWaitNow);
        const audioFirstFrameWaitVisible =
          firstFrameWaitRendered &&
          firstFrameWaitStatusText.includes("等待音频首帧") &&
          firstFrameWaitStatusText.includes("已等待 4s") &&
          firstFrameWaitExportText.includes("等待音频首帧") &&
          firstFrameWaitExportText.includes("已等待 4s");
        const adaptivePrebuffered =
          adaptiveUnderrunPlayed &&
          adaptiveUnderrunStart >= 10.295 &&
          adaptiveUnderrunStart < 10.315 &&
          state.audioUnderrunCount === 2 &&
          state.audioStablePrebufferCount === 1 &&
          state.audioLastBufferReason === "queue-underrun-stable-prebuffer" &&
          adaptiveUnderrunExportText.includes("补缓冲 2") &&
          adaptiveUnderrunExportText.includes("稳缓冲 1") &&
          adaptiveUnderrunExportText.includes("原因 queue-underrun-stable-prebuffer");

        state.audioContext = makeFakeContext(11);
        state.audioGain = { gain: { value: 0 } };
        state.audioNextPlayTime = 10.99;
        state.audioPlayedFrames = 3;
        state.audioDroppedFrames = 0;
        state.audioResyncCount = 0;
        state.audioUnderrunCount = 1;
        state.audioStablePrebufferCount = 0;
        state.audioLastUnderrunAt = 10.94;
        state.audioLastDropReason = "";
        state.audioLastBufferReason = "queue-underrun-prebuffer";
        state.audioVisibilityHiddenAt = 0;
        state.audioVisibilityRecoveryCount = 0;
        state.audioVisibilityRecoveryLastAt = 0;
        state.audioScheduledSources = [];
        starts.length = 0;
        stops.length = 0;
        const startupUnderrunPlayed = await playPcmAudioFrame(makeFrame());
        const startupUnderrunStart = starts[0] || 0;
        const startupUnderrunReason = state.audioLastBufferReason;
        const startupUnderrunStableCount = state.audioStablePrebufferCount;
        const startupUnderrunExportText = getAudioPerformanceExportStatus();
        const startupUnderrunKeepsLowLatency =
          startupUnderrunPlayed &&
          starts.length === 1 &&
          state.audioUnderrunCount === 2 &&
          startupUnderrunStableCount === 0 &&
          startupUnderrunReason === "queue-underrun-startup-prebuffer" &&
          startupUnderrunStart >= 11.055 &&
          startupUnderrunStart < 11.085 &&
          startupUnderrunExportText.includes("原因 queue-underrun-startup-prebuffer") &&
          !startupUnderrunExportText.includes("稳缓冲");

        state.audioContext = makeFakeContext(20);
        state.audioGain = { gain: { value: 0 } };
        state.audioNextPlayTime = 20.9;
        state.audioPlayedFrames = 0;
        state.audioDroppedFrames = 0;
        state.audioResyncCount = 0;
        state.audioLastDropReason = "";
        state.audioUnderrunCount = 0;
        state.audioLastBufferReason = "";
        state.audioScheduledSources = [
          { source: { stop() { stops.push(0.10); }, disconnect() {} }, playAt: 19.96, duration: 0.10 },
          { source: { stop() { stops.push(0.12); }, disconnect() {} }, playAt: 20.2, duration: 0.12 },
          { source: { stop() { stops.push(0.12); }, disconnect() {} }, playAt: 20.32, duration: 0.12 },
        ];
        starts.length = 0;
        stops.length = 0;
        const overflowPlayed = await playPcmAudioFrame(makeFrame());
        const resyncPrebuffered = starts[0] >= 20.115 && starts[0] < 20.2;
        const trimmedFutureQueue =
          overflowPlayed &&
          starts.length === 1 &&
          stops.length === 2 &&
          stops.every((duration) => Math.abs(duration - 0.12) < 0.001) &&
          resyncPrebuffered &&
          state.audioDroppedFrames === 2 &&
          state.audioResyncCount === 1 &&
          state.audioLastDropReason === "queue-overflow-trim-future";

        state.audioContext = makeFakeContext(30);
        state.audioGain = { gain: { value: 0 } };
        state.audioNextPlayTime = 30.52;
        state.audioPlayedFrames = 0;
        state.audioDroppedFrames = 0;
        state.audioResyncCount = 0;
        state.audioLastDropReason = "";
        state.audioLastBufferReason = "";
        state.audioVisibilityHiddenAt = Math.max(1, performance.now() - 2500);
        state.audioVisibilityRecoveryCount = 0;
        state.audioVisibilityRecoveryLastAt = 0;
        state.audioScheduledSources = [
          { source: { stop() { stops.push(0.30); }, disconnect() {} }, playAt: 29.9, duration: 0.30 },
          { source: { stop() { stops.push(0.15); }, disconnect() {} }, playAt: 30.25, duration: 0.15 },
        ];
        starts.length = 0;
        stops.length = 0;
        const visibilityRecovered =
          typeof recoverAudioAfterVisibilityReturn === "function" &&
          recoverAudioAfterVisibilityReturn("visibility-return-audio-recovery");
        const visibilityRecoveryResetQueue =
          visibilityRecovered &&
          stops.length === 2 &&
          stops.includes(0.30) &&
          stops.includes(0.15) &&
          state.audioDroppedFrames === 2 &&
          state.audioResyncCount === 1 &&
          state.audioVisibilityRecoveryCount === 1 &&
          state.audioLastDropReason === "visibility-return-audio-recovery" &&
          state.audioNextPlayTime >= 30.115 &&
          state.audioNextPlayTime < 30.2 &&
          state.audioVisibilityHiddenAt === 0;

        state.audioContext = makeFakeContext(40);
        state.audioGain = { gain: { value: 0 } };
        state.audioNextPlayTime = 40.211;
        state.audioPlayedFrames = 0;
        state.audioDroppedFrames = 0;
        state.audioResyncCount = 3;
        state.audioLastDropReason = "queue-overflow-trim-future";
        state.audioLastBufferReason = "queue-overflow-trim-future";
        state.audioVisibilityHiddenAt = 0;
        state.audioVisibilityRecoveryCount = 1;
        state.audioVisibilityRecoveryLastAt = performance.now() - 200;
        state.audioScheduledSources = [
          { source: { stop() { stops.push(0.22); }, disconnect() {} }, playAt: 39.99, duration: 0.22 },
          { source: { stop() { stops.push(0.12); }, disconnect() {} }, playAt: 40.22, duration: 0.12 },
        ];
        starts.length = 0;
        stops.length = 0;
        const postVisibilityPlayed = await playPcmAudioFrame(makeFrame());
        const postVisibilitySnapToLive =
          postVisibilityPlayed &&
          starts.length === 1 &&
          stops.length === 2 &&
          stops.includes(0.22) &&
          stops.includes(0.12) &&
          state.audioDroppedFrames === 2 &&
          state.audioResyncCount === 4 &&
          state.audioLastDropReason === "queue-overflow-snap-live" &&
          starts[0] >= 40.115 &&
          starts[0] < 40.2 &&
          state.audioNextPlayTime >= 40.135 &&
          state.audioNextPlayTime < 40.23;

        state.audioContext = makeFakeContext(50);
        state.audioGain = { gain: { value: 0 } };
        state.audioNextPlayTime = 49.99;
        state.audioPlayedFrames = 9;
        state.audioDroppedFrames = 0;
        state.audioResyncCount = 0;
        state.audioUnderrunCount = 1;
        state.audioStablePrebufferCount = 0;
        state.audioLastUnderrunAt = 49.93;
        state.audioLastDropReason = "queue-overflow-snap-live";
        state.audioLastBufferReason = "queue-overflow-snap-live";
        state.audioVisibilityHiddenAt = 0;
        state.audioVisibilityRecoveryCount = 1;
        state.audioVisibilityRecoveryLastAt = performance.now() - 300;
        state.audioScheduledSources = [];
        starts.length = 0;
        stops.length = 0;
        const recoveryUnderrunPlayed = await playPcmAudioFrame(makeFrame());
        const recoveryUnderrunRebuildBuffer =
          recoveryUnderrunPlayed &&
          starts.length === 1 &&
          state.audioUnderrunCount === 2 &&
          state.audioStablePrebufferCount === 1 &&
          state.audioLastBufferReason === "queue-underrun-recovery-prebuffer" &&
          starts[0] >= 50.075 &&
          starts[0] < 50.095;

        state.audioContext = makeFakeContext(60);
        state.audioGain = { gain: { value: 0 } };
        state.audioNextPlayTime = 60.08;
        state.audioPlayedFrames = 20;
        state.audioDroppedFrames = 0;
        state.audioResyncCount = 0;
        state.audioUnderrunCount = 0;
        state.audioStablePrebufferCount = 0;
        state.audioLatencyTrimmedFrames = 0;
        state.audioLastUnderrunAt = 0;
        state.audioLastDropReason = "";
        state.audioLastBufferReason = "";
        state.audioVisibilityHiddenAt = 0;
        state.audioVisibilityRecoveryCount = 0;
        state.audioVisibilityRecoveryLastAt = 0;
        state.audioScheduledSources = [];
        starts.length = 0;
        stops.length = 0;
        for (let index = 0; index < 15; index += 1) {
          state.audioContext.currentTime = 60 + index * 0.012;
          await playPcmAudioFrame(makeFrame());
        }
        const burstQueueMs = getAudioQueueMs();
        const burstExportText = getAudioPerformanceExportStatus();
        const burstArrivalKeepsLowLatency =
          burstQueueMs <= 80 &&
          state.audioDroppedFrames === 0 &&
          (Number(state.audioLatencyTrimmedFrames) || 0) > 0 &&
          state.audioLastBufferReason === "queue-latency-trim-future" &&
          burstExportText.includes("追实时") &&
          !burstExportText.includes("丢 1");

        state.audioContext = makeFakeContext(80);
        state.audioGain = { gain: { value: 0 } };
        state.audioNextPlayTime = 80.08;
        state.audioPlayedFrames = 20;
        state.audioDroppedFrames = 0;
        state.audioResyncCount = 0;
        state.audioUnderrunCount = 0;
        state.audioStablePrebufferCount = 0;
        state.audioLatencyTrimmedFrames = 0;
        state.audioLastUnderrunAt = 0;
        state.audioLastDropReason = "";
        state.audioLastBufferReason = "";
        state.audioVisibilityHiddenAt = 0;
        state.audioVisibilityRecoveryCount = 0;
        state.audioVisibilityRecoveryLastAt = 0;
        state.audioScheduledSources = [];
        starts.length = 0;
        stops.length = 0;
        for (let index = 0; index < 120; index += 1) {
          state.audioContext.currentTime = 80 + index * 0.012;
          await playPcmAudioFrame(makeFrame());
        }
        const sustainedBurstQueueMs = getAudioQueueMs();
        const sustainedBurstExportText = getAudioPerformanceExportStatus();
        const sustainedBurstKeepsLowLatency =
          sustainedBurstQueueMs <= 80 &&
          state.audioDroppedFrames === 0 &&
          state.audioUnderrunCount === 0 &&
          state.audioStablePrebufferCount === 0 &&
          (Number(state.audioLatencyTrimmedFrames) || 0) > 0 &&
          state.audioLastBufferReason === "queue-latency-trim-future" &&
          sustainedBurstExportText.includes("追实时") &&
          !sustainedBurstExportText.includes("丢 1") &&
          !sustainedBurstExportText.includes("补缓冲");

        return {
          ok: nativeAudioBridgeUsed && preservedPrebuffer && adaptivePrebuffered && startupUnderrunKeepsLowLatency && arrivalGapDiagnosed && arrivalGapStatusVisible && bufferHealthStatusVisible && audioStallVisible && audioFirstFrameWaitVisible && trimmedFutureQueue && visibilityRecoveryResetQueue && postVisibilitySnapToLive && recoveryUnderrunRebuildBuffer && burstArrivalKeepsLowLatency && sustainedBurstKeepsLowLatency,
          nativeAudioBridgeUsed,
          nativeAudioPlayed,
          nativeAudioInvokes,
          nativeAudioStarts: starts.length,
          nativeAudioPlayedFrames: state.audioPlayedFrames,
          nativeAudioLastBufferReason: state.audioLastBufferReason,
          nativeAudioQueueMs: getAudioQueueMs(),
          preservedPrebuffer,
          underrunPrebufferDiagnosed,
          underrunCount: underrunCountAfterPrebuffer,
          underrunBufferReason: underrunBufferReasonAfterPrebuffer,
          underrunExportText,
          underrunStart,
          adaptivePrebuffered,
          arrivalGapDiagnosed,
          arrivalGapExportText,
          arrivalGapStatusVisible,
          arrivalGapStatusText,
          bufferHealthStatusVisible,
          audioStallVisible,
          stallRendered,
          stallStatusText,
          stallExportText,
          audioFirstFrameWaitVisible,
          firstFrameWaitRendered,
          firstFrameWaitStatusText,
          firstFrameWaitExportText,
          adaptiveUnderrunStart,
          adaptiveUnderrunExportText,
          startupUnderrunPlayed,
          startupUnderrunKeepsLowLatency,
          startupUnderrunStart,
          startupUnderrunReason,
          startupUnderrunStableCount,
          startupUnderrunExportText,
          stablePrebufferCount: state.audioStablePrebufferCount,
          overflowPlayed,
          trimmedFutureQueue,
          overflowStarts: starts.length,
          overflowDropped: state.audioDroppedFrames,
          overflowStops: stops.length,
          overflowStopDurations: stops.slice(),
          overflowStart: starts[0] || 0,
          resyncPrebuffered,
          overflowResyncCount: state.audioResyncCount,
          overflowDropReason: state.audioLastDropReason,
          visibilityRecovered,
          visibilityRecoveryResetQueue,
          visibilityRecoveryStops: stops.slice(),
          visibilityRecoveryDropped: state.audioDroppedFrames,
          visibilityRecoveryResyncCount: state.audioResyncCount,
          visibilityRecoveryCount: state.audioVisibilityRecoveryCount,
          visibilityRecoveryDropReason: state.audioLastDropReason,
          visibilityRecoveryNextPlayTime: state.audioNextPlayTime,
          visibilityRecoveryHiddenAt: state.audioVisibilityHiddenAt,
          postVisibilityPlayed,
          postVisibilitySnapToLive,
          postVisibilityStops: stops.slice(),
          postVisibilityDropped: state.audioDroppedFrames,
          postVisibilityResyncCount: state.audioResyncCount,
          postVisibilityDropReason: state.audioLastDropReason,
          postVisibilityStart: starts[0] || 0,
          postVisibilityNextPlayTime: state.audioNextPlayTime,
          recoveryUnderrunPlayed,
          recoveryUnderrunRebuildBuffer,
          recoveryUnderrunStart: starts[0] || 0,
          recoveryUnderrunCount: state.audioUnderrunCount,
          recoveryUnderrunStableCount: state.audioStablePrebufferCount,
          recoveryUnderrunReason: state.audioLastBufferReason,
          burstArrivalKeepsLowLatency,
          burstQueueMs,
          burstLatencyTrimmed: state.audioLatencyTrimmedFrames,
          burstDropped: state.audioDroppedFrames,
          burstReason: state.audioLastBufferReason,
          burstExportText,
          sustainedBurstKeepsLowLatency,
          sustainedBurstQueueMs,
          sustainedBurstLatencyTrimmed: state.audioLatencyTrimmedFrames,
          sustainedBurstDropped: state.audioDroppedFrames,
          sustainedBurstUnderrunCount: state.audioUnderrunCount,
          sustainedBurstStablePrebufferCount: state.audioStablePrebufferCount,
          sustainedBurstReason: state.audioLastBufferReason,
          sustainedBurstExportText,
        };
      } finally {
        if (original.tauri === undefined) {
          delete window.__TAURI__;
        } else {
          window.__TAURI__ = original.tauri;
        }
        if (audioToggle) audioToggle.checked = original.checked;
        if (volumeRange) volumeRange.value = original.volume;
        state.audioContext = original.context;
        state.audioGain = original.gain;
        state.audioNextPlayTime = original.nextPlayTime;
        state.audioPlayedFrames = original.played;
        state.audioDroppedFrames = original.dropped;
        state.audioLastError = original.lastError;
        if (original.scheduledSources === undefined) {
          delete state.audioScheduledSources;
        } else {
          state.audioScheduledSources = original.scheduledSources;
        }
        state.audioResyncCount = original.resyncCount;
        state.audioLastDropReason = original.lastDropReason;
        state.audioUnderrunCount = original.underrunCount;
        state.audioLastBufferReason = original.lastBufferReason;
        state.audioStablePrebufferCount = original.stablePrebufferCount;
        state.audioLastUnderrunAt = original.lastUnderrunAt;
        if (original.visibilityHiddenAt === undefined) {
          delete state.audioVisibilityHiddenAt;
        } else {
          state.audioVisibilityHiddenAt = original.visibilityHiddenAt;
        }
        if (original.visibilityRecoveryCount === undefined) {
          delete state.audioVisibilityRecoveryCount;
        } else {
          state.audioVisibilityRecoveryCount = original.visibilityRecoveryCount;
        }
        if (original.visibilityRecoveryLastAt === undefined) {
          delete state.audioVisibilityRecoveryLastAt;
        } else {
          state.audioVisibilityRecoveryLastAt = original.visibilityRecoveryLastAt;
        }
        if (original.latencyTrimmedFrames === undefined) {
          delete state.audioLatencyTrimmedFrames;
        } else {
          state.audioLatencyTrimmedFrames = original.latencyTrimmedFrames;
        }
        state.audioFrames = original.frames;
        state.connected = original.connected;
        if (original.waitingSince === undefined) {
          delete state.audioWaitingSince;
        } else {
          state.audioWaitingSince = original.waitingSince;
        }
        if (original.lastFrameAt === undefined) {
          delete state.audioLastFrameAt;
        } else {
          state.audioLastFrameAt = original.lastFrameAt;
        }
        if (original.frameTimes === undefined) {
          delete state.audioFrameTimes;
        } else {
          state.audioFrameTimes = original.frameTimes;
        }
        if (original.frameTimingSamples === undefined) {
          delete state.audioFrameTimingSamples;
        } else {
          state.audioFrameTimingSamples = original.frameTimingSamples;
        }
        if (original.nativeAudioRunning === undefined) {
          delete state.nativeAudioRunning;
        } else {
          state.nativeAudioRunning = original.nativeAudioRunning;
        }
        if (original.nativeAudioSampleRate === undefined) {
          delete state.nativeAudioSampleRate;
        } else {
          state.nativeAudioSampleRate = original.nativeAudioSampleRate;
        }
        if (original.nativeAudioChannels === undefined) {
          delete state.nativeAudioChannels;
        } else {
          state.nativeAudioChannels = original.nativeAudioChannels;
        }
        if (original.nativeAudioSnapshot === undefined) {
          delete state.nativeAudioSnapshot;
        } else {
          state.nativeAudioSnapshot = original.nativeAudioSnapshot;
        }
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`audio playback buffer guard check failed: ${JSON.stringify(result)}`);
  }
  return result;
}
async function verifyLiveStatusLayoutStability(session) {
  const result = await evaluate(
    session,
    `(() => {
      const statusbar = document.querySelector(".statusbar");
      const remoteCanvas = document.querySelector("#remoteCanvas");
      const statusText = document.querySelector("#statusText");
      const inputText = document.querySelector("#inputText");
      const audioText = document.querySelector("#audioText");
      const clipboardText = document.querySelector("#clipboardText");
      if (!statusbar || !remoteCanvas || !statusText || !inputText || !audioText || !clipboardText) {
        return { ok: false, reason: "missing layout elements" };
      }

      const original = {
        status: statusText.textContent,
        input: inputText.textContent,
        audio: audioText.textContent,
        clipboard: clipboardText.textContent,
      };
      const before = {
        statusbarHeight: statusbar.getBoundingClientRect().height,
        remoteHeight: remoteCanvas.getBoundingClientRect().height,
      };

      try {
        statusText.textContent = "已连接 · 192.168.31.122:43770 · H.264 · ScreenCaptureKit · 实收 59.8 FPS · 协商 60 Hz · 请求 60 Hz";
        inputText.textContent = "输入事件：128 · 已注入 · Ctrl→Command · 远控 macOS 快捷键映射";
        audioText.textContent = "声音：接收中 · 37% · 80% · 28 ms · 播放 2048 · 丢 2 · PCM 48000 Hz 2ch";
        clipboardText.textContent = "剪贴板：文件同步 · 接收 2 个文件 · 128.0 MB/512.0 MB · 等待系统剪贴板写入";
        if (typeof syncFloatingControlStatus === "function") syncFloatingControlStatus();
        const after = {
          statusbarHeight: statusbar.getBoundingClientRect().height,
          remoteHeight: remoteCanvas.getBoundingClientRect().height,
        };
        const statusbarStable = Math.abs(after.statusbarHeight - before.statusbarHeight) <= 1;
        const remoteStable = Math.abs(after.remoteHeight - before.remoteHeight) <= 1;
        const statusbarStyle = getComputedStyle(statusbar);
        const textStyles = [statusText, inputText, audioText, clipboardText].map((element) => {
          const style = getComputedStyle(element);
          return {
            whiteSpace: style.whiteSpace,
            overflow: style.overflow,
            textOverflow: style.textOverflow,
          };
        });
        const nowrap = textStyles.every(
          (style) =>
            style.whiteSpace === "nowrap" &&
            style.overflow === "hidden" &&
            style.textOverflow === "ellipsis",
        );
        const titleMirrors = [statusText, inputText, audioText, clipboardText].map((element) => ({
          text: element.textContent,
          title: element.getAttribute("title") || "",
          ok: (element.getAttribute("title") || "") === element.textContent,
        }));
        const titleMirrorsOk = titleMirrors.every((entry) => entry.ok);
        return {
          ok: statusbarStable && remoteStable && statusbarStyle.flexWrap === "nowrap" && nowrap && titleMirrorsOk,
          before,
          after,
          statusbarStable,
          remoteStable,
          flexWrap: statusbarStyle.flexWrap,
          textStyles,
          titleMirrors,
          titleMirrorsOk,
        };
      } finally {
        statusText.textContent = original.status;
        inputText.textContent = original.input;
        audioText.textContent = original.audio;
        clipboardText.textContent = original.clipboard;
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`live status layout stability check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

function verifyPromptPasswordAllowsPipedStdout() {
  const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const match = source.match(/function promptHidden\(label\) \{[\s\S]*?\n\}/);
  if (!match) {
    throw new Error("promptHidden source block not found");
  }
  if (/process\.stdout\.isTTY/.test(match[0])) {
    throw new Error("promptHidden must allow piped stdout so retest-and-post can capture W2W3Retest while stdin stays interactive");
  }
  return { ok: true };
}
async function run() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }

  const args = parseArgs(process.argv);
  activeOutputArgs = args;
  verifyPromptPasswordAllowsPipedStdout();
  const summary = {
    status: "running",
    mode: args.diagnosticsOnly ? "diagnostics" : "connect",
    target: `${args.host}:${args.port}`,
    discoveryTarget: "",
    discoveryRuntimeBuild: "",
    checks: [],
    remote: "",
    diagnostics: "",
    discoveryDiagnostics: "",
    uiDiagnostics: "",
    fps: "",
    audio: "",
    surface: "",
    liveVideo: "",
    liveAudio: "",
    h264: "",
    h264Errors: "",
    error: "",
  };
  activeSummary = summary;
  const discoverySelection = await resolveDiscoveryTarget(args);
  if (discoverySelection) {
    const runtimeText = discoverySelection.runtimeBuild ? ` runtimeBuild=${discoverySelection.runtimeBuild}` : "";
    summary.discoveryTarget = discoverySelection.target;
    summary.discoveryRuntimeBuild = discoverySelection.runtimeBuild || "";
    summary.target = discoverySelection.target;
    summary.checks.push("discovery");
    print(
      "OK",
      `Discovery target: ${discoverySelection.target}; macHosts=${discoverySelection.foundMacHosts}${runtimeText}`,
    );
  }
  await preparePassword(args);
  const clientUrl = `http://127.0.0.1:${args.clientPort}/`;
  const userDataDir = await mkdtemp(join(tmpdir(), "lan-dual-edge-"));
  const clientServer = startProcess(process.execPath, ["apps/windows-client/server.mjs", String(args.clientPort)], {
    cwd: repoRoot,
  });
  attachProcessLog(clientServer, "client");

  const edgeArgs = [
    `--remote-debugging-port=${args.debugPort}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--disable-sync",
    "--disable-background-networking",
    "--disable-extensions",
    "--autoplay-policy=no-user-gesture-required",
    "--disable-gpu-sandbox",
    "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults",
    "--window-size=1280,850",
  ];
  if (args.headless) {
    edgeArgs.push("--headless=new");
  }
  edgeArgs.push(clientUrl);

  const edge = startProcess(findBrowserPath(), edgeArgs);
  attachProcessLog(edge, "edge");

  let session;
  try {
    await waitFor(async () => {
      const response = await fetch(clientUrl);
      return response.ok;
    }, args.timeoutMs, "Windows client server");

    session = await connectCdp(args.debugPort, args.timeoutMs);
    await session.send("Runtime.enable");
    await session.send("Page.enable");
    await session.send("Page.navigate", { url: clientUrl });
    await session.waitForEvent("Page.loadEventFired", args.timeoutMs);
    await waitFor(
      () => evaluate(session, "document.readyState === 'complete'"),
      args.timeoutMs,
      "page load",
    );

    if (args.onlyH264LatencyQueueGuard) {
      const keyFrameCheck = await verifyH264KeyFrameDetection(session);
      summary.checks.push("h264-keyframe");
      print(
        "OK",
        `H.264 key frame detection: annexbKey=${keyFrameCheck.annexbKey}, annexbDelta=${keyFrameCheck.annexbDelta}, avcKey=${keyFrameCheck.avcKey}`,
      );
      const latencyQueueCheck = await verifyH264LatencyQueueGuard(session);
      summary.h264 = makeH264RetestSummary({
        h264DecoderStatus: latencyQueueCheck.status,
        h264SkippedDeltaFrames: latencyQueueCheck.skippedDelta,
        h264DecoderNeedsKeyFrame: latencyQueueCheck.needsKeyFrame,
        h264DecoderQueue: latencyQueueCheck.queueLength,
        h264DecoderQueueMs: latencyQueueCheck.queueMs,
        h264DroppedStaleFrames: latencyQueueCheck.droppedStale,
        h264LastDropReason: latencyQueueCheck.lastDropReason,
        h264FallbackRecoveryCount: latencyQueueCheck.fallbackRecoveryCount,
        h264FallbackRecoveryPauseCount: latencyQueueCheck.fallbackRecoveryPauseCount,
        h264ReceivedFrames: keyFrameCheck.h264ReceivedFrames,
        h264ReceivedKeyFrames: keyFrameCheck.h264ReceivedKeyFrames,
        h264ReceivedSps: keyFrameCheck.h264ReceivedSps,
        h264ReceivedPps: keyFrameCheck.h264ReceivedPps,
        h264ReceivedIdr: keyFrameCheck.h264ReceivedIdr,
        h264LastNalTypes: keyFrameCheck.h264LastNalTypes,
        canvasVisible: false,
        canvasWidth: 0,
        canvasHeight: 0,
        imageVisible: false,
        imageHasSource: false,
      });
      summary.checks.push("h264-latency-queue");
      print(
        "OK",
        `H.264 latency queue guard: dropped=${latencyQueueCheck.queueBackpressureDropped ?? latencyQueueCheck.droppedStale} firstSurfaceGrace=${latencyQueueCheck.firstSurfaceQueueGrace ? "yes" : "no"} keyGrace=${latencyQueueCheck.keyFrameWaitGrace ? "yes" : "no"} h264Recovery=${latencyQueueCheck.keyFrameWaitH264Recovery ? "yes" : "no"} postRecoveryGrace=${latencyQueueCheck.postRecoveryQueueGrace ? "yes" : "no"} liveBacklogReq=${latencyQueueCheck.liveBacklogKeyFrameRequest ? "yes" : "no"} liveBacklogJump=${latencyQueueCheck.liveBacklogKeyFrameJumpedLive ? "yes" : "no"} keyFrameProgress=${latencyQueueCheck.recoveryKeyFrameProgress ? "yes" : "no"} receivedKeyFrame=${latencyQueueCheck.receivedKeyFramePreserved ? "yes" : "no"} drawCleared=${latencyQueueCheck.recoveryDrawCleared ? "yes" : "no"} jumpLive=${latencyQueueCheck.recoveryKeyFrameJumpedLive ? "yes" : "no"} recovery=${latencyQueueCheck.fallbackRecovery ? "yes" : "no"} reason=${latencyQueueCheck.lastDropReason}`,
      );
      const h264SummaryCheck = verifyW2W3RetestH264Summary();
      if (!h264SummaryCheck.ok) {
        throw new Error(`W2W3Retest H.264 summary check failed: ${JSON.stringify(h264SummaryCheck)}`);
      }
      summary.checks.push("w2w3-h264-summary");
      print("OK", `W2W3Retest H.264 summary: ${h264SummaryCheck.h264}`);
      summary.status = "passed";
      emitBoardSummary(summary);
      return;
    }

    if (args.onlyAudioBufferGuards) {
      const audioBufferGuardCheck = await verifyAudioPlaybackBufferGuards(session);
      summary.checks.push("audio-buffer-guards");
      summary.status = "passed";
      print(
        "OK",
        `Audio buffer guards: underrunStart=${audioBufferGuardCheck.underrunStart.toFixed(3)} underrun=${audioBufferGuardCheck.underrunCount ?? 0} stable=${audioBufferGuardCheck.stablePrebufferCount ?? 0} overflowDropped=${audioBufferGuardCheck.overflowDropped} resync=${audioBufferGuardCheck.overflowResyncCount ?? 0} visibilityRecovery=${audioBufferGuardCheck.visibilityRecoveryCount ?? 0}`,
      );
      emitBoardSummary(summary);
      return;
    }

    const controlCenterCheck = await verifyFloatingControlCenter(session);
    summary.checks.push("control-center");
    print(
      "OK",
      `Control center: open=${controlCenterCheck.opened}, floating=${controlCenterCheck.floatingLayer}, summary=${controlCenterCheck.summarySynced}, quality=${controlCenterCheck.qualitySynced}, original=${controlCenterCheck.originalPresetSynced}, detailed=${controlCenterCheck.detailedSettingsSynced}, scale=${controlCenterCheck.scaleSynced}, audio=${controlCenterCheck.audioSynced}, volume=${controlCenterCheck.volumeSynced}, status=${controlCenterCheck.statusVisible}, connection=${controlCenterCheck.connectionStatusVisible}, video=${controlCenterCheck.videoStatusVisible}, audioStatus=${controlCenterCheck.audioStatusVisible}, clipboard=${controlCenterCheck.clipboardStatusVisible}, shortcut=${controlCenterCheck.shortcutSent}, diagnosticsCopy=${controlCenterCheck.diagnosticsCopyVisible}, fullscreen=${controlCenterCheck.fullscreenEntered}, hint=${controlCenterCheck.fullscreenHintVisible}, esc=${controlCenterCheck.fullscreenEscExited}, immersive=${controlCenterCheck.immersiveFullscreenEntered}, window=${controlCenterCheck.fullscreenExited}, monitor=${controlCenterCheck.monitorModeCheck?.ok}`,
    );
    const desktopOnlyPanelCheck = await verifyDesktopOnlyHostPanel(session);
    summary.checks.push("desktop-panel");
    print(
      "OK",
      `Desktop-only host panel: badge=${desktopOnlyPanelCheck.badge}, nativeLimit=${desktopOnlyPanelCheck.maxNativeClipboardFileBytes}, chunk=${desktopOnlyPanelCheck.nativeClipboardChunkSizeBytes}`,
    );
    const fileClipboardRecoveryCheck = await verifyFileClipboardRecoveryText(session);
    summary.checks.push("file-clipboard-recovery");
    print("OK", `File clipboard recovery: ${fileClipboardRecoveryCheck.recovery}`);
    const outgoingFileResultCheck = await verifyOutgoingFileResultStatus(session);
    summary.checks.push("file-clipboard-outgoing-result");
    print("OK", `File clipboard outgoing result: ${outgoingFileResultCheck.clipboardText}`);
    const fileClipboardIntegrityCheck = await verifyFileClipboardIntegrityGuards(session);
    summary.checks.push("file-clipboard-integrity");
    print("OK", `File clipboard integrity guards: rejected=${fileClipboardIntegrityCheck.rejectedResults.length}`);
    const blackBarCheck = await verifyBlackBarInputGuard(session);
    summary.checks.push("blackbar");
    print(
      "OK",
      `Black bar guard: move=${blackBarCheck.moveIgnored}, down=${blackBarCheck.blackBarDownIgnored}, release=${blackBarCheck.releaseSentAtLastPoint}, wheel=${blackBarCheck.blackBarWheelIgnored}`,
    );
    const streamFallbackCheck = await verifyStreamFallbackDiagnostics(session);
    summary.checks.push("fallback-diagnostics");
    summary.diagnostics = streamFallbackCheck.fallbackText;
    summary.uiDiagnostics = streamFallbackCheck.fallbackText;
    print("OK", `Stream fallback diagnostics: ${streamFallbackCheck.fallbackText}`);
    const frameAgeCheck = await verifyVideoFrameAgeDiagnostics(session);
    summary.checks.push("frame-age");
    print("OK", `Video frame age diagnostics: ${frameAgeCheck.latency} / ${frameAgeCheck.skewLatency}`);
    const lowFpsCheck = await verifyLowFpsDiagnostics(session);
    summary.checks.push("low-fps-diagnostics");
    print("OK", `Low FPS diagnostics: ${lowFpsCheck.lowText}`);
    const videoStutterCheck = await verifyVideoStutterDiagnostics(session);
    summary.checks.push("video-stutter-diagnostics");
    print("OK", `Video stutter diagnostics: ${videoStutterCheck.exportText}`);
    const keyFrameCheck = await verifyH264KeyFrameDetection(session);
    summary.checks.push("h264-keyframe");
    print(
      "OK",
      `H.264 key frame detection: annexbKey=${keyFrameCheck.annexbKey}, annexbDelta=${keyFrameCheck.annexbDelta}, avcKey=${keyFrameCheck.avcKey}`,
    );
    const latencyQueueCheck = await verifyH264LatencyQueueGuard(session);
    summary.h264 = makeH264RetestSummary({
      h264DecoderStatus: latencyQueueCheck.status,
      h264SkippedDeltaFrames: latencyQueueCheck.skippedDelta,
      h264DecoderNeedsKeyFrame: latencyQueueCheck.needsKeyFrame,
      h264DecoderQueue: latencyQueueCheck.queueLength,
      h264DecoderQueueMs: latencyQueueCheck.queueMs,
      h264DroppedStaleFrames: latencyQueueCheck.droppedStale,
      h264LastDropReason: latencyQueueCheck.lastDropReason,
      h264FallbackRecoveryCount: latencyQueueCheck.fallbackRecoveryCount,
      h264FallbackRecoveryPauseCount: latencyQueueCheck.fallbackRecoveryPauseCount,
      h264ReceivedFrames: keyFrameCheck.h264ReceivedFrames,
      h264ReceivedKeyFrames: keyFrameCheck.h264ReceivedKeyFrames,
      h264ReceivedSps: keyFrameCheck.h264ReceivedSps,
      h264ReceivedPps: keyFrameCheck.h264ReceivedPps,
      h264ReceivedIdr: keyFrameCheck.h264ReceivedIdr,
      h264LastNalTypes: keyFrameCheck.h264LastNalTypes,
      canvasVisible: false,
      canvasWidth: 0,
      canvasHeight: 0,
      imageVisible: false,
      imageHasSource: false,
    });
    summary.checks.push("h264-latency-queue");
    print(
      "OK",
      `H.264 latency queue guard: dropped=${latencyQueueCheck.queueBackpressureDropped ?? latencyQueueCheck.droppedStale} firstSurfaceGrace=${latencyQueueCheck.firstSurfaceQueueGrace ? "yes" : "no"} keyGrace=${latencyQueueCheck.keyFrameWaitGrace ? "yes" : "no"} h264Recovery=${latencyQueueCheck.keyFrameWaitH264Recovery ? "yes" : "no"} postRecoveryGrace=${latencyQueueCheck.postRecoveryQueueGrace ? "yes" : "no"} liveBacklogReq=${latencyQueueCheck.liveBacklogKeyFrameRequest ? "yes" : "no"} liveBacklogJump=${latencyQueueCheck.liveBacklogKeyFrameJumpedLive ? "yes" : "no"} keyFrameProgress=${latencyQueueCheck.recoveryKeyFrameProgress ? "yes" : "no"} receivedKeyFrame=${latencyQueueCheck.receivedKeyFramePreserved ? "yes" : "no"} drawCleared=${latencyQueueCheck.recoveryDrawCleared ? "yes" : "no"} jumpLive=${latencyQueueCheck.recoveryKeyFrameJumpedLive ? "yes" : "no"} recovery=${latencyQueueCheck.fallbackRecovery ? "yes" : "no"} reason=${latencyQueueCheck.lastDropReason}`,
    );
    const h264SummaryCheck = verifyW2W3RetestH264Summary();
    if (!h264SummaryCheck.ok) {
      throw new Error(`W2W3Retest H.264 summary check failed: ${JSON.stringify(h264SummaryCheck)}`);
    }
    summary.checks.push("w2w3-h264-summary");
    print("OK", `W2W3Retest H.264 summary: ${h264SummaryCheck.h264}`);
    const audioStabilityGateCheck = verifyW2W3RetestAudioStabilityGate();
    if (!audioStabilityGateCheck.ok) {
      throw new Error(`W2W3Retest audio stability gate check failed: ${JSON.stringify(audioStabilityGateCheck)}`);
    }
    summary.checks.push("w2w3-audio-stability");
    print("OK", `W2W3Retest audio stability gate: minFrames=${audioStabilityGateCheck.stableCandidate.frames} maxQueue=${audioStabilityGateCheck.stableCandidate.queueMs}ms`);
    const inputStatusCheck = await verifyInputModeStatusText(session);
    summary.checks.push("input-status");
    print(
      "OK",
      `Input status text: ${inputStatusCheck.logMode} / ${inputStatusCheck.injected} / ${inputStatusCheck.rejected}`,
    );
    const keyboardMappingCheck = await verifyWindowsToMacKeyboardMapping(session);
    summary.checks.push("keyboard-mapping");
    print(
      "OK",
      `Keyboard mapping: Ctrl+C -> ${keyboardMappingCheck.copy.modifiers.join("+")} / ${keyboardMappingCheck.copy.shortcutAction}; custom=${keyboardMappingCheck.custom.modifiers.join("+")}`,
    );
    const reconnectControlsCheck = await verifyReconnectControls(session);
    summary.liveVideo = reconnectControlsCheck.liveVideoLine || summary.liveVideo;
    summary.liveAudio = reconnectControlsCheck.liveAudioLine || summary.liveAudio;
    summary.checks.push("reconnect");
    print(
      "OK",
      `Reconnect controls: scheduled=${reconnectControlsCheck.scheduled}, immediate=${reconnectControlsCheck.immediate}`,
    );
    const audioBufferGuardCheck = await verifyAudioPlaybackBufferGuards(session);
    summary.checks.push("audio-buffer-guards");
    print(
      "OK",
      `Audio buffer guards: underrunStart=${audioBufferGuardCheck.underrunStart.toFixed(3)} underrun=${audioBufferGuardCheck.underrunCount ?? 0} stable=${audioBufferGuardCheck.stablePrebufferCount ?? 0} overflowDropped=${audioBufferGuardCheck.overflowDropped} resync=${audioBufferGuardCheck.overflowResyncCount ?? 0}`,
    );
    const layoutStabilityCheck = await verifyLiveStatusLayoutStability(session);
    summary.checks.push("layout-stability");
    print(
      "OK",
      `Live status layout stability: statusbar=${layoutStabilityCheck.after.statusbarHeight}px remote=${layoutStabilityCheck.after.remoteHeight}px`,
    );
    if (args.expectDiscoveryRuntimeBuildId) {
      const discoveryRuntimeCheck = await verifyDiscoveryRuntimeDiagnostics(session, {
        host: args.host,
        port: args.port,
        buildId: args.expectDiscoveryRuntimeBuildId,
        timeoutMs: args.timeoutMs,
      });
      print(
        "OK",
        `Discovery runtime: ${discoveryRuntimeCheck.detail} / ${discoveryRuntimeCheck.diagnostics}`,
      );
      summary.checks.push("discovery-runtime");
      summary.diagnostics = discoveryRuntimeCheck.diagnostics;
      summary.discoveryDiagnostics = discoveryRuntimeCheck.diagnostics;
    }
    if (args.diagnosticsOnly) {
      print("OK", "Diagnostics-only browser checks passed");
      summary.status = "passed";
      emitBoardSummary(summary);
      return;
    }

    await evaluate(
      session,
      `(() => {
        const setValue = (selector, value) => {
          const element = document.querySelector(selector);
          element.value = value;
          element.dispatchEvent(new Event("change", { bubbles: true }));
          element.dispatchEvent(new Event("input", { bubbles: true }));
        };
        setValue("#transportSelect", "websocket");
        setValue("#hostInput", ${JSON.stringify(args.host)});
        setValue("#portInput", ${JSON.stringify(args.port)});
        setValue("#passwordInput", ${JSON.stringify(args.password)});
        document.querySelector("#connectButton").click();
        return true;
      })()`,
    );

    let lastSnapshot = null;
    const snapshot = await waitForWindowsClientSnapshot({
      args,
      session,
      label: "Windows client browser connection",
      onSnapshot: (value) => {
        lastSnapshot = value;
      },
      check: async (value) => {
        if (value.status.includes("连接失败")) {
          throw new Error(`${value.status}: ${value.remote || value.diagnostics}`);
        }
        const hasVideoSurface =
          (value.canvasVisible && value.canvasWidth > 0 && value.canvasHeight > 0) ||
          (value.imageVisible && value.imageHasSource);
        const diagnosticsLower = value.diagnostics.toLowerCase();
        const remoteLower = value.remote.toLowerCase();
        const hasH264Surface =
          value.canvasVisible &&
          value.canvasWidth > 0 &&
          value.canvasHeight > 0 &&
          (diagnosticsLower.includes("h264") || remoteLower.includes("h.264")) &&
          !value.diagnostics.includes("JPEG 回退");
        const hasNoH264DecodeErrors = Number(value.h264DecoderErrors || 0) === 0;
        const hasFpsDiagnostics =
          !args.requireVideoSurface ||
          (/实收\s+(?!-)\d+(?:\.\d+)?\s+FPS/.test(value.metricFps) &&
            /协商\s+\d+\s+Hz/.test(value.metricFps));
        const audioStability = getAudioStabilityStatus(value, args);
        value.audioStabilityReason = audioStability.reason;
        value.audioStability = audioStability;
        if (
          value.status.includes("已连接") &&
          (!args.requireVideoSurface || hasVideoSurface) &&
          (!args.requireH264 || (hasH264Surface && hasNoH264DecodeErrors)) &&
          hasFpsDiagnostics &&
          audioStability.ok
        ) {
          return value;
        }
        return null;
      },
    }).catch((error) => {
      if (lastSnapshot) {
        print("INFO", `Last status: ${lastSnapshot.status}`);
        print("INFO", `Last remote: ${lastSnapshot.remote}`);
        print("INFO", `Last diagnostics: ${lastSnapshot.diagnostics}`);
        print("INFO", `Last FPS: ${lastSnapshot.metricFps}`);
        print("INFO", `Last audio: ${lastSnapshot.audio}`);
        print("INFO", `Last surface: canvas=${lastSnapshot.canvasVisible} ${lastSnapshot.canvasWidth}x${lastSnapshot.canvasHeight}, image=${lastSnapshot.imageVisible}`);
        if (lastSnapshot.logs?.length) {
          print("INFO", `Last logs: ${lastSnapshot.logs.join(" | ")}`);
        }
      }
      throw error;
    });

    print("OK", `Status: ${snapshot.status}`);
    summary.status = "passed";
    summary.remote = snapshot.remote;
    summary.diagnostics = snapshot.diagnostics;
    summary.uiDiagnostics = snapshot.diagnostics;
    summary.fps = snapshot.metricFps;
    summary.audio = snapshot.audio || summary.audio;
    summary.liveVideo = snapshot.liveVideo || summary.liveVideo;
    summary.liveAudio = snapshot.liveAudio || summary.liveAudio;
    summary.h264 = makeH264RetestSummary(snapshot) || summary.h264;
    summary.surface = `canvas=${snapshot.canvasVisible ? `${snapshot.canvasWidth}x${snapshot.canvasHeight}` : "off"},image=${snapshot.imageVisible ? "on" : "off"}`;
    summary.h264Errors = String(snapshot.h264DecoderErrors ?? "");
    summary.checks.push("connection");
    if (args.requireAudioStability) {
      summary.checks.push("audio-stability");
      print(
        "OK",
        `Audio stability: frames=${snapshot.audioStability.frames}, played=${snapshot.audioStability.played}, queue=${snapshot.audioStability.queueMs}ms, maxGap=${snapshot.audioStability.maxGapMs}ms, dropped=${snapshot.audioStability.dropped}`,
      );
    }
    print("OK", `Remote: ${snapshot.remote}`);
    print("OK", `Diagnostics: ${snapshot.diagnostics}`);
    print("OK", `FPS: ${snapshot.metricFps}`);
    print(
      "OK",
      `Surface: canvas=${snapshot.canvasVisible} ${snapshot.canvasWidth}x${snapshot.canvasHeight}, image=${snapshot.imageVisible}`,
    );
    print(
      "OK",
      `WebCodecs: VideoDecoder=${snapshot.webCodecs}, EncodedVideoChunk=${snapshot.encodedVideoChunk}, H264Errors=${snapshot.h264DecoderErrors}`,
    );
    if (snapshot.logs.length > 0) {
      print("INFO", `Recent logs: ${snapshot.logs.join(" | ")}`);
    }
    if (args.injectPcmAudio) {
      await evaluate(
        session,
        `(() => {
          const sampleRate = 48000;
          const channels = 2;
          const frameCount = 960;
          const samples = new Float32Array(frameCount * channels);
          for (let channel = 0; channel < channels; channel += 1) {
            for (let frame = 0; frame < frameCount; frame += 1) {
              const value = Math.sin((frame / sampleRate) * Math.PI * 2 * 440) * 0.05;
              samples[channel * frameCount + frame] = value;
            }
          }
          const bytes = new Uint8Array(samples.buffer);
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          handleAudioFrame({
            type: "audio_frame",
            frameId: 9001,
            codec: "pcm-f32le",
            encoding: "pcm-f32le-base64",
            layout: "planar",
            frames: frameCount,
            sampleRate,
            channels,
            durationMs: 20,
            level: 0.05,
            payload: btoa(binary),
          });
          return true;
        })()`,
      );
      const audioSnapshot = await waitForWindowsClientSnapshot({
        args,
        session,
        label: "Windows client PCM audio playback",
        check: async (value) => value.audio.includes("播放") ? value : null,
      });
      summary.audio = audioSnapshot.audio;
      summary.liveAudio = audioSnapshot.liveAudio || summary.liveAudio;
      summary.checks.push("audio");
      print("OK", `Audio: ${audioSnapshot.audio}`);
    }
    emitBoardSummary(summary);
  } finally {
    await closeBrowserBestEffort(session);
    try {
      session?.close();
    } catch {}
    const edgeDebugPortMatch = `--remote-debugging-port=${args.debugPort}`;
    stopWindowsProcessesByCommandLine(edgeDebugPortMatch);
    stopProcessTree(edge, { commandLineMatch: userDataDir });
    stopProcessTree(clientServer, { commandLineMatch: `apps\\windows-client\\server.mjs ${args.clientPort}` });
    await delay(500);
    stopWindowsProcessesByCommandLine(edgeDebugPortMatch);
    stopWindowsProcessesByCommandLine(userDataDir);
    await removeDirectoryBestEffort(userDataDir);
  }
}

run().catch((error) => {
  if (activeOutputArgs?.boardSummary && !lastBoardSummary) {
    const summary = activeSummary || {
      status: "failed",
      mode: "unknown",
      target: `${defaults.host}:${defaults.port}`,
      checks: [],
    };
    summary.status = "failed";
    summary.error = error?.message || "unknown error";
    emitBoardSummary(summary);
  }
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
