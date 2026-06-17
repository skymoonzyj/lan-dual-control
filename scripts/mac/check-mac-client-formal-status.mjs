#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  clientHost: "127.0.0.1",
  clientPort: 5188,
  windowsHost: "",
  windowsPort: 43770,
  timeoutMs: 5000,
  server: "http://192.168.31.68:17888",
  skipBoard: false,
  allowDirty: false,
  allowClientServerOffline: false,
  allowWindowsHostOffline: false,
  json: false,
  boardSummary: false,
  sendCall: false,
  forceCall: false,
};

const formalWindowsCallIdentity = {
  from: "Mac Codex",
  need: "Windows Codex",
  goal: "正式端到端验收 Windows host",
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/check-mac-client-formal-status.mjs [options]

Builds a read-only formal checklist before Mac controls a real Windows host.
It reuses check-mac-client-readiness, does not start Mac client or Windows host,
does not authenticate WebSocket, does not require or print a password, and does
not send input events.

Options:
  --clientHost <host>             Local Mac client web host. Default: ${defaults.clientHost}
  --clientPort <port>             Local Mac client web port. Default: ${defaults.clientPort}
  --host <host>                   Windows host discovery address.
  --windowsHost <host>            Same as --host.
  --port <port>                   Windows host discovery port. Default: ${defaults.windowsPort}
  --windowsPort <port>            Same as --port.
  --timeoutMs <ms>                Per probe timeout. Default: ${defaults.timeoutMs}
  --server <url>                  Agent Link Board URL. Default: ${defaults.server}
  --skipBoard                     Do not read Agent Link Board. Default checks it.
  --allowDirty                    Let dirty repo remain a warning.
  --allowClientServerOffline      Let local Mac client page offline remain a warning.
  --allowWindowsHostOffline       Let Windows host discovery offline remain a warning.
  --boardSummary                  Print a short secret-free Agent Link Board summary.
  --sendCall                      Send a Windows host formal test call to Agent Link Board only when ready.
  --forceCall                     Allow --sendCall to replace an existing board call.
  --json                          Print one machine-readable JSON object, including runPlan.
  --help, -h                      Show this help without probing anything.

JSON output:
  runPlan.manualChecklist
                                  Human true-test checklist for connection,
                                  video/audio, clipboard, input acknowledgments,
                                  and diagnostics export evidence.
  runPlan.commands.safePreflightWithEnsureClient
                                  Safe run-mac-client-formal-smoke --ensureClient
                                  command that starts/reuses the local Mac
                                  client page, then prints a board-ready
                                  preflight summary without authenticating.
  runPlan.commands.sendCallWithEnsureClient
                                  Safe run-mac-client-formal-smoke --ensureClient
                                  command that starts/reuses the local Mac
                                  client page, then sends a Windows formal
                                  test call only when the checklist is ready.
  runPlan.commands.macClientBrowserSelfTest
                                  Secret-free local browser self-test command.
                                  It uses a temporary mock Windows host and
                                  does not use a real host, password, call, or
                                  inject.
  runPlan.commands.windowsReverseGrantStatus
                                  Recommended Windows-side PowerShell loopback
                                  command that inspects the one-time reverse-
                                  control grant state.
  runPlan.commands.windowsOpenOneTimeReverseGrant
                                  Recommended Windows-side PowerShell loopback
                                  command that opens a short one-time reverse-
                                  control grant window.
  runPlan.commands.windowsReverseGrantStatusNodeFallback
                                  Node fallback for inspecting the grant state.
  runPlan.commands.windowsOpenOneTimeReverseGrantNodeFallback
                                  Node fallback for opening the grant window.
  runPlan.commands.reverseControlRehearsal
                                  Human-safe LAN008 -> one-time grant -> retry
                                  accepted rehearsal; no password, no input,
                                  and no inject are sent by this checklist.

Examples:
  node scripts/mac/check-mac-client-formal-status.mjs --host 192.168.31.50 --port 43770 --boardSummary
  node scripts/mac/check-mac-client-formal-status.mjs --host 192.168.31.50 --port 43770 --sendCall
  node scripts/mac/discover-windows-hosts.mjs --boardSummary
  node scripts/mac/check-mac-client-formal-status.mjs --json --skipBoard --allowWindowsHostOffline
`);
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
    if (
      token === "--skipBoard" ||
      token === "--allowDirty" ||
      token === "--allowClientServerOffline" ||
      token === "--allowWindowsHostOffline" ||
      token === "--boardSummary" ||
      token === "--sendCall" ||
      token === "--forceCall" ||
      token === "--json"
    ) {
      args[token.slice(2)] = true;
      continue;
    }
    if (token === "--clientHost" && next && !next.startsWith("--")) {
      args.clientHost = next;
      index += 1;
      continue;
    }
    if (token === "--clientPort" && next && !next.startsWith("--")) {
      args.clientPort = clampInteger(next, 1, 65535, defaults.clientPort);
      index += 1;
      continue;
    }
    if ((token === "--host" || token === "--windowsHost") && next && !next.startsWith("--")) {
      args.windowsHost = next;
      index += 1;
      continue;
    }
    if ((token === "--port" || token === "--windowsPort") && next && !next.startsWith("--")) {
      args.windowsPort = clampInteger(next, 1, 65535, defaults.windowsPort);
      index += 1;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampInteger(next, 1000, 60000, defaults.timeoutMs);
      index += 1;
      continue;
    }
    if (token === "--server" && next && !next.startsWith("--")) {
      args.server = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  args.clientHost = String(args.clientHost || defaults.clientHost).trim();
  args.windowsHost = String(args.windowsHost || "").trim();
  args.server = String(args.server || defaults.server).trim();
  return args;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function statusValue(value) {
  if (value === true) return "on";
  if (value === false) return "off";
  return "unknown";
}

function runReadiness(args) {
  const readinessArgs = [
    "scripts/mac/check-mac-client-readiness.mjs",
    "--json",
    "--clientHost",
    args.clientHost,
    "--clientPort",
    String(args.clientPort),
    "--probeClientServer",
    "--timeoutMs",
    String(args.timeoutMs),
  ];
  if (args.windowsHost) {
    readinessArgs.push("--host", args.windowsHost, "--port", String(args.windowsPort));
  }
  if (!args.skipBoard) {
    readinessArgs.push("--server", args.server, "--checkBoard");
  }
  const result = spawnSync(process.execPath, readinessArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(args.timeoutMs + 3000, 6000),
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
    },
  });
  const stdout = String(result.stdout || "").trim();
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`check-mac-client-readiness did not print valid JSON: ${error.message}\n${stdout}\n${result.stderr || ""}`);
  }
}

function item(id, status, summary, detail = "", next = "") {
  return { id, status, summary, detail, next };
}

function okItem(id, summary, detail = "") {
  return item(id, "ok", summary, detail);
}

function warnItem(id, summary, detail = "", next = "") {
  return item(id, "warning", summary, detail, next);
}

function blockItem(id, summary, detail = "", next = "") {
  return item(id, "blocker", summary, detail, next);
}

function skipItem(id, summary, detail = "", next = "") {
  return item(id, "skip", summary, detail, next);
}

function screenSummary(screen = {}) {
  const parts = [];
  if (screen.mode) parts.push(`mode=${screen.mode}`);
  if (screen.capturePipeline) parts.push(`pipeline=${screen.capturePipeline}`);
  if (screen.codec) parts.push(`codec=${screen.codec}`);
  if (screen.h264Encoder) parts.push(`h264Encoder=${screen.h264Encoder}`);
  if (Array.isArray(screen.videoTransports) && screen.videoTransports.length > 0) {
    parts.push(`transports=${screen.videoTransports.join("/")}`);
  }
  return parts.length > 0 ? parts.join(" ") : "screen capability present";
}

function audioSummary(audio = {}) {
  const parts = [];
  if (audio.mode || audio.audioMode) parts.push(`mode=${audio.mode || audio.audioMode}`);
  if (audio.codec) parts.push(`codec=${audio.codec}`);
  if (audio.active !== undefined) parts.push(`active=${statusValue(audio.active)}`);
  return parts.length > 0 ? parts.join(" ") : "audio capability present";
}

function buildChecklist(readiness, args) {
  const checklist = [];
  const git = readiness.git || {};
  const client = readiness.client || {};
  const clientServer = readiness.clientServer || {};
  const board = readiness.board || {};
  const windowsHost = readiness.windowsHost || {};
  const capabilities = windowsHost.capabilities || {};
  const screen = capabilities.screen || {};
  const audio = capabilities.audio || {};
  const input = capabilities.input || {};
  const clipboard = capabilities.clipboard || {};

  if (git.clean) {
    checklist.push(okItem("repo", `repo clean at ${readiness.currentBuildId || "unknown"}`));
  } else if (args.allowDirty) {
    checklist.push(warnItem("repo", `${Array.isArray(git.changes) ? git.changes.length : 0} local change(s) allowed`, "", "Commit or stash before pushing or asking Windows to rely on this exact result."));
  } else {
    checklist.push(blockItem("repo", `${Array.isArray(git.changes) ? git.changes.length : 0} local change(s) present`, Array.isArray(git.changes) ? git.changes.join("; ") : "", "Commit/stash or rerun with --allowDirty only for local diagnostics."));
  }

  if (client.ok) {
    checklist.push(okItem("client-files", "Mac client static files and JS syntax checks pass"));
  } else {
    checklist.push(blockItem("client-files", "Mac client static/syntax check failed", "", "Fix Mac client files before formal browser validation."));
  }

  if (clientServer.online && clientServer.titleFound) {
    checklist.push(okItem("client-server", `Mac client page online at ${clientServer.url}`));
  } else if (args.allowClientServerOffline) {
    checklist.push(warnItem("client-server", `Mac client page offline/unverified at ${clientServer.url || `${args.clientHost}:${args.clientPort}`}`, clientServer.error?.message || "", `Start or reuse it with ${makeStartClientCommand(args)}, or let the smoke wrapper do it with ${makeEnsureClientSmokeCommand(args)}.`));
  } else {
    checklist.push(blockItem("client-server", `Mac client page offline/unverified at ${clientServer.url || `${args.clientHost}:${args.clientPort}`}`, clientServer.error?.message || "", `Start or reuse it with ${makeStartClientCommand(args)}, or let the smoke wrapper do it with ${makeEnsureClientSmokeCommand(args)}.`));
  }

  if (args.skipBoard) {
    checklist.push(warnItem("board", "Agent Link Board not checked", "", "Run without --skipBoard before coordinating with Windows Codex."));
  } else if (board.checked && board.ok) {
    checklist.push(okItem("board", "Agent Link Board readable"));
  } else {
    checklist.push(blockItem("board", "Agent Link Board not readable", board.error || "", "Open/check the board before asking Windows to coordinate true testing."));
  }

  if (!windowsHost.checked) {
    checklist.push(args.allowWindowsHostOffline
      ? warnItem("windows-host", "Windows host discovery not checked", "", "Run node scripts/mac/discover-windows-hosts.mjs --boardSummary, or ask Windows Codex for the Windows host IP, then rerun with --host <Windows IP> --port 43770.")
      : blockItem("windows-host", "Windows host discovery not checked", "", "Run node scripts/mac/discover-windows-hosts.mjs --boardSummary, or ask Windows Codex for the Windows host IP, then rerun with --host <Windows IP> --port 43770."));
  } else if (!windowsHost.online) {
    checklist.push(args.allowWindowsHostOffline
      ? warnItem("windows-host", `Windows host offline at ${windowsHost.probe?.host}:${windowsHost.probe?.port}`, windowsHost.error?.message || "", "Run node scripts/mac/discover-windows-hosts.mjs --boardSummary, or ask Windows Codex to start Windows host and share IP/port, then rerun.")
      : blockItem("windows-host", `Windows host offline at ${windowsHost.probe?.host}:${windowsHost.probe?.port}`, windowsHost.error?.message || "", "Run node scripts/mac/discover-windows-hosts.mjs --boardSummary, or ask Windows Codex to start Windows host and share IP/port, then rerun."));
  } else {
    const runtime = windowsHost.runtime?.buildId ? ` build=${windowsHost.runtime.buildId}` : "";
    checklist.push(okItem("windows-host", `${windowsHost.device?.name || "Windows host"} online at ${windowsHost.probe?.host}:${windowsHost.probe?.port}${runtime}`));
  }

  if (windowsHost.online) {
    const videoTransports = Array.isArray(capabilities.videoTransports)
      ? capabilities.videoTransports
      : Array.isArray(screen.videoTransports)
        ? screen.videoTransports
        : [];
    checklist.push(okItem("screen", screenSummary(screen)));
    if (videoTransports.includes("binary-h264") || screen.codec === "h264") {
      checklist.push(okItem("h264", `H.264 path visible; transports=${videoTransports.join("/") || "unknown"}`));
    } else {
      checklist.push(warnItem("h264", `H.264 transport not obvious; codec=${screen.codec || "unknown"} transports=${videoTransports.join("/") || "none"}`, "", "Formal visual test may still use JPEG fallback, but H.264 comparison needs Windows host support."));
    }
    checklist.push(okItem("audio", audioSummary(audio)));
    checklist.push(okItem("input-log", `input=${statusValue(input.enabled ?? input.active)} mode=${input.mode || "unknown"}`));
    checklist.push(okItem("clipboard", `text=${statusValue(clipboard.text)} file=${statusValue(clipboard.file)}`));
  } else {
    checklist.push(skipItem("screen", "waiting for Windows host discovery"));
    checklist.push(skipItem("h264", "waiting for Windows host discovery"));
    checklist.push(skipItem("audio", "waiting for Windows host discovery"));
    checklist.push(skipItem("input-log", "waiting for Windows host discovery"));
    checklist.push(skipItem("clipboard", "waiting for Windows host discovery"));
  }

  checklist.push(okItem("password", "no password collected by this checklist"));
  checklist.push(skipItem("inject", "explicitly skipped", "", "Do not run real input injection unless the user explicitly confirms they are watching."));
  return checklist;
}

function countChecklist(checklist, status) {
  return checklist.filter((entry) => entry.status === status).length;
}

function makeCallText(report) {
  const host = report.readiness.windowsHost || {};
  if (!host.online) {
    return "Mac client formal Windows test is not ready: Windows host discovery is offline or not checked. Run node scripts/mac/discover-windows-hosts.mjs --boardSummary, or ask Windows Codex to start Windows host, then rerun with --host <Windows IP> --port 43770 --boardSummary.";
  }
  const address = `${host.probe?.host}:${host.probe?.port}`;
  return [
    `Mac client formal Windows test ${report.readyToCall ? "ready" : "needs attention"}: windowsHost=${address}, runtimeBuild=${host.runtime?.buildId || "unknown"}.`,
    `Screen ${screenSummary(host.capabilities?.screen || {})}; audio ${audioSummary(host.capabilities?.audio || {})}; inputMode=${host.capabilities?.input?.mode || "unknown"}; clipboard text=${statusValue(host.capabilities?.clipboard?.text)} file=${statusValue(host.capabilities?.clipboard?.file)}.`,
    `Checklist blockers=${report.counts.blocker}, warnings=${report.counts.warning}.`,
    `Suggested browser test: ${host.recommendedCommand || `node scripts/mac/run-mac-client-formal-smoke.mjs --host ${address.split(":")[0]} --port ${address.split(":")[1]} --promptPassword`}.`,
    "Do not send passwords on Agent Link Board; no inject unless the user explicitly confirms they are watching.",
  ].join(" ");
}

function makeChecklistCommand(args) {
  const parts = [
    "node scripts/mac/check-mac-client-formal-status.mjs",
    "--host",
    args.windowsHost || "<Windows IP>",
    "--port",
    String(args.windowsPort || defaults.windowsPort),
    "--boardSummary",
  ];
  return parts.join(" ");
}

function makeStartClientCommand(args) {
  const parts = [
    "node scripts/mac/start-mac-client.mjs",
    "--allowExisting",
  ];
  if (args.clientHost !== defaults.clientHost) parts.push("--host", args.clientHost);
  if (args.clientPort !== defaults.clientPort) parts.push("--port", String(args.clientPort));
  return parts.join(" ");
}

function makeClientStatusCommand(args) {
  const parts = [
    "node scripts/mac/start-mac-client.mjs",
    "--status",
    "--boardSummary",
  ];
  if (args.clientHost !== defaults.clientHost) parts.push("--host", args.clientHost);
  if (args.clientPort !== defaults.clientPort) parts.push("--port", String(args.clientPort));
  return parts.join(" ");
}

function makeBrowserTestCommand(report, args) {
  const host = report.readiness.windowsHost || {};
  const targetHost = host.probe?.host || args.windowsHost || "<Windows IP>";
  const targetPort = host.probe?.port || args.windowsPort || defaults.windowsPort;
  return [
    "node scripts/mac/run-mac-client-formal-smoke.mjs",
    "--host",
    targetHost,
    "--port",
    String(targetPort),
    "--ensureClient",
    "--promptPassword",
  ].join(" ");
}

function makeMacClientBrowserSelfTestCommand() {
  return "node scripts/mac/test-mac-client-browser-self-test.mjs --boardSummary";
}

function makeWindowsReverseGrantPowerShellCommand(report, args, action = "grant") {
  const host = report.readiness.windowsHost || {};
  const targetPort = host.probe?.port || args.windowsPort || defaults.windowsPort;
  const parts = [
    "pwsh -NoProfile -ExecutionPolicy Bypass",
    "-File",
    "scripts/windows/allow-windows-reverse-control.ps1",
    "-HostName",
    "127.0.0.1",
    "-Port",
    String(targetPort),
  ];
  if (action === "status") {
    parts.push("-Status");
  } else if (action === "revoke") {
    parts.push("-Revoke");
  } else {
    parts.push("-Grant", "-DurationMs", "30000");
  }
  parts.push("-BoardSummary");
  return parts.join(" ");
}

function makeWindowsReverseGrantNodeFallbackCommand(report, args, action = "grant") {
  const host = report.readiness.windowsHost || {};
  const targetPort = host.probe?.port || args.windowsPort || defaults.windowsPort;
  const parts = [
    "node scripts/windows/allow-windows-reverse-control.mjs",
    "--host",
    "127.0.0.1",
    "--port",
    String(targetPort),
  ];
  if (action === "status") {
    parts.push("--status");
  } else if (action === "revoke") {
    parts.push("--revoke");
  } else {
    parts.push("--grant", "--durationMs", "30000");
  }
  parts.push("--boardSummary");
  return parts.join(" ");
}

function makeWindowsReverseGrantCommand(report, args, action = "grant") {
  return makeWindowsReverseGrantPowerShellCommand(report, args, action);
}

function makeReverseControlRehearsalText(report, args) {
  const grantCommand = makeWindowsReverseGrantCommand(report, args, "grant");
  const nodeFallbackCommand = makeWindowsReverseGrantNodeFallbackCommand(report, args, "grant");
  return [
    "Mac authenticates in the Mac client page, clicks 请求反控, and expects LAN008/default deny first.",
    `Windows Codex runs the recommended PowerShell command on the Windows host machine: ${grantCommand}.`,
    `Node fallback if PowerShell is unavailable: ${nodeFallbackCommand}.`,
    "Mac clicks 重试反控 and expects accepted plus 临时授权已使用.",
    "No password goes on Agent Link Board, no input_event is sent by this request, and inject stays off.",
  ].join(" ");
}

function makeManualChecklist(report, args) {
  const host = report.readiness.windowsHost || {};
  const clientServer = report.readiness.clientServer || {};
  const targetHost = host.probe?.host || args.windowsHost || "<Windows IP>";
  const targetPort = host.probe?.port || args.windowsPort || defaults.windowsPort;
  const clientUrl = clientServer.url || `http://${args.clientHost}:${args.clientPort}/`;
  return [
    {
      id: "connection",
      title: "Connect and authenticate from Mac client to Windows host",
      evidence: `Mac client page ${clientUrl} shows connected/authenticated to ${targetHost}:${targetPort}; Windows host runtime/build is visible.`,
      pass: "Connected state is stable and no password is copied to Agent Link Board.",
    },
    {
      id: "video",
      title: "Verify visible Windows desktop video and frame freshness",
      evidence: "Mac client shows Windows desktop, first frame time, observed FPS, video frame age or clock-skew warning, and H.264/JPEG fallback state.",
      pass: "Video is visible, keeps updating, and any fallback or repeated-frame warning is understandable.",
    },
    {
      id: "audio",
      title: "Verify Windows system audio payload and playback",
      evidence: "Mac client audio status shows payload/playback counters plus audio frame age or clock-skew warning.",
      pass: "Audio frame count and playback count increase during the test, or silence is explained clearly.",
    },
    {
      id: "clipboard",
      title: "Verify text and file clipboard paths",
      evidence: "Text clipboard ack is visible; file transfer/send status is visible; Windows side can retry or explain failure.",
      pass: "Text copy works, file path gives a clear success/failure/retry state, and no secret text is included.",
    },
    {
      id: "input-ack",
      title: "Verify safe input acknowledgments only",
      evidence: "Mac client event log shows input acknowledgments in Windows host log mode; no real system injection is requested by this checklist.",
      pass: "Mouse/key events receive acknowledgments, and the UI still indicates log/safe mode unless user explicitly chose real control.",
    },
    {
      id: "diagnostics",
      title: "Copy diagnostics and summarize issues",
      evidence: "Mac client event log Copy Diagnostics output is pasted after checking it does not include the connection password.",
      pass: "Diagnostics include connection, media, clipboard, input acknowledgment, reverse-control state, and recent errors.",
    },
  ];
}

