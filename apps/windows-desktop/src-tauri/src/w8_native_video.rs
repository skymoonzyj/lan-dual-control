use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::{collections::VecDeque, sync::Mutex};
#[cfg(windows)]
use std::{ffi::c_void, mem::ManuallyDrop, ptr, slice, sync::mpsc, thread, time::Duration};

#[cfg(windows)]
use windows::core::{Interface, GUID};
#[cfg(windows)]
use windows::Win32::Foundation::{HMODULE, HWND, RECT};
#[cfg(windows)]
use windows::Win32::Graphics::Direct3D::{
    D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1,
};
#[cfg(windows)]
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Resource, ID3D11Texture2D,
    D3D11_BIND_DECODER, D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE,
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT,
};
#[cfg(windows)]
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_ALPHA_MODE_IGNORE, DXGI_FORMAT, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_NV12,
    DXGI_SAMPLE_DESC,
};
#[cfg(windows)]
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, IDXGIFactory2, IDXGIOutput, IDXGISwapChain1, DXGI_PRESENT,
    DXGI_SCALING_STRETCH, DXGI_SWAP_CHAIN_DESC1, DXGI_SWAP_EFFECT_FLIP_DISCARD,
    DXGI_USAGE_RENDER_TARGET_OUTPUT,
};
#[cfg(windows)]
use windows::Win32::Media::MediaFoundation::{
    IMFMediaType, IMFSample, IMFTransform, MFCreateMediaType, MFCreateMemoryBuffer, MFCreateSample,
    MFMediaType_Video, MFShutdown, MFStartup, MFTEnumEx, MFVideoFormat_ARGB32, MFVideoFormat_H264,
    MFVideoFormat_IYUV, MFVideoFormat_NV12, MFVideoFormat_RGB32, MFVideoFormat_YUY2,
    MFVideoInterlace_Progressive, MFSTARTUP_LITE, MFT_CATEGORY_VIDEO_DECODER, MFT_ENUM_FLAG,
    MFT_ENUM_FLAG_HARDWARE, MFT_ENUM_FLAG_LOCALMFT, MFT_ENUM_FLAG_SORTANDFILTER,
    MFT_ENUM_FLAG_SYNCMFT, MFT_OUTPUT_DATA_BUFFER, MFT_OUTPUT_STREAM_PROVIDES_SAMPLES,
    MFT_REGISTER_TYPE_INFO, MF_E_TRANSFORM_NEED_MORE_INPUT, MF_E_TRANSFORM_STREAM_CHANGE,
    MF_MT_ALL_SAMPLES_INDEPENDENT, MF_MT_AVG_BITRATE, MF_MT_FRAME_RATE, MF_MT_FRAME_SIZE,
    MF_MT_INTERLACE_MODE, MF_MT_MAJOR_TYPE, MF_MT_MPEG_SEQUENCE_HEADER, MF_MT_PIXEL_ASPECT_RATIO,
    MF_MT_SUBTYPE, MF_VERSION,
};
#[cfg(windows)]
use windows::Win32::System::Com::CoTaskMemFree;
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{GetClientRect, IsWindow};

