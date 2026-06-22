#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..", "..");
const docPath = path.join(repoRoot, "docs", "w8-rustdesk-audit.md");

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) fail(`${label} missing "${needle}"`);
}

if (!fs.existsSync(docPath)) fail("docs/w8-rustdesk-audit.md is missing");

const text = fs.readFileSync(docPath, "utf8");

for (const needle of [
  "W8-RUSTDESK-AUDIT",
  "AGPL 边界",
  "RustDesk 做法",
  "我们怎么自己实现",
  "涉及我们文件",
  "最小补丁",
  "测试命令",
  "真实验收字段",
]) {
  assertIncludes(text, needle, "required audit section");
}

for (const area of [
  "video_service",
  "VideoQoS",
  "硬编解码失败",
  "VideoReceived",
  "10ms",
]) {
  assertIncludes(text, area, "RustDesk reference area");
}

for (const ourFile of [
  "apps/windows-desktop/src-tauri/src/w8_native_video.rs",
  "apps/windows-client/app.js",
  "scripts/windows/test-windows-client-browser.mjs",
  "docs/w8-windows-desktop-video-plan.md",
]) {
  assertIncludes(text, ourFile, "local implementation mapping");
}

for (const field of [
  "mainSurface=native-hwnd",
  "presenting=yes",
  "presentGap",
  "w8Decoder",
  "arrivalSource",
  "desiredFps",
  "desiredBitrateKbps",
  "nativeFailureClass",
]) {
  assertIncludes(text, field, "acceptance field");
}

const forbiddenSourceShapes = [
  /fn\s+run\s*\(/,
  /impl\s+VideoQoS/,
  /pub\s+struct\s+VideoQoS/,
  /while\s+sp\.ok\(\)/,
];
for (const pattern of forbiddenSourceShapes) {
  if (pattern.test(text)) fail(`audit doc appears to copy RustDesk source shape: ${pattern}`);
}

console.log("[OK] W8 RustDesk audit doc covers required W11 mapping and AGPL boundary");
