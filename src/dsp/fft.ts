import { FFT_SIZE, FFTSpectrum, LAB_SAMPLE_RATE } from './types';

/**
 * In-place Radix-2 Cooley-Tukey FFT with Hann window and coherent gain normalization.
 * Produces an 8192-point single-sided spectrum in dB clamped to [-85, +5] dB.
 */
export function computeRadix2FFT(
  signal: Float32Array,
  sampleRate: number = LAB_SAMPLE_RATE,
  fftSize: number = FFT_SIZE,
  startOffset?: number
): FFTSpectrum {
  const N = fftSize;
  const re = new Float64Array(N);
  const im = new Float64Array(N);

  // Pick a representative non-silent window if startOffset not given
  let offset = startOffset ?? 0;
  if (startOffset === undefined && signal.length > N) {
    // Center around peak activity or midpoint for richer audio spectra
    offset = Math.max(0, Math.floor((signal.length - N) * 0.25));
  }

  // Apply Hann window and track coherent gain = sum(w) / N
  let winSum = 0;
  for (let i = 0; i < N; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    winSum += w;
    const s = offset + i < signal.length ? signal[offset + i] : 0;
    re[i] = s * w;
    im[i] = 0;
  }
  const coherentGain = winSum / N; // 0.5 for Hann

  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < N - 1; i++) {
    if (i < j) {
      const tr = re[i];
      const ti = im[i];
      re[i] = re[j];
      im[i] = im[j];
      re[j] = tr;
      im[j] = ti;
    }
    let k = N >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // In-place Cooley-Tukey butterfly stages
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1;
    const angleStep = (-2 * Math.PI) / len;
    const wStepR = Math.cos(angleStep);
    const wStepI = Math.sin(angleStep);

    for (let i = 0; i < N; i += len) {
      let wr = 1.0;
      let wi = 0.0;
      for (let k = 0; k < half; k++) {
        const idx1 = i + k;
        const idx2 = i + k + half;
        const tr = wr * re[idx2] - wi * im[idx2];
        const ti = wr * im[idx2] + wi * re[idx2];

        re[idx2] = re[idx1] - tr;
        im[idx2] = im[idx1] - ti;
        re[idx1] += tr;
        im[idx1] += ti;

        const nextWr = wr * wStepR - wi * wStepI;
        wi = wr * wStepI + wi * wStepR;
        wr = nextWr;
      }
    }
  }

  const numBins = N / 2;
  const frequencies = new Float32Array(numBins);
  const magnitudesLinear = new Float32Array(numBins);
  const magnitudesDb = new Float32Array(numBins);

  let peakFreqHz = 0;
  let peakDb = -85;

  for (let k = 0; k < numBins; k++) {
    const f = (k * sampleRate) / N;
    frequencies[k] = f;
    const singleSideFactor = k === 0 ? 1 / (N * coherentGain) : 2 / (N * coherentGain);
    const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * singleSideFactor;
    magnitudesLinear[k] = mag;
    const dbRaw = 20 * Math.log10(Math.max(mag, 1e-6));
    const dbClamped = Math.max(-85, Math.min(5, dbRaw));
    magnitudesDb[k] = dbClamped;
    if (k > 0 && dbClamped > peakDb) {
      peakDb = dbClamped;
      peakFreqHz = f;
    }
  }

  return {
    frequencies,
    magnitudesDb,
    magnitudesLinear,
    peakFreqHz,
    peakDb,
    fftSize: N,
  };
}
