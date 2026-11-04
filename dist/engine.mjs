export const YEARS = [2021, 2022, 2023, 2024, 2025];
export function metrics(values, start = 2021, end = 2025) {
  const a = YEARS.indexOf(start), b = YEARS.indexOf(end);
  if (a < 0 || b < 0 || a >= b) throw new RangeError('시작 연도는 종료 연도보다 빨라야 합니다.');
  const first = values[a] ?? null, last = values[b] ?? null, prev = values[b-1] ?? null;
  const valid = n => typeof n === 'number' && Number.isFinite(n);
  return {
    first, last,
    delta: valid(first) && valid(last) ? last - first : null,
    growth: valid(first) && first > 0 && valid(last) ? last / first - 1 : null,
    cagr: valid(first) && first > 0 && valid(last) ? (last / first) ** (1 / (end-start)) - 1 : null,
    yoy: valid(prev) && prev > 0 && valid(last) ? last / prev - 1 : null,
    observed: values.slice(a,b+1).filter(valid).length,
    expected: b-a+1,
    lowBase: valid(first) && first < 1_000_000,
  };
}
export function getRows(data, state) {
  const countries = new Map(data.countries.map(c => [c.code, c]));
  const query = (state.search || '').trim().toLocaleLowerCase();
  const rows = data.rows.filter(r => r.product === state.product && r.country !== 0).map(r => ({
    ...r, ...countries.get(r.country), country:r.country, metrics: metrics(r.values,state.start,state.end),
  })).filter(r => {
    if (query && !`${r.name} ${r.english} ${r.iso}`.toLocaleLowerCase().includes(query)) return false;
    if (state.complete && r.metrics.observed !== r.metrics.expected) return false;
    if (state.minimum > 0 && (r.metrics.last === null || r.metrics.last < state.minimum)) return false;
    return true;
  });
  const key = state.sort || 'last';
  rows.sort((a,b) => {
    const x=a.metrics[key], y=b.metrics[key];
    if(x === null && y === null) return a.name.localeCompare(b.name,'ko');
    if(x === null) return 1;
    if(y === null) return -1;
    return y-x || a.name.localeCompare(b.name,'ko');
  });
  return rows;
}
export function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return `"${s.replaceAll('"','""')}"`;
}
export function makeCSV(rows, product, start, end) {
  const header=['HS','제품군','국가·지역',...YEARS.map(y=>`${y}_USD_FOB`),'비교시작','비교종료','증가액_USD','누적증가율','연평균성장률','종료연도_전년비','관측연도수','필요연도수'];
  const body=rows.map(r=>[product.code,product.fullName,r.name,...r.values,start,end,r.metrics.delta,r.metrics.growth,r.metrics.cagr,r.metrics.yoy,r.metrics.observed,r.metrics.expected]);
  return '\uFEFF'+[header,...body].map(row=>row.map(csvCell).join(',')).join('\r\n');
}

// Both operands come from the destination's imports for the same HS and year.
export function importMetrics(row, start=2021, end=2025) {
  const series=row || {world:YEARS.map(()=>null),korea:YEARS.map(()=>null)};
  const shares=YEARS.map((_,i)=>{
    const world=series.world[i], korea=series.korea[i];
    return Number.isFinite(world)&&world>0&&Number.isFinite(korea)&&korea>=0&&korea<=world ? korea/world : null;
  });
  const a=YEARS.indexOf(start), b=YEARS.indexOf(end);
  const market=metrics(series.world,start,end);
  return {...market,korea:series.korea[b],share:shares[b],shareChange:shares[a]!==null&&shares[b]!==null?(shares[b]-shares[a])*100:null,shares};
}
export function getImportRows(exports, imports, state) {
  const index=new Map(imports.rows.filter(r=>r.product===state.product).map(r=>[r.country,r]));
  const query=(state.importSearch||'').trim().toLocaleLowerCase();
  const rows=exports.countries.map(c=>{
    const r=index.get(c.code)||{country:c.code,product:state.product,world:YEARS.map(()=>null),korea:YEARS.map(()=>null),sources:YEARS.map(()=>null)};
    return {...r,...c,country:c.code,metrics:importMetrics(r,state.start,state.end)};
  }).filter(r=>!query||`${r.name} ${r.english} ${r.iso}`.toLocaleLowerCase().includes(query));
  const key=state.importSort||'last';
  return rows.sort((a,b)=>{
    const x=a.metrics[key],y=b.metrics[key];
    if(x===null&&y===null)return a.name.localeCompare(b.name,'ko');
    if(x===null)return 1;if(y===null)return -1;
    return y-x||a.name.localeCompare(b.name,'ko');
  });
}
export function makeImportCSV(rows, product, start, end) {
  const header=['HS','제품군','국가·지역','수입금액기준',...YEARS.flatMap(y=>[`${y}_전체수입_USD`,`${y}_한국산수입_USD`,`${y}_한국산점유율`]),'비교시작','비교종료','수입시장_CAGR','점유율변화_pp','경쟁자료연도','주요경쟁국_한국제외','경쟁국수입액_USD','경쟁국점유율','원자료URL'];
  const body=rows.map(r=>{const c=r.competition?.year<=end?r.competition:null;return [product.code,product.fullName,r.name,r.basis,...YEARS.flatMap((_,i)=>[r.world[i],r.korea[i],r.metrics.shares[i]]),start,end,r.metrics.cagr,r.metrics.shareChange,c?.year,c?r.leaderName:null,c?.top[0]?.value,c?.world>0?c.top[0]?.value/c.world:null,r.sources[YEARS.indexOf(end)]];});
  return '\uFEFF'+[header,...body].map(row=>row.map(csvCell).join(',')).join('\r\n');
}

