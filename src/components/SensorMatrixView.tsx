import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { SensorCategory, TelemetryFrame } from '../types/hardware';

interface SensorMatrixViewProps {
  frame: TelemetryFrame;
}

const MODULE_ORDER: SensorCategory[] = [
  'CPU',
  'GPU',
  'RAM & VRAM',
  'Storage',
  'Power',
  'Cooling',
  'Network',
];

export const SensorMatrixView: React.FC<SensorMatrixViewProps> = ({ frame }) => {
  const [query, setQuery] = useState('');
  const [selectedModule, setSelectedModule] = useState<SensorCategory | 'All'>('All');
  const [showRawPaths, setShowRawPaths] = useState(false);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = frame.sensors.filter((sensor) => {
      if (selectedModule !== 'All' && sensor.module !== selectedModule) return false;
      if (!q) return true;
      return (
        sensor.shortName.toLowerCase().includes(q) ||
        sensor.rawName.toLowerCase().includes(q) ||
        sensor.module.toLowerCase().includes(q)
      );
    });

    const map = new Map<SensorCategory, typeof filtered>();
    for (const mod of MODULE_ORDER) {
      const items = filtered.filter((s) => s.module === mod);
      if (items.length > 0) map.set(mod, items);
    }
    return map;
  }, [frame.sensors, query, selectedModule]);

  const statusBadge = (status: 'Nominal' | 'Elevated' | 'Critical') => {
    if (status === 'Critical') {
      return <span className="font-mono-tabular text-xs font-medium text-rose-400">✖ Critical</span>;
    }
    if (status === 'Elevated') {
      return <span className="font-mono-tabular text-xs font-medium text-amber-400">▲ Elevated</span>;
    }
    return <span className="font-mono-tabular text-xs font-medium text-emerald-400">● Normal</span>;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-slate-800 bg-[#0D121D] p-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-100">
            System Sensors (°F / USA Standard)
          </h2>
          <p className="text-xs text-slate-400">
            Short, clear hardware names organized by component.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sensors..."
              aria-label="Filter hardware sensors"
              className="w-48 rounded border border-slate-700 bg-[#07090E] py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded border border-slate-700 bg-[#07090E] px-3 py-1.5 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={showRawPaths}
              onChange={(e) => setShowRawPaths(e.target.checked)}
              className="accent-amber-500"
            />
            <span>Show Raw Names</span>
          </label>
        </div>
      </div>

      {/* Short Component Tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(['All', ...MODULE_ORDER] as const).map((mod) => (
          <button
            key={mod}
            type="button"
            onClick={() => setSelectedModule(mod)}
            className={`whitespace-nowrap rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              selectedModule === mod
                ? 'bg-cyan-500 text-slate-950 font-semibold'
                : 'border border-slate-800 bg-[#0D121D] text-slate-300 hover:border-slate-600'
            }`}
          >
            {mod}
          </button>
        ))}
      </div>

      {/* Organized Sensor Modules */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {Array.from(grouped.entries()).map(([moduleName, sensors]) => (
          <section
            key={moduleName}
            className="rounded-md border border-slate-800 bg-[#0D121D] p-4"
          >
            <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-display text-sm font-semibold tracking-wide text-amber-400">
                {moduleName}
              </h3>
              <span className="font-mono-tabular text-xs text-slate-500">
                {sensors.length} sensors
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800/80 text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 px-2 text-right font-medium">Current</th>
                    <th className="py-2 px-2 text-right font-medium">Range</th>
                    <th className="py-2 pl-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {sensors.map((sensor) => (
                    <tr key={sensor.id} className="hover:bg-slate-800/25">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-slate-100" title={sensor.rawName}>
                          {sensor.shortName}
                        </div>
                        {showRawPaths && (
                          <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                            {sensor.rawName}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono-tabular font-semibold text-cyan-300">
                        {sensor.value} <span className="text-slate-400">{sensor.unit}</span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono-tabular text-slate-400">
                        {sensor.min}–{sensor.max}
                      </td>
                      <td className="py-2.5 pl-2 text-right whitespace-nowrap">
                        {statusBadge(sensor.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};
