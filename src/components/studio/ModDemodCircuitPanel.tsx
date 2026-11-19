import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Maximize2, Minimize2, RotateCcw, SlidersHorizontal, X, ZoomIn, ZoomOut } from 'lucide-react';
import { StudioBenchTopic } from '../../views/studio/OverviewStudioView';
import {
  CircuitComponentValues,
  computeSallenKeyCutoffHz,
  DEFAULT_CIRCUIT_VALUES,
  FDMChannelConfig,
  MessageShape,
  SCOPE_SAMPLES,
  SIM_FS,
} from '../../services/chapter2Dsp';
import { LatexText } from './Latex';
import { DarkOscilloscopeCanvas, DarkTrace } from './DarkOscilloscopeCanvas';

export interface CircuitLiveData {
  topic: StudioBenchTopic | 'motivation';
  subTab: 'instrument' | 'receiver' | 'equations';
  isSimulating: boolean;
  simulationSpeed: number;
  animTime: number;

  // Common parameters
  fc: number;
  fm: number;
  Ac: number;
  Am: number;
  mu: number;
  messageShape: MessageShape;

  // Live graph arrays (exact data plotted on the oscilloscope)
  mArr: number[];
  cArr: number[];
  sArr: number[];
  yArr: number[];
  longT?: number[];
  longMArr?: number[];
  longSArr?: number[];
  longYArr?: number[];
  mHatArr?: number[];
  rectArr?: number[];
  rcArr?: number[];

  // Topic 01: Motivation & FDM
  fdmChannels: FDMChannelConfig[];
  tunedChannelId: number;
  fdmOverlaps: string[];
  antennaQuarterWaveM?: number;
  antennaFcMHz: number;

  // Topic 02: DSB-FC
  amModulatorMode: 'linear' | 'square-law';
  rcTimeMs: number;
  isOvermodulated: boolean;

  // Topic 03: DSB-SC
  dsbTopology: 'product' | 'ring';
  ringFiltered: boolean;
  dsbRxMode: 'coherent' | 'costas';
  loPhaseErrorDeg: number;
  loFreqOffsetHz: number;
  costasInitDeg: number;
  costasFinalPhaseDeg?: number;

  // Topic 04: SSB-SC
  ssbSideband: 'USB' | 'LSB';
  ssbMethod: 'phase' | 'frequency';
  ssbFilterOrder: number;
  ssbEnergyGapHz: number;
  ssbPhaseErrDeg: number;

  // Topic 05: VSB
  vsbW: number;
  vsbVestigeRatio: number;
  vsbSkew: number;
}

type CircuitViewFilter = 'both' | 'mod' | 'demod';
type ComponentKey = keyof CircuitComponentValues;

interface ComponentSpec {
  designator: string;
  name: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  role: string;
}

const COMPONENT_SPECS: Record<ComponentKey, ComponentSpec> = {
  // FDM
  fdmR1K: { designator: 'R₁', name: 'Ch 1 Input Resistor', unit: 'kΩ', min: 2, max: 30, step: 0.5, decimals: 1, role: 'Scales Ch 1 summing gain (−Rf / R₁)' },
  fdmR2K: { designator: 'R₂', name: 'Ch 2 Input Resistor', unit: 'kΩ', min: 2, max: 30, step: 0.5, decimals: 1, role: 'Scales Ch 2 summing gain (−Rf / R₂)' },
  fdmR3K: { designator: 'R₃', name: 'Ch 3 Input Resistor', unit: 'kΩ', min: 2, max: 30, step: 0.5, decimals: 1, role: 'Scales Ch 3 summing gain (−Rf / R₃)' },
  fdmRfK: { designator: 'Rf', name: 'Summing Feedback Resistor', unit: 'kΩ', min: 2, max: 25, step: 0.5, decimals: 1, role: 'Master composite FDM output gain' },
  fdmC1nF: { designator: 'C₁', name: 'Ch 1 Coupling Cap', unit: 'nF', min: 5, max: 250, step: 5, decimals: 0, role: 'Baseband HPF corner for Ch 1' },
  fdmC2nF: { designator: 'C₂', name: 'Ch 2 Coupling Cap', unit: 'nF', min: 5, max: 250, step: 5, decimals: 0, role: 'Baseband HPF corner for Ch 2' },
  fdmC3nF: { designator: 'C₃', name: 'Ch 3 Coupling Cap', unit: 'nF', min: 5, max: 250, step: 5, decimals: 0, role: 'Baseband HPF corner for Ch 3' },
  fdmCoutUf: { designator: 'Cout', name: 'Tx Output Coupling Cap', unit: 'μF', min: 0.005, max: 1.0, step: 0.005, decimals: 3, role: 'Blocks DC before λ/4 antenna' },
  fdmLrxUh: { designator: 'Lrx', name: 'Rx Tank Inductor', unit: 'μH', min: 40, max: 220, step: 5, decimals: 0, role: 'Shifts RLC tank resonance relative to f_k' },
  fdmCvarScale: { designator: 'Cvar', name: 'Varactor Tuning Ratio', unit: '×C₀', min: 0.5, max: 1.8, step: 0.02, decimals: 2, role: 'Detunes receiver passband away from channel' },

  // DSB-FC (AM)
  amTxRsOhm: { designator: 'Rs', name: 'Source Resistance', unit: 'Ω', min: 10, max: 600, step: 10, decimals: 0, role: 'Attenuates drive into square-law diode' },
  amTxVbbV: { designator: 'VBB', name: 'Diode DC Bias', unit: 'V', min: 0.35, max: 1.4, step: 0.05, decimals: 2, role: 'Shifts operating point & effective μ' },
  amTxR1K: { designator: 'R₁', name: 'Bias Amp Input R', unit: 'kΩ', min: 3, max: 25, step: 0.5, decimals: 1, role: 'Sets modulating gain (Rf / R₁)' },
  amTxRfK: { designator: 'Rf', name: 'Bias Amp Feedback R', unit: 'kΩ', min: 3, max: 25, step: 0.5, decimals: 1, role: 'Boosts/reduces modulation depth μ_eff' },
  amTxLtUh: { designator: 'Lt', name: 'Tank Inductor', unit: 'μH', min: 8, max: 50, step: 1, decimals: 0, role: 'Shifts parallel LC tank resonance around fc' },
  amTxCtPf: { designator: 'Ct', name: 'Tank Capacitor', unit: 'pF', min: 80, max: 500, step: 10, decimals: 0, role: 'Tunes LC tank center frequency & sideband balance' },
  amTxRlK: { designator: 'RL', name: 'Tank Load Resistor', unit: 'kΩ', min: 0.2, max: 5.0, step: 0.1, decimals: 1, role: 'Controls tank Q-factor & passband sharpness' },
  amRxRsOhm: { designator: 'Rs', name: 'Diode Series Resistor', unit: 'Ω', min: 10, max: 1000, step: 20, decimals: 0, role: 'Controls diode forward charging speed (Rs·C)' },
  amRxCUf: { designator: 'C', name: 'Envelope Hold Capacitor', unit: 'μF', min: 0.05, max: 2.0, step: 0.02, decimals: 2, role: 'Sets decay τ = Rl·C (ripple vs diagonal clip)' },
  amRxRlK: { designator: 'Rl', name: 'Envelope Discharge R', unit: 'kΩ', min: 0.1, max: 5.0, step: 0.05, decimals: 2, role: 'Sets discharge time constant τ = Rl·C' },
  amRxCcUf: { designator: 'Cc', name: 'DC-Block Capacitor', unit: 'μF', min: 0.01, max: 20, step: 0.05, decimals: 2, role: 'AC couples demodulated signal (f_HP = 1/2πRbCc)' },
  amRxRbK: { designator: 'Rb', name: 'Bias Bleeder Resistor', unit: 'kΩ', min: 0.2, max: 25, step: 0.2, decimals: 1, role: 'Sets output high-pass droop with Cc' },
  amRxOutRlK: { designator: 'RL', name: 'Buffer Output Load', unit: 'kΩ', min: 0.2, max: 10, step: 0.2, decimals: 1, role: 'Op-Amp buffer load resistance' },

  // DSB-SC
  dsbTxRsOhm: { designator: 'Rs', name: 'Input Source Impedance', unit: 'Ω', min: 100, max: 1500, step: 50, decimals: 0, role: 'Scales baseband drive amplitude into T₁' },
  dsbTxR1K: { designator: 'R₁', name: 'Upper Arm Resistor', unit: 'kΩ', min: 0.2, max: 3.0, step: 0.05, decimals: 2, role: 'Mismatch R₁ ≠ R₂ breaks carrier null (carrier leak)' },
  dsbTxR2K: { designator: 'R₂', name: 'Lower Arm Resistor', unit: 'kΩ', min: 0.2, max: 3.0, step: 0.05, decimals: 2, role: 'Balance with R₁ to cancel carrier at T₂' },
  dsbTxLfUh: { designator: 'Lf', name: 'Output Filter Inductor', unit: 'μH', min: 4, max: 30, step: 1, decimals: 0, role: 'Tunes output BPF resonance around fc' },
  dsbTxCfPf: { designator: 'Cf', name: 'Output Tank Capacitor', unit: 'pF', min: 60, max: 500, step: 10, decimals: 0, role: 'Tunes output bandpass tank around fc' },
  dsbTxRlOhm: { designator: 'RL', name: 'Modulator Load R', unit: 'Ω', min: 15, max: 100, step: 5, decimals: 0, role: 'Output load impedance scaling s(t)' },
  dsbCostasRiK: { designator: 'RI', name: 'I-Arm LPF Resistor', unit: 'kΩ', min: 0.2, max: 8.0, step: 0.1, decimals: 1, role: 'Sets I-arm RC cutoff (2fc rejection vs signal loss)' },
  dsbCostasCiNf: { designator: 'CI', name: 'I-Arm LPF Capacitor', unit: 'nF', min: 10, max: 400, step: 10, decimals: 0, role: 'Sets I-arm filter capacitance' },
  dsbCostasRqK: { designator: 'RQ', name: 'Q-Arm LPF Resistor', unit: 'kΩ', min: 0.2, max: 8.0, step: 0.1, decimals: 1, role: 'Sets Q-arm phase detector cutoff' },
  dsbCostasCqNf: { designator: 'CQ', name: 'Q-Arm LPF Capacitor', unit: 'nF', min: 10, max: 400, step: 10, decimals: 0, role: 'Sets Q-arm filter capacitance' },
  dsbCostasRloopK: { designator: 'Rloop', name: 'Loop Filter Resistor', unit: 'kΩ', min: 0.5, max: 8.0, step: 0.1, decimals: 1, role: 'Controls Costas VCO lock speed (Gain ∝ 1/Rloop)' },

  // SSB
  ssbTxChNf: { designator: 'CH', name: 'Hilbert All-Pass Cap', unit: 'nF', min: 3, max: 45, step: 1, decimals: 0, role: 'Detunes −90° Hilbert shift & leaks opposite sideband' },
  ssbTxRhK: { designator: 'RH', name: 'Hilbert All-Pass R', unit: 'kΩ', min: 2, max: 30, step: 0.5, decimals: 1, role: 'Tunes RC phase network accuracy at fm' },
  ssbTxR2K: { designator: 'R₂', name: 'Q-Branch Summing R', unit: 'kΩ', min: 2, max: 25, step: 0.5, decimals: 1, role: 'Imbalance vs R₃ weakens sideband cancellation' },
  ssbTxR3K: { designator: 'R₃', name: 'I-Branch Summing R', unit: 'kΩ', min: 2, max: 25, step: 0.5, decimals: 1, role: 'Balance with R₂ for clean USB/LSB rejection' },
  ssbTxCp1Pf: { designator: 'Cp1', name: 'Crystal Shunt Cap 1', unit: 'pF', min: 30, max: 300, step: 10, decimals: 0, role: 'Narrows/widens crystal ladder BPF passband' },
  ssbTxCp2Pf: { designator: 'Cp2', name: 'Crystal Shunt Cap 2', unit: 'pF', min: 30, max: 300, step: 10, decimals: 0, role: 'Shapes crystal ladder roll-off skirt' },
  ssbTxRlOhm: { designator: 'RL', name: 'SSB Output Load', unit: 'Ω', min: 15, max: 100, step: 5, decimals: 0, role: 'Scales output drive amplitude' },

  // VSB
  vsbRsOhm: { designator: 'RS', name: 'Source Resistor', unit: 'Ω', min: 10, max: 200, step: 5, decimals: 0, role: 'Input divider impedance with RL' },
  vsbC1Pf: { designator: 'C₁', name: 'Series Shaping Cap', unit: 'pF', min: 40, max: 400, step: 10, decimals: 0, role: 'Tunes VSB transition slope fv & H(f) symmetry' },
  vsbL1Uh: { designator: 'L₁', name: 'Series Shaping Inductor', unit: 'μH', min: 3, max: 30, step: 0.5, decimals: 1, role: 'Adjusts LC series roll-off & vestige width fv' },
  vsbL2Uh: { designator: 'L₂', name: 'Shunt Tank Inductor', unit: 'μH', min: 2, max: 24, step: 0.4, decimals: 1, role: 'Shifts VSB shaping inflection around fc' },
  vsbC2Pf: { designator: 'C₂', name: 'Shunt Tank Capacitor', unit: 'pF', min: 60, max: 500, step: 10, decimals: 0, role: 'Shifts lower sideband vestige cutoff' },
  vsbC3Pf: { designator: 'C₃', name: 'Stage Coupling Cap', unit: 'pF', min: 15, max: 150, step: 5, decimals: 0, role: 'Couples LC network into Op-Amp (+)' },
  vsbRfK: { designator: 'Rf', name: 'Active Feedback R', unit: 'kΩ', min: 0.2, max: 2.5, step: 0.05, decimals: 2, role: 'Scales Op-Amp passband gain & v_out amplitude' },
  vsbCfPf: { designator: 'Cf', name: 'Feedback Roll-off Cap', unit: 'pF', min: 5, max: 180, step: 2, decimals: 0, role: 'Controls upper sideband high-frequency roll-off' },
  vsbL3Uh: { designator: 'L₃', name: 'Trap Notch Inductor', unit: 'μH', min: 4, max: 40, step: 1, decimals: 0, role: 'Positions series resonant trap in suppressed sideband' },
  vsbC4Pf: { designator: 'C₄', name: 'Trap Notch Capacitor', unit: 'pF', min: 50, max: 450, step: 10, decimals: 0, role: 'Tunes series trap notch frequency' },
  vsbCoutUf: { designator: 'Cout', name: 'Output Coupling Cap', unit: 'μF', min: 0.01, max: 1.0, step: 0.01, decimals: 2, role: 'AC couples VSB output to 75 Ω load' },
  vsbRlOhm: { designator: 'RL', name: 'VSB Load Resistor', unit: 'Ω', min: 20, max: 200, step: 5, decimals: 0, role: 'Termination load scaling v_out = s_VSB(t)' },

  // Shared Sallen-Key Active LPF Demodulator
  skR1K: { designator: 'R₁', name: 'Sallen-Key R₁', unit: 'kΩ', min: 0.2, max: 15, step: 0.1, decimals: 1, role: 'Sets LPF cutoff fc (low fc attenuates; high leaks 2fc)' },
  skR2K: { designator: 'R₂', name: 'Sallen-Key R₂', unit: 'kΩ', min: 0.2, max: 15, step: 0.1, decimals: 1, role: 'Sets LPF cutoff fc = 1/(2π√(R₁R₂CfC₂))' },
  skCfNf: { designator: 'Cf', name: 'Sallen-Key Feedback C', unit: 'nF', min: 2, max: 150, step: 1, decimals: 0, role: 'Lowers/raises demodulator cutoff & Q damping' },
  skC2Nf: { designator: 'C₂', name: 'Sallen-Key Shunt C', unit: 'nF', min: 2, max: 150, step: 1, decimals: 0, role: 'Filters 2fc carrier ripple in y_o(t)' },
  skCoutUf: { designator: 'Cout', name: 'Rx AC Coupling Cap', unit: 'μF', min: 0.01, max: 20, step: 0.05, decimals: 2, role: 'Blocks DC offset (small value causes tilt/droop)' },
  skRlK: { designator: 'RL', name: 'Rx Load Resistor', unit: 'kΩ', min: 0.1, max: 10, step: 0.1, decimals: 1, role: 'Sets output HPF corner with Cout' },
};

function fmtCompVal(key: ComponentKey, val: number): string {
  const spec = COMPONENT_SPECS[key];
  const dec = spec.decimals ?? 1;
  return `${val.toFixed(dec)} ${spec.unit}`;
}

function maxAbsOf(arr: number[] | undefined): number {
  if (!arr || arr.length === 0) return 0;
  let m = 0;
  for (let i = 0; i < arr.length; i++) {
    const a = Math.abs(arr[i]);
    if (Number.isFinite(a) && a > m) m = a;
  }
  return m;
}

function buildProbePoints(
  data: number[],
  x: number,
  y: number,
  w: number,
  h: number,
  sharedMaxAbs: number
): { poly: string; firstX: number; firstY: number } {
  if (!data || data.length === 0) {
    return { poly: '', firstX: x, firstY: y + h / 2 };
  }
  const safeMax = Math.max(0.15, sharedMaxAbs);
  const midY = y + h / 2;
  const nLen = data.length;
  const pts: string[] = [];

  const toPy = (val: number) => {
    const clamped = Math.max(-1.15, Math.min(1.15, val / safeMax));
    return midY - clamped * (h * 0.41);
  };

  let firstX = x;
  let firstY = toPy(data[0] || 0);

  if (nLen <= 220) {
    for (let i = 0; i < nLen; i++) {
      const px = x + (i / Math.max(1, nLen - 1)) * w;
      const py = toPy(data[i] || 0);
      if (i === 0) {
        firstX = px;
        firstY = py;
      }
      pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    }
    return { poly: pts.join(' '), firstX, firstY };
  }

  // Chronological min-max bucket decimation captures both RF carrier peaks and smooth baseband without aliasing
  const buckets = 110;
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor((b * nLen) / buckets);
    const end = Math.min(nLen, Math.max(start + 1, Math.floor(((b + 1) * nLen) / buckets)));
    let minIdx = start;
    let maxIdx = start;
    let minV = data[start] ?? 0;
    let maxV = minV;
    for (let i = start + 1; i < end; i++) {
      const v = data[i] ?? 0;
      if (v < minV) {
        minV = v;
        minIdx = i;
      }
      if (v > maxV) {
        maxV = v;
        maxIdx = i;
      }
    }
    const ordered = minIdx <= maxIdx ? [minIdx, maxIdx] : [maxIdx, minIdx];
    const [i1, i2] = ordered;
    const px1 = x + (i1 / Math.max(1, nLen - 1)) * w;
    const py1 = toPy(data[i1] ?? 0);
    if (b === 0) {
      firstX = px1;
      firstY = py1;
    }
    pts.push(`${px1.toFixed(1)},${py1.toFixed(1)}`);
    if (i2 !== i1) {
      const px2 = x + (i2 / Math.max(1, nLen - 1)) * w;
      const py2 = toPy(data[i2] ?? 0);
      pts.push(`${px2.toFixed(1)},${py2.toFixed(1)}`);
    }
  }
  return { poly: pts.join(' '), firstX, firstY };
}

