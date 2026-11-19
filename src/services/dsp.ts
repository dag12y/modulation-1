/**
 * ModuLab - Digital Signal Processing & Communication Systems Mathematical Engine
 * Accurate numerical implementations of Continuous-Wave, Angle, Digital, and Pulse Modulations,
 * FFT, Filtering, Noise synthesis, and Demodulation.
 */

export interface SignalData {
  name: string;
  t: number[];          // time in seconds
  samples: number[];    // amplitude values
  fs: number;           // sample rate (Hz)
}

export interface SpectrumData {
  frequencies: number[]; // frequency axis (Hz)
  magnitudes: number[];  // linear magnitude |X(f)|
  magnitudesDb: number[]; // magnitude in dB (relative to max)
  peakFreq: number;
  peakMagnitude: number;
  bandwidthEstimate: number;
}

export interface ConstellationPoint {
  i: number;
  q: number;
  bitString: string;
  symbolIndex: number;
}

export interface ConstellationSample {
  i: number;
  q: number;
}

export interface DemodResult {
  recoveredSignal: number[];
  mse: number;
  snrDb: number;
  correlation: number;
  originalAligned: number[];
}

// -------------------------------------------------------------
// BASIC SIGNAL GENERATOR
// -------------------------------------------------------------

export type WaveformType = 'sine' | 'cosine' | 'square' | 'triangle' | 'sawtooth';

export function generateWaveform(
  type: WaveformType,
  freq: number,
  amplitude: number,
  phaseRad: number,
  dcOffset: number,
  fs: number,
  duration: number,
  timeOffset: number = 0
): { t: number[]; samples: number[] } {
  const numSamples = Math.floor(fs * duration);
  const t = new Array<number>(numSamples);
  const samples = new Array<number>(numSamples);

  for (let n = 0; n < numSamples; n++) {
    const time = n / fs;
    t[n] = time;
    const waveTime = time + timeOffset;
    const angle = 2 * Math.PI * freq * waveTime + phaseRad;

    let val = 0;
    switch (type) {
      case 'sine':
        val = Math.sin(angle);
        break;
      case 'cosine':
        val = Math.cos(angle);
        break;
      case 'square':
        val = Math.sin(angle) >= 0 ? 1 : -1;
        break;
      case 'triangle':
        // Standard triangle wave between -1 and 1
        val = (2 / Math.PI) * Math.asin(Math.sin(angle));
        break;
      case 'sawtooth': {
        const normalized = ((angle / (2 * Math.PI)) % 1 + 1) % 1;
        val = 2 * normalized - 1;
        break;
      }
    }
    samples[n] = dcOffset + amplitude * val;
  }

  return { t, samples };
}

// -------------------------------------------------------------
// FAST FOURIER TRANSFORM (Cooley-Tukey Radix-2)
// -------------------------------------------------------------

export function computeFFT(
  signal: number[],
  fs: number,
  windowType: 'rectangular' | 'hanning' | 'hamming' = 'hanning'
): SpectrumData {
  // Find nearest power of 2 <= signal.length (up to 4096 for crisp frequency resolution at 200 kHz)
  let N = 1;
  while (N * 2 <= Math.min(signal.length, 4096)) {
    N *= 2;
  }
  if (N < 64) N = 64;

  const real = new Float64Array(N);
  const imag = new Float64Array(N);

  // Apply Window
  for (let i = 0; i < N; i++) {
    const s = signal[i] || 0;
    let w = 1.0;
    if (windowType === 'hanning') {
      w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    } else if (windowType === 'hamming') {
      w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1));
    }
    real[i] = s * w;
    imag[i] = 0;
  }

  // Bit reversal permutation
  let j = 0;
  for (let i = 0; i < N - 1; i++) {
    if (i < j) {
      const tempR = real[i];
      const tempI = imag[i];
      real[i] = real[j];
      imag[i] = imag[j];
      real[j] = tempR;
      imag[j] = tempI;
    }
    let k = N >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // Cooley-Tukey butterfly
  for (let len = 2; len <= N; len <<= 1) {
    const halfLen = len >> 1;
    const angleStep = (-2 * Math.PI) / len;
    const wStepR = Math.cos(angleStep);
    const wStepI = Math.sin(angleStep);

    for (let i = 0; i < N; i += len) {
      let wr = 1.0;
      let wi = 0.0;
      for (let k = 0; k < halfLen; k++) {
        const idx1 = i + k;
        const idx2 = i + k + halfLen;
        const tr = wr * real[idx2] - wi * imag[idx2];
        const ti = wr * imag[idx2] + wi * real[idx2];

        real[idx2] = real[idx1] - tr;
        imag[idx2] = imag[idx1] - ti;
        real[idx1] = real[idx1] + tr;
        imag[idx1] = imag[idx1] + ti;

        const nextWr = wr * wStepR - wi * wStepI;
        const nextWi = wr * wStepI + wi * wStepR;
        wr = nextWr;
        wi = nextWi;
      }
    }
  }

  // Calculate single-sided magnitude spectrum (0 to fs/2)
  const numBins = N / 2;
  const frequencies = new Array<number>(numBins);
  const magnitudes = new Array<number>(numBins);
  const magnitudesDb = new Array<number>(numBins);

  let maxMag = 1e-12;
  let peakFreq = 0;
  let peakMagnitude = 0;

  for (let i = 0; i < numBins; i++) {
    const freq = (i * fs) / N;
    frequencies[i] = freq;
    // Scale by 2/N for single-sided spectrum (except DC component)
    const factor = i === 0 ? 1 / N : 2 / N;
    const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) * factor;
    magnitudes[i] = mag;
    if (mag > maxMag) {
      maxMag = mag;
      peakFreq = freq;
      peakMagnitude = mag;
    }
  }

  // dB relative to peak magnitude with floor at -80 dB
  for (let i = 0; i < numBins; i++) {
    const db = 20 * Math.log10(Math.max(magnitudes[i] / (maxMag || 1), 1e-4));
    magnitudesDb[i] = Math.max(db, -80);
  }

  // Estimate 3dB bandwidth around peak
  const threshold3dB = peakMagnitude * 0.707;
  let lowFreq = peakFreq;
  let highFreq = peakFreq;

  for (let i = 0; i < numBins; i++) {
    if (magnitudes[i] >= threshold3dB) {
      if (frequencies[i] < lowFreq) lowFreq = frequencies[i];
      if (frequencies[i] > highFreq) highFreq = frequencies[i];
    }
  }
  const bandwidthEstimate = Math.max(highFreq - lowFreq, 10);

  return {
    frequencies,
    magnitudes,
    magnitudesDb,
    peakFreq,
    peakMagnitude,
    bandwidthEstimate,
  };
}

