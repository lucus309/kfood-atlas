import {demandWindow} from './demand.mjs';
import {YEARS, csvCell} from './engine.mjs';
import {MIRROR_REVIEW_RATIO} from './candidate-review.mjs';
import {makeOpportunityCSV} from './opportunities.mjs';
const pct=n=>`${n>0?'+':''}${(n*100).toFixed(1)}%`;
export function recommendationEvidence(row,demand,state){
 const v=row.review,end=Math.min(state.end,2024);
 const d=demandWindow(demand,state.product,row.country,state.start,end);
 const complete=d&&!d.combined&&d.first.year===state.start&&d.last.year===end&&end>state.start&&d.observations.length===end-state.start+1&&Number.isFinite(d.cagr);
 const demandStatus=d?.combined?'combined':complete?(d.cagr>0?'up':d.cagr<0?'down':'flat'):'missing';
 const demandText=demandStatus==='combined'?'즉석면 소비는 중국·홍콩 합산 자료로만 확인':complete?`즉석면 소비 ${state.start}–${end} 연평균 ${pct(d.cagr)}`:state.product===demand.meta.product?'이 국가·기간의 즉석면 소비 추이 미확인':'선택 제품군의 국가별 소비 추이 미확인';
 const intention=Number.isFinite(row.culture?.foodPurchaseIntentionPct)?row.culture.foodPurchaseIntentionPct:null;
 const intentionText=intention===null?'한국 식품 구매의향 미확인':`한국 식품 구매의향 ${intention.toFixed(1)}% · ${row.culture.observationYear}년 한국 콘텐츠 경험자`;
 const a=YEARS.indexOf(state.start),b=YEARS.indexOf(state.end),ks=row.korea.slice(a,b+1);
 const growthPeriods=ks.slice(1).filter((n,i)=>Number.isFinite(n)&&Number.isFinite(ks[i])&&n>ks[i]).length;
 const eligible=row.score!==null&&v.key==='expansion';
 let caution=v.counters[0]||'선택 제품의 실제 구매·반복구매는 별도 확인';
 if(demandStatus==='down')caution='한국산 수입과 별개로 즉석면 전체 소비는 감소';
 if(demandStatus==='flat')caution='즉석면 소비 반올림 값은 동일, 실제 정체로 확정하지 않음';
 if(demandStatus==='combined')caution='중국 단독 소비 증가 여부는 확인할 수 없음';
 if(demandStatus==='missing'&&!v.counters.length)caution='제품별 현지 판매·반복구매 자료부터 확인 필요';
 if(v.market.yoy<0)caution=`전체 수입시장은 최근 ${pct(v.market.yoy)} 감소, 한국산 확대와 구분 필요`;
 if(!eligible)caution=v.summary;
 if(v.key==='mirror_review')caution=v.summary;
 let action=v.action;
 if(eligible){
  action=demandStatus==='up'?'한국산 확대와 즉석면 소비 증가를 바탕으로 세부 제품의 맛·가격·반복구매를 테스트하세요.':
   demandStatus==='down'?'한국산 확대와 전체 소비 감소가 갈리는 이유를 세부 품목·점유율 이동에서 확인하세요.':
   '한국산 확대가 실제 판매로 이어지는지 선택 제품의 현지 판매·반복구매 자료를 확인하세요.';
 }else if(row.stage==='potential'&&['insufficient','early','rebound','mixed','lagging'].includes(v.key)){
  action=intention!==null||demandStatus==='up'?'관측된 식품 관심·소비 신호가 선택 제품 구매로 이어지는지 확인하고 한국산 입지의 미확인·상충 근거를 대조하세요.':'시장 조건은 확인됐습니다. 해당 국가·제품군의 소비 추이와 한국산 입지 자료부터 확인하세요.';
 }
 return {eligible,potential:row.score!==null&&row.stage==='potential',label:eligible?'확대 검토':v.label,demandStatus,demandText,demandCagr:complete?d.cagr:null,demandStart:state.start,demandEnd:end,demandSource:d?demand.meta.sourceUrl:null,intention,intentionText,caution,action,growthPeriods,intervals:state.end-state.start};
}
export const RECOMMENDATION_GROUPS=[
 {label:'구매력',keys:['economyLevel','economyCagr']},
 {label:'수입시장',keys:['marketLevel','marketCagr']},
 {label:'한국산 성과',keys:['koreaRecent','koreaPeriod','shareRecent','sharePeriod']},
 {label:'문화·소비',keys:['culture','intention','demandGrowth']},
];
export const INPUT_LABELS={economyLevel:'구매력 수준',economyCagr:'구매력 성장',marketLevel:'수입 규모',marketCagr:'수입 성장',koreaRecent:'한국산 최근 수입 변화',koreaPeriod:'한국산 기간 수입 변화',shareRecent:'최근 점유율 변화',sharePeriod:'기간 점유율 변화',culture:'문화 소비비중',intention:'식품 구매의향',demandGrowth:'제품 소비 성장'};
const finite=Number.isFinite,keys=RECOMMENDATION_GROUPS.flatMap(g=>g.keys);
const sym=(a,b)=>finite(a)&&finite(b)&&a+b>0?2*(b-a)/(a+b):null;
const diff=(a,b)=>finite(a)&&finite(b)?(b-a)*100:null;
const average=xs=>xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:null;
const scenarios=[[.25,.25,.25,.25],...RECOMMENDATION_GROUPS.flatMap((_,i)=>[.15,.35].map(w=>RECOMMENDATION_GROUPS.map((_,j)=>i===j?w:(1-w)/3)))];
const rank=(v,values)=>1+values.filter(x=>x>v+1e-9).length;
export function endpointQuality(row,state){
 const years=[...new Set([state.start,state.end-1,state.end])];
 const checks=years.map(year=>{
  const a=row.review.annual.find(a=>a.year===year),k=a?.korea,x=a?.export;
  const known=finite(k)&&finite(x),zeroMismatch=known&&((k===0&&x>0)||(x===0&&k>0));
  const ratio=known&&Math.min(k,x)>0?Math.max(k,x)/Math.min(k,x):null;
  return {year,importValue:k??null,exportValue:x??null,ratio,status:zeroMismatch||(ratio!==null&&ratio>=MIRROR_REVIEW_RATIO)?'review':known?'within_trigger':'missing'};
 });
 const blocked=(a,b)=>checks.some(c=>[a,b].includes(c.year)&&c.status==='review');
 return {checks,recentBlocked:blocked(state.end-1,state.end),periodBlocked:blocked(state.start,state.end)};
}
function attachCautions(row,state){
 const n=row.recommendation,p=row.priority,q=p.quality;
 const flagged=q.checks.filter(c=>c.status==='review');
 const qualityText=flagged.map(c=>`${c.year}년 양국 신고액 ${c.ratio===null?'한쪽만 0':c.ratio.toFixed(1)+'배 차이'}`).join(' · ');
 const coverage=[];
 if(q.checks.some(c=>c.status==='missing'))coverage.push(`${q.checks.filter(c=>c.status==='missing').map(c=>c.year).join('·')}년 양국 신고액 교차 확인 미완료`);
 if(n.demandStatus==='combined')coverage.push(n.demandText);
 if(n.demandStatus==='flat')coverage.push('소비 반올림 값이 같아 실제 정체로 확정할 수 없음');
 if(n.demandStatus==='down')coverage.push('한국산 성과와 별개로 제품 전체 소비는 감소');
 const context=[];
 if(finite(p.index)){
  for(const g of RECOMMENDATION_GROUPS){
   const observed=g.keys.filter(k=>finite(p.raw[k]));
   if(observed.length===1&&g.keys.length>1)context.push(`${g.label} 영역은 ${INPUT_LABELS[observed[0]]} 한 항목으로 평가 · 전체 지수의 ${(p.effectiveWeights[observed[0]]*100).toFixed(1)}% 반영`);
  }
  const absent=RECOMMENDATION_GROUPS.filter(g=>g.keys.every(k=>!finite(p.raw[k])));
  if(absent.length){
   const present=RECOMMENDATION_GROUPS.filter(g=>g.keys.some(k=>finite(p.raw[k])));
   context.push(`${absent.map(g=>g.label).join('·')} 자료 없이 ${present.length}개 영역으로 평가 · ${present.map(g=>`${g.label} ${(g.keys.reduce((s,k)=>s+(p.effectiveWeights[k]||0),0)*100).toFixed(1)}%`).join(' · ')}`);
  }
 }
 const annual=row.review.annual,latest=annual.find(a=>a.year===state.end),previous=annual.find(a=>a.year===state.end-1);
 const earlier=annual.filter(a=>a.year>=state.start&&a.year<state.end-1&&finite(a.world));
 const priorPeak=earlier.reduce((best,a)=>!best||a.world>best.world?a:best,null);
 const rebound=latest&&previous&&finite(latest.world)&&finite(previous.world)&&latest.world>previous.world&&priorPeak&&priorPeak.world>=latest.world;
 if(rebound)context.push(`전체 수입은 최근 반등했지만 ${state.end}년 규모는 ${priorPeak.year}년 ${latest.world===priorPeak.world?'수준':'규모보다 작음'}`);
 if(n.demandStatus==='up'&&finite(p.effectiveWeights.demandGrowth))context.push('소비 성장은 한국산 판매가 아닌 즉석면 전체 소비 기준');
 n.reportingComparison=latest&&previous&&finite(latest.export)&&finite(previous.export)&&previous.export>0&&finite(latest.korea)&&finite(previous.korea)&&previous.korea>0?`${state.end}년 한국산 수입 ${pct(latest.korea/previous.korea-1)} · 한국 신고 수출 ${pct(latest.export/previous.export-1)}. 신고 기준이 달라 증가 폭은 따로 확인합니다.`:null;
 n.cautions=[...new Set([
  ...context,
  ...(flagged.length?[`${qualityText}. ${[q.recentBlocked?'최근 변화':'',q.periodBlocked?'기간 변화':''].filter(Boolean).join('·')} 점수 보류`]:[]),
  ...p.negative.filter(t=>t!=='전체 수입시장 최근 감소'),...row.review.counters,...coverage
 ])];
 n.caution=n.cautions.join(' / ')||'관측한 지표에서 감소 신호 없음';
 const actions=[];
 if(rebound)actions.push('최근 반등이 반복 거래로 이어지는지 연도별 수입과 한국 신고 수출을 함께 확인하세요.');
 if(flagged.length)actions.push(`${flagged.map(c=>c.year).join('·')}년 같은 HS·양국 신고 기준을 대조한 뒤 보류된 변화를 다시 평가하세요.`);
 if(row.review.market.yoy<0)actions.push('최근 전체 시장 감소 속 한국산 점유율 확대가 반복 거래인지 확인하세요.');
 if(n.demandStatus==='down')actions.push('전체 소비 감소와 한국산 성과의 차이를 세부 품목에서 확인하세요.');
 if(!actions.length)actions.push(n.action);
 n.action=actions.join(' ');
 if(q.recentBlocked||q.periodBlocked){
  n.positionLabel='신고 차이 · 일부 성과 판단 보류';
  n.positionSummary=`${[q.recentBlocked?'최근':'',q.periodBlocked?'기간 전체':''].filter(Boolean).join('·')} 한국산 변화는 원수치로 확인하되 신고 차이 점검 전 강점으로 확정하지 않습니다.`;
 }else{n.positionLabel=row.review.label;n.positionSummary=row.review.summary;}
}
export function applyRecommendationModel(rows,demand,state){
 const a=YEARS.indexOf(state.start),b=YEARS.indexOf(state.end);
 const result=rows.map(r=>{
  const n=recommendationEvidence(r,demand,state),m=r.metrics,quality=endpointQuality(r,state),c=r.culture;
  const raw={economyLevel:m.economyLevel,economyCagr:m.economyCagr,marketLevel:m.last,marketCagr:m.cagr,
   koreaRecent:!quality.recentBlocked?sym(r.korea[b-1],r.korea[b]):null,koreaPeriod:!quality.periodBlocked?sym(r.korea[a],r.korea[b]):null,
   shareRecent:!quality.recentBlocked?diff(m.shares[b-1],m.shares[b]):null,sharePeriod:!quality.periodBlocked?diff(m.shares[a],m.shares[b]):null,
   culture:c?average([c.dramaConsumptionSharePct,c.musicConsumptionSharePct]):null,intention:n.intention,demandGrowth:n.demandCagr};
  return {...r,recommendation:{...n,eligible:false,potential:false},priority:{version:'observed-review-v2',quality,raw,points:{},index:null,rank:null,observed:keys.filter(k=>finite(raw[k])).length,missing:keys.filter(k=>!finite(raw[k])),strong:[],negative:[],domainPoints:[],effectiveWeights:{},sensitivity:null}};
 });
 // Keep the common economic/trade cohort fixed; optional surveys do not gate inclusion.
 const cohort=result.filter(r=>r.score!==null),cal=Object.fromEntries(keys.map(k=>[k,cohort.map(r=>r.priority.raw[k]).filter(finite)]));
 for(const r of cohort){
  const p=r.priority,v=p.raw;
  p.points=Object.fromEntries(keys.map(k=>{const xs=cal[k],x=v[k];return [k,finite(x)&&xs.length?100*(xs.filter(t=>t<x).length+.5*xs.filter(t=>t===x).length)/xs.length:null];}));
  p.missing=keys.filter(k=>!finite(v[k]));p.observed=11-p.missing.length;
  p.domainPoints=RECOMMENDATION_GROUPS.map(g=>average(g.keys.map(k=>p.points[k]).filter(finite)));
  const q=p.points;
  if(v.economyCagr>0&&(q.economyLevel>=75||q.economyCagr>=75))p.strong.push('구매력');
  if(v.marketCagr>0&&(q.marketLevel>=75||q.marketCagr>=75))p.strong.push('수입시장');
  if(v.koreaRecent>0&&v.shareRecent>0)p.strong.push('한국산 성과');
  if(q.intention>=75&&v.demandGrowth>0)p.strong.push('소비 수요');
  p.cultureDemand=q.culture>=75&&v.demandGrowth>0;
  p.negative=['economyCagr','marketCagr','koreaRecent','koreaPeriod','shareRecent','sharePeriod','demandGrowth'].filter(k=>finite(v[k])&&v[k]<0).map(k=>INPUT_LABELS[k]+' 감소');
  if(r.review.market.yoy<0)p.negative.push('전체 수입시장 최근 감소');
  if(finite(q.intention)&&q.intention<=25)p.negative.push('식품 구매의향 비교국 하위 25%');
  p.scenarioIndices=scenarios.map((weights,si)=>{
   const denom=weights.reduce((s,w,i)=>s+(finite(p.domainPoints[i])?w:0),0);
   if(si===0)p.effectiveWeights=Object.fromEntries(RECOMMENDATION_GROUPS.flatMap((g,i)=>{const observed=g.keys.filter(k=>finite(p.points[k]));return observed.map(k=>[k,weights[i]/denom/observed.length]);}));
   return p.domainPoints.reduce((s,x,i)=>s+(finite(x)?x*weights[i]:0),0)/denom;
  });
  p.index=p.scenarioIndices[0];
  r.recommendation.eligible=p.strong.length>=2||(p.strong.length>=1&&p.cultureDemand);
  r.recommendation.label=r.recommendation.eligible?'우선 검토 후보':'추가 근거 확인';

 }
 for(const r of result)attachCautions(r,state);
 const candidates=cohort.filter(r=>r.recommendation.eligible);
 for(const r of candidates){
  const p=r.priority,ranks=scenarios.map((_,i)=>rank(p.scenarioIndices[i],candidates.map(x=>x.priority.scenarioIndices[i])));
  p.rank=ranks[0];p.sensitivity={min:Math.min(...ranks),max:Math.max(...ranks),top3Count:ranks.filter(v=>v<=3).length,ranks};
 }
 return result;
}
export function recommendationRows(rows){return rows.filter(r=>r.recommendation.eligible&&finite(r.priority?.index)).sort((a,b)=>b.priority.index-a.priority.index||a.name.localeCompare(b.name,'ko'));}
export function recommendationSelection(rows){
 const ranked=recommendationRows(rows).map(r=>({...r,recommendationRank:rank(r.priority.index,recommendationRows(rows).map(x=>x.priority.index))}));
 const top=ranked.slice(0,3),cutoff=top.at(-1)?.priority.index;
 return {candidates:ranked,top,ties:ranked.slice(3).filter(r=>Math.abs(r.priority.index-cutoff)<1e-9)};
}
export function makeRecommendationCSV(rows,product,start,end){
 const base=makeOpportunityCSV(rows,product,start,end).split('\r\n');
 const headers=['추천모델','후보조건','관측근거지수','후보순위','관측항목수','미확인항목','실효가중치','강점','반대근거','소비근거','추천다음행동','시점별신고점검',...keys.flatMap(k=>[INPUT_LABELS[k]+'_원값',INPUT_LABELS[k]+'_백분위'])];
 return base.map((line,i)=>line+','+(i===0?headers:(()=>{const r=rows[i-1],p=r.priority,n=r.recommendation;return [p.version,n.eligible,p.index,p.rank,p.observed+'/11',p.missing.map(k=>INPUT_LABELS[k]).join(' / '),JSON.stringify(p.effectiveWeights),p.strong.join(' / '),n.caution,n.demandText,n.action,JSON.stringify(p.quality),...keys.flatMap(k=>[p.raw[k],p.points[k]])];})()).map(csvCell).join(',')).join('\r\n');
}
