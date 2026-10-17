/**
 * ERP UDS 1.0 - 极速流水记工业务模块控制器 (单兵/班组双核算架构)
 */

import { invokeBackend } from '../core/ipc.js';
import { state, refreshSystemStats } from '../core/state.js';
import { showToast } from '../core/toast.js';
import printEngine from './print_engine.js';

export default {
  currentMode: 'SINGLE', // 'SINGLE' (单兵个人记工) | 'TEAM' (班组集体记工)

  async init() {
    this.initFormControls();
    this.bindEvents();
    await Promise.all([
      this.loadTeams(),
      this.loadRecords(),
    ]);
  },

  async onActivated() {
    await this.loadTeams();
    this.renderStationSelects();
    this.renderTeamSelects();
    this.renderEmployeeSelects();
    this.renderProcessSelects();
    await this.loadRecords();
  },

  async loadTeams() {
    try {
      state.teams = await invokeBackend('get_teams');
    } catch (err) {
      console.error('[CRITICAL] 加载班组失败:', err);
    }
  },

  initFormControls() {
    const dateInput = document.getElementById('input-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
    this.renderStationSelects();
    this.renderTeamSelects();
    this.renderEmployeeSelects();
    this.renderProcessSelects();
  },

  // 渲染三级树形工位下拉框 (一级部门 / 二级工段 / 三级工位)
  renderStationSelects() {
    const mainSelect = document.getElementById('select-station');
    const filterSelect = document.getElementById('filter-station');

    const groups = {};
    (state.stations || []).forEach(s => {
      const dept = s.department_name || '成型制造部';
      const ws = s.workshop_name || '生产车间';
      const key = `${dept} / ${ws}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });

    let mainHtml = '<option value="">-- 选择作业工位 (三级树形) --</option>';
    let filterHtml = '<option value="">全部车间工位</option>';

    for (const [groupName, stations] of Object.entries(groups)) {
      mainHtml += `<optgroup label="🏭 ${groupName}">`;
      filterHtml += `<optgroup label="🏭 ${groupName}">`;
      stations.forEach(s => {
        mainHtml += `<option value="${s.id}">${s.station_code} · ${s.station_name}</option>`;
        filterHtml += `<option value="${s.id}">${s.station_code} · ${s.station_name}</option>`;
      });
      mainHtml += `</optgroup>`;
      filterHtml += `</optgroup>`;
    }

    if (mainSelect) mainSelect.innerHTML = mainHtml;
    if (filterSelect) filterSelect.innerHTML = filterHtml;
  },

  // 渲染独立班组下拉框 (独立字典，非树形嵌套)
  renderTeamSelects() {
    const mainTeamSelect = document.getElementById('select-team');
    const filterTeamSelect = document.getElementById('filter-team');

    let mainHtml = '<option value="">-- 选择独立生产班组 --</option>';
    let filterHtml = '<option value="">全部独立班组</option>';

    (state.teams || []).forEach(t => {
      const count = t.member_count || 0;
      const countText = count > 0 ? ` (${count}人)` : ' (无在册人)';
      mainHtml += `<option value="${t.id}" data-count="${count}" data-name="${t.team_name}">${t.team_code} · ${t.team_name}${countText}</option>`;
      filterHtml += `<option value="${t.id}">${t.team_code} · ${t.team_name}</option>`;
    });

    if (mainTeamSelect) mainTeamSelect.innerHTML = mainHtml;
    if (filterTeamSelect) filterTeamSelect.innerHTML = filterHtml;
  },

  renderEmployeeSelects(stationId = null) {
    const mainSelect = document.getElementById('select-employee');
    const filterSelect = document.getElementById('filter-emp');
    const checkAll = document.getElementById('check-all-staff')?.checked;

    let options = '<option value="">-- 选择作业人员 (单兵个人) --</option>';

    let availableEmployees = (state.employees || []).filter(e => e.status === 'ACTIVE');
    if (stationId && !checkAll) {
      const stationEmployees = availableEmployees.filter(e => e.primary_station_id === stationId);
      if (stationEmployees.length > 0) {
        availableEmployees = stationEmployees;
      }
    }

    availableEmployees.forEach(e => {
      const teamTag = e.team_name ? ` [${e.team_name}]` : '';
      options += `<option value="${e.id}">${e.emp_code} - ${e.name}${teamTag}</option>`;
    });

    if (mainSelect) mainSelect.innerHTML = options;

    let filterOptions = '<option value="">全部作业人员</option>';
    (state.employees || []).forEach(e => {
      filterOptions += `<option value="${e.id}">${e.emp_code} - ${e.name}</option>`;
    });
    if (filterSelect) filterSelect.innerHTML = filterOptions;
  },

  renderProcessSelects(stationId = null) {
    const mainSelect = document.getElementById('select-process');
    const filterSelect = document.getElementById('filter-process');

    let options = '<option value="">-- 选择碳纤工艺 / 规格型号 --</option>';
    
    const availableProcesses = stationId 
      ? (state.processes || []).filter(p => p.status === 'ACTIVE' && p.recommended_station_id === stationId)
      : (state.processes || []).filter(p => p.status === 'ACTIVE');

    const finalProcesses = availableProcesses.length > 0 ? availableProcesses : (state.processes || []).filter(p => p.status === 'ACTIVE');

    finalProcesses.forEach(p => {
      options += `<option value="${p.id}" data-price="${p.unit_price}">[${p.product_spec}] ${p.process_code} - ${p.process_name} (¥${Number(p.unit_price).toFixed(2)}/${p.unit})</option>`;
    });

    if (mainSelect) mainSelect.innerHTML = options;

    let filterOpts = '<option value="">全部加工工艺</option>';
    (state.processes || []).forEach(p => {
      filterOpts += `<option value="${p.id}">${p.process_code} - ${p.process_name}</option>`;
    });
    if (filterSelect) filterSelect.innerHTML = filterOpts;
  },

  bindEvents() {
    const stationSelect = document.getElementById('select-station');
    const teamSelect = document.getElementById('select-team');
    const processSelect = document.getElementById('select-process');
    const unitPriceInput = document.getElementById('input-unit-price');
    const qtyInput = document.getElementById('input-quantity');
    const scrapInput = document.getElementById('input-scrap');
    const checkAllStaff = document.getElementById('check-all-staff');
    const form = document.getElementById('form-rapid-entry');

    // 双核算模式切换按钮
    const btnSingle = document.getElementById('btn-mode-single');
    const btnTeam = document.getElementById('btn-mode-team');

    if (btnSingle && btnTeam) {
      btnSingle.onclick = () => this.switchMode('SINGLE');
      btnTeam.onclick = () => this.switchMode('TEAM');
    }

    // 重新计算总额
    const recalculate = () => {
      const price = parseFloat(unitPriceInput?.value) || 0;
      const qty = parseInt(qtyInput?.value, 10) || 0;
      const total = price * qty;
      const displayTotal = document.getElementById('display-total-amount');
      if (displayTotal) {
        displayTotal.innerText = `¥${total.toFixed(2)}`;
      }
    };

    if (stationSelect) {
      stationSelect.onchange = () => {
        const val = stationSelect.value ? parseInt(stationSelect.value, 10) : null;
        this.renderEmployeeSelects(val);
        this.renderProcessSelects(val);
      };
    }

    if (teamSelect) {
      teamSelect.onchange = () => {
        const opt = teamSelect.options[teamSelect.selectedIndex];
        const badge = document.getElementById('badge-team-member-count');
        const count = parseInt(opt?.dataset?.count || '0', 10);
        if (badge) {
          if (!teamSelect.value) {
            badge.innerText = '未选班组';
            badge.style.color = 'var(--muted-foreground)';
          } else if (count > 0) {
            badge.innerText = `👥 全班 ${count} 人均摊`;
            badge.style.color = 'var(--emerald-text)';
          } else {
            badge.innerText = '⚠️ 空班组(不可报工)';
            badge.style.color = '#ef4444';
          }
        }
      };
    }

    if (checkAllStaff) {
      checkAllStaff.onchange = () => {
        const stationVal = stationSelect?.value ? parseInt(stationSelect.value, 10) : null;
        this.renderEmployeeSelects(stationVal);
      };
    }

    if (processSelect) {
      processSelect.onchange = () => {
        const opt = processSelect.options[processSelect.selectedIndex];
        const price = opt?.dataset?.price;
        if (price !== undefined && price !== '') {
          unitPriceInput.value = parseFloat(price).toFixed(2);
        } else {
          unitPriceInput.value = '';
        }
        recalculate();
      };
    }

    if (qtyInput) qtyInput.oninput = recalculate;
    if (scrapInput) scrapInput.oninput = recalculate;

    // 键盘流快速跳转
    const inputSequence = [
      'input-date',
      'input-batch',
      'select-station',
      'select-employee',
      'select-process',
      'input-quantity',
      'input-scrap'
    ];

    inputSequence.forEach((id, idx) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (idx < inputSequence.length - 1) {
            const nextEl = document.getElementById(inputSequence[idx + 1]);
            if (nextEl) nextEl.focus();
          } else {
            document.getElementById('btn-submit-record')?.click();
          }
        }
      });
    });

    // 表单提交
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        await this.submitRecord();
      };
    }

    // 流水筛选与导出
    document.getElementById('filter-station')?.addEventListener('change', () => this.loadRecords());
    document.getElementById('filter-batch')?.addEventListener('input', () => this.loadRecords());
    document.getElementById('filter-team')?.addEventListener('change', () => this.loadRecords());
    document.getElementById('filter-emp')?.addEventListener('change', () => this.loadRecords());
    document.getElementById('filter-process')?.addEventListener('change', () => this.loadRecords());
    document.getElementById('btn-refresh-records')?.addEventListener('click', () => this.loadRecords());
    document.getElementById('btn-export-records-csv')?.addEventListener('click', () => this.exportCsv());
    document.getElementById('btn-print-records')?.addEventListener('click', () => {
      if (!state.records || state.records.length === 0) {
        showToast("当前无流水记录可供打印", true);
        return;
      }
      printEngine.openPrintModal('RECORDS_DEPT');
    });
  },

  switchMode(mode) {
    this.currentMode = mode;
    const btnSingle = document.getElementById('btn-mode-single');
    const btnTeam = document.getElementById('btn-mode-team');
    const empBox = document.getElementById('container-employee-select');
    const teamBox = document.getElementById('container-team-select');
    const allStaffLabel = document.getElementById('label-all-staff');
    const btnSubmit = document.getElementById('btn-submit-record');

    if (mode === 'SINGLE') {
      btnSingle.className = 'uds-btn-primary';
      btnSingle.style.color = '#ffffff';
      btnTeam.className = 'uds-btn-ghost';
      btnTeam.style.color = 'var(--muted-foreground)';

      if (empBox) empBox.style.display = 'block';
      if (teamBox) teamBox.style.display = 'none';
      if (allStaffLabel) allStaffLabel.style.display = 'flex';
      if (btnSubmit) {
        btnSubmit.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          单兵记工提交
        `;
      }
    } else {
      btnTeam.className = 'uds-btn-primary';
      btnTeam.style.color = '#ffffff';
      btnSingle.className = 'uds-btn-ghost';
      btnSingle.style.color = 'var(--muted-foreground)';

      if (empBox) empBox.style.display = 'none';
      if (teamBox) teamBox.style.display = 'block';
      if (allStaffLabel) allStaffLabel.style.display = 'none';
      if (btnSubmit) {
        btnSubmit.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          班组集体提交 (平分至全班人员)
        `;
      }
    }
  },

  async submitRecord() {
    const stationId = parseInt(document.getElementById('select-station').value, 10);
    const processId = parseInt(document.getElementById('select-process').value, 10);
    const date = document.getElementById('input-date').value;
    const batchNo = document.getElementById('input-batch').value.trim();
    const qty = parseInt(document.getElementById('input-quantity').value, 10);
    const scrap = parseInt(document.getElementById('input-scrap').value, 10) || 0;
    const unitPrice = parseFloat(document.getElementById('input-unit-price').value);

    if (!stationId || !processId || !date || !batchNo || isNaN(qty) || qty <= 0 || isNaN(unitPrice)) {
      showToast("[CRITICAL] 请完整填写工位、工艺、批次及有效数量", true);
      return;
    }

    try {
      if (this.currentMode === 'SINGLE') {
        const employeeId = parseInt(document.getElementById('select-employee').value, 10);
        if (!employeeId) {
          showToast("[CRITICAL] 单兵记工模式下必须选择作业人员", true);
          return;
        }

        const newRecord = await invokeBackend('add_record', {
          input: {
            record_date: date,
            station_id: stationId,
            emp_id: employeeId,
            process_id: processId,
            batch_no: batchNo,
            quantity: qty,
            scrap_quantity: scrap,
            unit_price: unitPrice,
            notes: ''
          }
        });

        showToast(`单兵记工录入成功: ¥${Number(newRecord.total_amount).toFixed(2)} (${newRecord.quantity} 件)`);
      } else {
        // 班组集体记工模式
        const teamSelect = document.getElementById('select-team');
        const teamId = parseInt(teamSelect?.value, 10);
        if (!teamId) {
          showToast("[CRITICAL] 班组集体记工模式下必须选择作业班组", true);
          return;
        }

        const opt = teamSelect.options[teamSelect.selectedIndex];
        const teamName = opt?.dataset?.name || '班组';

        const createdRecords = await invokeBackend('add_team_batch_record', {
          input: {
            record_date: date,
            batch_no: batchNo,
            team_id: teamId,
            station_id: stationId,
            process_id: processId,
            total_quantity: qty,
            scrap_quantity: scrap,
            unit_price: unitPrice,
            notes: ''
          }
        });

        const totalBatchAmount = (qty * unitPrice).toFixed(2);
        showToast(`班组【${teamName}】集体记工成功：全班 ${createdRecords.length} 人平分，共 ¥${totalBatchAmount}`);
      }

      const qtyInput = document.getElementById('input-quantity');
      if (qtyInput) qtyInput.value = '';
      const scrapInput = document.getElementById('input-scrap');
      if (scrapInput) scrapInput.value = '0';
      const displayTotal = document.getElementById('display-total-amount');
      if (displayTotal) displayTotal.innerText = '¥0.00';
      
      // 保持批次和工位，光标直接回到数量框，实现连续极速录入
      if (qtyInput) qtyInput.focus();

      await Promise.all([
        this.loadRecords(),
        refreshSystemStats()
      ]);
    } catch (err) {
      showToast(`记工失败: ${err.message || err}`, true);
    }
  },

  async loadRecords() {
    try {
      const stationIdVal = document.getElementById('filter-station')?.value;
      const batchNoVal = document.getElementById('filter-batch')?.value?.trim();
      const teamIdVal = document.getElementById('filter-team')?.value;
      const empIdVal = document.getElementById('filter-emp')?.value;
      const processIdVal = document.getElementById('filter-process')?.value;

      let records = await invokeBackend('get_records', {
        startDate: null,
        endDate: null,
        stationId: stationIdVal ? parseInt(stationIdVal, 10) : null,
        empId: empIdVal ? parseInt(empIdVal, 10) : null,
        processId: processIdVal ? parseInt(processIdVal, 10) : null,
        batchNo: batchNoVal || null,
        limit: 500,
      });

      // 班组前端过滤
      if (teamIdVal) {
        const tid = parseInt(teamIdVal, 10);
        records = records.filter(r => r.team_id === tid);
      }

      state.records = records;
      this.renderRecordsTable();
    } catch (err) {
      showToast(`加载流水失败: ${err.message || err}`, true);
    }
  },

  renderRecordsTable() {
    const tbody = document.getElementById('records-table-body');
    if (!tbody) return;

    if (!state.records || state.records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: var(--muted-foreground); padding: 36px 0;">暂无计件流水记录</td></tr>`;
      return;
    }

    tbody.innerHTML = state.records.map(r => {
      const isSettled = r.settled === 1;
      const badge = isSettled 
        ? `<span class="uds-badge uds-badge-healthy">已核算锁定</span>` 
        : `<span class="uds-badge uds-badge-alert">待核算</span>`;
      
      const delBtn = isSettled
        ? `<span class="uds-mono" style="opacity: 0.4;">不可修改</span>`
        : `<button class="uds-btn-danger" data-id="${r.id}">删除</button>`;

      const scrapText = r.scrap_quantity > 0 
        ? `<span style="color: var(--rose-text); font-weight: 800;">${r.scrap_quantity}</span>`
        : `<span style="opacity: 0.4;">0</span>`;

      // 班组标识：如果是班组集体记工分摊
      const teamTag = r.team_name
        ? `<span class="uds-badge uds-badge-healthy" style="font-size: 8px; padding: 1px 5px; margin-left: 4px;">${r.team_name}</span>`
        : `<span class="uds-badge" style="font-size: 8px; padding: 1px 5px; margin-left: 4px; background: #f1f5f9; color: #94a3b8;">单兵</span>`;

      return `
        <tr>
          <td class="uds-mono" style="font-size: 11px; opacity: 0.7;">#${r.id}</td>
          <td class="uds-mono">${r.record_date}</td>
          <td class="uds-mono" style="font-weight: 700; color: var(--primary);">${r.batch_no}</td>
          <td>
            <div style="font-weight: 700; color: var(--foreground);">${r.station_name || '工位'}</div>
            <div class="uds-mono" style="font-size: 9px; color: var(--muted-foreground);">${r.workshop_name || ''}</div>
          </td>
          <td>
            <div style="display: flex; align-items: center;">
              <span style="font-weight: 800; font-size: 13px;">${r.emp_name || '-'}</span>
              ${teamTag}
            </div>
            <div class="uds-mono" style="font-size: 10px; color: var(--muted-foreground);">${r.emp_code || ''}</div>
          </td>
          <td>
            <div style="font-weight: 700;">${r.process_name || '-'}</div>
            <div class="uds-mono" style="font-size: 11px; color: var(--muted-foreground);">${r.product_spec ? '[' + r.product_spec + ']' : ''} ${r.process_code || ''}</div>
          </td>
          <td class="uds-mono" style="text-align: right; font-weight: 800; font-size: 13px;">${r.quantity}</td>
          <td class="uds-mono" style="text-align: right;">${scrapText}</td>
          <td class="uds-mono" style="text-align: right; color: var(--muted-foreground);">¥${Number(r.unit_price).toFixed(2)}</td>
          <td class="uds-mono" style="text-align: right; font-weight: 900; font-size: 14px; color: var(--emerald-text);">¥${Number(r.total_amount).toFixed(2)}</td>
          <td style="text-align: center;">${badge}</td>
          <td style="text-align: center;">${delBtn}</td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.uds-btn-danger').forEach(btn => {
      btn.onclick = async () => {
        const id = parseInt(btn.dataset.id, 10);
        if (confirm(`确定要删除流水 #${id} 吗？`)) {
          try {
            await invokeBackend('delete_record', { id });
            showToast(`流水 #${id} 已删除`);
            await this.loadRecords();
            await refreshSystemStats();
          } catch (err) {
            showToast(`删除失败: ${err.message || err}`, true);
          }
        }
      };
    });
  },

  async exportCsv() {
    try {
      const csvStr = await invokeBackend('export_csv_records');
      const blob = new Blob(["\uFEFF" + csvStr], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `车间计件流水明细_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("车间计件流水明细 CSV 导出成功");
    } catch (err) {
      showToast(`导出失败: ${err.message || err}`, true);
    }
  }
};
