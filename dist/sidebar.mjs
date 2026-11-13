export function setupSidebar(){
 const sidebar=document.querySelector('.sidebar'),nav=sidebar.querySelector('nav'),brand=sidebar.querySelector('.brand'),header=document.createElement('div'),toggle=document.createElement('button'),mobile=matchMedia('(max-width:760px)');
 sidebar.id='appSidebar';nav.id='mainNavigation';header.className='sidebar-heading';toggle.type='button';toggle.id='sidebarToggle';toggle.className='secondary sidebar-toggle';toggle.setAttribute('aria-controls','mainNavigation');brand.before(header);header.append(brand,toggle);
 for(const button of nav.querySelectorAll('.nav')){const text=document.createElement('span');text.className='nav-text';for(const node of [...button.childNodes])if(node.nodeType===Node.TEXT_NODE)text.append(node);button.querySelector('.nav-icon').after(text);button.title=text.textContent.trim();button.setAttribute('aria-label',text.textContent.trim())}
 const read=(key,fallback)=>{try{return localStorage.getItem(key)===null?fallback:localStorage.getItem(key)==='true'}catch{return fallback}},save=(key,value)=>{try{localStorage.setItem(key,String(value))}catch{}};
 let collapsed=read('sot-sidebar-collapsed',false),mobileOpen=read('sot-sidebar-mobile-open',false);
 function render(){document.body.classList.toggle('sidebar-collapsed',!mobile.matches&&collapsed);document.body.classList.toggle('mobile-menu-open',mobile.matches&&mobileOpen);const expanded=mobile.matches?mobileOpen:!collapsed;toggle.setAttribute('aria-expanded',String(expanded));toggle.textContent=mobile.matches?(expanded?'×':'☰'):(expanded?'‹':'›');toggle.title=toggle.ariaLabel=expanded?'Thu gọn thanh điều hướng':'Mở rộng thanh điều hướng'}
 toggle.onclick=()=>{if(mobile.matches){mobileOpen=!mobileOpen;save('sot-sidebar-mobile-open',mobileOpen)}else{collapsed=!collapsed;save('sot-sidebar-collapsed',collapsed)}render()};
 nav.addEventListener('click',event=>{if(mobile.matches&&event.target.closest('.nav')){mobileOpen=false;save('sot-sidebar-mobile-open',false);render();toggle.focus()}});
 sidebar.addEventListener('keydown',event=>{if(event.key==='Escape'&&mobile.matches&&mobileOpen){mobileOpen=false;save('sot-sidebar-mobile-open',false);render();toggle.focus()}});
 mobile.addEventListener('change',render);render();
}
