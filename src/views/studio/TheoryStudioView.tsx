import React from 'react';
import { ArrowRight } from 'lucide-react';
import { StudioBenchTopic } from './OverviewStudioView';
import { Latex, LatexText } from '../../components/studio/Latex';

interface TheoryStudioViewProps {
  onOpenExperiment: (topic: StudioBenchTopic) => void;
}

export const TheoryStudioView: React.FC<TheoryStudioViewProps> = ({ onOpenExperiment }) => {
  const sections: {
    index: string;
    topic: StudioBenchTopic;
    title: string;
    equation: string;
    bullets: string[];
  }[] = [
    {
      index: '01',
      topic: 'conventional-am',
      title: 'Conventional AM (DSB-FC)',
      equation: String.raw`s(t) = A_c\left[1 + k_a m(t)\right]\cos(2\pi f_c t), \quad S(f) = \frac{A_c}{2}\left[\delta(f-f_c)+\delta(f+f_c)\right] + \frac{k_a A_c}{2}\left[M(f-f_c)+M(f+f_c)\right]`,
      bullets: [
        'Modulation index $\\mu = k_a A_m = \\frac{A_{\\max} - A_{\\min}}{A_{\\max} + A_{\\min}}$. Over-modulation ($\\mu > 1$) causes phase reversal and severe envelope distortion.',
        'Power efficiency $\\eta = \\frac{\\mu^2}{2 + \\mu^2}$ reaches at most $33.3\\%$ for single-tone modulation at $\\mu = 1$; the carrier consumes at least $\\frac{2}{3}$ of total power ($\\eta_{\\text{BW}} = \\frac{B_m}{BW_{\\text{AM}}} = 50\\%$).',
        'Diode + $RC$ envelope detector requires $\\frac{1}{\\omega_c} \\ll R_l C \\ll \\frac{1}{\\omega_m}$ so the capacitor tracks the envelope without diagonal clipping or carrier ripple.',
        'Square-law modulator sums $v_1(t) = A_c\\cos(2\\pi f_c t) + m(t)$ into a nonlinear diode $v_2(t) = a_1 v_1 + a_2 v_1^2$, followed by a BPF tuned to $f_c$ yielding $x(t) = A_c a_1\\left[1 + \\frac{2a_2}{a_1}m(t)\\right]\\cos(2\\pi f_c t)$.',
      ],
    },
    {
      index: '02',
      topic: 'dsb-sc',
      title: 'DSB-SC & Costas Loop',
      equation: String.raw`s(t) = A_c m(t)\cos(2\pi f_c t) \qquad v_o(t) = \frac{1}{2} A_c A_c'\cos(\phi)\,m(t)`,
      bullets: [
        'Suppressing the carrier yields $\\eta = 100\\%$ power efficiency in the two symmetric sidebands ($BW = 2W$), with $180^\\circ$ carrier phase reversals at $m(t)$ zero crossings.',
        'Balanced 4-diode ring modulator switches $m(t)$ with a square-wave carrier $\\text{sgn}[\\cos(2\\pi f_c t)]$, producing odd harmonics at $3f_c, 5f_c$ removed by a BPF to yield $v_{\\text{out}}(t) = \\frac{2A_c}{\\pi}m(t)\\cos(2\\pi f_c t)$.',
        'Coherent receiver LO phase error $\\phi$ scales demodulated output by $\\cos(\\phi)$, creating a complete quadrature null at $\\phi = \\pm 90^\\circ$.',
        'Costas receiver drives VCO phase error $\\phi(t) \\to 0$ using the $I \\cdot Q$ phase discriminator ($\\propto \\sin 2\\phi$) without transmitting a pilot carrier.',
      ],
    },
    {
      index: '03',
      topic: 'ssb',
      title: 'Single-Sideband (SSB-SC)',
      equation: String.raw`s_{\text{SSB}}(t) = \frac{A_c}{2}\left[m(t)\cos(2\pi f_c t) \mp \hat{m}(t)\sin(2\pi f_c t)\right], \quad \hat{m}(t) = \frac{1}{\pi}\int_{-\infty}^{\infty}\frac{m(\tau)}{t-\tau}\,d\tau`,
      bullets: [
        'Eliminating one sideband halves occupied bandwidth to $B_T = W$ while preserving $100\\%$ sideband power efficiency.',
        'Phase discrimination uses a $-90^\\circ$ Hilbert transformer $\\hat{m}(t)$ to cancel LSB ($-$ sign $\\to$ USB) or USB ($+$ sign $\\to$ LSB).',
        'Frequency discrimination relies on sharp crystal bandpass filtering, practical when the baseband spectrum exhibits an energy gap $f_a$ near DC.',
      ],
    },
    {
      index: '04',
      topic: 'vsb',
      title: 'Vestigial Sideband (VSB)',
      equation: String.raw`H(f + f_c) + H(f - f_c) = 1 \;\;\text{for } |f| \le W \qquad B_T = W + f_v \approx 1.25\,W`,
      bullets: [
        'Compromises between DSB-SC ($2W$) and brick-wall SSB ($W$) by retaining a small vestige $f_v$ of the opposite sideband.',
        'Distortion-free coherent recovery holds whenever shaping filter $H(f)$ obeys odd/complementary symmetry around $\\pm f_c$.',
        'Used in analog television broadcasting (e.g., NTSC $18\\%$ vestige) where baseband video energy extends close to DC.',
      ],
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-5 md:px-10 py-6 space-y-6 max-w-[1160px] w-full mx-auto">
      <div className="border-b border-slate-200 pb-4">
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">
          ENGINEERING REFERENCE NOTES
        </div>
        <h1 className="text-3xl font-bold text-[#111827] mt-1">
          Amplitude Modulation &amp; Demodulation Equations
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {sections.map((sec) => (
          <div
            key={sec.index}
            className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start"
          >
            <div className="lg:col-span-5 space-y-2.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                TOPIC {sec.index}
              </div>
              <h2 className="text-lg font-bold text-[#111827]">{sec.title}</h2>
              <div className="bg-[#EFF3EB] border border-[#DCE5D5] text-[#1E4620] px-3.5 py-2.5 rounded-lg overflow-x-auto text-sm">
                <Latex math={sec.equation} displayMode />
              </div>
              <button
                onClick={() => onOpenExperiment(sec.topic)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E4620] hover:underline cursor-pointer pt-1"
              >
                <span>Simulate in instrument</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="lg:col-span-7 bg-[#EFF3EB] border border-[#DCE5D5] rounded-xl p-4 space-y-2.5">
              {sec.bullets.map((b, i) => (
                <div key={i} className="text-xs text-slate-700 leading-relaxed flex gap-2">
                  <span className="font-mono text-[#1E4620] font-semibold">·</span>
                  <LatexText text={b} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
