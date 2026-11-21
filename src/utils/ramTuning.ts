import type { RamTimingsConfig } from '../types/hardware';

export interface RamValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  firstWordLatencyNs: number;
  theoreticalBandwidthGbSec: number;
}

export const RAM_PRESETS: Record<string, RamTimingsConfig> = {
  'EXPO 6000 CL30': {
    profileName: 'EXPO 6000 CL30 (Balanced)',
    ddrGeneration: 'DDR5',
    speedMt: 6000,
    channels: 2,
    tCL: 30,
    tRCD: 36,
    tRP: 36,
    tRAS: 76,
    tRC: 112,
    tRFC: 480,
    tFAW: 24,
    tREFI: 32768,
    commandRate: '1T',
    gearMode: '1:1 UCLK',
    vddMv: 1350,
    vddqMv: 1350,
    fclkMhz: 2000,
  },
  'XMP 6400 Tight': {
    profileName: 'XMP 6400 CL28 (Flight Tuned)',
    ddrGeneration: 'DDR5',
    speedMt: 6400,
    channels: 2,
    tCL: 28,
    tRCD: 37,
    tRP: 37,
    tRAS: 66,
    tRC: 103,
    tRFC: 390,
    tFAW: 20,
    tREFI: 50000,
    commandRate: '1T',
    gearMode: '1:1 UCLK',
    vddMv: 1420,
    vddqMv: 1400,
    fclkMhz: 2133,
  },
  'JEDEC 4800 Safe': {
    profileName: 'JEDEC 4800 CL40 (Recovery)',
    ddrGeneration: 'DDR5',
    speedMt: 4800,
    channels: 2,
    tCL: 40,
    tRCD: 40,
    tRP: 40,
    tRAS: 77,
    tRC: 117,
    tRFC: 710,
    tFAW: 32,
    tREFI: 9360,
    commandRate: '2T',
    gearMode: 'Gear 2',
    vddMv: 1100,
    vddqMv: 1100,
    fclkMhz: 1800,
  },
};

export function calculateFirstWordLatencyNs(tCL: number, speedMt: number): number {
  if (speedMt <= 0) return 0;
  return Number(((tCL * 2000) / speedMt).toFixed(2));
}

export function calculateBandwidthGbSec(speedMt: number, channels: number): number {
  return Number(((speedMt * 8 * channels) / 1000).toFixed(1));
}

export function validateRamTimings(config: RamTimingsConfig): RamValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (config.tCL < 12 || config.tCL > 60) {
    errors.push(`CAS Latency (tCL ${config.tCL}) is outside safe bounds (12–60).`);
  }
  if (config.tRAS < config.tRCD + config.tCL - 4) {
    warnings.push(
      `tRAS (${config.tRAS}) is tighter than tRCD + tCL (${config.tRCD + config.tCL}); may cause memory instability under load.`
    );
  }
  if (config.tRC < config.tRAS + config.tRP) {
    errors.push(
      `tRC (${config.tRC}) must be >= tRAS + tRP (${config.tRAS + config.tRP}) to prevent boot hang.`
    );
  }
  if (config.ddrGeneration === 'DDR5' && config.vddMv > 1450) {
    warnings.push(
      `RAM VDD (${(config.vddMv / 1000).toFixed(3)}V) exceeds 1.450V — active RAM cooling recommended.`
    );
  }
  if (config.ddrGeneration === 'DDR5' && config.vddMv < 1050) {
    errors.push(`RAM VDD (${(config.vddMv / 1000).toFixed(3)}V) is below DDR5 1.050V minimum.`);
  }
  if (config.tREFI > 65535) {
    errors.push(`tREFI (${config.tREFI}) exceeds 65535 max register limit.`);
  } else if (config.tREFI >= 48000) {
    warnings.push(`High tREFI (${config.tREFI}) is sensitive to RAM temps above 125°F.`);
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    firstWordLatencyNs: calculateFirstWordLatencyNs(config.tCL, config.speedMt),
    theoreticalBandwidthGbSec: calculateBandwidthGbSec(config.speedMt, config.channels),
  };
}

export function generateBiosWritePayload(config: RamTimingsConfig): string {
  const latency = calculateFirstWordLatencyNs(config.tCL, config.speedMt);
  return [
    `# Die Hardware BIOS Memory Timing Payload (Carolina Blocks Studio)`,
    `# Target Profile: ${config.profileName} | Est. Latency: ${latency} ns`,
    `Set-UEFIMemoryConfig -DDR ${config.ddrGeneration} -DataRateMT ${config.speedMt} -Gear "${config.gearMode}"`,
    `Set-UEFIPrimaryTimings -tCL ${config.tCL} -tRCD ${config.tRCD} -tRP ${config.tRP} -tRAS ${config.tRAS} -CR ${config.commandRate}`,
    `Set-UEFISecondaryTimings -tRC ${config.tRC} -tRFC ${config.tRFC} -tFAW ${config.tFAW} -tREFI ${config.tREFI}`,
    `Set-UEFIVoltage -VDD_mV ${config.vddMv} -VDDQ_mV ${config.vddqMv} -FCLK_MHz ${config.fclkMhz}`,
    `Commit-NVRAMStage -VerifyCRC32 -ScheduleWarmReboot:$false`,
  ].join('\n');
}
