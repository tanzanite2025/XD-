/**
 * ERP UDS 1.0 - 车间工位与人员归属业务模块
 */

import { invokeBackend } from '../core/ipc.js';
import { state, refreshSystemStats } from '../core/state.js';
import { showToast } from '../core/toast.js';
import { openModal, closeModal } from '../core/view_loader.js';

export default {
  async init() {
    this.bindEvents();
    this.renderStationsGrid();
  },

  async onActivated() {
    await this.loadStations();
  },

  bindEvents() {
    // 工段筛选按钮
    const btnAll = document.getElementById('filter-ws-all');
    const btnFE = document.getElementById('filter-ws-fe');
    const btnBE = document.getElementById('filter-ws-be');

    const updateBtns = (type) => {
      state.stationFilterType = type;
      if (btnAll) btnAll.className = type === 'ALL' ? 'uds-btn-primary' : 'uds-btn-secondary';
      if (btnFE) btnFE.className = type === 'FE' ? 'uds-btn-primary' : 'uds-btn-secondary';
      if (btnBE) btnBE.className = type === 'BE' ? 'uds-btn-primary' : 'uds-btn-secondary';
      this.renderStationsGrid();
    };

    if (btnAll) btnAll.onclick = () => updateBtns('ALL');
    if (btnFE) btnFE.onclick = () => updateBtns('FE');
    if (btnBE) btnBE.onclick = () => updateBtns('BE');

    // 打开新增工位弹窗
    const btnAddStation = document.getElementById('btn-open-add-station');
    if (btnAddStation) {
      btnAddStation.onclick = () => {
        document.getElementById('modal-station-title').innerText = "新增车间工位";
        document.getElementById('station-id').value = '';
        document.getElementById('station-code').value = '';
        document.getElementById('station-name').value = '';
        document.getElementById('station-supervisor').value = '';
        document.getElementById('station-target').value = '100';
        openModal('modal-station');
      };
    }

    // 保存工位表单提交
    const formStation = document.getElementById('form-station');
    if (formStation) {
      formStation.onsubmit = async (e) => {
        e.preventDefault();
        await this.saveStation();
      };
    }

    // 工位借调/分配人员提交
    const formAssignStaff = document.getElementById('form-assign-staff');
    if (formAssignStaff) {
      formAssignStaff.onsubmit = async (e) => {
        e.preventDefault();
        await this.saveStaffAssignment();
      };
    }
  },

  async loadStations() {
    try {
      state.stations = await invokeBackend('get_stations');
      this.renderStationsGrid();
    } catch (err) {
      showToast(`工位列表加载失败: ${err.message || err}`, true);
    }
  },

  renderStationsGrid() {
    const grid = document.getElementById('stations-grid');
    if (!grid) return;

    const filtered = state.stations.filter(s => {
      if (state.stationFilterType === 'FE') return s.workshop_code === 'FRONT_END';
      if (state.stationFilterType === 'BE') return s.workshop_code === 'BACK_END';
      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--muted-foreground); padding: 48px 0;">未检索到车间站点</div>`;
      return;
    }

    grid.innerHTML = filtered.map(s => {
      const isFE = s.workshop_code === 'FRONT_END';
      const stageBadge = isFE 
        ? `<span class="uds-badge" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe;">前段复材成型</span>` 
        : `<span class="uds-badge uds-badge-healthy">后段精修成装</span>`;

      return `
        <div class="uds-card" style="display: flex; flex-direction: column; justify-content: space-between;">
          <div class="uds-glow-gradient"></div>
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <span class="uds-mono" style="font-weight: 800; color: var(--primary); font-size: 11px;">${s.station_code}</span>
              ${stageBadge}
            </div>
            <h3 class="uds-card-title" style="font-size: 1.05rem; margin-bottom: 8px;">${s.station_name}</h3>
            
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 14px; background: #f8fafc; padding: 12px; border-radius: 14px; border: 1px dashed var(--border-dashed);">
              <div style="display: flex; justify-content: space-between;">
                <span class="uds-label">责任班长</span>
                <span style="font-weight: 700; color: var(--foreground);">${s.supervisor || '未指定'}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span class="uds-label">计划日定额</span>
                <span class="uds-mono" style="color: var(--emerald-text); font-weight: 800; font-size: 11px;">${s.target_output_daily} 件/日</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span class="uds-label">在册作业人员</span>
                <span class="uds-badge uds-badge-healthy">${s.active_staff_count || 0} 人 (含借调)</span>
              </div>
            </div>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px;">
            <button class="uds-btn-primary btn-station-staff" data-id="${s.id}" data-name="${s.station_name}" data-code="${s.station_code}" style="flex: 1 1 160px; height: 38px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
              人员归属与借调
            </button>
            <button class="uds-btn-secondary btn-station-edit" data-id="${s.id}" style="height: 38px; padding: 0 14px;">
              配置
            </button>
          </div>
        </div>
      `;
    }).join('');

    // 绑定卡片内按钮事件
    grid.querySelectorAll('.btn-station-staff').forEach(btn => {
      btn.onclick = () => this.openStaffModal(parseInt(btn.dataset.id, 10), btn.dataset.name, btn.dataset.code);
    });

    grid.querySelectorAll('.btn-station-edit').forEach(btn => {
      btn.onclick = () => this.openEditModal(parseInt(btn.dataset.id, 10));
    });
  },

  async openStaffModal(stationId, stationName, stationCode) {
    document.getElementById('assign-target-station-id').value = stationId;
    document.getElementById('modal-staff-title').innerText = `车间工位人员归属与借调 [${stationCode} · ${stationName}]`;
    
    const dateInput = document.getElementById('assign-date-input');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

    // 渲染可选员工
    const staffSelect = document.getElementById('assign-staff-select');
    if (staffSelect) {
      let opts = '<option value="">-- 选择要借调/指派的人员 --</option>';
      state.employees.filter(e => e.status === 'ACTIVE').forEach(e => {
        opts += `<option value="${e.id}">${e.emp_code} - ${e.name} (${e.department})</option>`;
      });
      staffSelect.innerHTML = opts;
    }

    await this.loadStationStaffList(stationId);
    openModal('modal-station-staff');
  },

  async loadStationStaffList(stationId) {
    const tbody = document.getElementById('station-staff-table-body');
    if (!tbody) return;

    try {
      const staffList = await invokeBackend('get_station_employees', { stationId });
      if (!staffList || staffList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--muted-foreground); padding: 24px 0;">该工位当前暂未指派常驻或借调人员</td></tr>`;
        return;
      }

      tbody.innerHTML = staffList.map(st => {
        const typeBadge = st.assignment_type === 'PRIMARY'
          ? `<span class="uds-badge" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe;">常驻主岗</span>`
          : `<span class="uds-badge uds-badge-alert">临时借调支援</span>`;

        return `
          <tr>
            <td class="uds-mono">${st.emp_code}</td>
            <td style="font-weight: 700;">${st.emp_name}</td>
            <td>${typeBadge}</td>
            <td class="uds-mono">${st.effective_from || '-'}</td>
            <td><span class="uds-badge uds-badge-healthy">在册上岗</span></td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      showToast(`人员列表拉取失败: ${err.message || err}`, true);
    }
  },

  openEditModal(stationId) {
    const st = state.stations.find(s => s.id === stationId);
    if (!st) return;

    document.getElementById('modal-station-title').innerText = `编辑车间工位 [${st.station_code}]`;
    document.getElementById('station-id').value = st.id;
    document.getElementById('station-workshop-select').value = st.workshop_id;
    document.getElementById('station-code').value = st.station_code;
    document.getElementById('station-name').value = st.station_name;
    document.getElementById('station-supervisor').value = st.supervisor || '';
    document.getElementById('station-target').value = st.target_output_daily || 0;

    openModal('modal-station');
  },

  async saveStation() {
    const id = document.getElementById('station-id').value;
    const stData = {
      id: id ? parseInt(id, 10) : null,
      workshop_id: parseInt(document.getElementById('station-workshop-select').value, 10),
      workshop_code: null,
      workshop_name: null,
      station_code: document.getElementById('station-code').value.trim(),
      station_name: document.getElementById('station-name').value.trim(),
      supervisor: document.getElementById('station-supervisor').value.trim(),
      target_output_daily: parseInt(document.getElementById('station-target').value, 10) || 0,
      sort_order: 10,
      status: 'ACTIVE',
      active_staff_count: null,
    };

    try {
      await invokeBackend('save_station', { station: stData });
      showToast(`工位 ${stData.station_name} 已保存`);
      closeModal('modal-station');
      await this.loadStations();
      await refreshSystemStats();
    } catch (err) {
      showToast(`工位保存失败: ${err.message || err}`, true);
    }
  },

  async saveStaffAssignment() {
    const stationId = parseInt(document.getElementById('assign-target-station-id').value, 10);
    const empId = parseInt(document.getElementById('assign-staff-select').value, 10);
    const assignmentType = document.getElementById('assign-type-select').value;
    const effectiveFrom = document.getElementById('assign-date-input').value;

    if (!empId) {
      showToast("请选择要指派的员工", true);
      return;
    }

    try {
      await invokeBackend('assign_employee_station', {
        empId,
        stationId,
        assignmentType,
        effectiveFrom,
        effectiveTo: null,
      });

      showToast("人员工位归属/借调已生效");
      await this.loadStationStaffList(stationId);
      await this.loadStations();
    } catch (err) {
      showToast(`指派失败: ${err.message || err}`, true);
    }
  }
};
