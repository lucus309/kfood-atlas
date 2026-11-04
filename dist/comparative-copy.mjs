const percent = (n) => `${n > 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
const money = (n) =>
  n >= 1e8 ? `${(n / 1e8).toFixed(2)}억 달러` : `${(n / 1e4).toFixed(0)}만 달러`;
export function comparativeCard(row, peers, state, original) {
  if (peers.length < 2 || !peers.some((r) => r.country === row.country)) return original;
  const metrics = [
    [
      'economyCagr',
      '구매력 성장',
      '구매력이 더 빠르게 커지는 시장',
      percent,
      `${row.economyStart}–${row.economyEnd}`,
    ],
    [
      'marketCagr',
      '수입시장 성장',
      '수입 증가 속도가 앞서는 시장',
      percent,
      `${state.start}–${state.end}`,
    ],
    ['marketLevel', '수입시장 규모', '더 큰 수입 수요를 가진 시장', money, `${state.end}`],
    [
      'economyLevel',
      '1인당 실질 소비',
      '소비 여력이 높은 시장',
      (n) => `${Math.round(n).toLocaleString('ko-KR')} 국제달러`,
      `${row.economyEnd}`,
    ],
    [
      'shareRecent',
      '한국산 점유율 변화',
      '한국산 점유율 확대가 앞서는 시장',
      (n) => `${n > 0 ? '+' : ''}${n.toFixed(2)}%p`,
      `${state.end - 1}–${state.end}`,
    ],
  ];
  const comparisons = metrics.flatMap(([key, label, title, format, period]) => {
    if (!peers.every((r) => Number.isFinite(r.priority.raw[key]))) return [];
    const sorted = [...peers].sort((a, b) => b.priority.raw[key] - a.priority.raw[key]),
      value = row.priority.raw[key];
    const rank = 1 + sorted.filter((r) => r.priority.raw[key] > value + 1e-9).length;
    const spread =
      (value - sorted.at(-1).priority.raw[key]) /
      (Math.abs(sorted[0].priority.raw[key]) + Math.abs(sorted.at(-1).priority.raw[key]) || 1);
    return [{ key, label, title, format, period, rank, value, spread, sorted }];
  });
  const wins = comparisons
    .filter(
      (x) =>
        x.rank === 1 &&
        x.sorted.filter((r) => Math.abs(r.priority.raw[x.key] - x.value) < 1e-9).length === 1,
    )
    .sort((a, b) => b.spread - a.spread);
  if (!wins.length && original) return original;
  const lead = wins[0] || comparisons.sort((a, b) => a.rank - b.rank || b.spread - a.spread)[0];
  if (!lead) return original;
  const lower = comparisons.filter((x) => x.rank > 1).sort((a, b) => b.rank - a.rank)[0];
  const position = lead.rank === 1 && wins.length ? '가장 높음' : `${lead.rank}위`;
  const strengths = [
    `${peers.length}개 후보 중 ${lead.label} ${position} · ${lead.format(lead.value)} (${lead.period})`,
  ];
  if (lower) {
    const best = lower.sorted[0];
    strengths.push(
      `${lower.label} · ${best.name}보다 낮음 · ${lower.format(lower.value)} vs ${lower.format(best.priority.raw[lower.key])} (${lower.period})`,
    );
  } else {
    const other = comparisons.find((x) => x.key !== lead.key);
    if (other)
      strengths.push(
        `${other.label} ${other.format(other.value)} · 후보 중 ${other.rank}위 (${other.period})`,
      );
  }
  return {
    title: wins.length ? lead.title : '여러 지표를 함께 검토할 시장',
    strengths,
    caution: original?.caution || row.recommendation.cautions[0] || '',
  };
}
