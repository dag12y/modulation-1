import {
  biquadLPF64,
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
import { SharedChannelConfig, simulateSharedChannel64 } from './channel';
import { FFTSpectrum, LAB_SAMPLE_RATE } from './types';

export interface DSBSCLabConfig {
  carrierFreqHz: number;
  carrierAmpV: number;
  bandlimitMessage: boolean;
  messageLpfCutoffHz: number;
  messageBWHz: number;

  // Coherent Receiver
  localCarrierAmpV: number;
  localPhaseErrorDeg: number;
  localFreqOffsetHz: number;
  receiverLpfCutoffHz: number;

  // Costas Loop Carrier Recovery
  costasInitialPhaseDeg: number;
  costasInitialFreqOffsetHz: number;
  costasLoopGain: number; // proportional gain [0.1 .. 3.0]
  costasDampingFactor: number;
  costasArmLpfCutoffHz: number;

  channel: SharedChannelConfig;
}

export const DEFAULT_DSBSC_CONFIG: DSBSCLabConfig = {
  carrierFreqHz: 6000,
  carrierAmpV: 1.0,
  bandlimitMessage: true,
  messageLpfCutoffHz: 3400,
  messageBWHz: 3400,

  localCarrierAmpV: 1.0,
  localPhaseErrorDeg: 0,
  localFreqOffsetHz: 0,
  receiverLpfCutoffHz: 3500,

  costasInitialPhaseDeg: 45,
  costasInitialFreqOffsetHz: 15,
  costasLoopGain: 1.0,
  costasDampingFactor: 0.707,
  costasArmLpfCutoffHz: 3500,

  channel: {
    attenuation: 1.0,
    awgnEnabled: false,
    noiseSigma: 0.04,
    phaseShiftDeg: 0,
    freqOffsetHz: 0,
    noiseSeed: 2025,
  },
};

export interface DSBSCSimulationResult {
  sampleRate: number;
  numSamples: number;
  durationSec: number;
  config: DSBSCLabConfig;

  // Time-domain signals (Float32Array ready for Oscilloscope & WebAudioEngine)
  originalMessage: Float32Array;
  carrier: Float32Array;
  modulated: Float32Array;
  upperSideband: Float32Array;
  lowerSideband: Float32Array;
  received: Float32Array;
  noise: Float32Array;

  // Coherent Demodulator
  localOscillator: Float32Array;
  product: Float32Array;
  doubleFreqComponent: Float32Array;
  coherentRecovered: Float32Array;
  cosPhiFactor: number;

  // Costas Loop Receiver
  costasRecovered: Float32Array;
  costasQArm: Float32Array;
  costasPhaseErrorDegTrace: number[]; // downsampled ~240 pts for convergence chart
  costasTimeTraceSec: number[];
  costasFinalPhaseErrorDeg: number;
  costasLocked: boolean;
  costasPhaseInverted: boolean;

  // Power, Bandwidth & Metrics
  totalPowerW: number;
  carrierPowerW: number; // 0 W (suppressed)
  sidebandPowerW: number;
  powerEfficiencyPct: number; // 100%
  occupiedBandwidthHz: number;
  channelSnrDb: number;
  coherentMetrics: SignalMetrics64;
  costasMetrics: SignalMetrics64;

  // 8192-pt FFT Spectra
  spectra: {
    original: FFTSpectrum;
    carrier: FFTSpectrum;
    modulated: FFTSpectrum;
    received: FFTSpectrum;
    product: FFTSpectrum;
    coherentRecovered: FFTSpectrum;
    costasRecovered: FFTSpectrum;
  };
}

export function simulateDSBSCSystem(
  rawMessage64: Float64Array,
  config: DSBSCLabConfig,
  fs: number = LAB_SAMPLE_RATE
): DSBSCSimulationResult {
  const N = rawMessage64.length;
  const fc = config.carrierFreqHz;
  const Ac = config.carrierAmpV;

  // 1. Prepare bandlimited, DC-free message m(t)
  const dcFree = removeMean64(rawMessage64);
  const bandlimited = config.bandlimitMessage
    ? fourthOrderButterworthLPF64(dcFree, config.messageLpfCutoffHz, fs)
    : dcFree;
  const m64 = peakNormalize64(bandlimited, 0.9);
  const mHat64 = hilbertTransform64(m64);

  // 2. Carrier & DSB-SC Modulation: s(t) = Ac * m(t) * cos(2*pi*fc*t)
  const carrier64 = new Float64Array(N);
  const modulated64 = new Float64Array(N);
  const usb64 = new Float64Array(N);
  const lsb64 = new Float64Array(N);

  for (let i = 0; i < N; i++) {
    const angle = (2 * Math.PI * fc * i) / fs;
    const cosC = Math.cos(angle);
    const sinC = Math.sin(angle);
    carrier64[i] = Ac * cosC;
    modulated64[i] = Ac * m64[i] * cosC;
    usb64[i] = 0.5 * Ac * (m64[i] * cosC - mHat64[i] * sinC);
    lsb64[i] = 0.5 * Ac * (m64[i] * cosC + mHat64[i] * sinC);
  }

  // 3. Shared Channel (attenuation, phase/freq drift, AWGN)
  const modHilbert64 = hilbertTransform64(modulated64);
  const chOut = simulateSharedChannel64(modulated64, modHilbert64, config.channel, fs);
  const rx64 = chOut.received;

  // 4. Coherent Receiver
  const Alo = config.localCarrierAmpV;
  const phiLoRad = (config.localPhaseErrorDeg * Math.PI) / 180;
  const dfLo = config.localFreqOffsetHz;

  const lo64 = new Float64Array(N);
  const prod64 = new Float64Array(N);
  const doubleFreq64 = new Float64Array(N);

  for (let i = 0; i < N; i++) {
    const t = i / fs;
    const loAngle = 2 * Math.PI * (fc + dfLo) * t + phiLoRad;
    const loVal = Alo * Math.cos(loAngle);
    lo64[i] = loVal;
    const p = rx64[i] * loVal;
    prod64[i] = p;
    // Isolate 2fc component mathematically for inspection
    const dAngle = 2 * Math.PI * (2 * fc + dfLo) * t + phiLoRad;
    doubleFreq64[i] = 0.5 * config.channel.attenuation * Ac * Alo * m64[i] * Math.cos(dAngle);
  }

  const cohLpf = fourthOrderButterworthLPF64(prod64, config.receiverLpfCutoffHz, fs);
  const cohNoDc = firstOrderDcBlocker64(removeMean64(cohLpf), 0.996);
  const expectedCohGain = Math.max(0.02, 0.5 * config.channel.attenuation * Ac * Alo);
  const coherentRec64 = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    coherentRec64[i] = cohNoDc[i] / expectedCohGain;
  }

  // 5. Costas Loop Carrier Recovery (Discrete I/Q Quadrature PLL)
  const costasIRaw = new Float64Array(N);
  const costasQRaw = new Float64Array(N);

  const armFc = Math.max(200, Math.min(config.costasArmLpfCutoffHz, fs * 0.4));
  const w0 = (2 * Math.PI * armFc) / fs;
  const cosW = Math.cos(w0);
  const sinW = Math.sin(w0);
  const alphaArm = sinW / (2 * 0.7071);
  const normArm = 1 / (1 + alphaArm);
  const b0 = ((1 - cosW) * 0.5) * normArm;
  const b1 = (1 - cosW) * normArm;
  const b2 = b0;
  const a1 = -2 * cosW * normArm;
  const a2 = (1 - alphaArm) * normArm;

  let iX1 = 0, iX2 = 0, iY1 = 0, iY2 = 0;
  let qX1 = 0, qX2 = 0, qY1 = 0, qY2 = 0;

  // Estimate incoming RF RMS amplitude for normalized PLL loop bandwidth
  const rxPow = computePowerMetrics64(rx64, fs).totalPowerW;
  const rxNormFactor = Math.max(0.01, rxPow * 2);

  let vcoPhase = (config.costasInitialPhaseDeg * Math.PI) / 180;
  const omegaNominal =
    (2 * Math.PI * (fc + config.costasInitialFreqOffsetHz)) / fs;
  let freqIntegrator = 0;

  // Loop filter gains scaled smoothly by costasLoopGain & damping
  const zeta = Math.max(0.3, config.costasDampingFactor);
  const wn = (18 * config.costasLoopGain * 2 * Math.PI) / fs;
  const kp = 2 * zeta * wn;
  const ki = wn * wn;

  const tracePoints = 240;
  const traceStride = Math.max(1, Math.floor(N / tracePoints));
  const phaseErrTrace: number[] = [];
  const timeTraceSec: number[] = [];

  let envPowerAvg = rxNormFactor;

  for (let n = 0; n < N; n++) {
    const rVal = rx64[n];
    const cosV = Math.cos(vcoPhase);
    const sinV = Math.sin(vcoPhase);

    // Dual product detectors (gain 2 so baseband I recovers alpha * Ac * m(t) directly)
    const iProd = 2 * rVal * cosV;
    const qProd = -2 * rVal * sinV;

    // 2nd-order arm LPFs
    const iFilt = b0 * iProd + b1 * iX1 + b2 * iX2 - a1 * iY1 - a2 * iY2;
    iX2 = iX1; iX1 = iProd; iY2 = iY1; iY1 = iFilt;

    const qFilt = b0 * qProd + b1 * qX1 + b2 * qX2 - a1 * qY1 - a2 * qY2;
    qX2 = qX1; qX1 = qProd; qY2 = qY1; qY1 = qFilt;

    costasIRaw[n] = iFilt;
    costasQRaw[n] = qFilt;

    // Smooth energy tracker prevents silent syllables from dropping loop gain to zero
    const instPow = iFilt * iFilt + qFilt * qFilt;
    envPowerAvg = 0.995 * envPowerAvg + 0.005 * Math.max(instPow, rxNormFactor * 0.1);
    // Error signal e ~ sin(2 * theta_err) / 2, divided by instantaneous power
    const phaseErr = -(iFilt * qFilt) / Math.max(0.01, envPowerAvg);

    freqIntegrator += ki * phaseErr;
    // Clamp integrator drift within +/- 600 Hz
    const maxDriftRad = (2 * Math.PI * 600) / fs;
    if (freqIntegrator > maxDriftRad) freqIntegrator = maxDriftRad;
    if (freqIntegrator < -maxDriftRad) freqIntegrator = -maxDriftRad;

    vcoPhase += omegaNominal + kp * phaseErr + freqIntegrator;

    if (n % traceStride === 0 && phaseErrTrace.length < tracePoints) {
      // Actual channel+carrier angle at sample n
      const trueAngle =
        (2 * Math.PI * (fc + config.channel.freqOffsetHz) * n) / fs +
        (config.channel.phaseShiftDeg * Math.PI) / 180;
      // Wrap difference modulo 2*pi then fold modulo pi (Costas 180° symmetry)
      let diffRad = (vcoPhase - trueAngle) % (2 * Math.PI);
      if (diffRad > Math.PI) diffRad -= 2 * Math.PI;
      if (diffRad < -Math.PI) diffRad += 2 * Math.PI;
      // Fold to [-pi/2, +pi/2] for residual phase error magnitude
      if (diffRad > Math.PI / 2) diffRad -= Math.PI;
      if (diffRad < -Math.PI / 2) diffRad += Math.PI;
      phaseErrTrace.push((diffRad * 180) / Math.PI);
      timeTraceSec.push(n / fs);
    }
  }

  const costasClean = firstOrderDcBlocker64(
    removeMean64(biquadLPF64(costasIRaw, config.receiverLpfCutoffHz, fs, 0.7071)),
    0.996
  );
  const costasScale = Math.max(0.05, config.channel.attenuation * Ac);
  const costasRec64 = new Float64Array(N);
  const costasQ64 = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    costasRec64[i] = costasClean[i] / costasScale;
    costasQ64[i] = costasQRaw[i] / costasScale;
  }

  // Final steady-state phase error over last 15% of trace
  const tailCount = Math.max(4, Math.floor(phaseErrTrace.length * 0.15));
  let tailSumAbs = 0;
  for (let i = phaseErrTrace.length - tailCount; i < phaseErrTrace.length; i++) {
    tailSumAbs += Math.abs(phaseErrTrace[i] ?? 0);
  }
  const costasFinalPhaseErrorDeg = tailSumAbs / tailCount;
  const costasLocked = costasFinalPhaseErrorDeg < 12;

  // Metrics & Power
  const coherentMetrics = computeMetrics64(m64, coherentRec64);
  const costasMetrics = computeMetrics64(m64, costasRec64);
  const costasPhaseInverted = costasMetrics.signedPearsonR < -0.25;

  const txPow = computePowerMetrics64(modulated64, fs).totalPowerW;
  const effectivePhaseTotalRad =
    ((config.channel.phaseShiftDeg - config.localPhaseErrorDeg) * Math.PI) / 180;
  const cosPhiFactor = Math.cos(effectivePhaseTotalRad);

  const orig32 = toFloat32(m64);
  const carrier32 = toFloat32(carrier64);
  const mod32 = toFloat32(modulated64);
  const rx32 = toFloat32(rx64);
  const prod32 = toFloat32(prod64);
  const coh32 = toFloat32(coherentRec64);
  const cos32 = toFloat32(costasRec64);

  return {
    sampleRate: fs,
    numSamples: N,
    durationSec: N / fs,
    config,

    originalMessage: orig32,
    carrier: carrier32,
    modulated: mod32,
    upperSideband: toFloat32(usb64),
    lowerSideband: toFloat32(lsb64),
    received: rx32,
    noise: toFloat32(chOut.noise),

    localOscillator: toFloat32(lo64),
    product: prod32,
    doubleFreqComponent: toFloat32(doubleFreq64),
    coherentRecovered: coh32,
    cosPhiFactor,

    costasRecovered: cos32,
    costasQArm: toFloat32(costasQ64),
    costasPhaseErrorDegTrace: phaseErrTrace,
    costasTimeTraceSec: timeTraceSec,
    costasFinalPhaseErrorDeg,
    costasLocked,
    costasPhaseInverted,

    totalPowerW: txPow,
    carrierPowerW: 0,
    sidebandPowerW: txPow,
    powerEfficiencyPct: 100,
    occupiedBandwidthHz: 2 * config.messageBWHz,
    channelSnrDb: chOut.channelSnrDb,
    coherentMetrics,
    costasMetrics,

    spectra: {
      original: computeFFT64(m64, fs),
      carrier: computeFFT64(carrier64, fs),
      modulated: computeFFT64(modulated64, fs),
      received: computeFFT64(rx64, fs),
      product: computeFFT64(prod64, fs),
      coherentRecovered: computeFFT64(coherentRec64, fs),
      costasRecovered: computeFFT64(costasRec64, fs),
    },
  };
}