function getSample(arr: number[] | undefined, idx = 0): number {
  if (!arr || arr.length === 0) return 0;
  return arr[Math.min(arr.length - 1, Math.max(0, idx))] ?? 0;
}

// ---------------------------------------------------------------------------
// Realistic Discrete Electronic Schematic Primitives (880x310 spacious canvas)
// ---------------------------------------------------------------------------

const LiveWire: React.FC<{
  d: string;
  color: string;
  active?: boolean;
  isSimulating: boolean;
  speed: number;
  reverse?: boolean;
  width?: number;
}> = ({ d, color, active = true, isSimulating, speed, reverse = false, width = 1.9 }) => {
  const dur = `${(1.1 / Math.max(0.2, speed)).toFixed(2)}s`;
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={active ? '#CBD5E1' : '#E2E8F0'}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {active && (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={width + 0.4}
          strokeDasharray="7 8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`circuit-flow ${!isSimulating ? 'circuit-flow-paused' : ''}`}
          style={
            {
              '--flow-dur': dur,
              animationDirection: reverse ? 'reverse' : 'normal',
            } as React.CSSProperties
          }
        />
      )}
    </g>
  );
};

const NodeDot: React.FC<{ x: number; y: number; color?: string }> = ({
  x,
  y,
  color = '#1E293B',
}) => <circle cx={x} cy={y} r={3.2} fill={color} />;

const GroundSymbol: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g stroke="#334155" strokeWidth="1.7" strokeLinecap="round">
    <line x1={x} y1={y} x2={x} y2={y + 7} />
    <line x1={x - 10} y1={y + 7} x2={x + 10} y2={y + 7} />
    <line x1={x - 6.5} y1={y + 11.5} x2={x + 6.5} y2={y + 11.5} />
    <line x1={x - 3} y1={y + 16} x2={x + 3} y2={y + 16} />
  </g>
);

interface InteractiveProps {
  editKey?: ComponentKey;
  selectedKey?: ComponentKey | null;
  isModified?: boolean;
  onSelectEdit?: (key: ComponentKey) => void;
}

const ResistorSymbol: React.FC<
  {
    x: number;
    y: number;
    vertical?: boolean;
    label: string;
    sub?: string;
    color?: string;
    labelSide?: 'right' | 'left';
  } & InteractiveProps
> = ({
  x,
  y,
  vertical = false,
  label,
  sub,
  color = '#1E293B',
  labelSide = 'right',
  editKey,
  selectedKey,
  isModified = false,
  onSelectEdit,
}) => {
  const isSelected = Boolean(editKey && selectedKey === editKey);
  const path = vertical
    ? `M ${x} ${y - 20} L ${x} ${y - 13} L ${x - 6} ${y - 10} L ${x + 6} ${y - 5.5} L ${x - 6} ${y - 1} L ${x + 6} ${y + 3.5} L ${x - 6} ${y + 8} L ${x} ${y + 12} L ${x} ${y + 20}`
    : `M ${x - 20} ${y} L ${x - 13} ${y} L ${x - 10} ${y - 6} L ${x - 5.5} ${y + 6} L ${x - 1} ${y - 6} L ${x + 3.5} ${y + 6} L ${x + 8} ${y - 6} L ${x + 12} ${y} L ${x + 20} ${y}`;

  const dx = labelSide === 'left' ? -11 : 11;
  const anchor = labelSide === 'left' ? 'end' : 'start';
  const strokeCol = isSelected ? '#1E4620' : isModified ? '#D97706' : color;

  return (
    <g
      className={editKey ? 'cursor-pointer' : undefined}
      onClick={editKey ? () => onSelectEdit?.(editKey) : undefined}
    >
      {editKey && <title>{`Click to edit ${label} (${sub ?? ''})`}</title>}
      <rect
        x={vertical ? x - 8 : x - 20}
        y={vertical ? y - 20 : y - 8}
        width={vertical ? 16 : 40}
        height={vertical ? 40 : 16}
        fill="#FFFFFF"
      />
      {isSelected && (
        <rect
          x={vertical ? x - 11 : x - 22}
          y={vertical ? y - 22 : y - 10}
          width={vertical ? 22 : 44}
          height={vertical ? 44 : 20}
          rx={4}
          fill="#EFF3EB"
          stroke="#1E4620"
          strokeWidth="1.1"
          strokeDasharray="3 2"
        />
      )}
      <path d={path} fill="none" stroke={strokeCol} strokeWidth={isSelected ? '2.1' : '1.8'} strokeLinejoin="round" />
      <text
        x={vertical ? x + dx : x}
        y={vertical ? y - 2 : y - 12}
        textAnchor={vertical ? anchor : 'middle'}
        className={`text-[10px] font-mono font-bold ${isSelected ? 'fill-[#1E4620]' : 'fill-slate-800'}`}
      >
        {label}
      </text>
      {sub && (
        <text
          x={vertical ? x + dx : x}
          y={vertical ? y + 11 : y + 19}
          textAnchor={vertical ? anchor : 'middle'}
          className={`text-[9px] font-mono ${
            isSelected
              ? 'fill-[#1E4620] font-bold'
              : isModified
              ? 'fill-[#D97706] font-semibold'
              : editKey
              ? 'fill-[#0284C7]'
              : 'fill-slate-500'
          }`}
          textDecoration={editKey ? 'underline' : undefined}
        >
          {sub}
        </text>
      )}
      {editKey && (
        <rect
          x={vertical ? (labelSide === 'left' ? x - 56 : x - 14) : x - 28}
          y={vertical ? y - 24 : y - 22}
          width={vertical ? 70 : 56}
          height={48}
          fill="transparent"
        />
      )}
    </g>
  );
};

const CapacitorSymbol: React.FC<
  {
    x: number;
    y: number;
    vertical?: boolean;
    variable?: boolean;
    label: string;
    sub?: string;
    labelSide?: 'right' | 'left';
  } & InteractiveProps
> = ({
  x,
  y,
  vertical = true,
  variable = false,
  label,
  sub,
  labelSide = 'right',
  editKey,
  selectedKey,
  isModified = false,
  onSelectEdit,
}) => {
  const isSelected = Boolean(editKey && selectedKey === editKey);
  const dx = labelSide === 'left' ? -14 : 14;
  const anchor = labelSide === 'left' ? 'end' : 'start';
  const strokeCol = isSelected ? '#1E4620' : isModified ? '#D97706' : '#1E293B';

  return (
    <g
      className={editKey ? 'cursor-pointer' : undefined}
      onClick={editKey ? () => onSelectEdit?.(editKey) : undefined}
    >
      {editKey && <title>{`Click to edit ${label} (${sub ?? ''})`}</title>}
      {vertical ? (
        <>
          <rect x={x - 12} y={y - 16} width={24} height={32} fill="#FFFFFF" />
          {isSelected && (
            <rect
              x={x - 14}
              y={y - 17}
              width={28}
              height={34}
              rx={4}
              fill="#EFF3EB"
              stroke="#1E4620"
              strokeWidth="1.1"
              strokeDasharray="3 2"
            />
          )}
          <line x1={x} y1={y - 16} x2={x} y2={y - 3.5} stroke={strokeCol} strokeWidth="1.8" />
          <line x1={x - 10.5} y1={y - 3.5} x2={x + 10.5} y2={y - 3.5} stroke={strokeCol} strokeWidth="2.3" />
          <line x1={x - 10.5} y1={y + 3.5} x2={x + 10.5} y2={y + 3.5} stroke={strokeCol} strokeWidth="2.3" />
          <line x1={x} y1={y + 3.5} x2={x} y2={y + 16} stroke={strokeCol} strokeWidth="1.8" />
          {variable && (
            <path
              d={`M ${x - 12} ${y + 12} L ${x + 12} ${y - 12} M ${x + 7} ${y - 12} L ${x + 12} ${y - 12} L ${x + 12} ${y - 7}`}
              fill="none"
              stroke="#0284C7"
              strokeWidth="1.35"
            />
          )}
          <text
            x={x + dx}
            y={y - 2}
            textAnchor={anchor}
            className={`text-[10px] font-mono font-bold ${isSelected ? 'fill-[#1E4620]' : 'fill-slate-800'}`}
          >
            {label}
          </text>
          {sub && (
            <text
              x={x + dx}
              y={y + 11}
              textAnchor={anchor}
              className={`text-[9px] font-mono ${
                isSelected
                  ? 'fill-[#1E4620] font-bold'
                  : isModified
                  ? 'fill-[#D97706] font-semibold'
                  : editKey
                  ? 'fill-[#0284C7]'
                  : 'fill-slate-500'
              }`}
              textDecoration={editKey ? 'underline' : undefined}
            >
              {sub}
            </text>
          )}
        </>
      ) : (
        <>
          <rect x={x - 16} y={y - 12} width={32} height={24} fill="#FFFFFF" />
          {isSelected && (
            <rect
              x={x - 17}
              y={y - 13}
              width={34}
              height={26}
              rx={4}
              fill="#EFF3EB"
              stroke="#1E4620"
              strokeWidth="1.1"
              strokeDasharray="3 2"
            />
          )}
          <line x1={x - 16} y1={y} x2={x - 3.5} y2={y} stroke={strokeCol} strokeWidth="1.8" />
          <line x1={x - 3.5} y1={y - 10.5} x2={x - 3.5} y2={y + 10.5} stroke={strokeCol} strokeWidth="2.3" />
          <line x1={x + 3.5} y1={y - 10.5} x2={x + 3.5} y2={y + 10.5} stroke={strokeCol} strokeWidth="2.3" />
          <line x1={x + 3.5} y1={y} x2={x + 16} y2={y} stroke={strokeCol} strokeWidth="1.8" />
          <text
            x={x}
            y={y - 15}
            textAnchor="middle"
            className={`text-[10px] font-mono font-bold ${isSelected ? 'fill-[#1E4620]' : 'fill-slate-800'}`}
          >
            {label}
          </text>
          {sub && (
            <text
              x={x}
              y={y + 22}
              textAnchor="middle"
              className={`text-[9px] font-mono ${
                isSelected
                  ? 'fill-[#1E4620] font-bold'
                  : isModified
                  ? 'fill-[#D97706] font-semibold'
                  : editKey
                  ? 'fill-[#0284C7]'
                  : 'fill-slate-500'
              }`}
              textDecoration={editKey ? 'underline' : undefined}
            >
              {sub}
            </text>
          )}
        </>
      )}
      {editKey && (
        <rect
          x={vertical ? (labelSide === 'left' ? x - 60 : x - 16) : x - 26}
          y={y - 24}
          width={vertical ? 76 : 52}
          height={50}
          fill="transparent"
        />
      )}
    </g>
  );
};

const InductorSymbol: React.FC<
  {
    x: number;
    y: number;
    vertical?: boolean;
    label: string;
    sub?: string;
    labelSide?: 'right' | 'left';
  } & InteractiveProps
> = ({
  x,
  y,
  vertical = false,
  label,
  sub,
  labelSide = 'right',
  editKey,
  selectedKey,
  isModified = false,
  onSelectEdit,
}) => {
  const isSelected = Boolean(editKey && selectedKey === editKey);
  const dx = labelSide === 'left' ? -11 : 11;
  const anchor = labelSide === 'left' ? 'end' : 'start';
  const strokeCol = isSelected ? '#1E4620' : isModified ? '#D97706' : '#1E293B';

  return (
    <g
      className={editKey ? 'cursor-pointer' : undefined}
      onClick={editKey ? () => onSelectEdit?.(editKey) : undefined}
    >
      {editKey && <title>{`Click to edit ${label} (${sub ?? ''})`}</title>}
      {vertical ? (
        <>
          <rect x={x - 9} y={y - 20} width={18} height={40} fill="#FFFFFF" />
          {isSelected && (
            <rect
              x={x - 11}
              y={y - 22}
              width={22}
              height={44}
              rx={4}
              fill="#EFF3EB"
              stroke="#1E4620"
              strokeWidth="1.1"
              strokeDasharray="3 2"
            />
          )}
          <path
            d={`M ${x} ${y - 20} L ${x} ${y - 16} A 4.8 4 0 0 1 ${x} ${y - 8} A 4.8 4 0 0 1 ${x} ${y} A 4.8 4 0 0 1 ${x} ${y + 8} A 4.8 4 0 0 1 ${x} ${y + 16} L ${x} ${y + 20}`}
            fill="none"
            stroke={strokeCol}
            strokeWidth={isSelected ? '2.1' : '1.8'}
          />
          <text
            x={x + dx}
            y={y - 2}
            textAnchor={anchor}
            className={`text-[10px] font-mono font-bold ${isSelected ? 'fill-[#1E4620]' : 'fill-slate-800'}`}
          >
            {label}
          </text>
          {sub && (
            <text
              x={x + dx}
              y={y + 11}
              textAnchor={anchor}
              className={`text-[9px] font-mono ${
                isSelected
                  ? 'fill-[#1E4620] font-bold'
                  : isModified
                  ? 'fill-[#D97706] font-semibold'
                  : editKey
                  ? 'fill-[#0284C7]'
                  : 'fill-slate-500'
              }`}
              textDecoration={editKey ? 'underline' : undefined}
            >
              {sub}
            </text>
          )}
        </>
      ) : (
        <>
          <rect x={x - 20} y={y - 9} width={40} height={18} fill="#FFFFFF" />
          {isSelected && (
            <rect
              x={x - 22}
              y={y - 11}
              width={44}
              height={22}
              rx={4}
              fill="#EFF3EB"
              stroke="#1E4620"
              strokeWidth="1.1"
              strokeDasharray="3 2"
            />
          )}
          <path
            d={`M ${x - 20} ${y} L ${x - 16} ${y} A 4 5.2 0 0 1 ${x - 8} ${y} A 4 5.2 0 0 1 ${x} ${y} A 4 5.2 0 0 1 ${x + 8} ${y} A 4 5.2 0 0 1 ${x + 16} ${y} L ${x + 20} ${y}`}
            fill="none"
            stroke={strokeCol}
            strokeWidth={isSelected ? '2.1' : '1.8'}
          />
          <text
            x={x}
            y={y - 12}
            textAnchor="middle"
            className={`text-[10px] font-mono font-bold ${isSelected ? 'fill-[#1E4620]' : 'fill-slate-800'}`}
          >
            {label}
          </text>
          {sub && (
            <text
              x={x}
              y={y + 19}
              textAnchor="middle"
              className={`text-[9px] font-mono ${
                isSelected
                  ? 'fill-[#1E4620] font-bold'
                  : isModified
                  ? 'fill-[#D97706] font-semibold'
                  : editKey
                  ? 'fill-[#0284C7]'
                  : 'fill-slate-500'
              }`}
              textDecoration={editKey ? 'underline' : undefined}
            >
              {sub}
            </text>
          )}
        </>
      )}
      {editKey && (
        <rect
          x={vertical ? (labelSide === 'left' ? x - 58 : x - 14) : x - 26}
          y={y - 24}
          width={vertical ? 72 : 52}
          height={48}
          fill="transparent"
        />
      )}
    </g>
  );
};

const DiodeSymbol: React.FC<{
  x: number;
  y: number;
  label: string;
  sub?: string;
  conducting?: boolean;
  reverseDir?: boolean;
  angleDeg?: number;
}> = ({ x, y, label, sub, conducting = true, reverseDir = false, angleDeg = 0 }) => {
  const strokeColor = conducting ? '#15803D' : '#94A3B8';
  const fillColor = conducting ? '#DCFCE7' : '#F8FAFC';
  const dir = reverseDir ? -1 : 1;
  return (
    <g>
      <g transform={`translate(${x},${y}) rotate(${angleDeg})`}>
        <rect x={-16} y={-10} width={32} height={20} fill="#FFFFFF" />
        <line x1={-16} y1={0} x2={-8} y2={0} stroke={strokeColor} strokeWidth="1.8" />
        <polygon
          points={`${-8 * dir},-8.5 ${-8 * dir},8.5 ${8 * dir},0`}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.85"
        />
        <line x1={8 * dir} y1={-8.5} x2={8 * dir} y2={8.5} stroke={strokeColor} strokeWidth="2.3" />
        <line x1={8} y1={0} x2={16} y2={0} stroke={strokeColor} strokeWidth="1.8" />
      </g>
      <text
        x={x}
        y={y - 14}
        textAnchor="middle"
        className={`text-[10px] font-mono font-bold ${
          conducting ? 'fill-[#15803D]' : 'fill-slate-500'
        }`}
      >
        {label}
      </text>
      {sub && (
        <text x={x} y={y + 21} textAnchor="middle" className="fill-slate-500 text-[9px] font-mono">
          {sub}
        </text>
      )}
    </g>
  );
};

const OpAmpSymbol: React.FC<{
  x: number;
  y: number;
  label?: string;
  topSign?: '+' | '−' | '×';
  botSign?: '+' | '−' | '×';
  showRails?: boolean;
  flipX?: boolean;
}> = ({ x, y, label, topSign = '+', botSign, showRails = true, flipX = false }) => {
  const resolvedBotSign = botSign ?? (topSign === '+' ? '−' : '+');
  const polyPoints = flipX
    ? `${x + 24},${y - 24} ${x + 24},${y + 24} ${x - 24},${y}`
    : `${x - 24},${y - 24} ${x - 24},${y + 24} ${x + 24},${y}`;
  const signX = flipX ? x + 12 : x - 18;
  return (
    <g>
      {showRails && (
        <>
          <line x1={x} y1={y - 12} x2={x} y2={y - 28} stroke="#334155" strokeWidth="1.5" />
          <circle cx={x} cy={y - 30} r={2.8} fill="#FFFFFF" stroke="#334155" strokeWidth="1.4" />
          <text x={x + 6} y={y - 27} className="fill-slate-700 text-[9px] font-mono font-semibold">
            +Vcc
          </text>
          <line x1={x} y1={y + 12} x2={x} y2={y + 28} stroke="#334155" strokeWidth="1.5" />
          <circle cx={x} cy={y + 30} r={2.8} fill="#FFFFFF" stroke="#334155" strokeWidth="1.4" />
          <text x={x + 6} y={y + 33} className="fill-slate-700 text-[9px] font-mono font-semibold">
            −Vee
          </text>
        </>
      )}
      <polygon
        points={polyPoints}
        fill="#FFFFFF"
        stroke="#1E293B"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <text x={signX} y={y - 7} className="fill-slate-800 text-[11px] font-mono font-bold">
        {topSign}
      </text>
      <text x={signX} y={y + 13} className="fill-slate-800 text-[11px] font-mono font-bold">
        {resolvedBotSign}
      </text>
      {label && (
        <text
          x={x}
          y={y + (showRails ? 46 : 38)}
          textAnchor="middle"
          className="fill-slate-600 text-[9px] font-mono font-semibold"
        >
          {label}
        </text>
      )}
    </g>
  );
};

