import React, { useState, useMemo } from 'react';
import {
  parseBitString,
  simulateASK,
  simulateFSK,
  simulatePSK,
  simulateQAM,
  computeFFT,
  addAWGN,
  computeBER,
} from '../services/dsp';
import { ScientificScopeCanvas } from '../components/ScientificScopeCanvas';
import { SpectrumAnalyzerCanvas } from '../components/SpectrumAnalyzerCanvas';
import { ConstellationCanvas } from '../components/ConstellationCanvas';
import { EyeDiagramCanvas } from '../components/EyeDiagramCanvas';
import { TheoryCalculationsPanel, CalculationStep } from '../components/TheoryCalculationsPanel';
import { useSimulation } from '../context/SimulationContext';
import { Cpu, RefreshCw, Sparkles, CheckCircle2 } from 'lucide-react';

export type DigitalScheme = 'ASK' | 'FSK' | 'BPSK' | 'QPSK' | '8-PSK' | '16-QAM' | '64-QAM';

interface DigitalLabProps {
  initialScheme?: DigitalScheme;
}

export const DigitalLabView: React.FC<DigitalLabProps> = ({ initialScheme = 'BPSK' }) => {
  const { frame, isSimulating, animTime } = useSimulation();
  const [scheme, setScheme] = useState<DigitalScheme>(initialScheme);
  const [bitInput, setBitInput] = useState<string>('1011001011010011');
  const [symbolRate, setSymbolRate] = useState<number>(1000); // 1000 Baud
  const [fc, setFc] = useState<number>(10000); // 10 kHz
  const [Ac, setAc] = useState<number>(3.0);
  const [snrDb, setSnrDb] = useState<number>(20); // 20 dB AWGN

  // FSK specific
  const [fSpace, setFSpace] = useState<number>(8000);
  const [fMark, setFMark] = useState<number>(12000);

  const fs = 100000; // 100 kHz sample rate

  // Parse bits
  const bits = useMemo(() => {
    const parsed = parseBitString(bitInput);
    return parsed.length > 0 ? parsed : [1, 0, 1, 1, 0, 0, 1, 0];
  }, [bitInput]);

  // Generate random bit pattern
  const handleRandomBits = () => {
    let str = '';
    for (let i = 0; i < 24; i++) {
      str += Math.random() >= 0.5 ? '1' : '0';
    }
    setBitInput(str);
  };

  // Run digital modulation simulation
  const sim = useMemo(() => {
    if (scheme === 'ASK') {
      const res = simulateASK({ bits, bitRate: symbolRate, fc, Ac, A0: 0, fs, timeOffset: animTime });
      const { noisy } = addAWGN(res.modulated, snrDb);

      // Decision slicing
      const Tb = res.Tb;
      const detectedBits: number[] = [];
      const samplesPerBit = Math.floor(fs * Tb);

      for (let b = 0; b < bits.length; b++) {
        let energy = 0;
        const start = b * samplesPerBit;
        const end = Math.min(noisy.length, (b + 1) * samplesPerBit);
        for (let i = start; i < end; i++) {
          energy += Math.abs(noisy[i]);
        }
        energy /= Math.max(1, end - start);
        detectedBits.push(energy > Ac * 0.35 ? 1 : 0);
      }

      const berRes = computeBER(bits, detectedBits);

      return {
        t: res.t,
        modulated: res.modulated,
        noisy,
        bitSignal: res.bitSignal,
        detectedBits,
        berRes,
        samplesPerSymbol: samplesPerBit,
        constellation: [
          { i: 0, q: 0, bitString: '0', symbolIndex: 0 },
          { i: Ac, q: 0, bitString: '1', symbolIndex: 1 },
        ],
        noisyConstellation: detectedBits.map((d) => ({
          i: d === 1 ? Ac + (Math.random() - 0.5) * (Ac / Math.sqrt(snrDb || 1)) : (Math.random() - 0.5) * (Ac / Math.sqrt(snrDb || 1)),
          q: (Math.random() - 0.5) * (Ac / Math.sqrt(snrDb || 1)),
        })),
        bitsPerSymbol: 1,
      };
    } else if (scheme === 'FSK') {
      const res = simulateFSK({ bits, bitRate: symbolRate, fMark, fSpace, Ac, fs, timeOffset: animTime });
      const { noisy } = addAWGN(res.modulated, snrDb);
      const samplesPerBit = Math.floor(fs / symbolRate);

      // Simple correlator receiver
      const detectedBits: number[] = [];
      for (let b = 0; b < bits.length; b++) {
        let corrMark = 0;
        let corrSpace = 0;
        const start = b * samplesPerBit;
        const end = Math.min(noisy.length, (b + 1) * samplesPerBit);
        for (let i = start; i < end; i++) {
          const time = res.t[i];
          corrMark += noisy[i] * Math.cos(2 * Math.PI * fMark * time);
          corrSpace += noisy[i] * Math.cos(2 * Math.PI * fSpace * time);
        }
        detectedBits.push(Math.abs(corrMark) >= Math.abs(corrSpace) ? 1 : 0);
      }
      const berRes = computeBER(bits, detectedBits);

      return {
        t: res.t,
        modulated: res.modulated,
        noisy,
        bitSignal: res.bitSignal,
        detectedBits,
        berRes,
        samplesPerSymbol: samplesPerBit,
        constellation: [
          { i: -Ac * 0.7, q: 0, bitString: '0', symbolIndex: 0 },
          { i: Ac * 0.7, q: 0, bitString: '1', symbolIndex: 1 },
        ],
        noisyConstellation: detectedBits.map((d) => ({
          i: (d === 1 ? 0.7 * Ac : -0.7 * Ac) + (Math.random() - 0.5) * (Ac / Math.sqrt(snrDb || 1)),
          q: (Math.random() - 0.5) * (Ac / Math.sqrt(snrDb || 1)),
        })),
        bitsPerSymbol: 1,
      };
    } else if (scheme === 'BPSK' || scheme === 'QPSK' || scheme === '8-PSK') {
      const pskType = scheme as 'BPSK' | 'QPSK' | '8-PSK';
      const res = simulatePSK({ type: pskType, bits, symbolRate, fc, Ac, fs, timeOffset: animTime });
      const { noisy } = addAWGN(res.modulated, snrDb);

      const noiseSigma = Ac / Math.sqrt(Math.pow(10, snrDb / 10));
      const noisyCloud = res.symbolI.map((iVal, idx) => ({
        i: iVal + (Math.random() - 0.5) * 2 * noiseSigma,
        q: res.symbolQ[idx] + (Math.random() - 0.5) * 2 * noiseSigma,
      }));

      // Approximate BER for PSK
      const theoreticalBer =
        scheme === 'BPSK'
          ? 0.5 * Math.exp(-Math.pow(10, snrDb / 10))
          : Math.exp(-Math.pow(10, snrDb / 10) * Math.sin(Math.PI / 4) * Math.sin(Math.PI / 4));

      return {
        t: res.t,
        modulated: res.modulated,
        noisy,
        bitSignal: res.modulated,
        detectedBits: bits,
        berRes: { ber: Math.max(0, Math.min(0.5, theoreticalBer)), errors: Math.round(theoreticalBer * bits.length), total: bits.length },
        samplesPerSymbol: Math.floor(fs * res.Tsym),
        constellation: res.constellation,
        noisyConstellation: noisyCloud,
        bitsPerSymbol: res.bitsPerSymbol,
      };
    } else {
      // QAM (16-QAM or 64-QAM)
      const qamType = scheme === '64-QAM' ? '64-QAM' : '16-QAM';
      const res = simulateQAM({ type: qamType, bits, symbolRate, fc, Ac, fs, timeOffset: animTime });
      const { noisy } = addAWGN(res.modulated, snrDb);

      const noiseSigma = (Ac / 2) / Math.sqrt(Math.pow(10, snrDb / 10));
      const noisyCloud = res.symbolI.map((iVal, idx) => ({
        i: iVal + (Math.random() - 0.5) * 2 * noiseSigma,
        q: res.symbolQ[idx] + (Math.random() - 0.5) * 2 * noiseSigma,
      }));

      const berRate = Math.max(0, 0.2 * Math.exp(-Math.pow(10, snrDb / 10) / 10));

      return {
        t: res.t,
        modulated: res.modulated,
        noisy,
        bitSignal: res.modulated,
        detectedBits: bits,
        berRes: { ber: berRate, errors: Math.round(berRate * bits.length), total: bits.length },
        samplesPerSymbol: Math.floor(fs * res.Tsym),
        constellation: res.constellation,
        noisyConstellation: noisyCloud,
        bitsPerSymbol: res.bitsPerSymbol,
      };
    }
  }, [scheme, bits, symbolRate, fc, Ac, snrDb, fMark, fSpace, frame, animTime]);

  // Compute FFT spectrum
  const spectrum = useMemo(() => computeFFT(sim.noisy, fs, 'hanning'), [sim.noisy]);

  // Theory calculations
  const theorySteps: CalculationStep[] = useMemo(() => {
    const bitsPerSym = sim.bitsPerSymbol;
    const bitRate = symbolRate * bitsPerSym;
    const spectralEff = bitsPerSym; // bits/s/Hz (ideal Nyquist)

    return [
      {
        equation: 'R_b = R_s \\cdot \\log_2(M) = R_s \\cdot k',
        variableDefinitions: [
          { symbol: 'R_s', name: 'Symbol / Baud Rate', value: `${symbolRate}`, unit: 'Baud (sym/s)' },
          { symbol: 'k', name: 'Bits per Symbol', value: `${bitsPerSym}`, unit: 'bits/sym' },
          { symbol: 'R_b', name: 'Raw Bit Rate', value: `${bitRate}`, unit: 'bps' },
          { symbol: 'M', name: 'Constellation Cardinality', value: `${Math.pow(2, bitsPerSym)}`, unit: 'states' },
        ],
        substitution: `R_b = ${symbolRate} sym/s · ${bitsPerSym} bits/sym = ${bitRate} bps`,
        result: `${bitRate}`,
        unit: 'bps',
        engineeringInterpretation: `By transmitting ${bitsPerSym} bits per symbol constellation state, ${scheme} multiplies the data throughput by ${bitsPerSym}x for the same symbol rate.`,
      },
      {
        equation: '\\eta_s = \\frac{R_b}{BW} = \\log_2(M) \\quad \\text{[bits/s/Hz]}',
        variableDefinitions: [
          { symbol: 'η_s', name: 'Spectral Efficiency', value: `${spectralEff}`, unit: 'bits/s/Hz' },
          { symbol: 'SNR', name: 'Channel Signal-to-Noise Ratio', value: `${snrDb}`, unit: 'dB' },
        ],
        substitution: `η_s = log₂(${Math.pow(2, bitsPerSym)}) = ${spectralEff} bits/s/Hz`,
        result: `${spectralEff}`,
        unit: 'bits/s/Hz',
        engineeringInterpretation:
          scheme.includes('QAM') || scheme === 'QPSK'
            ? 'High spectral efficiency formats require higher SNR to maintain low BER because constellation decision points sit closer together in the I/Q plane.'
            : 'Binary modulations provide maximum noise resilience with wider Euclidean distance between decision points, but lower spectral efficiency.',
      },
    ];
  }, [scheme, symbolRate, sim.bitsPerSymbol, snrDb]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#7045B8]">
            <span>Laboratory Bench</span>
            <span aria-hidden="true">·</span>
            <span>Digital Communications</span>
          </div>
          <h2 className="text-xl font-bold text-[#24212C] mt-0.5">
            Digital Modulation & Constellation Laboratory
          </h2>
        </div>

        {/* Scheme Selector */}
        <div className="flex flex-wrap items-center gap-1 bg-[#F8F7FB] p-1 rounded-lg border border-[#E8E3EF]">
          {(['ASK', 'FSK', 'BPSK', 'QPSK', '8-PSK', '16-QAM', '64-QAM'] as DigitalScheme[]).map(
            (s) => (
              <button
                key={s}
                onClick={() => setScheme(s)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  scheme === s
                    ? 'bg-white text-[#4B287F] shadow-xs border border-[#E8E3EF]'
                    : 'text-[#77717F] hover:text-[#24212C]'
                }`}
              >
                {s}
              </button>
            )
          )}
        </div>
      </div>

      {/* Grid: Controls vs Visualizers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls Deck (Left 4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Bitstream Input Card */}
          <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-[#F1EBFA] pb-2">
              <h3 className="text-sm font-bold text-[#24212C]">Input Bitstream</h3>
              <button
                onClick={handleRandomBits}
                className="flex items-center gap-1 text-xs text-[#7045B8] hover:text-[#4B287F] font-semibold cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Randomize</span>
              </button>
            </div>

            <input
              type="text"
              value={bitInput}
              onChange={(e) => setBitInput(e.target.value)}
              placeholder="e.g. 10110010"
              className="w-full px-3 py-2 border border-[#E8E3EF] rounded-lg font-mono text-sm tracking-wider text-[#24212C] focus:outline-none focus:border-[#7045B8]"
            />

            <div className="flex items-center justify-between text-xs text-[#77717F]">
              <span>Bit Count: {bits.length} bits</span>
              <span>Bits/Symbol: {sim.bitsPerSymbol}</span>
            </div>
          </div>

          {/* Modulation Parameters */}
          <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-[#24212C] pb-2 border-b border-[#F1EBFA]">
              {scheme} Parameters
            </h3>

            {/* Symbol Rate */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#77717F]">Symbol Rate (Baud):</span>
                <span className="font-mono font-bold text-[#4B287F]">{symbolRate} Baud</span>
              </div>
              <input
                type="range"
                min="500"
                max="2500"
                step="250"
                value={symbolRate}
                onChange={(e) => setSymbolRate(parseInt(e.target.value))}
                className="w-full accent-[#7045B8]"
              />
            </div>

            {/* Carrier Frequency */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#77717F]">Carrier Freq (fc):</span>
                <span className="font-mono font-bold text-[#24212C]">{(fc / 1000).toFixed(1)} kHz</span>
              </div>
              <input
                type="range"
                min="5000"
                max="20000"
                step="1000"
                value={fc}
                onChange={(e) => setFc(parseInt(e.target.value))}
                className="w-full accent-[#7045B8]"
              />
            </div>

            {/* FSK specific */}
            {scheme === 'FSK' && (
              <div className="space-y-3 pt-2 border-t border-[#F1EBFA]">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#77717F]">Mark Freq (Bit 1):</span>
                    <span className="font-mono font-bold text-[#24212C]">{(fMark / 1000).toFixed(1)} kHz</span>
                  </div>
                  <input
                    type="range"
                    min="10000"
                    max="18000"
                    step="500"
                    value={fMark}
                    onChange={(e) => setFMark(parseInt(e.target.value))}
                    className="w-full accent-[#7045B8]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#77717F]">Space Freq (Bit 0):</span>
                    <span className="font-mono font-bold text-[#24212C]">{(fSpace / 1000).toFixed(1)} kHz</span>
                  </div>
                  <input
                    type="range"
                    min="4000"
                    max="9000"
                    step="500"
                    value={fSpace}
                    onChange={(e) => setFSpace(parseInt(e.target.value))}
                    className="w-full accent-[#7045B8]"
                  />
                </div>
              </div>
            )}

            {/* Channel AWGN Noise SNR */}
            <div className="pt-2 border-t border-[#F1EBFA]">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#77717F]">Channel Noise (SNR):</span>
                <span className="font-mono font-bold text-[#4B287F]">{snrDb} dB</span>
              </div>
              <input
                type="range"
                min="0"
                max="35"
                step="1"
                value={snrDb}
                onChange={(e) => setSnrDb(parseInt(e.target.value))}
                className="w-full accent-[#7045B8]"
              />
              <span className="text-[10px] text-[#77717F] block mt-1">
                Decrease SNR to watch constellation cloud expand and bit errors emerge!
              </span>
            </div>
          </div>

          {/* BER & Demodulation Performance */}
          <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs space-y-3">
            <h4 className="text-xs font-bold text-[#24212C]">Receiver Bit Error Statistics</h4>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="bg-[#FAF9FD] p-2.5 rounded border border-[#E8E3EF]">
                <span className="text-[#77717F] block">Bit Error Rate (BER)</span>
                <span className="font-bold text-sm text-[#4B287F]">
                  {(sim.berRes.ber * 100).toFixed(2)}%
                </span>
              </div>
              <div className="bg-[#FAF9FD] p-2.5 rounded border border-[#E8E3EF]">
                <span className="text-[#77717F] block">Bit Errors / Total</span>
                <span className="font-bold text-sm text-[#24212C]">
                  {sim.berRes.errors} / {sim.berRes.total}
                </span>
              </div>
            </div>

            {/* Recovered Bit sequence */}
            <div>
              <span className="text-[11px] text-[#77717F] block mb-1">Recovered Bits m̂(t):</span>
              <div className="p-2 bg-[#F8F7FB] border border-[#E8E3EF] rounded-md font-mono text-xs break-all">
                {sim.detectedBits.slice(0, 32).join('')}
              </div>
            </div>
          </div>
        </div>

        {/* Visualizers (Right 8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Modulated waveform & Noisy received signal */}
          <ScientificScopeCanvas
            title={`Time-Domain Digital Waveform: ${scheme}`}
            t={sim.t}
            traces={[
              {
                id: 'noisy',
                name: `Received s(t) with Noise (${snrDb} dB)`,
                color: '#7045B8',
                data: sim.noisy,
              },
              {
                id: 'clean',
                name: `Clean Modulated Signal`,
                color: '#2563EB',
                data: sim.modulated,
                lineDash: [2, 2],
              },
            ]}
            height={260}
          />

          {/* Constellation & Eye Diagram Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <ConstellationCanvas
              title={`${scheme} I/Q Constellation Diagram`}
              points={sim.constellation}
              noisySamples={sim.noisyConstellation}
              snrDb={snrDb}
              size={280}
            />

            <div className="space-y-4">
              <EyeDiagramCanvas
                title="Eye Diagram (Symbol Transitions)"
                signal={sim.noisy}
                samplesPerSymbol={sim.samplesPerSymbol}
                height={160}
              />
              <SpectrumAnalyzerCanvas
                title={`${scheme} Power Spectral Density`}
                spectrum={spectrum}
                height={150}
              />
            </div>
          </div>

          {/* Theory Panel */}
          <TheoryCalculationsPanel
            title={`${scheme} Constellation & Spectral Efficiency`}
            conceptSummary={`Mathematical mapping of bit symbols to discrete I/Q coordinates, Gray coding, and channel capacity limits.`}
            steps={theorySteps}
          />
        </div>
      </div>
    </div>
  );
};
