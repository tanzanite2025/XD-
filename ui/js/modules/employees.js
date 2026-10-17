/**
 * ERP UDS 1.0 - 员工档案与独立班组管理业务模块
 */

import { invokeBackend } from '../core/ipc.js';
import { state, refreshSystemStats } from '../core/state.js';
import { showToast } from '../core/toast.js';
import { openModal, closeModal } from '../core/view_loader.js';

export default {
  async init() {
    this.bindEvents();
    await this.loadTeams();
    this.renderEmployeesTable();
  },

  async onActivated() {
    await Promise.all([
      this.loadTeams(),
      this.loadEmployees(),
    ]);
  },

  bindEvents() {
    document.getElementById('search-emp')?.addEventListener('input', () => this.renderEmployeesTable());

    // 登记新员工按钮
    const btnOpenAdd = document.getElementById('btn-open-add-emp');
    if (btnOpenAdd) {
      btnOpenAdd.onclick = () => this.openAddModal();
    }

    // 独立班组字典弹窗按钮
    const btnOpenTeam = document.getElementById('btn-open-team-manager');
    if (btnOpenTeam) {
      btnOpenTeam.onclick = () => this.openTeamSpecsModal();
    }

    // 从员工弹窗跳转打开班组管理
    const btnOpenTeamFromEmp = document.getElementById('btn-open-team-manager-from-emp');
    if (btnOpenTeamFromEmp) {
      btnOpenTeamFromEmp.onclick = () => {
        closeModal('modal-employee');
        this.openTeamSpecsModal();
      };
    }

    // 添加新班组
    const btnAddTeam = document.getElementById('btn-submit-add-team');
    if (btnAddTeam) {
      btnAddTeam.onclick = () => this.addTeam();
    }

    // 员工表单提交
    const formEmp = document.getElementById('form-emp');
    if (formEmp) {
      formEmp.onsubmit = async (e) => {
        e.preventDefault();
        await this.saveEmployee();
      };
    }
  },

  async loadTeams() {
    try {
      state.teams = await invokeBackend('get_teams');
    } catch (err) {
      console.error('[CRITICAL] 班组数据拉取失败:', err);
      showToast(`班组数据拉取失败: ${err.message || err}`, true);
    }
  },

  async loadEmployees() {
    try {
      state.employees = await invokeBackend('get_employees');
      this.renderEmployeesTable();
    } catch (err) {
      showToast(`员工档案拉取失败: ${err.message || err}`, true);
    }
  },

  renderEmployeesTable() {
    const tbody = document.getElementById('employees-table-body');
    if (!tbody) return;

    const searchVal = document.getElementById('search-emp')?.value.toLowerCase().trim() || '';

    const filtered = (state.employees || []).filter(e => {
      if (!searchVal) return true;
      return e.emp_code.toLowerCase().includes(searchVal) ||
             e.name.toLowerCase().includes(searchVal) ||
             (e.team_name && e.team_name.toLowerCase().includes(searchVal)) ||
             (e.department && e.department.toLowerCase().includes(searchVal)) ||
             (e.primary_station_name && e.primary_station_name.toLowerCase().includes(searchVal));
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--muted-foreground); padding: 36px 0;">未检索到在册员工档案</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(e => {
      // 班组标签渲染 (独立从属，非树形)
      const teamBadge = e.team_name 
        ? `<span class="uds-badge uds-badge-healthy" style="font-weight: 700;">${e.team_name}</span>`
        : `<span class="uds-badge" style="background: #f1f5f9; color: #64748b; border: 1px dashed #cbd5e1;">个人独立</span>`;

      // 三级工位层级渲染
      const deptText = e.department_name || e.department || '未定部门';
      const wsText = e.workshop_name || '通用工段';
      const stationText = e.primary_station_name || '全厂通调工位';

      return `
        <tr>
          <td class="uds-mono" style="font-weight: 700; color: var(--primary);">${e.emp_code}</td>
          <td style="font-weight: 800; color: var(--foreground); font-size: 14px;">${e.name}</td>
          <td>${teamBadge}</td>
          <td>
            <div style="font-weight: 700; color: var(--foreground);">${stationText}</div>
            <div class="uds-mono" style="font-size: 10px; color: var(--muted-foreground);">${deptText} · ${wsText}</div>
          </td>
          <td class="uds-mono">${e.phone || '-'}</td>
          <td style="text-align: center;"><span class="uds-badge uds-badge-healthy">在册上岗</span></td>
          <td class="uds-mono" style="font-size: 11px; color: var(--muted-foreground);">${e.created_at || '-'}</td>
          <td style="text-align: center;">
            <button class="uds-btn-ghost btn-emp-edit" data-id="${e.id}">编辑</button>
            <button class="uds-btn-danger btn-emp-delete" data-id="${e.id}" style="margin-left: 6px;">删除</button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-emp-edit').forEach(btn => {
      btn.onclick = () => this.openEditModal(parseInt(btn.dataset.id, 10));
    });

    tbody.querySelectorAll('.btn-emp-delete').forEach(btn => {
      btn.onclick = () => this.deleteEmployee(parseInt(btn.dataset.id, 10));
    });
  },

  // 渲染工位三级树形下拉菜单 (部门 -> 工段 -> 工位)
  renderStationTreeSelect(selectedStationId) {
    const stSelect = document.getElementById('emp-station-select');
    if (!stSelect) return;

    if (!state.stations || state.stations.length === 0) {
      stSelect.innerHTML = '<option value="">-- 暂无可用生产工位 --</option>';
      return;
    }

    // 按 “部门 / 工段” 分组
    const groups = {};
    state.stations.forEach(s => {
      const dept = s.department_name || '制造部';
      const ws = s.workshop_name || '生产车间';
      const groupKey = `${dept} / ${ws}`;
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(s);
    });

    let html = '<option value="">-- 选择常驻主工位 (三级树形架构) --</option>';
    for (const [groupName, stations] of Object.entries(groups)) {
      html += `<optgroup label="🏭 ${groupName}">`;
      stations.forEach(st => {
        const sel = st.id === selectedStationId ? 'selected' : '';
        html += `<option value="${st.id}" ${sel}>${st.station_code} · ${st.station_name}</option>`;
      });
      html += `</optgroup>`;
    }
    stSelect.innerHTML = html;
  },

  // 渲染独立班组下拉菜单
  renderTeamSelect(selectedTeamId) {
    const teamSelect = document.getElementById('emp-team-select');
    if (!teamSelect) return;

    let html = '<option value="">-- 暂不分配班组 (个人独立作业) --</option>';
    (state.teams || []).forEach(t => {
      const sel = t.id === selectedTeamId ? 'selected' : '';
      const leader = t.leader_name ? ` (班长: ${t.leader_name})` : '';
      html += `<option value="${t.id}" ${sel}>${t.team_code} · ${t.team_name}${leader}</option>`;
    });
    teamSelect.innerHTML = html;
  },

  openAddModal() {
    document.getElementById('modal-emp-title').innerText = "登记新员工档案";
    document.getElementById('emp-id').value = '';
    document.getElementById('emp-code').value = '';
    document.getElementById('emp-code').readOnly = false;
    document.getElementById('emp-code').style.background = '#ffffff';
    document.getElementById('emp-name').value = '';
    document.getElementById('emp-dept').value = '';
    document.getElementById('emp-phone').value = '';

    this.renderTeamSelect(null);
    this.renderStationTreeSelect(null);

    openModal('modal-employee');
  },

  openEditModal(id) {
    const e = (state.employees || []).find(item => item.id === id);
    if (!e) return;

    document.getElementById('modal-emp-title').innerText = `编辑员工档案 [${e.emp_code}]`;
    document.getElementById('emp-id').value = e.id;
    document.getElementById('emp-code').value = e.emp_code;
    document.getElementById('emp-code').readOnly = true;
    document.getElementById('emp-code').style.background = '#f1f5f9';
    document.getElementById('emp-name').value = e.name;
    document.getElementById('emp-dept').value = e.department || '';
    document.getElementById('emp-phone').value = e.phone || '';

    this.renderTeamSelect(e.team_id || null);
    this.renderStationTreeSelect(e.primary_station_id || null);

    openModal('modal-employee');
  },

  async saveEmployee() {
    const id = document.getElementById('emp-id').value;
    const teamIdVal = document.getElementById('emp-team-select').value;
    const stationIdVal = document.getElementById('emp-station-select').value;

    const primaryStationId = stationIdVal ? parseInt(stationIdVal, 10) : null;
    const teamId = teamIdVal ? parseInt(teamIdVal, 10) : null;

    // 自动关联部门名称
    let deptName = '';
    if (primaryStationId) {
      const st = (state.stations || []).find(s => s.id === primaryStationId);
      if (st) {
        deptName = st.department_name || st.workshop_name || '成型制造部';
      }
    }
    if (!deptName && teamId) {
      const tm = (state.teams || []).find(t => t.id === teamId);
      if (tm) {
        deptName = tm.team_name;
      }
    }
    if (!deptName) {
      deptName = '制造部';
    }

    const empData = {
      id: id ? parseInt(id, 10) : null,
      emp_code: document.getElementById('emp-code').value.trim(),
      name: document.getElementById('emp-name').value.trim(),
      department: deptName,
      department_name: null,
      team_id: teamId,
      team_name: null,
      primary_station_id: primaryStationId,
      primary_station_name: null,
      workshop_name: null,
      skill_level: '',
      phone: document.getElementById('emp-phone').value.trim(),
      status: 'ACTIVE',
      created_at: null,
    };

    if (!empData.emp_code || !empData.name) {
      showToast("[CRITICAL] 工号与真实姓名为必填项", true);
      return;
    }

    try {
      if (id) {
        await invokeBackend('update_employee', { emp: empData });
        showToast(`员工 ${empData.name} 档案已更新`);
      } else {
        await invokeBackend('add_employee', { emp: empData });
        showToast(`新员工 ${empData.name} 登记成功`);
      }

      closeModal('modal-employee');
      await Promise.all([this.loadEmployees(), this.loadTeams()]);
      await refreshSystemStats();
    } catch (err) {
      showToast(`保存员工档案失败: ${err.message || err}`, true);
    }
  },

  async deleteEmployee(id) {
    const e = (state.employees || []).find(item => item.id === id);
    const codeName = e ? `[${e.emp_code} ${e.name}]` : `#${id}`;

    if (!confirm(`确定要注销员工 ${codeName} 的档案吗？\n如果该员工已有历史报工流水，系统将阻止物理删除。`)) {
      return;
    }

    try {
      await invokeBackend('delete_employee', { id });
      showToast(`员工 ${codeName} 档案已安全注销`);
      await Promise.all([this.loadEmployees(), this.loadTeams()]);
      await refreshSystemStats();
    } catch (err) {
      showToast(`删除失败: ${err.message || err}`, true);
    }
  },

  // --- 独立班组主数据弹窗维护 ---
  async openTeamSpecsModal() {
    await this.loadTeams();
    this.renderTeamsTable();
    openModal('modal-team-specs');
  },

  renderTeamsTable() {
    const tbody = document.getElementById('team-specs-table-body');
    const badge = document.getElementById('team-specs-count-badge');
    if (!tbody) return;

    const list = state.teams || [];
    if (badge) badge.innerText = `${list.length} 个班组`;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--muted-foreground); padding: 24px 0;">暂未录入任何独立班组</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(t => {
      const memberCount = t.member_count || 0;
      const memberBadge = memberCount > 0
        ? `<span class="uds-badge uds-badge-healthy" style="font-weight: 700;">${memberCount} 人在册</span>`
        : `<span class="uds-badge" style="background:#f1f5f9; color:#94a3b8;">空班组</span>`;

      return `
        <tr>
          <td class="uds-mono" style="font-weight: 700; color: var(--primary); padding: 8px 12px;">${t.team_code}</td>
          <td style="font-weight: 800; padding: 8px 12px;">${t.team_name}</td>
          <td style="padding: 8px 12px; color: var(--muted-foreground);">${t.leader_name || '-'}</td>
          <td style="text-align: center; padding: 8px 12px;">${memberBadge}</td>
          <td style="text-align: right; padding: 8px 12px;">
            <button class="uds-btn-danger btn-del-team" data-id="${t.id}" data-name="${t.team_name}" data-count="${memberCount}" style="padding: 2px 8px; font-size: 11px;">
              删除
            </button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-del-team').forEach(btn => {
      btn.onclick = () => {
        const id = parseInt(btn.dataset.id, 10);
        const name = btn.dataset.name;
        const count = parseInt(btn.dataset.count, 10);
        this.deleteTeam(id, name, count);
      };
    });
  },

  async addTeam() {
    const codeInput = document.getElementById('input-new-team-code');
    const nameInput = document.getElementById('input-new-team-name');
    const leaderInput = document.getElementById('input-new-team-leader');

    const code = codeInput?.value.trim().toUpperCase() || '';
    const name = nameInput?.value.trim() || '';
    const leader = leaderInput?.value.trim() || '';

    if (!code || !name) {
      showToast("[CRITICAL] 班组代码与班组名称不能为空", true);
      return;
    }

    const teamData = {
      id: null,
      team_code: code,
      team_name: name,
      leader_name: leader,
      remarks: '',
      sort_order: 10,
      member_count: null,
    };

    try {
      await invokeBackend('save_team', { team: teamData });
      showToast(`班组【${name}】添加成功`);
      if (codeInput) codeInput.value = '';
      if (nameInput) nameInput.value = '';
      if (leaderInput) leaderInput.value = '';
      await this.loadTeams();
      this.renderTeamsTable();
      this.renderTeamSelect(null);
    } catch (err) {
      showToast(`新增班组失败: ${err.message || err}`, true);
    }
  },

  async deleteTeam(id, name, memberCount) {
    if (memberCount > 0) {
      showToast(`[CRITICAL] 无法删除班组【${name}】：当前有 ${memberCount} 名员工归属于该班组！`, true);
      return;
    }

    if (!confirm(`确定要移除班组【${name}】吗？`)) {
      return;
    }

    try {
      await invokeBackend('delete_team', { id });
      showToast(`班组【${name}】已成功移除`);
      await this.loadTeams();
      this.renderTeamsTable();
      this.renderTeamSelect(null);
    } catch (err) {
      showToast(`删除班组失败: ${err.message || err}`, true);
    }
  }
};
