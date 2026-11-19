import { computeFFT } from './dsp';

export type MessageShape = 'sine' | 'two-tone' | 'triangle';

export function evalMessage(
  shape: MessageShape,
  fm: number,
  Am: number,
  t: number
): number {
  if (shape === 'sine') {
    return Am * Math.cos(2 * Math.PI * fm * t);
  }
  if (shape === 'two-tone') {
    return Am * (0.69 * Math.cos(2 * Math.PI * fm * t) + 0.31 * Math.cos(2 * Math.PI * (fm * 2.2) * t));
  }
  const angle = 2 * Math.PI * fm * t;
  return Am * (2 / Math.PI) * Math.asin(Math.cos(angle));
}

export function evalMessageHilbert(
  shape: MessageShape,
  fm: number,
  Am: number,
  t: number
): number {
  if (shape === 'sine') {
    return Am * Math.sin(2 * Math.PI * fm * t);
  }
  if (shape === 'two-tone') {
    return Am * (0.69 * Math.sin(2 * Math.PI * fm * t) + 0.31 * Math.sin(2 * Math.PI * (fm * 2.2) * t));
  }
  let sum = 0;
  for (let k = 0; k < 5; k++) {
    const n = 2 * k + 1;
    sum += (8 / (Math.PI * Math.PI)) * (1 / (n * n)) * Math.sin(2 * Math.PI * n * fm * t);
  }
  return Am * sum;
}

export const SIM_FS = 200000; // 200 kHz oversampling for smooth non-vibrating RF curves
export const FFT_SAMPLES = 4096; // 20.48 ms -> 48.8 Hz bin resolution
export const SCOPE_SAMPLES = 900; // 4.5 ms display window (20 samples per 10 kHz cycle)
export const PROBE_SAMPLES = 2250; // 11.25 ms extended window so circuit scope can zoom out up to 0.4x
export const PRE_SAMPLES = 2048; // 10.24 ms pre-window guard so filters/detectors enter t=0 in steady state

// Helper: smooth raised-cosine FFT Bandpass Filter (tapered outer edges + soft transition band)
function bandpassFilterFFT(signal: number[], fs: number, fLow: number, fHigh: number): number[] {
  const N = signal.length;
  // Zero-pad strictly above N so circular wrap-around never leaks back into [PRE_SAMPLES .. PRE_SAMPLES+SCOPE_SAMPLES]
  let M = 1;
  while (M < N) M *= 2;
  const re = new Float64Array(M);
  const im = new Float64Array(M);

  const taper = Math.min(192, Math.floor(N / 8));
  for (let i = 0; i < N; i++) {
    let w = 1.0;
    if (i < taper) {
      w = 0.5 * (1 - Math.cos((Math.PI * i) / taper));
    } else if (i >= N - taper) {
      w = 0.5 * (1 - Math.cos((Math.PI * (N - 1 - i)) / taper));
    }
    re[i] = (signal[i] || 0) * w;
  }

  const fft = (real: Float64Array, imag: Float64Array, invert: boolean) => {
    let j = 0;
    for (let i = 0; i < M - 1; i++) {
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
      let k = M >> 1;
      while (k <= j) {
        j -= k;
        k >>= 1;
      }
      j += k;
    }
    for (let len = 2; len <= M; len <<= 1) {
      const half = len >> 1;
      const ang = ((invert ? 2 : -2) * Math.PI) / len;
      const wStepR = Math.cos(ang);
      const wStepI = Math.sin(ang);
      for (let i = 0; i < M; i += len) {
        let wr = 1;
        let wi = 0;
        for (let k = 0; k < half; k++) {
          const idx1 = i + k;
          const idx2 = i + k + half;
          const tr = wr * real[idx2] - wi * imag[idx2];
          const ti = wr * imag[idx2] + wi * real[idx2];
          real[idx2] = real[idx1] - tr;
          imag[idx2] = imag[idx1] - ti;
          real[idx1] += tr;
          imag[idx1] += ti;
          const nwr = wr * wStepR - wi * wStepI;
          wi = wr * wStepI + wi * wStepR;
          wr = nwr;
        }
      }
    }
    if (invert) {
      for (let i = 0; i < M; i++) {
        real[i] /= M;
        imag[i] /= M;
      }
    }
  };

  fft(re, im, false);

  const transHz = Math.max(150, (fHigh - fLow) * 0.08);
  for (let k = 0; k < M; k++) {
    const f = k <= M / 2 ? (k * fs) / M : ((M - k) * fs) / M;
    let gain = 1;
    if (f < fLow - transHz || f > fHigh + transHz) {
      gain = 0;
    } else if (f < fLow) {
      const u = (f - (fLow - transHz)) / transHz;
      gain = 0.5 * (1 - Math.cos(Math.PI * u));
    } else if (f > fHigh) {
      const u = (fHigh + transHz - f) / transHz;
      gain = 0.5 * (1 - Math.cos(Math.PI * u));
    }
    re[k] *= gain;
    im[k] *= gain;
  }

  fft(re, im, true);
  return Array.from(re.subarray(0, N));
}

