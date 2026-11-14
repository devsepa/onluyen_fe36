export function createCompletionGate({getSession,saveSession,play,complete,onError=()=>{},now=Date.now}){
 let pending=null;
 async function request(){
  const session=getSession();if(!session||session.done||pending)return false;
  if(session.mode==='exam'&&session.deadline<=now()){complete();return true}
  if(!saveSession(session))return false;
  const entry={session,controller:new AbortController()};pending=entry;
  try{
   const won=await play({mode:session.mode,answered:Object.keys(session.answers).length,total:session.questions.length,alreadyDodged:!!session.completionDodgeUsed,signal:entry.controller.signal,
    onDodge:()=>{if(pending===entry&&getSession()===session&&!session.done){session.completionDodgeUsed=true;saveSession(session)}}});
   if(won&&pending===entry&&getSession()===session&&!session.done){complete();return true}
   return false;
  }catch(error){if(!entry.controller.signal.aborted){const fallback=await onError(error,{signal:entry.controller.signal});if(fallback&&pending===entry&&getSession()===session&&!session.done){complete();return true}}return false}
  finally{if(pending===entry)pending=null}
 }
 return {request,cancel(){const entry=pending;pending=null;entry?.controller.abort()},get active(){return !!pending}};
}
