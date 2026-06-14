# Windows WGC Helper

`lan-dual-wgc-helper` is the native Windows Graphics Capture helper for the Windows host.

It is wired for the `LAN_DUAL_WINDOWS_WGC_HELPER` contract used by `apps/windows-host`:

- stdout uses one JSON object per line.
- `--probe` initializes the real WGC chain: D3D11 device, WinRT Direct3D device, monitor `GraphicsCaptureItem`, frame pool, and capture session.
- Default capture mode reads real `Direct3D11CaptureFrame.Surface` frames, copies them through a CPU-readable D3D11 staging texture, encodes JPEG with WIC, and emits `frame` JSON lines.
- `--mock` emits JPEG test frames that exercise the same JSON-lines frame contract consumed by the Node host.

The current implementation emits the original captured display size. On this machine the first real WGC frame is `2560x1440` and about 360-510 KB as JPEG in current tests, so the next implementation step is scaling, JPEG quality control, bandwidth tuning, and continuous-frame pacing.

## Build

```powershell
cd E:\codex\lan-dual-control\apps\windows-wgc-helper
cargo check
cargo build
```

## Verify

```powershell
cargo run -- --probe
cargo run -- --frames 1 --fps 10
cargo run -- --mock --frames 3 --fps 30 --width 640 --height 360
node E:\codex\lan-dual-control\scripts\windows\test-windows-wgc-helper.mjs
```

`test-windows-wgc-helper.mjs` builds the helper, runs the real one-frame WGC/JPEG capture check, then points the Windows host WGC mode at the built helper in mock mode and confirms the Node host receives `windows-wgc-helper-jpeg` frames. The Node host contract check intentionally uses mock mode so it stays deterministic when a static desktop produces sparse WGC frame events.
