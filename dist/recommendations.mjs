import {
  RECOMMENDATION_GROUPS,
  INPUT_LABELS,
  INPUT_KEYS as keys,
  WEIGHT_SCENARIOS as scenarios,
} from './recommendation-policy.mjs';
import {
  recommendationEvidence,
  endpointQuality,
  attachCautions,
} from './recommendation-evidence.mjs';
export { RECOMMENDATION_GROUPS, INPUT_LABELS } from './recommendation-policy.mjs';
export { recommendationEvidence, endpointQuality } from './recommendation-evidence.mjs';
const finite = Number.isFinite;
import { YEARS, csvCell } from './engine.mjs';
import { makeOpportunityCSV } from './opportunities.mjs';

const symmetricChange = (a, b) =>
  finite(a) && finite(b) && a + b > 0 ? (2 * (b - a)) / (a + b) : null;
const shareChangePoints = (a, b) => (finite(a) && finite(b) ? (b - a) * 100 : null);
const average = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

const rank = (v, values) => 1 + values.filter((x) => x > v + 1e-9).length;

function createRecommendationRow(row, demand, state) {
  const startIndex = YEARS.indexOf(state.start),
    endIndex = YEARS.indexOf(state.end);
  const recommendation = recommendationEvidence(row, demand, state),
    metrics = row.metrics,
    quality = endpointQuality(row, state),
    culture = row.culture;
  const raw = {
    economyLevel: metrics.economyLevel,
    economyCagr: metrics.economyCagr,
    marketLevel: metrics.last,
    marketCagr: metrics.cagr,
    koreaRecent: !quality.recentBlocked
      ? symmetricChange(row.korea[endIndex - 1], row.korea[endIndex])
      : null,
    koreaPeriod: !quality.periodBlocked
      ? symmetricChange(row.korea[startIndex], row.korea[endIndex])
      : null,
    shareRecent: !quality.recentBlocked
      ? shareChangePoints(metrics.shares[endIndex - 1], metrics.shares[endIndex])
      : null,
    sharePeriod: !quality.periodBlocked
      ? shareChangePoints(metrics.shares[startIndex], metrics.shares[endIndex])
      : null,
    culture: culture
      ? average([culture.dramaConsumptionSharePct, culture.musicConsumptionSharePct])
      : null,
    intention: recommendation.intention,
    demandGrowth: recommendation.demandCagr,
  };
  return {
    ...row,
    recommendation: { ...recommendation, eligible: false, potential: false },
    priority: {
      version: 'observed-review-v2',
      quality,
      raw,
      points: {},
      index: null,
      rank: null,
      observed: keys.filter((k) => finite(raw[k])).length,
      missing: keys.filter((k) => !finite(raw[k])),
      strong: [],
      negative: [],
      domainPoints: [],
      effectiveWeights: {},
      sensitivity: null,
    },
  };
}

function assignPriorityScores(row, populations) {
  const priority = row.priority,
    raw = priority.raw;
  priority.points = Object.fromEntries(
    keys.map((key) => {
      const population = populations[key],
        value = raw[key];
      return [
        key,
        finite(value) && population.length
          ? (100 *
              (population.filter((t) => t < value).length +
                0.5 * population.filter((t) => t === value).length)) /
            population.length
          : null,
      ];
    }),
  );
  priority.missing = keys.filter((key) => !finite(raw[key]));
  priority.observed = keys.length - priority.missing.length;
  priority.domainPoints = RECOMMENDATION_GROUPS.map((g) =>
    average(g.keys.map((key) => priority.points[key]).filter(finite)),
  );
  const percentiles = priority.points;
  if (raw.economyCagr > 0 && (percentiles.economyLevel >= 75 || percentiles.economyCagr >= 75))
    priority.strong.push('구매력');
  if (raw.marketCagr > 0 && (percentiles.marketLevel >= 75 || percentiles.marketCagr >= 75))
    priority.strong.push('수입시장');
  if (raw.koreaRecent > 0 && raw.shareRecent > 0) priority.strong.push('한국산 성과');
  if (percentiles.intention >= 75 && raw.demandGrowth > 0) priority.strong.push('소비 수요');
  priority.cultureDemand = percentiles.culture >= 75 && raw.demandGrowth > 0;
  priority.negative = [
    'economyCagr',
    'marketCagr',
    'koreaRecent',
    'koreaPeriod',
    'shareRecent',
    'sharePeriod',
    'demandGrowth',
  ]
    .filter((key) => finite(raw[key]) && raw[key] < 0)
    .map((key) => INPUT_LABELS[key] + ' 감소');
  if (row.review.market.yoy < 0) priority.negative.push('전체 수입시장 최근 감소');
  if (finite(percentiles.intention) && percentiles.intention <= 25)
    priority.negative.push('식품 구매의향 비교국 하위 25%');
  priority.scenarioIndices = scenarios.map((weights, si) => {
    const denom = weights.reduce((s, w, i) => s + (finite(priority.domainPoints[i]) ? w : 0), 0);
    if (si === 0)
      priority.effectiveWeights = Object.fromEntries(
        RECOMMENDATION_GROUPS.flatMap((g, i) => {
          const observed = g.keys.filter((key) => finite(priority.points[key]));
          return observed.map((key) => [key, weights[i] / denom / observed.length]);
        }),
      );
    return (
      priority.domainPoints.reduce(
        (s, value, i) => s + (finite(value) ? value * weights[i] : 0),
        0,
      ) / denom
    );
  });
  priority.index = priority.scenarioIndices[0];
  row.recommendation.eligible =
    priority.strong.length >= 2 || (priority.strong.length >= 1 && priority.cultureDemand);
  row.recommendation.label = row.recommendation.eligible ? '우선 검토 후보' : '추가 근거 확인';
}

