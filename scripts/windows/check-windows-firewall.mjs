import net from "node:net";
import os from "node:os";
import { spawnSync } from "node:child_process";

const defaults = {
  host: process.env.LAN_DUAL_HOST || "0.0.0.0",
  port: Number(process.env.LAN_DUAL_PORT) || 43770,
  timeoutMs: 700,
  ruleName: "LAN Dual Control Windows Host",
  json: false,
  requireOpen: false,
  requireRule: false,
  addRule: false,
  dryRunRule: false,
  skipFirewall: false,
  strict: false,
  ruleProfile: "Private",
};

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (
      key === "json" ||
      key === "requireOpen" ||
      key === "requireRule" ||
      key === "addRule" ||
      key === "dryRunRule" ||
      key === "skipFirewall" ||
      key === "strict"
    ) {
      args[key] = true;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(args, key) && next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    }
  }

  args.port = clampInteger(args.port, 1, 65535, defaults.port);
  args.timeoutMs = clampInteger(args.timeoutMs, 100, 5000, defaults.timeoutMs);
  args.host = String(args.host || defaults.host).trim();
  args.ruleName = String(args.ruleName || defaults.ruleName).trim();
  args.ruleProfile = normalizeRuleProfile(args.ruleProfile);
  return args;
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function print(kind, text, args) {
  if (args.json) return;
  console.log(`[${kind}] ${text}`);
}

function getLanAddresses() {
  const result = [];
  const interfaces = os.networkInterfaces();
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      if (!entry || entry.family !== "IPv4" || entry.internal) continue;
      if (entry.address.startsWith("169.254.")) continue;
      result.push({
        name,
        address: entry.address,
        netmask: entry.netmask,
        cidr: entry.cidr,
        mac: entry.mac,
      });
    }
  }
  return result;
}

function uniqueByAddress(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = item.address;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function getProbeTargets(args, lanAddresses) {
  const targets = [{ label: "loopback", host: "127.0.0.1" }];
  const normalizedHost = args.host.toLowerCase();
  if (normalizedHost === "0.0.0.0" || normalizedHost === "::" || normalizedHost === "*" || normalizedHost === "") {
    for (const entry of lanAddresses) {
      targets.push({ label: entry.name, host: entry.address });
    }
  } else if (normalizedHost !== "127.0.0.1" && normalizedHost !== "localhost") {
    targets.push({ label: "configured", host: args.host });
  }

  const seen = new Set();
  return targets.filter((target) => {
    if (seen.has(target.host)) return false;
    seen.add(target.host);
    return true;
  });
}

function probeTcp({ host, port, timeoutMs }) {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        host,
        port,
        latencyMs: Math.max(0, performance.now() - startedAt),
        ...result,
      });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ ok: true, error: "" }));
    socket.once("timeout", () => finish({ ok: false, error: `timeout after ${timeoutMs}ms` }));
    socket.once("error", (error) => finish({ ok: false, error: error.message }));
  });
}