// -------------------------------------------------------------
// HILBERT TRANSFORM (Discrete Approximation for SSB)
// -------------------------------------------------------------

export function hilbertTransform(signal: number[]): number[] {
  const N = signal.length;
  // Compute Hilbert transform via frequency domain phase rotation by -90 deg (-j for positive f, +j for negative f)
  const transformed = new Array<number>(N);
  // Time-domain FIR approximation for Hilbert filter (odd-length FIR)
  const halfFilter = 15;
  for (let n = 0; n < N; n++) {
    let sum = 0;
    for (let k = -halfFilter; k <= halfFilter; k++) {
      if (k % 2 !== 0) { // odd index
        const idx = n - k;
        if (idx >= 0 && idx < N) {
          const h = 2 / (Math.PI * k);
          sum += h * signal[idx];
        }
      }
    }
    transformed[n] = sum;
  }
  return transformed;
}

// -------------------------------------------------------------
// ANALOG MODULATION
// -------------------------------------------------------------

export interface AMParams {
  Ac: number;       // Carrier amplitude (V)
  fc: number;       // Carrier freq (Hz)
  Am: number;       // Message amplitude (V)
  fm: number;       // Message freq (Hz)
  mu: number;       // Modulation index mu = Am/Ac or direct override
  phiC?: number;    // Carrier phase rad
  phiM?: number;    // Message phase rad
  fs: number;
  duration: number;
  timeOffset?: number;
}

export function simulateAM(params: AMParams) {
  const { Ac, fc, Am, fm, mu, phiC = 0, phiM = 0, fs, duration, timeOffset = 0 } = params;
  const numSamples = Math.floor(fs * duration);
  const t = new Array<number>(numSamples);
  const message = new Array<number>(numSamples);
  const carrier = new Array<number>(numSamples);
  const modulated = new Array<number>(numSamples);
  const upperEnvelope = new Array<number>(numSamples);
  const lowerEnvelope = new Array<number>(numSamples);

  for (let n = 0; n < numSamples; n++) {
    const time = n / fs;
    t[n] = time;
    const waveTime = time + timeOffset;
    const m = Math.cos(2 * Math.PI * fm * waveTime + phiM); // Normalized message m_n(t)
    message[n] = Am * m;
    carrier[n] = Ac * Math.cos(2 * Math.PI * fc * waveTime + phiC);

    // s(t) = Ac * [1 + mu * m_n(t)] * cos(2*pi*fc*t + phiC)
    const env = Ac * (1 + mu * m);
    modulated[n] = env * Math.cos(2 * Math.PI * fc * waveTime + phiC);
    upperEnvelope[n] = Math.abs(env);
    lowerEnvelope[n] = -Math.abs(env);
  }

  // Power and Bandwidth
  const Pc = (Ac * Ac) / 2;
  const Psb = (mu * mu / 4) * (Ac * Ac); // Total sideband power
  const Pt = Pc * (1 + (mu * mu) / 2);
  const efficiency = (Psb / Pt) * 100;
  const bandwidth = 2 * fm;

  return {
    t,
    message,
    carrier,
    modulated,
    upperEnvelope,
    lowerEnvelope,
    Pc,
    Psb,
    Pt,
    efficiency,
    bandwidth,
    mu,
  };
}

