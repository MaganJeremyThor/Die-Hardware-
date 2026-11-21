import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Cpu,
  HardDrive,
  Layers,
  Network,
  SlidersHorizontal,
  Zap,
} from 'lucide-react';
import type {
  DashboardWidgetConfig,
  DashboardWidgetId,
  HardwareDomain,
  SystemProcessEntry,
  TelemetryFrame,
} from '../types/hardware';
import { analyzeProcess, getProcessesForDomain } from '../utils/processAdvisor';
import { TelemetryOscilloscope } from './TelemetryCharts';

interface FlightDeckViewProps {
  frame: TelemetryFrame;
  widgets: DashboardWidgetConfig[];
  onToggleWidget: (id: DashboardWidgetId) => void;
  onMoveWidget: (id: DashboardWidgetId, direction: 'up' | 'down') => void;
  onToggleWide: (id: DashboardWidgetId) => void;
  pollIntervalMs: number;
  onChangePollInterval: (ms: number) => void;
  onInspectProcess: (pid: number, domain: HardwareDomain) => void;
  onNavigateSection: (
    section: 'sensors' | 'graphics' | 'memory-bios' | 'gaming-mode' | 'csv-logger' | 'installer'
  ) => void;
}

export const FlightDeckView: React.FC<FlightDeckViewProps> = ({
  frame,
  widgets,
  onToggleWidget,
  onMoveWidget,
  onToggleWide,
  pollIntervalMs,
  onChangePollInterval,
  onInspectProcess,
  onNavigateSection,
}) => {
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const visibleWidgets = widgets.filter((w) => w.visible);

  const renderBadgeStyle = (badge: 'Required' | 'Let Run' | 'Can End') => {
    if (badge === 'Required') {
      return 'border-cyan-500/35 bg-cyan-500/10 text-cyan-300';
    }
    if (badge === 'Let Run') {
      return 'border-amber-500/35 bg-amber-500/10 text-amber-300';
    }
    return 'border-rose-500/35 bg-rose-500/10 text-rose-300';
  };

  const renderDomainProcesses = (
    domain: HardwareDomain,
    heading: string,
    formatMetric: (proc: SystemProcessEntry) => string,
    limit = 3
  ) => {
    const list = getProcessesForDomain(frame.processes, domain, limit);
    if (list.length === 0) return null;

    return (
      <div className="mt-3.5 border-t border-slate-800/90 pt-3">
        <div className="mb-2 flex items-center justify-between text-[11px]">
          <span className="font-semibold uppercase tracking-wider text-slate-400">{heading}</span>
          <span className="text-slate-500">Click running task for advice</span>
        </div>
        <div className="space-y-1.5">
          {list.map((proc) => {
            const advice = analyzeProcess(proc, domain);
            return (
              <button
                key={`${domain}-${proc.pid}`}
                type="button"
                onClick={() => onInspectProcess(proc.pid, domain)}
                className="group flex w-full items-center justify-between gap-2 rounded border border-slate-800/90 bg-[#07090E] px-2.5 py-1.5 text-left text-xs transition-colors hover:border-cyan-500/50 hover:bg-[#101726]"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-mono-tabular font-medium text-slate-200 group-hover:text-white">
                    {proc.processName}
                  </span>
                  <span className="shrink-0 font-mono-tabular text-[10px] text-slate-500">
                    #{proc.pid}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2 font-mono-tabular">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${renderBadgeStyle(
                      advice.recommendationBadge
                    )}`}
                  >
                    {advice.recommendationBadge}
                  </span>
                  <span className="text-slate-200">{formatMetric(proc)}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-cyan-400" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWidget = (widget: DashboardWidgetConfig) => {
    const spanClass = widget.spanWide ? 'lg:col-span-2' : 'lg:col-span-1';

    switch (widget.id) {
      case 'cpu-core-array':
        return (
          <section
            key={widget.id}
            className={`${spanClass} rounded-md border border-slate-800 bg-[#0D121D] p-5`}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold tracking-wide text-slate-100">
                  CPU
                </h2>
                <p className="text-xs text-slate-400">
                  {frame.cpuName} · {frame.cpuThreads} Threads
                </p>
              </div>
              <div className="text-right font-mono-tabular">
                <div className="text-2xl font-bold text-cyan-400">
                  {frame.cpuClockGhz.toFixed(2)}
                  <span className="ml-1 text-xs font-medium text-slate-400">GHz</span>
                </div>
                <div className="text-xs text-amber-400">
                  {frame.cpuTempF.toFixed(1)} °F · {frame.cpuLoadPct.toFixed(0)}% Load
                </div>
              </div>
            </div>

            <TelemetryOscilloscope
              primarySeries={frame.history.cpuLoad}
              primaryLabel="CPU Load"
              primaryColor="#06B6D4"
              unit="%"
              maxValue={100}
              height={104}
            />

            <div className="mt-3.5 grid grid-cols-4 gap-1.5 sm:grid-cols-8">
              {frame.cpuCores.slice(0, 16).map((core) => (
                <div
                  key={core.coreIndex}
                  className="rounded border border-slate-800/90 bg-[#07090E] px-2 py-1.5 text-center font-mono-tabular"
                  title={`Core ${core.coreIndex}: ${core.clockMhz} MHz · ${core.voltageV} V · ${core.tempF}°F`}
                >
                  <div className="text-[10px] text-slate-500">C{core.coreIndex}</div>
                  <div className="text-xs font-semibold text-slate-100">{core.loadPct}%</div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full bg-cyan-400"
                      style={{ width: `${core.loadPct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {renderDomainProcesses(
              'CPU',
              'Running on CPU',
              (proc) => `${proc.cpuPct.toFixed(1)}%`
            )}
          </section>
        );

      case 'gpu-ai-render':
        return (
          <section
            key={widget.id}
            className={`${spanClass} rounded-md border border-slate-800 bg-[#0D121D] p-5`}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold tracking-wide text-slate-100">
                  GPU &amp; AI Render
                </h2>
                <p className="text-xs text-slate-400">
                  {frame.gpuName} · {frame.aiRender.activeApp}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateSection('graphics')}
                className="shrink-0 whitespace-nowrap rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/20"
              >
                Tune GPU
              </button>
            </div>

            <div className="mb-3.5 grid grid-cols-3 gap-3">
              <div className="rounded border border-slate-800 bg-[#07090E] p-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">GPU Clock</div>
                <div className="mt-1 font-mono-tabular text-xl font-bold text-amber-400">
                  {frame.gpuClockMhz} <span className="text-xs text-slate-400">MHz</span>
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-[#07090E] p-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Temp / Peak</div>
                <div className="mt-1 font-mono-tabular text-xl font-bold text-slate-100">
                  {frame.gpuTempF.toFixed(0)}°{' '}
                  <span className="text-xs text-slate-400">/ {frame.gpuHotspotF.toFixed(0)}°F</span>
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-[#07090E] p-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">AI Load</div>
                <div className="mt-1 font-mono-tabular text-xl font-bold text-cyan-400">
                  {frame.aiRender.tensorCoreLoadPct}%
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded border border-slate-800/90 bg-[#07090E] p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">Frame Gen</span>
                <span className="font-mono-tabular font-medium text-amber-300">
                  {frame.aiRender.frameGeneration}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">AI Model</span>
                <span className="truncate font-mono-tabular text-cyan-300">
                  {frame.aiRender.aiModelName}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">Resolution</span>
                <span className="font-mono-tabular text-slate-200">
                  {frame.aiRender.renderResolution} → {frame.aiRender.outputResolution}
                </span>
              </div>
            </div>

            {renderDomainProcesses(
              'GPU',
              'Running on GPU',
              (proc) => `${proc.gpuPct}% · ${proc.vramMb} MB`
            )}
          </section>
        );

      case 'vram-inspector': {
        const vramPct = Math.round((frame.vramUsedMb / frame.vramTotalMb) * 100);
        const memProcs = getProcessesForDomain(frame.processes, 'RAM', 5);
        return (
          <section
            key={widget.id}
            className={`${spanClass} rounded-md border border-slate-800 bg-[#0D121D] p-5`}
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold tracking-wide text-slate-100">
                  VRAM &amp; RAM
                </h2>
                <p className="text-xs text-slate-400">
                  RAM: {frame.ramUsedGb} / {frame.ramTotalGb} GB · Click any app to inspect or end
                </p>
              </div>
              <div className="text-right font-mono-tabular">
                <div className="text-lg font-bold text-slate-100">
                  {(frame.vramUsedMb / 1024).toFixed(1)} / {(frame.vramTotalMb / 1024).toFixed(0)} GB
                </div>
                <div className="text-xs text-cyan-400">{vramPct}% VRAM Used</div>
              </div>
            </div>

            <div className="mb-3.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-amber-500"
                style={{ width: `${vramPct}%` }}
              />
            </div>

            <div className="space-y-1.5 text-xs">
              {memProcs.map((proc) => {
                const advice = analyzeProcess(proc, 'RAM');
                return (
                  <button
                    key={proc.pid}
                    type="button"
                    onClick={() => onInspectProcess(proc.pid, proc.vramMb > 0 ? 'GPU' : 'RAM')}
                    className="group flex w-full items-center justify-between gap-2 rounded border border-slate-800/90 bg-[#07090E] px-3 py-2 text-left transition-colors hover:border-cyan-500/50 hover:bg-[#101726]"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono-tabular font-medium text-slate-200 group-hover:text-white">
                          {proc.processName}
                        </span>
                        <span className="font-mono-tabular text-[10px] text-slate-500">
                          #{proc.pid}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {proc.engineType} · {proc.ramMb} MB RAM
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5 font-mono-tabular">
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${renderBadgeStyle(
                          advice.recommendationBadge
                        )}`}
                      >
                        {advice.recommendationBadge}
                      </span>
                      <div className="text-right">
                        <div className="font-semibold text-amber-300">
                          {proc.vramMb > 0 ? `${proc.vramMb} MB` : `${proc.ramMb} MB`}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {proc.vramMb > 0 ? `${proc.gpuPct}% GPU` : `${proc.cpuPct.toFixed(1)}% CPU`}
                        </div>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-cyan-400" />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      }

      case 'storage-io':
        return (
          <section
            key={widget.id}
            className={`${spanClass} rounded-md border border-slate-800 bg-[#0D121D] p-5`}
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold tracking-wide text-slate-100">
                  Storage Speed
                </h2>
                <p className="text-xs text-slate-400">Live SSD Read / Write &amp; Temps</p>
              </div>
              <span className="font-mono-tabular text-xs text-slate-400">
                Queue {frame.storage[0]?.queueDepth ?? 1}
              </span>
            </div>

            <TelemetryOscilloscope
              primarySeries={frame.history.storageReadMbps}
              secondarySeries={frame.history.storageWriteMbps}
              primaryLabel="Read"
              secondaryLabel="Write"
              primaryColor="#06B6D4"
              secondaryColor="#F59E0B"
              unit="MB/s"
              maxValue={7500}
              height={96}
            />

            <div className="mt-3 space-y-2">
              {frame.storage.map((drive) => (
                <div
                  key={drive.id}
                  className="flex items-center justify-between rounded border border-slate-800 bg-[#07090E] px-3 py-2 text-xs"
                >
                  <div>
                    <div className="font-medium text-slate-200">{drive.label}</div>
                    <div className="text-[11px] text-slate-500">
                      {drive.interfaceBus} · Health {drive.healthPct}%
                    </div>
                  </div>
                  <div className="text-right font-mono-tabular">
                    <div className="text-cyan-300">
                      R {drive.readMbps} · <span className="text-amber-300">W {drive.writeMbps}</span>{' '}
                      MB/s
                    </div>
                    <div className="text-[11px] text-slate-400">{drive.tempF.toFixed(1)} °F</div>
                  </div>
                </div>
              ))}
            </div>

            {renderDomainProcesses(
              'Storage',
              'Apps Using Storage',
              (proc) => `${proc.diskMbps} MB/s`
            )}
          </section>
        );

      case 'network-bandwidth':
        return (
          <section
            key={widget.id}
            className={`${spanClass} rounded-md border border-slate-800 bg-[#0D121D] p-5`}
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold tracking-wide text-slate-100">
                  Network Speed
                </h2>
                <p className="text-xs text-slate-400">
                  {frame.network.adapterName} · {frame.network.linkSpeedGbps} Gbps
                </p>
              </div>
              <div className="text-right font-mono-tabular text-xs">
                <div className="text-emerald-400">Ping {frame.network.latencyMs.toFixed(1)} ms</div>
                <div className="text-slate-500">Loss {frame.network.packetLossPct.toFixed(1)}%</div>
              </div>
            </div>

            <TelemetryOscilloscope
              primarySeries={frame.history.netRxMbps}
              secondarySeries={frame.history.netTxMbps}
              primaryLabel="Net Down"
              secondaryLabel="Net Up"
              primaryColor="#06B6D4"
              secondaryColor="#F59E0B"
              unit="Mbps"
              height={110}
            />

            {renderDomainProcesses(
              'Network',
              'Apps Using Network',
              (proc) => `${proc.netMbps.toFixed(1)} Mbps`
            )}
          </section>
        );

      case 'power-telemetry':
        return (
          <section
            key={widget.id}
            className={`${spanClass} rounded-md border border-slate-800 bg-[#0D121D] p-5`}
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold tracking-wide text-slate-100">
                  Power Draw
                </h2>
                <p className="text-xs text-slate-400">
                  Wall Input · PSU Efficiency {frame.power.psuEfficiencyPct}%
                </p>
              </div>
              <div className="text-right font-mono-tabular">
                <div className="text-2xl font-bold text-amber-400">
                  {frame.power.totalSystemW.toFixed(0)}
                  <span className="ml-1 text-xs font-medium text-slate-400">W</span>
                </div>
              </div>
            </div>

            <TelemetryOscilloscope
              primarySeries={frame.history.powerW}
              primaryLabel="Total Power"
              primaryColor="#F59E0B"
              unit="W"
              maxValue={900}
              height={96}
            />

            <div className="mt-3 grid grid-cols-3 gap-2 text-center font-mono-tabular text-xs">
              <div className="rounded border border-slate-800 bg-[#07090E] py-2">
                <div className="text-[10px] text-slate-500">CPU Power</div>
                <div className="font-semibold text-slate-100">{frame.power.cpuPackageW} W</div>
              </div>
              <div className="rounded border border-slate-800 bg-[#07090E] py-2">
                <div className="text-[10px] text-slate-500">GPU Power</div>
                <div className="font-semibold text-slate-100">{frame.power.gpuBoardW} W</div>
              </div>
              <div className="rounded border border-slate-800 bg-[#07090E] py-2">
                <div className="text-[10px] text-slate-500">12V Rail</div>
                <div className="font-semibold text-cyan-300">{frame.power.rail12V.toFixed(3)} V</div>
              </div>
            </div>
          </section>
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* Live Source & Quick Telemetry Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-slate-800 bg-[#0D121D] px-5 py-3.5">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <div className="flex items-center gap-2.5">
            <Cpu className="h-4 w-4 text-cyan-400" />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">CPU</div>
              <div className="font-mono-tabular text-sm font-semibold text-slate-100">
                {frame.cpuTempF.toFixed(1)} °F · {frame.cpuClockGhz.toFixed(2)} GHz
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Layers className="h-4 w-4 text-amber-400" />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">GPU</div>
              <div className="font-mono-tabular text-sm font-semibold text-slate-100">
                {frame.gpuClockMhz} MHz · {frame.gpuTempF.toFixed(0)} °F
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <HardDrive className="h-4 w-4 text-cyan-400" />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">SSD Read/Write</div>
              <div className="font-mono-tabular text-sm font-semibold text-slate-100">
                {frame.storage[0]?.readMbps} / {frame.storage[0]?.writeMbps} MB/s
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Network className="h-4 w-4 text-amber-400" />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Net / Power</div>
              <div className="font-mono-tabular text-sm font-semibold text-slate-100">
                {frame.network.rxMbps.toFixed(0)} Mbps · {frame.power.totalSystemW.toFixed(0)} W
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCustomizeOpen((prev) => !prev)}
          aria-expanded={customizeOpen}
          className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded border border-slate-700 bg-[#141B2B] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-cyan-500/50 hover:text-white"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-400" />
          Customize
        </button>
      </div>

      {/* Hardware Source Verification Bar */}
      {frame.sourceMode === 'Preview Profile' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
          <span>
            <strong className="font-semibold">Hardware Verification:</strong> {frame.verificationNote}
          </span>
          <button
            type="button"
            onClick={() => onNavigateSection('installer')}
            className="shrink-0 whitespace-nowrap rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-400"
          >
            Install App for Live Sensors
          </button>
        </div>
      )}

      {/* Dashboard Customization Panel */}
      {customizeOpen && (
        <div className="rounded-md border border-cyan-500/30 bg-[#0D121D] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-100">
                Dashboard Layout &amp; Refresh Rate
              </h3>
              <p className="text-xs text-slate-400">
                Show, hide, reorder, or widen panels. Saved automatically.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Live Stream:</span>
              {[50, 100, 250, 500].map((ms) => (
                <button
                  key={ms}
                  type="button"
                  onClick={() => onChangePollInterval(ms)}
                  className={`rounded px-2.5 py-1 font-mono-tabular text-xs transition-colors ${
                    pollIntervalMs === ms
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'border border-slate-700 bg-[#07090E] text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {ms}ms ({Math.round(1000 / ms)}Hz)
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
            {widgets.map((w, idx) => (
              <div
                key={w.id}
                className="flex items-center justify-between rounded border border-slate-800 bg-[#07090E] px-3 py-2.5"
              >
                <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-slate-200">
                  <input
                    type="checkbox"
                    checked={w.visible}
                    onChange={() => onToggleWidget(w.id)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-cyan-500"
                  />
                  <span>{w.title}</span>
                </label>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onToggleWide(w.id)}
                    className={`rounded px-2 py-1 text-[11px] font-mono-tabular ${
                      w.spanWide
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'border border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                    title="Toggle 2-column width"
                  >
                    {w.spanWide ? '2x' : '1x'}
                  </button>
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => onMoveWidget(w.id, 'up')}
                    aria-label={`Move ${w.title} up`}
                    className="rounded border border-slate-800 p-1 text-slate-400 hover:text-slate-100 disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === widgets.length - 1}
                    onClick={() => onMoveWidget(w.id, 'down')}
                    aria-label={`Move ${w.title} down`}
                    className="rounded border border-slate-800 p-1 text-slate-400 hover:text-slate-100 disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customizable Telemetry Widget Grid */}
      {visibleWidgets.length === 0 ? (
        <div className="rounded-md border border-slate-800 bg-[#0D121D] p-10 text-center">
          <Zap className="mx-auto mb-3 h-7 w-7 text-amber-400" />
          <p className="font-display text-base font-semibold text-slate-100">
            No Panels Active
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Click Customize above to turn on CPU, GPU, Storage, Network, or Power panels.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visibleWidgets.map((w) => renderWidget(w))}
        </div>
      )}
    </div>
  );
};
