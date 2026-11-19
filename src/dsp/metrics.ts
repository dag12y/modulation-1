import { AMSimConfig, ReceiverMetricsResult } from './types';

/**
 * Computes lag-aligned Pearson correlation (accounting for polarity inversion),
 * SNR (dB), MSE, recovery amplitude ratio, envelope tracking error, and distortion.
 */
export function computeReceiverMetrics(params: {
  original: Float32Array;
  recovered: Float32Array;
  extractedEnvelope: Float32Array;
  idealEnvelope: Float32Array;
  config: AMSimConfig;
  coherentPhaseErrorDeg?: number;
}): ReceiverMetricsResult {
  const {
    original,
    recovered,
    extractedEnvelope,
    idealEnvelope,
    config,
    coherentPhaseErrorDeg = 0,
  } = params;

  const N = Math.min(original.length, recovered.length);
  const startIdx = Math.floor(N * 0.08);
  const endIdx = Math.floor(N * 0.95);
  const count = Math.max(1, endIdx - startIdx);

  // Search small causal group-delay lag window [0..140] samples (~3.2 ms max at 44.1 kHz)
  const maxLag = Math.min(140, Math.floor(count / 4));
  let bestAbsR = -1;
  let bestSignedR = 0;
  let bestLag = 0;

  // Precompute original variance on reference slice
  let origMean = 0;
  for (let i = startIdx; i < endIdx - maxLag; i++) {
    origMean += original[i];
  }
  const evalCount = Math.max(1, endIdx - maxLag - startIdx);
  origMean /= evalCount;

  let origVar = 0;
  let origPower = 0;
  for (let i = startIdx; i < endIdx - maxLag; i++) {
    const o = original[i] - origMean;
    origVar += o * o;
    origPower += original[i] * original[i];
  }

  for (let lag = 0; lag <= maxLag; lag += 2) {
    let recMean = 0;
    for (let i = startIdx; i < endIdx - maxLag; i++) {
      recMean += recovered[i + lag];
    }
    recMean /= evalCount;

    let recVar = 0;
    let cov = 0;
    for (let i = startIdx; i < endIdx - maxLag; i++) {
      const o = original[i] - origMean;
      const r = recovered[i + lag] - recMean;
      recVar += r * r;
      cov += o * r;
    }

    const denom = Math.sqrt(origVar * recVar);
    const rVal = denom > 1e-12 ? cov / denom : 0;
    if (Math.abs(rVal) > bestAbsR) {
      bestAbsR = Math.abs(rVal);
      bestSignedR = rVal;
      bestLag = lag;
    }
  }

  // Refine lag by +/-1 sample around bestLag
  for (let lag = Math.max(0, bestLag - 1); lag <= Math.min(maxLag, bestLag + 1); lag++) {
    let recMean = 0;
    for (let i = startIdx; i < endIdx - maxLag; i++) {
      recMean += recovered[i + lag];
    }
    recMean /= evalCount;

    let recVar = 0;
    let cov = 0;
    for (let i = startIdx; i < endIdx - maxLag; i++) {
      const o = original[i] - origMean;
      const r = recovered[i + lag] - recMean;
      recVar += r * r;
      cov += o * r;
    }

    const denom = Math.sqrt(origVar * recVar);
    const rVal = denom > 1e-12 ? cov / denom : 0;
    if (Math.abs(rVal) > bestAbsR) {
      bestAbsR = Math.abs(rVal);
      bestSignedR = rVal;
      bestLag = lag;
    }
  }

  // Compute MSE, SNR, and RMS amplitude ratio at optimal lag
  let mseSum = 0;
  let recPower = 0;
  for (let i = startIdx; i < endIdx - maxLag; i++) {
    const o = original[i];
    const r = recovered[i + bestLag];
    const err = o - r;
    mseSum += err * err;
    recPower += r * r;
  }

  const mse = mseSum / evalCount;
  const origRms = Math.sqrt(origPower / evalCount);
  const recRms = Math.sqrt(recPower / evalCount);
  const amplitudeRatio = origRms > 1e-9 ? recRms / origRms : 0;

  // Gain-normalized shape SNR for distortion & quality assessment
  const gainAlign = recPower > 1e-12 ? (bestSignedR * Math.sqrt(origPower * recPower)) / recPower : 1;
  let alignedErrSum = 0;
  for (let i = startIdx; i < endIdx - maxLag; i++) {
    const err = original[i] - recovered[i + bestLag] * Math.abs(gainAlign);
    alignedErrSum += err * err;
  }
  const snrDb =
    mseSum > 1e-12 ? Math.max(-40, Math.min(80, 10 * Math.log10(origPower / mseSum))) : 60;
  const recoveryDistortionPct =
    origPower > 1e-12 ? Math.min(100, Math.sqrt(alignedErrSum / origPower) * 100) : 0;

  // Envelope tracking error & estimated modulation index from extracted envelope
  let envErrSq = 0;
  let envRefSq = 0;
  let envMax = -Infinity;
  let envMin = Infinity;
  for (let i = startIdx; i < endIdx; i++) {
    const e = extractedEnvelope[i];
    const refE = idealEnvelope[i] * config.channelAttenuation;
    const d = e - refE;
    envErrSq += d * d;
    envRefSq += refE * refE;
    if (e > envMax) envMax = e;
    if (e < envMin) envMin = e;
  }
  const envelopeTrackingError = envRefSq > 1e-9 ? Math.sqrt(envErrSq / envRefSq) : 0;
  const aMaxEst = Math.max(0, envMax);
  const aMinEst = Math.max(0, envMin);
  const estimatedMu = aMaxEst + aMinEst > 1e-9 ? (aMaxEst - aMinEst) / (aMaxEst + aMinEst) : 0;

  return {
    snrDb,
    mse,
    pearsonR: Math.max(0, Math.min(1, bestAbsR)),
    signedPearsonR: Math.max(-1, Math.min(1, bestSignedR)),
    lagSamples: bestLag,
    amplitudeRatio,
    envelopeTrackingError,
    estimatedMu,
    coherentPhaseErrorDeg,
    recoveryDistortionPct,
  };
}
