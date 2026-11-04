import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const data=JSON.parse(await readFile(new URL('./dist/data.json',import.meta.url))),context=JSON.parse(await readFile(new URL('./dist/context.json',import.meta.url)));
const countries=new Map(data.countries.map(c=>[c.code,c]));
assert.equal(context.meta.countries,142);
assert.equal(context.logistics.filter(r=>r.year===2024).length,142);
const china=context.logistics.find(r=>r.country===156&&r.year===2024);
assert.equal(china.meanDays,5.9);assert.equal(china.medianDays,4);assert.equal(china.sampleBand,'10000+');
assert.equal(new Set(context.logistics.map(r=>`${r.country}:${r.year}`)).size,context.logistics.length);
for(const r of context.logistics){assert.equal(countries.get(r.country).iso,r.iso);assert.ok([2023,2024].includes(r.year));assert.ok(Number.isFinite(r.meanDays)&&r.meanDays>=0);assert.ok(Number.isFinite(r.medianDays)&&r.medianDays>=0);}
assert.ok(!context.logistics.some(r=>r.country===398),'Do not substitute data for a landlocked country with a partner port');
console.log('PASS: LPI official China values, country-code joins, year coverage, missing landlocked country and no duplicate country/year.');
