import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const defaultInputTimeoutMs = 2500;
const modifierVirtualKeys = {
  ctrl: 0x11,
  control: 0x11,
  alt: 0x12,
  option: 0x12,
  shift: 0x10,
  meta: 0x5b,
  win: 0x5b,
  windows: 0x5b,
  command: 0x5b,
};
const namedVirtualKeys = {
  Backspace: 0x08,
  Tab: 0x09,
  Enter: 0x0d,
  Escape: 0x1b,
  " ": 0x20,
  Space: 0x20,
  Spacebar: 0x20,
  PageUp: 0x21,
  PageDown: 0x22,
  End: 0x23,
  Home: 0x24,
  ArrowLeft: 0x25,
  ArrowUp: 0x26,
  ArrowRight: 0x27,
  ArrowDown: 0x28,
  Insert: 0x2d,
  Delete: 0x2e,
};
const codeVirtualKeys = {
  Semicolon: 0xba,
  Equal: 0xbb,
  Comma: 0xbc,
  Minus: 0xbd,
  Period: 0xbe,
  Slash: 0xbf,
  Backquote: 0xc0,
  BracketLeft: 0xdb,
  Backslash: 0xdc,
  BracketRight: 0xdd,
  Quote: 0xde,
};

function normalizeInputMode(mode) {
  return ["auto", "system", "log"].includes(mode) ? mode : "auto";
}

function clampNumber(value, min, max, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function uniqueModifiers(modifiers = []) {
  return Array.from(new Set(modifiers.map((item) => String(item).toLowerCase())));
}

function virtualKeyFromCode(code) {
  const normalized = String(code || "");
  if (/^Key[A-Z]$/.test(normalized)) {
    return normalized.charCodeAt(3);
  }
  if (/^Digit[0-9]$/.test(normalized)) {
    return normalized.charCodeAt(5);
  }
  if (/^Numpad[0-9]$/.test(normalized)) {
    return 0x60 + Number(normalized.at(-1));
  }
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(normalized)) {
    return 0x6f + Number(normalized.slice(1));
  }
  return codeVirtualKeys[normalized] || null;
}

function virtualKeyFromKey(key) {
  const normalized = String(key || "");
  if (namedVirtualKeys[normalized]) {
    return namedVirtualKeys[normalized];
  }
  if (normalized.length === 1) {
    const upper = normalized.toUpperCase();
    if (upper >= "A" && upper <= "Z") {
      return upper.charCodeAt(0);
    }
    if (upper >= "0" && upper <= "9") {
      return upper.charCodeAt(0);
    }
  }
  return null;
}

function virtualKeyFromInput(message) {
  return virtualKeyFromCode(message.code) || virtualKeyFromKey(message.key);
}

function modifierKeyEvents(modifiers, keyUp = false) {
  return uniqueModifiers(modifiers)
    .map((modifier) => modifierVirtualKeys[modifier])
    .filter(Boolean)
    .map((vk) => ({ vk, keyUp }));
}

function buildKeyboardEvents(message) {
  const key = virtualKeyFromInput(message);
  if (!key) {
    return [];
  }

  const modifiers = Array.isArray(message.remoteModifiers)
    ? message.remoteModifiers
    : Array.isArray(message.modifiers)
      ? message.modifiers
      : [];
  const modifierDown = modifierKeyEvents(modifiers, false);
  const modifierUp = modifierKeyEvents(modifiers, true).reverse();
  const action = String(message.action || "key").toLowerCase();

  if (action === "down") {
    return [...modifierDown, { vk: key, keyUp: false }];
  }
  if (action === "up") {
    return [{ vk: key, keyUp: true }, ...modifierUp];
  }

  return [
    ...modifierDown,
    { vk: key, keyUp: false },
    { vk: key, keyUp: true },
    ...modifierUp,
  ];
}

