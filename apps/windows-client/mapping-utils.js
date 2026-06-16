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

  const defaultKeyboardMapping = {
    win: "meta",
    alt: "alt",
    ctrl: "ctrl",
  };

  const remoteModifierLabels = {
    meta: "⌘ Command",
    alt: "⌥ Option",
    ctrl: "^ Control",
    shift: "⇧ Shift",
    none: "不映射",
  };

  const windowsShortcutMap = {
    a: { key: "a", code: "KeyA", action: "select_all", label: "全选" },
    c: { key: "c", code: "KeyC", action: "copy", label: "复制" },
    f: { key: "f", code: "KeyF", action: "find", label: "查找" },
    n: { key: "n", code: "KeyN", action: "new", label: "新建" },
    o: { key: "o", code: "KeyO", action: "open", label: "打开" },
    p: { key: "p", code: "KeyP", action: "print", label: "打印" },
    r: { key: "r", code: "KeyR", action: "reload", label: "刷新" },
    s: { key: "s", code: "KeyS", action: "save", label: "保存" },
    t: { key: "t", code: "KeyT", action: "new_tab", label: "新建标签" },
    v: { key: "v", code: "KeyV", action: "paste", label: "粘贴" },
    w: { key: "w", code: "KeyW", action: "close", label: "关闭" },
    x: { key: "x", code: "KeyX", action: "cut", label: "剪切" },
    y: { key: "z", code: "KeyZ", action: "redo", label: "重做", forceShift: true },
    z: { key: "z", code: "KeyZ", action: "undo", label: "撤销" },
  };

  function normalizeKeyMapValue(value, fallback) {
    return Object.prototype.hasOwnProperty.call(remoteModifierLabels, value) ? value : fallback;
  }

  function normalizeKeyboardMapping(mapping = defaultKeyboardMapping) {
    return {
      win: normalizeKeyMapValue(mapping.win, defaultKeyboardMapping.win),
      alt: normalizeKeyMapValue(mapping.alt, defaultKeyboardMapping.alt),
      ctrl: normalizeKeyMapValue(mapping.ctrl, defaultKeyboardMapping.ctrl),
    };
  }

  function addMappedModifier(modifiers, modifier) {
    if (modifier && modifier !== "none") {
      modifiers.add(modifier);
    }
  }

  function getMacShortcutOverride(event, { shortcutCompatibility = true } = {}) {
    if (!shortcutCompatibility || !event?.ctrlKey || event.altKey || event.metaKey) {
      return null;
    }

    const key = String(event.key ?? "").toLowerCase();
    const shortcut = windowsShortcutMap[key];
    if (!shortcut) {
      return null;
    }

    const modifiers = new Set(["meta"]);
    if (event.shiftKey || shortcut.forceShift) {
      modifiers.add("shift");
    }

    const action = key === "z" && event.shiftKey ? "redo" : shortcut.action;
    const label = key === "z" && event.shiftKey ? "重做" : shortcut.label;
    return {
      ...shortcut,
      action,
      label,
      modifiers: [...modifiers],
    };
  }

  function mapKeyboardInput(event, {
    keyboardMapping = defaultKeyboardMapping,
    shortcutCompatibility = true,
  } = {}) {
    const mapping = normalizeKeyboardMapping(keyboardMapping);
    const shortcut = getMacShortcutOverride(event, { shortcutCompatibility });
    if (shortcut) {
      const modifiers = shortcut.modifiers;
      return {
        mapping,
        modifiers,
        key: shortcut.key,
        code: shortcut.code,
        ctrlKey: false,
        altKey: false,
        shiftKey: modifiers.includes("shift"),
        metaKey: true,
        shortcutProfile: "windows_to_macos",
        shortcutAction: shortcut.action,
        shortcutLabel: shortcut.label,
      };
    }

    const remoteModifiers = new Set();
    if (event?.shiftKey) {
      remoteModifiers.add("shift");
    }
    if (event?.metaKey) {
      addMappedModifier(remoteModifiers, mapping.win);
    }
    if (event?.altKey) {
      addMappedModifier(remoteModifiers, mapping.alt);
    }
    if (event?.ctrlKey) {
      addMappedModifier(remoteModifiers, mapping.ctrl);
    }

    const modifiers = [...remoteModifiers];
    return {
      mapping,
      modifiers,
      ctrlKey: modifiers.includes("ctrl"),
      altKey: modifiers.includes("alt"),
      shiftKey: modifiers.includes("shift"),
      metaKey: modifiers.includes("meta"),
    };
  }

  function describeKeyboardInput(event, mapped) {
    const prefix = (mapped?.modifiers || [])
      .map((modifier) => remoteModifierLabels[modifier] ?? modifier)
      .join("+");
    const key = mapped?.key ?? event?.key ?? "";
    const label = mapped?.shortcutLabel ? ` · ${mapped.shortcutLabel}` : "";
    return `${prefix ? `${prefix}+` : ""}${key}${label}`;
  }

  const api = {
    computeDisplayedFrameRect,
    mapClientPointToRemote,
    defaultKeyboardMapping,
    remoteModifierLabels,
    windowsShortcutMap,
    normalizeKeyMapValue,
    normalizeKeyboardMapping,
    mapKeyboardInput,
    describeKeyboardInput,
  };

  global.LanDualMapping = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
