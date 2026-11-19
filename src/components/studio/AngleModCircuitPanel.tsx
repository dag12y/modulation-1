import React, { useState } from 'react';
import { Latex } from './Latex';

export interface AngleModCircuitProps {
  mode: 'fm' | 'pm';
  fc: number;
  fm: number;
  deltaFHz: number;
  kpRadPerV: number;
  fmDemodMode: 'slope' | 'pll';
  pmDemodMode: 'coherent-pd' | 'fm-integrator';
  isSimulating: boolean;
  simulationSpeed: number;
}

// ============================================================================
// REUSABLE REAL ELECTRONIC SCHEMATIC SYMBOLS (IEEE / IEC)
// ============================================================================
const GroundSym: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g stroke="#334155" strokeWidth="1.5" strokeLinecap="round">
    <line x1={x} y1={y} x2={x} y2={y + 8} />
    <line x1={x - 9} y1={y + 8} x2={x + 9} y2={y + 8} />
    <line x1={x - 6} y1={y + 12} x2={x + 6} y2={y + 12} />
    <line x1={x - 3} y1={y + 16} x2={x + 3} y2={y + 16} />
  </g>
);

const ResistorH: React.FC<{ x: number; y: number; label: string; val: string }> = ({
  x,
  y,
  label,
  val,
}) => (
  <g>
    <path
      d={`M ${x} ${y} l 6 0 l 3 -6 l 6 12 l 6 -12 l 6 12 l 6 -12 l 3 6 l 6 0`}
      fill="none"
      stroke="#1E293B"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <text x={x + 21} y={y - 10} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#0F172A">
      {label}
    </text>
    <text
      x={x + 21}
      y={y + 16}
      textAnchor="middle"
      fontSize="8.5"
      fontFamily="monospace"
      fill="#1E4620"
    >
      {val}
    </text>
  </g>
);

const ResistorV: React.FC<{ x: number; y: number; label: string; val: string; left?: boolean }> = ({
  x,
  y,
  label,
  val,
  left,
}) => (
  <g>
    <path
      d={`M ${x} ${y} l 0 6 l -5 3 l 10 5 l -10 5 l 10 5 l -10 5 l 5 3 l 0 6`}
      fill="none"
      stroke="#1E293B"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <text
      x={left ? x - 9 : x + 9}
      y={y + 17}
      textAnchor={left ? 'end' : 'start'}
      fontSize="9.5"
      fontWeight="700"
      fill="#0F172A"
    >
      {label}
    </text>
    <text
      x={left ? x - 9 : x + 9}
      y={y + 28}
      textAnchor={left ? 'end' : 'start'}
      fontSize="8.5"
      fontFamily="monospace"
      fill="#1E4620"
    >
      {val}
    </text>
  </g>
);

const CapacitorH: React.FC<{ x: number; y: number; label: string; val: string }> = ({
  x,
  y,
  label,
  val,
}) => (
  <g>
    <line x1={x} y1={y} x2={x + 12} y2={y} stroke="#1E293B" strokeWidth="1.6" />
    <line x1={x + 12} y1={y - 9} x2={x + 12} y2={y + 9} stroke="#1E293B" strokeWidth="2" />
    <line x1={x + 18} y1={y - 9} x2={x + 18} y2={y + 9} stroke="#1E293B" strokeWidth="2" />
    <line x1={x + 18} y1={y} x2={x + 30} y2={y} stroke="#1E293B" strokeWidth="1.6" />
    <text x={x + 15} y={y - 12} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#0F172A">
      {label}
    </text>
    <text
      x={x + 15}
      y={y + 19}
      textAnchor="middle"
      fontSize="8.5"
      fontFamily="monospace"
      fill="#0284C7"
    >
      {val}
    </text>
  </g>
);

const CapacitorV: React.FC<{ x: number; y: number; label: string; val: string; left?: boolean }> = ({
  x,
  y,
  label,
  val,
  left,
}) => (
  <g>
    <line x1={x} y1={y} x2={x} y2={y + 15} stroke="#1E293B" strokeWidth="1.6" />
    <line x1={x - 9} y1={y + 15} x2={x + 9} y2={y + 15} stroke="#1E293B" strokeWidth="2" />
    <line x1={x - 9} y1={y + 21} x2={x + 9} y2={y + 21} stroke="#1E293B" strokeWidth="2" />
    <line x1={x} y1={y + 21} x2={x} y2={y + 38} stroke="#1E293B" strokeWidth="1.6" />
    <text
      x={left ? x - 12 : x + 12}
      y={y + 17}
      textAnchor={left ? 'end' : 'start'}
      fontSize="9.5"
      fontWeight="700"
      fill="#0F172A"
    >
      {label}
    </text>
    <text
      x={left ? x - 12 : x + 12}
      y={y + 28}
      textAnchor={left ? 'end' : 'start'}
      fontSize="8.5"
      fontFamily="monospace"
      fill="#0284C7"
    >
      {val}
    </text>
  </g>
);

