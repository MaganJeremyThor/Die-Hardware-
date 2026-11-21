import type { AbbreviatedSensor, SensorCategory, SensorStatus } from '../types/hardware';

export interface RawSensorInput {
  id: string;
  rawName: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  warnThreshold?: number;
  critThreshold?: number;
}

interface AbbreviationRule {
  pattern: RegExp;
  shortName: string | ((match: RegExpMatchArray) => string);
  module: SensorCategory;
}

const ABBREVIATION_RULES: AbbreviationRule[] = [
  {
    pattern: /(?:Tctl\/Tdie|Package.*Temperature|CPU Package)/i,
    shortName: 'CPU Temp',
    module: 'CPU',
  },
  {
    pattern: /(?:Core\s*#?(\d+).*Clock|CCD\d*.*Clock)/i,
    shortName: (m) => (m[1] ? `Core ${m[1]} Clk` : 'CPU Clock'),
    module: 'CPU',
  },
  {
    pattern: /(?:CPU.*Core Voltage|\bVID\b|\bVcore\b)/i,
    shortName: 'CPU Volts',
    module: 'CPU',
  },
  {
    pattern: /(?:L3 Cache|CPU.*Effective Clock)/i,
    shortName: 'CPU Eff Clk',
    module: 'CPU',
  },
  {
    pattern: /(?:Motherboard.*VRM.*MOS|VR MOS|VRM Temp)/i,
    shortName: 'Board VRM',
    module: 'Power',
  },
  {
    pattern: /(?:GPU Memory Junction|VRAM HotSpot|GDDR6X? Temp)/i,
    shortName: 'VRAM Temp',
    module: 'GPU',
  },
  {
    pattern: /(?:GPU Hot Spot|GPU Junction)/i,
    shortName: 'GPU Hotspot',
    module: 'GPU',
  },
  {
    pattern: /(?:GPU Core Temperature|GPU Die Temperature|GPU Temp)/i,
    shortName: 'GPU Temp',
    module: 'GPU',
  },
  {
    pattern: /(?:GPU Core Clock|Graphics Clock)/i,
    shortName: 'GPU Clock',
    module: 'GPU',
  },
  {
    pattern: /(?:GPU.*Power|Total Graphics Power|TGP|ASIC Power)/i,
    shortName: 'GPU Power',
    module: 'Power',
  },
  {
    pattern: /(?:Tensor|AI Matrix|Optical Flow)/i,
    shortName: 'AI Load',
    module: 'GPU',
  },
  {
    pattern: /(?:DIMM.*Temperature|DRAM.*Temp|SPD Hub)/i,
    shortName: 'RAM Temp',
    module: 'RAM & VRAM',
  },
  {
    pattern: /(?:VRAM.*Allocated|Dedicated GPU Memory)/i,
    shortName: 'VRAM Used',
    module: 'RAM & VRAM',
  },
  {
    pattern: /(?:System Memory.*Load|Physical Memory Used)/i,
    shortName: 'RAM Used',
    module: 'RAM & VRAM',
  },
  {
    pattern: /(?:NVMe.*?(\d+).*Composite Temperature|SSD.*Temp)/i,
    shortName: (m) => (m[1] ? `SSD ${m[1]} Temp` : 'SSD 0 Temp'),
    module: 'Storage',
  },
  {
    pattern: /(?:NVMe.*?(\d+).*Read Speed|Disk Read Throughput)/i,
    shortName: (m) => (m[1] ? `SSD ${m[1]} Read` : 'SSD Read'),
    module: 'Storage',
  },
  {
    pattern: /(?:NVMe.*?(\d+).*Write Speed|Disk Write Throughput)/i,
    shortName: (m) => (m[1] ? `SSD ${m[1]} Write` : 'SSD Write'),
    module: 'Storage',
  },
  {
    pattern: /(?:\+12V|12V Rail)/i,
    shortName: '12V Rail',
    module: 'Power',
  },
  {
    pattern: /(?:\+5V|5V Rail)/i,
    shortName: '5V Rail',
    module: 'Power',
  },
  {
    pattern: /(?:\+3\.3V|3\.3V Rail)/i,
    shortName: '3.3V Rail',
    module: 'Power',
  },
  {
    pattern: /(?:CPU Package Power|PPT)/i,
    shortName: 'CPU Power',
    module: 'Power',
  },
  {
    pattern: /(?:Total System.*Wall|AC Input Power)/i,
    shortName: 'Total Power',
    module: 'Power',
  },
  {
    pattern: /(?:AIO Pump|Water Pump|Liquid Cooler Pump)/i,
    shortName: 'Pump RPM',
    module: 'Cooling',
  },
  {
    pattern: /(?:Chassis.*Fan|System Fan\s*#?(\d*))/i,
    shortName: (m) => (m[1] ? `Case Fan ${m[1]}` : 'Case Fan'),
    module: 'Cooling',
  },
  {
    pattern: /(?:GPU Fan|VGA Fan)/i,
    shortName: 'GPU Fan',
    module: 'Cooling',
  },
  {
    pattern: /(?:ThermalZone|System Ambient|Motherboard Ambient)/i,
    shortName: 'Case Temp',
    module: 'Cooling',
  },
  {
    pattern: /(?:NIC.*Download|Ethernet.*RX|Receive Rate)/i,
    shortName: 'Net Down',
    module: 'Network',
  },
  {
    pattern: /(?:NIC.*Upload|Ethernet.*TX|Transmit Rate)/i,
    shortName: 'Net Up',
    module: 'Network',
  },
];

export function evaluateSensorStatus(
  value: number,
  warnThreshold?: number,
  critThreshold?: number
): SensorStatus {
  if (critThreshold !== undefined && value >= critThreshold) {
    return 'Critical';
  }
  if (warnThreshold !== undefined && value >= warnThreshold) {
    return 'Elevated';
  }
  return 'Nominal';
}

export function abbreviateSensorName(rawName: string): {
  shortName: string;
  module: SensorCategory;
} {
  for (const rule of ABBREVIATION_RULES) {
    const match = rawName.match(rule.pattern);
    if (match) {
      const shortName =
        typeof rule.shortName === 'function' ? rule.shortName(match) : rule.shortName;
      return { shortName, module: rule.module };
    }
  }

  const cleaned = rawName
    .replace(/^(Nuvoton|ITE|Fintek|ACPI\\ThermalZone\\TZ\d+|WMI|PCIe)\s*[-:]\s*/i, '')
    .replace(/\bMotherboard\b/gi, 'Board')
    .replace(/\bTemperature\b/gi, 'Temp')
    .replace(/\bVoltage\b/gi, 'Volts')
    .replace(/\bUtilization\b/gi, 'Load')
    .trim();

  const words = cleaned.split(/\s+/).slice(0, 3).join(' ');
  return {
    shortName: words || 'Aux Sensor',
    module: 'Cooling',
  };
}

export function normalizeSensors(inputs: RawSensorInput[]): AbbreviatedSensor[] {
  return inputs.map((item) => {
    const { shortName, module } = abbreviateSensorName(item.rawName);
    return {
      id: item.id,
      rawName: item.rawName,
      shortName,
      module,
      value: item.value,
      unit: item.unit,
      min: item.min,
      max: item.max,
      status: evaluateSensorStatus(item.value, item.warnThreshold, item.critThreshold),
    };
  });
}