function makeInjectionPayload(message) {
  const event = message.event ?? message.action ?? message.kind ?? "unknown";
  const normalizedEvent = String(event).toLowerCase();
  const payload = {
    event: normalizedEvent,
    x: clampNumber(message.x, 0, 1, 0),
    y: clampNumber(message.y, 0, 1, 0),
    button: String(message.button || "left").toLowerCase(),
    buttonAction: String(message.action || "down").toLowerCase(),
    deltaX: Math.round(Number(message.deltaX || 0)),
    deltaY: Math.round(Number(message.deltaY || 0)),
    keyEvents: [],
  };

  if (normalizedEvent === "key") {
    payload.keyEvents = buildKeyboardEvents(message);
  }

  return payload;
}

const sendInputScript = String.raw`
$ErrorActionPreference = 'Stop'
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class LanDualInput {
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT {
    public UInt32 type;
    public InputUnion U;
  }

  [StructLayout(LayoutKind.Explicit)]
  public struct InputUnion {
    [FieldOffset(0)]
    public MOUSEINPUT mi;
    [FieldOffset(0)]
    public KEYBDINPUT ki;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT {
    public Int32 dx;
    public Int32 dy;
    public UInt32 mouseData;
    public UInt32 dwFlags;
    public UInt32 time;
    public IntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT {
    public UInt16 wVk;
    public UInt16 wScan;
    public UInt32 dwFlags;
    public UInt32 time;
    public IntPtr dwExtraInfo;
  }

  [DllImport("user32.dll", SetLastError = true)]
  public static extern UInt32 SendInput(UInt32 nInputs, INPUT[] pInputs, Int32 cbSize);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SetCursorPos(Int32 X, Int32 Y);

  [DllImport("user32.dll")]
  public static extern Int32 GetSystemMetrics(Int32 nIndex);

  public static bool Move(double x, double y) {
    int width = Math.Max(1, GetSystemMetrics(0));
    int height = Math.Max(1, GetSystemMetrics(1));
    int px = Math.Max(0, Math.Min(width - 1, (int)Math.Round(x * (width - 1))));
    int py = Math.Max(0, Math.Min(height - 1, (int)Math.Round(y * (height - 1))));
    return SetCursorPos(px, py);
  }

  public static bool MouseButton(string button, string action) {
    UInt32 flag;
    string normalizedButton = (button ?? "left").ToLowerInvariant();
    bool up = (action ?? "down").ToLowerInvariant() == "up";
    if (normalizedButton == "right") flag = up ? 0x0010u : 0x0008u;
    else if (normalizedButton == "middle" || normalizedButton == "center") flag = up ? 0x0040u : 0x0020u;
    else flag = up ? 0x0004u : 0x0002u;
    return Mouse(flag, 0);
  }

  public static bool Wheel(int deltaX, int deltaY) {
    bool ok = true;
    if (deltaY != 0) ok = Mouse(0x0800u, unchecked((UInt32)(-deltaY))) && ok;
    if (deltaX != 0) ok = Mouse(0x01000u, unchecked((UInt32)deltaX)) && ok;
    return ok;
  }

  public static bool Key(UInt16 vk, bool keyUp) {
    INPUT[] inputs = new INPUT[1];
    inputs[0].type = 1;
    inputs[0].U.ki.wVk = vk;
    inputs[0].U.ki.wScan = 0;
    inputs[0].U.ki.dwFlags = keyUp ? 0x0002u : 0u;
    inputs[0].U.ki.time = 0;
    inputs[0].U.ki.dwExtraInfo = IntPtr.Zero;
    return SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT))) == 1;
  }

  private static bool Mouse(UInt32 flags, UInt32 data) {
    INPUT[] inputs = new INPUT[1];
    inputs[0].type = 0;
    inputs[0].U.mi.dx = 0;
    inputs[0].U.mi.dy = 0;
    inputs[0].U.mi.mouseData = data;
    inputs[0].U.mi.dwFlags = flags;
    inputs[0].U.mi.time = 0;
    inputs[0].U.mi.dwExtraInfo = IntPtr.Zero;
    return SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT))) == 1;
  }
}
"@

function Invoke-LanDualInput {
  param($payload)

  $ok = $true
  if ($payload.event -eq 'mouse_move') {
    $ok = [LanDualInput]::Move([double]$payload.x, [double]$payload.y)
  } elseif ($payload.event -eq 'mouse_button') {
    [void][LanDualInput]::Move([double]$payload.x, [double]$payload.y)
    $ok = [LanDualInput]::MouseButton([string]$payload.button, [string]$payload.buttonAction)
  } elseif ($payload.event -eq 'mouse_wheel') {
    [void][LanDualInput]::Move([double]$payload.x, [double]$payload.y)
    $ok = [LanDualInput]::Wheel([int]$payload.deltaX, [int]$payload.deltaY)
  } elseif ($payload.event -eq 'key') {
    if ($payload.keyEvents.Count -eq 0) { throw "Unsupported key event" }
    foreach ($item in $payload.keyEvents) {
      $ok = [LanDualInput]::Key([UInt16]$item.vk, [bool]$item.keyUp) -and $ok
    }
  } else {
    throw "Unsupported input event: $($payload.event)"
  }

  if (-not $ok) { throw "SendInput returned failure" }
  return $true
}

while ($null -ne ($line = [Console]::In.ReadLine())) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $requestId = ""
  try {
    $payload = $line | ConvertFrom-Json
    $requestId = [string]$payload.requestId
    [void](Invoke-LanDualInput $payload)
    [Console]::Out.WriteLine((@{ requestId = $requestId; ok = $true } | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
  } catch {
    [Console]::Out.WriteLine((@{ requestId = $requestId; ok = $false; reason = $_.Exception.Message } | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
  }
}
`;

