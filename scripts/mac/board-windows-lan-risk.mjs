import { fileURLToPath } from "node:url";

const secretLikePattern = /\b(password|passwd|pwd|token|secret)\b|lan_dual_password|--/i;
const riskLabelPattern = /\bWindowsLanRisks?\s*=\s*([A-Za-z0-9_,/-]+)/gi;
const riskTokenPattern = /^[a-z][a-z0-9_-]{0,63}$/i;

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/board-windows-lan-risk.mjs --help

Shared helper for Mac scripts that need to read WindowsLanRisk= hints from
Agent Link Board /api/state. Import its functions from another script; running
this file directly only prints this help.

Options:
  --help, -h  Show this help without reading Agent Link Board.

Exports:
  readWindowsLanRiskFromBoard(options)
  extractWindowsLanRiskFromState(state)
  formatWindowsLanRisk(windowsLanRisk)
`);
}

export function emptyWindowsLanRisk(checked = false) {
  return {
    checked,
    ok: false,
    found: false,
    risks: [],
    riskText: "",
    rejectedCount: 0,
    error: "",
  };
}

export async function readWindowsLanRiskFromBoard(options = {}) {
  const enabled = Boolean(options.enabled ?? options.checkBoard);
  if (!enabled) return emptyWindowsLanRisk(false);

  try {
    const state = await readBoardState(options.server, options.timeoutMs);
    return {
      ...extractWindowsLanRiskFromState(state),
      checked: true,
      ok: true,
      error: "",
    };
  } catch {
    return {
      ...emptyWindowsLanRisk(true),
      error: "Agent Link Board state not readable",
    };
  }
}

export function extractWindowsLanRiskFromState(state) {
  const values = collectStringValues(state);
  const risks = [];
  const seen = new Set();
  let rejectedCount = 0;

  for (const value of values) {
    riskLabelPattern.lastIndex = 0;
    let match = riskLabelPattern.exec(value);
    while (match) {
      const parsed = parseRiskValue(match[1]);
      if (parsed.length === 0) {
        rejectedCount += 1;
      }
      for (const risk of parsed) {
        if (!seen.has(risk)) {
          seen.add(risk);
          risks.push(risk);
        }
      }
      match = riskLabelPattern.exec(value);
    }
  }

  return {
    checked: false,
    ok: false,
    found: risks.length > 0,
    risks,
    riskText: risks.join(","),
    rejectedCount,
    error: "",
  };
}

export function formatWindowsLanRisk(windowsLanRisk) {
  return windowsLanRisk?.found ? `WindowsLanRisk=${windowsLanRisk.riskText}` : "";
}

function parseRiskValue(value) {
  const candidate = String(value || "").trim();
  if (!candidate || secretLikePattern.test(candidate)) return [];
  const tokens = candidate
    .split(/[,/]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return [];
  if (tokens.some((token) => secretLikePattern.test(token) || !riskTokenPattern.test(token))) return [];
  return tokens;
}

function collectStringValues(value, output = [], depth = 0) {
  if (output.length >= 500 || depth > 8) return output;
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, output, depth + 1);
    return output;
  }
  for (const item of Object.values(value)) collectStringValues(item, output, depth + 1);
  return output;
}

async function readBoardState(server, timeoutMs) {
  const baseUrl = String(server || "").trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("missing Agent Link Board URL");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 5000));
  try {
    const response = await fetch(`${baseUrl}/api/state`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url) && helpRequested(process.argv)) {
  printHelp();
}
