import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createMarketAnalyzer } from './dist/market-analysis.mjs';
import { makeRecommendationCSV } from './dist/recommendations.mjs';
import { recommendationCopy } from './dist/recommendation-copy.mjs';
const read = (name) => JSON.parse(fs.readFileSync(`dist/${name}.json`));
const data = read('data');
const demand = read('demand');
const explanations = read('ai-explanations');
const analyze = createMarketAnalyzer({
  data,
  imports: read('imports'),
  evidence: read('opportunities'),
  demand,
});
const cases = JSON.parse(fs.readFileSync('fixtures/refactor-baseline.json'));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
for (const { state, digest } of cases) {
  const { rows, selection } = analyze(state);
  const product = data.products.find((product) => product.code === state.product);
  const result = {
    rows,
    selection,
    explanations: selection.top.map((row) =>
      recommendationCopy(row, state, explanations, demand, selection.top),
    ),
    csv: makeRecommendationCSV(rows, product, state.start, state.end),
  };
  const actual = createHash('sha256')
    .update(JSON.stringify(canonical(result)))
    .digest('hex');
  assert.equal(actual, digest, JSON.stringify(state));
  assert.equal(
    analyze({ ...state, search: '미국', selected: [842] }).rows,
    rows,
    'Display filters must not recalculate the cohort',
  );
}
console.log(
  'PASS: 100 product/period snapshots preserve every analysis row, TOP3/ties, explanation and CSV.',
);