function makeEnsureClientSmokeCommand(args, extra = []) {
  const parts = [
    "node scripts/mac/run-mac-client-formal-smoke.mjs",
  ];
  if (args.windowsHost) {
    parts.push("--host", args.windowsHost, "--port", String(args.windowsPort || defaults.windowsPort));
  } else {
    parts.push("--discover");
  }
  parts.push("--ensureClient", ...extra);
  if (args.clientHost !== defaults.clientHost) parts.push("--clientHost", args.clientHost);
  if (args.clientPort !== defaults.clientPort) parts.push("--clientPort", String(args.clientPort));
  if (args.server !== defaults.server) parts.push("--server", args.server);
  return parts.join(" ");
}

function makeCallPayload(report, args) {
  const host = report.readiness.windowsHost || {};
  const targetHost = host.probe?.host || args.windowsHost || "<Windows IP>";
  const targetPort = host.probe?.port || args.windowsPort || defaults.windowsPort;
  const address = `${targetHost}:${targetPort}`;
  const browserSmoke = makeBrowserTestCommand(report, args);
  const windowsStatusCommand = "node scripts/windows/start-windows-host.mjs --status --json";
  const reverseRehearsal = makeReverseControlRehearsalText(report, args);
  return {
    status: "CALLING",
    from: formalWindowsCallIdentity.from,
    need: formalWindowsCallIdentity.need,
    goal: formalWindowsCallIdentity.goal,
    environment: `Windows host ${address}; runtimeBuild=${host.runtime?.buildId || "unknown"}; inputMode=${host.capabilities?.input?.mode || "unknown"}`,
    connection: address,
    command: windowsStatusCommand,
    expected: `Windows 端确认 Windows host 在线且保持 ${address} 可连；Mac 端随后运行 ${browserSmoke}，在本机隐藏输入正式密码后验证首帧/H.264 或 JPEG fallback、帧延迟、系统音频播放、文本/文件剪贴板和 input-log ack；反控请求安全演练按 ${reverseRehearsal}；不要执行 inject。`,
    ask: `请确认 Windows host 保持在线并观察 Windows 屏幕/日志；Mac 端下一步 smoke 命令：${browserSmoke}。如需验收反控请求闭环，请优先按 Windows 本机回环 PowerShell 授权命令配合：${makeWindowsReverseGrantCommand(report, args, "grant")}；Node 备用：${makeWindowsReverseGrantNodeFallbackCommand(report, args, "grant")}。密码不要发在联络板，inject 只有用户另行明确确认后才可执行。`,
    owner: "Mac Codex",
    timeout: "用户在场时执行",
  };
}

