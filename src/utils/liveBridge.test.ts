import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAgentTelemetry } from './liveBridge';
import { createInitialFrame } from './telemetryEngine';

test('merges and double-checks live Windows Agent hardware telemetry in Fahrenheit', () => {
  const base = createInitialFrame('NVIDIA');
  const merged = mergeAgentTelemetry(base, {
    doubleChecked: true,
    verificationNote: 'Verified live via CIM/WMI + PerfCounters + nvidia-smi',
    osVersion: 'Windows 11 Pro (Build 26100)',
    cpuName: 'AMD Ryzen 7 7800X3D',
    cpuThreads: 16,
    cpuLoadPct: 30,
    cpuLoadCounterPct: 34,
    cpuClockGhz: 4.85,
    cpuTempF: 142.5,
    gpuName: 'NVIDIA GeForce RTX 4080 SUPER',
    gpuVendor: 'NVIDIA',
    gpuLoadPct: 78,
    gpuClockMhz: 2790,
    gpuTempF: 138.2,
    gpuPowerW: 245.5,
    vramUsedMb: 9420,
    vramTotalMb: 16384,
    ramUsedGb: 18.2,
    ramTotalGb: 32,
    ramSpeedMt: 6000,
    storage: [
      {
        label: 'WD_BLACK SN850X 2TB',
        interfaceBus: 'NVMe SSD',
        readMbps: 3420,
        writeMbps: 1120,
        queueDepth: 4,
        tempF: 111.2,
        healthPct: 100,
      },
    ],
    network: {
      adapterName: 'Realtek 2.5GbE',
      linkSpeedGbps: 2.5,
      rxMbps: 412.5,
      txMbps: 38.2,
    },
  });

  assert.equal(merged.sourceMode, 'Live Windows Agent (Double-Checked)');
  assert.equal(merged.cpuName, 'AMD Ryzen 7 7800X3D');
  assert.equal(merged.cpuLoadPct, 32); // Averaged double-check between WMI 30 and PerfCounter 34
  assert.equal(merged.cpuTempF, 142.5);
  assert.equal(merged.gpuName, 'NVIDIA GeForce RTX 4080 SUPER');
  assert.equal(merged.gpuTempF, 138.2);
  assert.equal(merged.storage[0].label, 'WD_BLACK SN850X 2TB');
  assert.equal(merged.storage[0].tempF, 111.2);
});
