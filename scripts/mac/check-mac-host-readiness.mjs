#!/usr/bin/env node
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  profile: "default",
  host: "127.0.0.1",
  port: 43770,
  password: process.env.LAN_DUAL_PASSWORD || "demo-password",
  timeoutMs: 20000,
  expectBuildId: "",
  currentBuildId: "",
  requireOpen: false,
  requireControlPermissions: false,
  requireInputMonitoring: false,
  requireCurrentBuildId: false,
  skipCurrentBuildCheck: false,
  probeHost: false,
  probeVideo: false,
  maxVideoFrameAgeMs: 0,
  probeAudio: false,
  probeInputLog: false,
  probeStartHelper: false,
  strict: false,
  json: false,
};

const profileDescriptions = {
  default: "default low-risk checks only",
  deploy: "require reachable current-build host, control permissions, input monitoring, H.264, PCM, and safe input-log smoke",
  deep: "deploy profile plus start-helper temporary-port self-test",
};

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (key === "help" || key === "h") {
      args.help = true;
      continue;
    }
    if (
      key === "requireOpen" ||
      key === "requireControlPermissions" ||
      key === "requireInputMonitoring" ||
      key === "requireCurrentBuildId" ||
      key === "skipCurrentBuildCheck" ||
      key === "probeHost" ||
      key === "probeVideo" ||
      key === "probeAudio" ||
      key === "probeInputLog" ||
      key === "probeStartHelper" ||
      key === "strict" ||
      key === "json"
    ) {
      args[key] = true;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(args, key) && next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    }
  }

  args.profile = normalizedText(args.profile || defaults.profile).toLowerCase();
  args.host = String(args.host || defaults.host).trim();
  args.port = clampInteger(args.port, 1, 65535, defaults.port);
  args.password = String(args.password || defaults.password);
  args.timeoutMs = clampInteger(args.timeoutMs, 3000, 120000, defaults.timeoutMs);
  args.expectBuildId = normalizedText(args.expectBuildId);
  args.currentBuildId = getGitBuildId();
  args.maxVideoFrameAgeMs = clampInteger(args.maxVideoFrameAgeMs, 0, 600000, defaults.maxVideoFrameAgeMs);
  args.requireOpen = booleanArg(args.requireOpen);
  args.requireControlPermissions = booleanArg(args.requireControlPermissions);
  args.requireInputMonitoring = booleanArg(args.requireInputMonitoring);
  args.requireCurrentBuildId = booleanArg(args.requireCurrentBuildId);
  args.skipCurrentBuildCheck = booleanArg(args.skipCurrentBuildCheck);
  args.probeHost = booleanArg(args.probeHost);
  args.probeVideo = booleanArg(args.probeVideo);
  args.probeAudio = booleanArg(args.probeAudio);
  args.probeInputLog = booleanArg(args.probeInputLog);
  args.probeStartHelper = booleanArg(args.probeStartHelper);
  args.strict = booleanArg(args.strict);
  args.json = booleanArg(args.json);
  applyProfile(args);
  args.probeHost = args.probeHost || Boolean(args.expectBuildId);
  args.probeVideo = args.probeVideo || args.maxVideoFrameAgeMs > 0;
  return args;
}

function applyProfile(args) {
  if (!Object.prototype.hasOwnProperty.call(profileDescriptions, args.profile)) {
    throw new Error(`Unknown readiness profile "${args.profile}". Expected one of: ${Object.keys(profileDescriptions).join(", ")}`);
  }
  if (args.profile === "default") return;

  args.requireOpen = true;
  args.requireControlPermissions = true;
  args.requireInputMonitoring = true;
  args.requireCurrentBuildId = true;
  args.probeHost = true;
  args.probeVideo = true;
  args.probeAudio = true;
  args.probeInputLog = true;
  if (args.maxVideoFrameAgeMs <= 0) {
    args.maxVideoFrameAgeMs = 250;
  }
  if (args.profile === "deep") {
    args.probeStartHelper = true;
  }
}

