import { CHAT_LIMITS } from './chat-config.mjs';
import { requestChat } from './chat-transport.mjs';
export function mountChat({ getContext, openCountry }) {
  const root = document.createElement('div');
  root.className = 'chat-widget';
  root.innerHTML = `<button class="chat-launch" aria-label="분석 도우미 열기" aria-expanded="false"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-10a9 9 0 0 1 18 0Z"/><path d="M7 11h.01M12 11h.01M17 11h.01" stroke-linecap="round" stroke-width="3"/></svg></button><section class="chat-panel" role="dialog" aria-label="K-food 분석 도우미" hidden><header><span class="chat-brand" aria-hidden="true">k</span><div class="chat-heading"><strong>K-food 분석 도우미</strong><span>시장 분석 AI</span></div><button class="chat-new" aria-label="새 대화" title="새 대화">＋</button><button class="chat-close" aria-label="닫기">×</button></header><div class="chat-scope"><span class="chat-scope-dot"></span><small class="chat-context"></small></div><div class="chat-messages" aria-live="polite"></div><div class="chat-prompts"><span class="chat-prompt-label">이렇게 물어보세요</span><button>1위와 2위는 어떤 차이가 있어?<span aria-hidden="true">↗</span></button><button>미국은 왜 이 순위야?<span aria-hidden="true">↗</span></button><button>이 추천에서 부족한 근거는?<span aria-hidden="true">↗</span></button></div><div class="chat-composer"><form class="chat-form"><textarea aria-label="질문" placeholder="이 시장에 대해 물어보세요" rows="2" maxlength="${CHAT_LIMITS.questionCharacters}"></textarea><button type="submit" aria-label="질문 보내기" disabled>↑</button></form><span class="chat-input-hint">Enter로 전송 · Shift + Enter로 줄바꿈</span></div></section>`;
  document.body.append(root);
  const q = (s) => root.querySelector(s),
    panel = q('.chat-panel'),
    launch = q('.chat-launch'),
    box = q('.chat-messages'),
    field = q('textarea'),
    prompts = q('.chat-prompts');
  let history = [],
    busy = false,
    signature = '',
    controller;
  const scroll = () => (box.scrollTop = box.scrollHeight);
  const bubble = (text, role) => {
    const el = document.createElement('div');
    el.className = `chat-message chat-${role}`;
    if (role === 'assistant') el.setAttribute('aria-label', '분석 도우미 답변');
    el.textContent = text;
    box.append(el);
    scroll();
    return el;
  };
  const reset = () => {
    const c = getContext(),
      next = JSON.stringify([c.product, c.start, c.end]);
    q('.chat-context').textContent = `${c.label} · ${c.start}–${c.end}`;
    if (next !== signature) {
      signature = next;
      history = [];
      box.replaceChildren();
      const welcome = document.createElement('div');
      welcome.className = 'chat-welcome';
      welcome.innerHTML =
        '<span class="chat-welcome-icon" aria-hidden="true">↗</span><h3>어떤 시장이 궁금하세요?</h3><p>추천 이유부터 국가 간 차이까지,<br>현재 분석을 함께 살펴보세요.</p>';
      box.append(welcome, prompts);
      prompts.hidden = false;
    }
    return c;
  };
  launch.onclick = () => {
    panel.hidden = !panel.hidden;
    launch.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) {
      reset();
      field.focus();
    }
  };
  q('.chat-new').onclick = () => {
    if (busy) return;
    signature = '';
    reset();
    field.value = '';
    q('[type=submit]').disabled = true;
    field.focus();
  };
  q('.chat-close').onclick = () => {
    panel.hidden = true;
    launch.setAttribute('aria-expanded', 'false');
    launch.focus();
  };
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      q('.chat-close').click();
    }
  });
  const finish = (el, result) => {
    el.classList.remove('chat-thinking');
    el.replaceChildren();
    for (const part of result.text.split(/(\*\*[^*]+\*\*)/g)) {
      if (part.startsWith('**') && part.endsWith('**')) {
        const strong = document.createElement('strong');
        strong.textContent = part.slice(2, -2);
        el.append(strong);
      } else el.append(document.createTextNode(part));
    }
    const refs = document.createElement('div');
    refs.className = 'chat-refs';
    for (const c of result.countries || []) {
      const b = document.createElement('button');
      b.textContent = `${c.name} 상세 ↗`;
      b.onclick = () => openCountry(c.country);
      refs.append(b);
    }
    const sourceBox = document.createElement('details'),
      sourceTitle = document.createElement('summary');
    sourceTitle.textContent = '출처 확인';
    sourceBox.append(sourceTitle);
    for (const source of result.sources || []) {
      try {
        const url = new URL(source.url);
        if (url.protocol !== 'https:') continue;
        const a = document.createElement('a');
        a.href = url.href;
        a.textContent = source.title;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        sourceBox.append(a);
      } catch {}
    }
    if (result.sources?.length) refs.append(sourceBox);
    el.append(refs);
    box.scrollTop = el.offsetTop - box.offsetTop;
  };
  async function send(question) {
    if (busy || !question.trim()) return;
    const context = reset();
    busy = true;
    controller = new AbortController();
    field.value = '';
    field.disabled = true;
    q('[type=submit]').disabled = true;
    q('.chat-prompts').hidden = true;
    q('.chat-welcome')?.remove();
    q('.chat-new').disabled = true;
    bubble(question, 'user');
    const output = bubble('데이터를 확인하고 있어요…', 'assistant');
    output.classList.add('chat-thinking');
    const messages = [...history.slice(-6), { role: 'user', content: question }];
    let result;
    try {
      result = await requestChat(context, messages, {
        signal: controller.signal,
        onStatus: (text) => (output.textContent = text),
      });
      finish(output, result);
      history = [
        ...messages,
        { role: 'assistant', content: result.text.slice(0, CHAT_LIMITS.messageCharacters) },
      ];
    } catch (error) {
      output.classList.remove('chat-thinking');
      output.classList.add('chat-error');
      output.textContent = error.message;
      const retry = document.createElement('button');
      retry.textContent = '다시 시도';
      retry.onclick = () => send(question);
      output.append(retry);
    } finally {
      busy = false;
      q('.chat-new').disabled = false;
      if (
        JSON.stringify([getContext().product, getContext().start, getContext().end]) !== signature
      )
        reset();
      field.disabled = false;
      q('[type=submit]').disabled = !field.value.trim();
    }
  }
  document.addEventListener('change', (e) => {
    if (['productSelect', 'startYear', 'endYear'].includes(e.target.id) && !busy) {
      reset();
      q('.chat-prompts').hidden = false;
    }
  });
  field.addEventListener('input', () => {
    q('[type=submit]').disabled = busy || !field.value.trim();
  });
  q('form').onsubmit = (e) => {
    e.preventDefault();
    send(field.value.trim());
  };
  field.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send(field.value.trim());
    }
  };
  prompts.onclick = (e) => {
    const button = e.target.closest('button');
    if (button) send(button.firstChild.textContent.trim());
  };
}
