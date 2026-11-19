import React, { useRef, useEffect, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Download, Eye, EyeOff } from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';

export interface TraceData {
  id: string;
  name: string;
  color: string;
  data: number[];
  lineDash?: number[];
  visible?: boolean;
  lineWidth?: number;
}

interface ScopeProps {
  title?: string;
  t: number[];
  traces: TraceData[];
  yLabel?: string;
  xLabel?: string;
  xUnitMultiplier?: number;
  height?: number;
  autoScaleY?: boolean;
  fixedYRange?: [number, number];
  showGrid?: boolean;
}

export const ScientificScopeCanvas: React.FC<ScopeProps> = ({
  title,
  t,
  traces,
  yLabel = 'Amplitude (V)',
  xLabel = 'Time (ms)',
  xUnitMultiplier = 1000,
  height = 240,
  autoScaleY = true,
  fixedYRange = [-5, 5],
  showGrid = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { isSimulating, animTime, frame } = useSimulation();
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [containerWidth, setContainerWidth] = useState<number>(600);
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    tVal: number;
    vals: { name: string; val: number; color: string }[];
  } | null>(null);
  const [traceVisibility, setTraceVisibility] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setTraceVisibility((prev) => {
      const next: Record<string, boolean> = {};
      traces.forEach((tr) => {
        next[tr.id] = prev[tr.id] !== undefined ? prev[tr.id] : tr.visible !== false;
      });
      return next;
    });
  }, [traces]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const toggleTrace = (id: string) => {
    setTraceVisibility((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !t || t.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || containerWidth;
    const canvasHeight = height;

    canvas.width = width * dpr;
    canvas.height = canvasHeight * dpr;
    ctx.scale(dpr, dpr);

    const padLeft = 72;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 46;

    const plotW = Math.max(10, width - padLeft - padRight);
    const plotH = Math.max(10, canvasHeight - padTop - padBottom);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, canvasHeight);

    ctx.fillStyle = '#FAF9FD';
    ctx.fillRect(padLeft, padTop, plotW, plotH);

    let minY = fixedYRange[0];
    let maxY = fixedYRange[1];

    if (autoScaleY) {
      let dataMin = Infinity;
      let dataMax = -Infinity;
      traces.forEach((tr) => {
        if (traceVisibility[tr.id] === false) return;
        for (let i = 0; i < tr.data.length; i++) {
          const v = tr.data[i];
          if (!isNaN(v) && isFinite(v)) {
            if (v < dataMin) dataMin = v;
            if (v > dataMax) dataMax = v;
          }
        }
      });
      if (dataMin !== Infinity && dataMax !== -Infinity) {
        const span = Math.max(0.5, dataMax - dataMin);
        const margin = span * 0.14;
        minY = dataMin - margin;
        maxY = dataMax + margin;
      }
    }

    if (maxY <= minY) {
      maxY = minY + 1;
    }

    const totalT = (t[t.length - 1] - t[0]) / zoomLevel;
    const tMin = t[0];
    const tMax = tMin + totalT;

    const getX = (timeVal: number) => padLeft + ((timeVal - tMin) / (tMax - tMin || 1)) * plotW;
    const getY = (val: number) => padTop + plotH - ((val - minY) / (maxY - minY)) * plotH;

    if (showGrid) {
      ctx.strokeStyle = '#E8E3EF';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      const ySteps = 4;
      ctx.fillStyle = '#77717F';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (let i = 0; i <= ySteps; i++) {
        const yVal = minY + (i / ySteps) * (maxY - minY);
        const yPixel = getY(yVal);
        ctx.beginPath();
        ctx.moveTo(padLeft, yPixel);
        ctx.lineTo(padLeft + plotW, yPixel);
        ctx.stroke();
        ctx.fillText(yVal.toFixed(1), padLeft - 8, yPixel);
      }

      const xSteps = 6;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      for (let i = 0; i <= xSteps; i++) {
        const tVal = tMin + (i / xSteps) * (tMax - tMin);
        const xPixel = getX(tVal);
        ctx.beginPath();
        ctx.moveTo(xPixel, padTop);
        ctx.lineTo(xPixel, padTop + plotH);
        ctx.stroke();

        const scaled = tVal * xUnitMultiplier;
        ctx.fillText(scaled.toFixed(2), xPixel, padTop + plotH + 6);
      }

      if (minY <= 0 && maxY >= 0) {
        const zeroY = getY(0);
        ctx.setLineDash([]);
        ctx.strokeStyle = '#C4B5E6';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(padLeft, zeroY);
        ctx.lineTo(padLeft + plotW, zeroY);
        ctx.stroke();
      }
    }

    ctx.setLineDash([]);
    ctx.strokeStyle = '#D9D0E6';
    ctx.lineWidth = 1;
    ctx.strokeRect(padLeft, padTop, plotW, plotH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(padLeft, padTop, plotW, plotH);
    ctx.clip();

    traces.forEach((tr) => {
      if (traceVisibility[tr.id] === false) return;
      if (!tr.data || tr.data.length === 0) return;

      ctx.beginPath();
      ctx.strokeStyle = tr.color;
      ctx.lineWidth = tr.lineWidth ?? (tr.lineDash ? 1.6 : 1.9);
      ctx.setLineDash(tr.lineDash || []);

      let started = false;
      const count = Math.min(t.length, tr.data.length);

      for (let i = 0; i < count; i++) {
        const curT = t[i];
        if (curT > tMax) break;
        const xPix = getX(curT);
        const yPix = getY(tr.data[i]);

        if (!started) {
          ctx.moveTo(xPix, yPix);
          started = true;
        } else {
          ctx.lineTo(xPix, yPix);
        }
      }
      ctx.stroke();
    });

    if (hoverInfo && hoverInfo.x >= padLeft && hoverInfo.x <= padLeft + plotW) {
      ctx.strokeStyle = '#4B287F';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hoverInfo.x, padTop);
      ctx.lineTo(hoverInfo.x, padTop + plotH);
      ctx.stroke();
    }

    ctx.restore();

    ctx.fillStyle = '#4B287F';
    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(xLabel, padLeft + plotW / 2, canvasHeight - 6);

    ctx.save();
    ctx.translate(16, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }, [
    t,
    traces,
    height,
    zoomLevel,
    autoScaleY,
    fixedYRange,
    showGrid,
    traceVisibility,
    hoverInfo,
    isSimulating,
    animTime,
    frame,
    containerWidth,
    xLabel,
    yLabel,
    xUnitMultiplier,
  ]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !t || t.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const padLeft = 72;
    const padRight = 20;
    const plotW = rect.width - padLeft - padRight;

    if (mouseX >= padLeft && mouseX <= padLeft + plotW) {
      const totalT = (t[t.length - 1] - t[0]) / zoomLevel;
      const fraction = (mouseX - padLeft) / plotW;
      const tVal = t[0] + fraction * totalT;

      const idx = Math.min(
        t.length - 1,
        Math.max(0, Math.floor(((tVal - t[0]) / (t[t.length - 1] - t[0] || 1)) * t.length))
      );

      const vals = traces
        .filter((tr) => traceVisibility[tr.id] !== false)
        .map((tr) => ({
          name: tr.name,
          val: tr.data[idx] !== undefined ? tr.data[idx] : 0,
          color: tr.color,
        }));

      setHoverInfo({
        x: mouseX,
        y: mouseY,
        tVal,
        vals,
      });
    } else {
      setHoverInfo(null);
    }
  };

  const handleExportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${title ? title.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'modulab-scope'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="bg-white border border-[#E8E3EF] rounded-xl p-3.5 relative">
      {/* Compact Scope Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 pb-2 border-b border-[#F1EBFA]">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {title && <h3 className="text-xs font-bold text-[#24212C] whitespace-nowrap">{title}</h3>}
          <div className="flex flex-wrap items-center gap-1.5">
            {traces.map((tr) => {
              const isVisible = traceVisibility[tr.id] !== false;
              return (
                <button
                  key={tr.id}
                  onClick={() => toggleTrace(tr.id)}
                  className={`flex items-center gap-1.5 px-2 py-0.5 text-[11px] rounded border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    isVisible
                      ? 'bg-[#F1EBFA] border-[#7045B8]/30 text-[#4B287F] font-medium'
                      : 'bg-[#F8F7FB] border-[#E8E3EF] text-[#77717F] opacity-60'
                  }`}
                  title={`Toggle ${tr.name}`}
                >
                  <span
                    className="w-2 h-2 rounded-full inline-block shrink-0"
                    style={{ backgroundColor: tr.color }}
                  />
                  <span>{tr.name}</span>
                  {isVisible ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] font-mono text-[#77717F] mr-1 tabular-nums">
            {zoomLevel.toFixed(1)}x
          </span>
          <div className="flex items-center gap-0.5 bg-[#F8F7FB] p-0.5 rounded-lg border border-[#E8E3EF]">
            <button
              onClick={() => setZoomLevel((z) => Math.min(z * 1.5, 10))}
              className="p-1 text-[#77717F] hover:text-[#7045B8] hover:bg-white rounded transition-colors cursor-pointer"
              title="Zoom in Time"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel((z) => Math.max(z / 1.5, 1))}
              className="p-1 text-[#77717F] hover:text-[#7045B8] hover:bg-white rounded transition-colors cursor-pointer"
              title="Zoom out Time"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel(1)}
              className="p-1 text-[#77717F] hover:text-[#7045B8] hover:bg-white rounded transition-colors cursor-pointer"
              title="Reset Zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleExportPNG}
              className="p-1 text-[#77717F] hover:text-[#7045B8] hover:bg-white rounded transition-colors cursor-pointer"
              title="Export Snapshot PNG"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Canvas Container */}
      <div className="relative w-full overflow-hidden rounded-lg border border-[#F1EBFA] bg-[#FAF9FD]">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: `${height}px` }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverInfo(null)}
          className="cursor-crosshair block"
        />

        {hoverInfo && (
          <div
            className="absolute top-2 pointer-events-none bg-white/95 border border-[#7045B8]/30 shadow-md rounded-md p-2 text-[11px] font-mono z-20 tabular-nums"
            style={{
              left: Math.min(hoverInfo.x + 12, (canvasRef.current?.clientWidth || 300) - 185),
            }}
          >
            <div className="text-[#4B287F] font-semibold mb-1">
              {(hoverInfo.tVal * xUnitMultiplier).toFixed(3)} {xUnitMultiplier === 1000 ? 'ms' : 's'}
            </div>
            {hoverInfo.vals.map((v, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1 text-[#77717F]">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: v.color }} />
                  {v.name}:
                </span>
                <span className="font-semibold text-[#24212C]">{v.val.toFixed(3)} V</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
