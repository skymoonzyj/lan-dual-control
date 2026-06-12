import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const defaultWindowsFfmpeg = "C:\\DevTools\\ffmpeg\\bin\\ffmpeg.exe";

const defaults = {
  ffmpeg: process.env.LAN_DUAL_FFMPEG || "",
  device: process.env.LAN_DUAL_WINDOWS_AUDIO_DEVICE || "",
  sampleRate: Number(process.env.LAN_DUAL_WINDOWS_AUDIO_SAMPLE_RATE) || 48000,
  channels: Number(process.env.LAN_DUAL_WINDOWS_AUDIO_CHANNELS) || 2,
  durationMs: 1200,
  probe: false,
  json: false,
};

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (key === "probe" || key === "json") {
      args[key] = true;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(args, key) && next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    }
  }

  args.sampleRate = Number(args.sampleRate) || defaults.sampleRate;
  args.channels = Number(args.channels) || defaults.channels;
  args.durationMs = Number(args.durationMs) || defaults.durationMs;
  args.device = String(args.device || "").trim();
  args.ffmpeg = resolveFfmpegCommand(String(args.ffmpeg || "").trim());
  return args;
}

function resolveFfmpegCommand(value) {
  if (value) return value;
  if (process.platform === "win32" && existsSync(defaultWindowsFfmpeg)) {
    return defaultWindowsFfmpeg;
  }
  return "ffmpeg";
}

function print(kind, text, args) {
  if (args.json) return;
  console.log(`[${kind}] ${text}`);
}

function listDshowDevices(args) {
  const result = spawnSync(args.ffmpeg, ["-hide_banner", "-f", "dshow", "-list_devices", "true", "-i", "dummy"], {
    encoding: "utf8",
    timeout: 8000,
    windowsHide: true,
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const devices = [];
  const devicePattern = /"([^"]+)"\s+\((audio|video|none)\)/g;
  let match = devicePattern.exec(output);
  while (match) {
    devices.push({
      name: match[1],
      kind: match[2],
      hint: classifyDevice(match[1], match[2]),
    });
    match = devicePattern.exec(output);
  }
  const unique = [];
  const seen = new Set();
  for (const device of devices) {
    const key = `${device.kind}:${device.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(device);
  }

  return {
    ok: !result.error && unique.length > 0,
    error: result.error?.message || "",
    exitCode: result.status,
    devices: unique,
  };
}

function classifyDevice(name, kind) {
  const text = `${name}`.toLowerCase();
  if (kind !== "audio") return "not-audio";
  if (
    text.includes("virtual") ||
    text.includes("loopback") ||
    text.includes("stereo mix") ||
    text.includes("what u hear") ||
    text.includes("虚拟") ||
    text.includes("混音")
  ) {
    return "virtual-or-loopback";
  }
  if (text.includes("microphone") || text.includes("mic") || text.includes("麦克风")) {
    return "microphone";
  }
  return "audio";
}

function probeDevice(args) {
  return new Promise((resolve) => {
    const seconds = Math.max(0.2, args.durationMs / 1000);
    const ffmpegArgs = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "dshow",
      "-i",
      `audio=${args.device}`,
      "-t",
      String(seconds),
      "-vn",
      "-f",
      "f32le",
      "-acodec",
      "pcm_f32le",
      "-ar",
      String(args.sampleRate),
      "-ac",
      String(args.channels),
      "pipe:1",
    ];

    const child = spawn(args.ffmpeg, ffmpegArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const chunks = [];
    const stderr = [];
    let bytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
    }, args.durationMs + 5000);

    child.stdout.on("data", (chunk) => {
      chunks.push(chunk);
      bytes += chunk.length;
    });
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        bytes,
        level: 0,
        error: error.message,
        stderr: stderr.join("").trim(),
      });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const buffer = Buffer.concat(chunks);
      resolve({
        ok: bytes > 0 && code === 0,
        exitCode: code,
        bytes,
        level: computePcmLevel(buffer),
        stderr: stderr.join("").trim(),
      });
    });
  });
}

function computePcmLevel(buffer) {
  const alignedLength = buffer.length - (buffer.length % 4);
  let peak = 0;
  for (let offset = 0; offset < alignedLength; offset += 4) {
    const sample = buffer.readFloatLE(offset);
    if (Number.isFinite(sample)) {
      peak = Math.max(peak, Math.min(1, Math.abs(sample)));
    }
  }
  return Number(peak.toFixed(4));
}

function summarizeEnv(args) {
  return {
    ffmpeg: args.ffmpeg,
    mode: process.env.LAN_DUAL_WINDOWS_AUDIO_MODE || "",
    device: args.device,
    sampleRate: args.sampleRate,
    channels: args.channels,
    durationMs: args.durationMs,
  };
}

async function run() {
  const args = parseArgs(process.argv);
  const env = summarizeEnv(args);
  const list = listDshowDevices(args);
  const audioDevices = list.devices.filter((device) => device.kind === "audio");
  let probe = null;

  if (args.probe) {
    if (!args.device) {
      throw new Error("Pass --device \"device name\" or set LAN_DUAL_WINDOWS_AUDIO_DEVICE before --probe.");
    }
    probe = await probeDevice(args);
  }

  if (args.json) {
    console.log(JSON.stringify({ env, list, audioDevices, probe }, null, 2));
    return;
  }

  print("INFO", `FFmpeg: ${env.ffmpeg}`, args);
  print("INFO", `Configured device: ${env.device || "(none)"}`, args);
  print("INFO", `PCM target: ${env.sampleRate} Hz / ${env.channels} ch / ${env.durationMs} ms`, args);
  if (list.error) {
    print("WARN", `Device listing error: ${list.error}`, args);
  }
  print("OK", `DirectShow devices found: ${list.devices.length} total, ${audioDevices.length} audio`, args);
  for (const device of audioDevices) {
    const marker = device.name === args.device ? "*" : "-";
    print("DEV", `${marker} ${device.name} [${device.hint}]`, args);
  }
  if (!args.probe) {
    print("INFO", "No audio was captured. Add --probe --device \"name\" for a short in-memory PCM check.", args);
    return;
  }
  if (probe?.ok) {
    print("OK", `Probe captured ${probe.bytes} bytes, peak=${probe.level}`, args);
  } else {
    print("FAIL", `Probe failed: ${probe?.error || probe?.stderr || `exit ${probe?.exitCode}`}`, args);
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
