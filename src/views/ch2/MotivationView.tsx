import React, { useState, useMemo } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { useSimulation } from '../../context/SimulationContext';
import {
  simulateFDM,
  simulateRealWorldSignal,
  computeAntennaAndChannelData,
  FDMChannelConfig,
} from '../../services/chapter2Dsp';
import { ScientificScopeCanvas } from '../../components/ScientificScopeCanvas';
import { SpectrumAnalyzerCanvas } from '../../components/SpectrumAnalyzerCanvas';
import { MiniChartCanvas } from '../../components/MiniChartCanvas';
import { LabSplitLayout } from '../../components/LabSplitLayout';
import { SliderControl, SegmentedControl, MetricCell } from '../../components/LabControlWidgets';
import { SignalFlowStrip } from '../../components/SignalFlowStrip';

type SubMode = 'real-world' | 'spectrum-fdm' | 'antenna-channel';

interface MotivationViewProps {
  resetKey: number;
}

export const MotivationView: React.FC<MotivationViewProps> = ({ resetKey }) => {
  const { animTime } = useSimulation();
  const [subMode, setSubMode] = useState<SubMode>('spectrum-fdm');

  // Real-World Signals
  const [realKind, setRealKind] = useState<'voice' | 'sensor'>('voice');

  // FDM & Spectrum Shifting state
  const [ch1Fc, setCh1Fc] = useState<number>(8000);
  const [ch1Fm, setCh1Fm] = useState<number>(800);
  const [ch2Enabled, setCh2Enabled] = useState<boolean>(true);
  const [ch2Fc, setCh2Fc] = useState<number>(15000);
  const [ch2Fm, setCh2Fm] = useState<number>(1000);
  const [ch3Enabled, setCh3Enabled] = useState<boolean>(false);
  const [ch3Fc, setCh3Fc] = useState<number>(22000);
  const [ch3Fm, setCh3Fm] = useState<number>(900);
  const [tunedChannelId, setTunedChannelId] = useState<number>(1);

  // Antenna & Channel state
  const [antennaScaleExp, setAntennaScaleExp] = useState<number>(8); // 10^8 Hz = 100 MHz
  const [medium, setMedium] = useState<'twisted-pair' | 'coax' | 'waveguide' | 'atmosphere'>('twisted-pair');

  React.useEffect(() => {
    if (resetKey === 0) return;
    setRealKind('voice');
    setCh1Fc(8000);
    setCh1Fm(800);
    setCh2Enabled(true);
    setCh2Fc(15000);
    setCh2Fm(1000);
    setCh3Enabled(false);
    setCh3Fc(22000);
    setCh3Fm(900);
    setTunedChannelId(1);
    setAntennaScaleExp(8);
    setMedium('twisted-pair');
  }, [resetKey]);

  const realRes = useMemo(
    () => simulateRealWorldSignal(realKind, animTime),
    [realKind, animTime]
  );

  const channels: FDMChannelConfig[] = useMemo(
    () => [
      { id: 1, label: 'Ch 1', enabled: true, fc: ch1Fc, fm: ch1Fm, Am: 2.0, color: '#7045B8' },
      { id: 2, label: 'Ch 2', enabled: ch2Enabled, fc: ch2Fc, fm: ch2Fm, Am: 1.8, color: '#2563EB' },
      { id: 3, label: 'Ch 3', enabled: ch3Enabled, fc: ch3Fc, fm: ch3Fm, Am: 1.6, color: '#059669' },
    ],
    [ch1Fc, ch1Fm, ch2Enabled, ch2Fc, ch2Fm, ch3Enabled, ch3Fc, ch3Fm]
  );

  const fdmRes = useMemo(
    () => simulateFDM({ channels, tunedChannelId, timeOffset: animTime }),
    [channels, tunedChannelId, animTime]
  );

  const antennaFcHz = Math.pow(10, antennaScaleExp);
  const physRes = useMemo(
    () => computeAntennaAndChannelData(antennaFcHz, medium),
    [antennaFcHz, medium]
  );

  const formatAntennaLen = (meters: number) => {
    if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
    if (meters >= 1) return `${meters.toFixed(2)} m`;
    return `${(meters * 100).toFixed(1)} cm`;
  };

  const formatFreqHz = (hz: number) => {
    if (hz >= 1e9) return `${(hz / 1e9).toFixed(2)} GHz`;
    if (hz >= 1e6) return `${(hz / 1e6).toFixed(2)} MHz`;
    if (hz >= 1e3) return `${(hz / 1e3).toFixed(1)} kHz`;
    return `${hz.toFixed(0)} Hz`;
  };

  const tunedChannel = channels.find((c) => c.id === tunedChannelId && c.enabled) || channels[0];

  return (
    <LabSplitLayout
      title="Motivation & Spectrum Shifting"
      formula={
        subMode === 'real-world'
          ? realRes.bandDesc
          : subMode === 'spectrum-fdm'
          ? 's(t) = m(t)cos(2πfc t)  ⇔  S(f) = ½[M(f − fc) + M(f + fc)]'
          : 'l ≈ λ/4 = c / (4fc)'
      }
      headerRight={
        <SegmentedControl
          value={subMode}
          onChange={setSubMode}
          options={[
            { value: 'real-world', label: 'Baseband Signals' },
            { value: 'spectrum-fdm', label: 'Shift & FDM' },
            { value: 'antenna-channel', label: 'Antenna & Media' },
          ]}
        />
      }
      rightSidebar={
        subMode === 'real-world' ? (
          <div className="space-y-4">
            <div className="pb-2 border-b border-[#F1EBFA]">
              <h2 className="text-xs font-bold text-[#24212C]">Real-World Low-Frequency Signals</h2>
            </div>

            <SegmentedControl
              label="Signal Source"
              value={realKind}
              onChange={setRealKind}
              options={[
                { value: 'voice', label: 'Voice (Audio)' },
                { value: 'sensor', label: 'Sensor (Sub-Hz)' },
              ]}
            />

            <div className="grid grid-cols-1 gap-2">
              <MetricCell
                label="Dominant Band"
                value={realKind === 'voice' ? '300 – 3400 Hz' : '< 1.0 Hz'}
                accent
              />
              <MetricCell
                label="λ/4 Antenna @ Baseband"
                value={realKind === 'voice' ? '~75 km (at 1 kHz)' : '~75,000 km (at 1 Hz)'}
                warn
              />
            </div>
          </div>
        ) : subMode === 'spectrum-fdm' ? (
          <div className="space-y-3.5">
            <div className="pb-2 border-b border-[#F1EBFA]">
              <h2 className="text-xs font-bold text-[#24212C]">FDM & Receiver Tuning</h2>
            </div>

            <div
              className={`p-2 rounded-lg border text-xs font-medium flex items-center gap-2 ${
                fdmRes.overlaps.length > 0
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}
            >
              {fdmRes.overlaps.length > 0 ? (
                <>
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Overlap: {fdmRes.overlaps.join(', ')}</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>Non-overlapping FDM bands</span>
                </>
              )}
            </div>

            {/* Receiver Tuning Dial */}
            <div className="p-2.5 bg-[#F1EBFA]/60 rounded-lg border border-[#7045B8]/25 space-y-1.5">
              <span className="block text-[11px] font-bold text-[#4B287F]">
                Receiver Tuning Dial
              </span>
              <div className="grid grid-cols-3 gap-1">
                {channels.map((ch) => (
                  <button
                    key={ch.id}
                    disabled={!ch.enabled}
                    onClick={() => setTunedChannelId(ch.id)}
                    className={`py-1 text-[11px] font-mono rounded border transition-colors cursor-pointer disabled:opacity-40 ${
                      tunedChannel.id === ch.id
                        ? 'bg-[#7045B8] text-white border-[#7045B8] font-bold'
                        : 'bg-white border-[#E8E3EF] text-[#24212C]'
                    }`}
                  >
                    R{ch.id} ({(ch.fc / 1000).toFixed(0)}k)
                  </button>
                ))}
              </div>
            </div>

            {/* Channel 1 */}
            <div className="p-2.5 bg-[#FAF9FD] rounded-lg border border-[#E8E3EF] space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[#4B287F]">
                <span>Radio 1</span>
                <span className="font-mono text-[10px]">[{(ch1Fc - ch1Fm) / 1000}–{(ch1Fc + ch1Fm) / 1000} kHz]</span>
              </div>
              <SliderControl
                label="fc₁"
                value={ch1Fc}
                min={3000}
                max={26000}
                step={500}
                formatValue={(v) => `${(v / 1000).toFixed(1)} kHz`}
                onChange={setCh1Fc}
              />
              <SliderControl
                label="fm₁"
                value={ch1Fm}
                min={300}
                max={2000}
                step={100}
                unit="Hz"
                onChange={setCh1Fm}
              />
            </div>

            {/* Channel 2 */}
            <div className="p-2.5 bg-[#FAF9FD] rounded-lg border border-[#E8E3EF] space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-bold text-[#2563EB] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ch2Enabled}
                    onChange={(e) => setCh2Enabled(e.target.checked)}
                    className="accent-[#2563EB]"
                  />
                  <span>Radio 2</span>
                </label>
                {ch2Enabled && (
                  <span className="font-mono text-[10px] text-[#77717F]">
                    [{(ch2Fc - ch2Fm) / 1000}–{(ch2Fc + ch2Fm) / 1000} kHz]
                  </span>
                )}
              </div>
              {ch2Enabled && (
                <>
                  <SliderControl
                    label="fc₂"
                    value={ch2Fc}
                    min={3000}
                    max={26000}
                    step={500}
                    formatValue={(v) => `${(v / 1000).toFixed(1)} kHz`}
                    onChange={setCh2Fc}
                  />
                  <SliderControl
                    label="fm₂"
                    value={ch2Fm}
                    min={300}
                    max={2000}
                    step={100}
                    unit="Hz"
                    onChange={setCh2Fm}
                  />
                </>
              )}
            </div>

            {/* Channel 3 */}
            <div className="p-2.5 bg-[#FAF9FD] rounded-lg border border-[#E8E3EF] space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-bold text-[#059669] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ch3Enabled}
                    onChange={(e) => setCh3Enabled(e.target.checked)}
                    className="accent-[#059669]"
                  />
                  <span>Radio 3</span>
                </label>
                {ch3Enabled && (
                  <span className="font-mono text-[10px] text-[#77717F]">
                    [{(ch3Fc - ch3Fm) / 1000}–{(ch3Fc + ch3Fm) / 1000} kHz]
                  </span>
                )}
              </div>
              {ch3Enabled && (
                <>
                  <SliderControl
                    label="fc₃"
                    value={ch3Fc}
                    min={3000}
                    max={26000}
                    step={500}
                    formatValue={(v) => `${(v / 1000).toFixed(1)} kHz`}
                    onChange={setCh3Fc}
                  />
                  <SliderControl
                    label="fm₃"
                    value={ch3Fm}
                    min={300}
                    max={2000}
                    step={100}
                    unit="Hz"
                    onChange={setCh3Fm}
                  />
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="pb-2 border-b border-[#F1EBFA]">
              <h2 className="text-xs font-bold text-[#24212C]">Physical Constraints</h2>
            </div>

            <SliderControl
              label="Carrier Frequency (fc)"
              value={antennaScaleExp}
              min={3}
              max={9}
              step={0.05}
              formatValue={() => formatFreqHz(antennaFcHz)}
              onChange={setAntennaScaleExp}
            />

            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setAntennaScaleExp(3)}
                className="px-2 py-1.5 text-[11px] font-mono bg-[#FAF9FD] hover:bg-[#F1EBFA] border border-[#E8E3EF] rounded-md text-[#24212C] cursor-pointer"
              >
                1 kHz (Audio)
              </button>
              <button
                onClick={() => setAntennaScaleExp(8)}
                className="px-2 py-1.5 text-[11px] font-mono bg-[#FAF9FD] hover:bg-[#F1EBFA] border border-[#E8E3EF] rounded-md text-[#4B287F] font-semibold cursor-pointer"
              >
                100 MHz (FM)
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <MetricCell
                label="Quarter-Wave (λ/4)"
                value={formatAntennaLen(physRes.quarterWaveMeters)}
                accent={physRes.quarterWaveMeters < 10}
                warn={physRes.quarterWaveMeters > 1000}
              />
              <MetricCell
                label="Practicality"
                value={physRes.quarterWaveMeters > 100 ? 'Impractical' : 'Practical'}
                warn={physRes.quarterWaveMeters > 100}
                accent={physRes.quarterWaveMeters <= 100}
              />
            </div>

            <div className="grid grid-cols-1 gap-2">
              <MetricCell label="ITU Spectrum Band" value={physRes.bandInfo.band} accent />
              <MetricCell label="Typical Application" value={physRes.bandInfo.useCase} />
            </div>

            <div className="pt-2 border-t border-[#F1EBFA] space-y-2">
              <SegmentedControl
                label="Channel Medium"
                value={medium}
                onChange={setMedium}
                options={[
                  { value: 'twisted-pair', label: 'Twisted Pair' },
                  { value: 'coax', label: 'Coax' },
                ]}
              />
              <SegmentedControl
                value={medium}
                onChange={setMedium}
                options={[
                  { value: 'waveguide', label: 'Waveguide' },
                  { value: 'atmosphere', label: 'Atmosphere' },
                ]}
              />
            </div>
          </div>
        )
      }
    >
      {subMode === 'real-world' ? (
        <>
          <SignalFlowStrip
            blocks={[
              { label: realKind === 'voice' ? 'Voice (300–3400 Hz)' : 'Sensor (< 1 Hz)', active: true },
              { label: 'Microphone / Transducer' },
              { label: 'Baseband Signal m(t)' },
              { label: 'Needs Up-Conversion to fc' },
            ]}
          />
          <ScientificScopeCanvas
            title={
              realKind === 'voice'
                ? 'Voice Signal (Time Domain, 50 ms)'
                : 'Sensor Output (Time Domain, 20 s)'
            }
            t={realRes.t}
            xLabel={realRes.xLabel}
            xUnitMultiplier={realRes.xMult}
            height={225}
            traces={[
              {
                id: 'rw',
                name: realKind === 'voice' ? 'Speech m(t)' : 'Sensor Value',
                color: '#D97706',
                data: realRes.samples,
              },
            ]}
          />
          <SpectrumAnalyzerCanvas
            title={
              realKind === 'voice'
                ? 'Voice Magnitude Spectrum (Energy ~300–3400 Hz)'
                : 'Sensor Magnitude Spectrum (Energy < 1 Hz)'
            }
            spectrum={realRes.spectrum}
            maxFreqHz={realRes.maxFreqHz}
            defaultScale="dB"
            defaultTwoSided={false}
            height={225}
          />
        </>
      ) : subMode === 'spectrum-fdm' ? (
        <>
          <SignalFlowStrip
            blocks={[
              { label: 'R1 · R2 · R3 Baseband' },
              { label: 'Shift to fc₁, fc₂, fc₃', active: true },
              { label: 'Composite FDM Channel' },
              { label: `Rx Dial: ${tunedChannel.label}`, detail: `${(tunedChannel.fc / 1000).toFixed(1)} kHz`, active: true },
              { label: 'Recovered m̂(t)' },
            ]}
          />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <ScientificScopeCanvas
              title="Tx Baseband Signals vs Tuned Rx Recovered Output"
              t={fdmRes.t}
              height={210}
              traces={[
                { id: 'm1', name: 'm₁(t)', color: '#7045B8', data: fdmRes.perChannelBase[1] },
                ...(ch2Enabled
                  ? [{ id: 'm2', name: 'm₂(t)', color: '#2563EB', data: fdmRes.perChannelBase[2] }]
                  : []),
                ...(ch3Enabled
                  ? [{ id: 'm3', name: 'm₃(t)', color: '#059669', data: fdmRes.perChannelBase[3] }]
                  : []),
                {
                  id: 'rx',
                  name: `Rx Tuned (${fdmRes.tunedLabel})`,
                  color: '#D97706',
                  data: fdmRes.rxRecovered,
                  lineDash: [4, 2],
                  lineWidth: 2.2,
                },
              ]}
            />
            <ScientificScopeCanvas
              title="Multiplexed FDM Signal s(t) on Shared Medium"
              t={fdmRes.t}
              height={210}
              traces={[
                { id: 'comp', name: 'sFDM(t) Composite', color: '#4B287F', data: fdmRes.composite },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <SpectrumAnalyzerCanvas
              title="Baseband Spectrum M(f) (Overlapping around 0 Hz)"
              spectrum={fdmRes.basebandSpectrum}
              maxFreqHz={4000}
              height={215}
              markers={[
                { freq: ch1Fm, label: `fm₁`, color: '#7045B8' },
                ...(ch2Enabled ? [{ freq: ch2Fm, label: `fm₂`, color: '#2563EB' }] : []),
              ]}
            />
            <SpectrumAnalyzerCanvas
              title="Up-Converted FDM Spectrum S(f) (±fc₁, ±fc₂, ±fc₃)"
              spectrum={fdmRes.passbandSpectrum}
              maxFreqHz={30000}
              height={215}
              highlightBandwidth={{
                start: Math.max(0, tunedChannel.fc - tunedChannel.fm),
                end: tunedChannel.fc + tunedChannel.fm,
                label: `Rx Tuned: ${tunedChannel.label}`,
              }}
              markers={[
                { freq: ch1Fc, label: `fc₁`, color: '#7045B8' },
                ...(ch2Enabled ? [{ freq: ch2Fc, label: `fc₂`, color: '#2563EB' }] : []),
                ...(ch3Enabled ? [{ freq: ch3Fc, label: `fc₃`, color: '#059669' }] : []),
              ]}
            />
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <MiniChartCanvas
            title="Antenna Size Constraint: l ≈ λ/4 = c / (4fc)"
            series={[
              {
                id: 'antenna',
                label: 'Quarter-wave length (m)',
                color: '#7045B8',
                x: physRes.antennaCurve.map((p) => p.freqHz),
                y: physRes.antennaCurve.map((p) => p.lengthM),
              },
            ]}
            marker={{
              x: antennaFcHz,
              y: physRes.quarterWaveMeters,
              label: `${formatFreqHz(antennaFcHz)} → ${formatAntennaLen(physRes.quarterWaveMeters)}`,
              color: physRes.quarterWaveMeters > 100 ? '#DC2626' : '#059669',
            }}
            logX
            logY
            xLabel="Carrier Frequency fc (Hz)"
            yLabel="Antenna Length (m)"
            xFormatter={(f) => formatFreqHz(f)}
            yFormatter={(m) => formatAntennaLen(m)}
            height={230}
          />

          <MiniChartCanvas
            title={
              medium === 'twisted-pair'
                ? 'Twisted Pair (1 km) — Physical Low-Pass |H(f)|² (dB)'
                : medium === 'coax'
                ? 'Coaxial Cable (100 m) — Attenuation ∝ √f (dB)'
                : medium === 'waveguide'
                ? 'Rectangular Waveguide — High-Pass Cutoff fc ≈ c/(2a)'
                : 'Atmospheric Absorption — O₂ (60 GHz) & H₂O (22, 183 GHz) Windows'
            }
            series={[
              {
                id: 'channel',
                label: medium === 'atmosphere' ? 'Specific Attenuation (dB/km)' : '|H(f)|² (dB)',
                color: '#D97706',
                x: physRes.channelCurve.map((p) => p.freqHz),
                y: physRes.channelCurve.map((p) => p.magDb),
              },
            ]}
            logX
            xLabel="Frequency (Hz)"
            yLabel={medium === 'atmosphere' ? 'Loss (dB/km)' : 'Gain (dB)'}
            xFormatter={(f) => formatFreqHz(f)}
            height={230}
          />
        </div>
      )}
    </LabSplitLayout>
  );
};
