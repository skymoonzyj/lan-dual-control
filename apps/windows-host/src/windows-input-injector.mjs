import { spawnSync } from "node:child_process";

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
`;

export class WindowsInputInjector {
  constructor({
    logger,
    mode = process.env.LAN_DUAL_WINDOWS_INPUT_MODE || "auto",
    powershellCommand = process.env.LAN_DUAL_POWERSHELL || "powershell.exe",
    inputTimeoutMs = defaultInputTimeoutMs,
  } = {}) {
    this.logger = logger;
    this.mode = normalizeInputMode(mode);
    this.powershellCommand = powershellCommand;
    this.inputTimeoutMs = Number(inputTimeoutMs) || defaultInputTimeoutMs;
    this.inputCount = 0;
  }

  getCapabilities() {
    const available = this.canUseSystemInput();
    return {
      available,
      mode: available ? "system" : "log",
      backend: available ? "PowerShell SendInput" : "log-only",
      message: available
        ? "Windows 输入事件会通过 PowerShell/C# 调用 SendInput 注入系统。"
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

  inject(message) {
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

    const result = this.injectSystemInput(payload);
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
      reason: "Windows SendInput 已执行。",
    };
  }

  injectSystemInput(payload) {
    const result = spawnSync(
      this.powershellCommand,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", sendInputScript],
      {
        input: JSON.stringify(payload),
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

    return { ok: true };
  }
}
