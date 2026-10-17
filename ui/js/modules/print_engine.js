/**
 * ERP UDS 1.0 - 专业多部门打印引擎 (Print Engine)
 * 支持多部门独立分页排版 (Page Break)、员工签字确认栏与车间四方签章
 */

import { state } from '../core/state.js';
import { openModal, closeModal } from '../core/view_loader.js';
import { showToast } from '../core/toast.js';

/**
 * 财务级数字转中文大写金额工具函数
 */
export function numberToChineseRMB(money) {
  const cnNums = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const cnIntRadice = ['', '拾', '佰', '仟'];
  const cnIntUnits = ['', '万', '亿', '兆'];
  const cnDecUnits = ['角', '分'];
  const cnInteger = '整';
  const cnIntLast = '元';

  let num = parseFloat(money);
  if (isNaN(num)) return '零元整';
  if (num === 0) return '零元整';

  let chineseStr = '';
  if (num < 0) {
    chineseStr = '负';
    num = Math.abs(num);
  }

  let parts = num.toFixed(2).split('.');
  let integerPart = parts[0];
  let decimalPart = parts[1];

  if (parseInt(integerPart, 10) > 0) {
    let zeroCount = 0;
    let IntLen = integerPart.length;
    for (let i = 0; i < IntLen; i++) {
      let n = integerPart.substr(i, 1);
      let p = IntLen - i - 1;
      let q = p / 4;
      let m = p % 4;
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
      let n = decimalPart.substr(i, 1);
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
  init() {
    this.bindEvents();
  },

  bindEvents() {
    const templateSelect = document.getElementById('print-template-type');
    const deptSelect = document.getElementById('print-department-select');
    const factoryNameInput = document.getElementById('print-factory-name');
    const periodInput = document.getElementById('print-period-text');
    const btnPrint = document.getElementById('btn-execute-print');

    if (templateSelect) templateSelect.onchange = () => this.refreshPreview();
    if (deptSelect) deptSelect.onchange = () => this.refreshPreview();
    if (factoryNameInput) factoryNameInput.oninput = () => this.refreshPreview();
    if (periodInput) periodInput.oninput = () => this.refreshPreview();

    if (btnPrint) {
      btnPrint.onclick = () => this.executePrint();
    }
  },

  /**
   * 打开多部门打印预览弹窗
   * @param {'PAYROLL_DEPT' | 'RECORDS_DEPT' | 'STATIONS_SUMMARY'} initialTemplate 
   */
  openPrintModal(initialTemplate = 'PAYROLL_DEPT') {
    const templateSelect = document.getElementById('print-template-type');
    if (templateSelect) {
      templateSelect.value = initialTemplate;
    }

    // 设置默认周期
    const periodInput = document.getElementById('print-period-text');
    if (periodInput) {
      const start = document.getElementById('payroll-start-date')?.value || '';
      const end = document.getElementById('payroll-end-date')?.value || '';
      if (start && end) {
        periodInput.value = `${start} 至 ${end}`;
      } else {
        const now = new Date();
        periodInput.value = `${now.getFullYear()}年${now.getMonth() + 1}月份`;
      }
    }

    // 填充部门选项
    this.populateDepartmentSelect();

    // 渲染预览
    this.refreshPreview();

    openModal('modal-print-preview');
  },

  /**
   * 提取所有部门/班组列表填充下拉框
   */
  populateDepartmentSelect() {
    const deptSelect = document.getElementById('print-department-select');
    if (!deptSelect) return;

    const deptSet = new Set();

    // 优先从薪资核算结果中提
    if (state.payroll && state.payroll.length > 0) {
      state.payroll.forEach(p => {
        if (p.department && p.department.trim()) deptSet.add(p.department.trim());
      });
    }

    // 补充从员工档案中提
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

  /**
   * 刷新单据预览内容
   */
  refreshPreview() {
    const templateType = document.getElementById('print-template-type')?.value || 'PAYROLL_DEPT';
    const selectedDept = document.getElementById('print-department-select')?.value || 'ALL';
    const factoryName = document.getElementById('print-factory-name')?.value.trim() || '碳纤维制造工厂';
    const periodText = document.getElementById('print-period-text')?.value.trim() || '当前核算期';
    const todayStr = new Date().toISOString().split('T')[0];

    const previewContainer = document.getElementById('print-preview-content');
    const badge = document.getElementById('print-page-count-badge');
    if (!previewContainer) return;

    let html = '';
    let sheetCount = 0;

    if (templateType === 'PAYROLL_DEPT') {
      // 1. 部门员工计件薪资签认单
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
                  <td class="align-right uds-mono" style="color: #000; font-size: 13px;">¥${totalAmount.toFixed(2)}</td>
                  <td colspan="2" style="font-size: 10px; color: #334155;">签字确认无误后归档</td>
                </tr>
              </tbody>
            </table>

            <div style="font-size: 11px; margin-top: 4px; padding: 6px 8px; background: #f8fafc; border: 1px dashed #cbd5e1; font-weight: 700;">
              【大写金额合计】：<span style="color: #0f172a;">${rmbUpper}</span> (¥${totalAmount.toFixed(2)})
            </div>

            <div class="print-doc-signatures">
              <div class="print-signature-box">
                <span>制表填单人：____________</span>
                <span style="font-size: 9px; color: #64748b;">(核对明细无误)</span>
              </div>
              <div class="print-signature-box">
                <span>车间班长核对：____________</span>
                <span style="font-size: 9px; color: #64748b;">(实物产量核签)</span>
              </div>
              <div class="print-signature-box">
                <span>部门主管审核：____________</span>
                <span style="font-size: 9px; color: #64748b;">(车间主任批准)</span>
              </div>
              <div class="print-signature-box">
                <span>财务复核归档：____________</span>
                <span style="font-size: 9px; color: #64748b;">(薪资账目核发)</span>
              </div>
            </div>
          </div>
        `;
      });

    } else if (templateType === 'RECORDS_DEPT') {
      // 2. 部门记工生产流水明细单
      const groups = this.groupRecordsByDepartment();
      const deptsToPrint = selectedDept === 'ALL' ? Object.keys(groups) : [selectedDept];

      deptsToPrint.forEach(deptName => {
        const items = groups[deptName] || [];
        if (items.length === 0) return;
        sheetCount++;

        let totalQty = 0;
        let totalScrap = 0;
        let totalAmt = 0;

        const rowsHtml = items.map((r, idx) => {
          totalQty += r.quantity;
          totalScrap += r.scrap_quantity;
          totalAmt += r.total_amount;

          return `
            <tr>
              <td class="align-center">${idx + 1}</td>
              <td class="align-center uds-mono" style="font-size: 11px;">${r.record_date}</td>
              <td class="align-center uds-mono" style="font-weight: 700;">${r.batch_no}</td>
              <td>${r.station_name}</td>
              <td style="font-weight: 700;">${r.emp_name}</td>
              <td style="font-size: 11px;">[${r.product_spec || '通用'}] ${r.process_name}</td>
              <td class="align-right uds-mono" style="font-weight: 700;">${r.quantity}</td>
              <td class="align-right uds-mono">${r.scrap_quantity}</td>
              <td class="align-right uds-mono">¥${Number(r.unit_price).toFixed(2)}</td>
              <td class="align-right uds-mono" style="font-weight: 700;">¥${Number(r.total_amount).toFixed(2)}</td>
            </tr>
          `;
        }).join('');

        html += `
          <div class="print-sheet-paper">
            <div class="print-doc-header">
              <div style="font-size: 12px; color: #475569; letter-spacing: 0.1em; font-weight: 700;">${factoryName}</div>
              <h1 class="print-doc-title">部门车间记工流水明细单</h1>
              <div class="print-doc-meta">
                <div><strong>所属部门/班组：</strong><span style="font-size: 13px; font-weight: 800; text-decoration: underline;">${deptName}</span></div>
                <div><strong>核算周期：</strong>${periodText}</div>
                <div><strong>流水笔数：</strong>${items.length} 笔</div>
                <div><strong>打印日期：</strong>${todayStr}</div>
              </div>
            </div>

            <table class="print-doc-table">
              <thead>
                <tr>
                  <th style="width: 36px;">序号</th>
                  <th style="width: 80px;">报工日期</th>
                  <th style="width: 110px;">生产批次号</th>
                  <th style="width: 120px;">作业工位</th>
                  <th style="width: 75px;">作业员工</th>
                  <th>加工工艺 / 规格型号</th>
                  <th style="width: 55px;">合格数</th>
                  <th style="width: 50px;">废品数</th>
                  <th style="width: 70px;">单价快照</th>
                  <th style="width: 85px;">计件总额</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
                <tr class="total-row">
                  <td colspan="6" style="text-align: center;"><strong>流水合计 (${items.length} 笔)</strong></td>
                  <td class="align-right uds-mono">${totalQty}</td>
                  <td class="align-right uds-mono">${totalScrap}</td>
                  <td class="align-right uds-mono">-</td>
                  <td class="align-right uds-mono">¥${totalAmt.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            <div class="print-doc-signatures">
              <div class="print-signature-box">
                <span>班组统计员：____________</span>
              </div>
              <div class="print-signature-box">
                <span>车间班长核对：____________</span>
              </div>
              <div class="print-signature-box">
                <span>质量检验核签：____________</span>
              </div>
              <div class="print-signature-box">
                <span>生产主管审定：____________</span>
              </div>
            </div>
          </div>
        `;
      });

    } else if (templateType === 'STATIONS_SUMMARY') {
      // 3. 车间工位产量与工费汇总单
      const summaries = state.stationSummaries || [];
      sheetCount = 1;

      let totalPieces = 0;
      let totalScrap = 0;
      let totalAmount = 0;
      let totalRecords = 0;

      const rowsHtml = summaries.map((s, idx) => {
        totalPieces += s.total_pieces;
        totalScrap += s.total_scrap;
        totalAmount += s.total_amount;
        totalRecords += s.record_count;

        return `
          <tr>
            <td class="align-center">${idx + 1}</td>
            <td class="align-center uds-mono" style="font-weight: 700;">${s.station_code}</td>
            <td style="font-weight: 700;">${s.station_name}</td>
            <td>${s.workshop_name}</td>
            <td>${s.supervisor || '-'}</td>
            <td class="align-right uds-mono" style="font-weight: 700;">${s.total_pieces}</td>
            <td class="align-right uds-mono">${s.total_scrap}</td>
            <td class="align-right uds-mono" style="font-weight: 800;">¥${Number(s.total_amount).toFixed(2)}</td>
            <td class="align-right uds-mono">${s.record_count}</td>
          </tr>
        `;
      }).join('');

      html = `
        <div class="print-sheet-paper">
          <div class="print-doc-header">
            <div style="font-size: 12px; color: #475569; letter-spacing: 0.1em; font-weight: 700;">${factoryName}</div>
            <h1 class="print-doc-title">车间工位产量与工费支出成本汇总表</h1>
            <div class="print-doc-meta">
              <div><strong>核算汇总周期：</strong>${periodText}</div>
              <div><strong>统计范围：</strong>全厂车间制造工位</div>
              <div><strong>打印日期：</strong>${todayStr}</div>
            </div>
          </div>

          <table class="print-doc-table">
            <thead>
              <tr>
                <th style="width: 36px;">序号</th>
                <th style="width: 90px;">工位代码</th>
                <th style="width: 150px;">工位名称</th>
                <th>所属工段</th>
                <th style="width: 80px;">责任班长</th>
                <th style="width: 75px;">合格总产出</th>
                <th style="width: 65px;">废品件数</th>
                <th style="width: 105px;">工费总支出</th>
                <th style="width: 65px;">流水笔数</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr class="total-row">
                <td colspan="5" style="text-align: center;"><strong>全厂工位总合计 (${summaries.length} 个工位)</strong></td>
                <td class="align-right uds-mono">${totalPieces}</td>
                <td class="align-right uds-mono">${totalScrap}</td>
                <td class="align-right uds-mono">¥${totalAmount.toFixed(2)}</td>
                <td class="align-right uds-mono">${totalRecords}</td>
              </tr>
            </tbody>
          </table>

          <div style="font-size: 11px; margin-top: 4px; padding: 6px 8px; background: #f8fafc; border: 1px dashed #cbd5e1; font-weight: 700;">
            【工费总支出大写】：${numberToChineseRMB(totalAmount)} (¥${totalAmount.toFixed(2)})
          </div>

          <div class="print-doc-signatures">
            <div class="print-signature-box">
              <span>财务汇总人：____________</span>
            </div>
            <div class="print-signature-box">
              <span>生产调度主管：____________</span>
            </div>
            <div class="print-signature-box">
              <span>车间总工程师：____________</span>
            </div>
            <div class="print-signature-box">
              <span>生产厂长审批：____________</span>
            </div>
          </div>
        </div>
      `;
    }

    if (sheetCount === 0) {
      previewContainer.innerHTML = `<div style="text-align: center; color: #ffffff; padding: 40px; font-weight: 700;">所选部门或条件下暂无数据可供生成单据</div>`;
      if (badge) badge.innerText = `暂无单据`;
      return;
    }

    previewContainer.innerHTML = html;
    if (badge) badge.innerText = `已生成 ${sheetCount} 个独立部门打印单据 (A4 分页)`;
  },

  /**
   * 按部门将 PayrollSummary 分组
   */
  groupPayrollByDepartment() {
    const list = state.payroll || [];
    const groups = {};

    list.forEach(item => {
      const dept = (item.department && item.department.trim()) ? item.department.trim() : '全厂机动 / 待定班组';
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(item);
    });

    return groups;
  },

  /**
   * 按部门将 WorkRecord 分组
   */
  groupRecordsByDepartment() {
    const list = state.records || [];
    const groups = {};

    list.forEach(item => {
      const dept = (item.department && item.department.trim()) ? item.department.trim() : '车间机动流水';
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(item);
    });

    return groups;
  },

  /**
   * 执行物理打印
   */
  executePrint() {
    const previewContent = document.getElementById('print-preview-content');
    const renderContainer = document.getElementById('print-render-container');

    if (!previewContent || !renderContainer) {
      showToast("打印渲染容器丢失，无法执行打印", true);
      return;
    }

    if (!previewContent.innerHTML.trim() || previewContent.innerText.includes('暂无数据')) {
      showToast("当前无有效单据内容可供打印", true);
      return;
    }

    // 将预览生成的纸张内容直接同步至打印专用容器
    renderContainer.innerHTML = previewContent.innerHTML;

    // 调起系统打印机
    window.print();
  }
};
