/**
 * ERP UDS 1.0 - 模态弹窗与视图挂载服务
 */

export function openModal(modalId: string): void {
  const modal = document.getElementById(modalId);
  if (!modal) {
    console.error(`[CRITICAL] 未找到弹窗 DOM 节点: #${modalId}`);
    return;
  }
  modal.style.display = 'flex';
}

export function closeModal(modalId: string): void {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.style.display = 'none';
}

export function bindModalCloseTriggers(): void {
  document.querySelectorAll<HTMLElement>('.btn-close-modal').forEach(btn => {
    btn.onclick = () => {
      const backdrop = btn.closest<HTMLElement>('.uds-modal-backdrop');
      if (backdrop) {
        backdrop.style.display = 'none';
      }
    };
  });
}
