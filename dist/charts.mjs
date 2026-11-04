import { YEARS, metrics } from './engine.mjs';
import { STAGE_LABELS } from './opportunities.mjs';
import { VOLUME_LABELS } from './volume.mjs';
import { esc, colors, integer, millions, pct, volumeColor } from './ui-format.mjs';
export function spark(values, period) {
  const v = values.slice(YEARS.indexOf(period.start), YEARS.indexOf(period.end) + 1);
  const numeric = v.filter((x) => x !== null);
  if (!numeric.length) return '<span class="neutral">—</span>';
  const min = Math.min(...numeric),
    max = Math.max(...numeric),
    span = max - min || 1;
  let path = '',
    active = false;
  v.forEach((y, i) => {
    if (y === null) {
      active = false;
      return;
    }
    path += `${active ? 'L' : 'M'}${((i / (v.length - 1)) * 77 + 3).toFixed(2)},${(23 - ((y - min) / span) * 19).toFixed(2)} `;
    active = true;
  });
  const m = metrics(values, period.start, period.end),
    col = m.growth !== null && m.growth < 0 ? '#d05858' : '#62566f';
  return `<svg class="sparkline" viewBox="0 0 85 27" role="img" aria-label="${period.start}년부터 ${period.end}년 수출 추이"><path d="${path}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linecap="round"/>${v.map((y, i) => (y === null ? '' : `<circle cx="${(i / (v.length - 1)) * 77 + 3}" cy="${23 - ((y - min) / span) * 19}" r="1.5" fill="${col}"/>`)).join('')}</svg>`;
}

export function lineChart(rows, period, { width = 520, height = 205 } = {}) {
  const years = YEARS.filter((y) => y >= period.start && y <= period.end),
    start = YEARS.indexOf(period.start);
  const vals = rows
    .flatMap((r) => r.values.slice(start, start + years.length))
    .filter((v) => v !== null);
  if (!vals.length) return '<div class="empty-state"><p>선택한 기간의 기록이 없어요.</p></div>';
  const left = 43,
    right = 18,
    top = 15,
    bottom = 27,
    w = width - left - right,
    h = height - top - bottom;
  const maximum = Math.max(...vals) / 1e6;
  const scaleBase = 10 ** Math.floor(Math.log10(maximum || 1));
  const max = (Math.ceil(((maximum || 1) / scaleBase) * 2) / 2) * scaleBase;
  const x = (i) => left + (i / (years.length - 1)) * w,
    y = (v) => top + h - (v / 1e6 / max) * h;
  const grid = Array.from({ length: 4 }, (_, i) => {
    const v = (max * i) / 3,
      yy = top + h - (v / max) * h;
    return `<path d="M${left} ${yy}H${width - right}" stroke="#eeeeee" stroke-dasharray="3 4"/><text x="${left - 10}" y="${yy + 3}" text-anchor="end" fill="#75777a" font-size="9">${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(v)}</text>`;
  }).join('');
  const lines = rows
    .map((r, j) => {
      let path = '',
        active = false;
      const vs = r.values.slice(start, start + years.length);
      vs.forEach((v, i) => {
        if (v === null) {
          active = false;
          return;
        }
        path += `${active ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)} `;
        active = true;
      });
      return `<path d="${path}" stroke="${colors[j]}" stroke-width="2.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${vs.map((v, i) => (v === null ? '' : `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="white" stroke="${colors[j]}" stroke-width="1.6"><title>${esc(r.name)} ${years[i]}: ${millions(v)} 백만 달러</title></circle>`)).join('')}`;
    })
    .join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${period.start}년부터 ${period.end}년 국가별 수출액 추이. 단위 백만 달러">${grid}${years.map((v, i) => `<text x="${x(i)}" y="${height - 5}" text-anchor="middle" fill="#75777a" font-size="9">${v}</text>`).join('')}${lines}</svg>`;
}

