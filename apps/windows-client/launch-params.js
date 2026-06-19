(function attachLanDualLaunchParams(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LanDualLaunchParams = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function createLanDualLaunchParams() {
  const allowedTransports = new Set(["local", "websocket"]);

  function firstParam(params, names) {
    for (const name of names) {
      const value = params.get(name);
      if (value != null && String(value).trim() !== "") return String(value).trim();
    }
    return "";
  }

  function parseBoolean(value, fallback = false) {
    if (value == null || value === "") return fallback;
    return /^(1|true|yes|on)$/i.test(String(value));
  }

  function parsePort(value) {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return "";
    return String(port);
  }

  function parseLaunchParams(search) {
    const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    const host = firstParam(params, ["host", "targetHost", "macHost"]);
    const port = parsePort(firstParam(params, ["port", "targetPort", "macPort"]));
    const transportCandidate = firstParam(params, ["transport", "mode"]);
    const transport = allowedTransports.has(transportCandidate) ? transportCandidate : "";
    const clearDemoPassword = parseBoolean(params.get("clearDemoPassword"), Boolean(host || port));
    const focusPassword = parseBoolean(params.get("focusPassword"), Boolean(host || port));
    return {
      applied: Boolean(host || port || transport),
      host,
      port,
      transport,
      clearDemoPassword,
      focusPassword,
    };
  }

  function applyLaunchParams({ search, elements, log } = {}) {
    const parsed = parseLaunchParams(search);
    if (!parsed.applied || !elements) return parsed;

    if (parsed.transport && elements.transportSelect) {
      elements.transportSelect.value = parsed.transport;
    }
    if (parsed.host && elements.hostInput) {
      elements.hostInput.value = parsed.host;
    }
    if (parsed.port && elements.portInput) {
      elements.portInput.value = parsed.port;
    }
    if (
      parsed.clearDemoPassword &&
      elements.passwordInput &&
      elements.passwordInput.value === "demo-password"
    ) {
      elements.passwordInput.value = "";
    }
    if (elements.mockScenarioSelect) {
      elements.mockScenarioSelect.value = "normal";
    }

    const target = [parsed.host, parsed.port].filter(Boolean).join(":");
    if (typeof log === "function" && target) {
      log("一键入口", `已预填 Mac 目标 ${target}，请在页面输入当前临时密码后连接`);
    }
    return parsed;
  }

  return {
    parseLaunchParams,
    applyLaunchParams,
  };
});