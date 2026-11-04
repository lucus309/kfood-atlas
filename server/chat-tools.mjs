import { CHAT_LIMITS } from '../dist/chat-config.mjs';
export const CHAT_TOOLS = [
  {
    type: 'function',
    name: 'lookup_country',
    description: '현재 제품·기간의 국가명/영문명/코드로 원수치와 추천 근거 조회',
    strict: true,
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'compare_countries',
    description: '최대5개 국가의 지표 비교',
    strict: true,
    parameters: {
      type: 'object',
      properties: { countries: { type: 'array', items: { type: 'integer' } } },
      required: ['countries'],
      additionalProperties: false,
    },
  },
];

export function executeToolCall(call, context, onEvent) {
  let rows = [];
  const args = JSON.parse(call.arguments);
  if (
    call.name === 'lookup_country' &&
    typeof args.query === 'string' &&
    args.query.trim() &&
    args.query.length <= CHAT_LIMITS.lookupCharacters
  ) {
    onEvent({ type: 'status', text: `${args.query} 데이터 확인 중` });
    rows = context.lookup(args.query);
  } else if (
    call.name === 'compare_countries' &&
    Array.isArray(args.countries) &&
    args.countries.length <= CHAT_LIMITS.comparisonCountries &&
    args.countries.every(Number.isInteger)
  ) {
    onEvent({ type: 'status', text: '후보국 지표 비교 중' });
    rows = context.compare(args.countries);
  }

  return rows;
}
