import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {surveyCities,monthlyUse} from './dist/survey.mjs';
const data=JSON.parse(await readFile(new URL('./dist/survey.json',import.meta.url)));
assert.equal(data.rows.length,22);
assert.equal(new Set(data.rows.map(r=>r.city)).size,22);
assert.equal(data.rows.reduce((sum,r)=>sum+r.aware,0),7418);
assert.equal(data.rows.reduce((sum,r)=>sum+r.users,0),6543);
for(const r of data.rows){
 assert(r.users<=r.aware&&r.aware<=500);
 assert(Math.abs(r.users/r.aware*100-r.ever)<.051);
 assert(Math.abs(r.ever+r.never-100)<.01);
 assert(Math.abs(r.rth+r.rte+r.rtc-100)<.11);
 assert(Math.abs(r.weekly+r.monthly+r.quarterly+r.halfyear+r.yearly+r.lapsed+r.never-100)<.31);
 assert(monthlyUse(r)<=r.ever);
}
const berlin=surveyCities(data,276,2025)[0];
assert.equal(berlin.ever,94.7);assert.equal(monthlyUse(berlin),59.8);
assert.equal(berlin.aware,360);assert.equal(berlin.users,341);
assert.deepEqual(surveyCities(data,156,2025).map(r=>r.city),['베이징','상하이']);
assert.equal(monthlyUse(surveyCities(data,156,2025)[1]),66.4);
assert.equal(surveyCities(data,344,2025)[0].city,'홍콩');
assert.equal(surveyCities(data,158,2025)[0].city,'타이베이');
assert.equal(surveyCities(data,484,2025)[0].rth,55.8);
assert.deepEqual(surveyCities(data,276,2024),[]);
assert.deepEqual(surveyCities(data,356,2025),[]);
assert.deepEqual(surveyCities(null,276,2025),[]);
console.log('Survey bases, transcription, frequency, city geography and year scope: passed');
