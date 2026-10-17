/**
 * ERP UDS 1.0 - 产品规格型号与轮圈打孔主数据强类型业务模块
 */

import { invokeBackend } from '../core/ipc';
import { state } from '../core/state';
import { showToast } from '../core/toast';
import { openModal, closeModal } from '../core/view_loader';
import { ProductModel } from '../types/models';

export default {
  holeSpecs: [] as number[],

  async init(): Promise<void> {
    this.bindEvents();
    this.renderModelsTable();
  },

  async onActivated(): Promise<void> {
    await Promise.all([
      this.loadModels(),
      this.loadHoleSpecs(),
    ]);
  },

  bindEvents(): void {
    const searchInput = document.getElementById('search-product-model') as HTMLInputElement | null;
    if (searchInput) {
      searchInput.oninput = () => this.renderModelsTable();
    }

    const btnOpenAdd = document.getElementById('btn-open-add-model');
    if (btnOpenAdd) {
      btnOpenAdd.onclick = () => this.openAddModelModal();
    }

    const openHoleModalHandler = async () => {
      await this.loadHoleSpecs();
      openModal('modal-hole-specs');
    };

    const btnOpenHoleSpecs = document.getElementById('btn-open-hole-specs');
    if (btnOpenHoleSpecs) {
      btnOpenHoleSpecs.onclick = openHoleModalHandler;
    }

    const btnQuickManageHoles = document.getElementById('btn-quick-manage-holes');
    if (btnQuickManageHoles) {
      btnQuickManageHoles.onclick = openHoleModalHandler;
    }

    const btnSubmitAddHole = document.getElementById('btn-submit-add-hole');
    if (btnSubmitAddHole) {
      btnSubmitAddHole.onclick = () => this.addHoleSpec();
    }

    const inputNewHole = document.getElementById('input-new-hole-count') as HTMLInputElement | null;
    if (inputNewHole) {
      inputNewHole.onkeydown = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.addHoleSpec();
        }
      };
    }

    const formModel = document.getElementById('form-product-model') as HTMLFormElement | null;
    if (formModel) {
      formModel.onsubmit = async (e: Event) => {
        e.preventDefault();
        await this.saveProductModel();
      };
    }
  },

  async loadHoleSpecs(): Promise<void> {
    try {
      this.holeSpecs = await invokeBackend('get_hole_specs');
      this.renderHoleSpecsChips();
      this.renderHoleCountDropdown();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`加载孔数规格字典失败: ${msg}`, true);
    }
  },

  renderHoleSpecsChips(): void {
    const container = document.getElementById('hole-specs-chips-container');
    const badge = document.getElementById('hole-specs-count-badge');
    if (!container) return;

    if (!this.holeSpecs || this.holeSpecs.length === 0) {
      container.innerHTML = `<span style="color: var(--muted-foreground); font-size: 12px; margin: auto;">暂无孔数规格数据，请在上方输入添加</span>`;
      if (badge) badge.innerText = "0 种规格";
      return;
    }

    if (badge) badge.innerText = `${this.holeSpecs.length} 种规格`;

    container.innerHTML = this.holeSpecs.map(spec => {
      return `
        <div class="uds-chip" style="display: inline-flex; align-items: center; gap: 8px; background: #f8fafc; border: 1px solid var(--border-dashed); padding: 6px 14px; border-radius: 9999px; font-weight: 800;">
          <span class="uds-mono" style="font-size: 14px; color: var(--foreground);">${spec} 孔</span>
          <button type="button" class="btn-remove-hole" data-hole="${spec}" style="background: none; border: none; cursor: pointer; color: var(--muted-foreground); padding: 0; line-height: 1; font-size: 16px; display: flex; align-items: center;" title="移除该规格">
            ×
          </button>
        </div>
      `;
    }).join('');

    container.querySelectorAll<HTMLButtonElement>('.btn-remove-hole').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const hole = parseInt(btn.dataset.hole || '0', 10);
        this.deleteHoleSpec(hole);
      };
    });
  },

  renderHoleCountDropdown(selectedCount: number | null = null): void {
    const select = document.getElementById('model-hole-count') as HTMLSelectElement | null;
    if (!select) return;

    let opts = '<option value="">-- 选择标准孔数 (下拉选取) --</option>';
    (this.holeSpecs || []).forEach(h => {
      const isSelected = selectedCount !== null && Number(h) === Number(selectedCount);
      opts += `<option value="${h}" ${isSelected ? 'selected' : ''}>${h} 孔 (标准圈孔)</option>`;
    });

    select.innerHTML = opts;
  },

  async addHoleSpec(): Promise<void> {
    const input = document.getElementById('input-new-hole-count') as HTMLInputElement | null;
    if (!input) return;

    const val = parseInt(input.value.trim(), 10);
    if (isNaN(val) || val <= 0) {
      showToast("[CRITICAL] 请输入有效的正整数孔数", true);
      return;
    }

    if (this.holeSpecs.includes(val)) {
      showToast(`规格【${val}孔】已存在于配置库中，无需重复添加`, true);
      return;
    }

    try {
      await invokeBackend('add_hole_spec', { holeCount: val });
      showToast(`成功新增轮圈打孔规格: ${val} 孔`);
      input.value = '';
      await this.loadHoleSpecs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`添加孔数规格失败: ${msg}`, true);
    }
  },

  async deleteHoleSpec(holeCount: number): Promise<void> {
    if (!confirm(`确定要从全厂规格字典中移除【${holeCount} 孔】规格吗？\n如果已有产品型号关联该规格，系统将严格阻止删除。`)) {
      return;
    }

    try {
      await invokeBackend('delete_hole_spec', { holeCount });
      showToast(`规格【${holeCount}孔】已移除`);
      await this.loadHoleSpecs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`移除规格失败: ${msg}`, true);
    }
  },

  async loadModels(): Promise<void> {
    try {
      state.productModels = await invokeBackend('get_product_models');
      this.renderModelsTable();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`产品型号加载失败: ${msg}`, true);
    }
  },

  renderModelsTable(): void {
    const tbody = document.getElementById('product-models-table-body');
    if (!tbody) return;

    const searchInput = document.getElementById('search-product-model') as HTMLInputElement | null;
    const searchVal = searchInput?.value.toLowerCase().trim() || '';

    const filtered = (state.productModels || []).filter((m: ProductModel) => {
      if (!searchVal) return true;
      return m.model_code.toLowerCase().includes(searchVal) ||
             m.model_name.toLowerCase().includes(searchVal) ||
             (m.remarks && m.remarks.toLowerCase().includes(searchVal)) ||
             (m.hole_count && String(m.hole_count).includes(searchVal));
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--muted-foreground); padding: 36px 0;">未检索到产品型号档案</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((m: ProductModel) => {
      const holeBadge = m.hole_count 
        ? `<span class="uds-badge uds-badge-healthy" style="font-weight: 800; font-size: 11px;">${m.hole_count} 孔</span>`
        : `<span class="uds-badge" style="background:#f1f5f9; color:#94a3b8;">无孔/定制</span>`;

      return `
        <tr>
          <td class="uds-mono" style="font-weight: 800; color: var(--primary); font-size: 13px;">${m.model_code}</td>
          <td style="font-weight: 800; color: var(--foreground); font-size: 14px;">${m.model_name}</td>
          <td>${holeBadge}</td>
          <td><span class="uds-badge" style="background: #f8fafc; color: #475569; border: 1px solid #cbd5e1;">${m.category || '碳纤维轮圈'}</span></td>
          <td style="color: var(--muted-foreground); font-size: 12px; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${m.remarks || '-'}</td>
          <td class="uds-mono" style="font-size: 11px; color: var(--muted-foreground);">${m.created_at || '-'}</td>
          <td style="text-align: center;">
            <button class="uds-btn-ghost btn-model-edit" data-id="${m.id}">编辑</button>
            <button class="uds-btn-danger btn-model-delete" data-id="${m.id}" style="margin-left: 6px;">删除</button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll<HTMLButtonElement>('.btn-model-edit').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id ? parseInt(btn.dataset.id, 10) : 0;
        this.openEditModelModal(id);
      };
    });

    tbody.querySelectorAll<HTMLButtonElement>('.btn-model-delete').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id ? parseInt(btn.dataset.id, 10) : 0;
        this.deleteProductModel(id);
      };
    });
  },

  async openAddModelModal(): Promise<void> {
    const title = document.getElementById('modal-product-model-title');
    if (title) title.innerText = "登记新碳纤产品型号";

    const idInput = document.getElementById('model-id') as HTMLInputElement | null;
    const codeInput = document.getElementById('model-code') as HTMLInputElement | null;
    const nameInput = document.getElementById('model-name') as HTMLInputElement | null;
    const catInput = document.getElementById('model-category') as HTMLInputElement | null;
    const remarksInput = document.getElementById('model-remarks') as HTMLInputElement | null;

    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (catInput) catInput.value = '碳纤维轮圈';
    if (remarksInput) remarksInput.value = '';

    await this.loadHoleSpecs();
    this.renderHoleCountDropdown(null);

    try {
      const nextCode = await invokeBackend('get_next_product_code');
      if (codeInput) codeInput.value = nextCode;
    } catch {
      if (codeInput) codeInput.value = 'CF-RIM-001';
    }

    openModal('modal-product-model');
  },

  async openEditModelModal(id: number): Promise<void> {
    const m = (state.productModels || []).find((item: ProductModel) => item.id === id);
    if (!m) return;

    const title = document.getElementById('modal-product-model-title');
    if (title) title.innerText = `编辑产品型号档案 [${m.model_code}]`;

    const idInput = document.getElementById('model-id') as HTMLInputElement | null;
    const codeInput = document.getElementById('model-code') as HTMLInputElement | null;
    const nameInput = document.getElementById('model-name') as HTMLInputElement | null;
    const catInput = document.getElementById('model-category') as HTMLInputElement | null;
    const remarksInput = document.getElementById('model-remarks') as HTMLInputElement | null;

    if (idInput) idInput.value = String(m.id);
    if (codeInput) codeInput.value = m.model_code;
    if (nameInput) nameInput.value = m.model_name;
    if (catInput) catInput.value = m.category || '碳纤维轮圈';
    if (remarksInput) remarksInput.value = m.remarks || '';

    await this.loadHoleSpecs();
    this.renderHoleCountDropdown(m.hole_count);

    openModal('modal-product-model');
  },

  async saveProductModel(): Promise<void> {
    const idVal = (document.getElementById('model-id') as HTMLInputElement | null)?.value;
    const codeVal = (document.getElementById('model-code') as HTMLInputElement | null)?.value.trim() || '';
    const nameVal = (document.getElementById('model-name') as HTMLInputElement | null)?.value.trim() || '';
    const holeVal = (document.getElementById('model-hole-count') as HTMLSelectElement | null)?.value;
    const catVal = (document.getElementById('model-category') as HTMLInputElement | null)?.value.trim() || '碳纤维轮圈';
    const remarksVal = (document.getElementById('model-remarks') as HTMLInputElement | null)?.value.trim() || '';

    if (!codeVal || !nameVal) {
      showToast("[CRITICAL] 型号编码与名称为必填项", true);
      return;
    }

    const modelData: ProductModel = {
      id: idVal ? parseInt(idVal, 10) : null,
      model_code: codeVal,
      model_name: nameVal,
      hole_count: holeVal ? parseInt(holeVal, 10) : null,
      category: catVal,
      status: 'ACTIVE',
      remarks: remarksVal,
      created_at: null,
    };

    try {
      await invokeBackend('save_product_model', { model: modelData });
      showToast(`产品型号【${modelData.model_name}】保存成功`);
      closeModal('modal-product-model');
      await this.loadModels();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`保存型号失败: ${msg}`, true);
    }
  },

  async deleteProductModel(id: number): Promise<void> {
    const m = (state.productModels || []).find((item: ProductModel) => item.id === id);
    const codeName = m ? `[${m.model_code} ${m.model_name}]` : `#${id}`;

    if (!confirm(`确定要移除产品型号 ${codeName} 吗？`)) {
      return;
    }

    try {
      await invokeBackend('delete_product_model', { id });
      showToast(`产品型号 ${codeName} 已安全删除`);
      await this.loadModels();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`删除型号失败: ${msg}`, true);
    }
  }
};