const sendInputHelperSource = String.raw`
using System;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;

public static class Program {
  private static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer();

  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT {
    public UInt32 type;
    public InputUnion U;
  }

  [StructLayout(LayoutKind.Explicit)]
  public struct InputUnion {
    [FieldOffset(0)]
    public MOUSEINPUT mi;
    [FieldOffset(0)]
    public KEYBDINPUT ki;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT {
    public Int32 dx;
    public Int32 dy;
    public UInt32 mouseData;
    public UInt32 dwFlags;
    public UInt32 time;
    public IntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT {
    public UInt16 wVk;
    public UInt16 wScan;
    public UInt32 dwFlags;
    public UInt32 time;
    public IntPtr dwExtraInfo;
  }

  [DllImport("user32.dll", SetLastError = true)]
  public static extern UInt32 SendInput(UInt32 nInputs, INPUT[] pInputs, Int32 cbSize);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SetCursorPos(Int32 X, Int32 Y);

  [DllImport("user32.dll")]
  public static extern Int32 GetSystemMetrics(Int32 nIndex);

  public static void Main() {
    string line;
    while ((line = Console.ReadLine()) != null) {
      if (String.IsNullOrWhiteSpace(line)) continue;
      string requestId = "";
      try {
        Dictionary<string, object> payload = Serializer.Deserialize<Dictionary<string, object>>(line);
        requestId = GetString(payload, "requestId");
        Invoke(payload);
        WriteResponse(requestId, true, "");
      } catch (Exception error) {
        WriteResponse(requestId, false, error.Message);
      }
    }
  }

  private static void Invoke(Dictionary<string, object> payload) {
    string eventName = GetString(payload, "event");
    bool ok = true;
    if (eventName == "mouse_move") {
      ok = Move(GetDouble(payload, "x"), GetDouble(payload, "y"));
    } else if (eventName == "mouse_button") {
      Move(GetDouble(payload, "x"), GetDouble(payload, "y"));
      ok = MouseButton(GetString(payload, "button", "left"), GetString(payload, "buttonAction", "down"));
    } else if (eventName == "mouse_wheel") {
      Move(GetDouble(payload, "x"), GetDouble(payload, "y"));
      ok = Wheel(GetInt(payload, "deltaX"), GetInt(payload, "deltaY"));
    } else if (eventName == "key") {
      object keyEventsObject;
      if (!payload.TryGetValue("keyEvents", out keyEventsObject) || keyEventsObject == null) {
        throw new Exception("Unsupported key event");
      }
      IEnumerable keyEvents = keyEventsObject as IEnumerable;
      if (keyEvents == null) {
        throw new Exception("Unsupported key event");
      }
      int count = 0;
      foreach (object item in keyEvents) {
        Dictionary<string, object> keyEvent = item as Dictionary<string, object>;
        if (keyEvent == null) {
          throw new Exception("Unsupported key event");
        }
        ok = Key((UInt16)GetInt(keyEvent, "vk"), GetBool(keyEvent, "keyUp")) && ok;
        count += 1;
      }
      if (count == 0) {
        throw new Exception("Unsupported key event");
      }
    } else {
      throw new Exception("Unsupported input event: " + eventName);
    }

    if (!ok) {
      throw new Exception("SendInput returned failure");
    }
  }

  private static bool Move(double x, double y) {
    int width = Math.Max(1, GetSystemMetrics(0));
    int height = Math.Max(1, GetSystemMetrics(1));
    int px = Math.Max(0, Math.Min(width - 1, (int)Math.Round(x * (width - 1))));
    int py = Math.Max(0, Math.Min(height - 1, (int)Math.Round(y * (height - 1))));
    return SetCursorPos(px, py);
  }

  private static bool MouseButton(string button, string action) {
    UInt32 flag;
    string normalizedButton = (button ?? "left").ToLowerInvariant();
    bool up = (action ?? "down").ToLowerInvariant() == "up";
    if (normalizedButton == "right") flag = up ? 0x0010u : 0x0008u;
    else if (normalizedButton == "middle" || normalizedButton == "center") flag = up ? 0x0040u : 0x0020u;
    else flag = up ? 0x0004u : 0x0002u;
    return Mouse(flag, 0);
  }

  private static bool Wheel(int deltaX, int deltaY) {
    bool ok = true;
    if (deltaY != 0) ok = Mouse(0x0800u, unchecked((UInt32)(-deltaY))) && ok;
    if (deltaX != 0) ok = Mouse(0x01000u, unchecked((UInt32)deltaX)) && ok;
    return ok;
  }

  private static bool Key(UInt16 vk, bool keyUp) {
    INPUT[] inputs = new INPUT[1];
    inputs[0].type = 1;
    inputs[0].U.ki.wVk = vk;
    inputs[0].U.ki.wScan = 0;
    inputs[0].U.ki.dwFlags = keyUp ? 0x0002u : 0u;
    inputs[0].U.ki.time = 0;
    inputs[0].U.ki.dwExtraInfo = IntPtr.Zero;
    return SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT))) == 1;
  }

  private static bool Mouse(UInt32 flags, UInt32 data) {
    INPUT[] inputs = new INPUT[1];
    inputs[0].type = 0;
    inputs[0].U.mi.dx = 0;
    inputs[0].U.mi.dy = 0;
    inputs[0].U.mi.mouseData = data;
    inputs[0].U.mi.dwFlags = flags;
    inputs[0].U.mi.time = 0;
    inputs[0].U.mi.dwExtraInfo = IntPtr.Zero;
    return SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT))) == 1;
  }

  private static string GetString(Dictionary<string, object> payload, string key, string fallback = "") {
    object value;
    if (!payload.TryGetValue(key, out value) || value == null) return fallback;
    return Convert.ToString(value);
  }

  private static int GetInt(Dictionary<string, object> payload, string key, int fallback = 0) {
    object value;
    if (!payload.TryGetValue(key, out value) || value == null) return fallback;
    return Convert.ToInt32(value);
  }

  private static double GetDouble(Dictionary<string, object> payload, string key, double fallback = 0) {
    object value;
    if (!payload.TryGetValue(key, out value) || value == null) return fallback;
    return Convert.ToDouble(value);
  }

  private static bool GetBool(Dictionary<string, object> payload, string key, bool fallback = false) {
    object value;
    if (!payload.TryGetValue(key, out value) || value == null) return fallback;
    return Convert.ToBoolean(value);
  }

  private static void WriteResponse(string requestId, bool ok, string reason) {
    Dictionary<string, object> response = new Dictionary<string, object>();
    response["requestId"] = requestId ?? "";
    response["ok"] = ok;
    if (!ok) response["reason"] = reason ?? "";
    Console.WriteLine(Serializer.Serialize(response));
    Console.Out.Flush();
  }
}
`;

