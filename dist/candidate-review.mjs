import { YEARS, metrics } from './engine.mjs';

// A review trigger, not a statistical error bound or an extra scoring weight.
export const MIRROR_REVIEW_RATIO = 5;
const finite = Number.isFinite;
const rate = (n) => (finite(n) ? `${n > 0 ? '+' : ''}${(n * 100).toFixed(2)}%` : '미확인');
const dollars = (n) =>
  finite(n)
    ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n) + ' USD'
    : '미확인';
const points = (n) => (finite(n) ? `${n > 0 ? '+' : ''}${n.toFixed(2)}pp` : '미확인');
const value = (a, i) => (finite(a?.[i]) ? a[i] : null);

export function reviewCandidate(row, exportRow, start, end) {
  const a = YEARS.indexOf(start),
    b = YEARS.indexOf(end);
  const korea = metrics(row.korea, start, end),
    market = metrics(row.world, start, end);
  const exports = metrics(exportRow?.values || YEARS.map(() => null), start, end);
  const currentShare = value(row.metrics.shares, b),
    previousShare = value(row.metrics.shares, b - 1);
  const shareYoy =
    finite(currentShare) && finite(previousShare) ? (currentShare - previousShare) * 100 : null;
  const shareChange = row.metrics.shareChange;
  const importValue = korea.last,
    exportValue = exports.last;
  const comparable = finite(importValue) && finite(exportValue);
  const zeroMismatch =
    comparable &&
    ((importValue === 0 && exportValue > 0) || (exportValue === 0 && importValue > 0));
  const ratio =
    comparable && Math.min(importValue, exportValue) > 0
      ? Math.max(importValue, exportValue) / Math.min(importValue, exportValue)
      : null;
  const mirrorFlag = zeroMismatch || (finite(ratio) && ratio >= MIRROR_REVIEW_RATIO);
  const mirror = {
    status: mirrorFlag ? 'review' : comparable ? 'within_trigger' : 'missing',
    ratio,
    zeroMismatch,
    importValue,
    exportValue,
    year: end,
    threshold: MIRROR_REVIEW_RATIO,
    importBasis: row.basis || null,
    exportBasis: 'FOB',
    importSource: row.sources[b] || null,
    exportSource: exportRow?.sources?.[b] || null,
  };
  const complete = korea.observed === korea.expected && market.observed === market.expected;
  const recent = `${end}년 전년비: 전체 수입 ${rate(market.yoy)} · 한국산 수입 ${rate(korea.yoy)} · 한국산 점유율 ${points(shareYoy)}.`;
  const period = `${start}–${end}년 양끝 비교: 전체 수입 ${rate(market.growth)} · 한국산 수입 ${rate(korea.growth)} · 한국산 점유율 ${points(shareChange)}.`;
  const counters = [];
  if (!complete)
    counters.push(
      `한국산 수입 ${korea.observed}/${korea.expected}년, 전체 수입 ${market.observed}/${market.expected}년 관측. 중간 기록이 없어 지속성을 판단할 수 없습니다.`,
    );
  if (finite(korea.first) && korea.first > 0 && korea.first < 1_000_000)
    counters.push(
      `시작 한국산 수입 ${dollars(korea.first)}. 작은 시작 금액이 성장률을 크게 보이게 할 수 있습니다.`,
    );
  if (finite(market.yoy) && market.yoy < 0)
    counters.push(`${end}년 전체 수입이 ${rate(market.yoy)} 감소했습니다.`);
  if (finite(market.growth) && market.growth < 0)
    counters.push(`${start}년보다 전체 수입 규모가 작습니다.`);
  if (finite(korea.growth) && korea.growth < 0)
    counters.push(`${start}년보다 한국산 수입 규모가 작습니다.`);
  if (finite(shareChange) && shareChange < 0)
    counters.push(`${start}년보다 한국산 점유율이 낮습니다.`);
  if (finite(exports.yoy) && finite(korea.yoy) && exports.yoy * korea.yoy < 0)
    counters.push(
      `한국발 수출 전년비 ${rate(exports.yoy)}와 상대국 한국산 수입 전년비 ${rate(korea.yoy)}의 방향이 다릅니다.`,
    );

  let key = 'mixed',
    tone = 'caution',
    label = '입지 혼조 · 추가 검토';
  let summary =
    '최근 변화와 기간 전체 변화가 한 방향으로 모이지 않아 적극적인 추천 근거로 삼기 어렵습니다.';
  let action = '최근 1년과 기간 전체의 방향이 다른 이유를 세부 품목·후속 기간에서 확인하세요.';
  if (mirrorFlag) {
    key = 'mirror_review';
    tone = 'hold';
    label = '신고 차이 · 입지 판단 보류';
    summary = `${end}년 한국발 수출 ${dollars(exportValue)} (${mirror.exportBasis})와 상대국 한국산 수입 ${dollars(importValue)} (${mirror.importBasis || '기준 미확인'})${zeroMismatch ? ' 중 한쪽만 0입니다.' : `이 ${ratio.toFixed(1)}배 차이 납니다.`} 낮은 신고 점유율을 미개척 수요로 해석하지 않습니다.`;
    action =
      '같은 HS·연도 원자료를 재조회하고, 월별·세부 품목·상대국 귀속 기준을 대조하세요. 차이의 원인이 확인되기 전 한국산 입지 판단을 보류합니다.';
    counters.unshift(
      '신고 차이는 점검 대상이며 통계 오류나 제3국 경유의 증거로 확정하지 않습니다.',
    );
  } else if (!complete || !finite(shareYoy) || !finite(shareChange)) {
    key = 'insufficient';
    tone = 'hold';
    label = '입지 자료 보완';
    summary =
      '한국산의 최근·기간 전체 추이를 같은 조건으로 확인할 자료가 부족합니다. 낮거나 비어 있는 수치를 성장 여지로 바꾸지 않습니다.';
    action = '한국산 수입과 전체 수입의 누락 연도·금액 기준을 확인한 뒤 입지를 다시 판단하세요.';
  } else if (korea.first === 0 || value(row.korea, b - 1) === 0) {
    key = 'early';
    label = '초기 진출 · 잠재력 가설';
    summary =
      '한국산 수입의 기준액이 0이어서 성장률로 진출 성공을 판단할 수 없습니다. 실제 금액과 후속 거래를 확인할 단계입니다.';
    action = '첫 거래 이후 수입이 반복되는지 확인하고, 낮은 점유율만으로 추천하지 마세요.';
  } else if (korea.yoy < 0) {
    key = 'decline';
    label = shareYoy < 0 ? '한국산 부진 · 원인 확인' : '한국산 감소 · 점유율 혼조';
    summary =
      market.yoy > 0
        ? '전체 수입시장은 커졌지만 한국산 수입은 줄었습니다. 시장 성장만으로 한국산의 매력을 설명할 수 없습니다.'
        : '최근 한국산 수입이 감소했습니다. 점유율 변화와 구분해 감소 원인을 먼저 확인해야 합니다.';
    action = '한국산 감소가 특정 거래·제품에 집중됐는지, 후속 기간에도 이어지는지 확인하세요.';
  } else if (korea.yoy > 0 && shareYoy > 0) {
    if (korea.growth > 0 && shareChange > 0) {
      key = 'expansion';
      tone = market.yoy < 0 || market.growth < 0 ? 'caution' : 'positive';
      label = '한국산 확대 · 검토 근거';
      summary =
        '한국산 수입과 점유율이 최근 1년과 기간 전체에서 모두 늘었습니다. 한국산 확대를 뒷받침하는 근거입니다.';
      action =
        '한국산 확대가 어떤 세부 제품에서 발생했는지 확인하고, 현지 판매·반복구매 근거로 교차 검증하세요.';
    } else {
      key = 'rebound';
      label = '최근 회복 · 추세 확인';
      summary =
        '최근 한국산 수입과 점유율은 늘었지만 기간 전체에서도 함께 개선됐다고 볼 수는 없습니다.';
    }
  } else if (korea.yoy > 0 && shareYoy <= 0) {
    key = 'lagging';
    label = '한국산 증가 · 점유율 정체/하락';
    summary =
      '한국산 수입은 늘었지만 전체 수입시장보다 점유율이 개선되지는 않았습니다. 수입 증가와 경쟁 입지를 구분해야 합니다.';
    action = '시장보다 한국산 증가가 더딘 이유와 경쟁 공급국의 증가 품목을 비교하세요.';
  }
  if (mirror.status === 'missing')
    counters.push(
      '같은 연도의 한국발 수출과 상대국 한국산 수입을 모두 확보하지 못해 신고액 교차 확인은 미완료입니다.',
    );
  return {
    key,
    tone,
    label,
    summary,
    recent,
    period,
    counters,
    action,
    korea,
    market,
    exports,
    shareYoy,
    shareChange,
    mirror,
    complete,
    start,
    end,
    annual: YEARS.slice(a, b + 1).map((year, i) => ({
      year,
      world: value(row.world, a + i),
      korea: value(row.korea, a + i),
      share: value(row.metrics.shares, a + i),
      export: value(exportRow?.values, a + i),
    })),
  };
}
