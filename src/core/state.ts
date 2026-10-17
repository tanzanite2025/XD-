/**
 * ERP UDS 1.0 - 强类型全局状态中心 (State Management)
 */

import {
  Department,
  Workshop,
  Station,
  Team,
  Employee,
  ProductModel,
  ProcessItem,
  WorkRecord,
  PayrollSummary,
  StationSummary,
  SystemStats,
} from '../types/models';
import { invokeBackend } from './ipc';
import { showToast } from './toast';

export interface AppState {
  departments: Department[];
  teams: Team[];
  workshops: Workshop[];
  stations: Station[];
  employees: Employee[];
  productModels: ProductModel[];
  processes: ProcessItem[];
  records: WorkRecord[];
  payroll: PayrollSummary[];
  stationSummaries: StationSummary[];
  systemStats: SystemStats | null;
  activeTab: string;
  stationFilterType: string;
}

export const state: AppState = {
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

type StateListener = (currentState: AppState, changedKey?: string) => void;
const listeners = new Set<StateListener>();

export function subscribeState(listener: StateListener): () => boolean {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyStateChange(changedKey?: string): void {
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
export async function refreshSystemStats(): Promise<void> {
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`统计指标加载失败: ${msg}`, true);
  }
}

/**
 * 全量刷新全厂核心主数据（部门、班组、工位、员工、型号、工艺）
 */
export async function loadMasterData(): Promise<void> {
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`基础数据拉取失败: ${msg}`, true);
    throw err;
  }
}
