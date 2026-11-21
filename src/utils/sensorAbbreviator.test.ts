import test from 'node:test';
import assert from 'node:assert/strict';
import { abbreviateSensorName, evaluateSensorStatus, normalizeSensors } from './sensorAbbreviator';

test('abbreviates verbose motherboard and GPU sensors into short simple labels', () => {
  const vrm = abbreviateSensorName('Nuvoton NCT6798D - Motherboard VRM MOS Temperature');
  assert.equal(vrm.shortName, 'Board VRM');
  assert.equal(vrm.module, 'Power');

  const cpu = abbreviateSensorName('AMD Ryzen 9 - Core (Tctl/Tdie) Temperature');
  assert.equal(cpu.shortName, 'CPU Temp');
  assert.equal(cpu.module, 'CPU');

  const vram = abbreviateSensorName('NVIDIA GeForce RTX 4090 - GPU Memory Junction Temperature');
  assert.equal(vram.shortName, 'VRAM Temp');
  assert.equal(vram.module, 'GPU');

  const nvme = abbreviateSensorName('NVMe 0 Composite Temperature');
  assert.equal(nvme.shortName, 'SSD 0 Temp');
  assert.equal(nvme.module, 'Storage');
});

test('evaluates Fahrenheit sensor warning and critical thresholds accurately', () => {
  assert.equal(evaluateSensorStatus(145, 176, 198), 'Nominal');
  assert.equal(evaluateSensorStatus(182, 176, 198), 'Elevated');
  assert.equal(evaluateSensorStatus(201, 176, 198), 'Critical');
});

test('normalizes a batch of raw sensors with Fahrenheit units', () => {
  const result = normalizeSensors([
    {
      id: 's1',
      rawName: 'ACPI\\ThermalZone\\TZ00 - System Ambient',
      value: 86.5,
      unit: '°F',
      min: 68,
      max: 131,
    },
  ]);
  assert.equal(result[0].shortName, 'Case Temp');
  assert.equal(result[0].module, 'Cooling');
  assert.equal(result[0].unit, '°F');
  assert.equal(result[0].value, 86.5);
});
