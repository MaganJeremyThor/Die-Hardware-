import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Play, Square, Trash2 } from 'lucide-react';
import type { CsvSectionCategory, CsvTelemetryRow } from '../types/hardware';
import { formatOrganizedCsv } from '../utils/csvFormatter';

interface CsvLoggerViewProps {
  autoLogging: boolean;
  onToggleAutoLogging: () => void;
  rows: CsvTelemetryRow[];
  onClearLog: () => void;
  onCaptureSnapshotNow: () => void;
}

const SECTIONS: CsvSectionCategory[] = [
  'All Sections',
  'Power Management',
  'RAM Timings',
  'CPU & Thermal',
  'GPU & AI Render',
  'Storage & Network',
];

export const CsvLoggerView: React.FC<CsvLoggerViewProps> = ({
  autoLogging,
  onToggleAutoLogging,
  rows,
  onClearLog,
  onCaptureSnapshotNow,
}) => {
  const [selectedSection, setSelectedSection] = useState<CsvSectionCategory>('All Sections');

  const filteredRows = useMemo(() => {
    const base =
      selectedSection === 'All Sections'
        ? rows
        : rows.filter((r) => r.section === selectedSection);
    return base.slice(-80).reverse();
  }, [rows, selectedSection]);

  const handleDownloadCsv = () => {
    const csvContent = formatOrganizedCsv(rows, selectedSection);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.href = url;
    link.download = `Die-Hardware-Telemetry-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Control Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-slate-800 bg-[#0D121D] p-5">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg font-semibold text-slate-100">
              Organized Telemetry CSV Logger
            </h2>
            <span
              className={`font-mono-tabular text-xs font-semibold ${
                autoLogging ? 'text-emerald-400' : 'text-slate-400'
              }`}
            >
              {autoLogging ? '● Auto-Recording' : '○ Paused'}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Automatically groups live system telemetry under Power Management, RAM Timings, CPU &amp; Thermal, GPU &amp; AI Render, and Storage &amp; Network.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleAutoLogging}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded px-3.5 py-2 text-xs font-semibold transition-colors ${
              autoLogging
                ? 'border border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
            }`}
          >
            {autoLogging ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {autoLogging ? 'Pause Auto CSV' : 'Start Auto CSV'}
          </button>

          <button
            type="button"
            onClick={onCaptureSnapshotNow}
            className="whitespace-nowrap rounded border border-slate-700 bg-[#07090E] px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-500"
          >
            Log Sample Now
          </button>

          <button
            type="button"
            disabled={rows.length === 0}
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Download Organized CSV
          </button>

          <button
            type="button"
            disabled={rows.length === 0}
            onClick={onClearLog}
            aria-label="Clear CSV buffer"
            className="rounded border border-slate-700 bg-[#07090E] p-2 text-slate-400 hover:border-rose-500/50 hover:text-rose-300 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Category Section Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {SECTIONS.map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => setSelectedSection(sec)}
              className={`whitespace-nowrap rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedSection === sec
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'border border-slate-800 bg-[#0D121D] text-slate-300 hover:border-slate-600'
              }`}
            >
              {sec}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 font-mono-tabular text-xs text-slate-400">
          <FileSpreadsheet className="h-3.5 w-3.5 text-cyan-400" />
          <span>{rows.length} buffered rows</span>
        </div>
      </div>

      {/* Live CSV Preview Table */}
      <section className="rounded-md border border-slate-800 bg-[#0D121D] p-4">
        {filteredRows.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No telemetry rows recorded yet. Enable Start Auto CSV or click Log Sample Now.
          </div>
        ) : (
          <div className="max-h-[460px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#0D121D]">
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-3 font-medium">Section</th>
                  <th className="py-2 px-2 font-medium">Timestamp</th>
                  <th className="py-2 px-2 font-medium">Sensor Label</th>
                  <th className="py-2 px-2 text-right font-medium">Value</th>
                  <th className="py-2 pl-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono-tabular">
                {filteredRows.map((row, idx) => (
                  <tr key={`${row.timestamp}-${row.metricKey}-${idx}`} className="hover:bg-slate-800/25">
                    <td className="py-2 pr-3 text-amber-300">{row.section}</td>
                    <td className="py-2 px-2 text-slate-500">{row.timestamp.slice(11, 19)}</td>
                    <td className="py-2 px-2 text-slate-200">{row.abbreviatedLabel}</td>
                    <td className="py-2 px-2 text-right font-semibold text-cyan-300">
                      {row.value} <span className="text-slate-500">{row.unit}</span>
                    </td>
                    <td className="py-2 pl-2 text-right text-emerald-400">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
