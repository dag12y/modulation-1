import React, { useEffect, useMemo, useState } from 'react';
import {
  Sliders,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Lock,
  Waves,
  PanelRightClose,
  PanelRightOpen,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useSimulation } from '../../context/SimulationContext';
import {
  CircuitComponentValues,
  computeAntennaAndChannelData,
  DEFAULT_CIRCUIT_VALUES,
  FDMChannelConfig,
  MessageShape,
  simulateConventionalAMLab,
  simulateDSBSCLab,
  simulateFDM,
  simulateRealWorldSignal,
  simulateSSBLab,
  simulateVSBLab,
} from '../../services/chapter2Dsp';
import { DarkOscilloscopeCanvas, DarkTrace } from '../../components/studio/DarkOscilloscopeCanvas';
import { DarkSpectrumCanvas } from '../../components/studio/DarkSpectrumCanvas';
import { DarkMiniCurveCanvas } from '../../components/studio/DarkMiniCurveCanvas';
import {
  DarkMetricBox,
  DarkSectionHeader,
  DarkSegmented,
  DarkSlider,
} from '../../components/studio/DarkSliderControl';
import { StudioBenchTopic } from './OverviewStudioView';
import { Latex, LatexText } from '../../components/studio/Latex';
import {
  CircuitLiveData,
  ModDemodCircuitPanel,
} from '../../components/studio/ModDemodCircuitPanel';
import { CircuitAnalysisNoteCard } from '../../components/studio/CircuitAnalysisNoteCard';
import { ConventionalAMSimulator } from '../../components/am-lab/ConventionalAMSimulator';
import { DSBSCLabPanel } from '../../components/multi-lab/DSBSCLabPanel';
import { SSBLabPanel } from '../../components/multi-lab/SSBLabPanel';
import { VSBLabPanel } from '../../components/multi-lab/VSBLabPanel';

type BenchSubTab = 'audio-lab' | 'instrument' | 'receiver' | 'equations';

interface ExperimentBenchViewProps {
  activeTopic: StudioBenchTopic | 'motivation';
  onSelectTopic: (t: StudioBenchTopic) => void;
  resetKey: number;
}

const BENCH_STEPS: {
  id: StudioBenchTopic;
  num: string;
  shortTitle: string;
  sublabel: string;
  fullTitle: string;
  accentWord: string;
  tagline: string;
}[] = [
  {
    id: 'conventional-am',
    num: '01',
    shortTitle: 'DSB-FC',
    sublabel: 'Full carrier',
    fullTitle: 'Double Sideband',
    accentWord: 'Full Carrier.',
    tagline:
      'Conventional AM modulation & diode-RC envelope demodulation, over-modulation distortion, and square-law generation.',
  },
  {
    id: 'dsb-sc',
    num: '02',
    shortTitle: 'DSB-SC',
    sublabel: 'Suppressed carrier',
    fullTitle: 'Double Sideband',
    accentWord: 'Suppressed Carrier.',
    tagline:
      'Phase reversals, balanced ring modulation, coherent LO demodulation (quadrature null), and Costas I/Q recovery.',
  },
  {
    id: 'ssb',
    num: '03',
    shortTitle: 'SSB-SC',
    sublabel: 'Single sideband',
    fullTitle: 'Single Sideband',
    accentWord: 'Suppressed Carrier.',
    tagline:
      'Half-bandwidth USB/LSB modulation & coherent demodulation via Hilbert phase discrimination or sharp BPF.',
  },
  {
    id: 'vsb',
    num: '04',
    shortTitle: 'VSB',
    sublabel: 'Vestigial sideband',
    fullTitle: 'Vestigial',
    accentWord: 'Sideband.',
    tagline:
      'Purpose: Compare VSB shaping filter $H(f+f_c)+H(f-f_c)=1$ with DSB/SSB for distortion-free coherent recovery.',
  },
];

