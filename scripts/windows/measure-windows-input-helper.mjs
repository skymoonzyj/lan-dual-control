import { performance } from "node:perf_hooks";
import { WindowsInputInjector } from "../../apps/windows-host/src/windows-input-injector.mjs";

function parseArgs(argv) {
  const options = {
    samples: 50,
    warmup: 5,
    timeoutMs: 2500,
    maxP95Ms: 0,
    maxAvgMs: 0,
    json: false,
    verbose: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--samples" && next) {
      options.samples = Math.max(1, Number(next) || options.samples);
      index += 1;
    } else if (arg === "--warmup" && next) {
      options.warmup = Math.max(0, Number(next) || 0);
      index += 1;
    } else if (arg === "--timeoutMs" && next) {
      options.timeoutMs = Math.max(250, Number(next) || options.timeoutMs);
      index += 1;
    } else if (arg === "--maxP95Ms" && next) {
      options.maxP95Ms = Math.max(0, Number(next) || 0);
      index += 1;
    } else if (arg === "--maxAvgMs" && next) {
      options.maxAvgMs = Math.max(0, Number(next) || 0);
      index += 1;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/windows/measure-windows-input-helper.mjs [options]

Measures the persistent Windows C# SendInput helper with safe dry-run events.
The dry-run event is intentionally unsupported by the helper, so it verifies the
JSON round trip without sending real mouse or keyboard input.

Options:
  --samples <n>    Warm helper measurement samples. Default: 50
  --warmup <n>     Warm-up requests before sampling. Default: 5
  --timeoutMs <n>  Per-request timeout passed to the injector. Default: 2500
  --maxP95Ms <n>   Fail if warm p95 latency is above this value.
  --maxAvgMs <n>   Fail if warm average latency is above this value.
  --json           Print machine-readable JSON only.
  --verbose        Print injector helper logs.
`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function formatMs(value) {
  return `${value.toFixed(2)} ms`;
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sortedValues.length) - 1),
  );
  return sortedValues[index];
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    avgMs: total / Math.max(1, values.length),
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    maxMs: sorted.at(-1) || 0,
    minMs: sorted[0] || 0,
  };
}

async function measureDryRun(injector) {
  const startedAt = performance.now();
  const result = await injector.inject({
    type: "input_event",
    event: "__dry_run_unsupported__",
    action: "dry-run",
    x: 0,
    y: 0,
  });
  const elapsedMs = performance.now() - startedAt;

  assert(!result.accepted, "dry-run unsupported event should be rejected");
  assert(!result.injected, "dry-run unsupported event must not inject input");
  assert(result.mode === "system", `expected system mode, got ${result.mode}`);
  assert(
    String(result.reason || "").includes("Unsupported input event"),
    `expected helper unsupported-event response, got: ${result.reason}`,
  );

  return elapsedMs;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (process.platform !== "win32") {
    if (options.json) {
      console.log(JSON.stringify({ skipped: true, reason: "Windows required" }, null, 2));
    } else {
      console.log("[SKIP] Persistent C# SendInput helper measurement requires Windows.");
    }
    return;
  }

  const helperLogs = [];
  const logger = {
    info(message) {
      helperLogs.push({ level: "info", message });
      if (options.verbose && !options.json) {
        console.log(`[INFO] ${message}`);
      }
    },
    warn(message) {
      helperLogs.push({ level: "warn", message });
      if (options.verbose && !options.json) {
        console.log(`[WARN] ${message}`);
      }
    },
  };

  const injector = new WindowsInputInjector({
    logger,
    mode: "system",
    inputTimeoutMs: options.timeoutMs,
  });

  try {
    const coldMs = await measureDryRun(injector);
    assert(injector.helper && !injector.helper.killed, "persistent helper did not stay running");

    for (let index = 0; index < options.warmup; index += 1) {
      await measureDryRun(injector);
    }

    const samples = [];
    for (let index = 0; index < options.samples; index += 1) {
      samples.push(await measureDryRun(injector));
    }
    const stats = summarize(samples);
    const result = {
      ok: true,
      safeDryRun: true,
      helper: "persistent-csharp",
      helperRequests: injector.helperRequestId,
      coldMs,
      warmup: options.warmup,
      samples: stats,
      thresholds: {
        maxAvgMs: options.maxAvgMs,
        maxP95Ms: options.maxP95Ms,
      },
      helperLogSummary: {
        compiled: helperLogs.some((item) => item.message.includes("已编译")),
        started: helperLogs.some((item) => item.message.includes("已启动")),
        warnings: helperLogs.filter((item) => item.level === "warn").length,
      },
    };

    if (options.maxAvgMs > 0 && stats.avgMs > options.maxAvgMs) {
      throw new Error(`warm average ${formatMs(stats.avgMs)} exceeded ${formatMs(options.maxAvgMs)}`);
    }
    if (options.maxP95Ms > 0 && stats.p95Ms > options.maxP95Ms) {
      throw new Error(`warm p95 ${formatMs(stats.p95Ms)} exceeded ${formatMs(options.maxP95Ms)}`);
    }

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`[OK] Cold helper startup + dry-run round trip: ${formatMs(coldMs)}`);
      console.log(
        `[OK] Warm helper dry-run: n=${stats.count}, avg=${formatMs(stats.avgMs)}, ` +
          `p50=${formatMs(stats.p50Ms)}, p95=${formatMs(stats.p95Ms)}, max=${formatMs(stats.maxMs)}`,
      );
      console.log(`[OK] Persistent helper requests reused one process: ${injector.helperRequestId}`);
    }
  } finally {
    injector.close();
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
