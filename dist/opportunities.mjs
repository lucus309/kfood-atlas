import { reviewCandidate } from './candidate-review.mjs';
import { YEARS, getImportRows, percentilePoints, csvCell } from './engine.mjs';

export const OPPORTUNITY_CRITERIA = [
  {key:'economyLevel',label:'구매력 수준',description:'1인당 실질 가계소비 · PPP'},
  {key:'economyCagr',label:'구매력 성장',description:'1인당 실질 가계소비 CAGR'},
  {key:'last',label:'수입시장 규모',description:'종료 연도 전체 수입액'},
  {key:'cagr',label:'수입시장 성장',description:'전체 수입액 CAGR'},
];
export const STAGE_LABELS = {presence:'한국산 입지형',potential:'잠재시장형',other:'추가 검토',unknown:'한국산 입지 미확인'};
export const WEIGHT_SCENARIOS = [{name:'동일 가중치',weights:[.25,.25,.25,.25]}, ...OPPORTUNITY_CRITERIA.flatMap((c,i)=>[-.1,.1].map(change=>({name:`${c.label} ${change>0?'+':'−'}10%p`,weights:OPPORTUNITY_CRITERIA.map((_,j)=>j===i?.25+change:.25-change/3)})))];
const finite = Number.isFinite;
const median = a => {const v=[...a].sort((x,y)=>x-y),i=Math.floor(v.length/2);return v.length?(v.length%2?v[i]:(v[i-1]+v[i])/2):null;};
const total = (points,weights) => Number(points.reduce((s,p,i)=>s+p*weights[i],0).toFixed(10));
const rank = (score,all) => 1+all.filter(v=>v>score).length;

export function getOpportunityScores(exports, imports, evidence, state) {
  const economyEnd=Math.min(state.end,evidence.meta.economyLatestYear),economyStart=economyEnd-4;
  const econ=new Map(evidence.economy.map(r=>[`${r.countryCode}:${r.year}`,r]));
  const cultures=new Map(evidence.culture.filter(r=>r.countryCode!==null && r.observationYear<=state.end).map(r=>[r.countryCode,r]));
  const rows=getImportRows(exports,imports,{product:state.product,start:state.start,end:state.end}).map(r=>{
    const years=Array.from({length:5},(_,i)=>econ.get(`${r.country}:${economyStart+i}`));
    const levels=years.map(e=>e?.consumptionConstantLcuPerCapita);
    const economyLevel=years[4]?.consumptionPppPerCapita ?? null;
    const economyCagr=levels.every(v=>finite(v)&&v>0)?(levels[4]/levels[0])**.25-1:null;
    const completeTrade=r.world.slice(YEARS.indexOf(state.start),YEARS.indexOf(state.end)+1).every(finite);
    const metrics={...r.metrics,economyLevel,economyCagr,cagr:completeTrade?r.metrics.cagr:null};
    const missing=OPPORTUNITY_CRITERIA.filter(c=>!finite(metrics[c.key])).map(c=>c.label);
    const warnings=[];
    if(r.metrics.lowBase)warnings.push('시작 수입액 100만 USD 미만');
    if(metrics.cagr<0)warnings.push('수입시장 감소');
    if(economyCagr!==null && economyCagr<0)warnings.push('1인당 실질 소비 감소');
    if(!completeTrade)warnings.push('기간 중 수입액 미확인');
    const world=r.world.slice(YEARS.indexOf(state.start),YEARS.indexOf(state.end)+1);
    const growingYears=completeTrade?world.slice(1).filter((v,i)=>v>world[i]).length:null;
    return {...r,metrics,missing,warnings,valid:4-missing.length,economyStart,economyEnd,completeTrade,growingYears,culture:cultures.get(r.country)||null,points:[null,null,null,null],score:null,rank:null,stage:'unknown',sensitivity:null};
  });
  const eligible=rows.filter(r=>r.valid===4),populations=OPPORTUNITY_CRITERIA.map(c=>eligible.map(r=>r.metrics[c.key]));
  const shareMedian=median(eligible.map(r=>r.metrics.share).filter(finite));
  const marketMedian=median(eligible.map(r=>r.metrics.last));
  for(const r of rows){
    r.peerCount=eligible.length;r.shareMedian=shareMedian;r.marketMedian=marketMedian;
    if(r.valid!==4 || eligible.length<2)continue;
    r.points=OPPORTUNITY_CRITERIA.map((c,i)=>percentilePoints(r.metrics[c.key],populations[i]));
    r.score=total(r.points,[.25,.25,.25,.25]);
    if(finite(r.metrics.share) && finite(shareMedian)){
      r.stage=r.metrics.share>=shareMedian?'presence':r.metrics.last>=marketMedian && r.metrics.cagr>0 && r.metrics.economyCagr>0?'potential':'other';
    }
  }
  const scored=eligible.filter(r=>r.score!==null),scenarioScores=WEIGHT_SCENARIOS.map(s=>scored.map(r=>total(r.points,s.weights)));
  for(const [i,r] of scored.entries()){
    const ranks=scenarioScores.map(scores=>rank(scores[i],scores));
    r.rank=ranks[0];r.sensitivity={min:Math.min(...ranks),max:Math.max(...ranks),top3Count:ranks.filter(v=>v<=3).length,scenarios:ranks.length,ranks};
  }
  // Culture is a separate, explicitly scoped comparison. Missing surveys never become zeros.
  const cultural=scored.filter(r=>r.culture && ['dramaConsumptionSharePct','musicConsumptionSharePct','foodPurchaseIntentionPct'].every(k=>finite(r.culture[k])));
  const ckeys=['dramaConsumptionSharePct','musicConsumptionSharePct','foodPurchaseIntentionPct'];
  for(const r of cultural){
    const p=ckeys.map(k=>percentilePoints(r.culture[k],cultural.map(v=>v.culture[k])));
    r.culture={...r.culture,cultureInterestPoints:(p[0]+p[1])/2,foodIntentionPoints:p[2],peerCount:cultural.length};
  }
  const exportIndex=new Map((exports.rows||[]).filter(r=>r.product===state.product).map(r=>[r.country,r]));
  for(const row of rows)row.review=reviewCandidate(row,exportIndex.get(row.country),state.start,state.end);
  return rows.sort((a,b)=>a.score===null&&b.score===null?a.name.localeCompare(b.name,'ko'):a.score===null?1:b.score===null?-1:b.score-a.score||a.name.localeCompare(b.name,'ko'));
}

