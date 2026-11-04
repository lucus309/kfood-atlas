import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getTradeScores,percentilePoints,makeScoreCSV} from './dist/engine.mjs';
const state={product:'190230',start:2021,end:2025};
const countries=[1,2,3,4].map(code=>({code,name:`국가${code}`,english:`Country${code}`,iso:''}));
const synthetic={countries};
const make=(country,last,koreaLast)=>({country,product:'190230',world:[100,120,140,160,last],korea:[10,12,14,16,koreaLast],basis:'CIF',sources:Array(5).fill('https://example.com/source')});
const fixture={rows:[make(1,200,20),make(2,400,80),make(3,300,90),{...make(4,10000,null)}]};
const result=getTradeScores(synthetic,fixture,state),byCode=c=>result.find(r=>r.country===c);
assert.equal(byCode(1).score,0);
assert.ok(Math.abs(byCode(2).score-250/3)<1e-9);
assert.ok(Math.abs(byCode(3).score-200/3)<1e-9);
assert.equal(byCode(4).score,null);assert.equal(byCode(4).valid,2);
assert.equal(byCode(4).rank,null);assert.equal(byCode(1).peerCount,3);
assert.deepEqual(result.slice(0,3).map(r=>r.country),[2,3,1]);
assert.equal(percentilePoints(10,[10,10,30]),25);
assert.equal(percentilePoints(30,[10,10,30]),100);
assert.equal(percentilePoints(3,[3,3,3]),50);
const tied=getTradeScores({countries:countries.slice(0,3)},{rows:[make(1,200,20),make(2,200,20),make(3,200,20)]},state);
assert.ok(tied.every(r=>r.score===50&&r.rank===1));
const one=getTradeScores({countries:countries.slice(0,1)},{rows:[make(1,200,20)]},state);
assert.equal(one[0].score,null);
const zero=getTradeScores(synthetic,{rows:[make(1,200,0),make(2,400,80),make(3,300,90)]},state);
assert.equal(zero.find(r=>r.country===1).valid,3);
assert.ok(zero.find(r=>r.country===1).warnings.includes('한국산 점유율 하락'));
const zeroBase=getTradeScores(synthetic,{rows:[{...make(1,200,20),world:[0,120,140,160,200]},make(2,400,80)]},state);
assert.equal(zeroBase.find(r=>r.country===1).score,null);
const gapped=getTradeScores(synthetic,{rows:[{...make(1,200,20),world:[100,null,140,160,200]},make(2,400,80)]},state);
assert.ok(gapped.find(r=>r.country===1).warnings.includes('점유율 4/5개 연도 확인'));
const data=JSON.parse(await readFile(new URL('./dist/data.json',import.meta.url))),imports=JSON.parse(await readFile(new URL('./dist/imports.json',import.meta.url)));
const real=getTradeScores(data,imports,state);
assert.equal(real.filter(r=>r.score!==null).length,87);
assert.deepEqual(real.slice(0,3).map(r=>r.country),[156,484,276]);
const stable=getTradeScores(data,imports,{...state,scoreSearch:'중국',importSearch:'no such country',minimum:1e12,selected:[156]});
assert.deepEqual(real,stable);
for(const p of data.products){for(const [start,end] of [[2021,2025],[2023,2024]]){
 const rows=getTradeScores(data,imports,{product:p.code,start,end});
 for(const r of rows)if(r.score!==null){
  assert.ok(r.score>=0&&r.score<=100);assert.ok(r.points.every(p=>p>=0&&p<=100));
  assert.ok(Math.abs(r.score-r.points.reduce((a,b)=>a+b,0)/3)<1e-9);
 }
}}
assert.notDeepEqual(getTradeScores(data,imports,{...state,end:2024}).slice(0,3).map(r=>r.score),real.slice(0,3).map(r=>r.score));
const csv=makeScoreCSV(result,{code:'190230',fullName:'조제 면류'},2021,2025);
assert.ok(csv.includes('보류사유'));assert.ok(csv.includes('한국산 입지 변화'));assert.ok(csv.includes('https://example.com/source'));
console.log('PASS: hand-calculated equal weights, percentile ties, tied ranks, zero vs missing, small cohorts, fixed benchmark, all products/periods, CSV provenance.');
