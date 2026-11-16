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
   const nums=[0,1,2,3,4,5,6,7,8,9].map(n=>`<div class="reel-digit-num">${n}</div>`).join('');
   time.innerHTML=`<div class="time-reel-wrap" aria-hidden="true"><div class="time-reel-group"><div class="reel-digit-col"><div class="reel-digit-strip">${nums}</div></div><div class="reel-digit-col"><div class="reel-digit-strip">${nums}</div></div></div><span class="reel-colon">:</span><div class="time-reel-group"><div class="reel-digit-col"><div class="reel-digit-strip">${nums}</div></div><div class="reel-digit-col"><div class="reel-digit-strip">${nums}</div></div></div><span class="reel-colon">:</span><div class="time-reel-group"><div class="reel-digit-col"><div class="reel-digit-strip">${nums}</div></div><div class="reel-digit-col"><div class="reel-digit-strip">${nums}</div></div></div></div>`;
 }
 const cols=time.querySelectorAll('.reel-digit-col'),strips=time.querySelectorAll('.reel-digit-strip');
 let lastDigits=['','','','','',''];
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
     if(idx>=cols.length)return;
     const col=cols[idx],strip=strips[idx];
     strip.style.transform=`translateY(-${parseInt(d,10)*10}%)`;
     if(lastDigits[idx]!==''&&lastDigits[idx]!==d){
       col.classList.remove('is-springing');
       void col.offsetWidth;
       col.classList.add('is-springing');
     }
     lastDigits[idx]=d;
   });
 }
 tick();const timer=setInterval(()=>{if(!document.hidden)tick()},1000);document.addEventListener('visibilitychange',tick);
 return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick)};
}
