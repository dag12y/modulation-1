import React from 'react';
import {
  Radio,
  Activity,
  AudioWaveform,
  Sliders,
  Cpu,
  Layers,
  ArrowRight,
  TrendingUp,
  Award,
  Zap,
  Play,
  RotateCcw,
} from 'lucide-react';

interface DashboardProps {
  onSelectExperiment: (labId: string, subMode?: string) => void;
}

export const DashboardView: React.FC<DashboardProps> = ({ onSelectExperiment }) => {
  const quickExperiments = [
    {
      id: 'analog',
      subMode: 'AM',
      title: 'Amplitude Modulation (AM)',
      tag: 'Analog CW',
      desc: 'Investigate carrier envelope, modulation index (μ = 0 to 1.5+), overmodulation distortion, sideband power, and envelope detection.',
      icon: Radio,
      badge: 'Exp 01',
    },
    {
      id: 'analog',
      subMode: 'FM',
      title: 'Frequency Modulation (FM)',
      tag: 'Angle Modulation',
      desc: "Simulate instantaneous frequency deviation, modulation index (β), Carson's rule bandwidth, and frequency discriminator demodulation.",
      icon: Activity,
      badge: 'Exp 02',
    },
    {
      id: 'analog',
      subMode: 'DSB-SC',
      title: 'Double Sideband Suppressed Carrier',
      tag: 'Carrier-Suppressed',
      desc: '100% power efficiency transmission. Observe carrier suppression in RF spectrum and coherent product detector synchronization.',
      icon: Layers,
      badge: 'Exp 03',
    },
    {
      id: 'digital',
      subMode: 'BPSK',
      title: 'Binary Phase Shift Keying (BPSK)',
      tag: 'Digital PSK',
      desc: 'Phase transitions (0° and 180°), Gray mapping, I/Q constellation diagram, eye diagram opening, and bit error rate (BER) over AWGN.',
      icon: Cpu,
      badge: 'Exp 04',
    },
    {
      id: 'digital',
      subMode: 'QPSK',
      title: 'Quadrature PSK (QPSK)',
      tag: 'Digital PSK',
      desc: 'Doubles spectral efficiency (2 bits/symbol) using orthogonal I and Q carriers with four constellation quadrants.',
      icon: AudioWaveform,
      badge: 'Exp 05',
    },
    {
      id: 'digital',
      subMode: '16-QAM',
      title: '16-Quadrature Amplitude Modulation',
      tag: 'Digital QAM',
      desc: 'High data-rate communication combining amplitude and phase variation in a 4x4 grid. EVM and decision boundary analysis.',
      icon: Zap,
      badge: 'Exp 06',
    },
    {
      id: 'pulse',
      subMode: 'PCM',
      title: 'Pulse Code Modulation (PCM)',
      tag: 'Pulse / Digital',
      desc: 'Nyquist sampling, uniform and μ-law quantization, quantization error e(t), SQNR calculation, and binary digital word generation.',
      icon: Sliders,
      badge: 'Exp 07',
    },
  ];

  const categories = [
    {
      name: 'Analog Continuous-Wave',
      count: '4 Modulations',
      items: ['Conventional AM', 'DSB-SC', 'SSB (USB & LSB)', 'VSB'],
      action: () => onSelectExperiment('analog', 'AM'),
    },
    {
      name: 'Angle Modulation',
      count: '2 Modulations',
      items: ['Narrowband & Wideband FM', 'Phase Modulation (PM)'],
      action: () => onSelectExperiment('analog', 'FM'),
    },
    {
      name: 'Digital Shift Keying',
      count: '4 Standards',
      items: ['ASK / OOK', 'BFSK', 'M-ary PSK (BPSK/QPSK/8-PSK)', 'M-ary QAM (4/16/64-QAM)'],
      action: () => onSelectExperiment('digital', 'BPSK'),
    },
    {
      name: 'Pulse Modulation & Coding',
      count: '6 Techniques',
      items: ['PAM (Natural/Flat-top)', 'PWM', 'PPM', 'PCM (Uniform/μ-Law)', 'Delta Modulation'],
      action: () => onSelectExperiment('pulse', 'PCM'),
    },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Welcome Banner */}
      <div className="bg-white border border-[#E8E3EF] rounded-2xl p-6 md:p-8 shadow-xs relative overflow-hidden">
        <div className="max-w-3xl space-y-3 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#F1EBFA] border border-[#7045B8]/20 rounded-full text-xs font-semibold text-[#4B287F]">
            <span>ModuLab Digital Workbench</span>
            <span aria-hidden="true">·</span>
            <span>University Communication Systems</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#24212C]">
            Interactive Modulation & Demodulation Laboratory
          </h1>
          <p className="text-sm md:text-base text-[#77717F] leading-relaxed">
            Explore signal synthesis, continuous-wave analog modulation, digital constellation spaces,
            pulse coding, channel impairments, and receiver recovery with rigorous mathematical accuracy.
          </p>

          <div className="pt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={() => onSelectExperiment('analog', 'AM')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#7045B8] hover:bg-[#4B287F] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Launch AM Laboratory</span>
            </button>
            <button
              onClick={() => onSelectExperiment('digital', 'QPSK')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#F1EBFA] hover:bg-[#E8E3EF] text-[#4B287F] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Explore Digital QPSK & Constellations</span>
            </button>
            <button
              onClick={() => onSelectExperiment('theory')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-[#E8E3EF] hover:border-[#7045B8]/40 text-[#24212C] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Award className="w-3.5 h-3.5 text-[#7045B8]" />
              <span>Interactive Learning Modules</span>
            </button>
          </div>
        </div>

        {/* Subtle decorative background lines */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none hidden lg:flex items-center justify-center overflow-hidden">
          <AudioWaveform className="w-80 h-80 text-[#7045B8]" />
        </div>
      </div>

      {/* Quick-Start Experiment Cards Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[#24212C]">Quick-Start Laboratory Experiments</h2>
            <p className="text-xs text-[#77717F]">Select any core modulation scheme to configure, simulate, and analyze.</p>
          </div>
          <span className="text-xs font-mono text-[#77717F]">7 Ready Experiments</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickExperiments.map((exp, idx) => {
            const Icon = exp.icon;
            return (
              <div
                key={idx}
                onClick={() => onSelectExperiment(exp.id, exp.subMode)}
                className="group bg-white border border-[#E8E3EF] hover:border-[#7045B8]/40 rounded-xl p-5 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 bg-[#F1EBFA] text-[#7045B8] group-hover:bg-[#7045B8] group-hover:text-white rounded-lg transition-colors">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[#77717F]">
                      <span className="font-mono">{exp.badge}</span>
                      <span>·</span>
                      <span>{exp.tag}</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-[#24212C] group-hover:text-[#7045B8] transition-colors">
                      {exp.title}
                    </h3>
                    <p className="text-xs text-[#77717F] mt-1 line-clamp-3 leading-relaxed">
                      {exp.desc}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#F1EBFA] flex items-center justify-between text-xs font-semibold text-[#7045B8]">
                  <span>Open Simulation</span>
                  <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modulation Categories & Learning Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Categories */}
        <div className="lg:col-span-2 bg-white border border-[#E8E3EF] rounded-xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#F1EBFA]">
            <div>
              <h3 className="text-sm font-bold text-[#24212C]">Communication System Categories</h3>
              <p className="text-xs text-[#77717F]">Modular coverage across classic and modern communication engineering</p>
            </div>
            <TrendingUp className="w-4 h-4 text-[#7045B8]" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {categories.map((cat, idx) => (
              <div
                key={idx}
                onClick={cat.action}
                className="p-4 rounded-lg bg-[#FAF9FD] border border-[#E8E3EF] hover:border-[#7045B8]/30 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-[#24212C] group-hover:text-[#7045B8]">
                    {cat.name}
                  </h4>
                  <span className="text-[11px] font-mono text-[#4B287F] font-semibold bg-[#F1EBFA] px-2 py-0.5 rounded">
                    {cat.count}
                  </span>
                </div>
                <ul className="text-xs text-[#77717F] space-y-1">
                  {cat.items.map((it, iIdx) => (
                    <li key={iIdx} className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#7045B8]/50" />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Laboratory Stats & Learning Metrics */}
        <div className="bg-white border border-[#E8E3EF] rounded-xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#F1EBFA]">
              <h3 className="text-sm font-bold text-[#24212C]">Laboratory Specs</h3>
              <span className="text-xs font-mono text-[#7045B8]">Active Session</span>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-[#FAF9FD] border border-[#E8E3EF]">
                <span className="text-xs text-[#77717F] block">Mathematical Engine</span>
                <span className="text-xs font-semibold text-[#24212C]">Double-Precision 64-bit Floating Point</span>
              </div>
              <div className="p-3 rounded-lg bg-[#FAF9FD] border border-[#E8E3EF]">
                <span className="text-xs text-[#77717F] block">FFT Spectral Analysis</span>
                <span className="text-xs font-semibold text-[#24212C]">Radix-2 Cooley-Tukey (up to 2048 bins)</span>
              </div>
              <div className="p-3 rounded-lg bg-[#FAF9FD] border border-[#E8E3EF]">
                <span className="text-xs text-[#77717F] block">Receiver Testing</span>
                <span className="text-xs font-semibold text-[#24212C]">Coherent, Envelope, PLL, & Matched Slicers</span>
              </div>
              <div className="p-3 rounded-lg bg-[#FAF9FD] border border-[#E8E3EF]">
                <span className="text-xs text-[#77717F] block">Channel Impairments</span>
                <span className="text-xs font-semibold text-[#24212C]">AWGN (Box-Muller), Multipath, Attenuation</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#F1EBFA]">
            <button
              onClick={() => onSelectExperiment('comparison')}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#F1EBFA] hover:bg-[#E8E3EF] text-[#4B287F] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <span>Compare Multiple Modulations</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
