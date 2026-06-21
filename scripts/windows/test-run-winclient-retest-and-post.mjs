#!/usr/bin/env node
import { spawn } from "node:child_process";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const script = "scripts/windows/run-winclient-retest-and-post.mjs";
const rootEntry = "Run-WinClientRetest-And-Post.cmd";

const defaults = {
  timeoutMs: 30000,
};

const macNalEvidence = "MacHostMedia=media=ok h264Key=3 sps=3 pps=3 idr=3 keyParam=3 h264Frames=300 h264Delta=297 firstKeyNal=7/8/5 firstNal=7/8/5 lastNal=1 lastKeyNal=7/8/5 keyGapFramesMax=60 keyGapMsMax=1000 keyGapFramesLast=58 keyGapMsLast=966 keyTailFrames=12 keyTailMs=200 firstKeyParam=yes lastKeyParam=yes keyParamMiss=0";
const retestLine = "W2W3Retest=video=H.264 surface=none h264=status=waiting-keyframe decoded=0 skippedDelta=68 needsKeyframe=yes queue=9 queueMs=900 staleDrops=68 reason=queue-overflow-wait-keyframe recv=68 key=1 sps=1 pps=1 idr=1 lastNal=1, audio=queue 120 ms";
const w8NativeLine = "W8NativeVideo=status=device-lost-rebuilt present=latest-frame-nv12-converted-presented presentFrames=188 decoded=188 output=NV12 surface=latest-frame-presented copy=latest-frame-presented handoff=latest-frame-ready swapchain=ready streamChange=yes deviceLost=yes errors=0";

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-run-winclient-retest-and-post.mjs [options]

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Description:
  Verifies the one-click Windows client real retest and board-post entry with
  a fake retest command and fake Agent Link Board. It does not connect to a
  real Mac, ask for passwords, or send control actions.
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
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(10000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(text, expected, label) {
  assert(String(text).includes(expected), `${label} did not include ${JSON.stringify(expected)}.\n${text}`);
}

function assertNotIncludes(text, expected, label) {
  assert(!String(text).includes(expected), `${label} unexpectedly included ${JSON.stringify(expected)}.\n${text}`);
}

function parseLastJsonLine(text, label) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  const candidate = lines.at(-1) || "";
  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new Error(`${label} did not end with JSON.\n${text}\n${error.message}`);
  }
}

function countTimeoutParameters(commandArgs) {
  return commandArgs.filter((token) => /^-{1,2}TimeoutMs$/i.test(token)).length;
}

function runNode(extraArgs, args, env = {}) {
  return runProcess(process.execPath, [script, ...extraArgs], args, env);
}

function runRootCmd(extraArgs, args, env = {}) {
  return runProcess("cmd.exe", ["/d", "/c", rootEntry, ...extraArgs], args, env);
}

function runProcess(command, commandArgs, args, env = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, commandArgs, {
      cwd: repoRoot,
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: "",
        CODEX_LINK_TOKEN: "",
        ...env,
      },
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

function fakeRetestCommand(scriptBody) {
  return JSON.stringify([process.execPath, "-e", scriptBody]);
}

function makeState(messages) {
  return {
    updatedAt: "2026-06-21T04:00:00.000Z",
    currentCall: {
      status: "CALLING",
      from: "Mac Codex",
      need: "Windows Codex",
      goal: "Run real WinClientRetest for W2/W3",
    },
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "ready",
        note: macNalEvidence,
        updatedAt: "2026-06-21T03:59:00.000Z",
      },
    },
    events: [
      {
        id: "mac-media",
        at: "2026-06-21T03:58:00.000Z",
        type: "message",
        from: "Mac Codex",
        text: macNalEvidence,
      },
      ...messages.map((message, index) => ({
        id: `posted-${index}`,
        at: `2026-06-21T03:59:${String(index).padStart(2, "0")}.000Z`,
        type: "message",
        from: message.from || "Windows Codex",
        text: message.text || "",
      })),
    ],
  };
}

