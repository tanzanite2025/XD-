/**
 * ERP UDS 1.0 - 碳纤维加工工艺与工价版本库强类型业务模块
 */

import { invokeBackend } from '../core/ipc';
import { state, refreshSystemStats } from '../core/state';
import { showToast } from '../core/toast';
import { openModal, closeModal } from '../core/view_loader';
import productModelsModule from './product_models';
import { ProcessItem, ProcessPriceVersion, Station, ProductModel } from '../types/models';

export default {
  async init(): Promise<void> {
    this.bindEvents();
    this.renderProcessesTable();
  },

  async onActivated(): Promise<void> {
    this.renderStationFilter();
    await this.loadProcesses();
  },

  renderStationFilter(): void {
    const filterSelect = document.getElementById('filter-proc-station') as HTMLSelectElement | null;
    if (!filterSelect) return;

    let opts = '<option value="">全部推荐工位</option>';
    (state.stations || []).forEach((s: Station) => {
      opts += `<option value="${s.id}">${s.station_code} - ${s.station_name}</option>`;
    });
    filterSelect.innerHTML = opts;
  },

  bindEvents(): void {
    document.getElementById('search-process')?.addEventListener('input', () => this.renderProcessesTable());
    document.getElementById('filter-proc-station')?.addEventListener('change', () => this.renderProcessesTable());

    const btnOpenAdd = document.getElementById('btn-open-add-process');
    if (btnOpenAdd) {
      btnOpenAdd.onclick = () => this.openAddProcessModal();
    }

    document.getElementById('btn-quick-add-model')?.addEventListener('click', () => {
      productModelsModule.openAddModelModal();
    });

    const formProc = document.getElementById('form-proc') as HTMLFormElement | null;
    if (formProc) {
      formProc.onsubmit = async (e: Event) => {
        e.preventDefault();
        await this.saveProcess();
      };
    }

    const formPrice = document.getElementById('form-price-change') as HTMLFormElement | null;
    if (formPrice) {
      formPrice.onsubmit = async (e: Event) => {
        e.preventDefault();
        await this.savePriceChange();
      };
    }
  },

  async loadProcesses(): Promise<void> {
    try {
      state.processes = await invokeBackend('get_processes');
      this.renderProcessesTable();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`工艺列表拉取失败: ${msg}`, true);
    }
  },

  renderProcessesTable(): void {
    const tbody = document.getElementById('processes-table-body');
    if (!tbody) return;

    const searchInput = document.getElementById('search-process') as HTMLInputElement | null;
    const searchVal = searchInput?.value.toLowerCase().trim() || '';
    const stationFilter = (document.getElementById('filter-proc-station') as HTMLSelectElement | null)?.value;

    const filtered = (state.processes || []).filter((p: ProcessItem) => {
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

    tbody.innerHTML = filtered.map((p: ProcessItem) => `
      <tr>
        <td class="uds-mono" style="font-weight: 700; color: var(--primary);">${p.process_code}</td>
        <td style="font-weight: 800; color: var(--foreground);">${p.process_name}</td>
        <td><span class="uds-badge" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; font-weight: 700;">${p.product_spec || '通用'}</span></td>
        <td><span class="uds-badge" style="background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;">${p.category || '成型'}</span></td>
        <td class="uds-mono" style="font-weight: 800; font-size: 14px; color: var(--emerald-text); text-align: right;">¥${Number(p.unit_price).toFixed(2)}</td>
        <td class="uds-mono" style="font-size: 11px; color: var(--muted-foreground);">${p.price_version_tag || '标准基准工价'}</td>
        <td>${p.station_name || '通用工位'}</td>
        <td style="text-align: center;"><span class="uds-badge uds-badge-healthy">现行执行</span></td>
        <td style="text-align: center;">
          <button class="uds-btn-ghost btn-proc-price" data-id="${p.id}" data-name="${p.process_name}" data-price="${p.unit_price}">调价</button>
          <button class="uds-btn-danger btn-proc-delete" data-id="${p.id}" style="margin-left: 4px;">删除</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll<HTMLButtonElement>('.btn-proc-price').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id ? parseInt(btn.dataset.id, 10) : 0;
        const name = btn.dataset.name || '';
        const price = parseFloat(btn.dataset.price || '0');
        this.openPriceChangeModal(id, name, price);
      };
    });

    tbody.querySelectorAll<HTMLButtonElement>('.btn-proc-delete').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id ? parseInt(btn.dataset.id, 10) : 0;
        this.deleteProcess(id);
      };
    });
  },

  async openAddProcessModal(): Promise<void> {
    const idInput = document.getElementById('proc-id') as HTMLInputElement | null;
    const codeInput = document.getElementById('proc-code') as HTMLInputElement | null;
    const nameInput = document.getElementById('proc-name') as HTMLInputElement | null;
    const priceInput = document.getElementById('proc-price') as HTMLInputElement | null;
    const remarksInput = document.getElementById('proc-remarks') as HTMLInputElement | null;

    if (idInput) idInput.value = '';
    if (codeInput) codeInput.value = '';
    if (nameInput) nameInput.value = '';
    if (priceInput) priceInput.value = '';
    if (remarksInput) remarksInput.value = '';

    const stSelect = document.getElementById('proc-station-select') as HTMLSelectElement | null;
    if (stSelect) {
      let opts = '<option value="">-- 选择推荐归属工位 --</option>';
      (state.stations || []).forEach((s: Station) => {
        opts += `<option value="${s.id}">${s.station_code} - ${s.station_name}</option>`;
      });
      stSelect.innerHTML = opts;
    }

    const specSelect = document.getElementById('proc-spec-select') as HTMLSelectElement | null;
    if (specSelect) {
      let opts = '<option value="">-- 选择产品型号 (下拉选取) --</option>';
      (state.productModels || []).forEach((m: ProductModel) => {
        const holeText = m.hole_count ? ` (${m.hole_count}孔)` : '';
        opts += `<option value="${m.model_name}">${m.model_code} - ${m.model_name}${holeText}</option>`;
      });
      specSelect.innerHTML = opts;
    }

    openModal('modal-process');
  },

  async saveProcess(): Promise<void> {
    const code = (document.getElementById('proc-code') as HTMLInputElement | null)?.value.trim() || '';
    const name = (document.getElementById('proc-name') as HTMLInputElement | null)?.value.trim() || '';
    const spec = (document.getElementById('proc-spec-select') as HTMLSelectElement | null)?.value || '';
    const cat = (document.getElementById('proc-category') as HTMLInputElement | null)?.value.trim() || '成型';
    const price = parseFloat((document.getElementById('proc-price') as HTMLInputElement | null)?.value || '0');
    const unit = (document.getElementById('proc-unit') as HTMLInputElement | null)?.value.trim() || '件';
    const stationIdVal = (document.getElementById('proc-station-select') as HTMLSelectElement | null)?.value;
    const remarks = (document.getElementById('proc-remarks') as HTMLInputElement | null)?.value.trim() || '';

    if (!code || !name || !spec || isNaN(price) || price < 0) {
      showToast("[CRITICAL] 请完整填写工艺编码、工序名称、规格型号及有效单价", true);
      return;
    }

    const procData: ProcessItem = {
      id: null,
      workshop_id: 1,
      workshop_code: null,
      workshop_name: null,
      recommended_station_id: stationIdVal ? parseInt(stationIdVal, 10) : null,
      station_code: null,
      station_name: null,
      process_code: code,
      process_name: name,
      product_spec: spec,
      category: cat,
      unit_price: price,
      price_version_tag: '初始建立',
      unit: unit,
      remarks: remarks,
      status: 'ACTIVE',
    };

    try {
      await invokeBackend('save_process_with_pricing', {
        process: procData,
        priceVersionTag: '初始建档单价生效'
      });

      showToast(`工艺 ${procData.process_name} 建档成功`);
      closeModal('modal-process');
      await this.loadProcesses();
      await refreshSystemStats();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`保存工艺失败: ${msg}`, true);
    }
  },

  async openPriceChangeModal(id: number, name: string, currentPrice: number): Promise<void> {
    const title = document.getElementById('modal-price-title');
    if (title) title.innerText = `调整工价版本 - ${name}`;

    const idInput = document.getElementById('price-proc-id') as HTMLInputElement | null;
    const curInput = document.getElementById('price-current') as HTMLInputElement | null;
    const newInput = document.getElementById('price-new') as HTMLInputElement | null;
    const tagInput = document.getElementById('price-tag') as HTMLInputElement | null;

    if (idInput) idInput.value = String(id);
    if (curInput) curInput.value = `¥${currentPrice.toFixed(2)}`;
    if (newInput) newInput.value = '';
    if (tagInput) tagInput.value = '';

    await this.loadPriceHistory(id);
    openModal('modal-price-change');
  },

  async loadPriceHistory(procId: number): Promise<void> {
    const listContainer = document.getElementById('price-history-list');
    if (!listContainer) return;

    try {
      const history = await invokeBackend('get_process_price_history', { processId: procId });
      if (history.length === 0) {
        listContainer.innerHTML = `<div style="text-align: center; color: var(--muted-foreground); padding: 18px 0;">暂无调价历史追溯</div>`;
        return;
      }

      listContainer.innerHTML = history.map((h: ProcessPriceVersion) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #ffffff; border-radius: 10px; border: 1px solid var(--border-dashed);">
          <div>
            <span style="font-weight: 700; font-size: 13px;">${h.version_tag}</span>
            <div class="uds-mono" style="font-size: 10px; color: var(--muted-foreground); margin-top: 2px;">生效日期: ${h.effective_date}</div>
          </div>
          <div class="uds-mono" style="font-weight: 800; font-size: 14px; color: var(--emerald-text);">
            ¥${Number(h.unit_price).toFixed(2)}
          </div>
        </div>
      `).join('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      listContainer.innerHTML = `<div style="color: var(--rose-text); padding: 10px;">加载调价历史异常: ${msg}</div>`;
    }
  },

  async savePriceChange(): Promise<void> {
    const procIdVal = (document.getElementById('price-proc-id') as HTMLInputElement | null)?.value;
    const newPriceVal = parseFloat((document.getElementById('price-new') as HTMLInputElement | null)?.value || '0');
    const tagVal = (document.getElementById('price-tag') as HTMLInputElement | null)?.value.trim() || '';

    if (!procIdVal || isNaN(newPriceVal) || newPriceVal < 0 || !tagVal) {
      showToast("[CRITICAL] 请输入有效的调整后新单价及调价版本依据说明", true);
      return;
    }

    const procId = parseInt(procIdVal, 10);
    const proc = (state.processes || []).find((p: ProcessItem) => p.id === procId);
    if (!proc) return;

    const updatedProc: ProcessItem = {
      ...proc,
      unit_price: newPriceVal,
      price_version_tag: tagVal
    };

    try {
      await invokeBackend('save_process_with_pricing', {
        process: updatedProc,
        priceVersionTag: tagVal
      });

      showToast(`工艺单价已调增并生效: ¥${newPriceVal.toFixed(2)}`);
      closeModal('modal-price-change');
      await this.loadProcesses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`工价更新失败: ${msg}`, true);
    }
  },

  async deleteProcess(id: number): Promise<void> {
    const p = (state.processes || []).find((item: ProcessItem) => item.id === id);
    const codeName = p ? `[${p.process_code} ${p.process_name}]` : `#${id}`;

    if (!confirm(`确定要停用并注销工艺 ${codeName} 吗？`)) {
      return;
    }

    try {
      await invokeBackend('delete_process', { id });
      showToast(`工艺 ${codeName} 已安全注销`);
      await this.loadProcesses();
      await refreshSystemStats();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`删除工艺失败: ${msg}`, true);
    }
  }
};
