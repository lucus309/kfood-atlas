import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {YEARS, getTradeScores} from './dist/engine.mjs';
import {volumeMetrics, getVolumeRows, makeVolumeCSV} from './dist/volume.mjs';
const data=JSON.parse(await readFile(new URL('./dist/data.json',import.meta.url)));
const imports=JSON.parse(await readFile(new URL('./dist/imports.json',import.meta.url)));
const state={product:'190230',start:2021,end:2025};
const rows=getVolumeRows(data,imports,state),by=new Map(rows.map(r=>[r.country,r]));
const counts=rows.reduce((m,r)=>(m[r.volume.classification]=(m[r.volume.classification]||0)+1,m),{});
assert.deepEqual(counts,{both_up:52,withheld:124,neither_up:9,value_only:10});
const us=by.get(842);
assert.equal(us.volume.classification,'both_up');
assert.equal(us.worldNetKg[0],103088413);
assert.equal(us.worldNetKg[4],155691264);
assert.equal(us.volume.weight.cagr,(155691264/103088413)**.25-1);
assert.equal(us.volume.interiorExcluded,2);
assert.equal(us.volume.weights[2],null);
assert.equal(by.get(156).volume.classification,'withheld');
assert.equal(by.get(156).worldNetKg[0],89453649.753);
assert.equal(by.get(156).worldNetEstimated[0],true);
assert.equal(by.get(156).volume.weight.cagr,null);
assert.equal(by.get(276).volume.weight.cagr,null);
assert.equal(by.get(484).worldNetKg[4],null);
assert.equal(by.get(484).volume.weight.cagr,null);
// Endpoint validity is period-specific, never borrowed from a later year.
assert.equal(volumeMetrics(us,2021,2022).classification,'both_up');
assert.equal(volumeMetrics(us,2021,2024).classification,'withheld');
const fixture={world:[100,100,100,100,120],worldNetKg:[10,10,10,10,10],worldNetEstimated:YEARS.map(()=>false),worldNetStatus:YEARS.map(()=>'not_estimated')};
assert.equal(volumeMetrics(fixture,2021,2025).classification,'value_only');
assert.equal(volumeMetrics({...fixture,world:YEARS.map(()=>100),worldNetKg:[10,10,10,10,20]},2021,2025).classification,'weight_only');
assert.equal(volumeMetrics({...fixture,worldNetKg:[0,10,10,10,10]},2021,2025).classification,'withheld');
assert.equal(volumeMetrics({...fixture,worldNetKg:[10,10,10,10,0],worldNetStatus:['not_estimated','not_estimated','not_estimated','not_estimated','zero_with_value']},2021,2025).classification,'withheld');
assert.equal(volumeMetrics({...fixture,worldNetEstimated:[true,false,false,false,false]},2021,2025).weight.cagr,null);
assert.equal(volumeMetrics({world:fixture.world,qty:YEARS.map(()=>1000),grossWgt:YEARS.map(()=>1000)},2021,2025).classification,'withheld');
for(const r of imports.rows){
 for(const key of ['worldNetKg','worldNetEstimated','worldNetStatus','worldReported','worldAggregate'])assert.equal(r[key].length,5);
 for(let i=0;i<5;i++){
  assert(r.worldNetKg[i]===null||Number.isFinite(r.worldNetKg[i])&&r.worldNetKg[i]>=0);
  if(r.worldNetStatus[i]==='not_estimated')assert.equal(r.worldNetEstimated[i],false);
  if(r.worldNetStatus[i]==='estimated')assert.equal(r.worldNetEstimated[i],true);
 }
}
assert.deepEqual(getTradeScores(data,imports,state).slice(0,3).map(r=>r.country),[156,484,276]);
for(const product of data.products)for(const start of YEARS.slice(0,-1))for(const end of YEARS.filter(y=>y>start)){
 const rs=getVolumeRows(data,imports,{product:product.code,start,end});
 assert.equal(rs.length,195);
 for(const r of rs)if(r.volume.classification!=='withheld'){
  assert(Number.isFinite(r.volume.amount.cagr)&&Number.isFinite(r.volume.weight.cagr));
  for(const year of [start,end])assert.equal(r.worldNetEstimated[YEARS.indexOf(year)],false);
 }
}
const csv=makeVolumeCSV([by.get(156)],data.products[0],2021,2025);
assert(csv.includes('89453649.753'));assert(csv.includes('"true"'));
assert(csv.includes('추정값'));assert(csv.includes('비교 보류'));assert(csv.includes('https://comtradeapi.un.org/'));
console.log('PASS: actual net weights, estimated/missing/zero handling, all products/periods, unchanged TOP 3, quality flags and CSV provenance.');
