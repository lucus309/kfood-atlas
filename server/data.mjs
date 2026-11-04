import {getOpportunityScores} from '../dist/opportunities.mjs';
import {applyRecommendationModel,recommendationSelection,RECOMMENDATION_GROUPS} from '../dist/recommendations.mjs';
import {demandWindow} from '../dist/demand.mjs';
export function createDataTools(assets){
 const read=n=>JSON.parse(assets['/'+n+'.json'].body),data=read('data'),imports=read('imports'),evidence=read('opportunities'),demand=read('demand');
 const names=new Intl.DisplayNames(['ko'],{type:'region'});
 data.countries=data.countries.map(c=>({...c,name:/[가-힣]/.test(c.name)||!/^([A-Z]{2})$/.test(c.iso)?c.name:names.of(c.iso)}));
 return {
 valid(s){return data.products.some(p=>p.code===s.product)&&Number.isInteger(s.start)&&Number.isInteger(s.end)&&s.start>=2021&&s.end<=2025&&s.start<s.end;},
 context(s){
  const rows=applyRecommendationModel(getOpportunityScores(data,imports,evidence,s),demand,s),top=recommendationSelection(rows).top;
  const country=r=>({country:r.country,name:r.name,rank:r.recommendationRank,score:r.priority.index,observed:r.priority.observed,eligible:r.recommendation.eligible,domains:RECOMMENDATION_GROUPS.map((g,i)=>({name:g.label,observed:g.keys.filter(k=>Number.isFinite(r.priority.raw[k])).length,weight:g.keys.reduce((a,k)=>a+(r.priority.effectiveWeights[k]||0),0),points:r.priority.domainPoints[i],contribution:(r.priority.domainPoints[i]||0)*g.keys.reduce((a,k)=>a+(r.priority.effectiveWeights[k]||0),0)})),tradePeriod:[s.start,s.end],economyPeriod:[r.economyStart,r.economyEnd],raw:r.priority.raw,weights:r.priority.effectiveWeights,market:r.review.market,koreanImports:r.review.korea,koreanExports:r.review.exports,share:r.metrics.share,shareRecentPP:r.review.shareYoy,annual:r.review.annual,cautions:r.recommendation.cautions,demand:demandWindow(demand,s.product,r.country,s.start,s.end),sources:[...(s.product==='190230'?[{title:'WINA · 즉석면 소비',url:demand.meta.sourceUrl}]:[]),{title:'UN Comtrade · 상대국 수입',url:r.review.mirror?.importSource},{title:'UN Comtrade · 한국 수출',url:r.review.mirror?.exportSource},{title:'World Bank · 가계소비 PPP',url:'https://data.worldbank.org/indicator/NE.CON.PRVT.PP.KD'}].filter(x=>x.url)});
  return {product:data.products.find(p=>p.code===s.product),top:top.map(country),lookup(query){const q=query.toLowerCase().trim();return rows.filter(r=>String(r.country)===q||r.name.toLowerCase().includes(q)||r.english?.toLowerCase().includes(q)||r.iso?.toLowerCase()===q).slice(0,5).map(country);},compare(codes){return rows.filter(r=>codes.includes(r.country)).slice(0,5).map(country);}};
 }
}
}
export const methodology='추천은 구매력·수입시장·한국산 성과·문화/소비 네 영역의 관측 항목 백분위 평균. 영역 기본25%, 빈 영역 제외 후 재가중. 국가마다 평가 항목·실효 비중이 다름. 후보 조건은 강점2영역 이상 또는 강점1영역+문화 및 소비 증가. 점수는 성공확률 아님. 한국산 수입은 판매와 다름. 양국신고5배 이상이면 해당 시점 변화만 보류. raw.koreaRecent와koreaPeriod는 대칭변화율이며 일반 전년비가 아님. 일반전년비는 koreanImports.yoy 사용. domains의weight/contribution을 그대로 읽고 문화·소비 안의 일부결측을 영역전체누락으로 혼동하지 말 것. 문화는 한국 콘텐츠 경험자 대상, 소비는 즉석면 전체로 라면 단독 수입과 다름. 유통·규제 제외. missing은0이 아님. 자료로 확인하지 않은 맛/가격/현지유통/최신뉴스 추정 금지. 추천 순위와 기준을 변경하는 도구는 없음.';
