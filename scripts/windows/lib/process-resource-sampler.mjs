import { spawn } from "node:child_process";
import { cpus } from "node:os";

const logicalProcessorCount = Math.max(1, cpus().length || 1);

export function isLikelyLocalHost(host) {
  const normalized = String(host || "").trim().toLowerCase();
  return normalized === "" ||
    normalized === "localhost" ||
    normalized === "0.0.0.0" ||
    normalized === "127.0.0.1" ||
    normalized === "::1";
}

export function startProcessResourceSampling({
  pid,
  intervalMs = 1000,
  includeTree = true,
  enabled = true,
  timeoutMs = 3000,
} = {}) {
  const rootPid = Number(pid) || 0;
  const samples = [];
  const errors = [];
  const safeIntervalMs = Math.max(250, Number(intervalMs) || 1000);
  let stopped = false;
  let timer = null;
  let currentSample = null;

  async function collect() {
    if (stopped || currentSample) return;
    currentSample = sampleProcessResources(rootPid, { includeTree, timeoutMs })
      .then((processes) => {
        samples.push({
          at: new Date().toISOString(),
          atMs: performance.now(),
          processes,
          totals: summarizeProcessList(processes),
        });
      })
      .catch((error) => {
        errors.push(error.message || String(error));
      })
      .finally(() => {
        currentSample = null;
        if (!stopped) {
          timer = setTimeout(collect, safeIntervalMs);
          timer.unref?.();
        }
      });
    await currentSample;
  }

  if (enabled && rootPid > 0 && process.platform === "win32") {
    collect();
  } else {
    errors.push(rootPid > 0
      ? "process resource sampling is only available on Windows"
      : "process resource sampling needs a local process id");
  }

  return {
    async stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (currentSample) {
        await currentSample.catch(() => {});
      }
      return summarizeResourceSamples(samples, {
        rootPid,
        includeTree,
        intervalMs: safeIntervalMs,
        errors,
      });
    },
  };
}

async function sampleProcessResources(rootPid, { includeTree, timeoutMs }) {
  if (!rootPid) return [];
  const script = makeProcessSampleScript(rootPid, includeTree);
  const stdout = await runPowerShell(script, timeoutMs);
  const parsed = JSON.parse(stdout || "[]");
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .map((row) => ({
      pid: Number(row.pid) || 0,
      parentPid: Number(row.parentPid) || 0,
      name: String(row.name || ""),
      cpuSeconds: Number(row.cpuSeconds) || 0,
      workingSetBytes: Number(row.workingSetBytes) || 0,
      privateBytes: Number(row.privateBytes) || 0,
      handleCount: Number(row.handleCount) || 0,
      threadCount: Number(row.threadCount) || 0,
    }))
    .filter((row) => row.pid > 0);
}

function makeProcessSampleScript(rootPid, includeTree) {
  const includeTreeLiteral = includeTree ? "$true" : "$false";
  return `
$ErrorActionPreference = 'Stop'
$rootPid = ${Math.trunc(rootPid)}
$includeTree = ${includeTreeLiteral}
$ids = New-Object 'System.Collections.Generic.HashSet[int]'
[void]$ids.Add([int]$rootPid)
if ($includeTree) {
  try {
    $processInfos = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId
  } catch {
    $processInfos = Get-WmiObject Win32_Process | Select-Object ProcessId,ParentProcessId
  }
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($processInfo in $processInfos) {
      $childPid = [int]$processInfo.ProcessId
      $parentPid = [int]$processInfo.ParentProcessId
      if ($ids.Contains($parentPid) -and -not $ids.Contains($childPid)) {
        [void]$ids.Add($childPid)
        $changed = $true
      }
    }
  }
}
$result = foreach ($id in $ids) {
  $process = Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($null -ne $process) {
    $cpuSeconds = 0.0
    if ($null -ne $process.CPU) { $cpuSeconds = [double]$process.CPU }
    [pscustomobject]@{
      pid = [int]$process.Id
      parentPid = 0
      name = [string]$process.ProcessName
      cpuSeconds = $cpuSeconds
      workingSetBytes = [int64]$process.WorkingSet64
      privateBytes = [int64]$process.PrivateMemorySize64
      handleCount = [int]$process.HandleCount
      threadCount = [int]$process.Threads.Count
    }
  }
}
$json = @($result) | ConvertTo-Json -Compress -Depth 4
if ($null -eq $json -or $json -eq '') { '[]' } else { $json }
`;
}

