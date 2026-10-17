/**
 * ERP UDS 1.0 - 工业标准 Toast 提示服务
 */

export function showToast(message: string, isError: boolean = false): void {
  const container = document.getElementById('uds-toast-container');
  if (!container) {
    if (isError) {
      console.error(`[CRITICAL TOAST] ${message}`);
    } else {
      console.log(`[INFO TOAST] ${message}`);
    }
    return;
  }

  const toast = document.createElement('div');
  toast.className = `uds-toast ${isError ? 'error' : ''}`;
  toast.innerHTML = `
    <span style="font-weight: 800; font-size: 13px;">${isError ? '⚠️ 错误警报' : '✓ 操作成功'}</span>
    <span style="font-size: 12px; opacity: 0.9;">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'uds-fade-out 0.3s ease-in forwards';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, isError ? 4000 : 2500);
}
