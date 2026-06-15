import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import { WindowsClipboardBridge } from "../../apps/windows-host/src/windows-clipboard-bridge.mjs";

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-clipboard-bridge.mjs [options]

Options:
  --help, -h  Show this help without running checks

Description:
  Runs direct unit coverage for Windows host file clipboard receiving.
  It does not start the Windows host, write the system clipboard, or require a password.
`);
}

function parseArgs(argv) {
  const args = { help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function makeBridge(options = {}) {
  return new WindowsClipboardBridge({
    mode: "memory",
    logger: {
      info() {},
      warn() {},
    },
    ...options,
  });
}

function receiveOffer(bridge, transferId, files, extra = {}) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return bridge.receiveFileOffer({
    transferId,
    direction: "client_to_host",
    totalBytes,
    fileCount: files.length,
    maxChunkBytes: 64 * 1024,
    files,
    ...extra,
  });
}

function receiveChunk(bridge, transferId, fileIndex, offset, value, extra = {}) {
  const buffer = Buffer.from(value);
  return bridge.receiveFileChunk({
    transferId,
    fileIndex,
    chunkIndex: 0,
    offset,
    bytes: buffer.length,
    encoding: "base64",
    dataBase64: buffer.toString("base64"),
    ...extra,
  });
}

function cleanupResult(result) {
  const roots = new Set((result.savedPaths || []).map((filePath) => dirname(filePath)));
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
}

function assertAccepted(message, label) {
  assert.equal(message.accepted, true, `${label}: expected accepted=true, got ${JSON.stringify(message)}`);
}

function assertRejected(message, label) {
  assert.equal(message.accepted, false, `${label}: expected accepted=false, got ${JSON.stringify(message)}`);
  assert.equal(message.code, "LAN010", `${label}: expected LAN010 rejection`);
  assert.ok(message.reason, `${label}: expected rejection reason`);
}

function assertNoOfferChunkRejected() {
  const bridge = makeBridge();
  const transferId = "clipboard-test-no-offer";
  const result = receiveChunk(bridge, transferId, 0, 0, "x");
  assert.equal(result.type, "clipboard_file_progress");
  assertRejected(result, "chunk without offer");
  assert.equal(bridge.fileTransfers.has(transferId), false, "chunk without offer should not create a transfer");
  print("OK", "Chunks without a prior offer are rejected");
}

function assertOversizedChunkRejected() {
  const bridge = makeBridge({ maxChunkBytes: 4 });
  const transferId = "clipboard-test-oversized";
  const offer = receiveOffer(bridge, transferId, [{ index: 0, name: "large.bin", size: 5 }], {
    maxChunkBytes: 64 * 1024,
  });
  assertAccepted(offer, "oversized offer");
  assert.equal(offer.maxChunkBytes, 4, "offer response should clamp maxChunkBytes");

  const rejected = receiveChunk(bridge, transferId, 0, 0, "abcde");
  assertRejected(rejected, "oversized chunk");

  const complete = bridge.completeFileTransfer({ transferId, totalBytes: 5, fileCount: 1 });
  assertRejected(complete, "oversized chunk completion");
  print("OK", "Oversized chunks are rejected and cannot complete the transfer");
}

function assertDuplicateAndOverlapRejected() {
  const bridge = makeBridge({ maxChunkBytes: 4 });
  const transferId = "clipboard-test-overlap";
  const offer = receiveOffer(bridge, transferId, [{ index: 0, name: "data.txt", size: 4 }]);
  assertAccepted(offer, "overlap offer");

  assertAccepted(receiveChunk(bridge, transferId, 0, 0, "ab", { chunkIndex: 0 }), "first chunk");
  assertRejected(receiveChunk(bridge, transferId, 0, 0, "ab", { chunkIndex: 0 }), "duplicate chunk");
  assertRejected(receiveChunk(bridge, transferId, 0, 1, "bc", { chunkIndex: 1 }), "overlapping chunk");
  assertAccepted(receiveChunk(bridge, transferId, 0, 2, "cd", { chunkIndex: 2 }), "tail chunk");

  const complete = bridge.completeFileTransfer({ transferId, totalBytes: 4, fileCount: 1 });
  assertAccepted(complete, "overlap transfer complete");
  assert.equal(complete.receivedBytes, 4);
  assert.equal(readFileSync(complete.savedPaths[0], "utf8"), "abcd");
  cleanupResult(complete);
  print("OK", "Duplicate and overlapping chunks are rejected without corrupting valid chunks");
}

function assertIncompleteFileRejected() {
  const bridge = makeBridge();
  const transferId = "clipboard-test-incomplete";
  assertAccepted(receiveOffer(bridge, transferId, [{ index: 0, name: "partial.txt", size: 4 }]), "incomplete offer");
  assertAccepted(receiveChunk(bridge, transferId, 0, 0, "ab"), "partial chunk");

  const complete = bridge.completeFileTransfer({ transferId, totalBytes: 4, fileCount: 1 });
  assertRejected(complete, "incomplete transfer complete");
  assert.match(complete.reason, /未接收完整/);
  print("OK", "Incomplete files are rejected on completion");
}

function assertOfferLimitsRejected() {
  const totalBridge = makeBridge({ maxTotalFileBytes: 4 });
  const totalResult = receiveOffer(totalBridge, "clipboard-test-total-limit", [
    { index: 0, name: "too-large.bin", size: 5 },
  ]);
  assertRejected(totalResult, "total size limit");
  assert.equal(totalBridge.fileTransfers.has("clipboard-test-total-limit"), false);

  const countBridge = makeBridge({ maxFileCount: 1 });
  const countResult = receiveOffer(countBridge, "clipboard-test-count-limit", [
    { index: 0, name: "a.txt", size: 1 },
    { index: 1, name: "b.txt", size: 1 },
  ]);
  assertRejected(countResult, "file count limit");
  assert.equal(countBridge.fileTransfers.has("clipboard-test-count-limit"), false);
  print("OK", "Offer total size and file count limits are enforced");
}

function assertValidOutOfOrderAndEmptyFiles() {
  const bridge = makeBridge({ maxChunkBytes: 2 });
  const transferId = "clipboard-test-valid";
  const offer = receiveOffer(bridge, transferId, [
    { index: 0, name: "empty.txt", size: 0 },
    { index: 1, name: "data.txt", size: 4 },
  ], { maxChunkBytes: 2 });
  assertAccepted(offer, "valid multi-file offer");
  assert.equal(offer.maxChunkBytes, 2);

  assertAccepted(bridge.receiveFileChunk({
    transferId,
    fileIndex: 0,
    chunkIndex: 0,
    offset: 0,
    bytes: 0,
    encoding: "base64",
    dataBase64: "",
  }), "empty file chunk");
  assertAccepted(receiveChunk(bridge, transferId, 1, 2, "cd", { chunkIndex: 1 }), "out-of-order tail");
  assertAccepted(receiveChunk(bridge, transferId, 1, 0, "ab", { chunkIndex: 0 }), "out-of-order head");

  const complete = bridge.completeFileTransfer({ transferId, totalBytes: 4, fileCount: 2 });
  assertAccepted(complete, "valid complete");
  assert.equal(complete.saveMode, "temp");
  assert.equal(complete.receivedBytes, 4);
  assert.equal(complete.fileCount, 2);
  assert.equal(complete.savedPaths.length, 2);
  assert.equal(existsSync(complete.savedPaths[0]), true, "empty file should exist");
  assert.equal(readFileSync(complete.savedPaths[1], "utf8"), "abcd");
  cleanupResult(complete);
  print("OK", "Valid out-of-order chunks and empty files still complete");
}

function assertCompleteWithoutOfferRejected() {
  const bridge = makeBridge();
  const result = bridge.completeFileTransfer({ transferId: "clipboard-test-complete-without-offer", totalBytes: 1, fileCount: 1 });
  assert.equal(result.type, "clipboard_file_result");
  assert.equal(result.accepted, false);
  assert.equal(result.saveMode, "failed");
  print("OK", "Complete without an active transfer is rejected");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  assertNoOfferChunkRejected();
  assertOversizedChunkRejected();
  assertDuplicateAndOverlapRejected();
  assertIncompleteFileRejected();
  assertOfferLimitsRejected();
  assertValidOutOfOrderAndEmptyFiles();
  assertCompleteWithoutOfferRejected();
  print("OK", "Windows clipboard bridge integrity checks passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.stack || error.message}`);
  process.exitCode = 1;
});
