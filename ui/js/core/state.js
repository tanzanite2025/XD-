/**
 * ERP UDS 1.0 - 全局状态中心 (State Management)
 */

import { invokeBackend } from './ipc.js';
import { showToast } from './toast.js';

export const state = {
  departments: [],
  teams: [],
  workshops: [],
  stations: [],
  employees: [],
  productModels: [],
  processes: [],
  records: [],
  payroll: [],
  stationSummaries: [],
  systemStats: null,
  activeTab: 'tab-rapid-entry',
  stationFilterType: 'ALL',
};

const listeners = new Set();

export function subscribeState(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyStateChange(changedKey) {
  for (const listener of listeners) {
    try {
      listener(state, changedKey);
    } catch (e) {
      console.error('[CRITICAL] 状态订阅监听器执行异常', e);
    }
  }
}

/**
 * 刷新全厂全局统计指标
 */
export async function refreshSystemStats() {
  try {
    const stats = await invokeBackend('get_system_stats');
    state.systemStats = stats;
    
    const elRecords = document.getElementById('stat-today-records');
    const elWages = document.getElementById('stat-today-wages');
    const elTotalWages = document.getElementById('stat-total-wages');
    const elTotalRecords = document.getElementById('stat-total-records');
    const elStations = document.getElementById('stat-total-stations');
    const elEmployees = document.getElementById('stat-total-employees');
    const elProcesses = document.getElementById('stat-total-processes');

    if (elRecords) elRecords.textContent = `${stats.today_records_count || 0} 笔`;
    if (elWages) elWages.textContent = `¥${Number(stats.today_wages_total || 0).toFixed(2)}`;
    if (elTotalWages) elTotalWages.textContent = `¥${Number(stats.total_wages_all_time || 0).toFixed(2)}`;
    if (elTotalRecords) elTotalRecords.textContent = `${stats.total_records_all_time || 0} 条`;
    if (elStations) elStations.textContent = `${stats.total_stations_count || 0} 站`;
    if (elEmployees) elEmployees.textContent = `${stats.total_employees_count || 0} 人`;
    if (elProcesses) elProcesses.textContent = `${stats.total_processes_count || 0} 道`;

    notifyStateChange('systemStats');
  } catch (err) {
    showToast(`统计指标加载失败: ${err.message || err}`, true);
  }
}

/**
 * 全量刷新全厂核心主数据（工位、工艺、型号、人员）
 */
export async function loadMasterData() {
  try {
    const [departments, teams, stations, employees, models, processes] = await Promise.all([
      invokeBackend('get_departments'),
      invokeBackend('get_teams'),
      invokeBackend('get_stations'),
      invokeBackend('get_employees'),
      invokeBackend('get_product_models'),
      invokeBackend('get_processes'),
    ]);

    state.departments = departments;
    state.teams = teams;
    state.stations = stations;
    state.employees = employees;
    state.productModels = models;
    state.processes = processes;

    notifyStateChange('masterData');
    await refreshSystemStats();
  } catch (err) {
    showToast(`基础数据拉取失败: ${err.message || err}`, true);
    throw err;
  }
}
