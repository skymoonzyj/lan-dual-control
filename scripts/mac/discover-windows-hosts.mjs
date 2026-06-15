#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  port: 43770,
  timeoutMs: 650,
  concurrency: 64,
  maxHostsPerSubnet: 254,
  requireFound: false,
  noLocalSubnets: false,
  json: false,
  boardSummary: false,
  verbose: false,
  scanTimeoutMs: 0,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/discover-windows-hosts.mjs [options]

Finds Windows LAN dual-control host /discovery endpoints from the Mac side.
This is read-only: it does not authenticate, connect WebSocket, ask for a
password, send input, or execute inject.

Options:
  --port <port>           Discovery port. Can be repeated. Default: ${defaults.port}
  --host <host>           Direct host to probe. Can be repeated.
  --subnet <cidr>         IPv4 subnet to scan, for example 192.168.31.0/24. Can be repeated.
  --timeoutMs <ms>        Per-host HTTP timeout. Default: ${defaults.timeoutMs}
  --scanTimeoutMs <ms>    Overall scanner timeout. Default: auto, at least 30s
  --concurrency <n>       Parallel probe count. Default: ${defaults.concurrency}
  --maxHostsPerSubnet <n> Safety cap per subnet. Default: ${defaults.maxHostsPerSubnet}
  --requireFound          Exit non-zero when no Windows host is found.
  --noLocalSubnets        Only probe 127.0.0.1, --host, and --subnet targets.
  --boardSummary          Print a short secret-free Agent Link Board summary.
  --json                  Print one machine-readable JSON object.
  --verbose               Include scanner misses.
  --help, -h              Show this help without scanning.

Examples:
  node scripts/mac/discover-windows-hosts.mjs --boardSummary
  node scripts/mac/discover-windows-hosts.mjs --subnet 192.168.31.0/24 --requireFound
  node scripts/mac/discover-windows-hosts.mjs --host 192.168.31.68 --json
