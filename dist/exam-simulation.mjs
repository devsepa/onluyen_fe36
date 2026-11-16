export function setupExamSimulation({getSession,persist}){
 let warning,reason,started=false,fullscreenUnavailable=false;
 const active=()=>{const s=getSession();return s?.mode==='exam'&&!s.done};
 function clear(){warning?.remove();warning=null;document.body.classList.remove('exam-warning-active')}
 function warn(text){if(!active())return;reason=text;const s=getSession();s.examWarnings=(s.examWarnings||0)+1;persist();show()}
 function show(){if(!active()){clear();return}if(warning){warning.querySelector('p').textContent=reason;return}
  warning=document.createElement('dialog');warning.className='exam-simulation-warning';warning.setAttribute('aria-labelledby','examWarningTitle');
  warning.innerHTML='<span class="exam-warning-symbol" aria-hidden="true">!</span><h2 id="examWarningTitle">Quay lại bài thi</h2><p></p><small>Thời gian làm bài vẫn tiếp tục chạy. Câu trả lời của bạn được giữ nguyên.</small><button type="button">Tiếp tục làm bài · Toàn màn hình</button><span class="exam-fullscreen-status" role="status"></span>';
  warning.querySelector('p').textContent=reason;warning.addEventListener('cancel',e=>e.preventDefault());warning.querySelector('button').onclick=async()=>{await fullscreen();clear()};document.body.append(warning);warning.showModal();document.body.classList.add('exam-warning-active');
 }
 async function fullscreen(){if(document.fullscreenElement)return true;try{if(!document.documentElement.requestFullscreen)throw Error();await document.documentElement.requestFullscreen();return true}catch{return false}}
 document.addEventListener('visibilitychange',()=>{if(!active())return;if(document.hidden)warn('Bạn đã chuyển tab hoặc rời màn hình làm bài. Hãy quay lại để tiếp tục thi.');else if(reason)show()});
 document.addEventListener('fullscreenchange',()=>{if(started&&active()&&!document.fullscreenElement)warn('Bạn đã thoát toàn màn hình. Hãy trở lại giao diện thi.');if(!active())clear()});
 window.addEventListener('blur',()=>{if(active())warn('Màn hình bài thi đã mất tập trung. Hãy quay lại để tiếp tục làm bài.')});
 // Submission and automatic timeout must remove any modal immediately.
 const timer=setInterval(()=>{if(warning&&!active())clear()},250);
 return {async begin(){started=true;reason='';const ok=await fullscreen();fullscreenUnavailable=!ok;if(!ok&&active())warn('Trình duyệt chưa cho phép toàn màn hình. Bạn vẫn có thể làm bài; hãy tập trung trong giao diện thi.')},arm(){if(fullscreenUnavailable)warn('Trình duyệt chưa cho phép toàn màn hình. Bạn vẫn có thể làm bài trong giao diện thi.')},warn,finish(){started=false;fullscreenUnavailable=false;reason='';clear();if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})},destroy(){clearInterval(timer);clear()}};
}
