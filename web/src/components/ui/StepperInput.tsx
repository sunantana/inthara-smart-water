import React from 'react';

export interface StepperInputProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  sublabel?: string;
  unit?: string;
  disabled?: boolean;
  className?: string;
}

export default function StepperInput({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  label,
  sublabel,
  unit,
  disabled = false,
  className = '',
}: StepperInputProps) {
  const handleDecrement = () => {
    const next = Math.max(min, (Number(value) || 0) - step);
    onChange(next);
  };

  const handleIncrement = () => {
    const current = Number(value) || 0;
    const next = max !== undefined ? Math.min(max, current + step) : current + step;
    onChange(next);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') {
      onChange(min);
      return;
    }
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed)) {
      let clamped = Math.max(min, parsed);
      if (max !== undefined) {
        clamped = Math.min(max, clamped);
      }
      onChange(clamped);
    }
  };

  return (
    <div
      className={`flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2.5 transition dark:border-slate-700/80 dark:bg-slate-800/80 ${className}`}
    >
      {(label || sublabel) && (
        <div className="mr-3 min-w-0 flex-1">
          {label && (
            <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
              {label}
            </div>
          )}
          {sublabel && (
            <div className="truncate text-xs text-slate-500 dark:text-slate-400">
              {sublabel}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={handleDecrement}
          disabled={disabled || value <= min}
          aria-label="ลดจำนวน"
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-lg font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 active:scale-95 disabled:pointer-events-none disabled:opacity-40 dark:border-slate-650 dark:bg-slate-750 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          -
        </button>

        <div className="relative flex items-center">
          <input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min={min}
            max={max}
            value={value}
            onChange={handleInputChange}
            disabled={disabled}
            className="h-11 w-16 rounded-lg border border-slate-300 bg-white px-1 text-center font-mono text-base font-bold text-slate-900 shadow-inner focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:bg-slate-100 dark:border-slate-650 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800"
          />
          {unit && (
            <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
              {unit}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleIncrement}
          disabled={disabled || (max !== undefined && value >= max)}
          aria-label="เพิ่มจำนวน"
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-lg font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 active:scale-95 disabled:pointer-events-none disabled:opacity-40 dark:border-slate-650 dark:bg-slate-750 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          +
        </button>
      </div>
    </div>
  );
}
