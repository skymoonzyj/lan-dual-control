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
  preflightOnly: false,
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/run-winclient-retest-and-post.mjs [options] [retest options]

Options:
  --server, -Server <url>  Agent Link Board URL. Default: ${defaults.server}
  --dryRunPost            Run the retest, then check the post step without sending.
  --preflightOnly, -PreflightOnly
                           Run no-password discovery/local diagnostics only; do not retest or post.
  --noDiagnose, -NoDiagnose
                           Post only W2W3Retest=; skip read-only diagnosis.
  --printCommandJson       Print the generated child command as JSON; do not run it.
  --help, -Help, -h       Show this help without starting a retest.

Description:
  One-click wrapper for the Windows client real retest flow. It runs the same
  foreground retest as Run-WinClientRetest.cmd, captures only the final
  W2W3Retest= evidence line plus optional W8NativeVideo= native-present
  evidence, then calls scripts/windows/post-w2w3-retest-board.mjs to publish
  the redacted result, W8NativeGate=/W8ArrivalBacklog= next-step summaries, and the read-only W2 H.264 diagnosis.

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
    if (token === "--preflightOnly" || token === "-PreflightOnly" || token === "--preflight" || token === "-Preflight") {
      args.preflightOnly = true;
      continue;
    }
    if (token === "--noDiagnose" || token === "-NoDiagnose") {
      args.diagnose = false;
      continue;
    }
    if (token === "--printCommandJson" || token === "-PrintCommandJson") {
      args.printCommandJson = true;
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

function normalizePowerShellParameterName(token) {
  const match = String(token || "").match(/^[-/]{1,2}([^:=\s]+)(?:[:=].*)?$/);
  return match ? match[1].toLowerCase() : "";
}

function hasForwardedPowerShellParameter(tokens, name) {
  const expected = String(name || "").toLowerCase();
  return tokens.some((token) => normalizePowerShellParameterName(token) === expected);
}

function appendDefaultPowerShellParameter(commandArgs, forwardedArgs, name, value) {
  if (!hasForwardedPowerShellParameter(forwardedArgs, name)) {
    commandArgs.push(`-${name}`, String(value));
  }
}

function buildRetestCommand(args) {
  const override = commandFromEnv();
  if (override) return override;
  const commandArgs = [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "scripts/windows/test-windows-client-browser.ps1",
    "-Discover",
    "-PromptPassword",
    "-RequirePassword",
    "-RequireH264",
    "-BoardSummary",
  ];
  appendDefaultPowerShellParameter(commandArgs, args.retestArgs, "TimeoutMs", "45000");
  commandArgs.push(...args.retestArgs);
  return {
    command: findPowerShellExe(),
    args: commandArgs,
  };
}
function buildPreflightCommand(args) {
  const override = commandFromEnv();
  if (override) return override;
  const commandArgs = [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "scripts/windows/test-windows-client-browser.ps1",
    "-Discover",
    "-DiagnosticsOnly",
    "-BoardSummary",
    "-OnlyH264LatencyQueueGuard",
  ];
  appendDefaultPowerShellParameter(commandArgs, args.retestArgs, "TimeoutMs", "45000");
  commandArgs.push(...args.retestArgs);
  return {
    command: findPowerShellExe(),
    args: commandArgs,
  };
}

function printPreflightIntro() {
  console.log("[INFO] WinClientRetestPreflight: 不请求密码、不认证、不发通讯板、不发送 input/inject。");
  console.log("[INFO] 这一步只检查 Windows 控制端本地诊断和 Mac /discovery 目标；正式复测再运行 Run-WinClientRetest-And-Post.cmd。");
}

function printPreflightReady() {
  console.log("WinClientRetestPreflight=ready Next=Run-WinClientRetest-And-Post.cmd PasswordLocation=当前终端隐藏输入 Safety=no-password,no-auth,no-board-post,no-input-inject");
  console.log("下一步：运行 Run-WinClientRetest-And-Post.cmd；看到“当前终端输入 Mac 临时密码（输入不显示，回车继续）:”时，只在这个黑色终端输入。");
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
  return line
    .replace(/\s*;\s*W8NativeVideo=.*$/i, "")
    .replace(/\s*;\s*(?:fps|audio|surface|h264Errors|error)=.*$/i, "")
    .trim();
}

function extractW8NativeVideoLine(text) {
  const matches = [...String(text || "").matchAll(/W8NativeVideo=[^\r\n]+/g)].map((match) => match[0].trim());
  const line = matches.at(-1) || "";
  if (!line) return "";
  return line
    .replace(/\s*;\s*(?:fps|audio|surface|h264Errors|error)=.*$/i, "")
    .replace(/\s+No password was printed or sent to Agent Link Board; no input\/inject was performed\.?.*$/i, "")
    .replace(/[.。]\s*$/u, "")
    .trim();
}

function runPostHelper(args, retestLine, w8NativeVideoLine = "") {
  const tempDir = mkdtempSync(join(tmpdir(), "lan-dual-w2w3-retest-"));
  const retestFile = join(tempDir, "w2w3-retest.txt");
  writeFileSync(retestFile, `${[retestLine, w8NativeVideoLine].filter(Boolean).join("\n")}\n`, "utf8");
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

  if (args.printCommandJson) {
    const command = args.preflightOnly ? buildPreflightCommand(args) : buildRetestCommand(args);
    console.log(JSON.stringify(command));
    return;
  }

  if (args.preflightOnly) {
    printPreflightIntro();
    const preflightCommand = buildPreflightCommand(args);
    const preflight = await runStreaming(preflightCommand.command, preflightCommand.args);
    if (preflight.exitCode !== 0) {
      console.error(`[FAIL] WinClient retest preflight failed; do not enter password yet. exit=${preflight.exitCode ?? "null"}`);
      process.exitCode = preflight.exitCode ?? 1;
      return;
    }
    printPreflightReady();
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

  const w8NativeVideoLine = extractW8NativeVideoLine(`${retest.stdout}\n${retest.stderr}`);
  const post = runPostHelper(args, retestLine, w8NativeVideoLine);
  process.exitCode = post.status ?? 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error?.message || String(error)}`);
  process.exitCode = 1;
});