function makeRunPlan(report, args) {
  const host = report.readiness.windowsHost || {};
  const clientServer = report.readiness.clientServer || {};
  const targetHost = host.probe?.host || args.windowsHost || "";
  const targetPort = host.probe?.port || args.windowsPort || defaults.windowsPort;
  const targetAddress = targetHost ? `${targetHost}:${targetPort}` : `<Windows IP>:${targetPort}`;
  const browserTestCommand = makeBrowserTestCommand(report, args);
  return {
    name: "Mac controls Windows formal run plan",
    profile: "mac-client-windows-formal",
    target: {
      host: targetHost,
      port: targetPort,
      address: targetAddress,
      online: Boolean(host.online),
      runtimeBuild: host.runtime?.buildId || "",
      inputMode: host.capabilities?.input?.mode || "",
    },
    localClient: {
      url: clientServer.url || `http://${args.clientHost}:${args.clientPort}/`,
      online: Boolean(clientServer.online),
    },
    estimatedDuration: {
      preflight: "under 1 minute",
      browserSmoke: "2-5 minutes",
      optionalVideoSoak: "5-10 minutes when both sides are watching",
    },
    safety: {
      readOnlyPreflight: true,
      startsMacClient: false,
      startsWindowsHost: false,
      authenticatesWebSocket: false,
      passwordRequestedByThisScript: false,
      passwordInCommandArguments: false,
      passwordOnAgentLinkBoard: false,
      inject: false,
      reverseControlRequestSendsInput: false,
      windowsReverseGrantLoopbackOnly: true,
      requiresExplicitUserConfirmationForInject: true,
    },
    commands: {
      discoverWindowsHost: "node scripts/mac/discover-windows-hosts.mjs --boardSummary",
      ensureMacClient: makeStartClientCommand(args),
      checkMacClient: makeClientStatusCommand(args),
      safePreflightWithEnsureClient: makeEnsureClientSmokeCommand(args, ["--preflightOnly", "--boardSummary"]),
      sendCallWithEnsureClient: makeEnsureClientSmokeCommand(args, ["--preflightOnly", "--sendCall"]),
      rerunFormalChecklist: makeChecklistCommand(args),
      macClientBrowserSelfTest: makeMacClientBrowserSelfTestCommand(),
      browserSmoke: browserTestCommand,
      windowsReverseGrantStatus: makeWindowsReverseGrantCommand(report, args, "status"),
      windowsOpenOneTimeReverseGrant: makeWindowsReverseGrantCommand(report, args, "grant"),
      windowsReverseGrantStatusPowerShell: makeWindowsReverseGrantPowerShellCommand(report, args, "status"),
      windowsOpenOneTimeReverseGrantPowerShell: makeWindowsReverseGrantPowerShellCommand(report, args, "grant"),
      windowsReverseGrantStatusNodeFallback: makeWindowsReverseGrantNodeFallbackCommand(report, args, "status"),
      windowsOpenOneTimeReverseGrantNodeFallback: makeWindowsReverseGrantNodeFallbackCommand(report, args, "grant"),
      reverseControlRehearsal: makeReverseControlRehearsalText(report, args),
    },
    steps: [
      {
        id: "local-client",
        title: "Confirm the Mac client page is online",
        command: makeClientStatusCommand(args),
        success: "Mac client page is reachable and serving apps/mac-client.",
      },
      {
        id: "discover-windows-host",
        title: "Find or confirm the Windows host /discovery endpoint",
        command: targetHost ? makeChecklistCommand(args) : "node scripts/mac/discover-windows-hosts.mjs --boardSummary",
        success: "Windows host discovery is online and reports runtime/capabilities.",
      },
      {
        id: "formal-checklist",
        title: "Run the read-only formal checklist",
        command: makeChecklistCommand(args),
        success: "Repo, board, local page, Windows discovery, H.264/audio/input-log/clipboard readiness are visible.",
      },
      {
        id: "local-browser-self-test",
        title: "Run the local mock browser self-test before true host auth",
        command: makeMacClientBrowserSelfTestCommand(),
        success: "Temporary mock Windows host validates Mac client page flow, reverse-control LAN008 -> grant -> accepted, clipboard, and input-log without a real host.",
      },
      {
        id: "browser-smoke",
        title: "Run the true Mac client browser smoke against Windows host",
        command: browserTestCommand,
        success: "First frame, H.264/JPEG fallback, frame age, audio payload/playback, clipboard and input-log ack are checked.",
      },
      {
        id: "reverse-control-request",
        title: "Exercise the guarded reverse-control request loop",
        command: makeWindowsReverseGrantCommand(report, args, "grant"),
        success: "Mac first sees LAN008/default deny, Windows opens a one-time local grant, Mac retries, and the page shows accepted plus 临时授权已使用.",
      },
      {
        id: "observe-and-compare",
        title: "Compare user-visible quality and resource impact",
        command: "",
        success: "Record first frame time, observed FPS, frame age, audio delay, bandwidth/CPU/memory, and any reconnect issues.",
      },
    ],
    manualChecklist: makeManualChecklist(report, args),
    notes: [
      "Do not send passwords, tokens, or system account details on Agent Link Board.",
      "Only enter the Windows host password in the Mac client UI or run-mac-client-formal-smoke --promptPassword when intentionally running auth.",
      "The Windows reverse grant helper must run on the Windows host machine against loopback; Mac should not call the grant endpoint directly.",
      "Use the PowerShell grant command first; keep the Node command as a fallback for environments without PowerShell 7.",
      "Do not run real input injection unless the user explicitly confirms they are watching.",
    ],
  };
}

