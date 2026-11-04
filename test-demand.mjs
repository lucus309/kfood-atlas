import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {demandWindow} from './dist/demand.mjs';
const data=JSON.parse(await readFile(new URL('./dist/demand.json',import.meta.url)));
assert.equal(data.rows.filter(r=>r.country!==null).length,52);
assert.equal(new Set(data.rows.filter(r=>r.country!==null).map(r=>r.country)).size,52);
for(const row of data.rows){
 assert.equal(row.values.length,5);
 assert(row.values.every(v=>v===null||Number.isFinite(v)&&v>=0));
}
const mexico=demandWindow(data,'190230',484,2021,2025);
assert.equal(mexico.first.value,12.6);
assert.equal(mexico.last.value,16.1);
assert.equal(mexico.last.year,2024);
assert(Math.abs(mexico.cagr-((16.1/12.6)**(1/3)-1))<1e-12);
assert.equal(demandWindow(data,'190230',484,2021,2023).last.year,2023);
assert.equal(demandWindow(data,'190230',484,2024,2025).cagr,null);
assert.equal(demandWindow(data,'170490',484,2021,2025),null);
assert.equal(demandWindow(data,'190230',784,2021,2025),null);
assert.equal(data.rows.find(r=>r.country===688).values[0],null);
assert.equal(demandWindow(data,'190230',32,2020,2024).cagr,null);
const china=demandWindow(data,'190230',156,2021,2025);
assert.equal(china.country,null);
assert.equal(china.combined,true);
assert.equal(china.region,'CN-HK');
assert.equal(china.last.value,438);
assert.equal(demandWindow(data,'190230',344,2021,2025).region,'CN-HK');
assert.equal(data.rows.some(r=>r.country===156||r.country===344),false);
console.log('Demand scope, combined geography, missing values and observed-year growth: passed');

const belgium=demandWindow(data,'190230',56,2021,2025);
assert(Math.abs(belgium.rounding.low-((.25/.15)**(1/3)-1))<1e-12);
assert(Math.abs(belgium.rounding.high-((.35/.05)**(1/3)-1))<1e-12);
assert.equal(belgium.rounding.largeRelativeError,true);
assert.equal(demandWindow(data,'190230',842,2021,2025).rounding.largeRelativeError,false);
console.log('Rounding bounds and small-base warning: passed');
