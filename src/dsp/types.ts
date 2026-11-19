export const LAB_SAMPLE_RATE = 44100;
export const MAX_AUDIO_DURATION_SEC = 15;
export const FFT_SIZE = 8192;

export type BuiltinAudioSource = 'vocal';
export type AudioSourceKind = BuiltinAudioSource | 'custom';

export type SignalTrackId =
  | 'original'
  | 'carrier'
  | 'modulated'
  | 'received'
  | 'rectified'
  | 'envelope'
  | 'product'
  | 'doubleFreq'
  | 'coherentRecovered'
  | 'envelopeRecovered'
  | 'dsbSc'
  | 'ssbUsb'
  | 'ssbLsb'
  | 'ssbSelected'
  | 'vsb'
  | 'noise'
  | 'dsbFc'
  | 'dsbFcRecovered'
  | 'costasRecovered'
  | 'ssbRecovered'
  | 'vsbRecovered';

export interface AMSimConfig {
  // Source
  sourceKind: AudioSourceKind;
  singleToneFreqHz: number;

  // Transmitter
  carrierFreqHz: number;      // default 6000 Hz (100 - 10000 Hz)
  carrierAmpV: number;        // default 1.0 V (0.5 - 2.0 V)
  modulationIndex: number;    // default 0.65 (0 - 1.5)
  messageGain: number;        // default 1.0 (0.1 - 2.0)
  bandlimitMessage: boolean;  // default true
  messageLpfCutoffHz: number; // default 3400 Hz

  // Channel
  channelAttenuation: number; // default 1.0 (0 - 1)
  awgnEnabled: boolean;       // default false
  noiseSigma: number;         // default 0.05 (0 - 0.2)
  carrierPhaseShiftDeg: number; // default 0 deg (0 - 180)
  freqOffsetHz: number;       // default 0 Hz (-500 to +500 Hz)
  noiseSeed: number;

  // Envelope Detector (Tab 1)
  rcTimeMs: number;           // default 2.5 ms
  attackTimeMs: number;       // default 0.08 ms
  releaseTimeMs: number;      // default 2.5 ms
  rectifierEnabled: boolean;  // default true
  dcRemovalEnabled: boolean;  // default true
  envelopeLpfEnabled: boolean;// default true
  receiverLpfCutoffHz: number;// default 3500 Hz (100 - 5000 Hz)

  // Coherent Demodulator (Tab 2)
  localCarrierAmpV: number;      // default 1.0 V
  localCarrierPhaseDeg: number;  // default 0 deg (0 - 180)
  localCarrierFreqOffsetHz: number; // default 0 Hz
}

export const DEFAULT_AM_CONFIG: AMSimConfig = {
  sourceKind: 'vocal',
  singleToneFreqHz: 500,

  carrierFreqHz: 6000,
  carrierAmpV: 1.0,
  modulationIndex: 0.65,
  messageGain: 1.0,
  bandlimitMessage: true,
  messageLpfCutoffHz: 3400,

  channelAttenuation: 1.0,
  awgnEnabled: false,
  noiseSigma: 0.05,
  carrierPhaseShiftDeg: 0,
  freqOffsetHz: 0,
  noiseSeed: 1337,

  rcTimeMs: 2.5,
  attackTimeMs: 0.08,
  releaseTimeMs: 2.5,
  rectifierEnabled: true,
  dcRemovalEnabled: true,
  envelopeLpfEnabled: true,
  receiverLpfCutoffHz: 3500,

  localCarrierAmpV: 1.0,
  localCarrierPhaseDeg: 0,
  localCarrierFreqOffsetHz: 0,
};

export interface FFTSpectrum {
  frequencies: Float32Array;
  magnitudesDb: Float32Array;
  magnitudesLinear: Float32Array;
  peakFreqHz: number;
  peakDb: number;
  fftSize: number;
}

export interface EnvelopeSummary {
  aMax: number;
  aMin: number;
  measuredMu: number;
  theoreticalMu: number;
  percentModulation: number;
  carrierAmpV: number;
  usbAmpV: number;
  lsbAmpV: number;
  carrierPowerW: number;
  sidebandPowerW: number;
  totalPowerW: number;
  efficiencyPct: number;
  classification: 'under' | 'critical' | 'over';
  bandwidthHz: number;
  maxMessageFreqHz: number;
}

export interface ReceiverMetricsResult {
  snrDb: number;
  mse: number;
  pearsonR: number;
  signedPearsonR: number;
  lagSamples: number;
  amplitudeRatio: number;
  envelopeTrackingError: number;
  estimatedMu: number;
  coherentPhaseErrorDeg: number;
  recoveryDistortionPct: number;
}

export interface EnvelopeDetectorOutput {
  received: Float32Array;
  rectified: Float32Array;
  envelope: Float32Array;
  envelopeNoDc: Float32Array;
  envelopeRecovered: Float32Array;
  idealEnvelope: Float32Array;
  trackingQualityPct: number;
}

export interface CoherentDemodOutput {
  localOscillator: Float32Array;
  product: Float32Array;
  doubleFreqComponent: Float32Array;
  basebandComponent: Float32Array;
  lpfOutput: Float32Array;
  coherentRecovered: Float32Array;
  cosPhiFactor: number;
  effectivePhaseDeg: number;
}

export interface AMSimulationResult {
  sampleRate: number;
  durationSec: number;
  numSamples: number;
  config: AMSimConfig;

  // Transmitter & Channel signals
  originalMessage: Float32Array;
  normalizedMessage: Float32Array;
  carrier: Float32Array;
  amModulated: Float32Array;
  upperSideband: Float32Array;
  lowerSideband: Float32Array;
  receivedAM: Float32Array;

  // Receiver outputs
  envelope: EnvelopeDetectorOutput;
  coherent: CoherentDemodOutput;

  // Summaries & Metrics
  modulationSummary: EnvelopeSummary;
  envelopeMetrics: ReceiverMetricsResult;
  coherentMetrics: ReceiverMetricsResult;

  // FFT Spectra (8192-pt Hann windowed)
  spectra: {
    original: FFTSpectrum;
    carrier: FFTSpectrum;
    modulated: FFTSpectrum;
    received: FFTSpectrum;
    rectified: FFTSpectrum;
    envelope: FFTSpectrum;
    product: FFTSpectrum;
    envelopeRecovered: FFTSpectrum;
    coherentRecovered: FFTSpectrum;
  };
}
