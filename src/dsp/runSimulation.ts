import { AMSimConfig, AMSimulationResult, LAB_SAMPLE_RATE } from './types';
import { runAMTransmitterAndChannel } from './amModulator';
import { runEnvelopeDetector } from './envelopeDetector';
import { runCoherentDemodulator } from './coherentDemodulator';
import { computeReceiverMetrics } from './metrics';
import { computeRadix2FFT } from './fft';

/**
 * Pure TypeScript Conventional AM (DSB-FC) DSP Pipeline:
 *   runSimulation(rawMessage, config)
 * Generates transmitter, shared channel, Envelope Detector, Coherent Demodulator,
 * 8192-pt Hann FFT spectra, and lag-aligned performance metrics at 44,100 Hz.
 */
export function runSimulation(
  rawMessage: Float32Array,
  config: AMSimConfig,
  sampleRate: number = LAB_SAMPLE_RATE
): AMSimulationResult {
  const tx = runAMTransmitterAndChannel(rawMessage, config, sampleRate);

  const envelope = runEnvelopeDetector(tx.receivedAM, tx.idealEnvelope, config, sampleRate);
  const coherent = runCoherentDemodulator(tx.receivedAM, config, sampleRate);

  const envelopeMetrics = computeReceiverMetrics({
    original: tx.originalMessage,
    recovered: envelope.envelopeRecovered,
    extractedEnvelope: envelope.envelope,
    idealEnvelope: tx.idealEnvelope,
    config,
    coherentPhaseErrorDeg: 0,
  });

  const coherentMetrics = computeReceiverMetrics({
    original: tx.originalMessage,
    recovered: coherent.coherentRecovered,
    extractedEnvelope: envelope.envelope,
    idealEnvelope: tx.idealEnvelope,
    config,
    coherentPhaseErrorDeg: coherent.effectivePhaseDeg,
  });

  const spectra = {
    original: computeRadix2FFT(tx.originalMessage, sampleRate),
    carrier: computeRadix2FFT(tx.carrier, sampleRate),
    modulated: computeRadix2FFT(tx.amModulated, sampleRate),
    received: computeRadix2FFT(tx.receivedAM, sampleRate),
    rectified: computeRadix2FFT(envelope.rectified, sampleRate),
    envelope: computeRadix2FFT(envelope.envelopeNoDc, sampleRate),
    product: computeRadix2FFT(coherent.product, sampleRate),
    envelopeRecovered: computeRadix2FFT(envelope.envelopeRecovered, sampleRate),
    coherentRecovered: computeRadix2FFT(coherent.coherentRecovered, sampleRate),
  };

  return {
    sampleRate,
    durationSec: rawMessage.length / sampleRate,
    numSamples: rawMessage.length,
    config,

    originalMessage: tx.originalMessage,
    normalizedMessage: tx.normalizedMessage,
    carrier: tx.carrier,
    amModulated: tx.amModulated,
    upperSideband: tx.upperSideband,
    lowerSideband: tx.lowerSideband,
    receivedAM: tx.receivedAM,

    envelope,
    coherent,

    modulationSummary: tx.summary,
    envelopeMetrics,
    coherentMetrics,

    spectra,
  };
}