export function simulateDSBSC(params: {
  Ac: number;
  fc: number;
  Am: number;
  fm: number;
  phiC?: number;
  phiM?: number;
  fs: number;
  duration: number;
  timeOffset?: number;
}) {
  const { Ac, fc, Am, fm, phiC = 0, phiM = 0, fs, duration, timeOffset = 0 } = params;
  const numSamples = Math.floor(fs * duration);
  const t = new Array<number>(numSamples);
  const message = new Array<number>(numSamples);
  const carrier = new Array<number>(numSamples);
  const modulated = new Array<number>(numSamples);

  for (let n = 0; n < numSamples; n++) {
    const time = n / fs;
    t[n] = time;
    const waveTime = time + timeOffset;
    const m = Am * Math.cos(2 * Math.PI * fm * waveTime + phiM);
    const c = Ac * Math.cos(2 * Math.PI * fc * waveTime + phiC);
    message[n] = m;
    carrier[n] = c;
    // s(t) = Ac * m(t) * cos(2*pi*fc*t)
    modulated[n] = m * Math.cos(2 * Math.PI * fc * waveTime + phiC);
  }

  const bandwidth = 2 * fm;
  const Pt = (Am * Am * Ac * Ac) / 4;

  return { t, message, carrier, modulated, bandwidth, Pt, efficiency: 100 };
}

export function simulateSSB(params: {
  Ac: number;
  fc: number;
  Am: number;
  fm: number;
  sideband: 'USB' | 'LSB';
  fs: number;
  duration: number;
  timeOffset?: number;
}) {
  const { Ac, fc, Am, fm, sideband, fs, duration, timeOffset = 0 } = params;
  const numSamples = Math.floor(fs * duration);
  const t = new Array<number>(numSamples);
  const message = new Array<number>(numSamples);
  const modulated = new Array<number>(numSamples);

  for (let n = 0; n < numSamples; n++) {
    const time = n / fs;
    t[n] = time;
    const waveTime = time + timeOffset;
    const m = Am * Math.cos(2 * Math.PI * fm * waveTime);
    const mHat = Am * Math.sin(2 * Math.PI * fm * waveTime);
    message[n] = m;

    const cosCarrier = Math.cos(2 * Math.PI * fc * waveTime);
    const sinCarrier = Math.sin(2 * Math.PI * fc * waveTime);

    if (sideband === 'USB') {
      modulated[n] = 0.5 * Ac * (m * cosCarrier - mHat * sinCarrier);
    } else {
      modulated[n] = 0.5 * Ac * (m * cosCarrier + mHat * sinCarrier);
    }
  }

  return {
    t,
    message,
    modulated,
    bandwidth: fm,
    sideband,
  };
}

export function simulateVSB(params: {
  Ac: number;
  fc: number;
  Am: number;
  fm: number;
  vestigeRatio: number;
  fs: number;
  duration: number;
  timeOffset?: number;
}) {
  const { Ac, fc, Am, fm, vestigeRatio, fs, duration, timeOffset = 0 } = params;
  const numSamples = Math.floor(fs * duration);
  const t = new Array<number>(numSamples);
  const message = new Array<number>(numSamples);
  const modulated = new Array<number>(numSamples);

  for (let n = 0; n < numSamples; n++) {
    const time = n / fs;
    t[n] = time;
    const waveTime = time + timeOffset;
    const m = Am * Math.cos(2 * Math.PI * fm * waveTime);
    message[n] = m;
    const usb = 0.5 * Ac * Am * Math.cos(2 * Math.PI * (fc + fm) * waveTime);
    const lsb = 0.5 * Ac * Am * vestigeRatio * Math.cos(2 * Math.PI * (fc - fm) * waveTime);
    modulated[n] = usb + lsb;
  }

  const bandwidth = fm + fm * vestigeRatio;
  return { t, message, modulated, bandwidth, vestigeRatio };
}

export function simulateFM(params: {
  Ac: number;
  fc: number;
  Am: number;
  fm: number;
  deltaF: number;
  fs: number;
  duration: number;
  timeOffset?: number;
}) {
  const { Ac, fc, Am, fm, deltaF, fs, duration, timeOffset = 0 } = params;
  const numSamples = Math.floor(fs * duration);
  const t = new Array<number>(numSamples);
  const message = new Array<number>(numSamples);
  const carrier = new Array<number>(numSamples);
  const modulated = new Array<number>(numSamples);
  const instFreq = new Array<number>(numSamples);

  const beta = deltaF / (fm || 1);

  for (let n = 0; n < numSamples; n++) {
    const time = n / fs;
    t[n] = time;
    const waveTime = time + timeOffset;
    const m = Math.cos(2 * Math.PI * fm * waveTime);
    message[n] = Am * m;
    carrier[n] = Ac * Math.cos(2 * Math.PI * fc * waveTime);

    instFreq[n] = fc + deltaF * m;

    const phase = 2 * Math.PI * fc * waveTime + beta * Math.sin(2 * Math.PI * fm * waveTime);
    modulated[n] = Ac * Math.cos(phase);
  }

  const carsonsBandwidth = 2 * (deltaF + fm);

  return {
    t,
    message,
    carrier,
    modulated,
    instFreq,
    beta,
    carsonsBandwidth,
  };
}

