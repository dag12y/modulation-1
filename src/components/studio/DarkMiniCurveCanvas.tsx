import React, { useRef, useEffect, useState } from 'react';
import { LatexText } from './Latex';

export interface DarkCurveSeries {
  id: string;
  label: string;
  color: string;
  x: number[];
  y: number[];
  lineDash?: number[];
}

export interface DarkCurveMarker {
  x: number;
  y: number;
  label: string;
  color?: string;
}

interface DarkMiniCurveProps {
  title?: string;
  series: DarkCurveSeries[];
  xLabel: string;
  yLabel: string;
  logX?: boolean;
  logY?: boolean;
  yRange?: [number, number];
  marker?: DarkCurveMarker;
  height?: number;
  xFormatter?: (v: number) => string;
  yFormatter?: (v: number) => string;
}

export const DarkMiniCurveCanvas: React.FC<DarkMiniCurveProps> = ({
  title,
  series,
  xLabel,
  yLabel,
  logX = false,
  logY = false,
  yRange,
  marker,
  height = 195,
  xFormatter,
  yFormatter,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(400);

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
    if (!canvas || series.length === 0 || series[0].x.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || containerWidth;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    const padLeft = 58;
    const padRight = 18;
    const padTop = 16;
    const padBottom = 34;
    const plotW = Math.max(20, width - padLeft - padRight);
    const plotH = Math.max(20, height - padTop - padBottom);

    const tx = (v: number) => (logX ? Math.log10(Math.max(1e-9, v)) : v);
    const ty = (v: number) => (logY ? Math.log10(Math.max(1e-9, v)) : v);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = yRange ? ty(yRange[0]) : Infinity;
    let maxY = yRange ? ty(yRange[1]) : -Infinity;

    series.forEach((s) => {
      for (let i = 0; i < s.x.length; i++) {
        const xv = tx(s.x[i]);
        const yv = ty(s.y[i]);
        if (xv < minX) minX = xv;
        if (xv > maxX) maxX = xv;
        if (!yRange) {
          if (yv < minY) minY = yv;
          if (yv > maxY) maxY = yv;
        }
      }
    });

    if (!yRange) {
      const span = Math.max(0.1, maxY - minY);
      minY -= span * 0.1;
      maxY += span * 0.1;
    }

    const getX = (rawX: number) => padLeft + ((tx(rawX) - minX) / (maxX - minX || 1)) * plotW;
    const getY = (rawY: number) => padTop + plotH - ((ty(rawY) - minY) / (maxY - minY || 1)) * plotH;

    // Dotted Grid
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.fillStyle = '#64748B';
    ctx.font = '9px "JetBrains Mono", monospace';

    const ySteps = 4;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= ySteps; i++) {
      const tVal = minY + (i / ySteps) * (maxY - minY);
      const rawVal = logY ? Math.pow(10, tVal) : tVal;
      const yp = padTop + plotH - (i / ySteps) * plotH;
      ctx.beginPath();
      ctx.moveTo(padLeft, yp);
      ctx.lineTo(padLeft + plotW, yp);
      ctx.stroke();
      ctx.fillText(yFormatter ? yFormatter(rawVal) : rawVal.toFixed(1), padLeft - 6, yp);
    }

    const xSteps = 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= xSteps; i++) {
      const tVal = minX + (i / xSteps) * (maxX - minX);
      const rawVal = logX ? Math.pow(10, tVal) : tVal;
      const xp = padLeft + (i / xSteps) * plotW;
      ctx.beginPath();
      ctx.moveTo(xp, padTop);
      ctx.lineTo(xp, padTop + plotH);
      ctx.stroke();
      ctx.fillText(xFormatter ? xFormatter(rawVal) : rawVal.toFixed(1), xp, padTop + plotH + 5);
    }
    ctx.setLineDash([]);

    ctx.save();
    ctx.beginPath();
    ctx.rect(padLeft, padTop, plotW, plotH);
    ctx.clip();

    series.forEach((s) => {
      ctx.beginPath();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.setLineDash(s.lineDash || []);
      for (let i = 0; i < s.x.length; i++) {
        const xp = getX(s.x[i]);
        const yp = getY(s.y[i]);
        if (i === 0) ctx.moveTo(xp, yp);
        else ctx.lineTo(xp, yp);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    });

    if (marker) {
      const mx = getX(marker.x);
      const my = getY(marker.y);
      ctx.fillStyle = marker.color || '#1E4620';
      ctx.beginPath();
      ctx.arc(mx, my, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = '600 10px "JetBrains Mono", monospace';
      const tw = ctx.measureText(marker.label).width + 10;
      const bx = Math.min(padLeft + plotW - tw - 4, Math.max(padLeft + 4, mx + 8));
      const by = Math.max(padTop + 4, Math.min(padTop + plotH - 22, my - 10));
      ctx.fillStyle = '#EFF3EB';
      ctx.fillRect(bx, by, tw, 18);
      ctx.strokeStyle = marker.color || '#1E4620';
      ctx.strokeRect(bx, by, tw, 18);
      ctx.fillStyle = '#111827';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(marker.label, bx + tw / 2, by + 9);
    }

    ctx.restore();

    ctx.fillStyle = '#64748B';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${xLabel}  (${yLabel})`, padLeft + plotW / 2, height - 3);
  }, [series, xLabel, yLabel, logX, logY, yRange, marker, height, containerWidth, xFormatter, yFormatter]);

  return (
    <div className="space-y-2">
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-800">
            <LatexText text={title} />
          </span>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            {series.map((s) => (
              <span key={s.id} className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 inline-block" style={{ backgroundColor: s.color }} />
                <LatexText text={s.label} />
              </span>
            ))}
          </div>
        </div>
      )}
      <canvas ref={canvasRef} style={{ width: '100%', height: `${height}px` }} className="block rounded-lg" />
    </div>
  );
};
