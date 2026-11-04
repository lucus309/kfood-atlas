import { INPUT_LABELS } from './recommendations.mjs';
export const explanationKey = (row, state) =>
  `${state.product}:${state.start}:${state.end}:${row.country}`;
export function explanationSignature(row) {
  return JSON.stringify({
    model: row.priority.version,
    raw: row.priority.raw,
    points: row.priority.points,
    strong: row.priority.strong,
    negative: row.priority.negative,
    quality: row.priority.quality,
    cautions: row.recommendation.cautions,
    economy: [row.economyStart, row.economyEnd],
  });
}
export function explanationPacket(row, state) {
  const p = row.priority,
    n = row.recommendation;
  const facts = Object.entries(p.raw)
    .filter(([, value]) => value !== null)
    .map(([id, value]) => ({
      id,
      label: INPUT_LABELS[id],
      value,
      percentile: p.points[id] ?? null,
    }));
  facts.push(
    { id: 'missing', value: p.missing.map((k) => INPUT_LABELS[k]) },
    { id: 'quality', value: p.quality },
    { id: 'cautions', value: n.cautions },
    { id: 'demand_notes', value: [n.demandText, n.intentionText] },
    { id: 'position', value: n.positionSummary },
  );
  return {
    country: row.country,
    name: row.name,
    period: [state.start, state.end],
    economyPeriod: [row.economyStart, row.economyEnd],
    strong: p.strong,
    negative: p.negative,
    facts,
  };
}
export function validateExplanation(item, packet) {
  const allowed = new Set(packet.facts.map((f) => f.id));
  if (
    item.country !== packet.country ||
    typeof item.summary !== 'string' ||
    typeof item.detail !== 'string'
  )
    throw new Error('Wrong country or invalid text');
  if (
    item.summary.length < 15 ||
    item.summary.length > 140 ||
    item.detail.length < 30 ||
    item.detail.length > 350
  )
    throw new Error('Invalid length');
  if (/[0-9]|https?:|보장|성공 확률|무조건/.test(item.summary + item.detail))
    throw new Error('Unsupported number or claim');
  if (
    !Array.isArray(item.evidence_ids) ||
    item.evidence_ids.length < 2 ||
    item.evidence_ids.some((id) => !allowed.has(id))
  )
    throw new Error('Invalid evidence references');
  for (const id of item.evidence_ids) {
    const fact = packet.facts.find((f) => f.id === id);
    if (fact.value === null) throw new Error('Missing data used as evidence');
  }
  return item;
}
export function savedExplanation(cache, row, state) {
  const item = cache?.entries?.[explanationKey(row, state)];
  return item?.signature === explanationSignature(row) ? item : null;
}
