/**
 * ERP UDS 1.0 - Tauri IPC 强类型命令契约定义
 * 将后端 commands.rs 中的所有 IPC 接口映射为类型安全的参数与返回值
 */

import {
  Department,
  Workshop,
  Station,
  Team,
  Employee,
  EmployeeStationAssignment,
  ProcessItem,
  ProcessPriceVersion,
  WorkRecord,
  NewRecordInput,
  TeamBatchRecordInput,
  PayrollSummary,
  StationSummary,
  ProcessStats,
  SystemStats,
  BackupInfo,
  ProductModel,
} from './models';

export interface IpcCommandMap {
  // 部门架构管理
  get_departments: {
    args?: Record<string, never>;
    return: Department[];
  };
  save_department: {
    args: { dept: Department };
    return: Department;
  };
  delete_department: {
    args: { id: number };
    return: void;
  };

  // 独立班组管理
  get_teams: {
    args?: Record<string, never>;
    return: Team[];
  };
  save_team: {
    args: { team: Team };
    return: Team;
  };
  delete_team: {
    args: { id: number };
    return: void;
  };

  // 车间工段与工位
  get_workshops: {
    args?: Record<string, never>;
    return: Workshop[];
  };
  get_stations: {
    args?: { workshopIdFilter?: number | null };
    return: Station[];
  };
  save_station: {
    args: { station: Station };
    return: Station;
  };

  // 员工档案与站点调度
  get_employees: {
    args?: { statusFilter?: string | null };
    return: Employee[];
  };
  add_employee: {
    args: { emp: Employee };
    return: Employee;
  };
  update_employee: {
    args: { emp: Employee };
    return: void;
  };
  delete_employee: {
    args: { id: number };
    return: void;
  };
  assign_employee_station: {
    args: {
      empId: number;
      stationId: number;
      assignmentType: 'PRIMARY' | 'LOAN';
      effectiveFrom: string;
      effectiveTo?: string | null;
    };
    return: void;
  };
  get_station_employees: {
    args: { stationId: number };
    return: EmployeeStationAssignment[];
  };

  // 工艺工序与工价版本
  get_processes: {
    args?: { workshopId?: number | null };
    return: ProcessItem[];
  };
  save_process_with_pricing: {
    args: {
      process: ProcessItem;
      priceVersionTag: string;
    };
    return: ProcessItem;
  };
  get_process_price_history: {
    args: { processId: number };
    return: ProcessPriceVersion[];
  };
  delete_process: {
    args: { id: number };
    return: void;
  };

  // 计件流水记录 (个人与班组双核算)
  get_records: {
    args?: {
      startDate?: string | null;
      endDate?: string | null;
      stationId?: number | null;
      empId?: number | null;
      processId?: number | null;
      batchNo?: string | null;
      limit?: number;
    };
    return: WorkRecord[];
  };
  add_record: {
    args: { input: NewRecordInput };
    return: WorkRecord;
  };
  add_team_batch_record: {
    args: { input: TeamBatchRecordInput };
    return: WorkRecord[];
  };
  delete_record: {
    args: { id: number };
    return: void;
  };
  settle_records: {
    args: {
      ids: number[];
      targetStatus: number;
    };
    return: number;
  };

  // 汇总统计与导出
  get_payroll_summary: {
    args?: {
      startDate?: string | null;
      endDate?: string | null;
      stationId?: number | null;
    };
    return: PayrollSummary[];
  };
  get_station_summary: {
    args?: {
      startDate?: string | null;
      endDate?: string | null;
    };
    return: StationSummary[];
  };
  get_process_stats: {
    args?: Record<string, never>;
    return: ProcessStats[];
  };
  get_system_stats: {
    args?: Record<string, never>;
    return: SystemStats;
  };
  export_csv_records: {
    args?: Record<string, never>;
    return: string;
  };
  export_csv_payroll: {
    args?: Record<string, never>;
    return: string;
  };
  export_csv_stations: {
    args?: Record<string, never>;
    return: string;
  };

  // 数据保险箱与备份
  backup_database: {
    args?: Record<string, never>;
    return: string;
  };
  list_backups: {
    args?: Record<string, never>;
    return: BackupInfo[];
  };
  restore_backup: {
    args: { filename: string };
    return: void;
  };
  delete_backup: {
    args: { filename: string };
    return: void;
  };
  open_backup_folder: {
    args?: Record<string, never>;
    return: void;
  };
  clear_all_data: {
    args?: Record<string, never>;
    return: void;
  };

  // 产品型号与孔数规格
  get_product_models: {
    args?: Record<string, never>;
    return: ProductModel[];
  };
  save_product_model: {
    args: { model: ProductModel };
    return: ProductModel;
  };
  delete_product_model: {
    args: { id: number };
    return: void;
  };
  get_next_product_code: {
    args?: Record<string, never>;
    return: string;
  };
  get_hole_specs: {
    args?: Record<string, never>;
    return: number[];
  };
  add_hole_spec: {
    args: { holeCount: number };
    return: void;
  };
  delete_hole_spec: {
    args: { holeCount: number };
    return: void;
  };
}
