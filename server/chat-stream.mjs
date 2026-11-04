import { CHAT_LIMITS } from '../dist/chat-config.mjs';
import { answerChat } from './chat.mjs';
const encoder = new TextEncoder();

function errorMessage(error) {
  if (error.status === 401) return 'API 연결이 만료되었습니다. 연결 갱신이 필요합니다.';
  if (error.status === 429) return 'API 요청이 몰렸습니다. 잠시 후 다시 시도해주세요.';
  return '답변을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.';
}

export function streamChat({ apiKey, context, messages, storage, cacheKey, execution }) {
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  let disconnected = false;
  const emit = (event) => {
    if (!disconnected)
      writer.write(encoder.encode(JSON.stringify(event) + '\n')).catch(() => {
        disconnected = true;
      });
  };
  const job = (async () => {
    try {
      emit({ type: 'status', text: '선택 제품과 추천 데이터 확인 중' });
      const result = await answerChat({
        apiKey,
        context,
        messages,
        signal: AbortSignal.timeout(CHAT_LIMITS.timeoutMilliseconds),
        onEvent: emit,
      });
      await storage.save(cacheKey, result);
    } catch (error) {
      emit({ type: 'error', text: errorMessage(error) });
    } finally {
      await writer.close().catch(() => {});
    }
  })();
  execution.waitUntil(job);
  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
