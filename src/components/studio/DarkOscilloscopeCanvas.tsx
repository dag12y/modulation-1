import React, { useRef, useEffect, useState } from 'react';

export interface DarkTrace {
  id: string;
  label: string;
  sublabel?: string;
  color: string;
  data: number[];
  lineDash?: number[];
  lineWidth?: number;
  overlayOnId?: string; // In stacked mode, optionally draw on the same lane as another trace
  zOrder?: 'back' | 'front';
}

interface DarkOscilloscopeProps {
  t: number[];
  traces: DarkTrace[];
  mode: 'stacked' | 'overlay';
  xUnitMultiplier?: number;
  xLabel?: string;
  height?: number;
  yBoundOverride?: number;
}

function stableYBound(rawMax: number): number {
  const padded = Math.max(0.5, rawMax * 1.15);
  // Quantize to 0.5V steps (or 0.25V if small) so discrete sample scrolling never jitters the Y-axis
  const step = padded <= 1.2 ? 0.5 : padded <= 3 ? 0.5 : 1.0;
  return Math.ceil(padded / step) * step;
}

export const DarkOscilloscopeCanvas: React.FC<DarkOscilloscopeProps> = ({
  t,
  traces,
  mode,
  xUnitMultiplier = 1000,
  xLabel = 'Time / ms',
  height = 360,
  yBoundOverride,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const laneYBoundRef = useRef<Record<string, number>>({});
  const [containerWidth, setContainerWidth] = useState<number>(600);
  const [hover, setHover] = useState<{
    x: number;
    tVal: number;
    values: { label: string; color: string; val: number }[];
  } | null>(null);

  const dedupedTraces = React.useMemo(() => {
    const seen = new Set<string>();
    const ordered = [
      ...traces.filter((tr) => !tr.overlayOnId),
      ...traces.filter((tr) => Boolean(tr.overlayOnId)),
    ];
    return ordered.filter((tr) => {
      if (seen.has(tr.label)) return false;
      seen.add(tr.label);
      return true;
    });
  }, [traces]);

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
    if (!canvas || !t || t.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || containerWidth;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Crisp pure white simulation canvas background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    const padLeft = 40;
    const padRight = 14;
    const padTop = 14;
    const padBottom = 26;
    const plotW = Math.max(20, width - padLeft - padRight);
    const plotH = Math.max(20, height - padTop - padBottom);

    const tMin = t[0];
    const tMax = t[t.length - 1] || 1;
    const getX = (tv: number) => padLeft + ((tv - tMin) / (tMax - tMin || 1)) * plotW;

    const primaryTraces =
      mode === 'stacked' ? traces.filter((tr) => !tr.overlayOnId) : traces;

    // Vertical time grid lines
    const xDivs = 4;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.fillStyle = '#64748B';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let i = 0; i <= xDivs; i++) {
      const frac = i / xDivs;
      const xPix = padLeft + frac * plotW;
      ctx.beginPath();
      ctx.moveTo(xPix, padTop);
      ctx.lineTo(xPix, padTop + plotH);
      ctx.stroke();

      const tVal = (tMin + frac * (tMax - tMin)) * xUnitMultiplier;
      const unitStr = xUnitMultiplier === 1000 ? 'ms' : 's';
      ctx.fillText(
        `${tVal.toFixed(tVal < 10 && tVal % 1 !== 0 ? 1 : 0)} ${unitStr}`,
        xPix,
        padTop + plotH + 7
      );
    }
    ctx.setLineDash([]);

    if (mode === 'stacked' && primaryTraces.length > 0) {
      const laneGap = 12;
      const laneH = (plotH - laneGap * (primaryTraces.length - 1)) / primaryTraces.length;

      primaryTraces.forEach((laneTrace, laneIdx) => {
        const laneTop = padTop + laneIdx * (laneH + laneGap);
        const laneMid = laneTop + laneH / 2;

        const attachedOverlays = traces.filter((tr) => tr.overlayOnId === laneTrace.id);
        const backOverlays = attachedOverlays.filter((tr) => tr.zOrder === 'back');
        const frontOverlays = attachedOverlays.filter((tr) => tr.zOrder !== 'back');
        const laneTraces = [...backOverlays, laneTrace, ...frontOverlays];

        let maxAbs = 0.2;
        laneTraces.forEach((tr) => {
          for (let i = 0; i < tr.data.length; i++) {
            const a = Math.abs(tr.data[i]);
            if (isFinite(a) && a > maxAbs) maxAbs = a;
          }
        });
        const candidateBound = stableYBound(maxAbs);
        const prevBound = laneYBoundRef.current[laneTrace.id];
        let yMax = candidateBound;
        if (yBoundOverride && yBoundOverride > 0) {
          yMax = yBoundOverride;
        } else if (prevBound !== undefined) {
          if (maxAbs * 1.06 > prevBound || maxAbs * 1.55 < prevBound) {
            yMax = candidateBound;
          } else {
            yMax = prevBound;
          }
        }
        laneYBoundRef.current[laneTrace.id] = yMax;

        const drawTop = laneTop + 15;
        const drawH = Math.max(16, laneH - 15);
        const drawMid = drawTop + drawH / 2;

        // Lane horizontal guides
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(padLeft, drawTop);
        ctx.lineTo(padLeft + plotW, drawTop);
        ctx.moveTo(padLeft, drawMid);
        ctx.lineTo(padLeft + plotW, drawMid);
        ctx.moveTo(padLeft, drawTop + drawH);
        ctx.lineTo(padLeft + plotW, drawTop + drawH);
        ctx.stroke();
        ctx.setLineDash([]);

        // Zero axis slightly crisper
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.14)';
        ctx.beginPath();
        ctx.moveTo(padLeft, drawMid);
        ctx.lineTo(padLeft + plotW, drawMid);
        ctx.stroke();

        // Lane Header + inline overlay legend labels
        ctx.fillStyle = laneTrace.color;
        ctx.font = '600 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(laneTrace.label, padLeft, laneTop - 2);

        let labelCursorX = padLeft + ctx.measureText(laneTrace.label).width + 10;
        ctx.font = '500 10px "JetBrains Mono", monospace';
        const sublabelW = laneTrace.sublabel
          ? ctx.measureText(laneTrace.sublabel).width + 12
          : 0;
        attachedOverlays.forEach((ov) => {
          const text = `+ ${ov.label}`;
          const tw = ctx.measureText(text).width;
          if (labelCursorX + tw < padLeft + plotW - sublabelW) {
            ctx.fillStyle = ov.color;
            ctx.fillText(text, labelCursorX, laneTop - 1);
            labelCursorX += tw + 10;
          }
        });

        if (laneTrace.sublabel) {
          ctx.fillStyle = '#64748B';
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.textAlign = 'right';
          ctx.fillText(laneTrace.sublabel, padLeft + plotW, laneTop - 1);
        }

        // Y-axis ticks
        ctx.fillStyle = '#64748B';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${yMax.toFixed(1)}`, padLeft - 6, drawTop + 2);
        ctx.fillText('0', padLeft - 6, drawMid);
        ctx.fillText(`-${yMax.toFixed(1)}`, padLeft - 6, drawTop + drawH - 2);

        // Plot traces in lane
        ctx.save();
        ctx.beginPath();
        ctx.rect(padLeft, drawTop - 2, plotW, drawH + 4);
        ctx.clip();

        laneTraces.forEach((tr) => {
          ctx.beginPath();
          ctx.strokeStyle = tr.color;
          ctx.lineWidth = tr.lineWidth ?? (tr.lineDash ? 1.45 : 1.9);
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.setLineDash(tr.lineDash || []);
          const count = Math.min(t.length, tr.data.length);
          for (let i = 0; i < count; i++) {
            const xp = getX(t[i]);
            const yp = drawMid - (tr.data[i] / (yMax || 1)) * (drawH / 2);
            if (i === 0) ctx.moveTo(xp, yp);
            else ctx.lineTo(xp, yp);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        });

        ctx.restore();
      });
    } else {
      let maxAbs = 0.2;
      dedupedTraces.forEach((tr) => {
        for (let i = 0; i < tr.data.length; i++) {
          const a = Math.abs(tr.data[i]);
          if (isFinite(a) && a > maxAbs) maxAbs = a;
        }
      });
      const candidateOverlayBound = stableYBound(maxAbs);
      const prevOverlayBound = laneYBoundRef.current['__overlay__'];
      let yMax = candidateOverlayBound;
      if (yBoundOverride && yBoundOverride > 0) {
        yMax = yBoundOverride;
      } else if (prevOverlayBound !== undefined) {
        if (maxAbs * 1.06 > prevOverlayBound || maxAbs * 1.55 < prevOverlayBound) {
          yMax = candidateOverlayBound;
        } else {
          yMax = prevOverlayBound;
        }
      }
      laneYBoundRef.current['__overlay__'] = yMax;
      const midY = padTop + plotH / 2;

      ctx.strokeStyle = 'rgba(15, 23, 42, 0.09)';
      ctx.setLineDash([2, 3]);
      [padTop, padTop + plotH * 0.25, midY, padTop + plotH * 0.75, padTop + plotH].forEach((yp) => {
        ctx.beginPath();
        ctx.moveTo(padLeft, yp);
        ctx.lineTo(padLeft + plotW, yp);
        ctx.stroke();
      });
      ctx.setLineDash([]);

      ctx.fillStyle = '#64748B';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${yMax.toFixed(1)}`, padLeft - 6, padTop + 4);
      ctx.fillText('0', padLeft - 6, midY);
      ctx.fillText(`-${yMax.toFixed(1)}`, padLeft - 6, padTop + plotH - 4);

      ctx.save();
      ctx.beginPath();
      ctx.rect(padLeft, padTop, plotW, plotH);
      ctx.clip();

      dedupedTraces.forEach((tr) => {
        ctx.beginPath();
        ctx.strokeStyle = tr.color;
        ctx.lineWidth = tr.lineDash ? 1.6 : 1.9;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash(tr.lineDash || []);
        const count = Math.min(t.length, tr.data.length);
        for (let i = 0; i < count; i++) {
          const xp = getX(t[i]);
          const yp = midY - (tr.data[i] / (yMax || 1)) * (plotH / 2);
          if (i === 0) ctx.moveTo(xp, yp);
          else ctx.lineTo(xp, yp);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      });

      ctx.restore();
    }

    if (hover && hover.x >= padLeft && hover.x <= padLeft + plotW) {
      ctx.strokeStyle = 'rgba(30, 70, 32, 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hover.x, padTop);
      ctx.lineTo(hover.x, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = '#64748B';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(xLabel, padLeft + plotW, height - 2);
  }, [t, traces, dedupedTraces, mode, height, containerWidth, hover, xUnitMultiplier, xLabel, yBoundOverride]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !t || t.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const padLeft = 40;
    const padRight = 14;
    const plotW = rect.width - padLeft - padRight;

    if (mouseX >= padLeft && mouseX <= padLeft + plotW) {
      const frac = (mouseX - padLeft) / plotW;
      const tVal = t[0] + frac * (t[t.length - 1] - t[0]);
      const idx = Math.min(t.length - 1, Math.max(0, Math.round(frac * (t.length - 1))));
      setHover({
        x: mouseX,
        tVal,
        values: dedupedTraces.map((tr) => ({
          label: tr.label,
          color: tr.color,
          val: tr.data[idx] ?? 0,
        })),
      });
    } else {
      setHover(null);
    }
  };

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px` }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        className="block cursor-crosshair rounded-lg"
      />
      {hover && (
        <div
          className="absolute top-2 pointer-events-none bg-white/95 border border-slate-200 rounded-lg px-2.5 py-2 text-[11px] font-mono text-slate-700 shadow-lg z-20 tabular-nums"
          style={{ left: Math.min(hover.x + 12, Math.max(10, containerWidth - 185)) }}
        >
          <div className="text-[#1E4620] font-semibold mb-1">
            t = {(hover.tVal * xUnitMultiplier).toFixed(2)} {xUnitMultiplier === 1000 ? 'ms' : 's'}
          </div>
          {hover.values.map((v, idx) => (
            <div key={idx} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color }} />
                {v.label}
              </span>
              <span className="text-slate-900 font-semibold">{v.val.toFixed(2)} V</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