function makeBoardSummary(report) {
  const host = report.readiness.windowsHost || {};
  const repo = report.readiness.git?.clean ? "clean" : `dirty(${report.readiness.git?.changes?.length || 0})`;
  const client = report.readiness.client?.ok ? "ok" : "blocked";
  const localServer = report.readiness.clientServer?.online ? "online" : "offline";
  const hostText = host.online
    ? `online ${host.probe?.host}:${host.probe?.port} build=${host.runtime?.buildId || "unknown"}`
    : host.checked
      ? `offline ${host.probe?.host}:${host.probe?.port}`
      : "not-checked";
  return [
    `Mac client formal Windows test: ${report.readyToCall ? "ready" : `needs attention (${report.counts.blocker} blocker(s), ${report.counts.warning} warning(s))`}; repo=${repo}; client=${client}; localServer=${localServer}; windowsHost=${hostText}.`,
    report.readyToCall
      ? `Next: run Mac client true test against ${host.probe?.host}:${host.probe?.port}; compare first frame, FPS, frame age, audio playback, clipboard, input-log, bandwidth/CPU.`
      : "Next: clear blockers, run node scripts/mac/start-mac-client.mjs, discover/start Windows host, then rerun with --host <Windows IP> --port 43770 --boardSummary.",
    "ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics.",
    `MacClientBrowserSelfTest=${report.runPlan?.commands?.macClientBrowserSelfTest || makeMacClientBrowserSelfTestCommand()}.`,
    `Reverse rehearsal: click 请求反控 -> expect LAN008; Windows local grant PowerShell: ${makeWindowsReverseGrantCommand(report, { windowsPort: host.probe?.port || report.args?.windowsPort || defaults.windowsPort }, "grant")}; Node fallback: ${makeWindowsReverseGrantNodeFallbackCommand(report, { windowsPort: host.probe?.port || report.args?.windowsPort || defaults.windowsPort }, "grant")}; Mac retry -> accepted/临时授权已使用.`,
    "RunPlan: local client -> Windows discovery -> formal checklist -> local browser self-test -> browser smoke -> reverse request rehearsal -> observe quality/resources.",
    "Do not send passwords on Agent Link Board; do not run inject unless the user explicitly confirms they are watching.",
  ].join(" ");
}

