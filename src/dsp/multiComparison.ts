import {
  computeFFT64,
  computeMetrics64,
  toFloat32,
  toFloat64,
} from './common';
import { SharedChannelConfig } from './channel';
import { DEFAULT_DSBSC_CONFIG, DSBSCSimulationResult, simulateDSBSCSystem } from './dsbSc';
import {
  DEFAULT_SSB_CONFIG,
  SSBGenerationMethod,
  SSBSideband,
  SSBSimulationResult,
  simulateSSBSystem,
} from './ssb';
import {
  DEFAULT_VSB_CONFIG,
  VSBOrientation,
  VSBSimulationResult,
  simulateVSBSystem,
} from './vsb';
import { runAMTransmitterAndChannel } from './amModulator';
import { runEnvelopeDetector } from './envelopeDetector';
import { AMSimConfig, DEFAULT_AM_CONFIG, FFTSpectrum, LAB_SAMPLE_RATE } from './types';
import { FilterResponseCurve } from './fir';

export interface MultiComparisonParams {
  carrierFreqHz: number;
  carrierAmpV: number;
  messageBWHz: number;
  amModulationIndex: number;
  ssbSideband: SSBSideband;
  ssbMethod: SSBGenerationMethod;
  vsbOrientation: VSBOrientation;
  vsbVestigeBwHz: number;
  channel: SharedChannelConfig;
}

export interface ComparisonSchemeSummary {
  id: 'dsb-fc' | 'dsb-sc' | 'ssb-sc' | 'vsb';
  name: string;
  subtitle: string;
  color: string;
  occupiedBandwidthHz: number;
  bwFormula: string;
  carrierPowerW: number;
  sidebandPowerW: number;
  totalPowerW: number;
  powerEfficiencyPct: number;
  spectralEfficiencyLabel: string;
  recoveredSnrDb: number;
  pearsonR: number;
  mse: number;
  demodType: string;
  modulatedWaveform: Float32Array;
  recoveredWaveform: Float32Array;
  spectrum: FFTSpectrum;
  filterOverlay?: FilterResponseCurve | null;
}

export interface MultiComparisonResult {
  sampleRate: number;
  numSamples: number;
  durationSec: number;
  originalMessage: Float32Array;
  originalSpectrum: FFTSpectrum;
  dsbFcRecovered: Float32Array;
  dsbScResult: DSBSCSimulationResult;
  ssbResult: SSBSimulationResult;
  vsbResult: VSBSimulationResult;
  schemes: ComparisonSchemeSummary[];
}

