import {
  computeFFT64,
  computeMetrics64,
  computePowerMetrics64,
  firstOrderDcBlocker64,
  fourthOrderButterworthLPF64,
  hilbertTransform64,
  peakNormalize64,
  removeMean64,
  SignalMetrics64,
  toFloat32,
} from './common';
import {
  applyLinearPhaseFIR64,
  computeFirResponseCurve,
  designVSBShapingFIR,
  FilterResponseCurve,
} from './fir';
import { SharedChannelConfig, simulateSharedChannel64 } from './channel';
import { FFTSpectrum, LAB_SAMPLE_RATE } from './types';

export type VSBOrientation = 'usb-vestige' | 'lsb-vestige';

export interface VSBLabConfig {
  carrierFreqHz: number;
  carrierAmpV: number;
  orientation: VSBOrientation;
  bandlimitMessage: boolean;
  messageLpfCutoffHz: number;
  mainBandwidthHz: number; // B
  vestigeBandwidthHz: number; // B_v
  filterOrder: number; // even [64 .. 256]

  // Coherent Receiver
  localCarrierAmpV: number;
  localPhaseErrorDeg: number;
  localFreqOffsetHz: number;
  receiverLpfCutoffHz: number;
  equalizationEnabled: boolean;

  channel: SharedChannelConfig;
}

export const DEFAULT_VSB_CONFIG: VSBLabConfig = {
  carrierFreqHz: 6000,
  carrierAmpV: 1.0,
  orientation: 'usb-vestige',
  bandlimitMessage: true,
  messageLpfCutoffHz: 3400,
  mainBandwidthHz: 3400,
  vestigeBandwidthHz: 750,
  filterOrder: 192,

  localCarrierAmpV: 1.0,
  localPhaseErrorDeg: 0,
  localFreqOffsetHz: 0,
  receiverLpfCutoffHz: 3500,
  equalizationEnabled: true,

  channel: {
    attenuation: 1.0,
    awgnEnabled: false,
    noiseSigma: 0.04,
    phaseShiftDeg: 0,
    freqOffsetHz: 0,
    noiseSeed: 2025,
  },
};

export interface NyquistSymmetryPoint {
  deltaFreqHz: number;
  hUpper: number; // |H(fc + Δf)|
  hLower: number; // |H(fc - Δf)|
  sum: number; // |H(fc + Δf)| + |H(fc - Δf)| (target 1.00)
}

export interface VSBSimulationResult {
  sampleRate: number;
  numSamples: number;
  durationSec: number;
  config: VSBLabConfig;

  // Time-domain signals
  originalMessage: Float32Array;
  carrier: Float32Array;
  dsbScSource: Float32Array;
  vsbModulated: Float32Array;
  received: Float32Array;
  localOscillator: Float32Array;
  product: Float32Array;
  vsbRecovered: Float32Array;

  // Filter Response & Nyquist Complementary Criterion Verification
  filterCurve: FilterResponseCurve;
  nyquistPoints: NyquistSymmetryPoint[];
  nyquistRmsError: number;
  nyquistMaxError: number;

  // Power, Bandwidth & Metrics
  totalPowerW: number;
  carrierPowerW: number;
  sidebandPowerW: number;
  occupiedBandwidthHz: number; // B + B_v
  ssbReferenceBandwidthHz: number; // B
  dsbReferenceBandwidthHz: number; // 2B
  bandwidthRatioVsDsbPct: number;
  channelSnrDb: number;
  metrics: SignalMetrics64;

  // 8192-pt FFT Spectra
  spectra: {
    original: FFTSpectrum;
    dsbScSource: FFTSpectrum;
    vsbModulated: FFTSpectrum;
    received: FFTSpectrum;
    recovered: FFTSpectrum;
  };
}

