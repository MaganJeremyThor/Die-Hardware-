import type {
  CsvSectionCategory,
  CsvTelemetryRow,
  RamTimingsConfig,
  TelemetryFrame,
} from '../types/hardware';

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildOrganizedCsvRows(
  frame: TelemetryFrame,
  ramConfig: RamTimingsConfig
): CsvTelemetryRow[] {
  const ts = frame.timestamp;
  const rows: CsvTelemetryRow[] = [
    // Power Management
    {
      timestamp: ts,
      section: 'Power Management',
      metricKey: 'PWR_TOTAL_WALL',
      abbreviatedLabel: 'Total Power',
      value: frame.power.totalSystemW.toFixed(1),
      unit: 'W',
      status: frame.power.totalSystemW > 650 ? 'Elevated' : 'Nominal',
    },
    {
      timestamp: ts,
      section: 'Power Management',
      metricKey: 'PWR_CPU_PPT',
      abbreviatedLabel: 'CPU Power',
      value: frame.power.cpuPackageW.toFixed(1),
      unit: 'W',
      status: 'Nominal',
    },
    {
      timestamp: ts,
      section: 'Power Management',
      metricKey: 'PWR_GPU_TGP',
      abbreviatedLabel: 'GPU Power',
      value: frame.power.gpuBoardW.toFixed(1),
      unit: 'W',
      status: 'Nominal',
    },
    {
      timestamp: ts,
      section: 'Power Management',
      metricKey: 'PWR_12V_RAIL',
      abbreviatedLabel: '12V Rail',
      value: frame.power.rail12V.toFixed(3),
      unit: 'V',
      status: 'Nominal',
    },
    // RAM Timings
    {
      timestamp: ts,
      section: 'RAM Timings',
      metricKey: 'RAM_PRIMARY_TIMING',
      abbreviatedLabel: 'RAM Timings',
      value: `${ramConfig.tCL}-${ramConfig.tRCD}-${ramConfig.tRP}-${ramConfig.tRAS}`,
      unit: `${ramConfig.speedMt} MT/s`,
      status: 'Nominal',
    },
    {
      timestamp: ts,
      section: 'RAM Timings',
      metricKey: 'RAM_TREFI_TRFC',
      abbreviatedLabel: 'tREFI / tRFC',
      value: `${ramConfig.tREFI} / ${ramConfig.tRFC}`,
      unit: 'tCK',
      status: 'Nominal',
    },
    {
      timestamp: ts,
      section: 'RAM Timings',
      metricKey: 'RAM_VDD_MV',
      abbreviatedLabel: 'RAM Volts',
      value: (ramConfig.vddMv / 1000).toFixed(3),
      unit: 'V',
      status: ramConfig.vddMv > 1450 ? 'Elevated' : 'Nominal',
    },
    // CPU & Thermal
    {
      timestamp: ts,
      section: 'CPU & Thermal',
      metricKey: 'CPU_TEMP_F',
      abbreviatedLabel: 'CPU Temp',
      value: frame.cpuTempF.toFixed(1),
      unit: '°F',
      status: frame.cpuTempF > 185 ? 'Elevated' : 'Nominal',
    },
    {
      timestamp: ts,
      section: 'CPU & Thermal',
      metricKey: 'CPU_BOOST_CLK',
      abbreviatedLabel: 'CPU Clock',
      value: frame.cpuClockGhz.toFixed(2),
      unit: 'GHz',
      status: 'Nominal',
    },
    {
      timestamp: ts,
      section: 'CPU & Thermal',
      metricKey: 'CPU_UTIL_PCT',
      abbreviatedLabel: 'CPU Load',
      value: frame.cpuLoadPct.toFixed(1),
      unit: '%',
      status: 'Nominal',
    },
    // GPU & AI Render
    {
      timestamp: ts,
      section: 'GPU & AI Render',
      metricKey: 'GPU_CORE_CLK',
      abbreviatedLabel: 'GPU Clock',
      value: String(Math.round(frame.gpuClockMhz)),
      unit: 'MHz',
      status: 'Nominal',
    },
    {
      timestamp: ts,
      section: 'GPU & AI Render',
      metricKey: 'GPU_TEMP_F',
      abbreviatedLabel: 'GPU Temp',
      value: frame.gpuTempF.toFixed(1),
      unit: '°F',
      status: frame.gpuTempF > 180 ? 'Elevated' : 'Nominal',
    },
    {
      timestamp: ts,
      section: 'GPU & AI Render',
      metricKey: 'GPU_AI_MODEL',
      abbreviatedLabel: 'AI Render',
      value: `${frame.aiRender.frameGeneration} (${frame.aiRender.aiModelName})`,
      unit: frame.aiRender.frameGenMultiplier,
      status: 'Nominal',
    },
    {
      timestamp: ts,
      section: 'GPU & AI Render',
      metricKey: 'GPU_VRAM_USED',
      abbreviatedLabel: 'VRAM Used',
      value: String(Math.round(frame.vramUsedMb)),
      unit: 'MB',
      status: frame.vramUsedMb / frame.vramTotalMb > 0.9 ? 'Elevated' : 'Nominal',
    },
    // Storage & Network
    {
      timestamp: ts,
      section: 'Storage & Network',
      metricKey: 'SSD0_RW',
      abbreviatedLabel: 'SSD 0 R/W',
      value: `${Math.round(frame.storage[0]?.readMbps ?? 0)} / ${Math.round(
        frame.storage[0]?.writeMbps ?? 0
      )}`,
      unit: 'MB/s',
      status: 'Nominal',
    },
    {
      timestamp: ts,
      section: 'Storage & Network',
      metricKey: 'NIC_RX_TX',
      abbreviatedLabel: 'Net Down / Up',
      value: `${frame.network.rxMbps.toFixed(1)} / ${frame.network.txMbps.toFixed(1)}`,
      unit: 'Mbps',
      status: 'Nominal',
    },
  ];

  return rows;
}

export function formatOrganizedCsv(
  rows: CsvTelemetryRow[],
  filterSection: CsvSectionCategory = 'All Sections'
): string {
  const filtered =
    filterSection === 'All Sections'
      ? rows
      : rows.filter((row) => row.section === filterSection);

  const sectionOrder: Exclude<CsvSectionCategory, 'All Sections'>[] = [
    'Power Management',
    'RAM Timings',
    'CPU & Thermal',
    'GPU & AI Render',
    'Storage & Network',
  ];

  const sorted = [...filtered].sort((a, b) => {
    const idxA = sectionOrder.indexOf(a.section);
    const idxB = sectionOrder.indexOf(b.section);
    if (idxA !== idxB) return idxA - idxB;
    return a.timestamp.localeCompare(b.timestamp);
  });

  const header = ['Section', 'Timestamp', 'MetricKey', 'SensorLabel', 'Value', 'Unit', 'Status']
    .map(escapeCsvCell)
    .join(',');

  const lines = sorted.map((r) =>
    [r.section, r.timestamp, r.metricKey, r.abbreviatedLabel, r.value, r.unit, r.status]
      .map(escapeCsvCell)
      .join(',')
  );

  return [header, ...lines].join('\r\n');
}