function printHelp() {
  console.log(`Usage: node scripts/mac/check-mac-host-readiness.mjs [options]

Runs a low-risk Mac host readiness check for LAN control work. Default checks
are read-only: platform, Node/Swift, Mac host build, direct-start input
defaults, helper syntax/dry-run, keymap coverage, and a non-failing
/discovery status check.

Options:
  --profile <name>          Readiness preset: default, deploy, or deep.
                            default: ${profileDescriptions.default}
                            deploy: ${profileDescriptions.deploy}
                            deep: ${profileDescriptions.deep}
  --host <host>             Mac host probe host. Default: 127.0.0.1
  --port <port>             Mac host port. Default: 43770
  --password <password>     Probe password. Default: LAN_DUAL_PASSWORD or demo-password
  --timeoutMs <ms>          Per-step timeout. Default: 20000
  --expectBuildId <id>      Require running host runtime.buildId. Implies --probeHost.
  --requireCurrentBuildId   Require running host runtime.buildId to match current git short hash.
  --skipCurrentBuildCheck   Do not warn when running host build differs from current git.
  --requireOpen             Fail if /discovery is not reachable.
  --requireControlPermissions
                            Require screen recording and accessibility permissions.
  --requireInputMonitoring  Require input monitoring permission to be granted.
  --probeHost               Run check-mac-displays runtime/display round-trip.
  --probeVideo              Run short H.264 video observation.
  --maxVideoFrameAgeMs <ms> Require fresh video_frame.timestamp during --probeVideo.
                            Implies --probeVideo. Default: off.
  --probeAudio              Run short PCM audio observation. Does not play a tone.
  --probeInputLog           Run safe input log smoke test; refuses non-log hosts.
  --probeStartHelper        Run start helper self-test on a temporary local port.
  --strict                  Treat warnings as failure.
  --json                    Print machine-readable JSON summary.
`);
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function booleanArg(value) {
  return value === true || value === "true" || value === "1" || value === "yes" || value === "on";
}

function getGitBuildId() {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 3000,
  });
  return result.status === 0 ? normalizedText(result.stdout) : "";
}

function print(kind, text, args) {
  if (args.json) return;
  console.log(`[${kind}] ${text}`);
}

