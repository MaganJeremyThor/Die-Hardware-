import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Cpu,
  Download,
  FileSpreadsheet,
  Flame,
  Gauge,
  LayoutDashboard,
  MemoryStick,
  RotateCcw,
} from 'lucide-react';
import { CsvLoggerView } from './components/CsvLoggerView';
import { FlightDeckView } from './components/FlightDeckView';
import { GamingModeView } from './components/GamingModeView';
import { GraphicsAiView } from './components/GraphicsAiView';
import { MemoryBiosView } from './components/MemoryBiosView';
import { ProcessInspectorModal } from './components/ProcessInspectorModal';
import { SensorMatrixView } from './components/SensorMatrixView';
import { WindowsInstallerView } from './components/WindowsInstallerView';
import type {
  AppSection,
  CsvTelemetryRow,
  DashboardWidgetConfig,
  DashboardWidgetId,
  GpuOverclockProfile,
  GpuVendor,
  HardwareDomain,
  RamTimingsConfig,
  SystemProcessEntry,
  TelemetryFrame,
  WindowsServiceEntry,
} from './types/hardware';
import { buildOrganizedCsvRows } from './utils/csvFormatter';
import {
  connectLiveAgentStream,
  getAgentBaseUrl,
  mergeAgentTelemetry,
  probeBrowserHardware,
  terminateAgentProcess,
  type WindowsAgentPayload,
} from './utils/liveBridge';
import { formatReclaimSummary } from './utils/processAdvisor';
import { RAM_PRESETS } from './utils/ramTuning';
import {
  GPU_OC_PRESETS,
  INITIAL_WINDOWS_SERVICES,
  createInitialFrame,
  stepTelemetryFrame,
} from './utils/telemetryEngine';

const DEFAULT_WIDGETS: DashboardWidgetConfig[] = [
  { id: 'cpu-core-array', title: 'CPU', visible: true, spanWide: false },
  { id: 'gpu-ai-render', title: 'GPU & AI Render', visible: true, spanWide: false },
  { id: 'vram-inspector', title: 'VRAM & RAM', visible: true, spanWide: false },
  { id: 'storage-io', title: 'Storage Speed', visible: true, spanWide: false },
  { id: 'network-bandwidth', title: 'Network Speed', visible: true, spanWide: false },
  { id: 'power-telemetry', title: 'Power Draw', visible: true, spanWide: false },
];

const STORAGE_KEYS = {
  widgets: 'die_hardware_widgets_v2',
  pollMs: 'die_hardware_stream_ms_v2',
};

function loadWidgets(): DashboardWidgetConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.widgets);
    if (!raw) return DEFAULT_WIDGETS;
    const parsed = JSON.parse(raw) as DashboardWidgetConfig[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_WIDGETS;
    return parsed;
  } catch {
    return DEFAULT_WIDGETS;
  }
}

