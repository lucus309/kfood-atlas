import {YEARS, metrics, getImportRows, csvCell} from './engine.mjs';

export const VOLUME_LABELS = {
 both_up:'금액·물량 동반 증가', value_only:'금액 증가·물량 비증가',
 weight_only:'물량 증가·금액 비증가', neither_up:'금액·물량 모두 비증가', withheld:'비교 보류',
};
export const WEIGHT_LABELS = {
 not_estimated:'추정 표시 없음', estimated:'추정값', missing:'미확인',
 zero_with_value:'금액 양수·중량 0, 보류', unknown_flag:'추정 여부 미확인',
};
export function volumeMetrics(row, start, end){
 const raw=row?.worldNetKg||YEARS.map(()=>null),status=row?.worldNetStatus||YEARS.map(()=>'missing');
 const weights=raw.map((v,i)=>status[i]==='not_estimated'&&row?.worldNetEstimated?.[i]===false&&Number.isFinite(v)&&v>=0?v:null);
 const amount=metrics(row?.world||YEARS.map(()=>null),start,end),weight=metrics(weights,start,end);
 const a=YEARS.indexOf(start),b=YEARS.indexOf(end),issues=[];
 for(const i of [a,b])if(weights[i]===null)issues.push(`${YEARS[i]}년 중량 ${WEIGHT_LABELS[status[i]]||'미확인'}`);
 if(weights[a]===0)issues.push('시작 중량 0, 성장률 산출 불가');
 if(amount.cagr===null)issues.push('수입 금액 성장률 미확인');
 let classification='withheld';
 if(amount.cagr!==null&&weight.cagr!==null){
  classification=amount.cagr>0?(weight.cagr>0?'both_up':'value_only'):(weight.cagr>0?'weight_only':'neither_up');
 }
 return {amount,weight,weights,status,classification,issues,
  interiorExcluded:weights.slice(a+1,b).filter(v=>v===null).length};
}
export function getVolumeRows(data, imports, state){
 return getImportRows(data,imports,{product:state.product,start:state.start,end:state.end,importSort:'last'})
  .map(r=>({...r,volume:volumeMetrics(r,state.start,state.end)}));
}
export function makeVolumeCSV(rows, product, start, end){
 const header=['HS','제품군','국가·지역','수입금액기준','시작연도','종료연도','금액_CAGR','비추정중량_CAGR','구분','보류사유','중간연도_중량제외수',
  ...YEARS.flatMap(y=>[`${y}_수입액_USD`,`${y}_원본순중량_kg`,`${y}_중량추정여부`,`${y}_중량상태`,`${y}_국가직접신고여부`,`${y}_UN집계여부`,`${y}_원자료`])];
 const body=rows.map(r=>[product.code,product.name,r.name,r.basis,start,end,r.volume.amount.cagr,r.volume.weight.cagr,
  VOLUME_LABELS[r.volume.classification],r.volume.issues.join(' · '),r.volume.interiorExcluded,
  ...YEARS.flatMap((_,i)=>[r.world[i],r.worldNetKg?.[i],r.worldNetEstimated?.[i],r.worldNetStatus?.[i]||'missing',r.worldReported?.[i],r.worldAggregate?.[i],r.sources[i]])]);
 return '\uFEFF'+[header,...body].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
