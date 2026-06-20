#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultTimeoutMs = 5000;

function printHelp() {
  console.log(`Usage:
  node scripts/mac/test-mac-script-help.mjs [options]

Options:
  --timeoutMs <ms>       Per help command timeout. Default: ${defaultTimeoutMs}
  --script <name>        Limit to one script file name; can be repeated
  --json                 Print JSON summary
  --boardSummary         Print one secret-free Agent Link Board summary line
  --verbose              Print each help command output
  --help, -h             Show this help without running checks

Description:
  Verifies every scripts/mac/*.mjs utility supports pure --help and -h output.
  A passing check means the command exits 0, prints Usage/Options-style help, and
  returns quickly without building Swift, starting Mac host, probing devices, or
  connecting to a real host. It also rejects common runtime side-effect output
  such as password prompts, browser DevTools startup, Swift build logs, or host
  connection/probe logs.

Examples:
  node scripts/mac/test-mac-script-help.mjs
  node scripts/mac/test-mac-script-help.mjs --script start-mac-host.mjs
`);
}

function parseArgs(argv) {
  const args = {
    timeoutMs: defaultTimeoutMs,
    scripts: [],
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
    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function listScripts(selectedScripts) {
  const selected = new Set(selectedScripts.map((name) => basename(name)));
  const allScripts = readdirSync(scriptDir)
    .filter((name) => name.endsWith(".mjs"))
    .sort((a, b) => a.localeCompare(b));
  if (selected.size === 0) {
    return allScripts;
  }
  const missing = [...selected].filter((name) => !allScripts.includes(name));
  if (missing.length > 0) {
    throw new Error(`Unknown script(s): ${missing.join(", ")}`);
  }
  return allScripts.filter((name) => selected.has(name));
}

function runHelp(scriptName, flag, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [resolve(scriptDir, scriptName), flag], {
      cwd: resolve(scriptDir, "../.."),
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

const forbiddenRuntimeOutputPatterns = [
  {
    label: "password prompt",
    pattern: /(?:^|\n)\s*[^\n]*(?:Mac host|Windows host|LAN Dual Control)[^\n]*password\s*:\s*$/i,
  },
  {
    label: "environment password leak",
    pattern: /(?:^|\n)\s*LAN_DUAL_PASSWORD\s*=\s*(?!\.{3}(?:\s|$)|<)\S+/i,
  },
  {
    label: "Mac client server startup",
    pattern: /(?:^|\n)\s*Mac client prototype:\s*https?:\/\//i,
  },
  {
    label: "browser DevTools startup",
    pattern: /(?:^|\n)\s*DevTools listening on\s+wss?:\/\//i,
  },
  {
    label: "Swift build output",
    pattern: /(?:^|\n)\s*(?:Building|Compiling|Linking|Compile Swift Module)\b/i,
  },
  {
    label: "Mac host runtime startup",
    pattern: /(?:^|\n)\s*(?:\[[^\n\]]+\]\s*)?[^\n]*\blan-dual-mac-host\b[^\n]*\b(?:listening|started|ready)\b[^\n]*(?:https?:\/\/|port|\d{2,5})/i,
  },
  {
    label: "real host connection/auth",
    pattern:
      /(?:^|\n)\s*(?:\{[^\n]*"type"\s*:\s*"(?:hello_ack|session_answer|input_ack|video_frame|audio_frame)"|(?:\[[^\n\]]+\]\s*)?[^\n]*\b(?:received|sent|accepted|authenticated|connected|frame|ack)\b[^\n]*\b(?:hello_ack|session_answer|input_ack|video_frame|audio_frame)\b)/i,
  },
  {
    label: "Agent Link Board output",
    pattern: /(?:^|\n)\s*(?:updatedAt:|currentCall:|statuses:|recentEvents:)\s*$/m,
  },
];

function analyze(result) {
  const combined = `${result.stdout}\n${result.stderr}`;
  const hasHelpShape = /\bUsage\b/i.test(combined) || /\bOptions\b/i.test(combined) || combined.includes("用法");
  const forbiddenMatches = forbiddenRuntimeOutputPatterns
    .filter(({ pattern }) => pattern.test(combined))
    .map(({ label }) => label);
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
  if (forbiddenMatches.length > 0) {
    problems.push(`forbidden runtime output: ${forbiddenMatches.join(", ")}`);
  }
  return {
    ...result,
    ok: problems.length === 0,
    problems,
    forbiddenMatches,
    outputBytes: Buffer.byteLength(combined, "utf8"),
  };
}

function makeBoardSummary(summary) {
  const scope = summary.scriptsChecked === 1 ? "1 script" : `${summary.scriptsChecked} scripts`;
  const commandCount = `${summary.commandsChecked} command${summary.commandsChecked === 1 ? "" : "s"}`;
  if (summary.ok) {
    return [
      `Mac script help: ok ${summary.commandsChecked}/${summary.commandsChecked} commands across ${scope}; timeout=${summary.timeoutMs}ms.`,
      `MacScriptHelpStatus=ok commands=${summary.commandsChecked}/${summary.commandsChecked} scripts=${summary.scriptsChecked} timeoutMs=${summary.timeoutMs}.`,
      "Pure --help/-h only; no service startup, password prompt, Agent Link read, host auth, input, or inject output detected.",
    ].join(" ");
  }
  const failedNames = summary.failed
    .slice(0, 5)
    .map((failure) => `${failure.scriptName} ${failure.flag}: ${failure.problems.join("+")}`)
    .join("; ");
  const more = summary.failed.length > 5 ? `; +${summary.failed.length - 5} more` : "";
  return [
    `Mac script help: failed ${summary.failed.length}/${commandCount} across ${scope}; timeout=${summary.timeoutMs}ms.`,
    `MacScriptHelpStatus=failed failures=${summary.failed.length} commands=${summary.commandsChecked} scripts=${summary.scriptsChecked} timeoutMs=${summary.timeoutMs}.`,
    `Failed=${failedNames || "unknown"}${more}.`,
    "No password/input/inject was intentionally sent; inspect local command output before posting details.",
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
    for (const flag of ["--help", "-h"]) {
      const result = analyze(await runHelp(scriptName, flag, args.timeoutMs));
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
      ? `[OK] Mac script help coverage passed: ${summary.commandsChecked} commands`
      : `[FAIL] Mac script help coverage failed: ${failed.length} command(s)`);
  }

  process.exitCode = summary.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
