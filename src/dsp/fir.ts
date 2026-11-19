import { LAB_SAMPLE_RATE } from './types';

export interface FilterResponseCurve {
  frequencies: Float32Array;
  magnitudesDb: Float32Array;
  magnitudesLinear: Float32Array;
}

/**
 * Windowed-sinc linear-phase FIR Bandpass Filter (Blackman window).
 * Order M must be even -> tapsCount = M + 1 (symmetric around M/2).
 */
export function designBandpassFIR(
  lowCutHz: number,
  highCutHz: number,
  order: number = 160,
  fs: number = LAB_SAMPLE_RATE
): Float64Array {
  const M = Math.max(16, order % 2 === 0 ? order : order + 1);
  const half = M / 2;
  const taps = new Float64Array(M + 1);

  const f1 = Math.max(20, Math.min(lowCutHz, fs * 0.48)) / fs;
  const f2 = Math.max(f1 + 20 / fs, Math.min(highCutHz, fs * 0.49)) / fs;

  for (let n = 0; n <= M; n++) {
    const k = n - half;
    let h: number;
    if (k === 0) {
      h = 2 * (f2 - f1);
    } else {
      h = (Math.sin(2 * Math.PI * f2 * k) - Math.sin(2 * Math.PI * f1 * k)) / (Math.PI * k);
    }
    const blackman =
      0.42 -
      0.5 * Math.cos((2 * Math.PI * n) / M) +
      0.08 * Math.cos((4 * Math.PI * n) / M);
    taps[n] = h * blackman;
  }

  // Normalize passband gain at center frequency f_mid = 0.5*(f1+f2)
  const fMid = 0.5 * (f1 + f2);
  let re = 0;
  let im = 0;
  for (let n = 0; n <= M; n++) {
    const angle = -2 * Math.PI * fMid * n;
    re += taps[n] * Math.cos(angle);
    im += taps[n] * Math.sin(angle);
  }
  const passbandGain = Math.sqrt(re * re + im * im);
  if (passbandGain > 1e-9) {
    for (let n = 0; n <= M; n++) {
      taps[n] /= passbandGain;
    }
  }

  return taps;
}

/**
 * Frequency-sampled linear-phase FIR VSB Shaping Filter implementing Nyquist's complementary criterion:
 *   H(fc + Δf) + H(fc - Δf) = 1  for |Δf| <= fv
 *
 * - 'usb-vestige': Passes full USB [fc + fv .. fc + B], 0.5 at fc, raised-cosine vestige [fc - fv .. fc + fv], 0 below fc - fv.
 * - 'lsb-vestige': Passes full LSB [fc - B .. fc - fv], 0.5 at fc, raised-cosine vestige [fc - fv .. fc + fv], 0 above fc + fv.
 */
