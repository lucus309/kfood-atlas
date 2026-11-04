import {comparativeCard} from './comparative-copy.mjs';
import {demandWindow} from './demand.mjs?v=27';
import {savedExplanation} from './ai-evidence.mjs';
import {RECOMMENDATION_GROUPS} from './recommendations.mjs';
const pct=n=>`${n>0?'+':''}${(n*100).toFixed(1)}%`;
export function recommendationCopy(row,state,cache,dataset,peers=[]){
 const p=row.priority,m=row.metrics,items=[];
 const add=(phrase,label,value,period,source)=>items.push({phrase,label,value,period,source});
 if(p.strong.includes('수입시장'))add('수입시장 성장','수입시장 연평균',pct(m.cagr),`${state.start}–${state.end}`,'UN Comtrade');
 if(p.strong.includes('한국산 성과'))add('한국산 점유율 확대','한국산 점유율 변화',`${row.review.shareYoy>0?'+':''}${row.review.shareYoy.toFixed(Math.abs(row.review.shareYoy)<.1?3:1)}%p`,`${state.end-1}→${state.end}`,'UN Comtrade');
 if(p.strong.includes('구매력')){
  if(p.points.economyLevel>=75)add('높은 구매력','1인당 실질 소비',new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(m.economyLevel),`${row.economyEnd} · 국제달러`,'World Bank');
  else add('구매력 성장','실질 소비 연평균',pct(m.economyCagr),`${row.economyStart}–${row.economyEnd}`,'World Bank');
 }
 if(p.strong.includes('소비 수요'))add('식품 구매의향과 소비 증가','한국 식품 구매의향',`${p.raw.intention.toFixed(1)}%`,`${row.culture.observationYear} · 콘텐츠 경험자`,'KOFICE');
 if(p.raw.demandGrowth>0&&!p.strong.includes('소비 수요'))add('즉석면 소비 증가','즉석면 소비 연평균',pct(p.raw.demandGrowth),`${state.start}–${row.recommendation.demandEnd}`,'WINA');
 const domain=item=>item.source==='World Bank'?0:item.source==='UN Comtrade'?(item.label.startsWith('한국산')?2:1):3;
 const contribution=item=>{const i=domain(item);return (p.domainPoints[i]??0)*RECOMMENDATION_GROUPS[i].keys.reduce((sum,k)=>sum+(p.effectiveWeights[k]||0),0);};
 const facts=items.sort((a,b)=>contribution(b)-contribution(a)).slice(0,3),phrases=facts.slice(0,2).map(x=>x.phrase);
 const explanation=savedExplanation(cache,row,state);
 const window=dataset?demandWindow(dataset,state.product,row.country,state.start,row.recommendation.demandEnd):null;
 const rounding=window?.rounding;
 if(window){for(const fact of facts)if(fact.label==='즉석면 소비 연평균'){
  const servings=value=>`${new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(value*10000)}만`;
  fact.value=`${servings(window.first.value)} → ${servings(window.last.value)} 식`;
  fact.label='즉석면 소비량';
 }}
 const card=explanation?.card?{...explanation.card,strengths:[...explanation.card.strengths]}:undefined;
 if(rounding?.largeRelativeError&&card){
  if(window.cagr>0)card.title='소비 증가 · 소규모 시장';
  card.caution='작은 소비 규모 · 증가율 해석에 주의';
 }
 return {card:comparativeCard(row,peers,state,card),detail:explanation?.detail,generated:!!explanation,sentence:explanation?.summary||(row.recommendation.eligible?`추천 이유는 ${phrases.join(' · ')}입니다.`:'현재 후보 선정 조건을 충족하지 않습니다.'),facts};
}
export function latestDemandEvidence(data,product,country,end){
 // Keep the new vintage out of scoring; never attribute the combined region to China alone.
 if(product!=='190230'||end<2025)return null;
 const row=data.rows.find(r=>r.country===country)||([156,344].includes(country)?data.rows.find(r=>r.iso==='CN+HK'):null);
 if(!row)return null;
 const a=data.years.indexOf(2024),b=data.years.indexOf(2025);
 return {value:row.values[b],previous:row.values[a],yoy:row.values[b]/row.values[a]-1,combined:row.country===null,url:data.url};
}
