import React, { useState, useMemo } from 'react';
import {
  simulateAM,
  simulateFM,
  simulateDSBSC,
  simulateSSB,
  simulatePSK,
  simulateQAM,
  simulatePAM,
  simulatePCM,
  computeFFT,
} from '../services/dsp';
import { ScientificScopeCanvas } from '../components/ScientificScopeCanvas';
import { SpectrumAnalyzerCanvas } from '../components/SpectrumAnalyzerCanvas';
import { useSimulation } from '../context/SimulationContext';
import { Check, X, ArrowRightLeft, Sliders, Info } from 'lucide-react';

export interface ComparisonPreset {
  id: string;
  name: string;
  schemeA: string;
  schemeB: string;
  summary: string;
  metrics: {
    feature: string;
    schemeAVal: string;
    schemeBVal: string;
    winner: 'A' | 'B' | 'Equal';
  }[];
}

const PRESETS: ComparisonPreset[] = [
  {
    id: 'am-vs-fm',
    name: 'AM vs FM (Amplitude vs Frequency)',
    schemeA: 'Conventional AM',
    schemeB: 'Wideband FM',
    summary:
      'AM trades noise immunity for narrow bandwidth and simple diode receivers. FM trades broad RF spectrum for superior noise suppression and constant envelope power amplifier efficiency.',
    metrics: [
      { feature: 'Required Bandwidth', schemeAVal: '2 · fm (2 kHz)', schemeBVal: '2(Δf + fm) (8 kHz)', winner: 'A' },
      { feature: 'Noise Immunity (AWGN)', schemeAVal: 'Poor (Amplitude sensitive)', schemeBVal: 'High (Noise limiter suppresses AM noise)', winner: 'B' },
      { feature: 'Power Efficiency', schemeAVal: 'Low (< 33% at μ=1)', schemeBVal: 'High (Constant envelope allows Class C amps)', winner: 'B' },
      { feature: 'Receiver Complexity', schemeAVal: 'Extremely Simple (Passive diode)', schemeBVal: 'Moderate (PLL / Discriminator)', winner: 'A' },
      { feature: 'Fading Sensitivity', schemeAVal: 'High (Multipath causes severe fading)', schemeBVal: 'Low (Threshold effect captures strongest signal)', winner: 'B' },
    ],
  },
  {
    id: 'dsbsc-vs-ssb',
    name: 'DSB-SC vs SSB (Carrier vs Sideband Suppression)',
    schemeA: 'DSB-SC',
    schemeB: 'Single Sideband (SSB)',
    summary:
      'DSB-SC eliminates the wasted carrier power. SSB goes one step further by eliminating the redundant sideband, halving the RF spectrum requirements.',
    metrics: [
      { feature: 'Transmission Bandwidth', schemeAVal: '2 · fm (2 kHz)', schemeBVal: 'fm (1 kHz) [50% Reduction]', winner: 'B' },
      { feature: 'Carrier Power Wasted', schemeAVal: '0% (Suppressed)', schemeBVal: '0% (Suppressed)', winner: 'Equal' },
      { feature: 'Filter Requirements', schemeAVal: 'Moderate', schemeBVal: 'Strict (Sharp cutoff or Hilbert 90° shifter)', winner: 'A' },
      { feature: 'Coherent Detection Need', schemeAVal: 'Required (Strict phase lock)', schemeBVal: 'Required (Strict phase lock)', winner: 'Equal' },
    ],
  },
  {
    id: 'bpsk-vs-qpsk',
    name: 'BPSK vs QPSK (Binary vs Quadrature PSK)',
    schemeA: 'BPSK (1 bit/sym)',
    schemeB: 'QPSK (2 bits/sym)',
    summary:
      'QPSK doubles the spectral throughput over BPSK while maintaining identical theoretical BER vs Eb/N0 because orthogonal carrier dimensions do not interfere with each other.',
    metrics: [
      { feature: 'Spectral Efficiency', schemeAVal: '1 bit/s/Hz', schemeBVal: '2 bits/s/Hz [2x Throughput]', winner: 'B' },
      { feature: 'Bandwidth for Same Bitrate', schemeAVal: 'Rb Hz', schemeBVal: 'Rb / 2 Hz', winner: 'B' },
      { feature: 'BER vs Eb/N0', schemeAVal: 'Q(√(2Eb/N0))', schemeBVal: 'Q(√(2Eb/N0)) [Identical per bit]', winner: 'Equal' },
      { feature: 'Receiver Hardware', schemeAVal: 'Single Correlator', schemeBVal: 'Dual Orthogonal I/Q Correlators', winner: 'A' },
    ],
  },
  {
    id: '16qam-vs-64qam',
    name: '16-QAM vs 64-QAM (Multi-level Constellations)',
    schemeA: '16-QAM',
    schemeB: '64-QAM',
    summary:
      '64-QAM carries 6 bits per symbol vs 4 bits in 16-QAM. However, points in 64-QAM are packed tightly, demanding significantly higher SNR (> 6 dB higher) to prevent symbol errors.',
    metrics: [
      { feature: 'Bits per Symbol', schemeAVal: '4 bits/sym', schemeBVal: '6 bits/sym (+50% data rate)', winner: 'B' },
      { feature: 'Required SNR for BER=10⁻⁵', schemeAVal: '≈ 18 dB', schemeBVal: '≈ 24 dB (Requires cleaner channel)', winner: 'A' },
      { feature: 'Euclidean Distance', schemeAVal: 'Wider separation', schemeBVal: 'Tightly packed points', winner: 'A' },
      { feature: 'Application Domain', schemeAVal: 'Cable modems, LTE band edges', schemeBVal: 'Wi-Fi 6, 5G NR close-range MIMO', winner: 'Equal' },
    ],
  },
  {
    id: 'pam-vs-pcm',
    name: 'PAM vs PCM (Analog Pulse vs Digital Word)',
    schemeA: 'PAM (Pulse Amplitude)',
    schemeB: 'PCM (Pulse Code Modulation)',
    summary:
      'PAM pulses remain susceptible to analog noise accumulation over multi-hop repeaters. PCM encodes samples into binary pulses that can be cleaned and regenerated with zero noise accumulation.',
    metrics: [
      { feature: 'Noise Accumulation', schemeAVal: 'Continuous noise buildup at every repeater', schemeBVal: 'Zero accumulation (regenerative repeaters)', winner: 'B' },
      { feature: 'Bandwidth Requirement', schemeAVal: 'Moderate (fs)', schemeBVal: 'High (n · fs)', winner: 'A' },
      { feature: 'Quantization Noise', schemeAVal: 'None (Exact amplitude)', schemeBVal: 'Quantization error e(t) inherent', winner: 'A' },
      { feature: 'Modern Applicability', schemeAVal: 'Rarely used for long distance', schemeBVal: 'Universal standard (Audio, Telephony, DSP)', winner: 'B' },
    ],
  },
];

