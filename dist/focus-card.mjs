export function focusPeriod(hour){
 if(hour>=5&&hour<7)return 'dawn';
 if(hour>=7&&hour<11)return 'morning';
 if(hour>=11&&hour<16)return 'day';
 if(hour>=16&&hour<19)return 'sunset';
 return 'night';
}
export function setupFocusCard({now=()=>new Date()}={}){
 const card=document.getElementById('focusCard'),time=document.getElementById('focusTime');
 if(!card||!time)return ()=>{};
 const labels={dawn:'Bình minh',morning:'Buổi sáng',day:'Ban ngày',sunset:'Hoàng hôn',night:'Ban đêm'};
 if(!time.querySelector('.time-reel-wrap')){
   time.innerHTML=`<div class="time-reel-wrap" aria-hidden="true">`+
     `<span class="digit-flip-slot"><span class="digit-val">0</span></span>`+
     `<span class="digit-flip-slot"><span class="digit-val">0</span></span>`+
     `<span class="reel-colon">:</span>`+
     `<span class="digit-flip-slot"><span class="digit-val">0</span></span>`+
     `<span class="digit-flip-slot"><span class="digit-val">0</span></span>`+
     `<span class="reel-colon">:</span>`+
     `<span class="digit-flip-slot"><span class="digit-val">0</span></span>`+
     `<span class="digit-flip-slot"><span class="digit-val">0</span></span>`+
   `</div>`;
 }
 const slots=time.querySelectorAll('.digit-flip-slot');
 let currentDigits=['','','','','',''];
 function tick(){
   const date=now(),period=focusPeriod(date.getHours());
   card.dataset.period=period;
   const h=String(date.getHours()).padStart(2,'0'),m=String(date.getMinutes()).padStart(2,'0'),s=String(date.getSeconds()).padStart(2,'0');
   time.setAttribute('aria-label',`Giờ trên thiết bị: ${h}:${m}:${s}`);
   time.title=date.toLocaleString('vi-VN');
   const label=document.getElementById('focusPeriodLabel');
   if(label)label.textContent=labels[period];
   const digits=(h+m+s).split('');
   digits.forEach((d,idx)=>{
     if(idx>=slots.length)return;
     const slot=slots[idx];
     if(currentDigits[idx]===d)return;
     if(currentDigits[idx]===''){
       slot.innerHTML=`<span class="digit-val">${d}</span>`;
     }else{
       const oldVal=slot.querySelector('.digit-val:not(.digit-exit)');
       if(oldVal){
         oldVal.className='digit-val digit-exit';
         setTimeout(()=>oldVal.remove(),420);
       }
       const newVal=document.createElement('span');
       newVal.className='digit-val digit-enter';
       newVal.textContent=d;
       slot.append(newVal);
     }
     currentDigits[idx]=d;
   });
 }
 tick();const timer=setInterval(()=>{if(!document.hidden)tick()},1000);document.addEventListener('visibilitychange',tick);
 return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick)};
}