export const ExperimentBenchView: React.FC<ExperimentBenchViewProps> = ({
  activeTopic,
  onSelectTopic,
  resetKey,
}) => {
  const { animTime, isSimulating, simulationSpeed, triggerLocked, toggleTriggerLock } =
    useSimulation();
  const isAudioLabTopic =
    activeTopic === 'conventional-am' ||
    activeTopic === 'dsb-sc' ||
    activeTopic === 'ssb' ||
    activeTopic === 'vsb';

  const [subTab, setSubTab] = useState<BenchSubTab>(
    isAudioLabTopic ? 'audio-lab' : 'instrument'
  );

  useEffect(() => {
    if (
      activeTopic === 'conventional-am' ||
      activeTopic === 'dsb-sc' ||
      activeTopic === 'ssb' ||
      activeTopic === 'vsb'
    ) {
      setSubTab('audio-lab');
    } else {
      setSubTab((prev) => (prev === 'audio-lab' ? 'instrument' : prev));
    }
  }, [activeTopic]);
  const [scopeMode, setScopeMode] = useState<'stacked' | 'overlay'>('stacked');
  const [twoSidedSpec, setTwoSidedSpec] = useState<boolean>(false);
  const [specScale, setSpecScale] = useState<'linear' | 'dB'>('linear');
  const [paramsCollapsed, setParamsCollapsed] = useState<boolean>(false);

  // Shared RF / Baseband controls
  const [fc, setFc] = useState<number>(10000);
  const [Ac, setAc] = useState<number>(1.0);
  const [fm, setFm] = useState<number>(1000);
  const [Am, setAm] = useState<number>(1.0);
  const [mu, setMu] = useState<number>(0.7);
  const [messageShape, setMessageShape] = useState<MessageShape>('sine');

  // 01. Motivation & FDM state
  const [realKind, setRealKind] = useState<'voice' | 'sensor'>('voice');
  const [antennaFcMHz, setAntennaFcMHz] = useState<number>(1.0);
  const [medium, setMedium] = useState<'twisted-pair' | 'coax' | 'waveguide' | 'atmosphere'>(
    'coax'
  );
  const [fdmChannels, setFdmChannels] = useState<FDMChannelConfig[]>([
    { id: 1, label: 'Ch 1', enabled: true, fc: 8000, fm: 700, Am: 1.0, color: '#0284C7' },
    { id: 2, label: 'Ch 2', enabled: true, fc: 14000, fm: 900, Am: 1.0, color: '#15803D' },
    { id: 3, label: 'Ch 3', enabled: true, fc: 20000, fm: 600, Am: 1.0, color: '#D97706' },
  ]);
  const [tunedChannelId, setTunedChannelId] = useState<number>(1);

  // 02. Conventional AM state
  const [amModulatorMode, setAmModulatorMode] = useState<'linear' | 'square-law'>('linear');
  const [rcTimeMs, setRcTimeMs] = useState<number>(0.35);

  // 03. DSB-SC state
  const [dsbTopology, setDsbTopology] = useState<'product' | 'ring'>('product');
  const [ringFiltered, setRingFiltered] = useState<boolean>(true);
  const [dsbRxMode, setDsbRxMode] = useState<'coherent' | 'costas'>('coherent');
  const [loPhaseErrorDeg, setLoPhaseErrorDeg] = useState<number>(0);
  const [loFreqOffsetHz, setLoFreqOffsetHz] = useState<number>(0);
  const [costasInitDeg, setCostasInitDeg] = useState<number>(55);
  const [costasGain, setCostasGain] = useState<number>(1.2);

  // 04. SSB state
  const [ssbSideband, setSsbSideband] = useState<'USB' | 'LSB'>('USB');
  const [ssbMethod, setSsbMethod] = useState<'phase' | 'frequency'>('phase');
  const [ssbFilterOrder, setSsbFilterOrder] = useState<number>(4);
  const [ssbEnergyGapHz, setSsbEnergyGapHz] = useState<number>(0);
  const [ssbPhaseErrDeg, setSsbPhaseErrDeg] = useState<number>(0);

  // 04. VSB state
  const [vsbW, setVsbW] = useState<number>(2000);
  const [vsbVestigeRatio, setVsbVestigeRatio] = useState<number>(0.25);
  const [vsbSkew, setVsbSkew] = useState<number>(0);

  const [plotExpanded, setPlotExpanded] = useState<boolean>(false);
  const [scopeZoom, setScopeZoom] = useState<1 | 2 | 4>(1);

  const deriveCircuitFromSpecs = (
    specs: {
      activeTopic: StudioBenchTopic | 'motivation';
      fc: number;
      fm: number;
      rcTimeMs: number;
      ssbSideband: 'USB' | 'LSB';
      vsbW: number;
      vsbVestigeRatio: number;
    },
    base: CircuitComponentValues = DEFAULT_CIRCUIT_VALUES
  ): CircuitComponentValues => {
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const round1 = (v: number) => Number(v.toFixed(1));
    const fcScale = 10000 / Math.max(1000, specs.fc);
    const fmScale = 1000 / Math.max(200, specs.fm);
    const targetBw = specs.activeTopic === 'vsb' ? Math.max(400, specs.vsbW) : Math.max(200, specs.fm);
    const bwScale = 1000 / targetBw;

    return {
      ...base,
      // AM TX tank & RX envelope detector
      amTxLtUh: clamp(round1(DEFAULT_CIRCUIT_VALUES.amTxLtUh * fcScale), 4, 80),
      amTxCtPf: clamp(Math.round(DEFAULT_CIRCUIT_VALUES.amTxCtPf / fcScale), 40, 800),
      amRxCUf: clamp(Number((specs.rcTimeMs / Math.max(0.1, base.amRxRlK)).toFixed(3)), 0.02, 3.5),

      // DSB-SC ring tank & Costas I/Q arm LPFs
      dsbTxLfUh: clamp(round1(DEFAULT_CIRCUIT_VALUES.dsbTxLfUh * fcScale), 2, 50),
      dsbTxCfPf: clamp(Math.round(DEFAULT_CIRCUIT_VALUES.dsbTxCfPf / fcScale), 40, 800),
      dsbCostasCiNf: clamp(Math.round(DEFAULT_CIRCUIT_VALUES.dsbCostasCiNf * fmScale), 15, 470),
      dsbCostasCqNf: clamp(Math.round(DEFAULT_CIRCUIT_VALUES.dsbCostasCqNf * fmScale), 15, 470),

      // SSB Hilbert RC & crystal BPF capacitors
      ssbTxRhK: clamp(round1(DEFAULT_CIRCUIT_VALUES.ssbTxRhK * fmScale), 2, 47),
      ssbTxChNf: clamp(round1(DEFAULT_CIRCUIT_VALUES.ssbTxChNf / fmScale), 3, 68),
      ssbTxCp1Pf: clamp(
        Math.round(DEFAULT_CIRCUIT_VALUES.ssbTxCp1Pf * (specs.ssbSideband === 'USB' ? 0.92 : 1.08)),
        40,
        400
      ),
      ssbTxCp2Pf: clamp(
        Math.round(DEFAULT_CIRCUIT_VALUES.ssbTxCp2Pf * (specs.ssbSideband === 'USB' ? 1.08 : 0.92)),
        40,
        400
      ),

      // VSB shaping ladder & roll-off capacitor
      vsbL1Uh: clamp(round1(DEFAULT_CIRCUIT_VALUES.vsbL1Uh * fcScale), 2, 50),
      vsbC1Pf: clamp(Math.round(DEFAULT_CIRCUIT_VALUES.vsbC1Pf / fcScale), 30, 600),
      vsbL2Uh: clamp(round1(DEFAULT_CIRCUIT_VALUES.vsbL2Uh * fcScale), 2, 40),
      vsbC2Pf: clamp(Math.round(DEFAULT_CIRCUIT_VALUES.vsbC2Pf / fcScale), 40, 800),
      vsbCfPf: clamp(
        Math.round(DEFAULT_CIRCUIT_VALUES.vsbCfPf * (0.25 / Math.max(0.08, specs.vsbVestigeRatio))),
        8,
        120
      ),
      vsbL3Uh: clamp(round1(DEFAULT_CIRCUIT_VALUES.vsbL3Uh * fcScale), 3, 60),
      vsbC4Pf: clamp(Math.round(DEFAULT_CIRCUIT_VALUES.vsbC4Pf / fcScale), 40, 700),

      // Shared Sallen-Key Active LPF tracks message bandwidth
      skCfNf: clamp(round1(DEFAULT_CIRCUIT_VALUES.skCfNf * bwScale), 1.5, 47),
      skC2Nf: clamp(round1(DEFAULT_CIRCUIT_VALUES.skC2Nf * bwScale), 0.8, 22),
    };
  };

  // Editable Schematic Component Values (auto-synced with specification sliders & DSP)
  const [circuitValues, setCircuitValues] = useState<CircuitComponentValues>(() =>
    deriveCircuitFromSpecs({
      activeTopic,
      fc,
      fm,
      rcTimeMs,
      ssbSideband,
      vsbW,
      vsbVestigeRatio,
    })
  );

  // Automatically recalculate realizing circuit components whenever specification sliders change
  useEffect(() => {
    setCircuitValues((prev) =>
      deriveCircuitFromSpecs(
        {
          activeTopic,
          fc,
          fm,
          rcTimeMs,
          ssbSideband,
          vsbW,
          vsbVestigeRatio,
        },
        prev
      )
    );
  }, [activeTopic, fc, fm, rcTimeMs, ssbSideband, vsbW, vsbVestigeRatio]);

  const handleUpdateCircuit = (patch: Partial<CircuitComponentValues>) => {
    setCircuitValues((prev) => {
      const next = { ...prev, ...patch };
      if (patch.amRxCUf !== undefined || patch.amRxRlK !== undefined) {
        const tauMs = Math.max(0.02, Math.min(3.5, next.amRxCUf * next.amRxRlK));
        setRcTimeMs(Number(tauMs.toFixed(3)));
      }
      return next;
    });
  };

  const handleResetCircuit = () => {
    setCircuitValues(
      deriveCircuitFromSpecs({
        activeTopic,
        fc,
        fm,
        rcTimeMs,
        ssbSideband,
        vsbW,
        vsbVestigeRatio,
      })
    );
  };

  const handleRcSliderChange = (newRcMs: number) => {
    setRcTimeMs(newRcMs);
    setCircuitValues((prev) => ({
      ...prev,
      amRxCUf: Number((newRcMs / Math.max(0.1, prev.amRxRlK)).toFixed(3)),
    }));
  };

  // Reset defaults on explicit Reset button
  useEffect(() => {
    if (resetKey === 0) return;
    setFc(10000);
    setAc(1.0);
    setFm(1000);
    setAm(1.0);
    setMu(0.7);
    setMessageShape('sine');
    setRealKind('voice');
    setAntennaFcMHz(1.0);
    setMedium('coax');
    setFdmChannels([
      { id: 1, label: 'Ch 1', enabled: true, fc: 8000, fm: 700, Am: 1.0, color: '#0284C7' },
      { id: 2, label: 'Ch 2', enabled: true, fc: 14000, fm: 900, Am: 1.0, color: '#15803D' },
      { id: 3, label: 'Ch 3', enabled: true, fc: 20000, fm: 600, Am: 1.0, color: '#D97706' },
    ]);
    setTunedChannelId(1);
    setAmModulatorMode('linear');
    setRcTimeMs(0.35);
    setDsbTopology('product');
    setRingFiltered(true);
    setDsbRxMode('coherent');
    setLoPhaseErrorDeg(0);
    setLoFreqOffsetHz(0);
    setCostasInitDeg(55);
    setCostasGain(1.2);
    setSsbSideband('USB');
    setSsbMethod('phase');
    setSsbFilterOrder(4);
    setSsbEnergyGapHz(0);
    setSsbPhaseErrDeg(0);
    setVsbW(2000);
    setVsbVestigeRatio(0.25);
    setVsbSkew(0);
    setCircuitValues({ ...DEFAULT_CIRCUIT_VALUES });
  }, [resetKey]);

  const stepMeta = BENCH_STEPS.find((s) => s.id === activeTopic) || BENCH_STEPS[1];

  // Live Simulations
  const fdmSim = useMemo(() => {
    if (activeTopic !== 'motivation') return null;
    return simulateFDM({
      channels: fdmChannels,
      tunedChannelId,
      timeOffset: animTime,
      circuit: circuitValues,
    });
  }, [activeTopic, fdmChannels, tunedChannelId, animTime, circuitValues]);

  const realWorldSim = useMemo(() => {
    if (activeTopic !== 'motivation') return null;
    return simulateRealWorldSignal(realKind, animTime);
  }, [activeTopic, realKind, animTime]);

  const antennaData = useMemo(() => {
    if (activeTopic !== 'motivation') return null;
    return computeAntennaAndChannelData(antennaFcMHz * 1e6, medium);
  }, [activeTopic, antennaFcMHz, medium]);

  const amSim = useMemo(() => {
    if (activeTopic !== 'conventional-am') return null;
    return simulateConventionalAMLab({
      Ac,
      fc,
      fm,
      mu,
      messageShape,
      rcTimeMs,
      modulatorMode: amModulatorMode,
      timeOffset: animTime,
      circuit: circuitValues,
    });
  }, [activeTopic, Ac, fc, fm, mu, messageShape, rcTimeMs, amModulatorMode, animTime, circuitValues]);

  const amEffCurve = useMemo(() => {
    const x: number[] = [];
    const y: number[] = [];
    for (let m = 0; m <= 1.0; m += 0.05) {
      x.push(Number(m.toFixed(2)));
      y.push(((m * m) / (2 + m * m)) * 100);
    }
    return { x, y };
  }, []);

  const dsbSim = useMemo(() => {
    if (activeTopic !== 'dsb-sc') return null;
    return simulateDSBSCLab({
      Ac,
      fc,
      fm,
      Am,
      messageShape,
      modulatorTopology: dsbTopology,
      ringFiltered,
      receiverMode: dsbRxMode,
      loPhaseErrorDeg,
      loFreqOffsetHz,
      costasInitialPhaseDeg: costasInitDeg,
      costasLoopGain: costasGain,
      timeOffset: animTime,
      circuit: circuitValues,
    });
  }, [
    activeTopic,
    Ac,
    fc,
    fm,
    Am,
    messageShape,
    dsbTopology,
    ringFiltered,
    dsbRxMode,
    loPhaseErrorDeg,
    loFreqOffsetHz,
    costasInitDeg,
    costasGain,
    animTime,
    circuitValues,
  ]);

  const ssbSim = useMemo(() => {
    if (activeTopic !== 'ssb') return null;
    return simulateSSBLab({
      Ac,
      fc,
      fm,
      Am,
      sideband: ssbSideband,
      method: ssbMethod,
      messageShape,
      filterOrder: ssbFilterOrder,
      energyGapHz: ssbEnergyGapHz,
      loPhaseErrorDeg: ssbPhaseErrDeg,
      timeOffset: animTime,
      circuit: circuitValues,
    });
  }, [
    activeTopic,
    Ac,
    fc,
    fm,
    Am,
    ssbSideband,
    ssbMethod,
    messageShape,
    ssbFilterOrder,
    ssbEnergyGapHz,
    ssbPhaseErrDeg,
    animTime,
    circuitValues,
  ]);

  const vsbSim = useMemo(() => {
    if (activeTopic !== 'vsb') return null;
    return simulateVSBLab({
      Ac,
      fc,
      W: vsbW,
      Am,
      vestigeRatio: vsbVestigeRatio,
      symmetrySkew: vsbSkew,
      timeOffset: animTime,
      circuit: circuitValues,
    });
  }, [activeTopic, Ac, fc, vsbW, Am, vsbVestigeRatio, vsbSkew, animTime, circuitValues]);

  const updateFdmCh = (id: number, patch: Partial<FDMChannelConfig>) => {
    setFdmChannels((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  // Equations & Insight content per topic (authentic KaTeX LaTeX)
  const theoryCard = useMemo(() => {
    if (activeTopic === 'motivation') {
      return {
        formula: String.raw`s_{\text{FDM}}(t) = \sum_{k=1}^{3} m_k(t)\cos(2\pi f_k t) \qquad l \approx \frac{\lambda}{4} = \frac{c}{4f_c}`,
        caption:
          'Spectrum shifting moves baseband signals to non-overlapping carrier slots and reduces antenna size by orders of magnitude.',
        insightTitle: 'Why we modulate.',
        insightBody:
          'A $1\\,\\text{kHz}$ audio wave requires a $75\\,\\text{km}$ quarter-wave antenna; shifting it to $1\\,\\text{MHz}$ shrinks the antenna to $75\\,\\text{m}$ and enables multi-user FDM.',
        stats: [
          {
            label: 'Quarter-Wave $\\lambda/4$',
            val: antennaData ? `${antennaData.quarterWaveMeters.toFixed(2)} m` : '—',
          },
          {
            label: 'ITU Band',
            val: antennaData ? antennaData.bandInfo.band.split(' ')[0] : '—',
          },
          { label: 'FDM Rx Dial', val: fdmSim ? fdmSim.tunedLabel : 'Ch 1' },
          {
            label: 'Guard Bands',
            val: fdmSim && fdmSim.overlaps.length > 0 ? `${fdmSim.overlaps.length} overlap` : 'Clean',
          },
        ],
      };
    }
    if (activeTopic === 'conventional-am') {
      return {
        formula: String.raw`s(t) = A_c\left[1 + \mu\, m_n(t)\right]\cos(2\pi f_c t) \qquad \eta = \frac{\mu^2}{2 + \mu^2}`,
        caption: 'Amplitude variation tracks the message envelope when $\\mu \\le 1$.',
        insightTitle: 'The envelope tells the story.',
        insightBody:
          amSim?.isOvermodulated
            ? 'Over-modulation ($\\mu > 1$) causes $180^\\circ$ phase reversals; a diode $+ RC$ envelope detector clips and distorts the recovered message.'
            : 'The carrier consumes most power ($\\eta \\le 33.3\\%$ single-tone), enabling a low-cost diode $+ RC$ envelope detector ($\\frac{1}{\\omega_c} \\ll RC \\ll \\frac{1}{\\omega_m}$).',
        stats: [
          { label: 'Carrier', val: 'Transmitted' },
          { label: 'Sidebands', val: 'USB + LSB' },
          { label: 'Bandwidth ($2B_m$)', val: `${((amSim?.bandwidthHz || 2000) / 1000).toFixed(1)} kHz` },
          { label: 'Efficiency $\\eta$', val: `${(amSim?.efficiencyPct || 19.7).toFixed(1)}%` },
        ],
      };
    }
    if (activeTopic === 'dsb-sc') {
      return {
        formula: String.raw`s(t) = A_c m(t)\cos(2\pi f_c t) \qquad v_o(t) = \frac{1}{2}A_c A_c' m(t)\cos(\phi)`,
        caption: 'Zero crossings of $m(t)$ trigger $180^\\circ$ carrier phase reversals.',
        insightTitle: 'All power carries information.',
        insightBody:
          'Suppressing the carrier achieves $\\eta = 100\\%$ power efficiency, but requires coherent LO synchronization or a Costas $I/Q$ loop to prevent quadrature null at $\\phi = \\pm 90^\\circ$.',
        stats: [
          { label: 'Carrier', val: 'Suppressed' },
          { label: 'Sidebands', val: 'USB + LSB' },
          { label: 'Bandwidth ($2B_m$)', val: `${((dsbSim?.bandwidthHz || 2000) / 1000).toFixed(1)} kHz` },
          {
            label: dsbRxMode === 'costas' ? 'Costas Lock $\\phi$' : 'Coherent Gain',
            val:
              dsbRxMode === 'costas'
                ? `$${(dsbSim?.finalPhaseDeg || 0).toFixed(1)}^\\circ$`
                : `$\\cos(\\phi) = ${(dsbSim?.gainFactor || 1).toFixed(2)}$`,
          },
        ],
      };
    }
    if (activeTopic === 'ssb') {
      return {
        formula:
          ssbSideband === 'USB'
            ? String.raw`s_{\text{USB}}(t) = \frac{A_c}{2}\left[m(t)\cos(2\pi f_c t) - \hat{m}(t)\sin(2\pi f_c t)\right]`
            : String.raw`s_{\text{LSB}}(t) = \frac{A_c}{2}\left[m(t)\cos(2\pi f_c t) + \hat{m}(t)\sin(2\pi f_c t)\right]`,
        caption:
          'Hilbert transform $\\hat{m}(t) = \\frac{1}{\\pi}\\int_{-\\infty}^{\\infty} \\frac{m(\\tau)}{t-\\tau}\\,d\\tau$ cancels the unwanted sideband.',
        insightTitle: 'Half the spectrum, full message.',
        insightBody:
          'SSB transmits only USB or LSB, cutting bandwidth to $W$ while keeping $100\\%$ sideband efficiency. Frequency discrimination benefits from a baseband gap $f_a$.',
        stats: [
          { label: 'Carrier', val: 'Suppressed' },
          { label: 'Sideband', val: `${ssbSideband} Only` },
          { label: 'Bandwidth ($B_T=W$)', val: `${((ssbSim?.bandwidthHz || 1000) / 1000).toFixed(2)} kHz` },
          {
            label: 'Method',
            val: ssbMethod === 'phase' ? 'Hilbert Phase' : `BPF Order ${ssbFilterOrder}`,
          },
        ],
      };
    }
    return {
      formula: String.raw`H(f + f_c) + H(f - f_c) = 1 \;\; (|f| \le W) \qquad B_T = W + f_v`,
      caption: 'Complementary filter symmetry around $f_c$ prevents vestigial distortion.',
      insightTitle: 'Practical filter compromise.',
      insightBody:
        'VSB keeps a vestigial slice $f_v$ of the opposite sideband so realizable filters can roll off smoothly without losing low-frequency baseband energy.',
      stats: [
        { label: 'Vestige Ratio $f_v/W$', val: `${Math.round(vsbVestigeRatio * 100)}%` },
        { label: 'Vestige $f_v$', val: `${((vsbSim?.fv || 500) / 1000).toFixed(2)} kHz` },
        { label: 'Bandwidth ($W+f_v$)', val: `${((vsbSim?.bandwidthHz || 2500) / 1000).toFixed(2)} kHz` },
        {
          label: 'Symmetry Skew',
          val: vsbSkew === 0 ? 'Balanced ($1.00$)' : `Skew $${vsbSkew.toFixed(2)}$`,
        },
      ],
    };
  }, [
    activeTopic,
    antennaData,
    fdmSim,
    amSim,
    dsbSim,
    dsbRxMode,
    ssbSideband,
    ssbSim,
    ssbMethod,
    ssbFilterOrder,
    vsbVestigeRatio,
    vsbSim,
    vsbSkew,
  ]);

  // Build Oscilloscope Traces (INCLUDING Demodulated Waveforms!) & Spectrum Props
  const getPlotConfig = (): {
    scopeTitle: string;
    scopePills: string[];
    traces: DarkTrace[];
    xMult: number;
    xLabel: string;
    tArr: number[];
    spectrum: NonNullable<typeof amSim>['spectrum'];
    secondarySpectra?: {
      spectrum: NonNullable<typeof amSim>['spectrum'];
      color: string;
      label: string;
    }[];
    carrierFreqHz?: number;
    minFreqHz: number;
    maxFreqHz: number;
    filterOverlay?: { frequencies: number[]; response: number[]; color?: string };
    bwTitle: string;
    bwValue: string;
    bwSub: string;
  } => {
    if (activeTopic === 'motivation' && fdmSim && realWorldSim) {
      if (subTab === 'receiver') {
        return {
          scopeTitle: 'Real-World Baseband Signal',
          scopePills: [realKind === 'voice' ? 'Voice 300–3400 Hz' : 'Sensor < 1 Hz'],
          traces: [
            {
              id: 'real-baseband',
              label: realKind === 'voice' ? 'Voice m(t)' : 'Sensor m(t)',
              sublabel: realWorldSim.bandDesc,
              color: '#0284C7',
              data: realWorldSim.samples,
            },
          ],
          xMult: realWorldSim.xMult,
          xLabel: realWorldSim.xLabel,
          tArr: realWorldSim.t,
          spectrum: realWorldSim.spectrum,
          minFreqHz: 0,
          maxFreqHz: realWorldSim.maxFreqHz,
          bwTitle: 'ANTENNA $\\lambda/4$',
          bwValue: `${
            antennaData
              ? antennaData.quarterWaveMeters >= 1000
                ? `${(antennaData.quarterWaveMeters / 1000).toFixed(2)} km`
                : `${antennaData.quarterWaveMeters.toFixed(2)} m`
              : '—'
          }`,
          bwSub: antennaData
            ? `${antennaData.bandInfo.band} · ${antennaData.bandInfo.useCase}`
            : '',
        };
      }
      return {
        scopeTitle: 'FDM Modulation & Tuned Demodulation',
        scopePills: [
          `Rx Dial: ${fdmSim.tunedLabel}`,
          fdmSim.overlaps.length > 0 ? 'OVERLAP!' : 'Guard Bands OK',
        ],
        traces: [
          {
            id: 'fdm-sum',
            label: 'Σ m_k(t)',
            sublabel: 'Baseband Input Sum',
            color: '#0284C7',
            data: fdmSim.basebandSum,
          },
          {
            id: 'fdm-comp',
            label: 's_FDM(t)',
            sublabel: 'Multiplexed Passband',
            color: '#15803D',
            data: fdmSim.composite,
          },
          {
            id: 'fdm-c-ov',
            label: `c_${fdmSim.tunedChannelId}(t)`,
            color: 'rgba(124, 58, 237, 0.36)',
            data: fdmSim.tunedCarrier,
            lineDash: [2, 2],
            lineWidth: 1.05,
            overlayOnId: 'fdm-comp',
            zOrder: 'back',
          },
          {
            id: 'fdm-sum-ov',
            label: 'Σ m_k(t)',
            color: '#0284C7',
            data: fdmSim.basebandSum,
            lineDash: [5, 3],
            lineWidth: 1.4,
            overlayOnId: 'fdm-comp',
            zOrder: 'front',
          },
          {
            id: 'fdm-rx',
            label: 'y_demod(t)',
            sublabel: `Recovered ${fdmSim.tunedLabel}`,
            color: '#EA580C',
            data: fdmSim.rxRecovered,
          },
          {
            id: 'fdm-rx-c-ov',
            label: `c_${fdmSim.tunedChannelId}(t)`,
            color: 'rgba(124, 58, 237, 0.30)',
            data: fdmSim.tunedCarrier,
            lineDash: [2, 2],
            lineWidth: 1.0,
            overlayOnId: 'fdm-rx',
            zOrder: 'back',
          },
          {
            id: 'fdm-rx-m-ov',
            label: `m_${fdmSim.tunedChannelId}(t)`,
            color: '#0284C7',
            data: fdmSim.perChannelBase[fdmSim.tunedChannelId] || fdmSim.basebandSum,
            lineDash: [5, 3],
            lineWidth: 1.45,
            overlayOnId: 'fdm-rx',
            zOrder: 'front',
          },
        ],
        xMult: 1000,
        xLabel: 'Time / ms',
        tArr: fdmSim.t,
        spectrum: fdmSim.passbandSpectrum,
        secondarySpectra: [
          { spectrum: fdmSim.basebandSpectrum, color: '#0284C7', label: 'Baseband' },
        ],
        minFreqHz: 0,
        maxFreqHz: 25000,
        bwTitle: 'FDM RECEIVER DIAL',
        bwValue: fdmSim.tunedLabel,
        bwSub:
          fdmSim.overlaps.length > 0
            ? `Spectral collision: ${fdmSim.overlaps.join(', ')}`
            : 'All active channels cleanly separated in frequency.',
      };
    }

    if (activeTopic === 'conventional-am' && amSim) {
      if (subTab === 'receiver') {
        return {
          scopeTitle:
            amModulatorMode === 'square-law'
              ? 'Envelope Detector & Square-Law Circuit'
              : 'Half-Wave Diode & RC Envelope Detector',
          scopePills: [
            `$RC = ${rcTimeMs.toFixed(2)}\\,\\text{ms}$`,
            `$\\mu = ${mu.toFixed(2)}$`,
            amSim.isOvermodulated ? 'OVER-MODULATED ($\\mu > 1$)' : 'Clean Envelope',
          ],
          traces: [
            {
              id: 'rect',
              label: 'v_diode(t)',
              sublabel: 'Diode Half-Wave + RC Output',
              color: '#0284C7',
              data: amSim.rectified,
            },
            {
              id: 'rc',
              label: 'v_RC(t)',
              sublabel: `RC Envelope (τ=${rcTimeMs.toFixed(2)} ms)`,
              color: '#EA580C',
              data: amSim.rcDetected,
              overlayOnId: 'rect',
            },
            {
              id: 'orig-m',
              label: 'm(t)+Ac',
              sublabel: 'Ideal Envelope',
              color: '#15803D',
              data: amSim.message.map((v) => v + Ac),
              lineDash: [4, 3],
              overlayOnId: 'rect',
            },
            ...(amModulatorMode === 'square-law'
              ? [
                  {
                    id: 'sq-raw',
                    label: 'v₂(t)',
                    sublabel: 'Square-Law Raw (DC + 2fc)',
                    color: '#7C3AED',
                    data: amSim.squareLawRaw,
                  },
                ]
              : [
                  {
                    id: 's-am',
                    label: 's(t)',
                    sublabel: 'AM Input',
                    color: '#15803D',
                    data: amSim.modulated,
                  },
                ]),
          ],
          xMult: 1000,
          xLabel: 'Time / ms',
          tArr: amSim.t,
          spectrum: amSim.spectrum,
          carrierFreqHz: fc,
          minFreqHz: amModulatorMode === 'square-law' ? 0 : Math.max(0, fc - fm * 4),
          maxFreqHz: amModulatorMode === 'square-law' ? fc * 2.5 : fc + fm * 4,
          bwTitle: 'POWER EFFICIENCY $\\eta$',
          bwValue: `${amSim.efficiencyPct.toFixed(1)}%`,
          bwSub: `Ideal $RC$ range ($\\frac{1}{\\omega_c} \\ll RC \\ll \\frac{1}{\\omega_m}$): $${amSim.rcMinIdealMs.toFixed(3)} - ${amSim.rcMaxIdealMs.toFixed(
            2
          )}\\,\\text{ms}$`,
        };
      }
      return {
        scopeTitle: 'Modulation & Envelope Demodulation',
        scopePills: [
          `$f_m = ${(fm / 1000).toFixed(1)}\\,\\text{kHz}$`,
          `$f_c = ${(fc / 1000).toFixed(0)}\\,\\text{kHz}$`,
          `$\\mu = ${mu.toFixed(2)}$`,
          `$RC = ${rcTimeMs.toFixed(2)}\\,\\text{ms}$`,
        ],
        traces: [
          {
            id: 'm',
            label: 'm(t)',
            sublabel: `Message (${(fm / 1000).toFixed(1)} kHz)`,
            color: '#0284C7',
            data: amSim.message,
          },
          {
            id: 'c',
            label: 'c(t)',
            sublabel: `Carrier (${(fc / 1000).toFixed(0)} kHz)`,
            color: '#7C3AED',
            data: amSim.carrier,
          },
          {
            id: 's',
            label: 's(t)',
            sublabel: amModulatorMode === 'square-law' ? 'Square-Law AM' : 'DSB-FC Modulated',
            color: '#15803D',
            data: amSim.modulated,
          },
          {
            id: 's-c-ov',
            label: 'c(t)',
            color: 'rgba(124, 58, 237, 0.42)',
            data: amSim.carrier,
            lineDash: [2, 2],
            lineWidth: 1.1,
            overlayOnId: 's',
            zOrder: 'back',
          },
          {
            id: 's-m-ov',
            label: 'm(t)',
            color: '#0284C7',
            data: amSim.message,
            lineDash: [5, 3],
            lineWidth: 1.45,
            overlayOnId: 's',
            zOrder: 'front',
          },
          {
            id: 's-env-ov',
            label: '±Env',
            color: '#D97706',
            data: amSim.upperEnv,
            lineDash: [3, 3],
            lineWidth: 1.2,
            overlayOnId: 's',
            zOrder: 'front',
          },
          {
            id: 'demod-am',
            label: 'y_demod(t)',
            sublabel: amSim.isOvermodulated ? 'Distorted RC Recovery' : 'RC Envelope Demodulated',
            color: '#EA580C',
            data: amSim.rcDemodAC,
          },
          {
            id: 'demod-am-c-ov',
            label: 'c(t)',
            color: 'rgba(124, 58, 237, 0.30)',
            data: amSim.carrier.map((v) => v * Math.min(1, Math.max(0.35, mu))),
            lineDash: [2, 2],
            lineWidth: 1.0,
            overlayOnId: 'demod-am',
            zOrder: 'back',
          },
          {
            id: 'demod-am-m-ov',
            label: 'm(t)',
            color: '#0284C7',
            data: amSim.message,
            lineDash: [5, 3],
            lineWidth: 1.45,
            overlayOnId: 'demod-am',
            zOrder: 'front',
          },
          ...(scopeMode === 'overlay'
            ? [
                {
                  id: 'env-l',
                  label: '-Env',
                  color: '#D97706',
                  data: amSim.lowerEnv,
                  lineDash: [4, 3],
                },
              ]
            : []),
        ],
        xMult: 1000,
        xLabel: 'Time / ms',
        tArr: amSim.t,
        spectrum: amModulatorMode === 'square-law' ? amSim.amFilteredSpectrum : amSim.spectrum,
        carrierFreqHz: fc,
        minFreqHz: Math.max(0, fc - fm * 4),
        maxFreqHz: fc + fm * 4,
        bwTitle: 'OCCUPIED BANDWIDTH',
        bwValue: `${(amSim.bandwidthHz / 1000).toFixed(1)} kHz`,
        bwSub: `Carrier at $${(fc / 1000).toFixed(0)}\\,\\text{kHz}$ · $\\eta = ${amSim.efficiencyPct.toFixed(
          1
        )}\\%$ · $A_{\\max} = ${amSim.Amax.toFixed(2)}\\,\\text{V}$`,
      };
    }

    if (activeTopic === 'dsb-sc' && dsbSim) {
      if (subTab === 'receiver') {
        return {
          scopeTitle: dsbRxMode === 'costas' ? 'Costas Loop I/Q Recovery' : 'Coherent I/Q Detector',
          scopePills: [
            dsbRxMode === 'costas'
              ? `Final $\\phi = ${dsbSim.finalPhaseDeg.toFixed(1)}^\\circ$`
              : `LO $\\phi = ${loPhaseErrorDeg}^\\circ$`,
            `$\\Delta f_c = ${loFreqOffsetHz}\\,\\text{Hz}$`,
          ],
          traces: [
            {
              id: 'm-ref',
              label: 'm(t) tx',
              sublabel: 'Original Message vs I-Arm',
              color: '#0284C7',
              data: dsbSim.message,
            },
            {
              id: 'demod-i',
              label: 'y_I(t) demod',
              sublabel: 'In-Phase Demodulated',
              color: '#EA580C',
              data: dsbSim.demodI,
              overlayOnId: 'm-ref',
            },
            {
              id: 'demod-q',
              label: 'y_Q(t)',
              sublabel: 'Quadrature Arm',
              color: '#D97706',
              data: dsbSim.demodQ,
            },
          ],
          xMult: 1000,
          xLabel: 'Time / ms',
          tArr: dsbSim.t,
          spectrum: dsbSim.spectrum,
          minFreqHz: Math.max(0, fc - fm * 4),
          maxFreqHz: fc + fm * 4,
          bwTitle: dsbRxMode === 'costas' ? 'COSTAS VCO LOCK $\\phi$' : 'COHERENT GAIN $\\cos(\\phi)$',
          bwValue:
            dsbRxMode === 'costas'
              ? `${dsbSim.finalPhaseDeg.toFixed(1)}°`
              : `${dsbSim.gainFactor.toFixed(2)}×`,
          bwSub:
            Math.abs(loPhaseErrorDeg) === 90 && dsbRxMode === 'coherent'
              ? 'Quadrature Null! Output vanishes at $\\phi = \\pm 90^\\circ$ LO phase error.'
              : 'Carrier suppressed · $100\\%$ power efficiency in sidebands.',
        };
      }
      return {
        scopeTitle: 'DSB-SC Modulation & Coherent Demodulation',
        scopePills: [
          dsbTopology === 'ring' ? '4-Diode Ring' : 'Product',
          dsbRxMode === 'costas' ? 'Costas Rx' : `LO $\\phi = ${loPhaseErrorDeg}^\\circ$`,
        ],
        traces: [
          {
            id: 'm-dsb',
            label: 'm(t)',
            sublabel: `Message (${(fm / 1000).toFixed(1)} kHz)`,
            color: '#0284C7',
            data: dsbSim.message,
          },
          {
            id: 's-dsb',
            label: 's(t)',
            sublabel: 'DSB-SC (180° Phase Reversals)',
            color: '#15803D',
            data: dsbSim.modulated,
          },
          {
            id: 'dsb-c-ov',
            label: 'c(t)',
            color: 'rgba(124, 58, 237, 0.42)',
            data: dsbSim.carrier,
            lineDash: [2, 2],
            lineWidth: 1.1,
            overlayOnId: 's-dsb',
            zOrder: 'back',
          },
          {
            id: 'dsb-m-ov',
            label: 'm(t)',
            color: '#0284C7',
            data: dsbSim.message,
            lineDash: [5, 3],
            lineWidth: 1.45,
            overlayOnId: 's-dsb',
            zOrder: 'front',
          },
          {
            id: 'env-dsb',
            label: '±A_c m(t)',
            color: '#D97706',
            data: dsbSim.upperEnv,
            lineDash: [3, 3],
            lineWidth: 1.2,
            overlayOnId: 's-dsb',
            zOrder: 'front',
          },
          {
            id: 'y-dsb',
            label: 'y_demod(t)',
            sublabel:
              dsbRxMode === 'costas'
                ? 'Costas Demodulated Output'
                : `Coherent Rx (cos φ = ${dsbSim.gainFactor.toFixed(2)})`,
            color: '#EA580C',
            data: dsbSim.demodI,
          },
          {
            id: 'y-dsb-c-ov',
            label: 'c(t)',
            color: 'rgba(124, 58, 237, 0.30)',
            data: dsbSim.carrier.map((v) => (v * Am) / Math.max(0.1, Ac)),
            lineDash: [2, 2],
            lineWidth: 1.0,
            overlayOnId: 'y-dsb',
            zOrder: 'back',
          },
          {
            id: 'y-dsb-m-ov',
            label: 'm(t)',
            color: '#0284C7',
            data: dsbSim.message,
            lineDash: [5, 3],
            lineWidth: 1.45,
            overlayOnId: 'y-dsb',
            zOrder: 'front',
          },
        ],
        xMult: 1000,
        xLabel: 'Time / ms',
        tArr: dsbSim.t,
        spectrum: dsbSim.spectrum,
        minFreqHz: dsbTopology === 'ring' && !ringFiltered ? 0 : Math.max(0, fc - fm * 4),
        maxFreqHz:
          dsbTopology === 'ring' && !ringFiltered ? Math.min(48000, fc * 3.5) : fc + fm * 4,
        bwTitle: 'OCCUPIED BANDWIDTH',
        bwValue: `${(dsbSim.bandwidthHz / 1000).toFixed(1)} kHz`,
        bwSub:
          dsbTopology === 'ring' && !ringFiltered
            ? 'Unfiltered Ring output shows odd carrier harmonics at $3f_c, 5f_c$.'
            : 'Carrier null at $f_c$; power split $50/50$ between USB and LSB.',
      };
    }

    if (activeTopic === 'ssb' && ssbSim) {
      if (subTab === 'receiver') {
        return {
          scopeTitle: 'Coherent SSB Recovery & Phase Error',
          scopePills: [
            ssbSideband,
            ssbMethod === 'phase' ? 'Hilbert Phase' : `BPF Order ${ssbFilterOrder}`,
            `$\\phi = ${ssbPhaseErrDeg}^\\circ$`,
          ],
          traces: [
            {
              id: 'ssb-tx',
              label: 'm(t) tx',
              sublabel: 'Original vs Demodulated',
              color: '#0284C7',
              data: ssbSim.message,
            },
            {
              id: 'ssb-rx',
              label: 'y_demod(t)',
              sublabel: `Coherent Rx (φ=${ssbPhaseErrDeg}°)`,
              color: '#EA580C',
              data: ssbSim.demodulated,
              overlayOnId: 'ssb-tx',
            },
            {
              id: 'ssb-sig',
              label: 's_SSB(t)',
              sublabel: `${ssbSideband} Waveform`,
              color: '#15803D',
              data: ssbSim.modulated,
            },
          ],
          xMult: 1000,
          xLabel: 'Time / ms',
          tArr: ssbSim.t,
          spectrum: ssbSim.spectrum,
          filterOverlay: ssbSim.filterOverlay,
          minFreqHz: Math.max(0, fc - ssbSim.fHighComponent * 2.5),
          maxFreqHz: fc + ssbSim.fHighComponent * 2.5,
          bwTitle: 'SIDEBAND SELECTION',
          bwValue: ssbSideband,
          bwSub: 'LO phase error $\\phi$ introduces Hilbert quadrature distortion $\\hat{m}(t)\\sin(\\phi)$.',
        };
      }
      return {
        scopeTitle: 'SSB Modulation & Coherent Demodulation',
        scopePills: [
          ssbSideband,
          ssbMethod === 'phase' ? 'Phase Method' : 'BPF Method',
          `$\\phi = ${ssbPhaseErrDeg}^\\circ$`,
        ],
        traces: [
          {
            id: 'ssb-m',
            label: 'm(t)',
            sublabel: 'Baseband Input',
            color: '#0284C7',
            data: ssbSim.message,
          },
          {
            id: 'ssb-mh',
            label: 'm̂(t)',
            sublabel: '90° Hilbert Transform',
            color: '#7C3AED',
            data: ssbSim.messageHilbert,
          },
          {
            id: 'ssb-s',
            label: 's_SSB(t)',
            sublabel: `${ssbSideband} Passband`,
            color: '#15803D',
            data: ssbSim.modulated,
          },
          {
            id: 'ssb-c-ov',
            label: 'c(t)',
            color: 'rgba(124, 58, 237, 0.42)',
            data: ssbSim.carrier,
            lineDash: [2, 2],
            lineWidth: 1.1,
            overlayOnId: 'ssb-s',
            zOrder: 'back',
          },
          {
            id: 'ssb-m-ov',
            label: 'm(t)',
            color: '#0284C7',
            data: ssbSim.message,
            lineDash: [5, 3],
            lineWidth: 1.45,
            overlayOnId: 'ssb-s',
            zOrder: 'front',
          },
          {
            id: 'ssb-y',
            label: 'y_demod(t)',
            sublabel: 'Coherent Demodulated',
            color: '#EA580C',
            data: ssbSim.demodulated,
          },
          {
            id: 'ssb-y-c-ov',
            label: 'c(t)',
            color: 'rgba(124, 58, 237, 0.30)',
            data: ssbSim.carrier.map((v) => (v * Am) / Math.max(0.1, Ac)),
            lineDash: [2, 2],
            lineWidth: 1.0,
            overlayOnId: 'ssb-y',
            zOrder: 'back',
          },
          {
            id: 'ssb-y-m-ov',
            label: 'm(t)',
            color: '#0284C7',
            data: ssbSim.message,
            lineDash: [5, 3],
            lineWidth: 1.45,
            overlayOnId: 'ssb-y',
            zOrder: 'front',
          },
        ],
        xMult: 1000,
        xLabel: 'Time / ms',
        tArr: ssbSim.t,
        spectrum: ssbSim.spectrum,
        filterOverlay: ssbSim.filterOverlay,
        minFreqHz: Math.max(0, fc - ssbSim.fHighComponent * 2.5),
        maxFreqHz: fc + ssbSim.fHighComponent * 2.5,
        bwTitle: 'OCCUPIED BANDWIDTH',
        bwValue: `${(ssbSim.bandwidthHz / 1000).toFixed(2)} kHz`,
        bwSub: `$50\\%$ spectrum saved vs DSB (${ssbSideband} only).`,
      };
    }

    // 04. VSB fallback
    const safeVsb = vsbSim!;
    return {
      scopeTitle:
        subTab === 'receiver'
          ? 'VSB Complementary Symmetry Recovery'
          : 'VSB Modulation & Coherent Demodulation',
      scopePills: [
        `$W = ${(vsbW / 1000).toFixed(1)}\\,\\text{kHz}$`,
        `Vestige $${Math.round(vsbVestigeRatio * 100)}\\%$`,
        `Skew $${vsbSkew.toFixed(2)}$`,
      ],
      traces: [
        {
          id: 'vsb-m',
          label: 'm(t)',
          sublabel: 'Multi-Tone Baseband',
          color: '#0284C7',
          data: safeVsb.message,
        },
        {
          id: 'vsb-s',
          label: 's_VSB(t)',
          sublabel: 'Shaped Passband',
          color: '#15803D',
          data: safeVsb.modulated,
        },
        {
          id: 'vsb-c-ov',
          label: 'c(t)',
          color: 'rgba(124, 58, 237, 0.42)',
          data: safeVsb.carrier,
          lineDash: [2, 2],
          lineWidth: 1.1,
          overlayOnId: 'vsb-s',
          zOrder: 'back',
        },
        {
          id: 'vsb-m-ov',
          label: 'm(t)',
          color: '#0284C7',
          data: safeVsb.message,
          lineDash: [5, 3],
          lineWidth: 1.45,
          overlayOnId: 'vsb-s',
          zOrder: 'front',
        },
        {
          id: 'vsb-rx',
          label: 'y_demod(t)',
          sublabel: vsbSkew === 0 ? 'Distortion-Free Recovery' : 'Skew Distorted',
          color: '#EA580C',
          data: safeVsb.demodulated,
        },
        {
          id: 'vsb-rx-c-ov',
          label: 'c(t)',
          color: 'rgba(124, 58, 237, 0.30)',
          data: safeVsb.carrier.map((v) => (v * Am) / Math.max(0.1, Ac)),
          lineDash: [2, 2],
          lineWidth: 1.0,
          overlayOnId: 'vsb-rx',
          zOrder: 'back',
        },
        {
          id: 'vsb-rx-m-ov',
          label: 'm(t)',
          color: '#0284C7',
          data: safeVsb.message,
          lineDash: [5, 3],
          lineWidth: 1.45,
          overlayOnId: 'vsb-rx',
          zOrder: 'front',
        },
      ],
      xMult: 1000,
      xLabel: 'Time / ms',
      tArr: safeVsb.t,
      spectrum: safeVsb.spectrum,
      filterOverlay: safeVsb.filterOverlay,
      minFreqHz: Math.max(0, fc - vsbW * 2.2),
      maxFreqHz: fc + vsbW * 2.2,
      bwTitle: 'OCCUPIED BANDWIDTH',
      bwValue: `${(safeVsb.bandwidthHz / 1000).toFixed(2)} kHz`,
      bwSub: `$W$ ($${(vsbW / 1000).toFixed(1)}\\,\\text{kHz}$) $+$ vestige $f_v$ ($${(safeVsb.fv / 1000).toFixed(
        2
      )}\\,\\text{kHz}$)`,
    };
  };

  const plotCfg = getPlotConfig();

  // Live Circuit Signals & Parameters (feeds actual oscilloscope waveform arrays into circuit schematics)
  const circuitLiveData: CircuitLiveData = useMemo(() => {
    let mArr: number[] = [];
    let cArr: number[] = [];
    let sArr: number[] = [];
    let yArr: number[] = [];
    let longT: number[] | undefined;
    let longMArr: number[] | undefined;
    let longSArr: number[] | undefined;
    let longYArr: number[] | undefined;
    let mHatArr: number[] | undefined;
    let rectArr: number[] | undefined;
    let rcArr: number[] | undefined;

    if (activeTopic === 'motivation' && fdmSim) {
      mArr = fdmSim.perChannelBase[fdmSim.tunedChannelId] || fdmSim.basebandSum;
      cArr = fdmSim.tunedCarrier;
      sArr = fdmSim.composite;
      yArr = fdmSim.rxRecovered;
      longT = fdmSim.longT;
      longMArr = fdmSim.longMessage;
      longSArr = fdmSim.longModulated;
      longYArr = fdmSim.longDemodulated;
    } else if (activeTopic === 'conventional-am' && amSim) {
      mArr = amSim.message;
      cArr = amSim.carrier;
      sArr = amSim.modulated;
      yArr = amSim.rcDemodAC;
      longT = amSim.longT;
      longMArr = amSim.longMessage;
      longSArr = amSim.longModulated;
      longYArr = amSim.longDemodulated;
      rectArr = amSim.rectified;
      rcArr = amSim.rcDetected;
    } else if (activeTopic === 'dsb-sc' && dsbSim) {
      mArr = dsbSim.message;
      cArr = dsbSim.carrier;
      sArr = dsbSim.modulated;
      yArr = dsbSim.demodI;
      longT = dsbSim.longT;
      longMArr = dsbSim.longMessage;
      longSArr = dsbSim.longModulated;
      longYArr = dsbSim.longDemodulated;
    } else if (activeTopic === 'ssb' && ssbSim) {
      mArr = ssbSim.message;
      mHatArr = ssbSim.messageHilbert;
      cArr = ssbSim.carrier;
      sArr = ssbSim.modulated;
      yArr = ssbSim.demodulated;
      longT = ssbSim.longT;
      longMArr = ssbSim.longMessage;
      longSArr = ssbSim.longModulated;
      longYArr = ssbSim.longDemodulated;
    } else if (activeTopic === 'vsb' && vsbSim) {
      mArr = vsbSim.message;
      cArr = vsbSim.carrier;
      sArr = vsbSim.modulated;
      yArr = vsbSim.demodulated;
      longT = vsbSim.longT;
      longMArr = vsbSim.longMessage;
      longSArr = vsbSim.longModulated;
      longYArr = vsbSim.longDemodulated;
    }

    return {
      topic: activeTopic,
      subTab: subTab === 'audio-lab' ? 'instrument' : subTab,
      isSimulating,
      simulationSpeed,
      animTime,
      fc,
      fm,
      Ac,
      Am,
      mu,
      messageShape,
      mArr,
      cArr,
      sArr,
      yArr,
      longT,
      longMArr,
      longSArr,
      longYArr,
      mHatArr,
      rectArr,
      rcArr,
      fdmChannels,
      tunedChannelId,
      fdmOverlaps: fdmSim?.overlaps ?? [],
      antennaQuarterWaveM: antennaData?.quarterWaveMeters,
      antennaFcMHz,
      amModulatorMode,
      rcTimeMs,
      isOvermodulated: amSim?.isOvermodulated ?? false,
      dsbTopology,
      ringFiltered,
      dsbRxMode,
      loPhaseErrorDeg,
      loFreqOffsetHz,
      costasInitDeg,
      costasFinalPhaseDeg: dsbSim?.finalPhaseDeg,
      ssbSideband,
      ssbMethod,
      ssbFilterOrder,
      ssbEnergyGapHz,
      ssbPhaseErrDeg,
      vsbW,
      vsbVestigeRatio,
      vsbSkew,
    };
  }, [
    activeTopic,
    subTab,
    isSimulating,
    simulationSpeed,
    animTime,
    fc,
    fm,
    Ac,
    Am,
    mu,
    messageShape,
    fdmSim,
    realWorldSim,
    antennaData,
    fdmChannels,
    tunedChannelId,
    antennaFcMHz,
    amSim,
    amModulatorMode,
    rcTimeMs,
    dsbSim,
    dsbTopology,
    ringFiltered,
    dsbRxMode,
    loPhaseErrorDeg,
    loFreqOffsetHz,
    costasInitDeg,
    ssbSim,
    ssbSideband,
    ssbMethod,
    ssbFilterOrder,
    ssbEnergyGapHz,
    ssbPhaseErrDeg,
    vsbSim,
    vsbW,
    vsbVestigeRatio,
    vsbSkew,
  ]);

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-7 py-4 space-y-4 max-w-[1560px] w-full mx-auto">
      {/* Compact Editorial Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">
            THE EXPERIMENT BENCH / {stepMeta.num}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            {stepMeta.fullTitle}{' '}
            <span className="font-serif italic font-normal text-[#1E4620]">
              {stepMeta.accentWord}
            </span>
          </h1>
          <p className="text-xs text-slate-500">
            <LatexText text={stepMeta.tagline} />
          </p>
        </div>

        <div className="text-right font-serif text-2xl text-slate-300 tabular-nums shrink-0 hidden sm:block">
          {stepMeta.num}{' '}
          <span className="text-sm text-slate-400">
            / {String(BENCH_STEPS.length).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Horizontal Experiment Stepper Bar */}
      {!plotExpanded && (
        <div className="bg-white border border-slate-200 rounded-xl p-1 grid grid-cols-2 sm:grid-cols-4 gap-1">
          {BENCH_STEPS.map((step) => {
            const isActive = step.id === activeTopic;
            return (
              <button
                key={step.id}
                onClick={() => onSelectTopic(step.id)}
                className={`px-3 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                  isActive ? 'bg-[#EFF3EB] text-[#1E4620]' : 'hover:bg-slate-50 text-slate-600'
                }`}
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-[10px] text-slate-400">{step.num}</span>
                  <span className={`text-xs truncate ${isActive ? 'font-bold' : 'font-semibold'}`}>
                    {step.shortTitle}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 truncate pl-5">{step.sublabel}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Underline Sub-Tabs */}
      {!plotExpanded && (
        <div className="flex items-center gap-6 border-b border-slate-200 overflow-x-auto">
          {(
            [
              ...(isAudioLabTopic
                ? [
                    {
                      id: 'audio-lab' as BenchSubTab,
                      label:
                        activeTopic === 'conventional-am'
                          ? 'AM Receiver Demo (Audio & FFT)'
                          : activeTopic === 'dsb-sc'
                          ? 'DSB-SC & Costas Lab (Audio & FFT)'
                          : activeTopic === 'ssb'
                          ? 'SSB-SC & Hilbert Lab (Audio & FFT)'
                          : 'VSB Shaping Lab (Audio & FFT)',
                    },
                  ]
                : []),
              { id: 'instrument' as BenchSubTab, label: 'Modulation & demodulation' },
              {
                id: 'receiver' as BenchSubTab,
                label:
                  activeTopic === 'motivation'
                    ? 'Baseband, antenna & channels'
                    : 'Circuit & analytical curves',
              },
              { id: 'equations' as BenchSubTab, label: 'Equations & power' },
            ] as { id: BenchSubTab; label: string }[]
          ).map((tab) => {
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id)}
                className={`pb-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'border-[#1E4620] text-[#111827]'
                    : 'border-transparent text-slate-400 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content: Audio/FFT Simulators OR Instrument Chassis OR Equations & Power */}
      {subTab === 'audio-lab' && activeTopic === 'conventional-am' ? (
        <ConventionalAMSimulator resetSignal={resetKey} />
      ) : subTab === 'audio-lab' && activeTopic === 'dsb-sc' ? (
        <DSBSCLabPanel />
      ) : subTab === 'audio-lab' && activeTopic === 'ssb' ? (
        <SSBLabPanel />
      ) : subTab === 'audio-lab' && activeTopic === 'vsb' ? (
        <VSBLabPanel />
      ) : subTab !== 'equations' ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {/* Chassis Top Bar */}
          <div className="px-4 py-2 bg-[#FAFAF8] border-b border-slate-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">
              <span>SIGNAL ANALYSIS</span>
              <span>/</span>
              <span className="text-[#111827] font-semibold">{stepMeta.shortTitle}</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 text-[10px] font-mono">
                {([1, 2, 4] as const).map((z) => (
                  <button
                    key={z}
                    onClick={() => setScopeZoom(z)}
                    className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                      scopeZoom === z
                        ? 'bg-[#1E4620] text-white font-semibold'
                        : 'text-slate-500 hover:text-[#111827]'
                    }`}
                    title={`Time-domain zoom ${z}x`}
                  >
                    {z}x
                  </button>
                ))}
              </div>

              <button
                onClick={() => setPlotExpanded((e) => !e)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                  plotExpanded
                    ? 'bg-[#1E4620] text-white border-[#1E4620]'
                    : 'bg-white text-slate-700 border-slate-200 hover:text-[#1E4620] hover:border-[#1E4620]/40'
                }`}
                title={plotExpanded ? 'Collapse Display' : 'Expand Plots & Controls'}
              >
                {plotExpanded ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>Collapse</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Expand</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setParamsCollapsed((c) => !c)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                  paramsCollapsed
                    ? 'bg-[#1E4620] text-white border-[#1E4620]'
                    : 'bg-white text-slate-700 border-slate-200 hover:text-[#1E4620] hover:border-[#1E4620]/40'
                }`}
                title={paramsCollapsed ? 'Show Signal Parameters' : 'Collapse Signal Parameters'}
              >
                {paramsCollapsed ? (
                  <>
                    <PanelRightOpen className="w-3.5 h-3.5" />
                    <span>Show parameters</span>
                  </>
                ) : (
                  <>
                    <PanelRightClose className="w-3.5 h-3.5" />
                    <span>Hide parameters</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* SIDE-BY-SIDE GRID: White Plots on Left (expands to 12 cols when collapsed), Parameter Sidebar on Right */}
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* LEFT: White Oscilloscope + Spectrum + Optional Analytical Curve */}
            <div
              className={`${
                paramsCollapsed ? 'lg:col-span-12' : 'lg:col-span-8 xl:col-span-9'
              } p-4 md:p-5 space-y-4 bg-white`}
            >
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                {/* Time Domain Oscilloscope */}
                <div className="xl:col-span-5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400">
                        TIME DOMAIN
                      </div>
                      <h2 className="text-base font-bold text-[#111827]">{plotCfg.scopeTitle}</h2>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={toggleTriggerLock}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer ${
                          triggerLocked
                            ? 'bg-[#1E4620] text-white border-[#1E4620]'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:text-slate-900'
                        }`}
                        title="Lock trigger phase for completely stationary waveform inspection"
                      >
                        {triggerLocked ? (
                          <>
                            <Lock className="w-3 h-3" />
                            <span>Locked</span>
                          </>
                        ) : (
                          <>
                            <Waves className="w-3 h-3" />
                            <span>Trigger Lock</span>
                          </>
                        )}
                      </button>

                      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        <button
                          onClick={() => setScopeMode('stacked')}
                          className={`px-2.5 py-0.5 text-[11px] font-medium rounded-md cursor-pointer ${
                            scopeMode === 'stacked'
                              ? 'bg-white text-[#111827] font-semibold shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Stacked
                        </button>
                        <button
                          onClick={() => setScopeMode('overlay')}
                          className={`px-2.5 py-0.5 text-[11px] font-medium rounded-md cursor-pointer ${
                            scopeMode === 'overlay'
                              ? 'bg-white text-[#111827] font-semibold shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Overlay
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Readout badges */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {plotCfg.scopePills.map((p, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-[10px] text-slate-600 tabular-nums"
                      >
                        <LatexText text={p} />
                      </span>
                    ))}
                  </div>

                  <div className="border border-slate-200 rounded-xl p-1.5 bg-white">
                    <DarkOscilloscopeCanvas
                      t={plotCfg.tArr.slice(0, Math.max(60, Math.floor(plotCfg.tArr.length / scopeZoom)))}
                      traces={plotCfg.traces.map((tr) => ({
                        ...tr,
                        data: tr.data.slice(0, Math.max(60, Math.floor(tr.data.length / scopeZoom))),
                      }))}
                      mode={scopeMode}
                      xUnitMultiplier={plotCfg.xMult}
                      xLabel={plotCfg.xLabel}
                      height={Math.max(
                        820,
                        plotCfg.traces.filter((tr) => !tr.overlayOnId).length * 215
                      )}
                    />
                  </div>
                </div>

                {/* Right Analysis Column: Live Circuit Schematic ABOVE Frequency Domain Spectrum Analyzer */}
                <div className="xl:col-span-7 space-y-3 xl:border-l xl:border-slate-200 xl:pl-5">
                  {/* Live Modulation & Demodulation Electronic Schematic with Signal/Current Flow */}
                  <ModDemodCircuitPanel
                    live={circuitLiveData}
                    circuitValues={circuitValues}
                    onUpdateCircuit={handleUpdateCircuit}
                    onResetCircuit={handleResetCircuit}
                  />

                  {/* Small LaTeX Circuit Analysis & Component Role Note Card */}
                  <CircuitAnalysisNoteCard
                    live={circuitLiveData}
                    circuitValues={circuitValues}
                  />

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div>
                      <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400">
                        FREQUENCY DOMAIN
                      </div>
                      <h2 className="text-base font-bold text-[#111827]">Spectrum analyzer</h2>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setTwoSidedSpec((v) => !v)}
                        className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-[10px] font-mono text-slate-600 hover:text-[#1E4620] cursor-pointer"
                      >
                        {twoSidedSpec ? '±f' : '+f'}
                      </button>
                      <button
                        onClick={() => setSpecScale((s) => (s === 'linear' ? 'dB' : 'linear'))}
                        className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-[10px] font-mono text-slate-600 hover:text-[#1E4620] cursor-pointer"
                      >
                        {specScale === 'linear' ? 'Lin' : 'dB'}
                      </button>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-1.5 bg-white">
                    <DarkSpectrumCanvas
                      spectrum={plotCfg.spectrum}
                      secondarySpectra={plotCfg.secondarySpectra}
                      carrierFreqHz={plotCfg.carrierFreqHz}
                      minFreqHz={plotCfg.minFreqHz}
                      maxFreqHz={plotCfg.maxFreqHz}
                      twoSided={twoSidedSpec}
                      scaleMode={specScale}
                      filterOverlay={plotCfg.filterOverlay}
                      height={340}
                    />
                  </div>

                  {/* Occupied Bandwidth Readout */}
                  <div className="border-t border-slate-200 pt-3 space-y-1">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400">
                      <LatexText text={plotCfg.bwTitle} />
                    </div>
                    <div className="text-2xl font-mono font-bold text-[#111827] tabular-nums">
                      {plotCfg.bwValue}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      <LatexText text={plotCfg.bwSub} />
                    </p>
                  </div>

                  {/* Quick Key Telemetry */}
                  <div className="grid grid-cols-2 gap-2">
                    {theoryCard.stats.slice(0, 4).map((st) => (
                      <DarkMetricBox key={st.label} label={st.label} value={st.val} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Topic-Specific Analytical Curve inside Circuit & Analytical View */}
              {subTab === 'receiver' && activeTopic === 'motivation' && antennaData && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-200">
                  <div className="border border-slate-200 rounded-xl p-3 bg-white">
                    <DarkMiniCurveCanvas
                      title="Quarter-Wave Antenna Size ($l = \frac{c}{4f_c}$)"
                      series={[
                        {
                          id: 'ant',
                          label: '$l\\,(\\text{m})$',
                          color: '#15803D',
                          x: antennaData.antennaCurve.map((p) => p.freqHz),
                          y: antennaData.antennaCurve.map((p) => p.lengthM),
                        },
                      ]}
                      marker={{
                        x: antennaFcMHz * 1e6,
                        y: antennaData.quarterWaveMeters,
                        label: `${antennaData.quarterWaveMeters.toFixed(1)}m`,
                        color: '#D97706',
                      }}
                      logX
                      logY
                      xLabel="f_c"
                      yLabel="m"
                      xFormatter={(f) =>
                        f >= 1e6 ? `${(f / 1e6).toFixed(0)}M` : `${(f / 1e3).toFixed(0)}k`
                      }
                      yFormatter={(m) =>
                        m >= 1000 ? `${(m / 1000).toFixed(0)}km` : `${m.toFixed(1)}m`
                      }
                      height={240}
                    />
                  </div>

                  <div className="border border-slate-200 rounded-xl p-3 bg-white">
                    <DarkMiniCurveCanvas
                      title={`Channel Response (${medium})`}
                      series={[
                        {
                          id: 'chan',
                          label: medium === 'atmosphere' ? 'Attenuation ($\\text{dB/km}$)' : 'Gain ($\\text{dB}$)',
                          color: '#0284C7',
                          x: antennaData.channelCurve.map((p) => p.freqHz),
                          y: antennaData.channelCurve.map((p) => p.magDb),
                        },
                      ]}
                      logX
                      xLabel="Freq"
                      yLabel="dB"
                      xFormatter={(f) =>
                        f >= 1e9
                          ? `${(f / 1e9).toFixed(0)}G`
                          : f >= 1e6
                          ? `${(f / 1e6).toFixed(0)}M`
                          : `${(f / 1e3).toFixed(0)}k`
                      }
                      yFormatter={(v) => `${v.toFixed(0)}`}
                      height={240}
                    />
                  </div>
                </div>
              )}

              {subTab === 'receiver' && activeTopic === 'conventional-am' && amSim && (
                <div className="pt-3 border-t border-slate-200">
                  <div className="border border-slate-200 rounded-xl p-3 bg-white">
                    <DarkMiniCurveCanvas
                      title="AM Power Efficiency $\eta(\mu) = \frac{\mu^2}{2 + \mu^2}$ (Max $33.3\%$ at $\mu = 1$)"
                      series={[
                        {
                          id: 'eff',
                          label: '$\\eta\\,(\\%)$',
                          color: '#15803D',
                          x: amEffCurve.x,
                          y: amEffCurve.y,
                        },
                      ]}
                      marker={{
                        x: Math.min(1, mu),
                        y: ((Math.min(1, mu) ** 2) / (2 + Math.min(1, mu) ** 2)) * 100,
                        label: `${amSim.efficiencyPct.toFixed(1)}%`,
                        color: '#D97706',
                      }}
                      yRange={[0, 40]}
                      xLabel="μ"
                      yLabel="%"
                      height={230}
                    />
                  </div>
                </div>
              )}

              {subTab === 'receiver' && activeTopic === 'dsb-sc' && dsbSim && dsbRxMode === 'costas' && (
                <div className="pt-3 border-t border-slate-200">
                  <div className="border border-slate-200 rounded-xl p-3 bg-white">
                    <DarkMiniCurveCanvas
                      title="Costas Loop Phase Error Convergence $\phi(t) \to 0^\circ$"
                      series={[
                        {
                          id: 'phi',
                          label: '$\\phi(t)\\,(\\text{deg})$',
                          color: '#15803D',
                          x: dsbSim.tFull.map((t) => t * 1000),
                          y: dsbSim.phiTraceDeg,
                        },
                        {
                          id: 'zero',
                          label: 'Target $0^\\circ$',
                          color: '#94A3B8',
                          x: [0, dsbSim.tFull[dsbSim.tFull.length - 1] * 1000],
                          y: [0, 0],
                          lineDash: [4, 4],
                        },
                      ]}
                      xLabel="Time (ms)"
                      yLabel="deg"
                      height={230}
                    />
                  </div>
                </div>
              )}

              {subTab === 'receiver' && activeTopic === 'vsb' && vsbSim && (
                <div className="pt-3 border-t border-slate-200">
                  <div className="border border-slate-200 rounded-xl p-3 bg-white">
                    <DarkMiniCurveCanvas
                      title="Complementary Symmetry Check: $H(f + f_c) + H(f - f_c) = 1$"
                      series={[
                        {
                          id: 'sum',
                          label: '$H(f+f_c) + H(f-f_c)$',
                          color: '#15803D',
                          x: vsbSim.symmetryCheck.map((p) => p.f / 1000),
                          y: vsbSim.symmetryCheck.map((p) => p.sum),
                        },
                        {
                          id: 'upper',
                          label: '$H(f+f_c)$',
                          color: '#0284C7',
                          x: vsbSim.symmetryCheck.map((p) => p.f / 1000),
                          y: vsbSim.symmetryCheck.map((p) => p.hUpper),
                          lineDash: [3, 3],
                        },
                        {
                          id: 'lower',
                          label: '$H(f-f_c)$',
                          color: '#D97706',
                          x: vsbSim.symmetryCheck.map((p) => p.f / 1000),
                          y: vsbSim.symmetryCheck.map((p) => p.hLower),
                          lineDash: [3, 3],
                        },
                      ]}
                      yRange={[0, 1.4]}
                      xLabel="Baseband f (kHz)"
                      yLabel="Gain"
                      height={230}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT SIDEBAR: Collapsible Parameter Sidebar Side-by-Side */}
            {!paramsCollapsed && (
              <aside className="lg:col-span-4 xl:col-span-3 bg-[#FAFAF8] border-t lg:border-t-0 lg:border-l border-slate-200 p-4 flex flex-col justify-between gap-4">
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#111827]">
                      <Sliders className="w-3.5 h-3.5 text-[#1E4620]" />
                      <span>Signal parameters</span>
                    </div>
                    <button
                      onClick={() => setParamsCollapsed(true)}
                      className="p-1 rounded-md text-slate-400 hover:text-[#1E4620] hover:bg-[#EFF3EB] transition-colors cursor-pointer"
                      title="Collapse parameters sidebar"
                      aria-label="Collapse parameters sidebar"
                    >
                      <PanelRightClose className="w-3.5 h-3.5" />
                    </button>
                  </div>

                {/* TOPIC 01: MOTIVATION & FDM CONTROLS */}
                {activeTopic === 'motivation' && (
                  <div className="space-y-3.5">
                    {subTab === 'receiver' ? (
                      <>
                        <DarkSectionHeader index="01" title="REAL-WORLD BASEBAND" />
                        <DarkSegmented
                          label="Signal Type"
                          value={realKind}
                          onChange={setRealKind}
                          options={[
                            { value: 'voice', label: 'Voice (0.3–3.4k)' },
                            { value: 'sensor', label: 'Sensor (<1 Hz)' },
                          ]}
                        />

                        <DarkSectionHeader index="02" title="ANTENNA $\\lambda/4$ CALCULATOR" />
                        <DarkSlider
                          label="Carrier Frequency $f_c$"
                          value={antennaFcMHz}
                          min={0.01}
                          max={300}
                          step={0.5}
                          unit="MHz"
                          minLabel="10 kHz"
                          maxLabel="300 MHz"
                          onChange={setAntennaFcMHz}
                        />

                        <DarkSectionHeader index="03" title="CHANNEL MEDIUM" />
                        <DarkSegmented
                          label="Transmission Medium"
                          value={medium}
                          onChange={setMedium}
                          options={[
                            { value: 'twisted-pair', label: 'Twisted' },
                            { value: 'coax', label: 'Coax' },
                            { value: 'waveguide', label: 'Waveguide' },
                            { value: 'atmosphere', label: 'Atmos' },
                          ]}
                        />
                      </>
                    ) : (
                      <>
                        <DarkSectionHeader index="01" title="DEMODULATOR TUNING DIAL" />
                        <DarkSegmented
                          label="Tune Receiver BPF To"
                          value={String(tunedChannelId)}
                          onChange={(v) => setTunedChannelId(Number(v))}
                          options={[
                            { value: '1', label: 'Rx Ch 1' },
                            { value: '2', label: 'Rx Ch 2' },
                            { value: '3', label: 'Rx Ch 3' },
                          ]}
                        />

                        <DarkSectionHeader index="02" title="FDM CARRIER SLOTS" />
                        {fdmChannels.map((ch) => (
                          <div
                            key={ch.id}
                            className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span
                                className="text-[11px] font-mono font-semibold"
                                style={{ color: ch.color }}
                              >
                                {ch.label}
                              </span>
                              <button
                                onClick={() => updateFdmCh(ch.id, { enabled: !ch.enabled })}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
                                  ch.enabled
                                    ? 'bg-[#EFF3EB] text-[#1E4620] font-semibold'
                                    : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                {ch.enabled ? 'ON' : 'OFF'}
                              </button>
                            </div>
                            <DarkSlider
                              label={`$f_${ch.id}$`}
                              value={ch.fc}
                              min={4000}
                              max={22000}
                              step={500}
                              formatValue={(v) => (v / 1000).toFixed(1)}
                              unit="kHz"
                              onChange={(v) => updateFdmCh(ch.id, { fc: v })}
                              disabled={!ch.enabled}
                            />
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* TOPIC 02: CONVENTIONAL AM (DSB-FC) CONTROLS */}
                {activeTopic === 'conventional-am' && (
                  <div className="space-y-3.5">
                    <DarkSectionHeader index="01" title="MESSAGE" />
                    <DarkSlider
                      label="Frequency $f_m$"
                      value={fm}
                      min={200}
                      max={3000}
                      step={100}
                      formatValue={(v) => (v / 1000).toFixed(1)}
                      unit="kHz"
                      onChange={setFm}
                    />
                    <DarkSegmented
                      label="Waveform Shape"
                      value={messageShape}
                      onChange={setMessageShape}
                      options={[
                        { value: 'sine', label: 'Sine' },
                        { value: 'two-tone', label: '2-Tone' },
                        { value: 'triangle', label: 'Triangle' },
                      ]}
                    />

                    <DarkSectionHeader index="02" title="CARRIER & MODULATOR" />
                    <DarkSlider
                      label="Carrier Frequency $f_c$"
                      value={fc}
                      min={5000}
                      max={25000}
                      step={500}
                      formatValue={(v) => (v / 1000).toFixed(0)}
                      unit="kHz"
                      onChange={setFc}
                    />
                    <DarkSlider
                      label="Carrier Amplitude $A_c$"
                      value={Ac}
                      min={0.5}
                      max={2.0}
                      step={0.1}
                      unit="V"
                      onChange={setAc}
                    />
                    <DarkSlider
                      label="Modulation Index $\mu$"
                      value={mu}
                      min={0}
                      max={1.5}
                      step={0.05}
                      minLabel="0"
                      maxLabel="1.5 (over)"
                      onChange={setMu}
                    />
                    <DarkSegmented
                      label="Modulator Topology"
                      value={amModulatorMode}
                      onChange={setAmModulatorMode}
                      options={[
                        { value: 'linear', label: 'Multiplier' },
                        { value: 'square-law', label: 'Square-Law' },
                      ]}
                    />

                    <DarkSectionHeader index="03" title="ENVELOPE DEMODULATOR" />
                    <DarkSlider
                      label="Time Constant $\tau = RC$"
                      value={rcTimeMs}
                      min={0.05}
                      max={2.0}
                      step={0.05}
                      unit="ms"
                      minLabel="0.05 ms"
                      maxLabel="2.0 ms"
                      onChange={handleRcSliderChange}
                    />
                  </div>
                )}

                {/* TOPIC 03: DSB-SC & COSTAS CONTROLS */}
                {activeTopic === 'dsb-sc' && (
                  <div className="space-y-3.5">
                    <DarkSectionHeader index="01" title="MESSAGE" />
                    <DarkSlider
                      label="Message Frequency $f_m$"
                      value={fm}
                      min={300}
                      max={2500}
                      step={100}
                      formatValue={(v) => (v / 1000).toFixed(1)}
                      unit="kHz"
                      onChange={setFm}
                    />
                    <DarkSegmented
                      label="Waveform"
                      value={messageShape}
                      onChange={setMessageShape}
                      options={[
                        { value: 'sine', label: 'Sine' },
                        { value: 'two-tone', label: '2-Tone' },
                        { value: 'triangle', label: 'Triangle' },
                      ]}
                    />

                    <DarkSectionHeader index="02" title="MODULATOR" />
                    <DarkSlider
                      label="Carrier Frequency $f_c$"
                      value={fc}
                      min={5000}
                      max={20000}
                      step={500}
                      formatValue={(v) => (v / 1000).toFixed(0)}
                      unit="kHz"
                      onChange={setFc}
                    />
                    <DarkSegmented
                      label="Topology"
                      value={dsbTopology}
                      onChange={setDsbTopology}
                      options={[
                        { value: 'product', label: 'Product' },
                        { value: 'ring', label: '4-Diode Ring' },
                      ]}
                    />
                    {dsbTopology === 'ring' && (
                      <DarkSegmented
                        label="Ring Output BPF"
                        value={ringFiltered ? 'bpf' : 'raw'}
                        onChange={(v) => setRingFiltered(v === 'bpf')}
                        options={[
                          { value: 'bpf', label: 'BPF @ $f_c$' },
                          { value: 'raw', label: 'Raw ($3f_c, 5f_c$)' },
                        ]}
                      />
                    )}

                    <DarkSectionHeader index="03" title="DEMODULATOR" />
                    <DarkSegmented
                      label="Receiver Architecture"
                      value={dsbRxMode}
                      onChange={setDsbRxMode}
                      options={[
                        { value: 'coherent', label: 'Coherent LO' },
                        { value: 'costas', label: 'Costas Loop' },
                      ]}
                    />
                    {dsbRxMode === 'coherent' ? (
                      <>
                        <DarkSlider
                          label="LO Phase Error $\phi$"
                          value={loPhaseErrorDeg}
                          min={-180}
                          max={180}
                          step={5}
                          unit="°"
                          minLabel="-180°"
                          maxLabel="+180°"
                          onChange={setLoPhaseErrorDeg}
                        />
                        <DarkSlider
                          label="LO Freq Offset $\Delta f_c$"
                          value={loFreqOffsetHz}
                          min={-250}
                          max={250}
                          step={10}
                          unit="Hz"
                          onChange={setLoFreqOffsetHz}
                        />
                      </>
                    ) : (
                      <>
                        <DarkSlider
                          label="Initial Phase Offset $\phi_0$"
                          value={costasInitDeg}
                          min={-85}
                          max={85}
                          step={5}
                          unit="°"
                          onChange={setCostasInitDeg}
                        />
                        <DarkSlider
                          label="Loop Gain $K$"
                          value={costasGain}
                          min={0.2}
                          max={3.0}
                          step={0.1}
                          onChange={setCostasGain}
                        />
                      </>
                    )}
                  </div>
                )}

                {/* TOPIC 04: SSB-SC CONTROLS */}
                {activeTopic === 'ssb' && (
                  <div className="space-y-3.5">
                    <DarkSectionHeader index="01" title="SIDEBAND & METHOD" />
                    <DarkSegmented
                      label="Sideband Selected"
                      value={ssbSideband}
                      onChange={setSsbSideband}
                      options={[
                        { value: 'USB', label: 'USB ($f_c+f_m$)' },
                        { value: 'LSB', label: 'LSB ($f_c-f_m$)' },
                      ]}
                    />
                    <DarkSegmented
                      label="Generation Method"
                      value={ssbMethod}
                      onChange={setSsbMethod}
                      options={[
                        { value: 'phase', label: 'Hilbert Phase' },
                        { value: 'frequency', label: 'BPF Filter' },
                      ]}
                    />

                    <DarkSectionHeader index="02" title="FREQUENCIES" />
                    <DarkSlider
                      label="Message Frequency $f_m$"
                      value={fm}
                      min={300}
                      max={2500}
                      step={100}
                      formatValue={(v) => (v / 1000).toFixed(1)}
                      unit="kHz"
                      onChange={setFm}
                    />
                    <DarkSlider
                      label="Carrier Frequency $f_c$"
                      value={fc}
                      min={6000}
                      max={20000}
                      step={500}
                      formatValue={(v) => (v / 1000).toFixed(0)}
                      unit="kHz"
                      onChange={setFc}
                    />

                    <DarkSectionHeader index="03" title="FILTER & DEMODULATOR" />
                    {ssbMethod === 'frequency' && (
                      <>
                        <DarkSlider
                          label="BPF Filter Order"
                          value={ssbFilterOrder}
                          min={1}
                          max={8}
                          step={1}
                          onChange={setSsbFilterOrder}
                        />
                        <DarkSlider
                          label="Energy Gap $f_a$"
                          value={ssbEnergyGapHz}
                          min={0}
                          max={1200}
                          step={100}
                          unit="Hz"
                          onChange={setSsbEnergyGapHz}
                        />
                      </>
                    )}
                    <DarkSlider
                      label="LO Phase Error $\phi$"
                      value={ssbPhaseErrDeg}
                      min={-90}
                      max={90}
                      step={5}
                      unit="°"
                      onChange={setSsbPhaseErrDeg}
                    />
                  </div>
                )}

                {/* TOPIC 05: VSB CONTROLS */}
                {activeTopic === 'vsb' && (
                  <div className="space-y-3.5">
                    <DarkSectionHeader index="01" title="BASEBAND & CARRIER" />
                    <DarkSlider
                      label="Message Bandwidth $W$"
                      value={vsbW}
                      min={1000}
                      max={4000}
                      step={200}
                      formatValue={(v) => (v / 1000).toFixed(1)}
                      unit="kHz"
                      onChange={setVsbW}
                    />
                    <DarkSlider
                      label="Carrier Frequency $f_c$"
                      value={fc}
                      min={6000}
                      max={20000}
                      step={500}
                      formatValue={(v) => (v / 1000).toFixed(0)}
                      unit="kHz"
                      onChange={setFc}
                    />

                    <DarkSectionHeader index="02" title="SHAPING FILTER $H(f)$ & DEMOD" />
                    <DarkSlider
                      label="Vestige Ratio $f_v / W$"
                      value={vsbVestigeRatio}
                      min={0.05}
                      max={0.5}
                      step={0.01}
                      formatValue={(v) => `${Math.round(v * 100)}%`}
                      minLabel="5%"
                      maxLabel="50%"
                      onChange={setVsbVestigeRatio}
                    />
                    <DarkSlider
                      label="Symmetry Skew"
                      value={vsbSkew}
                      min={-0.35}
                      max={0.35}
                      step={0.05}
                      formatValue={(v) => v.toFixed(2)}
                      minLabel="-0.35"
                      maxLabel="+0.35"
                      onChange={setVsbSkew}
                    />

                    <button
                      onClick={() => {
                        setVsbVestigeRatio(0.18);
                        setVsbSkew(0);
                      }}
                      className="w-full py-2 px-3 rounded-lg bg-[#EFF3EB] hover:bg-[#DCE5D5] border border-[#DCE5D5] text-xs font-mono font-semibold text-[#1E4620] transition-colors cursor-pointer"
                    >
                      Apply NTSC TV Standard (18% Vestige)
                    </button>
                  </div>
                )}
              </div>

              {/* Status Banner inside Parameter Sidebar */}
              <div className="pt-3 border-t border-slate-200 text-[11px]">
                {activeTopic === 'conventional-am' && mu > 1 ? (
                  <div className="flex items-center gap-2 text-rose-600 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <LatexText text="Over-modulated ($\mu > 1$): Envelope distortion" />
                  </div>
                ) : activeTopic === 'dsb-sc' &&
                  dsbRxMode === 'coherent' &&
                  Math.abs(loPhaseErrorDeg) === 90 ? (
                  <div className="flex items-center gap-2 text-amber-600 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <LatexText text="Quadrature Null at $\phi = \pm 90^\circ$" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-slate-500 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#1E4620] shrink-0" />
                    <span>Modulation &amp; demodulation synced</span>
                  </div>
                )}
              </div>
            </aside>
            )}
          </div>
        </div>
      ) : (
        /* EQUATIONS & POWER SUB-TAB */
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
            <div className="lg:col-span-7 p-6 md:p-8 flex flex-col justify-between space-y-5 border-b lg:border-b-0 lg:border-r border-slate-200">
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">
                THE MATHEMATICAL MODEL
              </div>
              <div className="text-lg md:text-xl text-[#111827] py-4 text-center bg-slate-50 rounded-xl px-4 border border-slate-100">
                <Latex math={theoryCard.formula} displayMode />
              </div>
              <p className="text-xs text-slate-600">
                <LatexText text={theoryCard.caption} />
              </p>
              <button
                onClick={() => setSubTab('instrument')}
                className="inline-flex items-center gap-2 text-xs font-semibold text-[#1E4620] hover:underline cursor-pointer w-fit"
              >
                <span>Return to live oscilloscope</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="lg:col-span-5 bg-[#EFF3EB] p-6 md:p-8 space-y-5">
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">
                THE KEY INSIGHT
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-[#111827]">{theoryCard.insightTitle}</h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  <LatexText text={theoryCard.insightBody} />
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[#DCE5D5]">
                {theoryCard.stats.map((st) => (
                  <div key={st.label}>
                    <div className="text-[10px] font-mono text-slate-500">
                      <LatexText text={st.label} />
                    </div>
                    <div className="text-sm font-semibold text-[#111827] tabular-nums mt-0.5">
                      <LatexText text={st.val} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              {
                badge: '$m(t)$',
                title: 'Message signal',
                desc: `Baseband information at $${(fm / 1000).toFixed(1)}\\,\\text{kHz}$.`,
              },
              {
                badge: '$c(t)$',
                title: 'Carrier signal',
                desc: `Reference at $${(fc / 1000).toFixed(0)}\\,\\text{kHz}$ translating the spectrum.`,
              },
              {
                badge: '$s(t)$',
                title: 'Modulated signal',
                desc: 'Passband waveform transmitted over the channel.',
              },
              {
                badge: '$y_o(t)$',
                title: 'Demodulated signal',
                desc: 'Recovered baseband signal from envelope or coherent Rx.',
              },
            ].map((item) => (
              <div
                key={item.badge}
                className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3"
              >
                <div className="px-2 py-1.5 rounded-lg bg-[#EFF3EB] border border-[#DCE5D5] text-[#1E4620] text-xs font-bold shrink-0">
                  <LatexText text={item.badge} />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#111827]">{item.title}</div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    <LatexText text={item.desc} />
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