export class WindowsInputInjector {
  constructor({
    logger,
    mode = process.env.LAN_DUAL_WINDOWS_INPUT_MODE || "auto",
    powershellCommand = process.env.LAN_DUAL_POWERSHELL || "powershell.exe",
    inputTimeoutMs = defaultInputTimeoutMs,
    helperExePath = process.env.LAN_DUAL_WINDOWS_INPUT_HELPER_EXE || "",
  } = {}) {
    this.logger = logger;
    this.mode = normalizeInputMode(mode);
    this.powershellCommand = powershellCommand;
    this.inputTimeoutMs = Number(inputTimeoutMs) || defaultInputTimeoutMs;
    this.helperExePath = helperExePath || join(tmpdir(), `lan-dual-control-input-helper-${process.pid}.exe`);
    this.helperCompiled = Boolean(helperExePath && existsSync(helperExePath));
    this.inputCount = 0;
    this.helper = null;
    this.helperStdoutBuffer = "";
    this.helperPending = new Map();
    this.helperRequestId = 0;
  }

  getCapabilities() {
    const available = this.canUseSystemInput();
    return {
      available,
      mode: available ? "system" : "log",
      backend: available ? "C# SendInput helper" : "log-only",
      helper: available ? "persistent-csharp" : "none",
      message: available
        ? "Windows 输入事件会通过常驻 C# SendInput helper 注入系统。"
        : "当前环境只记录输入事件；在 Windows 上会自动启用 SendInput。",
    };
  }

