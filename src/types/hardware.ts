export type AppSection =
  | 'flight-deck'
  | 'sensors'
  | 'graphics'
  | 'memory-bios'
  | 'gaming-mode'
  | 'csv-logger'
  | 'installer';

export type SensorCategory =
  | 'CPU'
  | 'GPU'
  | 'RAM & VRAM'
  | 'Storage'
  | 'Power'
  | 'Cooling'
  | 'Network';

export type SensorStatus = 'Nominal' | 'Elevated' | 'Critical';

export interface AbbreviatedSensor {
  id: string;
  rawName: string;
  shortName: string;
  module: SensorCategory;
  value: number;
  unit: string;
  min: number;
  max: number;
  status: SensorStatus;
}

export interface CpuCoreMetric {
  coreIndex: number;
  clockMhz: number;
  loadPct: number;
  tempF: number;
  voltageV: number;
}

export type GpuVendor = 'NVIDIA' | 'AMD';

export type GpuOcPresetId = 'stock' | 'quiet' | 'balanced' | 'max-flight' | 'custom';

export interface GpuOverclockProfile {
  presetId: GpuOcPresetId;
  coreOffsetMhz: number;
  memOffsetMhz: number;
  powerLimitPct: number;
  tempTargetF: number;
  voltageOffsetMv: number;
  fanMode: 'Auto' | 'Aggressive' | 'Fixed';
  fixedFanPct: number;
}

export interface AiRenderBreakdown {
  activeApp: string;
  graphicsApi: string;
  frameGeneration: string;
  frameGenMultiplier: string;
  aiModelName: string;
  aiPrecision: string;
  upscalerMode: string;
  renderResolution: string;
  outputResolution: string;
  tensorCoreLoadPct: number;
  opticalFlowLoadPct: number;
  lowLatencyMode: string;
  pipelineLatencyMs: number;
  vramAllocation: {
    modelWeightsMb: number;
    frameBuffersMb: number;
    rayTracingBvhMb: number;
    texturesStreamMb: number;
    desktopOsMb: number;
  };
}

export type HardwareDomain = 'CPU' | 'GPU' | 'RAM' | 'Storage' | 'Network';

export interface SystemProcessEntry {
  pid: number;
  processName: string;
  exeName: string;
  domains: HardwareDomain[];
  engineType: '3D / AI' | 'Compute' | 'Compositor' | 'Media' | 'Background' | 'System';
  cpuPct: number;
  gpuPct: number;
  vramMb: number;
  sharedMb: number;
  ramMb: number;
  diskMbps: number;
  netMbps: number;
}

export interface VramProcessEntry {
  pid: number;
  processName: string;
  engineType: '3D / AI' | 'Compute' | 'Compositor' | 'Media';
  vramMb: number;
  sharedMb: number;
  gpuUtilPct: number;
}

export interface StorageDriveMetric {
  id: string;
  label: string;
  interfaceBus: string;
  readMbps: number;
  writeMbps: number;
  iopsRead: number;
  iopsWrite: number;
  queueDepth: number;
  tempF: number;
  healthPct: number;
  capacityUsedPct: number;
}

export interface NetworkInterfaceMetric {
  adapterName: string;
  linkSpeedGbps: number;
  rxMbps: number;
  txMbps: number;
  latencyMs: number;
  packetLossPct: number;
}

export interface PowerRailMetrics {
  cpuPackageW: number;
  gpuBoardW: number;
  dramVddW: number;
  nvmeChipsetW: number;
  totalSystemW: number;
  psuEfficiencyPct: number;
  rail12V: number;
  rail5V: number;
  rail3V3: number;
}

export interface RamTimingsConfig {
  profileName: string;
  ddrGeneration: 'DDR5' | 'DDR4';
  speedMt: number;
  channels: number;
  tCL: number;
  tRCD: number;
  tRP: number;
  tRAS: number;
  tRC: number;
  tRFC: number;
  tFAW: number;
  tREFI: number;
  commandRate: '1T' | '2T';
  gearMode: 'Gear 1' | 'Gear 2' | '1:1 UCLK';
  vddMv: number;
  vddqMv: number;
  fclkMhz: number;
}

export interface WindowsServiceEntry {
  serviceName: string;
  shortLabel: string;
  category: 'Telemetry' | 'Indexing' | 'Update' | 'Cloud Sync' | 'Print/Fax' | 'Critical';
  memoryMb: number;
  cpuOverheadPct: number;
  status: 'Running' | 'Suspended';
  safeToSuspendForGaming: boolean;
  rationale: string;
}

export interface TelemetryFrame {
  timestamp: string;
  elapsedSec: number;
  streamRateHz: number;
  feedLatencyMs: number;
  sourceMode: 'Preview Profile' | 'Live Windows Agent (Double-Checked)';
  verificationNote: string;
  osVersion: string;
  cpuName: string;
  cpuThreads: number;
  cpuLoadPct: number;
  cpuClockGhz: number;
  cpuTempF: number;
  cpuCores: CpuCoreMetric[];
  gpuVendor: GpuVendor;
  gpuName: string;
  gpuLoadPct: number;
  gpuClockMhz: number;
  gpuMemClockMhz: number;
  gpuTempF: number;
  gpuHotspotF: number;
  gpuFanRpm: number;
  vramUsedMb: number;
  vramTotalMb: number;
  processes: SystemProcessEntry[];
  vramProcesses: VramProcessEntry[];
  aiRender: AiRenderBreakdown;
  ramUsedGb: number;
  ramTotalGb: number;
  ramSpeedMt: number;
  storage: StorageDriveMetric[];
  network: NetworkInterfaceMetric;
  power: PowerRailMetrics;
  sensors: AbbreviatedSensor[];
  history: {
    cpuLoad: number[];
    gpuLoad: number[];
    powerW: number[];
    netRxMbps: number[];
    netTxMbps: number[];
    storageReadMbps: number[];
    storageWriteMbps: number[];
  };
}

export type DashboardWidgetId =
  | 'cpu-core-array'
  | 'gpu-ai-render'
  | 'vram-inspector'
  | 'storage-io'
  | 'network-bandwidth'
  | 'power-telemetry';

export interface DashboardWidgetConfig {
  id: DashboardWidgetId;
  title: string;
  visible: boolean;
  spanWide?: boolean;
}

export type CsvSectionCategory =
  | 'All Sections'
  | 'Power Management'
  | 'RAM Timings'
  | 'CPU & Thermal'
  | 'GPU & AI Render'
  | 'Storage & Network';

export interface CsvTelemetryRow {
  timestamp: string;
  section: Exclude<CsvSectionCategory, 'All Sections'>;
  metricKey: string;
  abbreviatedLabel: string;
  value: string;
  unit: string;
  status: string;
}
