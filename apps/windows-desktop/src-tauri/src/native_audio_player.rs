#![allow(dead_code)]

use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    FromSample, Sample, SampleFormat, SizedSample, Stream, StreamConfig,
};
use std::collections::VecDeque;
use std::sync::{
    mpsc::{self, Receiver, Sender},
    Arc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::Duration;

#[derive(Debug, Clone, Copy)]
pub struct NativeAudioPlaybackConfig {
    pub sample_rate: u32,
    pub channels: u16,
    pub target_queue_ms: u64,
    pub max_live_queue_ms: u64,
}

impl Default for NativeAudioPlaybackConfig {
    fn default() -> Self {
        Self {
            sample_rate: 48_000,
            channels: 2,
            target_queue_ms: 80,
            max_live_queue_ms: 120,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct NativeAudioPlaybackStats {
    pub pushed_frames: u64,
    pub played_frames: u64,
    pub trimmed_frames: u64,
    pub underruns: u64,
    pub queue_ms: u64,
    pub last_reason: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeAudioPlaybackPushResult {
    pub accepted: bool,
    pub pushed_frames: u64,
    pub queue_ms: u64,
    pub trimmed_frames: u64,
    pub reason: &'static str,
}

pub struct NativeAudioPlaybackBuffer {
    config: NativeAudioPlaybackConfig,
    samples: VecDeque<f32>,
    stats: NativeAudioPlaybackStats,
}

pub struct NativeAudioOutput {
    command_tx: Sender<NativeAudioWorkerCommand>,
    config: NativeAudioPlaybackConfig,
    worker: Option<JoinHandle<()>>,
}

enum NativeAudioWorkerCommand {
    Push(
        Vec<f32>,
        Sender<Result<NativeAudioPlaybackPushResult, String>>,
    ),
    Stats(Sender<Result<NativeAudioPlaybackStats, String>>),
    Stop,
}

impl NativeAudioOutput {
    pub fn start_default(config: NativeAudioPlaybackConfig) -> Result<Self, String> {
        let (command_tx, command_rx) = mpsc::channel();
        let (ready_tx, ready_rx) = mpsc::channel();
        let worker = thread::spawn(move || run_audio_worker(config, command_rx, ready_tx));
        let playback_config = ready_rx
            .recv_timeout(Duration::from_secs(5))
            .map_err(|_| "W9 原生音频播放失败：输出线程启动超时".to_string())??;

        Ok(Self {
            command_tx,
            config: playback_config,
            worker: Some(worker),
        })
    }

    pub fn push_interleaved_f32(
        &self,
        samples: &[f32],
    ) -> Result<NativeAudioPlaybackPushResult, String> {
        let (reply_tx, reply_rx) = mpsc::channel();
        self.command_tx
            .send(NativeAudioWorkerCommand::Push(samples.to_vec(), reply_tx))
            .map_err(|_| "W9 原生音频播放线程已停止".to_string())?;
        reply_rx
            .recv_timeout(Duration::from_secs(2))
            .map_err(|_| "W9 原生音频播放 push 超时".to_string())?
    }

    pub fn stats(&self) -> Result<NativeAudioPlaybackStats, String> {
        let (reply_tx, reply_rx) = mpsc::channel();
        self.command_tx
            .send(NativeAudioWorkerCommand::Stats(reply_tx))
            .map_err(|_| "W9 原生音频播放线程已停止".to_string())?;
        reply_rx
            .recv_timeout(Duration::from_secs(2))
            .map_err(|_| "W9 原生音频播放状态读取超时".to_string())?
    }

    pub fn config(&self) -> NativeAudioPlaybackConfig {
        self.config
    }
}

impl Drop for NativeAudioOutput {
    fn drop(&mut self) {
        let _ = self.command_tx.send(NativeAudioWorkerCommand::Stop);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn run_audio_worker(
    config: NativeAudioPlaybackConfig,
    command_rx: Receiver<NativeAudioWorkerCommand>,
    ready_tx: Sender<Result<NativeAudioPlaybackConfig, String>>,
) {
    let result = create_audio_worker(config);
    let Ok((stream, buffer, playback_config)) = result else {
        let _ = ready_tx.send(result.map(|(_, _, config)| config));
        return;
    };
    if let Err(error) = stream.play() {
        let _ = ready_tx.send(Err(format!("W9 原生音频播放失败：启动输出流失败：{error}")));
        return;
    }
    let _ = ready_tx.send(Ok(playback_config));
    while let Ok(command) = command_rx.recv() {
        match command {
            NativeAudioWorkerCommand::Push(samples, reply_tx) => {
                let result = buffer
                    .lock()
                    .map_err(|_| "W9 原生音频播放缓冲锁定失败".to_string())
                    .map(|mut guard| guard.push_interleaved_f32(&samples));
                let _ = reply_tx.send(result);
            }
            NativeAudioWorkerCommand::Stats(reply_tx) => {
                let result = buffer
                    .lock()
                    .map_err(|_| "W9 原生音频播放缓冲锁定失败".to_string())
                    .map(|guard| guard.stats());
                let _ = reply_tx.send(result);
            }
            NativeAudioWorkerCommand::Stop => break,
        }
    }
}

fn create_audio_worker(
    config: NativeAudioPlaybackConfig,
) -> Result<
    (
        Stream,
        Arc<Mutex<NativeAudioPlaybackBuffer>>,
        NativeAudioPlaybackConfig,
    ),
    String,
> {
    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or_else(|| "W9 原生音频播放失败：未找到默认输出设备".to_string())?;
    let supported_config = device
        .default_output_config()
        .map_err(|error| format!("W9 原生音频播放失败：读取默认输出格式失败：{error}"))?;
    let stream_config = StreamConfig {
        channels: supported_config.channels(),
        sample_rate: supported_config.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };
    let playback_config = NativeAudioPlaybackConfig {
        sample_rate: stream_config.sample_rate.0,
        channels: stream_config.channels,
        ..config
    };
    let buffer = Arc::new(Mutex::new(NativeAudioPlaybackBuffer::new(playback_config)));
    let stream = build_output_stream(
        supported_config.sample_format(),
        &device,
        &stream_config,
        buffer.clone(),
    )?;
    Ok((stream, buffer, playback_config))
}

fn build_output_stream(
    sample_format: SampleFormat,
    device: &cpal::Device,
    config: &StreamConfig,
    buffer: Arc<Mutex<NativeAudioPlaybackBuffer>>,
) -> Result<Stream, String> {
    match sample_format {
        SampleFormat::F32 => build_typed_output_stream::<f32>(device, config, buffer),
        SampleFormat::I16 => build_typed_output_stream::<i16>(device, config, buffer),
        SampleFormat::U16 => build_typed_output_stream::<u16>(device, config, buffer),
        value => Err(format!("W9 原生音频播放失败：暂不支持输出格式 {value:?}")),
    }
}

fn build_typed_output_stream<T>(
    device: &cpal::Device,
    config: &StreamConfig,
    buffer: Arc<Mutex<NativeAudioPlaybackBuffer>>,
) -> Result<Stream, String>
where
    T: Sample + SizedSample + FromSample<f32>,
{
    let error_callback = |error| eprintln!("W9 native audio output stream error: {error}");
    device
        .build_output_stream(
            config,
            move |output: &mut [T], _| {
                let mut scratch = vec![0.0_f32; output.len()];
                if let Ok(mut guard) = buffer.lock() {
                    guard.fill_output(&mut scratch);
                }
                for (target, value) in output.iter_mut().zip(scratch.into_iter()) {
                    *target = T::from_sample(value);
                }
            },
            error_callback,
            None,
        )
        .map_err(|error| format!("W9 原生音频播放失败：创建输出流失败：{error}"))
}

impl NativeAudioPlaybackBuffer {
    pub fn new(config: NativeAudioPlaybackConfig) -> Self {
        Self {
            config,
            samples: VecDeque::new(),
            stats: NativeAudioPlaybackStats::default(),
        }
    }

    pub fn push_interleaved_f32(&mut self, samples: &[f32]) -> NativeAudioPlaybackPushResult {
        let channels = usize::from(self.config.channels.max(1));
        if samples.is_empty() || samples.len() % channels != 0 {
            self.stats.last_reason = "native-playback-reject-format";
            self.stats.queue_ms = self.queue_ms();
            return NativeAudioPlaybackPushResult {
                accepted: false,
                pushed_frames: 0,
                queue_ms: self.stats.queue_ms,
                trimmed_frames: 0,
                reason: self.stats.last_reason,
            };
        }

        let pushed_frames = (samples.len() / channels) as u64;
        self.samples.extend(samples.iter().copied());
        self.stats.pushed_frames += pushed_frames;

        let trimmed_frames = self.trim_to_live_window();
        let reason = if trimmed_frames > 0 {
            "native-playback-trim-live"
        } else {
            "native-playback-queued"
        };
        self.stats.last_reason = reason;
        self.stats.queue_ms = self.queue_ms();

        NativeAudioPlaybackPushResult {
            accepted: true,
            pushed_frames,
            queue_ms: self.stats.queue_ms,
            trimmed_frames,
            reason,
        }
    }

    pub fn fill_output(&mut self, output: &mut [f32]) {
        let channels = usize::from(self.config.channels.max(1));
        let output_frames = (output.len() / channels) as u64;
        let mut underflowed = false;
        for sample in output.iter_mut() {
            if let Some(value) = self.samples.pop_front() {
                *sample = value;
            } else {
                *sample = 0.0;
                underflowed = true;
            }
        }
        self.stats.played_frames += output_frames;
        if underflowed {
            self.stats.underruns += 1;
            self.stats.last_reason = "native-playback-underflow-silence";
        } else {
            self.stats.last_reason = "native-playback-drain";
        }
        self.stats.queue_ms = self.queue_ms();
    }

    pub fn queue_ms(&self) -> u64 {
        frames_to_ms(self.queued_frames(), self.config.sample_rate)
    }

    pub fn stats(&self) -> NativeAudioPlaybackStats {
        self.stats.clone()
    }

    fn queued_frames(&self) -> u64 {
        let channels = usize::from(self.config.channels.max(1));
        (self.samples.len() / channels) as u64
    }

    fn trim_to_live_window(&mut self) -> u64 {
        let queue_ms = self.queue_ms();
        if queue_ms < self.config.max_live_queue_ms {
            return 0;
        }

        let target_frames = ms_to_frames(self.config.target_queue_ms, self.config.sample_rate);
        let queued_frames = self.queued_frames();
        let trim_frames = queued_frames.saturating_sub(target_frames);
        let trim_samples = trim_frames.saturating_mul(u64::from(self.config.channels.max(1)));
        for _ in 0..trim_samples {
            if self.samples.pop_front().is_none() {
                break;
            }
        }
        self.stats.trimmed_frames += trim_frames;
        trim_frames
    }
}

fn frames_to_ms(frames: u64, sample_rate: u32) -> u64 {
    if sample_rate == 0 {
        return 0;
    }
    ((frames * 1000) + u64::from(sample_rate / 2)) / u64::from(sample_rate)
}

fn ms_to_frames(ms: u64, sample_rate: u32) -> u64 {
    (ms * u64::from(sample_rate)) / 1000
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stereo_frame(value: f32, frames: usize) -> Vec<f32> {
        let mut samples = Vec::with_capacity(frames * 2);
        for _ in 0..frames {
            samples.push(value);
            samples.push(-value);
        }
        samples
    }

    #[test]
    fn pushes_pcm_into_playable_buffer_and_callback_drains_it() {
        let mut buffer = NativeAudioPlaybackBuffer::new(NativeAudioPlaybackConfig::default());
        let result = buffer.push_interleaved_f32(&stereo_frame(0.25, 960));

        assert!(result.accepted);
        assert_eq!(result.pushed_frames, 960);
        assert_eq!(result.queue_ms, 20);

        let mut output = vec![0.0_f32; 480 * 2];
        buffer.fill_output(&mut output);

        assert!(output.iter().any(|sample| sample.abs() > 0.0));
        assert_eq!(buffer.stats().played_frames, 480);
        assert_eq!(buffer.queue_ms(), 10);
    }

    #[test]
    fn burst_pcm_is_trimmed_to_live_window_before_playback() {
        let mut buffer = NativeAudioPlaybackBuffer::new(NativeAudioPlaybackConfig::default());

        for index in 0..12 {
            buffer.push_interleaved_f32(&stereo_frame(0.1 + index as f32, 960));
        }

        assert!(buffer.stats().trimmed_frames > 0);
        assert!(buffer.queue_ms() <= 100);
        assert_eq!(buffer.stats().last_reason, "native-playback-trim-live");
    }

    #[test]
    fn output_underflow_fills_silence_and_tracks_underrun() {
        let mut buffer = NativeAudioPlaybackBuffer::new(NativeAudioPlaybackConfig::default());
        buffer.push_interleaved_f32(&stereo_frame(0.25, 240));

        let mut output = vec![1.0_f32; 960 * 2];
        buffer.fill_output(&mut output);

        assert_eq!(buffer.stats().underruns, 1);
        assert_eq!(buffer.stats().played_frames, 960);
        assert_eq!(buffer.queue_ms(), 0);
        assert!(output[(240 * 2)..].iter().all(|sample| *sample == 0.0));
    }
}