const TransistorSymbol: React.FC<{
  x: number;
  y: number;
  label: string;
  sub?: string;
}> = ({ x, y, label, sub }) => (
  <g>
    <circle cx={x} cy={y} r={17} fill="#FFFFFF" stroke="#1E293B" strokeWidth="1.7" />
    <line x1={x - 6} y1={y - 9} x2={x - 6} y2={y + 9} stroke="#1E293B" strokeWidth="2.4" />
    <line x1={x - 19} y1={y} x2={x - 6} y2={y} stroke="#1E293B" strokeWidth="1.7" />
    <line x1={x - 6} y1={y - 4} x2={x + 7} y2={y - 13} stroke="#1E293B" strokeWidth="1.7" />
    <line x1={x + 7} y1={y - 13} x2={x + 7} y2={y - 22} stroke="#1E293B" strokeWidth="1.7" />
    <line x1={x - 6} y1={y + 4} x2={x + 7} y2={y + 13} stroke="#1E293B" strokeWidth="1.7" />
    <line x1={x + 7} y1={y + 13} x2={x + 7} y2={y + 22} stroke="#1E293B" strokeWidth="1.7" />
    <polygon points={`${x + 1.5},${y + 11.5} ${x + 7},${y + 13} ${x + 5},${y + 7.5}`} fill="#1E293B" />
    <text x={x + 22} y={y - 2} className="fill-slate-800 text-[10px] font-mono font-bold">
      {label}
    </text>
    {sub && (
      <text x={x + 22} y={y + 10} className="fill-slate-500 text-[8.5px] font-mono">
        {sub}
      </text>
    )}
  </g>
);

const CrystalSymbol: React.FC<{ x: number; y: number; label: string; sub?: string }> = ({
  x,
  y,
  label,
  sub,
}) => (
  <g>
    <rect x={x - 18} y={y - 13} width={36} height={26} fill="#FFFFFF" />
    <line x1={x - 18} y1={y} x2={x - 8} y2={y} stroke="#1E293B" strokeWidth="1.8" />
    <line x1={x - 8} y1={y - 10} x2={x - 8} y2={y + 10} stroke="#1E293B" strokeWidth="2.2" />
    <rect x={x - 4.5} y={y - 12} width={9} height={24} fill="#EFF3EB" stroke="#1E4620" strokeWidth="1.6" />
    <line x1={x + 8} y1={y - 10} x2={x + 8} y2={y + 10} stroke="#1E293B" strokeWidth="2.2" />
    <line x1={x + 8} y1={y} x2={x + 18} y2={y} stroke="#1E293B" strokeWidth="1.8" />
    <text x={x} y={y - 17} textAnchor="middle" className="fill-slate-800 text-[10px] font-mono font-bold">
      {label}
    </text>
    {sub && (
      <text x={x} y={y + 22} textAnchor="middle" className="fill-slate-500 text-[9px] font-mono">
        {sub}
      </text>
    )}
  </g>
);

const ACSourceSymbol: React.FC<
  {
    x: number;
    y: number;
    label: string;
    sub?: string;
    color: string;
    isDC?: boolean;
    labelLeft?: boolean;
  } & InteractiveProps
> = ({
  x,
  y,
  label,
  sub,
  color,
  isDC = false,
  labelLeft = false,
  editKey,
  selectedKey,
  isModified = false,
  onSelectEdit,
}) => {
  const isSelected = Boolean(editKey && selectedKey === editKey);
  const strokeCol = isSelected ? '#1E4620' : color;
  return (
    <g
      className={editKey ? 'cursor-pointer' : undefined}
      onClick={editKey ? () => onSelectEdit?.(editKey) : undefined}
    >
      {editKey && <title>{`Click to edit ${label} (${sub ?? ''})`}</title>}
      <circle
        cx={x}
        cy={y}
        r={15}
        fill={isSelected ? '#EFF3EB' : '#FFFFFF'}
        stroke={strokeCol}
        strokeWidth={isSelected ? '2.2' : '1.85'}
      />
      {isDC ? (
        <>
          <line x1={x - 6.5} y1={y - 3} x2={x + 6.5} y2={y - 3} stroke={strokeCol} strokeWidth="1.9" />
          <line x1={x - 3.5} y1={y + 3} x2={x + 3.5} y2={y + 3} stroke={strokeCol} strokeWidth="1.9" />
        </>
      ) : (
        <path
          d={`M ${x - 7.5} ${y} Q ${x - 3.8} ${y - 6.5} ${x} ${y} T ${x + 7.5} ${y}`}
          fill="none"
          stroke={strokeCol}
          strokeWidth="1.75"
        />
      )}
      {labelLeft ? (
        <>
          <text x={x - 20} y={y - 2} textAnchor="end" className="fill-slate-800 text-[10px] font-mono font-bold">
            {label}
          </text>
          {sub && (
            <text
              x={x - 20}
              y={y + 10}
              textAnchor="end"
              className={`text-[8.5px] font-mono ${
                isSelected
                  ? 'fill-[#1E4620] font-bold'
                  : isModified
                  ? 'fill-[#D97706] font-semibold'
                  : editKey
                  ? 'fill-[#0284C7]'
                  : 'fill-slate-500'
              }`}
              textDecoration={editKey ? 'underline' : undefined}
            >
              {sub}
            </text>
          )}
        </>
      ) : (
        <>
          <text x={x} y={y - 20} textAnchor="middle" className="fill-slate-800 text-[10px] font-mono font-bold">
            {label}
          </text>
          {sub && (
            <text
              x={x}
              y={y + 25}
              textAnchor="middle"
              className={`text-[8.5px] font-mono ${
                isSelected
                  ? 'fill-[#1E4620] font-bold'
                  : isModified
                  ? 'fill-[#D97706] font-semibold'
                  : editKey
                  ? 'fill-[#0284C7]'
                  : 'fill-slate-500'
              }`}
              textDecoration={editKey ? 'underline' : undefined}
            >
              {sub}
            </text>
          )}
        </>
      )}
    </g>
  );
};

const TransformerSymbol: React.FC<{
  x: number;
  y: number;
  label: string;
  centerTapSide?: 'left' | 'right' | 'both';
}> = ({ x, y, label, centerTapSide = 'right' }) => (
  <g>
    <rect x={x - 16} y={y - 38} width={32} height={76} fill="#FFFFFF" />
    <path
      d={`M ${x - 14} ${y - 36} C ${x - 4} ${y - 30}, ${x - 4} ${y - 22}, ${x - 14} ${y - 16} C ${x - 4} ${y - 10}, ${x - 4} ${y - 2}, ${x - 14} ${y + 4} C ${x - 4} ${y + 10}, ${x - 4} ${y + 18}, ${x - 14} ${y + 24} L ${x - 14} ${y + 36}`}
      fill="none"
      stroke="#1E293B"
      strokeWidth="1.8"
    />
    <line x1={x - 2} y1={y - 34} x2={x - 2} y2={y + 34} stroke="#64748B" strokeWidth="1.5" />
    <line x1={x + 2} y1={y - 34} x2={x + 2} y2={y + 34} stroke="#64748B" strokeWidth="1.5" />
    <path
      d={`M ${x + 14} ${y - 36} C ${x + 4} ${y - 30}, ${x + 4} ${y - 22}, ${x + 14} ${y - 16} C ${x + 4} ${y - 10}, ${x + 4} ${y - 2}, ${x + 14} ${y + 4} C ${x + 4} ${y + 10}, ${x + 4} ${y + 18}, ${x + 14} ${y + 24} L ${x + 14} ${y + 36}`}
      fill="none"
      stroke="#1E293B"
      strokeWidth="1.8"
    />
    {(centerTapSide === 'right' || centerTapSide === 'both') && (
      <circle cx={x + 14} cy={y} r={3.2} fill="#7C3AED" />
    )}
    {(centerTapSide === 'left' || centerTapSide === 'both') && (
      <circle cx={x - 14} cy={y} r={3.2} fill="#7C3AED" />
    )}
    <text x={x} y={y - 44} textAnchor="middle" className="fill-slate-800 text-[10px] font-mono font-bold">
      {label}
    </text>
  </g>
);

const SCOPE_ZOOM_LEVELS = [0.4, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12];

interface CircuitScopeContextValue {
  modZoom: number;
  demodZoom: number;
  stepZoom: (stage: 'mod' | 'demod', dir: 1 | -1) => void;
  resetZoom: (stage: 'mod' | 'demod') => void;
  openScopeModal: (payload: {
    stage: 'mod' | 'demod';
    label: string;
    color: string;
    refLabel?: string;
    statusTag?: string;
    statusColor?: string;
  }) => void;
  longMArr?: number[];
  longSArr?: number[];
  longYArr?: number[];
}

const CircuitScopeContext = createContext<CircuitScopeContextValue>({
  modZoom: 1,
  demodZoom: 1,
  stepZoom: () => {},
  resetZoom: () => {},
  openScopeModal: () => {},
});

const OutputScopeProbe: React.FC<{
  x: number;
  y: number;
  w?: number;
  h?: number;
  data: number[];
  refData?: number[];
  refLabel?: string;
  color: string;
  label: string;
  valText: string;
  statusTag?: string;
  statusColor?: string;
}> = ({
  x,
  y,
  w = 162,
  h = 152,
  data,
  refData,
  refLabel,
  color,
  label,
  valText,
  statusTag,
  statusColor = '#1E4620',
}) => {
  const scopeCtx = useContext(CircuitScopeContext);
  const stage: 'mod' | 'demod' = refData ? 'demod' : 'mod';
  const zoom = stage === 'mod' ? scopeCtx.modZoom : scopeCtx.demodZoom;

  const boxX = x - 4;
  const boxY = y - 12;

  const activeSource = useMemo(() => {
    const ext = stage === 'mod' ? scopeCtx.longSArr : scopeCtx.longYArr;
    return ext && ext.length > 0 ? ext : data;
  }, [stage, scopeCtx.longSArr, scopeCtx.longYArr, data]);

  const activeRefSource = useMemo(() => {
    if (!refData || refData.length === 0) return undefined;
    const extRef = scopeCtx.longMArr;
    return extRef && extRef.length > 0 ? extRef : refData;
  }, [refData, scopeCtx.longMArr]);

  const sampleCount = Math.min(
    activeSource.length,
    Math.max(40, Math.round(SCOPE_SAMPLES / Math.max(0.25, zoom)))
  );
  const visibleData = useMemo(
    () => activeSource.slice(0, sampleCount),
    [activeSource, sampleCount]
  );
  const visibleRefData = useMemo(
    () => (activeRefSource ? activeRefSource.slice(0, sampleCount) : undefined),
    [activeRefSource, sampleCount]
  );

  const winMs = (sampleCount / SIM_FS) * 1000;

  // Keep Y-scale locked across zoom levels using the nominal 4.5ms peak
  const refMax = maxAbsOf(refData);
  const dataMax = maxAbsOf(data);
  const rawScale = refData ? Math.max(0.25, refMax, dataMax) : Math.max(0.15, dataMax);
  const scaleStep = rawScale <= 1.2 ? 0.25 : rawScale <= 3 ? 0.5 : 1.0;
  const scaleMax = Math.max(0.25, Math.ceil((rawScale * 1.08) / scaleStep) * scaleStep);

  // Inner oscilloscope plot area matching DarkOscilloscopeCanvas layout (left Y ticks, bottom X ticks)
  const plotX = boxX + 24;
  const plotY = boxY + 6;
  const plotW = w - 28;
  const plotH = h - 22;
  const clipId = `scope-clip-${stage}`;

  const mainTrace = useMemo(
    () => buildProbePoints(visibleData, plotX, plotY, plotW, plotH, scaleMax),
    [visibleData, plotX, plotY, plotW, plotH, scaleMax]
  );

  const refTrace = useMemo(() => {
    if (!visibleRefData || visibleRefData.length === 0) return null;
    return buildProbePoints(visibleRefData, plotX, plotY, plotW, plotH, scaleMax);
  }, [visibleRefData, plotX, plotY, plotW, plotH, scaleMax]);

  const vPeak = dataMax;
  const vMid = plotY + plotH / 2;
  const canZoomOut = zoom > SCOPE_ZOOM_LEVELS[0] + 1e-4;
  const canZoomIn = zoom < SCOPE_ZOOM_LEVELS[SCOPE_ZOOM_LEVELS.length - 1] - 1e-4;
  const isZoomed = Math.abs(zoom - 1) > 1e-4;

  const openModal = () =>
    scopeCtx.openScopeModal({
      stage,
      label,
      color,
      refLabel,
      statusTag,
      statusColor,
    });

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={plotX} y={plotY - 1} width={plotW} height={plotH + 2} />
        </clipPath>
      </defs>

      {/* Top Channel Label & Live Voltage Readout */}
      <text x={boxX} y={boxY - 24} className="fill-slate-800 text-[9.5px] font-mono font-bold">
        {label}
      </text>
      <text
        x={boxX + w}
        y={boxY - 24}
        textAnchor="end"
        className="text-[9.5px] font-mono font-bold tabular-nums"
        fill={color}
      >
        {valText}
      </text>

      {/* Inline Oscilloscope Zoom Toolbar (Zoom Out / Zoom Pill / Zoom In / Expand) */}
      <g>
        {/* Zoom Out (-) */}
        <g
          className={canZoomOut ? 'cursor-pointer' : 'opacity-40'}
          onClick={canZoomOut ? () => scopeCtx.stepZoom(stage, -1) : undefined}
        >
          <title>Zoom Out (wider time window)</title>
          <rect
            x={boxX}
            y={boxY - 19}
            width={18}
            height={14}
            rx={3}
            fill="#FFFFFF"
            stroke="#CBD5E1"
            strokeWidth="1"
          />
          <text
            x={boxX + 9}
            y={boxY - 9}
            textAnchor="middle"
            className="fill-slate-700 text-[10px] font-mono font-bold select-none"
          >
            −
          </text>
        </g>

        {/* Zoom Factor Pill (click to reset 1.0x) */}
        <g
          className={isZoomed ? 'cursor-pointer' : undefined}
          onClick={isZoomed ? () => scopeCtx.resetZoom(stage) : undefined}
        >
          <title>{isZoomed ? 'Click to reset zoom to 1.0× (4.5 ms)' : 'Timebase zoom (1.0× = 4.5 ms)'}</title>
          <rect
            x={boxX + 20}
            y={boxY - 19}
            width={34}
            height={14}
            rx={3}
            fill={isZoomed ? '#EFF3EB' : '#F8FAFC'}
            stroke={isZoomed ? '#1E4620' : '#CBD5E1'}
            strokeWidth="1"
          />
          <text
            x={boxX + 37}
            y={boxY - 9}
            textAnchor="middle"
            className={`text-[8.5px] font-mono font-bold select-none ${
              isZoomed ? 'fill-[#1E4620]' : 'fill-slate-600'
            }`}
          >
            {zoom < 1 ? zoom.toFixed(1) : Number.isInteger(zoom) ? `${zoom}×` : `${zoom.toFixed(1)}×`}
          </text>
        </g>

        {/* Zoom In (+) */}
        <g
          className={canZoomIn ? 'cursor-pointer' : 'opacity-40'}
          onClick={canZoomIn ? () => scopeCtx.stepZoom(stage, 1) : undefined}
        >
          <title>Zoom In (inspect fine cycles)</title>
          <rect
            x={boxX + 56}
            y={boxY - 19}
            width={18}
            height={14}
            rx={3}
            fill="#FFFFFF"
            stroke="#CBD5E1"
            strokeWidth="1"
          />
          <text
            x={boxX + 65}
            y={boxY - 9}
            textAnchor="middle"
            className="fill-slate-700 text-[10px] font-mono font-bold select-none"
          >
            +
          </text>
        </g>

        {/* Expand Full Oscilloscope Screen */}
        <g className="cursor-pointer" onClick={openModal}>
          <title>Open full interactive Oscilloscope Screen</title>
          <rect
            x={boxX + w - 50}
            y={boxY - 19}
            width={50}
            height={14}
            rx={3}
            fill="#EFF3EB"
            stroke="#1E4620"
            strokeWidth="0.9"
          />
          <text
            x={boxX + w - 25}
            y={boxY - 9}
            textAnchor="middle"
            className="fill-[#1E4620] text-[8px] font-mono font-bold select-none"
          >
            ⤢ Scope
          </text>
        </g>
      </g>

      {/* Outer Oscilloscope Bezel (Click to open full scope) */}
      <g className="cursor-pointer" onClick={openModal}>
        <title>Click to open large Oscilloscope Screen</title>
        <rect
          x={boxX}
          y={boxY}
          width={w}
          height={h}
          rx={7}
          fill="#FFFFFF"
          stroke="#94A3B8"
          strokeWidth="1.5"
        />

        {/* Inner Plot Frame */}
        <rect
          x={plotX}
          y={plotY}
          width={plotW}
          height={plotH}
          fill="#FFFFFF"
          stroke="#E2E8F0"
          strokeWidth="0.9"
        />

        {/* Horizontal Graticule Gridlines (just like DarkOscilloscopeCanvas) */}
        <line x1={plotX} y1={plotY + plotH * 0.25} x2={plotX + plotW} y2={plotY + plotH * 0.25} stroke="rgba(15,23,42,0.08)" strokeWidth="0.8" strokeDasharray="2 3" />
        <line x1={plotX} y1={vMid} x2={plotX + plotW} y2={vMid} stroke="rgba(15,23,42,0.18)" strokeWidth="0.95" />
        <line x1={plotX} y1={plotY + plotH * 0.75} x2={plotX + plotW} y2={plotY + plotH * 0.75} stroke="rgba(15,23,42,0.08)" strokeWidth="0.8" strokeDasharray="2 3" />

        {/* Vertical Time Division Gridlines */}
        {[0.25, 0.5, 0.75].map((frac) => (
          <line
            key={frac}
            x1={plotX + plotW * frac}
            y1={plotY}
            x2={plotX + plotW * frac}
            y2={plotY + plotH}
            stroke="rgba(15,23,42,0.08)"
            strokeWidth="0.8"
            strokeDasharray="2 3"
          />
        ))}

        {/* Left Y-axis Voltage Ticks (+V, 0, -V) */}
        <text x={plotX - 2} y={plotY + 6} textAnchor="end" className="fill-slate-500 text-[7.2px] font-mono tabular-nums">
          {scaleMax.toFixed(1)}
        </text>
        <text x={plotX - 2} y={vMid + 2.5} textAnchor="end" className="fill-slate-500 text-[7.2px] font-mono tabular-nums">
          0
        </text>
        <text x={plotX - 2} y={plotY + plotH - 1} textAnchor="end" className="fill-slate-500 text-[7.2px] font-mono tabular-nums">
          -{scaleMax.toFixed(1)}
        </text>

        {/* Bottom X-axis Time Ticks */}
        <text x={plotX} y={boxY + h - 4} textAnchor="start" className="fill-slate-500 text-[7.2px] font-mono tabular-nums">
          0
        </text>
        <text x={plotX + plotW * 0.5} y={boxY + h - 4} textAnchor="middle" className="fill-slate-500 text-[7.2px] font-mono tabular-nums">
          {(winMs * 0.5).toFixed(winMs < 2 ? 2 : 1)}
        </text>
        <text x={plotX + plotW} y={boxY + h - 4} textAnchor="end" className="fill-slate-500 text-[7.2px] font-mono tabular-nums">
          {winMs.toFixed(winMs < 2 ? 2 : 1)}ms
        </text>

        {/* Clipped Oscilloscope Waveforms */}
        <g clipPath={`url(#${clipId})`}>
          {refTrace?.poly && (
            <polyline
              points={refTrace.poly}
              fill="none"
              stroke="#0284C7"
              strokeWidth="1.35"
              strokeDasharray="4 3"
              strokeLinejoin="round"
              opacity={0.82}
            />
          )}

          {mainTrace.poly && (
            <>
              <polyline
                points={mainTrace.poly}
                fill="none"
                stroke={color}
                strokeWidth="1.95"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <circle cx={mainTrace.firstX} cy={mainTrace.firstY} r={2.6} fill={color} />
            </>
          )}
        </g>
      </g>

      {/* Bottom Readout Footer */}
      <text x={boxX} y={boxY + h + 13} className="fill-slate-500 text-[8.5px] font-mono tabular-nums">
        {refLabel ? `--- ${refLabel} | ` : ''}Vp={vPeak.toFixed(2)}V
      </text>
      {statusTag && (
        <text
          x={boxX + w}
          y={boxY + h + 13}
          textAnchor="end"
          className="text-[8.5px] font-mono font-bold"
          fill={statusColor}
        >
          {statusTag}
        </text>
      )}
    </g>
  );
};

