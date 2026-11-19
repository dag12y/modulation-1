import React, { useEffect, useMemo, useState } from 'react';
import { Sliders, Activity, Info } from 'lucide-react';
import { useAudioLab } from '../../context/AudioLabContext';
import {
  DEFAULT_VSB_CONFIG,
  NyquistSymmetryPoint,
  simulateVSBSystem,
  VSBOrientation,
} from '../../dsp/vsb';
import { OscilloscopeCanvas } from '../am-lab/OscilloscopeCanvas';
import { SpectrumCanvas } from '../am-lab/SpectrumCanvas';
import { SharedLabHeader } from './SharedLabHeader';

export const VSBLabPanel: React.FC = () => {
  const {
    rawMessage64,
    carrierFreqHz,
    carrierAmpV,
    bandlimitMessage,
    messageLpfCutoffHz,
    channel,
    playback,
    setAudioTracks,
    togglePlay,
    seek,
  } = useAudioLab();

  const [orientation, setOrientation] = useState<VSBOrientation>('usb-vestige');
  const [vestigeBandwidthHz, setVestigeBandwidthHz] = useState<number>(750);
  const [filterOrder, setFilterOrder] = useState<number>(192);
  const [localPhaseErrorDeg, setLocalPhaseErrorDeg] = useState<number>(0);
  const [localFreqOffsetHz, setLocalFreqOffsetHz] = useState<number>(0);
  const [receiverLpfCutoffHz, setReceiverLpfCutoffHz] = useState<number>(3500);
  const [equalizationEnabled, setEqualizationEnabled] = useState<boolean>(true);

  const sim = useMemo(() => {
    return simulateVSBSystem(rawMessage64, {
      ...DEFAULT_VSB_CONFIG,
      carrierFreqHz,
      carrierAmpV,
      orientation,
      bandlimitMessage,
      messageLpfCutoffHz,
      mainBandwidthHz: messageLpfCutoffHz,
      vestigeBandwidthHz: Math.min(messageLpfCutoffHz, vestigeBandwidthHz),
      filterOrder,
      localPhaseErrorDeg,
      localFreqOffsetHz,
      receiverLpfCutoffHz,
      equalizationEnabled,
      channel,
    });
  }, [
    rawMessage64,
    carrierFreqHz,
    carrierAmpV,
    orientation,
    bandlimitMessage,
    messageLpfCutoffHz,
    vestigeBandwidthHz,
    filterOrder,
    localPhaseErrorDeg,
    localFreqOffsetHz,
    receiverLpfCutoffHz,
    equalizationEnabled,
    channel,
  ]);

  useEffect(() => {
    setAudioTracks({
      original: sim.originalMessage,
      carrier: sim.carrier,
      dsbSc: sim.dsbScSource,
      vsb: sim.vsbModulated,
      received: sim.received,
      vsbRecovered: sim.vsbRecovered,
    });
  }, [sim, setAudioTracks]);

  const effectiveBv = Math.min(messageLpfCutoffHz, vestigeBandwidthHz);
  const minFreqView = Math.max(0, carrierFreqHz - messageLpfCutoffHz * 1.5 - 400);
  const maxFreqView = Math.min(22050, carrierFreqHz + messageLpfCutoffHz * 1.5 + 400);

  return (
    <div className="space-y-5 font-body text-[#111827]">
      <SharedLabHeader
        title="VSB Laboratory (FIR Shaping Filter & Nyquist Complementary Symmetry)"
        badge="B < BW_VSB < 2B · COMPLEMENTARY ROLL-OFF"
        channelSnrDb={sim.channelSnrDb}
      />

      {/* VSB Shaping Filter & Orientation Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#D97706]" />
            <h3 className="font-heading text-sm font-bold text-[#111827]">
              FIR VSB Shaping Filter: H(f + f_c) + H(f − f_c) = 1
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-[#FAFAF8] border border-slate-200 rounded-lg p-0.5 text-xs font-mono">
              {[
                { id: 'usb-vestige' as const, label: 'USB + LSB Vestige' },
                { id: 'lsb-vestige' as const, label: 'LSB + USB Vestige' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setOrientation(opt.id)}
                  className={`px-3 py-1 rounded-md cursor-pointer transition-colors ${
                    orientation === opt.id
                      ? 'bg-[#1E4620] text-white font-semibold'
                      : 'text-slate-600 hover:text-[#111827]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setVestigeBandwidthHz(Math.round(messageLpfCutoffHz * 0.22));
                setFilterOrder(192);
              }}
              className="px-2.5 py-1 rounded-lg bg-[#EFF3EB] hover:bg-[#DCE5D5] border border-[#DCE5D5] text-[11px] font-mono font-semibold text-[#1E4620] cursor-pointer"
            >
              NTSC Preset (~22% Vestige)
            </button>
          </div>
        </div>

        {/* Sliders & BW Comparison Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-[#FAFAF8] border border-slate-200 rounded-xl p-3.5">
          <div className="md:col-span-4 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-600">Vestige Bandwidth B_v</span>
              <span className="font-mono font-semibold text-[#D97706] tabular-nums">
                {effectiveBv} Hz ({Math.round((effectiveBv / Math.max(1, messageLpfCutoffHz)) * 100)}% of B)
              </span>
            </div>
            <input
              type="range"
              min={150}
              max={2000}
              step={50}
              value={vestigeBandwidthHz}
              onChange={(e) => setVestigeBandwidthHz(Number(e.target.value))}
              className="studio-slider w-full cursor-pointer"
            />
          </div>

          <div className="md:col-span-4 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-600">FIR Shaping Order M</span>
              <span className="font-mono font-semibold text-[#111827] tabular-nums">
                {filterOrder} taps
              </span>
            </div>
            <input
              type="range"
              min={64}
              max={256}
              step={16}
              value={filterOrder}
              onChange={(e) => setFilterOrder(Number(e.target.value))}
              className="studio-slider w-full cursor-pointer"
            />
          </div>

          <div className="md:col-span-4 flex flex-wrap justify-end gap-2 text-[11px] font-mono">
            <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 tabular-nums">
              SSB: {(sim.ssbReferenceBandwidthHz / 1000).toFixed(2)}k &lt; VSB:{' '}
              <strong className="text-[#1E4620]">{(sim.occupiedBandwidthHz / 1000).toFixed(2)}k</strong> &lt; DSB:{' '}
              {(sim.dsbReferenceBandwidthHz / 1000).toFixed(2)}k
            </span>
          </div>
        </div>

        {/* Spectrum with Real FIR VSB |H(f)| Overlay + Nyquist Complementary Chart */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-7">
            <SpectrumCanvas
              title="VSB Shaped Passband FFT & FIR Shaping Filter |H(f)|"
              spectrum={sim.spectra.vsbModulated}
              color="#D97706"
              height={205}
              minFreqHz={minFreqView}
              maxFreqHz={maxFreqView}
              markers={[{ freqHz: carrierFreqHz, label: 'f_c (-6 dB)', color: '#0F172A' }]}
              bandwidthBand={
                orientation === 'usb-vestige'
                  ? {
                      startHz: Math.max(0, carrierFreqHz - effectiveBv),
                      endHz: carrierFreqHz + messageLpfCutoffHz,
                      label: `VSB BW = ${(sim.occupiedBandwidthHz / 1000).toFixed(2)} kHz`,
                    }
                  : {
                      startHz: Math.max(0, carrierFreqHz - messageLpfCutoffHz),
                      endHz: carrierFreqHz + effectiveBv,
                      label: `VSB BW = ${(sim.occupiedBandwidthHz / 1000).toFixed(2)} kHz`,
                    }
              }
              filterOverlay={{
                frequencies: sim.filterCurve.frequencies,
                magnitudesDb: sim.filterCurve.magnitudesDb,
                color: '#1E4620',
                label: `VSB FIR |H(f)| (${filterOrder} taps)`,
              }}
            />
          </div>

          <div className="xl:col-span-5">
            <NyquistSymmetryPlot
              points={sim.nyquistPoints}
              carrierFreqHz={carrierFreqHz}
              vestigeBwHz={effectiveBv}
              rmsErr={sim.nyquistRmsError}
            />
          </div>
        </div>

        {/* Time-Domain Waveforms */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
          <OscilloscopeCanvas
            title="1. DSB-SC Pre-Filter Signal (Reference)"
            formula="s_DSB(t) = A_c m(t) cos(2πf_c t) before FIR VSB shaping"
            data={sim.dsbScSource}
            color="#64748B"
            height={145}
            defaultZoom={20}
            isPlaying={playback.isPlaying && playback.activeTrack === 'dsbSc'}
            playbackTimeSec={playback.currentTimeSec}
            onTogglePlay={() => togglePlay('dsbSc')}
            onSeek={seek}
          />
          <OscilloscopeCanvas
            title="2. FIR-Shaped VSB Signal s_VSB(t)"
            formula="s_VSB(t) = s_DSB(t) * h_VSB(t) [Linear-phase delay compensated]"
            data={sim.vsbModulated}
            color="#D97706"
            height={145}
            defaultZoom={20}
            highlighted
            isPlaying={playback.isPlaying && playback.activeTrack === 'vsb'}
            playbackTimeSec={playback.currentTimeSec}
            onTogglePlay={() => togglePlay('vsb')}
            onSeek={seek}
            badgeText={orientation === 'usb-vestige' ? 'USB + LSB Vestige' : 'LSB + USB Vestige'}
          />
        </div>
      </div>

      {/* Coherent VSB Receiver */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#1E4620]" />
            <h3 className="font-heading text-sm font-bold text-[#111827]">
              Coherent VSB Receiver &amp; Baseband Recovery
            </h3>
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={equalizationEnabled}
              onChange={(e) => setEqualizationEnabled(e.target.checked)}
              className="accent-[#1E4620]"
            />
            <span>DC Removal &amp; Equalization</span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-[#FAFAF8] border border-slate-200 rounded-xl p-3">
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-600">LO Phase Error φ_lo</span>
              <span className="font-mono font-semibold tabular-nums">{localPhaseErrorDeg}°</span>
            </div>
            <input
              type="range"
              min={-90}
              max={90}
              step={5}
              value={localPhaseErrorDeg}
              onChange={(e) => setLocalPhaseErrorDeg(Number(e.target.value))}
              className="studio-slider w-full cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-600">LO Freq Offset Δf_lo</span>
              <span className="font-mono font-semibold tabular-nums">{localFreqOffsetHz} Hz</span>
            </div>
            <input
              type="range"
              min={-50}
              max={50}
              step={2}
              value={localFreqOffsetHz}
              onChange={(e) => setLocalFreqOffsetHz(Number(e.target.value))}
              className="studio-slider w-full cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-600">Receiver LPF Cutoff</span>
              <span className="font-mono font-semibold tabular-nums">{receiverLpfCutoffHz} Hz</span>
            </div>
            <input
              type="range"
              min={500}
              max={5000}
              step={100}
              value={receiverLpfCutoffHz}
              onChange={(e) => setReceiverLpfCutoffHz(Number(e.target.value))}
              className="studio-slider w-full cursor-pointer"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <OscilloscopeCanvas
            title="Recovered VSB Audio y_VSB(t)"
            data={sim.vsbRecovered}
            color="#059669"
            overlays={[{ label: 'Original m(t)', color: '#0284C7', data: sim.originalMessage, dashed: true }]}
            height={165}
            isPlaying={playback.isPlaying && playback.activeTrack === 'vsbRecovered'}
            playbackTimeSec={playback.currentTimeSec}
            onTogglePlay={() => togglePlay('vsbRecovered')}
            onSeek={seek}
            badgeText={`SNR ${sim.metrics.snrDb.toFixed(1)} dB · r = ${sim.metrics.pearsonR.toFixed(3)}`}
          />

          <SpectrumCanvas
            title="Recovered Baseband VSB Audio FFT"
            spectrum={sim.spectra.recovered}
            color="#059669"
            height={165}
            maxFreqHz={5000}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {[
            { label: 'VSB BW (B + B_v)', val: `${(sim.occupiedBandwidthHz / 1000).toFixed(2)} kHz` },
            { label: 'BW vs DSB-SC', val: `${sim.bandwidthRatioVsDsbPct.toFixed(1)}%` },
            { label: 'Nyquist RMS Err', val: sim.nyquistRmsError.toFixed(4) },
            { label: 'Recovered SNR', val: `${sim.metrics.snrDb.toFixed(1)} dB` },
            { label: 'Pearson r', val: sim.metrics.pearsonR.toFixed(4) },
          ].map((m) => (
            <div key={m.label} className="bg-[#FAFAF8] border border-slate-200 rounded-xl px-3 py-2">
              <div className="text-[10px] font-mono text-slate-500 uppercase">{m.label}</div>
              <div className="text-sm font-mono font-bold text-[#111827] tabular-nums mt-0.5">{m.val}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#EFF3EB] border border-[#DCE5D5] rounded-xl p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-[#1E4620] shrink-0 mt-0.5" />
        <p className="text-xs text-slate-700 leading-relaxed">
          <strong className="text-[#111827]">Why VSB Replaces Brick-Wall SSB:</strong> Realizable bandpass filters cannot cut off infinitely sharply right at <span className="font-mono">f_c</span> without severe phase distortion. VSB intentionally lets a gentle vestige <span className="font-mono">B_v</span> of the opposite sideband pass such that{' '}
          <span className="font-mono">|H(f_c+Δf)| + |H(f_c−Δf)| = 1</span>, recovering <span className="font-mono">m(t)</span> cleanly at bandwidth <span className="font-mono">B + B_v</span>.
        </p>
      </div>
    </div>
  );
};

const NyquistSymmetryPlot: React.FC<{
  points: NyquistSymmetryPoint[];
  carrierFreqHz: number;
  vestigeBwHz: number;
  rmsErr: number;
}> = ({ points, carrierFreqHz, vestigeBwHz, rmsErr }) => {
  const width = 440;
  const height = 205;
  const padL = 36;
  const padR = 14;
  const padT = 22;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const toX = (df: number) => padL + ((df + vestigeBwHz) / Math.max(1, 2 * vestigeBwHz)) * plotW;
  const toY = (val: number) => padT + ((1.2 - Math.max(0, Math.min(1.2, val))) / 1.2) * plotH;

  const upperPts = points.map((p) => `${toX(p.deltaFreqHz).toFixed(1)},${toY(p.hUpper).toFixed(1)}`).join(' ');
  const lowerPts = points.map((p) => `${toX(p.deltaFreqHz).toFixed(1)},${toY(p.hLower).toFixed(1)}`).join(' ');
  const sumPts = points.map((p) => `${toX(p.deltaFreqHz).toFixed(1)},${toY(p.sum).toFixed(1)}`).join(' ');

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-heading font-bold text-[#111827]">
          Nyquist Symmetry Check Around f_c = {(carrierFreqHz / 1000).toFixed(2)} kHz
        </span>
        <span className="font-mono text-[10px] text-[#1E4620] font-semibold tabular-nums">
          RMS Err {rmsErr.toFixed(4)}
        </span>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[205px] block">
          {[0, 0.5, 1.0].map((v) => {
            const y = toY(v);
            return (
              <g key={v}>
                <line
                  x1={padL}
                  y1={y}
                  x2={padL + plotW}
                  y2={y}
                  stroke={v === 1.0 ? 'rgba(30,70,32,0.35)' : 'rgba(15,23,42,0.08)'}
                  strokeDasharray={v === 1.0 ? '4 3' : '2 3'}
                />
                <text
                  x={padL - 5}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="9.5"
                  fontFamily="JetBrains Mono, monospace"
                  fill="#64748B"
                >
                  {v.toFixed(1)}
                </text>
              </g>
            );
          })}
          {/* f_c vertical axis at Δf=0 */}
          <line
            x1={toX(0)}
            y1={padT}
            x2={toX(0)}
            y2={padT + plotH}
            stroke="rgba(15,23,42,0.22)"
            strokeDasharray="3 3"
          />
          <polyline fill="none" stroke="#2563EB" strokeWidth="1.7" points={upperPts} />
          <polyline fill="none" stroke="#DB2777" strokeWidth="1.7" points={lowerPts} />
          <polyline fill="none" stroke="#1E4620" strokeWidth="2.2" points={sumPts} />

          {/* Legend */}
          <g fontSize="9.5" fontFamily="JetBrains Mono, monospace">
            <line x1={padL + 4} y1={11} x2={padL + 18} y2={11} stroke="#2563EB" strokeWidth="2" />
            <text x={padL + 22} y={14} fill="#2563EB">H(fc+Δf)</text>
            <line x1={padL + 90} y1={11} x2={padL + 104} y2={11} stroke="#DB2777" strokeWidth="2" />
            <text x={padL + 108} y={14} fill="#DB2777">H(fc-Δf)</text>
            <line x1={padL + 178} y1={11} x2={padL + 192} y2={11} stroke="#1E4620" strokeWidth="2.4" />
            <text x={padL + 196} y={14} fill="#1E4620" fontWeight="700">Sum ≈ 1.00</text>
          </g>

          <text x={padL} y={height - 6} fontSize="9.5" fontFamily="JetBrains Mono, monospace" fill="#64748B">
            -{vestigeBwHz} Hz
          </text>
          <text
            x={toX(0)}
            y={height - 6}
            textAnchor="middle"
            fontSize="9.5"
            fontFamily="JetBrains Mono, monospace"
            fill="#111827"
          >
            Δf = 0 (fc)
          </text>
          <text
            x={padL + plotW}
            y={height - 6}
            textAnchor="end"
            fontSize="9.5"
            fontFamily="JetBrains Mono, monospace"
            fill="#64748B"
          >
            +{vestigeBwHz} Hz
          </text>
        </svg>
      </div>
    </div>
  );
};
