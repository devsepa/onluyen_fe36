export function createQuizSound({storage,makeContext=()=>new(globalThis.AudioContext||globalThis.webkitAudioContext)()}={}){
 let enabled=true,context=null;
 try{storage??=globalThis.localStorage;enabled=storage.getItem('sot-sound')!=='false'}catch{}

 function getContext(){
  try{
   context??=makeContext();
   if(context.state==='suspended')context.resume().catch(()=>{});
   return context;
  }catch{return null}
 }

 function tone(freq, duration=0.04, type='sine', gainVal=0.04, freqEnd=null){
  if(!enabled)return;
  const ctx=getContext();if(!ctx)return;
  try{
   const now=ctx.currentTime;
   const osc=ctx.createOscillator(),gain=ctx.createGain();
   osc.type=type;
   osc.frequency.setValueAtTime(freq,now);
   if(freqEnd)osc.frequency.exponentialRampToValueAtTime(freqEnd,now+duration);
   gain.gain.setValueAtTime(gainVal,now);
   gain.gain.exponentialRampToValueAtTime(0.0001,now+duration);
   osc.connect(gain);gain.connect(ctx.destination);
   osc.start(now);osc.stop(now+duration+0.01);
   osc.onended=()=>{osc.disconnect();gain.disconnect()};
  }catch{}
 }

 return {
  get enabled(){return enabled},
  toggleSound(){enabled=!enabled;try{storage.setItem('sot-sound',String(enabled))}catch{}return enabled},
  play(correct){
   if(!enabled)return;
   const ctx=getContext();if(!ctx)return;
   try{
    const start=ctx.currentTime,notes=correct?[[660,0],[880,.11]]:[[220,0],[165,.13]];
    for(const [frequency,delay]of notes){
     const osc=ctx.createOscillator(),gain=ctx.createGain(),time=start+delay;
     osc.type=correct?'triangle':'sine';
     osc.frequency.setValueAtTime(frequency,time);
     gain.gain.setValueAtTime(0,time);
     gain.gain.linearRampToValueAtTime(correct?.06:.045,time+.012);
     gain.gain.exponentialRampToValueAtTime(.001,time+.14);
     osc.connect(gain);gain.connect(ctx.destination);
     osc.start(time);osc.stop(time+.16);
     osc.onended=()=>{osc.disconnect();gain.disconnect()};
    }
   }catch{}
  },
  // Crisp UI Click for buttons & navs
  click(){tone(780,0.032,'sine',0.035,380)},
  // Tactile choice pill pick
  select(){tone(480,0.045,'triangle',0.05,720)},
  // Question switch / Next / Prev
  nav(){tone(340,0.06,'sine',0.035,560)},
  // Switches, toggles, checkboxes
  toggle(){tone(640,0.038,'sine',0.04)},
  // Dialog / Modal open
  pop(){tone(420,0.05,'sine',0.045,840)},
  // Celebrating quiz completion
  celebrate(){
   if(!enabled)return;
   const ctx=getContext();if(!ctx)return;
   try{
    const now=ctx.currentTime;
    const notes=[[523.25,0],[659.25,0.09],[783.99,0.18],[1046.5,0.28]];
    for(const [freq,delay]of notes){
     const osc=ctx.createOscillator(),gain=ctx.createGain();
     const t=now+delay;
     osc.type='triangle';
     osc.frequency.setValueAtTime(freq,t);
     gain.gain.setValueAtTime(0,t);
     gain.gain.linearRampToValueAtTime(0.065,t+0.015);
     gain.gain.exponentialRampToValueAtTime(0.0001,t+0.22);
     osc.connect(gain);gain.connect(ctx.destination);
     osc.start(t);osc.stop(t+0.24);
     osc.onended=()=>{osc.disconnect();gain.disconnect()};
    }
   }catch{}
  }
 };
}