export function simulatePM(params: {
  Ac: number;
  fc: number;
  Am: number;
  fm: number;
  kp: number;
  fs: number;
  duration: number;
  timeOffset?: number;
}) {
  const { Ac, fc, Am, fm, kp, fs, duration, timeOffset = 0 } = params;
  const numSamples = Math.floor(fs * duration);
  const t = new Array<number>(numSamples);
  const message = new Array<number>(numSamples);
  const modulated = new Array<number>(numSamples);
  const phaseDeviation = new Array<number>(numSamples);

  const deltaTheta = kp * Am;

  for (let n = 0; n < numSamples; n++) {
    const time = n / fs;
    t[n] = time;
    const waveTime = time + timeOffset;
    const m = Am * Math.cos(2 * Math.PI * fm * waveTime);
    message[n] = m;
    const dev = kp * m;
    phaseDeviation[n] = dev;
    modulated[n] = Ac * Math.cos(2 * Math.PI * fc * waveTime + dev);
  }

  const equivalentDeltaF = kp * Am * fm;
  const bandwidth = 2 * (equivalentDeltaF + fm);

  return {
    t,
    message,
    modulated,
    phaseDeviation,
    deltaTheta,
    bandwidth,
  };
}

// -------------------------------------------------------------
// DIGITAL MODULATION
// -------------------------------------------------------------

export function parseBitString(str: string): number[] {
  return str
    .replace(/[^01]/g, '')
    .split('')
    .map((b) => (b === '1' ? 1 : 0));
}

export function simulateASK(params: {
  bits: number[];
  bitRate: number;      // bps
  fc: number;          // carrier freq (Hz)
  Ac: number;          // high level
  A0?: number;         // low level (0 for OOK)
  fs: number;
  timeOffset?: number;
}) {
  const { bits, bitRate, fc, Ac, A0 = 0, fs, timeOffset = 0 } = params;
  const Tb = 1 / bitRate;
  const totalDuration = bits.length * Tb;
  const numSamples = Math.floor(fs * totalDuration);

  const t = new Array<number>(numSamples);
  const bitSignal = new Array<number>(numSamples);
  const modulated = new Array<number>(numSamples);

  for (let n = 0; n < numSamples; n++) {
    const time = n / fs;
    t[n] = time;
    const waveTime = time + timeOffset;
    const bitIndex = Math.floor((waveTime / Tb) % bits.length);
    const bit = bits[Math.max(0, bitIndex)];
    bitSignal[n] = bit;

    const amp = bit === 1 ? Ac : A0;
    modulated[n] = amp * Math.cos(2 * Math.PI * fc * waveTime);
  }

  return { t, bitSignal, modulated, bitRate, Tb };
}

export function simulateFSK(params: {
  bits: number[];
  bitRate: number;
  fMark: number;        // freq for '1'
  fSpace: number;       // freq for '0'
  Ac: number;
  fs: number;
  timeOffset?: number;
}) {
  const { bits, bitRate, fMark, fSpace, Ac, fs, timeOffset = 0 } = params;
  const Tb = 1 / bitRate;
  const totalDuration = bits.length * Tb;
  const numSamples = Math.floor(fs * totalDuration);

  const t = new Array<number>(numSamples);
  const bitSignal = new Array<number>(numSamples);
  const modulated = new Array<number>(numSamples);

  let currentPhase = 2 * Math.PI * fMark * timeOffset;
  for (let n = 0; n < numSamples; n++) {
    const time = n / fs;
    t[n] = time;
    const waveTime = time + timeOffset;
    const bitIndex = Math.floor((waveTime / Tb) % bits.length);
    const bit = bits[Math.max(0, bitIndex)];
    bitSignal[n] = bit;

    const targetFreq = bit === 1 ? fMark : fSpace;
    currentPhase += (2 * Math.PI * targetFreq) / fs;
    modulated[n] = Ac * Math.cos(currentPhase);
  }

  const deltaF = Math.abs(fMark - fSpace);
  const bandwidth = 2 * deltaF + 2 * bitRate;

  return { t, bitSignal, modulated, bitRate, deltaF, bandwidth };
}

