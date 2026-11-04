import { createMarketAnalyzer } from './market-analysis.mjs';
import { countryName, localizeCountries } from './countries.mjs';
import { loadDatasets } from './data-loader.mjs';
import {
  esc,
  colors,
  number,
  integer,
  millions,
  pct,
  tone,
  sharePct,
  pp,
  shareText,
  pointsText,
  days,
  volumeColor,
} from './ui-format.mjs';
import { icon, icons, flag } from './ui-icons.mjs';
import {
  spark as sparkChart,
  lineChart as exportChart,
  opportunityPlot,
  demandComparisonChart,
  demandTrendChart,
  volumePlot,
} from './charts.mjs';
import { mountChat } from './chat-ui.mjs?v=32';
import { recommendationCopy, latestDemandEvidence } from './recommendation-copy.mjs?v=30';
import {
  RECOMMENDATION_GROUPS,
  INPUT_LABELS,
  recommendationRows,
  makeRecommendationCSV,
} from './recommendations.mjs';
import { OPPORTUNITY_CRITERIA, STAGE_LABELS } from './opportunities.mjs';
import {
  volumeMetrics,
  getVolumeRows,
  makeVolumeCSV,
  VOLUME_LABELS,
  WEIGHT_LABELS,
} from './volume.mjs';
import { demandWindow } from './demand.mjs?v=27';
import { surveyCities, monthlyUse } from './survey.mjs';
import {
  YEARS,
  metrics,
  getRows,
  makeCSV,
  importMetrics,
  getImportRows,
  makeImportCSV,
} from './engine.mjs';
const $ = (id) => document.getElementById(id);
let historyMetric = 'world';
let data,
  index,
  countries,
  imports,
  importIndex,
  partners,
  context,
  demand,
  survey,
  evidence,
  latestDemand,
  aiExplanations,
  toastTimer;
let analyzeCurrentMarket;
const state = {
  product: '190230',
  start: 2021,
  end: 2025,
  sort: 'last',
  search: '',
  minimum: 0,
  complete: false,
  page: 1,
  selected: [],
  importPage: 1,
  importSort: 'last',
  importSearch: '',
  scoreSearch: '',
  scorePage: 1,
  volumeSearch: '',
};
const PAGE_SIZE = 12;
const product = () => data.products.find((p) => p.code === state.product);
const getSeries = (code, country) => index.get(`${code}:${country}`);
const spark = (values) => sparkChart(values, state);
const lineChart = (rows, options) => exportChart(rows, state, options);
function withCountry(code) {
  const c = countries.get(code);
  const s = getSeries(state.product, code);
  return {
    ...c,
    country: code,
    values: s?.values || YEARS.map(() => null),
    sources: s?.sources || YEARS.map(() => null),
    metrics: metrics(s?.values || YEARS.map(() => null), state.start, state.end),
  };
}
function notify(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), 3200);
}
function persist() {
  try {
    localStorage.setItem('kfood-atlas-candidates-v1', JSON.stringify(state.selected));
  } catch {
    /* Storage is optional. */
  }
}
function toggleCountry(code) {
  if (state.selected.includes(code)) state.selected = state.selected.filter((x) => x !== code);
  else if (state.selected.length >= 4) {
    notify('후보국은 최대 4개까지 비교할 수 있어요.');
    return;
  } else state.selected.push(code);
  persist();
  renderTable();
  renderImports();
  renderScores();
  renderEvidence();
  renderTray();
  renderCharts();
  if ($('compareDialog').open) renderCompare();
  if ($('detailDialog').open) renderDetail(code, false);
}

const legend = (rows) =>
  rows
    .map(
      (r, i) =>
        `<span class="legend-item"><i class="legend-dot" style="background:${colors[i]}"></i>${esc(r.name)}</span>`,
    )
    .join('');
