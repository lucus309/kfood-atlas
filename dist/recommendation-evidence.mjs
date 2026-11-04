import { demandWindow } from './demand.mjs';
import { YEARS } from './engine.mjs';
import { MIRROR_REVIEW_RATIO } from './candidate-review.mjs';
import { RECOMMENDATION_GROUPS, INPUT_LABELS } from './recommendation-policy.mjs';
const finite = Number.isFinite;
const pct = (n) => `${n > 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
export function recommendationEvidence(row, demand, state) {
  const v = row.review,
    end = Math.min(state.end, 2024);
  const d = demandWindow(demand, state.product, row.country, state.start, end);
  const complete =
    d &&
    !d.combined &&
    d.first.year === state.start &&
    d.last.year === end &&
    end > state.start &&
    d.observations.length === end - state.start + 1 &&
    Number.isFinite(d.cagr);
  const demandStatus = d?.combined
    ? 'combined'
    : complete
      ? d.cagr > 0
        ? 'up'
        : d.cagr < 0
          ? 'down'
          : 'flat'
      : 'missing';
  const demandText =
    demandStatus === 'combined'
      ? '즉석면 소비는 중국·홍콩 합산 자료로만 확인'
      : complete
        ? `즉석면 소비 ${state.start}–${end} 연평균 ${pct(d.cagr)}`
        : state.product === demand.meta.product
          ? '이 국가·기간의 즉석면 소비 추이 미확인'
          : '선택 제품군의 국가별 소비 추이 미확인';
  const intention = Number.isFinite(row.culture?.foodPurchaseIntentionPct)
    ? row.culture.foodPurchaseIntentionPct
    : null;
  const intentionText =
    intention === null
      ? '한국 식품 구매의향 미확인'
      : `한국 식품 구매의향 ${intention.toFixed(1)}% · ${row.culture.observationYear}년 한국 콘텐츠 경험자`;
  const a = YEARS.indexOf(state.start),
    b = YEARS.indexOf(state.end),
    ks = row.korea.slice(a, b + 1);
  const growthPeriods = ks
    .slice(1)
    .filter((n, i) => Number.isFinite(n) && Number.isFinite(ks[i]) && n > ks[i]).length;
  const eligible = row.score !== null && v.key === 'expansion';
  let caution = v.counters[0] || '선택 제품의 실제 구매·반복구매는 별도 확인';
  if (demandStatus === 'down') caution = '한국산 수입과 별개로 즉석면 전체 소비는 감소';
  if (demandStatus === 'flat') caution = '즉석면 소비 반올림 값은 동일, 실제 정체로 확정하지 않음';
  if (demandStatus === 'combined') caution = '중국 단독 소비 증가 여부는 확인할 수 없음';
  if (demandStatus === 'missing' && !v.counters.length)
    caution = '제품별 현지 판매·반복구매 자료부터 확인 필요';
  if (v.market.yoy < 0)
    caution = `전체 수입시장은 최근 ${pct(v.market.yoy)} 감소, 한국산 확대와 구분 필요`;
  if (!eligible) caution = v.summary;
  if (v.key === 'mirror_review') caution = v.summary;
  let action = v.action;
  if (eligible) {
    action =
      demandStatus === 'up'
        ? '한국산 확대와 즉석면 소비 증가를 바탕으로 세부 제품의 맛·가격·반복구매를 테스트하세요.'
        : demandStatus === 'down'
          ? '한국산 확대와 전체 소비 감소가 갈리는 이유를 세부 품목·점유율 이동에서 확인하세요.'
          : '한국산 확대가 실제 판매로 이어지는지 선택 제품의 현지 판매·반복구매 자료를 확인하세요.';
  } else if (
    row.stage === 'potential' &&
    ['insufficient', 'early', 'rebound', 'mixed', 'lagging'].includes(v.key)
  ) {
    action =
      intention !== null || demandStatus === 'up'
        ? '관측된 식품 관심·소비 신호가 선택 제품 구매로 이어지는지 확인하고 한국산 입지의 미확인·상충 근거를 대조하세요.'
        : '시장 조건은 확인됐습니다. 해당 국가·제품군의 소비 추이와 한국산 입지 자료부터 확인하세요.';
  }
  return {
    eligible,
    potential: row.score !== null && row.stage === 'potential',
    label: eligible ? '확대 검토' : v.label,
    demandStatus,
    demandText,
    demandCagr: complete ? d.cagr : null,
    demandStart: state.start,
    demandEnd: end,
    demandSource: d ? demand.meta.sourceUrl : null,
    intention,
    intentionText,
    caution,
    action,
    growthPeriods,
    intervals: state.end - state.start,
  };
}
export function endpointQuality(row, state) {
  const years = [...new Set([state.start, state.end - 1, state.end])];
  const checks = years.map((year) => {
    const a = row.review.annual.find((a) => a.year === year),
      k = a?.korea,
      x = a?.export;
    const known = finite(k) && finite(x),
      zeroMismatch = known && ((k === 0 && x > 0) || (x === 0 && k > 0));
    const ratio = known && Math.min(k, x) > 0 ? Math.max(k, x) / Math.min(k, x) : null;
    return {
      year,
      importValue: k ?? null,
      exportValue: x ?? null,
      ratio,
      status:
        zeroMismatch || (ratio !== null && ratio >= MIRROR_REVIEW_RATIO)
          ? 'review'
          : known
            ? 'within_trigger'
            : 'missing',
    };
  });
  const blocked = (a, b) => checks.some((c) => [a, b].includes(c.year) && c.status === 'review');
  return {
    checks,
    recentBlocked: blocked(state.end - 1, state.end),
    periodBlocked: blocked(state.start, state.end),
  };
}
export function attachCautions(row, state) {
  const n = row.recommendation,
    p = row.priority,
    q = p.quality;
  const flagged = q.checks.filter((c) => c.status === 'review');
  const qualityText = flagged
    .map(
      (c) =>
        `${c.year}년 양국 신고액 ${c.ratio === null ? '한쪽만 0' : c.ratio.toFixed(1) + '배 차이'}`,
    )
    .join(' · ');
  const coverage = [];
  if (q.checks.some((c) => c.status === 'missing'))
    coverage.push(
      `${q.checks
        .filter((c) => c.status === 'missing')
        .map((c) => c.year)
        .join('·')}년 양국 신고액 교차 확인 미완료`,
    );
  if (n.demandStatus === 'combined') coverage.push(n.demandText);
  if (n.demandStatus === 'flat') coverage.push('소비 반올림 값이 같아 실제 정체로 확정할 수 없음');
  if (n.demandStatus === 'down') coverage.push('한국산 성과와 별개로 제품 전체 소비는 감소');
  const context = [];
  if (finite(p.index)) {
    for (const g of RECOMMENDATION_GROUPS) {
      const observed = g.keys.filter((k) => finite(p.raw[k]));
      if (observed.length === 1 && g.keys.length > 1)
        context.push(
          `${g.label} 영역은 ${INPUT_LABELS[observed[0]]} 한 항목으로 평가 · 전체 지수의 ${(p.effectiveWeights[observed[0]] * 100).toFixed(1)}% 반영`,
        );
    }
    const absent = RECOMMENDATION_GROUPS.filter((g) => g.keys.every((k) => !finite(p.raw[k])));
    if (absent.length) {
      const present = RECOMMENDATION_GROUPS.filter((g) => g.keys.some((k) => finite(p.raw[k])));
      context.push(
        `${absent.map((g) => g.label).join('·')} 자료 없이 ${present.length}개 영역으로 평가 · ${present.map((g) => `${g.label} ${(g.keys.reduce((s, k) => s + (p.effectiveWeights[k] || 0), 0) * 100).toFixed(1)}%`).join(' · ')}`,
      );
    }
  }
  const annual = row.review.annual,
    latest = annual.find((a) => a.year === state.end),
    previous = annual.find((a) => a.year === state.end - 1);
  const earlier = annual.filter(
    (a) => a.year >= state.start && a.year < state.end - 1 && finite(a.world),
  );
  const priorPeak = earlier.reduce((best, a) => (!best || a.world > best.world ? a : best), null);
  const rebound =
    latest &&
    previous &&
    finite(latest.world) &&
    finite(previous.world) &&
    latest.world > previous.world &&
    priorPeak &&
    priorPeak.world >= latest.world;
  if (rebound)
    context.push(
      `전체 수입은 최근 반등했지만 ${state.end}년 규모는 ${priorPeak.year}년 ${latest.world === priorPeak.world ? '수준' : '규모보다 작음'}`,
    );
  if (n.demandStatus === 'up' && finite(p.effectiveWeights.demandGrowth))
    context.push('소비 성장은 한국산 판매가 아닌 즉석면 전체 소비 기준');
  n.reportingComparison =
    latest &&
    previous &&
    finite(latest.export) &&
    finite(previous.export) &&
    previous.export > 0 &&
    finite(latest.korea) &&
    finite(previous.korea) &&
    previous.korea > 0
      ? `${state.end}년 한국산 수입 ${pct(latest.korea / previous.korea - 1)} · 한국 신고 수출 ${pct(latest.export / previous.export - 1)}. 신고 기준이 달라 증가 폭은 따로 확인합니다.`
      : null;
  n.cautions = [
    ...new Set([
      ...context,
      ...(flagged.length
        ? [
            `${qualityText}. ${[q.recentBlocked ? '최근 변화' : '', q.periodBlocked ? '기간 변화' : ''].filter(Boolean).join('·')} 점수 보류`,
          ]
        : []),
      ...p.negative.filter((t) => t !== '전체 수입시장 최근 감소'),
      ...row.review.counters,
      ...coverage,
    ]),
  ];
  n.caution = n.cautions.join(' / ') || '관측한 지표에서 감소 신호 없음';
  const actions = [];
  if (rebound)
    actions.push(
      '최근 반등이 반복 거래로 이어지는지 연도별 수입과 한국 신고 수출을 함께 확인하세요.',
    );
  if (flagged.length)
    actions.push(
      `${flagged.map((c) => c.year).join('·')}년 같은 HS·양국 신고 기준을 대조한 뒤 보류된 변화를 다시 평가하세요.`,
    );
  if (row.review.market.yoy < 0)
    actions.push('최근 전체 시장 감소 속 한국산 점유율 확대가 반복 거래인지 확인하세요.');
  if (n.demandStatus === 'down')
    actions.push('전체 소비 감소와 한국산 성과의 차이를 세부 품목에서 확인하세요.');
  if (!actions.length) actions.push(n.action);
  n.action = actions.join(' ');
  if (q.recentBlocked || q.periodBlocked) {
    n.positionLabel = '신고 차이 · 일부 성과 판단 보류';
    n.positionSummary = `${[q.recentBlocked ? '최근' : '', q.periodBlocked ? '기간 전체' : ''].filter(Boolean).join('·')} 한국산 변화는 원수치로 확인하되 신고 차이 점검 전 강점으로 확정하지 않습니다.`;
  } else {
    n.positionLabel = row.review.label;
    n.positionSummary = row.review.summary;
  }
}
