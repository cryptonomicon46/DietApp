import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScan, sortScans, scanChange } from '../js/bodycomp.js';
import { buildTables } from '../js/analytics.js';

test('DEXA: missing numbers are worked out from the ones on the report', () => {
  assert.deepEqual(
    (({ weight, bf, fat, lean }) => ({ weight, bf, fat, lean }))(normalizeScan({ date: '2026-01-10', weight: 200, bf: 25, bone: 7 })),
    { weight: 200, bf: 25, fat: 50, lean: 143 },
  );
  const fromMasses = normalizeScan({ date: '2026-04-10', fat: 40, lean: 145, bone: 7 });
  assert.equal(fromMasses.weight, 192);
  assert.equal(fromMasses.bf, 20.8);
});

test('DEXA: scans sort by date and changes are later minus earlier', () => {
  const [a, b] = sortScans([
    { date: '2026-04-10', weight: 190, bf: 21, lean: 143 },
    { date: '2026-01-10', weight: 200, bf: 25, lean: 142 },
  ]);
  assert.equal(a.date, '2026-01-10');
  const c = scanChange(a, b);
  assert.deepEqual([c.weight, c.fat, c.lean, c.bf, c.days], [-10, -10.1, 1, -4, 90]);
});

test('DEXA scans are in the data export', () => {
  const t = buildTables({ dexa: [{ date: '2026-01-10', weight: 200, bf: 25, where: 'BodySpec' }] });
  assert.deepEqual(t.dexa_scans[0], { date: '2026-01-10', where: 'BodySpec', weight_lb: 200, body_fat_pct: 25, fat_lb: 50, lean_lb: 150, bone_lb: '', visceral_fat_lb: '', notes: '' });
});