const DEFAULT_TARGET_QUEUE_MS: u64 = 80;
const DEFAULT_HARD_MAX_QUEUE_MS: u64 = 180;
const DEFAULT_MAX_FRAMES: usize = 96;
const DEFAULT_NATIVE_SURFACE_WIDTH: u32 = 1920;
const DEFAULT_NATIVE_SURFACE_HEIGHT: u32 = 1080;

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
    #[serde(skip)]
    pub decoder_config_bytes: Vec<u8>,
    #[serde(skip)]
    pub access_unit_bytes: Vec<u8>,
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
    pub decoder_init: Option<W8NativeVideoDecoderInitPreflight>,
    pub decode_step: Option<W8NativeVideoDecodeStepPreflight>,
    pub decoder_session: Option<W8NativeVideoDecoderSessionSummary>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct W8NativeVideoDecoderInitPreflight {
    pub mode: String,
    pub attempted: bool,
    pub ready: bool,
    pub codec_string: Option<String>,
    pub input_type_set: bool,
    pub output_type_available: bool,
    pub output_subtypes: Vec<String>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct W8NativeVideoDecodeStepPreflight {
    pub mode: String,
    pub attempted: bool,
    pub ready: bool,
    pub codec_string: Option<String>,
    pub frame_byte_len: u64,
    pub sample_created: bool,
    pub input_accepted: bool,
    pub output_attempted: bool,
    pub output_produced: bool,
    pub output_status: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct W8NativeVideoDecoderSessionSummary {
    pub mode: String,
    pub attempted: bool,
    pub active: bool,
    pub ready: bool,
    pub codec_string: Option<String>,
    pub output_subtype: String,
    pub submitted_frames: u64,
    pub accepted_input_frames: u64,
    pub decoded_frames: u64,
    pub last_status: String,
    pub worker_thread: bool,
    pub worker_mode: String,
    pub worker_status: String,
    pub frame_handoff_active: bool,
    pub frame_handoff_mode: String,
    pub frame_handoff_status: String,
    pub latest_frame_format: String,
    pub latest_frame_bytes: u64,
    pub latest_frame_id: Option<u64>,
    pub native_surface_ready: bool,
    pub native_surface_mode: String,
    pub native_surface_status: String,
    pub native_surface_format: String,
    pub native_surface_width: u32,
    pub native_surface_height: u32,
    pub native_surface_reason: String,
    pub native_surface_copy_status: String,
    pub native_surface_copy_bytes: u64,
    pub native_surface_presented_frames: u64,
    pub native_surface_last_frame_id: Option<u64>,
    pub native_present_ready: bool,
    pub native_present_mode: String,
    pub native_present_status: String,
    pub native_present_format: String,
    pub native_present_width: u32,
    pub native_present_height: u32,
    pub native_present_frames: u64,
    pub native_present_last_frame_id: Option<u64>,
    pub native_present_reason: String,
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

        NativeH264AnnexBPushResult {
            video,
            summary,
            decoder_init: None,
            decode_step: None,
            decoder_session: None,
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

pub fn inspect_h264_annexb(data: &[u8]) -> NativeH264AnnexBSummary {
    let mut nal_types = Vec::new();
    let mut sps_count = 0;
    let mut pps_count = 0;
    let mut codec_string = None;
    let mut decoder_config_bytes = Vec::new();
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
                push_annexb_nal(&mut decoder_config_bytes, nal);
            } else if nal_type == 8 {
                pps_count += 1;
                push_annexb_nal(&mut decoder_config_bytes, nal);
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
            push_annexb_nal(&mut decoder_config_bytes, data);
        } else if nal_type == 8 {
            pps_count += 1;
            push_annexb_nal(&mut decoder_config_bytes, data);
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
        decoder_config_bytes,
        access_unit_bytes: data.to_vec(),
    }
}

fn codec_string_from_sps(sps: &[u8]) -> Option<String> {
    if sps.len() < 4 {
        return None;
    }
    Some(format!("avc1.{:02X}{:02X}{:02X}", sps[1], sps[2], sps[3]))
}

fn push_annexb_nal(output: &mut Vec<u8>, nal: &[u8]) {
    output.extend_from_slice(&[0, 0, 0, 1]);
    output.extend_from_slice(nal);
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

struct W8NativeVideoSession {
    running: bool,
    host: Option<String>,
    port: Option<u16>,
    requested_fps: u32,
    renderer_mode: String,
    queue: NativeVideoQueue,
    decoder_init: Option<W8NativeVideoDecoderInitPreflight>,
    decode_step: Option<W8NativeVideoDecodeStepPreflight>,
    decoder_session: W8NativeVideoDecoderSessionState,
    #[cfg(windows)]
    window_present_target: Option<W8NativeWindowPresentTargetConfig>,
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
            decoder_init: None,
            decode_step: None,
            decoder_session: W8NativeVideoDecoderSessionState::default(),
            #[cfg(windows)]
            window_present_target: None,
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
    pub decoder_probe_mode: String,
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

impl W8NativeVideoDecoderInitPreflight {
    fn missing_config() -> Self {
        Self {
            mode: "media-foundation-h264-decoder-init-preflight".to_string(),
            attempted: false,
            ready: false,
            codec_string: None,
            input_type_set: false,
            output_type_available: false,
            output_subtypes: Vec::new(),
            reason: "blocked: SPS/PPS decoder config is required before MF decoder init"
                .to_string(),
        }
    }

    fn from_runtime_result(
        codec_string: Option<String>,
        result: Result<(bool, Vec<String>), String>,
    ) -> Self {
        let (input_type_set, output_subtypes, runtime_error) = match result {
            Ok((input_type_set, output_subtypes)) => (input_type_set, output_subtypes, None),
            Err(error) => (false, Vec::new(), Some(error)),
        };
        let output_type_available = !output_subtypes.is_empty();
        let ready = input_type_set && output_type_available;
        let reason = if ready {
            format!(
                "ready; codec={}; output={}",
                codec_string.as_deref().unwrap_or("unknown"),
                output_subtypes.join("/")
            )
        } else {
            format!(
                "blocked: {}",
                runtime_error.unwrap_or_else(|| {
                    if !input_type_set {
                        "Media Foundation input type was not accepted".to_string()
                    } else {
                        "no Media Foundation decoder output type available".to_string()
                    }
                })
            )
        };

        Self {
            mode: "media-foundation-h264-decoder-init-preflight".to_string(),
            attempted: true,
            ready,
            codec_string,
            input_type_set,
            output_type_available,
            output_subtypes,
            reason,
        }
    }
}

impl W8NativeVideoDecodeStepPreflight {
    fn missing_config_or_keyframe(summary: &NativeH264AnnexBSummary) -> Self {
        Self {
            mode: "media-foundation-h264-sample-decode-step-preflight".to_string(),
            attempted: false,
            ready: false,
            codec_string: summary.codec_string.clone(),
            frame_byte_len: summary.byte_len,
            sample_created: false,
            input_accepted: false,
            output_attempted: false,
            output_produced: false,
            output_status: "missing-config-or-keyframe".to_string(),
            reason: "blocked: SPS/PPS decoder config and IDR access unit are required before MF decode step"
                .to_string(),
        }
    }

    fn from_runtime_result(
        summary: &NativeH264AnnexBSummary,
        result: Result<W8NativeVideoDecodeStepRuntime, String>,
    ) -> Self {
        match result {
            Ok(runtime) => {
                let ready =
                    runtime.sample_created && runtime.input_accepted && runtime.output_attempted;
                Self {
                    mode: "media-foundation-h264-sample-decode-step-preflight".to_string(),
                    attempted: true,
                    ready,
                    codec_string: summary.codec_string.clone(),
                    frame_byte_len: summary.byte_len,
                    sample_created: runtime.sample_created,
                    input_accepted: runtime.input_accepted,
                    output_attempted: runtime.output_attempted,
                    output_produced: runtime.output_produced,
                    output_status: runtime.output_status,
                    reason: runtime.reason,
                }
            }
            Err(error) => Self {
                mode: "media-foundation-h264-sample-decode-step-preflight".to_string(),
                attempted: true,
                ready: false,
                codec_string: summary.codec_string.clone(),
                frame_byte_len: summary.byte_len,
                sample_created: false,
                input_accepted: false,
                output_attempted: false,
                output_produced: false,
                output_status: "blocked".to_string(),
                reason: format!("blocked: {error}"),
            },
        }
    }
}

struct W8NativeVideoDecodeStepRuntime {
    sample_created: bool,
    input_accepted: bool,
    output_attempted: bool,
    output_produced: bool,
    output_status: String,
    reason: String,
}

#[derive(Default)]
struct W8NativeVideoDecoderSessionState {
    summary: Option<W8NativeVideoDecoderSessionSummary>,
    decoder_config_bytes: Vec<u8>,
    #[cfg(windows)]
    worker: Option<W8NativeVideoDecoderWorker>,
}

impl W8NativeVideoDecoderSessionState {
    fn reset(&mut self) {
        self.summary = None;
        self.decoder_config_bytes.clear();
        #[cfg(windows)]
        {
            self.worker = None;
        }
    }

    fn push_h264_access_unit(
        &mut self,
        summary: &NativeH264AnnexBSummary,
        #[cfg(windows)] window_present_target: Option<W8NativeWindowPresentTargetConfig>,
    ) -> Option<W8NativeVideoDecoderSessionSummary> {
        if self.summary.is_none() && !summary.has_decoder_config {
            return None;
        }

        if self.summary.is_none() {
            self.start(
                summary,
                #[cfg(windows)]
                window_present_target,
            );
        }

        let should_process = self
            .summary
            .as_ref()
            .map(|current| current.active)
            .unwrap_or(false);
        let next_submitted_frame = self
            .summary
            .as_ref()
            .map(|current| current.submitted_frames + 1)
            .unwrap_or(1);
        let process_result = if should_process {
            Some(self.process(summary, next_submitted_frame))
        } else {
            None
        };

        if let Some(current) = self.summary.as_mut() {
            current.submitted_frames += 1;
            if let Some(process_result) = process_result {
                let process_status = process_result.status.clone();
                let process_output_byte_len = process_result.output_byte_len;
                if process_result.input_accepted {
                    current.accepted_input_frames += 1;
                }
                if process_result.output_produced {
                    current.decoded_frames += 1;
                    current.latest_frame_id = Some(current.submitted_frames);
                    current.latest_frame_bytes = process_output_byte_len;
                    current.latest_frame_format = current.output_subtype.clone();
                    current.frame_handoff_status = "latest-frame-ready".to_string();
                    if let Some(surface_copy) = process_result.surface_copy.as_ref() {
                        current.native_surface_status = surface_copy.status.clone();
                        current.native_surface_copy_status = surface_copy.status.clone();
                        current.native_surface_copy_bytes = surface_copy.bytes_copied;
                        current.native_surface_presented_frames = surface_copy.presented_frames;
                        current.native_surface_last_frame_id = surface_copy.last_frame_id;
                        current.native_surface_reason = surface_copy.reason.clone();
                        current.native_present_status = surface_copy.native_present_status.clone();
                        current.native_present_frames = surface_copy.native_present_frames;
                        current.native_present_last_frame_id =
                            surface_copy.native_present_last_frame_id;
                        current.native_present_reason = surface_copy.native_present_reason.clone();
                        if surface_copy.status == "latest-frame-presented" {
                            current.last_status = surface_copy.status.clone();
                            current.frame_handoff_status = "latest-frame-ready".to_string();
                        }
                    }
                } else if process_result.input_accepted && current.frame_handoff_active {
                    current.frame_handoff_status = "waiting-decoded-frame".to_string();
                } else if current.frame_handoff_active {
                    current.frame_handoff_status = process_status.clone();
                }
                current.last_status = process_status;
                current.reason = process_result.reason;
                current.ready = current.active && current.accepted_input_frames > 0;
            }
            Some(current.clone())
        } else {
            None
        }
    }

    fn start(
        &mut self,
        summary: &NativeH264AnnexBSummary,
        #[cfg(windows)] window_present_target: Option<W8NativeWindowPresentTargetConfig>,
    ) {
        let codec_string = summary.codec_string.clone();
        self.decoder_config_bytes = summary.decoder_config_bytes.clone();
        let mut started = W8NativeVideoDecoderSessionSummary {
            mode: "media-foundation-h264-persistent-decoder-session".to_string(),
            attempted: true,
            active: false,
            ready: false,
            codec_string,
            output_subtype: "pending".to_string(),
            submitted_frames: 0,
            accepted_input_frames: 0,
            decoded_frames: 0,
            last_status: "starting".to_string(),
            worker_thread: false,
            worker_mode: "none".to_string(),
            worker_status: "starting".to_string(),
            frame_handoff_active: false,
            frame_handoff_mode: "none".to_string(),
            frame_handoff_status: "starting".to_string(),
            latest_frame_format: "pending".to_string(),
            latest_frame_bytes: 0,
            latest_frame_id: None,
            native_surface_ready: false,
            native_surface_mode: "none".to_string(),
            native_surface_status: "starting".to_string(),
            native_surface_format: "pending".to_string(),
            native_surface_width: 0,
            native_surface_height: 0,
            native_surface_reason: "starting native surface target preflight".to_string(),
            native_surface_copy_status: "waiting-decoded-frame".to_string(),
            native_surface_copy_bytes: 0,
            native_surface_presented_frames: 0,
            native_surface_last_frame_id: None,
            native_present_ready: false,
            native_present_mode: "none".to_string(),
            native_present_status: "starting".to_string(),
            native_present_format: "pending".to_string(),
            native_present_width: 0,
            native_present_height: 0,
            native_present_frames: 0,
            native_present_last_frame_id: None,
            native_present_reason: "starting native present target preflight".to_string(),
            reason: "starting persistent decoder session".to_string(),
        };

        #[cfg(windows)]
        {
            match W8NativeVideoDecoderWorker::start(
                self.decoder_config_bytes.clone(),
                window_present_target,
            ) {
                Ok((worker, output_subtype, surface_target)) => {
                    started.active = true;
                    started.output_subtype = output_subtype;
                    started.last_status = "active".to_string();
                    started.worker_thread = true;
                    started.worker_mode = "dedicated-native-decoder-thread".to_string();
                    started.worker_status = "active".to_string();
                    started.frame_handoff_active = true;
                    started.frame_handoff_mode = "native-latest-frame-handoff".to_string();
                    started.frame_handoff_status = "waiting-decoded-frame".to_string();
                    started.latest_frame_format = started.output_subtype.clone();
                    started.native_surface_ready = surface_target.ready;
                    started.native_surface_mode = surface_target.mode;
                    started.native_surface_status = surface_target.status;
                    started.native_surface_format = surface_target.format;
                    started.native_surface_width = surface_target.width;
                    started.native_surface_height = surface_target.height;
                    started.native_surface_reason = surface_target.reason;
                    started.native_surface_copy_status = surface_target.copy_status;
                    started.native_surface_copy_bytes = surface_target.copy_bytes;
                    started.native_surface_presented_frames = surface_target.presented_frames;
                    started.native_surface_last_frame_id = surface_target.last_frame_id;
                    started.native_present_ready = surface_target.native_present_ready;
                    started.native_present_mode = surface_target.native_present_mode;
                    started.native_present_status = surface_target.native_present_status;
                    started.native_present_format = surface_target.native_present_format;
                    started.native_present_width = surface_target.native_present_width;
                    started.native_present_height = surface_target.native_present_height;
                    started.native_present_frames = surface_target.native_present_frames;
                    started.native_present_last_frame_id =
                        surface_target.native_present_last_frame_id;
                    started.native_present_reason = surface_target.native_present_reason;
                    started.reason = "ready; dedicated native decoder worker active".to_string();
                    self.worker = Some(worker);
                }
                Err(error) => {
                    started.last_status = "start-blocked".to_string();
                    started.worker_status = "start-blocked".to_string();
                    started.frame_handoff_status = "start-blocked".to_string();
                    started.native_surface_status = "start-blocked".to_string();
                    started.native_surface_reason = format!("blocked: {error}");
                    started.native_present_status = "start-blocked".to_string();
                    started.native_present_reason = format!("blocked: {error}");
                    started.reason = format!("blocked: {error}");
                    self.worker = None;
                }
            }
        }
        #[cfg(not(windows))]
        {
            started.last_status = "unsupported".to_string();
            started.worker_status = "unsupported".to_string();
            started.native_surface_status = "unsupported".to_string();
            started.native_surface_reason =
                "blocked: Windows-only D3D11 native surface target".to_string();
            started.native_present_status = "unsupported".to_string();
            started.native_present_reason =
                "blocked: Windows-only D3D11 native present target".to_string();
            started.reason =
                "blocked: Windows-only Media Foundation persistent decoder session".to_string();
        }

        self.summary = Some(started);
    }

    fn process(
        &mut self,
        summary: &NativeH264AnnexBSummary,
        frame_id: u64,
    ) -> W8NativeVideoDecoderSessionProcess {
        #[cfg(windows)]
        {
            if let Some(worker) = self.worker.as_ref() {
                return worker.process(summary.access_unit_bytes.clone(), frame_id);
            }
            W8NativeVideoDecoderSessionProcess {
                input_accepted: false,
                output_produced: false,
                output_byte_len: 0,
                status: "worker-inactive".to_string(),
                reason: "blocked: dedicated native decoder worker is not active".to_string(),
                surface_copy: None,
            }
        }
        #[cfg(not(windows))]
        {
            W8NativeVideoDecoderSessionProcess {
                input_accepted: false,
                output_produced: false,
                output_byte_len: 0,
                status: "inactive".to_string(),
                reason: "blocked: persistent decoder session is not active".to_string(),
                surface_copy: None,
            }
        }
    }
}

struct W8NativeVideoDecoderSessionProcess {
    input_accepted: bool,
    output_produced: bool,
    output_byte_len: u64,
    status: String,
    reason: String,
    surface_copy: Option<W8NativeSurfaceCopyResult>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct W8NativeSurfaceCopyResult {
    status: String,
    bytes_copied: u64,
    presented_frames: u64,
    last_frame_id: Option<u64>,
    native_present_status: String,
    native_present_frames: u64,
    native_present_last_frame_id: Option<u64>,
    native_present_reason: String,
    reason: String,
}

#[cfg(windows)]
enum W8NativeVideoDecoderWorkerCommand {
    Decode {
        access_unit: Vec<u8>,
        frame_id: u64,
        response: mpsc::Sender<W8NativeVideoDecoderSessionProcess>,
    },
    Stop,
}

#[cfg(windows)]
struct W8NativeVideoDecoderWorker {
    sender: mpsc::Sender<W8NativeVideoDecoderWorkerCommand>,
    handle: Option<thread::JoinHandle<()>>,
}

#[cfg(windows)]
impl W8NativeVideoDecoderWorker {
    fn start(
        sequence_header: Vec<u8>,
        window_present_target: Option<W8NativeWindowPresentTargetConfig>,
    ) -> Result<(Self, String, W8NativeSurfaceTargetSummary), String> {
        let (command_sender, command_receiver) = mpsc::channel();
        let (init_sender, init_receiver) = mpsc::channel();
        let handle = thread::Builder::new()
            .name("lan-dual-w8-mf-decoder".to_string())
            .spawn(move || {
                match unsafe {
                    W8MfH264DecoderWorkerRuntime::start(&sequence_header, window_present_target)
                } {
                    Ok(mut runtime) => {
                        let output_subtype = runtime.output_subtype.clone();
                        let surface_target = runtime.surface_target.summary.clone();
                        let _ = init_sender.send(Ok((output_subtype, surface_target)));
                        while let Ok(command) = command_receiver.recv() {
                            match command {
                                W8NativeVideoDecoderWorkerCommand::Decode {
                                    access_unit,
                                    frame_id,
                                    response,
                                } => {
                                    let process =
                                        unsafe { runtime.process(&access_unit, frame_id) };
                                    let _ = response.send(process);
                                }
                                W8NativeVideoDecoderWorkerCommand::Stop => break,
                            }
                        }
                    }
                    Err(error) => {
                        let _ = init_sender.send(Err(error));
                    }
                }
            })
            .map_err(|error| format!("spawn native decoder worker failed: {error}"))?;

        match init_receiver.recv_timeout(Duration::from_millis(3000)) {
            Ok(Ok((output_subtype, surface_target))) => Ok((
                Self {
                    sender: command_sender,
                    handle: Some(handle),
                },
                output_subtype,
                surface_target,
            )),
            Ok(Err(error)) => {
                let _ = handle.join();
                Err(error)
            }
            Err(_) => {
                let _ = command_sender.send(W8NativeVideoDecoderWorkerCommand::Stop);
                Err("native decoder worker startup timed out".to_string())
            }
        }
    }

    fn process(&self, access_unit: Vec<u8>, frame_id: u64) -> W8NativeVideoDecoderSessionProcess {
        let (response_sender, response_receiver) = mpsc::channel();
        if let Err(error) = self.sender.send(W8NativeVideoDecoderWorkerCommand::Decode {
            access_unit,
            frame_id,
            response: response_sender,
        }) {
            return W8NativeVideoDecoderSessionProcess {
                input_accepted: false,
                output_produced: false,
                output_byte_len: 0,
                status: "worker-send-blocked".to_string(),
                reason: format!("blocked: native decoder worker command send failed: {error}"),
                surface_copy: None,
            };
        }

        match response_receiver.recv_timeout(Duration::from_millis(750)) {
            Ok(process) => process,
            Err(error) => W8NativeVideoDecoderSessionProcess {
                input_accepted: false,
                output_produced: false,
                output_byte_len: 0,
                status: "worker-timeout".to_string(),
                reason: format!("blocked: native decoder worker response timed out: {error}"),
                surface_copy: None,
            },
        }
    }
}

#[cfg(windows)]
impl Drop for W8NativeVideoDecoderWorker {
    fn drop(&mut self) {
        let _ = self.sender.send(W8NativeVideoDecoderWorkerCommand::Stop);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

#[cfg(windows)]
struct W8MfH264DecoderWorkerRuntime {
    transform: IMFTransform,
    output_subtype: String,
    surface_target: W8NativeSurfaceTargetRuntime,
}

#[cfg(windows)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct W8NativeWindowPresentTargetConfig {
    hwnd_value: isize,
    client_width: u32,
    client_height: u32,
}

#[cfg(windows)]
impl W8NativeWindowPresentTargetConfig {
    fn hwnd(self) -> HWND {
        HWND(self.hwnd_value as *mut c_void)
    }
}

#[cfg(windows)]
struct W8NativeSurfaceTargetRuntime {
    _device: ID3D11Device,
    _context: ID3D11DeviceContext,
    _texture: ID3D11Texture2D,
    _present_texture: ID3D11Texture2D,
    _swapchain: Option<IDXGISwapChain1>,
    summary: W8NativeSurfaceTargetSummary,
}

#[cfg(windows)]
#[derive(Clone)]
struct W8NativeSurfaceTargetSummary {
    ready: bool,
    mode: String,
    status: String,
    format: String,
    width: u32,
    height: u32,
    reason: String,
    copy_status: String,
    copy_bytes: u64,
    presented_frames: u64,
    last_frame_id: Option<u64>,
    native_present_ready: bool,
    native_present_mode: String,
    native_present_status: String,
    native_present_format: String,
    native_present_width: u32,
    native_present_height: u32,
    native_present_frames: u64,
    native_present_last_frame_id: Option<u64>,
    native_present_reason: String,
}

#[cfg(windows)]
impl Drop for W8MfH264DecoderWorkerRuntime {
    fn drop(&mut self) {
        unsafe {
            let _ = MFShutdown();
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct W8NativeVideoDecoderProbe {
    pub mode: String,
    pub d3d11_available: bool,
    pub d3d_feature_level: Option<String>,
    pub media_foundation_available: bool,
    pub h264_decoder_available: bool,
    pub h264_decoder_count: u32,
    pub h264_hardware_decoder_available: bool,
    pub h264_hardware_decoder_count: u32,
    pub ready: bool,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct W8NativeVideoWindowSwapchainProbe {
    pub mode: String,
    pub attempted: bool,
    pub ready: bool,
    pub hwnd_available: bool,
    pub window_client_width: u32,
    pub window_client_height: u32,
    pub format: String,
    pub buffer_count: u32,
    pub swap_effect: String,
    pub status: String,
    pub reason: String,
}

impl W8NativeVideoDecoderProbe {
    fn summarize(
        d3d_feature_level: Result<String, String>,
        h264_decoder_counts: Result<(u32, u32), String>,
    ) -> Self {
        let d3d_feature_level_text = d3d_feature_level.ok();
        let d3d11_available = d3d_feature_level_text.is_some();
        let (media_foundation_available, h264_decoder_count, h264_hardware_decoder_count, mf_error) =
            match h264_decoder_counts {
                Ok((decoder_count, hardware_decoder_count)) => {
                    (true, decoder_count, hardware_decoder_count, None)
                }
                Err(error) => (false, 0, 0, Some(error)),
            };
        let h264_decoder_available = h264_decoder_count > 0;
        let h264_hardware_decoder_available = h264_hardware_decoder_count > 0;
        let ready = d3d11_available && media_foundation_available && h264_decoder_available;
        let reason = if ready {
            let hardware = if h264_hardware_decoder_available {
                format!("hardware={h264_hardware_decoder_count}")
            } else {
                "hardware=0".to_string()
            };
            format!(
                "ready; d3d11={}; h264Decoders={h264_decoder_count}; {hardware}",
                d3d_feature_level_text.as_deref().unwrap_or("unknown")
            )
        } else if !d3d11_available {
            "blocked: D3D11 hardware device is unavailable".to_string()
        } else if !media_foundation_available {
            format!(
                "blocked: Media Foundation probe failed: {}",
                mf_error.unwrap_or_else(|| "unknown".to_string())
            )
        } else {
            "blocked: no Media Foundation H.264 decoder MFT found".to_string()
        };

        Self {
            mode: "media-foundation-h264-d3d11-probe".to_string(),
            d3d11_available,
            d3d_feature_level: d3d_feature_level_text,
            media_foundation_available,
            h264_decoder_available,
            h264_decoder_count,
            h264_hardware_decoder_available,
            h264_hardware_decoder_count,
            ready,
            reason,
        }
    }

    #[cfg(not(windows))]
    fn unsupported() -> Self {
        Self {
            mode: "media-foundation-h264-d3d11-probe".to_string(),
            d3d11_available: false,
            d3d_feature_level: None,
            media_foundation_available: false,
            h264_decoder_available: false,
            h264_decoder_count: 0,
            h264_hardware_decoder_available: false,
            h264_hardware_decoder_count: 0,
            ready: false,
            reason: "blocked: Windows-only native decoder probe".to_string(),
        }
    }
}

impl W8NativeVideoWindowSwapchainProbe {
    fn blocked(hwnd_available: bool, width: u32, height: u32, reason: String) -> Self {
        Self {
            mode: "d3d11-hwnd-swapchain-preflight".to_string(),
            attempted: true,
            ready: false,
            hwnd_available,
            window_client_width: width,
            window_client_height: height,
            format: "BGRA8".to_string(),
            buffer_count: 2,
            swap_effect: "flip-discard".to_string(),
            status: "blocked".to_string(),
            reason,
        }
    }

    fn ready(width: u32, height: u32) -> Self {
        Self {
            mode: "d3d11-hwnd-swapchain-preflight".to_string(),
            attempted: true,
            ready: true,
            hwnd_available: true,
            window_client_width: width,
            window_client_height: height,
            format: "BGRA8".to_string(),
            buffer_count: 2,
            swap_effect: "flip-discard".to_string(),
            status: "ready".to_string(),
            reason: format!(
                "ready; HWND swapchain created with BGRA8 flip-discard {}x{}",
                width.max(1),
                height.max(1)
            ),
        }
    }

    #[cfg(not(windows))]
    fn unsupported() -> Self {
        Self {
            mode: "d3d11-hwnd-swapchain-preflight".to_string(),
            attempted: false,
            ready: false,
            hwnd_available: false,
            window_client_width: 0,
            window_client_height: 0,
            format: "BGRA8".to_string(),
            buffer_count: 2,
            swap_effect: "flip-discard".to_string(),
            status: "unsupported".to_string(),
            reason: "blocked: Windows-only HWND swapchain preflight".to_string(),
        }
    }
}

#[tauri::command]
pub fn get_w8_native_video_plan() -> W8NativeVideoPlan {
    let config = NativeVideoQueueConfig::default();
    W8NativeVideoPlan {
        stage: "w8-video-mvp".to_string(),
        renderer_mode: "native-video-queue-mvp".to_string(),
        decoder_probe_mode: "media-foundation-h264-d3d11-probe".to_string(),
        protocol_change_required: false,
        video_queue_target_ms: config.target_queue_ms,
        video_queue_hard_max_ms: config.hard_max_queue_ms,
        max_frames: config.max_frames,
        next_native_steps: vec![
            "attach BGRA8 native present target to a real HWND swapchain or native renderer"
                .to_string(),
            "add NV12 shader conversion path for native present".to_string(),
            "handle stream-change, surface resize, and D3D11 device-lost rebuilds".to_string(),
        ],
    }
}

#[tauri::command]
pub fn probe_w8_native_video_decoder() -> W8NativeVideoDecoderProbe {
    probe_w8_native_video_decoder_runtime()
}

#[tauri::command]
pub fn probe_w8_native_video_window_swapchain(
    window: tauri::Window,
) -> W8NativeVideoWindowSwapchainProbe {
    #[cfg(windows)]
    {
        probe_w8_native_video_window_swapchain_runtime(window)
    }
    #[cfg(not(windows))]
    {
        let _ = window;
        W8NativeVideoWindowSwapchainProbe::unsupported()
    }
}

pub fn probe_w8_native_video_decoder_runtime() -> W8NativeVideoDecoderProbe {
    #[cfg(windows)]
    {
        W8NativeVideoDecoderProbe::summarize(unsafe { probe_d3d11_feature_level() }, unsafe {
            probe_media_foundation_h264_decoders()
        })
    }
    #[cfg(not(windows))]
    {
        W8NativeVideoDecoderProbe::unsupported()
    }
}

#[cfg(windows)]
fn probe_w8_native_video_window_swapchain_runtime(
    window: tauri::Window,
) -> W8NativeVideoWindowSwapchainProbe {
    let hwnd = match window.hwnd() {
        Ok(hwnd) => hwnd,
        Err(error) => {
            return W8NativeVideoWindowSwapchainProbe::blocked(
                false,
                0,
                0,
                format!("blocked: desktop window HWND unavailable: {error}"),
            );
        }
    };

    if unsafe { !IsWindow(Some(hwnd)).as_bool() } {
        return W8NativeVideoWindowSwapchainProbe::blocked(
            false,
            0,
            0,
            "blocked: desktop window HWND is not valid".to_string(),
        );
    }

    let (width, height) = match unsafe { hwnd_client_size(hwnd) } {
        Ok(size) => size,
        Err(error) => {
            return W8NativeVideoWindowSwapchainProbe::blocked(true, 0, 0, error);
        }
    };

    match unsafe { probe_d3d11_hwnd_swapchain(hwnd, width, height) } {
        Ok(()) => W8NativeVideoWindowSwapchainProbe::ready(width, height),
        Err(error) => W8NativeVideoWindowSwapchainProbe::blocked(
            true,
            width,
            height,
            format!("blocked: {error}"),
        ),
    }
}

#[cfg(windows)]
fn resolve_native_window_present_target(
    window: &tauri::Window,
) -> Option<W8NativeWindowPresentTargetConfig> {
    let hwnd = window.hwnd().ok()?;
    if unsafe { !IsWindow(Some(hwnd)).as_bool() } {
        return None;
    }
    let (client_width, client_height) = unsafe { hwnd_client_size(hwnd).ok()? };
    Some(W8NativeWindowPresentTargetConfig {
        hwnd_value: hwnd.0 as isize,
        client_width,
        client_height,
    })
}

pub fn preflight_h264_decoder_init(
    summary: &NativeH264AnnexBSummary,
) -> W8NativeVideoDecoderInitPreflight {
    if !summary.has_decoder_config {
        return W8NativeVideoDecoderInitPreflight::missing_config();
    }

    #[cfg(windows)]
    {
        W8NativeVideoDecoderInitPreflight::from_runtime_result(
            summary.codec_string.clone(),
            unsafe { preflight_media_foundation_h264_decoder(&summary.decoder_config_bytes) },
        )
    }
    #[cfg(not(windows))]
    {
        W8NativeVideoDecoderInitPreflight::from_runtime_result(
            summary.codec_string.clone(),
            Err("Windows-only Media Foundation decoder init preflight".to_string()),
        )
    }
}

pub fn preflight_h264_decode_step(
    summary: &NativeH264AnnexBSummary,
) -> W8NativeVideoDecodeStepPreflight {
    if !summary.has_decoder_config || !summary.has_idr {
        return W8NativeVideoDecodeStepPreflight::missing_config_or_keyframe(summary);
    }

    #[cfg(windows)]
    {
        W8NativeVideoDecodeStepPreflight::from_runtime_result(summary, unsafe {
            preflight_media_foundation_h264_decode_step(
                &summary.decoder_config_bytes,
                &summary.access_unit_bytes,
            )
        })
    }
    #[cfg(not(windows))]
    {
        W8NativeVideoDecodeStepPreflight::from_runtime_result(
            summary,
            Err("Windows-only Media Foundation sample decode step preflight".to_string()),
        )
    }
}

#[cfg(windows)]
unsafe fn probe_d3d11_feature_level() -> Result<String, String> {
    create_d3d11_video_device().map(|(_, _, selected)| format_d3d_feature_level(selected))
}

#[cfg(windows)]
unsafe fn create_d3d11_video_device(
) -> Result<(ID3D11Device, ID3D11DeviceContext, D3D_FEATURE_LEVEL), String> {
    let feature_levels = [D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0];
    let mut device: Option<ID3D11Device> = None;
    let mut context: Option<ID3D11DeviceContext> = None;
    let mut selected = D3D_FEATURE_LEVEL_11_0;
    D3D11CreateDevice(
        None,
        D3D_DRIVER_TYPE_HARDWARE,
        HMODULE::default(),
        D3D11_CREATE_DEVICE_BGRA_SUPPORT,
        Some(&feature_levels),
        D3D11_SDK_VERSION,
        Some(&mut device),
        Some(&mut selected),
        Some(&mut context),
    )
    .map_err(|error| format!("D3D11CreateDevice failed: {error}"))?;
    let device = device.ok_or_else(|| "D3D11CreateDevice returned no device".to_string())?;
    let context =
        context.ok_or_else(|| "D3D11CreateDevice returned no immediate context".to_string())?;
    Ok((device, context, selected))
}

#[cfg(windows)]
fn d3d11_hwnd_swapchain_desc(width: u32, height: u32) -> DXGI_SWAP_CHAIN_DESC1 {
    DXGI_SWAP_CHAIN_DESC1 {
        Width: width.max(1),
        Height: height.max(1),
        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
        Stereo: false.into(),
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT,
        BufferCount: 2,
        Scaling: DXGI_SCALING_STRETCH,
        SwapEffect: DXGI_SWAP_EFFECT_FLIP_DISCARD,
        AlphaMode: DXGI_ALPHA_MODE_IGNORE,
        Flags: 0,
    }
}

#[cfg(windows)]
unsafe fn hwnd_client_size(hwnd: HWND) -> Result<(u32, u32), String> {
    let mut rect = RECT::default();
    GetClientRect(hwnd, &mut rect).map_err(|error| format!("GetClientRect failed: {error}"))?;
    let width = (rect.right - rect.left).max(1) as u32;
    let height = (rect.bottom - rect.top).max(1) as u32;
    Ok((width, height))
}

#[cfg(windows)]
unsafe fn probe_d3d11_hwnd_swapchain(hwnd: HWND, width: u32, height: u32) -> Result<(), String> {
    let (device, _, _) = create_d3d11_video_device()?;
    let _swapchain = create_d3d11_hwnd_swapchain_for_device(&device, hwnd, width, height)?;
    Ok(())
}

#[cfg(windows)]
unsafe fn create_d3d11_hwnd_swapchain_for_device(
    device: &ID3D11Device,
    hwnd: HWND,
    width: u32,
    height: u32,
) -> Result<IDXGISwapChain1, String> {
    let factory: IDXGIFactory2 =
        CreateDXGIFactory1().map_err(|error| format!("CreateDXGIFactory1 failed: {error}"))?;
    let desc = d3d11_hwnd_swapchain_desc(width, height);
    factory
        .CreateSwapChainForHwnd(device, hwnd, &desc, None, None::<&IDXGIOutput>)
        .map_err(|error| format!("CreateSwapChainForHwnd failed: {error}"))
}

#[cfg(windows)]
fn format_d3d_feature_level(level: D3D_FEATURE_LEVEL) -> String {
    if level == D3D_FEATURE_LEVEL_11_1 {
        "11_1".to_string()
    } else if level == D3D_FEATURE_LEVEL_11_0 {
        "11_0".to_string()
    } else {
        format!("{:?}", level)
    }
}

#[cfg(all(windows, test))]
unsafe fn create_d3d11_latest_frame_texture_target(
    output_subtype: &str,
) -> Result<W8NativeSurfaceTargetRuntime, String> {
    create_d3d11_latest_frame_texture_target_for_window(output_subtype, None)
}

#[cfg(windows)]
unsafe fn create_d3d11_latest_frame_texture_target_for_window(
    output_subtype: &str,
    window_present_target: Option<W8NativeWindowPresentTargetConfig>,
) -> Result<W8NativeSurfaceTargetRuntime, String> {
    let (device, context, selected) = create_d3d11_video_device()?;
    let (dxgi_format, surface_format) = dxgi_format_for_surface_output(output_subtype);
    let latest_frame_bind_flags = if surface_format.eq_ignore_ascii_case("NV12") {
        (D3D11_BIND_DECODER | D3D11_BIND_SHADER_RESOURCE).0 as u32
    } else {
        (D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE).0 as u32
    };
    let desc = D3D11_TEXTURE2D_DESC {
        Width: DEFAULT_NATIVE_SURFACE_WIDTH,
        Height: DEFAULT_NATIVE_SURFACE_HEIGHT,
        MipLevels: 1,
        ArraySize: 1,
        Format: dxgi_format,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_DEFAULT,
        BindFlags: latest_frame_bind_flags,
        CPUAccessFlags: 0,
        MiscFlags: 0,
    };
    let mut texture = None;
    device
        .CreateTexture2D(&desc, None, Some(&mut texture))
        .map_err(|error| format!("CreateTexture2D latest-frame target failed: {error}"))?;
    let texture =
        texture.ok_or_else(|| "CreateTexture2D returned no latest-frame texture".to_string())?;
    let present_desc = D3D11_TEXTURE2D_DESC {
        Width: DEFAULT_NATIVE_SURFACE_WIDTH,
        Height: DEFAULT_NATIVE_SURFACE_HEIGHT,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_DEFAULT,
        BindFlags: (D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE).0 as u32,
        CPUAccessFlags: 0,
        MiscFlags: 0,
    };
    let mut present_texture = None;
    device
        .CreateTexture2D(&present_desc, None, Some(&mut present_texture))
        .map_err(|error| format!("CreateTexture2D BGRA8 present target failed: {error}"))?;
    let present_texture = present_texture
        .ok_or_else(|| "CreateTexture2D returned no BGRA8 present texture".to_string())?;
    let swapchain = match window_present_target {
        Some(target) => {
            let hwnd = target.hwnd();
            if !IsWindow(Some(hwnd)).as_bool() {
                return Err("desktop window HWND is not valid for native present".to_string());
            }
            Some(create_d3d11_hwnd_swapchain_for_device(
                &device,
                hwnd,
                DEFAULT_NATIVE_SURFACE_WIDTH,
                DEFAULT_NATIVE_SURFACE_HEIGHT,
            )?)
        }
        None => None,
    };
    let swapchain_attached = swapchain.is_some();
    let native_present_mode = if swapchain_attached {
        "d3d11-hwnd-swapchain"
    } else {
        "d3d11-bgra8-present-texture-target"
    };
    let native_present_reason = match (swapchain_attached, window_present_target) {
        (true, Some(target)) => format!(
            "ready; D3D11 {} HWND swapchain attached; client={}x{}; backbuffer={}x{} BGRA8",
            format_d3d_feature_level(selected),
            target.client_width.max(1),
            target.client_height.max(1),
            DEFAULT_NATIVE_SURFACE_WIDTH,
            DEFAULT_NATIVE_SURFACE_HEIGHT
        ),
        _ => format!(
            "ready; D3D11 {} BGRA8 present texture target created; waiting for renderer/swapchain",
            format_d3d_feature_level(selected)
        ),
    };

    Ok(W8NativeSurfaceTargetRuntime {
        _device: device,
        _context: context,
        _texture: texture,
        _present_texture: present_texture,
        _swapchain: swapchain,
        summary: W8NativeSurfaceTargetSummary {
            ready: true,
            mode: "d3d11-latest-frame-texture-target".to_string(),
            status: "ready".to_string(),
            format: surface_format,
            width: DEFAULT_NATIVE_SURFACE_WIDTH,
            height: DEFAULT_NATIVE_SURFACE_HEIGHT,
            reason: format!(
                "ready; D3D11 {} latest-frame texture target created",
                format_d3d_feature_level(selected)
            ),
            copy_status: "waiting-decoded-frame".to_string(),
            copy_bytes: 0,
            presented_frames: 0,
            last_frame_id: None,
            native_present_ready: true,
            native_present_mode: native_present_mode.to_string(),
            native_present_status: "waiting-latest-frame".to_string(),
            native_present_format: "BGRA8".to_string(),
            native_present_width: DEFAULT_NATIVE_SURFACE_WIDTH,
            native_present_height: DEFAULT_NATIVE_SURFACE_HEIGHT,
            native_present_frames: 0,
            native_present_last_frame_id: None,
            native_present_reason,
        },
    })
}

#[cfg(windows)]
fn dxgi_format_for_surface_output(output_subtype: &str) -> (DXGI_FORMAT, String) {
    if output_subtype.eq_ignore_ascii_case("NV12") {
        (DXGI_FORMAT_NV12, "NV12".to_string())
    } else {
        (DXGI_FORMAT_B8G8R8A8_UNORM, "BGRA8".to_string())
    }
}

#[cfg(windows)]
unsafe fn copy_decoded_sample_to_native_surface(
    target: &mut W8NativeSurfaceTargetRuntime,
    sample: &IMFSample,
    frame_id: u64,
) -> Result<W8NativeSurfaceCopyResult, String> {
    let sample_bytes = contiguous_sample_bytes(sample)?;
    let (row_pitch, expected_bytes) = native_surface_copy_layout(
        &target.summary.format,
        target.summary.width,
        target.summary.height,
    )?;
    if sample_bytes.len() < expected_bytes as usize {
        target.summary.copy_status = "sample-too-small".to_string();
        target.summary.status = "sample-too-small".to_string();
        target.summary.reason = format!(
            "blocked: decoded sample {} bytes is smaller than {} bytes {} texture",
            sample_bytes.len(),
            expected_bytes,
            target.summary.format
        );
        return Err(target.summary.reason.clone());
    }

    let resource: ID3D11Resource = target
        ._texture
        .cast()
        .map_err(|error| format!("ID3D11Texture2D cast to resource failed: {error}"))?;
    target._context.UpdateSubresource(
        &resource,
        0,
        None,
        sample_bytes.as_ptr() as *const c_void,
        row_pitch,
        expected_bytes,
    );
    target._context.Flush();
    if let Err(error) = stage_latest_frame_for_native_present(target, frame_id) {
        target.summary.native_present_status = "present-stage-blocked".to_string();
        target.summary.native_present_reason = format!("blocked: {error}");
    }

    let presented_frames = target.summary.presented_frames.saturating_add(1);
    target.summary.status = "latest-frame-presented".to_string();
    target.summary.copy_status = "latest-frame-presented".to_string();
    target.summary.copy_bytes = u64::from(expected_bytes);
    target.summary.presented_frames = presented_frames;
    target.summary.last_frame_id = Some(frame_id);
    target.summary.reason = format!(
        "ready; copied {} bytes into D3D11 {} latest-frame texture",
        expected_bytes, target.summary.format
    );

    Ok(W8NativeSurfaceCopyResult {
        status: target.summary.copy_status.clone(),
        bytes_copied: target.summary.copy_bytes,
        presented_frames,
        last_frame_id: target.summary.last_frame_id,
        native_present_status: target.summary.native_present_status.clone(),
        native_present_frames: target.summary.native_present_frames,
        native_present_last_frame_id: target.summary.native_present_last_frame_id,
        native_present_reason: target.summary.native_present_reason.clone(),
        reason: target.summary.reason.clone(),
    })
}

#[cfg(windows)]
unsafe fn stage_latest_frame_for_native_present(
    target: &mut W8NativeSurfaceTargetRuntime,
    frame_id: u64,
) -> Result<(), String> {
    if !target.summary.format.eq_ignore_ascii_case("BGRA8") {
        target.summary.native_present_status = "waiting-nv12-renderer".to_string();
        target.summary.native_present_reason = format!(
            "ready; latest {} frame is staged; waiting for NV12 shader/native renderer",
            target.summary.format
        );
        return Ok(());
    }

    let latest_resource: ID3D11Resource = target
        ._texture
        .cast()
        .map_err(|error| format!("latest-frame texture cast to resource failed: {error}"))?;
    let present_resource: ID3D11Resource = target
        ._present_texture
        .cast()
        .map_err(|error| format!("present texture cast to resource failed: {error}"))?;
    target
        ._context
        .CopyResource(&present_resource, &latest_resource);
    target._context.Flush();

    if target._swapchain.is_some() {
        present_bgra_texture_to_hwnd_swapchain(target, frame_id, &present_resource)?;
        return Ok(());
    }

    let present_frames = target.summary.native_present_frames.saturating_add(1);
    target.summary.native_present_status = "latest-frame-present-staged".to_string();
    target.summary.native_present_frames = present_frames;
    target.summary.native_present_last_frame_id = Some(frame_id);
    target.summary.native_present_reason = format!(
        "ready; copied BGRA8 latest-frame texture into BGRA8 present texture target; frames={present_frames}"
    );
    Ok(())
}

#[cfg(windows)]
unsafe fn present_bgra_texture_to_hwnd_swapchain(
    target: &mut W8NativeSurfaceTargetRuntime,
    frame_id: u64,
    present_resource: &ID3D11Resource,
) -> Result<(), String> {
    let swapchain = target
        ._swapchain
        .as_ref()
        .ok_or_else(|| "HWND swapchain is not attached".to_string())?;
    let back_buffer: ID3D11Texture2D = swapchain
        .GetBuffer(0)
        .map_err(|error| format!("IDXGISwapChain1::GetBuffer failed: {error}"))?;
    let back_resource: ID3D11Resource = back_buffer
        .cast()
        .map_err(|error| format!("swapchain back buffer cast to resource failed: {error}"))?;
    target
        ._context
        .CopyResource(&back_resource, present_resource);
    target._context.Flush();
    swapchain
        .Present(0, DXGI_PRESENT(0))
        .ok()
        .map_err(|error| format!("IDXGISwapChain1::Present failed: {error}"))?;

    let present_frames = target.summary.native_present_frames.saturating_add(1);
    target.summary.native_present_status = "latest-frame-swapchain-presented".to_string();
    target.summary.native_present_frames = present_frames;
    target.summary.native_present_last_frame_id = Some(frame_id);
    target.summary.native_present_reason = format!(
        "ready; Present copied BGRA8 present texture into HWND swapchain; frames={present_frames}"
    );
    Ok(())
}

#[cfg(windows)]
fn native_surface_copy_layout(format: &str, width: u32, height: u32) -> Result<(u32, u32), String> {
    let width = width.max(1);
    let height = height.max(1);
    if format.eq_ignore_ascii_case("NV12") {
        let rows = height
            .checked_add((height + 1) / 2)
            .ok_or_else(|| "NV12 row count overflow".to_string())?;
        let expected = width
            .checked_mul(rows)
            .ok_or_else(|| "NV12 sample size overflow".to_string())?;
        Ok((width, expected))
    } else if format.eq_ignore_ascii_case("BGRA8") {
        let row_pitch = width
            .checked_mul(4)
            .ok_or_else(|| "BGRA8 row pitch overflow".to_string())?;
        let expected = row_pitch
            .checked_mul(height)
            .ok_or_else(|| "BGRA8 sample size overflow".to_string())?;
        Ok((row_pitch, expected))
    } else {
        Err(format!("unsupported native surface copy format {format}"))
    }
}

#[cfg(windows)]
unsafe fn contiguous_sample_bytes(sample: &IMFSample) -> Result<Vec<u8>, String> {
    let buffer = sample
        .ConvertToContiguousBuffer()
        .map_err(|error| format!("ConvertToContiguousBuffer failed: {error}"))?;
    let mut source = ptr::null_mut();
    let mut max_length = 0_u32;
    let mut current_length = 0_u32;
    buffer
        .Lock(
            &mut source,
            Some(&mut max_length),
            Some(&mut current_length),
        )
        .map_err(|error| format!("decoded IMFMediaBuffer::Lock failed: {error}"))?;
    let result = if source.is_null() {
        Err("decoded IMFMediaBuffer::Lock returned null data".to_string())
    } else {
        Ok(slice::from_raw_parts(source as *const u8, current_length as usize).to_vec())
    };
    let unlock = buffer.Unlock();
    match (result, unlock) {
        (Ok(bytes), Ok(())) => Ok(bytes),
        (Err(error), _) => Err(error),
        (Ok(_), Err(error)) => Err(format!("decoded IMFMediaBuffer::Unlock failed: {error}")),
    }
}

#[cfg(windows)]
unsafe fn preflight_media_foundation_h264_decoder(
    sequence_header: &[u8],
) -> Result<(bool, Vec<String>), String> {
    MFStartup(MF_VERSION, MFSTARTUP_LITE).map_err(|error| format!("MFStartup failed: {error}"))?;
    let result = preflight_media_foundation_h264_decoder_inner(sequence_header);
    let shutdown = MFShutdown();
    match (result, shutdown) {
        (Ok(value), Ok(())) => Ok(value),
        (Err(error), _) => Err(error),
        (Ok(_), Err(error)) => Err(format!("MFShutdown failed: {error}")),
    }
}

#[cfg(windows)]
unsafe fn preflight_media_foundation_h264_decoder_inner(
    sequence_header: &[u8],
) -> Result<(bool, Vec<String>), String> {
    let transform = activate_first_h264_decoder_mft()?;
    let input_type = create_h264_decoder_input_type(sequence_header)?;
    transform
        .SetInputType(0, &input_type, 0)
        .map_err(|error| format!("SetInputType H.264 failed: {error}"))?;
    let output_subtypes = collect_decoder_output_subtypes(&transform);
    drop(input_type);
    drop(transform);
    Ok((true, output_subtypes))
}

#[cfg(windows)]
unsafe fn preflight_media_foundation_h264_decode_step(
    sequence_header: &[u8],
    access_unit: &[u8],
) -> Result<W8NativeVideoDecodeStepRuntime, String> {
    MFStartup(MF_VERSION, MFSTARTUP_LITE).map_err(|error| format!("MFStartup failed: {error}"))?;
    let result = preflight_media_foundation_h264_decode_step_inner(sequence_header, access_unit);
    let shutdown = MFShutdown();
    match (result, shutdown) {
        (Ok(value), Ok(())) => Ok(value),
        (Err(error), _) => Err(error),
        (Ok(_), Err(error)) => Err(format!("MFShutdown failed: {error}")),
    }
}

#[cfg(windows)]
unsafe fn preflight_media_foundation_h264_decode_step_inner(
    sequence_header: &[u8],
    access_unit: &[u8],
) -> Result<W8NativeVideoDecodeStepRuntime, String> {
    let transform = activate_first_h264_decoder_mft()?;
    let input_type = create_h264_decoder_input_type(sequence_header)?;
    transform
        .SetInputType(0, &input_type, 0)
        .map_err(|error| format!("SetInputType H.264 failed: {error}"))?;
    let (output_type, output_subtype) = first_decoder_output_type(&transform)?;
    transform
        .SetOutputType(0, &output_type, 0)
        .map_err(|error| format!("SetOutputType {output_subtype} failed: {error}"))?;

    let input_sample = match create_mf_sample_from_bytes(access_unit, 0, 16_667) {
        Ok(sample) => sample,
        Err(error) => {
            return Ok(W8NativeVideoDecodeStepRuntime {
                sample_created: false,
                input_accepted: false,
                output_attempted: false,
                output_produced: false,
                output_status: "sample-create-blocked".to_string(),
                reason: format!("blocked: {error}"),
            });
        }
    };

    if let Err(error) = transform.ProcessInput(0, &input_sample, 0) {
        return Ok(W8NativeVideoDecodeStepRuntime {
            sample_created: true,
            input_accepted: false,
            output_attempted: false,
            output_produced: false,
            output_status: "process-input-blocked".to_string(),
            reason: format!("blocked: ProcessInput failed: {error}"),
        });
    }

    let output_sample = match create_decoder_output_sample(&transform) {
        Ok(sample) => sample,
        Err(error) => {
            return Ok(W8NativeVideoDecodeStepRuntime {
                sample_created: true,
                input_accepted: true,
                output_attempted: false,
                output_produced: false,
                output_status: "output-sample-blocked".to_string(),
                reason: format!("blocked: {error}"),
            });
        }
    };

    let mut output_buffer = MFT_OUTPUT_DATA_BUFFER {
        dwStreamID: 0,
        pSample: ManuallyDrop::new(output_sample),
        dwStatus: 0,
        pEvents: ManuallyDrop::new(None),
    };
    let mut process_status = 0_u32;
    let output_result = transform.ProcessOutput(
        0,
        std::slice::from_mut(&mut output_buffer),
        &mut process_status,
    );
    let output_produced = output_result.is_ok() && output_buffer.pSample.is_some();
    let output_status = match output_result {
        Ok(()) if output_produced => "decoded-output".to_string(),
        Ok(()) => "no-output".to_string(),
        Err(error) if error.code() == MF_E_TRANSFORM_NEED_MORE_INPUT => {
            "need-more-input".to_string()
        }
        Err(error) if error.code() == MF_E_TRANSFORM_STREAM_CHANGE => "stream-change".to_string(),
        Err(error) => format!("process-output-blocked:{:?}", error.code()),
    };
    let reason = match output_status.as_str() {
        "decoded-output" => {
            format!("ready; ProcessInput accepted; ProcessOutput produced {output_subtype}")
        }
        "need-more-input" => {
            "ready; ProcessInput accepted; ProcessOutput needs more input".to_string()
        }
        "stream-change" => {
            "ready; ProcessInput accepted; ProcessOutput requested stream change".to_string()
        }
        "no-output" => "ready; ProcessInput accepted; ProcessOutput returned no sample".to_string(),
        _ => format!("blocked: ProcessOutput failed with {output_status}"),
    };

    let output_sample = ManuallyDrop::into_inner(output_buffer.pSample);
    let output_events = ManuallyDrop::into_inner(output_buffer.pEvents);
    drop(output_sample);
    drop(output_events);

    Ok(W8NativeVideoDecodeStepRuntime {
        sample_created: true,
        input_accepted: true,
        output_attempted: true,
        output_produced,
        output_status,
        reason,
    })
}

#[cfg(windows)]
impl W8MfH264DecoderWorkerRuntime {
    unsafe fn start(
        sequence_header: &[u8],
        window_present_target: Option<W8NativeWindowPresentTargetConfig>,
    ) -> Result<Self, String> {
        MFStartup(MF_VERSION, MFSTARTUP_LITE)
            .map_err(|error| format!("MFStartup failed: {error}"))?;
        let started = (|| {
            let transform = activate_first_h264_decoder_mft()?;
            let input_type = create_h264_decoder_input_type(sequence_header)?;
            transform
                .SetInputType(0, &input_type, 0)
                .map_err(|error| format!("SetInputType H.264 failed: {error}"))?;
            let (output_type, output_subtype) = first_decoder_output_type(&transform)?;
            transform
                .SetOutputType(0, &output_type, 0)
                .map_err(|error| format!("SetOutputType {output_subtype} failed: {error}"))?;
            let surface_target = create_d3d11_latest_frame_texture_target_for_window(
                &output_subtype,
                window_present_target,
            )?;
            Ok(Self {
                transform,
                output_subtype,
                surface_target,
            })
        })();
        if started.is_err() {
            let _ = MFShutdown();
        }
        started
    }

    unsafe fn process(
        &mut self,
        access_unit: &[u8],
        frame_id: u64,
    ) -> W8NativeVideoDecoderSessionProcess {
        let input_sample = match create_mf_sample_from_bytes(access_unit, 0, 16_667) {
            Ok(sample) => sample,
            Err(error) => {
                return W8NativeVideoDecoderSessionProcess {
                    input_accepted: false,
                    output_produced: false,
                    output_byte_len: 0,
                    status: "sample-create-blocked".to_string(),
                    reason: format!("blocked: {error}"),
                    surface_copy: None,
                };
            }
        };

        if let Err(error) = self.transform.ProcessInput(0, &input_sample, 0) {
            return W8NativeVideoDecoderSessionProcess {
                input_accepted: false,
                output_produced: false,
                output_byte_len: 0,
                status: "process-input-blocked".to_string(),
                reason: format!("blocked: native worker ProcessInput failed: {error}"),
                surface_copy: None,
            };
        }

        let output_sample = match create_decoder_output_sample(&self.transform) {
            Ok(sample) => sample,
            Err(error) => {
                return W8NativeVideoDecoderSessionProcess {
                    input_accepted: true,
                    output_produced: false,
                    output_byte_len: 0,
                    status: "output-sample-blocked".to_string(),
                    reason: format!("blocked: {error}"),
                    surface_copy: None,
                };
            }
        };

        let mut output_buffer = MFT_OUTPUT_DATA_BUFFER {
            dwStreamID: 0,
            pSample: ManuallyDrop::new(output_sample),
            dwStatus: 0,
            pEvents: ManuallyDrop::new(None),
        };
        let mut process_status = 0_u32;
        let output_result = self.transform.ProcessOutput(
            0,
            std::slice::from_mut(&mut output_buffer),
            &mut process_status,
        );
        let output_produced = output_result.is_ok() && output_buffer.pSample.is_some();
        let output_byte_len = if output_produced {
            output_buffer
                .pSample
                .as_ref()
                .and_then(|sample| sample.GetTotalLength().ok())
                .map(u64::from)
                .unwrap_or(0)
        } else {
            0
        };
        let mut surface_copy = None;
        let mut status = match output_result {
            Ok(()) if output_produced => "decoded-output".to_string(),
            Ok(()) => "no-output".to_string(),
            Err(error) if error.code() == MF_E_TRANSFORM_NEED_MORE_INPUT => {
                "need-more-input".to_string()
            }
            Err(error) if error.code() == MF_E_TRANSFORM_STREAM_CHANGE => {
                "stream-change".to_string()
            }
            Err(error) => format!("process-output-blocked:{:?}", error.code()),
        };
        let mut reason = match status.as_str() {
            "decoded-output" => format!(
                "ready; native worker produced {} frame",
                self.output_subtype
            ),
            "need-more-input" => {
                "ready; native worker accepted input and needs more data".to_string()
            }
            "stream-change" => {
                "ready; native worker accepted input and requested stream change".to_string()
            }
            "no-output" => "ready; native worker returned no sample".to_string(),
            _ => format!("blocked: native worker ProcessOutput failed with {status}"),
        };

        if output_produced {
            if let Some(sample) = output_buffer.pSample.as_ref() {
                match copy_decoded_sample_to_native_surface(
                    &mut self.surface_target,
                    sample,
                    frame_id,
                ) {
                    Ok(copy) => {
                        status = copy.status.clone();
                        reason = copy.reason.clone();
                        surface_copy = Some(copy);
                    }
                    Err(error) => {
                        status = "surface-copy-blocked".to_string();
                        reason = format!("blocked: {error}");
                    }
                }
            }
        }

        let output_sample = ManuallyDrop::into_inner(output_buffer.pSample);
        let output_events = ManuallyDrop::into_inner(output_buffer.pEvents);
        drop(output_sample);
        drop(output_events);

        W8NativeVideoDecoderSessionProcess {
            input_accepted: true,
            output_produced,
            output_byte_len,
            status,
            reason,
            surface_copy,
        }
    }
}

#[cfg(windows)]
unsafe fn probe_media_foundation_h264_decoders() -> Result<(u32, u32), String> {
    MFStartup(MF_VERSION, MFSTARTUP_LITE).map_err(|error| format!("MFStartup failed: {error}"))?;

    let all_flags = MFT_ENUM_FLAG_SYNCMFT
        | MFT_ENUM_FLAG_LOCALMFT
        | MFT_ENUM_FLAG_HARDWARE
        | MFT_ENUM_FLAG_SORTANDFILTER;
    let decoder_count = count_h264_decoder_mfts(all_flags);
    let hardware_count =
        count_h264_decoder_mfts(MFT_ENUM_FLAG_HARDWARE | MFT_ENUM_FLAG_SORTANDFILTER);
    let shutdown = MFShutdown();

    let decoder_count = decoder_count?;
    let hardware_count = hardware_count?;
    shutdown.map_err(|error| format!("MFShutdown failed: {error}"))?;
    Ok((decoder_count, hardware_count))
}

#[cfg(windows)]
unsafe fn activate_first_h264_decoder_mft() -> Result<IMFTransform, String> {
    let input_type = MFT_REGISTER_TYPE_INFO {
        guidMajorType: MFMediaType_Video,
        guidSubtype: MFVideoFormat_H264,
    };
    let flags = MFT_ENUM_FLAG_SYNCMFT
        | MFT_ENUM_FLAG_LOCALMFT
        | MFT_ENUM_FLAG_HARDWARE
        | MFT_ENUM_FLAG_SORTANDFILTER;
    let mut activates = ptr::null_mut();
    let mut count = 0_u32;
    MFTEnumEx(
        MFT_CATEGORY_VIDEO_DECODER,
        flags,
        Some(&input_type),
        None,
        &mut activates,
        &mut count,
    )
    .map_err(|error| format!("MFTEnumEx H.264 decoder failed: {error}"))?;

    if activates.is_null() || count == 0 {
        release_mft_activates(activates, count);
        return Err("no Media Foundation H.264 decoder MFT found".to_string());
    }

    let slice = std::slice::from_raw_parts_mut(activates, count as usize);
    let mut activated_transform = None;
    let mut last_error = None;
    for activate in slice.iter().filter_map(|candidate| candidate.as_ref()) {
        match activate.ActivateObject::<IMFTransform>() {
            Ok(transform) => {
                activated_transform = Some(transform);
                break;
            }
            Err(error) => last_error = Some(format!("{error}")),
        }
    }
    release_mft_activates(activates, count);

    activated_transform.ok_or_else(|| {
        format!(
            "no H.264 decoder MFT could be activated{}",
            last_error
                .map(|error| format!(": {error}"))
                .unwrap_or_default()
        )
    })
}

#[cfg(windows)]
unsafe fn create_h264_decoder_input_type(
    sequence_header: &[u8],
) -> Result<windows::Win32::Media::MediaFoundation::IMFMediaType, String> {
    let media_type =
        MFCreateMediaType().map_err(|error| format!("MFCreateMediaType failed: {error}"))?;
    media_type
        .SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)
        .map_err(|error| format!("SetGUID major video failed: {error}"))?;
    media_type
        .SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_H264)
        .map_err(|error| format!("SetGUID H.264 subtype failed: {error}"))?;
    media_type
        .SetUINT64(&MF_MT_FRAME_SIZE, pack_mf_ratio(1920, 1080))
        .map_err(|error| format!("Set frame size failed: {error}"))?;
    media_type
        .SetUINT64(&MF_MT_FRAME_RATE, pack_mf_ratio(60, 1))
        .map_err(|error| format!("Set frame rate failed: {error}"))?;
    media_type
        .SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, pack_mf_ratio(1, 1))
        .map_err(|error| format!("Set pixel aspect ratio failed: {error}"))?;
    media_type
        .SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)
        .map_err(|error| format!("Set interlace mode failed: {error}"))?;
    media_type
        .SetUINT32(&MF_MT_ALL_SAMPLES_INDEPENDENT, 0)
        .map_err(|error| format!("Set sample independence failed: {error}"))?;
    media_type
        .SetUINT32(&MF_MT_AVG_BITRATE, 20_000_000)
        .map_err(|error| format!("Set bitrate failed: {error}"))?;
    if !sequence_header.is_empty() {
        media_type
            .SetBlob(&MF_MT_MPEG_SEQUENCE_HEADER, sequence_header)
            .map_err(|error| format!("Set sequence header failed: {error}"))?;
    }
    Ok(media_type)
}

#[cfg(windows)]
fn pack_mf_ratio(numerator: u32, denominator: u32) -> u64 {
    ((numerator as u64) << 32) | denominator as u64
}

#[cfg(windows)]
unsafe fn collect_decoder_output_subtypes(transform: &IMFTransform) -> Vec<String> {
    let mut output_subtypes = Vec::new();
    for index in 0..32 {
        let Ok(media_type) = transform.GetOutputAvailableType(0, index) else {
            break;
        };
        if let Ok(subtype) = media_type.GetGUID(&MF_MT_SUBTYPE) {
            let label = video_subtype_label(subtype);
            if !output_subtypes.contains(&label) {
                output_subtypes.push(label);
            }
        }
    }
    output_subtypes
}

#[cfg(windows)]
unsafe fn first_decoder_output_type(
    transform: &IMFTransform,
) -> Result<(IMFMediaType, String), String> {
    let media_type = transform
        .GetOutputAvailableType(0, 0)
        .map_err(|error| format!("GetOutputAvailableType failed: {error}"))?;
    let subtype = media_type
        .GetGUID(&MF_MT_SUBTYPE)
        .map(video_subtype_label)
        .unwrap_or_else(|_| "unknown".to_string());
    Ok((media_type, subtype))
}

#[cfg(windows)]
unsafe fn create_mf_sample_from_bytes(
    bytes: &[u8],
    sample_time: i64,
    sample_duration: i64,
) -> Result<IMFSample, String> {
    let length = u32::try_from(bytes.len()).map_err(|_| "sample too large".to_string())?;
    let buffer = MFCreateMemoryBuffer(length)
        .map_err(|error| format!("MFCreateMemoryBuffer failed: {error}"))?;
    let mut destination = ptr::null_mut();
    let mut max_length = 0_u32;
    let mut current_length = 0_u32;
    buffer
        .Lock(
            &mut destination,
            Some(&mut max_length),
            Some(&mut current_length),
        )
        .map_err(|error| format!("IMFMediaBuffer::Lock failed: {error}"))?;
    if destination.is_null() || max_length < length {
        let _ = buffer.Unlock();
        return Err("IMFMediaBuffer::Lock returned insufficient memory".to_string());
    }
    ptr::copy_nonoverlapping(bytes.as_ptr(), destination, bytes.len());
    buffer
        .Unlock()
        .map_err(|error| format!("IMFMediaBuffer::Unlock failed: {error}"))?;
    buffer
        .SetCurrentLength(length)
        .map_err(|error| format!("SetCurrentLength failed: {error}"))?;

    let sample = MFCreateSample().map_err(|error| format!("MFCreateSample failed: {error}"))?;
    sample
        .AddBuffer(&buffer)
        .map_err(|error| format!("IMFSample::AddBuffer failed: {error}"))?;
    sample
        .SetSampleTime(sample_time)
        .map_err(|error| format!("SetSampleTime failed: {error}"))?;
    sample
        .SetSampleDuration(sample_duration)
        .map_err(|error| format!("SetSampleDuration failed: {error}"))?;
    Ok(sample)
}

#[cfg(windows)]
unsafe fn create_decoder_output_sample(
    transform: &IMFTransform,
) -> Result<Option<IMFSample>, String> {
    let stream_info = transform
        .GetOutputStreamInfo(0)
        .map_err(|error| format!("GetOutputStreamInfo failed: {error}"))?;
    if stream_info.dwFlags & MFT_OUTPUT_STREAM_PROVIDES_SAMPLES.0 as u32 != 0 {
        return Ok(None);
    }

    let buffer_size = stream_info.cbSize.max(1920 * 1080 * 4);
    let buffer = MFCreateMemoryBuffer(buffer_size)
        .map_err(|error| format!("MFCreateMemoryBuffer output failed: {error}"))?;
    buffer
        .SetCurrentLength(0)
        .map_err(|error| format!("Set output buffer length failed: {error}"))?;
    let sample =
        MFCreateSample().map_err(|error| format!("MFCreateSample output failed: {error}"))?;
    sample
        .AddBuffer(&buffer)
        .map_err(|error| format!("Output sample AddBuffer failed: {error}"))?;
    Ok(Some(sample))
}

#[cfg(windows)]
fn video_subtype_label(subtype: GUID) -> String {
    if subtype == MFVideoFormat_NV12 {
        "NV12".to_string()
    } else if subtype == MFVideoFormat_ARGB32 {
        "ARGB32".to_string()
    } else if subtype == MFVideoFormat_RGB32 {
        "RGB32".to_string()
    } else if subtype == MFVideoFormat_YUY2 {
        "YUY2".to_string()
    } else if subtype == MFVideoFormat_IYUV {
        "IYUV".to_string()
    } else {
        format!("{subtype:?}")
    }
}

#[cfg(windows)]
unsafe fn count_h264_decoder_mfts(flags: MFT_ENUM_FLAG) -> Result<u32, String> {
    let input_type = MFT_REGISTER_TYPE_INFO {
        guidMajorType: MFMediaType_Video,
        guidSubtype: MFVideoFormat_H264,
    };
    let mut activates = ptr::null_mut();
    let mut count = 0_u32;
    MFTEnumEx(
        MFT_CATEGORY_VIDEO_DECODER,
        flags,
        Some(&input_type),
        None,
        &mut activates,
        &mut count,
    )
    .map_err(|error| format!("MFTEnumEx H.264 decoder failed: {error}"))?;

    release_mft_activates(activates, count);
    Ok(count)
}

#[cfg(windows)]
unsafe fn release_mft_activates(
    activates: *mut Option<windows::Win32::Media::MediaFoundation::IMFActivate>,
    count: u32,
) {
    if activates.is_null() {
        return;
    }
    let slice = std::slice::from_raw_parts_mut(activates, count as usize);
    for activate in slice {
        *activate = None;
    }
    CoTaskMemFree(Some(activates as *const c_void));
}

#[tauri::command]
pub fn start_w8_native_video_session(
    window: tauri::Window,
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
    session.decoder_init = None;
    session.decode_step = None;
    session.decoder_session.reset();
    #[cfg(windows)]
    {
        session.window_present_target = resolve_native_window_present_target(&window);
    }
    #[cfg(not(windows))]
    {
        let _ = window;
    }
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
    session.push_h264_annexb_frame(request.id, request.received_at_ms, data)
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
    session.decoder_session.reset();
    #[cfg(windows)]
    {
        session.window_present_target = None;
    }
    Ok(session.snapshot())
}

impl W8NativeVideoSession {
    fn push_h264_annexb_frame(
        &mut self,
        id: u64,
        received_at_ms: u64,
        data: Vec<u8>,
    ) -> Result<NativeH264AnnexBPushResult, String> {
        if !self.running {
            return Err("W8 视频会话尚未启动".to_string());
        }
        let mut result = self.queue.push_h264_annexb(NativeH264AnnexBFrame {
            id,
            received_at_ms,
            data,
        });
        if result.summary.has_decoder_config && self.decoder_init.is_none() {
            self.decoder_init = Some(preflight_h264_decoder_init(&result.summary));
        }
        if result.summary.has_decoder_config && result.summary.has_idr && self.decode_step.is_none()
        {
            self.decode_step = Some(preflight_h264_decode_step(&result.summary));
        }
        result.decoder_session = self.decoder_session.push_h264_access_unit(
            &result.summary,
            #[cfg(windows)]
            self.window_present_target,
        );
        result.decoder_init = self.decoder_init.clone();
        result.decode_step = self.decode_step.clone();
        Ok(result)
    }

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
        assert_eq!(
            summary.decoder_config_bytes,
            annexb_payload(&[&[0x67, 0x42, 0x00, 0x29], &[0x68, 0xce]])
        );
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
        assert!(summary.decoder_config_bytes.is_empty());
    }

    #[test]
    fn plan_advertises_native_present_renderer_next_steps() {
        let plan = get_w8_native_video_plan();

        assert_eq!(plan.decoder_probe_mode, "media-foundation-h264-d3d11-probe");
        assert!(plan
            .next_native_steps
            .iter()
            .any(|step| step.contains("real HWND swapchain")));
        assert!(plan
            .next_native_steps
            .iter()
            .any(|step| step.contains("NV12 shader conversion")));
        assert!(plan
            .next_native_steps
            .iter()
            .any(|step| step.contains("device-lost")));
    }

    #[test]
    fn native_decoder_probe_reports_runtime_capabilities() {
        let probe = probe_w8_native_video_decoder();

        assert_eq!(probe.mode, "media-foundation-h264-d3d11-probe");
        assert!(!probe.reason.trim().is_empty());
        assert_eq!(
            probe.ready,
            probe.d3d11_available
                && probe.media_foundation_available
                && probe.h264_decoder_available
        );
    }

    #[test]
    fn decoder_init_preflight_requires_parameter_sets() {
        let payload = annexb_payload(&[&[0x65, 0x88]]);
        let summary = inspect_h264_annexb(&payload);

        let init = preflight_h264_decoder_init(&summary);

        assert_eq!(init.mode, "media-foundation-h264-decoder-init-preflight");
        assert!(!init.attempted);
        assert!(!init.ready);
        assert_eq!(init.codec_string, None);
        assert!(init.reason.contains("SPS/PPS"));
    }

    #[test]
    fn decoder_init_preflight_reports_input_and_output_status() {
        let payload = annexb_payload(&[&[0x67, 0x42, 0x00, 0x29], &[0x68, 0xce], &[0x65, 0x88]]);
        let summary = inspect_h264_annexb(&payload);

        let init = preflight_h264_decoder_init(&summary);

        assert_eq!(init.mode, "media-foundation-h264-decoder-init-preflight");
        assert!(init.attempted);
        assert_eq!(init.codec_string.as_deref(), Some("avc1.420029"));
        assert_eq!(
            init.ready,
            init.input_type_set && init.output_type_available
        );
        assert!(!init.reason.trim().is_empty());
    }

    #[test]
    fn decode_step_preflight_requires_decoder_config_and_idr() {
        let payload = annexb_payload(&[&[0x61, 0x88]]);
        let summary = inspect_h264_annexb(&payload);

        let step = preflight_h264_decode_step(&summary);

        assert_eq!(
            step.mode,
            "media-foundation-h264-sample-decode-step-preflight"
        );
        assert!(!step.attempted);
        assert!(!step.ready);
        assert_eq!(step.codec_string, None);
        assert_eq!(step.frame_byte_len, payload.len() as u64);
        assert!(!step.sample_created);
        assert!(!step.input_accepted);
        assert!(!step.output_attempted);
        assert!(!step.output_produced);
        assert_eq!(step.output_status, "missing-config-or-keyframe");
        assert!(step.reason.contains("SPS/PPS"));
    }

    #[test]
    fn decode_step_preflight_reports_sample_input_and_output_status() {
        let payload = annexb_payload(&[&[0x67, 0x42, 0x00, 0x29], &[0x68, 0xce], &[0x65, 0x88]]);
        let summary = inspect_h264_annexb(&payload);

        let step = preflight_h264_decode_step(&summary);

        assert_eq!(
            step.mode,
            "media-foundation-h264-sample-decode-step-preflight"
        );
        assert!(step.attempted);
        assert_eq!(step.codec_string.as_deref(), Some("avc1.420029"));
        assert_eq!(step.frame_byte_len, payload.len() as u64);
        assert_eq!(
            step.ready,
            step.sample_created && step.input_accepted && step.output_attempted
        );
        if step.input_accepted {
            assert!(step.output_attempted);
        }
        assert!(!step.output_status.trim().is_empty());
        assert!(!step.reason.trim().is_empty());
    }

    #[test]
    fn persistent_decoder_session_tracks_input_across_h264_pushes() {
        let mut session = W8NativeVideoSession::default();
        session.running = true;
        let first_payload =
            annexb_payload(&[&[0x67, 0x42, 0x00, 0x29], &[0x68, 0xce], &[0x65, 0x88]]);
        let second_payload = annexb_payload(&[&[0x61, 0x99]]);

        let first = session
            .push_h264_annexb_frame(42, 1000, first_payload)
            .expect("first H.264 frame should enter native session");
        let second = session
            .push_h264_annexb_frame(43, 1016, second_payload)
            .expect("second H.264 frame should enter native session");

        let first_session = first
            .decoder_session
            .expect("first keyframe should start decoder session diagnostics");
        let second_session = second
            .decoder_session
            .expect("second frame should reuse decoder session diagnostics");

        assert_eq!(
            first_session.mode,
            "media-foundation-h264-persistent-decoder-session"
        );
        assert!(first_session.worker_thread);
        assert_eq!(first_session.worker_mode, "dedicated-native-decoder-thread");
        assert_eq!(first_session.codec_string.as_deref(), Some("avc1.420029"));
        assert_eq!(first_session.submitted_frames, 1);
        assert_eq!(second_session.submitted_frames, 2);
        assert!(second_session.worker_thread);
        assert_eq!(second_session.worker_status, "active");
        assert!(second_session.frame_handoff_active);
        assert_eq!(
            second_session.frame_handoff_mode,
            "native-latest-frame-handoff"
        );
        assert!(
            matches!(
                second_session.frame_handoff_status.as_str(),
                "waiting-decoded-frame" | "latest-frame-ready"
            ),
            "unexpected frame handoff status: {}",
            second_session.frame_handoff_status
        );
        assert_eq!(
            second_session.latest_frame_format,
            second_session.output_subtype
        );
        assert!(second_session.native_surface_ready);
        assert_eq!(
            second_session.native_surface_mode,
            "d3d11-latest-frame-texture-target"
        );
        assert_eq!(second_session.native_surface_status, "ready");
        assert_eq!(
            second_session.native_surface_format,
            second_session.output_subtype
        );
        assert_eq!(second_session.native_surface_width, 1920);
        assert_eq!(second_session.native_surface_height, 1080);
        assert!(second_session.native_present_ready);
        assert_eq!(
            second_session.native_present_mode,
            "d3d11-bgra8-present-texture-target"
        );
        assert_eq!(second_session.native_present_format, "BGRA8");
        assert_eq!(second_session.native_present_width, 1920);
        assert_eq!(second_session.native_present_height, 1080);
        assert!(!second_session.native_present_status.trim().is_empty());
        assert!(!second_session.native_present_reason.trim().is_empty());
        assert!(second_session.accepted_input_frames <= second_session.submitted_frames);
        assert!(second_session.decoded_frames <= second_session.accepted_input_frames);
        assert!(!second_session.output_subtype.trim().is_empty());
        assert!(!second_session.last_status.trim().is_empty());
        assert!(!second_session.reason.trim().is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn hwnd_swapchain_desc_uses_bgra_flip_model() {
        use windows::Win32::Graphics::Dxgi::Common::{
            DXGI_ALPHA_MODE_IGNORE, DXGI_FORMAT_B8G8R8A8_UNORM,
        };
        use windows::Win32::Graphics::Dxgi::{
            DXGI_SCALING_STRETCH, DXGI_SWAP_EFFECT_FLIP_DISCARD, DXGI_USAGE_RENDER_TARGET_OUTPUT,
        };

        let desc = d3d11_hwnd_swapchain_desc(2560, 1440);

        assert_eq!(desc.Width, 2560);
        assert_eq!(desc.Height, 1440);
        assert_eq!(desc.Format, DXGI_FORMAT_B8G8R8A8_UNORM);
        assert_eq!(desc.SampleDesc.Count, 1);
        assert_eq!(desc.SampleDesc.Quality, 0);
        assert_eq!(desc.BufferUsage, DXGI_USAGE_RENDER_TARGET_OUTPUT);
        assert_eq!(desc.BufferCount, 2);
        assert_eq!(desc.Scaling, DXGI_SCALING_STRETCH);
        assert_eq!(desc.SwapEffect, DXGI_SWAP_EFFECT_FLIP_DISCARD);
        assert_eq!(desc.AlphaMode, DXGI_ALPHA_MODE_IGNORE);

        let fallback = d3d11_hwnd_swapchain_desc(0, 0);
        assert_eq!(fallback.Width, 1);
        assert_eq!(fallback.Height, 1);
    }

    #[cfg(windows)]
    #[test]
    fn native_surface_target_copies_sample_into_latest_frame_texture() {
        unsafe {
            MFStartup(MF_VERSION, MFSTARTUP_LITE).expect("MFStartup should succeed");
            let result = (|| -> Result<(), String> {
                let mut target = create_d3d11_latest_frame_texture_target("NV12")?;
                let expected_bytes =
                    (target.summary.width as usize * target.summary.height as usize * 3) / 2;
                let frame_bytes = vec![0x7f; expected_bytes];
                let sample = create_mf_sample_from_bytes(&frame_bytes, 0, 16_667)?;

                let copy = copy_decoded_sample_to_native_surface(&mut target, &sample, 7)?;

                assert_eq!(copy.status, "latest-frame-presented");
                assert_eq!(copy.bytes_copied, expected_bytes as u64);
                assert_eq!(copy.presented_frames, 1);
                assert_eq!(copy.last_frame_id, Some(7));
                assert_eq!(target.summary.status, "latest-frame-presented");
                assert_eq!(target.summary.copy_status, "latest-frame-presented");
                assert_eq!(target.summary.copy_bytes, expected_bytes as u64);
                assert_eq!(target.summary.presented_frames, 1);
                assert_eq!(target.summary.last_frame_id, Some(7));
                assert!(target.summary.native_present_ready);
                assert_eq!(
                    target.summary.native_present_mode,
                    "d3d11-bgra8-present-texture-target"
                );
                assert_eq!(target.summary.native_present_format, "BGRA8");
                assert_eq!(target.summary.native_present_width, 1920);
                assert_eq!(target.summary.native_present_height, 1080);
                assert_eq!(
                    target.summary.native_present_status,
                    "waiting-nv12-renderer"
                );
                assert_eq!(target.summary.native_present_frames, 0);
                assert_eq!(target.summary.native_present_last_frame_id, None);
                Ok(())
            })();
            let shutdown = MFShutdown();
            assert!(shutdown.is_ok(), "MFShutdown failed: {shutdown:?}");
            result.expect("native surface copy should succeed");
        }
    }

    #[cfg(windows)]
    #[test]
    fn native_present_target_stages_bgra_latest_frame_texture() {
        unsafe {
            MFStartup(MF_VERSION, MFSTARTUP_LITE).expect("MFStartup should succeed");
            let result = (|| -> Result<(), String> {
                let mut target = create_d3d11_latest_frame_texture_target("ARGB32")?;
                let expected_bytes =
                    target.summary.width as usize * target.summary.height as usize * 4;
                let frame_bytes = vec![0x44; expected_bytes];
                let sample = create_mf_sample_from_bytes(&frame_bytes, 0, 16_667)?;

                let copy = copy_decoded_sample_to_native_surface(&mut target, &sample, 9)?;

                assert_eq!(copy.status, "latest-frame-presented");
                assert!(target.summary.native_present_ready);
                assert_eq!(
                    target.summary.native_present_status,
                    "latest-frame-present-staged"
                );
                assert_eq!(target.summary.native_present_frames, 1);
                assert_eq!(target.summary.native_present_last_frame_id, Some(9));
                assert!(target
                    .summary
                    .native_present_reason
                    .contains("present texture target"));
                Ok(())
            })();
            let shutdown = MFShutdown();
            assert!(shutdown.is_ok(), "MFShutdown failed: {shutdown:?}");
            result.expect("native present target staging should succeed");
        }
    }

    #[cfg(windows)]
    #[test]
    fn native_present_target_presents_bgra_latest_frame_to_hwnd_swapchain() {
        unsafe {
            MFStartup(MF_VERSION, MFSTARTUP_LITE).expect("MFStartup should succeed");
            let result = (|| -> Result<(), String> {
                let window = HiddenPresentTestWindow::create(1280, 720)?;
                let target_config = window.config();
                let mut target = create_d3d11_latest_frame_texture_target_for_window(
                    "ARGB32",
                    Some(target_config),
                )?;
                let expected_bytes =
                    target.summary.width as usize * target.summary.height as usize * 4;
                let frame_bytes = vec![0x88; expected_bytes];
                let sample = create_mf_sample_from_bytes(&frame_bytes, 0, 16_667)?;

                let copy = copy_decoded_sample_to_native_surface(&mut target, &sample, 11)?;

                assert_eq!(copy.status, "latest-frame-presented");
                assert_eq!(target.summary.native_present_mode, "d3d11-hwnd-swapchain");
                assert_eq!(
                    target.summary.native_present_status,
                    "latest-frame-swapchain-presented"
                );
                assert_eq!(target.summary.native_present_frames, 1);
                assert_eq!(target.summary.native_present_last_frame_id, Some(11));
                assert!(target.summary.native_present_reason.contains("Present"));
                Ok(())
            })();
            let shutdown = MFShutdown();
            assert!(shutdown.is_ok(), "MFShutdown failed: {shutdown:?}");
            result.expect("native HWND swapchain present should succeed");
        }
    }

    #[cfg(windows)]
    struct HiddenPresentTestWindow {
        hwnd: HWND,
        client_width: u32,
        client_height: u32,
    }

    #[cfg(windows)]
    impl HiddenPresentTestWindow {
        unsafe fn create(client_width: u32, client_height: u32) -> Result<Self, String> {
            use std::sync::atomic::{AtomicUsize, Ordering};
            use windows::core::PCWSTR;
            use windows::Win32::UI::WindowsAndMessaging::{
                CreateWindowExW, RegisterClassW, CW_USEDEFAULT, WINDOW_EX_STYLE, WNDCLASSW,
                WS_OVERLAPPEDWINDOW,
            };

            static WINDOW_INDEX: AtomicUsize = AtomicUsize::new(1);
            let index = WINDOW_INDEX.fetch_add(1, Ordering::Relaxed);
            let class_name = wide_null(&format!("LanDualW8PresentTestWindow{index}"));
            let title = wide_null("LanDual W8 present test");
            let window_class = WNDCLASSW {
                lpfnWndProc: Some(test_present_window_proc),
                lpszClassName: PCWSTR(class_name.as_ptr()),
                ..Default::default()
            };
            let atom = RegisterClassW(&window_class);
            if atom == 0 {
                return Err("RegisterClassW failed for W8 present test window".to_string());
            }
            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                PCWSTR(class_name.as_ptr()),
                PCWSTR(title.as_ptr()),
                WS_OVERLAPPEDWINDOW,
                CW_USEDEFAULT,
                CW_USEDEFAULT,
                client_width as i32,
                client_height as i32,
                None,
                None,
                None,
                None,
            )
            .map_err(|error| format!("CreateWindowExW failed for W8 present test: {error}"))?;
            Ok(Self {
                hwnd,
                client_width,
                client_height,
            })
        }

        fn config(&self) -> W8NativeWindowPresentTargetConfig {
            W8NativeWindowPresentTargetConfig {
                hwnd_value: self.hwnd.0 as isize,
                client_width: self.client_width,
                client_height: self.client_height,
            }
        }
    }

    #[cfg(windows)]
    impl Drop for HiddenPresentTestWindow {
        fn drop(&mut self) {
            unsafe {
                use windows::Win32::UI::WindowsAndMessaging::DestroyWindow;
                let _ = DestroyWindow(self.hwnd);
            }
        }
    }

    #[cfg(windows)]
    unsafe extern "system" fn test_present_window_proc(
        hwnd: HWND,
        message: u32,
        wparam: windows::Win32::Foundation::WPARAM,
        lparam: windows::Win32::Foundation::LPARAM,
    ) -> windows::Win32::Foundation::LRESULT {
        use windows::Win32::UI::WindowsAndMessaging::DefWindowProcW;
        DefWindowProcW(hwnd, message, wparam, lparam)
    }

    #[cfg(windows)]
    fn wide_null(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
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
