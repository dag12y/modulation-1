import { AMSimConfig, CoherentDemodOutput, LAB_SAMPLE_RATE } from './types';
import { firstOrderDcBlocker, fourthOrderButterworthLPF, removeMean } from './filters';

/**
 * Coherent (Synchronous) AM Product Demodulator:
 *   Local Oscillator: c_r(t) = A_r cos(2*pi*(f_c + df_lo)*t + phi_lo)
 *   Product Detector: v(t) = r(t) * c_r(t)
 *   4th-Order Butterworth LPF -> baseband + DC term
 *   DC Removal -> m_r(t) ≈ cos(phi) * m_n(t)
 */
export function runCoherentDemodulator(
  received: Float32Array,
  config: AMSimConfig,
  fs: number = LAB_SAMPLE_RATE
): CoherentDemodOutput {
  const N = received.length;
  const Ar = config.localCarrierAmpV;
  const fcLo = config.carrierFreqHz + config.localCarrierFreqOffsetHz;
  const phiLoRad = (config.localCarrierPhaseDeg * Math.PI) / 180;

  const localOscillator = new Float32Array(N);
  const product = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    const t = i / fs;
    const lo = Ar * Math.cos(2 * Math.PI * fcLo * t + phiLoRad);
    localOscillator[i] = lo;
    product[i] = received[i] * lo;
  }

  // 4th-order Butterworth LPF extracts baseband component + carrier DC term
  const lpfOutput = fourthOrderButterworthLPF(product, config.receiverLpfCutoffHz, fs);

  // Isolate double-frequency component centered at 2*fc
  const doubleFreqComponent = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    doubleFreqComponent[i] = product[i] - lpfOutput[i];
  }

  const basebandComponent = new Float32Array(lpfOutput);

  // Remove DC carrier term: (Ac * Ar * alpha / 2) * cos(phi)
  const dcRemoved = firstOrderDcBlocker(removeMean(lpfOutput), 0.996);

  // Normalize by ideal synchronous gain: 0.5 * alpha * Ac * Ar * mu
  // Preserves cos(phi) scaling (0° -> +1, 45° -> +0.707, 90° -> 0, 180° -> -1)
  const idealGain =
    0.5 *
    Math.max(0.05, config.channelAttenuation) *
    Math.max(0.1, config.carrierAmpV) *
    Math.max(0.1, Ar) *
    Math.max(0.05, config.modulationIndex);

  const coherentRecovered = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    coherentRecovered[i] = dcRemoved[i] / idealGain;
  }

  const effectivePhaseDeg = config.localCarrierPhaseDeg - config.carrierPhaseShiftDeg;
  const cosPhiFactor = Math.cos((effectivePhaseDeg * Math.PI) / 180);

  return {
    localOscillator,
    product,
    doubleFreqComponent,
    basebandComponent,
    lpfOutput,
    coherentRecovered,
    cosPhiFactor,
    effectivePhaseDeg,
  };
}
