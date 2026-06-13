import os from "node:os";

const defaults = {
  port: 43770,
  timeoutMs: 650,
  concurrency: 64,
  maxHostsPerSubnet: 254,
  json: false,
  verbose: false,
  requireFound: false,
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/discover-lan-hosts.mjs [options]

Options:
  --port <port>           Discovery port. Can be repeated. Default: ${defaults.port}
  --host <host>           Direct host to probe. Can be repeated.
  --subnet <cidr>         IPv4 subnet to scan, for example 192.168.31.0/24. Can be repeated.
  --timeoutMs <ms>        Per-host HTTP timeout, 100-5000. Default: ${defaults.timeoutMs}
  --concurrency <n>       Parallel probe count, 1-256. Default: ${defaults.concurrency}
  --maxHostsPerSubnet <n> Safety cap per subnet, 1-1024. Default: ${defaults.maxHostsPerSubnet}
  --requireFound          Exit non-zero when no LAN dual-control host is found.
  --json                  Print machine-readable JSON summary.
  --verbose               Include failed probe details in JSON and text output.
  --help, -h              Show this help without scanning.

Description:
  Scans local IPv4 LAN ranges for /discovery endpoints exposed by Mac or Windows
  LAN dual-control hosts. It does not authenticate, connect WebSocket, send input,
  or change any system setting.

Examples:
  node scripts/windows/discover-lan-hosts.mjs
  node scripts/windows/discover-lan-hosts.mjs --subnet 192.168.31.0/24 --requireFound
  node scripts/windows/discover-lan-hosts.mjs --host 192.168.31.122 --port 43770 --json
`);
}

function parseArgs(argv) {
  const args = {
    ports: [],
    hosts: [],
    subnets: [],
    timeoutMs: defaults.timeoutMs,
    concurrency: defaults.concurrency,
    maxHostsPerSubnet: defaults.maxHostsPerSubnet,
    json: defaults.json,
    verbose: defaults.verbose,
    requireFound: defaults.requireFound,
    help: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--verbose") {
      args.verbose = true;
      continue;
    }
    if (token === "--requireFound") {
      args.requireFound = true;
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
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function print(kind, text, args) {
  if (!args.json) {
    console.log(`[${kind}] ${text}`);
  }
}

function ipv4ToInt(address) {
  const parts = String(address).split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function intToIpv4(value) {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join(".");
}

function prefixLengthFromNetmask(netmask) {
  const numeric = ipv4ToInt(netmask);
  if (numeric === null) {
    return 24;
  }
  let prefix = 0;
  for (let bit = 31; bit >= 0; bit -= 1) {
    if ((numeric & (1 << bit)) !== 0) {
      prefix += 1;
    } else {
      break;
    }
  }
  return Math.max(0, Math.min(32, prefix));
}

function normalizeSubnet(value, maxHostsPerSubnet) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  const [addressPart, prefixPart] = raw.includes("/") ? raw.split("/", 2) : [`${raw}.0`, "24"];
  const address = ipv4ToInt(addressPart);
  if (address === null) {
    return null;
  }

  const requestedPrefix = clampInteger(prefixPart, 1, 30, 24);
  const requestedHostCount = Math.max(0, (2 ** (32 - requestedPrefix)) - 2);
  const prefix = requestedHostCount > maxHostsPerSubnet ? 24 : requestedPrefix;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = address & mask;
  const broadcast = network | (~mask >>> 0);
  return {
    input: raw,
    prefix,
    network,
    broadcast,
    clamped: prefix !== requestedPrefix,
  };
}

function getLocalSubnets(maxHostsPerSubnet) {
  const subnets = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (!entry || entry.family !== "IPv4" || entry.internal) {
        continue;
      }
      if (String(entry.address).startsWith("169.254.")) {
        continue;
      }
      const prefix = prefixLengthFromNetmask(entry.netmask);
      const subnet = normalizeSubnet(`${entry.address}/${prefix}`, maxHostsPerSubnet);
      if (subnet) {
        subnets.push({
          ...subnet,
          interfaceName: name,
          interfaceAddress: entry.address,
        });
      }
    }
  }
  return subnets;
}

function hostsForSubnet(subnet) {
  const hosts = [];
  for (let value = subnet.network + 1; value < subnet.broadcast; value += 1) {
    hosts.push(intToIpv4(value >>> 0));
  }
  return hosts;
}

function makeCandidates(args) {
  const hostSet = new Set(["127.0.0.1", ...args.hosts]);
  const subnetSources = [
    ...getLocalSubnets(args.maxHostsPerSubnet),
    ...args.subnets.map((item) => normalizeSubnet(item, args.maxHostsPerSubnet)).filter(Boolean),
  ];

  const seenSubnets = new Set();
  for (const subnet of subnetSources) {
    const key = `${subnet.network}/${subnet.prefix}`;
    if (seenSubnets.has(key)) {
      continue;
    }
    seenSubnets.add(key);
    for (const host of hostsForSubnet(subnet)) {
      hostSet.add(host);
    }
  }

  const candidates = [];
  for (const host of hostSet) {
    for (const port of args.ports) {
      candidates.push({ host, port });
    }
  }

  return {
    candidates,
    subnets: subnetSources.map((subnet) => ({
      input: subnet.input,
      prefix: subnet.prefix,
      network: intToIpv4(subnet.network >>> 0),
      broadcast: intToIpv4(subnet.broadcast >>> 0),
      interfaceName: subnet.interfaceName || "",
      interfaceAddress: subnet.interfaceAddress || "",
      clamped: Boolean(subnet.clamped),
    })),
  };
}

async function fetchDiscovery(candidate, timeoutMs) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://${candidate.host}:${candidate.port}/discovery`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (payload?.type !== "lan_dual_discovery") {
      throw new Error(`unexpected discovery type ${payload?.type || "missing"}`);
    }
    const host = payload.host && payload.host !== "0.0.0.0" ? String(payload.host) : candidate.host;
    const port = String(payload.controlPort ?? payload.port ?? candidate.port);
    return {
      ok: true,
      host,
      port,
      probeHost: candidate.host,
      probePort: candidate.port,
      latencyMs: Math.round(performance.now() - startedAt),
      deviceId: payload.deviceId || "",
      deviceName: payload.deviceName || payload.hostName || "",
      platform: payload.platform || "",
      role: payload.role || "",
      runtime: payload.runtime || null,
      capabilities: payload.capabilities || {},
      lastSeenAt: payload.lastSeenAt || "",
    };
  } catch (error) {
    return {
      ok: false,
      host: candidate.host,
      port: String(candidate.port),
      latencyMs: Math.round(performance.now() - startedAt),
      error: error?.name === "AbortError" ? `timeout after ${timeoutMs}ms` : error?.message || String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function hostKey(item) {
  return `${item.host}:${item.port}`;
}

function dedupeFound(found) {
  const byKey = new Map();
  for (const item of found) {
    const key = hostKey(item);
    if (!byKey.has(key) || item.latencyMs < byKey.get(key).latencyMs) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()].sort((left, right) => {
    const platformRank = { macos: 0, windows: 1 };
    const rankDelta = (platformRank[left.platform] ?? 9) - (platformRank[right.platform] ?? 9);
    if (rankDelta !== 0) {
      return rankDelta;
    }
    return left.latencyMs - right.latencyMs;
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const { candidates, subnets } = makeCandidates(args);
  print("INFO", `Scanning ${candidates.length} host/port candidate(s) on port(s) ${args.ports.join(", ")}`, args);
  for (const subnet of subnets) {
    const note = subnet.clamped ? " (clamped to /24 safety scan)" : "";
    const iface = subnet.interfaceAddress ? ` via ${subnet.interfaceName} ${subnet.interfaceAddress}` : "";
    print("INFO", `Subnet ${subnet.network}/${subnet.prefix}${iface}${note}`, args);
  }

  const rawResults = await runWithConcurrency(candidates, args.concurrency, (candidate) =>
    fetchDiscovery(candidate, args.timeoutMs),
  );
  const found = dedupeFound(rawResults.filter((result) => result.ok));
  const failed = rawResults.filter((result) => !result.ok);
  const ok = found.length > 0 || !args.requireFound;

  if (args.json) {
    console.log(JSON.stringify({
      ok,
      found,
      scanned: candidates.length,
      ports: args.ports,
      subnets,
      failed: args.verbose ? failed : undefined,
    }, null, 2));
  } else if (found.length > 0) {
    for (const item of found) {
      const runtime = item.runtime?.buildId ? ` build=${item.runtime.buildId}` : "";
      print(
        "OK",
        `${item.deviceName || "LAN dual-control host"} at ${item.host}:${item.port} (${item.platform || "unknown"} ${item.role || "host"}, ${item.latencyMs}ms${runtime})`,
        args,
      );
    }
  } else {
    print("WARN", "No LAN dual-control /discovery endpoint was found.", args);
    print("INFO", "Confirm the host is running, both devices are on the same LAN, and the firewall allows the port.", args);
  }

  if (!args.json && args.verbose) {
    for (const item of failed.slice(0, 80)) {
      print("MISS", `${item.host}:${item.port} ${item.error}`, args);
    }
  }

  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
