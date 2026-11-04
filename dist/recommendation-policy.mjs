export const RECOMMENDATION_GROUPS = [
  { label: '구매력', keys: ['economyLevel', 'economyCagr'] },
  { label: '수입시장', keys: ['marketLevel', 'marketCagr'] },
  { label: '한국산 성과', keys: ['koreaRecent', 'koreaPeriod', 'shareRecent', 'sharePeriod'] },
  { label: '문화·소비', keys: ['culture', 'intention', 'demandGrowth'] },
];
export const INPUT_LABELS = {
  economyLevel: '구매력 수준',
  economyCagr: '구매력 성장',
  marketLevel: '수입 규모',
  marketCagr: '수입 성장',
  koreaRecent: '한국산 최근 수입 변화',
  koreaPeriod: '한국산 기간 수입 변화',
  shareRecent: '최근 점유율 변화',
  sharePeriod: '기간 점유율 변화',
  culture: '문화 소비비중',
  intention: '식품 구매의향',
  demandGrowth: '제품 소비 성장',
};
export const INPUT_KEYS = RECOMMENDATION_GROUPS.flatMap((g) => g.keys);
export const WEIGHT_SCENARIOS = [
  [0.25, 0.25, 0.25, 0.25],
  ...RECOMMENDATION_GROUPS.flatMap((_, i) =>
    [0.15, 0.35].map((w) => RECOMMENDATION_GROUPS.map((_, j) => (i === j ? w : (1 - w) / 3))),
  ),
];