function formatGateItem(entry) {
  const summary = normalizedText(entry.summary);
  const detail = normalizedText(entry.detail);
  const next = normalizedText(entry.next);
  const parts = [`${entry.id}: ${summary || entry.status}`];
  if (detail) parts.push(detail);
  if (next) parts.push(`Next: ${next}`);
  return parts.join("; ");
}

function formatSendCallRefusal(report) {
  const blockers = report.checklist.filter((entry) => entry.status === "blocker");
  const warnings = report.checklist.filter((entry) => entry.status === "warning");
  const blockerText = blockers.length > 0
    ? blockers.slice(0, 5).map(formatGateItem).join(" | ")
    : "none";
  const warningText = warnings.length > 0
    ? ` Warnings: ${warnings.slice(0, 3).map(formatGateItem).join(" | ")}.`
    : "";
  return [
    `Refusing to send Windows host formal call because checklist is not ready: blockers=${report.counts.blocker}, warnings=${report.counts.warning}.`,
    `Blockers: ${blockerText}.`,
    warningText,
  ].join(" ").replace(/\s+/g, " ").trim();
}

function isActiveBoardCall(call) {
  if (!call) return false;
  const status = normalizedText(call.status).toLowerCase();
  if (!status) return true;
  return !["done", "completed", "complete", "cancelled", "canceled", "resolved", "closed"].includes(status);
}

