import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  computeDisplayedFrameRect,
  mapClientPointToRemote,
} = require("../../apps/windows-client/mapping-utils.js");

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

console.log("coordinate mapping ok");
