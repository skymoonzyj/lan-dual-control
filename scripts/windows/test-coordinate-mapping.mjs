import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  computeDisplayedFrameRect,
  defaultKeyboardMapping,
  describeKeyboardInput,
  mapKeyboardInput,
  mapClientPointToRemote,
  normalizeKeyboardMapping,
} = require("../../apps/windows-client/mapping-utils.js");

function printUsage() {
  console.log(`Usage:
  node scripts/windows/test-coordinate-mapping.mjs [options]

Options:
  --help, -h                  Show this help without running coordinate assertions

Description:
  Runs a small regression suite for Windows client canvas-to-remote coordinate mapping
  and Windows-to-macOS keyboard shortcut mapping.

Examples:
  node scripts/windows/test-coordinate-mapping.mjs
  node scripts/windows/test-coordinate-mapping.mjs --help
`);
}

function approx(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) < 0.000001,
    `${label}: expected ${expected}, got ${actual}`,
  );
}

function mapPoint({ scaleMode, clientX, clientY, canvasWidth = 1280, canvasHeight = 720, scrollLeft = 0, scrollTop = 0 }) {
  const frameRect = computeDisplayedFrameRect({
    canvasLeft: 10,
    canvasTop: 20,
    canvasWidth,
    canvasHeight,
    scrollLeft,
    scrollTop,
    frameWidth: 1920,
    frameHeight: 1080,
    scaleMode,
  });
  return mapClientPointToRemote({
    clientX,
    clientY,
    frameRect,
    remoteFrameWidth: 1920,
    remoteFrameHeight: 1080,
  });
}

function keyEvent(overrides = {}) {
  return {
    key: "c",
    code: "KeyC",
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    repeat: false,
    ...overrides,
  };
}

function assertShortcut(event, expected) {
  const mapped = mapKeyboardInput(keyEvent(event), {
    keyboardMapping: expected.keyboardMapping ?? defaultKeyboardMapping,
    shortcutCompatibility: expected.shortcutCompatibility ?? true,
  });
  assert.equal(mapped.key, expected.key, `${expected.label} key`);
  assert.equal(mapped.code, expected.code, `${expected.label} code`);
  assert.equal(mapped.shortcutAction, expected.action, `${expected.label} action`);
  assert.equal(mapped.shortcutProfile, "windows_to_macos", `${expected.label} profile`);
  assert.deepEqual(mapped.modifiers, expected.modifiers, `${expected.label} modifiers`);
  assert.equal(mapped.ctrlKey, expected.ctrlKey ?? false, `${expected.label} ctrlKey`);
  assert.equal(mapped.metaKey, expected.metaKey ?? true, `${expected.label} metaKey`);
  assert.equal(mapped.shiftKey, expected.shiftKey ?? expected.modifiers.includes("shift"), `${expected.label} shiftKey`);
}

function runCoordinateMappingChecks() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const fitRect = computeDisplayedFrameRect({
    canvasLeft: 10,
    canvasTop: 20,
    canvasWidth: 1000,
    canvasHeight: 1000,
    frameWidth: 1920,
    frameHeight: 1080,
    scaleMode: "fit",
  });
  approx(fitRect.left, 10, "fit left");
  approx(fitRect.top, 238.75, "fit top letterbox");
  approx(fitRect.width, 1000, "fit width");
  approx(fitRect.height, 562.5, "fit height");
  assert.equal(mapPoint({ scaleMode: "fit", canvasWidth: 1000, canvasHeight: 1000, clientX: 20, clientY: 40 }), null);
  assert.deepEqual(
    mapPoint({ scaleMode: "fit", canvasWidth: 1000, canvasHeight: 1000, clientX: 510, clientY: 520 }),
    {
      x: 0.5,
      y: 0.5,
      remoteX: 960,
      remoteY: 540,
      frameRect: fitRect,
    },
  );

  const stretch = mapPoint({ scaleMode: "stretch", clientX: 650, clientY: 380 });
  approx(stretch.x, 0.5, "stretch x");
  approx(stretch.y, 0.5, "stretch y");
  assert.equal(stretch.remoteX, 960);
  assert.equal(stretch.remoteY, 540);

  const originalRect = computeDisplayedFrameRect({
    canvasLeft: 10,
    canvasTop: 20,
    canvasWidth: 640,
    canvasHeight: 360,
    scrollLeft: 400,
    scrollTop: 200,
    frameWidth: 1920,
    frameHeight: 1080,
    scaleMode: "original",
  });
  assert.deepEqual(originalRect, { left: -390, top: -180, width: 1920, height: 1080 });
  const original = mapPoint({
    scaleMode: "original",
    canvasWidth: 640,
    canvasHeight: 360,
    scrollLeft: 400,
    scrollTop: 200,
    clientX: 570,
    clientY: 360,
  });
  approx(original.x, 0.5, "original scrolled x");
  approx(original.y, 0.5, "original scrolled y");
  assert.equal(original.remoteX, 960);
  assert.equal(original.remoteY, 540);
}