export function simulatePSK(params: {
  type: 'BPSK' | 'QPSK' | '8-PSK' | '16-PSK';
  bits: number[];
  symbolRate: number;
  fc: number;
  Ac: number;
  fs: number;
  timeOffset?: number;
}) {
  const { type, bits, symbolRate, fc, Ac, fs, timeOffset = 0 } = params;
  const bitsPerSymbol = type === 'BPSK' ? 1 : type === 'QPSK' ? 2 : type === '8-PSK' ? 3 : 4;
  const numSymbols = Math.ceil(bits.length / bitsPerSymbol);
  const Tsym = 1 / symbolRate;
  const totalDuration = numSymbols * Tsym;
  const numSamples = Math.floor(fs * totalDuration);

  const t = new Array<number>(numSamples);
  const modulated = new Array<number>(numSamples);
  const constellation: ConstellationPoint[] = [];

  const M = Math.pow(2, bitsPerSymbol);
  // Generate ideal constellation points with Gray mapping
  for (let m = 0; m < M; m++) {
    const angle = (2 * Math.PI * m) / M + (type === 'QPSK' ? Math.PI / 4 : 0);
    const iVal = Ac * Math.cos(angle);
    const qVal = Ac * Math.sin(angle);
    const binary = m.toString(2).padStart(bitsPerSymbol, '0');
    constellation.push({
      i: iVal,
      q: qVal,
      bitString: binary,
      symbolIndex: m,
    });
  }

  // Symbol mapping
  const symbolPhases: number[] = [];
  const symbolI: number[] = [];
  const symbolQ: number[] = [];

  for (let s = 0; s < numSymbols; s++) {
    let symVal = 0;
    for (let b = 0; b < bitsPerSymbol; b++) {
      const bitIdx = s * bitsPerSymbol + b;
      const bit = bitIdx < bits.length ? bits[bitIdx] : 0;
      symVal = (symVal << 1) | bit;
    }
    const angle = (2 * Math.PI * symVal) / M + (type === 'QPSK' ? Math.PI / 4 : 0);
    symbolPhases.push(angle);
    symbolI.push(Ac * Math.cos(angle));
    symbolQ.push(Ac * Math.sin(angle));
  }

  for (let n = 0; n < numSamples; n++) {
    const time = n / fs;
    t[n] = time;
    const waveTime = time + timeOffset;
    const symIndex = Math.floor((waveTime / Tsym) % numSymbols);
    const phase = symbolPhases[Math.max(0, symIndex)];
    modulated[n] = Ac * Math.cos(2 * Math.PI * fc * waveTime + phase);
  }

  return {
    t,
    modulated,
    constellation,
    symbolI,
    symbolQ,
    Tsym,
    bitsPerSymbol,
    symbolRate,
  };
}

export function simulateQAM(params: {
  type: '4-QAM' | '16-QAM' | '64-QAM';
  bits: number[];
  symbolRate: number;
  fc: number;
  Ac: number;
  fs: number;
  timeOffset?: number;
}) {
  const { type, bits, symbolRate, fc, Ac, fs, timeOffset = 0 } = params;
  const bitsPerSymbol = type === '4-QAM' ? 2 : type === '16-QAM' ? 4 : 6;
  const numSymbols = Math.ceil(bits.length / bitsPerSymbol);
  const Tsym = 1 / symbolRate;
  const totalDuration = numSymbols * Tsym;
  const numSamples = Math.floor(fs * totalDuration);

  const t = new Array<number>(numSamples);
  const modulated = new Array<number>(numSamples);

  const mGrid = Math.sqrt(Math.pow(2, bitsPerSymbol)); // 2 for 4-QAM, 4 for 16-QAM, 8 for 64-QAM
  const step = (2 * Ac) / (mGrid - 1 || 1);
  const constellation: ConstellationPoint[] = [];

  let idx = 0;
  for (let row = 0; row < mGrid; row++) {
    for (let col = 0; col < mGrid; col++) {
      const iVal = -Ac + col * step;
      const qVal = Ac - row * step;
      const bitStr = idx.toString(2).padStart(bitsPerSymbol, '0');
      constellation.push({
        i: iVal,
        q: qVal,
        bitString: bitStr,
        symbolIndex: idx,
      });
      idx++;
    }
  }

  const symbolI: number[] = [];
  const symbolQ: number[] = [];

  for (let s = 0; s < numSymbols; s++) {
    let symVal = 0;
    for (let b = 0; b < bitsPerSymbol; b++) {
      const bitIdx = s * bitsPerSymbol + b;
      const bit = bitIdx < bits.length ? bits[bitIdx] : 0;
      symVal = (symVal << 1) | bit;
    }
    const pt = constellation[symVal % constellation.length];
    symbolI.push(pt.i);
    symbolQ.push(pt.q);
  }

  for (let n = 0; n < numSamples; n++) {
    const time = n / fs;
    t[n] = time;
    const waveTime = time + timeOffset;
    const symIndex = Math.floor((waveTime / Tsym) % numSymbols);
    const inPhase = symbolI[Math.max(0, symIndex)];
    const quad = symbolQ[Math.max(0, symIndex)];

    // s_QAM(t) = I(t)*cos(2*pi*fc*t) - Q(t)*sin(2*pi*fc*t)
    modulated[n] =
      inPhase * Math.cos(2 * Math.PI * fc * waveTime) -
      quad * Math.sin(2 * Math.PI * fc * waveTime);
  }

  return {
    t,
    modulated,
    constellation,
    symbolI,
    symbolQ,
    Tsym,
    bitsPerSymbol,
    symbolRate,
  };
}

// -------------------------------------------------------------
// PULSE MODULATION (PAM, PWM, PPM, PCM, DM)
// -------------------------------------------------------------

