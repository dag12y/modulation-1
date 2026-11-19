import React from 'react';

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  formatValue?: (val: number) => string;
  onChange: (val: number) => void;
  hint?: string;
}

export const SliderControl: React.FC<SliderControlProps> = ({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  formatValue,
  onChange,
  hint,
}) => {
  const display = formatValue ? formatValue(value) : `${value}${unit ? ` ${unit}` : ''}`;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-[#77717F] font-medium truncate">{label}</span>
        <span className="font-mono font-semibold text-[#4B287F] tabular-nums shrink-0">
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-[#E8E3EF] rounded-lg appearance-none cursor-pointer accent-[#7045B8]"
      />
      {hint && <p className="text-[10px] text-[#77717F] leading-tight">{hint}</p>}
    </div>
  );
};

interface SegmentedControlProps<T extends string> {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (val: T) => void;
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="space-y-1.5">
      {label && <span className="block text-xs font-medium text-[#77717F]">{label}</span>}
      <div className="grid gap-1 p-1 bg-[#F8F7FB] border border-[#E8E3EF] rounded-lg" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`px-2 py-1.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap truncate ${
                active
                  ? 'bg-[#7045B8] text-white shadow-xs'
                  : 'text-[#77717F] hover:text-[#24212C]'
              }`}
              title={opt.label}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface MetricCellProps {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}

export const MetricCell: React.FC<MetricCellProps> = ({ label, value, accent, warn }) => (
  <div
    className={`p-2 rounded-lg border ${
      warn
        ? 'bg-red-50 border-red-200'
        : accent
        ? 'bg-[#F1EBFA]/60 border-[#7045B8]/25'
        : 'bg-[#FAF9FD] border-[#E8E3EF]'
    }`}
  >
    <span className="block text-[10px] text-[#77717F] truncate">{label}</span>
    <span
      className={`block text-xs font-mono font-bold tabular-nums mt-0.5 truncate ${
        warn ? 'text-red-700' : accent ? 'text-[#4B287F]' : 'text-[#24212C]'
      }`}
    >
      {value}
    </span>
  </div>
);
