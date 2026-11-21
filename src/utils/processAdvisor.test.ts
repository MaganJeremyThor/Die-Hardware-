import test from 'node:test';
import assert from 'node:assert/strict';
import type { SystemProcessEntry } from '../types/hardware';
import { analyzeProcess, getProcessesForDomain } from './processAdvisor';
import { GPU_OC_PRESETS, stepTelemetryFrame } from './telemetryEngine';

const sampleProcesses: SystemProcessEntry[] = [
  {
    pid: 2104,
    processName: 'Windows Desktop (dwm)',
    exeName: 'dwm.exe',
    domains: ['GPU', 'RAM'],
    engineType: 'Compositor',
    cpuPct: 1.2,
    gpuPct: 2,
    vramMb: 940,
    sharedMb: 310,
    ramMb: 280,
    diskMbps: 0,
    netMbps: 0,
  },
  {
    pid: 18420,
    processName: 'Game Engine (DX12)',
    exeName: 'GameEngineDX12.exe',
    domains: ['CPU', 'GPU', 'RAM', 'Storage'],
    engineType: '3D / AI',
    cpuPct: 24.5,
    gpuPct: 71,
    vramMb: 11420,
    sharedMb: 840,
    ramMb: 6840,
    diskMbps: 620,
    netMbps: 12.4,
  },
  {
    pid: 9312,
    processName: 'DLSS Frame Gen',
    exeName: 'nvngx_dlssg.dll',
    domains: ['GPU', 'RAM'],
    engineType: 'Compute',
    cpuPct: 2.1,
    gpuPct: 11,
    vramMb: 1840,
    sharedMb: 190,
    ramMb: 420,
    diskMbps: 0,
    netMbps: 0,
  },
  {
    pid: 14288,
    processName: 'Video Capture (obs64)',
    exeName: 'obs64.exe',
    domains: ['CPU', 'GPU', 'RAM', 'Storage'],
    engineType: 'Media',
    cpuPct: 4.8,
    gpuPct: 4,
    vramMb: 1120,
    sharedMb: 140,
    ramMb: 960,
    diskMbps: 185,
    netMbps: 18.5,
  },
];

test('marks critical Windows & GPU display processes as required and blocks End Process', () => {
  const advice = analyzeProcess(sampleProcesses[0], 'GPU');
  assert.equal(advice.hardwareNeedLevel, 'required');
  assert.equal(advice.hardwareNeedsToRun, true);
  assert.equal(advice.recommendation, 'Let It Run');
  assert.equal(advice.canEndProcess, false);
  assert.equal(advice.recommendationBadge, 'Required');
});

test('marks Game Engine DX12 and DLSS Frame Gen as active workload with Let It Run guidance plus optional End Process', () => {
  const gameAdvice = analyzeProcess(sampleProcesses[1], 'GPU');
  assert.equal(gameAdvice.hardwareNeedLevel, 'active-workload');
  assert.equal(gameAdvice.hardwareNeedsToRun, false);
  assert.equal(gameAdvice.recommendation, 'Let It Run');
  assert.equal(gameAdvice.canEndProcess, true);
  assert.ok(gameAdvice.reclaimSummary.includes('11,420 MB VRAM'));

  const dlssAdvice = analyzeProcess(sampleProcesses[2], 'GPU');
  assert.equal(dlssAdvice.hardwareNeedLevel, 'active-workload');
  assert.equal(dlssAdvice.recommendation, 'Let It Run');
  assert.equal(dlssAdvice.canEndProcess, true);
});

test('marks unneeded background apps as safe to End Process with reclaim stats', () => {
  const obsAdvice = analyzeProcess(sampleProcesses[3], 'GPU');
  assert.equal(obsAdvice.hardwareNeedLevel, 'not-needed');
  assert.equal(obsAdvice.hardwareNeedsToRun, false);
  assert.equal(obsAdvice.recommendation, 'End Process');
  assert.equal(obsAdvice.recommendationBadge, 'Can End');
  assert.equal(obsAdvice.canEndProcess, true);
  assert.ok(obsAdvice.reclaimSummary.includes('1,120 MB VRAM'));
});

test('filters and sorts processes by hardware domain consumption', () => {
  const gpuTop = getProcessesForDomain(sampleProcesses, 'GPU', 3);
  assert.equal(gpuTop[0].pid, 18420);
  assert.equal(gpuTop[1].pid, 9312);

  const cpuTop = getProcessesForDomain(sampleProcesses, 'CPU', 2);
  assert.equal(cpuTop[0].pid, 18420);
  assert.equal(cpuTop[1].pid, 14288);
});

test('ending a process removes it from live telemetry and reclaims VRAM and CPU/GPU load', () => {
  const baseline = stepTelemetryFrame(null, 5.0, 'NVIDIA', {
    presetId: 'balanced',
    ...GPU_OC_PRESETS.balanced,
  }, false);
  const afterKill = stepTelemetryFrame(
    baseline,
    5.0,
    'NVIDIA',
    { presetId: 'balanced', ...GPU_OC_PRESETS.balanced },
    false,
    undefined,
    100,
    [14288] // Video Capture (obs64) — 1120 MB VRAM
  );

  assert.equal(
    baseline.vramProcesses.some((p) => p.pid === 14288),
    true
  );
  assert.equal(
    afterKill.vramProcesses.some((p) => p.pid === 14288),
    false
  );
  assert.equal(baseline.vramUsedMb - afterKill.vramUsedMb, 1120);
  assert.ok(afterKill.cpuLoadPct < baseline.cpuLoadPct);
});
