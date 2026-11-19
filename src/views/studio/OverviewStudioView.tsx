import React, { useMemo } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen } from 'lucide-react';
import { useSimulation } from '../../context/SimulationContext';
import {
  simulateAMFamilyComparison,
} from '../../services/chapter2Dsp';
import { DarkOscilloscopeCanvas } from '../../components/studio/DarkOscilloscopeCanvas';
import { DarkSpectrumCanvas } from '../../components/studio/DarkSpectrumCanvas';
import { Latex, LatexText } from '../../components/studio/Latex';

export type StudioBenchTopic = 'conventional-am' | 'dsb-sc' | 'ssb' | 'vsb';

interface OverviewStudioViewProps {
  onOpenExperiment: (topic: StudioBenchTopic) => void;
  onOpenComparison: () => void;
  onOpenTheory: () => void;
}

export const OverviewStudioView: React.FC<OverviewStudioViewProps> = ({
  onOpenExperiment,
  onOpenComparison,
  onOpenTheory,
}) => {
  const { animTime } = useSimulation();

  const previewSim = useMemo(() => {
    return simulateAMFamilyComparison({
      Ac: 1.0,
      fc: 10000,
      fm: 1000,
      mu: 0.7,
      vestigeRatio: 0.25,
      messageShape: 'sine',
      timeOffset: animTime,
    });
  }, [animTime]);

  const benchCards: {
    index: string;
    topic: StudioBenchTopic;
    title: string;
    subtitle: string;
    bwLabel: string;
    summary: string;
    spectrum: typeof previewSim.am.spectrum;
    carrierHz?: number;
    filterOverlay?: { frequencies: number[]; response: number[]; color?: string };
  }[] = [
    {
      index: '01',
      topic: 'conventional-am',
      title: 'DSB-FC',
      subtitle: 'Double Sideband Full Carrier',
      bwLabel: '$2B$',
      summary: 'Two symmetric sidebands plus full carrier for envelope detection.',
      spectrum: previewSim.am.spectrum,
      carrierHz: 10000,
    },
    {
      index: '02',
      topic: 'dsb-sc',
      title: 'DSB-SC',
      subtitle: 'Double Sideband Suppressed Carrier',
      bwLabel: '$2B$',
      summary: 'Suppresses the carrier so $100\\%$ of power goes into the sidebands.',
      spectrum: previewSim.dsb.spectrum,
    },
    {
      index: '03',
      topic: 'ssb',
      title: 'SSB-SC',
      subtitle: 'Single Sideband Suppressed Carrier',
      bwLabel: '$B$',
      summary: 'Transmits one sideband only, cutting spectral bandwidth in half.',
      spectrum: previewSim.ssb.spectrum,
    },
    {
      index: '04',
      topic: 'vsb',
      title: 'VSB',
      subtitle: 'Vestigial Sideband',
      bwLabel: '$B + B_v$',
      summary: 'One full sideband plus a shaped vestige $f_v$ for practical filter roll-off.',
      spectrum: previewSim.vsb.spectrum,
      filterOverlay: {
        frequencies: previewSim.vsb.filterOverlay.frequencies,
        response: previewSim.vsb.filterOverlay.response,
        color: '#1E4620',
      },
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-5 md:px-10 py-8 space-y-12 max-w-[1380px] w-full mx-auto">
      {/* Hero Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-6 space-y-5">
          <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-slate-500">
            AM STUDIO / MODULATION LABORATORY
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-[#111827] leading-[1.08]">
            Find the signal.
            <br />
            <span className="font-serif italic font-normal text-[#1E4620]">
              Understand the science.
            </span>
          </h1>

          <p className="text-sm md:text-base text-slate-600 max-w-md leading-relaxed">
            Interactive Amplitude Modulation &amp; Demodulation laboratory. Inspect live
            waveforms, circuits, FFT spectra, and receiver recovery side by side.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <button
              onClick={() => onOpenExperiment('conventional-am')}
              className="inline-flex items-center gap-2.5 px-5 py-3 rounded-lg bg-[#1E4620] hover:bg-[#153316] text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              <span>Enter the laboratory</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenTheory}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:text-[#1E4620] transition-colors cursor-pointer"
            >
              <BookOpen className="w-4 h-4" />
              <span>Modulation equations</span>
            </button>

            <button
              onClick={onOpenComparison}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-[#1E4620] transition-colors cursor-pointer"
            >
              <span>Compare techniques</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* White Live Preview Instrument Card */}
        <div className="lg:col-span-6 flex justify-center lg:justify-end">
          <div
            onClick={() => onOpenExperiment('conventional-am')}
            className="w-full max-w-[510px] bg-white border border-slate-200 rounded-2xl p-5 shadow-lg transform lg:rotate-1 hover:rotate-0 transition-transform duration-300 cursor-pointer"
          >
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">
              <span className="text-[#1E4620] font-semibold">SIGNAL STUDY · LIVE</span>
              <span>DSB-FC + DEMOD</span>
            </div>

            <div className="mb-2">
              <div className="text-3xl font-mono font-bold text-[#111827] tabular-nums">
                10.00 <span className="text-sm font-normal text-slate-400">kHz</span>
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                <LatexText text="CARRIER REFERENCE · $\mu = 0.70$" />
              </div>
            </div>

            <div className="border border-slate-100 rounded-xl p-1 bg-white">
              <DarkOscilloscopeCanvas
                t={previewSim.t}
                traces={[
                  {
                    id: 'am-preview',
                    label: 's(t)',
                    color: '#15803D',
                    data: previewSim.am.modulated,
                  },
                  {
                    id: 'am-demod-preview',
                    label: 'y_demod(t)',
                    color: '#EA580C',
                    data: previewSim.am.rcDemodAC,
                    lineDash: [4, 3],
                  },
                ]}
                mode="overlay"
                height={220}
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2 text-[11px] text-slate-600">
              <Latex math="s(t) = A_c[1 + \mu\, m_n(t)]\cos(2\pi f_c t)" />
              <span className="text-[#1E4620] font-mono font-semibold">Mod &amp; Demod</span>
            </div>
          </div>
        </div>
      </section>

      {/* Experiment Bench Cards */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4 border-b border-slate-200 pb-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">
              FOUR WAYS TO CARRY AN IDEA
            </div>
            <h2 className="text-xl font-bold text-[#111827] mt-0.5">Your experiment bench</h2>
          </div>

          <button
            onClick={onOpenComparison}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-[#1E4620] cursor-pointer whitespace-nowrap"
          >
            <span>Compare all techniques</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {benchCards.map((card) => (
            <button
              key={card.topic}
              onClick={() => onOpenExperiment(card.topic)}
              className="group text-left bg-white border border-slate-200 hover:border-[#1E4620] rounded-xl p-4 flex flex-col justify-between transition-all cursor-pointer"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  <span>EXPERIMENT / {card.index}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#1E4620]" />
                </div>

                <div className="bg-white rounded-lg p-1.5 border border-slate-200 overflow-hidden">
                  <DarkSpectrumCanvas
                    spectrum={card.spectrum}
                    carrierFreqHz={card.carrierHz}
                    minFreqHz={7000}
                    maxFreqHz={13000}
                    filterOverlay={card.filterOverlay}
                    height={155}
                    mini
                  />
                </div>

                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-lg font-bold text-[#111827]">{card.title}</h3>
                    <span className="text-xs text-slate-600 tabular-nums">
                      <LatexText text={card.bwLabel} />
                    </span>
                  </div>
                  <div className="text-[11px] font-medium text-slate-500">{card.subtitle}</div>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    <LatexText text={card.summary} />
                  </p>
                </div>
              </div>

              <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700 group-hover:text-[#1E4620]">
                <span>Open instrument</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
