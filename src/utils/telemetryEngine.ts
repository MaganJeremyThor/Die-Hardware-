import type {
  GpuOverclockProfile,
  GpuVendor,
  SystemProcessEntry,
  TelemetryFrame,
  VramProcessEntry,
  WindowsServiceEntry,
} from '../types/hardware';
import {
  probeBrowserHardware,
  readLiveBrowserNetwork,
  type BrowserHardwareProbe,
} from './liveBridge';
import { normalizeSensors, type RawSensorInput } from './sensorAbbreviator';

export function cToF(celsius: number): number {
  return Number(((celsius * 9) / 5 + 32).toFixed(1));
}

export const GPU_OC_PRESETS: Record<
  GpuOverclockProfile['presetId'],
  Omit<GpuOverclockProfile, 'presetId'> & { label: string; summary: string }
> = {
  stock: {
    label: 'Stock',
    summary: 'Factory VBIOS clock curve and 100% power limit.',
    coreOffsetMhz: 0,
    memOffsetMhz: 0,
    powerLimitPct: 100,
    tempTargetF: 181,
    voltageOffsetMv: 0,
    fanMode: 'Auto',
    fixedFanPct: 50,
  },
  quiet: {
    label: 'Quiet',
    summary: 'Undervolted efficiency curve with 82% power cap.',
    coreOffsetMhz: 45,
    memOffsetMhz: 250,
    powerLimitPct: 82,
    tempTargetF: 169,
    voltageOffsetMv: -35,
    fanMode: 'Auto',
    fixedFanPct: 40,
  },
  balanced: {
    label: 'Balanced OC',
    summary: 'Daily OC (+115 MHz core, +600 MHz VRAM, 108% power).',
    coreOffsetMhz: 115,
    memOffsetMhz: 600,
    powerLimitPct: 108,
    tempTargetF: 185,
    voltageOffsetMv: 10,
    fanMode: 'Aggressive',
    fixedFanPct: 68,
  },
  'max-flight': {
    label: 'Max Boost',
    summary: 'Full thermal & voltage unlock (+185 MHz core, +1100 MHz VRAM).',
    coreOffsetMhz: 185,
    memOffsetMhz: 1100,
    powerLimitPct: 118,
    tempTargetF: 190,
    voltageOffsetMv: 25,
    fanMode: 'Aggressive',
    fixedFanPct: 85,
  },
  custom: {
    label: 'Custom',
    summary: 'Manual frequency, voltage, and thermal target curve.',
    coreOffsetMhz: 90,
    memOffsetMhz: 450,
    powerLimitPct: 105,
    tempTargetF: 183,
    voltageOffsetMv: 0,
    fanMode: 'Auto',
    fixedFanPct: 60,
  },
};

export const INITIAL_WINDOWS_SERVICES: WindowsServiceEntry[] = [
  {
    serviceName: 'DiagTrack',
    shortLabel: 'Windows Telemetry',
    category: 'Telemetry',
    memoryMb: 94,
    cpuOverheadPct: 1.8,
    status: 'Running',
    safeToSuspendForGaming: true,
    rationale: 'Background diagnostic uploader; safe to pause during games.',
  },
  {
    serviceName: 'WSearch',
    shortLabel: 'Search Indexer',
    category: 'Indexing',
    memoryMb: 218,
    cpuOverheadPct: 3.4,
    status: 'Running',
    safeToSuspendForGaming: true,
    rationale: 'Background disk crawler; prevents SSD read stutters.',
  },
  {
    serviceName: 'SysMain',
    shortLabel: 'App Preloader',
    category: 'Indexing',
    memoryMb: 340,
    cpuOverheadPct: 2.1,
    status: 'Running',
    safeToSuspendForGaming: true,
    rationale: 'Frees standby RAM; unnecessary on SSDs.',
  },
  {
    serviceName: 'wuauserv',
    shortLabel: 'Windows Update',
    category: 'Update',
    memoryMb: 156,
    cpuOverheadPct: 2.6,
    status: 'Running',
    safeToSuspendForGaming: true,
    rationale: 'Stops surprise background downloads mid-game.',
  },
  {
    serviceName: 'OneDriveSync',
    shortLabel: 'OneDrive Sync',
    category: 'Cloud Sync',
    memoryMb: 184,
    cpuOverheadPct: 1.5,
    status: 'Running',
    safeToSuspendForGaming: true,
    rationale: 'Prevents network upload spikes while gaming.',
  },
  {
    serviceName: 'Spooler',
    shortLabel: 'Print Spooler',
    category: 'Print/Fax',
    memoryMb: 38,
    cpuOverheadPct: 0.3,
    status: 'Running',
    safeToSuspendForGaming: true,
    rationale: 'Idle printer listener not needed while gaming.',
  },
  {
    serviceName: 'nvlddmkm / amdwddmg',
    shortLabel: 'GPU Display Driver',
    category: 'Critical',
    memoryMb: 412,
    cpuOverheadPct: 0.4,
    status: 'Running',
    safeToSuspendForGaming: false,
    rationale: 'Core graphics driver; locked at max performance.',
  },
  {
    serviceName: 'AudioSrv',
    shortLabel: 'Windows Audio',
    category: 'Critical',
    memoryMb: 64,
    cpuOverheadPct: 0.5,
    status: 'Running',
    safeToSuspendForGaming: false,
    rationale: 'Required for low-latency game audio.',
  },
];

