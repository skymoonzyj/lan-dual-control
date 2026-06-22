use crate::w8_native_video::{
    NativeH264AnnexBPushResult, W8NativeVideoStartRequest, W8NativeVideoState,
};
use base64::{engine::general_purpose, Engine as _};
use lan_dual_control_windows_audio::native_audio_player::{
    NativeAudioOutput, NativeAudioPlaybackConfig, NativeAudioPlaybackStats,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tungstenite::{connect, stream::MaybeTlsStream, Message};

#[derive(Clone)]
pub struct W14NativeReceiverState {
    inner: Arc<Mutex<W14NativeReceiverInner>>,
}

impl Default for W14NativeReceiverState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(W14NativeReceiverInner::default())),
        }
    }
}

#[derive(Default)]
struct W14NativeReceiverInner {
    stop: Option<Arc<AtomicBool>>,
    snapshot: W14NativeReceiverSnapshot,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct W14NativeReceiverStartRequest {
    pub host: String,
    pub port: u16,
    pub password: String,
    pub max_fps: Option<u32>,
    pub max_bandwidth_kbps: Option<u32>,
    pub preferred_width: Option<u32>,
    pub preferred_height: Option<u32>,
    pub want_audio: Option<bool>,
    pub audio_volume: Option<u32>,
    pub display_mode: Option<String>,
    pub display_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct W14NativeReceiverSnapshot {
    pub running: bool,
    pub status: String,
    pub transport: String,
    pub media_owner: String,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub connected: bool,
    pub authenticated: bool,
    pub session_active: bool,
    pub video_frames: u64,
    pub h264_frames: u64,
    pub audio_frames: u64,
    pub last_video_codec: String,
    pub last_video_encoding: String,
    pub native_video_running: bool,
    pub native_video_renderer_mode: String,
    pub native_video_pushed_frames: u64,
    pub native_video_accepted_frames: u64,
    pub native_video_dropped_frames: u64,
    pub native_video_queue_ms: u64,
    pub native_video_decoded_frames: u64,
    pub native_video_present_frames: u64,
    pub native_video_presenting: bool,
    pub native_video_last_status: String,
    pub native_video_last_reason: String,
    pub native_video_last_error: String,
    pub last_audio_codec: String,
    pub last_audio_encoding: String,
    pub audio_sample_rate: u32,
    pub audio_channels: u16,
    pub audio_playback_running: bool,
    pub audio_playback_queue_ms: u64,
    pub audio_playback_pushed_frames: u64,
    pub audio_playback_played_frames: u64,
    pub audio_playback_trimmed_frames: u64,
    pub audio_playback_underruns: u64,
    pub audio_playback_dropped_frames: u64,
    pub audio_playback_source_frame_ms: u64,
    pub audio_playback_source_frame_max_ms: u64,
    pub audio_playback_source_frame_cadence_ms: u64,
    pub audio_playback_source_cadence_frames: u64,
    pub audio_playback_last_reason: String,
    pub last_message_type: String,
    pub last_error: String,
    pub started_at_ms: u64,
    pub updated_at_ms: u64,
}

impl Default for W14NativeReceiverSnapshot {
    fn default() -> Self {
        Self {
            running: false,
            status: "idle".to_string(),
            transport: "websocket-native".to_string(),
            media_owner: "native-receiver".to_string(),
            host: None,
            port: None,
            connected: false,
            authenticated: false,
            session_active: false,
            video_frames: 0,
            h264_frames: 0,
            audio_frames: 0,
            last_video_codec: String::new(),
            last_video_encoding: String::new(),
            native_video_running: false,
            native_video_renderer_mode: String::new(),
            native_video_pushed_frames: 0,
            native_video_accepted_frames: 0,
            native_video_dropped_frames: 0,
            native_video_queue_ms: 0,
            native_video_decoded_frames: 0,
            native_video_present_frames: 0,
            native_video_presenting: false,
            native_video_last_status: String::new(),
            native_video_last_reason: String::new(),
            native_video_last_error: String::new(),
            last_audio_codec: String::new(),
            last_audio_encoding: String::new(),
            audio_sample_rate: 0,
            audio_channels: 0,
            audio_playback_running: false,
            audio_playback_queue_ms: 0,
            audio_playback_pushed_frames: 0,
            audio_playback_played_frames: 0,
            audio_playback_trimmed_frames: 0,
            audio_playback_underruns: 0,
            audio_playback_dropped_frames: 0,
            audio_playback_source_frame_ms: 0,
            audio_playback_source_frame_max_ms: 0,
            audio_playback_source_frame_cadence_ms: 0,
            audio_playback_source_cadence_frames: 0,
            audio_playback_last_reason: String::new(),
            last_message_type: String::new(),
            last_error: String::new(),
            started_at_ms: 0,
            updated_at_ms: 0,
        }
    }
}

#[tauri::command]
pub fn start_w14_native_receiver_session(
    window: tauri::Window,
    request: W14NativeReceiverStartRequest,
    state: tauri::State<'_, W14NativeReceiverState>,
    video_state: tauri::State<'_, W8NativeVideoState>,
) -> Result<W14NativeReceiverSnapshot, String> {
    if request.host.trim().is_empty() {
        return Err("W14 native receiver host is required".to_string());
    }
    if request.password.is_empty() {
        return Err("W14 native receiver password is required locally".to_string());
    }

    let video_state_handle = video_state.inner().clone();
    let video_snapshot =
        video_state_handle.start_session(&window, build_w8_native_video_start_request(&request))?;
    let stop = Arc::new(AtomicBool::new(false));
    let snapshot = W14NativeReceiverSnapshot {
        running: true,
        status: "starting".to_string(),
        host: Some(request.host.clone()),
        port: Some(request.port),
        native_video_running: video_snapshot.running,
        native_video_renderer_mode: video_snapshot.renderer_mode,
        native_video_queue_ms: video_snapshot.queue.queue_ms,
        started_at_ms: now_ms(),
        updated_at_ms: now_ms(),
        ..W14NativeReceiverSnapshot::default()
    };

    {
        let mut inner = state
            .inner
            .lock()
            .map_err(|_| "W14 native receiver state lock failed".to_string())?;
        if let Some(previous) = inner.stop.take() {
            previous.store(true, Ordering::SeqCst);
        }
        inner.stop = Some(stop.clone());
        inner.snapshot = snapshot.clone();
    }

    let inner = Arc::clone(&state.inner);
    let video_bridge = W14W8NativeVideoBridge::new(video_state_handle);
    thread::spawn(move || run_receiver_thread(inner, stop, request, video_bridge));
    Ok(snapshot)
}

#[tauri::command]
pub fn get_w14_native_receiver_snapshot(
    state: tauri::State<'_, W14NativeReceiverState>,
) -> Result<W14NativeReceiverSnapshot, String> {
    let inner = state
        .inner
        .lock()
        .map_err(|_| "W14 native receiver state lock failed".to_string())?;
    Ok(inner.snapshot.clone())
}

#[tauri::command]
pub fn stop_w14_native_receiver_session(
    state: tauri::State<'_, W14NativeReceiverState>,
) -> Result<W14NativeReceiverSnapshot, String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "W14 native receiver state lock failed".to_string())?;
    if let Some(stop) = inner.stop.take() {
        stop.store(true, Ordering::SeqCst);
    }
    inner.snapshot.running = false;
    inner.snapshot.status = "stopping".to_string();
    inner.snapshot.updated_at_ms = now_ms();
    Ok(inner.snapshot.clone())
}

