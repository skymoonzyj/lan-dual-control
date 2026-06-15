import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const defaults = {
  host: "127.0.0.1",
  port: "43770",
  password: process.env.LAN_DUAL_PASSWORD || "demo-password",
  passwordProvided: false,
  promptPassword: false,
  requirePassword: true,
  timeoutMs: 30000,
  videoDurationMs: 300000,
  audioDurationMs: 30000,
  minVideoFrames: 1200,
  minVideoFps: 5,
  maxVideoGapMs: 3000,
  minAudioFrames: 900,
  minAudioFps: 40,
  maxAudioGapMs: 1000,
  width: 1920,
  height: 1080,
  fps: 60,
  bandwidthKbps: 50000,
  clientPort: 5197,
  debugPort: 9337,
  allowMockVideo: false,
  skipProbe: false,
  skipBrowser: false,
  skipAudio: false,
  skipClipboard: false,
  skipFileClipboard: false,
  skipInputLog: false,
  fastProfile: false,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/check-mac-formal-e2e.mjs [options]

Runs the Windows-side formal E2E flow for a real Mac host. It reuses the safe
password support in probe-mac-host and test-windows-client-browser, passes the
password to child probes through LAN_DUAL_PASSWORD, and never sends inject.

Options:
  --host <host>                  Mac host address. Default: ${defaults.host}
  --port <port>                  Mac host port. Default: ${defaults.port}
  --password <password>          Probe password. Prefer LAN_DUAL_PASSWORD or --promptPassword.
  --promptPassword               Prompt once for the password without echoing it.
  --requirePassword              Refuse empty/demo-password credentials. Default: on.
  --allowDemoPassword            Permit demo-password for local mock/dev probes only.
  --timeoutMs <ms>               Per-step timeout. Default: ${defaults.timeoutMs}
  --videoDurationMs <ms>         H.264 observation duration. Default: ${defaults.videoDurationMs}
  --audioDurationMs <ms>         PCM audio observation duration. Default: ${defaults.audioDurationMs}
  --minVideoFrames <count>       Required observed video frames. Default: ${defaults.minVideoFrames}
  --minVideoFps <fps>            Required observed video FPS. Default: ${defaults.minVideoFps}
  --maxVideoGapMs <ms>           Max video arrival gap. Default: ${defaults.maxVideoGapMs}
  --minAudioFrames <count>       Required observed audio frames. Default: ${defaults.minAudioFrames}
  --minAudioFps <fps>            Required observed audio FPS. Default: ${defaults.minAudioFps}
  --maxAudioGapMs <ms>           Max audio arrival gap. Default: ${defaults.maxAudioGapMs}
  --width <px>                   Requested width. Default: ${defaults.width}
  --height <px>                  Requested height. Default: ${defaults.height}
  --fps <fps>                    Requested refresh rate. Default: ${defaults.fps}
  --bandwidthKbps <kbps>         Requested max bandwidth. Default: ${defaults.bandwidthKbps}
  --clientPort <port>            Local Windows client web port. Default: ${defaults.clientPort}
  --debugPort <port>             Browser remote debugging port. Default: ${defaults.debugPort}
  --fastProfile                  Short local smoke profile: 10s video, 3s audio.
  --allowMockVideo               Do not require H.264/real video; useful for mock host checks.
  --skipProbe                    Skip protocol/media/clipboard/input-log probe.
  --skipBrowser                  Skip Windows client browser H.264 check.
  --skipAudio                    Skip PCM audio probe.
  --skipClipboard                Skip text and file clipboard probes.
  --skipFileClipboard            Skip file clipboard probe only.
  --skipInputLog                 Skip safe input-log probe.
  --help, -h                     Show this help.

Examples:
  node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --port 43770 --promptPassword
  node scripts/windows/check-mac-formal-e2e.mjs --host 192.168.31.122 --promptPassword --fastProfile
  node scripts/windows/check-mac-formal-e2e.mjs --host 127.0.0.1 --allowDemoPassword --allowMockVideo --skipAudio --skipBrowser
`);
}

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);

    if (key === "allowDemoPassword") {
      args.requirePassword = false;
      continue;
    }
    if (
      key === "promptPassword" ||
      key === "requirePassword" ||
      key === "allowMockVideo" ||
      key === "skipProbe" ||
      key === "skipBrowser" ||
      key === "skipAudio" ||
      key === "skipClipboard" ||
      key === "skipFileClipboard" ||
      key === "skipInputLog" ||
      key === "fastProfile"
    ) {
      args[key] = true;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(args, key) && next && !next.startsWith("--")) {
      if (key === "password") {
        args.passwordProvided = true;
      }
      args[key] = next;
      index += 1;
    }
  }

  for (const key of [
    "timeoutMs",
    "videoDurationMs",
    "audioDurationMs",
    "minVideoFrames",
    "minVideoFps",
    "maxVideoGapMs",
    "minAudioFrames",
    "minAudioFps",
    "maxAudioGapMs",
    "width",
    "height",
    "fps",
    "bandwidthKbps",
    "clientPort",
    "debugPort",
  ]) {
    args[key] = Number(args[key]);
  }

  if (args.fastProfile) {
    args.videoDurationMs = 10000;
    args.audioDurationMs = 3000;
    args.minVideoFrames = args.allowMockVideo ? 5 : 30;
    args.minAudioFrames = 60;
  }

  return args;
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

async function preparePassword(args) {
  if (args.promptPassword && args.passwordProvided) {
    throw new Error("--promptPassword cannot be combined with --password.");
  }
  if (args.promptPassword && process.env.LAN_DUAL_PASSWORD) {
    throw new Error("--promptPassword refuses to override an existing LAN_DUAL_PASSWORD. Unset it or omit --promptPassword.");
  }
  if (args.promptPassword) {
    args.password = await promptHidden("Mac host password: ");
    if (!args.password) {
      throw new Error("Password cannot be empty when --promptPassword is used.");
    }
  }
  const effectivePassword = String(args.password || "");
  if (args.requirePassword && !effectivePassword) {
    throw new Error("LAN_DUAL_PASSWORD is required. Set it in the environment, pass --password, or use --promptPassword.");
  }
  if (args.requirePassword && effectivePassword === "demo-password") {
    throw new Error("Refusing to use demo-password. Use --promptPassword/LAN_DUAL_PASSWORD, or --allowDemoPassword for local mock checks.");
  }
}

function promptHidden(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
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
      if (error) rejectPrompt(error);
      else resolvePrompt(result);
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

function runNode(script, childArgs, { env, cwd }) {
  return new Promise((resolveRun, rejectRun) => {
    print("RUN", `node ${script} ${childArgs.join(" ")}`);
    const child = spawn(process.execPath, [script, ...childArgs], {
      cwd,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(new Error(`${script} exited ${code}`));
      }
    });
  });
}

function makeProbeArgs(args) {
  const probeArgs = [
    "--host", args.host,
    "--port", String(args.port),
    "--timeoutMs", String(args.timeoutMs),
    "--width", String(args.width),
    "--height", String(args.height),
    "--fps", String(args.fps),
    "--bandwidthKbps", String(args.bandwidthKbps),
    "--durationMs", String(args.videoDurationMs),
    "--minVideoFrames", String(args.minVideoFrames),
    "--minVideoFps", String(args.minVideoFps),
    "--maxVideoGapMs", String(args.maxVideoGapMs),
  ];
  if (args.requirePassword) {
    probeArgs.push("--requirePassword");
  }

  if (!args.allowMockVideo) {
    probeArgs.push("--requireH264", "--expectInputMode", "log");
  }
  if (!args.skipAudio) {
    probeArgs.push(
      "--requireAudio",
      "--observeAudioMs", String(args.audioDurationMs),
      "--minAudioFrames", String(args.minAudioFrames),
      "--minAudioFps", String(args.minAudioFps),
      "--maxAudioGapMs", String(args.maxAudioGapMs),
    );
  }
  if (!args.skipClipboard) {
    probeArgs.push("--clipboardText");
    if (!args.skipFileClipboard) {
      probeArgs.push("--clipboardFile", "--clipboardFileBytes", "128");
    }
  }
  if (!args.skipInputLog) {
    probeArgs.push("--inputEvents");
  }
  return probeArgs;
}

function makeBrowserArgs(args) {
  const browserArgs = [
    "--host", args.host,
    "--port", String(args.port),
    "--clientPort", String(args.clientPort),
    "--debugPort", String(args.debugPort),
    "--timeoutMs", String(Math.max(args.timeoutMs, 45000)),
  ];
  if (args.requirePassword) {
    browserArgs.push("--requirePassword");
  }
  if (!args.allowMockVideo) {
    browserArgs.push("--requireH264");
  }
  return browserArgs;
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }

  const args = parseArgs(process.argv);
  await preparePassword(args);
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  const childEnv = {
    ...process.env,
    LAN_DUAL_PASSWORD: args.password,
  };

  print("INFO", `Target: ${args.host}:${args.port}`);
  print("INFO", "Password will be passed to child probes through LAN_DUAL_PASSWORD, not command arguments.");
  print("INFO", args.allowMockVideo ? "Video mode: mock/dev allowed." : "Video mode: requiring real H.264 Mac host.");
  print("INFO", args.skipInputLog ? "Input-log probe skipped." : "Input-log probe enabled; inject is not used.");

  if (!args.skipProbe) {
    await runNode("scripts/windows/probe-mac-host.mjs", makeProbeArgs(args), { env: childEnv, cwd: repoRoot });
  }
  if (!args.skipBrowser) {
    await runNode("scripts/windows/test-windows-client-browser.mjs", makeBrowserArgs(args), { env: childEnv, cwd: repoRoot });
  }

  print("OK", "Formal Mac E2E checks finished.");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
