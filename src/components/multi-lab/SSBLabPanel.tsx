import React, { useEffect, useMemo, useState } from 'react';
import { Waves, Activity, Info } from 'lucide-react';
import { useAudioLab } from '../../context/AudioLabContext';
import { DEFAULT_SSB_CONFIG, simulateSSBSystem, SSBGenerationMethod, SSBSideband } from '../../dsp/ssb';
import { OscilloscopeCanvas } from '../am-lab/OscilloscopeCanvas';
import { SpectrumCanvas } from '../am-lab/SpectrumCanvas';
import { SharedLabHeader } from './SharedLabHeader';

export const SSBLabPanel: React.FC = () => {
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

  const [sideband, setSideband] = useState<SSBSideband>('USB');
  const [method, setMethod] = useState<SSBGenerationMethod>('hilbert');
  const [filterOrder, setFilterOrder] = useState<number>(160);
  const [guardOffsetHz, setGuardOffsetHz] = useState<number>(80);

  const [localPhaseErrorDeg, setLocalPhaseErrorDeg] = useState<number>(0);
  const [localFreqOffsetHz, setLocalFreqOffsetHz] = useState<number>(0);
  const [receiverLpfCutoffHz, setReceiverLpfCutoffHz] = useState<number>(3500);
  const [showAllSixWaveforms, setShowAllSixWaveforms] = useState<boolean>(true);

  const sim = useMemo(() => {
    return simulateSSBSystem(rawMessage64, {
      ...DEFAULT_SSB_CONFIG,
      carrierFreqHz,
      carrierAmpV,
      sideband,
      method,
      bandlimitMessage,
      messageLpfCutoffHz,
      messageBWHz: messageLpfCutoffHz,
      filterOrder,
      guardOffsetHz,
      localPhaseErrorDeg,
      localFreqOffsetHz,
      receiverLpfCutoffHz,
      channel,
    });
  }, [
    rawMessage64,
    carrierFreqHz,
    carrierAmpV,
    sideband,
    method,
    bandlimitMessage,
    messageLpfCutoffHz,
    filterOrder,
    guardOffsetHz,
    localPhaseErrorDeg,
    localFreqOffsetHz,
    receiverLpfCutoffHz,
    channel,
  ]);

  useEffect(() => {
    setAudioTracks({
      original: sim.originalMessage,
      carrier: sim.carrier,
      dsbSc: sim.dsbScReference,
      ssbUsb: sim.usbSignal,
      ssbLsb: sim.lsbSignal,
      ssbSelected: sim.selectedSsb,
      received: sim.received,
      ssbRecovered: sim.ssbRecovered,
    });
  }, [sim, setAudioTracks]);

  const minFreqView = Math.max(0, carrierFreqHz - messageLpfCutoffHz * 1.6);
  const maxFreqView = Math.min(22050, carrierFreqHz + messageLpfCutoffHz * 1.6);

  return (
    <div className="space-y-5 font-body text-[#111827]">
      <SharedLabHeader
        title="SSB-SC Modulation Laboratory (FIR Bandpass Filter & Hilbert Phase-Shift)"
        badge="50% BANDWIDTH SAVINGS · BW = B"
        channelSnrDb={sim.channelSnrDb}
      />

      {/* Method & Sideband Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Waves className="w-4 h-4 text-[#15803D]" />
            <h3 className="font-heading text-sm font-bold text-[#111827]">
              Sideband Generation &amp; Spectrum Cancellation
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-[#FAFAF8] border border-slate-200 rounded-lg p-0.5 text-xs font-mono">
              {(['USB', 'LSB'] as SSBSideband[]).map((sb) => (
                <button
                  key={sb}
                  type="button"
                  onClick={() => setSideband(sb)}
                  className={`px-3 py-1 rounded-md cursor-pointer transition-colors ${
                    sideband === sb
                      ? 'bg-[#1E4620] text-white font-semibold'
                      : 'text-slate-600 hover:text-[#111827]'
                  }`}
                >
                  {sb} ({sb === 'USB' ? 'Upper' : 'Lower'})
                </button>
              ))}
            </div>

            <div className="flex items-center bg-[#FAFAF8] border border-slate-200 rounded-lg p-0.5 text-xs font-mono">
              {[
                { id: 'hilbert' as const, label: 'Method B: Hilbert Phase-Shift' },
                { id: 'filter' as const, label: 'Method A: FIR Bandpass Filter' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={`px-3 py-1 rounded-md cursor-pointer transition-colors ${
                    method === m.id
                      ? 'bg-[#0F766E] text-white font-semibold'
                      : 'text-slate-600 hover:text-[#111827]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Method A Filter Parameters & Savings Summary */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-[#FAFAF8] border border-slate-200 rounded-xl p-3.5">
          {method === 'filter' ? (
            <>
              <div className="md:col-span-4 space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-600">FIR Filter Order M</span>
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
              <div className="md:col-span-4 space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-600">Guard Edge Offset Δf</span>
                  <span className="font-mono font-semibold text-[#111827] tabular-nums">
                    {guardOffsetHz} Hz
                  </span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={300}
                  step={20}
                  value={guardOffsetHz}
                  onChange={(e) => setGuardOffsetHz(Number(e.target.value))}
                  className="studio-slider w-full cursor-pointer"
                />
              </div>
            </>
          ) : (
            <div className="md:col-span-8 text-xs font-mono text-slate-600">
              Hilbert Equation:{' '}
              <span className="font-semibold text-[#111827]">
                s_{sideband}(t) = (A_c/2)[m(t)cos(ω_c t) {sideband === 'USB' ? '−' : '+'} m̂(t)sin(ω_c t)]
              </span>{' '}
              (127-tap Blackman Hilbert transformer)
            </div>
          )}

          <div className="md:col-span-4 flex flex-wrap justify-end gap-2 text-[11px] font-mono">
            <span className="px-2.5 py-1 rounded-lg bg-[#EFF3EB] border border-[#DCE5D5] text-[#1E4620] font-semibold tabular-nums">
              Suppression: {sim.sidebandSuppressionDb.toFixed(1)} dB
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 tabular-nums">
              BW: {(sim.occupiedBandwidthHz / 1000).toFixed(2)} kHz vs DSB {(sim.dsbReferenceBandwidthHz / 1000).toFixed(2)} kHz
            </span>
          </div>
        </div>

        {/* FFT Spectra: DSB-SC Reference vs Selected SSB (+ FIR Filter Response Overlay) */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <SpectrumCanvas
            title="DSB-SC Reference Spectrum (Both USB + LSB = 2B)"
            spectrum={sim.spectra.dsbScReference}
            color="#64748B"
            height={175}
            minFreqHz={minFreqView}
            maxFreqHz={maxFreqView}
            markers={[{ freqHz: carrierFreqHz, label: 'f_c', color: '#0F172A' }]}
            bandwidthBand={{
              startHz: Math.max(0, carrierFreqHz - messageLpfCutoffHz),
              endHz: carrierFreqHz + messageLpfCutoffHz,
              label: `DSB BW = ${(sim.dsbReferenceBandwidthHz / 1000).toFixed(1)} kHz`,
            }}
          />

          <SpectrumCanvas
            title={`Selected SSB (${sideband}) FFT + ${method === 'filter' ? '|H(f)| BPF Overlay' : 'Hilbert Rejection'}`}
            spectrum={sim.spectra.selectedSsb}
            color={sideband === 'USB' ? '#7C3AED' : '#DB2777'}
            height={175}
            minFreqHz={minFreqView}
            maxFreqHz={maxFreqView}
            markers={[{ freqHz: carrierFreqHz, label: 'f_c', color: '#0F172A' }]}
            bandwidthBand={{
              startHz: sideband === 'USB' ? carrierFreqHz : Math.max(0, carrierFreqHz - messageLpfCutoffHz),
              endHz: sideband === 'USB' ? carrierFreqHz + messageLpfCutoffHz : carrierFreqHz,
              label: `SSB BW = ${(sim.occupiedBandwidthHz / 1000).toFixed(1)} kHz (-50%)`,
            }}
            filterOverlay={
              sim.filterCurve
                ? {
                    frequencies: sim.filterCurve.frequencies,
                    magnitudesDb: sim.filterCurve.magnitudesDb,
                    color: '#EA580C',
                    label: `FIR BPF |H(f)| (${filterOrder}-tap)`,
                  }
                : null
            }
          />
        </div>

        {/* All 6 Waveform Signals Grid */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs font-heading font-bold text-[#111827]">
            Signal Stages (Time Domain &amp; Audio Playback)
          </span>
          <button
            type="button"
            onClick={() => setShowAllSixWaveforms((v) => !v)}
            className="text-xs font-mono text-[#1E4620] hover:underline cursor-pointer"
          >
            {showAllSixWaveforms ? 'Show Selected Only' : 'Show All 6 Signals (Original, Carrier, DSB, USB, LSB, SSB)'}
          </button>
        </div>

        {showAllSixWaveforms ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <OscilloscopeCanvas
              title="1. Original Message m(t)"
              data={sim.originalMessage}
              color="#0284C7"
              height={135}
              isPlaying={playback.isPlaying && playback.activeTrack === 'original'}
              playbackTimeSec={playback.currentTimeSec}
              onTogglePlay={() => togglePlay('original')}
              onSeek={seek}
            />
            <OscilloscopeCanvas
              title="2. Carrier c(t)"
              data={sim.carrier}
              color="#CA8A04"
              height={135}
              defaultZoom={80}
              isPlaying={playback.isPlaying && playback.activeTrack === 'carrier'}
              playbackTimeSec={playback.currentTimeSec}
              onTogglePlay={() => togglePlay('carrier')}
              onSeek={seek}
            />
            <OscilloscopeCanvas
              title="3. DSB-SC Reference (USB + LSB)"
              data={sim.dsbScReference}
              color="#64748B"
              height={135}
              defaultZoom={20}
              isPlaying={playback.isPlaying && playback.activeTrack === 'dsbSc'}
              playbackTimeSec={playback.currentTimeSec}
              onTogglePlay={() => togglePlay('dsbSc')}
              onSeek={seek}
            />
            <OscilloscopeCanvas
              title="4. Upper Sideband (USB)"
              data={sim.usbSignal}
              color="#7C3AED"
              height={135}
              defaultZoom={20}
              highlighted={sideband === 'USB'}
              isPlaying={playback.isPlaying && playback.activeTrack === 'ssbUsb'}
              playbackTimeSec={playback.currentTimeSec}
              onTogglePlay={() => togglePlay('ssbUsb')}
              onSeek={seek}
            />
            <OscilloscopeCanvas
              title="5. Lower Sideband (LSB)"
              data={sim.lsbSignal}
              color="#DB2777"
              height={135}
              defaultZoom={20}
              highlighted={sideband === 'LSB'}
              isPlaying={playback.isPlaying && playback.activeTrack === 'ssbLsb'}
              playbackTimeSec={playback.currentTimeSec}
              onTogglePlay={() => togglePlay('ssbLsb')}
              onSeek={seek}
            />
            <OscilloscopeCanvas
              title={`6. Selected SSB Output (${sideband} · ${method === 'hilbert' ? 'Hilbert' : 'FIR BPF'})`}
              data={sim.selectedSsb}
              color="#2563EB"
              height={135}
              defaultZoom={20}
              highlighted
              isPlaying={playback.isPlaying && playback.activeTrack === 'ssbSelected'}
              playbackTimeSec={playback.currentTimeSec}
              onTogglePlay={() => togglePlay('ssbSelected')}
              onSeek={seek}
              badgeText={`Suppr ${sim.sidebandSuppressionDb.toFixed(1)} dB`}
            />
          </div>
        ) : (
          <OscilloscopeCanvas
            title={`Selected SSB Output (${sideband} · ${method === 'hilbert' ? 'Hilbert' : 'FIR BPF'})`}
            data={sim.selectedSsb}
            color="#2563EB"
            height={165}
            defaultZoom={20}
            highlighted
            isPlaying={playback.isPlaying && playback.activeTrack === 'ssbSelected'}
            playbackTimeSec={playback.currentTimeSec}
            onTogglePlay={() => togglePlay('ssbSelected')}
            onSeek={seek}
          />
        )}
      </div>

      {/* Coherent SSB Receiver */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#1E4620]" />
            <h3 className="font-heading text-sm font-bold text-[#111827]">
              Coherent SSB Receiver &amp; Phase Error Sensitivity
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-500">
            At φ ≠ 0°, output mixes m(t)cos(φ) ± m̂(t)sin(φ) (Hilbert phase distortion)
          </span>
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
            title="Demodulated SSB Audio y_SSB(t)"
            data={sim.ssbRecovered}
            color="#059669"
            overlays={[{ label: 'Original m(t)', color: '#0284C7', data: sim.originalMessage, dashed: true }]}
            height={165}
            isPlaying={playback.isPlaying && playback.activeTrack === 'ssbRecovered'}
            playbackTimeSec={playback.currentTimeSec}
            onTogglePlay={() => togglePlay('ssbRecovered')}
            onSeek={seek}
            badgeText={`SNR ${sim.metrics.snrDb.toFixed(1)} dB · r = ${sim.metrics.pearsonR.toFixed(3)}`}
          />

          <SpectrumCanvas
            title="Recovered Baseband Audio FFT"
            spectrum={sim.spectra.recovered}
            color="#059669"
            height={165}
            maxFreqHz={5000}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {[
            { label: 'Sideband Suppression', val: `${sim.sidebandSuppressionDb.toFixed(1)} dB` },
            { label: 'SSB BW (Saved 50%)', val: `${(sim.occupiedBandwidthHz / 1000).toFixed(2)} kHz` },
            { label: 'Recovered SNR', val: `${sim.metrics.snrDb.toFixed(1)} dB` },
            { label: 'Pearson r', val: sim.metrics.pearsonR.toFixed(4) },
            { label: 'MSE', val: sim.metrics.mse.toFixed(5) },
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
          <strong className="text-[#111827]">FIR Filter vs Hilbert Phase-Shift:</strong> Method A uses a brick-wall linear-phase FIR bandpass filter around{' '}
          <span className="font-mono">f_c</span> — effective when voice has a natural low-frequency gap, but struggles right at <span className="font-mono">f_c</span> unless the tap order is high. Method B cancels the unwanted sideband across all frequencies cleanly using the 90° Hilbert transformer <span className="font-mono">m̂(t)</span>.
        </p>
      </div>
    </div>
  );
};
