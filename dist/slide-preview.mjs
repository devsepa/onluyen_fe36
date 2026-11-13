export function setupSlidePreview({getQuestion,getImage}){
 const dialog=document.createElement('dialog');dialog.className='slide-preview';dialog.setAttribute('aria-labelledby','slidePreviewTitle');
 dialog.innerHTML='<div class="slide-preview-head"><h2 id="slidePreviewTitle">Đối chiếu slide gốc</h2><button type="button" class="secondary" id="closeSlidePreview" aria-label="Đóng ảnh slide">Đóng ✕</button></div><p>Ảnh gốc dùng để kiểm tra ký tự. Nội dung nhận dạng không được tự sửa hoặc suy đoán.</p><p id="slidePreviewStatus" role="status"></p><div class="slide-preview-tools"><button id="slidePreviewFit" type="button" class="secondary" aria-pressed="true">Vừa màn hình</button><button id="slidePreviewActual" type="button" class="secondary" aria-pressed="false">Kích thước gốc · 100%</button></div><div class="slide-preview-image is-fit"><img id="slidePreviewImage" alt="" hidden></div>';
 document.body.append(dialog);let epoch=0,objectUrl=null,previousFocus;
 function release(){epoch++;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;dialog.querySelector('img').removeAttribute('src');previousFocus?.focus()}
 dialog.querySelector('#closeSlidePreview').onclick=()=>dialog.close();dialog.addEventListener('close',release);
 function setFit(fit){dialog.querySelector('.slide-preview-image').classList.toggle('is-fit',fit);dialog.querySelector('#slidePreviewFit').setAttribute('aria-pressed',String(fit));dialog.querySelector('#slidePreviewActual').setAttribute('aria-pressed',String(!fit))}
 dialog.querySelector('#slidePreviewFit').onclick=()=>setFit(true);dialog.querySelector('#slidePreviewActual').onclick=()=>setFit(false);
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-preview-slide]');if(!button)return;
  const q=getQuestion(button.dataset.previewSlide);if(!q)return;
  previousFocus=button;const run=++epoch,img=dialog.querySelector('img'),status=dialog.querySelector('#slidePreviewStatus');
  img.hidden=true;setFit(true);status.textContent='Đang tải ảnh slide gốc…';dialog.querySelector('h2').textContent=`Đối chiếu slide ${q.slide}`;dialog.showModal();
  try{
   const url=await getImage(q);
   if(run!==epoch||!dialog.open){URL.revokeObjectURL(url);return}
   objectUrl=url;img.alt=`Ảnh slide gốc ${q.slide}`;img.src=url;img.hidden=false;status.textContent='Phóng to ảnh để kiểm tra dấu, toán tử và tên tham số; cuộn ngang nếu cần.';
   img.onerror=()=>{if(run===epoch){img.hidden=true;status.textContent='Không hiển thị được ảnh. Hãy dùng Mở slide để kiểm tra.'}};
  }catch(error){if(run===epoch)status.textContent=error.message}
 });
}