export function simulateVSBSystem(
  rawMessage64: Float64Array,
  config: VSBLabConfig,
  fs: number = LAB_SAMPLE_RATE
): VSBSimulationResult {
  const N = rawMessage64.length;
  const fc = config.carrierFreqHz;
  const Ac = config.carrierAmpV;
  const B = config.mainBandwidthHz;
  const Bv = Math.min(B, config.vestigeBandwidthHz);

  // 1. Message conditioning
  const dcFree = removeMean64(rawMessage64);
  const bandlimited = config.bandlimitMessage
    ? fourthOrderButterworthLPF64(dcFree, config.messageLpfCutoffHz, fs)
    : dcFree;
  const m64 = peakNormalize64(bandlimited, 0.9);

  // 2. Carrier & DSB-SC pre-shaping source: Ac * m(t) * cos(2*pi*fc*t)
  const carrier64 = new Float64Array(N);
  const dsbSource64 = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const angle = (2 * Math.PI * fc * i) / fs;
    const cosC = Math.cos(angle);
    carrier64[i] = Ac * cosC;
    dsbSource64[i] = Ac * m64[i] * cosC;
  }

  // 3. Real FIR VSB Shaping Filter satisfying H(f + fc) + H(f - fc) = 1 around fc
  const vsbTaps = designVSBShapingFIR({
    carrierFreqHz: fc,
    mainBandwidthHz: B,
    vestigeBandwidthHz: Bv,
    orientation: config.orientation,
    order: config.filterOrder,
    fs,
  });
  const filterCurve = computeFirResponseCurve(vsbTaps, fs, 1024);

  // Zero-phase aligned FIR shaping (NOT raw DSB-SC)
  const vsbMod64 = applyLinearPhaseFIR64(dsbSource64, vsbTaps);

  // Evaluate exact Nyquist Complementary Symmetry around fc across [-Bv .. +Bv]
  const nyquistPoints: NyquistSymmetryPoint[] = [];
  const evalMagAt = (freqHz: number): number => {
    const fNyq = fs / 2;
    const clamped = Math.max(0, Math.min(fNyq, freqHz));
    const omega = (2 * Math.PI * clamped) / fs;
    let re = 0;
    let im = 0;
    for (let n = 0; n < vsbTaps.length; n++) {
      re += vsbTaps[n] * Math.cos(omega * n);
      im -= vsbTaps[n] * Math.sin(omega * n);
    }
    return Math.sqrt(re * re + im * im);
  };

  const numSymSamples = 21;
  let sqErrSum = 0;
  let maxErr = 0;
  for (let i = 0; i < numSymSamples; i++) {
    const df = -Bv + (i / (numSymSamples - 1)) * 2 * Bv;
    const hUpper = evalMagAt(fc + df);
    const hLower = evalMagAt(fc - df);
    const sum = hUpper + hLower;
    const err = Math.abs(sum - 1.0);
    sqErrSum += err * err;
    if (err > maxErr) maxErr = err;
    nyquistPoints.push({ deltaFreqHz: df, hUpper, hLower, sum });
  }
  const nyquistRmsError = Math.sqrt(sqErrSum / numSymSamples);

  // 4. Shared Channel
  const vsbHilbert64 = hilbertTransform64(vsbMod64);
  const chOut = simulateSharedChannel64(vsbMod64, vsbHilbert64, config.channel, fs);
  const rx64 = chOut.received;

  // 5. Coherent VSB Receiver
  const Alo = config.localCarrierAmpV;
  const phiLoRad = (config.localPhaseErrorDeg * Math.PI) / 180;
  const dfLo = config.localFreqOffsetHz;

  const lo64 = new Float64Array(N);
  const prod64 = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const angle = 2 * Math.PI * (fc + dfLo) * (i / fs) + phiLoRad;
    const loVal = Alo * Math.cos(angle);
    lo64[i] = loVal;
    prod64[i] = rx64[i] * loVal;
  }

  const lpfOut = fourthOrderButterworthLPF64(prod64, config.receiverLpfCutoffHz, fs);
  const postDc = config.equalizationEnabled
    ? firstOrderDcBlocker64(removeMean64(lpfOut), 0.996)
    : lpfOut;

  // s_VSB shaped from Ac*m*cos via H(fc+df)+H(fc-df)=1 -> coherent product LPF gives 0.25 * alpha * Ac * Alo * m(t)
  const expectedGain = Math.max(0.01, 0.25 * config.channel.attenuation * Ac * Alo);
  const vsbRec64 = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    vsbRec64[i] = postDc[i] / expectedGain;
  }

  const totalPow = computePowerMetrics64(vsbMod64, fs).totalPowerW;
  const metrics = computeMetrics64(m64, vsbRec64);
  const occupiedBandwidthHz = B + Bv;

  return {
    sampleRate: fs,
    numSamples: N,
    durationSec: N / fs,
    config,

    originalMessage: toFloat32(m64),
    carrier: toFloat32(carrier64),
    dsbScSource: toFloat32(dsbSource64),
    vsbModulated: toFloat32(vsbMod64),
    received: toFloat32(rx64),
    localOscillator: toFloat32(lo64),
    product: toFloat32(prod64),
    vsbRecovered: toFloat32(vsbRec64),

    filterCurve,
    nyquistPoints,
    nyquistRmsError,
    nyquistMaxError: maxErr,

    totalPowerW: totalPow,
    carrierPowerW: 0,
    sidebandPowerW: totalPow,
    occupiedBandwidthHz,
    ssbReferenceBandwidthHz: B,
    dsbReferenceBandwidthHz: 2 * B,
    bandwidthRatioVsDsbPct: (occupiedBandwidthHz / Math.max(1, 2 * B)) * 100,
    channelSnrDb: chOut.channelSnrDb,
    metrics,

    spectra: {
      original: computeFFT64(m64, fs),
      dsbScSource: computeFFT64(dsbSource64, fs),
      vsbModulated: computeFFT64(vsbMod64, fs),
      received: computeFFT64(rx64, fs),
      recovered: computeFFT64(vsbRec64, fs),
    },
  };
}
