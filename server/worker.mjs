import assets from '../.build/assets.mjs';
import {createDataTools} from './data.mjs';
import {answerChat} from './chat.mjs';
const data=createDataTools(assets),encoder=new TextEncoder();
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function readApiKey(env){
 if(env.OPENAI_API_KEY)return env.OPENAI_API_KEY;
 if(!env.OPENAI_KEY_ENVELOPE||!env.OPENAI_KEY_WRAP)return null;
 const raw=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 const packet=JSON.parse(env.OPENAI_KEY_ENVELOPE),key=await crypto.subtle.importKey('raw',raw(env.OPENAI_KEY_WRAP),'AES-GCM',false,['decrypt']);
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:raw(packet.iv)},key,raw(packet.ciphertext)));
}
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);
 if(url.pathname==='/health')return json({ok:true,chatConfigured:!!(env.OPENAI_API_KEY||env.OPENAI_KEY_ENVELOPE),storage:!!env.DB});
 if(url.pathname!=='/api/chat'){
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
  const item=assets[url.pathname==='/'?'/index.html':url.pathname];if(!item)return new Response('Not found',{status:404});
  return new Response(request.method==='HEAD'?null:item.body,{headers:{'Content-Type':item.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});
 }
 if(request.method!=='POST')return json({error:'POST required'},405);
 if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'허용되지 않은 요청입니다.'},403);
 if(Number(request.headers.get('content-length'))>12000)return json({error:'질문이 너무 깁니다.'},413);
 let body;try{const text=await request.text();if(text.length>12000)return json({error:'질문이 너무 깁니다.'},413);body=JSON.parse(text);}catch{return json({error:'질문 형식을 확인해주세요.'},400);}
 if(!data.valid(body)||!Array.isArray(body.messages)||body.messages.length<1||body.messages.length>8||body.messages.some(m=>!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>1800)||body.messages.at(-1).role!=='user'||!body.messages.at(-1).content.trim())return json({error:'제품·기간과 질문을 확인해주세요.'},400);
 const key=await readApiKey(env);if(!key||!env.DB)return json({error:'분석 도우미 연결을 준비 중입니다.'},503);
 const fingerprint=JSON.stringify({version:2,product:body.product,start:body.start,end:body.end,messages:body.messages}),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(fingerprint)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const cached=await env.DB.prepare('SELECT result FROM chat_cache WHERE key=? AND created_at>?').bind(hash,Date.now()-86400000).first();
 if(cached)return json({...JSON.parse(cached.result),cached:true});
 const day=new Date().toISOString().slice(0,10),rateKey=`${request.headers.get('cf-connecting-ip')||'local'}:${Math.floor(Date.now()/60000)}`;
 const rate=await env.DB.prepare('INSERT INTO chat_rate(key,count) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<5 RETURNING count').bind(rateKey).first();
 if(!rate)return json({error:'잠시 후 다시 질문해주세요.'},429);
 const quota=await env.DB.prepare('INSERT INTO chat_usage(day,count) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET count=count+1 WHERE count<40 RETURNING count').bind(day).first();
 if(!quota)return json({error:'오늘의 분석 횟수를 모두 사용했습니다. 저장된 답변은 계속 볼 수 있어요.'},429);
 const stream=new TransformStream(),writer=stream.writable.getWriter();let disconnected=false;
 const emit=event=>{if(!disconnected)writer.write(encoder.encode(JSON.stringify(event)+'\n')).catch(()=>{disconnected=true;});};
 const job=(async()=>{try{emit({type:'status',text:'선택 제품과 추천 데이터 확인 중'});const context=data.context(body);const result=await answerChat({apiKey:key,context,messages:body.messages,signal:AbortSignal.timeout(90000),onEvent:emit});await env.DB.prepare('INSERT OR REPLACE INTO chat_cache(key,result,created_at) VALUES(?,?,?)').bind(hash,JSON.stringify(result),Date.now()).run();}catch(e){emit({type:'error',text:e.status===401?'API 연결이 만료되었습니다. 연결 갱신이 필요합니다.':e.status===429?'API 요청이 몰렸습니다. 잠시 후 다시 시도해주세요.':'답변을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.'});}finally{await writer.close().catch(()=>{});}})();
 ctx.waitUntil(job);
 return new Response(stream.readable,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}};
