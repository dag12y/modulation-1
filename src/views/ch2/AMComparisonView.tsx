import React, { useState, useMemo } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { simulateAMFamilyComparison, MessageShape } from '../../services/chapter2Dsp';
import { ScientificScopeCanvas } from '../../components/ScientificScopeCanvas';
import { SpectrumAnalyzerCanvas } from '../../components/SpectrumAnalyzerCanvas';
import { LabSplitLayout } from '../../components/LabSplitLayout';
import { SliderControl, SegmentedControl } from '../../components/LabControlWidgets';

interface AMComparisonViewProps {
  resetKey: number;
}

export const AMComparisonView: React.FC<AMComparisonViewProps> = ({ resetKey }) => {
  const { animTime } = useSimulation();

  const [Ac, setAc] = useState<number>(3.0);
  const [fc, setFc] = useState<number>(12000);
  const [fm, setFm] = useState<number>(1000);
  const [mu, setMu] = useState<number>(0.8);
  const [vestigeRatio, setVestigeRatio] = useState<number>(0.25);
  const [messageShape, setMessageShape] = useState<MessageShape>('sine');

  const [showAM, setShowAM] = useState<boolean>(true);
  const [showDSB, setShowDSB] = useState<boolean>(true);
  const [showSSB, setShowSSB] = useState<boolean>(true);
  const [showVSB, setShowVSB] = useState<boolean>(false);

  React.useEffect(() => {
    if (resetKey === 0) return;
    setAc(3.0);
    setFc(12000);
    setFm(1000);
    setMu(0.8);
    setVestigeRatio(0.25);
    setMessageShape('sine');
    setShowAM(true);
    setShowDSB(true);
    setShowSSB(true);
    setShowVSB(false);
  }, [resetKey]);

  const sim = useMemo(
    () =>
      simulateAMFamilyComparison({
        Ac,
        fc,
        fm,
        mu,
        vestigeRatio,
        messageShape,
        timeOffset: animTime,
      }),
    [Ac, fc, fm, mu, vestigeRatio, messageShape, animTime]
  );

  const secondarySpectra = [
    ...(showDSB ? [{ spectrum: sim.dsb.spectrum, color: '#2563EB', label: 'DSB-SC' }] : []),
    ...(showSSB ? [{ spectrum: sim.ssb.spectrum, color: '#059669', label: 'SSB' }] : []),
    ...(showVSB ? [{ spectrum: sim.vsb.spectrum, color: '#D97706', label: 'VSB' }] : []),
  ];

  return (
    <LabSplitLayout
      title="AM Family Comparison (AM · DSB-SC · SSB · VSB)"
      formula="Same m(t) & fc — Balancing Power, Bandwidth & Receiver Complexity"
      rightSidebar={
        <div className="space-y-3.5">
          <div className="pb-2 border-b border-[#F1EBFA]">
            <h2 className="text-xs font-bold text-[#24212C]">Shared Signal Controls</h2>
          </div>

          <div className="p-3 bg-[#FAF9FD] rounded-lg border border-[#E8E3EF] space-y-2">
            <span className="block text-[11px] font-semibold text-[#77717F]">Visible Schemes</span>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {[
                { label: 'Conv. AM', checked: showAM, set: setShowAM, color: '#7045B8' },
                { label: 'DSB-SC', checked: showDSB, set: setShowDSB, color: '#2563EB' },
                { label: 'SSB (USB)', checked: showSSB, set: setShowSSB, color: '#059669' },
                { label: 'VSB', checked: showVSB, set: setShowVSB, color: '#D97706' },
              ].map((item) => (
                <label
                  key={item.label}
                  className="flex items-center gap-1.5 px-2 py-1.5 bg-white rounded border border-[#E8E3EF] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => item.set(e.target.checked)}
                    style={{ accentColor: item.color }}
                  />
                  <span className="font-medium text-[#24212C] truncate">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <SegmentedControl
            label="Message Waveform m(t)"
            value={messageShape === 'two-tone' ? 'two-tone' : 'sine'}
            onChange={(v) => setMessageShape(v)}
            options={[
              { value: 'sine', label: 'Single Tone' },
              { value: 'two-tone', label: 'Two-Tone' },
            ]}
          />

          <SliderControl
            label="AM Modulation Index (μ)"
            value={mu}
            min={0.2}
            max={1.2}
            step={0.05}
            formatValue={(v) => v.toFixed(2)}
            onChange={setMu}
          />

          <SliderControl
            label="VSB Vestige Ratio"
            value={vestigeRatio}
            min={0.1}
            max={0.5}
            step={0.05}
            formatValue={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={setVestigeRatio}
          />

          <SliderControl
            label="Carrier Freq (fc)"
            value={fc}
            min={6000}
            max={22000}
            step={500}
            formatValue={(v) => `${(v / 1000).toFixed(1)} kHz`}
            onChange={setFc}
          />

          <SliderControl
            label="Message Freq (fm)"
            value={fm}
            min={400}
            max={2000}
            step={100}
            unit="Hz"
            onChange={setFm}
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
        </div>
      }
    >
      {/* Time-Domain Overlaid Scope */}
      <ScientificScopeCanvas
        title="Time-Domain Comparison (Identical Baseband m(t) & Carrier fc)"
        t={sim.t}
        height={210}
        traces={[
          ...(showAM ? [{ id: 'am', name: 'Conv. AM', color: '#7045B8', data: sim.am.modulated }] : []),
          ...(showDSB ? [{ id: 'dsb', name: 'DSB-SC', color: '#2563EB', data: sim.dsb.modulated }] : []),
          ...(showSSB ? [{ id: 'ssb', name: 'SSB (USB)', color: '#059669', data: sim.ssb.modulated }] : []),
          ...(showVSB ? [{ id: 'vsb', name: 'VSB', color: '#D97706', data: sim.vsb.modulated }] : []),
        ]}
      />

      {/* Overlaid Spectrum */}
      <SpectrumAnalyzerCanvas
        title="Overlaid RF Spectrum Comparison (Carrier Spike vs Sidebands)"
        spectrum={showAM ? sim.am.spectrum : sim.dsb.spectrum}
        secondarySpectra={secondarySpectra}
        maxFreqHz={Math.min(34000, fc + fm * 4.5)}
        height={215}
        markers={[
          { freq: fc - fm, label: 'fc-fm', color: '#64748B' },
          { freq: fc, label: 'fc', color: '#7045B8' },
          { freq: fc + fm, label: 'fc+fm', color: '#64748B' },
        ]}
      />

      {/* Compact Live Engineering Comparison Table */}
      <div className="bg-white border border-[#E8E3EF] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#FAF9FD] border-b border-[#E8E3EF] text-[#77717F]">
                <th className="py-2 px-3 font-semibold">Scheme</th>
                <th className="py-2 px-3 font-semibold">Spectrum Content</th>
                <th className="py-2 px-3 font-semibold">Bandwidth</th>
                <th className="py-2 px-3 font-semibold">Power Eff. (η)</th>
                <th className="py-2 px-3 font-semibold">Receiver Complexity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1EBFA] tabular-nums">
              {sim.metrics.map((row) => (
                <tr key={row.scheme} className="hover:bg-[#FAF9FD]/60">
                  <td className="py-2 px-3 font-bold text-[#24212C] whitespace-nowrap">
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-2"
                      style={{ backgroundColor: row.color }}
                    />
                    {row.scheme}
                  </td>
                  <td className="py-2 px-3 text-[#77717F]">{row.spectrumDesc}</td>
                  <td className="py-2 px-3 font-mono font-semibold text-[#4B287F] whitespace-nowrap">
                    {row.bwFormula} ({(row.bandwidthHz / 1000).toFixed(2)} kHz)
                  </td>
                  <td className="py-2 px-3 font-mono font-semibold text-[#24212C]">
                    {row.efficiencyPct.toFixed(1)}%
                  </td>
                  <td className="py-2 px-3 text-[#77717F]">{row.complexity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </LabSplitLayout>
  );
};