export const SCORE_CRITERIA = [
  {key:'last',label:'시장 규모',description:'종료 연도 전체 수입액'},
  {key:'cagr',label:'시장 성장',description:'전체 수입액 연평균 성장률'},
  {key:'shareChange',label:'한국산 입지 변화',description:'한국산 점유율 변화 · pp'},
];
// Midranks keep ties equal; a cohort with no variation has a neutral score of 50.
export function percentilePoints(value, population) {
  if (!Number.isFinite(value) || !population.length) return null;
  if (population.length===1) return 50;
  const lower=population.filter(v=>v<value).length;
  const equal=population.filter(v=>v===value).length;
  return (lower+(equal-1)/2)/(population.length-1)*100;
}
export function getTradeScores(exports, imports, state) {
  // Search, selection, pagination and export filters never change the benchmark.
  const rows=getImportRows(exports,imports,{product:state.product,start:state.start,end:state.end});
  const eligible=rows.filter(r=>SCORE_CRITERIA.every(c=>Number.isFinite(r.metrics[c.key])));
  const populations=SCORE_CRITERIA.map(c=>eligible.map(r=>r.metrics[c.key]));
  const scored=rows.map(r=>{
    const valid=SCORE_CRITERIA.filter(c=>Number.isFinite(r.metrics[c.key])).length;
    const points=valid===3&&eligible.length>=2?SCORE_CRITERIA.map((c,i)=>percentilePoints(r.metrics[c.key],populations[i])):SCORE_CRITERIA.map(()=>null);
    const score=points.every(Number.isFinite)?Number((points.reduce((a,b)=>a+b,0)/3).toFixed(10)):null;
    const missing=SCORE_CRITERIA.filter(c=>!Number.isFinite(r.metrics[c.key])).map(c=>c.label);
    const warnings=[];
    if(r.metrics.lowBase)warnings.push('시작 수입액 100만 달러 미만 · 기저 효과 유의');
    if(r.metrics.cagr!==null&&r.metrics.cagr<0)warnings.push('수입시장 감소');
    if(r.metrics.shareChange!==null&&r.metrics.shareChange<0)warnings.push('한국산 점유율 하락');
    const observed=r.metrics.shares.slice(YEARS.indexOf(state.start),YEARS.indexOf(state.end)+1).filter(v=>v!==null).length;
    if(observed<r.metrics.expected)warnings.push(`점유율 ${observed}/${r.metrics.expected}개 연도 확인`);
    return {...r,points,score,valid,missing,warnings,peerCount:eligible.length,rank:null};
  });
  const totals=scored.filter(r=>r.score!==null).map(r=>r.score);
  for(const r of scored)if(r.score!==null)r.rank=1+totals.filter(v=>v>r.score).length;
  return scored.sort((a,b)=>a.score===null&&b.score===null?a.name.localeCompare(b.name,'ko'):a.score===null?1:b.score===null?-1:b.score-a.score||a.name.localeCompare(b.name,'ko'));
}
export function makeScoreCSV(rows, product, start, end) {
  const header=['HS','제품군','국가·지역','시작연도','종료연도','수입금액기준','비교국가수','순위','수출입데이터점수','시장규모_USD','시장규모점수','수입시장_CAGR','시장성장점수','한국산점유율변화_pp','입지변화점수','필수지표확인수','보류사유','해석주의','시작연도출처','종료연도출처'];
  const body=rows.map(r=>[product.code,product.fullName,r.name,start,end,r.basis,r.peerCount,r.rank,r.score,r.metrics.last,r.points[0],r.metrics.cagr,r.points[1],r.metrics.shareChange,r.points[2],r.valid,r.missing.join(' · ')||(r.peerCount<2?'비교 대상 부족':''),r.warnings.join(' · '),r.sources[YEARS.indexOf(start)],r.sources[YEARS.indexOf(end)]]);
  return '\uFEFF'+[header,...body].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
