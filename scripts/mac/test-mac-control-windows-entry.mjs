#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const entryFile = "Start-Mac-Control-Windows.command";
const entryPath = path.join(repoRoot, entryFile);

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-control-windows-entry.mjs [options]

Options:
  --help, -h  Show this help without running checks
`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(text, expected, label) {
  assert(String(text).includes(expected), `${label} did not include ${JSON.stringify(expected)}.`);
}

function assertNotIncludes(text, expected, label) {
  assert(!String(text).includes(expected), `${label} unexpectedly included ${JSON.stringify(expected)}.`);
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }

  const metadata = await stat(entryPath);
  assert(metadata.isFile(), `${entryFile} should be a file`);
  assert((metadata.mode & 0o111) !== 0, `${entryFile} should be executable for Finder double-click`);

  const text = await readFile(entryPath, "utf8");
  assertIncludes(text, "#!/usr/bin/env bash", entryFile);
  assertIncludes(text, "scripts/mac/start-mac-client.mjs", entryFile);
  assertIncludes(text, "--allowExisting", entryFile);
  assertIncludes(text, "--open", entryFile);
  assertIncludes(text, "\"$@\"", entryFile);
  assertIncludes(text, "dirname \"$0\"", entryFile);
  assertIncludes(text, "command -v node", entryFile);

  assertNotIncludes(text, "LAN_DUAL_PASSWORD", entryFile);
  assertNotIncludes(text, "--promptPassword", entryFile);
  assertNotIncludes(text, "--requirePassword", entryFile);
  assertNotIncludes(text, "--password", entryFile);
  assertNotIncludes(text, "input_event", entryFile);
  assertNotIncludes(text, "inject", entryFile);
  assertNotIncludes(text, "sudo", entryFile);
  assertNotIncludes(text, "launchctl", entryFile);
  assertNotIncludes(text, "pmset", entryFile);
  assertNotIncludes(text, "scripts/windows/", entryFile);

  console.log(`[OK] ${entryFile} opens the safe Mac control page entry without secrets or input injection`);
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
