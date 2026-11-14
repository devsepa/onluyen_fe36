export function createResourcePolicy({storage,connection=globalThis.navigator?.connection,mobile=()=>globalThis.matchMedia?.('(pointer: coarse)').matches||false,reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false}={}){
 let preference=null;try{const saved=storage?.getItem('sot-economy-mode');if(saved==='true'||saved==='false')preference=saved==='true'}catch{}
 const listeners=new Set();const policy={get economy(){return preference??!!(connection?.saveData||mobile()||reducedMotion())},get memoryImages(){return this.economy?8:24},get publicCacheBytes(){return (this.economy?8:24)*1024*1024},get aheadImages(){return this.economy?1:2},get aheadExplanations(){return this.economy?1:3},set(value){preference=!!value;try{storage?.setItem('sot-economy-mode',String(preference))}catch{}for(const listener of listeners)listener(policy)},subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener)}};return policy;
}
export function mountResourceControl(policy){
 const menu=document.querySelector('#accountMenu'),label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');
 label.className='resource-saving-control';input.type='checkbox';text.textContent='Tiết kiệm tài nguyên';label.append(input,text);const note=document.createElement('small');note.textContent='Giảm hiệu ứng và tải trước, giữ nguyên chất lượng ảnh.';label.append(note);menu.append(label);
 const update=()=>{input.checked=policy.economy;document.documentElement.classList.toggle('economy-mode',policy.economy)};input.onchange=()=>policy.set(input.checked);policy.subscribe(update);update();
}