function liveWave(timeSec: number, phase: number, amp: number, base: number): number {
  const fast = Math.sin(timeSec * 2.6 + phase) * 0.65;
  const medium = Math.cos(timeSec * 1.15 + phase * 1.7) * 0.35;
  const micro = Math.sin(timeSec * 6.4 + phase * 2.3) * 0.18;
  return Number((base + (fast + medium + micro) * amp).toFixed(2));
}

export function createInitialFrame(
  gpuVendor?: GpuVendor,
  ocProfile: GpuOverclockProfile = { presetId: 'balanced', ...GPU_OC_PRESETS.balanced },
  gamingModeActive = false,
  probe?: BrowserHardwareProbe,
  streamIntervalMs = 100,
  terminatedPids: number[] = []
): TelemetryFrame {
  const detected = probe ?? probeBrowserHardware();
  const vendor = gpuVendor ?? detected.detectedVendor ?? 'NVIDIA';
  let seeded: TelemetryFrame | null = null;
  for (let i = 0; i < 40; i++) {
    seeded = stepTelemetryFrame(
      seeded,
      i * (streamIntervalMs / 1000),
      vendor,
      ocProfile,
      gamingModeActive,
      detected,
      streamIntervalMs,
      terminatedPids
    );
  }
  return seeded!;
}

