/**
 * ERP UDS 1.0 - 数据安全保险箱与物理快照备份强类型业务模块
 */

import { invokeBackend } from '../core/ipc';
import { loadMasterData, refreshSystemStats } from '../core/state';
import { showToast } from '../core/toast';
import { BackupInfo } from '../types/models';

export default {
  async init(): Promise<void> {
    this.bindEvents();
    await this.refreshVaultStatus();
  },

  async onActivated(): Promise<void> {
    await this.refreshVaultStatus();
  },

  bindEvents(): void {
    document.getElementById('btn-trigger-vault-backup')?.addEventListener('click', () => this.triggerBackup());
    document.getElementById('btn-open-backup-folder')?.addEventListener('click', () => this.openBackupFolder());
    document.getElementById('btn-refresh-backups')?.addEventListener('click', () => this.loadBackupsList());
  },

  async refreshVaultStatus(): Promise<void> {
    await Promise.all([
      this.loadBackupsList(),
      this.updateDbStats()
    ]);
  },

  async updateDbStats(): Promise<void> {
    try {
      const stats = await invokeBackend('get_system_stats');
      const sizeEl = document.getElementById('vault-db-size');
      if (sizeEl) {
        sizeEl.textContent = `${(stats as unknown as { db_size_kb?: number }).db_size_kb || 0} KB`;
      }
    } catch {
      // 容错统计展示
    }
  },

  async triggerBackup(): Promise<void> {
    try {
      const filename = await invokeBackend('backup_database');
      showToast(`物理数据库快照已生成: ${filename}`);
      await this.loadBackupsList();
      await refreshSystemStats();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`快照备份失败: ${msg}`, true);
    }
  },

  async loadBackupsList(): Promise<void> {
    const listContainer = document.getElementById('vault-backups-list');
    if (!listContainer) return;

    try {
      const backups = await invokeBackend('list_backups');
      if (!backups || backups.length === 0) {
        listContainer.innerHTML = `<div style="color: var(--muted-foreground); font-size: 12px; padding: 18px 0; text-align: center;">尚未生成过物理快照</div>`;
        return;
      }

      listContainer.innerHTML = backups.map((b: BackupInfo) => {
        const sizeKb = (b.file_size_bytes / 1024).toFixed(1);
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 12px 16px; border-radius: 14px; border: 1px dashed var(--border-dashed);">
            <div>
              <div class="uds-mono" style="color: var(--primary); font-weight: 700; font-size: 11px;">${b.filename}</div>
              <div class="uds-desc" style="color: var(--muted-foreground); margin-top: 2px;">${b.created_at} · ${sizeKb} KB</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <button class="uds-btn-primary btn-restore-backup" data-filename="${b.filename}" style="height: 28px; padding: 0 12px; font-size: 9px;">还原此快照</button>
              <button class="uds-btn-danger btn-delete-backup" data-filename="${b.filename}" style="height: 28px; padding: 0 10px; font-size: 9px;">删除</button>
            </div>
          </div>
        `;
      }).join('');

      listContainer.querySelectorAll<HTMLButtonElement>('.btn-restore-backup').forEach(btn => {
        btn.onclick = () => {
          const fn = btn.dataset.filename;
          if (fn) this.restoreBackup(fn);
        };
      });

      listContainer.querySelectorAll<HTMLButtonElement>('.btn-delete-backup').forEach(btn => {
        btn.onclick = () => {
          const fn = btn.dataset.filename;
          if (fn) this.deleteBackup(fn);
        };
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`备份列表拉取失败: ${msg}`, true);
    }
  },

  async restoreBackup(filename: string): Promise<void> {
    if (!confirm(`【安全警示】确定要将生产数据库物理还原至历史快照 [${filename}] 吗？\n\n系统会在还原前自动生成 pre_restore 救援快照，确保数据可回溯。`)) {
      return;
    }

    try {
      await invokeBackend('restore_backup', { filename });
      showToast(`数据库已成功物理还原至快照: ${filename}`);
      await loadMasterData();
      await this.refreshVaultStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`还原失败: ${msg}`, true);
    }
  },

  async deleteBackup(filename: string): Promise<void> {
    if (!confirm(`确定要永久删除物理快照文件 [${filename}] 吗？此操作无法撤销。`)) {
      return;
    }

    try {
      await invokeBackend('delete_backup', { filename });
      showToast(`快照文件 [${filename}] 已物理移除`);
      await this.loadBackupsList();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`删除快照失败: ${msg}`, true);
    }
  },

  async openBackupFolder(): Promise<void> {
    try {
      await invokeBackend('open_backup_folder');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`打开备份目录失败: ${msg}`, true);
    }
  }
};
