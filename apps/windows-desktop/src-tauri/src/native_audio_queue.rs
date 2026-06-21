#![allow(dead_code)]

#[derive(Debug, Clone, Copy)]
pub struct NativeAudioQueueConfig {
    pub min_start_buffer_ms: u64,
    pub target_queue_ms: u64,
    pub max_live_queue_ms: u64,
    pub max_frame_gap_ms: u64,
}

impl Default for NativeAudioQueueConfig {
    fn default() -> Self {
        Self {
            min_start_buffer_ms: 40,
            target_queue_ms: 80,
            max_live_queue_ms: 120,
            max_frame_gap_ms: 120,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct NativePcmFrame {
    pub frame_id: u64,
    pub frames: u32,
    pub sample_rate: u32,
    pub channels: u16,
    pub received_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeAudioDecision {
    pub frame_id: u64,
    pub scheduled_at_ms: u64,
    pub duration_ms: u64,
    pub queue_ms_after: u64,
    pub trimmed_stale_frames: u64,
    pub reason: &'static str,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct NativeAudioQueueStats {
    pub received_frames: u64,
    pub scheduled_frames: u64,
    pub trimmed_stale_frames: u64,
    pub snap_live_count: u64,
    pub underrun_count: u64,
    pub max_receive_gap_ms: u64,
    pub last_reason: &'static str,
}

pub struct NativeAudioQueue {
    config: NativeAudioQueueConfig,
    next_play_at_ms: Option<u64>,
    last_received_at_ms: Option<u64>,
    stats: NativeAudioQueueStats,
}

impl NativeAudioQueue {
    pub fn new(config: NativeAudioQueueConfig) -> Self {
        Self {
            config,
            next_play_at_ms: None,
            last_received_at_ms: None,
            stats: NativeAudioQueueStats::default(),
        }
    }

    pub fn offer_frame(&mut self, frame: NativePcmFrame) -> NativeAudioDecision {
        let now_ms = frame.received_at_ms;
        let duration_ms = frame_duration_ms(frame.frames, frame.sample_rate).max(1);
        self.stats.received_frames += 1;
        if let Some(last_received_at_ms) = self.last_received_at_ms {
            let receive_gap_ms = now_ms.saturating_sub(last_received_at_ms);
            self.stats.max_receive_gap_ms = self.stats.max_receive_gap_ms.max(receive_gap_ms);
        }
        self.last_received_at_ms = Some(now_ms);

        let mut reason = "native-steady";
        let mut trimmed_stale_frames = 0;
        let queue_before_ms = self.queue_ms(now_ms);

        if self.next_play_at_ms.is_none() {
            self.next_play_at_ms = Some(now_ms + self.config.min_start_buffer_ms);
            reason = "native-start-prebuffer";
        } else if queue_before_ms == 0 {
            self.stats.underrun_count += 1;
            self.next_play_at_ms = Some(now_ms + self.config.min_start_buffer_ms);
            reason = "native-underrun-short-prebuffer";
        } else if queue_before_ms > self.config.max_live_queue_ms {
            let excess_ms = queue_before_ms.saturating_sub(self.config.target_queue_ms);
            trimmed_stale_frames = ceil_div(excess_ms, duration_ms).max(1);
            self.stats.trimmed_stale_frames += trimmed_stale_frames;
            self.stats.snap_live_count += 1;
            self.next_play_at_ms = Some(now_ms + self.config.target_queue_ms);
            reason = "native-snap-live";
        } else if self.stats.max_receive_gap_ms > self.config.max_frame_gap_ms {
            reason = "native-steady-after-gap";
        }

        let scheduled_at_ms = self.next_play_at_ms.unwrap_or(now_ms);
        self.next_play_at_ms = Some(scheduled_at_ms + duration_ms);
        self.stats.scheduled_frames += 1;
        self.stats.last_reason = reason;

        NativeAudioDecision {
            frame_id: frame.frame_id,
            scheduled_at_ms,
            duration_ms,
            queue_ms_after: self.queue_ms(now_ms),
            trimmed_stale_frames,
            reason,
        }
    }

    pub fn queue_ms(&self, now_ms: u64) -> u64 {
        self.next_play_at_ms
            .map(|next_play_at_ms| next_play_at_ms.saturating_sub(now_ms))
            .unwrap_or(0)
    }

    pub fn stats(&self) -> NativeAudioQueueStats {
        self.stats.clone()
    }
}

fn frame_duration_ms(frames: u32, sample_rate: u32) -> u64 {
    if sample_rate == 0 {
        return 0;
    }
    ((u64::from(frames) * 1000) + u64::from(sample_rate / 2)) / u64::from(sample_rate)
}

fn ceil_div(value: u64, divisor: u64) -> u64 {
    if divisor == 0 {
        return 0;
    }
    value.div_ceil(divisor)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pcm_frame(frame_id: u64, received_at_ms: u64) -> NativePcmFrame {
        NativePcmFrame {
            frame_id,
            frames: 960,
            sample_rate: 48_000,
            channels: 2,
            received_at_ms,
        }
    }

    #[test]
    fn burst_after_background_gap_snaps_to_live_instead_of_building_future_queue() {
        let mut queue = NativeAudioQueue::new(NativeAudioQueueConfig::default());
        let mut last_decision = None;

        for frame_id in 1..=12 {
            last_decision = Some(queue.offer_frame(pcm_frame(frame_id, 500)));
        }

        let stats = queue.stats();
        let decision = last_decision.expect("last decision");
        assert!(stats.snap_live_count >= 1);
        assert!(stats.trimmed_stale_frames >= 1);
        assert!(decision.trimmed_stale_frames >= 1);
        assert!(decision.queue_ms_after <= 100);
        assert_eq!(queue.queue_ms(500), decision.queue_ms_after);
        assert_ne!(stats.last_reason, "queue-underrun-stable-prebuffer");
    }

    #[test]
    fn steady_pcm_cadence_keeps_short_queue_without_false_refills() {
        let mut queue = NativeAudioQueue::new(NativeAudioQueueConfig::default());

        for frame_id in 1..=30 {
            let now_ms = (frame_id - 1) * 20;
            let decision = queue.offer_frame(pcm_frame(frame_id, now_ms));
            assert!(decision.queue_ms_after <= 80);
        }

        let stats = queue.stats();
        assert_eq!(stats.snap_live_count, 0);
        assert_eq!(stats.underrun_count, 0);
        assert_eq!(stats.trimmed_stale_frames, 0);
        assert!(queue.queue_ms(580) <= 80);
    }

    #[test]
    fn real_underrun_uses_short_rebuild_buffer_not_stable_prebuffer() {
        let mut queue = NativeAudioQueue::new(NativeAudioQueueConfig::default());
        queue.offer_frame(pcm_frame(1, 0));
        queue.offer_frame(pcm_frame(2, 20));
        queue.offer_frame(pcm_frame(3, 40));

        let decision = queue.offer_frame(pcm_frame(4, 360));
        let stats = queue.stats();

        assert_eq!(stats.underrun_count, 1);
        assert_eq!(decision.reason, "native-underrun-short-prebuffer");
        assert!(decision.queue_ms_after <= 80);
        assert_ne!(stats.last_reason, "queue-underrun-stable-prebuffer");
    }
}
