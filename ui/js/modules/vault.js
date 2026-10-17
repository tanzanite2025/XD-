/**
 * ERP UDS 1.0 - 数据安全保险箱与物理快照备份业务模块
 */

import { invokeBackend } from '../core/ipc.js';
import { loadMasterData, refreshSystemStats } from '../core/state.js';
import { showToast } from '../core/toast.js';

export default {
  async init() {
    this.bindEvents();
    await this.refreshVaultStatus();
  },

  async onActivated() {
    await this.refreshVaultStatus();
  },

  bindEvents() {
    document.getElementById('btn-trigger-vault-backup')?.addEventListener('click', () => this.triggerBackup());
    document.getElementById('btn-open-backup-folder')?.addEventListener('click', () => this.openBackupFolder());
    document.getElementById('btn-refresh-backups')?.addEventListener('click', () => this.loadBackupsList());
  },

  async refreshVaultStatus() {
    await Promise.all([
      this.loadBackupsList(),
      this.updateDbStats()
    ]);
  },

  async updateDbStats() {
    try {
      const stats = await invokeBackend('get_system_stats');
      const sizeEl = document.getElementById('vault-db-size');
      if (sizeEl) {
        sizeEl.textContent = `${stats.db_size_kb || 0} KB`;
      }
    } catch (e) {}
  },

  async triggerBackup() {
    try {
      const filename = await invokeBackend('backup_database');
      showToast(`物理数据库快照已生成: ${filename}`);
      await this.loadBackupsList();
      await refreshSystemStats();
    } catch (err) {
      showToast(`快照备份失败: ${err.message || err}`, true);
    }
  },

  async loadBackupsList() {
    const listContainer = document.getElementById('vault-backups-list');
    if (!listContainer) return;

    try {
      const backups = await invokeBackend('list_backups');
      if (!backups || backups.length === 0) {
        listContainer.innerHTML = `<div style="color: var(--muted-foreground); font-size: 12px; padding: 18px 0; text-align: center;">尚未生成过物理快照</div>`;
        return;
      }

      listContainer.innerHTML = backups.map(b => {
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

      listContainer.querySelectorAll('.btn-restore-backup').forEach(btn => {
        btn.onclick = () => this.restoreBackup(btn.dataset.filename);
      });

      listContainer.querySelectorAll('.btn-delete-backup').forEach(btn => {
        btn.onclick = () => this.deleteBackup(btn.dataset.filename);
      });
    } catch (err) {
      showToast(`备份列表拉取失败: ${err.message || err}`, true);
    }
  },

  async restoreBackup(filename) {
    if (!confirm(`【安全警示】确定要将生产数据库物理还原至历史快照 [${filename}] 吗？\n\n系统会在还原前自动生成 pre_restore 救援快照，确保数据可回溯。`)) {
      return;
    }

    try {
      await invokeBackend('restore_backup', { filename });
      showToast(`数据库已成功物理还原至快照: ${filename}`);
      await loadMasterData();
      await this.loadBackupsList();
    } catch (err) {
      showToast(`还原失败: ${err.message || err}`, true);
    }
  },

  async deleteBackup(filename) {
    if (!confirm(`确定要永久删除备份文件 [${filename}] 吗？`)) return;

    try {
      await invokeBackend('delete_backup', { filename });
      showToast(`备份文件 [${filename}] 已删除`);
      await this.loadBackupsList();
    } catch (err) {
      showToast(`删除失败: ${err.message || err}`, true);
    }
  },

  async openBackupFolder() {
    try {
      await invokeBackend('open_backup_folder');
      showToast("已在 Windows 资源管理器中打开备份文件夹");
    } catch (err) {
      showToast(`打开备份文件夹失败: ${err.message || err}`, true);
    }
  }
};
