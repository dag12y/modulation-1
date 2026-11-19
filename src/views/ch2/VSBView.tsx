import React, { useState, useMemo } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { useSimulation } from '../../context/SimulationContext';
import { simulateVSBLab } from '../../services/chapter2Dsp';
import { ScientificScopeCanvas } from '../../components/ScientificScopeCanvas';
import { SpectrumAnalyzerCanvas } from '../../components/SpectrumAnalyzerCanvas';
import { MiniChartCanvas } from '../../components/MiniChartCanvas';
import { LabSplitLayout } from '../../components/LabSplitLayout';
import { SliderControl, MetricCell } from '../../components/LabControlWidgets';
import { SignalFlowStrip } from '../../components/SignalFlowStrip';

interface VSBViewProps {
  resetKey: number;
}

export const VSBView: React.FC<VSBViewProps> = ({ resetKey }) => {
  const { animTime } = useSimulation();

  const [Ac, setAc] = useState<number>(3.0);
  const [Am] = useState<number>(2.0);
  const [fc, setFc] = useState<number>(14000);
  const [W, setW] = useState<number>(2500);
  const [vestigeRatio, setVestigeRatio] = useState<number>(0.25);
  const [symmetrySkew, setSymmetrySkew] = useState<number>(0);

  React.useEffect(() => {
    if (resetKey === 0) return;
    setAc(3.0);
    setFc(14000);
    setW(2500);
    setVestigeRatio(0.25);
    setSymmetrySkew(0);
  }, [resetKey]);

  const sim = useMemo(
    () =>
      simulateVSBLab({
        Ac,
        fc,
        W,
        Am,
        vestigeRatio,
        symmetrySkew,
        timeOffset: animTime,
      }),
    [Ac, fc, W, Am, vestigeRatio, symmetrySkew, animTime]
  );

  const isSymmetryValid = Math.abs(symmetrySkew) < 0.03;

  return (
    <LabSplitLayout
      title="Vestigial Sideband Modulation (VSB)"
      formula="H(f + fc) + H(f − fc) = 1  for  −W ≤ f ≤ W"
      headerRight={
        <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
          <span className="px-2 py-1 bg-[#FAF9FD] border border-[#E8E3EF] rounded-md text-[#4B287F] font-semibold">
            BW = {(sim.bandwidthHz / 1000).toFixed(2)} kHz ({(1 + vestigeRatio).toFixed(2)}W)
          </span>
        </div>
      }
      rightSidebar={
        <div className="space-y-3.5">
          <div className="pb-2 border-b border-[#F1EBFA]">
            <h2 className="text-xs font-bold text-[#24212C]">VSB Filter & Signal Controls</h2>
          </div>

          <div
            className={`p-2.5 rounded-lg border text-xs font-medium flex items-center gap-2 ${
              isSymmetryValid
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            {isSymmetryValid ? (
              <>
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>Complementary symmetry satisfied (Sum = 1.0)</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Filter asymmetry distorts low-freq recovery</span>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => {
                setVestigeRatio(0.18);
                setW(3000);
                setSymmetrySkew(0);
              }}
              className="px-2 py-1.5 text-[11px] font-mono bg-[#F1EBFA] hover:bg-[#E8E3EF] border border-[#7045B8]/30 rounded-md text-[#4B287F] font-semibold cursor-pointer"
              title="NTSC Analog TV ratio: 0.75 MHz / 4.2 MHz ≈ 18%"
            >
              NTSC TV (18%)
            </button>
            <button
              onClick={() => {
                setVestigeRatio(0.25);
                setW(2500);
                setSymmetrySkew(0);
              }}
              className="px-2 py-1.5 text-[11px] font-mono bg-[#FAF9FD] hover:bg-[#F1EBFA] border border-[#E8E3EF] rounded-md text-[#24212C] cursor-pointer"
            >
              Std 1.25W (25%)
            </button>
          </div>

          <SliderControl
            label="Vestige Ratio (fv / W)"
            value={vestigeRatio}
            min={0.05}
            max={0.6}
            step={0.05}
            formatValue={(v) => `${(v * 100).toFixed(0)}% (BW = ${(1 + v).toFixed(2)}W)`}
            onChange={setVestigeRatio}
          />

          <SliderControl
            label="Filter Symmetry Skew"
            value={symmetrySkew}
            min={-0.35}
            max={0.35}
            step={0.05}
            formatValue={(v) => (v === 0 ? '0.00 (Ideal)' : v.toFixed(2))}
            onChange={setSymmetrySkew}
            hint="Non-zero breaks H(f+fc) + H(f−fc) = 1"
          />

          <SliderControl
            label="Message Bandwidth (W)"
            value={W}
            min={1200}
            max={4000}
            step={100}
            formatValue={(v) => `${(v / 1000).toFixed(1)} kHz`}
            onChange={setW}
          />

          <SliderControl
            label="Carrier Freq (fc)"
            value={fc}
            min={8000}
            max={24000}
            step={500}
            formatValue={(v) => `${(v / 1000).toFixed(1)} kHz`}
            onChange={setFc}
          />

          <SliderControl
            label="Carrier Amp (Ac)"
            value={Ac}
            min={1}
            max={5}
            step={0.5}
            formatValue={(v) => `${v.toFixed(1)} V`}
            onChange={setAc}
          />

          <div className="grid grid-cols-2 gap-2 pt-1">
            <MetricCell label="Vestige (fv)" value={`${(sim.fv / 1000).toFixed(2)} kHz`} accent />
            <MetricCell label="Total BW" value={`${(sim.bandwidthHz / 1000).toFixed(2)} kHz`} />
          </div>
        </div>
      }
    >
      <SignalFlowStrip
        blocks={[
          { label: 'Low-Freq Video / Multi-tone m(t)' },
          { label: 'Product Modulator' },
          { label: `VSB Shaping Filter H(f)`, detail: `fv=${(sim.fv / 1000).toFixed(2)}k`, active: true },
          { label: 'Coherent Detector' },
        ]}
      />

      <ScientificScopeCanvas
        title="Baseband m(t) (Low-Freq Content), VSB Wave s(t), & Demodulated Output"
        t={sim.t}
        height={200}
        traces={[
          { id: 'vsb', name: 'sVSB(t) Modulated', color: '#7045B8', data: sim.modulated },
          { id: 'msg', name: 'm(t) Original', color: '#2563EB', data: sim.message, lineDash: [4, 3] },
          { id: 'dem', name: 'Demodulated Output', color: '#D97706', data: sim.demodulated, lineWidth: 2 },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <SpectrumAnalyzerCanvas
          title="VSB Spectrum ΦVSB(f) & Sideband-Shaping Filter H(f)"
          spectrum={sim.spectrum}
          filterOverlay={sim.filterOverlay}
          maxFreqHz={Math.min(34000, fc + W * 1.8)}
          height={215}
          highlightBandwidth={{
            start: Math.max(0, fc - sim.fv),
            end: fc + W,
            label: `BW = ${(sim.bandwidthHz / 1000).toFixed(2)} kHz`,
          }}
          markers={[
            { freq: fc - sim.fv, label: 'fc-fv', color: '#059669' },
            { freq: fc, label: 'fc', color: '#7045B8' },
            { freq: fc + W, label: 'fc+W', color: '#2563EB' },
          ]}
        />

        <MiniChartCanvas
          title="Complementary Filter Symmetry: H(f + fc) + H(f − fc) = 1"
          series={[
            {
              id: 'sum',
              label: 'H(f+fc) + H(f−fc)',
              color: isSymmetryValid ? '#059669' : '#DC2626',
              x: sim.symmetryCheck.map((p) => p.f),
              y: sim.symmetryCheck.map((p) => p.sum),
            },
            {
              id: 'hu',
              label: 'H(f+fc)',
              color: '#7045B8',
              x: sim.symmetryCheck.map((p) => p.f),
              y: sim.symmetryCheck.map((p) => p.hUpper),
              lineDash: [3, 3],
            },
            {
              id: 'hl',
              label: 'H(f−fc)',
              color: '#2563EB',
              x: sim.symmetryCheck.map((p) => p.f),
              y: sim.symmetryCheck.map((p) => p.hLower),
              lineDash: [3, 3],
            },
          ]}
          xLabel="Baseband Offset f (Hz)"
          yLabel="Filter Gain"
          yRange={[0, 1.4]}
          xFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
          height={215}
        />
      </div>
    </LabSplitLayout>
  );
};
