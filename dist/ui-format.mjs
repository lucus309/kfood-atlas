const preciseMillions = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});
const percentage = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});
const share = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const preciseShare = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 6,
});
export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const colors = ['#b37b50', '#557b73', '#999052', '#858b91'];
export const number = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const integer = new Intl.NumberFormat('ko-KR');
export const millions = (n) =>
  n === null || n === undefined
    ? '—'
    : Math.abs(n) > 0 && Math.abs(n) < 10000
      ? preciseMillions.format(n / 1e6)
      : number.format(n / 1e6);
export const pct = (n) =>
  n === null || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : ''}${percentage.format(n * 100)}%`;
export const tone = (n) => (n === null ? 'neutral' : n >= 0 ? 'positive' : 'negative');
export function sharePct(n) {
  return n === null || !Number.isFinite(n)
    ? '—'
    : n > 0 && n < 0.0001
      ? '&lt;0.01%'
      : `${number.format(n * 100)}%`;
}
export function pp(n) {
  return n === null || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : ''}${number.format(n)}pp`;
}
export function shareText(n) {
  return Number.isFinite(n)
    ? (n > 0 && n < 0.001 ? preciseShare : share).format(n * 100) + '%'
    : '—';
}
export function pointsText(n) {
  return Number.isFinite(n) ? n.toFixed(1) : '—';
}
export function days(n) {
  return Number.isFinite(n) ? n.toFixed(1) + '일' : '—';
}
export const volumeColor = (key) =>
  key === 'both_up' ? '#62566f' : key === 'value_only' ? '#d6cedd' : '#a4a6a8';
