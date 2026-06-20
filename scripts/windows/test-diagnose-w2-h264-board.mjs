#!/usr/bin/env node
import { spawn } from "node:child_process";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const script = "scripts/windows/diagnose-w2-h264-board.mjs";

const defaults = {
  timeoutMs: 30000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-diagnose-w2-h264-board.mjs [options]

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Description:
  Verifies the read-only W2 H.264 Agent Link Board diagnosis helper. The test
  uses a local fake board and never requests passwords, authenticates a host, or
  sends input/inject.
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

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${text}`);
  }
}

function run(extraArgs, args) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [script, ...extraArgs], {
      cwd: repoRoot,
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: "",
        CODEX_LINK_TOKEN: "",
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
      resolveRun({
        exitCode: null,
        timedOut: false,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({ exitCode, timedOut: false, stdout, stderr });
    });
  });
}

async function withFakeBoard(state, callback) {
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });
    if (request.method === "GET" && request.url === "/api/state") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(state));
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false, error: "not found" }));
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`, requests);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

function makeState({ windowsText, macText, extraText = "" }) {
  return {
    updatedAt: "2026-06-21T02:40:00.000Z",
    currentCall: null,
    userPresence: {
      status: "present",
      label: "用户在场",
      updatedAt: "2026-06-21T02:39:00.000Z",
      updatedBy: "Supervisor",
    },
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "online",
        note: macText,
        updatedAt: "2026-06-21T02:38:00.000Z",
      },
      "Windows Codex": {
        role: "Windows 端",
        status: "online",
        note: windowsText,
        updatedAt: "2026-06-21T02:39:30.000Z",
      },
    },
    events: [
      {
        id: "evt-1",
        at: "2026-06-21T02:37:00.000Z",
        type: "message",
        from: "Mac Codex",
        text: `${macText} password=super-secret-token`,
      },
      {
        id: "evt-2",
        at: "2026-06-21T02:39:00.000Z",
        type: "message",
        from: "Windows Codex",
        text: windowsText,
      },
      {
        id: "evt-3",
        at: "2026-06-21T02:39:30.000Z",
        type: "message",
        from: "Supervisor",
        text: extraText,
      },
    ],
  };
}

const macNalEvidence = "MacHostMedia=media=ok h264Key=3 sps=3 pps=3 idr=3 keyParam=3 firstKeyNal=7/8/5 firstNal=7/8/5 lastNal=1 lastKeyNal=7/8/5 keyGapFramesMax=60 keyGapMsMax=1000";

function assertSecretSafe(output, label) {
  assertNotIncludes(output, "super-secret-token", label);
  assertNotIncludes(output, "password=super", label);
  assertNotIncludes(output, "--password", label);
  assertNotIncludes(output, "LAN_DUAL_PASSWORD=", label);
}

async function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = await run([flag], args);
    assert(result.exitCode === 0, `help ${flag} failed\n${result.stdout}\n${result.stderr}`);
    assertIncludes(result.stdout, "Usage:", `help ${flag}`);
    assertIncludes(result.stdout, "--server", `help ${flag}`);
    assertIncludes(result.stdout, "--json", `help ${flag}`);
    assertIncludes(result.stdout, "--boardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "read-only", `help ${flag}`);
    assertSecretSafe(result.stdout + result.stderr, `help ${flag}`);
  }
  console.log("[OK] W2 H.264 board diagnosis help is safe");
}

