use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Department {
    pub id: Option<i64>,
    pub dept_code: String, // 如 "DEP-01"
    pub dept_name: String, // 如 "生产制造部"
    pub sort_order: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Workshop {
    pub id: Option<i64>,
    pub department_id: Option<i64>,
    pub department_name: Option<String>,
    pub workshop_code: String, // "FRONT_END" | "BACK_END"
    pub workshop_name: String, // "前段复材成型工段" | "后段精修成装工段"
    pub description: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Station {
    pub id: Option<i64>,
    pub workshop_id: i64,
    pub department_id: Option<i64>,
    pub department_name: Option<String>,
    pub workshop_code: Option<String>,
    pub workshop_name: Option<String>,
    pub station_code: String, // 如 "ST-FE-02"
    pub station_name: String, // 如 "模具铺叠成型站"
    pub supervisor: String,   // 责任班长
    pub target_output_daily: i64, // 计划日产能 (件)
    pub sort_order: i64,
    pub status: String,       // "ACTIVE" | "INACTIVE"
    pub active_staff_count: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Team {
    pub id: Option<i64>,
    pub team_code: String, // 如 "TM-01"
    pub team_name: String, // 如 "碳纤铺叠一班"
    pub leader_name: String,
    pub remarks: String,
    pub sort_order: i64,
    pub member_count: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProductModel {
    pub id: Option<i64>,
    pub model_code: String, // 如 "CF-T800-01"
    pub model_name: String, // 如 "全碳素一体羽毛球拍框主体"
    pub hole_count: Option<i64>, // 孔数 (例如 72, 76)
    pub category: Option<String>,
    pub status: Option<String>,
    pub remarks: String,    // 规格参数/备注
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Employee {
    pub id: Option<i64>,
    pub emp_code: String,
    pub name: String,
    pub department: String,
    pub department_name: Option<String>,
    pub team_id: Option<i64>,
    pub team_name: Option<String>,
    pub primary_station_id: Option<i64>,
    pub primary_station_name: Option<String>,
    pub workshop_name: Option<String>,
    pub skill_level: String, // "初级工" | "中级技工" | "高级技师" | "复材工艺师"
    pub phone: String,
    pub status: String,      // "ACTIVE" | "INACTIVE"
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EmployeeStationAssignment {
    pub id: Option<i64>,
    pub emp_id: i64,
    pub emp_code: Option<String>,
    pub emp_name: Option<String>,
    pub station_id: i64,
    pub station_code: Option<String>,
    pub station_name: Option<String>,
    pub workshop_name: Option<String>,
    pub assignment_type: String, // "PRIMARY" (常驻) | "LOAN" (临时借调外援)
    pub effective_from: String,
    pub effective_to: Option<String>,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessItem {
    pub id: Option<i64>,
    pub workshop_id: i64,
    pub workshop_code: Option<String>,
    pub workshop_name: Option<String>,
    pub recommended_station_id: Option<i64>,
    pub station_code: Option<String>,
    pub station_name: Option<String>,
    pub process_code: String, // 如 "PRC-LAY-50D-01"
    pub process_name: String, // 如 "50mm高圈厚唇加强层手工铺叠"
    pub product_spec: String, // 如 "Wave 50 Disc" / "Road 38"
    pub category: String,     // 工段大类
    pub unit_price: f64,      // 当前有效计件单价
    pub price_version_tag: Option<String>, // 最新工价版本说明
    pub unit: String,         // 单位: 件/只/条
    pub remarks: String,
    pub status: String,       // "ACTIVE" | "INACTIVE"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessPriceVersion {
    pub id: Option<i64>,
    pub process_id: i64,
    pub version_tag: String,    // 如 "2026年Q4生产计件标准"
    pub unit_price: f64,
    pub scrap_rate_deduct: f64, // 废品扣除系数 (默认 1.0)
    pub effective_date: String, // 生效日期 YYYY-MM-DD
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkRecord {
    pub id: Option<i64>,
    pub record_date: String,
    pub batch_no: String,
    pub station_id: i64,
    pub station_code: Option<String>,
    pub station_name: Option<String>,
    pub workshop_name: Option<String>,
    pub emp_id: i64,
    pub emp_code: Option<String>,
    pub emp_name: Option<String>,
    pub department: Option<String>,
    pub model_id: Option<i64>,
    pub model_name: Option<String>,
    pub process_id: i64,
    pub process_code: Option<String>,
    pub process_name: Option<String>,
    pub product_spec: Option<String>,
    pub category: Option<String>,
    pub quantity: i64,
    pub scrap_quantity: i64,
    pub unit_price: f64, // 当时单价快照，永久锁定
    pub total_amount: f64,
    pub settled: i64,    // 0: 未结算, 1: 已结算锁定
    pub settled_at: Option<String>,
    pub team_id: Option<i64>,
    pub team_name: Option<String>,
    pub notes: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NewRecordInput {
    pub record_date: String,
    pub batch_no: String,
    pub station_id: i64,
    pub emp_id: i64,
    pub process_id: i64,
    pub model_id: Option<i64>,
    pub quantity: i64,
    pub scrap_quantity: i64,
    pub unit_price: f64,
    pub notes: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TeamBatchRecordInput {
    pub record_date: String,
    pub batch_no: String,
    pub team_id: i64,
    pub station_id: i64,
    pub process_id: i64,
    pub model_id: Option<i64>,
    pub total_quantity: i64,
    pub scrap_quantity: i64,
    pub unit_price: f64,
    pub notes: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PayrollSummary {
    pub emp_id: i64,
    pub emp_code: String,
    pub emp_name: String,
    pub department: String,
    pub primary_station_name: Option<String>,
    pub total_records: i64,
    pub total_pieces: i64,
    pub total_scrap: i64,
    pub total_amount: f64,
    pub settled_records: i64,
    pub unsettled_records: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StationSummary {
    pub station_id: i64,
    pub station_code: String,
    pub station_name: String,
    pub workshop_code: String,
    pub workshop_name: String,
    pub supervisor: String,
    pub total_pieces: i64,
    pub total_scrap: i64,
    pub total_amount: f64,
    pub record_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessStats {
    pub process_id: i64,
    pub process_code: String,
    pub process_name: String,
    pub product_spec: String,
    pub category: String,
    pub station_name: Option<String>,
    pub unit_price: f64,
    pub total_quantity: i64,
    pub total_scrap: i64,
    pub total_amount: f64,
    pub record_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemStats {
    pub total_workshops: i64,
    pub total_stations: i64,
    pub total_employees: i64,
    pub total_processes: i64,
    pub total_records: i64,
    pub total_wages: f64,
    pub today_records: i64,
    pub today_wages: f64,
    pub database_size_bytes: u64,
    pub db_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupInfo {
    pub filename: String,
    pub file_size_bytes: u64,
    pub created_at: String,
}

/// 产品工位工艺流程路线 (MES Product Routing)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProductProcessRoute {
    pub id: Option<i64>,
    pub model_id: i64,
    pub model_code: Option<String>,
    pub model_name: Option<String>,
    pub step_no: i64,
    pub station_id: i64,
    pub station_code: Option<String>,
    pub station_name: Option<String>,
    pub workshop_id: Option<i64>,
    pub workshop_name: Option<String>,
    pub process_id: i64,
    pub process_code: Option<String>,
    pub process_name: Option<String>,
    pub unit_price: Option<f64>,
    pub unit: Option<String>,
    pub notes: String,
    pub created_at: Option<String>,
}

/// 批量保存工艺路线步骤输入项
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RouteStepInput {
    pub step_no: i64,
    pub station_id: i64,
    pub process_id: i64,
    pub notes: String,
}