// 4th-order zero-phase Butterworth Low-Pass Filter (forward + backward 2nd-order biquad)
// Removes 2*fc carrier terms cleanly with zero phase shift across the interior window.
function zeroPhaseButterworthLPF(signal: number[], cutoffHz: number, fs: number): number[] {
  const N = signal.length;
  if (N === 0) return [];

  const fcSafe = Math.max(50, Math.min(cutoffHz, fs * 0.42));
  const wc = Math.tan((Math.PI * fcSafe) / fs);
  const k1 = Math.SQRT2 * wc;
  const k2 = wc * wc;
  const norm = 1 / (1 + k1 + k2);
  const b0 = k2 * norm;
  const b1 = 2 * b0;
  const b2 = b0;
  const a1 = 2 * (k2 - 1) * norm;
  const a2 = (1 - k1 + k2) * norm;

  const fwd = new Array<number>(N);
  let x1 = signal[0] || 0;
  let x2 = x1;
  let y1 = x1;
  let y2 = x1;
  for (let i = 0; i < N; i++) {
    const x0 = signal[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    fwd[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  const out = new Array<number>(N);
  x1 = fwd[N - 1] || 0;
  x2 = x1;
  y1 = x1;
  y2 = x1;
  for (let i = N - 1; i >= 0; i--) {
    const x0 = fwd[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return out;
}

// Smooth Hann-weighted steady-state DC estimator (immune to non-integer cycles / animTime wobble)
function hannWeightedMean(signal: number[], start = 0, len = signal.length - start): number {
  if (len <= 0 || signal.length === 0) return 0;
  const end = Math.min(signal.length, start + len);
  const count = end - start;
  if (count <= 2) return signal[start] || 0;
  let wSum = 0;
  let weighted = 0;
  for (let i = 0; i < count; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (count - 1)));
    weighted += w * (signal[start + i] || 0);
    wSum += w;
  }
  return wSum > 0 ? weighted / wSum : 0;
}

// Causal 2nd-order Sallen-Key Low-Pass Filter (reflects real component cutoff & 2fc ripple leakage)
function sallenKeyBiquadLPF(signal: number[], cutoffHz: number, fs: number, q = 0.707): number[] {
  const N = signal.length;
  if (N === 0) return [];
  const fcSafe = Math.max(40, Math.min(cutoffHz, fs * 0.44));
  const w0 = (2 * Math.PI * fcSafe) / fs;
  const sinW = Math.sin(w0);
  const cosW = Math.cos(w0);
  const alpha = sinW / (2 * Math.max(0.25, q));
  const norm = 1 / (1 + alpha);
  const b0 = ((1 - cosW) / 2) * norm;
  const b1 = (1 - cosW) * norm;
  const b2 = b0;
  const a1 = -2 * cosW * norm;
  const a2 = (1 - alpha) * norm;

  const dcInit = hannWeightedMean(signal, Math.min(PRE_SAMPLES, Math.max(0, N - 1)));
  const out = new Array<number>(N);
  let x1 = dcInit;
  let x2 = dcInit;
  let y1 = dcInit;
  let y2 = dcInit;
  for (let i = 0; i < N; i++) {
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

// 1st-order RC AC-coupling High-Pass Filter (C_c & R_b / R_L) initialized at steady-state capacitor voltage
function rcHighPassFilter(signal: number[], rOhm: number, cFarads: number, fs: number): number[] {
  const N = signal.length;
  if (N === 0) return [];
  const rc = Math.max(1e-7, rOhm * cFarads);
  const dt = 1 / fs;
  const alpha = rc / (rc + dt);
  const dcMean = hannWeightedMean(signal, Math.min(PRE_SAMPLES, Math.max(0, N - 1)));
  const out = new Array<number>(N);
  let prevX = signal[0] || 0;
  // Initialize capacitor charged to dcMean so y[0] = x[0] - dcMean (no frame-to-frame DC step!)
  let prevY = prevX - dcMean;
  for (let i = 0; i < N; i++) {
    const x = signal[i];
    const y = i === 0 ? prevY : alpha * (prevY + x - prevX);
    out[i] = y;
    prevX = x;
    prevY = y;
  }
  return out;
}

// Tuned Parallel RLC Bandpass Filter response (models L_t, C_t, R_L detuning & selectivity)
function rlcTankFilterFFT(
  signal: number[],
  fs: number,
  fCenterHz: number,
  bandwidthHz: number,
  gain = 1
): number[] {
  const N = signal.length;
  let M = 1;
  while (M < N) M *= 2;
  const re = new Float64Array(M);
  const im = new Float64Array(M);
  const taper = Math.min(192, Math.floor(N / 8));
  for (let i = 0; i < N; i++) {
    let w = 1.0;
    if (i < taper) w = 0.5 * (1 - Math.cos((Math.PI * i) / taper));
    else if (i >= N - taper) w = 0.5 * (1 - Math.cos((Math.PI * (N - 1 - i)) / taper));
    re[i] = (signal[i] || 0) * w;
  }
  const fft = (real: Float64Array, imag: Float64Array, invert: boolean) => {
    let j = 0;
    for (let i = 0; i < M - 1; i++) {
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
      let k = M >> 1;
      while (k <= j) {
        j -= k;
        k >>= 1;
      }
      j += k;
    }
    for (let len = 2; len <= M; len <<= 1) {
      const half = len >> 1;
      const ang = ((invert ? 2 : -2) * Math.PI) / len;
      const wStepR = Math.cos(ang);
      const wStepI = Math.sin(ang);
      for (let i = 0; i < M; i += len) {
        let wr = 1;
        let wi = 0;
        for (let k = 0; k < half; k++) {
          const idx1 = i + k;
          const idx2 = i + k + half;
          const tr = wr * real[idx2] - wi * imag[idx2];
          const ti = wr * imag[idx2] + wi * real[idx2];
          real[idx2] = real[idx1] - tr;
          imag[idx2] = imag[idx1] - ti;
          real[idx1] += tr;
          imag[idx1] += ti;
          const nwr = wr * wStepR - wi * wStepI;
          wi = wr * wStepI + wi * wStepR;
          wr = nwr;
        }
      }
    }
    if (invert) {
      for (let i = 0; i < M; i++) {
        real[i] /= M;
        imag[i] /= M;
      }
    }
  };
  fft(re, im, false);
  const bwSafe = Math.max(400, bandwidthHz);
  const f0 = Math.max(300, fCenterHz);
  for (let k = 0; k < M; k++) {
    const f = k <= M / 2 ? (k * fs) / M : ((M - k) * fs) / M;
    const x = f > 1 ? (f * f - f0 * f0) / (f * bwSafe) : 1e6;
    const mag = gain / Math.sqrt(1 + x * x);
    re[k] *= mag;
    im[k] *= mag;
  }
  fft(re, im, true);
  return Array.from(re.subarray(0, N));
}

export interface CircuitComponentValues {
  // FDM
  fdmR1K: number;
  fdmR2K: number;
  fdmR3K: number;
  fdmRfK: number;
  fdmC1nF: number;
  fdmC2nF: number;
  fdmC3nF: number;
  fdmCoutUf: number;
  fdmLrxUh: number;
  fdmCvarScale: number; // 0.5 .. 1.8 multiplier around tuned fc

  // DSB-FC (AM)
  amTxRsOhm: number;
  amTxVbbV: number;
  amTxR1K: number;
  amTxRfK: number;
  amTxLtUh: number;
  amTxCtPf: number;
  amTxRlK: number;
  amRxRsOhm: number;
  amRxCUf: number;
  amRxRlK: number;
  amRxCcUf: number;
  amRxRbK: number;
  amRxOutRlK: number;

  // DSB-SC
  dsbTxRsOhm: number;
  dsbTxR1K: number;
  dsbTxR2K: number;
  dsbTxLfUh: number;
  dsbTxCfPf: number;
  dsbTxRlOhm: number;
  dsbCostasRiK: number;
  dsbCostasCiNf: number;
  dsbCostasRqK: number;
  dsbCostasCqNf: number;
  dsbCostasRloopK: number;

  // SSB
  ssbTxChNf: number;
  ssbTxRhK: number;
  ssbTxR2K: number;
  ssbTxR3K: number;
  ssbTxCp1Pf: number;
  ssbTxCp2Pf: number;
  ssbTxRlOhm: number;

  // VSB
  vsbRsOhm: number;
  vsbC1Pf: number;
  vsbL1Uh: number;
  vsbL2Uh: number;
  vsbC2Pf: number;
  vsbC3Pf: number;
  vsbRfK: number;
  vsbCfPf: number;
  vsbL3Uh: number;
  vsbC4Pf: number;
  vsbCoutUf: number;
  vsbRlOhm: number;

  // Shared Sallen-Key Coherent Demodulator Active LPF
  skR1K: number;
  skR2K: number;
  skCfNf: number;
  skC2Nf: number;
  skCoutUf: number;
  skRlK: number;
}

export const DEFAULT_CIRCUIT_VALUES: CircuitComponentValues = {
  fdmR1K: 10,
  fdmR2K: 10,
  fdmR3K: 10,
  fdmRfK: 10,
  fdmC1nF: 100,
  fdmC2nF: 100,
  fdmC3nF: 100,
  fdmCoutUf: 0.1,
  fdmLrxUh: 100,
  fdmCvarScale: 1.0,

  amTxRsOhm: 50,
  amTxVbbV: 0.7,
  amTxR1K: 10,
  amTxRfK: 10,
  amTxLtUh: 22,
  amTxCtPf: 220,
  amTxRlK: 1.0,
  amRxRsOhm: 100,
  amRxCUf: 0.35,
  amRxRlK: 1.0,
  amRxCcUf: 10,
  amRxRbK: 10,
  amRxOutRlK: 1.0,

  dsbTxRsOhm: 600,
  dsbTxR1K: 1.0,
  dsbTxR2K: 1.0,
  dsbTxLfUh: 12,
  dsbTxCfPf: 220,
  dsbTxRlOhm: 50,
  dsbCostasRiK: 1.5,
  dsbCostasCiNf: 100,
  dsbCostasRqK: 1.5,
  dsbCostasCqNf: 100,
  dsbCostasRloopK: 2.2,

  ssbTxChNf: 15,
  ssbTxRhK: 10,
  ssbTxR2K: 10,
  ssbTxR3K: 10,
  ssbTxCp1Pf: 120,
  ssbTxCp2Pf: 120,
  ssbTxRlOhm: 50,

  vsbRsOhm: 50,
  vsbC1Pf: 150,
  vsbL1Uh: 12,
  vsbL2Uh: 8.2,
  vsbC2Pf: 220,
  vsbC3Pf: 47,
  vsbRfK: 1.0,
  vsbCfPf: 33,
  vsbL3Uh: 15,
  vsbC4Pf: 180,
  vsbCoutUf: 0.1,
  vsbRlOhm: 75,

  skR1K: 2.2,
  skR2K: 2.2,
  skCfNf: 33,
  skC2Nf: 15,
  skCoutUf: 10,
  skRlK: 1.0,
};

export function computeSallenKeyCutoffHz(cv: CircuitComponentValues): number {
  const r1 = Math.max(100, cv.skR1K * 1000);
  const r2 = Math.max(100, cv.skR2K * 1000);
  const c1 = Math.max(0.5e-9, cv.skCfNf * 1e-9);
  const c2 = Math.max(0.5e-9, cv.skC2Nf * 1e-9);
  return 1 / (2 * Math.PI * Math.sqrt(r1 * r2 * c1 * c2));
}

// ---------------------------------------------------------------------------
// 0. REAL-WORLD LOW-FREQUENCY SIGNALS
// ---------------------------------------------------------------------------

export function simulateRealWorldSignal(kind: 'voice' | 'sensor', timeOffset: number) {
  if (kind === 'voice') {
    // 50 ms telephone-band speech-like waveform (300 - 3400 Hz)
    const fs = 16000;
    const N = 1024; // 64 ms -> 50 ms display (800 samples)
    const t = new Array<number>(N);
    const samples = new Array<number>(N);
    const voiceFreqs = [340, 520, 780, 1120, 1490, 1950, 2420, 2950, 3300];
    const voiceAmps = [0.42, 0.55, 0.48, 0.38, 0.32, 0.25, 0.21, 0.16, 0.12];

    for (let n = 0; n < N; n++) {
      const time = n / fs;
      t[n] = time;
      const wt = time + timeOffset * 4;
      // Syllabic amplitude envelope modulation (~40 Hz & ~80 Hz)
      const env = 0.65 + 0.35 * Math.sin(2 * Math.PI * 55 * wt + 0.4);
      let s = 0;
      for (let k = 0; k < voiceFreqs.length; k++) {
        s += voiceAmps[k] * Math.sin(2 * Math.PI * voiceFreqs[k] * wt + k * 1.3);
      }
      samples[n] = s * env;
    }
    const spectrum = computeFFT(samples, fs, 'hanning');
    return {
      t: t.slice(0, 800), // 50 ms
      samples: samples.slice(0, 800),
      spectrum,
      xLabel: 'Time (ms)',
      xMult: 1000,
      maxFreqHz: 8000,
      bandDesc: '300–3400 Hz (Audio / Telephone Band)',
    };
  } else {
    // Slow-varying sensor measurement with drift & steps (< 1 Hz) over 20 s
    const fs = 16; // 16 Hz sample rate -> 512 samples = 32 s (display 20 s = 320 samples)
    const N = 512;
    const t = new Array<number>(N);
    const samples = new Array<number>(N);
    for (let n = 0; n < N; n++) {
      const time = n / fs;
      t[n] = time;
      const wt = time + timeOffset * 800;
      const drift = 0.28 + 0.18 * Math.sin(2 * Math.PI * 0.2 * wt) + 0.12 * Math.sin(2 * Math.PI * 0.05 * wt);
      const step = wt % 20 > 8 && wt % 20 < 15 ? 0.15 : 0;
      const ripple = 0.03 * Math.sin(2 * Math.PI * 1.4 * wt);
      samples[n] = drift + step + ripple;
    }
    const spectrum = computeFFT(samples, fs, 'hanning');
    return {
      t: t.slice(0, 320), // 20 s
      samples: samples.slice(0, 320),
      spectrum,
      xLabel: 'Time (s)',
      xMult: 1,
      maxFreqHz: 2.0,
      bandDesc: '< 1 Hz (Sub-Hz Sensor Drift)',
    };
  }
}

// ---------------------------------------------------------------------------
// 1. MOTIVATION: SPECTRUM SHIFTING & FDM MULTIPLEXING + TUNING DIAL
// ---------------------------------------------------------------------------

export interface FDMChannelConfig {
  id: number;
  label: string;
  enabled: boolean;
  fc: number;
  fm: number;
  Am: number;
  color: string;
}

export function simulateFDM(params: {
  channels: FDMChannelConfig[];
  tunedChannelId: number;
  timeOffset: number;
  circuit?: CircuitComponentValues;
}) {
  const { channels, tunedChannelId, timeOffset, circuit = DEFAULT_CIRCUIT_VALUES } = params;
  const fs = SIM_FS;
  const N = FFT_SAMPLES;
  const PRE = PRE_SAMPLES;
  const TOTAL = PRE + N;

  const tFull = new Array<number>(TOTAL);
  const composite = new Array<number>(TOTAL).fill(0);
  const basebandSum = new Array<number>(TOTAL).fill(0);
  const perChannelMod: Record<number, number[]> = {};
  const perChannelBase: Record<number, number[]> = {};

  channels.forEach((ch) => {
    perChannelMod[ch.id] = new Array<number>(TOTAL).fill(0);
    perChannelBase[ch.id] = new Array<number>(TOTAL).fill(0);
  });

  const rList = [circuit.fdmR1K, circuit.fdmR2K, circuit.fdmR3K];
  const cList = [circuit.fdmC1nF, circuit.fdmC2nF, circuit.fdmC3nF];
  const rfK = Math.max(0.5, circuit.fdmRfK);
  const hpCoutFactor = Math.min(1, 1 / Math.sqrt(1 + Math.pow(3000 / Math.max(50, circuit.fdmCoutUf * 1e5), 2)));

  for (let n = 0; n < TOTAL; n++) {
    const time = (n - PRE) / fs;
    tFull[n] = time;
    const wt = time + timeOffset;

    for (let idx = 0; idx < channels.length; idx++) {
      const ch = channels[idx];
      if (!ch.enabled) continue;
      const rk = Math.max(0.5, rList[idx] ?? 10);
      const ckNf = Math.max(1, cList[idx] ?? 100);
      // Baseband RC coupling HPF attenuation at f_m
      const fCorner = 1 / (2 * Math.PI * (rk * 1000) * (ckNf * 1e-9));
      const hpGain = ch.fm / Math.sqrt(ch.fm * ch.fm + fCorner * fCorner);
      const sumGain = (rfK / rk) * hpGain * hpCoutFactor;

      const m =
        ch.id === 1
          ? ch.Am * Math.cos(2 * Math.PI * ch.fm * wt)
          : ch.id === 2
          ? ch.Am * (0.7 * Math.cos(2 * Math.PI * ch.fm * wt) + 0.3 * Math.cos(2 * Math.PI * (ch.fm * 0.6) * wt))
          : ch.Am * Math.cos(2 * Math.PI * ch.fm * wt + 0.6);

      const s = m * sumGain * Math.cos(2 * Math.PI * ch.fc * wt);
      perChannelBase[ch.id][n] = m;
      perChannelMod[ch.id][n] = s;
      basebandSum[n] += m;
      composite[n] += s;
    }
  }

  // Receiver Tuning Dial: Tunable L_rx/C_var tank -> Coherent mixer -> Sallen-Key LPF
  const tuned = channels.find((c) => c.id === tunedChannelId && c.enabled) || channels[0];
  const lRatio = Math.max(0.2, circuit.fdmLrxUh / 100);
  const cRatio = Math.max(0.2, circuit.fdmCvarScale);
  const rxTankCenter = tuned.fc / Math.sqrt(lRatio * cRatio);
  const rxTankBw = Math.max(1200, tuned.fm * 2.8);
  const bpFiltered = rlcTankFilterFFT(composite, fs, rxTankCenter, rxTankBw, 1.0);

  const rxMixed = new Array<number>(TOTAL);
  const tunedCarrier = new Array<number>(TOTAL);
  for (let n = 0; n < TOTAL; n++) {
    const wt = tFull[n] + timeOffset;
    const cTuned = Math.cos(2 * Math.PI * tuned.fc * wt);
    tunedCarrier[n] = tuned.Am * cTuned;
    rxMixed[n] = bpFiltered[n] * 2 * cTuned;
  }
  const skCutHz = computeSallenKeyCutoffHz(circuit);
  const lpfOut = sallenKeyBiquadLPF(rxMixed, skCutHz, fs, 0.707);
  const rxRecovered = rcHighPassFilter(lpfOut, circuit.skRlK * 1000, circuit.skCoutUf * 1e-6, fs);

  // Detect overlaps
  const active = channels.filter((c) => c.enabled);
  const overlaps: string[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (a.fc - a.fm <= b.fc + b.fm && b.fc - b.fm <= a.fc + a.fm) {
        overlaps.push(`${a.label} & ${b.label}`);
      }
    }
  }

  const basebandSpectrum = computeFFT(basebandSum.slice(PRE, PRE + N), fs, 'hanning');
  const passbandSpectrum = computeFFT(composite.slice(PRE, PRE + N), fs, 'hanning');

  return {
    t: tFull.slice(PRE, PRE + SCOPE_SAMPLES),
    basebandSum: basebandSum.slice(PRE, PRE + SCOPE_SAMPLES),
    composite: composite.slice(PRE, PRE + SCOPE_SAMPLES),
    rxRecovered: rxRecovered.slice(PRE, PRE + SCOPE_SAMPLES),
    longT: tFull.slice(PRE, PRE + PROBE_SAMPLES),
    longMessage: (perChannelBase[tuned.id] || basebandSum).slice(PRE, PRE + PROBE_SAMPLES),
    longModulated: composite.slice(PRE, PRE + PROBE_SAMPLES),
    longDemodulated: rxRecovered.slice(PRE, PRE + PROBE_SAMPLES),
    tunedCarrier: tunedCarrier.slice(PRE, PRE + SCOPE_SAMPLES),
    tunedChannelId: tuned.id,
    tunedAm: tuned.Am,
    tunedLabel: tuned.label,
    perChannelBase: Object.fromEntries(
      Object.entries(perChannelBase).map(([k, v]) => [k, v.slice(PRE, PRE + SCOPE_SAMPLES)])
    ),
    perChannelMod: Object.fromEntries(
      Object.entries(perChannelMod).map(([k, v]) => [k, v.slice(PRE, PRE + SCOPE_SAMPLES)])
    ),
    basebandSpectrum,
    passbandSpectrum,
    overlaps,
  };
}

export function getRadioBandInfo(fcHz: number): { band: string; useCase: string } {
  if (fcHz < 3e4) return { band: 'VLF (3–30 kHz)', useCase: 'Maritime / Navigation' };
  if (fcHz < 3e5) return { band: 'LF (30–300 kHz)', useCase: 'Maritime / Beacons' };
  if (fcHz < 3e6) return { band: 'MF (300 kHz–3 MHz)', useCase: 'AM Radio Broadcast' };
  if (fcHz < 3e7) return { band: 'HF (3–30 MHz)', useCase: 'Shortwave / CB / Amateur' };
  if (fcHz < 3e8) return { band: 'VHF (30–300 MHz)', useCase: 'FM Radio / VHF TV' };
  if (fcHz < 3e9) return { band: 'UHF (300 MHz–3 GHz)', useCase: 'Mobile / Wi-Fi / GPS' };
  if (fcHz < 3e10) return { band: 'SHF (3–30 GHz)', useCase: 'Satellite / Wi-Fi' };
  return { band: 'EHF (30–300 GHz)', useCase: 'Radio Astronomy / mmWave' };
}

export function computeAntennaAndChannelData(
  fcHz: number,
  medium: 'twisted-pair' | 'coax' | 'waveguide' | 'atmosphere'
) {
  const c = 3e8;
  const quarterWaveMeters = c / (4 * Math.max(1, fcHz));
  const bandInfo = getRadioBandInfo(fcHz);

  const antennaCurve: { freqHz: number; lengthM: number }[] = [];
  for (let exp = 3; exp <= 9; exp += 0.15) {
    const f = Math.pow(10, exp);
    antennaCurve.push({ freqHz: f, lengthM: c / (4 * f) });
  }

  const channelCurve: { freqHz: number; magDb: number }[] = [];
  if (medium === 'twisted-pair') {
    for (let exp = 2; exp <= 7; exp += 0.1) {
      const f = Math.pow(10, exp);
      const lossDb = -10 * Math.pow(f / 5e3, 0.72);
      channelCurve.push({ freqHz: f, magDb: Math.max(-350, lossDb) });
    }
  } else if (medium === 'coax') {
    for (let exp = 5; exp <= 10; exp += 0.1) {
      const f = Math.pow(10, exp);
      const lossDb = -2.2 * Math.sqrt(f / 1e5);
      channelCurve.push({ freqHz: f, magDb: Math.max(-350, lossDb) });
    }
  } else if (medium === 'waveguide') {
    const cutoff = 6.56e9;
    for (let exp = 8; exp <= 11; exp += 0.05) {
      const f = Math.pow(10, exp);
      const gainDb = f < cutoff ? -160 : -12 * Math.exp(-(f - cutoff) / 8e8);
      channelCurve.push({ freqHz: f, magDb: gainDb });
    }
  } else {
    for (let exp = 8; exp <= 12; exp += 0.04) {
      const f = Math.pow(10, exp);
      const fGHz = f / 1e9;
      const h2o1 = 5.0 * Math.exp(-Math.pow((fGHz - 22.2) / 4.5, 2));
      const o2 = 15.0 * Math.exp(-Math.pow((fGHz - 60.0) / 7.5, 2));
      const h2o2 = 20.0 * Math.exp(-Math.pow((fGHz - 183.3) / 18.0, 2));
      channelCurve.push({ freqHz: f, magDb: h2o1 + o2 + h2o2 });
    }
  }

  return { quarterWaveMeters, antennaCurve, channelCurve, bandInfo };
}

// ---------------------------------------------------------------------------
// 2. CONVENTIONAL AM + ENVELOPE DETECTOR + AUTHENTIC SQUARE-LAW MODULATOR
// ---------------------------------------------------------------------------

export function simulateConventionalAMLab(params: {
  Ac: number;
  fc: number;
  fm: number;
  mu: number;
  messageShape: MessageShape;
  rcTimeMs: number;
  modulatorMode: 'linear' | 'square-law';
  timeOffset: number;
  circuit?: CircuitComponentValues;
}) {
  const {
    Ac,
    fc,
    fm,
    mu,
    messageShape,
    rcTimeMs,
    modulatorMode,
    timeOffset,
    circuit = DEFAULT_CIRCUIT_VALUES,
  } = params;
  const fs = SIM_FS;
  const N = FFT_SAMPLES;
  const PRE = PRE_SAMPLES;
  const TOTAL = PRE + N;
  const dt = 1 / fs;

  // Circuit-driven effective modulation index & RC envelope time constant
  const biasAmpGain = Math.max(0.1, circuit.amTxRfK / Math.max(0.5, circuit.amTxR1K));
  const sqVbbFactor = 0.7 / Math.max(0.25, circuit.amTxVbbV);
  const effectiveMu =
    modulatorMode === 'linear' ? mu * biasAmpGain : mu * sqVbbFactor;

  const tankDefaultL = 22;
  const lRatio = Math.max(0.2, circuit.amTxLtUh / tankDefaultL);
  const cRatio = Math.max(0.2, circuit.amTxCtPf / 220);
  const tankResHz = fc / Math.sqrt(lRatio * cRatio);
  const tankLoadRatio = circuit.amTxRlK / 1.0;

  const rcSec = Math.max(0.00002, rcTimeMs / 1000);
  const chargeTau = Math.max(1e-7, Math.max(1, circuit.amRxRsOhm) * (circuit.amRxCUf * 1e-6));
  const chargeAlpha = Math.min(1, dt / (chargeTau + dt));

  const tFull = new Array<number>(TOTAL);
  const message = new Array<number>(TOTAL);
  const carrier = new Array<number>(TOTAL);
  let modulated = new Array<number>(TOTAL);
  const upperEnv = new Array<number>(TOTAL);
  const lowerEnv = new Array<number>(TOTAL);
  const rectified = new Array<number>(TOTAL);
  const rcDetected = new Array<number>(TOTAL);
  const squareLawRaw = new Array<number>(TOTAL);

  const maxFm = messageShape === 'two-tone' ? fm * 2.2 : fm;

  for (let n = 0; n < TOTAL; n++) {
    const time = (n - PRE) / fs;
    tFull[n] = time;
    const wt = time + timeOffset;
    const mNorm = evalMessage(messageShape, fm, 1, wt);
    message[n] = mNorm * Ac * effectiveMu;

    const c = Math.cos(2 * Math.PI * fc * wt);
    carrier[n] = Ac * c;

    if (modulatorMode === 'linear') {
      const env = Ac * (1 + effectiveMu * mNorm);
      modulated[n] = env * c;
    } else {
      const srcAtten = 1000 / (1000 + Math.max(0, circuit.amTxRsOhm - 50));
      const a1 = 1.0 * srcAtten;
      const a2 = effectiveMu / (2 * Math.max(0.5, Ac));
      const mVolts = mNorm * Ac;
      const v1 = Ac * c + mVolts;
      squareLawRaw[n] = a1 * v1 + a2 * v1 * v1;
    }

    const env = Ac * (1 + effectiveMu * mNorm);
    upperEnv[n] = Math.abs(env);
    lowerEnv[n] = -Math.abs(env);
  }

  // Apply realistic tank LC tuning if user adjusted Lt, Ct, or RL away from default (or in square-law mode)
  const isTankDetuned =
    Math.abs(lRatio - 1) > 0.02 || Math.abs(cRatio - 1) > 0.02 || Math.abs(tankLoadRatio - 1) > 0.02;
  if (modulatorMode === 'square-law') {
    const fBand = Math.max(maxFm * 2.4, 2400) / Math.sqrt(Math.max(0.3, tankLoadRatio));
    modulated = rlcTankFilterFFT(squareLawRaw, fs, tankResHz, fBand, 1.0);
  } else if (isTankDetuned) {
    const fBand = Math.max(maxFm * 2.8, 3000) / Math.sqrt(Math.max(0.3, tankLoadRatio));
    modulated = rlcTankFilterFFT(modulated, fs, tankResHz, fBand, 1.0);
  }

  for (let n = 0; n < TOTAL; n++) {
    rectified[n] = Math.max(0, modulated[n]);
  }

  // Physical Diode + RC Capacitor Envelope Detector
  const decayFactor = Math.exp(-dt / rcSec);
  const extraWarmup = Math.min(4000, Math.max(0, Math.ceil(rcSec * 6 * fs) - PRE));
  const warmStartTime = (-PRE - extraWarmup) / fs + timeOffset;
  let vCap = Math.max(0, Ac * (1 + effectiveMu * evalMessage(messageShape, fm, 1, warmStartTime)));

  for (let w = -PRE - extraWarmup; w < -PRE; w++) {
    const wtWarm = w / fs + timeOffset;
    const sWarm =
      Ac *
      (1 + effectiveMu * evalMessage(messageShape, fm, 1, wtWarm)) *
      Math.cos(2 * Math.PI * fc * wtWarm);
    if (sWarm > vCap) vCap += chargeAlpha * (sWarm - vCap);
    else vCap *= decayFactor;
  }

  for (let n = 0; n < TOTAL; n++) {
    if (modulated[n] > vCap) {
      vCap += chargeAlpha * (modulated[n] - vCap);
    } else {
      vCap *= decayFactor;
    }
    rcDetected[n] = vCap;
  }

  // AC-coupled recovered message through Cc & Rb -> Op-Amp Buffer -> R_L
  const rcMean = hannWeightedMean(rcDetected, PRE, N);
  const rcCentered = rcDetected.map((v) => v - rcMean);
  const rcDemodAC = rcHighPassFilter(
    rcCentered,
    Math.max(200, circuit.amRxRbK * 1000),
    Math.max(0.05e-6, circuit.amRxCcUf * 1e-6),
    fs
  );

  const Amax = Ac * (1 + effectiveMu);
  const Amin = Ac * Math.abs(1 - effectiveMu);
  const Pc = (Ac * Ac) / 2;
  const Pusb = (effectiveMu * effectiveMu * Ac * Ac) / 8;
  const Plsb = Pusb;
  const Psb = Pusb + Plsb;
  const Pt = Pc + Psb;
  const efficiencyPct = (Psb / Pt) * 100;
  const bandwidthHz = 2 * maxFm;

  const spectrum = computeFFT(
    (modulatorMode === 'square-law' ? squareLawRaw : modulated).slice(PRE, PRE + N),
    fs,
    'hanning'
  );
  const amFilteredSpectrum = computeFFT(modulated.slice(PRE, PRE + N), fs, 'hanning');

  const rcMinIdealMs = (1 / (2 * Math.PI * fc)) * 1000;
  const rcMaxIdealMs = (1 / (2 * Math.PI * fm)) * 1000;

  return {
    t: tFull.slice(PRE, PRE + SCOPE_SAMPLES),
    message: message.slice(PRE, PRE + SCOPE_SAMPLES),
    carrier: carrier.slice(PRE, PRE + SCOPE_SAMPLES),
    modulated: modulated.slice(PRE, PRE + SCOPE_SAMPLES),
    upperEnv: upperEnv.slice(PRE, PRE + SCOPE_SAMPLES),
    lowerEnv: lowerEnv.slice(PRE, PRE + SCOPE_SAMPLES),
    rectified: rectified.slice(PRE, PRE + SCOPE_SAMPLES),
    rcDetected: rcDetected.slice(PRE, PRE + SCOPE_SAMPLES),
    rcDemodAC: rcDemodAC.slice(PRE, PRE + SCOPE_SAMPLES),
    longT: tFull.slice(PRE, PRE + PROBE_SAMPLES),
    longMessage: message.slice(PRE, PRE + PROBE_SAMPLES),
    longModulated: modulated.slice(PRE, PRE + PROBE_SAMPLES),
    longDemodulated: rcDemodAC.slice(PRE, PRE + PROBE_SAMPLES),
    squareLawRaw: squareLawRaw.slice(PRE, PRE + SCOPE_SAMPLES),
    spectrum,
    amFilteredSpectrum,
    Amax,
    Amin,
    Pc,
    Pusb,
    Plsb,
    Psb,
    Pt,
    efficiencyPct,
    bandwidthHz,
    rcMinIdealMs,
    rcMaxIdealMs,
    isOvermodulated: effectiveMu > 1.001,
    effectiveMu,
  };
}

// ---------------------------------------------------------------------------
// 3. DSB-SC & COHERENT DETECTION / COSTAS LOOP / RING MODULATOR
// ---------------------------------------------------------------------------

export function simulateDSBSCLab(params: {
  Ac: number;
  fc: number;
  fm: number;
  Am: number;
  messageShape: MessageShape;
  modulatorTopology?: 'product' | 'ring';
  ringFiltered?: boolean;
  receiverMode: 'coherent' | 'costas';
  loPhaseErrorDeg: number;
  loFreqOffsetHz: number;
  costasInitialPhaseDeg: number;
  costasLoopGain: number;
  timeOffset: number;
  circuit?: CircuitComponentValues;
}) {
  const {
    Ac,
    fc,
    fm,
    Am,
    messageShape,
    modulatorTopology = 'product',
    ringFiltered = true,
    receiverMode,
    loPhaseErrorDeg,
    loFreqOffsetHz,
    costasInitialPhaseDeg,
    costasLoopGain,
    timeOffset,
    circuit = DEFAULT_CIRCUIT_VALUES,
  } = params;
  const fs = SIM_FS;
  const N = FFT_SAMPLES;
  const PRE = PRE_SAMPLES;
  const TOTAL = PRE + N;
  const dt = 1 / fs;

  const tFull = new Array<number>(TOTAL);
  const message = new Array<number>(TOTAL);
  const carrier = new Array<number>(TOTAL);
  const rawRingWave = new Array<number>(TOTAL);
  let modulated = new Array<number>(TOTAL);
  const upperEnv = new Array<number>(TOTAL);
  const lowerEnv = new Array<number>(TOTAL);

  const iArmMixed = new Array<number>(TOTAL);
  const qArmMixed = new Array<number>(TOTAL);
  const phiTraceDeg = new Array<number>(N);

  const maxFm = messageShape === 'two-tone' ? fm * 2.2 : fm;

  // Balanced diode arm resistor mismatch creates carrier leakage; Rs + RL scale divider
  const rSum = Math.max(0.2, circuit.dsbTxR1K + circuit.dsbTxR2K);
  const carrierLeakage = (circuit.dsbTxR1K - circuit.dsbTxR2K) / rSum;
  const loadAtten = (circuit.dsbTxRlOhm / 50) * (600 / Math.max(100, circuit.dsbTxRsOhm));
  const ampScale = Math.min(1.8, Math.max(0.2, loadAtten));

  for (let n = 0; n < TOTAL; n++) {
    const time = (n - PRE) / fs;
    tFull[n] = time;
    const wt = time + timeOffset;
    const m = evalMessage(messageShape, fm, Am, wt);
    const c = Ac * Math.cos(2 * Math.PI * fc * wt);
    message[n] = m;
    carrier[n] = c;

    if (modulatorTopology === 'ring') {
      const sqCarrier = Math.cos(2 * Math.PI * fc * wt) >= 0 ? 1 : -1;
      rawRingWave[n] = Ac * m * ampScale * sqCarrier;
    } else {
      modulated[n] = (m + carrierLeakage * Ac * 0.9) * c * ampScale;
    }

    upperEnv[n] = Ac * m * ampScale;
    lowerEnv[n] = -Ac * m * ampScale;
  }

  const lRatio = Math.max(0.2, circuit.dsbTxLfUh / 12);
  const cRatio = Math.max(0.2, circuit.dsbTxCfPf / (modulatorTopology === 'ring' ? 220 : 150));
  const tankResHz = fc / Math.sqrt(lRatio * cRatio);
  const tankDetuned = Math.abs(lRatio - 1) > 0.02 || Math.abs(cRatio - 1) > 0.02;

  if (modulatorTopology === 'ring') {
    if (ringFiltered) {
      const fBand = Math.max(maxFm * 2.4, 2400);
      modulated = rlcTankFilterFFT(rawRingWave, fs, tankResHz, fBand, 1.0);
    } else {
      modulated = rawRingWave.slice();
    }
  } else if (tankDetuned) {
    const fBand = Math.max(maxFm * 2.8, 2800);
    modulated = rlcTankFilterFFT(modulated, fs, tankResHz, fBand, 1.0);
  }

  let demodI: number[] = [];
  let demodQ: number[] = [];
  let longDemodI: number[] = [];

  if (receiverMode === 'coherent') {
    const phiRad = (loPhaseErrorDeg * Math.PI) / 180;
    for (let n = 0; n < TOTAL; n++) {
      const wt = tFull[n] + timeOffset;
      const loCos = 2 * Math.cos(2 * Math.PI * (fc + loFreqOffsetHz) * wt + phiRad);
      const loSin = 2 * Math.sin(2 * Math.PI * (fc + loFreqOffsetHz) * wt + phiRad);
      iArmMixed[n] = (modulated[n] * loCos) / Math.max(0.1, Ac);
      qArmMixed[n] = (modulated[n] * loSin) / Math.max(0.1, Ac);
    }
    const skCut = computeSallenKeyCutoffHz(circuit);
    const lpfI = sallenKeyBiquadLPF(iArmMixed, skCut, fs, 0.707);
    const lpfQ = sallenKeyBiquadLPF(qArmMixed, skCut, fs, 0.707);
    const filtI = rcHighPassFilter(lpfI, circuit.skRlK * 1000, circuit.skCoutUf * 1e-6, fs);
    const filtQ = rcHighPassFilter(lpfQ, circuit.skRlK * 1000, circuit.skCoutUf * 1e-6, fs);
    demodI = filtI.slice(PRE, PRE + SCOPE_SAMPLES);
    demodQ = filtQ.slice(PRE, PRE + SCOPE_SAMPLES);
    longDemodI = filtI.slice(PRE, PRE + PROBE_SAMPLES);
    for (let n = 0; n < N; n++) phiTraceDeg[n] = loPhaseErrorDeg;
  } else {
    let phi = (costasInitialPhaseDeg * Math.PI) / 180;
    const iCut = 1 / (2 * Math.PI * Math.max(100, circuit.dsbCostasRiK * 1000) * Math.max(1e-9, circuit.dsbCostasCiNf * 1e-9));
    const qCut = 1 / (2 * Math.PI * Math.max(100, circuit.dsbCostasRqK * 1000) * Math.max(1e-9, circuit.dsbCostasCqNf * 1e-9));
    const iAlpha = dt / (1 / (2 * Math.PI * Math.max(150, iCut)) + dt);
    const qAlpha = dt / (1 / (2 * Math.PI * Math.max(150, qCut)) + dt);
    const effectiveLoopGain = costasLoopGain * (2.2 / Math.max(0.2, circuit.dsbCostasRloopK));

    let iF1 = 0;
    let iF2 = 0;
    let qF1 = 0;
    let qF2 = 0;

    const iOut = new Array<number>(PROBE_SAMPLES);
    const qOut = new Array<number>(SCOPE_SAMPLES);

    for (let n = 0; n < TOTAL; n++) {
      const wt = tFull[n] + timeOffset;
      const s = modulated[n];

      const iMix = (2 / Math.max(0.1, Ac)) * s * Math.cos(2 * Math.PI * fc * wt + phi);
      const qMix = (2 / Math.max(0.1, Ac)) * s * Math.sin(2 * Math.PI * fc * wt + phi);

      iF1 += iAlpha * (iMix - iF1);
      iF2 += iAlpha * (iF1 - iF2);
      qF1 += qAlpha * (qMix - qF1);
      qF2 += qAlpha * (qF1 - qF2);

      if (n >= PRE) {
        const idx = n - PRE;
        if (idx < PROBE_SAMPLES) {
          iOut[idx] = iF2;
        }
        if (idx < SCOPE_SAMPLES) {
          qOut[idx] = qF2;
        }
        const errorSignal = iF2 * qF2;
        phi -= effectiveLoopGain * 140 * errorSignal * dt;

        if (phi > Math.PI) phi -= 2 * Math.PI;
        if (phi < -Math.PI) phi += 2 * Math.PI;

        phiTraceDeg[idx] = (phi * 180) / Math.PI;
      }
    }
    demodI = iOut.slice(0, SCOPE_SAMPLES);
    longDemodI = iOut;
    demodQ = qOut;
  }

  const spectrum = computeFFT(modulated.slice(PRE, PRE + N), fs, 'hanning');
  const bandwidthHz = 2 * maxFm;
  const Pt = (Ac * Ac * (Am * Am / 2)) / 2;

  return {
    t: tFull.slice(PRE, PRE + SCOPE_SAMPLES),
    tFull: tFull.slice(PRE, PRE + N),
    message: message.slice(PRE, PRE + SCOPE_SAMPLES),
    carrier: carrier.slice(PRE, PRE + SCOPE_SAMPLES),
    modulated: modulated.slice(PRE, PRE + SCOPE_SAMPLES),
    upperEnv: upperEnv.slice(PRE, PRE + SCOPE_SAMPLES),
    lowerEnv: lowerEnv.slice(PRE, PRE + SCOPE_SAMPLES),
    demodI,
    demodQ,
    longT: tFull.slice(PRE, PRE + PROBE_SAMPLES),
    longMessage: message.slice(PRE, PRE + PROBE_SAMPLES),
    longModulated: modulated.slice(PRE, PRE + PROBE_SAMPLES),
    longDemodulated: longDemodI,
    phiTraceDeg,
    finalPhaseDeg: phiTraceDeg[phiTraceDeg.length - 1],
    spectrum,
    bandwidthHz,
    Pt,
    gainFactor: Math.cos((loPhaseErrorDeg * Math.PI) / 180),
  };
}

// ---------------------------------------------------------------------------
// 4. SINGLE-SIDEBAND (SSB) MODULATION
// ---------------------------------------------------------------------------

export function simulateSSBLab(params: {
  Ac: number;
  fc: number;
  fm: number;
  Am: number;
  sideband: 'USB' | 'LSB';
  method: 'phase' | 'frequency';
  messageShape: MessageShape;
  filterOrder: number;
  energyGapHz: number;
  loPhaseErrorDeg: number;
  timeOffset: number;
  circuit?: CircuitComponentValues;
}) {
  const {
    Ac,
    fc,
    fm,
    Am,
    sideband,
    method,
    messageShape,
    filterOrder,
    energyGapHz,
    loPhaseErrorDeg,
    timeOffset,
    circuit = DEFAULT_CIRCUIT_VALUES,
  } = params;
  const fs = SIM_FS;
  const N = FFT_SAMPLES;
  const PRE = PRE_SAMPLES;
  const TOTAL = PRE + N;

  const tFull = new Array<number>(TOTAL);
  const message = new Array<number>(TOTAL);
  const messageHilbert = new Array<number>(TOTAL);
  const carrier = new Array<number>(TOTAL);
  const modulated = new Array<number>(TOTAL);

  const fLowComponent = Math.max(200, fm + energyGapHz);
  const fHighComponent = fm * 2.2 + energyGapHz;

  // Phase-method RC all-pass accuracy & summing arm balance
  const rcNom = 10 * 15; // 10k * 15nF
  const rcVal = Math.max(5, circuit.ssbTxRhK * circuit.ssbTxChNf);
  const hilbertPhaseErrRad = ((rcVal - rcNom) / rcNom) * 0.65;
  const qArmGain = Math.max(0.1, circuit.ssbTxR2K / Math.max(0.5, circuit.ssbTxR3K));

  // Crystal ladder Cp shunt adjustment & load scaling
  const cpRatio = (circuit.ssbTxCp1Pf + circuit.ssbTxCp2Pf) / 240;
  const rlScale = Math.min(1.6, Math.max(0.2, circuit.ssbTxRlOhm / 50));

  for (let n = 0; n < TOTAL; n++) {
    const time = (n - PRE) / fs;
    tFull[n] = time;
    const wt = time + timeOffset;

    const m =
      messageShape === 'two-tone'
        ? Am * (0.69 * Math.cos(2 * Math.PI * fLowComponent * wt) + 0.31 * Math.cos(2 * Math.PI * fHighComponent * wt))
        : Am * Math.cos(2 * Math.PI * fLowComponent * wt);

    const mHat =
      messageShape === 'two-tone'
        ? Am * (0.69 * Math.sin(2 * Math.PI * fLowComponent * wt) + 0.31 * Math.sin(2 * Math.PI * fHighComponent * wt))
        : Am * Math.sin(2 * Math.PI * fLowComponent * wt);

    const mHatCircuit =
      messageShape === 'two-tone'
        ? Am *
          (0.69 * Math.sin(2 * Math.PI * fLowComponent * wt + hilbertPhaseErrRad) +
            0.31 * Math.sin(2 * Math.PI * fHighComponent * wt + hilbertPhaseErrRad))
        : Am * Math.sin(2 * Math.PI * fLowComponent * wt + hilbertPhaseErrRad);

    const cosC = Math.cos(2 * Math.PI * fc * wt);
    const sinC = Math.sin(2 * Math.PI * fc * wt);

    message[n] = m;
    messageHilbert[n] = mHat;
    carrier[n] = Ac * cosC;

    if (method === 'phase') {
      modulated[n] =
        (sideband === 'USB'
          ? 0.5 * Ac * (m * cosC - qArmGain * mHatCircuit * sinC)
          : 0.5 * Ac * (m * cosC + qArmGain * mHatCircuit * sinC)) * rlScale;
    } else {
      const evalBPF = (freq: number) => {
        const bwPass = Math.max(800, (fHighComponent + 800) / Math.max(0.35, cpRatio));
        const fCenter = sideband === 'USB' ? fc + bwPass * 0.55 : fc - bwPass * 0.55;
        const halfW = bwPass * 0.52;
        const norm = Math.abs(freq - fCenter) / halfW;
        return 1 / Math.sqrt(1 + Math.pow(norm, 2 * filterOrder));
      };

      const gLowUSB = evalBPF(fc + fLowComponent);
      const gLowLSB = evalBPF(fc - fLowComponent);

      if (messageShape === 'two-tone') {
        const gHighUSB = evalBPF(fc + fHighComponent);
        const gHighLSB = evalBPF(fc - fHighComponent);
        modulated[n] =
          0.5 *
          Ac *
          Am *
          rlScale *
          (0.69 *
            (gLowUSB * Math.cos(2 * Math.PI * (fc + fLowComponent) * wt) +
              gLowLSB * Math.cos(2 * Math.PI * (fc - fLowComponent) * wt)) +
            0.31 *
              (gHighUSB * Math.cos(2 * Math.PI * (fc + fHighComponent) * wt) +
                gHighLSB * Math.cos(2 * Math.PI * (fc - fHighComponent) * wt)));
      } else {
        modulated[n] =
          0.5 *
          Ac *
          Am *
          rlScale *
          (gLowUSB * Math.cos(2 * Math.PI * (fc + fLowComponent) * wt) +
            gLowLSB * Math.cos(2 * Math.PI * (fc - fLowComponent) * wt));
      }
    }
  }

  const phiRad = (loPhaseErrorDeg * Math.PI) / 180;
  const mixed = new Array<number>(TOTAL);
  for (let n = 0; n < TOTAL; n++) {
    const wt = tFull[n] + timeOffset;
    mixed[n] = modulated[n] * (4 / Math.max(0.1, Ac)) * Math.cos(2 * Math.PI * fc * wt + phiRad);
  }
  const skCut = computeSallenKeyCutoffHz(circuit);
  const lpfOut = sallenKeyBiquadLPF(mixed, skCut, fs, 0.707);
  const demodulated = rcHighPassFilter(lpfOut, circuit.skRlK * 1000, circuit.skCoutUf * 1e-6, fs);

  const spectrum = computeFFT(modulated.slice(PRE, PRE + N), fs, 'hanning');

  const filterOverlay =
    method === 'frequency'
      ? {
          frequencies: spectrum.frequencies,
          response: spectrum.frequencies.map((freq) => {
            const bwPass = Math.max(800, (fHighComponent + 800) / Math.max(0.35, cpRatio));
            const fCenter = sideband === 'USB' ? fc + bwPass * 0.55 : fc - bwPass * 0.55;
            const halfW = bwPass * 0.52;
            const norm = Math.abs(freq - fCenter) / halfW;
            return 1 / Math.sqrt(1 + Math.pow(norm, 2 * filterOrder));
          }),
          color: '#059669',
          label: `XTAL BPF (Order ${filterOrder})`,
        }
      : undefined;

  const bandwidthHz =
    messageShape === 'two-tone'
      ? fHighComponent - (energyGapHz > 0 ? fLowComponent : 0)
      : fLowComponent;

  return {
    t: tFull.slice(PRE, PRE + SCOPE_SAMPLES),
    message: message.slice(PRE, PRE + SCOPE_SAMPLES),
    messageHilbert: messageHilbert.slice(PRE, PRE + SCOPE_SAMPLES),
    carrier: carrier.slice(PRE, PRE + SCOPE_SAMPLES),
    modulated: modulated.slice(PRE, PRE + SCOPE_SAMPLES),
    demodulated: demodulated.slice(PRE, PRE + SCOPE_SAMPLES),
    longT: tFull.slice(PRE, PRE + PROBE_SAMPLES),
    longMessage: message.slice(PRE, PRE + PROBE_SAMPLES),
    longModulated: modulated.slice(PRE, PRE + PROBE_SAMPLES),
    longDemodulated: demodulated.slice(PRE, PRE + PROBE_SAMPLES),
    spectrum,
    filterOverlay,
    bandwidthHz,
    fLowComponent,
    fHighComponent,
  };
}

// ---------------------------------------------------------------------------
// 5. VESTIGIAL SIDEBAND (VSB) MODULATION
// ---------------------------------------------------------------------------

export function simulateVSBLab(params: {
  Ac: number;
  fc: number;
  W: number;
  Am: number;
  vestigeRatio: number;
  symmetrySkew: number;
  timeOffset: number;
  circuit?: CircuitComponentValues;
}) {
  const {
    Ac,
    fc,
    W,
    Am,
    vestigeRatio,
    symmetrySkew,
    timeOffset,
    circuit = DEFAULT_CIRCUIT_VALUES,
  } = params;
  const fs = SIM_FS;
  const N = FFT_SAMPLES;
  const PRE = PRE_SAMPLES;
  const TOTAL = PRE + N;

  // LC Shaping Network + Op-Amp feedback & Trap notch physically shape H(f)
  const lcSeriesRatio = Math.sqrt((circuit.vsbL1Uh * circuit.vsbC1Pf) / (12 * 150));
  const lcShuntRatio = Math.sqrt((circuit.vsbL2Uh * circuit.vsbC2Pf) / (8.2 * 220));
  const effectiveVestigeRatio = Math.max(0.05, Math.min(0.85, vestigeRatio / Math.max(0.35, lcSeriesRatio)));
  const fv = Math.max(150, W * effectiveVestigeRatio);
  const lcCutoffShiftHz = (1 - lcShuntRatio) * W * 0.45;

  const opAmpGain = Math.min(2.0, Math.max(0.2, circuit.vsbRfK / 1.0));
  const rfLoadDivider =
    (circuit.vsbRlOhm / Math.max(1, circuit.vsbRlOhm + circuit.vsbRsOhm)) / (75 / (75 + 50));
  const cfRollHz = (33 / Math.max(4, circuit.vsbCfPf)) * W * 3.5;
  const trapRatio = Math.sqrt((circuit.vsbL3Uh * circuit.vsbC4Pf) / (15 * 180));
  const trapFreq = fc - W * 1.15 * trapRatio;

  const evalVSBFilter = (freq: number) => {
    const df = freq - (fc + lcCutoffShiftHz);
    let baseH = 0;
    if (df >= fv) baseH = 1.0;
    else if (df <= -fv) baseH = 0.0;
    else {
      const u = df / fv;
      const ideal = 0.5 + 0.5 * Math.sin((Math.PI / 2) * u);
      const lcSkew = (lcSeriesRatio - 1) * 0.25;
      baseH = Math.min(1, Math.max(0, ideal + (symmetrySkew + lcSkew) * (1 - u * u)));
    }
    // Feedback Cf roll-off above fc + cfRollHz
    const hiOffset = Math.max(0, freq - fc);
    const cfAtten = 1 / Math.sqrt(1 + Math.pow(hiOffset / Math.max(400, cfRollHz), 2));
    // Series L3-C4 trap notch on suppressed sideband
    const trapDist = Math.abs(freq - trapFreq) / Math.max(180, fv * 0.45);
    const trapAtten = 0.35 + 0.65 * (trapDist / Math.sqrt(1 + trapDist * trapDist));
    return Math.min(1.4, Math.max(0, baseH * cfAtten * trapAtten * opAmpGain * rfLoadDivider));
  };

  const freqs = [0.2 * W, 0.55 * W, 0.95 * W];
  const weights = [0.5, 0.3, 0.2];

  const tFull = new Array<number>(TOTAL);
  const message = new Array<number>(TOTAL);
  const carrier = new Array<number>(TOTAL);
  const modulated = new Array<number>(TOTAL);

  for (let n = 0; n < TOTAL; n++) {
    const time = (n - PRE) / fs;
    tFull[n] = time;
    const wt = time + timeOffset;

    let m = 0;
    let s = 0;

    for (let k = 0; k < freqs.length; k++) {
      const f = freqs[k];
      const a = Am * weights[k];
      m += a * Math.cos(2 * Math.PI * f * wt);

      const gUSB = evalVSBFilter(fc + f);
      const gLSB = evalVSBFilter(fc - f);
      s +=
        0.5 *
        Ac *
        a *
        (gUSB * Math.cos(2 * Math.PI * (fc + f) * wt) +
          gLSB * Math.cos(2 * Math.PI * (fc - f) * wt));
    }

    message[n] = m;
    carrier[n] = Ac * Math.cos(2 * Math.PI * fc * wt);
    modulated[n] = s;
  }

  const mixed = new Array<number>(TOTAL);
  for (let n = 0; n < TOTAL; n++) {
    const wt = tFull[n] + timeOffset;
    mixed[n] = modulated[n] * (4 / Math.max(0.1, Ac)) * Math.cos(2 * Math.PI * fc * wt);
  }
  const skCut = computeSallenKeyCutoffHz(circuit);
  const lpfOut = sallenKeyBiquadLPF(mixed, skCut, fs, 0.707);
  const demodulated = rcHighPassFilter(lpfOut, circuit.skRlK * 1000, circuit.skCoutUf * 1e-6, fs);

  const spectrum = computeFFT(modulated.slice(PRE, PRE + N), fs, 'hanning');

  const filterOverlay = {
    frequencies: spectrum.frequencies,
    response: spectrum.frequencies.map((f) => evalVSBFilter(f)),
    color: '#059669',
    label: 'VSB Shaping Filter H(f)',
  };

  const symmetryCheck: { f: number; hUpper: number; hLower: number; sum: number }[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const f = -W + (2 * W * i) / steps;
    const hPlus = evalVSBFilter(Math.abs(f + fc));
    const hMinus = evalVSBFilter(Math.abs(f - fc));
    symmetryCheck.push({ f, hUpper: hPlus, hLower: hMinus, sum: hPlus + hMinus });
  }

  const bandwidthHz = W + fv;

  return {
    t: tFull.slice(PRE, PRE + SCOPE_SAMPLES),
    message: message.slice(PRE, PRE + SCOPE_SAMPLES),
    carrier: carrier.slice(PRE, PRE + SCOPE_SAMPLES),
    modulated: modulated.slice(PRE, PRE + SCOPE_SAMPLES),
    demodulated: demodulated.slice(PRE, PRE + SCOPE_SAMPLES),
    longT: tFull.slice(PRE, PRE + PROBE_SAMPLES),
    longMessage: message.slice(PRE, PRE + PROBE_SAMPLES),
    longModulated: modulated.slice(PRE, PRE + PROBE_SAMPLES),
    longDemodulated: demodulated.slice(PRE, PRE + PROBE_SAMPLES),
    spectrum,
    filterOverlay,
    symmetryCheck,
    bandwidthHz,
    fv,
  };
}

// ---------------------------------------------------------------------------
// 6. AM FAMILY COMPARISON
// ---------------------------------------------------------------------------

export function simulateAMFamilyComparison(params: {
  Ac: number;
  fc: number;
  fm: number;
  mu: number;
  vestigeRatio: number;
  messageShape: MessageShape;
  timeOffset: number;
}) {
  const { Ac, fc, fm, mu, vestigeRatio, messageShape, timeOffset } = params;
  const amRes = simulateConventionalAMLab({
    Ac,
    fc,
    fm,
    mu,
    messageShape,
    rcTimeMs: 0.35,
    modulatorMode: 'linear',
    timeOffset,
  });
  const dsbRes = simulateDSBSCLab({
    Ac,
    fc,
    fm,
    Am: Ac * mu,
    messageShape,
    modulatorTopology: 'product',
    receiverMode: 'coherent',
    loPhaseErrorDeg: 0,
    loFreqOffsetHz: 0,
    costasInitialPhaseDeg: 0,
    costasLoopGain: 1,
    timeOffset,
  });
  const ssbRes = simulateSSBLab({
    Ac,
    fc,
    fm,
    Am: Ac * mu,
    sideband: 'USB',
    method: 'phase',
    messageShape,
    filterOrder: 4,
    energyGapHz: 0,
    loPhaseErrorDeg: 0,
    timeOffset,
  });
  const vsbRes = simulateVSBLab({
    Ac,
    fc,
    W: messageShape === 'two-tone' ? fm * 2.2 : fm,
    Am: Ac * mu,
    vestigeRatio,
    symmetrySkew: 0,
    timeOffset,
  });

  const wMax = messageShape === 'two-tone' ? fm * 2.2 : fm;

  return {
    t: amRes.t,
    am: amRes,
    dsb: dsbRes,
    ssb: ssbRes,
    vsb: vsbRes,
    metrics: [
      {
        scheme: 'Conventional AM',
        spectrumDesc: 'Carrier + USB + LSB',
        bandwidthHz: 2 * wMax,
        bwFormula: '2 W',
        efficiencyPct: amRes.efficiencyPct,
        complexity: 'Low (Envelope Detector)',
        color: '#7045B8',
      },
      {
        scheme: 'DSB-SC',
        spectrumDesc: 'USB + LSB (No Carrier)',
        bandwidthHz: 2 * wMax,
        bwFormula: '2 W',
        efficiencyPct: 100,
        complexity: 'Medium (Coherent / Costas)',
        color: '#2563EB',
      },
      {
        scheme: 'SSB (USB)',
        spectrumDesc: 'USB Only',
        bandwidthHz: wMax,
        bwFormula: 'W',
        efficiencyPct: 100,
        complexity: 'High (Hilbert / Sharp BPF)',
        color: '#059669',
      },
      {
        scheme: 'VSB',
        spectrumDesc: 'USB + Vestige of LSB',
        bandwidthHz: wMax * (1 + vestigeRatio),
        bwFormula: `${(1 + vestigeRatio).toFixed(2)} W`,
        efficiencyPct: 85,
        complexity: 'Medium-High (Shaping BPF)',
        color: '#D97706',
      },
    ],
  };
}

// ============================================================================
// 05. FREQUENCY MODULATION (FM) LAB
// ============================================================================
export interface FMLabResult {
  t: number[];
  message: number[];
  carrier: number[];
  modulated: number[];
  instFreqHz: number[];
  demodulated: number[];
  spectrum: ReturnType<typeof computeFFT>;
  beta: number;
  deltaFHz: number;
  carsonBwHz: number;
  isNarrowband: boolean;
  totalPowerW: number;
}

export function simulateFMLab(params: {
  Ac: number;
  fc: number;
  fm: number;
  Am: number;
  deltaFHz: number; // peak frequency deviation Δf = kf * Am
  messageShape: MessageShape;
  demodMode: 'slope' | 'pll';
  dcOffset?: number;
  timeOffset: number;
}): FMLabResult {
  const { Ac, fc, fm, Am, deltaFHz, messageShape, demodMode, dcOffset = 0, timeOffset } = params;
  const fs = SIM_FS;
  const dt = 1 / fs;
  const totalLen = PRE_SAMPLES + FFT_SAMPLES;

  const fullMod = new Array<number>(totalLen);
  const fullMsg = new Array<number>(totalLen);
  const fullInstF = new Array<number>(totalLen);
  const fullCar = new Array<number>(totalLen);

  // Numerical integration of m(t) for instantaneous phase: θ(t) = 2π fc t + 2π Δf ∫ m_n(τ) dτ
  let integralM = 0;
  for (let i = 0; i < totalLen; i++) {
    const ti = (i - PRE_SAMPLES) * dt + timeOffset;
    const mn = evalMessage(messageShape, fm, 1.0, ti) + dcOffset;
    const m = Am * mn;
    fullMsg[i] = m;
    fullCar[i] = Ac * Math.cos(2 * Math.PI * fc * ti);
    integralM += mn * dt;
    const instF = fc + deltaFHz * mn;
    fullInstF[i] = instF;
    const phase = 2 * Math.PI * fc * ti + 2 * Math.PI * deltaFHz * integralM;
    fullMod[i] = Ac * Math.cos(phase);
  }

  // Demodulation:
  // 1) Differentiator / Slope Detector -> instantaneous frequency via analytic phase derivative or envelope of d/dt s(t)
  // 2) PLL Discriminator -> low-pass filtered phase error tracking
  const fullDemod = new Array<number>(totalLen).fill(0);
  if (demodMode === 'slope') {
    // Differentiator + envelope detector: d/dt [Ac cos(θ)] = -Ac θ'(t) sin(θ)
    // Envelope is Ac * 2π * (fc + Δf m_n(t)); subtract DC (Ac * 2π fc) and normalize
    const rect = new Array<number>(totalLen).fill(0);
    for (let i = 1; i < totalLen; i++) {
      const deriv = (fullMod[i] - fullMod[i - 1]) / dt;
      rect[i] = Math.abs(deriv);
    }
    // Simple 1-pole RC envelope smoother tuned to 1 / (2π * 3 fm)
    const alpha = Math.min(0.45, (2 * Math.PI * Math.max(fm * 3.2, 2200)) * dt);
    let env = Math.abs(Ac * 2 * Math.PI * fc) * (2 / Math.PI);
    const scale = Math.max(1e-6, Ac * 2 * Math.PI * Math.max(50, deltaFHz) * (2 / Math.PI));
    const dcEst = Ac * 2 * Math.PI * fc * (2 / Math.PI);
    for (let i = 0; i < totalLen; i++) {
      env += alpha * (rect[i] - env);
      fullDemod[i] = Am * ((env - dcEst) / scale);
    }
  } else {
    // Coherent PLL discriminator: VCO tracks instantaneous phase θ(t), control voltage ∝ Δf * m_n(t)
    let vcoPhase = 2 * Math.PI * fc * (-PRE_SAMPLES * dt + timeOffset);
    let vcoFreqOffset = 0;
    const kp = 2 * Math.PI * Math.max(4000, deltaFHz * 2.5);
    const lpfAlpha = Math.min(0.5, 2 * Math.PI * Math.max(fm * 3.5, 2500) * dt);
    let ctrlFilt = 0;
    for (let i = 0; i < totalLen; i++) {
      // Phase detector: -s(t) * sin(vcoPhase) ≈ (Ac/2) sin(θ - vcoPhase)
      const pd = (-2 / Math.max(0.1, Ac)) * fullMod[i] * Math.sin(vcoPhase);
      ctrlFilt += lpfAlpha * (pd - ctrlFilt);
      vcoFreqOffset = (kp * ctrlFilt) / (2 * Math.PI);
      vcoPhase += 2 * Math.PI * (fc + vcoFreqOffset) * dt;
      fullDemod[i] = Am * (vcoFreqOffset / Math.max(50, deltaFHz));
    }
  }

  const start = PRE_SAMPLES;
  const fftSlice = fullMod.slice(start, start + FFT_SAMPLES);
  const spectrum = computeFFT(fftSlice, fs);

  const t = new Array<number>(SCOPE_SAMPLES);
  const message = new Array<number>(SCOPE_SAMPLES);
  const carrier = new Array<number>(SCOPE_SAMPLES);
  const modulated = new Array<number>(SCOPE_SAMPLES);
  const instFreqHz = new Array<number>(SCOPE_SAMPLES);
  const demodulated = new Array<number>(SCOPE_SAMPLES);

  for (let i = 0; i < SCOPE_SAMPLES; i++) {
    t[i] = i * dt;
    message[i] = fullMsg[start + i];
    carrier[i] = fullCar[start + i];
    modulated[i] = fullMod[start + i];
    instFreqHz[i] = fullInstF[start + i];
    demodulated[i] = fullDemod[start + i];
  }

  const beta = deltaFHz / Math.max(1, fm);
  const carsonBwHz = 2 * (deltaFHz + fm);
  const totalPowerW = (Ac * Ac) / 2;

  return {
    t,
    message,
    carrier,
    modulated,
    instFreqHz,
    demodulated,
    spectrum,
    beta,
    deltaFHz,
    carsonBwHz,
    isNarrowband: beta < 0.3,
    totalPowerW,
  };
}

// ============================================================================
// 06. PHASE MODULATION (PM) LAB
// ============================================================================
export interface PMLabResult {
  t: number[];
  message: number[];
  carrier: number[];
  modulated: number[];
  instPhaseRad: number[];
  demodulated: number[];
  spectrum: ReturnType<typeof computeFFT>;
  betaPM: number; // peak phase deviation kp * Am (rad)
  equivDeltaFHz: number; // β_PM * fm
  carsonBwHz: number;
  totalPowerW: number;
}

export function simulatePMLab(params: {
  Ac: number;
  fc: number;
  fm: number;
  Am: number;
  kpRadPerV: number; // phase sensitivity kp (rad/V)
  messageShape: MessageShape;
  demodMode: 'coherent-pd' | 'fm-integrator';
  dcOffset?: number;
  timeOffset: number;
}): PMLabResult {
  const { Ac, fc, fm, Am, kpRadPerV, messageShape, demodMode, dcOffset = 0, timeOffset } = params;
  const fs = SIM_FS;
  const dt = 1 / fs;
  const totalLen = PRE_SAMPLES + FFT_SAMPLES;

  const fullMod = new Array<number>(totalLen);
  const fullMsg = new Array<number>(totalLen);
  const fullPhase = new Array<number>(totalLen);
  const fullCar = new Array<number>(totalLen);

  for (let i = 0; i < totalLen; i++) {
    const ti = (i - PRE_SAMPLES) * dt + timeOffset;
    const mn = evalMessage(messageShape, fm, 1.0, ti) + dcOffset;
    const m = Am * mn;
    const phi = kpRadPerV * m;
    fullMsg[i] = m;
    fullCar[i] = Ac * Math.cos(2 * Math.PI * fc * ti);
    fullPhase[i] = phi;
    fullMod[i] = Ac * Math.cos(2 * Math.PI * fc * ti + phi);
  }

  // Demodulation:
  // 1) Coherent Phase Detector: I/Q mixer with local carrier cos/sin -> atan2(Q, I) unwrapped / kp
  // 2) FM Discriminator + Integrator: differentiates phase -> integrates back to m(t)
  const fullDemod = new Array<number>(totalLen).fill(0);
  const lpfAlpha = Math.min(0.45, 2 * Math.PI * Math.max(fm * 3.5, 2500) * dt);
  let iFilt = 0;
  let qFilt = 0;
  let prevAngle = 0;
  let unwrapped = 0;
  for (let i = 0; i < totalLen; i++) {
    const ti = (i - PRE_SAMPLES) * dt + timeOffset;
    const iMix = (2 / Math.max(0.1, Ac)) * fullMod[i] * Math.cos(2 * Math.PI * fc * ti);
    const qMix = (-2 / Math.max(0.1, Ac)) * fullMod[i] * Math.sin(2 * Math.PI * fc * ti);
    iFilt += lpfAlpha * (iMix - iFilt);
    qFilt += lpfAlpha * (qMix - qFilt);
    const angle = Math.atan2(qFilt, iFilt);
    if (i === 0) {
      prevAngle = angle;
      unwrapped = angle;
    } else {
      let diff = angle - prevAngle;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      unwrapped += diff;
      prevAngle = angle;
    }
    if (demodMode === 'coherent-pd') {
      fullDemod[i] = unwrapped / Math.max(0.1, kpRadPerV);
    } else {
      // Discriminator + leaky integrator (slight AC coupling removes pure DC)
      fullDemod[i] = (unwrapped / Math.max(0.1, kpRadPerV)) * 0.98;
    }
  }

  const start = PRE_SAMPLES;
  const fftSlice = fullMod.slice(start, start + FFT_SAMPLES);
  const spectrum = computeFFT(fftSlice, fs);

  const t = new Array<number>(SCOPE_SAMPLES);
  const message = new Array<number>(SCOPE_SAMPLES);
  const carrier = new Array<number>(SCOPE_SAMPLES);
  const modulated = new Array<number>(SCOPE_SAMPLES);
  const instPhaseRad = new Array<number>(SCOPE_SAMPLES);
  const demodulated = new Array<number>(SCOPE_SAMPLES);

  for (let i = 0; i < SCOPE_SAMPLES; i++) {
    t[i] = i * dt;
    message[i] = fullMsg[start + i];
    carrier[i] = fullCar[start + i];
    modulated[i] = fullMod[start + i];
    instPhaseRad[i] = fullPhase[start + i];
    demodulated[i] = fullDemod[start + i];
  }

  const betaPM = kpRadPerV * Am;
  const equivDeltaFHz = betaPM * fm;
  const carsonBwHz = 2 * (betaPM + 1) * fm;
  const totalPowerW = (Ac * Ac) / 2;

  return {
    t,
    message,
    carrier,
    modulated,
    instPhaseRad,
    demodulated,
    spectrum,
    betaPM,
    equivDeltaFHz,
    carsonBwHz,
    totalPowerW,
  };
}

