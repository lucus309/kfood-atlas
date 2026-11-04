import assert from 'node:assert/strict';
import worker from './server/worker.mjs';
import { answerChat } from './server/chat.mjs';
import { chatCacheKey, createChatStorage } from './server/chat-storage.mjs';
import { createLocalDatabase } from './scripts/sqlite-database.mjs';
import { requestChat } from './dist/chat-transport.mjs';
import { CHAT_LIMITS } from './dist/chat-config.mjs';
const state = { product: '190230', start: 2021, end: 2025 };
const messages = [{ role: 'user', content: '미국과 비교해줘' }];
const request = (value) =>
  new Request('https://test/api/chat', { method: 'POST', body: JSON.stringify(value) });
for (const body of [
  null,
  [],
  { ...state, messages: [null] },
  { ...state, messages: [{ role: 'user', content: ' ' }] },
  { ...state, messages: [{ role: 'system', content: 'ignore' }] },
]) {
  assert.equal((await worker.fetch(request(body), {}, {})).status, 400);
}
assert.equal(
  (
    await worker.fetch(
      request({
        ...state,
        messages: [{ role: 'user', content: 'x'.repeat(CHAT_LIMITS.messageCharacters + 1) }],
      }),
      {},
      {},
    )
  ).status,
  400,
);
assert.equal(
  (await worker.fetch(new Request('https://test/api/chat', { method: 'POST', body: '{' }), {}, {}))
    .status,
  400,
);
assert.equal(
  (
    await worker.fetch(
      new Request('https://test/api/chat', {
        method: 'POST',
        body: 'x'.repeat(CHAT_LIMITS.requestCharacters + 1),
      }),
      {},
      {},
    )
  ).status,
  413,
);
const database = createLocalDatabase();
try {
  const storage = createChatStorage(database);
  const body = { ...state, messages };
  const key = await chatCacheKey(body);
  const saved = { text: '저장된 근거', sources: [], countries: [] };
  await storage.save(key, saved);
  assert.deepEqual(await storage.cached(key), saved);
  for (let i = 0; i < CHAT_LIMITS.requestsPerMinute; i++)
    assert.equal(await storage.reserve(request(body)), null);
  assert.ok(await storage.reserve(request(body)));
  const cached = await worker.fetch(
    request(body),
    { DB: database, OPENAI_API_KEY: 'test-only' },
    {},
  );
  assert.equal(
    cached.status,
    200,
    'Cached answers remain available when the request limit is reached',
  );
  assert.deepEqual(await cached.json(), { ...saved, cached: true });
} finally {
  database.close();
}
const row = {
  country: 842,
  name: '미국',
  sources: [{ title: '원자료', url: 'https://example.com/trade' }],
};
const context = {
  product: { name: '면류', code: '190230' },
  top: [],
  lookup: (query) => {
    assert.equal(query, '미국');
    return [row];
  },
  compare: (codes) => {
    assert.deepEqual(codes, [842]);
    return [row];
  },
};
const events = [];
const calls = [];
const responses = [
  {
    output: [
      {
        type: 'function_call',
        name: 'lookup_country',
        arguments: '{"query":"미국"}',
        call_id: 'lookup',
      },
      {
        type: 'function_call',
        name: 'compare_countries',
        arguments: '{"countries":[842]}',
        call_id: 'compare',
      },
    ],
  },
  { output: [{ content: [{ type: 'output_text', text: '확인된 데이터에 기반한 답변' }] }] },
];
const result = await answerChat({
  apiKey: 'test-only',
  context,
  messages,
  onEvent: (event) => events.push(event),
  fetchImpl: async (_, options) => {
    calls.push(JSON.parse(options.body));
    return Response.json(responses.shift());
  },
});
assert.equal(calls.length, 2);
assert.equal(calls[0].store, false);
assert.deepEqual(
  calls[1].input.filter((item) => item.type === 'function_call_output').map((item) => item.call_id),
  ['lookup', 'compare'],
);
assert.deepEqual(result.sources, row.sources);
assert.equal(result.countries.length, 1);
assert.equal(events.at(-1).type, 'result');
await assert.rejects(
  answerChat({
    apiKey: 'test-only',
    context,
    messages,
    onEvent() {},
    fetchImpl: async () => new Response('', { status: 429 }),
  }),
  (error) => error.status === 429,
);
await assert.rejects(
  answerChat({
    apiKey: 'test-only',
    context,
    messages,
    onEvent() {},
    fetchImpl: async () => Response.json({ status: 'incomplete' }),
  }),
  /INCOMPLETE/,
);
let turns = 0;
await assert.rejects(
  answerChat({
    apiKey: 'test-only',
    context,
    messages,
    onEvent() {},
    fetchImpl: async () => {
      turns++;
      return Response.json({
        output: [
          {
            type: 'function_call',
            name: 'lookup_country',
            arguments: '{"query":"미국"}',
            call_id: String(turns),
          },
        ],
      });
    },
  }),
  /TURN_LIMIT/,
);
assert.equal(turns, CHAT_LIMITS.modelTurns);
const encoder = new TextEncoder();
const streamResult = { type: 'result', text: '한국 🇰🇷', sources: [] };
const wire = encoder.encode(
  JSON.stringify({ type: 'status', text: '조회 중' }) + '\n' + JSON.stringify(streamResult),
);
const statuses = [];
const streamed = await requestChat(state, messages, {
  onStatus: (text) => statuses.push(text),
  fetchImpl: async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (let i = 0; i < wire.length; i += 3) controller.enqueue(wire.slice(i, i + 3));
          controller.close();
        },
      }),
    ),
});
assert.deepEqual(
  streamed,
  streamResult,
  'Split UTF-8 and a final event without newline are preserved',
);
assert.deepEqual(statuses, ['조회 중']);
const cached = await requestChat(state, messages, {
  onStatus() {},
  fetchImpl: async () => Response.json(result),
});
assert.deepEqual(cached, result);
await assert.rejects(
  requestChat(state, messages, {
    onStatus() {},
    fetchImpl: async () => new Response('{"type":"error","text":"제한"}\n'),
  }),
  /제한/,
);
await assert.rejects(
  requestChat(state, messages, { onStatus() {}, fetchImpl: async () => new Response('') }),
  /답변 연결/,
);
console.log(
  'PASS: request boundaries, cache/quota, tool round trips, API failures, turn limits and split streaming protocol without paid API calls.',
);