export function opportunityPlot(rows) {
  if (!rows.length) return '<div class="import-empty">표시할 비교 자료가 없습니다.</div>';
  const width = 640,
    height = 330,
    left = 64,
    right = 32,
    top = 35,
    bottom = 57,
    w = width - left - right,
    h = height - top - bottom;
  const xs = rows.map((r) => r.metrics.cagr * 100),
    ys = rows.map((r) => r.metrics.economyCagr * 100);
  const [xmin, xmax] = chartBounds(xs),
    [ymin, ymax] = chartBounds(ys);
  const x = (n) => left + ((n - xmin) / (xmax - xmin)) * w,
    y = (n) => top + h - ((n - ymin) / (ymax - ymin)) * h;
  const max = Math.max(...rows.map((r) => r.metrics.last), 1),
    radii = rows.map((r) => Math.sqrt(r.metrics.last / max) * 25);
  const axis = Array.from({ length: 5 }, (_, i) => {
    const xx = xmin + ((xmax - xmin) * i) / 4,
      yy = ymin + ((ymax - ymin) * i) / 4;
    return `<path d="M${x(xx)} ${top}V${top + h}M${left} ${y(yy)}H${left + w}" stroke="#eeeeee" stroke-dasharray="3 5"/><text x="${x(xx)}" y="${top + h + 22}" text-anchor="middle">${xx.toFixed(1)}%</text><text x="${left - 10}" y="${y(yy) + 4}" text-anchor="end">${yy.toFixed(1)}%</text>`;
  }).join('');
  const dots = rows
    .map(
      (r, i) =>
        `<g data-detail="${r.country}" data-plot-country tabindex="0" role="button" aria-label="${esc(r.name)} 상세: 수입 성장 ${pct(r.metrics.cagr)}, 구매력 성장 ${pct(r.metrics.economyCagr)}, 수입액 ${millions(r.metrics.last)}백만 달러"><title>${esc(r.name)} · 수입 성장 ${pct(r.metrics.cagr)} · 구매력 성장 ${pct(r.metrics.economyCagr)} · ${STAGE_LABELS[r.stage]}</title><circle cx="${x(xs[i])}" cy="${y(ys[i])}" r="${Math.max(7, radii[i])}" fill="transparent"/><circle cx="${x(xs[i])}" cy="${y(ys[i])}" r="${radii[i]}" fill="${i < 3 && r.recommendation.eligible ? colors[i] : '#a4a6a8'}" fill-opacity="${i < 3 && r.recommendation.eligible ? 0.8 : 0.3}" stroke="${i < 3 && r.recommendation.eligible ? colors[i] : '#a4a6a8'}" stroke-width="1"/>${i < 3 && r.recommendation.eligible ? `<path d="M${x(xs[i])} ${y(ys[i])}L${Math.min(left + w - 30, Math.max(left + 30, x(xs[i]) + [-64, 58, 64][i]))} ${Math.min(top + h - 12, Math.max(top + 12, y(ys[i]) + [-28, -30, 38][i]))}" stroke="${colors[i]}" fill="none"/><text class="plot-label" x="${Math.min(left + w - 30, Math.max(left + 30, x(xs[i]) + [-64, 58, 64][i]))}" y="${Math.min(top + h - 12, Math.max(top + 12, y(ys[i]) + [-28, -30, 38][i])) - 5}" text-anchor="middle">${esc(r.name)}</text>` : ''}</g>`,
    )
    .reverse()
    .join('');
  return `<svg class="opportunity-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="${rows.length}개 시장의 수입시장 성장과 1인당 실질 소비 성장. 원의 면적은 수입액에 비례합니다."><path d="M${x(0)} ${y(0)}H${left + w}V${top}H${x(0)}Z" fill="#f7f7f7"/>${axis}<path d="M${x(0)} ${top}V${top + h}M${left} ${y(0)}H${left + w}" stroke="#a4a6a8"/>${dots}<text class="axis-title" x="${left}" y="16">1인당 실질 소비 CAGR (%) ↑</text><text class="axis-title" x="${left + w}" y="${height - 8}" text-anchor="end">수입시장 CAGR (%) →</text></svg>`;
}

export function demandComparisonChart(views) {
  if (!views.length) return '<p class="inline-note">같은 연도에 비교할 소비 자료 없음</p>';
  const width = 540,
    left = 90,
    right = 110,
    height = 46 + 75 * views.length,
    w = width - left - right;
  const max = Math.max(1, ...views.map((v) => v.window.last.value * 100));
  const rows = views
    .map((v, i) => {
      const value = v.window.last.value * 100,
        y = 38 + i * 75,
        label = v.window.combined ? `${v.country.name} (합산)` : v.country.name;
      return `<text x="${left - 12}" y="${y + 4}" text-anchor="end">${esc(label)}</text><rect x="${left}" y="${y - 8}" width="${(value / max) * w}" height="16" rx="2" fill="${v.color}"/><text class="demand-number" x="${width - 8}" y="${y + 4}" text-anchor="end">${integer.format(value)}</text>`;
    })
    .join('');
  return `<svg class="demand-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="실제 즉석면 소비량, 백만 식"><path d="M${left} 10V${height - 25}" stroke="#e4e5e6"/>${rows}<text x="${left}" y="${height - 5}" text-anchor="middle">0</text><text x="${left + w}" y="${height - 5}" text-anchor="middle">${integer.format(max)}</text></svg>`;
}