export function simulatePAM(params: {
  Am: number;
  fm: number;
  fsPulse: number; // Pulse sampling frequency
  dutyCycle: number; // 0.1 to 0.9
  samplingMode: 'natural' | 'flat-top';
  fs: number;
  duration: number;
  timeOffset?: number;
}) {
  const { Am, fm, fsPulse, dutyCycle, samplingMode, fs, duration, timeOffset = 0 } = params;
  const numSamples = Math.floor(fs * duration);
  const t = new Array<number>(numSamples);
  const message = new Array<number>(numSamples);
  const pulseTrain = new Array<number>(numSamples);
  const pamSignal = new Array<number>(numSamples);

  const Tpulse = 1 / fsPulse;
  const pulseWidth = Tpulse * dutyCycle;

  let currentSampleHeld = 0;

  for (let n = 0; n < numSamples; n++) {
    const time = n / fs;
    t[n] = time;
    const waveTime = time + timeOffset;
    const m = Am * Math.cos(2 * Math.PI * fm * waveTime);
    message[n] = m;

    const timeInPeriod = time % Tpulse;
    const isHigh = timeInPeriod < pulseWidth;
    pulseTrain[n] = isHigh ? 1 : 0;

    if (samplingMode === 'natural') {
      pamSignal[n] = isHigh ? m : 0;
    } else {
      if (timeInPeriod < 1 / fs) {
        currentSampleHeld = m;
      }
      pamSignal[n] = isHigh ? currentSampleHeld : 0;
    }
  }

  return { t, message, pulseTrain, pamSignal, Tpulse };
}

export function simulatePWM(params: {
  Am: number;
  fm: number;
  fsCarrier: number;
  fs: number;
  duration: number;
  timeOffset?: number;
}) {
  const { Am, fm, fsCarrier, fs, duration, timeOffset = 0 } = params;
  const numSamples = Math.floor(fs * duration);
  const t = new Array<number>(numSamples);
  const message = new Array<number>(numSamples);
  const ramp = new Array<number>(numSamples);
  const pwmSignal = new Array<number>(numSamples);

  const Tcarrier = 1 / fsCarrier;

  for (let n = 0; n < numSamples; n++) {
    const time = n / fs;
    t[n] = time;
    const waveTime = time + timeOffset;
    const mNorm = 0.5 + 0.45 * Math.sin(2 * Math.PI * fm * waveTime);
    message[n] = mNorm;

    const r = (time % Tcarrier) / Tcarrier;
    ramp[n] = r;

    pwmSignal[n] = mNorm >= r ? 1 : 0;
  }

  return { t, message, ramp, pwmSignal };
}

export function simulatePCM(params: {
  Am: number;
  fm: number;
  fsPulse: number;     // Nyquist sampling freq
  numBits: number;     // 2 to 8 bits (L = 2^numBits)
  companding: 'uniform' | 'mu-law';
  mu?: number;         // e.g. 255
  fs: number;
  duration: number;
  timeOffset?: number;
}) {
  const { Am, fm, fsPulse, numBits, companding, mu = 255, fs, duration, timeOffset = 0 } = params;
  const numSamples = Math.floor(fs * duration);
  const t = new Array<number>(numSamples);
  const message = new Array<number>(numSamples);
  const sampledSignal = new Array<number>(numSamples);
  const quantizedSignal = new Array<number>(numSamples);
  const errorSignal = new Array<number>(numSamples);

  const L = Math.pow(2, numBits);
  const Vmin = -Am;
  const Vmax = Am;
  const stepSize = (Vmax - Vmin) / L;

  const Tpulse = 1 / fsPulse;
  let heldSample = 0;
  let heldQuantized = 0;

  const samplePoints: { time: number; val: number; quantized: number; code: string }[] = [];

  for (let n = 0; n < numSamples; n++) {
    const time = n / fs;
    t[n] = time;
    const waveTime = time + timeOffset;
    const m = Am * Math.sin(2 * Math.PI * fm * waveTime);
    message[n] = m;

    if (n % Math.max(1, Math.floor(fs * Tpulse)) === 0) {
      heldSample = m;

      let valToQuantize = heldSample;
      if (companding === 'mu-law') {
        const x = Math.max(-1, Math.min(1, heldSample / Am));
        const compressed = (Math.sign(x) * Math.log(1 + mu * Math.abs(x))) / Math.log(1 + mu);
        valToQuantize = compressed * Am;
      }

      // Quantization level
      let level = Math.round((valToQuantize - Vmin) / stepSize);
      if (level < 0) level = 0;
      if (level >= L) level = L - 1;

      let qVal = Vmin + (level + 0.5) * stepSize;
      if (companding === 'mu-law') {
        // Expand
        const y = Math.max(-1, Math.min(1, qVal / Am));
        const expanded = (Math.sign(y) * (Math.pow(1 + mu, Math.abs(y)) - 1)) / mu;
        qVal = expanded * Am;
      }
      heldQuantized = qVal;

      samplePoints.push({
        time,
        val: heldSample,
        quantized: heldQuantized,
        code: level.toString(2).padStart(numBits, '0'),
      });
    }

    sampledSignal[n] = heldSample;
    quantizedSignal[n] = heldQuantized;
    errorSignal[n] = heldQuantized - m;
  }

  // Theoretical SQNR = 6.02 * numBits + 1.76 dB
  const theoreticalSQNR = 6.02 * numBits + 1.76;

  // Calculate actual SQNR from samples
  let sigPwr = 0;
  let noisePwr = 0;
  for (let i = 0; i < numSamples; i++) {
    sigPwr += message[i] * message[i];
    noisePwr += errorSignal[i] * errorSignal[i];
  }
  const measuredSQNR = noisePwr > 0 ? 10 * Math.log10(sigPwr / noisePwr) : 99;

  return {
    t,
    message,
    sampledSignal,
    quantizedSignal,
    errorSignal,
    L,
    stepSize,
    theoreticalSQNR,
    measuredSQNR,
    samplePoints: samplePoints.slice(0, 16), // First 16 samples for table display
    nyquistRate: 2 * fm,
    isAliasing: fsPulse < 2 * fm,
  };
}

