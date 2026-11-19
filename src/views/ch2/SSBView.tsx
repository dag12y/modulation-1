import React, { useState, useMemo } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { simulateSSBLab, MessageShape } from '../../services/chapter2Dsp';
import { ScientificScopeCanvas } from '../../components/ScientificScopeCanvas';
import { SpectrumAnalyzerCanvas } from '../../components/SpectrumAnalyzerCanvas';
import { LabSplitLayout } from '../../components/LabSplitLayout';
import { SliderControl, SegmentedControl, MetricCell } from '../../components/LabControlWidgets';
import { SignalFlowStrip } from '../../components/SignalFlowStrip';

interface SSBViewProps {
  resetKey: number;
}

export const SSBView: React.FC<SSBViewProps> = ({ resetKey }) => {
  const { animTime } = useSimulation();

  const [sideband, setSideband] = useState<'USB' | 'LSB'>('USB');
  const [method, setMethod] = useState<'phase' | 'frequency'>('phase');
  const [messageShape, setMessageShape] = useState<MessageShape>('two-tone');
  const [Ac, setAc] = useState<number>(3.0);
  const [Am, setAm] = useState<number>(2.0);
  const [fc, setFc] = useState<number>(12000);
  const [fm, setFm] = useState<number>(900);
  const [filterOrder, setFilterOrder] = useState<number>(4);
  const [energyGapHz, setEnergyGapHz] = useState<number>(0);
  const [loPhaseErrorDeg, setLoPhaseErrorDeg] = useState<number>(0);

  React.useEffect(() => {
    if (resetKey === 0) return;
    setSideband('USB');
    setMethod('phase');
    setMessageShape('two-tone');
    setAc(3.0);
    setAm(2.0);
    setFc(12000);
    setFm(900);
    setFilterOrder(4);
    setEnergyGapHz(0);
    setLoPhaseErrorDeg(0);
  }, [resetKey]);

  const sim = useMemo(
    () =>
      simulateSSBLab({
        Ac,
        fc,
        fm,
        Am,
        sideband,
        method,
        messageShape,
        filterOrder,
        energyGapHz,
        loPhaseErrorDeg,
        timeOffset: animTime,
      }),
    [
      Ac,
      fc,
      fm,
      Am,
      sideband,
      method,
      messageShape,
      filterOrder,
      energyGapHz,
      loPhaseErrorDeg,
      animTime,
    ]
  );

  const bwStart =
    sideband === 'USB'
      ? fc + (energyGapHz > 0 ? sim.fLowComponent : 0)
      : Math.max(0, fc - (messageShape === 'two-tone' ? sim.fHighComponent : sim.fLowComponent));
  const bwEnd =
    sideband === 'USB'
      ? fc + (messageShape === 'two-tone' ? sim.fHighComponent : sim.fLowComponent)
      : Math.max(0, fc - (energyGapHz > 0 ? sim.fLowComponent : 0));

  return (
    <LabSplitLayout
      title="Single-Sideband Modulation (SSB)"
      formula={
        sideband === 'USB'
          ? 'sUSB(t) = ½Ac[m(t)cos(2πfc t) − m̂(t)sin(2πfc t)]'
          : 'sLSB(t) = ½Ac[m(t)cos(2πfc t) + m̂(t)sin(2πfc t)]'
      }
      headerRight={
        <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
          <span className="px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-700 font-semibold">
            50% BW Saved
          </span>
          <span className="px-2 py-1 bg-[#FAF9FD] border border-[#E8E3EF] rounded-md text-[#24212C]">
            BW = {(sim.bandwidthHz / 1000).toFixed(2)} kHz
          </span>
        </div>
      }
      rightSidebar={
        <div className="space-y-3.5">
          <div className="pb-2 border-b border-[#F1EBFA]">
            <h2 className="text-xs font-bold text-[#24212C]">SSB Parameters</h2>
          </div>

          <SegmentedControl
            label="Transmitted Sideband"
            value={sideband}
            onChange={setSideband}
            options={[
              { value: 'USB', label: 'Upper (USB)' },
              { value: 'LSB', label: 'Lower (LSB)' },
            ]}
          />

          <SegmentedControl
            label="Generation Method"
            value={method}
            onChange={setMethod}
            options={[
              { value: 'phase', label: 'Phase (Hilbert)' },
              { value: 'frequency', label: 'Freq Filter (BPF)' },
            ]}
          />

          {method === 'frequency' && (
            <div className="p-3 bg-[#FAF9FD] rounded-lg border border-[#E8E3EF] space-y-2.5">
              <SliderControl
                label="BPF Selectivity (Order)"
                value={filterOrder}
                min={1}
                max={8}
                step={1}
                formatValue={(v) => `Order ${v}`}
                onChange={setFilterOrder}
                hint="Low order leaks opposite sideband across transition"
              />
              <SliderControl
                label="Baseband Energy Gap (fa)"
                value={energyGapHz}
                min={0}
                max={1200}
                step={100}
                unit="Hz"
                onChange={setEnergyGapHz}
                hint="Separates USB & LSB for practical BPF roll-off"
              />
            </div>
          )}

          <SegmentedControl
            label="Message Spectrum"
            value={messageShape === 'two-tone' ? 'two-tone' : 'sine'}
            onChange={(v) => setMessageShape(v)}
            options={[
              { value: 'sine', label: 'Single Tone' },
              { value: 'two-tone', label: 'Two-Tone Band' },
            ]}
          />

          <SliderControl
            label="Carrier Freq (fc)"
            value={fc}
            min={6000}
            max={25000}
            step={500}
            formatValue={(v) => `${(v / 1000).toFixed(1)} kHz`}
            onChange={setFc}
          />

          <SliderControl
            label="Message Freq (fm)"
            value={fm}
            min={300}
            max={2000}
            step={100}
            unit="Hz"
            onChange={setFm}
          />

          <SliderControl
            label="LO Phase Error (φ)"
            value={loPhaseErrorDeg}
            min={-90}
            max={90}
            step={5}
            unit="°"
            onChange={setLoPhaseErrorDeg}
            hint="Non-zero φ causes phase distortion in SSB"
          />

          <div className="grid grid-cols-2 gap-2 pt-1">
            <MetricCell label="Power Eff (η)" value="100%" accent />
            <MetricCell label="SSB Bandwidth" value={`${(sim.bandwidthHz / 1000).toFixed(2)} kHz`} />
          </div>
        </div>
      }
    >
      <SignalFlowStrip
        blocks={
          method === 'phase'
            ? [
                { label: 'm(t) & Hilbert m̂(t)', active: true },
                { label: 'I/Q Carrier (±90°)' },
                { label: sideband === 'USB' ? 'Σ (I − Q) → USB' : 'Σ (I + Q) → LSB', active: true },
                { label: 'Coherent Detector' },
              ]
            : [
                { label: 'm(t)' },
                { label: 'Product Mod (DSB-SC)' },
                { label: `BPF Order ${filterOrder} (${sideband})`, active: true },
                { label: 'Coherent Detector' },
              ]
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <ScientificScopeCanvas
          title="Message m(t) & 90° Hilbert Transform m̂(t)"
          t={sim.t}
          height={205}
          traces={[
            { id: 'm', name: 'm(t) In-Phase', color: '#2563EB', data: sim.message },
            { id: 'mh', name: 'm̂(t) Hilbert (90°)', color: '#059669', data: sim.messageHilbert, lineDash: [4, 3] },
          ]}
        />

        <ScientificScopeCanvas
          title={`SSB (${sideband}) Modulated & Coherently Demodulated Output`}
          t={sim.t}
          height={205}
          traces={[
            { id: 'ssb', name: `sSSB(t) (${sideband})`, color: '#7045B8', data: sim.modulated },
            { id: 'rec', name: 'Demodulated m̂r(t)', color: '#D97706', data: sim.demodulated, lineWidth: 2 },
          ]}
        />
      </div>

      <SpectrumAnalyzerCanvas
        title={`SSB (${sideband}) Spectrum S(f) — ${
          method === 'phase' ? 'Exact Sideband Cancellation' : 'Practical Bandpass Filtering'
        }`}
        spectrum={sim.spectrum}
        filterOverlay={sim.filterOverlay}
        maxFreqHz={Math.min(36000, fc + fm * 5 + energyGapHz + 2000)}
        height={225}
        highlightBandwidth={{
          start: bwStart,
          end: bwEnd,
          label: `${sideband} BW ≈ ${(sim.bandwidthHz / 1000).toFixed(2)} kHz`,
        }}
        markers={[
          { freq: fc - sim.fLowComponent, label: 'LSB', color: sideband === 'LSB' ? '#7045B8' : '#94A3B8' },
          { freq: fc, label: 'fc (0)', color: '#DC2626' },
          { freq: fc + sim.fLowComponent, label: 'USB', color: sideband === 'USB' ? '#7045B8' : '#94A3B8' },
        ]}
      />
    </LabSplitLayout>
  );
};
