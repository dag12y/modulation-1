import React, { useState, useMemo } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { useSimulation } from '../../context/SimulationContext';
import { simulateDSBSCLab, MessageShape } from '../../services/chapter2Dsp';
import { ScientificScopeCanvas } from '../../components/ScientificScopeCanvas';
import { SpectrumAnalyzerCanvas } from '../../components/SpectrumAnalyzerCanvas';
import { MiniChartCanvas } from '../../components/MiniChartCanvas';
import { LabSplitLayout } from '../../components/LabSplitLayout';
import { SliderControl, SegmentedControl, MetricCell } from '../../components/LabControlWidgets';
import { SignalFlowStrip } from '../../components/SignalFlowStrip';

interface DSBSCViewProps {
  resetKey: number;
}

export const DSBSCView: React.FC<DSBSCViewProps> = ({ resetKey }) => {
  const { animTime } = useSimulation();

  const [Ac, setAc] = useState<number>(2.5);
  const [Am, setAm] = useState<number>(1.5);
  const [fc, setFc] = useState<number>(12000);
  const [fm, setFm] = useState<number>(1000);
  const [messageShape, setMessageShape] = useState<MessageShape>('sine');

  // Modulator Topology
  const [modulatorTopology, setModulatorTopology] = useState<'product' | 'ring'>('product');
  const [ringFiltered, setRingFiltered] = useState<boolean>(true);

  // Coherent vs Costas Loop
  const [receiverMode, setReceiverMode] = useState<'coherent' | 'costas'>('coherent');
  const [loPhaseErrorDeg, setLoPhaseErrorDeg] = useState<number>(0);
  const [loFreqOffsetHz, setLoFreqOffsetHz] = useState<number>(0);
  const [costasInitDeg, setCostasInitDeg] = useState<number>(45);
  const [costasGain, setCostasGain] = useState<number>(1.5);

  React.useEffect(() => {
    if (resetKey === 0) return;
    setAc(2.5);
    setAm(1.5);
    setFc(12000);
    setFm(1000);
    setMessageShape('sine');
    setModulatorTopology('product');
    setRingFiltered(true);
    setReceiverMode('coherent');
    setLoPhaseErrorDeg(0);
    setLoFreqOffsetHz(0);
    setCostasInitDeg(45);
    setCostasGain(1.5);
  }, [resetKey]);

  const sim = useMemo(
    () =>
      simulateDSBSCLab({
        Ac,
        fc,
        fm,
        Am,
        messageShape,
        modulatorTopology,
        ringFiltered,
        receiverMode,
        loPhaseErrorDeg,
        loFreqOffsetHz,
        costasInitialPhaseDeg: costasInitDeg,
        costasLoopGain: costasGain,
        timeOffset: animTime,
      }),
    [
      Ac,
      fc,
      fm,
      Am,
      messageShape,
      modulatorTopology,
      ringFiltered,
      receiverMode,
      loPhaseErrorDeg,
      loFreqOffsetHz,
      costasInitDeg,
      costasGain,
      animTime,
    ]
  );

  const costasConvergence = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    const step = 16;
    for (let i = 0; i < sim.tFull.length; i += step) {
      xs.push(sim.tFull[i] * 1000);
      ys.push(sim.phiTraceDeg[i]);
    }
    return { xs, ys };
  }, [sim.tFull, sim.phiTraceDeg]);

  const isQuadNull = receiverMode === 'coherent' && Math.abs(Math.abs(loPhaseErrorDeg) - 90) <= 5;

  return (
    <LabSplitLayout
      title="Double-Sideband Suppressed Carrier (DSB-SC)"
      formula="s(t) = Ac·m(t)cos(2πfc t)  |  vo(t) = ½AcAc'cos(φ)·m(t)"
      headerRight={
        <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
          <span className="px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-700 font-semibold">
            η = 100%
          </span>
          <span className="px-2 py-1 bg-[#FAF9FD] border border-[#E8E3EF] rounded-md text-[#24212C]">
            BW = {(sim.bandwidthHz / 1000).toFixed(1)} kHz
          </span>
        </div>
      }
      rightSidebar={
        <div className="space-y-3">
          <div className="pb-2 border-b border-[#F1EBFA]">
            <h2 className="text-xs font-bold text-[#24212C]">DSB-SC Modulator & Receiver</h2>
          </div>

          <SegmentedControl
            label="Modulator Topology"
            value={modulatorTopology}
            onChange={setModulatorTopology}
            options={[
              { value: 'product', label: 'Product' },
              { value: 'ring', label: 'Ring Bridge' },
            ]}
          />

          {modulatorTopology === 'ring' && (
            <label className="flex items-center justify-between px-2.5 py-1.5 bg-[#FAF9FD] border border-[#E8E3EF] rounded-lg text-xs cursor-pointer">
              <span className="font-medium text-[#24212C]">Output BPF at fc (Suppress 3fc, 5fc)</span>
              <input
                type="checkbox"
                checked={ringFiltered}
                onChange={(e) => setRingFiltered(e.target.checked)}
                className="accent-[#7045B8]"
              />
            </label>
          )}

          <SegmentedControl
            label="Demodulator Architecture"
            value={receiverMode}
            onChange={setReceiverMode}
            options={[
              { value: 'coherent', label: 'Coherent' },
              { value: 'costas', label: 'Costas Loop' },
            ]}
          />

          {receiverMode === 'coherent' ? (
            <div className="p-2.5 bg-[#FAF9FD] rounded-lg border border-[#E8E3EF] space-y-2.5">
              <div
                className={`p-2 rounded border text-[11px] font-medium flex items-center gap-1.5 ${
                  isQuadNull
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-white border-[#E8E3EF] text-[#4B287F]'
                }`}
              >
                {isQuadNull ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Quadrature Null (cos 90° = 0)</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                    <span>Gain: cos({loPhaseErrorDeg}°) = {sim.gainFactor.toFixed(2)}</span>
                  </>
                )}
              </div>

              <SliderControl
                label="LO Phase Error (φ)"
                value={loPhaseErrorDeg}
                min={-180}
                max={180}
                step={5}
                unit="°"
                onChange={setLoPhaseErrorDeg}
              />

              <div className="grid grid-cols-3 gap-1.5">
                {[0, 45, 90].map((deg) => (
                  <button
                    key={deg}
                    onClick={() => setLoPhaseErrorDeg(deg)}
                    className={`py-1 text-[11px] font-mono rounded border cursor-pointer ${
                      loPhaseErrorDeg === deg
                        ? 'bg-[#F1EBFA] border-[#7045B8] text-[#4B287F] font-bold'
                        : 'bg-white border-[#E8E3EF] text-[#77717F]'
                    }`}
                  >
                    {deg}° {deg === 90 ? 'Null' : ''}
                  </button>
                ))}
              </div>

              <SliderControl
                label="LO Freq Offset (Δfc)"
                value={loFreqOffsetHz}
                min={-200}
                max={200}
                step={10}
                unit="Hz"
                onChange={setLoFreqOffsetHz}
              />
            </div>
          ) : (
            <div className="p-2.5 bg-[#FAF9FD] rounded-lg border border-[#E8E3EF] space-y-2.5">
              <div className="p-2 rounded border bg-white border-[#E8E3EF] text-[11px] font-mono flex items-center justify-between">
                <span className="text-[#77717F]">Locked φ(end):</span>
                <span className="font-bold text-emerald-700">{sim.finalPhaseDeg.toFixed(2)}°</span>
              </div>

              <SliderControl
                label="Initial Phase Error (φ₀)"
                value={costasInitDeg}
                min={-80}
                max={80}
                step={5}
                unit="°"
                onChange={setCostasInitDeg}
              />

              <SliderControl
                label="VCO Loop Gain"
                value={costasGain}
                min={0.2}
                max={4.0}
                step={0.1}
                formatValue={(v) => `${v.toFixed(1)}x`}
                onChange={setCostasGain}
              />
            </div>
          )}

          <SegmentedControl
            label="Message Waveform m(t)"
            value={messageShape}
            onChange={setMessageShape}
            options={[
              { value: 'sine', label: 'Single Tone' },
              { value: 'two-tone', label: 'Two-Tone' },
              { value: 'triangle', label: 'Triangle' },
            ]}
          />

          <SliderControl
            label="Carrier Freq (fc)"
            value={fc}
            min={5000}
            max={25000}
            step={500}
            formatValue={(v) => `${(v / 1000).toFixed(1)} kHz`}
            onChange={setFc}
          />

          <SliderControl
            label="Message Freq (fm)"
            value={fm}
            min={300}
            max={2500}
            step={100}
            unit="Hz"
            onChange={setFm}
          />

          <div className="grid grid-cols-2 gap-2 pt-1">
            <MetricCell label="Carrier Power" value="0.00 W" accent />
            <MetricCell label="Sideband Power" value={`${sim.Pt.toFixed(2)} W`} />
          </div>
        </div>
      }
    >
      <SignalFlowStrip
        blocks={
          receiverMode === 'costas'
            ? [
                { label: modulatorTopology === 'ring' ? 'Ring Bridge + BPF' : 'Product Mod' },
                { label: 'DSB-SC s(t)' },
                { label: 'I-Arm (cos) & Q-Arm (sin)', active: true },
                { label: 'Phase Discriminator (I·Q)', active: true },
                { label: `VCO Lock (${sim.finalPhaseDeg.toFixed(1)}°)` },
              ]
            : [
                { label: 'm(t)' },
                { label: modulatorTopology === 'ring' ? '4-Diode Ring Switch' : 'Product Mixer', active: true },
                { label: 'DSB-SC s(t)' },
                { label: `Coherent LO (φ=${loPhaseErrorDeg}°)`, active: true },
                { label: 'LPF → vo(t)' },
              ]
        }
      />

      <ScientificScopeCanvas
        title={
          modulatorTopology === 'ring' && !ringFiltered
            ? 'Unfiltered Ring Modulator Output (Square-Wave Switched DSB-SC)'
            : 'DSB-SC Modulated Wave s(t) (Phase Reversal when m(t) < 0)'
        }
        t={sim.t}
        height={200}
        traces={[
          { id: 'mod', name: 's(t) DSB-SC', color: '#7045B8', data: sim.modulated },
          { id: 'env', name: '+Ac·m(t)', color: '#10B981', data: sim.upperEnv, lineDash: [4, 3] },
          { id: 'envN', name: '-Ac·m(t)', color: '#94A3B8', data: sim.lowerEnv, lineDash: [3, 3] },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <ScientificScopeCanvas
          title={
            receiverMode === 'costas'
              ? 'Costas Loop I-Channel & Q-Channel Outputs'
              : 'Coherent Detector Output vs Original m(t)'
          }
          t={sim.t}
          height={195}
          traces={[
            { id: 'orig', name: 'm(t) Original', color: '#2563EB', data: sim.message, lineDash: [4, 3] },
            { id: 'ich', name: 'I-Channel', color: '#D97706', data: sim.demodI, lineWidth: 2 },
            { id: 'qch', name: 'Q-Channel', color: '#EC4899', data: sim.demodQ, visible: receiverMode === 'costas' },
          ]}
        />

        {receiverMode === 'costas' ? (
          <MiniChartCanvas
            title="Costas Loop VCO Phase Error φ(t) → 0° Convergence"
            series={[
              {
                id: 'phi',
                label: 'Phase Error φ(t)',
                color: '#7045B8',
                x: costasConvergence.xs,
                y: costasConvergence.ys,
              },
              {
                id: 'zero',
                label: 'Locked (0°)',
                color: '#059669',
                x: [0, costasConvergence.xs[costasConvergence.xs.length - 1] || 20],
                y: [0, 0],
                lineDash: [4, 3],
              },
            ]}
            xLabel="Capture Time (ms)"
            yLabel="Phase Error (°)"
            height={195}
          />
        ) : (
          <SpectrumAnalyzerCanvas
            title="DSB-SC Spectrum S(f) (Carrier Suppressed at ±fc)"
            spectrum={sim.spectrum}
            maxFreqHz={modulatorTopology === 'ring' && !ringFiltered ? Math.min(48000, fc * 3.4) : Math.min(35000, fc + fm * 4)}
            height={195}
            highlightBandwidth={{
              start: Math.max(0, fc - (messageShape === 'two-tone' ? fm * 2.2 : fm)),
              end: fc + (messageShape === 'two-tone' ? fm * 2.2 : fm),
              label: `BW = ${(sim.bandwidthHz / 1000).toFixed(1)} kHz`,
            }}
            markers={[
              { freq: fc - fm, label: 'LSB', color: '#2563EB' },
              { freq: fc, label: 'fc (0)', color: '#DC2626' },
              { freq: fc + fm, label: 'USB', color: '#2563EB' },
            ]}
          />
        )}
      </div>

      {receiverMode === 'costas' && (
        <SpectrumAnalyzerCanvas
          title="DSB-SC Spectrum S(f) (Suppressed Carrier at ±fc)"
          spectrum={sim.spectrum}
          maxFreqHz={modulatorTopology === 'ring' && !ringFiltered ? Math.min(48000, fc * 3.4) : Math.min(35000, fc + fm * 4)}
          height={175}
          markers={[
            { freq: fc - fm, label: 'LSB', color: '#2563EB' },
            { freq: fc, label: 'fc (0)', color: '#DC2626' },
            { freq: fc + fm, label: 'USB', color: '#2563EB' },
          ]}
        />
      )}
    </LabSplitLayout>
  );
};