export function simulateDeltaModulation(params: {
  Am: number;
  fm: number;
  deltaStep: number;
  fsPulse: number;
  fs: number;
  duration: number;
  timeOffset?: number;
}) {
  const { Am, fm, deltaStep, fsPulse, fs, duration, timeOffset = 0 } = params;
  const numSamples = Math.floor(fs * duration);
  const t = new Array<number>(numSamples);
  const message = new Array<number>(numSamples);
  const dmStaircase = new Array<number>(numSamples);
  const bitStream: number[] = [];

  const Tpulse = 1 / fsPulse;
  let currentEstimate = 0;

  // Check slope overload: max slope of message = 2*pi*fm*Am
  const maxMessageSlope = 2 * Math.PI * fm * Am;
  const maxDMSlope = deltaStep * fsPulse;
  const isSlopeOverload = maxMessageSlope > maxDMSlope;

  for (let n = 0; n < numSamples; n++) {
    const time = n / fs;
    t[n] = time;
    const waveTime = time + timeOffset;
    const m = Am * Math.sin(2 * Math.PI * fm * waveTime);
    message[n] = m;

    if (n % Math.max(1, Math.floor(fs * Tpulse)) === 0) {
      if (m >= currentEstimate) {
        currentEstimate += deltaStep;
        bitStream.push(1);
      } else {
        currentEstimate -= deltaStep;
        bitStream.push(0);
      }
    }
    dmStaircase[n] = currentEstimate;
  }

  return {
    t,
    message,
    dmStaircase,
    bitStream: bitStream.slice(0, 32),
    isSlopeOverload,
    maxMessageSlope,
    maxDMSlope,
  };
}

// -------------------------------------------------------------
// CHANNEL & NOISE SYNTHESIS
// -------------------------------------------------------------

export function addAWGN(signal: number[], snrDb: number): { noisy: number[]; noise: number[] } {
  const N = signal.length;
  // Calculate signal power
  let sigPower = 0;
  for (let i = 0; i < N; i++) {
    sigPower += signal[i] * signal[i];
  }
  sigPower /= N;

  const noisePower = sigPower / Math.pow(10, snrDb / 10);
  const sigma = Math.sqrt(Math.max(noisePower, 1e-12));

  const noisy = new Array<number>(N);
  const noise = new Array<number>(N);

  for (let i = 0; i < N; i += 2) {
    // Box-Muller transform
    const u1 = Math.max(1e-10, Math.random());
    const u2 = Math.random();
    const r = Math.sqrt(-2.0 * Math.log(u1));
    const theta = 2.0 * Math.PI * u2;

    const z0 = r * Math.cos(theta) * sigma;
    const z1 = r * Math.sin(theta) * sigma;

    noise[i] = z0;
    noisy[i] = signal[i] + z0;

    if (i + 1 < N) {
      noise[i + 1] = z1;
      noisy[i + 1] = signal[i + 1] + z1;
    }
  }

  return { noisy, noise };
}

export function applyChannel(
  signal: number[],
  t: number[],
  params: {
    model: 'ideal' | 'awgn' | 'attenuation' | 'multipath' | 'freq-offset';
    snrDb: number;
    attenuationDb: number;
    delaySamples: number;
    multipathGain: number;
    freqOffsetHz: number;
  }
): { output: number[]; noiseOnly: number[] } {
  const N = signal.length;
  let intermediate = new Array<number>(N);

  // 1. Attenuation
  const linearGain = Math.pow(10, -params.attenuationDb / 20);
  for (let i = 0; i < N; i++) {
    intermediate[i] = signal[i] * linearGain;
  }

  // 2. Multipath (2-ray delayed reflection)
  if (params.model === 'multipath' && params.delaySamples > 0) {
    const delayed = new Array<number>(N);
    for (let i = 0; i < N; i++) {
      const prevIdx = i - params.delaySamples;
      delayed[i] = intermediate[i] + (prevIdx >= 0 ? intermediate[prevIdx] * params.multipathGain : 0);
    }
    intermediate = delayed;
  }

  // 3. Frequency offset (Doppler drift)
  if (params.model === 'freq-offset' && params.freqOffsetHz !== 0) {
    for (let i = 0; i < N; i++) {
      intermediate[i] *= Math.cos(2 * Math.PI * params.freqOffsetHz * t[i]);
    }
  }

  // 4. Additive Noise
  if (params.model !== 'ideal') {
    const { noisy, noise } = addAWGN(intermediate, params.snrDb);
    return { output: noisy, noiseOnly: noise };
  }

  return { output: intermediate, noiseOnly: new Array(N).fill(0) };
}

// -------------------------------------------------------------
// FILTERING (Butterworth-style IIR / Moving Average LPF)
// -------------------------------------------------------------

