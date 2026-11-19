import { AMSimConfig, EnvelopeSummary, LAB_SAMPLE_RATE } from './types';
import {
  discreteHilbertFIR,
  fourthOrderButterworthLPF,
  generateGaussianNoise,
  removeMean,
} from './filters';

export interface AMTransmitterOutput {
  originalMessage: Float32Array;
  normalizedMessage: Float32Array;
  carrier: Float32Array;
  amModulated: Float32Array;
  upperSideband: Float32Array;
  lowerSideband: Float32Array;
  receivedAM: Float32Array;
  idealEnvelope: Float32Array;
  summary: EnvelopeSummary;
}

/**
 * Generates Conventional AM (DSB-FC):
 *   s(t) = A_c [1 + mu * m_n(t)] cos(2 * pi * f_c * t)
 * along with analytical USB/LSB decomposition and Channel effects.
 */
export function runAMTransmitterAndChannel(
  rawMessage: Float32Array,
  config: AMSimConfig,
  fs: number = LAB_SAMPLE_RATE
): AMTransmitterOutput {
  const N = rawMessage.length;

  // 1. Optional message bandlimiting LPF (default 3400 Hz)
  const dcFree = removeMean(rawMessage);
  const bandlimited = config.bandlimitMessage
    ? fourthOrderButterworthLPF(dcFree, config.messageLpfCutoffHz, fs)
    : dcFree;

  // Normalize message m_n(t) so max |m_n(t)| = 1.0 (before messageGain)
  let maxAbs = 0;
  for (let i = 0; i < N; i++) {
    const a = Math.abs(bandlimited[i]);
    if (a > maxAbs) maxAbs = a;
  }
  const normScale = maxAbs > 1e-9 ? 1.0 / maxAbs : 1.0;

  const originalMessage = new Float32Array(N);
  const normalizedMessage = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const mn = bandlimited[i] * normScale * config.messageGain;
    normalizedMessage[i] = mn;
    originalMessage[i] = mn;
  }

  // Hilbert transform for analytical USB & LSB sideband separation
  const mHat = discreteHilbertFIR(normalizedMessage);

  const Ac = config.carrierAmpV;
  const fc = config.carrierFreqHz;
  const mu = config.modulationIndex;

  const carrier = new Float32Array(N);
  const amModulated = new Float32Array(N);
  const upperSideband = new Float32Array(N);
  const lowerSideband = new Float32Array(N);
  const idealEnvelope = new Float32Array(N);

  // Instantaneous envelope bounds for A_max and A_min
  let envMax = -Infinity;
  let envMin = Infinity;

  for (let i = 0; i < N; i++) {
    const t = i / fs;
    const angle = 2 * Math.PI * fc * t;
    const cosC = Math.cos(angle);
    const sinC = Math.sin(angle);
    const mn = normalizedMessage[i];
    const mh = mHat[i];

    carrier[i] = Ac * cosC;
    const envSigned = Ac * (1 + mu * mn);
    idealEnvelope[i] = Math.abs(envSigned);
    amModulated[i] = envSigned * cosC;

    // USB = (mu * Ac / 2) [m_n(t) cos(wc t) - m_hat(t) sin(wc t)]
    // LSB = (mu * Ac / 2) [m_n(t) cos(wc t) + m_hat(t) sin(wc t)]
    const sbScale = 0.5 * mu * Ac;
    upperSideband[i] = sbScale * (mn * cosC - mh * sinC);
    lowerSideband[i] = sbScale * (mn * cosC + mh * sinC);

    // Measure after initial 5% transient
    if (i > N * 0.05) {
      if (envSigned > envMax) envMax = envSigned;
      if (envSigned < envMin) envMin = envSigned;
    }
  }

  if (!Number.isFinite(envMax)) envMax = Ac * (1 + mu);
  if (!Number.isFinite(envMin)) envMin = Ac * (1 - mu);

  // 2. Shared Channel: attenuation + optional carrier phase shift & freq offset + seeded AWGN
  const receivedAM = new Float32Array(N);
  const alpha = config.channelAttenuation;
  const chPhaseRad = (config.carrierPhaseShiftDeg * Math.PI) / 180;
  const chFreqOff = config.freqOffsetHz;
  const applyRfShift = Math.abs(chPhaseRad) > 1e-6 || Math.abs(chFreqOff) > 1e-6;

  // For RF phase/freq shift on the passband AM signal, shift carrier directly using analytic envelope
  const noise = config.awgnEnabled
    ? generateGaussianNoise(N, config.noiseSigma, config.noiseSeed)
    : null;

  for (let i = 0; i < N; i++) {
    let rfVal: number;
    if (applyRfShift) {
      const t = i / fs;
      const shiftedAngle = 2 * Math.PI * (fc + chFreqOff) * t + chPhaseRad;
      rfVal = Ac * (1 + mu * normalizedMessage[i]) * Math.cos(shiftedAngle);
    } else {
      rfVal = amModulated[i];
    }
    receivedAM[i] = alpha * rfVal + (noise ? noise[i] : 0);
  }

  // 3. Modulation Index, Envelope, and Power Metrics
  const aMax = Math.max(0, envMax);
  const aMin = Math.max(0, envMin);
  const measuredMu = aMax + aMin > 1e-9 ? (aMax - aMin) / (aMax + aMin) : 0;
  const theoreticalMu = mu * config.messageGain;

  const classification: 'under' | 'critical' | 'over' =
    theoreticalMu > 1.01 ? 'over' : Math.abs(theoreticalMu - 1.0) <= 0.01 ? 'critical' : 'under';

  const maxMessageFreqHz = config.bandlimitMessage ? config.messageLpfCutoffHz : 3400;
  const bandwidthHz = 2 * maxMessageFreqHz;

  const carrierPowerW = (Ac * Ac) / 2;
  // Message RMS squared for normalized signal
  let mSqSum = 0;
  for (let i = 0; i < N; i++) mSqSum += normalizedMessage[i] * normalizedMessage[i];
  const mRmsSq = N > 0 ? mSqSum / N : 0.5;
  const sidebandPowerW = 0.5 * Ac * Ac * mu * mu * mRmsSq;
  const totalPowerW = carrierPowerW + sidebandPowerW;
  const efficiencyPct = totalPowerW > 0 ? (sidebandPowerW / totalPowerW) * 100 : 0;

  return {
    originalMessage,
    normalizedMessage,
    carrier,
    amModulated,
    upperSideband,
    lowerSideband,
    receivedAM,
    idealEnvelope,
    summary: {
      aMax,
      aMin,
      measuredMu,
      theoreticalMu,
      percentModulation: theoreticalMu * 100,
      carrierAmpV: Ac,
      usbAmpV: (theoreticalMu * Ac) / 2,
      lsbAmpV: (theoreticalMu * Ac) / 2,
      carrierPowerW,
      sidebandPowerW,
      totalPowerW,
      efficiencyPct,
      classification,
      bandwidthHz,
      maxMessageFreqHz,
    },
  };
}
