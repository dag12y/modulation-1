import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Lock, Radio, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { useAudioLab } from '../../context/AudioLabContext';
import { DEFAULT_DSBSC_CONFIG, simulateDSBSCSystem } from '../../dsp/dsbSc';
import { OscilloscopeCanvas } from '../am-lab/OscilloscopeCanvas';
import { SpectrumCanvas } from '../am-lab/SpectrumCanvas';
import { SharedLabHeader } from './SharedLabHeader';

export const DSBSCLabPanel: React.FC = () => {
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

  // DSB-SC Coherent vs Costas Controls
  const [rxView, setRxView] = useState<'compare' | 'coherent' | 'costas'>('compare');
  const [localPhaseErrorDeg, setLocalPhaseErrorDeg] = useState<number>(0);
  const [localFreqOffsetHz, setLocalFreqOffsetHz] = useState<number>(0);
  const [receiverLpfCutoffHz, setReceiverLpfCutoffHz] = useState<number>(3500);

  const [costasInitialPhaseDeg, setCostasInitialPhaseDeg] = useState<number>(50);
  const [costasInitialFreqOffsetHz, setCostasInitialFreqOffsetHz] = useState<number>(15);
  const [costasLoopGain, setCostasLoopGain] = useState<number>(1.0);
  const [costasArmLpfCutoffHz, setCostasArmLpfCutoffHz] = useState<number>(3500);

  const sim = useMemo(() => {
    return simulateDSBSCSystem(rawMessage64, {
      ...DEFAULT_DSBSC_CONFIG,
      carrierFreqHz,
      carrierAmpV,
      bandlimitMessage,
      messageLpfCutoffHz,
      messageBWHz: messageLpfCutoffHz,
      localPhaseErrorDeg,
      localFreqOffsetHz,
      receiverLpfCutoffHz,
      costasInitialPhaseDeg,
      costasInitialFreqOffsetHz,
      costasLoopGain,
      costasArmLpfCutoffHz,
      channel,
    });
  }, [
    rawMessage64,
    carrierFreqHz,
    carrierAmpV,
    bandlimitMessage,
    messageLpfCutoffHz,
    localPhaseErrorDeg,
    localFreqOffsetHz,
    receiverLpfCutoffHz,
    costasInitialPhaseDeg,
    costasInitialFreqOffsetHz,
    costasLoopGain,
    costasArmLpfCutoffHz,
    channel,
  ]);

  useEffect(() => {
    setAudioTracks({
      original: sim.originalMessage,
      carrier: sim.carrier,
      dsbSc: sim.modulated,
      received: sim.received,
      product: sim.product,
      coherentRecovered: sim.coherentRecovered,
      costasRecovered: sim.costasRecovered,
    });
  }, [sim, setAudioTracks]);

  const isQuadNull = Math.abs(localPhaseErrorDeg) === 90 && localFreqOffsetHz === 0;

  return (
    <div className="space-y-5 font-body text-[#111827]">
      <SharedLabHeader
        title="DSB-SC Transmitter, Coherent Detector & Costas Carrier Recovery"
        badge="SUPPRESSED CARRIER · 100% POWER EFFICIENCY"
        channelSnrDb={sim.channelSnrDb}
      />

      {/* Transmitter Waveform & Spectrum */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#7C3AED]" />
            <h3 className="font-heading text-sm font-bold text-[#111827]">
              Transmitter &amp; Channel Stage: s(t) = A_c m(t) cos(2πf_c t)
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 tabular-nums">
              Carrier Power: 0.00 W (Suppressed)
            </span>
            <span className="px-2 py-0.5 rounded bg-[#EFF3EB] text-[#1E4620] font-semibold tabular-nums">
              Sideband Power: {sim.sidebandPowerW.toFixed(4)} W (100%)
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 tabular-nums">
              BW: {(sim.occupiedBandwidthHz / 1000).toFixed(2)} kHz (2B)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-6 space-y-3">
            <OscilloscopeCanvas
              title="Baseband Message m(t)"
              formula="m(t) bandlimited & normalized ([-0.9, +0.9] V)"
              data={sim.originalMessage}
              color="#0284C7"
              height={150}
              isPlaying={playback.isPlaying && playback.activeTrack === 'original'}
              playbackTimeSec={playback.currentTimeSec}
              onTogglePlay={() => togglePlay('original')}
              onSeek={seek}
            />
            <OscilloscopeCanvas
              title="DSB-SC Modulated Signal s(t)"
              formula="s(t) = A_c · m(t) · cos(2πf_c t)  [180° phase reversals at m(t)=0]"
              data={sim.modulated}
              color="#7C3AED"
              overlays={[{ label: '+Envelope', color: '#0284C7', data: sim.originalMessage, dashed: true }]}
              height={165}
              defaultZoom={20}
              isPlaying={playback.isPlaying && playback.activeTrack === 'dsbSc'}
              playbackTimeSec={playback.currentTimeSec}
              onTogglePlay={() => togglePlay('dsbSc')}
              onSeek={seek}
              badgeText="Zero Carrier"
            />
          </div>

          <div className="xl:col-span-6 space-y-3">
            <SpectrumCanvas
              title="DSB-SC Passband FFT (8192-pt Hann)"
              spectrum={sim.spectra.modulated}
              color="#7C3AED"
              height={170}
              minFreqHz={Math.max(0, carrierFreqHz - messageLpfCutoffHz * 1.8)}
              maxFreqHz={Math.min(22050, carrierFreqHz + messageLpfCutoffHz * 1.8)}
              markers={[{ freqHz: carrierFreqHz, label: 'f_c (Null)', color: '#64748B' }]}
              bandwidthBand={{
                startHz: Math.max(0, carrierFreqHz - messageLpfCutoffHz),
                endHz: carrierFreqHz + messageLpfCutoffHz,
                label: `2B = ${(sim.occupiedBandwidthHz / 1000).toFixed(1)} kHz`,
              }}
            />
            <OscilloscopeCanvas
              title="Received Channel Signal r(t)"
              formula="r(t) = α · s_shifted(t) + n(t)"
              data={sim.received}
              color="#2563EB"
              height={150}
              defaultZoom={20}
              isPlaying={playback.isPlaying && playback.activeTrack === 'received'}
              playbackTimeSec={playback.currentTimeSec}
              onTogglePlay={() => togglePlay('received')}
              onSeek={seek}
              badgeText={channel.awgnEnabled ? `SNR ${sim.channelSnrDb.toFixed(1)} dB` : 'Clean Channel'}
            />
          </div>
        </div>
      </div>

      {/* Receiver Stage: Coherent Synchronous vs Costas Loop */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#1E4620]" />
            <h3 className="font-heading text-sm font-bold text-[#111827]">
              Demodulation Comparison: Coherent LO vs Costas I/Q Carrier Recovery
            </h3>
          </div>

          <div className="flex items-center bg-[#FAFAF8] border border-slate-200 rounded-lg p-0.5 text-xs font-mono">
            {[
              { id: 'compare' as const, label: 'Side-by-Side' },
              { id: 'coherent' as const, label: 'Coherent LO' },
              { id: 'costas' as const, label: 'Costas Loop PLL' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setRxView(t.id)}
                className={`px-3 py-1 rounded-md cursor-pointer transition-colors ${
                  rxView === t.id
                    ? 'bg-[#1E4620] text-white font-semibold'
                    : 'text-slate-600 hover:text-[#111827]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Coherent Demodulator Card */}
          {(rxView === 'compare' || rxView === 'coherent') && (
            <div
              className={`${
                rxView === 'compare' ? 'lg:col-span-6' : 'lg:col-span-12'
              } bg-[#FAFAF8] border border-slate-200 rounded-xl p-4 space-y-3`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-heading text-sm font-bold text-[#111827]">
                    A. Coherent Synchronous Demodulator
                  </h4>
                  <p className="text-[11px] font-mono text-slate-500">
                    y_coh(t) = LPF&#123;r(t)·cos(2π(f_c+Δf)t + φ)&#125; ∝ m(t)·cos(φ)
                  </p>
                </div>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                    isQuadNull
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-[#EFF3EB] text-[#1E4620]'
                  }`}
                >
                  cos(φ_eff) = {sim.cosPhiFactor.toFixed(2)}
                </span>
              </div>

              {/* Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white border border-slate-200 rounded-lg p-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-600">LO Phase φ_lo</span>
                    <span className="font-mono font-semibold text-[#111827] tabular-nums">
                      {localPhaseErrorDeg}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={5}
                    value={localPhaseErrorDeg}
                    onChange={(e) => setLocalPhaseErrorDeg(Number(e.target.value))}
                    className="studio-slider w-full cursor-pointer"
                  />
                  <div className="flex gap-1 pt-0.5">
                    {[0, 45, 90].map((deg) => (
                      <button
                        key={deg}
                        type="button"
                        onClick={() => setLocalPhaseErrorDeg(deg)}
                        className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono border cursor-pointer ${
                          localPhaseErrorDeg === deg
                            ? 'bg-[#1E4620] border-[#1E4620] text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        {deg === 90 ? '90° Null' : `${deg}°`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-600">LO Freq Δf_lo</span>
                    <span className="font-mono font-semibold text-[#111827] tabular-nums">
                      {localFreqOffsetHz} Hz
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-25}
                    max={25}
                    step={1}
                    value={localFreqOffsetHz}
                    onChange={(e) => setLocalFreqOffsetHz(Number(e.target.value))}
                    className="studio-slider w-full cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-600">Rx LPF Cutoff</span>
                    <span className="font-mono font-semibold text-[#111827] tabular-nums">
                      {receiverLpfCutoffHz} Hz
                    </span>
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

              {isQuadNull && (
                <div className="flex items-center gap-2 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    Quadrature Null! At φ = ±90°, cos(90°) = 0 causes complete signal fadeout in a fixed-LO coherent detector.
                  </span>
                </div>
              )}

              <OscilloscopeCanvas
                title="Coherent Recovered Audio y_coh(t)"
                data={sim.coherentRecovered}
                color="#059669"
                overlays={[{ label: 'Original m(t)', color: '#0284C7', data: sim.originalMessage, dashed: true }]}
                height={155}
                isPlaying={playback.isPlaying && playback.activeTrack === 'coherentRecovered'}
                playbackTimeSec={playback.currentTimeSec}
                onTogglePlay={() => togglePlay('coherentRecovered')}
                onSeek={seek}
                badgeText={`r = ${sim.coherentMetrics.pearsonR.toFixed(3)} · SNR ${sim.coherentMetrics.snrDb.toFixed(1)} dB`}
              />

              <SpectrumCanvas
                title="Product Detector p(t) Spectrum (Shows Baseband + 2f_c Term)"
                spectrum={sim.spectra.product}
                color="#D97706"
                height={145}
                maxFreqHz={Math.min(22050, carrierFreqHz * 2 + messageLpfCutoffHz + 1500)}
                markers={[{ freqHz: 2 * carrierFreqHz, label: '2f_c', color: '#DC2626' }]}
              />
            </div>
          )}

          {/* Costas Loop Carrier Recovery Card */}
          {(rxView === 'compare' || rxView === 'costas') && (
            <div
              className={`${
                rxView === 'compare' ? 'lg:col-span-6' : 'lg:col-span-12'
              } bg-[#FAFAF8] border border-slate-200 rounded-xl p-4 space-y-3`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-heading text-sm font-bold text-[#111827] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[#1E4620]" />
                    <span>B. Costas Loop Carrier Recovery (I/Q PLL)</span>
                  </h4>
                  <p className="text-[11px] font-mono text-slate-500">
                    Self-aligning VCO locks onto suppressed carrier using I·Q phase detector
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                    sim.costasLocked
                      ? 'bg-[#EFF3EB] text-[#1E4620]'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {sim.costasLocked ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  {sim.costasLocked
                    ? `LOCKED (${sim.costasFinalPhaseErrorDeg.toFixed(1)}°)`
                    : `TRACKING (${sim.costasFinalPhaseErrorDeg.toFixed(1)}°)`}
                </span>
              </div>

              {/* Costas Controls */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-white border border-slate-200 rounded-lg p-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-600">Init φ_0</span>
                    <span className="font-mono font-semibold tabular-nums">{costasInitialPhaseDeg}°</span>
                  </div>
                  <input
                    type="range"
                    min={-85}
                    max={85}
                    step={5}
                    value={costasInitialPhaseDeg}
                    onChange={(e) => setCostasInitialPhaseDeg(Number(e.target.value))}
                    className="studio-slider w-full cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-600">Init Δf_0</span>
                    <span className="font-mono font-semibold tabular-nums">{costasInitialFreqOffsetHz} Hz</span>
                  </div>
                  <input
                    type="range"
                    min={-60}
                    max={60}
                    step={5}
                    value={costasInitialFreqOffsetHz}
                    onChange={(e) => setCostasInitialFreqOffsetHz(Number(e.target.value))}
                    className="studio-slider w-full cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-600">Loop Gain K</span>
                    <span className="font-mono font-semibold tabular-nums">{costasLoopGain.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={3.0}
                    step={0.1}
                    value={costasLoopGain}
                    onChange={(e) => setCostasLoopGain(Number(e.target.value))}
                    className="studio-slider w-full cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-600">Arm LPF</span>
                    <span className="font-mono font-semibold tabular-nums">{costasArmLpfCutoffHz} Hz</span>
                  </div>
                  <input
                    type="range"
                    min={800}
                    max={5000}
                    step={100}
                    value={costasArmLpfCutoffHz}
                    onChange={(e) => setCostasArmLpfCutoffHz(Number(e.target.value))}
                    className="studio-slider w-full cursor-pointer"
                  />
                </div>
              </div>

              <OscilloscopeCanvas
                title="Costas Recovered Audio y_costas(t)"
                data={sim.costasRecovered}
                color="#15803D"
                overlays={[{ label: 'Original m(t)', color: '#0284C7', data: sim.originalMessage, dashed: true }]}
                height={155}
                isPlaying={playback.isPlaying && playback.activeTrack === 'costasRecovered'}
                playbackTimeSec={playback.currentTimeSec}
                onTogglePlay={() => togglePlay('costasRecovered')}
                onSeek={seek}
                badgeText={`r = ${sim.costasMetrics.pearsonR.toFixed(3)} · SNR ${sim.costasMetrics.snrDb.toFixed(1)} dB${sim.costasPhaseInverted ? ' (180° lock)' : ''}`}
              />

              {/* VCO Phase Error Convergence Curve */}
              <CostasPhaseConvergencePlot
                times={sim.costasTimeTraceSec}
                phasesDeg={sim.costasPhaseErrorDegTrace}
                finalPhaseDeg={sim.costasFinalPhaseErrorDeg}
                locked={sim.costasLocked}
              />
            </div>
          )}
        </div>

        {/* Performance Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
          {[
            { label: 'Coherent SNR', val: `${sim.coherentMetrics.snrDb.toFixed(1)} dB` },
            { label: 'Coherent |r|', val: sim.coherentMetrics.pearsonR.toFixed(4) },
            { label: 'Costas SNR', val: `${sim.costasMetrics.snrDb.toFixed(1)} dB` },
            { label: 'Costas |r|', val: sim.costasMetrics.pearsonR.toFixed(4) },
            { label: 'Final Phase Error', val: `${sim.costasFinalPhaseErrorDeg.toFixed(2)}°` },
            { label: 'Occupied BW', val: `${(sim.occupiedBandwidthHz / 1000).toFixed(2)} kHz` },
          ].map((m) => (
            <div key={m.label} className="bg-[#FAFAF8] border border-slate-200 rounded-xl px-3 py-2">
              <div className="text-[10px] font-mono text-slate-500 uppercase">{m.label}</div>
              <div className="text-sm font-mono font-bold text-[#111827] tabular-nums mt-0.5">{m.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Educational Explanation */}
      <div className="bg-[#EFF3EB] border border-[#DCE5D5] rounded-xl p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-[#1E4620] shrink-0 mt-0.5" />
        <div className="text-xs text-slate-700 leading-relaxed space-y-1">
          <div className="font-bold text-[#111827]">Why DSB-SC Needs Synchronous or Costas Recovery</div>
          <p>
            DSB-SC suppresses the high-power carrier completely (achieving 100% power efficiency), so zero-crossings of{' '}
            <span className="font-mono">m(t)</span> invert the RF phase by 180° and destroy simple envelope detection.
            Notice how setting Coherent LO phase to <strong>90°</strong> causes quadrature null fadeout, while the{' '}
            <strong>Costas I/Q Loop</strong> tracks both phase and small frequency offsets automatically (with a 180° sign symmetry).
          </p>
        </div>
      </div>
    </div>
  );
};

const CostasPhaseConvergencePlot: React.FC<{
  times: number[];
  phasesDeg: number[];
  finalPhaseDeg: number;
  locked: boolean;
}> = ({ times, phasesDeg, finalPhaseDeg, locked }) => {
  const width = 460;
  const height = 135;
  const padL = 38;
  const padR = 12;
  const padT = 14;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxT = times[times.length - 1] || 3.0;

  const points = times
    .map((t, idx) => {
      const x = padL + (t / maxT) * plotW;
      const clampedDeg = Math.max(-90, Math.min(90, phasesDeg[idx] ?? 0));
      const y = padT + ((90 - clampedDeg) / 180) * plotH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-heading font-bold text-[#111827]">
          Costas VCO Phase Error Convergence φ_err(t)
        </span>
        <span className="font-mono text-[10px] text-slate-500 tabular-nums">
          Steady-state |φ_err| = {finalPhaseDeg.toFixed(1)}° ({locked ? 'Locked' : 'Slewing'})
        </span>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[135px] block">
          {/* Grid lines at +45, 0, -45 */}
          {[45, 0, -45].map((deg) => {
            const y = padT + ((90 - deg) / 180) * plotH;
            return (
              <g key={deg}>
                <line
                  x1={padL}
                  y1={y}
                  x2={padL + plotW}
                  y2={y}
                  stroke={deg === 0 ? 'rgba(30,70,32,0.35)' : 'rgba(15,23,42,0.08)'}
                  strokeDasharray={deg === 0 ? '4 3' : '2 3'}
                />
                <text
                  x={padL - 5}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                  fill="#64748B"
                >
                  {deg}°
                </text>
              </g>
            );
          })}
          {points && (
            <polyline
              fill="none"
              stroke={locked ? '#1E4620' : '#D97706'}
              strokeWidth="2"
              points={points}
            />
          )}
          <text
            x={padL + plotW}
            y={height - 5}
            textAnchor="end"
            fontSize="9"
            fontFamily="JetBrains Mono, monospace"
            fill="#64748B"
          >
            Time (0 – {maxT.toFixed(1)}s)
          </text>
        </svg>
      </div>
    </div>
  );
};
