# Windows WGC Helper

`lan-dual-wgc-helper` is the native Windows Graphics Capture helper for the Windows host.

It is wired for the `LAN_DUAL_WINDOWS_WGC_HELPER` contract used by `apps/windows-host`:

- stdout uses one JSON object per line.
- `--probe` initializes the real WGC chain: D3D11 device, WinRT Direct3D device, monitor `GraphicsCaptureItem`, frame pool, and capture session.
- `--mock` emits JPEG test frames that exercise the same JSON-lines frame contract consumed by the Node host.

The next implementation step is frame readback and JPEG encoding from `Direct3D11CaptureFrame.Surface`.

## Build

```powershell
cd E:\codex\lan-dual-control\apps\windows-wgc-helper
cargo check
cargo build
```

## Verify

```powershell
cargo run -- --probe
cargo run -- --mock --frames 3 --fps 30 --width 640 --height 360
node E:\codex\lan-dual-control\scripts\windows\test-windows-wgc-helper.mjs
```

`test-windows-wgc-helper.mjs` also points the Windows host WGC mode at the built helper and confirms the Node host receives `windows-wgc-helper-jpeg` frames.
