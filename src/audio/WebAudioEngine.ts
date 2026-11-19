import { LAB_SAMPLE_RATE, SignalTrackId } from '../dsp/types';

export interface PlaybackState {
  isPlaying: boolean;
  activeTrack: SignalTrackId | null;
  currentTimeSec: number;
  durationSec: number;
}

type PlaybackListener = (state: PlaybackState) => void;

/**
 * Shared Web Audio playback engine at 44,100 Hz:
 * - Lazy AudioBuffer generation with soft tanh limiting (prevents DAC clipping)
 * - Master gain 0.85
 * - Real-time ~60 FPS playback cursor broadcast
 * - Seamless parameter updates while playing
 */
export class WebAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private tracks: Partial<Record<SignalTrackId, Float32Array>> = {};
  private bufferCache: Partial<Record<SignalTrackId, AudioBuffer>> = {};

  private activeTrack: SignalTrackId | null = null;
  private isPlaying = false;
  private startCtxTime = 0;
  private pauseOffsetSec = 0;
  private durationSec = 0;
  private rafId: number | null = null;
  private listeners = new Set<PlaybackListener>();

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ sampleRate: LAB_SAMPLE_RATE });
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.85;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public setTracks(newTracks: Partial<Record<SignalTrackId, Float32Array>>) {
    const wasPlaying = this.isPlaying;
    const prevTrack = this.activeTrack;
    const prevOffset = this.getCurrentTimeSec();

    this.tracks = newTracks;
    this.bufferCache = {};

    if (prevTrack && newTracks[prevTrack]) {
      this.durationSec = newTracks[prevTrack]!.length / LAB_SAMPLE_RATE;
      if (wasPlaying) {
        const clampedOffset = Math.min(prevOffset, Math.max(0, this.durationSec - 0.02));
        this.startSource(prevTrack, clampedOffset);
      }
    } else if (wasPlaying) {
      this.stop();
    }
  }

  private getOrCreateBuffer(trackId: SignalTrackId): AudioBuffer | null {
    const existing = this.bufferCache[trackId];
    if (existing) return existing;
    const samples = this.tracks[trackId];
    if (!samples || samples.length === 0) return null;

    const ctx = this.ensureContext();
    const buf = ctx.createBuffer(1, samples.length, LAB_SAMPLE_RATE);
    const channelData = buf.getChannelData(0);

    // Apply soft tanh limiting to prevent DAC clipping without altering underlying DSP arrays
    for (let i = 0; i < samples.length; i++) {
      channelData[i] = Math.tanh(samples[i] * 0.95);
    }
    this.bufferCache[trackId] = buf;
    return buf;
  }

  public subscribe(listener: PlaybackListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    const state = this.getState();
    this.listeners.forEach((fn) => fn(state));
  }

  public getCurrentTimeSec(): number {
    if (!this.isPlaying || !this.ctx) {
      return this.pauseOffsetSec;
    }
    const elapsed = this.ctx.currentTime - this.startCtxTime;
    return Math.min(this.durationSec, Math.max(0, elapsed));
  }

  public getState(): PlaybackState {
    return {
      isPlaying: this.isPlaying,
      activeTrack: this.activeTrack,
      currentTimeSec: this.getCurrentTimeSec(),
      durationSec: this.durationSec,
    };
  }

  private startSource(trackId: SignalTrackId, offsetSec: number) {
    this.stopSourceOnly();
    const ctx = this.ensureContext();
    const buf = this.getOrCreateBuffer(trackId);
    if (!buf || !this.masterGain) return;

    this.durationSec = buf.duration;
    const safeOffset = Math.max(0, Math.min(offsetSec, Math.max(0, buf.duration - 0.01)));

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.masterGain);
    src.onended = () => {
      // Only handle natural completion if this is still the active source
      if (this.sourceNode === src && this.isPlaying) {
        this.isPlaying = false;
        this.pauseOffsetSec = 0;
        this.sourceNode = null;
        this.stopRaf();
        this.emit();
      }
    };

    this.sourceNode = src;
    this.activeTrack = trackId;
    this.startCtxTime = ctx.currentTime - safeOffset;
    this.pauseOffsetSec = safeOffset;
    this.isPlaying = true;
    src.start(0, safeOffset);

    this.startRaf();
    this.emit();
  }

  private stopSourceOnly() {
    if (this.sourceNode) {
      const node = this.sourceNode;
      this.sourceNode = null;
      node.onended = null;
      try {
        node.stop();
        node.disconnect();
      } catch {
        // ignore if already stopped
      }
    }
  }

  public playOrToggle(trackId: SignalTrackId) {
    if (this.isPlaying && this.activeTrack === trackId) {
      this.pause();
      return;
    }
    const resumeOffset = this.activeTrack === trackId ? this.pauseOffsetSec : 0;
    this.startSource(trackId, resumeOffset);
  }

  public pause() {
    if (!this.isPlaying) return;
    this.pauseOffsetSec = this.getCurrentTimeSec();
    this.isPlaying = false;
    this.stopSourceOnly();
    this.stopRaf();
    this.emit();
  }

  public stop() {
    this.isPlaying = false;
    this.pauseOffsetSec = 0;
    this.stopSourceOnly();
    this.stopRaf();
    this.emit();
  }

  public seek(timeSec: number) {
    const clamped = Math.max(0, Math.min(this.durationSec || 0, timeSec));
    this.pauseOffsetSec = clamped;
    if (this.isPlaying && this.activeTrack) {
      this.startSource(this.activeTrack, clamped);
    } else {
      this.emit();
    }
  }

  private startRaf() {
    this.stopRaf();
    const tick = () => {
      if (!this.isPlaying) return;
      this.emit();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopRaf() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public dispose() {
    this.stop();
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
  }
}
