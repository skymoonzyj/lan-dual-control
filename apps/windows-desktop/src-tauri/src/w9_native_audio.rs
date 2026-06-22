use base64::{engine::general_purpose, Engine as _};
use lan_dual_control_windows_audio::native_audio_player::{
    NativeAudioOutput, NativeAudioPlaybackConfig, NativeAudioPlaybackStats,
};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Default)]
pub struct W9NativeAudioState {
    session: Mutex<W9NativeAudioSession>,
}

#[derive(Default)]
struct W9NativeAudioSession {
    running: bool,
    output: Option<NativeAudioOutput>,
    config: NativeAudioPlaybackConfig,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct W9NativeAudioStartRequest {
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
    pub target_queue_ms: Option<u64>,
    pub max_live_queue_ms: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct W9NativePcmF32FrameRequest {
    pub data_base64: String,
    pub sample_rate: u32,
    pub channels: u16,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct W9NativeAudioSnapshot {
    pub running: bool,
    pub sample_rate: u32,
    pub channels: u16,
    pub queue_ms: u64,
    pub pushed_frames: u64,
    pub played_frames: u64,
    pub trimmed_frames: u64,
    pub underruns: u64,
    pub source_frame_ms: u64,
    pub source_frame_max_ms: u64,
    pub source_frame_cadence_ms: u64,
    pub source_cadence_frames: u64,
    pub last_reason: String,
}

fn decode_f32le_base64(data_base64: &str) -> Result<Vec<f32>, String> {
    let payload = data_base64
        .split_once(',')
        .map(|(_, payload)| payload)
        .unwrap_or(data_base64)
        .trim();
    let bytes = general_purpose::STANDARD
        .decode(payload.as_bytes())
        .map_err(|error| format!("W9 PCM base64 解码失败：{error}"))?;
    if bytes.len() % 4 != 0 {
        return Err(format!(
            "W9 PCM f32le payload 必须 4 字节对齐，当前 {} 字节。",
            bytes.len()
        ));
    }

    Ok(bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect())
}

#[tauri::command]
pub fn start_w9_native_audio_session(
    request: W9NativeAudioStartRequest,
    state: tauri::State<'_, W9NativeAudioState>,
) -> Result<W9NativeAudioSnapshot, String> {
    let requested_config = NativeAudioPlaybackConfig {
        sample_rate: request.sample_rate.unwrap_or(48_000).clamp(8_000, 192_000),
        channels: request.channels.unwrap_or(2).clamp(1, 8),
        target_queue_ms: request.target_queue_ms.unwrap_or(80).clamp(20, 200),
        max_live_queue_ms: request.max_live_queue_ms.unwrap_or(120).clamp(40, 400),
    };
    let output = NativeAudioOutput::start_default(requested_config)?;
    let playback_config = output.config();
    let mut session = state
        .session
        .lock()
        .map_err(|_| "W9 音频会话锁定失败".to_string())?;
    session.output = Some(output);
    session.config = playback_config;
    session.running = true;
    snapshot_from_session(&session)
}

#[tauri::command]
pub fn push_w9_native_pcm_f32_frame(
    request: W9NativePcmF32FrameRequest,
    state: tauri::State<'_, W9NativeAudioState>,
) -> Result<W9NativeAudioSnapshot, String> {
    let samples = decode_f32le_base64(&request.data_base64)?;
    let session = state
        .session
        .lock()
        .map_err(|_| "W9 音频会话锁定失败".to_string())?;
    let config = session.config;
    let output = session
        .output
        .as_ref()
        .ok_or_else(|| "W9 音频会话尚未启动".to_string())?;
    if request.sample_rate != config.sample_rate || request.channels != config.channels {
        return Err(format!(
            "W9 PCM 格式与音频会话不一致：收到 {} Hz/{}ch，会话 {} Hz/{}ch。",
            request.sample_rate, request.channels, config.sample_rate, config.channels
        ));
    }
    output.push_interleaved_f32(&samples)?;
    snapshot_from_session(&session)
}

#[tauri::command]
pub fn get_w9_native_audio_snapshot(
    state: tauri::State<'_, W9NativeAudioState>,
) -> Result<W9NativeAudioSnapshot, String> {
    let session = state
        .session
        .lock()
        .map_err(|_| "W9 音频会话锁定失败".to_string())?;
    snapshot_from_session(&session)
}

#[tauri::command]
pub fn stop_w9_native_audio_session(
    state: tauri::State<'_, W9NativeAudioState>,
) -> Result<W9NativeAudioSnapshot, String> {
    let mut session = state
        .session
        .lock()
        .map_err(|_| "W9 音频会话锁定失败".to_string())?;
    session.output = None;
    session.running = false;
    snapshot_from_session(&session)
}

fn snapshot_from_session(session: &W9NativeAudioSession) -> Result<W9NativeAudioSnapshot, String> {
    let stats = session
        .output
        .as_ref()
        .map(|output| output.stats())
        .transpose()?
        .unwrap_or_else(NativeAudioPlaybackStats::default);

    Ok(snapshot_from_stats(session.running, session.config, stats))
}

fn snapshot_from_stats(
    running: bool,
    config: NativeAudioPlaybackConfig,
    stats: NativeAudioPlaybackStats,
) -> W9NativeAudioSnapshot {
    W9NativeAudioSnapshot {
        running,
        sample_rate: config.sample_rate,
        channels: config.channels,
        queue_ms: stats.queue_ms,
        pushed_frames: stats.pushed_frames,
        played_frames: stats.played_frames,
        trimmed_frames: stats.trimmed_frames,
        underruns: stats.underruns,
        source_frame_ms: stats.source_frame_ms,
        source_frame_max_ms: stats.source_frame_max_ms,
        source_frame_cadence_ms: stats.source_frame_cadence_ms,
        source_cadence_frames: stats.source_cadence_frames,
        last_reason: stats.last_reason.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_f32le_base64_pcm_samples() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&0.25_f32.to_le_bytes());
        bytes.extend_from_slice(&(-0.5_f32).to_le_bytes());
        let encoded = general_purpose::STANDARD.encode(bytes);

        let decoded = decode_f32le_base64(&encoded).expect("decoded pcm");

        assert_eq!(decoded, vec![0.25, -0.5]);
    }

    #[test]
    fn rejects_truncated_f32le_pcm_payloads() {
        let encoded = general_purpose::STANDARD.encode([0_u8, 0, 128]);

        let error = decode_f32le_base64(&encoded).expect_err("truncated pcm should fail");

        assert!(error.contains("4 字节对齐"));
    }

    #[test]
    fn snapshot_from_stats_reports_native_audio_queue() {
        let snapshot = snapshot_from_stats(
            true,
            NativeAudioPlaybackConfig::default(),
            NativeAudioPlaybackStats {
                pushed_frames: 960,
                played_frames: 480,
                trimmed_frames: 0,
                underruns: 1,
                queue_ms: 10,
                source_frame_ms: 20,
                source_frame_max_ms: 40,
                source_frame_cadence_ms: 20,
                source_cadence_frames: 2,
                last_reason: "native-playback-drain",
            },
        );

        assert!(snapshot.running);
        assert_eq!(snapshot.sample_rate, 48_000);
        assert_eq!(snapshot.channels, 2);
        assert_eq!(snapshot.pushed_frames, 960);
        assert_eq!(snapshot.played_frames, 480);
        assert_eq!(snapshot.queue_ms, 10);
        assert_eq!(snapshot.underruns, 1);
        assert_eq!(snapshot.source_frame_ms, 20);
        assert_eq!(snapshot.source_frame_max_ms, 40);
        assert_eq!(snapshot.source_frame_cadence_ms, 20);
        assert_eq!(snapshot.source_cadence_frames, 2);
        assert_eq!(snapshot.last_reason, "native-playback-drain");
    }
}
