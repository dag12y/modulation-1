import React, { useMemo, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { Latex, LatexText } from './Latex';
import {
  CircuitComponentValues,
  computeSallenKeyCutoffHz,
} from '../../services/chapter2Dsp';
import { CircuitLiveData } from './ModDemodCircuitPanel';

interface ComponentNoteItem {
  symbol: string;
  value?: string;
  role: string;
}

interface StageAnalysisNote {
  stageLabel: string;
  equation: string;
  summary: string;
  items: ComponentNoteItem[];
}

export const CircuitAnalysisNoteCard: React.FC<{
  live: CircuitLiveData;
  circuitValues: CircuitComponentValues;
}> = ({ live, circuitValues }) => {
  const [collapsed, setCollapsed] = useState(true);

  const skCutoffHz = useMemo(
    () => computeSallenKeyCutoffHz(circuitValues),
    [circuitValues]
  );

  const { modNote, demodNote } = useMemo<{
    modNote: StageAnalysisNote;
    demodNote: StageAnalysisNote;
  }>(() => {
    // -----------------------------------------------------------------------
    // MODULATOR STAGE ANALYSIS
    // -----------------------------------------------------------------------
    let modNote: StageAnalysisNote;

    if (live.topic === 'motivation') {
      modNote = {
        stageLabel: 'Modulator Analysis · FDM Summing Tx',
        equation:
          's_{\\text{FDM}}(t) = -R_f \\sum_{k=1}^{3} \\frac{m_k(t)\\cos(2\\pi f_k t)}{R_k}, \\qquad l_{\\lambda/4} = \\frac{c}{4 f_c}',
        summary:
          'Each channel passes through a baseband DC-blocking capacitor into its switching mixer $Q_k$, then converts to current via $R_k$ at the Op-Amp virtual ground node.',
        items: [
          {
            symbol: 'C_1, C_2, C_3',
            value: `${circuitValues.fdmC1nF}/${circuitValues.fdmC2nF}/${circuitValues.fdmC3nF}\\,\\text{nF}`,
            role: 'Input coupling capacitors setting baseband HPF corner $f_{\\text{HP}}=\\frac{1}{2\\pi R_k C_k}$ to strip DC.',
          },
          {
            symbol: 'Q_1, Q_2, Q_3',
            role: 'BJT switching mixers multiplying $m_k(t)$ by carriers $f_1,f_2,f_3$ to separate channels in frequency.',
          },
          {
            symbol: 'R_1, R_2, R_3, R_f',
            value: `R_f=${circuitValues.fdmRfK.toFixed(1)}\\,\\text{k}\\Omega`,
            role: 'Summing resistors setting channel voltage gain $A_k = -R_f / R_k$ without cross-loading.',
          },
          {
            symbol: 'C_{\\text{out}},\\, \\lambda/4',
            value: `${circuitValues.fdmCoutUf.toFixed(3)}\\,\\mu\\text{F}`,
            role: 'Blocks Op-Amp DC offset before feeding the quarter-wave radiating antenna.',
          },
        ],
      };
    } else if (live.topic === 'conventional-am' && live.amModulatorMode === 'square-law') {
      const fTankKHz =
        1e6 / (2 * Math.PI * Math.sqrt(circuitValues.amTxLtUh * circuitValues.amTxCtPf));
      const effMu = live.mu * (0.7 / Math.max(0.25, circuitValues.amTxVbbV));
      modNote = {
        stageLabel: 'Modulator Analysis · Square-Law Diode AM',
        equation:
          'i_D \\approx a_1 v_1 + a_2 v_1^2 \\;\\xrightarrow{L_t \\parallel C_t}\\; s(t) = A_c\\!\\left[1 + \\mu_{\\text{eff}}\\frac{m(t)}{A_m}\\right]\\!\\cos(2\\pi f_c t)',
        summary: `Summing $v_1(t)=m(t)+c(t)+V_{BB}$ into nonlinear diode $D_1$ generates cross-term $2a_2 m(t)c(t)$ ($\\mu_{\\text{eff}}=${effMu.toFixed(2)}), isolated by the parallel tank ($f_0=${fTankKHz.toFixed(1)}\\,\\text{kHz}$).`,
        items: [
          {
            symbol: 'V_{BB}',
            value: `${circuitValues.amTxVbbV.toFixed(2)}\\,\\text{V}`,
            role: 'DC bias setting the diode Q-point and nonlinear curvature; lower $V_{BB}$ raises $\\mu_{\\text{eff}}$.',
          },
          {
            symbol: 'R_s, C_1',
            value: `${circuitValues.amTxRsOhm}\\,\\Omega,\\;10\\,\\text{nF}`,
            role: '$R_s$ limits input drive; $C_1$ AC-couples $m(t)+c(t)$ onto the $D_1$ anode.',
          },
          {
            symbol: 'D_1\\text{ (1N4148)}',
            role: 'Nonlinear element whose $v_1^2$ term produces $m(t)c(t)$ sidebands plus $2f_c$ and baseband.',
          },
          {
            symbol: 'R_L, C_2',
            value: `${circuitValues.amTxRlK.toFixed(1)}\\,\\text{k}\\Omega,\\;47\\,\\text{pF}`,
            role: '$R_L$ develops $v_2(t)$ from diode current and loads the tank Q; $C_2$ couples RF into the tank.',
          },
          {
            symbol: 'L_t, C_t, C_{\\text{out}}',
            value: `${circuitValues.amTxLtUh}\\,\\mu\\text{H},\\;${circuitValues.amTxCtPf}\\,\\text{pF}`,
            role: 'Parallel tank resonant at $f_0=\\frac{1}{2\\pi\\sqrt{L_t C_t}}$ rejecting DC/$2f_c$; $C_{\\text{out}}$ blocks DC.',
          },
        ],
      };
    } else if (live.topic === 'conventional-am') {
      const biasGain = circuitValues.amTxRfK / Math.max(0.5, circuitValues.amTxR1K);
      const effMu = live.mu * biasGain;
      modNote = {
        stageLabel: 'Modulator Analysis · Collector-Modulated Class-C',
        equation:
          'v_{CC,\\text{eff}}(t) = V_{CC} + \\frac{R_f}{R_1}m(t), \\qquad s(t) = A_c\\!\\left[1 + \\mu_{\\text{eff}}\\frac{m(t)}{A_m}\\right]\\!\\cos(2\\pi f_c t)',
        summary: `The Bias Op-Amp scales $m(t)$ by $R_f/R_1=${biasGain.toFixed(2)}\\times$ ($\\mu_{\\text{eff}}=${effMu.toFixed(2)}$) onto the $Q_1$ collector rail while the RF tank restores a clean AM envelope.`,
        items: [
          {
            symbol: 'R_1, R_f',
            value: `${circuitValues.amTxR1K.toFixed(1)},\\;${circuitValues.amTxRfK.toFixed(1)}\\,\\text{k}\\Omega`,
            role: 'Set Bias Op-Amp gain $R_f/R_1$, directly scaling modulation index $\\mu_{\\text{eff}}$.',
          },
          {
            symbol: 'L_{\\text{RFC}}',
            value: '1\\,\\text{mH}',
            role: 'RF choke passing audio collector supply variation while blocking $f_c$ RF from the Op-Amp.',
          },
          {
            symbol: 'C_b, Q_1, R_E',
            value: '10\\,\\text{nF},\\;100\\,\\Omega',
            role: '$C_b$ injects $c(t)$ to switch $Q_1$ in Class-C; $R_E$ stabilizes emitter bias current.',
          },
          {
            symbol: 'C_3, L_t, C_t, C_{\\text{out}}',
            value: `${circuitValues.amTxLtUh}\\,\\mu\\text{H},\\;${circuitValues.amTxCtPf}\\,\\text{pF}`,
            role: '$C_3$ feeds the $L_t \\parallel C_t$ flywheel tank tuned to $f_c$ to filter Class-C pulses; $C_{\\text{out}}$ removes DC.',
          },
        ],
      };
    } else if (live.topic === 'dsb-sc' && live.dsbTopology === 'ring') {
      modNote = {
        stageLabel: 'Modulator Analysis · 4-Diode Ring Switch',
        equation:
          's_{\\text{ring}}(t) = m(t)\\,\\text{sgn}[c(t)] = \\frac{4}{\\pi}m(t)\\!\\left[\\cos\\omega_c t - \\frac{1}{3}\\cos 3\\omega_c t + \\cdots\\right]',
        summary:
          'Carrier $c(t)$ drives the diode quad as a bipolar polarity switch between transformers $T_1$ and $T_2$, suppressing the carrier completely.',
        items: [
          {
            symbol: 'R_s, T_1',
            value: `${circuitValues.dsbTxRsOhm}\\,\\Omega`,
            role: '$R_s$ sets input drive; center-tapped $T_1$ splits $m(t)$ into differential antiphase branches.',
          },
          {
            symbol: 'D_1\\text{–}D_4',
            role: 'Bridge switches: $D_1,D_2$ conduct for $c(t)>0$ (direct); $D_3,D_4$ conduct for $c(t)<0$ (inverted).',
          },
          {
            symbol: 'T_2',
            role: 'Center-tapped output transformer balancing bridge legs so $c(t)$ cancels while $m(t)\\text{sgn}(c)$ sums.',
          },
          {
            symbol: 'L_f, C_f, R_L',
            value: `${circuitValues.dsbTxLfUh}\\,\\mu\\text{H},\\;${circuitValues.dsbTxCfPf}\\,\\text{pF},\\;${circuitValues.dsbTxRlOhm}\\,\\Omega`,
            role: 'LC bandpass filter stripping odd harmonics ($3f_c,5f_c$) before load $R_L$ (when BPF is active).',
          },
        ],
      };
    } else if (live.topic === 'dsb-sc') {
      const nullErrPct =
        ((circuitValues.dsbTxR1K - circuitValues.dsbTxR2K) /
          Math.max(0.1, circuitValues.dsbTxR1K + circuitValues.dsbTxR2K)) *
        100;
      modNote = {
        stageLabel: 'Modulator Analysis · Balanced Diode Null Bridge',
        equation:
          's(t) \\propto \\left(\\frac{R_2 - R_1}{R_1 + R_2}\\right)\\!c(t) + k\\,m(t)\\cos(2\\pi f_c t)',
        summary: `Opposing bridge branches cancel $c(t)$ in $T_2$ when $R_1=R_2$ (current imbalance: $${nullErrPct.toFixed(1)}\\%$) leaving suppressed-carrier sidebands $f_c \\pm f_m$.`,
        items: [
          {
            symbol: 'R_{\\text{in}}, T_1',
            value: `${circuitValues.dsbTxRsOhm}\\,\\Omega`,
            role: '$R_{\\text{in}}$ limits baseband drive into $T_1$, which drives the upper/lower arms with $\\pm m(t)$.',
          },
          {
            symbol: 'D_1, D_2',
            role: 'Matched switching diodes gated in unison at rate $f_c$ by the carrier fed across $T_1\\text{–}T_2$ taps.',
          },
          {
            symbol: 'R_1, R_2, T_2',
            value: `${circuitValues.dsbTxR1K.toFixed(2)},\\;${circuitValues.dsbTxR2K.toFixed(2)}\\,\\text{k}\\Omega`,
            role: 'Bridge symmetry arms; equal $R_1=R_2$ yields carrier null in $T_2$, mismatch leaks $c(t)$.',
          },
          {
            symbol: 'C_t, C_{\\text{out}}, R_L',
            value: `${circuitValues.dsbTxCfPf}\\,\\text{pF},\\;${circuitValues.dsbTxRlOhm}\\,\\Omega`,
            role: '$C_t$ tunes the output tank around $f_c$; $C_{\\text{out}}$ removes DC into load $R_L$.',
          },
        ],
      };
    } else if (live.topic === 'ssb' && live.ssbMethod === 'phase') {
      modNote = {
        stageLabel: 'Modulator Analysis · Hartley Phase-Shift SSB',
        equation: `s_{\\text{${live.ssbSideband}}}(t) = \\frac{A_c}{2}\\!\\left[\\frac{m(t)\\cos\\omega_c t}{R_3} ${
          live.ssbSideband === 'USB' ? '-' : '+'
        } \\frac{\\hat{m}(t)\\sin\\omega_c t}{R_2}\\right]\\!R_{\\Sigma}`,
        summary:
          'Cancels one sideband via quadrature cancellation: an exact $-90^\\circ$ baseband Hilbert shift occurs when $\\omega_m R_H C_H = 1$ and $R_2 = R_3$.',
        items: [
          {
            symbol: 'R_1',
            value: '10\\,\\text{k}\\Omega',
            role: 'Feeds the unmodified in-phase message $m(t)$ directly into upper mixer $Q_I$.',
          },
          {
            symbol: 'C_H, R_H',
            value: `${circuitValues.ssbTxChNf}\\,\\text{nF},\\;${circuitValues.ssbTxRhK.toFixed(1)}\\,\\text{k}\\Omega`,
            role: 'All-pass Hilbert network producing $-90^\\circ$ shifted $\\hat{m}(t)$; mismatch leaks the unwanted sideband.',
          },
          {
            symbol: 'Q_I, Q_Q, C_{\\text{rf}}',
            role: 'Mix $m(t)\\cos\\omega_c t$ and $\\hat{m}(t)\\sin\\omega_c t$ using $C_{\\text{rf}}$ for the $-90^\\circ$ LO shift.',
          },
          {
            symbol: 'R_2, R_3, R_L',
            value: `${circuitValues.ssbTxR2K.toFixed(1)},\\;${circuitValues.ssbTxR3K.toFixed(1)}\\,\\text{k}\\Omega`,
            role: 'Summing branch resistors balancing $I/Q$ amplitudes before the $\\mp$ Op-Amp summer and load $R_L$.',
          },
        ],
      };
    } else if (live.topic === 'ssb') {
      modNote = {
        stageLabel: 'Modulator Analysis · Crystal Ladder Filter SSB',
        equation: `s_{\\text{DSB}}(t) = k\\,m(t)\\cos\\omega_c t \\;\\xrightarrow{H_{\\text{XTAL}}(f)}\\; s_{\\text{${live.ssbSideband}}}(t)`,
        summary:
          'Balanced mixer $Q_1$ creates both sidebands separated by energy gap $2f_a$; the dual-crystal ladder transmits only the selected sideband.',
        items: [
          {
            symbol: 'R_s, Q_1',
            value: '600\\,\\Omega',
            role: 'Source resistor $R_s$ feeds $m(t)$ into balanced mixer $Q_1$ driven by $c(t)$ to yield DSB-SC.',
          },
          {
            symbol: 'C_1, X_1, X_2',
            value: `47\\,\\text{pF},\\;N=${live.ssbFilterOrder}`,
            role: 'Coupling cap $C_1$ and series quartz crystals $X_1, X_2$ form a sharp high-$Q$ passband at USB or LSB.',
          },
          {
            symbol: 'C_{p1}, C_{p2}',
            value: `${circuitValues.ssbTxCp1Pf},\\;${circuitValues.ssbTxCp2Pf}\\,\\text{pF}`,
            role: 'Shunt ladder capacitors controlling crystal passband bandwidth and stopband skirt attenuation.',
          },
          {
            symbol: 'C_{\\text{out}}, R_L',
            value: `0.1\\,\\mu\\text{F},\\;${circuitValues.ssbTxRlOhm}\\,\\Omega`,
            role: 'AC-couples the isolated single sideband into load resistor $R_L$.',
          },
        ],
      };
    } else {
      const fTrapMHz =
        1000 / (2 * Math.PI * Math.sqrt(circuitValues.vsbL3Uh * circuitValues.vsbC4Pf));
      modNote = {
        stageLabel: 'Modulator Analysis · Modified VSB Shaping Filter',
        equation:
          'H_{\\text{VSB}}(j\\omega) \\approx H_{\\text{LC}}(j\\omega)\\!\\left(-\\frac{R_f}{1+j\\omega R_f C_f}\\right)\\!H_{\\text{trap}}(j\\omega), \\quad H(f+f_c)+H(f-f_c)=1',
        summary: `Shapes $v_{\\text{in}}=m\\cdot c(t)$ with odd-symmetric roll-off over vestige $f_v$ plus a series trap notch ($f_{\\text{trap}}\\propto ${fTrapMHz.toFixed(1)}\\,\\text{MHz}$ scaled) in the suppressed sideband.`,
        items: [
          {
            symbol: 'R_S, C_1, L_1',
            value: `${circuitValues.vsbRsOhm}\\,\\Omega,\\;${circuitValues.vsbC1Pf}\\,\\text{pF},\\;${circuitValues.vsbL1Uh.toFixed(1)}\\,\\mu\\text{H}`,
            role: 'Input source $R_S$ and series $C_1 L_1$ branch shaping the vestige transition slope $f_v$ around $f_c$.',
          },
          {
            symbol: 'L_2, C_2, C_3',
            value: `${circuitValues.vsbL2Uh.toFixed(1)}\\,\\mu\\text{H},\\;${circuitValues.vsbC2Pf}\\,\\text{pF},\\;${circuitValues.vsbC3Pf}\\,\\text{pF}`,
            role: 'Shunt $L_2 \\parallel C_2$ sets the lower vestige knee; $C_3$ couples the passive LC network to the Op-Amp.',
          },
          {
            symbol: 'R_f, C_f',
            value: `${circuitValues.vsbRfK.toFixed(2)}\\,\\text{k}\\Omega,\\;${circuitValues.vsbCfPf}\\,\\text{pF}`,
            role: 'Op-Amp feedback setting passband gain ($\\propto R_f$) and high-frequency roll-off pole ($\\frac{1}{2\\pi R_f C_f}$).',
          },
          {
            symbol: 'L_3, C_4',
            value: `${circuitValues.vsbL3Uh}\\,\\mu\\text{H},\\;${circuitValues.vsbC4Pf}\\,\\text{pF}`,
            role: 'Series-resonant shunt trap shorting out the unwanted sideband at its notch frequency.',
          },
          {
            symbol: 'C_{\\text{out}}, R_L',
            value: `${circuitValues.vsbCoutUf.toFixed(2)}\\,\\mu\\text{F},\\;${circuitValues.vsbRlOhm}\\,\\Omega`,
            role: 'Blocks Op-Amp DC bias and terminates the shaped VSB signal $v_{\\text{out}}=s_{\\text{VSB}}(t)$ across $R_L$.',
          },
        ],
      };
    }

    // -----------------------------------------------------------------------
    // DEMODULATOR STAGE ANALYSIS
    // -----------------------------------------------------------------------
    let demodNote: StageAnalysisNote;

    if (live.topic === 'motivation') {
      const tuned =
        live.fdmChannels.find((c) => c.id === live.tunedChannelId) || live.fdmChannels[0];
      const fTuneKHz =
        (tuned.fc /
          Math.sqrt(
            Math.max(0.2, circuitValues.fdmLrxUh / 100) *
              Math.max(0.2, circuitValues.fdmCvarScale)
          )) /
        1000;
      demodNote = {
        stageLabel: 'Demodulator Analysis · Tuned FDM Receiver',
        equation:
          'f_{\\text{tune}} = \\frac{1}{2\\pi\\sqrt{L_{\\text{rx}} C_{\\text{var}}}}, \\qquad f_{\\text{LPF}} = \\frac{1}{2\\pi\\sqrt{R_1 R_2 C_1 C_2}}',
        summary: `Selects channel ${tuned.id} ($f_{\\text{tune}}=${fTuneKHz.toFixed(1)}\\,\\text{kHz}$), down-converts via $Q_1$, and recovers $m_${tuned.id}(t)$ through the Sallen-Key LPF ($f_{\\text{LPF}}=${(skCutoffHz / 1000).toFixed(2)}\\,\\text{kHz}$).`,
        items: [
          {
            symbol: 'L_{\\text{rx}}, C_{\\text{var}}',
            value: `${circuitValues.fdmLrxUh}\\,\\mu\\text{H},\\;${circuitValues.fdmCvarScale.toFixed(2)}\\!\\times`,
            role: 'Parallel RF tank isolating the selected carrier $f_k$ while attenuating neighbor FDM channels.',
          },
          {
            symbol: 'Q_1, \\text{LO}',
            role: 'Synchronous BJT mixer translating channel $k$ back to baseband ($0$) and $2f_k$.',
          },
          {
            symbol: 'R_1, R_2, C_1, C_2',
            value: `${circuitValues.skR1K.toFixed(1)}\\,\\text{k}\\Omega,\\;${circuitValues.skCfNf}/${circuitValues.skC2Nf}\\,\\text{nF}`,
            role: '2nd-order Sallen-Key active LPF attenuating $2f_k$ at $-40\\,\\text{dB/dec}$ to isolate $y_o(t)$.',
          },
          {
            symbol: 'C_{\\text{out}}',
            value: `${circuitValues.skCoutUf.toFixed(2)}\\,\\mu\\text{F}`,
            role: 'Output AC coupling blocking residual DC offset.',
          },
        ],
      };
    } else if (live.topic === 'conventional-am') {
      const tauMs = circuitValues.amRxRlK * circuitValues.amRxCUf;
      const fHpHz =
        1000 / (2 * Math.PI * Math.max(0.05, circuitValues.amRxRbK) * Math.max(0.005, circuitValues.amRxCcUf));
      demodNote = {
        stageLabel: 'Demodulator Analysis · Diode + RC Envelope Detector',
        equation:
          '\\frac{1}{\\omega_c} \\ll \\tau = R_l C \\ll \\frac{1}{\\omega_m}, \\qquad f_{\\text{HP}} = \\frac{1}{2\\pi R_b C_c}',
        summary: `Peak-tracks the positive AM envelope ($\\tau=${tauMs.toFixed(2)}\\,\\text{ms}$) then strips the $A_c$ DC pedestal above $f_{\\text{HP}}=${fHpHz.toFixed(0)}\\,\\text{Hz}$.`,
        items: [
          {
            symbol: 'R_s, D_1',
            value: `${circuitValues.amRxRsOhm}\\,\\Omega`,
            role: '$D_1$ conducts on positive carrier peaks ($s > v_{RC}$); $R_s C$ sets forward charging speed.',
          },
          {
            symbol: 'C, R_l',
            value: `${circuitValues.amRxCUf.toFixed(2)}\\,\\mu\\text{F},\\;${circuitValues.amRxRlK.toFixed(2)}\\,\\text{k}\\Omega`,
            role: 'Hold cap $C$ discharges through $R_l$ ($\\tau=R_l C$): too small leaves $f_c$ ripple; too large causes diagonal clipping.',
          },
          {
            symbol: 'C_c, R_b',
            value: `${circuitValues.amRxCcUf.toFixed(2)}\\,\\mu\\text{F},\\;${circuitValues.amRxRbK.toFixed(1)}\\,\\text{k}\\Omega`,
            role: 'High-pass coupling blocking the $A_c$ DC carrier level while passing baseband $m(t)$.',
          },
          {
            symbol: '\\text{Buffer}, R_L',
            value: '1\\,\\text{k}\\Omega',
            role: 'Unity-gain Op-Amp follower prevents $R_L$ from loading the delicate RC envelope decay.',
          },
        ],
      };
    } else if (live.topic === 'dsb-sc' && live.dsbRxMode === 'costas') {
      const fIkHz =
        1e3 / (2 * Math.PI * Math.max(0.05, circuitValues.dsbCostasRiK) * Math.max(1, circuitValues.dsbCostasCiNf));
      const fQkHz =
        1e3 / (2 * Math.PI * Math.max(0.05, circuitValues.dsbCostasRqK) * Math.max(1, circuitValues.dsbCostasCqNf));
      demodNote = {
        stageLabel: 'Demodulator Analysis · Costas I/Q Carrier Loop',
        equation:
          'y_I \\propto m(t)\\cos\\phi,\\; y_Q \\propto m(t)\\sin\\phi \\;\\implies\\; e_{\\text{VCO}} = y_I y_Q \\propto \\frac{m^2(t)}{2}\\sin(2\\phi) \\to 0',
        summary: `Self-synchronizes the VCO without a pilot carrier: $I$-arm ($f_I=${fIkHz.toFixed(2)}\\,\\text{kHz}$) recovers $m(t)$ while $Q$-arm ($f_Q=${fQkHz.toFixed(2)}\\,\\text{kHz}$) tracks phase error $\\phi$.`,
        items: [
          {
            symbol: 'Q_I, Q_Q, C_\\phi',
            role: 'Quadrature BJT mixers driven $90^\\circ$ apart (via $C_\\phi$) by the VCO tank.',
          },
          {
            symbol: 'R_I, C_I',
            value: `${circuitValues.dsbCostasRiK.toFixed(1)}\\,\\text{k}\\Omega,\\;${circuitValues.dsbCostasCiNf}\\,\\text{nF}`,
            role: 'In-phase RC low-pass filter removing $2f_c$ to deliver demodulated audio $y_I(t)$.',
          },
          {
            symbol: 'R_Q, C_Q',
            value: `${circuitValues.dsbCostasRqK.toFixed(1)}\\,\\text{k}\\Omega,\\;${circuitValues.dsbCostasCqNf}\\,\\text{nF}`,
            role: 'Quadrature RC LPF isolating error term $m(t)\\sin\\phi$ for phase detection.',
          },
          {
            symbol: 'R_{\\text{loop}}, \\text{VCO}',
            value: `${circuitValues.dsbCostasRloopK.toFixed(1)}\\,\\text{k}\\Omega`,
            role: 'Loop filter multiplying $y_I \\cdot y_Q$ with gain $\\propto 1/R_{\\text{loop}}$ to steer VCO phase $\\phi \\to 0^\\circ$.',
          },
        ],
      };
    } else {
      const fHpHz =
        1000 / (2 * Math.PI * Math.max(0.05, circuitValues.skRlK) * Math.max(0.005, circuitValues.skCoutUf));
      demodNote = {
        stageLabel: 'Demodulator Analysis · Coherent Sync + Sallen-Key LPF',
        equation:
          'y_{\\text{mix}}(t) = s(t)\\cos(\\omega_c t + \\phi), \\qquad f_{\\text{LPF}} = \\frac{1}{2\\pi\\sqrt{R_1 R_2 C_f C_2}}',
        summary: `Mixes $s(t)$ with coherent $\\text{LO}$ down to baseband $+ 2f_c$, then removes the $2f_c$ image above $f_{\\text{LPF}}=${(skCutoffHz / 1000).toFixed(2)}\\,\\text{kHz}$ ($f_{\\text{HP}}=${fHpHz.toFixed(0)}\\,\\text{Hz}$).`,
        items: [
          {
            symbol: 'R_S, C_{\\text{in}}',
            value: '75\\,\\Omega,\\;0.1\\,\\mu\\text{F}',
            role: 'Input termination $R_S$ and AC-coupling capacitor $C_{\\text{in}}$ feeding $s(t)$ to $Q_1$.',
          },
          {
            symbol: 'Q_1, \\text{LO}',
            role: 'Synchronous mixer multiplying $s(t)$ by $\\cos(\\omega_c t + \\phi)$, scaling amplitude by $\\cos\\phi$.',
          },
          {
            symbol: 'R_1, R_2, C_f, C_2',
            value: `${circuitValues.skR1K.toFixed(1)}/${circuitValues.skR2K.toFixed(1)}\\,\\text{k}\\Omega,\\;${circuitValues.skCfNf}/${circuitValues.skC2Nf}\\,\\text{nF}`,
            role: '2nd-order Sallen-Key active LPF rejecting $2f_c$ ripple ($-40\\,\\text{dB/dec}$) while passing $m(t)$.',
          },
          {
            symbol: 'C_{\\text{out}}, R_L',
            value: `${circuitValues.skCoutUf.toFixed(2)}\\,\\mu\\text{F},\\;${circuitValues.skRlK.toFixed(1)}\\,\\text{k}\\Omega`,
            role: 'Output AC coupling blocking DC offset across load $R_L$ (small $C_{\\text{out}}R_L$ causes tilt droop).',
          },
        ],
      };
    }

    return { modNote, demodNote };
  }, [live, circuitValues, skCutoffHz]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
      {/* Note Card Header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full px-3.5 py-2 bg-[#FAFAF8] border-b border-slate-200/80 flex items-center justify-between gap-2 text-left hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-md bg-[#EFF3EB] border border-[#DCE5D5] text-[#1E4620] flex items-center justify-center shrink-0">
            <BookOpen className="w-3 h-3" />
          </span>
          <div>
            <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 leading-none">
              CIRCUIT ANALYSIS NOTE
            </div>
            <div className="text-[11.5px] font-bold text-[#111827] mt-0.5">
              Transfer Equations &amp; Component Roles (LaTeX)
            </div>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500">
          <span>{collapsed ? 'Show note' : 'Hide note'}</span>
          {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </span>
      </button>

      {!collapsed && (
        <div className="p-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[modNote, demodNote].map((stage, sIdx) => (
            <div
              key={stage.stageLabel}
              className={`rounded-lg border p-2.5 space-y-2 ${
                sIdx === 0
                  ? 'bg-[#FAFCF9] border-[#DCE5D5]'
                  : 'bg-[#FFFDF9] border-amber-200/70'
              }`}
            >
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#1E4620]">
                {stage.stageLabel}
              </div>

              {/* Compact LaTeX Equation Box */}
              <div className="bg-white border border-slate-200/80 rounded-md px-2.5 py-1.5 text-[11px] text-[#111827] overflow-x-auto">
                <Latex math={stage.equation} displayMode />
              </div>

              <p className="text-[11px] text-slate-700 leading-relaxed">
                <LatexText text={stage.summary} />
              </p>

              {/* Component-by-component breakdown */}
              <div className="space-y-1.5 pt-1 border-t border-slate-200/70">
                {stage.items.map((item) => (
                  <div
                    key={item.symbol}
                    className="flex items-start gap-2 text-[10.5px] leading-snug"
                  >
                    <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[#111827] font-semibold shrink-0 mt-0.5">
                      <Latex math={item.symbol} />
                    </span>
                    <div className="text-slate-600">
                      {item.value && (
                        <span className="inline-block mr-1.5 text-[10px] font-semibold text-[#1E4620]">
                          (<Latex math={item.value} />):
                        </span>
                      )}
                      <LatexText text={item.role} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
