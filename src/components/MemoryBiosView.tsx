import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cpu, ShieldAlert } from 'lucide-react';
import type { RamTimingsConfig } from '../types/hardware';
import {
  RAM_PRESETS,
  generateBiosWritePayload,
  validateRamTimings,
} from '../utils/ramTuning';

interface MemoryBiosViewProps {
  ramConfig: RamTimingsConfig;
  stagedBiosConfig: RamTimingsConfig | null;
  onChangeRamConfig: (next: RamTimingsConfig) => void;
  onStageBiosWrite: (config: RamTimingsConfig) => void;
}

export const MemoryBiosView: React.FC<MemoryBiosViewProps> = ({
  ramConfig,
  stagedBiosConfig,
  onChangeRamConfig,
  onStageBiosWrite,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const validation = useMemo(() => validateRamTimings(ramConfig), [ramConfig]);
  const payload = useMemo(() => generateBiosWritePayload(ramConfig), [ramConfig]);

  const updateField = <K extends keyof RamTimingsConfig>(
    key: K,
    value: RamTimingsConfig[K]
  ) => {
    onChangeRamConfig({
      ...ramConfig,
      profileName: 'Custom UEFI Timing Profile',
      [key]: value,
    });
  };

  const numberFields: Array<{
    key: keyof RamTimingsConfig;
    label: string;
    unit: string;
    min: number;
    max: number;
    step: number;
  }> = [
    { key: 'speedMt', label: 'Data Rate', unit: 'MT/s', min: 3200, max: 8400, step: 200 },
    { key: 'tCL', label: 'tCL (CAS Latency)', unit: 'tCK', min: 14, max: 52, step: 1 },
    { key: 'tRCD', label: 'tRCD (RAS to CAS)', unit: 'tCK', min: 16, max: 56, step: 1 },
    { key: 'tRP', label: 'tRP (Row Precharge)', unit: 'tCK', min: 16, max: 56, step: 1 },
    { key: 'tRAS', label: 'tRAS (Active Time)', unit: 'tCK', min: 28, max: 110, step: 1 },
    { key: 'tRC', label: 'tRC (Row Cycle)', unit: 'tCK', min: 44, max: 160, step: 1 },
    { key: 'tRFC', label: 'tRFC (Refresh Cycle)', unit: 'tCK', min: 220, max: 980, step: 10 },
    { key: 'tFAW', label: 'tFAW (Four Activate)', unit: 'tCK', min: 12, max: 48, step: 2 },
    { key: 'tREFI', label: 'tREFI (Refresh Int)', unit: 'tCK', min: 7800, max: 65535, step: 512 },
    { key: 'vddMv', label: 'DRAM VDD', unit: 'mV', min: 1050, max: 1550, step: 10 },
    { key: 'vddqMv', label: 'DRAM VDDQ', unit: 'mV', min: 1050, max: 1500, step: 10 },
    { key: 'fclkMhz', label: 'Infinity / Mesh FCLK', unit: 'MHz', min: 1400, max: 2400, step: 33 },
  ];

  return (
    <div className="space-y-5">
      {/* Header & Live Latency / Bandwidth Readout */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-slate-800 bg-[#0D121D] p-5">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-100">
            RAM Timings & UEFI BIOS NVRAM Tuner
          </h2>
          <p className="text-xs text-slate-400">
            Edit DDR5 primary/secondary timings, verify IMC stability rules, and stage writes to BIOS NVRAM.
          </p>
        </div>

        <div className="flex items-center gap-6 font-mono-tabular">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400">
              First-Word Latency
            </div>
            <div className="text-2xl font-bold text-amber-400">
              {validation.firstWordLatencyNs.toFixed(2)} <span className="text-xs">ns</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400">
              Peak Bandwidth
            </div>
            <div className="text-2xl font-bold text-cyan-400">
              {validation.theoreticalBandwidthGbSec.toFixed(1)}{' '}
              <span className="text-xs">GB/s</span>
            </div>
          </div>
        </div>
      </div>

      {/* XMP / EXPO Preset Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-800 bg-[#0D121D] px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 text-xs text-slate-400">SPD / XMP / EXPO Profiles:</span>
          {Object.entries(RAM_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              onClick={() => onChangeRamConfig(preset)}
              className={`whitespace-nowrap rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                ramConfig.profileName === preset.profileName
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'border border-slate-700 bg-[#07090E] text-slate-300 hover:border-slate-500'
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() =>
              updateField('commandRate', ramConfig.commandRate === '1T' ? '2T' : '1T')
            }
            className="rounded border border-slate-700 bg-[#07090E] px-2.5 py-1 font-mono-tabular text-slate-200 hover:border-cyan-500"
          >
            CR: {ramConfig.commandRate}
          </button>
          <button
            type="button"
            onClick={() =>
              updateField(
                'gearMode',
                ramConfig.gearMode === '1:1 UCLK' ? 'Gear 2' : '1:1 UCLK'
              )
            }
            className="rounded border border-slate-700 bg-[#07090E] px-2.5 py-1 font-mono-tabular text-slate-200 hover:border-cyan-500"
          >
            {ramConfig.gearMode}
          </button>
        </div>
      </div>

      {/* Editable Timing Matrix */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <section className="xl:col-span-7 rounded-md border border-slate-800 bg-[#0D121D] p-5">
          <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-slate-300">
            Primary, Secondary & Voltage Registers
          </h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {numberFields.map((field) => {
              const val = Number(ramConfig[field.key]);
              return (
                <div
                  key={field.key}
                  className="rounded border border-slate-800 bg-[#07090E] p-3"
                >
                  <label
                    htmlFor={`ram-${field.key}`}
                    className="block text-[11px] font-medium text-slate-400"
                  >
                    {field.label}
                  </label>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <input
                      id={`ram-${field.key}`}
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={val}
                      onChange={(e) => updateField(field.key, Number(e.target.value) as never)}
                      className="w-24 rounded border border-slate-700 bg-[#0D121D] px-2 py-1 font-mono-tabular text-sm font-semibold text-slate-100 focus:border-amber-500 focus:outline-none"
                    />
                    <span className="font-mono-tabular text-xs text-slate-500">
                      {field.unit}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Validation & BIOS NVRAM Staging Panel */}
        <section className="xl:col-span-5 flex flex-col justify-between rounded-md border border-slate-800 bg-[#0D121D] p-5">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-slate-300">
                UEFI Stability & BIOS Payload
              </h3>
              {validation.valid ? (
                <span className="inline-flex items-center gap-1 font-mono-tabular text-xs text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> IMC Safe
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-mono-tabular text-xs text-rose-400">
                  <ShieldAlert className="h-3.5 w-3.5" /> Timing Error
                </span>
              )}
            </div>

            {validation.errors.length > 0 && (
              <div className="mb-3 space-y-1.5 rounded border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
                {validation.errors.map((err) => (
                  <div key={err} className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            )}

            {validation.warnings.length > 0 && (
              <div className="mb-3 space-y-1.5 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                {validation.warnings.map((warn) => (
                  <div key={warn} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <span>{warn}</span>
                  </div>
                ))}
              </div>
            )}

            <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded border border-slate-800 bg-[#07090E] p-3 font-mono-tabular text-[11px] leading-relaxed text-cyan-200">
              {payload}
            </pre>
          </div>

          <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
            {stagedBiosConfig && (
              <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 font-mono-tabular text-xs text-emerald-300">
                BIOS NVRAM Staged: {stagedBiosConfig.speedMt} MT/s · CL{stagedBiosConfig.tCL}-
                {stagedBiosConfig.tRCD}-{stagedBiosConfig.tRP}-{stagedBiosConfig.tRAS} (Applied on next warm reboot)
              </div>
            )}

            <button
              type="button"
              disabled={!validation.valid}
              onClick={() => setConfirmOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded bg-amber-500 px-4 py-2.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Cpu className="h-4 w-4" />
              Stage &amp; Write to BIOS
            </button>
          </div>
        </section>
      </div>

      {/* Confirmation Dialog */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bios-confirm-title"
        >
          <div className="w-full max-w-md rounded-md border border-amber-500/40 bg-[#0D121D] p-6">
            <h4 id="bios-confirm-title" className="font-display text-base font-semibold text-slate-100">
              Confirm UEFI NVRAM Timing Write
            </h4>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              This stages <strong className="font-mono-tabular text-amber-300">{ramConfig.speedMt} MT/s ({ramConfig.tCL}-{ramConfig.tRCD}-{ramConfig.tRP}-{ramConfig.tRAS})</strong> at{' '}
              <strong className="font-mono-tabular text-cyan-300">{(ramConfig.vddMv / 1000).toFixed(3)}V</strong> into the UEFI NVRAM variable queue for Windows warm reboot training.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded border border-slate-700 bg-[#07090E] px-4 py-2 text-xs font-medium text-slate-300 hover:border-slate-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onStageBiosWrite(ramConfig);
                  setConfirmOpen(false);
                }}
                className="rounded bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
              >
                Confirm BIOS Write
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