async function checkWindowsDecodePath(args) {
  const windowsText = "W2W3Retest=video=H.264 surface=none h264=status=waiting-keyframe decoded=0 skippedDelta=68 needsKeyframe=yes queue=9 queueMs=900 staleDrops=68 reason=queue-overflow-wait-keyframe recv=68 key=1 sps=1 pps=1 idr=1 lastNal=1";
  await withFakeBoard(makeState({ windowsText, macText: macNalEvidence }), async (serverUrl, requests) => {
    const jsonResult = await run(["--server", serverUrl, "--json"], args);
    assert(jsonResult.exitCode === 2, `decode-path JSON should exit 2 for blocked diagnosis\n${jsonResult.stdout}\n${jsonResult.stderr}`);
    const payload = parseJson(jsonResult.stdout, "decode-path JSON");
    assert(payload.status === "blocked", `expected blocked status: ${jsonResult.stdout}`);
    assert(payload.reason === "windows-decode-path", `expected windows-decode-path reason: ${jsonResult.stdout}`);
    assert(payload.windows?.decoded === 0, `expected decoded=0: ${jsonResult.stdout}`);
    assert(payload.windows?.recv === 68, `expected recv=68: ${jsonResult.stdout}`);
    assert(payload.windows?.sps === 1 && payload.windows?.pps === 1 && payload.windows?.idr === 1, `expected SPS/PPS/IDR counts: ${jsonResult.stdout}`);
    assert(payload.mac?.firstKeyNal === "7/8/5", `expected Mac firstKeyNal: ${jsonResult.stdout}`);
    assertIncludes(payload.next, "InspectWebCodecsConfigureDecodeQueue", "decode-path next action");
    assertSecretSafe(jsonResult.stdout + jsonResult.stderr, "decode-path JSON");

    const summaryResult = await run(["--server", serverUrl, "--boardSummary"], args);
    assert(summaryResult.exitCode === 2, `decode-path boardSummary should exit 2\n${summaryResult.stdout}\n${summaryResult.stderr}`);
    assert(summaryResult.stdout.split(/\r?\n/).filter(Boolean).length === 1, `boardSummary should be one line\n${summaryResult.stdout}`);
    assertIncludes(summaryResult.stdout, "W2H264BoardDiagnosis=status=blocked reason=windows-decode-path", "decode-path boardSummary");
    assertIncludes(summaryResult.stdout, "windows=recv:68 key:1 sps:1 pps:1 idr:1 decoded:0 lastNal:1", "decode-path boardSummary");
    assertIncludes(summaryResult.stdout, "mac=firstKeyNal:7/8/5 lastKeyNal:7/8/5 lastNal:1", "decode-path boardSummary");
    assertIncludes(summaryResult.stdout, "macKey=h264Key:3 sps:3 pps:3 idr:3 keyParam:3", "decode-path boardSummary");
    assertIncludes(summaryResult.stdout, "Safety=read-only,no-password,no-auth,no-input,no-inject", "decode-path boardSummary");
    assertSecretSafe(summaryResult.stdout + summaryResult.stderr, "decode-path boardSummary");
    assert(requests.every((request) => request.method === "GET" && request.url === "/api/state"), `diagnosis should only read /api/state: ${JSON.stringify(requests)}`);
  });
  console.log("[OK] W2 H.264 board diagnosis isolates Windows decode path blockers");
}

async function checkWaitingForRetest(args) {
  await withFakeBoard(makeState({ windowsText: "Windows online, no W2W3Retest yet.", macText: macNalEvidence }), async (serverUrl) => {
    const result = await run(["--server", serverUrl, "--boardSummary"], args);
    assert(result.exitCode === 1, `missing retest should exit 1\n${result.stdout}\n${result.stderr}`);
    assertIncludes(result.stdout, "status=waiting reason=waiting-for-w2w3-retest", "waiting boardSummary");
    assertIncludes(result.stdout, "Next=RunWinClientRetest", "waiting boardSummary");
    assertSecretSafe(result.stdout + result.stderr, "waiting boardSummary");
  });
  console.log("[OK] W2 H.264 board diagnosis asks for WinClientRetest when evidence is missing");
}

