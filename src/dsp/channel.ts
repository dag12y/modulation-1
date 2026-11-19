import { computePowerMetrics64 } from './common';
import { createSeededRng } from './filters';
import { LAB_SAMPLE_RATE } from './types';

export interface SharedChannelConfig {
  attenuation: number;      // α in [0.05 .. 1.0]
  awgnEnabled: boolean;
  noiseSigma: number;       // σ in [0 .. 0.2]
  phaseShiftDeg: number;    // channel phase shift θ_ch in degrees
  freqOffsetHz: number;     // channel Doppler / drift Δf_ch in Hz
  noiseSeed: number;
}

export const DEFAULT_SHARED_CHANNEL: SharedChannelConfig = {
  attenuation: 1.0,
  awgnEnabled: false,
  noiseSigma: 0.04,
  phaseShiftDeg: 0,
  freqOffsetHz: 0,
  noiseSeed: 2025,
};

export interface ChannelSimulationOutput {
  received: Float64Array;
  noise: Float64Array;
  signalPowerW: number;
  noisePowerW: number;
  channelSnrDb: number;
}

/**
 * Shared AWGN + Attenuation + Phase/Frequency Offset Channel:
 *   r(t) = α · s_shifted(t) + n(t)
 * Uses Box-Muller deterministic Gaussian noise and Hilbert quadrature phase/freq shift.
 */
export function simulateSharedChannel64(
  transmitted: Float64Array,
  hilbertTransmitted: Float64Array | null,
  config: SharedChannelConfig,
  fs: number = LAB_SAMPLE_RATE
): ChannelSimulationOutput {
  const N = transmitted.length;
  const received = new Float64Array(N);
  const noise = new Float64Array(N);

  const alpha = config.attenuation;
  const phiRad = (config.phaseShiftDeg * Math.PI) / 180;
  const dOmega = 2 * Math.PI * config.freqOffsetHz;
  const hasRotation = Math.abs(config.phaseShiftDeg) > 1e-4 || Math.abs(config.freqOffsetHz) > 1e-4;

  if (config.awgnEnabled && config.noiseSigma > 0) {
    const rand = createSeededRng(config.noiseSeed);
    for (let i = 0; i < N; i += 2) {
      const u1 = Math.max(1e-12, rand());
      const u2 = rand();
      const mag = config.noiseSigma * Math.sqrt(-2.0 * Math.log(u1));
      const theta = 2.0 * Math.PI * u2;
      noise[i] = mag * Math.cos(theta);
      if (i + 1 < N) {
        noise[i + 1] = mag * Math.sin(theta);
      }
    }
  }

  let cleanPowSum = 0;
  for (let i = 0; i < N; i++) {
    let sVal = transmitted[i];
    if (hasRotation && hilbertTransmitted) {
      const angle = phiRad + (dOmega * i) / fs;
      sVal = transmitted[i] * Math.cos(angle) - hilbertTransmitted[i] * Math.sin(angle);
    }
    const attenuated = alpha * sVal;
    cleanPowSum += attenuated * attenuated;
    received[i] = attenuated + noise[i];
  }

  const signalPowerW = N > 0 ? cleanPowSum / N : 0;
  const noisePow = computePowerMetrics64(noise, fs).totalPowerW;
  const channelSnrDb =
    noisePow > 1e-12
      ? Math.max(-10, Math.min(80, 10 * Math.log10(Math.max(signalPowerW, 1e-12) / noisePow)))
      : 80;

  return {
    received,
    noise,
    signalPowerW,
    noisePowerW: noisePow,
    channelSnrDb,
  };
}
