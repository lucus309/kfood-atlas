import { CHAT_LIMITS } from '../dist/chat-config.mjs';
const encoder = new TextEncoder();

export async function chatCacheKey(body) {
  const fingerprint = JSON.stringify({
    version: 2,
    product: body.product,
    start: body.start,
    end: body.end,
    messages: body.messages,
  });
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(fingerprint));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function createChatStorage(database) {
  return {
    async cached(key) {
      const row = await database
        .prepare('SELECT result FROM chat_cache WHERE key=? AND created_at>?')
        .bind(key, Date.now() - CHAT_LIMITS.cacheMilliseconds)
        .first();
      return row ? JSON.parse(row.result) : null;
    },
    async reserve(request) {
      const minute = Math.floor(Date.now() / 60000);
      const rateKey = `${request.headers.get('cf-connecting-ip') || 'local'}:${minute}`;
      // Conditional increments keep concurrent requests inside the configured quota.
      const rate = await database
        .prepare(
          'INSERT INTO chat_rate(key,count) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count',
        )
        .bind(rateKey, CHAT_LIMITS.requestsPerMinute)
        .first();
      if (!rate) return '잠시 후 다시 질문해주세요.';
      const day = new Date().toISOString().slice(0, 10);
      const quota = await database
        .prepare(
          'INSERT INTO chat_usage(day,count) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET count=count+1 WHERE count<? RETURNING count',
        )
        .bind(day, CHAT_LIMITS.answersPerDay)
        .first();
      return quota
        ? null
        : '오늘의 분석 횟수를 모두 사용했습니다. 저장된 답변은 계속 볼 수 있어요.';
    },
    async save(key, result) {
      await database
        .prepare('INSERT OR REPLACE INTO chat_cache(key,result,created_at) VALUES(?,?,?)')
        .bind(key, JSON.stringify(result), Date.now())
        .run();
    },
  };
}
