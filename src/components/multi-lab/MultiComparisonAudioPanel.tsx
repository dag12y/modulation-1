import React, { useEffect, useMemo, useState } from 'react';
import { GitCompare, Play, Pause, Award } from 'lucide-react';
import { useAudioLab } from '../../context/AudioLabContext';
import { simulateAllFourModulations } from '../../dsp/multiComparison';
import { SSBGenerationMethod, SSBSideband } from '../../dsp/ssb';
import { VSBOrientation } from '../../dsp/vsb';
import { SignalTrackId } from '../../dsp/types';
import { OscilloscopeCanvas } from '../am-lab/OscilloscopeCanvas';
import { SpectrumCanvas } from '../am-lab/SpectrumCanvas';
import { SharedLabHeader } from './SharedLabHeader';

export const MultiComparisonAudioPanel: React.FC = () => {
  const {
    rawMessage64,
    carrierFreqHz,
    carrierAmpV,
    messageLpfCutoffHz,
    channel,
    playback,
    setAudioTracks,
    togglePlay,
    seek,
  } = useAudioLab();

  const [amModulationIndex, setAmModulationIndex] = useState<number>(0.75);
  const [ssbSideband, setSsbSideband] = useState<SSBSideband>('USB');
  const [ssbMethod, setSsbMethod] = useState<SSBGenerationMethod>('hilbert');
  const [vsbOrientation, setVsbOrientation] = useState<VSBOrientation>('usb-vestige');
  const [vsbVestigeBwHz, setVsbVestigeBwHz] = useState<number>(750);

  const sim = useMemo(() => {
    return simulateAllFourModulations(rawMessage64, {
      carrierFreqHz,
      carrierAmpV,
      messageBWHz: messageLpfCutoffHz,
      amModulationIndex,
      ssbSideband,
      ssbMethod,
      vsbOrientation,
      vsbVestigeBwHz: Math.min(messageLpfCutoffHz, vsbVestigeBwHz),
      channel,
    });
  }, [
    rawMessage64,
    carrierFreqHz,
    carrierAmpV,
    messageLpfCutoffHz,
    amModulationIndex,
    ssbSideband,
    ssbMethod,
    vsbOrientation,
    vsbVestigeBwHz,
    channel,
  ]);

  useEffect(() => {
    setAudioTracks({
      original: sim.originalMessage,
      dsbFc: sim.schemes[0].modulatedWaveform,
      dsbSc: sim.schemes[1].modulatedWaveform,
      ssbSelected: sim.schemes[2].modulatedWaveform,
      vsb: sim.schemes[3].modulatedWaveform,
      dsbFcRecovered: sim.schemes[0].recoveredWaveform,
      coherentRecovered: sim.schemes[1].recoveredWaveform,
      ssbRecovered: sim.schemes[2].recoveredWaveform,
      vsbRecovered: sim.schemes[3].recoveredWaveform,
    });
  }, [sim, setAudioTracks]);

  const minFreqView = Math.max(0, carrierFreqHz - messageLpfCutoffHz * 1.4 - 500);
  const maxFreqView = Math.min(22050, carrierFreqHz + messageLpfCutoffHz * 1.4 + 500);

  const trackForMod: Record<string, SignalTrackId> = {
    'dsb-fc': 'dsbFc',
    'dsb-sc': 'dsbSc',
    'ssb-sc': 'ssbSelected',
    vsb: 'vsb',
  };
  const trackForRec: Record<string, SignalTrackId> = {
    'dsb-fc': 'dsbFcRecovered',
    'dsb-sc': 'coherentRecovered',
    'ssb-sc': 'ssbRecovered',
    vsb: 'vsbRecovered',
  };

  return (
    <div className="space-y-5 font-body text-[#111827]">
      <SharedLabHeader
        title="Compare All Four Modulation Techniques (Simultaneous 44.1 kHz DSP)"
        badge="DSB-FC vs DSB-SC vs SSB-SC vs VSB"
        channelSnrDb={sim.dsbScResult.channelSnrDb}
      />

      {/* Scheme-Specific Parameters Strip */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-[#1E4620]" />
            <h3 className="font-heading text-sm font-bold text-[#111827]">
              Scheme-Specific Controls (Applied Simultaneously)
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            All 4 schemes modulate the identical audio waveform at f_c = {(carrierFreqHz / 1000).toFixed(2)} kHz, B = {messageLpfCutoffHz} Hz
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#FAFAF8] border border-slate-200 rounded-xl p-3">
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-600">DSB-FC Index μ</span>
              <span className="font-mono font-semibold text-[#2563EB] tabular-nums">
                {amModulationIndex.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0.15}
              max={1.3}
              step={0.05}
              value={amModulationIndex}
              onChange={(e) => setAmModulationIndex(Number(e.target.value))}
              className="studio-slider w-full cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="text-[11px] text-slate-600">SSB Sideband</div>
            <div className="flex bg-white border border-slate-200 rounded-md p-0.5 text-[11px] font-mono">
              {(['USB', 'LSB'] as SSBSideband[]).map((sb) => (
                <button
                  key={sb}
                  type="button"
                  onClick={() => setSsbSideband(sb)}
                  className={`flex-1 py-0.5 rounded cursor-pointer ${
                    ssbSideband === sb ? 'bg-[#15803D] text-white font-semibold' : 'text-slate-600'
                  }`}
                >
                  {sb}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[11px] text-slate-600">SSB Method</div>
            <div className="flex bg-white border border-slate-200 rounded-md p-0.5 text-[11px] font-mono">
              {(['hilbert', 'filter'] as SSBGenerationMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSsbMethod(m)}
                  className={`flex-1 py-0.5 rounded cursor-pointer ${
                    ssbMethod === m ? 'bg-[#15803D] text-white font-semibold' : 'text-slate-600'
                  }`}
                >
                  {m === 'hilbert' ? 'Hilbert' : 'FIR BPF'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-600">VSB Vestige B_v</span>
              <span className="font-mono font-semibold text-[#D97706] tabular-nums">
                {Math.min(messageLpfCutoffHz, vsbVestigeBwHz)} Hz ({vsbOrientation === 'usb-vestige' ? 'USB+v' : 'LSB+v'})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={200}
                max={2000}
                step={50}
                value={vsbVestigeBwHz}
                onChange={(e) => setVsbVestigeBwHz(Number(e.target.value))}
                className="studio-slider flex-1 cursor-pointer"
              />
              <button
                type="button"
                onClick={() => setVsbOrientation((o) => (o === 'usb-vestige' ? 'lsb-vestige' : 'usb-vestige'))}
                className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono text-slate-700 cursor-pointer"
              >
                {vsbOrientation === 'usb-vestige' ? 'USB' : 'LSB'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Modulated Waveforms Grid */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 space-y-3 shadow-xs">
        <h3 className="font-heading text-sm font-bold text-[#111827]">
          1. Four Modulated RF Waveforms Side-by-Side
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sim.schemes.map((sch) => {
            const modTrack = trackForMod[sch.id];
            return (
              <OscilloscopeCanvas
                key={sch.id}
                title={sch.name}
                description={sch.subtitle}
                data={sch.modulatedWaveform}
                color={sch.color}
                height={140}
                defaultZoom={20}
                isPlaying={playback.isPlaying && playback.activeTrack === modTrack}
                playbackTimeSec={playback.currentTimeSec}
                onTogglePlay={() => togglePlay(modTrack)}
                onSeek={seek}
                badgeText={`BW ${(sch.occupiedBandwidthHz / 1000).toFixed(2)} kHz`}
              />
            );
          })}
        </div>
      </div>

      {/* 4 FFT Spectra Grid */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading text-sm font-bold text-[#111827]">
            2. Four 8192-pt FFT Passband Spectra (Uniform Frequency Axis)
          </h3>
          <span className="text-[11px] font-mono text-slate-500">
            Notice DSB-FC carrier spike at f_c vs suppressed carrier in DSB-SC, SSB-SC, and VSB
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sim.schemes.map((sch) => (
            <div key={sch.id} className="bg-[#FAFAF8] border border-slate-200 rounded-xl p-3">
              <SpectrumCanvas
                title={`${sch.name} — ${sch.bwFormula}`}
                spectrum={sch.spectrum}
                color={sch.color}
                height={160}
                minFreqHz={minFreqView}
                maxFreqHz={maxFreqView}
                markers={[{ freqHz: carrierFreqHz, label: 'f_c', color: '#0F172A' }]}
                filterOverlay={
                  sch.filterOverlay
                    ? {
                        frequencies: sch.filterOverlay.frequencies,
                        magnitudesDb: sch.filterOverlay.magnitudesDb,
                        color: '#EA580C',
                        label: '|H(f)|',
                      }
                    : null
                }
              />
            </div>
          ))}
        </div>
      </div>

      {/* 4 Recovered Audio Comparison Grid */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading text-sm font-bold text-[#111827]">
            3. Demodulated &amp; Recovered Audio Comparison
          </h3>
          <button
            type="button"
            onClick={() => togglePlay('original')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-semibold border cursor-pointer ${
              playback.isPlaying && playback.activeTrack === 'original'
                ? 'bg-[#1E4620] border-[#1E4620] text-white'
                : 'bg-[#FAFAF8] border-slate-200 text-slate-700 hover:border-[#1E4620]'
            }`}
          >
            {playback.isPlaying && playback.activeTrack === 'original' ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>Listen: Original m(t) Reference</span>
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sim.schemes.map((sch) => {
            const recTrack = trackForRec[sch.id];
            return (
              <OscilloscopeCanvas
                key={sch.id}
                title={`${sch.name} Recovered`}
                description={`Demodulator: ${sch.demodType}`}
                data={sch.recoveredWaveform}
                color={sch.color}
                overlays={[{ label: 'Original m(t)', color: '#0284C7', data: sim.originalMessage, dashed: true }]}
                height={140}
                isPlaying={playback.isPlaying && playback.activeTrack === recTrack}
                playbackTimeSec={playback.currentTimeSec}
                onTogglePlay={() => togglePlay(recTrack)}
                onSeek={seek}
                badgeText={`SNR ${sch.recoveredSnrDb.toFixed(1)} dB · r=${sch.pearsonR.toFixed(3)}`}
              />
            );
          })}
        </div>
      </div>

      {/* Real Calculated Engineering Metrics Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 bg-[#FAFAF8] border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-[#1E4620]" />
            <h3 className="font-heading text-sm font-bold text-[#111827]">
              4. Real-Time Calculated Performance &amp; Efficiency Metrics
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            Measured directly from 44.1 kHz Float64Array buffers
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#EFF3EB] text-slate-700 text-[11px] font-mono border-b border-[#DCE5D5]">
                <th className="py-2.5 px-4">Scheme</th>
                <th className="py-2.5 px-3">Occupied BW</th>
                <th className="py-2.5 px-3">Carrier Power</th>
                <th className="py-2.5 px-3">Sideband Power</th>
                <th className="py-2.5 px-3">Total Power</th>
                <th className="py-2.5 px-3">Power Eff η</th>
                <th className="py-2.5 px-3">Spectral Eff</th>
                <th className="py-2.5 px-3">Recovered SNR</th>
                <th className="py-2.5 px-3">Pearson r</th>
                <th className="py-2.5 px-3">MSE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
              {sim.schemes.map((sch) => (
                <tr key={sch.id} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 font-body font-bold text-[#111827]">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sch.color }} />
                      <span>{sch.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-[#111827]">
                    {(sch.occupiedBandwidthHz / 1000).toFixed(2)} kHz ({sch.bwFormula})
                  </td>
                  <td className="py-2.5 px-3 text-slate-700">{sch.carrierPowerW.toFixed(4)} W</td>
                  <td className="py-2.5 px-3 text-slate-700">{sch.sidebandPowerW.toFixed(4)} W</td>
                  <td className="py-2.5 px-3 font-semibold text-[#111827]">{sch.totalPowerW.toFixed(4)} W</td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded font-semibold ${
                        sch.powerEfficiencyPct >= 99
                          ? 'bg-[#EFF3EB] text-[#1E4620]'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {sch.powerEfficiencyPct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-700">{sch.spectralEfficiencyLabel}</td>
                  <td className="py-2.5 px-3 font-semibold text-[#1E4620]">{sch.recoveredSnrDb.toFixed(1)} dB</td>
                  <td className="py-2.5 px-3 text-slate-800">{sch.pearsonR.toFixed(4)}</td>
                  <td className="py-2.5 px-3 text-slate-600">{sch.mse.toFixed(5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
