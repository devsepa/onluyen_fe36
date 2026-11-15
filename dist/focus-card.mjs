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
 function tick(){const date=now(),period=focusPeriod(date.getHours());card.dataset.period=period;time.textContent=[date.getHours(),date.getMinutes(),date.getSeconds()].map(n=>String(n).padStart(2,'0')).join(':');time.title=date.toLocaleString('vi-VN');const label=document.getElementById('focusPeriodLabel');if(label)label.textContent=labels[period];}
 tick();const timer=setInterval(()=>{if(!document.hidden)tick()},1000);document.addEventListener('visibilitychange',tick);
 return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick)};
}