fn run_receiver_thread(
    inner: Arc<Mutex<W14NativeReceiverInner>>,
    stop: Arc<AtomicBool>,
    request: W14NativeReceiverStartRequest,
    video_bridge: W14W8NativeVideoBridge,
) {
    let result = run_receiver_loop(&inner, &stop, &request, video_bridge);
    if let Err(error) = result {
        update_snapshot(&inner, |snapshot| {
            snapshot.running = false;
            snapshot.status = "error".to_string();
            snapshot.last_error = error;
        });
    }
}

fn run_receiver_loop(
    inner: &Arc<Mutex<W14NativeReceiverInner>>,
    stop: &Arc<AtomicBool>,
    request: &W14NativeReceiverStartRequest,
    mut video_bridge: W14W8NativeVideoBridge,
) -> Result<(), String> {
    let mut audio_playback = W14NativeAudioPlayback::default();

    update_snapshot(inner, |snapshot| snapshot.status = "connecting".to_string());
    let url = format!("ws://{}:{}", request.host.trim(), request.port);
    let (mut socket, _) =
        connect(url.as_str()).map_err(|error| format!("connect failed: {error}"))?;
    if let MaybeTlsStream::Plain(stream) = socket.get_mut() {
        let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
        let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
    }
    update_snapshot(inner, |snapshot| {
        snapshot.connected = true;
        snapshot.status = "connected".to_string();
    });

    send_envelope(
        &mut socket,
        json!({
            "type": "hello",
            "clientName": "Windows native receiver",
            "clientPlatform": "windows",
            "protocolVersion": 1
        }),
    )?;
    wait_for_message(
        &mut socket,
        inner,
        stop,
        "hello_ack",
        Duration::from_secs(3),
    )?;

    update_snapshot(inner, |snapshot| {
        snapshot.status = "authenticating".to_string()
    });
    send_envelope(
        &mut socket,
        json!({
            "type": "auth_request",
            "password": request.password,
        }),
    )?;
    let auth = wait_for_message(
        &mut socket,
        inner,
        stop,
        "auth_result",
        Duration::from_secs(3),
    )?;
    if !auth.get("ok").and_then(Value::as_bool).unwrap_or(false) {
        return Err(format!(
            "auth failed: {}",
            auth.get("reason")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
        ));
    }
    update_snapshot(inner, |snapshot| {
        snapshot.authenticated = true;
        snapshot.status = "negotiating".to_string();
    });

    send_envelope(&mut socket, build_session_offer(request))?;
    let answer = wait_for_message(
        &mut socket,
        inner,
        stop,
        "session_answer",
        Duration::from_secs(4),
    )?;
    if !answer.get("ok").and_then(Value::as_bool).unwrap_or(false) {
        return Err(format!(
            "session failed: {}",
            answer
                .get("reason")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
        ));
    }
    update_snapshot(inner, |snapshot| {
        snapshot.session_active = true;
        snapshot.status = "streaming".to_string();
    });

    while !stop.load(Ordering::SeqCst) {
        match socket.read() {
            Ok(message) => {
                if let Some(value) = parse_message(message)? {
                    handle_stream_message(
                        inner,
                        &mut audio_playback,
                        Some(&mut video_bridge),
                        &value,
                    )?;
                }
            }
            Err(tungstenite::Error::Io(error))
                if error.kind() == std::io::ErrorKind::WouldBlock
                    || error.kind() == std::io::ErrorKind::TimedOut =>
            {
                continue;
            }
            Err(tungstenite::Error::ConnectionClosed) | Err(tungstenite::Error::AlreadyClosed) => {
                break;
            }
            Err(error) => return Err(format!("read failed: {error}")),
        }
    }

    update_snapshot(inner, |snapshot| {
        snapshot.running = false;
        snapshot.status = "stopped".to_string();
    });
    Ok(())
}

