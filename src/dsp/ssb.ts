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
  designBandpassFIR,
  FilterResponseCurve,
} from './fir';
import { SharedChannelConfig, simulateSharedChannel64 } from './channel';
import { FFTSpectrum, LAB_SAMPLE_RATE } from './types';

export type SSBSideband = 'USB' | 'LSB';
export type SSBGenerationMethod = 'filter' | 'hilbert';

export interface SSBLabConfig {
  carrierFreqHz: number;
  carrierAmpV: number;
  sideband: SSBSideband;
  method: SSBGenerationMethod;
  bandlimitMessage: boolean;
  messageLpfCutoffHz: number;
  messageBWHz: number;

  // Method A: FIR Bandpass Filter
  filterOrder: number; // even integer [64 .. 256]
  guardOffsetHz: number; // transition edge offset near fc (default 80 Hz)

  // Coherent Receiver
  localCarrierAmpV: number;
  localPhaseErrorDeg: number;
  localFreqOffsetHz: number;
  receiverLpfCutoffHz: number;

  channel: SharedChannelConfig;
}

export const DEFAULT_SSB_CONFIG: SSBLabConfig = {
  carrierFreqHz: 6000,
  carrierAmpV: 1.0,
  sideband: 'USB',
  method: 'hilbert',
  bandlimitMessage: true,
  messageLpfCutoffHz: 3400,
  messageBWHz: 3400,

  filterOrder: 160,
  guardOffsetHz: 80,

  localCarrierAmpV: 1.0,
  localPhaseErrorDeg: 0,
  localFreqOffsetHz: 0,
  receiverLpfCutoffHz: 3500,

  channel: {
    attenuation: 1.0,
    awgnEnabled: false,
    noiseSigma: 0.04,
    phaseShiftDeg: 0,
    freqOffsetHz: 0,
    noiseSeed: 2025,
  },
};

export interface SSBSimulationResult {
  sampleRate: number;
  numSamples: number;
  durationSec: number;
  config: SSBSCLabCompat | SSBLabConfig;

  // All 6 key waveform signals
  originalMessage: Float32Array;
  hilbertMessage: Float32Array;
  carrier: Float32Array;
  dsbScReference: Float32Array;
  usbSignal: Float32Array;
  lsbSignal: Float32Array;
  selectedSsb: Float32Array;
  received: Float32Array;

  // Receiver
  localOscillator: Float32Array;
  product: Float32Array;
  ssbRecovered: Float32Array;

  // Filter Response (always computed for BPF method, null for Hilbert)
  filterCurve: FilterResponseCurve | null;
  filterLowHz: number;
  filterHighHz: number;

  // Power, Bandwidth & Metrics
  totalPowerW: number;
  carrierPowerW: number;
  wantedSidebandPowerW: number;
  unwantedSidebandPowerW: number;
  sidebandSuppressionDb: number;
  occupiedBandwidthHz: number;
  dsbReferenceBandwidthHz: number;
  bandwidthSavingsPct: number; // 50%
  powerEfficiencyPct: number;
  channelSnrDb: number;
  metrics: SignalMetrics64;

  // 8192-pt FFT Spectra
  spectra: {
    original: FFTSpectrum;
    dsbScReference: FFTSpectrum;
    usb: FFTSpectrum;
    lsb: FFTSpectrum;
    selectedSsb: FFTSpectrum;
    received: FFTSpectrum;
    recovered: FFTSpectrum;
  };
}

type SSBSCLabCompat = SSBLabConfig;