async function checkExplanatoryW2TextIgnored(args) {
  const explanatoryWindowsText = "Windows 已推送：新增诊断，对照 Windows W2W3Retest h264= 与 Mac h264Key/SPS/PPS/IDR；真实板当前摘要为 windows recv=0 key=0 sps=0 pps=0 idr=0 decoded=0。";
  await withFakeBoard(makeState({ windowsText: explanatoryWindowsText, macText: macNalEvidence }), async (serverUrl) => {
    const result = await run(["--server", serverUrl, "--boardSummary"], args);
    assert(result.exitCode === 1, `explanatory W2 text should not be treated as retest evidence\n${result.stdout}\n${result.stderr}`);
    assertIncludes(result.stdout, "status=waiting reason=waiting-for-w2w3-retest", "explanatory W2 boardSummary");
    assertIncludes(result.stdout, "windows=recv:na key:na sps:na pps:na idr:na decoded:na lastNal:na", "explanatory W2 boardSummary");
    assertIncludes(result.stdout, "Next=RunWinClientRetest", "explanatory W2 boardSummary");
    assertSecretSafe(result.stdout + result.stderr, "explanatory W2 boardSummary");
  });
  console.log("[OK] W2 H.264 board diagnosis ignores explanatory W2W3Retest mentions");
}
async function checkBacktickedRetestLabelIgnored(args) {
  const explanatoryWindowsText = "准备推送：`W2W3Retest=` 摘要会解析 Windows recv=0 key=0 sps=0 pps=0 idr=0 decoded=0；不要把说明文字中的 W2W3Retest h264= 当作复测证据。";
  await withFakeBoard(makeState({ windowsText: explanatoryWindowsText, macText: macNalEvidence }), async (serverUrl) => {
    const result = await run(["--server", serverUrl, "--boardSummary"], args);
    assert(result.exitCode === 1, `backticked W2W3Retest label should not be treated as retest evidence\n${result.stdout}\n${result.stderr}`);
    assertIncludes(result.stdout, "status=waiting reason=waiting-for-w2w3-retest", "backticked W2 boardSummary");
    assertIncludes(result.stdout, "windows=recv:na key:na sps:na pps:na idr:na decoded:na lastNal:na", "backticked W2 boardSummary");
    assertIncludes(result.stdout, "Next=RunWinClientRetest", "backticked W2 boardSummary");
    assertSecretSafe(result.stdout + result.stderr, "backticked W2 boardSummary");
  });
  console.log("[OK] W2 H.264 board diagnosis ignores backticked W2W3Retest labels");
}
async function checkPlaceholderNalEvidenceIgnored(args) {
  const windowsText = "W2W3Retest=video=H.264 surface=none h264=status=waiting-keyframe decoded=0 needsKeyframe=yes recv=0 key=0 sps=0 pps=0 idr=0 lastNal=na";
  const placeholderMacText = "MacHostMedia=media=ok h264Key=<n> sps=<n> pps=<n> idr=<n> firstKeyNal=<types> firstNal=<types>";
  await withFakeBoard(makeState({ windowsText, macText: placeholderMacText }), async (serverUrl) => {
    const result = await run(["--server", serverUrl, "--boardSummary"], args);
    assert(result.exitCode === 1, `placeholder-only Mac evidence should stay waiting\n${result.stdout}\n${result.stderr}`);
    assertIncludes(result.stdout, "status=waiting reason=waiting-for-mac-nal-evidence", "placeholder boardSummary");
    assertIncludes(result.stdout, "mac=firstKeyNal:na lastKeyNal:na lastNal:na", "placeholder boardSummary");
    assertNotIncludes(result.stdout, "<types>", "placeholder boardSummary");
    assertNotIncludes(result.stdout, "<n>", "placeholder boardSummary");
    assertSecretSafe(result.stdout + result.stderr, "placeholder boardSummary");
  });
  console.log("[OK] W2 H.264 board diagnosis ignores placeholder NAL examples");
}
async function checkDecodedSurfaceReady(args) {
  const windowsText = "W2W3Retest=video=H.264 surface=canvas h264=status=decoded decoded=4 skippedDelta=0 needsKeyframe=no queue=1 queueMs=16 staleDrops=0 reason=ok recv=88 key=2 sps=2 pps=2 idr=2 lastNal=1";
  await withFakeBoard(makeState({ windowsText, macText: macNalEvidence }), async (serverUrl) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `decoded-surface JSON should exit 0\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "decoded-surface JSON");
    assert(payload.status === "ready", `expected ready: ${result.stdout}`);
    assert(payload.reason === "decoded-surface-seen", `expected decoded-surface-seen: ${result.stdout}`);
    assert(payload.windows?.decoded === 4, `expected decoded=4: ${result.stdout}`);
    assertIncludes(payload.next, "ManualVisualFpsAudioClipboardCheck", "decoded next action");
    assertSecretSafe(result.stdout + result.stderr, "decoded-surface JSON");
  });
  console.log("[OK] W2 H.264 board diagnosis recognizes decoded H.264 surfaces");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  await checkHelp(args);
  await checkWindowsDecodePath(args);
  await checkWaitingForRetest(args);
  await checkExplanatoryW2TextIgnored(args);
  await checkBacktickedRetestLabelIgnored(args);
  await checkPlaceholderNalEvidenceIgnored(args);
  await checkDecodedSurfaceReady(args);
  console.log("[OK] W2 H.264 board diagnosis regression passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