fn build_w8_native_video_start_request(
    request: &W14NativeReceiverStartRequest,
) -> W8NativeVideoStartRequest {
    W8NativeVideoStartRequest {
        host: Some(request.host.trim().to_string()),
        port: Some(request.port),
        requested_fps: request.max_fps,
        renderer_mode: Some("w14-native-receiver-w8-mf-d3d11".to_string()),
        target_queue_ms: Some(80),
        hard_max_queue_ms: Some(180),
        max_frames: Some(8),
    }
}

fn build_session_offer(request: &W14NativeReceiverStartRequest) -> Value {
    json!({
        "type": "session_offer",
        "protocolVersion": 1,
        "wantVideo": true,
        "wantAudio": request.want_audio.unwrap_or(true),
        "wantClipboardText": false,
        "wantClipboardFile": false,
        "maxFps": request.max_fps.unwrap_or(60).clamp(1, 240),
        "maxBandwidthKbps": request.max_bandwidth_kbps.unwrap_or(50_000),
        "qualityPreset": "auto",
        "displayMode": request.display_mode.as_deref().unwrap_or("window"),
        "displayId": request.display_id.as_deref().unwrap_or("main"),
        "preferredWidth": request.preferred_width.unwrap_or(0),
        "preferredHeight": request.preferred_height.unwrap_or(0),
        "preferredVideoCodec": "h264",
        "preferredVideoEncoding": "annexb",
        "preferredAudioCodec": "pcm-f32le",
        "audioVolume": request.audio_volume.unwrap_or(80).min(100),
    })
}