function queryWindowsNetworkState(args) {
  if (process.platform !== "win32" || args.skipFirewall) {
    return {
      ok: process.platform === "win32",
      skipped: true,
      listeners: [],
      firewallProfiles: [],
      networkProfiles: [],
      firewallRules: [],
      error: process.platform === "win32" ? "" : "Windows firewall checks are only available on Windows.",
    };
  }

  const script = `
$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$targetPort = ${args.port}

function Test-PortList($ports, [int] $target) {
  foreach ($entry in @($ports)) {
    if ($null -eq $entry) { continue }
    foreach ($token in ([string] $entry).Split(",")) {
      $token = $token.Trim()
      if (-not $token) { continue }
      if ($token -eq "Any") { return $true }
      if ($token -match "^(\\d+)-(\\d+)$") {
        $start = [int] $Matches[1]
        $end = [int] $Matches[2]
        if ($target -ge $start -and $target -le $end) { return $true }
        continue
      }
      $number = 0
      if ([int]::TryParse($token, [ref] $number) -and $number -eq $target) { return $true }
    }
  }
  return $false
}

function Convert-Plain($value) {
  if ($null -eq $value) { return "" }
  return [string] $value
}

$listeners = @()
foreach ($connection in @(Get-NetTCPConnection -State Listen -LocalPort $targetPort -ErrorAction SilentlyContinue)) {
  $processName = ""
  $processPath = ""
  try {
    $process = Get-Process -Id $connection.OwningProcess -ErrorAction Stop
    $processName = $process.ProcessName
    $processPath = $process.Path
  } catch {}
  $listeners += [pscustomobject]@{
    localAddress = Convert-Plain $connection.LocalAddress
    localPort = [int] $connection.LocalPort
    owningProcess = [int] $connection.OwningProcess
    processName = $processName
    processPath = $processPath
  }
}

$firewallProfiles = @()
foreach ($profile in @(Get-NetFirewallProfile -ErrorAction SilentlyContinue)) {
  $firewallProfiles += [pscustomobject]@{
    name = Convert-Plain $profile.Name
    enabled = [bool] $profile.Enabled
    defaultInboundAction = Convert-Plain $profile.DefaultInboundAction
  }
}

$networkProfiles = @()
foreach ($profile in @(Get-NetConnectionProfile -ErrorAction SilentlyContinue)) {
  $networkProfiles += [pscustomobject]@{
    name = Convert-Plain $profile.Name
    interfaceAlias = Convert-Plain $profile.InterfaceAlias
    networkCategory = Convert-Plain $profile.NetworkCategory
    ipv4Connectivity = Convert-Plain $profile.IPv4Connectivity
  }
}

$firewallRules = @()
$seenRuleNames = @{}
$matchingPortFilters = @(Get-NetFirewallPortFilter -Protocol TCP -ErrorAction SilentlyContinue | Where-Object {
  Test-PortList $_.LocalPort $targetPort
})
foreach ($portFilter in $matchingPortFilters) {
  foreach ($rule in @(Get-NetFirewallRule -AssociatedNetFirewallPortFilter $portFilter -ErrorAction SilentlyContinue | Where-Object {
    $_.Direction -eq "Inbound" -and $_.Action -eq "Allow" -and $_.Enabled -eq "True"
  })) {
    if ($seenRuleNames.ContainsKey($rule.Name)) { continue }
    $seenRuleNames[$rule.Name] = $true
    $appFilters = @(Get-NetFirewallApplicationFilter -AssociatedNetFirewallRule $rule -ErrorAction SilentlyContinue)
    $addressFilters = @(Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $rule -ErrorAction SilentlyContinue)
    $programs = @($appFilters | ForEach-Object { Convert-Plain $_.Program } | Where-Object { $_ })
    if ($programs.Count -eq 0) { $programs = @("Any") }
    $remoteAddresses = @($addressFilters | ForEach-Object { Convert-Plain $_.RemoteAddress } | Where-Object { $_ })
    if ($remoteAddresses.Count -eq 0) { $remoteAddresses = @("Any") }
    $firewallRules += [pscustomobject]@{
      displayName = Convert-Plain $rule.DisplayName
      name = Convert-Plain $rule.Name
      profile = Convert-Plain $rule.Profile
      edgeTraversalPolicy = Convert-Plain $rule.EdgeTraversalPolicy
      protocol = Convert-Plain $portFilter.Protocol
      localPort = Convert-Plain $portFilter.LocalPort
      program = ($programs -join "; ")
      remoteAddress = ($remoteAddresses -join "; ")
    }
  }
}

[pscustomobject]@{
  ok = $true
  listeners = $listeners
  firewallProfiles = $firewallProfiles
  networkProfiles = $networkProfiles
  firewallRules = $firewallRules
} | ConvertTo-Json -Depth 6 -Compress
`;

  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ], {
    encoding: "utf8",
    timeout: 12000,
    windowsHide: true,
  });

  const stdout = (result.stdout || "").trim();
  const stderr = (result.stderr || "").trim();
  if (result.error || result.status !== 0) {
    return {
      ok: false,
      skipped: false,
      listeners: [],
      firewallProfiles: [],
      networkProfiles: [],
      firewallRules: [],
      error: result.error?.message || stderr || `powershell exited with ${result.status}`,
    };
  }
  try {
    return JSON.parse(stdout || "{}");
  } catch {
    return {
      ok: false,
      skipped: false,
      listeners: [],
      firewallProfiles: [],
      networkProfiles: [],
      firewallRules: [],
      error: stderr || stdout || "empty Windows firewall query response",
    };
  }
}

function isLanListener(listener) {
  const address = String(listener.localAddress || "").toLowerCase();
  return address === "0.0.0.0" || address === "::" || address === "[::]" || address === "";
}

function normalizeRuleProfile(value) {
  const normalized = String(value || defaults.ruleProfile).trim();
  const allowed = new Set(["Any", "Domain", "Private", "Public"]);
  const title = normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
  return allowed.has(title) ? title : defaults.ruleProfile;
}

