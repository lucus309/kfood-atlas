import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {importMetrics,getImportRows,makeImportCSV} from './dist/engine.mjs';
const data=JSON.parse(await readFile(new URL('./dist/data.json',import.meta.url)));
const imports=JSON.parse(await readFile(new URL('./dist/imports.json',import.meta.url)));
const state={product:'190230',start:2021,end:2025};
const rows=getImportRows(data,imports,state),china=rows.find(r=>r.country===156),us=rows.find(r=>r.country===842);
assert.equal(rows.length,195);
const hungary=rows.find(r=>r.country===348);
assert.equal(hungary.competition.top[0].country,616);
assert.equal(hungary.competition.top[0].value,3239712.66);
assert.equal(hungary.competition.world,17568704.449);
assert.equal(hungary.competition.year,2025);
assert.equal(imports.meta.competitionStatus,'complete');
const canada=imports.rows.find(r=>r.country===124&&r.product==='190230');
assert.equal(canada.basis,'FOB');assert.equal(canada.world[0],187222165.356);
const dominican=imports.rows.find(r=>r.country===214&&r.product==='170490');
assert.equal(dominican.basis,'FOB');assert.equal(dominican.korea[4],25.22);
assert.equal(dominican.world[4],57274224.595);
assert.equal(importMetrics(dominican).share,25.22/57274224.595);
const paraguay=imports.rows.find(r=>r.country===600&&r.product==='1806');
assert.equal(paraguay.basis,'FOB');assert.equal(paraguay.korea[3],10430.8);
assert.equal(china.metrics.last,499287046);
assert.equal(china.metrics.korea,385618586);
assert.equal(china.metrics.share,385618586/499287046);
assert.equal(us.metrics.share,316966757/624456323);
assert.ok(Math.abs(china.metrics.shareChange-(385618586/499287046-153125226/262067505)*100)<1e-12);
assert.equal(china.metrics.cagr,(499287046/262067505)**.25-1);
// The Korea-reported FOB export amount must never become the import numerator.
assert.notEqual(china.metrics.korea,data.rows.find(r=>r.country===156&&r.product==='190230').values[4]);
assert.equal(importMetrics({world:[1,1,1,1,100],korea:[0,0,0,0,0]}).share,0);
assert.equal(importMetrics({world:[1,1,1,1,0],korea:[0,0,0,0,0]}).share,null);
assert.equal(importMetrics({world:[1,1,1,1,100],korea:[0,0,0,0,null]}).share,null);
assert.equal(importMetrics({world:[1,1,1,1,null],korea:[0,0,0,0,20]}).share,null);
assert.equal(importMetrics({world:[1,1,1,1,10],korea:[0,0,0,0,20]}).share,null);
assert.equal(importMetrics().share,null);
assert.equal(getImportRows(data,imports,{...state,importSearch:'중국'})[0].country,156);
assert.equal(getImportRows(data,imports,{...state,importSearch:'no such country'}).length,0);
for(const key of ['last','cagr','share','shareChange']){
 const sorted=getImportRows(data,imports,{...state,importSort:key});
 assert.ok(sorted.slice(0,-1).every((r,i)=>r.metrics[key]===null||sorted[i+1].metrics[key]===null||r.metrics[key]>=sorted[i+1].metrics[key]));
}
const older=getImportRows(data,imports,{...state,end:2024}).find(r=>r.country===156);
assert.equal(older.metrics.share,254445880/370084146);
const vietnam=rows.find(r=>r.country===704);
assert.equal(vietnam.metrics.last,null);assert.equal(vietnam.metrics.share,null);
for(const r of imports.rows){
 assert.equal(r.world.length,5);assert.equal(r.korea.length,5);
 for(let i=0;i<5;i++)if(r.world[i]!==null&&r.korea[i]!==null)assert.ok(r.korea[i]<=r.world[i],`${r.country}/${r.product}/${2021+i}: numerator exceeds denominator`);
 if(r.competition){
  const c=r.competition, i=c.year-2021;
  assert.equal(c.world,r.world[i]);assert.equal(c.korea,r.korea[i]);assert.equal(c.basis,r.basis);
  assert.ok(c.top.every(s=>s.country!==410&&s.country!==0));
  assert.equal(c.top.length,new Set(c.top.map(s=>s.country)).size);
  assert.ok(c.top.slice(0,-1).every((s,i)=>s.value>=c.top[i+1].value));
  assert.ok(c.top.every(s=>s.value<=c.world));
  assert.ok(new URL(c.source).searchParams.get('reporterCode').split(',').includes(String(r.country)));
 }
}
assert.equal(china.competition.top[0].country,360);
assert.equal(us.competition.top[0].country,380);
const csv=makeImportCSV([{...china,leaderName:'인도네시아'}],data.products[0],2021,2025);
assert.ok(csv.includes('385618586'));assert.ok(csv.includes('한국산점유율'));assert.ok(csv.includes('인도네시아'));
const oldCSV=makeImportCSV([{...china,leaderName:'인도네시아'}],data.products[0],2021,2024);
assert.ok(!oldCSV.includes('인도네시아'));
console.log(`PASS: ${imports.rows.length} import series, matched-year shares, pp changes, source values, no FOB mixing, zero/missing, periods, filters, competitors, CSV.`);
