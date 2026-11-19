import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PlaybackState, WebAudioEngine } from '../audio/WebAudioEngine';
import { DEFAULT_SHARED_CHANNEL, SharedChannelConfig } from '../dsp/channel';
import { toFloat64 } from '../dsp/common';
import { decodeAndNormalizeAudioFile, generateBuiltinAudio } from '../dsp/filters';
import { AudioSourceKind, BuiltinAudioSource, LAB_SAMPLE_RATE, SignalTrackId } from '../dsp/types';

interface AudioLabContextValue {
  // Audio source
  sourceKind: AudioSourceKind;
  customFileName: string | null;
  uploadError: string | null;
  rawMessage32: Float32Array;
  rawMessage64: Float64Array;
  durationSec: number;
  selectBuiltinSource: (kind: BuiltinAudioSource) => void;
  uploadAudioFile: (file: File) => Promise<void>;

  // Shared TX controls preserved across 02 DSB-SC, 03 SSB-SC, 04 VSB, 05 Comparison
  carrierFreqHz: number;
  setCarrierFreqHz: (hz: number) => void;
  carrierAmpV: number;
  setCarrierAmpV: (v: number) => void;
  bandlimitMessage: boolean;
  setBandlimitMessage: (b: boolean) => void;
  messageLpfCutoffHz: number;
  setMessageLpfCutoffHz: (hz: number) => void;

  // Shared Channel controls
  channel: SharedChannelConfig;
  updateChannel: (patch: Partial<SharedChannelConfig>) => void;
  resetAll: () => void;

  // Shared 44.1 kHz Web Audio Engine
  playback: PlaybackState;
  setAudioTracks: (tracks: Partial<Record<SignalTrackId, Float32Array>>) => void;
  togglePlay: (trackId: SignalTrackId) => void;
  seek: (timeSec: number) => void;
  stopPlayback: () => void;
}

const AudioLabContext = createContext<AudioLabContextValue | null>(null);

export const AudioLabProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sourceKind, setSourceKind] = useState<AudioSourceKind>('vocal');
  const [customAudioSamples, setCustomAudioSamples] = useState<Float32Array | null>(null);
  const [customFileName, setCustomFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [carrierFreqHz, setCarrierFreqHz] = useState<number>(6000);
  const [carrierAmpV, setCarrierAmpV] = useState<number>(1.0);
  const [bandlimitMessage, setBandlimitMessage] = useState<boolean>(true);
  const [messageLpfCutoffHz, setMessageLpfCutoffHz] = useState<number>(3400);
  const [channel, setChannel] = useState<SharedChannelConfig>({ ...DEFAULT_SHARED_CHANNEL });

  const engineRef = useRef<WebAudioEngine | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>({
    isPlaying: false,
    activeTrack: null,
    currentTimeSec: 0,
    durationSec: 0,
  });

  useEffect(() => {
    const engine = new WebAudioEngine();
    engineRef.current = engine;
    const unsub = engine.subscribe(setPlayback);
    return () => {
      unsub();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const rawMessage32 = useMemo(() => {
    if (sourceKind === 'custom' && customAudioSamples) {
      return customAudioSamples;
    }
    return generateBuiltinAudio('vocal', 500, LAB_SAMPLE_RATE);
  }, [sourceKind, customAudioSamples]);

  const rawMessage64 = useMemo(() => toFloat64(rawMessage32), [rawMessage32]);
  const durationSec = rawMessage32.length / LAB_SAMPLE_RATE;

  const selectBuiltinSource = useCallback((kind: BuiltinAudioSource) => {
    setUploadError(null);
    setSourceKind(kind);
  }, []);

  const uploadAudioFile = useCallback(async (file: File) => {
    setUploadError(null);
    try {
      const decoded = await decodeAndNormalizeAudioFile(file);
      setCustomAudioSamples(decoded.samples);
      setCustomFileName(decoded.truncated ? `${file.name} (trimmed 15s)` : file.name);
      setSourceKind('custom');
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? `Could not decode audio: ${err.message}`
          : 'Failed to decode uploaded audio file.'
      );
    }
  }, []);

  const updateChannel = useCallback((patch: Partial<SharedChannelConfig>) => {
    setChannel((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetAll = useCallback(() => {
    engineRef.current?.stop();
    setSourceKind('vocal');
    setCustomAudioSamples(null);
    setCustomFileName(null);
    setUploadError(null);
    setCarrierFreqHz(6000);
    setCarrierAmpV(1.0);
    setBandlimitMessage(true);
    setMessageLpfCutoffHz(3400);
    setChannel({ ...DEFAULT_SHARED_CHANNEL });
  }, []);

  const setAudioTracks = useCallback((tracks: Partial<Record<SignalTrackId, Float32Array>>) => {
    engineRef.current?.setTracks(tracks);
  }, []);

  const togglePlay = useCallback((trackId: SignalTrackId) => {
    engineRef.current?.playOrToggle(trackId);
  }, []);

  const seek = useCallback((timeSec: number) => {
    engineRef.current?.seek(timeSec);
  }, []);

  const stopPlayback = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  const value = useMemo<AudioLabContextValue>(
    () => ({
      sourceKind,
      customFileName,
      uploadError,
      rawMessage32,
      rawMessage64,
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
      setAudioTracks,
      togglePlay,
      seek,
      stopPlayback,
    }),
    [
      sourceKind,
      customFileName,
      uploadError,
      rawMessage32,
      rawMessage64,
      durationSec,
      selectBuiltinSource,
      uploadAudioFile,
      carrierFreqHz,
      carrierAmpV,
      bandlimitMessage,
      messageLpfCutoffHz,
      channel,
      updateChannel,
      resetAll,
      playback,
      setAudioTracks,
      togglePlay,
      seek,
      stopPlayback,
    ]
  );

  return <AudioLabContext.Provider value={value}>{children}</AudioLabContext.Provider>;
};

export function useAudioLab(): AudioLabContextValue {
  const ctx = useContext(AudioLabContext);
  if (!ctx) {
    throw new Error('useAudioLab must be used within an AudioLabProvider');
  }
  return ctx;
}