function addWindowsFirewallRule(args) {
  const command = suggestedRuleCommand(args);
  if (process.platform !== "win32") {
    return {
      ok: false,
      skipped: true,
      dryRun: false,
      command,
      error: "Windows firewall rules can only be added on Windows.",
    };
  }
  if (args.dryRunRule) {
    return {
      ok: true,
      skipped: true,
      dryRun: true,
      command,
      error: "",
    };
  }

  const script = `$ErrorActionPreference = "Stop"; ${command} | Out-Null`;
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ], {
    encoding: "utf8",
    timeout: 12000,
    windowsHide: true,
  });

  const stderr = (result.stderr || "").trim();
  if (result.error || result.status !== 0) {
    return {
      ok: false,
      skipped: false,
      dryRun: false,
      command,
      error: result.error?.message || stderr || `powershell exited with ${result.status}`,
    };
  }
  return {
    ok: true,
    skipped: false,
    dryRun: false,
    command,
    error: "",
  };
}

function formatListener(listener) {
  const processText = listener.processName
    ? `${listener.processName} pid=${listener.owningProcess}`
    : `pid=${listener.owningProcess}`;
  return `${listener.localAddress}:${listener.localPort} (${processText})`;
}

function formatFirewallRule(rule) {
  const profile = rule.profile || "Any";
  const program = rule.program && rule.program !== "Any" ? `, program=${rule.program}` : "";
  return `${rule.displayName || rule.name} (profile=${profile}, port=${rule.localPort}${program})`;
}

function hasBlockingFirewallProfile(networkState) {
  return (networkState.firewallProfiles || []).some((profile) => {
    return profile.enabled && String(profile.defaultInboundAction || "").toLowerCase() === "block";
  });
}

function suggestedRuleCommand(args) {
  const displayName = `${args.ruleName} ${args.port}`;
  return `New-NetFirewallRule -DisplayName '${escapePowerShellSingle(displayName)}' -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${args.port} -Profile ${args.ruleProfile}`;
}

