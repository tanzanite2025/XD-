/**
 * ERP UDS 1.0 - 工艺与工价版本库业务模块
 */

import { invokeBackend } from '../core/ipc.js';
import { state, refreshSystemStats } from '../core/state.js';
import { showToast } from '../core/toast.js';
import { openModal, closeModal } from '../core/view_loader.js';
import productModelsModule from './product_models.js';

export default {
  async init() {
    this.bindEvents();
    this.renderProcessesTable();
  },

  async onActivated() {
    this.renderStationFilter();
    await this.loadProcesses();
  },

  renderStationFilter() {
    const filterSelect = document.getElementById('filter-proc-station');
    if (!filterSelect) return;

    let opts = '<option value="">全部推荐工位</option>';
    state.stations.forEach(s => {
      opts += `<option value="${s.id}">${s.station_code} - ${s.station_name}</option>`;
    });
    filterSelect.innerHTML = opts;
  },

  bindEvents() {
    document.getElementById('search-process')?.addEventListener('input', () => this.renderProcessesTable());
    document.getElementById('filter-proc-station')?.addEventListener('change', () => this.renderProcessesTable());

    const btnOpenAdd = document.getElementById('btn-open-add-process');
    if (btnOpenAdd) {
      btnOpenAdd.onclick = () => this.openAddProcessModal();
    }

    // 工艺弹窗中快捷新建型号
    document.getElementById('btn-quick-add-model')?.addEventListener('click', () => {
      productModelsModule.openAddModelModal();
    });

    // 保存工艺表单
    const formProc = document.getElementById('form-proc');
    if (formProc) {
      formProc.onsubmit = async (e) => {
        e.preventDefault();
        await this.saveProcess();
      };
    }

    // 工价版本调价表单
    const formPrice = document.getElementById('form-price-change');
    if (formPrice) {
      formPrice.onsubmit = async (e) => {
        e.preventDefault();
        await this.savePriceChange();
      };
    }
  },

  async loadProcesses() {
    try {
      state.processes = await invokeBackend('get_processes');
      this.renderProcessesTable();
    } catch (err) {
      showToast(`工艺列表拉取失败: ${err.message || err}`, true);
    }
  },

  renderProcessesTable() {
    const tbody = document.getElementById('processes-table-body');
    if (!tbody) return;

    const searchVal = document.getElementById('search-process')?.value.toLowerCase().trim() || '';
    const stationFilter = document.getElementById('filter-proc-station')?.value;

    const filtered = state.processes.filter(p => {
      if (stationFilter && p.recommended_station_id !== parseInt(stationFilter, 10)) return false;
      if (!searchVal) return true;
      return p.process_code.toLowerCase().includes(searchVal) ||
             p.process_name.toLowerCase().includes(searchVal) ||
             (p.product_spec && p.product_spec.toLowerCase().includes(searchVal));
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--muted-foreground); padding: 36px 0;">未检索到工艺数据</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(p => `
      <tr>
        <td class="uds-mono" style="font-weight: 700; color: var(--primary);">${p.process_code}</td>
        <td style="font-weight: 800; color: var(--foreground);">${p.process_name}</td>
        <td><span class="uds-badge" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; font-weight: 700;">${p.product_spec || '通用'}</span></td>
        <td><span class="uds-badge" style="background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;">${p.category || '成型'}</span></td>
        <td>
          <div style="font-weight: 700; color: var(--foreground);">${p.station_name || '未指定'}</div>
          <div class="uds-mono" style="color: var(--muted-foreground);">${p.station_code || ''}</div>
        </td>
        <td style="text-align: right; font-weight: 800; color: var(--emerald-text); font-size: 14px;" class="uds-mono">¥${Number(p.unit_price).toFixed(2)}</td>
        <td style="color: var(--muted-foreground); font-size: 11px;">${p.price_version_tag || '默认标准'}</td>
        <td style="text-align: center;"><span class="uds-badge uds-badge-healthy">锁定启用</span></td>
        <td style="text-align: center;">
          <button class="uds-btn-primary btn-adjust-price" data-id="${p.id}" style="height: 32px; padding: 0 14px; font-size: 10px;">调价沿革</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-adjust-price').forEach(btn => {
      btn.onclick = () => this.openPriceChangeModal(parseInt(btn.dataset.id, 10));
    });
  },

  openAddProcessModal() {
    document.getElementById('modal-proc-title').innerText = "产品工艺字典";
    document.getElementById('proc-id').value = '';
    document.getElementById('proc-code').value = '';
    document.getElementById('proc-name').value = '';
    
    // 渲染工位选择
    const stSelect = document.getElementById('proc-station-select');
    if (stSelect) {
      let opts = '<option value="">-- 选择推荐工位 --</option>';
      state.stations.forEach(s => {
        opts += `<option value="${s.id}">${s.station_code} - ${s.station_name}</option>`;
      });
      stSelect.innerHTML = opts;
    }

    // 渲染规格型号下拉框（强制从型号主数据中选择）
    this.renderProductModelSelectOptions();

    document.getElementById('proc-cat').value = '成型工段';
    document.getElementById('proc-price').value = '';
    document.getElementById('proc-unit').value = '只';
    document.getElementById('proc-version-tag').value = '2026年Q4碳纤标准定额';
    document.getElementById('proc-remarks').value = '';

    openModal('modal-process');
  },

  renderProductModelSelectOptions(selectedCode = null) {
    const select = document.getElementById('proc-spec');
    if (!select) return;

    if (!state.productModels || state.productModels.length === 0) {
      select.innerHTML = '<option value="">-- 暂无产品型号，请点击右侧【+新建型号】 --</option>';
      return;
    }

    let options = '<option value="">-- 请选择主数据型号 (禁止手输) --</option>';
    state.productModels.forEach(m => {
      const sel = (selectedCode && m.model_code === selectedCode) ? 'selected' : '';
      const hole = (m.hole_count && m.hole_count > 0) ? ` (${m.hole_count}孔)` : '';
      options += `<option value="${m.model_code}" ${sel}>${m.model_code} - ${m.model_name}${hole}</option>`;
    });

    select.innerHTML = options;
  },

  async saveProcess() {
    const id = document.getElementById('proc-id').value;
    const stIdVal = document.getElementById('proc-station-select').value;
    const versionTag = document.getElementById('proc-version-tag').value.trim();
    const specVal = document.getElementById('proc-spec').value.trim();

    if (!specVal) {
      showToast("[CRITICAL] 必须选择适用的产品规格型号，禁止为空或自由输入", true);
      return;
    }

    const procData = {
      id: id ? parseInt(id, 10) : null,
      workshop_id: parseInt(document.getElementById('proc-workshop').value, 10),
      workshop_code: null,
      workshop_name: null,
      recommended_station_id: stIdVal ? parseInt(stIdVal, 10) : null,
      station_code: null,
      station_name: null,
      process_code: document.getElementById('proc-code').value.trim(),
      process_name: document.getElementById('proc-name').value.trim(),
      product_spec: specVal,
      category: document.getElementById('proc-cat').value.trim(),
      unit_price: parseFloat(document.getElementById('proc-price').value) || 0,
      price_version_tag: versionTag,
      unit: document.getElementById('proc-unit').value.trim() || '只',
      remarks: document.getElementById('proc-remarks').value.trim(),
      status: 'ACTIVE',
    };

    try {
      await invokeBackend('save_process_with_pricing', { proc: procData, versionTag });
      showToast(`工艺 ${procData.process_name} 已成功保存发布`);
      closeModal('modal-process');
      await this.loadProcesses();
      await refreshSystemStats();
    } catch (err) {
      showToast(`保存工艺失败: ${err.message || err}`, true);
    }
  },

  async openPriceChangeModal(procId) {
    const proc = state.processes.find(p => p.id === procId);
    if (!proc) return;

    document.getElementById('price-change-proc-id').value = proc.id;
    document.getElementById('price-change-proc-info').innerText = `${proc.process_code} - ${proc.process_name} (当前单价: ¥${Number(proc.unit_price).toFixed(2)})`;
    document.getElementById('price-change-new-price').value = Number(proc.unit_price).toFixed(2);
    
    const effDate = document.getElementById('price-change-effective-date');
    if (effDate) effDate.value = new Date().toISOString().split('T')[0];

    document.getElementById('price-change-version-tag').value = `2026年Q4工艺定额调价`;

    // 渲染历史调价记录
    const histContainer = document.getElementById('price-history-container');
    if (histContainer) {
      try {
        const histories = await invokeBackend('get_process_price_history', { processId: proc.id });
        if (!histories || histories.length === 0) {
          histContainer.innerHTML = `<div style="color: var(--muted-foreground); font-size: 11px;">暂无历史调价沿革记录</div>`;
        } else {
          histContainer.innerHTML = histories.map(h => `
            <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed var(--border-dashed); font-size: 11px;">
              <span class="uds-mono" style="font-weight: 700; color: var(--emerald-text);">¥${Number(h.unit_price).toFixed(2)}</span>
              <span style="color: var(--foreground); font-weight: 600;">${h.version_tag || '无版本说明'}</span>
              <span class="uds-mono" style="color: var(--muted-foreground);">${h.effective_date} 生效</span>
            </div>
          `).join('');
        }
      } catch (err) {
        histContainer.innerHTML = `<div style="color: var(--rose-text); font-size: 11px;">加载历史调价失败: ${err.message || err}</div>`;
      }
    }

    openModal('modal-price-change');
  },

  async savePriceChange() {
    const procId = parseInt(document.getElementById('price-change-proc-id').value, 10);
    const newPrice = parseFloat(document.getElementById('price-change-new-price').value) || 0;
    const versionTag = document.getElementById('price-change-version-tag').value.trim();

    const proc = state.processes.find(p => p.id === procId);
    if (!proc) return;

    try {
      const updatedProc = { ...proc, unit_price: newPrice };
      await invokeBackend('save_process_with_pricing', { proc: updatedProc, versionTag });
      showToast(`工价版本已更新为 ¥${newPrice.toFixed(2)} (${versionTag})，历史流水保持单价快照不变`);
      closeModal('modal-price-change');
      await this.loadProcesses();
    } catch (err) {
      showToast(`调价失败: ${err.message || err}`, true);
    }
  }
};