export function lowPassFilter(signal: number[], cutoffFreq: number, fs: number, order: number = 2): number[] {
  const N = signal.length;
  const filtered = new Array<number>(N);

  // Discrete single-pole or 2nd-pole digital IIR filter
  const dt = 1 / fs;
  const rc = 1 / (2 * Math.PI * cutoffFreq);
  const alpha = dt / (rc + dt);

  // Run forward and backward (zero-phase filtering)
  const pass1 = new Array<number>(N);
  let y = signal[0] || 0;
  for (let i = 0; i < N; i++) {
    y += alpha * (signal[i] - y);
    pass1[i] = y;
  }

  if (order >= 2) {
    // 2nd pass backward for zero phase lag and sharper rolloff
    y = pass1[N - 1] || 0;
    for (let i = N - 1; i >= 0; i--) {
      y += alpha * (pass1[i] - y);
      filtered[i] = y;
    }
    return filtered;
  }

  return pass1;
}

// -------------------------------------------------------------
// DEMODULATION RECEIVER
// -------------------------------------------------------------

export function demodulateAMEnvelope(signal: number[], cutoffFreq: number, fs: number): number[] {
  const N = signal.length;
  // Diode half-wave rectifier + envelope low-pass filter
  const rectified = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    rectified[i] = Math.max(0, signal[i]);
  }
  const filtered = lowPassFilter(rectified, cutoffFreq, fs, 2);

  // Remove DC bias (AC coupling)
  let mean = 0;
  for (let i = 0; i < N; i++) mean += filtered[i];
  mean /= N;

  const out = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    out[i] = (filtered[i] - mean) * 2; // Scaled to original amplitude
  }
  return out;
}

export function demodulateCoherent(
  signal: number[],
  t: number[],
  fc: number,
  deltaFc: number, // LO frequency offset
  phaseOffsetRad: number, // LO phase offset
  cutoffFreq: number,
  fs: number
): number[] {
  const N = signal.length;
  const mixed = new Array<number>(N);

  // Multiplier: 2 * cos(2*pi*(fc + deltaFc)*t + phi)
  for (let i = 0; i < N; i++) {
    const lo = 2 * Math.cos(2 * Math.PI * (fc + deltaFc) * t[i] + phaseOffsetRad);
    mixed[i] = signal[i] * lo;
  }

  // Low pass filter to extract baseband message
  return lowPassFilter(mixed, cutoffFreq, fs, 2);
}

export function demodulateFMFreqDiscriminator(signal: number[], fs: number, cutoffFreq: number): number[] {
  const N = signal.length;
  const differentiated = new Array<number>(N);

  // Differentiator: d/dt turns FM into AM+FM
  differentiated[0] = 0;
  for (let i = 1; i < N; i++) {
    differentiated[i] = (signal[i] - signal[i - 1]) * fs;
  }

  // Envelope detector
  return demodulateAMEnvelope(differentiated, cutoffFreq, fs);
}

// -------------------------------------------------------------
// PERFORMANCE METRICS (MSE, SNR, Correlation, BER)
// -------------------------------------------------------------

export function evaluateDemodulation(original: number[], recovered: number[]): DemodResult {
  const N = Math.min(original.length, recovered.length);
  if (N <= 0) {
    return { recoveredSignal: [], mse: 0, snrDb: 0, correlation: 1, originalAligned: [] };
  }

  // Trim start transient (first 5% of samples) to avoid initial filter startup lag
  const startIdx = Math.floor(N * 0.05);
  const endIdx = N;
  const count = endIdx - startIdx;

  let origMean = 0;
  let recMean = 0;
  for (let i = startIdx; i < endIdx; i++) {
    origMean += original[i];
    recMean += recovered[i];
  }
  origMean /= count;
  recMean /= count;

  let origVar = 0;
  let recVar = 0;
  let cov = 0;

  for (let i = startIdx; i < endIdx; i++) {
    const o = original[i] - origMean;
    const r = recovered[i] - recMean;
    origVar += o * o;
    recVar += r * r;
    cov += o * r;
  }

  // Scaling factor to align gain
  const gain = recVar > 1e-12 ? cov / recVar : 1;
  const alignedRecovered = new Array<number>(N);

  let mseSum = 0;
  let origPower = 0;

  for (let i = 0; i < N; i++) {
    const r = recovered[i] * gain;
    alignedRecovered[i] = r;
    if (i >= startIdx) {
      const err = original[i] - r;
      mseSum += err * err;
      origPower += original[i] * original[i];
    }
  }

  const mse = mseSum / count;
  const snr = mse > 1e-12 ? 10 * Math.log10(origPower / mseSum) : 99;
  const correlation =
    origVar > 0 && recVar > 0 ? cov / Math.sqrt(origVar * recVar) : 0;

  return {
    recoveredSignal: alignedRecovered,
    mse,
    snrDb: snr,
    correlation: Math.max(-1, Math.min(1, correlation)),
    originalAligned: original.slice(0, N),
  };
}

export function computeBER(transmittedBits: number[], receivedBits: number[]): { ber: number; errors: number; total: number } {
  const total = Math.min(transmittedBits.length, receivedBits.length);
  let errors = 0;
  for (let i = 0; i < total; i++) {
    if (transmittedBits[i] !== receivedBits[i]) {
      errors++;
    }
  }
  return {
    ber: total > 0 ? errors / total : 0,
    errors,
    total,
  };
}
