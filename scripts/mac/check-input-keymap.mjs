#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const defaultSource = path.join(repoRoot, "apps", "mac-host", "Sources", "MacHost", "InputEventInjector.swift");

const requiredCodeGroups = [
  {
    name: "letters",
    keys: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => `Key${letter}`),
  },
  {
    name: "digits",
    keys: "0123456789".split("").map((digit) => `Digit${digit}`),
  },
  {
    name: "punctuation",
    keys: [
      "Minus",
      "Equal",
      "BracketLeft",
      "BracketRight",
      "Backslash",
      "Semicolon",
      "Quote",
      "Backquote",
      "Comma",
      "Period",
      "Slash",
    ],
  },
  {
    name: "navigation",
    keys: [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
      "PageUp",
      "PageDown",
      "Insert",
      "Delete",
      "Backspace",
      "Enter",
      "Escape",
      "Tab",
      "Space",
    ],
  },
  {
    name: "modifiers",
    keys: [
      "ShiftLeft",
      "ShiftRight",
      "ControlLeft",
      "ControlRight",
      "AltLeft",
      "AltRight",
      "MetaLeft",
      "MetaRight",
      "CapsLock",
    ],
  },
  {
    name: "function",
    keys: Array.from({ length: 20 }, (_, index) => `F${index + 1}`),
  },
  {
    name: "numpad",
    keys: [
      ...Array.from({ length: 10 }, (_, index) => `Numpad${index}`),
      "NumpadDecimal",
      "NumpadAdd",
      "NumpadSubtract",
      "NumpadMultiply",
      "NumpadDivide",
      "NumpadEqual",
      "NumpadEnter",
      "NumpadClear",
    ],
  },
  {
    name: "aliases",
    keys: [
      "Return",
      "ForwardDelete",
      "Help",
      "OSLeft",
      "OSRight",
      "NumLock",
    ],
  },
];

const requiredKeyGroups = [
  {
    name: "text",
    keys: [
      ..."abcdefghijklmnopqrstuvwxyz".split(""),
      ..."0123456789".split(""),
      "-", "_", "=", "+", "[", "{", "]", "}", "\\", "|", ";", ":", "'", "\"",
      "`", "~", ",", "<", ".", ">", "/", "?", " ", "space",
    ],
  },
  {
    name: "navigation",
    keys: [
      "enter",
      "return",
      "tab",
      "backspace",
      "escape",
      "esc",
      "delete",
      "del",
      "forwarddelete",
      "insert",
      "home",
      "end",
      "pageup",
      "pagedown",
      "arrowleft",
      "arrowright",
      "arrowup",
      "arrowdown",
      "left",
      "right",
      "up",
      "down",
    ],
  },
  {
    name: "modifiers",
    keys: ["meta", "command", "shift", "capslock", "alt", "option", "control", "ctrl"],
  },
  {
    name: "function",
    keys: Array.from({ length: 20 }, (_, index) => `f${index + 1}`),
  },
  {
    name: "numpad",
    keys: ["clear", "numlock"],
  },
  {
    name: "aliases",
    keys: [
      "return",
      "esc",
      "del",
      "forwarddelete",
      "help",
      "command",
      "option",
      "ctrl",
      "space",
    ],
  },
];

const requiredModifierFlagGroups = [
  {
    name: "command",
    aliases: ["meta", "command"],
    fallback: "metaKey",
    mask: ".maskCommand",
  },
  {
    name: "alternate",
    aliases: ["alt", "option"],
    fallback: "altKey",
    mask: ".maskAlternate",
  },
  {
    name: "control",
    aliases: ["ctrl", "control"],
    fallback: "ctrlKey",
    mask: ".maskControl",
  },
  {
    name: "shift",
    aliases: ["shift"],
    fallback: "shiftKey",
    mask: ".maskShift",
  },
];

