/**
 * ERP UDS 1.0 - 产品规格型号与轮圈工艺路线 (MES Routing) 主数据模块
 */

import { invokeBackend } from '../core/ipc.js';
import { state } from '../core/state.js';
import { showToast } from '../core/toast.js';
import { openModal, closeModal } from '../core/view_loader.js';

export default {
  holeSpecs: [],
  routesSummary: {},
  currentRoutingModelId: null,
  currentSteps: [],

  async init() {
    this.bindEvents();
    this.bindRoutingEvents();
    this.renderModelsTable();
  },

  async onActivated() {
    await Promise.all([
      this.loadModels(),
      this.loadHoleSpecs(),
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

  bindRoutingEvents() {
    const selectStation = document.getElementById('route-new-station');
    if (selectStation) {
      selectStation.onchange = () => {
        const stationId = parseInt(selectStation.value, 10);
        this.renderNewProcessDropdown(stationId);
      };
    }

    const btnAddStep = document.getElementById('btn-add-route-step');
    if (btnAddStep) {
      btnAddStep.onclick = () => this.addRouteStep();
    }

    const btnSaveRoutes = document.getElementById('btn-save-product-routes');
    if (btnSaveRoutes) {
      btnSaveRoutes.onclick = () => this.saveProductRoutes();
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
      return `
        <div class="uds-chip" style="display: inline-flex; align-items: center; gap: 8px; background: #f8fafc; border: 1px dashed var(--border-dashed); padding: 6px 14px; border-radius: 9999px; font-weight: 800;">
          <span class="uds-mono" style="font-size: 14px; color: var(--foreground);">${spec} 孔</span>
          <button type="button" class="btn-remove-hole" data-hole="${spec}" style="background: none; border: none; cursor: pointer; color: var(--muted-foreground); padding: 0; line-height: 1; font-size: 16px; display: flex; align-items: center;" title="移除该规格">
            ×
          </button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-remove-hole').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const hole = parseInt(btn.dataset.hole || '0', 10);
        this.deleteHoleSpec(hole);
      };
    });
  },

  renderHoleCountDropdown(selectedCount = null) {
    const select = document.getElementById('model-hole-count');
    if (!select) return;

    let opts = '<option value="">-- 选择标准孔数 (下拉选取) --</option>';
    (this.holeSpecs || []).forEach(h => {
      const isSelected = selectedCount !== null && Number(h) === Number(selectedCount);
      opts += `<option value="${h}" ${isSelected ? 'selected' : ''}>${h} 孔 (标准圈孔)</option>`;
    });

    select.innerHTML = opts;
  },

  async addHoleSpec() {
    const input = document.getElementById('input-new-hole-count');
    if (!input) return;

    const val = parseInt(input.value.trim(), 10);
    if (isNaN(val) || val < 0) {
      showToast("[CRITICAL] 请输入有效的非负整数孔数", true);
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
    } catch (err) {
      showToast(`添加孔数规格失败: ${err.message || err}`, true);
    }
  },

  async deleteHoleSpec(holeCount) {
    if (!confirm(`确定要从全厂规格字典中移除【${holeCount} 孔】规格吗？\n如果已有产品型号关联该规格，系统将严格阻止删除。`)) {
      return;
    }

    try {
      await invokeBackend('delete_hole_spec', { holeCount });
      showToast(`规格【${holeCount}孔】已移除`);
      await this.loadHoleSpecs();
    } catch (err) {
      showToast(`移除规格失败: ${err.message || err}`, true);
    }
  },

  async loadModels() {
    try {
      const [models, summary] = await Promise.all([
        invokeBackend('get_product_models'),
        invokeBackend('get_all_product_routes_summary'),
      ]);
      state.productModels = models;
      this.routesSummary = summary || {};
      this.renderModelsTable();
    } catch (err) {
      showToast(`产品型号与路线加载失败: ${err.message || err}`, true);
    }
  },

  renderModelsTable() {
    const tbody = document.getElementById('models-table-body') || document.getElementById('product-models-table-body');
    if (!tbody) return;

    const searchInput = document.getElementById('search-product-model');
    const searchVal = searchInput?.value.toLowerCase().trim() || '';

    const filtered = (state.productModels || []).filter(m => {
      if (!searchVal) return true;
      return m.model_code.toLowerCase().includes(searchVal) ||
             m.model_name.toLowerCase().includes(searchVal) ||
             (m.remarks && m.remarks.toLowerCase().includes(searchVal)) ||
             (m.hole_count !== null && m.hole_count !== undefined && String(m.hole_count).includes(searchVal));
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--muted-foreground); padding: 36px 0;">未检索到产品型号档案。请点击上方【登记新产品型号】建立主数据</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(m => {
      const holeBadge = (m.hole_count !== undefined && m.hole_count !== null && m.hole_count > 0)
        ? `<span class="uds-badge uds-badge-healthy" style="font-weight: 800; font-size: 11px;">${m.hole_count} 孔</span>`
        : `<span class="uds-badge" style="background:#f1f5f9; color:#94a3b8; border: 1px dashed #cbd5e1;">无孔/通用</span>`;

      const routes = (m.id && this.routesSummary[m.id]) ? this.routesSummary[m.id] : [];
      let routingContent = '';
      if (routes.length > 0) {
        const stepChips = routes.map((r, idx) => {
          const arrow = idx < routes.length - 1 ? `<span style="color: var(--muted-foreground); font-size: 10px; margin: 0 4px; opacity: 0.6;">➔</span>` : '';
          return `
            <span class="uds-badge" style="background: rgba(14, 165, 233, 0.08); color: #0284c7; border: 1px dashed #7dd3fc; font-weight: 700; padding: 2px 7px; display: inline-flex; align-items: center; white-space: nowrap;">
              <span style="opacity: 0.6; font-size: 9px; margin-right: 3px;">#${r.step_no}</span>
              <span>${r.station_name || '工位'}</span>
              <span style="opacity: 0.5; margin: 0 3px;">:</span>
              <span style="color: #0369a1;">${r.process_name || '工艺'}</span>
              <span style="color: #0284c7; font-weight: 800; margin-left: 4px; font-size: 9px;">¥${Number(r.unit_price || 0).toFixed(2)}</span>
            </span>${arrow}
          `;
        }).join('');
        routingContent = `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 4px; line-height: 1.8;">${stepChips}</div>`;
      } else {
        routingContent = `
          <span class="uds-badge" style="background: #fef2f2; color: #ef4444; border: 1px dashed #fca5a5; font-size: 10px; padding: 2px 8px;">
            待配置工艺路线
          </span>
        `;
      }

      return `
        <tr>
          <td class="uds-mono" style="font-weight: 800; color: var(--primary); font-size: 13px;">${m.model_code}</td>
          <td style="font-weight: 800; color: var(--foreground); font-size: 14px;">${m.model_name}</td>
          <td style="text-align: center;">${holeBadge}</td>
          <td>${routingContent}</td>
          <td style="color: var(--muted-foreground); font-size: 12px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${m.remarks || '-'}</td>
          <td style="text-align: center; white-space: nowrap;">
            <button class="uds-btn-ghost btn-model-routing" data-id="${m.id}" style="color: var(--primary); font-weight: 800; padding: 4px 8px;">
              路线
            </button>
            <button class="uds-btn-ghost btn-model-edit" data-id="${m.id}" style="padding: 4px 8px; margin-left: 4px;">
              编辑
            </button>
            <button class="uds-btn-danger btn-model-delete" data-id="${m.id}" style="padding: 4px 8px; margin-left: 4px;">
              删除
            </button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-model-routing').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id ? parseInt(btn.dataset.id, 10) : 0;
        this.openRoutingModal(id);
      };
    });

    tbody.querySelectorAll('.btn-model-edit').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id ? parseInt(btn.dataset.id, 10) : 0;
        this.openEditModelModal(id);
      };
    });

    tbody.querySelectorAll('.btn-model-delete').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id ? parseInt(btn.dataset.id, 10) : 0;
        this.deleteProductModel(id);
      };
    });
  },

  async openAddModelModal() {
    const title = document.getElementById('modal-product-model-title') || document.getElementById('modal-model-title');
    if (title) title.innerText = "登记新碳纤产品型号";

    const idInput = document.getElementById('model-id');
    const codeInput = document.getElementById('model-code');
    const nameInput = document.getElementById('model-name');
    const catInput = document.getElementById('model-category');
    const remarksInput = document.getElementById('model-remarks');

    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (catInput) catInput.value = '碳纤维轮圈';
    if (remarksInput) remarksInput.value = '';

    await this.loadHoleSpecs();
    this.renderHoleCountDropdown(24);

    try {
      const nextCode = await invokeBackend('get_next_product_code');
      if (codeInput) {
        codeInput.value = nextCode;
        codeInput.readOnly = true;
        codeInput.style.background = '#f1f5f9';
      }
    } catch {
      if (codeInput) codeInput.value = 'CF-RIM-001';
    }

    openModal('modal-product-model');
  },

  async openEditModelModal(id) {
    const m = (state.productModels || []).find(item => item.id === id);
    if (!m) return;

    const title = document.getElementById('modal-product-model-title') || document.getElementById('modal-model-title');
    if (title) title.innerText = `编辑产品型号档案 [${m.model_code}]`;

    const idInput = document.getElementById('model-id');
    const codeInput = document.getElementById('model-code');
    const nameInput = document.getElementById('model-name');
    const catInput = document.getElementById('model-category');
    const remarksInput = document.getElementById('model-remarks');

    if (idInput) idInput.value = String(m.id);
    if (codeInput) {
      codeInput.value = m.model_code;
      codeInput.readOnly = true;
      codeInput.style.background = '#f1f5f9';
    }
    if (nameInput) nameInput.value = m.model_name;
    if (catInput) catInput.value = m.category || '碳纤维轮圈';
    if (remarksInput) remarksInput.value = m.remarks || '';

    await this.loadHoleSpecs();
    this.renderHoleCountDropdown(m.hole_count);

    openModal('modal-product-model');
  },

  async saveProductModel() {
    const idVal = document.getElementById('model-id')?.value;
    const codeVal = document.getElementById('model-code')?.value.trim() || '';
    const nameVal = document.getElementById('model-name')?.value.trim() || '';
    const holeVal = document.getElementById('model-hole-count')?.value;
    const catVal = document.getElementById('model-category')?.value.trim() || '碳纤维轮圈';
    const remarksVal = document.getElementById('model-remarks')?.value.trim() || '';

    if (!nameVal) {
      showToast("[CRITICAL] 型号名称为必填项", true);
      return;
    }

    const modelData = {
      id: idVal ? parseInt(idVal, 10) : null,
      model_code: codeVal,
      model_name: nameVal,
      hole_count: holeVal !== '' && holeVal !== undefined && holeVal !== null ? parseInt(holeVal, 10) : null,
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
    } catch (err) {
      showToast(`保存型号失败: ${err.message || err}`, true);
    }
  },

  async deleteProductModel(id) {
    const m = (state.productModels || []).find(item => item.id === id);
    const codeName = m ? `[${m.model_code} ${m.model_name}]` : `#${id}`;

    if (!confirm(`确定要移除产品型号 ${codeName} 吗？\n如果已有工艺路线或报工流水关联该型号，系统将严格阻止删除。`)) {
      return;
    }

    try {
      await invokeBackend('delete_product_model', { id });
      showToast(`产品型号 ${codeName} 已安全删除`);
      await this.loadModels();
    } catch (err) {
      showToast(`删除型号失败: ${err.message || err}`, true);
    }
  },

  // ==========================================
  // 产品工位工艺路线配置 (MES Product Routing) 核心交互
  // ==========================================

  async openRoutingModal(modelId) {
    const m = (state.productModels || []).find(item => item.id === modelId);
    if (!m) {
      showToast(`[CRITICAL] 未找到 ID 为 ${modelId} 的产品型号`, true);
      return;
    }

    this.currentRoutingModelId = modelId;

    const elCode = document.getElementById('route-product-code');
    const elName = document.getElementById('route-product-name');
    const elHole = document.getElementById('route-product-hole');
    const elId = document.getElementById('route-current-model-id');

    if (elCode) elCode.innerText = m.model_code;
    if (elName) elName.innerText = m.model_name;
    if (elHole) {
      elHole.innerText = (m.hole_count !== undefined && m.hole_count !== null && m.hole_count > 0)
        ? `${m.hole_count} 孔规格`
        : '无孔/通用';
    }
    if (elId) elId.value = String(m.id);

    try {
      const routes = await invokeBackend('get_product_routes', { modelId });
      this.currentSteps = routes.map(r => ({
        step_no: r.step_no,
        station_id: r.station_id,
        station_code: r.station_code || '',
        station_name: r.station_name || '',
        process_id: r.process_id,
        process_code: r.process_code || '',
        process_name: r.process_name || '',
        unit_price: r.unit_price || 0,
        notes: r.notes || '',
      }));
    } catch (err) {
      showToast(`读取产品工艺路线失败: ${err.message || err}`, true);
      this.currentSteps = [];
    }

    this.renderNewStationDropdown();
    this.renderRouteStepsTable();

    openModal('modal-product-routing');
  },

  renderNewStationDropdown() {
    const select = document.getElementById('route-new-station');
    if (!select) return;

    let opts = '<option value="">-- 选择作业车间工位 --</option>';
    (state.stations || []).forEach(st => {
      opts += `<option value="${st.id}">[${st.station_code}] ${st.station_name}</option>`;
    });

    select.innerHTML = opts;
    select.value = '';

    this.renderNewProcessDropdown(null);
  },

  renderNewProcessDropdown(stationId) {
    const select = document.getElementById('route-new-process');
    if (!select) return;

    if (!stationId) {
      select.innerHTML = '<option value="">-- 请先选择作业工位 --</option>';
      select.value = '';
      return;
    }

    const availableProcesses = (state.processes || []).filter(p => {
      return !p.recommended_station_id || p.recommended_station_id === stationId;
    });

    let opts = '<option value="">-- 选择对应工艺程序 --</option>';
    availableProcesses.forEach(p => {
      opts += `<option value="${p.id}" data-price="${p.unit_price}" data-code="${p.process_code}" data-name="${p.process_name}">[${p.process_code}] ${p.process_name} (¥${Number(p.unit_price || 0).toFixed(2)})</option>`;
    });

    if (availableProcesses.length === 0) {
      opts = '<option value="">-- 当前工位暂无匹配工艺，请在工艺库录入 --</option>';
    }

    select.innerHTML = opts;
    select.value = '';
  },

  renderRouteStepsTable() {
    const tbody = document.getElementById('route-steps-tbody');
    if (!tbody) return;

    if (this.currentSteps.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--muted-foreground); padding: 28px 0; font-size: 13px;">
            暂未添加工序步骤。请在下方选择工位与工艺追加路线节点
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.currentSteps.map((step, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === this.currentSteps.length - 1;

      return `
        <tr>
          <td style="text-align: center;">
            <span class="uds-badge uds-badge-healthy" style="font-weight: 800; font-size: 11px;">#${step.step_no}</span>
          </td>
          <td style="font-weight: 800; color: var(--foreground); font-size: 13px;">
            ${step.station_name || '未指定工位'}
          </td>
          <td>
            <div style="font-weight: 700; color: var(--foreground); font-size: 13px;">${step.process_name || '工艺程序'}</div>
            <div class="uds-mono" style="font-size: 10px; color: var(--muted-foreground);">${step.process_code || '-'} ${step.notes ? `· ${step.notes}` : ''}</div>
          </td>
          <td class="uds-mono" style="text-align: right; font-weight: 800; color: #0284c7; font-size: 13px;">
            ¥${Number(step.unit_price || 0).toFixed(2)}
          </td>
          <td style="text-align: center; white-space: nowrap;">
            <button type="button" class="btn-step-up uds-btn-ghost" data-index="${idx}" ${isFirst ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''} title="上移工序">▲</button>
            <button type="button" class="btn-step-down uds-btn-ghost" data-index="${idx}" ${isLast ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''} style="margin-left: 4px;" title="下移工序">▼</button>
            <button type="button" class="btn-step-delete uds-btn-danger" data-index="${idx}" style="margin-left: 8px; padding: 2px 8px; font-size: 11px;" title="移除该工步">✕</button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-step-up').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.index || '0', 10);
        if (idx > 0) {
          const temp = this.currentSteps[idx - 1];
          this.currentSteps[idx - 1] = this.currentSteps[idx];
          this.currentSteps[idx] = temp;
          this.reindexSteps();
          this.renderRouteStepsTable();
        }
      };
    });

    tbody.querySelectorAll('.btn-step-down').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.index || '0', 10);
        if (idx < this.currentSteps.length - 1) {
          const temp = this.currentSteps[idx + 1];
          this.currentSteps[idx + 1] = this.currentSteps[idx];
          this.currentSteps[idx] = temp;
          this.reindexSteps();
          this.renderRouteStepsTable();
        }
      };
    });

    tbody.querySelectorAll('.btn-step-delete').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.index || '0', 10);
        this.currentSteps.splice(idx, 1);
        this.reindexSteps();
        this.renderRouteStepsTable();
      };
    });
  },

  reindexSteps() {
    this.currentSteps.forEach((step, idx) => {
      step.step_no = idx + 1;
    });
  },

  addRouteStep() {
    const selectStation = document.getElementById('route-new-station');
    const selectProcess = document.getElementById('route-new-process');
    const inputNotes = document.getElementById('route-new-notes');

    if (!selectStation || !selectProcess) return;

    const stationId = parseInt(selectStation.value, 10);
    const processId = parseInt(selectProcess.value, 10);

    if (isNaN(stationId) || stationId <= 0) {
      showToast("[CRITICAL] 请选择作业车间工位", true);
      return;
    }

    if (isNaN(processId) || processId <= 0) {
      showToast("[CRITICAL] 请选择工位对应的工艺程序", true);
      return;
    }

    const st = (state.stations || []).find(s => s.id === stationId);
    const pr = (state.processes || []).find(p => p.id === processId);

    const stepNo = this.currentSteps.length + 1;
    const newStep = {
      step_no: stepNo,
      station_id: stationId,
      station_code: st?.station_code || '',
      station_name: st?.station_name || '',
      process_id: processId,
      process_code: pr?.process_code || '',
      process_name: pr?.process_name || '',
      unit_price: pr?.unit_price || 0,
      notes: inputNotes?.value.trim() || '',
    };

    this.currentSteps.push(newStep);
    this.renderRouteStepsTable();

    if (inputNotes) inputNotes.value = '';
    selectProcess.value = '';
    showToast(`已追加第 #${stepNo} 道工序步骤`);
  },

  async saveProductRoutes() {
    if (!this.currentRoutingModelId) {
      showToast("[CRITICAL] 当前未选中产品型号", true);
      return;
    }

    const payloadSteps = this.currentSteps.map((step, idx) => ({
      step_no: idx + 1,
      station_id: step.station_id,
      process_id: step.process_id,
      notes: step.notes || '',
    }));

    try {
      await invokeBackend('save_product_routes', {
        modelId: this.currentRoutingModelId,
        steps: payloadSteps,
      });

      showToast(`产品工艺流程路线保存成功 (${payloadSteps.length} 道工步已生效)`);
      closeModal('modal-product-routing');
      await this.loadModels();
    } catch (err) {
      showToast(`保存工艺路线失败: ${err.message || err}`, true);
    }
  }
};
