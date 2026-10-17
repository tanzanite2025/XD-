/**
 * ERP UDS 1.0 - 薪资核算与对账台业务模块
 */

import { invokeBackend } from '../core/ipc.js';
import { state } from '../core/state.js';
import { showToast } from '../core/toast.js';
import printEngine from './print_engine.js';

export default {
  async init() {
    this.initDates();
    this.bindEvents();
    await this.queryPayroll();
  },

  async onActivated() {
    this.renderStationFilter();
    await this.queryPayroll();
  },

  initDates() {
    const start = document.getElementById('payroll-start-date');
    const end = document.getElementById('payroll-end-date');
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];

    if (start && !start.value) start.value = firstDay;
    if (end && !end.value) end.value = today;

    this.renderStationFilter();
  },

  renderStationFilter() {
    const sel = document.getElementById('payroll-station-filter');
    if (!sel) return;

    let opts = '<option value="">全厂工位统一汇总</option>';
    state.stations.forEach(s => {
      opts += `<option value="${s.id}">${s.station_code} - ${s.station_name}</option>`;
    });
    sel.innerHTML = opts;
  },

  bindEvents() {
    document.getElementById('btn-query-payroll')?.addEventListener('click', () => this.queryPayroll());
    document.getElementById('btn-batch-settle')?.addEventListener('click', () => this.batchSettle());
    document.getElementById('btn-export-payroll-csv')?.addEventListener('click', () => this.exportPayrollCsv());
    document.getElementById('btn-export-station-csv')?.addEventListener('click', () => this.exportStationCsv());
    document.getElementById('btn-print-payroll')?.addEventListener('click', () => this.printPayroll());
    document.getElementById('btn-print-stations-report')?.addEventListener('click', () => {
      if (!state.stationSummaries || state.stationSummaries.length === 0) {
        showToast("当前暂无工位数据可供打印", true);
        return;
      }
      printEngine.openPrintModal('STATIONS_SUMMARY');
    });
  },

  async queryPayroll() {
    const start = document.getElementById('payroll-start-date')?.value;
    const end = document.getElementById('payroll-end-date')?.value;
    const stationIdVal = document.getElementById('payroll-station-filter')?.value;
    const stationId = stationIdVal ? parseInt(stationIdVal, 10) : null;

    try {
      const [payroll, stationSummaries] = await Promise.all([
        invokeBackend('get_payroll_summary', { startDate: start, endDate: end, stationId }),
        invokeBackend('get_station_summary', { startDate: start, endDate: end }),
      ]);

      state.payroll = payroll;
      state.stationSummaries = stationSummaries;

      this.renderPayrollSummary();
      this.renderStationSummaryTable();
      showToast(`核算汇总更新完成，包含 ${payroll.length} 位员工工薪账单`);
    } catch (err) {
      showToast(`核算失败: ${err.message || err}`, true);
    }
  },

  renderPayrollSummary() {
    const tbody = document.getElementById('payroll-table-body');
    if (!tbody) return;

    if (!state.payroll || state.payroll.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--muted-foreground); padding: 36px 0;">所选时间段内暂无计件流水</td></tr>`;
      return;
    }

    tbody.innerHTML = state.payroll.map(p => `
      <tr>
        <td class="uds-mono" style="font-weight: 700; color: var(--primary);">${p.emp_code}</td>
        <td style="font-weight: 800; font-size: 14px; color: var(--foreground);">${p.emp_name}</td>
        <td><span class="uds-badge" style="background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;">${p.department}</span></td>
        <td><span class="uds-badge" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe;">${p.primary_station_name || '未指派'}</span></td>
        <td style="text-align: right;" class="uds-mono">${p.total_records} 笔</td>
        <td style="text-align: right; font-weight: 800; color: var(--emerald-text);">${p.total_pieces}</td>
        <td style="text-align: right; color: ${p.total_scrap > 0 ? 'var(--rose-text)' : 'var(--muted-foreground)'}; font-weight: 700;">${p.total_scrap}</td>
        <td style="text-align: right; font-weight: 800; color: var(--primary); font-size: 15px;">¥${Number(p.total_amount).toFixed(2)}</td>
        <td style="text-align: center;"><span class="uds-badge uds-badge-healthy">${p.settled_records} 笔</span></td>
        <td style="text-align: center;"><span class="uds-badge ${p.unsettled_records > 0 ? 'uds-badge-alert' : 'uds-badge-healthy'}">${p.unsettled_records} 笔</span></td>
      </tr>
    `).join('');
  },

  renderStationSummaryTable() {
    const tbody = document.getElementById('station-summary-table-body');
    if (!tbody) return;

    if (!state.stationSummaries || state.stationSummaries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--muted-foreground); padding: 36px 0;">暂无站点产量数据</td></tr>`;
      return;
    }

    tbody.innerHTML = state.stationSummaries.map(s => `
      <tr>
        <td class="uds-mono" style="font-weight: 700; color: var(--primary);">${s.station_code}</td>
        <td style="font-weight: 800; color: var(--foreground);">${s.station_name}</td>
        <td><span class="uds-badge" style="background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;">${s.workshop_name}</span></td>
        <td style="font-weight: 700; color: var(--foreground);">${s.supervisor || '-'}</td>
        <td style="text-align: right; font-weight: 800; color: var(--emerald-text);">${s.total_pieces}</td>
        <td style="text-align: right; color: ${s.total_scrap > 0 ? 'var(--rose-text)' : 'var(--muted-foreground)'};">${s.total_scrap}</td>
        <td style="text-align: right; font-weight: 800; color: var(--primary); font-size: 14px;">¥${Number(s.total_amount).toFixed(2)}</td>
        <td style="text-align: right;" class="uds-mono">${s.record_count} 笔</td>
      </tr>
    `).join('');
  },

  async batchSettle() {
    const start = document.getElementById('payroll-start-date')?.value;
    const end = document.getElementById('payroll-end-date')?.value;
    const stationIdVal = document.getElementById('payroll-station-filter')?.value;
    const stationId = stationIdVal ? parseInt(stationIdVal, 10) : null;

    try {
      const records = await invokeBackend('get_records', { startDate: start, endDate: end, stationId });
      const unsettledIds = records.filter(r => r.settled === 0).map(r => r.id);

      if (unsettledIds.length === 0) {
        showToast("当前选定周期内没有待结算的流水", true);
        return;
      }

      if (!confirm(`确认将当前所选时间段内的 ${unsettledIds.length} 笔计件记录一键结算锁定吗？锁定后流水将受到保护，不可随意修改。`)) {
        return;
      }

      const count = await invokeBackend('settle_records', { ids: unsettledIds, targetStatus: 1 });
      showToast(`已成功结算并锁定 ${count} 笔流水`);
      await this.queryPayroll();
    } catch (err) {
      showToast(`结算锁定失败: ${err.message || err}`, true);
    }
  },

  exportPayrollCsv() {
    if (!state.payroll || state.payroll.length === 0) {
      showToast("当前无薪酬数据可供导出", true);
      return;
    }

    let csv = "\uFEFF员工工号,员工姓名,所属班组,常驻工位,记工笔数,合格总件数,废品数,应发计件工资,已结算笔数,待核算笔数\n";
    state.payroll.forEach(p => {
      csv += `"${p.emp_code}","${p.emp_name}","${p.department}","${p.primary_station_name || '未指派'}","${p.total_records}","${p.total_pieces}","${p.total_scrap}","${p.total_amount}","${p.settled_records}","${p.unsettled_records}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `员工计件薪酬账单_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("薪酬账单 CSV 导出成功");
  },

  exportStationCsv() {
    if (!state.stationSummaries || state.stationSummaries.length === 0) {
      showToast("当前无工位产量数据可供导出", true);
      return;
    }

    let csv = "\uFEFF工位代码,工位名称,所属工段,责任班长,合格总产出,废品件数,工位工费总支出,流水笔数\n";
    state.stationSummaries.forEach(s => {
      csv += `"${s.station_code}","${s.station_name}","${s.workshop_name}","${s.supervisor || '-'}","${s.total_pieces}","${s.total_scrap}","${s.total_amount}","${s.record_count}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `车间工位产量与成本汇总_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("工位成本表 CSV 导出成功");
  },

  printPayroll() {
    if (!state.payroll || state.payroll.length === 0) {
      showToast("当前暂无核算数据可供打印，请先点击【计算核算汇总】", true);
      return;
    }
    printEngine.openPrintModal('PAYROLL_DEPT');
  }
};