function renderKpis() {
  const world = metrics(getSeries(state.product, 0).values, state.start, state.end);
  const all = getRows(data, { ...state, search: '', minimum: 0, complete: false });
  const observed = all.filter((r) => r.metrics.last !== null).length,
    complete = all.filter((r) => r.metrics.observed === r.metrics.expected).length;
  $('kpis').innerHTML = [
    {
      label: `${state.end}년 세계 수출액`,
      value: millions(world.last),
      unit: '백만 달러',
      foot: '선택 제품군 · 전 세계 합계',
      icon: 'money',
    },
    {
      label: '기간 누적 증가율',
      value: pct(world.growth),
      unit: '',
      foot: `${state.start} → ${state.end} · 연평균 ${pct(world.cagr)}`,
      icon: 'trend',
      tone: tone(world.growth),
    },
    {
      label: '수출 기록이 있는 시장',
      value: observed,
      unit: '개',
      foot: `${state.end}년 기록이 관측된 국가·지역`,
      icon: 'globe',
    },
    {
      label: '기간 전체 기록이 있는 시장',
      value: complete,
      unit: '개',
      foot: `${state.start}–${state.end} · ${world.expected}개 연도 모두 관측`,
      icon: 'layers',
    },
  ]
    .map(
      (k) =>
        `<article class="kpi"><div class="kpi-label">${k.label}${icon(k.icon)}</div><div class="kpi-value ${k.tone || ''}">${k.value}<small>${k.unit}</small></div><div class="kpi-foot">${k.foot}</div></article>`,
    )
    .join('');
}
function renderCharts() {
  const rows = getRows(data, { ...state, sort: 'last' }).filter((r) => r.metrics.last !== null);
  const top = rows.slice(0, 6),
    max = top[0]?.metrics.last || 1;
  $('barSubtitle').textContent = `현재 탐색 조건 · 상위 ${top.length}개 국가·지역`;
  $('barYear').textContent = `${state.end}년`;
  $('barChart').innerHTML = top.length
    ? top
        .map(
          (r) =>
            `<div class="bar-row"><button class="bar-country" data-detail="${r.country}" title="${esc(r.name)} 상세 보기">${flag(r)}<span>${esc(r.name)}</span></button><div class="bar-track"><div class="bar-fill" style="width:${(r.metrics.last / max) * 100}%"></div></div><span class="bar-value">${millions(r.metrics.last)}</span></div>`,
        )
        .join('')
    : '<div class="empty-state"><p>표시할 기록이 없어요.</p></div>';
  const trend = state.selected.length ? state.selected.map(withCountry) : rows.slice(0, 3);
  $('trendTitle').textContent = state.selected.length
    ? '선택한 후보국의 수출 흐름'
    : '주요 시장의 수출 흐름';
  $('trendChart').innerHTML = lineChart(trend);
  $('trendLegend').innerHTML = legend(trend);
}
function renderTable() {
  const rows = getRows(data, state),
    pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.page = Math.min(state.page, pages);
  const first = (state.page - 1) * PAGE_SIZE,
    shown = rows.slice(first, first + PAGE_SIZE);
  $('resultCount').textContent = `${rows.length}개`;
  $('latestHead').innerHTML = `${state.end} 수출액 <small>백만 달러</small>`;
  $('yoyHead').textContent = `${state.end} 전년비`;
  $('marketRows').innerHTML = shown
    .map((r) => {
      const m = r.metrics,
        chosen = state.selected.includes(r.country),
        years = `${m.observed}/${m.expected}`;
      return `<tr class="${chosen ? 'selected' : ''}"><td><button class="country-button" data-detail="${r.country}" aria-label="${esc(r.name)} 제품군별 상세 보기">${flag(r)}<span>${esc(r.name)}<small>${esc(r.english)}</small></span></button></td><td class="latest-cell" title="${m.last === null ? '미확인' : integer.format(m.last) + ' USD FOB'}">${millions(m.last)}</td><td>${spark(r.values)}</td><td class="${tone(m.delta)}">${m.delta !== null && m.delta > 0 ? '+' : ''}${millions(m.delta)}</td><td><span class="cell-rate ${tone(m.cagr)}">${pct(m.cagr)}</span>${m.lowBase ? '<small class="base-note">시작액 100만 달러 미만</small>' : ''}</td><td><span class="cell-rate ${tone(m.yoy)}">${pct(m.yoy)}</span></td><td><span class="data-badge ${m.observed === m.expected ? '' : 'partial'}" title="${state.start}~${state.end}년 중 ${m.observed}개 연도 관측">${m.observed === m.expected ? '✓' : '·'} ${years}년</span></td><td><button class="compare-add ${chosen ? 'chosen' : ''}" data-toggle="${r.country}" aria-label="${esc(r.name)} 비교${chosen ? '에서 제거' : '에 추가'}" aria-pressed="${chosen}">${chosen ? '✓' : '+'}</button></td></tr>`;
    })
    .join('');
  $('emptyState').hidden = rows.length > 0;
  $('paginationText').textContent = rows.length
    ? `${first + 1}–${Math.min(first + PAGE_SIZE, rows.length)} / ${rows.length}개 국가·지역`
    : '0개 국가·지역';
  $('pageText').textContent = `${state.page} / ${pages}`;
  $('prevPage').disabled = state.page === 1;
  $('nextPage').disabled = state.page === pages;
}
function renderTray() {
  $('comparisonTray').hidden = state.selected.length === 0;
  $('navCount').textContent = state.selected.length;
  $('trayCount').textContent = state.selected.length;
  $('trayHint').textContent = state.selected.length
    ? '같은 제품군과 기간으로 비교해보세요'
    : '표의 + 버튼으로 국가를 골라보세요';
  $('trayCountries').innerHTML = state.selected
    .map((code) => {
      const c = countries.get(code);
      return `<span class="candidate-chip">${flag(c)}${esc(c.name)}<button data-toggle="${code}" aria-label="${esc(c.name)} 비교에서 제거">×</button></span>`;
    })
    .join('');
  $('openCompare').disabled = state.selected.length < 2;
  $('clearCandidates').hidden = !state.selected.length;
}
function render() {
  renderKpis();
  renderTable();
  renderCharts();
  renderImports();
  renderScores();
  renderEvidence();
  renderTray();
}
function resetFilters() {
  state.search = '';
  state.minimum = 0;
  state.complete = false;
  state.sort = 'last';
  state.page = 1;
  $('countrySearch').value = '';
  $('minimumSelect').value = '0';
  $('completeOnly').checked = false;
  $('sortSelect').value = 'last';
  renderTable();
  renderCharts();
}
function showSources() {
  if (!data || !demand || !imports) {
    notify('데이터를 불러온 뒤 다시 열어주세요.');
    return;
  }
  $('sourcesContent').innerHTML =
    `<div class="source-callout"><strong>실제 한국발 수출의 흐름을 비교합니다.</strong><br>수입시장·한국산 점유율·주요 경쟁국을 함께 비교합니다. 구매력·수입시장·한국산 성과·문화/소비를 관측 근거 지수로 함께 비교합니다.</div><div class="method-grid"><div class="method-box"><h3>수집 범위</h3><p>2021–2025년 · 연간 수출 · 한국(보고국 410)<br>10개 제품군 · 195개 국가·지역 · 4,638개 원자료 행<br>수집일 2026년 10월 28일 · 고정된 데이터 스냅샷</p><a href="https://comtrade.un.org/" target="_blank" rel="noopener noreferrer">UN Comtrade 공식 사이트 ↗</a></div><div class="method-box"><h3>금액과 성장률</h3><p>금액: 백만 USD, 수출 FOB 기준<br>누적 증가율 = 종료액 ÷ 시작액 − 1<br>연평균 성장률 = (종료액 ÷ 시작액)^(1/기간) − 1<br>전년비는 종료 연도와 그 직전 연도를 비교합니다.</p></div><div class="method-box"><h3>빈칸과 높은 성장률</h3></div><div class="method-box"><h3>해석 범위</h3></div></div><h3 class="section-title">수입 중량 교차 검증</h3><h3 class="section-title">소비 수요 참고자료</h3><p><a href="${demand.meta.sourceUrl}" target="_blank" rel="noopener noreferrer">공식 재수록 자료 · 인쇄 19쪽 ↗</a></p>${importMethod()}<h3 class="section-title">추천 설명</h3><p class="inline-note">GPT-5.4가 국가·제품군·기간별 근거로 생성한 설명을 검토해 제공합니다. 순위와 수치는 기존 계산 결과이며, 설명은 데이터가 일치할 때 재사용합니다.</p><h3 class="section-title">동일 가중치 점수 기준</h3>${scoreMethodText()}${surveyMethod()}<h3>제품군 분류</h3><p class="inline-note">2021년 HS2017, 2022–2025년 HS2022. 아래 비교 코드는 두 개정판에서 유지됩니다.</p><table class="source-table"><thead><tr><th>HS</th><th>제품군</th><th>통계 범위</th></tr></thead><tbody>${data.products.map((p) => `<tr><td>${p.code}</td><td>${esc(p.name)}</td><td>${esc(p.fullName)}<small>${esc(p.note)}</small></td></tr>`).join('')}</tbody></table>`;
  $('sourcesDialog').showModal();
}
let detailCode = null;
function renderDetail(code, open = true) {
  if (open) detailCode = code;
  else code = detailCode;
  if (!countries.has(code)) return;
  const c = withCountry(code),
    m = c.metrics,
    p = product(),
    chosen = state.selected.includes(code);
  $('detailHeading').innerHTML =
    `<div class="eyebrow">COUNTRY PROFILE</div><div class="country-title">${flag(c)}<div><h2 id="detailTitle">${esc(c.name)}</h2><small>${esc(c.english)}</small></div></div>`;
  const all = data.products
    .map((p) => {
      const s = getSeries(p.code, code);
      return {
        ...p,
        series: s,
        metrics: metrics(s?.values || YEARS.map(() => null), state.start, state.end),
      };
    })
    .sort((a, b) => (b.metrics.last ?? -1) - (a.metrics.last ?? -1));
  $('detailContent').innerHTML =
    `${recommendationBrief(code)}<details class="detail-evidence"><summary>한국산 실적·연도별 근거</summary>${candidateReviewDetail(code)}</details>${scoreDetail(code)}${volumeDetail(code)}${surveyDetail(code)}${importDetail(code)}${logisticsDetail(code)}<div class="detail-heading-line"><h3>${esc(p.name)} <small class="neutral">HS ${p.code}</small></h3><button class="button ${chosen ? 'secondary' : 'primary'}" data-toggle="${code}">${chosen ? '✓ 비교 후보에 담김' : '+ 비교 후보에 추가'}</button></div><div class="detail-summary"><div class="mini-stat">${state.end} 수출액<strong>${millions(m.last)}</strong>백만 달러</div><div class="mini-stat">기간 누적 증가율<strong class="${tone(m.growth)}">${pct(m.growth)}</strong>${state.start} → ${state.end}</div><div class="mini-stat">연평균 성장률<strong class="${tone(m.cagr)}">${pct(m.cagr)}</strong>${m.observed}/${m.expected}개 연도 관측</div></div><div class="detail-chart">${lineChart([c], { width: 640, height: 195 })}</div><h3 class="section-title">연도별 금액과 원자료</h3><table class="source-table"><thead><tr><th>연도</th><th>수출액 · USD FOB</th><th>데이터 출처</th></tr></thead><tbody>${YEARS.map((year, i) => `<tr><td>${year}</td><td>${c.values[i] === null ? '미확인' : integer.format(c.values[i]) + ' 달러'}</td><td>${c.sources[i] ? `<a href="${esc(c.sources[i])}" target="_blank" rel="noopener noreferrer">UN Comtrade 조회 ↗</a>` : '<span class="missing-source">기록 미확인</span>'}</td></tr>`).join('')}</tbody></table><h3 class="section-title">이 시장의 다른 제품군</h3><table class="source-table"><thead><tr><th>제품군</th><th>${state.end} 수출액</th><th>누적 증가율</th></tr></thead><tbody>${all.map((r) => `<tr><td><button class="detail-product" data-product="${r.code}">${esc(r.name)} ↗</button></td><td>${millions(r.metrics.last)}</td><td class="${tone(r.metrics.growth)}">${pct(r.metrics.growth)}</td></tr>`).join('')}</tbody></table>`;
  if (open) $('detailDialog').showModal();
}
function renderCompare() {
  const rows = state.selected.map(withCountry),
    p = product();
  $('compareSubtitle').textContent =
    `${p.name} · HS ${p.code} · ${state.start}–${state.end} · 백만 달러`;
  if (rows.length < 2) {
    $('compareContent').innerHTML =
      '<div class="compare-empty"><h3>비교할 국가를 2개 이상 골라주세요</h3><p>국가별 실적 표의 + 버튼으로 최대 4개 국가를 추가할 수 있어요.</p><button class="button primary close-dialog">탐색으로 돌아가기</button></div>';
    return;
  }
  const fields = [
    ['종료 연도 수출액', 'last', millions],
    ['기간 증가액', 'delta', millions],
    ['누적 증가율', 'growth', pct],
    ['연평균 성장률', 'cagr', pct],
    ['종료 연도 전년비', 'yoy', pct],
  ];
  const metricTable = fields
    .map(
      ([label, key, fmt]) =>
        `<tr><td>${label}</td>${rows.map((r) => `<td class="${key === 'last' ? '' : tone(r.metrics[key])}">${fmt(r.metrics[key])}</td>`).join('')}</tr>`,
    )
    .join('');
  const notes = rows
    .map((r) => {
      const item = scoreRows().find((s) => s.country === r.country),
        v = item.review,
        n = item.recommendation;
      return `<div class="compare-note"><h3>${esc(r.name)}</h3><span class="review-badge review-${v.tone}">${esc(v.label)}</span><p>${esc(v.summary)}</p><p>${esc(n.demandText)} · ${esc(n.intentionText)}</p><p>${esc(n.action)}</p></div>`;
    })
    .join('');
  const heat = data.products
    .map((p) => {
      const vals = rows.map((r) => getSeries(p.code, r.country)?.values || YEARS.map(() => null));
      const ms = vals.map((v) => metrics(v, state.start, state.end));
      const max = Math.max(1, ...ms.map((m) => m.last || 0));
      return `<tr><td>${esc(p.name)}</td>${ms.map((m) => `<td class="heat-cell" style="--heat:${m.last !== null ? Math.round((m.last / max) * 80) : 0}%">${millions(m.last)}<small>${pct(m.growth)} 누적</small></td>`).join('')}</tr>`;
    })
    .join('');
  $('compareContent').innerHTML =
    `<div class="compare-cards" style="--count:${rows.length}">${rows.map((r, i) => `<article class="compare-card" style="border-top:3px solid ${colors[i]}"><div class="compare-card-name">${flag(r)}${esc(r.name)}</div><button class="compare-add" data-toggle="${r.country}" aria-label="${esc(r.name)} 비교에서 제거">×</button><div class="compare-card-value">${millions(r.metrics.last)}<small>백만 달러</small></div><div class="compare-card-detail">${state.end}년 수출액 · ${r.metrics.observed}/${r.metrics.expected}년 관측</div></article>`).join('')}</div><div class="compare-chart">${lineChart(rows, { width: 920, height: 250 })}</div><div class="chart-legend">${legend(rows)}</div><div class="table-scroll"><table class="comparison-table"><thead><tr><th>비교 지표</th>${rows.map((r) => `<th>${esc(r.name)}</th>`).join('')}</tr></thead><tbody>${scoreCompareRows(rows)}${logisticsCompareRows(rows)}${volumeCompareRows(rows)}${metricTable}${importCompareRows(rows)}<tr><td>수출 관측 데이터</td>${rows.map((r) => `<td>${r.metrics.observed}/${r.metrics.expected}개 연도</td>`).join('')}</tr></tbody></table></div>${importCompareSuppliers(rows)}<div class="compare-notes" style="--count:${rows.length}">${notes}</div><h3 class="section-title">제품군을 넓혀서 비교해보세요</h3><p class="inline-note">각 국가의 ${state.end}년 수출액과 ${state.start}년 대비 누적 증가율. 셀 배경은 같은 제품군 안에서 수출액의 상대적 크기입니다.</p><div class="table-scroll"><table class="comparison-table product-heatmap"><thead><tr><th>제품군</th>${rows.map((r) => `<th>${esc(r.name)}</th>`).join('')}</tr></thead><tbody>${heat}</tbody></table></div>`;
}
function openCompare() {
  if (!data) {
    notify('데이터를 불러온 뒤 다시 열어주세요.');
    return;
  }
  renderCompare();
  $('compareDialog').showModal();
}
function download() {
  const rows = getRows(data, state);
  const text = makeCSV(rows, product(), state.start, state.end);
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `kfood-${state.product}-${state.start}-${state.end}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify(`${rows.length}개 국가·지역의 비교표를 내려받았어요.`);
}
function changePeriod(which) {
  state[which] = Number($(which === 'start' ? 'startYear' : 'endYear').value);
  if (state.start >= state.end) {
    if (which === 'start') state.end = state.start + 1;
    else state.start = state.end - 1;
  }
  $('startYear').value = state.start;
  $('endYear').value = state.end;
  state.page = 1;
  render();
}
function wire() {
  $('volumeSearch').addEventListener('input', (e) => {
    state.volumeSearch = e.target.value;
    renderVolumeTable();
  });
  $('volumeDownload').addEventListener('click', downloadVolume);
  $('compareTop3').addEventListener('click', () => {
    state.selected = decisionRows()
      .slice(0, 3)
      .map((r) => r.country);
    persist();
    render();
    openCompare();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-plot-country]')) {
      e.preventDefault();
      renderDetail(Number(e.target.dataset.detail));
    }
  });
  $('scoreSearch').addEventListener('input', (e) => {
    state.scoreSearch = e.target.value;
    state.scorePage = 1;
    renderScores();
  });
  $('scorePrev').addEventListener('click', () => {
    state.scorePage--;
    renderScores();
  });
  $('scoreNext').addEventListener('click', () => {
    state.scorePage++;
    renderScores();
  });
  $('scoreDownload').addEventListener('click', downloadScores);
  $('importSearch').addEventListener('input', (e) => {
    state.importSearch = e.target.value;
    state.importPage = 1;
    renderImports();
  });
  $('importSort').addEventListener('change', (e) => {
    state.importSort = e.target.value;
    state.importPage = 1;
    renderImports();
  });
  $('importPrev').addEventListener('click', () => {
    state.importPage--;
    renderImports();
  });
  $('importNext').addEventListener('click', () => {
    state.importPage++;
    renderImports();
  });
  $('importDownload').addEventListener('click', downloadImports);
  $('productSelect').addEventListener('change', (e) => {
    state.product = e.target.value;
    state.page = 1;
    render();
  });
  $('startYear').addEventListener('change', () => changePeriod('start'));
  $('endYear').addEventListener('change', () => changePeriod('end'));
  $('sortSelect').addEventListener('change', (e) => {
    state.sort = e.target.value;
    state.page = 1;
    renderTable();
  });
  $('countrySearch').addEventListener('input', (e) => {
    state.search = e.target.value;
    state.page = 1;
    renderTable();
    renderCharts();
  });
  $('minimumSelect').addEventListener('change', (e) => {
    state.minimum = Number(e.target.value);
    state.page = 1;
    renderTable();
    renderCharts();
  });
  $('completeOnly').addEventListener('change', (e) => {
    state.complete = e.target.checked;
    state.page = 1;
    renderTable();
    renderCharts();
  });
  $('prevPage').addEventListener('click', () => {
    state.page--;
    renderTable();
  });
  $('nextPage').addEventListener('click', () => {
    state.page++;
    renderTable();
  });
  $('sourcesButton').addEventListener('click', showSources);
  ['navCompare', 'mobileCompare', 'openCompare'].forEach((id) =>
    $(id).addEventListener('click', openCompare),
  );
  document.querySelectorAll('[data-jump]').forEach((button) =>
    button.addEventListener('click', () => {
      const target = $(button.dataset.jump);
      if (target.tagName === 'DETAILS') target.open = true;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }),
  );
  document.querySelectorAll('[data-history]').forEach((button) =>
    button.addEventListener('click', () => {
      historyMetric = button.dataset.history;
      renderHistory(marketAnalysis().selection.top);
    }),
  );
  const sectionNav = [
    [$('navExplore'), $('overview')],
    ...Array.from(document.querySelectorAll('[data-jump]'), (b) => [b, $(b.dataset.jump)]),
  ];
  const syncSectionNav = () => {
    const current =
      sectionNav.filter(([, section]) => section.getBoundingClientRect().top <= 160).at(-1)?.[0] ||
      $('navExplore');
    sectionNav.forEach(([button]) => {
      button.classList.toggle('active', button === current);
      if (button === current) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
    });
  };
  window.addEventListener('scroll', syncSectionNav, { passive: true });
  $('navExplore').addEventListener('click', () => {
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('clearCandidates').addEventListener('click', () => {
    state.selected = [];
    persist();
    render();
  });
  $('resetFilters').addEventListener('click', resetFilters);
  $('downloadButton').addEventListener('click', download);
  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      toggleCountry(Number(toggle.dataset.toggle));
      return;
    }
    const detail = e.target.closest('[data-detail]');
    if (detail) {
      renderDetail(Number(detail.dataset.detail));
      return;
    }
    const p = e.target.closest('[data-product]');
    if (p) {
      state.product = p.dataset.product;
      $('productSelect').value = state.product;
      state.page = 1;
      $('detailDialog').close();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const close = e.target.closest('.close-dialog');
    if (close) close.closest('dialog').close();
  });
  document.querySelectorAll('dialog').forEach((d) =>
    d.addEventListener('click', (e) => {
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
          d.close();
      }
    }),
  );
}
async function load() {
  $('error').hidden = true;
  $('loading').hidden = false;
  try {
    const datasets = await loadDatasets();
    data = localizeCountries(datasets.data);
    imports = datasets.imports;
    context = datasets.context;
    demand = datasets.demand;
    latestDemand = datasets['latest-demand'];
    survey = datasets.survey;
    evidence = datasets.opportunities;
    aiExplanations = datasets.explanations;
    analyzeCurrentMarket = createMarketAnalyzer({ data, imports, evidence, demand });
    importIndex = new Map(imports.rows.map((r) => [`${r.product}:${r.country}`, r]));
    partners = new Map(imports.partners.map((p) => [p.code, p]));
    if (data.products.length !== 10 || data.countries.length !== 195)
      throw new Error('Unexpected dataset');
    index = new Map(data.rows.map((r) => [`${r.product}:${r.country}`, r]));
    countries = new Map(data.countries.map((c) => [c.code, c]));
    try {
      const saved = JSON.parse(localStorage.getItem('kfood-atlas-candidates-v1') || '[]');
      state.selected = Array.isArray(saved)
        ? [...new Set(saved)].filter((c) => countries.has(c)).slice(0, 4)
        : [];
    } catch {
      state.selected = [];
    }
    $('productSelect').innerHTML = data.products
      .map((p) => `<option value="${p.code}">${esc(p.name)}</option>`)
      .join('');
    $('productSelect').value = state.product;
    $('startYear').innerHTML = YEARS.slice(0, -1)
      .map((y) => `<option value="${y}">${y}년</option>`)
      .join('');
    $('endYear').innerHTML = YEARS.slice(1)
      .map((y) => `<option value="${y}">${y}년</option>`)
      .join('');
    $('endYear').value = state.end;
    $('loading').hidden = true;
    $('content').hidden = false;
    $('downloadButton').disabled = false;
    render();
  } catch (error) {
    console.error('Dataset load failed', error);
    $('loading').hidden = true;
    $('error').hidden = false;
  }
}
icons();
wire();
$('retryButton').addEventListener('click', load);
load();

function importSeries(code) {
  return importIndex.get(`${state.product}:${code}`);
}
function supplierName(code) {
  const p = partners.get(code);
  if (!p) return `UN ${code}`;
  return countryName(p);
}
function competitionFor(row) {
  const c = row?.competition;
  return c && c.year <= state.end ? c : null;
}
function importRows() {
  return getImportRows(data, imports, state).map((r) => ({
    ...r,
    leaderName: supplierName(r.competition?.top[0]?.country),
  }));
}
function renderImports() {
  const rows = importRows(),
    pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.importPage = Math.max(1, Math.min(state.importPage, pages));
  const first = (state.importPage - 1) * PAGE_SIZE,
    shown = rows.slice(first, first + PAGE_SIZE);
  const available = getImportRows(data, imports, { ...state, importSearch: '' }).filter(
    (r) => r.metrics.last !== null,
  ).length;
  $('importCount').textContent = `${available}개 확인`;
  $('importCoverage').textContent =
    `${state.end}년 전체 수입액: ${available}/195개 국가·지역 확인. 경쟁국 자료: ${imports.meta.competitionCountries}/${imports.meta.countries}개 수집${imports.meta.competitionStatus === 'complete' ? ' · 공급국 조회 완료' : ', 일부 국가 미수집'}.`;
  $('importPeriod').textContent = `${state.start}–${state.end}`;
  $('importYear').textContent = `${state.end}년 · 백만 달러`;
  $('importRows').innerHTML = shown.length
    ? shown
        .map((r) => {
          const m = r.metrics,
            c = competitionFor(r),
            lead = c?.top[0],
            selected = state.selected.includes(r.country);
          return `<tr class="${selected ? 'selected' : ''}"><td><button class="country-button" data-detail="${r.country}">${flag(r)}<span>${esc(r.name)}<small>${esc(r.english)}</small></span></button></td><td class="latest-cell">${millions(m.last)}${r.basis ? `<small class="basis-note">${r.basis}</small>` : ''}</td><td class="${tone(m.cagr)}">${pct(m.cagr)}${m.lowBase ? '<small class="base-note">시작 수입 100만 달러 미만</small>' : ''}</td><td>${millions(m.korea)}</td><td>${sharePct(m.share)}${m.share !== null ? `<span class="share-track"><i style="width:${m.share * 100}%"></i></span>` : ''}</td><td class="${tone(m.shareChange)}">${pp(m.shareChange)}</td><td class="supplier-cell">${lead ? `<button data-detail="${r.country}">${esc(supplierName(lead.country))}<small>${c.year}년 · ${c.basis}${c.year !== state.end ? ' · 참고' : ''} · ${sharePct(c.world > 0 ? lead.value / c.world : null)}</small></button>` : `<span class="neutral">${r.competition ? '이 기간 미확인' : imports.meta.competitionStatus === 'complete' ? '자료 미확인' : '미수집'}</span>${r.competition?.year > state.end ? `<small>${r.competition.year}년 자료만 수집</small>` : ''}`}</td><td><button class="compare-add ${selected ? 'chosen' : ''}" data-toggle="${r.country}" aria-label="${esc(r.name)} 수입시장 비교${selected ? '에서 제거' : '에 추가'}" aria-pressed="${selected}">${selected ? '✓' : '+'}</button></td></tr>`;
        })
        .join('')
    : '<tr><td colspan="8"><div class="empty-state">검색 조건에 맞는 국가가 없어요.</div></td></tr>';
  $('importPaginationText').textContent = rows.length
    ? `${first + 1}–${Math.min(first + PAGE_SIZE, rows.length)} / ${rows.length}개 국가·지역`
    : '0개 국가·지역';
  $('importPageText').textContent = `${state.importPage} / ${pages}`;
  $('importPrev').disabled = state.importPage === 1;
  $('importNext').disabled = state.importPage === pages;
}
function importDetail(code) {
  const row = importSeries(code),
    m = importMetrics(row, state.start, state.end),
    c = competitionFor(row);
  const kr = c?.korea !== null && c?.korea !== undefined ? { country: 410, value: c.korea } : null;
  const suppliers = c ? [...(kr ? [kr] : []), ...c.top] : [];
  return `<section class="import-detail"><div class="eyebrow">DESTINATION IMPORTS</div><h3>현지 수입시장과 경쟁 구도<span class="basis-tag">${state.end}년 · ${row?.basis || '수입 신고액'}</span></h3><p class="inline-note">${esc(product().name)} · HS ${state.product} · 금액: 백만 USD · 수입국 신고액 · ${row ? row.basis + '로 통일' : '자료 미확인'}</p><div class="detail-summary"><div class="mini-stat">전체 수입액<strong>${millions(m.last)}</strong>수입시장 연평균 ${pct(m.cagr)}</div><div class="mini-stat">한국산 점유율<strong>${sharePct(m.share)}</strong>한국산 수입액 ${millions(m.korea)}백만 달러</div><div class="mini-stat">기간 점유율 변화<strong class="${tone(m.shareChange)}">${pp(m.shareChange)}</strong>${state.start} → ${state.end}</div></div><div class="table-scroll"><table class="source-table import-annual"><thead><tr><th>연도</th><th>전체 수입액</th><th>한국산 수입액</th><th>한국산 점유율</th><th>원자료</th></tr></thead><tbody>${YEARS.filter(
    (y) => y >= state.start && y <= state.end,
  )
    .map((y) => {
      const i = YEARS.indexOf(y);
      return `<tr><td>${y}</td><td>${millions(row?.world[i])}</td><td>${millions(row?.korea[i])}</td><td>${sharePct(m.shares[i])}</td><td>${row?.sources[i] ? `<a href="${esc(row.sources[i])}" target="_blank" rel="noopener noreferrer">조회 ↗</a>` : '미확인'}</td></tr>`;
    })
    .join(
      '',
    )}</tbody></table></div><div class="supplier-title"><div><h3>한국과 주요 경쟁국 5개</h3><p class="inline-note">${c ? `${c.year}년 · ${c.basis} · 확인된 국가·지역 공급국 ${c.suppliers}개${c.year !== state.end ? ' · 선택 종료 연도 자료가 없어 이전 보고 연도를 참고합니다.' : ''}` : '경쟁국 자료 미확인'}</p></div>${c ? `<a href="${esc(c.source)}" target="_blank" rel="noopener noreferrer">공급국별 원자료 ↗</a>` : ''}</div>${
    c
      ? `<div class="supplier-list">${suppliers
          .map((s, i) => {
            const ratio = c.world > 0 ? s.value / c.world : null;
            return `<div class="supplier-row ${s.country === 410 ? 'korean' : ''}"><span class="rank">${s.country === 410 ? (c.koreaRank === null ? '—' : c.koreaRank) : s.rank}</span><span>${esc(supplierName(s.country))}<small class="neutral"> · ${millions(s.value)}</small></span><span class="supplier-track"><i style="width:${Math.min(100, (ratio || 0) * 100)}%"></i></span><span class="share">${sharePct(ratio)}</span></div>`;
          })
          .join(
            '',
          )}</div><p class="inline-note">한국은 확인된 국가·지역 공급국 중 ${c.koreaRank === null ? '순위 미확인' : c.koreaRank + '위'}입니다. 경쟁국 5개는 한국을 제외한 수입액 순입니다. ${c.unallocated > 0 ? `기타·동일 기준 금액 미확인 수입 ${millions(c.unallocated)}백만 달러는 점유율 분모에 포함됩니다.` : ''}</p>`
      : `<div class="import-empty">${row?.competition ? '이 기간의 공급국별 자료를 확인하지 못했어요.' : imports.meta.competitionStatus === 'complete' ? '조회한 최신 연도의 공급국별 금액을 확인하지 못했어요. 미확인을 0으로 간주하지 않습니다.' : '이 국가·제품군의 경쟁국 자료는 아직 수집되지 않았어요. 전체 수입액과 점유율은 별도로 확인한 자료입니다.'}${row?.competition?.year > state.end ? ` 수집된 경쟁국 자료는 ${row.competition.year}년입니다. 종료 연도를 변경하면 볼 수 있어요.` : ''}</div>`
  }</section>`;
}
function importCompareRows(rows) {
  const vals = rows.map((r) => importMetrics(importSeries(r.country), state.start, state.end));
  return (
    `<tr class="import-divider"><td colspan="${rows.length + 1}">상대국 수입시장 · ${state.end}년 · 백만 USD</td></tr>` +
    [
      ['전체 수입액', 'last', millions],
      ['수입시장 연평균 성장률', 'cagr', pct],
      ['한국산 수입액', 'korea', millions],
      ['한국산 점유율', 'share', sharePct],
      ['점유율 변화', 'shareChange', pp],
    ]
      .map(
        ([label, key, fmt]) =>
          `<tr><td>${label}</td>${vals.map((m, i) => `<td>${fmt(m[key])}${key === 'last' ? `<small class="basis-note">${importSeries(rows[i].country)?.basis || ''}</small>` : ''}</td>`).join('')}</tr>`,
      )
      .join('') +
    `<tr><td>점유율 확인 데이터</td>${vals.map((m) => `<td>${m.shares.slice(YEARS.indexOf(state.start), YEARS.indexOf(state.end) + 1).filter((v) => v !== null).length}/${m.expected}개 연도</td>`).join('')}</tr>`
  );
}
function importCompareSuppliers(rows) {
  return `<section class="compare-imports"><h3 class="section-title">주요 경쟁국 · 한국 제외</h3><p class="inline-note">각 국가의 공급국별 최신 수집 연도입니다. 점유율은 해당 연도의 전체 수입액 대비입니다.</p><div class="compare-notes" style="--count:${rows.length}">${rows
    .map((r) => {
      const c = competitionFor(importSeries(r.country));
      return `<article class="supplier-mini"><b>${esc(r.name)}</b><small>${c ? `${c.year}년 · ${c.basis}${c.year !== state.end ? ' · 선택 종료 연도와 다름' : ''}` : '이 기간 경쟁국 자료 미확인'}</small>${
        c
          ? c.top
              .slice(0, 3)
              .map(
                (s) =>
                  `<div>${esc(supplierName(s.country))} · ${sharePct(c.world > 0 ? s.value / c.world : null)}</div>`,
              )
              .join('')
          : ''
      }</article>`;
    })
    .join('')}</div></section>`;
}
function importMethod() {
  return `<h3 class="section-title">상대국 수입 자료</h3><div class="method-grid"><div class="method-box"><h3>실제 수집 범위</h3><p>2021–2025년 · 195개 목적지 조회<br>전체 수입액 확인: ${imports.meta.countries}개 국가·지역<br>2025년 확인: ${imports.meta.countries2025}개<br>수입 원자료 ${integer.format(imports.meta.historyRecords)}행 · 공급국별 원자료 ${integer.format(imports.meta.supplierRecords)}행<br>경쟁국 자료: ${imports.meta.competitionCountries}/${imports.meta.countries}개 국가·지역 수집<br>공급국 금액 확인: ${imports.meta.competitionPairs}/${imports.meta.pairs}개 국가·제품군<br>${imports.meta.competitionStatus === 'complete' ? '관측 수입국 전체의 공급국별 조회 완료' : '공식 API 조회 할당량 도달로 일부 국가 미수집'}</p></div><div class="method-box"><h3>점유율과 경쟁국</h3><p>한국산 점유율 = 상대국의 한국산 수입 ÷ 상대국의 세계 수입<br>같은 보고국·HS·연도·수입 신고액으로 계산합니다.<br>점유율 변화는 퍼센트포인트(pp)입니다.<br>경쟁국은 국가·지역별 수입액 순이며 한국은 별도로 표시합니다. 기타 아시아(UN 표기)는 원자료 구분을 유지합니다.</p></div><div class="method-box"><h3>연도와 결측값</h3><p>경쟁국은 보고국의 최신 수집 연도 기준이며 연도를 표시합니다. 선택 종료 연도보다 미래 자료는 사용하지 않습니다. 이전 연도 경쟁국을 참고하더라도 선택 연도의 수입액·점유율을 채우지 않습니다.</p></div><div class="method-box"><h3>금액 기준</h3><p>국가·제품군별 5개년은 CIF로 통일하고, 불가능하면 FOB로 통일합니다. 전체 수입액과 한국·경쟁국 수입액에 같은 기준을 적용합니다. 기준 금액이 없으면 미확인으로 둡니다. 수출 FOB와 직접 나눠 점유율을 계산하지 않습니다. 500행에 도달한 API 응답은 쿼리를 나눠 다시 수집합니다. 국가 미분류·동일 기준 금액 미확인 수입은 분모에 포함하고 경쟁국 순위에서는 제외합니다.</p><a href="https://uncomtrade.org/docs/trade-valuation/" target="_blank" rel="noopener noreferrer">UN 금액 기준 안내 ↗</a></div></div>`;
}
function downloadImports() {
  const text = makeImportCSV(importRows(), product(), state.start, state.end),
    blob = new Blob([text], { type: 'text/csv;charset=utf-8;' }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `kfood-imports-${state.product}-${state.start}-${state.end}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('전체 수입시장 비교표를 내려받았어요.');
}

