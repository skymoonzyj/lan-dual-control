(function attachMappingUtils(global) {
  function positiveNumber(value, fallback = 1) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function computeDisplayedFrameRect({
    canvasLeft = 0,
    canvasTop = 0,
    canvasWidth = 1,
    canvasHeight = 1,
    scrollLeft = 0,
    scrollTop = 0,
    frameWidth = 1,
    frameHeight = 1,
    scaleMode = "fit",
  } = {}) {
    const safeCanvasWidth = positiveNumber(canvasWidth);
    const safeCanvasHeight = positiveNumber(canvasHeight);
    const safeFrameWidth = positiveNumber(frameWidth);
    const safeFrameHeight = positiveNumber(frameHeight);

    if (scaleMode === "stretch") {
      return {
        left: Number(canvasLeft) || 0,
        top: Number(canvasTop) || 0,
        width: safeCanvasWidth,
        height: safeCanvasHeight,
      };
    }

    if (scaleMode === "original") {
      return {
        left: (Number(canvasLeft) || 0) - (Number(scrollLeft) || 0),
        top: (Number(canvasTop) || 0) - (Number(scrollTop) || 0),
        width: safeFrameWidth,
        height: safeFrameHeight,
      };
    }

    const scale = Math.min(safeCanvasWidth / safeFrameWidth, safeCanvasHeight / safeFrameHeight);
    const width = safeFrameWidth * scale;
    const height = safeFrameHeight * scale;

    return {
      left: (Number(canvasLeft) || 0) + (safeCanvasWidth - width) / 2,
      top: (Number(canvasTop) || 0) + (safeCanvasHeight - height) / 2,
      width,
      height,
    };
  }

  function mapClientPointToRemote({
    clientX = 0,
    clientY = 0,
    frameRect,
    remoteFrameWidth = 1,
    remoteFrameHeight = 1,
  } = {}) {
    if (!frameRect) {
      return null;
    }

    const width = positiveNumber(frameRect.width);
    const height = positiveNumber(frameRect.height);
    const x = ((Number(clientX) || 0) - (Number(frameRect.left) || 0)) / width;
    const y = ((Number(clientY) || 0) - (Number(frameRect.top) || 0)) / height;

    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return null;
    }

    const normalizedX = Math.min(1, Math.max(0, x));
    const normalizedY = Math.min(1, Math.max(0, y));
    const remoteMaxX = Math.max(0, Math.round(positiveNumber(remoteFrameWidth) - 1));
    const remoteMaxY = Math.max(0, Math.round(positiveNumber(remoteFrameHeight) - 1));

    return {
      x: normalizedX,
      y: normalizedY,
      remoteX: Math.round(normalizedX * remoteMaxX),
      remoteY: Math.round(normalizedY * remoteMaxY),
      frameRect,
    };
  }

  const api = {
    computeDisplayedFrameRect,
    mapClientPointToRemote,
  };

  global.LanDualMapping = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
