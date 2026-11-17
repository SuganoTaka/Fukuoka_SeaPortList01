import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getTide, parseTide } from './tide.js';

test('parses hourly tide heights, including negative values', () => {
  const heights = Array.from({ length: 24 }, (_, i) => i === 2 ? -8 : i * 10);
  const row = heights.map(n => String(n).padStart(3)).join('') + '261117QF';
  assert.deepEqual(parseTide(row, 'QF', '2026-11-17'), heights);
  assert.throws(() => parseTide(row, 'QF', '2026-11-18'), /見つかりません/);
  assert.throws(() => parseTide('999' + row.slice(3), 'QF', '2026-11-17'), /不完全/);
});

test('rejects invalid station and invalid date before fetching', async () => {
  await assert.rejects(getTide('XX', '2026-11-17'), { statusCode: 400 });
  await assert.rejects(getTide('QF', '2026-02-30'), { statusCode: 400 });
});

test('contains 65 distinct ports with valid coordinates and areas', async () => {
  const ports = JSON.parse(await readFile(new URL('./ports.json', import.meta.url), 'utf8'));
  assert.equal(ports.length, 65);
  assert.equal(new Set(ports.map(port => port.id)).size, 65);
  for (const port of ports) {
    assert.ok(port.lat > 33 && port.lat < 35 && port.lng > 129 && port.lng < 132);
    assert.ok(['筑前海', '豊前海', '有明海'].includes(port.area));
  }
});
