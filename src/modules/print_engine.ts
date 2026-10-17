/**
 * ERP UDS 1.0 - 专业多部门打印引擎 (Print Engine)
 * 强类型实现：支持多部门独立分页排版 (Page Break)、员工签字确认栏与车间四方签章
 */

import { state } from '../core/state';
import { openModal } from '../core/view_loader';
import { showToast } from '../core/toast';
import { PayrollSummary, WorkRecord, StationSummary } from '../types/models';

/**
 * 财务级数字转中文大写金额工具函数
 */
export function numberToChineseRMB(money: number | string): string {
  const cnNums = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const cnIntRadice = ['', '拾', '佰', '仟'];
  const cnIntUnits = ['', '万', '亿', '兆'];
  const cnDecUnits = ['角', '分'];
  const cnInteger = '整';
  const cnIntLast = '元';

  let num = typeof money === 'number' ? money : parseFloat(money);
  if (isNaN(num)) return '零元整';
  if (num === 0) return '零元整';

  let chineseStr = '';
  if (num < 0) {
    chineseStr = '负';
    num = Math.abs(num);
  }

  const parts = num.toFixed(2).split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  if (parseInt(integerPart, 10) > 0) {
    let zeroCount = 0;
    const IntLen = integerPart.length;
    for (let i = 0; i < IntLen; i++) {
      const n = integerPart.substr(i, 1);
      const p = IntLen - i - 1;
      const q = p / 4;
      const m = p % 4;
      if (n === '0') {
        zeroCount++;
      } else {
        if (zeroCount > 0) {
          chineseStr += cnNums[0];
        }
        zeroCount = 0;
        chineseStr += cnNums[parseInt(n, 10)] + cnIntRadice[m];
      }
      if (m === 0 && zeroCount < 4) {
        chineseStr += cnIntUnits[Math.floor(q)];
      }
    }
    chineseStr += cnIntLast;
  }

  if (decimalPart) {
    for (let i = 0; i < decimalPart.length; i++) {
      const n = decimalPart.substr(i, 1);
      if (n !== '0') {
        chineseStr += cnNums[Number(n)] + cnDecUnits[i];
      }
    }
  }

  if (chineseStr === '' || chineseStr === '负') {
    chineseStr = '零元' + cnInteger;
  } else if (!decimalPart || decimalPart === '00' || decimalPart.endsWith('0')) {
    chineseStr += cnInteger;
  }

  return '人民币 ' + chineseStr;
}

