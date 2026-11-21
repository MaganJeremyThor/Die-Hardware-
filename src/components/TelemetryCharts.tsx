import React from 'react';

interface DualLineChartProps {
  primarySeries: number[];
  secondarySeries?: number[];
  primaryLabel: string;
  secondaryLabel?: string;
  primaryColor?: string;
  secondaryColor?: string;
  unit: string;
  maxValue?: number;
  height?: number;
}

export const TelemetryOscilloscope: React.FC<DualLineChartProps> = ({
  primarySeries,
  secondarySeries,
  primaryLabel,
  secondaryLabel,
  primaryColor = '#06B6D4',
  secondaryColor = '#F59E0B',
  unit,
  maxValue,
  height = 128,
}) => {
  const width = 440;
  const padX = 8;
  const padY = 12;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const combined = secondarySeries ? [...primarySeries, ...secondarySeries] : primarySeries;
  const peak = maxValue ?? Math.max(10, ...combined) * 1.15;

  const buildPath = (series: number[]) => {
    if (series.length === 0) return '';
    return series
      .map((val, idx) => {
        const x = padX + (idx / Math.max(1, series.length - 1)) * plotW;
        const clamped = Math.min(peak, Math.max(0, val));
        const y = padY + plotH - (clamped / peak) * plotH;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const buildArea = (series: number[]) => {
    if (series.length === 0) return '';
    const line = buildPath(series);
    const lastX = padX + plotW;
    const baseY = padY + plotH;
    return `${line} L ${lastX.toFixed(1)} ${baseY.toFixed(1)} L ${padX.toFixed(1)} ${baseY.toFixed(1)} Z`;
  };

  const primaryLatest = primarySeries[primarySeries.length - 1] ?? 0;
  const secondaryLatest = secondarySeries?.[secondarySeries.length - 1];

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 font-mono-tabular">
            <span
              className="inline-block h-2 w-2 rounded-xs"
              style={{ backgroundColor: primaryColor }}
            />
            <span>{primaryLabel}:</span>
            <strong className="text-slate-100">
              {primaryLatest.toFixed(1)} {unit}
            </strong>
          </span>
          {secondaryLabel && secondaryLatest !== undefined && (
            <span className="flex items-center gap-1.5 font-mono-tabular">
              <span
                className="inline-block h-2 w-2 rounded-xs"
                style={{ backgroundColor: secondaryColor }}
              />
              <span>{secondaryLabel}:</span>
              <strong className="text-slate-100">
                {secondaryLatest.toFixed(1)} {unit}
              </strong>
            </span>
          )}
        </div>
        <span className="font-mono-tabular text-[11px] text-slate-500">
          SCALE 0–{Math.round(peak)} {unit}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible rounded border border-slate-800/80 bg-[#07090E]"
        role="img"
        aria-label={`${primaryLabel} live telemetry trace`}
      >
        {/* Horizontal calibration grid */}
        {[0.25, 0.5, 0.75].map((ratio) => {
          const y = padY + plotH * ratio;
          return (
            <line
              key={ratio}
              x1={padX}
              y1={y}
              x2={width - padX}
              y2={y}
              stroke="#1A2233"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          );
        })}

        {/* Primary area fill */}
        <path d={buildArea(primarySeries)} fill={primaryColor} fillOpacity="0.10" />

        {/* Secondary trace */}
        {secondarySeries && secondarySeries.length > 1 && (
          <path
            d={buildPath(secondarySeries)}
            fill="none"
            stroke={secondaryColor}
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
        )}

        {/* Primary trace */}
        {primarySeries.length > 1 && (
          <path
            d={buildPath(primarySeries)}
            fill="none"
            stroke={primaryColor}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </div>
  );
};
