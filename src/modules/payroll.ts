/**
 * ERP UDS 1.0 - 计件薪酬核算与对账强类型业务模块
 */

import { invokeBackend } from '../core/ipc';
import { state } from '../core/state';
import { showToast } from '../core/toast';
import printEngine from './print_engine';
import { PayrollSummary, StationSummary, Station } from '../types/models';

export default {
  async init(): Promise<void> {
    this.initDates();
    this.bindEvents();
    await this.queryPayroll();
  },

  async onActivated(): Promise<void> {
    this.renderStationFilter();
    await this.queryPayroll();
  },

  initDates(): void {
    const start = document.getElementById('payroll-start-date') as HTMLInputElement | null;
    const end = document.getElementById('payroll-end-date') as HTMLInputElement | null;
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];

    if (start && !start.value) start.value = firstDay;
    if (end && !end.value) end.value = today;

    this.renderStationFilter();
  },

  renderStationFilter(): void {
    const sel = document.getElementById('payroll-station-filter') as HTMLSelectElement | null;
    if (!sel) return;

    let opts = '<option value="">全厂工位统一汇总</option>';
    (state.stations || []).forEach((s: Station) => {
      opts += `<option value="${s.id}">${s.station_code} - ${s.station_name}</option>`;
    });
    sel.innerHTML = opts;
  },

  bindEvents(): void {
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

  async queryPayroll(): Promise<void> {
    const start = (document.getElementById('payroll-start-date') as HTMLInputElement | null)?.value || null;
    const end = (document.getElementById('payroll-end-date') as HTMLInputElement | null)?.value || null;
    const stationIdVal = (document.getElementById('payroll-station-filter') as HTMLSelectElement | null)?.value;
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`核算失败: ${msg}`, true);
    }
  },

  renderPayrollSummary(): void {
    const tbody = document.getElementById('payroll-table-body');
    if (!tbody) return;

    if (!state.payroll || state.payroll.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--muted-foreground); padding: 36px 0;">所选时间段内暂无计件流水</td></tr>`;
      return;
    }

    tbody.innerHTML = state.payroll.map((p: PayrollSummary) => `
      <tr>
        <td class="uds-mono" style="font-weight: 700; color: var(--primary);">${p.emp_code}</td>
        <td style="font-weight: 800; font-size: 14px; color: var(--foreground);">${p.emp_name}</td>
        <td><span class="uds-badge" style="background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;">${p.department}</span></td>
        <td><span class="uds-badge" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe;">${p.primary_station_name || '未指派'}</span></td>
        <td style="text-align: right;" class="uds-mono">${p.total_records} 笔</td>
        <td style="text-align: right; font-weight: 800; color: var(--emerald-text);">${p.total_pieces}</td>
        <td style="text-align: right; color: ${p.total_scrap > 0 ? 'var(--rose-text)' : 'inherit'}; font-weight: 700;">${p.total_scrap}</td>
        <td style="text-align: right;" class="uds-mono font-black font-lg text-emerald">¥${Number(p.total_amount).toFixed(2)}</td>
        <td style="text-align: center;">
          ${p.unsettled_records > 0 
            ? `<span class="uds-badge uds-badge-alert">${p.unsettled_records} 笔待核算</span>` 
            : `<span class="uds-badge uds-badge-healthy">全部核算锁定</span>`}
        </td>
        <td style="text-align: center;">
          <button class="uds-btn-ghost btn-view-emp-records" data-id="${p.emp_id}" data-name="${p.emp_name}">查看明细</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll<HTMLButtonElement>('.btn-view-emp-records').forEach(btn => {
      btn.onclick = () => {
        const empId = btn.dataset.id ? parseInt(btn.dataset.id, 10) : 0;
        const name = btn.dataset.name || '';
        this.filterRecordsByEmp(empId, name);
      };
    });
  },

  renderStationSummaryTable(): void {
    const tbody = document.getElementById('station-summary-table-body');
    if (!tbody) return;

    if (!state.stationSummaries || state.stationSummaries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--muted-foreground); padding: 24px 0;">所选时间段内暂无工位产出</td></tr>`;
      return;
    }

    tbody.innerHTML = state.stationSummaries.map((s: StationSummary) => `
      <tr>
        <td class="uds-mono" style="font-weight: 700; color: var(--primary);">${s.station_code}</td>
        <td style="font-weight: 800; color: var(--foreground);">${s.station_name}</td>
        <td><span class="uds-badge" style="background: #f8fafc; color: #475569; border: 1px solid #cbd5e1;">${s.workshop_name || '主车间'}</span></td>
        <td style="text-align: right;" class="uds-mono">${s.total_records} 笔</td>
        <td style="text-align: right; font-weight: 800; color: var(--foreground);">${s.total_pieces}</td>
        <td style="text-align: right; color: ${s.total_scrap > 0 ? 'var(--rose-text)' : 'inherit'}; font-weight: 700;">${s.total_scrap}</td>
        <td style="text-align: right;" class="uds-mono font-black font-lg text-emerald">¥${Number(s.total_amount).toFixed(2)}</td>
      </tr>
    `).join('');
  },

  filterRecordsByEmp(empId: number, name: string): void {
    const rapidTabBtn = document.querySelector<HTMLButtonElement>('.uds-nav-tab[data-tab="tab-rapid-entry"]');
    if (rapidTabBtn) {
      rapidTabBtn.click();
      setTimeout(() => {
        const empFilter = document.getElementById('filter-emp') as HTMLSelectElement | null;
        if (empFilter) {
          empFilter.value = String(empId);
          empFilter.dispatchEvent(new Event('change'));
        }
        showToast(`已为您筛选工人 [${name}] 的报工流水`);
      }, 150);
    }
  },

  async batchSettle(): Promise<void> {
    const unsettledRecords = (state.records || []).filter(r => r.settled === 0);
    const ids = unsettledRecords.map(r => r.id).filter((id): id is number => id !== null);

    if (ids.length === 0) {
      showToast("当前流水中未找到任何待结算锁定的记录", true);
      return;
    }

    if (!confirm(`确定要锁定并结算当前已查询到的 ${ids.length} 笔流水吗？\n结算后单价和数据将永久锁定归档，不可修改。`)) {
      return;
    }

    try {
      const settledCount = await invokeBackend('settle_records', {
        ids: ids,
        targetStatus: 1
      });

      showToast(`成功结算并锁定 ${settledCount} 笔流水记录！`);
      await this.queryPayroll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`结算操作失败: ${msg}`, true);
    }
  },

  printPayroll(): void {
    if (!state.payroll || state.payroll.length === 0) {
      showToast("当前暂无薪资核算结果可供打印", true);
      return;
    }
    printEngine.openPrintModal('PAYROLL_DEPT');
  },

  async exportPayrollCsv(): Promise<void> {
    try {
      const csvStr = await invokeBackend('export_csv_payroll');
      const blob = new Blob(["\uFEFF" + csvStr], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `计件薪资汇总表_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("薪资汇总 CSV 导出成功");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`导出失败: ${msg}`, true);
    }
  },

  async exportStationCsv(): Promise<void> {
    try {
      const csvStr = await invokeBackend('export_csv_stations');
      const blob = new Blob(["\uFEFF" + csvStr], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `车间工位产出汇总表_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("工位汇总 CSV 导出成功");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`导出失败: ${msg}`, true);
    }
  }
};