function stripAnsi(text) {
  return String(text || "").replace(/\u001b\[[0-9;]*m/g, "");
}

function splitLines(text) {
  return stripAnsi(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function collectLines(text, marker) {
  return splitLines(text).filter((line) => line.startsWith(marker));
}

function summarizeOutput(text) {
  const lines = splitLines(text);
  const buildComplete = lines.find((line) => line.includes("Build complete!"));
  if (buildComplete) return buildComplete;
  const macVersion = lines.find((line) => line.startsWith("ProductVersion:"));
  const macBuild = lines.find((line) => line.startsWith("BuildVersion:"));
  if (macVersion) return macBuild ? `${macVersion} ${macBuild}` : macVersion;
  const okLines = lines.filter((line) => line.startsWith("[OK]"));
  const passedLines = okLines.filter((line) => /passed|complete|verified|through|通过/i.test(line));
  const priority =
    passedLines.at(-1) ||
    okLines.at(-1) ||
    lines.find((line) => line.startsWith("[INFO]")) ||
    lines.find((line) => /swift-driver version|Apple Swift version|v\d+\.\d+\.\d+/.test(line));
  return priority || lines.at(-1) || "";
}

function filterExpectedWarnings(label, warnings) {
  if (label === "Mac host helper dry-run") {
    return warnings.filter((line) => !line.includes("demo password"));
  }
  return warnings;
}

function makeResult({ label, ok, exitCode = 0, elapsedMs = 0, summary = "", stdout = "", stderr = "", warnings = [], errors = [] }) {
  return {
    label,
    ok,
    exitCode,
    elapsedMs,
    summary,
    stdout,
    stderr,
    warnings,
    errors,
  };
}

function runCommand(label, command, commandArgs, options = {}) {
  const startedAt = Date.now();
  const child = spawn(command, commandArgs, {
    cwd: options.cwd || repoRoot,
    env: {
      ...process.env,
      ...(options.env || {}),
    },
    shell: false,
  });

  let stdout = "";
  let stderr = "";
  return new Promise((resolveRun) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolveRun(result);
    };
    const timeoutMs = options.timeoutMs || 20000;
    const timer = setTimeout(() => {
      child.kill();
      finish(makeResult({
        label,
        ok: false,
        exitCode: null,
        elapsedMs: Date.now() - startedAt,
        summary: `${label} timed out after ${timeoutMs} ms`,
        stdout,
        stderr,
        errors: [`${label} timed out after ${timeoutMs} ms`],
      }));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish(makeResult({
        label,
        ok: false,
        exitCode: null,
        elapsedMs: Date.now() - startedAt,
        summary: error.message,
        stdout,
        stderr,
        errors: [error.message],
      }));
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const output = `${stdout}\n${stderr}`;
      finish(makeResult({
        label,
        ok: exitCode === 0,
        exitCode,
        elapsedMs: Date.now() - startedAt,
        summary: summarizeOutput(output),
        stdout,
        stderr,
        warnings: filterExpectedWarnings(label, collectLines(output, "[WARN]")),
        errors: collectLines(output, "[ERROR]").concat(exitCode === 0 ? [] : collectLines(output, "[FAIL]")),
      }));
    });
  });
}

async function runStep(results, args, label, command, commandArgs, options = {}) {
  print("INFO", `Running ${label}`, args);
  const result = await runCommand(label, command, commandArgs, options);
  results.push(result);
  if (result.ok) {
    print("OK", `${label}: ${result.summary || "passed"}`, args);
  } else {
    print("ERROR", `${label}: ${result.summary || `exit ${result.exitCode}`}`, args);
  }
  for (const warning of result.warnings.slice(0, 3)) {
    print("WARN", `${label}: ${warning.replace(/^\[WARN\]\s*/, "")}`, args);
  }
  return result;
}

async function runCustomStep(results, args, label, callback) {
  print("INFO", `Running ${label}`, args);
  const startedAt = Date.now();
  try {
    const payload = await callback();
    const result = makeResult({
      label,
      ok: payload.ok,
      exitCode: payload.ok ? 0 : 1,
      elapsedMs: Date.now() - startedAt,
      summary: payload.summary,
      warnings: payload.warnings || [],
      errors: payload.errors || [],
    });
    results.push(result);
    print(payload.ok ? "OK" : "ERROR", `${label}: ${payload.summary}`, args);
    for (const warning of result.warnings.slice(0, 3)) {
      print("WARN", `${label}: ${warning}`, args);
    }
    return result;
  } catch (error) {
    const result = makeResult({
      label,
      ok: false,
      exitCode: 1,
      elapsedMs: Date.now() - startedAt,
      summary: error.message,
      errors: [error.message],
    });
    results.push(result);
    print("ERROR", `${label}: ${error.message}`, args);
    return result;
  }
}

function requestJson(url, timeoutMs) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          rejectRequest(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolveRequest(JSON.parse(body));
        } catch {
          rejectRequest(new Error("discovery returned invalid JSON"));
        }
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
    request.on("error", rejectRequest);
  });
}

function formatRuntime(runtime) {
  if (!runtime || typeof runtime !== "object") return "runtime=missing";
  const parts = [];
  if (runtime.processId) parts.push(`pid=${runtime.processId}`);
  if (runtime.buildId) parts.push(`build=${runtime.buildId}`);
  if (runtime.uptimeSeconds !== undefined) parts.push(`uptime=${runtime.uptimeSeconds}s`);
  return parts.length > 0 ? parts.join(" ") : "runtime=missing";
}

function formatPermissions(permissions) {
  if (!permissions || typeof permissions !== "object") return "permissions=missing";
  const status = (value) => {
    if (value === true) return "on";
    if (value === false) return "off";
    return "unknown";
  };
  return [
    `screen=${status(permissions.screenRecording)}`,
    `accessibility=${status(permissions.accessibility)}`,
    `inputMonitoring=${status(permissions.inputMonitoring)}`,
  ].join(" ");
}

function discoveryInputMode(discovery) {
  return discovery?.capabilities?.inputMode || discovery?.capabilities?.input?.mode || discovery?.inputMode || "unknown";
}