export default function App() {
  const [browserProbe] = useState(() => probeBrowserHardware());
  const [agentConnected, setAgentConnected] = useState(false);

  const [activeSection, setActiveSection] = useState<AppSection>('flight-deck');
  const [widgets, setWidgets] = useState<DashboardWidgetConfig[]>(loadWidgets);
  // Default to 100ms (10 Hz) zero-delay live feed
  const [pollIntervalMs, setPollIntervalMs] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEYS.pollMs));
      return [50, 100, 250, 500].includes(saved) ? saved : 100;
    } catch {
      return 100;
    }
  });

  const [gpuVendor, setGpuVendor] = useState<GpuVendor>(
    () => browserProbe.detectedVendor ?? 'NVIDIA'
  );
  const [draftOcProfile, setDraftOcProfile] = useState<GpuOverclockProfile>({
    presetId: 'balanced',
    ...GPU_OC_PRESETS.balanced,
  });
  const [appliedOcProfile, setAppliedOcProfile] = useState<GpuOverclockProfile>({
    presetId: 'balanced',
    ...GPU_OC_PRESETS.balanced,
  });

  const [ramConfig, setRamConfig] = useState<RamTimingsConfig>(RAM_PRESETS['EXPO 6000 CL30']);
  const [stagedBiosConfig, setStagedBiosConfig] = useState<RamTimingsConfig | null>(null);

  const [gamingModeActive, setGamingModeActive] = useState(false);
  const [services, setServices] = useState<WindowsServiceEntry[]>(INITIAL_WINDOWS_SERVICES);

  const [terminatedPids, setTerminatedPids] = useState<number[]>([]);
  const [inspectedTarget, setInspectedTarget] = useState<{
    pid: number;
    domain: HardwareDomain;
  } | null>(null);
  const [endedNotice, setEndedNotice] = useState<string | null>(null);

  const [autoLogging, setAutoLogging] = useState(true);
  const [frame, setFrame] = useState<TelemetryFrame>(() =>
    createInitialFrame(
      browserProbe.detectedVendor ?? 'NVIDIA',
      { presetId: 'balanced', ...GPU_OC_PRESETS.balanced },
      false,
      browserProbe,
      100,
      []
    )
  );
  const [csvRows, setCsvRows] = useState<CsvTelemetryRow[]>(() =>
    buildOrganizedCsvRows(frame, RAM_PRESETS['EXPO 6000 CL30'])
  );

  // Refs for zero-blocking real-time stream loop & instant SSE push handler
  const startPerfMsRef = useRef<number>(
    typeof performance !== 'undefined' ? performance.now() : Date.now()
  );
  const lastCsvLoggedMsRef = useRef<number>(0);
  const latestAgentPayloadRef = useRef<{
    payload: WindowsAgentPayload;
    latencyMs: number;
  } | null>(null);
  const stateRefs = useRef({
    gpuVendor,
    appliedOcProfile,
    gamingModeActive,
    autoLogging,
    ramConfig,
    pollIntervalMs,
    terminatedPids,
  });

  useEffect(() => {
    stateRefs.current = {
      gpuVendor,
      appliedOcProfile,
      gamingModeActive,
      autoLogging,
      ramConfig,
      pollIntervalMs,
      terminatedPids,
    };
  }, [
    gpuVendor,
    appliedOcProfile,
    gamingModeActive,
    autoLogging,
    ramConfig,
    pollIntervalMs,
    terminatedPids,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.widgets, JSON.stringify(widgets));
    } catch {
      // Ignore storage quota errors
    }
  }, [widgets]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.pollMs, String(pollIntervalMs));
    } catch {
      // Ignore storage quota errors
    }
  }, [pollIntervalMs]);

  // 1. Persistent zero-delay Server-Sent Events (SSE) push stream from installed Windows Agent
  useEffect(() => {
    const disconnect = connectLiveAgentStream(
      (payload, latencyMs) => {
        latestAgentPayloadRef.current = { payload, latencyMs };
        const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const elapsedSec = (nowPerf - startPerfMsRef.current) / 1000 + 4;
        const s = stateRefs.current;

        setFrame((prevFrame) => {
          const base = stepTelemetryFrame(
            prevFrame,
            elapsedSec,
            s.gpuVendor,
            s.appliedOcProfile,
            s.gamingModeActive,
            browserProbe,
            100,
            s.terminatedPids
          );
          const merged = mergeAgentTelemetry(base, payload, latencyMs, s.terminatedPids);
          if (s.autoLogging && nowPerf - lastCsvLoggedMsRef.current >= 1000) {
            lastCsvLoggedMsRef.current = nowPerf;
            const nextRows = buildOrganizedCsvRows(merged, s.ramConfig);
            setCsvRows((existing) => [...existing, ...nextRows].slice(-450));
          }
          return merged;
        });
      },
      (connected) => {
        setAgentConnected(connected);
        if (!connected) {
          latestAgentPayloadRef.current = null;
        }
      }
    );

    return disconnect;
  }, [browserProbe]);

  // 2. Non-blocking real-time high-frequency stream loop (100ms / 10Hz default) when SSE push isn't active
  useEffect(() => {
    if (agentConnected) return;

    const timer = window.setInterval(() => {
      const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsedSec = (nowPerf - startPerfMsRef.current) / 1000 + 4;
      const s = stateRefs.current;

      setFrame((prevFrame) => {
        const stepped = stepTelemetryFrame(
          prevFrame,
          elapsedSec,
          s.gpuVendor,
          s.appliedOcProfile,
          s.gamingModeActive,
          browserProbe,
          s.pollIntervalMs,
          s.terminatedPids
        );
        const finalFrame = latestAgentPayloadRef.current
          ? mergeAgentTelemetry(
              stepped,
              latestAgentPayloadRef.current.payload,
              latestAgentPayloadRef.current.latencyMs,
              s.terminatedPids
            )
          : stepped;

        if (s.autoLogging && nowPerf - lastCsvLoggedMsRef.current >= 1000) {
          lastCsvLoggedMsRef.current = nowPerf;
          const nextRows = buildOrganizedCsvRows(finalFrame, s.ramConfig);
          setCsvRows((existing) => [...existing, ...nextRows].slice(-450));
        }
        return finalFrame;
      });
    }, pollIntervalMs);

    return () => window.clearInterval(timer);
  }, [pollIntervalMs, agentConnected, browserProbe]);

  const handleToggleWidget = useCallback((id: DashboardWidgetId) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w))
    );
  }, []);

  const handleToggleWide = useCallback((id: DashboardWidgetId) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, spanWide: !w.spanWide } : w))
    );
  }, []);

  const handleMoveWidget = useCallback((id: DashboardWidgetId, direction: 'up' | 'down') => {
    setWidgets((prev) => {
      const idx = prev.findIndex((w) => w.id === id);
      if (idx === -1) return prev;
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  }, []);

  const handleOptimizeGamingMode = useCallback(() => {
    setGamingModeActive(true);
    setServices((prev) =>
      prev.map((svc) =>
        svc.safeToSuspendForGaming ? { ...svc, status: 'Suspended' } : svc
      )
    );
    if (agentConnected) {
      fetch(`${getAgentBaseUrl()}/gaming-mode`, { method: 'POST' }).catch(() => {});
    }
  }, [agentConnected]);

  const handleRestoreStandardMode = useCallback(() => {
    setGamingModeActive(false);
    setServices((prev) => prev.map((svc) => ({ ...svc, status: 'Running' })));
    if (agentConnected) {
      fetch(`${getAgentBaseUrl()}/restore-mode`, { method: 'POST' }).catch(() => {});
    }
  }, [agentConnected]);

  const handleToggleSingleService = useCallback((serviceName: string) => {
    setServices((prev) =>
      prev.map((svc) =>
        svc.serviceName === serviceName && svc.safeToSuspendForGaming
          ? { ...svc, status: svc.status === 'Running' ? 'Suspended' : 'Running' }
          : svc
      )
    );
  }, []);

  const handleCaptureCsvNow = useCallback(() => {
    const newRows = buildOrganizedCsvRows(frame, ramConfig);
    setCsvRows((existing) => [...existing, ...newRows].slice(-450));
  }, [frame, ramConfig]);

  const handleInspectProcess = useCallback((pid: number, domain: HardwareDomain) => {
    setInspectedTarget({ pid, domain });
  }, []);

  const handleEndProcess = useCallback(
    (proc: SystemProcessEntry) => {
      const nextEnded = Array.from(new Set([...stateRefs.current.terminatedPids, proc.pid]));
      stateRefs.current.terminatedPids = nextEnded;
      setTerminatedPids(nextEnded);
      setInspectedTarget(null);
      setEndedNotice(
        `Ended ${proc.processName} (#${proc.pid}) · ${formatReclaimSummary(proc)}`
      );

      // Apply immediate 0ms state transition before next stream tick
      const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsedSec = (nowPerf - startPerfMsRef.current) / 1000 + 4;
      const s = stateRefs.current;
      setFrame((prev) =>
        stepTelemetryFrame(
          prev,
          elapsedSec,
          s.gpuVendor,
          s.appliedOcProfile,
          s.gamingModeActive,
          browserProbe,
          s.pollIntervalMs,
          nextEnded
        )
      );

      if (agentConnected) {
        terminateAgentProcess(proc.pid).catch(() => {});
      }
    },
    [agentConnected, browserProbe]
  );

  const handleRestoreEndedProcesses = useCallback(() => {
    stateRefs.current.terminatedPids = [];
    setTerminatedPids([]);
    setEndedNotice(null);
    const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsedSec = (nowPerf - startPerfMsRef.current) / 1000 + 4;
    const s = stateRefs.current;
    setFrame((prev) =>
      stepTelemetryFrame(
        prev,
        elapsedSec,
        s.gpuVendor,
        s.appliedOcProfile,
        s.gamingModeActive,
        browserProbe,
        s.pollIntervalMs,
        []
      )
    );
  }, [browserProbe]);

  const navItems: Array<{
    id: AppSection;
    label: string;
    icon: typeof LayoutDashboard;
  }> = [
    { id: 'flight-deck', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'sensors', label: 'Sensors', icon: Activity },
    { id: 'graphics', label: 'Graphics', icon: Flame },
    { id: 'memory-bios', label: 'RAM & BIOS', icon: MemoryStick },
    { id: 'gaming-mode', label: 'Gaming Mode', icon: Gauge },
    { id: 'csv-logger', label: 'CSV Log', icon: FileSpreadsheet },
    { id: 'installer', label: 'Install App', icon: Download },
  ];

  const activeHz = agentConnected ? 10 : Math.round(1000 / pollIntervalMs);

  return (
    <div className="flight-grid-bg min-h-screen bg-[#07090E] text-[#E6EDF7] flex flex-col lg:flex-row">
      {/* Native Desktop Sidebar Rail */}
      <aside className="w-full shrink-0 border-b border-slate-800 bg-[#0A0D16] lg:w-64 lg:border-b-0 lg:border-r flex flex-col justify-between">
        <div>
          {/* Top-Left Brand Lockup: Large "Die Hardware" + smaller "Carolina Blocks Studio" directly underneath */}
          <div className="border-b border-slate-800 px-5 py-5">
            <div className="flex items-center gap-3">
              <img
                src="/src/assets/images/die_hardware_emblem_1794847286676.jpg"
                alt="Die Hardware logo"
                referrerPolicy="no-referrer"
                className="h-11 w-11 shrink-0 rounded border border-slate-700 object-cover"
              />
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-bold leading-none tracking-tight text-slate-50 whitespace-nowrap">
                  Die Hardware
                </h1>
                <p className="mt-1 text-xs font-medium tracking-wide text-amber-400 whitespace-nowrap">
                  Carolina Blocks Studio
                </p>
              </div>
            </div>
          </div>

          <nav aria-label="Primary hardware modules" className="p-3">
            <ul className="flex gap-1.5 overflow-x-auto lg:flex-col">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <li key={item.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveSection(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded px-3.5 py-2.5 text-xs font-medium transition-colors ${
                        active
                          ? 'bg-[#151D2E] text-amber-300 border border-amber-500/40'
                          : 'text-slate-300 border border-transparent hover:bg-[#111726] hover:text-white'
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          active ? 'text-amber-400' : 'text-slate-400'
                        }`}
                      />
                      <span>{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        {/* Bottom Environment Summary */}
        <div className="hidden border-t border-slate-800 p-4 text-[11px] text-slate-400 lg:block">
          <div className="flex items-center justify-between">
            <span>Units</span>
            <span className="font-mono-tabular text-slate-200">USA (°F)</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span>Stream Rate</span>
            <span className="font-mono-tabular text-cyan-300">
              {activeHz} Hz ({agentConnected ? '100' : pollIntervalMs}ms)
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span>Data Source</span>
            <span
              className={`font-mono-tabular ${
                frame.sourceMode === 'Live Windows Agent (Double-Checked)'
                  ? 'text-emerald-400'
                  : 'text-amber-300'
              }`}
            >
              {frame.sourceMode === 'Live Windows Agent (Double-Checked)'
                ? 'Live SSE Push'
                : 'Preview'}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span>CSV Log</span>
            <span
              className={`font-mono-tabular ${
                autoLogging ? 'text-emerald-400' : 'text-slate-500'
              }`}
            >
              {autoLogging ? 'Active' : 'Paused'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-[#0A0D16]/90 px-6 py-3">
          <div className="flex items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5 font-mono-tabular text-cyan-300">
              <Cpu className="h-3.5 w-3.5" />
              {frame.osVersion}
            </span>
            <span className="hidden text-slate-600 sm:inline">|</span>
            <span className="hidden items-center gap-2 font-mono-tabular text-emerald-400 sm:inline-flex">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
              LIVE {activeHz} Hz ·{' '}
              {agentConnected
                ? `${frame.feedLatencyMs}ms SSE Push`
                : `Instant (${pollIntervalMs}ms)`}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setAutoLogging((v) => !v)}
              className={`whitespace-nowrap rounded border px-3 py-1.5 font-mono-tabular text-xs font-medium transition-colors ${
                autoLogging
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  : 'border-slate-700 bg-[#0D121D] text-slate-300 hover:border-slate-500'
              }`}
            >
              CSV Log: {autoLogging ? 'ON' : 'OFF'}
            </button>

            <button
              type="button"
              onClick={
                gamingModeActive ? handleRestoreStandardMode : handleOptimizeGamingMode
              }
              className={`whitespace-nowrap rounded px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                gamingModeActive
                  ? 'border border-cyan-500/50 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25'
                  : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
              }`}
            >
              {gamingModeActive ? 'Gaming Mode: ON' : 'Optimize Gaming Mode'}
            </button>
          </div>
        </header>

        <main className="flex-1 p-5 lg:p-6">
          {endedNotice && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200">
              <span className="font-mono-tabular">{endedNotice}</span>
              {!agentConnected && (
                <button
                  type="button"
                  onClick={handleRestoreEndedProcesses}
                  className="inline-flex items-center gap-1.5 rounded border border-emerald-500/40 bg-[#07090E] px-2.5 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20"
                >
                  <RotateCcw className="h-3 w-3" />
                  Restore Sample Processes
                </button>
              )}
            </div>
          )}

          {activeSection === 'flight-deck' && (
            <FlightDeckView
              frame={frame}
              widgets={widgets}
              onToggleWidget={handleToggleWidget}
              onMoveWidget={handleMoveWidget}
              onToggleWide={handleToggleWide}
              pollIntervalMs={pollIntervalMs}
              onChangePollInterval={setPollIntervalMs}
              onInspectProcess={handleInspectProcess}
              onNavigateSection={setActiveSection}
            />
          )}

          {activeSection === 'sensors' && <SensorMatrixView frame={frame} />}

          {activeSection === 'graphics' && (
            <GraphicsAiView
              frame={frame}
              gpuVendor={gpuVendor}
              onChangeVendor={setGpuVendor}
              ocProfile={draftOcProfile}
              appliedOcProfile={appliedOcProfile}
              onUpdateOcProfile={setDraftOcProfile}
              onApplyOcProfile={() => setAppliedOcProfile(draftOcProfile)}
              onResetOcProfile={() => {
                const stock: GpuOverclockProfile = {
                  presetId: 'stock',
                  ...GPU_OC_PRESETS.stock,
                };
                setDraftOcProfile(stock);
                setAppliedOcProfile(stock);
              }}
              onInspectProcess={handleInspectProcess}
            />
          )}

          {activeSection === 'memory-bios' && (
            <MemoryBiosView
              ramConfig={ramConfig}
              stagedBiosConfig={stagedBiosConfig}
              onChangeRamConfig={setRamConfig}
              onStageBiosWrite={setStagedBiosConfig}
            />
          )}

          {activeSection === 'gaming-mode' && (
            <GamingModeView
              gamingModeActive={gamingModeActive}
              services={services}
              onOptimizeGamingMode={handleOptimizeGamingMode}
              onRestoreStandardMode={handleRestoreStandardMode}
              onToggleSingleService={handleToggleSingleService}
            />
          )}

          {activeSection === 'csv-logger' && (
            <CsvLoggerView
              autoLogging={autoLogging}
              onToggleAutoLogging={() => setAutoLogging((v) => !v)}
              rows={csvRows}
              onClearLog={() => setCsvRows([])}
              onCaptureSnapshotNow={handleCaptureCsvNow}
            />
          )}

          {activeSection === 'installer' && <WindowsInstallerView />}
        </main>
      </div>

      <ProcessInspectorModal
        process={
          inspectedTarget
            ? frame.processes.find((p) => p.pid === inspectedTarget.pid) ?? null
            : null
        }
        focusDomain={inspectedTarget?.domain ?? 'GPU'}
        onClose={() => setInspectedTarget(null)}
        onEndProcess={handleEndProcess}
      />
    </div>
  );
}