export function makeOpportunityCSV(rows,product,start,end){
  const headers=['HS','제품군','국가','ISO','경제시작','경제종료','무역시작','무역종료','수입금액기준','비교국수','순위','기본점수',...OPPORTUNITY_CRITERIA.flatMap(c=>[c.label,c.label+'_점수']),'한국산점유율','한국산점유율변화_pp','한국산점유율_분류중앙값','수입시장_분류중앙값_USD','시장유형','수입증가연도수','수입증가액_USD','민감도_최고순위','민감도_최저순위','민감도_TOP3횟수','시나리오수','문화관측연도','드라마소비비중_pct','음악소비비중_pct','한국식품구매의향_pct','문화조사표본','문화소비_PDF쪽','식품구매_PDF쪽','보류사유','확인사항','수입시작출처','수입종료출처','입지검토','검토설명','최근변화','기간변화','반대근거','다음확인행동','한국산수입_전년비','한국산수입_기간증가율','점유율_전년변화_pp','신고액비교상태','신고액차이_배수','한국발수출_USD_FOB','한국발수출_원자료'];
  const values=rows.map(r=>[product.code,product.fullName,r.name,r.iso,r.economyStart,r.economyEnd,start,end,r.basis,r.peerCount,r.rank,r.score,...OPPORTUNITY_CRITERIA.flatMap((c,i)=>[r.metrics[c.key],r.points[i]]),r.metrics.share,r.metrics.shareChange,r.shareMedian,r.marketMedian,STAGE_LABELS[r.stage],r.growingYears,r.metrics.delta,r.sensitivity?.min,r.sensitivity?.max,r.sensitivity?.top3Count,r.sensitivity?.scenarios,r.culture?.observationYear,r.culture?.dramaConsumptionSharePct,r.culture?.musicConsumptionSharePct,r.culture?.foodPurchaseIntentionPct,r.culture?.surveySample,r.culture?.consumptionPdfPage,r.culture?.purchasePdfPage,r.missing.join(' · '),r.warnings.join(' · '),r.sources[YEARS.indexOf(start)],r.sources[YEARS.indexOf(end)],r.review.label,r.review.summary,r.review.recent,r.review.period,r.review.counters.join(' / '),r.review.action,r.review.korea.yoy,r.review.korea.growth,r.review.shareYoy,r.review.mirror.status,r.review.mirror.ratio,r.review.exports.last,r.review.mirror.exportSource]);
  return '\uFEFF'+[headers,...values].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
