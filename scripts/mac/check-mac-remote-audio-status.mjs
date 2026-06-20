#!/usr/bin/env node
import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";

const defaults = {
  host: "127.0.0.1",
  port: 43770,
  server: "http://192.168.31.68:17888",
  timeoutMs: 2500,
  json: false,
  boardSummary: false,
  sendStatus: false,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/check-mac-remote-audio-status.mjs [options]

Checks the read-only status of Mac remote-only audio prerequisites. It probes
Mac host /discovery and reads the current macOS output volume/mute state. It
does not change volume, does not switch output devices, does not prompt for
passwords, does not authenticate, does not send input, and does not inject.

Options:
  --host <host>      Mac host discovery host. Default: ${defaults.host}
  --port <port>      Mac host discovery port. Default: ${defaults.port}
  --server <url>     Agent Link Board URL for --sendStatus. Default: ${defaults.server}
  --timeoutMs <ms>   Discovery/volume-read timeout. Default: ${defaults.timeoutMs}
  --sendStatus       Post the current secret-free summary to Agent Link Board.
  --json             Print one machine-readable JSON object.
  --boardSummary     Print one secret-free Agent Link Board summary line.
  --help, -h         Show this help without probing anything.

Remote-only audio is not claimed automatically. If local output is muted or at
volume 0, this command reports a manual-muted candidate that still needs an
audio smoke check and a restore path. Safety: read-only, no volume changes.`);
}

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--json" || token === "--boardSummary" || token === "--sendStatus") {
      args[token.slice(2)] = true;
      continue;
    }
    if (token === "--server" && next && !next.startsWith("--")) {
      args.server = next;
      index += 1;
      continue;
    }
    if (token === "--host" && next && !next.startsWith("--")) {
      args.host = next;
      index += 1;
      continue;
    }
    if (token === "--port" && next && !next.startsWith("--")) {
      args.port = clampInteger(next, 1, 65535, defaults.port);
      index += 1;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampInteger(next, 250, 60000, defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  args.host = normalizedText(args.host || defaults.host);
  args.server = normalizedText(args.server || defaults.server).replace(/\/+$/, "");
  return args;
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function requestJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = typeof url === "string" ? new URL(url) : url;
    const client = parsed.protocol === "https:" ? https : http;
    const request = client.get(parsed, { timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1024 * 1024) {
          request.destroy(new Error("response too large"));
        }
      });
      response.on("end", () => {
        if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
          reject(new Error(`HTTP ${response.statusCode || 0}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`invalid JSON: ${error.message}`));
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    request.on("error", reject);
  });
}

function postJson(url, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = typeof url === "string" ? new URL(url) : url;
    const body = JSON.stringify(payload);
    const client = parsed.protocol === "https:" ? https : http;
    const request = client.request(parsed, {
      method: "POST",
      timeout: timeoutMs,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        responseBody += chunk;
      });
      response.on("end", () => {
        if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
          reject(new Error(`HTTP ${response.statusCode || 0}`));
          return;
        }
        try {
          resolve(responseBody ? JSON.parse(responseBody) : { ok: true });
        } catch {
          resolve({ ok: true });
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    request.on("error", reject);
    request.end(body);
  });
}

function runCommand(command, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr, timedOut: signal === "SIGTERM" });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: null, signal: null, stdout, stderr: `${stderr}\n${error.message}`.trim(), timedOut: false });
    });
  });
}

function audioModeFromDiscovery(payload) {
  return normalizedText(
    payload?.capabilities?.audioMode
      || payload?.capabilities?.audio?.mode
      || payload?.audioMode
      || "unknown",
  ).toLowerCase();
}

function hostSummaryFromDiscovery(payload, args) {
  return {
    online: true,
    host: args.host,
    port: args.port,
    platform: normalizedText(payload?.platform || "unknown").toLowerCase(),
    role: normalizedText(payload?.role || "unknown").toLowerCase(),
    deviceName: normalizedText(payload?.deviceName || payload?.name || "unknown"),
    capture: {
      mode: audioModeFromDiscovery(payload),
      audioCapable: payload?.capabilities?.audio === true || Boolean(payload?.capabilities?.audioMode || payload?.capabilities?.audio?.mode),
    },
    runtimeBuild: normalizedText(payload?.runtime?.buildId || payload?.buildId || "unknown"),
  };
}

function parseVolumeSettings(text) {
  const value = String(text || "");
  const volumeMatch = value.match(/output volume:\s*(\d+)/i);
  const mutedMatch = value.match(/output muted:\s*(true|false)/i);
  if (!volumeMatch || !mutedMatch) {
    return {
      checked: true,
      ok: false,
      volume: null,
      muted: null,
      audible: null,
      state: "unknown",
      error: "unrecognized-volume-settings",
    };
  }
  const volume = Math.max(0, Math.min(100, Number(volumeMatch[1]) || 0));
  const muted = mutedMatch[1].toLowerCase() === "true";
  const audible = !muted && volume > 0;
  return {
    checked: true,
    ok: true,
    volume,
    muted,
    audible,
    state: audible ? "audible" : "muted-or-zero",
  };
}

async function readLocalOutput(timeoutMs) {
  const result = await runCommand("osascript", ["-e", "get volume settings"], timeoutMs);
  if (result.status !== 0) {
    return {
      checked: true,
      ok: false,
      volume: null,
      muted: null,
      audible: null,
      state: "unknown",
      error: result.timedOut ? "volume-read-timeout" : "volume-read-failed",
    };
  }
  return parseVolumeSettings(result.stdout);
}

