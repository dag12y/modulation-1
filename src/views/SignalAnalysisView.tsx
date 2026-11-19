import React, { useState, useMemo } from 'react';
import {
  generateWaveform,
  simulateAM,
  simulateFM,
  simulatePSK,
  computeFFT,
  WaveformType,
} from '../services/dsp';
import { ScientificScopeCanvas } from '../components/ScientificScopeCanvas';
import { SpectrumAnalyzerCanvas } from '../components/SpectrumAnalyzerCanvas';
import { useSimulation } from '../context/SimulationContext';
import { Activity, Sliders, BarChart3, Download } from 'lucide-react';

export const SignalAnalysisView: React.FC = () => {
  const { animTime } = useSimulation();
  const [selectedSignal, setSelectedSignal] = useState<'AM' | 'FM' | 'BPSK' | 'SquareHarmonics'>('AM');
  const [carrierFreq, setCarrierFreq] = useState<number>(10000); // 10 kHz
  const [messageFreq, setMessageFreq] = useState<number>(1000); // 1 kHz
  const [windowType, setWindowType] = useState<'hanning' | 'hamming' | 'rectangular'>('hanning');

  const fs = 100000;
  const duration = 0.005;

  const { t, samples, name } = useMemo(() => {
    if (selectedSignal === 'AM') {
      const sim = simulateAM({ Ac: 4, fc: carrierFreq, Am: 2.5, fm: messageFreq, mu: 0.8, fs, duration, timeOffset: animTime });
      return { t: sim.t, samples: sim.modulated, name: 'AM Signal' };
    } else if (selectedSignal === 'FM') {
      const sim = simulateFM({ Ac: 4, fc: carrierFreq, Am: 2.5, fm: messageFreq, deltaF: 3000, fs, duration, timeOffset: animTime });
      return { t: sim.t, samples: sim.modulated, name: 'FM Signal' };
    } else if (selectedSignal === 'BPSK') {
      const sim = simulatePSK({ type: 'BPSK', bits: [1, 0, 1, 1, 0, 0, 1, 0, 1, 1], symbolRate: 1000, fc: carrierFreq, Ac: 3, fs, timeOffset: animTime });
      return { t: sim.t, samples: sim.modulated, name: 'BPSK Signal' };
    } else {
      // Square Wave Harmonics demonstration (Fourier Series)
      const sim = generateWaveform('square', messageFreq, 3, 0, 0, fs, duration, animTime);
      return { t: sim.t, samples: sim.samples, name: 'Square Wave (Odd Harmonics)' };
    }
  }, [selectedSignal, carrierFreq, messageFreq, animTime]);

  // Compute FFT with selectable window
  const spectrum = useMemo(() => {
    return computeFFT(samples, fs, windowType);
  }, [samples, windowType]);

  // Calculate detailed electrical metrics
  const analysisMetrics = useMemo(() => {
    let sum = 0;
    let sumSq = 0;
    let peak = 0;
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < samples.length; i++) {
      const v = samples[i];
      sum += v;
      sumSq += v * v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
      if (v < min) min = v;
      if (v > max) max = v;
    }

    const mean = sum / (samples.length || 1);
    const rms = Math.sqrt(sumSq / (samples.length || 1));
    const crestFactor = rms > 0 ? peak / rms : 0;
    const vpp = max - min;

    return {
      peak,
      vpp,
      rms,
      mean,
      crestFactor,
      fftBins: spectrum.frequencies.length,
      peakFreq: spectrum.peakFreq,
      estBw: spectrum.bandwidthEstimate,
    };
  }, [samples, spectrum]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#7045B8]">
            <span>Precision Instruments</span>
            <span aria-hidden="true">·</span>
            <span>Spectral & Time Analytics</span>
          </div>
          <h2 className="text-xl font-bold text-[#24212C] mt-0.5">
            Signal Analysis & Measurement Workspace
          </h2>
        </div>

        {/* Signal Selectors */}
        <div className="flex flex-wrap items-center gap-1 bg-[#F8F7FB] p-1 rounded-lg border border-[#E8E3EF]">
          {(['AM', 'FM', 'BPSK', 'SquareHarmonics'] as ('AM' | 'FM' | 'BPSK' | 'SquareHarmonics')[]).map(
            (sig) => (
              <button
                key={sig}
                onClick={() => setSelectedSignal(sig)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  selectedSignal === sig
                    ? 'bg-white text-[#4B287F] shadow-xs border border-[#E8E3EF]'
                    : 'text-[#77717F] hover:text-[#24212C]'
                }`}
              >
                {sig === 'SquareHarmonics' ? 'Square Wave Harmonics' : sig}
              </button>
            )
          )}
        </div>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-[#E8E3EF] shadow-xs">
          <span className="text-[11px] text-[#77717F] block">Peak Voltage Vp</span>
          <span className="text-base font-mono font-bold text-[#24212C]">
            {analysisMetrics.peak.toFixed(2)} <span className="text-xs font-normal">V</span>
          </span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-[#E8E3EF] shadow-xs">
          <span className="text-[11px] text-[#77717F] block">Peak-to-Peak Vp-p</span>
          <span className="text-base font-mono font-bold text-[#24212C]">
            {analysisMetrics.vpp.toFixed(2)} <span className="text-xs font-normal">V</span>
          </span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-[#E8E3EF] shadow-xs">
          <span className="text-[11px] text-[#77717F] block">True RMS Value</span>
          <span className="text-base font-mono font-bold text-[#4B287F]">
            {analysisMetrics.rms.toFixed(3)} <span className="text-xs font-normal">V</span>
          </span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-[#E8E3EF] shadow-xs">
          <span className="text-[11px] text-[#77717F] block">Crest Factor</span>
          <span className="text-base font-mono font-bold text-[#24212C]">
            {analysisMetrics.crestFactor.toFixed(2)}
          </span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-[#E8E3EF] shadow-xs">
          <span className="text-[11px] text-[#77717F] block">Peak Frequency</span>
          <span className="text-base font-mono font-bold text-[#4B287F]">
            {(analysisMetrics.peakFreq / 1000).toFixed(2)} <span className="text-xs font-normal">kHz</span>
          </span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-[#E8E3EF] shadow-xs">
          <span className="text-[11px] text-[#77717F] block">Est Bandwidth</span>
          <span className="text-base font-mono font-bold text-[#24212C]">
            {(analysisMetrics.estBw / 1000).toFixed(2)} <span className="text-xs font-normal">kHz</span>
          </span>
        </div>
      </div>

      {/* Grid: Controls vs Visualizers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-5">
          <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-[#24212C] pb-2 border-b border-[#F1EBFA]">
              Analyzer Configuration
            </h3>

            <div>
              <label className="block text-xs font-medium text-[#24212C] mb-1.5">
                FFT Windowing Function
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['hanning', 'hamming', 'rectangular'] as const).map((w) => (
                  <button
                    key={w}
                    onClick={() => setWindowType(w)}
                    className={`py-1 text-xs capitalize rounded-md border transition-all ${
                      windowType === w
                        ? 'bg-[#7045B8] text-white border-[#7045B8] font-semibold'
                        : 'bg-[#F8F7FB] border-[#E8E3EF] text-[#77717F]'
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-[#77717F] block mt-1">
                Hanning and Hamming minimize spectral leakage around peaks.
              </span>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#77717F]">Carrier / Center Freq:</span>
                <span className="font-mono font-bold text-[#4B287F]">
                  {(carrierFreq / 1000).toFixed(1)} kHz
                </span>
              </div>
              <input
                type="range"
                min="5000"
                max="25000"
                step="500"
                value={carrierFreq}
                onChange={(e) => setCarrierFreq(parseInt(e.target.value))}
                className="w-full accent-[#7045B8]"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#77717F]">Fundamental / Message Freq:</span>
                <span className="font-mono font-bold text-[#4B287F]">{messageFreq} Hz</span>
              </div>
              <input
                type="range"
                min="200"
                max="2500"
                step="100"
                value={messageFreq}
                onChange={(e) => setMessageFreq(parseInt(e.target.value))}
                className="w-full accent-[#7045B8]"
              />
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-5">
          <ScientificScopeCanvas
            title={`Time-Domain Trace: ${name}`}
            t={t}
            traces={[
              {
                id: 'sig',
                name,
                color: '#7045B8',
                data: samples,
              },
            ]}
            height={270}
          />

          <SpectrumAnalyzerCanvas
            title={`High-Resolution FFT Spectrum (${windowType.toUpperCase()} Window)`}
            spectrum={spectrum}
            height={260}
          />
        </div>
      </div>
    </div>
  );
};
