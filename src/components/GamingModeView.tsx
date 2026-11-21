import React from 'react';
import { Gauge, Power, RotateCcw, ShieldCheck } from 'lucide-react';
import type { WindowsServiceEntry } from '../types/hardware';

interface GamingModeViewProps {
  gamingModeActive: boolean;
  services: WindowsServiceEntry[];
  onOptimizeGamingMode: () => void;
  onRestoreStandardMode: () => void;
  onToggleSingleService: (serviceName: string) => void;
}

export const GamingModeView: React.FC<GamingModeViewProps> = ({
  gamingModeActive,
  services,
  onOptimizeGamingMode,
  onRestoreStandardMode,
  onToggleSingleService,
}) => {
  const suspendedServices = services.filter((s) => s.status === 'Suspended');
  const freedRamMb = suspendedServices.reduce((acc, s) => acc + s.memoryMb, 0);
  const reducedCpuPct = suspendedServices.reduce((acc, s) => acc + s.cpuOverheadPct, 0);

  return (
    <div className="space-y-5">
      {/* Primary Action Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-slate-800 bg-[#0D121D] p-5">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg font-semibold text-slate-100">
              Intelligent Windows Gaming Mode
            </h2>
            <span
              className={`font-mono-tabular text-xs font-semibold ${
                gamingModeActive ? 'text-emerald-400' : 'text-slate-400'
              }`}
            >
              {gamingModeActive ? '● Peak Flight Active' : '○ Standard Windows'}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Suspends non-essential Windows 10/11 telemetry, indexing, and sync daemons while locking CPU &amp; GPU P-states at full clock ability.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!gamingModeActive ? (
            <button
              type="button"
              onClick={onOptimizeGamingMode}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded bg-amber-500 px-5 py-2.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400"
            >
              <Gauge className="h-4 w-4" />
              Optimize Gaming Mode
            </button>
          ) : (
            <button
              type="button"
              onClick={onRestoreStandardMode}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded border border-cyan-500/50 bg-cyan-500/10 px-4 py-2.5 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20"
            >
              <RotateCcw className="h-4 w-4" />
              Restore Standard State
            </button>
          )}
        </div>
      </div>

      {/* Kernel & Power Profile Matrix */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-slate-800 bg-[#0D121D] p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">
            Windows Power Plan
          </div>
          <div className="mt-1 font-display text-base font-semibold text-slate-100">
            {gamingModeActive ? 'Ultimate Performance' : 'Balanced (Default)'}
          </div>
          <div className="mt-1 font-mono-tabular text-xs text-cyan-400">
            {gamingModeActive ? 'Core Parking: 0% (Disabled)' : 'Core Parking: Dynamic'}
          </div>
        </div>

        <div className="rounded-md border border-slate-800 bg-[#0D121D] p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">
            GPU Power Management
          </div>
          <div className="mt-1 font-display text-base font-semibold text-slate-100">
            {gamingModeActive ? 'Prefer Maximum Perf' : 'Optimal Power'}
          </div>
          <div className="mt-1 font-mono-tabular text-xs text-amber-400">
            {gamingModeActive ? 'P0 State Locked' : 'Adaptive P-State'}
          </div>
        </div>

        <div className="rounded-md border border-slate-800 bg-[#0D121D] p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">
            Kernel Timer Resolution
          </div>
          <div className="mt-1 font-display text-base font-semibold text-slate-100">
            {gamingModeActive ? '0.50 ms High-Res' : '15.63 ms Standard'}
          </div>
          <div className="mt-1 font-mono-tabular text-xs text-emerald-400">
            {gamingModeActive ? 'Frame Pacing Stabilized' : 'OS Default Tick'}
          </div>
        </div>

        <div className="rounded-md border border-slate-800 bg-[#0D121D] p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">
            Reclaimed Overhead
          </div>
          <div className="mt-1 font-mono-tabular text-xl font-bold text-amber-400">
            {freedRamMb} MB{' '}
            <span className="text-xs font-normal text-slate-400">
              · -{reducedCpuPct.toFixed(1)}% CPU
            </span>
          </div>
          <div className="mt-1 font-mono-tabular text-xs text-slate-400">
            {suspendedServices.length} background services paused
          </div>
        </div>
      </div>

      {/* Intelligent Windows Service Matrix */}
      <section className="rounded-md border border-slate-800 bg-[#0D121D] p-5">
        <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
            <h3 className="font-display text-sm font-semibold text-slate-100">
              Windows 10/11 Service Orchestration Matrix
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            Critical GPU &amp; Audio drivers remain protected
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3 font-medium">Service</th>
                <th className="py-2 px-2 font-medium">Category</th>
                <th className="py-2 px-2 font-medium">Optimization Rationale</th>
                <th className="py-2 px-2 text-right font-medium">Footprint</th>
                <th className="py-2 pl-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {services.map((svc) => (
                <tr key={svc.serviceName} className="hover:bg-slate-800/25">
                  <td className="py-2.5 pr-3">
                    <div className="font-medium text-slate-100">{svc.shortLabel}</div>
                    <div className="font-mono-tabular text-[11px] text-slate-500">
                      {svc.serviceName}
                    </div>
                  </td>
                  <td className="py-2.5 px-2 font-mono-tabular text-slate-300">{svc.category}</td>
                  <td className="py-2.5 px-2 text-slate-400">{svc.rationale}</td>
                  <td className="py-2.5 px-2 text-right font-mono-tabular text-slate-300 whitespace-nowrap">
                    {svc.memoryMb} MB · {svc.cpuOverheadPct}%
                  </td>
                  <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                    {svc.safeToSuspendForGaming ? (
                      <button
                        type="button"
                        onClick={() => onToggleSingleService(svc.serviceName)}
                        className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-mono-tabular text-xs font-medium transition-colors ${
                          svc.status === 'Suspended'
                            ? 'border border-amber-500/40 bg-amber-500/15 text-amber-300'
                            : 'border border-slate-700 bg-[#07090E] text-slate-300 hover:border-cyan-500'
                        }`}
                      >
                        <Power className="h-3 w-3" />
                        {svc.status === 'Suspended' ? 'Suspended' : 'Running'}
                      </button>
                    ) : (
                      <span className="font-mono-tabular text-xs font-medium text-emerald-400">
                        ● Locked Active
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