// Inline Component Tuner Strip placed neatly inside each circuit card
const CircuitComponentEditor: React.FC<{
  keys: ComponentKey[];
  selectedKey: ComponentKey;
  onSelectKey: (k: ComponentKey) => void;
  values: CircuitComponentValues;
  onUpdate: (patch: Partial<CircuitComponentValues>) => void;
  derivedReadout?: string;
}> = ({ keys, selectedKey, onSelectKey, values, onUpdate, derivedReadout }) => {
  const activeKey = keys.includes(selectedKey) ? selectedKey : keys[0];
  const spec = COMPONENT_SPECS[activeKey];
  const currentVal = values[activeKey];
  const defaultVal = DEFAULT_CIRCUIT_VALUES[activeKey];
  const isDirty = Math.abs(currentVal - defaultVal) > 1e-4;

  return (
    <div className="border-t border-slate-100 pt-2 space-y-2">
      {/* Quick-pick component buttons (matches schematic labels) */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
          <SlidersHorizontal className="w-2.5 h-2.5" />
          Edit:
        </span>
        {keys.map((k) => {
          const sp = COMPONENT_SPECS[k];
          const val = values[k];
          const mod = Math.abs(val - DEFAULT_CIRCUIT_VALUES[k]) > 1e-4;
          const active = k === activeKey;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onSelectKey(k)}
              className={`px-1.5 py-0.5 rounded border text-[9.5px] font-mono transition-colors cursor-pointer ${
                active
                  ? 'bg-[#EFF3EB] border-[#1E4620] text-[#1E4620] font-bold'
                  : mod
                  ? 'bg-amber-50/60 border-amber-300 text-amber-800 font-semibold'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              {sp.designator}: {fmtCompVal(k, val)}
            </button>
          );
        })}
      </div>

      {/* Active Component Slider + Direct Numeric Input */}
      <div className="bg-[#FAFAF8] border border-slate-200 rounded-lg px-2.5 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[165px] flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold text-[#111827]">
              {spec.designator} · {spec.name}
            </span>
            {derivedReadout && (
              <span className="text-[9.5px] font-mono text-[#1E4620] font-semibold">
                ({derivedReadout})
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-500">{spec.role}</div>
        </div>

        <div className="flex items-center gap-2.5">
          <input
            type="range"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={currentVal}
            onChange={(e) => onUpdate({ [activeKey]: Number(e.target.value) })}
            className="w-28 sm:w-36 accent-[#1E4620] cursor-pointer"
            aria-label={`Adjust ${spec.name}`}
          />
          <div className="flex items-center bg-white border border-slate-300 rounded-md px-1.5 py-0.5 focus-within:border-[#1E4620]">
            <input
              type="number"
              min={spec.min}
              max={spec.max}
              step={spec.step}
              value={Number(currentVal.toFixed(spec.decimals ?? 1))}
              onChange={(e) => {
                const parsed = parseFloat(e.target.value);
                if (Number.isFinite(parsed)) {
                  const clamped = Math.max(spec.min * 0.2, Math.min(spec.max * 2, parsed));
                  onUpdate({ [activeKey]: clamped });
                }
              }}
              className="w-14 text-[11px] font-mono font-bold text-[#111827] bg-transparent outline-none tabular-nums text-right"
              aria-label={`${spec.name} numeric value`}
            />
            <span className="text-[10px] font-mono text-slate-500 ml-1">{spec.unit}</span>
          </div>
          {isDirty && (
            <button
              type="button"
              onClick={() => onUpdate({ [activeKey]: defaultVal })}
              className="px-1.5 py-0.5 rounded border border-slate-200 bg-white text-[9.5px] font-mono text-slate-600 hover:text-[#1E4620] cursor-pointer"
              title={`Reset ${spec.designator} to ${fmtCompVal(activeKey, defaultVal)}`}
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const ModDemodCircuitPanel: React.FC<{
  live: CircuitLiveData;
  circuitValues: CircuitComponentValues;
  onUpdateCircuit: (patch: Partial<CircuitComponentValues>) => void;
  onResetCircuit: () => void;
}> = ({ live, circuitValues, onUpdateCircuit, onResetCircuit }) => {
  const [viewMode, setViewMode] = useState<CircuitViewFilter>('both');
  const [expanded, setExpanded] = useState<boolean>(false);

  // Determine editable keys for current modulator & demodulator circuits
  const modKeys: ComponentKey[] = useMemo(() => {
    if (live.topic === 'motivation') {
      return ['fdmR1K', 'fdmR2K', 'fdmR3K', 'fdmRfK', 'fdmC1nF', 'fdmCoutUf'];
    }
    if (live.topic === 'conventional-am') {
      return live.amModulatorMode === 'square-law'
        ? ['amTxRsOhm', 'amTxVbbV', 'amTxRlK', 'amTxLtUh', 'amTxCtPf']
        : ['amTxR1K', 'amTxRfK', 'amTxLtUh', 'amTxCtPf'];
    }
    if (live.topic === 'dsb-sc') {
      return live.dsbTopology === 'ring'
        ? ['dsbTxRsOhm', 'dsbTxLfUh', 'dsbTxCfPf', 'dsbTxRlOhm']
        : ['dsbTxRsOhm', 'dsbTxR1K', 'dsbTxR2K', 'dsbTxCfPf', 'dsbTxRlOhm'];
    }
    if (live.topic === 'ssb') {
      return live.ssbMethod === 'phase'
        ? ['ssbTxChNf', 'ssbTxRhK', 'ssbTxR2K', 'ssbTxR3K', 'ssbTxRlOhm']
        : ['ssbTxCp1Pf', 'ssbTxCp2Pf', 'ssbTxRlOhm'];
    }
    return [
      'vsbRsOhm',
      'vsbC1Pf',
      'vsbL1Uh',
      'vsbL2Uh',
      'vsbC2Pf',
      'vsbC3Pf',
      'vsbRfK',
      'vsbCfPf',
      'vsbL3Uh',
      'vsbC4Pf',
      'vsbRlOhm',
    ];
  }, [live.topic, live.amModulatorMode, live.dsbTopology, live.ssbMethod]);

  const demodKeys: ComponentKey[] = useMemo(() => {
    if (live.topic === 'motivation') {
      return ['fdmLrxUh', 'fdmCvarScale', 'skR1K', 'skR2K', 'skCfNf', 'skC2Nf', 'skCoutUf'];
    }
    if (live.topic === 'conventional-am') {
      return ['amRxRsOhm', 'amRxCUf', 'amRxRlK', 'amRxCcUf', 'amRxRbK'];
    }
    if (live.topic === 'dsb-sc' && live.dsbRxMode === 'costas') {
      return ['dsbCostasRiK', 'dsbCostasCiNf', 'dsbCostasRqK', 'dsbCostasCqNf', 'dsbCostasRloopK'];
    }
    return ['skR1K', 'skR2K', 'skCfNf', 'skC2Nf', 'skCoutUf', 'skRlK'];
  }, [live.topic, live.dsbRxMode]);

  const [selectedModKey, setSelectedModKey] = useState<ComponentKey>(modKeys[0]);
  const [selectedDemodKey, setSelectedDemodKey] = useState<ComponentKey>(demodKeys[0]);

  useEffect(() => {
    if (!modKeys.includes(selectedModKey)) setSelectedModKey(modKeys[0]);
  }, [modKeys, selectedModKey]);

  useEffect(() => {
    if (!demodKeys.includes(selectedDemodKey)) setSelectedDemodKey(demodKeys[0]);
  }, [demodKeys, selectedDemodKey]);

  const isModModified = (k: ComponentKey) =>
    Math.abs(circuitValues[k] - DEFAULT_CIRCUIT_VALUES[k]) > 1e-4;

  const anyModified = useMemo(
    () => [...modKeys, ...demodKeys].some((k) => isModModified(k)),
    [modKeys, demodKeys, circuitValues]
  );

  const sampleIdx = 0;
  const mNow = getSample(live.mArr, sampleIdx);
  const cNow = getSample(live.cArr, sampleIdx);
  const sNow = getSample(live.sArr, sampleIdx);
  const yNow = getSample(live.yArr, sampleIdx);
  const rcNow = getSample(live.rcArr, sampleIdx);

  const fmtV = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}V`;
  const speed = live.simulationSpeed;
  const run = live.isSimulating;

  const skCutoffHz = useMemo(() => computeSallenKeyCutoffHz(circuitValues), [circuitValues]);

  const demodStatus = useMemo(() => {
    const yPeak = maxAbsOf(live.yArr);
    if (live.topic === 'conventional-am') {
      if (live.isOvermodulated) return { tag: 'CLIPPED (μ>1)', color: '#E11D48' };
      return { tag: 'ENV SYNC', color: '#15803D' };
    }
    if (live.topic === 'dsb-sc') {
      if (live.dsbRxMode === 'coherent' && Math.abs(live.loPhaseErrorDeg) === 90) {
        return { tag: 'QUAD NULL', color: '#D97706' };
      }
      if (live.dsbRxMode === 'costas') {
        return {
          tag: `LOCK ${(live.costasFinalPhaseDeg ?? 0).toFixed(1)}°`,
          color: Math.abs(live.costasFinalPhaseDeg ?? 0) < 8 ? '#15803D' : '#D97706',
        };
      }
      return {
        tag:
          yPeak < 0.06
            ? 'ATTENUATED'
            : `cos φ=${Math.cos((live.loPhaseErrorDeg * Math.PI) / 180).toFixed(2)}`,
        color: '#15803D',
      };
    }
    if (live.topic === 'ssb') {
      return {
        tag:
          Math.abs(live.ssbPhaseErrDeg) > 15
            ? `PHASE ERR ${live.ssbPhaseErrDeg}°`
            : `${live.ssbSideband} OK`,
        color: Math.abs(live.ssbPhaseErrDeg) > 15 ? '#D97706' : '#15803D',
      };
    }
    if (live.topic === 'vsb') {
      return {
        tag: Math.abs(live.vsbSkew) > 0.05 ? 'SKEW DIST' : 'SYM = 1.00',
        color: Math.abs(live.vsbSkew) > 0.05 ? '#D97706' : '#15803D',
      };
    }
    return { tag: `RX CH ${live.tunedChannelId}`, color: '#15803D' };
  }, [live]);

  const circuitMeta = useMemo(() => {
    if (live.topic === 'motivation') {
      const tuned =
        live.fdmChannels.find((c) => c.id === live.tunedChannelId) || live.fdmChannels[0];
      return {
        modTitle: 'FDM Transmitter (BJT Switch Mixers + Op-Amp Summing Amp + $\\lambda/4$ Ant)',
        modEq: '$s_{\\text{FDM}}(t) = \\sum_{k=1}^{3} (-\\frac{R_f}{R_k}) m_k(t)\\cos(2\\pi f_k t)$',
        demodTitle: `Tuned FDM Receiver (RLC Tank $f_${tuned.id}=${(tuned.fc / 1000).toFixed(1)}\\,\\text{kHz}$ + $Q_1$ + Sallen-Key LPF)`,
        demodEq: `$f_{\\text{LPF}} = ${(skCutoffHz / 1000).toFixed(2)}\\,\\text{kHz}$`,
        modDerived: `Rf = ${circuitValues.fdmRfK.toFixed(1)} kΩ`,
        demodDerived: `f_LPF = ${(skCutoffHz / 1000).toFixed(2)} kHz`,
      };
    }
    if (live.topic === 'conventional-am') {
      const diodeOn = sNow > rcNow - 0.01;
      const iDiodeMa = diodeOn ? Math.max(0, (sNow - rcNow) / (Math.max(10, circuitValues.amRxRsOhm) / 1000)) : 0;
      const iLoadMa = rcNow / Math.max(0.1, circuitValues.amRxRlK);
      const biasGain = circuitValues.amTxRfK / Math.max(0.5, circuitValues.amTxR1K);
      const effMu = live.amModulatorMode === 'linear' ? live.mu * biasGain : live.mu * (0.7 / Math.max(0.25, circuitValues.amTxVbbV));
      return {
        modTitle:
          live.amModulatorMode === 'square-law'
            ? 'Square-Law Modulator ($D_1$ Nonlinear + Parallel $L_t C_t$ Tuned Tank)'
            : 'Collector-Modulated Class-C BJT AM Stage (Op-Amp Summer + $Q_1$ + $L_t C_t$ Tank)',
        modEq: `$\\mu_{\\text{eff}} = ${effMu.toFixed(2)}$`,
        demodTitle: `Diode + $RC$ Envelope Detector ($D_1$: ${diodeOn ? 'ON' : 'OFF'} · $i_D=${iDiodeMa.toFixed(1)}\\,\\text{mA}$, $i_{R_l}=${iLoadMa.toFixed(2)}\\,\\text{mA}$)`,
        demodEq: `$\\tau = R_l C = ${(circuitValues.amRxRlK * circuitValues.amRxCUf).toFixed(2)}\\,\\text{ms}$`,
        modDerived: live.amModulatorMode === 'linear' ? `Gain = ${biasGain.toFixed(2)}×, μ_eff = ${effMu.toFixed(2)}` : `μ_eff = ${effMu.toFixed(2)}`,
        demodDerived: `τ = R_l·C = ${(circuitValues.amRxRlK * circuitValues.amRxCUf).toFixed(2)} ms`,
      };
    }
    if (live.topic === 'dsb-sc') {
      const topHalfOn = cNow >= 0;
      return {
        modTitle:
          live.dsbTopology === 'ring'
            ? `4-Diode Ring Modulator ($T_1$, $D_1\\text{–}D_4$, $T_2$ · $D_1,D_2$: ${topHalfOn ? 'ON' : 'OFF'})`
            : 'Balanced Diode Modulator ($T_1$, Opposing $D_1/D_2$, $T_2$ Carrier Null)',
        modEq:
          live.dsbTopology === 'ring'
            ? '$s_{\\text{ring}}(t) = m(t)\\,\\text{sgn}[\\cos(2\\pi f_c t)]$'
            : `$\\Delta R_{\\text{null}} = ${Math.abs(circuitValues.dsbTxR1K - circuitValues.dsbTxR2K).toFixed(2)}\\,\\text{k}\\Omega$`,
        demodTitle:
          live.dsbRxMode === 'costas'
            ? `Costas $I/Q$ Receiver (Mixers $Q_I/Q_Q$ + Active LPFs + VCO $\\phi_{\\text{lock}}=${(live.costasFinalPhaseDeg ?? 0).toFixed(1)}^\\circ$)`
            : `Coherent Synchronous Detector ($Q_1$ BJT Switch + Op-Amp Sallen-Key LPF, $\\phi=${live.loPhaseErrorDeg}^\\circ$)`,
        demodEq:
          live.dsbRxMode === 'costas'
            ? '$e_{\\text{VCO}}(t) = y_I(t)\\cdot y_Q(t) \\to 0$'
            : `$f_{\\text{LPF}} = ${(skCutoffHz / 1000).toFixed(2)}\\,\\text{kHz}$`,
        modDerived:
          live.dsbTopology === 'product'
            ? `Carrier Null Error: ${(((circuitValues.dsbTxR1K - circuitValues.dsbTxR2K) / (circuitValues.dsbTxR1K + circuitValues.dsbTxR2K)) * 100).toFixed(1)}%`
            : `Tank: ${circuitValues.dsbTxLfUh}μH / ${circuitValues.dsbTxCfPf}pF`,
        demodDerived:
          live.dsbRxMode === 'costas'
            ? `Loop Gain Scale: ${(2.2 / Math.max(0.2, circuitValues.dsbCostasRloopK)).toFixed(2)}×`
            : `f_LPF = ${(skCutoffHz / 1000).toFixed(2)} kHz`,
      };
    }
    if (live.topic === 'ssb') {
      return {
        modTitle:
          live.ssbMethod === 'phase'
            ? `SSB Phase-Shift Circuit (Op-Amp $-90^\\circ$ All-Pass + $Q_I/Q_Q$ + Op-Amp $\\Sigma$)`
            : `SSB Crystal Filter Circuit (Balanced Bridge + Dual-XTAL Ladder $X_1/X_2$)`,
        modEq:
          live.ssbSideband === 'USB'
            ? '$s_{\\text{USB}}(t) = \\frac{A_c}{2}[m(t)\\cos(\\omega_c t) - \\hat{m}(t)\\sin(\\omega_c t)]$'
            : '$s_{\\text{LSB}}(t) = \\frac{A_c}{2}[m(t)\\cos(\\omega_c t) + \\hat{m}(t)\\sin(\\omega_c t)]$',
        demodTitle: `Coherent SSB Detector ($Q_1$ Sync Mixer + Op-Amp Active LPF, $\\phi=${live.ssbPhaseErrDeg}^\\circ$)`,
        demodEq: `$f_{\\text{LPF}} = ${(skCutoffHz / 1000).toFixed(2)}\\,\\text{kHz}$`,
        modDerived:
          live.ssbMethod === 'phase'
            ? `R_H·C_H = ${(circuitValues.ssbTxRhK * circuitValues.ssbTxChNf).toFixed(0)} μs`
            : `Cp Avg = ${((circuitValues.ssbTxCp1Pf + circuitValues.ssbTxCp2Pf) / 2).toFixed(0)} pF`,
        demodDerived: `f_LPF = ${(skCutoffHz / 1000).toFixed(2)} kHz`,
      };
    }
    const lcScale = Math.sqrt((circuitValues.vsbL1Uh * circuitValues.vsbC1Pf) / (12 * 150));
    return {
      modTitle: 'Modified Circuit: VSB LC Shaping Network + Op-Amp Active Filter ($R_f \\parallel C_f$)',
      modEq: `$A_v \\propto R_f = ${circuitValues.vsbRfK.toFixed(2)}\\,\\text{k}\\Omega$`,
      demodTitle: 'VSB Coherent Synchronous Receiver ($Q_1$ Mixer + Sallen-Key Active LPF)',
      demodEq: `$f_{\\text{LPF}} = ${(skCutoffHz / 1000).toFixed(2)}\\,\\text{kHz}$`,
      modDerived: `LC Scale = ${lcScale.toFixed(2)}×, Gain = ${circuitValues.vsbRfK.toFixed(2)}×`,
      demodDerived: `f_LPF = ${(skCutoffHz / 1000).toFixed(2)} kHz`,
    };
  }, [live, sNow, rcNow, cNow, circuitValues, skCutoffHz]);

  const showMod = viewMode === 'both' || viewMode === 'mod';
  const showDemod = viewMode === 'both' || viewMode === 'demod';
  const svgH = expanded ? 370 : 285;

  // Circuit Output Oscilloscope Screen Zoom & Expanded Modal State
  const [modZoom, setModZoom] = useState<number>(1);
  const [demodZoom, setDemodZoom] = useState<number>(1);
  const [modalVZoom, setModalVZoom] = useState<number>(1);
  const [modalPanPct, setModalPanPct] = useState<number>(0);
  const [modalMode, setModalMode] = useState<'overlay' | 'stacked'>('overlay');
  const [scopeModal, setScopeModal] = useState<{
    stage: 'mod' | 'demod';
    label: string;
    color: string;
    refLabel?: string;
    statusTag?: string;
    statusColor?: string;
  } | null>(null);

  const stepZoom = (stage: 'mod' | 'demod', dir: 1 | -1) => {
    const setter = stage === 'mod' ? setModZoom : setDemodZoom;
    setter((curr) => {
      let bestIdx = 0;
      let bestDist = Infinity;
      SCOPE_ZOOM_LEVELS.forEach((lv, idx) => {
        const d = Math.abs(lv - curr);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = idx;
        }
      });
      const nextIdx = Math.max(0, Math.min(SCOPE_ZOOM_LEVELS.length - 1, bestIdx + dir));
      return SCOPE_ZOOM_LEVELS[nextIdx];
    });
  };

  const resetZoom = (stage: 'mod' | 'demod') => {
    if (stage === 'mod') setModZoom(1);
    else setDemodZoom(1);
  };

  const scopeContextValue = useMemo<CircuitScopeContextValue>(
    () => ({
      modZoom,
      demodZoom,
      stepZoom,
      resetZoom,
      openScopeModal: (payload) => {
        setModalPanPct(0);
        setModalVZoom(1);
        setScopeModal(payload);
      },
      longMArr: live.longMArr,
      longSArr: live.longSArr,
      longYArr: live.longYArr,
    }),
    [modZoom, demodZoom, live.longMArr, live.longSArr, live.longYArr]
  );

  const modalScopeData = useMemo(() => {
    if (!scopeModal) return null;
    const isMod = scopeModal.stage === 'mod';
    const zoom = isMod ? modZoom : demodZoom;
    const fullMain = isMod
      ? live.longSArr && live.longSArr.length > 0
        ? live.longSArr
        : live.sArr
      : live.longYArr && live.longYArr.length > 0
      ? live.longYArr
      : live.yArr;
    const fullRef =
      !isMod && scopeModal.refLabel
        ? live.longMArr && live.longMArr.length > 0
          ? live.longMArr
          : live.mArr
        : undefined;

    const totalLen = fullMain.length;
    const desiredCount = Math.min(
      totalLen,
      Math.max(40, Math.round(SCOPE_SAMPLES / Math.max(0.25, zoom)))
    );
    const maxStart = Math.max(0, totalLen - desiredCount);
    const startIdx = Math.min(maxStart, Math.round((modalPanPct / 100) * maxStart));
    const endIdx = Math.min(totalLen, startIdx + desiredCount);

    const tArr = new Array<number>(endIdx - startIdx);
    for (let i = startIdx; i < endIdx; i++) {
      tArr[i - startIdx] = i / SIM_FS;
    }

    const mainSlice = fullMain.slice(startIdx, endIdx);
    const refSlice = fullRef ? fullRef.slice(startIdx, endIdx) : undefined;

    const baseData = isMod ? live.sArr : live.yArr;
    const baseRef = !isMod && scopeModal.refLabel ? live.mArr : undefined;
    const peakBase = Math.max(0.2, maxAbsOf(baseData), maxAbsOf(baseRef));
    const nominalYBound = Math.ceil((peakBase * 1.15) / 0.5) * 0.5;
    const yBoundOverride = Number((nominalYBound / Math.max(0.25, modalVZoom)).toFixed(3));

    const traces: DarkTrace[] = [
      {
        id: 'circuit-modal-main',
        label: scopeModal.label,
        sublabel: isMod ? 'Circuit Modulated Output' : 'Circuit Demodulated Output',
        color: scopeModal.color,
        data: mainSlice,
      },
    ];
    if (refSlice && scopeModal.refLabel) {
      traces.push({
        id: 'circuit-modal-ref',
        label: scopeModal.refLabel,
        sublabel: 'Original Message Reference',
        color: '#0284C7',
        data: refSlice,
        lineDash: [5, 3],
        lineWidth: 1.5,
      });
    }

    return {
      zoom,
      winMs: ((endIdx - startIdx) / SIM_FS) * 1000,
      startMs: (startIdx / SIM_FS) * 1000,
      canPan: maxStart > 0,
      tArr,
      traces,
      yBoundOverride,
      vPeak: maxAbsOf(mainSlice),
    };
  }, [scopeModal, modZoom, demodZoom, modalPanPct, modalVZoom, live]);

  return (
    <CircuitScopeContext.Provider value={scopeContextValue}>
    <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-2.5">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400">
            INTERACTIVE COMPONENT SCHEMATICS · CLICK ANY COMPONENT TO EDIT
          </div>
          <div className="text-xs font-bold text-[#111827]">
            Modulation &amp; Demodulation Circuits
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {anyModified && (
            <button
              type="button"
              onClick={onResetCircuit}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-[10px] font-mono font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer"
              title="Reset all edited component values to defaults"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Reset R/L/C</span>
            </button>
          )}
          <div className="flex bg-white p-0.5 rounded-md border border-slate-200 text-[10px] font-medium">
            {(['both', 'mod', 'demod'] as CircuitViewFilter[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setViewMode(m)}
                className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  viewMode === m
                    ? 'bg-[#1E4620] text-white font-semibold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {m === 'both' ? 'Both' : m === 'mod' ? 'Mod' : 'Demod'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="p-1 rounded-md bg-white border border-slate-200 text-slate-500 hover:text-[#1E4620] cursor-pointer"
            title={expanded ? 'Compact circuit height' : 'Expand circuit height'}
          >
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* MODULATOR CIRCUIT CARD */}
      {showMod && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] border-b border-slate-100 pb-1.5">
            <span className="font-semibold text-[#111827]">
              <LatexText text={circuitMeta.modTitle} />
            </span>
            <span className="text-[10px] text-[#1E4620]">
              <LatexText text={circuitMeta.modEq} />
            </span>
          </div>

          <svg viewBox="0 0 900 310" className="w-full block" style={{ height: `${svgH}px` }}>
            {/* TOPIC 01: FDM TRANSMITTER */}
            {live.topic === 'motivation' && (
              <>
                {live.fdmChannels.map((ch, idx) => {
                  const cy = 62 + idx * 92;
                  const rKey = (['fdmR1K', 'fdmR2K', 'fdmR3K'] as ComponentKey[])[idx];
                  const cKey = (['fdmC1nF', 'fdmC2nF', 'fdmC3nF'] as ComponentKey[])[idx];
                  return (
                    <g key={ch.id}>
                      <ACSourceSymbol
                        x={48}
                        y={cy}
                        label={`m${ch.id}(t)`}
                        sub={`${(ch.fm / 1000).toFixed(1)}k`}
                        color={ch.enabled ? '#0284C7' : '#94A3B8'}
                      />
                      <LiveWire
                        d={`M 63 ${cy} L 185 ${cy}`}
                        color="#0284C7"
                        active={ch.enabled}
                        isSimulating={run}
                        speed={speed}
                      />
                      <CapacitorSymbol
                        x={124}
                        y={cy}
                        vertical={false}
                        label={`C${ch.id}`}
                        sub={fmtCompVal(cKey, circuitValues[cKey])}
                        editKey={cKey}
                        selectedKey={selectedModKey}
                        isModified={isModModified(cKey)}
                        onSelectEdit={setSelectedModKey}
                      />
                      <TransistorSymbol
                        x={204}
                        y={cy}
                        label={`Q${ch.id}`}
                        sub={`LO ${(ch.fc / 1000).toFixed(1)}k`}
                      />
                      <line x1={211} y1={cy + 22} x2={211} y2={cy + 30} stroke="#334155" strokeWidth="1.5" />
                      <circle cx={211} cy={cy + 31} r={2.4} fill="#7C3AED" />

                      <LiveWire
                        d={`M 211 ${cy - 22} L 211 ${cy - 32} L 414 ${cy - 32} L 414 140 L 450 140`}
                        color={ch.color}
                        active={ch.enabled}
                        isSimulating={run}
                        speed={speed}
                      />
                      <ResistorSymbol
                        x={318}
                        y={cy - 32}
                        label={`R${ch.id}`}
                        sub={ch.enabled ? fmtCompVal(rKey, circuitValues[rKey]) : 'OPEN'}
                        color={ch.enabled ? '#1E293B' : '#94A3B8'}
                        editKey={rKey}
                        selectedKey={selectedModKey}
                        isModified={isModModified(rKey)}
                        onSelectEdit={setSelectedModKey}
                      />
                    </g>
                  );
                })}

                <NodeDot x={414} y={140} color="#1E293B" />
                <OpAmpSymbol x={474} y={152} topSign="−" label="Summing Amp" />
                <line x1={450} y1={164} x2={428} y2={164} stroke="#334155" strokeWidth="1.7" />
                <line x1={428} y1={164} x2={428} y2={198} stroke="#334155" strokeWidth="1.7" />
                <GroundSymbol x={428} y={198} />

                <path d="M 428 140 L 428 74 L 522 74 L 522 152" fill="none" stroke="#334155" strokeWidth="1.6" />
                <NodeDot x={428} y={140} color="#1E293B" />
                <NodeDot x={522} y={152} color="#15803D" />
                <ResistorSymbol
                  x={475}
                  y={74}
                  label="R_f"
                  sub={fmtCompVal('fdmRfK', circuitValues.fdmRfK)}
                  editKey="fdmRfK"
                  selectedKey={selectedModKey}
                  isModified={isModModified('fdmRfK')}
                  onSelectEdit={setSelectedModKey}
                />

                <LiveWire d="M 498 152 L 734 152" color="#15803D" isSimulating={run} speed={speed} />
                <CapacitorSymbol
                  x={576}
                  y={152}
                  vertical={false}
                  label="C_out"
                  sub={fmtCompVal('fdmCoutUf', circuitValues.fdmCoutUf)}
                  editKey="fdmCoutUf"
                  selectedKey={selectedModKey}
                  isModified={isModModified('fdmCoutUf')}
                  onSelectEdit={setSelectedModKey}
                />
                <NodeDot x={652} y={152} color="#15803D" />
                <line x1={652} y1={152} x2={652} y2={48} stroke="#1E4620" strokeWidth="2.5" />
                <path d="M 636 64 L 652 48 L 668 64" fill="none" stroke="#1E4620" strokeWidth="1.8" />
                <path d="M 664 42 Q 678 54 664 66" fill="none" stroke="#15803D" strokeWidth="1.5" />
                <text x={652} y={176} textAnchor="middle" className="fill-slate-700 text-[9.5px] font-mono font-bold">
                  λ/4 Ant
                </text>
                <text x={652} y={190} textAnchor="middle" className="fill-[#1E4620] text-[9px] font-mono">
                  {live.antennaQuarterWaveM && live.antennaQuarterWaveM >= 1000
                    ? `${(live.antennaQuarterWaveM / 1000).toFixed(1)} km`
                    : `${(live.antennaQuarterWaveM ?? 75).toFixed(1)} m`}
                </text>

                <OutputScopeProbe
                  x={734}
                  y={82}
                  data={live.sArr}
                  color="#15803D"
                  label="s_FDM(t)"
                  valText={fmtV(sNow)}
                  statusTag={live.fdmOverlaps.length > 0 ? 'COLLISION' : 'FDM OK'}
                  statusColor={live.fdmOverlaps.length > 0 ? '#E11D48' : '#15803D'}
                />
              </>
            )}

            {/* TOPIC 02: SQUARE-LAW DIODE MODULATOR */}
            {live.topic === 'conventional-am' && live.amModulatorMode === 'square-law' && (
              <>
                <ACSourceSymbol x={56} y={80} label="m(t)" sub={`${(live.fm / 1000).toFixed(1)}kHz`} color="#0284C7" />
                <LiveWire d="M 56 95 L 56 135" color="#0284C7" isSimulating={run} speed={speed} />
                <ACSourceSymbol x={56} y={150} label="c(t)" sub={`${(live.fc / 1000).toFixed(0)}kHz`} color="#7C3AED" labelLeft />
                <LiveWire d="M 56 165 L 56 205" color="#7C3AED" isSimulating={run} speed={speed} />
                <ACSourceSymbol
                  x={56}
                  y={220}
                  label="V_BB"
                  sub={fmtCompVal('amTxVbbV', circuitValues.amTxVbbV)}
                  color="#D97706"
                  isDC
                  labelLeft
                  editKey="amTxVbbV"
                  selectedKey={selectedModKey}
                  isModified={isModModified('amTxVbbV')}
                  onSelectEdit={setSelectedModKey}
                />
                <line x1={56} y1={235} x2={56} y2={260} stroke="#334155" strokeWidth="1.6" />
                <GroundSymbol x={56} y={260} />

                <LiveWire d="M 71 80 L 734 80" color="#D97706" isSimulating={run} speed={speed} />
                <ResistorSymbol
                  x={132}
                  y={80}
                  label="R_s"
                  sub={fmtCompVal('amTxRsOhm', circuitValues.amTxRsOhm)}
                  editKey="amTxRsOhm"
                  selectedKey={selectedModKey}
                  isModified={isModModified('amTxRsOhm')}
                  onSelectEdit={setSelectedModKey}
                />
                <CapacitorSymbol x={210} y={80} vertical={false} label="C_1" sub="10 nF" />
                <DiodeSymbol x={292} y={80} label="D₁ (1N4148)" sub="Sq-Law" conducting />

                <NodeDot x={372} y={80} color="#D97706" />
                <LiveWire d="M 372 80 L 372 252" color="#D97706" isSimulating={run} speed={speed} />
                <ResistorSymbol
                  x={372}
                  y={166}
                  vertical
                  label="R_L"
                  sub={fmtCompVal('amTxRlK', circuitValues.amTxRlK)}
                  editKey="amTxRlK"
                  selectedKey={selectedModKey}
                  isModified={isModModified('amTxRlK')}
                  onSelectEdit={setSelectedModKey}
                />
                <GroundSymbol x={372} y={252} />

                <CapacitorSymbol x={440} y={80} vertical={false} label="C_2" sub="47 pF" />
                <NodeDot x={508} y={80} color="#15803D" />
                <LiveWire d="M 508 80 L 508 252" color="#15803D" isSimulating={run} speed={speed} />
                <InductorSymbol
                  x={508}
                  y={166}
                  vertical
                  label="L_t"
                  sub={fmtCompVal('amTxLtUh', circuitValues.amTxLtUh)}
                  editKey="amTxLtUh"
                  selectedKey={selectedModKey}
                  isModified={isModModified('amTxLtUh')}
                  onSelectEdit={setSelectedModKey}
                />
                <GroundSymbol x={508} y={252} />

                <NodeDot x={586} y={80} color="#15803D" />
                <LiveWire d="M 586 80 L 586 252" color="#15803D" isSimulating={run} speed={speed} />
                <CapacitorSymbol
                  x={586}
                  y={166}
                  vertical
                  label="C_t"
                  sub={fmtCompVal('amTxCtPf', circuitValues.amTxCtPf)}
                  editKey="amTxCtPf"
                  selectedKey={selectedModKey}
                  isModified={isModModified('amTxCtPf')}
                  onSelectEdit={setSelectedModKey}
                />
                <GroundSymbol x={586} y={252} />

                <CapacitorSymbol x={658} y={80} vertical={false} label="C_out" sub="0.1 μF" />
                <LiveWire d="M 712 80 L 712 138 L 734 138" color="#15803D" isSimulating={run} speed={speed} />

                <text x={547} y={288} textAnchor="middle" className="fill-slate-600 text-[9.5px] font-mono font-semibold">
                  Parallel LC Tank BPF (@ fc)
                </text>

                <OutputScopeProbe
                  x={734}
                  y={82}
                  data={live.sArr}
                  color="#15803D"
                  label="s(t) AM Out"
                  valText={fmtV(sNow)}
                  statusTag={`μ=${(live.mu * (0.7 / circuitValues.amTxVbbV)).toFixed(2)}`}
                  statusColor={live.isOvermodulated ? '#E11D48' : '#15803D'}
                />
              </>
            )}

            {/* TOPIC 02: COLLECTOR-MODULATED CLASS-C BJT AM MODULATOR */}
            {live.topic === 'conventional-am' && live.amModulatorMode === 'linear' && (
              <>
                <ACSourceSymbol x={48} y={96} label="m(t)" sub={`${(live.fm / 1000).toFixed(1)}kHz`} color="#0284C7" />
                <line x1={48} y1={111} x2={48} y2={148} stroke="#334155" strokeWidth="1.6" />
                <GroundSymbol x={48} y={148} />

                <LiveWire d="M 63 96 L 178 96" color="#0284C7" isSimulating={run} speed={speed} />
                <ResistorSymbol
                  x={122}
                  y={96}
                  label="R_1"
                  sub={fmtCompVal('amTxR1K', circuitValues.amTxR1K)}
                  editKey="amTxR1K"
                  selectedKey={selectedModKey}
                  isModified={isModModified('amTxR1K')}
                  onSelectEdit={setSelectedModKey}
                />

                <OpAmpSymbol x={202} y={108} topSign="+" label="Bias Amp" showRails={false} />
                <line x1={178} y1={120} x2={156} y2={120} stroke="#334155" strokeWidth="1.6" />
                <line x1={156} y1={120} x2={156} y2={154} stroke="#334155" strokeWidth="1.6" />
                <GroundSymbol x={156} y={154} />

                <path d="M 166 96 L 166 48 L 242 48 L 242 108" fill="none" stroke="#334155" strokeWidth="1.5" />
                <NodeDot x={166} y={96} color="#1E293B" />
                <NodeDot x={242} y={108} color="#D97706" />
                <ResistorSymbol
                  x={204}
                  y={48}
                  label="R_f"
                  sub={fmtCompVal('amTxRfK', circuitValues.amTxRfK)}
                  editKey="amTxRfK"
                  selectedKey={selectedModKey}
                  isModified={isModModified('amTxRfK')}
                  onSelectEdit={setSelectedModKey}
                />

                <LiveWire d="M 226 108 L 410 108 L 410 144" color="#D97706" isSimulating={run} speed={speed} />
                <InductorSymbol x={324} y={108} label="L_RFC" sub="1 mH" />

                <ACSourceSymbol x={262} y={176} label="c(t)" sub={`${(live.fc / 1000).toFixed(0)}kHz`} color="#7C3AED" />
                <line x1={262} y1={191} x2={262} y2={224} stroke="#334155" strokeWidth="1.6" />
                <GroundSymbol x={262} y={224} />
                <LiveWire d="M 277 176 L 384 176" color="#7C3AED" isSimulating={run} speed={speed} />
                <CapacitorSymbol x={332} y={176} vertical={false} label="C_b" sub="10 nF" />

                <TransistorSymbol x={403} y={176} label="Q₁" sub="2N2222" />
                <LiveWire d="M 410 198 L 410 264" color="#334155" isSimulating={run} speed={speed} />
                <ResistorSymbol x={410} y={230} vertical label="R_E" sub="100 Ω" />
                <GroundSymbol x={410} y={264} />

                <LiveWire d="M 410 144 L 734 144" color="#15803D" isSimulating={run} speed={speed} />
                <CapacitorSymbol x={476} y={144} vertical={false} label="C_3" sub="150 pF" />
                <NodeDot x={538} y={144} color="#15803D" />
                <LiveWire d="M 538 144 L 538 264" color="#15803D" isSimulating={run} speed={speed} />
                <InductorSymbol
                  x={538}
                  y={204}
                  vertical
                  label="L_t"
                  sub={fmtCompVal('amTxLtUh', circuitValues.amTxLtUh)}
                  editKey="amTxLtUh"
                  selectedKey={selectedModKey}
                  isModified={isModModified('amTxLtUh')}
                  onSelectEdit={setSelectedModKey}
                />
                <GroundSymbol x={538} y={264} />

                <NodeDot x={614} y={144} color="#15803D" />
                <LiveWire d="M 614 144 L 614 264" color="#15803D" isSimulating={run} speed={speed} />
                <CapacitorSymbol
                  x={614}
                  y={204}
                  vertical
                  label="C_t"
                  sub={fmtCompVal('amTxCtPf', circuitValues.amTxCtPf)}
                  editKey="amTxCtPf"
                  selectedKey={selectedModKey}
                  isModified={isModModified('amTxCtPf')}
                  onSelectEdit={setSelectedModKey}
                />
                <GroundSymbol x={614} y={264} />

                <CapacitorSymbol x={678} y={144} vertical={false} label="C_out" sub="0.1 μF" />

                <OutputScopeProbe
                  x={734}
                  y={82}
                  data={live.sArr}
                  color="#15803D"
                  label="s(t) DSB-FC"
                  valText={fmtV(sNow)}
                  statusTag={`μ=${(live.mu * (circuitValues.amTxRfK / Math.max(0.5, circuitValues.amTxR1K))).toFixed(2)}`}
                  statusColor={live.isOvermodulated ? '#E11D48' : '#15803D'}
                />
              </>
            )}

            {/* TOPIC 03: 4-DIODE BALANCED RING MODULATOR */}
            {live.topic === 'dsb-sc' && live.dsbTopology === 'ring' && (
              <>
                <ACSourceSymbol x={48} y={142} label="m(t)" sub={fmtV(mNow)} color="#0284C7" />
                <line x1={48} y1={157} x2={48} y2={196} stroke="#334155" strokeWidth="1.6" />
                <GroundSymbol x={48} y={196} />

                <LiveWire d="M 63 142 L 154 142" color="#0284C7" isSimulating={run} speed={speed} />
                <ResistorSymbol
                  x={108}
                  y={142}
                  label="R_s"
                  sub={fmtCompVal('dsbTxRsOhm', circuitValues.dsbTxRsOhm)}
                  editKey="dsbTxRsOhm"
                  selectedKey={selectedModKey}
                  isModified={isModModified('dsbTxRsOhm')}
                  onSelectEdit={setSelectedModKey}
                />
                <TransformerSymbol x={168} y={142} label="T₁" centerTapSide="right" />

                <LiveWire
                  d="M 182 106 L 408 106"
                  color={cNow >= 0 ? '#15803D' : '#94A3B8'}
                  active={cNow >= 0}
                  isSimulating={run}
                  speed={speed}
                />
                <LiveWire
                  d="M 182 178 L 408 178"
                  color={cNow >= 0 ? '#15803D' : '#94A3B8'}
                  active={cNow >= 0}
                  isSimulating={run}
                  speed={speed}
                />
                <LiveWire
                  d="M 182 106 L 408 178"
                  color={cNow < 0 ? '#D97706' : '#CBD5E1'}
                  active={cNow < 0}
                  isSimulating={run}
                  speed={speed}
                />
                <LiveWire
                  d="M 182 178 L 408 106"
                  color={cNow < 0 ? '#D97706' : '#CBD5E1'}
                  active={cNow < 0}
                  isSimulating={run}
                  speed={speed}
                />

                <DiodeSymbol x={295} y={106} label="D₁" conducting={cNow >= 0} />
                <DiodeSymbol x={295} y={178} label="D₂" conducting={cNow >= 0} reverseDir />
                <DiodeSymbol x={242} y={125} label="D₃" conducting={cNow < 0} angleDeg={17.5} />
                <DiodeSymbol x={348} y={125} label="D₄" conducting={cNow < 0} angleDeg={-17.5} reverseDir />

                <ACSourceSymbol
                  x={295}
                  y={254}
                  label="c(t)"
                  sub={cNow >= 0 ? '+Half' : '−Half'}
                  color="#7C3AED"
                />
                <LiveWire d="M 280 254 L 182 254 L 182 142" color="#7C3AED" isSimulating={run} speed={speed} />
                <LiveWire d="M 310 254 L 408 254 L 408 142" color="#7C3AED" isSimulating={run} speed={speed} />

                <TransformerSymbol x={422} y={142} label="T₂" centerTapSide="left" />
                <LiveWire d="M 436 142 L 734 142" color="#15803D" isSimulating={run} speed={speed} />

                {live.ringFiltered ? (
                  <>
                    <InductorSymbol
                      x={504}
                      y={142}
                      label="L_f"
                      sub={fmtCompVal('dsbTxLfUh', circuitValues.dsbTxLfUh)}
                      editKey="dsbTxLfUh"
                      selectedKey={selectedModKey}
                      isModified={isModModified('dsbTxLfUh')}
                      onSelectEdit={setSelectedModKey}
                    />
                    <NodeDot x={578} y={142} color="#15803D" />
                    <LiveWire d="M 578 142 L 578 248" color="#15803D" isSimulating={run} speed={speed} />
                    <CapacitorSymbol
                      x={578}
                      y={196}
                      vertical
                      label="C_f"
                      sub={fmtCompVal('dsbTxCfPf', circuitValues.dsbTxCfPf)}
                      editKey="dsbTxCfPf"
                      selectedKey={selectedModKey}
                      isModified={isModModified('dsbTxCfPf')}
                      onSelectEdit={setSelectedModKey}
                    />
                    <GroundSymbol x={578} y={248} />
                  </>
                ) : (
                  <text x={550} y={118} textAnchor="middle" className="fill-amber-700 text-[10px] font-mono font-bold">
                    BPF Bypassed (3f_c, 5f_c)
                  </text>
                )}

                <NodeDot x={662} y={142} color="#15803D" />
                <LiveWire d="M 662 142 L 662 248" color="#15803D" isSimulating={run} speed={speed} />
                <ResistorSymbol
                  x={662}
                  y={196}
                  vertical
                  label="R_L"
                  sub={fmtCompVal('dsbTxRlOhm', circuitValues.dsbTxRlOhm)}
                  editKey="dsbTxRlOhm"
                  selectedKey={selectedModKey}
                  isModified={isModModified('dsbTxRlOhm')}
                  onSelectEdit={setSelectedModKey}
                />
                <GroundSymbol x={662} y={248} />

                <OutputScopeProbe
                  x={734}
                  y={82}
                  data={live.sArr}
                  color="#15803D"
                  label="s(t) Ring"
                  valText={fmtV(sNow)}
                  statusTag={live.ringFiltered ? 'BPF @ fc' : 'RAW SQ'}
                />
              </>
            )}

            {/* TOPIC 03: BALANCED DIODE MODULATOR */}
            {live.topic === 'dsb-sc' && live.dsbTopology === 'product' && (
              <>
                <ACSourceSymbol x={48} y={142} label="m(t)" sub={`${(live.fm / 1000).toFixed(1)}kHz`} color="#0284C7" />
                <line x1={48} y1={157} x2={48} y2={196} stroke="#334155" strokeWidth="1.6" />
                <GroundSymbol x={48} y={196} />
                <LiveWire d="M 63 142 L 160 142" color="#0284C7" isSimulating={run} speed={speed} />
                <ResistorSymbol
                  x={112}
                  y={142}
                  label="R_in"
                  sub={fmtCompVal('dsbTxRsOhm', circuitValues.dsbTxRsOhm)}
                  editKey="dsbTxRsOhm"
                  selectedKey={selectedModKey}
                  isModified={isModModified('dsbTxRsOhm')}
                  onSelectEdit={setSelectedModKey}
                />

                <TransformerSymbol x={174} y={142} label="T₁" centerTapSide="right" />

                <LiveWire d="M 188 106 L 424 106" color="#15803D" isSimulating={run} speed={speed} />
                <LiveWire d="M 188 178 L 424 178" color="#D97706" isSimulating={run} speed={speed} />
                <DiodeSymbol x={262} y={106} label="D₁" sub="1N4148" conducting />
                <DiodeSymbol x={262} y={178} label="D₂" sub="1N4148" conducting reverseDir />
                <ResistorSymbol
                  x={358}
                  y={106}
                  label="R₁"
                  sub={fmtCompVal('dsbTxR1K', circuitValues.dsbTxR1K)}
                  editKey="dsbTxR1K"
                  selectedKey={selectedModKey}
                  isModified={isModModified('dsbTxR1K')}
                  onSelectEdit={setSelectedModKey}
                />
                <ResistorSymbol
                  x={358}
                  y={178}
                  label="R₂"
                  sub={fmtCompVal('dsbTxR2K', circuitValues.dsbTxR2K)}
                  editKey="dsbTxR2K"
                  selectedKey={selectedModKey}
                  isModified={isModModified('dsbTxR2K')}
                  onSelectEdit={setSelectedModKey}
                />

                <ACSourceSymbol x={306} y={254} label="c(t)" sub={`${(live.fc / 1000).toFixed(0)}kHz`} color="#7C3AED" />
                <LiveWire d="M 291 254 L 188 254 L 188 142" color="#7C3AED" isSimulating={run} speed={speed} />
                <LiveWire d="M 321 254 L 424 254 L 424 142" color="#7C3AED" isSimulating={run} speed={speed} />

                <TransformerSymbol x={438} y={142} label="T₂ (Null)" centerTapSide="left" />

                <LiveWire d="M 452 142 L 734 142" color="#15803D" isSimulating={run} speed={speed} />
                <NodeDot x={516} y={142} color="#15803D" />
                <LiveWire d="M 516 142 L 516 248" color="#15803D" isSimulating={run} speed={speed} />
                <CapacitorSymbol
                  x={516}
                  y={196}
                  vertical
                  label="C_t"
                  sub={fmtCompVal('dsbTxCfPf', circuitValues.dsbTxCfPf)}
                  editKey="dsbTxCfPf"
                  selectedKey={selectedModKey}
                  isModified={isModModified('dsbTxCfPf')}
                  onSelectEdit={setSelectedModKey}
                />
                <GroundSymbol x={516} y={248} />

                <CapacitorSymbol x={592} y={142} vertical={false} label="C_out" sub="0.1 μF" />
                <NodeDot x={662} y={142} color="#15803D" />
                <LiveWire d="M 662 142 L 662 248" color="#15803D" isSimulating={run} speed={speed} />
                <ResistorSymbol
                  x={662}
                  y={196}
                  vertical
                  label="R_L"
                  sub={fmtCompVal('dsbTxRlOhm', circuitValues.dsbTxRlOhm)}
                  editKey="dsbTxRlOhm"
                  selectedKey={selectedModKey}
                  isModified={isModModified('dsbTxRlOhm')}
                  onSelectEdit={setSelectedModKey}
                />
                <GroundSymbol x={662} y={248} />

                <OutputScopeProbe
                  x={734}
                  y={82}
                  data={live.sArr}
                  color="#15803D"
                  label="s(t) DSB-SC"
                  valText={fmtV(sNow)}
                  statusTag={
                    Math.abs(circuitValues.dsbTxR1K - circuitValues.dsbTxR2K) > 0.05
                      ? 'CARRIER LEAK'
                      : 'CARRIER NULL'
                  }
                  statusColor={
                    Math.abs(circuitValues.dsbTxR1K - circuitValues.dsbTxR2K) > 0.05
                      ? '#D97706'
                      : '#15803D'
                  }
                />
              </>
            )}

            {/* TOPIC 04: SSB PHASE-SHIFT CIRCUIT */}
            {live.topic === 'ssb' && live.ssbMethod === 'phase' && (
              <>
                <ACSourceSymbol x={46} y={76} label="m(t)" sub={fmtV(mNow)} color="#0284C7" />
                <LiveWire d="M 61 76 L 340 76" color="#0284C7" isSimulating={run} speed={speed} />
                <ResistorSymbol x={158} y={76} label="R₁" sub="10 kΩ" />

                <NodeDot x={94} y={76} color="#0284C7" />
                <LiveWire d="M 94 76 L 94 206 L 204 206" color="#0284C7" isSimulating={run} speed={speed} />
                <CapacitorSymbol
                  x={148}
                  y={206}
                  vertical={false}
                  label="C_H"
                  sub={fmtCompVal('ssbTxChNf', circuitValues.ssbTxChNf)}
                  editKey="ssbTxChNf"
                  selectedKey={selectedModKey}
                  isModified={isModModified('ssbTxChNf')}
                  onSelectEdit={setSelectedModKey}
                />
                <OpAmpSymbol x={228} y={216} topSign="+" label="−90° All-Pass" showRails={false} />
                <line x1={204} y1={226} x2={182} y2={226} stroke="#334155" strokeWidth="1.5" />
                <line x1={182} y1={226} x2={182} y2={278} stroke="#334155" strokeWidth="1.5" />
                <ResistorSymbol
                  x={182}
                  y={252}
                  vertical
                  label="R_H"
                  sub={fmtCompVal('ssbTxRhK', circuitValues.ssbTxRhK)}
                  labelSide="left"
                  editKey="ssbTxRhK"
                  selectedKey={selectedModKey}
                  isModified={isModModified('ssbTxRhK')}
                  onSelectEdit={setSelectedModKey}
                />
                <GroundSymbol x={182} y={278} />
                <LiveWire d="M 252 216 L 340 216" color="#7C3AED" isSimulating={run} speed={speed} />

                <TransistorSymbol x={358} y={76} label="Q_I" sub="Cos" />
                <TransistorSymbol x={358} y={216} label="Q_Q" sub="Sin" />

                <ACSourceSymbol x={450} y={146} label="LO" sub={`${(live.fc / 1000).toFixed(0)}k`} color="#7C3AED" />
                <LiveWire d="M 435 146 L 365 146 L 365 98" color="#7C3AED" isSimulating={run} speed={speed} />
                <LiveWire d="M 450 161 L 450 258 L 365 258 L 365 238" color="#7C3AED" isSimulating={run} speed={speed} />
                <CapacitorSymbol x={408} y={258} vertical={false} label="C_rf" sub="−90°" />

                <LiveWire d="M 365 54 L 365 38 L 538 38 L 538 134 L 564 134" color="#15803D" isSimulating={run} speed={speed} />
                <ResistorSymbol
                  x={456}
                  y={38}
                  label="R₂"
                  sub={fmtCompVal('ssbTxR2K', circuitValues.ssbTxR2K)}
                  editKey="ssbTxR2K"
                  selectedKey={selectedModKey}
                  isModified={isModModified('ssbTxR2K')}
                  onSelectEdit={setSelectedModKey}
                />
                <LiveWire d="M 365 194 L 365 158 L 564 158" color="#D97706" isSimulating={run} speed={speed} />
                <ResistorSymbol
                  x={508}
                  y={158}
                  label="R₃"
                  sub={fmtCompVal('ssbTxR3K', circuitValues.ssbTxR3K)}
                  editKey="ssbTxR3K"
                  selectedKey={selectedModKey}
                  isModified={isModModified('ssbTxR3K')}
                  onSelectEdit={setSelectedModKey}
                />

                <OpAmpSymbol
                  x={588}
                  y={146}
                  topSign={live.ssbSideband === 'USB' ? '−' : '+'}
                  label={`${live.ssbSideband} Sum`}
                />
                <LiveWire d="M 612 146 L 734 146" color="#15803D" isSimulating={run} speed={speed} />
                <ResistorSymbol
                  x={672}
                  y={146}
                  label="R_L"
                  sub={fmtCompVal('ssbTxRlOhm', circuitValues.ssbTxRlOhm)}
                  editKey="ssbTxRlOhm"
                  selectedKey={selectedModKey}
                  isModified={isModModified('ssbTxRlOhm')}
                  onSelectEdit={setSelectedModKey}
                />

                <OutputScopeProbe
                  x={734}
                  y={82}
                  data={live.sArr}
                  color="#15803D"
                  label={`s_${live.ssbSideband}(t)`}
                  valText={fmtV(sNow)}
                  statusTag="HILBERT"
                />
              </>
            )}

            {/* TOPIC 04: SSB CRYSTAL FILTER CIRCUIT */}
            {live.topic === 'ssb' && live.ssbMethod === 'frequency' && (
              <>
                <ACSourceSymbol x={48} y={142} label="m(t)" sub={`gap ${live.ssbEnergyGapHz}Hz`} color="#0284C7" />
                <line x1={48} y1={157} x2={48} y2={196} stroke="#334155" strokeWidth="1.6" />
                <GroundSymbol x={48} y={196} />
                <LiveWire d="M 63 142 L 174 142" color="#0284C7" isSimulating={run} speed={speed} />
                <ResistorSymbol x={118} y={142} label="R_s" sub="600 Ω" />

                <TransistorSymbol x={192} y={142} label="Q₁" sub="Bal Mix" />
                <ACSourceSymbol x={199} y={244} label="c(t)" sub={`${(live.fc / 1000).toFixed(0)}kHz`} color="#7C3AED" />
                <LiveWire d="M 199 229 L 199 164" color="#7C3AED" isSimulating={run} speed={speed} />

                <LiveWire d="M 199 120 L 199 96 L 714 96 L 714 140 L 734 140" color="#15803D" isSimulating={run} speed={speed} />
                <CapacitorSymbol x={256} y={96} vertical={false} label="C₁" sub="47 pF" />
                <CrystalSymbol x={332} y={96} label="X₁" sub={live.ssbSideband} />

                <NodeDot x={400} y={96} color="#15803D" />
                <LiveWire d="M 400 96 L 400 244" color="#15803D" isSimulating={run} speed={speed} />
                <CapacitorSymbol
                  x={400}
                  y={170}
                  vertical
                  label="C_p1"
                  sub={fmtCompVal('ssbTxCp1Pf', circuitValues.ssbTxCp1Pf)}
                  editKey="ssbTxCp1Pf"
                  selectedKey={selectedModKey}
                  isModified={isModModified('ssbTxCp1Pf')}
                  onSelectEdit={setSelectedModKey}
                />
                <GroundSymbol x={400} y={244} />

                <CrystalSymbol x={474} y={96} label="X₂" sub={`Ord ${live.ssbFilterOrder}`} />

                <NodeDot x={542} y={96} color="#15803D" />
                <LiveWire d="M 542 96 L 542 244" color="#15803D" isSimulating={run} speed={speed} />
                <CapacitorSymbol
                  x={542}
                  y={170}
                  vertical
                  label="C_p2"
                  sub={fmtCompVal('ssbTxCp2Pf', circuitValues.ssbTxCp2Pf)}
                  editKey="ssbTxCp2Pf"
                  selectedKey={selectedModKey}
                  isModified={isModModified('ssbTxCp2Pf')}
                  onSelectEdit={setSelectedModKey}
                />
                <GroundSymbol x={542} y={244} />

                <CapacitorSymbol x={610} y={96} vertical={false} label="C_out" sub="0.1 μF" />
                <NodeDot x={668} y={96} color="#15803D" />
                <LiveWire d="M 668 96 L 668 244" color="#15803D" isSimulating={run} speed={speed} />
                <ResistorSymbol
                  x={668}
                  y={170}
                  vertical
                  label="R_L"
                  sub={fmtCompVal('ssbTxRlOhm', circuitValues.ssbTxRlOhm)}
                  editKey="ssbTxRlOhm"
                  selectedKey={selectedModKey}
                  isModified={isModModified('ssbTxRlOhm')}
                  onSelectEdit={setSelectedModKey}
                />
                <GroundSymbol x={668} y={244} />

                <text x={490} y={288} textAnchor="middle" className="fill-slate-600 text-[9.5px] font-mono font-semibold">
                  Quartz Crystal Ladder Bandpass Filter
                </text>

                <OutputScopeProbe
                  x={734}
                  y={82}
                  data={live.sArr}
                  color="#15803D"
                  label={`s_${live.ssbSideband}(t)`}
                  valText={fmtV(sNow)}
                  statusTag={`ORD ${live.ssbFilterOrder}`}
                />
              </>
            )}

            {/* TOPIC 05: VSB SHAPING FILTER (100% Editable Components) */}
            {live.topic === 'vsb' && (
              <>
                <ACSourceSymbol x={44} y={148} label="v_in" sub="m·c(t)" color="#0284C7" />
                <line x1={44} y1={163} x2={44} y2={244} stroke="#334155" strokeWidth="1.6" />
                <GroundSymbol x={44} y={244} />

                <LiveWire d="M 59 148 L 480 148" color="#D97706" isSimulating={run} speed={speed} />
                <ResistorSymbol
                  x={102}
                  y={148}
                  label="R_S"
                  sub={fmtCompVal('vsbRsOhm', circuitValues.vsbRsOhm)}
                  editKey="vsbRsOhm"
                  selectedKey={selectedModKey}
                  isModified={isModModified('vsbRsOhm')}
                  onSelectEdit={setSelectedModKey}
                />

                <CapacitorSymbol
                  x={170}
                  y={148}
                  vertical={false}
                  label="C₁"
                  sub={fmtCompVal('vsbC1Pf', circuitValues.vsbC1Pf)}
                  editKey="vsbC1Pf"
                  selectedKey={selectedModKey}
                  isModified={isModModified('vsbC1Pf')}
                  onSelectEdit={setSelectedModKey}
                />
                <InductorSymbol
                  x={240}
                  y={148}
                  label="L₁"
                  sub={fmtCompVal('vsbL1Uh', circuitValues.vsbL1Uh)}
                  editKey="vsbL1Uh"
                  selectedKey={selectedModKey}
                  isModified={isModModified('vsbL1Uh')}
                  onSelectEdit={setSelectedModKey}
                />

                <NodeDot x={292} y={148} color="#D97706" />
                <LiveWire d="M 292 148 L 292 244" color="#D97706" isSimulating={run} speed={speed} />
                <InductorSymbol
                  x={292}
                  y={196}
                  vertical
                  label="L₂"
                  sub={fmtCompVal('vsbL2Uh', circuitValues.vsbL2Uh)}
                  labelSide="left"
                  editKey="vsbL2Uh"
                  selectedKey={selectedModKey}
                  isModified={isModModified('vsbL2Uh')}
                  onSelectEdit={setSelectedModKey}
                />
                <GroundSymbol x={292} y={244} />

                <NodeDot x={360} y={148} color="#D97706" />
                <LiveWire d="M 360 148 L 360 244" color="#D97706" isSimulating={run} speed={speed} />
                <CapacitorSymbol
                  x={360}
                  y={196}
                  vertical
                  label="C₂"
                  sub={fmtCompVal('vsbC2Pf', circuitValues.vsbC2Pf)}
                  editKey="vsbC2Pf"
                  selectedKey={selectedModKey}
                  isModified={isModModified('vsbC2Pf')}
                  onSelectEdit={setSelectedModKey}
                />
                <GroundSymbol x={360} y={244} />

                <CapacitorSymbol
                  x={432}
                  y={148}
                  vertical={false}
                  label="C₃"
                  sub={fmtCompVal('vsbC3Pf', circuitValues.vsbC3Pf)}
                  editKey="vsbC3Pf"
                  selectedKey={selectedModKey}
                  isModified={isModModified('vsbC3Pf')}
                  onSelectEdit={setSelectedModKey}
                />

                <OpAmpSymbol x={504} y={160} topSign="+" />
                <line x1={480} y1={172} x2={460} y2={172} stroke="#334155" strokeWidth="1.7" />
                <line x1={460} y1={172} x2={460} y2={244} stroke="#334155" strokeWidth="1.7" />
                <GroundSymbol x={460} y={244} />

                <NodeDot x={470} y={148} color="#1E293B" />
                <NodeDot x={548} y={160} color="#15803D" />
                <path d="M 470 148 L 470 36 L 548 36 L 548 160" fill="none" stroke="#334155" strokeWidth="1.6" />
                <path d="M 470 78 L 548 78" fill="none" stroke="#334155" strokeWidth="1.6" />
                <NodeDot x={470} y={78} color="#334155" />
                <NodeDot x={548} y={78} color="#334155" />
                <ResistorSymbol
                  x={509}
                  y={36}
                  label="R_f"
                  sub={fmtCompVal('vsbRfK', circuitValues.vsbRfK)}
                  editKey="vsbRfK"
                  selectedKey={selectedModKey}
                  isModified={isModModified('vsbRfK')}
                  onSelectEdit={setSelectedModKey}
                />
                <CapacitorSymbol
                  x={509}
                  y={78}
                  vertical={false}
                  label="C_f"
                  sub={fmtCompVal('vsbCfPf', circuitValues.vsbCfPf)}
                  editKey="vsbCfPf"
                  selectedKey={selectedModKey}
                  isModified={isModModified('vsbCfPf')}
                  onSelectEdit={setSelectedModKey}
                />

                <LiveWire d="M 528 160 L 734 160" color="#15803D" isSimulating={run} speed={speed} />

                <NodeDot x={586} y={160} color="#15803D" />
                <LiveWire d="M 586 160 L 586 266" color="#15803D" isSimulating={run} speed={speed} />
                <InductorSymbol
                  x={586}
                  y={190}
                  vertical
                  label="L₃"
                  sub={fmtCompVal('vsbL3Uh', circuitValues.vsbL3Uh)}
                  editKey="vsbL3Uh"
                  selectedKey={selectedModKey}
                  isModified={isModModified('vsbL3Uh')}
                  onSelectEdit={setSelectedModKey}
                />
                <CapacitorSymbol
                  x={586}
                  y={240}
                  vertical
                  label="C₄"
                  sub={fmtCompVal('vsbC4Pf', circuitValues.vsbC4Pf)}
                  editKey="vsbC4Pf"
                  selectedKey={selectedModKey}
                  isModified={isModModified('vsbC4Pf')}
                  onSelectEdit={setSelectedModKey}
                />
                <GroundSymbol x={586} y={266} />

                <CapacitorSymbol
                  x={646}
                  y={160}
                  vertical={false}
                  label="C_out"
                  sub={fmtCompVal('vsbCoutUf', circuitValues.vsbCoutUf)}
                  editKey="vsbCoutUf"
                  selectedKey={selectedModKey}
                  isModified={isModModified('vsbCoutUf')}
                  onSelectEdit={setSelectedModKey}
                />

                <NodeDot x={698} y={160} color="#15803D" />
                <LiveWire d="M 698 160 L 698 244" color="#15803D" isSimulating={run} speed={speed} />
                <ResistorSymbol
                  x={698}
                  y={202}
                  vertical
                  label="R_L"
                  sub={fmtCompVal('vsbRlOhm', circuitValues.vsbRlOhm)}
                  labelSide="left"
                  editKey="vsbRlOhm"
                  selectedKey={selectedModKey}
                  isModified={isModModified('vsbRlOhm')}
                  onSelectEdit={setSelectedModKey}
                />
                <GroundSymbol x={698} y={244} />

                <text x={256} y={288} textAnchor="middle" className="fill-slate-600 text-[9.5px] font-mono font-semibold">
                  LC Shaping Network
                </text>
                <text x={504} y={288} textAnchor="middle" className="fill-slate-600 text-[9.5px] font-mono font-semibold">
                  Op-Amp Buffer / Active Filter
                </text>

                <OutputScopeProbe
                  x={734}
                  y={82}
                  data={live.sArr}
                  color="#15803D"
                  label="v_out = s_VSB(t)"
                  valText={fmtV(sNow)}
                  statusTag={`fv=${((live.vsbW * live.vsbVestigeRatio) / 1000).toFixed(1)}k`}
                />
              </>
            )}
          </svg>

          <CircuitComponentEditor
            keys={modKeys}
            selectedKey={selectedModKey}
            onSelectKey={setSelectedModKey}
            values={circuitValues}
            onUpdate={onUpdateCircuit}
            derivedReadout={circuitMeta.modDerived}
          />
        </div>
      )}

      {/* DEMODULATOR CIRCUIT CARD */}
      {showDemod && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] border-b border-slate-100 pb-1.5">
            <span className="font-semibold text-[#111827]">
              <LatexText text={circuitMeta.demodTitle} />
            </span>
            <span className="text-[10px] text-[#B45309]">
              <LatexText text={circuitMeta.demodEq} />
            </span>
          </div>

          <svg viewBox="0 0 900 310" className="w-full block" style={{ height: `${svgH}px` }}>
            {/* TOPIC 01: FDM TUNED RECEIVER */}
            {live.topic === 'motivation' && (() => {
              const tuned =
                live.fdmChannels.find((c) => c.id === live.tunedChannelId) || live.fdmChannels[0];
              const detunedFc =
                tuned.fc / Math.sqrt(Math.max(0.2, circuitValues.fdmLrxUh / 100) * Math.max(0.2, circuitValues.fdmCvarScale));
              return (
                <>
                  <line x1={38} y1={54} x2={38} y2={144} stroke="#1E4620" strokeWidth="2.4" />
                  <path d="M 22 54 L 38 76 L 54 54" fill="none" stroke="#1E4620" strokeWidth="1.8" />
                  <LiveWire d="M 38 144 L 244 144" color="#15803D" isSimulating={run} speed={speed} />
                  <InductorSymbol
                    x={106}
                    y={144}
                    label="L_rx"
                    sub={fmtCompVal('fdmLrxUh', circuitValues.fdmLrxUh)}
                    editKey="fdmLrxUh"
                    selectedKey={selectedDemodKey}
                    isModified={isModModified('fdmLrxUh')}
                    onSelectEdit={setSelectedDemodKey}
                  />
                  <NodeDot x={178} y={144} color="#15803D" />
                  <LiveWire d="M 178 144 L 178 248" color="#15803D" isSimulating={run} speed={speed} />
                  <CapacitorSymbol
                    x={178}
                    y={196}
                    vertical
                    variable
                    label="C_var"
                    sub={`${(detunedFc / 1000).toFixed(1)}kHz`}
                    editKey="fdmCvarScale"
                    selectedKey={selectedDemodKey}
                    isModified={isModModified('fdmCvarScale')}
                    onSelectEdit={setSelectedDemodKey}
                  />
                  <GroundSymbol x={178} y={248} />

                  <TransistorSymbol x={262} y={144} label="Q₁" sub={`LO ${(tuned.fc / 1000).toFixed(1)}k`} />
                  <ACSourceSymbol x={269} y={244} label="LO" sub="cos ω_k t" color="#7C3AED" />
                  <LiveWire d="M 269 229 L 269 166" color="#7C3AED" isSimulating={run} speed={speed} />

                  <LiveWire d="M 269 122 L 269 102 L 558 102 L 558 140" color="#EA580C" isSimulating={run} speed={speed} />
                  <ResistorSymbol
                    x={342}
                    y={102}
                    label="R₁"
                    sub={fmtCompVal('skR1K', circuitValues.skR1K)}
                    editKey="skR1K"
                    selectedKey={selectedDemodKey}
                    isModified={isModModified('skR1K')}
                    onSelectEdit={setSelectedDemodKey}
                  />
                  <NodeDot x={400} y={102} color="#EA580C" />
                  <ResistorSymbol
                    x={458}
                    y={102}
                    label="R₂"
                    sub={fmtCompVal('skR2K', circuitValues.skR2K)}
                    editKey="skR2K"
                    selectedKey={selectedDemodKey}
                    isModified={isModModified('skR2K')}
                    onSelectEdit={setSelectedDemodKey}
                  />
                  <NodeDot x={516} y={102} color="#EA580C" />

                  <LiveWire d="M 516 102 L 516 248" color="#EA580C" isSimulating={run} speed={speed} />
                  <CapacitorSymbol
                    x={516}
                    y={180}
                    vertical
                    label="C₂"
                    sub={fmtCompVal('skC2Nf', circuitValues.skC2Nf)}
                    labelSide="left"
                    editKey="skC2Nf"
                    selectedKey={selectedDemodKey}
                    isModified={isModModified('skC2Nf')}
                    onSelectEdit={setSelectedDemodKey}
                  />
                  <GroundSymbol x={516} y={248} />

                  <OpAmpSymbol x={582} y={152} topSign="+" label="Sallen-Key LPF" showRails={false} />
                  <path d="M 400 102 L 400 46 L 620 46 L 620 152" fill="none" stroke="#EA580C" strokeWidth="1.6" />
                  <CapacitorSymbol
                    x={510}
                    y={46}
                    vertical={false}
                    label="C₁"
                    sub={fmtCompVal('skCfNf', circuitValues.skCfNf)}
                    editKey="skCfNf"
                    selectedKey={selectedDemodKey}
                    isModified={isModModified('skCfNf')}
                    onSelectEdit={setSelectedDemodKey}
                  />
                  <path d="M 558 164 L 542 164 L 542 204 L 620 204 L 620 152" fill="none" stroke="#334155" strokeWidth="1.5" />
                  <NodeDot x={620} y={152} color="#EA580C" />

                  <LiveWire d="M 606 152 L 734 152" color="#EA580C" isSimulating={run} speed={speed} />
                  <CapacitorSymbol
                    x={670}
                    y={152}
                    vertical={false}
                    label="C_out"
                    sub={fmtCompVal('skCoutUf', circuitValues.skCoutUf)}
                    editKey="skCoutUf"
                    selectedKey={selectedDemodKey}
                    isModified={isModModified('skCoutUf')}
                    onSelectEdit={setSelectedDemodKey}
                  />

                  <OutputScopeProbe
                    x={734}
                    y={82}
                    data={live.yArr}
                    refData={live.mArr}
                    refLabel={`m${tuned.id}(t)`}
                    color="#EA580C"
                    label="y_o(t) Demod"
                    valText={fmtV(yNow)}
                    statusTag={demodStatus.tag}
                    statusColor={demodStatus.color}
                  />
                </>
              );
            })()}

            {/* TOPIC 02: DIODE + RC ENVELOPE DETECTOR */}
            {live.topic === 'conventional-am' && (() => {
              const diodeOn = sNow > rcNow - 0.01;
              return (
                <>
                  <ACSourceSymbol x={48} y={142} label="s(t)" sub={fmtV(sNow)} color="#15803D" />
                  <line x1={48} y1={157} x2={48} y2={248} stroke="#334155" strokeWidth="1.6" />
                  <GroundSymbol x={48} y={248} />

                  <LiveWire d="M 63 142 L 184 142" color="#15803D" isSimulating={run} speed={speed} />
                  <ResistorSymbol
                    x={122}
                    y={142}
                    label="R_s"
                    sub={fmtCompVal('amRxRsOhm', circuitValues.amRxRsOhm)}
                    editKey="amRxRsOhm"
                    selectedKey={selectedDemodKey}
                    isModified={isModModified('amRxRsOhm')}
                    onSelectEdit={setSelectedDemodKey}
                  />

                  <DiodeSymbol
                    x={200}
                    y={142}
                    label={diodeOn ? 'D₁ (ON)' : 'D₁ (OFF)'}
                    sub={diodeOn ? 'Charge' : 'Decay'}
                    conducting={diodeOn}
                  />
                  <LiveWire
                    d="M 216 142 L 360 142"
                    color="#EA580C"
                    active={diodeOn}
                    isSimulating={run}
                    speed={speed}
                  />

                  <NodeDot x={278} y={142} color="#EA580C" />
                  <LiveWire d="M 278 142 L 278 248" color="#EA580C" isSimulating={run} speed={speed} />
                  <CapacitorSymbol
                    x={278}
                    y={196}
                    vertical
                    label="C"
                    sub={fmtCompVal('amRxCUf', circuitValues.amRxCUf)}
                    labelSide="left"
                    editKey="amRxCUf"
                    selectedKey={selectedDemodKey}
                    isModified={isModModified('amRxCUf')}
                    onSelectEdit={setSelectedDemodKey}
                  />
                  <GroundSymbol x={278} y={248} />

                  <NodeDot x={360} y={142} color="#EA580C" />
                  <LiveWire d="M 360 142 L 360 248" color="#EA580C" isSimulating={run} speed={speed} />
                  <ResistorSymbol
                    x={360}
                    y={196}
                    vertical
                    label="R_l"
                    sub={fmtCompVal('amRxRlK', circuitValues.amRxRlK)}
                    editKey="amRxRlK"
                    selectedKey={selectedDemodKey}
                    isModified={isModModified('amRxRlK')}
                    onSelectEdit={setSelectedDemodKey}
                  />
                  <GroundSymbol x={360} y={248} />

                  <text x={319} y={100} textAnchor="middle" className="fill-[#C2410C] text-[9.5px] font-mono font-semibold">
                    v_RC = {fmtV(rcNow)}
                  </text>

                  <LiveWire d="M 360 142 L 540 142" color="#EA580C" isSimulating={run} speed={speed} />
                  <CapacitorSymbol
                    x={432}
                    y={142}
                    vertical={false}
                    label="C_c"
                    sub={fmtCompVal('amRxCcUf', circuitValues.amRxCcUf)}
                    editKey="amRxCcUf"
                    selectedKey={selectedDemodKey}
                    isModified={isModModified('amRxCcUf')}
                    onSelectEdit={setSelectedDemodKey}
                  />
                  <NodeDot x={494} y={142} color="#EA580C" />
                  <LiveWire d="M 494 142 L 494 248" color="#EA580C" isSimulating={run} speed={speed} />
                  <ResistorSymbol
                    x={494}
                    y={196}
                    vertical
                    label="R_b"
                    sub={fmtCompVal('amRxRbK', circuitValues.amRxRbK)}
                    editKey="amRxRbK"
                    selectedKey={selectedDemodKey}
                    isModified={isModModified('amRxRbK')}
                    onSelectEdit={setSelectedDemodKey}
                  />
                  <GroundSymbol x={494} y={248} />

                  <OpAmpSymbol x={564} y={154} topSign="+" label="Buffer" />
                  <path d="M 540 166 L 526 166 L 526 206 L 606 206 L 606 154" fill="none" stroke="#334155" strokeWidth="1.5" />
                  <NodeDot x={606} y={154} color="#EA580C" />

                  <LiveWire d="M 588 154 L 734 154" color="#EA580C" isSimulating={run} speed={speed} />
                  <NodeDot x={666} y={154} color="#EA580C" />
                  <LiveWire d="M 666 154 L 666 248" color="#EA580C" isSimulating={run} speed={speed} />
                  <ResistorSymbol x={666} y={202} vertical label="R_L" sub="1 kΩ" />
                  <GroundSymbol x={666} y={248} />

                  <OutputScopeProbe
                    x={734}
                    y={82}
                    data={live.yArr}
                    refData={live.mArr}
                    refLabel="m(t)"
                    color="#EA580C"
                    label="y_o(t) Demod"
                    valText={fmtV(yNow)}
                    statusTag={demodStatus.tag}
                    statusColor={demodStatus.color}
                  />
                </>
              );
            })()}

            {/* TOPIC 03: COSTAS I/Q LOOP RECEIVER */}
            {live.topic === 'dsb-sc' && live.dsbRxMode === 'costas' && (
              <>
                <ACSourceSymbol x={46} y={150} label="s(t)" sub="DSB-SC" color="#15803D" />
                <LiveWire d="M 61 150 L 116 150" color="#15803D" isSimulating={run} speed={speed} />
                <NodeDot x={116} y={150} color="#15803D" />
                <LiveWire d="M 116 150 L 116 74 L 182 74" color="#15803D" isSimulating={run} speed={speed} />
                <LiveWire d="M 116 150 L 116 226 L 182 226" color="#15803D" isSimulating={run} speed={speed} />

                <TransistorSymbol x={200} y={74} label="Q_I" sub="0°" />
                <TransistorSymbol x={200} y={226} label="Q_Q" sub="−90°" />

                <rect x={306} y={132} width={96} height={36} rx={6} fill="#F5F3FF" stroke="#7C3AED" strokeWidth="1.6" />
                <text x={354} y={147} textAnchor="middle" className="fill-[#6D28D9] text-[9.5px] font-mono font-bold">
                  VCO Tank
                </text>
                <text x={354} y={160} textAnchor="middle" className="fill-slate-600 text-[8.5px] font-mono">
                  φ={(live.costasFinalPhaseDeg ?? 0).toFixed(1)}°
                </text>
                <LiveWire d="M 306 150 L 207 150 L 207 96" color="#7C3AED" isSimulating={run} speed={speed} />
                <LiveWire d="M 207 150 L 207 204" color="#7C3AED" isSimulating={run} speed={speed} />
                <NodeDot x={207} y={150} color="#7C3AED" />
                <CapacitorSymbol x={256} y={150} vertical={false} label="C_φ" sub="−90°" />

                <LiveWire d="M 207 52 L 207 38 L 716 38 L 716 138 L 734 138" color="#EA580C" isSimulating={run} speed={speed} />
                <ResistorSymbol
                  x={314}
                  y={38}
                  label="R_I"
                  sub={fmtCompVal('dsbCostasRiK', circuitValues.dsbCostasRiK)}
                  editKey="dsbCostasRiK"
                  selectedKey={selectedDemodKey}
                  isModified={isModModified('dsbCostasRiK')}
                  onSelectEdit={setSelectedDemodKey}
                />
                <NodeDot x={404} y={38} color="#EA580C" />
                <LiveWire d="M 404 38 L 404 104" color="#EA580C" isSimulating={run} speed={speed} />
                <CapacitorSymbol
                  x={404}
                  y={76}
                  vertical
                  label="C_I"
                  sub={fmtCompVal('dsbCostasCiNf', circuitValues.dsbCostasCiNf)}
                  editKey="dsbCostasCiNf"
                  selectedKey={selectedDemodKey}
                  isModified={isModModified('dsbCostasCiNf')}
                  onSelectEdit={setSelectedDemodKey}
                />
                <GroundSymbol x={404} y={104} />

                <LiveWire d="M 207 248 L 207 264 L 594 264 L 594 162 L 580 162" color="#D97706" isSimulating={run} speed={speed} />
                <ResistorSymbol
                  x={314}
                  y={264}
                  label="R_Q"
                  sub={fmtCompVal('dsbCostasRqK', circuitValues.dsbCostasRqK)}
                  editKey="dsbCostasRqK"
                  selectedKey={selectedDemodKey}
                  isModified={isModModified('dsbCostasRqK')}
                  onSelectEdit={setSelectedDemodKey}
                />
                <NodeDot x={404} y={264} color="#D97706" />
                <line x1={404} y1={264} x2={404} y2={204} stroke="#D97706" strokeWidth="1.6" />
                <CapacitorSymbol
                  x={404}
                  y={226}
                  vertical
                  label="C_Q"
                  sub={fmtCompVal('dsbCostasCqNf', circuitValues.dsbCostasCqNf)}
                  editKey="dsbCostasCqNf"
                  selectedKey={selectedDemodKey}
                  isModified={isModModified('dsbCostasCqNf')}
                  onSelectEdit={setSelectedDemodKey}
                />
                <line x1={394} y1={204} x2={414} y2={204} stroke="#334155" strokeWidth="1.7" />

                <NodeDot x={594} y={38} color="#EA580C" />
                <LiveWire d="M 594 38 L 594 138 L 580 138" color="#EA580C" isSimulating={run} speed={speed} />
                <OpAmpSymbol x={556} y={150} flipX topSign="×" botSign="−" label="Loop Filter" showRails={false} />
                <LiveWire d="M 532 150 L 402 150" color="#D97706" reverse isSimulating={run} speed={speed} />
                <ResistorSymbol
                  x={468}
                  y={150}
                  label="R_loop"
                  sub={fmtCompVal('dsbCostasRloopK', circuitValues.dsbCostasRloopK)}
                  editKey="dsbCostasRloopK"
                  selectedKey={selectedDemodKey}
                  isModified={isModModified('dsbCostasRloopK')}
                  onSelectEdit={setSelectedDemodKey}
                />

                <OutputScopeProbe
                  x={734}
                  y={82}
                  data={live.yArr}
                  refData={live.mArr}
                  refLabel="m(t)"
                  color="#EA580C"
                  label="y_I(t) Costas"
                  valText={fmtV(yNow)}
                  statusTag={demodStatus.tag}
                  statusColor={demodStatus.color}
                />
              </>
            )}

            {/* COHERENT SYNCHRONOUS DETECTOR */}
            {((live.topic === 'dsb-sc' && live.dsbRxMode === 'coherent') ||
              live.topic === 'ssb' ||
              live.topic === 'vsb') && (() => {
              const rxPhi =
                live.topic === 'dsb-sc'
                  ? live.loPhaseErrorDeg
                  : live.topic === 'ssb'
                  ? live.ssbPhaseErrDeg
                  : 0;
              const isNull = live.topic === 'dsb-sc' && Math.abs(rxPhi) === 90;
              const sigCol = isNull ? '#94A3B8' : '#EA580C';
              return (
                <>
                  <ACSourceSymbol x={48} y={144} label="s(t)" sub={fmtV(sNow)} color="#15803D" />
                  <line x1={48} y1={159} x2={48} y2={248} stroke="#334155" strokeWidth="1.6" />
                  <GroundSymbol x={48} y={248} />

                  <LiveWire d="M 63 144 L 236 144" color="#15803D" isSimulating={run} speed={speed} />
                  <ResistorSymbol x={114} y={144} label="R_S" sub="75 Ω" />
                  <CapacitorSymbol x={182} y={144} vertical={false} label="C_in" sub="0.1 μF" />

                  <TransistorSymbol x={254} y={144} label="Q₁" sub="Sync Det" />
                  <ACSourceSymbol x={261} y={244} label="LO" sub={`φ=${rxPhi}°`} color="#7C3AED" />
                  <LiveWire d="M 261 229 L 261 166" color="#7C3AED" isSimulating={run} speed={speed} />

                  <LiveWire
                    d="M 261 122 L 261 102 L 544 102 L 544 140"
                    color={sigCol}
                    active={!isNull}
                    isSimulating={run}
                    speed={speed}
                  />
                  <ResistorSymbol
                    x={334}
                    y={102}
                    label="R₁"
                    sub={fmtCompVal('skR1K', circuitValues.skR1K)}
                    editKey="skR1K"
                    selectedKey={selectedDemodKey}
                    isModified={isModModified('skR1K')}
                    onSelectEdit={setSelectedDemodKey}
                  />
                  <NodeDot x={392} y={102} color={sigCol} />
                  <ResistorSymbol
                    x={450}
                    y={102}
                    label="R₂"
                    sub={fmtCompVal('skR2K', circuitValues.skR2K)}
                    editKey="skR2K"
                    selectedKey={selectedDemodKey}
                    isModified={isModModified('skR2K')}
                    onSelectEdit={setSelectedDemodKey}
                  />
                  <NodeDot x={504} y={102} color={sigCol} />

                  <LiveWire
                    d="M 504 102 L 504 248"
                    color={sigCol}
                    active={!isNull}
                    isSimulating={run}
                    speed={speed}
                  />
                  <CapacitorSymbol
                    x={504}
                    y={180}
                    vertical
                    label="C₂"
                    sub={fmtCompVal('skC2Nf', circuitValues.skC2Nf)}
                    labelSide="left"
                    editKey="skC2Nf"
                    selectedKey={selectedDemodKey}
                    isModified={isModModified('skC2Nf')}
                    onSelectEdit={setSelectedDemodKey}
                  />
                  <GroundSymbol x={504} y={248} />

                  <OpAmpSymbol x={568} y={152} topSign="+" label="Active LPF" />
                  <path d="M 392 102 L 392 42 L 608 42 L 608 152" fill="none" stroke="#334155" strokeWidth="1.6" />
                  <CapacitorSymbol
                    x={500}
                    y={42}
                    vertical={false}
                    label="C_f"
                    sub={fmtCompVal('skCfNf', circuitValues.skCfNf)}
                    editKey="skCfNf"
                    selectedKey={selectedDemodKey}
                    isModified={isModModified('skCfNf')}
                    onSelectEdit={setSelectedDemodKey}
                  />
                  <path d="M 544 164 L 528 164 L 528 214 L 608 214 L 608 152" fill="none" stroke="#334155" strokeWidth="1.5" />
                  <NodeDot x={608} y={152} color={sigCol} />

                  <LiveWire
                    d="M 592 152 L 734 152"
                    color={sigCol}
                    active={!isNull}
                    isSimulating={run}
                    speed={speed}
                  />
                  <CapacitorSymbol
                    x={644}
                    y={152}
                    vertical={false}
                    label="C_out"
                    sub={fmtCompVal('skCoutUf', circuitValues.skCoutUf)}
                    editKey="skCoutUf"
                    selectedKey={selectedDemodKey}
                    isModified={isModModified('skCoutUf')}
                    onSelectEdit={setSelectedDemodKey}
                  />
                  <NodeDot x={696} y={152} color={sigCol} />
                  <LiveWire
                    d="M 696 152 L 696 248"
                    color={sigCol}
                    active={!isNull}
                    isSimulating={run}
                    speed={speed}
                  />
                  <ResistorSymbol
                    x={696}
                    y={200}
                    vertical
                    label="R_L"
                    sub={fmtCompVal('skRlK', circuitValues.skRlK)}
                    labelSide="left"
                    editKey="skRlK"
                    selectedKey={selectedDemodKey}
                    isModified={isModModified('skRlK')}
                    onSelectEdit={setSelectedDemodKey}
                  />
                  <GroundSymbol x={696} y={248} />

                  <OutputScopeProbe
                    x={734}
                    y={82}
                    data={live.yArr}
                    refData={live.mArr}
                    refLabel="m(t)"
                    color="#EA580C"
                    label="y_o(t) Demod"
                    valText={fmtV(yNow)}
                    statusTag={demodStatus.tag}
                    statusColor={demodStatus.color}
                  />
                </>
              );
            })()}
          </svg>

          <CircuitComponentEditor
            keys={demodKeys}
            selectedKey={selectedDemodKey}
            onSelectKey={setSelectedDemodKey}
            values={circuitValues}
            onUpdate={onUpdateCircuit}
            derivedReadout={circuitMeta.demodDerived}
          />
        </div>
      )}

      {/* Expanded Interactive Circuit Output Oscilloscope Modal */}
      {scopeModal && modalScopeData && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setScopeModal(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 bg-[#FAFAF8] border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400">
                  CIRCUIT OUTPUT OSCILLOSCOPE · {scopeModal.stage === 'mod' ? 'MODULATOR PROBE' : 'DEMODULATOR PROBE'}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <h3 className="text-sm font-bold text-[#111827]">{scopeModal.label}</h3>
                  <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono text-slate-600 tabular-nums">
                    Window: {modalScopeData.winMs.toFixed(2)} ms
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono text-slate-600 tabular-nums">
                    Vp: {modalScopeData.vPeak.toFixed(2)} V
                  </span>
                  {scopeModal.statusTag && (
                    <span
                      className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono font-bold"
                      style={{ color: scopeModal.statusColor || '#1E4620' }}
                    >
                      {scopeModal.statusTag}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setScopeModal(null)}
                className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-900 cursor-pointer"
                aria-label="Close oscilloscope modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Oscilloscope Zoom & Gain Toolbar */}
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              {/* Timebase Zoom */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mr-1">
                  Time Zoom:
                </span>
                <button
                  type="button"
                  onClick={() => stepZoom(scopeModal.stage, -1)}
                  disabled={modalScopeData.zoom <= SCOPE_ZOOM_LEVELS[0] + 1e-4}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-[11px] font-mono font-semibold text-slate-700 hover:border-[#1E4620] disabled:opacity-40 cursor-pointer"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                  <span>Out</span>
                </button>
                <span className="px-2.5 py-1 rounded-md bg-[#EFF3EB] border border-[#DCE5D5] text-[11px] font-mono font-bold text-[#1E4620] tabular-nums">
                  {modalScopeData.zoom < 1
                    ? `${modalScopeData.zoom.toFixed(1)}×`
                    : `${modalScopeData.zoom}×`}
                </span>
                <button
                  type="button"
                  onClick={() => stepZoom(scopeModal.stage, 1)}
                  disabled={modalScopeData.zoom >= SCOPE_ZOOM_LEVELS[SCOPE_ZOOM_LEVELS.length - 1] - 1e-4}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-[11px] font-mono font-semibold text-slate-700 hover:border-[#1E4620] disabled:opacity-40 cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                  <span>In</span>
                </button>
                <div className="hidden sm:flex items-center gap-1 ml-1">
                  {[0.4, 1, 2, 4, 8].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        scopeModal.stage === 'mod' ? setModZoom(preset) : setDemodZoom(preset)
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono border cursor-pointer ${
                        Math.abs(modalScopeData.zoom - preset) < 0.05
                          ? 'bg-[#1E4620] text-white border-[#1E4620]'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {preset}×
                    </button>
                  ))}
                </div>
              </div>

              {/* Vertical Gain Zoom + Stacked/Overlay */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                  Y-Zoom:
                </span>
                {[0.5, 1, 2, 4].map((vy) => (
                  <button
                    key={vy}
                    type="button"
                    onClick={() => setModalVZoom(vy)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono border cursor-pointer ${
                      Math.abs(modalVZoom - vy) < 0.05
                        ? 'bg-[#1E4620] text-white border-[#1E4620]'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {vy}×
                  </button>
                ))}

                {scopeModal.refLabel && (
                  <div className="flex bg-white p-0.5 rounded-md border border-slate-200 text-[10px] font-medium ml-1">
                    {(['overlay', 'stacked'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setModalMode(m)}
                        className={`px-2 py-0.5 rounded cursor-pointer ${
                          modalMode === m
                            ? 'bg-[#1E4620] text-white font-semibold'
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        {m === 'overlay' ? 'Overlay' : 'Stacked'}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    resetZoom(scopeModal.stage);
                    setModalVZoom(1);
                    setModalPanPct(0);
                  }}
                  className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono text-slate-600 hover:text-[#1E4620] cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Oscilloscope Canvas */}
            <div className="p-4 bg-white space-y-2.5">
              <div className="border border-slate-200 rounded-xl p-2 bg-white">
                <DarkOscilloscopeCanvas
                  t={modalScopeData.tArr}
                  traces={modalScopeData.traces}
                  mode={scopeModal.refLabel ? modalMode : 'overlay'}
                  xUnitMultiplier={1000}
                  xLabel="Time / ms"
                  height={390}
                  yBoundOverride={modalScopeData.yBoundOverride}
                />
              </div>

              {modalScopeData.canPan && (
                <div className="flex items-center gap-3 px-1">
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">
                    Pan Window ({modalScopeData.startMs.toFixed(2)} ms):
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={modalPanPct}
                    onChange={(e) => setModalPanPct(Number(e.target.value))}
                    className="w-full accent-[#1E4620] cursor-pointer"
                    aria-label="Pan oscilloscope time window"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </CircuitScopeContext.Provider>
  );
};