function normalizeCurrentBoardCall(call) {
  if (!call || typeof call !== "object") {
    return {
      active: false,
      raw: "",
    };
  }
  const currentCall = {
    active: isActiveBoardCall(call),
    raw: JSON.stringify(call),
  };
  for (const key of ["status", "goal", "from", "need", "environment", "connection", "command", "expected", "actual", "ask", "blockedBy", "owner", "timeout", "updatedAt"]) {
    const value = normalizedText(call[key]);
    if (value) currentCall[key] = value;
  }
  return currentCall;
}

function getCurrentBoardCall(args) {
  const stateReader = `
const server = process.argv[1];
const timeoutMs = Number(process.argv[2] || 5000);
const token = process.env.CODEX_LINK_TOKEN || "";
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
try {
  const response = await fetch(new URL("/api/state", server), {
    cache: "no-store",
    signal: controller.signal,
    headers: token ? { "X-Codex-Link-Token": token } : {},
  });
  const text = await response.text();
  if (!response.ok) throw new Error(response.status + ": " + text);
  console.log(text || "{}");
} finally {
  clearTimeout(timer);
}
`;
  const result = spawnSync(process.execPath, [
    "-e",
    stateReader,
    args.server,
    String(Math.max(args.timeoutMs + 3000, 6000)),
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(args.timeoutMs + 3000, 6000),
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Could not confirm Agent Link Board current call before sending: ${String(result.stderr || result.stdout || "").trim()}`);
  }
  try {
    const state = JSON.parse(String(result.stdout || "{}"));
    return normalizeCurrentBoardCall(state.currentCall);
  } catch (error) {
    throw new Error(`Could not parse Agent Link Board state before sending: ${error.message}`);
  }
}

function sendCall(report, args) {
  if (!report.readyToCall) {
    throw new Error(formatSendCallRefusal(report));
  }
  const currentCall = getCurrentBoardCall(args);
  report.boardCallBeforeSend = currentCall;
  if (currentCall.active && !args.forceCall) {
    const owner = currentCall.from || currentCall.need || currentCall.owner || "unknown";
    const goal = currentCall.goal || currentCall.raw || "unknown goal";
    throw new Error(`Refusing to replace existing Agent Link Board call from ${owner}: ${goal}. Clear it or rerun with --forceCall only after coordinating on the board.`);
  }
  const payload = report.callPayload || makeCallPayload(report, args);
  const commandArgs = [
    "scripts/codex-link-client.mjs",
    "--server",
    args.server,
    "call",
    "--status",
    payload.status,
    "--from",
    payload.from,
    "--need",
    payload.need,
    "--goal",
    payload.goal,
    "--environment",
    payload.environment,
    "--connection",
    payload.connection,
    "--command",
    payload.command,
    "--expected",
    payload.expected,
    "--ask",
    payload.ask,
    "--owner",
    payload.owner,
    "--timeout",
    payload.timeout,
  ];
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(args.timeoutMs + 3000, 6000),
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Could not send Agent Link Board call: ${String(result.stderr || result.stdout || "").trim()}`);
  }
  return String(result.stdout || "").trim();
}

