use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::{collections::VecDeque, sync::Mutex};

const DEFAULT_TARGET_QUEUE_MS: u64 = 80;
const DEFAULT_HARD_MAX_QUEUE_MS: u64 = 180;
const DEFAULT_MAX_FRAMES: usize = 96;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NativeVideoQueueConfig {
    pub target_queue_ms: u64,
    pub hard_max_queue_ms: u64,
    pub max_frames: usize,
}

impl Default for NativeVideoQueueConfig {
    fn default() -> Self {
        Self {
            target_queue_ms: DEFAULT_TARGET_QUEUE_MS,
            hard_max_queue_ms: DEFAULT_HARD_MAX_QUEUE_MS,
            max_frames: DEFAULT_MAX_FRAMES,
        }
    }
}

impl NativeVideoQueueConfig {
    fn normalized(self) -> Self {
        let target_queue_ms = self.target_queue_ms.clamp(16, 500);
        let hard_max_queue_ms = self.hard_max_queue_ms.clamp(target_queue_ms.max(32), 1000);
        let max_frames = self.max_frames.clamp(8, 360);

        Self {
            target_queue_ms,
            hard_max_queue_ms,
            max_frames,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NativeVideoFrame {
    pub id: u64,
    pub received_at_ms: u64,
    pub is_keyframe: bool,
    pub byte_len: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeH264AnnexBFrame {
    pub id: u64,
    pub received_at_ms: u64,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NativeH264AnnexBSummary {
    pub nal_types: Vec<u8>,
    pub has_sps: bool,
    pub has_pps: bool,
    pub has_idr: bool,
    pub is_keyframe: bool,
    pub sps_count: u64,
    pub pps_count: u64,
    pub has_decoder_config: bool,
    pub codec_string: Option<String>,
    pub byte_len: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NativeVideoPushResult {
    pub accepted: bool,
    pub dropped_frames: usize,
    pub queue_ms: u64,
    pub waiting_for_keyframe: bool,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NativeH264AnnexBPushResult {
    pub video: NativeVideoPushResult,
    pub summary: NativeH264AnnexBSummary,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NativeVideoQueueSnapshot {
    pub queued_frames: usize,
    pub queue_ms: u64,
    pub accepted_frames: u64,
    pub dropped_frames: u64,
    pub keyframe_requests: u64,
    pub waiting_for_keyframe: bool,
    pub max_observed_queue_ms: u64,
    pub last_frame_id: Option<u64>,
    pub last_reason: String,
}

#[derive(Debug, Clone)]
pub struct NativeVideoQueue {
    config: NativeVideoQueueConfig,
    frames: VecDeque<NativeVideoFrame>,
    accepted_frames: u64,
    dropped_frames: u64,
    keyframe_requests: u64,
    waiting_for_keyframe: bool,
    max_observed_queue_ms: u64,
    last_reason: String,
}

impl NativeVideoQueue {
    pub fn new(config: NativeVideoQueueConfig) -> Self {
        Self {
            config: config.normalized(),
            frames: VecDeque::new(),
            accepted_frames: 0,
            dropped_frames: 0,
            keyframe_requests: 0,
            waiting_for_keyframe: false,
            max_observed_queue_ms: 0,
            last_reason: "idle".to_string(),
        }
    }

    pub fn push(&mut self, frame: NativeVideoFrame) -> NativeVideoPushResult {
        if self.waiting_for_keyframe && !frame.is_keyframe {
            self.dropped_frames += 1;
            self.last_reason = "waiting-keyframe".to_string();
            return self.result(false, 1, "waiting-keyframe");
        }

        if self.waiting_for_keyframe && frame.is_keyframe {
            self.frames.clear();
            self.waiting_for_keyframe = false;
            self.frames.push_back(frame);
            self.accepted_frames += 1;
            self.last_reason = "keyframe-recovered".to_string();
            return self.result(true, 0, "keyframe-recovered");
        }

        let mut dropped_frames = 0;
        if self.frames.len() >= self.config.max_frames {
            self.frames.pop_front();
            dropped_frames += 1;
        }

        self.frames.push_back(frame);
        self.accepted_frames += 1;
        self.max_observed_queue_ms = self.max_observed_queue_ms.max(self.queue_ms());

        if self.queue_ms() <= self.config.hard_max_queue_ms {
            self.dropped_frames += dropped_frames as u64;
            self.last_reason = "queued".to_string();
            return self.result(true, dropped_frames, "queued");
        }

        match self
            .frames
            .iter()
            .rposition(|candidate| candidate.is_keyframe)
        {
            Some(keyframe_index) if keyframe_index > 0 => {
                dropped_frames += self.drop_before(keyframe_index);
                self.dropped_frames += dropped_frames as u64;
                self.last_reason = "jump-to-keyframe".to_string();
                self.result(true, dropped_frames, "jump-to-keyframe")
            }
            _ => self.drop_all_and_request_keyframe(dropped_frames),
        }
    }

    pub fn push_h264_annexb(&mut self, frame: NativeH264AnnexBFrame) -> NativeH264AnnexBPushResult {
        let summary = inspect_h264_annexb(&frame.data);
        let video = self.push(NativeVideoFrame {
            id: frame.id,
            received_at_ms: frame.received_at_ms,
            is_keyframe: summary.is_keyframe,
            byte_len: summary.byte_len,
        });

        NativeH264AnnexBPushResult { video, summary }
    }

    pub fn queue_ms(&self) -> u64 {
        match (self.frames.front(), self.frames.back()) {
            (Some(first), Some(last)) => last.received_at_ms.saturating_sub(first.received_at_ms),
            _ => 0,
        }
    }

    #[cfg(test)]
    pub fn frame_ids(&self) -> Vec<u64> {
        self.frames.iter().map(|frame| frame.id).collect()
    }

    pub fn snapshot(&self) -> NativeVideoQueueSnapshot {
        NativeVideoQueueSnapshot {
            queued_frames: self.frames.len(),
            queue_ms: self.queue_ms(),
            accepted_frames: self.accepted_frames,
            dropped_frames: self.dropped_frames,
            keyframe_requests: self.keyframe_requests,
            waiting_for_keyframe: self.waiting_for_keyframe,
            max_observed_queue_ms: self.max_observed_queue_ms,
            last_frame_id: self.frames.back().map(|frame| frame.id),
            last_reason: self.last_reason.clone(),
        }
    }

    fn drop_before(&mut self, keyframe_index: usize) -> usize {
        let mut dropped = 0;
        for _ in 0..keyframe_index {
            if self.frames.pop_front().is_some() {
                dropped += 1;
            }
        }
        dropped
    }

    fn drop_all_and_request_keyframe(&mut self, already_dropped: usize) -> NativeVideoPushResult {
        let dropped_now = self.frames.len();
        self.frames.clear();
        self.waiting_for_keyframe = true;
        self.keyframe_requests += 1;
        let dropped_frames = already_dropped + dropped_now;
        self.dropped_frames += dropped_frames as u64;
        self.last_reason = "need-keyframe".to_string();
        self.result(false, dropped_frames, "need-keyframe")
    }

    fn result(&self, accepted: bool, dropped_frames: usize, reason: &str) -> NativeVideoPushResult {
        NativeVideoPushResult {
            accepted,
            dropped_frames,
            queue_ms: self.queue_ms(),
            waiting_for_keyframe: self.waiting_for_keyframe,
            reason: reason.to_string(),
        }
    }
}

pub fn inspect_h264_annexb(data: &[u8]) -> NativeH264AnnexBSummary {
    let mut nal_types = Vec::new();
    let mut sps_count = 0;
    let mut pps_count = 0;
    let mut codec_string = None;
    let mut cursor = 0;

    while let Some((start, prefix_len)) = find_annexb_start_code(data, cursor) {
        let nal_start = start + prefix_len;
        let nal_end = find_annexb_start_code(data, nal_start)
            .map(|(next_start, _)| next_start)
            .unwrap_or(data.len());
        if nal_start < nal_end {
            let nal = &data[nal_start..nal_end];
            let nal_type = nal[0] & 0x1f;
            nal_types.push(nal_type);
            if nal_type == 7 {
                sps_count += 1;
                if codec_string.is_none() {
                    codec_string = codec_string_from_sps(nal);
                }
            } else if nal_type == 8 {
                pps_count += 1;
            }
        }
        cursor = nal_end;
    }

    if nal_types.is_empty() && !data.is_empty() {
        let nal_type = data[0] & 0x1f;
        nal_types.push(nal_type);
        if nal_type == 7 {
            sps_count += 1;
            codec_string = codec_string_from_sps(data);
        } else if nal_type == 8 {
            pps_count += 1;
        }
    }

    let has_sps = nal_types.contains(&7);
    let has_pps = nal_types.contains(&8);
    let has_idr = nal_types.contains(&5);
    let has_decoder_config = has_sps && has_pps && codec_string.is_some();

    NativeH264AnnexBSummary {
        nal_types,
        has_sps,
        has_pps,
        has_idr,
        is_keyframe: has_idr,
        sps_count,
        pps_count,
        has_decoder_config,
        codec_string,
        byte_len: data.len() as u64,
    }
}

fn codec_string_from_sps(sps: &[u8]) -> Option<String> {
    if sps.len() < 4 {
        return None;
    }
    Some(format!("avc1.{:02X}{:02X}{:02X}", sps[1], sps[2], sps[3]))
}

fn find_annexb_start_code(data: &[u8], from: usize) -> Option<(usize, usize)> {
    let mut index = from;
    while index + 3 <= data.len() {
        if data[index] == 0 && data[index + 1] == 0 {
            if data[index + 2] == 1 {
                return Some((index, 3));
            }
            if index + 4 <= data.len() && data[index + 2] == 0 && data[index + 3] == 1 {
                return Some((index, 4));
            }
        }
        index += 1;
    }
    None
}

#[derive(Default)]
pub struct W8NativeVideoState {
    session: Mutex<W8NativeVideoSession>,
}

#[derive(Debug, Clone)]
struct W8NativeVideoSession {
    running: bool,
    host: Option<String>,
    port: Option<u16>,
    requested_fps: u32,
    renderer_mode: String,
    queue: NativeVideoQueue,
}

impl Default for W8NativeVideoSession {
    fn default() -> Self {
        Self {
            running: false,
            host: None,
            port: None,
            requested_fps: 60,
            renderer_mode: "native-video-queue-mvp".to_string(),
            queue: NativeVideoQueue::new(NativeVideoQueueConfig::default()),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct W8NativeVideoStartRequest {
    pub host: Option<String>,
    pub port: Option<u16>,
    pub requested_fps: Option<u32>,
    pub renderer_mode: Option<String>,
    pub target_queue_ms: Option<u64>,
    pub hard_max_queue_ms: Option<u64>,
    pub max_frames: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct W8NativeH264AnnexBFrameRequest {
    pub id: u64,
    pub received_at_ms: u64,
    pub data_base64: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct W8NativeVideoPlan {
    pub stage: String,
    pub renderer_mode: String,
    pub protocol_change_required: bool,
    pub video_queue_target_ms: u64,
    pub video_queue_hard_max_ms: u64,
    pub max_frames: usize,
    pub next_native_steps: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct W8NativeVideoSnapshot {
    pub running: bool,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub requested_fps: u32,
    pub renderer_mode: String,
    pub queue: NativeVideoQueueSnapshot,
}

#[tauri::command]
pub fn get_w8_native_video_plan() -> W8NativeVideoPlan {
    let config = NativeVideoQueueConfig::default();
    W8NativeVideoPlan {
        stage: "w8-video-mvp".to_string(),
        renderer_mode: "native-video-queue-mvp".to_string(),
        protocol_change_required: false,
        video_queue_target_ms: config.target_queue_ms,
        video_queue_hard_max_ms: config.hard_max_queue_ms,
        max_frames: config.max_frames,
        next_native_steps: vec![
            "feed SPS/PPS decoder config into Windows Media Foundation or D3D11 decoder"
                .to_string(),
            "render decoded frames to a native surface with latest-frame policy".to_string(),
        ],
    }
}

#[tauri::command]
pub fn start_w8_native_video_session(
    request: W8NativeVideoStartRequest,
    state: tauri::State<'_, W8NativeVideoState>,
) -> Result<W8NativeVideoSnapshot, String> {
    let mut session = state
        .session
        .lock()
        .map_err(|_| "W8 视频会话锁定失败".to_string())?;
    let config = NativeVideoQueueConfig {
        target_queue_ms: request.target_queue_ms.unwrap_or(DEFAULT_TARGET_QUEUE_MS),
        hard_max_queue_ms: request
            .hard_max_queue_ms
            .unwrap_or(DEFAULT_HARD_MAX_QUEUE_MS),
        max_frames: request.max_frames.unwrap_or(DEFAULT_MAX_FRAMES),
    }
    .normalized();

    session.running = true;
    session.host = request.host;
    session.port = request.port;
    session.requested_fps = request.requested_fps.unwrap_or(60).clamp(1, 240);
    session.renderer_mode = request
        .renderer_mode
        .unwrap_or_else(|| "native-video-queue-mvp".to_string());
    session.queue = NativeVideoQueue::new(config);
    Ok(session.snapshot())
}

#[tauri::command]
pub fn push_w8_native_video_frame(
    frame: NativeVideoFrame,
    state: tauri::State<'_, W8NativeVideoState>,
) -> Result<NativeVideoPushResult, String> {
    let mut session = state
        .session
        .lock()
        .map_err(|_| "W8 视频会话锁定失败".to_string())?;
    if !session.running {
        return Err("W8 视频会话尚未启动".to_string());
    }
    Ok(session.queue.push(frame))
}

#[tauri::command]
pub fn push_w8_native_h264_annexb_frame(
    request: W8NativeH264AnnexBFrameRequest,
    state: tauri::State<'_, W8NativeVideoState>,
) -> Result<NativeH264AnnexBPushResult, String> {
    let data = general_purpose::STANDARD
        .decode(request.data_base64.as_bytes())
        .map_err(|_| "W8 H.264 Annex B base64 解码失败".to_string())?;
    let mut session = state
        .session
        .lock()
        .map_err(|_| "W8 视频会话锁定失败".to_string())?;
    if !session.running {
        return Err("W8 视频会话尚未启动".to_string());
    }
    Ok(session.queue.push_h264_annexb(NativeH264AnnexBFrame {
        id: request.id,
        received_at_ms: request.received_at_ms,
        data,
    }))
}

#[tauri::command]
pub fn get_w8_native_video_snapshot(
    state: tauri::State<'_, W8NativeVideoState>,
) -> Result<W8NativeVideoSnapshot, String> {
    let session = state
        .session
        .lock()
        .map_err(|_| "W8 视频会话锁定失败".to_string())?;
    Ok(session.snapshot())
}

#[tauri::command]
pub fn stop_w8_native_video_session(
    state: tauri::State<'_, W8NativeVideoState>,
) -> Result<W8NativeVideoSnapshot, String> {
    let mut session = state
        .session
        .lock()
        .map_err(|_| "W8 视频会话锁定失败".to_string())?;
    session.running = false;
    Ok(session.snapshot())
}

impl W8NativeVideoSession {
    fn snapshot(&self) -> W8NativeVideoSnapshot {
        W8NativeVideoSnapshot {
            running: self.running,
            host: self.host.clone(),
            port: self.port,
            requested_fps: self.requested_fps,
            renderer_mode: self.renderer_mode.clone(),
            queue: self.queue.snapshot(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(id: u64, received_at_ms: u64, keyframe: bool) -> NativeVideoFrame {
        NativeVideoFrame {
            id,
            received_at_ms,
            is_keyframe: keyframe,
            byte_len: 4096,
        }
    }

    fn annexb_payload(nals: &[&[u8]]) -> Vec<u8> {
        let mut payload = Vec::new();
        for nal in nals {
            payload.extend_from_slice(&[0, 0, 0, 1]);
            payload.extend_from_slice(nal);
        }
        payload
    }

    #[test]
    fn inspects_annexb_parameter_sets_and_idr() {
        let payload = annexb_payload(&[&[0x67, 0x42, 0x00, 0x29], &[0x68, 0xce], &[0x65, 0x88]]);

        let summary = inspect_h264_annexb(&payload);

        assert_eq!(summary.nal_types, vec![7, 8, 5]);
        assert!(summary.has_sps);
        assert!(summary.has_pps);
        assert!(summary.has_idr);
        assert!(summary.is_keyframe);
        assert_eq!(summary.sps_count, 1);
        assert_eq!(summary.pps_count, 1);
        assert!(summary.has_decoder_config);
        assert_eq!(summary.codec_string.as_deref(), Some("avc1.420029"));
        assert_eq!(summary.byte_len, payload.len() as u64);
    }

    #[test]
    fn keeps_idr_without_parameter_sets_from_claiming_decoder_config() {
        let payload = annexb_payload(&[&[0x65, 0x88]]);

        let summary = inspect_h264_annexb(&payload);

        assert_eq!(summary.nal_types, vec![5]);
        assert!(summary.has_idr);
        assert!(summary.is_keyframe);
        assert_eq!(summary.sps_count, 0);
        assert_eq!(summary.pps_count, 0);
        assert!(!summary.has_decoder_config);
        assert_eq!(summary.codec_string, None);
    }

    #[test]
    fn pushes_annexb_idr_into_video_queue_as_keyframe() {
        let payload = annexb_payload(&[&[0x67, 0x42, 0x00, 0x29], &[0x68, 0xce], &[0x65, 0x88]]);
        let mut queue = NativeVideoQueue::new(NativeVideoQueueConfig {
            target_queue_ms: 80,
            hard_max_queue_ms: 120,
            max_frames: 64,
        });

        let result = queue.push_h264_annexb(NativeH264AnnexBFrame {
            id: 42,
            received_at_ms: 1000,
            data: payload.clone(),
        });

        assert!(result.video.accepted);
        assert_eq!(result.video.reason, "queued");
        assert_eq!(result.summary.nal_types, vec![7, 8, 5]);
        assert!(result.summary.is_keyframe);
        assert!(result.summary.has_decoder_config);
        assert_eq!(result.summary.codec_string.as_deref(), Some("avc1.420029"));
        assert_eq!(queue.frame_ids(), vec![42]);
        assert_eq!(queue.snapshot().last_frame_id, Some(42));
        assert_eq!(queue.snapshot().queue_ms, 0);
    }

    #[test]
    fn drops_backlog_to_newest_keyframe() {
        let mut queue = NativeVideoQueue::new(NativeVideoQueueConfig {
            target_queue_ms: 80,
            hard_max_queue_ms: 120,
            max_frames: 64,
        });

        assert_eq!(queue.push(frame(1, 0, true)).reason, "queued");
        assert_eq!(queue.push(frame(2, 40, false)).reason, "queued");
        assert_eq!(queue.push(frame(3, 80, false)).reason, "queued");
        let result = queue.push(frame(4, 160, true));

        assert!(result.accepted);
        assert_eq!(result.reason, "jump-to-keyframe");
        assert_eq!(result.dropped_frames, 3);
        assert_eq!(result.queue_ms, 0);
        assert!(!result.waiting_for_keyframe);
        assert_eq!(queue.frame_ids(), vec![4]);
    }

    #[test]
    fn drops_delta_backlog_and_waits_for_keyframe() {
        let mut queue = NativeVideoQueue::new(NativeVideoQueueConfig {
            target_queue_ms: 80,
            hard_max_queue_ms: 120,
            max_frames: 64,
        });

        assert_eq!(queue.push(frame(1, 0, false)).reason, "queued");
        assert_eq!(queue.push(frame(2, 80, false)).reason, "queued");
        let result = queue.push(frame(3, 180, false));

        assert!(!result.accepted);
        assert_eq!(result.reason, "need-keyframe");
        assert_eq!(result.dropped_frames, 3);
        assert_eq!(result.queue_ms, 0);
        assert!(result.waiting_for_keyframe);
        assert!(queue.frame_ids().is_empty());

        let recovery = queue.push(frame(4, 220, true));
        assert!(recovery.accepted);
        assert_eq!(recovery.reason, "keyframe-recovered");
        assert_eq!(queue.frame_ids(), vec![4]);
    }

    #[test]
    fn keeps_low_latency_frames_without_drops() {
        let mut queue = NativeVideoQueue::new(NativeVideoQueueConfig {
            target_queue_ms: 80,
            hard_max_queue_ms: 120,
            max_frames: 64,
        });

        assert_eq!(queue.push(frame(1, 0, true)).reason, "queued");
        let result = queue.push(frame(2, 40, false));

        assert!(result.accepted);
        assert_eq!(result.reason, "queued");
        assert_eq!(result.dropped_frames, 0);
        assert_eq!(result.queue_ms, 40);
        assert!(!result.waiting_for_keyframe);
        assert_eq!(queue.frame_ids(), vec![1, 2]);
    }
}
