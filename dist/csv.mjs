export function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return `"${s.replaceAll('"', '""')}"`;
}
export function serializeCSV(rows) {
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
