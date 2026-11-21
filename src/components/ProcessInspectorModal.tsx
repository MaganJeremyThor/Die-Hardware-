import React, { useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Lock,
  PowerOff,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { HardwareDomain, SystemProcessEntry } from '../types/hardware';
import { analyzeProcess } from '../utils/processAdvisor';

interface ProcessInspectorModalProps {
  process: SystemProcessEntry | null;
  focusDomain: HardwareDomain;
  onClose: () => void;
  onEndProcess: (proc: SystemProcessEntry) => void;
}

export const ProcessInspectorModal: React.FC<ProcessInspectorModalProps> = ({
  process,
  focusDomain,
  onClose,
  onEndProcess,
}) => {
  useEffect(() => {
    if (!process) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [process, onClose]);

  if (!process) return null;

  const advice = analyzeProcess(process, focusDomain);

  const needAccent =
    advice.hardwareNeedLevel === 'required'
      ? {
          border: 'border-cyan-500/40',
          bg: 'bg-cyan-500/10',
          text: 'text-cyan-300',
          icon: ShieldCheck,
          pill: 'REQUIRED BY HARDWARE / OS',
        }
      : advice.hardwareNeedLevel === 'active-workload'
      ? {
          border: 'border-amber-500/40',
          bg: 'bg-amber-500/10',
          text: 'text-amber-300',
          icon: AlertTriangle,
          pill: 'ACTIVE WORKLOAD (OPTIONAL)',
        }
      : {
          border: 'border-emerald-500/40',
          bg: 'bg-emerald-500/10',
          text: 'text-emerald-300',
          icon: ShieldAlert,
          pill: 'NOT NEEDED BY HARDWARE',
        };

  const NeedIcon = needAccent.icon;
  const recommendEnd = advice.recommendation === 'End Process';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="process-inspector-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-md border border-slate-700 bg-[#0B101B] shadow-2xl"
      >
        {/* Top Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 font-mono-tabular text-[11px] font-semibold text-cyan-300">
                <Cpu className="h-3 w-3" />
                {focusDomain} Inspector
              </span>
              <span className="font-mono-tabular text-xs text-slate-400">
                PID #{process.pid} · {process.exeName}
              </span>
            </div>
            <h2
              id="process-inspector-title"
              className="mt-1.5 truncate font-display text-lg font-bold text-slate-50"
            >
              {process.processName}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close process inspector"
            className="rounded border border-slate-700 bg-[#07090E] p-1.5 text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Live Telemetry Readout Strip */}
        <div className="grid grid-cols-3 gap-2 border-b border-slate-800 bg-[#07090E] px-5 py-3 font-mono-tabular text-xs sm:grid-cols-6">
          <div>
            <div className="text-[10px] uppercase text-slate-500">CPU</div>
            <div className="font-semibold text-cyan-300">{process.cpuPct.toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-500">GPU</div>
            <div className="font-semibold text-amber-300">{process.gpuPct}%</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-500">VRAM</div>
            <div className="font-semibold text-amber-300">{process.vramMb} MB</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-500">RAM</div>
            <div className="font-semibold text-slate-200">{process.ramMb} MB</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-500">SSD I/O</div>
            <div className="font-semibold text-slate-200">{process.diskMbps} MB/s</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-500">Net</div>
            <div className="font-semibold text-slate-200">{process.netMbps} Mbps</div>
          </div>
        </div>

        {/* Body: Hardware Necessity + Recommendation */}
        <div className="space-y-4 p-5 text-xs">
          {/* 1. Does Hardware Need This to Run? */}
          <div className={`rounded border ${needAccent.border} ${needAccent.bg} p-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                Does {focusDomain} Need This to Run?
              </span>
              <span
                className={`font-mono-tabular text-[11px] font-bold ${needAccent.text}`}
              >
                {needAccent.pill}
              </span>
            </div>
            <div className="mt-2 flex items-start gap-2.5">
              <NeedIcon className={`mt-0.5 h-4 w-4 shrink-0 ${needAccent.text}`} />
              <div>
                <div className={`font-display text-sm font-semibold ${needAccent.text}`}>
                  {advice.hardwareNeedTitle}
                </div>
                <p className="mt-1 leading-relaxed text-slate-200">
                  {advice.hardwareNeedSummary}
                </p>
              </div>
            </div>
          </div>

          {/* 2. Die Hardware Recommendation */}
          <div className="rounded border border-slate-800 bg-[#07090E] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                System Recommendation
              </span>
              <span
                className={`rounded px-2 py-0.5 font-mono-tabular text-[11px] font-semibold ${
                  recommendEnd
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                }`}
              >
                Recommended: {advice.recommendation}
              </span>
            </div>

            <p className="mt-2.5 leading-relaxed text-slate-200">
              {advice.recommendationReason}
            </p>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/90 pt-2.5 text-[11px]">
              <span className="text-slate-400">
                <strong className="text-slate-300">If ended:</strong> {advice.impactIfEnded}
              </span>
              <span className="font-mono-tabular font-semibold text-amber-300">
                {advice.reclaimSummary}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions: Let It Run vs End Process */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-[#080C14] px-5 py-3.5">
          {!advice.canEndProcess ? (
            <span className="inline-flex items-center gap-1.5 font-mono-tabular text-xs text-slate-400">
              <Lock className="h-3.5 w-3.5 text-cyan-400" />
              Protected system task — End Process locked for stability
            </span>
          ) : (
            <span className="text-xs text-slate-400">
              Choose whether to keep running or terminate PID #{process.pid}
            </span>
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-4 py-2 text-xs font-semibold transition-colors ${
                !recommendEnd
                  ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                  : 'border border-slate-700 bg-[#121929] text-slate-200 hover:border-slate-500 hover:text-white'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Let It Run
            </button>

            {advice.canEndProcess && (
              <button
                type="button"
                onClick={() => onEndProcess(process)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-4 py-2 text-xs font-semibold transition-colors ${
                  recommendEnd
                    ? 'bg-rose-500 text-white hover:bg-rose-400'
                    : 'border border-rose-500/50 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
                }`}
              >
                <PowerOff className="h-3.5 w-3.5" />
                End Process
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
