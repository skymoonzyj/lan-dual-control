#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");

const defaults = {
  server: "http://192.168.31.68:17888",
  dryRunPost: false,
  diagnose: true,
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/run-winclient-retest-and-post.mjs [options] [retest options]

Options:
  --server, -Server <url>  Agent Link Board URL. Default: ${defaults.server}
  --dryRunPost            Run the retest, then check the post step without sending.
  --noDiagnose, -NoDiagnose
                           Post only W2W3Retest=; skip read-only diagnosis.
  --help, -Help, -h       Show this help without starting a retest.

Description:
  One-click wrapper for the Windows client real retest flow. It runs the same
  foreground retest as Run-WinClientRetest.cmd, captures only the final
  W2W3Retest= evidence line, then calls scripts/windows/post-w2w3-retest-board.mjs
  to publish the redacted result and the read-only W2 H.264 diagnosis.

  It never puts credentials in command arguments or on Agent Link Board. All
  other options are forwarded to the underlying retest PowerShell wrapper, for
  example -DiscoverNoLocalSubnets -HostName 192.168.31.122 -Port 43770.
`);
}

function isHelpToken(token) {
  return token === "--help" || token === "-h" || token === "-Help" || token === "/?";
}

function parseArgs(argv) {
  const args = { ...defaults, retestArgs: [] };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (isHelpToken(token)) {
      args.help = true;
      continue;
    }
    if (token === "--server" || token === "-Server") {
      if (!next || next.startsWith("--")) throw new Error(`Missing value for ${token}`);
      args.server = next;
      index += 1;
      continue;
    }
    if (token === "--dryRunPost" || token === "-DryRunPost") {
      args.dryRunPost = true;
      continue;
    }
    if (token === "--noDiagnose" || token === "-NoDiagnose") {
      args.diagnose = false;
      continue;
    }
    if (token === "--") {
      args.retestArgs.push(...argv.slice(index + 1));
      break;
    }
    args.retestArgs.push(token);
  }
  return args;
}

function findPowerShellExe() {
  const pwsh = spawnSync("where.exe", ["pwsh.exe"], { encoding: "utf8", windowsHide: true });
  if (pwsh.status === 0) return "pwsh.exe";
  return "powershell.exe";
}

function commandFromEnv() {
  const raw = process.env.LAN_DUAL_WINCLIENT_RETEST_COMMAND_JSON;
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.some((item) => typeof item !== "string")) {
    throw new Error("LAN_DUAL_WINCLIENT_RETEST_COMMAND_JSON must be a JSON string array");
  }
  return { command: parsed[0], args: parsed.slice(1) };
}

function buildRetestCommand(args) {
  const override = commandFromEnv();
  if (override) return override;
  return {
    command: findPowerShellExe(),
    args: [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", "scripts/windows/test-windows-client-browser.ps1",
      "-Discover",
      "-PromptPassword",
      "-RequirePassword",
      "-RequireH264",
      "-BoardSummary",
      "-TimeoutMs", "45000",
      ...args.retestArgs,
    ],
  };
}

function runStreaming(command, commandArgs) {
  return new Promise((resolveRun) => {
    const child = spawn(command, commandArgs, {
      cwd: repoRoot,
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: "",
        CODEX_LINK_TOKEN: "",
      },
      stdio: ["inherit", "pipe", "pipe"],
      windowsHide: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", (error) => {
      resolveRun({ exitCode: null, stdout, stderr: `${stderr}\n${error.message}`.trim(), error });
    });
    child.on("close", (exitCode) => {
      resolveRun({ exitCode, stdout, stderr });
    });
  });
}

function extractRetestLine(text) {
  const matches = [...String(text || "").matchAll(/W2W3Retest=[^\r\n]+/g)].map((match) => match[0].trim());
  const line = matches.at(-1) || "";
  if (!line) return "";
  if (!/\bvideo=/.test(line) || !/\bh264=/.test(line)) return "";
  return line;
}

function runPostHelper(args, retestLine) {
  const tempDir = mkdtempSync(join(tmpdir(), "lan-dual-w2w3-retest-"));
  const retestFile = join(tempDir, "w2w3-retest.txt");
  writeFileSync(retestFile, `${retestLine}\n`, "utf8");
  const postArgs = [
    "scripts/windows/post-w2w3-retest-board.mjs",
    "--file", retestFile,
    "--server", args.server,
  ];
  if (!args.dryRunPost) postArgs.push("--send");
  if (!args.diagnose) postArgs.push("--noDiagnose");
  return spawnSync(process.execPath, postArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
      CODEX_LINK_TOKEN: "",
    },
    windowsHide: true,
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const retestCommand = buildRetestCommand(args);
  const retest = await runStreaming(retestCommand.command, retestCommand.args);
  if (retest.exitCode !== 0) {
    console.error(`[INFO] WinClient retest failed; board post skipped. exit=${retest.exitCode ?? "null"}`);
    process.exitCode = retest.exitCode ?? 1;
    return;
  }

  const retestLine = extractRetestLine(`${retest.stdout}\n${retest.stderr}`);
  if (!retestLine) {
    console.error("[FAIL] No W2W3Retest= line with video= and h264= evidence was found; board post skipped.");
    process.exitCode = 1;
    return;
  }

  const post = runPostHelper(args, retestLine);
  process.exitCode = post.status ?? 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error?.message || String(error)}`);
  process.exitCode = 1;
});