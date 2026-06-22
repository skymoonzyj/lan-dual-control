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
            last_message_type: String::new(),
            last_error: String::new(),
            started_at_ms: 0,
            updated_at_ms: 0,
        }
    }
}

#[tauri::command]
pub fn start_w14_native_receiver_session(
    request: W14NativeReceiverStartRequest,
    state: tauri::State<'_, W14NativeReceiverState>,
) -> Result<W14NativeReceiverSnapshot, String> {
    if request.host.trim().is_empty() {
        return Err("W14 native receiver host is required".to_string());
    }
    if request.password.is_empty() {
        return Err("W14 native receiver password is required locally".to_string());
    }

    let stop = Arc::new(AtomicBool::new(false));
    let snapshot = W14NativeReceiverSnapshot {
        running: true,
        status: "starting".to_string(),
        host: Some(request.host.clone()),
        port: Some(request.port),
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
    thread::spawn(move || run_receiver_thread(inner, stop, request));
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
) {
    let result = run_receiver_loop(&inner, &stop, &request);
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
) -> Result<(), String> {
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
                    update_snapshot(inner, |snapshot| apply_incoming_message(snapshot, &value));
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
}