fn wait_for_message(
    socket: &mut tungstenite::WebSocket<MaybeTlsStream<std::net::TcpStream>>,
    inner: &Arc<Mutex<W14NativeReceiverInner>>,
    stop: &Arc<AtomicBool>,
    expected_type: &str,
    timeout: Duration,
) -> Result<Value, String> {
    let deadline = now_ms().saturating_add(timeout.as_millis() as u64);
    while now_ms() <= deadline {
        if stop.load(Ordering::SeqCst) {
            return Err("stopped".to_string());
        }
        match socket.read() {
            Ok(message) => {
                if let Some(value) = parse_message(message)? {
                    update_snapshot(inner, |snapshot| apply_incoming_message(snapshot, &value));
                    if value.get("type").and_then(Value::as_str) == Some(expected_type) {
                        return Ok(value);
                    }
                }
            }
            Err(tungstenite::Error::Io(error))
                if error.kind() == std::io::ErrorKind::WouldBlock
                    || error.kind() == std::io::ErrorKind::TimedOut =>
            {
                continue;
            }
            Err(error) => return Err(format!("wait for {expected_type} failed: {error}")),
        }
    }
    Err(format!("wait for {expected_type} timed out"))
}

fn send_envelope(
    socket: &mut tungstenite::WebSocket<MaybeTlsStream<std::net::TcpStream>>,
    mut payload: Value,
) -> Result<(), String> {
    let object = payload
        .as_object_mut()
        .ok_or_else(|| "payload must be an object".to_string())?;
    let message_type = object
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("message")
        .to_string();
    object.insert(
        "id".to_string(),
        json!(format!("w14-{}-{}", message_type, now_ms())),
    );
    object.insert("timestamp".to_string(), json!(now_ms().to_string()));
    socket
        .send(Message::Text(payload.to_string()))
        .map_err(|error| format!("send failed: {error}"))
}

