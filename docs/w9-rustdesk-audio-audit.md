# W9-RUSTDESK-AUDIO-AUDIT

Scope: Windows controls Mac only. This audit covers audio strategy only. It does not copy RustDesk code, does not touch W8 video files, does not change the system audio output device, and does not expand Mac-controls-Windows or reverse-control work.

Sources reviewed:

- RustDesk `src/server/audio_service.rs`: https://github.com/rustdesk/rustdesk/blob/master/src/server/audio_service.rs
- RustDesk `src/client.rs`: https://github.com/rustdesk/rustdesk/blob/master/src/client.rs
- RustDesk `src/client/io_loop.rs`: https://github.com/rustdesk/rustdesk/blob/master/src/client/io_loop.rs

## RustDesk Audio Model

### Capture and Frame Cadence

RustDesk treats audio as a steady low-latency media stream rather than as arbitrary-size PCM blobs.

- Capture is normalized around short audio chunks. The server-side capture path uses a device-rate-derived frame size of roughly 10 ms.
- It uses Opus in low-delay mode for remote audio transport.
- The capture path owns device/restart state. Device changes flip a restart flag and rebuild the capture stream instead of trying to patch a live stream in place.
- Platform capture differs by host:
  - macOS can use ScreenCaptureKit where available.
  - Windows capture is oriented around the default output device/loopback-style source.
  - Fallback input-device paths are explicit.
- Silence handling is bounded. Long zero-level runs are suppressed instead of sending endless silent frames.

### Transport and Threading

RustDesk separates audio handling from the main UI/control flow.

- `AudioFormat` is delivered before audio frame playback.
- Incoming audio frames are forwarded into an audio-specific thread/channel.
- Audio can be disabled independently without tearing down the rest of the remote session.

### Playback

RustDesk's client playback path decodes Opus, resamples/rechannels to the local output device, and pushes PCM into a ring buffer feeding a CPAL output stream.

- Playback uses the default output device and rebuilds stream state when format/device assumptions change.
- The native output callback consumes from a ring buffer and fills silence if data is not ready.
- The output buffer is small, while the ring buffer is large enough to absorb jitter. Latency control comes from cadence, buffering, and continuous playback rather than from the browser timer path.

## Mapping to LAN Dual Control W9

Current project state already has the right direction:

- `apps/windows-desktop/src-tauri/src/native_audio_player.rs` provides a native CPAL output worker.
- `apps/windows-desktop/src-tauri/src/w9_native_audio.rs` exposes start/push/snapshot/stop commands.
- `apps/windows-client/app.js` can route Mac PCM frames to the native player when running inside the desktop shell.
- The native player has hard live-queue trimming through `target_queue_ms` and `max_live_queue_ms`.

Gaps versus the RustDesk model:

1. Frame cadence is still too implicit.
   - Mac PCM reaches the Windows client as whatever frame shape the current media path emits.
   - W9 native playback accepts arbitrary sample arrays and queues them directly.
   - We do not yet report source PCM frame duration, receive gap, native push gap, or normalized playback cadence as first-class diagnostics.

2. Native audio is still entered from the WebView boundary.
   - This is useful for incremental rollout, but the Tauri invoke boundary can amplify scheduling jitter when the web client is backgrounded.
   - RustDesk's model keeps audio decode/playback in a dedicated native path.

3. Device/restart behavior is minimal.
   - We start the default output stream, but do not yet have an explicit restart reason for default device/config changes.
   - Format mismatch currently rejects the push instead of initiating a controlled restart plan.

4. Codec strategy is not ready to switch yet.
   - RustDesk uses low-delay Opus for audio transport.
   - Our immediate bottleneck is stable native PCM cadence and diagnostics. Switching codec before proving native PCM would add protocol risk without isolating the current stutter source.

## Recommended W9 Implementation Path

### W9-A: Native PCM Cadence Normalization

Add a native-side cadence layer before samples enter the playback queue:

- Accept arbitrary incoming interleaved f32 PCM from the current bridge.
- Internally account for 10 ms or 20 ms frames based on sample rate and channels.
- Prefer 20 ms as the first rollout chunk size if the WebView invoke path remains in use, because it reduces bridge call pressure.
- Keep 10 ms as the target once audio receive/decode is moved fully native or once invoke overhead is proven negligible.

This should not change the system output device and should not require Mac-side changes for the first patch.

### W9-B: Cadence Diagnostics

Expose these fields in the native snapshot and Windows diagnostics:

- `nativeSourceFrameMs`
- `nativeSourceGapAvgMs`
- `nativeSourceGapMaxMs`
- `nativePushGapAvgMs`
- `nativePushGapMaxMs`
- `nativeQueueMs`
- `nativeTrimmedFrames`
- `nativeUnderruns`
- `nativeLastReason`

These fields let us distinguish:

- Mac PCM source gaps.
- Windows WebSocket/WebView delivery gaps.
- Tauri/native push gaps.
- Native output underrun or queue trim behavior.

### W9-C: Controlled Native Restart Reasons

Add explicit restart reasons without changing user audio devices:

- `native-playback-device-restart`
- `native-playback-format-restart`
- `native-playback-output-config-changed`
- `native-playback-push-format-mismatch`

For the first pass, report and stop/restart the native session only when the app already requests a compatible format change. Do not auto-change the OS output device.

### W9-D: Opus Later, Not First

Keep PCM for the immediate W9 validation. After native PCM proves stable, evaluate an Opus low-delay lane:

- Mac host encodes 10/20 ms Opus audio frames.
- Windows desktop native side decodes Opus and pushes PCM directly into the native player.
- Browser fallback can remain PCM/JPEG-safe for development.

This should be a separate numbered task because it touches protocol and Mac host behavior.

## Proposed Acceptance Checks

For the next W9 implementation patch, automated checks should include:

- Native player trims sustained future queue down to target without growing stutter.
- Arbitrary incoming PCM chunks are accounted as 10/20 ms cadence units.
- Snapshot reports source/push gap max values.
- Audio guard test confirms desktop native path avoids WebAudio.

For real user retest:

- `audio dropped=0` remains true.
- Native queue stays near target, expected 60-120 ms depending profile.
- No sustained `native-playback-underflow-silence` bursts.
- `maxAudioStutter` falls below the current 274 ms class.
- Minimize/switch-app test keeps audio live without long refill/stable-prebuffer loops.

## W9 Verdict

RustDesk's directly useful lesson is not "copy the codec" first. The fastest safe path is:

1. Keep the current native PCM player.
2. Make frame cadence explicit at 10/20 ms.
3. Add native cadence and restart diagnostics.
4. Only then consider Opus low-delay transport.

This keeps W9 focused on the user's current blocker: lower audio latency and stutter while the Windows client is backgrounded or the user switches apps.
