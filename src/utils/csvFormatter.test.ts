import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrganizedCsvRows, formatOrganizedCsv } from './csvFormatter';
import { createInitialFrame } from './telemetryEngine';
import { RAM_PRESETS } from './ramTuning';

test('organizes CSV rows cleanly by hardware sections in USA Fahrenheit units', () => {
  const frame = createInitialFrame('NVIDIA');
  const rows = buildOrganizedCsvRows(frame, RAM_PRESETS['EXPO 6000 CL30']);
  const csv = formatOrganizedCsv(rows, 'All Sections');
  const lines = csv.split('\r\n');

  assert.equal(lines[0], 'Section,Timestamp,MetricKey,SensorLabel,Value,Unit,Status');
  assert.ok(lines.some((l) => l.startsWith('Power Management,')));
  assert.ok(lines.some((l) => l.startsWith('RAM Timings,')));
  assert.ok(lines.some((l) => l.includes('CPU Temp') && l.includes('°F')));
  assert.ok(!lines.some((l) => l.includes('°C')));
});

test('filters CSV output to a single requested section', () => {
  const frame = createInitialFrame('AMD');
  const rows = buildOrganizedCsvRows(frame, RAM_PRESETS['EXPO 6000 CL30']);
  const csv = formatOrganizedCsv(rows, 'Power Management');
  const dataLines = csv.split('\r\n').slice(1);

  assert.ok(dataLines.length > 0);
  assert.ok(dataLines.every((l) => l.startsWith('Power Management,')));
});
