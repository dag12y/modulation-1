import { FFT_SIZE, FFTSpectrum, LAB_SAMPLE_RATE } from './types';

export interface SignalMetrics64 {
  snrDb: number;
  mse: number;
  pearsonR: number;
  signedPearsonR: number;
  lagSamples: number;
  amplitudeRatio: number;
  distortionPct: number;
}

export interface PowerMetrics64 {
  totalPowerW: number;
  rmsV: number;
  peakV: number;
  energyJ: number;
}

export function toFloat32(arr: Float64Array): Float32Array {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    out[i] = arr[i];
  }
  return out;
}

export function toFloat64(arr: Float32Array | Float64Array): Float64Array {
  if (arr instanceof Float64Array) return arr;
  const out = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    out[i] = arr[i];
  }
  return out;
}

export function removeMean64(signal: Float64Array): Float64Array {
  const n = signal.length;
  const out = new Float64Array(n);
  if (n === 0) return out;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += signal[i];
  const mean = sum / n;
  for (let i = 0; i < n; i++) out[i] = signal[i] - mean;
  return out;
}

export function firstOrderDcBlocker64(signal: Float64Array, r = 0.996): Float64Array {
  const n = signal.length;
  const out = new Float64Array(n);
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

export function peakNormalize64(signal: Float64Array, targetPeak = 0.9): Float64Array {
  const n = signal.length;
  const out = new Float64Array(n);
  let maxAbs = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(signal[i]);
    if (a > maxAbs) maxAbs = a;
  }
  const scale = maxAbs > 1e-12 ? targetPeak / maxAbs : 1.0;
  for (let i = 0; i < n; i++) out[i] = signal[i] * scale;
  return out;
}

export function biquadLPF64(
  signal: Float64Array,
  cutoffHz: number,
  fs: number,
  q: number
): Float64Array {
  const n = signal.length;
  const out = new Float64Array(n);
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

export function fourthOrderButterworthLPF64(
  signal: Float64Array,
  cutoffHz: number,
  fs: number = LAB_SAMPLE_RATE
): Float64Array {
  const stage1 = biquadLPF64(signal, cutoffHz, fs, 0.5411961);
  return biquadLPF64(stage1, cutoffHz, fs, 1.306563);
}

/**
 * 127-tap Blackman-windowed FIR Hilbert transformer (linear phase, 63-sample delay compensated).
 */
export function hilbertTransform64(signal: Float64Array, halfTaps = 63): Float64Array {
  const n = signal.length;
  const out = new Float64Array(n);
  const taps = new Float64Array(2 * halfTaps + 1);

  for (let k = -halfTaps; k <= halfTaps; k++) {
    if (k !== 0 && (Math.abs(k) & 1) === 1) {
      const m = k + halfTaps;
      const N = 2 * halfTaps;
      const blackman =
        0.42 -
        0.5 * Math.cos((2 * Math.PI * m) / N) +
        0.08 * Math.cos((4 * Math.PI * m) / N);
      taps[m] = (2 / (Math.PI * k)) * blackman;
    }
  }

  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = -halfTaps + (halfTaps % 2 === 0 ? 1 : 0); k <= halfTaps; k += 2) {
      const idx = i - k;
      if (idx >= 0 && idx < n) {
        acc += signal[idx] * taps[k + halfTaps];
      }
    }
    out[i] = acc;
  }
  return out;
}

export function computePowerMetrics64(
  signal: Float64Array,
  fs: number = LAB_SAMPLE_RATE
): PowerMetrics64 {
  const n = signal.length;
  if (n === 0) return { totalPowerW: 0, rmsV: 0, peakV: 0, energyJ: 0 };
  let sumSq = 0;
  let peakV = 0;
  for (let i = 0; i < n; i++) {
    const v = signal[i];
    sumSq += v * v;
    const av = Math.abs(v);
    if (av > peakV) peakV = av;
  }
  const totalPowerW = sumSq / n;
  return {
    totalPowerW,
    rmsV: Math.sqrt(totalPowerW),
    peakV,
    energyJ: sumSq / fs,
  };
}

/**
 * Lag-aligned Pearson correlation, SNR, MSE, and distortion between recovered and reference signal.
 */
