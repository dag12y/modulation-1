import React, { useState, useMemo } from 'react';
import {
  simulateAM,
  simulateDSBSC,
  simulateFM,
  simulatePSK,
  simulatePCM,
  addAWGN,
  demodulateAMEnvelope,
  demodulateCoherent,
  demodulateFMFreqDiscriminator,
  lowPassFilter,
  evaluateDemodulation,
  computeFFT,
} from '../services/dsp';
import { ScientificScopeCanvas } from '../components/ScientificScopeCanvas';
import { SpectrumAnalyzerCanvas } from '../components/SpectrumAnalyzerCanvas';
import { TheoryCalculationsPanel, CalculationStep } from '../components/TheoryCalculationsPanel';
import { useSimulation } from '../context/SimulationContext';
import { Activity, Radio, Sliders, AlertCircle, CheckCircle2 } from 'lucide-react';

export type DemodModType = 'AM' | 'DSB-SC' | 'FM' | 'BPSK' | 'PCM';

export const DemodulationLabView: React.FC = () => {
  const { animTime } = useSimulation();
  const [modType, setModType] = useState<DemodModType>('AM');
  const [detectorType, setDetectorType] = useState<string>('envelope');

  // Input Signal parameters
  const [Am, setAm] = useState<number>(2.5);
  const [fm, setFm] = useState<number>(1000); // 1 kHz
  const [Ac, setAc] = useState<number>(4.0);
  const [fc, setFc] = useState<number>(10000); // 10 kHz
  const [snrDb, setSnrDb] = useState<number>(25); // Channel SNR

  // Receiver Tuning parameters
  const [loFreqOffsetHz, setLoFreqOffsetHz] = useState<number>(0); // Local oscillator frequency offset
  const [loPhaseOffsetDeg, setLoPhaseOffsetDeg] = useState<number>(0); // Local oscillator phase offset
  const [filterCutoffHz, setFilterCutoffHz] = useState<number>(2500); // Low-pass filter cutoff
  const [filterOrder, setFilterOrder] = useState<number>(2);

  const fs = 100000;
  const duration = 0.004;

  // Run Transmitter & Receiver Pipeline
  const pipeline = useMemo(() => {
    let rawModulated: number[] = [];
    let originalMessage: number[] = [];
    let timeAxis: number[] = [];

    if (modType === 'AM') {
      const sim = simulateAM({ Ac, fc, Am, fm, mu: 0.8, fs, duration, timeOffset: animTime });
      rawModulated = sim.modulated;
      originalMessage = sim.message;
      timeAxis = sim.t;
    } else if (modType === 'DSB-SC') {
      const sim = simulateDSBSC({ Ac, fc, Am, fm, fs, duration, timeOffset: animTime });
      rawModulated = sim.modulated;
      originalMessage = sim.message;
      timeAxis = sim.t;
    } else if (modType === 'FM') {
      const sim = simulateFM({ Ac, fc, Am, fm, deltaF: 3000, fs, duration, timeOffset: animTime });
      rawModulated = sim.modulated;
      originalMessage = sim.message;
      timeAxis = sim.t;
    } else if (modType === 'BPSK') {
      const bits = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1];
      const sim = simulatePSK({ type: 'BPSK', bits, symbolRate: 1000, fc, Ac, fs, timeOffset: animTime });
      rawModulated = sim.modulated;
      originalMessage = sim.modulated; // Reference
      timeAxis = sim.t;
    } else {
      // PCM
      const sim = simulatePCM({ Am, fm, fsPulse: 4000, numBits: 5, companding: 'uniform', fs, duration, timeOffset: animTime });
      rawModulated = sim.quantizedSignal;
      originalMessage = sim.message;
      timeAxis = sim.t;
    }

    // 1. Channel Impairment (AWGN)
    const { noisy: receivedSignal } = addAWGN(rawModulated, snrDb);

    // 2. Demodulation Detection
    let recovered: number[] = [];
    const phiRad = (loPhaseOffsetDeg * Math.PI) / 180;

    if (detectorType === 'envelope' || modType === 'AM') {
      recovered = demodulateAMEnvelope(receivedSignal, filterCutoffHz, fs);
    } else if (detectorType === 'coherent' || modType === 'DSB-SC' || modType === 'BPSK') {
      recovered = demodulateCoherent(
        receivedSignal,
        timeAxis,
        fc,
        loFreqOffsetHz,
        phiRad,
        filterCutoffHz,
        fs
      );
    } else if (detectorType === 'discriminator' || modType === 'FM') {
      recovered = demodulateFMFreqDiscriminator(receivedSignal, fs, filterCutoffHz);
    } else {
      // Low pass filter smoothing (PCM reconstruction filter)
      recovered = lowPassFilter(receivedSignal, filterCutoffHz, fs, filterOrder);
    }

    // 3. Evaluation
    const evalMetrics = evaluateDemodulation(originalMessage, recovered);

    // Difference / Error waveform
    const errorSignal = new Array<number>(originalMessage.length);
    for (let i = 0; i < originalMessage.length; i++) {
      errorSignal[i] = originalMessage[i] - (evalMetrics.recoveredSignal[i] || 0);
    }

    return {
      t: timeAxis,
      original: originalMessage,
      received: receivedSignal,
      recovered: evalMetrics.recoveredSignal,
      errorSignal,
      evalMetrics,
    };
  }, [
    modType,
    detectorType,
    Ac,
    fc,
    Am,
    fm,
    snrDb,
    loFreqOffsetHz,
    loPhaseOffsetDeg,
    filterCutoffHz,
    filterOrder,
    animTime,
  ]);

  // Compute spectrum of recovered vs original
  const origSpectrum = useMemo(() => computeFFT(pipeline.original, fs), [pipeline.original]);
  const recSpectrum = useMemo(() => computeFFT(pipeline.recovered, fs), [pipeline.recovered]);

  const theorySteps: CalculationStep[] = useMemo(() => {
    return [
      {
        equation: '\\text{MSE} = \\frac{1}{N} \\sum_{n=1}^{N} [m(n) - \\hat{m}(n)]^2',
        variableDefinitions: [
          { symbol: 'm(n)', name: 'Transmitted Reference Signal', value: `${Am.toFixed(1)} V`, unit: 'V' },
          { symbol: 'm̂(n)', name: 'Reconstructed Receiver Output', value: 'Demodulated', unit: 'V' },
          { symbol: 'MSE', name: 'Mean Squared Error', value: `${pipeline.evalMetrics.mse.toFixed(4)}`, unit: 'V²' },
        ],
        substitution: `MSE = (${pipeline.evalMetrics.mse.toFixed(4)} V²) across ${pipeline.t.length} samples`,
        result: `${pipeline.evalMetrics.mse.toFixed(4)}`,
        unit: 'V²',
        engineeringInterpretation:
          pipeline.evalMetrics.mse < 0.1
            ? 'High-fidelity demodulation: Reconstructed message closely tracks original baseband waveform.'
            : 'Elevated demodulation distortion: Caused by channel noise, LO synchronization offset, or filter cutoff clipping.',
      },
      {
        equation: 'r = \\frac{\\text{Cov}(m, \\hat{m})}{\\sigma_m \\sigma_{\\hat{m}}} \\quad \\text{(Correlation Coefficient)}',
        variableDefinitions: [
          { symbol: 'r', name: 'Pearson Correlation Factor', value: `${(pipeline.evalMetrics.correlation * 100).toFixed(1)}%`, unit: 'ratio' },
          { symbol: 'SNR', name: 'Demodulated SNR', value: `${pipeline.evalMetrics.snrDb.toFixed(1)}`, unit: 'dB' },
        ],
        substitution: `r = ${(pipeline.evalMetrics.correlation * 100).toFixed(1)}% ; Recovered SNR = ${pipeline.evalMetrics.snrDb.toFixed(1)} dB`,
        result: `${(pipeline.evalMetrics.correlation * 100).toFixed(1)}%`,
        unit: 'match',
        engineeringInterpretation:
          loPhaseOffsetDeg > 70 && modType === 'DSB-SC'
            ? 'Quadrature Phase Error Degradation: As LO phase approaches 90°, coherent detection gain drops with cos(Δφ).'
            : 'Linear receiver alignment maintained.',
      },
    ];
  }, [pipeline, Am, loPhaseOffsetDeg, modType]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#7045B8]">
            <span>Receiver Workbench</span>
            <span aria-hidden="true">·</span>
            <span>Demodulation & Detection</span>
          </div>
          <h2 className="text-xl font-bold text-[#24212C] mt-0.5">
            Demodulation & Signal Recovery Laboratory
          </h2>
        </div>

        {/* Modulation Type Selector */}
        <div className="flex flex-wrap items-center gap-1 bg-[#F8F7FB] p-1 rounded-lg border border-[#E8E3EF]">
          {(['AM', 'DSB-SC', 'FM', 'BPSK', 'PCM'] as DemodModType[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setModType(m);
                if (m === 'AM') setDetectorType('envelope');
                else if (m === 'DSB-SC' || m === 'BPSK') setDetectorType('coherent');
                else if (m === 'FM') setDetectorType('discriminator');
                else setDetectorType('filter');
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                modType === m
                  ? 'bg-white text-[#4B287F] shadow-xs border border-[#E8E3EF]'
                  : 'text-[#77717F] hover:text-[#24212C]'
              }`}
            >
              {m} Receiver
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Receiver Controls (Left 4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Receiver Performance Summary Card */}
          <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-[#24212C] uppercase tracking-wider text-[#77717F]">
              Recovery Fidelity Metrics
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-[#FAF9FD] p-2.5 rounded-lg border border-[#E8E3EF]">
                <span className="text-[11px] text-[#77717F] block">Correlation (r)</span>
                <span className="text-base font-bold text-[#4B287F]">
                  {(pipeline.evalMetrics.correlation * 100).toFixed(1)}%
                </span>
              </div>
              <div className="bg-[#FAF9FD] p-2.5 rounded-lg border border-[#E8E3EF]">
                <span className="text-[11px] text-[#77717F] block">Demod SNR</span>
                <span className="text-base font-bold text-[#24212C]">
                  {pipeline.evalMetrics.snrDb.toFixed(1)} dB
                </span>
              </div>
            </div>
          </div>

          {/* Receiver Tuning Parameters */}
          <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-[#24212C] pb-2 border-b border-[#F1EBFA]">
              Receiver Demodulator Tuning
            </h3>

            {/* Local Oscillator Phase Offset (for coherent detection) */}
            {(modType === 'DSB-SC' || modType === 'BPSK') && (
              <div className="space-y-3">
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
                  <span className="text-[10px] text-[#77717F] block">
                    Watch the recovered amplitude collapse toward 0 at 90°!
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#77717F]">LO Freq Error (Δfc):</span>
                    <span className="font-mono font-bold text-[#4B287F]">{loFreqOffsetHz} Hz</span>
                  </div>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="5"
                    value={loFreqOffsetHz}
                    onChange={(e) => setLoFreqOffsetHz(parseInt(e.target.value))}
                    className="w-full accent-[#7045B8]"
                  />
                </div>
              </div>
            )}

            {/* Filter Cutoff */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#77717F]">LPF Cutoff Frequency:</span>
                <span className="font-mono font-bold text-[#4B287F]">
                  {(filterCutoffHz / 1000).toFixed(2)} kHz
                </span>
              </div>
              <input
                type="range"
                min="500"
                max="8000"
                step="250"
                value={filterCutoffHz}
                onChange={(e) => setFilterCutoffHz(parseInt(e.target.value))}
                className="w-full accent-[#7045B8]"
              />
              <span className="text-[10px] text-[#77717F] block mt-0.5 mb-2.5">
                Target baseband message frequency: {fm} Hz
              </span>
            </div>

            {/* Channel Noise SNR */}
            <div className="pt-3.5 border-t border-[#F1EBFA]">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#77717F]">Channel Noise (SNR):</span>
                <span className="font-mono font-bold text-[#24212C]">{snrDb} dB</span>
              </div>
              <input
                type="range"
                min="5"
                max="40"
                step="1"
                value={snrDb}
                onChange={(e) => setSnrDb(parseInt(e.target.value))}
                className="w-full accent-[#7045B8]"
              />
            </div>
          </div>
        </div>

        {/* Visualizers (Right 8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Original vs Recovered Waveform Comparison */}
          <ScientificScopeCanvas
            title={`Demodulation Comparison: Original m(t) vs Recovered m̂(t)`}
            t={pipeline.t}
            traces={[
              {
                id: 'original',
                name: `m(t) Original Transmitted`,
                color: '#2563EB',
                data: pipeline.original,
              },
              {
                id: 'recovered',
                name: `m̂(t) Recovered Demodulated Output`,
                color: '#7045B8',
                data: pipeline.recovered,
              },
              {
                id: 'error',
                name: `Error Difference [m(t) - m̂(t)]`,
                color: '#EF4444',
                data: pipeline.errorSignal,
                lineDash: [3, 2],
              },
            ]}
            height={280}
          />

          {/* Received Noisy Modulated Signal */}
          <ScientificScopeCanvas
            title="Received RF Signal at Antenna (before demodulation)"
            t={pipeline.t}
            traces={[
              {
                id: 'rx',
                name: `Received r(t) with AWGN (${snrDb} dB)`,
                color: '#D97706',
                data: pipeline.received,
              },
            ]}
            height={180}
          />

          {/* Theory Panel */}
          <TheoryCalculationsPanel
            title={`${modType} Demodulation Theory & Performance Metrics`}
            conceptSummary={`Mathematical formulation of the receiver detection stage, synchronization error sensitivity, and mean-squared error tracking.`}
            steps={theorySteps}
          />
        </div>
      </div>
    </div>
  );
};
