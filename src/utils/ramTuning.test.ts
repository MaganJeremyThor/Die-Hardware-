import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RAM_PRESETS,
  calculateBandwidthGbSec,
  calculateFirstWordLatencyNs,
  generateBiosWritePayload,
  validateRamTimings,
} from './ramTuning';

test('calculates first-word latency and theoretical DDR5 bandwidth accurately', () => {
  // 30 * 2000 / 6000 = 10.00 ns
  assert.equal(calculateFirstWordLatencyNs(30, 6000), 10);
  // 6000 * 8 * 2 / 1000 = 96.0 GB/s
  assert.equal(calculateBandwidthGbSec(6000, 2), 96);
});

test('flags invalid tRC < tRAS + tRP and excessive tREFI', () => {
  const broken = {
    ...RAM_PRESETS['EXPO 6000 CL30'],
    tRC: 90, // invalid since 76 + 36 = 112
    tREFI: 70000,
  };
  const validation = validateRamTimings(broken);
  assert.equal(validation.valid, false);
  assert.equal(validation.errors.length, 2);
});

test('generates UEFI NVRAM command payload containing all edited timings', () => {
  const payload = generateBiosWritePayload(RAM_PRESETS['XMP 6400 Tight']);
  assert.match(payload, /-tCL 28/);
  assert.match(payload, /-VDD_mV 1420/);
  assert.match(payload, /Commit-NVRAMStage/);
});
