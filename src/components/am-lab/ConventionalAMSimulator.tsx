import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AMSimConfig,
  BuiltinAudioSource,
  DEFAULT_AM_CONFIG,
  LAB_SAMPLE_RATE,
  SignalTrackId,
} from '../../dsp/types';
import { decodeAndNormalizeAudioFile, generateBuiltinAudio } from '../../dsp/filters';
import { runSimulation } from '../../dsp/runSimulation';
import { PlaybackState, WebAudioEngine } from '../../audio/WebAudioEngine';
import { AMTransmitter } from './AMTransmitter';
import { EnvelopeTab } from './EnvelopeTab';

interface ConventionalAMSimulatorProps {
  resetSignal?: number;
}

export const ConventionalAMSimulator: React.FC<ConventionalAMSimulatorProps> = ({
  resetSignal = 0,
}) => {
  const [config, setConfig] = useState<AMSimConfig>({ ...DEFAULT_AM_CONFIG });
  const [customAudioSamples, setCustomAudioSamples] = useState<Float32Array | null>(null);
  const [customFileName, setCustomFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const audioEngineRef = useRef<WebAudioEngine | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>({
    isPlaying: false,
    activeTrack: null,
    currentTimeSec: 0,
    durationSec: 0,
  });

  useEffect(() => {
    const engine = new WebAudioEngine();
    audioEngineRef.current = engine;
    const unsub = engine.subscribe(setPlayback);
    return () => {
      unsub();
      engine.dispose();
      audioEngineRef.current = null;
    };
  }, []);

  const rawMessage = useMemo(() => {
    if (config.sourceKind === 'custom' && customAudioSamples) {
      return customAudioSamples;
    }
    const builtinKind: BuiltinAudioSource =
      config.sourceKind === 'custom' ? 'vocal' : config.sourceKind;
    return generateBuiltinAudio(builtinKind, config.singleToneFreqHz, LAB_SAMPLE_RATE);
  }, [config.sourceKind, config.singleToneFreqHz, customAudioSamples]);

  const sim = useMemo(() => {
    return runSimulation(rawMessage, config, LAB_SAMPLE_RATE);
  }, [rawMessage, config]);

  useEffect(() => {
    audioEngineRef.current?.setTracks({
      original: sim.originalMessage,
      carrier: sim.carrier,
      modulated: sim.amModulated,
      received: sim.receivedAM,
      rectified: sim.envelope.rectified,
      envelope: sim.envelope.envelopeNoDc,
      envelopeRecovered: sim.envelope.envelopeRecovered,
    });
  }, [sim]);

  const handleUpdateConfig = (patch: Partial<AMSimConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  const handleSelectBuiltinSource = (kind: BuiltinAudioSource) => {
    setUploadError(null);
    setConfig((prev) => ({ ...prev, sourceKind: kind }));
  };

  const handleUploadAudio = async (file: File) => {
    setUploadError(null);
    try {
      const decoded = await decodeAndNormalizeAudioFile(file);
      setCustomAudioSamples(decoded.samples);
      setCustomFileName(
        decoded.truncated ? `${file.name} (trimmed 15s)` : file.name
      );
      setConfig((prev) => ({ ...prev, sourceKind: 'custom' }));
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? `Could not decode audio: ${err.message}`
          : 'Failed to decode uploaded audio file.'
      );
    }
  };

  const handleReset = () => {
    audioEngineRef.current?.stop();
    setCustomAudioSamples(null);
    setCustomFileName(null);
    setUploadError(null);
    setConfig({ ...DEFAULT_AM_CONFIG });
  };

  useEffect(() => {
    if (resetSignal > 0) {
      handleReset();
    }
  }, [resetSignal]);

  const handleResetDetector = () => {
    setConfig((prev) => ({
      ...prev,
      rcTimeMs: DEFAULT_AM_CONFIG.rcTimeMs,
      attackTimeMs: DEFAULT_AM_CONFIG.attackTimeMs,
      releaseTimeMs: DEFAULT_AM_CONFIG.releaseTimeMs,
      rectifierEnabled: DEFAULT_AM_CONFIG.rectifierEnabled,
      dcRemovalEnabled: DEFAULT_AM_CONFIG.dcRemovalEnabled,
      envelopeLpfEnabled: DEFAULT_AM_CONFIG.envelopeLpfEnabled,
      receiverLpfCutoffHz: DEFAULT_AM_CONFIG.receiverLpfCutoffHz,
    }));
  };

  const handleTogglePlay = (trackId: SignalTrackId) => {
    audioEngineRef.current?.playOrToggle(trackId);
  };

  const handleSeek = (timeSec: number) => {
    audioEngineRef.current?.seek(timeSec);
  };

  return (
    <div className="space-y-5 font-body text-[#111827]">
      {/* Transmitter & Channel */}
      <AMTransmitter
        config={config}
        onUpdateConfig={handleUpdateConfig}
        onSelectBuiltinSource={handleSelectBuiltinSource}
        onUploadAudio={handleUploadAudio}
        onReset={handleReset}
        sim={sim}
        playback={playback}
        onTogglePlay={handleTogglePlay}
        onSeek={handleSeek}
        customFileName={customFileName}
        uploadError={uploadError}
      />

      {/* Envelope Detector Receiver (Diode + RC) */}
      <EnvelopeTab
        config={config}
        onUpdateConfig={handleUpdateConfig}
        onResetDetector={handleResetDetector}
        sim={sim}
        playback={playback}
        onTogglePlay={handleTogglePlay}
        onSeek={handleSeek}
      />
    </div>
  );
};
