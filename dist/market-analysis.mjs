import { getOpportunityScores } from './opportunities.mjs';
import { applyRecommendationModel, recommendationSelection } from './recommendations.mjs';

export function analyzeMarket({ data, imports, evidence, demand }, state) {
  const scores = getOpportunityScores(data, imports, evidence, state);
  const rows = applyRecommendationModel(scores, demand, state);
  return { rows, selection: recommendationSelection(rows) };
}

// Data is a fixed snapshot. Search and selection do not change the scoring cohort.
export function createMarketAnalyzer(datasets) {
  let lastKey;
  let lastResult;
  return (state) => {
    const key = `${state.product}:${state.start}:${state.end}`;
    if (key !== lastKey) {
      lastResult = analyzeMarket(datasets, state);
      lastKey = key;
    }
    return lastResult;
  };
}
