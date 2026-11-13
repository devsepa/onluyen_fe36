export function detectSlideBorders(data,width,height){
 const darkRow=y=>{let dark=0;for(let x=0;x<width;x++){const i=(y*width+x)*4;if(data[i+3]>240&&Math.max(data[i],data[i+1],data[i+2])<58)dark++}return dark/width>=.985};
 let top=0,bottom=0;while(top<height*.25&&darkRow(top))top++;while(bottom<height*.25&&darkRow(height-1-bottom))bottom++;
 if(!top&&!bottom||top+bottom>height*.4)return {top:0,bottom:0};
 const brightRow=y=>{let bright=0;for(let x=0;x<width;x++){const i=(y*width+x)*4;if(Math.min(data[i],data[i+1],data[i+2])>190)bright++}return bright/width>.9};
 if(top&&!brightRow(top)||bottom&&!brightRow(height-1-bottom))return {top:0,bottom:0};
 let white=0,samples=0;for(let y=top;y<height-bottom;y+=Math.max(1,Math.floor(height/80)))for(let x=0;x<width;x+=3){const i=(y*width+x)*4;samples++;if(Math.min(data[i],data[i+1],data[i+2])>185)white++}
 return white/samples>.65?{top:top/height,bottom:bottom/height}:{top:0,bottom:0};
}
const active=new WeakMap();
export function disposeSlideFitting(root){for(const container of root.querySelectorAll('.slide-media-container'))active.get(container)?.dispose()}
export function fitSlideImage(container,image){
 if(!container.classList.contains('slide-media-container'))return;
 const previous=active.get(container);if(previous?.image===image){previous.update();return}previous?.dispose();
 const card=container.closest('.quiz-question');if(!card)return;
 let borders={top:0,bottom:0};
 try{const canvas=document.createElement('canvas');canvas.width=Math.min(320,image.naturalWidth);canvas.height=Math.min(1200,Math.max(1,Math.round(image.naturalHeight*canvas.width/image.naturalWidth)));const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,canvas.width,canvas.height);borders=detectSlideBorders(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height)}catch{/* Keep the original framing when pixels cannot be inspected. */}
 image.dataset.trimTop=String(borders.top);image.dataset.trimBottom=String(borders.bottom);
 let pending=false;
 function update(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;if(!container.isConnected||!document.body.classList.contains('quiz-active')||!card.getClientRects().length){dispose();return}if(scrollY)window.scrollTo(0,0);const page=card.closest('.page-content'),bottom=page?parseFloat(getComputedStyle(page).paddingBottom)||0:10;card.style.minHeight='0';card.style.height=Math.max(1,innerHeight-card.getBoundingClientRect().top-bottom)+'px';const explanation=card.querySelector('.feedback-inline-exp');explanation?.style.removeProperty('max-height');const style=getComputedStyle(card),children=[...card.children].filter(node=>node!==container&&getComputedStyle(node).display!=='none'),gap=parseFloat(style.rowGap)||0;let used=parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+gap*children.length;for(const node of children){node.style.flexShrink='0';const css=getComputedStyle(node);used+=node.getBoundingClientRect().height+(parseFloat(css.marginTop)||0)+(parseFloat(css.marginBottom)||0)}if(explanation&&used>card.clientHeight-40){const before=explanation.getBoundingClientRect().height;explanation.style.maxHeight=Math.max(32,before-(used-card.clientHeight+40))+'px';used-=before-explanation.getBoundingClientRect().height}const height=Math.max(1,card.clientHeight-used),width=Math.max(1,card.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)),ratio=image.naturalWidth/(image.naturalHeight*(1-borders.top-borders.bottom)),fitWidth=Math.min(width,height*ratio),fitHeight=fitWidth/ratio,fullHeight=fitHeight/(1-borders.top-borders.bottom);
  Object.assign(container.style,{flex:'0 0 auto',width:fitWidth+'px',height:fitHeight+'px',minHeight:'0',margin:'0 auto',alignSelf:'center',overflow:'hidden',border:'0',borderRadius:'0'});
  Object.assign(image.style,{position:'absolute',width:fitWidth+'px',height:fullHeight+'px',maxHeight:'none',maxWidth:'none',objectFit:'fill',left:'0',top:-fullHeight*borders.top+'px',margin:'0',borderRadius:'0'});
  container.dataset.fitted='true';
 })}
 const resize=new ResizeObserver(update),mutation=new MutationObserver(update);resize.observe(card);mutation.observe(card,{childList:true,subtree:true,characterData:true});
 function dispose(){resize.disconnect();mutation.disconnect();active.delete(container)}active.set(container,{image,update,dispose});update();
}