export function designVSBShapingFIR(params: {
  carrierFreqHz: number;
  mainBandwidthHz: number;
  vestigeBandwidthHz: number;
  orientation: 'usb-vestige' | 'lsb-vestige';
  order?: number;
  fs?: number;
}): Float64Array {
  const fs = params.fs ?? LAB_SAMPLE_RATE;
  const fc = params.carrierFreqHz;
  const B = Math.max(200, params.mainBandwidthHz);
  const fv = Math.max(50, Math.min(B, params.vestigeBandwidthHz));
  const M = Math.max(32, (params.order ?? 192) % 2 === 0 ? (params.order ?? 192) : (params.order ?? 192) + 1);
  const tapsCount = M + 1;

  // Dense frequency grid for IDFT design (Nfft >= 2048)
  const Nfft = 2048;
  const mag = new Float64Array(Nfft);

  const evalIdealVSB = (fAbs: number): number => {
    const df = fAbs - fc;
    const edgeRoll = Math.max(150, Math.min(600, fv * 0.5));
    if (params.orientation === 'usb-vestige') {
      // Lower vestige edge at -fv -> +fv (complementary raised-cosine around fc)
      if (df < -fv) return 0;
      if (df <= fv) {
        // Odd symmetry around 0.5 at df = 0 => H(fc + df) + H(fc - df) = 1
        return 0.5 * (1 + Math.sin((Math.PI * df) / (2 * fv)));
      }
      if (df <= B) return 1.0;
      if (df <= B + edgeRoll) {
        return 0.5 * (1 + Math.cos((Math.PI * (df - B)) / edgeRoll));
      }
      return 0;
    } else {
      // LSB + upper vestige (-B .. +fv)
      if (df > fv) return 0;
      if (df >= -fv) {
        return 0.5 * (1 - Math.sin((Math.PI * df) / (2 * fv)));
      }
      if (df >= -B) return 1.0;
      if (df >= -B - edgeRoll) {
        return 0.5 * (1 + Math.cos((Math.PI * (-df - B)) / edgeRoll));
      }
      return 0;
    }
  };

  for (let k = 0; k < Nfft; k++) {
    const fSigned = k <= Nfft / 2 ? (k * fs) / Nfft : ((Nfft - k) * fs) / Nfft;
    mag[k] = evalIdealVSB(fSigned);
  }

  // Zero-phase IDFT symmetric around n = half = M / 2 + Blackman window
  const half = M / 2;
  const taps = new Float64Array(tapsCount);
  for (let n = 0; n < tapsCount; n++) {
    const shift = n - half;
    let sum = mag[0];
    for (let k = 1; k < Nfft / 2; k++) {
      sum += 2 * mag[k] * Math.cos((2 * Math.PI * k * shift) / Nfft);
    }
    sum += mag[Nfft / 2] * Math.cos(Math.PI * shift);
    const h = sum / Nfft;
    const blackman =
      0.42 -
      0.5 * Math.cos((2 * Math.PI * n) / M) +
      0.08 * Math.cos((4 * Math.PI * n) / M);
    taps[n] = h * blackman;
  }

  return taps;
}

/**
 * Zero-phase-aligned linear-phase FIR convolution (compensates exact group delay M/2).
 */
export function applyLinearPhaseFIR64(signal: Float64Array, taps: Float64Array): Float64Array {
  const N = signal.length;
  const L = taps.length;
  const half = Math.floor(L / 2);
  const out = new Float64Array(N);

  for (let i = 0; i < N; i++) {
    let acc = 0;
    // Shift by +half so linear phase delay M/2 is aligned directly with input sample i
    const base = i + half;
    for (let j = 0; j < L; j++) {
      const idx = base - j;
      if (idx >= 0 && idx < N) {
        acc += signal[idx] * taps[j];
      }
    }
    out[i] = acc;
  }
  return out;
}

/**
 * Evaluate exact FIR filter magnitude response |H(f)| across [0 .. fs/2].
 */
export function computeFirResponseCurve(
  taps: Float64Array,
  fs: number = LAB_SAMPLE_RATE,
  numPoints: number = 1024
): FilterResponseCurve {
  const frequencies = new Float32Array(numPoints);
  const magnitudesLinear = new Float32Array(numPoints);
  const magnitudesDb = new Float32Array(numPoints);
  const fNyquist = fs / 2;

  for (let p = 0; p < numPoints; p++) {
    const f = (p / (numPoints - 1)) * fNyquist;
    const omega = (2 * Math.PI * f) / fs;
    let re = 0;
    let im = 0;
    for (let n = 0; n < taps.length; n++) {
      re += taps[n] * Math.cos(omega * n);
      im -= taps[n] * Math.sin(omega * n);
    }
    const mag = Math.sqrt(re * re + im * im);
    frequencies[p] = f;
    magnitudesLinear[p] = mag;
    magnitudesDb[p] = Math.max(-85, Math.min(5, 20 * Math.log10(Math.max(mag, 1e-6))));
  }

  return { frequencies, magnitudesDb, magnitudesLinear };
}