  canUseSystemInput() {
    if (this.mode === "log") {
      return false;
    }
    if (this.mode === "system") {
      return true;
    }
    return process.platform === "win32";
  }

  async inject(message) {
    this.inputCount += 1;
    const action = message.action ?? message.kind ?? message.event ?? "unknown";
    const detail = message.detail ?? `${message.remoteX ?? message.x ?? "-"},${message.remoteY ?? message.y ?? "-"}`;

    if (this.inputCount <= 8 || this.inputCount % 20 === 0) {
      this.logger?.info(`输入事件 #${this.inputCount}: ${action} / ${detail}`);
    }

    if (!this.canUseSystemInput()) {
      return {
        accepted: true,
        injected: false,
        mode: "log",
        reason: "当前环境不是 Windows，已记录输入事件但未注入系统。",
      };
    }

    const payload = makeInjectionPayload(message);
    if (payload.event === "key" && payload.keyEvents.length === 0) {
      return {
        accepted: false,
        injected: false,
        mode: "system",
        reason: `暂不支持的按键：${message.code || message.key || "unknown"}`,
      };
    }

    const result = await this.injectSystemInput(payload);
    if (!result.ok) {
      this.logger?.warn(`Windows 输入注入失败：${result.reason}`);
      return {
        accepted: false,
        injected: false,
        mode: "system",
        reason: result.reason,
      };
    }

    return {
      accepted: true,
      injected: true,
      mode: "system",
      reason: result.helper === "oneshot"
        ? "Windows SendInput 已执行。"
        : "Windows SendInput helper 已执行。",
    };
  }

