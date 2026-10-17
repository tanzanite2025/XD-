/**
 * ERP UDS 1.0 - 产品规格型号主数据管理模块
 */

import { invokeBackend } from '../core/ipc.js';
import { state } from '../core/state.js';
import { showToast } from '../core/toast.js';
import { openModal, closeModal } from '../core/view_loader.js';

export default {
  holeSpecs: [],

  async init() {
    this.bindEvents();
    this.renderModelsTable();
  },

  async onActivated() {
    await Promise.all([
      this.loadModels(),
      this.loadHoleSpecs()
    ]);
  },

  bindEvents() {
    const searchInput = document.getElementById('search-product-model');
    if (searchInput) {
      searchInput.oninput = () => this.renderModelsTable();
    }

    const btnOpenAdd = document.getElementById('btn-open-add-model');
    if (btnOpenAdd) {
      btnOpenAdd.onclick = () => this.openAddModelModal();
    }

    // 打开孔数配置弹窗 (工具栏按钮 + 快捷按钮)
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

    // 添加孔数规格事件
    const btnSubmitAddHole = document.getElementById('btn-submit-add-hole');
    if (btnSubmitAddHole) {
      btnSubmitAddHole.onclick = () => this.addHoleSpec();
    }

    const inputNewHole = document.getElementById('input-new-hole-count');
    if (inputNewHole) {
      inputNewHole.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.addHoleSpec();
        }
      };
    }

    const formModel = document.getElementById('form-product-model');
    if (formModel) {
      formModel.onsubmit = async (e) => {
        e.preventDefault();
        await this.saveProductModel();
      };
    }
  },

  async loadHoleSpecs() {
    try {
      this.holeSpecs = await invokeBackend('get_hole_specs');
      this.renderHoleSpecsChips();
      this.renderHoleCountDropdown();
    } catch (err) {
      showToast(`加载孔数规格字典失败: ${err.message || err}`, true);
    }
  },

  renderHoleSpecsChips() {
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
      const label = spec === 0 ? '0 孔 (无孔/通用)' : `${spec} 孔`;
      return `
        <div style="display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 9999px; font-weight: 700; font-size: 13px; color: #1e293b; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
          <span class="uds-mono" style="font-weight: 800; color: var(--primary);">${label}</span>
          <button type="button" class="btn-delete-hole" data-hole="${spec}" title="移除规格" style="background: none; border: none; cursor: pointer; color: #ef4444; font-size: 16px; font-weight: 900; line-height: 1; padding: 0 2px;">×</button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-delete-hole').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const holeVal = parseInt(btn.dataset.hole, 10);
        this.deleteHoleSpec(holeVal);
      };
    });
  },

  renderHoleCountDropdown(selectedVal = null) {
    const select = document.getElementById('model-hole-count');
    if (!select) return;

    const currentVal = selectedVal !== null ? selectedVal : parseInt(select.value, 10);

    if (!this.holeSpecs || this.holeSpecs.length === 0) {
      select.innerHTML = '<option value="">-- 请先在后台配置孔数规格 --</option>';
      return;
    }

    let opts = '';
    this.holeSpecs.forEach(spec => {
      const label = spec === 0 ? '0 孔 (无孔/通用规格)' : `${spec} 孔 (标准物理打孔)`;
      opts += `<option value="${spec}">${label}</option>`;
    });

    select.innerHTML = opts;

    // 维持选中状态
    if (!isNaN(currentVal) && this.holeSpecs.includes(currentVal)) {
      select.value = `${currentVal}`;
    } else if (this.holeSpecs.includes(24)) {
      select.value = '24';
    } else {
      select.value = `${this.holeSpecs[0]}`;
    }
  },

  async addHoleSpec() {
    const input = document.getElementById('input-new-hole-count');
    if (!input) return;

    const valStr = input.value.trim();
    if (valStr === '') {
      showToast("[CRITICAL] 请输入需要添加的孔数数值", true);
      return;
    }

    const holeVal = parseInt(valStr, 10);
    if (isNaN(holeVal) || holeVal < 0) {
      showToast("[CRITICAL] 孔数必须为非负整数", true);
      return;
    }

    try {
      await invokeBackend('add_hole_spec', { holeCount: holeVal });
      showToast(`物理打孔规格 [${holeVal} 孔] 已成功录入配置库`);
      input.value = '';
      await this.loadHoleSpecs();
    } catch (err) {
      showToast(`添加孔数规格失败: ${err.message || err}`, true);
    }
  },

  async deleteHoleSpec(holeCount) {
    const label = `${holeCount} 孔`;
    if (!confirm(`确定要移除打孔规格 [${label}] 吗？\n\n安全提示：如果已有产品型号使用了该规格，系统将严格阻止删除以保护主数据完整性。`)) {
      return;
    }

    try {
      await invokeBackend('delete_hole_spec', { holeCount });
      showToast(`打孔规格 [${label}] 已安全移除`);
      await this.loadHoleSpecs();
    } catch (err) {
      showToast(`无法删除孔数规格: ${err.message || err}`, true);
    }
  },

  async loadModels() {
    try {
      state.productModels = await invokeBackend('get_product_models');
      this.renderModelsTable();
    } catch (err) {
      showToast(`产品型号加载失败: ${err.message || err}`, true);
    }
  },

  renderModelsTable() {
    const tbody = document.getElementById('models-table-body');
    if (!tbody) return;

    const searchVal = document.getElementById('search-product-model')?.value.toLowerCase().trim() || '';

    const filtered = state.productModels.filter(m => {
      if (!searchVal) return true;
      const holeStr = (m.hole_count !== undefined && m.hole_count !== null) ? `${m.hole_count}` : '';
      return m.model_code.toLowerCase().includes(searchVal) ||
             m.model_name.toLowerCase().includes(searchVal) ||
             holeStr.includes(searchVal) ||
             (m.remarks && m.remarks.toLowerCase().includes(searchVal));
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--muted-foreground); padding: 36px 0;">暂无产品规格型号数据。请点击上方【登记新产品型号】建立主数据</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(m => {
      const holeText = (m.hole_count !== undefined && m.hole_count !== null && m.hole_count > 0) ? `${m.hole_count} 孔` : (m.hole_count === 0 ? '0 孔 (无孔)' : '-');

      return `
        <tr>
          <td class="uds-mono" style="font-weight: 700; color: var(--primary); font-size: 13px;">${m.model_code}</td>
          <td style="font-weight: 800; color: var(--foreground);">${m.model_name}</td>
          <td style="text-align: center;"><span class="uds-badge" style="background: #f1f5f9; color: #1e293b; border: 1px solid #cbd5e1; font-weight: 700;">${holeText}</span></td>
          <td style="color: var(--muted-foreground); font-size: 11px;">${m.remarks || '-'}</td>
          <td class="uds-mono" style="font-size: 11px; color: var(--muted-foreground);">${m.created_at || '-'}</td>
          <td style="text-align: center;">
            <button class="uds-btn-ghost btn-model-edit" data-id="${m.id}">编辑</button>
            <button class="uds-btn-danger btn-model-delete" data-id="${m.id}" style="margin-left: 6px;">删除</button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-model-edit').forEach(btn => {
      btn.onclick = () => this.openEditModelModal(parseInt(btn.dataset.id, 10));
    });

    tbody.querySelectorAll('.btn-model-delete').forEach(btn => {
      btn.onclick = () => this.deleteModel(parseInt(btn.dataset.id, 10));
    });
  },

  async openAddModelModal() {
    document.getElementById('modal-model-title').innerText = "登记新产品规格型号";
    document.getElementById('model-id').value = '';
    
    // 异步自动分配产品流水编码
    try {
      const nextCode = await invokeBackend('get_next_product_code');
      const codeInput = document.getElementById('model-code');
      codeInput.value = nextCode;
      codeInput.readOnly = true;
      codeInput.style.background = '#f1f5f9';
      codeInput.style.cursor = 'not-allowed';
    } catch (err) {
      showToast(`获取自动产品编码失败: ${err.message || err}`, true);
    }

    document.getElementById('model-name').value = '';
    document.getElementById('model-remarks').value = '';

    // 确保孔数规格最新并默认选中标准 24 孔 (自行车轮圈主流标准)
    await this.loadHoleSpecs();
    this.renderHoleCountDropdown(24);

    openModal('modal-product-model');
  },

  async openEditModelModal(id) {
    const m = state.productModels.find(item => item.id === id);
    if (!m) return;

    document.getElementById('modal-model-title').innerText = `编辑产品规格型号 [${m.model_code}]`;
    document.getElementById('model-id').value = m.id;
    
    const codeInput = document.getElementById('model-code');
    codeInput.value = m.model_code;
    codeInput.readOnly = true;
    codeInput.style.background = '#f1f5f9';
    codeInput.style.cursor = 'not-allowed';

    document.getElementById('model-name').value = m.model_name;
    document.getElementById('model-remarks').value = m.remarks || '';

    // 加载最新孔数并在下拉中回显
    await this.loadHoleSpecs();
    const holeSelect = document.getElementById('model-hole-count');
    if (holeSelect) {
      // 若已有孔数不在当前规格中，动态插入临时 option 避免数据显示错误
      if (!this.holeSpecs.includes(m.hole_count)) {
        const opt = document.createElement('option');
        opt.value = `${m.hole_count}`;
        opt.innerText = `${m.hole_count} 孔 (已停用历史规格)`;
        holeSelect.appendChild(opt);
      }
      holeSelect.value = `${m.hole_count}`;
    }

    openModal('modal-product-model');
  },

  async saveProductModel() {
    const id = document.getElementById('model-id').value;
    const modelCode = document.getElementById('model-code').value.trim();
    const modelName = document.getElementById('model-name').value.trim();
    const holeCountVal = document.getElementById('model-hole-count').value;
    const remarks = document.getElementById('model-remarks').value.trim();

    if (!modelName) {
      showToast("[CRITICAL] 请输入产品规格型号名称", true);
      return;
    }

    if (holeCountVal === '' || holeCountVal === null || holeCountVal === undefined) {
      showToast("[CRITICAL] 必须通过下拉框选择产品孔数规格", true);
      return;
    }

    const holeCount = parseInt(holeCountVal, 10);
    if (isNaN(holeCount) || holeCount < 0) {
      showToast("[CRITICAL] 产品孔数规格非法，请重新从下拉列表选择", true);
      return;
    }

    const payload = {
      id: id ? parseInt(id, 10) : null,
      model_code: modelCode || '', // 若为空后端也会自动按流水生成
      model_name: modelName,
      hole_count: holeCount,
      remarks: remarks || '',
      created_at: null,
    };

    try {
      await invokeBackend('save_product_model', { model: payload });
      if (id) {
        showToast(`产品型号 [${modelCode}] 更新成功`);
      } else {
        showToast(`新产品型号 [${payload.model_code || '自动分配'}] 登记成功`);
      }

      closeModal('modal-product-model');
      await this.loadModels();
    } catch (err) {
      showToast(`保存产品型号失败: ${err.message || err}`, true);
    }
  },

  async deleteModel(id) {
    const m = state.productModels.find(item => item.id === id);
    const codeName = m ? `[${m.model_code}]` : `#${id}`;

    if (!confirm(`确定要删除产品规格型号 ${codeName} 吗？\n\n安全提示：如果已有工艺库或流水关联该型号，系统将严格阻止删除。`)) {
      return;
    }

    try {
      await invokeBackend('delete_product_model', { id });
      showToast(`产品型号 ${codeName} 已安全删除`);
      await this.loadModels();
    } catch (err) {
      showToast(`删除失败: ${err.message || err}`, true);
    }
  }
};

