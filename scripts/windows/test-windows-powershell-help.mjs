import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const defaultTimeoutMs = 7000;

const defaultScripts = [
  "allow-windows-reverse-control.ps1",
  "check-mac-formal-e2e.ps1",
  "check-windows-host-readiness.ps1",
  "check-windows-manual-ux-status.ps1",
  "check-windows-resume-status.ps1",
  "check-windows-video-encoder-support.ps1",
  "start-windows-host.ps1",
  "start-windows-control-mac.ps1",
];

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-powershell-help.mjs [options]

Options:
  --timeoutMs <ms>       Per help command timeout. Default: ${defaultTimeoutMs}
  --script <name>        Limit to one PowerShell script file name; can be repeated
  --shell <command>      PowerShell executable. Default: powershell.exe
  --json                 Print JSON summary
  --boardSummary         Print one secret-free Agent Link Board summary line
  --verbose              Print each help command output
  --help, -h             Show this help without running checks

Description:
  Verifies Windows PowerShell wrapper scripts expose pure -Help and -h output.
  By default this checks the pinned core wrappers plus every scripts/windows/*.ps1
  file that declares a Help switch.
  A passing check means the command exits 0, prints Usage/Options-style help,
  returns quickly, and does not start hosts, ask for passwords, authenticate,
  launch probes, or send input/inject events.
`);
}

function parseArgs(argv) {
  const args = {
    timeoutMs: defaultTimeoutMs,
    scripts: [],
    shell: "powershell.exe",
    json: false,
    boardSummary: false,
    verbose: false,
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
    if (token === "--boardSummary") {
      args.boardSummary = true;
      continue;
    }
    if (token === "--verbose") {
      args.verbose = true;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(1000, Number(next) || defaultTimeoutMs);
      index += 1;
      continue;
    }
    if (token === "--script" && next && !next.startsWith("--")) {
      args.scripts.push(next);
      index += 1;
      continue;
    }
    if (token === "--shell" && next && !next.startsWith("--")) {
      args.shell = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function listScripts(selectedScripts) {
  const selected = new Set(selectedScripts.map((name) => basename(name)));
  const allScripts = readdirSync(scriptDir)
    .filter((name) => name.endsWith(".ps1"))
    .sort((a, b) => a.localeCompare(b));
  const helpScripts = allScripts.filter((name) => scriptDeclaresHelp(name));
  const defaultCoverage = [...new Set([...defaultScripts, ...helpScripts])]
    .sort((a, b) => a.localeCompare(b));
  const scripts = selected.size === 0
    ? defaultCoverage
    : allScripts.filter((name) => selected.has(name));
  const missing = [...selected].filter((name) => !allScripts.includes(name));
  if (missing.length > 0) {
    throw new Error(`Unknown PowerShell script(s): ${missing.join(", ")}`);
  }
  const nonHelpSelected = scripts.filter((name) => !scriptDeclaresHelp(name) && !defaultScripts.includes(name));
  if (nonHelpSelected.length > 0) {
    throw new Error(`PowerShell script(s) do not declare a Help switch: ${nonHelpSelected.join(", ")}`);
  }
  for (const scriptName of scripts) {
    const scriptPath = resolve(scriptDir, scriptName);
    if (!existsSync(scriptPath)) {
      throw new Error(`Missing PowerShell script: ${scriptName}`);
    }
  }
  return scripts;
}

function scriptDeclaresHelp(scriptName) {
  const scriptPath = resolve(scriptDir, scriptName);
  if (!existsSync(scriptPath)) {
    return false;
  }
  const text = readFileSync(scriptPath, "utf8");
  return /(?:\[[^\]]+\]\s*)*\[switch\]\s*\$Help\b/i.test(text);
}

function runHelp(shell, scriptName, flag, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn(shell, [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", resolve(scriptDir, scriptName),
      flag,
    ], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const startedAt = performance.now();
    const timer = setTimeout(() => {
      child.kill();
      resolveRun({
        scriptName,
        flag,
        exitCode: null,
        timedOut: true,
        durationMs: Math.round(performance.now() - startedAt),
        stdout,
        stderr,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({
        scriptName,
        flag,
        exitCode: null,
        timedOut: false,
        durationMs: Math.round(performance.now() - startedAt),
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({
        scriptName,
        flag,
        exitCode,
        timedOut: false,
        durationMs: Math.round(performance.now() - startedAt),
        stdout,
        stderr,
      });
    });
  });
}

function analyze(result) {
  const combined = `${result.stdout}\n${result.stderr}`;
  const hasHelpShape = /\bUsage\b/i.test(combined) || /\bOptions\b/i.test(combined) || combined.includes("用法");
  const forbidden = [
    /Mac host password:/i,
    /LAN_DUAL_PASSWORD\s*=/i,
    /Starting Windows host/i,
    /Starting Mac alert watcher/i,
    /Mac alert watcher started/i,
    /Watching Mac-side Agent Link alerts/i,
    /Codex LAN Link started/i,
    /Configuring machine Rust environment/i,
    /Installing Visual Studio C\+\+ Build Tools/i,
    /Build Tools installer failed/i,
    /LAN_DUAL_WASAPI_INFO/i,
    /LAN_DUAL_WASAPI_ERROR/i,
    /\bAuth passed\b/i,
    /\[(?:OK|INFO|RUN|WARN|ERROR)\].*\binput_ack\b/i,
  ];
  const matchedForbidden = forbidden.filter((pattern) => pattern.test(combined)).map((pattern) => String(pattern));
  const problems = [];
  if (result.timedOut) {
    problems.push(`timed out after ${result.durationMs}ms`);
  }
  if (result.exitCode !== 0) {
    problems.push(`exit ${result.exitCode === null ? "null" : result.exitCode}`);
  }
  if (!hasHelpShape) {
    problems.push("missing Usage/Options help text");
  }
  if (matchedForbidden.length > 0) {
    problems.push(`forbidden runtime output: ${matchedForbidden.join(", ")}`);
  }
  return {
    ...result,
    ok: problems.length === 0,
    problems,
    outputBytes: Buffer.byteLength(combined, "utf8"),
  };
}

function makeBoardSummary(summary) {
  const scope = summary.scriptsChecked === 1 ? "1 script" : `${summary.scriptsChecked} scripts`;
  const commandCount = `${summary.commandsChecked} command${summary.commandsChecked === 1 ? "" : "s"}`;
  if (summary.ok) {
    return [
      `Windows PowerShell help: ok ${summary.commandsChecked}/${summary.commandsChecked} commands across ${scope}; shell=${summary.shell}; timeout=${summary.timeoutMs}ms.`,
      "Pure -Help/-h only; no host/watcher/Agent Link startup, password/Token, system changes, WASAPI capture, input, or inject output detected.",
    ].join(" ");
  }
  const failedNames = summary.failed
    .slice(0, 5)
    .map((failure) => `${failure.scriptName} ${failure.flag}: ${failure.problems.join("+")}`)
    .join("; ");
  const more = summary.failed.length > 5 ? `; +${summary.failed.length - 5} more` : "";
  return [
    `Windows PowerShell help: failed ${summary.failed.length}/${commandCount} across ${scope}; shell=${summary.shell}; timeout=${summary.timeoutMs}ms.`,
    `Failed=${failedNames || "unknown"}${more}.`,
    "No password/Token/input/inject was intentionally sent; inspect local command output before posting details.",
  ].join(" ");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const scripts = listScripts(args.scripts);
  const results = [];
  for (const scriptName of scripts) {
    for (const flag of ["-Help", "-h"]) {
      const result = analyze(await runHelp(args.shell, scriptName, flag, args.timeoutMs));
      results.push(result);
      if (!args.json && !args.boardSummary) {
        const status = result.ok ? "OK" : "FAIL";
        console.log(`[${status}] ${scriptName} ${flag} (${result.durationMs}ms)`);
        if (!result.ok) {
          console.log(`      ${result.problems.join("; ")}`);
        } else if (args.verbose) {
          console.log(result.stdout.trim());
        }
      }
    }
  }

  const failed = results.filter((result) => !result.ok);
  const summary = {
    ok: failed.length === 0,
    scriptsChecked: scripts.length,
    commandsChecked: results.length,
    timeoutMs: args.timeoutMs,
    shell: args.shell,
    failed: failed.map((result) => ({
      scriptName: result.scriptName,
      flag: result.flag,
      problems: result.problems,
      })),
  };
  summary.boardSummary = makeBoardSummary(summary);

  if (args.json) {
    console.log(JSON.stringify({ ...summary, results }, null, 2));
  } else if (args.boardSummary) {
    console.log(summary.boardSummary);
  } else {
    console.log(summary.ok
      ? `[OK] Windows PowerShell help coverage passed: ${summary.commandsChecked} commands`
      : `[FAIL] Windows PowerShell help coverage failed: ${failed.length} command(s)`);
  }

  process.exitCode = summary.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
