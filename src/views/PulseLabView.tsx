import React, { useState, useMemo } from 'react';
import {
  simulatePAM,
  simulatePWM,
  simulatePCM,
  simulateDeltaModulation,
  computeFFT,
} from '../services/dsp';
import { ScientificScopeCanvas } from '../components/ScientificScopeCanvas';
import { SpectrumAnalyzerCanvas } from '../components/SpectrumAnalyzerCanvas';
import { TheoryCalculationsPanel, CalculationStep } from '../components/TheoryCalculationsPanel';
import { useSimulation } from '../context/SimulationContext';
import { Sliders, AlertTriangle, CheckCircle, Info } from 'lucide-react';

export type PulseScheme = 'PAM' | 'PWM' | 'PCM' | 'Delta-Modulation';

export const PulseLabView: React.FC = () => {
  const { animTime } = useSimulation();
  const [scheme, setScheme] = useState<PulseScheme>('PCM');

  // Common analog parameters
  const [Am, setAm] = useState<number>(3.0);
  const [fm, setFm] = useState<number>(500); // 500 Hz audio tone

  // Sampling & Quantization parameters
  const [fsPulse, setFsPulse] = useState<number>(4000); // 4 kHz sampling
  const [numBits, setNumBits] = useState<number>(4); // 4-bit PCM (16 levels)
  const [companding, setCompanding] = useState<'uniform' | 'mu-law'>('uniform');

  // PAM specific
  const [pamMode, setPamMode] = useState<'natural' | 'flat-top'>('flat-top');
  const [pamDuty, setPamDuty] = useState<number>(0.3);

  // Delta Modulation specific
  const [dmStep, setDmStep] = useState<number>(0.3);

  const fs = 100000; // Continuous simulation rate
  const duration = 0.005; // 5 ms

  // Simulation execution
  const sim = useMemo(() => {
    switch (scheme) {
      case 'PAM': {
        const res = simulatePAM({
          Am,
          fm,
          fsPulse,
          dutyCycle: pamDuty,
          samplingMode: pamMode,
          fs,
          duration,
          timeOffset: animTime,
        });
        return {
          t: res.t,
          message: res.message,
          modulated: res.pamSignal,
          extraTrace: res.pulseTrain,
          extraName: 'Pulse Carrier Train',
          type: 'PAM' as const,
          nyquistRate: 2 * fm,
          isAliasing: fsPulse < 2 * fm,
        };
      }
      case 'PWM': {
        const res = simulatePWM({ Am, fm, fsCarrier: fsPulse, fs, duration, timeOffset: animTime });
        return {
          t: res.t,
          message: res.message,
          modulated: res.pwmSignal,
          extraTrace: res.ramp,
          extraName: 'Sawtooth Carrier Ramp',
          type: 'PWM' as const,
          nyquistRate: 2 * fm,
          isAliasing: false,
        };
      }
      case 'PCM': {
        const res = simulatePCM({
          Am,
          fm,
          fsPulse,
          numBits,
          companding,
          mu: 255,
          fs,
          duration,
          timeOffset: animTime,
        });
        return {
          t: res.t,
          message: res.message,
          modulated: res.quantizedSignal,
          errorSignal: res.errorSignal,
          samplePoints: res.samplePoints,
          L: res.L,
          stepSize: res.stepSize,
          theoreticalSQNR: res.theoreticalSQNR,
          measuredSQNR: res.measuredSQNR,
          type: 'PCM' as const,
          nyquistRate: res.nyquistRate,
          isAliasing: res.isAliasing,
        };
      }
      case 'Delta-Modulation': {
        const res = simulateDeltaModulation({
          Am,
          fm,
          deltaStep: dmStep,
          fsPulse,
          fs,
          duration,
          timeOffset: animTime,
        });
        return {
          t: res.t,
          message: res.message,
          modulated: res.dmStaircase,
          bitStream: res.bitStream,
          isSlopeOverload: res.isSlopeOverload,
          maxMessageSlope: res.maxMessageSlope,
          maxDMSlope: res.maxDMSlope,
          type: 'Delta-Modulation' as const,
          nyquistRate: 2 * fm,
          isAliasing: false,
        };
      }
    }
  }, [scheme, Am, fm, fsPulse, numBits, companding, pamMode, pamDuty, dmStep, animTime]);

  // Compute spectrum
  const spectrum = useMemo(() => computeFFT(sim.modulated, fs, 'hanning'), [sim.modulated]);

  // Theory calculations steps
  const theorySteps: CalculationStep[] = useMemo(() => {
    if (scheme === 'PCM') {
      const L = Math.pow(2, numBits);
      const delta = (2 * Am) / L;
      const sqnr = 6.02 * numBits + 1.76;

      return [
        {
          equation: 'f_s \\ge 2 f_{max} \\quad \\text{(Nyquist-Shannon Theorem)}',
          variableDefinitions: [
            { symbol: 'f_m', name: 'Maximum Message Frequency', value: `${fm}`, unit: 'Hz' },
            { symbol: 'f_s', name: 'Sampling Frequency', value: `${fsPulse}`, unit: 'Hz' },
            { symbol: '2·f_m', name: 'Nyquist Rate', value: `${2 * fm}`, unit: 'Hz' },
          ],
          substitution: `fs = ${fsPulse} Hz vs Nyquist = ${2 * fm} Hz`,
          result: fsPulse >= 2 * fm ? 'Nyquist Criterion Satisfied' : 'ALIASING OCCURRING (fs < 2fm)',
          unit: '',
          engineeringInterpretation:
            fsPulse >= 2 * fm
              ? 'Signal is sampled above the Nyquist rate. The original analog waveform can be perfectly reconstructed without spectral overlap.'
              : 'CRITICAL ALIASING: Higher frequency components fold back into the baseband spectrum causing irreversible distortion.',
        },
        {
          equation: 'L = 2^n, \\quad \\Delta = \\frac{V_{max} - V_{min}}{L} = \\frac{2 A_m}{2^n}',
          variableDefinitions: [
            { symbol: 'n', name: 'Quantization Bits per Sample', value: `${numBits}`, unit: 'bits' },
            { symbol: 'L', name: 'Total Quantization Levels', value: `${L}`, unit: 'levels' },
            { symbol: 'Δ', name: 'Quantization Step Size', value: `${delta.toFixed(3)}`, unit: 'V' },
          ],
          substitution: `L = 2^${numBits} = ${L} levels; Δ = (2 · ${Am}) / ${L} = ${delta.toFixed(3)} V`,
          result: `${delta.toFixed(3)}`,
          unit: 'V step',
          engineeringInterpretation: `Each additional bit halves the step size Δ, cutting the maximum quantization error e_max = Δ/2 in half.`,
        },
        {
          equation: '\\text{SQNR}_{\\text{dB}} \\approx 6.02 n + 1.76 \\text{ dB}',
          variableDefinitions: [
            { symbol: 'n', name: 'Resolution Bits', value: `${numBits}`, unit: 'bits' },
            { symbol: 'SQNR', name: 'Signal-to-Quantization-Noise Ratio', value: `${sqnr.toFixed(2)}`, unit: 'dB' },
          ],
          substitution: `SQNR = 6.02 · ${numBits} + 1.76 = ${sqnr.toFixed(2)} dB`,
          result: `${sqnr.toFixed(2)}`,
          unit: 'dB',
          engineeringInterpretation: `The fundamental "6 dB rule" of digital audio/telephony: each added bit of ADC resolution yields ~6 dB improvement in signal purity.`,
        },
      ];
    } else if (scheme === 'Delta-Modulation') {
      const maxSlope = 2 * Math.PI * fm * Am;
      const dmMaxSlope = dmStep * fsPulse;
      return [
        {
          equation: '\\frac{\\Delta}{T_s} \\ge \\left| \\frac{dm(t)}{dt} \\right|_{max} = 2\\pi f_m A_m',
          variableDefinitions: [
            { symbol: 'Δ/Ts', name: 'Maximum DM Tracking Slew Rate', value: `${dmMaxSlope.toFixed(0)}`, unit: 'V/s' },
            { symbol: 'dm/dt', name: 'Maximum Message Slope', value: `${maxSlope.toFixed(0)}`, unit: 'V/s' },
          ],
          substitution: `Slew Rate = ${dmStep} V · ${fsPulse} Hz = ${dmMaxSlope.toFixed(0)} V/s vs Message = ${maxSlope.toFixed(0)} V/s`,
          result: dmMaxSlope >= maxSlope ? 'Normal Tracking (No Overload)' : 'SLOPE OVERLOAD DISTORTION',
          unit: '',
          engineeringInterpretation:
            dmMaxSlope >= maxSlope
              ? 'The staircase approximation can keep pace with the fastest changes in the analog input without lagging.'
              : 'WARNING: Slope Overload Distortion occurs when the input signal changes faster than the quantizer step can rise or fall. Increase sampling rate fs or step size Δ to resolve.',
        },
      ];
    } else {
      return [
        {
          equation: 's(t) = \\sum_{n} m(n T_s) \\cdot p(t - n T_s)',
          variableDefinitions: [
            { symbol: 'T_s', name: 'Pulse Sampling Period', value: `${(1 / fsPulse * 1000).toFixed(2)}`, unit: 'ms' },
            { symbol: 'f_s', name: 'Sampling Frequency', value: `${fsPulse}`, unit: 'Hz' },
          ],
          substitution: `Ts = 1 / ${fsPulse} Hz = ${(1 / fsPulse * 1000).toFixed(2)} ms`,
          result: 'Baseband Pulse Transmission',
          unit: '',
          engineeringInterpretation:
            pamMode === 'natural'
              ? 'Natural PAM preserves the exact curvature of m(t) during the pulse duration.'
              : 'Flat-top PAM uses a sample-and-hold circuit, resulting in aperture effect distortion that requires an equalizer filter at the receiver.',
        },
      ];
    }
  }, [scheme, numBits, Am, fm, fsPulse, dmStep, pamMode]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Scheme Selector */}
      <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#7045B8]">
            <span>Laboratory Bench</span>
            <span aria-hidden="true">·</span>
            <span>Sampling & Digital Coding</span>
          </div>
          <h2 className="text-xl font-bold text-[#24212C] mt-0.5">
            Pulse Modulation & PCM Laboratory
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1 bg-[#F8F7FB] p-1 rounded-lg border border-[#E8E3EF]">
          {(['PAM', 'PWM', 'PCM', 'Delta-Modulation'] as PulseScheme[]).map((s) => (
            <button
              key={s}
              onClick={() => setScheme(s)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                scheme === s
                  ? 'bg-white text-[#4B287F] shadow-xs border border-[#E8E3EF]'
                  : 'text-[#77717F] hover:text-[#24212C]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls Deck (Left 4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Nyquist / Aliasing status banner */}
          <div
            className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
              !sim.isAliasing
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : 'text-red-700 bg-red-50 border-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {!sim.isAliasing ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              )}
              <span>
                {!sim.isAliasing
                  ? `Nyquist OK (fs ≥ 2fm = ${2 * fm} Hz)`
                  : `Aliasing Alert! (fs < 2fm = ${2 * fm} Hz)`}
              </span>
            </div>
          </div>

          {/* Scheme Controls */}
          <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-[#24212C] pb-2 border-b border-[#F1EBFA]">
              {scheme} Settings
            </h3>

            {/* Sampling Frequency Slider (Live Aliasing Test) */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#77717F]">Sampling Freq (fs):</span>
                <span className="font-mono font-bold text-[#4B287F]">
                  {(fsPulse / 1000).toFixed(2)} kHz
                </span>
              </div>
              <input
                type="range"
                min="400"
                max="8000"
                step="100"
                value={fsPulse}
                onChange={(e) => setFsPulse(parseInt(e.target.value))}
                className="w-full accent-[#7045B8]"
              />
              <div className="flex justify-between text-[10px] text-[#77717F] font-mono mt-1 mb-2.5">
                <span className="text-red-600 font-semibold">400 Hz (Aliased)</span>
                <span className="text-blue-600 font-semibold">1 kHz (Nyquist)</span>
                <span>8 kHz (Oversampled)</span>
              </div>
            </div>

            {/* PCM Specific Controls */}
            {scheme === 'PCM' && (
              <div className="space-y-4 pt-3.5 border-t border-[#F1EBFA]">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#77717F]">Quantizer Resolution:</span>
                    <span className="font-mono font-bold text-[#4B287F]">
                      {numBits} Bits (L = {Math.pow(2, numBits)} levels)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="8"
                    step="1"
                    value={numBits}
                    onChange={(e) => setNumBits(parseInt(e.target.value))}
                    className="w-full accent-[#7045B8]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#24212C] mb-1.5">
                    Companding Characteristic
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setCompanding('uniform')}
                      className={`py-1.5 text-xs font-semibold rounded-md border transition-all ${
                        companding === 'uniform'
                          ? 'bg-[#7045B8] text-white border-[#7045B8]'
                          : 'bg-[#F8F7FB] border-[#E8E3EF] text-[#77717F]'
                      }`}
                    >
                      Uniform Quantization
                    </button>
                    <button
                      onClick={() => setCompanding('mu-law')}
                      className={`py-1.5 text-xs font-semibold rounded-md border transition-all ${
                        companding === 'mu-law'
                          ? 'bg-[#7045B8] text-white border-[#7045B8]'
                          : 'bg-[#F8F7FB] border-[#E8E3EF] text-[#77717F]'
                      }`}
                    >
                      μ-Law (μ = 255)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PAM Controls */}
            {scheme === 'PAM' && (
              <div className="space-y-3 pt-2 border-t border-[#F1EBFA]">
                <label className="block text-xs font-medium text-[#24212C]">Sampling Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPamMode('natural')}
                    className={`py-1.5 text-xs font-semibold rounded-md border transition-all ${
                      pamMode === 'natural'
                        ? 'bg-[#7045B8] text-white border-[#7045B8]'
                        : 'bg-[#F8F7FB] border-[#E8E3EF] text-[#77717F]'
                    }`}
                  >
                    Natural Sampling
                  </button>
                  <button
                    onClick={() => setPamMode('flat-top')}
                    className={`py-1.5 text-xs font-semibold rounded-md border transition-all ${
                      pamMode === 'flat-top'
                        ? 'bg-[#7045B8] text-white border-[#7045B8]'
                        : 'bg-[#F8F7FB] border-[#E8E3EF] text-[#77717F]'
                    }`}
                  >
                    Flat-Top Sampling
                  </button>
                </div>
              </div>
            )}

            {/* Delta Modulation Controls */}
            {scheme === 'Delta-Modulation' && (
              <div className="space-y-3 pt-2 border-t border-[#F1EBFA]">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#77717F]">Step Size (Δ):</span>
                    <span className="font-mono font-bold text-[#4B287F]">{dmStep.toFixed(2)} V</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="1.0"
                    step="0.05"
                    value={dmStep}
                    onChange={(e) => setDmStep(parseFloat(e.target.value))}
                    className="w-full accent-[#7045B8]"
                  />
                </div>
              </div>
            )}

            {/* Input Signal Parameters */}
            <div className="pt-3 border-t border-[#F1EBFA] space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#77717F]">Message Frequency (fm):</span>
                  <span className="font-mono font-bold text-[#24212C]">{fm} Hz</span>
                </div>
                <input
                  type="range"
                  min="200"
                  max="1500"
                  step="50"
                  value={fm}
                  onChange={(e) => setFm(parseInt(e.target.value))}
                  className="w-full accent-[#7045B8]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#77717F]">Message Amplitude (Am):</span>
                  <span className="font-mono font-bold text-[#24212C]">{Am.toFixed(1)} V</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="0.5"
                  value={Am}
                  onChange={(e) => setAm(parseFloat(e.target.value))}
                  className="w-full accent-[#7045B8]"
                />
              </div>
            </div>
          </div>

          {/* Quantization Metrics Card (for PCM) */}
          {sim.type === 'PCM' && (
            <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs space-y-3">
              <h4 className="text-xs font-bold text-[#24212C]">PCM Signal Quality Metrics</h4>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="bg-[#FAF9FD] p-2 rounded border border-[#E8E3EF]">
                  <span className="text-[#77717F] block">Theoretical SQNR</span>
                  <span className="font-bold text-sm text-[#4B287F]">
                    {sim.theoreticalSQNR.toFixed(1)} dB
                  </span>
                </div>
                <div className="bg-[#FAF9FD] p-2 rounded border border-[#E8E3EF]">
                  <span className="text-[#77717F] block">Measured SQNR</span>
                  <span className="font-bold text-sm text-[#24212C]">
                    {sim.measuredSQNR.toFixed(1)} dB
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Oscilloscope & Spectral Visualizers (Right 8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Time Domain Oscilloscope */}
          <ScientificScopeCanvas
            title={`Time-Domain Pulse Waveforms: ${scheme}`}
            t={sim.t}
            traces={[
              {
                id: 'message',
                name: `m(t) Continuous Input`,
                color: '#2563EB',
                data: sim.message,
              },
              {
                id: 'modulated',
                name:
                  scheme === 'PCM'
                    ? `Quantized Staircase q(t)`
                    : scheme === 'Delta-Modulation'
                    ? `DM Estimate`
                    : `Modulated Pulse Signal`,
                color: '#7045B8',
                data: sim.modulated,
              },
              ...(sim.type === 'PCM'
                ? [
                    {
                      id: 'error',
                      name: `Quantization Error e(t)`,
                      color: '#EF4444',
                      data: sim.errorSignal,
                      lineDash: [2, 2],
                    },
                  ]
                : []),
            ]}
            height={280}
          />

          {/* Sample Encoding Word Table for PCM */}
          {sim.type === 'PCM' && (
            <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs overflow-x-auto">
              <h4 className="text-xs font-bold text-[#24212C] mb-2">
                PCM Discrete Sample Encoding Table (First 12 Samples)
              </h4>
              <table className="w-full text-xs font-mono text-left">
                <thead>
                  <tr className="border-b border-[#E8E3EF] text-[#77717F]">
                    <th className="py-1 px-2">Sample #</th>
                    <th className="py-1 px-2">Time (ms)</th>
                    <th className="py-1 px-2">Analog Value</th>
                    <th className="py-1 px-2">Quantized Level</th>
                    <th className="py-1 px-2">Binary PCM Word</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1EBFA] text-[11px]">
                  {sim.samplePoints.slice(0, 12).map((pt, idx) => (
                    <tr key={idx} className="hover:bg-[#F8F7FB]">
                      <td className="py-1 px-2 font-bold text-[#7045B8]">{idx + 1}</td>
                      <td className="py-1 px-2">{(pt.time * 1000).toFixed(2)} ms</td>
                      <td className="py-1 px-2">{pt.val.toFixed(3)} V</td>
                      <td className="py-1 px-2 font-semibold text-[#4B287F]">
                        {pt.quantized.toFixed(3)} V
                      </td>
                      <td className="py-1 px-2">
                        <span className="px-1.5 py-0.5 bg-[#F1EBFA] text-[#4B287F] rounded font-bold">
                          {pt.code}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Spectrum Analyzer */}
          <SpectrumAnalyzerCanvas
            title={`${scheme} Frequency Spectrum (Harmonics & Aliasing)`}
            spectrum={spectrum}
            height={220}
          />

          {/* Theory Panel */}
          <TheoryCalculationsPanel
            title={`${scheme} Mathematical Principles`}
            conceptSummary={`Sampling theorem compliance, uniform vs non-uniform companding, and quantization noise analysis.`}
            steps={theorySteps}
          />
        </div>
      </div>
    </div>
  );
};
