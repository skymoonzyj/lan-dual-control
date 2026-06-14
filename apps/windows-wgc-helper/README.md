# Windows WGC Helper

`lan-dual-wgc-helper` is the native Windows Graphics Capture helper for the Windows host.

It is wired for the `LAN_DUAL_WINDOWS_WGC_HELPER` contract used by `apps/windows-host`:

- stdout uses one JSON object per line.
- `--probe` initializes the real WGC chain: D3D11 device, WinRT Direct3D device, monitor `GraphicsCaptureItem`, frame pool, and capture session.
- Default capture mode reads real `Direct3D11CaptureFrame.Surface` frames, copies them through a CPU-readable D3D11 staging texture, scales to the requested bounds, encodes JPEG with WIC quality settings, and emits `frame` JSON lines.
- `--mock` emits JPEG test frames that exercise the same JSON-lines frame contract consumed by the Node host.

The current implementation honors requested bounds without upscaling. On this machine a `2560x1440` source frame requested as `1280x720` at JPEG quality `0.55` produced about 96 KB in the latest direct helper test, and the Windows host real WGC observation averaged about 84 KB per frame. JPEG size varies with desktop content, so the next implementation step is continuous-frame pacing and longer resource/latency comparisons against FFmpeg.

## Build

```powershell
cd E:\codex\lan-dual-control\apps\windows-wgc-helper
cargo check
cargo build
```

## Verify

```powershell
cargo run -- --probe
cargo run -- --frames 1 --fps 10 --width 1280 --height 720 --jpegQuality 0.55
cargo run -- --mock --frames 3 --fps 30 --width 640 --height 360
node E:\codex\lan-dual-control\scripts\windows\test-windows-wgc-helper.mjs
```

`test-windows-wgc-helper.mjs` builds the helper, runs the scaled real one-frame WGC/JPEG capture check, points the Windows host WGC mode at mock helper output for a stable contract check, then runs a real Windows host + real helper observation and confirms the host receives `windows-wgc-helper-jpeg` frames.
