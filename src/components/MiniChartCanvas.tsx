import React, { useRef, useEffect, useState } from 'react';

export interface CurveSeries {
  id: string;
  label: string;
  color: string;
  x: number[];
  y: number[];
  lineDash?: number[];
}

export interface PointMarker {
  x: number;
  y: number;
  label: string;
  color?: string;
}

interface MiniChartProps {
  title: string;
  series: CurveSeries[];
  xLabel: string;
  yLabel: string;
  logX?: boolean;
  logY?: boolean;
  yRange?: [number, number];
  marker?: PointMarker;
  height?: number;
  xFormatter?: (v: number) => string;
  yFormatter?: (v: number) => string;
}

export const MiniChartCanvas: React.FC<MiniChartProps> = ({
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

    const padLeft = 64;
    const padRight = 18;
    const padTop = 18;
    const padBottom = 40;

    const plotW = Math.max(10, width - padLeft - padRight);
    const plotH = Math.max(10, height - padTop - padBottom);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#FAF9FD';
    ctx.fillRect(padLeft, padTop, plotW, plotH);

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
      const spanY = Math.max(0.1, maxY - minY);
      minY -= spanY * 0.1;
      maxY += spanY * 0.1;
    }

    const getX = (rawX: number) => padLeft + ((tx(rawX) - minX) / (maxX - minX || 1)) * plotW;
    const getY = (rawY: number) => padTop + plotH - ((ty(rawY) - minY) / (maxY - minY || 1)) * plotH;

    // Grid
    ctx.strokeStyle = '#E8E3EF';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.fillStyle = '#77717F';
    ctx.font = '10px "JetBrains Mono", monospace';

    const ySteps = 4;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= ySteps; i++) {
      const tVal = minY + (i / ySteps) * (maxY - minY);
      const rawVal = logY ? Math.pow(10, tVal) : tVal;
      const yPix = padTop + plotH - (i / ySteps) * plotH;
      ctx.beginPath();
      ctx.moveTo(padLeft, yPix);
      ctx.lineTo(padLeft + plotW, yPix);
      ctx.stroke();
      const lbl = yFormatter ? yFormatter(rawVal) : rawVal.toFixed(1);
      ctx.fillText(lbl, padLeft - 6, yPix);
    }

    const xSteps = 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= xSteps; i++) {
      const tVal = minX + (i / xSteps) * (maxX - minX);
      const rawVal = logX ? Math.pow(10, tVal) : tVal;
      const xPix = padLeft + (i / xSteps) * plotW;
      ctx.beginPath();
      ctx.moveTo(xPix, padTop);
      ctx.lineTo(xPix, padTop + plotH);
      ctx.stroke();
      const lbl = xFormatter ? xFormatter(rawVal) : rawVal.toFixed(1);
      ctx.fillText(lbl, xPix, padTop + plotH + 5);
    }

    ctx.setLineDash([]);
    ctx.strokeStyle = '#D9D0E6';
    ctx.strokeRect(padLeft, padTop, plotW, plotH);

    // Clip and plot curves
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
    });
    ctx.setLineDash([]);

    // Optional Point Marker
    if (marker) {
      const mx = getX(marker.x);
      const my = getY(marker.y);
      ctx.strokeStyle = marker.color || '#4B287F';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(mx, padTop);
      ctx.lineTo(mx, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = marker.color || '#7045B8';
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
      ctx.fillStyle = '#4B287F';
      ctx.fillRect(bx, by, tw, 18);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(marker.label, bx + tw / 2, by + 9);
    }

    ctx.restore();

    ctx.fillStyle = '#4B287F';
    ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(xLabel, padLeft + plotW / 2, height - 4);

    ctx.save();
    ctx.translate(14, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }, [series, xLabel, yLabel, logX, logY, yRange, marker, height, containerWidth, xFormatter, yFormatter]);

  return (
    <div className="bg-white border border-[#E8E3EF] rounded-xl p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-1.5 border-b border-[#F1EBFA]">
        <h3 className="text-xs font-bold text-[#24212C]">{title}</h3>
        <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-[#77717F]">
          {series.map((s) => (
            <span key={s.id} className="flex items-center gap-1">
              <span
                className="w-2.5 h-0.5 inline-block"
                style={{ backgroundColor: s.color }}
              />
              <span>{s.label}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="rounded-lg overflow-hidden border border-[#F1EBFA] bg-[#FAF9FD]">
        <canvas ref={canvasRef} style={{ width: '100%', height: `${height}px` }} className="block" />
      </div>
    </div>
  );
};