function printRunPlan(runPlan) {
  console.log("Formal run plan");
  for (const step of runPlan.steps) {
    console.log(`- ${step.id}: ${step.title}`);
    if (step.command) console.log(`  Command: ${step.command}`);
    console.log(`  Success: ${step.success}`);
  }
  console.log(`- safety: passwordInCommandArguments=${runPlan.safety.passwordInCommandArguments}; inject=${runPlan.safety.inject}; passwordOnAgentLinkBoard=${runPlan.safety.passwordOnAgentLinkBoard}`);
  console.log("");
  console.log("Manual true-test checklist");
  for (const item of runPlan.manualChecklist || []) {
    console.log(`- ${item.id}: ${item.title}`);
    console.log(`  Evidence: ${item.evidence}`);
    console.log(`  Pass: ${item.pass}`);
  }
  console.log("");
}

function printHuman(report) {
  console.log("Mac client formal Windows checklist");
  console.log(`- readyToCall: ${report.readyToCall ? "yes" : "no"}`);
  console.log(`- result: ${report.ok ? "no blockers" : "blocked"} (${report.counts.blocker} blockers, ${report.counts.warning} warnings)`);
  console.log("");
  for (const entry of report.checklist) {
    const prefix = entry.status === "ok" ? "OK" : entry.status === "blocker" ? "BLOCK" : entry.status === "skip" ? "SKIP" : "WARN";
    console.log(`[${prefix}] ${entry.id}: ${entry.summary}`);
    if (entry.detail) console.log(`      ${entry.detail}`);
    if (entry.next) console.log(`      Next: ${entry.next}`);
  }
  console.log("");
  printRunPlan(report.runPlan);
  console.log(report.boardSummary);
}