  async injectSystemInput(payload) {
    const helperResult = await this.injectWithHelper(payload);
    if (helperResult.ok || helperResult.handled) {
      return helperResult;
    }

    return this.injectWithOneShot(payload);
  }

  injectWithOneShot(payload) {
    const result = spawnSync(
      this.powershellCommand,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", sendInputScript],
      {
        input: `${JSON.stringify({ ...payload, requestId: "oneshot" })}\n`,
        encoding: "utf8",
        timeout: this.inputTimeoutMs,
        windowsHide: true,
      },
    );

    if (result.error) {
      return {
        ok: false,
        reason:
          result.error.code === "ETIMEDOUT"
            ? `PowerShell 输入注入超时（${this.inputTimeoutMs} ms）`
            : result.error.message,
      };
    }

    if (result.status !== 0) {
      const stderr = String(result.stderr || "").trim();
      const stdout = String(result.stdout || "").trim();
      return {
        ok: false,
        reason: stderr || stdout || `PowerShell 退出码 ${result.status}`,
      };
    }

    const stdout = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean).at(-1);
    if (stdout) {
      try {
        const response = JSON.parse(stdout);
        if (response.ok) {
          return { ok: true, helper: "oneshot" };
        }
        return { ok: false, helper: "oneshot", reason: response.reason || "PowerShell 输入注入失败" };
      } catch {
        return { ok: false, helper: "oneshot", reason: `PowerShell 输入注入返回无法解析：${stdout}` };
      }
    }

