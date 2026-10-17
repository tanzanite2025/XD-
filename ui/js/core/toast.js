/**
 * ERP UDS 1.0 - 工业规范通知框 (Toast)
 * 严格遵循 Fail Loudly 规范
 */

export function showToast(message, isError = false) {
  let container = document.getElementById('uds-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'uds-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `uds-toast ${isError ? 'error' : 'success'}`;
  
  const iconSvg = isError 
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;

  toast.innerHTML = `
    ${iconSvg}
    <div style="flex: 1; word-break: break-all;">${message}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, isError ? 5000 : 3000);
}