function escapePowerShellSingle(value) {
  return String(value).replace(/'/g, "''");
}

function analyze({ args, lanAddresses, probeResults, networkState }) {
  const warnings = [];
  const errors = [];
  const recommendations = [];
  const listeners = networkState.listeners || [];
  const rules = networkState.firewallRules || [];

  if (lanAddresses.length === 0) {
    warnings.push("No non-loopback IPv4 LAN address was detected.");
  }

  if (listeners.length === 0) {
    warnings.push(`No local TCP listener was found on port ${args.port}. Start Windows host before LAN testing.`);
    recommendations.push(`Start Windows host with: node apps\\windows-host\\server.mjs ${args.port} 0.0.0.0`);
  } else if (!listeners.some(isLanListener)) {
    warnings.push(`Port ${args.port} is listening, but not on 0.0.0.0. Other LAN devices may not reach it.`);
    recommendations.push(`Start Windows host with LAN binding: node apps\\windows-host\\server.mjs ${args.port} 0.0.0.0`);
  }

  if (probeResults.length > 0 && !probeResults.some((result) => result.ok)) {
    warnings.push(`No TCP probe reached ${args.port}.`);
  }
  if (args.requireOpen && !probeResults.some((result) => result.ok)) {
    errors.push(`Required TCP open check failed for port ${args.port}.`);
  }

  const lanProbeResults = probeResults.filter((result) => result.host !== "127.0.0.1");
  if (lanProbeResults.length > 0 && !lanProbeResults.some((result) => result.ok)) {
    warnings.push(`LAN address probes did not reach port ${args.port}; firewall or bind address is likely blocking access.`);
  }

  if (!networkState.skipped && !networkState.ok) {
    warnings.push(`Windows firewall query failed: ${networkState.error}`);
  }

  if (!networkState.skipped && networkState.ok) {
    const publicProfiles = (networkState.networkProfiles || []).filter((profile) => {
      return String(profile.networkCategory || "").toLowerCase() === "public";
    });
    if (publicProfiles.length > 0) {
      warnings.push(`Current network profile is Public on ${publicProfiles.map((profile) => profile.interfaceAlias || profile.name).join(", ")}.`);
      recommendations.push("For a trusted home LAN, set the network profile to Private before opening inbound remote-control ports.");
    }

    if (hasBlockingFirewallProfile(networkState) && rules.length === 0) {
      warnings.push(`No enabled inbound allow rule for TCP ${args.port} was found.`);
      recommendations.push(`Admin PowerShell suggestion: ${suggestedRuleCommand(args)}`);
    }

    if (args.requireRule && rules.length === 0) {
      errors.push(`Required firewall allow rule for TCP ${args.port} was not found.`);
    }
  }

  if (args.strict && warnings.length > 0) {
    errors.push("Strict mode treats warnings as failures.");
  }

  return {
    ok: errors.length === 0,
    warnings,
    errors,
    recommendations,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const lanAddresses = uniqueByAddress(getLanAddresses());
  const probeTargets = getProbeTargets(args, lanAddresses);
  const probeResults = [];

  for (const target of probeTargets) {
    const result = await probeTcp({ host: target.host, port: args.port, timeoutMs: args.timeoutMs });
    probeResults.push({ label: target.label, ...result });
  }

  let networkState = queryWindowsNetworkState(args);
  let firewallRuleAction = null;
  if (
    !args.skipFirewall &&
    (args.addRule || args.dryRunRule) &&
    (!networkState.ok || (networkState.firewallRules || []).length === 0)
  ) {
    firewallRuleAction = addWindowsFirewallRule(args);
    if (args.addRule && firewallRuleAction.ok && !firewallRuleAction.dryRun) {
      networkState = queryWindowsNetworkState(args);
    }
  }
  const summary = analyze({ args, lanAddresses, probeResults, networkState });
  if (firewallRuleAction && args.addRule && !firewallRuleAction.ok) {
    summary.ok = false;
    summary.errors.push(`Failed to add firewall rule: ${firewallRuleAction.error}`);
  }

  if (args.json) {
    console.log(JSON.stringify({
      ok: summary.ok,
      args,
      lanAddresses,
      probeResults,
      listeners: networkState.listeners || [],
      firewallProfiles: networkState.firewallProfiles || [],
      networkProfiles: networkState.networkProfiles || [],
      firewallRules: networkState.firewallRules || [],
      firewallRuleAction,
      warnings: summary.warnings,
      errors: summary.errors,
      recommendations: summary.recommendations,
    }, null, 2));
  } else {
    print("INFO", `Windows host LAN check target: ${args.host}:${args.port}`, args);
    if (lanAddresses.length > 0) {
      for (const entry of lanAddresses) {
        print("OK", `LAN IPv4: ${entry.name} ${entry.address}${entry.cidr ? ` (${entry.cidr})` : ""}`, args);
      }
    } else {
      print("WARN", "No LAN IPv4 address detected.", args);
    }

    const listeners = networkState.listeners || [];
    if (listeners.length > 0) {
      for (const listener of listeners) {
        print(isLanListener(listener) ? "OK" : "WARN", `Listener: ${formatListener(listener)}`, args);
      }
    } else if (!networkState.skipped) {
      print("WARN", `No local listener found on TCP ${args.port}.`, args);
    }

    for (const result of probeResults) {
      const status = result.ok ? "OK" : "WARN";
      const suffix = result.ok ? `${result.latencyMs.toFixed(1)}ms` : result.error;
      print(status, `TCP probe ${result.label} ${result.host}:${result.port} ${result.ok ? "open" : "closed"} (${suffix})`, args);
    }

    if (networkState.skipped) {
      print("INFO", networkState.error || "Windows firewall query skipped.", args);
    } else if (!networkState.ok) {
      print("WARN", `Firewall query failed: ${networkState.error}`, args);
    } else {
      for (const profile of networkState.networkProfiles || []) {
        print("INFO", `Network profile: ${profile.interfaceAlias || profile.name} ${profile.networkCategory || "Unknown"} / ${profile.ipv4Connectivity || "unknown"}`, args);
      }
      for (const profile of networkState.firewallProfiles || []) {
        const status = profile.enabled && String(profile.defaultInboundAction || "").toLowerCase() === "block" ? "INFO" : "OK";
        print(status, `Firewall profile: ${profile.name} enabled=${profile.enabled} inbound=${profile.defaultInboundAction}`, args);
      }
      if ((networkState.firewallRules || []).length > 0) {
        for (const rule of networkState.firewallRules) {
          print("OK", `Firewall allow rule: ${formatFirewallRule(rule)}`, args);
        }
      } else {
        print("WARN", `No enabled inbound allow rule found for TCP ${args.port}.`, args);
      }
    }

    if (firewallRuleAction?.dryRun) {
      print("INFO", `Dry run firewall rule command: ${firewallRuleAction.command}`, args);
    } else if (firewallRuleAction && firewallRuleAction.ok) {
      print("OK", `Firewall allow rule added: ${firewallRuleAction.command}`, args);
    } else if (firewallRuleAction && !firewallRuleAction.ok) {
      print("ERROR", `Failed to add firewall rule: ${firewallRuleAction.error}`, args);
      print("INFO", `Admin PowerShell suggestion: ${firewallRuleAction.command}`, args);
    }

    for (const warning of summary.warnings) {
      print("WARN", warning, args);
    }
    for (const error of summary.errors) {
      print("ERROR", error, args);
    }
    for (const recommendation of summary.recommendations) {
      print("INFO", recommendation, args);
    }
    print(summary.ok ? "OK" : "ERROR", summary.ok ? "Windows host LAN/firewall check finished." : "Windows host LAN/firewall check failed.", args);
  }

  process.exit(summary.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(`[ERROR] ${error.stack || error.message}`);
  process.exit(1);
});
