export function askConfirm(message, {
  title = 'Xác nhận',
  okText = 'Đồng ý',
  cancelText = 'Hủy',
  danger = false
} = {}) {
  return new Promise(resolve => {
    let dialog = document.getElementById('appConfirmDialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'appConfirmDialog';
      dialog.className = 'app-confirm-dialog';
      dialog.setAttribute('aria-modal', 'true');
      document.body.appendChild(dialog);
    }

    dialog.innerHTML = `
      <div class="confirm-card ${danger ? 'is-danger' : ''}">
        <div class="confirm-header">
          <div class="confirm-icon-bubble">
            ${danger ? '⚠️' : '❓'}
          </div>
          <div class="confirm-text-group">
            <h3 class="confirm-title">${esc(title)}</h3>
            <p class="confirm-desc">${esc(message)}</p>
          </div>
        </div>
        <div class="confirm-actions">
          <button type="button" class="secondary confirm-btn-cancel">${esc(cancelText)}</button>
          <button type="button" class="confirm-btn-ok ${danger ? 'danger' : ''}">${esc(okText)}</button>
        </div>
      </div>
    `;

    const cancelBtn = dialog.querySelector('.confirm-btn-cancel');
    const okBtn = dialog.querySelector('.confirm-btn-ok');

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      dialog.close();
      resolve(value);
    };

    cancelBtn.onclick = () => finish(false);
    okBtn.onclick = () => finish(true);
    dialog.oncancel = (e) => {
      e.preventDefault();
      finish(false);
    };

    dialog.showModal();
    (danger ? cancelBtn : okBtn).focus();
  });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

if (typeof window !== 'undefined') {
  window.askConfirm = askConfirm;
}
