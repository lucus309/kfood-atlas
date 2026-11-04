import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getOpportunityScores} from './dist/opportunities.mjs';
import {applyRecommendationModel,endpointQuality,recommendationSelection,makeRecommendationCSV} from './dist/recommendations.mjs';
const read=n=>JSON.parse(fs.readFileSync(n));
const data=read('dist/data.json'),imports=read('dist/imports.json'),evidence=read('dist/opportunities.json'),demand=read('dist/demand.json');
const expected=read('fixtures/endpoint-priority.json');
const state={product:'190230',start:2021,end:2025};
const calculate=(s=state)=>applyRecommendationModel(getOpportunityScores(data,imports,evidence,s),demand,s);
for(const p of expected){
 const rows=calculate({...state,product:p.product}),selected=recommendationSelection(rows);
 assert.equal(rows.length,195);assert.equal(selected.candidates.length,p.candidates.length,p.product);
 for(const want of p.candidates){
  const got=selected.candidates.find(r=>r.iso===want.iso)?.priority;
  assert.ok(got,p.product+' '+want.iso);
  for(let i=0;i<9;i++)assert.ok(Math.abs(got.scenarioIndices[i]-want.indices[i])<1e-9);
  assert.equal(got.observed,want.observed);
 }
 for(const r of selected.candidates){
  const p=r.priority;assert.ok(Math.abs(Object.values(p.effectiveWeights).reduce((s,x)=>s+x,0)-1)<1e-10);
  assert.ok(p.missing.every(k=>p.effectiveWeights[k]===undefined));
  if(r.review.mirror.status==='review')assert.ok(['koreaRecent','koreaPeriod','shareRecent','sharePeriod'].every(k=>p.raw[k]===null));
 }
 if(p.product!=='190230')assert.ok(rows.every(r=>r.priority.raw.demandGrowth===null));
}
const rows=calculate(),base=getOpportunityScores(data,imports,evidence,state);
assert.deepEqual(rows.map(r=>r.score),base.map(r=>r.score));
assert.deepEqual(recommendationSelection(rows).top.map(r=>r.iso),['BE','US','KW']);
assert.equal(rows.find(r=>r.iso==='CN').priority.raw.demandGrowth,null);
const ties=rows.filter(r=>r.recommendation.eligible).slice(0,5).map(r=>({...r,priority:{...r.priority,index:80}}));
assert.equal(recommendationSelection(ties).ties.length,2);
assert.deepEqual(recommendationSelection(ties).top.map(r=>r.recommendationRank),[1,1,1]);
assert.equal(recommendationSelection([]).top.length,0);
for(const start of [2021,2022,2023,2024])for(const end of [2022,2023,2024,2025]){
 if(start>=end)continue;
 const r=calculate({...state,start,end});
 assert.ok(r.every(x=>x.recommendation.demandEnd<=end));
 if(end<2025)assert.ok(r.every(x=>x.priority.raw.culture===null));
 assert.ok(r.every(x=>x.priority.index===null||Number.isFinite(x.priority.index)));
}
// Intermediate gaps do not erase valid endpoints. Zero/zero has no change signal.
const us=base.find(r=>r.iso==='US');
const mutated={...us,korea:[100,null,null,200,300],metrics:{...us.metrics,shares:[.01,null,null,.02,.03]},review:{...us.review,annual:us.review.annual.map((a,i)=>({...a,korea:[100,null,null,200,300][i],export:[100,null,null,200,300][i]}))}};
let p=applyRecommendationModel([mutated],demand,state)[0].priority;
assert.equal(p.raw.koreaPeriod,1);assert.ok(Math.abs(p.raw.sharePeriod-2)<1e-10);
p=applyRecommendationModel([{...mutated,korea:[0,null,null,0,0]}],demand,state)[0].priority;
assert.equal(p.raw.koreaRecent,null);assert.equal(p.raw.koreaPeriod,null);
const csv=makeRecommendationCSV(rows,data.products[0],2021,2025);
assert.equal(csv.split('\r\n').length,196);assert.ok(csv.includes('실효가중치'));assert.ok(!/undefined|NaN|Infinity/.test(csv));
console.log('PASS: 10 products × 9 scenarios match independent Python reference; 1950 rows, partial data, mirror, periods, ties, CSV.');

// Required endpoint only: a bad start blocks period, a bad previous year blocks recent.
const sample=ratio=>({...us,review:{...us.review,annual:[2021,2022,2023,2024,2025].map((year,i)=>({year,korea:100,export:100*(ratio[i]??1)}))}});
assert.deepEqual([endpointQuality(sample([5]),state).recentBlocked,endpointQuality(sample([5]),state).periodBlocked],[false,true]);
assert.deepEqual([endpointQuality(sample([1,1,1,5]),state).recentBlocked,endpointQuality(sample([1,1,1,5]),state).periodBlocked],[true,false]);
assert.equal(endpointQuality(sample([4.999]),state).periodBlocked,false);
assert.equal(endpointQuality(sample([1,100]),state).periodBlocked,false);
const zero=sample([]);zero.review.annual[0].korea=0;
assert.equal(endpointQuality(zero,state).periodBlocked,true);
zero.review.annual[0].export=0;assert.equal(endpointQuality(zero,state).periodBlocked,false);
zero.review.annual[0].export=null;assert.equal(endpointQuality(zero,state).checks[0].status,'missing');
const be=rows.find(r=>r.iso==='BE'),mx=rows.find(r=>r.iso==='MX');
assert.equal(be.priority.raw.koreaPeriod,null);assert.ok(be.priority.raw.koreaRecent>0);
assert.ok(be.recommendation.action.includes('2021'));
assert.ok(mx.recommendation.caution.includes('2025년 전체 수입이 -4.23% 감소'));assert.ok(mx.recommendation.caution.includes('시작 한국산 수입'));assert.ok(mx.recommendation.caution.includes('2021년 양국'));
for(const r of rows)assert.ok(r.review.counters.every(t=>r.recommendation.cautions.includes(t)));
console.log('PASS: endpoint 5x boundary, zero mismatch, missing cross-check, intermediate-year independence, all counterevidence retained.');

// Context comes from observed coverage and actual years, without changing ranks.
const kw=rows.find(r=>r.iso==='KW');
assert.ok(be.recommendation.cautions.some(t=>t.includes('제품 소비 성장 한 항목')&&t.includes('25.0%')));
assert.ok(kw.recommendation.cautions.some(t=>t.includes('문화·소비 자료 없이 3개 영역')&&t.includes('33.3%')));
assert.ok(kw.recommendation.cautions.some(t=>t.includes('최근 반등')&&t.includes('2023년')));
assert.ok(kw.recommendation.reportingComparison.includes('+347.0%'));
assert.ok(kw.recommendation.reportingComparison.includes('+10.5%'));
const short=calculate({...state,start:2024}).find(r=>r.iso==='KW');
assert.ok(!short.recommendation.cautions.some(t=>t.includes('2023년')));
assert.ok(rows.every(r=>r.recommendation.cautions.every(t=>!t.includes('NaN')&&!t.includes('undefined'))));
console.log('추천 근거 연결: 단일항목, 영역공백, 반등, 양쪽 신고, 선택기간 검증 통과');
