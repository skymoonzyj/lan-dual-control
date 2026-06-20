import { spawn } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const node = process.execPath;
const firewallScript = resolve(scriptDir, "check-windows-firewall.mjs");
const readinessScript = resolve(scriptDir, "check-windows-host-readiness.mjs");

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-firewall-health.mjs [options]

Options:
  --help, -h        Show this help without running checks

Description:
  Verifies Windows firewall health summaries distinguish a disabled Public
  firewall profile from a blocking LAN risk using local fixtures only.
  This test does not change firewall settings, request passwords, authenticate,
  or send input/inject events.
`);
}

const fixture = {
  lanAddresses: [
    {
      name: "Ethernet",
      address: "192.168.31.68",
      netmask: "255.255.255.0",
      cidr: "192.168.31.68/24",
      mac: "00:11:22:33:44:55",
    },
  ],
  probeResults: [
    { label: "loopback", host: "127.0.0.1", port: 43770, latencyMs: 1, ok: true, error: "" },
    { label: "Ethernet", host: "192.168.31.68", port: 43770, latencyMs: 2, ok: true, error: "" },
  ],
  networkState: {
    ok: true,
    skipped: false,
    listeners: [
      { localAddress: "0.0.0.0", localPort: 43770, owningProcess: 4242, processName: "node", processPath: "" },
    ],
    firewallProfiles: [
      { name: "Public", enabled: false, defaultInboundAction: "Block" },
      { name: "Private", enabled: true, defaultInboundAction: "Block" },
    ],
    networkProfiles: [
      { name: "Home LAN", interfaceAlias: "Ethernet", networkCategory: "Public", ipv4Connectivity: "Internet" },
    ],
    firewallRules: [],
  },
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runNode(label, args, extraEnv = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(node, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      rejectRun(new Error(`${label} timed out\n${stdout}\n${stderr}`));
    }, 30000);
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({ label, exitCode, stdout, stderr });
    });
  });
}

function parseJson(text, label) {
  try {
    return JSON.parse(String(text || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${text}`);
  }
}

function assertNoSecretLeak(text, label) {
  assert(!/(LAN_DUAL_PASSWORD\s*=|--password\b|password\s*[:=]\s*\S|token\s*[:=]\s*\S|secret\s*[:=]\s*\S)/i.test(String(text || "")), `${label} leaked secret-shaped text`);
}

function cmdQuotePath(value) {
  return String(value).replace(/"/g, '""');
}

async function makeFakeFfmpeg() {
  const dir = await mkdtemp(join(tmpdir(), "lan-dual-firewall-health-"));
  const ffmpegModule = join(dir, process.platform === "win32" ? "fake-ffmpeg.mjs" : "fake-ffmpeg");
  const ffmpegCmd = join(dir, "fake-ffmpeg.cmd");

  await writeFile(ffmpegModule, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes("-version")) {
  console.log("ffmpeg version fixture");
}
process.exit(0);
`, "utf8");
  await chmod(ffmpegModule, 0o755);

  if (process.platform === "win32") {
    await writeFile(
      ffmpegCmd,
      `@echo off\r\n"${cmdQuotePath(process.execPath)}" "${cmdQuotePath(ffmpegModule)}" %*\r\n`,
      "utf8",
    );
  }

  return {
    dir,
    command: process.platform === "win32" ? ffmpegCmd : ffmpegModule,
  };
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }

  const fakeFfmpeg = await makeFakeFfmpeg();
  const env = {
    LAN_DUAL_WINDOWS_FIREWALL_FIXTURE: JSON.stringify(fixture),
    LAN_DUAL_FFMPEG: fakeFfmpeg.command,
  };

  try {
    const firewall = await runNode("firewall fixture", [
      firewallScript,
      "--json",
      "--host",
      "0.0.0.0",
      "--port",
      "43770",
    ], env);
    assert(firewall.exitCode === 0, `firewall fixture failed with ${firewall.exitCode}\n${firewall.stdout}\n${firewall.stderr}`);
    assertNoSecretLeak(firewall.stdout + firewall.stderr, "firewall fixture output");
    const firewallPayload = parseJson(firewall.stdout, "firewall fixture");
    assert(firewallPayload.firewallHealth?.status === "nonblocking", `firewallHealth should be nonblocking: ${firewall.stdout}`);
    assert(firewallPayload.firewallHealth?.reason === "public-profile-firewall-disabled", `firewallHealth should explain disabled Public firewall: ${firewall.stdout}`);

    const readiness = await runNode("readiness firewall fixture", [
      readinessScript,
      "--json",
      "--host",
      "0.0.0.0",
      "--port",
      "43770",
      "--ffmpeg",
      fakeFfmpeg.command,
      "--timeoutMs",
      "8000",
      "--skipCurrentBuildCheck",
    ], env);
    assert(readiness.exitCode === 0, `readiness firewall fixture failed with ${readiness.exitCode}\n${readiness.stdout}\n${readiness.stderr}`);
    assertNoSecretLeak(readiness.stdout + readiness.stderr, "readiness firewall fixture output");
    const readinessPayload = parseJson(readiness.stdout, "readiness firewall fixture");
    assert(readinessPayload.windowsFirewallHealth?.status === "nonblocking", `readiness JSON should surface nonblocking firewall health: ${readiness.stdout}`);
    assert(readinessPayload.windowsFirewallHealth?.reason === "public-profile-firewall-disabled", `readiness JSON should surface disabled Public firewall reason: ${readiness.stdout}`);
    assert(
      String(readinessPayload.boardSummary || "").includes("WindowsFirewallHealth=nonblocking reason=public-profile-firewall-disabled"),
      `readiness boardSummary should include nonblocking firewall health: ${readinessPayload.boardSummary}`,
    );
  } finally {
    await rm(fakeFfmpeg.dir, { recursive: true, force: true });
  }

  console.log("[PASS] Windows firewall health distinguishes disabled Public firewall from blocking LAN risk.");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
