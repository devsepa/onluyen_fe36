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

 function tone(freq, duration=0.045, type='sine', gainVal=0.05, freqEnd=null){
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
   osc.start(now);osc.stop(now+duration+0.015);
   osc.onended=()=>{osc.disconnect();gain.disconnect()};
  }catch{}
 }

 return {
  get enabled(){return enabled},
  toggleSound(){enabled=!enabled;try{storage.setItem('sot-sound',String(enabled))}catch{}return enabled},

  // Bộ 4: Đàn Chuông Celesta (Sweet Celesta) - Trong trẻo, ngọt ngào, ngân vang
  play(correct){
   if(!enabled)return;
   const ctx=getContext();if(!ctx)return;
   try{
    const start=ctx.currentTime;
    // Đúng: Hợp âm Celesta E6 (1318Hz) -> G#6 (1661Hz) -> B6 (1975Hz)
    // Sai: Hai nốt ngắt phím thanh tao A5 (880Hz) -> G#5 (830Hz)
    const notes=correct?[[1318,0],[1661,0.07],[1975,0.14]]:[[880,0],[830,0.1]];
    for(const [frequency,delay]of notes){
     const osc=ctx.createOscillator(),gain=ctx.createGain(),time=start+delay;
     osc.type='sine';
     osc.frequency.setValueAtTime(frequency,time);
     gain.gain.setValueAtTime(0,time);
     gain.gain.linearRampToValueAtTime(correct?0.06:0.05,time+0.012);
     gain.gain.exponentialRampToValueAtTime(0.0001,time+(correct?0.32:0.2));
     osc.connect(gain);gain.connect(ctx.destination);
     osc.start(time);osc.stop(time+(correct?0.35:0.22));
     osc.onended=()=>{osc.disconnect();gain.disconnect()};
    }
   }catch{}
  },

  // UI Click: Gõ phím chuông ngắn
  click(){tone(1760,0.035,'sine',0.04,1975)},

  // Chọn đáp án A B C D: Phím chuông gõ ngọt B6 (1975Hz)
  select(){tone(1975,0.045,'sine',0.05)},

  // Chuyển câu: Lướt phím nhẹ E6 (1318Hz) lên A6 (1760Hz)
  nav(){tone(1318,0.05,'sine',0.045,1760)},

  // Toggles, switches
  toggle(){tone(1661,0.04,'sine',0.045)},

  // Pop modal
  pop(){tone(1318,0.05,'sine',0.045,1975)},

  // Hoàn thành bài: Khúc nhạc hộp ngọc Celesta C6 -> E6 -> G6 -> C7
  celebrate(){
   if(!enabled)return;
   const ctx=getContext();if(!ctx)return;
   try{
    const now=ctx.currentTime;
    const notes=[[1046,0],[1318,0.09],[1567,0.18],[2093,0.28]];
    for(const [freq,delay]of notes){
     const osc=ctx.createOscillator(),gain=ctx.createGain();
     const t=now+delay;
     osc.type='sine';
     osc.frequency.setValueAtTime(freq,t);
     gain.gain.setValueAtTime(0,t);
     gain.gain.linearRampToValueAtTime(0.06,t+0.015);
     gain.gain.exponentialRampToValueAtTime(0.0001,t+0.42);
     osc.connect(gain);gain.connect(ctx.destination);
     osc.start(t);osc.stop(t+0.45);
     osc.onended=()=>{osc.disconnect();gain.disconnect()};
    }
   }catch{}
  }
 };
}
