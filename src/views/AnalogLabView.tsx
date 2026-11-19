import React, { useState, useMemo } from 'react';
import {
  simulateAM,
  simulateDSBSC,
  simulateSSB,
  simulateVSB,
  simulateFM,
  simulatePM,
  computeFFT,
  demodulateAMEnvelope,
  demodulateCoherent,
  demodulateFMFreqDiscriminator,
  evaluateDemodulation,
} from '../services/dsp';
import { ScientificScopeCanvas } from '../components/ScientificScopeCanvas';
import { SpectrumAnalyzerCanvas } from '../components/SpectrumAnalyzerCanvas';
import { TheoryCalculationsPanel, CalculationStep } from '../components/TheoryCalculationsPanel';
import { useSimulation } from '../context/SimulationContext';
import { Radio, AlertTriangle, CheckCircle, Info, RotateCcw } from 'lucide-react';

export type AnalogScheme = 'AM' | 'DSB-SC' | 'SSB' | 'VSB' | 'FM' | 'PM';

interface AnalogLabProps {
  initialScheme?: AnalogScheme;
}

export const AnalogLabView: React.FC<AnalogLabProps> = ({ initialScheme = 'AM' }) => {
  const { animTime } = useSimulation();
  const [scheme, setScheme] = useState<AnalogScheme>(initialScheme);

  // Common parameters
  const [Ac, setAc] = useState<number>(4.0);
  const [fc, setFc] = useState<number>(10000); // 10 kHz
  const [Am, setAm] = useState<number>(3.0);
  const [fm, setFm] = useState<number>(1000); // 1 kHz

  // AM specific
  const [muSlider, setMuSlider] = useState<number>(0.75); // Modulation index
  const [useEnvelopeDetector, setUseEnvelopeDetector] = useState<boolean>(true);

  // SSB specific
  const [ssbSideband, setSsbSideband] = useState<'USB' | 'LSB'>('USB');

  // VSB specific
  const [vestigeRatio, setVestigeRatio] = useState<number>(0.25);

  // FM specific
  const [deltaF, setDeltaF] = useState<number>(2500); // 2.5 kHz frequency deviation

  // PM specific
  const [kp, setKp] = useState<number>(1.0); // Phase sensitivity (rad/V)

  // Receiver synchronization parameters for coherent detection
  const [loPhaseOffsetDeg, setLoPhaseOffsetDeg] = useState<number>(0);
  const [loFreqOffsetHz, setLoFreqOffsetHz] = useState<number>(0);

  // Sampling & duration
  const fs = 100000; // 100 kHz sample rate
  const duration = 0.004; // 4 ms

  // Run simulation based on current scheme
  const simResult = useMemo(() => {
    switch (scheme) {
      case 'AM': {
        const res = simulateAM({ Ac, fc, Am, fm, mu: muSlider, fs, duration, timeOffset: animTime });
        // Demodulate via envelope detector
        const demod = demodulateAMEnvelope(res.modulated, fm * 2.5, fs);
        const evalMetrics = evaluateDemodulation(res.message, demod);
        return {
          ...res,
          demod,
          evalMetrics,
          type: 'AM' as const,
        };
      }
      case 'DSB-SC': {
        const res = simulateDSBSC({ Ac, fc, Am, fm, fs, duration, timeOffset: animTime });
        // Coherent demodulation
        const phiOffsetRad = (loPhaseOffsetDeg * Math.PI) / 180;
        const demod = demodulateCoherent(res.modulated, res.t, fc, loFreqOffsetHz, phiOffsetRad, fm * 2.5, fs);
        const evalMetrics = evaluateDemodulation(res.message, demod);
        return {
          ...res,
          demod,
          evalMetrics,
          type: 'DSB-SC' as const,
        };
      }
      case 'SSB': {
        const res = simulateSSB({ Ac, fc, Am, fm, sideband: ssbSideband, fs, duration, timeOffset: animTime });
        const demod = demodulateCoherent(res.modulated, res.t, fc, 0, 0, fm * 2.5, fs);
        const evalMetrics = evaluateDemodulation(res.message, demod);
        return {
          ...res,
          demod,
          evalMetrics,
          type: 'SSB' as const,
        };
      }
      case 'VSB': {
        const res = simulateVSB({ Ac, fc, Am, fm, vestigeRatio, fs, duration, timeOffset: animTime });
        const demod = demodulateCoherent(res.modulated, res.t, fc, 0, 0, fm * 2.5, fs);
        const evalMetrics = evaluateDemodulation(res.message, demod);
        return {
          ...res,
          demod,
          evalMetrics,
          type: 'VSB' as const,
        };
      }
      case 'FM': {
        const res = simulateFM({ Ac, fc, Am, fm, deltaF, fs, duration, timeOffset: animTime });
        const demod = demodulateFMFreqDiscriminator(res.modulated, fs, fm * 2.5);
        const evalMetrics = evaluateDemodulation(res.message, demod);
        return {
          ...res,
          demod,
          evalMetrics,
          type: 'FM' as const,
        };
      }
      case 'PM': {
        const res = simulatePM({ Ac, fc, Am, fm, kp, fs, duration, timeOffset: animTime });
        const demod = demodulateFMFreqDiscriminator(res.modulated, fs, fm * 2.5);
        const evalMetrics = evaluateDemodulation(res.message, demod);
        return {
          ...res,
          demod,
          evalMetrics,
          type: 'PM' as const,
        };
      }
    }
  }, [scheme, Ac, fc, Am, fm, muSlider, ssbSideband, vestigeRatio, deltaF, kp, loPhaseOffsetDeg, loFreqOffsetHz, animTime]);

  // Compute RF spectrum of modulated signal
  const spectrum = useMemo(() => {
    return computeFFT(simResult.modulated, fs, 'hanning');
  }, [simResult.modulated]);

  // Theory calculations step generator
  const theorySteps: CalculationStep[] = useMemo(() => {
    if (scheme === 'AM') {
      const Pc = (Ac * Ac) / 2;
      const Psb = (muSlider * muSlider / 4) * (Ac * Ac);
      const Pt = Pc * (1 + (muSlider * muSlider) / 2);
      const eta = (Psb / Pt) * 100;
      const bw = 2 * fm;

      return [
        {
          equation: 's(t) = A_c [1 + μ m_n(t)] \\cos(2\\pi f_c t)',
          variableDefinitions: [
            { symbol: 'A_c', name: 'Carrier Amplitude', value: `${Ac.toFixed(2)}`, unit: 'V' },
            { symbol: 'μ', name: 'Modulation Index (Am/Ac)', value: `${muSlider.toFixed(2)}`, unit: 'ratio' },
            { symbol: 'f_c', name: 'Carrier Frequency', value: `${(fc / 1000).toFixed(1)}`, unit: 'kHz' },
            { symbol: 'f_m', name: 'Message Frequency', value: `${(fm / 1000).toFixed(1)}`, unit: 'kHz' },
          ],
          substitution: `s(t) = ${Ac.toFixed(1)} · [1 + ${muSlider.toFixed(2)} · cos(2π·${fm}·t)] · cos(2π·${fc}·t)`,
          result: muSlider <= 1 ? 'Envelope Preserved (Linear Detection)' : 'OVERMODULATION (Envelope Inversion)',
          unit: '',
          engineeringInterpretation:
            muSlider <= 1
              ? 'When μ ≤ 1, the envelope never crosses zero. An inexpensive passive diode envelope detector can faithfully extract m(t).'
              : 'CRITICAL WARNING: When μ > 1 (overmodulation), the envelope is clipped at zero and phase reversals occur. Envelope detectors produce severe non-linear harmonic distortion.',
        },
        {
          equation: 'BW = 2 f_m',
          variableDefinitions: [
            { symbol: 'f_m', name: 'Message Frequency', value: `${fm}`, unit: 'Hz' },
            { symbol: 'BW', name: 'RF Transmission Bandwidth', value: `${bw}`, unit: 'Hz' },
          ],
          substitution: `BW = 2 · ${fm} Hz = ${bw} Hz`,
          result: `${(bw / 1000).toFixed(2)}`,
          unit: 'kHz',
          engineeringInterpretation:
            'Conventional AM requires exactly twice the message bandwidth because two symmetrical sidebands (USB and LSB) are radiated on either side of the carrier.',
        },
        {
          equation: 'P_T = P_C \\cdot (1 + \\frac{\\mu^2}{2}), \\quad \\eta = \\frac{P_{SB}}{P_T}',
          variableDefinitions: [
            { symbol: 'P_c', name: 'Unmodulated Carrier Power', value: `${Pc.toFixed(2)}`, unit: 'W (1Ω)' },
            { symbol: 'P_sb', name: 'Total Sideband Power', value: `${Psb.toFixed(2)}`, unit: 'W' },
            { symbol: 'P_t', name: 'Total Transmitted Power', value: `${Pt.toFixed(2)}`, unit: 'W' },
          ],
          substitution: `P_T = ${Pc.toFixed(2)} · (1 + ${muSlider.toFixed(2)}²/2) = ${Pt.toFixed(2)} W; η = (${Psb.toFixed(2)} / ${Pt.toFixed(2)}) · 100%`,
          result: `${eta.toFixed(1)}%`,
          unit: 'efficiency',
          engineeringInterpretation: `Even at 100% modulation (μ=1), power efficiency is at most 33.3%. Over 66.7% of the power is wasted transmitting the constant carrier that carries zero information.`,
        },
      ];
    } else if (scheme === 'DSB-SC') {
      const bw = 2 * fm;
      return [
        {
          equation: 's(t) = A_c \\cdot m(t) \\cdot \\cos(2\\pi f_c t)',
          variableDefinitions: [
            { symbol: 'A_c', name: 'Carrier Amplitude', value: `${Ac.toFixed(2)}`, unit: 'V' },
            { symbol: 'm(t)', name: 'Baseband Message Signal', value: `${Am.toFixed(2)} cos(2π·${fm}·t)`, unit: 'V' },
            { symbol: 'f_c', name: 'Carrier Frequency', value: `${(fc / 1000).toFixed(1)}`, unit: 'kHz' },
          ],
          substitution: `s(t) = ${Ac.toFixed(1)} · [${Am.toFixed(1)} cos(2π·${fm}·t)] · cos(2π·${fc}·t)`,
          result: '100% Power in Sidebands (Carrier Suppressed)',
          unit: '',
          engineeringInterpretation:
            'By completely suppressing the carrier, 100% of transmitted power is allocated to the informational sidebands. However, coherent detection requires a synchronized local oscillator.',
        },
        {
          equation: 'v_o(t) = LPF\\{s(t) \\cdot 2\\cos(2\\pi f_c t + \\phi)\\} = A_c A_m \\cos(\\phi) m(t)',
          variableDefinitions: [
            { symbol: 'φ', name: 'Local Oscillator Phase Error', value: `${loPhaseOffsetDeg}°`, unit: 'degrees' },
            { symbol: 'cos(φ)', name: 'Coherent Gain Factor', value: `${Math.cos((loPhaseOffsetDeg * Math.PI) / 180).toFixed(3)}`, unit: 'gain' },
          ],
          substitution: `Output Amplitude = ${Ac.toFixed(1)} · ${Am.toFixed(1)} · cos(${loPhaseOffsetDeg}°)`,
          result: `${(Math.cos((loPhaseOffsetDeg * Math.PI) / 180) * 100).toFixed(1)}%`,
          unit: 'relative gain',
          engineeringInterpretation:
            loPhaseOffsetDeg === 90 || loPhaseOffsetDeg === 270
              ? 'CRITICAL COHERENT NULL: At φ = 90°, cos(90°) = 0! The recovered signal completely vanishes due to quadrature phase null effect.'
              : `At φ = ${loPhaseOffsetDeg}°, output amplitude is scaled by cos(${loPhaseOffsetDeg}°) = ${Math.cos((loPhaseOffsetDeg * Math.PI) / 180).toFixed(2)}.`,
        },
      ];
    } else if (scheme === 'SSB') {
      return [
        {
          equation: 's_{SSB}(t) = \\frac{A_c}{2} [m(t)\\cos(2\\pi f_c t) \\mp \\hat{m}(t)\\sin(2\\pi f_c t)]',
          variableDefinitions: [
            { symbol: 'm(t)', name: 'Message', value: `${Am} cos(2π·${fm}t)`, unit: 'V' },
            { symbol: 'm̂(t)', name: 'Hilbert Transform (90° phase shift)', value: `${Am} sin(2π·${fm}t)`, unit: 'V' },
            { symbol: 'BW', name: 'Bandwidth', value: `${fm}`, unit: 'Hz' },
          ],
          substitution: `BW = f_m = ${fm} Hz (Half of AM and DSB-SC)`,
          result: `${(fm / 1000).toFixed(2)}`,
          unit: 'kHz',
          engineeringInterpretation:
            'Single Sideband suppresses the carrier AND one complete sideband. Bandwidth is reduced by 50% compared to AM, making it ideal for HF amateur radio and marine communications.',
        },
      ];
    } else if (scheme === 'FM') {
      const beta = deltaF / (fm || 1);
      const carsonsBw = 2 * (deltaF + fm);

      return [
        {
          equation: '\\beta = \\frac{\\Delta f}{f_m}',
          variableDefinitions: [
            { symbol: 'Δf', name: 'Peak Frequency Deviation', value: `${deltaF}`, unit: 'Hz' },
            { symbol: 'f_m', name: 'Modulating Frequency', value: `${fm}`, unit: 'Hz' },
            { symbol: 'β', name: 'FM Modulation Index', value: `${beta.toFixed(2)}`, unit: 'dimensionless' },
          ],
          substitution: `β = ${deltaF} Hz / ${fm} Hz = ${beta.toFixed(2)}`,
          result: beta < 1 ? 'Narrowband FM (NBFM)' : 'Wideband FM (WBFM)',
          unit: '',
          engineeringInterpretation:
            beta < 1
              ? 'Narrowband FM (β < 1): Spectrum behaves similarly to AM with only carrier and first-order sidebands.'
              : 'Wideband FM (β ≥ 1): High noise immunity at the expense of wider bandwidth. Multiple Bessel sidebands carry information.',
        },
        {
          equation: 'BW \\approx 2(\\Delta f + f_m) = 2 f_m (1 + \\beta) \\quad \\text{(Carson\'s Rule)}',
          variableDefinitions: [
            { symbol: 'Δf', name: 'Peak Frequency Deviation', value: `${deltaF}`, unit: 'Hz' },
            { symbol: 'f_m', name: 'Message Frequency', value: `${fm}`, unit: 'Hz' },
          ],
          substitution: `BW ≈ 2 · (${deltaF} + ${fm}) = 2 · ${deltaF + fm} Hz`,
          result: `${(carsonsBw / 1000).toFixed(2)}`,
          unit: 'kHz',
          engineeringInterpretation:
            "Carson's rule captures over 98% of total transmitted RF power in wideband FM signals.",
        },
      ];
    } else if (scheme === 'PM') {
      const deltaTheta = kp * Am;
      const equivDeltaF = kp * Am * fm;
      const bw = 2 * (equivDeltaF + fm);

      return [
        {
          equation: 's(t) = A_c \\cos(2\\pi f_c t + k_p m(t))',
          variableDefinitions: [
            { symbol: 'k_p', name: 'Phase Sensitivity', value: `${kp.toFixed(2)}`, unit: 'rad/V' },
            { symbol: 'Δθ', name: 'Peak Phase Deviation (kp·Am)', value: `${deltaTheta.toFixed(2)}`, unit: 'rad' },
            { symbol: 'BW', name: 'Equivalent Bandwidth', value: `${(bw / 1000).toFixed(2)}`, unit: 'kHz' },
          ],
          substitution: `Δθ = ${kp} rad/V · ${Am} V = ${deltaTheta.toFixed(2)} rad`,
          result: `${deltaTheta.toFixed(2)}`,
          unit: 'rad',
          engineeringInterpretation:
            'Phase Modulation directly modulates carrier phase angle. Note: Instantaneous frequency in PM is proportional to dm(t)/dt (the derivative of message), whereas in FM it is proportional to m(t).',
        },
      ];
    } else {
      // VSB
      const bw = fm * (1 + vestigeRatio);
      return [
        {
          equation: 'BW_{VSB} = f_m + f_v = f_m (1 + r_v)',
          variableDefinitions: [
            { symbol: 'f_m', name: 'Message Bandwidth', value: `${fm}`, unit: 'Hz' },
            { symbol: 'r_v', name: 'Vestigial Ratio', value: `${vestigeRatio.toFixed(2)}`, unit: 'ratio' },
          ],
          substitution: `BW = ${fm} · (1 + ${vestigeRatio.toFixed(2)}) = ${bw.toFixed(0)} Hz`,
          result: `${(bw / 1000).toFixed(2)}`,
          unit: 'kHz',
          engineeringInterpretation:
            'Vestigial Sideband strikes an optimum balance between SSB (which requires sharp, difficult-to-build filters) and DSB-SC. Historically used in analog broadcast television (NTSC/PAL).',
        },
      ];
    }
  }, [scheme, Ac, fc, Am, fm, muSlider, deltaF, kp, vestigeRatio, loPhaseOffsetDeg]);

  // Modulation status indicator
  const modulationState = useMemo(() => {
    if (scheme === 'AM') {
      if (muSlider < 0.95) return { text: 'Under-Modulation (μ < 1)', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', safe: true };
      if (muSlider <= 1.05) return { text: '100% Critical Modulation (μ = 1)', color: 'text-blue-700 bg-blue-50 border-blue-200', safe: true };
      return { text: 'Over-Modulation Warning (μ > 1)', color: 'text-red-700 bg-red-50 border-red-200', safe: false };
    }
    if (scheme === 'FM') {
      const beta = deltaF / (fm || 1);
      return {
        text: beta < 1 ? `Narrowband FM (β = ${beta.toFixed(2)})` : `Wideband FM (β = ${beta.toFixed(2)})`,
        color: 'text-[#4B287F] bg-[#F1EBFA] border-[#7045B8]/20',
        safe: true,
      };
    }
    return { text: `${scheme} Active`, color: 'text-[#4B287F] bg-[#F1EBFA] border-[#7045B8]/20', safe: true };
  }, [scheme, muSlider, deltaF, fm]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Scheme Selector Bar */}
      <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#7045B8]">
            <span>Laboratory Bench</span>
            <span aria-hidden="true">·</span>
            <span>Analog Communication</span>
          </div>
          <h2 className="text-xl font-bold text-[#24212C] mt-0.5">
            Analog Modulation & Demodulation Laboratory
          </h2>
        </div>

        {/* Scheme Selector Tabs */}
        <div className="flex flex-wrap items-center gap-1 bg-[#F8F7FB] p-1 rounded-lg border border-[#E8E3EF]">
          {(['AM', 'DSB-SC', 'SSB', 'VSB', 'FM', 'PM'] as AnalogScheme[]).map((s) => (
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

      {/* Main Grid: Controls vs Visualizers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls Deck (Left 4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Status banner */}
          <div className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${modulationState.color}`}>
            <div className="flex items-center gap-2">
              {modulationState.safe ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              )}
              <span>{modulationState.text}</span>
            </div>
            <span className="font-mono text-[11px]">fs: {(fs / 1000).toFixed(0)} kHz</span>
          </div>

          {/* Scheme Specific Controls */}
          <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-[#24212C] pb-2 border-b border-[#F1EBFA]">
              {scheme} Parameters
            </h3>

            {/* AM Controls */}
            {scheme === 'AM' && (
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#77717F]">Modulation Index (μ):</span>
                    <span className="font-mono font-bold text-[#4B287F]">{muSlider.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.6"
                    step="0.05"
                    value={muSlider}
                    onChange={(e) => setMuSlider(parseFloat(e.target.value))}
                    className="w-full accent-[#7045B8]"
                  />
                  <div className="flex justify-between text-[10px] text-[#77717F] font-mono mt-1 mb-2.5">
                    <span>0.1 (Under)</span>
                    <span className="text-blue-600 font-bold">1.0 (Critical)</span>
                    <span className="text-red-600 font-bold">1.6 (Over)</span>
                  </div>
                </div>

                <div className="pt-3.5 border-t border-[#F1EBFA] flex items-center justify-between">
                  <span className="text-xs text-[#24212C] font-medium">Demodulator Mode:</span>
                  <div className="flex items-center gap-1 bg-[#F1EBFA] p-1 rounded-md text-xs">
                    <span className="font-semibold text-[#4B287F]">Diode Envelope Detector</span>
                  </div>
                </div>
              </div>
            )}

            {/* DSB-SC Controls */}
            {scheme === 'DSB-SC' && (
              <div className="space-y-3">
                <div className="p-2.5 bg-[#FAF9FD] rounded-lg border border-[#E8E3EF] text-xs text-[#77717F]">
                  DSB-SC requires a coherent product detector with an exact local carrier.
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#77717F]">LO Phase Offset (Δφ):</span>
                    <span className="font-mono font-bold text-[#4B287F]">{loPhaseOffsetDeg}°</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="180"
                    step="5"
                    value={loPhaseOffsetDeg}
                    onChange={(e) => setLoPhaseOffsetDeg(parseInt(e.target.value))}
                    className="w-full accent-[#7045B8]"
                  />
                  <span className="text-[10px] text-[#77717F] block mt-0.5">
                    Notice: At Δφ = 90°, output drops to zero (Quadrature Null Effect).
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#77717F]">LO Freq Offset (Δfc):</span>
                    <span className="font-mono font-bold text-[#4B287F]">{loFreqOffsetHz} Hz</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    step="10"
                    value={loFreqOffsetHz}
                    onChange={(e) => setLoFreqOffsetHz(parseInt(e.target.value))}
                    className="w-full accent-[#7045B8]"
                  />
                </div>
              </div>
            )}

            {/* SSB Controls */}
            {scheme === 'SSB' && (
              <div className="space-y-3">
                <label className="block text-xs font-medium text-[#24212C]">
                  Sideband Selection
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSsbSideband('USB')}
                    className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                      ssbSideband === 'USB'
                        ? 'bg-[#7045B8] text-white border-[#7045B8]'
                        : 'bg-[#F8F7FB] border-[#E8E3EF] text-[#77717F]'
                    }`}
                  >
                    Upper Sideband (USB)
                  </button>
                  <button
                    onClick={() => setSsbSideband('LSB')}
                    className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                      ssbSideband === 'LSB'
                        ? 'bg-[#7045B8] text-white border-[#7045B8]'
                        : 'bg-[#F8F7FB] border-[#E8E3EF] text-[#77717F]'
                    }`}
                  >
                    Lower Sideband (LSB)
                  </button>
                </div>
                <span className="text-xs text-[#77717F] block">
                  Hilbert transform: s(t) = 0.5 Ac [m(t)cos(ωc t) ∓ m̂(t)sin(ωc t)]
                </span>
              </div>
            )}

            {/* VSB Controls */}
            {scheme === 'VSB' && (
              <div className="space-y-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#77717F]">Vestige Ratio (rv):</span>
                  <span className="font-mono font-bold text-[#4B287F]">{(vestigeRatio * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.5"
                  step="0.05"
                  value={vestigeRatio}
                  onChange={(e) => setVestigeRatio(parseFloat(e.target.value))}
                  className="w-full accent-[#7045B8]"
                />
              </div>
            )}

            {/* FM Controls */}
            {scheme === 'FM' && (
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#77717F]">Frequency Deviation (Δf):</span>
                    <span className="font-mono font-bold text-[#4B287F]">{(deltaF / 1000).toFixed(2)} kHz</span>
                  </div>
                  <input
                    type="range"
                    min="200"
                    max="5000"
                    step="100"
                    value={deltaF}
                    onChange={(e) => setDeltaF(parseFloat(e.target.value))}
                    className="w-full accent-[#7045B8]"
                  />
                </div>
                <div className="p-2.5 bg-[#FAF9FD] rounded-lg border border-[#E8E3EF] flex justify-between items-center text-xs">
                  <span className="text-[#77717F]">Modulation Index β:</span>
                  <span className="font-mono font-bold text-[#4B287F]">{(deltaF / fm).toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* PM Controls */}
            {scheme === 'PM' && (
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#77717F]">Phase Sensitivity (kp):</span>
                    <span className="font-mono font-bold text-[#4B287F]">{kp.toFixed(2)} rad/V</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="3.0"
                    step="0.1"
                    value={kp}
                    onChange={(e) => setKp(parseFloat(e.target.value))}
                    className="w-full accent-[#7045B8]"
                  />
                </div>
              </div>
            )}

            {/* Shared Signal Frequencies & Amplitudes */}
            <div className="pt-3 border-t border-[#F1EBFA] space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#77717F]">Carrier Freq (fc):</span>
                  <span className="font-mono font-bold text-[#24212C]">{(fc / 1000).toFixed(1)} kHz</span>
                </div>
                <input
                  type="range"
                  min="5000"
                  max="20000"
                  step="500"
                  value={fc}
                  onChange={(e) => setFc(parseFloat(e.target.value))}
                  className="w-full accent-[#7045B8]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#77717F]">Message Freq (fm):</span>
                  <span className="font-mono font-bold text-[#24212C]">{fm} Hz</span>
                </div>
                <input
                  type="range"
                  min="200"
                  max="2000"
                  step="100"
                  value={fm}
                  onChange={(e) => setFm(parseFloat(e.target.value))}
                  className="w-full accent-[#7045B8]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="text-[11px] text-[#77717F] block">Carrier Amp (Ac)</span>
                  <span className="font-mono font-bold text-xs text-[#24212C]">{Ac.toFixed(1)} V</span>
                </div>
                <div>
                  <span className="text-[11px] text-[#77717F] block">Message Amp (Am)</span>
                  <span className="font-mono font-bold text-xs text-[#24212C]">{Am.toFixed(1)} V</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Demodulation Performance Card */}
          <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs space-y-2">
            <h4 className="text-xs font-bold text-[#24212C]">Receiver Demodulation Metrics</h4>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="bg-[#FAF9FD] p-2 rounded border border-[#E8E3EF]">
                <span className="text-[#77717F] block">Mean Squared Error</span>
                <span className="font-bold text-[#24212C]">{simResult.evalMetrics.mse.toFixed(4)}</span>
              </div>
              <div className="bg-[#FAF9FD] p-2 rounded border border-[#E8E3EF]">
                <span className="text-[#77717F] block">Correlation (r)</span>
                <span className="font-bold text-[#4B287F]">
                  {(simResult.evalMetrics.correlation * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Oscilloscope & Spectrum Analyzer (Right 8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Main Oscilloscope */}
          <ScientificScopeCanvas
            title={`Time-Domain Modulated Waveform: ${scheme}`}
            t={simResult.t}
            traces={[
              {
                id: 'modulated',
                name: `s(t) Modulated`,
                color: '#7045B8',
                data: simResult.modulated,
              },
              {
                id: 'message',
                name: `m(t) Original Message`,
                color: '#2563EB',
                data: simResult.message,
              },
              ...(scheme === 'AM' && 'upperEnvelope' in simResult
                ? [
                    {
                      id: 'envelope',
                      name: `Positive Envelope`,
                      color: '#10B981',
                      data: simResult.upperEnvelope,
                      lineDash: [4, 3],
                    },
                  ]
                : []),
              {
                id: 'recovered',
                name: `m̂(t) Demodulated Output`,
                color: '#D97706',
                data: simResult.demod,
                lineDash: [3, 2],
              },
            ]}
            height={280}
          />

          {/* RF Spectrum Analyzer */}
          <SpectrumAnalyzerCanvas
            title={`RF Spectrum Analyzer: ${scheme} Frequency Distribution`}
            spectrum={spectrum}
            height={230}
            highlightBandwidth={{
              start: Math.max(0, fc - (scheme === 'SSB' ? 0 : fm * (scheme === 'FM' ? (deltaF / fm + 1) : 1))),
              end: fc + fm * (scheme === 'FM' ? (deltaF / fm + 1) : 1),
              label: `BW ≈ ${
                scheme === 'FM'
                  ? (2 * (deltaF + fm) / 1000).toFixed(1) + ' kHz'
                  : scheme === 'SSB'
                  ? (fm / 1000).toFixed(1) + ' kHz'
                  : (2 * fm / 1000).toFixed(1) + ' kHz'
              }`,
            }}
          />

          {/* Dynamic Mathematical Theory Panel */}
          <TheoryCalculationsPanel
            title={`${scheme} Mathematical Derivation & Power Analysis`}
            conceptSummary={`Detailed mathematical formulation for ${scheme} simulation including bandwidth occupancy, power distribution, and receiver recovery.`}
            steps={theorySteps}
          />
        </div>
      </div>
    </div>
  );
};