function marketAnalysis() {
  return analyzeCurrentMarket(state);
}
function scoreRows() {
  return marketAnalysis().rows;
}
function decisionRows() {
  return recommendationRows(scoreRows());
}
function scorePeriod() {
  const r = scoreRows()[0];
  return `경제 ${r.economyStart}–${r.economyEnd} · 수입 ${state.start}–${state.end}`;
}
function scoreMethodText() {
  return `<div class="score-explainer"><p><strong>추천: 관측 근거 지수 · observed-review-v2.</strong> 구매력(2항목), 수입시장(2), 한국산 성과(4), 문화·소비(3)의 네 영역을 기본 25%씩 반영합니다. ${scorePeriod()}. 소비는 선택 기간 중 2024년까지, 문화는 종료 연도 이하의 2025년 조사입니다.</p><p><a href="https://data.worldbank.org/indicator/NE.CON.PRVT.PP.KD" target="_blank" rel="noopener noreferrer">World Bank 구매력 원자료 ↗</a> · 무역 UN Comtrade · 문화 KOFICE · 소비 WINA</p></div>`;
}
function priorityDetail(r) {
  const p = r.priority;
  return `<section class="score-detail"><h3>관측 근거 지수 ${pointsText(p.index)} · ${p.observed}/11항목</h3><p>${p.strong.length ? esc(p.strong.join(' · ')) + ' 강점' : '후보 강점 조건 미충족'}${p.cultureDemand ? ' · 문화 관심과 소비 증가 동반' : ''}</p><p class="inline-note">${scorePeriod()} · 문화 ${r.culture?.observationYear ?? '미확인'} · 소비 ${r.recommendation.demandStart}–${r.recommendation.demandEnd}</p><div class="table-scroll"><table class="source-table"><thead><tr><th>지표</th><th>원수치</th><th>백분위</th><th>실효 비중</th></tr></thead><tbody>${Object.entries(
    INPUT_LABELS,
  )
    .map(
      ([k, label]) =>
        `<tr><td>${label}</td><td>${priorityRaw(k, p.raw[k])}</td><td>${pointsText(p.points[k])}</td><td>${Number.isFinite(p.effectiveWeights[k]) ? (p.effectiveWeights[k] * 100).toFixed(2) + '%' : '미반영'}</td></tr>`,
    )
    .join(
      '',
    )}</tbody></table></div><div class="table-scroll"><table class="source-table"><thead><tr><th>점검 연도</th><th>한국산 수입 USD</th><th>한국발 수출 USD</th><th>신고액 점검</th></tr></thead><tbody>${p.quality.checks.map((c) => `<tr><td>${c.year}</td><td>${Number.isFinite(c.importValue) ? integer.format(c.importValue) : '미확인'}</td><td>${Number.isFinite(c.exportValue) ? integer.format(c.exportValue) : '미확인'}</td><td>${c.status === 'missing' ? '교차 확인 미완료' : c.ratio === null ? (c.status === 'review' ? '한쪽만 0 · 보류' : '양쪽 0') : `${c.ratio.toFixed(2)}배 · ${c.status === 'review' ? '해당 변화 보류' : '점검 기준 미만'}`}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function priorityRaw(k, v) {
  if (!Number.isFinite(v)) return '미확인';
  if (['economyCagr', 'marketCagr', 'demandGrowth'].includes(k)) return pct(v);
  if (k.startsWith('share')) return v.toFixed(3) + '%p';
  if (k.startsWith('korea')) return v.toFixed(3);
  if (['culture', 'intention'].includes(k)) return v.toFixed(1) + '%';
  return integer.format(Math.round(v)) + (k === 'marketLevel' ? ' USD' : ' 국제달러/인');
}
function filteredScoreRows() {
  const q = state.scoreSearch.trim().toLocaleLowerCase();
  return scoreRows().filter(
    (r) => !q || `${r.name} ${r.english} ${r.iso}`.toLocaleLowerCase().includes(q),
  );
}
function scoreStatus(r) {
  return r.score !== null
    ? `${r.recommendation.positionLabel} · ${STAGE_LABELS[r.stage]}${r.warnings.length ? ' · ' + r.warnings.join(' · ') : ''}`
    : `평가 보류 · ${r.missing.length ? r.missing.join(' · ') + ' 미확인' : '비교국 2개 미만'}`;
}
function scoreValue(r, i) {
  return i === 0
    ? Number.isFinite(r.metrics.economyLevel)
      ? integer.format(Math.round(r.metrics.economyLevel))
      : '—'
    : i === 2
      ? millions(r.metrics.last)
      : pct(r.metrics[OPPORTUNITY_CRITERIA[i].key]);
}
function scoreCell(r, i) {
  return `<span>${scoreValue(r, i)}</span><small>${r.points[i] === null ? '점수 보류' : pointsText(r.points[i]) + '점'}</small>`;
}
function renderScores() {
  const all = scoreRows(),
    eligible = all.filter((r) => r.score !== null),
    rows = filteredScoreRows(),
    pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.scorePage = Math.max(1, Math.min(state.scorePage, pages));
  const first = (state.scorePage - 1) * PAGE_SIZE;
  $('scoreScope').textContent =
    `${product().name} · ${scorePeriod()} · ${eligible.length}/${all.length}개 국가·지역 비교`;
  $('scoreMethod').innerHTML = scoreMethodText();
  renderDecision(eligible);
  $('scoreRows').innerHTML = rows.length
    ? rows
        .slice(first, first + PAGE_SIZE)
        .map((r) => {
          const chosen = state.selected.includes(r.country);
          return `<tr class="${chosen ? 'selected' : ''}"><td class="score-rank">${r.rank ?? '—'}</td><td><button class="country-button" data-detail="${r.country}">${flag(r)}<span>${esc(r.name)}<small>${esc(r.english)}</small></span></button></td><td class="score-total">${pointsText(r.score)}<small>${r.sensitivity ? `민감도 ${r.sensitivity.min}–${r.sensitivity.max}위` : '평가 보류'}</small></td>${[0, 1, 2, 3].map((i) => `<td class="score-component">${scoreCell(r, i)}</td>`).join('')}<td class="score-data"><span class="data-badge ${r.valid === 4 ? '' : 'partial'}">${r.valid}/4 지표</span><small>${esc(scoreStatus(r))}</small></td><td><button class="compare-add ${chosen ? 'chosen' : ''}" data-toggle="${r.country}" aria-label="${esc(r.name)} 점수 비교${chosen ? '에서 제거' : '에 추가'}" aria-pressed="${chosen}">${chosen ? '✓' : '+'}</button></td></tr>`;
        })
        .join('')
    : '<tr><td colspan="9"><div class="empty-state">검색 조건에 맞는 국가가 없어요.</div></td></tr>';
  $('scorePaginationText').textContent = rows.length
    ? `${first + 1}–${Math.min(first + PAGE_SIZE, rows.length)} / ${rows.length}개 · 비교집단 ${eligible.length}개 고정`
    : '0개 국가·지역';
  $('scorePageText').textContent = `${state.scorePage} / ${pages}`;
  $('scorePrev').disabled = state.scorePage === 1;
  $('scoreNext').disabled = state.scorePage === pages;
}
function cultureCard(r) {
  const c = r.culture;
  return `<article class="culture-card"><h3>${flag(r)}${esc(r.name)}</h3>${c ? `<div class="culture-intent"><span>한국 식품 구매의향</span><strong>${c.foodPurchaseIntentionPct.toFixed(1)}<small>%</small></strong></div><div class="culture-meter"><i style="width:${c.foodPurchaseIntentionPct}%"></i></div><div class="culture-shares"><span>드라마 소비비중 <b>${c.dramaConsumptionSharePct.toFixed(1)}%</b></span><span>음악 소비비중 <b>${c.musicConsumptionSharePct.toFixed(1)}%</b></span></div><p class="inline-note">한국 식품 전체 · 한국 콘텐츠 경험자 ${integer.format(c.surveySample)}명 · ${c.observationYear}년</p><a href="${evidence.meta.cultureUrl}#page=${c.purchasePdfPage}" target="_blank" rel="noopener noreferrer">국가별 조사표 ↗</a>` : '<p class="culture-empty">조사 자료 없음</p>'}</article>`;
}
function recommendationBrief(code) {
  const r = scoreRows().find((r) => r.country === code),
    copy = recommendationCopy(r, state, aiExplanations, demand, marketAnalysis().selection.top),
    n = r.recommendation;
  const watch = [...r.priority.negative];
  if (r.priority.quality.recentBlocked || r.priority.quality.periodBlocked)
    watch.push('양국 신고액 차이로 한국산 성과 일부 판단 보류');
  if (r.priority.missing.includes('intention')) watch.push('한국 식품 구매의향 미확인');
  if (r.priority.missing.includes('demandGrowth')) watch.push('제품 소비 성장 미확인');
  const latest = latestDemandEvidence(latestDemand, state.product, code, state.end);
  return `<section class="recommendation-brief"><h3>${n.eligible ? '추천 이유' : '시장 검토'}</h3><p class="brief-reason">${esc(copy.detail || copy.sentence)}</p><div class="brief-facts">${copy.facts.map((f) => `<div><span>${esc(f.label)}</span><strong>${esc(f.value)}</strong><small>${esc(f.period)} · ${esc(f.source)}</small></div>`).join('')}</div>${watch.length ? `<div class="brief-watch"><b>함께 볼 점</b><ul>${[...new Set(watch)].map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}${latest ? `<div class="latest-demand"><b>2025 소비 업데이트${latest.combined ? ' · 중국·홍콩 합산' : ''}</b><p>즉석면 전체 <strong>${latest.value.toFixed(1)}억 식</strong> · 전년 대비 <strong>${pct(latest.yoy)}</strong></p><small>2024 ${latest.previous.toFixed(1)} → 2025 ${latest.value.toFixed(1)}억 식 · WINA 추정</small><a href="${esc(latest.url)}" target="_blank" rel="noopener noreferrer">원표 ↗</a></div>` : ''}</section>`;
}
function candidateReviewDetail(code) {
  const r = scoreRows().find((r) => r.country === code),
    v = r.review,
    n = r.recommendation;
  const raw = (n) =>
    Number.isFinite(n)
      ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n)
      : '미확인';
  return `<section class="candidate-review"><div class="eyebrow">KOREAN POSITION · EVIDENCE REVIEW</div><h3 class="review-badge review-${v.tone}">${esc(n.positionLabel)}</h3><p>${esc(n.positionSummary)}</p><div class="candidate-facts"><p><b>소비 근거</b>${esc(n.demandText)}<small>${esc(n.intentionText)}</small></p><p><b>선정 조건</b>${n.eligible ? '우선 검토 후보 · ' + esc(r.priority.strong.join(' · ')) : '후보 강점 조건 미충족'}</p><p><b>성장 지속성</b>한국산 수입 증가 ${n.growthPeriods}/${n.intervals}개 구간 · 순증가액 ${millions(v.korea.delta)}백만 USD</p></div><p class="review-facts">${esc(v.recent)}</p><p class="review-facts">${esc(v.period)}</p>${n.reportingComparison ? `<p class="review-facts">${esc(n.reportingComparison)}</p>` : ''}<div class="table-scroll"><table class="source-table"><thead><tr><th>연도</th><th>전체 수입 USD</th><th>한국산 수입 USD</th><th>한국산 점유율</th><th>한국발 수출 USD</th></tr></thead><tbody>${v.annual.map((a) => `<tr><td>${a.year}</td><td>${raw(a.world)}</td><td>${raw(a.korea)}</td><td>${shareText(a.share)}</td><td>${raw(a.export)}</td></tr>`).join('')}</tbody></table></div><p>${n.demandSource ? `<a href="${esc(n.demandSource)}" target="_blank" rel="noopener noreferrer">즉석면 소비 원자료 ↗</a>` : ''}</p><p class="inline-note">수입 ${esc(r.basis || '기준 미확인')} · 한국발 수출 FOB</p><p>${v.mirror.importSource ? `<a href="${esc(v.mirror.importSource)}" target="_blank" rel="noopener noreferrer">${state.end} 수입 원자료 ↗</a>` : ''} · ${v.mirror.exportSource ? `<a href="${esc(v.mirror.exportSource)}" target="_blank" rel="noopener noreferrer">${state.end} 수출 원자료 ↗</a>` : ''}</p></section>`;
}
function scoreDetail(code) {
  const r = scoreRows().find((r) => r.country === code);
  return `${priorityDetail(r)}<section class="score-detail"><div class="score-detail-heading"><h3>경제·수입시장 기회 점수</h3><strong>${pointsText(r.score)}<small>${r.score === null ? '평가 보류' : ' / 100'}</small></strong></div><p class="inline-note">${scorePeriod()} · ${r.peerCount}개 비교 · 각 지표 25% · ${r.rank === null ? '순위 보류' : r.rank + '위'}</p><div class="table-scroll"><table class="source-table"><thead><tr><th>지표</th><th>원수치</th><th>상대점수</th></tr></thead><tbody>${OPPORTUNITY_CRITERIA.map((c, i) => `<tr><td>${c.label}</td><td>${scoreValue(r, i)}${i === 0 ? ' 국제달러/인' : i === 2 ? ' 백만 USD · ' + (r.basis || '미확인') : ''}</td><td>${pointsText(r.points[i])}</td></tr>`).join('')}</tbody></table></div><p class="inline-note">한국산 점유율 ${shareText(r.metrics.share)} · 변화 ${pp(r.metrics.shareChange)} · 수입 증가 ${r.growingYears ?? '—'}/${state.end - state.start}개 구간 · 증가액 ${millions(r.review.korea.delta)}백만 USD</p>${r.culture ? `<h3 class="section-title">한국 식품 구매의향 · 참고 조사</h3>${cultureCard(r)}` : ''}</section>`;
}
function scoreCompareRows(rows) {
  const index = new Map(scoreRows().map((r) => [r.country, r]));
  return (
    `<tr class="import-divider"><td colspan="${rows.length + 1}">경제·수입시장 기회 점수 · 각 25% · ${scorePeriod()}</td></tr>` +
    [
      ['동일 가중치 점수', (r) => pointsText(r.score)],
      ...OPPORTUNITY_CRITERIA.map((c, i) => [c.label + ' 점수', (r) => pointsText(r.points[i])]),
      ['시장유형', (r) => STAGE_LABELS[r.stage]],
      ['관측 근거 지수', (r) => pointsText(r.priority.index)],
      [
        '평가 범위',
        (r) =>
          `${r.priority.observed}/11항목 · 미확인 ${r.priority.missing.map((k) => INPUT_LABELS[k]).join(', ') || '없음'}`,
      ],
      [
        '추천 조건',
        (r) => (r.recommendation.eligible ? esc(r.priority.strong.join(' · ')) : '미충족'),
      ],
      ['반대 근거·품질', (r) => esc(r.recommendation.caution)],
      ['소비 근거', (r) => esc(r.recommendation.demandText)],
      ['한국산 입지 검토', (r) => esc(r.recommendation.positionLabel)],
      ['한국산 수입 전년비', (r) => pct(r.review.korea.yoy)],
      ['한국산 점유율 전년 변화', (r) => pp(r.review.shareYoy)],
      ['한국산 수입 기간 증가율', (r) => pct(r.review.korea.growth)],
      [
        '가중치별 순위 범위',
        (r) => (r.sensitivity ? `${r.sensitivity.min}–${r.sensitivity.max}위` : '—'),
      ],
      [
        '한국 식품 구매의향 · 2025 조사',
        (r) => (r.culture ? r.culture.foodPurchaseIntentionPct.toFixed(1) + '%' : '미확인'),
      ],
      ['필수 지표 확인', (r) => `${r.valid}/4`],
    ]
      .map(
        ([label, fmt]) =>
          `<tr><td>${label}</td>${rows.map((r) => `<td>${fmt(index.get(r.country))}</td>`).join('')}</tr>`,
      )
      .join('')
  );
}
function downloadScores() {
  const rows = filteredScoreRows(),
    text = makeRecommendationCSV(rows, product(), state.start, state.end);
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `kfood-opportunity-${state.product}-${state.start}-${state.end}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify(`${rows.length}개 국가·지역의 점수와 근거를 내려받았어요.`);
}

function logisticsFor(code) {
  return context.logistics
    .filter((r) => r.country === code && r.year <= state.end)
    .sort((a, b) => b.year - a.year)[0];
}
function renderEvidence() {
  const observed = context.logistics.filter((r) => r.year === 2024).length;
  $('logisticsCoverage').textContent =
    `LPI 2.0 · 2023–2024년 관측. 기존 195개 시장 중 ${observed}개 시장의 2024년 값을 확보했습니다.`;
  $('logisticsPreview').innerHTML =
    scoreRows()
      .filter((r) => r.score !== null)
      .slice(0, 3)
      .map((r) => {
        const v = logisticsFor(r.country);
        return `<tr><td><button class="detail-product" data-detail="${r.country}">${esc(r.name)} ↗</button></td><td>${v?.year ?? '미확인'}</td><td>${days(v?.meanDays)}</td><td>${days(v?.medianDays)}</td><td>${esc(v?.sampleBand || '미확인')}</td></tr>`;
      })
      .join('') || '<tr><td colspan="5">점수 비교 대상이 없습니다.</td></tr>';
}
function logisticsDetail(code) {
  const v = logisticsFor(code);
  return `<section class="logistics-detail"><h3>물류 참고 지표</h3><p class="inline-note">World Bank LPI 2.0</p>${v ? `<div class="detail-summary"><div class="mini-stat">평균 항만 체류일<strong>${days(v.meanDays)}</strong>${v.year}년 관측</div><div class="mini-stat">중앙 항만 체류일<strong>${days(v.medianDays)}</strong>${v.year}년 관측</div><div class="mini-stat">관측 수 구간<strong>${esc(v.sampleBand)}</strong>출처에 공개된 구간</div></div>` : '<div class="import-empty">자료 없음</div>'}<a href="${context.meta.sourceUrl}" target="_blank" rel="noopener noreferrer">원자료·산출 방법 확인 ↗</a></section>`;
}
function logisticsCompareRows(rows) {
  return (
    `<tr class="import-divider"><td colspan="${rows.length + 1}">물류 참고 지표</td></tr>` +
    [
      ['평균 수입 항만 체류일', 'meanDays'],
      ['중앙 수입 항만 체류일', 'medianDays'],
    ]
      .map(
        ([label, key]) =>
          `<tr><td>${label}</td>${rows
            .map((r) => {
              const v = logisticsFor(r.country);
              return `<td>${days(v?.[key])}<small>${v ? v.year + '년' : '미확인'}</small></td>`;
            })
            .join('')}</tr>`,
      )
      .join('')
  );
}

function renderDecision(eligible) {
  const { candidates: filtered, top, ties } = marketAnalysis().selection;
  $('decisionHeading').textContent =
    `유망시장 · ${top.length === 3 ? 'TOP 3' : top.length + '개 후보'}`;
  $('decisionScope').textContent =
    `${product().name} · ${scorePeriod()} · ${eligible.length}개 시장 비교`;
  $('compareTop3').disabled = top.length < 2;
  $('candidateTies').innerHTML = ties.length
    ? `<details><summary>공동 ${top.at(-1).recommendationRank}위 후보 더 보기 (${ties.length}개)</summary>${ties.map((r) => `<button class="detail-product" data-detail="${r.country}">${esc(r.name)} · ${pointsText(r.priority.index)} ↗</button>`).join('')}<p>동점은 같은 순위이며 표시 순서는 우열을 뜻하지 않습니다.</p></details>`
    : '';
  $('compareTop3').textContent = `${top.length}개 후보 비교 ↗`;
  $('scoreLeaders').innerHTML =
    top
      .map((r, i) => {
        const p = r.priority,
          n = r.recommendation,
          copy = recommendationCopy(
            r,
            state,
            aiExplanations,
            demand,
            marketAnalysis().selection.top,
          );
        return `<article class="market-pick pick-${i}" style="--country-color:${colors[i]}"><div class="pick-header"><span class="rank-chip">0${r.recommendationRank}</span><button class="pick-country" data-detail="${r.country}">${flag(r)}<span>${esc(r.name)}<small>${STAGE_LABELS[r.stage]}</small></span></button><div class="pick-score">${pointsText(p.index)}<small>추천 점수</small></div></div>${copy.card ? `<div class="pick-reason pick-outline"><h4>${esc(copy.card.title)}</h4><ul>${copy.card.strengths.map((text) => `<li>${esc(text)}</li>`).join('')}</ul>${copy.card.caution ? `<p class="pick-watch"><span>확인할 점</span>${esc(copy.card.caution)}</p>` : ''}</div>` : `<p class="pick-reason">${esc(copy.sentence)}</p>`}<div class="pick-metrics">${copy.facts.map((f) => `<div><span>${esc(f.label)}</span><strong>${esc(f.value)}</strong><small>${esc(f.period)}</small></div>`).join('')}</div><div class="pick-bottom"><span>자료 ${p.observed}/11</span><button data-detail="${r.country}">상세 분석 ↗</button></div></article>`;
      })
      .join('') ||
    '<div class="import-empty">이 기간에는 후보 조건을 충족하는 시장이 없습니다. 기간을 변경해 확인하세요.</div>';
  const plotted = [
    ...filtered,
    ...eligible.filter((r) => !filtered.some((x) => x.country === r.country)),
  ];
  $('opportunityChart').innerHTML = opportunityPlot(plotted);
  renderHistory(top);
  $('contributionChart').innerHTML = top
    .map((r) => {
      const p = r.priority;
      return `<div class="contribution-row"><div><span>${esc(r.name)} <small>${p.observed}/11항목</small></span><strong>${pointsText(p.index)}</strong></div><div class="contribution-track">${RECOMMENDATION_GROUPS.map(
        (g, j) => {
          const w = g.keys.reduce((s, k) => s + (p.effectiveWeights[k] || 0), 0),
            value = (p.domainPoints[j] ?? 0) * w;
          return `<span class="component-${j}" style="width:${value}%" title="${g.label}: ${value.toFixed(1)}점 · 비중 ${(w * 100).toFixed(1)}%"><span>${value ? value.toFixed(1) : ''}</span></span>`;
        },
      ).join(
        '',
      )}</div><small>${RECOMMENDATION_GROUPS.map((g, j) => `${g.label} ${g.keys.filter((k) => Number.isFinite(p.points[k])).length}/${g.keys.length}`).join(' · ')}</small></div>`;
    })
    .join('');
  const maxRank = Math.max(3, ...top.map((r) => r.priority.sensitivity.max));
  $('sensitivityChart').innerHTML = top
    .map((r) => {
      const p = r.priority,
        v = p.sensitivity;
      return `<div class="sensitivity-row"><span>${esc(r.name)}</span><div class="sensitivity-track"><i style="left:${((v.min - 1) / (maxRank - 1)) * 100}%;width:${((v.max - v.min) / (maxRank - 1)) * 100}%"></i><b style="left:${((p.rank - 1) / (maxRank - 1)) * 100}%" title="기본 ${p.rank}위"></b></div><strong>${v.min}–${v.max}위</strong><small>TOP3 ${v.top3Count}/9회</small></div>`;
    })
    .join('');
  renderConsumer(top);
  renderVolume(top);
}

function renderConsumer(top) {
  const panel = $('consumerEvidence');
  panel.hidden = state.product !== demand.meta.product || top.length === 0;
  document.querySelector('[data-jump=consumerEvidence]').hidden = panel.hidden;
  if (panel.hidden) return;
  const years = demand.meta.years.filter((y) => y >= state.start && y <= state.end),
    lastYear = years.at(-1);
  const views = top.map((r, i) => ({
    window: demandWindow(demand, state.product, r.country, state.start, state.end),
    country: r,
    color: colors[i],
  }));
  const label = (v) => (v.window?.combined ? `${v.country.name} · 중국·홍콩 합산` : v.country.name);
  const valid = views.filter((v) => v.window?.last.year === lastYear);
  $('consumerScope').textContent = `${years[0]}–${lastYear} · 모든 원산지 · 현지 생산 포함`;
  $('consumerContent').innerHTML =
    `<div class="demand-comparison"><section><h3>${lastYear} 소비량</h3><p class="chart-unit">백만 식 · 막대 길이 = 실제 소비량</p>${demandComparisonChart(valid)}</section><section><h3>연도별 소비량 추이</h3><p class="chart-unit">백만 식 · 국가별 세로축 규모 다름</p>${demandTrendChart(views, years)}</section></div><div class="table-scroll"><table class="source-table demand-values"><caption>연도별 소비량 · 백만 식</caption><thead><tr><th>국가·지역</th>${years.map((y) => `<th>${y}</th>`).join('')}</tr></thead><tbody>${views
      .map(
        (v) =>
          `<tr><td><span class="demand-dot" style="background:${v.color}"></span>${esc(label(v))}</td>${years
            .map((y) => {
              const value = v.window?.observations.find((o) => o.year === y)?.value;
              return `<td>${Number.isFinite(value) ? integer.format(value * 100) : '—'}</td>`;
            })
            .join('')}</tr>`,
      )
      .join('')}</tbody></table></div>${
      views.some((v) => !v.window)
        ? `<p class="inline-note">${views
            .filter((v) => !v.window)
            .map((v) => esc(v.country.name))
            .join(' · ')}: 소비 자료 미확인</p>`
        : ''
    }<p class="demand-rounding-note">소비량은 천만 식 단위 공표값. 작은 시장의 증가율은 소비량과 함께 확인하세요.</p><details class="consumer-footnote"><summary>소비 기준·출처</summary><p>즉석면 전체 추정 소비량이며 한국산 판매량이 아닙니다. 조제 면류 수입 통계보다 좁은 제품 범위입니다. 성장률은 같은 시작·종료 연도의 공표값으로 계산하고, 반올림에 따른 성장률 범위는 국가 상세에서 확인할 수 있습니다. 추천 점수는 공표값 계산을 유지합니다. 중국·홍콩은 합산 자료입니다. 일부 국가의 2025년 자료는 국가 상세에서 별도로 확인할 수 있습니다.</p><a href="${demand.meta.sourceUrl}" target="_blank" rel="noopener noreferrer">WINA · NISSIN 재수록 원표 ↗</a></details>`;
}

function volumeRows() {
  return getVolumeRows(data, imports, state);
}
const tons = (n) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n / 1000)
    : '—';
