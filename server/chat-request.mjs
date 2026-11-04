import { CHAT_LIMITS } from '../dist/chat-config.mjs';

export class RequestError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function readChatRequest(request, validContext) {
  if (Number(request.headers.get('content-length')) > CHAT_LIMITS.requestCharacters) {
    throw new RequestError('질문이 너무 깁니다.', 413);
  }
  let body;
  try {
    const text = await request.text();
    if (text.length > CHAT_LIMITS.requestCharacters)
      throw new RequestError('질문이 너무 깁니다.', 413);
    body = JSON.parse(text);
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError('질문 형식을 확인해주세요.', 400);
  }
  const messages = body?.messages;
  const validMessage = (message) =>
    message &&
    ['user', 'assistant'].includes(message.role) &&
    typeof message.content === 'string' &&
    message.content.length <= CHAT_LIMITS.messageCharacters;
  if (
    !validContext(body) ||
    !Array.isArray(messages) ||
    !messages.length ||
    messages.length > CHAT_LIMITS.messages ||
    !messages.every(validMessage) ||
    messages.at(-1).role !== 'user' ||
    !messages.at(-1).content.trim()
  ) {
    throw new RequestError('제품·기간과 질문을 확인해주세요.', 400);
  }
  return body;
}
