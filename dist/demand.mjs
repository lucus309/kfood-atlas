// Bounds from rounding to the nearest 0.1 hundred-million servings, not a confidence interval.
export function roundedDemandGrowth(first, last, years, step = 0.1) {
  if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0 || last < 0 || years <= 0)
    return null;
  const half = step / 2,
    low = (Math.max(0, last - half) / (first + half)) ** (1 / years) - 1;
  const high = first > half ? ((last + half) / (first - half)) ** (1 / years) - 1 : null;
  return { low, high, largeRelativeError: Math.min(first, last) <= step };
}
export function demandWindow(dataset, product, country, start, end) {
  if (product !== dataset.meta.product) return null;
  const row =
    dataset.rows.find((r) => r.country === country) ||
    dataset.rows.find((r) => r.memberCountries?.includes(country));
  if (!row) return null;
  const observations = dataset.meta.years
    .map((year, i) => ({ year, value: row.values[i] }))
    .filter((r) => r.year >= start && r.year <= end && Number.isFinite(r.value));
  if (!observations.length) return null;
  const first = observations[0],
    last = observations.at(-1);
  const cagr =
    first.year === start && first.value > 0 && last.year > first.year
      ? (last.value / first.value) ** (1 / (last.year - first.year)) - 1
      : null;
  return {
    ...row,
    observations,
    first,
    last,
    cagr,
    combined: Boolean(row.region),
    rounding:
      cagr === null ? null : roundedDemandGrowth(first.value, last.value, last.year - first.year),
  };
}
