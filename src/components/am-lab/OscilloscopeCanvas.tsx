import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { LAB_SAMPLE_RATE } from '../../dsp/types';

export interface ScopeOverlay {
  label: string;
  color: string;
  data: Float32Array;
  dashed?: boolean;
}

interface OscilloscopeCanvasProps {
  title: string;
  formula?: string;
  description?: string;
  data: Float32Array;
  color: string;
  sampleRate?: number;
  overlays?: ScopeOverlay[];
  height?: number;
  highlighted?: boolean;
  isPlaying?: boolean;
  playbackTimeSec?: number;
  onTogglePlay?: () => void;
  onSeek?: (timeSec: number) => void;
  defaultZoom?: number;
  badgeText?: string;
}

const ZOOM_STEPS = [1, 4, 20, 80, 300, 1000];

export const OscilloscopeCanvas: React.FC<OscilloscopeCanvasProps> = ({
  title,
  formula,
  description,
  data,
  color,
  sampleRate = LAB_SAMPLE_RATE,
  overlays = [],
  height = 172,
  highlighted = false,
  isPlaying = false,
  playbackTimeSec = 0,
  onTogglePlay,
  onSeek,
  defaultZoom = 1,
  badgeText,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(560);
  const [zoom, setZoom] = useState<number>(defaultZoom);
  const [panFrac, setPanFrac] = useState<number>(0);
  const [hover, setHover] = useState<{
    x: number;
    timeSec: number;
    amp: number;
    overlayVals: { label: string; color: string; val: number }[];
  } | null>(null);

  const totalDurationSec = data.length / sampleRate;
  const visibleDurationSec = totalDurationSec / zoom;
  const maxStartSec = Math.max(0, totalDurationSec - visibleDurationSec);

  const startSec = useMemo(() => {
    if (zoom <= 1) return 0;
    if (
      isPlaying &&
      (playbackTimeSec < panFrac * maxStartSec ||
        playbackTimeSec > panFrac * maxStartSec + visibleDurationSec)
    ) {
      return Math.min(maxStartSec, Math.max(0, playbackTimeSec - visibleDurationSec * 0.2));
    }
    return panFrac * maxStartSec;
  }, [zoom, isPlaying, playbackTimeSec, panFrac, maxStartSec, visibleDurationSec]);

  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const visibleSamples = Math.max(32, Math.floor(visibleDurationSec * sampleRate));
  const endSample = Math.min(data.length, startSample + visibleSamples);

  const yMax = useMemo(() => {
    let peak = 0.25;
    const step = Math.max(1, Math.floor(data.length / 2000));
    for (let i = 0; i < data.length; i += step) {
      const a = Math.abs(data[i]);
      if (Number.isFinite(a) && a > peak) peak = a;
    }
    for (const ov of overlays) {
      const ovStep = Math.max(1, Math.floor(ov.data.length / 1000));
      for (let i = 0; i < ov.data.length; i += ovStep) {
        const a = Math.abs(ov.data[i]);
        if (Number.isFinite(a) && a > peak) peak = a;
      }
    }
    const padded = peak * 1.15;
    return padded <= 1.2 ? Math.ceil(padded * 4) / 4 : Math.ceil(padded * 2) / 2;
  }, [data, overlays]);

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
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || containerWidth;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Crisp Pure White Workspace Canvas
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    const padLeft = 44;
    const padRight = 12;
    const padTop = 12;
    const padBottom = 24;
    const plotW = Math.max(20, width - padLeft - padRight);
    const plotH = Math.max(20, height - padTop - padBottom);
    const midY = padTop + plotH / 2;

    // Subtle Grid Lines
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);

    const yDivs = 4;
    ctx.fillStyle = '#64748B';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= yDivs; i++) {
      const frac = i / yDivs;
      const yp = padTop + frac * plotH;
      ctx.beginPath();
      ctx.moveTo(padLeft, yp);
      ctx.lineTo(padLeft + plotW, yp);
      ctx.stroke();
      const val = yMax - frac * 2 * yMax;
      if (i === 0 || i === 2 || i === 4) {
        ctx.fillText(`${val.toFixed(2)}`, padLeft - 6, yp);
      }
    }

    // Zero axis
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.beginPath();
    ctx.moveTo(padLeft, midY);
    ctx.lineTo(padLeft + plotW, midY);
    ctx.stroke();

    // Vertical time grid
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xDivs = 5;
    for (let i = 0; i <= xDivs; i++) {
      const frac = i / xDivs;
      const xp = padLeft + frac * plotW;
      ctx.beginPath();
      ctx.moveTo(xp, padTop);
      ctx.lineTo(xp, padTop + plotH);
      ctx.stroke();
      const tSec = startSec + frac * (endSample - startSample) / sampleRate;
      const label =
        visibleDurationSec < 0.05
          ? `${(tSec * 1000).toFixed(2)}ms`
          : visibleDurationSec < 1
          ? `${(tSec * 1000).toFixed(0)}ms`
          : `${tSec.toFixed(2)}s`;
      ctx.fillText(label, xp, padTop + plotH + 6);
    }
    ctx.setLineDash([]);

    const toY = (v: number) => {
      const clamped = Math.max(-1.05, Math.min(1.05, v / (yMax || 1)));
      return midY - clamped * (plotH / 2);
    };

    const drawSignal = (arr: Float32Array, strokeCol: string, lineWidth: number, dashed?: boolean) => {
      const count = endSample - startSample;
      if (count <= 1) return;

      ctx.save();
      ctx.beginPath();
      ctx.rect(padLeft, padTop, plotW, plotH);
      ctx.clip();

      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(dashed ? [5, 4] : []);
      ctx.beginPath();

      if (count <= plotW * 2) {
        for (let i = 0; i < count; i++) {
          const xp = padLeft + (i / (count - 1)) * plotW;
          const yp = toY(arr[startSample + i] || 0);
          if (i === 0) ctx.moveTo(xp, yp);
          else ctx.lineTo(xp, yp);
        }
      } else {
        const numCols = Math.floor(plotW);
        for (let col = 0; col < numCols; col++) {
          const s0 = startSample + Math.floor((col * count) / numCols);
          const s1 = Math.min(endSample, startSample + Math.floor(((col + 1) * count) / numCols));
          let minV = arr[s0] ?? 0;
          let maxV = minV;
          for (let k = s0 + 1; k < s1; k++) {
            const v = arr[k] ?? 0;
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
          }
          const xp = padLeft + col;
          const yHi = toY(maxV);
          const yLo = toY(minV);
          if (col === 0) ctx.moveTo(xp, yHi);
          else ctx.lineTo(xp, yHi);
          if (Math.abs(yLo - yHi) > 0.5) ctx.lineTo(xp, yLo);
        }
      }

      ctx.stroke();
      ctx.restore();
    };

    drawSignal(data, color, 1.75, false);
    for (const ov of overlays) {
      drawSignal(ov.data, ov.color, 1.5, ov.dashed);
    }

    // Synchronized Playback Cursor
    if (playbackTimeSec >= startSec && playbackTimeSec <= startSec + (endSample - startSample) / sampleRate) {
      const playFrac = (playbackTimeSec - startSec) / ((endSample - startSample) / sampleRate || 1);
      const px = padLeft + playFrac * plotW;
      ctx.strokeStyle = '#DC2626';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(px, padTop);
      ctx.lineTo(px, padTop + plotH);
      ctx.stroke();

      ctx.fillStyle = '#DC2626';
      ctx.beginPath();
      ctx.arc(px, padTop + 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hover Crosshair
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
  }, [
    data,
    overlays,
    color,
    height,
    containerWidth,
    startSample,
    endSample,
    startSec,
    visibleDurationSec,
    sampleRate,
    yMax,
    playbackTimeSec,
    hover,
  ]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const padLeft = 44;
    const padRight = 12;
    const plotW = Math.max(1, rect.width - padLeft - padRight);
    if (mouseX < padLeft || mouseX > padLeft + plotW) {
      setHover(null);
      return;
    }
    const frac = (mouseX - padLeft) / plotW;
    const idx = Math.min(data.length - 1, Math.max(0, Math.round(startSample + frac * (endSample - startSample))));
    setHover({
      x: mouseX,
      timeSec: idx / sampleRate,
      amp: data[idx] ?? 0,
      overlayVals: overlays.map((ov) => ({
        label: ov.label,
        color: ov.color,
        val: ov.data[idx] ?? 0,
      })),
    });
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || data.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const padLeft = 44;
    const padRight = 12;
    const plotW = Math.max(1, rect.width - padLeft - padRight);
    if (mouseX < padLeft || mouseX > padLeft + plotW) return;
    const frac = (mouseX - padLeft) / plotW;
    const targetSec = startSec + frac * ((endSample - startSample) / sampleRate);
    onSeek(targetSec);
  };

  const stepZoom = (dir: 1 | -1) => {
    const idx = ZOOM_STEPS.findIndex((z) => z >= zoom);
    const cur = idx === -1 ? ZOOM_STEPS.length - 1 : idx;
    const nextIdx = Math.max(0, Math.min(ZOOM_STEPS.length - 1, cur + dir));
    setZoom(ZOOM_STEPS[nextIdx]);
    if (nextIdx === 0) setPanFrac(0);
  };

  return (
    <div
      className={`rounded-xl bg-white border transition-colors p-3.5 space-y-2 shadow-xs ${
        highlighted ? 'border-[#1E4620] ring-1 ring-[#1E4620]/25' : 'border-slate-200'
      }`}
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <h4 className="font-heading text-sm font-bold text-[#111827] truncate">{title}</h4>
            {badgeText && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#EFF3EB] border border-[#DCE5D5] text-[#1E4620] font-semibold">
                {badgeText}
              </span>
            )}
          </div>
          {description && (
            <p className="font-body text-xs text-slate-500 mt-0.5 leading-snug">{description}</p>
          )}
          {formula && (
            <div className="font-mono text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 mt-1.5 inline-block">
              {formula}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onTogglePlay && (
            <button
              type="button"
              onClick={onTogglePlay}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border transition-colors cursor-pointer ${
                isPlaying
                  ? 'bg-[#1E4620] border-[#1E4620] text-white'
                  : 'bg-[#FAFAF8] border-slate-200 text-slate-700 hover:border-[#1E4620]/50 hover:text-[#1E4620]'
              }`}
              title={isPlaying ? 'Pause audio track' : 'Play audio track'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>
          )}

          <div className="flex items-center bg-[#FAFAF8] border border-slate-200 rounded-lg p-0.5">
            {[
              { label: 'Full', z: 1 },
              { label: '50ms', z: Math.max(1, Math.round(totalDurationSec / 0.05)) },
              { label: '12ms', z: Math.max(1, Math.round(totalDurationSec / 0.012)) },
            ].map((preset) => {
              const isPresetActive = Math.abs(zoom - preset.z) <= 1 && (preset.z === 1 ? zoom === 1 : zoom > 1);
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setZoom(preset.z);
                    if (preset.z === 1) setPanFrac(0);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono transition-colors cursor-pointer ${
                    isPresetActive
                      ? 'bg-[#1E4620] text-white font-semibold'
                      : 'text-slate-500 hover:text-[#111827]'
                  }`}
                  title={`View ${preset.label} window`}
                >
                  {preset.label}
                </button>
              );
            })}
            <span className="w-px h-3.5 bg-slate-200 mx-0.5" />
            <button
              type="button"
              onClick={() => stepZoom(-1)}
              disabled={zoom <= ZOOM_STEPS[0]}
              className="p-1 text-slate-500 hover:text-[#111827] disabled:opacity-35 cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1 text-[10px] font-mono text-slate-700 tabular-nums">{zoom}x</span>
            <button
              type="button"
              onClick={() => stepZoom(1)}
              disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
              className="p-1 text-slate-500 hover:text-[#111827] disabled:opacity-35 cursor-pointer"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            {zoom > 1 && (
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setPanFrac(0);
                }}
                className="p-1 text-slate-500 hover:text-[#111827] cursor-pointer"
                title="Reset zoom"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      {overlays.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: color }} />
            <span>Primary</span>
          </span>
          {overlays.map((ov) => (
            <span key={ov.label} className="flex items-center gap-1.5">
              <span
                className="w-3 h-0.5 inline-block"
                style={{
                  backgroundColor: ov.color,
                  borderBottom: ov.dashed ? `1px dashed ${ov.color}` : undefined,
                }}
              />
              <span>{ov.label}</span>
            </span>
          ))}
        </div>
      )}

      {/* White Oscilloscope Canvas */}
      <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-white">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: `${height}px` }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
          onClick={handleClick}
          className="block cursor-crosshair"
        />

        {hover && (
          <div
            className="absolute top-2 pointer-events-none bg-white/95 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-slate-700 shadow-md z-10 tabular-nums"
            style={{ left: Math.min(hover.x + 12, Math.max(8, containerWidth - 175)) }}
          >
            <div className="text-slate-500">
              t = {hover.timeSec < 0.05 ? `${(hover.timeSec * 1000).toFixed(3)} ms` : `${hover.timeSec.toFixed(3)} s`}
            </div>
            <div className="flex items-center justify-between gap-3 mt-0.5">
              <span style={{ color }}>Amp:</span>
              <span className="font-semibold text-[#111827]">{hover.amp.toFixed(4)} V</span>
            </div>
            {hover.overlayVals.map((ov) => (
              <div key={ov.label} className="flex items-center justify-between gap-3">
                <span style={{ color: ov.color }}>{ov.label}:</span>
                <span className="font-semibold text-slate-800">{ov.val.toFixed(4)} V</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pan Scrubber */}
      {zoom > 1 && (
        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
          <span>Pan</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.002}
            value={panFrac}
            onChange={(e) => setPanFrac(parseFloat(e.target.value))}
            className="flex-1 accent-[#1E4620] h-1 bg-slate-200 rounded cursor-pointer"
          />
          <span className="tabular-nums">
            {(startSec * 1000).toFixed(1)}–{((startSec + (endSample - startSample) / sampleRate) * 1000).toFixed(1)} ms
          </span>
        </div>
      )}
    </div>
  );
};