async function withFakeBoard(callback) {
  const messages = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      if (request.method === "GET" && request.url === "/api/state") {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(makeState(messages)));
        return;
      }
      if (request.method === "POST" && request.url === "/api/message") {
        messages.push(JSON.parse(body || "{}"));
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true }));
        return;
      }
      response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: false, error: "not found" }));
    });
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  try {
    await callback({ url: `http://127.0.0.1:${address.port}`, messages });
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

function assertSecretSafe(text, label) {
  assertNotIncludes(text, "super-secret", label);
  assertNotIncludes(text, "--password", label);
  assertNotIncludes(text, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(text, "CODEX_LINK_TOKEN", label);
  assertNotIncludes(text, "input_event", label);
}

async function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = await runNode([flag], args);
    assert(result.exitCode === 0, `node help ${flag} failed\n${result.stdout}\n${result.stderr}`);
    assertIncludes(result.stdout, "Usage:", `node help ${flag}`);
    assertIncludes(result.stdout, "Run-WinClientRetest.cmd", `node help ${flag}`);
    assertIncludes(result.stdout, "--preflightOnly", `node help ${flag}`);
    assertIncludes(result.stdout, "post-w2w3-retest-board.mjs", `node help ${flag}`);
    assertSecretSafe(result.stdout + result.stderr, `node help ${flag}`);
  }

  if (process.platform === "win32") {
    const cmdHelp = await runRootCmd(["-Help"], args);
    assert(cmdHelp.exitCode === 0, `root cmd -Help failed\n${cmdHelp.stdout}\n${cmdHelp.stderr}`);
    assertIncludes(cmdHelp.stdout, "Run-WinClientRetest.cmd", "root cmd help");
    assertIncludes(cmdHelp.stdout, "--preflightOnly", "root cmd help");
    assertIncludes(cmdHelp.stdout, "post-w2w3-retest-board.mjs", "root cmd help");
    assertSecretSafe(cmdHelp.stdout + cmdHelp.stderr, "root cmd help");
  } else {
    console.log("[SKIP] Root cmd help requires Windows cmd.exe");
  }
  console.log("[OK] WinClient retest-and-post entry help is safe");
}

async function checkForwardedTimeoutDoesNotDuplicateDefault(args) {
  const result = await runNode(["--preflightOnly", "--printCommandJson", "--timeoutMs", "30000"], args);
  assert(result.exitCode === 0, `print preflight command should pass\n${result.stdout}\n${result.stderr}`);
  const command = parseLastJsonLine(result.stdout, "print preflight command");
  assert(Array.isArray(command.args), `printed command args should be an array\n${result.stdout}`);
  assert(countTimeoutParameters(command.args) === 1, `preflight command should contain exactly one TimeoutMs parameter\n${JSON.stringify(command.args)}`);
  assertIncludes(command.args.join(" "), "-OnlyH264LatencyQueueGuard", "preflight command args");
  assertNotIncludes(command.args.join(" "), "-TimeoutMs 45000", "preflight command args");
  const timeoutIndex = command.args.findIndex((token) => /^-{1,2}TimeoutMs$/i.test(token));
  assert(command.args[timeoutIndex + 1] === "30000", `preflight command should keep forwarded timeout value\n${JSON.stringify(command.args)}`);
  assertSecretSafe(result.stdout + result.stderr, "print preflight command");
  console.log("[OK] WinClient retest-and-post forwarded TimeoutMs does not duplicate the default");
}

async function checkPreflightOnlyDoesNotPostOrPrompt(args) {
  await withFakeBoard(async (board) => {
    const result = await runNode(["--preflightOnly", "--server", board.url], args, {
      LAN_DUAL_PASSWORD: "super-secret",
      LAN_DUAL_WINCLIENT_RETEST_COMMAND_JSON: fakeRetestCommand(`if (process.env.LAN_DUAL_PASSWORD) console.log("child saw LAN_DUAL_PASSWORD=" + process.env.LAN_DUAL_PASSWORD); console.log("Windows client diagnostics: passed; mode=diagnostics; target=192.168.31.122:43770; discovery=192.168.31.122:43770; checks=discovery,control-center. No password was printed or sent to Agent Link Board; no input/inject was performed.");`),
    });
    assert(result.exitCode === 0, `preflight should pass\n${result.stdout}\n${result.stderr}`);
    assert(board.messages.length === 0, `preflight should not post messages, got ${board.messages.length}`);
    assertIncludes(result.stdout, "WinClientRetestPreflight=ready", "preflight stdout");
    assertIncludes(result.stdout, "Run-WinClientRetest-And-Post.cmd", "preflight stdout");
    assertIncludes(result.stdout, "当前终端", "preflight stdout");
    assertIncludes(result.stdout, "不请求密码", "preflight stdout");
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.messages), "preflight");
    console.log("[OK] WinClient retest-and-post preflight is no-password and no-post");
  });
}

