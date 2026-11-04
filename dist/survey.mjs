// Keep city samples separate, including two cities within the same country.
export function surveyCities(data, country, endYear) {
  if (!data || endYear < data.meta.year) return [];
  return data.rows.filter((row) => row.country === country);
}
export function monthlyUse(row) {
  return Math.round((row.weekly + row.monthly) * 10) / 10;
}
