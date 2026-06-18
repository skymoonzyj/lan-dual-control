#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const sourcePath = `${repoRoot}apps/mac-host/Sources/MacHost/MacHostService.swift`;

function printHelp() {
  console.log(`Usage:
  node scripts/mac/test-mac-host-clipboard-file-integrity.mjs [options]

Options:
  --help, -h  Show this help without running checks

Description:
  Checks Mac host file clipboard receive integrity guards. It does not start
  the Mac host, write the system clipboard, require a password, or inject input.
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

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

function assertIncludes(text, expected, label) {
  assert.ok(text.includes(expected), `${label} should include ${JSON.stringify(expected)}`);
}

function assertNotIncludes(text, unexpected, label) {
  assert.ok(!text.includes(unexpected), `${label} should not include ${JSON.stringify(unexpected)}`);
}

function assertSourceGuards(source) {
  const offer = section(source, "private func handleClipboardFileOffer", "private func handleClipboardFileChunk");
  const chunk = section(source, "private func handleClipboardFileChunk", "private func handleClipboardFileComplete");
  const completeHandler = section(source, "private func handleClipboardFileComplete", "private func isFileTransferComplete");
  const complete = section(source, "private func isFileTransferComplete", "private func makeFileTransferDirectory");
  const makeState = section(source, "private func makeFileState", "private func writeFileChunk");
  const helpers = section(source, "private func nonNegativeInt", "private func stringValue");

  assertIncludes(source, "private let inboundClipboardFileChunkBytes = 256 * 1024", "Mac host source");
  assertIncludes(source, "private let maxInboundClipboardFileBytes = 64 * 1024 * 1024", "Mac host source");
  assertIncludes(source, "private let maxInboundClipboardFileCount = 64", "Mac host source");
  assertIncludes(source, "var receivedRanges: [Range<Int>]", "file transfer state");

  assertIncludes(offer, "fileCount > 0, fileCount <= maxInboundClipboardFileCount", "offer guard");
  assertIncludes(offer, "totalBytes >= 0, totalBytes <= maxInboundClipboardFileBytes", "offer guard");
  assertIncludes(offer, "expectedTotalBytes == totalBytes", "offer guard");
  assertIncludes(offer, "FileManager.default.createFile(atPath: file.url.path, contents: nil)", "empty file offer path");

  assertIncludes(chunk, "guard var transfer = context.fileTransfers[transferId]", "chunk transfer guard");
  assertIncludes(chunk, "guard let parsedFileIndex = nonNegativeInt(rawFileIndex)", "chunk fileIndex guard");
  assertIncludes(chunk, "guard var fileState = transfer.files[fileIndex]", "chunk file index guard");
  assertIncludes(chunk, "cleanupFileTransfer(transferId, in: context)", "chunk failure cleanup");
  assertIncludes(chunk, "chunkData.count <= inboundClipboardFileChunkBytes", "chunk size guard");
  assertIncludes(chunk, "guard let parsedOffset = nonNegativeInt(rawOffset)", "chunk offset parse guard");
  assertIncludes(chunk, "offset == fileState.receivedBytes", "chunk offset guard");
  assertIncludes(chunk, "文件剪贴板空块只能用于空文件", "empty chunk guard");
  assertIncludes(chunk, "offset <= fileState.expectedBytes", "chunk bounds guard");
  assertIncludes(chunk, "chunkData.count <= fileState.expectedBytes - offset", "chunk overflow-safe bounds guard");
  assertIncludes(chunk, "fileState.receivedRanges = mergedRanges", "range tracking");
  assertNotIncludes(chunk, "transfer.files[fileIndex] ?? makeFileState", "chunk handler");

  assertIncludes(completeHandler, "fileTransferIncompleteReason(transfer, urls: urls)", "completion result reason");
  assertIncludes(source, "private func fileTransferIncompleteReason", "incomplete result reason helper");
  assertIncludes(source, "已接收 \\(transfer.receivedBytes)/\\(transfer.totalBytes) 字节", "incomplete result reason helper");
  assertIncludes(source, "文件 \\(urls.count)/\\(transfer.fileCount)", "incomplete result reason helper");

  assertIncludes(complete, "urls.count == transfer.fileCount", "completion exact file count guard");
  assertIncludes(complete, "transfer.files.count == transfer.fileCount", "completion declared file count guard");
  assertIncludes(complete, "transfer.receivedBytes == transfer.totalBytes", "completion exact total byte guard");
  assertIncludes(complete, "file.receivedBytes == file.expectedBytes", "completion exact per-file guard");
  assertIncludes(complete, "fileSize(at: file.url) == file.expectedBytes", "completion disk size guard");

  assertIncludes(makeState, "receivedRanges: []", "file state initializer");
  assertIncludes(source, "reservedFileNames.contains(candidate.lowercased())", "same-batch file name guard");
  assertIncludes(helpers, "private func nonNegativeInt", "helper block");
  assertIncludes(helpers, "private func mergedRanges", "helper block");
  assertIncludes(helpers, "private func contiguousReceivedBytes", "helper block");
  assertIncludes(helpers, "private func fileSize", "helper block");
  print("OK", "Mac host Swift source includes file clipboard integrity guards");
}

function mergedRanges(ranges) {
  const sorted = ranges
    .filter((range) => range.start <= range.end)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (!last) {
      merged.push({ ...range });
      continue;
    }
    if (range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function contiguousReceivedBytes(ranges) {
  let cursor = 0;
  for (const range of mergedRanges(ranges)) {
    if (range.start > cursor) {
      break;
    }
    cursor = Math.max(cursor, range.end);
  }
  return cursor;
}

function acceptSequentialChunk(state, offset, length) {
  assert.equal(offset, state.receivedBytes, `expected sequential offset ${state.receivedBytes}, got ${offset}`);
  assert.ok(length > 0 && length <= state.maxChunkBytes, `invalid chunk length ${length}`);
  assert.ok(offset + length <= state.expectedBytes, "chunk exceeds declared file size");
  state.receivedRanges = mergedRanges([...state.receivedRanges, { start: offset, end: offset + length }]);
  state.receivedBytes = contiguousReceivedBytes(state.receivedRanges);
  return state;
}

function assertModelGuards() {
  const duplicate = { expectedBytes: 4, receivedBytes: 0, receivedRanges: [], maxChunkBytes: 4 };
  acceptSequentialChunk(duplicate, 0, 2);
  assert.throws(() => acceptSequentialChunk(duplicate, 0, 2), /expected sequential offset 2/);
  assert.equal(duplicate.receivedBytes, 2, "duplicate chunk must not advance receivedBytes");

  const overlap = { expectedBytes: 4, receivedBytes: 0, receivedRanges: [], maxChunkBytes: 4 };
  acceptSequentialChunk(overlap, 0, 2);
  assert.throws(() => acceptSequentialChunk(overlap, 1, 2), /expected sequential offset 2/);
  assert.equal(overlap.receivedBytes, 2, "overlapping chunk must not advance receivedBytes");

  const complete = { expectedBytes: 4, receivedBytes: 0, receivedRanges: [], maxChunkBytes: 2 };
  acceptSequentialChunk(complete, 0, 2);
  acceptSequentialChunk(complete, 2, 2);
  assert.equal(complete.receivedBytes, 4, "sequential chunks should complete exact bytes");

  assert.equal(contiguousReceivedBytes([{ start: 2, end: 4 }]), 0, "out-of-order tail is not contiguous from zero");
  assert.equal(
    contiguousReceivedBytes([
      { start: 0, end: 2 },
      { start: 1, end: 3 },
    ]),
    3,
    "merged overlapping ranges should count covered bytes, not duplicate chunk totals",
  );
  print("OK", "Mac file clipboard range model rejects duplicate and overlapping progress");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const source = readFileSync(sourcePath, "utf8");
  assertSourceGuards(source);
  assertModelGuards();
  print("OK", "Mac host file clipboard integrity checks passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.stack || error.message}`);
  process.exitCode = 1;
});