function runKeyboardMappingChecks() {
  assert.deepEqual(
    normalizeKeyboardMapping({ win: "meta", alt: "alt", ctrl: "invalid" }),
    defaultKeyboardMapping,
    "invalid modifier mapping falls back to defaults",
  );

  assertShortcut({ key: "a", code: "KeyA", ctrlKey: true }, {
    label: "Ctrl+A",
    key: "a",
    code: "KeyA",
    action: "select_all",
    modifiers: ["meta"],
  });
  assertShortcut({ key: "c", code: "KeyC", ctrlKey: true }, {
    label: "Ctrl+C",
    key: "c",
    code: "KeyC",
    action: "copy",
    modifiers: ["meta"],
  });
  assertShortcut({ key: "v", code: "KeyV", ctrlKey: true }, {
    label: "Ctrl+V",
    key: "v",
    code: "KeyV",
    action: "paste",
    modifiers: ["meta"],
  });
  assertShortcut({ key: "x", code: "KeyX", ctrlKey: true }, {
    label: "Ctrl+X",
    key: "x",
    code: "KeyX",
    action: "cut",
    modifiers: ["meta"],
  });
  assertShortcut({ key: "z", code: "KeyZ", ctrlKey: true }, {
    label: "Ctrl+Z",
    key: "z",
    code: "KeyZ",
    action: "undo",
    modifiers: ["meta"],
  });
  assertShortcut({ key: "z", code: "KeyZ", ctrlKey: true, shiftKey: true }, {
    label: "Ctrl+Shift+Z",
    key: "z",
    code: "KeyZ",
    action: "redo",
    modifiers: ["meta", "shift"],
    shiftKey: true,
  });
  assertShortcut({ key: "y", code: "KeyY", ctrlKey: true }, {
    label: "Ctrl+Y",
    key: "z",
    code: "KeyZ",
    action: "redo",
    modifiers: ["meta", "shift"],
    shiftKey: true,
  });

  const ctrlWithoutCompatibility = mapKeyboardInput(keyEvent({ key: "c", code: "KeyC", ctrlKey: true }), {
    shortcutCompatibility: false,
  });
  assert.deepEqual(ctrlWithoutCompatibility.modifiers, ["ctrl"], "Ctrl maps to Control when shortcut compatibility is disabled");
  assert.equal(ctrlWithoutCompatibility.ctrlKey, true, "Ctrl key is preserved when compatibility is disabled");
  assert.equal(ctrlWithoutCompatibility.metaKey, false, "Command is not forced when compatibility is disabled");

  const custom = mapKeyboardInput(keyEvent({ key: "k", code: "KeyK", ctrlKey: true, altKey: true, metaKey: true }), {
    keyboardMapping: {
      win: "none",
      alt: "meta",
      ctrl: "alt",
    },
    shortcutCompatibility: true,
  });
  assert.deepEqual(custom.modifiers, ["meta", "alt"], "custom Win/Alt/Ctrl mapping applies outside shortcut overrides");
  assert.equal(custom.metaKey, true, "custom mapping sets meta");
  assert.equal(custom.altKey, true, "custom mapping sets alt");
  assert.equal(custom.ctrlKey, false, "custom mapping can suppress ctrl");

  const description = describeKeyboardInput(keyEvent({ key: "c", code: "KeyC", ctrlKey: true }), mapKeyboardInput(keyEvent({ key: "c", code: "KeyC", ctrlKey: true })));
  assert.equal(description, "⌘ Command+c · 复制", "keyboard description includes remote modifier and shortcut label");
}

function run() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  runCoordinateMappingChecks();
  runKeyboardMappingChecks();
  console.log("coordinate and keyboard mapping ok");
}

run();
