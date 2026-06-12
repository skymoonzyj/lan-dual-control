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
  --verbose              Print each help command output
  --help, -h             Show this help without running checks

Description:
  Verifies every scripts/mac/*.mjs utility supports pure --help and -h output.
  A passing check means the command exits 0, prints Usage/Options-style help, and
  returns quickly without building Swift, starting Mac host, probing devices, or
  connecting to a real host.

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

function analyze(result) {
  const combined = `${result.stdout}\n${result.stderr}`;
  const hasHelpShape = /\bUsage\b/i.test(combined) || /\bOptions\b/i.test(combined) || combined.includes("用法");
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
  return {
    ...result,
    ok: problems.length === 0,
    problems,
    outputBytes: Buffer.byteLength(combined, "utf8"),
  };
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
      if (!args.json) {
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

  if (args.json) {
    console.log(JSON.stringify({ ...summary, results }, null, 2));
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
