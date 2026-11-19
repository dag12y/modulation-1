import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Lightbulb } from 'lucide-react';
import { useSimulation } from '../../context/SimulationContext';
import { simulateAMFamilyComparison, MessageShape } from '../../services/chapter2Dsp';
import { DarkSpectrumCanvas } from '../../components/studio/DarkSpectrumCanvas';
import { StudioBenchTopic } from './OverviewStudioView';
import { LatexText } from '../../components/studio/Latex';
import { MultiComparisonAudioPanel } from '../../components/multi-lab/MultiComparisonAudioPanel';

interface ComparisonStudioViewProps {
  onOpenExperiment: (topic: StudioBenchTopic) => void;
}

export const ComparisonStudioView: React.FC<ComparisonStudioViewProps> = ({
  onOpenExperiment,
}) => {
  const [comparisonMode, setComparisonMode] = useState<'audio-dsp' | 'landscape'>('audio-dsp');
  const { animTime } = useSimulation();
  const [fc, setFc] = useState<number>(10000);
  const [fm, setFm] = useState<number>(1000);
  const [mu, setMu] = useState<number>(0.7);
  const [vestigeRatio, setVestigeRatio] = useState<number>(0.25);
  const [messageShape, setMessageShape] = useState<MessageShape>('sine');

  const sim = useMemo(() => {
    return simulateAMFamilyComparison({
      Ac: 1.0,
      fc,
      fm,
      mu,
      vestigeRatio,
      messageShape,
      timeOffset: animTime,
    });
  }, [fc, fm, mu, vestigeRatio, messageShape, animTime]);

  const wMax = messageShape === 'two-tone' ? fm * 2.2 : fm;
  const maxRefBw = Math.max(1, 2 * wMax);

  const cards: {
    exp: string;
    topic: StudioBenchTopic;
    title: string;
    spectrum: typeof sim.am.spectrum;
    carrierFreq?: number;
    filterOverlay?: { frequencies: number[]; response: number[]; color?: string };
    sidebandDesc: string;
    bwKhz: number;
    carrierTag: string;
  }[] = [
    {
      exp: 'EXPERIMENT 01',
      topic: 'conventional-am',
      title: 'DSB-FC',
      spectrum: sim.am.spectrum,
      carrierFreq: fc,
      sidebandDesc: 'USB + LSB',
      bwKhz: (2 * wMax) / 1000,
      carrierTag: 'Carrier: Transmitted (Envelope Det.)',
    },
    {
      exp: 'EXPERIMENT 02',
      topic: 'dsb-sc',
      title: 'DSB-SC',
      spectrum: sim.dsb.spectrum,
      sidebandDesc: 'USB + LSB',
      bwKhz: (2 * wMax) / 1000,
      carrierTag: 'Carrier: Suppressed (Coherent / Costas)',
    },
    {
      exp: 'EXPERIMENT 03',
      topic: 'ssb',
      title: 'SSB-SC',
      spectrum: sim.ssb.spectrum,
      sidebandDesc: 'USB or LSB',
      bwKhz: wMax / 1000,
      carrierTag: 'Carrier: Suppressed (Coherent)',
    },
    {
      exp: 'EXPERIMENT 04',
      topic: 'vsb',
      title: 'VSB',
      spectrum: sim.vsb.spectrum,
      filterOverlay: {
        frequencies: sim.vsb.filterOverlay.frequencies,
        response: sim.vsb.filterOverlay.response,
        color: '#1E4620',
      },
      sidebandDesc: 'USB + vestige $f_v$',
      bwKhz: (wMax * (1 + vestigeRatio)) / 1000,
      carrierTag: 'Carrier: Suppressed* ($H(f+f_c)+H(f-f_c)=1$)',
    },
  ];

  const minViewF = Math.max(0, fc - wMax * 3.2);
  const maxViewF = fc + wMax * 3.2;

  return (
    <div className="flex-1 overflow-y-auto px-5 md:px-10 py-6 space-y-6 max-w-[1440px] w-full mx-auto">
      {/* Header + Mode Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">
            SIDE BY SIDE · MODULATION COMPARISON
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#111827]">
            Same message. Different modulation techniques.
          </h1>
          <p className="text-xs md:text-sm text-slate-600">
            Compare DSB-FC, DSB-SC, SSB-SC, and VSB simultaneously across waveforms, FFT spectra, recovered audio, and power/bandwidth metrics.
          </p>
        </div>

        <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 text-xs font-mono shrink-0 shadow-xs">
          <button
            type="button"
            onClick={() => setComparisonMode('audio-dsp')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              comparisonMode === 'audio-dsp'
                ? 'bg-[#1E4620] text-white font-semibold'
                : 'text-slate-600 hover:text-[#111827]'
            }`}
          >
            44.1 kHz Audio &amp; FFT Lab
          </button>
          <button
            type="button"
            onClick={() => setComparisonMode('landscape')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              comparisonMode === 'landscape'
                ? 'bg-[#1E4620] text-white font-semibold'
                : 'text-slate-600 hover:text-[#111827]'
            }`}
          >
            Analytical Tone Landscape
          </button>
        </div>
      </div>

      {comparisonMode === 'audio-dsp' ? (
        <MultiComparisonAudioPanel />
      ) : (
        <div className="space-y-8">
      {/* Header + Shared Live Controls */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold tracking-tight text-[#111827]">
            Analytical Single/Two-Tone Landscape
          </h2>
          <p className="text-sm text-slate-600">
            Compare live analytical spectra, bandwidth utilization, and carrier power efficiency across all
            four AM schemes.
          </p>
        </div>

        {/* White Shared Parameter Strip */}
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 grid grid-cols-2 sm:grid-cols-5 gap-4 items-center shrink-0 shadow-xs">
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-500">
              <LatexText text="$f_c$" />
              <span className="font-mono text-[#111827] font-semibold tabular-nums">
                {(fc / 1000).toFixed(0)} kHz
              </span>
            </div>
            <input
              type="range"
              min={6000}
              max={18000}
              step={500}
              value={fc}
              onChange={(e) => setFc(Number(e.target.value))}
              className="studio-slider w-full cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-500">
              <LatexText text="$f_m$" />
              <span className="font-mono text-[#111827] font-semibold tabular-nums">
                {(fm / 1000).toFixed(1)} kHz
              </span>
            </div>
            <input
              type="range"
              min={400}
              max={2000}
              step={100}
              value={fm}
              onChange={(e) => setFm(Number(e.target.value))}
              className="studio-slider w-full cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-500">
              <LatexText text="$\mu$ (AM)" />
              <span className="font-mono text-[#1E4620] font-semibold tabular-nums">{mu.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1.2}
              step={0.05}
              value={mu}
              onChange={(e) => setMu(Number(e.target.value))}
              className="studio-slider w-full cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-500">
              <LatexText text="Vestige $f_v/W$" />
              <span className="font-mono text-[#111827] font-semibold tabular-nums">
                {Math.round(vestigeRatio * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={0.5}
              step={0.05}
              value={vestigeRatio}
              onChange={(e) => setVestigeRatio(Number(e.target.value))}
              className="studio-slider w-full cursor-pointer"
            />
          </div>

          <div className="col-span-2 sm:col-span-1 space-y-1">
            <div className="text-[10px] font-mono text-slate-500">Tone</div>
            <div className="flex bg-slate-100 p-0.5 rounded-md border border-slate-200">
              {(['sine', 'two-tone'] as MessageShape[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setMessageShape(s)}
                  className={`flex-1 py-0.5 text-[10px] font-mono rounded cursor-pointer whitespace-nowrap ${
                    messageShape === s ? 'bg-[#1E4620] text-white font-semibold' : 'text-slate-600'
                  }`}
                >
                  {s === 'sine' ? '1-Tone' : '2-Tone'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4 Live White Spectrum Cards */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">
              A VISUAL COMPARISON
            </div>
            <h2 className="text-lg font-bold text-[#111827]">Where the information lives</h2>
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            <LatexText
              text={`Reference $f_c = ${(fc / 1000).toFixed(1)}\\,\\text{kHz}$ · $W = ${(wMax / 1000).toFixed(2)}\\,\\text{kHz}$`}
            />
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {cards.map((card) => {
            const bwPct = Math.min(100, Math.round(((card.bwKhz * 1000) / maxRefBw) * 100));
            return (
              <div
                key={card.title}
                onClick={() => onOpenExperiment(card.topic)}
                className="group bg-white border border-slate-200 hover:border-[#1E4620] rounded-2xl p-4 space-y-3 transition-colors cursor-pointer shadow-xs"
              >
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  <span>{card.exp}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#1E4620]" />
                </div>

                <h3 className="text-xl font-bold text-[#111827] tracking-tight">{card.title}</h3>

                <div className="border border-slate-100 rounded-lg p-1 bg-white">
                  <DarkSpectrumCanvas
                    spectrum={card.spectrum}
                    carrierFreqHz={card.carrierFreq}
                    minFreqHz={minViewF}
                    maxFreqHz={maxViewF}
                    filterOverlay={card.filterOverlay}
                    height={215}
                    mini
                  />
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-slate-500">
                    <LatexText text={card.sidebandDesc} />
                  </span>
                  <span className="font-mono text-[#111827] font-semibold tabular-nums">
                    {card.bwKhz.toFixed(2)} kHz
                  </span>
                </div>

                {/* Bandwidth Utilization Bar */}
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1E4620] rounded-full transition-all duration-200"
                    style={{ width: `${bwPct}%` }}
                  />
                </div>

                <div className="text-[11px] text-slate-500">
                  <LatexText text={card.carrierTag} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* The Modulation Landscape Table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#111827]">The modulation landscape</h2>
            <p className="text-xs text-slate-500">
              <LatexText
                text={`$B$ = message bandwidth (${(wMax / 1000).toFixed(2)} kHz) · $B_v$ = vestigial bandwidth (${((wMax * vestigeRatio) / 1000).toFixed(2)} kHz)`}
              />
            </p>
          </div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
            04 TECHNIQUES
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#EFF3EB] text-slate-600 text-[11px] font-semibold border-b border-[#DCE5D5]">
                <th className="py-3 px-4">Modulation type</th>
                <th className="py-3 px-4">Carrier</th>
                <th className="py-3 px-4">Sidebands</th>
                <th className="py-3 px-4">Bandwidth</th>
                <th className="py-3 px-4">Power efficiency</th>
                <th className="py-3 px-4">Demodulation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                {
                  name: 'DSB-FC',
                  sub: 'Double Sideband Full Carrier',
                  topic: 'conventional-am' as StudioBenchTopic,
                  dot: '#0284C7',
                  carrier: 'Transmitted',
                  carrierHighlight: true,
                  sidebands: 'USB + LSB',
                  bw: `$2B$ (${((2 * wMax) / 1000).toFixed(2)} kHz)`,
                  eff: `$\\eta = \\frac{\\mu^2}{2+\\mu^2} = ${sim.am.efficiencyPct.toFixed(1)}\\%$ ($\\le 33.3\\%$)`,
                  demod: 'Diode + $RC$ envelope detection',
                },
                {
                  name: 'DSB-SC',
                  sub: 'Double Sideband Suppressed Carrier',
                  topic: 'dsb-sc' as StudioBenchTopic,
                  dot: '#7C3AED',
                  carrier: 'Suppressed',
                  carrierHighlight: false,
                  sidebands: 'USB + LSB',
                  bw: `$2B$ (${((2 * wMax) / 1000).toFixed(2)} kHz)`,
                  eff: '$100\\%$ power in sidebands',
                  demod: 'Coherent / Costas I/Q Loop',
                },
                {
                  name: 'SSB-SC',
                  sub: 'Single Sideband Suppressed Carrier',
                  topic: 'ssb' as StudioBenchTopic,
                  dot: '#15803D',
                  carrier: 'Suppressed',
                  carrierHighlight: false,
                  sidebands: 'USB or LSB',
                  bw: `$B$ (${(wMax / 1000).toFixed(2)} kHz)`,
                  eff: '$100\\%$ power + half bandwidth',
                  demod: 'Coherent detection ($\\phi \\to 0$)',
                },
                {
                  name: 'VSB',
                  sub: 'Vestigial Sideband',
                  topic: 'vsb' as StudioBenchTopic,
                  dot: '#D97706',
                  carrier: 'Suppressed*',
                  carrierHighlight: false,
                  sidebands: 'USB + vestige $f_v$',
                  bw: `$B + B_v$ (${((wMax * (1 + vestigeRatio)) / 1000).toFixed(2)} kHz)`,
                  eff: 'Balances bandwidth with complementary $H(f)$',
                  demod: 'Coherent (or envelope + carrier)',
                },
              ].map((row) => (
                <tr
                  key={row.name}
                  onClick={() => onOpenExperiment(row.topic)}
                  className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                >
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2 font-semibold text-[#111827]">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: row.dot }}
                      />
                      <span>{row.name}</span>
                      <ArrowUpRight className="w-3 h-3 text-slate-400" />
                    </div>
                    <div className="text-[11px] text-slate-500 pl-4">{row.sub}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                        row.carrierHighlight
                          ? 'bg-[#EFF3EB] text-[#1E4620]'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {row.carrier}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-700">
                    <LatexText text={row.sidebands} />
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-[#111827] tabular-nums">
                    <LatexText text={row.bw} />
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 tabular-nums">
                    <LatexText text={row.eff} />
                  </td>
                  <td className="py-3.5 px-4 text-slate-700">
                    <LatexText text={row.demod} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bottom Takeaway Callout */}
      <div className="bg-[#EFF3EB] border border-[#DCE5D5] rounded-xl px-5 py-4 flex items-start gap-3">
        <Lightbulb className="w-4 h-4 text-[#1E4620] shrink-0 mt-0.5" />
        <div className="text-xs text-slate-700 leading-relaxed">
          <span className="font-semibold text-[#111827] block">
            There is no single best modulation technique.
          </span>
          <LatexText text="DSB-FC favors simple diode+$RC$ receivers ($\eta \le 33.3\%$). SSB conserves spectrum ($BW = W$). DSB-SC saves carrier power ($100\%$). VSB balances bandwidth with complementary filtering $H(f+f_c)+H(f-f_c)=1$." />
        </div>
      </div>
        </div>
      )}
    </div>
  );
};
