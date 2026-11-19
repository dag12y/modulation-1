import React, { useEffect, useRef, useState } from 'react';
import { FFTSpectrum } from '../../dsp/types';

export interface SpectrumMarker {
  freqHz: number;
  label: string;
  color: string;
}

export interface SpectrumFilterOverlay {
  frequencies: Float32Array;
  magnitudesDb: Float32Array;
  color?: string;
  label?: string;
}

interface SpectrumCanvasProps {
  title: string;
  spectrum: FFTSpectrum;
  color?: string;
  height?: number;
  maxFreqHz?: number;
  minFreqHz?: number;
  markers?: SpectrumMarker[];
  bandwidthBand?: {
    startHz: number;
    endHz: number;
    label: string;
  };
  filterOverlay?: SpectrumFilterOverlay | null;
}

export const SpectrumCanvas: React.FC<SpectrumCanvasProps> = ({
  title,
  spectrum,
  color = '#0284C7',
  height = 195,
  maxFreqHz = 22050,
  minFreqHz = 0,
  markers = [],
  bandwidthBand,
  filterOverlay,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(560);
  const [hover, setHover] = useState<{ x: number; freqHz: number; db: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !spectrum || spectrum.frequencies.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || containerWidth;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Pure White Workspace Canvas
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    const padLeft = 42;
    const padRight = 14;
    const padTop = 18;
    const padBottom = 26;
    const plotW = Math.max(20, width - padLeft - padRight);
    const plotH = Math.max(20, height - padTop - padBottom);

    const minDb = -85;
    const maxDb = 5;
    const fLow = Math.max(0, minFreqHz);
    const fHigh = Math.min(spectrum.frequencies[spectrum.frequencies.length - 1] || 22050, maxFreqHz);

    const getX = (f: number) => padLeft + ((f - fLow) / Math.max(1, fHigh - fLow)) * plotW;
    const getY = (db: number) => padTop + plotH - ((db - minDb) / (maxDb - minDb)) * plotH;

    // Bandwidth band highlight
    if (bandwidthBand) {
      const bx0 = Math.max(padLeft, getX(bandwidthBand.startHz));
      const bx1 = Math.min(padLeft + plotW, getX(bandwidthBand.endHz));
      if (bx1 > bx0) {
        ctx.fillStyle = 'rgba(30, 70, 32, 0.08)';
        ctx.fillRect(bx0, padTop, bx1 - bx0, plotH);
        ctx.fillStyle = '#1E4620';
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(bandwidthBand.label, (bx0 + bx1) / 2, padTop + 3);
      }
    }

    // Horizontal dB grid
    const dbTicks = [-80, -60, -40, -20, 0];
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.fillStyle = '#64748B';
    ctx.font = '9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (const db of dbTicks) {
      const yp = getY(db);
      ctx.beginPath();
      ctx.moveTo(padLeft, yp);
      ctx.lineTo(padLeft + plotW, yp);
      ctx.stroke();
      ctx.fillText(`${db}`, padLeft - 6, yp);
    }

    // Vertical Hz grid
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xTicks = 5;
    for (let i = 0; i <= xTicks; i++) {
      const fv = fLow + (i / xTicks) * (fHigh - fLow);
      const xp = getX(fv);
      ctx.beginPath();
      ctx.moveTo(xp, padTop);
      ctx.lineTo(xp, padTop + plotH);
      ctx.stroke();
      const lbl = fv >= 1000 ? `${(fv / 1000).toFixed(1)}k` : `${Math.round(fv)}`;
      ctx.fillText(lbl, xp, padTop + plotH + 6);
    }
    ctx.setLineDash([]);

    // Spectrum trace
    ctx.save();
    ctx.beginPath();
    ctx.rect(padLeft, padTop, plotW, plotH);
    ctx.clip();

    const freqs = spectrum.frequencies;
    const dbs = spectrum.magnitudesDb;
    const numCols = Math.floor(plotW);

    ctx.beginPath();
    ctx.moveTo(padLeft, padTop + plotH);
    for (let col = 0; col < numCols; col++) {
      const f0 = fLow + (col / numCols) * (fHigh - fLow);
      const f1 = fLow + ((col + 1) / numCols) * (fHigh - fLow);
      const b0 = Math.max(0, Math.floor((f0 / (freqs[freqs.length - 1] || 1)) * (freqs.length - 1)));
      const b1 = Math.min(freqs.length - 1, Math.ceil((f1 / (freqs[freqs.length - 1] || 1)) * (freqs.length - 1)));
      let colMaxDb = -85;
      for (let b = b0; b <= b1; b++) {
        if (dbs[b] > colMaxDb) colMaxDb = dbs[b];
      }
      ctx.lineTo(padLeft + col, getY(colMaxDb));
    }
    ctx.lineTo(padLeft + plotW, padTop + plotH);
    ctx.closePath();
    ctx.fillStyle = `${color}1A`;
    ctx.fill();

    ctx.beginPath();
    for (let col = 0; col < numCols; col++) {
      const f0 = fLow + (col / numCols) * (fHigh - fLow);
      const f1 = fLow + ((col + 1) / numCols) * (fHigh - fLow);
      const b0 = Math.max(0, Math.floor((f0 / (freqs[freqs.length - 1] || 1)) * (freqs.length - 1)));
      const b1 = Math.min(freqs.length - 1, Math.ceil((f1 / (freqs[freqs.length - 1] || 1)) * (freqs.length - 1)));
      let colMaxDb = -85;
      for (let b = b0; b <= b1; b++) {
        if (dbs[b] > colMaxDb) colMaxDb = dbs[b];
      }
      const xp = padLeft + col;
      const yp = getY(colMaxDb);
      if (col === 0) ctx.moveTo(xp, yp);
      else ctx.lineTo(xp, yp);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.65;
    ctx.stroke();

    // Frequency component markers
    for (const m of markers) {
      if (m.freqHz < fLow || m.freqHz > fHigh) continue;
      const mx = getX(m.freqHz);
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(mx, padTop);
      ctx.lineTo(mx, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = m.color;
      ctx.font = '600 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(m.label, mx, padTop + 11);
    }

    // Filter frequency response |H(f)| overlay (in dB)
    if (filterOverlay && filterOverlay.frequencies.length > 1) {
      const ovCol = filterOverlay.color || '#EA580C';
      const ovFreqs = filterOverlay.frequencies;
      const ovDbs = filterOverlay.magnitudesDb;
      ctx.save();
      ctx.strokeStyle = ovCol;
      ctx.lineWidth = 1.9;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < ovFreqs.length; i++) {
        const f = ovFreqs[i];
        if (f < fLow || f > fHigh) continue;
        const xp = getX(f);
        const yp = getY(ovDbs[i]);
        if (!started) {
          ctx.moveTo(xp, yp);
          started = true;
        } else {
          ctx.lineTo(xp, yp);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (filterOverlay.label) {
        ctx.fillStyle = ovCol;
        ctx.font = '600 9.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(filterOverlay.label, padLeft + plotW - 6, padTop + 3);
      }
      ctx.restore();
    }

    ctx.restore();

    // Axis units
    ctx.fillStyle = '#64748B';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('dB', 6, padTop);
    ctx.textAlign = 'right';
    ctx.fillText('Hz', padLeft + plotW, padTop + plotH + 6);

    if (hover && hover.x >= padLeft && hover.x <= padLeft + plotW) {
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hover.x, padTop);
      ctx.lineTo(hover.x, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [spectrum, color, height, maxFreqHz, minFreqHz, markers, bandwidthBand, filterOverlay, containerWidth, hover]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !spectrum || spectrum.frequencies.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const padLeft = 42;
    const padRight = 14;
    const plotW = Math.max(1, rect.width - padLeft - padRight);
    if (mouseX < padLeft || mouseX > padLeft + plotW) {
      setHover(null);
      return;
    }
    const fLow = Math.max(0, minFreqHz);
    const fHigh = Math.min(spectrum.frequencies[spectrum.frequencies.length - 1] || 22050, maxFreqHz);
    const frac = (mouseX - padLeft) / plotW;
    const freqHz = fLow + frac * (fHigh - fLow);
    const idx = Math.min(
      spectrum.frequencies.length - 1,
      Math.max(0, Math.round((freqHz / (spectrum.frequencies[spectrum.frequencies.length - 1] || 1)) * (spectrum.frequencies.length - 1)))
    );
    setHover({
      x: mouseX,
      freqHz,
      db: spectrum.magnitudesDb[idx] ?? -85,
    });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-heading font-bold text-[#111827]">{title}</span>
        <span className="font-mono text-[10px] text-slate-500 tabular-nums">
          Peak {spectrum.peakFreqHz.toFixed(0)} Hz ({spectrum.peakDb.toFixed(1)} dB)
        </span>
      </div>

      <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-white">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: `${height}px` }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
          className="block cursor-crosshair"
        />
        {hover && (
          <div
            className="absolute top-2 pointer-events-none bg-white/95 border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-mono text-slate-800 shadow-md z-10 tabular-nums"
            style={{ left: Math.min(hover.x + 10, Math.max(8, containerWidth - 135)) }}
          >
            <div className="text-[#1E4620] font-semibold">{hover.freqHz.toFixed(1)} Hz</div>
            <div>{hover.db.toFixed(1)} dB</div>
          </div>
        )}
      </div>
    </div>
  );
};