export const ComparisonView: React.FC = () => {
  const { animTime } = useSimulation();
  const [activePreset, setActivePreset] = useState<ComparisonPreset>(PRESETS[0]);

  const fs = 100000;
  const duration = 0.004;

  // Synthesize signals for active preset
  const signals = useMemo(() => {
    if (activePreset.id === 'am-vs-fm') {
      const am = simulateAM({ Ac: 4, fc: 10000, Am: 2.5, fm: 1000, mu: 0.8, fs, duration, timeOffset: animTime });
      const fm = simulateFM({ Ac: 4, fc: 10000, Am: 2.5, fm: 1000, deltaF: 3000, fs, duration, timeOffset: animTime });
      return {
        t: am.t,
        sigA: am.modulated,
        sigB: fm.modulated,
        specA: computeFFT(am.modulated, fs),
        specB: computeFFT(fm.modulated, fs),
      };
    } else if (activePreset.id === 'dsbsc-vs-ssb') {
      const dsb = simulateDSBSC({ Ac: 4, fc: 10000, Am: 2.5, fm: 1000, fs, duration, timeOffset: animTime });
      const ssb = simulateSSB({ Ac: 4, fc: 10000, Am: 2.5, fm: 1000, sideband: 'USB', fs, duration, timeOffset: animTime });
      return {
        t: dsb.t,
        sigA: dsb.modulated,
        sigB: ssb.modulated,
        specA: computeFFT(dsb.modulated, fs),
        specB: computeFFT(ssb.modulated, fs),
      };
    } else if (activePreset.id === 'bpsk-vs-qpsk') {
      const bits = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1];
      const bpsk = simulatePSK({ type: 'BPSK', bits, symbolRate: 1000, fc: 10000, Ac: 3, fs, timeOffset: animTime });
      const qpsk = simulatePSK({ type: 'QPSK', bits, symbolRate: 1000, fc: 10000, Ac: 3, fs, timeOffset: animTime });
      return {
        t: bpsk.t,
        sigA: bpsk.modulated,
        sigB: qpsk.modulated,
        specA: computeFFT(bpsk.modulated, fs),
        specB: computeFFT(qpsk.modulated, fs),
      };
    } else if (activePreset.id === '16qam-vs-64qam') {
      const bits = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1];
      const qam16 = simulateQAM({ type: '16-QAM', bits, symbolRate: 1000, fc: 10000, Ac: 3, fs, timeOffset: animTime });
      const qam64 = simulateQAM({ type: '64-QAM', bits, symbolRate: 1000, fc: 10000, Ac: 3, fs, timeOffset: animTime });
      return {
        t: qam16.t,
        sigA: qam16.modulated,
        sigB: qam64.modulated,
        specA: computeFFT(qam16.modulated, fs),
        specB: computeFFT(qam64.modulated, fs),
      };
    } else {
      // PAM vs PCM
      const pam = simulatePAM({ Am: 2.5, fm: 500, fsPulse: 4000, dutyCycle: 0.3, samplingMode: 'flat-top', fs, duration, timeOffset: animTime });
      const pcm = simulatePCM({ Am: 2.5, fm: 500, fsPulse: 4000, numBits: 4, companding: 'uniform', fs, duration, timeOffset: animTime });
      return {
        t: pam.t,
        sigA: pam.pamSignal,
        sigB: pcm.quantizedSignal,
        specA: computeFFT(pam.pamSignal, fs),
        specB: computeFFT(pcm.quantizedSignal, fs),
      };
    }
  }, [activePreset, animTime]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#7045B8]">
            <span>Benchmarking</span>
            <span aria-hidden="true">·</span>
            <span>Comparative Systems Analysis</span>
          </div>
          <h2 className="text-xl font-bold text-[#24212C] mt-0.5">
            Modulation Technique Trade-off Matrix
          </h2>
        </div>

        {/* Preset Selector */}
        <div className="flex flex-wrap items-center gap-1 bg-[#F8F7FB] p-1 rounded-lg border border-[#E8E3EF]">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePreset(p)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                activePreset.id === p.id
                  ? 'bg-white text-[#4B287F] shadow-xs border border-[#E8E3EF]'
                  : 'text-[#77717F] hover:text-[#24212C]'
              }`}
            >
              {p.name.split(' (')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Preset Summary Callout */}
      <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#F1EBFA] rounded-lg text-[#7045B8]">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#24212C]">{activePreset.name}</h3>
            <p className="text-xs text-[#77717F] leading-relaxed mt-0.5">{activePreset.summary}</p>
          </div>
        </div>

        {/* Comparative Criteria Table */}
        <div className="overflow-x-auto pt-2">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E8E3EF] text-[#77717F] bg-[#FAF9FD]">
                <th className="py-2.5 px-3 font-semibold">Engineering Metric</th>
                <th className="py-2.5 px-3 font-semibold text-[#2563EB]">
                  {activePreset.schemeA}
                </th>
                <th className="py-2.5 px-3 font-semibold text-[#7045B8]">
                  {activePreset.schemeB}
                </th>
                <th className="py-2.5 px-3 font-semibold">Advantage / Trade-off</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1EBFA] font-mono text-[11px]">
              {activePreset.metrics.map((m, idx) => (
                <tr key={idx} className="hover:bg-[#F8F7FB]">
                  <td className="py-2 px-3 font-sans font-medium text-[#24212C]">{m.feature}</td>
                  <td
                    className={`py-2 px-3 ${
                      m.winner === 'A' ? 'font-bold text-[#2563EB] bg-blue-50/50' : 'text-[#77717F]'
                    }`}
                  >
                    {m.schemeAVal}
                  </td>
                  <td
                    className={`py-2 px-3 ${
                      m.winner === 'B' ? 'font-bold text-[#7045B8] bg-[#F1EBFA]/50' : 'text-[#77717F]'
                    }`}
                  >
                    {m.schemeBVal}
                  </td>
                  <td className="py-2 px-3 font-sans text-xs">
                    {m.winner === 'A' ? (
                      <span className="text-[#2563EB] font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Favors {activePreset.schemeA}
                      </span>
                    ) : m.winner === 'B' ? (
                      <span className="text-[#7045B8] font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Favors {activePreset.schemeB}
                      </span>
                    ) : (
                      <span className="text-[#77717F]">Equal / Application Dependent</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Side-by-Side Waveform Oscilloscopes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ScientificScopeCanvas
          title={`Waveform A: ${activePreset.schemeA}`}
          t={signals.t}
          traces={[
            {
              id: 'a',
              name: activePreset.schemeA,
              color: '#2563EB',
              data: signals.sigA,
            },
          ]}
          height={240}
        />

        <ScientificScopeCanvas
          title={`Waveform B: ${activePreset.schemeB}`}
          t={signals.t}
          traces={[
            {
              id: 'b',
              name: activePreset.schemeB,
              color: '#7045B8',
              data: signals.sigB,
            },
          ]}
          height={240}
        />
      </div>

      {/* Side-by-Side Spectra */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <SpectrumAnalyzerCanvas
          title={`RF Spectrum: ${activePreset.schemeA}`}
          spectrum={signals.specA}
          height={220}
        />

        <SpectrumAnalyzerCanvas
          title={`RF Spectrum: ${activePreset.schemeB}`}
          spectrum={signals.specB}
          height={220}
        />
      </div>
    </div>
  );
};
