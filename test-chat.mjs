import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { readApiKey } from './server/worker.mjs';
import assets from './.build/assets.mjs';
import { createDataTools } from './server/data.mjs';
import { getOpportunityScores } from './dist/opportunities.mjs';
import { applyRecommendationModel, recommendationSelection } from './dist/recommendations.mjs';
import { comparativeCard } from './dist/comparative-copy.mjs';
const data = createDataTools(assets),
  s = { product: '1806', start: 2023, end: 2025 };
assert.equal(data.valid(s), true);
assert.equal(data.valid({ ...s, product: 'bogus' }), false);
assert.equal(data.valid({ ...s, start: 2025 }), false);
const c = data.context(s);
assert.deepEqual(
  c.top.map((r) => r.country),
  [191, 300, 642],
);
assert.equal(c.lookup('미국')[0].country, 842);
assert.equal(c.lookup('미국')[0].rank, undefined);
assert.equal(c.top[0].koreanImports.last, null);
const read = (n) => JSON.parse(assets['/' + n + '.json'].body);
const rows = applyRecommendationModel(
    getOpportunityScores(read('data'), read('imports'), read('opportunities'), s),
    read('demand'),
    s,
  ),
  top = recommendationSelection(rows).top,
  before = JSON.stringify(rows),
  cards = top.map((r) => comparativeCard(r, top, s));
assert.equal(new Set(cards.map((x) => x.title)).size, 3);
assert.match(cards[0].strengths[0], /구매력 성장.*7.0%/);
assert.match(cards[1].strengths[0], /수입시장 성장.*26.9%/);
assert.match(cards[2].strengths[0], /수입시장 규모.*7.07억/);
assert.equal(JSON.stringify(rows), before);
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync('drizzle/0000_chat.sql', 'utf8'));
const DB = {
  prepare(q) {
    let args = [];
    return {
      bind(...a) {
        args = a;
        return this;
      },
      async first() {
        return sql.prepare(q).get(...args) || null;
      },
      async run() {
        return sql.prepare(q).run(...args);
      },
    };
  },
};
const req = (body) =>
    new Request('https://test/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  wait = { waitUntil() {} };
assert.equal((await worker.fetch(req({ ...s, messages: [] }), {}, wait)).status, 400);
assert.equal(
  (await worker.fetch(req({ ...s, messages: [{ role: 'system', content: 'x' }] }), {}, wait))
    .status,
  400,
);
assert.equal(
  (await worker.fetch(req({ ...s, messages: [{ role: 'user', content: 'x' }] }), {}, wait)).status,
  503,
);
assert.equal(
  (
    await worker.fetch(
      new Request('https://test/api/chat', { method: 'POST', headers: { Origin: 'https://evil' } }),
      {},
      wait,
    )
  ).status,
  403,
);
sql.prepare('INSERT INTO chat_usage VALUES(?,40)').run(new Date().toISOString().slice(0, 10));
assert.equal(
  (
    await worker.fetch(
      req({ ...s, messages: [{ role: 'user', content: 'x' }] }),
      { DB, OPENAI_API_KEY: 'test-only' },
      wait,
    )
  ).status,
  429,
);
assert.equal(await readApiKey({}), null);
assert.equal((await worker.fetch(new Request('https://test/'), {}, wait)).status, 200);
console.log(
  'PASS: comparative differentiation, unchanged score inputs, exact data lookup, missing values, invalid inputs, cross-origin rejection and daily limit.',
);
