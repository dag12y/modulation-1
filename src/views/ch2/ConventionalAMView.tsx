import React, { useState, useMemo } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { useSimulation } from '../../context/SimulationContext';
import { simulateConventionalAMLab, MessageShape } from '../../services/chapter2Dsp';
import { ScientificScopeCanvas } from '../../components/ScientificScopeCanvas';
import { SpectrumAnalyzerCanvas } from '../../components/SpectrumAnalyzerCanvas';
import { MiniChartCanvas } from '../../components/MiniChartCanvas';
import { LabSplitLayout } from '../../components/LabSplitLayout';
import { SliderControl, SegmentedControl, MetricCell } from '../../components/LabControlWidgets';
import { SignalFlowStrip } from '../../components/SignalFlowStrip';

interface ConventionalAMViewProps {
  resetKey: number;
}

export const ConventionalAMView: React.FC<ConventionalAMViewProps> = ({ resetKey }) => {
  const { animTime } = useSimulation();

  const [mu, setMu] = useState<number>(0.75);
  const [Ac, setAc] = useState<number>(4.0);
  const [fc, setFc] = useState<number>(12000);
  const [fm, setFm] = useState<number>(1000);
  const [messageShape, setMessageShape] = useState<MessageShape>('sine');
  const [rcTimeMs, setRcTimeMs] = useState<number>(0.35);
  const [modulatorMode, setModulatorMode] = useState<'linear' | 'square-law'>('linear');
  const [squareLawView, setSquareLawView] = useState<'filtered' | 'raw'>('raw');
  const [bottomMode, setBottomMode] = useState<'detector' | 'efficiency'>('detector');

  React.useEffect(() => {
    if (resetKey === 0) return;
    setMu(0.75);
    setAc(4.0);
    setFc(12000);
    setFm(1000);
    setMessageShape('sine');
    setRcTimeMs(0.35);
    setModulatorMode('linear');
    setSquareLawView('raw');
  }, [resetKey]);

  const sim = useMemo(
    () =>
      simulateConventionalAMLab({
        Ac,
        fc,
        fm,
        mu,
        messageShape,
        rcTimeMs,
        modulatorMode,
        timeOffset: animTime,
      }),
    [Ac, fc, fm, mu, messageShape, rcTimeMs, modulatorMode, animTime]
  );

  const effCurve = useMemo(() => {
    const xs: number[] = [];
    const ysSide: number[] = [];
    const ysCar: number[] = [];
    for (let m = 0; m <= 1.0; m += 0.05) {
      xs.push(m * 100);
      const eff = ((m * m) / (2 + m * m)) * 100;
      ysSide.push(eff);
      ysCar.push(100 - eff);
    }
    return { xs, ysSide, ysCar };
  }, []);

  const showRawSquareLaw = modulatorMode === 'square-law' && squareLawView === 'raw';

  return (
    <LabSplitLayout
      title="Conventional Amplitude Modulation (AM)"
      formula="s(t) = Ac[1 + μ·mn(t)]cos(2πfc t)"
      headerRight={
        <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
          <span className="px-2 py-1 bg-[#FAF9FD] border border-[#E8E3EF] rounded-md text-[#4B287F] font-semibold">
            η = {sim.efficiencyPct.toFixed(1)}%
          </span>
          <span className="px-2 py-1 bg-[#FAF9FD] border border-[#E8E3EF] rounded-md text-[#24212C]">
            BW = {(sim.bandwidthHz / 1000).toFixed(1)} kHz
          </span>
        </div>
      }
      rightSidebar={
        <div className="space-y-3.5">
          <div className="pb-2 border-b border-[#F1EBFA]">
            <h2 className="text-xs font-bold text-[#24212C]">AM Parameters</h2>
          </div>

          <div
            className={`p-2.5 rounded-lg border text-xs font-medium flex items-center gap-2 ${
              sim.isOvermodulated
                ? 'bg-red-50 border-red-200 text-red-700'
                : mu >= 0.95
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}
          >
            {sim.isOvermodulated ? (
              <>
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Over-modulated (μ &gt; 1): Envelope distortion</span>
              </>
            ) : mu >= 0.95 ? (
              <>
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>100% Modulation (μ ≈ 1)</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>Under-modulated (μ &lt; 1)</span>
              </>
            )}
          </div>

          <SliderControl
            label="Modulation Index (μ)"
            value={mu}
            min={0.1}
            max={1.6}
            step={0.05}
            formatValue={(v) => `${v.toFixed(2)} (${Math.round(v * 100)}%)`}
            onChange={setMu}
          />

          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: '0.5 Under', val: 0.5 },
              { label: '1.0 Crit', val: 1.0 },
              { label: '1.4 Over', val: 1.4 },
            ].map((p) => (
              <button
                key={p.val}
                onClick={() => setMu(p.val)}
                className={`py-1 text-[11px] font-mono rounded border cursor-pointer transition-colors ${
                  Math.abs(mu - p.val) < 0.03
                    ? 'bg-[#F1EBFA] border-[#7045B8] text-[#4B287F] font-bold'
                    : 'bg-[#FAF9FD] border-[#E8E3EF] text-[#77717F] hover:text-[#24212C]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

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

          <SliderControl
            label="Carrier Amp (Ac)"
            value={Ac}
            min={1}
            max={6}
            step={0.5}
            formatValue={(v) => `${v.toFixed(1)} V`}
            onChange={setAc}
          />

          <div className="pt-2 border-t border-[#F1EBFA] space-y-2.5">
            <SliderControl
              label="Envelope Detector RC"
              value={rcTimeMs}
              min={0.04}
              max={2.5}
              step={0.02}
              formatValue={(v) => `${v.toFixed(2)} ms`}
              onChange={setRcTimeMs}
              hint={`1/ωc=${sim.rcMinIdealMs.toFixed(2)} ≪ RC ≪ 1/ωm=${sim.rcMaxIdealMs.toFixed(2)} ms`}
            />

            <SegmentedControl
              label="Modulator Circuit"
              value={modulatorMode}
              onChange={setModulatorMode}
              options={[
                { value: 'linear', label: 'Product + DC' },
                { value: 'square-law', label: 'Square-Law' },
              ]}
            />

            {modulatorMode === 'square-law' && (
              <SegmentedControl
                label="Square-Law Stage"
                value={squareLawView}
                onChange={setSquareLawView}
                options={[
                  { value: 'raw', label: 'v₂(t) Diode Load' },
                  { value: 'filtered', label: 'x(t) After BPF' },
                ]}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <MetricCell label="Amax / Amin" value={`${sim.Amax.toFixed(1)} / ${sim.Amin.toFixed(1)} V`} />
            <MetricCell label="Power Eff (η)" value={`${sim.efficiencyPct.toFixed(1)}%`} accent />
            <MetricCell label="Carrier Pc" value={`${sim.Pc.toFixed(2)} W`} />
            <MetricCell label="Sidebands Psb" value={`${sim.Psb.toFixed(2)} W`} />
          </div>
        </div>
      }
    >
      <SignalFlowStrip
        blocks={
          modulatorMode === 'square-law'
            ? [
                { label: 'm(t) + Ac cos(ωc t)' },
                { label: 'Diode: a₁v₁ + a₂v₁²', active: squareLawView === 'raw' },
                { label: 'BPF at fc', active: squareLawView === 'filtered' },
                { label: 'Diode Rectifier' },
                { label: 'RC Envelope LPF', active: true },
              ]
            : [
                { label: 'm(t)' },
                { label: 'Ac[1 + μm(t)]cos(ωc t)', active: true },
                { label: 'Half-Wave Diode' },
                { label: `RC Filter (${rcTimeMs.toFixed(2)} ms)`, active: true },
                { label: 'Smoothed Output' },
              ]
        }
      />

      <ScientificScopeCanvas
        title={
          showRawSquareLaw
            ? 'Square-Law Diode Output v₂(t) vs BPF-Cleaned AM x(t)'
            : 'AM Waveform s(t), Message m(t), & Envelopes'
        }
        t={sim.t}
        height={215}
        traces={
          showRawSquareLaw
            ? [
                { id: 'v2', name: 'v₂(t) Diode Load', color: '#D97706', data: sim.squareLawRaw },
                { id: 'mod', name: 'x(t) After BPF', color: '#7045B8', data: sim.modulated, lineDash: [3, 2] },
              ]
            : [
                { id: 'mod', name: 's(t) AM Wave', color: '#7045B8', data: sim.modulated },
                { id: 'envU', name: '+Envelope', color: '#10B981', data: sim.upperEnv, lineDash: [4, 3] },
                { id: 'envL', name: '-Envelope', color: '#10B981', data: sim.lowerEnv, lineDash: [4, 3], visible: false },
                { id: 'msg', name: 'm(t) Message', color: '#2563EB', data: sim.message, visible: false },
                { id: 'car', name: 'c(t) Carrier', color: '#94A3B8', data: sim.carrier, visible: false },
              ]
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="bg-white border border-[#E8E3EF] rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#24212C]">
              {bottomMode === 'detector'
                ? 'Envelope Detector: Rectified & RC Smoothed'
                : 'Power Efficiency η = μ²/(2+μ²) vs Modulation %'}
            </span>
            <button
              onClick={() => setBottomMode((m) => (m === 'detector' ? 'efficiency' : 'detector'))}
              className="text-[11px] font-semibold text-[#7045B8] hover:underline cursor-pointer"
            >
              {bottomMode === 'detector' ? 'Power Curve' : 'RC Detector'}
            </button>
          </div>

          {bottomMode === 'detector' ? (
            <ScientificScopeCanvas
              t={sim.t}
              height={190}
              traces={[
                { id: 'rect', name: 'Half-Wave Rectified', color: '#CBD5E1', data: sim.rectified, lineWidth: 1.2 },
                { id: 'rc', name: 'RC Smoothed', color: '#D97706', data: sim.rcDetected, lineWidth: 2 },
                { id: 'ideal', name: 'Ideal Envelope', color: '#059669', data: sim.upperEnv, lineDash: [4, 3] },
              ]}
            />
          ) : (
            <MiniChartCanvas
              title="Carrier vs Sideband Power (%)"
              series={[
                { id: 'car', label: 'Carrier %', color: '#7045B8', x: effCurve.xs, y: effCurve.ysCar },
                { id: 'sb', label: 'Sidebands η (%)', color: '#059669', x: effCurve.xs, y: effCurve.ysSide },
              ]}
              marker={{
                x: Math.min(100, mu * 100),
                y: (Math.pow(Math.min(1, mu), 2) / (2 + Math.pow(Math.min(1, mu), 2))) * 100,
                label: `μ=${Math.min(1, mu).toFixed(2)} → ${((Math.pow(Math.min(1, mu), 2) / (2 + Math.pow(Math.min(1, mu), 2))) * 100).toFixed(1)}%`,
              }}
              xLabel="Percentage Modulation (%)"
              yLabel="Power (%)"
              yRange={[0, 100]}
              height={190}
            />
          )}
        </div>

        <SpectrumAnalyzerCanvas
          title={
            showRawSquareLaw
              ? 'Square-Law Spectrum V₂(f) (DC, fm, 2fm, fc, 2fc)'
              : 'AM Spectrum S(f) (Carrier + LSB + USB)'
          }
          spectrum={showRawSquareLaw ? sim.spectrum : sim.amFilteredSpectrum}
          maxFreqHz={showRawSquareLaw ? Math.min(48000, fc * 2.4) : Math.min(35000, fc + fm * 4)}
          height={225}
          highlightBandwidth={{
            start: Math.max(0, fc - (messageShape === 'two-tone' ? fm * 2.2 : fm)),
            end: fc + (messageShape === 'two-tone' ? fm * 2.2 : fm),
            label: `BW = ${(sim.bandwidthHz / 1000).toFixed(1)} kHz`,
          }}
          markers={[
            { freq: fc - fm, label: 'fc-fm', color: '#2563EB' },
            { freq: fc, label: 'fc', color: '#7045B8' },
            { freq: fc + fm, label: 'fc+fm', color: '#2563EB' },
          ]}
        />
      </div>
    </LabSplitLayout>
  );
};
