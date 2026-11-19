import React, { useState, useMemo } from 'react';
import { WaveformType, generateWaveform, computeFFT } from '../services/dsp';
import { ScientificScopeCanvas } from '../components/ScientificScopeCanvas';
import { SpectrumAnalyzerCanvas } from '../components/SpectrumAnalyzerCanvas';
import { useSimulation } from '../context/SimulationContext';
import { RotateCcw, Sliders, Radio, Sparkles } from 'lucide-react';

export const SignalGeneratorView: React.FC = () => {
  const { animTime } = useSimulation();

  // Message parameters
  const [msgWaveType, setMsgWaveType] = useState<WaveformType>('sine');
  const [Am, setAm] = useState<number>(2.0);
  const [fm, setFm] = useState<number>(1000); // 1 kHz
  const [phiM, setPhiM] = useState<number>(0);
  const [dcOffsetM, setDcOffsetM] = useState<number>(0);

  // Carrier parameters
  const [Ac, setAc] = useState<number>(4.0);
  const [fc, setFc] = useState<number>(10000); // 10 kHz
  const [phiC, setPhiC] = useState<number>(0);
  const [dcOffsetC, setDcOffsetC] = useState<number>(0);

  // System parameters
  const [fs, setFs] = useState<number>(100000); // 100 kHz
  const [duration, setDuration] = useState<number>(0.004); // 4 ms

  // Calculate message and carrier
  const { message, carrier, metrics } = useMemo(() => {
    const msg = generateWaveform(msgWaveType, fm, Am, (phiM * Math.PI) / 180, dcOffsetM, fs, duration, animTime);
    const car = generateWaveform('cosine', fc, Ac, (phiC * Math.PI) / 180, dcOffsetC, fs, duration, animTime);

    // Calculate electrical metrics
    let sumM2 = 0;
    let peakM = 0;
    let minM = Infinity;
    let maxM = -Infinity;

    for (let i = 0; i < msg.samples.length; i++) {
      const v = msg.samples[i];
      sumM2 += v * v;
      if (Math.abs(v) > peakM) peakM = Math.abs(v);
      if (v < minM) minM = v;
      if (v > maxM) maxM = v;
    }
    const rmsM = Math.sqrt(sumM2 / (msg.samples.length || 1));
    const vppM = maxM - minM;
    const periodM = 1 / (fm || 1);
    const numCyclesM = duration * fm;

    let sumC2 = 0;
    for (let i = 0; i < car.samples.length; i++) {
      sumC2 += car.samples[i] * car.samples[i];
    }
    const rmsC = Math.sqrt(sumC2 / (car.samples.length || 1));
    const periodC = 1 / (fc || 1);

    return {
      message: msg,
      carrier: car,
      metrics: {
        msgRms: rmsM,
        msgVpp: vppM,
        msgPeriodMs: periodM * 1000,
        msgCycles: numCyclesM,
        carRms: rmsC,
        carPeriodUs: periodC * 1000000,
        sampleCount: msg.samples.length,
      },
    };
  }, [msgWaveType, Am, fm, phiM, dcOffsetM, Ac, fc, phiC, dcOffsetC, fs, duration, animTime]);

  // FFT for message and carrier
  const msgSpectrum = useMemo(() => computeFFT(message.samples, fs, 'hanning'), [message, fs]);
  const carSpectrum = useMemo(() => computeFFT(carrier.samples, fs, 'hanning'), [carrier, fs]);

  const handleResetDefaults = () => {
    setMsgWaveType('sine');
    setAm(2.0);
    setFm(1000);
    setPhiM(0);
    setDcOffsetM(0);
    setAc(4.0);
    setFc(10000);
    setPhiC(0);
    setDcOffsetC(0);
    setFs(100000);
    setDuration(0.004);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-[#E8E3EF] rounded-xl p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#7045B8] font-semibold">
            <span>Instruments</span>
            <span aria-hidden="true">·</span>
            <span>Signal Synthesis</span>
          </div>
          <h2 className="text-xl font-bold text-[#24212C] mt-0.5">
            Signal Generator & Parameter Workbench
          </h2>
          <p className="text-xs text-[#77717F]">
            Configure baseband message signals and high-frequency RF carrier oscillators.
          </p>
        </div>

        <button
          onClick={handleResetDefaults}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#F1EBFA] hover:bg-[#E8E3EF] text-[#4B287F] text-xs font-semibold rounded-lg transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Parameters</span>
        </button>
      </div>

      {/* Grid: Controls and Waveform Scopes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls Deck (Left 4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Message Signal Controls */}
          <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#F1EBFA] pb-2">
              <h3 className="text-sm font-bold text-[#24212C] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]" />
                Message Signal m(t)
              </h3>
              <span className="text-[11px] font-mono text-[#77717F]">Baseband</span>
            </div>

            {/* Waveform Selector */}
            <div>
              <label className="block text-xs font-medium text-[#24212C] mb-1.5">
                Waveform Shape
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['sine', 'cosine', 'square', 'triangle', 'sawtooth'] as WaveformType[]).map(
                  (type) => (
                    <button
                      key={type}
                      onClick={() => setMsgWaveType(type)}
                      className={`px-2 py-1 text-xs capitalize rounded-md border transition-all ${
                        msgWaveType === type
                          ? 'bg-[#2563EB] text-white border-[#2563EB] font-semibold shadow-xs'
                          : 'bg-[#F8F7FB] border-[#E8E3EF] text-[#77717F] hover:text-[#24212C]'
                      }`}
                    >
                      {type}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Am */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#77717F]">Amplitude (Am):</span>
                <span className="font-mono font-semibold text-[#24212C]">{Am.toFixed(2)} V</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={Am}
                onChange={(e) => setAm(parseFloat(e.target.value))}
                className="w-full accent-[#2563EB]"
              />
            </div>

            {/* fm */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#77717F]">Frequency (fm):</span>
                <span className="font-mono font-semibold text-[#24212C]">{fm} Hz</span>
              </div>
              <input
                type="range"
                min="100"
                max="5000"
                step="50"
                value={fm}
                onChange={(e) => setFm(parseFloat(e.target.value))}
                className="w-full accent-[#2563EB]"
              />
            </div>

            {/* Phase */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#77717F]">Phase (φm):</span>
                <span className="font-mono font-semibold text-[#24212C]">{phiM}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                step="15"
                value={phiM}
                onChange={(e) => setPhiM(parseFloat(e.target.value))}
                className="w-full accent-[#2563EB]"
              />
            </div>

            {/* DC Offset */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#77717F]">DC Offset:</span>
                <span className="font-mono font-semibold text-[#24212C]">{dcOffsetM.toFixed(1)} V</span>
              </div>
              <input
                type="range"
                min="-5"
                max="5"
                step="0.5"
                value={dcOffsetM}
                onChange={(e) => setDcOffsetM(parseFloat(e.target.value))}
                className="w-full accent-[#2563EB]"
              />
            </div>
          </div>

          {/* Carrier Signal Controls */}
          <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#F1EBFA] pb-2">
              <h3 className="text-sm font-bold text-[#24212C] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#D97706]" />
                Carrier Signal c(t)
              </h3>
              <span className="text-[11px] font-mono text-[#77717F]">RF Local Osc</span>
            </div>

            {/* Ac */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#77717F]">Carrier Amplitude (Ac):</span>
                <span className="font-mono font-semibold text-[#24212C]">{Ac.toFixed(2)} V</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={Ac}
                onChange={(e) => setAc(parseFloat(e.target.value))}
                className="w-full accent-[#D97706]"
              />
            </div>

            {/* fc */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#77717F]">Carrier Frequency (fc):</span>
                <span className="font-mono font-semibold text-[#24212C]">{(fc / 1000).toFixed(1)} kHz</span>
              </div>
              <input
                type="range"
                min="5000"
                max="30000"
                step="500"
                value={fc}
                onChange={(e) => setFc(parseFloat(e.target.value))}
                className="w-full accent-[#D97706]"
              />
            </div>

            {/* Carrier Phase */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#77717F]">Carrier Phase (φc):</span>
                <span className="font-mono font-semibold text-[#24212C]">{phiC}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                step="15"
                value={phiC}
                onChange={(e) => setPhiC(parseFloat(e.target.value))}
                className="w-full accent-[#D97706]"
              />
            </div>
          </div>

          {/* Timebase / Sampling */}
          <div className="bg-[#FAF9FD] border border-[#E8E3EF] rounded-xl p-4 text-xs space-y-2.5">
            <h4 className="font-semibold text-[#24212C]">Timebase & Sampling Rate</h4>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="bg-white p-2 rounded border border-[#E8E3EF]">
                <span className="text-[#77717F] block">Sampling Freq (fs)</span>
                <span className="font-bold text-[#4B287F]">{(fs / 1000).toFixed(0)} kHz</span>
              </div>
              <div className="bg-white p-2 rounded border border-[#E8E3EF]">
                <span className="text-[#77717F] block">Duration</span>
                <span className="font-bold text-[#4B287F]">{(duration * 1000).toFixed(1)} ms</span>
              </div>
            </div>
          </div>
        </div>

        {/* Display Scopes & Metrics (Right 8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Electrical Measurement Cards Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-xl border border-[#E8E3EF] shadow-xs">
              <span className="text-[11px] text-[#77717F] block">Message RMS</span>
              <span className="text-base font-mono font-bold text-[#24212C]">
                {metrics.msgRms.toFixed(3)} <span className="text-xs font-normal">V</span>
              </span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-[#E8E3EF] shadow-xs">
              <span className="text-[11px] text-[#77717F] block">Message Vp-p</span>
              <span className="text-base font-mono font-bold text-[#24212C]">
                {metrics.msgVpp.toFixed(2)} <span className="text-xs font-normal">V</span>
              </span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-[#E8E3EF] shadow-xs">
              <span className="text-[11px] text-[#77717F] block">Message Period Tm</span>
              <span className="text-base font-mono font-bold text-[#24212C]">
                {metrics.msgPeriodMs.toFixed(2)} <span className="text-xs font-normal">ms</span>
              </span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-[#E8E3EF] shadow-xs">
              <span className="text-[11px] text-[#77717F] block">Carrier Period Tc</span>
              <span className="text-base font-mono font-bold text-[#4B287F]">
                {metrics.carPeriodUs.toFixed(1)} <span className="text-xs font-normal">μs</span>
              </span>
            </div>
          </div>

          {/* Time Domain Oscilloscope */}
          <ScientificScopeCanvas
            title="Time-Domain Oscilloscope: Message & Carrier Overlay"
            t={message.t}
            traces={[
              {
                id: 'message',
                name: `m(t): ${msgWaveType} (${fm} Hz)`,
                color: '#2563EB',
                data: message.samples,
              },
              {
                id: 'carrier',
                name: `c(t): ${(fc / 1000).toFixed(1)} kHz`,
                color: '#D97706',
                data: carrier.samples,
              },
            ]}
            height={260}
          />

          {/* Spectral Domain */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SpectrumAnalyzerCanvas
              title="Message Spectrum M(f)"
              spectrum={msgSpectrum}
              height={220}
            />
            <SpectrumAnalyzerCanvas
              title="Carrier Spectrum C(f)"
              spectrum={carSpectrum}
              height={220}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