function rankCandidates(candidates) {
  const candidateIndices = scenarios.map((_, i) =>
    candidates.map((r) => r.priority.scenarioIndices[i]),
  );
  for (const r of candidates) {
    const p = r.priority,
      ranks = scenarios.map((_, i) => rank(p.scenarioIndices[i], candidateIndices[i]));
    p.rank = ranks[0];
    p.sensitivity = {
      min: Math.min(...ranks),
      max: Math.max(...ranks),
      top3Count: ranks.filter((v) => v <= 3).length,
      ranks,
    };
  }
}

export function applyRecommendationModel(rows, demand, state) {
  const result = rows.map((row) => createRecommendationRow(row, demand, state));
  // Optional surveys do not change the common economic/trade cohort.
  const cohort = result.filter((row) => row.score !== null);
  const populations = Object.fromEntries(
    keys.map((key) => [key, cohort.map((row) => row.priority.raw[key]).filter(finite)]),
  );
  for (const row of cohort) assignPriorityScores(row, populations);
  for (const row of result) attachCautions(row, state);
  rankCandidates(cohort.filter((row) => row.recommendation.eligible));
  return result;
}

export function recommendationRows(rows) {
  return rows
    .filter((r) => r.recommendation.eligible && finite(r.priority?.index))
    .sort((a, b) => b.priority.index - a.priority.index || a.name.localeCompare(b.name, 'ko'));
}
export function recommendationSelection(rows) {
  const candidates = recommendationRows(rows),
    indices = candidates.map((r) => r.priority.index);
  const ranked = candidates.map((r) => ({
    ...r,
    recommendationRank: rank(r.priority.index, indices),
  }));
  const top = ranked.slice(0, 3),
    cutoff = top.at(-1)?.priority.index;
  return {
    candidates: ranked,
    top,
    ties: ranked.slice(3).filter((r) => Math.abs(r.priority.index - cutoff) < 1e-9),
  };
}
export function makeRecommendationCSV(rows, product, start, end) {
  const base = makeOpportunityCSV(rows, product, start, end).split('\r\n');
  const headers = [
    '추천모델',
    '후보조건',
    '관측근거지수',
    '후보순위',
    '관측항목수',
    '미확인항목',
    '실효가중치',
    '강점',
    '반대근거',
    '소비근거',
    '추천다음행동',
    '시점별신고점검',
    ...keys.flatMap((k) => [INPUT_LABELS[k] + '_원값', INPUT_LABELS[k] + '_백분위']),
  ];
  return base
    .map(
      (line, i) =>
        line +
        ',' +
        (i === 0
          ? headers
          : (() => {
              const r = rows[i - 1],
                p = r.priority,
                n = r.recommendation;
              return [
                p.version,
                n.eligible,
                p.index,
                p.rank,
                p.observed + '/11',
                p.missing.map((k) => INPUT_LABELS[k]).join(' / '),
                JSON.stringify(p.effectiveWeights),
                p.strong.join(' / '),
                n.caution,
                n.demandText,
                n.action,
                JSON.stringify(p.quality),
                ...keys.flatMap((k) => [p.raw[k], p.points[k]]),
              ];
            })()
        )
          .map(csvCell)
          .join(','),
    )
    .join('\r\n');
}
