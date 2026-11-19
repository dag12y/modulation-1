import React, { useRef, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { SpectrumData } from '../services/dsp';

export interface SpectrumMarker {
  freq: number;
  label: string;
  color?: string;
}

export interface SpectrumFilterOverlay {
  frequencies: number[];
  response: number[]; // 0..1 gain
  color?: string;
  label?: string;
}

export interface SecondarySpectrum {
  spectrum: SpectrumData;
  color: string;
  label: string;
}

interface SpectrumProps {
  title?: string;
  spectrum: SpectrumData;
  secondarySpectra?: SecondarySpectrum[];
  height?: number;
  maxFreqHz?: number;
  highlightBandwidth?: { start: number; end: number; label: string };
  markers?: SpectrumMarker[];
  filterOverlay?: SpectrumFilterOverlay;
  defaultScale?: 'linear' | 'dB';
  defaultTwoSided?: boolean;
}

export const SpectrumAnalyzerCanvas: React.FC<SpectrumProps> = ({
  title = 'RF Spectrum Analyzer',
  spectrum,
  secondarySpectra = [],
  height = 225,
  maxFreqHz,
  highlightBandwidth,
  markers = [],
  filterOverlay,
  defaultScale = 'linear',
  defaultTwoSided = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [scaleMode, setScaleMode] = useState<'dB' | 'linear'>(defaultScale);
  const [twoSided, setTwoSided] = useState<boolean>(defaultTwoSided);
  const [containerWidth, setContainerWidth] = useState<number>(600);
  const [hoverData, setHoverData] = useState<{ freq: number; mag: number; x: number; y: number } | null>(null);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !spectrum || !spectrum.frequencies.length) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || containerWidth;
    const canvasHeight = height;

    canvas.width = width * dpr;
    canvas.height = canvasHeight * dpr;
    ctx.scale(dpr, dpr);

    const padLeft = 68;
    const padRight = 18;
    const padTop = 26;
    const padBottom = 42;

    const plotW = Math.max(10, width - padLeft - padRight);
    const plotH = Math.max(10, canvasHeight - padTop - padBottom);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, canvasHeight);

    ctx.fillStyle = '#FAF9FD';
    ctx.fillRect(padLeft, padTop, plotW, plotH);

    const freqs = spectrum.frequencies;
    const posMaxF = maxFreqHz ? Math.min(maxFreqHz, freqs[freqs.length - 1]) : (freqs[freqs.length - 1] || 1);
    const minF = twoSided ? -posMaxF : 0;
    const maxF = posMaxF;

    // For two-sided display of real signals, non-DC bins split amplitude by 0.5
    const ampScale = (fIdx: number) => (twoSided && fIdx > 0 ? 0.5 : 1.0);

    let globalPeak = spectrum.peakMagnitude * (twoSided ? 0.55 : 1.0);
    secondarySpectra.forEach((sec) => {
      const sp = sec.spectrum.peakMagnitude * (twoSided ? 0.55 : 1.0);
      if (sp > globalPeak) globalPeak = sp;
    });

    const mags = scaleMode === 'dB' ? spectrum.magnitudesDb : spectrum.magnitudes;
    const minY = scaleMode === 'dB' ? -70 : 0;
    const maxY = scaleMode === 'dB' ? 3 : Math.max(0.1, globalPeak * 1.22);

    const getX = (f: number) => padLeft + ((f - minF) / (maxF - minF || 1)) * plotW;
    const getY = (m: number) => padTop + plotH - ((m - minY) / (maxY - minY || 1)) * plotH;

    // Grid lines
    ctx.strokeStyle = '#E8E3EF';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    const ySteps = 4;
    ctx.fillStyle = '#77717F';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= ySteps; i++) {
      const val = minY + (i / ySteps) * (maxY - minY);
      const yPix = getY(val);
      ctx.beginPath();
      ctx.moveTo(padLeft, yPix);
      ctx.lineTo(padLeft + plotW, yPix);
      ctx.stroke();

      const label = scaleMode === 'dB' ? `${Math.round(val)} dB` : `${val.toFixed(2)}`;
      ctx.fillText(label, padLeft - 8, yPix);
    }

    const xSteps = twoSided ? 8 : 6;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let i = 0; i <= xSteps; i++) {
      const fVal = minF + (i / xSteps) * (maxF - minF);
      const xPix = getX(fVal);
      ctx.beginPath();
      ctx.moveTo(xPix, padTop);
      ctx.lineTo(xPix, padTop + plotH);
      ctx.stroke();

      const absK = Math.abs(fVal) / 1000;
      const sign = fVal < -1 ? '-' : '';
      const fLabel = Math.abs(fVal) < 1 ? '0' : absK >= 1 ? `${sign}${absK.toFixed(1)}k` : `${Math.round(fVal)}`;
      ctx.fillText(fLabel, xPix, padTop + plotH + 6);
    }

    // Center 0 Hz axis when two-sided
    if (twoSided) {
      const zeroX = getX(0);
      ctx.setLineDash([]);
      ctx.strokeStyle = '#C4B5E6';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(zeroX, padTop);
      ctx.lineTo(zeroX, padTop + plotH);
      ctx.stroke();
    }

    // Highlight Bandwidth Region (positive side, and mirrored on negative side if two-sided)
    const drawBwSpan = (startHz: number, endHz: number, showLabel: boolean) => {
      if (endHz < minF || startHz > maxF) return;
      const bwX1 = Math.max(padLeft, getX(startHz));
      const bwX2 = Math.min(padLeft + plotW, getX(endHz));
      const bwWidth = Math.max(2, bwX2 - bwX1);

      ctx.fillStyle = 'rgba(112, 69, 184, 0.07)';
      ctx.fillRect(bwX1, padTop, bwWidth, plotH);

      ctx.strokeStyle = '#7045B8';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(bwX1, padTop);
      ctx.lineTo(bwX1, padTop + plotH);
      ctx.moveTo(bwX2, padTop);
      ctx.lineTo(bwX2, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      if (showLabel && highlightBandwidth) {
        const tagText = highlightBandwidth.label;
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        const tagW = ctx.measureText(tagText).width + 10;
        const tagX = Math.max(padLeft + 4, Math.min(padLeft + plotW - tagW - 4, (bwX1 + bwX2) / 2 - tagW / 2));

        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fillRect(tagX, padTop + 4, tagW, 15);
        ctx.strokeStyle = 'rgba(112, 69, 184, 0.35)';
        ctx.strokeRect(tagX, padTop + 4, tagW, 15);

        ctx.fillStyle = '#4B287F';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tagText, tagX + tagW / 2, padTop + 11.5);
      }
    };

    if (highlightBandwidth) {
      drawBwSpan(highlightBandwidth.start, highlightBandwidth.end, true);
      if (twoSided) {
        drawBwSpan(-highlightBandwidth.end, -highlightBandwidth.start, false);
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(padLeft, padTop, plotW, plotH);
    ctx.clip();

    // Build symmetric or single-sided point series helper
    const buildPoints = (specFreqs: number[], specMags: number[], isLinear: boolean) => {
      const pts: { f: number; m: number }[] = [];
      let maxIdx = specFreqs.length - 1;
      for (let i = 0; i < specFreqs.length; i++) {
        if (specFreqs[i] > posMaxF) {
          maxIdx = i;
          break;
        }
      }
      if (twoSided) {
        for (let i = maxIdx; i >= 1; i--) {
          const val = isLinear ? specMags[i] * ampScale(i) : specMags[i];
          pts.push({ f: -specFreqs[i], m: val });
        }
      }
      for (let i = 0; i <= maxIdx; i++) {
        const val = isLinear ? specMags[i] * ampScale(i) : specMags[i];
        pts.push({ f: specFreqs[i], m: val });
      }
      return pts;
    };

    // Filter Response Overlay
    if (filterOverlay && filterOverlay.frequencies.length > 0) {
      const fPts = buildPoints(
        filterOverlay.frequencies,
        filterOverlay.response.map((g) =>
          scaleMode === 'dB'
            ? Math.max(minY, 20 * Math.log10(Math.max(g, 1e-4)))
            : g * globalPeak * 1.05
        ),
        false
      );
      ctx.beginPath();
      ctx.strokeStyle = filterOverlay.color || '#059669';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 3]);
      fPts.forEach((p, idx) => {
        const xp = getX(p.f);
        const yp = getY(p.m);
        if (idx === 0) ctx.moveTo(xp, yp);
        else ctx.lineTo(xp, yp);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Secondary Spectra
    secondarySpectra.forEach((sec) => {
      const sMags = scaleMode === 'dB' ? sec.spectrum.magnitudesDb : sec.spectrum.magnitudes;
      const pts = buildPoints(sec.spectrum.frequencies, sMags, scaleMode === 'linear');
      ctx.beginPath();
      ctx.strokeStyle = sec.color;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([]);
      pts.forEach((p, idx) => {
        const xp = getX(p.f);
        const yp = getY(p.m);
        if (idx === 0) ctx.moveTo(xp, yp);
        else ctx.lineTo(xp, yp);
      });
      ctx.stroke();
    });

    // Primary Spectrum
    const primaryPts = buildPoints(freqs, mags, scaleMode === 'linear');
    if (primaryPts.length > 0) {
      ctx.beginPath();
      ctx.moveTo(getX(primaryPts[0].f), getY(minY));
      primaryPts.forEach((p) => {
        ctx.lineTo(getX(p.f), getY(p.m));
      });
      ctx.lineTo(getX(primaryPts[primaryPts.length - 1].f), getY(minY));
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
      grad.addColorStop(0, 'rgba(112, 69, 184, 0.28)');
      grad.addColorStop(1, 'rgba(112, 69, 184, 0.02)');
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = '#7045B8';
      ctx.lineWidth = 1.9;
      ctx.setLineDash([]);
      primaryPts.forEach((p, idx) => {
        const xp = getX(p.f);
        const yp = getY(p.m);
        if (idx === 0) ctx.moveTo(xp, yp);
        else ctx.lineTo(xp, yp);
      });
      ctx.stroke();
    }

    // Reference Frequency Markers
    const drawMarker = (freq: number, label: string, color?: string) => {
      if (freq < minF || freq > maxF) return;
      const mx = getX(freq);
      ctx.strokeStyle = color || '#64748B';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(mx, padTop + 18);
      ctx.lineTo(mx, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = color || '#4B287F';
      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, mx, padTop + plotH - 13);
    };

    markers.forEach((m) => {
      drawMarker(m.freq, m.label, m.color);
      if (twoSided && m.freq > 0) {
        drawMarker(-m.freq, `-${m.label}`, m.color);
      }
    });

    ctx.restore();

    // Outer border
    ctx.strokeStyle = '#D9D0E6';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(padLeft, padTop, plotW, plotH);

    // Axis titles
    ctx.fillStyle = '#4B287F';
    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      twoSided ? 'Two-Sided Frequency f (Hz / kHz)' : 'Frequency f (Hz / kHz)',
      padLeft + plotW / 2,
      canvasHeight - 5
    );

    ctx.save();
    ctx.translate(16, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(scaleMode === 'dB' ? 'Power (dB)' : '|S(f)|', 0, 0);
    ctx.restore();
  }, [
    spectrum,
    secondarySpectra,
    height,
    scaleMode,
    twoSided,
    maxFreqHz,
    highlightBandwidth,
    markers,
    filterOverlay,
    containerWidth,
  ]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !spectrum || !spectrum.frequencies.length) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const padLeft = 68;
    const padRight = 18;
    const plotW = rect.width - padLeft - padRight;

    if (mouseX >= padLeft && mouseX <= padLeft + plotW) {
      const freqs = spectrum.frequencies;
      const posMaxF = maxFreqHz ? Math.min(maxFreqHz, freqs[freqs.length - 1]) : freqs[freqs.length - 1];
      const minF = twoSided ? -posMaxF : 0;
      const maxF = posMaxF;
      const fVal = minF + ((mouseX - padLeft) / plotW) * (maxF - minF);

      const absF = Math.abs(fVal);
      const totalPos = freqs[freqs.length - 1] || 1;
      const idx = Math.min(
        freqs.length - 1,
        Math.max(0, Math.round((absF / totalPos) * (freqs.length - 1)))
      );

      const mags = scaleMode === 'dB' ? spectrum.magnitudesDb : spectrum.magnitudes;
      const rawMag = mags[idx] || 0;
      const val = scaleMode === 'linear' && twoSided && idx > 0 ? rawMag * 0.5 : rawMag;

      setHoverData({
        freq: fVal,
        mag: val,
        x: mouseX,
        y: mouseY,
      });
    } else {
      setHoverData(null);
    }
  };

  const handleExportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${title ? title.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'modulab-spectrum'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="bg-white border border-[#E8E3EF] rounded-xl p-3.5 relative">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 pb-2 border-b border-[#F1EBFA]">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <h3 className="text-xs font-bold text-[#24212C] whitespace-nowrap">{title}</h3>
          <div className="flex items-center gap-2 text-[11px] font-mono text-[#77717F] tabular-nums">
            <span>Peak: {(spectrum.peakFreq / 1000).toFixed(2)} kHz</span>
            {secondarySpectra.map((sec, i) => (
              <span key={i} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: sec.color }} />
                <span>{sec.label}</span>
              </span>
            ))}
            {filterOverlay?.label && (
              <span className="flex items-center gap-1 text-emerald-700 font-medium">
                <span className="w-3 border-t-2 border-dashed border-emerald-600 inline-block" />
                {filterOverlay.label}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* 2-Sided / 1-Sided Toggle */}
          <div className="flex items-center gap-0.5 bg-[#FAF9FD] p-0.5 rounded-lg border border-[#E8E3EF]">
            <button
              onClick={() => setTwoSided(true)}
              className={`px-2 py-0.5 text-[11px] font-mono rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                twoSided
                  ? 'bg-[#7045B8] text-white font-semibold'
                  : 'text-[#77717F] hover:text-[#24212C]'
              }`}
              title="Two-sided Fourier spectrum (-f to +f)"
            >
              ±f
            </button>
            <button
              onClick={() => setTwoSided(false)}
              className={`px-2 py-0.5 text-[11px] font-mono rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                !twoSided
                  ? 'bg-[#7045B8] text-white font-semibold'
                  : 'text-[#77717F] hover:text-[#24212C]'
              }`}
              title="Single-sided positive frequency spectrum (0 to +f)"
            >
              +f
            </button>
          </div>

          <div className="flex items-center gap-0.5 bg-[#F1EBFA] p-0.5 rounded-lg border border-[#7045B8]/20">
            <button
              onClick={() => setScaleMode('linear')}
              className={`px-2 py-0.5 text-[11px] font-mono rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                scaleMode === 'linear'
                  ? 'bg-white text-[#4B287F] font-semibold shadow-xs'
                  : 'text-[#77717F] hover:text-[#4B287F]'
              }`}
            >
              Linear
            </button>
            <button
              onClick={() => setScaleMode('dB')}
              className={`px-2 py-0.5 text-[11px] font-mono rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                scaleMode === 'dB'
                  ? 'bg-white text-[#4B287F] font-semibold shadow-xs'
                  : 'text-[#77717F] hover:text-[#4B287F]'
              }`}
            >
              dB
            </button>
          </div>

          <button
            onClick={handleExportPNG}
            className="p-1 text-[#77717F] hover:text-[#7045B8] hover:bg-[#F1EBFA] rounded-md transition-colors cursor-pointer"
            title="Export Spectrum PNG"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="relative w-full overflow-hidden rounded-lg border border-[#F1EBFA] bg-[#FAF9FD]">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: `${height}px` }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverData(null)}
          className="cursor-crosshair block"
        />

        {hoverData && (
          <div
            className="absolute top-2 pointer-events-none bg-white/95 border border-[#7045B8]/30 shadow-md rounded-md p-2 text-[11px] font-mono z-20 tabular-nums"
            style={{
              left: Math.min(hoverData.x + 12, (canvasRef.current?.clientWidth || 300) - 160),
            }}
          >
            <div className="text-[#4B287F] font-semibold">
              f = {(hoverData.freq / 1000).toFixed(2)} kHz
            </div>
            <div className="text-[#24212C]">
              Mag = {hoverData.mag.toFixed(3)} {scaleMode === 'dB' ? 'dB' : 'V'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
