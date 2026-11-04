import assets from '../.build/assets.mjs';
import { createDataTools } from './data.mjs';
import { readApiKey } from './api-key.mjs';
import { readChatRequest, RequestError } from './chat-request.mjs';
import { createChatStorage, chatCacheKey } from './chat-storage.mjs';
import { streamChat } from './chat-stream.mjs';
export { readApiKey } from './api-key.mjs';
const data = createDataTools(assets);
const json = (value, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

function staticResponse(request, pathname) {
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response('Method not allowed', { status: 405 });
  const asset = assets[pathname === '/' ? '/index.html' : pathname];
  if (!asset) return new Response('Not found', { status: 404 });
  return new Response(request.method === 'HEAD' ? null : asset.body, {
    headers: {
      'Content-Type': asset.type,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export default {
  async fetch(request, env, execution) {
    const url = new URL(request.url);
    if (url.pathname === '/health')
      return json({
        ok: true,
        chatConfigured: !!(env.OPENAI_API_KEY || env.OPENAI_KEY_ENVELOPE),
        storage: !!env.DB,
      });
    if (url.pathname !== '/api/chat') return staticResponse(request, url.pathname);
    if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: '허용되지 않은 요청입니다.' }, 403);
    let body;
    try {
      body = await readChatRequest(request, data.valid);
    } catch (error) {
      if (error instanceof RequestError) return json({ error: error.message }, error.status);
      throw error;
    }
    const apiKey = await readApiKey(env);
    if (!apiKey || !env.DB) return json({ error: '분석 도우미 연결을 준비 중입니다.' }, 503);
    const storage = createChatStorage(env.DB);
    const cacheKey = await chatCacheKey(body);
    const cached = await storage.cached(cacheKey);
    if (cached) return json({ ...cached, cached: true });
    const limit = await storage.reserve(request);
    if (limit) return json({ error: limit }, 429);
    return streamChat({
      apiKey,
      context: data.context(body),
      messages: body.messages,
      storage,
      cacheKey,
      execution,
    });
  },
};