function renderVolume(top) {
  const all = volumeRows(),
    valid = all.filter((r) => r.volume.classification !== 'withheld');
  const count = (key) => all.filter((r) => r.volume.classification === key).length;
  $('volumeScope').textContent =
    `${product().name} · ${state.start}–${state.end} 양끝 연도 비교 · ${valid.length}/${all.length}개 시장 비교 가능 · ${all.length - valid.length}개 보류`;
  $('volumeSummary').innerHTML = [
    ['금액·물량 동반 증가', count('both_up'), 'both_up'],
    ['금액 증가·물량 비증가', count('value_only'), 'value_only'],
    ['그 외 비교 가능', count('weight_only') + count('neither_up'), 'other'],
    ['추정·누락 등 비교 보류', count('withheld'), 'withheld'],
  ]
    .map(
      ([label, n, key]) =>
        `<div class="volume-stat ${key}"><strong>${n}<small>개 시장</small></strong><span>${label}</span></div>`,
    )
    .join('');
  const lookup = new Map(all.map((r) => [r.country, r])),
    verifiedTop = top.filter(
      (r) => lookup.get(r.country).volume.classification !== 'withheld',
    ).length;
  $('volumeTopNote').textContent = top.length
    ? verifiedTop === 0
      ? `현재 TOP ${top.length} 모두 중량 비교를 보류했어요.`
      : `${verifiedTop}/${top.length}개국 비교 가능`
    : '이 조건의 TOP 3가 없습니다.';
  $('volumeTopRows').innerHTML =
    top
      .map((r) => {
        const v = lookup.get(r.country).volume;
        return `<tr><td><button class="detail-product" data-detail="${r.country}">${esc(r.name)} ↗</button><small class="volume-status">${esc(VOLUME_LABELS[v.classification])}</small></td><td>${pct(v.amount.cagr)}</td><td>${pct(v.weight.cagr)}<small class="volume-status">${esc(v.issues.join(' · '))}${v.interiorExcluded ? ` · 중간 ${v.interiorExcluded}개 연도 추정·누락 등 제외` : ''}</small></td></tr>`;
      })
      .join('') || '<tr><td colspan="3">비교 대상 없음</td></tr>';
  $('volumeChart').innerHTML = volumePlot(valid.slice(0, 20));
  renderVolumeTable(all);
}
function renderVolumeTable(rows = volumeRows()) {
  const q = state.volumeSearch.trim().toLocaleLowerCase(),
    a = YEARS.indexOf(state.start),
    b = YEARS.indexOf(state.end);
  $('volumeRows').innerHTML =
    rows
      .filter((r) => !q || `${r.name} ${r.english} ${r.iso}`.toLocaleLowerCase().includes(q))
      .map((r) => {
        const v = r.volume;
        return `<tr><td><button class="detail-product" data-detail="${r.country}">${esc(r.name)} ↗</button></td><td>${pct(v.amount.cagr)}</td><td>${pct(v.weight.cagr)}</td><td>${state.start}: ${tons(v.weights[a])}<br>${state.end}: ${tons(v.weights[b])}</td><td><span style="color:${volumeColor(v.classification)}">${esc(VOLUME_LABELS[v.classification])}</span><small class="volume-status">${esc(v.issues.join(' · '))}${v.interiorExcluded ? ` · 중간 ${v.interiorExcluded}개 연도 추정·누락 등 제외` : ''}</small></td></tr>`;
      })
      .join('') || '<tr><td colspan="5">검색 조건에 맞는 국가가 없습니다.</td></tr>';
}

