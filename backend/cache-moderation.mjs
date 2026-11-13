import {isModerator,readQualityBody} from './quality.mjs';
export async function cacheModerationRoute(request,env,cors){
 const reply=(data,status=200)=>Response.json(data,{status,headers:{...cors,'Cache-Control':'private, no-store'}}),path=new URL(request.url).pathname;
 if(!env.EXPLANATION_CACHE)return reply({error:'Chưa có kho giải thích.'},503);
 try{
  if(path==='/v1/explanations/status'&&request.method==='POST'){
   const body=await readQualityBody(request,2000);if(!Array.isArray(body.keys)||!body.keys.length||body.keys.length>20||body.keys.some(k=>! /^[a-f0-9]{64}$/.test(k)))return reply({error:'Danh sách không hợp lệ.'},400);
   const entries=await Promise.all([...new Set(body.keys)].map(async key=>{const object=env.EXPLANATION_CACHE.get(env.EXPLANATION_CACHE.idFromName(key));return [key,await(await object.fetch(new Request('https://explanation-cache/status'))).json()]}));return reply({entries:Object.fromEntries(entries)});
  }
  if(!await isModerator(request,env))return reply({error:'Bạn không có quyền kiểm duyệt.'},403);
  const key=path.split('/').at(-1);if(!/^[a-f0-9]{64}$/.test(key)||!['GET','PUT'].includes(request.method))return reply({error:'Không tìm thấy.'},404);
  const input=request.method==='PUT'?await readQualityBody(request,48000):null,object=env.EXPLANATION_CACHE.get(env.EXPLANATION_CACHE.idFromName(key));
  const response=await object.fetch(new Request('https://explanation-cache/moderate',{method:request.method,...(input?{body:JSON.stringify(input)}:{})}));return reply(await response.json(),response.status);
 }catch{return reply({error:'Chưa xử lý được. Hãy thử lại.'},400)}
}