function assess(host, localOutput) {
  const safety = {
    readOnly: true,
    noPassword: true,
    noInput: true,
    noInject: true,
    noVolumeChange: true,
    noOutputDeviceChange: true,
  };

  const base = {
    status: "unknown",
    reason: "unknown",
    host,
    capture: host?.capture || { mode: "unknown", audioCapable: false },
    localOutput,
    remoteOnly: {
      state: "unknown",
      proof: "not-proven",
    },
    nextAction: "check-local-volume-status",
    blockers: [],
    warnings: [],
    safety,
  };

  if (!host?.online) {
    return {
      ...base,
      status: "host-offline",
      reason: "host-offline",
      blockers: ["host-offline"],
      nextAction: "start-mac-host-before-remote-audio-status",
    };
  }

  if (host.capture.mode !== "system-pcm") {
    return {
      ...base,
      status: "capture-not-system-pcm",
      reason: "capture-not-system-pcm",
      blockers: ["capture-not-system-pcm"],
      nextAction: "restore-system-pcm-capture-before-remote-only-audio",
    };
  }

  if (!localOutput?.ok) {
    return {
      ...base,
      status: "unknown",
      reason: localOutput?.error || "local-output-unknown",
      blockers: ["local-output-unknown"],
      nextAction: "check-local-volume-status",
    };
  }

  if (localOutput.audible) {
    return {
      ...base,
      status: "local-playback-active",
      reason: "local-output-audible",
      remoteOnly: {
        state: "not-active",
        proof: "local-output-audible",
      },
      blockers: ["local-output-audible"],
      nextAction: "ask-user-consent-before-mute-or-route",
    };
  }

  return {
    ...base,
    status: "local-output-muted",
    reason: localOutput.muted ? "local-output-muted" : "local-output-volume-zero",
    remoteOnly: {
      state: "manual-muted-pending-audio-smoke",
      proof: "local-output-muted-or-zero",
    },
    warnings: ["remote-audio-smoke-required", "restore-path-required"],
    nextAction: "run-audio-smoke-or-restore-local-output",
  };
}

function safeToken(value, fallback = "unknown") {
  const text = normalizedText(value);
  if (!text) return fallback;
  return text.replace(/[;\s]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
}

function summarizeList(items) {
  return Array.isArray(items) && items.length > 0 ? items.map((item) => safeToken(item)).join(",") : "none";
}

function localOutputSummary(localOutput) {
  if (!localOutput?.ok) return "unknown";
  return localOutput.audible ? "audible" : "muted-or-zero";
}

function makeBoardSummary(report) {
  return [
    `MacRemoteAudioStatus=status=${safeToken(report.status)}`,
    `reason=${safeToken(report.reason)}`,
    `host=${report.host?.online ? "online" : "offline"}`,
    `capture=${safeToken(report.capture?.mode)}`,
    `localOutput=${localOutputSummary(report.localOutput)}`,
    `volume=${report.localOutput?.volume === null || report.localOutput?.volume === undefined ? "unknown" : report.localOutput.volume}`,
    `muted=${report.localOutput?.muted === null || report.localOutput?.muted === undefined ? "unknown" : report.localOutput.muted}`,
    `remoteOnly=${safeToken(report.remoteOnly?.state)}`,
    `blockers=${summarizeList(report.blockers)}`,
    `warnings=${summarizeList(report.warnings)}`,
    `Next=${safeToken(report.nextAction)}`,
    "Safety=read-only,no-volume-change,no-password,no-input,no-inject.",
  ].join(" ");
}

function boardStatusUrl(server) {
  const url = new URL(server);
  url.pathname = "/api/status";
  url.search = "";
  url.hash = "";
  return url;
}

function boardStatusForReport(report) {
  if (report.status === "local-playback-active") return "blocked-local-output";
  if (report.status === "local-output-muted") return "candidate-manual-muted";
  return safeToken(report.status);
}

function printPlain(report) {
  console.log("Mac remote audio status");
  console.log(`- status: ${report.status}`);
  console.log(`- reason: ${report.reason}`);
  console.log(`- capture: ${report.capture?.mode || "unknown"}`);
  console.log(`- local output: ${localOutputSummary(report.localOutput)} volume=${report.localOutput?.volume ?? "unknown"} muted=${report.localOutput?.muted ?? "unknown"}`);
  console.log(`- remote-only state: ${report.remoteOnly?.state || "unknown"}`);
  console.log(`- next action: ${report.nextAction}`);
  console.log(report.boardSummary);
}

async function buildReport(args) {
  let host;
  try {
    const payload = await requestJson(`http://${args.host}:${args.port}/discovery`, args.timeoutMs);
    host = hostSummaryFromDiscovery(payload, args);
  } catch (error) {
    host = {
      online: false,
      host: args.host,
      port: args.port,
      error: error.message,
      capture: { mode: "unknown", audioCapable: false },
    };
  }
  const localOutput = await readLocalOutput(args.timeoutMs);
  const report = assess(host, localOutput);
  report.boardSummary = makeBoardSummary(report);
  return report;
}

async function sendStatus(args, report) {
  try {
    await postJson(boardStatusUrl(args.server), {
      device: "Mac Remote Audio",
      role: "Mac 端",
      status: boardStatusForReport(report),
      note: report.boardSummary || makeBoardSummary(report),
    }, args.timeoutMs);
    report.postStatus = { ok: true };
  } catch (error) {
    report.postStatus = { ok: false, error: error.message };
  }
  return report.postStatus;
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  const report = await buildReport(args);
  if (args.sendStatus) {
    await sendStatus(args, report);
  }
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printPlain(report);
  }
  process.exitCode = report.status === "local-output-muted" && (!args.sendStatus || report.postStatus?.ok) ? 0 : 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
