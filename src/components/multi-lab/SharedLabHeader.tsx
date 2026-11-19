import React, { useRef } from 'react';
import {
  Mic,
  Upload,
  Play,
  Pause,
  RotateCcw,
  Radio,
  Wifi,
  AlertCircle,
} from 'lucide-react';
import { LAB_SAMPLE_RATE } from '../../dsp/types';
import { useAudioLab } from '../../context/AudioLabContext';

interface SharedLabHeaderProps {
  title: string;
  badge: string;
  channelSnrDb?: number;
  showCarrierAmp?: boolean;
  extraRight?: React.ReactNode;
}

export const SharedLabHeader: React.FC<SharedLabHeaderProps> = ({
  title,
  badge,
  channelSnrDb,
  showCarrierAmp = true,
  extraRight,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const {
    sourceKind,
    customFileName,
    uploadError,
    durationSec,
    selectBuiltinSource,
    uploadAudioFile,
    carrierFreqHz,
    setCarrierFreqHz,
    carrierAmpV,
    setCarrierAmpV,
    bandlimitMessage,
    setBandlimitMessage,
    messageLpfCutoffHz,
    setMessageLpfCutoffHz,
    channel,
    updateChannel,
    resetAll,
    playback,
    togglePlay,
  } = useAudioLab();

  const isPlayingOriginal = playback.isPlaying && playback.activeTrack === 'original';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 space-y-4 shadow-xs">
      {/* Top Bar: Audio Source & Playback */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#EFF3EB] border border-[#DCE5D5] flex items-center justify-center">
            <Radio className="w-4 h-4 text-[#1E4620]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-sm font-bold text-[#111827]">{title}</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#EFF3EB] border border-[#DCE5D5] text-[#1E4620] font-semibold">
                {badge}
              </span>
            </div>
            <p className="font-mono text-[11px] text-slate-500 tabular-nums">
              Shared Input · {LAB_SAMPLE_RATE.toLocaleString()} Hz · {durationSec.toFixed(2)}s
              {customFileName && sourceKind === 'custom' ? ` · ${customFileName}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {extraRight}
          <button
            type="button"
            onClick={() => togglePlay('original')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors cursor-pointer ${
              isPlayingOriginal
                ? 'bg-[#1E4620] border-[#1E4620] text-white'
                : 'bg-[#FAFAF8] border-slate-200 text-slate-700 hover:border-[#1E4620]/50 hover:text-[#1E4620]'
            }`}
          >
            {isPlayingOriginal ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isPlayingOriginal ? 'Pause Original' : 'Play Original m(t)'}</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
              sourceKind === 'custom'
                ? 'bg-[#EFF3EB] border-[#1E4620] text-[#1E4620] font-semibold'
                : 'bg-white border-slate-200 text-slate-700 hover:border-[#1E4620]/40'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload WAV/MP3</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,.mp3,.m4a,.ogg,.flac,audio/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadAudioFile(f);
              e.target.value = '';
            }}
            className="hidden"
          />

          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:text-[#111827] cursor-pointer"
            title="Reset shared audio & channel parameters"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Built-in Audio Preset (Vocal Phrase) */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => selectBuiltinSource('vocal')}
          className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-left transition-colors cursor-pointer ${
            sourceKind === 'vocal'
              ? 'bg-[#EFF3EB] border-[#1E4620] text-[#1E4620]'
              : 'bg-[#FAFAF8] border-slate-200 text-slate-700 hover:border-slate-300'
          }`}
        >
          <Mic className={`w-4 h-4 shrink-0 ${sourceKind === 'vocal' ? 'text-[#1E4620]' : 'text-slate-400'}`} />
          <div>
            <div className="text-xs font-bold">Vocal Phrase</div>
            <div className="text-[10px] font-mono text-slate-500">3.2s speech</div>
          </div>
        </button>
      </div>

      {/* Shared TX & Channel Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1">
        {/* Shared Modulator & Message Conditioning */}
        <div className="lg:col-span-6 bg-[#FAFAF8] border border-slate-200 rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider font-semibold text-slate-500">
              SHARED RF CARRIER &amp; BASEBAND BANDWIDTH
            </span>
            <label className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={bandlimitMessage}
                onChange={(e) => setBandlimitMessage(e.target.checked)}
                className="accent-[#1E4620]"
              />
              <span>Bandlimit LPF</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-600">Carrier Freq f_c</span>
                <span className="font-mono font-semibold text-[#111827] tabular-nums">
                  {(carrierFreqHz / 1000).toFixed(2)} kHz
                </span>
              </div>
              <input
                type="range"
                min={3000}
                max={14000}
                step={250}
                value={carrierFreqHz}
                onChange={(e) => setCarrierFreqHz(Number(e.target.value))}
                className="studio-slider w-full cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-600">Message BW (B)</span>
                <span className="font-mono font-semibold text-[#1E4620] tabular-nums">
                  {messageLpfCutoffHz} Hz
                </span>
              </div>
              <input
                type="range"
                min={800}
                max={4500}
                step={100}
                value={messageLpfCutoffHz}
                onChange={(e) => setMessageLpfCutoffHz(Number(e.target.value))}
                className="studio-slider w-full cursor-pointer"
              />
            </div>

            {showCarrierAmp && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-600">Carrier Amp A_c</span>
                  <span className="font-mono font-semibold text-[#111827] tabular-nums">
                    {carrierAmpV.toFixed(2)} V
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  value={carrierAmpV}
                  onChange={(e) => setCarrierAmpV(Number(e.target.value))}
                  className="studio-slider w-full cursor-pointer"
                />
              </div>
            )}
          </div>
        </div>

        {/* Shared Transmission Channel */}
        <div className="lg:col-span-6 bg-[#FAFAF8] border border-slate-200 rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-[#1E4620]" />
              <span className="text-[10px] font-mono uppercase tracking-wider font-semibold text-slate-500">
                SHARED TRANSMISSION CHANNEL
              </span>
            </div>
            <div className="flex items-center gap-2">
              {typeof channelSnrDb === 'number' && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 tabular-nums">
                  Ch SNR: {channel.awgnEnabled ? `${channelSnrDb.toFixed(1)} dB` : 'Clean (∞)'}
                </span>
              )}
              <label className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={channel.awgnEnabled}
                  onChange={(e) => updateChannel({ awgnEnabled: e.target.checked })}
                  className="accent-[#1E4620]"
                />
                <span>AWGN</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-600">Atten α</span>
                <span className="font-mono font-semibold text-[#111827] tabular-nums">
                  {channel.attenuation.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={channel.attenuation}
                onChange={(e) => updateChannel({ attenuation: Number(e.target.value) })}
                className="studio-slider w-full cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-600">Noise σ</span>
                <span className="font-mono font-semibold text-[#111827] tabular-nums">
                  {channel.awgnEnabled ? channel.noiseSigma.toFixed(3) : 'Off'}
                </span>
              </div>
              <input
                type="range"
                min={0.005}
                max={0.2}
                step={0.005}
                disabled={!channel.awgnEnabled}
                value={channel.noiseSigma}
                onChange={(e) => updateChannel({ noiseSigma: Number(e.target.value) })}
                className="studio-slider w-full cursor-pointer disabled:opacity-40"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-600">Ch Phase θ</span>
                <span className="font-mono font-semibold text-[#111827] tabular-nums">
                  {channel.phaseShiftDeg}°
                </span>
              </div>
              <input
                type="range"
                min={-90}
                max={90}
                step={5}
                value={channel.phaseShiftDeg}
                onChange={(e) => updateChannel({ phaseShiftDeg: Number(e.target.value) })}
                className="studio-slider w-full cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-600">Ch Drift Δf</span>
                <span className="font-mono font-semibold text-[#111827] tabular-nums">
                  {channel.freqOffsetHz} Hz
                </span>
              </div>
              <input
                type="range"
                min={-150}
                max={150}
                step={5}
                value={channel.freqOffsetHz}
                onChange={(e) => updateChannel({ freqOffsetHz: Number(e.target.value) })}
                className="studio-slider w-full cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
