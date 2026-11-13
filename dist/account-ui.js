const $=id=>document.getElementById(id);
const guestIcon='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2"/></svg>';
export function setupAccount({onConnect,onDisconnect}){
 const button=$('accountButton'),menu=$('accountMenu');
 function close(){menu.hidden=true;button.setAttribute('aria-expanded','false')}
 function open(){menu.hidden=false;button.setAttribute('aria-expanded','true');menu.querySelector('button:not([hidden])')?.focus()}
 button.onclick=()=>menu.hidden?open():close();
 button.onkeydown=event=>{if(event.key==='ArrowDown'){event.preventDefault();open()}};
 menu.setAttribute('role','menu');menu.setAttribute('aria-label','Tài khoản Google');
 menu.querySelectorAll(':scope>button').forEach(item=>item.setAttribute('role','menuitem'));
 menu.onkeydown=event=>{
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();const items=[...menu.querySelectorAll('button:not([hidden])')],index=items.indexOf(document.activeElement);
  const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
  items[next]?.focus();
 };
 document.addEventListener('click',event=>{if(!event.target.closest('.account-control'))close()});
 document.addEventListener('focusin',event=>{if(!event.target.closest('.account-control'))close()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){close();button.focus()}});
 for(const id of ['accountLogin','accountSwitch'])$(id).onclick=()=>{close();onConnect({switchAccount:id==='accountSwitch'})};
 $('accountLogout').onclick=()=>{close();onDisconnect()};
 function update(profile){
  const connected=!!profile;
  button.replaceChildren();button.classList.toggle('connected',connected);
  button.setAttribute('aria-label',connected?`Tài khoản ${profile.name||profile.email||'Google'}`:'Tài khoản: đăng nhập Google');
  button.title=connected?(profile.email||profile.name||'Tài khoản Google'):'Đăng nhập Google';
  $('accountName').textContent=connected?(profile.name||'Tài khoản Google'):'Khách';
  $('accountEmail').textContent=connected?(profile.email||'Đã kết nối Google'):'Đăng nhập để kết nối tài liệu của bạn.';
  $('accountLogin').hidden=connected;$('accountSwitch').hidden=!connected;$('accountLogout').hidden=!connected;
  if(!connected){button.innerHTML=guestIcon;return}
  const initials=(profile.name||profile.email||'G').trim().split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase();
  const fallback=document.createElement('span');fallback.textContent=initials;button.append(fallback);
  try{
   const url=new URL(profile.picture);if(url.protocol!=='https:')return;
   const picture=document.createElement('img');picture.alt='';picture.referrerPolicy='no-referrer';picture.src=url.href;
   picture.onload=()=>{fallback.hidden=true};picture.onerror=()=>picture.remove();button.append(picture);
  }catch{/* Use initials when Google has no profile picture. */}
 }
 update(null);return {update,close};
}