    return { ok: false, helper: "oneshot", reason: "PowerShell 输入注入没有返回结果" };
  }

  injectWithHelper(payload) {
    let helper;
    try {
      helper = this.ensureHelper();
    } catch (error) {
      return Promise.resolve({
        ok: false,
        handled: false,
        reason: error.message,
      });
    }

    if (!helper?.stdin?.writable) {
      this.closeHelper("helper stdin unavailable");
      return Promise.resolve({
        ok: false,
        handled: false,
        reason: "PowerShell input helper is not writable",
      });
    }

    const requestId = `input-${Date.now().toString(16)}-${++this.helperRequestId}`;
    const message = `${JSON.stringify({ ...payload, requestId })}\n`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.helperPending.delete(requestId);
        this.closeHelper(`input helper timeout ${this.inputTimeoutMs} ms`);
        resolve({
          ok: false,
          handled: true,
          reason: `PowerShell 输入 helper 超时（${this.inputTimeoutMs} ms）`,
        });
      }, this.inputTimeoutMs);

      this.helperPending.set(requestId, {
        timer,
        resolve: (response) => {
          clearTimeout(timer);
          resolve({
            ok: Boolean(response.ok),
            handled: true,
            helper: "persistent",
            reason: response.reason || "",
          });
        },
      });

      helper.stdin.write(message, "utf8", (error) => {
        if (!error) {
          return;
        }
        const pending = this.helperPending.get(requestId);
        if (pending) {
          this.helperPending.delete(requestId);
          clearTimeout(timer);
          this.closeHelper(error.message);
          resolve({ ok: false, handled: true, reason: error.message });
        }
      });
    });
  }

  ensureHelper() {
    if (this.helper && !this.helper.killed && this.helper.stdin?.writable) {
      return this.helper;
    }

    const helperExe = this.ensureHelperExecutable();
    this.helperStdoutBuffer = "";
    const child = spawn(helperExe, [], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.helper = child;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => this.handleHelperStdout(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      const text = String(chunk).trim();
      if (text) {
        this.logger?.warn(`Windows 输入 helper 输出错误：${text}`);
      }
    });
    child.on("error", (error) => {
      this.failPendingHelperRequests(error.message);
      this.helper = null;
    });
    child.on("exit", (code, signal) => {
      if (this.helper === child) {
        this.helper = null;
      }
      this.failPendingHelperRequests(`PowerShell 输入 helper 已退出：${code ?? signal ?? "unknown"}`);
    });
    this.logger?.info("Windows 输入 helper 已启动：C# SendInput 常驻模式。");
    return child;
  }

  ensureHelperExecutable() {
    if (this.helperCompiled && existsSync(this.helperExePath)) {
      return this.helperExePath;
    }

    const escapedHelperExePath = this.helperExePath.replace(/'/g, "''");
    const compileScript = [
      "$ErrorActionPreference = 'Stop'",
      "$source = [Console]::In.ReadToEnd()",
      `Add-Type -TypeDefinition $source -OutputAssembly '${escapedHelperExePath}' -OutputType ConsoleApplication -ReferencedAssemblies System.Web.Extensions`,
    ].join("; ");
    const result = spawnSync(
      this.powershellCommand,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", compileScript],
      {
        input: sendInputHelperSource,
        encoding: "utf8",
        timeout: 15000,
        windowsHide: true,
      },
    );

    if (result.error) {
      throw new Error(
        result.error.code === "ETIMEDOUT"
          ? "C# 输入 helper 编译超时"
          : result.error.message,
      );
    }
    if (result.status !== 0 || !existsSync(this.helperExePath)) {
      const stderr = String(result.stderr || "").trim();
      const stdout = String(result.stdout || "").trim();
      throw new Error(stderr || stdout || `C# 输入 helper 编译失败：PowerShell 退出码 ${result.status}`);
    }

    this.helperCompiled = true;
    this.logger?.info(`Windows 输入 helper 已编译：${this.helperExePath}`);
    return this.helperExePath;
  }

  handleHelperStdout(chunk) {
    this.helperStdoutBuffer += String(chunk);
    let lineBreakIndex = this.helperStdoutBuffer.search(/\r?\n/);
    while (lineBreakIndex >= 0) {
      const line = this.helperStdoutBuffer.slice(0, lineBreakIndex).trim();
      this.helperStdoutBuffer = this.helperStdoutBuffer.slice(
        this.helperStdoutBuffer[lineBreakIndex] === "\r" &&
          this.helperStdoutBuffer[lineBreakIndex + 1] === "\n"
          ? lineBreakIndex + 2
          : lineBreakIndex + 1,
      );
      if (line) {
        this.handleHelperLine(line);
      }
      lineBreakIndex = this.helperStdoutBuffer.search(/\r?\n/);
    }
  }

  handleHelperLine(line) {
    let response;
    try {
      response = JSON.parse(line);
    } catch {
      this.logger?.warn(`Windows 输入 helper 返回了无法解析的内容：${line}`);
      return;
    }

    const requestId = response.requestId;
    const pending = this.helperPending.get(requestId);
    if (!pending) {
      this.logger?.warn(`Windows 输入 helper 返回了未知请求：${requestId || "missing"}`);
      return;
    }

    this.helperPending.delete(requestId);
    pending.resolve(response);
  }

  failPendingHelperRequests(reason) {
    for (const [requestId, pending] of this.helperPending.entries()) {
      this.helperPending.delete(requestId);
      clearTimeout(pending.timer);
      pending.resolve({ ok: false, reason });
    }
  }

  closeHelper(reason = "") {
    const helper = this.helper;
    this.helper = null;
    this.helperStdoutBuffer = "";
    this.failPendingHelperRequests(reason || "PowerShell input helper closed");
    if (helper && !helper.killed) {
      helper.kill();
    }
  }

  close() {
    this.closeHelper("Windows input injector closed");
    if (this.helperExePath && this.helperExePath.includes("lan-dual-control-input-helper-")) {
      try {
        rmSync(this.helperExePath, { force: true });
      } catch {
        // Temporary helper cleanup is best-effort on process shutdown.
      }
    }
  }
}