const InductorH: React.FC<{ x: number; y: number; label: string; val: string }> = ({
  x,
  y,
  label,
  val,
}) => (
  <g>
    <path
      d={`M ${x} ${y} l 4 0 a 5 5 0 0 1 10 0 a 5 5 0 0 1 10 0 a 5 5 0 0 1 10 0 l 4 0`}
      fill="none"
      stroke="#1E293B"
      strokeWidth="1.6"
    />
    <text x={x + 19} y={y - 10} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#0F172A">
      {label}
    </text>
    <text
      x={x + 19}
      y={y + 15}
      textAnchor="middle"
      fontSize="8.5"
      fontFamily="monospace"
      fill="#7C3AED"
    >
      {val}
    </text>
  </g>
);

const InductorV: React.FC<{ x: number; y: number; label: string; val: string; left?: boolean }> = ({
  x,
  y,
  label,
  val,
  left,
}) => (
  <g>
    <path
      d={`M ${x} ${y} l 0 4 a 5 5 0 0 1 0 10 a 5 5 0 0 1 0 10 a 5 5 0 0 1 0 10 l 0 4`}
      fill="none"
      stroke="#1E293B"
      strokeWidth="1.6"
    />
    <text
      x={left ? x - 10 : x + 10}
      y={y + 17}
      textAnchor={left ? 'end' : 'start'}
      fontSize="9.5"
      fontWeight="700"
      fill="#0F172A"
    >
      {label}
    </text>
    <text
      x={left ? x - 10 : x + 10}
      y={y + 28}
      textAnchor={left ? 'end' : 'start'}
      fontSize="8.5"
      fontFamily="monospace"
      fill="#7C3AED"
    >
      {val}
    </text>
  </g>
);

const VaractorV: React.FC<{ x: number; y: number; label: string; val: string }> = ({
  x,
  y,
  label,
  val,
}) => (
  <g>
    <line x1={x} y1={y} x2={x} y2={y + 10} stroke="#15803D" strokeWidth="1.6" />
    {/* Diode triangle pointing up (reverse biased) */}
    <polygon
      points={`${x - 7},${y + 22} ${x + 7},${y + 22} ${x},${y + 11}`}
      fill="#DCFCE7"
      stroke="#15803D"
      strokeWidth="1.6"
    />
    {/* Dual capacitor plates for varactor */}
    <line x1={x - 8} y1={y + 11} x2={x + 8} y2={y + 11} stroke="#15803D" strokeWidth="2" />
    <line x1={x - 8} y1={y + 7} x2={x + 8} y2={y + 7} stroke="#15803D" strokeWidth="1.8" />
    <line x1={x} y1={y + 22} x2={x} y2={y + 38} stroke="#15803D" strokeWidth="1.6" />
    <text x={x - 11} y={y + 17} textAnchor="end" fontSize="9.5" fontWeight="700" fill="#15803D">
      {label}
    </text>
    <text
      x={x - 11}
      y={y + 28}
      textAnchor="end"
      fontSize="8.5"
      fontFamily="monospace"
      fill="#15803D"
    >
      {val}
    </text>
  </g>
);

const DiodeH: React.FC<{ x: number; y: number; label: string }> = ({ x, y, label }) => (
  <g>
    <line x1={x} y1={y} x2={x + 10} y2={y} stroke="#EA580C" strokeWidth="1.6" />
    <polygon
      points={`${x + 10},${y - 7} ${x + 10},${y + 7} ${x + 22},${y}`}
      fill="#FFEDD5"
      stroke="#EA580C"
      strokeWidth="1.6"
    />
    <line x1={x + 22} y1={y - 7} x2={x + 22} y2={y + 7} stroke="#EA580C" strokeWidth="2" />
    <line x1={x + 22} y1={y} x2={x + 32} y2={y} stroke="#EA580C" strokeWidth="1.6" />
    <text x={x + 16} y={y - 11} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#C2410C">
      {label}
    </text>
  </g>
);

const OpAmpSym: React.FC<{ x: number; y: number; label?: string; invertTop?: boolean }> = ({
  x,
  y,
  label,
  invertTop = false,
}) => (
  <g>
    <polygon
      points={`${x},${y - 24} ${x},${y + 24} ${x + 42},${y}`}
      fill="#FFFFFF"
      stroke="#1E293B"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <text x={x + 6} y={y - 8} fontSize="11" fontWeight="700" fill="#1E293B">
      {invertTop ? '−' : '+'}
    </text>
    <text x={x + 6} y={y + 15} fontSize="11" fontWeight="700" fill="#1E293B">
      {invertTop ? '+' : '−'}
    </text>
    {label && (
      <text x={x + 16} y={y + 3} fontSize="8" fontFamily="monospace" fontWeight="700" fill="#475569">
        {label}
      </text>
    )}
  </g>
);

