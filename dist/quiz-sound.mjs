export function createQuizSound({storage,makeContext=()=>new(globalThis.AudioContext||globalThis.webkitAudioContext)()}={}){
 let enabled=true,context=null;try{storage??=globalThis.localStorage;enabled=storage.getItem('sot-sound')!=='false'}catch{}
 return {get enabled(){return enabled},toggle(){enabled=!enabled;try{storage.setItem('sot-sound',String(enabled))}catch{}return enabled},play(correct){
  if(!enabled)return;
  try{
   context??=makeContext();if(context.state==='suspended')context.resume().catch(()=>{});
   const start=context.currentTime,notes=correct?[[660,0],[880,.11]]:[[220,0],[165,.13]];
   for(const [frequency,delay]of notes){const oscillator=context.createOscillator(),gain=context.createGain(),time=start+delay;oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,time);gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(.055,time+.012);gain.gain.exponentialRampToValueAtTime(.001,time+.14);oscillator.connect(gain);gain.connect(context.destination);oscillator.start(time);oscillator.stop(time+.16);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect()}}
  }catch{}
 }};
}
