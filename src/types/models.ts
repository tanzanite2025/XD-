/**
 * ERP UDS 1.0 - 核心业务数据强类型契约模型 (对齐 Rust models.rs)
 * 严格禁止使用 any，所有字段名与后端 serde 序列化精确对应
 */

/** 部门主数据 (一级树形) */
export interface Department {
  id: number | null;
  dept_code: string;
  dept_name: string;
  sort_order: number;
}

/** 生产车间/工段 (二级树形) */
export interface Workshop {
  id: number | null;
  department_id: number | null;
  department_name: string | null;
  workshop_code: string;
  workshop_name: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE';
}

/** 生产作业工位 (三级树形) */
export interface Station {
  id: number | null;
  workshop_id: number;
  department_id: number | null;
  department_name: string | null;
  workshop_code: string | null;
  workshop_name: string | null;
  station_code: string;
  station_name: string;
  supervisor: string;
  target_output_daily: number;
  sort_order: number;
  status: 'ACTIVE' | 'INACTIVE';
  active_staff_count: number | null;
}

/** 独立生产班组 (独立从属字典，非树形嵌套) */
export interface Team {
  id: number | null;
  team_code: string;
  team_name: string;
  leader_name: string;
  remarks: string;
  sort_order: number;
  member_count: number | null;
}

/** 自行车碳纤维轮圈产品型号 */
export interface ProductModel {
  id: number | null;
  model_code: string;
  model_name: string;
  hole_count: number | null;
  category: string | null;
  status: string | null;
  remarks: string;
  created_at: string | null;
}

/** 员工人事档案 */
export interface Employee {
  id: number | null;
  emp_code: string;
  name: string;
  department: string;
  department_name: string | null;
  team_id: number | null;
  team_name: string | null;
  primary_station_id: number | null;
  primary_station_name: string | null;
  workshop_name: string | null;
  skill_level: string;
  phone: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string | null;
}

/** 员工工位调度分配关系 */
export interface EmployeeStationAssignment {
  id: number | null;
  emp_id: number;
  emp_code: string | null;
  emp_name: string | null;
  station_id: number;
  station_code: string | null;
  station_name: string | null;
  workshop_name: string | null;
  assignment_type: 'PRIMARY' | 'LOAN';
  effective_from: string;
  effective_to: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}

/** 碳纤维加工工艺库 */
export interface ProcessItem {
  id: number | null;
  workshop_id: number;
  workshop_code: string | null;
  workshop_name: string | null;
  recommended_station_id: number | null;
  station_code: string | null;
  station_name: string | null;
  process_code: string;
  process_name: string;
  product_spec: string;
  category: string;
  unit_price: number;
  price_version_tag: string | null;
  unit: string;
  remarks: string;
  status: 'ACTIVE' | 'INACTIVE';
}

/** 工艺工价版本历史快照 */
export interface ProcessPriceVersion {
  id: number | null;
  process_id: number;
  version_tag: string;
  unit_price: number;
  scrap_rate_deduct: number;
  effective_date: string;
  created_at: string | null;
}

/** 车间计件作业流水记录 (单人或班组分摊产生的核心凭证) */
export interface WorkRecord {
  id: number | null;
  record_date: string;
  batch_no: string;
  station_id: number;
  station_code: string | null;
  station_name: string | null;
  workshop_name: string | null;
  emp_id: number;
  emp_code: string | null;
  emp_name: string | null;
  department: string | null;
  model_id?: number | null;
  model_name?: string | null;
  process_id: number;
  process_code: string | null;
  process_name: string | null;
  product_spec: string | null;
  category: string | null;
  quantity: number;
  scrap_quantity: number;
  unit_price: number;
  total_amount: number;
  settled: number; // 0: 待结算, 1: 已核算锁定
  settled_at: string | null;
  team_id: number | null;
  team_name: string | null;
  notes: string;
  created_at: string | null;
}

/** 个人记工录入参数 */
export interface NewRecordInput {
  record_date: string;
  batch_no: string;
  station_id: number;
  emp_id: number;
  process_id: number;
  model_id?: number | null;
  quantity: number;
  scrap_quantity: number;
  unit_price: number;
  notes: string;
}

/** 班组集体记工录入参数 (后端事务内按全班在职员工平分) */
export interface TeamBatchRecordInput {
  record_date: string;
  batch_no: string;
  team_id: number;
  station_id: number;
  process_id: number;
  model_id?: number | null;
  total_quantity: number;
  scrap_quantity: number;
  unit_price: number;
  notes: string;
}

/** 员工计件工资汇总表 */
export interface PayrollSummary {
  emp_id: number;
  emp_code: string;
  emp_name: string;
  department: string;
  primary_station_name: string | null;
  total_records: number;
  total_pieces: number;
  total_scrap: number;
  total_amount: number;
  settled_records: number;
  unsettled_records: number;
}

/** 车间站点工费汇总表 */
export interface StationSummary {
  station_id: number;
  station_code: string;
  station_name: string;
  workshop_name: string;
  total_records: number;
  total_pieces: number;
  total_scrap: number;
  total_amount: number;
}

/** 工艺工价统计分析 */
export interface ProcessStats {
  process_id: number;
  process_code: string;
  process_name: string;
  product_spec: string;
  category: string;
  total_records: number;
  total_pieces: number;
  total_amount: number;
  avg_scrap_rate: number;
}

/** 全厂系统级 KPI 实时看板指标 */
export interface SystemStats {
  today_records_count: number;
  today_pieces_count: number;
  today_wages_total: number;
  total_records_all_time: number;
  total_wages_all_time: number;
  total_stations_count: number;
  total_employees_count: number;
  total_processes_count: number;
}

/** 数据库物理备份元数据 */
export interface BackupInfo {
  filename: string;
  file_size_bytes: number;
  created_at: string;
}

/** 产品工位工艺流程路线 (MES Product Routing) */
export interface ProductProcessRoute {
  id?: number | null;
  model_id: number;
  model_code?: string | null;
  model_name?: string | null;
  step_no: number;
  station_id: number;
  station_code?: string | null;
  station_name?: string | null;
  workshop_id?: number | null;
  workshop_name?: string | null;
  process_id: number;
  process_code?: string | null;
  process_name?: string | null;
  unit_price?: number | null;
  unit?: string | null;
  notes: string;
  created_at?: string | null;
}

/** 保存产品工艺路线步骤输入项 */
export interface RouteStepInput {
  step_no: number;
  station_id: number;
  process_id: number;
  notes: string;
}

