import React, { useRef, useState } from 'react';
import {
  Upload,
  Play,
  Pause,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Sliders,
} from 'lucide-react';
import {
  AMSimConfig,
  AMSimulationResult,
  BuiltinAudioSource,
  SignalTrackId,
} from '../../dsp/types';
import { OscilloscopeCanvas } from './OscilloscopeCanvas';
import { SpectrumCanvas, SpectrumMarker } from './SpectrumCanvas';
import { PlaybackState } from '../../audio/WebAudioEngine';

interface AMTransmitterProps {
  config: AMSimConfig;
  onUpdateConfig: (patch: Partial<AMSimConfig>) => void;
  onSelectBuiltinSource: (kind: BuiltinAudioSource) => void;
  onUploadAudio: (file: File) => Promise<void>;
  onReset: () => void;
  sim: AMSimulationResult;
  playback: PlaybackState;
  onTogglePlay: (trackId: SignalTrackId) => void;
  onSeek: (timeSec: number) => void;
  customFileName: string | null;
  uploadError: string | null;
}

export const AMTransmitter: React.FC<AMTransmitterProps> = ({
  config,
  onUpdateConfig,
  onSelectBuiltinSource,
  onUploadAudio,
  onReset,
  sim,
  playback,
  onTogglePlay,
  onSeek,
  customFileName,
  uploadError,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [channelOpen, setChannelOpen] = useState<boolean>(false);
  const [spectrumZoomFc, setSpectrumZoomFc] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'waveforms' | 'spectra'>('waveforms');

  const summary = sim.modulationSummary;
  const isOver = summary.classification === 'over';
  const isCrit = summary.classification === 'critical';

  const amMarkers: SpectrumMarker[] = [
    {
      freqHz: Math.max(0, config.carrierFreqHz - 1000),
      label: 'LSB',
      color: '#DB2777',
    },
    {
      freqHz: config.carrierFreqHz,
      label: `fc (${config.carrierFreqHz} Hz)`,
      color: '#D97706',
    },
    {
      freqHz: config.carrierFreqHz + 1000,
      label: 'USB',
      color: '#7C3AED',
    },
  ];

  const specMinFreq = spectrumZoomFc
    ? Math.max(0, config.carrierFreqHz - Math.max(2500, summary.maxMessageFreqHz * 1.4))
    : 0;
  const specMaxFreq = spectrumZoomFc
    ? Math.min(22050, config.carrierFreqHz + Math.max(2500, summary.maxMessageFreqHz * 1.4))
    : 22050;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await onUploadAudio(file);
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      {/* Main Transmitter Card (White Workspace Style) */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {/* Top Bar */}
        <div className="px-4 py-2.5 bg-[#FAFAF8] border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">
              CONVENTIONAL AM (DSB-FC) DEMO
            </span>
            <span className="font-mono text-xs px-2.5 py-0.5 rounded-md bg-white border border-slate-200 text-[#111827]">
              s(t) = Ac[1 + μ·m_n(t)]cos(2πfct)
            </span>
          </div>

          <div className="font-mono text-[11px] text-slate-600 tabular-nums">
            fc = {(config.carrierFreqHz / 1000).toFixed(1)} kHz · μ = {config.modulationIndex.toFixed(2)} · BW ={' '}
            {summary.bandwidthHz.toFixed(0)} Hz · η = {summary.efficiencyPct.toFixed(1)}%
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Audio Source & Playback Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[11px] text-slate-500 mr-1">Baseband m(t):</span>
              {(
                [
                  { id: 'vocal', label: 'Vocal Phrase' },
                ] as { id: BuiltinAudioSource; label: string }[]
              ).map((src) => {
                const active = config.sourceKind === src.id;
                return (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => onSelectBuiltinSource(src.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#EFF3EB] border-[#1E4620] text-[#1E4620]'
                        : 'bg-[#FAFAF8] border-slate-200 text-slate-600 hover:border-slate-300 hover:text-[#111827]'
                    }`}
                  >
                    {src.label}
                  </button>
                );
              })}
              {customFileName && config.sourceKind === 'custom' && (
                <span className="px-2.5 py-1 rounded-lg bg-[#EFF3EB] border border-[#DCE5D5] text-[#1E4620] text-xs font-mono">
                  {customFileName}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".wav,.mp3,.m4a,.ogg,.flac,audio/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAFAF8] hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[#1E4620]" />
                <span>Upload Audio</span>
              </button>

              <button
                type="button"
                onClick={() => onTogglePlay('original')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  playback.isPlaying && playback.activeTrack === 'original'
                    ? 'bg-[#1E4620] border-[#1E4620] text-white'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-[#111827]'
                }`}
              >
                {playback.isPlaying && playback.activeTrack === 'original' ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause Original</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current text-[#1E4620]" />
                    <span>Play Original</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAFAF8] hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {uploadError && (
            <div className="flex items-center gap-2 text-xs font-mono text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Core Modulation Controls */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-[#FAFAF8] border border-slate-200 rounded-xl p-3">
            {/* Modulation Index Slider + Under / 100% / Over Presets */}
            <div className="md:col-span-6 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-mono">
                  <span className="text-slate-600">Modulation Index μ: </span>
                  <span
                    className={`font-bold ${
                      isOver ? 'text-rose-600' : isCrit ? 'text-amber-600' : 'text-[#1E4620]'
                    }`}
                  >
                    {config.modulationIndex.toFixed(2)} ({summary.percentModulation.toFixed(0)}%)
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {[
                    { val: 0.5, label: 'Under (0.5)' },
                    { val: 1.0, label: '100% (1.0)' },
                    { val: 1.3, label: 'Over (1.3)' },
                  ].map((p) => {
                    const active = Math.abs(config.modulationIndex - p.val) < 0.02;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => onUpdateConfig({ modulationIndex: p.val })}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border cursor-pointer transition-colors ${
                          active
                            ? p.val > 1
                              ? 'bg-rose-50 border-rose-400 text-rose-700 font-bold'
                              : 'bg-[#EFF3EB] border-[#1E4620] text-[#1E4620] font-bold'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <input
                type="range"
                min={0}
                max={1.5}
                step={0.01}
                value={config.modulationIndex}
                onChange={(e) => onUpdateConfig({ modulationIndex: parseFloat(e.target.value) })}
                className="w-full accent-[#1E4620] cursor-pointer"
              />
            </div>

            {/* Carrier Frequency fc & Optional Single Tone fm */}
            <div className="md:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-600">Carrier fc</span>
                  <span className="font-semibold text-[#111827]">{config.carrierFreqHz} Hz</span>
                </div>
                <input
                  type="range"
                  min={1500}
                  max={10000}
                  step={100}
                  value={config.carrierFreqHz}
                  onChange={(e) => onUpdateConfig({ carrierFreqHz: parseInt(e.target.value, 10) })}
                  className="w-full accent-amber-600 cursor-pointer"
                />
              </div>

              <div className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 flex flex-col justify-center">
                <div className="text-[10px] font-mono text-slate-400">POWER &amp; BW EFFICIENCY</div>
                <div className="text-xs font-mono font-semibold text-[#111827] tabular-nums">
                  η = {summary.efficiencyPct.toFixed(1)}% (max 33.3%) · η_BW = 50%
                </div>
              </div>
            </div>
          </div>

          {/* Modulation Summary Readout Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums">
            <div className="bg-[#FAFAF8] border border-slate-200 rounded-lg px-3 py-2">
              <div className="text-[10px] text-slate-500">Amax / Amin</div>
              <div className="text-[#111827] font-bold">
                {summary.aMax.toFixed(2)} / {summary.aMin.toFixed(2)} V
              </div>
            </div>
            <div className="bg-[#FAFAF8] border border-slate-200 rounded-lg px-3 py-2">
              <div className="text-[10px] text-slate-500">Measured μ = (Amax−Amin)/(Amax+Amin)</div>
              <div className="text-[#1E4620] font-bold">{summary.measuredMu.toFixed(3)}</div>
            </div>
            <div className="bg-[#FAFAF8] border border-slate-200 rounded-lg px-3 py-2">
              <div className="text-[10px] text-slate-500">AM Bandwidth (BW = 2W)</div>
              <div className="text-sky-700 font-bold">{summary.bandwidthHz.toFixed(0)} Hz</div>
            </div>
            <div className="bg-[#FAFAF8] border border-slate-200 rounded-lg px-3 py-2">
              <div className="text-[10px] text-slate-500">Power Efficiency η = μ²/(2+μ²)</div>
              <div className="text-amber-700 font-bold">{summary.efficiencyPct.toFixed(1)}%</div>
            </div>
          </div>

          {/* Overmodulation Warning */}
          {isOver && (
            <div className="flex items-start gap-2.5 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Over-modulation (μ &gt; 1.0): </span>
                1 + μ·m_n(t) drops below zero, causing carrier phase reversals and envelope inversion. The diode-RC envelope detector cannot cleanly recover the message and suffers distortion.
              </div>
            </div>
          )}

          {/* Optional Compact Channel & Filter Accordion */}
          <div className="border border-slate-200 rounded-xl bg-[#FAFAF8] overflow-hidden">
            <button
              type="button"
              onClick={() => setChannelOpen((o) => !o)}
              className="w-full px-3.5 py-2 flex items-center justify-between text-xs font-semibold text-slate-700 hover:bg-slate-100/60 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-[#1E4620]" />
                <span>Optional Channel Noise &amp; Bandlimit Settings</span>
              </span>
              {channelOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {channelOpen && (
              <div className="p-3.5 bg-white border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-[#FAFAF8] border border-slate-200 rounded-lg p-2.5 space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-600">Channel Atten α</span>
                    <span className="font-semibold text-[#111827]">{config.channelAttenuation.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={config.channelAttenuation}
                    onChange={(e) => onUpdateConfig({ channelAttenuation: parseFloat(e.target.value) })}
                    className="w-full accent-[#1E4620] cursor-pointer"
                  />
                </div>

                <div className="bg-[#FAFAF8] border border-slate-200 rounded-lg p-2.5 space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-600">AWGN Noise σ</span>
                    <span className="font-semibold text-[#111827]">{config.noiseSigma.toFixed(3)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.2}
                    step={0.005}
                    value={config.noiseSigma}
                    disabled={!config.awgnEnabled}
                    onChange={(e) => onUpdateConfig({ noiseSigma: parseFloat(e.target.value) })}
                    className="w-full accent-amber-600 cursor-pointer disabled:opacity-40"
                  />
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.awgnEnabled}
                      onChange={(e) => onUpdateConfig({ awgnEnabled: e.target.checked })}
                      className="accent-amber-600"
                    />
                    <span>Enable AWGN noise</span>
                  </label>
                </div>

                <div className="bg-[#FAFAF8] border border-slate-200 rounded-lg p-2.5 space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-600">Message BW W</span>
                    <span className="font-semibold text-[#111827]">{config.messageLpfCutoffHz} Hz</span>
                  </div>
                  <input
                    type="range"
                    min={500}
                    max={4500}
                    step={100}
                    value={config.messageLpfCutoffHz}
                    onChange={(e) => onUpdateConfig({ messageLpfCutoffHz: parseInt(e.target.value, 10) })}
                    className="w-full accent-sky-600 cursor-pointer"
                  />
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.bandlimitMessage}
                      onChange={(e) => onUpdateConfig({ bandlimitMessage: e.target.checked })}
                      className="accent-sky-600"
                    />
                    <span>Bandlimit message</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* View Switch: Time Domain vs Frequency Domain */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setViewMode('waveforms')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              viewMode === 'waveforms'
                ? 'bg-white text-[#111827] shadow-xs'
                : 'text-slate-500 hover:text-[#111827]'
            }`}
          >
            Time Domain Waveforms
          </button>
          <button
            type="button"
            onClick={() => setViewMode('spectra')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              viewMode === 'spectra'
                ? 'bg-white text-[#111827] shadow-xs'
                : 'text-slate-500 hover:text-[#111827]'
            }`}
          >
            Frequency Domain Spectra |M(f)|, |C(f)|, |S(f)|
          </button>
        </div>

        {viewMode === 'spectra' && (
          <button
            type="button"
            onClick={() => setSpectrumZoomFc((z) => !z)}
            className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-xs font-mono text-slate-600 hover:border-slate-300 cursor-pointer"
          >
            {spectrumZoomFc ? `Zoomed around fc (${config.carrierFreqHz} Hz)` : 'Full Band (0–22 kHz)'}
          </button>
        )}
      </div>

      {viewMode === 'waveforms' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <OscilloscopeCanvas
            title="1. Message Signal m(t)"
            formula="m_n(t) · Baseband Signal"
            data={sim.originalMessage}
            color="#0284C7"
            isPlaying={playback.isPlaying && playback.activeTrack === 'original'}
            playbackTimeSec={playback.currentTimeSec}
            onTogglePlay={() => onTogglePlay('original')}
            onSeek={onSeek}
          />

          <OscilloscopeCanvas
            title="2. Carrier Signal c(t)"
            formula={`c(t) = ${config.carrierAmpV.toFixed(1)}·cos(2π·${config.carrierFreqHz}t)`}
            data={sim.carrier}
            color="#D97706"
            defaultZoom={300}
            isPlaying={playback.isPlaying && playback.activeTrack === 'carrier'}
            playbackTimeSec={playback.currentTimeSec}
            onTogglePlay={() => onTogglePlay('carrier')}
            onSeek={onSeek}
          />

          <OscilloscopeCanvas
            title="3. AM Modulated Signal s(t)"
            formula={`s(t) = Ac[1 + ${config.modulationIndex.toFixed(2)}·m_n(t)]cos(2πfct)`}
            data={sim.amModulated}
            color="#2563EB"
            overlays={[
              {
                label: 'Envelope |Ac(1+μm)|',
                color: '#15803D',
                data: sim.envelope.idealEnvelope,
                dashed: true,
              },
            ]}
            badgeText={isOver ? 'OVER-MODULATED' : isCrit ? '100% MOD' : 'UNDER-MOD'}
            isPlaying={playback.isPlaying && playback.activeTrack === 'modulated'}
            playbackTimeSec={playback.currentTimeSec}
            onTogglePlay={() => onTogglePlay('modulated')}
            onSeek={onSeek}
          />
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 shadow-sm">
          <SpectrumCanvas
            title="Message Spectrum |M(f)|"
            spectrum={sim.spectra.original}
            color="#0284C7"
            minFreqHz={0}
            maxFreqHz={6000}
          />
          <SpectrumCanvas
            title="Carrier Spectrum |C(f)|"
            spectrum={sim.spectra.carrier}
            color="#D97706"
            minFreqHz={specMinFreq}
            maxFreqHz={specMaxFreq}
            markers={[{ freqHz: config.carrierFreqHz, label: `fc`, color: '#D97706' }]}
          />
          <SpectrumCanvas
            title="AM Spectrum |S(f)| (Carrier + USB + LSB)"
            spectrum={sim.spectra.modulated}
            color="#2563EB"
            minFreqHz={specMinFreq}
            maxFreqHz={specMaxFreq}
            markers={amMarkers}
            bandwidthBand={{
              startHz: Math.max(0, config.carrierFreqHz - summary.maxMessageFreqHz),
              endHz: config.carrierFreqHz + summary.maxMessageFreqHz,
              label: `BW = 2W = ${summary.bandwidthHz} Hz`,
            }}
          />
        </div>
      )}
    </div>
  );
};
