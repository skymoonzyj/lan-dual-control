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
        let hard_max_queue_ms = self
            .hard_max_queue_ms
            .clamp(target_queue_ms.max(32), 1000);
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

        match self.frames.iter().rposition(|candidate| candidate.is_keyframe) {
            Some(keyframe_index) if keyframe_index > 0 => {
                dropped_frames += self.drop_before(keyframe_index);
                self.dropped_frames += dropped_frames as u64;
                self.last_reason = "jump-to-keyframe".to_string();
                self.result(true, dropped_frames, "jump-to-keyframe")
            }
            _ => self.drop_all_and_request_keyframe(dropped_frames),
        }
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
            "move H.264 receive path out of browser render loop".to_string(),
            "connect Windows Media Foundation or D3D11 decoder".to_string(),
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
