export function installViewportSizing({window:win=window,document:doc=document}={}){
 const root=doc.documentElement,viewport=win.visualViewport;let frame=0;
 function apply(){frame=0;const unzoomed=!viewport||Math.abs((viewport.scale||1)-1)<.05;
  const height=Math.max(120,Math.min(win.innerHeight,unzoomed?viewport?.height||win.innerHeight:win.innerHeight));
  root.style.setProperty('--app-visible-height',height+'px');root.style.setProperty('--app-visible-top',(unzoomed?viewport?.offsetTop||0:0)+'px');
  const input=doc.activeElement,editing=!!input?.matches?.('input:not([type=checkbox]):not([type=radio]),textarea,[contenteditable=true]');
  root.classList.toggle('keyboard-open',editing&&win.innerHeight-height>100);
 }
 function update(){if(!frame)frame=win.requestAnimationFrame(apply)}
 for(const name of ['resize','orientationchange'])win.addEventListener(name,update);
 viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);
 doc.addEventListener('focusin',update);doc.addEventListener('focusout',update);apply();
 return ()=>{if(frame)win.cancelAnimationFrame(frame);for(const name of ['resize','orientationchange'])win.removeEventListener(name,update);viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);doc.removeEventListener('focusin',update);doc.removeEventListener('focusout',update)};
}