function buildReport(args) {
  const readiness = runReadiness(args);
  const checklist = buildChecklist(readiness, args);
  const counts = {
    ok: countChecklist(checklist, "ok"),
    warning: countChecklist(checklist, "warning"),
    blocker: countChecklist(checklist, "blocker"),
    skip: countChecklist(checklist, "skip"),
  };
  const readyToCall = counts.blocker === 0 && !args.skipBoard && readiness.board?.ok === true && readiness.windowsHost?.online === true && readiness.clientServer?.online === true;
  const report = {
    ok: counts.blocker === 0,
    readyToCall,
    checkedAt: new Date().toISOString(),
    args: {
      clientHost: args.clientHost,
      clientPort: args.clientPort,
      windowsHost: args.windowsHost,
      windowsPort: args.windowsPort,
      skipBoard: args.skipBoard,
      allowDirty: args.allowDirty,
      allowClientServerOffline: args.allowClientServerOffline,
      allowWindowsHostOffline: args.allowWindowsHostOffline,
      sendCall: args.sendCall,
      forceCall: args.forceCall,
    },
    counts,
    checklist,
    readiness,
  };
  report.runPlan = makeRunPlan(report, args);
  report.callText = makeCallText(report);
  report.boardSummary = makeBoardSummary(report);
  report.callPayload = makeCallPayload(report, args);
  return report;
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  const report = buildReport(args);
  if (args.sendCall) {
    try {
      const sendResult = sendCall(report, args);
      report.sentCall = {
        ok: true,
        result: sendResult || "ok",
        payload: report.callPayload,
      };
    } catch (error) {
      report.ok = false;
      report.error = { message: error.message };
      if (!args.json) {
        throw error;
      }
    }
  }
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else if (args.sendCall) {
    console.log(`[OK] Sent Windows host formal call to Agent Link Board: ${report.callPayload.connection}`);
    console.log(report.callText);
  } else {
    printHuman(report);
  }
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((error) => {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ok: false, error: { message: error.message } }, null, 2));
  } else {
    console.error(`[FAIL] ${error.message}`);
  }
  process.exitCode = 1;
});
