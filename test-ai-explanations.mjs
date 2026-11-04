import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getOpportunityScores} from './dist/opportunities.mjs';
import {applyRecommendationModel,recommendationSelection} from './dist/recommendations.mjs';
import {explanationKey,explanationPacket,validateExplanation,savedExplanation} from './dist/ai-evidence.mjs';
import {recommendationCopy} from './dist/recommendation-copy.mjs';
const read=n=>JSON.parse(fs.readFileSync(`dist/${n}.json`));
const data=read('data'),imports=read('imports'),evidence=read('opportunities'),demand=read('demand'),cache=read('ai-explanations');
const names=new Intl.DisplayNames(['ko'],{type:'region'});
data.countries=data.countries.map(c=>({...c,name:/[가-힣]/.test(c.name)||!/^([A-Z]{2})$/.test(c.iso)?c.name:names.of(c.iso)}));
let count=0,first;
for(const product of data.products)for(let start=2021;start<2025;start++)for(let end=start+1;end<=2025;end++){
 const state={product:product.code,start,end};
 const rows=applyRecommendationModel(getOpportunityScores(data,imports,evidence,state),demand,state);
 const before=JSON.stringify(rows);
 for(const row of recommendationSelection(rows).top){
  const item=savedExplanation(cache,row,state),packet=explanationPacket(row,state);
  assert.ok(item,`Missing or stale ${explanationKey(row,state)}`);
  validateExplanation(item,packet);
  assert.ok(item.card?.title && item.card.title.length<=35);
  assert.equal(item.card.strengths.length,2);
  assert.ok(item.card.strengths.every(s=>s.length>0&&s.length<=60));
  assert.ok(item.card.caution.length<=70);
  assert.deepEqual(recommendationCopy(row,state,cache).card,item.card);
  assert.equal(recommendationCopy(row,state,cache).sentence,item.summary);
  assert.equal(recommendationCopy(row,state,cache).detail,item.detail);
  const presented=recommendationCopy(row,state,cache,demand);
  assert.equal(presented.detail,item.detail);
  assert.deepEqual(recommendationCopy(row,state,cache).card,item.card);
  if(row.country===56&&product.code==='190230'&&start===2021&&end===2025){
   assert.match(presented.card.caution,/작은 소비 규모/);
   assert.equal(presented.card.title,'소비 증가 · 소규모 시장');
   assert(presented.facts.some(f=>f.label==='즉석면 소비량'&&f.value==='1,000만 → 3,000만 식'));
   assert(!JSON.stringify(presented.facts).includes('반올림'));
  }
  count++;first??={row,state,item,packet};
 }
 assert.equal(before,JSON.stringify(rows));
}
const {row,state,item,packet}=first;
assert.throws(()=>validateExplanation({...item,country:-1},packet));
assert.throws(()=>validateExplanation({...item,evidence_ids:['invented']},packet));
assert.throws(()=>validateExplanation({...item,summary:'성장률 999%로 성공을 보장합니다.'},packet));
const changed=structuredClone(row);changed.priority.raw.marketLevel+=1;
assert.equal(savedExplanation(cache,changed,state),null);
assert.equal(recommendationCopy(changed,state,cache).generated,false);
assert.equal(recommendationCopy(row,state,null).generated,false);
assert.equal(Object.keys(cache.entries).length,count);
console.log(`PASS: ${count} TOP3 explanations across all 100 product/period combinations; IDs, stale data, missing cache, invalid claims, score immutability.`);