const MixerSym: React.FC<{ x: number; y: number; label?: string }> = ({ x, y, label }) => (
  <g>
    <circle cx={x} cy={y} r="13" fill="#FFFFFF" stroke="#1E293B" strokeWidth="1.7" />
    <line x1={x - 7} y1={y - 7} x2={x + 7} y2={y + 7} stroke="#1E293B" strokeWidth="1.6" />
    <line x1={x - 7} y1={y + 7} x2={x + 7} y2={y - 7} stroke="#1E293B" strokeWidth="1.6" />
    {label && (
      <text x={x} y={y - 17} textAnchor="middle" fontSize="9" fontWeight="700" fill="#0F172A">
        {label}
      </text>
    )}
  </g>
);

const ACSource: React.FC<{ x: number; y: number; label: string; sub: string; color: string }> = ({
  x,
  y,
  label,
  sub,
  color,
}) => (
  <g>
    <circle cx={x} cy={y} r="16" fill="#FFFFFF" stroke={color} strokeWidth="1.8" />
    <path
      d={`M ${x - 8} ${y} q 4 -7 8 0 t 8 0`}
      fill="none"
      stroke={color}
      strokeWidth="1.6"
    />
    <text x={x} y={y - 21} textAnchor="middle" fontSize="10" fontWeight="700" fill={color}>
      {label}
    </text>
    <text x={x} y={y + 27} textAnchor="middle" fontSize="8.5" fontFamily="monospace" fill="#64748B">
      {sub}
    </text>
  </g>
);