function volumeDetail(code) {
  const row = importSeries(code),
    v = volumeMetrics(row, state.start, state.end);
  return `<section class="volume-detail"><h3>금액·물량 교차 검증</h3><p class="inline-note">금액: 백만 USD · ${esc(row?.basis || '기준 미확인')} / 순중량: 톤</p><p class="volume-detail-verdict">${VOLUME_LABELS[v.classification]} · 금액 ${pct(v.amount.cagr)} / 중량 ${pct(v.weight.cagr)}</p><div class="table-scroll"><table class="source-table"><thead><tr><th>연도</th><th>수입액 · 백만 USD</th><th>원본 순중량 · 톤</th><th>중량 상태</th><th>출처</th></tr></thead><tbody>${YEARS.filter(
    (y) => y >= state.start && y <= state.end,
  )
    .map((year) => {
      const i = YEARS.indexOf(year),
        status = row?.worldNetStatus?.[i] || 'missing';
      return `<tr><td>${year}</td><td>${millions(row?.world?.[i])}</td><td>${tons(row?.worldNetKg?.[i])}</td><td>${WEIGHT_LABELS[status]}</td><td>${row?.sources?.[i] ? `<a href="${esc(row.sources[i])}" target="_blank" rel="noopener noreferrer">UN Comtrade ↗</a>` : '미확인'}</td></tr>`;
    })
    .join('')}</tbody></table></div></section>`;
}
function volumeCompareRows(rows) {
  return `<tr class="import-divider"><td colspan="${rows.length + 1}">수입 물량 비교</td></tr><tr><td>순중량 연평균 성장률</td>${rows
    .map((r) => {
      const v = volumeMetrics(importSeries(r.country), state.start, state.end);
      return `<td>${pct(v.weight.cagr)}<small>${VOLUME_LABELS[v.classification]} · ${esc(v.issues.join(' · '))}${v.interiorExcluded ? ` · 중간 ${v.interiorExcluded}개 연도 제외` : ''}</small></td>`;
    })
    .join('')}</tr>`;
}
function downloadVolume() {
  const text = makeVolumeCSV(volumeRows(), product(), state.start, state.end),
    blob = new Blob([text], { type: 'text/csv;charset=utf-8;' }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `kfood-volume-${state.product}-${state.start}-${state.end}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('추정 표시와 보류 사유를 포함한 전체 물량 비교표를 내려받았어요.');
}

function surveyMethod() {
  return `<h3>도시별 한식 간편식 소비</h3><p><a href="${survey.meta.sourceUrl}" target="_blank" rel="noopener noreferrer">농림축산식품부 원자료 ↗</a></p>`;
}
function surveyCard(row) {
  const country = countries.get(row.country),
    monthly = monthlyUse(row);
  const formats = [
    ['rth', '데워 먹기'],
    ['rte', '바로 먹기'],
    ['rtc', '조리하기'],
  ];
  return `<article class="survey-card"><div class="survey-city"><h3>${esc(row.city)}</h3><span>${esc(country?.name || '대만')}</span></div><div class="survey-stat"><span>이용 경험</span><strong>${row.ever.toFixed(1)}<small>%</small></strong><div class="survey-meter"><i style="width:${row.ever}%"></i></div></div><div class="survey-stat monthly"><span>월 1회 이상 이용</span><strong>${monthly.toFixed(1)}<small>%</small></strong><div class="survey-meter"><i style="width:${monthly}%"></i></div></div><p class="survey-base">인지자 ${row.aware}명 기준</p><div class="survey-format-title">주 구매 방식 <small>이용 경험자 ${row.users}명 기준</small></div><div class="survey-format" role="img" aria-label="${esc(row.city)} 구매 방식: ${formats.map(([key, label]) => `${label} ${row[key].toFixed(1)}%`).join(', ')}">${formats.map(([key, label]) => `<span class="format-${key}" style="flex:${row[key]}" title="${label} ${row[key].toFixed(1)}%"></span>`).join('')}</div><div class="survey-format-values">${formats.map(([key, label]) => `<span><i class="format-${key}"></i>${label}<b>${row[key].toFixed(1)}%</b></span>`).join('')}</div></article>`;
}
function surveyDetail(code) {
  const rows = surveyCities(survey, code, state.end);
  if (!rows.length) return '';
  return `<section class="survey-detail"><div class="detail-heading-line"><h3>현지 한식 간편식 소비</h3><span class="subtle-tag">2025 · 도시 조사</span></div><div class="survey-grid">${rows.map(surveyCard).join('')}</div><p class="inline-note"><a href="${survey.meta.sourceUrl}" target="_blank" rel="noopener noreferrer">원자료 ↗</a></p></section>`;
}

function renderHistory(top) {
  document
    .querySelectorAll('[data-history]')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.history === historyMetric)));
  $('historyUnit').textContent = historyMetric === 'share' ? '한국산 / 전체 수입 · %' : '백만 USD';
  const years = YEARS.filter((y) => y >= state.start && y <= state.end),
    width = 1000,
    height = 250,
    left = 65,
    right = 30,
    up = 20,
    bottom = 35;
  const values = (r) =>
    years.map((year) => {
      const a = r.review.annual.find((x) => x.year === year),
        v = historyMetric === 'share' ? a?.share : a?.[historyMetric];
      return Number.isFinite(v) ? v * (historyMetric === 'share' ? 100 : 1e-6) : null;
    });
  const series = top.map(values),
    max = Math.max(1, ...series.flat().filter(Number.isFinite)) * 1.12;
  const x = (i) => left + (i * (width - left - right)) / Math.max(1, years.length - 1),
    y = (v) => up + (height - up - bottom) * (1 - v / max);
  const label = (v) => (v === null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 1 }));
  $('historyLegend').innerHTML = top
    .map(
      (r, i) =>
        `<button data-detail="${r.country}"><i style="background:${colors[i]}"></i><span>${esc(r.name)}<strong>${label(series[i].at(-1))}${historyMetric === 'share' ? '%' : ''}</strong></span></button>`,
    )
    .join('');
  const grid = Array.from({ length: 5 }, (_, i) => {
    const v = (max * i) / 4;
    return `<path d="M${left} ${y(v)}H${width - right}" stroke="#eeeeee"/><text x="${left - 12}" y="${y(v) + 4}" text-anchor="end">${label(v)}</text>`;
  }).join('');
  const lines = series
    .map((vs, j) => {
      let path = '',
        active = false;
      vs.forEach((v, i) => {
        if (v === null) {
          active = false;
          return;
        }
        path += `${active ? 'L' : 'M'}${x(i)} ${y(v)} `;
        active = true;
      });
      return (
        `<path d="${path}" fill="none" stroke="${colors[j]}" stroke-width="2.5"/>` +
        vs
          .map((v, i) =>
            v === null
              ? ''
              : `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${colors[j]}" stroke="white" stroke-width="2"><title>${esc(top[j].name)} · ${years[i]} · ${label(v)} ${historyMetric === 'share' ? '%' : '백만 USD'}</title></circle>`,
          )
          .join('')
      );
    })
    .join('');
  $('historyChart').innerHTML =
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="후보국 ${historyMetric === 'share' ? '한국산 점유율' : historyMetric === 'korea' ? '한국산 수입' : '전체 수입'} 연도별 추이">${grid}${lines}${years.map((year, i) => `<text x="${x(i)}" y="${height - 8}" text-anchor="middle">${year}</text>`).join('')}</svg>`;
}

mountChat({
  getContext: () => ({
    product: state.product,
    start: state.start,
    end: state.end,
    label: product().name,
  }),
  openCountry: (code) => renderDetail(code),
});