function runPowerShell(script, timeoutMs) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      rejectRun(new Error(`resource sampler PowerShell timed out after ${timeoutMs} ms`));
    }, Math.max(1000, Number(timeoutMs) || 3000));

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolveRun(stdout.trim());
        return;
      }
      rejectRun(new Error(`resource sampler PowerShell exited ${code}${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

function summarizeProcessList(processes) {
  return {
    processCount: processes.length,
    cpuSeconds: sum(processes, "cpuSeconds"),
    workingSetBytes: sum(processes, "workingSetBytes"),
    privateBytes: sum(processes, "privateBytes"),
    handleCount: sum(processes, "handleCount"),
    threadCount: sum(processes, "threadCount"),
  };
}

function summarizeResourceSamples(samples, { rootPid, includeTree, intervalMs, errors }) {
  const totals = samples.map((sample) => sample.totals);
  const cpuPercents = calculateCpuPercents(samples);
  const processNames = [...new Set(samples.flatMap((sample) => sample.processes.map((item) => item.name).filter(Boolean)))];
  return {
    available: samples.length > 0,
    rootPid,
    includeTree,
    intervalMs,
    logicalProcessors: logicalProcessorCount,
    sampleCount: samples.length,
    errors: [...new Set(errors)].slice(0, 5),
    processNames,
    avgCpuPercent: cpuPercents.length ? round1(average(cpuPercents)) : null,
    maxCpuPercent: cpuPercents.length ? round1(Math.max(...cpuPercents)) : null,
    peakWorkingSetMiB: totals.length ? bytesToMiB(Math.max(...totals.map((item) => item.workingSetBytes))) : null,
    avgWorkingSetMiB: totals.length ? bytesToMiB(average(totals.map((item) => item.workingSetBytes))) : null,
    peakPrivateMiB: totals.length ? bytesToMiB(Math.max(...totals.map((item) => item.privateBytes))) : null,
    avgPrivateMiB: totals.length ? bytesToMiB(average(totals.map((item) => item.privateBytes))) : null,
    peakHandleCount: totals.length ? Math.max(...totals.map((item) => item.handleCount)) : null,
    peakThreadCount: totals.length ? Math.max(...totals.map((item) => item.threadCount)) : null,
    peakProcessCount: totals.length ? Math.max(...totals.map((item) => item.processCount)) : null,
  };
}

function calculateCpuPercents(samples) {
  const values = [];
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const elapsedSeconds = Math.max(0, (current.atMs - previous.atMs) / 1000);
    if (elapsedSeconds <= 0) continue;

    const previousByPid = new Map(previous.processes.map((item) => [item.pid, item]));
    let deltaCpuSeconds = 0;
    for (const currentProcess of current.processes) {
      const previousProcess = previousByPid.get(currentProcess.pid);
      if (!previousProcess) continue;
      deltaCpuSeconds += Math.max(0, currentProcess.cpuSeconds - previousProcess.cpuSeconds);
    }
    values.push((deltaCpuSeconds / elapsedSeconds / logicalProcessorCount) * 100);
  }
  return values.filter((value) => Number.isFinite(value));
}

function sum(items, key) {
  return items.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}

function average(values) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function bytesToMiB(bytes) {
  return round1((Number(bytes) || 0) / 1048576);
}

function round1(value) {
  return Number((Number(value) || 0).toFixed(1));
}