async function checkPreflightFailureSkipsPost(args) {
  await withFakeBoard(async (board) => {
    const result = await runNode(["--preflightOnly", "--server", board.url], args, {
      LAN_DUAL_WINCLIENT_RETEST_COMMAND_JSON: fakeRetestCommand(`console.error("offline target"); process.exit(9);`),
    });
    assert(result.exitCode === 9, `failed preflight should preserve child exit code\n${result.stdout}\n${result.stderr}`);
    assert(board.messages.length === 0, `failed preflight should not post messages, got ${board.messages.length}`);
    assertIncludes(result.stderr || result.stdout, "preflight failed", "failed preflight output");
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.messages), "failed preflight");
    console.log("[OK] WinClient retest-and-post preflight failure does not post");
  });
}
async function checkSuccessfulRetestPostsRetestAndDiagnosis(args) {
  await withFakeBoard(async (board) => {
    const result = await runNode(["--server", board.url], args, {
      LAN_DUAL_PASSWORD: "super-secret",
      LAN_DUAL_WINCLIENT_RETEST_COMMAND_JSON: fakeRetestCommand(`if (process.env.LAN_DUAL_PASSWORD) console.log("child saw LAN_DUAL_PASSWORD=" + process.env.LAN_DUAL_PASSWORD); console.log(${JSON.stringify(retestLine)}); console.log(${JSON.stringify(w8NativeLine)});`),
    });
    assert(result.exitCode === 0, `retest-and-post should pass\n${result.stdout}\n${result.stderr}`);
    assertIncludes(result.stdout, retestLine, "retest-and-post stdout");
    assertIncludes(result.stdout, w8NativeLine, "retest-and-post stdout");
    assertIncludes(result.stdout, "W2W3RetestPost=sent", "retest-and-post stdout");
    assert(board.messages.length === 3, `expected three board messages, got ${board.messages.length}: ${JSON.stringify(board.messages)}`);
    assertIncludes(board.messages[0].text, retestLine, "posted retest message");
    assertIncludes(board.messages[1].text, w8NativeLine, "posted W8 native video message");
    assertIncludes(board.messages[2].text, "W2H264BoardDiagnosis=status=blocked", "posted diagnosis message");
    assertIncludes(board.messages[2].text, "reason=windows-decode-path", "posted diagnosis message");
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.messages), "successful retest-and-post");
    console.log("[OK] WinClient retest-and-post sends retest and diagnosis after a successful run");
  });
}

async function checkRetestFailureDoesNotPost(args) {
  await withFakeBoard(async (board) => {
    const result = await runNode(["--server", board.url], args, {
      LAN_DUAL_WINCLIENT_RETEST_COMMAND_JSON: fakeRetestCommand(`console.log(${JSON.stringify(retestLine)}); process.exit(7);`),
    });
    assert(result.exitCode === 7, `failed retest should preserve child exit code\n${result.stdout}\n${result.stderr}`);
    assert(board.messages.length === 0, `failed retest should not post messages, got ${board.messages.length}`);
    assertIncludes(result.stderr || result.stdout, "retest failed", "failed retest output");
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.messages), "failed retest");
    console.log("[OK] WinClient retest-and-post skips board posting when retest fails");
  });
}

async function checkMissingRetestLineDoesNotPost(args) {
  await withFakeBoard(async (board) => {
    const result = await runNode(["--server", board.url], args, {
      LAN_DUAL_WINCLIENT_RETEST_COMMAND_JSON: fakeRetestCommand("console.log('no retest evidence here');"),
    });
    assert(result.exitCode !== 0, "missing W2W3Retest should fail");
    assert(board.messages.length === 0, `missing W2W3Retest should not post messages, got ${board.messages.length}`);
    assertIncludes(result.stderr || result.stdout, "W2W3Retest", "missing retest output");
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.messages), "missing retest");
    console.log("[OK] WinClient retest-and-post refuses to post without W2W3Retest evidence");
  });
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  await checkHelp(args);
  await checkForwardedTimeoutDoesNotDuplicateDefault(args);
  await checkPreflightOnlyDoesNotPostOrPrompt(args);
  await checkPreflightFailureSkipsPost(args);
  await checkSuccessfulRetestPostsRetestAndDiagnosis(args);
  await checkRetestFailureDoesNotPost(args);
  await checkMissingRetestLineDoesNotPost(args);
  console.log("[OK] WinClient retest-and-post regression passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