export const AngleModCircuitPanel: React.FC<AngleModCircuitProps> = ({
  mode,
  fc,
  fm,
  deltaFHz,
  kpRadPerV,
  fmDemodMode,
  pmDemodMode,
  isSimulating,
  simulationSpeed,
}) => {
  const [viewFilter, setViewFilter] = useState<'both' | 'mod' | 'demod'>('both');

  // Auto-calculated physical component values from live specifications
  const fcKhz = (fc / 1000).toFixed(1);
  const fmKhz = (fm / 1000).toFixed(2);
  const flowDur = `${(1.1 / Math.max(0.2, simulationSpeed)).toFixed(2)}s`;
  const flowClass = `circuit-flow ${isSimulating ? '' : 'circuit-flow-paused'}`;

  // Resonant LC tank: f_c = 1 / (2π √(L C)) -> scale L and C inversely with fc
  const lTankUh = (22 * (10000 / Math.max(1000, fc))).toFixed(1);
  const cTankPf = Math.round(220 * (10000 / Math.max(1000, fc)));
  const cSlopePf = Math.round(cTankPf * 0.92); // tuned slightly above fc for slope detection
  const cVarPf = Math.max(8, Math.round(32 * (deltaFHz / 2500)));
  const cVarPmPf = Math.max(10, Math.round(28 * (kpRadPerV / 2.0)));
  const lRfcMh = (1.0 * (10000 / Math.max(1000, fc))).toFixed(1);
  const cEnvUf = (0.35 * (1000 / Math.max(200, fm))).toFixed(2);
  const cLpfNf = Math.round(100 * (1000 / Math.max(200, fm)));
  const rIntK = (10 * (1000 / Math.max(200, fm))).toFixed(1);
  const cIntNf = Math.max(4, Math.round(16 * (2.0 / Math.max(0.3, kpRadPerV))));
  const rLoopK = (2.2 * (2500 / Math.max(200, deltaFHz))).toFixed(1);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      {/* Header & View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
            {mode === 'fm' ? 'FM ELECTRONIC SCHEMATIC' : 'PM ELECTRONIC SCHEMATIC'} · AUTO-TUNED TO SPECS
          </div>
          <div className="text-sm font-bold text-[#111827]">
            {mode === 'fm'
              ? `Varactor LC VCO & ${fmDemodMode === 'pll' ? 'Active PLL Discriminator' : 'Tuned Slope Envelope Detector'}`
              : `Varactor Phase-Shift Tank & ${pmDemodMode === 'coherent-pd' ? 'Coherent I/Q Phase Detector' : 'Slope Discriminator + Op-Amp Integrator'}`}
          </div>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-mono">
          {(['both', 'mod', 'demod'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setViewFilter(v)}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                viewFilter === v
                  ? 'bg-white text-[#1E4620] font-semibold shadow-xs'
                  : 'text-slate-500 hover:text-[#111827]'
              }`}
            >
              {v === 'both' ? 'TX + RX' : v === 'mod' ? 'Modulator' : 'Demodulator'}
            </button>
          ))}
        </div>
      </div>

      {/* Circuit Grid */}
      <div
        className={`grid gap-4 ${
          viewFilter === 'both' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {/* MODULATOR SCHEMATIC */}
        {(viewFilter === 'both' || viewFilter === 'mod') && (
          <div className="border border-slate-200 rounded-lg p-3 bg-[#FCFCFA] space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-mono font-semibold text-[#1E4620]">
                TX · {mode === 'fm' ? 'VARACTOR-DIODE LC VCO' : 'VARACTOR PHASE-SHIFT MODULATOR'}
              </span>
              <span className="font-mono text-slate-500">
                {mode === 'fm'
                  ? `Δf = ${(deltaFHz / 1000).toFixed(2)} kHz`
                  : `kp = ${kpRadPerV.toFixed(1)} rad/V`}
              </span>
            </div>

            {mode === 'fm' ? (
              <svg viewBox="0 0 540 205" className="w-full h-auto">
                {/* Baseband input m(t) */}
                <ACSource x={36} y={96} label="m(t)" sub={`${fmKhz}kHz`} color="#0284C7" />
                <GroundSym x={36} y={136} />
                <line x1="36" y1="112" x2="36" y2="136" stroke="#334155" strokeWidth="1.5" />

                {/* Wire m(t) -> Rb -> L_RFC */}
                <line
                  x1="52"
                  y1="96"
                  x2="76"
                  y2="96"
                  stroke="#0284C7"
                  strokeWidth="2"
                  strokeDasharray="6 6"
                  className={flowClass}
                  style={{ '--flow-dur': flowDur } as React.CSSProperties}
                />
                <ResistorH x={76} y={96} label="Rb" val="10kΩ" />
                <line x1="118" y1="96" x2="138" y2="96" stroke="#1E293B" strokeWidth="1.6" />
                <InductorH x={138} y={96} label="RFC" val={`${lRfcMh}mH`} />
                <line x1="176" y1="96" x2="210" y2="96" stroke="#1E293B" strokeWidth="1.6" />

                {/* Tank Node */}
                <circle cx="210" cy="96" r="3" fill="#15803D" />
                <VaractorV x={210} y={96} label="Dv" val={`${cVarPf}pF`} />
                <GroundSym x={210} y={136} />

                {/* Parallel Tank L_t and C_0 */}
                <line x1="210" y1="96" x2="270" y2="96" stroke="#15803D" strokeWidth="1.8" />
                <circle cx="270" cy="96" r="3" fill="#15803D" />
                <InductorV x={270} y={96} label="Lt" val={`${lTankUh}μH`} />
                <GroundSym x={270} y={136} />

                <line x1="270" y1="96" x2="335" y2="96" stroke="#15803D" strokeWidth="1.8" />
                <circle cx="335" cy="96" r="3" fill="#15803D" />
                <CapacitorV x={335} y={96} label="C0" val={`${cTankPf}pF`} />
                <GroundSym x={335} y={136} />

                {/* Coupling Cap -> Buffer Op-Amp -> Output */}
                <line x1="335" y1="96" x2="366" y2="96" stroke="#15803D" strokeWidth="1.8" />
                <CapacitorH x={366} y={96} label="Cc" val="10nF" />
                <line x1="396" y1="96" x2="416" y2="96" stroke="#15803D" strokeWidth="1.8" />

                <OpAmpSym x={416} y={104} label="BUF" />
                {/* Unity-gain buffer feedback */}
                <path
                  d="M 458 104 L 474 104 L 474 146 L 404 146 L 404 114 L 416 114"
                  fill="none"
                  stroke="#334155"
                  strokeWidth="1.3"
                />

                {/* Output wire */}
                <line
                  x1="474"
                  y1="104"
                  x2="514"
                  y2="104"
                  stroke="#15803D"
                  strokeWidth="2.2"
                  strokeDasharray="6 6"
                  className={flowClass}
                  style={{ '--flow-dur': flowDur } as React.CSSProperties}
                />
                <circle cx="516" cy="104" r="4" fill="#15803D" />
                <text x="514" y="88" textAnchor="end" fontSize="10.5" fontWeight="700" fill="#15803D">
                  s_FM(t)
                </text>
                <text x="514" y="124" textAnchor="end" fontSize="8.5" fontFamily="monospace" fill="#475569">
                  {fcKhz}kHz
                </text>
              </svg>
            ) : (
              <svg viewBox="0 0 540 205" className="w-full h-auto">
                {/* Carrier input c(t) */}
                <ACSource x={36} y={76} label="c(t)" sub={`${fcKhz}kHz`} color="#7C3AED" />
                <GroundSym x={36} y={116} />
                <line x1="36" y1="92" x2="36" y2="116" stroke="#334155" strokeWidth="1.5" />

                {/* Series R_s into Phase-Shift Tank */}
                <line
                  x1="52"
                  y1="76"
                  x2="86"
                  y2="76"
                  stroke="#7C3AED"
                  strokeWidth="2"
                  strokeDasharray="6 6"
                  className={flowClass}
                  style={{ '--flow-dur': flowDur } as React.CSSProperties}
                />
                <ResistorH x={86} y={76} label="Rs" val="1.0kΩ" />
                <line x1="128" y1="76" x2="190" y2="76" stroke="#7C3AED" strokeWidth="1.8" />

                {/* Shunt Varactor + L_p + C_p Tank */}
                <circle cx="190" cy="76" r="3" fill="#7C3AED" />
                <InductorV x={190} y={76} label="Lp" val={`${lTankUh}μH`} left />
                <GroundSym x={190} y={116} />

                <line x1="190" y1="76" x2="255" y2="76" stroke="#7C3AED" strokeWidth="1.8" />
                <circle cx="255" cy="76" r="3" fill="#7C3AED" />
                <CapacitorV x={255} y={76} label="Cp" val={`${cTankPf}pF`} />
                <GroundSym x={255} y={116} />

                <line x1="255" y1="76" x2="320" y2="76" stroke="#7C3AED" strokeWidth="1.8" />
                <circle cx="320" cy="76" r="3" fill="#15803D" />
                <VaractorV x={320} y={76} label="Dv" val={`${cVarPmPf}pF`} />
                <GroundSym x={320} y={116} />

                {/* Message input m(t) modulating Varactor via R_m */}
                <ACSource x={190} y={168} label="m(t)" sub={`${fmKhz}kHz`} color="#0284C7" />
                <line
                  x1="206"
                  y1="168"
                  x2="250"
                  y2="168"
                  stroke="#0284C7"
                  strokeWidth="1.8"
                  strokeDasharray="5 5"
                  className={flowClass}
                  style={{ '--flow-dur': flowDur } as React.CSSProperties}
                />
                <ResistorH x={250} y={168} label="Rm" val="10kΩ" />
                <path d="M 292 168 L 348 168 L 348 76 L 320 76" fill="none" stroke="#0284C7" strokeWidth="1.5" />

                {/* Coupling Cap -> Buffer -> s_PM(t) */}
                <line x1="348" y1="76" x2="372" y2="76" stroke="#7C3AED" strokeWidth="1.8" />
                <CapacitorH x={372} y={76} label="Cc" val="10nF" />
                <line x1="402" y1="76" x2="420" y2="76" stroke="#7C3AED" strokeWidth="1.8" />
                <OpAmpSym x={420} y={84} label="BUF" />
                <path
                  d="M 462 84 L 476 84 L 476 124 L 408 124 L 408 94 L 420 94"
                  fill="none"
                  stroke="#334155"
                  strokeWidth="1.3"
                />
                <line
                  x1="476"
                  y1="84"
                  x2="516"
                  y2="84"
                  stroke="#7C3AED"
                  strokeWidth="2.2"
                  strokeDasharray="6 6"
                  className={flowClass}
                  style={{ '--flow-dur': flowDur } as React.CSSProperties}
                />
                <circle cx="518" cy="84" r="4" fill="#7C3AED" />
                <text x="516" y="68" textAnchor="end" fontSize="10.5" fontWeight="700" fill="#7C3AED">
                  s_PM(t)
                </text>
              </svg>
            )}

            <div className="text-[11px] text-slate-600 bg-white border border-slate-100 rounded-md px-2.5 py-1.5">
              {mode === 'fm' ? (
                <Latex
                  math={String.raw`f_i(t) = \frac{1}{2\pi\sqrt{L_t(C_0 + C_v(m))}} \approx f_c + k_f m(t)`}
                />
              ) : (
                <Latex
                  math={String.raw`\Delta\theta(t) = -\tan^{-1}\!\left(R_s\,\Delta B_v(m)\right) \approx k_p m(t)`}
                />
              )}
            </div>
          </div>
        )}

        {/* DEMODULATOR SCHEMATIC */}
        {(viewFilter === 'both' || viewFilter === 'demod') && (
          <div className="border border-slate-200 rounded-lg p-3 bg-[#FCFCFA] space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-mono font-semibold text-[#EA580C]">
                RX ·{' '}
                {mode === 'fm'
                  ? fmDemodMode === 'pll'
                    ? 'ACTIVE PLL FM DISCRIMINATOR'
                    : 'SLOPE TANK + DIODE-RC ENVELOPE'
                  : pmDemodMode === 'coherent-pd'
                  ? 'COHERENT I/Q PHASE DETECTOR'
                  : 'SLOPE DISCRIMINATOR + OP-AMP INTEGRATOR'}
              </span>
              <span className="font-mono text-slate-500">LPF → {fmKhz} kHz</span>
            </div>

            {mode === 'fm' && fmDemodMode === 'slope' && (
              <svg viewBox="0 0 540 205" className="w-full h-auto">
                {/* Input s_FM(t) */}
                <circle cx="24" cy="86" r="4" fill="#15803D" />
                <text x="14" y="70" fontSize="10" fontWeight="700" fill="#15803D">
                  s_FM(t)
                </text>
                <line
                  x1="28"
                  y1="86"
                  x2="60"
                  y2="86"
                  stroke="#15803D"
                  strokeWidth="2"
                  strokeDasharray="6 6"
                  className={flowClass}
                  style={{ '--flow-dur': flowDur } as React.CSSProperties}
                />

                {/* Coupling Cap -> Detuned Slope Tank (Ld || Cd) */}
                <CapacitorH x={60} y={86} label="Cs" val="10nF" />
                <line x1="90" y1="86" x2="132" y2="86" stroke="#1E293B" strokeWidth="1.6" />
                <circle cx="132" cy="86" r="3" fill="#1E293B" />
                <InductorV x={132} y={86} label="Ld" val={`${lTankUh}μH`} left />
                <GroundSym x={132} y={126} />

                <line x1="132" y1="86" x2="195" y2="86" stroke="#1E293B" strokeWidth="1.6" />
                <circle cx="195" cy="86" r="3" fill="#1E293B" />
                <CapacitorV x={195} y={86} label="Cd" val={`${cSlopePf}pF`} />
                <GroundSym x={195} y={126} />

                {/* Rectifier Diode D1 */}
                <line x1="195" y1="86" x2="242" y2="86" stroke="#EA580C" strokeWidth="1.8" />
                <DiodeH x={242} y={86} label="D1" />
                <line x1="274" y1="86" x2="316" y2="86" stroke="#EA580C" strokeWidth="1.8" />

                {/* Envelope RC (C_env || R_L) */}
                <circle cx="316" cy="86" r="3" fill="#EA580C" />
                <CapacitorV x={316} y={86} label="Cenv" val={`${cEnvUf}μF`} left />
                <GroundSym x={316} y={126} />

                <line x1="316" y1="86" x2="380" y2="86" stroke="#EA580C" strokeWidth="1.8" />
                <circle cx="380" cy="86" r="3" fill="#EA580C" />
                <ResistorV x={380} y={86} label="RL" val="1.0kΩ" />
                <GroundSym x={380} y={126} />

                {/* DC Blocking Cap -> Output */}
                <line x1="380" y1="86" x2="424" y2="86" stroke="#EA580C" strokeWidth="1.8" />
                <CapacitorH x={424} y={86} label="Cblk" val="10μF" />
                <line
                  x1="454"
                  y1="86"
                  x2="510"
                  y2="86"
                  stroke="#EA580C"
                  strokeWidth="2.2"
                  strokeDasharray="6 6"
                  className={flowClass}
                  style={{ '--flow-dur': flowDur } as React.CSSProperties}
                />
                <circle cx="514" cy="86" r="4" fill="#EA580C" />
                <text x="516" y="70" textAnchor="end" fontSize="10.5" fontWeight="700" fill="#C2410C">
                  y_o(t)
                </text>
              </svg>
            )}

            {mode === 'fm' && fmDemodMode === 'pll' && (
              <svg viewBox="0 0 540 205" className="w-full h-auto">
                {/* Input s_FM(t) -> Mixer (Phase Detector) */}
                <circle cx="24" cy="82" r="4" fill="#15803D" />
                <text x="14" y="66" fontSize="10" fontWeight="700" fill="#15803D">
                  s_FM(t)
                </text>
                <line
                  x1="28"
                  y1="82"
                  x2="86"
                  y2="82"
                  stroke="#15803D"
                  strokeWidth="2"
                  strokeDasharray="6 6"
                  className={flowClass}
                  style={{ '--flow-dur': flowDur } as React.CSSProperties}
                />
                <MixerSym x={100} y={82} label="PD" />

                {/* Active Loop LPF (R1 + Op-Amp with R2 + C_loop) */}
                <line x1="113" y1="82" x2="146" y2="82" stroke="#1E293B" strokeWidth="1.6" />
                <ResistorH x={146} y={82} label="R1" val={`${rLoopK}kΩ`} />
                <line x1="188" y1="82" x2="230" y2="82" stroke="#1E293B" strokeWidth="1.6" />

                {/* Feedback RC around Op-Amp */}
                <circle cx="212" cy="82" r="3" fill="#1E293B" />
                <path d="M 212 82 L 212 36 L 236 36" fill="none" stroke="#1E293B" strokeWidth="1.4" />
                <CapacitorH x={236} y={36} label="Cloop" val={`${cLpfNf}nF`} />
                <path d="M 266 36 L 296 36 L 296 90" fill="none" stroke="#1E293B" strokeWidth="1.4" />

                <OpAmpSym x={230} y={90} label="LPF" invertTop />
                <line x1="218" y1="100" x2="230" y2="100" stroke="#334155" strokeWidth="1.4" />
                <GroundSym x={218} y={100} />

                {/* Output y_o(t) */}
                <line
                  x1="272"
                  y1="90"
                  x2="510"
                  y2="90"
                  stroke="#EA580C"
                  strokeWidth="2.2"
                  strokeDasharray="6 6"
                  className={flowClass}
                  style={{ '--flow-dur': flowDur } as React.CSSProperties}
                />
                <circle cx="514" cy="90" r="4" fill="#EA580C" />
                <text x="516" y="74" textAnchor="end" fontSize="10.5" fontWeight="700" fill="#C2410C">
                  y_o(t)
                </text>

                {/* VCO Feedback Loop with LC Tank */}
                <circle cx="370" cy="90" r="3" fill="#7C3AED" />
                <path d="M 370 90 L 370 156 L 312 156" fill="none" stroke="#7C3AED" strokeWidth="1.6" />
                <rect x="206" y="138" width="106" height="36" rx="6" fill="#F5F3FF" stroke="#7C3AED" strokeWidth="1.6" />
                <text x="259" y="154" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#6D28D9">
                  VCO TANK
                </text>
                <text x="259" y="167" textAnchor="middle" fontSize="8.5" fontFamily="monospace" fill="#475569">
                  {lTankUh}μH · {cTankPf}pF
                </text>
                <path
                  d="M 206 156 L 100 156 L 100 96"
                  fill="none"
                  stroke="#7C3AED"
                  strokeWidth="1.6"
                  strokeDasharray="5 5"
                  className={flowClass}
                  style={{ '--flow-dur': flowDur } as React.CSSProperties}
                />
              </svg>
            )}

            {mode === 'pm' && pmDemodMode === 'coherent-pd' && (
              <svg viewBox="0 0 540 205" className="w-full h-auto">
                {/* Input s_PM(t) splits to I and Q Mixers */}
                <circle cx="24" cy="100" r="4" fill="#7C3AED" />
                <text x="14" y="84" fontSize="10" fontWeight="700" fill="#7C3AED">
                  s_PM(t)
                </text>
                <line x1="28" y1="100" x2="68" y2="100" stroke="#7C3AED" strokeWidth="2" />
                <circle cx="68" cy="100" r="3" fill="#7C3AED" />
                <path d="M 68 100 L 68 54 L 105 54" fill="none" stroke="#7C3AED" strokeWidth="1.8" />
                <path d="M 68 100 L 68 146 L 105 146" fill="none" stroke="#7C3AED" strokeWidth="1.8" />

                {/* I-branch Mixer + RC LPF */}
                <MixerSym x={118} y={54} label="I" />
                <text x="118" y="82" textAnchor="middle" fontSize="8.5" fontFamily="monospace" fill="#6D28D9">
                  cos(ωc t)
                </text>
                <line x1="131" y1="54" x2="162" y2="54" stroke="#1E293B" strokeWidth="1.6" />
                <ResistorH x={162} y={54} label="Ri" val="1.5kΩ" />
                <line x1="204" y1="54" x2="250" y2="54" stroke="#1E293B" strokeWidth="1.6" />
                <circle cx="250" cy="54" r="3" fill="#1E293B" />
                <CapacitorV x={250} y={54} label="Ci" val={`${cLpfNf}nF`} />

                {/* Q-branch Mixer + RC LPF */}
                <MixerSym x={118} y={146} label="Q" />
                <text x="118" y="174" textAnchor="middle" fontSize="8.5" fontFamily="monospace" fill="#6D28D9">
                  sin(ωc t)
                </text>
                <line x1="131" y1="146" x2="162" y2="146" stroke="#1E293B" strokeWidth="1.6" />
                <ResistorH x={162} y={146} label="Rq" val="1.5kΩ" />
                <line x1="204" y1="146" x2="250" y2="146" stroke="#1E293B" strokeWidth="1.6" />
                <circle cx="250" cy="146" r="3" fill="#1E293B" />
                <CapacitorV x={250} y={146} label="Cq" val={`${cLpfNf}nF`} />

                {/* Phase Extractor Op-Amp / atan2(Q,I) */}
                <path d="M 250 54 L 320 54 L 320 88 L 348 88" fill="none" stroke="#1E293B" strokeWidth="1.6" />
                <path d="M 250 146 L 320 146 L 320 112 L 348 112" fill="none" stroke="#1E293B" strokeWidth="1.6" />
                <OpAmpSym x={348} y={100} label="PD" />
                <text x="368" y="138" textAnchor="middle" fontSize="8.5" fontFamily="monospace" fill="#EA580C">
                  atan2(Q,I)/kp
                </text>

                {/* Output y_o(t) */}
                <line
                  x1="390"
                  y1="100"
                  x2="510"
                  y2="100"
                  stroke="#EA580C"
                  strokeWidth="2.2"
                  strokeDasharray="6 6"
                  className={flowClass}
                  style={{ '--flow-dur': flowDur } as React.CSSProperties}
                />
                <circle cx="514" cy="100" r="4" fill="#EA580C" />
                <text x="516" y="84" textAnchor="end" fontSize="10.5" fontWeight="700" fill="#C2410C">
                  y_o(t)
                </text>
              </svg>
            )}

            {mode === 'pm' && pmDemodMode === 'fm-integrator' && (
              <svg viewBox="0 0 540 205" className="w-full h-auto">
                {/* Input s_PM(t) -> Slope Tank -> Diode -> Op-Amp Integrator */}
                <circle cx="24" cy="96" r="4" fill="#7C3AED" />
                <text x="14" y="80" fontSize="10" fontWeight="700" fill="#7C3AED">
                  s_PM(t)
                </text>
                <line
                  x1="28"
                  y1="96"
                  x2="78"
                  y2="96"
                  stroke="#7C3AED"
                  strokeWidth="2"
                  strokeDasharray="6 6"
                  className={flowClass}
                  style={{ '--flow-dur': flowDur } as React.CSSProperties}
                />

                {/* Slope Tank */}
                <circle cx="78" cy="96" r="3" fill="#1E293B" />
                <InductorV x={78} y={96} label="Ld" val={`${lTankUh}μH`} left />
                <GroundSym x={78} y={136} />
                <line x1="78" y1="96" x2="132" y2="96" stroke="#1E293B" strokeWidth="1.6" />
                <circle cx="132" cy="96" r="3" fill="#1E293B" />
                <CapacitorV x={132} y={96} label="Cd" val={`${cSlopePf}pF`} />
                <GroundSym x={132} y={136} />

                {/* Diode + Env Cap */}
                <line x1="132" y1="96" x2="176" y2="96" stroke="#EA580C" strokeWidth="1.8" />
                <DiodeH x={176} y={96} label="D1" />
                <line x1="208" y1="96" x2="238" y2="96" stroke="#EA580C" strokeWidth="1.8" />
                <circle cx="238" cy="96" r="3" fill="#EA580C" />
                <CapacitorV x={238} y={96} label="Ce" val={`${cEnvUf}μF`} />
                <GroundSym x={238} y={136} />

                {/* Inverting Op-Amp Integrator (R_int + C_int) */}
                <line x1="238" y1="96" x2="278" y2="96" stroke="#1E293B" strokeWidth="1.6" />
                <ResistorH x={278} y={96} label="Rint" val={`${rIntK}kΩ`} />
                <line x1="320" y1="96" x2="366" y2="96" stroke="#1E293B" strokeWidth="1.6" />

                {/* Feedback Capacitor C_int */}
                <circle cx="348" cy="96" r="3" fill="#1E293B" />
                <path d="M 348 96 L 348 44 L 372 44" fill="none" stroke="#0284C7" strokeWidth="1.6" />
                <CapacitorH x={372} y={44} label="Cint" val={`${cIntNf}nF`} />
                <path d="M 402 44 L 434 44 L 434 104" fill="none" stroke="#0284C7" strokeWidth="1.6" />

                <OpAmpSym x={366} y={104} label="∫dt" invertTop />
                <line x1="354" y1="114" x2="366" y2="114" stroke="#334155" strokeWidth="1.4" />
                <GroundSym x={354} y={114} />

                {/* Output y_o(t) */}
                <line
                  x1="408"
                  y1="104"
                  x2="510"
                  y2="104"
                  stroke="#EA580C"
                  strokeWidth="2.2"
                  strokeDasharray="6 6"
                  className={flowClass}
                  style={{ '--flow-dur': flowDur } as React.CSSProperties}
                />
                <circle cx="514" cy="104" r="4" fill="#EA580C" />
                <text x="516" y="88" textAnchor="end" fontSize="10.5" fontWeight="700" fill="#C2410C">
                  y_o(t)
                </text>
              </svg>
            )}

            <div className="text-[11px] text-slate-600 bg-white border border-slate-100 rounded-md px-2.5 py-1.5">
              {mode === 'fm' ? (
                <Latex math={String.raw`y_o(t) \propto \frac{1}{2\pi}\frac{d\theta(t)}{dt} - f_c = k_f m(t)`} />
              ) : (
                <Latex math={String.raw`y_o(t) = -\frac{1}{R_{\text{int}}C_{\text{int}}}\int v_{\text{disc}}(t)\,dt \propto m(t)`} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
