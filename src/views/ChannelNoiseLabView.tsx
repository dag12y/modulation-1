import React, { useState, useMemo } from 'react';
import {
  simulateAM,
  simulateFM,
  simulatePSK,
  applyChannel,
  computeFFT,
} from '../services/dsp';
import { ScientificScopeCanvas } from '../components/ScientificScopeCanvas';
import { SpectrumAnalyzerCanvas } from '../components/SpectrumAnalyzerCanvas';
import { TheoryCalculationsPanel, CalculationStep } from '../components/TheoryCalculationsPanel';
import { useSimulation } from '../context/SimulationContext';
import { Radio, ShieldAlert, Sparkles, Activity } from 'lucide-react';

export type ChannelModelType = 'ideal' | 'awgn' | 'attenuation' | 'multipath' | 'freq-offset';

export const ChannelNoiseLabView: React.FC = () => {
  const { animTime, frame } = useSimulation();
  const [channelModel, setChannelModel] = useState<ChannelModelType>('awgn');
  const [sourceSignal, setSourceSignal] = useState<'AM' | 'FM' | 'BPSK'>('AM');

  // Channel impairment parameters
  const [snrDb, setSnrDb] = useState<number>(15); // 15 dB
  const [attenuationDb, setAttenuationDb] = useState<number>(6); // 6 dB loss
  const [delaySamples, setDelaySamples] = useState<number>(25); // Multipath delay
  const [multipathGain, setMultipathGain] = useState<number>(0.5);
  const [freqOffsetHz, setFreqOffsetHz] = useState<number>(250); // Doppler shift

  const fs = 100000;
  const duration = 0.004;

  // Generate source modulated signal
  const source = useMemo(() => {
    if (sourceSignal === 'AM') {
      const sim = simulateAM({ Ac: 4, fc: 10000, Am: 2.5, fm: 1000, mu: 0.7, fs, duration, timeOffset: animTime });
      return { t: sim.t, modulated: sim.modulated, name: 'AM Signal' };
    } else if (sourceSignal === 'FM') {
      const sim = simulateFM({ Ac: 4, fc: 10000, Am: 2.5, fm: 1000, deltaF: 3000, fs, duration, timeOffset: animTime });
      return { t: sim.t, modulated: sim.modulated, name: 'FM Signal' };
    } else {
      const sim = simulatePSK({ type: 'BPSK', bits: [1, 0, 1, 1, 0, 0, 1, 0], symbolRate: 1000, fc: 10000, Ac: 3, fs, timeOffset: animTime });
      return { t: sim.t, modulated: sim.modulated, name: 'BPSK Signal' };
    }
  }, [sourceSignal, animTime]);

  // Apply Channel with live frame flutter
  const channelOut = useMemo(() => {
    return applyChannel(source.modulated, source.t, {
      model: channelModel,
      snrDb,
      attenuationDb,
      delaySamples,
      multipathGain,
      freqOffsetHz,
    });
  }, [source, channelModel, snrDb, attenuationDb, delaySamples, multipathGain, freqOffsetHz, frame]);

  // Spectrum of clean vs channel output
  const txSpectrum = useMemo(() => computeFFT(source.modulated, fs), [source.modulated]);
  const rxSpectrum = useMemo(() => computeFFT(channelOut.output, fs), [channelOut.output]);

  // Theory calculations
  const theorySteps: CalculationStep[] = useMemo(() => {
    const linearGain = Math.pow(10, -attenuationDb / 20);

    return [
      {
        equation: 'r(t) = \\alpha s(t - \\tau) + n(t) \\quad \\text{where } n(t) \\sim \\mathcal{N}(0, \\sigma^2)',
        variableDefinitions: [
          { symbol: 'SNR', name: 'Signal-to-Noise Ratio', value: `${snrDb}`, unit: 'dB' },
          { symbol: 'α', name: 'Channel Path Loss Gain', value: `${linearGain.toFixed(3)}`, unit: 'linear' },
          { symbol: 'Attenuation', name: 'Path Loss in dB', value: `${attenuationDb}`, unit: 'dB' },
        ],
        substitution: `r(t) = ${linearGain.toFixed(2)} · s(t) + n(t) [SNR = ${snrDb} dB]`,
        result: `${snrDb} dB SNR`,
        unit: '',
        engineeringInterpretation:
          channelModel === 'multipath'
            ? 'Multipath propagation creates constructive and destructive interference (frequency-selective fading) due to phase delays between direct and reflected rays.'
            : 'AWGN is uniformly distributed across all frequency bins, degrading receiver signal-to-noise ratio and inducing bit detection errors.',
      },
    ];
  }, [channelModel, snrDb, attenuationDb]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#7045B8]">
            <span>Transmission Medium</span>
            <span aria-hidden="true">·</span>
            <span>Channel Impairments</span>
          </div>
          <h2 className="text-xl font-bold text-[#24212C] mt-0.5">
            Channel Impairments & Noise Laboratory
          </h2>
        </div>

        {/* Channel Model Tabs */}
        <div className="flex flex-wrap items-center gap-1 bg-[#F8F7FB] p-1 rounded-lg border border-[#E8E3EF]">
          {(
            [
              { id: 'ideal', label: 'Ideal Channel' },
              { id: 'awgn', label: 'AWGN Noise' },
              { id: 'attenuation', label: 'Path Loss' },
              { id: 'multipath', label: 'Multipath Reflection' },
              { id: 'freq-offset', label: 'Doppler Drift' },
            ] as { id: ChannelModelType; label: string }[]
          ).map((m) => (
            <button
              key={m.id}
              onClick={() => setChannelModel(m.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                channelModel === m.id
                  ? 'bg-white text-[#4B287F] shadow-xs border border-[#E8E3EF]'
                  : 'text-[#77717F] hover:text-[#24212C]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls Deck (Left 4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Source Modulator Selector */}
          <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-[#24212C]">Test Signal Source</h3>
            <div className="grid grid-cols-3 gap-2">
              {(['AM', 'FM', 'BPSK'] as ('AM' | 'FM' | 'BPSK')[]).map((src) => (
                <button
                  key={src}
                  onClick={() => setSourceSignal(src)}
                  className={`py-1.5 text-xs font-semibold rounded-md border transition-all ${
                    sourceSignal === src
                      ? 'bg-[#7045B8] text-white border-[#7045B8]'
                      : 'bg-[#F8F7FB] border-[#E8E3EF] text-[#77717F]'
                  }`}
                >
                  {src}
                </button>
              ))}
            </div>
          </div>

          {/* Impairment Sliders */}
          <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-[#24212C] pb-2 border-b border-[#F1EBFA]">
              Channel Degradation Controls
            </h3>

            {/* SNR Slider */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#77717F]">Signal-to-Noise Ratio (SNR):</span>
                <span className="font-mono font-bold text-[#4B287F]">{snrDb} dB</span>
              </div>
              <input
                type="range"
                min="0"
                max="35"
                step="1"
                value={snrDb}
                onChange={(e) => setSnrDb(parseInt(e.target.value))}
                className="w-full accent-[#7045B8]"
              />
              <div className="flex justify-between text-[10px] text-[#77717F] font-mono mt-0.5">
                <span className="text-red-600">0 dB (Severe)</span>
                <span>15 dB (Standard)</span>
                <span className="text-emerald-600">35 dB (Clean)</span>
              </div>
            </div>

            {/* Path Loss Attenuation */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#77717F]">Path Loss Attenuation:</span>
                <span className="font-mono font-bold text-[#24212C]">{attenuationDb} dB</span>
              </div>
              <input
                type="range"
                min="0"
                max="24"
                step="1"
                value={attenuationDb}
                onChange={(e) => setAttenuationDb(parseInt(e.target.value))}
                className="w-full accent-[#7045B8]"
              />
            </div>

            {/* Multipath Fading */}
            {channelModel === 'multipath' && (
              <div className="space-y-3 pt-2 border-t border-[#F1EBFA]">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#77717F]">Echo Reflection Delay:</span>
                    <span className="font-mono font-bold text-[#4B287F]">
                      {(delaySamples / (fs / 1000)).toFixed(2)} ms
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    step="5"
                    value={delaySamples}
                    onChange={(e) => setDelaySamples(parseInt(e.target.value))}
                    className="w-full accent-[#7045B8]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#77717F]">Echo Relative Gain:</span>
                    <span className="font-mono font-bold text-[#4B287F]">
                      {(multipathGain * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.9"
                    step="0.05"
                    value={multipathGain}
                    onChange={(e) => setMultipathGain(parseFloat(e.target.value))}
                    className="w-full accent-[#7045B8]"
                  />
                </div>
              </div>
            )}

            {/* Doppler Frequency Offset */}
            {channelModel === 'freq-offset' && (
              <div className="pt-2 border-t border-[#F1EBFA]">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#77717F]">Doppler Frequency Drift:</span>
                  <span className="font-mono font-bold text-[#4B287F]">{freqOffsetHz} Hz</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="1000"
                  step="25"
                  value={freqOffsetHz}
                  onChange={(e) => setFreqOffsetHz(parseInt(e.target.value))}
                  className="w-full accent-[#7045B8]"
                />
              </div>
            )}
          </div>
        </div>

        {/* Visualizers (Right 8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Time Domain Scope */}
          <ScientificScopeCanvas
            title="Time-Domain Channel Comparison: Transmitted vs Received"
            t={source.t}
            traces={[
              {
                id: 'tx',
                name: `Transmitted Clean Signal`,
                color: '#2563EB',
                data: source.modulated,
                lineDash: [2, 2],
              },
              {
                id: 'rx',
                name: `Channel Output r(t)`,
                color: '#7045B8',
                data: channelOut.output,
              },
              {
                id: 'noise',
                name: `Channel Noise Only`,
                color: '#EF4444',
                data: channelOut.noiseOnly,
                visible: false,
              },
            ]}
            height={280}
          />

          {/* Spectrum Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SpectrumAnalyzerCanvas
              title="Transmitted RF Spectrum Tx"
              spectrum={txSpectrum}
              height={200}
            />
            <SpectrumAnalyzerCanvas
              title="Received Distorted Spectrum Rx"
              spectrum={rxSpectrum}
              height={200}
            />
          </div>

          {/* Theory Panel */}
          <TheoryCalculationsPanel
            title="Channel Noise Models & AWGN Synthesis"
            conceptSummary={`Mathematical properties of Gaussian channel noise, path loss attenuation, and multipath constructive/destructive fading.`}
            steps={theorySteps}
          />
        </div>
      </div>
    </div>
  );
};
