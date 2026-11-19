import React, { useMemo, useState } from 'react';
import { ArrowRight, AlertTriangle, CheckCircle2, Play, Pause, RotateCcw } from 'lucide-react';
import { AMSimConfig, AMSimulationResult, SignalTrackId } from '../../dsp/types';
import { OscilloscopeCanvas } from './OscilloscopeCanvas';
import { SpectrumCanvas } from './SpectrumCanvas';
import { PlaybackState } from '../../audio/WebAudioEngine';

interface EnvelopeTabProps {
  config: AMSimConfig;
  onUpdateConfig: (patch: Partial<AMSimConfig>) => void;
  onResetDetector: () => void;
  sim: AMSimulationResult;
  playback: PlaybackState;
  onTogglePlay: (trackId: SignalTrackId) => void;
  onSeek: (timeSec: number) => void;
}

export const EnvelopeTab: React.FC<EnvelopeTabProps> = ({
  config,
  onUpdateConfig,
  onResetDetector,
  sim,
  playback,
  onTogglePlay,
  onSeek,
}) => {
  const [showSpectra, setShowSpectra] = useState<boolean>(false);

  const scaledIdealEnvelope = useMemo(() => {
    if (Math.abs(config.channelAttenuation - 1) < 1e-4) {
      return sim.envelope.idealEnvelope;
    }
    const src = sim.envelope.idealEnvelope;
    const out = new Float32Array(src.length);
    for (let i = 0; i < src.length; i++) {
      out[i] = src[i] * config.channelAttenuation;
    }
    return out;
  }, [sim.envelope.idealEnvelope, config.channelAttenuation]);

  const summary = sim.modulationSummary;
  const metrics = sim.envelopeMetrics;
  const isOver = summary.classification === 'over';

  const statusText = !config.rectifierEnabled
    ? 'Rectifier bypassed — carrier cycles average out.'
    : isOver
    ? 'Overmodulation (μ > 1): Envelope folds over — detector produces distorted output.'
    : metrics.pearsonR >= 0.92
    ? 'Linear modulation (μ ≤ 1): Clean envelope tracking of m(t).'
    : 'RC / LPF ripple or diagonal clipping — adjust τ = RC so 1/ωc ≪ RC ≪ 1/W.';

  return (
    <div className="space-y-4">
      {/* Envelope Detector Control Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-base font-bold text-[#111827]">
              Diode Rectifier + RC Envelope Detector
            </h3>
            <p className="font-body text-xs text-slate-500">
              Rectifies s(t) and smooths with an RC filter (1/ωc ≪ RC ≪ 1/W) to trace the message envelope.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onTogglePlay('envelopeRecovered')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                playback.isPlaying && playback.activeTrack === 'envelopeRecovered'
                  ? 'bg-[#1E4620] text-white'
                  : 'bg-[#EFF3EB] hover:bg-[#dce5d5] text-[#1E4620] border border-[#1E4620]/30'
              }`}
            >
              {playback.isPlaying && playback.activeTrack === 'envelopeRecovered' ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause Envelope Audio</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Play Envelope Audio</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onResetDetector}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAFAF8] hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset RC</span>
            </button>
          </div>
        </div>

        {/* Simple 3-Stage Process Flow */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono bg-[#FAFAF8] border border-slate-200 rounded-xl p-2.5">
          <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-sky-700 font-semibold">
            1. Received AM r(t)
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-amber-700 font-semibold">
            2. Rectifier |r(t)|
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="px-2.5 py-1 rounded-lg bg-[#EFF3EB] border border-[#DCE5D5] text-[#1E4620] font-semibold">
            3. RC Smoothing + DC Block → m̂(t)
          </span>
        </div>

        {/* Compact Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-[#FAFAF8] border border-slate-200 rounded-xl p-3 space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-600">RC Time Constant (τ = RC)</span>
              <span className="text-[#1E4620] font-bold">{config.rcTimeMs.toFixed(2)} ms</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={15}
              step={0.1}
              value={config.rcTimeMs}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                onUpdateConfig({ rcTimeMs: val, releaseTimeMs: val });
              }}
              className="w-full accent-[#1E4620] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>0.1ms (Ripple)</span>
              <span>15ms (Clip)</span>
            </div>
          </div>

          <div className="bg-[#FAFAF8] border border-slate-200 rounded-xl p-3 space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-600">Post-LPF Cutoff</span>
              <span className="text-sky-700 font-bold">{config.receiverLpfCutoffHz} Hz</span>
            </div>
            <input
              type="range"
              min={500}
              max={5000}
              step={100}
              value={config.receiverLpfCutoffHz}
              onChange={(e) => onUpdateConfig({ receiverLpfCutoffHz: parseInt(e.target.value, 10) })}
              className="w-full accent-sky-600 cursor-pointer"
            />
            <div className="flex items-center gap-4 pt-0.5 text-[11px] text-slate-600">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.rectifierEnabled}
                  onChange={(e) => onUpdateConfig({ rectifierEnabled: e.target.checked })}
                  className="accent-amber-600"
                />
                <span>Rectifier</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.envelopeLpfEnabled}
                  onChange={(e) => onUpdateConfig({ envelopeLpfEnabled: e.target.checked })}
                  className="accent-[#1E4620]"
                />
                <span>LPF + DC Block</span>
              </label>
            </div>
          </div>

          <div className="bg-[#FAFAF8] border border-slate-200 rounded-xl p-3 flex flex-col justify-between font-mono">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Correlation (r)</span>
              <span className="font-bold text-[#1E4620]">{(metrics.pearsonR * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Output SNR</span>
              <span className="font-bold text-[#111827]">{metrics.snrDb.toFixed(1)} dB</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Distortion</span>
              <span className={`font-bold ${metrics.recoveryDistortionPct > 25 ? 'text-rose-600' : 'text-slate-700'}`}>
                {metrics.recoveryDistortionPct.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Status Banner */}
        <div
          className={`rounded-xl px-3.5 py-2 border text-xs flex items-center gap-2 ${
            isOver || !config.rectifierEnabled
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-[#EFF3EB] border-[#DCE5D5] text-[#1E4620]'
          }`}
        >
          {isOver || !config.rectifierEnabled ? (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-[#1E4620] shrink-0" />
          )}
          <span>{statusText}</span>
        </div>
      </div>

      {/* Stage Plots Header */}
      <div className="flex items-center justify-between px-1">
        <h4 className="font-heading text-sm font-bold text-[#111827]">
          Envelope Detector Waveforms
        </h4>
        <button
          type="button"
          onClick={() => setShowSpectra((s) => !s)}
          className="px-3 py-1 rounded-lg bg-white border border-slate-200 hover:border-slate-300 text-xs font-mono text-slate-600 cursor-pointer"
        >
          {showSpectra ? 'Show Time-Domain' : 'Show FFT Spectra'}
        </button>
      </div>

      {!showSpectra ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <OscilloscopeCanvas
            title="1. Rectified Signal |r(t)|"
            formula={config.rectifierEnabled ? 'v_r(t) = |r(t)|' : 'Rectifier Bypassed'}
            data={sim.envelope.rectified}
            color="#D97706"
            defaultZoom={80}
            isPlaying={playback.isPlaying && playback.activeTrack === 'rectified'}
            playbackTimeSec={playback.currentTimeSec}
            onTogglePlay={() => onTogglePlay('rectified')}
            onSeek={onSeek}
          />

          <OscilloscopeCanvas
            title="2. Extracted RC Envelope"
            formula={`RC = ${config.rcTimeMs.toFixed(1)} ms`}
            data={sim.envelope.envelope}
            color="#059669"
            overlays={[
              {
                label: 'Ideal Envelope',
                color: '#D97706',
                data: scaledIdealEnvelope,
                dashed: true,
              },
            ]}
            isPlaying={playback.isPlaying && playback.activeTrack === 'envelope'}
            playbackTimeSec={playback.currentTimeSec}
            onTogglePlay={() => onTogglePlay('envelope')}
            onSeek={onSeek}
          />

          <OscilloscopeCanvas
            title="3. Recovered Message m̂(t)"
            formula="m̂_env(t) vs Original m(t)"
            data={sim.envelope.envelopeRecovered}
            color="#1E4620"
            overlays={[
              {
                label: 'Original m(t)',
                color: '#0284C7',
                data: sim.originalMessage,
                dashed: true,
              },
            ]}
            badgeText={isOver ? 'DISTORTED' : 'CLEAN'}
            isPlaying={playback.isPlaying && playback.activeTrack === 'envelopeRecovered'}
            playbackTimeSec={playback.currentTimeSec}
            onTogglePlay={() => onTogglePlay('envelopeRecovered')}
            onSeek={onSeek}
          />
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 shadow-sm">
          <SpectrumCanvas
            title="Rectified Spectrum |R(f)|"
            spectrum={sim.spectra.rectified}
            color="#D97706"
            minFreqHz={0}
            maxFreqHz={Math.min(22050, config.carrierFreqHz * 2.4)}
            markers={[{ freqHz: config.carrierFreqHz * 2, label: '2fc', color: '#D97706' }]}
          />
          <SpectrumCanvas
            title="RC Envelope Spectrum"
            spectrum={sim.spectra.envelope}
            color="#059669"
            minFreqHz={0}
            maxFreqHz={8000}
          />
          <SpectrumCanvas
            title="Recovered Baseband Spectrum"
            spectrum={sim.spectra.envelopeRecovered}
            color="#1E4620"
            minFreqHz={0}
            maxFreqHz={6000}
          />
        </div>
      )}
    </div>
  );
};
