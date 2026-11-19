import { AMSimConfig, EnvelopeDetectorOutput, LAB_SAMPLE_RATE } from './types';
import { firstOrderDcBlocker, fourthOrderButterworthLPF, removeMean } from './filters';

/**
 * Conventional AM Envelope Detector:
 *   Stage 1: Received AM signal r(t)
 *   Stage 2: Full-wave rectifier v_r(t) = |r(t)|
 *   Stage 3: Causal peak-following RC envelope detector (attack / release)
 *   Stage 4: DC removal + optional 4th-order Butterworth LPF -> envelopeRecovered
 */
export function runEnvelopeDetector(
  received: Float32Array,
  idealEnvelope: Float32Array,
  config: AMSimConfig,
  fs: number = LAB_SAMPLE_RATE
): EnvelopeDetectorOutput {
  const N = received.length;
  const dt = 1 / fs;

  // Stage 2: Full-wave rectifier
  const rectified = new Float32Array(N);
  if (config.rectifierEnabled) {
    for (let i = 0; i < N; i++) {
      rectified[i] = Math.abs(received[i]);
    }
  } else {
    rectified.set(received);
  }

  // Stage 3: Causal peak-following RC envelope detector
  const envelope = new Float32Array(N);
  const attackSec = Math.max(0.00001, config.attackTimeMs / 1000);
  const releaseSec = Math.max(0.00005, config.releaseTimeMs / 1000);
  const attackAlpha = 1 - Math.exp(-dt / attackSec);
  const releaseDecay = Math.exp(-dt / releaseSec);

  let envState = rectified[0] || 0;
  for (let i = 0; i < N; i++) {
    const x = rectified[i];
    if (x > envState) {
      envState = envState + attackAlpha * (x - envState);
    } else {
      envState = envState * releaseDecay;
    }
    envelope[i] = envState;
  }

  // Stage 4: DC Removal + Optional 4th-order Butterworth LPF
  let postDc: Float32Array;
  if (config.dcRemovalEnabled) {
    const zeroMean = removeMean(envelope);
    postDc = firstOrderDcBlocker(zeroMean, 0.996);
  } else {
    postDc = new Float32Array(envelope);
  }

  const envelopeNoDc = new Float32Array(postDc);

  const filtered = config.envelopeLpfEnabled
    ? fourthOrderButterworthLPF(postDc, config.receiverLpfCutoffHz, fs)
    : postDc;

  // Scale to compare against normalized message m(t) without distorting overmodulation artifacts
  const expectedScale =
    Math.max(0.05, config.channelAttenuation) *
    Math.max(0.1, config.carrierAmpV) *
    Math.max(0.05, config.modulationIndex);
  const envelopeRecovered = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    envelopeRecovered[i] = filtered[i] / expectedScale;
  }

  // Envelope tracking quality relative to channel-scaled ideal envelope
  let errSq = 0;
  let refSq = 0;
  const startIdx = Math.floor(N * 0.05);
  for (let i = startIdx; i < N; i++) {
    const refVal = idealEnvelope[i] * config.channelAttenuation;
    const diff = envelope[i] - refVal;
    errSq += diff * diff;
    refSq += refVal * refVal;
  }
  const relErr = refSq > 1e-9 ? Math.sqrt(errSq / refSq) : 0;
  const trackingQualityPct = Math.max(0, Math.min(100, (1 - relErr) * 100));

  return {
    received,
    rectified,
    envelope,
    envelopeNoDc,
    envelopeRecovered,
    idealEnvelope,
    trackingQualityPct,
  };
}