export function demandTrendChart(views, years) {
  return (
    views
      .filter((v) => v.window)
      .map((v) => {
        const observations = new Map(v.window.observations.map((o) => [o.year, o.value * 100]));
        const max = Math.max(1, ...observations.values()),
          left = 60,
          right = 495,
          top = 42,
          bottom = 110;
        const x = (i) =>
          years.length > 1 ? left + ((right - left) * i) / (years.length - 1) : (left + right) / 2;
        const y = (value) => bottom - (value / max) * (bottom - top),
          label = v.window.combined ? `${v.country.name} (합산)` : v.country.name;
        let previous = null;
        const points = years
          .map((year, i) => {
            const value = observations.get(year);
            if (!Number.isFinite(value)) {
              previous = null;
              return '';
            }
            const line = previous
              ? `<path d="M${previous.x} ${previous.y}L${x(i)} ${y(value)}" stroke="${v.color}" stroke-width="2.5" fill="none"/>`
              : '';
            previous = { x: x(i), y: y(value) };
            return `${line}<circle cx="${x(i)}" cy="${y(value)}" r="4" fill="${v.color}"/><text x="${x(i)}" y="${y(value) - 10}" text-anchor="middle">${integer.format(value)}</text>`;
          })
          .join('');
        return `<svg class="demand-svg" viewBox="0 0 540 145" role="img" aria-label="${esc(label)} 연도별 소비량, 백만 식"><text x="0" y="15" class="demand-number">${esc(label)}</text><path d="M${left} ${top}V${bottom}H${right}" fill="none" stroke="#e4e5e6"/><text x="${left - 10}" y="${bottom + 4}" text-anchor="end">0</text>${points}${years.map((year, i) => `<text x="${x(i)}" y="132" text-anchor="middle">${year}</text>`).join('')}</svg>`;
      })
      .join('') || '<p class="inline-note">소비 자료 미확인</p>'
  );
}

export function volumePlot(rows) {
  if (!rows.length)
    return '<div class="import-empty">추정값을 제외하면 이 기간에 금액과 물량을 함께 비교할 자료가 없습니다.</div>';
  const width = 620,
    height = 320,
    left = 66,
    right = 32,
    top = 40,
    bottom = 54,
    w = width - left - right,
    h = height - top - bottom;
  const [xmin, xmax] = chartBounds(rows.map((r) => r.volume.amount.cagr * 100)),
    [ymin, ymax] = chartBounds(rows.map((r) => r.volume.weight.cagr * 100));
  const x = (n) => left + ((n - xmin) / (xmax - xmin)) * w,
    y = (n) => top + h - ((n - ymin) / (ymax - ymin)) * h;
  const max = Math.max(1, ...rows.map((r) => r.volume.amount.last));
  const grid = Array.from({ length: 5 }, (_, i) => {
    const xx = xmin + ((xmax - xmin) * i) / 4,
      yy = ymin + ((ymax - ymin) * i) / 4;
    return `<path d="M${x(xx)} ${top}V${top + h}M${left} ${y(yy)}H${left + w}" stroke="#eeeeee" stroke-dasharray="3 5"/><text x="${x(xx)}" y="${top + h + 22}" text-anchor="middle">${xx.toFixed(1)}%</text><text x="${left - 10}" y="${y(yy) + 4}" text-anchor="end">${yy.toFixed(1)}%</text>`;
  }).join('');
  const dots = rows
    .map((r, i) => {
      const cx = x(r.volume.amount.cagr * 100),
        cy = y(r.volume.weight.cagr * 100),
        radius = Math.sqrt(r.volume.amount.last / max) * 22;
      return `<g data-detail="${r.country}" data-plot-country tabindex="0" role="button" aria-label="${esc(r.name)}: 금액 ${pct(r.volume.amount.cagr)}, 중량 ${pct(r.volume.weight.cagr)}, ${VOLUME_LABELS[r.volume.classification]}"><title>${esc(r.name)} · 금액 ${pct(r.volume.amount.cagr)} · 중량 ${pct(r.volume.weight.cagr)} · ${VOLUME_LABELS[r.volume.classification]}</title><circle cx="${cx}" cy="${cy}" r="${Math.max(10, radius)}" fill="transparent"/><circle cx="${cx}" cy="${cy}" r="${radius}" fill="${volumeColor(r.volume.classification)}" fill-opacity=".55" stroke="${volumeColor(r.volume.classification)}"/>${i < 3 ? `<text class="plot-label" x="${cx}" y="${i === 2 ? cy + radius + 18 : cy - radius - 8}" text-anchor="middle">${esc(r.name)}</text>` : ''}</g>`;
    })
    .reverse()
    .join('');
  return `<svg class="volume-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="추정 표시 없는 중량으로 비교 가능한 시장 중 수입액 상위 20개. 가로 금액 성장률, 세로 중량 성장률."><path d="M${x(0)} ${y(0)}H${left + w}V${top}H${x(0)}Z" fill="#f7f7f7"/>${grid}<path d="M${x(0)} ${top}V${top + h}M${left} ${y(0)}H${left + w}" stroke="#a4a6a8"/>${dots}<text class="axis-title" x="${left}" y="18">순중량 연평균 성장률 (%) ↑</text><text class="axis-title" x="${left + w}" y="${height - 6}" text-anchor="end">수입액 연평균 성장률 (%) →</text></svg>`;
}

function chartBounds(values) {
  const minimum = Math.min(0, ...values),
    maximum = Math.max(0, ...values);
  const padding = (maximum - minimum || 1) * 0.16;
  return [minimum - padding, maximum + padding];
}
