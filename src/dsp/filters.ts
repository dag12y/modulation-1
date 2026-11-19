import { BuiltinAudioSource, LAB_SAMPLE_RATE, MAX_AUDIO_DURATION_SEC } from './types';

/**
 * Deterministic xorshift32 PRNG for reproducible AWGN channel noise.
 */
export function createSeededRng(seed: number): () => number {
  let state = (seed | 0) || 1337;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) + 1) / 4294967297;
  };
}

/**
 * Generate zero-mean Gaussian noise using Box-Muller transform.
 */
export function generateGaussianNoise(length: number, sigma: number, seed: number): Float32Array {
  const out = new Float32Array(length);
  if (sigma <= 0) return out;
  const rand = createSeededRng(seed);
  for (let i = 0; i < length; i += 2) {
    const u1 = Math.max(1e-12, rand());
    const u2 = rand();
    const mag = sigma * Math.sqrt(-2.0 * Math.log(u1));
    const theta = 2.0 * Math.PI * u2;
    out[i] = mag * Math.cos(theta);
    if (i + 1 < length) {
      out[i + 1] = mag * Math.sin(theta);
    }
  }
  return out;
}

/**
 * Remove DC offset (mean subtraction).
 */
export function removeMean(signal: Float32Array): Float32Array {
  const n = signal.length;
  const out = new Float32Array(n);
  if (n === 0) return out;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += signal[i];
  const mean = sum / n;
  for (let i = 0; i < n; i++) out[i] = signal[i] - mean;
  return out;
}

/**
 * Peak-normalize a signal to targetPeak (e.g. 0.9).
 */
export function peakNormalize(signal: Float32Array, targetPeak = 0.9): Float32Array {
  const n = signal.length;
  const out = new Float32Array(n);
  let maxAbs = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(signal[i]);
    if (a > maxAbs) maxAbs = a;
  }
  const scale = maxAbs > 1e-9 ? targetPeak / maxAbs : 1.0;
  for (let i = 0; i < n; i++) out[i] = signal[i] * scale;
  return out;
}

/**
 * First-order causal DC blocker: y[n] = x[n] - x[n-1] + R * y[n-1].
 */
export function firstOrderDcBlocker(signal: Float32Array, r = 0.996): Float32Array {
  const n = signal.length;
  const out = new Float32Array(n);
  if (n === 0) return out;
  let prevX = signal[0];
  let prevY = 0;
  for (let i = 0; i < n; i++) {
    const x = signal[i];
    const y = x - prevX + r * prevY;
    out[i] = y;
    prevX = x;
    prevY = y;
  }
  return out;
}

/**
 * Second-order IIR biquad low-pass filter section.
 */
