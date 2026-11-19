import React, { useRef, useEffect } from 'react';
import { useSimulation } from '../context/SimulationContext';

interface EyeProps {
  title?: string;
  signal: number[];
  samplesPerSymbol: number;
  height?: number;
  numTraces?: number;
}

export const EyeDiagramCanvas: React.FC<EyeProps> = ({
  title = 'Eye Diagram Analysis',
  signal,
  samplesPerSymbol,
  height = 200,
  numTraces = 35,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { isSimulating, frame } = useSimulation();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !signal || signal.length < samplesPerSymbol * 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Generous margins preventing text collision
    const padLeft = 68;
    const padRight = 24;
    const padTop = 26;
    const padBottom = 48;

    const plotW = Math.max(10, width - padLeft - padRight);
    const plotH = Math.max(10, height - padTop - padBottom);

    // Clear
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#FAF9FD';
    ctx.fillRect(padLeft, padTop, plotW, plotH);

    // Eye span is 2 symbol periods: 2 * samplesPerSymbol
    const spanSamples = samplesPerSymbol * 2;

    // Find min and max
    let minVal = -1.2;
    let maxVal = 1.2;
    for (let i = 0; i < Math.min(signal.length, spanSamples * numTraces); i++) {
      if (signal[i] < minVal) minVal = signal[i];
      if (signal[i] > maxVal) maxVal = signal[i];
    }
    const margin = (maxVal - minVal) * 0.15;
    minVal -= margin;
    maxVal += margin;

    const getX = (sampleIdx: number) => padLeft + (sampleIdx / spanSamples) * plotW;
    const getY = (val: number) => padTop + plotH - ((val - minVal) / (maxVal - minVal)) * plotH;

    // Grids
    ctx.strokeStyle = '#E8E3EF';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    // Optimum sampling instant vertical lines (at 0.5 T and 1.5 T)
    const optX1 = getX(samplesPerSymbol * 0.5);
    const optX2 = getX(samplesPerSymbol * 1.5);
    ctx.strokeStyle = '#C4B5E6';
    ctx.beginPath();
    ctx.moveTo(optX1, padTop);
    ctx.lineTo(optX1, padTop + plotH);
    ctx.moveTo(optX2, padTop);
    ctx.lineTo(optX2, padTop + plotH);
    ctx.stroke();

    // Zero line
    const zeroY = getY(0);
    ctx.strokeStyle = '#D9D0E6';
    ctx.beginPath();
    ctx.moveTo(padLeft, zeroY);
    ctx.lineTo(padLeft + plotW, zeroY);
    ctx.stroke();

    // Draw eye traces with live sweep animation
    ctx.save();
    ctx.beginPath();
    ctx.rect(padLeft, padTop, plotW, plotH);
    ctx.clip();

    ctx.lineWidth = 1.2;
    ctx.setLineDash([]);

    const totalAvailableSpans = Math.floor(signal.length / spanSamples);
    const traceCount = Math.min(numTraces, totalAvailableSpans);
    // Cycle starting offset based on animation frame for real-time live phosphor trace sweeping
    const offsetTrace = isSimulating ? (frame % Math.max(1, totalAvailableSpans - traceCount)) : 0;

    for (let t = 0; t < traceCount; t++) {
      const startIdx = ((t + offsetTrace) % totalAvailableSpans) * spanSamples;

      // Real phosphor decay: most recent traces are brightest
      const alpha = 0.15 + (t / traceCount) * 0.45;
      ctx.strokeStyle = `rgba(112, 69, 184, ${alpha})`;

      ctx.beginPath();
      for (let s = 0; s < spanSamples; s++) {
        const idx = startIdx + s;
        if (idx >= signal.length) break;
        const xPix = getX(s);
        const yPix = getY(signal[idx]);
        if (s === 0) ctx.moveTo(xPix, yPix);
        else ctx.lineTo(xPix, yPix);
      }
      ctx.stroke();
    }

    ctx.restore();

    // Border
    ctx.strokeStyle = '#D9D0E6';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(padLeft, padTop, plotW, plotH);

    // Labels - clean gap, no collision
    ctx.fillStyle = '#4B287F';
    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Time (2 · Symbol Intervals 2Ts)', padLeft + plotW / 2, height - 8);

    ctx.save();
    ctx.translate(18, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Amplitude (V)', 0, 0);
    ctx.restore();
  }, [signal, samplesPerSymbol, height, numTraces, isSimulating, frame]);

  return (
    <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs relative">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-[#F1EBFA] pb-2.5">
        <h3 className="text-sm font-semibold text-[#24212C]">{title}</h3>
        {isSimulating ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
            ● SWEEPING SYMBOLS
          </span>
        ) : (
          <span className="text-xs text-[#77717F] font-mono">2-Symbol Window</span>
        )}
      </div>

      <div className="relative w-full overflow-hidden rounded-lg border border-[#F1EBFA] bg-[#FAF9FD]">
        <canvas ref={canvasRef} style={{ width: '100%', height: `${height}px` }} className="block" />
      </div>
    </div>
  );
};
