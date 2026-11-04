import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getOpportunityScores} from './dist/opportunities.mjs';
import {applyRecommendationModel,recommendationSelection} from './dist/recommendations.mjs';
import {recommendationCopy,latestDemandEvidence} from './dist/recommendation-copy.mjs';
const read=n=>JSON.parse(fs.readFileSync(`dist/${n}.json`));
const data=read('data'),imports=read('imports'),evidence=read('opportunities'),demand=read('demand'),latest=read('latest-demand');
for(const product of data.products)for(const [start,end] of [[2021,2025],[2021,2023],[2024,2025]]){
 const state={product:product.code,start,end};
 const rows=applyRecommendationModel(getOpportunityScores(data,imports,evidence,state),demand,state);
 const before=JSON.stringify(rows);
 for(const r of recommendationSelection(rows).top){
  const c=recommendationCopy(r,state);
  assert.ok(c.facts.length>=2&&c.facts.length<=3);
  assert.ok(!/NaN|undefined|null/.test(JSON.stringify(c)));
  const share=c.facts.find(f=>f.label==='한국산 점유율 변화');
  if(share)assert.equal(Number.parseFloat(share.value),Number(r.priority.raw.shareRecent.toFixed(Math.abs(r.priority.raw.shareRecent)<.1?3:1)));
  const econ=c.facts.find(f=>f.label==='1인당 실질 소비');
  if(econ)assert.ok(econ.period.startsWith(String(r.economyEnd)));
 }
 assert.equal(JSON.stringify(rows),before,'presentation must not mutate scoring');
}
assert.equal(latestDemandEvidence(latest,'1806',842,2025),null);
assert.equal(latestDemandEvidence(latest,'190230',842,2024),null);
assert.equal(latestDemandEvidence(latest,'190230',414,2025),null);
assert.equal(latestDemandEvidence(latest,'190230',156,2025).combined,true);
const us=latestDemandEvidence(latest,'190230',842,2025);assert.equal(us.value,52.3);assert.equal(us.previous,51.5);
const mx=latestDemandEvidence(latest,'190230',484,2025);assert.equal(mx.previous,15.7);
console.log('PASS: 10 products × 3 periods; pp units, actual economic years, score immutability, latest-data scope and revised baseline.');
