export async function* readChatEvents(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) if (line) yield JSON.parse(line);
      if (done) {
        if (pending.trim()) yield JSON.parse(pending);
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function requestChat(context, messages, { signal, onStatus, fetchImpl = fetch }) {
  const response = await fetchImpl('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...context, messages }),
    signal,
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '연결하지 못했습니다.');
  }
  if (response.headers.get('content-type')?.includes('application/json')) return response.json();
  let result;
  for await (const event of readChatEvents(response.body)) {
    if (event.type === 'status') onStatus(event.text);
    if (event.type === 'error') throw new Error(event.text);
    if (event.type === 'result') result = event;
  }
  if (!result) throw new Error('답변 연결이 끊겼습니다. 다시 시도해주세요.');
  return result;
}
