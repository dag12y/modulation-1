import React, { useRef, useEffect, useState } from 'react';
import { ConstellationPoint } from '../services/dsp';
import { useSimulation } from '../context/SimulationContext';

interface ConstellationProps {
  title?: string;
  points: ConstellationPoint[];
  noisySamples?: { i: number; q: number }[];
  size?: number;
  snrDb?: number;
}

export const ConstellationCanvas: React.FC<ConstellationProps> = ({
  title = 'I/Q Constellation Diagram',
  points,
  noisySamples = [],
  size = 280,
  snrDb,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { isSimulating, frame } = useSimulation();
  const [hoveredPoint, setHoveredPoint] = useState<ConstellationPoint | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    // Generous padding preventing text from colliding with borders
    const pad = 44;
    const plotSize = size - pad * 2;
    const center = size / 2;

    // Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);

    // Plot area
    ctx.fillStyle = '#FAF9FD';
    ctx.fillRect(pad, pad, plotSize, plotSize);

    // Grid & Axis
    ctx.strokeStyle = '#E8E3EF';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    // Center cross
    ctx.beginPath();
    ctx.moveTo(pad, center);
    ctx.lineTo(pad + plotSize, center);
    ctx.moveTo(center, pad);
    ctx.lineTo(center, pad + plotSize);
    ctx.stroke();

    // Unit reference circle
    ctx.beginPath();
    ctx.arc(center, center, plotSize * 0.38, 0, 2 * Math.PI);
    ctx.stroke();

    // Max coordinate value for normalization
    let maxVal = 1;
    points.forEach((p) => {
      const dist = Math.max(Math.abs(p.i), Math.abs(p.q));
      if (dist > maxVal) maxVal = dist;
    });
    maxVal *= 1.35;

    const toX = (iVal: number) => center + (iVal / maxVal) * (plotSize / 2);
    const toY = (qVal: number) => center - (qVal / maxVal) * (plotSize / 2);

    // Draw live animated noisy received sample cloud
    if (noisySamples && noisySamples.length > 0) {
      ctx.fillStyle = 'rgba(112, 69, 184, 0.45)';
      const jitterScale = isSimulating ? 0.08 : 0;

      for (let s = 0; s < Math.min(noisySamples.length, 1200); s++) {
        let iVal = noisySamples[s].i;
        let qVal = noisySamples[s].q;

        if (isSimulating) {
          // Dynamic thermal micro-drift per frame
          const seed = (s * 13 + frame * 7) % 1000;
          iVal += Math.sin(seed) * jitterScale;
          qVal += Math.cos(seed) * jitterScale;
        }

        const x = toX(iVal);
        const y = toY(qVal);
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // Draw ideal symbol points
    ctx.setLineDash([]);
    const showBitLabels = points.length <= 8; // Don't crowd 16-QAM or 64-QAM with 64 overlapping labels

    points.forEach((pt) => {
      const x = toX(pt.i);
      const y = toY(pt.q);

      // Symbol marker with glow when active
      ctx.fillStyle = '#4B287F';
      ctx.beginPath();
      ctx.arc(x, y, showBitLabels ? 5 : 4, 0, 2 * Math.PI);
      ctx.fill();

      // Outer ring
      ctx.strokeStyle = '#7045B8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label (only for M <= 8 to prevent massive text overlapping)
      if (showBitLabels) {
        ctx.fillStyle = '#24212C';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';

        // Check if point is near top border - place label safely below if near top border line
        if (y - 8 < pad + 10) {
          ctx.textBaseline = 'top';
          ctx.fillText(pt.bitString, x, y + 8);
        } else {
          ctx.textBaseline = 'bottom';
          ctx.fillText(pt.bitString, x, y - 8);
        }
      }
    });

    // Outer border of plot area
    ctx.strokeStyle = '#D9D0E6';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad, pad, plotSize, plotSize);

    // Axis labels - generous padding, zero collision with card border lines
    ctx.fillStyle = '#4B287F';
    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('In-Phase (I)', center, size - 10);

    ctx.save();
    ctx.translate(18, center);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Quadrature (Q)', 0, 0);
    ctx.restore();
  }, [points, noisySamples, size, snrDb, isSimulating, frame]);

  return (
    <div className="bg-white border border-[#E8E3EF] rounded-xl p-4 shadow-xs relative flex flex-col justify-between">
      {/* Header with clean separation */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5 border-b border-[#F1EBFA] pb-2.5">
        <div>
          <h3 className="text-sm font-semibold text-[#24212C]">{title}</h3>
          <p className="text-[11px] text-[#77717F] font-mono">
            {points.length} Constellation Symbols · {snrDb !== undefined ? `SNR: ${snrDb} dB` : 'Ideal Grid'}
          </p>
        </div>

        {isSimulating && (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
            ● NOISE CLOUD ACTIVE
          </span>
        )}
      </div>

      {/* Canvas */}
      <div className="flex justify-center items-center py-1">
        <canvas
          ref={canvasRef}
          style={{ width: `${size}px`, height: `${size}px` }}
          className="block rounded-lg shadow-2xs"
        />
      </div>

      <div className="mt-2 text-center text-[10px] text-[#77717F] font-mono">
        Orthogonal I (Carrier) vs Q (90° Carrier) Phase Plane
      </div>
    </div>
  );
};