async function checkDiscovery(args) {
  try {
    const discovery = await requestJson(`http://${args.host}:${args.port}/discovery`, Math.min(args.timeoutMs, 3000));
    const input = discoveryInputMode(discovery);
    const runtime = discovery.runtime || {};
    const permissions = discovery.permissions || {};
    const warnings = [];
    const errors = [];
    if (args.expectBuildId && runtime.buildId !== args.expectBuildId) {
      return {
        ok: false,
        summary: `build mismatch: ${runtime.buildId || "missing"} !== ${args.expectBuildId}`,
        errors: [`runtime.buildId mismatch: ${runtime.buildId || "missing"} !== ${args.expectBuildId}`],
      };
    }
    if (args.requireCurrentBuildId && !runtime.buildId) {
      errors.push("runtime.buildId is required to check the running host against current git");
    }
    if (!args.skipCurrentBuildCheck && args.currentBuildId && runtime.buildId && runtime.buildId !== args.currentBuildId) {
      const message = `running host build ${runtime.buildId} differs from current git ${args.currentBuildId}; restart with scripts/mac/start-mac-host.mjs after coordinating if you need the latest build`;
      warnings.push(message);
      if (args.requireCurrentBuildId) {
        errors.push(message);
      }
    }
    if (input !== "log") {
      warnings.push(`input mode is ${input}; keep log mode for unattended readiness checks`);
    }
    if (permissions.screenRecording !== true) {
      warnings.push("screen recording permission is off; real video capture may fall back or fail");
      if (args.requireControlPermissions) {
        errors.push("screen recording permission is required");
      }
    }
    if (permissions.accessibility !== true) {
      warnings.push("accessibility permission is off; real input injection will fail");
      if (args.requireControlPermissions) {
        errors.push("accessibility permission is required");
      }
    }
    if (permissions.inputMonitoring === false) {
      warnings.push("input monitoring permission is off or not yet confirmed; keyboard edge cases may need manual permission review");
    }
    if (args.requireInputMonitoring && permissions.inputMonitoring !== true) {
      errors.push("input monitoring permission is required");
    }
    return {
      ok: errors.length === 0,
      summary: `${discovery.deviceName || discovery.hostName || "Mac host"} · input=${input} · ${formatRuntime(runtime)} · ${formatPermissions(permissions)}`,
      warnings,
      errors,
    };
  } catch (error) {
    const summary = `/discovery not reachable on ${args.host}:${args.port}: ${error.message}`;
    if (args.requireOpen) {
      return { ok: false, summary, errors: [summary] };
    }
    return {
      ok: true,
      summary: `${summary}; start with scripts/mac/start-mac-host.mjs when ready`,
      warnings: [summary],
    };
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const results = [];
  const node = process.execPath;

  if (args.profile !== "default") {
    print("INFO", `Using readiness profile "${args.profile}": ${profileDescriptions[args.profile]}`, args);
  }

  await runStep(results, args, "Node.js", node, ["--version"], { timeoutMs: 5000 });
  await runStep(results, args, "macOS version", "sw_vers", [], { timeoutMs: 5000 });
  await runStep(results, args, "Swift", "swift", ["--version"], { timeoutMs: 10000 });
  await runStep(results, args, "Mac host build", "swift", ["build", "--package-path", "apps/mac-host"], {
    timeoutMs: args.timeoutMs,
  });
  await runStep(results, args, "Mac host direct-start defaults", node, ["scripts/mac/test-mac-host-defaults.mjs"], {
    timeoutMs: Math.max(args.timeoutMs, 25000),
  });
  await runStep(results, args, "Mac host start helper syntax", node, ["--check", "scripts/mac/start-mac-host.mjs"], {
    timeoutMs: 8000,
  });
  await runStep(results, args, "Mac host helper dry-run", node, ["scripts/mac/start-mac-host.mjs", "--dryRun"], {
    timeoutMs: 10000,
  });
  await runStep(results, args, "Mac input keymap coverage", node, ["scripts/mac/check-input-keymap.mjs"], {
    timeoutMs: 10000,
  });
  await runCustomStep(results, args, "Mac host discovery", () => checkDiscovery(args));

  if (args.probeHost) {
    await runStep(
      results,
      args,
      "Mac host runtime/display round-trip",
      node,
      [
        "scripts/mac/check-mac-displays.mjs",
        "--host",
        args.host,
        "--port",
        String(args.port),
        "--password",
        args.password,
        "--requireRuntime",
        ...(args.expectBuildId ? ["--expectBuildId", args.expectBuildId] : []),
        "--timeoutMs",
        String(args.timeoutMs),
      ],
      { timeoutMs: Math.max(args.timeoutMs, 25000) },
    );
  }

  if (args.probeStartHelper) {
    await runStep(
      results,
      args,
      "Mac host start helper self-test",
      node,
      ["scripts/mac/test-mac-host-start-helper.mjs", "--timeoutMs", String(Math.max(args.timeoutMs, 30000))],
      { timeoutMs: Math.max(args.timeoutMs, 60000) },
    );
  }

  if (args.probeVideo) {
    await runStep(
      results,
      args,
      "Mac host H.264 video observation",
      node,
      [
        "scripts/mac/observe-mac-video.mjs",
        "--host",
        args.host,
        "--port",
        String(args.port),
        "--password",
        args.password,
        "--durationMs",
        "2500",
        "--timeoutMs",
        String(args.timeoutMs),
        "--requireH264",
        "--minFrames",
        "10",
        "--maxGapMs",
        "1500",
        "--expectActiveDisplayId",
        "main",
        "--requireFrameTimestamp",
        ...(args.maxVideoFrameAgeMs > 0 ? ["--maxFrameAgeMs", String(args.maxVideoFrameAgeMs)] : []),
        "--requireMonotonicTimestampUs",
        "--maxTimestampGapUs",
        "1000000",
      ],
      { timeoutMs: Math.max(args.timeoutMs, 35000) },
    );
  }

  if (args.probeAudio) {
    await runStep(
      results,
      args,
      "Mac host PCM audio observation",
      node,
      [
        "scripts/mac/observe-mac-audio.mjs",
        "--host",
        args.host,
        "--port",
        String(args.port),
        "--password",
        args.password,
        "--durationMs",
        "2500",
        "--timeoutMs",
        String(args.timeoutMs),
        "--minFrames",
        "80",
        "--maxGapMs",
        "1000",
      ],
      { timeoutMs: Math.max(args.timeoutMs, 35000) },
    );
  }

  if (args.probeInputLog) {
    await runStep(
      results,
      args,
      "Mac host input log smoke",
      node,
      [
        "scripts/mac/smoke-mac-input-log.mjs",
        "--host",
        args.host,
        "--port",
        String(args.port),
        "--password",
        args.password,
        "--timeoutMs",
        String(args.timeoutMs),
        "--expectInputMode",
        "log",
      ],
      { timeoutMs: Math.max(args.timeoutMs, 25000) },
    );
  }

  const failed = results.filter((result) => !result.ok);
  const warnings = results.flatMap((result) => result.warnings);
  const ok = failed.length === 0 && (!args.strict || warnings.length === 0);

  const summary = {
    ok,
    strict: args.strict,
    args: {
      profile: args.profile,
      host: args.host,
      port: args.port,
      expectBuildId: args.expectBuildId,
      currentBuildId: args.currentBuildId,
      requireCurrentBuildId: args.requireCurrentBuildId,
      skipCurrentBuildCheck: args.skipCurrentBuildCheck,
      requireOpen: args.requireOpen,
      requireControlPermissions: args.requireControlPermissions,
      requireInputMonitoring: args.requireInputMonitoring,
      probeHost: args.probeHost,
      probeVideo: args.probeVideo,
      maxVideoFrameAgeMs: args.maxVideoFrameAgeMs,
      probeAudio: args.probeAudio,
      probeInputLog: args.probeInputLog,
      probeStartHelper: args.probeStartHelper,
    },
    passed: results.filter((result) => result.ok).length,
    failed: failed.length,
    warnings: warnings.length,
    results: results.map((result) => ({
      label: result.label,
      ok: result.ok,
      exitCode: result.exitCode,
      elapsedMs: result.elapsedMs,
      summary: result.summary,
      warnings: result.warnings,
      errors: result.errors,
    })),
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    print(
      ok ? "OK" : "ERROR",
      ok
        ? `Mac host readiness passed: ${summary.passed}/${results.length} checks`
        : `Mac host readiness failed: ${summary.failed} failed, ${summary.warnings} warnings`,
      args,
    );
    if (!ok && !args.probeHost) {
      print("INFO", "For deeper validation, rerun with --probeHost, --probeVideo, --probeAudio, or --probeInputLog as needed.", args);
    }
  }

  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