`);
}

function parseArgs(argv) {
  const args = {
    ports: [],
    hosts: [],
    subnets: [],
    timeoutMs: defaults.timeoutMs,
    scanTimeoutMs: defaults.scanTimeoutMs,
    concurrency: defaults.concurrency,
    maxHostsPerSubnet: defaults.maxHostsPerSubnet,
    requireFound: defaults.requireFound,
    noLocalSubnets: defaults.noLocalSubnets,
    json: defaults.json,
    boardSummary: defaults.boardSummary,
    verbose: defaults.verbose,
    help: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--json" || token === "--boardSummary" || token === "--verbose" || token === "--requireFound" || token === "--noLocalSubnets") {
      args[token.slice(2)] = true;
      continue;
    }
    if (token === "--port" && next && !next.startsWith("--")) {
      args.ports.push(clampInteger(next, 1, 65535, defaults.port));
      index += 1;
      continue;
    }
    if (token === "--host" && next && !next.startsWith("--")) {
      args.hosts.push(next.trim());
      index += 1;
      continue;
    }
    if (token === "--subnet" && next && !next.startsWith("--")) {
      args.subnets.push(next.trim());
      index += 1;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampInteger(next, 100, 5000, defaults.timeoutMs);
      index += 1;
      continue;
    }
    if (token === "--scanTimeoutMs" && next && !next.startsWith("--")) {
      args.scanTimeoutMs = clampInteger(next, 1000, 300000, defaults.scanTimeoutMs);
      index += 1;
      continue;
    }
    if (token === "--concurrency" && next && !next.startsWith("--")) {
      args.concurrency = clampInteger(next, 1, 256, defaults.concurrency);
      index += 1;
      continue;
    }
    if (token === "--maxHostsPerSubnet" && next && !next.startsWith("--")) {
      args.maxHostsPerSubnet = clampInteger(next, 1, 1024, defaults.maxHostsPerSubnet);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (args.ports.length === 0) {
    args.ports.push(defaults.port);
  }
  args.hosts = [...new Set(args.hosts.filter(Boolean))];
  args.subnets = [...new Set(args.subnets.filter(Boolean))];
  return args;
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function scannerArgs(args) {
  const result = [
    process.env.LAN_DUAL_DISCOVER_LAN_HOSTS_SCRIPT || "scripts/windows/discover-lan-hosts.mjs",
    "--json",
    "--timeoutMs",
    String(args.timeoutMs),
    "--concurrency",
    String(args.concurrency),
    "--maxHostsPerSubnet",
    String(args.maxHostsPerSubnet),
  ];
  for (const port of args.ports) {
    result.push("--port", String(port));
  }
  for (const host of args.hosts) {
    result.push("--host", host);
  }
  for (const subnet of args.subnets) {
    result.push("--subnet", subnet);
  }
  if (args.noLocalSubnets) {
    result.push("--noLocalSubnets");
  }
  if (args.verbose) {
    result.push("--verbose");
  }
  return result;
}

function runScanner(args) {
  const estimatedSubnetCandidates = Math.max(1, args.hosts.length + (args.subnets.length || 1) * args.maxHostsPerSubnet);
  const estimatedWaves = Math.max(1, Math.ceil((estimatedSubnetCandidates * args.ports.length) / Math.max(args.concurrency, 1)));
  const autoTimeoutBudgetMs = Math.min(180000, Math.max(30000, args.timeoutMs * (estimatedWaves + 8) + 12000));
  const timeoutBudgetMs = args.scanTimeoutMs || autoTimeoutBudgetMs;
  const result = spawnSync(process.execPath, scannerArgs(args), {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: timeoutBudgetMs,
    maxBuffer: 12 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
    },
  });
  if (result.error) {
    throw new Error(`LAN discovery scanner failed: ${result.error.message}`);
  }
  const stdout = String(result.stdout || "").trim();
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`LAN discovery scanner did not print valid JSON: ${error.message}\n${stdout}\n${result.stderr || ""}`);
  }
}

function isWindowsHost(item) {
  return String(item?.platform || "").toLowerCase() === "windows";
}

function summarizeHost(item) {
  const runtime = item.runtime?.buildId ? ` build=${item.runtime.buildId}` : "";
  const name = item.deviceName || "Windows host";
  const mode = item.capabilities?.input?.mode || item.capabilities?.inputMode || "";
  const input = mode ? ` input=${mode}` : "";
  return `${name} at ${item.host}:${item.port}${runtime}${input}`;
}

function readinessCommand(item) {
  return `node scripts/mac/check-mac-client-formal-status.mjs --host ${item.host} --port ${item.port} --boardSummary`;
}

function buildReport(scan, args) {
  const found = Array.isArray(scan.found) ? scan.found : [];
  const windowsHosts = found.filter(isWindowsHost);
  const nonWindowsHosts = found.filter((item) => !isWindowsHost(item));
  const best = windowsHosts[0] || null;
  const report = {
    ok: windowsHosts.length > 0 || !args.requireFound,
    found: windowsHosts,
    ignored: nonWindowsHosts,
    best,
    scanned: scan.scanned || 0,
    ports: scan.ports || args.ports,
    subnets: scan.subnets || [],
    nextCommand: best ? readinessCommand(best) : "",
    boardSummary: "",
  };
  report.boardSummary = makeBoardSummary(report);
  return report;
}

function makeBoardSummary(report) {
  if (report.best) {
    return `Windows host discovery: found ${report.found.length}; best=${summarizeHost(report.best)}. Next Mac formal check: ${report.nextCommand}. No password was requested or sent; no WebSocket/input/inject was attempted.`;
  }
  const ignored = report.ignored.length > 0
    ? ` Saw ${report.ignored.length} non-Windows host(s), likely Mac/self.`
    : "";
  return `Windows host discovery: no Windows host found after scanning ${report.scanned} candidate(s).${ignored} Ask Windows Codex to start Windows host and share IP/port, then rerun Mac formal check. No password was requested or sent; no WebSocket/input/inject was attempted.`;
}

function printText(report, args) {
  if (report.found.length > 0) {
    console.log(`[OK] Found ${report.found.length} Windows host candidate(s).`);
    for (const item of report.found) {
      console.log(`[OK] ${summarizeHost(item)}`);
    }
    console.log(`[INFO] Next: ${report.nextCommand}`);
  } else {
    console.log("[WARN] No Windows LAN dual-control host was found.");
    if (report.ignored.length > 0) {
      for (const item of report.ignored.slice(0, 6)) {
        console.log(`[INFO] Ignored non-Windows host: ${summarizeHost(item)} platform=${item.platform || "unknown"}`);
      }
    }
    console.log("[INFO] Ask Windows Codex to start Windows host, then rerun this discovery or check-mac-client-formal-status with the Windows IP.");
  }
  if (args.verbose && Array.isArray(report.subnets)) {
    for (const subnet of report.subnets) {
      const iface = subnet.interfaceAddress ? ` via ${subnet.interfaceName} ${subnet.interfaceAddress}` : "";
      console.log(`[INFO] Scanned subnet ${subnet.network}/${subnet.prefix}${iface}`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || helpRequested(process.argv)) {
    printHelp();
    return;
  }

  const scan = runScanner(args);
  const report = buildReport(scan, args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printText(report, args);
  }
  process.exitCode = report.ok ? 0 : 1;
}

try {
  main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
}