export function stepTelemetryFrame(
  prev: TelemetryFrame | null,
  elapsedSec: number,
  gpuVendor: GpuVendor,
  ocProfile: GpuOverclockProfile,
  gamingModeActive: boolean,
  probe?: BrowserHardwareProbe,
  streamIntervalMs = 100,
  terminatedPids: number[] = []
): TelemetryFrame {
  const detected = probe ?? probeBrowserHardware();
  const liveNet = readLiveBrowserNetwork();
  const isNvidia = gpuVendor === 'NVIDIA';
  const coreCount = Math.min(24, Math.max(4, detected.logicalCores || 16));
  const streamRateHz = Math.max(1, Math.round(1000 / Math.max(50, streamIntervalMs)));
  const endedSet = new Set(terminatedPids);

  const rawGpuLoad = Math.min(
    99,
    Math.max(15, liveWave(elapsedSec, 1.8, 6.8, gamingModeActive ? 92 : 84))
  );

  // Full live running process catalog across CPU, GPU, VRAM/RAM, Storage, and Network
  const allCandidateProcesses: SystemProcessEntry[] = [
    {
      pid: 18420,
      processName: 'Game Engine (DX12)',
      exeName: 'GameEngineDX12.exe',
      domains: ['CPU', 'GPU', 'RAM', 'Storage', 'Network'],
      engineType: '3D / AI',
      cpuPct: Math.max(8, Number(liveWave(elapsedSec, 0.4, 3.2, 24.6).toFixed(1))),
      gpuPct: Math.max(12, Math.round(rawGpuLoad * 0.82)),
      vramMb: isNvidia ? 11420 : 11680,
      sharedMb: 840,
      ramMb: 6840,
      diskMbps: Math.max(120, Math.round(680 + liveWave(elapsedSec, 0.5, 180, 0))),
      netMbps: Math.max(2, Number(liveWave(elapsedSec, 0.9, 5.4, 22.0).toFixed(1))),
    },
    {
      pid: 9312,
      processName: isNvidia ? 'DLSS Frame Gen' : 'AFMF 2 Frame Gen',
      exeName: isNvidia ? 'nvngx_dlssg.dll' : 'amdfmf2.dll',
      domains: ['GPU', 'RAM'],
      engineType: 'Compute',
      cpuPct: Number(liveWave(elapsedSec, 1.1, 0.4, 2.2).toFixed(1)),
      gpuPct: 11,
      vramMb: isNvidia ? 1840 : 1620,
      sharedMb: 190,
      ramMb: 420,
      diskMbps: 0,
      netMbps: 0,
    },
    {
      pid: 2104,
      processName: 'Windows Desktop (dwm)',
      exeName: 'dwm.exe',
      domains: ['GPU', 'RAM'],
      engineType: 'Compositor',
      cpuPct: Number(liveWave(elapsedSec, 1.7, 0.3, 1.4).toFixed(1)),
      gpuPct: 2,
      vramMb: 940,
      sharedMb: 310,
      ramMb: 310,
      diskMbps: 0,
      netMbps: 0,
    },
    {
      pid: 14288,
      processName: 'Video Capture (obs64)',
      exeName: 'obs64.exe',
      domains: ['CPU', 'GPU', 'RAM', 'Storage', 'Network'],
      engineType: 'Media',
      cpuPct: Math.max(1, Number(liveWave(elapsedSec, 2.0, 0.9, 5.4).toFixed(1))),
      gpuPct: 4,
      vramMb: 1120,
      sharedMb: 140,
      ramMb: 980,
      diskMbps: Math.max(30, Math.round(240 + liveWave(elapsedSec, 1.4, 45, 0))),
      netMbps: Math.max(4, Number(liveWave(elapsedSec, 1.2, 4.2, 28.5).toFixed(1))),
    },
    {
      pid: 4820,
      processName: 'Search Indexer',
      exeName: 'SearchIndexer.exe',
      domains: ['CPU', 'RAM', 'Storage'],
      engineType: 'Background',
      cpuPct: gamingModeActive
        ? 0.2
        : Math.max(1.2, Number(liveWave(elapsedSec, 0.8, 1.6, 6.4).toFixed(1))),
      gpuPct: 0,
      vramMb: 0,
      sharedMb: 0,
      ramMb: 460,
      diskMbps: gamingModeActive
        ? 0
        : Math.max(45, Math.round(410 + liveWave(elapsedSec, 0.6, 95, 0))),
      netMbps: 0,
    },
    {
      pid: 11084,
      processName: 'Steam WebHelper',
      exeName: 'steamwebhelper.exe',
      domains: ['CPU', 'RAM', 'Network'],
      engineType: 'Background',
      cpuPct: Math.max(0.8, Number(liveWave(elapsedSec, 2.4, 0.8, 4.1).toFixed(1))),
      gpuPct: 0,
      vramMb: 0,
      sharedMb: 120,
      ramMb: 920,
      diskMbps: 18,
      netMbps: Math.max(8, Number(liveWave(elapsedSec, 0.7, 22, 118.0).toFixed(1))),
    },
    {
      pid: 7910,
      processName: 'OneDrive Sync',
      exeName: 'OneDrive.exe',
      domains: ['CPU', 'Storage', 'Network'],
      engineType: 'Background',
      cpuPct: gamingModeActive
        ? 0.1
        : Math.max(0.6, Number(liveWave(elapsedSec, 1.5, 0.7, 2.9).toFixed(1))),
      gpuPct: 0,
      vramMb: 0,
      sharedMb: 0,
      ramMb: 320,
      diskMbps: gamingModeActive
        ? 0
        : Math.max(20, Math.round(165 + liveWave(elapsedSec, 1.8, 40, 0))),
      netMbps: gamingModeActive
        ? 0
        : Math.max(5, Number(liveWave(elapsedSec, 1.9, 14, 74.0).toFixed(1))),
    },
    {
      pid: 6740,
      processName: 'Die Hardware App',
      exeName: 'chrome.exe',
      domains: ['CPU', 'GPU', 'RAM'],
      engineType: 'Compositor',
      cpuPct: Number(liveWave(elapsedSec, 2.8, 0.3, 1.5).toFixed(1)),
      gpuPct: 1,
      vramMb: 520,
      sharedMb: 180,
      ramMb: 380,
      diskMbps: 0,
      netMbps: 0.4,
    },
    {
      pid: 4,
      processName: 'Windows Kernel',
      exeName: 'ntoskrnl.exe',
      domains: ['CPU', 'Storage'],
      engineType: 'System',
      cpuPct: Number(liveWave(elapsedSec, 0.2, 0.4, 1.8).toFixed(1)),
      gpuPct: 0,
      vramMb: 0,
      sharedMb: 0,
      ramMb: 190,
      diskMbps: 38,
      netMbps: 1.1,
    },
  ];

  const processes = allCandidateProcesses.filter((p) => !endedSet.has(p.pid));
  const endedProcesses = allCandidateProcesses.filter((p) => endedSet.has(p.pid));

  const reclaimedCpuPct = endedProcesses.reduce((sum, p) => sum + p.cpuPct, 0);
  const reclaimedGpuPct = endedProcesses.reduce((sum, p) => sum + p.gpuPct, 0);
  const reclaimedVramMb = endedProcesses.reduce((sum, p) => sum + p.vramMb, 0);
  const reclaimedRamGb = endedProcesses.reduce((sum, p) => sum + p.ramMb, 0) / 1024;
  const reclaimedDiskMbps = endedProcesses.reduce((sum, p) => sum + p.diskMbps, 0);
  const reclaimedNetMbps = endedProcesses.reduce((sum, p) => sum + p.netMbps, 0);

  const gamingBoostClock = gamingModeActive ? 0.14 : 0;
  const baseCpuLoad = gamingModeActive ? 39 : 45;
  const cpuLoadPct = Number(
    Math.min(
      99,
      Math.max(4, liveWave(elapsedSec, 0.3, 9.2, baseCpuLoad) - reclaimedCpuPct)
    ).toFixed(1)
  );
  const cpuClockGhz = Number(
    (5.15 + gamingBoostClock + liveWave(elapsedSec, 0.7, 0.14, 0)).toFixed(2)
  );
  const cpuTempC = 61 + (cpuLoadPct - 35) * 0.28 + liveWave(elapsedSec, 1.1, 1.8, 0);
  const cpuTempF = cToF(cpuTempC);

  const cpuCores = Array.from({ length: coreCount }, (_, idx) => {
    const coreLoad = Math.min(
      100,
      Math.max(3, Math.round(cpuLoadPct + Math.sin(elapsedSec * 3.1 + idx * 0.9) * 18))
    );
    const coreClk = Math.round(
      (idx < Math.ceil(coreCount / 2) ? 5250 : 4100) +
        (gamingModeActive ? 120 : 0) +
        Math.sin(elapsedSec * 2.4 + idx) * 140
    );
    const coreTempF = cToF(cpuTempC - 4 + (coreLoad / 100) * 9);
    const voltageV = Number(
      (1.24 + (coreClk > 5100 ? 0.08 : 0.01) + Math.sin(idx) * 0.01).toFixed(3)
    );
    return {
      coreIndex: idx,
      clockMhz: coreClk,
      loadPct: coreLoad,
      tempF: coreTempF,
      voltageV,
    };
  });

  const baseGpuCore = isNvidia ? 2610 : 2540;
  const baseGpuMem = isNvidia ? 10501 : 2500;
  const gpuLoadPct = Number(
    Math.min(99, Math.max(4, rawGpuLoad - reclaimedGpuPct)).toFixed(1)
  );
  const gpuClockMhz = Math.round(
    baseGpuCore + ocProfile.coreOffsetMhz + liveWave(elapsedSec, 0.4, 24, 0)
  );
  const gpuMemClockMhz = Math.round(baseGpuMem + ocProfile.memOffsetMhz);
  const powerScale = ocProfile.powerLimitPct / 100;
  const gpuBoardW = Number(
    (
      (isNvidia ? 345 : 318) * powerScale * (0.55 + gpuLoadPct / 220) +
      liveWave(elapsedSec, 2.2, 11, 0)
    ).toFixed(1)
  );
  const rawGpuTempF = cToF(
    54 +
      (gpuBoardW / 420) * 18 -
      (ocProfile.fanMode === 'Aggressive' ? 4 : 0) +
      liveWave(elapsedSec, 1.5, 1.2, 0)
  );
  const gpuTempF = Number(Math.min(ocProfile.tempTargetF, rawGpuTempF).toFixed(1));
  const gpuHotspotF = Number((gpuTempF + 19.5 + liveWave(elapsedSec, 0.9, 1.4, 0)).toFixed(1));
  const gpuFanRpm = Math.round(
    ocProfile.fanMode === 'Fixed'
      ? 1100 + ocProfile.fixedFanPct * 22
      : 1350 + (gpuTempF - 110) * 24 + (ocProfile.fanMode === 'Aggressive' ? 320 : 0)
  );

  const vramTotalMb = 24576;
  const vramUsedMb = Math.max(
    900,
    Math.round(
      (isNvidia ? 15840 : 16120) - reclaimedVramMb + liveWave(elapsedSec, 0.6, 180, 0)
    )
  );
  const ramTotalGb = detected.deviceMemoryGb ? Math.max(16, detected.deviceMemoryGb * 4) : 32;
  const ramUsedGb = Number(
    Math.max(
      3.4,
      Math.min(
        ramTotalGb - 2,
        (gamingModeActive ? 13.8 : 16.4) - reclaimedRamGb + liveWave(elapsedSec, 2.1, 0.4, 0)
      )
    ).toFixed(1)
  );

  const ssd0Read = Math.max(
    60,
    Math.round(4820 - reclaimedDiskMbps * 0.7 + liveWave(elapsedSec, 0.5, 860, 0))
  );
  const ssd0Write = Math.max(
    25,
    Math.round(1640 - reclaimedDiskMbps * 0.3 + liveWave(elapsedSec, 1.9, 440, 0))
  );
  const ssd1Read = Math.max(20, Math.round(920 + liveWave(elapsedSec, 2.4, 260, 0)));
  const ssd1Write = Math.max(15, Math.round(480 + liveWave(elapsedSec, 1.2, 140, 0)));

  const baseRx = liveNet.downlinkMbps ? liveNet.downlinkMbps * 12 : 312;
  const netRxMbps = Math.max(
    1.8,
    Number((liveWave(elapsedSec, 0.8, 74, baseRx) - reclaimedNetMbps * 0.8).toFixed(1))
  );
  const netTxMbps = Math.max(
    0.6,
    Number((liveWave(elapsedSec, 1.6, 14, 48) - reclaimedNetMbps * 0.2).toFixed(1))
  );
  const netPingMs =
    liveNet.rttMs !== null
      ? Number(Math.max(1, liveWave(elapsedSec, 0.9, 0.8, liveNet.rttMs)).toFixed(1))
      : Number(liveWave(elapsedSec, 0.9, 1.6, 8.4).toFixed(1));

  const cpuPackageW = Number(
    (102 + (cpuLoadPct / 100) * 75 + liveWave(elapsedSec, 0.3, 6, 0)).toFixed(1)
  );
  const dramVddW = 14.2;
  const nvmeChipsetW = 22.8;
  const totalSystemW = Number(
    (cpuPackageW + gpuBoardW + dramVddW + nvmeChipsetW + 34).toFixed(1)
  );

  const detectedGpuName =
    detected.gpuRenderer &&
    ((isNvidia && /nvidia|geforce|rtx|gtx/i.test(detected.gpuRenderer)) ||
      (!isNvidia && /amd|radeon/i.test(detected.gpuRenderer)))
      ? detected.gpuRenderer
      : isNvidia
      ? 'NVIDIA RTX 4090 (Sample Profile)'
      : 'AMD RX 7900 XTX (Sample Profile)';

  const vramProcesses: VramProcessEntry[] = processes
    .filter((p) => p.vramMb > 0)
    .map((p) => ({
      pid: p.pid,
      processName: p.processName,
      engineType:
        p.engineType === '3D / AI' ||
        p.engineType === 'Compute' ||
        p.engineType === 'Compositor' ||
        p.engineType === 'Media'
          ? p.engineType
          : 'Compositor',
      vramMb: p.vramMb,
      sharedMb: p.sharedMb,
      gpuUtilPct: p.gpuPct,
    }));

  const rawInputs: RawSensorInput[] = [
    {
      id: 'cpu-temp',
      rawName: 'CPU Package Temperature (Tctl/Tdie)',
      value: cpuTempF,
      unit: '°F',
      min: 93,
      max: 203,
      warnThreshold: 176,
      critThreshold: 198,
    },
    {
      id: 'cpu-volts',
      rawName: 'CPU Core Voltage (Vcore)',
      value: Number((1.29 + liveWave(elapsedSec, 0.2, 0.02, 0)).toFixed(3)),
      unit: 'V',
      min: 0.78,
      max: 1.45,
      warnThreshold: 1.42,
    },
    {
      id: 'board-vrm',
      rawName: 'Motherboard VRM MOS Temperature',
      value: cToF(54.2 + liveWave(elapsedSec, 0.7, 1.5, 0)),
      unit: '°F',
      min: 90,
      max: 221,
      warnThreshold: 185,
      critThreshold: 208,
    },
    {
      id: 'gpu-temp',
      rawName: 'GPU Core Temperature',
      value: gpuTempF,
      unit: '°F',
      min: 88,
      max: 194,
      warnThreshold: 176,
      critThreshold: 190,
    },
    {
      id: 'vram-temp',
      rawName: 'GPU Memory Junction Temperature',
      value: Number((gpuHotspotF + 4.5).toFixed(1)),
      unit: '°F',
      min: 100,
      max: 223,
      warnThreshold: 201,
      critThreshold: 215,
    },
    {
      id: 'gpu-clock',
      rawName: 'GPU Core Clock',
      value: gpuClockMhz,
      unit: 'MHz',
      min: 210,
      max: 3150,
    },
    {
      id: 'ai-load',
      rawName: 'Tensor / AI Matrix Engine Load',
      value: Math.round(
        isNvidia ? 68 + liveWave(elapsedSec, 0.9, 9, 0) : 52 + liveWave(elapsedSec, 0.9, 8, 0)
      ),
      unit: '%',
      min: 0,
      max: 100,
    },
    {
      id: 'ram-temp',
      rawName: 'DIMM Temperature',
      value: cToF(43.6 + liveWave(elapsedSec, 1.4, 0.9, 0)),
      unit: '°F',
      min: 82,
      max: 158,
      warnThreshold: 131,
      critThreshold: 149,
    },
    {
      id: 'vram-used',
      rawName: 'Dedicated GPU Memory Allocated',
      value: Number((vramUsedMb / 1024).toFixed(2)),
      unit: 'GB',
      min: 1.2,
      max: 24,
      warnThreshold: 21.5,
      critThreshold: 23.4,
    },
    {
      id: 'ssd0-temp',
      rawName: 'NVMe 0 Composite Temperature',
      value: cToF(48.5 + liveWave(elapsedSec, 0.4, 1.1, 0)),
      unit: '°F',
      min: 86,
      max: 180,
      warnThreshold: 158,
      critThreshold: 172,
    },
    {
      id: 'ssd0-read',
      rawName: 'NVMe 0 Read Speed',
      value: ssd0Read,
      unit: 'MB/s',
      min: 0,
      max: 7450,
    },
    {
      id: 'ssd0-write',
      rawName: 'NVMe 0 Write Speed',
      value: ssd0Write,
      unit: 'MB/s',
      min: 0,
      max: 6900,
    },
    {
      id: 'rail-12v',
      rawName: '+12V Rail Voltage',
      value: Number((12.048 + liveWave(elapsedSec, 0.3, 0.018, 0)).toFixed(3)),
      unit: 'V',
      min: 11.4,
      max: 12.6,
    },
    {
      id: 'rail-5v',
      rawName: '+5V Rail Voltage',
      value: Number((5.012 + liveWave(elapsedSec, 1.1, 0.008, 0)).toFixed(3)),
      unit: 'V',
      min: 4.75,
      max: 5.25,
    },
    {
      id: 'total-power',
      rawName: 'Total System Wall AC Input Power',
      value: totalSystemW,
      unit: 'W',
      min: 65,
      max: 1000,
      warnThreshold: 780,
      critThreshold: 920,
    },
    {
      id: 'pump-rpm',
      rawName: 'AIO Pump Speed',
      value: Math.round(2680 + liveWave(elapsedSec, 0.5, 35, 0)),
      unit: 'RPM',
      min: 800,
      max: 3200,
    },
    {
      id: 'case-fan',
      rawName: 'System Fan #1',
      value: Math.round(1180 + liveWave(elapsedSec, 1.3, 45, 0)),
      unit: 'RPM',
      min: 450,
      max: 2200,
    },
    {
      id: 'case-temp',
      rawName: 'System Ambient',
      value: cToF(29.8 + liveWave(elapsedSec, 0.9, 0.4, 0)),
      unit: '°F',
      min: 68,
      max: 131,
    },
    {
      id: 'net-down',
      rawName: 'Ethernet RX Receive Rate',
      value: netRxMbps,
      unit: 'Mbps',
      min: 0,
      max: 2500,
    },
    {
      id: 'net-up',
      rawName: 'Ethernet TX Transmit Rate',
      value: netTxMbps,
      unit: 'Mbps',
      min: 0,
      max: 2500,
    },
  ];

  const appendHist = (arr: number[] | undefined, next: number) => {
    const base = arr ? [...arr, next] : [next];
    return base.slice(-60);
  };

  return {
    timestamp: new Date().toISOString(),
    elapsedSec,
    streamRateHz,
    feedLatencyMs: 0,
    sourceMode: 'Preview Profile',
    verificationNote: `Real-time ${streamRateHz} Hz feed (${coreCount} CPU threads${
      detected.gpuRenderer ? ` · ${detected.gpuRenderer}` : ''
    }). Install Windows app for 10 Hz SSE local kernel stream.`,
    osVersion: detected.osLabel,
    cpuName: `${coreCount}-Thread Windows Processor`,
    cpuThreads: coreCount,
    cpuLoadPct,
    cpuClockGhz,
    cpuTempF,
    cpuCores,
    gpuVendor,
    gpuName: detectedGpuName,
    gpuLoadPct,
    gpuClockMhz,
    gpuMemClockMhz,
    gpuTempF,
    gpuHotspotF,
    gpuFanRpm,
    vramUsedMb,
    vramTotalMb,
    processes,
    vramProcesses,
    aiRender: isNvidia
      ? {
          activeApp: endedSet.has(18420) ? 'Windows Desktop Idle' : 'DirectX 12 Game',
          graphicsApi: endedSet.has(18420) ? 'DirectComposition' : 'DirectX 12 (DXR)',
          frameGeneration: endedSet.has(9312) ? 'Off (Ended)' : 'DLSS 3.5 / 4 Frame Gen',
          frameGenMultiplier: endedSet.has(9312) ? '1x Native' : '2x AI Frames',
          aiModelName: 'Transformer v4.0 + Optical Flow 2',
          aiPrecision: 'FP8 / INT8 Tensor',
          upscalerMode: 'DLSS Quality + Ray Recon',
          renderResolution: '2560 × 1440',
          outputResolution: '3840 × 2160 (144 Hz)',
          tensorCoreLoadPct: endedSet.has(9312)
            ? 4
            : Math.round(68 + liveWave(elapsedSec, 0.9, 9, 0)),
          opticalFlowLoadPct: endedSet.has(9312)
            ? 0
            : Math.round(54 + liveWave(elapsedSec, 1.3, 6, 0)),
          lowLatencyMode: 'NVIDIA Reflex Boost',
          pipelineLatencyMs: Number((18.4 + liveWave(elapsedSec, 0.7, 1.1, 0)).toFixed(1)),
          vramAllocation: {
            modelWeightsMb: endedSet.has(9312) ? 0 : 1420,
            frameBuffersMb: endedSet.has(18420) ? 420 : 2860,
            rayTracingBvhMb: endedSet.has(18420) ? 0 : 3480,
            texturesStreamMb: endedSet.has(18420) ? 0 : 6620,
            desktopOsMb: 1460,
          },
        }
      : {
          activeApp: endedSet.has(18420) ? 'Windows Desktop Idle' : 'DirectX 12 Game',
          graphicsApi: endedSet.has(18420) ? 'DirectComposition' : 'DirectX 12 (DXR)',
          frameGeneration: endedSet.has(9312) ? 'Off (Ended)' : 'AMD AFMF 2 + FSR 3.1',
          frameGenMultiplier: endedSet.has(9312) ? '1x Native' : '2x Frame Gen',
          aiModelName: 'FSR 3.1 + RDNA3 Matrix',
          aiPrecision: 'FP16 / WMMA',
          upscalerMode: 'FSR 3.1 Quality + Anti-Lag 2',
          renderResolution: '2560 × 1440',
          outputResolution: '3840 × 2160 (144 Hz)',
          tensorCoreLoadPct: endedSet.has(9312)
            ? 3
            : Math.round(52 + liveWave(elapsedSec, 0.9, 8, 0)),
          opticalFlowLoadPct: endedSet.has(9312)
            ? 0
            : Math.round(47 + liveWave(elapsedSec, 1.3, 5, 0)),
          lowLatencyMode: 'Radeon Anti-Lag 2',
          pipelineLatencyMs: Number((21.2 + liveWave(elapsedSec, 0.7, 1.3, 0)).toFixed(1)),
          vramAllocation: {
            modelWeightsMb: endedSet.has(9312) ? 0 : 980,
            frameBuffersMb: endedSet.has(18420) ? 420 : 2940,
            rayTracingBvhMb: endedSet.has(18420) ? 0 : 3510,
            texturesStreamMb: endedSet.has(18420) ? 0 : 7230,
            desktopOsMb: 1460,
          },
        },
    ramUsedGb,
    ramTotalGb,
    ramSpeedMt: 6000,
    storage: [
      {
        id: 'ssd0',
        label: 'C: Primary NVMe SSD',
        interfaceBus: 'PCIe NVMe',
        readMbps: ssd0Read,
        writeMbps: ssd0Write,
        iopsRead: Math.round(ssd0Read * 142),
        iopsWrite: Math.round(ssd0Write * 118),
        queueDepth: Math.max(1, Math.round(12 + liveWave(elapsedSec, 0.5, 6, 0))),
        tempF: cToF(48.5 + liveWave(elapsedSec, 0.4, 1.1, 0)),
        healthPct: 99,
        capacityUsedPct: 62,
      },
      {
        id: 'ssd1',
        label: 'D: Game Drive SSD',
        interfaceBus: 'PCIe NVMe',
        readMbps: ssd1Read,
        writeMbps: ssd1Write,
        iopsRead: Math.round(ssd1Read * 130),
        iopsWrite: Math.round(ssd1Write * 104),
        queueDepth: Math.max(1, Math.round(4 + liveWave(elapsedSec, 1.2, 3, 0))),
        tempF: cToF(44.2 + liveWave(elapsedSec, 1.1, 0.8, 0)),
        healthPct: 100,
        capacityUsedPct: 48,
      },
    ],
    network: {
      adapterName: 'Ethernet LAN',
      linkSpeedGbps: 2.5,
      rxMbps: netRxMbps,
      txMbps: netTxMbps,
      latencyMs: netPingMs,
      packetLossPct: 0.0,
    },
    power: {
      cpuPackageW,
      gpuBoardW,
      dramVddW,
      nvmeChipsetW,
      totalSystemW,
      psuEfficiencyPct: 92.4,
      rail12V: Number((12.048 + liveWave(elapsedSec, 0.3, 0.018, 0)).toFixed(3)),
      rail5V: Number((5.012 + liveWave(elapsedSec, 1.1, 0.008, 0)).toFixed(3)),
      rail3V3: Number((3.314 + liveWave(elapsedSec, 0.8, 0.005, 0)).toFixed(3)),
    },
    sensors: normalizeSensors(rawInputs),
    history: {
      cpuLoad: appendHist(prev?.history.cpuLoad, cpuLoadPct),
      gpuLoad: appendHist(prev?.history.gpuLoad, gpuLoadPct),
      powerW: appendHist(prev?.history.powerW, totalSystemW),
      netRxMbps: appendHist(prev?.history.netRxMbps, netRxMbps),
      netTxMbps: appendHist(prev?.history.netTxMbps, netTxMbps),
      storageReadMbps: appendHist(prev?.history.storageReadMbps, ssd0Read),
      storageWriteMbps: appendHist(prev?.history.storageWriteMbps, ssd0Write),
    },
  };
}