export function simulateSSBSystem(
  rawMessage64: Float64Array,
  config: SSBLabConfig,
  fs: number = LAB_SAMPLE_RATE
): SSBSimulationResult {
  const N = rawMessage64.length;
  const fc = config.carrierFreqHz;
  const Ac = config.carrierAmpV;
  const B = config.messageBWHz;

  // 1. Bandlimit and normalize message m(t)
  const dcFree = removeMean64(rawMessage64);
  const bandlimited = config.bandlimitMessage
    ? fourthOrderButterworthLPF64(dcFree, config.messageLpfCutoffHz, fs)
    : dcFree;
  const m64 = peakNormalize64(bandlimited, 0.9);
  const mHat64 = hilbertTransform64(m64);

  // 2. Carrier, DSB-SC Reference, and Hilbert USB & LSB signals
  const carrier64 = new Float64Array(N);
  const dsbRef64 = new Float64Array(N);
  const usbHilbert64 = new Float64Array(N);
  const lsbHilbert64 = new Float64Array(N);

  for (let i = 0; i < N; i++) {
    const angle = (2 * Math.PI * fc * i) / fs;
    const cosC = Math.cos(angle);
    const sinC = Math.sin(angle);
    carrier64[i] = Ac * cosC;
    // Reference DSB-SC = Ac * m(t) cos(wc t); each sideband has 0.5 * Ac amplitude
    dsbRef64[i] = Ac * m64[i] * cosC;
    usbHilbert64[i] = 0.5 * Ac * (m64[i] * cosC - mHat64[i] * sinC);
    lsbHilbert64[i] = 0.5 * Ac * (m64[i] * cosC + mHat64[i] * sinC);
  }

  // 3. Generation Method A (FIR Bandpass Filter) vs Method B (Hilbert Phase-Shift)
  const guard = Math.max(20, Math.min(400, config.guardOffsetHz));
  const filterLowHz =
    config.sideband === 'USB' ? fc + guard : Math.max(120, fc - B - guard);
  const filterHighHz =
    config.sideband === 'USB' ? Math.min(fs * 0.48, fc + B + guard) : Math.max(240, fc - guard);

  let usbOut64: Float64Array = usbHilbert64;
  let lsbOut64: Float64Array = lsbHilbert64;
  let selected64: Float64Array;
  let filterCurve: FilterResponseCurve | null = null;

  if (config.method === 'filter') {
    const selectedTaps = designBandpassFIR(filterLowHz, filterHighHz, config.filterOrder, fs);
    filterCurve = computeFirResponseCurve(selectedTaps, fs, 1024);
    selected64 = applyLinearPhaseFIR64(dsbRef64, selectedTaps);

    // Also compute filtered USB/LSB pair when BPF mode active so individual displays reflect FIR filtering
    if (config.sideband === 'USB') {
      usbOut64 = selected64;
    } else {
      lsbOut64 = selected64;
    }
  } else {
    selected64 = config.sideband === 'USB' ? usbHilbert64 : lsbHilbert64;
  }

  // 4. Shared Channel
  const ssbHilbert64 = hilbertTransform64(selected64);
  const chOut = simulateSharedChannel64(selected64, ssbHilbert64, config.channel, fs);
  const rx64 = chOut.received;

  // 5. Coherent Receiver
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

  const recLpf = fourthOrderButterworthLPF64(prod64, config.receiverLpfCutoffHz, fs);
  const recNoDc = firstOrderDcBlocker64(removeMean64(recLpf), 0.996);
  // s_SSB(t) = 0.5 * Ac [m cos - mHat sin] -> product with Alo cos yields (Ac * Alo / 4) m(t)
  const expectedGain = Math.max(0.01, 0.25 * config.channel.attenuation * Ac * Alo);
  const ssbRec64 = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    ssbRec64[i] = recNoDc[i] / expectedGain;
  }

  // 6. Spectra & Real Sideband Suppression Ratio (dB) measured directly from 8192-pt FFT bins
  const selectedSpectrum = computeFFT64(selected64, fs);
  const freqs = selectedSpectrum.frequencies;
  const linMag = selectedSpectrum.magnitudesLinear;

  let usbBinPow = 0;
  let lsbBinPow = 0;
  for (let k = 0; k < freqs.length; k++) {
    const f = freqs[k];
    const p = linMag[k] * linMag[k];
    if (f > fc + 80 && f <= fc + B + 300) {
      usbBinPow += p;
    } else if (f >= Math.max(80, fc - B - 300) && f < fc - 80) {
      lsbBinPow += p;
    }
  }

  const wantedPow = config.sideband === 'USB' ? usbBinPow : lsbBinPow;
  const unwantedPow = config.sideband === 'USB' ? lsbBinPow : usbBinPow;
  const sidebandSuppressionDb =
    unwantedPow > 1e-14
      ? Math.max(0, Math.min(85, 10 * Math.log10(Math.max(wantedPow, 1e-14) / unwantedPow)))
      : 85;

  const totalPow = computePowerMetrics64(selected64, fs).totalPowerW;
  const metrics = computeMetrics64(m64, ssbRec64);

  return {
    sampleRate: fs,
    numSamples: N,
    durationSec: N / fs,
    config,

    originalMessage: toFloat32(m64),
    hilbertMessage: toFloat32(mHat64),
    carrier: toFloat32(carrier64),
    dsbScReference: toFloat32(dsbRef64),
    usbSignal: toFloat32(usbOut64),
    lsbSignal: toFloat32(lsbOut64),
    selectedSsb: toFloat32(selected64),
    received: toFloat32(rx64),

    localOscillator: toFloat32(lo64),
    product: toFloat32(prod64),
    ssbRecovered: toFloat32(ssbRec64),

    filterCurve,
    filterLowHz,
    filterHighHz,

    totalPowerW: totalPow,
    carrierPowerW: 0,
    wantedSidebandPowerW: totalPow,
    unwantedSidebandPowerW:
      sidebandSuppressionDb > 0 ? totalPow / Math.pow(10, sidebandSuppressionDb / 10) : totalPow,
    sidebandSuppressionDb,
    occupiedBandwidthHz: B,
    dsbReferenceBandwidthHz: 2 * B,
    bandwidthSavingsPct: 50,
    powerEfficiencyPct: 100,
    channelSnrDb: chOut.channelSnrDb,
    metrics,

    spectra: {
      original: computeFFT64(m64, fs),
      dsbScReference: computeFFT64(dsbRef64, fs),
      usb: computeFFT64(usbOut64, fs),
      lsb: computeFFT64(lsbOut64, fs),
      selectedSsb: selectedSpectrum,
      received: computeFFT64(rx64, fs),
      recovered: computeFFT64(ssbRec64, fs),
    },
  };
}
