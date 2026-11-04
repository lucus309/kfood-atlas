import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { metrics, getRows, makeCSV } from './dist/engine.mjs';
const data = JSON.parse(await readFile(new URL('./dist/data.json', import.meta.url), 'utf8'));
const baseline = {
  product: '190230',
  start: 2021,
  end: 2025,
  sort: 'last',
  search: '',
  minimum: 0,
  complete: false,
};
const china = getRows(data, baseline).find((r) => r.country === 156);
assert.equal(china.metrics.last, 392593287);
assert.ok(Math.abs(china.metrics.cagr - ((392593287 / 155007334) ** 0.25 - 1)) < 1e-12);
assert.equal(getRows(data, { ...baseline, search: '중국' }).length, 1);
assert.equal(getRows(data, { ...baseline, search: 'china' })[0].country, 156);
assert.equal(getRows(data, { ...baseline, search: 'no such country' }).length, 0);
assert.ok(getRows(data, { ...baseline, minimum: 1e7 }).every((r) => r.metrics.last >= 1e7));
assert.ok(getRows(data, { ...baseline, complete: true }).every((r) => r.metrics.observed === 5));
assert.equal(metrics([null, 2, 3, 4, 5]).growth, null);
assert.equal(metrics([0, 2, 3, 4, 5]).growth, null);
assert.equal(metrics([0, 2, 3, 4, 5]).delta, 5);
assert.equal(metrics([1, 2, null, 4, 5]).observed, 4);
assert.equal(metrics([1, 2, 3, 4, 5], 2023, 2025).expected, 3);
assert.equal(metrics([1, 2, 3, 4, 5], 2023, 2025).growth, 5 / 3 - 1);
assert.throws(() => metrics([1, 2, 3, 4, 5], 2025, 2025), RangeError);
for (const p of data.products) {
  for (let i = 0; i < 5; i++) {
    const world = data.rows.find((r) => r.country === 0 && r.product === p.code).values[i];
    const total = data.rows
      .filter((r) => r.country !== 0 && r.product === p.code)
      .reduce((a, r) => a + (r.values[i] ?? 0), 0);
    // Excluded destination 899 is recorded in the original source, not the country exploration set.
    assert.ok(total <= world, `${p.code}/${2021 + i}: country amount exceeds world`);
  }
}
const sorted = getRows(data, { ...baseline, sort: 'cagr' });
assert.ok(
  sorted
    .slice(0, -1)
    .every(
      (r, i) =>
        r.metrics.cagr === null ||
        sorted[i + 1].metrics.cagr === null ||
        r.metrics.cagr >= sorted[i + 1].metrics.cagr,
    ),
);
const csv = makeCSV([china], data.products[0], 2021, 2025);
assert.ok(csv.includes('392593287'));
assert.ok(csv.includes('연평균성장률'));
console.log(
  'PASS: source amount, annualized growth, period changes, search, filters, missing vs zero, ordering, totals, CSV.',
);
