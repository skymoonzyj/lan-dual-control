#!/usr/bin/env node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/discover-windows-hosts.mjs";

const defaults = {
  timeoutMs: 8000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-discover-windows-hosts.mjs [options]

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Verifies Mac-side Windows host discovery without scanning the real network.
The test uses a fake underlying LAN scanner and never authenticates, asks for a
password, sends input, or executes inject.
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
      args.timeoutMs = Math.max(3000, Number(next) || defaults.timeoutMs);
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

function assertFormalSmokeCommand(command, label) {
  assertIncludes(command, "run-mac-client-formal-smoke.mjs", label);
  assertIncludes(command, "--host 192.168.31.68", label);
  assertIncludes(command, "--port 43770", label);
  assertIncludes(command, "--ensureClient", label);
  assertIncludes(command, "--preflightOnly", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "--json", label);
}

function assertMacClientFormalSmokeCommand(command, label) {
  assertIncludes(command, "run-mac-client-formal-smoke.mjs", label);
  assertIncludes(command, "--discover", label);
  assertIncludes(command, "--ensureClient", label);
  assertIncludes(command, "--preflightOnly", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--host 192.168.31.68", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--useEnvPassword", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "--json", label);
}

function assertMacClientPromptPasswordSmokeCommand(command, label) {
  assertIncludes(command, "run-mac-client-formal-smoke.mjs", label);
  assertIncludes(command, "--host 192.168.31.68", label);
  assertIncludes(command, "--port 43770", label);
  assertIncludes(command, "--ensureClient", label);
  assertIncludes(command, "--promptPassword", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--discover", label);
  assertNotIncludes(command, "--preflightOnly", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--useEnvPassword", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "--json", label);
  assertNotIncludes(command, "input_event", label);
  assertNotIncludes(command, "inject", label);
}

function assertFallbackMacClientPromptPasswordSmokeCommand(command, label) {
  assertIncludes(command, "run-mac-client-formal-smoke.mjs", label);
  assertIncludes(command, "--discover", label);
  assertIncludes(command, "--ensureClient", label);
  assertIncludes(command, "--promptPassword", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--host 192.168.31.68", label);
  assertNotIncludes(command, "--preflightOnly", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--useEnvPassword", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "--json", label);
  assertNotIncludes(command, "input_event", label);
  assertNotIncludes(command, "inject", label);
}

function assertFormalChecklistCommand(command, label) {
  assertIncludes(command, "check-mac-client-formal-status.mjs", label);
  assertIncludes(command, "--host 192.168.31.68", label);
  assertIncludes(command, "--port 43770", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "--json", label);
}

function assertMacClientBrowserSelfTestCommand(command, label) {
  assertIncludes(command, "scripts/mac/test-mac-client-browser-self-test-wrapper.mjs", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "scripts/mac/test-mac-client-browser-self-test.mjs", label);
  assertNotIncludes(command, "scripts/windows/test-mac-client-browser.mjs", label);
  assertNotIncludes(command, "--useExistingHost", label);
  assertNotIncludes(command, "--useEnvPassword", label);
  assertNotIncludes(command, "--requirePassword", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
}

function assertMacScriptHelpCommand(command, label) {
  assertIncludes(command, "node scripts/mac/test-mac-script-help.mjs", label);
  assertIncludes(command, "--timeoutMs 10000", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "input_event", label);
  assertNotIncludes(command, "inject", label);
}

function assertMacPowerPlanCommand(command, label) {
  assertIncludes(command, "node scripts/mac/plan-mac-power-settings.mjs", label);
  assertIncludes(command, "--profile all", label);
  assertIncludes(command, "--sleep 0", label);
  assertIncludes(command, "--displaySleep 0", label);
  assertIncludes(command, "--networkWake on", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--apply", label);
  assertNotIncludes(command, "sudo", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "--json", label);
  assertNotIncludes(command, "input_event", label);
  assertNotIncludes(command, "inject", label);
}

function assertMacInputSafetyPlanCommand(command, label) {
  assertIncludes(command, "node scripts/mac/plan-mac-input-safety.mjs", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--apply", label);
  assertNotIncludes(command, "sudo", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "--json", label);
  assertNotIncludes(command, "input_event", label);
  assertNotIncludes(command, "inject", label);
}

function assertMacRemoteAudioPlanCommand(command, label) {
  assertIncludes(command, "node scripts/mac/plan-mac-remote-audio.mjs", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--apply", label);
  assertNotIncludes(command, "sudo", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "--json", label);
  assertNotIncludes(command, "input_event", label);
  assertNotIncludes(command, "inject", label);
}

function assertReverseControlRehearsal(text, label) {
  assertIncludes(text, "LAN008", label);
  assertIncludes(text, "allow-windows-reverse-control.ps1", label);
  assertIncludes(text, "allow-windows-reverse-control.mjs", label);
  assertIncludes(text, "127.0.0.1", label);
  assertIncludes(text, "--port 43770", label);
  assertIncludes(text, "临时授权已使用", label);
  assertNotIncludes(text, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(text, "--password", label);
  assertNotIncludes(text, "--sendCall", label);
}

function extractWindowsReverseGrantLabel(text, field, label) {
  const match = String(text || "").match(new RegExp(`${field}=(.+?)(?:\\. Windows[A-Z]|\\. ReverseRehearsal=|\\n|$)`));
  assert(match, `${label} should include ${field}= command.\n${text}`);
  return match[1].trim();
}

function assertSecretFreeCommand(command, label) {
  assertNotIncludes(command, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
}

function assertWindowsLanRisk(payload, output, label) {
  assert(payload.windowsLanRisk?.checked === true, `${label} should check Agent Link Board for Windows LAN risk`);
  assert(payload.windowsLanRisk?.found === true, `${label} should find WindowsLanRisk on the board`);
  assert(Array.isArray(payload.windowsLanRisk?.risks), `${label} should expose sanitized risk tokens`);
  assert(payload.windowsLanRisk.risks.join(",") === "no-firewall-allow,public-profile", `${label} should keep only safe risk tokens`);
  assert(payload.windowsLanRisk.riskText === "no-firewall-allow,public-profile", `${label} should expose a compact riskText`);
  assert(payload.windowsLanRisk.rejectedCount >= 2, `${label} should count rejected unsafe board candidates`);
  assertIncludes(payload.boardSummary || "", "WindowsLanRisk=no-firewall-allow,public-profile", `${label} board summary`);
  assertNotIncludes(output, "hunter2", `${label} output`);
  assertNotIncludes(output, "sauce", `${label} output`);
  assertNotIncludes(output, "LAN_DUAL_PASSWORD=hunter2", `${label} output`);
  assertNotIncludes(output, "--password=sauce", `${label} output`);
}

function assertMacUnattendedFreshness(payload, expected, label) {
  const freshness = payload.macUnattendedFreshness;
  assert(freshness?.status === expected.status, `${label} should expose MacUnattendedFreshness status=${expected.status}`);
  assert(freshness.checkedAt === expected.checkedAt, `${label} should preserve MacUnattendedFreshness checkedAt`);
  assert(freshness.thresholdMs === expected.thresholdMs, `${label} should expose MacUnattendedFreshness thresholdMs`);
  assert(freshness.source === expected.source, `${label} should expose MacUnattendedFreshness source`);
  assert(Number.isFinite(freshness.checkedAgeMs), `${label} should expose finite MacUnattendedFreshness checkedAgeMs`);
}

function assertWindowsReverseGrantCommands(text, label) {
  assertIncludes(text, "WindowsReverseGrantStatus=pwsh -NoProfile -ExecutionPolicy Bypass", label);
  assertIncludes(text, "-File scripts/windows/allow-windows-reverse-control.ps1", label);
  assertIncludes(text, "-HostName 127.0.0.1", label);
  assertIncludes(text, "-Port 43770 -Status -BoardSummary", label);
  assertIncludes(text, "WindowsOpenOneTimeReverseGrant=pwsh -NoProfile -ExecutionPolicy Bypass", label);
  assertIncludes(text, "-Port 43770 -Grant -DurationMs 30000 -BoardSummary", label);
  assertIncludes(text, "WindowsReverseGrantStatusNodeFallback=node scripts/windows/allow-windows-reverse-control.mjs", label);
  assertIncludes(text, "--host 127.0.0.1 --port 43770 --status --boardSummary", label);
  assertIncludes(text, "WindowsOpenOneTimeReverseGrantNodeFallback=node scripts/windows/allow-windows-reverse-control.mjs", label);
  assertIncludes(text, "--host 127.0.0.1 --port 43770 --grant --durationMs 30000 --boardSummary", label);
  assertSecretFreeCommand(extractWindowsReverseGrantLabel(text, "WindowsReverseGrantStatus", label), `${label} status command`);
  assertSecretFreeCommand(extractWindowsReverseGrantLabel(text, "WindowsOpenOneTimeReverseGrant", label), `${label} grant command`);
  assertSecretFreeCommand(extractWindowsReverseGrantLabel(text, "WindowsReverseGrantStatusNodeFallback", label), `${label} status fallback command`);
  assertSecretFreeCommand(extractWindowsReverseGrantLabel(text, "WindowsOpenOneTimeReverseGrantNodeFallback", label), `${label} grant fallback command`);
}

function assertWindowsHostStatusCommand(command, label) {
  assertIncludes(command, "node scripts/windows/start-windows-host.mjs", label);
  assertIncludes(command, "--status", label);
  assertIncludes(command, "--host 127.0.0.1", label);
  assertIncludes(command, "--port 43770", label);
  assertIncludes(command, "--boardSummary", label);
  assertSecretFreeCommand(command, label);
  assertNotIncludes(command, "input_event", label);
  assertNotIncludes(command, "inject", label);
}

function assertWindowsHostReadinessCommand(command, label) {
  assertIncludes(command, "node scripts/windows/check-windows-host-readiness.mjs", label);
  assertIncludes(command, "--checkBoard", label);
  assertIncludes(command, "--boardSummary", label);
  assertSecretFreeCommand(command, label);
  assertNotIncludes(command, "input_event", label);
  assertNotIncludes(command, "inject", label);
}

function extractFormalSmokeCommand(text, label) {
  const match = String(text || "").match(/FormalSmoke=(.+?)(?:\. MacClientFormalSmoke=|\. MacClientPromptPasswordSmoke=|\. ManualChecklist=|\n|$)/);
  assert(match, `${label} should include FormalSmoke= command.\n${text}`);
  return match[1].trim();
}

function extractWindowsHostStatusCommand(text, label) {
  const match = String(text || "").match(/WindowsHostStatus=(.+?)(?:\. WindowsHostReadiness=|\. MacClientPromptPasswordSmoke=|\.\s*No password|\n|$)/);
  assert(match, `${label} should include WindowsHostStatus= command.\n${text}`);
  return match[1].trim();
}

function extractWindowsHostReadinessCommand(text, label) {
  const match = String(text || "").match(/WindowsHostReadiness=(.+?)(?:\. MacClientPromptPasswordSmoke=|\.\s*No password|\n|$)/);
  assert(match, `${label} should include WindowsHostReadiness= command.\n${text}`);
  return match[1].trim();
}

function extractMacClientBrowserSelfTestCommand(text, label) {
  const match = String(text || "").match(/MacClientBrowserSelfTest=(.+?)(?:\. MacScriptHelp=|\. MacPowerPlan=|\. WindowsReverseGrantStatus=|\. ReverseRehearsal=|\. If that checklist|\.\s*No password|\n|$)/);
  assert(match, `${label} should include MacClientBrowserSelfTest= command.\n${text}`);
  return match[1].trim();
}

function extractMacClientPromptPasswordSmokeCommand(text, label) {
  const match = String(text || "").match(/MacClientPromptPasswordSmoke=(.+?)(?:\. ManualChecklist=|\. MacClientBrowserSelfTest=|\. WindowsReverseGrantStatus=|\. ReverseRehearsal=|\. If that checklist|\.\s*No password|\n|$)/);
  assert(match, `${label} should include MacClientPromptPasswordSmoke= command.\n${text}`);
  return match[1].trim();
}

function extractMacScriptHelpCommand(text, label) {
  const match = String(text || "").match(/MacScriptHelp=(.+?)(?:\. MacPowerPlan=|\. MacRemoteAudioPlan=|\. WindowsReverseGrantStatus=|\. ReverseRehearsal=|\. If that checklist|\.\s*No password|\n|$)/);
  assert(match, `${label} should include MacScriptHelp= command.\n${text}`);
  return match[1].trim();
}

function extractMacPowerPlanCommand(text, label) {
  const match = String(text || "").match(/MacPowerPlan=(.+?)(?:\. MacRemoteAudioPlan=|\. MacInputSafetyPlan=|\. MacUnattendedFreshness=|\. WindowsReverseGrantStatus=|\. ReverseRehearsal=|\. If that checklist|\.\s*No password|\n|$)/);
  assert(match, `${label} should include MacPowerPlan= command.\n${text}`);
  return match[1].trim();
}

function extractMacRemoteAudioPlanCommand(text, label) {
  const match = String(text || "").match(/MacRemoteAudioPlan=(.+?)(?:\. MacInputSafetyPlan=|\. MacUnattendedFreshness=|\. WindowsReverseGrantStatus=|\. ReverseRehearsal=|\. If that checklist|\.\s*No password|\n|$)/);
  assert(match, `${label} should include MacRemoteAudioPlan= command.\n${text}`);
  return match[1].trim();
}

function extractMacInputSafetyPlanCommand(text, label) {
  const match = String(text || "").match(/MacInputSafetyPlan=(.+?)(?:\. MacUnattendedFreshness=|\. WindowsReverseGrantStatus=|\. ReverseRehearsal=|\. If that checklist|\.\s*No password|\n|$)/);
  assert(match, `${label} should include MacInputSafetyPlan= command.\n${text}`);
  return match[1].trim();
}

function extractReverseRehearsal(text, label) {
  const match = String(text || "").match(/ReverseRehearsal=(.+?)(?:\. If that checklist|\.\s*No password|\n|$)/);
  assert(match, `${label} should include ReverseRehearsal= text.\n${text}`);
  return match[1].trim();
}

function makeFakeScanner(tmp) {
  const fakePath = join(tmp, "scripts/windows/discover-lan-hosts.mjs");
  mkdirSync(dirname(fakePath), { recursive: true });
  writeFileSync(fakePath, `#!/usr/bin/env node
const mode = process.env.FAKE_WINDOWS_DISCOVERY_MODE || "found";
const common = {
  scanned: 4,
  ports: [43770],
  subnets: [{ network: "192.168.31.0", prefix: 24, interfaceName: "en0", interfaceAddress: "192.168.31.122" }],
};
if (mode === "hang") {
  setTimeout(() => {}, 60000);
}
if (mode === "none") {
  console.log(JSON.stringify({
    ok: true,
    found: [{
      ok: true,
      host: "192.168.31.122",
      port: "43770",
      platform: "macos",
      deviceName: "Mac Host",
      runtime: { buildId: "mac-build" },
      capabilities: { inputMode: "log" }
    }],
    ...common
  }));
  process.exit(0);
}
console.log(JSON.stringify({
  ok: true,
  found: [
    {
      ok: true,
      host: "192.168.31.122",
      port: "43770",
      platform: "macos",
      deviceName: "Mac Host",
      runtime: { buildId: "mac-build" },
      capabilities: { inputMode: "log" }
    },
    {
      ok: true,
      host: "192.168.31.68",
      port: "43770",
      platform: "windows",
      deviceName: "Windows Host",
      runtime: { buildId: "win-build" },
      capabilities: { input: { mode: "log" } }
    }
  ],
  ...common
}));
`, { mode: 0o755 });
}

async function getFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

async function waitForHttpPath(port, pathname, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
      if (response.ok) return;
    } catch {
      // Retry until the child server finishes binding the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`HTTP server on ${port}${pathname} did not become ready`);
}

async function withBoardStateServer(args, state, callback) {
  const port = await getFreePort();
  const postDir = mkdtempSync(join(tmpdir(), "lan-dual-discover-board-posts-"));
  const postLogPath = join(postDir, "posts.jsonl");
  const child = spawn(process.execPath, [
    "--input-type=module",
    "-e",
    `
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";
const port = Number(process.argv[1]);
const postLogPath = process.argv[2];
const state = ${JSON.stringify(state)};
createServer((request, response) => {
  const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
  if (request.method === "POST" && (pathname === "/api/status" || pathname === "/api/message")) {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      let parsed = {};
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch (error) {
        parsed = { parseError: error.message, raw: body };
      }
      appendFileSync(postLogPath, JSON.stringify({ path: pathname, body: parsed }) + "\\n");
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  if (pathname !== "/api/state") {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("not found\\n");
    return;
  }
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(state));
}).listen(port, "127.0.0.1");
`,
    String(port),
    postLogPath,
  ], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForHttpPath(port, "/api/state", args.timeoutMs);
    await callback(`http://127.0.0.1:${port}`, postLogPath);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1000);
      child.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    rmSync(postDir, { recursive: true, force: true });
  }
}

function readPostLog(postLogPath) {
  try {
    return readFileSync(postLogPath, "utf8")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function run(extraArgs, args, env = {}) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
      LAN_DUAL_DISCOVER_LAN_HOSTS_SCRIPT: join(env.FAKE_SCANNER_ROOT || "", "scripts/windows/discover-lan-hosts.mjs"),
      ...env,
    },
  });
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(String(stdout || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${stdout}`);
  }
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag], args);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assertIncludes(result.stdout, "Usage:", `${script} ${flag}`);
    assertIncludes(result.stdout, "read-only", `${script} ${flag}`);
    assertIncludes(result.stdout, "--scanTimeoutMs", `${script} ${flag}`);
    assertIncludes(result.stdout, "formalChecklistCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "macClientFormalChecklistCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "formalSmokeCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "macClientFormalSmokeCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "macClientPromptPasswordSmokeCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "macClientBrowserSelfTestCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "macScriptHelpCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "macPowerPlanCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "macRemoteAudioPlanCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "macInputSafetyPlanCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "windowsHostStatusCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "windowsHostReadinessCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "macUnattendedFreshness", `${script} ${flag}`);
    assertIncludes(result.stdout, "scanError", `${script} ${flag}`);
    assertIncludes(result.stdout, "windowsReverseGrantStatus", `${script} ${flag}`);
    assertIncludes(result.stdout, "windowsOpenOneTimeReverseGrant", `${script} ${flag}`);
    assertIncludes(result.stdout, "windowsReverseGrantStatusNodeFallback", `${script} ${flag}`);
    assertIncludes(result.stdout, "windowsOpenOneTimeReverseGrantNodeFallback", `${script} ${flag}`);
    assertIncludes(result.stdout, "reverseControlRehearsal", `${script} ${flag}`);
    assertIncludes(result.stdout, "manualChecklistSummary", `${script} ${flag}`);
    assertIncludes(result.stdout, "--checkBoard", `${script} ${flag}`);
    assertIncludes(result.stdout, "--sendStatus", `${script} ${flag}`);
    assertIncludes(result.stdout, "--sendMessage", `${script} ${flag}`);
    assertIncludes(result.stdout, "windowsLanRisk", `${script} ${flag}`);
    assertNotIncludes(result.stdout, "password:", `${script} ${flag}`);
  }
  console.log("[OK] Windows host discovery help exits quickly");
}

function checkFoundJson(tmp, args) {
  const result = run(["--json", "--host", "192.168.31.68"], args, {
    FAKE_SCANNER_ROOT: tmp,
    FAKE_WINDOWS_DISCOVERY_MODE: "found",
  });
  assert(result.status === 0, `found JSON should exit 0.\n${result.stdout}\n${result.stderr}`);
  const payload = parseJson(result.stdout, "found JSON");
  assert(payload.ok === true, "found payload should be ok=true");
  assert(payload.found.length === 1, "found payload should include only Windows hosts");
  assert(payload.ignored.length === 1, "found payload should keep ignored Mac host diagnostics");
  assert(payload.best.host === "192.168.31.68", "best host should be Windows");
  assertIncludes(payload.nextCommand, "--host 192.168.31.68", "next command");
  assertFormalChecklistCommand(payload.formalChecklistCommand || "", "formal checklist command");
  assertFormalChecklistCommand(payload.macClientFormalChecklistCommand || "", "Mac client formal checklist command");
  assertFormalSmokeCommand(payload.formalSmokeCommand || "", "formal smoke command");
  assertMacClientFormalSmokeCommand(payload.macClientFormalSmokeCommand || "", "Mac client formal smoke command");
  assertMacClientPromptPasswordSmokeCommand(payload.macClientPromptPasswordSmokeCommand || "", "Mac client prompt-password smoke command");
  assertMacClientBrowserSelfTestCommand(
    payload.macClientBrowserSelfTestCommand || "",
    "Mac client browser self-test command",
  );
  assertMacScriptHelpCommand(payload.macScriptHelpCommand || "", "Mac script help command");
  assertMacPowerPlanCommand(payload.macPowerPlanCommand || "", "Mac power plan command");
  assertMacRemoteAudioPlanCommand(payload.macRemoteAudioPlanCommand || "", "Mac remote audio plan command");
  assertMacInputSafetyPlanCommand(payload.macInputSafetyPlanCommand || "", "Mac input safety plan command");
  assert(payload.manualChecklistSummary === "connection/video/audio/clipboard/input_ack/diagnostics", "found payload should include manual checklist summary");
  assertIncludes(payload.sendCallCommand, "--host 192.168.31.68", "send call command");
  assertIncludes(payload.sendCallCommand, "--sendCall", "send call command");
  assertIncludes(payload.windowsReverseGrantStatus, "-Port 43770 -Status -BoardSummary", "Windows reverse grant status");
  assertIncludes(payload.windowsOpenOneTimeReverseGrant, "-Port 43770 -Grant -DurationMs 30000 -BoardSummary", "Windows one-time reverse grant");
  assertIncludes(payload.windowsReverseGrantStatusNodeFallback, "--port 43770 --status --boardSummary", "Windows reverse grant status Node fallback");
  assertIncludes(payload.windowsOpenOneTimeReverseGrantNodeFallback, "--port 43770 --grant --durationMs 30000 --boardSummary", "Windows one-time reverse grant Node fallback");
  assertReverseControlRehearsal(payload.reverseControlRehearsal || "", "found JSON reverse rehearsal");
  assertIncludes(payload.boardSummary, "FormalChecklist=", "board summary");
  assertIncludes(payload.boardSummary, "MacClientFormalChecklist=", "board summary");
  assertIncludes(payload.boardSummary, "MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs --host 192.168.31.68", "board summary");
  assertIncludes(payload.boardSummary, "FormalSmoke=", "board summary");
  assertIncludes(payload.boardSummary, "MacClientFormalSmoke=", "board summary");
  assertIncludes(payload.boardSummary, "MacClientFormalSmoke=node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary", "board summary");
  assertIncludes(payload.boardSummary, "MacClientPromptPasswordSmoke=", "board summary");
  assertMacClientPromptPasswordSmokeCommand(
    extractMacClientPromptPasswordSmokeCommand(payload.boardSummary, "board summary"),
    "board summary Mac client prompt-password smoke command",
  );
  assertFormalSmokeCommand(extractFormalSmokeCommand(payload.boardSummary, "board summary"), "board summary formal smoke command");
  assertIncludes(payload.boardSummary, "ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics", "board summary");
  assertIncludes(payload.boardSummary, "MacClientBrowserSelfTest=", "board summary");
  assertMacClientBrowserSelfTestCommand(
    extractMacClientBrowserSelfTestCommand(payload.boardSummary, "board summary"),
    "board summary Mac client browser self-test command",
  );
  assertIncludes(payload.boardSummary, "MacScriptHelp=", "board summary");
  assertMacScriptHelpCommand(
    extractMacScriptHelpCommand(payload.boardSummary, "board summary"),
    "board summary Mac script help command",
  );
  assertIncludes(payload.boardSummary, "MacPowerPlan=", "board summary");
  assertMacPowerPlanCommand(
    extractMacPowerPlanCommand(payload.boardSummary, "board summary"),
    "board summary Mac power plan command",
  );
  assertIncludes(payload.boardSummary, "MacRemoteAudioPlan=", "board summary");
  assertMacRemoteAudioPlanCommand(
    extractMacRemoteAudioPlanCommand(payload.boardSummary, "board summary"),
    "board summary Mac remote audio plan command",
  );
  assertIncludes(payload.boardSummary, "MacInputSafetyPlan=", "board summary");
  assertMacInputSafetyPlanCommand(
    extractMacInputSafetyPlanCommand(payload.boardSummary, "board summary"),
    "board summary Mac input safety plan command",
  );
  assertWindowsReverseGrantCommands(payload.boardSummary, "board summary Windows reverse grant commands");
  assertIncludes(payload.boardSummary, "ReverseRehearsal=", "board summary");
  assertReverseControlRehearsal(extractReverseRehearsal(payload.boardSummary, "board summary"), "board summary reverse rehearsal");
  assertIncludes(payload.boardSummary, "No password was requested or sent", "board summary");
  assertNotIncludes(`${result.stdout}\n${result.stderr}`, "LAN_DUAL_PASSWORD", "found output");
  console.log("[OK] JSON discovery filters Windows hosts and returns next formal command");
}

function checkBoardSummaryFound(tmp, args) {
  const result = run(["--boardSummary", "--scanTimeoutMs", "30000"], args, {
    FAKE_SCANNER_ROOT: tmp,
    FAKE_WINDOWS_DISCOVERY_MODE: "found",
  });
  assert(result.status === 0, `found board summary should exit 0.\n${result.stdout}\n${result.stderr}`);
  assertIncludes(result.stdout, "Windows host discovery: found 1", "found board summary");
  assertIncludes(result.stdout, "FormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs --host 192.168.31.68", "found board summary");
  assertIncludes(result.stdout, "MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs --host 192.168.31.68", "found board summary");
  assertIncludes(result.stdout, "FormalSmoke=node scripts/mac/run-mac-client-formal-smoke.mjs --host 192.168.31.68", "found board summary");
  assertIncludes(result.stdout, "MacClientFormalSmoke=node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary", "found board summary");
  assertIncludes(result.stdout, "MacClientPromptPasswordSmoke=node scripts/mac/run-mac-client-formal-smoke.mjs --host 192.168.31.68 --port 43770 --ensureClient --promptPassword --boardSummary", "found board summary");
  assertMacClientPromptPasswordSmokeCommand(
    extractMacClientPromptPasswordSmokeCommand(result.stdout, "found board summary"),
    "found board summary Mac client prompt-password smoke command",
  );
  assertFormalSmokeCommand(extractFormalSmokeCommand(result.stdout, "found board summary"), "found board summary formal smoke command");
  assertIncludes(result.stdout, "ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics", "found board summary");
  assertIncludes(result.stdout, "MacClientBrowserSelfTest=", "found board summary");
  assertMacClientBrowserSelfTestCommand(
    extractMacClientBrowserSelfTestCommand(result.stdout, "found board summary"),
    "found board summary Mac client browser self-test command",
  );
  assertIncludes(result.stdout, "MacScriptHelp=", "found board summary");
  assertMacScriptHelpCommand(
    extractMacScriptHelpCommand(result.stdout, "found board summary"),
    "found board summary Mac script help command",
  );
  assertIncludes(result.stdout, "MacPowerPlan=", "found board summary");
  assertMacPowerPlanCommand(
    extractMacPowerPlanCommand(result.stdout, "found board summary"),
    "found board summary Mac power plan command",
  );
  assertIncludes(result.stdout, "MacRemoteAudioPlan=", "found board summary");
  assertMacRemoteAudioPlanCommand(
    extractMacRemoteAudioPlanCommand(result.stdout, "found board summary"),
    "found board summary Mac remote audio plan command",
  );
  assertIncludes(result.stdout, "MacInputSafetyPlan=", "found board summary");
  assertMacInputSafetyPlanCommand(
    extractMacInputSafetyPlanCommand(result.stdout, "found board summary"),
    "found board summary Mac input safety plan command",
  );
  assertWindowsReverseGrantCommands(result.stdout, "found board summary Windows reverse grant commands");
  assertIncludes(result.stdout, "ReverseRehearsal=", "found board summary");
  assertReverseControlRehearsal(extractReverseRehearsal(result.stdout, "found board summary"), "found board summary reverse rehearsal");
  assertIncludes(result.stdout, "--sendCall", "found board summary");
  assertIncludes(result.stdout, "no WebSocket/input/inject", "found board summary");
  console.log("[OK] Board summary gives a secret-free next step when Windows host is found");
}

function checkPlainFound(tmp, args) {
  const result = run(["--host", "192.168.31.68"], args, {
    FAKE_SCANNER_ROOT: tmp,
    FAKE_WINDOWS_DISCOVERY_MODE: "found",
  });
  assert(result.status === 0, `found plain output should exit 0.\n${result.stdout}\n${result.stderr}`);
  assertIncludes(result.stdout, "Mac client formal checklist:", "found plain output");
  assertIncludes(result.stdout, "check-mac-client-formal-status.mjs --host 192.168.31.68", "found plain output");
  assertIncludes(result.stdout, "Formal smoke preflight:", "found plain output");
  assertIncludes(result.stdout, "Mac client formal smoke:", "found plain output");
  assertIncludes(result.stdout, "Mac client prompt-password smoke:", "found plain output");
  assertIncludes(result.stdout, "Mac client browser self-test:", "found plain output");
  assertIncludes(result.stdout, "Mac script help safety check:", "found plain output");
  assertIncludes(result.stdout, "Mac power settings dry-run plan:", "found plain output");
  assertIncludes(result.stdout, "Mac remote audio plan:", "found plain output");
  assertIncludes(result.stdout, "Mac input safety plan:", "found plain output");
  assertIncludes(result.stdout, "Windows reverse grant status:", "found plain output");
  assertIncludes(result.stdout, "Windows one-time reverse grant:", "found plain output");
  assertIncludes(result.stdout, "Windows reverse grant status (Node fallback):", "found plain output");
  assertIncludes(result.stdout, "Windows one-time reverse grant (Node fallback):", "found plain output");
  assertIncludes(result.stdout, "Reverse rehearsal:", "found plain output");
  const match = String(result.stdout || "").match(/Formal smoke preflight: ([^\n]+)/);
  assert(match, `found plain output should include formal smoke command line.\n${result.stdout}`);
  assertFormalSmokeCommand(match[1], "found plain output formal smoke command");
  const macClientFormalSmokeMatch = String(result.stdout || "").match(/Mac client formal smoke: ([^\n]+)/);
  assert(macClientFormalSmokeMatch, `found plain output should include Mac client formal smoke command line.\n${result.stdout}`);
  assertMacClientFormalSmokeCommand(macClientFormalSmokeMatch[1], "found plain output Mac client formal smoke command");
  const macClientPromptPasswordSmokeMatch = String(result.stdout || "").match(/Mac client prompt-password smoke: ([^\n]+)/);
  assert(macClientPromptPasswordSmokeMatch, `found plain output should include Mac client prompt-password smoke command line.\n${result.stdout}`);
  assertMacClientPromptPasswordSmokeCommand(macClientPromptPasswordSmokeMatch[1], "found plain output Mac client prompt-password smoke command");
  const selfTestMatch = String(result.stdout || "").match(/Mac client browser self-test: ([^\n]+)/);
  assert(selfTestMatch, `found plain output should include self-test command line.\n${result.stdout}`);
  assertMacClientBrowserSelfTestCommand(selfTestMatch[1], "found plain output Mac client browser self-test command");
  const scriptHelpMatch = String(result.stdout || "").match(/Mac script help safety check: ([^\n]+)/);
  assert(scriptHelpMatch, `found plain output should include Mac script help command line.\n${result.stdout}`);
  assertMacScriptHelpCommand(scriptHelpMatch[1], "found plain output Mac script help command");
  const macPowerPlanMatch = String(result.stdout || "").match(/Mac power settings dry-run plan: ([^\n]+)/);
  assert(macPowerPlanMatch, `found plain output should include Mac power plan command line.\n${result.stdout}`);
  assertMacPowerPlanCommand(macPowerPlanMatch[1], "found plain output Mac power plan command");
  const macRemoteAudioPlanMatch = String(result.stdout || "").match(/Mac remote audio plan: ([^\n]+)/);
  assert(macRemoteAudioPlanMatch, `found plain output should include Mac remote audio plan command line.\n${result.stdout}`);
  assertMacRemoteAudioPlanCommand(macRemoteAudioPlanMatch[1], "found plain output Mac remote audio plan command");
  const macInputSafetyPlanMatch = String(result.stdout || "").match(/Mac input safety plan: ([^\n]+)/);
  assert(macInputSafetyPlanMatch, `found plain output should include Mac input safety plan command line.\n${result.stdout}`);
  assertMacInputSafetyPlanCommand(macInputSafetyPlanMatch[1], "found plain output Mac input safety plan command");
  assertIncludes(result.stdout, "-Port 43770 -Status -BoardSummary", "found plain output Windows reverse grant status");
  assertIncludes(result.stdout, "-Port 43770 -Grant -DurationMs 30000 -BoardSummary", "found plain output Windows one-time reverse grant");
  assertIncludes(result.stdout, "--host 127.0.0.1 --port 43770 --status --boardSummary", "found plain output Windows reverse grant status Node fallback");
  assertIncludes(result.stdout, "--host 127.0.0.1 --port 43770 --grant --durationMs 30000 --boardSummary", "found plain output Windows one-time reverse grant Node fallback");
  const reverseMatch = String(result.stdout || "").match(/Reverse rehearsal: ([^\n]+)/);
  assert(reverseMatch, `found plain output should include reverse rehearsal line.\n${result.stdout}`);
  assertReverseControlRehearsal(reverseMatch[1], "found plain output reverse rehearsal");
  assertNotIncludes(`${result.stdout}\n${result.stderr}`, "LAN_DUAL_PASSWORD", "found plain output");
  console.log("[OK] Plain discovery output includes the formal smoke preflight command");
}

function checkNoneRequireFound(tmp, args) {
  const result = run(["--json", "--requireFound"], args, {
    FAKE_SCANNER_ROOT: tmp,
    FAKE_WINDOWS_DISCOVERY_MODE: "none",
  });
  assert(result.status !== 0, "requireFound should fail when only Mac hosts are found");
  const payload = parseJson(result.stdout, "none JSON");
  assert(payload.ok === false, "none payload should be ok=false");
  assert(payload.found.length === 0, "none payload should have no Windows hosts");
  assert(payload.ignored.length === 1, "none payload should include ignored Mac host");
  assertIncludes(payload.boardSummary, "no Windows host found", "none board summary");
  assertIncludes(payload.boardSummary, "Ask Windows Codex to start Windows host", "none board summary");
  assertIncludes(payload.boardSummary, "MacClientBrowserSelfTest=", "none board summary");
  assertIncludes(payload.boardSummary, "MacClientPromptPasswordSmoke=", "none board summary");
  assertIncludes(payload.boardSummary, "MacScriptHelp=", "none board summary");
  assertIncludes(payload.boardSummary, "MacPowerPlan=", "none board summary");
  assertIncludes(payload.boardSummary, "MacRemoteAudioPlan=", "none board summary");
  assertIncludes(payload.boardSummary, "MacInputSafetyPlan=", "none board summary");
  assertWindowsHostStatusCommand(payload.windowsHostStatusCommand || "", "none JSON Windows host status command");
  assertWindowsHostReadinessCommand(payload.windowsHostReadinessCommand || "", "none JSON Windows host readiness command");
  assertWindowsHostStatusCommand(
    extractWindowsHostStatusCommand(payload.boardSummary, "none board summary"),
    "none board summary Windows host status command",
  );
  assertWindowsHostReadinessCommand(
    extractWindowsHostReadinessCommand(payload.boardSummary, "none board summary"),
    "none board summary Windows host readiness command",
  );
  assertFallbackMacClientPromptPasswordSmokeCommand(
    payload.macClientPromptPasswordSmokeCommand || "",
    "none JSON Mac client prompt-password smoke command",
  );
  assert(!payload.reverseControlRehearsal, "none payload should not invent a reverse rehearsal without a Windows host");
  assert(!payload.windowsReverseGrantStatus, "none payload should not invent a Windows reverse grant status command without a Windows host");
  assert(!payload.windowsOpenOneTimeReverseGrant, "none payload should not invent a Windows reverse grant command without a Windows host");
  assert(!payload.windowsReverseGrantStatusNodeFallback, "none payload should not invent a Windows reverse grant status fallback without a Windows host");
  assert(!payload.windowsOpenOneTimeReverseGrantNodeFallback, "none payload should not invent a Windows reverse grant fallback without a Windows host");
  assertMacClientBrowserSelfTestCommand(
    payload.macClientBrowserSelfTestCommand || "",
    "none JSON Mac client browser self-test command",
  );
  assertFallbackMacClientPromptPasswordSmokeCommand(
    extractMacClientPromptPasswordSmokeCommand(payload.boardSummary, "none board summary"),
    "none board summary Mac client prompt-password smoke command",
  );
  assertMacScriptHelpCommand(payload.macScriptHelpCommand || "", "none JSON Mac script help command");
  assertMacPowerPlanCommand(payload.macPowerPlanCommand || "", "none JSON Mac power plan command");
  assertMacRemoteAudioPlanCommand(payload.macRemoteAudioPlanCommand || "", "none JSON Mac remote audio plan command");
  assertMacInputSafetyPlanCommand(payload.macInputSafetyPlanCommand || "", "none JSON Mac input safety plan command");
  assertMacClientBrowserSelfTestCommand(
    extractMacClientBrowserSelfTestCommand(payload.boardSummary, "none board summary"),
    "none board summary Mac client browser self-test command",
  );
  assertMacScriptHelpCommand(
    extractMacScriptHelpCommand(payload.boardSummary, "none board summary"),
    "none board summary Mac script help command",
  );
  assertMacPowerPlanCommand(
    extractMacPowerPlanCommand(payload.boardSummary, "none board summary"),
    "none board summary Mac power plan command",
  );
  assertMacRemoteAudioPlanCommand(
    extractMacRemoteAudioPlanCommand(payload.boardSummary, "none board summary"),
    "none board summary Mac remote audio plan command",
  );
  assertMacInputSafetyPlanCommand(
    extractMacInputSafetyPlanCommand(payload.boardSummary, "none board summary"),
    "none board summary Mac input safety plan command",
  );
  console.log("[OK] Missing Windows host fails only when required and explains next step");
}

function checkScannerTimeoutProducesActionableSummary(tmp, args) {
  const result = run(["--json", "--requireFound", "--scanTimeoutMs", "1000"], args, {
    FAKE_SCANNER_ROOT: tmp,
    FAKE_WINDOWS_DISCOVERY_MODE: "hang",
  });
  assert(result.status !== 0, "scanner timeout with requireFound should exit non-zero");
  const payload = parseJson(result.stdout, "scanner timeout JSON");
  assert(payload.ok === false, "scanner timeout payload should be ok=false");
  assert(payload.found.length === 0, "scanner timeout payload should not invent Windows hosts");
  assert(payload.scanError?.reason === "timeout", `scanner timeout should expose a timeout reason: ${JSON.stringify(payload.scanError)}`);
  assertIncludes(payload.boardSummary, "ScannerWarning=timeout", "scanner timeout board summary");
  assertIncludes(payload.boardSummary, "Ask Windows Codex to start Windows host", "scanner timeout board summary");
  assertWindowsHostStatusCommand(payload.windowsHostStatusCommand || "", "scanner timeout JSON Windows host status command");
  assertWindowsHostReadinessCommand(payload.windowsHostReadinessCommand || "", "scanner timeout JSON Windows host readiness command");
  assertWindowsHostStatusCommand(
    extractWindowsHostStatusCommand(payload.boardSummary, "scanner timeout board summary"),
    "scanner timeout board summary Windows host status command",
  );
  assertWindowsHostReadinessCommand(
    extractWindowsHostReadinessCommand(payload.boardSummary, "scanner timeout board summary"),
    "scanner timeout board summary Windows host readiness command",
  );
  assertMacClientBrowserSelfTestCommand(
    payload.macClientBrowserSelfTestCommand || "",
    "scanner timeout JSON Mac client browser self-test command",
  );
  assertNotIncludes(`${result.stdout}\n${result.stderr}`, "LAN_DUAL_PASSWORD", "scanner timeout output");
  assertNotIncludes(`${result.stdout}\n${result.stderr}`, "--password", "scanner timeout output");
  assertNotIncludes(`${result.stdout}\n${result.stderr}`, "input_event", "scanner timeout output");
  console.log("[OK] Scanner timeout still prints actionable Windows host next steps");
}

async function checkBoardWindowsLanRisk(tmp, args) {
  const boardState = {
    updatedAt: "2026-06-18T12:58:23.345Z",
    statuses: {
      "Windows Codex": {
        status: "idle",
        note: "Windows readiness true summary WindowsLanRisk=no-firewall-allow,public-profile",
      },
    },
    events: [
      {
        id: "safe-risk",
        at: "2026-06-18T12:58:23.345Z",
        type: "message",
        from: "Windows Codex",
        text: "WindowsLanRisk=no-firewall-allow,public-profile",
      },
      {
        id: "unsafe-password-flag",
        at: "2026-06-18T12:58:24.345Z",
        type: "message",
        from: "Windows Codex",
        text: "Ignore unsafe candidate WindowsLanRisk=--password=sauce",
      },
      {
        id: "unsafe-env-password",
        at: "2026-06-18T12:58:25.345Z",
        type: "message",
        from: "Windows Codex",
        text: "Ignore unsafe candidate WindowsLanRisk=LAN_DUAL_PASSWORD=hunter2",
      },
    ],
  };
  await withBoardStateServer(args, boardState, async (serverUrl) => {
    const result = run([
      "--json",
      "--requireFound",
      "--checkBoard",
      "--server",
      serverUrl,
    ], args, {
      FAKE_SCANNER_ROOT: tmp,
      FAKE_WINDOWS_DISCOVERY_MODE: "none",
    });
    assert(result.status !== 0, `board risk JSON should still fail requireFound without a Windows host.\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "board risk JSON");
    assertWindowsLanRisk(payload, `${result.stdout}\n${result.stderr}`, "board risk JSON");
  });
  console.log("[OK] Board WindowsLanRisk is surfaced without leaking unsafe candidates");
}

async function checkBoardMacUnattendedFreshness(tmp, args) {
  const boardState = {
    updatedAt: "2026-06-19T08:10:00.000Z",
    statuses: {
      "Mac Heartbeat": {
        status: "online",
        note: "MacPowerHealth=warning reason=system-sleep-enabled warnings=system-sleep-enabled,display-sleep-enabled checkedAt=2026-06-19T08:09:00.000Z.",
      },
      "Mac Unattended": {
        status: "warning",
        note: "MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=launch-agent-not-loaded,power checkedAt=2026-01-01T00:00:00.000Z. MacPowerHealth=warning reason=system-sleep-enabled warnings=system-sleep-enabled,display-sleep-enabled checkedAt=2026-06-19T08:09:00.000Z.",
      },
    },
    events: [
      {
        id: "unsafe-password-flag",
        at: "2026-06-19T08:10:01.000Z",
        type: "message",
        from: "Mac Codex",
        text: "Ignore unsafe candidate MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=--password=sauce checkedAt=2026-06-19T08:10:00.000Z",
      },
    ],
  };
  await withBoardStateServer(args, boardState, async (serverUrl) => {
    const result = run([
      "--json",
      "--host",
      "192.168.31.68",
      "--checkBoard",
      "--server",
      serverUrl,
    ], args, {
      FAKE_SCANNER_ROOT: tmp,
      FAKE_WINDOWS_DISCOVERY_MODE: "found",
    });
    assert(result.status === 0, `board MacUnattendedFreshness JSON should exit 0.\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "board MacUnattendedFreshness JSON");
    assertMacUnattendedFreshness(payload, {
      status: "stale",
      checkedAt: "2026-01-01T00:00:00.000Z",
      thresholdMs: 600000,
      source: "MacUnattendedHealth",
    }, "board MacUnattendedFreshness JSON");
    assertIncludes(payload.boardSummary || "", "MacUnattendedFreshness=stale", "board MacUnattendedFreshness summary");
    assertIncludes(payload.boardSummary || "", "checkedAt=2026-01-01T00:00:00.000Z", "board MacUnattendedFreshness summary");
    assertIncludes(payload.boardSummary || "", "source=MacUnattendedHealth", "board MacUnattendedFreshness summary");
    assertNotIncludes(`${result.stdout}\n${result.stderr}`, "sauce", "board MacUnattendedFreshness output");
    assertNotIncludes(`${result.stdout}\n${result.stderr}`, "--password", "board MacUnattendedFreshness output");
  });
  console.log("[OK] Board MacUnattendedFreshness is surfaced without leaking unsafe candidates");
}

async function checkExplicitBoardPostsForScannerTimeout(tmp, args) {
  await withBoardStateServer(args, { statuses: {}, events: [] }, async (serverUrl, postLogPath) => {
    const readOnlyResult = run(["--server", serverUrl, "--checkBoard", "--json", "--requireFound", "--scanTimeoutMs", "1000"], args, {
      FAKE_SCANNER_ROOT: tmp,
      FAKE_WINDOWS_DISCOVERY_MODE: "hang",
    });
    assert(readOnlyResult.status !== 0, "read-only scanner timeout should still fail when requireFound is set");
    assert(readPostLog(postLogPath).length === 0, `read-only scanner timeout should not post: ${JSON.stringify(readPostLog(postLogPath))}`);

    const sendResult = run([
      "--server",
      serverUrl,
      "--checkBoard",
      "--json",
      "--requireFound",
      "--scanTimeoutMs",
      "1000",
      "--sendStatus",
      "--sendMessage",
    ], args, {
      FAKE_SCANNER_ROOT: tmp,
      FAKE_WINDOWS_DISCOVERY_MODE: "hang",
    });
    assert(sendResult.status !== 0, "scanner timeout with sendStatus should still fail when requireFound is set");
    const payload = parseJson(sendResult.stdout, "scanner timeout send JSON");
    assert(payload.scanError?.reason === "timeout", `send payload should preserve scan timeout reason: ${JSON.stringify(payload.scanError)}`);
    const posts = readPostLog(postLogPath);
    assert(posts.length === 2, `sendStatus/sendMessage should post two records: ${JSON.stringify(posts)}`);
    const statusPost = posts.find((post) => post.path === "/api/status");
    const messagePost = posts.find((post) => post.path === "/api/message");
    assert(statusPost, `missing /api/status post: ${JSON.stringify(posts)}`);
    assert(messagePost, `missing /api/message post: ${JSON.stringify(posts)}`);
    assert(statusPost.body.device === "Mac Client Discover Windows", `status device mismatch: ${JSON.stringify(statusPost.body)}`);
    assert(statusPost.body.role === "Mac 端", `status role mismatch: ${JSON.stringify(statusPost.body)}`);
    assert(statusPost.body.status === "windows-discovery-timeout", `status value mismatch: ${JSON.stringify(statusPost.body)}`);
    assertIncludes(statusPost.body.note, "ScannerWarning=timeout", "status note");
    assertIncludes(statusPost.body.note, "WindowsHostStatus=", "status note");
    assertIncludes(statusPost.body.note, "WindowsHostReadiness=", "status note");
    assert(messagePost.body.from === "Mac Codex", `message sender mismatch: ${JSON.stringify(messagePost.body)}`);
    assertIncludes(messagePost.body.text, "ScannerWarning=timeout", "message text");
    assertNotIncludes(`${sendResult.stdout}\n${sendResult.stderr}\n${JSON.stringify(posts)}`, "LAN_DUAL_PASSWORD", "scanner timeout send output");
    assertNotIncludes(`${sendResult.stdout}\n${sendResult.stderr}\n${JSON.stringify(posts)}`, "--password", "scanner timeout send output");
    assertNotIncludes(`${sendResult.stdout}\n${sendResult.stderr}\n${JSON.stringify(posts)}`, "input_event", "scanner timeout send output");
  });
  console.log("[OK] Explicit scanner-timeout status/message posts are secret-free");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  const tmp = mkdtempSync(join(tmpdir(), "lan-dual-discover-windows-hosts-"));
  try {
    makeFakeScanner(tmp);
    checkHelp(args);
    checkFoundJson(tmp, args);
    checkBoardSummaryFound(tmp, args);
    checkPlainFound(tmp, args);
    checkNoneRequireFound(tmp, args);
    checkScannerTimeoutProducesActionableSummary(tmp, args);
    await checkBoardWindowsLanRisk(tmp, args);
    await checkBoardMacUnattendedFreshness(tmp, args);
    await checkExplicitBoardPostsForScannerTimeout(tmp, args);
    console.log("[OK] Mac Windows host discovery self-test passed");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