fn parse_message(message: Message) -> Result<Option<Value>, String> {
    match message {
        Message::Text(text) => serde_json::from_str::<Value>(&text)
            .map(Some)
            .map_err(|error| format!("invalid json: {error}")),
        Message::Binary(bytes) => serde_json::from_slice::<Value>(&bytes)
            .map(Some)
            .map_err(|error| format!("invalid binary json: {error}")),
        Message::Ping(_) | Message::Pong(_) => Ok(None),
        Message::Close(_) => Err("connection closed".to_string()),
        Message::Frame(_) => Ok(None),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct W14DecodedH264Frame {
    id: u64,
    received_at_ms: u64,
    bytes: Vec<u8>,
    codec: String,
    encoding: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct W14NativeVideoPushStats {
    accepted: bool,
    dropped_frames: u64,
    queue_ms: u64,
    decoded_frames: u64,
    present_frames: u64,
    presenting: bool,
    last_status: String,
    last_reason: String,
}

trait W14NativeVideoSink {
    fn push_h264_annexb_frame(
        &mut self,
        frame: W14DecodedH264Frame,
    ) -> Result<W14NativeVideoPushStats, String>;
}

struct W14W8NativeVideoBridge {
    state: W8NativeVideoState,
}

impl W14W8NativeVideoBridge {
    fn new(state: W8NativeVideoState) -> Self {
        Self { state }
    }
}

impl W14NativeVideoSink for W14W8NativeVideoBridge {
    fn push_h264_annexb_frame(
        &mut self,
        frame: W14DecodedH264Frame,
    ) -> Result<W14NativeVideoPushStats, String> {
        let result =
            self.state
                .push_h264_annexb_bytes(frame.id, frame.received_at_ms, frame.bytes)?;
        Ok(W14NativeVideoPushStats::from_w8_result(&result))
    }
}

impl W14NativeVideoPushStats {
    fn from_w8_result(result: &NativeH264AnnexBPushResult) -> Self {
        let decoder = result.decoder_session.as_ref();
        let decoded_frames = decoder.map(|summary| summary.decoded_frames).unwrap_or(0);
        let present_frames = decoder
            .map(|summary| summary.native_present_frames)
            .unwrap_or(0);
        let native_present_status = decoder
            .map(|summary| summary.native_present_status.clone())
            .unwrap_or_default();
        let decoder_status = decoder
            .map(|summary| summary.last_status.clone())
            .unwrap_or_default();
        let last_status = if !native_present_status.is_empty()
            && native_present_status != "waiting-latest-frame"
        {
            native_present_status.clone()
        } else if !decoder_status.is_empty() {
            decoder_status
        } else {
            result.video.reason.clone()
        };
        let last_reason = decoder
            .map(|summary| summary.reason.clone())
            .unwrap_or_else(|| result.video.reason.clone());
        let presenting = present_frames > 0 || native_present_status.contains("presented");

        Self {
            accepted: result.video.accepted,
            dropped_frames: result.video.dropped_frames as u64,
            queue_ms: result.video.queue_ms,
            decoded_frames,
            present_frames,
            presenting,
            last_status,
            last_reason,
        }
    }
}

fn decode_h264_annexb_video_frame(message: &Value) -> Result<Option<W14DecodedH264Frame>, String> {
    if message.get("type").and_then(Value::as_str) != Some("video_frame") {
        return Ok(None);
    }

    let codec = message
        .get("codec")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let encoding = message
        .get("encoding")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let codec_lc = codec.to_ascii_lowercase();
    let encoding_lc = encoding.to_ascii_lowercase();
    if !codec_lc.contains("h264") {
        return Ok(None);
    }
    if !encoding_lc.contains("annexb") {
        return Ok(None);
    }

    let payload = video_payload(message)
        .ok_or_else(|| "W14 H.264 video frame missing base64 payload".to_string())?;
    let bytes = general_purpose::STANDARD
        .decode(payload.as_bytes())
        .map_err(|error| format!("W14 H.264 base64 decode failed: {error}"))?;
    if bytes.is_empty() {
        return Err("W14 H.264 payload is empty".to_string());
    }

    let id =
        number_field(message, &["frameId", "frame_id", "id", "sequence"]).unwrap_or_else(now_ms);
    let received_at_ms = number_field(
        message,
        &["receivedAtMs", "received_at_ms", "timestampMs", "timestamp"],
    )
    .unwrap_or_else(now_ms);

    Ok(Some(W14DecodedH264Frame {
        id,
        received_at_ms,
        bytes,
        codec,
        encoding,
    }))
}

fn video_payload(message: &Value) -> Option<String> {
    for key in [
        "payload",
        "data",
        "videoData",
        "dataBase64",
        "videoBase64",
        "h264Base64",
        "frameBase64",
    ] {
        let Some(value) = message.get(key).and_then(Value::as_str) else {
            continue;
        };
        let payload = value
            .split_once(',')
            .map(|(_, payload)| payload)
            .unwrap_or(value)
            .trim();
        if !payload.is_empty() {
            return Some(payload.to_string());
        }
    }
    None
}

#[derive(Debug, Clone, PartialEq)]
struct W14DecodedAudioFrame {
    sample_rate: u32,
    channels: u16,
    samples: Vec<f32>,
    codec: String,
    encoding: String,
}

#[derive(Default)]
struct W14NativeAudioPlayback {
    output: Option<NativeAudioOutput>,
}

impl W14NativeAudioPlayback {
    fn push_frame(
        &mut self,
        frame: &W14DecodedAudioFrame,
    ) -> Result<NativeAudioPlaybackStats, String> {
        if self.needs_output_for(frame) {
            let config = NativeAudioPlaybackConfig {
                sample_rate: frame.sample_rate,
                channels: frame.channels,
                target_queue_ms: 80,
                max_live_queue_ms: 120,
            };
            self.output = Some(NativeAudioOutput::start_default(config)?);
        }

        let output = self
            .output
            .as_ref()
            .ok_or_else(|| "W14 native audio output not started".to_string())?;
        let config = output.config();
        if config.sample_rate != frame.sample_rate || config.channels != frame.channels {
            return Err(format!(
                "W14 native audio format mismatch: frame {} Hz/{}ch, output {} Hz/{}ch.",
                frame.sample_rate, frame.channels, config.sample_rate, config.channels
            ));
        }

        output.push_interleaved_f32(&frame.samples)?;
        output.stats()
    }

    fn needs_output_for(&self, frame: &W14DecodedAudioFrame) -> bool {
        self.output
            .as_ref()
            .map(|output| {
                let config = output.config();
                config.sample_rate != frame.sample_rate || config.channels != frame.channels
            })
            .unwrap_or(true)
    }
}

fn handle_stream_message(
    inner: &Arc<Mutex<W14NativeReceiverInner>>,
    audio_playback: &mut W14NativeAudioPlayback,
    mut video_sink: Option<&mut dyn W14NativeVideoSink>,
    message: &Value,
) -> Result<(), String> {
    update_snapshot(inner, |snapshot| apply_incoming_message(snapshot, message));
    if let Some(frame) = decode_h264_annexb_video_frame(message)? {
        if let Some(sink) = video_sink.as_deref_mut() {
            match sink.push_h264_annexb_frame(frame) {
                Ok(stats) => {
                    update_snapshot(inner, |snapshot| {
                        apply_native_video_push_stats(snapshot, stats)
                    });
                }
                Err(error) => {
                    update_snapshot(inner, |snapshot| {
                        snapshot.native_video_last_error = error.clone();
                    });
                    return Err(error);
                }
            }
        }
    }
    let Some(frame) = decode_pcm_f32le_audio_frame(message)? else {
        return Ok(());
    };
    let stats = audio_playback.push_frame(&frame)?;
    update_snapshot(inner, |snapshot| {
        apply_audio_playback_stats(snapshot, &frame, stats)
    });
    Ok(())
}

fn decode_pcm_f32le_audio_frame(message: &Value) -> Result<Option<W14DecodedAudioFrame>, String> {
    if message.get("type").and_then(Value::as_str) != Some("audio_frame") {
        return Ok(None);
    }

    let codec = message
        .get("codec")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let encoding = message
        .get("encoding")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let codec_lc = codec.to_ascii_lowercase();
    let encoding_lc = encoding.to_ascii_lowercase();
    let is_pcm_f32le = codec_lc.contains("pcm-f32le")
        || encoding_lc.contains("pcm-f32le")
        || (codec_lc.contains("pcm") && codec_lc.contains("f32"))
        || (encoding_lc.contains("pcm") && encoding_lc.contains("f32"));
    if !is_pcm_f32le {
        return Ok(None);
    }

    let payload = audio_payload(message)
        .ok_or_else(|| "W14 PCM audio frame missing base64 payload".to_string())?;
    let bytes = general_purpose::STANDARD
        .decode(payload.as_bytes())
        .map_err(|error| format!("W14 PCM base64 decode failed: {error}"))?;
    if bytes.len() % 4 != 0 {
        return Err(format!(
            "W14 PCM f32le payload must be 4-byte aligned, got {} bytes.",
            bytes.len()
        ));
    }

    let channels = number_field(message, &["channels"])
        .unwrap_or(2)
        .clamp(1, 8) as u16;
    let sample_rate = number_field(message, &["sampleRate", "sample_rate"])
        .unwrap_or(48_000)
        .clamp(8_000, 192_000) as u32;
    let samples = bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect::<Vec<_>>();
    if samples.is_empty() || samples.len() % usize::from(channels) != 0 {
        return Err(format!(
            "W14 PCM f32le samples do not align with {} channels.",
            channels
        ));
    }

    Ok(Some(W14DecodedAudioFrame {
        sample_rate,
        channels,
        samples,
        codec,
        encoding,
    }))
}

fn audio_payload(message: &Value) -> Option<String> {
    for key in [
        "payload",
        "data",
        "samples",
        "audioData",
        "dataBase64",
        "audioBase64",
        "pcmBase64",
    ] {
        let Some(value) = message.get(key).and_then(Value::as_str) else {
            continue;
        };
        let payload = value
            .split_once(',')
            .map(|(_, payload)| payload)
            .unwrap_or(value)
            .trim();
        if !payload.is_empty() {
            return Some(payload.to_string());
        }
    }
    None
}

fn number_field(message: &Value, keys: &[&str]) -> Option<u64> {
    keys.iter().find_map(|key| {
        let value = message.get(*key)?;
        value
            .as_u64()
            .or_else(|| value.as_str().and_then(|text| text.parse::<u64>().ok()))
    })
}

fn apply_native_video_push_stats(
    snapshot: &mut W14NativeReceiverSnapshot,
    stats: W14NativeVideoPushStats,
) {
    snapshot.media_owner = "native-receiver".to_string();
    snapshot.native_video_running = true;
    snapshot.native_video_pushed_frames = snapshot.native_video_pushed_frames.saturating_add(1);
    if stats.accepted {
        snapshot.native_video_accepted_frames =
            snapshot.native_video_accepted_frames.saturating_add(1);
    }
    snapshot.native_video_dropped_frames = snapshot
        .native_video_dropped_frames
        .saturating_add(stats.dropped_frames);
    snapshot.native_video_queue_ms = stats.queue_ms;
    snapshot.native_video_decoded_frames = stats.decoded_frames;
    snapshot.native_video_present_frames = stats.present_frames;
    snapshot.native_video_presenting = stats.presenting;
    snapshot.native_video_last_status = stats.last_status;
    snapshot.native_video_last_reason = stats.last_reason;
    snapshot.native_video_last_error.clear();
}

fn apply_audio_playback_stats(
    snapshot: &mut W14NativeReceiverSnapshot,
    frame: &W14DecodedAudioFrame,
    stats: NativeAudioPlaybackStats,
) {
    snapshot.media_owner = "native-receiver".to_string();
    snapshot.last_audio_codec = frame.codec.clone();
    snapshot.last_audio_encoding = frame.encoding.clone();
    snapshot.audio_sample_rate = frame.sample_rate;
    snapshot.audio_channels = frame.channels;
    snapshot.audio_playback_running = true;
    snapshot.audio_playback_queue_ms = stats.queue_ms;
    snapshot.audio_playback_pushed_frames = stats.pushed_frames;
    snapshot.audio_playback_played_frames = stats.played_frames;
    snapshot.audio_playback_trimmed_frames = stats.trimmed_frames;
    snapshot.audio_playback_underruns = stats.underruns;
    snapshot.audio_playback_dropped_frames = 0;
    snapshot.audio_playback_source_frame_ms = stats.source_frame_ms;
    snapshot.audio_playback_source_frame_max_ms = stats.source_frame_max_ms;
    snapshot.audio_playback_source_frame_cadence_ms = stats.source_frame_cadence_ms;
    snapshot.audio_playback_source_cadence_frames = stats.source_cadence_frames;
    snapshot.audio_playback_last_reason = stats.last_reason.to_string();
}

fn apply_incoming_message(snapshot: &mut W14NativeReceiverSnapshot, message: &Value) {
    let message_type = message.get("type").and_then(Value::as_str).unwrap_or("");
    snapshot.last_message_type = message_type.to_string();
    if message_type == "video_frame" {
        snapshot.video_frames = snapshot.video_frames.saturating_add(1);
        let codec = message.get("codec").and_then(Value::as_str).unwrap_or("");
        let encoding = message
            .get("encoding")
            .and_then(Value::as_str)
            .unwrap_or("");
        snapshot.last_video_codec = codec.to_string();
        snapshot.last_video_encoding = encoding.to_string();
        if codec.eq_ignore_ascii_case("h264") {
            snapshot.h264_frames = snapshot.h264_frames.saturating_add(1);
        }
    } else if message_type == "audio_frame" {
        snapshot.audio_frames = snapshot.audio_frames.saturating_add(1);
        let codec = message.get("codec").and_then(Value::as_str).unwrap_or("");
        let encoding = message
            .get("encoding")
            .and_then(Value::as_str)
            .unwrap_or("");
        snapshot.last_audio_codec = codec.to_string();
        snapshot.last_audio_encoding = encoding.to_string();
    }
}

fn update_snapshot(
    inner: &Arc<Mutex<W14NativeReceiverInner>>,
    update: impl FnOnce(&mut W14NativeReceiverSnapshot),
) {
    if let Ok(mut guard) = inner.lock() {
        update(&mut guard.snapshot);
        guard.snapshot.updated_at_ms = now_ms();
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::engine::general_purpose;

    #[test]
    fn session_offer_declares_h264_pcm_native_media_request() {
        let offer = build_session_offer(&W14NativeReceiverStartRequest {
            host: "127.0.0.1".to_string(),
            port: 43770,
            password: "secret".to_string(),
            max_fps: Some(60),
            max_bandwidth_kbps: Some(50_000),
            preferred_width: Some(1920),
            preferred_height: Some(1080),
            want_audio: Some(true),
            audio_volume: Some(80),
            display_mode: Some("window".to_string()),
            display_id: Some("main".to_string()),
        });

        assert_eq!(offer["type"], "session_offer");
        assert_eq!(offer["preferredVideoCodec"], "h264");
        assert_eq!(offer["preferredVideoEncoding"], "annexb");
        assert_eq!(offer["preferredAudioCodec"], "pcm-f32le");
        assert_eq!(offer["wantClipboardText"], false);
        assert_eq!(offer["wantClipboardFile"], false);
    }

    #[test]
    fn incoming_media_updates_native_owner_snapshot() {
        let mut snapshot = W14NativeReceiverSnapshot::default();
        apply_incoming_message(
            &mut snapshot,
            &json!({"type":"video_frame","codec":"h264","encoding":"annexb-base64"}),
        );
        apply_incoming_message(
            &mut snapshot,
            &json!({"type":"audio_frame","codec":"pcm-f32le"}),
        );

        assert_eq!(snapshot.media_owner, "native-receiver");
        assert_eq!(snapshot.video_frames, 1);
        assert_eq!(snapshot.h264_frames, 1);
        assert_eq!(snapshot.audio_frames, 1);
        assert_eq!(snapshot.last_video_codec, "h264");
        assert_eq!(snapshot.last_video_encoding, "annexb-base64");
    }

    #[derive(Default)]
    struct FakeNativeVideoSink {
        frames: Vec<W14DecodedH264Frame>,
    }

    impl W14NativeVideoSink for FakeNativeVideoSink {
        fn push_h264_annexb_frame(
            &mut self,
            frame: W14DecodedH264Frame,
        ) -> Result<W14NativeVideoPushStats, String> {
            self.frames.push(frame);
            Ok(W14NativeVideoPushStats {
                accepted: true,
                dropped_frames: 0,
                queue_ms: 12,
                decoded_frames: 3,
                present_frames: 2,
                presenting: true,
                last_status: "latest-frame-swapchain-presented".to_string(),
                last_reason: "presented through W8 native video".to_string(),
            })
        }
    }

    #[test]
    fn h264_video_frame_feeds_native_video_sink_and_surfaces_presenting() {
        let inner = Arc::new(Mutex::new(W14NativeReceiverInner::default()));
        let mut audio_playback = W14NativeAudioPlayback::default();
        let mut video_sink = FakeNativeVideoSink::default();
        let payload = general_purpose::STANDARD.encode([0, 0, 0, 1, 0x67, 0, 0, 0, 1, 0x65]);

        handle_stream_message(
            &inner,
            &mut audio_playback,
            Some(&mut video_sink),
            &json!({
                "type": "video_frame",
                "codec": "h264",
                "encoding": "annexb-base64",
                "frameId": 7,
                "payload": payload,
            }),
        )
        .expect("video frame should feed native sink");

        assert_eq!(video_sink.frames.len(), 1);
        assert_eq!(video_sink.frames[0].id, 7);
        assert_eq!(
            video_sink.frames[0].bytes,
            vec![0, 0, 0, 1, 0x67, 0, 0, 0, 1, 0x65]
        );

        let snapshot = inner.lock().expect("snapshot lock").snapshot.clone();
        assert_eq!(snapshot.native_video_pushed_frames, 1);
        assert_eq!(snapshot.native_video_decoded_frames, 3);
        assert_eq!(snapshot.native_video_present_frames, 2);
        assert!(snapshot.native_video_presenting);
        assert_eq!(
            snapshot.native_video_last_status,
            "latest-frame-swapchain-presented"
        );
    }

    #[test]
    fn decodes_pcm_f32le_audio_payload_for_native_playback() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&0.25_f32.to_le_bytes());
        bytes.extend_from_slice(&(-0.5_f32).to_le_bytes());
        let encoded = general_purpose::STANDARD.encode(bytes);

        let frame = decode_pcm_f32le_audio_frame(&json!({
            "type": "audio_frame",
            "codec": "pcm-f32le",
            "encoding": "pcm-f32le-base64",
            "sampleRate": 48_000,
            "channels": 2,
            "payload": encoded,
        }))
        .expect("decode should not fail")
        .expect("pcm frame should be decoded");

        assert_eq!(frame.sample_rate, 48_000);
        assert_eq!(frame.channels, 2);
        assert_eq!(frame.samples, vec![0.25, -0.5]);
    }

    #[test]
    fn audio_playback_stats_surface_native_receiver_queue() {
        let mut snapshot = W14NativeReceiverSnapshot::default();
        let frame = W14DecodedAudioFrame {
            sample_rate: 48_000,
            channels: 2,
            samples: vec![0.25, -0.5],
            codec: "pcm-f32le".to_string(),
            encoding: "pcm-f32le-base64".to_string(),
        };

        apply_audio_playback_stats(
            &mut snapshot,
            &frame,
            NativeAudioPlaybackStats {
                pushed_frames: 960,
                played_frames: 480,
                trimmed_frames: 0,
                underruns: 0,
                queue_ms: 10,
                source_frame_ms: 20,
                source_frame_max_ms: 20,
                source_frame_cadence_ms: 20,
                source_cadence_frames: 1,
                last_reason: "native-playback-queued",
            },
        );

        assert_eq!(snapshot.media_owner, "native-receiver");
        assert!(snapshot.audio_playback_running);
        assert_eq!(snapshot.last_audio_codec, "pcm-f32le");
        assert_eq!(snapshot.last_audio_encoding, "pcm-f32le-base64");
        assert_eq!(snapshot.audio_sample_rate, 48_000);
        assert_eq!(snapshot.audio_channels, 2);
        assert_eq!(snapshot.audio_playback_queue_ms, 10);
        assert_eq!(snapshot.audio_playback_pushed_frames, 960);
        assert_eq!(snapshot.audio_playback_played_frames, 480);
        assert_eq!(snapshot.audio_playback_dropped_frames, 0);
        assert_eq!(
            snapshot.audio_playback_last_reason,
            "native-playback-queued"
        );
    }
}
