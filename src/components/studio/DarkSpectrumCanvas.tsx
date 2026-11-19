import React, { useRef, useEffect, useState } from 'react';
import { SpectrumData } from '../../services/dsp';

export interface DarkSpectrumOverlay {
  frequencies: number[];
  response: number[];
  color?: string;
}

export interface DarkSecondarySpectrum {
  spectrum: SpectrumData;
  color: string;
  label: string;
}

interface DarkSpectrumProps {
  spectrum: SpectrumData;
  secondarySpectra?: DarkSecondarySpectrum[];
  carrierFreqHz?: number;
  maxFreqHz?: number;
  minFreqHz?: number;
  twoSided?: boolean;
  scaleMode?: 'linear' | 'dB';
  filterOverlay?: DarkSpectrumOverlay;
  height?: number;
  mini?: boolean;
  accentColor?: string;
}

export const DarkSpectrumCanvas: React.FC<DarkSpectrumProps> = ({
  spectrum,
  secondarySpectra = [],
  carrierFreqHz,
  maxFreqHz,
  minFreqHz = 0,
  twoSided = false,
  scaleMode = 'linear',
  filterOverlay,
  height = 220,
  mini = false,
  accentColor = '#0284C7',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(340);
  const [hover, setHover] = useState<{ x: number; freq: number; mag: number } | null>(null);

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

    // Crisp pure white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    const padLeft = mini ? 26 : 36;
    const padRight = 14;
    const padTop = mini ? 12 : 16;
    const padBottom = mini ? 24 : 30;
    const plotW = Math.max(20, width - padLeft - padRight);
    const plotH = Math.max(20, height - padTop - padBottom);

    const freqs = spectrum.frequencies;
    const posMaxF = maxFreqHz ? Math.min(maxFreqHz, freqs[freqs.length - 1]) : (freqs[freqs.length - 1] || 1);
    const minF = twoSided ? -posMaxF : minFreqHz;
    const maxF = posMaxF;

    let globalPeak = spectrum.peakMagnitude * (twoSided ? 0.55 : 1.0);
    secondarySpectra.forEach((sec) => {
      const p = sec.spectrum.peakMagnitude * (twoSided ? 0.55 : 1.0);
      if (p > globalPeak) globalPeak = p;
    });

    const minY = scaleMode === 'dB' ? -65 : 0;
    // Stabilize Y-axis ceiling to 0.25V increments to prevent vertical jitter
    const maxY =
      scaleMode === 'dB' ? 3 : Math.max(0.25, Math.ceil(globalPeak * 1.2 * 4) / 4);

    const getX = (f: number) => padLeft + ((f - minF) / (maxF - minF || 1)) * plotW;
    const getY = (m: number) => padTop + plotH - ((m - minY) / (maxY - minY || 1)) * plotH;

    // Horizontal dotted grid lines
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.fillStyle = '#64748B';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const ySteps = mini ? 2 : 3;
    for (let i = 0; i <= ySteps; i++) {
      const val = minY + (i / ySteps) * (maxY - minY);
      const yp = getY(val);
      ctx.beginPath();
      ctx.moveTo(padLeft, yp);
      ctx.lineTo(padLeft + plotW, yp);
      ctx.stroke();
      const lbl = scaleMode === 'dB' ? `${Math.round(val)}` : val.toFixed(1);
      ctx.fillText(lbl, padLeft - 5, yp);
    }
    ctx.setLineDash([]);

    // X-axis labels
    const xSteps = 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= xSteps; i++) {
      const fv = minF + (i / xSteps) * (maxF - minF);
      const xp = getX(fv);
      const absK = Math.abs(fv) / 1000;
      const sign = fv < -1 ? '-' : '';
      const lbl =
        Math.abs(fv) < 1
          ? '0'
          : absK >= 1
          ? `${sign}${absK.toFixed(absK % 1 === 0 ? 0 : 1)}k`
          : `${Math.round(fv)}`;
      ctx.fillText(lbl, xp, padTop + plotH + 6);
    }

    if (twoSided) {
      const zx = getX(0);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.2)';
      ctx.beginPath();
      ctx.moveTo(zx, padTop);
      ctx.lineTo(zx, padTop + plotH);
      ctx.stroke();
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(padLeft, padTop, plotW, plotH);
    ctx.clip();

    // Filter response dashed overlay
    if (filterOverlay && filterOverlay.frequencies.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = filterOverlay.color || '#1E4620';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 3]);
      const drawFilterHalf = (sign: number) => {
        let started = false;
        for (let i = 0; i < filterOverlay.frequencies.length; i++) {
          const f = sign * filterOverlay.frequencies[i];
          if (f < minF || f > maxF) continue;
          const xp = getX(f);
          const g = filterOverlay.response[i];
          const mv =
            scaleMode === 'dB'
              ? Math.max(minY, 20 * Math.log10(Math.max(g, 1e-4)))
              : g * globalPeak * 1.05;
          const yp = getY(mv);
          if (!started) {
            ctx.moveTo(xp, yp);
            started = true;
          } else {
            ctx.lineTo(xp, yp);
          }
        }
      };
      drawFilterHalf(1);
      ctx.stroke();
      if (twoSided) {
        ctx.beginPath();
        drawFilterHalf(-1);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    const drawSpectrumTrace = (spec: SpectrumData, mainColor: string, isPrimary: boolean) => {
      const sFreqs = spec.frequencies;
      const sMags = scaleMode === 'dB' ? spec.magnitudesDb : spec.magnitudes;

      const drawHalf = (sign: number) => {
        if (scaleMode === 'linear') {
          ctx.beginPath();
          ctx.moveTo(getX(sign === -1 ? -posMaxF : minFreqHz), getY(minY));
          for (let i = 0; i < sFreqs.length; i++) {
            const f = sign * sFreqs[i];
            if (f < minF || f > maxF) continue;
            const amp = twoSided && i > 0 ? sMags[i] * 0.5 : sMags[i];
            ctx.lineTo(getX(f), getY(amp));
          }
          ctx.lineTo(getX(sign === -1 ? 0 : maxF), getY(minY));
          ctx.closePath();

          if (isPrimary) {
            ctx.fillStyle = 'rgba(2, 132, 199, 0.11)';
            ctx.fill();
          }

          ctx.beginPath();
          ctx.strokeStyle = mainColor;
          ctx.lineWidth = isPrimary ? 2 : 1.5;
          let started = false;
          for (let i = 0; i < sFreqs.length; i++) {
            const f = sign * sFreqs[i];
            if (f < minF || f > maxF) continue;
            const amp = twoSided && i > 0 ? sMags[i] * 0.5 : sMags[i];
            const xp = getX(f);
            const yp = getY(amp);
            if (!started) {
              ctx.moveTo(xp, yp);
              started = true;
            } else {
              ctx.lineTo(xp, yp);
            }
          }
          ctx.stroke();

          // Highlight Carrier Peak in warm Amber (#D97706)
          if (isPrimary && carrierFreqHz && carrierFreqHz >= minFreqHz && carrierFreqHz <= posMaxF) {
            const binIdx = Math.round(
              (carrierFreqHz / (sFreqs[sFreqs.length - 1] || 1)) * (sFreqs.length - 1)
            );
            const localWindow = [binIdx - 1, binIdx, binIdx + 1].filter(
              (k) => k >= 0 && k < sMags.length
            );
            const carMag =
              Math.max(...localWindow.map((k) => sMags[k])) * (twoSided ? 0.5 : 1);
            if (carMag > globalPeak * 0.18) {
              const cx = getX(sign * carrierFreqHz);
              const cy = getY(carMag);
              ctx.strokeStyle = '#D97706';
              ctx.lineWidth = mini ? 2.5 : 3.5;
              ctx.beginPath();
              ctx.moveTo(cx, getY(minY));
              ctx.lineTo(cx, cy);
              ctx.stroke();

              if (!mini) {
                ctx.fillStyle = '#B45309';
                ctx.font = '600 9px "JetBrains Mono", monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText('Carrier', cx, Math.max(padTop + 10, cy - 4));
              }
            }
          }
        } else {
          ctx.beginPath();
          ctx.strokeStyle = mainColor;
          ctx.lineWidth = isPrimary ? 1.9 : 1.4;
          let started = false;
          for (let i = 0; i < sFreqs.length; i++) {
            const f = sign * sFreqs[i];
            if (f < minF || f > maxF) continue;
            const xp = getX(f);
            const yp = getY(sMags[i]);
            if (!started) {
              ctx.moveTo(xp, yp);
              started = true;
            } else {
              ctx.lineTo(xp, yp);
            }
          }
          ctx.stroke();
        }
      };

      drawHalf(1);
      if (twoSided) drawHalf(-1);
    };

    secondarySpectra.forEach((sec) => drawSpectrumTrace(sec.spectrum, sec.color, false));
    drawSpectrumTrace(spectrum, accentColor, true);

    ctx.restore();
  }, [
    spectrum,
    secondarySpectra,
    carrierFreqHz,
    maxFreqHz,
    minFreqHz,
    twoSided,
    scaleMode,
    filterOverlay,
    height,
    mini,
    accentColor,
    containerWidth,
  ]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mini) return;
    const canvas = canvasRef.current;
    if (!canvas || !spectrum || spectrum.frequencies.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const padLeft = 36;
    const padRight = 14;
    const plotW = rect.width - padLeft - padRight;

    if (mouseX >= padLeft && mouseX <= padLeft + plotW) {
      const freqs = spectrum.frequencies;
      const posMaxF = maxFreqHz ? Math.min(maxFreqHz, freqs[freqs.length - 1]) : freqs[freqs.length - 1];
      const minF = twoSided ? -posMaxF : minFreqHz;
      const fVal = minF + ((mouseX - padLeft) / plotW) * (posMaxF - minF);
      const idx = Math.min(
        freqs.length - 1,
        Math.max(0, Math.round((Math.abs(fVal) / (freqs[freqs.length - 1] || 1)) * (freqs.length - 1)))
      );
      const raw = scaleMode === 'dB' ? spectrum.magnitudesDb[idx] : spectrum.magnitudes[idx];
      setHover({
        x: mouseX,
        freq: fVal,
        mag: scaleMode === 'linear' && twoSided && idx > 0 ? raw * 0.5 : raw,
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
        className={mini ? 'block rounded-lg' : 'block cursor-crosshair rounded-lg'}
      />
      {!mini && hover && (
        <div
          className="absolute top-2 pointer-events-none bg-white/95 border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-mono text-slate-800 shadow-lg z-20 tabular-nums"
          style={{ left: Math.min(hover.x + 10, Math.max(10, containerWidth - 135)) }}
        >
          <div className="text-[#0284C7] font-semibold">f = {(hover.freq / 1000).toFixed(2)} kHz</div>
          <div>
            {scaleMode === 'dB' ? `${hover.mag.toFixed(1)} dB` : `${hover.mag.toFixed(3)} V`}
          </div>
        </div>
      )}
    </div>
  );
};
