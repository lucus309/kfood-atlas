import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  getOpportunityScores,
  makeOpportunityCSV,
  WEIGHT_SCENARIOS,
  OPPORTUNITY_CRITERIA,
} from './dist/opportunities.mjs';
const read = (n) => JSON.parse(fs.readFileSync(new URL('./dist/' + n, import.meta.url)));
const data = read('data.json'),
  imports = read('imports.json'),
  evidence = read('opportunities.json');
const state = { product: '190230', start: 2021, end: 2025 };
const score = (d = data, i = imports, e = evidence, s = state) => getOpportunityScores(d, i, e, s);
const rows = score(),
  eligible = rows.filter((r) => r.score !== null);
assert.equal(eligible.length, 100);
assert.equal(eligible.filter((r) => r.culture).length, 26);
assert.deepEqual(
  eligible.slice(0, 3).map((r) => r.iso),
  ['US', 'CN', 'PL'],
);
for (const iso of ['US', 'CN']) assert.ok(eligible.some((r) => r.iso === iso));
for (const r of eligible) {
  assert.equal(r.economyStart, 2020);
  assert.equal(r.economyEnd, 2024);
  const e = evidence.economy
    .filter((v) => v.countryCode === r.country)
    .sort((a, b) => a.year - b.year);
  assert.equal(r.metrics.economyLevel, e[4].consumptionPppPerCapita);
  assert.ok(
    Math.abs(
      r.metrics.economyCagr -
        ((e[4].consumptionConstantLcuPerCapita / e[0].consumptionConstantLcuPerCapita) ** 0.25 - 1),
    ) < 1e-12,
  );
  assert.ok(Math.abs(r.score - r.points.reduce((a, b) => a + b) / 4) < 1e-9);
  assert.equal(r.rank, 1 + eligible.filter((v) => v.score > r.score).length);
  const scenarios = WEIGHT_SCENARIOS.map((s) =>
    eligible.map((v) =>
      Number(v.points.reduce((sum, p, j) => sum + p * s.weights[j], 0).toFixed(10)),
    ),
  );
  const i = eligible.indexOf(r),
    ranks = scenarios.map((a) => 1 + a.filter((v) => v > a[i]).length);
  assert.deepEqual(r.sensitivity.ranks, ranks);
  if (r.stage === 'potential')
    assert.ok(
      r.metrics.share < r.shareMedian &&
        r.metrics.last >= r.marketMedian &&
        r.metrics.cagr > 0 &&
        r.metrics.economyCagr > 0,
    );
}
for (const s of WEIGHT_SCENARIOS) {
  assert.ok(Math.abs(s.weights.reduce((a, b) => a + b) - 1) < 1e-12);
  assert.ok(s.weights.every((v) => v >= 0.15 - 1e-12 && v <= 0.35 + 1e-12));
}
// Survey removal cannot change baseline rankings or silently add a zero score.
const noCulture = score(data, imports, { ...evidence, culture: [] });
assert.deepEqual(
  noCulture.map((r) => [r.country, r.score, r.rank]),
  rows.map((r) => [r.country, r.score, r.rank]),
);
assert.ok(noCulture.every((r) => r.culture === null));
const filtered = score(data, imports, evidence, {
  ...state,
  search: 'USA',
  minimum: 1e12,
  importSearch: 'China',
  selected: [842],
});
assert.deepEqual(filtered, rows);
// Missing Korea does not gate the baseline; missing interior world imports does.
const changed = structuredClone(imports),
  us = changed.rows.find((r) => r.country === 842 && r.product === '190230');
us.korea.fill(null);
const u = score(data, changed).find((r) => r.country === 842);
assert.equal(u.score, rows.find((r) => r.country === 842).score);
assert.equal(u.stage, 'unknown');
assert.equal(u.metrics.share, null);
us.world[2] = null;
assert.equal(score(data, changed).find((r) => r.country === 842).score, null);
assert.ok(
  score(data, imports, evidence, { ...state, end: 2023 }).every(
    (r) => r.score === null && r.culture === null,
  ),
);
assert.ok(
  score(data, imports, evidence, { ...state, end: 2024 }).every(
    (r) => r.culture === null && r.economyEnd === 2024,
  ),
);
// Hand-computable two-market fixture: all four dimensions lower versus higher.
const fixtureData = {
  countries: [
    { code: 1, name: 'A', iso: 'AA' },
    { code: 2, name: 'B', iso: 'BB' },
  ],
};
const fixtureImports = {
  rows: [1, 2].map((code) => ({
    country: code,
    product: '190230',
    world: [100, 110, 120, 130, code === 1 ? 140 : 280].map((v) => v * code),
    korea: [1, 1, 1, 1, 1],
    sources: Array(5).fill(null),
  })),
};
const fixtureEvidence = {
  meta: { economyLatestYear: 2024 },
  culture: [],
  economy: [1, 2].flatMap((code) =>
    Array.from({ length: 5 }, (_, i) => ({
      countryCode: code,
      year: 2020 + i,
      consumptionPppPerCapita: code * 100,
      consumptionConstantLcuPerCapita: 100 * (1 + 0.01 * code) ** i,
    })),
  ),
};
const f = score(fixtureData, fixtureImports, fixtureEvidence);
assert.deepEqual(
  f.map((r) => [r.country, r.score]),
  [
    [2, 100],
    [1, 0],
  ],
);
const tiedImports = structuredClone(fixtureImports);
tiedImports.rows[1] = { ...tiedImports.rows[0], country: 2 };
const tiedEvidence = structuredClone(fixtureEvidence);
tiedEvidence.economy = tiedEvidence.economy.map((r) => ({
  ...r,
  consumptionPppPerCapita: 100,
  consumptionConstantLcuPerCapita: 100,
}));
assert.ok(
  score(fixtureData, tiedImports, tiedEvidence).every((r) => r.score === 50 && r.rank === 1),
);
for (const p of data.products) {
  const rr = score(data, imports, evidence, { ...state, product: p.code });
  assert.equal(rr.length, 195);
  const csv = makeOpportunityCSV(rr, p, 2021, 2025);
  assert.ok(!/NaN|undefined|Infinity/.test(csv));
  assert.equal(csv.split('\r\n').length, 196);
}
console.log(
  'PASS: fixed cohorts, 100 baseline/26 culture, US/CN, independent arithmetic, ties, missing values, survey independence, period limits, 9 sensitivity scenarios and 10-product CSV.',
);
