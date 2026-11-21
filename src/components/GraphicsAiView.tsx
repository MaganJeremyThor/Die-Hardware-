import React, { useState } from 'react';
import { ChevronRight, Cpu, Flame, RotateCcw, Sparkles } from 'lucide-react';
import type {
  GpuOcPresetId,
  GpuOverclockProfile,
  GpuVendor,
  HardwareDomain,
  TelemetryFrame,
} from '../types/hardware';
import { analyzeProcess } from '../utils/processAdvisor';
import { GPU_OC_PRESETS } from '../utils/telemetryEngine';

interface GraphicsAiViewProps {
  frame: TelemetryFrame;
  gpuVendor: GpuVendor;
  onChangeVendor: (vendor: GpuVendor) => void;
  ocProfile: GpuOverclockProfile;
  appliedOcProfile: GpuOverclockProfile;
  onUpdateOcProfile: (next: GpuOverclockProfile) => void;
  onApplyOcProfile: () => void;
  onResetOcProfile: () => void;
  onInspectProcess: (pid: number, domain: HardwareDomain) => void;
}

export const GraphicsAiView: React.FC<GraphicsAiViewProps> = ({
  frame,
  gpuVendor,
  onChangeVendor,
  ocProfile,
  appliedOcProfile,
  onUpdateOcProfile,
  onApplyOcProfile,
  onResetOcProfile,
  onInspectProcess,
}) => {
  const [appliedBanner, setAppliedBanner] = useState<string | null>(null);

  const selectPreset = (presetId: GpuOcPresetId) => {
    const preset = GPU_OC_PRESETS[presetId];
    onUpdateOcProfile({
      presetId,
      coreOffsetMhz: preset.coreOffsetMhz,
      memOffsetMhz: preset.memOffsetMhz,
      powerLimitPct: preset.powerLimitPct,
      tempTargetF: preset.tempTargetF,
      voltageOffsetMv: preset.voltageOffsetMv,
      fanMode: preset.fanMode,
      fixedFanPct: preset.fixedFanPct,
    });
  };

  const handleApply = () => {
    onApplyOcProfile();
    setAppliedBanner(
      `${gpuVendor} OC applied: ${ocProfile.coreOffsetMhz >= 0 ? '+' : ''}${ocProfile.coreOffsetMhz} MHz Core · ${ocProfile.memOffsetMhz >= 0 ? '+' : ''}${ocProfile.memOffsetMhz} MHz VRAM · ${ocProfile.powerLimitPct}% Power · ${ocProfile.tempTargetF}°F Limit`
    );
  };

  const isDirty = JSON.stringify(ocProfile) !== JSON.stringify(appliedOcProfile);

  const vramTotalBreakdown =
    frame.aiRender.vramAllocation.modelWeightsMb +
    frame.aiRender.vramAllocation.frameBuffersMb +
    frame.aiRender.vramAllocation.rayTracingBvhMb +
    frame.aiRender.vramAllocation.texturesStreamMb +
    frame.aiRender.vramAllocation.desktopOsMb;

  return (
    <div className="space-y-5">
      {/* GPU Hardware & Vendor Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-slate-800 bg-[#0D121D] p-5">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-100">
            {frame.gpuName}
          </h2>
          <p className="text-xs text-slate-400">
            GPU Overclocking, AI Frame Generation, and Live VRAM Usage ({frame.gpuTempF.toFixed(1)} °F)
          </p>
        </div>

        <div className="flex items-center gap-2 rounded border border-slate-800 bg-[#07090E] p-1">
          {(['NVIDIA', 'AMD'] as GpuVendor[]).map((vendor) => (
            <button
              key={vendor}
              type="button"
              onClick={() => onChangeVendor(vendor)}
              className={`whitespace-nowrap rounded px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                gpuVendor === vendor
                  ? vendor === 'NVIDIA'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-rose-500 text-white'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {vendor === 'NVIDIA' ? 'NVIDIA GeForce' : 'AMD Radeon'}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split: Integrated Overclocking vs AI Render & Frame Generation Breakdown */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left 5 cols: Integrated Overclocking Profiles */}
        <section className="xl:col-span-5 rounded-md border border-slate-800 bg-[#0D121D] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-amber-400" />
              <h3 className="font-display text-base font-semibold text-slate-100">
                GPU Tuning
              </h3>
            </div>
            <span className="font-mono-tabular text-xs text-cyan-400">
              {gpuVendor === 'NVIDIA' ? 'NVIDIA NVAPI' : 'AMD Overdrive'}
            </span>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
            {(['stock', 'quiet', 'balanced', 'max-flight'] as GpuOcPresetId[]).map((id) => {
              const p = GPU_OC_PRESETS[id];
              const active = ocProfile.presetId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectPreset(id)}
                  className={`rounded border px-3 py-2 text-left transition-colors ${
                    active
                      ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                      : 'border-slate-800 bg-[#07090E] text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <div className="text-xs font-semibold">{p.label}</div>
                  <div className="mt-0.5 font-mono-tabular text-[11px] text-slate-400">
                    +{p.coreOffsetMhz} Core · {p.powerLimitPct}% Pwr
                  </div>
                </button>
              );
            })}
          </div>

          {/* Tuning Sliders */}
          <div className="space-y-3.5 border-t border-slate-800 pt-4 text-xs">
            <div>
              <div className="mb-1 flex justify-between">
                <label htmlFor="gpu-core-slider" className="text-slate-300">
                  Core Clock Offset
                </label>
                <span className="font-mono-tabular font-semibold text-amber-400">
                  {ocProfile.coreOffsetMhz >= 0 ? '+' : ''}
                  {ocProfile.coreOffsetMhz} MHz
                </span>
              </div>
              <input
                id="gpu-core-slider"
                type="range"
                min={-200}
                max={260}
                step={5}
                value={ocProfile.coreOffsetMhz}
                onChange={(e) =>
                  onUpdateOcProfile({
                    ...ocProfile,
                    presetId: 'custom',
                    coreOffsetMhz: Number(e.target.value),
                  })
                }
                className="w-full accent-amber-500"
              />
            </div>

            <div>
              <div className="mb-1 flex justify-between">
                <label htmlFor="gpu-mem-slider" className="text-slate-300">
                  VRAM Clock Offset
                </label>
                <span className="font-mono-tabular font-semibold text-cyan-400">
                  {ocProfile.memOffsetMhz >= 0 ? '+' : ''}
                  {ocProfile.memOffsetMhz} MHz
                </span>
              </div>
              <input
                id="gpu-mem-slider"
                type="range"
                min={-400}
                max={1500}
                step={25}
                value={ocProfile.memOffsetMhz}
                onChange={(e) =>
                  onUpdateOcProfile({
                    ...ocProfile,
                    presetId: 'custom',
                    memOffsetMhz: Number(e.target.value),
                  })
                }
                className="w-full accent-cyan-500"
              />
            </div>

            <div>
              <div className="mb-1 flex justify-between">
                <label htmlFor="gpu-power-slider" className="text-slate-300">
                  Power Limit
                </label>
                <span className="font-mono-tabular font-semibold text-slate-100">
                  {ocProfile.powerLimitPct}%
                </span>
              </div>
              <input
                id="gpu-power-slider"
                type="range"
                min={65}
                max={125}
                step={1}
                value={ocProfile.powerLimitPct}
                onChange={(e) =>
                  onUpdateOcProfile({
                    ...ocProfile,
                    presetId: 'custom',
                    powerLimitPct: Number(e.target.value),
                  })
                }
                className="w-full accent-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 flex justify-between">
                  <label htmlFor="gpu-temp-slider" className="text-slate-300">
                    Temp Limit
                  </label>
                  <span className="font-mono-tabular text-slate-200">{ocProfile.tempTargetF}°F</span>
                </div>
                <input
                  id="gpu-temp-slider"
                  type="range"
                  min={149}
                  max={194}
                  step={1}
                  value={ocProfile.tempTargetF}
                  onChange={(e) =>
                    onUpdateOcProfile({
                      ...ocProfile,
                      presetId: 'custom',
                      tempTargetF: Number(e.target.value),
                    })
                  }
                  className="w-full accent-cyan-500"
                />
              </div>

              <div>
                <div className="mb-1 flex justify-between">
                  <label htmlFor="gpu-volt-slider" className="text-slate-300">
                    Voltage
                  </label>
                  <span className="font-mono-tabular text-slate-200">
                    {ocProfile.voltageOffsetMv >= 0 ? '+' : ''}
                    {ocProfile.voltageOffsetMv} mV
                  </span>
                </div>
                <input
                  id="gpu-volt-slider"
                  type="range"
                  min={-75}
                  max={50}
                  step={5}
                  value={ocProfile.voltageOffsetMv}
                  onChange={(e) =>
                    onUpdateOcProfile({
                      ...ocProfile,
                      presetId: 'custom',
                      voltageOffsetMv: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-500"
                />
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Fan Mode</span>
                <div className="flex items-center gap-1">
                  {(['Auto', 'Aggressive', 'Fixed'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() =>
                        onUpdateOcProfile({ ...ocProfile, presetId: 'custom', fanMode: mode })
                      }
                      className={`rounded px-2.5 py-1 text-xs ${
                        ocProfile.fanMode === mode
                          ? 'bg-cyan-500 text-slate-950 font-semibold'
                          : 'border border-slate-700 bg-[#07090E] text-slate-300'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {ocProfile.fanMode === 'Fixed' && (
                <div>
                  <div className="mb-1 flex justify-between">
                    <label htmlFor="gpu-fan-slider" className="text-slate-300">
                      Fixed Fan Speed
                    </label>
                    <span className="font-mono-tabular text-cyan-300">
                      {ocProfile.fixedFanPct}%
                    </span>
                  </div>
                  <input
                    id="gpu-fan-slider"
                    type="range"
                    min={25}
                    max={100}
                    step={5}
                    value={ocProfile.fixedFanPct}
                    onChange={(e) =>
                      onUpdateOcProfile({
                        ...ocProfile,
                        presetId: 'custom',
                        fixedFanPct: Number(e.target.value),
                      })
                    }
                    className="w-full accent-cyan-500"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={handleApply}
              className="flex-1 whitespace-nowrap rounded bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400"
            >
              {isDirty ? 'Apply OC Profile*' : 'Apply OC Profile'}
            </button>
            <button
              type="button"
              onClick={() => {
                onResetOcProfile();
                setAppliedBanner('GPU restored to Stock clocks.');
              }}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-slate-700 bg-[#07090E] px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-500"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>

          {appliedBanner && (
            <div className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 font-mono-tabular text-[11px] text-emerald-300">
              {appliedBanner}
            </div>
          )}
        </section>

        {/* Right 7 cols: AI Rendering & Frame Generation Breakdown + VRAM Consumer Breakdown */}
        <section className="xl:col-span-7 space-y-5">
          <div className="rounded-md border border-slate-800 bg-[#0D121D] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-400" />
                <h3 className="font-display text-base font-semibold text-slate-100">
                  AI Render &amp; Frame Generation
                </h3>
              </div>
              <span className="font-mono-tabular text-xs text-amber-300">
                {frame.aiRender.graphicsApi}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded border border-slate-800 bg-[#07090E] p-3.5">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">
                  Frame Generation
                </div>
                <div className="mt-1 font-display text-base font-semibold text-amber-300">
                  {frame.aiRender.frameGeneration}
                </div>
                <div className="mt-1 font-mono-tabular text-xs text-slate-400">
                  {frame.aiRender.frameGenMultiplier} · {frame.aiRender.lowLatencyMode}
                </div>
              </div>

              <div className="rounded border border-slate-800 bg-[#07090E] p-3.5">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">
                  AI Model
                </div>
                <div className="mt-1 font-display text-base font-semibold text-cyan-300">
                  {frame.aiRender.aiModelName}
                </div>
                <div className="mt-1 font-mono-tabular text-xs text-slate-400">
                  Precision: {frame.aiRender.aiPrecision}
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded border border-slate-800 bg-[#07090E] p-3">
                <div className="text-[11px] text-slate-400">Render → Screen</div>
                <div className="mt-1 font-mono-tabular text-xs font-semibold text-slate-100">
                  <div>{frame.aiRender.renderResolution}</div>
                  <div className="text-[11px] text-cyan-300">
                    → {frame.aiRender.outputResolution.replace(' (144 Hz)', '')}
                  </div>
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-[#07090E] p-3">
                <div className="text-[11px] text-slate-400">AI Tensor</div>
                <div className="mt-1 font-mono-tabular text-sm font-bold text-cyan-400">
                  {frame.aiRender.tensorCoreLoadPct}%
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-[#07090E] p-3">
                <div className="text-[11px] text-slate-400">Optical Flow</div>
                <div className="mt-1 font-mono-tabular text-sm font-bold text-amber-400">
                  {frame.aiRender.opticalFlowLoadPct}%
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-[#07090E] p-3">
                <div className="text-[11px] text-slate-400">Latency</div>
                <div className="mt-1 font-mono-tabular text-sm font-bold text-emerald-400">
                  {frame.aiRender.pipelineLatencyMs.toFixed(1)} ms
                </div>
              </div>
            </div>

            {/* VRAM Functional Pool Breakdown */}
            <div className="mt-4 border-t border-slate-800 pt-4">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
                <span className="font-medium text-slate-300">
                  VRAM Breakdown ({vramTotalBreakdown} MB)
                </span>
                <span className="font-mono-tabular text-slate-400">
                  {frame.aiRender.upscalerMode}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                {[
                  { label: 'Textures', val: frame.aiRender.vramAllocation.texturesStreamMb, color: 'text-cyan-300' },
                  { label: 'Ray Tracing', val: frame.aiRender.vramAllocation.rayTracingBvhMb, color: 'text-amber-300' },
                  { label: 'Frames', val: frame.aiRender.vramAllocation.frameBuffersMb, color: 'text-slate-200' },
                  { label: 'AI Model', val: frame.aiRender.vramAllocation.modelWeightsMb, color: 'text-emerald-300' },
                  { label: 'Windows', val: frame.aiRender.vramAllocation.desktopOsMb, color: 'text-slate-400' },
                ].map((pool) => (
                  <div
                    key={pool.label}
                    className="rounded border border-slate-800 bg-[#07090E] px-2.5 py-2 font-mono-tabular"
                  >
                    <div className="text-[10px] text-slate-500">{pool.label}</div>
                    <div className={`font-semibold ${pool.color}`}>{pool.val} MB</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Live VRAM Consumer Table */}
          <div className="rounded-md border border-slate-800 bg-[#0D121D] p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-amber-400" />
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  Apps Using VRAM
                </h3>
                <span className="text-xs text-slate-500">
                  — Click any app to check if GPU needs it or end process
                </span>
              </div>
              <span className="font-mono-tabular text-xs text-slate-400">
                {frame.vramUsedMb} / {frame.vramTotalMb} MB
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="py-2 pr-3 font-medium">App</th>
                    <th className="py-2 px-2 font-medium">Type</th>
                    <th className="py-2 px-2 font-medium">Advice</th>
                    <th className="py-2 px-2 text-right font-medium">VRAM</th>
                    <th className="py-2 px-2 text-right font-medium">Shared</th>
                    <th className="py-2 pl-2 text-right font-medium">GPU %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono-tabular">
                  {frame.vramProcesses.map((proc) => {
                    const fullProc = frame.processes.find((p) => p.pid === proc.pid) ?? {
                      pid: proc.pid,
                      processName: proc.processName,
                      exeName: `${proc.processName}.exe`,
                      domains: ['GPU' as const],
                      engineType: proc.engineType,
                      cpuPct: 1.0,
                      gpuPct: proc.gpuUtilPct,
                      vramMb: proc.vramMb,
                      sharedMb: proc.sharedMb,
                      ramMb: proc.sharedMb,
                      diskMbps: 0,
                      netMbps: 0,
                    };
                    const advice = analyzeProcess(fullProc, 'GPU');
                    const pillClass =
                      advice.recommendationBadge === 'Required'
                        ? 'border-cyan-500/35 bg-cyan-500/10 text-cyan-300'
                        : advice.recommendationBadge === 'Let Run'
                        ? 'border-amber-500/35 bg-amber-500/10 text-amber-300'
                        : 'border-rose-500/35 bg-rose-500/10 text-rose-300';

                    return (
                      <tr
                        key={proc.pid}
                        onClick={() => onInspectProcess(proc.pid, 'GPU')}
                        className="group cursor-pointer transition-colors hover:bg-[#131C2E]"
                      >
                        <td className="py-2.5 pr-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onInspectProcess(proc.pid, 'GPU');
                            }}
                            className="inline-flex items-center gap-1.5 text-left font-medium text-slate-100 group-hover:text-cyan-300 focus:outline-none focus:underline"
                          >
                            <span>{proc.processName}</span>
                            <span className="text-[10px] text-slate-500">#{proc.pid}</span>
                            <ChevronRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-cyan-400" />
                          </button>
                        </td>
                        <td className="py-2.5 px-2 text-slate-400">{proc.engineType}</td>
                        <td className="py-2.5 px-2">
                          <span
                            className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${pillClass}`}
                          >
                            {advice.recommendationBadge}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right font-semibold text-amber-300">
                          {proc.vramMb} MB
                        </td>
                        <td className="py-2.5 px-2 text-right text-slate-400">
                          {proc.sharedMb} MB
                        </td>
                        <td className="py-2.5 pl-2 text-right text-cyan-300">
                          {proc.gpuUtilPct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