export function simulateAllFourModulations(
  rawMessage64: Float64Array,
  params: MultiComparisonParams,
  fs: number = LAB_SAMPLE_RATE
): MultiComparisonResult {
  const raw32 = toFloat32(rawMessage64);

  // 1. DSB-FC (Conventional AM) using shared parameters
  const amConfig: AMSimConfig = {
    ...DEFAULT_AM_CONFIG,
    carrierFreqHz: params.carrierFreqHz,
    carrierAmpV: params.carrierAmpV,
    modulationIndex: params.amModulationIndex,
    bandlimitMessage: true,
    messageLpfCutoffHz: params.messageBWHz,
    receiverLpfCutoffHz: Math.min(5000, params.messageBWHz + 100),
    channelAttenuation: params.channel.attenuation,
    awgnEnabled: params.channel.awgnEnabled,
    noiseSigma: params.channel.noiseSigma,
    carrierPhaseShiftDeg: params.channel.phaseShiftDeg,
    freqOffsetHz: params.channel.freqOffsetHz,
    noiseSeed: params.channel.noiseSeed,
  };
  const amTx = runAMTransmitterAndChannel(raw32, amConfig, fs);
  const amEnv = runEnvelopeDetector(amTx.receivedAM, amTx.idealEnvelope, amConfig, fs);
  const amMetrics = computeMetrics64(
    toFloat64(amTx.originalMessage),
    toFloat64(amEnv.envelopeRecovered)
  );
  const amSpectrum = computeFFT64(toFloat64(amTx.amModulated), fs);

  // 2. DSB-SC
  const dsbResult = simulateDSBSCSystem(
    rawMessage64,
    {
      ...DEFAULT_DSBSC_CONFIG,
      carrierFreqHz: params.carrierFreqHz,
      carrierAmpV: params.carrierAmpV,
      bandlimitMessage: true,
      messageLpfCutoffHz: params.messageBWHz,
      messageBWHz: params.messageBWHz,
      receiverLpfCutoffHz: Math.min(5000, params.messageBWHz + 100),
      localPhaseErrorDeg: 0,
      localFreqOffsetHz: 0,
      channel: params.channel,
    },
    fs
  );

  // 3. SSB-SC
  const ssbResult = simulateSSBSystem(
    rawMessage64,
    {
      ...DEFAULT_SSB_CONFIG,
      carrierFreqHz: params.carrierFreqHz,
      carrierAmpV: params.carrierAmpV,
      sideband: params.ssbSideband,
      method: params.ssbMethod,
      bandlimitMessage: true,
      messageLpfCutoffHz: params.messageBWHz,
      messageBWHz: params.messageBWHz,
      receiverLpfCutoffHz: Math.min(5000, params.messageBWHz + 100),
      localPhaseErrorDeg: 0,
      localFreqOffsetHz: 0,
      channel: params.channel,
    },
    fs
  );

  // 4. VSB
  const vsbResult = simulateVSBSystem(
    rawMessage64,
    {
      ...DEFAULT_VSB_CONFIG,
      carrierFreqHz: params.carrierFreqHz,
      carrierAmpV: params.carrierAmpV,
      orientation: params.vsbOrientation,
      bandlimitMessage: true,
      messageLpfCutoffHz: params.messageBWHz,
      mainBandwidthHz: params.messageBWHz,
      vestigeBandwidthHz: params.vsbVestigeBwHz,
      receiverLpfCutoffHz: Math.min(5000, params.messageBWHz + 100),
      localPhaseErrorDeg: 0,
      localFreqOffsetHz: 0,
      channel: params.channel,
    },
    fs
  );

  const B = params.messageBWHz;
  const Bv = Math.min(B, params.vsbVestigeBwHz);

  const schemes: ComparisonSchemeSummary[] = [
    {
      id: 'dsb-fc',
      name: 'DSB-FC (AM)',
      subtitle: `Full carrier, μ = ${params.amModulationIndex.toFixed(2)}`,
      color: '#2563EB',
      occupiedBandwidthHz: 2 * B,
      bwFormula: '2B',
      carrierPowerW: amTx.summary.carrierPowerW,
      sidebandPowerW: amTx.summary.sidebandPowerW,
      totalPowerW: amTx.summary.totalPowerW,
      powerEfficiencyPct: amTx.summary.efficiencyPct,
      spectralEfficiencyLabel: '0.5× (Dual SB)',
      recoveredSnrDb: amMetrics.snrDb,
      pearsonR: amMetrics.pearsonR,
      mse: amMetrics.mse,
      demodType: 'Diode + RC Envelope',
      modulatedWaveform: amTx.amModulated,
      recoveredWaveform: amEnv.envelopeRecovered,
      spectrum: amSpectrum,
      filterOverlay: null,
    },
    {
      id: 'dsb-sc',
      name: 'DSB-SC',
      subtitle: 'Suppressed carrier, USB + LSB',
      color: '#7C3AED',
      occupiedBandwidthHz: 2 * B,
      bwFormula: '2B',
      carrierPowerW: 0,
      sidebandPowerW: dsbResult.sidebandPowerW,
      totalPowerW: dsbResult.totalPowerW,
      powerEfficiencyPct: 100,
      spectralEfficiencyLabel: '0.5× (Dual SB)',
      recoveredSnrDb: dsbResult.coherentMetrics.snrDb,
      pearsonR: dsbResult.coherentMetrics.pearsonR,
      mse: dsbResult.coherentMetrics.mse,
      demodType: 'Coherent / Costas PLL',
      modulatedWaveform: dsbResult.modulated,
      recoveredWaveform: dsbResult.coherentRecovered,
      spectrum: dsbResult.spectra.modulated,
      filterOverlay: null,
    },
    {
      id: 'ssb-sc',
      name: `SSB-SC (${params.ssbSideband})`,
      subtitle:
        params.ssbMethod === 'hilbert' ? 'Hilbert phase shift' : 'FIR bandpass filter',
      color: '#15803D',
      occupiedBandwidthHz: B,
      bwFormula: 'B',
      carrierPowerW: 0,
      sidebandPowerW: ssbResult.totalPowerW,
      totalPowerW: ssbResult.totalPowerW,
      powerEfficiencyPct: 100,
      spectralEfficiencyLabel: '1.0× (Maximum)',
      recoveredSnrDb: ssbResult.metrics.snrDb,
      pearsonR: ssbResult.metrics.pearsonR,
      mse: ssbResult.metrics.mse,
      demodType: 'Coherent Synchronous',
      modulatedWaveform: ssbResult.selectedSsb,
      recoveredWaveform: ssbResult.ssbRecovered,
      spectrum: ssbResult.spectra.selectedSsb,
      filterOverlay: ssbResult.filterCurve,
    },
    {
      id: 'vsb',
      name: 'VSB',
      subtitle: `${params.vsbOrientation === 'usb-vestige' ? 'USB + LSB vestige' : 'LSB + USB vestige'}`,
      color: '#D97706',
      occupiedBandwidthHz: B + Bv,
      bwFormula: 'B + Bv',
      carrierPowerW: 0,
      sidebandPowerW: vsbResult.totalPowerW,
      totalPowerW: vsbResult.totalPowerW,
      powerEfficiencyPct: 100,
      spectralEfficiencyLabel: `${(B / Math.max(1, B + Bv)).toFixed(2)}× (Balanced)`,
      recoveredSnrDb: vsbResult.metrics.snrDb,
      pearsonR: vsbResult.metrics.pearsonR,
      mse: vsbResult.metrics.mse,
      demodType: 'Coherent + Shaping H(f)',
      modulatedWaveform: vsbResult.vsbModulated,
      recoveredWaveform: vsbResult.vsbRecovered,
      spectrum: vsbResult.spectra.vsbModulated,
      filterOverlay: vsbResult.filterCurve,
    },
  ];

  return {
    sampleRate: fs,
    numSamples: rawMessage64.length,
    durationSec: rawMessage64.length / fs,
    originalMessage: dsbResult.originalMessage,
    originalSpectrum: dsbResult.spectra.original,
    dsbFcRecovered: amEnv.envelopeRecovered,
    dsbScResult: dsbResult,
    ssbResult,
    vsbResult,
    schemes,
  };
}
