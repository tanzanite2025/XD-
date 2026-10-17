/**
 * ERP UDS 1.0 - 车间工位与人员归属强类型业务模块
 */

import { invokeBackend } from '../core/ipc';
import { state, refreshSystemStats } from '../core/state';
import { showToast } from '../core/toast';
import { openModal, closeModal } from '../core/view_loader';
import { Station, Employee, EmployeeStationAssignment } from '../types/models';

export default {
  async init(): Promise<void> {
    this.bindEvents();
    this.renderStationsGrid();
  },

  async onActivated(): Promise<void> {
    await this.loadStations();
  },

  bindEvents(): void {
    const btnAll = document.getElementById('filter-ws-all');
    const btnFE = document.getElementById('filter-ws-fe');
    const btnBE = document.getElementById('filter-ws-be');

    const updateBtns = (type: string) => {
      state.stationFilterType = type;
      if (btnAll) btnAll.className = type === 'ALL' ? 'uds-btn-primary' : 'uds-btn-secondary';
      if (btnFE) btnFE.className = type === 'FE' ? 'uds-btn-primary' : 'uds-btn-secondary';
      if (btnBE) btnBE.className = type === 'BE' ? 'uds-btn-primary' : 'uds-btn-secondary';
      this.renderStationsGrid();
    };

    if (btnAll) btnAll.onclick = () => updateBtns('ALL');
    if (btnFE) btnFE.onclick = () => updateBtns('FE');
    if (btnBE) btnBE.onclick = () => updateBtns('BE');

    const btnAddStation = document.getElementById('btn-open-add-station');
    if (btnAddStation) {
      btnAddStation.onclick = () => {
        const title = document.getElementById('modal-station-title');
        if (title) title.innerText = "新增车间工位";

        const idInput = document.getElementById('station-id') as HTMLInputElement | null;
        const codeInput = document.getElementById('station-code') as HTMLInputElement | null;
        const nameInput = document.getElementById('station-name') as HTMLInputElement | null;
        const supInput = document.getElementById('station-supervisor') as HTMLInputElement | null;
        const targetInput = document.getElementById('station-target') as HTMLInputElement | null;

        if (idInput) idInput.value = '';
        if (codeInput) codeInput.value = '';
        if (nameInput) nameInput.value = '';
        if (supInput) supInput.value = '';
        if (targetInput) targetInput.value = '100';

        openModal('modal-station');
      };
    }

    const formStation = document.getElementById('form-station') as HTMLFormElement | null;
    if (formStation) {
      formStation.onsubmit = async (e: Event) => {
        e.preventDefault();
        await this.saveStation();
      };
    }

    const formAssignStaff = document.getElementById('form-assign-staff') as HTMLFormElement | null;
    if (formAssignStaff) {
      formAssignStaff.onsubmit = async (e: Event) => {
        e.preventDefault();
        await this.saveStaffAssignment();
      };
    }
  },

  async loadStations(): Promise<void> {
    try {
      state.stations = await invokeBackend('get_stations');
      this.renderStationsGrid();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`工位列表加载失败: ${msg}`, true);
    }
  },

  renderStationsGrid(): void {
    const grid = document.getElementById('stations-grid');
    if (!grid) return;

    const filtered = (state.stations || []).filter((s: Station) => {
      if (state.stationFilterType === 'FE') return s.workshop_code === 'FRONT_END';
      if (state.stationFilterType === 'BE') return s.workshop_code === 'BACK_END';
      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--muted-foreground); padding: 48px 0;">未检索到车间站点</div>`;
      return;
    }

    grid.innerHTML = filtered.map((s: Station) => {
      const isFE = s.workshop_code === 'FRONT_END';
      const stageBadge = isFE 
        ? `<span class="uds-badge" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe;">前段复材成型</span>` 
        : `<span class="uds-badge uds-badge-healthy">后段精修成装</span>`;

      return `
        <div class="uds-card" style="position: relative;">
          <div class="uds-glow-gradient"></div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div>
              <span class="uds-mono" style="font-size: 11px; font-weight: 700; color: var(--primary);">${s.station_code}</span>
              <h3 style="font-size: 16px; font-weight: 800; margin-top: 4px; color: var(--foreground);">${s.station_name}</h3>
              <div class="uds-mono" style="font-size: 10px; color: var(--muted-foreground); margin-top: 2px;">${s.department_name || '制造部'} · ${s.workshop_name || '通用车间'}</div>
            </div>
            ${stageBadge}
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: rgba(0,0,0,0.02); padding: 10px; border-radius: 12px; border: 1px dashed var(--border-dashed); margin-bottom: 16px;">
            <div>
              <div class="uds-label" style="font-size: 10px;">当班班长</div>
              <div style="font-weight: 700; font-size: 13px;">${s.supervisor || '未指定'}</div>
            </div>
            <div>
              <div class="uds-label" style="font-size: 10px;">常驻上岗人员</div>
              <div class="uds-mono" style="font-weight: 800; font-size: 13px; color: var(--emerald-text);">${s.active_staff_count || 0} 人</div>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 8px;">
            <button class="uds-btn-secondary btn-station-staff" data-id="${s.id}" data-name="${s.station_name}" style="height: 32px; padding: 0 12px; font-size: 12px;">
              调度人员 (${s.active_staff_count || 0})
            </button>
            <button class="uds-btn-ghost btn-station-edit" data-id="${s.id}" style="height: 32px; padding: 0 12px; font-size: 12px;">
              编辑工位
            </button>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll<HTMLButtonElement>('.btn-station-staff').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id ? parseInt(btn.dataset.id, 10) : 0;
        const name = btn.dataset.name || '';
        this.openStaffModal(id, name);
      };
    });

    grid.querySelectorAll<HTMLButtonElement>('.btn-station-edit').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id ? parseInt(btn.dataset.id, 10) : 0;
        this.openEditModal(id);
      };
    });
  },

  openEditModal(id: number): void {
    const s = (state.stations || []).find((item: Station) => item.id === id);
    if (!s) return;

    const title = document.getElementById('modal-station-title');
    if (title) title.innerText = `编辑工位 [${s.station_code}]`;

    const idInput = document.getElementById('station-id') as HTMLInputElement | null;
    const wsSelect = document.getElementById('station-workshop-select') as HTMLSelectElement | null;
    const codeInput = document.getElementById('station-code') as HTMLInputElement | null;
    const nameInput = document.getElementById('station-name') as HTMLInputElement | null;
    const supInput = document.getElementById('station-supervisor') as HTMLInputElement | null;
    const targetInput = document.getElementById('station-target') as HTMLInputElement | null;

    if (idInput) idInput.value = String(s.id);
    if (wsSelect) wsSelect.value = String(s.workshop_id);
    if (codeInput) codeInput.value = s.station_code;
    if (nameInput) nameInput.value = s.station_name;
    if (supInput) supInput.value = s.supervisor || '';
    if (targetInput) targetInput.value = String(s.target_output_daily || 100);

    openModal('modal-station');
  },

  async saveStation(): Promise<void> {
    const idVal = (document.getElementById('station-id') as HTMLInputElement | null)?.value;
    const wsVal = (document.getElementById('station-workshop-select') as HTMLSelectElement | null)?.value;
    const codeVal = (document.getElementById('station-code') as HTMLInputElement | null)?.value.trim() || '';
    const nameVal = (document.getElementById('station-name') as HTMLInputElement | null)?.value.trim() || '';
    const supVal = (document.getElementById('station-supervisor') as HTMLInputElement | null)?.value.trim() || '';
    const targetVal = (document.getElementById('station-target') as HTMLInputElement | null)?.value || '100';

    const stationData: Station = {
      id: idVal ? parseInt(idVal, 10) : null,
      workshop_id: wsVal ? parseInt(wsVal, 10) : 1,
      department_id: null,
      department_name: null,
      workshop_code: null,
      workshop_name: null,
      station_code: codeVal,
      station_name: nameVal,
      supervisor: supVal,
      target_output_daily: parseInt(targetVal, 10) || 100,
      sort_order: 10,
      status: 'ACTIVE',
      active_staff_count: null,
    };

    if (!stationData.station_code || !stationData.station_name) {
      showToast("[CRITICAL] 工位编码与工位名称为必填项", true);
      return;
    }

    try {
      await invokeBackend('save_station', { station: stationData });
      showToast(`工位 ${stationData.station_name} 保存成功`);
      closeModal('modal-station');
      await this.loadStations();
      await refreshSystemStats();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`保存工位失败: ${msg}`, true);
    }
  },

  async openStaffModal(stationId: number, stationName: string): Promise<void> {
    const title = document.getElementById('modal-staff-title');
    if (title) title.innerText = `工位人员调度名单 - ${stationName}`;

    const idInput = document.getElementById('assign-station-id') as HTMLInputElement | null;
    if (idInput) idInput.value = String(stationId);

    const empSelect = document.getElementById('assign-emp-select') as HTMLSelectElement | null;
    if (empSelect) {
      let opts = '<option value="">-- 选择员工 --</option>';
      (state.employees || []).forEach((e: Employee) => {
        if (e.status === 'ACTIVE') {
          opts += `<option value="${e.id}">${e.emp_code} - ${e.name} (${e.department || '车间'})</option>`;
        }
      });
      empSelect.innerHTML = opts;
    }

    await this.loadStationStaffList(stationId);
    openModal('modal-station-staff');
  },

  async loadStationStaffList(stationId: number): Promise<void> {
    const listContainer = document.getElementById('station-staff-list');
    if (!listContainer) return;

    try {
      const assignments = await invokeBackend('get_station_employees', { stationId });
      if (assignments.length === 0) {
        listContainer.innerHTML = `<div style="text-align: center; color: var(--muted-foreground); padding: 24px 0;">当前工位暂无分配常驻或借调人员</div>`;
        return;
      }

      listContainer.innerHTML = assignments.map((a: EmployeeStationAssignment) => {
        const isLoan = a.assignment_type === 'LOAN';
        const typeBadge = isLoan 
          ? `<span class="uds-badge uds-badge-alert">临时借调外援</span>`
          : `<span class="uds-badge uds-badge-healthy">常驻专岗</span>`;

        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #ffffff; border-radius: 12px; border: 1px solid var(--border-dashed);">
            <div>
              <span style="font-weight: 800; font-size: 14px;">${a.emp_name}</span>
              <span class="uds-mono" style="margin-left: 8px; color: var(--primary); font-size: 11px;">${a.emp_code}</span>
              <div class="uds-mono" style="font-size: 10px; color: var(--muted-foreground); margin-top: 2px;">生效日期: ${a.effective_from}</div>
            </div>
            <div>${typeBadge}</div>
          </div>
        `;
      }).join('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      listContainer.innerHTML = `<div style="color: var(--rose-text); padding: 12px;">加载人员归属异常: ${msg}</div>`;
    }
  },

  async saveStaffAssignment(): Promise<void> {
    const stationIdVal = (document.getElementById('assign-station-id') as HTMLInputElement | null)?.value;
    const empIdVal = (document.getElementById('assign-emp-select') as HTMLSelectElement | null)?.value;
    const typeVal = (document.getElementById('assign-type-select') as HTMLSelectElement | null)?.value as 'PRIMARY' | 'LOAN';

    if (!stationIdVal || !empIdVal) {
      showToast("[CRITICAL] 请选择要调度的员工", true);
      return;
    }

    const stationId = parseInt(stationIdVal, 10);
    const empId = parseInt(empIdVal, 10);
    const today = new Date().toISOString().split('T')[0];

    try {
      await invokeBackend('assign_employee_station', {
        empId,
        stationId,
        assignmentType: typeVal || 'PRIMARY',
        effectiveFrom: today,
        effectiveTo: null,
      });

      showToast("工位人员分配生效");
      await this.loadStationStaffList(stationId);
      await this.loadStations();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`人员分配失败: ${msg}`, true);
    }
  }
};