function biquadLPF(signal: Float32Array, cutoffHz: number, fs: number, q: number): Float32Array {
  const n = signal.length;
  const out = new Float32Array(n);
  if (n === 0) return out;

  const fc = Math.max(20, Math.min(cutoffHz, fs * 0.46));
  const w0 = (2 * Math.PI * fc) / fs;
  const cosW = Math.cos(w0);
  const sinW = Math.sin(w0);
  const alpha = sinW / (2 * q);
  const norm = 1 / (1 + alpha);

  const b0 = ((1 - cosW) * 0.5) * norm;
  const b1 = (1 - cosW) * norm;
  const b2 = b0;
  const a1 = -2 * cosW * norm;
  const a2 = (1 - alpha) * norm;

  let x1 = signal[0];
  let x2 = signal[0];
  let y1 = signal[0];
  let y2 = signal[0];

  for (let i = 0; i < n; i++) {
    const x0 = signal[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

/**
 * 4th-order causal Butterworth Low-Pass Filter (cascade of two 2nd-order biquad stages).
 * Exact Butterworth pole Qs: 0.5411961 and 1.3065630.
 */
export function fourthOrderButterworthLPF(
  signal: Float32Array,
  cutoffHz: number,
  fs: number = LAB_SAMPLE_RATE
): Float32Array {
  const stage1 = biquadLPF(signal, cutoffHz, fs, 0.5411961);
  return biquadLPF(stage1, cutoffHz, fs, 1.3065630);
}

/**
 * 63-tap Hamming-windowed FIR Hilbert transformer for analytic signal / USB & LSB decomposition.
 */
export function discreteHilbertFIR(signal: Float32Array): Float32Array {
  const n = signal.length;
  const out = new Float32Array(n);
  const half = 31;
  const taps = new Float32Array(2 * half + 1);

  for (let k = -half; k <= half; k++) {
    if (k !== 0 && (Math.abs(k) & 1) === 1) {
      const win = 0.54 + 0.46 * Math.cos((Math.PI * k) / half);
      taps[k + half] = (2 / (Math.PI * k)) * win;
    }
  }

  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = -half; k <= half; k++) {
      const w = taps[k + half];
      if (w === 0) continue;
      const idx = i - k;
      if (idx >= 0 && idx < n) {
        acc += w * signal[idx];
      }
    }
    out[i] = acc;
  }
  return out;
}

/**
 * Built-in deterministic vocal formant phrase at 44,100 Hz (3.2 s).
 */
export function generateBuiltinAudio(
  _kind: BuiltinAudioSource = 'vocal',
  _singleToneFreqHz = 500,
  fs: number = LAB_SAMPLE_RATE
): Float32Array {
  // 'vocal' — 3.2s deterministic formant-synthesized vocal phrase ("ah - ee - oh - oo")
  const duration = 3.2;
  const n = Math.floor(fs * duration);
  const out = new Float32Array(n);
  const syllables = [
    { t0: 0.05, t1: 0.72, f0Start: 145, f0End: 162, f1: 730, f2: 1090, f3: 2440 },
    { t0: 0.82, t1: 1.52, f0Start: 165, f0End: 150, f1: 270, f2: 2290, f3: 3010 },
    { t0: 1.62, t1: 2.32, f0Start: 152, f0End: 175, f1: 570, f2: 840, f3: 2410 },
    { t0: 2.42, t1: 3.12, f0Start: 168, f0End: 132, f1: 300, f2: 870, f3: 2240 },
  ];

  let glottalPhase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    let activeSyl: (typeof syllables)[number] | null = null;
    for (let s = 0; s < syllables.length; s++) {
      if (t >= syllables[s].t0 && t <= syllables[s].t1) {
        activeSyl = syllables[s];
        break;
      }
    }
    if (!activeSyl) {
      out[i] = 0;
      continue;
    }

    const dur = activeSyl.t1 - activeSyl.t0;
    const u = (t - activeSyl.t0) / dur;
    const vibrato = 1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * t);
    const f0 = (activeSyl.f0Start + (activeSyl.f0End - activeSyl.f0Start) * u) * vibrato;
    glottalPhase += (2 * Math.PI * f0) / fs;

    // Smooth syllable envelope
    const attack = Math.min(1, (t - activeSyl.t0) / 0.045);
    const release = Math.min(1, (activeSyl.t1 - t) / 0.08);
    const env = Math.sin((Math.PI * Math.min(attack, release)) / 2);

    // Sum harmonics shaped by 3 Gaussian formant resonances (below 3400 Hz)
    let val = 0;
    const maxH = Math.floor(3300 / f0);
    for (let h = 1; h <= maxH; h++) {
      const fh = h * f0;
      const g1 = Math.exp(-Math.pow((fh - activeSyl.f1) / 110, 2));
      const g2 = 0.65 * Math.exp(-Math.pow((fh - activeSyl.f2) / 160, 2));
      const g3 = 0.25 * Math.exp(-Math.pow((fh - activeSyl.f3) / 220, 2));
      const spectralTilt = 1 / Math.pow(h, 0.65);
      val += spectralTilt * (0.08 + g1 + g2 + g3) * Math.sin(h * glottalPhase);
    }
    out[i] = val * env;
  }

  return peakNormalize(removeMean(out), 0.9);
}

/**
 * Decode uploaded audio file (WAV, MP3, M4A, OGG, FLAC), downmix to mono,
 * resample to 44,100 Hz, limit to 15 seconds, remove DC offset, and peak-normalize to 0.9.
 */
export async function decodeAndNormalizeAudioFile(file: File): Promise<{
  samples: Float32Array;
  originalSampleRate: number;
  originalDurationSec: number;
  truncated: boolean;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const originalSampleRate = decoded.sampleRate;
    const originalDurationSec = decoded.duration;
    const truncated = originalDurationSec > MAX_AUDIO_DURATION_SEC;
    const targetDuration = Math.min(originalDurationSec, MAX_AUDIO_DURATION_SEC);
    const numSrcSamples = Math.min(decoded.length, Math.floor(targetDuration * originalSampleRate));

    // Downmix multichannel to mono
    const numChannels = decoded.numberOfChannels;
    const monoSrc = new Float32Array(numSrcSamples);
    for (let ch = 0; ch < numChannels; ch++) {
      const chData = decoded.getChannelData(ch);
      for (let i = 0; i < numSrcSamples; i++) {
        monoSrc[i] += chData[i] / numChannels;
      }
    }

    // Resample to 44,100 Hz via linear interpolation
    let resampled: Float32Array;
    if (originalSampleRate === LAB_SAMPLE_RATE) {
      resampled = monoSrc;
    } else {
      const targetLen = Math.max(1, Math.floor((numSrcSamples * LAB_SAMPLE_RATE) / originalSampleRate));
      resampled = new Float32Array(targetLen);
      const ratio = originalSampleRate / LAB_SAMPLE_RATE;
      for (let i = 0; i < targetLen; i++) {
        const srcIdx = i * ratio;
        const i0 = Math.floor(srcIdx);
        const i1 = Math.min(numSrcSamples - 1, i0 + 1);
        const frac = srcIdx - i0;
        resampled[i] = monoSrc[i0] * (1 - frac) + monoSrc[i1] * frac;
      }
    }

    const dcRemoved = removeMean(resampled);
    const normalized = peakNormalize(dcRemoved, 0.9);
    return {
      samples: normalized,
      originalSampleRate,
      originalDurationSec,
      truncated,
    };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
