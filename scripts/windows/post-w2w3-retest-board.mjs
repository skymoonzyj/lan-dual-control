#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");

const defaults = {
  server: "http://192.168.31.68:17888",
  from: "Windows Codex",
  diagnose: true,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/post-w2w3-retest-board.mjs [options]

Options:
  --text <text>     Text that contains one W2W3Retest= line.
  --file <path>     Read text from a local file that contains W2W3Retest=.
  --stdin           Read text from standard input. Use only with an explicit pipe.
  --server <url>    Agent Link Board URL. Default: ${defaults.server}
  --from <name>     Agent Link sender name. Default: ${defaults.from}
  --send            Post W2W3Retest= and W2H264BoardDiagnosis= to the board.
  --noDiagnose      Only post W2W3Retest=; do not run diagnosis.
  --json            Print machine-readable JSON.
  --boardSummary    Print one secret-safe summary line.
  --help, -h        Show this help.

Description:
  Safely posts the real Windows client W2/W3 retest result after the user runs
  Run-WinClientRetest.cmd locally. It accepts only a redacted W2W3Retest= line,
  rejects password/token/control-event markers before posting, and can run
  the read-only W2 H.264 diagnosis helper immediately after posting. It never
  asks for passwords, authenticates a host, or sends real control events.
`);
}

function parseArgs(argv) {
  const args = { ...defaults, send: false, json: false, boardSummary: false, stdin: false };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--send") {
      args.send = true;
      continue;
    }
    if (token === "--noDiagnose") {
      args.diagnose = false;
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
    if (token === "--stdin") {
      args.stdin = true;
      continue;
    }
    if (["--text", "--file", "--server", "--from"].includes(token) && next && !next.startsWith("--")) {
      const key = token.slice(2);
      args[key] = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${token}`);
  }
  return args;
}

function readInput(args) {
  if (args.text) return args.text;
  if (args.file) return readFileSync(args.file, "utf8");
  if (args.stdin) {
    if (process.stdin.isTTY) {
      throw new Error("Missing piped stdin input. Pipe text into --stdin, or use --text/--file.");
    }
    return readFileSync(0, "utf8");
  }
  throw new Error("Missing W2W3Retest input. Use --text, --file, or --stdin.");
}

function findUnsafeMarker(text) {
  const checks = [
    { label: "--password", pattern: /--password\b/i },
    { label: "password=", pattern: /\bpassword\s*=/i },
    { label: "LAN_DUAL_PASSWORD", pattern: /LAN_DUAL_PASSWORD/i },
    { label: "CODEX_LINK_TOKEN", pattern: /CODEX_LINK_TOKEN/i },
    { label: "token=", pattern: /\btoken\s*=/i },
    { label: "secret=", pattern: /\bsecret\s*=/i },
    { label: "input_event", pattern: /input_event/i },
    { label: "inject", pattern: /\binject\b/i },
    { label: "Mac host password", pattern: /Mac host password/i },
  ];
  return checks.find((check) => check.pattern.test(text))?.label || "";
}

function normalizeRetestLine(line) {
  return String(line || "")
    .replace(/\s+No password was printed or sent to Agent Link Board; no input\/inject was performed\.?.*$/i, "")
    .replace(/\s+Source=Run-WinClientRetest\/local-hidden-password-prompt\..*$/i, "")
    .replace(/\s+Safety=no-password-on-board,no-input-inject\..*$/i, "")
    .trim();
}

function extractRetestLine(input) {
  const matches = [...String(input).matchAll(/W2W3Retest=[^\r\n]+/g)].map((match) => normalizeRetestLine(match[0]));
  const retestLine = matches.at(-1) || "";
  if (!retestLine) throw new Error("No W2W3Retest= line found in input.");
  const unsafeMarker = findUnsafeMarker(retestLine);
  if (unsafeMarker) throw new Error("unsafe input rejected before posting");
  if (!/\bvideo=/.test(retestLine) || !/\bh264=/.test(retestLine)) {
    throw new Error("W2W3Retest= line is missing required video= or h264= evidence.");
  }
  return retestLine;
}

async function postMessage(args, text) {
  const url = new URL("/api/message", args.server);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: args.from, text, type: "message" }),
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`Agent Link Board post failed: ${response.status}`);
  if (!responseText) return true;
  let payload = {};
  try {
    payload = JSON.parse(responseText);
  } catch {
    return true;
  }
  if (payload?.ok === false) {
    throw new Error(`Agent Link Board post failed: ${payload.error || "ok=false"}`);
  }
  return true;
}

function runDiagnosis(args) {
  if (!args.diagnose) return { skipped: true, boardSummary: "" };
  const result = spawnSync(process.execPath, [
    "scripts/windows/diagnose-w2-h264-board.mjs",
    "--server", args.server,
    "--boardSummary",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
      CODEX_LINK_TOKEN: "",
    },
    windowsHide: true,
  });
  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "").trim();
  const boardSummary = stdout.split(/\r?\n/).find((line) => line.startsWith("W2H264BoardDiagnosis=")) || stdout;
  if (!boardSummary.startsWith("W2H264BoardDiagnosis=")) {
    throw new Error(`diagnosis did not produce W2H264BoardDiagnosis; exit=${result.status ?? "null"}${stderr ? `; ${stderr}` : ""}`);
  }
  return {
    skipped: false,
    exitCode: result.status,
    boardSummary,
  };
}

function makeRetestMessage(retestLine) {
  return [
    retestLine,
    "Source=Run-WinClientRetest/local-hidden-password-prompt.",
    "Safety=no-password-on-board,no-input-inject.",
  ].join(" ");
}

function makeDiagnosisMessage(diagnosis) {
  return `${diagnosis.boardSummary} Source=post-w2w3-retest-board. Safety=no-password-on-board,no-input-inject.`;
}

function makeBoardSummary(payload) {
  return [
    `W2W3RetestPost=${payload.send ? "sent" : "dry-run"}`,
    `retest=${payload.retestLine ? "present" : "missing"}`,
    payload.diagnosisBoardSummary ? `diagnosis=${payload.diagnosisBoardSummary}` : "diagnosis=skipped",
    "Safety=no-password-on-board,no-input-inject.",
  ].join(" ");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || helpRequested(process.argv)) {
    printHelp();
    return;
  }

  const retestLine = extractRetestLine(readInput(args));
  const payload = {
    ok: true,
    send: Boolean(args.send),
    sentRetest: false,
    sentDiagnosis: false,
    retestLine,
    diagnosisBoardSummary: "",
  };

  if (args.send) {
    await postMessage(args, makeRetestMessage(retestLine));
    payload.sentRetest = true;
    const diagnosis = runDiagnosis(args);
    payload.diagnosisBoardSummary = diagnosis.boardSummary || "";
    if (payload.diagnosisBoardSummary) {
      await postMessage(args, makeDiagnosisMessage(diagnosis));
      payload.sentDiagnosis = true;
    }
  }

  payload.boardSummary = makeBoardSummary(payload);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (args.boardSummary) {
    console.log(payload.boardSummary);
  } else if (args.send) {
    console.log(payload.boardSummary);
  } else {
    console.log("Dry run only. Add --send to post this W2W3Retest line and diagnosis to Agent Link Board.");
    console.log(payload.boardSummary);
  }
}

main().catch((error) => {
  const message = error?.message || String(error);
  console.error(message);
  process.exitCode = 1;
});