export function computeMetrics64(
  reference: Float64Array,
  recovered: Float64Array,
  maxLagSamples = 320
): SignalMetrics64 {
  const n = Math.min(reference.length, recovered.length);
  if (n < 64) {
    return {
      snrDb: 0,
      mse: 0,
      pearsonR: 0,
      signedPearsonR: 0,
      lagSamples: 0,
      amplitudeRatio: 0,
      distortionPct: 100,
    };
  }

  const trimStart = Math.floor(n * 0.05);
  const trimEnd = Math.floor(n * 0.95);
  const stride = Math.max(1, Math.floor((trimEnd - trimStart) / 3000));

  let bestLag = 0;
  let bestAbsCorr = -1;
  let bestSignedCorr = 0;

  for (let lag = 0; lag <= maxLagSamples; lag += 2) {
    let sXY = 0;
    let sX2 = 0;
    let sY2 = 0;
    for (let i = trimStart; i < trimEnd - lag; i += stride) {
      const x = reference[i];
      const y = recovered[i + lag];
      sXY += x * y;
      sX2 += x * x;
      sY2 += y * y;
    }
    const denom = Math.sqrt(sX2 * sY2);
    const r = denom > 1e-12 ? sXY / denom : 0;
    if (Math.abs(r) > bestAbsCorr) {
      bestAbsCorr = Math.abs(r);
      bestSignedCorr = r;
      bestLag = lag;
    }
  }

  // Refine +/- 2 samples around bestLag
  for (let lag = Math.max(0, bestLag - 2); lag <= Math.min(maxLagSamples, bestLag + 2); lag++) {
    let sXY = 0;
    let sX2 = 0;
    let sY2 = 0;
    for (let i = trimStart; i < trimEnd - lag; i += stride) {
      const x = reference[i];
      const y = recovered[i + lag];
      sXY += x * y;
      sX2 += x * x;
      sY2 += y * y;
    }
    const denom = Math.sqrt(sX2 * sY2);
    const r = denom > 1e-12 ? sXY / denom : 0;
    if (Math.abs(r) > bestAbsCorr) {
      bestAbsCorr = Math.abs(r);
      bestSignedCorr = r;
      bestLag = lag;
    }
  }

  let refSumSq = 0;
  let recSumSq = 0;
  let errSumSq = 0;
  let count = 0;
  const polaritySign = bestSignedCorr < 0 ? -1 : 1;

  for (let i = trimStart; i < trimEnd - bestLag; i++) {
    const x = reference[i];
    const y = recovered[i + bestLag];
    const err = y - polaritySign * x;
    refSumSq += x * x;
    recSumSq += y * y;
    errSumSq += err * err;
    count++;
  }

  const mse = count > 0 ? errSumSq / count : 0;
  const snrDb =
    errSumSq > 1e-12
      ? Math.max(-20, Math.min(60, 10 * Math.log10(Math.max(refSumSq, 1e-12) / errSumSq)))
      : 60;
  const amplitudeRatio = refSumSq > 1e-12 ? Math.sqrt(recSumSq / refSumSq) : 0;
  const distortionPct = Math.max(0, Math.min(100, (1 - Math.abs(bestSignedCorr)) * 100));

  return {
    snrDb,
    mse,
    pearsonR: Math.max(0, Math.min(1, bestAbsCorr)),
    signedPearsonR: Math.max(-1, Math.min(1, bestSignedCorr)),
    lagSamples: bestLag,
    amplitudeRatio,
    distortionPct,
  };
}

/**
 * 8192-point Radix-2 Cooley-Tukey FFT on Float64Array with Hann window & coherent gain normalization.
 */
export function computeFFT64(
  signal: Float64Array,
  sampleRate: number = LAB_SAMPLE_RATE,
  fftSize: number = FFT_SIZE
): FFTSpectrum {
  const N = fftSize;
  const re = new Float64Array(N);
  const im = new Float64Array(N);

  const offset = signal.length > N ? Math.max(0, Math.floor((signal.length - N) * 0.25)) : 0;

  let winSum = 0;
  for (let i = 0; i < N; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    winSum += w;
    const s = offset + i < signal.length ? signal[offset + i] : 0;
    re[i] = s * w;
  }
  const coherentGain = winSum / N;

  let j = 0;
  for (let i = 0; i < N - 1; i++) {
    if (i < j) {
      const tr = re[i];
      const ti = im[i];
      re[i] = re[j];
      im[i] = im[j];
      re[j] = tr;
      im[j] = ti;
    }
    let k = N >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1;
    const angleStep = (-2 * Math.PI) / len;
    const wStepR = Math.cos(angleStep);
    const wStepI = Math.sin(angleStep);

    for (let i = 0; i < N; i += len) {
      let wr = 1.0;
      let wi = 0.0;
      for (let k = 0; k < half; k++) {
        const idx1 = i + k;
        const idx2 = i + k + half;
        const tr = wr * re[idx2] - wi * im[idx2];
        const ti = wr * im[idx2] + wi * re[idx2];

        re[idx2] = re[idx1] - tr;
        im[idx2] = im[idx1] - ti;
        re[idx1] += tr;
        im[idx1] += ti;

        const nextWr = wr * wStepR - wi * wStepI;
        wi = wr * wStepI + wi * wStepR;
        wr = nextWr;
      }
    }
  }

  const numBins = N / 2;
  const frequencies = new Float32Array(numBins);
  const magnitudesLinear = new Float32Array(numBins);
  const magnitudesDb = new Float32Array(numBins);

  let peakFreqHz = 0;
  let peakDb = -85;

  for (let k = 0; k < numBins; k++) {
    const f = (k * sampleRate) / N;
    frequencies[k] = f;
    const factor = k === 0 ? 1 / (N * coherentGain) : 2 / (N * coherentGain);
    const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * factor;
    magnitudesLinear[k] = mag;
    const db = Math.max(-85, Math.min(5, 20 * Math.log10(Math.max(mag, 1e-6))));
    magnitudesDb[k] = db;
    if (k > 0 && db > peakDb) {
      peakDb = db;
      peakFreqHz = f;
    }
  }

  return {
    frequencies,
    magnitudesDb,
    magnitudesLinear,
    peakFreqHz,
    peakDb,
    fftSize: N,
  };
}