function parseArgs(argv) {
  const args = {
    source: defaultSource,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  args.source = path.resolve(String(args.source || defaultSource));
  args.json = args.json === true || args.json === "true" || args.json === "1";
  return args;
}

function print(status, text) {
  console.log(`[${status}] ${text}`);
}

function extractMap(source, name) {
  const pattern = new RegExp(`private\\s+let\\s+${name}\\s*:\\s*\\[String:\\s*CGKeyCode\\]\\s*=\\s*\\[([\\s\\S]*?)\\n\\]`, "m");
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Unable to find ${name} in InputEventInjector.swift`);
  }

  const entries = new Map();
  const body = match[1];
  const entryPattern = /"((?:\\"|[^"])*)"\s*:\s*(\d+)/g;
  let entry;
  while ((entry = entryPattern.exec(body)) !== null) {
    entries.set(parseSwiftStringLiteral(entry[1]), Number(entry[2]));
  }
  return entries;
}

function parseSwiftStringLiteral(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value.replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
  }
}

function checkGroups(groups, map) {
  return groups.map((group) => {
    const missing = group.keys.filter((key) => !map.has(key));
    return {
      name: group.name,
      required: group.keys.length,
      present: group.keys.length - missing.length,
      missing,
    };
  });
}

function flattenMissing(results) {
  return results.flatMap((result) => result.missing.map((key) => `${result.name}:${key}`));
}

function flattenFlagIssues(results) {
  return results.flatMap((result) => result.issues.map((issue) => `${result.name}:${issue}`));
}

function printGroupResults(title, results) {
  print("INFO", title);
  for (const result of results) {
    const suffix = result.missing.length > 0 ? ` missing=${result.missing.join(",")}` : "";
    print(result.missing.length > 0 ? "ERROR" : "OK", `${result.name}: ${result.present}/${result.required}${suffix}`);
  }
}

function extractFunctionSlice(source, functionName) {
  const start = source.indexOf(`private func ${functionName}`);
  if (start < 0) {
    throw new Error(`Unable to find ${functionName} in InputEventInjector.swift`);
  }
  const nextFunction = source.indexOf("\n    private func ", start + 1);
  return source.slice(start, nextFunction > start ? nextFunction : source.length);
}

function checkModifierFlagGroups(source) {
  const body = extractFunctionSlice(source, "eventFlags");
  return requiredModifierFlagGroups.map((group) => {
    const issues = [];
    for (const alias of group.aliases) {
      if (!body.includes(`normalizedModifiers.contains("${alias}")`)) {
        issues.push(`alias missing ${alias}`);
      }
    }
    if (!body.includes(`!hasMappedModifiers && message.${group.fallback} == true`)) {
      issues.push(`fallback missing ${group.fallback}`);
    }
    if (!body.includes(`flags.insert(${group.mask})`)) {
      issues.push(`mask missing ${group.mask}`);
    }
    return {
      name: group.name,
      required: group.aliases.length + 2,
      present: group.aliases.length + 2 - issues.length,
      issues,
    };
  });
}

function printModifierFlagResults(results) {
  print("INFO", "modifier flag coverage");
  for (const result of results) {
    const suffix = result.issues.length > 0 ? ` issues=${result.issues.join("; ")}` : "";
    print(result.issues.length > 0 ? "ERROR" : "OK", `${result.name}: ${result.present}/${result.required}${suffix}`);
  }
}

function printUsage() {
  console.log(`Usage:
  node scripts/mac/check-input-keymap.mjs [options]

Options:
  --source <path>   InputEventInjector.swift path. Default: apps/mac-host/Sources/MacHost/InputEventInjector.swift
  --json            Print machine-readable summary.

Example:
  node scripts/mac/check-input-keymap.mjs`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  const source = await readFile(args.source, "utf8");
  const codeMap = extractMap(source, "keyCodeByCode");
  const keyMap = extractMap(source, "keyCodeByKey");

  const codeResults = checkGroups(requiredCodeGroups, codeMap);
  const keyResults = checkGroups(requiredKeyGroups, keyMap);
  const modifierFlagResults = checkModifierFlagGroups(source);
  const missing = [
    ...flattenMissing(codeResults),
    ...flattenMissing(keyResults),
    ...flattenFlagIssues(modifierFlagResults).map((issue) => `modifierFlags:${issue}`),
  ];
  const summary = {
    source: path.relative(repoRoot, args.source),
    codeEntries: codeMap.size,
    keyEntries: keyMap.size,
    modifierFlags: modifierFlagResults,
    missing,
    ok: missing.length === 0,
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    print("INFO", `Source: ${summary.source}`);
    print("INFO", `Parsed keyCodeByCode=${summary.codeEntries}, keyCodeByKey=${summary.keyEntries}`);
    printGroupResults("KeyboardEvent.code coverage", codeResults);
    printGroupResults("event.key coverage", keyResults);
    printModifierFlagResults(modifierFlagResults);
  }

  if (missing.length > 0) {
    process.exitCode = 1;
    if (!args.json) {
      print("ERROR", `Mac input keymap coverage failed: ${missing.length} missing key(s)`);
    }
    return;
  }

  if (!args.json) {
    print("OK", "Mac input keymap coverage passed");
  }
}

main().catch((error) => {
  print("ERROR", error.message);
  process.exitCode = 1;
});