export default {
  init(): void {
    this.bindEvents();
  },

  bindEvents(): void {
    const templateSelect = document.getElementById('print-template-type') as HTMLSelectElement | null;
    const deptSelect = document.getElementById('print-department-select') as HTMLSelectElement | null;
    const factoryNameInput = document.getElementById('print-factory-name') as HTMLInputElement | null;
    const periodInput = document.getElementById('print-period-text') as HTMLInputElement | null;
    const btnPrint = document.getElementById('btn-execute-print');

    if (templateSelect) templateSelect.onchange = () => this.refreshPreview();
    if (deptSelect) deptSelect.onchange = () => this.refreshPreview();
    if (factoryNameInput) factoryNameInput.oninput = () => this.refreshPreview();
    if (periodInput) periodInput.oninput = () => this.refreshPreview();

    if (btnPrint) {
      btnPrint.onclick = () => this.executePrint();
    }
  },

  openPrintModal(initialTemplate: 'PAYROLL_DEPT' | 'RECORDS_DEPT' | 'STATIONS_SUMMARY' = 'PAYROLL_DEPT'): void {
    const templateSelect = document.getElementById('print-template-type') as HTMLSelectElement | null;
    if (templateSelect) {
      templateSelect.value = initialTemplate;
    }

    const periodInput = document.getElementById('print-period-text') as HTMLInputElement | null;
    if (periodInput) {
      const start = (document.getElementById('payroll-start-date') as HTMLInputElement | null)?.value || '';
      const end = (document.getElementById('payroll-end-date') as HTMLInputElement | null)?.value || '';
      if (start && end) {
        periodInput.value = `${start} 至 ${end}`;
      } else {
        const now = new Date();
        periodInput.value = `${now.getFullYear()}年${now.getMonth() + 1}月份`;
      }
    }

    this.populateDepartmentSelect();
    this.refreshPreview();
    openModal('modal-print-preview');
  },

  populateDepartmentSelect(): void {
    const deptSelect = document.getElementById('print-department-select') as HTMLSelectElement | null;
    if (!deptSelect) return;

    const deptSet = new Set<string>();

    if (state.payroll && state.payroll.length > 0) {
      state.payroll.forEach((p: PayrollSummary) => {
        if (p.department && p.department.trim()) deptSet.add(p.department.trim());
      });
    }

    if (state.employees && state.employees.length > 0) {
      state.employees.forEach(e => {
        if (e.department && e.department.trim()) deptSet.add(e.department.trim());
      });
    }

    let opts = '<option value="ALL">全部部门 (按部门独立自动分页 A4)</option>';
    Array.from(deptSet).sort().forEach(dept => {
      opts += `<option value="${dept}">仅打印: ${dept}</option>`;
    });

    deptSelect.innerHTML = opts;
  },

  refreshPreview(): void {
    const templateType = (document.getElementById('print-template-type') as HTMLSelectElement | null)?.value || 'PAYROLL_DEPT';
    const selectedDept = (document.getElementById('print-department-select') as HTMLSelectElement | null)?.value || 'ALL';
    const factoryName = (document.getElementById('print-factory-name') as HTMLInputElement | null)?.value.trim() || '碳纤维制造工厂';
    const periodText = (document.getElementById('print-period-text') as HTMLInputElement | null)?.value.trim() || '当前核算期';
    const todayStr = new Date().toISOString().split('T')[0];

    const previewContainer = document.getElementById('print-preview-content');
    const badge = document.getElementById('print-page-count-badge');
    if (!previewContainer) return;

    let html = '';
    let sheetCount = 0;

    if (templateType === 'PAYROLL_DEPT') {
      const groups = this.groupPayrollByDepartment();
      const deptsToPrint = selectedDept === 'ALL' ? Object.keys(groups) : [selectedDept];

      deptsToPrint.forEach(deptName => {
        const items = groups[deptName] || [];
        if (items.length === 0) return;
        sheetCount++;

        let totalPieces = 0;
        let totalScrap = 0;
        let totalAmount = 0;

        const rowsHtml = items.map((p, idx) => {
          totalPieces += p.total_pieces;
          totalScrap += p.total_scrap;
          totalAmount += p.total_amount;

          return `
            <tr>
              <td class="align-center">${idx + 1}</td>
              <td class="align-center uds-mono">${p.emp_code}</td>
              <td style="font-weight: 700;">${p.emp_name}</td>
              <td>${p.primary_station_name || '全厂通调'}</td>
              <td class="align-right uds-mono">${p.total_records}</td>
              <td class="align-right uds-mono" style="font-weight: 700;">${p.total_pieces}</td>
              <td class="align-right uds-mono" style="color: ${p.total_scrap > 0 ? '#b91c1c' : '#000'};">${p.total_scrap}</td>
              <td class="align-right uds-mono" style="font-weight: 800; font-size: 13px;">¥${Number(p.total_amount).toFixed(2)}</td>
              <td class="align-center" style="font-size: 10px;">${p.unsettled_records > 0 ? '待核' : '已锁'}</td>
              <td style="min-width: 90px; height: 32px; background: #fafafa;"></td>
            </tr>
          `;
        }).join('');

        const rmbUpper = numberToChineseRMB(totalAmount);

        html += `
          <div class="print-sheet-paper">
            <div class="print-doc-header">
              <div style="font-size: 12px; color: #475569; letter-spacing: 0.1em; font-weight: 700;">${factoryName}</div>
              <h1 class="print-doc-title">部门计件薪资结算确认单</h1>
              <div class="print-doc-meta">
                <div><strong>所属部门/班组：</strong><span style="font-size: 13px; font-weight: 800; text-decoration: underline;">${deptName}</span></div>
                <div><strong>核算周期：</strong>${periodText}</div>
                <div><strong>打印日期：</strong>${todayStr}</div>
                <div><strong>币种：</strong>人民币 (元)</div>
              </div>
            </div>

            <table class="print-doc-table">
              <thead>
                <tr>
                  <th style="width: 36px;">序号</th>
                  <th style="width: 75px;">员工工号</th>
                  <th style="width: 75px;">真实姓名</th>
                  <th>常驻作业工位</th>
                  <th style="width: 55px;">计件笔数</th>
                  <th style="width: 60px;">合格件数</th>
                  <th style="width: 55px;">废品件数</th>
                  <th style="width: 90px;">计件应发工资</th>
                  <th style="width: 45px;">状态</th>
                  <th style="width: 100px;">员工签名确认</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
                <tr class="total-row">
                  <td colspan="4" style="text-align: center;"><strong>部门合计小计 (${items.length} 人)</strong></td>
                  <td class="align-right uds-mono">-</td>
                  <td class="align-right uds-mono">${totalPieces}</td>
                  <td class="align-right uds-mono">${totalScrap}</td>
                  <td class="align-right uds-mono" style="font-size: 14px;">¥${totalAmount.toFixed(2)}</td>
                  <td colspan="2"></td>
                </tr>
              </tbody>
            </table>

            <div class="print-doc-total-box">
              <span><strong>大写金额合计：</strong>${rmbUpper}</span>
              <span class="uds-mono" style="font-size: 15px; font-weight: 900;">小写：¥${totalAmount.toFixed(2)}</span>
            </div>

            <div class="print-doc-signatures">
              <div>车间主任/主管签字：_______________</div>
              <div>复核质检确认：_______________</div>
              <div>厂部财务审核：_______________</div>
              <div>部门负责人签章：_______________</div>
            </div>

            <div class="print-footer-info">
              <span>防伪工业打印标识码: UDS-PAY-${Date.now().toString(36).toUpperCase()}</span>
              <span>第 ${sheetCount} 页 (独立单据) · 计件薪酬凭证</span>
            </div>
          </div>
        `;
      });
    } else if (templateType === 'RECORDS_DEPT') {
      const groups = this.groupRecordsByDepartment();
      const deptsToPrint = selectedDept === 'ALL' ? Object.keys(groups) : [selectedDept];

      deptsToPrint.forEach(deptName => {
        const items = groups[deptName] || [];
        if (items.length === 0) return;
        sheetCount++;

        let totalQty = 0;
        let totalScrap = 0;
        let totalAmount = 0;

        const rowsHtml = items.map((r, idx) => {
          totalQty += r.quantity;
          totalScrap += r.scrap_quantity;
          totalAmount += r.total_amount;

          return `
            <tr>
              <td class="align-center">${idx + 1}</td>
              <td class="align-center uds-mono">${r.record_date}</td>
              <td class="align-center uds-mono" style="font-weight: 700;">${r.batch_no}</td>
              <td>${r.station_name || '工位'}</td>
              <td style="font-weight: 700;">${r.emp_name}</td>
              <td>${r.process_name || '-'}</td>
              <td class="align-right uds-mono">${r.quantity}</td>
              <td class="align-right uds-mono" style="color: ${r.scrap_quantity > 0 ? '#b91c1c' : '#000'};">${r.scrap_quantity}</td>
              <td class="align-right uds-mono">¥${Number(r.unit_price).toFixed(2)}</td>
              <td class="align-right uds-mono" style="font-weight: 800;">¥${Number(r.total_amount).toFixed(2)}</td>
              <td class="align-center">${r.settled === 1 ? '已核' : '待核'}</td>
            </tr>
          `;
        }).join('');

        const rmbUpper = numberToChineseRMB(totalAmount);

        html += `
          <div class="print-sheet-paper">
            <div class="print-doc-header">
              <div style="font-size: 12px; color: #475569; letter-spacing: 0.1em; font-weight: 700;">${factoryName}</div>
              <h1 class="print-doc-title">车间生产计件流水明细单</h1>
              <div class="print-doc-meta">
                <div><strong>所属部门/班组：</strong><span style="font-size: 13px; font-weight: 800; text-decoration: underline;">${deptName}</span></div>
                <div><strong>统计周期：</strong>${periodText}</div>
                <div><strong>打印日期：</strong>${todayStr}</div>
                <div><strong>流水笔数：</strong>${items.length} 笔</div>
              </div>
            </div>

            <table class="print-doc-table">
              <thead>
                <tr>
                  <th style="width: 36px;">序号</th>
                  <th style="width: 80px;">报工日期</th>
                  <th style="width: 95px;">工单批次</th>
                  <th>作业工位</th>
                  <th style="width: 75px;">工人姓名</th>
                  <th>工艺与规格</th>
                  <th style="width: 55px;">合格数</th>
                  <th style="width: 50px;">废品数</th>
                  <th style="width: 65px;">计件单价</th>
                  <th style="width: 85px;">计件总额</th>
                  <th style="width: 45px;">状态</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
                <tr class="total-row">
                  <td colspan="6" style="text-align: center;"><strong>部门流水合计 (${items.length} 笔记录)</strong></td>
                  <td class="align-right uds-mono">${totalQty}</td>
                  <td class="align-right uds-mono">${totalScrap}</td>
                  <td class="align-right uds-mono">-</td>
                  <td class="align-right uds-mono" style="font-size: 14px;">¥${totalAmount.toFixed(2)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>

            <div class="print-doc-total-box">
              <span><strong>合计金额大写：</strong>${rmbUpper}</span>
              <span class="uds-mono" style="font-size: 15px; font-weight: 900;">小写合计：¥${totalAmount.toFixed(2)}</span>
            </div>

            <div class="print-doc-signatures">
              <div>制单人：_______________</div>
              <div>车间统计员签字：_______________</div>
              <div>车间主任核准：_______________</div>
              <div>部门盖章：_______________</div>
            </div>

            <div class="print-footer-info">
              <span>防伪流水代码: UDS-REC-${Date.now().toString(36).toUpperCase()}</span>
              <span>第 ${sheetCount} 页 · 车间生产原始凭据</span>
            </div>
          </div>
        `;
      });
    } else {
      const items = state.stationSummaries || [];
      sheetCount = 1;
      let totalPieces = 0;
      let totalScrap = 0;
      let totalAmount = 0;

      const rowsHtml = items.map((s: StationSummary, idx: number) => {
        totalPieces += s.total_pieces;
        totalScrap += s.total_scrap;
        totalAmount += s.total_amount;

        return `
          <tr>
            <td class="align-center">${idx + 1}</td>
            <td class="align-center uds-mono" style="font-weight: 700;">${s.station_code}</td>
            <td style="font-weight: 700;">${s.station_name}</td>
            <td>${s.workshop_name || '主车间'}</td>
            <td class="align-right uds-mono">${s.total_records}</td>
            <td class="align-right uds-mono" style="font-weight: 700;">${s.total_pieces}</td>
            <td class="align-right uds-mono" style="color: ${s.total_scrap > 0 ? '#b91c1c' : '#000'};">${s.total_scrap}</td>
            <td class="align-right uds-mono" style="font-weight: 800; font-size: 13px;">¥${Number(s.total_amount).toFixed(2)}</td>
            <td style="min-width: 90px; height: 32px; background: #fafafa;"></td>
          </tr>
        `;
      }).join('');

      const rmbUpper = numberToChineseRMB(totalAmount);

      html = `
        <div class="print-sheet-paper">
          <div class="print-doc-header">
            <div style="font-size: 12px; color: #475569; letter-spacing: 0.1em; font-weight: 700;">${factoryName}</div>
            <h1 class="print-doc-title">生产工位产出与工费汇总单</h1>
            <div class="print-doc-meta">
              <div><strong>核算范围：</strong>全厂生产工位</div>
              <div><strong>核算周期：</strong>${periodText}</div>
              <div><strong>打印日期：</strong>${todayStr}</div>
              <div><strong>工位总数：</strong>${items.length} 站</div>
            </div>
          </div>

          <table class="print-doc-table">
            <thead>
              <tr>
                <th style="width: 36px;">序号</th>
                <th style="width: 80px;">工位编号</th>
                <th>工位名称</th>
                <th style="width: 110px;">所属车间</th>
                <th style="width: 65px;">报工笔数</th>
                <th style="width: 75px;">产出件数</th>
                <th style="width: 65px;">报废件数</th>
                <th style="width: 100px;">工费发生额</th>
                <th style="width: 110px;">工段长签字</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr class="total-row">
                <td colspan="4" style="text-align: center;"><strong>全厂生产工位合计小计 (${items.length} 站)</strong></td>
                <td class="align-right uds-mono">-</td>
                <td class="align-right uds-mono">${totalPieces}</td>
                <td class="align-right uds-mono">${totalScrap}</td>
                <td class="align-right uds-mono" style="font-size: 14px;">¥${totalAmount.toFixed(2)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>

          <div class="print-doc-total-box">
            <span><strong>大写金额合计：</strong>${rmbUpper}</span>
            <span class="uds-mono" style="font-size: 15px; font-weight: 900;">小写合计：¥${totalAmount.toFixed(2)}</span>
          </div>

          <div class="print-doc-signatures">
            <div>生产调度总监：_______________</div>
            <div>财务总监复核：_______________</div>
            <div>工厂厂长批准：_______________</div>
            <div>企业法人签章：_______________</div>
          </div>

          <div class="print-footer-info">
            <span>防伪工位报表代码: UDS-STN-${Date.now().toString(36).toUpperCase()}</span>
            <span>第 1 页 · 全厂工位报表</span>
          </div>
        </div>
      `;
    }

    if (sheetCount === 0) {
      previewContainer.innerHTML = `
        <div style="text-align: center; color: var(--muted-foreground); padding: 60px 0;">
          所选筛选范围内未查询到任何可打印数据记录，请先在列表中进行查询或重置部门筛选
        </div>
      `;
      if (badge) badge.innerText = "0 页";
      return;
    }

    previewContainer.innerHTML = html;
    if (badge) badge.innerText = `共 ${sheetCount} 页独立单据 (自动分页 A4)`;
  },

  groupPayrollByDepartment(): Record<string, PayrollSummary[]> {
    const map: Record<string, PayrollSummary[]> = {};
    (state.payroll || []).forEach((p: PayrollSummary) => {
      const dept = p.department?.trim() || '未分派部门';
      if (!map[dept]) map[dept] = [];
      map[dept].push(p);
    });
    return map;
  },

  groupRecordsByDepartment(): Record<string, WorkRecord[]> {
    const map: Record<string, WorkRecord[]> = {};
    (state.records || []).forEach((r: WorkRecord) => {
      const dept = r.team_name?.trim() || r.department?.trim() || '通用制造车间';
      if (!map[dept]) map[dept] = [];
      map[dept].push(r);
    });
    return map;
  },

  executePrint(): void {
    const previewContainer = document.getElementById('print-preview-content');
    if (!previewContainer || !previewContainer.innerHTML.trim()) {
      showToast("无可打印单据内容", true);
      return;
    }
    window.print();
  }
};
