export function setupSlidePreview({getQuestion,getImage}){
 const dialog=document.createElement('dialog');dialog.className='slide-preview';dialog.setAttribute('aria-label','Ảnh slide phóng to');
 dialog.innerHTML='<button type="button" class="secondary" id="closeSlidePreview" aria-label="Đóng ảnh slide">✕</button><p id="slidePreviewStatus" role="status" hidden></p><div class="slide-preview-image"><img id="slidePreviewImage" alt="" hidden></div>';
 document.body.append(dialog);let epoch=0,objectUrl=null,previousFocus;
 const img=dialog.querySelector('img'),status=dialog.querySelector('#slidePreviewStatus');
 function release(){epoch++;img.onerror=null;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;img.removeAttribute('src');previousFocus?.focus()}
 dialog.querySelector('#closeSlidePreview').onclick=()=>dialog.close();dialog.addEventListener('close',release);
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-preview-slide]');if(!button)return;
  const q=getQuestion(button.dataset.previewSlide);if(!q)return;
  previousFocus=button;const run=++epoch;
  if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;img.onerror=null;img.hidden=true;img.removeAttribute('src');
  status.hidden=false;status.textContent='Đang tải ảnh…';dialog.showModal();
  try{
   const url=await getImage(q);
   if(run!==epoch||!dialog.open){URL.revokeObjectURL(url);return}
   objectUrl=url;img.alt=`Ảnh slide gốc ${q.slide}`;
   img.onerror=()=>{if(run===epoch){img.hidden=true;status.hidden=false;status.textContent='Không tải được ảnh. Hãy thử lại hoặc mở slide gốc.'}};
   img.src=url;img.hidden=false;status.textContent='';status.hidden=true;
  }catch(error){if(run===epoch){status.hidden=false;status.textContent=error.message}}
 });
}
